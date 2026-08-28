/**
 * Resting and the daily survival clock (pg 119, 133-134).
 *
 * The book has no downtime system to build — see `src/rules/rest.ts` for what
 * it does have and which of its numbers contradict each other. What is here:
 *
 * - **Rest**, which restores stamina, and past a race-dependent threshold heals
 *   hit points and sheds a level of exhaustion.
 * - **A day rolling over**, which charges hunger and dehydration for whatever
 *   the character failed to eat and drink, and exhaustion for not sleeping.
 *
 * Both advance the disease clocks, because the diseases chapter measures its
 * durations and its one-day dose spacing in the same hours.
 */

import type { CharacterData } from "../data/character";
import {
  HUNGER_IMMUNE_RACES,
  LETHAL_CONDITION_LEVEL,
  type LeveledCondition,
} from "../rules/constants";
import {
  dailyIntake,
  EXHAUSTION_PER_DAY,
  DEHYDRATION_PER_DAY,
  HUNGER_PER_DAY,
  restHitPoints,
  restProfile,
} from "../rules/rest";
import { DRINK_STAGE_MAX, drinkEffects } from "../rules/survival";
import { advanceDiseases, sleepDiseases } from "./diseases";
import { clearConsumableEffects } from "./consumable-effects";
import { hitPointUpdates, restoreHitPoints, restoreStamina } from "./healing";
import { restProgression } from "./progression";
import { resetStealthFieldUses } from "./stealth-field";
import { advanceFuel } from "./robots";

export interface RestOptions {
  hours: number;
  /** A soft surface *and* shelter (pg 119); without both, halve SP and HP. */
  comfortable: boolean;
  /** Whether this rest was sleep, which is what clears sleep-gated diseases. */
  sleep: boolean;
}

export interface RestReport {
  staminaRestored: number;
  hitPointsHealed: number;
  exhaustionRemoved: number;
  /** True once the rest was long enough to heal and shed exhaustion. */
  longRest: boolean;
  diseasesEnded: string[];
  radsGained: number;
  notes: string[];
}

/**
 * Rest for a span of hours.
 *
 * One hour restores stamina — to half maximum for an organic character, to full
 * for a synthetic one, and to full for anyone sleeping comfortably. Reaching
 * the long-rest threshold (6 hours organic, 2 synthetic) additionally heals
 * `half your ability score + your level` and removes one level of exhaustion.
 *
 * Sleeping uncomfortably halves the stamina and hit points regained. It does
 * **not** halve the exhaustion removed: the rule names "SP and HP" and stops
 * there, and inventing a third clause would be inventing a rule.
 */
