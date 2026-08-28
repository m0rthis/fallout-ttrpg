/**
 * Explosives (pg 21, pg 78-79) — arming, throwing, throwing back, disarming,
 * and the sixteen printed devices.
 *
 * Pure functions only; nothing here writes a document or rolls a die.
 *
 * The chapter's spine is one table: you spend AP to arm and throw, roll a d20,
 * add your Explosives skill bonus, and the *total* decides whether the thing
 * goes off in your hand, lands short, lands and waits, or lands and detonates
 * this turn. Everything else — Arm DC, Throwback, Disarming, the area bands —
 * hangs off that.
 *
 * ## The book prints the throw table twice, and they disagree
 *
 * **pg 78** (the chapter, as a table):
 *
 * | 1 | 2-3 | 4-14 | 15+ |
 *
 * **pg 21** (the Explosives *skill* entry, as a sentence): *"If the total is a
 * 1 … If the total is a 2 or 3 … If the total is **between 3 and 14** … If the
 * result is a 15 or higher…"* — which claims 3 twice and leaves nothing at 4
 * unless "between" is read exclusively.
 *
 * `ARM_AND_THROW_BANDS` is **pg 78's table**: it is the chapter's own printing,
 * it is a table rather than a sentence, and it is the only one of the two that
 * partitions 1-20 without an overlap. pg 21 is not otherwise contradicted —
 * it agrees on every outcome, only on the boundaries.
 *
 * ## Both printings leave 13 undefined on a Throwback
 *
 * pg 21 and pg 78 both say a Throwback detonates immediately on *"a 12 or
 * below"* and at the end of your turn if the result is *"above an 13"*. A
 * total of exactly 13 is in neither band. Read here as **13 or higher
 * succeeds**, because that is the only reading under which the two clauses
 * cover the d20 — reading it strictly ("above 13" = 14+) would make 13 a result
 * with no printed consequence at all. Flagged, not smoothed:
 * `THROWBACK_UNDEFINED_TOTAL` names the number the book skipped.
 *
 * ## Throw distance: the book's two Strength rules
 *
 * pg 78 *Range*: "an explosive can be thrown a number of feet equal to your
 * Strength ability **modifier** multiplied by the number listed in the range
 * column." The parallel rule for melee weapons — pg 61 *Thrown* — says
 * "your Strength **score** multiplied by the numbers listed in the table".
 *
 * Ability scores run 1-10 and a modifier is `score − 5`, so pg 78 as printed
 * gives every character with Strength 5 or less a throw range of zero feet or
 * less: half the table cannot throw a grenade at all. `throwDistanceFeet` uses
 * the **score**, matching the melee rule this one is copied from;
 * `printedThrowDistanceFeet` keeps pg 78's arithmetic alive so a card can show
 * the table what the page actually asks for. This is our reading, not the
 * book's.
 */

/** How the roll's total resolves (pg 78). */
export type ArmAndThrowOutcome =
  /** "The explosive detonates immediately before you throw it." */
  | "inHand"
  /** "…thrown half the distance and detonates at the start of your next turn." */
  | "shortDelayed"
  /** "…detonates at the start of your next turn." */
  | "delayed"
  /** "…detonates at the end of your turn." */
  | "thisTurn";

interface ArmAndThrowBand {
  /** Inclusive lower bound on the total. */
  readonly min: number;
  /** Inclusive upper bound, or null for the open top band. */
  readonly max: number | null;
  readonly outcome: ArmAndThrowOutcome;
}

/** pg 78's table, in printed order. See the module note on pg 21's variant. */
export const ARM_AND_THROW_BANDS: readonly ArmAndThrowBand[] = [
  { min: 1, max: 1, outcome: "inHand" },
  { min: 2, max: 3, outcome: "shortDelayed" },
  { min: 4, max: 14, outcome: "delayed" },
  { min: 15, max: null, outcome: "thisTurn" },
];

/**
 * The outcome for a roll total.
 *
 * **The total, not the die.** pg 21 is explicit — "If the **total** is a 1" —
 * so the skill bonus is inside the comparison, and a character with any
 * positive Explosives bonus genuinely cannot blow themselves up on the throw.
 * That is the printed rule and it is not a natural-1 rule; the natural-1
 * critical failure of pg 128 is written for attack rolls, and an explosive
 * makes no attack roll at all ("Instead of making an attack roll…", pg 78).
 *
 * Totals below 1 (a negative Explosives bonus on a low roll) fall into the
 * first band, which is where the book's own ordering puts them.
 */
