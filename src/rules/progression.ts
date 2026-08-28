/**
 * Levelling, XP awards, skill magazines, and buying things (pg 5-6, 22, 88).
 *
 * Three chapters that never mention each other, in one file because they are
 * the same shape: a printed rule that changes a *stored ledger* rather than a
 * die roll. The sheet already showed what a character's budgets are; nothing
 * recorded what became of them, which issues had been read, or what a purchase
 * costs. Everything here is a pure function — no documents, no Foundry, no
 * `game.i18n`; `src/actions/progression.ts` is the half that writes.
 *
 * ## What the book actually prints, and where it stops
 *
 * - **XP (pg 5).** Five award rules, four of them modifiers on a base the GM
 *   picks and one of them a party-wide equalisation. The book never states the
 *   base, never says whether the percentages compound, and never says how to
 *   round them.
 * - **Skill magazines (pg 88).** A +1 until you rest per issue, a permanent +1
 *   at five *different* issues of one title, and an explicit instruction to the
 *   *player* to keep track by hand ("Be sure to keep track of which issues
 *   you've read"). That sentence is the whole reason a ledger exists here.
 * - **Barter's Discount (pg 22).** A percentage off one purchase, recharging on
 *   an 8-hour rest. The only rule in 136 pages that spends caps.
 *
 * Each ruling below is marked where the book is silent. None of them is
 * presented as printed text.
 */

import {
  ABILITIES,
  ABILITY_MAX,
  type Ability,
  LEVEL_MAX,
  type SkillKey,
  SKILL_KEYS,
} from "./constants";
import { clampLevel, levelForXP, totalPerkPoints, totalSkillPoints } from "./formulas";
import { REST_RECHARGE_HOURS } from "./rest";

// ---------------------------------------------------------------------------
// XP and the five award rules (pg 5)
// ---------------------------------------------------------------------------

/** "Whenever you gain 1000 XP, you gain a level" (pg 5). */
export const XP_PER_LEVEL = 1000;

/**
 * "Death. 1000 XP is awarded to each player character if another player
 * character permanently dies" (pg 5). A flat award, not a percentage — the
 * only one of the four modifiers that is.
 */
export const XP_DEATH_AWARD = 1000;

/**
 * "Reaching 0 Hit Points. A 10% bonus of XP is awarded for each player
 * character that fell to 0 hit points" (pg 5). *Each*, so it multiplies with
 * the number of characters who went down.
 */
export const XP_DOWNED_BONUS = 0.1;

/** "Creature Discovery. A 20% bonus of XP" for a first combat sequence (pg 5). */
export const XP_CREATURE_DISCOVERY_BONUS = 0.2;

/** "Location Discovery. A 20% bonus of XP" for resting somewhere new (pg 5). */
export const XP_LOCATION_DISCOVERY_BONUS = 0.2;

/**
 * The session's inputs. `base` is the GM's own number: pg 5 says only that XP
 * "is typically awarded when the player characters spend any amount of time
 * resting after completing a quest, encounter, or discovering something new"
 * and prints no table of amounts anywhere in the book, so there is nothing to
 * derive it from and it is asked for rather than guessed.
 */
export interface XpAwardInput {
  /** The GM's base award, before any modifier. */
  readonly base: number;
  /** How many player characters fell to 0 hit points (pg 5). */
  readonly downed: number;
  /** A creature the party had never rolled combat sequence with (pg 5). */
  readonly creatureDiscovery: boolean;
  /** A location the party had never rested in (pg 5). */
  readonly locationDiscovery: boolean;
  /** Player characters who permanently died (pg 5). */
  readonly deaths: number;
}

export interface XpAwardBreakdown {
  readonly base: number;
  readonly downedBonus: number;
  readonly creatureBonus: number;
  readonly locationBonus: number;
  readonly deathAward: number;
  /** The percentage modifiers as one figure, e.g. 0.4 for two discoveries. */
  readonly percentage: number;
  readonly total: number;
}

