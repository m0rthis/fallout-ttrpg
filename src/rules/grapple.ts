/**
 * The v2.1 Unarmed contest, and the arithmetic behind the four combat actions
 * that shipped with it (pg 126-127).
 *
 * The file is named for the largest of them. Grapple, Escape and the unarmed
 * strike are all *Unarmed*-skill rules and belong together; Help and Ready are
 * two lines of arithmetic each and did not earn a module of their own.
 * Everything here is pure — no documents, no globals, no i18n. The half that
 * writes documents is `src/actions/combat-actions.ts`.
 *
 * ## What v2.1 actually changed
 *
 * v2.0 resolved a grapple as an opposed roll: the grappler's Strength check
 * against the target's Strength *or* Agility check. v2.1 (pg 126) deletes the
 * contest and replaces it with a flat DC on one side only:
 *
 * > **Grapple.** You use your appendages to hold someone in place. When you
 * > attempt to grapple another creature you make an Unarmed skill check with
 * > the DC equal to 10 + the creature's Unarmed skill. If you succeed or roll
 * > a 20, the creature is grappled.
 *
 * > **Escape.** You attempt to free yourself from a grapple, restrain, or
 * > chokehold. You must succeed a Unarmed skill check with the DC equal to
 * > 10 + the creature's Unarmed skill. If you succeed or roll a 20, you escape.
 *
 * So both directions use the same formula and the same die, and the defender
 * never rolls. That is why one function serves both.
 */

import {
  UNARMED_DOUBLE_STRIKE_AP_COST,
  UNARMED_STRIKE_AP_COST,
  READY_AP_SURCHARGE,
} from "./constants";

/** "the DC equal to 10 + the creature's Unarmed skill" (pg 126). */
export const GRAPPLE_DC_BASE = 10;

/**
 * "If you succeed **or roll a 20**" (pg 126) — a raw 20 carries the check
 * however high the DC. Note the asymmetry the book prints and we keep: there
 * is no matching automatic failure on a raw 1. The nat-1 rule in this chapter
 * is written for *attack* rolls ("Critical Failure … you automatically miss and
 * the weapon you attacked with gains one level of decay", pg 128), and Grapple
 * and Escape are skill checks, not attacks.
 */
export const CONTEST_AUTO_SUCCESS = 20;

/**
 * The DC for a Grapple or an Escape: 10 plus the other creature's Unarmed
 * skill.
 *
 * **"skill" here means the skill bonus.** The book has no second "skill score"
 * anywhere — a skill is a bonus, computed on pg 4 — and it phrases the identical
 * construction explicitly on pg 134 ("8 + the Intimidation skill bonus of the
 * frightening creature"). Reading it as anything else would leave the formula
 * with no defined input.
 *
 * The book gives no floor. A creature with a deeply negative Unarmed bonus is
 * therefore easier to grab than an empty patch of ground (DC below 10), which
 * is what the arithmetic says and what this returns.
 */
export function unarmedContestDC(opponentUnarmedBonus: number): number {
  return GRAPPLE_DC_BASE + opponentUnarmedBonus;
}

/** Whether a Grapple or Escape check landed: beat the DC, or roll a raw 20. */
export function unarmedContestSucceeds(total: number, dc: number, raw: number): boolean {
  return raw === CONTEST_AUTO_SUCCESS || total >= dc;
}

/** Unarmed strikes deal "1d4 + your Strength or Agility modifier" (pg 127). */
export const UNARMED_STRIKE_DIE = "1d4";
export const UNARMED_STRIKE_DAMAGE_TYPE = "bludgeoning";

/**
 * Which modifier an unarmed strike adds to damage.
 *
 * The book says "your Strength **or** Agility modifier" and never says who
 * chooses. Every other either/or in this book that does say — the Frightened
 * check's Endurance or Charisma (pg 134), the death save's Luck or Endurance
 * (pg 25), Shove's contested ability (pg 127) — hands the choice to the
 * creature making the roll, so the default here is the better of the two. The
 * caller can override it; nothing is decided that a player could not.
 */
