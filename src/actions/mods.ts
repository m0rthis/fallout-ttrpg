/**
 * Weapon modifications, the half that needs an actor (pg 65, 75-77).
 *
 * `src/rules/mods.ts` is the table and it is pure: it answers everything that
 * can be decided from one weapon and its own attachments. This module is where
 * everything that needs the rest of the sheet lives — the one row whose rule
 * spans two weapons, and the attach/detach transaction, which needs an actor
 * because the modification is a document the actor is carrying.
 *
 * **Lucky Charm** (pg 76), D3 slice 11:
 *
 * > The weapon's critical hit chance decreases by 1. Each player character can
 * > only benefit from one lucky charm. (The charm can be moved to other weapons,
 * > but you cannot have two charms on two different weapons.)
 *
 * The first sentence is a weapon statistic and belongs to the derivation slice.
 * The second is the only rule in either table that a weapon **cannot answer
 * about itself**: a pistol carrying a charm has no way of knowing what is in the
 * other holster. It is an actor-scoped scan, so it is here rather than in
 * `rules/mods.ts`, which owns no documents and is not given an actor.
 *
 * **`attachMod` / `detachMod`** are the transaction the `attachedMods` flag never
 * had. Before them a mod went on by hand-writing a boolean, which meant nothing
 * consumed the crafted document, nothing priced the swap, and `modEligibility` —
 * an entire printed column, fully implemented — had no caller at all. The four
 * rulings that shape them are on `attachMod`.
 */

import type { GearData, WeaponData } from "../data/items";
import type { CharacterData } from "../data/character";
import { apLine } from "../combat/action-points";
import {
  ceasesFunction,
  isModKey,
  MELEE_MOD_LIMIT,
  MOD_CHOICE_KEYS,
  modEligibility,
  RANGED_MOD_SLOTS,
  slotsUsed,
  swapMinutes,
  WEAPON_MODS,
  type ModSwapTime,
  type ModIneligibility,
  type ModKey,
} from "../rules/mods";

/**
 * Every weapon on this actor that carries a lucky charm, in sheet order.
 *
 * Reads `attachedModKeys` rather than the raw flag so a stale key left by an
 * older release is filtered out by the same guard the rest of the system uses.
 */
export function luckyCharmWeapons(actor: FoundryActor): FoundryItem[] {
  return (actor.itemTypes.weapon ?? []).filter((item) =>
    (item.system as WeaponData).attachedModKeys.includes("luckyCharm"),
  );
}

export interface LuckyCharmReport {
  /** Names of the charmed weapons, in sheet order. */
  readonly weapons: readonly string[];
  /**
   * Whether the printed clause covers this actor at all — see the ruling on
   * `luckyCharmConflict`. False for an NPC, whatever it is carrying.
   */
  readonly limited: boolean;
  /** More than one charm on a covered actor: the arrangement the book forbids. */
  readonly conflict: boolean;
}

/**
 * The state of this actor's charms.
 *
 * **Three rulings, because the book gives one sentence and no procedure.**
 *
 * 1. **It never blocks, and it never silently picks a winner.** The house rule
 *    across this system is that a rule it cannot verify is reported rather than
 *    enforced (junk, AP, every distance in feet), and here there is a second
 *    reason on top of that one: the book forbids the *arrangement* and never
 *    says which of two charms works. Any tiebreak — first item, most recently
 *    attached, the equipped one — would be this system inventing a rule and then
 *    quietly deleting a benefit the player can see printed on their sheet. So
 *    each weapon keeps its own printed −1 crit chance (that is the derivation
 *    slice's business, and it stays naive on purpose), and the table is told
 *    that two of them are one too many.
 * 2. **"Each *player character*" is read as the actor type.** The clause names
 *    player characters and nothing else in the mod tables does, so an `npc`
 *    document is out of scope: a GM statting a raider gang with a charm each is
 *    not breaking a rule written about the party. `hasPlayerOwner` was the other
 *    candidate and is worse — an unassigned PC sheet, which is every sheet
 *    during session prep, would escape the rule for no reason a player would
 *    recognise.
 * 3. **Two charms on one weapon is not a case.** `attachedMods` is one boolean
 *    per row, so the parenthetical's "two charms on two different weapons" is
 *    the only shape the data can take, and counting weapons is counting charms.
 */
