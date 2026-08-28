/**
 * Derived-statistic formulas for the Fallout TTRPG (Arcane Arcade v2.1).
 * All formulas cite docs/rules-reference.md, which cites rulebook pages.
 */

import { LEVEL_MAX, LEVEL_MIN, PERKLESS_LEVELS, SKILL_POINT_LEVELS } from "./constants";

/** Modifier = score − 5 (pg 20; score 1 → −4 … 10 → +5). */
export function abilityModifier(score: number): number {
  return score - 5;
}

export function clampLevel(level: number): number {
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.floor(level)));
}

/** Number of odd levels (3rd, 5th, …) reached — the SP/HP growth step count. */
function growthSteps(level: number): number {
  return Math.floor((clampLevel(level) - 1) / 2);
}

/**
 * Maximum Stamina Points: 10 + AGI mod at 1st level, +5 + AGI mod at each odd
 * level from 3rd to 29th (pg 5). Closed form: 10 + 5k + mod·(k+1).
 */
export function maxStaminaPoints(level: number, agilityMod: number): number {
  const k = growthSteps(level);
  return 10 + 5 * k + agilityMod * (k + 1);
}

/** Maximum Hit Points: same progression as SP but with the Endurance modifier (pg 5). */
export function maxHitPoints(level: number, enduranceMod: number): number {
  const k = growthSteps(level);
  return 10 + 5 * k + enduranceMod * (k + 1);
}

/**
 * Action Points = 10 + Agility modifier (pg 127).
 *
 * Pg 24 rules "You can only ever have a maximum of 15 action points," but pg
 * 89's chem properties print their own higher caps (Stimulant/Neuro-Stimulant
 * 16, Super Stimulant/Hyperstimulant 20) — the book contradicts itself, and
 * the higher printed chem caps prove bonuses can exceed 15. `bonuses.apMax`
 * (see src/data/character.ts) sums every source — chems, effects, Power
 * Armor — into one number with no record of where each point came from, so a
 * 15 cap here cannot be limited to non-chem sources without also clipping the
 * chem caps the book explicitly prints higher. Ruling: take the chem side and
 * leave this uncapped; do not enforce the pg 24 ceiling.
 */
export function maxActionPoints(agilityMod: number): number {
  return 10 + agilityMod;
}

/** Healing Rate = half of (level + Endurance score), rounded down (pg 23). */
export function healingRate(level: number, enduranceScore: number): number {
  return Math.floor((clampLevel(level) + enduranceScore) / 2);
}

/** Maximum Carry Load = Strength score × 10 (pg 22). */
export function maxCarryLoad(strengthScore: number): number {
  return strengthScore * 10;
}

/** Passive Sense = 12 + Perception modifier (pg 22). */
export function passiveSense(perceptionMod: number): number {
  return 12 + perceptionMod;
}

/** Passive combat sequence = 10 + Perception modifier (pg 127). */
export function passiveCombatSequence(perceptionMod: number): number {
  return 10 + perceptionMod;
}

/** Radiation DC (humans only) = 12 − Endurance modifier (pg 23). */
export function radiationDC(enduranceMod: number): number {
  return 12 - enduranceMod;
}

/**
 * Half the Luck modifier (rounded down) is added to every skill (creation
 * step 5). Pg 25: a negative Luck modifier instead subtracts a flat 1 from
 * every skill "regardless of your modifier" — not half of it.
 */
export function luckSkillBonus(luckMod: number): number {
  if (luckMod < 0) return -1;
  return Math.floor(luckMod / 2);
}

/** Party Nerve = half the summed Charisma modifiers of the party, rounded down (pg 24). */
export function partyNerve(partyCharismaMods: readonly number[]): number {
  const total = partyCharismaMods.reduce((sum, mod) => sum + mod, 0);
  return Math.floor(total / 2);
}

/**
 * Group Sneak = summed Sneak bonuses ÷ party size, rounded down (character
 * sheet). Pg 4 step 15 and pg 24 both say Sneak *modifier*, not bonus — the
 * book uses the two words interchangeably elsewhere, and bonus is almost
 * certainly what's meant here too, but they are not the same number: the
 * bonus (skillBonuses.sneak) already folds in the Agility modifier and
 * luckSkillBonus, on top of skill points, while the modifier is Agility alone.
 */
export function groupSneak(partySneakBonuses: readonly number[]): number {
  if (partySneakBonuses.length === 0) return 0;
  const total = partySneakBonuses.reduce((sum, bonus) => sum + bonus, 0);
  return Math.floor(total / partySneakBonuses.length);
}

