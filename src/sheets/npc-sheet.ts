import { FalloutCharacterSheet } from "./character-sheet";

/**
 * Compact statblock-style sheet for NPCs and creatures. Shares the character
 * sheet's data model and action handlers (ApplicationV2 merges DEFAULT_OPTIONS
 * up the class chain); only the template and framing differ.
 */
export class FalloutNpcSheet extends FalloutCharacterSheet {
  static override DEFAULT_OPTIONS: foundry.applications.api.ApplicationConfiguration = {
    classes: ["fallout-ttrpg", "sheet", "npc"],
    position: { width: 560, height: 640 },
  };

  static override PARTS = {
    body: {
      template: "systems/fallout-ttrpg/templates/actor/npc-sheet.hbs",
      scrollable: [".sheet-body"],
    },
  };
}
