/**
 * The one place decay is *gained* (pg 92-93, pg 12).
 *
 * Decay was written from four separate call sites before this existed — a
 * critical failure on an attack (`dice/rolls.ts`), the sheet's own decay button
 * (`sheets/character-sheet.ts`), armor soaking a hit, and a Corrosive weapon
 * eating the target's armor (both in `combat/damage.ts`). That was survivable
 * while every one of them did the same arithmetic, and stopped being survivable
 * with Super Mutant Bulky (pg 12), which adds a level to every one of them:
 * wiring a rule like that into three sites out of four is worse than not wiring
 * it at all, because the resulting sheet is wrong in a way nobody can see.
 *
 * So this is the choke point, in the same spirit as `restoreHitPoints` in
 * `./healing` — which is where the radiation lock and the bleeding redirect
 * ended up for exactly the same reason.
 *
 * Repair is deliberately **not** routed through here. Bulky triggers on decay
 * being *gained*, and repair reduces it; `src/actions/repair.ts` writes
 * `system.decay` directly and should keep doing so.
 */

import type { CharacterData } from "../data/character";
import { DECAY_MAX } from "../rules/constants";
import { decaysExtra } from "../rules/races";

/** What a decay gain actually did, once the race and the cap had their say. */
export interface DecayReport {
  /** The level the item ended at. */
  decay: number;
  /** How many levels it actually gained, after clamping. */
  gained: number;
  /** How many of those came from Bulky (pg 12). */
  extra: number;
  /** True when the cap swallowed part of the gain. */
  capped: boolean;
}

interface DecayableSystem {
  decay: number;
  decayMax?: number;
  isPowerArmor?: boolean;
}

/**
 * The cap an item decays up to.
 *
 * Power Armor keeps working past the ordinary cap — it just stops granting
 * Defense Points (pg 57) — so it carries its own `decayMax`. Everything else
 * uses the pg 92 maximum.
 */
function decayCeiling(system: DecayableSystem): number {
  return system.decayMax && system.decayMax > 0 ? system.decayMax : DECAY_MAX;
}

/**
 * Whether Bulky reaches this item (pg 12): "whenever your **weapons or armor**
 * would gain a level of decay". Nothing else on the sheet is covered, however
 * decayable it happens to be.
 */
function bulkyApplies(item: FoundryItem): boolean {
  return item.type === "weapon" || item.type === "armor";
}

/**
 * How many *extra* levels the wearer's race adds to a decay gain — 1 for a
 * Super Mutant's weapons and armor (pg 12), 0 for everyone and everything else.
 *
 * Split out of `decayItem` so the one call site that cannot use the writing gate
 * can still share the rule. `combat/damage.ts` folds a Power Armor suit's decay
 * into the same `update()` that writes its Defense Point pool, so calling
 * `decayItem` there would issue a second, conflicting write to the same
 * document. It calls this instead and adds the result to its own arithmetic —
 * which keeps Bulky defined in exactly one place, the whole point of this
 * module.
 */
export function extraDecayLevels(actor: FoundryActor, item: FoundryItem): number {
  const race = (actor.system as CharacterData).details.race;
  return decaysExtra(race) && bulkyApplies(item) ? 1 : 0;
}

/**
 * Add levels of decay to an item, applying Bulky and clamping at the cap.
 *
 * `levels` is what the triggering rule says to add, before the race is
 * consulted — pass 1 for an ordinary critical failure. Returns null when there
 * was nothing to do, so a caller can skip its chat card.
 */
export async function decayItem(
  actor: FoundryActor,
  item: FoundryItem,
  levels = 1,
): Promise<DecayReport | null> {
  if (levels <= 0) return null;
  const system = item.system as DecayableSystem;

  // Bulky adds one level per gain event, not one per level gained: the rule
  // says "whenever your weapons or armor *would gain a level of decay, they
  // gain an additional one*" — singular, and triggered by the event. A
  // two-level gain therefore becomes three, not four.
  const extra = extraDecayLevels(actor, item);
  const ceiling = decayCeiling(system);
  const wanted = levels + extra;
  const decay = Math.min(ceiling, system.decay + wanted);
  const gained = decay - system.decay;
  if (gained <= 0) {
    // Already at the cap. Nothing to write, and nothing to announce.
    return { decay: system.decay, gained: 0, extra: 0, capped: true };
  }

  await item.update({ "system.decay": decay });
  return {
    decay,
    gained,
    // Only claim the Bulky level if the cap did not eat it.
    extra: Math.min(extra, gained),
    capped: gained < wanted,
  };
}

/**
 * The note a card should carry when Bulky added a level, or the empty string.
 *
 * Separated from the write so the four call sites can each place it in their own
 * flavor text, which they all build differently.
 */
export function bulkyNote(report: DecayReport | null): string {
  if (report === null || report.extra <= 0) return "";
  return ` ${game.i18n.localize("FALLOUT.Decay.bulky", { levels: report.decay })}`;
}
