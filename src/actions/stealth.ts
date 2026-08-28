/**
 * The document-writing half of two rulebook chapters at once: hiding, detection
 * and Surprise (pg 24, 125, 127, 128), and the remaining pg 126 combat actions —
 * Dodge, Shove, Take Cover, Search, Stand, Stow and Equip (pg 126-127).
 *
 * The arithmetic is pure and lives in `src/rules/stealth.ts` and
 * `src/rules/actions.ts`. This file rolls the dice, writes the effects, and
 * talks to chat. One module for both because they are one seam: Hide and Search
 * are two rows of the same pg 126 table as Shove and Dodge, and the sheet mounts
 * them in a single panel.
 *
 * ## Every state here is a marker somebody presses
 *
 * Hidden, Surprised, Dodging and Taking Cover are exactly the states that tempt
 * a document hook — "when they attack, unhide them", "when the round turns, drop
 * the Dodge", "when they move out of cover, reveal them".
 * `src/actions/situations.ts` sets out at length why this project does not do
 * that: a hook that writes documents in response to document writes is the shape
 * that produced its one production bug. So every state below is a **duration-less
 * Active Effect** carrying a flag, created by a button and cleared by a button —
 * the pattern `src/actions/blocking.ts` established and `combat-actions.ts`
 * reused for Help and Ready.
 *
 * That is not merely the house style here, it is what the rules ask for. Every
 * one of these four ends on a *trigger* rather than a clock:
 *
 * - Hidden ends when you leave full cover, or when a Search finds you (pg 127,
 *   pg 24) — neither is a span of time.
 * - Taking Cover ends *"if you attack while taking cover"* (pg 127).
 * - Surprise ends when the creature's first turn does (pg 125) — a deadline
 *   about a specific creature's turn, the same shape Ready's window has, and
 *   `readyAction` already declined to express that as a Foundry duration.
 * - Dodge lasts *"until the start of your next turn"*, which **is** expressible —
 *   and is still a marker, because a Foundry duration would silently expire the
 *   thing a player paid 6 AP for, in a system where the disadvantage it grants
 *   has to be declared by the attacker anyway (see `dodge`).
 *
 * ## Statuses this needs and does not have
 *
 * There is no `hidden` and no `surprised` token status registered
 * (`src/fallout.ts`), and adding one is not this work's to do. The markers carry
 * their own names and icons instead, and the panel displays them; the token HUD
 * will not. That is reported rather than papered over.
 *
 * ## AP
 *
 * Reported, never deducted — roadmap item 14. Every action states its printed
 * cost and lets the player pay it.
 */

import type { CharacterData } from "../data/character";
import type { WeaponData } from "../data/items";
import {
  bestShoveDefense,
  DODGE_AP_COST,
  DODGE_REACTIVE_MOVE_FEET,
  dodgeBenefitLost,
  EQUIP_WEAPON_AP_COST,
  SHOVE_AP_COST,
  SHOVE_PUSH_FEET,
  shoveAllowed,
  shoveSucceeds,
  STAND_UP_AP_COST,
  STOW_WEAPON_AP_COST,
  type ShoveDefense,
  type ShoveOutcome,
  weaponsDroppedByEquipping,
} from "../rules/actions";
import {
  blindAttackDC,
  canHide,
  canSneakAttack,
  type Concealment,
  detectionOutcome,
  HIDE_AP_COST,
  hideDC,
  hideOutcomes,
  hidingBroken,
  NO_CONCEALMENT,
  revealedByAttacking,
  SEARCH_AP_COST,
  surpriseOutcomes,
  TARGET_MARK_AP_COST,
  targetingThroughConcealment,
  type TargetingVerdict,
  withinMarkRange,
} from "../rules/stealth";
import { weaponRange } from "../rules/formulas";
import { rangeMultiplier } from "./environment";
import {
  canTakeCover,
  coverAfterTakingCover,
  type CoverDegree,
  TAKE_COVER_AP,
} from "../rules/cover";
import { SYSTEM_ID, skillScope } from "../rules/effects";
import {
  d20Formula,
  d20Modifiers,
  effectiveMode,
  keptD20,
  type RollMode,
  rollSkillCheck,
} from "../dice/core";
import { noteActionPoints } from "../combat/action-points";
import { endMarkerEffects, markers } from "./markers";

// ---------------------------------------------------------------- roll plumbing

function signed(value: number): string {
  return value >= 0 ? `+${String(value)}` : String(value);
}

function modeSuffix(mode: RollMode): string {
  if (mode === "normal") return "";
  return ` (${game.i18n.localize(`FALLOUT.Roll.${mode}`)})`;
}

function speaker(actor: FoundryActor): ChatSpeakerData {
  return foundry.documents.ChatMessage.getSpeaker({ actor });
}

async function say(actor: FoundryActor, content: string): Promise<void> {
  await foundry.documents.ChatMessage.create({ speaker: speaker(actor), content });
}

/** Both PCs and NPC statblocks run on `CharacterData`, so one reader serves both. */
function systemOf(actor: FoundryActor): CharacterData {
  return actor.system as CharacterData;
}

/** The passive sense score this system already computes and nothing consumed. */
export function passiveSenseOf(actor: FoundryActor): number {
  return systemOf(actor).derived.passiveSense;
}

// Every state in this module is a flag-carrying marker effect, and the scan
// (`markers`) and the delete-and-announce (`endMarkerEffects`) both live in
// `./markers` now — `blocking.ts` and `stealth-field.ts` had each grown their
// own copy of the same two operations. All four of the teardowns below are the
// same call with a different flag and a different line to post.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ===================================================================== hiding

/** What a successful Hide recorded (pg 127). */
export interface HiddenRecord {
  /** The Sneak total that hid them — the number a Search has to beat. */
  sneakTotal: number;
  /** The DC rolled against: the highest nearby passive sense, or a declared one. */
  dc: number;
  /** The observers this roll actually got past, by name. */
  hiddenFrom: string[];
  /** The observers who saw through it anyway. */
  seenBy: string[];
  /** Whether the concealment was full cover, which is what pg 127 breaks on. */
  fullCover: boolean;
  /**
   * The concealment that justified the Hide.
   *
   * `fullCover` above answers pg 127's break condition and nothing else, so for
   * a while it was the only thing recorded — and `sneakAttackPosture` had to
   * reconstruct the rest as "full cover, or else heavily obscured". That reads an
   * *invisible* hider (pg 134) as standing in darkness (pg 118), and a hider
   * behind three-quarters cover as the same, which sends the table to the wrong
   * paragraph for every ruling downstream. `canHide` already accepts all three
   * concealments, so the marker records which one it accepted.
   *
   * Optional because markers written before this field exist in saved worlds;
   * `sneakAttackPosture` keeps the old reconstruction for those.
   */
  concealment?: Concealment;
}

function isHiddenRecord(value: unknown): value is HiddenRecord {
  return (
    isRecord(value) &&
    typeof value.sneakTotal === "number" &&
    typeof value.dc === "number" &&
    Array.isArray(value.hiddenFrom) &&
    Array.isArray(value.seenBy) &&
    typeof value.fullCover === "boolean"
  );
}

/** Whether this creature is hiding, and what it rolled to get there. */
export function hiddenState(actor: FoundryActor): HiddenRecord | null {
  return markers(actor, "hidden", isHiddenRecord)[0]?.record ?? null;
}

export interface HideOptions {
  /**
   * The concealment being claimed. Declared rather than measured, exactly as
   * cover is declared per attack — see `AttackOptions` in `src/dice/rolls.ts`.
   */
  concealment?: Concealment;
  /**
   * The creatures the hider is trying to disappear from. Their passive senses
   * are the DC (pg 127), and the result is resolved per observer.
   */
  observers?: readonly FoundryActor[];
  /**
   * Override the DC. pg 127 prices Hide off *"any nearby enemies passive sense
   * scores"*, and a GM running an unbuilt patrol has no actors to read them
   * from — the same shape as Escape's DC override for a bear trap.
   */
  dc?: number;
  mode?: RollMode;
}

