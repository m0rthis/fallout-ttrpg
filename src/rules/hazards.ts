/**
 * Hazardous Environments (v2.1 pg 123) and Radiation Severity Scores (pg 124).
 *
 * Five hazard types, each a check on a clock. Two things the book never says
 * outright, both decided here and flagged in docs/rules-v2.1-environment.md:
 *
 * - **"Rad Resist check" is never defined.** It is used in three of these
 *   hazards, in the Power Armor section, and throughout the v2.0 stat blocks.
 *   It is the d20-vs-Radiation-DC roll of pg 124, and since only Humans have a
 *   Radiation DC, non-humans are simply exempt — the same reading v2.0 forced.
 * - **A gas mask is worthless in water.** The book says so explicitly for all
 *   three water hazards, and equally explicitly that it halves Toxic Air's DC
 *   and blocks disease there. The asymmetry is deliberate.
 *
 * Ice's "Agility or Luck check equal to 18" is a flat ability check, not a
 * skill check.
 */

export const HAZARD_TYPES = ["water", "toxicWater", "frigidWater", "ice", "toxicAir"] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

export interface HazardDefinition {
  /** Which roll the hazard demands. */
  readonly check: "radResist" | "endurance" | "agilityOrLuck";
  readonly dc?: number;
  /** How often it is rolled, when it is on a clock rather than a trigger. */
  readonly intervalMinutes?: number;
  /** A gas mask lowers the DC by this much — never in water. */
  readonly gasMaskDcRelief?: number;
  /** A gas mask blocks the disease entirely. */
  readonly gasMaskBlocksDisease?: boolean;
  /** Failing costs a level of this. */
  readonly failure: "rads" | "exhaustion" | "prone";
  /** A specific disease contracted at this roll or below. */
  readonly diseaseBelow?: { roll: number; disease: string };
  /** A random disease on a natural roll this low or lower. */
  readonly randomDiseaseAtOrBelow?: number;
  /** Frigid water: minutes of immersion tolerated before Hypothermia starts. */
  readonly hypothermiaAfterEnduranceMinutes?: boolean;
}

export const HAZARDS: Record<HazardType, HazardDefinition> = {
  water: {
    check: "radResist",
    failure: "rads",
    // A natural 1 only, and always Parasites specifically.
    diseaseBelow: { roll: 1, disease: "parasites" },
  },
  toxicWater: {
    check: "radResist",
    failure: "rads",
    // "Roll below a 5" — so a natural 4 or less.
    randomDiseaseAtOrBelow: 4,
  },
  frigidWater: {
    check: "radResist",
    failure: "rads",
    hypothermiaAfterEnduranceMinutes: true,
  },
  ice: {
    check: "agilityOrLuck",
    dc: 18,
    failure: "prone",
  },
  toxicAir: {
    check: "endurance",
    dc: 18,
    intervalMinutes: 1,
    gasMaskDcRelief: 10,
    gasMaskBlocksDisease: true,
    failure: "exhaustion",
    diseaseBelow: { roll: 4, disease: "sludgeLung" },
    randomDiseaseAtOrBelow: 1,
  },
};

/** Ice only tests you when you cover more than this in a single turn. */
export const ICE_MOVEMENT_TRIGGER_FEET = 20;

/**
 * Radiation Severity Score (pg 124). The RADS-per-second column is a Geiger
 * readout and nothing in the rules consumes it; the check frequency is the
 * mechanical half — how often an occupant re-rolls against their Radiation DC.
 * Level 7's six seconds is one check per combat round.
 */
export interface RadiationSeverity {
  readonly level: number;
  readonly seconds: number;
  readonly radsPerSecond: number;
}

export const RADIATION_SEVERITIES: readonly RadiationSeverity[] = [
  { level: 1, seconds: 3600, radsPerSecond: 0.05 },
  { level: 2, seconds: 1800, radsPerSecond: 0.1 },
  { level: 3, seconds: 600, radsPerSecond: 0.3 },
  { level: 4, seconds: 180, radsPerSecond: 1 },
  { level: 5, seconds: 60, radsPerSecond: 3 },
  { level: 6, seconds: 30, radsPerSecond: 5 },
  { level: 7, seconds: 6, radsPerSecond: 30 },
];

export const RADIATION_SEVERITY_MAX = RADIATION_SEVERITIES.length;

export function radiationSeverity(level: number): RadiationSeverity | undefined {
  return RADIATION_SEVERITIES[level - 1];
}

/**
 * How many Radiation DC checks a stretch of time in a zone demands.
 *
 * Level 7 over an hour is six hundred rolls, which is a rule about standing in
 * a reactor rather than an instruction to roll six hundred dice, so callers get
 * a cap and are told when it bit.
 */
export const ZONE_CHECK_CAP = 10;

export function zoneChecks(level: number, minutes: number): { rolls: number; capped: boolean } {
  const severity = radiationSeverity(level);
  if (!severity || minutes <= 0) return { rolls: 0, capped: false };
  const due = Math.floor((minutes * 60) / severity.seconds);
  return { rolls: Math.min(due, ZONE_CHECK_CAP), capped: due > ZONE_CHECK_CAP };
}
