/**
 * Movement (v2.1 pg 116-118) — the document-writing half.
 *
 * The arithmetic is in `src/rules/movement.ts` and is pure. This file rolls the
 * dice, writes the fatigue, drops the hit points and posts the cards.
 *
 * ## What writes, and what only reports
 *
 * Most of this chapter is **prices**. The AP half of those prices is now charged
 * against the pool (BACKLOG E1's half-step: spent, reported, never refused), but
 * **there is still no movement budget in this system**. No field holds
 * feet-moved-this-turn, and nothing hooks token movement. `derived.moveCapFeet`
 * is real — Sludge lung writes it, and so do the pg 129 leg conditions now that
 * they are applied rather than printed — and the character sheet shows it, but
 * nothing here enforces it. So `reportClimb`, `reportSwim` and `reportSprint`
 * charge the AP and change nothing else, and the panel says so out loud rather
 * than implying a distance is being tracked.
 *
 * Four things do write, because each has a printed consequence that lands on the
 * sheet:
 *
 * - **`fall`** — rolls impact damage through the existing pipeline, lands the
 *   creature prone, and rolls the limb conditions when the damage reaches hit
 *   points.
 * - **`jump`** — rolls the Strength check when the jump overreaches. (An
 *   unaffordable jump is still never refused.)
 * - **`travel`** — writes levels of fatigue.
 * - **the breath clock** — `holdBreath` / `spendBreath` / `tickSuffocation`,
 *   which ends by dropping a drowning creature to 0 hit points.
 *
 * ## Why the breath clock is a marker and a button
 *
 * Same reason as everything else here: this system does not write documents in
 * response to document writes (`src/actions/situations.ts` sets out why at
 * length, and `src/actions/environment.ts` makes the same choice for the weather
 * tick). So held breath is a duration-less Active Effect carrying its own
 * countdown — the pattern `blocking.ts` and the Ready marker established — and a
 * person advances it. Foundry's own clock is not asked to expire it, because an
 * effect that vanished on a timer would take the drowning with it.
 */

import type { CharacterData } from "../data/character";
import { applyDamage, describeDamageResult } from "../combat/damage";
import { FATIGUE_MAX, SPRINT_AP_COST } from "../rules/constants";
import { noteActionPoints } from "../combat/action-points";
import { SYSTEM_ID } from "../rules/effects";
import { robotTraitsFor } from "../rules/robots";
import {
  breathAfterPenalties,
  BREATH_PENALTY_SECONDS,
  climbApCost,
  climbApPer5Feet,
  climbRoundLimit,
  type ClimbSurface,
  type CreatureSize,
  DEFAULT_CREATURE_SIZE,
  FALL_DAMAGE_TYPE,
  fallOutcome,
  type JumpKind,
  jumpPlan,
  sprint,
  suffocationRounds,
  swimApCost,
  swimApPer5Feet,
  swimRoundLimit,
  type TerrainTier,
  travelPlan,
  type TravelMode,
  type TravelPace,
  WATERS,
  type WaterKind,
} from "../rules/movement";

// ------------------------------------------------------------------- plumbing

function speaker(actor: FoundryActor): ChatSpeakerData {
  return foundry.documents.ChatMessage.getSpeaker({ actor });
}

async function say(actor: FoundryActor, lines: string[]): Promise<void> {
  await foundry.documents.ChatMessage.create({
    speaker: speaker(actor),
    content: lines.filter(Boolean).join("<br />"),
  });
}

function signed(value: number): string {
  return value >= 0 ? `+${String(value)}` : String(value);
}

// ------------------------------------------------------------- robot chassis

/**
 * **Slow** (Protectron, pg 10): *"Protectrons can only spend a maximum of 6 AP
 * on movement during their turns."*
 *
 * Reported, never enforced. The pool is charged now, but nothing anywhere
 * accumulates AP-spent-*on-movement* across a turn — which is the quantity this
 * cap is about, and a different number from the pool. So each card states the
 * cap, and says so again when the single move it is pricing already costs more
 * than the whole turn's allowance — which is the case a player can act on.
 *
 * **What counts as "on movement" is the book's silence**, recorded at
 * `RobotTraits.maxMovementAp` in `src/rules/robots.ts` and ruled here, since
 * this is the chapter that has to answer it: every AP this chapter prices for
 * changing your position counts — walking (pg 116), climbing, swimming and
 * diving, jumping and sprinting (pg 117). They are printed under one heading,
 * "Special Types of Movement", and the trait names no exceptions. Two things
 * deliberately do not report a cap:
 *
 * - **Travel** (pg 116) is measured in hours and paid in fatigue. There is no
 *   AP in it to cap.
 * - **Falling** (pg 117-118) spends nothing; it happens to you.
 *
 * Standing up from prone (2 AP, pg 126) is priced in the combat chapter rather
 * than this one and has no control here, so nothing about it is claimed either
 * way — a table that reads it as movement should count it by hand.
 */
