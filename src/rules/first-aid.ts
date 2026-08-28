/**
 * Medicine-skill first aid (pg 21, pg 23, pg 131) — the two things a medic can
 * do with 6 AP and a Medicine check: end Bleeding, and pull a dying creature
 * back to 1 hit point.
 *
 * Pure functions only. Everything that writes a document lives in
 * `src/actions/first-aid.ts`.
 *
 * The book prints the bleeding half once (twice, identically) and the
 * stabilising half twice with two *different* DCs. That contradiction is
 * settled at `stabilizeDC` below, and the losing formula is kept alive as
 * `summaryStabilizeDC` so the chat card can show the table what the other
 * printing would have asked for. Smoothing it away silently would hide a
 * disagreement a GM is entitled to overrule.
 */

/**
 * Both halves of Medicine first aid cost 6 AP, in all three printings
 * (pg 21, pg 23, pg 131) — the one number the book never disagrees with.
 *
 * Not deducted anywhere: AP is spent by hand in this system (roadmap item 14),
 * so the action reports its cost and lets the player pay it.
 */
export const FIRST_AID_AP_COST = 6;

/** Ending Bleeding is a flat DC 15 Medicine check (pg 21, pg 23). */
export const END_BLEEDING_DC = 15;

/**
 * "If you are within 5 feet of a creature with the bleeding condition…"
 * (pg 21, pg 23). Reported, never enforced — this system does not consult token
 * positions anywhere, and the range bands on pg 21 are unenforced for the same
 * reason (ROADMAP D3).
 */
export const FIRST_AID_RANGE_FEET = 5;

/**
 * "…use 1 cloth junk item…" (pg 21, pg 23).
 *
 * Reported rather than consumed. There is no junk in this system to consume:
 * the shipped item types are weapon/armor/ammo/aid/perk/trait/gear, and no
 * pack ships a junk document, so there is nothing to look up, decrement, or
 * refuse the action over. Crafting is where junk will have to become real
 * (ROADMAP D3), and this rule should start consuming it the day it does.
 */
export const BLEEDING_CLOTH_JUNK = 1;

/**
 * The DC to stabilise a dying creature: **10 − the creature's Endurance
 * modifier** (pg 131).
 *
 * ## The book prints two different DCs, and they are different mechanics
 *
 * **pg 131**, combat chapter, under its own *Stabilizing a Creature* heading:
 *
 * > The best way to save a creature with 0 hit points is to heal it. If healing
 * > is unavailable, the creature can at least be stabilized so that it isn't
 * > killed by a failed death saving throw. **You can use 6 AP to administer
 * > first aid to a dying creature, roll a Medicine skill check with the DC
 * > equal to 10 - the creature's Endurance modifier. On a success, the creature
 * > returns to 1 hit point.**
 *
 * **pg 21** (Perception chapter) and **pg 23** (Intelligence chapter), inside
 * the Medicine skill blurb, which is reprinted in both because Medicine is
 * dual-governed:
 *
 * > If another character is dying [pg 23: **unconscious**] and has not failed
 * > all of their Death Saves, you can (at GM's discretion) spend 6 AP to make a
 * > Medicine check with **the DC being 10 + their failed Death Saves and -
 * > their successful Death Saves**. On a success the creature gains 1 hit
 * > point.
 *
 * One DC is fixed by how tough the patient is; the other rises as the patient
 * dies. Not a rounding difference — two designs.
 *
 * ## Why pg 131 wins
 *
 * 1. **The patch notes do not decide it.** Neither wording appears in the v2.1
 *    notes at all; their only death-save entry is Human Tenacity. Nothing to
 *    outrank, so the book decides alone.
 * 2. **The dedicated chapter beats the summary page** — this project's standing
 *    precedent, applied twice already and both times against the ability-score
 *    chapter: rest timings, pg 24 vs the dedicated Resting section on pg 119
 *    (`packs-src/V21-NOTES-stamina-terrain.md` C1 — "pg 24 reads as a stale
 *    one-paragraph summary in the ability-score chapter"), and optional-vs-
 *    mandatory stamina absorption, pg 24 vs pg 130 (C14 — "pg 130 is the combat
 *    chapter and should govern"). Pg 21 and pg 23 are ability-score chapter
 *    skill blurbs; pg 131 is the combat chapter, under a heading of its own,
 *    among the rules that define dying, death saves and damage at 0 HP.
 * 3. **The summary text is demonstrably stale.** The same paragraph is printed
 *    twice and the two copies do not match: pg 21 says "dying", pg 23 says
 *    "unconscious". A duplicated blurb that has already drifted from itself is
 *    exactly the shape of text that did not get updated.
 *
 * The pg 21/23 formula is *not* broken and is not rejected for being unusable —
 * it is a coherent death spiral, and a GM who prefers it should have it. So it
 * stays implemented at `summaryStabilizeDC` and is printed on the card.
 *
 * ## What the book does not say, and is decided elsewhere
 *
 * - **No floor and no cap on the DC.** Endurance modifier is `score − 5` and
 *   creature scores run to 20, so a tough enough creature yields a DC of 0 or
 *   below. Left as computed: the book prints no floor, and inventing one would
 *   be inventing a rule. No skill check in this system auto-fails on a 1, so a
 *   DC at or below 1 is simply a formality.
 * - **Failure does nothing.** Neither printing states a consequence, and
 *   neither forbids trying again, so the action is repeatable — the same
 *   reading `repairItem` takes of the same silence.
 */
