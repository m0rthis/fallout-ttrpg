/**
 * Vision and Light, and Flames as a spreading area (v2.1 pg 118-119) — the
 * half that writes documents.
 *
 * ## What changed since the roadmap deferred this
 *
 * Section B of `docs/ROADMAP.md` records vision cutoffs as *reported, not
 * enforced*, on the grounds that "mapping 'blind beyond 40 ft' onto Foundry's
 * detection modes needs token-level vision overrides, which is a bigger job
 * than the rest of the chapter combined." Probed against 14.365, that is no
 * longer true, and the reason it looked true is worth writing down:
 *
 * - `TokenDocument#detectionModes` is a **`TypedObjectField` keyed by mode id**
 *   in v14 — `{basicSight: {enabled, range}, …}`. Every pre-v14 example writes
 *   it as an *array* of `{id, enabled, range}`, and an array is silently
 *   cleaned away to `{}` with no error and no warning. That is the whole trap.
 * - Range is in **scene distance units**, not pixels: core's
 *   `DetectionMode#_testRange` converts with `getLightRadius(mode.range)`. So
 *   "blind beyond 40 ft" is literally `range: 40`.
 * - The cutoff has to cap **`lightPerception` as well as `basicSight`**.
 *   `TokenDocument#_prepareDetectionModes` defaults `lightPerception` to
 *   `{enabled: true, range: Infinity}` whenever sight is enabled, so capping
 *   only `basicSight` leaves any *lit* target visible at any distance — which
 *   is exactly the case a dust storm is supposed to hide.
 *
 * So this file enforces the cutoffs. What it does **not** do is enforce them
 * behind anyone's back: like the weather tick and the situational-effect sync,
 * it is a control a person presses. Nothing here hooks a document write, a
 * canvas refresh or the world clock — the shape that produced this project's
 * one production bug (see `docs/foundry-v14-notes.md`).
 *
 * Every write is reversible. `applyVisionCutoffs` snapshots each token's
 * *authored* vision (`_source`, not the prepared values core fills in) into a
 * flag, and `clearVisionCutoffs` puts it back exactly, deleting the keys this
 * system added so core recomputes its own defaults.
 */

import { applyDamage } from "../combat/damage";
import { SYSTEM_ID } from "../rules/effects";
import {
  FLAME_DAMAGE_TYPE,
  type FlameArea,
  flameDamageFormula,
  flameRadiusFeet,
  type LightLevel,
  LIGHT_LEVELS,
  NEW_FLAME_AREA,
  NO_SENSES,
  type Obscurement,
  obscurementEffect,
  perceivedObscurement,
  type Senses,
  spreadFlames,
  visionRanges,
} from "../rules/light";
import { weatherEffect } from "../rules/weather";
import { currentScene, getWeather } from "./environment";

const LIGHT_FLAG = "light";
const SENSES_FLAG = "senses";
const VISION_FLAG = "visionBefore";
const FLAMES_FLAG = "flames";

/**
 * The slice of a v14 `TokenDocument` this file touches. Declared here rather
 * than in `src/types/foundry.d.ts` because it is the only consumer; every
 * field was read off the running client on 14.365.
 *
 * `_source` is the authored data, before `prepareBaseData` fills in
 * `lightPerception`/`basicSight` and turns a null sight range into Infinity.
 * Snapshotting the prepared values instead would make "restore" write core's
 * defaults back as if a person had chosen them.
 */
interface VisionToken {
  readonly id: string;
  readonly name: string;
  readonly actor: FoundryActor | null;
  readonly sight: { readonly enabled: boolean; readonly range: number | null };
  readonly _source: {
    readonly sight: { readonly range: number | null };
    readonly detectionModes: Readonly<
      Record<string, { readonly enabled: boolean; readonly range: number | null }>
    >;
  };
  getFlag(scope: string, key: string): unknown;
}

