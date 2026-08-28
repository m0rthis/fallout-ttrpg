/**
 * Hazardous Weather (v2.1 pg 121-123) — a chapter that did not exist in v2.0.
 *
 * The GM picks a weather type and a severity level, and *any* weather may
 * additionally carry a Radiation Severity Score (pg 124) layered on top of its
 * printed effects. Weather is ambient, so it lives on the scene rather than on
 * a character; what it does to a character is computed from these tables.
 *
 * Two traps in the printed rules, both preserved deliberately:
 *
 * - **"Insulated" has opposite valence in the two temperature chapters.** In
 *   Extreme Cold it helps (the interval doubles, or two levels become one); in
 *   Extreme Heat it *hurts* (levels gained are doubled, exactly as holding any
 *   level of Dehydration does).
 * - **Endurance thresholds are scores and they escalate with severity** —
 *   6, 7, 9, then none at all. They are not a single "tough enough" check.
 *
 * Radstorm severity 3 prints the same sense and range values as severity 2;
 * only the irradiated zone level climbs. That is not a transcription slip.
 */

export const WEATHER_TYPES = [
  "fog",
  "thunderstorm",
  "radstorm",
  "blizzard",
  "rain",
  "dustStorm",
  "extremeCold",
  "extremeHeat",
] as const;
export type WeatherType = (typeof WEATHER_TYPES)[number];

/**
 * A per-interval exposure tick. Below the Endurance threshold the rate gets
 * worse — sometimes by shortening the interval, sometimes by doubling the
 * levels, which is why both halves are spelled out rather than derived.
 */
export interface ExposureRate {
  condition: "hypothermia" | "overheating" | "exhaustion";
  /** Endurance *score* at or above which the gentler rate applies; null = none. */
  threshold: number | null;
  minutes: number;
  levels: number;
  belowMinutes: number;
  belowLevels: number;
  /** Rain and Dust Storm only bite the unsheltered. */
  requiresNoShelter?: boolean;
}

export interface WeatherTier {
  /** Added to passive sense (always negative in this chapter). */
  passiveSense: number;
  /** Multiplies every ranged weapon's range. 1, 0.5, or 0.25. */
  rangeMultiplier: number;
  /** Vision is normal out to this many feet. */
  seeNormalFeet?: number;
  /** Lightly obscured past this many feet. */
  obscuredBeyondFeet?: number;
  /** Effectively Blinded past this many feet. */
  blindBeyondFeet?: number;
  /** Radstorm: the irradiated zone level the storm imposes. */
  radZone?: number;
  /** Blizzard: the Extreme Cold severities it coincides with; the GM picks one. */
  coldSeverity?: readonly number[];
  /** AP to move 5 feet, when the weather overrides the usual 1. */
  movementApPer5?: number;
  /** Dust Storm halves how far a sprint carries you. */
  sprintHalved?: boolean;
  /** Extreme Heat multiplies how much water the day costs. */
  waterMultiplier?: number;
  exposure?: ExposureRate;
}

export interface WeatherDefinition {
  /** Effects that apply at every severity, on top of the tier's own. */
  readonly always?: Partial<WeatherTier> & { soundDisadvantage?: boolean };
  /** Tiers indexed by severity − 1. */
  readonly tiers: readonly WeatherTier[];
  /** Whether occupants roll the 10-minute lightning check. */
  readonly lightning?: "thunder" | "rad";
  /** Free-text duration and extent, for the GM readout. */
  readonly duration?: string;
  readonly radius?: string;
}

