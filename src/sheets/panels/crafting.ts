/**
 * Sheet panel: the crafting bench (pg 92; the Item Blueprint Encyclopedia,
 * pg 94-115).
 *
 * The rules live in `src/rules/crafting.ts` and the document writing in
 * `src/actions/crafting.ts`; this panel is the seam where a player picks a
 * recipe and *sees the check before committing to it*. Three things about
 * crafting make that seam worth building carefully:
 *
 * - **Crafting is frequently not a Crafting check.** Fourteen of the
 *   Encyclopedia's thirty-three tables head their DC column with Survival,
 *   Medicine, Science or Explosives, and four of them demand two checks at once
 *   (pg 94-115). So every row here prints the skill it would actually be rolled
 *   with, taken from the table's own printed heading, rather than one blanket
 *   "Crafting" label.
 * - **Meeting the listed bonus is the normal path** (pg 92), not an edge case:
 *   no roll happens at all. `craftsAutomatically()` decides it, and the panel
 *   marks it before the player clicks — otherwise the only way to discover an
 *   automatic success is to have already taken it.
 * - **Materials are reported, never deducted.** No document in this system
 *   represents steel or adhesive, so the panel prints what a build costs and
 *   the table settles it. Saying that in the UI is part of the feature, not a
 *   caveat hidden in a tooltip.
 *
 * **The async problem, and the choice made about it.** `context()` is
 * synchronous and runs on every render; reading a compendium is neither. So the
 * compendium is never touched from `context()`: the panel's own context is
 * computed entirely from the actor — its skill bonuses, and the recipes already
 * on the sheet, whose blueprint flags are local data. The 312 shipped recipes
 * are read once, lazily, inside the async action that opens the picker and
 * memoised for the session. Nothing renders behind a promise, and a player who
 * never crafts never pays for the pack read.
 *
 * The picker itself is a dialog rather than sheet furniture, because a live
 * search box would need per-keystroke JavaScript and the panel contract offers
 * no render hook to attach it to — and a `<select>` inside the sheet's own form
 * would submit the sheet. Two short dialogs (narrow, then pick) are what the
 * contract can honestly support.
 */

import type { CharacterData } from "../../data/character";
import type { SkillKey } from "../../rules/constants";
import { craftItem, type CraftAssistant, type CraftOptions } from "../../actions/crafting";
import {
  bestSkillFor,
  categoryFormat,
  craftDC,
  craftRequirement,
  craftsAutomatically,
  drinkBrewingShortfall,
  formatMinutes,
  isPowerArmorBuild,
  meetsRequirement,
  parseCraftTime,
  parseMaterials,
  powerArmorSchedule,
  CATEGORY_FORMATS,
  DRINK_BREWING_MINIMUM_BONUS,
  type Blueprint,
} from "../../rules/crafting";
import { registerPanel, type PanelHost } from "../panel-registry";

const SYSTEM_ID = "fallout-ttrpg";
const EQUIPMENT_PACK = `${SYSTEM_ID}.equipment`;

/**
 * Every skill that heads a DC column anywhere in the Encyclopedia, derived from
 * the table formats themselves rather than hand-listed — if a category's
 * heading is ever corrected, this strip follows it instead of drifting.
 */
const CRAFT_SKILLS: readonly SkillKey[] = (() => {
  const skills = new Set<SkillKey>();
  for (const format of Object.values(CATEGORY_FORMATS)) {
    for (const skill of format.primary) skills.add(skill);
    if (format.secondary) skills.add(format.secondary);
  }
  return [...skills];
})();

// ------------------------------------------------------------- compendium

/**
 * The slice of Foundry's CompendiumCollection this panel needs.
 *
 * Declared locally rather than in `src/types/foundry.d.ts`: that file is the
 * system's shared Foundry boundary and this pass does not own it. `game.packs`
 * is keyed `"<system>.<pack>"` and every document in the equipment pack carries
 * its recipe as `flags["fallout-ttrpg"].blueprint` (see
 * `scripts/build-packs.mjs`).
 */
