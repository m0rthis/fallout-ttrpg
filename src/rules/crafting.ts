/**
 * Crafting (pg 92; the Item Blueprint Encyclopedia pg 94-115).
 *
 * > **How to Craft.** You can craft any item so long as you have the listed
 * > materials and your Crafting skill bonus is equal to the listed requirement.
 * > […] Additionally, you must have the suitable space and tools to craft the
 * > item.
 * >
 * > **Crafting Check.** If your Crafting skill does not meet the required
 * > amount, you can instead roll a Crafting skill check with the DC equal to
 * > 10 + the item's Crafting DC listed on the table. […] You can also roll a
 * > Crafting skill check even if your Crafting skill meets the required amount
 * > in an attempt to reduce less materials, however if you do; you run the risk
 * > of potentially failing to craft the item.
 * >
 * > **Failed.** You fail to craft the item, and you lose 1d4 of each material
 * > used (to a minimum of 1 material).
 * > **Failed by 8 or more.** You fail to craft the item, and you lose 1d6 of
 * > each material used.
 * > **Succeeded.** You craft the item and use all the required materials.
 * > **Succeeded by 8 or more.** You craft the item and use 1d4 less material
 * > from one material used (to a minimum of 1 material).
 * >
 * > **Assistance.** If another creature assists you in crafting the item […]
 * > the crafting time is reduced by half for every additional creature that
 * > assists. […] However, they must also succeed in the crafting check if their
 * > crafting skill does not meet the required amount […] If they fail, the item
 * > fails to be crafted even if you or any other creatures succeed
 *
 * (The section ends there, mid-sentence and without a full stop. That is how
 * page 92 is printed.)
 *
 * Four things this module has to get right, none of them obvious from the prose
 * alone:
 *
 * - **The "Craft DC" column is a bonus, not a DC** (pg 92, and the identical
 *   caveat for Repair on pg 93). The check is against `10 + the printed
 *   number`. Same trap `src/actions/repair.ts` documents.
 * - **Crafting is not always a Crafting check.** Fourteen of the thirty-three
 *   Encyclopedia tables head their DC column with a *different* skill —
 *   "Science DC" for energy ammunition, "Medicine DC" for medicine, "Survival
 *   DC" for food, "Science or Survival DC" for drinks, "Crafting and Explosives
 *   DC" for both explosives tables. Every heading in `CATEGORY_FORMATS` below
 *   was read off a 150 dpi render of its page, because `pdftotext -layout`
 *   misaligns these tables (see `packs-src/BLUEPRINT-NOTES.md`).
 * - **The automatic-success path is the *normal* path**, not the exception.
 *   Meeting the listed requirement means you simply craft the thing; the check
 *   exists for people who are short of it, or who want to gamble for a material
 *   discount.
 * - **Power Armor is a multi-day build with a check every day** (pg 94), and
 *   one failed day loses the whole thing.
 *
 * Pure functions only: no document writes, no Foundry globals, no i18n. The
 * document-writing half lives in `src/actions/crafting.ts`.
 */

import type { SkillKey } from "./constants";

// --------------------------------------------------------------- constants

/** "the DC equal to 10 + the item's Crafting DC listed on the table" (pg 92). */
export const CRAFT_DC_BASE = 10;

/** The margin that promotes a failure to a rout, or a success to a discount (pg 92). */
export const CRAFT_MARGIN = 8;

/** "(to a minimum of 1 material)" — no material line ever falls below this (pg 92). */
export const MATERIAL_MINIMUM = 1;

/** Materials lost per line on an ordinary failure (pg 92). */
export const FAILURE_LOSS_DIE = "1d4";

/**
 * Materials lost per line on a failure by 8 or more (pg 92). The book prints
 * **no** "minimum of 1" rider on this tier, unlike the other two — see
 * `materialsSpent()` for the ruling.
 */
export const SEVERE_FAILURE_LOSS_DIE = "1d6";

/** Materials saved from one line on a success by 8 or more (pg 92). */
export const MATERIAL_SAVING_DIE = "1d4";

