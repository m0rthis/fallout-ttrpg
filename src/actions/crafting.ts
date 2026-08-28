/**
 * Crafting an item (pg 92; Power Armor's multi-day build, pg 94).
 *
 * The recipe half of this — DC, materials, time — is printed in the Item
 * Blueprint Encyclopedia (pg 94-115) and rides on every equipment document as
 * the `flags["fallout-ttrpg"].blueprint` object that `scripts/build-packs.mjs`
 * stamps on at build time. So the workflow is: pick the item you want out of
 * the equipment compendium (or off any copy of it), craft it, get a new copy on
 * your sheet. There is nothing to type in.
 *
 * The decision logic lives next door in `src/rules/crafting.ts` and is pure;
 * this file rolls, writes the item, and posts the card.
 *
 * **Materials are spent, and were reported for a long time before they could
 * be.** Nothing in this system used to represent steel or adhesive, so there
 * was no stock to subtract from and the card printed the quantities for a table
 * to apply by hand. Junk ships as documents now and `spendRecipeMaterials`
 * (`src/actions/junk.ts`) is the seam; the card still prints everything, and
 * still says so where a line could not be paid, because a spend that cannot
 * happen is reported rather than blocking. What the *check* changes is how much
 * is owed, which is the whole of the pg 92 rule and was always modelled.
 */

import type { CharacterData } from "../data/character";
import type { SkillKey } from "../rules/constants";
import {
  assistedMinutes,
  bestSavingIndex,
  bestSkillFor,
  categoryFormat,
  craftDC,
  craftOutcome,
  craftRequirement,
  craftsAutomatically,
  drinkBrewingShortfall,
  formatMinutes,
  isCraftSuccess,
  isPowerArmorBuild,
  materialsSpent,
  meetsRequirement,
  multiplyMaterials,
  parseCraftTime,
  parseMaterials,
  powerArmorSchedule,
  worstOutcome,
  FAILURE_LOSS_DIE,
  MATERIAL_SAVING_DIE,
  SEVERE_FAILURE_LOSS_DIE,
  type Blueprint,
  type CraftMaterial,
  type CraftOutcome,
  type CraftRequirement,
  type MaterialCost,
  type SkillRequirement,
} from "../rules/crafting";
import { recipeLines, spendRecipeMaterials } from "./junk";

const SYSTEM_ID = "fallout-ttrpg";

/**
 * A creature lending a hand (pg 92). `skillBonuses` is the same shape a
 * character's `system.derived.skillBonuses` already has, so a sheet can hand
 * over another actor's derived data unchanged.
 */
export interface CraftAssistant {
  readonly name: string;
  readonly skillBonuses: Readonly<Record<SkillKey, number>>;
  readonly d20Penalty?: number;
}

export interface CraftOptions {
  /** Which rank of a multi-rank upgrade to build (1-based). */
  rank?: number;
  /**
   * Roll anyway when the requirement is already met, gambling for the
   * "succeeded by 8 or more" material discount — the pg 92 clause that exists
   * purely so a competent crafter can push their luck.
   */
  pushLuck?: boolean;
  /** Creatures assisting: each halves the time, and each can sink the build. */
  assistants?: readonly CraftAssistant[];
  /**
   * Override the printed Craft DC *bonus*. Needed for the rows whose DC cell is
   * a shape no parser should reduce to one number, and for GM fiat.
   */
  dcBonus?: number;
  /** Supply the recipe directly when the item carries no blueprint flag. */
  blueprint?: Blueprint;
}

export interface CraftReport {
  readonly itemName: string;
  readonly succeeded: boolean;
  /** No roll was needed: the crafter met the listed requirement (pg 92). */
  readonly automatic: boolean;
  readonly outcome: CraftOutcome;
  readonly dc: number;
  /** The crafter's decisive (lowest) check total, or 0 when they never rolled. */
  readonly rolled: number;
  /** Time actually spent, after assistance. Null when the cell is not a duration. */
  readonly minutes: number | null;
  /** Days of work, and therefore checks — always 1 outside a Power Armor build. */
  readonly days: number;
  readonly materials: readonly MaterialCost[];
  readonly created: FoundryItem | null;
}

