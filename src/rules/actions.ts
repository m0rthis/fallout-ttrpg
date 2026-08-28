/**
 * The rest of the pg 126 Actions in Combat table — Dodge, Shove, Take Cover,
 * Search, Stand up from Prone, Stow and Equip — plus the table itself.
 *
 * Pure rules only: constants, comparisons, and the decisions the printed text
 * forces. The half that rolls dice and writes documents is
 * `src/actions/stealth.ts`; the Hide and Search rules live next door in
 * `src/rules/stealth.ts`, because detection is a chapter of its own that merely
 * has two rows in this table.
 *
 * ## Shove is the last opposed roll in the book
 *
 * v2.1 rewrote Grapple and Escape from v2.0's opposed rolls into flat DCs
 * (`src/rules/grapple.ts` quotes both). Shove was left alone, and it is now the
 * only action in the combat chapter where both sides roll. It is also, as a
 * direct consequence, the only one of the three **without** the "or roll a 20"
 * rider that the rewrite attached to the other two — an asymmetry that reads
 * like an oversight and is preserved here regardless, because a raw 20 winning a
 * contest it lost is a rule the book does not print.
 */

import {
  ESCAPE_AP_COST,
  GRAPPLE_AP_COST,
  HELP_AP_COST,
  RELOAD_AP_COST,
  READY_AP_SURCHARGE,
  SPRINT_AP_COST,
  UNARMED_STRIKE_AP_COST,
} from "./constants";
import { CHEM_AP_COST } from "./chems";
import { TAKE_COVER_AP } from "./cover";
import { HIDE_AP_COST, SEARCH_AP_COST } from "./stealth";

/**
 * Every row of the pg 126 **Actions in Combat** table, in the book's order.
 *
 * Read off a rendered page image at 150 dpi, not from layout extraction: the
 * two-column page interleaves the table with the improvised-action guide, and
 * this project has been burned by column misalignment before. The image and the
 * `-layout` extraction agree row for row, which is the check that matters.
 *
 * Rows this system already priced import their constant rather than restating
 * the number, so the table cannot disagree with the code that uses it. The rows
 * that had no constant anywhere are the new ones, and they are the point of this
 * module.
 *
 * `attack` is the one row with no number: *"Dependant on the weapon."*
 */
export const COMBAT_ACTION_AP = {
  attack: null,
  dodge: 6,
  equipWeapon: 3,
  escape: ESCAPE_AP_COST,
  grapple: GRAPPLE_AP_COST,
  help: HELP_AP_COST,
  hide: HIDE_AP_COST,
  interactWithObject: 3,
  moveFiveFeet: 1,
  /** Printed as "+2 AP": a surcharge on the readied action, not a cost. */
  ready: READY_AP_SURCHARGE,
  reload: RELOAD_AP_COST,
  search: SEARCH_AP_COST,
  shove: 4,
  sprint: SPRINT_AP_COST,
  standUpFromProne: 5,
  stowWeapon: 3,
  takeCover: TAKE_COVER_AP,
  unarmedStrike: UNARMED_STRIKE_AP_COST,
  useChem: CHEM_AP_COST,
} as const satisfies Record<string, number | null>;

export type CombatActionKey = keyof typeof COMBAT_ACTION_AP;

export const DODGE_AP_COST = COMBAT_ACTION_AP.dodge;
export const SHOVE_AP_COST = COMBAT_ACTION_AP.shove;
export const EQUIP_WEAPON_AP_COST = COMBAT_ACTION_AP.equipWeapon;
export const INTERACT_AP_COST = COMBAT_ACTION_AP.interactWithObject;

/**
 * Standing up (5 AP, pg 126-127): *"You stand back up from being prone."*
 *
 * pg 135 defines the condition it ends: *"A prone creature's only movement
 * option is to crawl, unless it stands up and thereby ends the condition."* So
 * Stand is the printed way out, and clearing the status is the whole action —
 * there is no check, no cap, and no alternative exit.
 */
