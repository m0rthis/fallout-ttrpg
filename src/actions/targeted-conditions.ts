/**
 * Applying a pg 129 limb condition — the document-writing half of
 * `rules/targeted-conditions.ts`, which holds the table and the rulings.
 *
 * ## Why a button and not a branch
 *
 * The d4 is rolled by the attack, but the condition it picks only lands *"if
 * the damage reaches hit points"* — a fact that does not exist yet when the
 * attack roll resolves, because the damage has not been rolled, let alone
 * applied through stamina and DT. So the attack posts the condition as a
 * conditional announcement (it always has), and the card carries a GM button
 * that writes it once the damage has actually landed. That is the same shape as
 * the Apply Damage button, and for the same reason: the GM is the only one who
 * knows both ends.
 *
 * ## Two things it writes, and one it does not
 *
 * - **An Active Effect** on the target, carrying the guided changes and the
 *   statuses for as long as the condition lasts. Deleting it reverts everything
 *   cleanly, which is the whole reason the changes are guided.
 * - **A `prone` toggle**, for the two entries that knock a creature down. Not
 *   part of the effect: prone ends by standing up, not by a clock, and
 *   `actions/movement.ts` already lands a fall this way.
 * - **Never damage, and never AP spent.** The condition is a consequence of
 *   damage that has already been applied by the time this runs.
 *
 * ## The two triggers
 *
 * `registerTargetedConditionHooks` watches hit points for the full-heal trigger
 * — Temporary Blindness's "or until all hit points are healed" and Leg
 * Cripple's "until all hit points are healed". It is the same hook shape, the
 * same `isPrimaryGM` guard and the same reasoning as Short Circuit's full-heal
 * clause in `actions/short-circuit.ts`: five call sites restore hit points and
 * a sixth would silently not clear the condition, so the write is watched
 * rather than each site being taught.
 *
 * Broken Arm's "until treated with a doctor's bag" is not a hook, because it has
 * a single call site that can see it: Set Bone in `actions/first-aid.ts`. That
 * branch used to say, in as many words, that there was nothing for it to remove.
 * There is now.
 */

import type { CharacterData } from "../data/character";
import { SYSTEM_ID } from "../rules/effects";
import type { PrintedLimbKey } from "../rules/targeted";
import type {
  ConditionIndex,
  ObjectClause,
  TargetedCondition,
} from "../rules/targeted-conditions";
import {
  chosenObjectClause,
  isApplicable,
  needsEffect,
  needsItem,
  targetedCondition,
} from "../rules/targeted-conditions";
import { isPrimaryGM } from "../combat/turns";
import { bulkyNote, decayItem } from "./decay";
import { clearMarkers } from "./markers";

/** The flag a limb-condition effect carries, and what the triggers read. */
export interface TargetedConditionRecord {
  readonly row: PrintedLimbKey;
  readonly index: ConditionIndex;
  readonly untilFullHeal: boolean;
  readonly untilTreated: boolean;
}

const FLAG_KEY = "limbCondition";

function isRecord(value: unknown): value is TargetedConditionRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<TargetedConditionRecord>;
  return typeof record.row === "string" && typeof record.index === "number";
}

/**
 * Which item the object row hit, and — for c4 — which face the GM chose.
 *
 * The answer to a question this system cannot derive: an attack names a limb,
 * and the object row's every clause acts on a thing being carried.
 */
export interface ObjectResolution {
  readonly item: FoundryItem;
  /** The face to resolve, for c4's "choose condition 1, 2, or 3". */
  readonly index?: 1 | 2 | 3;
}

/**
 * How the apply path asks.
 *
 * Injected rather than imported, and deliberately: a dialog is a sheet concern,
 * this module writes documents, and `actions/` opening an `ApplicationV2` would
 * be the first time it did. It also leaves the whole object row drivable from a
 * test or a macro, which a dialog reached by import would not.
 */
export type ObjectPicker = (
  actor: FoundryActor,
  condition: TargetedCondition,
) => Promise<ObjectResolution | null>;

export interface TargetedConditionReport {
  readonly row: PrintedLimbKey;
  readonly index: ConditionIndex;
  /** Whether anything was written to the target. */
  readonly applied: boolean;
  /**
   * Why nothing was written, when nothing was: `"blank"` for the book's own
   * "No condition" (torso c1-c2), `"manual"` for the entries this system
   * reports rather than writes, `"noItem"` when the object row was not told
   * which object. Null when it applied.
   */
  readonly reason: "blank" | "manual" | "noItem" | null;
  /** The effect created, when one was. */
  readonly effectId: string | null;
  /** Statuses toggled outright — only ever `prone`. */
  readonly toggled: readonly string[];
}

