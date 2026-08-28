import type { CharacterData } from "../data/character";
import { apLine } from "../combat/action-points";
import type { AidData } from "../data/items";
import { rollAddictionCheck } from "../dice/core";
import { healingPowderWorks } from "../rules/races";
import { addAddiction, isAddictedTo, OVERDOSE_EXHAUSTION_LEVELS } from "../rules/chems";
import { LETHAL_CONDITION_LEVEL } from "../rules/constants";
import { staminaFromProperties } from "../rules/effects";
import { consumableStamina } from "../rules/rest";
import { applyConsumableEffect } from "./consumable-effects";
import { contractRandomDisease } from "./diseases";
import { hitPointUpdates, restoreHitPoints, restoreStamina } from "./healing";
import { gainRadiationLevels, removeRadiationLevels } from "./radiation";
import { hasPerk } from "./perks";
import {
  addIrradiated,
  ALCOHOL_ADDICTION_DC,
  DRINK_STAGE_HOURS,
  DRINK_STAGES,
  drinkAlcohol,
  eatSnack,
  IRRADIATED_PER_RAD,
  IRRADIATION_IMMUNE_RACES,
} from "../rules/survival";

/**
 * Ice Cream and Apple Pie (perk, pg 52, requires Human, Ghoul, or Super
 * Mutant): "If you consume food with the Putrid or Tainted property, you
 * cannot become poisoned or diseased. Additionally, if you consume a food
 * with the Bland property, it is considered Tasty instead." Text-only in the
 * compendium (no mechanics entries), so the item's name is the only hook —
 * same idiom `wieldedMeleeWeapon`/`powerArmorItem` use to look an item up on
 * the actor by a property, just keyed on name instead (src/actions/blocking.ts,
 * src/actions/power-armor.ts).
 */
const ICE_CREAM_AND_APPLE_PIE = "Ice Cream and Apple Pie";

/**
 * Consume an aid item (pg 82-92).
 *
 * Healing items restore hit points — a multiple of the Healing Rate for the
 * stimpak family, or a fixed formula otherwise. Chems and Robot Overclock
 * Programs additionally run the pg 89 workflow: they count against the daily
 * chem limit (overdosing costs 5 levels of exhaustion each), and every use
 * forces an Endurance check against DC 6 or the character becomes addicted.
 * Tainted food or drink (pg 83, v2.1) rolls a random disease unless the eater
 * carries Ice Cream and Apple Pie.
 */