export interface HideReport {
  ap: number;
  dc: number;
  total: number;
  raw: number;
  mode: RollMode;
  hiddenFrom: string[];
  seenBy: string[];
  hidden: boolean;
}

/**
 * **Hide** (6 AP, pg 126-127; the Sneak skill entry on pg 24 prices it the same):
 *
 * > When you take the Hide action, you make a Sneak check with the DC equal to
 * > any nearby enemies passive sense scores. In order to hide you must be
 * > heavily obscured or within full cover. You are hidden from any enemies that
 * > have a lower passive sense compared to your sneak roll. If you succeed, you
 * > gain certain benefits, as described in the "Unseen Attackers and Targets"
 * > section. While hiding, you are acting unpredictably to confuse your enemy.
 * > Enemies still know your general location and can move to try and make line
 * > of sight again to notice you. If you are no longer within full cover of an
 * > enemy you are hidden from, you are no longer hidden.
 *
 * Four things this does, each of which is a decision made in
 * `src/rules/stealth.ts` and documented there rather than restated here:
 *
 * - **Refuses without concealment.** *"In order to hide you must be…"* is a
 *   requirement in the imperative, and pg 24's looser "if you have cover" is not
 *   followed (`canHide`).
 * - **Resolves per observer.** One roll can hide you from two guards and not
 *   from their sergeant, which is why the record keeps both lists.
 * - **Records the total.** A Search contests *"a Sneak check from you"* later
 *   (pg 24), and Surprise compares *"the Sneak checks of anyone hiding"* (pg
 *   125), so the number has to survive the roll.
 * - **Claims no benefit it cannot cite.** The cross-reference the rule sends you
 *   to — *"Unseen Attackers and Targets"* — **does not exist**; the phrase
 *   occurs exactly once in 136 pages, here. The card prints the two benefits
 *   that do exist somewhere (pg 24's advantage, pg 128's sneak attack and what
 *   it additionally requires) and says where they came from.
 *
 * @returns the report, or null when the creature has nothing to hide behind.
 */
export async function hide(
  actor: FoundryActor,
  system: CharacterData,
  options: HideOptions = {},
): Promise<HideReport | null> {
  const concealment = options.concealment ?? NO_CONCEALMENT;
  if (!canHide(concealment)) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Hide.needsConcealment"));
    return null;
  }

  const observers = options.observers ?? [];
  const senses = observers.map((observer) => passiveSenseOf(observer));
  const dc = options.dc ?? hideDC(senses);
  if (dc === null) {
    // No enemies named and no DC given: pg 127's formula has no input. Hiding
    // from nobody in particular is a fiction the GM adjudicates, not a roll.
    ui.notifications.warn(game.i18n.localize("FALLOUT.Hide.noObservers"));
    return null;
  }

  const check = await rollSkillCheck(
    actor,
    system,
    "sneak",
    dc,
    options.mode ?? "normal",
  );

  const outcomes = hideOutcomes(
    check.total,
    observers.map((observer) => ({
      name: observer.name,
      passiveSense: passiveSenseOf(observer),
    })),
  );
  const hiddenFrom = outcomes.filter((o) => o.hidden).map((o) => o.observer.name);
  const seenBy = outcomes.filter((o) => !o.hidden).map((o) => o.observer.name);
  // With no observers listed, the declared DC is the whole test.
  const hidden = observers.length === 0 ? check.total > dc : hiddenFrom.length > 0;

  if (hidden) {
    // Replace rather than stack: a creature is hidden or it is not, and a second
    // Hide is a fresh roll that supersedes the first.
    await revealHidden(actor, null);
    const record: HiddenRecord = {
      sneakTotal: check.total,
      dc,
      hiddenFrom,
      seenBy,
      fullCover: concealment.cover === "total",
      concealment,
    };
    await actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: game.i18n.localize("FALLOUT.Hide.effect"),
        img: "icons/svg/mystery-man.svg",
        type: "base",
        description: game.i18n.localize("FALLOUT.Hide.description", {
          total: check.total,
        }),
        // No duration and no changes: pg 24's advantage is granted against a
        // *specific* target this effect cannot name, so the marker records the
        // state and the panel reports what it is worth. See `sneakAttackPosture`.
        system: { changes: [] },
        flags: { [SYSTEM_ID]: { hidden: record } },
      },
    ]);
  }

  const apNote = await noteActionPoints(actor, HIDE_AP_COST);
  await say(
    actor,
    `${game.i18n.localize(hidden ? "FALLOUT.Hide.hidden" : "FALLOUT.Hide.failed", {
      total: check.total,
      dc,
      ap: HIDE_AP_COST,
    })}${modeSuffix(check.mode)} ${game.i18n.localize("FALLOUT.Hide.against", {
      hiddenFrom: hiddenFrom.join(", ") || "—",
      seenBy: seenBy.join(", ") || "—",
    })}${
      hidden && concealment.cover !== "total"
        ? ` ${game.i18n.localize("FALLOUT.Hide.obscuredOnly")}`
        : ""
    }${apNote === null ? "" : ` ${apNote.line}`}`,
  );

  return {
    ap: HIDE_AP_COST,
    dc,
    total: check.total,
    raw: check.raw,
    mode: check.mode,
    hiddenFrom,
    seenBy,
    hidden,
  };
}

/**
 * Stop hiding, for any of the reasons the book gives — or none.
 *
 * The reasons, all of them printed and none of them watched for automatically:
 *
 * - *"If you are no longer within full cover of an enemy you are hidden from,
 *   you are no longer hidden"* (pg 127) — `breakHidingOnCover` is the control
 *   that applies this one against a declared degree.
 * - A Search or a contested Perception check finds you (pg 24) — `searchFor`.
 * - You attack, which is established only by the exception the Silencer mod
 *   carves out of it (pg 77, `revealedByAttacking`).
 *
 * @param reason a localization key to announce, or null to clear silently — the
 *        silent form is what a fresh Hide uses to supersede an old one.
 */
export async function revealHidden(
  actor: FoundryActor,
  reason: string | null = "FALLOUT.Hide.revealed",
): Promise<number> {
  return endMarkerEffects(actor, "hidden", { match: isHiddenRecord, announceKey: reason });
}

/**
 * Apply pg 127's cover clause against a newly declared degree of cover.
 *
 * *"If you are no longer within full cover of an enemy you are hidden from, you
 * are no longer hidden."* Note the asymmetry `hidingBroken` documents and this
 * respects: the requirement to hide accepts heavy obscurement, and the sentence
 * that ends it names only full cover. A creature who hid in darkness is left
 * hidden by this control, and the card says so rather than quietly extending the
 * rule.
 */
export async function breakHidingOnCover(
  actor: FoundryActor,
  cover: CoverDegree,
): Promise<boolean> {
  const state = hiddenState(actor);
  if (state === null) return false;
  if (!hidingBroken({ ...NO_CONCEALMENT, cover })) return false;
  if (!state.fullCover) {
    // Hidden by obscurement rather than cover: the printed trigger is about
    // cover only, so there is nothing here to fire.
    await say(actor, game.i18n.localize("FALLOUT.Hide.obscuredSurvives"));
    return false;
  }
  await revealHidden(actor, "FALLOUT.Hide.lostCover");
  return true;
}

/**
 * Announce what attacking does to the hiding (pg 77, by exception).
 *
 * The book never states the default directly. The Silencer weapon mod does:
 * *"While you are hidden; any attack rolls you make with a weapon that has a
 * silencer modification does not reveal your presence to nearby creatures,
 * allowing you to remain hidden except against the creature you attacked."* An
 * exception that specific establishes what it is an exception *to*.
 *
 * The silencer is no longer undetectable: backlog D3 added
 * `WeaponData.attachedMods`, a validated mod set, and `rollAttack` reads
 * `weaponSystem.silenced` off it. This function still takes a plain boolean —
 * it is about what a *reveal* reaches, not about where the answer came from —
 * and the caller may still override, which is what homebrew and a GM's
 * adjudication need. The free-text `system.mods` remains a human note beside
 * the flag set, exactly as `armor.upgrades` sits beside `upgradeRanks`.
 */