export function luckyCharmConflict(actor: FoundryActor): LuckyCharmReport {
  const weapons = luckyCharmWeapons(actor).map((item) => item.name);
  const limited = actor.type === "character";
  return { weapons, limited, conflict: limited && weapons.length > 1 };
}

/**
 * Report the charm situation after an attach — the call D3 slice 10's attach
 * control makes, and safe to call after any of them.
 *
 * Posts a card only when there is something to say, so an attach control can
 * call it unconditionally. The card goes to chat rather than to a notification
 * because the ruling above hands the decision to the table: the GM and the
 * player have to agree which charm is the one that counts, and a toast that
 * only the clicker sees for six seconds is the wrong place for that.
 *
 * Returns the report either way, so a caller that wants to say it differently
 * (a sheet badge, say) has the facts without the card.
 */
export async function announceLuckyCharms(actor: FoundryActor): Promise<LuckyCharmReport> {
  const report = luckyCharmConflict(actor);
  if (!report.conflict) return report;

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: [
      game.i18n.localize("FALLOUT.Mods.luckyCharmConflict", {
        name: actor.name,
        count: report.weapons.length,
        weapons: report.weapons.join(", "),
      }),
      game.i18n.localize("FALLOUT.Mods.luckyCharmRuling"),
    ].join("<br />"),
  });
  return report;
}

// ===========================================================================
// Attaching and detaching — D3 slice 10
// ===========================================================================

/**
 * The gear documents on this actor that *are* the named modification.
 *
 * Keyed on `GearData.modKey`, which `scripts/build-packs.mjs` writes from
 * `packs-src/mods.json`, rather than on the document's name: the name is the
 * book's and a table may rename its copy, while the key is the closed
 * vocabulary both tables share. Largest stack first, so a spend draws down the
 * pile a player would reach for.
 */
export function modStacks(actor: FoundryActor, key: ModKey): FoundryItem[] {
  return (actor.itemTypes.gear ?? [])
    .filter((item) => (item.system as GearData).modKey === key)
    .sort((a, b) => (b.system as GearData).quantity - (a.system as GearData).quantity);
}

/** How many copies of one modification this actor is carrying. */
export function modHeld(actor: FoundryActor, key: ModKey): number {
  return modStacks(actor, key).reduce(
    (total, item) => total + Math.max(0, (item.system as GearData).quantity),
    0,
  );
}

export interface ModAttachReport {
  readonly key: ModKey;
  readonly weapon: string;
  /** Printed clauses this attachment does not satisfy — advisory, see below. */
  readonly reasons: readonly ModIneligibility[];
  /** True when a document was found and spent; false when none was held. */
  readonly consumed: boolean;
  /** Mod slots used after the attach, and the printed ceiling for comparison. */
  readonly slots: number;
  readonly slotLimit: number;
  /** *"ceases function if its Mod Slot total is greater than 6"* (pg 75). */
  readonly ceased: boolean;
  /**
   * The printed cost of fitting or removing it, and the minutes when that is
   * what the row prices it in.
   *
   * Three shapes, not two: the column prints minutes for most rows, **AP** for
   * a few (the Silencer's 6), and "N/A" for the Speedloader. `swapMinutes`
   * returns null for the last *two*, so a report that carried only the number
   * described a 6 AP swap as a modification the book gives no way to move —
   * which is what the first version of this did, and what the smoke step caught.
   */
  readonly swap: ModSwapTime;
  readonly minutes: number | null;
  /** The printed "or" this mod leaves for the player, when it has one. */
  readonly pendingChoice: boolean;
}

