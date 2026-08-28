/**
 * Applying a background (pg 13-18) — the document-writing half.
 *
 * The decision logic is next door in `src/rules/backgrounds.ts` and is pure;
 * this file reads the compendia, writes the sheet, and posts the card.
 *
 * ## This is the most destructive button in the system, so:
 *
 * **It refuses when a background is already applied, and it is undoable.**
 * Not idempotent, and deliberately so. "Apply again" has no honest meaning
 * here: the skill half would want to be a no-op while the kit half would want
 * to rebuild a kit the player has been eating, spending and breaking since
 * character creation. So `applyBackground` writes a ledger of exactly what it
 * did — which skills it raised by how much, how many caps it added, and the id
 * of every document it created — refuses to run again while that ledger
 * exists, and `clearBackground` reverses precisely that ledger and nothing
 * else.
 *
 * The reversal is honest about its limits. Skill points and caps come back
 * exactly (floored at 0, because the sheet is editable and the player may have
 * spent below the line). Documents come back only if they are still there:
 * anything eaten, sold or deleted is simply reported as gone, because deleting
 * "the three crams it granted" out of a stack the player has since added to is
 * a guess, and this file does not guess with a player's inventory.
 *
 * ## The ledger is a flag, not schema
 *
 * `system.details.background` is a bare `StringField` in `src/data/character.ts`
 * and this pass does not own that file. A flag needs no migration, is the same
 * shape the blueprint join already uses (`scripts/build-packs.mjs`), and keeps
 * a bookkeeping record out of a field a GM types into. `details.background` is
 * still written, so the sheet's existing text field stays truthful.
 *
 * ## What is granted and what is only reported
 *
 * Granted: the three +2s, the trait document, every kit clause that names a
 * document this system ships, and the kit's caps. Reported on the card and
 * never granted: the Vault Dweller's "x1 pip-boy (any)" (the player picks),
 * the Farmer's "tomatoes" (no such item exists in the book's own food table),
 * the built-in upgrade riders (no field holds an upgrade), and the Custom
 * Background's 850-cap budget.
 */

import type { CharacterData } from "../data/character";
import type { SkillKey } from "../rules/constants";
import {
  capsAfterClear,
  getBackground,
  grantableEntries,
  isCustomBackground,
  kitDocumentNames,
  kitForRace,
  reportedEntries,
  skillPointsAfterApply,
  skillPointsAfterClear,
  type AppliedBackground,
  type Background,
  type BackgroundKit,
} from "../rules/backgrounds";

const SYSTEM_ID = "fallout-ttrpg";
const BACKGROUND_FLAG = "background";
const EQUIPMENT_PACK = `${SYSTEM_ID}.equipment`;
const PERKS_PACK = `${SYSTEM_ID}.perks`;

/** What an apply or clear did, for the sheet and the smoke suite. */
export interface BackgroundReport {
  readonly key: string;
  readonly name: string;
  readonly kitLabel: string | null;
  readonly skills: Partial<Record<SkillKey, number>>;
  readonly caps: number;
  /** Documents created (or deleted, when clearing). */
  readonly items: number;
  readonly traitGranted: boolean;
  /** Kit clauses the book leaves to the table, printed as-is. */
  readonly reported: readonly string[];
  /** Named documents the compendium did not contain. */
  readonly missing: readonly string[];
}

function localize(key: string, data?: Record<string, string | number>): string {
  return data === undefined ? game.i18n.localize(key) : game.i18n.localize(key, data);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function say(actor: FoundryActor, lines: readonly string[]): Promise<void> {
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: lines.join("<br />"),
  });
}

// ------------------------------------------------------------------ ledger

/** The ledger left by a previous apply, or null. */
export function appliedBackground(actor: FoundryActor): AppliedBackground | null {
  const stored = actor.getFlag(SYSTEM_ID, BACKGROUND_FLAG);
  if (stored === null || typeof stored !== "object") return null;
  const record = stored as Partial<AppliedBackground>;
  if (typeof record.key !== "string") return null;
  return {
    key: record.key,
    race: typeof record.race === "string" ? record.race : "",
    kitLabel: typeof record.kitLabel === "string" ? record.kitLabel : "",
    skills: record.skills ?? {},
    caps: typeof record.caps === "number" ? record.caps : 0,
    itemIds: Array.isArray(record.itemIds) ? record.itemIds : [],
  };
}

