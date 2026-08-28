/**
 * Vision and Light, and Flames as a spreading area (v2.1 pg 118-119).
 *
 * Pure rules only: no `await`, no document writes, no Foundry globals, no
 * `game.i18n`. The document-writing half is `src/actions/light.ts`.
 *
 * ## What the book actually prints
 *
 * Three illumination levels and two degrees of obscurement, wired to each other
 * in one sentence apiece (pg 118-119):
 *
 * > In a **lightly obscured** area, such as dim light, patchy fog, or moderate
 * > foliage, creatures have disadvantage on Perception checks that rely on
 * > sight, their passive sense is reduced by 5, and their range with all ranged
 * > weapons is halved.
 * >
 * > A **heavily obscured** area—such as darkness, opaque fog, or dense
 * > foliage—blocks vision entirely. A creature effectively suffers from the
 * > blinded condition (see page #) when trying to see something in that area.
 * >
 * > Bright light lets most creatures see normally. […] Dim light creates a
 * > lightly obscured area. […] Darkness creates a heavily obscured area.
 *
 * Note the `(see page #)` — an unfilled cross-reference placeholder, the same
 * defect the "off-balance" reference carries (see `V21-NOTES-stamina-terrain`).
 * Blinded itself is on pg 133: *"can't see and automatically fails any ability
 * check that requires sight. Attack rolls against a blinded creature have
 * advantage."*
 *
 * ## The three silences, and how they are settled here
 *
 * 1. **Nothing says how two obscuring sources combine.** Dim light *and* fog is
 *    never addressed, and the book's own examples put light, fog and foliage in
 *    the same list, as alternatives rather than as things that add up. The only
 *    sentence in 136 pages that says how two protections of the same kind
 *    combine is the cover rule (pg 130): *"only the most protective degree of
 *    cover applies; the degrees aren't added together."* Read here as its
 *    mirror image — take the **worst** obscurement, never the sum. Cited as a
 *    precedent, not as a general rule the book ever generalised.
 * 2. **The −5 passive sense and halved range are printed once, for "lightly
 *    obscured".** The weather chapter (pg 121-123) prints its *own* sense and
 *    range numbers for fog, blizzards and dust storms, which are the same rule
 *    stated a second time for a named weather. Adding both would charge a
 *    character twice for one fog. `worseSensePenalty` and `worseRangeMultiplier`
 *    exist so a caller takes the harsher of the two rather than stacking them.
 * 3. **Heavily obscured has no passive-sense number and no range multiplier.**
 *    The book gives figures only for the light degree; heavy is "blocks vision
 *    entirely". So those keys are *omitted* here rather than guessed at —
 *    Blinded is a different and stronger thing than a −5, and inventing a
 *    number would make the heavy degree look milder than it reads.
 *
 * Blindsight and Nightvision are on pg 119 and are quoted at their functions.
 */

// ---------------------------------------------------------------- light levels

/** The three categories of illumination (pg 118-119). */
export const LIGHT_LEVELS = ["bright", "dim", "darkness"] as const;
export type LightLevel = (typeof LIGHT_LEVELS)[number];

/**
 * The degrees of obscurement (pg 118). `none` is not one of the book's two; it
 * is their absence, and exists so a computed value can say "you can see" without
 * a null — the same shape `CoverDegree` uses for `none`.
 */
export const OBSCUREMENTS = ["none", "light", "heavy"] as const;
export type Obscurement = (typeof OBSCUREMENTS)[number];

/** Severity order, which is what "take the worst" needs in order to mean anything. */
const OBSCUREMENT_RANK: Record<Obscurement, number> = { none: 0, light: 1, heavy: 2 };

/**
 * The obscurement a light level creates, printed as a direct equivalence
 * (pg 118-119): bright light "lets most creatures see normally", "dim light
 * creates a lightly obscured area", "darkness creates a heavily obscured area".
 */
