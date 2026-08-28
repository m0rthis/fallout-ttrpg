/**
 * Movement (v2.1 pg 116-118): travel pace, the special movement types
 * (climb, swim, dive, jump, sprint), falling, and suffocating.
 *
 * Pure functions only. Everything that writes a document, rolls a die or talks
 * to chat lives in `src/actions/movement.ts`.
 *
 * ## The one thing to know before reading any of this
 *
 * **This system has no movement budget.** Nothing anywhere tracks feet moved on
 * a turn: there is no speed field, no per-turn distance counter, and no hook on
 * token movement. So every distance in this file is *reported* — "a sprint
 * carries you 50 feet", "a 15 foot long jump costs 3 AP" — and nothing is ever
 * spent from a pool, because there is no pool. That is the same standing AP
 * itself has (ROADMAP item 14: AP is reported, never deducted), and the same
 * standing the leg limb-condition distance caps already have
 * (`derived.moveCapFeet` is computed and consulted by nothing).
 *
 * The practical consequence, stated plainly so nobody has to discover it: a
 * character who sprints 50 feet and then walks another 40 will be told the
 * prices of both and stopped by neither. Difficult terrain is the same job and
 * is already classified as a Foundry-integration problem rather than a rules one
 * (ROADMAP section A item 1); this chapter does not solve it and does not
 * pretend to.
 *
 * ## What the book does not print
 *
 * Recorded here rather than papered over, and each one is repeated at the rule
 * it damages:
 *
 * - **Crawling has no rate and no AP cost anywhere in 136 pages.** Prone
 *   (pg 135) and Severed Leg/Foot (pg 129) both say a creature's "only movement
 *   option is to crawl" and no page prices it. There is deliberately no
 *   `crawlApPer5Feet` in this file — see `CRAWL_IS_UNPRICED`.
 * - **"Off-balance" is referenced twice and defined nowhere.** Climbing (pg 116)
 *   and Swimming (pg 117) both say "you are considered off-balance (see pg #)",
 *   an unfilled cross-reference; the term appears in no conditions list. It is
 *   surfaced as a flag on the report so a table can apply whatever they decide it
 *   means, and this file assigns it no mechanics.
 * - **A combat round is 5 seconds on pg 117 and 6 seconds on pg 124.** Diving
 *   says a breath penalty is "30 seconds (6 rounds)"; the radiation zone table
 *   calls its six-second cadence one check per round. Both are used as printed,
 *   in their own rules.
 */

import { SPRINT_AP_COST } from "./constants";

// ---------------------------------------------------------------- base movement

/** "Move 5 feet. — 1 AP" (pg 126 table, read as a rendered page image). */
export const MOVE_AP_PER_INCREMENT = 1;
/** Every movement rate in this chapter is priced per five feet (pg 116-117). */
export const MOVE_INCREMENT_FEET = 5;

/**
 * Difficult terrain, as the *surcharge* the book prints it as (pg 116): "a
 * creature must spend an additional action point to move through 5 feet",
 * two additional for extreme. Moving through an enemy space counts (pg 116 and
 * pg 127, printed twice).
 *
 * Reproduced here only because Sprint's termination clause and the climb/swim
 * rates need something to refer to. It is **not** combined with anything: the
 * book mixes surcharges with absolute rates (Dust Storm "costs 2 AP", Encumbered
 * "2 AP per 5 feet") and never says how they compose, which
 * `packs-src/V21-NOTES-stamina-terrain.md` §2.7 sets out at length. Nothing in
 * this file adds a surcharge to a rate, because doing so would be picking one of
 * two undefined readings and hiding the choice inside a number.
 */
export const TERRAIN_TIERS = ["normal", "difficult", "extreme"] as const;
export type TerrainTier = (typeof TERRAIN_TIERS)[number];

export const DIFFICULT_TERRAIN_SURCHARGE_AP: Record<TerrainTier, number> = {
  normal: 0,
  difficult: 1,
  extreme: 2,
};

/** Travel-scale terrain: distance is halved, or quartered (pg 116). */
export const TERRAIN_TRAVEL_DIVISOR: Record<TerrainTier, number> = {
  normal: 1,
  difficult: 2,
  extreme: 4,
};

/**
 * Crawling is unpriced. Kept as an exported marker so a caller can *say* so
 * rather than reaching for a number that does not exist.
 *
 * The book gives prone creatures crawling as their only movement (pg 135) and
 * severed-leg creatures the same (pg 129), and never prints a rate, an AP cost,
 * or a distance for it. Inventing one — "half speed", "1 AP per 5 feet" — would
 * be inventing a rule, so this system does not. Ruling deferred to the table.
 */
export const CRAWL_IS_UNPRICED = true;

// -------------------------------------------------------------------- climbing

export const CLIMB_SURFACES_ORDER = ["scalable", "sheer", "treacherous"] as const;
export type ClimbSurface = (typeof CLIMB_SURFACES_ORDER)[number];

export interface ClimbSurfaceDefinition {
  /** Printed AP to climb five feet, before any climbing gear (pg 116-117). */
  readonly apPer5Feet: number;
  /** Treacherous surfaces cannot be climbed at all without gear. */
  readonly gearRequired: boolean;
  /** Whether gear takes 1 AP off the rate. Treacherous is exempt as printed. */
  readonly gearDiscount: boolean;
}

