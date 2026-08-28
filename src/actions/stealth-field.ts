/**
 * The Nightkin Stealth Field (v2.1 pg 12).
 *
 * > **Nightkin.** …You also gain an ability called Stealth field. You can spend
 * > 3 action points on your turn to turn you and everything you are carrying
 * > invisible. This ability lasts for 1 minute. Each time you use this ability
 * > after the first use each day, your Perception ability score temporarily
 * > decreases by 1 for 24 hours (to a minimum of 1). Your Perception ability
 * > score being decreased in this way does not limit you in using or choosing
 * > perks that have a Perception ability score requirement.
 *
 * Three clocks, deliberately kept apart, because conflating any two of them
 * gets the ladder wrong:
 *
 * - **The field itself: 1 minute.** A real duration, so it is a real Foundry
 *   duration (60 seconds) and core expires it. Unlike Blocking (pg 127, "until
 *   you attack again"), nothing in the printed text ends this early — not
 *   attacking, not being hit — so nothing here does either. `endStealthField`
 *   exists for the player who wants to drop it, and for the sweep that clears
 *   the inert expired rows core leaves behind.
 * - **Each decay: 24 hours.** Also a real duration, one effect per extra use,
 *   each subtracting 1 from `system.abilities.perception.value` in the
 *   `initial` phase. They stack (see `stealthFieldPerceptionCost`), and each
 *   lapses on its own clock, so a Nightkin who burned four uses climbs back
 *   one point at a time rather than all at once.
 * - **The use counter: "each day".** That is the book's own day, which in this
 *   system is the day the GM rolls over with `passDay` — the same boundary the
 *   chem counter resets on (pg 89). It is *not* 24 hours of world time, and
 *   pointedly not the same clock as the decay: a use at 23:00 and one at 01:00
 *   are two different days but both decays are still running.
 *
 * **Where the counter lives.** On the actor, in a system flag, written only
 * from here — `rules/` stays pure and never touches a document. A flag rather
 * than a schema field because the flag needs no migration and no coordination
 * with the character schema; `src/actions/backgrounds.ts` keeps its ledger the
 * same way. See `resetStealthFieldUses` for the passDay tie-in.
 *
 * **Scope of "invisible".** This system has no invisibility automation and this
 * item does not add any: canvas vision, detection modes, and who-can-see-whom
 * are out of scope. What the action does is post a card and apply a marker
 * effect carrying core's own `invisible` status, which (a) shows on the token
 * and its HUD, and (b) is the state a GM reads when they declare `invisible`
 * concealment for a Hide or a sneak attack in the stealth panel — concealment
 * in this system is declared, never measured (see `src/rules/stealth.ts`, and
 * `Concealment.invisible` on pg 134: "for the purpose of hiding, the creature
 * is heavily obscured"). Wiring the status into that declaration automatically
 * would change how every other concealment source behaves, so it is left to the
 * table exactly as cover is.
 *
 * `applyInvisibility` is separated out because the Stealth Boy (pg 91, backlog
 * D1) is the same effect with a different trigger and a one-shot charge, and
 * should reuse this rather than grow a second invisibility.
 */

import type { CharacterData } from "../data/character";
import { addChange, SYSTEM_ID } from "../rules/effects";
import { apLine } from "../combat/action-points";
import { hasStealthField, STEALTH_FIELD_AP_COST, STEALTH_FIELD_DECAY_HOURS, STEALTH_FIELD_DECAY_SECONDS, STEALTH_FIELD_PERCEPTION_FLOOR, STEALTH_FIELD_SECONDS, stealthFieldPerceptionCost } from "../rules/races";
import { activeMarkers, endMarkerEffects } from "./markers";

/** Flag key on the *actor*: how many times the field has run today. */
export const STEALTH_FIELD_USES_FLAG = "stealthFieldUses";
/** Flag key on the marker effect that carries the invisibility. */
export const STEALTH_FIELD_FLAG = "stealthField";
/** Flag key on each 24-hour Perception reduction. */
export const STEALTH_FIELD_DECAY_FLAG = "stealthFieldDecay";

/** The core status id this system borrows; core ships it, we never register it. */
const INVISIBLE_STATUS = "invisible";
const INVISIBLE_ICON = "icons/svg/invisible.svg";

/** The ability score path the decay subtracts from — a real, guided field. */
const PERCEPTION_PATH = "system.abilities.perception.value";

