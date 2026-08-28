/**
 * Local artwork overrides.
 *
 * The system ships CC-BY artwork generated from game-icons.net so the repo
 * stays FOSS-publishable. A table that wants richer art (screenshots, ripped
 * game assets, commissioned pieces) drops image files into a folder in their
 * own Foundry user data — nothing enters this repository. Any file whose name
 * slugifies to a document's name replaces that document's artwork.
 *
 *   <folder>/deathclaw.webp          → the Deathclaw actor and its token
 *   <folder>/tokens/deathclaw.webp   → actors only
 *   <folder>/icons/10mm-pistol.webp  → items only
 *
 * Documents get their art at creation time (dragging out of a compendium), and
 * the settings button re-scans and updates everything already in the world.
 */

const SYSTEM_ID = "fallout-ttrpg";
const ART_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".svg", ".gif", ".avif"];

/** Must stay in sync with slugify() in scripts/build-tokens.mjs. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface ArtIndex {
  /** Files in <folder>/tokens — actors only. */
  tokens: Map<string, string>;
  /** Files in <folder>/icons — items only. */
  icons: Map<string, string>;
  /** Files directly in <folder> — either kind. */
  root: Map<string, string>;
}

let index: ArtIndex = { tokens: new Map(), icons: new Map(), root: new Map() };

function overridePath(): string {
  const raw = game.settings.get(SYSTEM_ID, "artOverridePath");
  return (typeof raw === "string" ? raw : "").trim().replace(/^\/+|\/+$/g, "");
}

/** List image files in one folder; a missing folder is not an error. */
async function browse(path: string): Promise<string[]> {
  try {
    const result = await foundry.applications.apps.FilePicker.implementation.browse("data", path);
    return result.files;
  } catch {
    return [];
  }
}

function collect(files: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    const base = decodeURIComponent(file.split("/").pop() ?? "");
    const dot = base.lastIndexOf(".");
    if (dot <= 0) continue;
    if (!ART_EXTENSIONS.includes(base.slice(dot).toLowerCase())) continue;
    const slug = slugify(base.slice(0, dot));
    if (slug) map.set(slug, file);
  }
  return map;
}

/** Re-read the override folder. Safe to call repeatedly. */
export async function indexLocalArt(notify = false): Promise<number> {
  const root = overridePath();
  index = { tokens: new Map(), icons: new Map(), root: new Map() };
  if (!root) return 0;

  const [rootFiles, tokenFiles, iconFiles] = await Promise.all([
    browse(root),
    browse(`${root}/tokens`),
    browse(`${root}/icons`),
  ]);
  index = {
    root: collect(rootFiles),
    tokens: collect(tokenFiles),
    icons: collect(iconFiles),
  };

  const count = index.root.size + index.tokens.size + index.icons.size;
  if (notify && count > 0) {
    ui.notifications.info(
      game.i18n.localize("FALLOUT.Settings.artOverrideIndexed", { count, path: root }),
    );
  }
  return count;
}

/** The override image for a document name, or undefined when none matches. */
function lookup(kind: "actor" | "item", name: string): string | undefined {
  const slug = slugify(name);
  if (!slug) return undefined;
  const specific = kind === "actor" ? index.tokens : index.icons;
  return specific.get(slug) ?? index.root.get(slug);
}

interface CreatableDocument {
  readonly name: string;
  updateSource(data: Record<string, unknown>): unknown;
}

/** preCreate hook body: point a new document at the local art before it saves. */
function applyToNewDocument(kind: "actor" | "item", document: CreatableDocument): void {
  const src = lookup(kind, document.name);
  if (!src) return;
  const update: Record<string, unknown> = { img: src };
  if (kind === "actor") update["prototypeToken.texture.src"] = src;
  document.updateSource(update);
}

/**
 * Re-scan the folder and update every actor and item already in this world.
 * Tokens already placed on scenes keep their current image unless they are
 * linked to their actor.
 */
export async function applyLocalArt(): Promise<{ actors: number; items: number }> {
  const found = await indexLocalArt();
  if (found === 0) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Settings.artOverrideMissing", { path: overridePath() || "—" }),
    );
    return { actors: 0, items: 0 };
  }

  let actors = 0;
  let items = 0;
  for (const actor of game.actors) {
    const src = lookup("actor", actor.name);
    if (!src || actor.img === src) continue;
    await actor.update({ img: src, "prototypeToken.texture.src": src });
    actors += 1;
  }
  for (const item of game.items) {
    const src = lookup("item", item.name);
    if (!src || item.img === src) continue;
    await item.update({ img: src });
    items += 1;
  }
  // Items owned by actors (an NPC's attacks, a character's inventory) too.
  for (const actor of game.actors) {
    for (const item of actor.items) {
      const src = lookup("item", item.name);
      if (!src || item.img === src) continue;
      await item.update({ img: src });
      items += 1;
    }
  }

  ui.notifications.info(
    actors + items > 0
      ? game.i18n.localize("FALLOUT.Settings.artOverrideApplied", { actors, items })
      : game.i18n.localize("FALLOUT.Settings.artOverrideNoMatches"),
  );
  return { actors, items };
}

/** Settings-menu entry point: the "button" runs the scan instead of opening a window. */
class ApplyLocalArtApplication extends foundry.applications.api.ApplicationV2 {
  override async render(): Promise<this> {
    await applyLocalArt();
    return this;
  }
}

export function registerArtSettings(): void {
  game.settings.register(SYSTEM_ID, "artOverridePath", {
    name: "FALLOUT.Settings.artOverridePath",
    hint: "FALLOUT.Settings.artOverridePathHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: () => {
      void indexLocalArt(true);
    },
  });

  // A settings button is nicer than a macro, but the menu API has no v14 types
  // to check against — if it rejects the class, the API function still works.
  try {
    game.settings.registerMenu(SYSTEM_ID, "artOverrideApply", {
      name: "FALLOUT.Settings.artOverrideApply",
      hint: "FALLOUT.Settings.artOverrideApplyHint",
      label: "FALLOUT.Settings.artOverrideApplyButton",
      icon: "fas fa-images",
      type: ApplyLocalArtApplication,
      restricted: true,
    });
  } catch (error) {
    console.warn("fallout-ttrpg | could not register the local artwork button", error);
  }
}

/** Hook new documents so compendium imports pick up local art automatically. */
export function registerArtHooks(): void {
  Hooks.on("preCreateActor", (...args: unknown[]) => {
    applyToNewDocument("actor", args[0] as CreatableDocument);
  });
  Hooks.on("preCreateItem", (...args: unknown[]) => {
    applyToNewDocument("item", args[0] as CreatableDocument);
  });
}