/**
 * The three surface ranks the GM picks between before a climb (pg 116-117).
 *
 * > If you have climbing gear such as ropes or stakes; you use 1 less AP to
 * > climb 5 feet (except for treacherous surfaces where climbing equipment is
 * > required).
 *
 * Note Sheer and Treacherous are both 4 AP, which makes gear the only thing
 * separating them: a sheer surface drops to 3 with rope, a treacherous one stays
 * at 4 and is impossible without. That is the book's, not a transcription slip —
 * both numbers were read off the rendered page.
 */
export const CLIMB_SURFACES: Record<ClimbSurface, ClimbSurfaceDefinition> = {
  scalable: { apPer5Feet: 3, gearRequired: false, gearDiscount: true },
  sheer: { apPer5Feet: 4, gearRequired: false, gearDiscount: true },
  treacherous: { apPer5Feet: 4, gearRequired: true, gearDiscount: false },
};

/** What climbing gear takes off the rate, where it takes anything off at all. */
export const CLIMB_GEAR_DISCOUNT_AP = 1;

/**
 * AP to climb five feet, or **null** when the climb is impossible — a
 * treacherous surface with no equipment, which the book forbids outright rather
 * than pricing.
 *
 * Floored at 1: the book prints no floor, but a rate of 0 AP per 5 feet would
 * make a rope infinite free vertical movement, and 1 AP is what the base
 * movement rate costs (pg 126). No printed surface reaches the floor anyway
 * (3 − 1 = 2 is the cheapest), so the clamp is defensive rather than load-bearing.
 */
export function climbApPer5Feet(surface: ClimbSurface, gear: boolean): number | null {
  const definition = CLIMB_SURFACES[surface];
  if (definition.gearRequired && !gear) return null;
  const discount = gear && definition.gearDiscount ? CLIMB_GEAR_DISCOUNT_AP : 0;
  return Math.max(MOVE_AP_PER_INCREMENT, definition.apPer5Feet - discount);
}

/**
 * AP to climb a distance, rounding the last partial five feet up to a whole
 * increment.
 *
 * The rounding is a ruling: the book prices "5 feet" and never contemplates
 * three. Charging the full increment is the reading consistent with every other
 * per-5-feet cost in the chapter, and it is the one that cannot be gamed by
 * declaring a 1-foot climb.
 */
export function climbApCost(
  surface: ClimbSurface,
  feet: number,
  gear: boolean,
): number | null {
  const rate = climbApPer5Feet(surface, gear);
  if (rate === null) return null;
  return increments(feet) * rate;
}

/**
 * How many rounds a creature can keep climbing before it falls (pg 116).
 *
 * > You can continue climbing on each of your turns for a number of rounds equal
 * > to your Endurance ability score (to a minimum of one round). At the start of
 * > your next turn after climbing past your limit, you fall.
 *
 * An Endurance **score**, not the modifier — the same shape the frigid-water
 * rule uses (pg 123, `frigidWaterExposure`). The book does not say whether the
 * count resets when you stop climbing for a turn; nothing here assumes it does
 * or does not, since the count is reported rather than tracked.
 */
export function climbRoundLimit(enduranceScore: number): number {
  return Math.max(1, Math.floor(enduranceScore));
}

// -------------------------------------------------------------------- swimming

export const WATER_KINDS_ORDER = ["still", "rushing", "treacherous"] as const;
export type WaterKind = (typeof WATER_KINDS_ORDER)[number];

export interface WaterDefinition {
  /** AP to swim five feet on the surface (pg 117). */
  readonly apPer5Feet: number;
  /** Feet the current drags you at the start of your turn, in a GM's direction. */
  readonly currentFeet: number;
  /** Whether the round limit and the drowning clause apply to this water. */
  readonly roundLimited: boolean;
}

/**
 * The three water ranks (pg 117).
 *
 * **Two printing errors in this section, both preserved as findings.**
 *
 * 1. The lead-in ranks water as "Still, Rushing, or **Hazardous**", and then
 *    defines Still, Rushing and **Treacherous**. There is no Hazardous entry
 *    anywhere; the three defined subsections are the rule, and Treacherous is
 *    the third rank. (Note the climbing section one page earlier uses
 *    "Treacherous" for its own third rank, which is where the name comes from.)
 * 2. The Treacherous Waters paragraph says "at the start of your turn while you
 *    swim in **rushing** waters, you move 20 feet" and "you can spend 3 AP to
 *    swim 5 feet across **rushing** waters" — copied from the paragraph above it
 *    and not re-edited. Read as Treacherous, since that is the paragraph's own
 *    subject and the numbers differ from the Rushing entry it would otherwise
 *    duplicate and contradict.
 */
export const WATERS: Record<WaterKind, WaterDefinition> = {
  still: { apPer5Feet: 2, currentFeet: 0, roundLimited: false },
  rushing: { apPer5Feet: 2, currentFeet: 10, roundLimited: false },
  treacherous: { apPer5Feet: 3, currentFeet: 20, roundLimited: true },
};

/** "Swimming while underwater requires 1 more AP to move 5 feet" (pg 117). */
export const UNDERWATER_AP_SURCHARGE_PER_5_FEET = 1;

/** AP to swim five feet, with the diving surcharge folded in. */
export function swimApPer5Feet(water: WaterKind, underwater: boolean): number {
  return WATERS[water].apPer5Feet + (underwater ? UNDERWATER_AP_SURCHARGE_PER_5_FEET : 0);
}