/**
 * Fit a modification to a weapon (pg 65, 75-77).
 *
 * The transaction the `attachedMods` flag never had: until this, a mod was
 * attached by writing the boolean by hand, so nothing consumed the crafted
 * document, nothing priced the swap, and `modEligibility` — a whole printed
 * column, fully implemented — had no caller.
 *
 * ## Four rulings
 *
 * **1. Eligibility is advisory, and this attaches anyway.** `modEligibility`
 * was written advisory on purpose (the melee table hands the question to the GM
 * outright: *"at the GM's discretion"*), and this module's whole stance is that
 * a rule the system cannot verify is reported rather than enforced. So a mod the
 * Equippable Weapons column does not admit still goes on, and every failed
 * clause is named on the card. The one exception is `alreadyAttached`, which is
 * not a rule to weigh but a no-op: there is nothing to do and nothing to spend.
 *
 * **2. Exceeding six slots is reported at full volume, not refused.** It is the
 * one printed *failure state* rather than a fitting restriction — *"a ranged
 * weapon ceases function if its Mod Slot total is greater than 6"* — so the
 * weapon is allowed to reach it and the card says the weapon has stopped
 * working. Refusing would hide a state the book explicitly describes.
 *
 * **3. A missing document does not block.** Same shape as `consumeJunk` and for
 * the same reason: a table that has not imported the mod compendium, or a GM
 * granting a mod as loot, must not be stopped by bookkeeping. The card says
 * whether a document was spent, so nobody has to guess.
 *
 * **4. Time is reported, never spent.** `swapMinutes` folds in the Intelligence
 * discount the rows print; nothing advances a clock, exactly as AP is never
 * deducted (backlog E1).
 */
export async function attachMod(
  actor: FoundryActor,
  weapon: FoundryItem,
  key: ModKey,
  system?: CharacterData,
): Promise<ModAttachReport | null> {
  const weaponSystem = weapon.system as WeaponData;
  const definition = WEAPON_MODS[key];
  const eligibility = modEligibility(key, {
    weaponType: weaponSystem.weaponType,
    name: weapon.name,
    special: weaponSystem.special,
    attached: weaponSystem.attachedModKeys,
  });

  // The one refusal: already fitted is not a clause to weigh, it is nothing to
  // do. Refused before a document is touched, so a second click cannot eat a
  // second copy of the mod.
  if (eligibility.reasons.some((reason) => reason.kind === "alreadyAttached")) {
    ui.notifications.info(
      game.i18n.localize("FALLOUT.Mods.alreadyAttached", {
        mod: game.i18n.localize(`FALLOUT.Mods.names.${key}`),
        weapon: weapon.name,
      }),
    );
    return null;
  }

  // Spend a held copy if there is one. Emptied stacks are deleted rather than
  // left at zero — a mod is a countable part, and `consumeJunk` argues the case.
  const stacks = modStacks(actor, key);
  const stack = stacks[0];
  let consumed = false;
  if (stack) {
    const held = Math.max(0, (stack.system as GearData).quantity);
    if (held <= 1) await stack.delete();
    else await stack.update({ "system.quantity": held - 1 });
    consumed = true;
  }

  await weapon.update({ [`system.attachedMods.${key}`]: true });

  const after = weapon.system as WeaponData;
  const attached = after.attachedModKeys;
  const rangedSlots = slotsUsed(attached.filter((k) => WEAPON_MODS[k].category === "ranged"));
  const report: ModAttachReport = {
    key,
    weapon: weapon.name,
    reasons: eligibility.reasons,
    consumed,
    slots: definition.category === "ranged" ? rangedSlots : attached.length,
    slotLimit: definition.category === "ranged" ? RANGED_MOD_SLOTS : MELEE_MOD_LIMIT,
    ceased: ceasesFunction(attached),
    swap: definition.swap,
    minutes: swapMinutes(definition.swap, system?.derived.abilityScores.intelligence ?? 0),
    pendingChoice: after.pendingModChoices.includes(key),
  };

  // Only the mods the table prices in AP are charged; the ones measured in
  // minutes are workshop time and cost nothing on a turn.
  const attachAp = report.swap.kind === "ap" ? report.swap.ap : 0;
  await say(
    actor,
    [...modCardLines(report), ...(await apLine(actor, attachAp))].join("<br />"),
  );
  // The one clause a weapon cannot answer about itself, asked after every
  // attach because a charm is exactly the kind of thing to fit twice.
  await announceLuckyCharms(actor);
  return report;
}