// -------------------------------------------------------------- compendium

/**
 * Whole documents rather than a pack index, for the reason
 * `src/sheets/panels/crafting.ts` gives: an index entry cannot be copied onto
 * an actor, because there is no `system` on it. Memoised for the session —
 * applying a background reads up to twenty-five names out of a 465-document
 * pack, and a background is applied once per character.
 */
let equipmentCache: Promise<Map<string, FoundryItem>> | null = null;
let perkCache: Promise<Map<string, FoundryItem>> | null = null;

async function readPack(packId: string): Promise<Map<string, FoundryItem>> {
  const pack = game.packs.get(packId);
  const byName = new Map<string, FoundryItem>();
  if (!pack) return byName;
  for (const document of await pack.getDocuments()) {
    byName.set(document.name.trim().toLowerCase(), document);
  }
  return byName;
}

async function loadPack(packId: string, which: "equipment" | "perks"): Promise<Map<string, FoundryItem>> {
  const cached = which === "equipment" ? equipmentCache : perkCache;
  const pending = cached ?? readPack(packId);
  if (which === "equipment") equipmentCache = pending;
  else perkCache = pending;
  const documents = await pending;
  // An empty read means the pack was missing, not that the wasteland has no
  // equipment — don't cache the miss, or a module loading late never recovers.
  if (documents.size === 0) {
    if (which === "equipment") equipmentCache = null;
    else perkCache = null;
  }
  return documents;
}

/**
 * `Document#toObject()`, which is how Foundry turns a compendium document into
 * creatable data — schema, embedded ActiveEffects and flags in one call.
 *
 * Declared locally rather than in `src/types/foundry.d.ts`, following the same
 * rule `src/sheets/panels/crafting.ts` states for `CompendiumPack`: that file
 * is the system's shared Foundry boundary and this pass does not own it.
 *
 * The `_id` in the result is the *pack's* id. `createEmbeddedDocuments`
 * generates a fresh one unless `keepId` is passed, which it is not — verified
 * by the smoke step that applies a background twice to two actors.
 */
interface SerializableSource {
  toObject(): Record<string, unknown>;
}

/**
 * Item data for one kit clause.
 *
 * A full `toObject()` rather than a hand-built object: it is what carries the
 * item's embedded Active Effects (a trait's whole mechanical half) and the
 * blueprint flag `scripts/build-packs.mjs` stamps on, so a kit weapon can be
 * repaired and re-crafted like any other.
 *
 * `quantity` carries the printed count where the schema has one — ammo, gear
 * and aid all do — and where it does not (weapons and armor, one document
 * each), the caller creates the document that many times instead.
 */
function itemDataFrom(source: FoundryItem, count: number, decay: number | undefined): object {
  const data = (source as unknown as SerializableSource).toObject();
  const system = (data.system ?? {}) as Record<string, unknown>;
  if ("quantity" in system) system.quantity = count;
  if (decay !== undefined && "decay" in system) system.decay = decay;
  return data;
}

// -------------------------------------------------------------------- apply

export interface ApplyBackgroundOptions {
  /** Overrides `system.details.race`, for a sheet that offers the choice. */
  readonly race?: string;
  /** Skip the chat card (the smoke suite does). */
  readonly quiet?: boolean;
}

/**
 * Apply a background to a character: three +2s, a trait, a kit and its caps.
 *
 * Returns null and warns when it refuses — an unknown key, no kit for this
 * character's race, or a background already applied. Refusing is the whole
 * safety model here; see the module note.
 */
