/**
 * Situational effects — the second half of what "conditional effects" meant.
 *
 * The advantage audit (`packs-src/V21-NOTES-advantage.md`) found that perk text
 * fails the always-on model two different ways, and only one of them needed new
 * machinery:
 *
 * - **Scope** — "advantage on any Radiation checks", "on all Death Saves". Real
 *   and unconditional, just aimed at a roll the category model could not name.
 *   Solved outright by the scopes in `src/rules/effects.ts`; nothing here.
 * - **Condition** — "while in an irradiated zone", "while in a settlement",
 *   "so long as you haven't taken damage". This file.
 *
 * ## Why this is a button and not a hook
 *
 * A conditional grant has to stop applying when its condition goes false. The
 * tempting implementations both fail:
 *
 * - Re-deciding inside `prepareDerivedData` cannot work, because effects write
 *   into `system.bonuses` during the *initial* phase, before the derived pass
 *   runs. By the time the condition could be evaluated, the number is already
 *   in. There is no per-source record left to subtract.
 * - Toggling `disabled` from a document hook does work mechanically, but it
 *   writes documents in response to document writes — the exact shape that
 *   produced this project's one production bug, where a clock-driven sweep
 *   raced Foundry's own expiry update (see docs/foundry-v14-notes.md).
 *
 * So a situational effect is an ordinary, **disabled** Active Effect that names
 * its condition in a flag. The sheet shows it, says whether its situation
 * currently holds, and `syncSituations` flips them all to match — on a button,
 * pressed by a person, exactly like the weather tick. Nothing writes documents
 * behind anyone's back, and a GM who wants to overrule a condition just leaves
 * the effect the way they set it.
 */

import type { CharacterData } from "../data/character";
import {
  type EffectCondition,
  EFFECT_CONDITIONS,
  SYSTEM_ID,
} from "../rules/effects";

interface ConditionalEffect {
  readonly id: string;
  readonly name: string;
  readonly disabled: boolean;
  getFlag(scope: string, key: string): unknown;
}

function isEffectCondition(value: unknown): value is EffectCondition {
  return typeof value === "string" && (EFFECT_CONDITIONS as readonly string[]).includes(value);
}

/** The condition an effect waits on, or null if it is unconditional. */
export function effectCondition(effect: ConditionalEffect): EffectCondition | null {
  const flag = effect.getFlag(SYSTEM_ID, "condition");
  return isEffectCondition(flag) ? flag : null;
}

/**
 * Whether the effect applies while its condition does **not** hold.
 *
 * Hoarder (pg 32) is the reason this exists, and it is the namesake of the very
 * condition it inverts: `carryingHeavy` reads "while carrying at least 50 load",
 * but the trait's disadvantage bites "while you're **not** carrying at least
 * 50 load". Without negation the only rule the condition was built for would
 * apply in exactly the wrong half of the cases — which is worse than not
 * applying at all, because the sheet would look right while being backwards.
 */
export function effectConditionNegated(effect: ConditionalEffect): boolean {
  return effect.getFlag(SYSTEM_ID, "conditionNegated") === true;
}

export interface SituationalEffect {
  id: string;
  name: string;
  condition: EffectCondition;
  /** Whether the effect applies while the condition does *not* hold (pg 32's Hoarder). */
  negated: boolean;
  /** Whether the effect is currently applying its changes. */
  active: boolean;
  /** Whether the situation it waits on holds right now. */
  holds: boolean;
  /** Where the item's name came from, for the sheet. */
  source: string;
  /**
   * The document that actually owns the effect. A perk ships its effect on the
   * *item* with `transfer: true`, so it appears among the actor's applicable
   * effects but is embedded in the item — updating it through the actor would
   * fail on an id the actor's collection does not hold.
   */
  owner: FoundryActor | FoundryItem;
}

/** Every effect applying to the actor that names a condition. */
export function situationalEffects(
  actor: FoundryActor,
  system: CharacterData,
): SituationalEffect[] {
  const out: SituationalEffect[] = [];
  const seen = new Set<string>();
  const consider = (effect: FoundryActiveEffect, owner: FoundryActor | FoundryItem, source: string): void => {
    const condition = effectCondition(effect);
    if (!condition || seen.has(effect.id)) return;
    seen.add(effect.id);
    const negated = effectConditionNegated(effect);
    out.push({
      id: effect.id,
      name: effect.name,
      condition,
      negated,
      active: !effect.disabled,
      // What the *effect* waits on, which is the inverse of the situation when
      // the entry is negated. Everything downstream — the Sync button, the
      // sheet's readout — compares against this rather than the raw situation,
      // so a negated effect is switched on precisely when its rule says so.
      holds: negated
        ? !system.derived.situations[condition]
        : system.derived.situations[condition],
      source,
      owner,
    });
  };

  for (const effect of actor.effects) consider(effect, actor, actor.name);
  for (const item of actor.items) {
    for (const effect of item.effects) consider(effect, item, item.name);
  }
  return out;
}

/**
 * Bring every situational effect into line with the situations that hold.
 *
 * Returns what changed, so the caller can stay quiet when nothing did.
 */
export async function syncSituations(
  actor: FoundryActor,
  system: CharacterData,
): Promise<{ enabled: string[]; disabled: string[] }> {
  const enabled: string[] = [];
  const disabled: string[] = [];
  // Grouped by owner: an effect embedded in a perk item has to be updated
  // through that item, not through the actor.
  const byOwner = new Map<FoundryActor | FoundryItem, { _id: string; disabled: boolean }[]>();

  for (const entry of situationalEffects(actor, system)) {
    if (entry.holds === entry.active) continue;
    const batch = byOwner.get(entry.owner) ?? [];
    batch.push({ _id: entry.id, disabled: !entry.holds });
    byOwner.set(entry.owner, batch);
    (entry.holds ? enabled : disabled).push(entry.name);
  }
  for (const [owner, updates] of byOwner) {
    await owner.updateEmbeddedDocuments("ActiveEffect", updates);
  }
  const changed = enabled.length + disabled.length;

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content:
      changed === 0
        ? game.i18n.localize("FALLOUT.Situations.noChange")
        : game.i18n.localize("FALLOUT.Situations.synced", {
            on: enabled.join(", ") || "—",
            off: disabled.join(", ") || "—",
          }),
  });
  return { enabled, disabled };
}

/**
 * Declare a situation true or false.
 *
 * Only the situations the sheet cannot see for itself are stored — the derived
 * pass overwrites `carryingHeavy`, `irradiated` and `undamaged` from the
 * character's own numbers, so writing those here would be ignored, and the
 * sheet does not offer them.
 */
export async function setSituation(
  actor: FoundryActor,
  condition: EffectCondition,
  value: boolean,
): Promise<void> {
  await actor.update({ [`system.situations.${condition}`]: value });
}
