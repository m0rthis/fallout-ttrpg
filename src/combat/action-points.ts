/**
 * Action Points, tracked but never enforced (backlog E1, the half-step).
 *
 * ## What changed, and what deliberately did not
 *
 * Every AP-costing action in this system has always *reported* its price on a
 * chat card and left the pool alone. The pool itself was never the missing
 * piece — `combat/turns.ts` has always refilled it at the start of a turn,
 * banked half of what went unused at the end (pg 126), and blocked that carry
 * for a Dazed creature (pg 133). Nothing ever subtracted from it, so the number
 * on the sheet was the maximum, always, and `endTurn`'s Power Armor overheat
 * check — which reads what left the pool between `turnStart` and now (pg 58) —
 * measured zero forever.
 *
 * So actions now spend. What they still never do is **refuse**: this is the
 * half-step the project chose over full E1, and the distinction is the whole
 * design.
 *
 * - `spendActionPoints` (in `./turns`) refuses when the pool is short. It has
 *   no callers and keeps none — it is what full E1 would use.
 * - `noteActionPoints`, here, spends what the pool has, says so, and lets the
 *   action proceed regardless. A GM who wants the action to happen gets the
 *   action; a table that wants the budget enforced can read the card.
 *
 * ## Three rulings
 *
 * **Out of combat, nothing is tracked.** AP is refilled by a turn beginning,
 * and outside initiative no turn ever begins — a pool drained by an out-of-
 * combat first aid check would sit at zero until the next fight and look like a
 * bug, because it would be one. `actor.inCombat` is the gate (probed on 14.365:
 * a plain boolean, true only for the *active* encounter). Out of combat the
 * card still prints the price, which is exactly what it printed before.
 *
 * **A short pool does not stop anything.** It spends down to zero and the card
 * says by how much the action overdrew. Refusing here would be full E1 wearing
 * this function's name, and would make every action in the system fail closed
 * on a number nobody has been maintaining until today.
 *
 * **The pool is the GM's to overwrite.** It is an ordinary editable field on
 * the sheet and stays one; nothing here locks it, and a GM correcting it by
 * hand mid-turn is a supported way to use this.
 */

import type { CharacterData } from "../data/character";

export interface ActionPointNote {
  /** What the action asked for. */
  readonly cost: number;
  /** What actually left the pool — less than `cost` only when it ran out. */
  readonly spent: number;
  /** What is left afterwards. */
  readonly remaining: number;
  /** The pool could not cover the cost. The action happened anyway. */
  readonly short: boolean;
  /** False out of combat, where there is no pool worth draining. */
  readonly tracked: boolean;
  /** The sentence for the action's card. */
  readonly line: string;
}

/**
 * Charge an action's Action Points against the pool, and hand back the sentence
 * the card should carry.
 *
 * Returns null for a free action, so a caller can drop the line entirely rather
 * than print "spends 0 AP".
 */
export async function noteActionPoints(
  actor: FoundryActor,
  cost: number,
): Promise<ActionPointNote | null> {
  if (!Number.isFinite(cost) || cost <= 0) return null;

  const system = actor.system as CharacterData;
  const before = system.resources.ap.value;

  // Out of combat: report the price the way this system always has, and write
  // nothing. There is no turn to refill what would be taken.
  if (!actor.inCombat) {
    return {
      cost,
      spent: 0,
      remaining: before,
      short: false,
      tracked: false,
      line: game.i18n.localize("FALLOUT.ActionPoints.untracked", { cost }),
    };
  }

  const spent = Math.min(cost, Math.max(0, before));
  const remaining = Math.max(0, before - cost);
  const short = cost > spent;
  await actor.update({ "system.resources.ap.value": remaining });

  return {
    cost,
    spent,
    remaining,
    short,
    tracked: true,
    line: short
      ? game.i18n.localize("FALLOUT.ActionPoints.overdrawn", {
          cost,
          spent,
          over: cost - spent,
        })
      : game.i18n.localize("FALLOUT.ActionPoints.spent", { cost, remaining }),
  };
}

/**
 * The same charge, as a spreadable line array.
 *
 * For the cards assembled as one array literal, where `[...(await apLine(...))]`
 * keeps the charge where the price is printed instead of splitting the card
 * across two statements.
 */
export async function apLine(actor: FoundryActor, cost: number): Promise<string[]> {
  const note = await noteActionPoints(actor, cost);
  return note === null ? [] : [note.line];
}

/**
 * The same charge, for the callers that build their card from a line array.
 *
 * Saves every one of them writing the same two-line null check, which is the
 * kind of duplication that ends with one of them quietly not spending.
 */
export async function pushActionPoints(
  actor: FoundryActor,
  cost: number,
  lines: string[],
): Promise<ActionPointNote | null> {
  const note = await noteActionPoints(actor, cost);
  if (note !== null) lines.push(note.line);
  return note;
}
