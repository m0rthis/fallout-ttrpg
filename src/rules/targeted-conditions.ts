/**
 * What the pg 129 limb conditions *do* — the mechanical half of the d4 table
 * whose text lives in `lang/en.json` under `FALLOUT.Targeted.limbs.<row>.c1`-`c4`.
 *
 * Until now that d4 posted a sentence and nothing else. Every other clause in
 * v2.1's rework of this table had landed; these four columns were the last
 * entry on the coverage audit's impact list that was printed and not realised.
 *
 * ## Why this is not a violation of "report, never enforce"
 *
 * This system reports AP rather than deducting it (backlog E1), and reports
 * movement costs rather than draining a budget nothing tracks. Neither posture
 * is at stake here, because **nothing in this file applies itself.** The d4 card
 * carries a GM button; a person presses it once the damage has actually reached
 * hit points, which is the condition the book puts on the whole table and which
 * no attack roll can know at the time it is rolled. What the button then writes
 * is an ordinary Active Effect the GM can delete.
 *
 * The one place that came close to the E1 line is the three rows reading "−2 AP
 * for two turns" (head c3, torso c3, groin c1-c2), which are realised as a
 * change to `bonuses.apMax`. That is a **ceiling**, not a spend: E1 is about
 * this system declining to track AP as a pool that actions draw down, and the
 * AP maximum is a number the sheet already computes and shows. Lowering it for
 * two rounds is the same kind of write a chem that raises it makes.
 *
 * ## The four durations the table prints, and what each becomes
 *
 * - **"for two turns"** (and Rattled's three, and Painful Collapse's "until the
 *   end of their next turn") → a Foundry `rounds` duration on the *target*.
 *   Each combat round gives the target exactly one turn, so N of the target's
 *   turns is N rounds; `turns` would have been wrong, because Foundry counts a
 *   turn per combatant rather than per round.
 *
 *   **Out of combat there is no clock, and this system does not invent one.** A
 *   round-based duration on an actor in no combat simply never advances, and the
 *   effect sits on the sheet until someone removes it — which is the behaviour
 *   every marker in `situations.ts` and `stealth.ts` already has, for the reason
 *   given at length in both. "Two turns" outside initiative is not a span this
 *   system can measure.
 * - **"for the next hour"** (Temporary Blindness) → real world time, the only
 *   duration Foundry expires by itself. It carries the full-heal trigger too:
 *   the book prints *"or until all hit points are healed"*, whichever comes
 *   first.
 * - **"until all hit points are healed"** (Leg Cripple) → no clock at all, and
 *   the `updateActor` hook in `actions/targeted-conditions.ts` clears it — the
 *   same trigger and the same hook shape Short Circuit's full-heal clause uses.
 * - **"until treated with a doctor's bag"** (Broken Arm) → no clock, cleared by
 *   the first-aid path that spends a doctor's bag, or by hand.
 *
 * ## What stays text, and why each one does
 *
 * Three entries write nothing, and neither is an oversight:
 *
 * - **arm c1** ("drops whatever they are holding in that arm") — nothing in
 *   this system says which hand holds what. There are equipped weapons, not
 *   hands.
 * - **torso c1-c2** ("No condition") — the book's own blank. Realised as an
 *   entry that reports there is nothing to apply, rather than as a missing key,
 *   so the button can say so instead of failing.
 *
 * ## The object row, which asks rather than guesses
 *
 * All four object entries act on *which* held object was hit, and the limb
 * picker names a limb, never an item — which is why they were text for as long
 * as they were. They are not text any more, and the missing fact is supplied
 * the only honest way: the GM is asked.
 *
 * So an object entry carries an `ObjectClause` instead of changes, and the
 * apply path takes a picker. Given an item, the clauses are ordinary writes:
 *
 * - **c1** "gains two levels of decay" → `decayItem(actor, item, 2)`, which is
 *   the same choke point a critical failure and a soaking armor already go
 *   through, so a Super Mutant's Bulky (pg 12) reaches this the way it reaches
 *   those without this module knowing the rule exists.
 * - **c2/c3** "flies one foot away" / "flies 1d4 × 5 feet away" → the distance
 *   (rolled, for c3) and the object leaving the target's hands. Unequipping is
 *   the same kind of write as the `prone` toggle two rows up: a state the book
 *   puts the target into, reversible by the player in one click. Where the item
 *   has no `equipped` field at all — gear is carried, never wielded — the
 *   distance is reported and nothing is written, because there is no held-ness
 *   to end.
 * - **c4** "choose condition 1, 2, or 3" → the picker asks for that too, and
 *   the chosen face resolves exactly as it would have on its own.
 *
 * **No clause here is a damage or an AP write**, so the E1 line is nowhere near
 * this. Decay is an item field the sheet already edits by hand.
 *
 * What stays with the GM is the row's *severe* result, "destroyed beyond repair
 * (GM's discretion)" — the book hands that one over in as many words.
 *
 * Broken Arm's disadvantage is a fifth, and a closer call: *"disadvantage on
 * two-armed STR/AGI rolls"* is scoped to rolls that need both arms, which is
 * not a category `RollScope` can name — the same reason `rules/effects.ts`
 * gives for the 32 perks it declined to automate. Granting disadvantage on
 * every Strength and Agility check instead would be strictly harsher than the
 * printed condition, so the effect lands as a marker carrying its text.
 */

