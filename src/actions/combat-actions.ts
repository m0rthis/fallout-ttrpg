/**
 * The four v2.1 combat actions that never got built: Grapple, Escape, Help,
 * Ready — plus the unarmed strike, which is what finally gives
 * `UNARMED_STRIKE_AP_COST` something to mean (pg 126-127).
 *
 * The rules arithmetic is in `src/rules/grapple.ts` and is pure. This file is
 * the half that rolls dice, writes effects and talks to chat.
 *
 * ## Why none of this is a hook
 *
 * Grappled and Restrained are exactly the states that tempt a document hook —
 * "when the grappler dies, release the grapple", "when the target moves, check
 * the grapple". `src/actions/situations.ts` explains at length why this system
 * does not do that: a hook that writes documents in response to document
 * writes is the shape that produced this project's one production bug. So
 * every state here is either
 *
 * - a **trigger-expiring effect** — a duration-less Active Effect that its own
 *   trigger deletes, the pattern `src/actions/blocking.ts` established (Help's
 *   grant, and the Ready marker); or
 * - a **control a person presses** (the Grappled status, which Escape clears
 *   and a GM can clear by hand).
 *
 * Nothing watches anything.
 *
 * ## AP
 *
 * Tracked, never enforced — the half-step the project took over full E1. These
 * actions call `noteActionPoints()`, which spends what the pool has and lets
 * the action happen regardless; they still do **not** call
 * `spendActionPoints()`, which refuses, so a misclick cannot strand a character
 * mid-action. Out of combat nothing is deducted at all, because nothing refills
 * it there. Ready's *refund* is unchanged and was never a deduction: the book
 * hands AP back, so `lapseReady` banks it.
 */

import type { CharacterData } from "../data/character";
import { noteActionPoints } from "../combat/action-points";
import { endBlocking } from "./blocking";
import {
  ESCAPE_AP_COST,
  GRAPPLE_AP_COST,
  HELP_AP_COST,
  READY_AP_SURCHARGE,
  type SkillKey,
} from "../rules/constants";
import { MINIMUM_DAMAGE } from "../rules/diseases";
import {
  addChange,
  advantageChange,
  bonusPath,
  checkScope,
  type RollScope,
  skillScope,
  SYSTEM_ID,
} from "../rules/effects";
import {
  helpBonus,
  readyRecycledAP,
  readyTotalApCost,
  unarmedContestDC,
  unarmedContestSucceeds,
  unarmedStrikeAbility,
  unarmedStrikeApCost,
  UNARMED_STRIKE_DAMAGE_TYPE,
  UNARMED_STRIKE_DIE,
} from "../rules/grapple";
import {
  d20Formula,
  d20Modifiers,
  effectiveMode,
  keptD20,
  type RollMode,
} from "../dice/core";

// ---------------------------------------------------------------- roll plumbing
//
// The advantage convention, the modifier formatting and the kept-die read all
// live in `src/dice/rolls.ts` and are imported rather than restated. They were
// module-private when this file was written, so it carried its own copy; two
// copies of the advantage convention is one too many, and the second one would
// have drifted the first time a scope was added.

function signed(value: number): string {
  return value >= 0 ? `+${String(value)}` : String(value);
}

function modeSuffix(mode: RollMode): string {
  if (mode === "normal") return "";
  return ` (${game.i18n.localize(`FALLOUT.Roll.${mode}`)})`;
}

function speaker(actor: FoundryActor): ChatSpeakerData {
  return foundry.documents.ChatMessage.getSpeaker({ actor });
}

async function say(actor: FoundryActor, content: string): Promise<void> {
  await foundry.documents.ChatMessage.create({ speaker: speaker(actor), content });
}

// ------------------------------------------------------------- grapple / escape

export interface UnarmedContestReport {
  dc: number;
  /** The kept die's raw face, before modifiers. */
  raw: number;
  total: number;
  succeeded: boolean;
  /** Whether a raw 20 carried it regardless of the DC (pg 126). */
  automatic: boolean;
  mode: RollMode;
  ap: number;
}

/**
 * The Unarmed skill bonus this system will use as the *other* side of a
 * contest. Both PCs and NPC statblocks run on `CharacterData`, so one reader
 * serves both.
 */