export function armAndThrowOutcome(total: number): ArmAndThrowOutcome {
  for (const band of ARM_AND_THROW_BANDS) {
    if (total >= band.min && (band.max === null || total <= band.max)) return band.outcome;
  }
  return "inHand";
}

/** True when the throw goes off in the thrower's hand (pg 21, 78). */
export function detonatesInHand(total: number): boolean {
  return armAndThrowOutcome(total) === "inHand";
}

/** "…thrown half the distance…" (pg 78) — rounding is not printed; halved as-is. */
export function throwDistanceForOutcome(distanceFeet: number, outcome: ArmAndThrowOutcome): number {
  return outcome === "shortDelayed" ? distanceFeet / 2 : distanceFeet;
}

// ---------------------------------------------------------------- throwback

/** "You can spend 4 AP to throw it" (pg 78). */
export const THROWBACK_AP_COST = 4;

/** The one total both printings of the Throwback rule omit. See the module note. */
export const THROWBACK_UNDEFINED_TOTAL = 13;

/**
 * Throwing back an explosive that is already armed (pg 21, pg 78).
 *
 * `"inHand"` on 12 or below, `"thisTurn"` from 13 up — see the module note for
 * why 13 is on the succeeding side.
 */
export function throwbackOutcome(total: number): Extract<ArmAndThrowOutcome, "inHand" | "thisTurn"> {
  return total <= 12 ? "inHand" : "thisTurn";
}

// --------------------------------------------------------------- arm / disarm

/**
 * The DC to arm a placed explosive: `10 + the Arm DC column` (pg 78).
 *
 * The column holds a **bonus, not a DC** — the same trap the Item Blueprint
 * Encyclopedia sets with its Repair and Craft columns (pg 92-93), and the
 * reason the field is called `armBonus` here.
 */
export function armDC(armBonus: number): number {
  return 10 + armBonus;
}

/**
 * "If your explosives skill bonus is equal to or greater than the noted bonus,
 * you automatically succeed" (pg 78) — a comparison against the *bonus*, not
 * against the DC.
 */
export function armsAutomatically(explosivesBonus: number, armBonus: number): boolean {
  return explosivesBonus >= armBonus;
}

/** "If you fail, the explosive detonates immediately" (pg 78). */
export function armOutcome(total: number, armBonus: number): "armed" | "inHand" {
  return total >= armDC(armBonus) ? "armed" : "inHand";
}

/** "you must spend 6 AP on your turn, be within 5 feet of the explosive" (pg 78). */
export const DISARM_AP_COST = 6;
export const DISARM_RANGE_FEET = 5;

/** "If you fail by 5 or more, the explosive detonates immediately" (pg 78). */
export const DISARM_CATASTROPHE_MARGIN = 5;

export type DisarmOutcome = "disarmed" | "unchanged" | "inHand";

/**
 * Disarming (pg 78). Three outcomes: disarmed, still running on its own clock,
 * or off right now.
 *
 * **The DC the book asks for does not exist.** pg 78 says the check is against
 * "10 + the **timed bonus** listed in the special properties column", but no
 * explosive in either table prints a property called Timed and the glossary
 * (pg 78-79) never defines one. The only per-row bonus printed anywhere near a
 * placed explosive is the **Arm DC** column, and disarming is that column's
 * rule run backwards, so that is what this takes. Named `armBonus` rather than
 * `timedBonus` so the substitution is visible at every call site. The
 * closest thing to a printed "time" is Long Fuse Dynamite's `Slow: 3 rounds
 * (18 seconds)`, which is a duration and not a bonus, so it cannot be it.
 */
export function disarmOutcome(total: number, armBonus: number): DisarmOutcome {
  const dc = armDC(armBonus);
  if (total >= dc) return "disarmed";
  return dc - total >= DISARM_CATASTROPHE_MARGIN ? "inHand" : "unchanged";
}

// ------------------------------------------------------------------- range

/**
 * How far this character can throw an explosive, in feet.
 *
 * Strength **score** × the range column. See the module note: pg 78 prints
 * "modifier", pg 61's identical rule for melee weapons prints "score", and
 * only the score leaves the rule working.
 */