export async function rest(
  actor: FoundryActor,
  system: CharacterData,
  options: RestOptions,
): Promise<RestReport> {
  const race = system.details.race;
  const profile = restProfile(race);
  const hours = Math.max(0, options.hours);
  const notes: string[] = [];
  const updates: Record<string, unknown> = {};

  const halve = (value: number): number =>
    options.comfortable ? value : Math.floor(value / 2);

  // Drunk and Hammered raise maximum stamina (pg 133-134), and a rest long
  // enough to sober someone up takes that maximum away again. Restoring
  // stamina against the drunk ceiling and *then* removing the drunkenness
  // would leave the character holding stamina they no longer have room for, so
  // the target is measured against the maximum they will wake up with.
  const soberingUp =
    system.survival.drinkStage > 0 && system.survival.drinkHours - hours <= 0;
  const drinkStamina = soberingUp
    ? drinkEffects(system.survival.drinkStage).staminaPerLevel * system.details.level
    : 0;

  // ------------------------------------------------------------- stamina
  let staminaRestored = 0;
  if (hours >= 1) {
    // Radiation-locked damage caps what any healing can reach (pg 124).
    const ceiling = Math.max(0, system.derived.spHealableMax - drinkStamina);
    const fraction = options.comfortable ? 1 : profile.hourlyStaminaFraction;
    const target = Math.min(ceiling, Math.floor((system.derived.spMax - drinkStamina) * fraction));
    const raw = Math.max(0, target - system.resources.sp.value);
    const wanted = halve(raw);
    const gain = restoreStamina(actor, system, wanted, { ceiling });
    staminaRestored = gain.restored;
    if (gain.restored > 0) updates["system.resources.sp.value"] = gain.value;
    notes.push(...gain.notes);
    // Halved down to nothing: worth saying, because the character rested and
    // got literally no stamina for it.
    if (wanted === 0 && raw > 0) {
      notes.push(game.i18n.localize("FALLOUT.Rest.uncomfortableNothing"));
    }
  }

  // --------------------------------------------------- hit points, exhaustion
  const longRest = hours >= profile.longHours;
  let hitPointsHealed = 0;
  let exhaustionRemoved = 0;
  if (longRest) {
    const healed = halve(
      restHitPoints(race, system.details.level, {
        endurance: system.derived.abilityScores.endurance,
        intelligence: system.derived.abilityScores.intelligence,
        perception: system.derived.abilityScores.perception,
      }),
    );
    // Through the same gate as every other hit-point restoration: the radiation
    // lock (pg 124) and pg 133's bleeding redirect both live there, and a rest
    // that quietly healed a bleeding character was the last place this system
    // still did that.
    const gain = restoreHitPoints(actor, system, healed);
    hitPointsHealed = gain.restored;
    Object.assign(updates, hitPointUpdates(gain));
    notes.push(...gain.notes);

    if (system.conditions.exhaustion > 0) {
      exhaustionRemoved = 1;
      updates["system.conditions.exhaustion"] = system.conditions.exhaustion - 1;
    }
  } else if (hours > 0) {
    notes.push(
      game.i18n.localize("FALLOUT.Rest.tooShort", { hours: profile.longHours }),
    );
  }

  if (options.sleep) updates["system.survival.sleptToday"] = true;

  // The drink ladder runs on its own 1d4-hour clock, and resting burns it off.
  const drinkHours = Math.max(0, system.survival.drinkHours - hours);
  if (soberingUp) {
    updates["system.survival.drinkStage"] = 0;
    updates["system.survival.drinkProgress"] = 0;
    updates["system.survival.drinkHours"] = 0;
    notes.push(game.i18n.localize("FALLOUT.Survival.soberedUp"));
  } else if (system.survival.drinkStage > 0) {
    updates["system.survival.drinkHours"] = drinkHours;
  }

  if (Object.keys(updates).length > 0) await actor.update(updates);

  // A rest ends the until-rest half of every skill magazine (pg 88), and eight
  // hours restores Barter's Discount (pg 22) — two different thresholds, which
  // is why this is one call rather than folded into the long-rest branch above.
  await restProgression(actor, actor.system as CharacterData, hours);

  // Time passing is time passing: the disease clocks and dose spacing advance
  // whether or not the rest was long enough to be worth anything. The Handy
  // fuel clock (pg 10) runs on the same hours — a machine sleeps dry.
  const ended = hours > 0 ? await advanceDiseases(actor, actor.system as CharacterData, hours) : [];
  if (hours > 0) await advanceFuel(actor, actor.system as CharacterData, hours);

  let radsGained = 0;
  if (options.sleep) {
    const slept = await sleepDiseases(actor, actor.system as CharacterData);
    ended.push(...slept.ended);
    radsGained = slept.radsGained;
  }

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: [
      game.i18n.localize(options.sleep ? "FALLOUT.Rest.slept" : "FALLOUT.Rest.rested", {
        hours,
        sp: staminaRestored,
        hp: hitPointsHealed,
      }),
      exhaustionRemoved > 0 ? game.i18n.localize("FALLOUT.Rest.exhaustionRemoved") : "",
      ended.length > 0
        ? game.i18n.localize("FALLOUT.Rest.diseasesEnded", {
            diseases: ended
              .map((key) => game.i18n.localize(`FALLOUT.Diseases.${key}.name`))
              .join(", "),
          })
        : "",
      radsGained > 0 ? game.i18n.localize("FALLOUT.Rest.radWorms", { rads: radsGained }) : "",
      ...notes,
    ]
      .filter(Boolean)
      .join("<br />"),
  });

  return {
    staminaRestored,
    hitPointsHealed,
    exhaustionRemoved,
    longRest,
    diseasesEnded: ended,
    radsGained,
    notes,
  };
}

export interface DayReport {
  hunger: number;
  dehydration: number;
  exhaustion: number;
  notes: string[];
}