export function unarmedBonusOf(actor: FoundryActor): number {
  return (actor.system as CharacterData).derived.skillBonuses.unarmed;
}

/** Roll one side of the pg 126 contest. Shared by Grapple and Escape. */
async function rollUnarmedContest(
  system: CharacterData,
  dc: number,
  scopes: readonly RollScope[],
  requested: RollMode,
): Promise<{ report: Omit<UnarmedContestReport, "ap">; roll: foundry.dice.Roll }> {
  const mode = effectiveMode(system, scopes, requested);
  const roll = new foundry.dice.Roll(
    [
      d20Formula(mode),
      signed(system.derived.skillBonuses.unarmed),
      ...d20Modifiers(system),
    ].join(" "),
  );
  await roll.evaluate();
  const raw = keptD20(roll);
  const total = roll.total;
  return {
    roll,
    report: {
      dc,
      raw,
      total,
      succeeded: unarmedContestSucceeds(total, dc, raw),
      automatic: raw === 20 && total < dc,
      mode,
    },
  };
}

export interface GrappleOptions {
  /**
   * Override the DC. Needed whenever the thing being grappled has no Unarmed
   * skill to read — the book's own examples are the bear trap (pg 80) and the
   * "restrain or chokehold" half of Escape, neither of which is a creature.
   */
  dc?: number;
  mode?: RollMode;
}

/**
 * **Grapple** (3 AP, pg 126). An Unarmed skill check against
 * `10 + the target's Unarmed skill`; success — or a raw 20 — grapples them.
 *
 * On a success the target gains the `grappled` status, and a flag recording
 * who did it so their Escape knows what DC to roll against. Grappled is the
 * whole of pg 134: *"A grappled creature cannot spend AP to move."* This system
 * does not price movement in AP (movement cost is a Foundry-integration job,
 * roadmap section A item 3), so the status is the enforcement — the same
 * standing every other book condition has here.
 *
 * Three silences worth naming, none of them invented around:
 *
 * - **Nothing ends a grapple except Escape.** The book never says the grapple
 *   breaks when the grappler moves, is knocked out, or dies. So nothing here
 *   does either; the status is cleared by an Escape or by a person clicking it
 *   off.
 * - **No size limit.** Shove one line below has one ("no more than one size
 *   larger than you") and Clasp on pg 61 has one; Grapple has none printed.
 * - **The grappler is not required to be unarmed**, or to have a free hand.
 *   "You use your appendages" is the whole requirement.
 */
export async function grapple(
  actor: FoundryActor,
  system: CharacterData,
  target: FoundryActor,
  options: GrappleOptions = {},
): Promise<UnarmedContestReport> {
  const dc = options.dc ?? unarmedContestDC(unarmedBonusOf(target));
  // Grappling is an Unarmed skill check, so it answers to the skill's governing
  // ability and to anything scoped at Unarmed — but not to `attack`: the book
  // is careful that this is a check and not an attack roll.
  const { roll, report } = await rollUnarmedContest(
    system,
    dc,
    [system.derived.skillAbilities.unarmed, skillScope("unarmed")],
    options.mode ?? "normal",
  );

  const apNote = await noteActionPoints(actor, GRAPPLE_AP_COST);
  await roll.toMessage({
    speaker: speaker(actor),
    flavor: `${game.i18n.localize("FALLOUT.Grapple.flavor", {
      target: target.name,
      dc,
      ap: GRAPPLE_AP_COST,
    })}${modeSuffix(report.mode)} — ${game.i18n.localize(
      report.succeeded ? "FALLOUT.Grapple.succeeded" : "FALLOUT.Grapple.failed",
      { target: target.name },
    )}${report.automatic ? ` ${game.i18n.localize("FALLOUT.Grapple.natural20")}` : ""}${
      apNote === null ? "" : ` ${apNote.line}`
    }`,
  });

  if (report.succeeded) {
    await target.toggleStatusEffect("grappled", { active: true });
    // Remembered so the target's Escape can price itself without the grappler
    // being selected. A plain flag, written once by a button press.
    await target.setFlag(SYSTEM_ID, "grappledBy", {
      name: actor.name,
      uuid: actor.uuid,
      unarmed: unarmedBonusOf(actor),
    });
  }
  return { ...report, ap: GRAPPLE_AP_COST };
}

