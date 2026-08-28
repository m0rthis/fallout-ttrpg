/**
 * Sheet panel: backgrounds (pg 13-18).
 *
 * Contract in `src/sheets/panel-registry.ts`; `src/sheets/panels/medical.ts` is
 * the reference implementation.
 *
 * The panel has two states and no third. Before a background is applied it is a
 * list of the twenty-one rows the chapter prints, each showing what it would do
 * to *this* character — the three skills, the trait, and the kit for this
 * character's race, because every background prints a different kit per race
 * and the sheet already knows which one applies. After one is applied it is a
 * receipt: what was granted, and one button to take it back.
 *
 * No picker dialog, deliberately. Choosing a background is a character-creation
 * decision made once, from a list the player wants to read side by side, and a
 * modal that shows one row at a time is the wrong shape for that. The Apply
 * button's tooltip carries the kit exactly as the book prints it, so nothing is
 * hidden behind a second click.
 */

import type { CharacterData } from "../../data/character";
import { applyBackground, appliedBackground, clearBackground } from "../../actions/backgrounds";
import {
  BACKGROUND_SKILL_BONUS,
  BACKGROUNDS,
  getBackground,
  grantableEntries,
  isCustomBackground,
  kitForRace,
  reportedEntries,
  type Background,
} from "../../rules/backgrounds";
import { registerPanel, type PanelHost } from "../panel-registry";

function localize(key: string, data?: Record<string, string | number>): string {
  return data === undefined ? game.i18n.localize(key) : game.i18n.localize(key, data);
}

/** "Melee Weapons +2, Speech +2, Sneak +2" — the sheet's names, not the book's. */
function skillLine(background: Background): string {
  return background.skills
    .map(
      (skill) =>
        `${localize(`FALLOUT.Skills.${skill}`)} +${String(BACKGROUND_SKILL_BONUS)}`,
    )
    .join(", ");
}

registerPanel({
  id: "backgrounds",
  template: "systems/fallout-ttrpg/templates/actor/parts/backgrounds.hbs",

  actions: {
    async applyBackground(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const key = target.dataset.background;
      if (key === undefined) return;
      await applyBackground(this.actor, this.characterSystem, key);
      this.render();
    },
    async clearBackground(this: PanelHost) {
      await clearBackground(this.actor, this.characterSystem);
      this.render();
    },
  },

  context(actor: FoundryActor, system: CharacterData) {
    const race = system.details.race;
    const applied = appliedBackground(actor);

    if (applied !== null) {
      const background = getBackground(applied.key);
      const stillThere = applied.itemIds.filter((id) => actor.items.get(id) !== undefined).length;
      return {
        applied: {
          name: background?.name ?? applied.key,
          page: background?.page ?? 0,
          kitLabel: applied.kitLabel,
          // The ledger's own skills, not the book's — an old character keeps
          // whatever was actually written to their sheet.
          skills: Object.entries(applied.skills)
            .map(([skill, points]) => `${localize(`FALLOUT.Skills.${skill}`)} +${String(points)}`)
            .join(", "),
          caps: applied.caps,
          granted: applied.itemIds.length,
          remaining: stillThere,
          // Worth surfacing: a background applied for a race the character is
          // no longer is granted a kit that no longer matches the sheet.
          raceChanged: applied.race !== "" && applied.race !== race,
          appliedRace: localize(`FALLOUT.Races.${applied.race}`),
        },
        raceLabel: localize(`FALLOUT.Races.${race}`),
        choices: [],
      };
    }

    const choices = BACKGROUNDS.map((background) => {
      const custom = isCustomBackground(background);
      const kit = custom ? null : kitForRace(background, race);
      const reported = kit ? reportedEntries(kit) : [];
      return {
        key: background.key,
        name: background.name,
        page: background.page,
        skills: skillLine(background),
        printedSkills: background.printedSkills,
        trait: background.trait ?? "",
        custom,
        // Null only when `details.race` holds something the chapter never
        // prints a kit for; the panel says so rather than applying a Human's.
        hasKit: kit !== null,
        kitLabel: kit?.label ?? "",
        items: kit ? grantableEntries(kit).length : 0,
        caps: kit?.caps ?? 0,
        // The whole printed sentence, as the Apply button's tooltip.
        printedKit: kit?.printed ?? background.equipmentNote ?? "",
        reported: reported.map((entry) => entry.printed).join(", "),
      };
    });

    return {
      applied: null,
      raceLabel: localize(`FALLOUT.Races.${race}`),
      choices,
    };
  },
});
