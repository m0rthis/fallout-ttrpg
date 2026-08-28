/**
 * Sheet panel: Vision & Light, and Flames as a spreading area (pg 118-119).
 *
 * Contract in `src/sheets/panel-registry.ts`; `src/sheets/panels/medical.ts` is
 * the reference implementation and this file is built to its shape — actions,
 * context and a partial here, nothing else touched.
 *
 * **No rules are written here.** Every number, every ruling and every document
 * write already exists in `src/rules/light.ts` (pure) and `src/actions/light.ts`
 * (documents). This file is the set of buttons that press them, plus the
 * readout of what is already true. If a figure in this panel looks wrong, the
 * fix is in one of those two files, not this one.
 *
 * ## Three shapes this panel deliberately keeps
 *
 * 1. **Nothing here hooks anything.** `src/actions/situations.ts` explains at
 *    length why this system never writes documents in response to document
 *    writes; the flames do not spread on a combat-round hook and the cutoffs do
 *    not re-apply when the weather changes. A person presses a button, which is
 *    also what pg 118 asks for in so many words: *"The spread of the flames is
 *    up to GM's discretion."*
 * 2. **AP is reported, never deducted** (roadmap item 14). The only AP figure
 *    this chapter carries is Burning's — pg 133, *"They can spend 6 AP to put
 *    themselves out"* — and it is printed on the burn control as a reminder,
 *    read from `BURNING_EXTINGUISH_AP` so the number is not typed twice.
 * 3. **The `<select>`s are read at click time.** ApplicationV2 dispatches
 *    `data-action` on click and has no change-event equivalent (verified on
 *    14.365), so a picker is a `<select>` plus a button, and the handler reads
 *    the `<select>` out of the DOM when the button is pressed. Binding a change
 *    handler would silently never fire.
 *
 * ## What the scene-wide controls are, and who may press them
 *
 * Light level, vision cutoffs and every flame control write to the *scene* and
 * its embedded documents, not to this actor. They are on the character sheet
 * because that is where the rest of this chapter's readout lives, and they are
 * gated on `game.user.isGM` twice over: the partial hides them, and each
 * handler re-checks, because hiding a control is a courtesy and refusing it is
 * the guarantee.
 *
 * Blindsight and Nightvision are the one genuinely *personal* thing in the
 * chapter (pg 119), so those are editable by whoever owns the sheet.
 */

import {
  applyVisionCutoffs,
  burnFlameOccupants,
  clearVisionCutoffs,
  describeLight,
  describeObscurement,
  extinguishAllFlames,
  extinguishFlames,
  flameAreaOf,
  flameRegions,
  getSceneLight,
  getSenses,
  igniteFlames,
  reportObscurement,
  setSceneLight,
  setSenses,
  spreadFlameAreas,
  visionCutoffsApplied,
  weatherBands,
} from "../../actions/light";
import { BURNING_EXTINGUISH_AP } from "../../rules/constants";
import {
  FLAME_EXTINGUISHERS,
  flameDamageFormula,
  type FlameExtinguisher,
  flameRadiusFeet,
  flamesAtMaximum,
  type LightLevel,
  LIGHT_LEVELS,
  NEW_FLAME_AREA,
  type Obscurement,
  obscurementEffect,
  perceivedObscurement,
  roundsToNextFlameDie,
} from "../../rules/light";
import { registerPanel, type PanelHost } from "../panel-registry";

// ------------------------------------------------------------------ plumbing

/**
 * The value of one of this panel's `<select>`s, read out of the DOM now.
 *
 * ApplicationV2 only dispatches `data-action` on **click** — there is no
 * change-event equivalent in v14 (verified on 14.365), and a `<select>` bound
 * to a change handler would never fire. So each picker is a `<select
 * data-vision="…">` sitting next to a button, and the button's handler comes
 * here to find it. Scoped to the panel's own `<section>` so two pickers on one
 * sheet cannot read each other.
 */
function pickerValue(target: HTMLElement, name: string): string {
  const panel = target.closest<HTMLElement>("section.vision");
  const field = panel?.querySelector<HTMLSelectElement>(`select[data-vision="${name}"]`);
  return field?.value ?? "";
}

