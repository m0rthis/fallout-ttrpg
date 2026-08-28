/**
 * Blocking (v2.1 pg 127).
 *
 * > While wielding a melee weapon, you can spend 3 AP to block. Until you
 * > attack again, your damage threshold is increased by 2 + your Endurance
 * > modifier against melee attacks.
 *
 * Two things about this rule shaped the implementation:
 *
 * - **It expires on a trigger, not a clock.** Every other effect in this system
 *   ends when world time passes it, and Foundry owns that expiry. "Until you
 *   attack again" has no duration to give it, so the block is a duration-less
 *   effect that the attack roll clears. It therefore survives across turns and
 *   across scenes, exactly as printed, and nothing races core's expiry pass.
 * - **The DT is melee-only**, so it targets `system.bonuses.dtMelee` rather
 *   than the general `dt`. The damage pipeline reads whichever of the two the
 *   incoming attack calls for.
 *
 * v2.1 removed unarmed blocking — v2.0 allowed "unarmed **or** wielding a melee
 * weapon", v2.1 dropped the unarmed half — so this requires an equipped melee
 * weapon and says so when there is none.
 */

import type { CharacterData } from "../data/character";
import type { WeaponData } from "../data/items";
import { BLOCK_AP_COST, MELEE_WEAPON_TYPES } from "../rules/constants";
import { addChange, bonusPath, SYSTEM_ID } from "../rules/effects";
import { DEFENSIVE_BLOCK_DT } from "../rules/weapons";
import { noteActionPoints } from "../combat/action-points";
import { endMarkerEffects, markerIds } from "./markers";

/** The printed base, before the Endurance modifier. */
export const BLOCK_DT_BASE = 2;

/** Flag key on the marker effect that carries the block. */
const BLOCKING_FLAG = "blocking";

/** The melee weapon the character has in hand, if any. */
export function wieldedMeleeWeapon(actor: FoundryActor): FoundryItem | undefined {
  return (actor.itemTypes.weapon ?? []).find((item) => {
    const weapon = item.system as WeaponData;
    return weapon.equipped && (MELEE_WEAPON_TYPES as readonly string[]).includes(weapon.weaponType);
  });
}

export function isBlocking(actor: FoundryActor): boolean {
  return markerIds(actor, BLOCKING_FLAG).length > 0;
}

/**
 * The DT a block grants: `2 + Endurance modifier`, exactly as printed.
 *
 * A character with an Endurance modifier below −2 gets a *negative* number out
 * of that formula, which would make blocking actively harmful. The book has no
 * minimum, so neither does this — blocking is voluntary, and a rule this system
 * silently "fixes" is a rule the GM can no longer see.
 */
export function blockDamageThreshold(enduranceMod: number, defensive = false): number {
  return BLOCK_DT_BASE + enduranceMod + (defensive ? DEFENSIVE_BLOCK_DT : 0);
}

/**
 * "If you block while holding this weapon, your DT increases by 2" — the
 * Defensive property, printed identically in both glossaries (pg 61, 70).
 *
 * It says *holding*, not *blocking with*, so a Defensive weapon in the off hand
 * would qualify. This system has no off-hand slot, so it checks every equipped
 * weapon rather than only the melee one the block itself requires.
 *
 * **A modification can grant Defensive** (D3 slice 3): ranged Strengthen gains
 * *"Sturdy and Defensive"* (pg 77) and melee Double Sided *"Defensive and Two
 * Handed"* (pg 65). This was the first place in the system where a mod-granted
 * property reached a number, and it called `weaponKeywords` directly because
 * `WeaponData.keywords` still read the printed column alone. That getter now
 * does the merged read itself, so this asks the weapon.
 */
export function defensiveBonusHeld(actor: FoundryActor): boolean {
  return (actor.itemTypes.weapon ?? []).some((item) => {
    const weapon = item.system as WeaponData;
    return weapon.equipped && weapon.keywords.defensive;
  });
}

/**
 * Spend 3 AP to block. Returns the DT gained, or null when the character has no
 * melee weapon in hand or is already blocking.
 *
 * AP is reported rather than deducted, matching every other action in this
 * system — see roadmap item 14.
 */
export async function startBlocking(
  actor: FoundryActor,
  system: CharacterData,
): Promise<number | null> {
  if (isBlocking(actor)) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Block.already"));
    return null;
  }
  const weapon = wieldedMeleeWeapon(actor);
  if (!weapon) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Block.needsMelee"));
    return null;
  }

  const defensive = defensiveBonusHeld(actor);
  const dt = blockDamageThreshold(system.derived.abilityMods.endurance, defensive);
  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: game.i18n.localize("FALLOUT.Block.effect"),
      img: "icons/svg/shield.svg",
      type: "base",
      description: game.i18n.localize("FALLOUT.Block.description", { dt }),
      // No duration: this ends when the character attacks, which is a trigger
      // Foundry's clock cannot express.
      system: { changes: [addChange(bonusPath("dtMelee"), dt)] },
      flags: { [SYSTEM_ID]: { [BLOCKING_FLAG]: true } },
    },
  ]);

  const ap = await noteActionPoints(actor, BLOCK_AP_COST);
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: [
      game.i18n.localize("FALLOUT.Block.started", {
        weapon: weapon.name,
        ap: BLOCK_AP_COST,
        dt,
      }),
      ...(ap === null ? [] : [ap.line]),
    ].join(" "),
  });
  return dt;
}

/**
 * Drop the block. Called whenever the character attacks — the trigger the rule
 * names — and available on the sheet for a player who wants to lower their
 * guard without swinging.
 *
 * @returns the number of blocking effects removed, so callers can stay quiet
 *          when there was nothing to remove.
 */
export async function endBlocking(actor: FoundryActor, announce = false): Promise<number> {
  return endMarkerEffects(actor, BLOCKING_FLAG, {
    announceKey: announce ? "FALLOUT.Block.ended" : null,
  });
}