function equipmentPack(): CompendiumPack | null {
  // `game.packs` is declared in src/types/foundry.d.ts, so this no longer
  // needs a local cast through the shared boundary.
  return game.packs.get(EQUIPMENT_PACK) ?? null;
}

interface Recipe {
  readonly item: FoundryItem;
  readonly blueprint: Blueprint;
}

/**
 * Memoised for the session. Whole documents rather than a pack index: the index
 * would have to project `flags.fallout-ttrpg.blueprint` through
 * `getIndex({fields})`, which is not verified on 14.365, and an index entry
 * could not be handed to `craftItem()` as a source anyway — it wants the real
 * document to copy `system` off.
 */
let recipeCache: Promise<readonly Recipe[]> | null = null;

async function readRecipes(): Promise<readonly Recipe[]> {
  const pack = equipmentPack();
  if (!pack) return [];
  const documents = await pack.getDocuments();
  const found: Recipe[] = [];
  for (const item of documents) {
    const blueprint = item.getFlag(SYSTEM_ID, "blueprint") as Blueprint | undefined;
    if (blueprint) found.push({ item, blueprint });
  }
  return found.sort((left, right) => left.item.name.localeCompare(right.item.name));
}

async function loadRecipes(): Promise<readonly Recipe[]> {
  recipeCache ??= readRecipes();
  const found = await recipeCache;
  // An empty read means the pack was missing, not that the wasteland has no
  // recipes — don't cache the miss, or a module loading late never recovers.
  if (found.length === 0) recipeCache = null;
  return found;
}

// ------------------------------------------------------------------ format

function localize(key: string, data?: Record<string, string | number>): string {
  return data === undefined ? game.i18n.localize(key) : game.i18n.localize(key, data);
}