/**
 * The icon the effect wears, picked off what it actually does.
 *
 * Cosmetic, and deliberately reusing core's own status art rather than shipping
 * any: everything this system ships must stay CC-BY/CC0, and core's SVGs are
 * already on every install.
 */
function iconFor(condition: TargetedCondition): string {
  if (condition.statuses.includes("blinded")) return "icons/svg/blind.svg";
  if (condition.statuses.includes("dazed")) return "icons/svg/daze.svg";
  if (condition.statuses.includes("frightened")) return "icons/svg/terror.svg";
  if (condition.duration.untilTreated) return "icons/svg/blood.svg";
  // Every path above and this one names an SVG core already ships and this
  // system already uses elsewhere (`STATUS_EFFECTS` in `fallout.ts`), so
  // nothing here adds art — shipped art has to stay CC-BY/CC0.
  return "icons/svg/downgrade.svg";
}

/**
 * The Foundry duration for a condition, in v14's shape.
 *
 * `{value, units}` and **not** `{rounds: 2}`: the older per-unit keys are only
 * shimmed in v14 (docs/foundry-v14-notes.md, verified against 14.365), and the
 * modern shape is what `consumable-effects.ts` already authors.
 *
 * Real time wins where an entry has both, which is Temporary Blindness alone —
 * "blinded for the next hour" is the clock the book actually names, and rounds
 * would only be reachable if a later entry printed both.
 *
 * An entry with no clock gets no `duration` key at all rather than an empty
 * object, which is what every duration-less marker in this system does.
 */
function durationFor(condition: TargetedCondition): Record<string, unknown> | null {
  if (condition.duration.seconds !== null) {
    return { value: condition.duration.seconds, units: "seconds" };
  }
  if (condition.duration.rounds !== null) {
    return { value: condition.duration.rounds, units: "rounds" };
  }
  return null;
}

/** Whether this item models being held at all. Gear is carried, never wielded. */
function tracksEquipped(item: FoundryItem): boolean {
  return "equipped" in (item.system as Record<string, unknown>);
}

/** What a clause did: the sentences to print, and whether anything was written. */
interface ObjectOutcome {
  readonly lines: string[];
  /**
   * True only if a document actually changed.
   *
   * Kept apart from "did we post a card", because the two genuinely differ: an
   * item already at the decay cap, and gear that has no equip state to clear,
   * both produce an honest sentence and no write. Reporting those as applied is
   * the bug the wet-clause card shipped with, and it is not shipping again.
   */
  readonly wrote: boolean;
}

/**
 * Resolve one object clause against the item the GM named.
 *
 * Returns the sentences the card is built from, so the caller decides how to
 * announce it — the same split every other action in this system uses.
 */
async function resolveObjectClause(
  actor: FoundryActor,
  item: FoundryItem,
  clause: ObjectClause,
): Promise<ObjectOutcome> {
  const lines: string[] = [];
  let wrote = false;

  if (clause.decay > 0) {
    // Through the choke point, so Super Mutant Bulky (pg 12) and the decay cap
    // both reach this without the object row having heard of either.
    const report = await decayItem(actor, item, clause.decay);
    if (report === null || report.gained <= 0) {
      lines.push(game.i18n.localize("FALLOUT.Targeted.objectAlreadyWrecked", { item: item.name }));
    } else {
      wrote = true;
      lines.push(
        game.i18n.localize("FALLOUT.Targeted.objectDecayed", {
          item: item.name,
          levels: report.gained,
          decay: report.decay,
        }) + bulkyNote(report),
      );
    }
  }

  if (clause.feet !== null || clause.formula !== null) {
    let feet = clause.feet ?? 0;
    if (clause.formula !== null) {
      const roll = new foundry.dice.Roll(clause.formula);
      await roll.evaluate();
      feet = roll.total;
      await roll.toMessage({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        flavor: game.i18n.localize("FALLOUT.Targeted.objectFlungRoll", { item: item.name }),
      });
    }
    // "The object flies one foot away" is what the table prints, and "flies 1
    // feet away" is not.
    lines.push(
      feet === 1
        ? game.i18n.localize("FALLOUT.Targeted.objectFlungFoot", { item: item.name })
        : game.i18n.localize("FALLOUT.Targeted.objectFlung", { item: item.name, feet }),
    );

    // Unequipping is the write that makes "flies away" mean something on the
    // sheet, and it is reversible in one click. Where the item has no equip
    // state there is no held-ness to end, and saying so is better than a silent
    // no-op.
    if (clause.unequip) {
      const system = item.system as { equipped?: unknown };
      if (!tracksEquipped(item)) {
        lines.push(game.i18n.localize("FALLOUT.Targeted.objectNotHeld", { item: item.name }));
      } else if (system.equipped === true) {
        await item.update({ "system.equipped": false });
        wrote = true;
      }
      // Already unequipped: the object still flies, and the card still says so.
      // There is simply nothing left to write, and writing `false` over `false`
      // to be able to claim a write would be the dishonesty this guards.
    }
  }

  return { lines, wrote };
}

