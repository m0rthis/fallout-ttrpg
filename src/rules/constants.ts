/**
 * Rules constants for the Fallout TTRPG (Arcane Arcade v2.1).
 * See docs/rules-reference.md for page citations.
 */

export const ABILITIES = [
  "strength",
  "perception",
  "endurance",
  "charisma",
  "intelligence",
  "agility",
  "luck",
] as const;

export type Ability = (typeof ABILITIES)[number];

export const ABILITY_ABBREVIATIONS = {
  strength: "STR",
  perception: "PER",
  endurance: "END",
  charisma: "CHA",
  intelligence: "INT",
  agility: "AGI",
  luck: "LCK",
} as const satisfies Record<Ability, string>;

/** PC ability score bounds (monsters may go to 20). */
export const ABILITY_MIN = 1;
export const ABILITY_MAX = 10;
export const ABILITY_MAX_CREATURE = 20;

export interface SkillDefinition {
  /** Governing ability. */
  readonly ability: Ability;
  /** Alternative governing ability the player may opt into (e.g. Breach PER/INT). */
  readonly altAbility?: Ability;
}

export const SKILLS = {
  barter: { ability: "charisma" },
  breach: { ability: "perception", altAbility: "intelligence" },
  crafting: { ability: "intelligence" },
  energyWeapons: { ability: "perception" },
  explosives: { ability: "perception" },
  guns: { ability: "agility" },
  intimidation: { ability: "strength", altAbility: "charisma" },
  medicine: { ability: "perception", altAbility: "intelligence" },
  meleeWeapons: { ability: "strength" },
  science: { ability: "intelligence" },
  sneak: { ability: "agility" },
  speech: { ability: "charisma" },
  survival: { ability: "endurance" },
  unarmed: { ability: "strength" },
} as const satisfies Record<string, SkillDefinition>;

export type SkillKey = keyof typeof SKILLS;
export const SKILL_KEYS = Object.keys(SKILLS) as SkillKey[];

/** Task difficulty ladder (pg 21). */
export const DIFFICULTY_CLASSES = {
  trivial: 1,
  veryEasy: 4,
  easy: 8,
  medium: 12,
  hard: 16,
  veryHard: 20,
  nearlyImpossible: 25,
  heroic: 30,
} as const;

export const RACES = ["human", "ghoul", "gen2synth", "robot", "superMutant"] as const;
export type Race = (typeof RACES)[number];

/** Races immune to hunger and dehydration (character sheet note). */
export const HUNGER_IMMUNE_RACES: readonly string[] = ["gen2synth", "robot"];
/** Only humans are subject to radiation (character sheet note). */
export const RADIATION_SUSCEPTIBLE_RACES: readonly string[] = ["human"];

/**
 * Death Save failures that kill. v2.1 gave Humans "Tenacity" (pg 8): they die
 * on the fourth failure rather than the third; every other race still dies on
 * the third.
 */
export const DEATH_SAVE_FAILURES = 3;
export const DEATH_SAVE_FAILURES_HUMAN = 4;
export const TENACIOUS_RACES: readonly string[] = ["human"];

export function deathSaveFailureLimit(race: string): number {
  return TENACIOUS_RACES.includes(race) ? DEATH_SAVE_FAILURES_HUMAN : DEATH_SAVE_FAILURES;
}

export const MELEE_WEAPON_TYPES = ["bladed", "blunt", "mechanical", "unarmed"] as const;
export const RANGED_WEAPON_TYPES = [
  "handgun",
  "submachineGun",
  "rifle",
  "shotgun",
  "bigGun",
  "energyWeapon",
] as const;
export type MeleeWeaponType = (typeof MELEE_WEAPON_TYPES)[number];
export type RangedWeaponType = (typeof RANGED_WEAPON_TYPES)[number];
export type WeaponType = MeleeWeaponType | RangedWeaponType;

/** Which skill each weapon type attacks with (creation checklist step 21). */
export const WEAPON_TYPE_SKILL = {
  bladed: "meleeWeapons",
  blunt: "meleeWeapons",
  mechanical: "meleeWeapons",
  unarmed: "unarmed",
  handgun: "guns",
  submachineGun: "guns",
  rifle: "guns",
  shotgun: "guns",
  bigGun: "guns",
  energyWeapon: "energyWeapons",
} as const satisfies Record<WeaponType, SkillKey>;

export const ARMOR_TYPES = [
  "cloth",
  "leather",
  "metal",
  "multilayered",
  "ballisticWeave",
  "steel",
] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];

