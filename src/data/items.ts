import {
  DAMAGE_TYPES,
  MELEE_WEAPON_TYPES,
  RANGED_WEAPON_TYPES,
  WEAPON_TYPE_SKILL,
  type SkillKey,
  type WeaponType,
} from "../rules/constants";
import {
  reloadCost,
  type WeaponKeywords,
  weaponKeywords,
} from "../rules/weapons";
import {
  MOD_CHOICES,
  MOD_CHOICE_KEYS,
  MOD_KEYS,
  applyMods,
  ceasesFunction,
  isModKey,
  silences,
  slotsUsed,
  type ModChoice,
  type ModKey,
  type ModdedWeaponStats,
} from "../rules/mods";
import { ADDICTION_DC } from "../rules/chems";

export { ArmorData } from "./armor";

const WEAPON_TYPES = [...MELEE_WEAPON_TYPES, ...RANGED_WEAPON_TYPES] as const;

/**
 * Weapon (pg 57+/63+): AP cost, damage dice, crit chance + crit damage,
 * range multipliers (× PER score, ranged only), ammo, STR requirement,
 * special properties, mods, decay.
 */
export class WeaponData extends foundry.abstract.TypeDataModel {
  declare weaponType: WeaponType;
  declare apCost: number;
  declare damage: string;
  declare damageType: string;
  declare critChance: number;
  declare crit: string;
  declare rangeNormal: number;
  declare rangeLong: number;
  declare ammoType: string;
  declare magazineSize: number;
  declare loadedAmmo: number;
  declare reloadCount: number;
  declare special: string;
  declare mods: string;
  declare attachedMods: Partial<Record<ModKey, boolean>>;
  declare modOptions: Partial<Record<ModKey, string>>;
  declare load: number;
  declare strengthReq: number;
  declare decay: number;
  declare cost: number;
  declare attackBonusOverride: number | null;
  declare equipped: boolean;
  declare oneHanded: boolean;
  declare autoMode: boolean;
  declare repairBonus: number;
  declare description: string;

