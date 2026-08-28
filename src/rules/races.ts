/**
 * Race-level adjustments to the raw ability scores and carry load (pg 8-12).
 *
 * Most racial features in this book are perks, conditions, or exemptions, and
 * live wherever the rule they modify lives — Tenacity is in the death-save
 * limit, Mass Exertion is in the daily intake, the hunger-immune races are a
 * list in `constants.ts`. What is here is the narrower set that changes an
 * *ability score itself*, before any modifier is computed from it, because
 * those have to be applied in one place or every downstream number disagrees.
 */

import { ABILITY_MIN, type Ability, type Race } from "./constants";

/** Super Mutant Superior Strength: the floor its Strength score cannot go under (pg 11). */
export const SUPER_MUTANT_STRENGTH_FLOOR = 6;
/** Super Mutant Superior Strength: the flat carry-load increase (pg 11). */
export const SUPER_MUTANT_CARRY_LOAD = 40;

// ============================================================= pg 12

/**
 * The two GM-optional Super Mutant variants (pg 12).
 *
 * > **Variant Super Mutant Traits.** If your GM allows it, you can optionally
 * > start with one of these variant abilities which **replaces the Superior
 * > Strength trait**.
 *
 * "Replaces" is the whole shape of this feature and is enforced here rather
 * than left to the caller: every function below branches on the variant *first*
 * and only falls through to Superior Strength when there is none. Nothing
 * stacks a variant on top of the base trait, and no call site has to remember
 * to subtract it.
 *
 * Only Superior Strength is replaced. **Bulky is untouched** — it is printed as
 * a second, separate Super Mutant trait (pg 12), and the variant paragraph
 * names Superior Strength alone. `decaysExtra` therefore still fires for a
 * Defective Strain or Nightkin character.
 */
export const SUPER_MUTANT_VARIANTS = ["defectiveStrain", "nightkin"] as const;
export type SuperMutantVariant = (typeof SUPER_MUTANT_VARIANTS)[number];

/**
 * The stored shape of `details.mutantVariant` on a character.
 *
 * `""` is not a third variant: it means "this character has Superior Strength",
 * which is both the printed default and what every non-mutant reads as. Shaped
 * exactly like `RobotType` in `robots.ts`, for the same reason — the sheet
 * stores a free string and the rules layer narrows it.
 */
export type MutantVariant = "" | SuperMutantVariant;

/** Narrows a stored string to one of the two printed variants. */
export function isSuperMutantVariant(value: string): value is SuperMutantVariant {
  return (SUPER_MUTANT_VARIANTS as readonly string[]).includes(value);
}

/**
 * Normalises whatever is stored in `details.mutantVariant` to a `MutantVariant`.
 *
 * Deliberately **not** cross-checked against `details.race`, matching
 * `robotTypeOf`: a sheet can hold a stale variant from before the race was
 * switched, the book gives no reconciliation rule, and every function here
 * checks the race itself before the variant is allowed to mean anything. So a
 * ghoul carrying `"nightkin"` gets no mutant numbers, and switching back to
 * Super Mutant restores the choice the player made.
 */
export function mutantVariantOf(value: string | undefined): MutantVariant {
  return value !== undefined && isSuperMutantVariant(value) ? value : "";
}

/**
 * Defective Strain (pg 12):
 *
 * > Your Strength and Endurance ability scores both increase by 2 and your
 * > Carry Load is increased by 40. However, your Intelligence ability score is
 * > reduced by 2 and cannot be raised higher than a 3.
 *
 * Note what is *absent*: the "cannot be lower than 6" floor belongs to Superior
 * Strength, which this replaces, so a Defective Strain mutant with Strength 3
 * operates at 5 — not 6. The trait is a bigger bonus with no safety net, and
 * printing the floor into it would be inventing a rule.
 */
export const DEFECTIVE_STRAIN_BONUS = 2;
export const DEFECTIVE_STRAIN_INTELLIGENCE_PENALTY = 2;
/** "cannot be raised higher than a 3" (pg 12). */
export const DEFECTIVE_STRAIN_INTELLIGENCE_CAP = 3;

/** Nightkin's Stealth Field: 3 AP, 1 minute (pg 12). */
export const STEALTH_FIELD_AP_COST = 3;
export const STEALTH_FIELD_SECONDS = 60;
/** "temporarily decreases by 1 for 24 hours (to a minimum of 1)" (pg 12). */
export const STEALTH_FIELD_DECAY_HOURS = 24;
export const STEALTH_FIELD_DECAY_SECONDS = STEALTH_FIELD_DECAY_HOURS * 60 * 60;
export const STEALTH_FIELD_DECAY_STEP = 1;
/**
 * The floor the Perception decay stops at. The book prints "a minimum of 1",
 * which is also `ABILITY_MIN` — named through the constant so the two cannot
 * drift apart, and asserted here rather than assumed.
 */
