/**
 * Power Armor operation (pg 57-59).
 *
 * Rules and their citations are in `src/rules/power-armor.ts`; the full
 * extraction with 23 catalogued contradictions is in
 * `packs-src/V21-NOTES-power-armor.md`. This file is the document-writing half.
 *
 * Three things here are announced rather than enforced, because the book does
 * not define them and inventing a definition would be inventing a rule:
 *
 * - **The baseline drain rate.** Only the total allotted time and four named
 *   extra drains are printed. `drainAllottedTime` is the GM's control for
 *   everything else.
 * - **Overriding the automatic cooling.** The consequence — a 20d10 explosion
 *   that destroys the suit, incinerates its wearer, and leaves a Level 5
 *   Irradiated Zone — is fully printed, so it is offered and reported, but the
 *   book never says whether an *attacker*-triggered overheat also hands the
 *   operator that choice.
 * - **The dead-core override.** "you cannot escape unless your Strength score
 *   is equal to 20" is unreachable: scores cap at 10 and the suit sets you to
 *   12. Reported as printed rather than quietly lowered.
 */

import type { CharacterData } from "../data/character";
import { apLine } from "../combat/action-points";
import type { ArmorData } from "../data/armor";
import {
  addChange,
  advantageChange,
  bonusPath,
  type EffectChange,
  SYSTEM_ID,
} from "../rules/effects";
import {
  allottedMinutesFor,
  belowHalfHitPoints,
  calibratedShocksLoad,
  CORE_EXPLOSION_DAMAGE,
  CORE_EXPLOSION_LONG_FEET,
  CORE_EXPLOSION_SHORT_FEET,
  CORE_EXPLOSION_ZONE_LEVEL,
  CORE_SWAP_AP,
  CORE_TARGET_DAMAGE_THRESHOLD,
  drainCore,
  EMERGENCY_PROTOCOLS_DT,
  EMERGENCY_PROTOCOLS_DT_RANK,
  ENTER_EXIT_AP,
  EXPLOSIVE_VENT_DAMAGE_TYPES,
  EXPLOSIVE_VENT_DRAIN_MINUTES,
  EXPLOSIVE_VENT_FALL_FEET,
  explosiveVentDamage,
  explosiveVentRadius,
  INTERNAL_DATABASE_AP,
  type InternalDatabaseStat,
  jetPackApCost,
  jetPackDrainMinutes,
  kineticDynamoAP,
  LONGER_STRIDES_FEET,
  OPTIMIZED_BRACERS_AP,
  OPTIMIZED_BRACERS_TYPE,
  optimizedBracersDamage,
  OVERCLOCK_AP_BONUS,
  OVERCLOCK_MOVE_AP,
  OVERCLOCK_MOVE_FEET,
  OVERCLOCK_OVERHEAT_AP,
  OVERCLOCK_UNARMED_DAMAGE,
  OVERHEAT_EJECT_MINUTES,
  OVERRIDE_ESCAPE_STRENGTH,
  overheatDrainMinutes,
  overheatThreshold,
  POWER_ARMOR_SIZE,
  powerArmorEntry,
  REACTIVE_PLATES_KNOCKBACK_FEET,
  reactivePlatesKnocksBack,
  reactivePlatesReflected,
  sensorArraySense,
  shieldingReduction,
  sprintFeet,
  TESLA_ACTIVATE_AP,
  TESLA_DAMAGE_TYPE,
  TESLA_RADIUS_FEET,
  teslaCoilDamage,
  teslaCoilDrain,
  vatsTargetedApCost,
} from "../rules/power-armor";

/** The equipped Power Armor suit, ceased or not. */
export function powerArmorItem(actor: FoundryActor): FoundryItem | undefined {
  return (actor.itemTypes.armor ?? []).find((item) => {
    const armor = item.system as ArmorData;
    return armor.isPowerArmor && armor.equipped;
  });
}

async function say(actor: FoundryActor, lines: string[]): Promise<void> {
  const content = lines.filter(Boolean).join("<br />");
  if (!content) return;
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content,
  });
}

/**
 * Step into or out of a suit: 6 AP either way (pg 57).
 *
 * Defense Points deliberately stay on the item. "If any creature enters the
 * armor, they gain defense points equal to the amount that previous user had
 * when they exited" (pg 57) — so a depleted suit stays depleted for whoever
 * climbs in next, which falls out of storing the pool on the armor rather than
 * on the character.
 */