function slowNotes(system: CharacterData, ap: number | null): string[] {
  const cap = robotTraitsFor(system.details.race, system.details.robotType).maxMovementAp;
  if (cap === null) return [];
  const notes = [game.i18n.localize("FALLOUT.Robots.protectron.slow", { ap: cap })];
  if (ap !== null && ap > cap) {
    notes.push(game.i18n.localize("FALLOUT.Robots.slowExceeded", { ap, cap }));
  }
  return notes;
}

/**
 * **All Terrain Rollers** (Robobrain, pg 11): *"You do not have to spend extra
 * AP to move through difficult terrain."*
 *
 * "Extra AP" is the pg 116 surcharge — one additional AP per five feet, two in
 * extreme terrain — and that surcharge is the *only* thing the rollers waive.
 * It is reported at the two places this chapter mentions difficult terrain at
 * all, and both need a caveat rather than a bare exemption:
 *
 * - **Sprint** (`reportSprint`), where difficult terrain *ends* the movement
 *   instead of surcharging it (pg 117). There is no extra AP there to waive, so
 *   the rollers do not keep a Robobrain running. That ruling is argued at
 *   `sprint()` in `src/rules/movement.ts`; this is where it reaches a card.
 * - **Travel** (`travel`), where difficult terrain divides the distance covered
 *   in a day (pg 116) rather than charging anything. Also untouched.
 *
 * Nothing else in the system charges the surcharge, because nothing tracks
 * feet moved on a turn (BACKLOG E3 and the module note above), so this is the
 * whole of the trait's reach until something does.
 */
function rollersWaiveSurcharge(system: CharacterData): boolean {
  return robotTraitsFor(system.details.race, system.details.robotType).ignoresDifficultTerrain;
}

/**
 * Post an **AP-priced** movement card: the charge itself, the caller's own
 * lines, then the tail every one of them ends with — the chassis notes for
 * whatever this creature is built out of, and the reminder that nothing was
 * refused and no distance is being tracked.
 *
 * The tail used to be hand-spliced at each of the four priced cards (climb,
 * swim, sprint, jump), which meant a fifth would have quietly shipped without
 * the Protectron's cap on it. `slowNotes` is deliberately reached from nowhere
 * else now, so a new priced card gets the chassis by posting through here — and
 * a chassis trait added later reaches every card at once.
 *
 * `ap` is the price this particular card is quoting, which is what decides
 * whether the cap gets its second, louder line; pass null when the move has a
 * card but no number (nothing does today).
 *
 * Three cards in this module deliberately do **not** come through here, and each
 * is a rule rather than an oversight: the climb *refusal* (a treacherous surface
 * without gear prices nothing, so there is no AP to cap and nothing to report),
 * **travel** (paid in hours and fatigue — see `slowNotes`) and **falling** (it
 * spends nothing; it happens to you).
 */
async function sayMovementCard(
  actor: FoundryActor,
  system: CharacterData,
  ap: number | null,
  lines: string[],
): Promise<void> {
  // The one place every AP-costing movement card converges, which makes it the
  // one place movement charges the pool (backlog E1's half-step). Sprint, jump,
  // climb and swim all arrive here with their price already computed; charging
  // in each of them instead is how three of the four end up spending and the
  // fourth quietly does not.
  const note = ap === null ? null : await noteActionPoints(actor, ap);
  await say(actor, [
    ...lines,
    ...(note === null ? [] : [note.line]),
    ...slowNotes(system, ap),
    game.i18n.localize("FALLOUT.Movement.reported"),
  ]);
}

/** Miles printed to at most two decimals, since the paces run on quarters. */
function miles(value: number): string {
  return String(Math.round(value * 100) / 100);
}

// ------------------------------------------------------------- climb and swim

export interface MoveCostReport {
  /** null when the move is impossible — a treacherous climb without gear. */
  ap: number | null;
  apPer5Feet: number | null;
  feet: number;
  /** Rounds before the round limit bites, or null where none is printed. */
  roundLimit: number | null;
}

/**
 * **Climbing** (pg 116-117). Reports the price and the clock; writes nothing.
 *
 * > While you are climbing, you are considered off-balance (see pg #).
 *
 * That cross-reference is never filled in and "off-balance" is defined on no
 * page of the book, so the card says the book calls you off-balance and stops
 * there. Naming a mechanical effect for it would be writing the missing rule.
 *
 * > At the start of your next turn after climbing past your limit, you fall.
 *
 * The limit is reported, not tracked — nothing counts a creature's consecutive
 * climbing turns. When it is exceeded, `fall` is the button to press, and the
 * card says as much.
 */
