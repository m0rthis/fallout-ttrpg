/**
 * Levelling, XP awards, skill magazines and buying things — the half that
 * writes documents (pg 5-6, 22, 88).
 *
 * The rules are in `src/rules/progression.ts` and are pure. Everything here is
 * a *control someone presses*: an award the GM hands out, a point a player
 * decides to spend, an issue they decide to read, a purchase they agree to.
 * None of it runs off a hook, and nothing writes a document in response to
 * another document's write — the constraint `src/actions/situations.ts` sets
 * out and the reason this project has never needed a document-change listener.
 *
 * Two of these functions want a caller this pass does not own:
 *
 * - `restProgression()` belongs at the end of `rest()` in
 *   `src/actions/rest.ts`, which clears the drink ladder in the same place.
 *   Until that one line lands, the progression panel offers the same button.
 * - `readMagazine()` belongs behind the sheet's Use control for an aid item
 *   with `aidType: "magazine"`, which currently falls through `useAid()` and
 *   consumes the issue for nothing. Until then, the panel lists magazines and
 *   reads them itself.
 */

import type { CharacterData } from "../data/character";
import { apLine } from "../combat/action-points";
import type { AidData } from "../data/items";
import { type Ability, LEVEL_MAX, type SkillKey } from "../rules/constants";
import { levelForXP } from "../rules/formulas";
import {
  catchUpGains,
  DISCOUNT_REST_HOURS,
  experienceAward,
  formatIssues,
  isAbilityKey,
  isSkillKey,
  magazineReadTime,
  magazineSkill,
  MAGAZINE_ISSUES_FOR_PERMANENT,
  parseIssues,
  type ProgressionBudget,
  progressionBudget,
  quotePurchase,
  raisedAbilityScore,
  readIssue,
  type SpendRecord,
  type XpAwardBreakdown,
  type XpAwardInput,
} from "../rules/progression";

/**
 * How many award entries a character keeps.
 *
 * The log is an audit trail for the catch-up rule, not campaign history: a
 * two-year campaign would otherwise put hundreds of rows in every actor
 * document for a panel that shows the last handful. Oldest are dropped.
 */
const AWARD_LOG_LIMIT = 30;

function localize(key: string, data?: Record<string, string | number>): string {
  return data === undefined ? game.i18n.localize(key) : game.i18n.localize(key, data);
}

async function card(actor: FoundryActor, lines: readonly string[]): Promise<void> {
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: lines.filter(Boolean).join("<br />"),
  });
}

/** The stored ledger, typed as the rules layer wants it. */
export function spendRecords(system: CharacterData): SpendRecord[] {
  return system.progression.spends.map((entry) => ({
    kind: entry.kind === "ability" || entry.kind === "perk" ? entry.kind : "skill",
    key: entry.key,
    points: entry.points,
    level: entry.level,
    note: entry.note,
  }));
}

/** Total of every `skills.*.points` on the sheet — spends and backgrounds alike. */
export function sheetSkillPoints(system: CharacterData): number {
  return Object.values(system.skills).reduce((sum, skill) => sum + skill.points, 0);
}

/**
 * This character's budgets, read off the sheet.
 *
 * Wraps `progressionBudget` so the panel and all three spend paths agree on
 * which five numbers go in — in particular that `sheetSkillPoints` is compared
 * with the ledger rather than treated as the ledger.
 */
export function budgetFor(system: CharacterData): ProgressionBudget {
  return progressionBudget(
    system.details.level,
    system.details.xp,
    system.derived.abilityScores.intelligence,
    spendRecords(system),
    sheetSkillPoints(system),
  );
}

// ---------------------------------------------------------------------------
// XP awards (pg 5)
// ---------------------------------------------------------------------------

/**
 * Every player character in the world.
 *
 * The same filter `src/rules/party.ts` uses for Party Nerve and Group Sneak —
 * `type === "character"` and player-owned — so "the party" means one thing
 * across the system. The actors themselves are needed here rather than their
 * system data, because this writes to them.
 */
function partyActors(): FoundryActor[] {
  const members: FoundryActor[] = [];
  for (const actor of game.actors) {
    if (actor.type !== "character" || !actor.hasPlayerOwner) continue;
    members.push(actor);
  }
  return members;
}

