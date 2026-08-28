/**
 * The disease workflow (v2.1 pg 120).
 *
 * Contracting, curing, and running down the clock. Two rules shape the design:
 *
 * - **Locked condition levels stay locked, then simply unlock.** Dysentery
 *   grants four levels of Dehydration that cannot be removed while it lasts, so
 *   the levels are granted on contraction and a floor is published through
 *   `derived.conditionFloors`; curing the disease drops the floor and leaves
 *   the levels behind to be drunk away normally. Nothing is stripped.
 * - **A dose is not always a cure.** Med-X only suppresses a Fever for 1d4
 *   hours, and the two-dose cures want a day between doses, so a dose is
 *   recorded against the disease and only the last one ends it.
 */

import type { ActiveDisease, CharacterData } from "../data/character";
import type { AidData } from "../data/items";
import { LETHAL_CONDITION_LEVEL, type LeveledCondition } from "../rules/constants";
import {
  cureItemMatches,
  DISEASES,
  diseaseDurationHours,
  doseAllowed,
  findDisease,
  HOURS_PER_DAY,
  LIMB_DIE,
  LIMB_ORDER,
  PUSTULE_RADIUS_FEET,
  RANDOM_DISEASE_DIE,
} from "../rules/diseases";
import { gainRadiationLevels } from "./radiation";

function diseaseName(key: string): string {
  return game.i18n.localize(`FALLOUT.Diseases.${key}.name`);
}

async function say(actor: FoundryActor, content: string): Promise<void> {
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content,
  });
}

/** The stored (not derived) disease list, ready to write back. */
function storedDiseases(system: CharacterData): CharacterData["diseases"] {
  return system.diseases.map((entry) => ({ ...entry }));
}

/**
 * Contract a disease. Its clock is set from the Endurance *score* at this
 * moment, and any locked condition levels are granted at once.
 *
 * Nothing stops a character catching the same disease twice — the book does
 * not either — but a duplicate is refused, since a second identical countdown
 * would only ever be shadowed by the first.
 */
export async function contractDisease(
  actor: FoundryActor,
  system: CharacterData,
  key: string,
): Promise<boolean> {
  const definition = findDisease(key);
  if (!definition) return false;
  if (system.diseases.some((entry) => entry.key === key)) {
    await say(actor, game.i18n.localize("FALLOUT.Diseases.already", { disease: diseaseName(key) }));
    return false;
  }

  const hours = diseaseDurationHours(definition.duration, system.derived.abilityScores.endurance);
  const diseases = storedDiseases(system);
  diseases.push({ key, remainingHours: hours, doses: 0, sinceDoseHours: 0, suppressedHours: 0 });

  const updates: Record<string, unknown> = { "system.diseases": diseases };
  const granted: string[] = [];
  for (const [condition, levels] of Object.entries(definition.effects.lockedConditions ?? {})) {
    const field = condition as LeveledCondition;
    const total = Math.min(LETHAL_CONDITION_LEVEL, system.conditions[field] + levels);
    updates[`system.conditions.${field}`] = total;
    granted.push(
      game.i18n.localize("FALLOUT.Diseases.locked", {
        levels,
        condition: game.i18n.localize(`FALLOUT.Conditions.${field}`),
      }),
    );
  }
  await actor.update(updates);

  // An hours-based duration has no printed minimum, so a tough enough
  // character can shake it off the instant it lands. Say so rather than
  // leaving a disease sitting at zero hours.
  const detail =
    hours === null
      ? game.i18n.localize("FALLOUT.Diseases.untilSleep")
      : game.i18n.localize("FALLOUT.Diseases.remaining", { hours });
  await say(
    actor,
    [
      game.i18n.localize("FALLOUT.Diseases.contracted", {
        disease: diseaseName(key),
        effect: game.i18n.localize(`FALLOUT.Diseases.${key}.effect`),
        duration: detail,
      }),
      ...granted,
    ].join("<br />"),
  );
  if (hours === 0) await advanceDiseases(actor, actor.system as CharacterData, 0);
  return true;
}

/**
 * A random disease (Toxic Water, Toxic Air, the Tainted property).
 *
 * The book calls for one three times and never prints a table. The chapter has
 * exactly twenty rows in alphabetical order, so a d20 indexes it — our
 * inference, and the chat card says so.
 */
export async function contractRandomDisease(
  actor: FoundryActor,
  system: CharacterData,
): Promise<string> {
  const roll = new foundry.dice.Roll(RANDOM_DISEASE_DIE);
  await roll.evaluate();
  const disease = DISEASES[roll.total - 1] ?? DISEASES[0];
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.localize("FALLOUT.Diseases.randomFlavor", {
      disease: diseaseName(disease.key),
    }),
  });
  await contractDisease(actor, system, disease.key);
  return disease.key;
}

