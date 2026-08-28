/**
 * Weapon modifications — the pg 65 melee table and the pg 75-77 ranged table.
 *
 * Until this module existed, `system.mods` on a weapon was a bare string that
 * nothing read, and the Silencer's one mechanical clause had to be *declared* at
 * the call site (`AttackOptions.silenced` in `src/dice/rolls.ts`) because there
 * was nothing on the weapon to ask. This is the layer that makes the question
 * answerable.
 *
 * **Page ranges, verified rather than inherited.** The backlog entry guessed
 * "pg 71-77". Extracting single physical pages (physical page number equals the
 * printed folio in this PDF) puts the tables at:
 *
 * - **pg 65** — Melee Weapon Modifications, 7 rows.
 * - **pg 75-77** — Ranged Weapon Modifications, 24 rows.
 * - **pg 101 / pg 110-111** — the two crafting-blueprint tables for the same 31
 *   rows, which `packs-src/blueprints.json` already carries and
 *   `scripts/build-packs.mjs` already joins onto the shipped gear documents.
 *
 * **Two limits, one per table.**
 *
 * - Ranged (pg 75): *"Each weapon modification has a Mod Slot total listed in
 *   its description. Every ranged weapon has a total of 6 mod slots. A ranged
 *   weapon ceases function if its Mod Slot total is greater than 6."*
 * - Melee (pg 65): *"Melee weapons can only have one modification. Each
 *   modification can be switched for another with 5 minutes of time unless
 *   otherwise specified."*
 *
 * **Three names collide across the two tables** — Strengthen and Light Build
 * appear in both and do different things, and melee "Ergonomic" is a different
 * mod from ranged "Ergonomic Grip". `scripts/build-packs.mjs` already learned
 * this: its `CATEGORY_PREFIXES` exists so the two Strengthen rows join to
 * different crafting DCs. So the key vocabulary here **prefixes all seven melee
 * keys with `melee`** — all seven rather than only the colliding three, so the
 * rule is "melee mods are prefixed" rather than "melee mods are prefixed when
 * they happen to collide".
 *
 * **What a mod does to the weapon's numbers** lives here too, in `stats` on each
 * row and in `applyMods` at the bottom. Fifteen of the thirty-one rows move a
 * printed statistic — load, Strength requirement, AP, crit chance, the critical
 * hit modifier, the damage die, the two range *modifiers*, the magazine, the
 * attack roll total — and folding them takes four rulings the book forces and
 * does not answer. Each is stated where it applies and numbered here so the
 * comments can point at it:
 *
 * 1. **Order of application** — see `ModStatEffects`. Proportional first, then
 *    flat, then the printed bounds.
 * 2. **The printed "or" is a player choice** — see `ModChoiceEffects` and
 *    `WeaponData.modOptions`. Stored, and neither half applies until it is made.
 * 3. **The damage-dice ladder** — see `DAMAGE_DIE_RANKS`. d4→d6→d8→d10→d12, the
 *    die and not the count, so `2d6` steps to `2d8`.
 * 4. **Range modifiers, not feet** — see `ModStatEffects` again. Every range
 *    clause operates on the ×PER multiplier, before `weaponRange()`.
 *
 * **Layering.** This module is pure: it imports nothing but
 * `rules/constants.ts`, touches no document, and reads no `game.*`. The schema
 * (`WeaponData.attachedMods` in `src/data/items.ts`) imports *from* here, the
 * same direction `data/armor.ts` imports `rules/power-armor.ts`.
 */

import { MELEE_WEAPON_TYPES, RANGED_WEAPON_TYPES, type WeaponType } from "./constants";

// ===========================================================================
// The key vocabulary
// ===========================================================================

/**
 * The pg 75-77 table, in printed order.
 *
 * `scripts/build-packs.mjs` parses the string literals out of this block and
 * the melee block below to cross-check `packs-src/mods.json`; keep both as plain
 * quoted literals in a single `as const` array.
 */
export const RANGED_MOD_KEYS = [
  "autoFiringTurret",
  "bayonet",
  "boostedCapacitor",
  "doubleAction",
  "ergonomicGrip",
  "hardenedReceiver",
  "holographicSight",
  "improvedRifling",
  "increasedClipSize",
  "infraredScope",
  "laserSight",
  "lightBuild",
  "longerBarrel",
  "luckyCharm",
  "muzzleBrake",
  "onBoardTargetTracking",
  "overclockedCapacitor",
  "remoteControlledTurret",
  "scope",
  "semiAutomatic",
  "silencer",
  "speedloader",
  "stock",
  "strengthen",
] as const;

/** The pg 65 table, in printed order. Prefixed — see the module header. */
export const MELEE_MOD_KEYS = [
  "meleeStrengthen",
  "meleeDoubleSided",
  "meleeHeavy",
  "meleeUpgraded",
  "meleeLightBuild",
  "meleeSharpened",
  "meleeErgonomic",
] as const;

export const MOD_KEYS = [...RANGED_MOD_KEYS, ...MELEE_MOD_KEYS] as const;

export type RangedModKey = (typeof RANGED_MOD_KEYS)[number];
export type MeleeModKey = (typeof MELEE_MOD_KEYS)[number];
export type ModKey = RangedModKey | MeleeModKey;

/** Which of the two tables a mod is printed in. */
export type ModCategory = "ranged" | "melee";

// ===========================================================================
// How far this system takes a mod — the honest column
// ===========================================================================

/**
 * The Power Armor upgrade table (`rules/power-armor.ts`) classifies each of its
 * nineteen rows as `code | control | effect | helper | text`, and that column is
 * the reason the table can be trusted: it never claims more than it does. Copied
 * here, with a deliberately **narrower** vocabulary — nothing in the mod table
 * is an Active Effect or a pressable control yet, and carrying two union members
 * that no row uses would be worse documentation, not better.
 *
 * - `code` — every printed clause of this mod reaches play.
 * - `derived` — every printed clause is **computed**, by `applyMods` below and
 *   `WeaponData.moddedStats`, but at least one of them is computed and not yet
 *   *read*: a derived number only reaches play where a consumer has switched
 *   from the printed field to the derived one. See the next paragraph; this
 *   value is the whole reason the vocabulary grew.
 * - `partial` — at least one printed clause is outside the statistic
 *   derivation entirely, and the row's comment names the sibling slice that
 *   owns it (granted properties, a per-attack control, an actor-scoped rule).
 *   Whether that slice has landed is that row's own comment to keep current;
 *   this column understates by default rather than tracking another slice's
 *   state from a distance.
 * - `text` — nothing is computed or enforced. The comment says why, and
 *   `d3-remaining.md` in the scratchpad names the slice that would change it.
 *
 * **Why `derived` is not `code`.** The statistic derivation follows this
 * codebase's existing shape for the identical problem — `ArmorData.effectiveLoad`
 * is a getter beside the printed `load`, and `character.ts` calls it on purpose
 * — rather than overwriting the schema fields in a derived-data pass. That keeps
 * the printed row intact and editable, keeps `rules/` pure, and keeps every
 * consumer's switch-over a visible one-line change in its own file. The cost is
 * that until a consumer switches, the number is right and unread: carry load
 * still sums `system.load`, and `rollAttack` still reads `system.damage`,
 * `system.critChance` and `system.strengthReq`. Calling those rows `code` would
 * be claiming an effect nobody at the table can see, which is exactly what this
 * column exists to prevent. `slice2-integration.md` in the scratchpad lists the
 * consumers and which rows flip to `code` as each one lands.
 *
 * After D3's slice 2: ten rows are `derived`, ten `partial`, eleven `text`, and
 * nothing is `code`. Nothing being `code` is the honest reading of a slice that
 * shipped a derivation and no consumer, and it is the number the sibling slices
 * and the integration doc are there to move.
 *
 * The **mod-slot limit** is a separate matter: it is fully implemented below
 * (`slotsUsed`, `ceasesFunction`, `MELEE_MOD_LIMIT`) because it is a property of
 * the table rather than of any one row, so it does not appear in this column.
 */
export type ModAutomation = "code" | "derived" | "partial" | "text";

// ===========================================================================
// Cost and swap time
// ===========================================================================

/**
 * The Base Cost column. Twenty-nine rows print a percentage of the weapon's own
 * base cost; two print flat caps (Lucky Charm 50c, Speedloader 450c).
 *
 * Melee costs come from pg 65, which prints the same "% of the weapon's base
 * cost" shape but adds *"(to GM's discretion)"* to the purchase rule.
 */
export type ModCost =
  | { readonly kind: "percent"; readonly percent: number }
  | { readonly kind: "caps"; readonly caps: number };

/**
 * The Time to Equip/Unequip column (pg 75-77), and pg 65's blanket "5 minutes"
 * for melee.
 *
 * Four shapes are printed:
 *
 * - `ap` — a flat AP cost ("6 AP.").
 * - `minutes` — `base − (perIntelligence × your Intelligence score)` minutes.
 *   Two of the three variants print no floor at all; the third (Holographic
 *   weapon sight, Laser Sight) prints "Minimum of 1 minute", which is what tells
 *   us the others really can reach zero.
 * - `never` — Speedloader's "N/A", and every melee row marked *"This
 *   modification is permanent and cannot be switched"*.
 *
 * **Ruling where the book is silent:** the un-floored `minutes` rows are floored
 * at 0 rather than allowed to go negative. A player character's Intelligence
 * score caps at 10 (pg 20), so `60 − 5×INT` bottoms out at 10 and `15 − INT` at
 * 5 and neither can go negative in play; creature scores run to 20, and a
 * negative swap time is not a rule the book states anywhere.
 */
export type ModSwapTime =
  | { readonly kind: "ap"; readonly ap: number }
  | {
      readonly kind: "minutes";
      readonly base: number;
      readonly perIntelligence: number;
      readonly minimum: number;
    }
  | { readonly kind: "never" };

/** Minutes to attach or remove this mod at a given Intelligence *score*. */
export function swapMinutes(time: ModSwapTime, intelligenceScore: number): number | null {
  if (time.kind !== "minutes") return null;
  const raw = time.base - time.perIntelligence * Math.max(0, Math.floor(intelligenceScore));
  return Math.max(time.minimum, raw);
}

