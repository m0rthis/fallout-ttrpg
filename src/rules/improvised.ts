/**
 * Improvised Attacks (v2.1 pg 128) — new this edition: pick up whatever is to
 * hand and swing it, or throw it. Everything scales off the object's Load.
 *
 * Thrown distance in feet is the multiplier × Strength **score** (the same
 * convention ranged weapons use with Perception).
 */

export interface ImprovisedTier {
  /** Inclusive Load bounds; `maxLoad` null means "and up". */
  minLoad: number;
  maxLoad: number | null;
  apCost: number;
  damage: string;
  throwNormal: number;
  throwLong: number;
}

/**
 * The book prints no row for Load 41-49, so that gap falls through to the
 * 31-40 tier rather than being invented. The 50+ row's AP is printed "7+",
 * recorded here as its minimum of 7.
 */
export const IMPROVISED_TIERS: readonly ImprovisedTier[] = [
  { minLoad: 0, maxLoad: 2, apCost: 3, damage: "1d4", throwNormal: 6, throwLong: 12 },
  { minLoad: 3, maxLoad: 9, apCost: 4, damage: "1d8", throwNormal: 4, throwLong: 10 },
  { minLoad: 10, maxLoad: 15, apCost: 4, damage: "1d10", throwNormal: 3, throwLong: 8 },
  { minLoad: 16, maxLoad: 20, apCost: 5, damage: "2d8", throwNormal: 3, throwLong: 6 },
  { minLoad: 21, maxLoad: 30, apCost: 5, damage: "3d6", throwNormal: 3, throwLong: 5 },
  { minLoad: 31, maxLoad: 40, apCost: 6, damage: "3d10", throwNormal: 2, throwLong: 4 },
  { minLoad: 50, maxLoad: null, apCost: 7, damage: "4d12", throwNormal: 1, throwLong: 1 },
];

/** The heaviest printed tier below the 50+ row, used for the book's 41-49 gap. */
const GAP_FALLBACK: ImprovisedTier = {
  minLoad: 31,
  maxLoad: 49,
  apCost: 6,
  damage: "3d10",
  throwNormal: 2,
  throwLong: 4,
};

/** The tier an object of this Load falls into. */
export function improvisedTier(load: number): ImprovisedTier {
  const clamped = Math.max(0, load);
  for (const tier of IMPROVISED_TIERS) {
    if (clamped >= tier.minLoad && (tier.maxLoad === null || clamped <= tier.maxLoad)) return tier;
  }
  // Only reachable in the printed 41-49 gap.
  return GAP_FALLBACK;
}

/** True when the Load lands in the range the book forgot to print. */
export function isUnprintedLoadGap(load: number): boolean {
  return load >= 41 && load <= 49;
}

/** Thrown range in feet: multiplier × Strength score. */
export function improvisedThrowRange(
  tier: ImprovisedTier,
  strengthScore: number,
): { normal: number; long: number } {
  return {
    normal: tier.throwNormal * strengthScore,
    long: tier.throwLong * strengthScore,
  };
}