/** AP to swim a distance, rounding a partial increment up — as `climbApCost`. */
export function swimApCost(water: WaterKind, feet: number, underwater: boolean): number {
  return increments(feet) * swimApPer5Feet(water, underwater);
}

/**
 * Rounds a creature can keep swimming treacherous water before it starts to
 * drown, or **null** where the book sets no limit (pg 117).
 *
 * The limit is printed **only** in the Treacherous Waters paragraph — "You have
 * a limit to how many rounds you can continue to swim in treacherous waters" —
 * and nowhere in Still or Rushing. Left where it is printed: extending it to all
 * water would make an unlimited swim across a pool impossible, which no sentence
 * in the book asks for.
 *
 * Endurance **score**, minimum one round, exactly as the climb limit is.
 */
export function swimRoundLimit(water: WaterKind, enduranceScore: number): number | null {
  if (!WATERS[water].roundLimited) return null;
  return Math.max(1, Math.floor(enduranceScore));
}

// ------------------------------------------------------------ breath & drowning

/** "…a number of minutes equal to 1 + your Endurance ability modifier…" (pg 117-118). */
export const BREATH_BASE_MINUTES = 1;
/** "…(minimum of 30 seconds)" — the floor, in seconds (pg 117-118). */
export const BREATH_MINIMUM_SECONDS = 30;
/** Each qualifying event costs 30 seconds, "(6 rounds)" as the book scores it. */
export const BREATH_PENALTY_SECONDS = 30;
export const BREATH_PENALTY_ROUNDS = 6;

/**
 * How long a creature can hold its breath, in seconds (pg 117 diving, pg 118
 * suffocating — printed twice, identically).
 *
 * The book's own worked example fixes the arithmetic and incidentally confirms
 * this system's modifier formula: *"a creature with an Endurance of 7 can hold
 * its breath for 3 minutes"* — score 7 is a modifier of +2 (score − 5), and
 * 1 + 2 = 3.
 *
 * Returned in seconds because the minimum is printed in seconds and a modifier
 * of −1 or worse lands on it.
 */
export function breathSeconds(enduranceModifier: number): number {
  return Math.max(BREATH_MINIMUM_SECONDS, (BREATH_BASE_MINUTES + enduranceModifier) * 60);
}

/**
 * Breath left after the diving penalties (pg 117):
 *
 * > The amount of time you can hold your breath reduces by 30 seconds (6 rounds)
 * > each time you take damage or use more than half your AP on your turn.
 *
 * Two silences, both left alone. The book does not say whether the reduction
 * applies to the *maximum* or to what is left, and it does not say what happens
 * when the penalties exceed the total — this floors at zero and lets the caller
 * treat zero as "out of breath", which is the only reading that terminates.
 *
 * Note the parenthetical makes a round 5 seconds here, where pg 124's radiation
 * cadence makes it 6. Both stand as printed in their own chapters.
 */
export function breathAfterPenalties(enduranceModifier: number, penalties: number): number {
  const seconds = breathSeconds(enduranceModifier) - Math.max(0, penalties) * BREATH_PENALTY_SECONDS;
  return Math.max(0, seconds);
}

/**
 * Rounds between running out of breath and dropping (pg 118).
 *
 * > When a creature runs out of breath or is choking, it can survive for a
 * > number of rounds equal to its Endurance modifier (minimum of 1 round). At
 * > the start of its next turn, it drops to 0 hit points and is dying, and it
 * > can't regain hit points or be stabilized until it can breathe again.
 *
 * The **modifier** here, where the climb and swim limits use the score — the
 * book's example confirms it (Endurance 7 → "2 rounds to reach air").
 */
export function suffocationRounds(enduranceModifier: number): number {
  return Math.max(1, enduranceModifier);
}

/**
 * The clause this system cannot enforce: *"it can't regain hit points or be
 * stabilized until it can breathe again"*.
 *
 * There is no derived healing gate keyed to suffocation — `hpHealableMax` exists
 * for the radiation lock (pg 124) and is computed in `src/data/character.ts`,
 * which this chapter does not own. So a suffocated creature's healing block is
 * *reported* on the card and honoured by the table, and `stabilizeCreature`
 * (pg 131) will still hand back a hit point if somebody presses it. Flagged, not
 * silently half-done.
 */
export const SUFFOCATION_HEALING_LOCK_IS_REPORTED = true;

// -------------------------------------------------------------------- jumping

export const JUMP_KINDS = ["long", "high"] as const;
export type JumpKind = (typeof JUMP_KINDS)[number];

/**
 * "…so long as the last two action points you used were to move" (pg 117), with
 * the book's own note that they may have been spent on your last turn, through
 * a readied action, or by the Commander perk.
 *
 * Not checkable: this system does not record what the last two AP were spent on,
 * and could not, since AP is not deducted at all. It is an input the caller
 * supplies — the panel asks — rather than a fact any code here can determine.
 */
export const JUMP_MOVEMENT_AP_REQUIRED = 2;

/** "the DC equal to 10 + the extra number of feet you are attempting to clear". */
export const LONG_JUMP_OVERREACH_BASE_DC = 10;
/** The high jump's is 18, not 10 — the one number that differs (pg 117). */
export const HIGH_JUMP_OVERREACH_BASE_DC = 18;