/** One resolved check, whoever made it. */
interface CheckResult {
  readonly who: string;
  /** Compared by identity rather than by name: an assistant may share one. */
  readonly isCrafter: boolean;
  readonly skill: SkillKey;
  readonly dc: number;
  readonly total: number;
  readonly outcome: CraftOutcome;
}

function skillLabel(skill: SkillKey): string {
  return game.i18n.localize(`FALLOUT.Skills.${skill}`);
}

async function rollCheck(
  actor: FoundryActor,
  who: string,
  isCrafter: boolean,
  check: SkillRequirement,
  bonuses: Readonly<Record<SkillKey, number>>,
  penalty: number,
  post: boolean,
): Promise<CheckResult> {
  const skill = bestSkillFor(check, bonuses);
  const bonus = bonuses[skill];
  const dc = craftDC(check.bonus);
  const roll = new foundry.dice.Roll(
    `1d20 + ${String(bonus)}${penalty > 0 ? ` - ${String(penalty)}` : ""}`,
  );
  await roll.evaluate();
  if (post) {
    await roll.toMessage({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.localize("FALLOUT.Crafting.check", {
        who,
        skill: skillLabel(skill),
        dc,
      }),
    });
  }
  return { who, isCrafter, skill, dc, total: roll.total, outcome: craftOutcome(roll.total, dc) };
}

/** Evaluate a bare die and return its total — the material dice are not worth a card each. */
async function rollDie(formula: string): Promise<number> {
  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();
  return roll.total;
}

/**
 * Build the item on the actor's sheet.
 *
 * The source's `system` is serialised to a plain object first: the new document
 * needs its own copy of the data rather than a live reference to the source's
 * DataModel, and a fresh build starts undamaged whatever state the source copy
 * was in.
 */
async function createCrafted(
  actor: FoundryActor,
  source: FoundryItem,
  quantity: number,
  blueprint: Blueprint,
): Promise<FoundryItem | null> {
  const system = JSON.parse(JSON.stringify(source.system)) as Record<string, unknown>;
  if ("decay" in system) system.decay = 0;
  if ("quantity" in system) system.quantity = quantity;
  const [created] = await actor.createEmbeddedDocuments("Item", [
    {
      name: source.name,
      type: source.type,
      img: source.img,
      system,
      flags: { [SYSTEM_ID]: { blueprint } },
    },
  ]);
  return created ?? null;
}

/** Materials as the card prints them: "x12 steel (of x20)". */
function materialLines(materials: readonly MaterialCost[]): string {
  return materials
    .map((material) => {
      if (material.spent === null || material.required === null) return material.text;
      if (material.spent === material.required) return `x${String(material.spent)} ${material.name}`;
      return game.i18n.localize("FALLOUT.Crafting.materialOf", {
        spent: material.spent,
        required: material.required,
        name: material.name,
      });
    })
    .join(", ");
}

/**
 * Craft `source` onto `actor`, rolling whatever pg 92 says has to be rolled.
 *
 * Returns null when the recipe says the thing cannot be made at all, which is a
 * genuine answer for 21 rows of the Encyclopedia and every modifier row.
 */