/**
 * Take a modification back off (pg 65, 75-77).
 *
 * **The mod survives removal**, and comes back as a document. The Time to
 * Equip/**Unequip** column is printed as a symmetric pair and the Lucky Charm
 * row says outright that *"the charm can be moved to other weapons"*, so a mod
 * that evaporated when unscrewed would contradict the only row that describes
 * the operation. The document is recreated from the one that was spent, or from
 * the row's own name where nothing was recorded.
 *
 * Rows printing "N/A" in that column (`swap.kind === "never"`) are reported as
 * unremovable-by-the-book and still removed, on this module's usual terms: the
 * card says the book prints no time for it and the table decides.
 */
export async function detachMod(
  actor: FoundryActor,
  weapon: FoundryItem,
  key: ModKey,
  system?: CharacterData,
): Promise<ModAttachReport | null> {
  const weaponSystem = weapon.system as WeaponData;
  if (!weaponSystem.attachedModKeys.includes(key)) {
    ui.notifications.info(
      game.i18n.localize("FALLOUT.Mods.notAttached", {
        mod: game.i18n.localize(`FALLOUT.Mods.names.${key}`),
        weapon: weapon.name,
      }),
    );
    return null;
  }

  const definition = WEAPON_MODS[key];
  await weapon.update({
    [`system.attachedMods.${key}`]: false,
    // The printed "or" this mod answered goes with it — a detached mod must not
    // still be steering the derivation the moment it is refitted. Only for the
    // rows that *have* a choice: `modOptions` is a SchemaField keyed on
    // `MOD_CHOICE_KEYS` alone, so a path for any other mod is a key the schema
    // does not know and would be cleaned away without a word.
    ...(MOD_CHOICE_KEYS.includes(key) ? { [`system.modOptions.${key}`]: "" } : {}),
  });

  // Back onto an existing pile where there is one, rather than a new document
  // every time. Attaching draws the largest stack down, so without this an
  // attach/detach cycle leaves a trail of one-quantity duplicates for a player
  // to tidy — the same reason `consumeJunk` deletes a stack it empties instead
  // of leaving a zero behind.
  //
  // The freshly-created fallback carries the key and nothing else: the shipped
  // compendium copy has the row's caps price and Carry Load, and this one
  // cannot invent them. That only bites a table that detaches a mod it never
  // had a document for, which is the case where there was no price to preserve.
  const [existing] = modStacks(actor, key);
  if (existing) {
    await existing.update({
      "system.quantity": Math.max(0, (existing.system as GearData).quantity) + 1,
    });
  } else {
    await actor.createEmbeddedDocuments("Item", [
      { name: definition.name, type: "gear", system: { modKey: key, quantity: 1 } },
    ]);
  }

  const after = weapon.system as WeaponData;
  const attached = after.attachedModKeys;
  const report: ModAttachReport = {
    key,
    weapon: weapon.name,
    reasons: [],
    consumed: false,
    slots:
      definition.category === "ranged"
        ? slotsUsed(attached.filter((k) => WEAPON_MODS[k].category === "ranged"))
        : attached.length,
    slotLimit: definition.category === "ranged" ? RANGED_MOD_SLOTS : MELEE_MOD_LIMIT,
    ceased: ceasesFunction(attached),
    swap: definition.swap,
    minutes: swapMinutes(definition.swap, system?.derived.abilityScores.intelligence ?? 0),
    pendingChoice: false,
  };

  await say(
    actor,
    [
      game.i18n.localize("FALLOUT.Mods.detached", {
        mod: game.i18n.localize(`FALLOUT.Mods.names.${key}`),
        weapon: weapon.name,
        page: definition.page,
      }),
      swapLine(report),
      game.i18n.localize("FALLOUT.Mods.slotsNow", {
        used: report.slots,
        limit: report.slotLimit,
      }),
      ...(await apLine(actor, report.swap.kind === "ap" ? report.swap.ap : 0)),
    ].join("<br />"),
  );
  return report;
}