/**
 * The distance a jump reaches for free (pg 117).
 *
 * - **Long**: `5 × Strength modifier`, minimum 5 feet.
 * - **High**: `3 + Strength modifier`, minimum 1 foot.
 *
 * > If you don't move, you can leap only half that distance.
 *
 * Two things the book does not print, both ruled here:
 *
 * - **Rounding on the halved distance.** Floored, which is this book's stated
 *   convention everywhere it bothers to state one, and which is the only choice
 *   that keeps a standing jump an integer number of feet.
 * - **Whether the printed minimum survives the halving.** It does not: the
 *   minimum is written against the formula ("a number of feet equal to 5 × your
 *   Strength modifier (minimum of 5 feet)"), and the halving is a separate
 *   sentence applied to "that distance". So a standing long jump bottoms out at
 *   2 feet and a standing high jump at 0 — which is a real outcome the book
 *   permits, and reporting a 0-foot standing high jump is more honest than
 *   quietly granting a floor nothing prints.
 */
export function jumpLimitFeet(kind: JumpKind, strengthModifier: number, moved: boolean): number {
  const base =
    kind === "long"
      ? Math.max(5, 5 * strengthModifier)
      : Math.max(1, 3 + strengthModifier);
  return moved ? base : Math.floor(base / 2);
}

/**
 * What a jump of a given distance costs.
 *
 * > Either way, every 5 feet you clear on the jump costs 1 AP. [long]
 * > Either way, every foot you clear on the jump costs 1 AP. [high]
 *
 * A long jump rounds its last partial five feet up to a whole AP, for the reason
 * `climbApCost` does. A high jump is priced per foot and needs no rounding.
 */
export function jumpApCost(kind: JumpKind, feet: number): number {
  const distance = Math.max(0, Math.ceil(feet));
  return kind === "long" ? increments(distance) : distance;
}

/** `10 + extra feet` for a long jump, `18 + extra feet` for a high one (pg 117). */
export function jumpOverreachDC(kind: JumpKind, extraFeet: number): number {
  const base = kind === "long" ? LONG_JUMP_OVERREACH_BASE_DC : HIGH_JUMP_OVERREACH_BASE_DC;
  return base + Math.max(0, extraFeet);
}

export interface JumpPlan {
  kind: JumpKind;
  /** What the character clears without a check. */
  limitFeet: number;
  /** What they are attempting. */
  feet: number;
  /** Feet past the limit; zero when the jump is within it. */
  extraFeet: number;
  /** Total AP, paid whether or not the check succeeds. */
  ap: number;
  /** Whether a Strength check is required at all. */
  overreach: boolean;
  /** The DC, or null when no check is needed. */
  dc: number | null;
  /** Whether the AP is affordable out of the pool the caller passed in. */
  affordable: boolean;
  /** Whether the two-AP movement precondition was declared met. */
  moved: boolean;
}

/**
 * Everything a declared jump costs and demands, in one object.
 *
 * > You can optionally attempt to jump further than your limit. You must first
 * > spend the amount of AP it would take to clear the jump. Then you must succeed
 * > a Strength ability check […] On a failure, you do not clear the distance and
 * > you still use the AP it would have taken to clear the distance.
 *
 * So the AP is always the *attempted* distance's, never the achieved one — which
 * is why `ap` is computed from `feet` and not from `limitFeet`.
 *
 * `availableAp` only decides `affordable`; nothing is deducted (see the module
 * note). *"If you do not have enough AP to clear the jump, you cannot jump on
 * this turn"* is a refusal the sheet reports and a person honours.
 */
export function jumpPlan(
  kind: JumpKind,
  strengthModifier: number,
  feet: number,
  options: { moved: boolean; availableAp: number },
): JumpPlan {
  const limitFeet = jumpLimitFeet(kind, strengthModifier, options.moved);
  const distance = Math.max(0, Math.ceil(feet));
  const extraFeet = Math.max(0, distance - limitFeet);
  const ap = jumpApCost(kind, distance);
  return {
    kind,
    limitFeet,
    feet: distance,
    extraFeet,
    ap,
    overreach: extraFeet > 0,
    dc: extraFeet > 0 ? jumpOverreachDC(kind, extraFeet) : null,
    affordable: ap <= options.availableAp,
    moved: options.moved,
  };
}

// ------------------------------------------------------------------- sprinting

/** "you move 50 feet in a line" (pg 117, pg 127). */
export const SPRINT_DISTANCE_FEET = 50;

/**
 * How far a sprint carries you, halved in a Dust Storm.
 *
 * pg 122's Dust Storm prints "when you sprint you move half as much", which
 * `src/rules/weather.ts` already records as `sprintHalved` on the weather tier —
 * so this reads that flag rather than restating the weather rule.
 */
export function sprintDistanceFeet(halved = false): number {
  return halved ? Math.floor(SPRINT_DISTANCE_FEET / 2) : SPRINT_DISTANCE_FEET;
}

export interface SprintReport {
  ap: number;
  feet: number;
  /** A Dust Storm halved it (pg 122). */
  halved: boolean;
  /** Difficult terrain ends the sprint rather than surcharging it. */
  terrainEnds: boolean;
  /** AP returned when the sprint is cut short. Always zero — pg 127 says so. */
  refund: number;
}