export async function craftItem(
  actor: FoundryActor,
  system: CharacterData,
  source: FoundryItem,
  options: CraftOptions = {},
): Promise<CraftReport | null> {
  const blueprint =
    options.blueprint ?? (source.getFlag(SYSTEM_ID, "blueprint") as Blueprint | undefined);
  if (!blueprint) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Crafting.noBlueprint", { item: source.name }),
    );
    return null;
  }

  const bonuses = system.derived.skillBonuses;
  const fmt = categoryFormat(blueprint.category);

  // The DC cell, or the caller's override. An override is still rolled against
  // the table's own skill — Medicine rows stay Medicine rows.
  let requirement: CraftRequirement;
  if (typeof options.dcBonus === "number") {
    // `rankCount` stays 1: with a hand-supplied DC we are not claiming to know
    // how many ranks the row prints. `rank` is still honoured, because the
    // materials cell is split by rank whatever the DC came from.
    requirement = {
      checks: [{ skills: fmt.primary, bonus: options.dcBonus }],
      rankCount: 1,
      rank: options.rank ?? 1,
      rider: null,
    };
  } else {
    const resolved = craftRequirement(blueprint, options.rank ?? 1);
    if (!resolved.ok) {
      ui.notifications.warn(
        game.i18n.localize(`FALLOUT.Crafting.${resolved.reason}`, {
          item: source.name,
          text: resolved.text,
        }),
      );
      return null;
    }
    requirement = resolved.value;
  }

  // pg 115: no drink is brewable at all below +8 in three separate skills.
  const shortfall = drinkBrewingShortfall(blueprint.category, bonuses);
  if (shortfall.length > 0) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Crafting.drinkGate", {
        item: source.name,
        skills: shortfall.map(skillLabel).join(", "),
      }),
    );
    return null;
  }

  const assistants = options.assistants ?? [];
  const printedMinutes = parseCraftTime(blueprint.craftTime);
  const minutes =
    printedMinutes === null ? null : assistedMinutes(printedMinutes, assistants.length);

  // Power Armor is the only multi-day build the book gives rules for (pg 94).
  const powerArmor = isPowerArmorBuild(blueprint.category) && printedMinutes !== null;
  const schedule =
    printedMinutes !== null && powerArmor
      ? powerArmorSchedule(printedMinutes, assistants.length)
      : { originalDays: 1, days: 1, materialMultiplier: 1 };

  // "You can craft any item so long as you […] your Crafting skill bonus is
  // equal to the listed requirement" — met means no roll at all, unless the
  // crafter chooses to gamble for the material discount.
  const qualifies = craftsAutomatically(requirement, bonuses);
  const crafterRolls = !qualifies || options.pushLuck === true;

  // A multi-day build would otherwise post up to thirty separate roll cards, so
  // only a single-session craft narrates each roll; the summary carries the
  // day-by-day totals instead.
  const postRolls = schedule.days === 1;

  const results: CheckResult[] = [];
  for (let day = 1; day <= schedule.days; day += 1) {
    if (crafterRolls) {
      for (const check of requirement.checks) {
        results.push(
          await rollCheck(
            actor,
            actor.name,
            true,
            check,
            bonuses,
            system.derived.d20Penalty,
            postRolls,
          ),
        );
      }
    }
    // "they must also succeed in the crafting check if their crafting skill
    // does not meet the required amount […] If they fail, the item fails to be
    // crafted even if you or any other creatures succeed" (pg 92). Note this
    // bites even when the crafter needed no roll of their own.
    for (const assistant of assistants) {
      for (const check of requirement.checks) {
        if (meetsRequirement(check, assistant.skillBonuses)) continue;
        results.push(
          await rollCheck(
            actor,
            assistant.name,
            false,
            check,
            assistant.skillBonuses,
            assistant.d20Penalty ?? 0,
            postRolls,
          ),
        );
      }
    }
    // One failed day fails the whole armor build; no point rolling day nine.
    if (powerArmor && results.some((result) => !isCraftSuccess(result.outcome))) break;
  }

  const outcome = results.length > 0 ? worstOutcome(results.map((r) => r.outcome)) : "succeeded";
  const succeeded = isCraftSuccess(outcome);
  const automatic = !crafterRolls;
  const crafterResults = results.filter((result) => result.isCrafter);
  // The headline DC on the card is the first printed check's; a row demanding
  // two skills gets both spelled out on its own line below.
  const dc = craftDC(requirement.checks[0]?.bonus ?? 0);
  const rolled = crafterResults.length > 0 ? Math.min(...crafterResults.map((r) => r.total)) : 0;

  // Materials. Power Armor pays the whole build up front — "instead of using
  // the materials each day, multiply all the required materials by the original
  // crafting time" — and assistance does not reduce that (pg 94).
  const parsed = parseMaterials(blueprint.craftMaterials, requirement.rank);
  const required: readonly CraftMaterial[] = powerArmor
    ? multiplyMaterials(parsed.materials, schedule.materialMultiplier)
    : parsed.materials;
  let materialRoll = 0;
  if (outcome === "succeededWell") materialRoll = await rollDie(MATERIAL_SAVING_DIE);
  else if (outcome === "failed") materialRoll = await rollDie(FAILURE_LOSS_DIE);
  else if (outcome === "failedBadly") materialRoll = await rollDie(SEVERE_FAILURE_LOSS_DIE);
  const savingIndex = outcome === "succeededWell" ? bestSavingIndex(required) : -1;
  const materials = materialsSpent(required, outcome, materialRoll, savingIndex);

  const quantity = blueprint.yield ?? 1;
  const created = succeeded ? await createCrafted(actor, source, quantity, blueprint) : null;

  // ------------------------------------------------------------- the card
  const lines: string[] = [
    game.i18n.localize(`FALLOUT.Crafting.${outcome}`, {
      item: source.name,
      dc,
      quantity,
    }),
  ];
  if (automatic) {
    lines.push(
      game.i18n.localize("FALLOUT.Crafting.automatic", {
        skill: requirement.checks.map((check) => skillLabel(bestSkillFor(check, bonuses))).join(", "),
        bonus: requirement.checks.map((check) => `+${String(check.bonus)}`).join(" / "),
      }),
    );
  }
  if (requirement.rankCount > 1) {
    lines.push(
      game.i18n.localize("FALLOUT.Crafting.rank", {
        rank: requirement.rank,
        of: requirement.rankCount,
      }),
    );
  }
  if (requirement.checks.length > 1) {
    lines.push(
      game.i18n.localize("FALLOUT.Crafting.multiCheck", {
        checks: requirement.checks
          .map(
            (check) =>
              `${check.skills.map(skillLabel).join("/")} DC ${String(craftDC(check.bonus))}`,
          )
          .join(" + "),
        heading: fmt.heading,
      }),
    );
  }
  if (requirement.rider !== null) {
    lines.push(game.i18n.localize("FALLOUT.Crafting.rider", { text: requirement.rider }));
  }
  if (materials.length > 0) {
    lines.push(
      game.i18n.localize(succeeded ? "FALLOUT.Crafting.materialsUsed" : "FALLOUT.Crafting.materialsLost", {
        materials: materialLines(materials),
      }),
    );
  }
  // And now actually spend them. `materialsSpent` above has always resolved the
  // real cost — the failure tiers, the succeed-by-8 discount, the minimum of one
  // — and this line has always been a report, because junk was not a document.
  // It is one now. Spent *after* the item is created and the roll has resolved:
  // a shortfall is something the table settles, never something that voids a
  // roll already made. The three rulings are on `spendRecipeMaterials`.
  const spend = await spendRecipeMaterials(actor, materials, parsed.hasAlternatives);
  lines.push(...recipeLines(spend));
  if (parsed.hasAlternatives) {
    lines.push(game.i18n.localize("FALLOUT.Crafting.alternatives", { text: parsed.text }));
  }
  if (minutes !== null) {
    lines.push(
      game.i18n.localize("FALLOUT.Crafting.time", {
        time: formatMinutes(minutes),
        printed: blueprint.craftTime ?? "",
      }),
    );
  } else if (blueprint.craftTime !== null) {
    lines.push(game.i18n.localize("FALLOUT.Crafting.timeText", { text: blueprint.craftTime }));
  }
  if (assistants.length > 0) {
    lines.push(
      game.i18n.localize("FALLOUT.Crafting.assisted", {
        count: assistants.length,
        names: assistants.map((assistant) => assistant.name).join(", "),
      }),
    );
  }
  if (powerArmor) {
    lines.push(
      game.i18n.localize("FALLOUT.Crafting.powerArmor", {
        days: schedule.days,
        original: schedule.originalDays,
        multiplier: schedule.materialMultiplier,
      }),
    );
    if (!succeeded) lines.push(game.i18n.localize("FALLOUT.Crafting.powerArmorRestart"));
    if (!postRolls && results.length > 0) {
      lines.push(
        game.i18n.localize("FALLOUT.Crafting.dailyRolls", {
          rolls: results.map((result) => String(result.total)).join(", "),
        }),
      );
    }
  }
  const sunk = results.find((result) => !result.isCrafter && !isCraftSuccess(result.outcome));
  if (sunk) {
    lines.push(game.i18n.localize("FALLOUT.Crafting.assistantFailed", { who: sunk.who }));
  }
  lines.push(game.i18n.localize("FALLOUT.Crafting.workbench"));

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: lines.join("<br />"),
  });

  return {
    itemName: source.name,
    succeeded,
    automatic,
    outcome,
    dc,
    rolled,
    minutes,
    days: schedule.days,
    materials,
    created,
  };
}