export interface AwardOptions extends XpAwardInput {
  /** What the award was for, printed on the card and kept in the log. */
  readonly reason: string;
  /**
   * Who receives the base award. Defaults to the whole party. A character left
   * out still catches up if they are behind — see the ruling in
   * `awardExperience`.
   */
  readonly recipients?: readonly FoundryActor[];
}

export interface AwardLine {
  readonly name: string;
  /** XP from the award itself. */
  readonly awarded: number;
  /** Extra XP from the pg 5 catch-up rule. */
  readonly caughtUp: number;
  readonly total: number;
  readonly level: number;
  /** True when the new total entitles them to a level they have not taken. */
  readonly levelUp: boolean;
}

export interface AwardReport {
  readonly breakdown: XpAwardBreakdown;
  readonly lines: readonly AwardLine[];
}

/**
 * Hand out XP (pg 5).
 *
 * The four modifiers are resolved by `experienceAward`; this applies the result
 * and then the fifth rule, catch-up.
 *
 * **Who catches up.** Pg 5 phrases catch-up as a consequence of gaining XP
 * ("Whenever you gain XP, if your XP total is lower…"), so only the recipients
 * of this award are levelled to the party's highest total — an absent character
 * who receives nothing does not silently gain a session's XP. Because the
 * default recipient list is the whole party, that distinction only shows up
 * when a GM deliberately narrows it.
 *
 * **Only recipients are ever written.** Non-recipients contribute their totals
 * to the comparison and are not touched, which is also what keeps an explicit
 * recipient list a safe, bounded operation.
 *
 * **The level is not set.** A character's level stays where the player put it:
 * pg 5 makes a level a set of choices (a perk point, sometimes skill points),
 * and taking them is `applyLevel` on a button. The report says who is owed one.
 */
export async function awardExperience(options: AwardOptions): Promise<AwardReport | null> {
  if (!game.user.isGM) {
    ui.notifications.warn(localize("FALLOUT.Progression.gmOnly"));
    return null;
  }
  const party = partyActors();
  const recipients = options.recipients ?? party;
  if (recipients.length === 0) {
    ui.notifications.warn(localize("FALLOUT.Progression.noParty"));
    return null;
  }
  const breakdown = experienceAward(options);

  // Award first, then equalise: catch-up compares totals *after* the award, so
  // a party that was already level with each other stays level. Recipients
  // come first in the array so their gains line up by index; the rest of the
  // party is here only to raise the bar, never to be written to.
  const recipientIds = new Set(recipients.map((actor) => actor.id));
  const bystanders = party.filter((actor) => !recipientIds.has(actor.id));
  const totalsAfter = [
    ...recipients.map((actor) => (actor.system as CharacterData).details.xp + breakdown.total),
    ...bystanders.map((actor) => (actor.system as CharacterData).details.xp),
  ];
  const gains = catchUpGains(totalsAfter);

  const lines: AwardLine[] = [];
  for (const [index, actor] of recipients.entries()) {
    const system = actor.system as CharacterData;
    const base = system.details.xp + breakdown.total;
    const caughtUp = gains[index] ?? 0;
    const total = base + caughtUp;
    const gained = total - system.details.xp;

    const log = [
      ...system.progression.awards,
      { xp: gained, reason: options.reason, total },
    ].slice(-AWARD_LOG_LIMIT);
    await actor.update({ "system.details.xp": total, "system.progression.awards": log });

    const entitled = levelForXP(total);
    lines.push({
      name: actor.name,
      awarded: breakdown.total,
      caughtUp,
      total,
      level: entitled,
      levelUp: entitled > system.details.level,
    });
  }

  const first = recipients[0] ?? party[0];
  if (first) {
    await card(first, [
      localize("FALLOUT.Progression.awardHeader", {
        reason: options.reason || localize("FALLOUT.Progression.awardUnnamed"),
        total: breakdown.total,
      }),
      localize("FALLOUT.Progression.awardBreakdown", {
        base: breakdown.base,
        downed: breakdown.downedBonus,
        creature: breakdown.creatureBonus,
        location: breakdown.locationBonus,
        death: breakdown.deathAward,
        percent: Math.round(breakdown.percentage * 100),
      }),
      ...lines.map((line) =>
        localize(
          line.caughtUp > 0
            ? "FALLOUT.Progression.awardLineCatchUp"
            : "FALLOUT.Progression.awardLine",
          { name: line.name, xp: line.awarded, caught: line.caughtUp, total: line.total },
        ),
      ),
      lines.some((line) => line.levelUp)
        ? localize("FALLOUT.Progression.awardLevelUp", {
            names: lines
              .filter((line) => line.levelUp)
              .map((line) => line.name)
              .join(", "),
          })
        : "",
    ]);
  }
  return { breakdown, lines };
}