/** Caps this mod costs on a weapon whose own base cost is `weaponCost`. */
export function modCaps(cost: ModCost, weaponCost: number): number {
  return cost.kind === "caps" ? cost.caps : (Math.max(0, weaponCost) * cost.percent) / 100;
}

// ===========================================================================
// Eligibility — the "Equippable Weapons" column
// ===========================================================================

/**
 * One clause of the Equippable Weapons column. A weapon satisfies the column if
 * it satisfies **any** clause; an empty clause list means the row printed "Any
 * weapon" and imposes no type restriction of its own.
 *
 * Clauses exist because several rows are genuine disjunctions that no single
 * type list can express — Infrared Scope's *"Any revolver or rifle including the
 * Laser Rifle, Plasma Rifle, or Gauss Rifle"* is three alternatives, and Stock's
 * *"Any submachine gun, rifle, shotgun, energy weapon, or revolver with the long
 * barrel modification"* is a list plus one alternative that carries its own
 * precondition.
 */
export interface ModAllowClause {
  /** Weapon types this clause admits. */
  readonly weaponTypes?: readonly WeaponType[];
  /** This clause admits revolvers only — see `REVOLVER_PATTERN`. */
  readonly revolver?: true;
  /** Weapons this clause names outright, matched on the document name. */
  readonly names?: readonly string[];
  /** A mod that must already be attached for this clause to admit the weapon. */
  readonly requiresMod?: ModKey;
}

/**
 * **The book has a weapon category this system does not.**
 *
 * Four ranged rows are restricted to *"Any revolver"* (Double Action,
 * Speedloader) or *"Any revolver or rifle"* (Scope, Infrared Scope). "Revolver"
 * is not one of the six printed ranged weapon *types* (pg 66-68: handgun,
 * submachine gun, rifle, shotgun, big gun, energy weapon) and so is not a
 * `WeaponType` here — every revolver in `packs-src/weapons.json` is a `handgun`,
 * and the only thing that marks one out is its **name**: "Pipe revolver",
 * ".357 Magnum revolver", ".44 Magnum revolver", "Ranger Sequoia revolver".
 *
 * **Ruling:** a revolver is a handgun whose name contains the word. That is a
 * name match, which this file otherwise avoids, and it is used *only* here
 * because the book left no other handle. It is advisory — `modEligibility`
 * reports, nothing blocks — so a homebrew revolver called "Colt Python" gets a
 * note rather than a refusal.
 */
export const REVOLVER_PATTERN = /\brevolver\b/i;

export function isRevolver(weaponType: WeaponType, name: string): boolean {
  return weaponType === "handgun" && REVOLVER_PATTERN.test(name);
}

/** The weapon facts an eligibility check needs. No document, no actor. */
export interface ModWeapon {
  readonly weaponType: WeaponType;
  readonly name: string;
  /** The printed special-properties column, verbatim (pg 60-61, 69-70). */
  readonly special: string;
  /** Mods already attached. */
  readonly attached: readonly ModKey[];
}

/** Why a mod does not fit. One entry per failed printed clause. */
export type ModIneligibility =
  /** A melee mod on a ranged weapon, or the reverse. */
  | { readonly kind: "category"; readonly category: ModCategory }
  /** The Equippable Weapons column admits no clause this weapon satisfies. */
  | { readonly kind: "weaponType" }
  /** The column names this weapon in its "except for" list. */
  | { readonly kind: "excludedWeapon"; readonly name: string }
  /** A printed special property the row requires and the weapon lacks. */
  | { readonly kind: "requiresProperty"; readonly property: string }
  /** A printed special property the row forbids and the weapon carries. */
  | { readonly kind: "forbidsProperty"; readonly property: string }
  /** Another mod that must be attached first (Stock on a revolver). */
  | { readonly kind: "requiresMod"; readonly mod: ModKey }
  /** A mod the row cannot share a weapon with. */
  | { readonly kind: "conflict"; readonly mod: ModKey }
  /** Attaching would push the ranged weapon past its six slots (pg 75). */
  | { readonly kind: "slots"; readonly used: number; readonly limit: number }
  /** A melee weapon already carries its one modification (pg 65). */
  | { readonly kind: "meleeLimit" }
  /** Already attached. */
  | { readonly kind: "alreadyAttached" };

export interface ModEligibility {
  readonly ok: boolean;
  readonly reasons: readonly ModIneligibility[];
}

// ===========================================================================
// Statistic effects — the numbers a mod moves
// ===========================================================================

/**
 * Every printed clause in the two tables that changes one of the weapon's own
 * numbers, in one shape. Nothing here is prose: the prose stays in
 * `packs-src/mods.json` and on the shipped gear document, and this is only the
 * arithmetic, so the two can be read against each other.
 *
 * A field left out means the row prints no change to that statistic. A row with
 * no statistic clauses at all carries `{}` rather than being allowed to omit
 * `stats`, so a new row cannot forget to say.
 *
 * ---
 *
 * **Ruling 1 — order of application. Proportional first, then flat, then the
 * printed bounds.** The book never says. Light Build halves a weapon's load,
 * Silencer adds 2 and Stock adds 4, and on a load-8 weapon halve-then-add gives
 * 10 while add-then-halve gives 7. Three reasons for halve-then-add:
 *
 * 1. **It is what the fiction describes.** Light Build is *"replacing parts of
 *    the weapon with lighter materials"* — it lightens the weapon's own body. A
 *    silencer bolted to the muzzle afterwards weighs its 2 whatever the receiver
 *    is made of. The same reading holds for range: Improved Rifling reworks the
 *    barrel's grooves (proportional), Longer Barrel bolts ten more multiplier on
 *    the end.
 * 2. **It is the conservative reading in every case in both tables.** There is
 *    no configuration where multiplying first is more generous to the player
 *    than adding first, and a rule invented to fill the book's silence should
 *    not be the one that pays better.
 * 3. **It cannot become sensitive to history.** `attachedMods` is a flag set,
 *    not a list — it records *which* mods are on the weapon and deliberately
 *    not the order they were fitted, because the book's own attach/detach rules
 *    are order-free (any mod, any time, for its printed swap cost). So the fold
 *    has to be order-independent or it would be asking a question the data
 *    cannot answer. Sorting the proportional changes ahead of the flat ones does
 *    that; so does summing the damage-rank steps (see ruling 3 below) instead of
 *    applying them one at a time against their clamps.
 *
 * In practice the phases never even compete: only one row in each table changes
 * a load proportionally (ranged Light Build; melee Double Sided, Heavy and Light
 * Build), melee weapons take one mod at a time, and Light Build and Strengthen
 * are printed as mutually exclusive. The ruling exists so that a GM who attaches
 * something the book did not contemplate still gets a defined answer.
 *
 * ---
 *
 * **Ruling 4 — range *modifiers*, not feet.** `rangeNormal` / `rangeLong` are
 * the printed ×PER multipliers (`weaponRange()` in `rules/formulas.ts` turns
 * them into feet), and every range clause in the table names the *modifier*:
 * *"the weapon's range modifiers are increased by half"* (Improved Rifling),
 * *"short range modifier is doubled and the long range modifier is
 * quadrupled"* (Scope), *"long range modifier is tripled"* (Infrared Scope),
 * *"long range modifier increases by 10 … short range modifier decreases by 2"*
 * (Longer Barrel). So all four operate here, before the multiplication by
 * Perception, and a Scope is worth four times as much to a sharp-eyed shooter —
 * which is what the printed sentence says and what a scope does.
 *
 * A multiplied modifier can land on a half (×1.5 of an odd number). It is left
 * fractional: `attackRangeReport` in `dice/rolls.ts` already floors the *feet*
 * after multiplying by Perception and the weather scale, so rounding the
 * multiplier here would round twice and lose a foot for nothing.
 */
export interface ModStatEffects {
  /** Proportional load change: 0.5 "decreases by half", 1.5 "increases by half", 2 "is doubled". */
  readonly loadFactor?: number;
  /** Flat load change, applied after every factor. */
  readonly load?: number;
  readonly strengthReq?: number;
  readonly apCost?: number;
  /** A floor the row prints for itself ("to a minimum of 1"). */
  readonly apCostMinimum?: number;
  /** A ceiling the row prints for itself ("to a maximum of 6"). */
  readonly apCostMaximum?: number;
  /**
   * Change to the *crit chance*, i.e. the threshold the kept d20 must reach —
   * so the two rows that print "critical hit chance decreases by 1" carry −1 and
   * make critting **easier**. Same direction as the Luck bonus in
   * `critThreshold()`, which also subtracts.
   */
  readonly critChance?: number;
  /** "The weapon's number of rounds is increased by 3." */
  readonly magazineSize?: number;
  /** "The weapon's attack roll total is increased by 1." */
  readonly attackBonus?: number;
  /** Steps along `DAMAGE_DIE_RANKS`; negative steps down. */
  readonly damageRank?: number;
  /** …but only when the *printed* special column already carries this property. */
  readonly damageRankRequiresProperty?: string;
  readonly rangeNormalFactor?: number;
  readonly rangeLongFactor?: number;
  readonly rangeNormal?: number;
  readonly rangeLong?: number;
  /** The row prints "critical hit modifier **or** damage dice increases by 1". */
  readonly choice?: ModChoiceEffects;
}

/**
 * **Ruling 2 — the "or" is a player choice, so it is stored, and until it is
 * made neither half applies.**
 *
 * Two rows print one:
 *
 * - Ergonomic Grip (pg 76): *"The weapon's critical hit damage modifier **or**
 *   damage dice increases by 1."*
 * - melee Heavy (pg 65): *"The weapon's critical hit modifier **or** damage dice
 *   increases by 1."*
 *
 * The book gives no default, no "choose when you attach", and no way to switch.
 * A number cannot express it, so it is **state**: `WeaponData.modOptions` is a
 * `SchemaField` with one `StringField` per choosing mod, blank by default, and a
 * blank one means *the choice has not been made*. A blank choice applies
 * **neither** branch and is reported (`ModStatNote` kind `pendingChoice`) so a
 * sheet can ask. Silently defaulting to one branch would be this system
 * inventing a rule and then hiding it inside a derived number, which is the
 * exact failure the `automation` column exists to prevent.
 *
 * The two rows can never collide on one weapon (one is ranged, one melee), so a
 * single shared field would have done — it is per-mod anyway, because "which
 * mod is asking" is the question a sheet has to render, and because the melee
 * table's own Heavy is permanent while Ergonomic Grip can be swapped off and
 * back on.
 *
 * On the `crit` branch, see `stepCritModifier`: the printed Critical Hit column
 * is not always a modifier.
 */