function skillLabel(skill: SkillKey): string {
  return localize(`FALLOUT.Skills.${skill}`);
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${String(value)}`;
}

/** Printed cells and document names are data, and they reach dialog markup. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A table's name for a human. Derived from the extraction's category id rather
 * than translated: the ids are the book's own table names slugified, and 33
 * invented labels would be 33 chances to rename a table the book titled.
 */
function categoryLabel(category: string): string {
  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ----------------------------------------------------------------- preview

/** One printed check, as the player needs to read it before rolling it. */
interface CheckLine {
  /** The skill this crafter would actually roll — their best of the choices. */
  readonly skill: string;
  /** The bonus the row demands for an automatic success (pg 92). */
  readonly required: number;
  /** `10 +` that (pg 92). */
  readonly dc: number;
  readonly bonus: number;
  readonly met: boolean;
}

interface RecipePreview {
  /** The DC column's heading, verbatim — the only place the book names the skill. */
  readonly heading: string;
  readonly checks: readonly CheckLine[];
  readonly automatic: boolean;
  readonly rankCount: number;
  readonly rank: number;
  readonly rider: string | null;
  readonly materials: string;
  readonly time: string;
  readonly quantity: number;
  /** Days of work for a Power Armor build (pg 94), null for everything else. */
  readonly powerArmorDays: number | null;
  /** Why this row cannot simply be built, already localized. */
  readonly blocked: string | null;
  /** The crafter has to supply the DC by hand — the cell is not one number. */
  readonly needsDc: boolean;
  /** Craftable at all: uncraftable and modifier rows are not (pg 92, 102). */
  readonly craftable: boolean;
  /** Skills short of the pg 115 drink gate, localized. Empty when it does not apply. */
  readonly drinkShort: readonly string[];
}

function checkLine(
  check: { readonly skills: readonly SkillKey[]; readonly bonus: number },
  bonuses: Readonly<Record<SkillKey, number>>,
): CheckLine {
  const skill = bestSkillFor(check, bonuses);
  return {
    skill: skillLabel(skill),
    required: check.bonus,
    dc: craftDC(check.bonus),
    bonus: bonuses[skill],
    met: meetsRequirement(check, bonuses),
  };
}

/**
 * Everything the sheet and the dialog say about one recipe, at one rank.
 *
 * Read-only throughout: this runs inside `context()` on every render, so it
 * rolls nothing, writes nothing and asks Foundry for nothing.
 */
function previewRecipe(
  name: string,
  blueprint: Blueprint,
  bonuses: Readonly<Record<SkillKey, number>>,
  rank = 1,
): RecipePreview {
  const format = categoryFormat(blueprint.category);
  const printedMinutes = parseCraftTime(blueprint.craftTime);
  const printedMaterials = parseMaterials(blueprint.craftMaterials, rank).text.trim();
  const base = {
    heading: format.heading,
    materials:
      printedMaterials.length > 0
        ? printedMaterials
        : localize("FALLOUT.Crafting.Bench.noMaterials"),
    // Three cells are jokes rather than durations (pg 98) — print them verbatim.
    time:
      printedMinutes === null
        ? (blueprint.craftTime ?? localize("FALLOUT.Crafting.Bench.noTime"))
        : formatMinutes(printedMinutes),
    quantity: blueprint.yield ?? 1,
    powerArmorDays:
      isPowerArmorBuild(blueprint.category) && printedMinutes !== null
        ? powerArmorSchedule(printedMinutes, 0).days
        : null,
    // pg 115 gates the whole drinks table before any row's own DC is read.
    drinkShort: drinkBrewingShortfall(blueprint.category, bonuses).map(skillLabel),
  };

  const resolved = craftRequirement(blueprint, rank);
  if (!resolved.ok) {
    const message = localize(`FALLOUT.Crafting.${resolved.reason}`, {
      item: name,
      text: resolved.text,
    });
    return {
      ...base,
      checks: [],
      automatic: false,
      rankCount: 1,
      rank: 1,
      rider: null,
      blocked: message,
      // An unparsed cell is not an uncraftable row: it is a shape no parser
      // should reduce to one number, which is exactly what `dcBonus` is for.
      needsDc: resolved.reason === "unparsed",
      craftable: resolved.reason === "unparsed",
    };
  }

  const requirement = resolved.value;
  return {
    ...base,
    checks: requirement.checks.map((check) => checkLine(check, bonuses)),
    automatic: craftsAutomatically(requirement, bonuses),
    rankCount: requirement.rankCount,
    rank: requirement.rank,
    rider: requirement.rider,
    blocked: null,
    needsDc: false,
    craftable: true,
  };
}

function checkText(line: CheckLine): string {
  return localize("FALLOUT.Crafting.Bench.checkLine", {
    skill: line.skill,
    dc: line.dc,
    bonus: signed(line.bonus),
  });
}

function checksText(preview: RecipePreview): string {
  if (preview.checks.length === 0) return localize("FALLOUT.Crafting.Bench.noCheck");
  return preview.checks.map(checkText).join(" + ");
}

/** The one-line "what does it cost me" summary a row and an option both use. */
function summaryText(preview: RecipePreview): string {
  const parts = [preview.materials, preview.time];
  if (preview.quantity > 1) {
    parts.push(localize("FALLOUT.Crafting.Bench.makes", { quantity: preview.quantity }));
  }
  if (preview.rankCount > 1) {
    parts.push(localize("FALLOUT.Crafting.Bench.ranks", { count: preview.rankCount }));
  }
  return parts.join(" · ");
}

// -------------------------------------------------------------- the dialog

/**
 * DialogV2 reading named form controls, and reporting which button was pressed.
 *
 * The character sheet has a private `#prompt` of the same shape; a panel cannot
 * reach it (`PanelHost` is deliberately the smallest surface that works, and
 * importing the sheet would be circular), so the pattern is repeated here. Note
 * the sheet's helper takes `{action, label, field}` and does **not** accept a
 * `default` — that is its own parameter type, not DialogV2's, which is why
 * `default` appears below.
 */
async function promptFields(
  title: string,
  content: string,
  buttons: readonly { action: string; label: string; fields: readonly string[] }[],
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
          return JSON.stringify({ action: button.action, values: button.fields.map(read) });
        },
      })),
      { action: "cancel", label: localize("FALLOUT.Targeted.cancel") },
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