/** Leveled ("stacking") conditions tracked as numeric levels on the sheet. */
export const LEVELED_CONDITIONS = [
  "bleeding",
  "hunger",
  "dehydration",
  "exhaustion",
  "fatigue",
  "rads",
  // v2.1 (pg 134-135): exposure conditions from the new Hazardous Weather
  // chapter, and the robot/synth analogue of bleeding.
  "hypothermia",
  "overheating",
  "shortCircuit",
] as const;
export type LeveledCondition = (typeof LEVELED_CONDITIONS)[number];

/**
 * Leveled conditions that subtract one per level from d20 rolls (v2.1 pg
 * 133-135). Bleeding and Short Circuit deal damage instead, so neither
 * appears here.
 */
export const D20_PENALTY_CONDITIONS = [
  "hunger",
  "dehydration",
  "exhaustion",
  "fatigue",
  "rads",
  "hypothermia",
  "overheating",
] as const;

/**
 * Exposure conditions also cut maximum AP by half their level, rounded down
 * (v2.1 pg 134).
 */
export const AP_HALVING_CONDITIONS = ["hypothermia", "overheating"] as const;

/**
 * Radiation (v2.1 pg 124). Each level gained deals this much to hit points AND
 * stamina points, unhealable until every level is gone; v2.0 dealt 1d12 to hit
 * points only.
 */
export const RADIATION_DAMAGE = "1d4";
/** Succeeding a radiation check raises the DC by 2 until all Rads clear. */
export const RADIATION_DC_ESCALATION = 2;
/** Luck check to come back as a ghoul after radiation kills you. */
export const RADIATION_REVIVAL_DC = 20;
/** Rolling below this on that check returns you feral, under GM control. */
export const RADIATION_FERAL_ROLL = 5;

/** Level at which hunger, dehydration, or exhaustion kills (pg 135-136). */
export const LETHAL_CONDITION_LEVEL = 10;
/**
 * Dazed cuts maximum AP by a flat 3 in v2.1 (pg 133); v2.0 halved it instead.
 * Applied from the token status, since Dazed has no level.
 */
export const DAZED_AP_PENALTY = 3;

/** Fatigue cannot exceed nine levels (pg 136). */
export const FATIGUE_MAX = 9;

export const BINARY_CONDITIONS = [
  "blinded",
  "burning",
  "buzzed",
  "dazed",
  "deafened",
  "drunk",
  "dying",
  "encumbered",
  "frightened",
  "grappled",
  "hammered",
  "heavilyEncumbered",
  "invisible",
  "poisoned",
  "prone",
  "shock",
  "slowed",
] as const;
export type BinaryCondition = (typeof BINARY_CONDITIONS)[number];