/**
 * The slice of a v14 `RegionDocument` the flames use.
 *
 * Exported as a type only, so a caller that has a region in hand — the sheet
 * panel, a macro — can name what `flameRegions()` handed it and pass it back to
 * `flameAreaOf` or `extinguishFlames` without widening anything.
 */
export interface FlameRegion {
  readonly id: string;
  readonly name: string;
  /** Token documents core reports as standing inside the region. */
  readonly tokens: Iterable<VisionToken>;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
  delete(): Promise<unknown>;
}

/** The scene surface this file needs, beyond the declared `FoundryScene`. */
interface LightScene extends FoundryScene {
  readonly grid: { readonly size: number; readonly distance: number };
  readonly environment: {
    readonly darknessLevel: number;
    readonly globalLight: { readonly enabled: boolean; readonly bright: boolean };
  };
  readonly tokens: FoundryCollection<VisionToken>;
  readonly regions: FoundryCollection<FlameRegion>;
  createEmbeddedDocuments(
    embeddedName: "Region" | "AmbientLight",
    data: object[],
  ): Promise<{ id: string }[]>;
  updateEmbeddedDocuments(
    embeddedName: "Token" | "Region" | "AmbientLight",
    updates: object[],
  ): Promise<unknown>;
  deleteEmbeddedDocuments(embeddedName: "AmbientLight", ids: string[]): Promise<unknown>;
}

function asLightScene(scene: FoundryScene | null): LightScene | null {
  return scene as unknown as LightScene | null;
}

// -------------------------------------------------------------- scene light

function isLightLevel(value: unknown): value is LightLevel {
  return typeof value === "string" && (LIGHT_LEVELS as readonly string[]).includes(value);
}

/**
 * The light level in force. Absent flag means bright — pg 118's "even gloomy
 * days provide bright light" makes that the right default for an outdoor
 * wasteland, and it is also the level at which nothing in this chapter applies.
 */
export function getSceneLight(scene: FoundryScene | null = currentScene()): LightLevel {
  const raw = scene?.getFlag(SYSTEM_ID, LIGHT_FLAG);
  return isLightLevel(raw) ? raw : "bright";
}

/**
 * Set the scene's illumination (pg 118-119) and paint it onto the canvas.
 *
 * The canvas mapping, all three knobs probed on 14.365:
 *
 * - **bright** — `globalLight.enabled: true`, `globalLight.bright: true`,
 *   darkness 0. Everything is lit; nothing is obscured.
 * - **dim** — `globalLight.enabled: true`, `globalLight.bright: false`. This is
 *   the one setting most systems miss: global light has a *bright* boolean, and
 *   with it false the whole scene is globally lit at dim intensity, which is
 *   precisely "dim light creates a lightly obscured area".
 * - **darkness** — `globalLight.enabled: false`, darkness 1. Only placed lights
 *   and token vision reach anything.
 *
 * The darkness *level* is a rendering figure, not a rule: the book has three
 * named categories and no continuum, so these are the three the categories map
 * to and nothing reads them back as a rule input.
 */
export async function setSceneLight(
  level: LightLevel,
  scene: FoundryScene | null = currentScene(),
): Promise<void> {
  const target = asLightScene(scene);
  if (!target) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Light.noScene"));
    return;
  }
  const environment =
    level === "bright"
      ? { "environment.globalLight.enabled": true, "environment.globalLight.bright": true, "environment.darknessLevel": 0 }
      : level === "dim"
        ? { "environment.globalLight.enabled": true, "environment.globalLight.bright": false, "environment.darknessLevel": 0 }
        : { "environment.globalLight.enabled": false, "environment.darknessLevel": 1 };

  await target.update(environment);
  if (level === "bright") await target.unsetFlag(SYSTEM_ID, LIGHT_FLAG);
  else await target.setFlag(SYSTEM_ID, LIGHT_FLAG, level);

  await foundry.documents.ChatMessage.create({ content: describeLight(level) });
}

