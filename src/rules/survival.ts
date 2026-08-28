/**
 * The three survival trackers in the food and drink chapter (pg 82-83):
 * irradiated levels, snack pairing, and the alcohol ladder.
 *
 * All three need state the sheet did not have, because each of them counts
 * something *across* consumptions rather than resolving on the spot.
 */

/** How many stages up the drink ladder a character is (pg 82-83). */
export const DRINK_STAGES = ["sober", "buzzed", "drunk", "hammered", "wasted"] as const;
export type DrinkStage = (typeof DRINK_STAGES)[number];
export const DRINK_STAGE_MAX = DRINK_STAGES.length - 1;
/** The rung at which alcohol addiction's exhaustion lifts (pg 82). */
export const DRINK_STAGE_DRUNK = DRINK_STAGES.indexOf("drunk");

// ------------------------------------------------------------- irradiated

/**
 * > **Irradiated.** When you consume a food that is irradiated, you gain one
 * > irradiated level. If you gain ten irradiated levels, you gain one level of
 * > rads. (pg 83)
 *
 * The book never says whether the counter resets, caps, or decays — "irradiated
 * level" appears five times in 136 pages and none of them addresses it. A
 * rolling counter that empties into a Rad every tenth item is the only reading
 * that neither grants one Rad ever nor accumulates forever without converting,
 * so that is what this does.
 *
 * Ghouls and Super Mutants (Evolution, pp. 8/11) gain no irradiated levels from
 * food or water at all.
 */
export const IRRADIATED_PER_RAD = 10;
export const IRRADIATION_IMMUNE_RACES: readonly string[] = ["ghoul", "superMutant", "gen2synth", "robot"];

export function addIrradiated(
  current: number,
  levels: number,
): { irradiated: number; rads: number } {
  const total = Math.max(0, current + levels);
  return { irradiated: total % IRRADIATED_PER_RAD, rads: Math.floor(total / IRRADIATED_PER_RAD) };
}

// ------------------------------------------------------------------ snack

/**
 * > **Snack.** If you consume a food with this property, you do not remove any
 * > levels of hunger unless you consume two foods with this property. (pg 83)
 *
 * Three things are undefined and all three had to be decided:
 *
 * - **Same snack, or any two?** "two foods with this property" reads as any
 *   two, so the counter is per-character rather than per-item.
 * - **A time window?** None is printed, so none is imposed.
 * - **How much hunger does the pair remove?** The sentence only negates; it
 *   never states the payout. Since every food's baseline is one level, the pair
 *   unlocking both baselines — **two levels** — is the reading taken here. The
 *   alternative (a pair counts as one food) is equally defensible and halves
 *   the value of snacks, so the chat card names which reading it used.
 */
export const SNACKS_PER_MEAL = 2;
export const SNACK_PAIR_HUNGER = 2;

export function eatSnack(pending: number): { pending: number; hungerRemoved: number } {
  const next = pending + 1;
  if (next < SNACKS_PER_MEAL) return { pending: next, hungerRemoved: 0 };
  return { pending: next - SNACKS_PER_MEAL, hungerRemoved: SNACK_PAIR_HUNGER };
}

// ------------------------------------------------------------ the ladder

/**
 * Alcoholic and High-Proof share one escalation track (pg 82-83).
 *
 * > **Alcoholic.** …and your Endurance ability score is equal to 5 or higher,
 * > you become buzzed for 1d4 hours. Endurance ability score is equal to 4 or
 * > lower, you become drunk instead. If you are already buzzed…you become drunk
 * > …If you are drunk, and drink **two more**…you become hammered…If you are
 * > hammered, and drink **two more**…you become wasted.
 *
 * High-Proof is the same ladder started one rung higher.
 *
 * Note the asymmetry the book prints and this keeps: one drink moves you from
 * buzzed to drunk, but **two** are needed for each step after that.
 */
export const LOW_ENDURANCE_SCORE = 4;
export const DRINK_STAGE_HOURS = "1d4";

/** Drinks needed to leave a stage, indexed by the stage you are in. */
const DRINKS_TO_ADVANCE: readonly number[] = [
  1, // sober   -> the first drink always lands
  1, // buzzed  -> drunk on one more
  2, // drunk   -> hammered on two more
  2, // hammered-> wasted on two more
  0, // wasted  -> nowhere left to go
];

export interface DrinkResult {
  stage: number;
  /** Drinks banked toward the next stage. */
  progress: number;
  /** True when this drink moved the character up a rung. */
  advanced: boolean;
}