/**
 * Whether the field is currently up (an unexpired marker effect).
 *
 * `activeMarkers` is the shared reader, and the `duration.expired` guard is the
 * reason this file wants it rather than the flat `markerIds`: these are the only
 * markers in the system with real Foundry durations, and core leaves an elapsed
 * one on the actor as an inert row. See the note in `./markers` for why the
 * *teardown* deliberately does not filter the same way.
 */
export function isStealthFieldActive(actor: FoundryActor): boolean {
  return activeMarkers(actor, STEALTH_FIELD_FLAG).length > 0;
}

/**
 * How many Perception points this character is currently down by, counting only
 * reductions this ability caused. Expired rows are excluded: core marks an
 * elapsed effect inactive and stops applying its change a moment after world
 * time passes it, so counting them would report a penalty the sheet no longer
 * has.
 */
export function stealthFieldPerceptionPenalty(actor: FoundryActor): number {
  return activeMarkers(actor, STEALTH_FIELD_DECAY_FLAG).length;
}

/** Uses so far today. Absent flag means none — a fresh actor has never used it. */
export function stealthFieldUsesToday(actor: FoundryActor): number {
  const stored = actor.getFlag(SYSTEM_ID, STEALTH_FIELD_USES_FLAG);
  return typeof stored === "number" && stored > 0 ? stored : 0;
}

/**
 * Clear the daily counter. **This is the passDay hook**: `src/actions/rest.ts`
 * already resets `system.chems.usedToday` and the survival intake when the GM
 * rolls the day over (pg 89, 119), and "each use after the first each day" is
 * the same boundary, so `passDay` should call this alongside them.
 *
 * Deliberately does *not* touch the 24-hour Perception reductions. They are a
 * separate clock the book prints in hours, Foundry expires them itself, and a
 * day that rolls over eight hours after a use must not hand the points back
 * early.
 */
export async function resetStealthFieldUses(actor: FoundryActor): Promise<void> {
  if (stealthFieldUsesToday(actor) === 0) return;
  await actor.unsetFlag(SYSTEM_ID, STEALTH_FIELD_USES_FLAG);
}

/** What one activation did, for the caller and the smoke suite. */
export interface StealthFieldReport {
  /** Reported, never deducted — every action in this system does the same. */
  ap: number;
  /** How long the field lasts, in seconds (1 minute, pg 12). */
  seconds: number;
  /** The use number this activation was, counting from 1, within the day. */
  use: number;
  /** Perception lost to this activation: 0 for the first use, or at the floor. */
  perceptionLost: number;
  /** Total Perception currently owed to the Stealth Field, this use included. */
  perceptionPenalty: number;
  /** The Perception score after this activation. */
  perceptionScore: number;
  /** Whether the score has bottomed out at the printed minimum of 1. */
  atFloor: boolean;
}

/**
 * Turn a creature invisible for a span, as a marker effect.
 *
 * Carries core's `invisible` status rather than a change: invisibility is not a
 * number this system computes, and the status is what the token HUD, the GM's
 * concealment declaration, and any future Stealth Boy all read.
 */
export async function applyInvisibility(
  actor: FoundryActor,
  options: { seconds: number; name: string; description: string; flagKey: string },
): Promise<void> {
  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: options.name,
      img: INVISIBLE_ICON,
      type: "base",
      description: options.description,
      // v14 ActiveEffect carries a `statuses` set (verified in the deployed
      // foundry.mjs); the actor folds every applied effect's statuses into
      // `actor.statuses`, which is how the token shows it.
      statuses: [INVISIBLE_STATUS],
      duration: { value: options.seconds, units: "seconds" },
      system: { changes: [] },
      flags: { [SYSTEM_ID]: { [options.flagKey]: true } },
    },
  ]);
}

/**
 * Spend 3 AP to raise the Stealth Field (pg 12).
 *
 * Returns null when this character is not a Nightkin, or when the field is
 * already up — re-raising would spend a second use (and so a Perception point)
 * on a minute that is already running, which is a cost the book never asks for.
 *
 * AP is reported rather than deducted, matching every other action in this
 * system — see backlog E1.
 */
