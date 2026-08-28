/**
 * Damage application pipeline (pg 131-132): Power Armor Defense Points soak
 * first, then Stamina Points (if the target is aware), then — reduced by DT —
 * Hit Points. Resistance halves, vulnerability doubles (before any of it).
 * Sneak attacks bypass SP entirely. Overflow past 0 HP inflicts severe
 * injuries; damage of 3× max HP in one hit is instant death.
 */

import { defenceList, type CharacterData } from "../data/character";
import type { ArmorData } from "../data/armor";
import { DECAY_MAX, deathSaveFailureLimit } from "../rules/constants";
import { POWER_ARMOR_DECAY_MAX, refillsDefensePoints } from "../rules/power-armor";
import { powerArmorReflection, powerArmorShielding } from "../actions/power-armor";
import { decayItem, extraDecayLevels } from "../actions/decay";

export interface DamageResult {
  /** Temporary hit points spent, ahead of everything else. */
  tempHpLost: number;
  /** Damage removed by Power Armor's Explosive or Prism Shielding (pg 59). */
  shieldingReduced: number;
  dpLost: number;
  spLost: number;
  hpLost: number;
  dtPrevented: number;
  adjusted: number;
  dying: boolean;
  severeInjury: boolean;
  instantDeath: boolean;
  /** The suit emptied its pool and refills, at the cost of a decay level. */
  powerArmorDepleted: boolean;
  /** Set when the target was already dying, so this damage cost a death save. */
  deathSaveFailures?: number;
  /** Corrosive (pg 69): the decay level the target's worn armor was raised to. */
  armorCorroded?: number;
  /** Corrosive against a target wearing no armor — see `applyDamage`. */
  corrosiveUnarmored?: boolean;
  /** Reactive Plates threw damage back at the melee attacker (pg 59). */
  reflected?: ReflectionResult;
}

/** What the defender's Reactive Plates did to whoever swung (pg 59). */
export interface ReflectionResult {
  /** The attacker's name, for the card. */
  attacker: string;
  /** Damage reflected — a quarter per rank, to a maximum of two (pg 59). */
  damage: number;
  /** Rank 3's 15-foot knockback, reported: nothing here moves tokens. */
  knockback: number;
  /**
   * What that damage did to the attacker, once it ran their own pipeline.
   * Absent when the reflection rounded to nothing and only the knockback landed.
   */
  result?: DamageResult;
}

/** The equipped Power Armor suit, if the actor is wearing one. */
function equippedPowerArmor(actor: FoundryActor): FoundryItem | undefined {
  return (actor.itemTypes.armor ?? []).find((item) => {
    const armor = item.system as ArmorData;
    return armor.equipped && armor.isPowerArmor;
  });
}

/** Whatever armor the actor is wearing, Power Armor or not. */
function equippedArmor(actor: FoundryActor): FoundryItem | undefined {
  return (actor.itemTypes.armor ?? []).find((item) => (item.system as ArmorData).equipped);
}

/**
 * Run the pg 131-132 pipeline against one creature.
 *
 * ## Why `attacker` is an option and not a parameter of the pipeline
 *
 * The pipeline is about the *defender*: every rule in it reads the defender's
 * pools, armor, thresholds and conditions. Exactly one printed rule needs the
 * other end of the exchange — Reactive Plates (pg 59), which throws a quarter
 * of a melee hit back at whoever landed it — and it is the defender's suit that
 * decides, not the attacker's sheet. So the attacker rides in as an option
 * rather than reshaping the signature: pass it and the reflection resolves,
 * omit it and nothing about the defender's side changes.
 *
 * The place that actually knows who swung is the GM's "Apply to targets" button
 * (`src/fallout.ts`), which reads the attacker off the damage card. Every other
 * caller of `applyDamage` is a hazard, a disease or an environment tick, none
 * of which has an attacker at all — which is the honest reason this could not
 * simply be threaded everywhere.
 */