export async function reportClimb(
  actor: FoundryActor,
  system: CharacterData,
  options: { surface: ClimbSurface; feet: number; gear: boolean },
): Promise<MoveCostReport> {
  const rate = climbApPer5Feet(options.surface, options.gear);
  const ap = climbApCost(options.surface, options.feet, options.gear);
  const roundLimit = climbRoundLimit(system.derived.abilityScores.endurance);
  const surface = game.i18n.localize(`FALLOUT.Movement.surfaces.${options.surface}`);

  if (rate === null || ap === null) {
    // "You cannot climb a treacherous surface without climbing equipment of some
    // kind" — a refusal the book states outright, not a priced-but-hard move.
    await say(actor, [game.i18n.localize("FALLOUT.Movement.climbImpossible", { surface })]);
    return { ap: null, apPer5Feet: null, feet: options.feet, roundLimit };
  }

  await sayMovementCard(actor, system, ap, [
    game.i18n.localize("FALLOUT.Movement.climbCard", {
      surface,
      feet: options.feet,
      ap,
      rate,
      gear: options.gear
        ? game.i18n.localize("FALLOUT.Movement.withGear")
        : game.i18n.localize("FALLOUT.Movement.withoutGear"),
    }),
    game.i18n.localize("FALLOUT.Movement.climbLimit", {
      rounds: roundLimit,
      endurance: system.derived.abilityScores.endurance,
    }),
    game.i18n.localize("FALLOUT.Movement.offBalance"),
  ]);
  return { ap, apPer5Feet: rate, feet: options.feet, roundLimit };
}

/**
 * **Swimming and diving** (pg 117). Reports the price, the current, and the
 * breath; writes nothing.
 *
 * The current is the half worth surfacing: rushing water moves you 10 feet in a
 * GM's chosen direction at the start of your turn, treacherous water 20, and
 * that happens whether or not you spend a single AP.
 *
 * The round limit is printed only for treacherous water — see `swimRoundLimit`
 * for why it is not extended to the other two — and its consequence is drowning
 * rather than falling.
 */
export async function reportSwim(
  actor: FoundryActor,
  system: CharacterData,
  options: { water: WaterKind; feet: number; underwater: boolean },
): Promise<MoveCostReport> {
  const rate = swimApPer5Feet(options.water, options.underwater);
  const ap = swimApCost(options.water, options.feet, options.underwater);
  const roundLimit = swimRoundLimit(options.water, system.derived.abilityScores.endurance);
  const water = game.i18n.localize(`FALLOUT.Movement.waters.${options.water}`);
  // Read off the rules table rather than restated, so the two cannot drift.
  const current = WATERS[options.water].currentFeet;

  const lines = [
    game.i18n.localize(
      options.underwater ? "FALLOUT.Movement.diveCard" : "FALLOUT.Movement.swimCard",
      { water, feet: options.feet, ap, rate },
    ),
  ];
  if (current > 0) {
    lines.push(game.i18n.localize("FALLOUT.Movement.currentPush", { water, feet: current }));
  }
  if (roundLimit !== null) {
    lines.push(
      game.i18n.localize("FALLOUT.Movement.swimLimit", {
        rounds: roundLimit,
        endurance: system.derived.abilityScores.endurance,
      }),
    );
  }
  if (options.underwater) {
    lines.push(
      game.i18n.localize("FALLOUT.Movement.breathReminder", {
        seconds: breathAfterPenalties(system.derived.abilityMods.endurance, 0),
      }),
    );
  }
  lines.push(game.i18n.localize("FALLOUT.Movement.offBalance"));
  await sayMovementCard(actor, system, ap, lines);
  return { ap, apPer5Feet: rate, feet: options.feet, roundLimit };
}

// -------------------------------------------------------------------- sprinting

export interface SprintCard {
  ap: number;
  feet: number;
  halved: boolean;
  refund: number;
}

/**
 * **Sprint** (pg 117, pg 127) — the action `SPRINT_AP_COST` was declared for and
 * never used.
 *
 * Which printing governs which half is settled at `sprint()` in
 * `src/rules/movement.ts`; the short version is that pg 127 defines the action
 * (5 AP, 50 feet in a line, no refund if it is cut short) and pg 117 supplies
 * the one thing pg 127 leaves out — that **difficult terrain ends a sprint
 * rather than surcharging it**. That is the sentence worth printing on a card,
 * because everywhere else in the book difficult terrain costs an extra AP per
 * five feet (pg 116) and a player will reasonably expect to pay it and keep
 * running.
 *
 * `halved` is pg 122's Dust Storm, read off the weather state the scene already
 * carries (`weatherEffect().sprintHalved`); the caller passes it in so this stays
 * a movement rule rather than a second copy of the weather table.
 */
export async function reportSprint(
  actor: FoundryActor,
  options: { halved?: boolean; difficultTerrain?: boolean } = {},
): Promise<SprintCard> {
  const report = sprint(options);
  // Read off the actor rather than taken as a parameter: this is the one action
  // in the module the panel calls without a `system`, and both actor types are
  // `CharacterData`, so the sheet is already prepared and to hand. Changing the
  // signature would change every caller for one trait.
  const system = actor.system as CharacterData;
  const lines = [
    game.i18n.localize("FALLOUT.Movement.sprintCard", {
      ap: report.ap,
      feet: report.feet,
    }),
  ];
  if (report.halved) lines.push(game.i18n.localize("FALLOUT.Movement.sprintDustStorm"));
  lines.push(game.i18n.localize("FALLOUT.Movement.sprintTerrain"));
  if (report.terrainEnds) lines.push(game.i18n.localize("FALLOUT.Movement.sprintEnds"));
  // The rollers waive the pg 116 surcharge, and a sprint is not surcharged —
  // it is ended (pg 117). Said out loud on exactly the card where a Robobrain's
  // player would otherwise expect the trait to save the run.
  if (report.terrainEnds && rollersWaiveSurcharge(system)) {
    lines.push(game.i18n.localize("FALLOUT.Robots.robobrain.allTerrainRollers"));
    lines.push(game.i18n.localize("FALLOUT.Robots.rollersSprint"));
  }
  await sayMovementCard(actor, system, report.ap, lines);
  return { ap: report.ap, feet: report.feet, halved: report.halved, refund: report.refund };
}