export async function togglePowerArmor(
  actor: FoundryActor,
  item: FoundryItem,
): Promise<boolean> {
  const armor = item.system as ArmorData;
  const entering = !armor.equipped;

  if (entering && armor.ceased) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.PowerArmor.ceasedEntry"));
    return false;
  }

  // Race gating (pg 9, 11, 59). Checked only on the way *in*: a Super Mutant who
  // is somehow already in a suit whose Fitting was just removed should be able
  // to climb out of it.
  if (entering) {
    const race = (actor.system as CharacterData).details.race;
    const gate = powerArmorEntry(race, armor.superMutantFitted);
    if (gate !== "ok") {
      ui.notifications.warn(game.i18n.localize(`FALLOUT.PowerArmor.entry.${gate}`));
      return false;
    }
  }

  // A suit that has never been given a capacity gets its model's allotted time
  // the first time someone wears it, so a compendium suit works out of the box.
  const updates: Record<string, unknown> = { "system.equipped": entering };
  if (entering && armor.fusionCoreCapacity === 0) {
    const minutes = allottedMinutesFor(item.name);
    if (minutes !== null) {
      updates["system.fusionCoreCapacity"] = minutes;
      if (armor.fusionCoreMinutes === 0) updates["system.fusionCoreMinutes"] = minutes;
    }
  }
  // Tesla Coils cannot keep running in an empty suit, and leaving the toggle on
  // would charge the next wearer for a round they did not spend (pg 59).
  if (!entering) updates["system.teslaCoilsActive"] = false;
  await item.update(updates);

  // The suit's flat upgrade bonuses are Active Effects, so entering and leaving
  // has to switch them over. This is a button a person pressed, not a hook.
  await syncPowerArmorEffects(actor, item);

  const suit = item.system as ArmorData;
  await say(actor, [
    game.i18n.localize(entering ? "FALLOUT.PowerArmor.entered" : "FALLOUT.PowerArmor.exited", {
      suit: item.name,
      ap: ENTER_EXIT_AP,
      dp: suit.defensePointsValue,
    }),
    ...(await apLine(actor, ENTER_EXIT_AP)),
    // The always-on pg 57 abilities that no field can express. Longer Strides
    // is arithmetic nothing in this system performs (there is no movement
    // budget to add 20 feet to), and size Large has no consumer here at all —
    // the rules that read a creature's size are the grapple rules (pg 63) and
    // Help (pg 126), neither of which tracks one.
    entering
      ? game.i18n.localize("FALLOUT.PowerArmor.suitTraits", {
          sprint: sprintFeet(true),
          strides: LONGER_STRIDES_FEET,
          size: POWER_ARMOR_SIZE,
        })
      : "",
  ]);
  return true;
}

/** Slot a fresh Fusion Core: 5 AP, and the suit comes back to life (pg 58). */
export async function swapFusionCore(actor: FoundryActor, item: FoundryItem): Promise<void> {
  const armor = item.system as ArmorData;
  // A capacity of 0 means nobody has set one, so fall back to the model table.
  const capacity =
    armor.fusionCoreCapacity > 0
      ? armor.fusionCoreCapacity
      : (allottedMinutesFor(item.name) ?? 0);
  await item.update({
    "system.fusionCoreCapacity": capacity,
    "system.fusionCoreMinutes": capacity,
    "system.ceased": false,
    "system.overheated": false,
  });
  await say(actor, [
    game.i18n.localize("FALLOUT.PowerArmor.coreSwapped", {
      suit: item.name,
      ap: CORE_SWAP_AP,
      minutes: capacity,
    }),
    ...(await apLine(actor, CORE_SWAP_AP)),
    // The book never actually says a fresh core revives a suit that has ceased
    // function — it only says replacing one costs 5 AP. Restarting is the only
    // reading under which the 5 AP action means anything.
    armor.ceased ? game.i18n.localize("FALLOUT.PowerArmor.restarted") : "",
  ]);
  // A restarted suit's upgrades come back with it.
  await syncPowerArmorEffects(actor, item);
}

export interface DrainReport {
  minutes: number;
  onReserve: boolean;
  ceased: boolean;
  /** The suit shut down as a result of this drain, ejecting its wearer. */
  ejected: boolean;
}

/**
 * Spend allotted time and stage the pg 58 shutdown.
 *
 * `reason` is a localization key suffix under `FALLOUT.PowerArmor.drain.*`, so
 * the chat card says which printed drain fired — the book names four (cooling,
 * Tesla Coils, Jet Pack, Explosive vent) and leaves the baseline undefined.
 */
export async function drainAllottedTime(
  actor: FoundryActor,
  item: FoundryItem,
  minutes: number,
  reason: string,
): Promise<DrainReport> {
  const armor = item.system as ArmorData;
  const result = drainCore(armor.fusionCoreMinutes, minutes);
  const ejected = result.ceased && !armor.ceased;

  await item.update({
    "system.fusionCoreMinutes": result.minutes,
    ...(ejected ? { "system.ceased": true, "system.equipped": false, "system.overheated": false } : {}),
  });

  await say(actor, [
    game.i18n.localize("FALLOUT.PowerArmor.drained", {
      suit: item.name,
      minutes: Math.max(0, minutes),
      left: result.minutes,
      reason: game.i18n.localize(`FALLOUT.PowerArmor.drain.${reason}`),
    }),
    result.onReserve ? game.i18n.localize("FALLOUT.PowerArmor.reserve") : "",
    ejected ? game.i18n.localize("FALLOUT.PowerArmor.ceased") : "",
    ejected
      ? game.i18n.localize("FALLOUT.PowerArmor.overrideOffer", {
          strength: OVERRIDE_ESCAPE_STRENGTH,
        })
      : "",
  ]);
  return { ...result, ejected };
}