/**
 * Take the level the XP total entitles this character to (pg 5).
 *
 * Only ever moves the level *up*, and only to what `levelForXP` says: dropping
 * a character's level would strip hit points, stamina and budgets they have
 * already spent, and the book has no rule for losing a level.
 */
export async function applyLevel(
  actor: FoundryActor,
  system: CharacterData,
): Promise<number | null> {
  const entitled = levelForXP(system.details.xp);
  if (entitled <= system.details.level) {
    ui.notifications.info(localize("FALLOUT.Progression.noLevelWaiting"));
    return null;
  }
  const level = Math.min(LEVEL_MAX, entitled);
  await actor.update({ "system.details.level": level });
  await card(actor, [
    localize("FALLOUT.Progression.levelled", { level, from: system.details.level }),
    localize("FALLOUT.Progression.levelledHint"),
  ]);
  return level;
}

// ---------------------------------------------------------------------------
// Spending level-up points (pg 5)
// ---------------------------------------------------------------------------

/**
 * Spend skill points on one skill (pg 5).
 *
 * "Each point you spend in a skill grants it a permanent +1", so this raises
 * `skills.<key>.points` *and* writes the receipt. The two are kept separate
 * because that field predates the ledger and also holds background bonuses;
 * only the ledger knows which of a character's points were level-up points.
 *
 * Overspending is refused. Pg 5 gives no rule for borrowing against a future
 * level, and a budget nothing enforces is a number, not a budget — but note the
 * refusal reads the *ledger*, so a GM who hands out points off-book can still
 * raise the skill by editing the sheet directly.
 */
export async function spendSkillPoints(
  actor: FoundryActor,
  system: CharacterData,
  skill: SkillKey,
  points: number,
  note = "",
): Promise<boolean> {
  const spend = Math.floor(points);
  if (spend <= 0) return false;
  const budget = budgetFor(system);
  if (spend > budget.skillRemaining) {
    ui.notifications.warn(
      localize("FALLOUT.Progression.notEnoughSkillPoints", {
        wanted: spend,
        left: budget.skillRemaining,
      }),
    );
    return false;
  }

  await actor.update({
    [`system.skills.${skill}.points`]: system.skills[skill].points + spend,
    "system.progression.spends": [
      ...system.progression.spends,
      { kind: "skill", key: skill, points: spend, level: system.details.level, note },
    ],
  });
  await card(actor, [
    localize("FALLOUT.Progression.spentSkill", {
      points: spend,
      skill: localize(`FALLOUT.Skills.${skill}`),
      left: budget.skillRemaining - spend,
    }),
  ]);
  return true;
}

/**
 * Spend a perk point (pg 5).
 *
 * "you can use it to increase one of your ability scores by 1 **or** you can
 * choose a perk that you meet the requirements for." Both spend the one point,
 * which is why they are one function.
 *
 * The perk branch records a name and nothing else: adding the perk *document*
 * is the existing drag-from-compendium flow, and duplicating it here would give
 * two ways to gain a perk that could disagree. The requirements are not checked
 * either — 186 perks state them in prose ("Endurance 6 and level 4 or higher",
 * "must be a Ghoul"), there is no structured requirement field to test, and
 * refusing on a string parse would refuse legitimate picks.
 */