export async function raiseStealthField(
  actor: FoundryActor,
  system: CharacterData,
): Promise<StealthFieldReport | null> {
  // A plain read: the field is real schema now (character.ts declares and
  // defaults it), and the widening cast this used to carry would keep
  // compiling if the field were ever renamed — silently turning every
  // Nightkin back into Superior Strength. `hasStealthField` normalises
  // internally, and a pre-field document reads the initial "".
  if (!hasStealthField(system.details.race, system.details.mutantVariant)) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.StealthField.needsNightkin"));
    return null;
  }
  if (isStealthFieldActive(actor)) {
    ui.notifications.info(game.i18n.localize("FALLOUT.StealthField.already"));
    return null;
  }

  const usesToday = stealthFieldUsesToday(actor);
  // The prepared score, so reductions already running are counted — the floor
  // is on the score, not on the number of uses.
  const scoreBefore = system.abilities.perception.value;
  const perceptionLost = stealthFieldPerceptionCost(usesToday, scoreBefore);

  await applyInvisibility(actor, {
    seconds: STEALTH_FIELD_SECONDS,
    name: game.i18n.localize("FALLOUT.StealthField.effect"),
    description: game.i18n.localize("FALLOUT.StealthField.description"),
    flagKey: STEALTH_FIELD_FLAG,
  });

  if (perceptionLost > 0) {
    await actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: game.i18n.localize("FALLOUT.StealthField.decayEffect"),
        img: "icons/svg/downgrade.svg",
        type: "base",
        description: game.i18n.localize("FALLOUT.StealthField.decayDescription", {
          hours: STEALTH_FIELD_DECAY_HOURS,
        }),
        duration: { value: STEALTH_FIELD_DECAY_SECONDS, units: "seconds" },
        // An `initial`-phase change against the real score field, so every
        // reader of the stored Perception — the derived modifier, weapon range
        // multipliers, the Unwieldy penalty — sees it without being taught to.
        system: { changes: [addChange(PERCEPTION_PATH, -perceptionLost)] },
        flags: { [SYSTEM_ID]: { [STEALTH_FIELD_DECAY_FLAG]: true } },
      },
    ]);
  }

  const use = usesToday + 1;
  await actor.setFlag(SYSTEM_ID, STEALTH_FIELD_USES_FLAG, use);

  const perceptionScore = scoreBefore - perceptionLost;
  const report: StealthFieldReport = {
    ap: STEALTH_FIELD_AP_COST,
    seconds: STEALTH_FIELD_SECONDS,
    use,
    perceptionLost,
    perceptionPenalty: stealthFieldPerceptionPenalty(actor),
    perceptionScore,
    atFloor: perceptionScore <= STEALTH_FIELD_PERCEPTION_FLOOR,
  };

  const lines = [
    game.i18n.localize("FALLOUT.StealthField.raised", {
      ap: report.ap,
      seconds: report.seconds,
    }),
    ...(await apLine(actor, STEALTH_FIELD_AP_COST)),
    perceptionLost > 0
      ? game.i18n.localize("FALLOUT.StealthField.decayed", {
          use: report.use,
          lost: perceptionLost,
          hours: STEALTH_FIELD_DECAY_HOURS,
          score: perceptionScore,
        })
      : game.i18n.localize("FALLOUT.StealthField.freeUse"),
    // The exemption is printed and worth saying out loud, because it is the one
    // consequence a GM would otherwise apply by habit. It needs no enforcement
    // here: perk requirements in this system are unstructured prose on the perk
    // item and are never machine-checked (`src/actions/progression.ts`), so a
    // decayed Perception cannot disqualify anything in the first place.
    report.atFloor
      ? game.i18n.localize("FALLOUT.StealthField.atFloor")
      : game.i18n.localize("FALLOUT.StealthField.perksUnaffected"),
  ];

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: lines.join("<br />"),
  });
  return report;
}

/**
 * Drop the field early, and sweep any expired marker core has left behind.
 *
 * @returns how many marker effects were removed, so a caller can stay quiet
 *          when there was nothing up.
 */
export async function endStealthField(actor: FoundryActor, announce = false): Promise<number> {
  // Expired rows are swept along with a running field, which is half of what
  // this control is for — see `endMarkerEffects`.
  return endMarkerEffects(actor, STEALTH_FIELD_FLAG, {
    announceKey: announce ? "FALLOUT.StealthField.ended" : null,
  });
}

/**
 * Clear every Perception reduction outright.
 *
 * Not a rule — the book gives no way to shed these early — but a GM adjudicating
 * a house ruling, or cleaning up after a test, has nothing else to press. Kept
 * out of `passDay` on purpose: see `resetStealthFieldUses`.
 */
export async function clearStealthFieldDecay(actor: FoundryActor): Promise<number> {
  return endMarkerEffects(actor, STEALTH_FIELD_DECAY_FLAG);
}
