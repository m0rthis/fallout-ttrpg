/**
 * Hazardous Weather, Hazardous Environments, and irradiated zones
 * (v2.1 pg 121-124).
 *
 * Weather is ambient, so it is stored as a flag on the scene and read from
 * there; everything it does to a character is computed on demand. Time passes
 * only when a GM says it does — `tickEnvironment` advances a chosen number of
 * minutes and settles every consequence at once, rather than hooking world
 * time. That is deliberate: this system already learned the hard way that
 * racing Foundry's own clock-driven updates causes trouble
 * (docs/foundry-v14-notes.md), and a wasteland hour of weather is a GM beat,
 * not a background timer.
 */

import type { CharacterData } from "../data/character";
import { LETHAL_CONDITION_LEVEL, type LeveledCondition } from "../rules/constants";
import {
  EXPOSURE_RECOVERY_MINUTES,
  exposureLevels,
  HYPOTHERMIA_HEAT_RESCUE_DC,
  LIGHTNING_DAMAGE,
  LIGHTNING_INTERVAL_MINUTES,
  LIGHTNING_STRIKE_TOTAL,
  lightningFormula,
  NO_WEATHER,
  WEATHER,
  WEATHER_TYPES,
  weatherEffect,
  type WeatherEffect,
  type WeatherState,
  type WeatherType,
} from "../rules/weather";
import {
  HAZARDS,
  type HazardType,
  radiationSeverity,
  RADIATION_SEVERITY_MAX,
  zoneChecks,
} from "../rules/hazards";
import { gainRadiationLevels, rollRadiationCheck } from "./radiation";
import { advanceDiseases, contractDisease, contractRandomDisease } from "./diseases";

const SYSTEM_ID = "fallout-ttrpg";
const WEATHER_FLAG = "weather";

function isWeatherType(value: unknown): value is WeatherType {
  return typeof value === "string" && (WEATHER_TYPES as readonly string[]).includes(value);
}

/** The scene the GM is looking at, or the active one. Probed on 14.365. */
export function currentScene(): FoundryScene | null {
  const scenes = game.scenes;
  return scenes?.viewed ?? scenes?.current ?? scenes?.active ?? null;
}

/** Read the weather in force. A missing or malformed flag means clear skies. */
export function getWeather(scene: FoundryScene | null = currentScene()): WeatherState {
  if (!scene) return { ...NO_WEATHER };
  const raw = scene.getFlag(SYSTEM_ID, WEATHER_FLAG);
  if (typeof raw !== "object" || raw === null) return { ...NO_WEATHER };
  const record = raw as Partial<WeatherState>;
  if (!isWeatherType(record.type)) return { ...NO_WEATHER };
  return {
    type: record.type,
    severity: Math.max(0, Math.floor(record.severity ?? 0)),
    radSeverity: Math.min(RADIATION_SEVERITY_MAX, Math.max(0, Math.floor(record.radSeverity ?? 0))),
    linked: Math.max(0, Math.floor(record.linked ?? 0)),
  };
}

export async function setWeather(
  state: WeatherState,
  scene: FoundryScene | null = currentScene(),
): Promise<void> {
  if (!scene) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Weather.noScene"));
    return;
  }
  if (state.severity <= 0 && state.radSeverity <= 0) {
    await scene.unsetFlag(SYSTEM_ID, WEATHER_FLAG);
  } else {
    await scene.setFlag(SYSTEM_ID, WEATHER_FLAG, state);
  }
  await foundry.documents.ChatMessage.create({ content: describeWeather(state) });
}

/** A one-line readout for the sheet and chat. */
export function describeWeather(state: WeatherState): string {
  const effect = weatherEffect(state);
  if (!effect) {
    return state.radSeverity > 0
      ? game.i18n.localize("FALLOUT.Weather.zoneOnly", { level: state.radSeverity })
      : game.i18n.localize("FALLOUT.Weather.clear");
  }
  const parts = [
    game.i18n.localize("FALLOUT.Weather.headline", {
      type: game.i18n.localize(`FALLOUT.Weather.types.${effect.type}`),
      severity: effect.severity,
    }),
  ];
  if (effect.passiveSense !== 0) {
    parts.push(game.i18n.localize("FALLOUT.Weather.sense", { value: effect.passiveSense }));
  }
  if (effect.rangeMultiplier !== 1) {
    parts.push(
      game.i18n.localize("FALLOUT.Weather.range", {
        fraction: effect.rangeMultiplier === 0.5 ? "1/2" : "1/4",
      }),
    );
  }
  if (effect.blindBeyondFeet !== undefined) {
    parts.push(game.i18n.localize("FALLOUT.Weather.blind", { feet: effect.blindBeyondFeet }));
  }
  if (effect.obscuredBeyondFeet !== undefined) {
    parts.push(game.i18n.localize("FALLOUT.Weather.obscured", { feet: effect.obscuredBeyondFeet }));
  }
  if (effect.movementApPer5 !== undefined) {
    parts.push(game.i18n.localize("FALLOUT.Weather.movement", { ap: effect.movementApPer5 }));
  }
  if (effect.radSeverity > 0) {
    parts.push(game.i18n.localize("FALLOUT.Weather.zone", { level: effect.radSeverity }));
  }
  if (effect.soundDisadvantage) parts.push(game.i18n.localize("FALLOUT.Weather.sound"));
  return parts.join(" ");
}