function isLightLevel(value: string): value is LightLevel {
  return (LIGHT_LEVELS as readonly string[]).includes(value);
}

function isExtinguisher(value: string): value is FlameExtinguisher {
  return (FLAME_EXTINGUISHERS as readonly string[]).includes(value);
}

/**
 * Refuse, loudly, unless the presser is a GM.
 *
 * Everything this guards writes the scene or its embedded documents, which a
 * player cannot do anyway — without this they would get a raw Foundry
 * permission error instead of a sentence explaining whose button it is.
 */
function gmOnly(): boolean {
  if (game.user.isGM) return true;
  ui.notifications.warn(game.i18n.localize("FALLOUT.Vision.gmOnly"));
  return false;
}

/** A button in `prompt()`, and the named form fields it reads on the way out. */
interface PromptButton {
  action: string;
  label: string;
  fields?: string[];
}

/**
 * The same small `DialogV2` wrapper `./movement.ts` and `./combat-actions.ts`
 * use, for the same reason: two of these controls need a number the sheet
 * cannot infer — how far a creature's blindsight reaches, how much ground a
 * flamer just set alight — and asking is the only honest way to get it. The
 * book supplies a default for neither (pg 119 says "a specific radius" and
 * leaves it to whatever grants the sense; pg 118 never says how big a newly lit
 * area is), which is exactly why they are asked rather than assumed.
 */
async function prompt(
  title: string,
  content: string,
  buttons: PromptButton[],
): Promise<{ action: string; values: string[] } | null> {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content,
    rejectClose: false,
    buttons: [
      ...buttons.map((button, index) => ({
        action: button.action,
        label: button.label,
        default: index === 0,
        callback: (_event: Event, element: HTMLButtonElement) => {
          const form = element.form;
          const read = (name: string): string => {
            const field = form?.elements.namedItem(name);
            return field instanceof HTMLInputElement ? field.value : "";
          };
          return JSON.stringify({
            action: button.action,
            values: (button.fields ?? []).map(read),
          });
        },
      })),
      { action: "cancel", label: game.i18n.localize("FALLOUT.CombatPanel.cancel") },
    ],
  });
  if (typeof result !== "string") return null;
  try {
    const parsed = JSON.parse(result) as { action: string; values: string[] };
    return { action: parsed.action, values: parsed.values };
  } catch {
    return null;
  }
}

function numberField(name: string, label: string, value: number): string {
  return `<label style="display:flex;flex-direction:column;gap:0.3rem;">
      ${label}
      <input type="number" name="${name}" value="${String(value)}" min="0" step="1" />
    </label>`;
}

/** A non-negative whole number of feet, or the fallback when the box was empty. */
function feet(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

// --------------------------------------------------------- the targeted token

interface Point {
  x: number;
  y: number;
}

function pointOf(value: unknown): Point | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as { x?: unknown; y?: unknown };
  return typeof record.x === "number" && typeof record.y === "number"
    ? { x: record.x, y: record.y }
    : null;
}

/**
 * Where on the canvas to light a fire: the one targeted token's position.
 *
 * The same `targetedActor()` discipline the reference panel uses, and for the
 * same reason — a fire lit on the wrong square is worse than a warning. It
 * refuses on zero targets and on two, rather than guessing which one was meant.
 *
 * **The position is probed at runtime rather than assumed.** `game.user.targets`
 * is declared in `src/types/foundry.d.ts` as carrying only `actor` and `name`,
 * which is all any other caller in this system has needed, and this file does
 * not get to widen that declaration. A placeable Token's `center`, its
 * `document`'s `x`/`y` and its own `x`/`y` are each *likely* to be there and
 * none of the three has been probed on 14.365 by this project, so all three are
 * tried and each is type-checked before it is believed. If none of them yields
 * a pair of numbers the control refuses and says so, which is the behaviour a
 * guess would not have given us.
 */
function targetedOrigin(): Point | null {
  const targets = Array.from(game.user.targets);
  if (targets.length !== 1) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Vision.pickOne"));
    return null;
  }
  const placeable: unknown = targets[0];
  if (typeof placeable !== "object" || placeable === null) return null;
  const record = placeable as { center?: unknown; document?: unknown };
  const origin = pointOf(record.center) ?? pointOf(record.document) ?? pointOf(placeable);
  if (!origin) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Vision.noOrigin"));
    return null;
  }
  return origin;
}