const COLD_TIERS: readonly WeatherTier[] = [
  {
    passiveSense: 0,
    rangeMultiplier: 1,
    exposure: {
      condition: "hypothermia",
      threshold: 6,
      minutes: 30,
      levels: 1,
      belowMinutes: 15,
      belowLevels: 1,
    },
  },
  {
    passiveSense: 0,
    rangeMultiplier: 1,
    exposure: {
      condition: "hypothermia",
      threshold: 7,
      minutes: 15,
      levels: 1,
      belowMinutes: 15,
      belowLevels: 2,
    },
  },
  {
    passiveSense: 0,
    rangeMultiplier: 1,
    exposure: {
      condition: "hypothermia",
      threshold: 9,
      minutes: 5,
      levels: 1,
      belowMinutes: 5,
      belowLevels: 2,
    },
  },
  {
    passiveSense: 0,
    rangeMultiplier: 1,
    // Sub-zero: no Endurance exemption at all.
    exposure: {
      condition: "hypothermia",
      threshold: null,
      minutes: 1,
      levels: 2,
      belowMinutes: 1,
      belowLevels: 2,
    },
  },
];

export const WEATHER: Record<WeatherType, WeatherDefinition> = {
  fog: {
    duration: "1d4 hours",
    // Sound-based Perception is at disadvantage at every severity, and the
    // −8 to passive sense is printed outside the table too.
    always: { passiveSense: -8, soundDisadvantage: true },
    tiers: [
      { passiveSense: 0, rangeMultiplier: 1, seeNormalFeet: 30, obscuredBeyondFeet: 30, blindBeyondFeet: 100 },
      { passiveSense: 0, rangeMultiplier: 1, seeNormalFeet: 15, obscuredBeyondFeet: 15, blindBeyondFeet: 50 },
      { passiveSense: 0, rangeMultiplier: 1, seeNormalFeet: 5, obscuredBeyondFeet: 5, blindBeyondFeet: 20 },
    ],
  },
  thunderstorm: {
    duration: "15 minutes to an hour",
    radius: "6d4 miles",
    lightning: "thunder",
    tiers: [
      { passiveSense: -4, rangeMultiplier: 0.5 },
      { passiveSense: -8, rangeMultiplier: 0.25 },
    ],
  },
  radstorm: {
    duration: "15 minutes to an hour",
    radius: "6d4 miles",
    lightning: "rad",
    tiers: [
      { passiveSense: -4, rangeMultiplier: 0.5, radZone: 4 },
      { passiveSense: -8, rangeMultiplier: 0.25, radZone: 5 },
      // As printed: identical to severity 2 but for the zone level.
      { passiveSense: -8, rangeMultiplier: 0.25, radZone: 6 },
    ],
  },
  blizzard: {
    tiers: [
      { passiveSense: -6, rangeMultiplier: 1, blindBeyondFeet: 100, coldSeverity: [1, 2] },
      { passiveSense: -10, rangeMultiplier: 0.25, blindBeyondFeet: 50, coldSeverity: [3, 4] },
    ],
  },
  rain: {
    tiers: [
      { passiveSense: -2, rangeMultiplier: 1 },
      {
        passiveSense: -4,
        rangeMultiplier: 1,
        exposure: {
          condition: "hypothermia",
          threshold: 6,
          minutes: 240,
          levels: 1,
          belowMinutes: 180,
          belowLevels: 1,
          requiresNoShelter: true,
        },
      },
      {
        passiveSense: -6,
        rangeMultiplier: 0.5,
        exposure: {
          condition: "hypothermia",
          threshold: 6,
          minutes: 120,
          levels: 1,
          belowMinutes: 60,
          belowLevels: 1,
          requiresNoShelter: true,
        },
      },
    ],
  },
  dustStorm: {
    always: {
      rangeMultiplier: 0.25,
      movementApPer5: 2,
      sprintHalved: true,
      exposure: {
        condition: "exhaustion",
        threshold: null,
        minutes: 30,
        levels: 1,
        belowMinutes: 30,
        belowLevels: 1,
        requiresNoShelter: true,
      },
    },
    tiers: [
      { passiveSense: -10, rangeMultiplier: 0.25, blindBeyondFeet: 30 },
      { passiveSense: -15, rangeMultiplier: 0.25, blindBeyondFeet: 10 },
    ],
  },
  extremeCold: { tiers: COLD_TIERS },
  extremeHeat: {
    tiers: [
      {
        passiveSense: 0,
        rangeMultiplier: 1,
        waterMultiplier: 1,
        exposure: {
          condition: "overheating",
          threshold: 6,
          minutes: 120,
          levels: 1,
          belowMinutes: 60,
          belowLevels: 1,
        },
      },
      {
        passiveSense: 0,
        rangeMultiplier: 1,
        waterMultiplier: 2,
        exposure: {
          condition: "overheating",
          threshold: 7,
          minutes: 60,
          levels: 1,
          belowMinutes: 30,
          belowLevels: 1,
        },
      },
      {
        passiveSense: 0,
        rangeMultiplier: 1,
        waterMultiplier: 3,
        exposure: {
          condition: "overheating",
          threshold: 9,
          minutes: 30,
          levels: 1,
          belowMinutes: 30,
          belowLevels: 2,
        },
      },
      {
        passiveSense: 0,
        rangeMultiplier: 1,
        exposure: {
          condition: "overheating",
          threshold: null,
          minutes: 10,
          levels: 1,
          belowMinutes: 10,
          belowLevels: 1,
        },
      },
    ],
  },
};