/** Level for a given XP total: 1000 XP per level, capped at 30 (pg 5). */
export function levelForXP(xp: number): number {
  return clampLevel(Math.floor(xp / 1000) + 1);
}

/** Total perk points earned by a level: 1 per level except 5, 9, 13, 17, 19 (pg 5). */
export function totalPerkPoints(level: number): number {
  const l = clampLevel(level);
  let points = 0;
  for (let i = 1; i <= l; i++) {
    if (!PERKLESS_LEVELS.includes(i)) points += 1;
  }
  return points;
}

/** Skill points granted at each milestone level, by Intelligence score (pg 5). */
export function skillPointsPerMilestone(intelligenceScore: number): number {
  if (intelligenceScore <= 4) return 3;
  if (intelligenceScore === 5) return 4;
  return 5;
}

/** Total skill points available at a level (milestones: 5, 9, 13, 17, 21, 25, 29). */
export function totalSkillPoints(level: number, intelligenceScore: number): number {
  const l = clampLevel(level);
  const milestones = SKILL_POINT_LEVELS.filter((m) => m <= l).length;
  return milestones * skillPointsPerMilestone(intelligenceScore);
}

/**
 * A threshold no kept d20 can reach, for a weapon that prints no critical hit.
 *
 * Four weapons in `packs-src/weapons.json` — Flamer, Missile Launcher, Fat-Man,
 * Cryolator — print an empty crit column, stored as `critChance: 0` with
 * `crit: ""`. They are the area-of-effect weapons, and the book gives them no
 * critical hit rather than an unreachable one.
 */
export const CRIT_IMPOSSIBLE = 21;

/**
 * Effective critical-hit threshold: the weapon's listed crit chance lowered by
 * half the Luck modifier — shotguns excepted (pg 129). Pg 25 only illustrates
 * a positive Luck modifier lowering the threshold; it never contemplates a
 * negative modifier raising it. Left unclamped, a negative Luck modifier can
 * push the threshold above 20, and since the roll compares `raw >= threshold`
 * against a kept d20 (src/dice/rolls.ts), a threshold over 20 makes critting
 * impossible — an outcome the book never intends. Clamp at 20.
 *
 * The one place that outcome *is* intended is a weapon that prints no crit at
 * all: `critChance: 0` is the "not printed" sentinel (`rules/mods.ts` reads it
 * the same way when deciding a mod cannot modify an unprinted statistic), and
 * it must not be run through the arithmetic — 0 minus a Luck modifier is a
 * threshold at or below 2, which would make a Fat-Man critical on nearly every
 * attack. It is not a floor of 2 either: 2 is where a *printed* chance stops
 * falling, and treating "no crit" as "the best crit" is the bug this guard
 * exists to prevent.
 */
export function critThreshold(weaponCritChance: number, luckMod: number, isShotgun: boolean): number {
  if (weaponCritChance <= 0) return CRIT_IMPOSSIBLE;
  if (isShotgun) return weaponCritChance;
  return Math.min(20, weaponCritChance - Math.floor(luckMod / 2));
}

/** Normal/long range in feet: listed multipliers × Perception score (pg 22). */
export function weaponRange(
  rangeMultipliers: { readonly normal: number; readonly long: number },
  perceptionScore: number,
): { normal: number; long: number } {
  return {
    normal: rangeMultipliers.normal * perceptionScore,
    long: rangeMultipliers.long * perceptionScore,
  };
}

/**
 * Which band a shot falls in: within normal range, past it, or past long range.
 *
 * `normal` is clean; `long` means "beyond normal range, within long range" and
 * carries disadvantage; `beyond` is past the weapon's long range, where the two
 * printings of this rule stop agreeing (see `rollAttack`).
 */
export type RangeBand = "normal" | "long" | "beyond";

/**
 * Classify a distance against a weapon's two range numbers (pg 21, pg 66).
 *
 * Both printings say *beyond* normal/short range, so a shot at exactly the
 * normal range is unpenalised, and one at exactly the long range is still
 * inside it. The book states no minimum range for any ranged weapon, so there
 * is no close band here to invent.
 *
 * Feed this real feet: a weapon with no printed range (every melee weapon, and
 * any statblock row that never filled the column in) has no bands at all, and
 * the caller must skip it rather than pass zeroes — a 0/0 weapon would classify
 * every distance as `beyond`.
 */
export function rangeBand(
  distanceFeet: number,
  range: { readonly normal: number; readonly long: number },
): RangeBand {
  if (distanceFeet <= range.normal) return "normal";
  if (distanceFeet <= range.long) return "long";
  return "beyond";
}
