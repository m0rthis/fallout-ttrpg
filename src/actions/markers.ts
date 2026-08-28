/**
 * Marker effects — the one scan and the one teardown.
 *
 * A *marker* in this system is an Active Effect whose only job is to say that a
 * state is on: Blocking (pg 127), Hidden and Surprised (pg 125, 127), Dodging
 * and Taking Cover (pg 126-127), the Nightkin Stealth Field (pg 12). They carry
 * a flag under this system's scope, they are created by a button, and they are
 * cleared by a button or by the trigger the rule names — `src/actions/
 * situations.ts` sets out at length why none of them is cleared by a document
 * hook, and `src/actions/stealth.ts` restates it for its four.
 *
 * Every one of those modules had grown its own copy of the same two operations:
 * scan `actor.effects` for the flag, and delete-then-announce. Three copies
 * existed when this module was extracted (`blocking.ts`'s `endBlocking`,
 * `stealth.ts`'s `markers`/`clearMarkers`, `stealth-field.ts`'s private
 * `effectIds`), and the Stealth Boy (pg 91, BACKLOG D1) would have been a
 * fourth. They are here now, once.
 *
 * ## Two kinds of flag, one reader each
 *
 * - **A boolean marker** — `flags.fallout.blocking === true`. The state is the
 *   whole payload. `markerIds` and `activeMarkers` read these.
 * - **A record marker** — `flags.fallout.hidden = { sneakTotal, … }`. The state
 *   carries what it was rolled with, because something later contests it.
 *   `markers` reads these, through the caller's own type guard: a flag is
 *   untyped storage, so nothing here trusts its shape.
 *
 * `endMarkerEffects` serves both, and takes the guard as `match` when the flag
 * is a record.
 *
 * ## Expiry is deliberately not consulted by the teardown
 *
 * `stealth-field.ts` is the one consumer whose markers carry a real Foundry
 * duration (the field runs a printed minute, each Perception decay a printed 24
 * hours), and it reads `duration.expired` in two places — `isStealthFieldActive`
 * and `stealthFieldPerceptionPenalty`. That guard is about **whether a state is
 * still true**, and it stays with the readers: `activeMarkers` is the shared
 * form of it.
 *
 * The **teardown does not filter on expiry, on purpose.** Core leaves an elapsed
 * effect on the actor as an inert row rather than deleting it, so sweeping those
 * rows away is half of what `endStealthField` is for — filtering them out would
 * leave exactly the litter the control exists to clear. It is also a no-op
 * distinction for every duration-less marker (`expired` is never true for one),
 * so making it shared behaviour would cost the one consumer that has durations
 * and buy the other three nothing.
 */

import { SYSTEM_ID } from "../rules/effects";

/** A marker found on an actor: the effect's id, and the flag it was carrying. */
export interface MarkerEntry<T> {
  id: string;
  record: T;
}

/** The default `match`: a bare boolean marker, set true and never set false. */
function isSet(value: unknown): boolean {
  return value === true;
}

/**
 * This actor's markers of one kind, with their payloads.
 *
 * The guard is the caller's because the flag is the caller's: `HiddenRecord` and
 * `BreathRecord` are validated by the modules that write them, and a marker
 * whose shape has drifted (an old world, a hand-edited effect) is simply not
 * found rather than crashing a panel.
 */
export function markers<T>(
  actor: FoundryActor,
  key: string,
  guard: (value: unknown) => value is T,
): MarkerEntry<T>[] {
  const out: MarkerEntry<T>[] = [];
  for (const effect of actor.effects) {
    const flag = effect.getFlag(SYSTEM_ID, key);
    if (guard(flag)) out.push({ id: effect.id, record: flag });
  }
  return out;
}

/** The effect ids of one kind of marker. `match` defaults to boolean markers. */
export function markerIds(
  actor: FoundryActor,
  key: string,
  match: (value: unknown) => boolean = isSet,
): string[] {
  const ids: string[] = [];
  for (const effect of actor.effects) {
    if (match(effect.getFlag(SYSTEM_ID, key))) ids.push(effect.id);
  }
  return ids;
}

/**
 * The markers of one kind that are still *running* — the reader's question, not
 * the teardown's. Core marks an elapsed effect inactive and stops applying its
 * changes a moment after world time passes it, so a state counted off expired
 * rows would be a state the sheet no longer has.
 *
 * Duration-less markers are never expired, so this is the same as `markerIds`
 * for them and the difference only bites where a rule printed a clock.
 */
export function activeMarkers(
  actor: FoundryActor,
  key: string,
  match: (value: unknown) => boolean = isSet,
): FoundryActiveEffect[] {
  return Array.from(actor.effects).filter(
    (effect) => match(effect.getFlag(SYSTEM_ID, key)) && effect.duration.expired !== true,
  );
}

/**
 * Delete a list of effects, and report how many went.
 *
 * The count is what every caller returns to *its* caller, so a control can stay
 * quiet when there was nothing up — an "you are no longer blocking" card for a
 * character who was not blocking is noise.
 */
export async function clearMarkers(actor: FoundryActor, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  return ids.length;
}

export interface MarkerTeardown {
  /**
   * A localization key to post when something was actually removed, or null to
   * clear silently — the silent form is what a fresh Hide uses to supersede an
   * old one, and what `determineSurprise` uses before it rebuilds.
   */
  announceKey?: string | null;
  /**
   * Which flag values count as this marker. Defaults to the boolean markers;
   * pass the record guard for a record marker.
   */
  match?: (value: unknown) => boolean;
}

/**
 * End every marker of one kind, and say so.
 *
 * The shape three modules had each written out: collect the ids, return 0 with
 * no card when there are none, delete them, post one line when the caller wants
 * one, return the count. Nothing here consults `duration.expired` — see the
 * module note.
 */
export async function endMarkerEffects(
  actor: FoundryActor,
  flagKey: string,
  options: MarkerTeardown = {},
): Promise<number> {
  const cleared = await clearMarkers(actor, markerIds(actor, flagKey, options.match ?? isSet));
  const announceKey = options.announceKey ?? null;
  if (cleared > 0 && announceKey !== null) {
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: game.i18n.localize(announceKey),
    });
  }
  return cleared;
}