export function stabilizeDC(enduranceModifier: number): number {
  return 10 - enduranceModifier;
}

/**
 * The **rejected** pg 21/23 DC: `10 + failed Death Saves − successful Death
 * Saves`. See `stabilizeDC` for why it lost.
 *
 * Kept live so the chat card can print both numbers side by side. The book
 * disagrees with itself here and the table should be able to see that it does,
 * rather than find out when a GM reads pg 21 and the button says something
 * else.
 */
export function summaryStabilizeDC(failures: number, successes: number): number {
  return 10 + failures - successes;
}

/**
 * Whether a creature is dying, in the only sense this system can decide: it is
 * at 0 hit points (pg 131, "When your hit points reach 0, you gain the dying
 * condition").
 *
 * Pg 23's copy says "unconscious" rather than "dying", which the book never
 * defines as a separate state with its own hit-point rule, so the pg 21 and
 * pg 131 wording governs and 0 HP is the whole test.
 */
export function isDying(hitPoints: number): boolean {
  return hitPoints <= 0;
}

/**
 * Whether first aid can still reach this creature.
 *
 * Pg 21/23 gate the attempt on "has not failed all of their Death Saves";
 * pg 131 states no gate at all. The gate turns out to be vacuous either way —
 * a creature that has failed all of its death saves is dead (pg 131, and four
 * rather than three for a Human's Tenacity), and nothing in the book brings the
 * dead back with a Medicine check. So this is the same test under both
 * printings: dying, and not yet dead.
 *
 * The "(at GM's discretion)" half of pg 21/23 is not modelled — a GM who does
 * not want the attempt made simply does not let it be made, and the card says
 * the clause exists.
 */
export function canStabilize(
  hitPoints: number,
  failures: number,
  failureLimit: number,
): boolean {
  return isDying(hitPoints) && failures < failureLimit;
}

/** What a successful DC 15 Medicine check does to a bleeding creature. */
export interface BleedingRelief {
  /** The level the condition ends at — the disease floor, not always zero. */
  levels: number;
  /** Levels actually shed. */
  removed: number;
  /** True when a disease floor is the only thing left and nothing can move. */
  floorBlocked: boolean;
}

/**
 * "…succeed a DC 15 Medicine skill check to **end the condition**" (pg 21,
 * pg 23) — all levels at once, not one, and not the "up to two" a First Aid Kit
 * or Doctor's Bag Tourniquet removes for the same 6 AP (pg 86). The Medicine
 * route costs a check and a cloth junk item and is strictly the better one on a
 * heavily bleeding target; that asymmetry is the book's.
 *
 * A disease that locks levels of a condition in place holds them through this
 * too (pg 120, and `derived.conditionFloors`): the floor is the real bottom,
 * exactly as `useAid`'s `relieve()` treats Dysentery's Dehydration. No shipped
 * disease locks Bleeding today, but the floor is honoured rather than assumed
 * empty — a GM-authored disease or a later extraction should not be able to
 * write through it.
 */
export function endBleedingRelief(current: number, floor: number): BleedingRelief {
  const levels = Math.max(floor, 0);
  return {
    levels,
    removed: Math.max(0, current - levels),
    floorBlocked: current <= levels,
  };
}

// ===========================================================================
// The pg 86 medical kits
// ===========================================================================

/**
 * The First Aid Kit and the Doctor's Bag (pg 86), read from the page image as
 * well as the layout extraction.
 *
 * > **First Aid Kit.** You can use this kit on yourself or another creature so
 * > long as they are next to you. When you use it, choose one of the following
 * > actions.
 * > - **Tourniquet.** Spend 6 AP and remove up to two levels of bleeding.
 * > - **Pain Killer.** Spend 6 AP to heal a dying creature 1 hit point.
 * > - **Stitch Wounds.** Spend 10 minutes and heal a creature with a number of
 * >   hit points equal to double their healing rate + your medicine skill bonus.
 * >
 * > After you have used one of these actions, the first aid kit's supplies are
 * > used and it no longer functions.
 *
 * The Doctor's Bag prints the identical paragraph with **Set Bone** added and
 * "three of these actions" instead of one.
 *
 * **Neither action rolls anything.** That is the whole point of the equipment
 * route: it is the no-check alternative to the Medicine first aid above, and
 * pays for that in supplies. See `packs-src/V21-NOTES-first-aid.md` §2.4 for
 * the four routes to a dying creature's first hit point and how they compare.
 */
export const MEDICAL_KIT_AP = 6;

/** Stitch Wounds and Set Bone are timed, not AP-priced (pg 86). */
export const MEDICAL_KIT_MINUTES = 10;

/** "remove **up to two** levels of bleeding" (pg 86). */
export const TOURNIQUET_BLEEDING_LEVELS = 2;