import type { EffectChange } from "./effects";
import {
  addChange,
  bonusPath,
  disadvantageChange,
  moveCapChange,
} from "./effects";
import type { PrintedLimbKey } from "./targeted";

/** The four faces of the d4 that picks a condition (pg 129). */
export type ConditionIndex = 1 | 2 | 3 | 4;

export const CONDITION_INDICES: readonly ConditionIndex[] = [1, 2, 3, 4];

/**
 * How long a condition lasts, in the terms the table actually prints.
 *
 * `rounds` and `seconds` are Foundry durations; `untilFullHeal` and
 * `untilTreated` are triggers, and an entry may carry both a clock and a
 * trigger (Temporary Blindness prints "or", not "and then").
 */
export interface TargetedConditionDuration {
  /** Target's turns, expressed as combat rounds. Null when there is no clock. */
  readonly rounds: number | null;
  /** Real seconds, for the one entry the book measures in hours. */
  readonly seconds: number | null;
  /** Cleared when the target reaches full hit points. */
  readonly untilFullHeal: boolean;
  /** Cleared by treatment with a doctor's bag. */
  readonly untilTreated: boolean;
}

/**
 * What one face of the object row does to a held item, once someone has said
 * *which* item.
 *
 * Separate from `changes` because none of it is an Active Effect on the
 * creature: decay is a field on the item, and flying out of someone's hands is
 * an equip state. Nothing here expires, so none of it carries a duration.
 */
export interface ObjectClause {
  /** Levels of decay the object gains, before Bulky and the cap have a say. */
  readonly decay: number;
  /** The object leaves the target's hands, where the item tracks being held. */
  readonly unequip: boolean;
  /** A printed distance in feet, for the entry that names one. */
  readonly feet: number | null;
  /** A rolled distance, for the entry that prints dice instead. */
  readonly formula: string | null;
  /** c4 alone: the GM picks which of c1-c3 actually lands. */
  readonly choose: boolean;
}

export interface TargetedCondition {
  readonly row: PrintedLimbKey;
  readonly index: ConditionIndex;
  /** Guided changes the effect carries. Empty for a marker. */
  readonly changes: readonly EffectChange[];
  /** Token statuses the effect asserts for as long as it lasts. */
  readonly statuses: readonly string[];
  /**
   * Statuses toggled on outright, with no clock and no effect to expire.
   *
   * Only ever `prone`, and deliberately: a creature is not prone for a duration,
   * it is prone until it stands up, which is a move it makes and not a timer.
   * `actions/movement.ts` already lands a fall this way.
   */
  readonly toggles: readonly string[];
  readonly duration: TargetedConditionDuration;
  /** What this does to a held item, for the object row. Null everywhere else. */
  readonly object: ObjectClause | null;
  /** The condition is real but this system writes nothing for it (see above). */
  readonly manual: boolean;
  /** The book prints no condition on this face at all (torso c1-c2). */
  readonly blank: boolean;
}

const NO_DURATION: TargetedConditionDuration = {
  rounds: null,
  seconds: null,
  untilFullHeal: false,
  untilTreated: false,
};

/** "for two turns" and its siblings: N of the target's turns, as N rounds. */
function turns(rounds: number): TargetedConditionDuration {
  return { ...NO_DURATION, rounds };
}