/**
 * Brewing any drink needs Crafting, Survival **and** Science at +8 or better
 * (pg 115), on top of the row's own printed DC. This is the only prerequisite
 * in the chapter that gates a whole table.
 */
export const DRINK_BREWING_MINIMUM_BONUS = 8;
export const DRINK_BREWING_SKILLS: readonly SkillKey[] = ["crafting", "survival", "science"];

/** The Encyclopedia category whose rows follow the pg 94 multi-day rule. */
export const POWER_ARMOR_CATEGORY = "power-armor";

/**
 * Minutes per printed time unit. The book never defines a month; 30 days is
 * this system's assumption and only Wasteland Wine ("Six months.", pg 115)
 * depends on it.
 */
const MINUTES_PER_UNIT = {
  minute: 1,
  hour: 60,
  day: 1440,
  week: 10080,
  month: 43200,
} as const;

type TimeUnit = keyof typeof MINUTES_PER_UNIT;

const MINUTES_PER_DAY = MINUTES_PER_UNIT.day;

/** The book spells one time cell out in words ("Six months.", pg 115). */
const NUMBER_WORDS: Record<string, number | undefined> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

// ------------------------------------------------------- the blueprint row

/** One row of the Item Blueprint Encyclopedia, as `packs-src/blueprints.json` stores it. */
export interface Blueprint {
  readonly name: string;
  readonly category: string;
  /**
   * The printed Craft DC cell: an integer for the 303 plain rows, the verbatim
   * string for the 52 that stack ranks or name a second skill, `null` for the
   * 21 printed "-" (uncraftable). The extraction deliberately refused to pick a
   * number for the string rows; parsing them is this module's job.
   */
  readonly craftDC: number | string | null;
  readonly craftMaterials: string | null;
  readonly craftTime: string | null;
  /** How many the recipe yields — the ammunition tables' "No. crafted" column. */
  readonly yield?: number;
  readonly note?: string;
}

// ---------------------------------------------------- which skill, per table

/**
 * What a table's DC column *means*. The `heading` strings are transcribed
 * verbatim from the printed column header, which is the only place the book
 * says which skill a row is rolled against.
 */
export interface CategoryFormat {
  /** The printed column heading, verbatim. */
  readonly heading: string;
  /** Skills a bare "+N" refers to. More than one means the crafter picks. */
  readonly primary: readonly SkillKey[];
  /** The skill a bare *second* number refers to ("+5 and +3"). */
  readonly secondary: SkillKey | null;
  /** The cell is a modifier on some base recipe's DC, not an absolute DC. */
  readonly modifier: boolean;
}

const CRAFTING_ONLY: CategoryFormat = {
  heading: "Crafting DC",
  primary: ["crafting"],
  secondary: null,
  modifier: false,
};

function format(
  heading: string,
  primary: readonly SkillKey[],
  secondary: SkillKey | null = null,
  modifier = false,
): CategoryFormat {
  return { heading, primary, secondary, modifier };
}

/**
 * Category → printed DC-column heading, for all 33 tables (pg 94-115). Each was
 * confirmed against a page render; the `packs-src/blueprints.json` `note`
 * strings record the same headings independently, and the two agree.
 */