// --------------------------------------------------------------------- jumping

export interface JumpReport {
  kind: JumpKind;
  limitFeet: number;
  feet: number;
  ap: number;
  overreach: boolean;
  dc: number | null;
  /** null when no check was needed. */
  rolled: number | null;
  cleared: boolean;
  affordable: boolean;
}

/**
 * **Jumping** (pg 117). Long and high, with the same structure and two different
 * numbers each.
 *
 * The check is the only part that rolls: a jump within your limit is arithmetic,
 * and a jump past it costs its AP first and then asks for a Strength ability
 * check against `10 + the extra feet` (long) or `18 + the extra feet` (high).
 *
 * > On a failure, you do not clear the distance and you still use the AP it
 * > would have taken to clear the distance.
 *
 * So a failed overreach is reported as a failure that still cost full price. The
 * AP is not deducted here any more than anywhere else — the card says what was
 * spent and the player spends it.
 *
 * The precondition — *"so long as the last two action points you used were to
 * move"* — is an input, not a check. Nothing in this system records what AP was
 * spent on, because AP is not spent through this system at all, and the book
 * itself allows those two points to have come from a previous turn, a readied
 * action or the Commander perk. The caller declares it; the card prints which
 * way it was declared.
 */
export async function jump(
  actor: FoundryActor,
  system: CharacterData,
  options: { kind: JumpKind; feet: number; moved: boolean },
): Promise<JumpReport> {
  const plan = jumpPlan(options.kind, system.derived.abilityMods.strength, options.feet, {
    moved: options.moved,
    availableAp: system.resources.ap.value,
  });
  const kindLabel = game.i18n.localize(`FALLOUT.Movement.jumps.${options.kind}`);

  const lines = [
    game.i18n.localize("FALLOUT.Movement.jumpCard", {
      kind: kindLabel,
      feet: plan.feet,
      limit: plan.limitFeet,
      ap: plan.ap,
    }),
    game.i18n.localize(
      plan.moved ? "FALLOUT.Movement.jumpMoved" : "FALLOUT.Movement.jumpStanding",
    ),
  ];
  if (!plan.affordable) {
    // "If you do not have enough AP to clear the jump, you cannot jump on this
    // turn." Still reported and not enforced: the pool is charged (and may go
    // to zero), but the jump is never refused. That refusal is full E1.
    lines.push(
      game.i18n.localize("FALLOUT.Movement.jumpUnaffordable", {
        ap: plan.ap,
        available: system.resources.ap.value,
      }),
    );
  }

  let rolled: number | null = null;
  let cleared = !plan.overreach;
  if (plan.overreach && plan.dc !== null) {
    const parts = ["1d20", signed(system.derived.abilityMods.strength)];
    if (system.derived.d20Penalty > 0) parts.push(`-${String(system.derived.d20Penalty)}`);
    if (system.derived.d20Bonus !== 0) parts.push(signed(system.derived.d20Bonus));
    const roll = new foundry.dice.Roll(parts.join(" "));
    await roll.evaluate();
    rolled = roll.total;
    cleared = roll.total >= plan.dc;
    await roll.toMessage({
      speaker: speaker(actor),
      flavor: `${game.i18n.localize("FALLOUT.Movement.jumpCheck", {
        kind: kindLabel,
        extra: plan.extraFeet,
        dc: plan.dc,
      })} — ${game.i18n.localize(
        cleared ? "FALLOUT.Movement.jumpCleared" : "FALLOUT.Movement.jumpFailed",
      )}`,
    });
    if (!cleared) lines.push(game.i18n.localize("FALLOUT.Movement.jumpApSpentAnyway", { ap: plan.ap }));
  }

  await sayMovementCard(actor, system, plan.ap, lines);
  return {
    kind: plan.kind,
    limitFeet: plan.limitFeet,
    feet: plan.feet,
    ap: plan.ap,
    overreach: plan.overreach,
    dc: plan.dc,
    rolled,
    cleared,
    affordable: plan.affordable,
  };
}

// --------------------------------------------------------------------- falling

export interface FallReport {
  size: CreatureSize;
  feet: number;
  formula: string;
  damage: number;
  /** Damage that actually reached hit points — the limb-condition trigger. */
  hpLost: number;
  prone: boolean;
  capped: boolean;
  /** The rolled conditions, already localized, in the order they were rolled. */
  conditions: string[];
}