/** What the Time to Equip/Unequip column costs, in whichever currency it prints. */
function swapLine(report: ModAttachReport): string {
  if (report.swap.kind === "ap") {
    return game.i18n.localize("FALLOUT.Mods.swapAp", { ap: report.swap.ap });
  }
  if (report.minutes === null) return game.i18n.localize("FALLOUT.Mods.swapNever");
  return game.i18n.localize("FALLOUT.Mods.swapTime", { minutes: report.minutes });
}

/** The attach card, one line per thing the table needs to know. */
function modCardLines(report: ModAttachReport): string[] {
  const definition = WEAPON_MODS[report.key];
  const mod = game.i18n.localize(`FALLOUT.Mods.names.${report.key}`);
  const lines = [
    game.i18n.localize("FALLOUT.Mods.attached", {
      mod,
      weapon: report.weapon,
      page: definition.page,
    }),
    swapLine(report),
    game.i18n.localize("FALLOUT.Mods.slotsNow", {
      used: report.slots,
      limit: report.slotLimit,
    }),
    game.i18n.localize(
      report.consumed ? "FALLOUT.Mods.documentSpent" : "FALLOUT.Mods.documentMissing",
      { mod },
    ),
  ];
  if (report.ceased) lines.push(game.i18n.localize("FALLOUT.Mods.ceasesFunction"));
  if (report.pendingChoice) lines.push(game.i18n.localize("FALLOUT.Mods.choicePending", { mod }));
  for (const reason of report.reasons) lines.push(ineligibilityLine(reason));
  if (report.reasons.length > 0) lines.push(game.i18n.localize("FALLOUT.Mods.advisory"));
  return lines;
}

/** One printed clause this weapon fails, in words. */
function ineligibilityLine(reason: ModIneligibility): string {
  switch (reason.kind) {
    case "category":
      return game.i18n.localize("FALLOUT.Mods.whyCategory", {
        category: game.i18n.localize(`FALLOUT.Mods.categories.${reason.category}`),
      });
    case "weaponType":
      return game.i18n.localize("FALLOUT.Mods.whyWeaponType");
    case "excludedWeapon":
      return game.i18n.localize("FALLOUT.Mods.whyExcluded", { name: reason.name });
    case "requiresProperty":
      return game.i18n.localize("FALLOUT.Mods.whyRequiresProperty", { property: reason.property });
    case "forbidsProperty":
      return game.i18n.localize("FALLOUT.Mods.whyForbidsProperty", { property: reason.property });
    case "requiresMod":
      return game.i18n.localize("FALLOUT.Mods.whyRequiresMod", {
        mod: game.i18n.localize(`FALLOUT.Mods.names.${reason.mod}`),
      });
    case "conflict":
      return game.i18n.localize("FALLOUT.Mods.whyConflict", {
        mod: game.i18n.localize(`FALLOUT.Mods.names.${reason.mod}`),
      });
    case "slots":
      return game.i18n.localize("FALLOUT.Mods.whySlots", {
        used: reason.used,
        limit: reason.limit,
      });
    case "meleeLimit":
      return game.i18n.localize("FALLOUT.Mods.whyMeleeLimit");
    case "alreadyAttached":
      return game.i18n.localize("FALLOUT.Mods.whyAlreadyAttached");
  }
}

/** Post a line in this actor's voice — the module's one card helper. */
async function say(actor: FoundryActor, content: string): Promise<void> {
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content,
  });
}

/** Guard for a key arriving from a sheet dataset. */
export function modKeyFrom(value: string): ModKey | null {
  return isModKey(value) ? value : null;
}
