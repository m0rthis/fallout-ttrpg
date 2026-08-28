/**
 * Resting, and the daily survival clock (pg 119, cross-confirmed on pg 133).
 *
 * The book has **no downtime system** — the word appears exactly once in 136
 * pages, inside the sentence "Resting does not have to be sleep, but could be
 * light activity, downtime, or any light activity", and is never defined. What
 * it does have is a Resting section, a food-and-water clock, and repair rules,
 * so that is what this models. There is likewise no "short rest"/"long rest"
 * taxonomy: a rest is any declared span, and thresholds decide what it buys.
 *
 * ## The 6-hour / 8-hour contradiction
 *
 * Page 119 and the Exhaustion condition (pg 133) agree with each other: an
 * organic character heals and sheds a level of exhaustion after **6 hours**, a
 * synthetic one after **2**. But pp. 21 and 24 say hit points come back at the
 * **Healing Rate** after **8 hours**, and roughly twenty perks, traits and
 * backgrounds recharge on "a rest of at least 8 hours".
 *
 * Worse, the two healing formulas are not the same number:
 *
 * - pg 23 Healing Rate: `floor((level + END score) / 2)`
 * - pg 119 rest:        `floor(END score / 2) + level`
 *
 * At level 5 with Endurance 7 that is 6 against 8. This is inherited, not new:
 * v2.0 pg 125 carries the identical Resting text.
 *
 * **This system follows pg 119**, because it is the dedicated section and the
 * Exhaustion entry independently confirms its timings. `REST_RECHARGE_HOURS`
 * records the 8-hour figure the perk text keys off, so the two readings stay
 * visible instead of one quietly winning.
 */

import type { Race } from "./constants";

/** Races that sleep, eat, drink, and tire (pg 119). */
export const ORGANIC_RACES: readonly string[] = ["human", "ghoul", "superMutant"];

/**
 * Gen-2 Synths and Robots: "no need to breathe, sleep, eat, or drink" (pp. 8-9).
 * They can still *gain* exhaustion from chems and programs, and still shed it
 * by resting — not requiring sleep is not the same as not tiring.
 */
export const SYNTHETIC_RACES: readonly string[] = ["gen2synth", "robot"];

export interface RestProfile {
  /** Hours of rest that heal hit points and drop a level of exhaustion. */
  readonly longHours: number;
  /** Whether the character accrues exhaustion for going without sleep. */
  readonly needsSleep: boolean;
  /** One hour of rest restores stamina to this fraction of maximum. */
  readonly hourlyStaminaFraction: number;
}

const ORGANIC: RestProfile = { longHours: 6, needsSleep: true, hourlyStaminaFraction: 0.5 };
const SYNTHETIC: RestProfile = { longHours: 2, needsSleep: false, hourlyStaminaFraction: 1 };

export function restProfile(race: string): RestProfile {
  return SYNTHETIC_RACES.includes(race) ? SYNTHETIC : ORGANIC;
}

/**
 * Hit points a long rest restores (pg 119).
 *
 * Organic: `half your Endurance ability score + your level`. Synthetic: `half
 * your INT or PER score + your level` — the book writes "or" and never says
 * whether that is the player's choice or the higher of the two. Taking the
 * higher is the reading that never punishes a player for a rule the book did
 * not write, and the difference is visible on the sheet either way.
 *
 * Rounding is unstated here; the book rounds down everywhere it does say
 * (bleeding, hypothermia, armor decay), so this does too.
 */
export function restHitPoints(
  race: string,
  level: number,
  scores: { endurance: number; intelligence: number; perception: number },
): number {
  const score = SYNTHETIC_RACES.includes(race)
    ? Math.max(scores.intelligence, scores.perception)
    : scores.endurance;
  return Math.floor(score / 2) + level;
}

/**
 * The duration perk and trait recharge clauses name ("after a rest of at least
 * 8 hours"), which no other rule in the book agrees with. Kept as a named
 * constant so the sheet can offer it without pretending it is the long rest.
 */
export const REST_RECHARGE_HOURS = 8;

/** Levels gained per 24 hours without the thing (pg 119, 133-134). */
export const HUNGER_PER_DAY = 1;
export const DEHYDRATION_PER_DAY = 3;
export const EXHAUSTION_PER_DAY = 1;

/** Drinks that satisfy a day, unless one of them is Hydrating (pg 133). */
export const DRINKS_PER_DAY = 3;
export const FOODS_PER_DAY = 1;

/**
 * Super Mutant "Mass Exertion" (pg 12): "The amount of required food and water
 * you need each day ... is doubled."
 *
 * The sentence can be read as doubling the *requirement* or the *levels
 * gained*. The Wasteland Camel perk (pg 54) settles it — "You no longer require
 * double the amount of water each day to avoid dehydration" — so it is the
 * requirement. Note this also makes pg 119's food-and-water bullets, which lump
 * Super Mutants in with humans and ghouls, wrong for Super Mutants.
 */
export const DOUBLE_INTAKE_RACES: readonly string[] = ["superMutant"];

export function dailyIntake(race: string): { foods: number; drinks: number } {
  const factor = DOUBLE_INTAKE_RACES.includes(race) ? 2 : 1;
  return { foods: FOODS_PER_DAY * factor, drinks: DRINKS_PER_DAY * factor };
}

/**
 * What a race actually gets out of a consumable's stamina (pg 8-9).
 *
 * - **Ghoul, Resilient Anatomy:** "Any stamina points you would gain from
 *   consuming food, drinks, or chems is halved (rounded down)."
 * - **Gen-2 Synth / Robot, Inorganic Body:** "You gain no effects from Chems,
 *   Drinks or Food." Robot Overclock Programs are not food and are unaffected.
 *
 * Applies to consumables only. Stamina from resting is a separate rule and
 * keeps its own race handling in `restProfile`.
 */
export function consumableStamina(race: string, amount: number): number {
  if (SYNTHETIC_RACES.includes(race)) return 0;
  if (race === "ghoul") return Math.floor(amount / 2);
  return amount;
}

export function isOrganic(race: string): race is Race {
  return !SYNTHETIC_RACES.includes(race);
}