export async function revealAfterAttacking(
  actor: FoundryActor,
  silenced = false,
): Promise<"everyone" | "targetOnly" | null> {
  if (hiddenState(actor) === null) return null;
  const reach = revealedByAttacking(silenced);
  if (reach === "everyone") {
    await revealHidden(actor, "FALLOUT.Hide.revealedByAttack");
  } else {
    await say(actor, game.i18n.localize("FALLOUT.Hide.silenced"));
  }
  return reach;
}

// ============================== the two weapon mods that reach this chapter

/**
 * What the Infrared Scope's targeting clause is worth against this creature,
 * right now (pg 76, and pg 128/130/134 for what it is an exception to).
 */
export interface ConcealedTargetReport {
  verdict: TargetingVerdict;
  /** Whether the scope was in play — from the weapon, or declared. */
  scope: boolean;
  /** True only for `"normal"`: an ordinary attack roll, no substitution. */
  canTargetNormally: boolean;
  /** The concealment used, declared or read off the target's own documents. */
  concealment: Concealment;
  /** pg 128's DC, when a distance was declared and a blind attack is what this is. */
  blindDC: number | null;
}

/**
 * The concealment a target is presenting to *this* attacker, from documents.
 *
 * Every input is a declaration somebody already made, which is the whole point:
 * this system does not measure line of sight, darkness or distance, and the
 * Infrared Scope is not the row that gets to start.
 *
 * - **Hiding** is the Hide marker, and `hiddenFrom` decides *whose* — a creature
 *   hidden from the sergeant and not from you is not concealed from you. The
 *   marker's `fullCover` is what says which of pg 127's two concealments it
 *   used, so no new question is asked of the table.
 * - **Invisibility** is core's `invisible` status, which is what
 *   `applyInvisibility` (the Nightkin Stealth Field, pg 12, and any future
 *   Stealth Boy) writes and what the token HUD shows.
 * - **Darkness** has no document — scene light is not a per-creature fact and
 *   `src/actions/light.ts` deliberately reports obscurement rather than
 *   stamping it on actors — so it stays the caller's declaration.
 */
export function concealmentPresentedTo(attacker: FoundryActor, target: FoundryActor): Concealment {
  const hidden = hiddenState(target);
  const hiddenFromMe = hidden?.hiddenFrom.includes(attacker.name) === true;
  // `hiddenFromMe` is an aliased condition, so `hidden` is narrowed non-null here.
  const behindFullCover = hiddenFromMe && hidden.fullCover;
  return {
    cover: behindFullCover ? "total" : "none",
    heavilyObscured: hiddenFromMe && !behindFullCover,
    invisible: target.statuses?.has("invisible") === true,
  };
}

/** One line per verdict, spelled out so every key is greppable in `en.json`. */
const VERDICT_KEYS: Record<TargetingVerdict, string> = {
  normal: "FALLOUT.Mods.infraredNormal",
  disadvantaged: "FALLOUT.Mods.infraredDisadvantaged",
  blind: "FALLOUT.Mods.infraredBlind",
  refused: "FALLOUT.Mods.infraredRefused",
};

/** Whether there is anything between the two of them at all. */
function isConcealed(concealment: Concealment): boolean {
  return concealment.cover !== "none" || concealment.heavilyObscured || concealment.invisible;
}

/**
 * **Infrared Scope** (pg 76): *"You can target creatures that are hidden,
 * shrouded, in complete darkness, or invisible so long as they are not behind
 * full cover."*
 *
 * `targetingThroughConcealment` carries the ruling and the three printed rules
 * the clause displaces. What this control adds is the reading of the state off
 * documents, and the card — because the benefit is otherwise invisible at the
 * table: it does not change a number, it changes *which rule you were about to
 * use*, and a player who does not know pg 128's blind attack exists cannot tell
 * that the scope just saved them from it.
 *
 * **Three things it deliberately does not touch**, each of which was a live
 * option and each of which would have been a bigger claim than the sentence
 * makes:
 *
 * - **The Hide marker.** The scope does not find anybody. `hiddenState`,
 *   `hiddenFrom`, `beatsPassiveSense` and `detectionOutcome` are untouched, so
 *   the target stays hidden after being shot at, a Search is still the only
 *   thing that reveals them (pg 24), and pg 24's advantage still applies to
 *   *their* attacks. "Target", not "see".
 * - **`sneakAttackPosture`.** In neither direction. The scope's owner gains no
 *   posture from it (posture is about the attacker's own hiding), and — the
 *   tempting one — a scope holder is still sneak-attackable, because pg 128's
 *   second condition is *unawareness*, which pg 125 establishes off passive
 *   sense, and a thermal sight bolted to a rifle grants no senses to the person
 *   holding it. A marked-down passive sense would also be exactly the "start
 *   measuring concealment" move this system has refused everywhere else.
 * - **`revealAfterAttacking`.** That is about the attacker's own hiding place
 *   and whether the shot gave it away; the scope is a sight, not a suppressor.
 *   A hidden attacker with an Infrared Scope is revealed by attacking exactly as
 *   before, unless the weapon also carries a Silencer.
 *
 * **No canvas change is needed and none should be made.** The blindsight
 * `DetectionMode` registered in `src/fallout.ts` (backlog A2) is a *sense*: it
 * makes a token perceive its surroundings, walk around in the dark, and see
 * without a weapon in hand. This clause is a per-attack permission that belongs
 * to a weapon, is scoped to creatures rather than to the environment, and is
 * gated on a cover degree that only exists as a declaration. Registering it as a
 * detection mode would grant night vision to anyone holding the rifle and would
 * have the canvas deciding a question the table declares.
 */
export async function reportConcealedTargeting(
  attacker: FoundryActor,
  weaponSystem: WeaponData,
  target: FoundryActor,
  options: {
    /** Declared concealment; omitted, it is read off the target's documents. */
    concealment?: Concealment;
    /**
     * Override the scope. Same convention as `AttackOptions.silenced`: the
     * weapon answers by default and an explicit value wins in both directions.
     */
    infraredScope?: boolean;
    /** Declared distance, for pg 128's DC. Never measured — see `AttackOptions`. */
    distanceFeet?: number;
  } = {},
): Promise<ConcealedTargetReport> {
  const concealment = options.concealment ?? concealmentPresentedTo(attacker, target);
  const scope = options.infraredScope ?? weaponSystem.hasMod("infraredScope");
  const verdict = targetingThroughConcealment(concealment, scope);
  const blindDC =
    verdict === "blind" && options.distanceFeet !== undefined
      ? blindAttackDC(options.distanceFeet)
      : null;

  let content = game.i18n.localize(VERDICT_KEYS[verdict], { target: target.name });
  if (verdict === "blind") {
    content += ` ${
      blindDC === null
        ? game.i18n.localize("FALLOUT.Mods.infraredDcUnstated")
        : game.i18n.localize("FALLOUT.Mods.infraredDc", {
            dc: blindDC,
            distance: options.distanceFeet ?? 0,
          })
    }`;
  }
  // Said whenever the scope actually did the work, for the same reason the
  // attack card says where an unrequested sneak attack came from: a benefit
  // nobody can see is a benefit nobody can check. And it carries the limit —
  // the target is still hidden — because that is the half most likely to be
  // assumed away.
  if (scope && verdict === "normal" && isConcealed(concealment)) {
    content += ` ${game.i18n.localize("FALLOUT.Mods.infraredStillHidden", { target: target.name })}`;
  }
  await say(attacker, content);

  return {
    verdict,
    scope,
    canTargetNormally: verdict === "normal",
    concealment,
    blindDC,
  };
}