/**
 * **Falling** (pg 117-118): `1d6` per 10 feet for a Medium creature, prone on
 * landing, and a random arm *and* leg condition if the damage reaches hit
 * points.
 *
 * Nothing here is new machinery. The damage goes through `applyDamage`, so
 * Power Armor Defense Points, temporary hit points, Stamina Points, damage
 * threshold, the dying transition and the death-save-on-damage rule all behave
 * exactly as they do for a bullet. The limb conditions are the same `1d4` tables
 * `src/dice/rolls.ts` rolls for a targeted attack, read out of the same
 * localization keys — a fall inflicts the printed limb conditions, not a private
 * copy of them.
 *
 * ## Rulings
 *
 * - **"a random arm and leg condition" is two conditions, one per limb.** The
 *   Tiny row is worded "one random arm **or** leg limb condition" and every
 *   other row says "**and**". The book distinguishes the two in adjacent
 *   paragraphs, so the distinction is honoured: Tiny rolls which limb and then
 *   one condition; everyone else rolls one arm condition and one leg condition.
 * - **The trigger is `hpLost > 0`.** "If this damage is dealt to the creature's
 *   hit points" — stamina absorbing the whole fall means no conditions, which is
 *   what the sentence says and is consistent with how the Corrosive property
 *   reads the same trigger in `applyDamage`.
 * - **Tiny takes no damage and needs none.** Its condition is triggered by
 *   distance alone, past 50 feet. "unless they land on something hazardous" is
 *   the GM's, and is printed on the card rather than rolled.
 * - **Prone is applied as the token status.** The book says the creature "lands
 *   prone"; Tiny is the one size the book does not say that about, and it is not
 *   given the status.
 * - **The book never says what causes a fall, or that anything stops one.** No
 *   check to catch yourself, no reduction for landing on anything, no rule for
 *   falling onto another creature. The distance is declared.
 */
export async function fall(
  actor: FoundryActor,
  // Unused: everything a fall needs is the distance and the size, and the damage
  // pipeline reads the sheet itself. Kept so every action in this module takes
  // the same `(actor, system, options)` shape as the rest of the actions layer.
  _system: CharacterData,
  options: { feet: number; size?: CreatureSize },
): Promise<FallReport> {
  const size = options.size ?? DEFAULT_CREATURE_SIZE;
  const outcome = fallOutcome(size, options.feet);
  const sizeLabel = game.i18n.localize(`FALLOUT.Movement.sizes.${size}`);

  const lines = [
    game.i18n.localize("FALLOUT.Movement.fallCard", { size: sizeLabel, feet: outcome.feet }),
  ];

  let damage = 0;
  let hpLost = 0;
  if (outcome.formula !== "") {
    const roll = new foundry.dice.Roll(outcome.formula);
    await roll.evaluate();
    damage = roll.total;
    await roll.toMessage({
      speaker: speaker(actor),
      flavor: game.i18n.localize("FALLOUT.Movement.fallDamage", {
        size: sizeLabel,
        feet: outcome.feet,
        formula: outcome.formula,
      }),
    });
    const result = await applyDamage(actor, damage, FALL_DAMAGE_TYPE);
    hpLost = result.hpLost;
    lines.push(describeDamageResult(actor.name, result));
    if (outcome.capped) {
      lines.push(
        game.i18n.localize("FALLOUT.Movement.fallCapped", { dice: outcome.dice, formula: outcome.formula }),
      );
    }
  } else if (size === "tiny") {
    lines.push(game.i18n.localize("FALLOUT.Movement.fallTiny"));
  } else {
    // Short of one whole increment: the arithmetic yields no dice at all, which
    // is the book's own answer and worth saying rather than posting a blank.
    lines.push(game.i18n.localize("FALLOUT.Movement.fallNoDamage", { feet: outcome.feet }));
  }

  if (outcome.prone) {
    await actor.toggleStatusEffect("prone", { active: true });
    lines.push(game.i18n.localize("FALLOUT.Movement.fallProne"));
  }

  const conditions: string[] = [];
  const inflict = outcome.conditionOnDistance || (outcome.conditionOnHitPoints && hpLost > 0);
  if (inflict) {
    const limbs: ("arm" | "leg")[] =
      outcome.limbConditions === "armOrLeg" ? [await pickLimb(actor)] : ["arm", "leg"];
    for (const limb of limbs) {
      const roll = new foundry.dice.Roll("1d4");
      await roll.evaluate();
      const text = game.i18n.localize(`FALLOUT.Targeted.limbs.${limb}.c${String(roll.total)}`);
      conditions.push(text);
      await roll.toMessage({
        speaker: speaker(actor),
        flavor: game.i18n.localize("FALLOUT.Movement.fallCondition", {
          limb: game.i18n.localize(`FALLOUT.Targeted.limbs.${limb}.label`),
          condition: text,
        }),
      });
    }
  } else if (outcome.conditionOnHitPoints && damage > 0) {
    lines.push(game.i18n.localize("FALLOUT.Movement.fallSoaked"));
  }

  await say(actor, lines);
  return {
    size,
    feet: outcome.feet,
    formula: outcome.formula,
    damage,
    hpLost,
    prone: outcome.prone,
    capped: outcome.capped,
    conditions,
  };
}