/**
 * Apply one alcoholic or high-proof drink.
 *
 * `highProof` starts the ladder a rung higher, and an Endurance score of 4 or
 * lower starts it a rung higher still — the two stack on a first drink, which
 * is why a frail character's first shot of moonshine lands them at hammered.
 */
export function drinkAlcohol(
  stage: number,
  progress: number,
  enduranceScore: number,
  highProof: boolean,
): DrinkResult {
  if (stage >= DRINK_STAGE_MAX) return { stage: DRINK_STAGE_MAX, progress: 0, advanced: false };

  // The opening rung, when the character is still sober.
  if (stage === 0) {
    const weak = enduranceScore <= LOW_ENDURANCE_SCORE ? 1 : 0;
    const start = 1 + (highProof ? 1 : 0) + weak;
    return { stage: Math.min(DRINK_STAGE_MAX, start), progress: 0, advanced: true };
  }

  const needed = DRINKS_TO_ADVANCE[stage] ?? 1;
  const banked = progress + 1;
  if (banked < needed) return { stage, progress: banked, advanced: false };
  return { stage: Math.min(DRINK_STAGE_MAX, stage + 1), progress: 0, advanced: true };
}

export interface DrinkEffects {
  /** Maximum AP lost (Drunk and above). */
  apPenalty: number;
  /** Maximum SP gained, as a multiple of character level. */
  staminaPerLevel: number;
  /** Flat penalty to every d20 except Luck (Hammered and above). */
  d20Penalty: number;
  /** Buzzed and above: disadvantage on these, advantage on the others. */
  disadvantage: readonly ("intelligence" | "perception")[];
  advantage: readonly ("endurance" | "strength")[];
  /** Wasted: unconscious after an hour, and no memory of any of it. */
  blackout: boolean;
}

/**
 * What each rung does, cumulatively (pg 133-135).
 *
 * Hammered reads "you gain the effects of buzzed and drunk. **Additionally**,
 * your maximum stamina points increase by a number equal to your level" — which
 * taken literally is a *second* helping on top of Drunk's, so twice the level.
 * "Additionally" is doing explicit work there, so the literal reading stands,
 * but it may equally be a copy-paste of the Drunk line.
 *
 * The Hammered entry also opens "While **drunk**…", plainly a typo for "While
 * hammered". Read as its own heading.
 */
export function drinkEffects(stage: number): DrinkEffects {
  const none: DrinkEffects = {
    apPenalty: 0,
    staminaPerLevel: 0,
    d20Penalty: 0,
    disadvantage: [],
    advantage: [],
    blackout: false,
  };
  if (stage <= 0) return none;
  const buzzed = {
    ...none,
    disadvantage: ["intelligence", "perception"] as const,
    advantage: ["endurance", "strength"] as const,
  };
  if (stage === 1) return buzzed;
  // Drunk: −2 AP and +level stamina.
  if (stage === 2) return { ...buzzed, apPenalty: 2, staminaPerLevel: 1 };
  // Hammered: a second +level stamina, and −5 on every d20 but Luck.
  if (stage === 3) return { ...buzzed, apPenalty: 2, staminaPerLevel: 2, d20Penalty: 5 };
  return { ...buzzed, apPenalty: 2, staminaPerLevel: 2, d20Penalty: 5, blackout: true };
}

/** Alcohol addiction's Endurance check (pg 82) — one lower than a chem's. */
export const ALCOHOL_ADDICTION_DC = 5;
/** While addicted and not drunk, you carry these permanently. */
export const ALCOHOL_ADDICTION_EXHAUSTION = 2;

/**
 * Whether a drink triggers the Addictive check.
 *
 * The printed trigger is "a drink with the **Alcoholic** property that also has
 * this property", which by the letter exempts every High-Proof drink — and the
 * eight drinks carrying Addictive alongside High-Proof are precisely the hard
 * liquors: absinthe, moonshine, rum, scotch, vodka, tequila, whiskey and the
 * Dirty Wastelander. Beer and wine would check; whiskey would not.
 *
 * Every other clause in both properties says "alcoholic or high-proof", so this
 * reads Alcoholic there as the category. That is a deliberate deviation from
 * the printed word, and the compendium already flags it per item.
 */
export function triggersAlcoholAddiction(alcoholic: boolean, highProof: boolean): boolean {
  return alcoholic || highProof;
}