/** A one-line readout of a light level and what it costs. */
export function describeLight(level: LightLevel): string {
  const label = game.i18n.localize(`FALLOUT.Light.levels.${level}`);
  const key =
    level === "bright" ? "brightNote" : level === "dim" ? "dimNote" : "darknessNote";
  return game.i18n.localize(`FALLOUT.Light.${key}`, { level: label });
}

// ------------------------------------------------------------------- senses

/**
 * Blindsight and Nightvision ranges, in feet (pg 119).
 *
 * Stored as an **actor flag** rather than a schema field, deliberately and with
 * a known cost: `src/data/character.ts` is where these belong, and a
 * `NumberField` pair there would be validated, sheet-editable and reachable by
 * an Active Effect (so a perk or a Power Armor sensor could grant nightvision
 * the way the Sensor Array already grants passive sense). A flag is none of
 * those things. It is used here because it needs no migration and no schema
 * change, and because the book gives neither sense a default value that a
 * schema would have to invent. Promoting it is listed as an integration point.
 */
export function getSenses(actor: FoundryActor): Senses {
  const raw = actor.getFlag(SYSTEM_ID, SENSES_FLAG);
  if (typeof raw !== "object" || raw === null) return { ...NO_SENSES };
  const record = raw as Partial<Senses>;
  return {
    blindsight: Math.max(0, Math.floor(record.blindsight ?? 0)),
    nightvision: Math.max(0, Math.floor(record.nightvision ?? 0)),
  };
}

export async function setSenses(actor: FoundryActor, senses: Senses): Promise<void> {
  if (senses.blindsight <= 0 && senses.nightvision <= 0) {
    await actor.unsetFlag(SYSTEM_ID, SENSES_FLAG);
    return;
  }
  await actor.setFlag(SYSTEM_ID, SENSES_FLAG, {
    blindsight: Math.max(0, Math.floor(senses.blindsight)),
    nightvision: Math.max(0, Math.floor(senses.nightvision)),
  });
}

// ------------------------------------------------- the obscurement readout

/**
 * The distance bands the weather in force imposes, if any.
 *
 * Read straight off the weather layer rather than restated: Fog, Blizzard and
 * Dust Storm already carry `obscuredBeyondFeet` and `blindBeyondFeet` in
 * `src/rules/weather.ts`, and duplicating those tables here is how they drift
 * apart.
 */
export function weatherBands(scene: FoundryScene | null = currentScene()): {
  obscuredBeyondFeet?: number;
  blindBeyondFeet?: number;
} {
  const effect = weatherEffect(getWeather(scene));
  if (!effect) return {};
  const bands: { obscuredBeyondFeet?: number; blindBeyondFeet?: number } = {};
  if (effect.obscuredBeyondFeet !== undefined) bands.obscuredBeyondFeet = effect.obscuredBeyondFeet;
  if (effect.blindBeyondFeet !== undefined) bands.blindBeyondFeet = effect.blindBeyondFeet;
  return bands;
}

/**
 * How obscured something is at a distance, for this creature, right now — the
 * reporting layer, and the thing a GM actually asks at the table.
 */
export function obscurementAt(
  actor: FoundryActor,
  distanceFeet: number,
  scene: FoundryScene | null = currentScene(),
): Obscurement {
  return perceivedObscurement(distanceFeet, getSceneLight(scene), getSenses(actor), weatherBands(scene));
}

