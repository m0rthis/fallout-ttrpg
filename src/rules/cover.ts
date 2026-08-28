/**
 * Cover (pg 130) — the +2/+5 AC degrees, the explosive/trap resistance, and
 * the creature-as-cover rider.
 *
 * Pure rules only: constants, an ordering, and the decisions the printed text
 * forces. Nothing here knows what a token is, because cover is not something
 * this system measures — see the `AttackOptions` docstring in
 * `src/dice/rolls.ts` for why it is declared per attack instead.
 *
 * ## The non-stacking sentence, quoted, because it is a precedent
 *
 * > There are three degrees of cover. If a target is behind multiple sources
 * > of cover, only the most protective degree of cover applies; the degrees
 * > aren't added together. For example, if a target is behind a creature that
 * > gives half cover and a tree trunk that gives three-quarters cover, the
 * > target has three-quarters cover. (pg 130)
 *
 * This is the only place in 136 pages where the book states, in so many words,
 * how two sources of the same kind of protection combine — and it says
 * *take the best*, not *add*. Worth having in one place: the same question is
 * open for stacked armor bonuses, for two sources of the same condition, and
 * for whatever the next chapter that overlaps protections turns out to be. It
 * is a precedent, not a general rule the book ever generalised, so cite it
 * rather than assume it.
 */

/**
 * The degrees, weakest to strongest. `none` is not one of the book's three; it
 * is the absence of them, and exists so a declared value can say "no cover"
 * without a null.
 */
export const COVER_DEGREES = ["none", "half", "threeQuarters", "total"] as const;
export type CoverDegree = (typeof COVER_DEGREES)[number];

/**
 * AC granted by each degree (pg 130): half cover +2, three-quarters +5.
 *
 * Total cover carries no AC number because it is not a to-hit problem — the
 * target "can't be targeted directly by an attack" at all. Zero here means
 * "there is no bonus to print", and callers must check `blocksTargeting`
 * first rather than reading a 0 as "no protection".
 */
export const COVER_AC_BONUS: Record<CoverDegree, number> = {
  none: 0,
  half: 2,
  threeQuarters: 5,
  total: 0,
};

/**
 * Protectiveness order, which is what "only the most protective degree
 * applies" needs to mean anything. The book never numbers the degrees, but it
 * ranks them twice: the pg 130 example resolves half + three-quarters to
 * three-quarters, and Take Cover (pg 127) upgrades "three quarters or half
 * cover" into full cover — so total sits above three-quarters above half.
 */
const COVER_RANK: Record<CoverDegree, number> = {
  none: 0,
  half: 1,
  threeQuarters: 2,
  total: 3,
};

/** The AC bonus a degree gives the target (pg 130). */
export function coverAcBonus(degree: CoverDegree): number {
  return COVER_AC_BONUS[degree];
}

/**
 * Whether the degree puts the target out of reach of a direct attack (pg 130):
 * total cover "can't be targeted directly by an attack. Although, some items,
 * perks, and abilities can reach such a target by including it in an area of
 * effect."
 */
export function blocksTargeting(degree: CoverDegree): boolean {
  return degree === "total";
}

/**
 * "Only the most protective degree of cover applies; the degrees aren't added
 * together" (pg 130). An empty list is no cover.
 */
export function bestCover(degrees: readonly CoverDegree[]): CoverDegree {
  let best: CoverDegree = "none";
  for (const degree of degrees) {
    if (COVER_RANK[degree] > COVER_RANK[best]) best = degree;
  }
  return best;
}

/** How much of an explosive's or trap's damage reaches a target behind cover. */
export type ExplosiveExposure = "full" | "resistant" | "none";

/**
 * Explosive and trap damage against a covered target.
 *
 * Half and three-quarters cover both grant "resistance to any damage dealt
 * from an explosive or trap that is beyond the cover" (pg 130) — the same
 * clause word for word, so the two degrees differ only in AC here.
 *
 * Total cover is stated nowhere on pg 130, but it does not need to be: the
 * explosives chapter says an explosive damages "every creature and object in
 * its radius that isn't behind full cover" (pg 78), and repeats it for both
 * damage rings. So total cover is not resistance, it is immunity, and that is
 * printed — in another chapter.
 *
 * What the book never defines anywhere is what **resistance** does to a
 * number. "Damage types have no rules of their own, but other rules, such as
 * damage resistance, rely on the types" (pg 130) is the closest it comes, and
 * no page says resistance halves anything. This function therefore names the
 * exposure and refuses to compute it; halving would be inventing a rule.
 */
export function explosiveExposure(degree: CoverDegree): ExplosiveExposure {
  if (degree === "total") return "none";
  if (degree === "half" || degree === "threeQuarters") return "resistant";
  return "full";
}

/**
 * The creature-as-cover threshold (pg 130):
 *
 * > If a creature uses another creature as its cover, any attack roll made
 * > against it has the potential of hitting the covering creature. If the
 * > attack roll made against the covered creature is a 6 or below, the attack
 * > deals damage against the covering creature.
 */
export const CREATURE_COVER_HIT_MAX = 6;

/**
 * Whether an attack that missed past a covering creature hits the creature.
 *
 * Three things the rule does not say, decided here so it can run at all:
 *
 * - **Which number is "the attack roll"?** Read as the *total* — the same
 *   number that was compared to the covered creature's AC. The book uses "the
 *   result of the roll" when it means the raw die (pg 66, critical hits) and
 *   "roll total" when it means the sum (pg 127, Attacks); "the attack roll
 *   made against the covered creature" is the one aimed at an AC, so it is the
 *   sum. The raw-die reading is defensible and produces a very different game
 *   at high skill bonuses, so this is a ruling, not a reading of the text.
 * - **No second roll.** The text says the attack "deals damage against the
 *   covering creature", not that it is rolled against that creature's AC. So
 *   a low total is redirected, not re-tested.
 * - **A natural 1 is not excluded.** The book makes a natural 1 a critical
 *   failure for the weapon (pg 66) but never says it cannot redirect, and a
 *   total of 1 is comfortably "6 or below".
 */
export function hitsCoveringCreature(attackTotal: number): boolean {
  return attackTotal <= CREATURE_COVER_HIT_MAX;
}

/** Take Cover (pg 126-127): 3 AP to duck from partial cover into full cover. */
export const TAKE_COVER_AP = 3;

/**
 * Whether Take Cover (pg 127) is available from this degree: "If you only have
 * three quarters or half cover, you can spend 3 AP to squat, kneel, or duck
 * into cover to gain full cover."
 *
 * The action chapter's "full cover" and pg 130's "total cover" are the same
 * thing under two names — the book uses both, never together, and never
 * defines a fourth degree. Read as one degree; nothing in the book separates
 * them.
 *
 * Not wired to an action here: this system has no AP-spending button for any
 * of the pg 126-127 actions yet (ROADMAP D3), so the constant and the gate
 * exist for whoever builds that row of buttons.
 */
export function canTakeCover(degree: CoverDegree): boolean {
  return degree === "half" || degree === "threeQuarters";
}

/** The degree Take Cover leaves you in; attacking drops it again (pg 127). */
export function coverAfterTakingCover(degree: CoverDegree): CoverDegree {
  return canTakeCover(degree) ? "total" : degree;
}