interface GrapplerRecord {
  name: string;
  unarmed: number;
}

function isGrapplerRecord(value: unknown): value is GrapplerRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === "string" && typeof record.unarmed === "number";
}

/** Who is holding this creature, if a Grapple recorded it. */
export function grappledBy(actor: FoundryActor): GrapplerRecord | null {
  const flag = actor.getFlag(SYSTEM_ID, "grappledBy");
  return isGrapplerRecord(flag) ? flag : null;
}

/**
 * The token statuses a successful Escape ends.
 *
 * Pg 126 frees you from "a grapple, restrain, or chokehold". Two of those three
 * are conditions this system registers (`src/fallout.ts`), so both come off:
 *
 * - **Grappled** (pg 134) — set by `grapple` above.
 * - **Restrained** (pg 135) — *"A restrained creature cannot move. When a
 *   restrained creature takes damage it cannot be subtracted from their stamina
 *   points."* Nothing in this system sets it; it is a status a GM applies for a
 *   bear trap (pg 80), a rope (pg 81) or a creature's own attack, and until now
 *   Escape left it on.
 *
 * **Chokehold is not a condition anywhere in 136 pages.** It appears in this
 * one sentence and is defined nowhere, has no entry in the pg 133-135 condition
 * list, and no creature, weapon or trap in the book applies one. So there is no
 * third status to clear and none is invented — the gap is named here rather
 * than papered over with a status id the book never defines.
 */
export const ESCAPABLE_STATUSES: readonly string[] = ["grappled", "restrained"];

export interface EscapeOptions {
  /**
   * Override the DC. Required for a restraint or a chokehold with no creature
   * behind it: pg 126 prices Escape off "the creature's Unarmed skill", and a
   * bear trap (pg 80) or a rope (pg 81) has none. The book's own answer there
   * is a bespoke DC — pg 80 prints "a Strength ability check equal to 15" for
   * prying a trap open — so this asks the GM for one rather than inventing a
   * general rule for objects.
   */
  dc?: number;
  /**
   * Clasp (pg 61): a weapon with this property grapples on a hit and gives
   * "any Strength or Agility ability checks made to escape this grapple"
   * disadvantage. That sentence is v2.0 vocabulary — pg 126 made Escape an
   * *Unarmed skill* check this edition, and pg 61 was not updated to match.
   * Read as disadvantage on the Escape check whatever it rolls, which is the
   * only reading under which Clasp still does anything.
   */
  clasp?: boolean;
  mode?: RollMode;
}

export interface EscapeReport extends UnarmedContestReport {
  /** Status ids the escape actually took off — see `ESCAPABLE_STATUSES`. */
  cleared: string[];
}

/**
 * **Escape** (5 AP, pg 126) — renamed this edition from "Escape a Grapple",
 * and now covering "a grapple, restrain, or chokehold". An Unarmed skill check
 * against `10 + the creature's Unarmed skill`; success, or a raw 20, frees you.
 *
 * This is the roll `check:resistGrapple` was added for and never consulted by
 * anything (`src/rules/effects.ts`). Two perks aim straight at it — Stonewall
 * (pg 36) and Don't Fence Me In (pg 36) — and both still describe the roll in
 * v2.0's language ("a Strength or Ability check to resist being grappled"),
 * because the perks chapter was not re-cut when pg 126 changed the check. A
 * *named check* scope is immune to that drift, which is why it is the right
 * hook: it grants on the Escape action, whatever ability the action rolls.
 *
 * Don't Fence Me In also drops Escape to 3 AP. That is an AP cost, and AP is
 * reported rather than charged here, so `ap` in the report is the printed 5
 * unless the caller overrides the cost — the perk is a table-side adjustment.
 *
 * A success clears every status in `ESCAPABLE_STATUSES`, which is where the
 * "restrain" half of the sentence is honoured; `cleared` on the report says
 * which ones were actually on.
 */