export async function applyBackground(
  actor: FoundryActor,
  system: CharacterData,
  key: string,
  options: ApplyBackgroundOptions = {},
): Promise<BackgroundReport | null> {
  const background = getBackground(key);
  if (!background) {
    ui.notifications.warn(localize("FALLOUT.Backgrounds.unknown", { key }));
    return null;
  }
  if (appliedBackground(actor) !== null) {
    ui.notifications.warn(localize("FALLOUT.Backgrounds.alreadyApplied"));
    return null;
  }

  const race = options.race ?? system.details.race;
  const kit = isCustomBackground(background) ? null : kitForRace(background, race);
  if (!isCustomBackground(background) && kit === null) {
    ui.notifications.warn(localize("FALLOUT.Backgrounds.noKitForRace", { race }));
    return null;
  }

  const granted = await grantKit(actor, kit);
  const trait = await grantTrait(actor, background);

  const currentPoints: Partial<Record<SkillKey, number>> = {};
  for (const skill of background.skills) currentPoints[skill] = system.skills[skill].points;
  const nextPoints = skillPointsAfterApply(backgroundGrants(background), currentPoints);

  const updates: Record<string, unknown> = { "system.details.background": background.name };
  for (const [skill, points] of Object.entries(nextPoints)) {
    updates[`system.skills.${skill}.points`] = points;
  }
  const caps = kit?.caps ?? 0;
  if (caps > 0) updates["system.currency.caps"] = system.currency.caps + caps;
  await actor.update(updates);

  const itemIds = [...granted.itemIds];
  if (trait) itemIds.push(trait.id);
  const ledger: AppliedBackground = {
    key: background.key,
    race,
    kitLabel: kit?.label ?? "",
    skills: backgroundGrants(background),
    caps,
    itemIds,
  };
  await actor.setFlag(SYSTEM_ID, BACKGROUND_FLAG, ledger);

  const report: BackgroundReport = {
    key: background.key,
    name: background.name,
    kitLabel: kit?.label ?? null,
    skills: ledger.skills,
    caps,
    items: granted.itemIds.length,
    traitGranted: trait !== null,
    reported: kit ? reportedEntries(kit).map((entry) => entry.printed) : [],
    missing: granted.missing,
  };
  if (options.quiet !== true) await sayApplied(actor, background, report);
  return report;
}

function backgroundGrants(background: Background): Partial<Record<SkillKey, number>> {
  const grants: Partial<Record<SkillKey, number>> = {};
  for (const skill of background.skills) grants[skill] = 2;
  return grants;
}

async function grantKit(
  actor: FoundryActor,
  kit: BackgroundKit | null,
): Promise<{ itemIds: string[]; missing: string[] }> {
  if (!kit) return { itemIds: [], missing: [] };
  const wanted = kitDocumentNames(kit);
  if (wanted.length === 0) return { itemIds: [], missing: [] };

  const pack = await loadPack(EQUIPMENT_PACK, "equipment");
  const creates: object[] = [];
  const missing: string[] = [];
  for (const entry of grantableEntries(kit)) {
    const name = entry.name;
    if (name === null) continue;
    const source = pack.get(name.trim().toLowerCase());
    if (!source) {
      missing.push(name);
      continue;
    }
    const stacks = "quantity" in (source.system as Record<string, unknown>);
    // Weapons and armor have no quantity field, so "x2 dynamite" is two
    // documents there and one document of two elsewhere.
    const copies = stacks ? 1 : entry.count;
    for (let made = 0; made < copies; made += 1) {
      creates.push(itemDataFrom(source, entry.count, entry.decay));
    }
  }
  const created = creates.length > 0 ? await actor.createEmbeddedDocuments("Item", creates) : [];
  return { itemIds: created.map((item) => item.id), missing };
}

async function grantTrait(
  actor: FoundryActor,
  background: Background,
): Promise<FoundryItem | null> {
  const wanted = background.trait;
  if (wanted === null) return null;
  const pack = await loadPack(PERKS_PACK, "perks");
  const source = pack.get(wanted.trim().toLowerCase());
  if (!source) return null;
  // The trait's own Active Effect rides on the pack document as an embedded
  // collection; `toObject()` is what brings it across, and it is what makes a
  // mechanical trait mechanical the moment it lands on the sheet.
  const [created] = await actor.createEmbeddedDocuments("Item", [
    (source as unknown as SerializableSource).toObject(),
  ]);
  return created ?? null;
}