  static override defineSchema(): Record<string, unknown> {
    const f = foundry.data.fields;
    return {
      weaponType: new f.StringField({ required: true, initial: "handgun", choices: WEAPON_TYPES }),
      apCost: new f.NumberField({ required: true, integer: true, initial: 4, min: 1 }),
      damage: new f.StringField({ required: true, initial: "1d6" }),
      damageType: new f.StringField({
        required: true,
        blank: true,
        initial: "ballistic",
        choices: DAMAGE_TYPES,
      }),
      // 0 is the "prints no critical hit" sentinel, not a crit on everything: the
      // four area-of-effect weapons (Flamer, Missile Launcher, Fat-Man, Cryolator)
      // ship an empty crit column. `min` was 2 — the floor a *printed* chance
      // stops falling to under mod stacking — which silently promoted those four
      // to critting on a 2 or better. `critThreshold` and `applyMods` both branch
      // on 0 before doing any arithmetic with it.
      critChance: new f.NumberField({ required: true, integer: true, initial: 20, min: 0, max: 20 }),
      crit: new f.StringField({ required: true, initial: "x2" }),
      // Range multipliers from the weapon table; feet = multiplier × PER score (pg 22).
      rangeNormal: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      rangeLong: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      ammoType: new f.StringField({ required: true, initial: "" }),
      magazineSize: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      loadedAmmo: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // Ranged weapons decay on every tenth reload (pg 63).
      reloadCount: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      special: new f.StringField({ required: true, initial: "" }),
      // Free text, and it stays free text: a GM's notes about this weapon's
      // modifications. Exactly the arrangement `ArmorData` reached for the pg 59
      // Power Armor upgrades — `upgrades` is a string nobody parses, and the
      // ranks that mean something live in their own validated field next to it.
      // Sniffing this string for the word "silencer" would be a guess dressed as
      // a rule, which is the reason `AttackOptions.silenced` had to be declared
      // at the call site before `attachedMods` existed.
      mods: new f.StringField({ required: true, initial: "" }),
      /**
       * The pg 65 and pg 75-77 modification tables, one boolean per printed row
       * (`src/rules/mods.ts`). Additive and false by default: `DataModel` fills
       * every key, so a weapon saved before this release loads and behaves
       * exactly as it did (backlog E2 — no migration).
       *
       * A closed set, unlike `GearData.junkType` below and for the opposite
       * reason. `JUNK_TYPES` is a *census* of material cells the book never
       * enumerated, so closing it would refuse a material the census missed;
       * these are two printed, closed, numbered tables, so closing the set turns
       * a typo into a validation error instead of a silently inert flag. Same
       * reasoning as `POWER_ARMOR_UPGRADES`, which is also closed. Homebrew has
       * two escape hatches that both still work: the free-text `mods` string
       * above, and the declared roll options in `AttackOptions`.
       */
      attachedMods: new f.SchemaField(
        Object.fromEntries(
          MOD_KEYS.map((key) => [key, new f.BooleanField({ required: true, initial: false })]),
        ),
      ),
      /**
       * The choice two mods make the player make, and nothing else.
       *
       * Ergonomic Grip (pg 76) and melee Heavy (pg 65) both print *"the
       * weapon's critical hit modifier **or** damage dice increases by 1"*. An
       * "or" with no printed default is not a number — it is state — so it gets
       * a field: one `StringField` per mod that asks, `""` until somebody
       * answers.
       *
       * **Blank means undecided, and undecided applies neither half.**
       * `applyMods` reports the pending choice (`ModStatNote` kind
       * `pendingChoice`) instead of picking a branch, because a system that
       * quietly chose one would be inventing a rule and then hiding it inside a
       * derived number. Additive and blank by default, so every weapon already
       * in a world loads unchanged (backlog E2 — no migration) and a weapon that
       * has never been asked reads exactly like one whose player has not
       * decided, which is the truth in both cases.
       *
       * Keyed by mod rather than being one shared field: the two rows can never
       * share a weapon (one table each), but "which mod is asking" is what a
       * sheet has to render, and Ergonomic Grip can be swapped off and back on
       * while Heavy is permanent.
       */
      modOptions: new f.SchemaField(
        Object.fromEntries(
          MOD_CHOICE_KEYS.map((key) => [
            key,
            new f.StringField({
              required: true,
              blank: true,
              initial: "",
              choices: ["", ...MOD_CHOICES],
            }),
          ]),
        ),
      ),
      load: new f.NumberField({ required: true, initial: 0, min: 0 }),
      strengthReq: new f.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      decay: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      cost: new f.NumberField({ required: true, initial: 0, min: 0 }),
      // Statblock fidelity: NPC attacks list a fixed to-hit; when set, attack
      // rolls use this instead of the wielder's skill bonus.
      attackBonusOverride: new f.NumberField({
        required: false,
        nullable: true,
        integer: true,
        initial: null,
      }),
      // Wielded rather than merely carried. v2.1 blocking (pg 127) requires a
      // melee weapon in hand, which needs a field to ask about; the sheet's
      // equip toggle was already writing this path for armor.
      equipped: new f.BooleanField({ required: true, initial: false }),
      // How a weapon is held is a player declaration, not a weapon statistic:
      // the book never says a Two Handed weapon *occupies* two hands, only what
      // it costs you to use one anyway (pg 61, 70). So this is a stance the
      // player sets, and it only means anything on a Two Handed weapon.
      oneHanded: new f.BooleanField({ required: true, initial: false }),
      // Automatic (Switch) weapons have two modes of fire and 3 AP to change
      // between them (pg 69). Only the Assault Rifle has it, and its properties
      // genuinely differ per mode, so the mode has to be state rather than a
      // note on the card.
      autoMode: new f.BooleanField({ required: true, initial: false }),
      // The Item Blueprint Encyclopedia's "Repair DC" column, which holds a
      // *bonus* despite its heading: the check is against 10 + this (pg 93).
      // The Encyclopedia itself is not extracted yet, so this stays 0 and the
      // repair dialog asks.
      repairBonus: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      description: new f.HTMLField({ required: true, initial: "" }),
    };
  }

  get skill(): SkillKey {
    return WEAPON_TYPE_SKILL[this.weaponType];
  }

  get isRanged(): boolean {
    return (RANGED_WEAPON_TYPES as readonly string[]).includes(this.weaponType);
  }