/** Temporary Blindness: an hour on the clock, or a full heal, whichever first. */
const HOUR_OR_HEALED: TargetedConditionDuration = {
  rounds: null,
  seconds: 3600,
  untilFullHeal: true,
  untilTreated: false,
};

const UNTIL_HEALED: TargetedConditionDuration = { ...NO_DURATION, untilFullHeal: true };
const UNTIL_TREATED: TargetedConditionDuration = { ...NO_DURATION, untilTreated: true };

interface ConditionSpec {
  changes?: readonly EffectChange[];
  statuses?: readonly string[];
  toggles?: readonly string[];
  duration?: TargetedConditionDuration;
  object?: ObjectClause;
  manual?: boolean;
  blank?: boolean;
}

function build(row: PrintedLimbKey, index: ConditionIndex, spec: ConditionSpec): TargetedCondition {
  return {
    row,
    index,
    changes: spec.changes ?? [],
    statuses: spec.statuses ?? [],
    toggles: spec.toggles ?? [],
    duration: spec.duration ?? NO_DURATION,
    object: spec.object ?? null,
    manual: spec.manual ?? false,
    blank: spec.blank ?? false,
  };
}

/** One face of the object row (pg 129), defaulted to "does none of that". */
function heldObject(
  index: ConditionIndex,
  clause: Partial<ObjectClause>,
): TargetedCondition {
  return build("object", index, {
    object: {
      decay: clause.decay ?? 0,
      unequip: clause.unequip ?? false,
      feet: clause.feet ?? null,
      formula: clause.formula ?? null,
      choose: clause.choose ?? false,
    },
  });
}

/** "−N to all attack rolls for two turns", the table's commonest entry. */
function toHit(row: PrintedLimbKey, index: ConditionIndex, penalty: number): TargetedCondition {
  return build(row, index, {
    changes: [addChange(bonusPath("attack"), -penalty)],
    duration: turns(2),
  });
}

/** "−N AP for two turns" — a ceiling, not a spend. See the module note. */
function apLoss(row: PrintedLimbKey, index: ConditionIndex, ap: number): TargetedCondition {
  return build(row, index, {
    changes: [addChange(bonusPath("apMax"), -ap)],
    duration: turns(2),
  });
}

/** "Can only move a maximum of N feet for two turns". */
function moveCap(
  row: PrintedLimbKey,
  index: ConditionIndex,
  feet: number,
  duration: TargetedConditionDuration,
): TargetedCondition {
  return build(row, index, { changes: [moveCapChange(feet)], duration });
}

/**
 * The whole pg 129 d4 table, realised. Keyed by the row a limb resolves on —
 * `limbRowKey`, never the limb's own key, so a Handy's jet engine and a
 * Robobrain's rollers land the leg row's conditions the way their text says.
 *
 * `fusionCore` has no entry on purpose: a Fusion Core attack "applies no
 * condition" (pg 58), and `dealsDamage` already refuses to roll the d4 for it.
 */
export const TARGETED_CONDITIONS: Readonly<
  Record<PrintedLimbKey, Readonly<Record<ConditionIndex, TargetedCondition>> | null>