/** Tiny's "arm **or** leg": a coin flip, since the book names no weighting. */
async function pickLimb(actor: FoundryActor): Promise<"arm" | "leg"> {
  const roll = new foundry.dice.Roll("1d2");
  await roll.evaluate();
  const limb = roll.total === 1 ? "arm" : "leg";
  await roll.toMessage({
    speaker: speaker(actor),
    flavor: game.i18n.localize("FALLOUT.Movement.fallLimbPick"),
  });
  return limb;
}

// ------------------------------------------------------- breath and suffocating

const BREATH_FLAG = "breath";

export interface BreathRecord {
  /** Seconds of breath left. */
  seconds: number;
  /** How many 30-second penalties have been taken (pg 117). */
  penalties: number;
  /** Rounds left before dropping, once the breath has run out. Null until then. */
  suffocating: number | null;
}

function isBreathRecord(value: unknown): value is BreathRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.seconds === "number" &&
    typeof record.penalties === "number" &&
    (record.suffocating === null || typeof record.suffocating === "number")
  );
}

function breathEffect(actor: FoundryActor): { id: string; record: BreathRecord } | null {
  for (const effect of actor.effects) {
    const flag = effect.getFlag(SYSTEM_ID, BREATH_FLAG);
    if (isBreathRecord(flag)) return { id: effect.id, record: flag };
  }
  return null;
}

/** The breath a creature is currently holding, if any. */
export function heldBreath(actor: FoundryActor): BreathRecord | null {
  return breathEffect(actor)?.record ?? null;
}

async function writeBreath(
  actor: FoundryActor,
  id: string,
  record: BreathRecord,
): Promise<void> {
  await actor.updateEmbeddedDocuments("ActiveEffect", [
    {
      _id: id,
      description: describeBreath(record),
      flags: { [SYSTEM_ID]: { [BREATH_FLAG]: record } },
    },
  ]);
}

function describeBreath(record: BreathRecord): string {
  return record.suffocating === null
    ? game.i18n.localize("FALLOUT.Movement.breathHeld", { seconds: record.seconds })
    : game.i18n.localize("FALLOUT.Movement.breathOut", { rounds: record.suffocating });
}

/**
 * Start holding your breath (pg 117, pg 118 — printed twice, identically).
 *
 * `1 + your Endurance modifier` minutes, minimum 30 seconds. A duration-less
 * marker effect carries the countdown; nothing expires it but a button, for the
 * reason in the module note.
 *
 * Calling this again resets the clock to full, which is what surfacing and
 * taking a fresh breath does. There is no printed rule about partial recovery.
 */
export async function holdBreath(
  actor: FoundryActor,
  system: CharacterData,
): Promise<BreathRecord> {
  const record: BreathRecord = {
    seconds: breathAfterPenalties(system.derived.abilityMods.endurance, 0),
    penalties: 0,
    suffocating: null,
  };
  const existing = breathEffect(actor);
  if (existing) {
    await writeBreath(actor, existing.id, record);
  } else {
    await actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: game.i18n.localize("FALLOUT.Movement.breathEffect"),
        img: "icons/svg/sound.svg",
        type: "base",
        description: describeBreath(record),
        // No duration: a marker, advanced by a person. See the module note.
        system: { changes: [] },
        flags: { [SYSTEM_ID]: { [BREATH_FLAG]: record } },
      },
    ]);
  }
  await say(actor, [
    game.i18n.localize("FALLOUT.Movement.breathStart", {
      seconds: record.seconds,
      endurance: signed(system.derived.abilityMods.endurance),
    }),
    game.i18n.localize("FALLOUT.Movement.breathPenaltyRule"),
  ]);
  return record;
}

/**
 * Burn seconds of held breath, and roll into suffocating when it runs out.
 *
 * > If you cannot hold your breath any longer and are still underwater, you
 * > begin drowning (see suffocating on pg #).
 *
 * The cross-reference placeholder is unfilled in the printed book; the target is
 * pg 118's Suffocating, which is the only such section and which the same
 * sentence names.
 */
export async function spendBreath(
  actor: FoundryActor,
  system: CharacterData,
  seconds: number,
): Promise<BreathRecord | null> {
  const held = breathEffect(actor);
  if (!held) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Movement.breathNone"));
    return null;
  }
  if (held.record.suffocating !== null) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Movement.breathAlreadyOut"));
    return held.record;
  }

  const remaining = Math.max(0, held.record.seconds - Math.max(0, seconds));
  const record: BreathRecord = {
    seconds: remaining,
    penalties: held.record.penalties,
    suffocating:
      remaining > 0 ? null : suffocationRounds(system.derived.abilityMods.endurance),
  };
  await writeBreath(actor, held.id, record);

  if (record.suffocating === null) {
    await say(actor, [
      game.i18n.localize("FALLOUT.Movement.breathSpent", { seconds, remaining }),
    ]);
  } else {
    await say(actor, [
      game.i18n.localize("FALLOUT.Movement.breathGone", { rounds: record.suffocating }),
      game.i18n.localize("FALLOUT.Movement.suffocationRule"),
    ]);
  }
  return record;
}