export async function escapeGrapple(
  actor: FoundryActor,
  system: CharacterData,
  options: EscapeOptions = {},
): Promise<EscapeReport | null> {
  const held = ESCAPABLE_STATUSES.filter(
    (status) => actor.statuses?.has(status) === true,
  );
  const captor = grappledBy(actor);
  const dc = options.dc ?? (captor === null ? null : unarmedContestDC(captor.unarmed));
  if (dc === null) {
    // Nothing recorded a grappler and the caller named no DC. The formula has
    // no input, and guessing one would be inventing a rule.
    ui.notifications.warn(game.i18n.localize("FALLOUT.Escape.noDC"));
    return null;
  }

  const requested = options.clasp === true ? "disadvantage" : (options.mode ?? "normal");
  const { roll, report } = await rollUnarmedContest(
    system,
    dc,
    [
      system.derived.skillAbilities.unarmed,
      skillScope("unarmed"),
      checkScope("resistGrapple"),
    ],
    requested,
  );

  const claspNote =
    options.clasp === true ? ` ${game.i18n.localize("FALLOUT.Escape.clasp")}` : "";
  const apNote = await noteActionPoints(actor, ESCAPE_AP_COST);
  await roll.toMessage({
    speaker: speaker(actor),
    flavor: `${game.i18n.localize("FALLOUT.Escape.flavor", {
      captor: captor?.name ?? game.i18n.localize("FALLOUT.Escape.restraint"),
      dc,
      ap: ESCAPE_AP_COST,
    })}${modeSuffix(report.mode)}${claspNote} — ${game.i18n.localize(
      report.succeeded ? "FALLOUT.Escape.succeeded" : "FALLOUT.Escape.failed",
    )}${report.automatic ? ` ${game.i18n.localize("FALLOUT.Grapple.natural20")}` : ""}${
      apNote === null ? "" : ` ${apNote.line}`
    }`,
  });

  const cleared: string[] = [];
  if (report.succeeded) {
    // "a grapple, restrain, or chokehold" (pg 126) — every registered status
    // the sentence covers, not just the one Grapple sets. Only the ones the
    // creature actually had are toggled, so the card can say what came off and
    // an escape from a bear trap does not claim to have broken a grapple.
    for (const status of held) {
      await actor.toggleStatusEffect(status, { active: false });
      cleared.push(status);
    }
    await actor.unsetFlag(SYSTEM_ID, "grappledBy");
    await say(
      actor,
      cleared.length === 0
        ? game.i18n.localize("FALLOUT.Escape.nothingHeld")
        : game.i18n.localize("FALLOUT.Escape.cleared", {
            statuses: cleared
              .map((status) => game.i18n.localize(`FALLOUT.Statuses.${status}`))
              .join(", "),
          }),
    );
  }
  return { ...report, ap: ESCAPE_AP_COST, cleared };
}

// -------------------------------------------------------------------- unarmed

export interface UnarmedStrikeOptions {
  /** 1 (3 AP) or 2 (5 AP) — the only bundles pg 127 prices. */
  strikes?: number;
  /** Holey Moley (pg 52): one more strike for 1 AP, once per turn. */
  extraStrike?: boolean;
  /** Override the "Strength **or** Agility" damage modifier (pg 127). */
  ability?: "strength" | "agility";
  mode?: RollMode;
}

export interface UnarmedStrikeReport {
  strikes: number;
  ap: number;
  ability: "strength" | "agility";
  /** One entry per strike: the kept raw d20 and the attack total. */
  attacks: { raw: number; total: number; damage: number }[];
}

/**
 * **Unarmed Strike** (pg 126-127). *"It costs 3 AP to make an unarmed strike.
 * Alternatively, you can make two unarmed strikes by spending 5 AP. Unarmed
 * strikes deal 1d4 + your Strength or Agility modifier in bludgeoning damage."*
 *
 * The 5-AP double strike is the v2.1 addition, and the reason
 * `UNARMED_STRIKE_AP_COST` sat imported by nothing until now.
 *
 * Two things the book does not give an unarmed strike, and does not
 * substitute for:
 *
 * - **A critical hit chance.** Every crit in this chapter is read off "the
 *   weapon's table" (pg 127) and bare hands are not in it. There is no house
 *   default to fall back on, so a raw 20 is announced as the top of the die and
 *   the table decides whether it crits; nothing here multiplies damage.
 * - **A critical failure.** pg 128's nat-1 rule is *"you automatically miss and
 *   the weapon you attacked with gains one level of decay"* — the miss applies,
 *   the decay has nothing to land on.
 *
 * Each strike rolls its own attack and its own damage, because the book says
 * "two unarmed strikes" and says so explicitly when it means one shared roll.
 */