export const CATEGORY_FORMATS: Record<string, CategoryFormat> = {
  // pg 94-101, 104-112, 115 — plain "Crafting DC".
  armor: CRAFTING_ONLY,
  "armor-upgrades": CRAFTING_ONLY,
  "power-armor": CRAFTING_ONLY,
  "power-armor-upgrades": CRAFTING_ONLY,
  "bladed-melee-weapons": CRAFTING_ONLY,
  "blunt-melee-weapons": CRAFTING_ONLY,
  "mechanical-melee-weapons": CRAFTING_ONLY,
  "unarmed-armor-upgrades": CRAFTING_ONLY,
  "melee-weapon-mods": CRAFTING_ONLY,
  ammunition: CRAFTING_ONLY,
  pistols: CRAFTING_ONLY,
  "sub-machine-guns": CRAFTING_ONLY,
  rifles: CRAFTING_ONLY,
  shotguns: CRAFTING_ONLY,
  "big-guns": CRAFTING_ONLY,
  "energy-weapons": CRAFTING_ONLY,
  "ranged-weapons-mods": CRAFTING_ONLY,
  "items-and-gear": CRAFTING_ONLY,
  "unique-items": CRAFTING_ONLY,

  // pg 101 — "Crafting, Science, or Explosives DC": any one of the three.
  gunpowder: format("Crafting, Science, or Explosives DC", ["crafting", "science", "explosives"]),
  // pg 102 — "Crafting / Explosive DC.", printed as "+25/+20". See the ruling
  // on the slash in `parseRequirement()`.
  "heavy-ammunition": format("Crafting / Explosive DC.", ["crafting"], "explosives"),
  // pg 102 — "Science DC".
  "energy-ammunition": format("Science DC", ["science"]),
  // pg 102-103 — modifier tables. Their DC is added to a base recipe's DC
  // (pg 102 worked example: base .308 is +6, Armor Piercing adds +6 → +12), so
  // they are never craftable on their own.
  "special-ammunition": format("Crafting DC modifier.", ["crafting"], null, true),
  "special-energy-weapons-ammunition": format("Science DC modifier.", ["science"], null, true),
  "syringes-special-ammunition": format(
    "Medicine or Science DC modifier.",
    ["medicine", "science"],
    null,
    true,
  ),
  // pg 111 — "Crafting and Explosives DC", printed as "+5 and +3".
  "thrown-explosives": format("Crafting and Explosives DC", ["crafting"], "explosives"),
  "placed-explosives": format("Crafting and Explosives DC", ["crafting"], "explosives"),
  // pg 112 — "Crafting or Science DC".
  chems: format("Crafting or Science DC", ["crafting", "science"]),
  // pg 113 — "Medicine DC".
  medicine: format("Medicine DC", ["medicine"]),
  // pg 113-114 — "Survival DC". Cooking is a Survival table, not a Crafting one.
  "pre-made-food": format("Survival DC", ["survival"]),
  "untitled-food-table": format("Survival DC", ["survival"]),
  // pg 115 — "Survival DC" for the ingredients, "Science or Survival DC" for
  // the drinks themselves.
  "drink-ingredients": format("Survival DC", ["survival"]),
  drinks: format("Science or Survival DC", ["science", "survival"]),
};

/** Falls back to Crafting: 19 of the 33 tables genuinely head their column that way. */
export function categoryFormat(category: string): CategoryFormat {
  return CATEGORY_FORMATS[category] ?? CRAFTING_ONLY;
}

// -------------------------------------------------------- DC cell → checks

/** One check the crafter has to make. Several skills means the crafter picks one. */
export interface SkillRequirement {
  readonly skills: readonly SkillKey[];
  /** The printed bonus. The DC is `CRAFT_DC_BASE + bonus`. */
  readonly bonus: number;
}

export interface CraftRequirement {
  /** Every check that must be passed; all of them, not the best of them. */
  readonly checks: readonly SkillRequirement[];
  /** How many ranks the row prints (1 when it prints none). */
  readonly rankCount: number;
  /** The rank these checks belong to (1-based). */
  readonly rank: number;
  /**
   * Printed text in the DC cell that is a requirement but not a skill check —
   * Lucky Charm's "Luck ability score must be 7 or higher.", Camouflage rank
   * 3's "or Sneak skill bonus equal to +8." Surfaced, never silently dropped.
   */
  readonly rider: string | null;
}

export type RequirementFailure =
  /** The cell prints "-": "Cannot be crafted." / "Unable to be crafted." */
  | { readonly ok: false; readonly reason: "uncraftable"; readonly text: string }
  /** A modifier table row: a delta on some base recipe, not a recipe (pg 102). */
  | { readonly ok: false; readonly reason: "modifier"; readonly text: string }
  /** A shape the parser does not recognise. Better to say so than to guess. */
  | { readonly ok: false; readonly reason: "unparsed"; readonly text: string };

export type RequirementResult =
  | { readonly ok: true; readonly value: CraftRequirement }
  | RequirementFailure;

