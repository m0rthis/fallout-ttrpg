/**
 * Diseases (v2.1 pg 120) — a chapter that did not exist in v2.0.
 *
 * The printed chapter is a single twenty-row table: name, effect, duration,
 * cure. Everything here is that table, plus the three things the book leaves
 * implicit:
 *
 * - **Durations key off the Endurance *score*, not the modifier**, and the
 *   column is inconsistent: the hour rows print no minimum, the day rows print
 *   "(minimum 1)" — except The Woopsies, which omits it. Both quirks are kept
 *   rather than smoothed over, so a very tough character genuinely shrugs off
 *   an hours-long disease immediately.
 * - **No "random disease" table is printed**, though three rules call for one
 *   (Toxic Water, Toxic Air, the Tainted food property). The table has exactly
 *   twenty rows in alphabetical order, so a d20 over that order is the obvious
 *   reading; it is our inference, and `RANDOM_DISEASE_DIE` marks it as such.
 * - **Fever's Med-X entry is a suppression, not a cure** (1d4 hours), so a
 *   disease needs a suppression clock separate from its duration.
 *
 * Cures that read "and an hour" are a wait after the dose, not a second dose.
 */

import type { LeveledCondition } from "./constants";
import type { AdvantageCategory } from "./effects";

/** How long a disease runs, before any cure. */
export type DiseaseDuration =
  /** `base − END score` hours, with no printed minimum. */
  | { kind: "endHours"; base: number }
  /** `base − END score` days; `min` is printed on every row but The Woopsies. */
  | { kind: "endDays"; base: number; min?: number }
  /** "2 days if END ≥ 6, 4 days if END ≤ 5." */
  | { kind: "tieredDays"; threshold: number; atOrAbove: number; below: number }
  /** "You are no longer affected after you sleep." */
  | { kind: "sleep" };

/** What ends a disease early. */
export type DiseaseCure =
  /** N doses of a named consumable; `spacingHours` enforces "one day apart". */
  | { kind: "item"; item: string; doses: number; spacingHours?: number; waitHours?: number }
  /** Any food or chem carrying a property (Stimulant, Sedative). */
  | { kind: "property"; property: string }
  /** Med-X against a Fever: hides the effects for a while, does not cure. */
  | { kind: "suppress"; item: string; formula: string }
  /** Ends on a night's sleep, sometimes conditionally. */
  | { kind: "sleep"; requiresNoDehydration?: boolean }
  /** The Woopsies: a Nuka-Cola Quantum, or 2d20 caps thrown into water. */
  | { kind: "special" };

/** What a disease reacts to when its host takes hit-point damage. */
export type DiseaseTrigger =
  /** Blood worms: an extra 1d4 poison damage. */
  | "poisonDamage"
  /** Bone worms: a random limb condition (d6). */
  | "limbCondition"
  /** Glowing pustules: a level of Rads to you and everything within 10 feet. */
  | "radsNearby"
  /** Weeping sores: a level of Bleeding. */
  | "bleeding";

export interface DiseaseEffects {
  /** Categories the disease imposes disadvantage on. */
  disadvantage?: readonly AdvantageCategory[];
  /** Condition levels granted that cannot be removed while it lasts. */
  lockedConditions?: Partial<Record<LeveledCondition, number>>;
  /** Maximum AP reduction, never below DISEASE_AP_FLOOR. */
  apMaxPenalty?: number;
  /** Hard cap on feet moved per turn. */
  moveCapFeet?: number;
  /** Extra AP an attack costs, by weapon reach. */
  attackApSurcharge?: { ranged?: number; melee?: number };
  /** Ranged damage reduction, never below 1 total. */
  rangedDamagePenalty?: number;
  /** Needle spine: carry load halved. */
  carryLoadHalved?: boolean;
  /** Fires when the host takes damage to hit points. */
  onHpDamage?: DiseaseTrigger;
  /** Rad worms: a level of Rads every time you sleep. */
  radsOnSleep?: boolean;
}

export interface DiseaseDefinition {
  readonly key: string;
  readonly duration: DiseaseDuration;
  readonly cure: DiseaseCure;
  readonly effects: DiseaseEffects;
}