export async function unarmedStrike(
  actor: FoundryActor,
  system: CharacterData,
  options: UnarmedStrikeOptions = {},
): Promise<UnarmedStrikeReport | null> {
  const strikes = options.strikes ?? 1;
  const extraStrike = options.extraStrike ?? false;
  const ap = unarmedStrikeApCost(strikes, extraStrike);
  if (ap === null) {
    // Three strikes only has a price with Holey Moley, and four has none at all.
    ui.notifications.warn(game.i18n.localize("FALLOUT.Unarmed.unpriced", { strikes }));
    return null;
  }

  const ability =
    options.ability ??
    unarmedStrikeAbility(system.derived.abilityMods.strength, system.derived.abilityMods.agility);
  const requested = options.mode ?? "normal";
  const scopes: RollScope[] = [
    system.derived.skillAbilities.unarmed,
    skillScope("unarmed"),
    // Unlike Grapple, this one *is* an attack roll.
    "attack",
  ];

  // Charged once for the bundle, not once per strike: the pg 127 price is for
  // the action, and two strikes cost 5 AP rather than 3 twice.
  const apNote = await noteActionPoints(actor, ap);
  await say(
    actor,
    game.i18n.localize("FALLOUT.Unarmed.header", {
      strikes,
      ap,
      extra: extraStrike ? game.i18n.localize("FALLOUT.Unarmed.holeyMoley") : "",
    }) + (apNote === null ? "" : ` ${apNote.line}`),
  );

  const attacks: UnarmedStrikeReport["attacks"] = [];
  const damageMod = system.derived.abilityMods[ability] + system.derived.damageBonus;

  // The pg 129 limb conditions' flat modifier reaches every attack roll, and
  // this is one — the scopes above say so three lines up. It rides `attackBonus`
  // rather than `d20Bonus` precisely so it can be here and *not* on the Grapple
  // contest a hundred lines above, which is not an attack roll.
  const attackMod = system.derived.attackBonus;

  for (let strike = 1; strike <= strikes; strike += 1) {
    const mode = effectiveMode(system, scopes, requested);
    const attack = new foundry.dice.Roll(
      [
        d20Formula(mode),
        signed(system.derived.skillBonuses.unarmed),
        ...d20Modifiers(system),
        ...(attackMod === 0 ? [] : [signed(attackMod)]),
      ].join(" "),
    );
    await attack.evaluate();
    const raw = keptD20(attack);
    await attack.toMessage({
      speaker: speaker(actor),
      flavor: `${game.i18n.localize("FALLOUT.Unarmed.attack", {
        strike,
        strikes,
      })}${modeSuffix(mode)}${
        raw === 1 ? ` — ${game.i18n.localize("FALLOUT.Unarmed.miss")}` : ""
      }${raw === 20 ? ` — ${game.i18n.localize("FALLOUT.Unarmed.natural20")}` : ""}`,
    });

    // A natural 1 misses outright (pg 128), so it rolls no damage.
    if (raw === 1) {
      attacks.push({ raw, total: attack.total, damage: 0 });
      continue;
    }

    const damage = new foundry.dice.Roll(
      damageMod === 0 ? UNARMED_STRIKE_DIE : `${UNARMED_STRIKE_DIE} ${signed(damageMod)}`,
    );
    await damage.evaluate();
    const applied = Math.max(MINIMUM_DAMAGE, damage.total);
    await damage.toMessage({
      speaker: speaker(actor),
      flavor: game.i18n.localize("FALLOUT.Unarmed.damage", {
        ability: game.i18n.localize(`FALLOUT.Abilities.${ability}`),
      }),
      // `melee: true` picks the damage threshold a Block raised, exactly as a
      // melee weapon's damage does — and it is also what puts a bare-handed
      // strike in reach of a defender's Reactive Plates (pg 59), which is why
      // the striker's id rides along.
      flags: {
        "fallout-ttrpg": {
          damage: {
            total: applied,
            type: UNARMED_STRIKE_DAMAGE_TYPE,
            melee: true,
            attacker: actor.id,
          },
        },
      },
    });
    attacks.push({ raw, total: attack.total, damage: applied });
  }

  // "Your block lasts until you attack again" (pg 127). Punching is attacking.
  await endBlocking(actor);
  return { strikes, ap, ability, attacks };
}