/**
 * Apply one face of one row's condition to a target.
 *
 * `row` is the pg 129 row the limb *resolves on* (`limbRowKey`), not the limb
 * key: a jet engine and a set of rollers borrow the leg row's conditions, and
 * the card that offers this button already carries the resolved row for exactly
 * that reason.
 */
export async function applyTargetedCondition(
  target: FoundryActor,
  row: PrintedLimbKey,
  index: number,
  pickObject?: ObjectPicker,
): Promise<TargetedConditionReport | null> {
  const condition = targetedCondition(row, index);
  if (condition === null) return null;

  const report = (
    applied: boolean,
    reason: "blank" | "manual" | "noItem" | null,
    effectId: string | null,
    toggled: readonly string[],
  ): TargetedConditionReport => ({ row, index: condition.index, applied, reason, effectId, toggled });

  if (!isApplicable(condition)) {
    // Named rather than silent: a button that appears to work and writes
    // nothing is worse than one that says which of the book's two kinds of
    // nothing this is.
    ui.notifications.info(
      game.i18n.localize(
        condition.blank
          ? "FALLOUT.Targeted.applyBlank"
          : "FALLOUT.Targeted.applyManual",
        { name: target.name },
      ),
    );
    return report(false, condition.blank ? "blank" : "manual", null, []);
  }

  // The object row, which needs a fact no roll carries: which of the target's
  // things was hit. Handled before anything is written, so a cancelled prompt
  // leaves the target exactly as it found them.
  if (needsItem(condition)) {
    const clause = condition.object;
    if (clause === null || pickObject === undefined) {
      // No way to ask. Report the condition rather than pick something.
      ui.notifications.info(
        game.i18n.localize("FALLOUT.Targeted.applyManual", { name: target.name }),
      );
      return report(false, "manual", null, []);
    }

    const resolution = await pickObject(target, condition);
    // Cancelled, or nothing carried worth hitting. Silent: the GM either
    // dismissed the prompt themselves or was already told by it.
    if (resolution === null) return report(false, "noItem", null, []);

    const resolved = clause.choose
      ? chosenObjectClause(resolution.index ?? 0)
      : clause;
    if (resolved === null) {
      ui.notifications.warn(game.i18n.localize("FALLOUT.Targeted.objectNoChoice"));
      return report(false, "noItem", null, []);
    }

    const outcome = await resolveObjectClause(target, resolution.item, resolved);
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: target }),
      content: [
        game.i18n.localize("FALLOUT.Targeted.objectApplied", {
          name: target.name,
          item: resolution.item.name,
        }),
        ...outcome.lines,
      ].join("<br/>"),
    });
    // The card posts either way — the GM asked for the condition and it was
    // resolved — but `applied` tracks the write, not the announcement.
    return report(outcome.wrote, outcome.wrote ? null : "manual", null, []);
  }

  // Prone first: it is a toggle and not part of the effect, so a failure to
  // create the effect must not leave a creature standing that the book put on
  // the floor. `toggleStatusEffect` is idempotent with `active: true`.
  const toggled: string[] = [];
  for (const status of condition.toggles) {
    await target.toggleStatusEffect(status, { active: true });
    toggled.push(status);
  }

  let effectId: string | null = null;
  if (needsEffect(condition)) {
    const record: TargetedConditionRecord = {
      row,
      index: condition.index,
      untilFullHeal: condition.duration.untilFullHeal,
      untilTreated: condition.duration.untilTreated,
    };
    const duration = durationFor(condition);
    const [created] = (await target.createEmbeddedDocuments("ActiveEffect", [
      {
        name: game.i18n.localize("FALLOUT.Targeted.effectName", {
          limb: game.i18n.localize(`FALLOUT.Targeted.limbs.${row}.label`),
        }),
        img: iconFor(condition),
        type: "base",
        description: game.i18n.localize(
          `FALLOUT.Targeted.limbs.${row}.c${String(condition.index)}`,
        ),
        ...(duration === null ? {} : { duration }),
        // v14 keeps changes under `system.changes`; the statuses set here is
        // what folds into `actor.statuses` and lights the token HUD.
        system: { changes: condition.changes },
        statuses: condition.statuses,
        flags: { [SYSTEM_ID]: { [FLAG_KEY]: record } },
      },
    ])) as (FoundryActiveEffect | undefined)[];
    // A create vetoed by a `preCreateActiveEffect` hook — another module, a
    // permission — comes back empty rather than throwing. The condition is then
    // simply not carried, and the report says so instead of asserting an id.
    effectId = created?.id ?? null;
  }

  // Applied means something actually landed. An entry that needs an effect and
  // did not get one wrote nothing, and must not be reported — or announced — as
  // though it had: the wet clause's card, which said "2 → 4" whether or not the
  // write survived, is the exact shape of bug this avoids.
  if (needsEffect(condition) && effectId === null) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Targeted.applyVetoed", { name: target.name }),
    );
    return report(false, null, null, toggled);
  }

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: target }),
    content: game.i18n.localize("FALLOUT.Targeted.applied", {
      name: target.name,
      limb: game.i18n.localize(`FALLOUT.Targeted.limbs.${row}.label`),
      condition: game.i18n.localize(
        `FALLOUT.Targeted.limbs.${row}.c${String(condition.index)}`,
      ),
    }),
  });

  return report(true, null, effectId, toggled);
}

