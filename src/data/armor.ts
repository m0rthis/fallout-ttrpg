import { ARMOR_TYPES, BASE_AC } from "../rules/constants";
import {
  clampRank,
  LEGACY_RANK_UPGRADE,
  NESTED_UPGRADE_KEYS,
  POWER_ARMOR_UPGRADES,
  type PowerArmorUpgrade,
} from "../rules/power-armor";

/**
 * Armor (pg 55): AC, DT, upgrade slots, load, STR requirement, decay.
 * Worn armor halves its own load; unmet STR requirement inflicts Slowed.
 *
 * Power Armor (pg 57-58) is the same document type with `isPowerArmor` set. It
 * brings a Defense Point pool that soaks damage ahead of stamina and hit
 * points, a per-suit repair DC, and a Fusion Core runtime in minutes. DP is
 * deliberately NOT modelled as DT: it is an ablative pool, not a per-hit
 * reduction, and it is untouched by ability scores.
 */
export class ArmorData extends foundry.abstract.TypeDataModel {
  declare armorType: (typeof ARMOR_TYPES)[number];
  declare ac: number;
  declare dt: number;
  declare slots: number;
  declare upgrades: string;
  declare load: number;
  declare strengthReq: number;
  declare decay: number;
  declare equipped: boolean;
  declare repairBonus: number;
  declare cost: number;
  declare description: string;
  declare isPowerArmor: boolean;
  declare defensePoints: number;
  declare defensePointsValue: number;
  declare repairDC: number;
  declare fusionCoreMinutes: number;
  declare fusionCoreCapacity: number;
  declare decayMax: number;
  declare overheated: boolean;
  declare ceased: boolean;
  declare coreDamage: number;
  declare coreAssemblyRank: number;
  // Partial because Core Assembly is deliberately absent from this object —
  // see `LEGACY_RANK_UPGRADE`.
  declare upgradeRanks: Partial<Record<PowerArmorUpgrade, number>>;
  declare teslaCoilsActive: boolean;
  declare decayLastTurn: number;

  static override defineSchema(): Record<string, unknown> {
    const f = foundry.data.fields;
    return {
      armorType: new f.StringField({ required: true, initial: "cloth", choices: ARMOR_TYPES }),
      ac: new f.NumberField({ required: true, integer: true, initial: BASE_AC, min: 0 }),
      dt: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      slots: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      upgrades: new f.StringField({ required: true, initial: "" }),
      load: new f.NumberField({ required: true, initial: 0, min: 0 }),
      strengthReq: new f.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      decay: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      equipped: new f.BooleanField({ required: true, initial: false }),
      // Ordinary armor repairs against 10 + this (pg 93-94). Power Armor uses
      // the flat repairDC below instead — the book prints the two columns in
      // different formats, "+3" against "DC 23".
      repairBonus: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      cost: new f.NumberField({ required: true, initial: 0, min: 0 }),
      description: new f.HTMLField({ required: true, initial: "" }),

      // ------------------------------------------------------ Power Armor
      isPowerArmor: new f.BooleanField({ required: true, initial: false }),
      // The suit's full Defense Point pool (pg 58).
      defensePoints: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // Remaining DP. A suit keeps this when its wearer steps out, and the
      // next occupant inherits it (pg 57), so it persists on the item.
      defensePointsValue: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // Power Armor repairs against a per-suit Crafting DC (pg 58).
      repairDC: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // Allotted time left, in minutes. The book prints it per suit *model* in
      // hours (pg 58) but every drain it names is in minutes, so minutes wins.
      // Whether remaining time belongs to the core or the suit is one of the
      // book's open questions; it is stored on the suit, matching the table.
      fusionCoreMinutes: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // What a fresh core restores this model to (pg 58 table).
      fusionCoreCapacity: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // Power Armor caps at ten levels of decay, with its own consequences.
      decayMax: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // The pg 58 armor state — NOT the leveled Overheating condition (pg 134),
      // which is a different rule that happens to share the name.
      overheated: new f.BooleanField({ required: true, initial: false }),
      // The allotted time and its one-minute reserve are both gone: the suit
      // has opened up, let its user out, and stopped (pg 58).
      ceased: new f.BooleanField({ required: true, initial: false }),
      // Damage accumulated by Fusion Core targeted attacks, which overheat the
      // suit every 30 (pg 58).
      coreDamage: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // Core Assembly (pg 59) raises the overheat threshold and, at rank 3,
      // halves the cooling cost. Free-text `upgrades` cannot be parsed reliably,
      // so the one upgrade with a mechanical hook gets a field.
      coreAssemblyRank: new f.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 3 }),
      // The other eighteen upgrades of the pg 59 table. Free-text `upgrades`
      // above stays exactly as it was — a GM's notes — because it cannot be
      // parsed reliably, which is what drove Core Assembly into a field of its
      // own in the first place. These are ranks, 0 meaning "not installed", and
      // every one is purely additive: DataModel fills the defaults, so a world
      // saved before this release loads with every rank at 0.
      upgradeRanks: new f.SchemaField(
        Object.fromEntries(
          NESTED_UPGRADE_KEYS.map((key) => [
            key,
            new f.NumberField({
              required: true,
              integer: true,
              initial: 0,
              min: 0,
              max: POWER_ARMOR_UPGRADES[key].maxRank,
            }),
          ]),
        ),
      ),
      // Tesla Coils are a toggle: 3 AP to switch on or off, and every round
      // they stay on costs allotted time (pg 59).
      teslaCoilsActive: new f.BooleanField({ required: true, initial: false }),
      // The decay the suit had at the wearer's last turn, which is the only way
      // to answer Kinetic dynamo's "each level of decay the power armor gained
      // since your last turn" (pg 59).
      decayLastTurn: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
    };
  }

  /**
   * The rank of one pg 59 upgrade, clamped to the ranks the table prints.
   *
   * Core Assembly answers from its own legacy field; everything else from
   * `upgradeRanks`. One accessor so no caller has to know that.
   */
  upgradeRank(key: PowerArmorUpgrade): number {
    const stored =
      key === LEGACY_RANK_UPGRADE ? this.coreAssemblyRank : (this.upgradeRanks[key] ?? 0);
    return clampRank(stored, key);
  }

  /** Whether the suit carries the Super Mutant Fitting (pg 59). */
  get superMutantFitted(): boolean {
    return this.upgradeRank("superMutantFitting") > 0;
  }

  /**
   * Power Armor imposes no load while worn (pg 58) — zero, not halved like
   * ordinary armor, because "its interior chassis supports its user entirely".
   */
  get effectiveLoad(): number {
    return this.isPowerArmor && this.equipped ? 0 : this.load;
  }

  /**
   * Decay costs ordinary armor 1 AC and 1 DT per two levels (pg 92). Power
   * Armor is exempt: "levels of decay do not apply any negative effects to the
   * armor or user (besides a loss in defense points)" (pg 57).
   */
  get decayPenalty(): number {
    return this.isPowerArmor ? 0 : Math.floor(this.decay / 2);
  }

  /**
   * Power Armor never breaks. Pg 57 says so outright, which orphans the pg 92
   * broken-item rule and the pg 93 repair-a-broken-item rule for suits.
   */
  get isBroken(): boolean {
    return !this.isPowerArmor && this.decay >= 10;
  }
}
