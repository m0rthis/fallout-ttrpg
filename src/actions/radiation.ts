import type { CharacterData } from "../data/character";
import {
  LETHAL_CONDITION_LEVEL,
  RADIATION_DAMAGE,
  RADIATION_DC_ESCALATION,
  RADIATION_REVIVAL_DC,
  RADIATION_FERAL_ROLL,
} from "../rules/constants";

/**
 * Radiation (v2.1 pg 124) — reworked from v2.0 in three ways at once.
 *
 * Gaining a level now deals `1d4` radiation damage to hit points **and**
 * stamina points, and that damage cannot be healed until you have **no levels
 * of Rads at all** — v2.0 dealt `1d12` to hit points only, unlocked merely by
 * leaving the irradiated zone. The locked amount rides on
 * `resources.hp.locked` / `resources.sp.locked`, which cap what any healing
 * can restore, and clears the moment the last level goes.
 *
 * The book prints "1d4 radiation damage to your hit points and stamina
 * points": one roll charged to both pools, which is how it is read here.
 */

interface RadiationResult {
  levelsGained: number;
  rads: number;
  damagePerLevel: number[];
  hpLost: number;
  spLost: number;
  died: boolean;
}

/**
 * Take levels of Rads, with their damage and its healing lock.
 * Death comes either from the damage reaching 0 hit points or from reaching
 * the tenth level; the survivor's Luck check is left to rollGhoulification().
 */
export async function gainRadiationLevels(
  actor: FoundryActor,
  system: CharacterData,
  levels = 1,
): Promise<RadiationResult> {
  const before = system.conditions.rads;
  const rads = Math.min(LETHAL_CONDITION_LEVEL, before + levels);
  const gained = rads - before;

  const damagePerLevel: number[] = [];
  let total = 0;
  for (let i = 0; i < gained; i++) {
    const roll = new foundry.dice.Roll(RADIATION_DAMAGE);
    await roll.evaluate();
    damagePerLevel.push(roll.total);
    total += roll.total;
  }

  const hp = Math.max(0, system.resources.hp.value - total);
  const sp = Math.max(0, system.resources.sp.value - total);
  const hpLost = system.resources.hp.value - hp;
  const spLost = system.resources.sp.value - sp;

  // Lock only what was actually dealt, and never more than the pool holds.
  const lockedHp = Math.min(system.derived.hpMax, system.resources.hp.locked + total);
  const lockedSp = Math.min(system.derived.spMax, system.resources.sp.locked + total);
  const died = hp === 0 || rads >= LETHAL_CONDITION_LEVEL;

  await actor.update({
    "system.conditions.rads": rads,
    "system.resources.hp.value": hp,
    "system.resources.sp.value": sp,
    "system.resources.hp.locked": lockedHp,
    "system.resources.sp.locked": lockedSp,
  });

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: game.i18n.localize("FALLOUT.Radiation.gained", {
      levels: gained,
      rads,
      damage: total,
      rolls: damagePerLevel.join(", "),
    }),
  });

  if (died) {
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: game.i18n.localize(
        rads >= LETHAL_CONDITION_LEVEL
          ? "FALLOUT.Radiation.deathByLevels"
          : "FALLOUT.Radiation.deathByDamage",
        { dc: RADIATION_REVIVAL_DC },
      ),
    });
  }

  return { levelsGained: gained, rads, damagePerLevel, hpLost, spLost, died };
}

/**
 * Remove levels of Rads (RadAway, and the like). Clearing the last level
 * releases the locked damage and resets the escalated Radiation DC.
 */
export async function removeRadiationLevels(
  actor: FoundryActor,
  system: CharacterData,
  levels = 1,
): Promise<number> {
  const rads = Math.max(0, system.conditions.rads - levels);
  const updates: Record<string, unknown> = { "system.conditions.rads": rads };
  if (rads === 0) {
    updates["system.resources.hp.locked"] = 0;
    updates["system.resources.sp.locked"] = 0;
    updates["system.radiation.dcBonus"] = 0;
  }
  await actor.update(updates);
  return rads;
}

/**
 * The check on entering or starting a turn in an irradiated zone (pg 124).
 * Failure costs a level of Rads; success raises the DC by 2 until they clear.
 */
export async function rollRadiationCheck(
  actor: FoundryActor,
  system: CharacterData,
): Promise<boolean> {
  if (system.derived.radiationDC === null) {
    ui.notifications.info(game.i18n.localize("FALLOUT.Radiation.immune"));
    return true;
  }
  const dc = system.derived.radiationDC;
  const roll = new foundry.dice.Roll("1d20");
  await roll.evaluate();
  const passed = roll.total >= dc;

  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.localize(
      passed ? "FALLOUT.Radiation.checkPassed" : "FALLOUT.Radiation.checkFailed",
      { dc },
    ),
  });

  if (passed) {
    await actor.update({
      "system.radiation.dcBonus": system.radiation.dcBonus + RADIATION_DC_ESCALATION,
    });
  } else {
    await gainRadiationLevels(actor, system, 1);
  }
  return passed;
}

/**
 * After radiation kills you: a Luck check against DC 20 returns you as a ghoul
 * with 1 hit point; rolling below 5 returns you feral, under the GM's control
 * (pg 124). The book prints no outcome between those, which v2.0 also left
 * blank — treated here as staying dead.
 */
export async function rollGhoulification(
  actor: FoundryActor,
  system: CharacterData,
): Promise<void> {
  const roll = new foundry.dice.Roll(`1d20 + ${String(system.derived.abilityMods.luck)}`);
  await roll.evaluate();
  const raw = roll.dice[0]?.results.find((r) => r.active)?.result ?? 0;

  let outcome: string;
  if (raw < RADIATION_FERAL_ROLL) {
    outcome = "FALLOUT.Radiation.feral";
  } else if (roll.total >= RADIATION_REVIVAL_DC) {
    outcome = "FALLOUT.Radiation.ghoul";
    await actor.update({ "system.resources.hp.value": 1, "system.details.race": "ghoul" });
  } else {
    outcome = "FALLOUT.Radiation.stayDead";
  }

  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${game.i18n.localize("FALLOUT.Radiation.revivalFlavor", {
      dc: RADIATION_REVIVAL_DC,
    })} — ${game.i18n.localize(outcome)}`,
  });
}