const SKILL_NAMES: Record<string, SkillKey | undefined> = {
  crafting: "crafting",
  science: "science",
  explosives: "explosives",
  explosive: "explosives",
  medicine: "medicine",
  survival: "survival",
  sneak: "sneak",
  barter: "barter",
  breach: "breach",
  speech: "speech",
};

/** Split "Rank 1: …; Rank 2: …" into its rank expressions, in printed order. */
function splitRanks(cell: string): string[] {
  if (!/^Rank\s*\d/i.test(cell.trim())) return [cell];
  return cell
    .split(/;\s*(?=Rank\s*\d)/i)
    .map((part) => part.replace(/^Rank\s*\d+\s*:\s*/i, "").trim())
    .filter((part) => part.length > 0);
}

/**
 * Parse one rank's DC expression into checks plus whatever text is left over.
 *
 * The shapes the book actually prints, all of them from `blueprints.json`:
 *
 * - `+10`                               a bare bonus in the column's own skill
 * - `Crafting +18 and Science +9`       two named skills, both required
 * - `+8 and Explosives +6`              the column's skill, then a named one
 * - `+5 and +3`                         the column's two skills, in header order
 * - `+25/+20`                           the same, printed with a slash
 * - `+2 Medicine or Survival.`          one check, crafter's choice of skill
 * - `+16, or Sneak skill bonus equal to +8.`   a check plus an alternative route
 * - `+2 and Luck ability score must be 7 or higher.`  a check plus a non-skill gate
 *
 * "and" versus "or" is load-bearing and the book is consistent about it: Healing
 * Powder says "+2 Medicine or Survival." where Auto-Inject Stimpak says "+4 and
 * Crafting +8". So an "and" really does mean two checks.
 *
 * **The slash is the one exception, and it is a ruling.** Heavy Ammunition
 * (pg 102) heads its column "Crafting / Explosive DC." and prints "+25/+20"; it
 * never says "and" or "or". Read here as **and**, matching every other
 * two-number cell in the chapter — and because "or" would make the Crafting
 * half dead text, since the Explosives number is always the lower of the two.
 */
function parseExpression(cell: string, fmt: CategoryFormat): {
  checks: SkillRequirement[];
  rider: string | null;
} {
  const checks: SkillRequirement[] = [];
  const riders: string[] = [];
  // Unnamed numbers fill the header's skills left to right.
  const unnamed: (readonly SkillKey[])[] = [fmt.primary];
  if (fmt.secondary) unnamed.push([fmt.secondary]);
  let unnamedIndex = 0;

  const text = cell.trim().replace(/\.$/, "");

  // "+2 Medicine or Survival" — a single bonus followed by the skills it may be
  // rolled with. Checked first, because the " or " here is a choice of skill
  // rather than an alternative requirement.
  const choice = /^\+?(-?\d+)\s+([A-Za-z]+(?:\s+or\s+[A-Za-z]+)+)$/.exec(text);
  if (choice?.[1] !== undefined && choice[2] !== undefined) {
    const skills = choice[2]
      .split(/\s+or\s+/i)
      .map((name) => SKILL_NAMES[name.toLowerCase()])
      .filter((skill): skill is SkillKey => skill !== undefined);
    if (skills.length > 0) {
      return { checks: [{ skills, bonus: Number(choice[1]) }], rider: null };
    }
  }

  for (const segment of text.split(/\s*\/\s*|\s+and\s+|,\s*or\s+/i)) {
    const piece = segment.trim();
    if (piece.length === 0) continue;
    const named = /^([A-Za-z]+)\s*\+(-?\d+)$/.exec(piece);
    if (named?.[1] !== undefined && named[2] !== undefined) {
      const skill = SKILL_NAMES[named[1].toLowerCase()];
      if (skill) {
        checks.push({ skills: [skill], bonus: Number(named[2]) });
        continue;
      }
      riders.push(piece);
      continue;
    }
    const bare = /^\+(-?\d+)$/.exec(piece);
    if (bare?.[1] !== undefined) {
      const skills = unnamed[Math.min(unnamedIndex, unnamed.length - 1)] ?? fmt.primary;
      unnamedIndex += 1;
      checks.push({ skills, bonus: Number(bare[1]) });
      continue;
    }
    // Anything else is prose: "Luck ability score must be 7 or higher",
    // "Sneak skill bonus equal to +8". Kept for the card to print.
    riders.push(piece);
  }

  return { checks, rider: riders.length > 0 ? riders.join("; ") : null };
}

