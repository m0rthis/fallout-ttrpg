/**
 * Robot sub-types (v2.1 pg 9-11).
 *
 * > **Robot Type.** There are three types of robot that you can choose from.
 * > Handy, Protectron, and Robobrain
 *
 * The whole of what the three sub-types change is printed as body plan: which
 * limbs a targeted attack can name, what each costs, and what can be severed.
 * That half lives in `src/rules/targeted.ts`, next to the pg 129 limb table it
 * edits — see `LIMB_PROFILES` there. This module owns the sub-type identity
 * itself, the severed-limb clause the three robots share (pg 11), and the
 * handful of non-targeting traits printed alongside each body plan, which are
 * declared here as data for the integration layer rather than enforced here.
 *
 * Pure rules only: no documents, no `game.*`.
 */

import type { DamageType } from "./constants";

// ============================================================= pg 9

/**
 * The three printed sub-types, in the book's own order.
 *
 * `RobotType` adds `""` on top, which is not one of the book's three: the book
 * says a robot player *chooses* one, so the empty string means "a robot who has
 * not chosen yet" (or any non-robot character, who never had the choice). It is
 * never a fourth kind of robot, and every function here treats it as "no
 * sub-type rules apply" rather than guessing which of the three was meant.
 */
export const ROBOT_SUB_TYPES = ["handy", "protectron", "robobrain"] as const;
export type RobotSubType = (typeof ROBOT_SUB_TYPES)[number];

/** The stored shape of `details.robotType` on a character. */
export type RobotType = "" | RobotSubType;

/** Narrows a stored string to one of the three printed sub-types. */
export function isRobotSubType(value: string): value is RobotSubType {
  return (ROBOT_SUB_TYPES as readonly string[]).includes(value);
}

/**
 * Normalises whatever is stored in `details.robotType` to a `RobotType`.
 *
 * The sub-type is deliberately *not* cross-checked against `details.race`. A
 * sheet can hold a stale sub-type from before the race was switched, and the
 * book gives no reconciliation rule; the caller that knows the race decides
 * whether to ask. Pass `""` for a non-robot and the default body plan applies.
 */
export function robotTypeOf(value: string | undefined): RobotType {
  return value !== undefined && isRobotSubType(value) ? value : "";
}

// ============================================================= pg 11

/**
 * Severed limbs, shared by all three sub-types:
 *
 * > **Severed Limbs.** …If any of your limbs are severed, you do not go into
 * > shock and they can be reattached with 3 steel and 1 circuitry junk item.
 * > When you or a creature reattaches a limb, it takes a number of minutes
 * > equal to 10 - their or your crafting skill bonus. If the amount of time is
 * > reduced to 0, it takes 6 AP to reattach the limb instead.
 *
 * Race-keyed rather than sub-type-keyed: the clause is printed once for robots
 * as a whole, so it applies to a robot who has not picked a sub-type too.
 * Matches the shape of the other race lists in `constants.ts`.
 */
export const SEVER_SHOCK_IMMUNE_RACES: readonly string[] = ["robot"];

/**
 * Whether the pg 11 severed-limb clause is this creature's at all.
 *
 * The same list as `SEVER_SHOCK_IMMUNE_RACES` because it is the same sentence —
 * no shock *and* reattachment are printed together, for robots, once. Named
 * separately so the reattachment control can ask the question it actually has
 * ("can this body's limbs be put back on?") instead of asking about shock and
 * relying on the two staying identical.
 */
export function hasSeveredLimbRules(race: string): boolean {
  return SEVER_SHOCK_IMMUNE_RACES.includes(race);
}

/** "3 steel and 1 circuitry junk item" (pg 11), by junk item name. */
export const ROBOT_REATTACH_JUNK = { steel: 3, circuitry: 1 } as const;

export const ROBOT_REATTACH_BASE_MINUTES = 10;
export const ROBOT_REATTACH_AP = 6;

/**
 * Either a duration or an AP cost — the book prints them as alternatives, not
 * as a total, so exactly one of these is ever non-zero.
 */
export interface RobotReattachCost {
  readonly minutes: number;
  readonly ap: number;
}

