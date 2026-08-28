/**
 * Spending junk (BACKLOG D2) — the one place in the system that turns a printed
 * material cost into a document write.
 *
 * Five rules cost materials and, until this module, all five could only *say*
 * so: crafting and repair (pg 92-115), ending Bleeding with "1 cloth junk item"
 * (pg 21, 23), reattaching a robot's limb with "3 steel and 1 circuitry junk"
 * (pg 11), and filling a robot's tank with "six oil junk items" (pg 10). What
 * they all lacked was junk — `packs-src/junk.json` now ships it, `junkType` on
 * `GearData` identifies it, and `consumeJunk` is how a report-site spends it.
 *
 * ## Three rulings, all of them about what happens when the junk is not there
 *
 * The book never contemplates a character who is short of materials — it writes
 * every cost as an imperative ("use 1 cloth junk item") and moves on. So the
 * behaviour under a shortfall is entirely this system's to decide:
 *
 * 1. **It never blocks.** A missing material is reported on the card and the
 *    action proceeds. This is the same call the rest of the actions layer makes
 *    about AP (BACKLOG E1) and about the 5-foot ranges nothing measures: the
 *    system tells the table what the rule costs and lets the table be the
 *    authority on whether it was paid. It is also the only call that is safe to
 *    ship without a migration — a world full of pre-D2 characters owns no junk
 *    at all, and a blocking seam would have broken every one of them.
 * 2. **A line is all-or-nothing.** Wanting three steel with one in the pack
 *    consumes *nothing* and reports three missing, rather than eating the one.
 *    Partial payment buys nothing the rules recognise, and junk destroyed for an
 *    action the table then decides did not happen is a loss the book prescribes
 *    nowhere. (Crafting's own failure tiers do destroy materials — pg 92 — but
 *    that is a *failed check* with printed consequences, which this is not, and
 *    `materialsSpent` in `src/rules/crafting.ts` is what models it.)
 * 3. **Lines are independent.** Two of three materials present spends those two
 *    and reports the third. The alternative — refusing the whole cost unless
 *    every line is affordable — would make a well-stocked crafter's shortfall of
 *    one screw silently free.
 *
 * Layering: this module writes documents, so it belongs in `actions/`. It reads
 * nothing but the actor's own items and imports no rules module, which keeps it
 * usable from every report-site without dragging a cycle behind it.
 */

import { type GearData, JUNK_TYPES, junkTypeKey } from "../data/items";

/** "3 steel", as a caller states it. `type` is matched through `junkTypeKey`. */
export interface JunkWant {
  readonly type: string;
  readonly count: number;
}

/** One material line that was paid in full. */
export interface JunkConsumed {
  readonly type: string;
  readonly count: number;
  /** Names of the stacks it came out of, in the order they were drawn down. */
  readonly from: readonly string[];
}

/** One material line that was not paid at all — see ruling 2 above. */
export interface JunkMissing {
  readonly type: string;
  /** How many the rule asked for. */
  readonly wanted: number;
  /** How many the actor actually holds. Always fewer than `wanted`. */
  readonly held: number;
}

export interface JunkResult {
  readonly consumed: readonly JunkConsumed[];
  readonly missing: readonly JunkMissing[];
  /** Every line was paid — the one thing a caller usually wants to branch on. */
  readonly paid: boolean;
}

/**
 * Every junk stack on `actor` of one material, largest first.
 *
 * Matching is on `junkType`, an explicit field, so nothing is ever consumed
 * because its *name* looked like a material. The one forgiveness: a `gear`
 * document with a blank `junkType` whose name resolves to the key is accepted
 * too, because "Junk: Steel" hand-typed onto a sheet before the compendium was
 * imported is plainly a stack of steel, and `junkTypeKey` strips the prefix.
 * That cannot reach a weapon, an armor or a chem — only `gear`.
 */
export function junkStacks(actor: FoundryActor, type: string): FoundryItem[] {
  const wanted = junkTypeKey(type);
  return (actor.itemTypes.gear ?? [])
    .filter((item) => {
      const system = item.system as GearData;
      const declared = system.junkType.trim();
      return declared.length > 0
        ? junkTypeKey(declared) === wanted
        : junkTypeKey(item.name) === wanted;
    })
    .sort((a, b) => (b.system as GearData).quantity - (a.system as GearData).quantity);
}