/**
 * **Sprint** — printed twice, and this is the reconciliation the two printings
 * need. `SPRINT_AP_COST` has been declared in `src/rules/constants.ts` and
 * imported by nothing since it was written; this is what it means.
 *
 * **pg 117**, Special Types of Movement, under its own heading:
 *
 * > You can spend 5 AP to immediately move 50 feet in a straight line. If you
 * > stop or are **obstructed by difficult terrain** before you finish this
 * > movement, your movement ends.
 *
 * **pg 127**, Actions in Combat, priced at 5 AP in the pg 126 table:
 *
 * > You can spend 5 action points on your turn to sprint. When you sprint, you
 * > move 50 feet in a line. If you stop or are **obstructed** before you move 50
 * > feet, your movement ends **and you do not regain any action points**.
 *
 * ## Which governs
 *
 * **pg 127 governs the action; pg 117 governs its collision with terrain.**
 * They agree on both numbers — 5 AP, 50 feet — so nothing is at stake there.
 * Where they differ, each printing is the one that says something the other does
 * not, and neither contradicts the other:
 *
 * - pg 127 is the Actions in Combat entry, the printing the pg 126 cost table
 *   points at, and the only one that states the **no refund**. Taken as the
 *   action's definition.
 * - pg 117 is the only printing that names **difficult terrain**, and naming it
 *   is the whole point: everywhere else in the book difficult terrain adds AP
 *   per five feet (pg 116), and this is the one place it does something else
 *   entirely. It *terminates* a sprint instead of taxing it. Dropping that
 *   sentence in favour of pg 127's broader "obstructed" would delete a printed
 *   rule; keeping it as an instance of "obstructed" loses nothing.
 *
 * So: any obstruction ends the sprint, difficult terrain counts as one, and no
 * AP comes back. `terrainEnds` exists to say that on the card, because a player
 * who knows the pg 116 surcharge will otherwise expect to pay 2 AP per 5 feet
 * and keep running.
 *
 * ## What neither printing says
 *
 * - **Whether you finish the five feet you were entering.** Neither version
 *   states where the sprint stops relative to the obstruction.
 * - **How the Dust Storm interacts.** pg 122 halves a sprint; pg 117 ends one in
 *   difficult terrain; sprinting through difficult terrain in a dust storm
 *   triggers both and the book resolves neither. Ruled as orthogonal — the storm
 *   sets the distance the sprint *would* cover, the terrain cuts it short — since
 *   they act on different quantities and both can therefore apply without either
 *   being overruled.
 * - **A Robobrain's All Terrain Rollers (pg 11)** removes "extra AP to move
 *   through difficult terrain" and says nothing about sprinting. A sprinting
 *   Robobrain's movement still ends, as printed.
 */
export function sprint(options: { halved?: boolean; difficultTerrain?: boolean } = {}): SprintReport {
  const halved = options.halved ?? false;
  return {
    ap: SPRINT_AP_COST,
    feet: sprintDistanceFeet(halved),
    halved,
    terrainEnds: options.difficultTerrain ?? false,
    // pg 127, verbatim: "you do not regain any action points".
    refund: 0,
  };
}

// --------------------------------------------------------------------- falling

export const CREATURE_SIZES = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
] as const;
export type CreatureSize = (typeof CREATURE_SIZES)[number];

/** The default size for anything this system ships: every PC race is Medium. */
export const DEFAULT_CREATURE_SIZE: CreatureSize = "medium";

export interface FallProfile {
  /** Feet fallen on the first turn of the fall. */
  readonly firstTurnFeet: number;
  /** Feet fallen on every turn after the first. */
  readonly perTurnFeet: number;
  /** The damage die, or "" where the size takes no damage. */
  readonly die: string;
  /** How many dice per `perFeet` feet fallen. */
  readonly dicePerIncrement: number;
  /** The distance increment damage is counted in. */
  readonly perFeet: number;
  /** The printed ceiling on the dice pool. */
  readonly maxDice: number;
  /** Whether the landing knocks the creature prone. */
  readonly prone: boolean;
  /**
   * What the landing inflicts, and on what trigger:
   * - `armAndLeg` — one arm condition **and** one leg condition, when the damage
   *   reaches hit points.
   * - `armOrLeg` — a single condition on one limb or the other, on distance
   *   alone. Tiny only.
   */
  readonly limbConditions: "armAndLeg" | "armOrLeg";
  /** Tiny only: the distance past which it gains its one condition. */
  readonly conditionBeyondFeet?: number;
}

/**
 * Falling, by size (pg 117-118).
 *
 * > A creature's falling speed and damage it takes at the end of a fall depends
 * > on its size.
 *
 * Read off the rendered page. Three things worth flagging in the printing
 * itself:
 *
 * 1. **The Huge entry says "a large creature lands prone."** It is under the
 *    Huge heading, between Large and Gargantuan, with Huge's own numbers on
 *    either side of the phrase. A copy-paste from the Large paragraph; read as
 *    Huge.
 * 2. **Tiny is worded differently on purpose.** Every other size says the
 *    creature gains "a random arm **and** leg condition" *if the damage reaches
 *    hit points*; Tiny takes no damage at all and instead gains "one random arm
 *    **or** leg limb condition" if it falls more than 50 feet. Two different
 *    triggers and two different outcomes, and the and/or contrast is what
 *    settles the ambiguity for the other five rows — see `limbConditions`.
 * 3. **Huge and Gargantuan count damage per 20 feet**, not per 10 like everyone
 *    smaller. Not a slip: their dice are bigger too.
 *
 * The caps imply maximum meaningful fall distances — 1,200 ft for a Small
 * creature, 1,500 for Medium, 1,200 for Large, 3,300 for Huge, 4,000 for
 * Gargantuan — which are not printed as distances anywhere and fall out of the
 * arithmetic. Note Large caps at a *shorter* fall than Medium does. As printed.
 */