/**
 * Resolve one award (pg 5).
 *
 * Three things the book does not say, and the reading taken for each:
 *
 * 1. **What the percentages are of.** "A 10% bonus of XP" has no antecedent but
 *    the award being handed out, so they are percentages of `base`.
 * 2. **Whether they compound.** They are listed as a flat set of "modifiers …
 *    added to the total", which reads as summed, not multiplied. Summed also
 *    keeps three discoveries from silently becoming ×1.73.
 * 3. **How to round.** Unstated. The book rounds down every time it does say
 *    (Party Nerve, bleeding, armor decay), so this does too — and the death
 *    award is added *after* rounding, because it is a flat award rather than a
 *    modifier and rounding it would be rounding a printed integer.
 */
export function experienceAward(input: XpAwardInput): XpAwardBreakdown {
  const base = Math.max(0, Math.floor(input.base));
  const downed = Math.max(0, Math.floor(input.downed));
  const deaths = Math.max(0, Math.floor(input.deaths));

  const downedBonus = Math.floor(base * XP_DOWNED_BONUS * downed);
  const creatureBonus = input.creatureDiscovery
    ? Math.floor(base * XP_CREATURE_DISCOVERY_BONUS)
    : 0;
  const locationBonus = input.locationDiscovery
    ? Math.floor(base * XP_LOCATION_DISCOVERY_BONUS)
    : 0;
  const deathAward = XP_DEATH_AWARD * deaths;

  return {
    base,
    downedBonus,
    creatureBonus,
    locationBonus,
    deathAward,
    percentage:
      XP_DOWNED_BONUS * downed +
      (input.creatureDiscovery ? XP_CREATURE_DISCOVERY_BONUS : 0) +
      (input.locationDiscovery ? XP_LOCATION_DISCOVERY_BONUS : 0),
    total: base + downedBonus + creatureBonus + locationBonus + deathAward,
  };
}

/**
 * The catch-up rule (pg 5): "Whenever you gain XP, if your XP total is lower
 * than any other player character's total XP, you gain XP equal to the
 * difference between your total and theirs. (Simply put: everyone shares the
 * same amount of XP, defaulting to whoever has the highest)."
 *
 * Read literally the first sentence is circular — "theirs" is ambiguous with
 * three characters at three totals — but the parenthetical settles it outright,
 * so this is simply "raise everyone to the party maximum". The extra XP a
 * character receives is returned per entry, because it is *not* the same number
 * for everyone and a party that cannot see the difference cannot audit it.
 *
 * Note the rule is written as a consequence of gaining XP, not as a standing
 * invariant: a character joining the party mid-campaign does not catch up until
 * the next award. The caller decides when to run it; this only computes it.
 */
export function catchUpGains(totals: readonly number[]): number[] {
  if (totals.length === 0) return [];
  const highest = Math.max(...totals);
  return totals.map((total) => Math.max(0, highest - total));
}

/**
 * XP still needed for the next level, or 0 at the level cap (pg 5-6).
 *
 * The Level Up Table stops at 30 (`LEVEL_MAX`), and pg 5 prints no rule for XP
 * past it, so a character there is simply done: the figure would be a countdown
 * to a level that does not exist.
 */
export function xpToNextLevel(xp: number): number {
  const level = levelForXP(xp);
  if (level >= LEVEL_MAX) return 0;
  return level * XP_PER_LEVEL - Math.max(0, Math.floor(xp));
}

// ---------------------------------------------------------------------------
// Spending what a level grants (pg 5)
// ---------------------------------------------------------------------------

/**
 * What a point went on.
 *
 * A perk point is "increase one of your ability scores by 1 **or** … choose a
 * perk" (pg 5), so `ability` and `perk` are the two ways to spend the same
 * currency and both count against the perk budget. `skill` spends skill points,
 * which are a separate budget entirely.
 */
export const SPEND_KINDS = ["skill", "ability", "perk"] as const;
export type SpendKind = (typeof SPEND_KINDS)[number];

export interface SpendRecord {
  readonly kind: SpendKind;
  /** Skill key, ability key, or the perk's name. */
  readonly key: string;
  /** Points spent. Always 1 for `ability` and `perk`; any amount for `skill`. */
  readonly points: number;
  /** The character level this was spent at, for reading the ledger back. */
  readonly level: number;
  /** Free text the player can leave on the row. */
  readonly note: string;
}

/** Skill points the ledger accounts for. */
export function skillPointsSpent(records: readonly SpendRecord[]): number {
  return records.reduce((sum, record) => (record.kind === "skill" ? sum + record.points : sum), 0);
}