export const STEALTH_FIELD_PERCEPTION_FLOOR = ABILITY_MIN;

/**
 * The Strength score a race actually operates at (pg 11-12).
 *
 * > **Superior Strength.** Due to your increased mass in muscle, your Strength
 * > score increases by 1 and cannot be lower than 6. Additionally your Carry
 * > Load is increased by 40.
 *
 * Read as `max(6, score + 1)`: the +1 applies first and the floor catches what
 * is still short, which is the only order in which the floor does anything. The
 * alternative reading — floor first, then add — would make a Super Mutant with
 * Strength 3 end at 7, above a Strength 5 mutant's 6, and rank characters out of
 * order. The score cap of 10 (pg 20) is deliberately **not** applied here: this
 * mirrors Power Armor's Hydraulic Machine, which sets the score to 12 and is
 * already allowed past the cap in `prepareDerivedData`, and `abilityModifier`
 * extends its own formula rather than table-looking-up.
 *
 * The variant argument defaults to `""` (Superior Strength) so every call site
 * written before pg 12 landed keeps its old meaning exactly.
 *
 * Every other race returns its score unchanged.
 */
export function raceStrengthScore(race: string, score: number, variant = ""): number {
  return raceAbilityScore(race, "strength", score, variant);
}

/**
 * The score a race and variant actually operate at, for any ability (pg 11-12).
 *
 * One seam rather than three, because all three adjustments are the same kind
 * of rule — *the score itself changes*, before any modifier, carry load, or
 * skill bonus is computed from it — and because `prepareDerivedData` walks the
 * abilities in a loop. Abilities no trait touches return unchanged.
 *
 * The Nightkin Perception decay is **not** here: it is a temporary, stacking,
 * self-expiring reduction, so it is an Active Effect against
 * `system.abilities.perception.value` (`src/actions/stealth-field.ts`) rather
 * than a permanent race adjustment. That also means every raw reader of the
 * stored score — weapon range multipliers, the Unwieldy penalty — sees it for
 * free, which a derived-only reduction would not manage.
 */
export function raceAbilityScore(
  race: string,
  ability: Ability,
  score: number,
  variant = "",
): number {
  if (race !== ("superMutant" satisfies Race)) return score;
  const chosen = mutantVariantOf(variant);

  if (chosen === "defectiveStrain") {
    if (ability === "strength" || ability === "endurance") return score + DEFECTIVE_STRAIN_BONUS;
    if (ability === "intelligence") return defectiveStrainIntelligence(score);
    return score;
  }

  // Nightkin keeps Superior Strength's numbers verbatim ("Your Strength score
  // increases by 1 and cannot be lower than 6"), so it and the base trait share
  // this branch; what Nightkin adds is the Stealth Field, which is an action.
  if (ability === "strength") return Math.max(SUPER_MUTANT_STRENGTH_FLOOR, score + 1);
  return score;
}

/**
 * Defective Strain's Intelligence: "reduced by 2 and cannot be raised higher
 * than a 3" (pg 12).
 *
 * **Ruling — order of the two clauses.** Applied as `min(3, score − 2)`:
 * subtract first, then cap. The competing reading caps the *stored* score at 3
 * and then subtracts, which puts every Defective Strain character at
 * Intelligence 1 and makes the printed cap of 3 a number no one can ever have.
 * Taking the reduction first keeps both halves of the sentence load-bearing —
 * the −2 binds low scores, the cap of 3 binds high ones — and matches how the
 * sentence reads aloud: your score is reduced, and that score cannot then be
 * raised past 3.
 *
 * **Ruling — the book prints no floor** for the −2 (unlike Nightkin's decay,
 * which prints "to a minimum of 1"). It floors at `ABILITY_MIN` anyway: 0 and
 * negative scores are outside the schema's own range, `abilityModifier` has no
 * printed row for them, and the one place this book *does* speak about a
 * reduced ability score it stops at 1. Silence resolved toward the only
 * neighbouring rule rather than toward an unprinted score.
 *
 * **Not enforced at spend time.** The cap bites on the operative score here,
 * not on the level-up purchase — `src/actions/progression.ts` deliberately
 * checks no requirements (its own note says the book's requirements are
 * unstructured prose), so a player may still *buy* Intelligence 8 and simply
 * see 3 on the sheet. The number every rule reads is the capped one.
 */
export function defectiveStrainIntelligence(score: number): number {
  return Math.max(
    ABILITY_MIN,
    Math.min(DEFECTIVE_STRAIN_INTELLIGENCE_CAP, score - DEFECTIVE_STRAIN_INTELLIGENCE_PENALTY),
  );
}

