/**
 * Short Circuit (pg 135) — the three clauses that are not the per-turn tick.
 *
 * The tick itself lives in `src/combat/turns.ts` beside Bleeding's, because that
 * is where every start-of-turn clause in this system lives. What is here is the
 * rest of the printed entry:
 *
 * > If you become **wet** while you have levels of short circuit, you gain
 * > double the levels. You remove all levels of short circuit if you start
 * > dying or are **healed to full hit points**. You can also spend **6 AP** on
 * > your turn to re-route and reset your circuit, when you do you remove one
 * > level of short circuit.
 *
 * "You start dying" is handled at the tick, since that is where a creature most
 * often reaches 0 hit points while shorting out. The other three each fire from
 * the one place that can see their trigger: a `preUpdateActor` hook for wet
 * (which folds the doubling into the same write, so it cannot race the sheet
 * submit that caused it), an `updateActor` hook for the full-heal, and a button
 * in the conditions block for the re-route.
 *
 * Every one of them is a **report**, not an enforcement: the AP is named and
 * never deducted (backlog E1), and none of them refuses.
 */

import type { CharacterData } from "../data/character";
import { apLine } from "../combat/action-points";
import {
  SHORT_CIRCUIT_REROUTE_AP,
  SHORT_CIRCUIT_WET_MULTIPLIER,
} from "../rules/constants";
import { isPrimaryGM } from "../combat/turns";

/** Levels of Short Circuit this creature is carrying. */
export function shortCircuitLevels(actor: FoundryActor): number {
  return Math.max(0, (actor.system as CharacterData).conditions.shortCircuit);
}

export interface ShortCircuitChange {
  readonly before: number;
  readonly after: number;
}

/**
 * *"You can also spend 6 AP on your turn to re-route and reset your circuit,
 * when you do you remove one level of short circuit."*
 *
 * One level, not all of them — "reset your circuit" is the flavour of the
 * action and "remove one level" is its effect, and reading the first as
 * overriding the second would make the 6 AP strictly better than the full-heal
 * clause the same paragraph prints as the way to be rid of it.
 */
export async function rerouteShortCircuit(
  actor: FoundryActor,
): Promise<ShortCircuitChange | null> {
  const before = shortCircuitLevels(actor);
  if (before <= 0) {
    ui.notifications.info(
      game.i18n.localize("FALLOUT.ShortCircuit.none", { name: actor.name }),
    );
    return null;
  }
  const after = before - 1;
  await actor.update({ "system.conditions.shortCircuit": after });
  await say(
    actor,
    [
      game.i18n.localize("FALLOUT.ShortCircuit.rerouted", {
        ap: SHORT_CIRCUIT_REROUTE_AP,
        levels: after,
      }),
      ...(await apLine(actor, SHORT_CIRCUIT_REROUTE_AP)),
    ].join(" "),
  );
  return { before, after };
}

/**
 * *"If you become wet while you have levels of short circuit, you gain double
 * the levels."*
 *
 * **Ruling: it fires on the transition into wet, not on being wet.** The
 * sentence says *become*, and a clause that doubled every time the flag was
 * re-asserted would multiply a creature standing in the rain out of existence
 * over four rounds. So this takes what the flag was and what it is now, and
 * does nothing unless it went from dry to wet.
 *
 * **Pure, and it writes nothing.** It shipped once as an `async` function that
 * called `actor.update` and was invoked, unawaited, from the character sheet's
 * `_prepareSubmitData` — which raced the submit that triggered it. Both writes
 * carried `system.conditions.shortCircuit` (the level input and the wet
 * checkbox are on the same form), so depending on which landed last the
 * doubling either applied or was silently overwritten by the stale value the
 * form had rendered — while the chat card announced it unconditionally either
 * way. The caller now folds the new level into the *same* update, which is one
 * atomic write and cannot race anything; see `registerShortCircuitHooks`.
 *
 * Returns null when there is nothing to double, so a caller can ask on every
 * flag write without checking first.
 */
export function wetShortCircuit(
  actor: FoundryActor,
  wasWet: boolean,
  isWet: boolean,
): ShortCircuitChange | null {
  if (wasWet || !isWet) return null;
  const before = shortCircuitLevels(actor);
  if (before <= 0) return null;
  return { before, after: before * SHORT_CIRCUIT_WET_MULTIPLIER };
}

