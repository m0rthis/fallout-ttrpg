/**
 * Sheet panels — the seam that keeps the character sheet from becoming one
 * unmergeable file.
 *
 * `character-sheet.ts` is already 1,100 lines and one Handlebars template, and
 * every new subsystem wants three things in it: a handler in `DEFAULT_OPTIONS.
 * actions`, some values in `_prepareContext`, and markup. Adding five
 * subsystems' worth of that by hand puts five sets of edits in the same three
 * files.
 *
 * So a panel is a self-contained module that declares all three, and the sheet
 * collects them:
 *
 * - **`actions`** are spread into the sheet's action map. ApplicationV2 calls
 *   them with `this` bound to the sheet, which is why they are typed against
 *   `PanelHost` rather than the sheet class — a panel importing the sheet it is
 *   mounted on would be circular.
 * - **`context`** is merged under `panels.<id>`, so two panels cannot collide
 *   on a key name however carelessly they are written.
 * - **`template`** is a partial registered by path at init. Core keys its own
 *   partials the same way (`templates/ui/players.hbs`), verified on 14.365.
 *
 * A panel owns exactly two files: its module here and its partial under
 * `templates/actor/parts/`. Nothing else in the sheet has to change to add one.
 */

import type { CharacterData } from "../data/character";

/**
 * What a panel handler can rely on. Deliberately the smallest surface that
 * works: the document, its typed system data, and a way to re-render.
 */
export interface PanelHost {
  readonly actor: FoundryActor;
  readonly document: FoundryActor;
  readonly characterSystem: CharacterData;
  render(force?: boolean): unknown;
}

export type PanelAction = (
  this: PanelHost,
  event: PointerEvent,
  target: HTMLElement,
) => unknown;

export interface SheetPanel {
  /** Stable id. Namespaces this panel's context and names nothing else. */
  readonly id: string;
  /** Path to the partial, registered at init and included by the main template. */
  readonly template: string;
  /** Action handlers, merged into the sheet's `DEFAULT_OPTIONS.actions`. */
  readonly actions: Record<string, PanelAction>;
  /**
   * Values for the partial, exposed at `panels.<id>`. Runs on every render, so
   * keep it cheap and never write a document from it — the sheet is mid-render
   * and a write would re-enter.
   */
  context?(actor: FoundryActor, system: CharacterData): Record<string, unknown>;
}

/**
 * Every panel the character sheet mounts.
 *
 * Order here is the order the partials appear in the sheet body, so it is the
 * one place layout is decided.
 */
export const SHEET_PANELS: SheetPanel[] = [];

/** Register a panel. Called once per module at import time. */
export function registerPanel(panel: SheetPanel): void {
  SHEET_PANELS.push(panel);
}

/** Every panel's actions, flattened for `DEFAULT_OPTIONS.actions`. */
export function panelActions(): Record<string, PanelAction> {
  const actions: Record<string, PanelAction> = {};
  for (const panel of SHEET_PANELS) {
    for (const [name, handler] of Object.entries(panel.actions)) {
      if (name in actions) {
        // Two panels claiming one action name would silently shadow each other,
        // and the loser would be whichever imported first.
        throw new Error(`fallout-ttrpg | duplicate sheet action "${name}" from panel ${panel.id}`);
      }
      actions[name] = handler;
    }
  }
  return actions;
}

/** Every panel's context, namespaced by panel id. */
export function panelContext(
  actor: FoundryActor,
  system: CharacterData,
): Record<string, Record<string, unknown>> {
  const context: Record<string, Record<string, unknown>> = {};
  for (const panel of SHEET_PANELS) {
    context[panel.id] = panel.context?.(actor, system) ?? {};
  }
  return context;
}

/** Partial paths to hand `loadTemplates` at init. */
export function panelTemplates(): string[] {
  return SHEET_PANELS.map((panel) => panel.template);
}

/**
 * Partials that are shared markup rather than panels.
 *
 * A panel is a section with an id, its own context slice, and a place in the
 * sheet's layout. The condition track is none of those — it is one `<label>`
 * per leveled condition, rendered from the parent's own `conditions` array, and
 * included by both the character sheet and the NPC statblock.
 *
 * It is here because the two sheets had drifted: the character sheet learned
 * the per-condition ceiling and the disease floor and the NPC sheet did not,
 * despite inheriting the identical context. Kept out of `SHEET_PANELS` so
 * `panelContext` does not have to invent an entry for something that has no
 * context of its own.
 */
export const SHARED_PARTIALS: readonly string[] = [
  "systems/fallout-ttrpg/templates/actor/parts/condition-track.hbs",
];

/** Every partial path `loadTemplates` needs at init: panels and shared markup. */
export function sheetPartials(): string[] {
  return [...panelTemplates(), ...SHARED_PARTIALS];
}