/**
 * "a number of minutes equal to 10 - their or your crafting skill bonus. If the
 * amount of time is reduced to 0, it takes 6 AP … instead" (pg 11).
 *
 * The book is **silent on a crafting bonus above 10**, which would drive the
 * subtraction negative. Ruling: any result at or below zero is the 6 AP case.
 * The printed trigger is "reduced to 0" and a negative number of minutes is not
 * a thing the book could have meant; the alternative — clamping at 1 minute and
 * never reaching the AP clause — would make the clause harder to reach the
 * better you are at crafting, which is backwards.
 *
 * Whose bonus ("their or your") is the caller's choice, deliberately: the book
 * lets either the robot or the helper do the work and never says the higher of
 * the two is used, so this takes one number and does not pick for you.
 */
export function robotReattachCost(craftingBonus: number): RobotReattachCost {
  const minutes = ROBOT_REATTACH_BASE_MINUTES - Math.floor(craftingBonus);
  return minutes > 0 ? { minutes, ap: 0 } : { minutes: 0, ap: ROBOT_REATTACH_AP };
}

// ============================================================= pg 9-11

/**
 * The non-targeting traits printed with each sub-type.
 *
 * Declared, not enforced. Every one of these lands in a file this module does
 * not own — damage threshold on the character data model, the movement AP cap
 * in `movement.ts`, damage vulnerability wherever damage is applied — and a
 * rules module that wrote to those would stop being a rules module. Kept in one
 * table so the integration layer has a single place to read them from, and so
 * the page citations sit next to the numbers.
 */
export interface RobotTraits {
  /** Protectron's Reinforced Plating: "Your DT increases by 1 even if you aren't wearing armor." (pg 10) */
  readonly bonusDamageThreshold: number;
  /**
   * Protectron's Slow: "can only spend a maximum of 6 AP on movement during
   * their turns." (pg 10) `null` = no cap.
   *
   * "on movement" is left as the caller's problem on purpose. The book does not
   * enumerate which of the movement chapter's AP costs count — walking is
   * obviously in, and climbing, swimming, sprinting and standing from prone are
   * all priced in AP under the movement heading (pg 116-127) without being
   * named here either way.
   */
  readonly maxMovementAp: number | null;
  /** Robobrain's All Terrain Rollers: "You do not have to spend extra AP to move through difficult terrain." (pg 10) */
  readonly ignoresDifficultTerrain: boolean;
  /** Robobrain's NeuroTransmitters: "You are vulnerable to electricity damage." (pg 10) */
  readonly vulnerableTo: readonly DamageType[];
  /**
   * Handy's Jet Engine: "You hover a few feet off the ground while active and
   * moving. You don't trigger any floor based traps or activated effects.
   * However, if you are knocked prone, become stunned, or fall unconscious; you
   * fall to the ground." (pg 9)
   */
  readonly hovers: boolean;
}

const NO_TRAITS: RobotTraits = {
  bonusDamageThreshold: 0,
  maxMovementAp: null,
  ignoresDifficultTerrain: false,
  vulnerableTo: [],
  hovers: false,
};

export const ROBOT_TRAITS: Record<RobotType, RobotTraits> = {
  "": NO_TRAITS,
  handy: { ...NO_TRAITS, hovers: true },
  protectron: { ...NO_TRAITS, bonusDamageThreshold: 1, maxMovementAp: 6 },
  robobrain: { ...NO_TRAITS, ignoresDifficultTerrain: true, vulnerableTo: ["electricity"] },
};

export function robotTraits(robotType: RobotType): RobotTraits {
  return ROBOT_TRAITS[robotType];
}

/**
 * The races whose characters may have one of the three chassis (pg 9).
 *
 * Only Robot. A Gen-2 Synth is its own race with its own page and no chassis to
 * choose, and nothing else in the book is built. A list rather than a comparison
 * so it reads like the other race lists in `constants.ts` and `races.ts`.
 */
export const ROBOT_CHASSIS_RACES: readonly string[] = ["robot"];

/**
 * The traits in force on a *character sheet*, race included.
 *
 * `robotTypeOf` deliberately refuses to cross-check the sub-type against the
 * race and hands the decision to whoever knows both (see its note). This is that
 * decision, taken for the one caller where the stale-value hazard is real: the
 * derived pass in `src/data/character.ts` runs on every preparation cycle
 * forever, so a `robotType` left behind by a race change — the sheet hides the
 * picker for non-robots (`isRobot` in `character-sheet.ts`), it does not clear
 * the field — would otherwise hand a human +1 damage threshold and an
 * electricity vulnerability with no control anywhere on the sheet to show why.
 *
 * **The book is silent**: it never says what a Protectron who stops being a
 * robot is, because it never contemplates one. Ruling: the traits are printed
 * inside the Robot race's entry (pg 9-11), so being a robot is a precondition
 * for all of them, and a sub-type on a non-robot is inert rather than
 * retroactively wrong — nothing is erased, and picking Robot again restores it.
 *
 * Note the *targeting* half deliberately does not go through here.
 * `src/dice/rolls.ts` and the limb picker resolve a defender's body plan from
 * the stored sub-type alone, because both halves of one attack — which limbs
 * exist, what each costs, what a hit inflicts — have to agree with each other,
 * and they answer to the profile the attacker was offered rather than to a
 * sheet field neither of them shows.
 */