/**
 * A diving penalty (pg 117): *"The amount of time you can hold your breath
 * reduces by 30 seconds (6 rounds) each time you take damage or use more than
 * half your AP on your turn."*
 *
 * Neither trigger is detected here. Taking damage is a hook this system does not
 * write, and "more than half your AP on your turn" cannot be seen at all while
 * AP is spent by hand. So it is a button, pressed when either happens, and the
 * panel says which two things it is for.
 *
 * Note the parenthetical scores 30 seconds as 6 rounds, making a round 5 seconds
 * — pg 124's radiation cadence makes it 6. Both are used as printed in their own
 * chapters; nothing here reconciles them, because nothing needs both at once.
 */
export async function breathPenalty(
  actor: FoundryActor,
  system: CharacterData,
  times = 1,
): Promise<BreathRecord | null> {
  const held = breathEffect(actor);
  if (!held) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Movement.breathNone"));
    return null;
  }
  const penalties = held.record.penalties + Math.max(1, Math.floor(times));
  // The book reduces "the amount of time you can hold your breath", which is the
  // maximum — so the remaining time is recomputed from the maximum rather than
  // subtracted from what is left. The two differ once any breath has been spent,
  // and the book says maximum.
  const ceiling = breathAfterPenalties(system.derived.abilityMods.endurance, penalties);
  const remaining = Math.min(held.record.seconds, ceiling);
  const record: BreathRecord = {
    seconds: remaining,
    penalties,
    suffocating:
      remaining > 0
        ? held.record.suffocating
        : (held.record.suffocating ?? suffocationRounds(system.derived.abilityMods.endurance)),
  };
  await writeBreath(actor, held.id, record);
  await say(actor, [
    game.i18n.localize("FALLOUT.Movement.breathPenaltyTaken", {
      seconds: BREATH_PENALTY_SECONDS,
      remaining: record.seconds,
      penalties,
    }),
    record.suffocating === null
      ? ""
      : game.i18n.localize("FALLOUT.Movement.breathGone", { rounds: record.suffocating }),
  ]);
  return record;
}

export interface SuffocationReport {
  roundsLeft: number;
  dropped: boolean;
}

/**
 * Advance the suffocation clock (pg 118).
 *
 * > When a creature runs out of breath or is choking, it can survive for a
 * > number of rounds equal to its Endurance modifier (minimum of 1 round). At
 * > the start of its next turn, it drops to 0 hit points and is dying, and it
 * > can't regain hit points or be stabilized until it can breathe again.
 *
 * Dropping to 0 is written straight to hit points rather than routed through
 * `applyDamage`: the book does not deal damage here, it sets the total, so
 * Stamina Points and Defense Points are not offered a chance to soak something
 * that is not damage. The dying status is applied to match, and Stamina Points
 * are zeroed because pg 131 does that to *anyone* who drops to 0 hit points
 * ("you lose all of your stamina points").
 *
 * **The healing lock is reported, not enforced.** "Can't regain hit points or be
 * stabilized until it can breathe again" would need a derived healing gate keyed
 * to suffocation, and `derived.hpHealableMax` — the only such gate that exists —
 * belongs to the radiation rules in `src/data/character.ts`, which this chapter
 * does not own. Pressing `stabilizeCreature` on a drowning character will still
 * work. Flagged in the notes as the one integration this chapter wants.
 */
export async function tickSuffocation(
  actor: FoundryActor,
  // Unused: the rounds left were computed from Endurance when the breath ran out
  // and are stored on the marker, so nothing is re-derived here. Kept for the
  // uniform `(actor, system, …)` shape.
  _system: CharacterData,
  rounds = 1,
): Promise<SuffocationReport | null> {
  const held = breathEffect(actor);
  if (held?.record.suffocating == null) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Movement.notSuffocating"));
    return null;
  }

  const left = Math.max(0, held.record.suffocating - Math.max(0, rounds));
  const record: BreathRecord = { ...held.record, suffocating: left };
  await writeBreath(actor, held.id, record);

  if (left > 0) {
    await say(actor, [game.i18n.localize("FALLOUT.Movement.suffocationRounds", { rounds: left })]);
    return { roundsLeft: left, dropped: false };
  }

  await actor.update({
    "system.resources.hp.value": 0,
    "system.resources.sp.value": 0,
  });
  await actor.toggleStatusEffect("dying", { active: true });
  await say(actor, [
    game.i18n.localize("FALLOUT.Movement.suffocationDropped"),
    game.i18n.localize("FALLOUT.Movement.suffocationLock"),
  ]);
  return { roundsLeft: 0, dropped: true };
}

/** Reached air: the clock stops and the marker goes. Nothing is healed by it. */
export async function reachAir(actor: FoundryActor): Promise<boolean> {
  const held = breathEffect(actor);
  if (!held) return false;
  await actor.deleteEmbeddedDocuments("ActiveEffect", [held.id]);
  await say(actor, [game.i18n.localize("FALLOUT.Movement.breathEnded")]);
  return true;
}

// ----------------------------------------------------------------- travel pace