/**
 * Resolve a blueprint's Craft DC cell into the checks it demands.
 *
 * `rank` picks one of a multi-rank upgrade's rows (1-based, clamped). The book
 * never says you must build ranks in order, so nothing here enforces that.
 */
export function craftRequirement(blueprint: Blueprint, rank = 1): RequirementResult {
  const fmt = categoryFormat(blueprint.category);
  if (fmt.modifier) {
    return {
      ok: false,
      reason: "modifier",
      text: typeof blueprint.craftDC === "number" ? `+${String(blueprint.craftDC)}` : (blueprint.craftDC ?? ""),
    };
  }
  if (blueprint.craftDC === null) {
    return { ok: false, reason: "uncraftable", text: blueprint.craftMaterials ?? "" };
  }
  if (typeof blueprint.craftDC === "number") {
    return {
      ok: true,
      value: {
        checks: [{ skills: fmt.primary, bonus: blueprint.craftDC }],
        rankCount: 1,
        rank: 1,
        rider: null,
      },
    };
  }

  const ranks = splitRanks(blueprint.craftDC);
  const index = Math.min(Math.max(rank, 1), ranks.length) - 1;
  const expression = ranks[index];
  if (expression === undefined) {
    return { ok: false, reason: "unparsed", text: blueprint.craftDC };
  }
  const parsed = parseExpression(expression, fmt);
  if (parsed.checks.length === 0) {
    return { ok: false, reason: "unparsed", text: blueprint.craftDC };
  }
  return {
    ok: true,
    value: {
      checks: parsed.checks,
      rankCount: ranks.length,
      rank: index + 1,
      rider: parsed.rider,
    },
  };
}

// ------------------------------------------------------------ the check

/** "the DC equal to 10 + the item's Crafting DC listed on the table" (pg 92). */
export function craftDC(bonus: number): number {
  return CRAFT_DC_BASE + bonus;
}

/**
 * "your Crafting skill bonus is equal to the listed requirement" (pg 92).
 *
 * Read as *at least*, not exactly, for the same reason `repairItem()` does: a
 * better crafter failing where a worse one succeeds cannot be what the sentence
 * means. Where a check offers a choice of skills the best of them is used —
 * the crafter would pick that one anyway.
 */
export function meetsRequirement(
  check: SkillRequirement,
  bonuses: Readonly<Record<SkillKey, number>>,
): boolean {
  return check.skills.some((skill) => bonuses[skill] >= check.bonus);
}

/** The skill a crafter would actually roll for a check: their best of the choices. */
export function bestSkillFor(
  check: SkillRequirement,
  bonuses: Readonly<Record<SkillKey, number>>,
): SkillKey {
  return check.skills.reduce((best, skill) => (bonuses[skill] > bonuses[best] ? skill : best));
}

/**
 * Whether the whole requirement is met outright, which is the pg 92 "How to
 * Craft" path: no roll at all, full materials spent.
 */
export function craftsAutomatically(
  requirement: CraftRequirement,
  bonuses: Readonly<Record<SkillKey, number>>,
): boolean {
  return requirement.checks.every((check) => meetsRequirement(check, bonuses));
}

export type CraftOutcome = "failedBadly" | "failed" | "succeeded" | "succeededWell";

/** The pg 92 result ladder, keyed on the margin against the DC. */
export function craftOutcome(total: number, dc: number): CraftOutcome {
  const margin = total - dc;
  if (margin >= CRAFT_MARGIN) return "succeededWell";
  if (margin >= 0) return "succeeded";
  if (margin > -CRAFT_MARGIN) return "failed";
  return "failedBadly";
}

export function isCraftSuccess(outcome: CraftOutcome): boolean {
  return outcome === "succeeded" || outcome === "succeededWell";
}