export interface OverheatReport {
  /** The suit was already overheated, or just became so. */
  overheated: boolean;
  /** Allotted time this cooling cycle cost. */
  drained: number;
  /** The suit was at or below 30 minutes and shut down instead (pg 58). */
  ejected: boolean;
}

/**
 * Overheat a suit and charge it a cooling cycle (pg 58).
 *
 * "If a fusion core only has 30 minutes of its allotted time, and becomes
 * overheated, the Power Armor ejects the user and ceases function" — printed as
 * an equality, read here as thirty-or-fewer, because a core with ten minutes
 * left is covered by no other sentence and the general rule would take it
 * negative.
 */
export async function overheat(
  actor: FoundryActor,
  item: FoundryItem,
  cause: string,
): Promise<OverheatReport> {
  const armor = item.system as ArmorData;

  if (armor.fusionCoreMinutes <= OVERHEAT_EJECT_MINUTES) {
    await item.update({
      "system.fusionCoreMinutes": 0,
      "system.ceased": true,
      "system.equipped": false,
      "system.overheated": false,
      // A stopped suit is not running its coils either.
      "system.teslaCoilsActive": false,
    });
    await syncPowerArmorEffects(actor, item);
    await say(actor, [
      game.i18n.localize("FALLOUT.PowerArmor.overheated", {
        suit: item.name,
        cause: game.i18n.localize(`FALLOUT.PowerArmor.cause.${cause}`),
      }),
      game.i18n.localize("FALLOUT.PowerArmor.overheatEject", {
        minutes: OVERHEAT_EJECT_MINUTES,
      }),
    ]);
    return { overheated: false, drained: 0, ejected: true };
  }

  const drain = overheatDrainMinutes(armor.coreAssemblyRank);
  if (!armor.overheated) await item.update({ "system.overheated": true });
  await say(actor, [
    game.i18n.localize("FALLOUT.PowerArmor.overheated", {
      suit: item.name,
      cause: game.i18n.localize(`FALLOUT.PowerArmor.cause.${cause}`),
    }),
    // The override is fully printed, so it is offered — but only as text. It
    // destroys the suit and kills its wearer, which is not something a button
    // should do without a person deciding it.
    game.i18n.localize("FALLOUT.PowerArmor.coolingOverride", {
      damage: CORE_EXPLOSION_DAMAGE,
      short: CORE_EXPLOSION_SHORT_FEET,
      long: CORE_EXPLOSION_LONG_FEET,
      level: CORE_EXPLOSION_ZONE_LEVEL,
    }),
  ]);

  const report = await drainAllottedTime(actor, item, drain, "cooling");
  // Overclock Hydraulics rank 1 turns on with the overheat (pg 59), so the
  // effect that carries it has to follow the state.
  await syncPowerArmorEffects(actor, item);
  return { overheated: true, drained: drain, ejected: report.ejected };
}

/**
 * Check a finished turn against the overheat threshold (pg 58).
 *
 * Called from the combat turn hook with the AP the turn actually spent. The
 * threshold is 15 by default, which is exactly the base AP maximum
 * (10 + a capped +5 Agility modifier), so a suit can only overheat on recycled
 * AP or a perk — the trigger is unreachable by ordinary means, and that appears
 * to be deliberate.
 */
export async function checkTurnOverheat(
  actor: FoundryActor,
  apSpent: number,
): Promise<OverheatReport | null> {
  const item = powerArmorItem(actor);
  if (!item) return null;
  const armor = item.system as ArmorData;
  if (armor.ceased) return null;
  if (apSpent <= overheatThreshold(armor.coreAssemblyRank)) return null;
  return overheat(actor, item, "actionPoints");
}

/**
 * Start of turn: a still-overheated suit pays for cooling again (pg 58).
 *
 * Kept as the name the combat turn hook already imports. It now delegates to
 * `powerArmorTurnStart`, which does the cooling plus the three other things a
 * suit does at the start of a turn (Kinetic dynamo's AP, the Tesla Coils' round
 * of drain, and the conditional-effect sync) — none of which existed when the
 * hook was wired, and all of which want the same moment.
 */
export async function coolAtTurnStart(actor: FoundryActor): Promise<OverheatReport | null> {
  return (await powerArmorTurnStart(actor)).overheat;
}

/** End of the wearer's next turn clears it (pg 58). */
export async function clearOverheat(actor: FoundryActor): Promise<void> {
  const item = powerArmorItem(actor);
  if (!item) return;
  if (!(item.system as ArmorData).overheated) return;
  await item.update({ "system.overheated": false });
  // Overclock Hydraulics rank 1 lapses with the overheat it rides on (pg 59).
  await syncPowerArmorEffects(actor, item);
}

