import type { AidData } from "../data/items";
import { changesForProperties, SYSTEM_ID, type EffectChange } from "../rules/effects";

/**
 * Timed Active Effects created by consuming aid.
 *
 * Every chem and program lasts an hour (pg 89); some food and drink
 * properties last four or six.
 *
 * **Expiry belongs to Foundry, not to us.** When world time passes a
 * duration, core asynchronously marks the effect `duration.expired = true`
 * and `active = false`, and its changes stop applying — verified on 14.365 by
 * watching a DT bonus fall from 4 to 0 without any involvement from this
 * system. (An earlier reading of the API here was wrong: it sampled the
 * effect synchronously right after advancing time, before core's expiry pass
 * had run, and concluded durations never expire. The sweep built on that
 * belief deleted effects out from under core's own update and made the server
 * reject it — which is what surfaced as "does not exist in the
 * EmbeddedCollection collection" in the console.)
 *
 * So nothing here removes effects on a timer. Expired effects linger as inert,
 * greyed-out entries until the character starts a new day, which is also when
 * the chem counter resets.
 */

const HOUR_SECONDS = 3600;

/** Parse the item's printed duration into seconds; 0 when it is not a fixed span. */
export function durationSeconds(duration: string): number {
  const match = /^\s*(\d+)\s*(second|minute|hour|day)s?\s*$/i.exec(duration);
  if (!match) return 0;
  const amount = Number(match[1]);
  switch (match[2]?.toLowerCase()) {
    case "second":
      return amount;
    case "minute":
      return amount * 60;
    case "hour":
      return amount * HOUR_SECONDS;
    case "day":
      return amount * 24 * HOUR_SECONDS;
    default:
      return 0;
  }
}

interface EffectDocument {
  readonly id: string;
  getFlag(scope: string, key: string): unknown;
}

/** Effects this system created by consuming something. */
function isConsumableEffect(effect: EffectDocument): boolean {
  return effect.getFlag(SYSTEM_ID, "consumable") === true;
}

/**
 * Give the actor a timed effect for the consumable they just used. Numeric
 * properties become guided changes; a consumable with no numeric properties
 * still gets an effect so the buff is visible and dismissible, carrying its
 * text for the player to apply by hand.
 */
export async function applyConsumableEffect(
  actor: FoundryActor,
  item: FoundryItem,
  aid: AidData,
): Promise<void> {
  const seconds = durationSeconds(aid.duration);
  if (seconds <= 0) return;

  const changes: EffectChange[] = changesForProperties(aid.properties);
  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: item.name,
      img: item.img,
      type: "base",
      origin: item.uuid,
      duration: { value: seconds, units: "seconds" },
      description: aid.effect,
      // v14 keeps changes in system.changes; the old top-level placement is a
      // shim deprecated since 14.
      system: { changes },
      flags: { [SYSTEM_ID]: { consumable: true } },
    },
  ]);
}

/**
 * Tidy away consumable effects that Foundry has already retired.
 *
 * Only effects core has marked `expired` are removed, never ones this system
 * judges stale on its own — waiting for core's own flag is what keeps the
 * deletion from racing the update core issues when a duration lapses.
 */
export async function clearExpiredEffects(actor: FoundryActor): Promise<number> {
  const ids = Array.from(actor.effects)
    .filter((effect) => isConsumableEffect(effect) && effect.duration.expired === true)
    .map((effect) => effect.id);
  return deleteEffects(actor, ids);
}

/** Drop every consumable effect on the actor, expired or not (a new day). */
export async function clearConsumableEffects(actor: FoundryActor): Promise<number> {
  const ids = Array.from(actor.effects)
    .filter(isConsumableEffect)
    .map((effect) => effect.id);
  return deleteEffects(actor, ids);
}

async function deleteEffects(actor: FoundryActor, ids: string[]): Promise<number> {
  const present = ids.filter((id) => actor.effects.get(id));
  if (present.length === 0) return 0;
  await actor.deleteEmbeddedDocuments("ActiveEffect", present);
  return present.length;
}