export function obscurementOfLight(level: LightLevel): Obscurement {
  switch (level) {
    case "bright":
      return "none";
    case "dim":
      return "light";
    case "darkness":
      return "heavy";
  }
}

/** Passive sense loss in a lightly obscured area (pg 118). */
export const LIGHT_OBSCURED_PASSIVE_SENSE = -5;
/** Ranged weapon ranges are halved in a lightly obscured area (pg 118). */
export const LIGHT_OBSCURED_RANGE_MULTIPLIER = 0.5;

/**
 * What a degree of obscurement does to a creature trying to see through it.
 *
 * `passiveSense` and `rangeMultiplier` are **omitted** for the heavy degree
 * rather than set to a guess: pg 118 prints numbers only for the light degree
 * and describes the heavy one as blocking vision entirely.
 */
export interface ObscurementEffect {
  /** Disadvantage on Perception checks that rely on sight (pg 118, light only). */
  sightPerceptionDisadvantage: boolean;
  /**
   * Blinded, and therefore an *automatic failure* on any ability check that
   * requires sight (pg 118 pointing at pg 133) — which supersedes disadvantage
   * rather than adding to it.
   */
  blinded: boolean;
  passiveSense?: number;
  rangeMultiplier?: number;
}

export function obscurementEffect(obscurement: Obscurement): ObscurementEffect {
  switch (obscurement) {
    case "none":
      return { sightPerceptionDisadvantage: false, blinded: false };
    case "light":
      return {
        sightPerceptionDisadvantage: true,
        blinded: false,
        passiveSense: LIGHT_OBSCURED_PASSIVE_SENSE,
        rangeMultiplier: LIGHT_OBSCURED_RANGE_MULTIPLIER,
      };
    case "heavy":
      // "Blocks vision entirely […] effectively suffers from the blinded
      // condition" (pg 118). No number is printed, and none is invented.
      return { sightPerceptionDisadvantage: false, blinded: true };
  }
}

/**
 * The worst of several obscuring sources — dim light plus patchy fog plus the
 * weather chapter's own bands.
 *
 * The book never says how they combine; this follows the pg 130 cover
 * precedent ("only the most protective degree applies; the degrees aren't added
 * together") read from the other side. A ruling, not a printed rule.
 */
export function worstObscurement(...sources: readonly Obscurement[]): Obscurement {
  let worst: Obscurement = "none";
  for (const source of sources) {
    if (OBSCUREMENT_RANK[source] > OBSCUREMENT_RANK[worst]) worst = source;
  }
  return worst;
}

/**
 * The harsher of two passive-sense penalties. Both are negative, so the harsher
 * is the smaller. Used instead of addition because pg 118's −5 for a lightly
 * obscured area and pg 121's −8 for Fog are the same rule printed twice.
 */
export function worseSensePenalty(a: number, b: number): number {
  return Math.min(a, b);
}

/** The harsher of two range multipliers, for the same reason. */
export function worseRangeMultiplier(a: number, b: number): number {
  return Math.min(a, b);
}

// -------------------------------------------------------------------- senses

/**
 * What a creature can perceive without ordinary light, in feet.
 *
 * Neither sense has a printed default radius anywhere in the book — pg 119
 * says "within a specific radius" and "within a specified range" and leaves
 * both to whatever grants them, and the v2.1 creature chapter that would have
 * specified them is the chapter v2.1 omits. So 0 means "does not have it".
 */
export interface Senses {
  /** Blindsight radius in feet (pg 119); 0 = none. */
  blindsight: number;
  /** Nightvision range in feet (pg 119); 0 = none. */
  nightvision: number;
}

export const NO_SENSES: Senses = { blindsight: 0, nightvision: 0 };

/**
 * Distance bands another rule may impose on top of the light level — the
 * weather chapter already computes these (`src/rules/weather.ts`: Fog,
 * Blizzard and Dust Storm all print "lightly obscured past N feet" and
 * "effectively Blinded past N feet"), and this module consumes them rather
 * than restating them.
 */
