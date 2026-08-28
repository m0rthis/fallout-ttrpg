#!/usr/bin/env node
/**
 * Generate the compendium artwork from the vendored game-icons.net SVGs.
 *
 * Reads packs-src/icon-map.json (entry name -> "<author>/<icon>") plus the
 * matching files under packs-src/icons/, and writes:
 *
 *   static/assets/tokens/<slug>.svg   400x400 circular creature tokens
 *   static/assets/icons/<slug>.svg    256x256 rounded-square item tiles
 *
 * Runs before `vite build` (which copies static/ into dist/) and before
 * scripts/build-packs.mjs, which points each compendium document at the
 * generated file when one exists. Deterministic and idempotent: identical
 * inputs produce byte-identical outputs, and unchanged files are not
 * rewritten.
 *
 * Source icons are CC BY 3.0 — see static/assets/LICENSE-ICONS.md.
 */

import fs from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const srcDir = path.join(root, "packs-src");
const iconDir = path.join(srcDir, "icons");
const tokenOut = path.join(root, "static", "assets", "tokens");
const tileOut = path.join(root, "static", "assets", "icons");

// ------------------------------------------------------------------ palette

/** Pip-Boy field colours shared by every generated asset. */
const FIELD_INNER = "#26312a";
const FIELD_OUTER = "#0d110d";
const SHADOW = "#000000";

/** Ring colour per creature family (matched on the npc `type` field). */
const FAMILY_COLORS = {
  ghoul: "#6ee86e", // phosphor green
  abomination: "#ffb641", // amber
  animal: "#c96a3b", // rust
  insect: "#c96a3b",
  robot: "#7fb2d8", // steel blue
  humanoid: "#cfc9a8", // bone
};

/** Tile colour per item type. */
const ITEM_COLORS = {
  weapon: "#6ee86e",
  armor: "#ffb641",
  ammo: "#cfc9a8",
  gear: "#c96a3b",
  aid: "#c96a3b",
  perk: "#6ee86e",
  trait: "#ffb641",
};
const ITEM_COLOR_DEFAULT = "#c96a3b";

/**
 * Aid covers five very different things, so its tiles are keyed on the
 * consumable's own category rather than the item type.
 */
const AID_COLORS = {
  food: "#c96a3b", // rust
  drink: "#7fb2d8", // steel blue
  medicine: "#6ee86e", // phosphor green
  chem: "#ffb641", // amber
  program: "#7fb2d8",
  magazine: "#cfc9a8", // bone
};

/** Map a creature's `type` string onto a family key. */
function family(type) {
  const t = (type ?? "").toLowerCase();
  if (t.includes("ghoul")) return "ghoul";
  if (t.includes("abomination") || t.includes("mutant")) return "abomination";
  if (t.includes("robot")) return "robot";
  if (t.includes("insect")) return "insect";
  if (t.includes("animal") || t.includes("beast")) return "animal";
  return "humanoid";
}

// -------------------------------------------------------------------- utils

/** Slug used for every generated filename: lowercase, non-alphanumeric -> "-". */
function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Same normalisation build-packs.mjs applies to creature names. */
function cleanName(name) {
  return name.replace(/[.,]\s*$/, "").replace(/,\s*/g, " ");
}

function readJson(name) {
  const file = path.join(srcDir, name);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Pull the icon geometry out of a game-icons.net source file. Those files are
 * a black 512x512 backdrop path followed by the icon itself painted white; we
 * want the second one only, so it can be recoloured on our own field.
 */
function extractPath(file) {
  const svg = fs.readFileSync(file, "utf8");
  for (const tag of svg.match(/<path\b[^>]*>/g) ?? []) {
    if (!/fill\s*=\s*["']#fff["']/i.test(tag)) continue;
    const d = /\bd\s*=\s*"([^"]+)"/.exec(tag);
    if (d) return d[1];
  }
  return null;
}

/** Write only when the bytes actually change, so reruns are no-ops. */
function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

// ------------------------------------------------------------------ emitters

/**
 * 400x400 circular creature token: dark radial field, family-coloured outer
 * ring, inner shadow ring, and the game-icon centred at 62% of the canvas.
 */
function tokenSvg(pathData, color, label) {
  const size = 400;
  const c = size / 2;
  const ring = 14;
  const r = c - ring / 2 - 4;
  const scale = (size * 0.62) / 512;
  const gid = `f${slugify(label)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${escapeXml(label)}">
  <title>${escapeXml(label)}</title>
  <defs>
    <radialGradient id="${gid}" cx="50%" cy="42%" r="62%">
      <stop offset="0%" stop-color="${FIELD_INNER}"/>
      <stop offset="100%" stop-color="${FIELD_OUTER}"/>
    </radialGradient>
  </defs>
  <circle cx="${c}" cy="${c}" r="${r}" fill="url(#${gid})"/>
  <circle cx="${c}" cy="${c}" r="${r - ring}" fill="none" stroke="${SHADOW}" stroke-opacity="0.55" stroke-width="10"/>
  <g transform="translate(${c} ${c}) scale(${scale.toFixed(6)}) translate(-256 -256)">
    <path fill="${color}" d="${pathData}"/>
  </g>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${ring}"/>
  <circle cx="${c}" cy="${c}" r="${r - ring / 2 - 3}" fill="none" stroke="${color}" stroke-opacity="0.25" stroke-width="2"/>
</svg>
`;
}

/**
 * 256x256 rounded-square item tile: dark field, thin type-coloured border and
 * the game-icon centred at 66% of the canvas.
 */
function tileSvg(pathData, color, label) {
  const size = 256;
  const c = size / 2;
  const pad = 6;
  const scale = (size * 0.66) / 512;
  const gid = `f${slugify(label)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${escapeXml(label)}">
  <title>${escapeXml(label)}</title>
  <defs>
    <radialGradient id="${gid}" cx="50%" cy="38%" r="70%">
      <stop offset="0%" stop-color="${FIELD_INNER}"/>
      <stop offset="100%" stop-color="${FIELD_OUTER}"/>
    </radialGradient>
  </defs>
  <rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}" rx="26" fill="url(#${gid})"/>
  <g transform="translate(${c} ${c}) scale(${scale.toFixed(6)}) translate(-256 -256)">
    <path fill="${color}" d="${pathData}"/>
  </g>
  <rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}" rx="26" fill="none" stroke="${color}" stroke-width="3"/>
  <rect x="${pad + 7}" y="${pad + 7}" width="${size - pad * 2 - 14}" height="${size - pad * 2 - 14}" rx="20" fill="none" stroke="${color}" stroke-opacity="0.22" stroke-width="1.5"/>
</svg>
`;
}

function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, (ch) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[ch],
  );
}

