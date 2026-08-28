/**
 * Sheet panel: movement (pg 116-118) — travel pace, climbing, swimming, diving,
 * jumping, sprinting, falling and the breath clock.
 *
 * Built to the contract in `src/sheets/panel-registry.ts` and to the shape of
 * the reference panel in `./medical.ts`: actions, context and a partial here,
 * and nothing else touched. Every rule lives in `src/rules/movement.ts` and
 * `src/actions/movement.ts`; this file presses their buttons and reads back what
 * is already true.
 *
 * ## What this panel is honest about
 *
 * Most of it is a **price list**. There is no movement budget in this system —
 * nothing counts feet moved on a turn — so the climb and swim rows report what
 * five feet costs and change nothing, and the panel prints that on its face
 * rather than letting a row of buttons imply a pool is draining. The same is
 * true of the AP: reported, never deducted (ROADMAP item 14).
 *
 * Four controls do write: a fall, an overreaching jump's Strength check, a leg
 * of travel, and the breath clock.
 *
 * Nothing here targets anybody else, so the reference panel's `targetedActor()`
 * discipline is not needed: every rule in this chapter is about the creature
 * whose sheet this is. A GM dropping an NPC off a ledge opens the NPC's sheet.
 */

import type { CharacterData } from "../../data/character";
import {
  breathPenalty,
  fall,
  holdBreath,
  heldBreath,
  jump,
  reachAir,
  reportClimb,
  reportSprint,
  reportSwim,
  spendBreath,
  tickSuffocation,
  travel,
} from "../../actions/movement";
import { getWeather } from "../../actions/environment";
import { currentGroupSneak } from "../../rules/party";
import {
  BREATH_PENALTY_ROUNDS,
  BREATH_PENALTY_SECONDS,
  breathSeconds,
  climbApPer5Feet,
  climbRoundLimit,
  CLIMB_SURFACES_ORDER,
  CREATURE_SIZES,
  DEFAULT_CREATURE_SIZE,
  jumpApCost,
  jumpLimitFeet,
  type JumpKind,
  passiveSneak,
  sprintDistanceFeet,
  SPRINT_AP_COST,
  suffocationRounds,
  swimApPer5Feet,
  swimRoundLimit,
  TERRAIN_TIERS,
  TRAVEL_PACES,
  TRAVEL_PACES_ORDER,
  travelHourLimit,
  TRAVEL_MODES,
  WATER_KINDS_ORDER,
  WATERS,
} from "../../rules/movement";
import { weatherEffect } from "../../rules/weather";
import { registerPanel, type PanelHost } from "../panel-registry";

/** A button in `prompt()`, and the named form fields it reads on the way out. */
interface PromptButton {
  action: string;
  label: string;
  fields?: string[];
}

/**
 * The same small `DialogV2` wrapper `./combat-actions.ts` uses, for the same
 * reason: four of these controls need a number or a category the sheet cannot
 * infer — how far you are climbing, how far you fell, how many hours you walked
 * — and asking is the only honest way to get it.
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
            if (field instanceof HTMLInputElement) {
              return field.type === "checkbox" ? String(field.checked) : field.value;
            }
            return field instanceof HTMLSelectElement ? field.value : "";
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

function options(values: readonly string[], group: string): string {
  return values
    .map(
      (value) =>
        `<option value="${value}">${game.i18n.localize(`FALLOUT.Movement.${group}.${value}`)}</option>`,
    )
    .join("");
}

function numberField(name: string, label: string, value: string): string {
  return `<label style="display:flex;flex-direction:column;gap:0.3rem;">
      ${label}
      <input type="number" name="${name}" value="${value}" min="0" step="1" />
    </label>`;
}

function selectField(name: string, label: string, markup: string): string {
  return `<label style="display:flex;flex-direction:column;gap:0.3rem;">
      ${label}
      <select name="${name}">${markup}</select>
    </label>`;
}

function checkboxField(name: string, label: string): string {
  return `<label style="display:flex;align-items:center;gap:0.4rem;">
      <input type="checkbox" name="${name}" />
      ${label}
    </label>`;
}

function isMember<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

/** Whether a Dust Storm is halving sprints on the viewed scene (pg 122). */
function sprintHalvedNow(): boolean {
  return weatherEffect(getWeather())?.sprintHalved === true;
}