/** Drop a disease outright, with no cure — GM fiat, or a clock that ran out. */
export async function removeDisease(
  actor: FoundryActor,
  system: CharacterData,
  key: string,
): Promise<void> {
  const diseases = storedDiseases(system).filter((entry) => entry.key !== key);
  if (diseases.length === system.diseases.length) return;
  await actor.update({ "system.diseases": diseases });
  await say(actor, game.i18n.localize("FALLOUT.Diseases.ended", { disease: diseaseName(key) }));
}

/**
 * Apply a consumable against a disease.
 *
 * Returns true when the item did something. The three shapes a cure takes are
 * all handled here: a dose (possibly one of two, a day apart), any consumable
 * carrying a named property, and Med-X's Fever suppression, which is not a
 * cure at all and leaves the clock running.
 */
export async function treatDisease(
  actor: FoundryActor,
  system: CharacterData,
  key: string,
  item: FoundryItem,
): Promise<boolean> {
  const active = system.derived.diseases.find((entry) => entry.key === key);
  if (!active) return false;
  const cure = active.definition.cure;
  const aid = item.system as AidData;

  if (cure.kind === "property") {
    const properties = aid.properties.toLowerCase();
    if (!properties.includes(cure.property)) {
      ui.notifications.warn(
        game.i18n.localize("FALLOUT.Diseases.wrongProperty", {
          item: item.name,
          property: cure.property,
        }),
      );
      return false;
    }
    await removeDisease(actor, system, key);
    return true;
  }

  if (cure.kind === "suppress") {
    if (!cureItemMatches(item.name, cure.item)) {
      ui.notifications.warn(
        game.i18n.localize("FALLOUT.Diseases.wrongItem", { item: item.name, want: cure.item }),
      );
      return false;
    }
    const roll = new foundry.dice.Roll(cure.formula);
    await roll.evaluate();
    await writeDisease(actor, system, key, { suppressedHours: roll.total });
    await roll.toMessage({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.localize("FALLOUT.Diseases.suppressed", {
        disease: diseaseName(key),
        hours: roll.total,
      }),
    });
    return true;
  }

  if (cure.kind !== "item") {
    // The Woopsies: a Nuka-Cola Quantum, or 2d20 caps into open water — and
    // taking the caps back re-afflicts you, so this stays a GM decision.
    ui.notifications.info(
      game.i18n.localize("FALLOUT.Diseases.specialCure", { disease: diseaseName(key) }),
    );
    return false;
  }

  if (!cureItemMatches(item.name, cure.item)) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Diseases.wrongItem", { item: item.name, want: cure.item }),
    );
    return false;
  }
  if (!doseAllowed(cure, active.doses, active.sinceDoseHours)) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Diseases.tooSoon", {
        disease: diseaseName(key),
        hours: Math.max(0, (cure.spacingHours ?? 0) - active.sinceDoseHours),
      }),
    );
    return false;
  }

  const doses = active.doses + 1;
  if (doses >= cure.doses) {
    // "x1 antibiotic and an hour" is a wait after the dose, not a second dose:
    // the clock is shortened to that wait rather than cleared outright.
    if (cure.waitHours) {
      await writeDisease(actor, system, key, {
        doses,
        sinceDoseHours: 0,
        // Never lengthen a clock that was already shorter than the wait.
        remainingHours: Math.min(active.remainingHours ?? cure.waitHours, cure.waitHours),
      });
      await say(
        actor,
        game.i18n.localize("FALLOUT.Diseases.curePending", {
          disease: diseaseName(key),
          hours: cure.waitHours,
        }),
      );
      return true;
    }
    await removeDisease(actor, system, key);
    return true;
  }

  await writeDisease(actor, system, key, { doses, sinceDoseHours: 0 });
  await say(
    actor,
    game.i18n.localize("FALLOUT.Diseases.dose", {
      disease: diseaseName(key),
      doses,
      total: cure.doses,
    }),
  );
  return true;
}

/** Patch one disease's stored state in place. */
async function writeDisease(
  actor: FoundryActor,
  system: CharacterData,
  key: string,
  patch: Partial<CharacterData["diseases"][number]>,
): Promise<void> {
  const diseases = storedDiseases(system).map((entry) =>
    entry.key === key ? { ...entry, ...patch } : entry,
  );
  await actor.update({ "system.diseases": diseases });
}

/**
 * Run every disease clock forward. Suppression burns down alongside the
 * duration, and the doses counter measures elapsed time for the one-day
 * spacing rule. Diseases whose clock reaches zero end here.
 */