/**
 * Fever and Sludge lung both reduce maximum AP "to a minimum of 6" — the floor
 * is on the reduction, not on the character, so it never raises a total that
 * other penalties have already pushed lower.
 */
export const DISEASE_AP_FLOOR = 6;

/** Rattle hands cannot reduce ranged damage below this. */
export const MINIMUM_DAMAGE = 1;

/** Bone worms roll a d6 for the limb; the faces are the targeted-attack limbs. */
export const LIMB_DIE = "1d6";
export const LIMB_ORDER = ["eyes", "head", "arms", "legs", "torso", "groin"] as const;

/** Glowing pustules irradiate everything this close (pg 120). */
export const PUSTULE_RADIUS_FEET = 10;

/**
 * The twenty diseases, in the book's alphabetical order — which is also the
 * order a random-disease roll indexes into.
 */
export const DISEASES = [
  {
    key: "bloodWorms",
    duration: { kind: "endHours", base: 12 },
    cure: { kind: "item", item: "antibiotic", doses: 1, waitHours: 1 },
    effects: { onHpDamage: "poisonDamage" },
  },
  {
    key: "boneWorms",
    duration: { kind: "endHours", base: 12 },
    cure: { kind: "item", item: "antibiotic", doses: 1, waitHours: 1 },
    effects: { onHpDamage: "limbCondition" },
  },
  {
    key: "buzzBrain",
    duration: { kind: "sleep" },
    cure: { kind: "property", property: "stimulant" },
    effects: { disadvantage: ["intelligence"] },
  },
  {
    key: "dysentery",
    duration: { kind: "endDays", base: 15, min: 1 },
    cure: { kind: "item", item: "antibiotic", doses: 2, spacingHours: 24 },
    effects: { lockedConditions: { dehydration: 4 } },
  },
  {
    key: "fever",
    duration: { kind: "tieredDays", threshold: 6, atOrAbove: 2, below: 4 },
    cure: { kind: "suppress", item: "med-x", formula: "1d4" },
    effects: { apMaxPenalty: 3, disadvantage: ["all"] },
  },
  {
    key: "flapLimb",
    duration: { kind: "sleep" },
    cure: { kind: "item", item: "stimpak", doses: 1 },
    effects: { disadvantage: ["strength"] },
  },
  {
    key: "glowingPustules",
    duration: { kind: "endDays", base: 15, min: 1 },
    cure: { kind: "item", item: "antibiotic", doses: 2, spacingHours: 24 },
    effects: { onHpDamage: "radsNearby" },
  },
  {
    key: "heatFlashes",
    duration: { kind: "endHours", base: 12 },
    cure: { kind: "sleep", requiresNoDehydration: true },
    effects: { disadvantage: ["endurance"] },
  },
  {
    key: "jellyFingers",
    duration: { kind: "endHours", base: 12 },
    cure: { kind: "item", item: "antibiotic", doses: 1, waitHours: 1 },
    effects: { attackApSurcharge: { ranged: 1 } },
  },
  {
    key: "lockJoint",
    duration: { kind: "endHours", base: 12 },
    cure: { kind: "item", item: "antibiotic", doses: 1, waitHours: 1 },
    effects: { attackApSurcharge: { melee: 1 } },
  },
  {
    key: "needleSpine",
    duration: { kind: "tieredDays", threshold: 6, atOrAbove: 2, below: 4 },
    cure: { kind: "item", item: "med-x", doses: 1 },
    effects: { carryLoadHalved: true },
  },
  {
    key: "parasites",
    duration: { kind: "tieredDays", threshold: 6, atOrAbove: 2, below: 4 },
    cure: { kind: "item", item: "antibiotic", doses: 1, waitHours: 1 },
    effects: { lockedConditions: { hunger: 4 } },
  },
  {
    key: "radWorms",
    duration: { kind: "endDays", base: 12, min: 1 },
    cure: { kind: "item", item: "rad-away", doses: 2, spacingHours: 24 },
    effects: { radsOnSleep: true },
  },
  {
    key: "rattleHands",
    duration: { kind: "endDays", base: 12, min: 1 },
    cure: { kind: "property", property: "sedative" },
    effects: { rangedDamagePenalty: 2 },
  },
  {
    key: "sludgeLung",
    duration: { kind: "endDays", base: 12, min: 1 },
    cure: { kind: "item", item: "antibiotic", doses: 2, spacingHours: 24 },
    effects: { apMaxPenalty: 2, moveCapFeet: 20 },
  },
  {
    key: "snotEar",
    duration: { kind: "tieredDays", threshold: 6, atOrAbove: 2, below: 4 },
    cure: { kind: "item", item: "antibiotic", doses: 1, waitHours: 1 },
    effects: { disadvantage: ["perception"] },
  },
  {
    key: "swampGas",
    duration: { kind: "tieredDays", threshold: 6, atOrAbove: 2, below: 4 },
    cure: { kind: "item", item: "antibiotic", doses: 1, waitHours: 1 },
    effects: { disadvantage: ["charisma"] },
  },
  {
    key: "swampItch",
    duration: { kind: "tieredDays", threshold: 6, atOrAbove: 2, below: 4 },
    cure: { kind: "item", item: "antibiotic", doses: 1, waitHours: 1 },
    effects: { disadvantage: ["agility"] },
  },
  {
    key: "weepingSores",
    duration: { kind: "tieredDays", threshold: 6, atOrAbove: 2, below: 4 },
    cure: { kind: "item", item: "antibiotic", doses: 1, waitHours: 1 },
    effects: { onHpDamage: "bleeding" },
  },
  {
    key: "theWoopsies",
    // The only day-based row without a printed minimum, so END 12+ shrugs it
    // off at once. Kept as printed.
    duration: { kind: "endDays", base: 12 },
    cure: { kind: "special" },
    effects: { disadvantage: ["luck"] },
  },
] as const satisfies readonly DiseaseDefinition[];