/** What an On-Board Target Tracking mark remembers (pg 76). */
export interface TargetMarkRecord {
  /** Who spent the 6 AP. */
  by: string;
  /** The weapon that carries the mod. */
  weapon: string;
  /** The short range it was placed within, in feet, or null when undeclared. */
  shortRange: number | null;
}

function isTargetMarkRecord(value: unknown): value is TargetMarkRecord {
  return (
    isRecord(value) &&
    typeof value.by === "string" &&
    typeof value.weapon === "string" &&
    (value.shortRange === null || typeof value.shortRange === "number")
  );
}

/** Whether this creature is carrying a mark, and who put it there. */
export function markedByTracking(actor: FoundryActor): TargetMarkRecord | null {
  return markers(actor, "targetMark", isTargetMarkRecord)[0]?.record ?? null;
}

export interface TargetMarkReport {
  /** Reported, never deducted (backlog E1). */
  ap: number;
  target: string;
  /** The weapon's short range at this attacker's Perception, in feet. */
  shortRange: number;
  /** The declared distance, when one was declared. */
  distanceFeet: number | null;
}

/**
 * **On-Board Target Tracking** (pg 76): *"Before you make an attack with a
 * weapon that has this modification, you can spend 6 AP to mark a target
 * creature within the weapon's short range. Attack rolls against the marked
 * creature have advantage."*
 *
 * A marker effect on the **target**, which is unusual for this module — every
 * other state here sits on the creature that acted — and is what the sentence
 * asks for: the mark is a property of the marked creature, and the benefit
 * belongs to whoever shoots at them.
 *
 * ## The duration the book does not print
 *
 * There is none. Not "until the end of your next turn", not a minute, not "until
 * you attack": the row states the spend and the benefit and stops. **Ruled: the
 * mark is spent by the first attack roll made against the marked creature, by
 * anybody, and is otherwise dropped by hand.** Four reasons, in the order they
 * carried weight:
 *
 * 1. *"**Before you make an attack** … you can spend 6 AP to mark"* frames the
 *    spend as an investment in an attack. What it buys is therefore an attack.
 * 2. The benefit sentence names no attacker — *"Attack rolls against the marked
 *    creature have advantage"*, not "your attack rolls" — so the advantage is
 *    not the marker's private property, and whoever rolls first takes it. That
 *    is worth more than 6 AP of one character's turn only if it also ends there.
 * 3. Every state in this module ends on a **trigger**, not a clock (see the
 *    module docstring), and this system does not give markers Foundry durations
 *    that would silently expire something a player paid AP for.
 * 4. The alternatives are worse. An unbounded mark makes 6 AP the best purchase
 *    in the book — a permanent, party-wide advantage against one creature —
 *    and any span (a turn, a minute) is a number invented here, which is the one
 *    thing the working agreement forbids doing silently.
 *
 * `rollAttack` reads the mark and spends it (`consumeTargetMark`); the advantage
 * is requested rather than applied, so it cancels against a declared
 * disadvantage the ordinary way instead of overriding one.
 *
 * The 6 AP is reported, never deducted — backlog E1, as everywhere.
 */
export async function markTarget(
  attacker: FoundryActor,
  system: CharacterData,
  weapon: FoundryItem,
  weaponSystem: WeaponData,
  target: FoundryActor,
  options: {
    /** Declared distance to the target, in feet. Never measured — see `AttackOptions`. */
    distanceFeet?: number;
    /** Override the computed short range, for a GM running an unprinted weapon. */
    shortRangeFeet?: number;
  } = {},
): Promise<TargetMarkReport | null> {
  if (!weaponSystem.hasMod("onBoardTargetTracking")) {
    // The ability *is* the mod; without it there is nothing to spend 6 AP on.
    // This is a refusal rather than the advisory `modEligibility` gives, because
    // eligibility is about whether a mod may be fitted (the melee table hands
    // that to the GM outright) and this is about whether one is fitted.
    ui.notifications.warn(game.i18n.localize("FALLOUT.Mods.markNeedsMod"));
    return null;
  }

  // Short range = the first number on the Range column, at this character's
  // Perception (pg 21, 66). The weather multiplier and Kickback's one-handed
  // halving are folded in for the same reason `rollAttack` folds them into its
  // bands: the player is reading "60/120 ft" off the weapon row and picking a
  // distance against that, so the mark has to price its range off the same
  // number the sheet shows. (`attackRangeReport` in `src/dice/rolls.ts` is the
  // sibling computation; it is private to the roll and this is not a roll.)
  const handScale = weaponSystem.keywords.kickback && weaponSystem.oneHanded ? 0.5 : 1;
  const shortRange =
    options.shortRangeFeet ??
    Math.floor(
      weaponRange(
        { normal: weaponSystem.rangeNormal, long: weaponSystem.rangeLong },
        system.derived.abilityScores.perception,
      ).normal *
        rangeMultiplier() *
        handScale,
    );

  const distanceFeet = options.distanceFeet ?? null;
  if (distanceFeet !== null && !withinMarkRange(distanceFeet, shortRange)) {
    // "within the weapon's short range" is a printed requirement, so a declared
    // distance that fails it refuses. An *undeclared* distance does not — see
    // the note the card carries below.
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Mods.markOutOfRange", {
        target: target.name,
        distance: distanceFeet,
        range: shortRange,
      }),
    );
    return null;
  }

  // The mark lives on the *target's* sheet, which is the only place an effect
  // that says "attack rolls against this creature have advantage" can live — and
  // the reason this is the one control in the module that needs ownership of
  // somebody else's actor. At most tables the target is a GM-owned NPC, so a
  // player pressing this would otherwise get a raw Foundry permission rejection
  // from `createEmbeddedDocuments`. Refuse first, and name the reason.
  if (!target.isOwner) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Mods.markNotOwned", { target: target.name }),
    );
    return null;
  }

  // Replace rather than stack: a creature is marked or it is not, and a second
  // 6 AP mark supersedes the first — the same rule a second Hide follows.
  await consumeTargetMark(target, false);
  const record: TargetMarkRecord = {
    by: attacker.name,
    weapon: weapon.name,
    shortRange: distanceFeet === null ? null : shortRange,
  };
  await target.createEmbeddedDocuments("ActiveEffect", [
    {
      name: game.i18n.localize("FALLOUT.Mods.markEffect"),
      img: "icons/svg/target.svg",
      type: "base",
      description: game.i18n.localize("FALLOUT.Mods.markDescription", { by: attacker.name }),
      // No duration and no changes: the advantage lands on an attack roll made
      // by somebody else's sheet — the same wall Dodge's disadvantage runs into
      // — and the duration is the ruled trigger above, not a clock.
      system: { changes: [] },
      flags: { [SYSTEM_ID]: { targetMark: record } },
    },
  ]);

  const apNote = await noteActionPoints(attacker, TARGET_MARK_AP_COST);
  await say(
    attacker,
    `${game.i18n.localize("FALLOUT.Mods.marked", {
      target: target.name,
      weapon: weapon.name,
      ap: TARGET_MARK_AP_COST,
    })} ${game.i18n.localize("FALLOUT.Mods.markDuration", { target: target.name })}${
      distanceFeet === null
        ? ` ${game.i18n.localize("FALLOUT.Mods.markRangeUnstated", { range: shortRange })}`
        : ""
    }${apNote === null ? "" : ` ${apNote.line}`}`,
  );

  return { ap: TARGET_MARK_AP_COST, target: target.name, shortRange, distanceFeet };
}

/**
 * Spend the mark: the first attack roll against the marked creature takes the
 * advantage and clears it (the ruling is in `markTarget`).
 *
 * Also the manual drop, which is why it is exported: a GM who rules the lock has
 * been broken — the target ducked behind a wall, the terminal lost power — ends
 * it here, the same way every other marker in this module is ended by a button.
 */