// --------------------------------------------------------------------- main

const mapFile = path.join(srcDir, "icon-map.json");
if (!fs.existsSync(mapFile)) {
  console.log("tokens: packs-src/icon-map.json missing — nothing to build");
  process.exit(0);
}
const iconMap = JSON.parse(fs.readFileSync(mapFile, "utf8"));

/** Cache extracted path data so each vendored file is parsed once. */
const pathCache = new Map();
const missingIcons = new Set();
function iconPath(ref) {
  if (!ref) return null;
  if (pathCache.has(ref)) return pathCache.get(ref);
  const file = path.join(iconDir, `${ref}.svg`);
  let d = null;
  if (fs.existsSync(file)) d = extractPath(file);
  if (!d) missingIcons.add(ref);
  pathCache.set(ref, d);
  return d;
}

function resolve(key, fallbackKey) {
  return iconPath(iconMap[key]) ?? iconPath(iconMap[fallbackKey]);
}

let tokens = 0;
let tiles = 0;
let written = 0;
const unmapped = [];
const seen = new Map();

function emit(dir, slug, content, key) {
  const prior = seen.get(`${dir}/${slug}`);
  if (prior && prior !== key) console.warn(`tokens: slug collision "${slug}" (${prior} vs ${key})`);
  seen.set(`${dir}/${slug}`, key);
  if (writeIfChanged(path.join(dir, `${slug}.svg`), content)) written++;
}

// creatures -> circular tokens
for (const npc of readJson("npcs.json")) {
  const name = cleanName(npc.name);
  const key = `npc:${name}`;
  const d = resolve(key, "_fallback:npc");
  if (!d) {
    unmapped.push(key);
    continue;
  }
  if (!iconMap[key]) unmapped.push(key);
  const color = FAMILY_COLORS[family(npc.type)] ?? FAMILY_COLORS.humanoid;
  emit(tokenOut, slugify(name), tokenSvg(d, color, name), key);
  tokens++;
}

// items -> rounded-square tiles
for (const file of [
  "weapons.json",
  "armor.json",
  "ammo.json",
  "aid-food.json",
  "aid-med.json",
  "gear.json",
  "perks.json",
  "traits.json",
]) {
  for (const entry of readJson(file)) {
    const key = `item:${entry.type}:${entry.name}`;
    // Aid falls back per consumable category first (food, chem, …), then to
    // the generic aid glyph.
    const aidType = entry.type === "aid" ? entry.system?.aidType : null;
    const d =
      iconPath(iconMap[key]) ??
      (aidType ? iconPath(iconMap[`_fallback:aid:${aidType}`]) : null) ??
      iconPath(iconMap[`_fallback:${entry.type}`]);
    if (!d) {
      unmapped.push(key);
      continue;
    }
    if (!iconMap[key]) unmapped.push(key);
    const color = aidType
      ? (AID_COLORS[aidType] ?? ITEM_COLOR_DEFAULT)
      : (ITEM_COLORS[entry.type] ?? ITEM_COLOR_DEFAULT);
    emit(tileOut, slugify(entry.name), tileSvg(d, color, entry.name), key);
    tiles++;
  }
}

if (missingIcons.size) {
  console.warn(`tokens: ${missingIcons.size} icon file(s) not vendored: ${[...missingIcons].join(", ")}`);
}
if (unmapped.length) {
  console.warn(`tokens: ${unmapped.length} entr(ies) fell back to a category default`);
}
console.log(
  `tokens: ${tokens} creature tokens, ${tiles} item tiles ` +
    `(${pathCache.size} source icons, ${written} file(s) updated)`,
);