  /**
   * The mechanical properties this weapon actually has: the printed special
   * column, plus anything its attached mods grant (pg 65, 75-77).
   *
   * The grants are merged *after* the parse and never written back into
   * `special`, which stays the transcription. That is what keeps the book's two
   * "if it already has …" clauses answerable — Hardened Receiver's extra damage
   * rank and Laser Sight's doubled critical both turn on whether the weapon had
   * the property *before* the mod, and once a grant is folded into the string
   * the two are indistinguishable forever. `parseKeywords(this.special)` is what
   * it came with; this is what it is now, and the difference is the test.
   */
  get keywords(): WeaponKeywords {
    return weaponKeywords(this.special, this.attachedModKeys);
  }

  /** 6 AP, or 4 with Quick Reload / 10 with Slow Reload (pg 70). */
  get reloadCost(): number {
    const cost = reloadCost(this.keywords, this.attachedModKeys);
    return cost.kind === "flat" ? cost.ap : cost.minimumAp;
  }

  /**
   * The mods actually attached, as keys (pg 65, 75-77).
   *
   * Filtered through `isModKey` rather than trusted: the schema validates what
   * is *written*, but a document restored from a pack built by an older release
   * — or hand-edited in the world JSON — can still carry a key this build no
   * longer knows, and a stale key must be inert rather than throw.
   */
  get attachedModKeys(): ModKey[] {
    return Object.entries(this.attachedMods)
      .filter(([key, on]) => on && isModKey(key))
      .map(([key]) => key as ModKey);
  }

  hasMod(key: ModKey): boolean {
    return this.attachedMods[key] === true;
  }

  /** Mod slots spent, against the six every ranged weapon has (pg 75). */
  get modSlotsUsed(): number {
    return slotsUsed(this.attachedModKeys);
  }

  /**
   * *"A ranged weapon ceases function if its Mod Slot total is greater than 6"*
   * (pg 75). Reported, never enforced — see `modEligibility`.
   */
  get modSlotsExceeded(): boolean {
    return ceasesFunction(this.attachedModKeys);
  }

  /**
   * Whether attacking with this weapon leaves its hidden wielder hidden (pg 77).
   *
   * This is the whole of D3's first slice: `revealedByAttacking` in
   * `rules/stealth.ts` has always taken a boolean, and until now nothing but a
   * caller's declaration could produce one. `rollAttack` reads this when the
   * caller does not declare.
   */
  get silenced(): boolean {
    return silences(this.attachedModKeys);
  }

  /**
   * The player's answer to each mod that prints an "or", normalised.
   *
   * Blanks and anything the schema would not have accepted are dropped rather
   * than passed through, for the same reason `attachedModKeys` filters through
   * `isModKey`: a document restored from an older pack or hand-edited in the
   * world JSON must be inert, not throwing.
   */
  get modChoices(): Partial<Record<ModKey, ModChoice>> {
    const choices: Partial<Record<ModKey, ModChoice>> = {};
    for (const key of MOD_CHOICE_KEYS) {
      const stored = this.modOptions[key];
      if (stored === "crit" || stored === "damage") choices[key] = stored;
    }
    return choices;
  }

  /**
   * This weapon's numbers with its mods folded in (pg 65, 75-77).
   *
   * The counterpart to `keywords` and `reloadCost` above: a derived answer about
   * one document, computed by `rules/mods.ts` and stored nowhere. The printed
   * schema fields are left exactly as the book prints them — the same
   * arrangement `ArmorData` uses for `load` and `effectiveLoad`, and for the
   * same two reasons: an editable sheet field must keep showing what the row
   * says, and a consumer that wants the modded number should have to say so.
   *
   * Which consumers have said so is tracked in the `automation` column of
   * `rules/mods.ts` (`derived` versus `code`) — the number being right is not
   * the same as the number being read.
   */
  get moddedStats(): ModdedWeaponStats {
    return applyMods(
      {
        load: this.load,
        strengthReq: this.strengthReq,
        apCost: this.apCost,
        critChance: this.critChance,
        crit: this.crit,
        damage: this.damage,
        rangeNormal: this.rangeNormal,
        rangeLong: this.rangeLong,
        magazineSize: this.magazineSize,
        special: this.special,
      },
      this.attachedModKeys,
      this.modChoices,
    );
  }