export async function consumeTargetMark(target: FoundryActor, announce = true): Promise<number> {
  // `rollAttack` spends the mark in its tail, after the roll has been posted and
  // before the targeted-limb follow-up. The spender is whoever attacked, and the
  // mark is on the defender, so the attacking player usually cannot delete it —
  // and an unhandled permission rejection here would take the rest of that tail
  // (Help, the limb follow-up, the injury) down with it. The mark simply stands,
  // and the card says who has to clear it.
  if (!target.isOwner) {
    if (announce) {
      await say(target, game.i18n.localize("FALLOUT.Mods.markNotCleared", { target: target.name }));
    }
    return 0;
  }
  return endMarkerEffects(target, "targetMark", {
    match: isTargetMarkRecord,
    announceKey: announce ? "FALLOUT.Mods.markSpent" : null,
  });
}

// =================================================================== searching

export interface SearchReport {
  ap: number;
  total: number;
  raw: number;
  mode: RollMode;
  /** The contest, when there was somebody hidden to contest with (pg 24). */
  contest: {
    target: string;
    hiderTotal: number;
    detected: boolean;
  } | null;
}

/**
 * **Search** (3 AP, pg 126-127): *"You make an active perception check to look
 * for someone or something hidden."*
 *
 * The rule prints no DC, and that is not an oversight so much as a division of
 * labour — pg 21 draws the line the whole chapter turns on: *"When you roll a
 * Perception ability check, your character is **actively** trying to find
 * something they may already be aware of"*, as against the passive sense score
 * that works without being asked.
 *
 * Against a specific hidden creature there *is* a printed comparison, and it is
 * the only one: pg 24's contest, *"a Perception check contested against a Sneak
 * check from you."* So a Search aimed at somebody rolls that contest, both sides
 * fresh, and `detectionOutcome` settles the tie the book leaves open. A Search
 * aimed at nothing in particular rolls the check and reports it, because the
 * DC for finding an unspecified something is the GM's to set.
 *
 * Note it is an **ability** check, not a Sneak-style skill check: "perception
 * check" with no skill named, and Perception governs five different skills here.
 */
export async function searchFor(
  actor: FoundryActor,
  system: CharacterData,
  target: FoundryActor | null = null,
  mode: RollMode = "normal",
): Promise<SearchReport> {
  const rolled = effectiveMode(system, ["perception"], mode);
  const roll = new foundry.dice.Roll(
    [
      d20Formula(rolled),
      signed(system.derived.abilityMods.perception),
      ...d20Modifiers(system, "perception"),
    ].join(" "),
  );
  await roll.evaluate();
  const raw = keptD20(roll);

  const hiding = target === null ? null : hiddenState(target);
  const apNote = await noteActionPoints(actor, SEARCH_AP_COST);
  await roll.toMessage({
    speaker: speaker(actor),
    flavor: `${game.i18n.localize("FALLOUT.Search.flavor", { ap: SEARCH_AP_COST })}${modeSuffix(
      rolled,
    )}${apNote === null ? "" : ` ${apNote.line}`}`,
  });

  if (target === null || hiding === null) {
    // Nothing hidden to contest with. The check stands as a number for the GM.
    await say(actor, game.i18n.localize("FALLOUT.Search.noQuarry"));
    return { ap: SEARCH_AP_COST, total: roll.total, raw, mode: rolled, contest: null };
  }

  // "contested against a Sneak check from you" (pg 24) — a *new* check from the
  // hider, not the total they hid with. The searcher rolled fresh; freezing one
  // side and not the other would be the odd choice.
  const targetSystem = systemOf(target);
  const contestMode = effectiveMode(
    targetSystem,
    [targetSystem.derived.skillAbilities.sneak, skillScope("sneak")],
    "normal",
  );
  const sneak = new foundry.dice.Roll(
    [
      d20Formula(contestMode),
      signed(targetSystem.derived.skillBonuses.sneak),
      ...d20Modifiers(targetSystem),
    ].join(" "),
  );
  await sneak.evaluate();
  await sneak.toMessage({
    speaker: speaker(target),
    flavor: `${game.i18n.localize("FALLOUT.Search.contest", {
      searcher: actor.name,
    })}${modeSuffix(contestMode)}`,
  });

  const detected = detectionOutcome(roll.total, sneak.total) === "detected";
  if (detected) await revealHidden(target, "FALLOUT.Search.found");
  await say(
    actor,
    game.i18n.localize(detected ? "FALLOUT.Search.detected" : "FALLOUT.Search.stillHidden", {
      target: target.name,
      searcher: roll.total,
      hider: sneak.total,
    }),
  );

  return {
    ap: SEARCH_AP_COST,
    total: roll.total,
    raw,
    mode: rolled,
    contest: { target: target.name, hiderTotal: sneak.total, detected },
  };
}

// =================================================================== Surprise

/** What a Surprise marker remembers (pg 125). */
export interface SurprisedRecord {
  /** The hiders this creature failed to notice. */
  missedThreats: string[];
  /** The passive sense that failed them. */
  passiveSense: number;
}

function isSurprisedRecord(value: unknown): value is SurprisedRecord {
  return (
    isRecord(value) &&
    Array.isArray(value.missedThreats) &&
    typeof value.passiveSense === "number"
  );
}

export function isSurprised(actor: FoundryActor): SurprisedRecord | null {
  return markers(actor, "surprised", isSurprisedRecord)[0]?.record ?? null;
}

export interface SurpriseReport {
  surprised: string[];
  alert: string[];
  /** The Sneak totals compared, by hider name. */
  hiders: { name: string; sneakTotal: number; rolled: boolean }[];
}

/**
 * **Step 1 of combat** (pg 125): *"Determine surprise. The GM determines whether
 * anyone involved in the combat encounter is surprised."*
 *
 * > The GM compares the Sneak checks of anyone hiding with the passive sense
 * > score of each creature on the opposing side. Any character or creature that
 * > doesn't notice a threat is surprised at the start of the encounter. If
 * > you're surprised, you can't move or take an action on your first turn of the
 * > combat, and you can't take a reaction until that turn ends. A member of a
 * > group can be surprised even if the other members aren't.
 *
 * This is the procedure that finally gives **passive sense** something to do —
 * the score has been computed on every sheet since v0.5 and read by nothing.
 * It is also, and more importantly, the book's only mechanism for making a
 * creature *unaware*, which is the second half of the sneak attack's
 * requirement on pg 128. See `sneakAttackPosture`.
 *
 * A hider who has already rolled a Hide reuses that total — it is *"the Sneak
 * check"* the rule means, and rerolling it would let a creature try twice. A
 * hider with no recorded roll gets one, which is the ordinary case at the top of
 * an ambush where nobody spent 6 AP on a Hide action first.
 *
 * The opposing side is whoever the GM targeted. That is not a compromise: the
 * rule is written as something *the GM does*, twice ("The GM determines", "The
 * GM compares"), against a side they have in mind. There is no combat document
 * to read it from in this system's typed globals anyway.
 */