function labelBlock(text: string, control: string): string {
  return `<label style="display:flex;flex-direction:column;gap:0.3rem;margin-top:0.4rem;">
    ${text}
    ${control}
  </label>`;
}

function checkboxBlock(name: string, text: string): string {
  return `<label style="display:flex;gap:0.4rem;align-items:center;margin-top:0.4rem;">
    <input type="checkbox" name="${name}" />
    ${text}
  </label>`;
}

// ------------------------------------------------------------- the picker

/**
 * Narrow, then pick. 312 recipes ship with the equipment compendium, so the
 * first dialog exists purely to cut that down — by table, by name, or both —
 * and the second groups whatever survives under the table it is printed in, so
 * even an unfiltered list is never the flat 312-line list the brief rules out.
 */
async function pickRecipe(bonuses: Readonly<Record<SkillKey, number>>): Promise<Recipe | null> {
  const all = await loadRecipes();
  if (all.length === 0) {
    ui.notifications.warn(localize("FALLOUT.Crafting.Bench.noPack"));
    return null;
  }

  const counts = new Map<string, number>();
  for (const recipe of all) {
    counts.set(recipe.blueprint.category, (counts.get(recipe.blueprint.category) ?? 0) + 1);
  }
  const categories = [...counts.keys()].sort((left, right) =>
    categoryLabel(left).localeCompare(categoryLabel(right)),
  );
  const options = [
    `<option value="">${escapeHtml(localize("FALLOUT.Crafting.Bench.anyCategory"))}</option>`,
    ...categories.map((category) => {
      const label = `${categoryLabel(category)} — ${categoryFormat(category).heading} (${String(counts.get(category) ?? 0)})`;
      return `<option value="${escapeHtml(category)}">${escapeHtml(label)}</option>`;
    }),
  ].join("");

  const filter = await promptFields(
    localize("FALLOUT.Crafting.Bench.pickTitle"),
    [
      labelBlock(
        localize("FALLOUT.Crafting.Bench.category"),
        `<select name="category">${options}</select>`,
      ),
      labelBlock(
        localize("FALLOUT.Crafting.Bench.query"),
        `<input type="text" name="query" value="" />`,
      ),
      `<p class="hint">${escapeHtml(localize("FALLOUT.Crafting.Bench.pickHint", { count: all.length }))}</p>`,
    ].join("\n"),
    [
      {
        action: "browse",
        label: localize("FALLOUT.Crafting.Bench.browseAction"),
        fields: ["category", "query"],
      },
    ],
  );
  if (!filter) return null;

  const category = filter.values[0] ?? "";
  const needle = (filter.values[1] ?? "").trim().toLowerCase();
  const matches = all.filter(
    (recipe) =>
      (category === "" || recipe.blueprint.category === category) &&
      (needle === "" || recipe.item.name.toLowerCase().includes(needle)),
  );
  if (matches.length === 0) {
    ui.notifications.warn(localize("FALLOUT.Crafting.Bench.noMatches"));
    return null;
  }
  // One match is not worth a dialog asking which one.
  if (matches.length === 1) return matches[0] ?? null;

  // Grouped by table, because the table is what decides the skill: two recipes
  // with the same DC under different headings are not the same ask.
  const groups = new Map<string, string[]>();
  matches.forEach((recipe, index) => {
    const preview = previewRecipe(recipe.item.name, recipe.blueprint, bonuses);
    const label = [
      recipe.item.name,
      preview.checks.map((line) => `${line.skill} DC ${String(line.dc)}`).join(" + "),
      preview.craftable
        ? preview.automatic
          ? localize("FALLOUT.Crafting.Bench.auto")
          : localize("FALLOUT.Crafting.Bench.roll")
        : localize("FALLOUT.Crafting.Bench.cannot"),
      preview.time,
    ]
      .filter((part) => part.length > 0)
      .join(" · ");
    const group = groups.get(recipe.blueprint.category) ?? [];
    group.push(
      `<option value="${String(index)}">${escapeHtml(label)}</option>`,
    );
    groups.set(recipe.blueprint.category, group);
  });
  const grouped = [...groups.entries()]
    .map(
      ([category, entries]) =>
        `<optgroup label="${escapeHtml(`${categoryLabel(category)} — ${categoryFormat(category).heading}`)}">${entries.join("")}</optgroup>`,
    )
    .join("");

  const picked = await promptFields(
    localize("FALLOUT.Crafting.Bench.resultTitle"),
    [
      labelBlock(
        localize("FALLOUT.Crafting.Bench.recipeLabel"),
        `<select name="recipe" size="10" style="min-width:22rem;">${grouped}</select>`,
      ),
      `<p class="hint">${escapeHtml(localize("FALLOUT.Crafting.Bench.resultHint", { count: matches.length }))}</p>`,
    ].join("\n"),
    [
      {
        action: "choose",
        label: localize("FALLOUT.Crafting.Bench.chooseAction"),
        fields: ["recipe"],
      },
    ],
  );
  if (!picked) return null;
  const index = Number(picked.values[0] ?? "");
  return Number.isInteger(index) ? (matches[index] ?? null) : null;
}