export type DiseaseKey = (typeof DISEASES)[number]["key"];
export const DISEASE_KEYS: readonly DiseaseKey[] = DISEASES.map((disease) => disease.key);

/** Twenty rows, so a d20 indexes the table exactly. Our inference, not printed. */
export const RANDOM_DISEASE_DIE = `1d${String(DISEASES.length)}`;

export function findDisease(key: string): DiseaseDefinition | undefined {
  return DISEASES.find((disease) => disease.key === key);
}

export const HOURS_PER_DAY = 24;

/**
 * How long a freshly contracted disease runs, in hours.
 *
 * `null` means "until you sleep" — a clock cannot express it, and the rest
 * workflow clears it instead.
 */
export function diseaseDurationHours(
  duration: DiseaseDuration,
  enduranceScore: number,
): number | null {
  switch (duration.kind) {
    case "sleep":
      return null;
    case "endHours":
      // No printed minimum: END 12 really does clear it on contraction.
      return Math.max(0, duration.base - enduranceScore);
    case "endDays": {
      const days = duration.base - enduranceScore;
      return Math.max(duration.min ?? 0, days) * HOURS_PER_DAY;
    }
    case "tieredDays":
      return (
        (enduranceScore >= duration.threshold ? duration.atOrAbove : duration.below) * HOURS_PER_DAY
      );
  }
}

/** Whether a cure dose may be taken now, given how long ago the last one was. */
export function doseAllowed(cure: DiseaseCure, doses: number, hoursSinceDose: number): boolean {
  if (cure.kind !== "item") return false;
  if (doses >= cure.doses) return false;
  if (doses === 0) return true;
  return hoursSinceDose >= (cure.spacingHours ?? 0);
}

/** Normalize an item name for matching against a cure's required item. */
export function cureItemMatches(itemName: string, required: string): boolean {
  const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z]/g, "");
  const name = normalize(itemName);
  const want = normalize(required);
  // "Antibiotics" cures an "antibiotic" requirement, and "Stimpak (Super)"
  // still counts as a stimpak.
  return name.includes(want) || want.includes(name);
}