export async function determineSurprise(
  hiders: readonly FoundryActor[],
  opposingSide: readonly FoundryActor[],
): Promise<SurpriseReport | null> {
  if (opposingSide.length === 0) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Surprise.noSide"));
    return null;
  }

  const rolledHiders: { name: string; sneakTotal: number; rolled: boolean }[] = [];
  for (const hider of hiders) {
    const recorded = hiddenState(hider);
    if (recorded !== null) {
      rolledHiders.push({ name: hider.name, sneakTotal: recorded.sneakTotal, rolled: false });
      continue;
    }
    const hiderSystem = systemOf(hider);
    const mode = effectiveMode(
      hiderSystem,
      [hiderSystem.derived.skillAbilities.sneak, skillScope("sneak")],
      "normal",
    );
    const roll = new foundry.dice.Roll(
      [
        d20Formula(mode),
        signed(hiderSystem.derived.skillBonuses.sneak),
        ...d20Modifiers(hiderSystem),
      ].join(" "),
    );
    await roll.evaluate();
    await roll.toMessage({
      speaker: speaker(hider),
      flavor: `${game.i18n.localize("FALLOUT.Surprise.sneakFlavor")}${modeSuffix(mode)}`,
    });
    rolledHiders.push({ name: hider.name, sneakTotal: roll.total, rolled: true });
  }

  const outcomes = surpriseOutcomes(
    rolledHiders.map((entry) => entry.sneakTotal),
    opposingSide.map((actor) => ({ actor, passiveSense: passiveSenseOf(actor) })),
  );

  const surprised: string[] = [];
  const alert: string[] = [];
  for (const outcome of outcomes) {
    const { actor } = outcome.creature;
    // Rebuilt fresh each time: a second Surprise call supersedes the first.
    await endSurprise(actor, false);
    if (!outcome.surprised) {
      alert.push(actor.name);
      continue;
    }
    surprised.push(actor.name);
    const record: SurprisedRecord = {
      missedThreats: rolledHiders
        .filter((entry) => outcome.missed.includes(entry.sneakTotal))
        .map((entry) => entry.name),
      passiveSense: outcome.passiveSense,
    };
    await actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: game.i18n.localize("FALLOUT.Surprise.effect"),
        img: "icons/svg/stoned.svg",
        type: "base",
        description: game.i18n.localize("FALLOUT.Surprise.description", {
          sense: outcome.passiveSense,
        }),
        // No changes: nothing in this system gates AP spending or reactions, so
        // Surprise's printed cost is a sentence on the card. Its *mechanical*
        // teeth are that it establishes unawareness for pg 128 — which is read
        // off this flag, not off a bonus.
        system: { changes: [] },
        flags: { [SYSTEM_ID]: { surprised: record } },
      },
    ]);
  }

  await foundry.documents.ChatMessage.create({
    content: game.i18n.localize(
      hiders.length === 0 ? "FALLOUT.Surprise.nobodyHiding" : "FALLOUT.Surprise.result",
      { surprised: surprised.join(", ") || "—", alert: alert.join(", ") || "—" },
    ),
  });
  return { surprised, alert, hiders: rolledHiders };
}

/**
 * Clear a Surprise: *"you can't move or take an action on your first turn of the
 * combat, and you can't take a reaction until **that turn ends**"* (pg 125).
 *
 * A button, at the end of that turn. The window is a deadline about one
 * creature's own turn, which Foundry can express as a duration — and `readyAction`
 * already declined that for the same shape, because a silent expiry removes a
 * state the table is reasoning about without saying so.
 */
export async function endSurprise(actor: FoundryActor, announce = true): Promise<number> {
  return endMarkerEffects(actor, "surprised", {
    match: isSurprisedRecord,
    announceKey: announce ? "FALLOUT.Surprise.over" : null,
  });
}

// =============================================================== sneak attacks

export interface SneakAttackPosture {
  /** pg 24: hidden from this target, so the attack roll has advantage. */
  advantage: boolean;
  /** pg 128: concealed *and* they are unaware, so the attack is a sneak attack. */
  sneakAttack: boolean;
  /** Whether the target is carrying a Surprise marker. */
  targetSurprised: boolean;
  /** Whether the attacker is hiding. */
  attackerHidden: boolean;
  /** Whether the target's name appears in the attacker's hidden-from list. */
  hiddenFromTarget: boolean;
}

/**
 * What the attacker's stealth is actually worth against this target, right now.
 *
 * **This is the wiring the sneak-attack flag never had.** `AttackOptions.sneak`
 * in `src/dice/rolls.ts` has been a hand-set boolean since it landed: the roll
 * knows what a sneak attack *does* (pg 128 — an automatic critical hit that
 * bypasses stamina points) and has never known when one applies. pg 128 gives
 * two conditions joined by *and*:
 *
 * 1. the target *"cannot sense you (being invisible, heavily obscured, full
 *    cover)"* — which is exactly the concealment Hide requires, so a hidden
 *    creature has it; and
 * 2. the target is *"unaware of your presence"* — which hiding **does not**
 *    give, because pg 127 says in as many words that *"Enemies still know your
 *    general location"*.
 *
 * So Hide alone buys advantage (pg 24) and Surprise is what buys the sneak
 * attack, because Surprise is the one procedure in the book that establishes a
 * creature does not know somebody is there (pg 125). `canSneakAttack` in
 * `src/rules/stealth.ts` carries the full argument.
 *
 * `unaware` overrides the Surprise marker for the cases a GM adjudicates —
 * asleep, facing a terminal, deep in a conversation — because the book's
 * "unaware of your presence" is a state of fiction and Surprise is only its
 * combat-opening special case.
 */
export function sneakAttackPosture(
  attacker: FoundryActor,
  target: FoundryActor,
  options: { concealment?: Concealment; unaware?: boolean } = {},
): SneakAttackPosture {
  const hidden = hiddenState(attacker);
  const targetSurprised = isSurprised(target) !== null;
  const unaware = options.unaware ?? targetSurprised;
  const hiddenFromTarget = hidden?.hiddenFrom.includes(target.name) === true;
  // A hidden creature has, by definition, the concealment pg 128 lists — that is
  // what `canHide` required of it, and since the Hide marker now records which
  // one, this reads it rather than guessing. An explicit declaration still wins,
  // for the case where the attacker never took the Hide action at all.
  //
  // The final branch is only for markers written before the field existed: it
  // recovers full cover exactly and calls everything else heavily obscured,
  // which is wrong for an invisible hider and for partial cover but is the best
  // available from a record that kept one boolean.
  const concealment: Concealment =
    options.concealment ??
    hidden?.concealment ??
    (hidden === null
      ? NO_CONCEALMENT
      : { cover: hidden.fullCover ? "total" : "none", heavilyObscured: !hidden.fullCover, invisible: false });

  return {
    advantage: hiddenFromTarget,
    sneakAttack: canSneakAttack(concealment, unaware),
    targetSurprised,
    attackerHidden: hidden !== null,
    hiddenFromTarget,
  };
}

// ====================================================================== Dodge

interface DodgeRecord {
  /** Feet of reactive movement still unspent (pg 126). */
  moveFeet: number;
  used: boolean;
}

function isDodgeRecord(value: unknown): value is DodgeRecord {
  return isRecord(value) && typeof value.moveFeet === "number" && typeof value.used === "boolean";
}

export function dodgeState(actor: FoundryActor): (DodgeRecord & { id: string }) | null {
  const entry = markers(actor, "dodge", isDodgeRecord)[0];
  return entry === undefined ? null : { ...entry.record, id: entry.id };
}

/** Grappled or Restrained — the two conditions that stop AP buying movement. */
export function cannotSpendApToMove(actor: FoundryActor): boolean {
  const statuses = actor.statuses;
  return statuses?.has("grappled") === true || statuses?.has("restrained") === true;
}

/**
 * **Dodge** (6 AP, pg 126):
 *
 * > You prepare to move quickly out of the way of an attack or explosion. Until
 * > the start of your next turn, any attack roll made against you has
 * > disadvantage if you can see the attacker. Additionally, you can move up to
 * > 15 feet in reaction to any other creature's action one time before the start
 * > of your next turn. You lose this benefit if you are dying or you cannot
 * > spend AP to move.
 *
 * **The disadvantage lands on somebody else's roll, and this system cannot put
 * it there.** Advantage and disadvantage are Active Effects on the creature that
 * rolls (`src/rules/effects.ts`), and an attack is rolled from the attacker's
 * sheet, which never learns who it is aimed at — the same wall cover ran into,
 * and the reason cover is declared per attack rather than measured. So a Dodge
 * is a marker on the defender, visible on their sheet and announced in chat, and
 * the attacker applies it the way they apply cover: by declaring it, which for
 * disadvantage means ctrl-clicking the attack.
 *
 * Making that automatic is one field on `AttackOptions` and is reported as an
 * integration point rather than reached for from here.
 *
 * Both halves of the benefit go away under the conditions the last sentence
 * names — see `dodgeBenefitLost` for why "this benefit" is read as both — and
 * the marker is created anyway when they hold, with the loss printed on the
 * card. A creature that dodges while grappled has spent 6 AP on nothing, and
 * that is worth saying out loud rather than silently refusing.
 */