export async function applyDamage(
  actor: FoundryActor,
  amount: number,
  damageType = "",
  options: {
    ignoreSP?: boolean;
    critical?: boolean;
    melee?: boolean;
    /** The attacking weapon had the v2.1 Corrosive property (pg 69). */
    corrosive?: boolean;
    /**
     * Whoever dealt this damage. Only ever consulted for Reactive Plates
     * (pg 59), which needs a melee attacker to reflect at; omit it and the
     * upgrade reports nothing, exactly as before.
     */
    attacker?: FoundryActor;
  } = {},
): Promise<DamageResult> {
  const system = actor.system as CharacterData;
  let adjusted = Math.max(0, Math.floor(amount));
  if (damageType) {
    // Both sides come off the derived lists, which run the stored strings (and
    // any trait's additions — a Robobrain's NeuroTransmitters, pg 11) through
    // the one normaliser in `character.ts`. The incoming type goes through the
    // same one, so a resistance and a vulnerability can never match a typed
    // string differently in the same if-block.
    const [incoming] = defenceList(damageType);
    if (incoming !== undefined) {
      if (system.derived.resistances.includes(incoming)) adjusted = Math.floor(adjusted / 2);
      if (system.derived.vulnerabilities.includes(incoming)) adjusted *= 2;
    }
  }

  // Explosive and Prism Shielding (pg 59) come off the top, before anything is
  // subtracted from a pool: they are printed as "reduce the damage taken",
  // which is a smaller hit rather than a soaked one. Floored at 0 inside the
  // helper, so a heavily shielded suit cannot turn a hit into healing.
  const shielded = powerArmorShielding(actor, adjusted, damageType);
  const shieldingReduced = shielded.reduced;
  adjusted = shielded.amount;

  const sp = system.resources.sp.value;
  const hp = system.resources.hp.value;
  const hpMax = system.derived.hpMax;

  // Temporary hit points are spent first and never come back — several perks
  // and the Anabolic chem property grant them. `adjusted` stays the incoming
  // total, so the instant-death threshold and the chat card still report the
  // hit that landed rather than what was left after the buffer.
  const tempHpLost = Math.min(system.resources.tempHp, adjusted);
  const afterTemp = adjusted - tempHpLost;

  // Power Armor's Defense Points absorb before anything else (pg 57). When the
  // pool empties the suit refills it and takes a level of decay.
  const suit = equippedPowerArmor(actor);
  let dpLost = 0;
  let powerArmorDepleted = false;
  let afterDP = afterTemp;
  if (suit) {
    const armor = suit.system as ArmorData;
    let pool = armor.defensePointsValue;
    let remaining = afterTemp;
    let decay = armor.decay;

    const firstBite = Math.min(pool, remaining);
    pool -= firstBite;
    remaining -= firstBite;
    dpLost = firstBite;

    // "When your defense points hit 0, the Power Armor gains a level of decay
    // and you regain defense points equal to its total. If the Power Armor has
    // 10 levels of decay, you no longer regain defense points" (pg 57).
    //
    // The book's worked example is explicit that the overflow lands in the
    // *refilled* pool rather than passing through to stamina: 15 DP, 20 damage
    // -> 0, +1 decay, back to 15, minus the leftover 5, for 10 DP. It only ever
    // shows one refill, so damage big enough to empty the pool a second time
    // spills through rather than decaying the suit twice — the book does not
    // say, and a loop here could decay a suit to ruin on a single hit.
    if (firstBite > 0 && pool === 0 && refillsDefensePoints(armor.decay)) {
      powerArmorDepleted = true;
      // Power Armor is armor, so Super Mutant Bulky (pg 12) adds its level here
      // too. Taken from the shared helper rather than the writing gate because
      // this decay rides along in the same `update()` as the Defense Point pool
      // a few lines below — see `extraDecayLevels` for why that distinction
      // exists.
      const levels = 1 + extraDecayLevels(actor, suit);
      decay = Math.min(armor.decayMax || POWER_ARMOR_DECAY_MAX, decay + levels);
      pool = armor.defensePoints;
      const secondBite = Math.min(pool, remaining);
      pool -= secondBite;
      remaining -= secondBite;
      dpLost += secondBite;
    }

    afterDP = remaining;
    if (firstBite > 0) {
      await suit.update({
        "system.defensePointsValue": pool,
        ...(decay === armor.decay ? {} : { "system.decay": decay }),
      });
    }
  }

  const spLost = options.ignoreSP ? 0 : Math.min(sp, afterDP);
  const remainder = afterDP - spLost;
  // A Block raises DT against melee attacks only (pg 127), so which threshold
  // applies depends on what the damage came from.
  const threshold = options.melee ? system.derived.dtMelee : system.derived.dt;
  let dtPrevented = 0;
  let hpLost = 0;
  if (remainder > 0) {
    // Floored at zero: a negative threshold (a sub −2 Endurance modifier turns
    // the block's `2 + END mod` negative) must not *amplify* damage.
    dtPrevented = Math.max(0, Math.min(remainder, threshold));
    hpLost = Math.max(0, remainder - dtPrevented);
  }

  // Corrosive (pg 69), v2.1's replacement for the deleted Corroded condition:
  //
  // > When you deal damage to a creature's hit points with a weapon that has
  // > this property, their armor gains one level of decay. If they have natural
  // > armor, their AC and DT decrease by 1 to a maximum of 3. […] Power Armor is
  // > unaffected by this condition.
  //
  // The first clause is decidable from sheet state, and this is the one place
  // that knows both halves of its trigger — the defender, and whether the
  // damage reached hit points — so it resolves here. Decaying the worn item is
  // the whole of the effect: the pg 92 penalty of 1 AC and 1 DT per two levels
  // already falls out of `ArmorData.decayPenalty`, and the item breaks at ten
  // like any other. `hpLost` rather than the clamped result: damage dealt to a
  // target already at 0 still reached their hit points.
  //
  // The natural-armor clause is *not* automated. Nothing in this system marks a
  // creature as having natural armor — an NPC's AC override is just as likely
  // to be a statblock's worn kit — and "to a maximum of 3" is a running total
  // per creature that no field holds. So an unarmored target gets a callout for
  // the GM instead of a silent edit to its AC.
  let armorCorroded: number | undefined;
  let corrosiveUnarmored = false;
  if (options.corrosive === true && hpLost > 0) {
    const worn = equippedArmor(actor);
    const wornData = worn?.system as ArmorData | undefined;
    if (!worn || !wornData) corrosiveUnarmored = true;
    // Power Armor is named as immune, and the suit is what the wearer has on,
    // so a suited target loses nothing here — not even to the natural-armor
    // branch.
    else if (!wornData.isPowerArmor) {
      // Through the shared gate, so the defender's own Bulky (pg 12) reaches
      // the armor Corrosive is eating. `actor` is the defender here, which is
      // whose race the rule asks about — the armor being decayed is theirs.
      const report = await decayItem(actor, worn, 1);
      armorCorroded = report?.decay ?? wornData.decay;
    }
  }

  const newHp = Math.max(0, hp - hpLost);
  const overflow = hpLost - hp;
  const result: DamageResult = {
    tempHpLost,
    shieldingReduced,
    dpLost,
    powerArmorDepleted,
    spLost,
    hpLost: hp - newHp,
    dtPrevented,
    adjusted,
    dying: newHp === 0 && hp > 0,
    severeInjury: newHp === 0 && overflow >= hpMax,
    instantDeath: adjusted >= 3 * hpMax,
    ...(armorCorroded === undefined ? {} : { armorCorroded }),
    ...(corrosiveUnarmored ? { corrosiveUnarmored } : {}),
  };

  const updates: Record<string, unknown> = {
    "system.resources.sp.value": sp - spLost,
    "system.resources.hp.value": newHp,
  };
  if (tempHpLost > 0) {
    updates["system.resources.tempHp"] = system.resources.tempHp - tempHpLost;
  }

  // Being damaged while already at 0 hit points is a failed death save, or
  // two if the hit was a critical (pg 132).
  if (hp === 0 && adjusted > 0) {
    const limit = deathSaveFailureLimit(system.details.race);
    const failures = Math.min(
      limit,
      system.resources.deathSaves.failures + (options.critical ? 2 : 1),
    );
    updates["system.resources.deathSaves.failures"] = failures;
    result.deathSaveFailures = failures;
  }

  await actor.update(updates);

  // Reactive Plates (pg 59): "When you take damage from a melee attack, the
  // attacker takes a quarter (rounded down) of the damage they dealt", a second
  // quarter at rank 2, and a 15-foot knockback at rank 3.
  //
  // Three things the table does not say, decided here and printed on the card:
  //
  // - **Which number is "the damage they dealt".** Read as the damage that left
  //   the attacker — the rolled total, before the defender's resistances,
  //   shielding, Defense Points and thresholds get their say. Those are all
  //   facts about the defender, and a suit that reflected less because its own
  //   armor worked would punish the armor. It also keeps the reflection
  //   readable at the table: a quarter of the number on the damage card.
  // - **Whether the reflection is itself damage.** It says the attacker "takes"
  //   it, so it runs their own pipeline — Defense Points, stamina, threshold and
  //   all. It carries **no damage type**, because the table names none, so no
  //   resistance or vulnerability applies to it.
  // - **Whether reflections bounce.** The reflected damage is not "damage from a
  //   melee attack" — it is the plates discharging — so it cannot trigger the
  //   attacker's own plates. Enforced structurally rather than by a flag: the
  //   nested call passes no `attacker`, so there is no second end for a
  //   reflection to reach and the recursion cannot start.
  const dealt = Math.max(0, Math.floor(amount));
  if (options.melee === true && options.attacker && dealt > 0) {
    const attacker = options.attacker;
    const reflection = powerArmorReflection(actor, dealt);
    if (reflection.damage > 0 || reflection.knockback > 0) {
      // A rank 3 suit reflecting a 3-damage hit knocks the attacker back and
      // deals nothing (a quarter of 3, rounded down, twice, is 0), so the
      // pipeline only runs when there is something to run it with.
      const back = reflection.damage > 0 ? await applyDamage(attacker, reflection.damage) : null;
      result.reflected = {
        attacker: attacker.name,
        damage: reflection.damage,
        knockback: reflection.knockback,
        ...(back === null ? {} : { result: back }),
      };
    }
  }
  return result;
}