export interface CoreTargetReport {
  /** Running total of damage the core has absorbed. */
  total: number;
  /** Whether this hit crossed a 30-damage threshold and overheated the suit. */
  triggered: boolean;
}

/**
 * A Fusion Core targeted attack landing (pg 58).
 *
 * The attack "deals no damage to the armor or its operator and applies no
 * condition", yet the core "has taken at least 30 damage" — the book tracks
 * damage the attack explicitly does not deal. What is counted (rolled damage?
 * before or after DT?), whether 30 is cumulative or per hit, and whether the
 * counter resets are all undefined. This counts rolled damage cumulatively and
 * treats 30 as a repeating threshold, which is the only reading that makes
 * "each time" mean anything, and says so on the card.
 */
export async function damageFusionCore(
  actor: FoundryActor,
  item: FoundryItem,
  damage: number,
): Promise<CoreTargetReport> {
  const armor = item.system as ArmorData;
  const before = armor.coreDamage;
  const total = Math.max(0, before + Math.max(0, Math.floor(damage)));
  const crossed =
    Math.floor(total / CORE_TARGET_DAMAGE_THRESHOLD) >
    Math.floor(before / CORE_TARGET_DAMAGE_THRESHOLD);

  await item.update({ "system.coreDamage": total });
  await say(actor, [
    game.i18n.localize("FALLOUT.PowerArmor.coreHit", {
      suit: item.name,
      damage: total - before,
      total,
      threshold: CORE_TARGET_DAMAGE_THRESHOLD,
    }),
  ]);

  if (crossed) await overheat(actor, item, "coreTargeted");
  return { total, triggered: crossed };
}

/** Whether the wearer's suit can still refill its Defense Points (pg 57). */
export function suitRefills(system: CharacterData): boolean {
  return system.derived.powerArmor?.refillsDefensePoints ?? true;
}

// ===========================================================================
// The pg 59 upgrades
// ===========================================================================

/**
 * Roll damage an upgrade deals and post it with the flag the GM's "Apply to
 * targets" button reads, so an upgrade's damage lands through the same pg 132
 * pipeline as a weapon's. Never melee, never a sneak attack, never Corrosive.
 */
async function rollUpgradeDamage(
  actor: FoundryActor,
  formula: string,
  damageType: string,
  flavor: string,
): Promise<number> {
  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor,
    flags: {
      [SYSTEM_ID]: {
        damage: { total: roll.total, type: damageType, melee: false, sneak: false, corrosive: false },
      },
    },
  });
  return roll.total;
}

/**
 * Spend allotted time for anything the book does not name.
 *
 * **The book prints no base drain rate** — only a total per suit model and four
 * named extra drains — so the passage of time is a control a person turns
 * rather than a clock this system runs. A suit that quietly drained itself
 * across a night's rest would destroy itself between sessions on a rule that
 * was never written.
 */
export async function spendAllottedTime(
  actor: FoundryActor,
  item: FoundryItem,
  minutes: number,
): Promise<DrainReport> {
  return drainAllottedTime(actor, item, minutes, "manual");
}

/**
 * Tesla Coils (pg 59): 3 AP to switch on or off.
 *
 * > each creature within 10 feet of you takes 1d6 electricity damage when you
 * > activate and at the start of their turns. For each round active, remove 10
 * > minutes from allotted time.
 *
 * Damage is rolled once here, on activation, with the Apply button attached;
 * the "at the start of their turns" half is every *other* creature's turn,
 * which this system does not iterate, so the card says so and the GM re-rolls.
 * The drain is charged on activation and again at each of the wearer's turn
 * starts while the coils are on — see the note on `TESLA_DRAIN_MINUTES` for why
 * that cadence and not another.
 */
export async function toggleTeslaCoils(
  actor: FoundryActor,
  item: FoundryItem,
): Promise<boolean | null> {
  const armor = item.system as ArmorData;
  const rank = armor.upgradeRank("teslaCoils");
  if (rank < 1) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.PowerArmor.noUpgrade", {
        upgrade: game.i18n.localize("FALLOUT.PowerArmor.upgrade.teslaCoils"),
      }),
    );
    return null;
  }
  if (armor.ceased) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.PowerArmor.ceasedControl"));
    return null;
  }

  const activating = !armor.teslaCoilsActive;
  await item.update({ "system.teslaCoilsActive": activating });
  await say(actor, [
    game.i18n.localize(
      activating ? "FALLOUT.PowerArmor.teslaOn" : "FALLOUT.PowerArmor.teslaOff",
      {
        ap: TESLA_ACTIVATE_AP,
        radius: TESLA_RADIUS_FEET,
        damage: teslaCoilDamage(rank),
        minutes: teslaCoilDrain(rank),
      },
    ),
    ...(await apLine(actor, TESLA_ACTIVATE_AP)),
  ]);

  if (!activating) return false;
  await rollUpgradeDamage(
    actor,
    teslaCoilDamage(rank),
    TESLA_DAMAGE_TYPE,
    game.i18n.localize("FALLOUT.PowerArmor.teslaDamage", { radius: TESLA_RADIUS_FEET }),
  );
  await drainAllottedTime(actor, item, teslaCoilDrain(rank), "teslaCoils");
  return true;
}