/** "heal a dying creature **1 hit point**" (pg 86). */
export const PAIN_KILLER_HIT_POINTS = 1;

export type MedicalKitKind = "firstAidKit" | "doctorsBag";
export type MedicalKitAction = "tourniquet" | "painKiller" | "stitchWounds" | "setBone";

/**
 * How many actions a kit holds before "the supplies are used and it no longer
 * functions" (pg 86).
 *
 * The First Aid Kit's own sentence is *"After you have used one of these
 * actions"*, so one; the Doctor's Bag says three. Neither says the three have
 * to be different actions, so a bag can set the same bone three times.
 */
export const MEDICAL_KIT_USES: Readonly<Record<MedicalKitKind, number>> = {
  firstAidKit: 1,
  doctorsBag: 3,
};

/** Set Bone is printed only in the Doctor's Bag entry (pg 86). */
export const MEDICAL_KIT_ACTIONS: Readonly<Record<MedicalKitKind, readonly MedicalKitAction[]>> = {
  firstAidKit: ["tourniquet", "painKiller", "stitchWounds"],
  doctorsBag: ["tourniquet", "painKiller", "stitchWounds", "setBone"],
};

/**
 * Recognise a kit by name.
 *
 * Name matching is the idiom this system already uses for a shipped item with
 * no mechanical field of its own — `powerArmorItem` keys off a boolean the
 * armor model carries, but Ice Cream and Apple Pie (`src/actions/use-aid.ts`)
 * keys off the perk's name for exactly this reason: the aid data model has no
 * "is a reusable kit" field and `src/data/**` is not this work's to change.
 * Both apostrophes are accepted because the compendium ships the typographic
 * one ("Doctor’s Bag") and a hand-made item will almost certainly not.
 */
export function medicalKitKind(name: string): MedicalKitKind | null {
  const haystack = name.toLowerCase().replace(/[’']/g, "");
  if (haystack.includes("first aid kit")) return "firstAidKit";
  if (haystack.includes("doctors bag")) return "doctorsBag";
  return null;
}

/**
 * Stitch Wounds: *"heal a creature with a number of hit points equal to double
 * **their** healing rate + **your** medicine skill bonus"* (pg 86).
 *
 * Two different creatures in one formula, and the pronouns are unambiguous: the
 * healing rate is the patient's, the Medicine bonus is the medic's. Floored at
 * zero — a medic with a negative Medicine bonus and a patient with a healing
 * rate of 1 would otherwise heal a negative number, which no printing
 * contemplates and which would make a healing item deal damage.
 */
export function stitchWoundsHitPoints(
  patientHealingRate: number,
  medicMedicineBonus: number,
): number {
  return Math.max(0, 2 * Math.floor(patientHealingRate) + Math.floor(medicMedicineBonus));
}

/**
 * Efficient Diagnosis (perk, pg 38, Perception):
 *
 * > Whenever you use a stimpak, first aid kit, or doctor's bag on another
 * > creature; they heal an additional 2 hit points, alternatively you can flip
 * > one of your karma caps to heal double the amount you normally would.
 * > **Repeat:** You can take this perk up to a maximum of three times, each
 * > time increasing the number healed by 2.
 *
 * Named here rather than left as a note, because it is the one perk in 186 that
 * keys off *this* action rather than off a roll — `packs-src/V21-NOTES-first-aid.md`
 * §4.13 rejected it only because there was no kit action for it to modify.
 *
 * Two readings, both stated on the card:
 *
 * - **"on another creature" is literal.** Self-treatment gains nothing, which is
 *   what the words say and is the only clause in the perk that limits it.
 * - **The Karma Cap alternative is not automated.** No cap-spend workflow exists
 *   anywhere in the actions layer — the same wall Tainted food's cap escape ran
 *   into (`src/actions/use-aid.ts`) — so it is offered as a reminder.
 *
 * Repeats are counted as copies of the perk item on the sheet, which is how a
 * repeatable perk is represented here; the printed maximum of three is enforced
 * so a mis-imported fourth copy cannot inflate it.
 */
export const EFFICIENT_DIAGNOSIS = "Efficient Diagnosis";
export const EFFICIENT_DIAGNOSIS_HP_PER_RANK = 2;
export const EFFICIENT_DIAGNOSIS_MAX_RANKS = 3;

export function efficientDiagnosisBonus(ranks: number, onAnotherCreature: boolean): number {
  if (!onAnotherCreature) return 0;
  const capped = Math.min(Math.max(0, Math.floor(ranks)), EFFICIENT_DIAGNOSIS_MAX_RANKS);
  return capped * EFFICIENT_DIAGNOSIS_HP_PER_RANK;
}

/** What a Tourniquet actually removes, against a pg 120 disease floor. */
export function tourniquetRelief(current: number, floor: number): BleedingRelief {
  const levels = Math.max(Math.max(floor, 0), current - TOURNIQUET_BLEEDING_LEVELS);
  return {
    levels,
    removed: Math.max(0, current - levels),
    floorBlocked: current <= levels,
  };
}