/** Perk points the ledger accounts for — ability raises and perks alike (pg 5). */
export function perkPointsSpent(records: readonly SpendRecord[]): number {
  return records.reduce(
    (sum, record) => (record.kind === "skill" ? sum : sum + record.points),
    0,
  );
}

/** Skill points the ledger says went into each skill. */
export function skillPointsBySkill(
  records: readonly SpendRecord[],
): Record<SkillKey, number> {
  const out = Object.fromEntries(SKILL_KEYS.map((skill) => [skill, 0])) as Record<
    SkillKey,
    number
  >;
  for (const record of records) {
    if (record.kind !== "skill") continue;
    if (!(record.key in out)) continue;
    out[record.key as SkillKey] += record.points;
  }
  return out;
}

export interface ProgressionBudget {
  readonly level: number;
  /** The level this character's XP entitles them to (pg 5). */
  readonly suggestedLevel: number;
  readonly levelMismatch: boolean;
  readonly xp: number;
  readonly xpToNext: number;
  readonly perkTotal: number;
  readonly perkSpent: number;
  readonly perkRemaining: number;
  readonly skillTotal: number;
  readonly skillSpent: number;
  readonly skillRemaining: number;
  /**
   * Skill points visible on the sheet (`skills.*.points`) beyond what the
   * ledger accounts for. Backgrounds grant three +2s and a magazine's permanent
   * bonus is *not* stored there, so a positive figure is ordinary; a negative
   * one means the ledger claims points the skills do not show.
   */
  readonly unledgeredSkillPoints: number;
}

/**
 * Budgets and what is left of them (pg 5-6, Level Up Table).
 *
 * `sheetSkillPoints` is the total of `skills.*.points` as the character sheet
 * stores it. It is deliberately compared rather than trusted: that field
 * predates this ledger and holds background bonuses too, so treating it as
 * "points spent" would have shown every background character as overspent.
 */
export function progressionBudget(
  level: number,
  xp: number,
  intelligenceScore: number,
  records: readonly SpendRecord[],
  sheetSkillPoints: number,
): ProgressionBudget {
  const clamped = clampLevel(level);
  const perkTotal = totalPerkPoints(clamped);
  const skillTotal = totalSkillPoints(clamped, intelligenceScore);
  const perkSpent = perkPointsSpent(records);
  const skillSpent = skillPointsSpent(records);
  return {
    level: clamped,
    suggestedLevel: levelForXP(xp),
    levelMismatch: levelForXP(xp) !== clamped,
    xp,
    xpToNext: xpToNextLevel(xp),
    perkTotal,
    perkSpent,
    perkRemaining: perkTotal - perkSpent,
    skillTotal,
    skillSpent,
    skillRemaining: skillTotal - skillSpent,
    unledgeredSkillPoints: sheetSkillPoints - skillSpent,
  };
}

/**
 * Whether a perk point may raise this score.
 *
 * Pg 20 caps a player character's ability scores at 10 (`ABILITY_MAX`); pg 5's
 * "increase one of your ability scores by 1" names no ceiling of its own, so
 * the score cap is the one that applies. Creatures go to 20, but creatures do
 * not spend perk points.
 */
export function canRaiseAbility(score: number): boolean {
  return score < ABILITY_MAX;
}

/** The ability a perk point would raise, one step (pg 5). */
export function raisedAbilityScore(score: number): number {
  return Math.min(ABILITY_MAX, score + 1);
}

// ---------------------------------------------------------------------------
// Skill magazines (pg 88)
// ---------------------------------------------------------------------------

/**
 * "After you read five different issues of the same magazine, your associated
 * skill bonus permanently increases by 1" (pg 88).
 */
export const MAGAZINE_ISSUES_FOR_PERMANENT = 5;

/** "a number of minutes to read equal to 5 minus your Intelligence ability modifier" (pg 88). */
export const MAGAZINE_READ_MINUTES_BASE = 5;

/** "if this number is reduced to 0 you can read the skill magazine with 6 AP" (pg 88). */
export const MAGAZINE_READ_AP = 6;

/** "Each magazine typically costs around 50 caps and has a load of 2" (pg 88). */
export const MAGAZINE_TYPICAL_COST = 50;
export const MAGAZINE_TYPICAL_LOAD = 2;