/** How many severity steps a weather type prints. */
export function severityCount(type: WeatherType): number {
  return WEATHER[type].tiers.length;
}

/** Environmental flags the weather rules key off, mostly set by the GM. */
export interface EnvironmentFlags {
  /** Cold: halves the gain. Heat: doubles it. The book means both. */
  insulated: boolean;
  /** Exposed or wet: Extreme Cold doubles what you gain. */
  exposedWet: boolean;
  /** Under cover: Rain and Dust Storm cannot touch you. */
  sheltered: boolean;
  /** Within 5 feet of a fire or heater: Hypothermia cannot be gained at all. */
  nearWarmth: boolean;
  /** A cooling source, for shedding Overheating. */
  nearCooling: boolean;
  /** Flips Toxic Air's DC by 10 and blocks disease — never helps in water. */
  gasMask: boolean;
}

/**
 * The weather in force on a scene. `severity` is 1-based; `radSeverity` is the
 * optional Radiation Severity Score (pg 124) any weather may carry; `linked`
 * is the Extreme Cold severity a Blizzard's GM chose out of its printed pair.
 */
export interface WeatherState {
  type: WeatherType;
  severity: number;
  radSeverity: number;
  linked: number;
}

export const NO_WEATHER: WeatherState = {
  type: "fog",
  severity: 0,
  radSeverity: 0,
  linked: 0,
};

/** The tier in force, or undefined when the severity is out of range (or 0). */
export function weatherTier(state: WeatherState): WeatherTier | undefined {
  return WEATHER[state.type].tiers[state.severity - 1];
}

/** Everything the current weather does, with the always-on effects folded in. */
export interface WeatherEffect extends WeatherTier {
  type: WeatherType;
  severity: number;
  soundDisadvantage: boolean;
  /** The Extreme Cold tier a Blizzard drags along, if any. */
  coldTier?: WeatherTier;
  radSeverity: number;
}