// --------------------------------------------------------------- crafting

/**
 * Creatures lending a hand (pg 92), taken from the user's targets.
 *
 * An assistant is not a number: one whose own skill falls short has to roll,
 * and can sink the build. So the only honest source for them is real actors
 * with real skill bonuses — the same "target the other creature" shape the
 * medical panel uses. Character and NPC share `CharacterData`, so any targeted
 * creature has derived bonuses; the crafter is filtered out of their own crew.
 */
function targetedAssistants(crafterId: string): CraftAssistant[] {
  const assistants: CraftAssistant[] = [];
  for (const token of game.user.targets) {
    const actor = token.actor;
    if (!actor || actor.id === crafterId) continue;
    const system = actor.system as CharacterData;
    assistants.push({
      name: actor.name,
      skillBonuses: system.derived.skillBonuses,
      d20Penalty: system.derived.d20Penalty,
    });
  }
  return assistants;
}

function previewBlock(preview: RecipePreview): string {
  const lines: string[] = [
    `<p><strong>${escapeHtml(checksText(preview))}</strong></p>`,
    `<p class="panel-note">${escapeHtml(localize("FALLOUT.Crafting.Bench.heading", { heading: preview.heading }))}</p>`,
  ];
  if (preview.blocked !== null) {
    lines.push(`<p class="hint warning">${escapeHtml(preview.blocked)}</p>`);
  }
  if (preview.craftable) {
    lines.push(
      preview.automatic
        ? `<p><strong>${escapeHtml(localize("FALLOUT.Crafting.Bench.automaticNote"))}</strong></p>`
        : `<p>${escapeHtml(localize("FALLOUT.Crafting.Bench.rollNote"))}</p>`,
    );
  }
  lines.push(
    `<p>${escapeHtml(localize("FALLOUT.Crafting.Bench.printedMaterials", { materials: preview.materials }))}</p>`,
    `<p>${escapeHtml(localize("FALLOUT.Crafting.Bench.printedTime", { time: preview.time }))}</p>`,
  );
  if (preview.quantity > 1) {
    lines.push(
      `<p>${escapeHtml(localize("FALLOUT.Crafting.Bench.makes", { quantity: preview.quantity }))}</p>`,
    );
  }
  if (preview.powerArmorDays !== null) {
    lines.push(
      `<p class="hint warning">${escapeHtml(localize("FALLOUT.Crafting.Bench.powerArmorDays", { days: preview.powerArmorDays }))}</p>`,
    );
  }
  if (preview.rider !== null) {
    lines.push(
      `<p class="hint">${escapeHtml(localize("FALLOUT.Crafting.rider", { text: preview.rider }))}</p>`,
    );
  }
  if (preview.drinkShort.length > 0) {
    lines.push(
      `<p class="hint warning">${escapeHtml(
        localize("FALLOUT.Crafting.Bench.drinkGate", {
          minimum: DRINK_BREWING_MINIMUM_BONUS,
          skills: preview.drinkShort.join(", "),
        }),
      )}</p>`,
    );
  }
  return lines.join("\n");
}