/**
 * The fourteen printed titles and the skill each one raises (pg 88 table, read
 * from the page image — the layout extraction merges its two columns).
 *
 * Keyed by title because that is what the shipped items are named and what a
 * player writes on their sheet ("¡La Fantoma! issue #4 read"). There is exactly
 * one magazine per skill, so the map is also a complete cover of the fourteen
 * skills.
 */
export const SKILL_MAGAZINES = {
  "Milsurp Review": "guns",
  "Future Weapons Today": "energyWeapons",
  "Patriot's Cookbook": "explosives",
  "Tæles of Chivalrie": "meleeWeapons",
  "Boxing Times": "unarmed",
  "Today's Physician": "medicine",
  "Locksmith's Reader": "breach",
  "Fixin' Things": "crafting",
  "¡La Fantoma!": "sneak",
  "Lad's Life": "survival",
  "Salesman Weekly": "barter",
  "Horror Comics": "intimidation",
  "Meeting People": "speech",
  "Programmer's Digest": "science",
} as const satisfies Record<string, SkillKey>;

/**
 * Normalise a title for lookup: the shipped pack uses typographic apostrophes
 * ("Fixin’ Things", "Lad’s Life") and a player typing the title will not.
 */
function normalizeTitle(title: string): string {
  return title
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const MAGAZINES_BY_TITLE = new Map<string, SkillKey>(
  Object.entries(SKILL_MAGAZINES).map(([title, skill]) => [normalizeTitle(title), skill]),
);

/**
 * Which skill a magazine raises.
 *
 * The title is authoritative, because the fourteen are printed by name. A
 * homebrew or renamed magazine falls back to its own effect text, which every
 * shipped item carries verbatim ("Your Guns skill bonus increases by 1 until
 * you rest") — matched on the skill key rather than a localized label, since
 * this file cannot see `game.i18n`. Returns null when neither identifies a
 * skill, and the caller must refuse rather than guess: a magazine that silently
 * raised the wrong skill would be worse than one that does nothing.
 */
export function magazineSkill(title: string, effectText = ""): SkillKey | null {
  const byTitle = MAGAZINES_BY_TITLE.get(normalizeTitle(title));
  if (byTitle) return byTitle;
  const haystack = effectText.toLowerCase();
  // Longest key first, so "energyWeapons" is not shadowed by a bare "weapons"
  // fragment and "meleeWeapons" wins over "melee".
  const words = [...SKILL_KEYS].sort((left, right) => right.length - left.length);
  for (const skill of words) {
    // "energyWeapons" -> "energy weapons"; "meleeWeapons" -> "melee weapons".
    const phrase = skill.replace(/([A-Z])/g, " $1").toLowerCase();
    if (haystack.includes(phrase)) return skill;
  }
  return null;
}

export interface MagazineReadTime {
  /** Minutes of reading, or 0 when the AP option applies. */
  readonly minutes: number;
  /** AP the read costs instead, or null when it takes minutes. */
  readonly apCost: number | null;
}

/**
 * What reading an issue costs (pg 88).
 *
 * "they take a number of minutes to read equal to 5 minus your Intelligence
 * ability modifier, if this number is reduced to 0 you can read the skill
 * magazine with 6 AP." A player character reaches 0 at Intelligence 10 exactly
 * and cannot go below it; a creature with Intelligence above 10 could, and the
 * book never contemplates it, so anything at or under 0 takes the AP branch.
 * The negative-modifier direction is printed as written: low Intelligence makes
 * the read *longer* (7 minutes at Intelligence 3), which the subtraction does
 * by itself.
 */
export function magazineReadTime(intelligenceMod: number): MagazineReadTime {
  const minutes = MAGAZINE_READ_MINUTES_BASE - intelligenceMod;
  if (minutes <= 0) return { minutes: 0, apCost: MAGAZINE_READ_AP };
  return { minutes, apCost: null };
}

/** One magazine title's read-issue ledger (pg 88). */
export interface MagazineLedgerEntry {
  readonly title: string;
  /** Distinct issue numbers already read, ascending. */
  readonly issues: readonly number[];
  /** Whether this title's "+1 until you rest" is currently in force. */
  readonly untilRest: boolean;
  /**
   * The skill recorded when the issue was read. Preferred over re-resolving
   * from the title, which cannot see the item's effect text and so fails for
   * every magazine the book does not name.
   */
  readonly skill?: SkillKey;
}

/** Issue numbers from the stored comma-separated string, deduplicated and sorted. */
export function parseIssues(stored: string): number[] {
  const seen = new Set<number>();
  for (const part of stored.split(",")) {
    const value = Number.parseInt(part.trim(), 10);
    if (Number.isInteger(value) && value > 0) seen.add(value);
  }
  return [...seen].sort((left, right) => left - right);
}

/** The stored form of an issue list. */
export function formatIssues(issues: readonly number[]): string {
  return [...new Set(issues)].sort((left, right) => left - right).join(", ");
}

/** Whether this title has crossed the five-issue threshold (pg 88). */
export function hasPermanentBonus(issues: readonly number[]): boolean {
  return new Set(issues).size >= MAGAZINE_ISSUES_FOR_PERMANENT;
}

export interface MagazineReadResult {
  /** The ledger entry after the read. Unchanged when the issue was already read. */
  readonly entry: MagazineLedgerEntry;
  /** "Once you read an issue … you can no longer gain its benefits" (pg 88). */
  readonly alreadyRead: boolean;
  /** Whether this read granted the +1 until rest. */
  readonly gainedUntilRest: boolean;
  /** Whether this read crossed the fifth-issue threshold. */
  readonly gainedPermanent: boolean;
  /** Distinct issues read after this one. */
  readonly issueCount: number;
}

/**
 * Read one issue (pg 88).
 *
 * Three silences in the printed rule, and the reading taken for each:
 *
 * 1. **Does a second issue of the same magazine stack its until-rest +1?** The
 *    table prints one line per magazine — "Your Guns skill bonus increases by 1
 *    until you rest" — and the prose never contemplates two at once. Ruled
 *    **non-stacking per title**: reading a second Milsurp Review issue before
 *    resting refreshes the same +1 rather than making it +2. Stacking would let
 *    a stack of five issues buy +5 for an afternoon, which is five times the
 *    permanent reward for the same five issues.
 * 2. **Does the fifth issue grant both bonuses?** Taken **literally: yes.** The
 *    table effect applies to every issue read, and pg 88 adds the permanent +1
 *    as a separate sentence with its own trigger. So the fifth read is +2 until
 *    the next rest and +1 thereafter. The book does not say the until-rest
 *    bonus is what becomes permanent, and the difference lasts one rest.
 * 3. **Does a tenth issue grant a second permanent +1?** Ruled **no** — "After
 *    you read five different issues … increases by 1" is a one-time threshold,
 *    and an every-five escalation is not printed anywhere.
 *
 * Re-reading a known issue is not an error, it is just worth nothing: the book
 * says so outright, and the caller reports it rather than refusing.
 */
export function readIssue(entry: MagazineLedgerEntry, issue: number): MagazineReadResult {
  const known = new Set(entry.issues);
  const alreadyRead = known.has(issue);
  if (alreadyRead) {
    return {
      entry,
      alreadyRead: true,
      gainedUntilRest: false,
      gainedPermanent: false,
      issueCount: known.size,
    };
  }
  const before = hasPermanentBonus(entry.issues);
  const issues = [...known, issue].sort((left, right) => left - right);
  return {
    entry: { title: entry.title, issues, untilRest: true },
    alreadyRead: false,
    gainedUntilRest: !entry.untilRest,
    gainedPermanent: !before && hasPermanentBonus(issues),
    issueCount: issues.length,
  };
}

export interface MagazineBonuses {
  /** The permanent +1s, by skill (pg 88). */
  readonly permanent: Record<SkillKey, number>;
  /** The "until you rest" +1s currently in force, by skill (pg 88). */
  readonly untilRest: Record<SkillKey, number>;
  /** Both together — what the sheet actually adds to the skill bonus. */
  readonly total: Record<SkillKey, number>;
}

const zeroed = (): Record<SkillKey, number> =>
  Object.fromEntries(SKILL_KEYS.map((skill) => [skill, 0])) as Record<SkillKey, number>;

/**
 * Fold a whole ledger into per-skill bonuses (pg 88).
 *
 * Every entry is resolved through `magazineSkill`, so an entry whose title no
 * longer maps to a skill contributes nothing rather than crashing the derived
 * pass — the same tolerance `prepareDerivedData` already shows an unknown
 * disease key.
 */
export function magazineBonuses(entries: readonly MagazineLedgerEntry[]): MagazineBonuses {
  const permanent = zeroed();
  const untilRest = zeroed();
  const total = zeroed();
  for (const entry of entries) {
    const skill = entry.skill ?? magazineSkill(entry.title);
    if (!skill) continue;
    if (hasPermanentBonus(entry.issues)) permanent[skill] += 1;
    // Per title, never per issue — see ruling 1 on `readIssue`.
    if (entry.untilRest) untilRest[skill] += 1;
  }
  for (const skill of SKILL_KEYS) {
    total[skill] = permanent[skill] + untilRest[skill];
  }
  return { permanent, untilRest, total };
}

// ---------------------------------------------------------------------------
// Caps and Barter's Discount (pg 22)
// ---------------------------------------------------------------------------

/**
 * "Once you use this ability, you cannot use it again until you rest for 8
 * hours" (pg 22).
 *
 * Taken from `REST_RECHARGE_HOURS` rather than a fresh 8, because this is the
 * same 8-hour rest the perk and trait recharge clauses name — and this system
 * follows pg 119's 6-hour long rest for everything else (see `src/rules/rest.ts`
 * for that contradiction). The Discount prints its own 8 explicitly, so a
 * 6-hour rest does not recharge it.
 */
export const DISCOUNT_REST_HOURS = REST_RECHARGE_HOURS;

export interface PurchaseQuote {
  /** The merchant's asking price, before any discount. */
  readonly listPrice: number;
  /** The percentage taken off, as a whole number (pg 22). */
  readonly discountPercent: number;
  /** Caps taken off the list price. */
  readonly discount: number;
  /** What the buyer actually pays. */
  readonly price: number;
  /** Whether the buyer holds enough caps for it. */
  readonly affordable: boolean;
  /** Caps left afterwards; negative when they cannot afford it. */
  readonly remaining: number;
}

/**
 * Price one purchase, with or without Barter's Discount (pg 22).
 *
 * "When you purchase an item from a merchant with any kind of currency, you can
 * gain a percentage discount equal to your Barter skill bonus on that item."
 * So a Barter bonus of +7 is 7% off — a *percentage*, not caps, which is why a
 * high-Barter character saves more on a power armor frame than on a Nuka-Cola.
 *
 * Two silences:
 *
 * - **A negative Barter bonus.** The rule is written as a benefit the player
 *   chooses to use ("you can gain"), never as a surcharge, so a negative bonus
 *   is clamped to 0: the ability simply buys nothing. Nobody opts into paying
 *   more.
 * - **Rounding.** Unstated, like every other percentage in the book. The
 *   discount is rounded down, in line with the book's habit everywhere it does
 *   say, which also keeps a 1-cap item from becoming free.
 */
export function quotePurchase(
  listPrice: number,
  caps: number,
  barterBonus: number,
  useDiscount: boolean,
): PurchaseQuote {
  const list = Math.max(0, Math.floor(listPrice));
  const percent = useDiscount ? Math.max(0, Math.floor(barterBonus)) : 0;
  const discount = Math.min(list, Math.floor((list * percent) / 100));
  const price = list - discount;
  return {
    listPrice: list,
    discountPercent: percent,
    discount,
    price,
    affordable: caps >= price,
    remaining: caps - price,
  };
}

/**
 * Whether a stored spend record's key names a real ability.
 *
 * Ledger keys are plain strings — a `perk` record holds a perk's *name*, which
 * is free text — so the ability branch has to be narrowed before it can index
 * `abilities`. Exported so the panel and the action agree on the check rather
 * than each re-deriving it.
 */
export function isAbilityKey(key: string): key is Ability {
  return (ABILITIES as readonly string[]).includes(key);
}

/** The same narrowing for a `skill` record's key, which is a skill key. */
export function isSkillKey(key: string): key is SkillKey {
  return (SKILL_KEYS as readonly string[]).includes(key);
}