export async function advanceDiseases(
  actor: FoundryActor,
  system: CharacterData,
  hours: number,
): Promise<string[]> {
  if (system.diseases.length === 0) return [];
  const ended: string[] = [];
  const kept: CharacterData["diseases"] = [];
  for (const entry of system.diseases) {
    const remaining = entry.remainingHours === null ? null : Math.max(0, entry.remainingHours - hours);
    if (remaining === 0) {
      ended.push(entry.key);
      continue;
    }
    kept.push({
      ...entry,
      remainingHours: remaining,
      suppressedHours: Math.max(0, entry.suppressedHours - hours),
      sinceDoseHours: entry.doses > 0 ? entry.sinceDoseHours + hours : 0,
    });
  }
  if (ended.length === 0 && hours === 0) return [];

  await actor.update({ "system.diseases": kept });
  if (ended.length > 0) {
    await say(
      actor,
      game.i18n.localize("FALLOUT.Diseases.ended", {
        disease: ended.map(diseaseName).join(", "),
      }),
    );
  }
  return ended;
}

/**
 * Sleeping (pg 119-120). Three diseases end on a night's sleep, Heat flashes
 * only if no Dehydration is left, and Rad worms hands out a level of Rads
 * every single time.
 */
export async function sleepDiseases(
  actor: FoundryActor,
  system: CharacterData,
): Promise<{ ended: string[]; radsGained: number }> {
  const ended: string[] = [];
  let radsGained = 0;

  for (const active of system.derived.diseases) {
    const { duration, cure, effects } = active.definition;
    if (duration.kind === "sleep") {
      ended.push(active.key);
    } else if (cure.kind === "sleep") {
      if (cure.requiresNoDehydration && system.conditions.dehydration > 0) {
        await say(
          actor,
          game.i18n.localize("FALLOUT.Diseases.sleepBlocked", {
            disease: diseaseName(active.key),
            levels: system.conditions.dehydration,
          }),
        );
      } else {
        ended.push(active.key);
      }
    }
    if (effects.radsOnSleep) radsGained += 1;
  }

  if (ended.length > 0) {
    const kept = storedDiseases(system).filter((entry) => !ended.includes(entry.key));
    await actor.update({ "system.diseases": kept });
    await say(
      actor,
      game.i18n.localize("FALLOUT.Diseases.sleptOff", { disease: ended.map(diseaseName).join(", ") }),
    );
  }
  if (radsGained > 0) {
    await gainRadiationLevels(actor, actor.system as CharacterData, radsGained);
  }
  return { ended, radsGained };
}

/**
 * The four diseases that react to hit-point damage (pg 120). Called after
 * damage lands, not inside the damage pipeline, so a reaction that deals its
 * own damage cannot recurse into another reaction.
 */
export async function diseaseDamageReactions(
  actor: FoundryActor,
  system: CharacterData,
  hpLost: number,
): Promise<void> {
  if (hpLost <= 0) return;
  for (const active of system.derived.diseases) {
    if (active.suppressed) continue;
    await reactToDamage(actor, active);
  }
}

async function reactToDamage(actor: FoundryActor, active: ActiveDisease): Promise<void> {
  const system = actor.system as CharacterData;
  switch (active.definition.effects.onHpDamage) {
    case "poisonDamage": {
      const roll = new foundry.dice.Roll("1d4");
      await roll.evaluate();
      const hp = Math.max(0, system.resources.hp.value - roll.total);
      await actor.update({ "system.resources.hp.value": hp });
      await roll.toMessage({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        flavor: game.i18n.localize("FALLOUT.Diseases.bloodWormsDamage", {
          disease: diseaseName(active.key),
        }),
      });
      break;
    }
    case "limbCondition": {
      const roll = new foundry.dice.Roll(LIMB_DIE);
      await roll.evaluate();
      const limb = LIMB_ORDER[roll.total - 1] ?? LIMB_ORDER[0];
      await roll.toMessage({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        flavor: game.i18n.localize("FALLOUT.Diseases.limbCondition", {
          disease: diseaseName(active.key),
          limb: game.i18n.localize(`FALLOUT.Targeted.limbs.${limb}.label`),
        }),
      });
      break;
    }
    case "radsNearby":
      // The carrier is irradiated here; everything within ten feet is the GM's
      // to resolve, since nothing on the sheet knows who is standing nearby.
      await gainRadiationLevels(actor, system, 1);
      await say(
        actor,
        game.i18n.localize("FALLOUT.Diseases.pustules", { feet: PUSTULE_RADIUS_FEET }),
      );
      break;
    case "bleeding": {
      const bleeding = Math.min(LETHAL_CONDITION_LEVEL, system.conditions.bleeding + 1);
      await actor.update({ "system.conditions.bleeding": bleeding });
      await say(
        actor,
        game.i18n.localize("FALLOUT.Diseases.weepingSores", {
          disease: diseaseName(active.key),
          levels: bleeding,
        }),
      );
      break;
    }
    default:
      break;
  }
}

/** Hours of a cure's one-day spacing still to wait, for the sheet. */
export function doseWaitHours(active: ActiveDisease): number {
  if (active.definition.cure.kind !== "item") return 0;
  const spacing = active.definition.cure.spacingHours ?? 0;
  if (active.doses === 0 || spacing === 0) return 0;
  return Math.max(0, spacing - active.sinceDoseHours);
}

export { HOURS_PER_DAY };