export interface ObscurementBands {
  /** Lightly obscured past this many feet. */
  obscuredBeyondFeet?: number;
  /** Heavily obscured — effectively Blinded — past this many feet. */
  blindBeyondFeet?: number;
}

/** The obscurement a pair of distance bands imposes at a given range. */
export function bandObscurement(bands: ObscurementBands, distanceFeet: number): Obscurement {
  if (bands.blindBeyondFeet !== undefined && distanceFeet > bands.blindBeyondFeet) return "heavy";
  if (bands.obscuredBeyondFeet !== undefined && distanceFeet > bands.obscuredBeyondFeet) {
    return "light";
  }
  return "none";
}

/**
 * Nightvision (pg 119):
 *
 * > Within a specified range, a creature with nightvision can see in darkness
 * > as if the darkness were dim light, so areas of darkness are only lightly
 * > obscured as far as that creature is concerned. However, the creature can't
 * > discern color in darkness, only shades of gray.
 *
 * Two things this does **not** do, both because the sentence only ever names
 * darkness:
 *
 * - It does not help against fog, foliage, or the weather chapter's bands. A
 *   Nightvision creature in an opaque fog is as blind as anyone else.
 * - It does not turn darkness into bright light. Darkness inside the range is
 *   *dim*, so the −5 passive sense, the halved ranged range and the
 *   disadvantage on sight-based Perception all still apply.
 */
export function nightvisionObscurement(
  level: LightLevel,
  distanceFeet: number,
  nightvisionFeet: number,
): Obscurement {
  const ambient = obscurementOfLight(level);
  if (level !== "darkness") return ambient;
  if (nightvisionFeet <= 0) return ambient;
  return distanceFeet <= nightvisionFeet ? "light" : "heavy";
}

/**
 * Blindsight (pg 119):
 *
 * > A creature with blindsight can perceive its surroundings without relying
 * > on sight, within a specific radius. Creatures without eyes and creatures
 * > with echolocation or heightened senses have this sense.
 *
 * **Ruled, not printed:** inside the radius this returns `none` — no
 * obscurement at all. The book says only that the perception does not rely on
 * sight; it never says what the creature's effective obscurement *is*. Reading
 * it as "unobscured within the radius" is the reading that makes the sense
 * worth having, and it is the only reading under which a creature "without
 * eyes" can function at all. Beyond the radius blindsight does nothing
 * whatsoever, which the book does say.
 */
export function blindsightReaches(distanceFeet: number, blindsightFeet: number): boolean {
  return blindsightFeet > 0 && distanceFeet <= blindsightFeet;
}

/**
 * Everything above in one call: how obscured something is, at a distance, for
 * a particular creature, under a light level and whatever bands another rule
 * imposes.
 *
 * Order of operations, each step cited above: blindsight first (it does not
 * rely on sight, so nothing that obscures sight touches it), then the light
 * level as softened by nightvision, then the bands, taking the worst of the
 * two remaining.
 */
export function perceivedObscurement(
  distanceFeet: number,
  level: LightLevel,
  senses: Senses = NO_SENSES,
  bands: ObscurementBands = {},
): Obscurement {
  if (blindsightReaches(distanceFeet, senses.blindsight)) return "none";
  return worstObscurement(
    nightvisionObscurement(level, distanceFeet, senses.nightvision),
    bandObscurement(bands, distanceFeet),
  );
}

// ------------------------------------------------- vision ranges, in feet

/**
 * The distances a creature can actually perceive at, which is what a virtual
 * tabletop needs in order to draw any of this.
 *
 * `null` means unlimited. The split between `sightFeet` and
 * `lightPerceptionFeet` is not an implementation detail smuggled into the rules
 * layer — it is pg 118's own distinction: darkness "blocks vision entirely",
 * but a *lit* thing standing in it is by definition not in darkness. An unaided
 * creature in a dark room sees the lantern across it and nothing else.
 */