export const STAND_UP_AP_COST = COMBAT_ACTION_AP.standUpFromProne;

/**
 * Stowing (3 AP, pg 127): *"You take a weapon you are holding and put it into
 * your inventory."*
 *
 * In this system holding *is* `system.equipped`, and inventory is where the item
 * already lives, so stowing is one boolean. The book's held/stowed distinction
 * only ever matters for Equip's drop clause — which, per
 * `weaponsDroppedByEquipping`, has nothing to check it against.
 */
export const STOW_WEAPON_AP_COST = COMBAT_ACTION_AP.stowWeapon;

// ------------------------------------------------------------------- Dodge

/**
 * *"you can move up to 15 feet in reaction to any other creature's action one
 * time before the start of your next turn"* (pg 126).
 *
 * Free: the sentence prices no AP for it, which is notable in a chapter where
 * movement costs 1 AP per 5 feet. Three 5-foot steps would be 3 AP paid the
 * ordinary way, so the Dodge is buying them as well as the disadvantage.
 */
export const DODGE_REACTIVE_MOVE_FEET = 15;

/**
 * Whether a Dodge has stopped working (pg 126): *"You lose this benefit if you
 * are dying or you cannot spend AP to move."*
 *
 * Two readings settled:
 *
 * - **"This benefit" is both of them.** The sentence follows a paragraph that
 *   granted two things — disadvantage on attacks against you, and the 15-foot
 *   reactive move — and names one. Ruled as both: the alternative is that a
 *   dying creature, prone at 0 hit points, keeps imposing disadvantage on
 *   everyone attacking it, which is the reading that makes the sentence not
 *   worth printing.
 * - **"Cannot spend AP to move" is Grappled or Restrained**, and nothing else in
 *   the book. Grappled is that phrase verbatim (pg 134: *"A grappled creature
 *   cannot spend AP to move"*), and Restrained is *"cannot move"* (pg 135). No
 *   third condition in 136 pages stops a creature spending AP on movement.
 *
 * Note what the clause does *not* include: Prone. A prone creature's *"only
 * movement option is to crawl"* (pg 135), which is still movement — and crawling
 * has no printed rate or AP cost anywhere in the book, a gap the roadmap already
 * records. So a prone creature keeps its Dodge.
 */
export function dodgeBenefitLost(dying: boolean, grappledOrRestrained: boolean): boolean {
  return dying || grappledOrRestrained;
}

/**
 * Whether a Dodge actually imposes disadvantage on a given attack (pg 126):
 * *"any attack roll made against you has disadvantage **if you can see the
 * attacker**."*
 *
 * The condition is about a sightline this system does not model, and it is about
 * the defender's senses at the moment somebody else rolls — so it is declared,
 * exactly as cover and distance are declared (`AttackOptions` in
 * `src/dice/rolls.ts` explains the stance at length). A blinded dodger, or one
 * shot at from behind, dodges nothing.
 *
 * Worth noting what the rule covers and what the flavour promises. The action is
 * *"You prepare to move quickly out of the way of an attack **or explosion**"* —
 * but the mechanical sentence only ever touches *"any attack roll made against
 * you"*. An explosive that forces no attack roll (pg 78-79: explosives damage
 * everything in a radius) gets nothing from a Dodge. The book grants no saving
 * throw or dodge check against a blast anywhere, so there is no second mechanic
 * this could be pointing at; the flavour simply overpromises.
 */
export function dodgeApplies(canSeeAttacker: boolean, benefitLost: boolean): boolean {
  return canSeeAttacker && !benefitLost;
}

// ------------------------------------------------------------------- Shove

/** *"push it 5 feet away from you"* (pg 127). */
export const SHOVE_PUSH_FEET = 5;

/** What a won Shove does — the shover's choice, not the target's (pg 127). */
export const SHOVE_OUTCOMES = ["prone", "push"] as const;
export type ShoveOutcome = (typeof SHOVE_OUTCOMES)[number];