/** How many of one material `actor` holds, across every stack of it. */
export function junkHeld(actor: FoundryActor, type: string): number {
  return junkStacks(actor, type).reduce(
    (total, item) => total + Math.max(0, (item.system as GearData).quantity),
    0,
  );
}

/**
 * Spend `wants` out of `actor`'s junk and report what could not be paid.
 *
 * Stacks are drawn down largest-first and a stack emptied by a spend is
 * **deleted**, not left at zero: a compendium-imported material is a countable
 * pile, and an inventory of empty piles is the thing a player then has to tidy
 * by hand. (Aid items are the deliberate counter-example — `useAid` leaves a
 * spent chem at quantity 0 because the *document* carries its addiction and
 * duration text, which junk has none of.)
 *
 * Duplicate lines for the same material are summed before anything is spent, so
 * a caller that asks for steel twice cannot be sold the same stack twice.
 *
 * Never throws and never refuses: an unknown material name, a `wants` entry of
 * zero, and an actor with no junk at all are all just shortfalls.
 */
export async function consumeJunk(
  actor: FoundryActor,
  wants: readonly JunkWant[],
): Promise<JunkResult> {
  const totals = new Map<string, number>();
  for (const want of wants) {
    if (!Number.isFinite(want.count) || want.count <= 0) continue;
    const key = junkTypeKey(want.type);
    totals.set(key, (totals.get(key) ?? 0) + Math.ceil(want.count));
  }

  const consumed: JunkConsumed[] = [];
  const missing: JunkMissing[] = [];
  const updates: { _id: string; "system.quantity": number }[] = [];
  const deletions: string[] = [];

  for (const [type, count] of totals) {
    const stacks = junkStacks(actor, type);
    const held = stacks.reduce(
      (total, item) => total + Math.max(0, (item.system as GearData).quantity),
      0,
    );
    if (held < count) {
      missing.push({ type, wanted: count, held });
      continue;
    }
    let owed = count;
    const from: string[] = [];
    for (const item of stacks) {
      if (owed <= 0) break;
      const have = Math.max(0, (item.system as GearData).quantity);
      if (have <= 0) continue;
      const taken = Math.min(have, owed);
      owed -= taken;
      from.push(item.name);
      if (have - taken <= 0) deletions.push(item.id);
      else updates.push({ _id: item.id, "system.quantity": have - taken });
    }
    consumed.push({ type, count, from });
  }

  // One write per kind, after every line has been costed — so a shortfall on the
  // third material cannot leave the first two half-spent by an early return.
  if (updates.length > 0) await actor.updateEmbeddedDocuments("Item", updates);
  if (deletions.length > 0) await actor.deleteEmbeddedDocuments("Item", deletions);

  return { consumed, missing, paid: missing.length === 0 };
}

/**
 * The junk half of a report card: what was spent, what was not, and the standing
 * reminder that the second half is the table's problem.
 *
 * Returns an empty array when nothing was asked for, so a call site can splice
 * it into its lines unconditionally.
 */
export function junkLines(result: JunkResult): string[] {
  const lines: string[] = [];
  if (result.consumed.length > 0) {
    lines.push(
      game.i18n.localize("FALLOUT.Junk.consumed", {
        materials: result.consumed
          .map((entry) => `x${String(entry.count)} ${entry.type}`)
          .join(", "),
      }),
    );
  }
  if (result.missing.length > 0) {
    lines.push(
      game.i18n.localize("FALLOUT.Junk.missing", {
        materials: result.missing
          .map((entry) =>
            game.i18n.localize("FALLOUT.Junk.missingEntry", {
              wanted: entry.wanted,
              type: entry.type,
              held: entry.held,
            }),
          )
          .join(", "),
      }),
    );
  }
  return lines;
}

// ===========================================================================
// Recipes — the crafting and repair tables' material cells
// ===========================================================================