export function robotTraitsFor(race: string, robotType: string): RobotTraits {
  if (!ROBOT_CHASSIS_RACES.includes(race)) return NO_TRAITS;
  return robotTraits(robotTypeOf(robotType));
}

/**
 * What a hovering Handy loses its hover to (pg 9): "if you are knocked prone,
 * become stunned, or fall unconscious; you fall to the ground."
 *
 * Book strings, not condition keys. Only `prone` is one of this system's
 * `BINARY_CONDITIONS` — "stunned" and "unconscious" are printed states the
 * condition list never adopted, so mapping them onto `dazed` or `dying` would
 * be inventing an equivalence the book does not draw. Listed so the three
 * triggers are quoted in one place; nothing here watches for them.
 */
export const HOVER_ENDING_STATES: readonly string[] = ["prone", "stunned", "unconscious"];

// ============================================================= pg 10 — Fuel

/**
 * The Handy's fuel clock (pg 10):
 *
 * > **Fuel.** You require fuel to continue to operate. Every week, 7 days, or
 * > 168 hours; you can spend 6 AP to fill your tank with a gallon of fuel or
 * > six oil junk items which are consumed upon use. If you fail to consume a
 * > gallon of fuel after the week, you must succeed a DC 12 Endurance check
 * > for each hour past 168. For each successful check, the DC increases by 2.
 * > On a fail, you become unconscious until another creature fills your tank
 * > with fuel. Alternatively, you can load a fusion core into your chassis.
 * > If you do, you can operate for 30 days without requiring fuel.
 *
 * **Whose rule this is — a ruling.** The paragraph is printed inside the
 * *Handy* entry, between its Limbs and its Jet Engine, exactly where Slow sits
 * inside the Protectron's. Its first sentence sounds robot-wide, but the
 * Protectron and Robobrain entries print no upkeep of any kind, and extending
 * a starvation-shaped clock to two chassis the book left without one would be
 * inventing a cost. So the *automatic* clock runs for Handys; the fill/core
 * controls in `src/actions/robots.ts` still work on any robot, so a GM who
 * reads the sentence robot-wide only has to press them.
 */
export const FUEL_WEEK_HOURS = 168;
export const FUEL_TANK_AP_COST = 6;
/** "a gallon of fuel or six oil junk items" — reported, never consumed (no junk documents; BACKLOG D2). */
export const FUEL_OIL_JUNK = 6;
export const FUEL_CHECK_BASE_DC = 12;
export const FUEL_CHECK_DC_STEP = 2;
/** A loaded fusion core runs the chassis for 30 days (pg 10). */
export const FUEL_CORE_HOURS = 30 * 24;

/** How long the current fill lasts: a tank of fuel a week, a core 30 days. */
export function fuelLimitHours(fusionCore: boolean): number {
  return fusionCore ? FUEL_CORE_HOURS : FUEL_WEEK_HOURS;
}

/**
 * The DC of the next hourly Endurance check, after `successes` passed ones.
 * "For each successful check, the DC increases by 2" — the failures do not
 * raise it, because a failure ends the sequence in unconsciousness.
 */
export function fuelCheckDC(successes: number): number {
  return FUEL_CHECK_BASE_DC + FUEL_CHECK_DC_STEP * Math.max(0, successes);
}

/**
 * Whether the fuel clock runs automatically for this creature — the ruling
 * above: printed in the Handy entry, so a Handy. What happens past the fusion
 * core's 30 days is unprinted; ruled as the same hourly checks, since a dry
 * core and a dry tank leave the same machine without power.
 */
export function fuelClockRuns(race: string, robotType: string): boolean {
  return ROBOT_CHASSIS_RACES.includes(race) && robotTypeOf(robotType) === "handy";
}