// ----------------------------------------------------------------------- help

export type HelpMode = "check" | "attack";

interface HelpRecord {
  mode: HelpMode;
  bonus: number;
  helper: string;
}

function isHelpRecord(value: unknown): value is HelpRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.mode === "check" || record.mode === "attack") &&
    typeof record.bonus === "number" &&
    typeof record.helper === "string"
  );
}

function helpOn(actor: FoundryActor): { id: string; record: HelpRecord }[] {
  const out: { id: string; record: HelpRecord }[] = [];
  for (const effect of actor.effects) {
    const flag = effect.getFlag(SYSTEM_ID, "help");
    if (isHelpRecord(flag)) out.push({ id: effect.id, record: flag });
  }
  return out;
}

/** Whether this creature is currently carrying somebody's Help. */
export function pendingHelp(actor: FoundryActor): HelpRecord[] {
  return helpOn(actor).map((entry) => entry.record);
}

/**
 * **Help** (6 AP, pg 127) — the action v2.1 rewrote most thoroughly. Two
 * branches, and only the first one changed:
 *
 * > When you use your AP to Help, the creature you aid gains a bonus to their
 * > next ability check equal to half your bonus (rounded down) in the related
 * > skill.
 * >
 * > Alternatively, you can aid a friendly creature in attacking a creature
 * > within 5 feet of you. […] If your ally attacks the target before your next
 * > turn, the first attack roll is made with advantage.
 *
 * v2.0's first branch granted flat advantage; v2.1 makes it a number. The patch
 * notes describe that number as half the helper's *ability modifier* — the
 * printed book says half their **bonus in the related skill**, which is bigger
 * and is what this uses. The book beats the patch notes.
 *
 * Both branches land as a duration-less Active Effect on the *aided* creature,
 * cleared by `consumeHelp`. That is deliberate:
 *
 * - The check branch says "their **next** ability check" — a trigger, not a
 *   clock, so it is `blocking.ts`'s pattern exactly.
 * - The attack branch says "the **first** attack roll … before your next turn".
 *   Its trigger is the ally's first attack; its deadline is the *helper's* next
 *   turn, which is a duration Foundry cannot express about a different
 *   creature. So the trigger is automated and the deadline is printed on the
 *   card for the table to honour.
 *
 * The check branch writes `system.bonuses.d20`, which reaches every d20 rather
 * than only the "ability check" the sentence names. Nothing narrower exists,
 * and since the effect is consumed by the very next roll the two readings only
 * diverge if the aided creature rolls something unrelated first — a live
 * mis-scope, and the reason `consumeHelp` reports what it spent.
 */
export async function helpAlly(
  helper: FoundryActor,
  helperSystem: CharacterData,
  ally: FoundryActor,
  options: { mode?: HelpMode; skill?: SkillKey } = {},
): Promise<HelpRecord | null> {
  const mode = options.mode ?? "check";
  if (mode === "check" && options.skill === undefined) {
    // "half your bonus in the *related skill*" — the book requires a skill to
    // be named, so there is no sensible default.
    ui.notifications.warn(game.i18n.localize("FALLOUT.Help.needsSkill"));
    return null;
  }

  const skill = options.skill;
  const bonus =
    mode === "check" && skill !== undefined ? helpBonus(helperSystem.derived.skillBonuses[skill]) : 0;
  const record: HelpRecord = { mode, bonus, helper: helper.name };

  await ally.createEmbeddedDocuments("ActiveEffect", [
    {
      name: game.i18n.localize("FALLOUT.Help.effect", { helper: helper.name }),
      img: "icons/svg/upgrade.svg",
      type: "base",
      description: game.i18n.localize(
        mode === "check" ? "FALLOUT.Help.descriptionCheck" : "FALLOUT.Help.descriptionAttack",
        { bonus, helper: helper.name },
      ),
      // No duration: this ends when the aided creature rolls, which is a
      // trigger Foundry's clock cannot express.
      system: {
        changes:
          mode === "check"
            ? [addChange(bonusPath("d20"), bonus)]
            : [advantageChange("attack")],
      },
      flags: { [SYSTEM_ID]: { help: record } },
    },
  ]);

  const apNote = await noteActionPoints(helper, HELP_AP_COST);
  await say(
    helper,
    game.i18n.localize(mode === "check" ? "FALLOUT.Help.gaveCheck" : "FALLOUT.Help.gaveAttack", {
      ally: ally.name,
      ap: HELP_AP_COST,
      bonus,
      skill:
        skill === undefined ? "" : game.i18n.localize(`FALLOUT.Skills.${skill}`),
    }) + (apNote === null ? "" : ` ${apNote.line}`),
  );
  return record;
}

