/**
 * Repairing decay (pg 92-93; Power Armor pg 57-58).
 *
 * > **Repairing Items.** You can repair one level of decay from any item so
 * > long as you succeed a crafting check, and spend the required time and
 * > materials listed in the "Vault-Tec Item Blueprint Encyclopedia" table
 * > below. Each item has a repair bonus listed in the table, you must succeed a
 * > crafting skill check to repair an item. The DC is equal to 10 + the bonus
 * > listed. If your crafting skill bonus is equal to the bonus listed in the
 * > table, you automatically succeed this roll. If you fail, the item does not
 * > lose any levels of decay, you spend half as much time as you normally
 * > would, and you use half the materials (rounded down).
 *
 * Three wrinkles worth naming:
 *
 * - **"Repair DC" is a bonus, not a DC.** Every table column is headed "Repair
 *   DC" and holds `+0`, `+3`, `+10`; the real DC is 10 plus that. Power Armor
 *   is the exception and prints true flat DCs ("DC 16"), which is why armor
 *   carries both fields.
 * - **Failure is nearly free.** Half of "x1 crafting material" rounded down is
 *   zero, so most failed repairs cost nothing but half the time. That is what
 *   the book says; retrying until it works is the intended shape.
 * - **Repair needs no downtime.** The book gates it on a check, time and
 *   materials, and nothing else. The workbench requirement on pg 92 is written
 *   for *crafting*, and is not extended here.
 *
 * The materials and times themselves live in the Item Blueprint Encyclopedia,
 * which is a separate roadmap item and not yet extracted — so this rolls the
 * check and moves the decay, and reports the requirement rather than tracking
 * a stock of steel and adhesive.
 */

import type { CharacterData } from "../data/character";
import type { ArmorData } from "../data/armor";
import { DECAY_MAX } from "../rules/constants";
import { rollSkillCheck } from "../dice/core";
import { parseMaterials } from "../rules/crafting";
import { recipeLines, spendRecipeMaterials } from "./junk";

/** The flag scope every document in this system stamps its blueprint under. */
const SYSTEM_ID = "fallout-ttrpg";

/** A broken item comes back at this many levels, not at zero (pg 93). */
export const BROKEN_REPAIR_DECAY = 5;
/** Repairing a broken item raises the DC by this much (pg 93). */
export const BROKEN_DC_PENALTY = 5;
/** Cannibalising a similar item repairs an extra level if it is this clean. */
export const CANNIBALIZE_MAX_DECAY = 5;
/** Minutes per level when repairing Power Armor (pg 57). */
export const POWER_ARMOR_MINUTES_PER_LEVEL = 15;

interface RepairableSystem {
  decay: number;
  repairBonus?: number;
  repairDC?: number;
  isPowerArmor?: boolean;
  decayMax?: number;
}

export interface RepairOptions {
  /** Feed a copy or a similar item into the repair for an extra level. */
  cannibalize?: boolean;
  /** Override the item's recorded repair bonus (the Encyclopedia is not in yet). */
  repairBonus?: number;
}

export interface RepairReport {
  dc: number;
  rolled: number;
  succeeded: boolean;
  automatic: boolean;
  levelsRepaired: number;
  decay: number;
  wasBroken: boolean;
}

/** The decay level at which an item breaks and stops working (pg 92). */
export function isBroken(system: RepairableSystem): boolean {
  const max = system.decayMax && system.decayMax > 0 ? system.decayMax : DECAY_MAX;
  // Power Armor keeps working past its cap — it just stops giving Defense
  // Points (pg 57), so it is never "broken" in the pg 92 sense.
  if (system.isPowerArmor === true) return false;
  return system.decay >= max;
}

/**
 * Repair one level of decay (two if a similar item is cannibalised, five-ish if
 * the item was broken).
 *
 * Returns null when there is nothing to repair.
 */