/** The worst of several checks decides the craft — one failure sinks it (pg 92). */
export function worstOutcome(outcomes: readonly CraftOutcome[]): CraftOutcome {
  const order: CraftOutcome[] = ["failedBadly", "failed", "succeeded", "succeededWell"];
  return outcomes.reduce<CraftOutcome>(
    (worst, outcome) => (order.indexOf(outcome) < order.indexOf(worst) ? outcome : worst),
    "succeededWell",
  );
}

// ---------------------------------------------------------------- materials

/** One line of a printed Crafting Materials cell. */
export interface CraftMaterial {
  /** The quantity as printed, or null when the line is prose rather than a count. */
  readonly quantity: number | null;
  /** The material name ("steel", "crafting material", "8oz blood"). */
  readonly name: string;
  /** The line exactly as printed. */
  readonly text: string;
}

export interface ParsedMaterials {
  readonly materials: readonly CraftMaterial[];
  /**
   * The cell as printed, narrowed to the requested rank — always shown on the
   * card, since counting can only ever be a lossy view of the printed text.
   */
  readonly text: string;
  /**
   * The cell offers alternative recipes ("…, or", "Or;"). Only the first is
   * costed; the printed text carries the rest. Twenty-odd rows do this, and
   * picking between them is a player decision the book leaves open.
   */
  readonly hasAlternatives: boolean;
}

/**
 * Split a printed Crafting Materials cell into countable lines.
 *
 * Deliberately forgiving, because the book is not consistent: `x 6 oil` has a
 * stray space (Overclock Hydraulics, pg 96), `xx1 crafting material` a doubled
 * x (Machete, pg 97), `8oz blood` no x at all (Stimpak, pg 113), and several
 * cells run two materials together with no punctuation (Bottlecap Mine,
 * pg 111). Anything that will not parse as a count is kept as a prose line with
 * a null quantity rather than dropped — "x1 wood, plastic, or bone and a sharp
 * edge" (Shiv, pg 97) is a real requirement even though nothing can count it.
 */
export function parseMaterials(cell: string | null, rank = 1): ParsedMaterials {
  const whole = cell ?? "";
  if (whole.trim().length === 0) {
    return { materials: [], text: whole, hasAlternatives: false };
  }
  // Upgrade tables stack all three ranks into one cell — "Rank 1: … . Rank 2:
  // … ." — so a rank has to be cut out before anything is counted, or a rank-1
  // build charges for all three. (Pocketed, pg 94, labels all three lines
  // "Rank 1:"; splitting on the label still yields them in printed order,
  // which is the best that can be done without editing the book.)
  const segments = /Rank\s*\d+\s*:/i.test(whole)
    ? whole.split(/(?:^|[.;]\s*)Rank\s*\d+\s*:\s*/i).filter((part) => part.trim().length > 0)
    : [whole];
  const text = segments[Math.min(Math.max(rank, 1), segments.length) - 1] ?? whole;
  const materials: CraftMaterial[] = [];
  for (const raw of text.split(/,|;|\s+and\s+|\bOr\b|\s+(?=x\s*\d+\s)/i)) {
    const piece = raw.trim().replace(/\.$/, "").trim();
    if (piece.length === 0) continue;
    const ounces = /^(\d+)\s*oz\s+(.+)$/i.exec(piece);
    if (ounces?.[1] !== undefined && ounces[2] !== undefined) {
      materials.push({ quantity: Number(ounces[1]), name: `oz ${ounces[2]}`, text: piece });
      continue;
    }
    const counted = /^x*\s*(\d+)\s*(?:x\s*)?(.+)$/i.exec(piece);
    if (counted?.[1] !== undefined && counted[2] !== undefined) {
      materials.push({ quantity: Number(counted[1]), name: counted[2].trim(), text: piece });
      continue;
    }
    materials.push({ quantity: null, name: piece, text: piece });
  }
  return { materials, text, hasAlternatives: /\bor\b/i.test(text) };
}

/** What one material line costs once the check has resolved. */
export interface MaterialCost {
  readonly name: string;
  readonly required: number | null;
  /** How many are consumed — spent on a success, lost on a failure. */
  readonly spent: number | null;
  readonly text: string;
}