  /**
   * Carry Load this weapon actually costs, mods included.
   *
   * Named to match `ArmorData.effectiveLoad`, which solves the identical problem
   * one item type over and is called by name from the Carry Load sum in
   * `data/character.ts`.
   */
  get effectiveLoad(): number {
    return this.moddedStats.load;
  }

  /**
   * Flat addition to this weapon's attack roll total (pg 76-77).
   *
   * Holographic weapon sight, Muzzle Brake and Stock each print +1 and Infrared
   * Scope prints +2, and `rollAttack` already builds its roll from a `parts`
   * array — so this is one term to push, not a new mechanism. Zero on a weapon
   * with none of the four, which is every weapon that has ever existed in a
   * saved world.
   */
  get modAttackBonus(): number {
    return this.moddedStats.attackBonus;
  }

  /**
   * Mods on this weapon whose printed "or" nobody has answered (pg 65, 76).
   *
   * Non-empty means a printed benefit is sitting unclaimed — not a bug, a
   * question — so a sheet should ask rather than a derivation guessing. See
   * `modOptions` in the schema above.
   */
  get pendingModChoices(): readonly ModKey[] {
    return this.moddedStats.pendingChoices;
  }
}

/** Ammunition (pg 64): ten rounds equal one Load; energy cells power many shots. */
export class AmmoData extends foundry.abstract.TypeDataModel {
  declare ammoType: string;
  declare quantity: number;
  declare costPerRound: number;
  declare cost: number;
  declare special: string;
  declare description: string;

  static override defineSchema(): Record<string, unknown> {
    const f = foundry.data.fields;
    return {
      ammoType: new f.StringField({ required: true, initial: "" }),
      quantity: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      costPerRound: new f.NumberField({ required: true, initial: 0, min: 0 }),
      cost: new f.NumberField({ required: true, initial: 0, min: 0 }),
      special: new f.StringField({ required: true, initial: "" }),
      description: new f.HTMLField({ required: true, initial: "" }),
    };
  }

  /** Ten individual rounds are one Load (pg 64). */
  get load(): number {
    return this.quantity / 10;
  }
}

export const AID_TYPES = [
  "food",
  "drink",
  "medicine",
  "chem",
  "program",
  "magazine",
  "other",
] as const;

/**
 * Consumables: food, drinks, medicine, chems, Robot Overclock Programs and
 * skill magazines (pg 82-92). Chems and programs additionally carry the
 * addiction machinery from pg 89-90.
 */
export class AidData extends foundry.abstract.TypeDataModel {
  declare aidType: (typeof AID_TYPES)[number];
  declare effect: string;
  declare properties: string;
  declare quantity: number;
  declare load: number;
  declare apCost: number;
  declare duration: string;
  declare addictive: boolean;
  declare addictionDC: number;
  declare withdrawal: string;
  declare healsHealingRate: boolean;
  /**
   * Heal over this many of the target's turns instead of all at once (pg 86).
   * 0 — the default and every other consumable — pays out immediately.
   */
  declare healRounds: number;
  declare healRateMultiplier: number;
  declare healFormula: string;
  declare removesRads: number;
  declare cost: number;
  declare description: string;

  static override defineSchema(): Record<string, unknown> {
    const f = foundry.data.fields;
    return {
      aidType: new f.StringField({ required: true, initial: "food", choices: AID_TYPES }),
      effect: new f.StringField({ required: true, initial: "" }),
      // The book's Properties column (e.g. "Anabolic, Stimulant"), comma-separated.
      properties: new f.StringField({ required: true, initial: "" }),
      quantity: new f.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      load: new f.NumberField({ required: true, initial: 0, min: 0 }),
      // Chems and stimpaks are 4 AP to use.
      apCost: new f.NumberField({ required: true, integer: true, initial: 4, min: 0 }),
      // "1 hour" for every chem and program (pg 89); medicine varies.
      duration: new f.StringField({ required: true, initial: "" }),
      // Chems and programs force an Endurance check on use (pg 89).
      addictive: new f.BooleanField({ required: true, initial: false }),
      // DC 6 for chems and programs (pg 89); alcohol's Addictive property is DC 5 (pg 82).
      addictionDC: new f.NumberField({ required: true, integer: true, initial: ADDICTION_DC, min: 0 }),
      // What you suffer while addicted and not under the chem's effects (pg 89).
      withdrawal: new f.StringField({ required: true, initial: "" }),
      // Stimpak-style healing: restores a multiple of the user's Healing Rate (pg 86).
      healsHealingRate: new f.BooleanField({ required: true, initial: false }),
      // Healing Powder is the only printed item that heals across turns rather
      // than on use (pg 86). Additive and zero by default, so every existing aid
      // item loads and behaves exactly as before.
      healRounds: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // 0.5 (diluted), 1 (stimpak), 2 (super stimpak); ignored unless the flag is set.
      healRateMultiplier: new f.NumberField({ required: true, initial: 1, min: 0 }),
      // Fixed healing dice/number, used when healsHealingRate is false ("" = no healing).
      healFormula: new f.StringField({ required: true, initial: "" }),
      // RadAway removes two levels of Rads, diluted one (pg 86).
      removesRads: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      cost: new f.NumberField({ required: true, initial: 0, min: 0 }),
      description: new f.HTMLField({ required: true, initial: "" }),
    };
  }