export function unarmedStrikeAbility(
  strengthMod: number,
  agilityMod: number,
): "strength" | "agility" {
  return agilityMod > strengthMod ? "agility" : "strength";
}

/**
 * The two strike bundles the book prints, and nothing else.
 *
 * pg 127: *"It costs 3 AP to make an unarmed strike. Alternatively, you can
 * make two unarmed strikes by spending 5 AP."* There is no rule for three, and
 * no general "each extra strike costs 2" either — so three strikes is a null,
 * not an extrapolation.
 */
const UNARMED_BUNDLE_AP: Record<number, number> = {
  1: UNARMED_STRIKE_AP_COST,
  2: UNARMED_DOUBLE_STRIKE_AP_COST,
};

/** Holey Moley (pg 52) buys one more strike for a single point, once per turn. */
export const EXTRA_STRIKE_AP = 1;

/**
 * What a bundle of unarmed strikes costs, or null when the book prices no such
 * bundle.
 *
 * `extraStrike` is Holey Moley, the Ghoul perk on pg 52: *"Once per turn, when
 * you make an unarmed attack, you can spend 1 AP to make an additional one.
 * This includes spending 5 AP to make two unarmed attacks, you can spend 6 AP
 * to make three unarmed attacks."* That worked example is the only place in the
 * book where strikes stack past two, and it is the reason this is a flag on the
 * paid bundle rather than a formula: 3 AP buys one, +1 makes it two; 5 AP buys
 * two, +1 makes it three. Four strikes has no price anywhere.
 */
export function unarmedStrikeApCost(strikes: number, extraStrike = false): number | null {
  const paidStrikes = extraStrike ? strikes - 1 : strikes;
  const base = UNARMED_BUNDLE_AP[paidStrikes];
  if (base === undefined) return null;
  return base + (extraStrike ? EXTRA_STRIKE_AP : 0);
}

/**
 * Help (pg 127), reworked this edition:
 *
 * > When you use your AP to Help, the creature you aid gains a bonus to their
 * > next ability check equal to half your bonus (rounded down) in the related
 * > skill.
 *
 * v2.0 granted flat advantage instead. Note what the new sentence does *not*
 * say: the patch notes call it "half the helper's ability modifier", but the
 * printed book says half the helper's **bonus in the related skill**, which is
 * a different and usually larger number. The book wins.
 *
 * Rounding down a negative number moves it away from zero, so a helper with a
 * −3 skill bonus hands their ally −2. The book prints no floor and Help is
 * voluntary, so that stands — the same stance blocking takes on a negative
 * Endurance modifier. A rule this system silently repairs is a rule the GM can
 * no longer see.
 */
export function helpBonus(helperSkillBonus: number): number {
  return Math.floor(helperSkillBonus / 2);
}

/**
 * Ready (pg 126): *"You must specify what the trigger is and spend the
 * necessary AP with an additional 2 AP."* So the readied action is bought at
 * its own price plus a flat surcharge, which is why the pg 126 table prints
 * Ready as "+2 AP" rather than as a cost.
 */
export function readyTotalApCost(readiedActionApCost: number): number {
  return Math.max(0, readiedActionApCost) + READY_AP_SURCHARGE;
}

/**
 * *"If the trigger never occurs, you do not perform the action and instead you
 * may recycle half the total amount of AP used at the start of your next
 * turn."* (pg 126)
 *
 * "half" is unrounded in the sentence, but the recycling rule two columns
 * earlier on the same page halves 4 into 2 and the book rounds down everywhere
 * else it halves, so this floors. **"Total amount of AP used" is read as the
 * whole Ready cost** — the readied action plus the 2 AP surcharge — because
 * that is what the reader just spent and the sentence names no smaller part.
 */
export function readyRecycledAP(totalApSpent: number): number {
  return Math.floor(Math.max(0, totalApSpent) / 2);
}