export async function spendPerkPoint(
  actor: FoundryActor,
  system: CharacterData,
  choice: { readonly kind: "ability"; readonly ability: Ability } | { readonly kind: "perk"; readonly name: string },
): Promise<boolean> {
  const budget = budgetFor(system);
  if (budget.perkRemaining <= 0) {
    ui.notifications.warn(
      localize("FALLOUT.Progression.noPerkPoints", { total: budget.perkTotal }),
    );
    return false;
  }

  const updates: Record<string, unknown> = {};
  let line: string;
  if (choice.kind === "ability") {
    const current = system.abilities[choice.ability].value;
    const raised = raisedAbilityScore(current);
    if (raised === current) {
      ui.notifications.warn(
        localize("FALLOUT.Progression.abilityCapped", {
          ability: localize(`FALLOUT.Abilities.${choice.ability}`),
          score: current,
        }),
      );
      return false;
    }
    updates[`system.abilities.${choice.ability}.value`] = raised;
    line = localize("FALLOUT.Progression.spentAbility", {
      ability: localize(`FALLOUT.Abilities.${choice.ability}`),
      from: current,
      to: raised,
    });
  } else {
    if (!choice.name.trim()) return false;
    line = localize("FALLOUT.Progression.spentPerk", { perk: choice.name });
  }

  updates["system.progression.spends"] = [
    ...system.progression.spends,
    {
      kind: choice.kind,
      key: choice.kind === "ability" ? choice.ability : choice.name,
      points: 1,
      level: system.details.level,
      note: "",
    },
  ];
  await actor.update(updates);
  await card(actor, [
    line,
    localize("FALLOUT.Progression.perkPointsLeft", { left: budget.perkRemaining - 1 }),
  ]);
  return true;
}

/**
 * Undo one ledger row (pg 5 has no such rule; this is bookkeeping).
 *
 * A skill spend hands the points back and lowers the skill; an ability raise
 * hands the point back and lowers the score. A perk row only clears the
 * receipt — deleting the perk *document* is the player's call, because this
 * never created it, and silently deleting an item on an undo would be a
 * destructive surprise.
 *
 * `skills.<key>.points` is floored at 0 in the schema, so an undo that would
 * push it negative is refused rather than clamped: that means the ledger and
 * the sheet have drifted, and quietly absorbing it would hide the drift.
 */
export async function undoSpend(
  actor: FoundryActor,
  system: CharacterData,
  index: number,
): Promise<boolean> {
  const record = system.progression.spends[index];
  if (!record) return false;

  const updates: Record<string, unknown> = {
    "system.progression.spends": system.progression.spends.filter((_, at) => at !== index),
  };
  const notes: string[] = [];

  if (record.kind === "skill") {
    if (!isSkillKey(record.key)) return false;
    const skill = record.key;
    const current = system.skills[skill].points;
    if (current < record.points) {
      ui.notifications.warn(
        localize("FALLOUT.Progression.undoBelowZero", {
          skill: localize(`FALLOUT.Skills.${skill}`),
          points: record.points,
          current,
        }),
      );
      return false;
    }
    updates[`system.skills.${skill}.points`] = current - record.points;
    notes.push(
      localize("FALLOUT.Progression.undoSkill", {
        points: record.points,
        skill: localize(`FALLOUT.Skills.${skill}`),
      }),
    );
  } else if (record.kind === "ability" && isAbilityKey(record.key)) {
    const current = system.abilities[record.key].value;
    updates[`system.abilities.${record.key}.value`] = Math.max(1, current - 1);
    notes.push(
      localize("FALLOUT.Progression.undoAbility", {
        ability: localize(`FALLOUT.Abilities.${record.key}`),
        to: Math.max(1, current - 1),
      }),
    );
  } else {
    notes.push(localize("FALLOUT.Progression.undoPerk", { perk: record.key }));
  }

  await actor.update(updates);
  await card(actor, notes);
  return true;
}

// ---------------------------------------------------------------------------
// Skill magazines (pg 88)
// ---------------------------------------------------------------------------

export interface MagazineReadReport {
  readonly title: string;
  readonly skill: SkillKey;
  readonly issue: number;
  readonly alreadyRead: boolean;
  readonly issueCount: number;
  readonly gainedPermanent: boolean;
  readonly minutes: number;
  readonly apCost: number | null;
}