/** That answer as a sentence, with the penalties it carries spelled out. */
export function describeObscurement(
  actor: FoundryActor,
  distanceFeet: number,
  scene: FoundryScene | null = currentScene(),
): string {
  const obscurement = obscurementAt(actor, distanceFeet, scene);
  const effect = obscurementEffect(obscurement);
  const senses = getSenses(actor);

  const parts = [
    game.i18n.localize(`FALLOUT.Light.obscured.${obscurement}`, { feet: distanceFeet }),
  ];
  if (effect.blinded) parts.push(game.i18n.localize("FALLOUT.Light.blindedNote"));
  if (effect.passiveSense !== undefined) {
    parts.push(
      game.i18n.localize("FALLOUT.Light.lightNote", {
        sense: effect.passiveSense,
        fraction: "1/2",
      }),
    );
  }
  if (senses.blindsight > 0 && distanceFeet <= senses.blindsight) {
    parts.push(game.i18n.localize("FALLOUT.Light.blindsightNote", { feet: senses.blindsight }));
  } else if (senses.nightvision > 0 && getSceneLight(scene) === "darkness") {
    parts.push(game.i18n.localize("FALLOUT.Light.nightvisionNote", { feet: senses.nightvision }));
  }
  return parts.join(" ");
}

/**
 * That same sentence, said out loud in the creature's voice.
 *
 * The posting counterpart every other chapter in this system has (`say` in
 * `actions/movement.ts`, `card` in `actions/progression.ts`) and this one did
 * not: the sheet panel was calling `ChatMessage.create` itself, which made it
 * the only panel in the system writing a document directly. Chat cards are
 * documents, and documents are this layer's job.
 *
 * It composes nothing of its own — the string is `describeObscurement`'s, so
 * the sheet row and the card it posts can never drift apart — and it returns
 * the string it posted so a caller can assert on it.
 */
export async function reportObscurement(
  actor: FoundryActor,
  distanceFeet: number,
  scene: FoundryScene | null = currentScene(),
): Promise<string> {
  const content = describeObscurement(actor, distanceFeet, scene);
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content,
  });
  return content;
}

// ------------------------------------------------------- the vision cutoffs

interface VisionSnapshot {
  sightRange: number | null;
  detectionModes: Record<string, { enabled: boolean; range: number | null }>;
}

function snapshotOf(token: VisionToken): VisionSnapshot {
  const modes: Record<string, { enabled: boolean; range: number | null }> = {};
  for (const [key, mode] of Object.entries(token._source.detectionModes)) {
    modes[key] = { enabled: mode.enabled, range: mode.range };
  }
  return { sightRange: token._source.sight.range, detectionModes: modes };
}

function readSnapshot(token: VisionToken): VisionSnapshot | null {
  const raw = token.getFlag(SYSTEM_ID, VISION_FLAG);
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Partial<VisionSnapshot>;
  return {
    sightRange: typeof record.sightRange === "number" ? record.sightRange : null,
    detectionModes: record.detectionModes ?? {},
  };
}

/** Whether the scene's tokens are currently carrying this system's overrides. */
export function visionCutoffsApplied(scene: FoundryScene | null = currentScene()): boolean {
  const target = asLightScene(scene);
  if (!target) return false;
  return target.tokens.contents.some((token) => readSnapshot(token) !== null);
}

interface CutoffReport {
  /** Token names whose vision was narrowed. */
  capped: string[];
  /** The cutoff in feet, or null where vision is unlimited. */
  cutoffFeet: number | null;
  level: LightLevel;
}

/**
 * Push the chapter's cutoffs onto every token on the scene.
 *
 * For each token: `sight.range` and the `basicSight` and `lightPerception`
 * detection modes are set from `visionRanges()` — the pure computation of what
 * this creature can perceive under this light with these senses and whatever
 * bands the weather imposes. A creature with nightvision keeps its range in the
 * dark and is switched to the `darkvision` vision mode, whose shipped defaults
 * include `saturation: -1` — greyscale, which is what pg 119 asks for in so
 * many words ("can't discern color in darkness, only shades of gray").
 *
 * The token's authored vision goes into a flag first, so `clearVisionCutoffs`
 * is exact rather than approximate.
 *
 * **Blindsight is not written here.** Core ships no detection mode that means
 * it: `feelTremor` only finds things on the ground, `senseAll` sees straight
 * through walls, and `seeAll` is sight-typed and so switches off when its owner
 * is Blinded — the one creature blindsight exists for. Registering a correct
 * one is a `CONFIG.Canvas.detectionModes` entry made at `init`, which is
 * `src/fallout.ts`; `blindsightModeConfig()` below is the piece that belongs to
 * this chapter, and the wiring is an integration point.
 */