/**
 * Spend the Help — the trigger that ends it.
 *
 * Wire this into the roll paths in `src/dice/rolls.ts` the way `endBlocking` is
 * already wired into `rollAttack`, and it becomes automatic; until then it is a
 * button, which is the other pattern this project allows.
 *
 * @returns how many Helps were spent, so callers can stay quiet at zero.
 */
export async function consumeHelp(actor: FoundryActor, announce = true): Promise<number> {
  const entries = helpOn(actor);
  if (entries.length === 0) return 0;
  await actor.deleteEmbeddedDocuments(
    "ActiveEffect",
    entries.map((entry) => entry.id),
  );
  if (announce) {
    for (const entry of entries) {
      await say(
        actor,
        game.i18n.localize(
          entry.record.mode === "check" ? "FALLOUT.Help.spentCheck" : "FALLOUT.Help.spentAttack",
          { helper: entry.record.helper, bonus: entry.record.bonus },
        ),
      );
    }
  }
  return entries.length;
}

// ---------------------------------------------------------------------- ready

interface ReadyRecord {
  trigger: string;
  /** The full cost: the readied action's own AP plus the 2 AP surcharge. */
  ap: number;
}

function isReadyRecord(value: unknown): value is ReadyRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.trigger === "string" && typeof record.ap === "number";
}

function readyOn(actor: FoundryActor): { id: string; record: ReadyRecord }[] {
  const out: { id: string; record: ReadyRecord }[] = [];
  for (const effect of actor.effects) {
    const flag = effect.getFlag(SYSTEM_ID, "ready");
    if (isReadyRecord(flag)) out.push({ id: effect.id, record: flag });
  }
  return out;
}

/**
 * The actions this creature has readied, each carrying the id of the effect
 * holding it — which is what lets a sheet row resolve *that* row rather than
 * every readied action at once.
 */
export function readiedActions(actor: FoundryActor): (ReadyRecord & { id: string })[] {
  return readyOn(actor).map((entry) => ({ ...entry.record, id: entry.id }));
}

/**
 * **Ready** (+2 AP, pg 126):
 *
 * > You prepare an action with a trigger. You must specify what the trigger is
 * > and spend the necessary AP with an additional 2 AP. When the trigger
 * > occurs, you may perform the action. If the trigger never occurs, you do not
 * > perform the action and instead you may recycle half the total amount of AP
 * > used at the start of your next turn.
 *
 * The recycle is new: v2.0 said flatly *"nor do you regain the AP if the
 * trigger never occurs."*
 *
 * A readied action is a duration-less marker effect with no changes — it does
 * nothing mechanically, it records what is pending and what it cost, so that
 * `triggerReady` and `lapseReady` can tell the two endings apart. The book's
 * window ("before your next turn") is a deadline about *this* creature's turn
 * and could in principle be a duration, but making it one would have Foundry
 * silently expire the effect and eat the refund the rule promises. A pending
 * Ready should outlive its window loudly, not vanish.
 *
 * `frozen` prints the pg 134 Frightened-Freeze permission on the card:
 * *"A creature with this condition cannot spend any AP on their turn, **except
 * to ready**, while the source of their fear is within sight."* That is the
 * whole of what Freeze gets from this work — see the note on `lapseReady`.
 */