export async function repairItem(
  actor: FoundryActor,
  system: CharacterData,
  item: FoundryItem,
  options: RepairOptions = {},
): Promise<RepairReport | null> {
  const target = item.system as RepairableSystem;
  if (target.decay <= 0) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Repair.undamaged", { item: item.name }));
    return null;
  }

  const broken = isBroken(target);
  const powerArmor = target.isPowerArmor === true;

  // Power Armor prints a flat DC; everything else prints a bonus over 10.
  const bonus = options.repairBonus ?? target.repairBonus ?? 0;
  const flatDC = powerArmor ? ((item.system as ArmorData).repairDC || 0) : 0;
  let dc = powerArmor && flatDC > 0 ? flatDC : 10 + bonus;
  if (broken) dc += BROKEN_DC_PENALTY;

  // "If your crafting skill bonus is equal to the bonus listed in the table,
  // you automatically succeed" — read as "equal or better", since a better
  // crafter failing where a worse one succeeds cannot be the intent. Power
  // Armor's flat DCs give nothing to compare against, so it always rolls.
  const crafting = system.derived.skillBonuses.crafting;
  const automatic = !powerArmor && !broken && crafting >= bonus;

  let rolled = 0;
  let succeeded = automatic;
  if (!automatic) {
    // Through the shared helper, so advantage and disadvantage on a Crafting
    // check actually reach it. This was an inline `1d20 + bonus - penalty` for
    // as long as `effectiveMode` was unreachable from `src/actions/`; it now
    // lives in `src/dice/core.ts`, which any action module may import. The
    // flavor is passed through unchanged so the card reads as it always has.
    const check = await rollSkillCheck(
      actor,
      system,
      "crafting",
      dc,
      "normal",
      [],
      game.i18n.localize("FALLOUT.Repair.check", { item: item.name, dc }),
    );
    rolled = check.total;
    succeeded = check.success;
  }

  let levelsRepaired = 0;
  let decay = target.decay;
  if (succeeded) {
    if (broken) {
      // A broken item comes back at five levels of decay, not at zero.
      decay = BROKEN_REPAIR_DECAY;
      levelsRepaired = target.decay - decay;
    } else {
      levelsRepaired = 1 + (options.cannibalize === true ? 1 : 0);
      decay = Math.max(0, target.decay - levelsRepaired);
      levelsRepaired = target.decay - decay;
    }
    await item.update({ "system.decay": decay });
  }

  const lines = [
    game.i18n.localize(
      succeeded ? "FALLOUT.Repair.succeeded" : "FALLOUT.Repair.failed",
      { item: item.name, levels: levelsRepaired, decay, dc },
    ),
  ];
  if (automatic) {
    lines.push(game.i18n.localize("FALLOUT.Repair.automatic", { bonus }));
  }
  if (!succeeded) {
    lines.push(game.i18n.localize("FALLOUT.Repair.failureCost"));
  }
  if (broken) {
    lines.push(
      game.i18n.localize(
        succeeded ? "FALLOUT.Repair.brokenRestored" : "FALLOUT.Repair.brokenCost",
        { levels: BROKEN_REPAIR_DECAY, dc: BROKEN_DC_PENALTY },
      ),
    );
  }
  if (options.cannibalize === true && succeeded && !broken) {
    lines.push(game.i18n.localize("FALLOUT.Repair.cannibalized", { max: CANNIBALIZE_MAX_DECAY }));
  }
  if (powerArmor) {
    lines.push(
      game.i18n.localize("FALLOUT.Repair.powerArmor", {
        minutes: POWER_ARMOR_MINUTES_PER_LEVEL,
      }),
    );
  } else {
    lines.push(game.i18n.localize("FALLOUT.Repair.materials"));
  }

  // Spend them. `repairItem` printed the generic "spend the materials the
  // Encyclopedia lists" line for as long as junk was not a document; the recipe
  // rides on the item as the same blueprint flag `craftItem` reads, so the same
  // parser answers here.
  //
  // **Failure halves the cost, rounded down** — the printed rule, and the reason
  // most failed repairs cost nothing at all: half of "x1 crafting material" is
  // zero. Power Armor is skipped because pg 57-58 prices its repair in time
  // alone. The three rulings about *which* lines can be paid are shared with
  // crafting, on `spendRecipeMaterials`.
  if (!powerArmor) {
    const blueprint = item.getFlag(SYSTEM_ID, "blueprint") as
      | { craftMaterials?: string | null }
      | undefined;
    const parsed = parseMaterials(blueprint?.craftMaterials ?? null);
    const owed = parsed.materials.map((material) => ({
      name: material.name,
      spent:
        material.quantity === null
          ? null
          : succeeded
            ? material.quantity
            : Math.floor(material.quantity / 2),
    }));
    if (owed.some((line) => line.spent === null || line.spent > 0)) {
      const spend = await spendRecipeMaterials(actor, owed, parsed.hasAlternatives);
      lines.push(...recipeLines(spend));
    }
  }

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: lines.join("<br />"),
  });

  return { dc, rolled, succeeded, automatic, levelsRepaired, decay, wasBroken: broken };
}