/**
 * Read an issue of a skill magazine (pg 88).
 *
 * The issue number is the player's, because it is the player's in the book —
 * pg 88's own example is "¡La Fantoma! issue #4 read", and nothing about an
 * item document says which issue it is. It has to be asked for.
 *
 * An issue already on the ledger is read and returns nothing: "Once you read an
 * issue of a skill magazine you can no longer gain its benefits." The item is
 * still consumed, because the character still spent the time on it, and the
 * card says so plainly.
 *
 * Time and AP are **reported, never deducted** — the same position every other
 * AP cost in this system takes while roadmap item 14 is open.
 */
export async function readMagazine(
  actor: FoundryActor,
  system: CharacterData,
  item: FoundryItem,
  issue: number,
): Promise<MagazineReadReport | null> {
  const aid = item.system as AidData;
  if (aid.aidType !== "magazine") {
    ui.notifications.warn(localize("FALLOUT.Progression.notAMagazine", { item: item.name }));
    return null;
  }
  if (aid.quantity <= 0) {
    ui.notifications.warn(localize("FALLOUT.Aid.empty", { item: item.name }));
    return null;
  }
  const skill = magazineSkill(item.name, aid.effect);
  if (!skill) {
    // Refusing beats guessing: a magazine that raised the wrong skill would be
    // a permanent +1 in the wrong column with no way to tell where it came from.
    ui.notifications.warn(localize("FALLOUT.Progression.unknownMagazine", { item: item.name }));
    return null;
  }
  const number = Math.floor(issue);
  if (!Number.isInteger(number) || number <= 0) {
    ui.notifications.warn(localize("FALLOUT.Progression.badIssue"));
    return null;
  }

  const entries = system.progression.magazines;
  const at = entries.findIndex((entry) => entry.title === item.name);
  const before = entries[at] ?? { title: item.name, issues: "", untilRest: false };
  const result = readIssue(
    { title: before.title, issues: parseIssues(before.issues), untilRest: before.untilRest },
    number,
  );

  const stored = {
    title: result.entry.title,
    issues: formatIssues(result.entry.issues),
    untilRest: result.entry.untilRest,
    // Record the skill this resolved to. `magazineSkill` can fall back to the
    // item's effect text, which the derived pass cannot see — without this a
    // magazine the book does not name reads correctly and then grants nothing.
    skill,
  };
  const magazines = at >= 0 ? entries.map((entry, index) => (index === at ? stored : entry)) : [...entries, stored];

  const time = magazineReadTime(system.derived.abilityMods.intelligence);
  await item.update({ "system.quantity": aid.quantity - 1 });
  if (!result.alreadyRead) await actor.update({ "system.progression.magazines": magazines });

  const skillLabel = localize(`FALLOUT.Skills.${skill}`);
  await card(actor, [
    localize("FALLOUT.Progression.readMagazine", {
      item: item.name,
      issue: number,
      time:
        time.apCost === null
          ? localize("FALLOUT.Progression.readMinutes", { minutes: time.minutes })
          : localize("FALLOUT.Progression.readAp", { ap: time.apCost }),
    }),
    // Reading in combat is priced in AP; the long version is priced in minutes
    // and charges nothing.
    ...(await apLine(actor, time.apCost ?? 0)),
    result.alreadyRead
      ? localize("FALLOUT.Progression.issueAlreadyRead", { issue: number, item: item.name })
      : localize("FALLOUT.Progression.magazineBonus", {
          skill: skillLabel,
          read: result.issueCount,
          needed: MAGAZINE_ISSUES_FOR_PERMANENT,
        }),
    result.gainedPermanent
      ? localize("FALLOUT.Progression.magazinePermanent", {
          skill: skillLabel,
          issues: MAGAZINE_ISSUES_FOR_PERMANENT,
        })
      : "",
  ]);

  return {
    title: item.name,
    skill,
    issue: number,
    alreadyRead: result.alreadyRead,
    issueCount: result.issueCount,
    gainedPermanent: result.gainedPermanent,
    minutes: time.minutes,
    apCost: time.apCost,
  };
}