export async function applyVisionCutoffs(
  scene: FoundryScene | null = currentScene(),
): Promise<CutoffReport> {
  const level = getSceneLight(scene);
  const report: CutoffReport = { capped: [], cutoffFeet: null, level };
  const target = asLightScene(scene);
  if (!target) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Light.noScene"));
    return report;
  }
  const bands = weatherBands(scene);
  report.cutoffFeet = bands.blindBeyondFeet ?? null;

  const updates: Record<string, unknown>[] = [];
  for (const token of target.tokens) {
    const senses = token.actor ? getSenses(token.actor) : { ...NO_SENSES };
    const ranges = visionRanges(senses, level, bands);

    // A token whose vision was never switched on is a prop, not a creature.
    if (!token.sight.enabled) continue;

    const update: Record<string, unknown> = {
      _id: token.id,
      "sight.range": ranges.sightFeet,
      detectionModes: {
        // null is core's "unlimited"; a finite number is a hard cutoff.
        basicSight: { enabled: true, range: ranges.sightFeet },
        lightPerception: { enabled: true, range: ranges.lightPerceptionFeet },
      },
      "sight.visionMode": ranges.monochromeInDarkness ? "darkvision" : "basic",
      "sight.saturation": ranges.monochromeInDarkness ? -1 : 0,
    };
    // Only snapshot the first time, or a second press would overwrite the
    // restore point with this system's own overrides.
    if (readSnapshot(token) === null) {
      update[`flags.${SYSTEM_ID}.${VISION_FLAG}`] = snapshotOf(token);
    }
    updates.push(update);
    report.capped.push(token.name);
  }

  if (updates.length > 0) await target.updateEmbeddedDocuments("Token", updates);
  await foundry.documents.ChatMessage.create({
    content:
      updates.length === 0
        ? game.i18n.localize("FALLOUT.Light.noTokens")
        : game.i18n.localize("FALLOUT.Light.applied", {
            count: updates.length,
            level: game.i18n.localize(`FALLOUT.Light.levels.${level}`),
            cutoff:
              report.cutoffFeet === null
                ? game.i18n.localize("FALLOUT.Light.noCutoff")
                : game.i18n.localize("FALLOUT.Light.cutoff", { feet: report.cutoffFeet }),
          }),
  });
  return report;
}

/**
 * Put every token's vision back exactly as it was authored.
 *
 * Detection-mode keys this system added are deleted with the `-=key` syntax so
 * core recomputes its own defaults for them (probed: `basicSight` returns to
 * tracking `sight.range`, `lightPerception` returns to unlimited); keys that
 * were in the snapshot are written back verbatim.
 */
export async function clearVisionCutoffs(
  scene: FoundryScene | null = currentScene(),
): Promise<string[]> {
  const target = asLightScene(scene);
  if (!target) return [];
  const restored: string[] = [];
  const updates: Record<string, unknown>[] = [];

  for (const token of target.tokens) {
    const snapshot = readSnapshot(token);
    if (!snapshot) continue;
    const modes: Record<string, unknown> = {};
    for (const key of Object.keys(token._source.detectionModes)) {
      if (!(key in snapshot.detectionModes)) modes[`-=${key}`] = null;
    }
    Object.assign(modes, snapshot.detectionModes);
    updates.push({
      _id: token.id,
      "sight.range": snapshot.sightRange,
      "sight.visionMode": "basic",
      "sight.saturation": 0,
      detectionModes: modes,
      [`flags.${SYSTEM_ID}.-=${VISION_FLAG}`]: null,
    });
    restored.push(token.name);
  }

  if (updates.length > 0) await target.updateEmbeddedDocuments("Token", updates);
  await foundry.documents.ChatMessage.create({
    content:
      restored.length === 0
        ? game.i18n.localize("FALLOUT.Light.nothingToClear")
        : game.i18n.localize("FALLOUT.Light.cleared", { count: restored.length }),
  });
  return restored;
}