/**
 * The index of the material line a "Succeeded by 8 or more" discount should
 * come off.
 *
 * **The book does not say who chooses.** It says only "1d4 less material from
 * one material used". The crafter choosing is the obvious reading, and the
 * largest line is the choice a crafter would make — anywhere else the
 * minimum-of-1 floor eats most of the saving. Returns -1 when nothing is
 * countable.
 */
export function bestSavingIndex(materials: readonly CraftMaterial[]): number {
  let best = -1;
  let bestQuantity = 0;
  materials.forEach((material, index) => {
    if (material.quantity !== null && material.quantity > bestQuantity) {
      best = index;
      bestQuantity = material.quantity;
    }
  });
  return best;
}

/**
 * Apply the pg 92 material consequences.
 *
 * Two silences, both ruled here rather than left to bite:
 *
 * - **"you lose 1d4 of each material used (to a minimum of 1 material)".** A
 *   single die roll governing every line is the plain reading of one die
 *   expression covering "each material"; `roll` is therefore applied to all of
 *   them rather than re-rolled per line. You also cannot lose more of something
 *   than the recipe called for, so the loss is capped at the required quantity.
 * - **The "failed by 8 or more" tier prints no minimum-of-1 rider at all.** The
 *   same floor and the same cap are applied anyway: without the cap, failing by
 *   8 could cost 6 of a material the recipe uses 1 of, and without the floor a
 *   worse failure could cost *less* than a better one. Neither can be intended.
 */
export function materialsSpent(
  materials: readonly CraftMaterial[],
  outcome: CraftOutcome,
  roll: number,
  savingIndex = -1,
): MaterialCost[] {
  return materials.map((material, index) => {
    const required = material.quantity;
    if (required === null) {
      return { name: material.name, required: null, spent: null, text: material.text };
    }
    let spent = required;
    if (outcome === "succeededWell" && index === savingIndex) {
      spent = Math.max(MATERIAL_MINIMUM, required - roll);
    } else if (outcome === "failed" || outcome === "failedBadly") {
      spent = Math.max(MATERIAL_MINIMUM, Math.min(roll, required));
    }
    return { name: material.name, required, spent, text: material.text };
  });
}

/** Every material line multiplied — Power Armor's whole-build cost (pg 94). */
export function multiplyMaterials(
  materials: readonly CraftMaterial[],
  factor: number,
): CraftMaterial[] {
  return materials.map((material) => ({
    quantity: material.quantity === null ? null : material.quantity * factor,
    name: material.name,
    text: material.text,
  }));
}

// ------------------------------------------------------------------- time

/**
 * A printed Crafting Time cell in minutes, or null when it is not a duration.
 *
 * Three cells in the Encyclopedia are jokes rather than times — Board's "It's
 * just a board!", Board with a nail, and Bone Club's "You… you just pick it
 * up." (pp. 98). Those return null and the printed text is shown instead.
 */
export function parseCraftTime(cell: string | null): number | null {
  if (cell === null) return null;
  const match = /^\s*([A-Za-z]+|\d+)\s*(minute|hour|day|week|month)s?\s*\.?\s*$/i.exec(cell);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const word = match[1].toLowerCase();
  const count = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word];
  if (count === undefined) return null;
  return count * MINUTES_PER_UNIT[match[2].toLowerCase() as TimeUnit];
}

/**
 * "the crafting time is reduced by half for every additional creature that
 * assists" (pg 92), with the book's own worked example: 1 hour → 30 minutes with
 * one assistant, 15 minutes with two.
 *
 * The book does not say what happens to a fraction of a minute. Rounded down,
 * never below one minute, matching every other rounding the book does state.
 */
export function assistedMinutes(minutes: number, assistants: number): number {
  if (assistants <= 0) return minutes;
  return Math.max(1, Math.floor(minutes / 2 ** assistants));
}

const UNIT_ORDER: readonly (readonly [string, number])[] = [
  ["month", MINUTES_PER_UNIT.month],
  ["week", MINUTES_PER_UNIT.week],
  ["day", MINUTES_PER_UNIT.day],
  ["hour", MINUTES_PER_UNIT.hour],
  ["minute", MINUTES_PER_UNIT.minute],
];