export const FALL_PROFILES: Record<CreatureSize, FallProfile> = {
  tiny: {
    firstTurnFeet: 25,
    perTurnFeet: 50,
    die: "",
    dicePerIncrement: 0,
    perFeet: 0,
    maxDice: 0,
    // "a tiny creature takes no damage unless they land on something hazardous"
    // — the hazard is the GM's to adjudicate and is reported, never rolled.
    prone: false,
    limbConditions: "armOrLeg",
    conditionBeyondFeet: 50,
  },
  small: {
    firstTurnFeet: 400,
    perTurnFeet: 800,
    die: "d4",
    dicePerIncrement: 1,
    perFeet: 10,
    maxDice: 120,
    prone: true,
    limbConditions: "armAndLeg",
  },
  medium: {
    firstTurnFeet: 500,
    perTurnFeet: 1000,
    die: "d6",
    dicePerIncrement: 1,
    perFeet: 10,
    maxDice: 150,
    prone: true,
    limbConditions: "armAndLeg",
  },
  large: {
    firstTurnFeet: 800,
    perTurnFeet: 1600,
    die: "d6",
    dicePerIncrement: 2,
    perFeet: 10,
    maxDice: 240,
    prone: true,
    limbConditions: "armAndLeg",
  },
  huge: {
    firstTurnFeet: 1100,
    perTurnFeet: 2200,
    die: "d10",
    dicePerIncrement: 2,
    perFeet: 20,
    maxDice: 330,
    prone: true,
    limbConditions: "armAndLeg",
  },
  gargantuan: {
    firstTurnFeet: 2000,
    perTurnFeet: 4000,
    die: "d10",
    dicePerIncrement: 4,
    perFeet: 20,
    maxDice: 800,
    prone: true,
    limbConditions: "armAndLeg",
  },
};

/** Falling damage is impact damage (pg 118); `impact` is a shipped damage type. */
export const FALL_DAMAGE_TYPE = "impact";

/**
 * How far a creature has fallen after N turns in the air (pg 117-118).
 *
 * > A medium creature falls 500 feet on its first turn, then every sequential
 * > turn it falls 1000 feet.
 *
 * Reported, not simulated: nothing in this system moves a token downwards or
 * counts turns for it. This exists so a GM running a long fall can ask how far
 * the body has gone by turn three rather than doing it on paper.
 */
export function fallDistanceAfterTurns(size: CreatureSize, turns: number): number {
  const profile = FALL_PROFILES[size];
  const whole = Math.max(0, Math.floor(turns));
  if (whole <= 0) return 0;
  return profile.firstTurnFeet + (whole - 1) * profile.perTurnFeet;
}

/** How many dice a fall of this distance rolls, capped at the printed maximum. */
export function fallDamageDice(size: CreatureSize, feet: number): number {
  const profile = FALL_PROFILES[size];
  if (profile.perFeet <= 0) return 0;
  const raw = Math.floor(Math.max(0, feet) / profile.perFeet) * profile.dicePerIncrement;
  return Math.min(profile.maxDice, raw);
}

/** The damage formula, or "" when the fall deals none (Tiny, or a short drop). */
export function fallDamageFormula(size: CreatureSize, feet: number): string {
  const dice = fallDamageDice(size, feet);
  if (dice <= 0) return "";
  return `${String(dice)}${FALL_PROFILES[size].die}`;
}

export interface FallOutcome {
  size: CreatureSize;
  feet: number;
  /** "" when nothing is rolled. */
  formula: string;
  dice: number;
  /** True when the printed dice ceiling clipped the pool. */
  capped: boolean;
  prone: boolean;
  /** Tiny past 50 feet gains its condition without any damage being dealt. */
  conditionOnDistance: boolean;
  /** The rest gain theirs only when the damage reaches hit points. */
  conditionOnHitPoints: boolean;
  /** Whether the landing inflicts one condition or one per limb. */
  limbConditions: FallProfile["limbConditions"];
}

/** Everything a declared fall does, before any dice are rolled. */
export function fallOutcome(size: CreatureSize, feet: number): FallOutcome {
  const profile = FALL_PROFILES[size];
  const distance = Math.max(0, Math.floor(feet));
  const dice = fallDamageDice(size, distance);
  const beyond = profile.conditionBeyondFeet;
  return {
    size,
    feet: distance,
    formula: fallDamageFormula(size, distance),
    dice,
    capped: dice > 0 && dice >= profile.maxDice,
    prone: profile.prone,
    conditionOnDistance: beyond !== undefined && distance > beyond,
    conditionOnHitPoints: profile.limbConditions === "armAndLeg",
    limbConditions: profile.limbConditions,
  };
}

// ----------------------------------------------------------------- travel pace