/** The thirteen damage types (v2.1 pg 129-area; radiation is tracked separately as rad levels). */
export const DAMAGE_TYPES = [
  "acid",
  "ballistic",
  "bludgeoning",
  "cold",
  "electricity",
  "explosive",
  "fire",
  "impact",
  "laser",
  "piercing",
  "plasma",
  "poison",
  "slashing",
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Items break entirely at ten decay levels; weapons lose 1 attack per level,
 * armor loses 1 AC and 1 DT per two levels. */
export const DECAY_MAX = 10;

export const XP_PER_LEVEL = 1000;
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 30;

/** Levels that do NOT grant a perk point (pg 5). */
export const PERKLESS_LEVELS: readonly number[] = [5, 9, 13, 17, 19];

/** Levels that grant skill points (pg 5). */
export const SKILL_POINT_LEVELS: readonly number[] = [5, 9, 13, 17, 21, 25, 29];

export const RELOAD_AP_COST = 6;
export const UNARMED_STRIKE_AP_COST = 3;
/** v2.1 (pg 127): "you can make two unarmed strikes by spending 5 AP". */
export const UNARMED_DOUBLE_STRIKE_AP_COST = 5;
export const SPRINT_AP_COST = 5;
export const BLOCK_AP_COST = 3;
export const DEATH_SAVE_AP_COST = 2;
/** Actions in Combat, read off the pg 126 table as a rendered page image. */
export const GRAPPLE_AP_COST = 3;
export const ESCAPE_AP_COST = 5;
export const HELP_AP_COST = 6;
/**
 * Ready is the one row in that table printed as "+2 AP" rather than a cost:
 * it is a surcharge on top of the readied action's own price (pg 126).
 */
export const READY_AP_SURCHARGE = 2;
export const DEATH_SAVE_DC = 10;
/** Blind attacks roll against 5 + one per 5 feet of distance (pg 128). */
/**
 * @deprecated Superseded by `BLIND_ATTACK_DC_BASE` + `blindAttackDC()` in
 * `src/rules/stealth.ts`, which reads pg 128's "the amount of feet … rounded
 * down in increments of 5" correctly. Kept only so an external macro that
 * imported it still compiles; nothing in this system reads it.
 */
export const BLIND_ATTACK_BASE_DC = 5;
export const BASE_AC = 10;

/**
 * Burning (pg 133): "A burning creature takes 1d10 fire damage at the start of
 * their turns. They can spend 6 AP to put themselves out."
 *
 * The AP is reported rather than deducted, like every other cost in this
 * system — putting yourself out is a button the player presses, and the number
 * is what the card tells them it costs.
 */
export const BURNING_DAMAGE = "1d10";
export const BURNING_EXTINGUISH_AP = 6;

/**
 * **Short Circuit** (pg 135), one of the three conditions v2.1 added and the
 * robot/Gen-2-Synth analogue of Bleeding — the reason those races can be immune
 * to Bleeding at all (pg 9).
 *
 * > At the start of each of your turns, for each level of Short Circuit you
 * > have, you take 1d12 electricity damage to your hit points and your maximum
 * > AP is reduced by a 1. If you become wet while you have levels of short
 * > circuit, you gain double the levels. You remove all levels of short circuit
 * > if you start dying or are healed to full hit points. You can also spend 6 AP
 * > on your turn to re-route and reset your circuit, when you do you remove one
 * > level of short circuit.
 *
 * Only the max-AP clause shipped for a while, which left the condition a counter
 * with no clock. Four rulings the entry needs and does not print:
 *
 * 1. **The damage lands on hit points directly**, like Bleeding's, rather than
 *    through the attack pipeline. The sentence routes it to hit points itself,
 *    and stamina, Damage Threshold and Power Armor's Defense Points are all
 *    defences against something arriving from outside — a fault ticking inside
 *    the chassis is not that.
 * 2. **The damage type is still real.** It is *electricity* damage, so a
 *    resistance halves it and a vulnerability doubles it. That is not a
 *    technicality: a Robobrain's NeuroTransmitters (pg 11) is an electricity
 *    vulnerability, so the one body plan most likely to short out is the one
 *    that takes double for it. The adjustment is applied **once, to the summed
 *    total** rather than to each level's die: halving per die would round down
 *    once per level, which is harsher than one roll of `Nd12` and harsher than
 *    anything the entry says.
 * 3. **One roll per level**, not one roll times the level count. "For each level
 *    … you take 1d12" reads as a die per level, and it is the reading that
 *    matches Burning's per-turn `1d10` and the failure-tier dice in crafting.
 * 4. **"Start dying" is reaching 0 hit points**, the same trigger the death-save
 *    machinery already uses, and it is checked *after* this turn's tick — a tick
 *    that drops the creature to 0 clears the condition that caused it, which is
 *    what "you start dying" describes.
 *
 * The die is stored as a **size**, not as a formula, and the formula is built by
 * a function. It shipped once as the string `"1d12"` with the tick prefixing the
 * level count — which concatenates rather than multiplies, so one level rolled
 * `11d12` and two rolled `21d12`, averaging 71 damage a turn instead of 6.5.
 * `tsc` cannot see inside a template literal and `npm run verify` passed. Ruling
 * 3 above was right the whole time; only the string was wrong. Splitting the
 * size out the way `light.ts` splits `FLAME_DIE_SIZE` makes the multiplication
 * explicit and the slip unwritable.
 */
/**
 * The ceiling the sheet puts on a leveled-condition input.
 *
 * A display convention, not a schema rule: `levelField` in `data/character.ts`
 * has no maximum, because several conditions have no printed cap. Ten is where
 * the printed tracks stop for the ones that have one. Short Circuit is exempt —
 * it doubles on becoming wet with no ceiling at all (pg 135).
 */
export const CONDITION_TRACK_MAX = 10;

export const SHORT_CIRCUIT_DIE = 12;

/** `N` levels of Short Circuit roll `Nd12` (pg 135). */
export function shortCircuitFormula(levels: number): string {
  return `${String(Math.max(0, Math.floor(levels)))}d${String(SHORT_CIRCUIT_DIE)}`;
}
export const SHORT_CIRCUIT_DAMAGE_TYPE = "electricity";
export const SHORT_CIRCUIT_REROUTE_AP = 6;
/** "you gain double the levels" — the multiplier, not an addition (pg 135). */
export const SHORT_CIRCUIT_WET_MULTIPLIER = 2;