/** Format an applied-damage result for chat. */
export function describeDamageResult(name: string, result: DamageResult): string {
  const parts = [
    game.i18n.localize("FALLOUT.Damage.applied", {
      name,
      total: result.adjusted,
      sp: result.spLost,
      hp: result.hpLost,
      dt: result.dtPrevented,
    }),
  ];
  if (result.tempHpLost > 0) {
    parts.push(game.i18n.localize("FALLOUT.Damage.tempHp", { temp: result.tempHpLost }));
  }
  if (result.shieldingReduced > 0) {
    parts.push(
      game.i18n.localize("FALLOUT.PowerArmor.shielded", { reduced: result.shieldingReduced }),
    );
  }
  if (result.dpLost > 0) {
    parts.push(
      game.i18n.localize(
        result.powerArmorDepleted ? "FALLOUT.Damage.dpDepleted" : "FALLOUT.Damage.dpAbsorbed",
        { dp: result.dpLost },
      ),
    );
  }
  if (result.armorCorroded !== undefined) {
    const key =
      result.armorCorroded >= DECAY_MAX
        ? "FALLOUT.Damage.corrodedBroken"
        : "FALLOUT.Damage.corroded";
    parts.push(game.i18n.localize(key, { decay: result.armorCorroded }));
  }
  if (result.corrosiveUnarmored === true) {
    parts.push(game.i18n.localize("FALLOUT.Damage.corrodedNatural"));
  }
  if (result.deathSaveFailures !== undefined) {
    parts.push(
      game.i18n.localize("FALLOUT.Damage.dyingHit", { failures: result.deathSaveFailures }),
    );
  }
  if (result.reflected) {
    const reflected = result.reflected;
    parts.push(
      game.i18n.localize(
        reflected.damage > 0
          ? "FALLOUT.PowerArmor.reflected"
          : "FALLOUT.PowerArmor.reflectedNothing",
        { attacker: reflected.attacker, damage: reflected.damage },
      ),
    );
    if (reflected.knockback > 0) {
      parts.push(
        game.i18n.localize("FALLOUT.PowerArmor.reflectedKnockback", {
          attacker: reflected.attacker,
          feet: reflected.knockback,
        }),
      );
    }
    // The reflection ran the attacker's own pipeline, so it can have done
    // anything a hit does — dropped them, cost them a death save, emptied their
    // own suit's pool. Said in full rather than as a bare number.
    if (reflected.result) {
      parts.push(describeDamageResult(reflected.attacker, reflected.result));
    }
  }
  if (result.instantDeath) parts.push(game.i18n.localize("FALLOUT.Damage.instantDeath"));
  else if (result.severeInjury) parts.push(game.i18n.localize("FALLOUT.Damage.severeInjury"));
  else if (result.dying) parts.push(game.i18n.localize("FALLOUT.Damage.dying"));
  return parts.join(" ");
}