export const TRAVEL_PACES_ORDER = ["slow", "normal", "fast"] as const;
export type TravelPace = (typeof TRAVEL_PACES_ORDER)[number];

export interface TravelPaceDefinition {
  /** The printed day's distance, which assumes the base eight hours. */
  readonly miles: number;
  /** The printed speed. `miles / mph` is exactly 8 for all three rows. */
  readonly mph: number;
  /** Passive Sneak is this plus the party's average Group Sneak bonus. */
  readonly sneakBase: number;
  /** What the pace does to Combat Sequence rolls. */
  readonly combatSequence: "advantage" | "disadvantage" | null;
}

/**
 * The Travel Pace table (pg 116), read as a rendered page image.
 *
 * | Speed | Distance | Passive Sneak | Effect |
 * |---|---|---|---|
 * | Slow | 18 miles (2.25 mph) | 15 + Average Group Sneak Bonus | Advantage on Combat Sequence rolls |
 * | Normal | 24 miles (3 mph) | 12 + Average Group Sneak Bonus | – |
 * | Fast | 30 miles (3.75 mph) | 10 + Average Group Sneak Bonus | Disadvantage on Combat Sequence rolls |
 *
 * Every row is exactly eight hours of walking, which is what ties the distance
 * column to the Traveling Limits rule below it.
 */
export const TRAVEL_PACES: Record<TravelPace, TravelPaceDefinition> = {
  slow: { miles: 18, mph: 2.25, sneakBase: 15, combatSequence: "advantage" },
  normal: { miles: 24, mph: 3, sneakBase: 12, combatSequence: null },
  fast: { miles: 30, mph: 3.75, sneakBase: 10, combatSequence: "disadvantage" },
};

/** The base day the printed distances assume: 18 / 2.25 = 24 / 3 = 30 / 3.75 = 8. */
export const TRAVEL_BASE_HOURS = 8;

/**
 * "Each character can travel a number of hours equal to 8 + half their endurance
 * modifier (rounded down)" (pg 116).
 *
 * Floored at zero: a modifier of −16 is unreachable for a PC (scores run 1-10,
 * so the modifier bottoms out at −4) but creature scores go to 20 and nothing
 * stops a GM from setting one, and a negative hour limit would make every
 * journey infinitely fatiguing.
 */
export function travelHourLimit(enduranceModifier: number): number {
  return Math.max(0, TRAVEL_BASE_HOURS + Math.floor(enduranceModifier / 2));
}

/**
 * Passive Sneak while travelling (pg 116): the pace's base plus the party's
 * average Group Sneak bonus.
 *
 * > Creatures whose passive sense is lower than their score cannot detect the
 * > party while they travel unless (to GM's discretion) the party blows their
 * > cover…
 *
 * The average is `currentGroupSneak()` in `src/rules/party.ts`, which already
 * computes it for the sheet; this takes it as a number so the module stays pure.
 */
export function passiveSneak(pace: TravelPace, averageGroupSneakBonus: number): number {
  return TRAVEL_PACES[pace].sneakBase + averageGroupSneakBonus;
}

