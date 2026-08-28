import { defenceList, type CharacterData } from "../data/character";
import { checkTurnOverheat, clearOverheat, coolAtTurnStart } from "../actions/power-armor";
import {
  BURNING_DAMAGE,
  BURNING_EXTINGUISH_AP,
  FATIGUE_MAX,
  SHORT_CIRCUIT_DAMAGE_TYPE,
  shortCircuitFormula,
} from "../rules/constants";
import { applyDamage } from "./damage";
import { hitPointUpdates, restoreHitPoints } from "../actions/healing";

/**
 * Per-turn combat bookkeeping (pg 125-127, 133-135).
 *
 * Foundry fires `combatTurnChange(combat, prior, current)` on the first turn,
 * every turn, and each round wrap, handing over both the combatant whose turn
 * ended and the one whose turn begins — verified on 14.365. Everything here
 * hangs off that single hook.
 *
 * At the end of a turn: half of the unused Action Points carry over (Dazed
 * blocks that, pg 133), and a level of Fatigue falls off (pg 134).
 *
 * At the start of a turn: Action Points refill to the maximum plus whatever was
 * carried, Burning and Healing Powder tick, Bleeding costs hit points per level
 * — and a dying creature with any Bleeding automatically fails a death save
 * (pg 133) — and Short Circuit takes 1d12 electricity per level and clears
 * itself if that leaves the creature dying (pg 135).
 */

interface TurnPointer {
  combatantId?: string | null;
}

interface FoundryCombat {
  readonly combatants: FoundryCollection<{ readonly actor: FoundryActor | null }>;
}

/**
 * Only one client may write these updates, or every GM would apply them.
 *
 * Exported because the Short Circuit full-heal trigger (pg 135) needs the same
 * guard for the same reason, and a second copy of a rule about *who writes* is
 * the kind of duplication that goes wrong quietly.
 */
export function isPrimaryGM(): boolean {
  const primary = game.users?.activeGM;
  return primary ? primary.id === game.user.id : game.user.isGM;
}

function actorFor(combat: FoundryCombat, pointer: TurnPointer | null): FoundryActor | null {
  const id = pointer?.combatantId;
  if (!id) return null;
  return combat.combatants.get(id)?.actor ?? null;
}

/** End of turn: bank half the unused AP, and shed a level of Fatigue. */
async function endTurn(actor: FoundryActor): Promise<void> {
  const system = actor.system as CharacterData;
  const dazed = actor.statuses?.has("dazed") ?? false;
  const unused = Math.max(0, system.resources.ap.value);
  const updates: Record<string, unknown> = {
    // Dazed prevents recycling entirely (pg 133).
    "system.resources.ap.recycled": dazed ? 0 : Math.floor(unused / 2),
  };

  const fatigue = Math.min(system.conditions.fatigue, FATIGUE_MAX);
  if (fatigue > 0) updates["system.conditions.fatigue"] = fatigue - 1;

  await actor.update(updates);

  // Power Armor overheats above 15 AP spent in a turn (pg 58). Spending is
  // still done by hand (roadmap item 14), so this reads the pool rather than
  // counting deductions: whatever left the pool between the turn's start and
  // its end is what the turn spent.
  //
  // Clearing runs *before* the fresh check, and the order is load-bearing:
  // "it overheats until the end of your next turn" means a suit that overheated
  // at the end of turn N is still overheated through turn N+1 — charging a
  // second cooling cycle at that turn's start — and only clears when N+1 ends.
  // Checking first would clear the state in the same breath as setting it.
  await clearOverheat(actor);
  const spent = Math.max(0, system.resources.ap.turnStart - system.resources.ap.value);
  await checkTurnOverheat(actor, spent);
}