/**
 * Ask for the four things `craftItem()` accepts, having first shown what the
 * check is going to be.
 *
 * Every rank of a multi-rank upgrade is previewed at once — the DC and the
 * materials both change per rank, and a static dialog cannot re-preview itself
 * after the select changes, so it shows all of them rather than one and a
 * surprise.
 */
async function runCraft(host: PanelHost, item: FoundryItem, blueprint: Blueprint): Promise<void> {
  const bonuses = host.characterSystem.derived.skillBonuses;
  const first = previewRecipe(item.name, blueprint, bonuses, 1);
  if (!first.craftable) {
    ui.notifications.warn(first.blocked ?? localize("FALLOUT.Crafting.Bench.cannot"));
    return;
  }

  const assistants = targetedAssistants(host.actor.id);
  const content: string[] = [previewBlock(first)];

  if (first.rankCount > 1) {
    const ranks = Array.from({ length: first.rankCount }, (_value, index) => index + 1);
    const rows = ranks.map((rank) => {
      const preview = previewRecipe(item.name, blueprint, bonuses, rank);
      return localize("FALLOUT.Crafting.Bench.rankSummary", {
        rank,
        checks: checksText(preview),
        materials: preview.materials,
      });
    });
    content.push(
      `<ul class="hint">${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}</ul>`,
    );
    content.push(
      labelBlock(
        localize("FALLOUT.Crafting.rankLabel"),
        `<select name="rank">${ranks
          .map((rank) => `<option value="${String(rank)}">${String(rank)}</option>`)
          .join("")}</select>`,
      ),
    );
  }

  // The gamble only exists for a crafter who already qualifies (pg 92); for
  // everybody else the roll is not optional, so offering it would be noise.
  if (first.automatic) {
    content.push(checkboxBlock("pushLuck", escapeHtml(localize("FALLOUT.Crafting.pushLuck"))));
  }

  if (assistants.length > 0) {
    content.push(
      checkboxBlock(
        "assist",
        escapeHtml(
          localize("FALLOUT.Crafting.Bench.assist", {
            count: assistants.length,
            names: assistants.map((assistant) => assistant.name).join(", "),
          }),
        ),
      ),
      `<p class="hint">${escapeHtml(localize("FALLOUT.Crafting.Bench.assistHint"))}</p>`,
    );
  } else {
    content.push(`<p class="hint">${escapeHtml(localize("FALLOUT.Crafting.Bench.assistNone"))}</p>`);
  }

  // Deliberately blank rather than pre-filled with the printed bonus: a filled
  // field would be sent on every craft, and `craftItem()` treats `dcBonus` as
  // "ignore the printed cell", which would flatten a two-check row to one check
  // and re-price a rank-3 upgrade at rank 1's DC.
  content.push(
    labelBlock(
      localize("FALLOUT.Crafting.Bench.dcOverride"),
      `<input type="number" name="dcBonus" value="" step="1" placeholder="${
        first.checks[0] === undefined ? "" : String(first.checks[0].required)
      }" />`,
    ),
    `<p class="hint">${escapeHtml(
      localize(first.needsDc ? "FALLOUT.Crafting.Bench.dcNeeded" : "FALLOUT.Crafting.Bench.dcHint"),
    )}</p>`,
    `<p class="hint">${escapeHtml(localize("FALLOUT.Crafting.Bench.materialsNote"))}</p>`,
    `<p class="hint">${escapeHtml(localize("FALLOUT.Crafting.workbench"))}</p>`,
  );

  const choice = await promptFields(
    localize("FALLOUT.Crafting.title", { item: item.name }),
    content.join("\n"),
    [
      {
        action: "craft",
        label: localize("FALLOUT.Crafting.action"),
        fields: ["rank", "pushLuck", "assist", "dcBonus"],
      },
    ],
  );
  if (!choice) return;

  // Absent controls read back as "", which is why every option below is opted
  // *into* — and under exactOptionalPropertyTypes an untouched option has to be
  // left off the object rather than set to undefined.
  const options: CraftOptions = {};
  const rank = Number(choice.values[0] ?? "");
  if (Number.isInteger(rank) && rank > 1) options.rank = rank;
  if (choice.values[1] === "true") options.pushLuck = true;
  if (choice.values[2] === "true" && assistants.length > 0) options.assistants = assistants;
  const dcText = (choice.values[3] ?? "").trim();
  if (dcText.length > 0) {
    const dcBonus = Number(dcText);
    if (Number.isFinite(dcBonus)) options.dcBonus = dcBonus;
  }

  await craftItem(host.actor, host.characterSystem, item, options);
}