export async function readyAction(
  actor: FoundryActor,
  trigger: string,
  readiedActionApCost: number,
  frozen = false,
): Promise<ReadyRecord> {
  const ap = readyTotalApCost(readiedActionApCost);
  const record: ReadyRecord = { trigger, ap };

  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: game.i18n.localize("FALLOUT.Ready.effect"),
      img: "icons/svg/clockwork.svg",
      type: "base",
      description: game.i18n.localize("FALLOUT.Ready.description", { trigger, ap }),
      // No changes and no duration: a marker, not a modifier.
      system: { changes: [] },
      flags: { [SYSTEM_ID]: { ready: record } },
    },
  ]);

  const freezeNote = frozen ? ` ${game.i18n.localize("FALLOUT.Ready.freeze")}` : "";
  await say(
    actor,
    `${game.i18n.localize("FALLOUT.Ready.readied", {
      trigger,
      ap,
      surcharge: READY_AP_SURCHARGE,
      recycle: readyRecycledAP(ap),
    })}${freezeNote}`,
  );
  return record;
}

/**
 * The trigger fired: clear the marker, and refund nothing.
 *
 * `effectId` resolves one readied action instead of every one the creature is
 * holding. A creature can ready more than once, and the sheet lists them
 * individually, so a control on one row has to be able to mean that row.
 * Omitting it keeps the original behaviour of resolving them all.
 */
export async function triggerReady(
  actor: FoundryActor,
  effectId?: string,
): Promise<number> {
  const entries = readyOn(actor).filter(
    (entry) => effectId === undefined || entry.id === effectId,
  );
  if (entries.length === 0) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Ready.nothingReadied"));
    return 0;
  }
  await actor.deleteEmbeddedDocuments(
    "ActiveEffect",
    entries.map((entry) => entry.id),
  );
  for (const entry of entries) {
    await say(actor, game.i18n.localize("FALLOUT.Ready.fired", { trigger: entry.record.trigger }));
  }
  return entries.length;
}

/**
 * The trigger never fired: clear the marker and bank half the AP.
 *
 * Three rulings live in this function.
 *
 * - **"Half the total amount of AP used" is the whole Ready cost** — the
 *   readied action plus the 2 AP surcharge — floored, per `readyRecycledAP`.
 *   Note this makes *when* you lapse matter when several are readied at once:
 *   two 7 AP Readies lapsed together floor once (14 -> 7), and lapsed one at a
 *   time floor twice (3 + 3 = 6). The book never contemplates holding two, so
 *   neither reading is printed; both are offered rather than one being forced,
 *   and `effectId` is what chooses.
 * - **It rides the existing recycle pool.** The rule pays out "at the start of
 *   your next turn", which is exactly when `src/combat/turns.ts` hands back
 *   `system.resources.ap.recycled`. So this *adds* to that pool rather than
 *   setting it: the end-of-turn hook writes the ordinary leftover-AP recycle
 *   into the same field, and press this before your turn ends and the hook will
 *   overwrite it. Declaring a lapsed Ready once your turn has ended — which is
 *   also the only moment you can honestly know the trigger never came — banks
 *   both.
 * - **Dazed blocks it.** pg 133 says a dazed creature "cannot recycle AP",
 *   flatly and with no exception; pg 126's Ready calls its refund a recycle.
 *   Neither rule cites the other, so this is a reading, not a printed
 *   interaction — but it is the reading that leaves both sentences meaning
 *   something.
 *
 * @returns the AP banked, or null when nothing was readied.
 */
export async function lapseReady(
  actor: FoundryActor,
  system: CharacterData,
  effectId?: string,
): Promise<number | null> {
  const entries = readyOn(actor).filter(
    (entry) => effectId === undefined || entry.id === effectId,
  );
  if (entries.length === 0) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Ready.nothingReadied"));
    return null;
  }
  await actor.deleteEmbeddedDocuments(
    "ActiveEffect",
    entries.map((entry) => entry.id),
  );

  const dazed = actor.statuses?.has("dazed") === true;
  const spent = entries.reduce((total, entry) => total + entry.record.ap, 0);
  const refund = dazed ? 0 : readyRecycledAP(spent);
  if (refund > 0) {
    await actor.update({
      "system.resources.ap.recycled": system.resources.ap.recycled + refund,
    });
  }

  await say(
    actor,
    game.i18n.localize(dazed ? "FALLOUT.Ready.lapsedDazed" : "FALLOUT.Ready.lapsed", {
      spent,
      refund,
    }),
  );
  return refund;
}