registerPanel({
  id: "movement",
  template: "systems/fallout-ttrpg/templates/actor/parts/movement.hbs",

  actions: {
    /**
     * Climb a distance up one of the three printed surface ranks (pg 116-117).
     * The rate is on the button; the distance and the gear are asked for.
     */
    async climb(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const surface = target.dataset.surface ?? "";
      if (!isMember(CLIMB_SURFACES_ORDER, surface)) return;
      const choice = await prompt(
        game.i18n.localize("FALLOUT.Movement.climbTitle", {
          surface: game.i18n.localize(`FALLOUT.Movement.surfaces.${surface}`),
        }),
        [
          numberField("feet", game.i18n.localize("FALLOUT.Movement.feetLabel"), "5"),
          checkboxField("gear", game.i18n.localize("FALLOUT.Movement.gearLabel")),
          `<p class="hint">${game.i18n.localize("FALLOUT.Movement.climbHint")}</p>`,
        ].join(""),
        [
          {
            action: "climb",
            label: game.i18n.localize("FALLOUT.Movement.climbAction"),
            fields: ["feet", "gear"],
          },
        ],
      );
      if (choice === null) return;
      const feet = Number(choice.values[0]);
      if (!Number.isFinite(feet)) return;
      await reportClimb(this.actor, this.characterSystem, {
        surface,
        feet,
        gear: choice.values[1] === "true",
      });
    },

    /** Swim (or dive) a distance through one of the three water ranks (pg 117). */
    async swim(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const water = target.dataset.water ?? "";
      if (!isMember(WATER_KINDS_ORDER, water)) return;
      const choice = await prompt(
        game.i18n.localize("FALLOUT.Movement.swimTitle", {
          water: game.i18n.localize(`FALLOUT.Movement.waters.${water}`),
        }),
        [
          numberField("feet", game.i18n.localize("FALLOUT.Movement.feetLabel"), "5"),
          checkboxField("underwater", game.i18n.localize("FALLOUT.Movement.underwaterLabel")),
          `<p class="hint">${game.i18n.localize("FALLOUT.Movement.swimHint")}</p>`,
        ].join(""),
        [
          {
            action: "swim",
            label: game.i18n.localize("FALLOUT.Movement.swimAction"),
            fields: ["feet", "underwater"],
          },
        ],
      );
      if (choice === null) return;
      const feet = Number(choice.values[0]);
      if (!Number.isFinite(feet)) return;
      await reportSwim(this.actor, this.characterSystem, {
        water,
        feet,
        underwater: choice.values[1] === "true",
      });
    },

    /**
     * Sprint (5 AP, pg 117 and pg 127). The Dust Storm halving is read off the
     * scene rather than asked for, since the weather already knows.
     */
    async sprint(this: PanelHost) {
      await reportSprint(this.actor, { halved: sprintHalvedNow() });
    },

    /**
     * Jump long or high (pg 117). The distance and the movement precondition are
     * asked for; the precondition is a declaration, because nothing in this
     * system records what the last two AP were spent on.
     */
    async jump(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const kind = target.dataset.kind === "high" ? "high" : "long";
      const strengthMod = this.characterSystem.derived.abilityMods.strength;
      const limit = jumpLimitFeet(kind, strengthMod, true);
      const choice = await prompt(
        game.i18n.localize("FALLOUT.Movement.jumpTitle", {
          kind: game.i18n.localize(`FALLOUT.Movement.jumps.${kind}`),
        }),
        [
          numberField(
            "feet",
            game.i18n.localize("FALLOUT.Movement.jumpFeetLabel", { limit }),
            String(limit),
          ),
          checkboxField("moved", game.i18n.localize("FALLOUT.Movement.movedLabel")),
          `<p class="hint">${game.i18n.localize("FALLOUT.Movement.jumpHint")}</p>`,
        ].join(""),
        [
          {
            action: "jump",
            label: game.i18n.localize("FALLOUT.Movement.jumpAction"),
            fields: ["feet", "moved"],
          },
        ],
      );
      if (choice === null) return;
      const feet = Number(choice.values[0]);
      if (!Number.isFinite(feet)) return;
      await jump(this.actor, this.characterSystem, {
        kind,
        feet,
        moved: choice.values[1] === "true",
      });
    },

    /** Fall a declared distance (pg 117-118). The one control here that hurts. */
    async fall(this: PanelHost) {
      const choice = await prompt(
        game.i18n.localize("FALLOUT.Movement.fallTitle"),
        [
          numberField("feet", game.i18n.localize("FALLOUT.Movement.fallFeetLabel"), "10"),
          selectField(
            "size",
            game.i18n.localize("FALLOUT.Movement.sizeLabel"),
            CREATURE_SIZES.map(
              (size) =>
                `<option value="${size}"${size === DEFAULT_CREATURE_SIZE ? " selected" : ""}>${game.i18n.localize(
                  `FALLOUT.Movement.sizes.${size}`,
                )}</option>`,
            ).join(""),
          ),
          `<p class="hint">${game.i18n.localize("FALLOUT.Movement.fallHint")}</p>`,
        ].join(""),
        [
          {
            action: "fall",
            label: game.i18n.localize("FALLOUT.Movement.fallAction"),
            fields: ["feet", "size"],
          },
        ],
      );
      if (choice === null) return;
      const feet = Number(choice.values[0]);
      const size = choice.values[1] ?? DEFAULT_CREATURE_SIZE;
      if (!Number.isFinite(feet) || !isMember(CREATURE_SIZES, size)) return;
      await fall(this.actor, this.characterSystem, { feet, size });
    },

    /** Take a breath and start the clock (pg 117-118). */
    async holdBreath(this: PanelHost) {
      await holdBreath(this.actor, this.characterSystem);
    },

    /** Burn a stretch of held breath. */
    async spendBreath(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const seconds = Number(target.dataset.seconds ?? "6");
      if (!Number.isFinite(seconds)) return;
      await spendBreath(this.actor, this.characterSystem, seconds);
    },

    /** A diving penalty: damage taken, or more than half your AP spent (pg 117). */
    async breathPenalty(this: PanelHost) {
      await breathPenalty(this.actor, this.characterSystem);
    },

    /** Advance the drowning clock a round (pg 118). */
    async tickSuffocation(this: PanelHost) {
      await tickSuffocation(this.actor, this.characterSystem);
    },

    /** Surface. The clock stops; nothing is healed by it. */
    async reachAir(this: PanelHost) {
      await reachAir(this.actor);
    },

    /** Travel a leg of a journey (pg 116). The one control that writes fatigue. */
    async travel(this: PanelHost) {
      const hourLimit = travelHourLimit(this.characterSystem.derived.abilityMods.endurance);
      const choice = await prompt(
        game.i18n.localize("FALLOUT.Movement.travelTitle"),
        [
          selectField(
            "pace",
            game.i18n.localize("FALLOUT.Movement.paceLabel"),
            TRAVEL_PACES_ORDER.map(
              (pace) =>
                `<option value="${pace}"${pace === "normal" ? " selected" : ""}>${game.i18n.localize(
                  `FALLOUT.Movement.paces.${pace}`,
                )} — ${String(TRAVEL_PACES[pace].miles)} mi (${String(TRAVEL_PACES[pace].mph)} mph)</option>`,
            ).join(""),
          ),
          numberField(
            "hours",
            game.i18n.localize("FALLOUT.Movement.hoursLabel", { limit: hourLimit }),
            String(hourLimit),
          ),
          selectField(
            "mode",
            game.i18n.localize("FALLOUT.Movement.modeLabel"),
            options(TRAVEL_MODES, "modes"),
          ),
          selectField(
            "terrain",
            game.i18n.localize("FALLOUT.Movement.terrainLabel"),
            options(TERRAIN_TIERS, "terrain"),
          ),
          numberField("mount", game.i18n.localize("FALLOUT.Movement.mountLabel"), "0"),
          `<p class="hint">${game.i18n.localize("FALLOUT.Movement.travelHint")}</p>`,
        ].join(""),
        [
          {
            action: "travel",
            label: game.i18n.localize("FALLOUT.Movement.travelAction"),
            fields: ["pace", "hours", "mode", "terrain", "mount"],
          },
        ],
      );
      if (choice === null) return;

      const pace = choice.values[0] ?? "normal";
      const hours = Number(choice.values[1]);
      const mode = choice.values[2] ?? "foot";
      const terrain = choice.values[3] ?? "normal";
      const mount = Number(choice.values[4]);
      if (!Number.isFinite(hours)) return;
      if (!isMember(TRAVEL_PACES_ORDER, pace)) return;
      if (!isMember(TRAVEL_MODES, mode) || !isMember(TERRAIN_TIERS, terrain)) return;

      await travel(this.actor, this.characterSystem, {
        pace,
        hours,
        mode,
        terrain,
        averageGroupSneakBonus: currentGroupSneak(),
        // A mount substitutes its own maximum travel distance wholesale (pg 116);
        // zero means "no figure given", not "a mount that cannot move".
        ...(mode === "mount" && Number.isFinite(mount) && mount > 0
          ? { mountMiles: mount }
          : {}),
      });
    },
  },

  context(actor: FoundryActor, system: CharacterData) {
    const enduranceScore = system.derived.abilityScores.endurance;
    const enduranceMod = system.derived.abilityMods.endurance;
    const strengthMod = system.derived.abilityMods.strength;
    const breath = heldBreath(actor);
    const halved = sprintHalvedNow();
    const groupSneak = currentGroupSneak();

    return {
      // ---------------------------------------------------------- climbing
      // Every rate comes from the rules module, so a printed number appears in
      // this system exactly once. `null` means the surface cannot be climbed at
      // all without gear, which is a refusal rather than a price.
      //
      // Labels are localized here rather than in the partial, following the
      // note in `./combat-actions.ts`: Handlebars cannot build a key.
      climb: CLIMB_SURFACES_ORDER.map((surface) => ({
        key: surface,
        label: game.i18n.localize(`FALLOUT.Movement.surfaces.${surface}`),
        bare: climbApPer5Feet(surface, false),
        geared: climbApPer5Feet(surface, true),
        gearRequired: climbApPer5Feet(surface, false) === null,
      })),
      climbRounds: climbRoundLimit(enduranceScore),

      // ---------------------------------------------------------- swimming
      swim: WATER_KINDS_ORDER.map((water) => ({
        key: water,
        label: game.i18n.localize(`FALLOUT.Movement.waters.${water}`),
        surface: swimApPer5Feet(water, false),
        underwater: swimApPer5Feet(water, true),
        current: WATERS[water].currentFeet,
        rounds: swimRoundLimit(water, enduranceScore),
      })),

      // ------------------------------------------------------------- breath
      breathSeconds: breathSeconds(enduranceMod),
      suffocationRounds: suffocationRounds(enduranceMod),
      breathPenaltySeconds: BREATH_PENALTY_SECONDS,
      breathPenaltyRounds: BREATH_PENALTY_ROUNDS,
      // The live clock, when one is running. `suffocating` being a number rather
      // than null is the difference between holding your breath and drowning.
      breathHeld: breath === null ? null : breath.seconds,
      breathPenalties: breath?.penalties ?? 0,
      suffocating: breath?.suffocating ?? null,
      // A separate flag rather than testing `suffocating` in the template:
      // Handlebars reads 0 as false, and 0 rounds left is precisely the state
      // that most needs the drowning branch rather than the breath one.
      outOfBreath: breath !== null && breath.suffocating !== null,
      hasBreath: breath !== null,

      // ------------------------------------------------------------ jumping
      // Both distances, both ways: the book halves them when the last two AP
      // were not spent moving, and that halving is the part people forget.
      jumps: (["long", "high"] as JumpKind[]).map((kind) => {
        const moved = jumpLimitFeet(kind, strengthMod, true);
        const standing = jumpLimitFeet(kind, strengthMod, false);
        return {
          key: kind,
          label: game.i18n.localize(`FALLOUT.Movement.jumps.${kind}`),
          moved,
          standing,
          movedAp: jumpApCost(kind, moved),
          standingAp: jumpApCost(kind, standing),
        };
      }),

      // ----------------------------------------------------------- sprinting
      sprintAp: SPRINT_AP_COST,
      sprintFeet: sprintDistanceFeet(halved),
      sprintHalved: halved,

      // -------------------------------------------------------------- travel
      hourLimit: travelHourLimit(enduranceMod),
      groupSneak,
      paces: TRAVEL_PACES_ORDER.map((pace) => {
        const sequence = TRAVEL_PACES[pace].combatSequence;
        return {
          key: pace,
          label: game.i18n.localize(`FALLOUT.Movement.paces.${pace}`),
          miles: TRAVEL_PACES[pace].miles,
          mph: TRAVEL_PACES[pace].mph,
          sneak: passiveSneak(pace, groupSneak),
          // "-" in the printed table for Normal, so nothing is shown for it.
          sequence:
            sequence === null
              ? null
              : game.i18n.localize(`FALLOUT.Movement.travelSequence.${sequence}`),
        };
      }),

      // The two standing honesty notes, so they sit on the sheet rather than
      // only in a chat card somebody has already scrolled past.
      noBudget: true,
      defaultSize: game.i18n.localize(`FALLOUT.Movement.sizes.${DEFAULT_CREATURE_SIZE}`),
    };
  },
});