/**
 * The detection mode Blindsight (pg 119) needs, for whoever registers it at
 * `init`.
 *
 * Core's `DetectionMode` is subclassable and `CONFIG.Canvas.detectionModes` is
 * writable at runtime — both confirmed on 14.365, with a token round-tripping a
 * custom mode id. The two settings that matter, read off core's own
 * `_canDetect` implementations:
 *
 * - `type: OTHER` (3), **not** `SIGHT`. Every sight-typed mode begins
 *   `if (isSight && src.hasStatusEffect(CONFIG.specialStatusEffects.BLIND))
 *   return false`, which would switch blindsight off for exactly the creature
 *   the book invented it for.
 * - `walls: true`. Blindsight perceives "its surroundings", not the next room;
 *   core's `senseAll` sets `walls: false` and sees through everything.
 *
 * An override of `_canDetect` returning `true` unconditionally is also needed:
 * the base implementation refuses when `walls && visionSource.blinded.darkness`,
 * and a sense that does not rely on sight should not care about darkness.
 *
 * Returned as data rather than registered here, because registration belongs in
 * the `init` hook and this file must not own one.
 */
export function blindsightModeConfig(): {
  id: string;
  label: string;
  /** `DetectionMode.DETECTION_TYPES.OTHER`. */
  type: number;
  walls: boolean;
  angle: boolean;
  tokenConfig: boolean;
} {
  return {
    id: "falloutBlindsight",
    label: "FALLOUT.Light.blindsight",
    type: 3,
    walls: true,
    angle: false,
    tokenConfig: true,
  };
}

// -------------------------------------------------------------------- flames

function feetToPixels(scene: LightScene, feet: number): number {
  const distance = scene.grid.distance || 5;
  return (feet / distance) * scene.grid.size;
}

/**
 * The `FlameArea` a burning region is carrying, parsed and clamped.
 *
 * Public because the flag key and this parsing are the *only* way to get a
 * fire's radius, damage formula and rounds back out of a region, and a caller
 * that wants to display them — the sheet panel does — would otherwise have to
 * duplicate `FLAMES_FLAG` and re-derive the shape, which is the coupling that
 * rots the moment either changes. Everything downstream of it is pure:
 * `flameRadiusFeet`, `flameDamageFormula` and `roundsToNextFlameDie` in
 * `src/rules/light.ts` take the returned area and this file adds nothing.
 *
 * A region with no flag at all (or a malformed one) reads as a fresh area
 * rather than throwing, for the same reason `getSenses` does: a flag is not a
 * schema and nothing validates what is in it.
 */
export function flameAreaOf(region: FlameRegion): FlameArea {
  const raw = region.getFlag(SYSTEM_ID, FLAMES_FLAG);
  if (typeof raw !== "object" || raw === null) return { ...NEW_FLAME_AREA };
  const record = raw as Partial<FlameArea> & { lightId?: string };
  return {
    originRadiusFeet: Math.max(0, record.originRadiusFeet ?? NEW_FLAME_AREA.originRadiusFeet),
    rounds: Math.max(0, Math.floor(record.rounds ?? 0)),
    spreadFeetPerRound: Math.max(0, record.spreadFeetPerRound ?? NEW_FLAME_AREA.spreadFeetPerRound),
  };
}

function readLightId(region: FlameRegion): string | null {
  const raw = region.getFlag(SYSTEM_ID, FLAMES_FLAG);
  if (typeof raw !== "object" || raw === null) return null;
  const id = (raw as { lightId?: unknown }).lightId;
  return typeof id === "string" ? id : null;
}

/** Every burning area on the scene. */
export function flameRegions(scene: FoundryScene | null = currentScene()): FlameRegion[] {
  const target = asLightScene(scene);
  if (!target) return [];
  return target.regions.contents.filter(
    (region) => region.getFlag(SYSTEM_ID, FLAMES_FLAG) !== undefined,
  );
}

