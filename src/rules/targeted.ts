/**
 * Targeted attacks (v2.1 pg 129): attack a specific limb for extra AP; on a
 * hit, apply the limb's damage modifier, and if the damage reaches hit
 * points, a d4 decides the inflicted condition (re-rollable up to the
 * attacker's Luck modifier). A critical hit inflicts the limb's severe
 * injury (or up to two of its conditions) instead.
 *
 * Two AP costs moved between editions, in opposite directions — the head got
 * cheaper and the held object dearer. The v2.1 patch notes state the head
 * change backwards ("now 4 instead of 3"); both books were read directly and
 * the head went 4 → 3.
 *
 * All display text lives in lang/en.json under FALLOUT.Targeted.limbs.<key>.
 *
 * ## Body plans (pg 9-11)
 *
 * The pg 129 table is written for a human body. The three robot sub-types each
 * reprint it with limbs removed, and two of them add a limb of their own — see
 * `LIMB_PROFILES` at the bottom of this file. A character with no sub-type set
 * gets the pg 129 table exactly as before.
 */

import type { RobotType } from "./robots";

/**
 * The pg 129 table itself, untouched. This is the default body plan, and it is
 * also the row every robot limb borrows from: `LIMB_PROFILES` never invents a
 * damage modifier, a condition or a severe injury, it only says which of these
 * rows a given body exposes and at what price.
 */
export const LIMBS = {
  eyes: { apCost: 5 },
  head: { apCost: 3 }, // v2.0: 4
  arm: { apCost: 3 },
  torso: { apCost: 2 },
  groin: { apCost: 3 },
  leg: { apCost: 2 },
  object: { apCost: 4 }, // v2.0: 3
  // Power Armor's exposed Fusion Core (pg 58). Not a limb and not on the pg 129
  // table: it needs line of sight to the wearer's *back*, deals no damage and
  // applies no condition, and only overheats the suit once the core has taken
  // 30 damage. It rides this table because it is a targeted attack that costs
  // additional AP, which is the whole of what this table encodes.
  fusionCore: { apCost: 5 },
} as const;

/**
 * Limbs no human has, added by a robot sub-type (pg 9-10). Kept out of `LIMBS`
 * on purpose: `LIMB_KEYS` is the default body plan and is consumed as "every
 * limb there is" by callers that have no defender in hand, and quietly growing
 * it would offer every character a jet engine.
 *
 * Both borrow the leg's row wholesale — see `LIMB_PROFILES` for the `as` field
 * that says so, and for the two exceptions the book prints.
 */
export const ROBOT_LIMBS = {
  /**
   * Handy (pg 9): "creatures can target your jet engine. The jet engine
   * functions exactly the same as a targeted attack to the legs, except the
   * attack costs 2 more AP." Leg is 2, so 4.
   */
  jetEngine: { apCost: 4 },
  /**
   * Robobrain (pg 10): "creatures can target your all terrain rollers. The
   * rollers function exactly the same as a targeted attack to the legs except
   * they cannot be severed." No AP exception printed, so the leg's 2 stands.
   */
  rollers: { apCost: 2 },
} as const;

/** Every limb key that exists on any body plan. */
export const ALL_LIMBS = { ...LIMBS, ...ROBOT_LIMBS } as const;

export type LimbKey = keyof typeof ALL_LIMBS;
/**
 * The default body plan's keys. Unchanged by the robot work: callers that do
 * not know whose body they are aiming at still get the pg 129 table and only
 * that. Use `limbKeysFor` when the defender's sub-type is known.
 */
export const LIMB_KEYS = Object.keys(LIMBS) as LimbKey[];

/** A key that has its own printed row on the pg 129 table. */
export type PrintedLimbKey = keyof typeof LIMBS;

/**
 * Which rows are a *severance*, read off the printed severe injuries: Arm's is
 * "Severed Arm/Hand" and Leg's is "Severed Leg/Foot". No other row's severe
 * injury removes the limb — an eye is gouged, a torso bleeds internally, a
 * held object is destroyed — so "severable" is not a property the book states
 * limb by limb, it is a property of those two results.
 *
 * This matters for exactly one body plan: the Robobrain's rollers borrow the
 * leg row but "cannot be severed" (pg 10), which leaves the leg's severe injury
 * with nothing to do. See `severeInjuryFor`.
 */
export const SEVERING_ROWS: readonly PrintedLimbKey[] = ["arm", "leg"];