/**
 * *"You remove all levels of short circuit if you … are healed to full hit
 * points."*
 *
 * Called after a restoration has landed, with the hit points it landed on.
 * Reads the total rather than the amount healed, because the clause is about
 * the state reached and not about the size of the heal — a single point that
 * tops a creature off clears the whole condition, which is what the sentence
 * says and is the same shape as the dying trigger at the other end.
 */
export async function fullHealShortCircuit(
  actor: FoundryActor,
  hp: number,
  hpMax: number,
): Promise<ShortCircuitChange | null> {
  if (hpMax <= 0 || hp < hpMax) return null;
  const before = shortCircuitLevels(actor);
  if (before <= 0) return null;
  await actor.update({ "system.conditions.shortCircuit": 0 });
  await say(actor, game.i18n.localize("FALLOUT.ShortCircuit.healed", { levels: before }));
  return { before, after: 0 };
}

async function say(actor: FoundryActor, content: string): Promise<void> {
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content,
  });
}

/**
 * The `updateActor` hook that fires the full-heal clause.
 *
 * A hook rather than a call at each restoration site, because there are five of
 * those (`turns.ts`, `rest.ts`, `use-aid.ts`, and two in `first-aid.ts`) and a
 * sixth would silently not clear the condition. `restoreHitPoints` itself is
 * pure — it computes a gain and writes nothing — so there is no single function
 * to hang this on; the write is the only common point, and this watches it.
 *
 * Guarded by `isPrimaryGM` for the same reason the turn hooks are: every GM
 * client sees the update, and only one may act on it.
 */
export function registerShortCircuitHooks(): void {
  // The wet clause, folded into the update that triggers it.
  //
  // `preUpdateActor` is the one place where the document still holds the *old*
  // value while `changes` carries the new one, so the dry→wet transition is
  // visible without stashing anything — and mutating `changes` here means the
  // doubled level rides along in the same write. That matters more than it
  // sounds: the wet checkbox and the Short Circuit level input are on the same
  // sheet form, so a separate `actor.update` would race the submit, and the
  // loser would be silently overwritten by whichever value the form had
  // rendered. One write cannot race itself.
  //
  // It also catches a wet flag set from anywhere else — the weather and hazard
  // code, a macro, another module — where the sheet-submit version only ever
  // saw a checkbox toggled by hand.
  Hooks.on("preUpdateActor", (...args: unknown[]) => {
    const [actor, changes] = args as [FoundryActor, Record<string, unknown>];
    const nextWet = (
      changes.system as { environment?: { exposedWet?: unknown } } | undefined
    )?.environment?.exposedWet;
    if (typeof nextWet !== "boolean") return;
    const wasWet = (actor.system as CharacterData).environment.exposedWet;
    const change = wetShortCircuit(actor, wasWet, nextWet);
    if (change === null) return;
    // Written into the incoming update rather than beside it. This deliberately
    // overrides the level the form rendered, which is the stale one by
    // definition — the player is toggling the checkbox, not editing the number.
    const system = (changes.system ?? {}) as Record<string, unknown>;
    const conditions = (system.conditions ?? {}) as Record<string, unknown>;
    conditions.shortCircuit = change.after;
    system.conditions = conditions;
    changes.system = system;
    // The card is a consequence of the write, not part of it.
    void say(
      actor,
      game.i18n.localize("FALLOUT.ShortCircuit.wet", {
        before: change.before,
        after: change.after,
      }),
    );
  });

  Hooks.on("updateActor", (...args: unknown[]) => {
    if (!isPrimaryGM()) return;
    const [actor, changes] = args as [FoundryActor, Record<string, unknown>];
    // Only when the update actually touched hit points — otherwise every field
    // written on a full-health robot would re-run this.
    const touchedHp =
      (changes.system as { resources?: { hp?: { value?: unknown } } } | undefined)?.resources?.hp
        ?.value !== undefined;
    if (!touchedHp) return;
    const system = actor.system as CharacterData;
    void fullHealShortCircuit(actor, system.resources.hp.value, system.derived.hpMax);
  });
}