export interface ModChoiceEffects {
  /** "crit": added to the printed critical hit damage multiplier. */
  readonly critModifier: number;
  /** "damage": steps the damage die up this many ranks. */
  readonly damageRank: number;
}

/** The two branches of the printed "or". Blank/absent means undecided. */
export const MOD_CHOICES = ["crit", "damage"] as const;

export type ModChoice = (typeof MOD_CHOICES)[number];

// ===========================================================================
// The damage-dice ladder
// ===========================================================================

/**
 * **Ruling 3 — "damage dice rank" is the die size, and the ladder is
 * d4→d6→d8→d10→d12.**
 *
 * The book never prints the ladder. It prints its two ends, twice, in the two
 * rows that step along it:
 *
 * - Silencer (pg 77): *"The weapon's damage dice rank decreases once to a
 *   **minimum of d4**."*
 * - Hardened Receiver (pg 76): *"the weapon's damage dice rank increases once to
 *   a **maximum of d12**."*
 *
 * d4 and d12 are exactly the ends of the standard five-step polyhedral
 * progression, and every damage expression in the weapon tables that has a die
 * at all uses one of those five and no other — 105 of the 110 rows, with no d2,
 * no d3 and no d20 anywhere in the column (the other five print the flat number
 * `1`). Two printed bounds that coincide with the ends of the only ladder the
 * book's own data ever walks is the book naming the ladder without naming it.
 *
 * **The step is the die, not the count.** Both bounds are written "d4" and "d12"
 * rather than "1d4" and "2d12", so the rank belongs to the die. The book's own
 * idiom settles it independently: the Throwing Knife (pg 62) prints *"If thrown,
 * damage die increases to 1d6"* on a 1d4 weapon — one step up the same ladder,
 * described as the die increasing. **So a weapon printed `2d6` steps to `2d8`,
 * and `3d12` cannot step up at all.** The alternative reading — "add another
 * die", 2d6 → 3d6 — would make the Throwing Knife line read "increases to 2d4",
 * which is not what it says.
 *
 * The same ladder answers the *other* phrasing. Ergonomic Grip and melee Heavy
 * say "damage dice increases by 1" where Silencer and Hardened Receiver say
 * "rank increases once"; read as the same operation, because the Throwing Knife
 * uses the loose phrasing for the ladder step, and because a book that meant
 * "+1 damage" had that phrase available and used it elsewhere.
 *
 * Steps are **summed and applied once**, not applied one mod at a time: see
 * ruling 1 — the flag set carries no attachment order, so a fold that clamped
 * between steps would be answering a question the data cannot ask.
 *
 * A damage expression whose die is not on the ladder (a homebrew `1d3`, or the
 * five weapons whose printed damage is the flat number `1`) is **left alone and
 * reported** rather than snapped to the nearest rung. There is no rank to step
 * and guessing one would be inventing a rule.
 */
export const DAMAGE_DIE_RANKS = [4, 6, 8, 10, 12] as const;

/** `NdM`, plus whatever the expression carries after it (`1d4+1`). */
const DAMAGE_DICE = /^(\d*)d(\d+)(.*)$/i;

export interface DamageRankStep {
  /** The stepped expression, or the input unchanged when nothing could step. */
  readonly formula: string;
  /** Steps actually taken, after the ladder's ends bit. */
  readonly stepped: number;
  /** The expression has no die on `DAMAGE_DIE_RANKS` to step. */
  readonly offLadder: boolean;
}

/** Move a damage expression `steps` rungs along `DAMAGE_DIE_RANKS`. */
export function stepDamageRank(damage: string, steps: number): DamageRankStep {
  const ladder: readonly number[] = DAMAGE_DIE_RANKS;
  const match = DAMAGE_DICE.exec(damage.trim());
  if (match === null) return { formula: damage, stepped: 0, offLadder: true };
  const count = match[1] ?? "";
  const size = match[2] ?? "";
  const tail = match[3] ?? "";
  const rank = ladder.indexOf(Number(size));
  if (rank === -1) return { formula: damage, stepped: 0, offLadder: true };
  if (steps === 0) return { formula: damage, stepped: 0, offLadder: false };
  const target = Math.min(ladder.length - 1, Math.max(0, rank + steps));
  const die = ladder[target] ?? Number(size);
  return {
    formula: `${count}d${String(die)}${tail}`,
    stepped: target - rank,
    offLadder: false,
  };
}

/** `x3` and `+2` — the two shapes the Critical Hit column uses for a modifier. */
const CRIT_MULTIPLIER = /^\s*x\s*(\d+)\s*$/i;
const CRIT_FLAT = /^\s*\+\s*(\d+)\s*$/;

export interface CritModifierStep {
  readonly crit: string;
  /** False when the printed column held no modifier to increase. */
  readonly applied: boolean;
}

/**
 * Raise the printed critical hit damage *modifier*.
 *
 * **What "modifier" means is settled by the book, not by us.** The Finesse trait
 * (pg 32) prints the same clause as *"the critical hit damage **multiplier**
 * either increases by 1 or the damage dice increases by 1"* — the same sentence
 * as Ergonomic Grip and melee Heavy with the word spelled out. So the branch
 * operates on the multiplier: `x2` becomes `x3`.
 *
 * **And it cannot always apply.** `crit` is a transcribed column, not a number
 * (`packs-src/EXTRACTION-NOTES.md` §1-3): most rows print `x2`…`x5`, but the
 * blunt weapons print *extra dice* (the Police Baton's `20, 1d6.`), two rows
 * print a flat `+1`/`+2`, and twelve print nothing at all because the column
 * carried only a rider effect or nothing. Rolling the dice form up a ladder
 * would be inventing a second, unprinted ladder for a column the book never
 * ranks, and there is nothing to increase in an empty column.
 *
 * **Ruling:** the multiplier and flat forms take the +1; the dice form and the
 * empty column do not, and say so (`ModStatNote` kind `noCritModifier`) so the
 * player can take the other branch of the "or" — which is precisely the branch
 * the choice exists to offer.
 */
export function stepCritModifier(crit: string, by: number): CritModifierStep {
  if (by === 0) return { crit, applied: false };
  const multiplier = CRIT_MULTIPLIER.exec(crit);
  if (multiplier !== null) {
    return { crit: `x${String(Math.max(1, Number(multiplier[1]) + by))}`, applied: true };
  }
  const flat = CRIT_FLAT.exec(crit);
  if (flat !== null) {
    return { crit: `+${String(Math.max(0, Number(flat[1]) + by))}`, applied: true };
  }
  return { crit, applied: false };
}

// ===========================================================================
// The table
// ===========================================================================

export interface ModDefinition {
  /** The printed row heading, verbatim, including the book's own casing. */
  readonly name: string;
  readonly category: ModCategory;
  /** Printed page. */
  readonly page: string;
  /**
   * "Mod Slot Total" (pg 75-77). Melee rows print no slot total at all — the
   * melee table has a flat one-mod limit instead — so they carry 0 and are
   * governed by `MELEE_MOD_LIMIT`.
   */
  readonly slots: number;
  readonly cost: ModCost;
  readonly swap: ModSwapTime;
  /** Equippable Weapons clauses; empty means "any weapon" within the table. */
  readonly allow: readonly ModAllowClause[];
  /** Weapons the column excludes by name ("except for the Flare Gun…"). */
  readonly excludedNames: readonly string[];
  /** Printed special properties the weapon must have. */
  readonly requiresProperties: readonly string[];
  /** Printed special properties the weapon must not have. */
  readonly forbidsProperties: readonly string[];
  /** Mods this one cannot share a weapon with. Recorded on both rows. */
  readonly conflicts: readonly ModKey[];
  /** Every printed clause that moves one of the weapon's own numbers. */
  readonly stats: ModStatEffects;
  readonly automation: ModAutomation;
}

/**
 * Ranged rows, pg 75-77, in printed order.
 *
 * The printed effects divide into four groups, and after D3's slice 2 exactly
 * one of them is built:
 *
 * 1. **Weapon-statistic edits** — load, Strength requirement, range modifiers,
 *    rounds, AP cost, crit chance, damage-dice rank, attack-roll total. Fifteen
 *    rows are wholly or partly this, and `stats` on each row plus `applyMods`
 *    below is the derivation. **Built.** Every clause in this group is `derived`
 *    (see `ModAutomation` for why that word is not `code`).
 * 2. **Granted special properties** — Destructive, Powerful, Accurate, Sturdy,
 *    Defensive, Breakable, Semi-Automatic. `parseKeywords` reads properties out
 *    of the *printed* `special` string, so these need a decision about whether a
 *    mod rewrites that string or is merged after the parse. Slice 3.
 * 3. **New controls** — the two turrets, On-Board Target Tracking's 6 AP mark,
 *    Speedloader's alternate reload, both capacitors' spend-extra-ammo option.
 *    Each is a button and a chat card. Slices 6-9.
 * 4. **Genuinely unautomatable here** — Lucky Charm's "each player character can
 *    only benefit from one" is an actor-scoped rule that a weapon cannot answer;
 *    Bayonet's benefit is a second attack profile on one document, and switching
 *    weapons costs no AP in this system to begin with.
 */