/**
 * The flat carry-load increase a race grants, before any perk bonus (pg 11-12).
 *
 * All three Super Mutant traits print the same "+40" — Superior Strength,
 * Defective Strain, and Nightkin alike — so the variant changes nothing here.
 * It is still a parameter, so the one call site reads the same as the others
 * and a future variant with a different number has somewhere to land.
 */
export function raceCarryLoadBonus(race: string, variant = ""): number {
  if (race !== ("superMutant" satisfies Race)) return 0;
  return SUPER_MUTANT_CARRY_LOAD_BY_VARIANT[mutantVariantOf(variant)];
}

/**
 * Written out per variant rather than collapsed to one number, because the
 * agreement is a fact about the three printed traits and not a coincidence the
 * next variant is obliged to keep.
 */
const SUPER_MUTANT_CARRY_LOAD_BY_VARIANT: Record<MutantVariant, number> = {
  "": SUPER_MUTANT_CARRY_LOAD,
  defectiveStrain: SUPER_MUTANT_CARRY_LOAD,
  nightkin: SUPER_MUTANT_CARRY_LOAD,
};

/**
 * Whether this character has the Nightkin Stealth Field (pg 12).
 *
 * Both halves are required: the variant is only meaningful on a Super Mutant,
 * because `mutantVariantOf` deliberately does not police the race.
 */
export function hasStealthField(race: string, variant: string): boolean {
  return race === ("superMutant" satisfies Race) && mutantVariantOf(variant) === "nightkin";
}

/**
 * How much Perception this use of the Stealth Field costs (pg 12).
 *
 * > Each time you use this ability after the first use each day, your
 * > Perception ability score temporarily decreases by 1 for 24 hours (to a
 * > minimum of 1).
 *
 * `usesToday` is the count *before* this activation, so the first use of the
 * day (0 prior uses) is free and every later one is not.
 *
 * **Ruling — the decay stacks.** "Each time you use this ability after the
 * first use each day" prices every extra use, not just the second, and each
 * reduction carries its own 24-hour clock. Three extra uses is −3, expiring
 * one at a time as each 24 hours elapses. The alternative — one −1 that merely
 * refreshes — would make the fourth use of a day free, which the word "each"
 * rules out.
 *
 * **Ruling — the floor is on the score, not the count.** "to a minimum of 1"
 * stops the *score* at 1, so once a Nightkin is down to Perception 1 further
 * uses cost nothing more (there is nothing left to take) and are still allowed:
 * the book prices the ability, it never forbids it. `currentScore` is therefore
 * the score as it stands right now, decays already applied.
 */
export function stealthFieldPerceptionCost(usesToday: number, currentScore: number): number {
  if (usesToday < 1) return 0;
  return currentScore > STEALTH_FIELD_PERCEPTION_FLOOR ? STEALTH_FIELD_DECAY_STEP : 0;
}

/**
 * Whether a race's clumsiness adds a level whenever weapons or armor take decay
 * (pg 12).
 *
 * > **Bulky.** Super mutants have many advantages but precision does not come
 * > easy, whenever your weapons or armor would gain a level of decay, they gain
 * > an additional one.
 *
 * Two limits worth naming, because both are easy to overreach:
 *
 * - **Weapons and armor only.** The sentence names them, and the book has
 *   plenty of other decaying things (Power Armor is armor; junk and aid items
 *   are neither). Anything else takes decay normally.
 * - **Gaining only.** It triggers when decay *would be gained*, so repairing —
 *   which reduces decay — is not a site. `src/actions/repair.ts` is untouched.
 *
 * The book does not say what happens at the decay cap, which is the usual
 * silence: `decayItem` clamps, so a Bulky level that would push past the maximum
 * simply lands on it rather than being lost or overflowing somewhere.
 *
 * Takes no variant on purpose: the pg 12 variants replace *Superior Strength*,
 * and Bulky is a second, separately printed trait, so a Defective Strain or
 * Nightkin character is every bit as clumsy as any other Super Mutant.
 */
export function decaysExtra(race: string): boolean {
  return race === ("superMutant" satisfies Race);
}

/**
 * Races that Healing Powder does nothing for (pg 86).
 *
 * > If that creature is a human, mutant, abomination, animal, or insect […]
 * > Ghouls, robots, and gen-2 synths are unaffected by healing powder
 *
 * The book states the rule twice, once as an inclusion list and once as an
 * exclusion list, and they agree. Written as the exclusion because that is the
 * half whose members are the playable races this system actually has — "mutant,
 * abomination, animal, insect" are creature kinds, not the `RACES` a character
 * sheet can hold.
 */
export const HEALING_POWDER_IMMUNE_RACES: readonly string[] = ["ghoul", "robot", "gen2synth"];

/** Whether Healing Powder does anything for this race (pg 86). */
export function healingPowderWorks(race: string): boolean {
  return !HEALING_POWDER_IMMUNE_RACES.includes(race);
}