/** Start of turn: refill AP with the carry-over, then apply Bleeding. */
async function beginTurn(actor: FoundryActor): Promise<void> {
  const system = actor.system as CharacterData;
  const recycled = system.resources.ap.recycled;
  const opening = system.derived.apMax + recycled;
  const updates: Record<string, unknown> = {
    "system.resources.ap.value": opening,
    "system.resources.ap.recycled": 0,
    // Remembered so the end of the turn can tell what the turn spent.
    "system.resources.ap.turnStart": opening,
  };

  const notes: string[] = [];
  if (recycled > 0) {
    notes.push(game.i18n.localize("FALLOUT.Combat.recycled", { ap: recycled }));
  }

  // Burning: "a burning creature takes 1d10 fire damage at the start of their
  // turns" (pg 133). Fire damage, so it runs the ordinary pipeline rather than
  // subtracting from hit points directly — resistance and vulnerability to fire
  // are both real, and Power Armor's Prism shielding reads the type too.
  if (actor.statuses?.has("burning") === true) {
    const burn = new foundry.dice.Roll(BURNING_DAMAGE);
    await burn.evaluate();
    const result = await applyDamage(actor, burn.total, "fire");
    notes.push(
      game.i18n.localize("FALLOUT.Combat.burning", {
        damage: burn.total,
        hp: result.hpLost,
        ap: BURNING_EXTINGUISH_AP,
      }),
    );
  }

  // Healing Powder (pg 86): "at the start of each of their turns they heal a
  // number of hit points equal to half their healing rate (rounded down). After
  // healing for three rounds, the effects cease."
  //
  // Through `restoreHitPoints` like every other restoration, so the radiation
  // lock (pg 124) and the bleeding redirect (pg 133) both apply — a bleeding
  // character being healed by powder is exactly the case that gate exists for.
  // The round is spent whether or not the healing landed: the item's clock runs
  // on turns, not on hit points delivered.
  //
  // Half the healing rate is taken from the book rather than from the item,
  // because the actor banks only a round count — the item is long out of scope
  // by the time these turns come round. The shipped Healing Powder carries
  // `healRateMultiplier: 0.5`, so the two agree; a homebrew item that banked
  // rounds at some other multiple would still heal at half here.
  const healRounds = system.resources.healRounds;
  if (healRounds > 0) {
    const gain = restoreHitPoints(actor, system, Math.floor(system.derived.healingRate / 2));
    Object.assign(updates, hitPointUpdates(gain));
    updates["system.resources.healRounds"] = healRounds - 1;
    notes.push(
      game.i18n.localize("FALLOUT.Aid.healOverTimeTick", {
        hp: gain.restored,
        rounds: healRounds - 1,
      }),
      ...gain.notes,
    );
  }

  // Bleeding: half the Healing Rate in hit points, per level (pg 133).
  //
  // Reads the hit points Healing Powder may just have restored rather than the
  // value at the top of the turn — both land at the start of the turn and both
  // write the same field, so taking the stale number here would silently undo
  // the heal.
  const openingHp = (updates["system.resources.hp.value"] as number | undefined) ??
    system.resources.hp.value;
  const bleeding = system.conditions.bleeding;
  if (bleeding > 0) {
    const perLevel = Math.floor(system.derived.healingRate / 2);
    const damage = perLevel * bleeding;
    const hp = Math.max(0, openingHp - damage);
    updates["system.resources.hp.value"] = hp;
    notes.push(game.i18n.localize("FALLOUT.Combat.bleeding", { levels: bleeding, damage }));

    // A dying creature that is bleeding fails a death save outright (pg 133).
    if (openingHp === 0 || hp === 0) {
      const failures = Math.min(4, system.resources.deathSaves.failures + 1);
      updates["system.resources.deathSaves.failures"] = failures;
      notes.push(game.i18n.localize("FALLOUT.Combat.bleedingDeathSave", { failures }));
    }
  }

  // Short Circuit (pg 135) — Bleeding's twin, and for a long time the only
  // condition v2.1 added that was half-built: the −1 max AP per level landed in
  // the AP derivation and nothing else in the entry existed, so it was a counter
  // with no clock. The four rulings it needs are at `SHORT_CIRCUIT_DIE`.
  //
  // Reads the running hit-point total for the same reason Bleeding does: powder,
  // bleeding and this all land at the start of the same turn and all write the
  // same field.
  const shortCircuit = system.conditions.shortCircuit;
  if (shortCircuit > 0) {
    const roll = new foundry.dice.Roll(shortCircuitFormula(shortCircuit));
    await roll.evaluate();
    // Typed, so a resistance halves and a vulnerability doubles — a Robobrain's
    // NeuroTransmitters (pg 11) is an electricity vulnerability, which makes the
    // body plan most likely to short out the one that takes double for it. The
    // adjustment is done here rather than through `applyDamage` because that is
    // the *attack* pipeline: it would spend temporary hit points, bite into
    // Power Armor's Defense Points and decay the suit, none of which is what a
    // fault ticking inside the chassis does.
    const [incoming] = defenceList(SHORT_CIRCUIT_DAMAGE_TYPE);
    let damage = roll.total;
    if (incoming !== undefined) {
      if (system.derived.resistances.includes(incoming)) damage = Math.floor(damage / 2);
      if (system.derived.vulnerabilities.includes(incoming)) damage *= 2;
    }
    const before = (updates["system.resources.hp.value"] as number | undefined) ??
      system.resources.hp.value;
    const after = Math.max(0, before - damage);
    updates["system.resources.hp.value"] = after;
    notes.push(
      game.i18n.localize("FALLOUT.Combat.shortCircuit", {
        levels: shortCircuit,
        damage,
        formula: roll.formula,
      }),
    );

    // "You remove all levels of short circuit if you start dying" — checked
    // after the tick, because a tick that drops the creature to 0 is exactly the
    // case the sentence describes.
    if (after === 0) {
      updates["system.conditions.shortCircuit"] = 0;
      notes.push(game.i18n.localize("FALLOUT.Combat.shortCircuitDying"));
    }
  }

  await actor.update(updates);
  if (notes.length > 0) {
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: notes.join("<br />"),
    });
  }

  // A suit still overheated at the start of a turn pays for cooling again
  // (pg 58), which is the second of the two charges one overheat costs.
  await coolAtTurnStart(actor);
}

export function registerCombatHooks(): void {
  Hooks.on("combatTurnChange", (...args: unknown[]) => {
    if (!isPrimaryGM()) return;
    const [combat, prior, current] = args as [FoundryCombat, TurnPointer | null, TurnPointer | null];
    void (async () => {
      const ending = actorFor(combat, prior);
      if (ending) await endTurn(ending);
      const beginning = actorFor(combat, current);
      if (beginning) await beginTurn(beginning);
    })();
  });
}

/**
 * Spend Action Points, **refusing** to go below zero. Returns false if
 * unaffordable.
 *
 * This is full E1's function and still has no callers. Actions spend through
 * `combat/action-points.ts` instead, which charges the pool and lets the action
 * happen regardless — the half-step the project chose. Call this one only if
 * that decision is reversed out loud, and expect every action in the system to
 * start failing closed on the pool the moment you do.
 */
export async function spendActionPoints(actor: FoundryActor, cost: number): Promise<boolean> {
  const system = actor.system as CharacterData;
  if (cost <= 0) return true;
  if (system.resources.ap.value < cost) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Combat.notEnoughAP", {
        cost,
        ap: system.resources.ap.value,
      }),
    );
    return false;
  }
  await actor.update({ "system.resources.ap.value": system.resources.ap.value - cost });
  return true;
}