  /** Chems and Robot Overclock Programs share the entire addiction workflow. */
  get isChemLike(): boolean {
    return this.aidType === "chem" || this.aidType === "program";
  }
}

/** Perks (pg 32+): requirements, effect, optional repeat ranks. */
export class PerkData extends foundry.abstract.TypeDataModel {
  declare requirements: string;
  declare ranks: number;
  declare description: string;

  static override defineSchema(): Record<string, unknown> {
    const f = foundry.data.fields;
    return {
      requirements: new f.StringField({ required: true, initial: "" }),
      ranks: new f.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      description: new f.HTMLField({ required: true, initial: "" }),
    };
  }
}

/** Traits (pg 25+): a benefit and a drawback, with an optional Wild Wasteland variant. */
export class TraitData extends foundry.abstract.TypeDataModel {
  declare prerequisite: string;
  declare wildWasteland: boolean;
  declare wildWastelandEffect: string;
  declare description: string;

  static override defineSchema(): Record<string, unknown> {
    const f = foundry.data.fields;
    return {
      prerequisite: new f.StringField({ required: true, initial: "" }),
      wildWasteland: new f.BooleanField({ required: true, initial: false }),
      wildWastelandEffect: new f.StringField({ required: true, initial: "" }),
      description: new f.HTMLField({ required: true, initial: "" }),
    };
  }
}

/**
 * The junk materials the crafting chapter spends, as the Item Blueprint
 * Encyclopedia (pg 94-115) names them.
 *
 * **The book prints no junk table.** It has a Crafting chapter that spends junk
 * on every page, a first-aid rule that spends "1 cloth junk item" (pg 21, 23),
 * a robot rule that spends "3 steel and 1 circuitry junk" (pg 11), and a perk
 * (Randomizer, pg 50) that replaces a requirement with "a randomly chosen junk
 * material" — and it never once enumerates what those materials are. The only
 * authority on the vocabulary is the Encyclopedia's own two materials columns,
 * so this list is a **census of those cells**, not a transcription of a table.
 * `packs-src/EXTRACTION-NOTES.md` records how it was taken and what was left
 * out.
 *
 * Kept here rather than in `rules/` because it is the schema's own vocabulary:
 * `packs-src/junk.json` writes these strings into `junkType` and
 * `src/actions/junk.ts` matches on them.
 */
export const JUNK_TYPES = [
  // Raw scrap.
  "steel",
  "aluminum",
  "copper",
  "lead",
  "gold",
  "silver",
  "ceramic",
  "glass",
  "plastic",
  "rubber",
  "wood",
  "cloth",
  "leather",
  "fiberglass",
  "ballistic fiber",
  "cardboard",
  "asbestos",
  "tin can",
  "large animal bone",
  "large animal fur",
  // Salvaged components.
  "screws",
  "nails",
  "spring",
  "gear",
  "circuitry",
  "fiber optics",
  "crystal",
  "power armor chassis",
  // Chemicals and compounds.
  "adhesive",
  "acid",
  "oil",
  "antiseptic",
  "abraxo cleaner",
  "fertilizer",
  "paint",
  "gunpowder",
  "nuclear material",
  "nuclear component",
  // Brewing intermediates: craftable, inedible, and homeless anywhere else.
  "yeast",
  "alcohol yeast",
  // The Encyclopedia's own generic, and by far its most-used line (284 cells).
  "crafting material",
] as const;