/**
 * Light a fire (pg 118) — "via a flamer, incendiary grenade, or a rogue flare".
 *
 * Modelled as a scene **Region**, not a MeasuredTemplate. Two reasons, both
 * probed: a Region's circle shape can be resized in place, which is what a
 * spreading fire does every round (a MeasuredTemplate's `distance` silently
 * refused to update on 14.365 — the write was accepted and the value did not
 * change), and a Region reports the tokens standing inside it through
 * `region.tokens`, which is how the fire finds who it burns without this system
 * doing any geometry of its own.
 *
 * An AmbientLight rides along, because pg 118 lists fires among the things that
 * "provide bright light […] within a specific radius". The radius is not
 * printed anywhere, so it is the fire's own extent — a ruling, and a visual
 * one: nothing reads it back as a rule input.
 */
export async function igniteFlames(
  x: number,
  y: number,
  area: FlameArea = NEW_FLAME_AREA,
  scene: FoundryScene | null = currentScene(),
): Promise<FlameRegion | null> {
  const target = asLightScene(scene);
  if (!target) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Light.noScene"));
    return null;
  }
  const radiusFeet = flameRadiusFeet(area);
  const [light] = await target.createEmbeddedDocuments("AmbientLight", [
    {
      x,
      y,
      config: {
        bright: radiusFeet,
        dim: radiusFeet * 2,
        color: "#ff9329",
        animation: { type: "torch" },
      },
    },
  ]);
  const [region] = await target.createEmbeddedDocuments("Region", [
    {
      name: game.i18n.localize("FALLOUT.Light.flamesName", { feet: radiusFeet }),
      color: "#ff6600",
      shapes: [{ type: "circle", x, y, radius: feetToPixels(target, radiusFeet) }],
      flags: { [SYSTEM_ID]: { [FLAMES_FLAG]: { ...area, lightId: light?.id ?? null } } },
    },
  ]);

  await foundry.documents.ChatMessage.create({
    content: describeFlames(area),
  });
  return (region as unknown as FlameRegion | undefined) ?? null;
}

/** A readout of what an area does right now, and how fast it is growing. */
export function describeFlames(area: FlameArea): string {
  return game.i18n.localize("FALLOUT.Light.flames", {
    radius: flameRadiusFeet(area),
    formula: flameDamageFormula(area),
    spread: area.spreadFeetPerRound,
  });
}

/**
 * Advance every fire on the scene by one round (pg 118): "At the start of each
 * round, the flaming area spreads 5 feet in all directions."
 *
 * GM-pressed rather than hooked to the combat round, for the reason the book
 * itself gives two sentences later: *"The spread of the flames is up to GM's
 * discretion. There are factors that could allow flames to spread slower, such
 * as winds, rain, or if the flames are surrounded by non-flammable objects."*
 * A fire that grew itself on a hook would be enforcing a rate the book
 * explicitly declines to fix.
 */
export async function spreadFlameAreas(
  scene: FoundryScene | null = currentScene(),
): Promise<number> {
  const target = asLightScene(scene);
  if (!target) return 0;
  const regions = flameRegions(scene);
  if (regions.length === 0) return 0;

  const regionUpdates: Record<string, unknown>[] = [];
  const lightUpdates: Record<string, unknown>[] = [];
  const notes: string[] = [];

  for (const region of regions) {
    const grown = spreadFlames(flameAreaOf(region));
    const radiusFeet = flameRadiusFeet(grown);
    const shape = (region as unknown as { shapes: readonly { x: number; y: number }[] }).shapes[0];
    if (!shape) continue;
    regionUpdates.push({
      _id: region.id,
      name: game.i18n.localize("FALLOUT.Light.flamesName", { feet: radiusFeet }),
      shapes: [{ type: "circle", x: shape.x, y: shape.y, radius: feetToPixels(target, radiusFeet) }],
      [`flags.${SYSTEM_ID}.${FLAMES_FLAG}`]: { ...grown, lightId: readLightId(region) },
    });
    const lightId = readLightId(region);
    if (lightId !== null) {
      lightUpdates.push({ _id: lightId, "config.bright": radiusFeet, "config.dim": radiusFeet * 2 });
    }
    notes.push(describeFlames(grown));
  }

  if (regionUpdates.length > 0) await target.updateEmbeddedDocuments("Region", regionUpdates);
  if (lightUpdates.length > 0) await target.updateEmbeddedDocuments("AmbientLight", lightUpdates);
  if (notes.length > 0) {
    await foundry.documents.ChatMessage.create({ content: notes.join("<br />") });
  }
  return regionUpdates.length;
}