/**
 * Jet Pack (pg 59): 1 AP per 5 feet flown, 1 minute of allotted time per 10.
 *
 * AP is reported rather than deducted, like every action in this system
 * (roadmap item 14).
 */
export async function flyWithJetPack(
  actor: FoundryActor,
  item: FoundryItem,
  feet: number,
): Promise<DrainReport | null> {
  const armor = item.system as ArmorData;
  if (armor.upgradeRank("jetPack") < 1) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.PowerArmor.noUpgrade", {
        upgrade: game.i18n.localize("FALLOUT.PowerArmor.upgrade.jetPack"),
      }),
    );
    return null;
  }
  if (armor.ceased) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.PowerArmor.ceasedControl"));
    return null;
  }

  const distance = Math.max(0, Math.floor(feet));
  if (distance === 0) return null;
  await say(actor, [
    game.i18n.localize("FALLOUT.PowerArmor.jetPackFlight", {
      feet: distance,
      ap: jetPackApCost(distance),
    }),
    ...(await apLine(actor, jetPackApCost(distance))),
  ]);
  return drainAllottedTime(actor, item, jetPackDrainMinutes(distance), "jetPack");
}

/**
 * Explosive vent (pg 59): a landing after a fall of at least 15 feet.
 *
 * The fall itself is not modelled anywhere in this system, so the 15-foot
 * precondition is stated on the card rather than enforced — nothing here knows
 * how far a token dropped.
 */
export async function triggerExplosiveVent(
  actor: FoundryActor,
  item: FoundryItem,
): Promise<DrainReport | null> {
  const armor = item.system as ArmorData;
  const rank = armor.upgradeRank("explosiveVent");
  if (rank < 1) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.PowerArmor.noUpgrade", {
        upgrade: game.i18n.localize("FALLOUT.PowerArmor.upgrade.explosiveVent"),
      }),
    );
    return null;
  }
  if (armor.ceased) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.PowerArmor.ceasedControl"));
    return null;
  }

  const formula = explosiveVentDamage(rank);
  const radius = explosiveVentRadius(rank);
  await say(actor, [
    game.i18n.localize("FALLOUT.PowerArmor.ventFired", {
      fall: EXPLOSIVE_VENT_FALL_FEET,
      radius,
      damage: formula,
      minutes: EXPLOSIVE_VENT_DRAIN_MINUTES,
    }),
  ]);
  // Two damage types, so two rolls and two Apply buttons: a creature resistant
  // to fire is not thereby resistant to the explosion.
  for (const type of EXPLOSIVE_VENT_DAMAGE_TYPES) {
    await rollUpgradeDamage(
      actor,
      formula,
      type,
      game.i18n.localize("FALLOUT.PowerArmor.ventDamage", { radius }),
    );
  }
  return drainAllottedTime(actor, item, EXPLOSIVE_VENT_DRAIN_MINUTES, "explosiveVent");
}

/**
 * Overclock Hydraulics rank 2 (pg 59): "You can spend 3 AP to overheat the
 * fusion core."
 *
 * Deliberate self-harm, because rank 1 is a large buff *while overheated*. It
 * runs through the same `overheat` path as everything else, so it costs the
 * suit its cooling cycle — and on a core at 30 minutes or less it ejects the
 * wearer, which the book does not carve out for a voluntary overheat either.
 */
export async function overclockOverheat(
  actor: FoundryActor,
  item: FoundryItem,
): Promise<OverheatReport | null> {
  const armor = item.system as ArmorData;
  if (armor.upgradeRank("overclockHydraulics") < 2) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.PowerArmor.noUpgrade", {
        upgrade: game.i18n.localize("FALLOUT.PowerArmor.upgrade.overclockHydraulics"),
      }),
    );
    return null;
  }
  if (armor.ceased) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.PowerArmor.ceasedControl"));
    return null;
  }
  await say(actor, [
    game.i18n.localize("FALLOUT.PowerArmor.overclockSelf", { ap: OVERCLOCK_OVERHEAT_AP }),
    ...(await apLine(actor, OVERCLOCK_OVERHEAT_AP)),
  ]);
  return overheat(actor, item, "overclock");
}

/**
 * Optimized bracers (pg 59): 6 AP for a powerful unarmed attack.
 *
 * The attack roll is an ordinary unarmed attack, which the sheet already rolls;
 * what the upgrade changes is the damage, so that is what this rolls — with the
 * Apply button attached. Rank 3's 15-foot push is reported, because nothing in
 * this system moves tokens.
 */