/** Render minutes back into the book's own vocabulary for the chat card. */
export function formatMinutes(minutes: number): string {
  for (const [unit, size] of UNIT_ORDER) {
    if (minutes >= size && minutes % size === 0) {
      const count = minutes / size;
      return `${String(count)} ${unit}${count === 1 ? "" : "s"}`;
    }
  }
  return `${String(minutes)} minutes`;
}

// ------------------------------------------------------------ Power Armor

/**
 * > Each day you spend crafting power armor, you must succeed the Crafting
 * > skill check (unless your crafting bonus is equal to the DC) and you must
 * > spend the required crafting materials each day. If you ever fail this
 * > crafting check, the entire armor build is failed and you must restart. If
 * > another creature assists you in crafting power armor, the crafting time is
 * > still reduced however you still require the same amount of materials.
 * > Instead of using the materials each day, multiple all the required
 * > materials by the original crafting time. — pg 94
 *
 * ("multiple" is printed for "multiply".)
 *
 * Two readings this pins down:
 *
 * - **"unless your crafting bonus is equal to the DC"** contradicts pg 92,
 *   which sets the automatic-success bar at *the listed requirement* — the
 *   printed bonus, not `10 + bonus`. Taken literally, a T-45 (Craft DC +18)
 *   would need Crafting +28 to build without rolling. pg 92 wins: the book uses
 *   "DC" loosely for that column everywhere, including in the column heading
 *   itself. The stricter reading is not implemented anywhere.
 * - **Assistance still costs full materials.** Unassisted you pay the daily
 *   cost for the printed number of days; assisted you pay the same total in
 *   fewer days. So the multiplier is always the *original* day count, and the
 *   number of checks is the number of days you actually spend.
 *
 * This applies to the six `power-armor` rows only. The pg 94 paragraph is
 * headed "Power Armor" and sits above that table; the Power Armor Upgrades
 * table (3 hours a piece) is a different table and is not brought in.
 */
export interface PowerArmorSchedule {
  /** The printed build length in days, which is also the material multiplier. */
  readonly originalDays: number;
  /** Days actually spent, after assistance — one check per day. */
  readonly days: number;
  readonly materialMultiplier: number;
}

export function isPowerArmorBuild(category: string): boolean {
  return category === POWER_ARMOR_CATEGORY;
}

export function powerArmorSchedule(minutes: number, assistants: number): PowerArmorSchedule {
  const originalDays = Math.max(1, Math.ceil(minutes / MINUTES_PER_DAY));
  const days = Math.max(1, Math.ceil(assistedMinutes(minutes, assistants) / MINUTES_PER_DAY));
  return { originalDays, days, materialMultiplier: originalDays };
}

// ----------------------------------------------------------------- drinks

/**
 * "you would need to at least have a Crafting, Survival, and Science skill
 * bonuses of at least +8, access to the various ingredients, and lots of time
 * to brew the drinks" (pg 115).
 *
 * Applied to the `drinks` table only, not to `drink-ingredients`: Yeast prints
 * its own Survival +5, and demanding +8 in three skills to make yeast would
 * contradict the row directly above the paragraph. Returns the skills the
 * crafter is short in, empty when the gate is clear or does not apply.
 */
export function drinkBrewingShortfall(
  category: string,
  bonuses: Readonly<Record<SkillKey, number>>,
): SkillKey[] {
  if (category !== "drinks") return [];
  return DRINK_BREWING_SKILLS.filter((skill) => bonuses[skill] < DRINK_BREWING_MINIMUM_BONUS);
}

// ------------------------------------------------------------- workbench

/**
 * "you must have the suitable space and tools to craft the item" (pg 92).
 *
 * Nothing in this system models a workbench, and the book makes finding or
 * jury-rigging one explicitly a GM call, so this is reported on the chat card
 * rather than enforced. Note that repair is *not* gated on it — pg 92's
 * workbench paragraph is written for crafting, and `repairItem()` already
 * declines to extend it.
 */
export const REQUIRES_WORKBENCH = true;