/**
 * One limb on one body plan.
 *
 * `as` is the pg 129 row it resolves on — damage modifier, the four d4
 * conditions, and the severe injury. A robot limb never gets its own row
 * invented for it; the book says the jet engine and the rollers "function
 * exactly the same as a targeted attack to the legs", which is a pointer to the
 * leg row, not a new one.
 */
export interface LimbProfileEntry {
  readonly as: PrintedLimbKey;
  /** Printed additional AP for a targeted attack against *this* body's limb. */
  readonly apCost: number;
  /** Whether a severe injury to this limb takes it off. */
  readonly severable: boolean;
  /** Extra printed consequence of severing it, as a lang key, or `null`. */
  readonly severedRiderKey: string | null;
}

export type LimbProfile = Readonly<Partial<Record<LimbKey, LimbProfileEntry>>>;

/** Shorthand for a row that is simply itself, at its printed price. */
function printed(as: PrintedLimbKey, severable = false): LimbProfileEntry {
  return { as, apCost: LIMBS[as].apCost, severable, severedRiderKey: null };
}

/**
 * The default body plan: the pg 129 table exactly as printed, for humans,
 * ghouls, Gen-2 synths, super mutants, and any robot who has not picked a
 * sub-type. Nothing added, nothing removed, nothing repriced.
 */
const DEFAULT_PROFILE: Readonly<Record<PrintedLimbKey, LimbProfileEntry>> = {
  eyes: printed("eyes"),
  head: printed("head"),
  // The only two rows whose severe injury is a severance — see `SEVERING_ROWS`.
  arm: printed("arm", true),
  torso: printed("torso"),
  groin: printed("groin"),
  leg: printed("leg", true),
  object: printed("object"),
  fusionCore: printed("fusionCore"),
};

/**
 * The two robot limbs, defined once because they are referenced twice: by the
 * profile that grants them, and by `entryFor`'s fallback, which needs an answer
 * for "a jet engine on a body that has no profile entry for one".
 */
const JET_ENGINE_ENTRY: LimbProfileEntry = {
  as: "leg",
  apCost: ROBOT_LIMBS.jetEngine.apCost,
  // "If your jet engine is severed" — the book says *when*, not *whether*,
  // which settles that it can be.
  severable: true,
  severedRiderKey: "FALLOUT.Targeted.limbs.jetEngine.severed",
};

const ROLLERS_ENTRY: LimbProfileEntry = {
  as: "leg",
  apCost: ROBOT_LIMBS.rollers.apCost,
  severable: false,
  severedRiderKey: null,
};

/** Every limb key resolved to *some* entry, for `entryFor`'s last resort. */
const FALLBACK_ENTRIES: Readonly<Record<LimbKey, LimbProfileEntry>> = {
  ...DEFAULT_PROFILE,
  jetEngine: JET_ENGINE_ENTRY,
  rollers: ROLLERS_ENTRY,
};

/**
 * Body plans by robot sub-type (pg 9-10).
 *
 * Whose sub-type: the **defender's**. Every one of these paragraphs is written
 * in the second person to the robot being shot at — "creatures can target your
 * jet engine" — so the body plan is a property of the target, never of the
 * attacker. This is worth stating loudly because the sheet's limb picker is
 * opened from the *attacker's* sheet and this system does not plumb a target
 * through it; a caller with no defender in hand must pass `""` and get the
 * printed table, which is what the default argument does.
 *
 * Insertion order is the pg 129 table's order, with a robot's own limb sitting
 * where the leg it replaces would have been, so a picker built from
 * `limbKeysFor` reads down the page the way the book does.
 *
 * Three things every profile below drops, and why:
 *
 * - **`fusionCore`.** Not a limb: it is the exposed core of a suit of power
 *   armor (pg 58), and "you cannot use power armor" is flat for robots (pg 9,
 *   and see `powerArmorEntry` in `power-armor.ts`). A robot defender therefore
 *   never has one to target. This is a deduction from two printed rules rather
 *   than a sentence in the robot chapter, which is why it is spelled out.
 * - **Limb counts.** A Handy has "three arms, three eyes"; a Protectron has
 *   "two arms, two legs, two hands, two feet". Nothing in this system tracks
 *   how many of a limb a creature has, and the printed rules only ever need the
 *   count in one place — the eye severe injury's "both eyes gouged =
 *   permanently blinded", which has no stated answer for a three-eyed Handy.
 *   Left unmodelled and unanswered rather than guessed at.
 * - **Hands.** A Handy has hands only if it took Grippers ("can have up to
 *   three hands if you choose to have three Grippers"), so a Gripper-less Handy
 *   arguably holds nothing and cannot be targeted for a held object. Grippers
 *   are not tracked here, and the book never says a Handy without them cannot
 *   carry anything, so `object` stays on the profile.
 */