export function throwDistanceFeet(strengthScore: number, multiplier: number): number {
  return Math.max(0, strengthScore * multiplier);
}

/** What pg 78 asks for, verbatim, so a card can show both. */
export function printedThrowDistanceFeet(strengthModifier: number, multiplier: number): number {
  return Math.max(0, strengthModifier * multiplier);
}

// -------------------------------------------------------------------- area

/** The two radii of the Area of Effect column (pg 78). */
export interface ExplosiveArea {
  /** Everything inside this takes full damage. */
  readonly fullFeet: number;
  /** Everything between takes half; null when only one number is printed. */
  readonly halfFeet: number | null;
}

/**
 * What a creature that far from the blast takes (pg 78). Full cover is a
 * separate question the cover rules already answer, so it is not asked here.
 */
export function damageBandAt(distanceFeet: number, area: ExplosiveArea): "full" | "half" | "none" {
  if (distanceFeet <= area.fullFeet) return "full";
  if (area.halfFeet !== null && distanceFeet <= area.halfFeet) return "half";
  return "none";
}

/** "The AC of an explosive is always 18" (pg 78). */
export const EXPLOSIVE_AC = 18;

/**
 * "If an explosive takes at least 1 point of ballistic, explosive, fire, laser,
 * or plasma damage; it detonates" (pg 78). Members of `DAMAGE_TYPES`.
 */
export const EARLY_DETONATION_DAMAGE_TYPES: readonly string[] = [
  "ballistic",
  "explosive",
  "fire",
  "laser",
  "plasma",
];

export function detonatesFromDamage(damageType: string, amount: number): boolean {
  return amount >= 1 && EARLY_DETONATION_DAMAGE_TYPES.includes(damageType);
}

// ------------------------------------------------------- special properties

/** "…for a number of rounds equal to 4 - their Endurance ability modifier to a minimum of 1." */
export function senseLossRounds(enduranceModifier: number): number {
  return Math.max(1, 4 - enduranceModifier);
}

/** "When you roll a 1 on the damage dice … it is a 2 instead" (Destructive, pg 78). */
export function destructiveDie(rolled: number): number {
  return rolled === 1 ? 2 : rolled;
}

/** "you can spend 3 AP on your turn to detonate the explosive" (Detonator, pg 78). */
export const DETONATOR_AP_COST = 3;

/** "Each explosive's proximity area is a 10 foot radius" (Proximity, pg 79). */
export const PROXIMITY_RADIUS_FEET = 10;

/** "The smoke lasts for 1 minute" (Smoke, pg 79). */
export const SMOKE_DURATION_MINUTES = 1;

export type ExplosiveProperty =
  | { readonly kind: "blinding"; readonly feet: number }
  | { readonly kind: "deafening"; readonly feet: number }
  | { readonly kind: "destructive" }
  | { readonly kind: "detonator" }
  | { readonly kind: "dismember" }
  | { readonly kind: "electromagnetic" }
  | { readonly kind: "freezing" }
  | { readonly kind: "incendiary" }
  | { readonly kind: "mangle" }
  | { readonly kind: "proximity" }
  | { readonly kind: "shattering" }
  | { readonly kind: "slow"; readonly rounds: number };

export function hasProperty(
  explosive: ExplosiveDefinition,
  kind: ExplosiveProperty["kind"],
): boolean {
  return explosive.properties.some((property) => property.kind === kind);
}

/**
 * Shattering (pg 79) overrides the roll outright: "the explosive always
 * detonates at the end of your turn regardless of your explosive roll."
 *
 * Read as beating every band including the 1 — "regardless of your explosive
 * roll" admits no exception, and the Molotov Cocktail is the only explosive
 * carrying it, which is exactly the device that goes off on impact.
 */
export function outcomeWithProperties(
  total: number,
  explosive: ExplosiveDefinition,
): ArmAndThrowOutcome {
  return hasProperty(explosive, "shattering") ? "thisTurn" : armAndThrowOutcome(total);
}

// ------------------------------------------------------------- the sixteen

export interface ExplosiveDamage {
  readonly formula: string;
  /** A member of `DAMAGE_TYPES`, or "" where the book prints something else. */
  readonly type: string;
}