export interface VisionRanges {
  /** How far unaided sight reaches with no light at all; null = unlimited. */
  sightFeet: number | null;
  /** How far a lit thing can be seen; null = unlimited. */
  lightPerceptionFeet: number | null;
  /** Blindsight radius, 0 when the creature has none. */
  blindsightFeet: number;
  /** Whether darkness inside the sight range is only lightly obscured (pg 119). */
  monochromeInDarkness: boolean;
}

/**
 * Compute the ranges. The hard cutoff is `blindBeyondFeet`: past it a creature
 * "effectively suffers from the blinded condition", so nothing — lit or not —
 * is perceived beyond it.
 */
export function visionRanges(
  senses: Senses = NO_SENSES,
  level: LightLevel = "bright",
  bands: ObscurementBands = {},
): VisionRanges {
  const cutoff = bands.blindBeyondFeet;
  const cap = (feet: number | null): number | null => {
    if (cutoff === undefined) return feet;
    return feet === null ? cutoff : Math.min(feet, cutoff);
  };

  // In darkness, unaided sight reaches nothing; nightvision reaches its range.
  const unaided = level === "darkness" ? senses.nightvision : null;
  return {
    sightFeet: cap(unaided),
    lightPerceptionFeet: cap(null),
    blindsightFeet: senses.blindsight,
    monochromeInDarkness: level === "darkness" && senses.nightvision > 0,
  };
}

// -------------------------------------------------------------------- flames

/**
 * Flames as a spreading area (pg 118), quoted in full because every number in
 * this section comes from these five sentences:
 *
 * > When a flammable object is lit aflame via a flamer, incendiary grenade, or
 * > a rogue flare; fires begin to spread. When an area is engulfed in flames,
 * > any creature who moves through the area or starts their turn in the area
 * > takes 2d10 fire damage and gains Burning. At the start of each round, the
 * > flaming area spreads 5 feet in all directions, increasing the size of the
 * > area. *The spread of the flames is up to GM's discretion. There are factors
 * > that could allow flames to spread slower, such as winds, rain, or if the
 * > flames are surrounded by non-flammable objects.* These flames can last
 * > upwards to a few hours unless put out via water, weapons that deal cryo
 * > damage, or a fire extinguisher. The larger a flaming area gets, the more
 * > damage it deals. For every 20 additional feet a flaming area grows, its
 * > damage is increased by 1d10 to a maximum of 50d10.
 *
 * Burning itself is pg 133: *"A burning creature takes 1d10 fire damage at the
 * start of their turns. They can spend 6 AP to put themselves out."*
 */

/** "takes 2d10 fire damage" — the damage of an area that has not yet grown. */
export const FLAME_BASE_DICE = 2;
/** Every flame die is a d10, at the base and at each growth step. */
export const FLAME_DIE_SIZE = 10;
/** "to a maximum of 50d10". */
export const FLAME_MAX_DICE = 50;
/** "the flaming area spreads 5 feet in all directions" each round. */
export const FLAME_SPREAD_FEET_PER_ROUND = 5;
/** "For every 20 additional feet a flaming area grows, its damage is increased by 1d10". */
export const FLAME_FEET_PER_EXTRA_DIE = 20;
/** Burning is fire damage, which the resistance/vulnerability table keys off. */
export const FLAME_DAMAGE_TYPE = "fire";

/**
 * What puts a fire out (pg 118). The book names three and gives no DC, no
 * quantity and no action cost for any of them, so this is a list for a GM to
 * read, not a check to roll.
 */
export const FLAME_EXTINGUISHERS = ["water", "cryo", "fireExtinguisher"] as const;
export type FlameExtinguisher = (typeof FLAME_EXTINGUISHERS)[number];