export async function useAid(
  actor: FoundryActor,
  system: CharacterData,
  item: FoundryItem,
): Promise<void> {
  const aid = item.system as AidData;
  if (aid.quantity <= 0) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Aid.empty", { item: item.name }));
    return;
  }

  const actorUpdates: Record<string, unknown> = {};
  const notes: string[] = [];

  // ------------------------------------------------------------- healing
  let healed = 0;
  if (aid.healsHealingRate) {
    healed = Math.floor(system.derived.healingRate * aid.healRateMultiplier);
  } else if (aid.healFormula.trim()) {
    const roll = new foundry.dice.Roll(aid.healFormula);
    await roll.evaluate();
    healed = Math.max(0, roll.total);
  }
  // Healing Powder heals "at the start of each of their turns […] After healing
  // for three rounds, the effects cease" (pg 86) — so nothing is restored now.
  // The rounds are banked and `src/combat/turns.ts` pays them out. Ghouls,
  // robots and gen-2 synths are named as unaffected, so they get neither.
  if (aid.healRounds > 0) {
    if (healingPowderWorks(system.details.race)) {
      actorUpdates["system.resources.healRounds"] = aid.healRounds;
      // `healed` already holds one round's worth — the item carries
      // `healRateMultiplier: 0.5`, which is pg 86's "half their healing rate".
      notes.push(
        game.i18n.localize("FALLOUT.Aid.healOverTime", {
          rounds: aid.healRounds,
          hp: healed,
        }),
      );
    } else {
      notes.push(game.i18n.localize("FALLOUT.Aid.healOverTimeImmune"));
    }
    healed = 0;
  } else if (healed > 0) {
    // Every hit-point restoration goes through the same gate as every stamina
    // restoration does, which is where pg 124's radiation lock and pg 133's
    // bleeding redirect both live. Before that gate existed, a stimpak in a
    // bleeding character's hand simply healed them, which is not the rule.
    const gain = restoreHitPoints(actor, system, healed);
    healed = gain.restored;
    Object.assign(actorUpdates, hitPointUpdates(gain));
    notes.push(...gain.notes);
  }

  // ------------------------------------------------ hunger and dehydration
  // Any food removes a level of hunger, any drink a level of dehydration
  // (pg 82); properties add to that. Snacks only count in pairs, which the
  // sheet cannot know, so they remove nothing and say so.
  const properties = new Set(
    aid.properties
      .split(",")
      .map((property) => property.trim().toLowerCase())
      .filter(Boolean),
  );
  // ------------------------------------------------------------- stamina
  // Bland, Tasty, Flavorsome and Delicacy (pg 83) and Invigorating (pg 89)
  // restore stamina as a multiple of level. Through the same gate as every
  // other stamina gain, so a Shocked character gets nothing from a hot meal.
  // Ghouls halve it and synths and robots get nothing from food, drink or
  // chems (pg 8-9) — but a Robot Overclock Program is none of those three, so
  // its Invigorating still lands on the machines it was written for.
  // Ice Cream and Apple Pie (pg 52) reads Bland as Tasty at the table. Bland
  // has no numeric effect besides this one-off stamina restoration (it is
  // absent from AID_PROPERTY_EFFECTS in rules/effects.ts), so swapping the
  // word before the tier lookup is a complete, not partial, application of
  // the perk.
  const blandAsTasty =
    aid.aidType === "food" && properties.has("bland") && hasPerk(actor, ICE_CREAM_AND_APPLE_PIE);
  const rawStamina = staminaFromProperties(
    blandAsTasty ? aid.properties.replace(/bland/gi, "Tasty") : aid.properties,
    system.details.level,
  );
  const staminaWanted =
    aid.aidType === "program" ? rawStamina : consumableStamina(system.details.race, rawStamina);
  if (rawStamina > 0 && staminaWanted === 0) {
    notes.push(game.i18n.localize("FALLOUT.Aid.inorganic"));
  }
  if (blandAsTasty) notes.push(game.i18n.localize("FALLOUT.Aid.blandAsTasty"));
  if (staminaWanted > 0) {
    const gain = restoreStamina(actor, system, staminaWanted);
    if (gain.restored > 0) actorUpdates["system.resources.sp.value"] = gain.value;
    notes.push(...gain.notes);
    if (gain.restored > 0) {
      notes.push(game.i18n.localize("FALLOUT.Aid.staminaHealed", { sp: gain.restored }));
    }
  }

  const relieve = (condition: "hunger" | "dehydration", levels: number): void => {
    if (levels <= 0) return;
    const current = (actorUpdates[`system.conditions.${condition}`] ??
      system.conditions[condition]) as number;
    // Dysentery's four levels of Dehydration and Parasites' four of Hunger
    // cannot be removed while the disease lasts (pg 120), so a disease floor
    // is the real bottom rather than zero.
    const floor = system.derived.conditionFloors[condition] ?? 0;
    const next = Math.max(floor, current - levels);
    if (next !== current) actorUpdates[`system.conditions.${condition}`] = next;
    else if (current <= floor) notes.push(game.i18n.localize("FALLOUT.Diseases.floorBlocked"));
  };

  if (aid.aidType === "food") {
    actorUpdates["system.survival.foodsToday"] = system.survival.foodsToday + 1;
    if (properties.has("snack")) {
      // "you do not remove any levels of hunger unless you consume two foods
      // with this property" (pg 83). The counter is per character, not per
      // item, and the pair unlocks both baselines — see rules/survival.ts for
      // the three things that sentence leaves undefined.
      const snack = eatSnack(system.survival.snacks);
      actorUpdates["system.survival.snacks"] = snack.pending;
      if (snack.hungerRemoved > 0) {
        relieve("hunger", snack.hungerRemoved + (properties.has("filling") ? 1 : 0));
        notes.push(game.i18n.localize("FALLOUT.Survival.snackPaired", {
          levels: snack.hungerRemoved,
        }));
      } else {
        notes.push(game.i18n.localize("FALLOUT.Aid.snack"));
      }
    } else {
      relieve("hunger", 1 + (properties.has("filling") ? 1 : 0));
    }
    if (properties.has("refreshing")) relieve("dehydration", 1);
  } else if (aid.aidType === "drink") {
    actorUpdates["system.survival.drinksToday"] = system.survival.drinksToday + 1;
    if (properties.has("hydrating")) actorUpdates["system.survival.hydratedToday"] = true;
    relieve("dehydration", 1 + (properties.has("hydrating") ? 2 : 0));
  }

  // ------------------------------------------------------------ irradiated
  // "When you consume a food that is irradiated, you gain one irradiated level.
  // If you gain ten irradiated levels, you gain one level of rads" (pg 83).
  // Ghouls and Super Mutants shrug it off entirely (Evolution, pp. 8/11).
  let radsFromIrradiation = 0;
  if (properties.has("irradiated")) {
    if (IRRADIATION_IMMUNE_RACES.includes(system.details.race)) {
      notes.push(game.i18n.localize("FALLOUT.Survival.irradiatedImmune"));
    } else {
      const result = addIrradiated(system.survival.irradiated, 1);
      actorUpdates["system.survival.irradiated"] = result.irradiated;
      radsFromIrradiation = result.rads;
      notes.push(
        game.i18n.localize(
          result.rads > 0 ? "FALLOUT.Survival.irradiatedConverted" : "FALLOUT.Survival.irradiated",
          { levels: result.irradiated, per: IRRADIATED_PER_RAD },
        ),
      );
    }
  }

  // -------------------------------------------------------------- tainted
  // "If you consume a food or drink with this property, you contract a
  // random disease. However, you may flip your cap to instead ignore
  // contracting a disease" (pg 83). Flipping a Karma Cap is the player's own
  // optional call at the table — nothing here spends one on their behalf, so
  // it is surfaced as a reminder rather than auto-resolved (there is no
  // Karma-Cap-spend workflow anywhere in the actions layer to hook into).
  // Ice Cream and Apple Pie (pg 52) blocks the disease outright. Its own text
  // narrows the trigger to "food," but Tainted's own glossary entry is "food
  // or drink" (pg 83, and the only shipped Tainted drink, Toxic water, would
  // otherwise be a hole in a perk whose whole point is food-poisoning safety),
  // so the immunity is read to cover both, matching aidType generally in this
  // file (e.g. Fortifying, Regenerating are not food-only either).
  let tainted = false;
  if (properties.has("tainted")) {
    if (hasPerk(actor, ICE_CREAM_AND_APPLE_PIE)) {
      notes.push(game.i18n.localize("FALLOUT.Aid.taintedImmune"));
    } else {
      tainted = true;
      notes.push(game.i18n.localize("FALLOUT.Aid.tainted"));
    }
  }

  // ----------------------------------------------------------- the ladder
  // Alcoholic and High-Proof share one escalation track (pg 82-83).
  const alcoholic = properties.has("alcoholic");
  const highProof = properties.has("highproof") || properties.has("high-proof");
  if (alcoholic || highProof) {
    const result = drinkAlcohol(
      system.survival.drinkStage,
      system.survival.drinkProgress,
      system.derived.abilityScores.endurance,
      highProof,
    );
    actorUpdates["system.survival.drinkStage"] = result.stage;
    actorUpdates["system.survival.drinkProgress"] = result.progress;
    if (result.advanced) {
      const hours = new foundry.dice.Roll(DRINK_STAGE_HOURS);
      await hours.evaluate();
      actorUpdates["system.survival.drinkHours"] = hours.total;
      notes.push(
        game.i18n.localize("FALLOUT.Survival.drinkStage", {
          stage: game.i18n.localize(`FALLOUT.Survival.stages.${DRINK_STAGES[result.stage] ?? "sober"}`),
          hours: hours.total,
        }),
      );
    } else {
      notes.push(game.i18n.localize("FALLOUT.Survival.drinkBanked", { drinks: result.progress }));
    }
  }

  // --------------------------------------------------- chems and programs
  if (aid.isChemLike) {
    const usedToday = system.chems.usedToday + 1;
    actorUpdates["system.chems.usedToday"] = usedToday;

    // Each chem past the limit within a day inflicts 5 levels of exhaustion.
    if (usedToday > system.derived.chemLimit) {
      const exhaustion = Math.min(
        LETHAL_CONDITION_LEVEL,
        system.conditions.exhaustion + OVERDOSE_EXHAUSTION_LEVELS,
      );
      actorUpdates["system.conditions.exhaustion"] = exhaustion;
      notes.push(
        game.i18n.localize("FALLOUT.Chems.overdose", {
          used: usedToday,
          limit: system.derived.chemLimit,
          levels: OVERDOSE_EXHAUSTION_LEVELS,
          exhaustion,
        }),
      );
      if (exhaustion >= LETHAL_CONDITION_LEVEL) {
        notes.push(game.i18n.localize("FALLOUT.Chems.exhaustionLethal"));
      }
    }
  }

  // The item is consumed and the actor updated before any check is rolled, so
  // the chat log reads in the order things happen at the table.
  await item.update({ "system.quantity": aid.quantity - 1 });
  if (Object.keys(actorUpdates).length > 0) await actor.update(actorUpdates);

  // The tenth irradiated level becomes a real level of Rads, which brings the
  // whole radiation pipeline with it — the 1d4 to both pools and the lock.
  if (radsFromIrradiation > 0) {
    await gainRadiationLevels(actor, actor.system as CharacterData, radsFromIrradiation);
  }

  // Rolled after the actor's own update lands, the same order a hazard rolls
  // it (contractRandomDisease, called from src/actions/environment.ts): the
  // use card's own numbers land first, the disease's own roll and
  // "contracted" cards follow.
  if (tainted) {
    await contractRandomDisease(actor, actor.system as CharacterData);
  }

  // RadAway and friends: clearing the last level also releases the radiation
  // damage that healing could not touch (pg 124).
  if (aid.removesRads > 0) {
    const rads = await removeRadiationLevels(actor, system, aid.removesRads);
    notes.push(
      game.i18n.localize(rads === 0 ? "FALLOUT.Radiation.cleared" : "FALLOUT.Radiation.reduced", {
        levels: aid.removesRads,
        rads,
      }),
    );
  }

  // A timed buff becomes an Active Effect so its numbers apply themselves and
  // the player can see what is still running.
  await applyConsumableEffect(actor, item, aid);

  const detail = [aid.effect, aid.duration ? `(${aid.duration})` : ""].filter(Boolean).join(" ");
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: [
      game.i18n.localize(healed > 0 ? "FALLOUT.Aid.usedHealed" : "FALLOUT.Aid.used", {
        item: item.name,
        ap: aid.apCost,
        healed,
        effect: detail,
      }),
      ...notes,
      ...(await apLine(actor, aid.apCost)),
    ].join("<br />"),
  });

  // The addiction check comes last so its roll card sits under the use card.
  if (aid.addictive) {
    // Alcohol addiction is to *alcoholic drinks* as a category, not to the
    // bottle in hand (pg 82), so it has its own flag and its own DC 5 — one
    // lower than a chem's.
    //
    // The printed trigger names only the Alcoholic property, which by the
    // letter exempts every High-Proof drink: beer and wine would check, whisky
    // and moonshine never would. Every other clause in both properties says
    // "alcoholic or high-proof", so this treats Alcoholic there as the
    // category. A deliberate departure from the printed word, and the only
    // one in this release.
    if (alcoholic || highProof) {
      if (system.survival.alcoholAddiction) return;
      const addicted = await rollAddictionCheck(actor, system, item.name, ALCOHOL_ADDICTION_DC);
      if (!addicted) return;
      await actor.update({ "system.survival.alcoholAddiction": true });
      await foundry.documents.ChatMessage.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        content: game.i18n.localize("FALLOUT.Survival.alcoholAddicted", {
          weeks: system.derived.addictionRecoveryWeeks,
        }),
      });
      return;
    }
    if (isAddictedTo(system.chems.addictions, item.name)) return;
    const addicted = await rollAddictionCheck(actor, system, item.name, aid.addictionDC);
    if (!addicted) return;
    await actor.update({
      "system.chems.addictions": addAddiction(system.chems.addictions, item.name),
    });
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: game.i18n.localize("FALLOUT.Chems.addicted", {
        chem: item.name,
        withdrawal: aid.withdrawal || game.i18n.localize("FALLOUT.Chems.noWithdrawal"),
        weeks: system.derived.addictionRecoveryWeeks,
      }),
    });
  }
}