interface BurnResult {
  token: string;
  dice: string;
  damage: number;
}

/**
 * Burn everything standing in the flames (pg 118): "any creature who moves
 * through the area or starts their turn in the area takes 2d10 fire damage and
 * gains Burning."
 *
 * **Ruled: once per press, per creature.** The book names two triggers — moving
 * through and starting a turn in it — and never says whether a creature that
 * does both takes the damage twice, nor whether crossing a larger area costs
 * more than crossing a small one. Charging once is the reading that leaves the
 * GM in control of how often it is called; charging twice would be inventing a
 * rule, and this is a button, so the GM decides how many times it is pressed.
 *
 * The damage is `fire`, so a creature's fire resistance or vulnerability is
 * consulted by the damage pipeline exactly as for any other fire source, and
 * the Burning status is toggled on afterwards.
 */
export async function burnFlameOccupants(
  scene: FoundryScene | null = currentScene(),
): Promise<BurnResult[]> {
  const results: BurnResult[] = [];
  for (const region of flameRegions(scene)) {
    const area = flameAreaOf(region);
    const formula = flameDamageFormula(area);
    for (const token of region.tokens) {
      const actor = token.actor;
      if (!actor) continue;
      const roll = new foundry.dice.Roll(formula);
      await roll.evaluate();
      await roll.toMessage({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        flavor: game.i18n.localize("FALLOUT.Light.flamesDamage", {
          radius: flameRadiusFeet(area),
          formula,
        }),
      });
      await applyDamage(actor, roll.total, FLAME_DAMAGE_TYPE);
      await actor.toggleStatusEffect("burning", { active: true });
      results.push({ token: token.name, dice: formula, damage: roll.total });
    }
  }
  if (results.length === 0) {
    await foundry.documents.ChatMessage.create({
      content: game.i18n.localize("FALLOUT.Light.noOneBurning"),
    });
  }
  return results;
}

/**
 * Put a fire out (pg 118): "unless put out via water, weapons that deal cryo
 * damage, or a fire extinguisher."
 *
 * The book gives no DC, no quantity of water and no action cost for any of the
 * three, so this takes the means as a label for the chat card and does not roll
 * anything. Inventing a check here would be inventing a rule.
 */
export async function extinguishFlames(
  region: FlameRegion,
  means: string,
  scene: FoundryScene | null = currentScene(),
): Promise<void> {
  const target = asLightScene(scene);
  const lightId = readLightId(region);
  if (target && lightId !== null) {
    await target.deleteEmbeddedDocuments("AmbientLight", [lightId]).catch(() => undefined);
  }
  await region.delete();
  await foundry.documents.ChatMessage.create({
    content: game.i18n.localize("FALLOUT.Light.extinguished", {
      means: game.i18n.localize(`FALLOUT.Light.extinguishers.${means}`),
    }),
  });
}

/** Put every fire on the scene out at once. */
export async function extinguishAllFlames(
  means: string,
  scene: FoundryScene | null = currentScene(),
): Promise<number> {
  const regions = flameRegions(scene);
  for (const region of regions) await extinguishFlames(region, means, scene);
  return regions.length;
}