// ------------------------------------------------------------- the panel

registerPanel({
  id: "crafting",
  template: "systems/fallout-ttrpg/templates/actor/parts/crafting.hbs",

  actions: {
    async openCraftBench(this: PanelHost) {
      const chosen = await pickRecipe(this.characterSystem.derived.skillBonuses);
      if (chosen) await runCraft(this, chosen.item, chosen.blueprint);
    },
    async craftOwned(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const id = target.dataset.itemId;
      const item = id === undefined ? undefined : this.actor.items.get(id);
      if (!item) return;
      const blueprint = item.getFlag(SYSTEM_ID, "blueprint") as Blueprint | undefined;
      if (!blueprint) {
        ui.notifications.warn(localize("FALLOUT.Crafting.noBlueprint", { item: item.name }));
        return;
      }
      await runCraft(this, item, blueprint);
    },
  },

  context(actor: FoundryActor, system: CharacterData) {
    const bonuses = system.derived.skillBonuses;

    // Anything already on the sheet that carries a recipe. This is the common
    // craft at the table — another twelve rounds of 10mm, another stimpak — and
    // it needs no compendium read at all, which is what keeps this synchronous.
    const recipes: Record<string, unknown>[] = [];
    // Crafting stamps the blueprint onto the copy it builds, so a crafter who
    // has made three stimpaks owns three stimpak recipes. One row per name:
    // they are the same recipe, and any copy of it is an equally good source.
    const listed = new Set<string>();
    for (const item of actor.items) {
      const blueprint = item.getFlag(SYSTEM_ID, "blueprint") as Blueprint | undefined;
      if (!blueprint || listed.has(item.name)) continue;
      listed.add(item.name);
      const preview = previewRecipe(item.name, blueprint, bonuses);
      recipes.push({
        id: item.id,
        name: item.name,
        check: checksText(preview),
        summary: summaryText(preview),
        automatic: preview.automatic,
        craftable: preview.craftable,
        blocked: preview.blocked,
      });
    }
    recipes.sort((left, right) => String(left.name).localeCompare(String(right.name)));

    // The drinks gate is worth surfacing unprompted: it is the only
    // prerequisite in the chapter that closes a whole table (pg 115), and a
    // player short in one of three skills otherwise finds out at the bench.
    const short = drinkBrewingShortfall("drinks", bonuses).map(skillLabel);

    return {
      // Every skill the Encyclopedia rolls against, because fourteen of its
      // tables are not Crafting tables at all (pg 94-115).
      skills: CRAFT_SKILLS.map((skill) => ({
        label: skillLabel(skill),
        bonus: signed(bonuses[skill]),
        ability: system.derived.skillAbilities[skill],
      })),
      recipes,
      drinkWarning:
        short.length > 0
          ? localize("FALLOUT.Crafting.Bench.drinkGate", {
              minimum: DRINK_BREWING_MINIMUM_BONUS,
              skills: short.join(", "),
            })
          : null,
    };
  },
});