/** Ranged weapon ranges shrink in bad weather (pg 121-123). */
export function rangeMultiplier(state: WeatherState = getWeather()): number {
  return weatherEffect(state)?.rangeMultiplier ?? 1;
}

/** AP to move five feet, when the weather makes it cost more (Dust Storm). */
export function movementApPer5(state: WeatherState = getWeather()): number {
  return weatherEffect(state)?.movementApPer5 ?? 1;
}

interface TickReport {
  minutes: number;
  gains: Partial<Record<LeveledCondition, number>>;
  lightningStrikes: number;
  zoneChecks: number;
  diseasesEnded: string[];
  died: boolean;
}

/**
 * Advance the clock for one character: exposure ticks from the weather, the
 * ten-minute lightning checks a storm demands, radiation zone re-checks at the
 * severity's cadence, and every disease clock.
 */
export async function tickEnvironment(
  actor: FoundryActor,
  system: CharacterData,
  minutes: number,
  state: WeatherState = getWeather(),
): Promise<TickReport> {
  const effect = weatherEffect(state);
  const report: TickReport = {
    minutes,
    gains: {},
    lightningStrikes: 0,
    zoneChecks: 0,
    diseasesEnded: [],
    died: false,
  };
  if (minutes <= 0) return report;

  // ------------------------------------------------------------- exposure
  const flags = system.environment;
  const endurance = system.derived.abilityScores.endurance;
  const rates = [effect?.exposure, effect?.coldTier?.exposure].filter(
    (rate) => rate !== undefined,
  );
  const updates: Record<string, unknown> = {};
  for (const rate of rates) {
    const levels = exposureLevels(rate, minutes, endurance, flags, system.conditions.dehydration);
    if (levels <= 0) continue;
    const condition = rate.condition;
    const current = (updates[`system.conditions.${condition}`] ??
      system.conditions[condition]) as number;
    const total = Math.min(LETHAL_CONDITION_LEVEL, current + levels);
    updates[`system.conditions.${condition}`] = total;
    report.gains[condition] = (report.gains[condition] ?? 0) + (total - current);
    // Hypothermia and Overheating both kill at the tenth level (pg 122-123).
    if (total >= LETHAL_CONDITION_LEVEL && condition !== "exhaustion") report.died = true;
  }
  if (Object.keys(updates).length > 0) await actor.update(updates);

  const notes: string[] = [];
  for (const [condition, levels] of Object.entries(report.gains)) {
    notes.push(
      game.i18n.localize("FALLOUT.Weather.gained", {
        levels,
        condition: game.i18n.localize(`FALLOUT.Conditions.${condition}`),
        minutes,
      }),
    );
  }
  if (report.died) notes.push(game.i18n.localize("FALLOUT.Weather.lethal"));
  if (notes.length > 0) {
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: notes.join("<br />"),
    });
  }

  // ------------------------------------------------------------- lightning
  const lightning = effect ? WEATHER[effect.type].lightning : undefined;
  if (lightning) {
    const rounds = Math.floor(minutes / LIGHTNING_INTERVAL_MINUTES);
    for (let i = 0; i < rounds; i++) {
      if (await rollLightningStrike(actor, actor.system as CharacterData, lightning)) {
        report.lightningStrikes += 1;
      }
    }
  }

  // ------------------------------------------------------------ radiation
  const zoneLevel = effect?.radSeverity ?? state.radSeverity;
  if (zoneLevel > 0) {
    report.zoneChecks = await runZoneChecks(
      actor,
      actor.system as CharacterData,
      zoneLevel,
      minutes,
    );
  }

  // -------------------------------------------------------------- disease
  report.diseasesEnded = await advanceDiseases(
    actor,
    actor.system as CharacterData,
    minutes / 60,
  );
  return report;
}