export const LIMB_PROFILES: Record<RobotType, LimbProfile> = {
  "": DEFAULT_PROFILE,

  /**
   * Handy (pg 9):
   *
   * > You do not have a head, groin, or legs that can be targeted by targeted
   * > attacks or severed. Instead; targeted attacks to your eyes cost 2 less
   * > AP and creatures can target your jet engine. The jet engine functions
   * > exactly the same as a targeted attack to the legs, except the attack
   * > costs 2 more AP. If your jet engine is severed, you fall prone and cannot
   * > move until it is reattached.
   *
   * The exclusion list is read literally: head, groin, legs. The **torso stays**
   * — a Handy is "a large round core" and the book had every chance to strike
   * the torso row and did not, so the core is what a torso hit lands on.
   */
  handy: {
    // 5 − 2. Repricing the row rather than discounting at call time is the
    // ruling; see `targetedApCost` for why the order matters.
    eyes: { as: "eyes", apCost: LIMBS.eyes.apCost - 2, severable: false, severedRiderKey: null },
    arm: printed("arm", true),
    torso: printed("torso"),
    jetEngine: JET_ENGINE_ENTRY,
    object: printed("object"),
  },

  /**
   * Protectron (pg 10):
   *
   * > You have two arms, two legs, two hands, two feet, a head, and a torso.
   * > However, you do not have eyes or a groin that can be targeted by normal
   * > targeted attacks or severed.
   *
   * A plain subtraction: the pg 129 table minus eyes and groin. Nothing is
   * added and nothing is repriced.
   *
   * "targeted by **normal** targeted attacks" is the book's own hedge, and it
   * is left as flavour. It reads as leaving room for something abnormal to
   * reach an eye a Protectron does not have, but the book never prints such a
   * thing, so there is no second category of attack to model here.
   */
  protectron: {
    head: printed("head"),
    arm: printed("arm", true),
    torso: printed("torso"),
    leg: printed("leg", true),
    object: printed("object"),
  },

  /**
   * Robobrain (pg 10):
   *
   * > You have two arms, two hands, a head, and a torso. However, you do not
   * > have legs, feet, eyes, or a groin that can be targeted by normal targeted
   * > attacks or severed. Instead, creatures can target your all terrain
   * > rollers. The rollers function exactly the same as a targeted attack to
   * > the legs except they cannot be severed.
   */
  robobrain: {
    head: printed("head"),
    arm: printed("arm", true),
    torso: printed("torso"),
    rollers: ROLLERS_ENTRY,
    object: printed("object"),
  },
};

export function limbProfile(defenderRobotType: RobotType = ""): LimbProfile {
  return LIMB_PROFILES[defenderRobotType];
}

/** The limbs a targeted attack can name against this body, in table order. */
export function limbKeysFor(defenderRobotType: RobotType = ""): LimbKey[] {
  return Object.keys(limbProfile(defenderRobotType)) as LimbKey[];
}

/** Whether this body has the limb at all (pg 9-10 strike several from each). */
export function hasLimb(limb: LimbKey, defenderRobotType: RobotType = ""): boolean {
  return limbProfile(defenderRobotType)[limb] !== undefined;
}

/**
 * The profile entry, falling back to the default body plan.
 *
 * The fallback is not a shrug: it is what keeps a caller that names a limb the
 * defender does not have — an attacker aiming at a Robobrain's legs, say —
 * resolving on the printed table instead of throwing. Whether that attack
 * should be *allowed* is a UI question, and `hasLimb` is the check for it; the
 * book says only that those limbs cannot be targeted, never what happens if
 * someone tries.
 */
function entryFor(limb: LimbKey, defenderRobotType: RobotType): LimbProfileEntry {
  return limbProfile(defenderRobotType)[limb] ?? FALLBACK_ENTRIES[limb];
}

/**
 * The pg 129 row this limb's damage modifier, d4 conditions and severe injury
 * are read from — i.e. the lang sub-key under `FALLOUT.Targeted.limbs.*` for
 * `.effect`, `.c1`-`.c4` and `.severe`.
 *
 * A jet engine and a set of rollers both come back as `leg`, because "functions
 * exactly the same as a targeted attack to the legs" is a pointer to that row
 * and duplicating its text under two more keys would only invite the copies to
 * drift. The *label* is the exception — see `limbLabelKey`.
 */