/**
 * A burning area.
 *
 * `originRadiusFeet` exists because **the book never says how big a newly lit
 * area is**. "When an area is engulfed in flames" is the only description of
 * its extent, and a flamer, an incendiary grenade and a dropped flare plainly
 * do not light the same amount of ground. It is therefore declared by whoever
 * lights the fire, and defaults to one five-foot space — the smallest area the
 * book's own movement and spread rules can measure.
 */
export interface FlameArea {
  /** How far the fire reached from its origin at the moment it was lit. */
  originRadiusFeet: number;
  /** Rounds elapsed since it was lit. */
  rounds: number;
  /**
   * Feet it spreads per round. Defaults to the printed 5, and is a field
   * rather than a constant because the book explicitly hands the rate to the
   * GM: "There are factors that could allow flames to spread slower, such as
   * winds, rain, or if the flames are surrounded by non-flammable objects."
   */
  spreadFeetPerRound: number;
}

/** A fire the size of one space, spreading at the printed rate. */
export const NEW_FLAME_AREA: FlameArea = {
  originRadiusFeet: 5,
  rounds: 0,
  spreadFeetPerRound: FLAME_SPREAD_FEET_PER_ROUND,
};

/** How far the fire reaches from its origin now. */
export function flameRadiusFeet(area: FlameArea): number {
  return area.originRadiusFeet + Math.max(0, area.rounds) * Math.max(0, area.spreadFeetPerRound);
}

/** How much it has grown since it was lit — the quantity the damage scales on. */
export function flameGrowthFeet(area: FlameArea): number {
  return flameRadiusFeet(area) - area.originRadiusFeet;
}

/**
 * The number of d10 the area deals.
 *
 * **A ruling, not a reading.** "For every 20 additional feet a flaming area
 * grows" does not say whether the twenty feet are measured *outward* from the
 * fire's edge or *across* the area. The two produce different games: the fire
 * spreads five feet in all directions each round, so it gains twenty feet
 * outward every four rounds but twenty feet across every two, and the second
 * reading doubles how fast the damage climbs.
 *
 * Measured **outward** here, because "grows" answers the immediately preceding
 * "spreads 5 feet in all directions", which is itself an outward measure, and
 * because 20 is an exact multiple of that printed 5. The across reading is
 * defensible and is recorded in `packs-src/V21-NOTES-vision-fire.md`; a caller
 * that prefers it can halve `FLAME_FEET_PER_EXTRA_DIE`.
 */
export function flameDamageDice(area: FlameArea): number {
  const extra = Math.floor(flameGrowthFeet(area) / FLAME_FEET_PER_EXTRA_DIE);
  return Math.min(FLAME_MAX_DICE, FLAME_BASE_DICE + Math.max(0, extra));
}

/** The damage formula an area deals, e.g. `"4d10"`. */
export function flameDamageFormula(area: FlameArea): string {
  return `${String(flameDamageDice(area))}d${String(FLAME_DIE_SIZE)}`;
}

/** Whether the area has reached the printed 50d10 ceiling. */
export function flamesAtMaximum(area: FlameArea): boolean {
  return flameDamageDice(area) >= FLAME_MAX_DICE;
}

/** The area one round later. Pure: returns a new object. */
export function spreadFlames(area: FlameArea): FlameArea {
  return { ...area, rounds: area.rounds + 1 };
}

/**
 * Rounds until the area next gains a die, or `null` once it is at maximum.
 * Useful for a readout; the book prints no such figure.
 */
export function roundsToNextFlameDie(area: FlameArea): number | null {
  if (flamesAtMaximum(area)) return null;
  const spread = Math.max(0, area.spreadFeetPerRound);
  if (spread <= 0) return null; // a fire a GM has stopped spreading never grows
  const grown = flameGrowthFeet(area);
  const nextThreshold =
    (Math.floor(grown / FLAME_FEET_PER_EXTRA_DIE) + 1) * FLAME_FEET_PER_EXTRA_DIE;
  return Math.ceil((nextThreshold - grown) / spread);
}