export async function dodge(
  actor: FoundryActor,
  system: CharacterData,
): Promise<{ ap: number; moveFeet: number; suppressed: boolean }> {
  const dying = system.resources.hp.value <= 0 || actor.statuses?.has("dying") === true;
  const suppressed = dodgeBenefitLost(dying, cannotSpendApToMove(actor));

  await endDodge(actor, false);
  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: game.i18n.localize("FALLOUT.Dodge.effect"),
      img: "icons/svg/wingfoot.svg",
      type: "base",
      description: game.i18n.localize(
        suppressed ? "FALLOUT.Dodge.descriptionLost" : "FALLOUT.Dodge.description",
        { feet: DODGE_REACTIVE_MOVE_FEET },
      ),
      // No duration and no changes: the disadvantage belongs on an attack roll
      // this creature does not make, and "until the start of your next turn" is
      // a window a person closes with the Drop control.
      system: { changes: [] },
      flags: { [SYSTEM_ID]: { dodge: { moveFeet: DODGE_REACTIVE_MOVE_FEET, used: false } } },
    },
  ]);

  const apNote = await noteActionPoints(actor, DODGE_AP_COST);
  await say(
    actor,
    `${game.i18n.localize("FALLOUT.Dodge.started", {
      ap: DODGE_AP_COST,
      feet: DODGE_REACTIVE_MOVE_FEET,
    })}${suppressed ? ` ${game.i18n.localize("FALLOUT.Dodge.lost")}` : ""}${
      apNote === null ? "" : ` ${apNote.line}`
    }`,
  );
  return { ap: DODGE_AP_COST, moveFeet: DODGE_REACTIVE_MOVE_FEET, suppressed };
}

/**
 * Spend the Dodge's reactive move: *"you can move up to 15 feet in reaction to
 * any other creature's action **one time** before the start of your next turn"*
 * (pg 126).
 *
 * Once, and free — the sentence prices no AP for it, in a chapter where movement
 * is 1 AP per 5 feet. That is three 5-foot steps the Dodge is buying alongside
 * the disadvantage, and it is the half of this action nobody remembers, which is
 * exactly why it is a control and not a footnote.
 */
export async function useDodgeMove(actor: FoundryActor): Promise<boolean> {
  const state = dodgeState(actor);
  if (state === null) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Dodge.notDodging"));
    return false;
  }
  if (state.used) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Dodge.moveSpent"));
    return false;
  }
  await actor.updateEmbeddedDocuments("ActiveEffect", [
    { _id: state.id, [`flags.${SYSTEM_ID}.dodge.used`]: true },
  ]);
  await say(actor, game.i18n.localize("FALLOUT.Dodge.moved", { feet: state.moveFeet }));
  return true;
}

/** Drop the Dodge at the start of your next turn, or when the benefit is lost. */
export async function endDodge(actor: FoundryActor, announce = true): Promise<number> {
  return endMarkerEffects(actor, "dodge", {
    match: isDodgeRecord,
    announceKey: announce ? "FALLOUT.Dodge.ended" : null,
  });
}

// ====================================================================== Shove

export interface ShoveOptions {
  /** Which check the target defends with — the book gives them the choice. */
  defense?: ShoveDefense;
  /** What a win does: knock prone, or push 5 feet. The shover's choice. */
  outcome?: ShoveOutcome;
  /** *"must be within your reach"* (pg 127) — declared, never measured. */
  withinReach?: boolean;
  /** *"no more than one size larger than you"* (pg 127) — declared; no size field exists. */
  sizeAllows?: boolean;
  mode?: RollMode;
}

export interface ShoveReport {
  ap: number;
  shoverTotal: number;
  targetTotal: number;
  defense: ShoveDefense;
  outcome: ShoveOutcome;
  succeeded: boolean;
  mode: RollMode;
}

/**
 * **Shove** (4 AP, pg 127):
 *
 * > You knock a target prone or push it away from you. The target must be no
 * > more than one size larger than you and must be within your reach. Instead of
 * > making an attack roll, you make an Unarmed check contested by the target's
 * > Unarmed check or Agility check (the target chooses the ability to use). If
 * > you win the contest, you either knock the target prone or push it 5 feet
 * > away from you.
 *
 * **The last opposed roll in the book.** v2.1 rewrote Grapple and Escape into
 * flat DCs against `10 + the creature's Unarmed skill` and left this one alone,
 * so both sides roll here and only here — and, as a direct consequence of not
 * being rewritten, this is the one of the three *without* the *"or roll a 20"*
 * rider. That asymmetry is preserved rather than smoothed; see `shoveSucceeds`.
 *
 * The two sides are not the same kind of number and that is printed, not a
 * modelling choice: the shover rolls an **Unarmed skill check** (Strength-
 * governed), and the target picks between their **Unarmed skill bonus** and
 * their raw **Agility modifier**. `bestShoveDefense` pre-selects the larger of
 * the two so a target prompted on somebody else's turn is not defended badly by
 * default, and the caller can override it — which is what the book actually
 * grants them.
 *
 * A knock-prone applies the `prone` status; a push moves nobody, because token
 * position is not this system's to write and 5 feet in which direction is a
 * question the map answers.
 */
export async function shove(
  actor: FoundryActor,
  system: CharacterData,
  target: FoundryActor,
  options: ShoveOptions = {},
): Promise<ShoveReport | null> {
  if (!shoveAllowed(options.withinReach ?? true, options.sizeAllows ?? true)) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Shove.refused"));
    return null;
  }

  const targetSystem = systemOf(target);
  const defense =
    options.defense ??
    bestShoveDefense(
      targetSystem.derived.skillBonuses.unarmed,
      targetSystem.derived.abilityMods.agility,
    );
  const outcome = options.outcome ?? "prone";

  // The shover: an Unarmed *skill* check, so it answers to the skill's governing
  // ability and to anything scoped at Unarmed — and pointedly not to `attack`,
  // since the book says "instead of making an attack roll".
  const shoverMode = effectiveMode(
    system,
    [system.derived.skillAbilities.unarmed, skillScope("unarmed")],
    options.mode ?? "normal",
  );
  const shoverRoll = new foundry.dice.Roll(
    [
      d20Formula(shoverMode),
      signed(system.derived.skillBonuses.unarmed),
      ...d20Modifiers(system),
    ].join(" "),
  );
  await shoverRoll.evaluate();
  const apNote = await noteActionPoints(actor, SHOVE_AP_COST);
  await shoverRoll.toMessage({
    speaker: speaker(actor),
    flavor: `${game.i18n.localize("FALLOUT.Shove.flavor", {
      target: target.name,
      ap: SHOVE_AP_COST,
    })}${modeSuffix(shoverMode)}${apNote === null ? "" : ` ${apNote.line}`}`,
  });

  // The target: an Unarmed skill check or a raw Agility ability check, their
  // choice — two different quantities, which is why the scopes differ too.
  const defenseIsSkill = defense === "unarmed";
  const defenseMode = effectiveMode(
    targetSystem,
    defenseIsSkill
      ? [targetSystem.derived.skillAbilities.unarmed, skillScope("unarmed")]
      : ["agility"],
    "normal",
  );
  const defenseBonus = defenseIsSkill
    ? targetSystem.derived.skillBonuses.unarmed
    : targetSystem.derived.abilityMods.agility;
  const defenseRoll = new foundry.dice.Roll(
    [
      d20Formula(defenseMode),
      signed(defenseBonus),
      ...d20Modifiers(targetSystem, defenseIsSkill ? undefined : "agility"),
    ].join(" "),
  );
  await defenseRoll.evaluate();
  await defenseRoll.toMessage({
    speaker: speaker(target),
    flavor: `${game.i18n.localize("FALLOUT.Shove.defense", {
      defense: game.i18n.localize(
        defenseIsSkill ? "FALLOUT.Skills.unarmed" : "FALLOUT.Abilities.agility",
      ),
    })}${modeSuffix(defenseMode)}`,
  });

  const succeeded = shoveSucceeds(shoverRoll.total, defenseRoll.total);
  if (succeeded && outcome === "prone") {
    await target.toggleStatusEffect("prone", { active: true });
  }

  await say(
    actor,
    game.i18n.localize(
      succeeded
        ? outcome === "prone"
          ? "FALLOUT.Shove.knockedProne"
          : "FALLOUT.Shove.pushed"
        : "FALLOUT.Shove.failed",
      {
        target: target.name,
        shover: shoverRoll.total,
        defender: defenseRoll.total,
        feet: SHOVE_PUSH_FEET,
      },
    ),
  );

  return {
    ap: SHOVE_AP_COST,
    shoverTotal: shoverRoll.total,
    targetTotal: defenseRoll.total,
    defense,
    outcome,
    succeeded,
    mode: shoverMode,
  };
}