export type JunkType = (typeof JUNK_TYPES)[number];

/**
 * The book's own singular/plural drift, mapped onto the form it uses most.
 *
 * Every entry here is one word the Encyclopedia spells two ways for the same
 * material — "x9 screws" against the Syringer's "x1 screw", "x2 spring" against
 * Light rank 3's "x4 springs". Nothing is mapped across a *different* word:
 * the Laser rifle's "x1 circuit" is left alone rather than folded into
 * `circuitry`, because that is a guess and this table is only for inflections.
 */
const JUNK_ALIASES: Readonly<Record<string, JunkType>> = {
  screw: "screws",
  nail: "nails",
  springs: "spring",
  gears: "gear",
  tin: "tin can",
  bone: "large animal bone",
};

/**
 * Normalise a printed material name (or a `junkType` field) to a match key.
 *
 * Lower-cases, collapses whitespace, drops the trailing period the Encyclopedia
 * scatters through its cells, strips a leading "Junk: " so a document name can
 * be fed in as well as a type, and then resolves the inflection aliases above.
 * Anything unrecognised is returned normalised rather than rejected — see
 * `junkType` on `GearData` for why the vocabulary is not a closed set.
 */
export function junkTypeKey(name: string): string {
  const trimmed = name
    .toLowerCase()
    .replace(/^junk:\s*/, "")
    .replace(/\.+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return JUNK_ALIASES[trimmed] ?? trimmed;
}

/** Anything else that takes up Carry Load: junk, gear, tools. */
export class GearData extends foundry.abstract.TypeDataModel {
  declare junkType: string;
  declare modKey: string;
  declare quantity: number;
  declare load: number;
  declare cost: number;
  declare decay: number;
  declare repairBonus: number;
  declare description: string;

  static override defineSchema(): Record<string, unknown> {
    const f = foundry.data.fields;
    return {
      /**
       * Which crafting material this stack *is*, or "" for the gear that is not
       * junk at all — a backpack, a Pip-Boy, an armor upgrade. Additive and
       * blank by default, so every gear document already in a world keeps
       * loading and stays non-junk (BACKLOG E2: no migration).
       *
       * Deliberately **not** `choices: JUNK_TYPES`, which is where this parts
       * company with `aidType` on `AidData`. `aidType`'s seven values are
       * printed categories the book actually names, so constraining them
       * catches typos. `JUNK_TYPES` is a census of material cells (see above),
       * and a censused list is not an authority: closing the set would make the
       * schema reject a material the census missed, and would refuse a GM's
       * homebrew junk outright. Free text, normalised by `junkTypeKey()` at
       * every comparison, is the honest shape for a vocabulary the book never
       * closed.
       */
      junkType: new f.StringField({ required: true, blank: true, initial: "" }),
      /**
       * Which pg 65 / pg 75-77 weapon modification this document *is*, or "" for
       * the gear that is not a mod — which is most of it.
       *
       * All 31 mods have shipped as `gear` documents since the equipment
       * extraction ("Ranged Weapon Mod: Silencer", "Melee Weapon Mod: Heavy"),
       * carrying the printed prose and nothing a machine could match; the pg 101
       * and pg 110-111 crafting blueprints already join onto them by that name,
       * so a player can already craft a Silencer and has nowhere to put it.
       * `scripts/build-packs.mjs` now writes this key from `packs-src/mods.json`,
       * which is the seam an "attach this document to that weapon" control needs
       * — the control itself is a later slice (see `d3-remaining.md`).
       *
       * Constrained to `MOD_KEYS`, unlike `junkType` directly above: the mod
       * tables are closed and printed, the junk vocabulary is a census. See
       * `WeaponData.attachedMods` for the same argument at length.
       */
      modKey: new f.StringField({
        required: true,
        blank: true,
        initial: "",
        choices: ["", ...MOD_KEYS],
      }),
      quantity: new f.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      load: new f.NumberField({ required: true, initial: 0, min: 0 }),
      cost: new f.NumberField({ required: true, initial: 0, min: 0 }),
      // "Any item can have a level of decay" (pg 92), not just weapons and
      // armor — a targeted attack or a GM ruling can decay anything.
      decay: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      repairBonus: new f.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      description: new f.HTMLField({ required: true, initial: "" }),
    };
  }

}
