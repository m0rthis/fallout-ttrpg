import {
  ABILITIES,
  ABILITY_MAX_CREATURE,
  ABILITY_MIN,
  type Ability,
  BASE_AC,
  AP_HALVING_CONDITIONS,
  D20_PENALTY_CONDITIONS,
  DAZED_AP_PENALTY,
  FATIGUE_MAX,
  HUNGER_IMMUNE_RACES,
  LEVEL_MAX,
  LEVEL_MIN,
  LEVELED_CONDITIONS,
  type LeveledCondition,
  RADIATION_SUSCEPTIBLE_RACES,
  SKILL_KEYS,
  SKILLS,
  type SkillKey,
} from "../rules/constants";
import {
  abilityModifier,
  healingRate,
  luckSkillBonus,
  maxActionPoints,
  maxCarryLoad,
  maxHitPoints,
  maxStaminaPoints,
  passiveSense,
  radiationDC,
} from "../rules/formulas";
import { addictionRecoveryWeeks, chemLimit, parseAddictions } from "../rules/chems";
import {
  ADVANTAGE_CATEGORIES,
  type AdvantageCategory,
  BONUS_KEYS,
  type BonusKey,
  CHECK_SCOPES,
  type CheckScope,
  DERIVED_CONDITIONS,
  EFFECT_CONDITIONS,
  type EffectCondition,
  HOARDER_LOAD,
  MOVE_CAP_UNCAPPED,
} from "../rules/effects";
import {
  type DiseaseDefinition,
  DISEASE_AP_FLOOR,
  findDisease,
} from "../rules/diseases";
import {
  magazineBonuses,
  type MagazineBonuses,
  parseIssues,
  SPEND_KINDS,
} from "../rules/progression";
import type { EnvironmentFlags } from "../rules/weather";
import {
  ALCOHOL_ADDICTION_EXHAUSTION,
  DRINK_STAGE_DRUNK,
  DRINK_STAGE_MAX,
  drinkEffects,
} from "../rules/survival";
import {
  HYDRAULIC_STRENGTH,
  overheatThreshold,
  type RadiationProtection,
  radiationProtection,
  refillsDefensePoints,
} from "../rules/power-armor";
import type { ArmorData } from "./armor";
import { mutantVariantOf, raceAbilityScore, raceCarryLoadBonus } from "../rules/races";
import { robotTraitsFor } from "../rules/robots";

const fields = (): typeof foundry.data.fields => foundry.data.fields;

/**
 * A comma-separated defence list, split the way the damage pipeline reads it.
 *
 * `defenses.resistances` and `defenses.vulnerabilities` are free text (pg 133)
 * so a GM can type anything a statblock prints; `applyDamage` has always
 * lower-cased and trimmed each entry before comparing, and this reproduces that
 * exactly rather than inventing a second normalisation.
 */