/**
 * The lightning strike check (pg 121). Ten minutes in a Thunderstorm or
 * Radstorm, `4d10` against half your Luck modifier, and 40 or more means it
 * found you: electricity (and, in a Radstorm, radiation) damage straight to
 * hit points, plus levels of Exhaustion and Rads.
 */
export async function rollLightningStrike(
  actor: FoundryActor,
  system: CharacterData,
  storm: "thunder" | "rad" = "thunder",
): Promise<boolean> {
  const roll = new foundry.dice.Roll(lightningFormula(system.derived.abilityMods.luck));
  await roll.evaluate();
  const struck = roll.total >= LIGHTNING_STRIKE_TOTAL;
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${game.i18n.localize("FALLOUT.Weather.lightningFlavor", {
      target: LIGHTNING_STRIKE_TOTAL,
    })} — ${game.i18n.localize(struck ? "FALLOUT.Weather.struck" : "FALLOUT.Weather.spared")}`,
  });
  if (!struck) return false;

  const profile = LIGHTNING_DAMAGE[storm];
  let total = 0;
  const formulas = [profile.electricity, profile.radiation].filter(Boolean);
  for (const formula of formulas) {
    const damage = new foundry.dice.Roll(formula);
    await damage.evaluate();
    total += damage.total;
    await damage.toMessage({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.localize("FALLOUT.Weather.lightningDamage"),
    });
  }

  // The book sends this damage straight to hit points, so it bypasses the
  // usual Stamina-then-DT pipeline entirely.
  const hp = Math.max(0, system.resources.hp.value - total);
  const exhaustion = Math.min(
    LETHAL_CONDITION_LEVEL,
    system.conditions.exhaustion + profile.exhaustion,
  );
  await actor.update({
    "system.resources.hp.value": hp,
    "system.conditions.exhaustion": exhaustion,
  });
  if (profile.rads > 0) {
    await gainRadiationLevels(actor, actor.system as CharacterData, profile.rads);
  }
  return true;
}

/**
 * Re-roll the Radiation DC as often as the zone's severity demands (pg 124).
 * Level 7 is a check every six seconds, which over any real span is hundreds
 * of rolls, so the count is capped and the cap is announced.
 */
export async function runZoneChecks(
  actor: FoundryActor,
  system: CharacterData,
  level: number,
  minutes: number,
): Promise<number> {
  const severity = radiationSeverity(level);
  if (!severity) return 0;
  if (system.derived.radiationDC === null) return 0;

  const { rolls, capped } = zoneChecks(level, minutes);
  if (rolls === 0) return 0;
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: game.i18n.localize(capped ? "FALLOUT.Radiation.zoneCapped" : "FALLOUT.Radiation.zone", {
      level,
      rolls,
      minutes,
    }),
  });
  for (let i = 0; i < rolls; i++) {
    await rollRadiationCheck(actor, actor.system as CharacterData);
  }
  return rolls;
}

/**
 * A hazardous environment check (pg 123).
 *
 * Water, Toxic Water and Frigid Water all demand a Rad Resist check — the roll
 * against your Radiation DC, which only Humans have, and which a gas mask
 * explicitly does not help with. Toxic Air is an Endurance check the mask does
 * help with, halving nothing but subtracting ten from the DC and blocking
 * disease outright. Ice is a flat Agility-or-Luck check after a long move.
 */
export async function rollHazardCheck(
  actor: FoundryActor,
  system: CharacterData,
  hazard: HazardType,
): Promise<boolean> {
  const definition = HAZARDS[hazard];
  const label = game.i18n.localize(`FALLOUT.Hazards.types.${hazard}`);
  const mask = system.environment.gasMask;

  let dc: number;
  let formula: string;
  if (definition.check === "radResist") {
    if (system.derived.radiationDC === null) {
      // Only Humans have a Radiation DC, and the book never says what anyone
      // else rolls here. Exempt, as in v2.0 — flagged as a GM call.
      ui.notifications.info(game.i18n.localize("FALLOUT.Radiation.immune"));
      return true;
    }
    dc = system.derived.radiationDC;
    formula = "1d20";
  } else if (definition.check === "endurance") {
    dc = (definition.dc ?? 18) - (mask ? (definition.gasMaskDcRelief ?? 0) : 0);
    formula = `1d20 + ${String(system.derived.abilityMods.endurance)}`;
  } else {
    // Ice: "an Agility or Luck check", so take the better of the two.
    const best = Math.max(system.derived.abilityMods.agility, system.derived.abilityMods.luck);
    dc = definition.dc ?? 18;
    formula = `1d20 + ${String(best)}`;
  }

  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();
  const natural = roll.dice[0]?.results.find((result) => result.active)?.result ?? 0;
  const passed = roll.total >= dc;
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${game.i18n.localize("FALLOUT.Hazards.flavor", { hazard: label, dc })} — ${game.i18n.localize(
      passed ? "FALLOUT.Hazards.passed" : "FALLOUT.Hazards.failed",
    )}`,
  });

  if (!passed) {
    if (definition.failure === "rads") {
      await gainRadiationLevels(actor, actor.system as CharacterData, 1);
    } else if (definition.failure === "exhaustion") {
      const exhaustion = Math.min(LETHAL_CONDITION_LEVEL, system.conditions.exhaustion + 1);
      await actor.update({ "system.conditions.exhaustion": exhaustion });
      await foundry.documents.ChatMessage.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        content: game.i18n.localize("FALLOUT.Hazards.exhausted", { levels: exhaustion }),
      });
    } else {
      await actor.toggleStatusEffect("prone", { active: true });
    }
  }

  // Disease is rolled off the natural die, not the total, and a gas mask stops
  // it only where the book says it does — never in the water.
  const blocked = mask && definition.gasMaskBlocksDisease;
  if (!blocked) {
    const specific = definition.diseaseBelow;
    if (specific && natural <= specific.roll) {
      await contractDisease(actor, actor.system as CharacterData, specific.disease);
    } else if (
      definition.randomDiseaseAtOrBelow !== undefined &&
      natural <= definition.randomDiseaseAtOrBelow
    ) {
      await contractRandomDisease(actor, actor.system as CharacterData);
    }
  }
  return passed;
}