export function limbRowKey(limb: LimbKey, defenderRobotType: RobotType = ""): PrintedLimbKey {
  return entryFor(limb, defenderRobotType).as;
}

/** The limb's own display name, which a jet engine and rollers do have. */
export function limbLabelKey(limb: LimbKey): string {
  return `FALLOUT.Targeted.limbs.${limb}.label`;
}

/** Whether a severe injury to this limb takes it off (pg 9-10, pg 129). */
export function isSeverable(limb: LimbKey, defenderRobotType: RobotType = ""): boolean {
  return entryFor(limb, defenderRobotType).severable;
}

/**
 * What a critical hit inflicts.
 *
 * `severeKey` is `null` in exactly one case: the limb resolves on a row whose
 * severe injury *is* a severance (`SEVERING_ROWS`) and this body cannot suffer
 * it — the Robobrain's rollers, "except they cannot be severed" (pg 10).
 *
 * **The book is silent on what a critical hit to the rollers does instead.**
 * Ruling: it takes pg 129's own alternative, "up to two of the limb's
 * conditions", which is printed as a choice available on any critical hit and
 * so needs no invention. The two rejected readings, for the record: dropping
 * the critical's effect entirely would make the rollers strictly better than
 * legs against critical hits in a way the sentence does not claim, and
 * substituting some other severe injury would mean writing one.
 *
 * `riderKeys` carries printed consequences that sit *on top of* the row's
 * severe injury — currently only the Handy's "you fall prone and cannot move
 * until it is reattached" (pg 9).
 */
export interface SevereInjuryOutcome {
  readonly severeKey: string | null;
  readonly riderKeys: readonly string[];
}

export function severeInjuryFor(
  limb: LimbKey,
  defenderRobotType: RobotType = "",
): SevereInjuryOutcome {
  const entry = entryFor(limb, defenderRobotType);
  const cannotSever = SEVERING_ROWS.includes(entry.as) && !entry.severable;
  if (cannotSever) {
    return { severeKey: null, riderKeys: ["FALLOUT.Targeted.cannotSever"] };
  }
  return {
    severeKey: `FALLOUT.Targeted.limbs.${entry.as}.severe`,
    riderKeys: entry.severedRiderKey === null ? [] : [entry.severedRiderKey],
  };
}

/**
 * How many d4 conditions a non-critical targeted attack inflicts once its
 * damage reaches hit points.
 *
 * One, except for the Robobrain's NeuroTransmitters (pg 10): "when you take
 * damage from a targeted attack to the head; you gain two conditions instead of
 * one."
 *
 * Scoped to the head row only, and to the non-critical path only. **The book
 * does not say** whether it also doubles the critical hit's "up to two of the
 * limb's conditions" into four; ruling is that it does not, because the trait
 * names the single-condition outcome ("two … instead of one") and there is no
 * "one" on the critical path for it to replace. It is likewise scoped by row
 * rather than by key, which costs nothing today — no robot limb borrows the
 * head row — but keeps the trait attached to *being a head hit*, which is what
 * the sentence says.
 */
export const ROBOBRAIN_HEAD_CONDITIONS = 2;
export const TARGETED_CONDITIONS_DEFAULT = 1;

/**
 * The two rows whose AP cell also halves the weapon's range (pg 129).
 *
 * > **Eyes.** +5, to hit ranged attack modifier is halved.
 * > **Head.** +3, to hit ranged attack modifier is halved.
 *
 * **Ruling: it halves the weapon's range, not its attack bonus.** The printed
 * cell is genuinely ambiguous — "to hit ranged attack modifier" parses as either
 * the modifier applied to a ranged attack, or the range multiplier a ranged
 * attack is measured with — and the two readings are worth very different
 * things. The v2.1 patch notes settle it in as many words: *"Attacking the eyes
 * and head now halves the **range of the weapon**."* It is also the only reading
 * under which the word "ranged" does any work, since an attack-bonus penalty
 * would apply just as well to a melee swing at somebody's eye.
 *
 * (The patch notes are not blindly trusted: the line directly below this one in
 * the same list — *"attacking the head now costs 4 AP instead of 3"* — is
 * exactly backwards against both books, and this system follows the books and
 * prints 3. The notes are used here because the book text is ambiguous rather
 * than contradictory, which is the one case a gloss can settle.)
 *
 * Applied to the multipliers before Perception scales them, so it composes with
 * the weather scale and Kickback's one-handed halving the same way they compose
 * with each other.
 */