export function weatherEffect(state: WeatherState): WeatherEffect | null {
  const tier = weatherTier(state);
  if (!tier) return null;
  const definition = WEATHER[state.type];
  const always = definition.always ?? {};

  const merged: WeatherEffect = {
    ...tier,
    // The always-block's passive sense and range stack with the tier's own
    // rather than replacing them: Fog prints −8 outside the table, and its
    // tiers print no sense value at all.
    passiveSense: tier.passiveSense + (always.passiveSense ?? 0),
    rangeMultiplier: tier.rangeMultiplier * (always.rangeMultiplier ?? 1),
    soundDisadvantage: always.soundDisadvantage ?? false,
    type: state.type,
    severity: state.severity,
    radSeverity: state.radSeverity,
  };

  const movement = tier.movementApPer5 ?? always.movementApPer5;
  if (movement !== undefined) merged.movementApPer5 = movement;
  const sprint = tier.sprintHalved ?? always.sprintHalved;
  if (sprint !== undefined) merged.sprintHalved = sprint;
  const exposure = tier.exposure ?? always.exposure;
  if (exposure !== undefined) merged.exposure = exposure;

  // A Blizzard is a Blizzard *and* Extreme Cold; the GM picks which of the two
  // printed cold severities applies, defaulting to the milder one.
  if (tier.coldSeverity) {
    const chosen = tier.coldSeverity.includes(state.linked) ? state.linked : tier.coldSeverity[0];
    const coldTier = COLD_TIERS[(chosen ?? 1) - 1];
    if (coldTier) merged.coldTier = coldTier;
  }
  // A Radstorm's zone is its own severity's, unless the GM set a higher one.
  if (tier.radZone) merged.radSeverity = Math.max(state.radSeverity, tier.radZone);
  return merged;
}

/**
 * Levels of a condition gained over a stretch of time under an exposure rate.
 *
 * The modifiers are the fiddly part: Extreme Cold doubles the gain when you are
 * exposed or wet and softens it when you are insulated ("the interval is
 * doubled, or the levels gained drop from two to one" — so two becomes one, and
 * otherwise the clock slows), while Extreme Heat doubles the gain when you are
 * insulated *or* carrying any Dehydration. Standing near warmth stops
 * Hypothermia outright.
 */
export function exposureLevels(
  rate: ExposureRate,
  minutes: number,
  enduranceScore: number,
  flags: EnvironmentFlags,
  dehydration: number,
): number {
  if (rate.requiresNoShelter && flags.sheltered) return 0;
  if (rate.condition === "hypothermia" && flags.nearWarmth) return 0;

  const gentle = rate.threshold === null ? false : enduranceScore >= rate.threshold;
  let interval = gentle ? rate.minutes : rate.belowMinutes;
  let levels = gentle ? rate.levels : rate.belowLevels;

  if (rate.condition === "hypothermia") {
    if (flags.exposedWet) levels *= 2;
    if (flags.insulated) {
      if (levels > 1) levels -= 1;
      else interval *= 2;
    }
  } else if (rate.condition === "overheating") {
    if (flags.insulated || dehydration > 0) levels *= 2;
  }

  if (interval <= 0) return 0;
  return Math.floor(minutes / interval) * levels;
}

/**
 * The lightning strike check (pg 121): after ten minutes in a Thunderstorm or
 * Radstorm, roll 4d10 and subtract half your Luck modifier — or add it, the
 * book says, when the modifier is negative. Forty or more and it finds you.
 */
export const LIGHTNING_INTERVAL_MINUTES = 10;
export const LIGHTNING_STRIKE_TOTAL = 40;

export function lightningFormula(luckMod: number): string {
  const half = Math.floor(Math.abs(luckMod) / 2);
  if (half === 0) return "4d10";
  return luckMod >= 0 ? `4d10 - ${String(half)}` : `4d10 + ${String(half)}`;
}

/** What a strike costs, by storm (pg 121). */
export const LIGHTNING_DAMAGE = {
  thunder: { electricity: "3d12", radiation: "", exhaustion: 6, rads: 0 },
  rad: { electricity: "2d12", radiation: "2d12", exhaustion: 3, rads: 3 },
} as const;

/**
 * Hypothermia and Overheating both shed a level per hour in shelter with the
 * right heat or cooling source, or anywhere the extreme no longer reaches
 * (pg 122-123). Warming out of Hypothermia *with Extreme Heat* costs a DC 20
 * Endurance check at the end of the hour, or you die.
 */
export const EXPOSURE_RECOVERY_MINUTES = 60;
export const HYPOTHERMIA_HEAT_RESCUE_DC = 20;