export function defenceList(csv: string): string[] {
  return csv
    .toLowerCase()
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

interface ResourceSource {
  value: number;
}

interface PoolSource extends ResourceSource {
  /** Radiation damage that healing cannot restore until Rads reach 0 (pg 124). */
  locked: number;
}

/**
 * One disease a character is carrying (pg 120).
 *
 * The clock is kept in hours remaining rather than as a world timestamp, and
 * advanced explicitly, because every other clock in this system is GM-driven
 * too — and because "x2 antibiotics, each one taken one day apart" needs to
 * measure elapsed time between doses, which a countdown gives for free.
 */
export interface DiseaseSource {
  key: string;
  /** Hours left to run; null means "until you sleep". */
  remainingHours: number | null;
  /** Cure doses taken so far. */
  doses: number;
  /** Hours since the last dose, for the one-day spacing rule. */
  sinceDoseHours: number;
  /** Hours of Med-X suppression left (Fever only). */
  suppressedHours: number;
}

/**
 * One level-up point, and what it went on (pg 5).
 *
 * `kind` is `"skill"`, `"ability"` or `"perk"` — the last two both spend a perk
 * point, because pg 5 makes them alternatives for the same currency. `key` is a
 * skill key, an ability key, or a perk's *name*, which is why it is free text
 * rather than a constrained choice: perks are documents with arbitrary names,
 * including homebrew ones.
 *
 * A record is a receipt, not the effect. Spending skill points also raises
 * `skills.<key>.points`, which is where the derived pass reads them from — this
 * ledger exists because that field cannot tell an invested point from a
 * background's +2 (`SkillSource.points` has always held both).
 */
export interface SpendSource {
  kind: string;
  key: string;
  points: number;
  level: number;
  note: string;
}

/**
 * One XP award as it landed on this character (pg 5).
 *
 * Stored per character rather than per party because the catch-up rule hands
 * different characters different amounts from the same award, and a party that
 * cannot see the difference cannot check it. `total` is the XP total after the
 * award, so the log reads as a running balance without recomputing history.
 */
export interface AwardSource {
  xp: number;
  reason: string;
  total: number;
}

/**
 * One magazine title's read-issue ledger (pg 88).
 *
 * pg 88 tells the *player* to keep this list by hand ("Be sure to keep track of
 * which issues you've read after reading them"), which is the whole reason it
 * is stored: nothing else in the book asks a character sheet to remember a set
 * of integers. `issues` is a comma-separated list for the same reason
 * `chems.addictions` and `defenses.resistances` are — a `SetField` of numbers
 * would be a new field shape for one use, and this one is meant to be legible
 * and editable by hand.
 */
export interface MagazineSource {
  title: string;
  issues: string;
  /** Whether this title's "+1 until you rest" is currently in force. */
  untilRest: boolean;
  /**
   * The skill recorded when the issue was read; empty on entries written
   * before this field existed, which fall back to resolving from the title.
   */
  skill: string;
}

/** Advantage or disadvantage counters, by category, by skill, and by check. */
export interface ScopeCounters extends Record<AdvantageCategory, number> {
  skills: Record<SkillKey, number>;
  checks: Record<CheckScope, number>;
}

interface SkillSource {
  /** Invested skill points + background bonuses (permanent +1s). */
  points: number;
  /** Use the alternative governing ability (e.g. Breach via INT instead of PER). */
  useAlt: boolean;
}

export interface CharacterSource {
  abilities: Record<Ability, { value: number }>;
  skills: Record<SkillKey, SkillSource>;
  resources: {
    hp: PoolSource;
    sp: PoolSource;
    ap: ResourceSource & { recycled: number; turnStart: number };
    /**
     * Temporary hit points (Anabolic chems, several perks). Spent before hit
     * points and never healed back — a pool, not a maximum, which is why this
     * is stored rather than an effect-written bonus.
     */
    tempHp: number;
    /**
     * Turns of Healing Powder left to pay out (pg 86). Ticked down at the start
     * of each of this creature's turns by `src/combat/turns.ts`.
     */
    healRounds: number;
    deathSaves: { successes: number; failures: number };
  };
  /** Escalating Radiation DC bonus, cleared when the last Rad level goes. */
  radiation: { dcBonus: number };
  defenses: { resistances: string; vulnerabilities: string };
  overrides: {
    hpMax: number | null;
    spMax: number | null;
    apMax: number | null;
    ac: number | null;
    dt: number | null;
  };
  conditions: Record<LeveledCondition, number> & { notes: string };
  /** Diseases currently running (pg 120). */
  diseases: DiseaseSource[];
  /** Ambient exposure the weather and hazard rules read (pg 121-123). */
  environment: EnvironmentFlags;
  /** Chem/program intake tracked per in-game day (pg 89). */
  chems: { usedToday: number; addictions: string };
  /** Counters the food and drink chapter needs across consumptions (pg 82-83). */
  survival: {
    /** Irradiated levels; every tenth becomes a level of Rads. */
    irradiated: number;
    /** Snack foods eaten toward the next pair. */
    snacks: number;
    /** 0 sober, 1 buzzed, 2 drunk, 3 hammered, 4 wasted. */
    drinkStage: number;
    /** Drinks banked toward the next rung. */
    drinkProgress: number;
    /** Hours left at this rung, rolled 1d4 each time it changes. */
    drinkHours: number;
    /** Addicted to alcohol: two levels of exhaustion unless drunk (pg 82). */
    alcoholAddiction: boolean;
    /** Consumed since the last day rolled over, for the 24-hour clock. */
    foodsToday: number;
    drinksToday: number;
    /** A hydrating drink satisfies a whole day's water by itself (pg 133). */
    hydratedToday: boolean;
    /** Whether the character has slept in the current day. */
    sleptToday: boolean;
    /** Hours since a Handy's tank was last filled (pg 10). */
    fuelHours: number;
    /** A fusion core is loaded in the chassis: 30 days a fill (pg 10). */
    fuelCore: boolean;
  };
  /**
   * Flat bonuses written by Active Effects (perks, traits, chems). These are
   * real schema fields so effects stay guided and validated; the derived pass
   * folds them into the numbers the sheet shows.
   */
  bonuses: Record<BonusKey, number> & {
    skills: Record<SkillKey, number>;
    advantage: ScopeCounters;
    disadvantage: ScopeCounters;
    /**
     * Tightest movement cap in force, or `MOVE_CAP_UNCAPPED` when none is. Not
     * a `BonusKey` because it does not initialise at 0 and does not sum — see
     * `MOVE_CAP_UNCAPPED` for why a cap needs a sentinel and `downgrade`.
     */
    moveCap: number;
  };
  /**
   * Situations the table has declared true right now (pg-agnostic: these are
   * fiction the sheet cannot see, like "in a settlement"). Conditions the sheet
   * *can* evaluate are derived instead and never stored here.
   */
  situations: Record<EffectCondition, boolean>;
  details: {
    race: string;
    robotType: string;
    /** Which pg 12 variant a Super Mutant took, or "" for Superior Strength. */
    mutantVariant: string;
    background: string;
    level: number;
    xp: number;
    biography: string;
  };
  /**
   * Levelling and the two other ledgers nothing else had a home for (pg 5, 22,
   * 88): what the level-up points were spent on, the XP awards that arrived,
   * which magazine issues have been read, and whether Barter's Discount is
   * still available.
   */
  progression: {
    spends: SpendSource[];
    awards: AwardSource[];
    magazines: MagazineSource[];
    /** Barter's Discount spent; recharges on an 8-hour rest (pg 22). */
    discountUsed: boolean;
  };
  currency: { caps: number; karmaCaps: number; karmaCapsFlipped: number };
}

/** A disease's stored state resolved against its rulebook entry. */
export interface ActiveDisease extends DiseaseSource {
  definition: DiseaseDefinition;
  /** True while Med-X is holding a Fever down: it runs, but does nothing. */
  suppressed: boolean;
}

/** The Power Armor a character is currently wearing (pg 57-59). */
export interface WornPowerArmor {
  /** The suit item's id, so the sheet and actions can reach it. */
  itemId: string;
  name: string;
  decay: number;
  /** Allotted time left, in minutes, and what a fresh core restores. */
  minutes: number;
  capacity: number;
  /** The pg 58 armor state, not the leveled condition of the same name. */
  overheated: boolean;
  /** Allotted time and reserve both gone: the suit has stopped (pg 58). */
  ceased: boolean;
  /** Running total from Fusion Core targeted attacks (pg 58). */
  coreDamage: number;
  /** AP this turn may spend before the suit overheats, Core Assembly included. */
  overheatThreshold: number;
  /** What the suit's decay does to the wearer's radiation protection (pg 57). */
  radiation: RadiationProtection;
  /** Whether emptying the DP pool still refills it (pg 57). */
  refillsDefensePoints: boolean;
}

/** Values computed each data-preparation cycle, never stored. */
export interface CharacterDerived {
  abilityMods: Record<Ability, number>;
  /** The scores actually operated at: race, variant and Power Armor applied. */
  abilityScores: Record<Ability, number>;
  skillBonuses: Record<SkillKey, number>;
  skillAbilities: Record<SkillKey, Ability>;
  hpMax: number;
  spMax: number;
  apMax: number;
  healingRate: number;
  carryLoadMax: number;
  carryLoad: number;
  passiveSense: number;
  radiationDC: number | null;
  ac: number;
  dt: number;
  /** DT against melee attacks specifically — the general DT plus any Block. */
  dtMelee: number;
  /**
   * Damage types this creature takes double from (pg 133): whatever is typed in
   * `defenses.vulnerabilities`, plus anything its race or robot sub-type adds —
   * currently only the Robobrain's NeuroTransmitters (pg 11).
   *
   * Derived rather than written back into the stored string, so the sheet's
   * field keeps showing exactly what a person typed into it. `applyDamage`
   * reads this list; nothing reads the raw string for vulnerabilities any more.
   */
  vulnerabilities: string[];
  /**
   * Damage types this creature takes half from (pg 133): the typed string,
   * normalised once. Derived for symmetry with `vulnerabilities`, so
   * `applyDamage` reads both sides through one normaliser (`defenceList`) —
   * no trait grants a resistance yet, but the seam exists for the first that
   * does, and the two lists can no longer normalise differently.
   */
  resistances: string[];
  /** Flat penalty applied to every d20 roll from leveled conditions. */
  d20Penalty: number;
  /** Flat bonus to every d20 roll, from perks/traits/chems. */
  d20Bonus: number;
  /** Flat bonus to every damage roll, from perks/traits/chems. */
  damageBonus: number;
  /**
   * Flat modifier on attack rolls only — the pg 129 limb conditions' "−2/−5 to
   * all attack rolls". Separate from `d20Bonus` because those conditions do not
   * touch skill checks; see the `attack` entry in `BONUS_KEYS`.
   */
  attackBonus: number;
  immuneHunger: boolean;
  immuneRadiation: boolean;
  /** The worn suit's state, or null when the character is not in one (pg 57-59). */
  powerArmor: WornPowerArmor | null;
  /** Ceilings healing may restore to, once radiation-locked damage is excluded. */
  hpHealableMax: number;
  spHealableMax: number;
  /** "", "encumbered" over the limit, or "heavy" over double it (pg 133-134). */
  encumbrance: "" | "encumbered" | "heavy";
  /** Net advantage/disadvantage counts per scope, statuses included. */
  advantage: ScopeCounters;
  disadvantage: ScopeCounters;
  /** Every situation that holds right now — sheet-derived and table-declared. */
  situations: Record<EffectCondition, boolean>;
  /** Chems usable per day before overdosing (pg 89). */
  chemLimit: number;
  /** Diseases in force, each paired with its rulebook entry (pg 120). */
  diseases: ActiveDisease[];
  /**
   * Condition levels a disease granted that cannot be removed while it lasts —
   * Dysentery's four Dehydration, Parasites' four Hunger (pg 120).
   */
  conditionFloors: Partial<Record<LeveledCondition, number>>;
  /** Hard cap on feet moved per turn, from Sludge lung. */
  moveCapFeet: number | null;
  /** Extra AP an attack costs, from Jelly fingers and Lock joint. */
  attackApSurcharge: { ranged: number; melee: number };
  /** Ranged damage reduction from Rattle hands, floored at 1 damage. */
  rangedDamagePenalty: number;
  /** Weeks of abstinence needed to shake an addiction (pg 89). */
  addictionRecoveryWeeks: number;
  /** Chems taken past the limit today; each costs 5 levels of exhaustion. */
  chemsOverLimit: number;
  addictions: string[];
  /** Where the character sits on the drink ladder, and what it costs them. */
  drinkStage: number;
  drinkBlackout: boolean;
  /** Flat bonus added to the Combat Sequence roll. */
  initiativeBonus: number;
  /** Added to the party-wide Nerve on death saves. */
  partyNerveBonus: number;
  /** Karma Caps held, once perks that grant extra ones are counted. */
  karmaCapsMax: number;
  /**
   * Skill magazine bonuses already folded into `skillBonuses` (pg 88), kept
   * split so the sheet can say which half of a skill's +2 goes away at the next
   * rest and which half is permanent.
   */
  magazines: MagazineBonuses;
}

export class CharacterData extends foundry.abstract.TypeDataModel implements CharacterSource {
  declare abilities: CharacterSource["abilities"];
  declare skills: CharacterSource["skills"];
  declare resources: CharacterSource["resources"];
  declare defenses: CharacterSource["defenses"];
  declare overrides: CharacterSource["overrides"];
  declare conditions: CharacterSource["conditions"];
  declare diseases: CharacterSource["diseases"];
  declare environment: CharacterSource["environment"];
  declare chems: CharacterSource["chems"];
  declare survival: CharacterSource["survival"];
  declare situations: CharacterSource["situations"];
  declare radiation: CharacterSource["radiation"];
  declare bonuses: CharacterSource["bonuses"];
  declare details: CharacterSource["details"];
  declare progression: CharacterSource["progression"];
  declare currency: CharacterSource["currency"];

  derived!: CharacterDerived;

  static override defineSchema(): Record<string, unknown> {
    const f = fields();

    const abilityField = (): InstanceType<typeof f.SchemaField> =>
      new f.SchemaField({
        value: new f.NumberField({
          required: true,
          integer: true,
          initial: 5,
          min: ABILITY_MIN,
          max: ABILITY_MAX_CREATURE,
        }),
      });

    const skillField = (): InstanceType<typeof f.SchemaField> =>
      new f.SchemaField({
        points: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        useAlt: new f.BooleanField({ required: true, initial: false }),
      });

    /**
     * Hit and stamina points carry a `locked` portion: radiation damage that
     * cannot be healed until every level of Rads is gone (v2.1 pg 124).
     */
    const poolField = (): InstanceType<typeof f.SchemaField> =>
      new f.SchemaField({
        value: new f.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        locked: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      });

    const levelField = (): InstanceType<typeof f.NumberField> =>
      new f.NumberField({ required: true, integer: true, initial: 0, min: 0 });

    const counter = (): InstanceType<typeof f.NumberField> =>
      new f.NumberField({ required: true, integer: true, initial: 0, min: 0 });

    const scopeCounterField = (): InstanceType<typeof f.SchemaField> =>
      new f.SchemaField({
        ...Object.fromEntries(ADVANTAGE_CATEGORIES.map((key) => [key, counter()])),
        skills: new f.SchemaField(
          Object.fromEntries(SKILL_KEYS.map((skill) => [skill, counter()])),
        ),
        checks: new f.SchemaField(
          Object.fromEntries(CHECK_SCOPES.map((check) => [check, counter()])),
        ),
      });

    return {
      abilities: new f.SchemaField(
        Object.fromEntries(ABILITIES.map((ability) => [ability, abilityField()])),
      ),
      skills: new f.SchemaField(
        Object.fromEntries(SKILL_KEYS.map((skill) => [skill, skillField()])),
      ),
      resources: new f.SchemaField({
        hp: poolField(),
        sp: poolField(),
        ap: new f.SchemaField({
          value: new f.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
          // Half of a turn's unused AP carries into the next one (pg 125).
          recycled: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
          // What the pool held when this turn began. Power Armor overheats
          // above 15 AP *spent in a turn* (pg 58), and spent AP is only
          // knowable by remembering where the turn started — the maximum alone
          // does not account for recycled points.
          turnStart: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        }),
        tempHp: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        // Healing Powder's remaining turns (pg 86). Additive and zero by
        // default — an actor saved before this release loads unchanged.
        healRounds: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        deathSaves: new f.SchemaField({
          successes: new f.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 3 }),
          // v2.1: Humans have Tenacity and die on the 4th failure (pg 8).
          failures: new f.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 4 }),
        }),
      }),
      // Comma-separated damage types (pg 133): resistance halves, vulnerability doubles.
      defenses: new f.SchemaField({
        resistances: new f.StringField({ required: true, initial: "" }),
        vulnerabilities: new f.StringField({ required: true, initial: "" }),
      }),
      // Statblock fidelity for NPCs: fixed pools that ignore the level formulas.
      overrides: new f.SchemaField({
        hpMax: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        spMax: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        apMax: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        ac: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        dt: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
      }),
      conditions: new f.SchemaField({
        ...Object.fromEntries(LEVELED_CONDITIONS.map((condition) => [condition, levelField()])),
        notes: new f.StringField({ required: true, initial: "" }),
      }),
      // Diseases run on their own countdown (pg 120); `remainingHours: null`
      // marks the three that end when you sleep rather than on a clock.
      diseases: new f.ArrayField(
        new f.SchemaField({
          key: new f.StringField({ required: true, initial: "" }),
          remainingHours: new f.NumberField({ required: true, nullable: true, initial: null, min: 0 }),
          doses: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
          sinceDoseHours: new f.NumberField({ required: true, initial: 0, min: 0 }),
          suppressedHours: new f.NumberField({ required: true, initial: 0, min: 0 }),
        }),
        { required: true, initial: [] },
      ),
      // Exposure flags (pg 121-123). "Insulated" helps against Extreme Cold and
      // hurts against Extreme Heat — that inversion is the book's, not a bug.
      environment: new f.SchemaField({
        insulated: new f.BooleanField({ required: true, initial: false }),
        exposedWet: new f.BooleanField({ required: true, initial: false }),
        sheltered: new f.BooleanField({ required: true, initial: false }),
        nearWarmth: new f.BooleanField({ required: true, initial: false }),
        nearCooling: new f.BooleanField({ required: true, initial: false }),
        gasMask: new f.BooleanField({ required: true, initial: false }),
      }),
      // Written by Active Effects only; a bare sheet leaves every entry at 0.
      bonuses: new f.SchemaField({
        ...Object.fromEntries(
          BONUS_KEYS.map((key) => [
            key,
            new f.NumberField({ required: true, initial: 0 }),
          ]),
        ),
        skills: new f.SchemaField(
          Object.fromEntries(
            SKILL_KEYS.map((skill) => [
              skill,
              new f.NumberField({ required: true, initial: 0 }),
            ]),
          ),
        ),
        // Counters, not flags, so several sources stack and opposing ones can
        // cancel the way the d20 convention expects. Alongside the ten
        // categories, a source can name one skill or one named check — the
        // scopes most of the perk text actually uses.
        advantage: scopeCounterField(),
        disadvantage: scopeCounterField(),
        // Initialised at the sentinel, not at 0: a cap composes by taking the
        // lower, and `downgrade` against 0 could never fire.
        moveCap: new f.NumberField({
          required: true,
          integer: true,
          initial: MOVE_CAP_UNCAPPED,
          min: 0,
        }),
      }),
      // Succeeding a radiation check raises the DC by 2 until all Rads clear
      // (pg 124); the bonus resets with the last level.
      radiation: new f.SchemaField({
        dcBonus: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      }),
      // Counters the food and drink chapter needs but the sheet never had: all
      // three of these count across consumptions rather than resolving at once.
      survival: new f.SchemaField({
        irradiated: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        snacks: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        drinkStage: new f.NumberField({
          required: true,
          integer: true,
          initial: 0,
          min: 0,
          max: DRINK_STAGE_MAX,
        }),
        drinkProgress: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        drinkHours: new f.NumberField({ required: true, initial: 0, min: 0 }),
        alcoholAddiction: new f.BooleanField({ required: true, initial: false }),
        foodsToday: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        drinksToday: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        hydratedToday: new f.BooleanField({ required: true, initial: false }),
        sleptToday: new f.BooleanField({ required: true, initial: false }),
        // The Handy fuel clock (pg 10). Additive with defaults, like every
        // schema change so far: a pre-fuel actor loads with a full tank.
        fuelHours: new f.NumberField({ required: true, integer: false, initial: 0, min: 0 }),
        fuelCore: new f.BooleanField({ required: true, initial: false }),
      }),
      // Situations the table declares. Only the conditions the sheet genuinely
      // cannot see live here — "in a settlement", "in an irradiated zone". The
      // rest are derived from the sheet and never stored, so they cannot drift
      // out of step with the numbers they read.
      situations: new f.SchemaField(
        Object.fromEntries(
          EFFECT_CONDITIONS.filter((key) => !DERIVED_CONDITIONS.includes(key)).map((key) => [
            key,
            new f.BooleanField({ required: true, initial: false }),
          ]),
        ),
      ),
      // The chem limit resets daily; addictions persist until slept off (pg 89).
      chems: new f.SchemaField({
        usedToday: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        // Comma-separated chem names, like defenses.resistances.
        addictions: new f.StringField({ required: true, initial: "" }),
      }),
      details: new f.SchemaField({
        // Free text (not constrained to RACES) so NPC creatures fit too.
        race: new f.StringField({ required: true, initial: "human" }),
        // Which chassis a Robot is (pg 9-11). Empty for every other race, and
        // empty is also what an unset Robot reads as — the limb profiles fall
        // back to the human table, which is exactly how robots behaved before
        // this field existed.
        robotType: new f.StringField({ required: true, initial: "" }),
        // Which pg 12 variant a Super Mutant took, if the GM allowed one.
        // Empty for every other race, and empty is also what an unset Super
        // Mutant reads as — the plain Superior Strength trait, which is exactly
        // how Super Mutants behaved before this field existed. Additive with a
        // default like every schema change so far (ROADMAP item 20): an actor
        // saved before this release loads with "" and reads identically.
        mutantVariant: new f.StringField({ required: true, initial: "" }),
        background: new f.StringField({ required: true, initial: "" }),
        level: new f.NumberField({
          required: true,
          integer: true,
          initial: LEVEL_MIN,
          min: LEVEL_MIN,
          max: LEVEL_MAX,
        }),
        xp: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        biography: new f.HTMLField({ required: true, initial: "" }),
      }),
      // Three ledgers and a flag (pg 5, 22, 88). Every one of them is additive:
      // an actor saved before this release loads with four empty defaults and
      // reads exactly as it did — no migration, the same way every release so
      // far has added fields (docs/ROADMAP.md item 20).
      progression: new f.SchemaField({
        // What each level-up point went on. `kind` is constrained; `key` is
        // not, because a perk record holds the perk's name.
        spends: new f.ArrayField(
          new f.SchemaField({
            kind: new f.StringField({ required: true, initial: "skill", choices: SPEND_KINDS }),
            key: new f.StringField({ required: true, initial: "" }),
            points: new f.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
            level: new f.NumberField({ required: true, integer: true, initial: LEVEL_MIN, min: 0 }),
            note: new f.StringField({ required: true, initial: "" }),
          }),
          { required: true, initial: [] },
        ),
        // The XP award log. The catch-up rule (pg 5) gives different characters
        // different amounts from one award, so this is per character.
        awards: new f.ArrayField(
          new f.SchemaField({
            xp: new f.NumberField({ required: true, integer: true, initial: 0 }),
            reason: new f.StringField({ required: true, initial: "" }),
            total: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
          }),
          { required: true, initial: [] },
        ),
        // "Be sure to keep track of which issues you've read" (pg 88) — the
        // one place the book asks the sheet to remember a set of integers.
        magazines: new f.ArrayField(
          new f.SchemaField({
            title: new f.StringField({ required: true, initial: "" }),
            issues: new f.StringField({ required: true, initial: "" }),
            untilRest: new f.BooleanField({ required: true, initial: false }),
            // The skill this title resolved to when it was read.
            //
            // `magazineSkill` falls back to the item's effect text when a title
            // is not one of the fourteen printed ones — which every renamed or
            // house-ruled magazine is. The derived pass has only the ledger, so
            // without this it re-resolved from the title alone, found nothing,
            // and granted nothing: the card said "+1 Guns" and the sheet moved
            // by zero. Empty on entries written before this field existed, and
            // those still fall back to the title lookup.
            skill: new f.StringField({ required: true, initial: "" }),
          }),
          { required: true, initial: [] },
        ),
        discountUsed: new f.BooleanField({ required: true, initial: false }),
      }),
      currency: new f.SchemaField({
        caps: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        // Karma Caps: flip one for advantage or a re-roll; the GM can flip it
        // back against you. Luck 10 grants an extra cap.
        karmaCaps: new f.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
        karmaCapsFlipped: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      }),
    };
  }

  override prepareDerivedData(): void {
    const race = this.details.race;
    const level = this.details.level;

    // The robot sub-type's non-targeting traits (pg 9-11), declared as data in
    // `src/rules/robots.ts` and enforced from here: Reinforced Plating's damage
    // threshold and NeuroTransmitters' electricity vulnerability both land in
    // this pass. The other two — Slow's movement cap and All Terrain Rollers —
    // are AP rules and are reported by `src/actions/movement.ts`, because this
    // system deducts no AP (BACKLOG E1).
    //
    // Race-gated: see `robotTraitsFor` for why a stale sub-type on a non-robot
    // is inert here while the *targeting* half still reads it directly.
    const robot = robotTraitsFor(race, this.details.robotType);

    // The worn suit has to be found before ability modifiers, because Hydraulic
    // Machine (pg 57) overrides the Strength score outright and everything
    // Strength-derived — carry load, melee damage, Intimidation — follows from
    // the modifier. Note 12 is above the printed score cap of 10 (pg 20) and
    // the book prints no modifier for it; `abilityModifier` extends its own
    // formula, which is the only reading that keeps the clause meaningful.
    let suit: FoundryItem | null = null;
    for (const item of this.parent.items) {
      if (item.type !== "armor") continue;
      const armor = item.system as ArmorData;
      if (armor.isPowerArmor && armor.equipped && !armor.ceased) suit = item;
    }
    const suitData = suit ? (suit.system as ArmorData) : null;
    const wornPowerArmor: WornPowerArmor | null =
      suit && suitData
        ? {
            itemId: suit.id,
            name: suit.name,
            decay: suitData.decay,
            minutes: suitData.fusionCoreMinutes,
            capacity: suitData.fusionCoreCapacity,
            overheated: suitData.overheated,
            ceased: suitData.ceased,
            coreDamage: suitData.coreDamage,
            overheatThreshold: overheatThreshold(suitData.coreAssemblyRank),
            radiation: radiationProtection(suitData.decay),
            refillsDefensePoints: refillsDefensePoints(suitData.decay),
          }
        : null;

    // The pg 12 variant, if the GM allowed one. It *replaces* Superior
    // Strength rather than stacking with it, which `rules/races.ts` enforces
    // internally — every function there branches on the variant first.
    const variant = mutantVariantOf(this.details.mutantVariant);

    // Race-adjusted ability scores (pg 11-12). These raise the *score* before
    // anything is derived from it: Superior Strength's max(6, STR+1),
    // Defective Strain's STR/END +2 and its capped Intelligence. A flat bonus
    // to the modifier would be a different (larger) rule, and carry load,
    // melee damage, Intimidation and the skill totals all read the score or
    // its modifier. `raceAbilityScore` is the identity for every other race
    // and for every ability no trait touches.
    const scores = Object.fromEntries(
      ABILITIES.map((ability) => [
        ability,
        raceAbilityScore(race, ability, this.abilities[ability].value, variant),
      ]),
    ) as Record<Ability, number>;

    // Kept as its own name because Power Armor has to be compared against it:
    // Hydraulic Machine sets Strength to 12 and takes the max of the two, so a
    // suited Super Mutant gets the suit's number — already above the mutant's
    // floor either way.
    const strengthScore = scores.strength;

    // The scores the character actually operates at, race, variant and suit
    // all applied — published as `derived.abilityScores` because a dozen rules
    // outside this file compare against a *score* rather than a modifier
    // (strengthReq, climb/swim round limits, disease durations, drink staging,
    // skill-point budgets). Before this existed they each read the stored
    // value, so Superior Strength, Defective Strain and Hydraulic Machine
    // never reached them; the review that caught it counted six such readers
    // disagreeing with the modifiers derived two lines below.
    const abilityScores = {
      ...scores,
      strength: suitData ? Math.max(strengthScore, HYDRAULIC_STRENGTH) : strengthScore,
    };
    const abilityMods = Object.fromEntries(
      ABILITIES.map((ability) => [ability, abilityModifier(abilityScores[ability])]),
    ) as Record<Ability, number>;

    // Skill magazines (pg 88). Deliberately *not* written into
    // `skills.<key>.points`: that field is the sheet's spend column, and a
    // magazine's permanent +1 is not a skill point — folding it in there would
    // make every reader look like they had overspent their level-up budget.
    // The until-rest half sits in the same number and is cleared by
    // `clearMagazineBonuses` (src/actions/progression.ts).
    const magazines = magazineBonuses(
      this.progression.magazines.map((entry) => ({
        title: entry.title,
        issues: parseIssues(entry.issues),
        untilRest: entry.untilRest,
        ...(entry.skill === "" ? {} : { skill: entry.skill as SkillKey }),
      })),
    );

    const luckBonus = luckSkillBonus(abilityMods.luck);
    const skillAbilities = {} as Record<SkillKey, Ability>;
    const skillBonuses = {} as Record<SkillKey, number>;
    for (const skill of SKILL_KEYS) {
      const definition = SKILLS[skill];
      const source = this.skills[skill];
      const governing: Ability =
        source.useAlt && "altAbility" in definition ? definition.altAbility : definition.ability;
      skillAbilities[skill] = governing;
      skillBonuses[skill] =
        abilityMods[governing] +
        source.points +
        luckBonus +
        this.bonuses.skills[skill] +
        magazines.total[skill];
    }

    // Armor: the worn armor item sets AC and provides DT (pg 52).
    let ac = BASE_AC;
    let dt = 0;
    let carryLoad = 0;
    for (const item of this.parent.items) {
      const system = item.system as { load?: number; quantity?: number; equipped?: boolean };
      // Ammo's load getter already includes quantity (10 rounds = 1 load);
      // aid and gear list per-unit load, so multiply by their stack size.
      let load = system.load ?? 0;
      if (item.type === "aid" || item.type === "gear") load *= system.quantity ?? 1;
      if (item.type === "armor") {
        const armor = item.system as ArmorData;
        if (armor.equipped) {
          // Every two levels of decay cost ordinary armor 1 AC and 1 DT. Power
          // Armor is exempt from both (pg 57), so the penalty comes from the
          // item rather than being recomputed here.
          const decayPenalty = armor.decayPenalty;
          ac = Math.max(BASE_AC, armor.ac - decayPenalty);
          dt += Math.max(0, armor.dt - decayPenalty);
          // Worn armor's load is halved (pg 52); Power Armor's is waived
          // entirely (pg 58), which is what `effectiveLoad` encodes.
          load = armor.isPowerArmor ? armor.effectiveLoad : load / 2;
        }
      }
      carryLoad += load;
    }

    // Every leveled condition that subtracts from d20 rolls (v2.1 pg 133-135);
    // bleeding and short circuit deal damage instead. Fatigue caps at nine
    // levels (pg 134).

    // v2.1 (pg 134): hypothermia and overheating each cut maximum AP by half
    // their level, and short circuit costs a robot 1 AP per level (pg 135).
    // Dazed is a token status rather than a level, and v2.1 changed it from
    // halving maximum AP to a flat −3 (pg 133).
    const statuses = this.parent.statuses ?? new Set<string>();
    const dazed = statuses.has("dazed");

    // Poisoned has always imposed disadvantage on every d20 (pg 134), and
    // v2.1 reworked Shock to do the same (pg 135).
    // Deep enough to own its nested buckets: a shallow spread would share the
    // skills and checks objects with `bonuses`, so adding a status-driven
    // disadvantage would write back into the effect-authored data.
    const copyScopes = (source: ScopeCounters): ScopeCounters => ({
      ...source,
      skills: { ...source.skills },
      checks: { ...source.checks },
    });
    const advantage = copyScopes(this.bonuses.advantage);
    const disadvantage = copyScopes(this.bonuses.disadvantage);
    if (statuses.has("poisoned")) disadvantage.all += 1;
    if (statuses.has("shock")) disadvantage.all += 1;

    // A suit with six to nine levels of decay no longer keeps radiation out,
    // but still helps you shrug it off (pg 57). Below six it is full immunity,
    // handled with the other immunities; at ten it does nothing.
    if (wornPowerArmor?.radiation === "advantage") advantage.checks.radiation += 1;

    // The drink ladder (pg 82-83, 133-135). Buzzed's advantage and Drunk's
    // stamina are both real, so this is a buff and a debuff at once.
    const drink = drinkEffects(this.survival.drinkStage);
    for (const category of drink.disadvantage) disadvantage[category] += 1;
    for (const category of drink.advantage) advantage[category] += 1;

    const apLoss =
      AP_HALVING_CONDITIONS.reduce(
        (total, condition) => total + Math.floor(this.conditions[condition] / 2),
        0,
      ) +
      this.conditions.shortCircuit +
      (dazed ? DAZED_AP_PENALTY : 0) +
      // Drunk and above cost 2 maximum AP (pg 133).
      drink.apPenalty;

    // Diseases (pg 120). A suppressed disease still runs its clock but does
    // nothing, which is exactly what Med-X buys against a Fever.
    const diseases: ActiveDisease[] = [];
    for (const entry of this.diseases) {
      const definition = findDisease(entry.key);
      // An unknown key means a hand-edited or migrated sheet; drop it silently
      // rather than crash the whole preparation pass.
      if (!definition) continue;
      diseases.push({ ...entry, definition, suppressed: entry.suppressedHours > 0 });
    }

    const conditionFloors: Partial<Record<LeveledCondition, number>> = {};
    const attackApSurcharge = { ranged: 0, melee: 0 };
    let diseaseApPenalty = 0;
    let rangedDamagePenalty = 0;
    let moveCapFeet: number | null = null;
    let carryLoadHalved = false;
    for (const disease of diseases) {
      if (disease.suppressed) continue;
      const effects = disease.definition.effects;
      for (const category of effects.disadvantage ?? []) disadvantage[category] += 1;
      for (const [condition, levels] of Object.entries(effects.lockedConditions ?? {})) {
        const key = condition as LeveledCondition;
        conditionFloors[key] = Math.max(conditionFloors[key] ?? 0, levels);
      }
      diseaseApPenalty += effects.apMaxPenalty ?? 0;
      rangedDamagePenalty += effects.rangedDamagePenalty ?? 0;
      attackApSurcharge.ranged += effects.attackApSurcharge?.ranged ?? 0;
      attackApSurcharge.melee += effects.attackApSurcharge?.melee ?? 0;
      if (effects.carryLoadHalved) carryLoadHalved = true;
      if (effects.moveCapFeet !== undefined) {
        moveCapFeet = moveCapFeet === null ? effects.moveCapFeet : Math.min(moveCapFeet, effects.moveCapFeet);
      }
    }

    // The same cap, written by an Active Effect instead of by a disease: the
    // leg row's pg 129 conditions (30/20/15 feet for two turns, and Leg Cripple
    // at 20 until healed) all land here. Effects have already run their initial
    // phase, so `downgrade` has resolved several sources down to the tightest
    // one before this reads it; a value still at the sentinel means none fired.
    if (this.bonuses.moveCap < MOVE_CAP_UNCAPPED) {
      moveCapFeet =
        moveCapFeet === null ? this.bonuses.moveCap : Math.min(moveCapFeet, this.bonuses.moveCap);
    }

    // "While you are addicted to alcoholic drinks you always have two levels of
    // exhaustion unless you are drunk" (pg 82). A floor rather than a stored
    // pair of levels, so a rest cannot quietly clear them — and note that
    // Buzzed does not lift it: the rule names Drunk, and Hammered and Wasted
    // both explicitly include Drunk's effects, but Buzzed sits below it.
    if (this.survival.alcoholAddiction && this.survival.drinkStage < DRINK_STAGE_DRUNK) {
      conditionFloors.exhaustion = Math.max(
        conditionFloors.exhaustion ?? 0,
        ALCOHOL_ADDICTION_EXHAUSTION,
      );
    }

    // Every leveled condition that subtracts from d20 rolls (v2.1 pg 133-135);
    // bleeding and short circuit deal damage instead. Fatigue caps at nine
    // levels (pg 134).
    //
    // A floor counts even when no levels are stored: alcohol addiction is "you
    // always have two levels of exhaustion", not "you gain two", so it bites
    // without ever being written to the sheet — and lifts by itself the moment
    // the character is drunk enough for the rule to say it does.
    const conditionPenalty = D20_PENALTY_CONDITIONS.reduce((total, condition) => {
      const levels = Math.max(this.conditions[condition], conditionFloors[condition] ?? 0);
      return total + (condition === "fatigue" ? Math.min(levels, FATIGUE_MAX) : levels);
    }, 0);

    const typedVulnerabilities = defenceList(this.defenses.vulnerabilities);

    const limit = chemLimit(abilityMods.endurance);
    const hpMax = (this.overrides.hpMax ?? maxHitPoints(level, abilityMods.endurance)) + this.bonuses.hpMax;
    const spMax =
      (this.overrides.spMax ?? maxStaminaPoints(level, abilityMods.agility)) +
      this.bonuses.spMax +
      drink.staminaPerLevel * level;
    // Active Effects have already written these (initial phase runs first).
    const b = this.bonuses;

    // Which situations hold. The three the sheet can decide are decided here;
    // the rest are whatever the table has declared, so a GM toggling "in a
    // settlement" is the single source of truth for a fiction the sheet cannot
    // observe.
    const situations = Object.fromEntries(
      // Only the declared ones are stored; the three derived keys below are
      // overwritten immediately after, so their stored value is never read.
      EFFECT_CONDITIONS.map((key) => [key, DERIVED_CONDITIONS.includes(key) ? false : this.situations[key]]),
    ) as Record<EffectCondition, boolean>;
    situations.carryingHeavy = carryLoad >= HOARDER_LOAD;
    situations.irradiated = this.conditions.rads > 0;
    situations.undamaged = this.resources.hp.value >= hpMax;

    // Needle spine halves the carry load outright (pg 120); everything the
    // encumbrance tiers compare against is this one number.
    // The race-adjusted score, so a Super Mutant's Superior Strength raises the
    // load it derives (pg 11) — and the flat +40 the same sentence grants rides
    // alongside it. Deliberately the *unsuited* score: Power Armor's Hydraulic
    // Machine has never fed carry load, and folding it in here would be a
    // separate rules change hiding inside this one.
    const carryLoadMaxBase =
      maxCarryLoad(strengthScore) + raceCarryLoadBonus(race, variant) + b.carryLoad;
    const carryLoadMax = carryLoadHalved ? Math.floor(carryLoadMaxBase / 2) : carryLoadMaxBase;

    // Fever and Sludge lung reduce maximum AP "to a minimum of 6" — a floor on
    // the reduction, not on the character, so it never lifts a total that
    // exhaustion or Dazed already pushed lower.
    const apBeforeDisease = Math.max(
      0,
      (this.overrides.apMax ?? maxActionPoints(abilityMods.agility)) + b.apMax - apLoss,
    );
    const apMax =
      diseaseApPenalty > 0
        ? Math.max(
            Math.min(apBeforeDisease, DISEASE_AP_FLOOR),
            apBeforeDisease - diseaseApPenalty,
          )
        : apBeforeDisease;

    const dtTotal = (this.overrides.dt ?? dt) + b.dt + robot.bonusDamageThreshold;
    this.derived = {
      abilityMods,
      abilityScores,
      skillBonuses,
      skillAbilities,
      hpMax,
      spMax,
      hpHealableMax: Math.max(0, hpMax - this.resources.hp.locked),
      spHealableMax: Math.max(0, spMax - this.resources.sp.locked),
      apMax,
      // The race-adjusted score, not the stored one — this is the one derived
      // number that reads a raw score rather than a modifier, so Defective
      // Strain's Endurance +2 (pg 12) would otherwise stop at the door.
      healingRate: healingRate(level, scores.endurance) + b.healingRate,
      carryLoadMax,
      carryLoad: Math.round(carryLoad * 10) / 10,
      passiveSense: passiveSense(abilityMods.perception) + b.passiveSense,
      radiationDC: RADIATION_SUSCEPTIBLE_RACES.includes(race)
        ? radiationDC(abilityMods.endurance) + this.radiation.dcBonus
        : null,
      ac: (this.overrides.ac ?? ac) + b.ac,
      // Reinforced Plating (pg 10): "Your DT increases by 1 even if you aren't
      // wearing armor." The +1 is unconditional — the "even if" clause removes a
      // precondition rather than adding one — so it rides on top of whatever
      // armor contributed, exactly as an effect-written `b.dt` does.
      //
      // It also rides on top of an NPC statblock's `overrides.dt`, for the same
      // reason `b.dt` does: an override pins what the *armor* line of a
      // statblock is worth, and every other addition in this system is applied
      // after it. A GM whose statblock already counted the plating can subtract
      // one in the override, which is the only place they could say so.
      //
      // One computed base for both DT numbers: they used to be two hand-kept
      // copies of the same sum, and a contributor added to one but not the
      // other would make melee and ranged DT silently disagree on every card.
      dt: dtTotal,
      // Blocking stacks on top of the general DT, but only against melee.
      dtMelee: dtTotal + b.dtMelee,
      // NeuroTransmitters (pg 11): "You are vulnerable to electricity damage."
      //
      // Composed here rather than written into `defenses.vulnerabilities`,
      // because that string is a text input on both sheets: appending to it
      // during preparation would show the derived word in the box and persist it
      // to the source data on the next save, at which point changing the
      // sub-type would leave the vulnerability behind with nothing to explain
      // it. Typed entries come first and are kept verbatim (minus the trimming
      // and lower-casing `applyDamage` has always done), and the trait's types
      // are appended only if the player has not already typed them.
      vulnerabilities: [
        ...typedVulnerabilities,
        ...robot.vulnerableTo.filter((type) => !typedVulnerabilities.includes(type)),
      ],
      resistances: defenceList(this.defenses.resistances),
      // Hammered subtracts 5 from every d20 but Luck (pg 134) — the same
      // exemption the leveled conditions get, so it rides the same total.
      d20Penalty: conditionPenalty + drink.d20Penalty,
      d20Bonus: b.d20,
      damageBonus: b.damage,
      attackBonus: b.attack,
      immuneHunger: HUNGER_IMMUNE_RACES.includes(race),
      // Lead Plated Exoskeleton: a suit under six levels of decay makes its
      // wearer immune to Radiation outright (pg 57), on top of the races that
      // never took it in the first place.
      immuneRadiation:
        !RADIATION_SUSCEPTIBLE_RACES.includes(race) || wornPowerArmor?.radiation === "immune",
      powerArmor: wornPowerArmor,
      encumbrance: carryLoad > carryLoadMax * 2 ? "heavy" : carryLoad > carryLoadMax ? "encumbered" : "",
      advantage,
      disadvantage,
      situations,
      diseases,
      conditionFloors,
      moveCapFeet,
      attackApSurcharge,
      rangedDamagePenalty,
      chemLimit: limit,
      addictionRecoveryWeeks: addictionRecoveryWeeks(abilityMods.endurance),
      chemsOverLimit: Math.max(0, this.chems.usedToday - limit),
      addictions: parseAddictions(this.chems.addictions),
      drinkStage: this.survival.drinkStage,
      drinkBlackout: drink.blackout,
      initiativeBonus: b.initiative,
      partyNerveBonus: b.partyNerve,
      // Luck 10 grants an extra cap (pg 5); perks like Make it Double add more.
      karmaCapsMax: this.currency.karmaCaps + b.karmaCaps,
      magazines,
    };
  }
}