async function sayApplied(
  actor: FoundryActor,
  background: Background,
  report: BackgroundReport,
): Promise<void> {
  const lines = [
    `<strong>${escapeHtml(background.name)}</strong> <em>(pg ${String(background.page)})</em>`,
  ];
  if (background.skills.length > 0) {
    const skills = background.skills
      .map((skill) => localize(`FALLOUT.Skills.${skill}`))
      .join(", ");
    lines.push(localize("FALLOUT.Backgrounds.cardSkills", { skills }));
  }
  if (background.trait !== null) {
    lines.push(
      localize(
        report.traitGranted ? "FALLOUT.Backgrounds.cardTrait" : "FALLOUT.Backgrounds.cardTraitMissing",
        { trait: background.trait },
      ),
    );
  }
  if (report.kitLabel !== null) {
    lines.push(
      localize("FALLOUT.Backgrounds.cardKit", {
        kit: escapeHtml(report.kitLabel),
        items: report.items,
        caps: report.caps,
      }),
    );
  }
  if (background.equipmentNote !== undefined) {
    lines.push(`<em>${escapeHtml(background.equipmentNote)}</em>`);
  }
  if (report.reported.length > 0) {
    lines.push(
      localize("FALLOUT.Backgrounds.cardReported", {
        entries: report.reported.map(escapeHtml).join(", "),
      }),
    );
  }
  if (report.missing.length > 0) {
    lines.push(
      localize("FALLOUT.Backgrounds.cardMissing", {
        entries: report.missing.map(escapeHtml).join(", "),
      }),
    );
  }
  await say(actor, lines);
}

// -------------------------------------------------------------------- clear

/**
 * Undo exactly what `applyBackground` recorded.
 *
 * Reverses the skill points and the caps from the ledger — not from the
 * current printing of the background, so a later data fix cannot make an old
 * character's undo wrong — and deletes the documents it created that are still
 * on the sheet. Returns null (with a warning) when there is no ledger.
 */
export async function clearBackground(
  actor: FoundryActor,
  system: CharacterData,
  options: { readonly quiet?: boolean } = {},
): Promise<BackgroundReport | null> {
  const applied = appliedBackground(actor);
  if (applied === null) {
    ui.notifications.warn(localize("FALLOUT.Backgrounds.nothingApplied"));
    return null;
  }

  const present = applied.itemIds.filter((id) => actor.items.get(id) !== undefined);
  // Taken BEFORE the deletion below, or every id the ledger holds reads as
  // missing: the delete empties the sheet, and a filter run after it can no
  // longer tell "eaten last week" from "removed a millisecond ago". Shipped
  // wrong originally — every clear reported its whole kit as already gone the
  // first time this path ran live.
  const missing = applied.itemIds.filter((id) => actor.items.get(id) === undefined);
  if (present.length > 0) await actor.deleteEmbeddedDocuments("Item", present);

  const currentPoints: Partial<Record<SkillKey, number>> = {};
  for (const skill of Object.keys(applied.skills) as SkillKey[]) {
    currentPoints[skill] = system.skills[skill].points;
  }
  const nextPoints = skillPointsAfterClear(applied, currentPoints);
  const updates: Record<string, unknown> = { "system.details.background": "" };
  for (const [skill, points] of Object.entries(nextPoints)) {
    updates[`system.skills.${skill}.points`] = points;
  }
  if (applied.caps > 0) {
    updates["system.currency.caps"] = capsAfterClear(applied, system.currency.caps);
  }
  await actor.update(updates);
  await actor.unsetFlag(SYSTEM_ID, BACKGROUND_FLAG);

  const background = getBackground(applied.key);
  const report: BackgroundReport = {
    key: applied.key,
    name: background?.name ?? applied.key,
    kitLabel: applied.kitLabel === "" ? null : applied.kitLabel,
    skills: applied.skills,
    caps: applied.caps,
    items: present.length,
    traitGranted: false,
    reported: [],
    // Documents the ledger recorded that were no longer on the sheet when the
    // clear began: eaten, sold, or deleted. Named by id because the name is
    // gone with them. Computed above, before the delete.
    missing,
  };
  if (options.quiet !== true) {
    await say(actor, [
      localize("FALLOUT.Backgrounds.cardCleared", {
        name: escapeHtml(report.name),
        items: report.items,
        caps: report.caps,
      }),
      ...(report.missing.length > 0
        ? [localize("FALLOUT.Backgrounds.cardGone", { count: report.missing.length })]
        : []),
    ]);
  }
  return report;
}