export async function optimizedBracersStrike(
  actor: FoundryActor,
  item: FoundryItem,
): Promise<number | null> {
  const armor = item.system as ArmorData;
  const rank = armor.upgradeRank("optimizedBracers");
  if (rank < 1) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.PowerArmor.noUpgrade", {
        upgrade: game.i18n.localize("FALLOUT.PowerArmor.upgrade.optimizedBracers"),
      }),
    );
    return null;
  }
  const formula = optimizedBracersDamage(rank);
  await say(actor, [
    game.i18n.localize("FALLOUT.PowerArmor.bracers", {
      ap: OPTIMIZED_BRACERS_AP,
      damage: formula,
    }),
    rank >= 3 ? game.i18n.localize("FALLOUT.PowerArmor.bracersPush") : "",
    ...(await apLine(actor, OPTIMIZED_BRACERS_AP)),
  ]);
  return rollUpgradeDamage(
    actor,
    formula,
    OPTIMIZED_BRACERS_TYPE,
    game.i18n.localize("FALLOUT.PowerArmor.upgrade.optimizedBracers"),
  );
}

/**
 * Internal database (pg 59): 6 AP to learn a visible creature's HP total, SP
 * total, AC, or DT.
 *
 * Line of sight is the GM's call, so this reads whoever is targeted. The result
 * is whispered to nobody in particular — the book does not say the reading is
 * private, and this system has no whisper path — so it posts like any other
 * card.
 */
export async function queryInternalDatabase(
  actor: FoundryActor,
  item: FoundryItem,
  stat: InternalDatabaseStat,
): Promise<number | null> {
  const armor = item.system as ArmorData;
  if (armor.upgradeRank("internalDatabase") < 1) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.PowerArmor.noUpgrade", {
        upgrade: game.i18n.localize("FALLOUT.PowerArmor.upgrade.internalDatabase"),
      }),
    );
    return null;
  }
  const target = Array.from(game.user.targets)[0];
  if (!target?.actor) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Damage.noTargets"));
    return null;
  }

  const data = target.actor.system as CharacterData;
  const value =
    stat === "hp"
      ? data.derived.hpMax
      : stat === "sp"
        ? data.derived.spMax
        : stat === "ac"
          ? data.derived.ac
          : data.derived.dt;
  await say(actor, [
    game.i18n.localize("FALLOUT.PowerArmor.database", {
      ap: INTERNAL_DATABASE_AP,
      name: target.name,
      stat: game.i18n.localize(`FALLOUT.PowerArmor.stat.${stat}`),
      value,
    }),
    ...(await apLine(actor, INTERNAL_DATABASE_AP)),
  ]);
  return value;
}

// --------------------------------------------------------- Numbers elsewhere

export interface ShieldingReport {
  /** Damage after the suit's shielding (pg 59). */
  amount: number;
  /** How much the shielding stopped. */
  reduced: number;
}

/**
 * Explosive Shielding and Prism shielding (pg 59) against one incoming hit.
 *
 * This is the half of the rule that belongs to the damage pipeline, which is
 * not part of this subsystem — so the arithmetic lives here and the caller
 * applies it. The suit must be worn: a reduction is something armor does for
 * the person inside it.
 */
export function powerArmorShielding(
  actor: FoundryActor,
  amount: number,
  damageType: string,
): ShieldingReport {
  const item = powerArmorItem(actor);
  if (!item || !damageType) return { amount, reduced: 0 };
  const armor = item.system as ArmorData;
  if (armor.ceased) return { amount, reduced: 0 };
  const reduction = shieldingReduction(
    damageType,
    armor.upgradeRank("explosiveShielding"),
    armor.upgradeRank("prismShielding"),
  );
  const reduced = Math.min(Math.max(0, amount), reduction);
  return { amount: Math.max(0, amount - reduced), reduced };
}

export interface ReflectionReport {
  /** Damage the melee attacker takes back (pg 59). */
  damage: number;
  /** Rank 3 knocks them 15 feet instead of adding a third quarter. */
  knockback: number;
}

/**
 * Reactive Plates (pg 59) against one melee hit.
 *
 * Reported, not applied: the reflection needs the *attacker*, and damage in
 * this system is applied to whoever the GM has targeted, which by then is the
 * defender. The caller has both ends of the exchange; this only does the
 * arithmetic and the rank check.
 */
export function powerArmorReflection(actor: FoundryActor, damage: number): ReflectionReport {
  const item = powerArmorItem(actor);
  if (!item) return { damage: 0, knockback: 0 };
  const armor = item.system as ArmorData;
  const rank = armor.upgradeRank("reactivePlates");
  return {
    damage: reactivePlatesReflected(rank, damage),
    knockback: reactivePlatesKnocksBack(rank) ? REACTIVE_PLATES_KNOCKBACK_FEET : 0,
  };
}

/**
 * The additional AP a targeted attack costs this attacker, VATS matrix overlay
 * included (pg 58-59).
 *
 * The general targeted-attack table (pg 129) is applied in the attack roll,
 * which is not part of this subsystem; this is the same reduction expressed
 * against whatever surcharge the caller has, and the Fusion Core's +5 in
 * particular.
 */
export function targetedApWithVats(actor: FoundryActor, surcharge: number): number {
  const item = powerArmorItem(actor);
  if (!item) return surcharge;
  return vatsTargetedApCost(surcharge, (item.system as ArmorData).upgradeRank("vatsMatrix"));
}