// -------------------------------------------------------------- the readout

/**
 * The distances the obscurement readout answers for.
 *
 * Four fixed rungs — one space, a room, a long shot and beyond — plus, when a
 * weather band is in force, the foot on each side of it. The bands are the
 * interesting distances precisely because that is where the answer changes, and
 * the weather chapter (pg 121-123) puts them at 5, 10, 15, 20, 30, 50 and 100
 * feet depending on the storm, so hard-coding a rung set would miss most of
 * them.
 */
function readoutDistances(bands: { obscuredBeyondFeet?: number; blindBeyondFeet?: number }): number[] {
  const distances = new Set<number>([5, 30, 60, 120]);
  for (const edge of [bands.obscuredBeyondFeet, bands.blindBeyondFeet]) {
    if (edge === undefined) continue;
    distances.add(edge);
    distances.add(edge + 5);
  }
  return Array.from(distances).sort((a, b) => a - b);
}

// ---------------------------------------------------------------- the panel

registerPanel({
  id: "vision",
  template: "systems/fallout-ttrpg/templates/actor/parts/vision.hbs",

  actions: {
    /**
     * Set the scene's illumination (pg 118-119).
     *
     * The level comes off the `<select>` at click time. `setSceneLight` paints
     * the canvas and posts the card; nothing here restates what a level does.
     */
    async visionSetLight(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      if (!gmOnly()) return;
      const level = pickerValue(target, "light");
      if (!isLightLevel(level)) return;
      await setSceneLight(level);
      this.render();
    },

    /**
     * Push the chapter's cutoffs onto the scene's tokens.
     *
     * **Scene-wide, not per-target.** `applyVisionCutoffs` takes a scene and
     * caps every token on it, because the thing being modelled is the *light and
     * the weather*, which do not pick favourites — and because each token's
     * cutoff depends on that token's own senses, so one press already gives
     * every creature a different answer. There is no per-token entry point in
     * `src/actions/light.ts` and this file does not invent one.
     */
    async visionApplyCutoffs(this: PanelHost) {
      if (!gmOnly()) return;
      await applyVisionCutoffs();
      this.render();
    },

    /** Hand every token back the vision it was authored with. */
    async visionClearCutoffs(this: PanelHost) {
      if (!gmOnly()) return;
      await clearVisionCutoffs();
      this.render();
    },

    /**
     * Edit this character's Blindsight and Nightvision radii (pg 119).
     *
     * Personal to the sheet, so no GM gate. Both are stored as an actor flag
     * rather than a schema field — `getSenses`'s own comment records why, and
     * records that promoting them to `src/data/character.ts` is an outstanding
     * integration point. Until that happens an Active Effect cannot grant
     * either, which is why they are typed in by hand here.
     */
    async visionEditSenses(this: PanelHost) {
      const current = getSenses(this.actor);
      const choice = await prompt(
        game.i18n.localize("FALLOUT.Vision.sensesTitle"),
        [
          numberField(
            "blindsight",
            game.i18n.localize("FALLOUT.Vision.blindsightLabel"),
            current.blindsight,
          ),
          numberField(
            "nightvision",
            game.i18n.localize("FALLOUT.Vision.nightvisionLabel"),
            current.nightvision,
          ),
          `<p class="hint">${game.i18n.localize("FALLOUT.Vision.sensesHint")}</p>`,
        ].join(""),
        [{ action: "save", label: game.i18n.localize("FALLOUT.Vision.save"), fields: ["blindsight", "nightvision"] }],
      );
      if (choice?.action !== "save") return;
      await setSenses(this.actor, {
        blindsight: feet(choice.values[0], 0),
        nightvision: feet(choice.values[1], 0),
      });
      this.render();
    },

    /**
     * Say out loud what this character can see at a distance.
     *
     * The sentence is already on the sheet; this puts it in chat, which is how
     * the rest of this chapter answers the GM's question. `reportObscurement`
     * composes it — blindsight, then nightvision-softened light, then whatever
     * bands the weather imposes — *and* posts it, so this handler does nothing
     * but read the distance off the button. It used to call
     * `ChatMessage.create` here, which made this the one panel in the system
     * writing a document of its own; a chat card is a document and documents
     * belong to `src/actions/`.
     */
    async visionReportObscurement(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      await reportObscurement(this.actor, feet(target.dataset.feet, 0));
    },

    /**
     * Light a fire on the targeted token's square (pg 118).
     *
     * Two numbers are asked for and neither is invented: the book never says how
     * big a newly lit area is ("when an area is engulfed in flames" is the whole
     * description, and a flamer, a grenade and a dropped flare plainly differ),
     * and it explicitly hands the spread rate to the GM — *"There are factors
     * that could allow flames to spread slower, such as winds, rain, or if the
     * flames are surrounded by non-flammable objects."* The defaults are
     * `NEW_FLAME_AREA`'s: one five-foot space, spreading the printed 5 ft.
     */
    async visionIgnite(this: PanelHost) {
      if (!gmOnly()) return;
      const origin = targetedOrigin();
      if (!origin) return;
      const choice = await prompt(
        game.i18n.localize("FALLOUT.Vision.igniteTitle"),
        [
          numberField(
            "radius",
            game.i18n.localize("FALLOUT.Vision.radiusLabel"),
            NEW_FLAME_AREA.originRadiusFeet,
          ),
          numberField(
            "spread",
            game.i18n.localize("FALLOUT.Vision.spreadLabel"),
            NEW_FLAME_AREA.spreadFeetPerRound,
          ),
          `<p class="hint">${game.i18n.localize("FALLOUT.Vision.igniteHint")}</p>`,
        ].join(""),
        [{ action: "ignite", label: game.i18n.localize("FALLOUT.Vision.ignite"), fields: ["radius", "spread"] }],
      );
      if (choice?.action !== "ignite") return;
      await igniteFlames(origin.x, origin.y, {
        originRadiusFeet: feet(choice.values[0], NEW_FLAME_AREA.originRadiusFeet),
        rounds: 0,
        spreadFeetPerRound: feet(choice.values[1], NEW_FLAME_AREA.spreadFeetPerRound),
      });
      this.render();
    },

    /**
     * Advance every fire by one round (pg 118): "At the start of each round, the
     * flaming area spreads 5 feet in all directions."
     *
     * A button rather than a combat hook, for the reason the book gives itself
     * two sentences later — the rate is the GM's, so the tick has to be theirs
     * too. `spreadFlameAreas` resizes the region, follows the light along with
     * it and posts what each fire now deals.
     */
    async visionSpread(this: PanelHost) {
      if (!gmOnly()) return;
      const spread = await spreadFlameAreas();
      if (spread === 0) ui.notifications.info(game.i18n.localize("FALLOUT.Vision.noFires"));
      this.render();
    },

    /**
     * Burn everything standing in the flames (pg 118).
     *
     * Once per press per creature — `burnFlameOccupants` documents that ruling
     * and it is not restated here. The damage is fire-typed, so resistance and
     * vulnerability are consulted by the ordinary pipeline, and Burning is
     * applied afterwards.
     */
    async visionBurn(this: PanelHost) {
      if (!gmOnly()) return;
      await burnFlameOccupants();
      this.render();
    },

    /** Put one fire out (pg 118), by whichever of the three means was picked. */
    async visionExtinguish(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      if (!gmOnly()) return;
      const means = pickerValue(target, "extinguisher");
      if (!isExtinguisher(means)) return;
      const id = target.dataset.region;
      const region = flameRegions().find((candidate) => candidate.id === id);
      if (!region) {
        ui.notifications.warn(game.i18n.localize("FALLOUT.Vision.noFires"));
        return;
      }
      await extinguishFlames(region, means);
      this.render();
    },

    /** Put every fire on the scene out at once. */
    async visionExtinguishAll(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      if (!gmOnly()) return;
      const means = pickerValue(target, "extinguisher");
      if (!isExtinguisher(means)) return;
      const put = await extinguishAllFlames(means);
      if (put === 0) ui.notifications.info(game.i18n.localize("FALLOUT.Vision.noFires"));
      this.render();
    },
  },

  /**
   * Everything the partial reads, at `panels.vision`.
   *
   * Runs on every render, so it is all flag reads and pure computation — no
   * writes, per the contract. The obscurement rows in particular are
   * `perceivedObscurement` called a handful of times, which is arithmetic.
   */
  // The contract hands `context` the typed system data too; this panel needs
  // none of it — Blindsight and Nightvision are actor *flags* (see `getSenses`),
  // and everything else on this panel belongs to the scene. Declaring only the
  // parameter that is used keeps the unused-argument lint honest.
  context(actor: FoundryActor) {
    const level = getSceneLight();
    const bands = weatherBands();
    const senses = getSenses(actor);

    // The band edges, as text, so the panel can say *why* the answers change
    // where they do rather than leaving the reader to infer it.
    const bandNotes: string[] = [];
    if (bands.obscuredBeyondFeet !== undefined) {
      bandNotes.push(
        game.i18n.localize("FALLOUT.Vision.bandObscured", { feet: bands.obscuredBeyondFeet }),
      );
    }
    if (bands.blindBeyondFeet !== undefined) {
      bandNotes.push(
        game.i18n.localize("FALLOUT.Vision.bandBlind", { feet: bands.blindBeyondFeet }),
      );
    }

    const rows = readoutDistances(bands).map((distance) => {
      const obscurement: Obscurement = perceivedObscurement(distance, level, senses, bands);
      const effect = obscurementEffect(obscurement);
      return {
        feet: distance,
        obscurement,
        // The whole sentence, composed by the actions layer so the sheet and
        // the chat card can never drift apart — the report button posts this
        // exact string.
        sentence: describeObscurement(actor, distance),
        blinded: effect.blinded,
        disadvantage: effect.sightPerceptionDisadvantage,
      };
    });

    return {
      isGM: game.user.isGM,
      // The picker's options, with the level in force pre-selected. Read back
      // at click time; see `pickerValue`.
      levels: LIGHT_LEVELS.map((key) => ({
        key,
        label: game.i18n.localize(`FALLOUT.Light.levels.${key}`),
        selected: key === level,
      })),
      level,
      levelLabel: game.i18n.localize(`FALLOUT.Light.levels.${level}`),
      levelNote: describeLight(level),
      bandNotes,
      cutoffsApplied: visionCutoffsApplied(),
      senses,
      hasSenses: senses.blindsight > 0 || senses.nightvision > 0,
      rows,
      /**
       * The fires, each with what it is doing right now.
       *
       * A fire's area is read through `flameAreaOf` — the actions layer's own
       * parser for the region flag — and everything printed from it is the pure
       * layer's arithmetic (`flameRadiusFeet`, `flameDamageFormula`,
       * `roundsToNextFlameDie`). No flag key and no formula is restated here;
       * this row would go stale the moment either changed if it were.
       *
       * `roundsToNextFlameDie` returns null for two different reasons and the
       * reader deserves to know which: the area has hit the printed 50d10
       * ceiling (pg 118), or a GM has set its spread to 0 and it will never
       * grow. `flamesAtMaximum` is what tells them apart.
       */
      fires: flameRegions().map((region) => {
        const area = flameAreaOf(region);
        const untilNextDie = roundsToNextFlameDie(area);
        return {
          id: region.id,
          name: region.name,
          meta: game.i18n.localize("FALLOUT.Vision.fireMeta", {
            radius: flameRadiusFeet(area),
            formula: flameDamageFormula(area),
            spread: area.spreadFeetPerRound,
            rounds: area.rounds,
          }),
          growth:
            untilNextDie !== null
              ? game.i18n.localize("FALLOUT.Vision.fireNextDie", { rounds: untilNextDie })
              : flamesAtMaximum(area)
                ? game.i18n.localize("FALLOUT.Vision.fireAtMaximum")
                : game.i18n.localize("FALLOUT.Vision.fireNotSpreading"),
          atMaximum: flamesAtMaximum(area),
        };
      }),
      extinguishers: FLAME_EXTINGUISHERS.map((key) => ({
        key,
        label: game.i18n.localize(`FALLOUT.Light.extinguishers.${key}`),
      })),
      // Pg 133, reported and never deducted: "They can spend 6 AP to put
      // themselves out."
      burningAp: BURNING_EXTINGUISH_AP,
    };
  },
});