/**
 * Drop every "+1 until you rest" magazine bonus (pg 88).
 *
 * The permanent bonuses stay: they are a property of the issue list, not of
 * this flag, so a rest can never take one away.
 */
export async function clearMagazineBonuses(
  actor: FoundryActor,
  system: CharacterData,
): Promise<number> {
  const magazines = system.progression.magazines;
  const cleared = magazines.filter((entry) => entry.untilRest).length;
  if (cleared === 0) return 0;
  await actor.update({
    "system.progression.magazines": magazines.map((entry) => ({ ...entry, untilRest: false })),
  });
  return cleared;
}

// ---------------------------------------------------------------------------
// Caps and Barter's Discount (pg 22)
// ---------------------------------------------------------------------------

/**
 * What a rest does to the two things here that recharge on one.
 *
 * Belongs at the end of `rest()` in `src/actions/rest.ts` — reported rather
 * than wired, because that file is not this pass's to edit. Skill magazine
 * bonuses go on *any* rest (pg 88 says only "until you rest"); Barter's
 * Discount needs the 8 hours it prints (pg 22), which is longer than this
 * system's 6-hour long rest.
 */
export async function restProgression(
  actor: FoundryActor,
  system: CharacterData,
  hours: number,
): Promise<{ magazines: number; discount: boolean }> {
  const magazines = await clearMagazineBonuses(actor, actor.system as CharacterData);
  const discount = system.progression.discountUsed && hours >= DISCOUNT_REST_HOURS;
  if (discount) await actor.update({ "system.progression.discountUsed": false });
  return { magazines, discount };
}

export interface PurchaseOptions {
  /** The merchant's asking price in caps. */
  readonly price: number;
  /** What is being bought, for the card. */
  readonly label: string;
  /** Whether to spend Barter's Discount on it (pg 22). */
  readonly useDiscount: boolean;
}

/**
 * Buy something with caps, optionally spending Barter's Discount (pg 22).
 *
 * The item is not created: pg 22 is a rule about *paying*, the goods come from
 * a GM's merchant and land on the sheet by the ordinary drag-and-drop, and a
 * purchase that conjured a document would have to invent which document.
 *
 * Refuses when the caps are not there. The book never says a character may go
 * into debt, `currency.caps` is floored at 0 in the schema, and a purchase that
 * silently emptied the purse would be a worse outcome than a warning.
 */
export async function purchase(
  actor: FoundryActor,
  system: CharacterData,
  options: PurchaseOptions,
): Promise<boolean> {
  const barter = system.derived.skillBonuses.barter;
  const spendsDiscount = options.useDiscount && !system.progression.discountUsed;
  if (options.useDiscount && system.progression.discountUsed) {
    ui.notifications.warn(
      localize("FALLOUT.Progression.discountSpent", { hours: DISCOUNT_REST_HOURS }),
    );
    return false;
  }
  const quote = quotePurchase(options.price, system.currency.caps, barter, spendsDiscount);
  if (!quote.affordable) {
    ui.notifications.warn(
      localize("FALLOUT.Progression.notEnoughCaps", {
        price: quote.price,
        caps: system.currency.caps,
      }),
    );
    return false;
  }

  const updates: Record<string, unknown> = { "system.currency.caps": quote.remaining };
  if (spendsDiscount) updates["system.progression.discountUsed"] = true;
  await actor.update(updates);

  await card(actor, [
    localize("FALLOUT.Progression.purchased", {
      label: options.label || localize("FALLOUT.Progression.purchaseUnnamed"),
      price: quote.price,
      caps: quote.remaining,
    }),
    spendsDiscount
      ? localize("FALLOUT.Progression.discountApplied", {
          percent: quote.discountPercent,
          saved: quote.discount,
          list: quote.listPrice,
          hours: DISCOUNT_REST_HOURS,
        })
      : "",
    spendsDiscount && quote.discount === 0
      ? localize("FALLOUT.Progression.discountNothing", { bonus: barter })
      : "",
  ]);
  return true;
}

/** Hand Barter's Discount back without a rest — a GM override (pg 22). */
export async function resetDiscount(actor: FoundryActor): Promise<void> {
  await actor.update({ "system.progression.discountUsed": false });
}