// ------------------------------------------------------------ Active Effects

interface UpgradeEffectPlan {
  /** Stable id, stored in the effect's flag. */
  id: string;
  labelKey: string;
  rank: number;
  changes: EffectChange[];
  /** Whether the effect's changes should be applying right now. */
  active: boolean;
}

/**
 * Every flat, always-on upgrade bonus that a real bonus path already expresses.
 *
 * Nothing here needed a new bonus key: passive sense, carry load, maximum AP,
 * damage threshold and advantage on attack rolls all exist. An upgrade whose
 * effect has no path (damage reduction by type, an extra die of damage against
 * a marked creature) is deliberately absent — inventing a field for it would
 * make the sheet claim an automation that does not run.
 */
function upgradeEffectPlans(armor: ArmorData, system: CharacterData): UpgradeEffectPlan[] {
  const worn = armor.equipped && !armor.ceased;
  const plans: UpgradeEffectPlan[] = [];

  const sensor = armor.upgradeRank("sensorArray");
  if (sensor > 0) {
    plans.push({
      id: "sensorArray",
      labelKey: "FALLOUT.PowerArmor.upgrade.sensorArray",
      rank: sensor,
      changes: [addChange(bonusPath("passiveSense"), sensorArraySense(sensor))],
      active: worn,
    });
  }

  const shocks = armor.upgradeRank("calibratedShocks");
  if (shocks > 0) {
    plans.push({
      id: "calibratedShocks",
      labelKey: "FALLOUT.PowerArmor.upgrade.calibratedShocks",
      rank: shocks,
      changes: [addChange(bonusPath("carryLoad"), calibratedShocksLoad(shocks))],
      active: worn,
    });
  }

  // "If you start your turn with less than half your hit points, your DT
  // increases by 5 (only for damage against HP)" (pg 59). DT in this system is
  // already only subtracted from damage that reaches hit points.
  const emergency = armor.upgradeRank("emergencyProtocols");
  if (emergency >= EMERGENCY_PROTOCOLS_DT_RANK) {
    plans.push({
      id: "emergencyProtocols",
      labelKey: "FALLOUT.PowerArmor.upgrade.emergencyProtocols",
      rank: emergency,
      changes: [addChange(bonusPath("dt"), EMERGENCY_PROTOCOLS_DT)],
      active:
        worn &&
        belowHalfHitPoints(system.resources.hp.value, system.derived.hpMax),
    });
  }

  const overclock = armor.upgradeRank("overclockHydraulics");
  // Rank 3: "Your maximum AP increases by 2" — unconditional.
  if (overclock >= 3) {
    plans.push({
      id: "overclockHydraulics",
      labelKey: "FALLOUT.PowerArmor.upgrade.overclockHydraulics",
      rank: overclock,
      changes: [addChange(bonusPath("apMax"), OVERCLOCK_AP_BONUS)],
      active: worn,
    });
  }
  // Rank 1, while overheated: +2 maximum AP and advantage on all attack rolls.
  // Its other two halves — 15 feet of movement for 1 AP, and 3d6 fire on
  // unarmed attacks — have no field, and are reported when the suit overheats.
  if (overclock >= 1) {
    plans.push({
      id: "overclockOverheated",
      labelKey: "FALLOUT.PowerArmor.upgrade.overclockOverheated",
      rank: overclock,
      changes: [addChange(bonusPath("apMax"), OVERCLOCK_AP_BONUS), advantageChange("attack")],
      active: worn && armor.overheated,
    });
  }

  return plans;
}

function planFlag(effect: FoundryActiveEffect): string | null {
  const flag = effect.getFlag(SYSTEM_ID, "powerArmorUpgrade");
  return typeof flag === "string" ? flag : null;
}

/**
 * Bring a suit's upgrade effects into line with its ranks and its state.
 *
 * The effects live on the *item* with `transfer: true`, so they follow the suit
 * from actor to actor and revert cleanly when it is deleted. Conditional ones —
 * Emergency protocols' DT, Overclock Hydraulics' overheated buff — are toggled
 * through `disabled`, the same shape `syncSituations` uses, and for the same
 * reason: the derived pass cannot re-decide a change that has already been
 * applied in the `initial` phase.
 *
 * Called from every control that can change the answer (entering, exiting,
 * overheating, the start of a turn), and exported so a sheet button can force
 * it after a rank is edited by hand.
 */