/**
 * Frigid water (pg 123): you may swim for as many minutes as your Endurance
 * score, and every minute past that is a level of Hypothermia.
 */
export async function frigidWaterExposure(
  actor: FoundryActor,
  system: CharacterData,
  minutes: number,
): Promise<number> {
  const tolerated = system.derived.abilityScores.endurance;
  const over = Math.max(0, minutes - tolerated);
  if (over === 0) return 0;
  const levels = Math.min(
    LETHAL_CONDITION_LEVEL,
    system.conditions.hypothermia + over,
  );
  await actor.update({ "system.conditions.hypothermia": levels });
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: game.i18n.localize("FALLOUT.Hazards.frigid", {
      minutes: over,
      tolerated,
      levels,
    }),
  });
  return over;
}

/**
 * Shed Hypothermia or Overheating: a level per hour in shelter with the right
 * source, or anywhere the extreme no longer reaches (pg 122-123).
 *
 * Warming out of Hypothermia *with Extreme Heat* costs a DC 20 Endurance check
 * at the end of each hour, or you die — the one rule in this chapter that can
 * kill you while you are recovering.
 */
export async function recoverExposure(
  actor: FoundryActor,
  system: CharacterData,
  condition: "hypothermia" | "overheating",
  minutes: number,
  viaExtremeHeat = false,
): Promise<number> {
  const hours = Math.floor(minutes / EXPOSURE_RECOVERY_MINUTES);
  if (hours <= 0) return 0;
  const removed = Math.min(hours, system.conditions[condition]);
  if (removed <= 0) return 0;

  await actor.update({
    [`system.conditions.${condition}`]: system.conditions[condition] - removed,
  });
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: game.i18n.localize("FALLOUT.Weather.recovered", {
      levels: removed,
      condition: game.i18n.localize(`FALLOUT.Conditions.${condition}`),
    }),
  });

  if (condition === "hypothermia" && viaExtremeHeat) {
    for (let i = 0; i < removed; i++) {
      const roll = new foundry.dice.Roll(
        `1d20 + ${String(system.derived.abilityMods.endurance)}`,
      );
      await roll.evaluate();
      const survived = roll.total >= HYPOTHERMIA_HEAT_RESCUE_DC;
      await roll.toMessage({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        flavor: `${game.i18n.localize("FALLOUT.Weather.heatRescue", {
          dc: HYPOTHERMIA_HEAT_RESCUE_DC,
        })} — ${game.i18n.localize(survived ? "FALLOUT.Weather.survived" : "FALLOUT.Weather.diedWarming")}`,
      });
      if (!survived) break;
    }
  }
  return removed;
}

export type { WeatherEffect, WeatherState };