export const RANGE_HALVING_LIMBS: readonly LimbKey[] = ["eyes", "head"];

/** Whether a targeted attack at this limb halves the weapon's range (pg 129). */
export function halvesRange(limb: LimbKey | null | undefined): boolean {
  return limb !== null && limb !== undefined && RANGE_HALVING_LIMBS.includes(limb);
}

export function targetedConditionCount(limb: LimbKey, defenderRobotType: RobotType = ""): number {
  return defenderRobotType === "robobrain" && limbRowKey(limb, defenderRobotType) === "head"
    ? ROBOBRAIN_HEAD_CONDITIONS
    : TARGETED_CONDITIONS_DEFAULT;
}

/**
 * Extra AP for a targeted attack; melee weapons reduce it by 2, minimum 1
 * (pg 130). The Fusion Core is excluded from that discount: the reduction is
 * printed for "a targeted attack with a melee weapon" against the limb table,
 * and whether a fusion core counts as a limb is not something the book says.
 *
 * `dismember` is the v2.1 rework of that weapon property (melee glossary, pg
 * 60-61): "Targeted attacks to the arms or legs with this weapon do not cost
 * additional AP."
 * Zero, not "reduced by 2" — the property replaces the surcharge outright, so
 * it also beats the melee reduction's minimum of 1. It reaches no other row:
 * a Dismember weapon still pays full price for a head or an eye. (v2.0 printed
 * a random arm/leg condition here instead; the sever-at-0-hit-points clause is
 * unchanged between editions and stays as text on the item, since it turns on
 * the target's hit points rather than on anything this function can see.)
 *
 * ## The defender's body plan (pg 9-10)
 *
 * `defenderRobotType` defaults to `""`, which is the printed table and the
 * behaviour every existing caller had before robots existed.
 *
 * Two of the sub-type clauses move AP: the Handy's eyes "cost 2 less AP" and
 * its jet engine "costs 2 more AP" than a leg. **The book never says where in
 * the order those deltas land** relative to pg 130's melee discount — and the
 * order is not academic, since the discount has a floor of 1 that a delta
 * applied afterwards would slip under or sit above.
 *
 * Ruling: the delta defines the *printed* cost for that body, and every other
 * modifier then applies to it in the existing order — melee discount and its
 * floor here, and the VATS matrix overlay (pg 59) afterwards at the call site.
 * Reasons, in order of weight:
 *
 * 1. The book prints the deltas in the body-plan paragraph, alongside which
 *    limbs exist at all. They read as a description of the robot's table, not
 *    as a step in resolving an attack.
 * 2. It keeps pg 130's "minimum of 1" meaningful. A delta applied last would
 *    put the Handy's eyes at −1 before clamping, or below the floor after it.
 * 3. One number is then both what the limb picker shows and what the chat card
 *    charges, which is how every other AP modifier in this file composes.
 *
 * For the Handy's eyes the two orders happen to agree anyway (5 → 3 → melee 1,
 * versus 5 → melee 3 → 1). For the jet engine they do not: this ruling charges
 * a melee attack 2, where applying the +2 after the discount would charge 3.
 *
 * A Dismember weapon zeroes the jet engine and the rollers too, because both
 * "function exactly the same as a targeted attack to the legs" and the property
 * names the legs. The jet engine's +2 goes with it: this file already holds
 * that Dismember "replaces the surcharge outright" rather than reducing it, and
 * the +2 is part of that surcharge. **The book addresses neither combination.**
 * The alternative — charging 2 for a Dismember hit on a jet engine, on the
 * grounds that the +2 is not the leg's cost and so is not what the property
 * cancels — is a defensible reading; it was rejected only for consistency with
 * the treatment already applied to the melee floor.
 *
 * There is no interaction with the VATS matrix overlay to rule on: that is the
 * *attacker's* power armor, and this argument is the *defender's* body.
 */
export function targetedApCost(
  limb: LimbKey,
  isMelee: boolean,
  dismember = false,
  defenderRobotType: RobotType = "",
): number {
  const entry = entryFor(limb, defenderRobotType);
  const base = entry.apCost;
  if (limb === "fusionCore") return base;
  if (dismember && (entry.as === "arm" || entry.as === "leg")) return 0;
  return isMelee ? Math.max(1, base - 2) : base;
}

/** The Fusion Core takes no damage and inflicts no condition (pg 58). */
export function dealsDamage(limb: LimbKey): boolean {
  return limb !== "fusionCore";
}