/**
 * Which check the target defends with (pg 127): *"contested by the target's
 * Unarmed check or Agility check (**the target chooses the ability to use**)."*
 *
 * These are not the same kind of number. "Unarmed check" is a skill check —
 * Unarmed is a skill, and it is governed by Strength — while "Agility check" is
 * a raw ability check. So the target picks between their Unarmed *skill bonus*
 * and their Agility *modifier*, which is the same either/or the frightened check
 * and the death save offer, and the book is unusually explicit here about who
 * chooses.
 */
export const SHOVE_DEFENSES = ["unarmed", "agility"] as const;
export type ShoveDefense = (typeof SHOVE_DEFENSES)[number];

/**
 * The better of the two defences, in bonus terms — the default a target would
 * pick if nobody asked them.
 *
 * The book hands the choice to the target and this system will offer it, but a
 * defaultless prompt on somebody else's turn is a worse experience than a
 * sensible pre-selection, and picking the larger number is the only
 * pre-selection that cannot be accused of playing the target badly.
 */
export function bestShoveDefense(unarmedBonus: number, agilityMod: number): ShoveDefense {
  return agilityMod > unarmedBonus ? "agility" : "unarmed";
}

/**
 * Whether the shover won (pg 127): *"**If you win the contest**, you either
 * knock the target prone or push it 5 feet away from you."*
 *
 * **A tie is a loss for the shover**, and that is close to printed rather than
 * ruled: you must *win*, and equal totals are not a win. It is also the same
 * direction every other tie in this chapter breaks once ruled — the creature
 * being acted on keeps its state.
 *
 * **There is no raw-20 rider.** Grapple and Escape one page earlier both carry
 * *"If you succeed or roll a 20"*; Shove does not, and Shove is the action v2.1
 * left as an opposed roll while rewriting those two into flat DCs. Reading the
 * rider across would be inventing the very clause the rewrite chose not to give
 * this action.
 */
export function shoveSucceeds(shoverTotal: number, targetTotal: number): boolean {
  return shoverTotal > targetTotal;
}

/**
 * The size gate (pg 127): *"The target must be no more than one size larger than
 * you and must be within your reach."*
 *
 * **Nothing in this system records a creature's size**, and the book never
 * prints a size for a player character either — the size categories (Large,
 * Huge, Gargantuan) appear only in the falling rules on pg 117-118 and in
 * creature statblocks. There is no field to check and no printed value to check
 * it against, so this takes the answer as a declaration rather than deriving a
 * size ladder the book does not supply. Reach is declared for the same reason:
 * this system does not measure distance, it is told it.
 *
 * The parameter defaults to permitted, so the gate is something a GM asserts
 * rather than something the sheet quietly enforces on invented data.
 */
export function shoveAllowed(withinReach: boolean, sizeAllows: boolean): boolean {
  return withinReach && sizeAllows;
}

// ------------------------------------------------------------------- equip

/**
 * Equipping (3 AP, pg 126): *"You take a weapon within reach and prepare to
 * attack with it **with any hands you have free**. If you have a weapon in your
 * hands already and have not stowed it, **you drop it on the ground**."*
 *
 * The drop clause is reported and never enforced, for the same reason the v2.1
 * free-hand reload requirement is reported: **there is no hands resource
 * anywhere in 136 pages.** The book never says how many hands a creature has,
 * never says a Two Handed weapon occupies two, and the two sentences that depend
 * on hand state (this one and Reload's) both assume a model the book forgot to
 * write. This system's `equipped` flag is a set, not a pair of slots, so it
 * cannot tell a full hand from an empty one.
 *
 * @returns the weapons that would be dropped on the ground under the printed
 *          rule, so a caller can say so on the card without acting on it.
 */
export function weaponsDroppedByEquipping<T>(
  currentlyHeld: readonly T[],
  beingEquipped: T,
): T[] {
  return currentlyHeld.filter((weapon) => weapon !== beingEquipped);
}