// ================================================================= Take Cover

interface TakeCoverRecord {
  /** The degree ducked out of — half or three-quarters (pg 127). */
  from: CoverDegree;
  /** The degree gained: full cover, always. */
  to: CoverDegree;
}

function isTakeCoverRecord(value: unknown): value is TakeCoverRecord {
  return isRecord(value) && typeof value.from === "string" && typeof value.to === "string";
}

export function takingCover(actor: FoundryActor): TakeCoverRecord | null {
  return markers(actor, "takeCover", isTakeCoverRecord)[0]?.record ?? null;
}

/**
 * **Take Cover** (3 AP, pg 127): *"If you only have three quarters or half
 * cover, you can spend 3 AP to squat, kneel, or duck into cover to gain full
 * cover. If you attack while taking cover, you no longer have full cover."*
 *
 * `TAKE_COVER_AP`, `canTakeCover` and `coverAfterTakingCover` have existed in
 * `src/rules/cover.ts` since the cover chapter shipped, with a docstring saying
 * they were built for whoever wired this action. This is that caller; the
 * arithmetic is not restated here.
 *
 * The upgrade matters more than a +5 AC: `blocksTargeting` makes full cover mean
 * *"can't be targeted directly by an attack"*, and `rollAttack` already refuses
 * such an attack before ammunition is spent. So this control turns a target into
 * one that cannot be shot at, and the attacker learns it by declaring `total`
 * cover on the roll — the same declaration every other degree uses.
 *
 * Ends on a trigger, not a clock: *"if you attack while taking cover"*. That is
 * `leaveCover`, and it is `endBlocking`'s shape exactly.
 */
export async function takeCover(
  actor: FoundryActor,
  from: CoverDegree,
): Promise<{ ap: number; from: CoverDegree; to: CoverDegree } | null> {
  if (!canTakeCover(from)) {
    // Nothing to duck behind, or already in total cover: pg 127 gates this on
    // having "only three quarters or half cover".
    ui.notifications.warn(game.i18n.localize("FALLOUT.TakeCover.needsPartial"));
    return null;
  }
  const to = coverAfterTakingCover(from);

  await leaveCover(actor, false);
  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: game.i18n.localize("FALLOUT.TakeCover.effect"),
      img: "icons/svg/shield.svg",
      type: "base",
      description: game.i18n.localize("FALLOUT.TakeCover.description"),
      // No changes: cover raises the *target's* AC, and an attack roll in this
      // system never sees an AC — it is declared on the attacker's roll instead.
      system: { changes: [] },
      flags: { [SYSTEM_ID]: { takeCover: { from, to } } },
    },
  ]);

  await say(
    actor,
    game.i18n.localize("FALLOUT.TakeCover.took", {
      ap: TAKE_COVER_AP,
      from: game.i18n.localize(`FALLOUT.Cover.degrees.${from}`),
    }),
  );
  return { ap: TAKE_COVER_AP, from, to };
}

/** *"If you attack while taking cover, you no longer have full cover"* (pg 127). */
export async function leaveCover(actor: FoundryActor, announce = true): Promise<number> {
  return endMarkerEffects(actor, "takeCover", {
    match: isTakeCoverRecord,
    announceKey: announce ? "FALLOUT.TakeCover.left" : null,
  });
}

// ============================================== stand up, stow, equip a weapon

/**
 * **Stand up from Prone** (5 AP, pg 126-127) — five points, which is the second
 * most expensive movement in the table and worth noticing next to Move 5 feet's 1.
 *
 * pg 135: *"A prone creature's only movement option is to crawl, unless it
 * stands up and thereby ends the condition."* Clearing the status is the whole
 * action; there is no check and no alternative exit. (Crawling, the other half of
 * that sentence, has no rate or AP cost printed anywhere in the book — a gap the
 * roadmap already records, and not one this action can close.)
 */
export async function standUp(actor: FoundryActor): Promise<boolean> {
  if (actor.statuses?.has("prone") !== true) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Stand.notProne"));
    return false;
  }
  await actor.toggleStatusEffect("prone", { active: false });
  const apNote = await noteActionPoints(actor, STAND_UP_AP_COST);
  await say(
    actor,
    game.i18n.localize("FALLOUT.Stand.stood", { ap: STAND_UP_AP_COST }) +
      (apNote === null ? "" : ` ${apNote.line}`),
  );
  return true;
}

/** The weapons this character currently has in hand. */
export function heldWeapons(actor: FoundryActor): FoundryItem[] {
  return (actor.itemTypes.weapon ?? []).filter((item) => (item.system as WeaponData).equipped);
}

/**
 * **Stow a weapon** (3 AP, pg 127): *"You take a weapon you are holding and put
 * it into your inventory."*
 *
 * Holding is `system.equipped` here and inventory is where the item already
 * lives, so this is one boolean.
 */
export async function stowWeapon(actor: FoundryActor, weapon: FoundryItem): Promise<boolean> {
  if (!(weapon.system as WeaponData).equipped) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Stow.notHeld"));
    return false;
  }
  await weapon.update({ "system.equipped": false });
  const apNote = await noteActionPoints(actor, STOW_WEAPON_AP_COST);
  await say(
    actor,
    game.i18n.localize("FALLOUT.Stow.stowed", { weapon: weapon.name, ap: STOW_WEAPON_AP_COST }) +
      (apNote === null ? "" : ` ${apNote.line}`),
  );
  return true;
}

/**
 * **Equip a weapon** (3 AP, pg 126): *"You take a weapon within reach and
 * prepare to attack with it with any hands you have free. If you have a weapon
 * in your hands already and have not stowed it, you drop it on the ground."*
 *
 * **The drop clause is reported and not enforced.** It needs to know how many
 * hands are free, and there is no hands resource in this system or in the book —
 * 136 pages never say how many hands a creature has, never say a Two Handed
 * weapon occupies two, and the v2.1 free-hand reload requirement hit the same
 * wall and was reported for the same reason. Dropping a weapon because a model
 * the book does not have says a hand is full would be inventing the rule twice
 * over: once for hands, once for which weapon goes.
 *
 * So this equips, and names on the card exactly which weapons the printed
 * sentence would put on the ground.
 */
export async function equipWeapon(actor: FoundryActor, weapon: FoundryItem): Promise<boolean> {
  const alreadyHeld = heldWeapons(actor);
  if (alreadyHeld.some((item) => item.id === weapon.id)) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Equip.alreadyHeld"));
    return false;
  }
  await weapon.update({ "system.equipped": true });

  const dropped = weaponsDroppedByEquipping(alreadyHeld, weapon).map((item) => item.name);
  const apNote = await noteActionPoints(actor, EQUIP_WEAPON_AP_COST);
  await say(
    actor,
    `${game.i18n.localize("FALLOUT.Equip.equipped", {
      weapon: weapon.name,
      ap: EQUIP_WEAPON_AP_COST,
    })}${
      dropped.length === 0
        ? ""
        : ` ${game.i18n.localize("FALLOUT.Equip.wouldDrop", { weapons: dropped.join(", ") })}`
    }${apNote === null ? "" : ` ${apNote.line}`}`,
  );
  return true;
}