export const TRAVEL_MODES = ["foot", "mount", "driving", "passenger"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

/** "their maximum travel distance is doubled" for a driver (pg 116). */
export const VEHICLE_DISTANCE_MULTIPLIER = 2;
/** A gallop lasts an hour and covers twice a fast pace's distance (pg 116). */
export const GALLOP_HOURS = 1;
export const GALLOP_DISTANCE_MULTIPLIER = 2;
/** "However, their mount gains one level of fatigue." */
export const GALLOP_MOUNT_FATIGUE = 1;

/**
 * A character's **maximum travel distance** in miles.
 *
 * ## The book never defines this term, and uses it four times
 *
 * "Maximum travel distance" appears in the mount rule ("they use the mount's
 * maximum travel distance instead of their own"), the vehicle rule ("their
 * maximum travel distance is doubled"), and The Roads Walked keys fatigue off
 * "half their maximum distance (rounded down)". The Travel Pace table has a
 * Distance column; the Traveling Limits rule has an hours limit. Neither is
 * labelled "maximum travel distance".
 *
 * **Ruling: it is the pace's speed times the character's own hour limit.**
 * `mph × (8 + half END mod)`. Reasons:
 *
 * - It is the only reading under which the hours rule and the distance rule
 *   describe the same journey. Read the other way — maximum distance is just the
 *   table's 18/24/30 — the Traveling Limits rule would let a tough character
 *   walk extra hours that add no distance.
 * - It reproduces the printed table exactly at an Endurance modifier of 0, which
 *   is what the table's own `miles ÷ mph = 8` says it was built from.
 *
 * This is an inference. It is not printed, and a table that reads the Distance
 * column as a flat cap loses nothing but the Endurance interaction.
 *
 * `mountMiles` substitutes the beast's own figure wholesale, as the mount rule
 * says to; a driver doubles whatever the base was.
 */
export function maxTravelDistanceMiles(
  pace: TravelPace,
  enduranceModifier: number,
  mode: TravelMode,
  mountMiles?: number,
): number {
  if (mode === "mount" && mountMiles !== undefined) return mountMiles;
  const base = TRAVEL_PACES[pace].mph * travelHourLimit(enduranceModifier);
  return mode === "driving" ? base * VEHICLE_DISTANCE_MULTIPLIER : base;
}

/** A gallop: one hour, twice a fast pace's hourly distance (pg 116). */
export function gallopMiles(): number {
  return TRAVEL_PACES.fast.mph * GALLOP_HOURS * GALLOP_DISTANCE_MULTIPLIER;
}

export interface TravelPlan {
  pace: TravelPace;
  mode: TravelMode;
  terrain: TerrainTier;
  hours: number;
  /** The character's own hour limit (pg 116). */
  hourLimit: number;
  /** Hours past that limit, each of which is a level of fatigue. */
  overHours: number;
  /** Miles actually covered, after the terrain divisor. */
  miles: number;
  /** The maximum distance the mode allows — see `maxTravelDistanceMiles`. */
  maxMiles: number;
  /** The Roads Walked threshold: half the maximum, rounded down. */
  roadsWalkedMiles: number;
  /** Levels of fatigue from travelling past the hour limit. */
  overageFatigue: number;
  /** One level for walking at least half your maximum distance, on foot. */
  roadsWalkedFatigue: number;
  /** Both of the above. */
  fatigue: number;
  /** Passive Sneak for the pace, given the party's average Sneak bonus. */
  passiveSneak: number;
  /** What the pace does to Combat Sequence rolls. */
  combatSequence: "advantage" | "disadvantage" | null;
  /** True when the mode exempts the traveller from fatigue entirely. */
  fatigueExempt: boolean;
}

/**
 * A day's travel, priced (pg 116).
 *
 * Three fatigue rules, and they do different things:
 *
 * - **Traveling Limits.** *"For each hour traveled beyond their maximum,
 *   characters gain one additional level of fatigue."* Hours, not miles.
 * - **The Roads Walked.** *"Regardless of pace or how long the characters walk,
 *   each character gains a level of fatigue when they travel **on foot** for at
 *   least half their maximum distance (rounded down)."* Miles, not hours, and
 *   explicitly on foot.
 * - **Vehicles and Mounts.** The exemptions, below.
 *
 * ## The passenger contradiction
 *
 * The chapter's opening sentence on the subject says *"Characters who ride in a
 * caravan, on the back of a beast, or drive a vehicle have the luxury of not
 * becoming fatigued at the end of their journey"* — three conveyances, all
 * exempt. Its last sentence says the vehicle rule *"does not apply to any
 * characters riding in a vehicle that they are not driving."*
 *
 * Riding in a caravan is named as exempt in the first sentence and excluded by
 * the last. **Ruled for the first**: a passenger is exempt from travel fatigue,
 * and what the last sentence denies them is the *driver's doubled distance*,
 * which is the other thing that sentence's paragraph grants. That reading leaves
 * both sentences meaning something; the other reading has the book listing
 * caravan passengers as a fatigue-free way to travel and then charging them
 * fatigue. The contradiction is printed on the card either way, because a table
 * is entitled to read it the other way.
 *
 * A **mount** is flatly exempt ("gain no levels of fatigue for traveling") — both
 * clauses, not just The Roads Walked. A **driver** is printed as exempt only from
 * The Roads Walked ("they gain no levels of fatigue for traveling half their
 * maximum distance"); the opening sentence's blanket exemption is read as
 * covering the hours clause too, on the same grounds.
 *
 * Terrain divides the distance covered, never the hours: *"When traveling, the
 * distance traveled is halved when moving through difficult terrain"* (pg 116).
 * A route that is partly difficult has no printed resolution — this applies one
 * tier to the whole leg, which is the only thing a single dropdown can mean.
 */
export function travelPlan(options: {
  pace: TravelPace;
  hours: number;
  enduranceModifier: number;
  mode?: TravelMode;
  terrain?: TerrainTier;
  averageGroupSneakBonus?: number;
  mountMiles?: number;
}): TravelPlan {
  const pace = options.pace;
  const mode = options.mode ?? "foot";
  const terrain = options.terrain ?? "normal";
  const hours = Math.max(0, options.hours);
  const hourLimit = travelHourLimit(options.enduranceModifier);
  const overHours = Math.max(0, hours - hourLimit);

  const maxMiles = maxTravelDistanceMiles(pace, options.enduranceModifier, mode, options.mountMiles);
  const miles = (TRAVEL_PACES[pace].mph * hours) / TERRAIN_TRAVEL_DIVISOR[terrain];
  const roadsWalkedMiles = Math.floor(maxMiles / 2);

  const fatigueExempt = mode !== "foot";
  const overageFatigue = fatigueExempt ? 0 : overHours;
  const roadsWalkedFatigue = !fatigueExempt && miles >= roadsWalkedMiles && miles > 0 ? 1 : 0;

  return {
    pace,
    mode,
    terrain,
    hours,
    hourLimit,
    overHours,
    miles,
    maxMiles,
    roadsWalkedMiles,
    overageFatigue,
    roadsWalkedFatigue,
    fatigue: overageFatigue + roadsWalkedFatigue,
    passiveSneak: passiveSneak(pace, options.averageGroupSneakBonus ?? 0),
    combatSequence: TRAVEL_PACES[pace].combatSequence,
    fatigueExempt,
  };
}

// ---------------------------------------------------------------------- shared

/** Five-foot increments, with a partial one rounded up to a whole. */
function increments(feet: number): number {
  return Math.max(0, Math.ceil(Math.max(0, feet) / MOVE_INCREMENT_FEET));
}

export { SPRINT_AP_COST };