const RANGED_MODS: Readonly<Record<RangedModKey, ModDefinition>> = {
  // "The weapon is mounted to an immovable stand that turns and aims
  // automatically… The turret is considered a robot with 25 hit points and an AC
  // of 10." A second combatant with its own combat sequence and 10 AP a turn —
  // an NPC actor, not a weapon property. Group 3.
  autoFiringTurret: {
    name: "Auto-Firing Turret",
    category: "ranged",
    page: "75",
    slots: 3,
    cost: { kind: "percent", percent: 90 },
    swap: { kind: "minutes", base: 15, perIntelligence: 1, minimum: 0 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: {},
    automation: "text",
  },
  // "Attach a knife or combat knife to the front of the weapon, you can attack
  // with the knife without spending AP to switch weapons." Switching weapons has
  // no AP cost in this system to begin with, so the benefit is a second attack
  // profile on one document — group 1's derivation cannot express it. Text.
  bayonet: {
    name: "Bayonet",
    category: "ranged",
    page: "75",
    slots: 1,
    cost: { kind: "percent", percent: 20 },
    swap: { kind: "ap", ap: 6 },
    allow: [],
    excludedNames: [],
    requiresProperties: ["Two Handed"],
    forbidsProperties: [],
    conflicts: [],
    stats: {},
    automation: "text",
  },
  // "you can spend 2 rounds of ammunition instead of 1 to increase the damage by
  // 2." A per-attack choice: group 3 (an attack option), not a statistic.
  boostedCapacitor: {
    name: "Boosted Capacitor",
    category: "ranged",
    page: "75",
    slots: 3,
    cost: { kind: "percent", percent: 50 },
    swap: { kind: "minutes", base: 60, perIntelligence: 5, minimum: 0 },
    allow: [{ weaponTypes: ["energyWeapon"] }],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: ["overclockedCapacitor"],
    stats: {},
    // Coded end to end since the capacitors landed: `AttackOptions.capacitor`
    // declares the spend, `payableCapacitor` prices it against the magazine (and
    // refuses a weapon that tracks no rounds), `rollAttack` spends 2 rounds
    // instead of 1, and `rollDamage` adds the +2 from the same shared gate.
    automation: "code",
  },
  // "When you spend AP to attack with the weapon, it costs 1 less to a minimum
  // of 1." The whole row, and `moddedStats.apCost` computes it. `derived`: the
  // Attack control still prices the shot from the printed `system.apCost`.
  doubleAction: {
    name: "Double Action",
    category: "ranged",
    page: "76",
    slots: 2,
    cost: { kind: "percent", percent: 75 },
    swap: { kind: "minutes", base: 15, perIntelligence: 1, minimum: 0 },
    allow: [{ revolver: true }],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { apCost: -1, apCostMinimum: 1 },
    automation: "derived",
  },
  // "The weapon's critical hit damage modifier or damage dice increases by 1."
  // The "or" is a player choice and is stored, not guessed — see
  // `ModChoiceEffects` (ruling 2). `derived` rather than `partial` because both
  // branches are computed: an undeclared choice applies neither and is reported,
  // and the crit branch reports itself inapplicable on the weapons whose printed
  // Critical Hit column holds dice rather than a multiplier (`stepCritModifier`).
  ergonomicGrip: {
    name: "Ergonomic Grip",
    category: "ranged",
    page: "76",
    slots: 2,
    cost: { kind: "percent", percent: 60 },
    swap: { kind: "minutes", base: 15, perIntelligence: 1, minimum: 0 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { choice: { critModifier: 1, damageRank: 1 } },
    automation: "derived",
  },
  // "The weapon gains Destructive and Powerful. If the weapon already has
  // Destructive, then the weapon's damage dice rank increases once to a maximum
  // of d12. The weapon's load increases by 2."
  //
  // `partial`: the +2 load and the conditional rank step are derived (and the
  // maximum is the ladder's own end — ruling 3), the two granted properties are
  // slice 3. "Already has Destructive" is read against the **printed** special
  // column, not against a column this same mod is about to add to, which is what
  // "already" says and what keeps the clause from being self-satisfying.
  hardenedReceiver: {
    name: "Hardened Receiver",
    category: "ranged",
    page: "76",
    slots: 3,
    cost: { kind: "percent", percent: 120 },
    swap: { kind: "minutes", base: 60, perIntelligence: 5, minimum: 0 },
    allow: [{ weaponTypes: ["handgun", "submachineGun", "rifle", "shotgun"] }],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: ["lightBuild"],
    stats: { damageRank: 1, damageRankRequiresProperty: "Destructive", load: 2 },
    automation: "partial",
  },
  // "The weapon's attack roll total is increased by 1. The weapon's load
  // increases by 1." Both derived; the attack half is `moddedStats.attackBonus`,
  // which `rollAttack` pushes into its parts array.
  holographicSight: {
    name: "Holographic weapon sight",
    category: "ranged",
    page: "76",
    slots: 2,
    cost: { kind: "percent", percent: 60 },
    swap: { kind: "minutes", base: 5, perIntelligence: 1, minimum: 1 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: ["scope", "infraredScope"],
    stats: { attackBonus: 1, load: 1 },
    automation: "derived",
  },
  // "The weapon's range modifiers are increased by half." Note it says
  // *modifiers* — the ×PER multipliers, not the resulting feet (ruling 4).
  improvedRifling: {
    name: "Improved Rifling",
    category: "ranged",
    page: "76",
    slots: 2,
    cost: { kind: "percent", percent: 45 },
    swap: { kind: "minutes", base: 60, perIntelligence: 5, minimum: 0 },
    allow: [{ weaponTypes: ["handgun", "submachineGun", "rifle"] }],
    excludedNames: ["Flare Gun", "H&H Tools nail gun", "Railway Rifle"],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { rangeNormalFactor: 1.5, rangeLongFactor: 1.5 },
    automation: "derived",
  },
  // "The weapon's number of rounds is increased by 3." `magazineSize`.
  increasedClipSize: {
    name: "Increased Clip Size",
    category: "ranged",
    page: "76",
    slots: 1,
    cost: { kind: "percent", percent: 20 },
    swap: { kind: "ap", ap: 6 },
    allow: [{ weaponTypes: ["handgun", "submachineGun", "rifle", "shotgun"] }],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: ["Manual Reload", "Quick Reload"],
    conflicts: [],
    stats: { magazineSize: 3 },
    automation: "derived",
  },
  // "The weapon's long range modifier is tripled… attacks made at targets within
  // 30 feet are made at disadvantage. You can target creatures that are hidden,
  // shrouded, in complete darkness, or invisible… attack rolls are increased by
  // 2. Load increases by 2." `partial`: the tripled long-range *modifier*, the
  // +2 attack and the +2 load are derived here; the 30-foot disadvantage belongs
  // to slice 4 and the targeting clause to slice 5 — a real stealth-layer
  // interaction, and the second-most interesting row after the Silencer.
  infraredScope: {
    name: "Infrared Scope",
    category: "ranged",
    page: "76",
    slots: 2,
    cost: { kind: "percent", percent: 90 },
    swap: { kind: "minutes", base: 15, perIntelligence: 1, minimum: 0 },
    allow: [
      { revolver: true },
      { weaponTypes: ["rifle"] },
      { names: ["Laser Rifle", "Plasma Rifle", "Gauss Rifle"] },
    ],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: ["scope", "holographicSight"],
    stats: { rangeLongFactor: 3, attackBonus: 2, load: 2 },
    automation: "partial",
  },
  // "The weapon gains Accurate. If it already has Accurate, then whenever the
  // weapon critically hits; the damage is doubled. Load increases by 1."
  // `partial`: the +1 load is derived; the granted property is slice 3, and the
  // doubled critical damage rides on it (Accurate is not a property this system
  // parses at all yet, and the doubling is a damage-roll hook, not a statistic).
  laserSight: {
    name: "Laser Sight",
    category: "ranged",
    page: "76",
    slots: 2,
    cost: { kind: "percent", percent: 35 },
    swap: { kind: "minutes", base: 5, perIntelligence: 1, minimum: 1 },
    allow: [{ weaponTypes: ["handgun", "rifle", "energyWeapon"] }],
    excludedNames: ["Tri-Beam Laser Rifle", "Multiplas Rifle", "Gatling Laser"],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { load: 1 },
    automation: "partial",
  },
  // "Load decreases by half. Strength requirement decreases by 1. Gains
  // Breakable." `partial`: the halved load (the proportional half of ruling 1,
  // and the row that makes the ordering question real) and the −1 Strength
  // requirement are derived; Breakable is slice 3.
  lightBuild: {
    name: "Light Build",
    category: "ranged",
    page: "76",
    slots: 2,
    cost: { kind: "percent", percent: 25 },
    swap: { kind: "minutes", base: 60, perIntelligence: 5, minimum: 0 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    // Printed on both rows: "A weapon cannot have a Light Build if it is
    // Strengthened" / "cannot be Strengthened if it has a Light Build". The
    // Hardened Receiver row adds itself to the Light Build side only, and is
    // recorded on both here — a one-way conflict is a transcription error
    // waiting to happen, not a rule.
    conflicts: ["strengthen", "hardenedReceiver"],
    stats: { loadFactor: 0.5, strengthReq: -1 },
    automation: "partial",
  },
  // "Long range modifier increases by 10. Short range modifier decreases by 2.
  // Load increases by 4." The flat half of ruling 4: these are the ×PER
  // multipliers, so +10 long is enormous and −2 short is meant to hurt.
  longerBarrel: {
    name: "Longer Barrel",
    category: "ranged",
    page: "76",
    slots: 2,
    cost: { kind: "percent", percent: 35 },
    swap: { kind: "minutes", base: 15, perIntelligence: 1, minimum: 0 },
    allow: [{ weaponTypes: ["handgun", "rifle", "energyWeapon"] }],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { rangeLong: 10, rangeNormal: -2, load: 4 },
    automation: "derived",
  },
  // "The weapon's critical hit chance decreases by 1. Each player character can
  // only benefit from one lucky charm." `partial`: the crit chance is derived
  // (down, so critting is *easier* — the column is the threshold the kept d20
  // must reach); the one-per-character rule is an actor-scoped scan a weapon
  // cannot answer on its own, and is slice 11.
  luckyCharm: {
    name: "Lucky Charm",
    category: "ranged",
    page: "76",
    slots: 1,
    cost: { kind: "caps", caps: 50 },
    swap: { kind: "ap", ap: 6 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { critChance: -1 },
    automation: "partial",
  },
  // "Attack roll total increased by 1. Strength requirement decreases by 1. Load
  // increases by 2." All three derived.
  muzzleBrake: {
    name: "Muzzle Brake",
    category: "ranged",
    page: "76",
    slots: 2,
    cost: { kind: "percent", percent: 55 },
    swap: { kind: "ap", ap: 6 },
    allow: [{ weaponTypes: ["handgun", "submachineGun", "rifle", "shotgun"] }],
    excludedNames: ["Flare Gun", "H&H Tools nail gun", "Railway Rifle"],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { attackBonus: 1, strengthReq: -1, load: 2 },
    automation: "derived",
  },
  // "you can spend 6 AP to mark a target creature within the weapon's short
  // range. Attack rolls against the marked creature have advantage." Group 3 —
  // a marker effect, and `endMarkerEffect` (CL1) is already the shared shape.
  onBoardTargetTracking: {
    name: "On-Board Target Tracking",
    category: "ranged",
    page: "76",
    slots: 2,
    cost: { kind: "percent", percent: 120 },
    swap: { kind: "minutes", base: 15, perIntelligence: 1, minimum: 0 },
    allow: [{ weaponTypes: ["energyWeapon"] }],
    // "except for the Gauss rifle, Gauss pistol, or Gatling Gun."
    //
    // **There is no "Gatling Gun" in this book.** The weapon tables print a
    // *Gatling laser* (energy weapon, pg 75) and a *Minigun* (big gun); nothing
    // is called a Gatling Gun. Both names are kept: the printed one, so the
    // transcription stays faithful and a future errata or homebrew weapon under
    // that name is still excluded, and the Gatling laser, which is the only
    // Gatling-anything the row could mean — this mod fits energy weapons only,
    // and the Minigun is not one. An exclusion that matches no shipped document
    // is silently wrong, which is worse than a stated ruling.
    excludedNames: ["Gauss rifle", "Gauss pistol", "Gatling Gun", "Gatling laser"],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: {},
    // `markTarget` spends the 6 AP, checks the short range, and writes the mark
    // to the target; `rollAttack` reads it for advantage and spends it, which is
    // the ruled duration. The one thing not automated is the AP, which is never
    // deducted anywhere (backlog E1).
    automation: "code",
  },
  // "you can spend 3 rounds of ammunition instead of 1 to increase the damage by
  // 4." Group 3, same shape as Boosted Capacitor.
  overclockedCapacitor: {
    name: "Overclocked Capacitor",
    category: "ranged",
    page: "76",
    slots: 3,
    cost: { kind: "percent", percent: 110 },
    swap: { kind: "minutes", base: 60, perIntelligence: 5, minimum: 0 },
    allow: [{ weaponTypes: ["energyWeapon"] }],
    excludedNames: [],
    requiresProperties: [],
    // "Any energy weapon that doesn't have automatic or charge." Charge is not a
    // property this system parses (`parseKeywords` covers only the properties
    // with a hook); it is matched against the printed `special` text directly,
    // which is what every entry in these two lists does.
    forbidsProperties: ["Automatic", "Charge"],
    conflicts: ["boostedCapacitor"],
    stats: {},
    // The same path as the Boosted Capacitor above, at 3 rounds and +4. Which of
    // the two applies when a weapon somehow wears both is ruled at `CAPACITORS`.
    automation: "code",
  },
  // "You can spend AP to attack with a weapon that you place onto the mount. The
  // amount of AP required to attack is reduced by 2 to a minimum of 3." Group 3,
  // and the same second-combatant problem as the Auto-Firing Turret.
  remoteControlledTurret: {
    name: "Remote Controlled Turret",
    category: "ranged",
    page: "77",
    slots: 3,
    cost: { kind: "percent", percent: 175 },
    swap: { kind: "minutes", base: 15, perIntelligence: 1, minimum: 0 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: {},
    automation: "text",
  },
  // "Short range modifier is doubled and the long range modifier is quadrupled.
  // However, any attacks made at targets within 50 feet are made at
  // disadvantage. Load increases by 2." `partial`: the two multipliers and the
  // +2 load are derived here; the 50-foot disadvantage belongs to slice 4, which
  // owns both this row's and the Infrared Scope's close-range clause.
  scope: {
    name: "Scope",
    category: "ranged",
    page: "77",
    slots: 2,
    cost: { kind: "percent", percent: 30 },
    swap: { kind: "minutes", base: 15, perIntelligence: 1, minimum: 0 },
    allow: [
      { revolver: true },
      { weaponTypes: ["rifle"] },
      { names: ["Laser Rifle", "Plasma Rifle", "Gauss Rifle"] },
    ],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: ["infraredScope", "holographicSight"],
    stats: { rangeNormalFactor: 2, rangeLongFactor: 4, load: 2 },
    automation: "partial",
  },
  // "The weapon gains Semi-Automatic." Group 2 — and its consumer is deferred
  // anyway: Semi-Automatic's benefit is priced in AP, and AP deduction is
  // backlog E1.
  semiAutomatic: {
    name: "Semi-Automatic",
    category: "ranged",
    page: "77",
    slots: 3,
    cost: { kind: "percent", percent: 85 },
    swap: { kind: "minutes", base: 60, perIntelligence: 5, minimum: 0 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    // "Any weapon that doesn't have Manual Reload, Quick Reload, Automatic, Area
    // of Effect, or Energy Weapon." The last is printed as a *property* in the
    // weapon tables ("Destructive. Energy Weapon. Unwieldy.") as well as being a
    // weapon type; both are checked, the type via `allow` being empty plus this
    // text match, because a weapon can carry the property without the type.
    forbidsProperties: ["Manual Reload", "Quick Reload", "Automatic", "Area of Effect", "Energy Weapon"],
    conflicts: [],
    stats: {},
    automation: "text",
  },
  /**
   * **The proof slice.** Pg 77:
   *
   * > While you are hidden; any attack rolls you make with a weapon that has a
   * > silencer modification does not reveal your presence to nearby creatures,
   * > allowing you to remain hidden except against the creature you attacked.
   * > The weapon's load increases by 2.
   * > The weapon's damage dice rank decreases once to a minimum of d4.
   *
   * `derived`, and it is the row where that word is clearest — every printed
   * clause is now covered, and one of the three is covered all the way:
   *
   * - The **stealth clause is `code`** — the weapon's `attachedMods` answers
   *   `rollAttack`'s `silenced`, which reaches `revealAfterAttacking` and
   *   `revealedByAttacking` (pg 77 is the only sentence in the book that says
   *   what attacking does to hiding, and it says it by exception).
   * - The **+2 load and the damage-rank step-down are `derived`** as of D3's
   *   slice 2: `moddedStats` computes both, and the step-down's printed floor
   *   ("minimum of d4") is the bottom rung of the ladder in ruling 3. They reach
   *   play when the carry-load sum and the damage roll read the derived numbers
   *   instead of `system.load` and `system.damage`, which is each consumer's own
   *   one-line switch — see `slice2-integration.md`.
   *
   * So a silenced weapon in this system is quiet, and *knows* it is heavier and
   * quieter-hitting than its printed row without yet being able to prove it at a
   * table.
   */
  silencer: {
    name: "Silencer",
    category: "ranged",
    page: "77",
    slots: 2,
    cost: { kind: "percent", percent: 65 },
    swap: { kind: "ap", ap: 6 },
    allow: [{ weaponTypes: ["handgun", "submachineGun", "rifle", "shotgun"] }],
    excludedNames: ["Flare Gun", "H&H Tools nail gun", "Railway Rifle"],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { load: 2, damageRank: -1 },
    // Mixed, which is what `partial` is for. The headline clause is coded end to
    // end — `WeaponData.silenced` answers from this key and `revealAfterAttacking`
    // keeps the shooter hidden — and the +2 load reaches the Carry Load sum
    // through `effectiveLoad`. The damage-rank drop is derived only: `rollDamage`
    // still rolls the printed dice.
    automation: "partial",
  },
  // "You can choose to reload the weapon with 4 AP." Group 3 — an alternate
  // reload route through `actions`, and the only row in the table that costs no
  // mod slots at all.
  speedloader: {
    name: "Speedloader",
    category: "ranged",
    page: "77",
    slots: 0,
    cost: { kind: "caps", caps: 450 },
    // "N/A" in the Time to Equip/Unequip column.
    swap: { kind: "never" },
    allow: [{ revolver: true }],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: {},
    // Read end to end: `reloadCost` fills `alternative` from this key, the
    // weapon list shows both prices, and the Reload button says when the flat 4
    // would have been the cheaper of the two. Reported rather than substituted,
    // because AP is never deducted anywhere in this system (backlog E1) and
    // because using the speedloader is the player's choice, not a discount.
    automation: "code",
  },
  // "Attack roll total is increased by 1. Load increases by 4." Both derived —
  // and the +4 against ranged Light Build's halving is the pair that forces
  // ruling 1 (halve first, then add: 8 → 4 → 8, not (8+4)/2 = 6).
  stock: {
    name: "Stock",
    category: "ranged",
    page: "77",
    slots: 2,
    cost: { kind: "percent", percent: 45 },
    swap: { kind: "minutes", base: 15, perIntelligence: 1, minimum: 0 },
    // "Any submachine gun, rifle, shotgun, energy weapon, or revolver with the
    // long barrel modification."
    //
    // **Ruling on the trailing clause:** "with the long barrel modification"
    // attaches to "revolver" alone, not to the whole list. English puts a
    // trailing qualifier on the nearest noun, and the alternative reading would
    // make Stock require Longer Barrel on every weapon — which would in turn
    // make it illegal on a shotgun or submachine gun, since Longer Barrel does
    // not fit either. The book does not resolve it; this is the reading that
    // leaves both rows usable.
    allow: [
      { weaponTypes: ["submachineGun", "rifle", "shotgun", "energyWeapon"] },
      { revolver: true, requiresMod: "longerBarrel" },
    ],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { attackBonus: 1, load: 4 },
    automation: "derived",
  },
  // "The weapon gains Sturdy and Defensive. Load increases by 2." `partial`: the
  // +2 load is derived; the two granted properties are slice 3 — and Defensive
  // already has a live consumer (`DEFENSIVE_BLOCK_DT`), so this row lands the
  // moment granted properties reach `parseKeywords`.
  strengthen: {
    name: "Strengthen",
    category: "ranged",
    page: "77",
    slots: 3,
    cost: { kind: "percent", percent: 30 },
    swap: { kind: "minutes", base: 60, perIntelligence: 5, minimum: 0 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: ["lightBuild"],
    stats: { load: 2 },
    automation: "partial",
  },
};

/**
 * Melee rows, pg 65, in printed order.
 *
 * The melee table is shaped differently from the ranged one and the difference
 * matters:
 *
 * - **No Mod Slot column and no Equippable Weapons column.** *"All melee weapons
 *   can be customized with the following modifications, whether or not a weapon
 *   can use the mods is up to your GM."* So every row carries `slots: 0` and an
 *   empty `allow`, and the GM's discretion is the only gate — which is why
 *   `modEligibility` reports melee eligibility as satisfied by any melee weapon.
 * - **No Time to Equip column.** One blanket sentence covers all seven: *"Each
 *   modification can be switched for another with 5 minutes of time unless
 *   otherwise specified."* Four rows specify otherwise, in their own text:
 *   *"This modification is permanent and cannot be switched."*
 * - **One mod at a time**, `MELEE_MOD_LIMIT`.
 *
 * Three rows are still wholly `text`: Strengthen and Sharpened grant a property
 * and nothing else (group 2, slice 3), and Upgraded is a damage-roll hook ("roll
 * a 1 or a 2 on the damage dice → +2 damage") that needs the damage roll to
 * inspect its own dice, which nothing does today (slice 12). The other four all
 * move statistics and are derived; three of those also grant a property, so they
 * are `partial` rather than `derived`.
 *
 * The one-mod limit does real work here that it does not do on the ranged side:
 * a melee weapon can carry **at most one** proportional load change, so ruling
 * 1's ordering never has to compose Double Sided's doubling with Heavy's ×1.5.
 */
const MELEE_MODS: Readonly<Record<MeleeModKey, ModDefinition>> = {
  // "The weapon gains Durable. This modification is permanent and cannot be
  // switched."
  meleeStrengthen: {
    name: "Strengthen",
    category: "melee",
    page: "65",
    slots: 0,
    cost: { kind: "percent", percent: 55 },
    swap: { kind: "never" },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: {},
    automation: "text",
  },
  // "The weapon gains Defensive and Two Handed. Its load is doubled and its
  // Strength requirement increases by 1." `partial`: the doubled load and the +1
  // Strength requirement are derived; the two granted properties are slice 3.
  // The one melee row that is switchable and not permanent, alongside Sharpened
  // and Ergonomic.
  meleeDoubleSided: {
    name: "Double Sided",
    category: "melee",
    page: "65",
    slots: 0,
    cost: { kind: "percent", percent: 10 },
    swap: { kind: "minutes", base: 5, perIntelligence: 0, minimum: 5 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { loadFactor: 2, strengthReq: 1 },
    automation: "partial",
  },
  // "AP increases by 1 to a maximum of 6, load increases by half, Strength
  // requirement increases by 1. The weapon gains Weighted. The weapon's critical
  // hit modifier or damage dice increases by 1. Permanent."
  //
  // `partial`: the capped AP, the ×1.5 load, the +1 Strength requirement and the
  // stored "or" choice (ruling 2) are derived; Weighted is slice 3. Note the
  // printed maximum of 6 is the row's own, not a general AP ceiling — melee
  // Light Build below prints its own minimum of 3, and the two are the only
  // bounds in either table.
  meleeHeavy: {
    name: "Heavy",
    category: "melee",
    page: "65",
    slots: 0,
    cost: { kind: "percent", percent: 30 },
    swap: { kind: "never" },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: {
      apCost: 1,
      apCostMaximum: 6,
      loadFactor: 1.5,
      strengthReq: 1,
      choice: { critModifier: 1, damageRank: 1 },
    },
    automation: "partial",
  },
  // "Whenever you deal damage with the weapon and roll a 1 or a 2 on the damage
  // dice, the damage is increased by 2. Permanent."
  meleeUpgraded: {
    name: "Upgraded",
    category: "melee",
    page: "65",
    slots: 0,
    cost: { kind: "percent", percent: 75 },
    swap: { kind: "never" },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    // Not a statistic at all: it inspects the individual dice of a damage roll,
    // which nothing in this system does yet. Slice 12, and it carries its own
    // ruling (once per die, or once per roll?).
    stats: {},
    // Not a statistic at all: it inspects the individual dice of a damage roll,
    // which nothing else in this system does. `upgradedDamageBonus` (now in this
    // module) does it, `rollDamage` applies the result after the roll, and the
    // once-per-die ruling is argued there.
    automation: "code",
  },
  // "AP decreases by 1 to a minimum of 3, load decreases by half, Strength
  // requirement decreases by 1. The weapon gains Breakable. Permanent."
  // `partial`: the floored AP, the halved load and the −1 Strength requirement
  // are derived; Breakable is slice 3.
  meleeLightBuild: {
    name: "Light Build",
    category: "melee",
    page: "65",
    slots: 0,
    cost: { kind: "percent", percent: 25 },
    swap: { kind: "never" },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { apCost: -1, apCostMinimum: 3, loadFactor: 0.5, strengthReq: -1 },
    automation: "partial",
  },
  // "The weapon gains Mangle." The printed heading really does carry a trailing
  // period inside the name: "Sharpened, Serrated, or Barbed."
  meleeSharpened: {
    name: "Sharpened, Serrated, or Barbed",
    category: "melee",
    page: "65",
    slots: 0,
    cost: { kind: "percent", percent: 25 },
    swap: { kind: "minutes", base: 5, perIntelligence: 0, minimum: 5 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: {},
    automation: "text",
  },
  // "The weapon's critical chance decreases by 1." The whole row, derived — the
  // same effect as the ranged Lucky Charm without the one-per-character clause,
  // which is why that row is `partial` and this one is not.
  meleeErgonomic: {
    name: "Ergonomic",
    category: "melee",
    page: "65",
    slots: 0,
    cost: { kind: "percent", percent: 50 },
    swap: { kind: "minutes", base: 5, perIntelligence: 0, minimum: 5 },
    allow: [],
    excludedNames: [],
    requiresProperties: [],
    forbidsProperties: [],
    conflicts: [],
    stats: { critChance: -1 },
    automation: "derived",
  },
};

export const WEAPON_MODS: Readonly<Record<ModKey, ModDefinition>> = {
  ...RANGED_MODS,
  ...MELEE_MODS,
};

// ===========================================================================
// The two limits
// ===========================================================================

/** "Every ranged weapon has a total of 6 mod slots" (pg 75). */
export const RANGED_MOD_SLOTS = 6;

/** "Melee weapons can only have one modification" (pg 65). */
export const MELEE_MOD_LIMIT = 1;

/** Whether a key is one this table knows. */
export function isModKey(key: string): key is ModKey {
  return Object.prototype.hasOwnProperty.call(WEAPON_MODS, key);
}

/** Sum of the Mod Slot Totals of the attached mods (pg 75). */
export function slotsUsed(attached: readonly ModKey[]): number {
  return attached.reduce((total, key) => total + WEAPON_MODS[key].slots, 0);
}

/**
 * *"A ranged weapon ceases function if its Mod Slot total is greater than 6"*
 * (pg 75) — strictly greater, as printed, so a weapon sitting on exactly 6 is
 * fine.
 *
 * The book says nothing about what a melee weapon does when it somehow carries
 * two mods; the melee rule is a limit on attaching, not a failure state, so this
 * returns false for melee mods and `modEligibility` refuses the second one
 * instead.
 */
export function ceasesFunction(attached: readonly ModKey[]): boolean {
  return (
    slotsUsed(attached.filter((key) => WEAPON_MODS[key].category === "ranged")) > RANGED_MOD_SLOTS
  );
}

// ===========================================================================
// The Silencer — the one clause that reaches a roll
// ===========================================================================

// ===========================================================================
// The mod clauses that reach a roll (pg 65, 75-77)
// ===========================================================================
//
// Pure, and reading only mod keys, so they belong beside the rows they
// interpret. They spent one batch in `src/dice/rolls.ts` because this file was
// another agent's for the batch that added them; nothing about them ever
// depended on living there. The capacitors stayed behind, because deciding
// whether one can be *paid for* needs the weapon's magazine and `rules/` does
// not import `data/`.

/**
 * The close-range disadvantage the two scopes impose.
 *
 * - Scope (pg 77): *"any attacks made at targets within 50 feet are made at
 *   disadvantage"*.
 * - Infrared Scope (pg 76): the same sentence at *"within 30 feet"*.
 *
 * *"Within 50 feet"* includes 50 feet exactly — "within" is inclusive
 * everywhere else in the book (the Automatic chain's 10 feet, Spread's radius),
 * and reading it exclusively would leave a one-foot band the rule was clearly
 * not written to carve out.
 */
const SCOPE_CLOSE_RANGE: readonly { readonly mod: ModKey; readonly feet: number }[] = [
  { mod: "scope", feet: 50 },
  { mod: "infraredScope", feet: 30 },
];

/**
 * The widest close-range band this weapon's scopes impose on a shot at this
 * distance, or null if the shot is outside all of them.
 *
 * **Widest, if a weapon somehow carries both.** The table forbids the pair
 * (each row's "cannot have… if it already has…" is recorded in `conflicts`) and
 * `modEligibility` reports it, but nothing in this system refuses an
 * attachment, so the case is reachable. Each mod states its band independently,
 * so a weapon wearing both is at disadvantage inside the union of them — which
 * is the wider band. No ruling required; that is just what the two sentences
 * say when both are true.
 */
export function scopeCloseRange(
  attached: readonly ModKey[],
  distanceFeet: number,
): { readonly mod: ModKey; readonly feet: number } | null {
  const distance = Math.max(0, distanceFeet);
  let widest: { readonly mod: ModKey; readonly feet: number } | null = null;
  for (const band of SCOPE_CLOSE_RANGE) {
    if (!attached.includes(band.mod)) continue;
    if (distance > band.feet) continue;
    if (widest === null || band.feet > widest.feet) widest = band;
  }
  return widest;
}

/** *"…the damage is increased by 2"* — melee Upgraded, pg 65. */
export const UPGRADED_DAMAGE_BONUS = 2;

/** The die results melee Upgraded pays out on: *"roll a 1 or a 2"* (pg 65). */
export const UPGRADED_DAMAGE_RESULTS: readonly number[] = [1, 2];

/**
 * Melee **Upgraded** (pg 65): *"Whenever you deal damage with the weapon and
 * roll a 1 or a 2 on the damage dice, the damage is increased by 2."*
 *
 * **The ruling: once per qualifying die.** A `2d6` that comes up 1 and 2 is
 * +4, not +2. The sentence can be read either way and the book never says, so
 * both readings are set out:
 *
 * - *Once per damage roll.* "The damage is increased by 2" is singular and
 *   speaks about the damage of the whole roll, and "whenever you deal damage"
 *   scopes the trigger to the damage *event*, of which there is one per swing.
 *   On that reading the mod is a small flat rider that fires on a bad roll.
 * - *Once per qualifying die* — followed here. The trigger clause is "roll a 1
 *   or a 2 **on the damage dice**", and that exact phrasing is the book's own
 *   idiom for a per-die event: Weighted (pg 61) is *"When you roll a 1 on the
 *   damage dice with a weapon that has this property, **it** is a 2 instead"*
 *   and Destructive (pg 69, 78) repeats it word for word. Both replace a single
 *   die's result, and both are already implemented per-die here
 *   (`destructiveDie` in `rules/explosives.ts`). Upgraded borrows their trigger
 *   verbatim and only changes the payout, so it inherits their scope; reading
 *   the same clause per-die in two properties and per-roll in a third would be
 *   the inconsistency, not the fix. It also makes the mod worth its 75% of the
 *   weapon's cost on the multi-die weapons that can afford it, and it degrades
 *   gracefully: on a one-die weapon the two readings are identical.
 *
 * Nothing needs deciding about the interaction with Weighted, as it happens:
 * Weighted turns a 1 into a 2, and 2 qualifies too, so the count is the same
 * whichever order they apply in.
 *
 * Only **active** results count — a dropped die (a keep-highest formula, a
 * reroll) was not "rolled on the damage dice" for damage purposes, since it
 * contributes nothing to the total this clause increases.
 */
export function upgradedDamageBonus(
  dice: readonly { readonly results: readonly { readonly result: number; readonly active: boolean }[] }[],
): { readonly count: number; readonly bonus: number } {
  let count = 0;
  for (const term of dice) {
    for (const rolled of term.results) {
      if (rolled.active && UPGRADED_DAMAGE_RESULTS.includes(rolled.result)) count += 1;
    }
  }
  return { count, bonus: count * UPGRADED_DAMAGE_BONUS };
}


/**
 * Whether this set of mods keeps a hidden attacker hidden (pg 77).
 *
 * The whole point of D3's first slice: `rules/stealth.ts`'s
 * `revealedByAttacking(silenced)` used to take a boolean that no data could
 * produce, so `AttackOptions.silenced` had to be declared by the caller. It can
 * now be answered from the weapon.
 */
export function silences(attached: readonly ModKey[]): boolean {
  return attached.includes("silencer");
}

// ===========================================================================
// The derivation — a weapon's own numbers, folded through its mods
// ===========================================================================

/** Mods that print a choice, so a sheet knows which ones to ask about. */
export const MOD_CHOICE_KEYS: readonly ModKey[] = MOD_KEYS.filter(
  (key) => WEAPON_MODS[key].stats.choice !== undefined,
);

/** The printed row this fold starts from. One weapon; no actor, no document. */
export interface PrintedWeaponStats {
  readonly load: number;
  readonly strengthReq: number;
  readonly apCost: number;
  /** The threshold the kept d20 must reach. 0 means the row printed none. */
  readonly critChance: number;
  /** The Critical Hit column's value: `x3`, `2d10`, `+1`, or blank. */
  readonly crit: string;
  readonly damage: string;
  /** The ×PER *multipliers* (pg 22), not feet. 0 means the row printed none. */
  readonly rangeNormal: number;
  readonly rangeLong: number;
  /** 0 means the row printed no magazine. */
  readonly magazineSize: number;
  /** The printed special-properties column, verbatim. */
  readonly special: string;
}

/** A printed column a mod wanted to move and the weapon does not have. */
export type ModStat = "critChance" | "rangeNormal" | "rangeLong" | "magazineSize";

/**
 * Something the fold could not do, said out loud.
 *
 * The whole point of a derived number is that a player can check it, and a
 * derivation that silently drops a printed clause is worse than one that never
 * ran. Each of these has a `FALLOUT.Mods.note.*` string.
 */
export type ModStatNote =
  /** The row prints an "or" and nobody has chosen yet, so neither half applied. */
  | { readonly kind: "pendingChoice"; readonly mod: ModKey }
  /** The weapon prints nothing in that column, so there was nothing to change. */
  | { readonly kind: "notPrinted"; readonly mod: ModKey; readonly stat: ModStat }
  /** The damage expression has no d4-d12 die to step. */
  | { readonly kind: "offLadder"; readonly damage: string }
  /** The Critical Hit column holds dice or nothing, so it holds no modifier. */
  | { readonly kind: "noCritModifier"; readonly crit: string }
  /** A printed floor or ceiling — or the ladder's own end — took the change. */
  | { readonly kind: "bounded"; readonly stat: "apCost" | "damage" };

/** What the weapon's row becomes once its mods are folded in. */
export interface ModdedWeaponStats {
  readonly load: number;
  readonly strengthReq: number;
  readonly apCost: number;
  readonly critChance: number;
  readonly crit: string;
  readonly damage: string;
  readonly rangeNormal: number;
  readonly rangeLong: number;
  readonly magazineSize: number;
  /** Flat addition to the attack roll total (four rows print one). */
  readonly attackBonus: number;
  /** Attached mods whose printed "or" nobody has resolved. */
  readonly pendingChoices: readonly ModKey[];
  /** Printed clauses this fold could not apply, and why. */
  readonly notes: readonly ModStatNote[];
  /** True when anything above differs from the printed row. */
  readonly changed: boolean;
}

/**
 * The lowest crit threshold this fold will produce.
 *
 * The book prints no floor for "critical hit chance decreases by 1" and only two
 * rows apply it, so 2 is reached only by a homebrew stack. It is the last useful
 * value: `rollAttack` resolves a natural 1 as an automatic miss *before* it asks
 * about crits, so a threshold of 1 would be a crit chance that can never fire.
 *
 * It is deliberately *not* the schema's `min` on `WeaponData.critChance`, which
 * is 0 — that 0 is the "prints no critical hit" sentinel this fold checks for
 * before it applies any floor, and clamping it up to 2 is exactly the bug the
 * schema comment there describes.
 */
export const CRIT_CHANCE_MINIMUM = 2;

/**
 * `WeaponData.apCost`'s own `min`. Double Action's printed "minimum of 1" says
 * the same thing; melee Light Build prints a stricter 3 for itself.
 */
export const AP_COST_MINIMUM = 1;

/**
 * Fold a weapon's attached mods into its printed numbers.
 *
 * Pure, and total: unknown keys cannot reach it (`ModKey` is closed and
 * `WeaponData.attachedModKeys` filters through `isModKey`), a weapon with no
 * mods comes back byte-identical with `changed: false`, and nothing here reads a
 * document, an actor or `game.*`.
 *
 * The order is the one ruling 1 states, and it is applied per statistic:
 *
 * 1. Walk the attached mods in **printed table order** (`MOD_KEYS`), collecting
 *    proportional factors, flat deltas, damage-rank steps and crit-modifier
 *    steps. Nothing is applied during the walk, which is what makes the result
 *    independent of the order the mods were fitted — an order `attachedMods`
 *    does not record and the book does not ask about.
 * 2. Multiply, then add, then clamp.
 * 3. Sum the damage-rank steps and walk the ladder **once**, so that a weapon
 *    carrying both a Hardened Receiver and a Silencer ends where the arithmetic
 *    says rather than where the clamps happened to leave it.
 *
 * **A statistic the weapon does not print cannot be modified.** `critChance`,
 * `rangeNormal`, `rangeLong` and `magazineSize` all use 0 for "the book printed
 * nothing here" (`packs-src/EXTRACTION-NOTES.md` §1, and `attackRangeReport` in
 * `dice/rolls.ts` already reads a 0 long range as "this weapon has no bands").
 * A mod that would move one of those leaves it at 0 and files a `notPrinted`
 * note, rather than conjuring a 3-round magazine onto a sword. `load`,
 * `strengthReq` and `apCost` are printed for every weapon in the book, so 0 is a
 * real value there and is treated as one.
 */
export function applyMods(
  printed: PrintedWeaponStats,
  attached: readonly ModKey[],
  choices: Partial<Record<ModKey, ModChoice>> = {},
): ModdedWeaponStats {
  const notes: ModStatNote[] = [];
  const pendingChoices: ModKey[] = [];

  let loadFactor = 1;
  let loadFlat = 0;
  let strengthReq = 0;
  let apCost = 0;
  let apMinimum = AP_COST_MINIMUM;
  let apMaximum = Number.POSITIVE_INFINITY;
  let critChance = 0;
  let magazineSize = 0;
  let attackBonus = 0;
  let damageRank = 0;
  let critModifier = 0;
  let normalFactor = 1;
  let normalFlat = 0;
  let longFactor = 1;
  let longFlat = 0;

  for (const key of MOD_KEYS) {
    if (!attached.includes(key)) continue;
    const stats = WEAPON_MODS[key].stats;

    loadFactor *= stats.loadFactor ?? 1;
    loadFlat += stats.load ?? 0;
    strengthReq += stats.strengthReq ?? 0;
    apCost += stats.apCost ?? 0;
    if (stats.apCostMinimum !== undefined) apMinimum = Math.max(apMinimum, stats.apCostMinimum);
    if (stats.apCostMaximum !== undefined) apMaximum = Math.min(apMaximum, stats.apCostMaximum);
    attackBonus += stats.attackBonus ?? 0;

    if (stats.critChance !== undefined) {
      if (printed.critChance === 0) notes.push({ kind: "notPrinted", mod: key, stat: "critChance" });
      else critChance += stats.critChance;
    }
    if (stats.magazineSize !== undefined) {
      if (printed.magazineSize === 0) {
        notes.push({ kind: "notPrinted", mod: key, stat: "magazineSize" });
      } else magazineSize += stats.magazineSize;
    }
    if (stats.rangeNormalFactor !== undefined || stats.rangeNormal !== undefined) {
      if (printed.rangeNormal === 0) {
        notes.push({ kind: "notPrinted", mod: key, stat: "rangeNormal" });
      } else {
        normalFactor *= stats.rangeNormalFactor ?? 1;
        normalFlat += stats.rangeNormal ?? 0;
      }
    }
    if (stats.rangeLongFactor !== undefined || stats.rangeLong !== undefined) {
      if (printed.rangeLong === 0) notes.push({ kind: "notPrinted", mod: key, stat: "rangeLong" });
      else {
        longFactor *= stats.rangeLongFactor ?? 1;
        longFlat += stats.rangeLong ?? 0;
      }
    }
    if (stats.damageRank !== undefined) {
      // Hardened Receiver's step is conditional on the weapon *already* having
      // Destructive, which is a question about the printed column — not about
      // the column this same mod is adding to (slice 3).
      const gate = stats.damageRankRequiresProperty;
      if (gate === undefined || hasProperty(printed.special, gate)) damageRank += stats.damageRank;
    }
    if (stats.choice !== undefined) {
      const choice = choices[key];
      if (choice === "crit") critModifier += stats.choice.critModifier;
      else if (choice === "damage") damageRank += stats.choice.damageRank;
      else {
        pendingChoices.push(key);
        notes.push({ kind: "pendingChoice", mod: key });
      }
    }
  }

  // Proportional first, then flat, then the bounds (ruling 1).
  //
  // Load is left fractional on purpose: halving an odd load gives a half, and
  // this system already carries fractional loads — `AmmoData.load` is
  // `quantity / 10`, so a 3.5 is nothing new to the Carry Load sum. Rounding
  // would be a rule the book does not print.
  const load = Math.max(0, printed.load * loadFactor + loadFlat);
  const strength = Math.max(0, printed.strengthReq + strengthReq);
  // A printed bound clamps the *change*, never the starting value. "AP cost
  // decreases by 1, to a minimum of 3" is a floor the reduction stops at — it
  // cannot drag a weapon that already costs less *up* to it. Paddle Ball
  // (pg 62) is the live case: 2 AP printed, and melee Light Build's
  // `apCostMinimum: 3` used to make the mod that reduces AP raise it by one.
  // So the bound only applies from the side the change came from, and a weapon
  // already past it is left where the book left it.
  const apRaw = printed.apCost + apCost;
  let ap = apRaw;
  if (apCost < 0) ap = Math.max(Math.min(printed.apCost, apMinimum), apRaw);
  else if (apCost > 0) ap = Math.min(Math.max(printed.apCost, apMaximum), apRaw);
  if (ap !== apRaw) notes.push({ kind: "bounded", stat: "apCost" });
  const crits =
    printed.critChance === 0
      ? 0
      : Math.min(20, Math.max(CRIT_CHANCE_MINIMUM, printed.critChance + critChance));
  const magazine = Math.max(0, printed.magazineSize + magazineSize);
  // The multipliers stay fractional too — `attackRangeReport` floors the feet
  // after multiplying by Perception, and rounding here would floor twice.
  const rangeNormal = Math.max(0, printed.rangeNormal * normalFactor + normalFlat);
  const rangeLong = Math.max(0, printed.rangeLong * longFactor + longFlat);

  const stepped = stepDamageRank(printed.damage, damageRank);
  if (damageRank !== 0 && stepped.offLadder) notes.push({ kind: "offLadder", damage: printed.damage });
  if (!stepped.offLadder && stepped.stepped !== damageRank) {
    notes.push({ kind: "bounded", stat: "damage" });
  }
  const critStep = stepCritModifier(printed.crit, critModifier);
  if (critModifier !== 0 && !critStep.applied) {
    notes.push({ kind: "noCritModifier", crit: printed.crit });
  }

  return {
    load,
    strengthReq: strength,
    apCost: ap,
    critChance: crits,
    crit: critStep.crit,
    damage: stepped.formula,
    rangeNormal,
    rangeLong,
    magazineSize: magazine,
    attackBonus,
    pendingChoices,
    notes,
    changed:
      load !== printed.load ||
      strength !== printed.strengthReq ||
      ap !== printed.apCost ||
      crits !== printed.critChance ||
      critStep.crit !== printed.crit ||
      stepped.formula !== printed.damage ||
      rangeNormal !== printed.rangeNormal ||
      rangeLong !== printed.rangeLong ||
      magazine !== printed.magazineSize ||
      attackBonus !== 0,
  };
}

// ===========================================================================
// Eligibility
// ===========================================================================

/**
 * Word-boundary match of a printed property name against a `special` column.
 *
 * Used here to test the Equippable Weapons column's "any weapon that doesn't
 * have Manual Reload…" clauses, and exported because `rules/weapons.ts` carried
 * a twin of it (`hasPrintedProperty`) for the same job. The edge only runs
 * weapons → mods, and mods imports nothing from weapons, so there is no cycle.
 */
export function hasProperty(special: string, property: string): boolean {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(special);
}

/** Case- and punctuation-insensitive comparison of two printed weapon names. */
function sameName(a: string, b: string): boolean {
  const key = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[‘’']/g, "")
      .replace(/\.+\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  return key(a) === key(b);
}

/**
 * `ignoreRequiredMod` re-asks the clause with its precondition set aside, which
 * is how `modEligibility` tells "wrong kind of weapon entirely" apart from "a
 * revolver that is one Longer Barrel short of taking a Stock".
 */
function clauseAdmits(
  clause: ModAllowClause,
  weapon: ModWeapon,
  ignoreRequiredMod = false,
): boolean {
  if (
    !ignoreRequiredMod &&
    clause.requiresMod !== undefined &&
    !weapon.attached.includes(clause.requiresMod)
  ) {
    return false;
  }
  if (clause.revolver === true) return isRevolver(weapon.weaponType, weapon.name);
  if (clause.names !== undefined) {
    return clause.names.some((name) => sameName(name, weapon.name));
  }
  if (clause.weaponTypes !== undefined) return clause.weaponTypes.includes(weapon.weaponType);
  return true;
}

const MELEE_TYPES: readonly string[] = MELEE_WEAPON_TYPES;
const RANGED_TYPES: readonly string[] = RANGED_WEAPON_TYPES;

/**
 * Can this mod go on this weapon, and if not, why not.
 *
 * **Advisory, never enforcing.** Nothing in this system refuses an attachment:
 * the melee table hands the whole Equippable question to the GM outright
 * (*"whether or not a weapon can use the mods is up to your GM"*, pg 65), the
 * ranged table's own list is full of names that only exist as printed rows, and
 * a homebrew weapon is a first-class citizen everywhere else in this system.
 * This returns a report so a sheet can say "the book does not print this
 * combination" and let the person decide, which is the same posture
 * `oneHandedPenalty` and the range bands already take.
 */
export function modEligibility(key: ModKey, weapon: ModWeapon): ModEligibility {
  const mod = WEAPON_MODS[key];
  const reasons: ModIneligibility[] = [];

  if (weapon.attached.includes(key)) reasons.push({ kind: "alreadyAttached" });

  // A melee mod belongs on a melee weapon and a ranged mod on a ranged one. The
  // ranged table's several "Any weapon." cells are read as "any *ranged* weapon"
  // — the section opens "Most ranged weapons can be customized with the
  // following modifications" and its limit sentence is written about ranged
  // weapons only, so the column is scoped by its own heading.
  const isMelee = MELEE_TYPES.includes(weapon.weaponType);
  const isRanged = RANGED_TYPES.includes(weapon.weaponType);
  if ((mod.category === "melee" && !isMelee) || (mod.category === "ranged" && !isRanged)) {
    reasons.push({ kind: "category", category: mod.category });
  }

  if (mod.allow.length > 0 && !mod.allow.some((clause) => clauseAdmits(clause, weapon))) {
    // A clause that failed only on its `requiresMod` precondition is worth
    // saying out loud rather than folding into a bare "wrong weapon type" —
    // Stock on a bare revolver is a mod away from legal.
    const pending = mod.allow.find((clause) => {
      if (clause.requiresMod === undefined || weapon.attached.includes(clause.requiresMod)) {
        return false;
      }
      return clauseAdmits(clause, weapon, true);
    });
    if (pending?.requiresMod !== undefined) {
      reasons.push({ kind: "requiresMod", mod: pending.requiresMod });
    } else {
      reasons.push({ kind: "weaponType" });
    }
  }

  for (const name of mod.excludedNames) {
    if (sameName(name, weapon.name)) reasons.push({ kind: "excludedWeapon", name });
  }
  for (const property of mod.requiresProperties) {
    if (!hasProperty(weapon.special, property)) {
      reasons.push({ kind: "requiresProperty", property });
    }
  }
  for (const property of mod.forbidsProperties) {
    if (hasProperty(weapon.special, property)) {
      reasons.push({ kind: "forbidsProperty", property });
    }
  }
  for (const other of weapon.attached) {
    if (mod.conflicts.includes(other) || WEAPON_MODS[other].conflicts.includes(key)) {
      reasons.push({ kind: "conflict", mod: other });
    }
  }

  if (mod.category === "melee") {
    const meleeAttached = weapon.attached.filter(
      (other) => other !== key && WEAPON_MODS[other].category === "melee",
    );
    if (meleeAttached.length >= MELEE_MOD_LIMIT) reasons.push({ kind: "meleeLimit" });
  } else {
    const used = slotsUsed([...weapon.attached.filter((other) => other !== key), key]);
    if (used > RANGED_MOD_SLOTS) {
      reasons.push({ kind: "slots", used, limit: RANGED_MOD_SLOTS });
    }
  }

  return { ok: reasons.length === 0, reasons };
}