/** What a recipe's material lines could and could not be paid with. */
export interface RecipeSpend {
  /** The lines that were actually spent, or an empty result when none were. */
  readonly result: JunkResult;
  /**
   * Lines naming something this system ships no document for — a ski, a bear
   * skull, a plastic car bumper. Not a shortfall: nothing was ever stocked.
   */
  readonly unstocked: readonly string[];
  /** Lines the parser could not count ("a sharp edge", "wood, plastic, or bone"). */
  readonly uncountable: readonly string[];
  /** True when the cell prints an "or" and therefore nothing was spent at all. */
  readonly deferred: boolean;
}

/**
 * Spend a recipe's materials, on the terms the two tables actually allow.
 *
 * `craftItem` and `repairItem` have always *computed* their material cost —
 * `materialsSpent` resolves the failure tiers and the succeed-by-8 discount
 * exactly — and always reported it, because nothing was a document. Junk is a
 * document now, and this is the seam that spends it. Three rulings, because the
 * Encyclopedia's cells are prose and one of them is genuinely ambiguous:
 *
 * **1. A cell printing "or" spends nothing.** `parseMaterials` splits on `or`,
 * so *"x10 cloth or x1 large animal fur"* arrives here as two countable lines.
 * Spending both charges the player twice for a choice the book offered them
 * once, and spending the first silently picks a branch on their behalf — the
 * one thing this system has consistently refused to do. So an alternatives cell
 * is reported in full and consumed not at all, and the card says the pick is the
 * table's. The existing `FALLOUT.Crafting.alternatives` line already prints the
 * cell verbatim, so the player has the text in front of them.
 *
 * **2. "Crafting material" is spent literally, never substituted.** 284 cells
 * name the book's own generic, and `Junk: Crafting Material` ships as a document
 * precisely so those recipes are payable. A table that reads the generic as "any
 * junk" is making a house ruling, and this system does not make it for them by
 * quietly draining their steel.
 *
 * **3. A material with no document is reported apart from a shortfall.** Roughly
 * forty lines name a specific found object rather than a stocked material. Those
 * are *correctly* unpayable — no document was ever shipped, by design — and
 * folding them in with "you are three steel short" would make a working recipe
 * look broken every single time it ran. They are separated on `JUNK_TYPES`,
 * which is the censused vocabulary of what this system does stock.
 *
 * Never blocks, on the same terms as every other spend: the craft or the repair
 * has already resolved by the time this is called, and a missing material is
 * something the table settles, not something that voids a roll already made.
 */
export async function spendRecipeMaterials(
  actor: FoundryActor,
  lines: readonly { readonly name: string; readonly spent: number | null }[],
  hasAlternatives: boolean,
): Promise<RecipeSpend> {
  const empty: JunkResult = { consumed: [], missing: [], paid: true };
  const uncountable = lines.filter((line) => line.spent === null).map((line) => line.name);
  const countable = lines.filter(
    (line): line is { name: string; spent: number } => line.spent !== null && line.spent > 0,
  );
  const stockedKeys = new Set<string>(JUNK_TYPES);
  const unstocked = countable
    .filter((line) => !stockedKeys.has(junkTypeKey(line.name)))
    .map((line) => line.name);

  if (hasAlternatives) {
    return { result: empty, unstocked, uncountable, deferred: true };
  }

  const wants = countable
    .filter((line) => stockedKeys.has(junkTypeKey(line.name)))
    .map((line) => ({ type: line.name, count: line.spent }));
  const result = wants.length > 0 ? await consumeJunk(actor, wants) : empty;
  return { result, unstocked, uncountable, deferred: false };
}

/** The recipe half of a card: what `junkLines` says, plus the two apart-cases. */
export function recipeLines(spend: RecipeSpend): string[] {
  const lines = spend.deferred
    ? [game.i18n.localize("FALLOUT.Junk.recipeDeferred")]
    : junkLines(spend.result);
  if (spend.unstocked.length > 0) {
    lines.push(
      game.i18n.localize("FALLOUT.Junk.recipeUnstocked", {
        materials: spend.unstocked.join(", "),
      }),
    );
  }
  if (spend.uncountable.length > 0) {
    lines.push(
      game.i18n.localize("FALLOUT.Junk.recipeUncountable", {
        materials: spend.uncountable.join("; "),
      }),
    );
  }
  return lines;
}