/** Every limb condition this actor is carrying, newest last. */
export function limbConditions(actor: FoundryActor): TargetedConditionRecord[] {
  const out: TargetedConditionRecord[] = [];
  for (const effect of actor.effects) {
    const flag = effect.getFlag(SYSTEM_ID, FLAG_KEY);
    if (isRecord(flag)) out.push(flag);
  }
  return out;
}

/** Remove the limb conditions whose record matches, and report how many went. */
async function clearWhere(
  actor: FoundryActor,
  match: (record: TargetedConditionRecord) => boolean,
): Promise<number> {
  const ids: string[] = [];
  for (const effect of actor.effects) {
    const flag = effect.getFlag(SYSTEM_ID, FLAG_KEY);
    if (isRecord(flag) && match(flag)) ids.push(effect.id);
  }
  return clearMarkers(actor, ids);
}

/**
 * *"…or until all hit points are healed"* (pg 129).
 *
 * Called with the hit points a restoration landed on, for the same reason
 * `fullHealShortCircuit` is: the clause is about the state reached, not the
 * size of the heal, so a single point that tops a creature off clears it.
 */
export async function fullHealLimbConditions(
  actor: FoundryActor,
  hp: number,
  hpMax: number,
): Promise<number> {
  if (hpMax <= 0 || hp < hpMax) return 0;
  const cleared = await clearWhere(actor, (record) => record.untilFullHeal);
  if (cleared > 0) {
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: game.i18n.localize("FALLOUT.Targeted.clearedByHeal", { count: cleared }),
    });
  }
  return cleared;
}

/**
 * Set Bone (pg 86): *"Spend 10 minutes and a creature with the Broken Arm or
 * Broken Leg condition may remove it."*
 *
 * Broken Arm is the arm row's fourth condition and is now a real marker, so
 * this removes it. **Broken Leg still is not a thing**: the phrase appears on pg
 * 86 and nowhere else in the book, and the leg row's fourth condition is Leg
 * Cripple, which is not the same condition under another name — it is removed by
 * a full heal, which is a trigger the Set Bone paragraph does not mention. So
 * this clears what the book defines and leaves the undefined half where
 * `first-aid.ts` has always left it: with the table.
 */
export async function treatLimbConditions(actor: FoundryActor): Promise<number> {
  return clearWhere(actor, (record) => record.untilTreated);
}

/**
 * The full-heal trigger.
 *
 * Guarded by `isPrimaryGM` for the reason every document hook in this system is:
 * every GM client sees the update and only one may act on it. Registered
 * separately from Short Circuit's identical-shaped hook rather than folded into
 * it, because the two clear unrelated things and a shared hook would have to
 * import both modules to do it.
 */
export function registerTargetedConditionHooks(): void {
  Hooks.on("updateActor", (...args: unknown[]) => {
    if (!isPrimaryGM()) return;
    const [actor, changes] = args as [FoundryActor, Record<string, unknown>];
    const touchedHp =
      (changes.system as { resources?: { hp?: { value?: unknown } } } | undefined)?.resources?.hp
        ?.value !== undefined;
    if (!touchedHp) return;
    const system = actor.system as CharacterData;
    void fullHealLimbConditions(actor, system.resources.hp.value, system.derived.hpMax);
  });
}