> = {
  eyes: {
    1: toHit("eyes", 1, 5),
    2: build("eyes", 2, {
      changes: [disadvantageChange("attack")],
      duration: turns(2),
    }),
    3: build("eyes", 3, { statuses: ["blinded"], duration: turns(2) }),
    // Temporary Blindness. The only entry on the table the book measures in
    // real time, and so the only one Foundry expires by itself.
    4: build("eyes", 4, { statuses: ["blinded"], duration: HOUR_OR_HEALED }),
  },
  head: {
    1: toHit("head", 1, 2),
    2: toHit("head", 2, 5),
    3: apLoss("head", 3, 2),
    // Rattled: three turns, not two — the one entry that breaks the table's
    // otherwise uniform span.
    4: build("head", 4, { statuses: ["frightened"], duration: turns(3) }),
  },
  arm: {
    // "Target drops whatever they are holding in that arm" — no hand model.
    1: build("arm", 1, { manual: true }),
    2: toHit("arm", 2, 2),
    3: toHit("arm", 3, 5),
    // Broken Arm. A marker with no changes: "two-armed STR/AGI rolls" is a
    // scope the category model cannot name, and widening it to every Strength
    // and Agility check would be harsher than the printed condition.
    4: build("arm", 4, { duration: UNTIL_TREATED }),
  },
  torso: {
    1: build("torso", 1, { blank: true }),
    2: build("torso", 2, { blank: true }),
    3: apLoss("torso", 3, 2),
    // Gut Wallop. `dazed` already costs AP and imposes disadvantage through the
    // derived pass (`character.ts`), so the status is the whole realisation.
    4: build("torso", 4, { statuses: ["dazed"], duration: turns(2) }),
  },
  groin: {
    1: apLoss("groin", 1, 2),
    2: apLoss("groin", 2, 3),
    3: build("groin", 3, { toggles: ["prone"] }),
    // Painful Collapse: prone *and* dazed. The prone half is a toggle with no
    // clock (you stand up out of it), the dazed half runs the printed round.
    4: build("groin", 4, { toggles: ["prone"], statuses: ["dazed"], duration: turns(1) }),
  },
  leg: {
    1: moveCap("leg", 1, 30, turns(2)),
    2: moveCap("leg", 2, 20, turns(2)),
    3: moveCap("leg", 3, 15, turns(2)),
    // Leg Cripple: the same 20 feet as c2, but held until a full heal rather
    // than for two turns.
    4: moveCap("leg", 4, 20, UNTIL_HEALED),
  },
  object: {
    // All four act on a specific held item, which the apply path asks for.
    // See the module note.
    1: heldObject(1, { decay: 2 }),
    2: heldObject(2, { unequip: true, feet: 1 }),
    // "1d4 × 5 feet" — the multiplication is the book's, not a die size this
    // system invented, so it is written the way the table prints it.
    3: heldObject(3, { unequip: true, formula: "1d4 * 5" }),
    4: heldObject(4, { choose: true }),
  },
  fusionCore: null,
};

/** The realisation for one face of one row, or null where there is none. */
export function targetedCondition(
  row: PrintedLimbKey,
  index: number,
): TargetedCondition | null {
  const table = TARGETED_CONDITIONS[row];
  if (table === null) return null;
  if (index !== 1 && index !== 2 && index !== 3 && index !== 4) return null;
  return table[index];
}

/**
 * Whether pressing Apply on this condition would write anything.
 *
 * False for the book's own blanks (torso c1-c2) and for the four entries this
 * system reports rather than writes. The button reads this so it can say which
 * of the two it is instead of appearing to work and doing nothing.
 */
export function isApplicable(condition: TargetedCondition): boolean {
  if (condition.blank || condition.manual) return false;
  return (
    condition.changes.length > 0 ||
    condition.statuses.length > 0 ||
    condition.toggles.length > 0 ||
    condition.object !== null ||
    condition.duration.untilFullHeal ||
    condition.duration.untilTreated
  );
}

/**
 * Whether applying this needs someone to name an item first.
 *
 * True for the whole object row and nothing else. The apply path reads it to
 * decide whether to ask; a caller with no picker to ask with reports the
 * condition rather than guessing which of the target's things was hit.
 */
export function needsItem(condition: TargetedCondition): boolean {
  return condition.object !== null;
}

/**
 * The clause a c4 resolves to, once the GM has chosen a face.
 *
 * Only the object row prints "choose condition 1, 2, or 3", and the chosen face
 * is resolved through the same table rather than re-derived, so c1's two levels
 * of decay are defined in exactly one place.
 */
export function chosenObjectClause(index: number): ObjectClause | null {
  if (index !== 1 && index !== 2 && index !== 3) return null;
  const condition = targetedCondition("object", index);
  const clause = condition?.object ?? null;
  // A `choose` clause reached through a choice would be a loop; c4 is the only
  // face that carries one and it is not offered as an answer to itself.
  return clause === null || clause.choose ? null : clause;
}

/**
 * Whether this condition needs an effect document at all.
 *
 * Groin c3 is the one entry that does not: it toggles `prone` and nothing else,
 * and an effect carrying no changes, no statuses and no duration would be an
 * empty row on the sheet that the player has to tidy away themselves.
 */
export function needsEffect(condition: TargetedCondition): boolean {
  return (
    condition.changes.length > 0 ||
    condition.statuses.length > 0 ||
    condition.duration.rounds !== null ||
    condition.duration.seconds !== null ||
    condition.duration.untilFullHeal ||
    condition.duration.untilTreated
  );
}