export async function syncPowerArmorEffects(
  actor: FoundryActor,
  item: FoundryItem,
): Promise<number> {
  const armor = item.system as ArmorData;
  const plans = upgradeEffectPlans(armor, actor.system as CharacterData);
  const wanted = new Map(plans.map((plan) => [plan.id, plan]));

  const creates: object[] = [];
  const updates: object[] = [];
  const deletes: string[] = [];
  const seen = new Set<string>();

  for (const effect of item.effects) {
    const id = planFlag(effect);
    if (id === null) continue;
    const plan = wanted.get(id);
    if (!plan) {
      deletes.push(effect.id);
      continue;
    }
    seen.add(id);
    const rank = effect.getFlag(SYSTEM_ID, "powerArmorRank");
    // The rank is carried on the flag so a changed rank is detectable without
    // reading back the change array Foundry stores.
    if (rank === plan.rank && effect.disabled === !plan.active) continue;
    updates.push({
      _id: effect.id,
      disabled: !plan.active,
      system: { changes: plan.changes },
      flags: { [SYSTEM_ID]: { powerArmorUpgrade: plan.id, powerArmorRank: plan.rank } },
    });
  }

  for (const plan of plans) {
    if (seen.has(plan.id)) continue;
    creates.push({
      name: game.i18n.localize(plan.labelKey),
      img: item.img,
      type: "base",
      transfer: true,
      disabled: !plan.active,
      system: { changes: plan.changes },
      flags: { [SYSTEM_ID]: { powerArmorUpgrade: plan.id, powerArmorRank: plan.rank } },
    });
  }

  if (deletes.length > 0) await item.deleteEmbeddedDocuments("ActiveEffect", deletes);
  if (updates.length > 0) await item.updateEmbeddedDocuments("ActiveEffect", updates);
  if (creates.length > 0) await item.createEmbeddedDocuments("ActiveEffect", creates);
  return creates.length + updates.length + deletes.length;
}

// ------------------------------------------------------------ Start of turn

export interface SuitTurnStart {
  /** The cooling cycle a still-overheated suit paid for (pg 58). */
  overheat: OverheatReport | null;
  /** Action Points Kinetic dynamo handed back (pg 59). */
  kineticAP: number;
  /** Allotted time the Tesla Coils burned for the round (pg 59). */
  teslaDrain: DrainReport | null;
}

/**
 * Everything a worn suit does at the start of its wearer's turn.
 *
 * Order matters. Kinetic dynamo pays out first, against the decay the suit took
 * since the last turn; then the cooling cycle, which can eject the wearer and
 * stop the suit; then the Tesla Coils' round of drain, which the ejection must
 * not be charged for; then the effect sync, because both of the conditional
 * effects may have just changed.
 *
 * Kinetic dynamo raises `turnStart` alongside `value`. The overheat check at
 * the end of the turn measures what the turn spent as `turnStart - value`, so
 * granting AP without moving both would read as 2 AP unspent.
 */
export async function powerArmorTurnStart(actor: FoundryActor): Promise<SuitTurnStart> {
  const idle: SuitTurnStart = { overheat: null, kineticAP: 0, teslaDrain: null };
  const item = powerArmorItem(actor);
  if (!item) return idle;
  const armor = item.system as ArmorData;
  if (armor.ceased) return idle;

  // Kinetic dynamo (pg 59): 1 AP per level of decay taken since the last turn.
  const gained = Math.max(0, armor.decay - armor.decayLastTurn);
  const kineticAP = kineticDynamoAP(armor.upgradeRank("kineticDynamo"), gained);
  if (kineticAP > 0) {
    const resources = (actor.system as CharacterData).resources;
    await actor.update({
      "system.resources.ap.value": resources.ap.value + kineticAP,
      "system.resources.ap.turnStart": resources.ap.turnStart + kineticAP,
    });
    await say(actor, [
      game.i18n.localize("FALLOUT.PowerArmor.kineticDynamo", { ap: kineticAP, decay: gained }),
    ]);
  }
  if (armor.decay !== armor.decayLastTurn) {
    await item.update({ "system.decayLastTurn": armor.decay });
  }

  // A suit still overheated at the start of a turn pays for cooling again
  // (pg 58), which is the second of the two charges one overheat costs.
  const overheated = (item.system as ArmorData).overheated;
  const report = overheated ? await overheat(actor, item, "stillOverheated") : null;
  if (overheated) {
    const rank = (item.system as ArmorData).upgradeRank("overclockHydraulics");
    // Overclock Hydraulics rank 1's unmodellable halves, reported while they
    // are actually in force rather than buried in the item's text.
    if (rank >= 1) {
      await say(actor, [
        game.i18n.localize("FALLOUT.PowerArmor.overclockActive", {
          feet: OVERCLOCK_MOVE_FEET,
          ap: OVERCLOCK_MOVE_AP,
          damage: OVERCLOCK_UNARMED_DAMAGE,
        }),
      ]);
    }
  }

  // Tesla Coils: a round of being switched on (pg 59).
  const current = item.system as ArmorData;
  const teslaRank = current.upgradeRank("teslaCoils");
  const teslaDrain =
    current.teslaCoilsActive && !current.ceased && teslaRank > 0
      ? await drainAllottedTime(actor, item, teslaCoilDrain(teslaRank), "teslaCoils")
      : null;
  if (teslaDrain?.ceased === true) await item.update({ "system.teslaCoilsActive": false });

  await syncPowerArmorEffects(actor, item);
  return { overheat: report, kineticAP, teslaDrain };
}