export interface ExplosiveDefinition {
  readonly key: string;
  /** Matches the shipped gear document exactly, so the sheet can join. */
  readonly name: string;
  readonly kind: "thrown" | "placed";
  readonly cost: number;
  readonly apCost: number;
  readonly damage: readonly ExplosiveDamage[];
  /** Thrown only: the Range column's multiplier. */
  readonly rangeMultiplier?: number;
  /** Placed only: the Arm DC column, which is a bonus (pg 78). */
  readonly armBonus?: number;
  readonly area: ExplosiveArea;
  readonly properties: readonly ExplosiveProperty[];
  readonly load: number;
  /** Anything the damage column prints that is not dice. */
  readonly rider?: string;
}

/**
 * The pg 79 tables, both read off a 150 dpi render of the page.
 *
 * The gear documents (`packs-src/gear.json`) carry the same rows as prose
 * because their table shape does not fit the weapon schema; this is the same
 * data typed, so the rules can ask it questions. Names match the documents.
 */
export const EXPLOSIVES: readonly ExplosiveDefinition[] = [
  {
    key: "dynamite",
    name: "Dynamite",
    kind: "thrown",
    cost: 50,
    apCost: 6,
    damage: [{ formula: "3d6", type: "explosive" }],
    rangeMultiplier: 6,
    area: { fullFeet: 5, halfFeet: 20 },
    properties: [{ kind: "deafening", feet: 10 }, { kind: "destructive" }],
    load: 3,
  },
  {
    key: "molotovCocktail",
    name: "Molotov Cocktail",
    kind: "thrown",
    cost: 20,
    apCost: 6,
    damage: [{ formula: "3d10", type: "fire" }],
    rangeMultiplier: 6,
    area: { fullFeet: 5, halfFeet: null },
    properties: [{ kind: "incendiary" }, { kind: "shattering" }],
    load: 4,
  },
  {
    key: "fragGrenade",
    name: "Frag Grenade",
    kind: "thrown",
    cost: 150,
    apCost: 5,
    damage: [{ formula: "4d6", type: "explosive" }],
    rangeMultiplier: 10,
    area: { fullFeet: 5, halfFeet: 20 },
    properties: [{ kind: "deafening", feet: 10 }, { kind: "destructive" }, { kind: "dismember" }],
    load: 3,
  },
  {
    key: "plasmaGrenade",
    name: "Plasma Grenade",
    kind: "thrown",
    cost: 250,
    apCost: 4,
    damage: [{ formula: "4d8", type: "plasma" }],
    rangeMultiplier: 10,
    area: { fullFeet: 10, halfFeet: null },
    // The Special Properties cell is printed "-".
    properties: [],
    load: 4,
  },
  {
    key: "pulseGrenade",
    name: "Pulse Grenade",
    kind: "thrown",
    cost: 150,
    apCost: 4,
    damage: [{ formula: "2d8", type: "electricity" }],
    rangeMultiplier: 10,
    area: { fullFeet: 15, halfFeet: null },
    properties: [{ kind: "electromagnetic" }],
    load: 4,
  },
  {
    key: "incendiaryGrenade",
    name: "Incendiary Grenade",
    kind: "thrown",
    cost: 125,
    apCost: 5,
    damage: [
      { formula: "2d6", type: "explosive" },
      { formula: "3d6", type: "fire" },
    ],
    rangeMultiplier: 10,
    area: { fullFeet: 5, halfFeet: 15 },
    properties: [{ kind: "deafening", feet: 5 }, { kind: "incendiary" }],
    load: 3,
  },
  {
    key: "cryogenicGrenade",
    name: "Cryogenic Grenade",
    kind: "thrown",
    cost: 125,
    apCost: 4,
    damage: [
      { formula: "2d6", type: "explosive" },
      { formula: "3d6", type: "cold" },
    ],
    rangeMultiplier: 10,
    area: { fullFeet: 5, halfFeet: 10 },
    properties: [{ kind: "deafening", feet: 5 }, { kind: "freezing" }],
    load: 4,
  },
  {
    key: "flashBang",
    name: "Flash Bang",
    kind: "thrown",
    cost: 25,
    apCost: 5,
    // Printed as a flat "1 explosive", not dice.
    damage: [{ formula: "1", type: "explosive" }],
    rangeMultiplier: 10,
    area: { fullFeet: 20, halfFeet: null },
    properties: [{ kind: "blinding", feet: 20 }, { kind: "deafening", feet: 20 }],
    load: 3,
  },
  {
    key: "longFuseDynamite",
    name: "Long Fuse Dynamite",
    kind: "placed",
    cost: 100,
    apCost: 6,
    damage: [{ formula: "3d6", type: "explosive" }],
    armBonus: 1,
    area: { fullFeet: 5, halfFeet: 15 },
    properties: [
      { kind: "deafening", feet: 10 },
      { kind: "destructive" },
      { kind: "slow", rounds: 3 },
    ],
    load: 3,
  },
  {
    key: "fragMine",
    name: "Frag Mine",
    kind: "placed",
    cost: 140,
    apCost: 6,
    damage: [{ formula: "6d6", type: "explosive" }],
    armBonus: 4,
    // The only fractional radius in either table.
    area: { fullFeet: 2.5, halfFeet: 10 },
    properties: [
      { kind: "proximity" },
      { kind: "deafening", feet: 10 },
      { kind: "destructive" },
      { kind: "dismember" },
    ],
    load: 8,
  },
  {
    key: "plasmaMine",
    name: "Plasma Mine",
    kind: "placed",
    cost: 180,
    apCost: 6,
    damage: [{ formula: "4d8", type: "plasma" }],
    armBonus: 6,
    area: { fullFeet: 10, halfFeet: null },
    properties: [{ kind: "proximity" }],
    load: 8,
  },
  {
    key: "pulseMine",
    name: "Pulse Mine",
    kind: "placed",
    cost: 80,
    apCost: 6,
    damage: [{ formula: "3d8", type: "electricity" }],
    armBonus: 6,
    area: { fullFeet: 20, halfFeet: null },
    properties: [{ kind: "electromagnetic" }, { kind: "proximity" }],
    load: 6,
  },
  {
    key: "bottlecapMine",
    name: "Bottlecap Mine",
    kind: "placed",
    cost: 250,
    apCost: 6,
    damage: [
      { formula: "4d6", type: "explosive" },
      { formula: "6d6", type: "slashing" },
    ],
    armBonus: 2,
    area: { fullFeet: 5, halfFeet: 20 },
    properties: [
      { kind: "proximity" },
      { kind: "deafening", feet: 10 },
      { kind: "destructive" },
      { kind: "mangle" },
    ],
    load: 10,
  },
  {
    key: "cryoMine",
    name: "Cryo Mine",
    kind: "placed",
    cost: 140,
    apCost: 6,
    damage: [{ formula: "4d6", type: "cold" }],
    armBonus: 8,
    area: { fullFeet: 10, halfFeet: null },
    properties: [{ kind: "freezing" }, { kind: "proximity" }],
    load: 8,
  },
  {
    key: "c4PlasticExplosive",
    // Capitalised exactly as printed, and exactly as the gear document is named.
    name: "C-4 plastic Explosive",
    kind: "placed",
    cost: 350,
    apCost: 6,
    damage: [{ formula: "15d6", type: "explosive" }],
    armBonus: 10,
    area: { fullFeet: 5, halfFeet: 25 },
    properties: [
      { kind: "deafening", feet: 10 },
      { kind: "destructive" },
      { kind: "detonator" },
      { kind: "dismember" },
    ],
    load: 12,
  },
  {
    key: "nukeMine",
    name: "Nuke Mine",
    kind: "placed",
    cost: 600,
    apCost: 6,
    damage: [{ formula: "12d10", type: "explosive" }],
    armBonus: 10,
    area: { fullFeet: 45, halfFeet: null },
    properties: [{ kind: "destructive" }, { kind: "proximity" }],
    load: 22,
    rider: "and two levels of rads",
  },
];

export const EXPLOSIVE_KEYS: readonly string[] = EXPLOSIVES.map((explosive) => explosive.key);

export function getExplosive(key: string): ExplosiveDefinition | undefined {
  return EXPLOSIVES.find((explosive) => explosive.key === key);
}

/** The device behind a gear document, matched on the printed name. */
export function explosiveByName(name: string): ExplosiveDefinition | undefined {
  const wanted = name.trim().toLowerCase();
  return EXPLOSIVES.find((explosive) => explosive.name.toLowerCase() === wanted);
}