export interface TravelReport {
  miles: number;
  hours: number;
  fatigue: number;
  /** Fatigue actually written, after the pg 136 cap of nine. */
  fatigueApplied: number;
  passiveSneak: number;
  maxMiles: number;
  fatigueExempt: boolean;
}

/**
 * **Travel** (pg 116) — a leg of a journey, priced in miles and paid in fatigue.
 *
 * The arithmetic and every ruling behind it are at `travelPlan` in
 * `src/rules/movement.ts`: what "maximum travel distance" means (the book never
 * defines it), and the contradiction over whether a passenger in a caravan is
 * fatigued. Both are printed on the card, because both are the table's to
 * overrule.
 *
 * Fatigue is capped at nine (pg 136, `FATIGUE_MAX`), the same ceiling
 * `src/combat/turns.ts` reads when it sheds a level at the start of a turn.
 * Levels past the cap are announced rather than silently dropped.
 *
 * Passive Sneak needs the party's average Sneak bonus, which `currentGroupSneak`
 * computes across every player-owned character; the caller passes the number in
 * so the rules module stays pure and so a GM can override it for an NPC caravan.
 */
export async function travel(
  actor: FoundryActor,
  system: CharacterData,
  options: {
    pace: TravelPace;
    hours: number;
    mode?: TravelMode;
    terrain?: TerrainTier;
    averageGroupSneakBonus?: number;
    mountMiles?: number;
  },
): Promise<TravelReport> {
  const plan = travelPlan({
    pace: options.pace,
    hours: options.hours,
    enduranceModifier: system.derived.abilityMods.endurance,
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.terrain === undefined ? {} : { terrain: options.terrain }),
    ...(options.averageGroupSneakBonus === undefined
      ? {}
      : { averageGroupSneakBonus: options.averageGroupSneakBonus }),
    ...(options.mountMiles === undefined ? {} : { mountMiles: options.mountMiles }),
  });

  const paceLabel = game.i18n.localize(`FALLOUT.Movement.paces.${plan.pace}`);
  const modeLabel = game.i18n.localize(`FALLOUT.Movement.modes.${plan.mode}`);
  const lines = [
    game.i18n.localize("FALLOUT.Movement.travelCard", {
      pace: paceLabel,
      mode: modeLabel,
      hours: plan.hours,
      miles: miles(plan.miles),
      max: miles(plan.maxMiles),
      limit: plan.hourLimit,
    }),
    game.i18n.localize("FALLOUT.Movement.travelSneak", {
      sneak: plan.passiveSneak,
      pace: paceLabel,
    }),
  ];
  if (plan.combatSequence !== null) {
    lines.push(
      game.i18n.localize(`FALLOUT.Movement.travelSequence.${plan.combatSequence}`),
    );
  }
  if (plan.terrain !== "normal") {
    lines.push(
      game.i18n.localize("FALLOUT.Movement.travelTerrain", {
        terrain: game.i18n.localize(`FALLOUT.Movement.terrain.${plan.terrain}`),
      }),
    );
    // Travel-scale terrain divides the distance rather than charging AP, so
    // All Terrain Rollers (pg 11) has nothing to waive here either. Named for
    // the same reason as on the sprint card: the trait sounds like it should.
    if (rollersWaiveSurcharge(system)) {
      lines.push(game.i18n.localize("FALLOUT.Robots.robobrain.allTerrainRollers"));
      lines.push(game.i18n.localize("FALLOUT.Robots.rollersTravel"));
    }
  }

  let fatigueApplied = 0;
  if (plan.fatigue > 0) {
    const before = system.conditions.fatigue;
    const after = Math.min(FATIGUE_MAX, before + plan.fatigue);
    fatigueApplied = after - before;
    if (fatigueApplied > 0) await actor.update({ "system.conditions.fatigue": after });
    lines.push(
      game.i18n.localize("FALLOUT.Movement.travelFatigue", {
        levels: fatigueApplied,
        total: after,
        hours: plan.overageFatigue,
        roads: plan.roadsWalkedFatigue,
        threshold: miles(plan.roadsWalkedMiles),
      }),
    );
    if (fatigueApplied < plan.fatigue) {
      lines.push(
        game.i18n.localize("FALLOUT.Movement.travelFatigueCapped", {
          lost: plan.fatigue - fatigueApplied,
          max: FATIGUE_MAX,
        }),
      );
    }
  } else if (plan.fatigueExempt) {
    lines.push(
      game.i18n.localize("FALLOUT.Movement.travelExempt", { mode: modeLabel }),
    );
    if (plan.mode === "passenger") {
      lines.push(game.i18n.localize("FALLOUT.Movement.travelPassengerRuling"));
    }
  }
  lines.push(game.i18n.localize("FALLOUT.Movement.travelMaxRuling"));

  await say(actor, lines);
  return {
    miles: plan.miles,
    hours: plan.hours,
    fatigue: plan.fatigue,
    fatigueApplied,
    passiveSneak: plan.passiveSneak,
    maxMiles: plan.maxMiles,
    fatigueExempt: plan.fatigueExempt,
  };
}

export { SPRINT_AP_COST };