/**
 * Roll the day over (pg 119, 133-134).
 *
 * A character who ate less than their day's food gains a level of hunger; one
 * who drank fewer than three drinks — unless one was Hydrating, which covers a
 * day by itself — gains three levels of dehydration; one who did not sleep
 * gains a level of exhaustion. Gen-2 Synths and Robots are exempt from all
 * three, and Super Mutants need twice the food and water.
 *
 * This also does what the old "new day" button did: reset the chem counter and
 * drop consumable effects that are still running.
 */
export async function passDay(actor: FoundryActor, system: CharacterData): Promise<DayReport> {
  const race = system.details.race;
  const immune = HUNGER_IMMUNE_RACES.includes(race);
  const notes: string[] = [];
  const updates: Record<string, unknown> = {
    "system.chems.usedToday": 0,
    "system.survival.foodsToday": 0,
    "system.survival.drinksToday": 0,
    "system.survival.hydratedToday": false,
    "system.survival.sleptToday": false,
  };

  const gain = (condition: LeveledCondition, levels: number): number => {
    const next = Math.min(LETHAL_CONDITION_LEVEL, system.conditions[condition] + levels);
    updates[`system.conditions.${condition}`] = next;
    if (next >= LETHAL_CONDITION_LEVEL) {
      notes.push(game.i18n.localize("FALLOUT.Rest.lethal", {
        condition: game.i18n.localize(`FALLOUT.Conditions.${condition}`),
      }));
    }
    return levels;
  };

  const report: DayReport = { hunger: 0, dehydration: 0, exhaustion: 0, notes };
  if (immune) {
    notes.push(game.i18n.localize("FALLOUT.Rest.inorganic"));
  } else {
    const needed = dailyIntake(race);
    if (system.survival.foodsToday < needed.foods) {
      report.hunger = gain("hunger", HUNGER_PER_DAY);
    }
    // "at least three drinks **or** a drink with the hydrating property".
    if (!system.survival.hydratedToday && system.survival.drinksToday < needed.drinks) {
      report.dehydration = gain("dehydration", DEHYDRATION_PER_DAY);
    }
    if (restProfile(race).needsSleep && !system.survival.sleptToday) {
      report.exhaustion = gain("exhaustion", EXHAUSTION_PER_DAY);
    }
    if (needed.foods > 1) notes.push(game.i18n.localize("FALLOUT.Rest.massExertion"));
  }

  // A day is long enough for any drink to have worn off.
  if (system.survival.drinkStage > 0) {
    updates["system.survival.drinkStage"] = 0;
    updates["system.survival.drinkProgress"] = 0;
    updates["system.survival.drinkHours"] = 0;
  }

  await actor.update(updates);
  // The Nightkin Stealth Field's use counter resets on the same day boundary
  // as the chem limit above (pg 12's "each day", pg 89's) — and only here.
  // Deliberately not the same clock as its 24-hour Perception decays, which
  // expire on their own. No-op for anyone without the flag.
  await resetStealthFieldUses(actor);
  const cleared = await clearConsumableEffects(actor);
  await advanceDiseases(actor, actor.system as CharacterData, 24);
  await advanceFuel(actor, actor.system as CharacterData, 24);

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: [
      game.i18n.localize("FALLOUT.Rest.dayPassed", {
        hunger: report.hunger,
        dehydration: report.dehydration,
        exhaustion: report.exhaustion,
        effects: cleared,
      }),
      ...notes,
    ].join("<br />"),
  });
  return report;
}

/** The ladder's own clock, burned down without resting (pg 82-83). */
export async function advanceDrinks(
  actor: FoundryActor,
  system: CharacterData,
  hours: number,
): Promise<number> {
  if (system.survival.drinkStage <= 0) return 0;
  const remaining = Math.max(0, system.survival.drinkHours - Math.max(0, hours));
  if (remaining > 0) {
    await actor.update({ "system.survival.drinkHours": remaining });
    return system.survival.drinkStage;
  }
  await actor.update({
    "system.survival.drinkStage": 0,
    "system.survival.drinkProgress": 0,
    "system.survival.drinkHours": 0,
  });
  return 0;
}

export { DRINK_STAGE_MAX };
