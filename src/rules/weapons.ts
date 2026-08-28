/**
 * Weapon special properties (melee glossary pg 60-61, ranged pg 69-70).
 *
 * The book prints these as a free-text column — "Powerful. Semi-Automatic
 * Spread. Two Handed." — and the compendium keeps that text verbatim rather
 * than normalising it, because several entries carry prose no field captures
 * ("If the target admits they are a communist, the weapon always critically
 * hits"). Automating a property therefore starts by *finding* it in that
 * string, with regexes rather than token equality: "Two Handed" appears 45
 * times, "Two-Handed" once, and the Fire Axe separates its properties with
 * commas where every other row uses periods.
 *
 * Only the properties with a mechanical hook here are parsed. The rest stay
 * text on the item, which is the honest outcome for rules like Cleave that need
 * a target's state to resolve.
 *
 * Dismember used to be on that list and no longer is: v2.0 made it inflict "a
 * random arm or leg condition", which is target state, while v2.1 reprints it
 * as an AP discount on the attacker's own targeted attack — decidable from the
 * weapon and the chosen limb alone. Its sever-at-0-HP clause, unchanged in both
 * editions, still stays text.
 *
 * Two glossaries, not one: several names appear in both with **different**
 * text. `Two Handed` is the one that matters here — the melee version costs
 * you disadvantage, the ranged version also puts you on the ground.
 */

import { ABILITY_MAX } from "./constants";
// One runtime edge, and it only runs this way: `mods.ts` imports nothing from
// here, so there is no cycle. `hasProperty` used to have a twin in this file
// (`hasPrintedProperty`) — same four-line regex, same job of testing the
// Equippable Weapons column's "any weapon that doesn't have Manual Reload…"
// clauses — and the twin is gone.
import { hasProperty, type ModKey } from "./mods";

/** What the parser found in a weapon's printed special column. */
export interface WeaponKeywords {
  /** `Automatic: N` — the number of *free* additional attacks (pg 69). */
  automatic: number | null;
  /** `Automatic: N (Switch)` — a 3 AP toggle between single-shot and auto. */
  automaticSwitch: boolean;
  /** A separate property from Automatic, despite the name (pg 70). */
  semiAutomatic: boolean;
  spread: boolean;
  twoHanded: boolean;
  /** Reload for 4 AP instead of 6 (pg 70). Unchanged from v2.0. */
  quickReload: boolean;
  /** Reworked in v2.1: pay what you like, minimum 3 AP, 1 round per AP. */
  manualReload: boolean;
  /** Reload for 10 AP instead of 6 (pg 70). */
  slowReload: boolean;
  /** Decays every fifth reload instead of every tenth (pg 70). */
  unstable: boolean;
  /** "If you block while holding this weapon, your DT increases by 2." */
  defensive: boolean;
  /** Both ranges halved when held one-handed (pg 70). */
  kickback: boolean;
  /** Disadvantage one-handed unless the Perception *score* is 10 (pg 70). */
  unwieldy: boolean;
  /**
   * v2.1 rework (melee glossary, pg 60-61): targeted attacks to an arm or a leg
   * with this weapon cost no additional AP. v2.0 (pg 57-58) instead inflicted a
   * random arm or leg condition.
   */
  dismember: boolean;
  /**
   * v2.1's replacement for the deleted Corroded condition (pg 69): damage that
   * reaches a creature's hit points decays their armor.
   */
  corrosive: boolean;
  /**
   * True when the weapon prints `Automatic:` with something other than a
   * number — the Assault Rifle's second line reads "Automatic: Unstable".
   * Reported so a homebrew weapon cannot silently become a zero-shot burst.
   */
  automaticIrregular: boolean;
}

const AUTOMATIC = /\bautomatic:\s*(\d+)/i;
const AUTOMATIC_ANY = /\bautomatic:/i;
const AUTOMATIC_SWITCH = /\bautomatic:\s*\d+\s*\(\s*switch\s*\)/i;
const SEMI_AUTOMATIC = /\bsemi[-\s]?automatic\b/i;
const SPREAD = /\bspread\b/i;
const TWO_HANDED = /\btwo[-\s]?handed\b/i;
const QUICK_RELOAD = /\bquick\s+reload\b/i;
const MANUAL_RELOAD = /\bmanual\s+reload\b/i;
const SLOW_RELOAD = /\bslow\s+reload\b/i;
const UNSTABLE = /\bunstable\b/i;
const DEFENSIVE = /\bdefensive\b/i;
const KICKBACK = /\bkickback\b/i;
const UNWIELDY = /\bunwieldy\b/i;
const DISMEMBER = /\bdismember\b/i;
const CORROSIVE = /\bcorrosive\b/i;

/** Read the mechanical keywords out of a weapon's printed special column. */
export function parseKeywords(special: string): WeaponKeywords {
  const text = special;
  const automaticMatch = AUTOMATIC.exec(text);
  return {
    automatic: automaticMatch?.[1] === undefined ? null : Number(automaticMatch[1]),
    automaticSwitch: AUTOMATIC_SWITCH.test(text),
    // "Semi-Automatic" never carries the colon, so the two cannot collide.
    semiAutomatic: SEMI_AUTOMATIC.test(text),
    spread: SPREAD.test(text),
    twoHanded: TWO_HANDED.test(text),
    quickReload: QUICK_RELOAD.test(text),
    manualReload: MANUAL_RELOAD.test(text),
    slowReload: SLOW_RELOAD.test(text),
    unstable: UNSTABLE.test(text),
    defensive: DEFENSIVE.test(text),
    kickback: KICKBACK.test(text),
    unwieldy: UNWIELDY.test(text),
    dismember: DISMEMBER.test(text),
    corrosive: CORROSIVE.test(text),
    automaticIrregular: AUTOMATIC_ANY.test(text) && automaticMatch === null,
  };
}

// ------------------------------------------- properties granted by mods

/**
 * The special properties a modification grants (pg 65, 75-77) — D3 slice 3.
 *
 * Ten of the thirty-one rows print "The weapon gains …":
 *
 * - **Hardened Receiver** (pg 76) — Destructive *and* Powerful.
 * - **Laser Sight** (pg 76) — Accurate.
 * - **Light Build** (pg 76) — Breakable.
 * - **Semi-Automatic** (pg 77) — Semi-Automatic; the row and the property share
 *   a name, which is why the key vocabulary and the property vocabulary are
 *   deliberately different things.
 * - **Strengthen** (pg 77) — Sturdy *and* Defensive.
 * - **melee Strengthen** (pg 65) — Durable.
 * - **melee Double Sided** (pg 65) — Defensive *and* Two Handed.
 * - **melee Heavy** (pg 65) — Weighted.
 * - **melee Light Build** (pg 65) — Breakable.
 * - **melee Sharpened, Serrated, or Barbed** (pg 65) — Mangle.
 *
 * ## Merged after the parse, never written back onto the weapon
 *
 * The design question this slice had to answer is whether attaching a mod
 * *rewrites* `WeaponData.special` — appending "Defensive." to the printed
 * string — or whether the grant is merged with the parse result on read. It is
 * merged, for three reasons, in increasing order of how much they matter:
 *
 * 1. `special` is a **transcription**. Every other printed column in this system
 *    is stored exactly as the book prints it and derived from, never edited in
 *    place; the free-text `mods` string sitting next to it exists precisely so
 *    that nothing has to scribble on the transcription. A rewrite would also be
 *    irreversible in the way that matters: detaching the mod would have to find
 *    and unpick its own edit out of a string a GM may have since typed into.
 * 2. It would need a migration (backlog E2) and a document write on attach, and
 *    an attach that writes two fields can leave one of them written.
 * 3. **The book has two rules that a rewrite would make unanswerable.** Hardened
 *    Receiver reads *"The weapon gains Destructive and Powerful. **If the weapon
 *    already has Destructive**, then the weapon's damage dice rank increases
 *    once to a maximum of d12"*, and Laser Sight *"gains Accurate. **If it
 *    already has Accurate**, then whenever the weapon critically hits; the
 *    damage is doubled"*. "Already has" means *printed*, before this mod — and
 *    once the grant has been merged into the string, the two are indistinguish-
 *    able. Merging keeps both readings available: `parseKeywords(special)` is
 *    what the weapon came with, `weaponKeywords(special, attached)` is what it
 *    is now, and the difference is exactly the "already has" test. (Both of
 *    those conditional clauses are themselves still text — one is the damage
 *    dice ladder that D3 slice 2 owns, the other a crit-damage doubling in the
 *    dice layer. This slice grants the properties; it does not claim the
 *    branches that hang off them.)
 *
 * The properties are stored as their **printed names** rather than as
 * `WeaponKeywords` field names because eight of the ten have no field: this
 * system parses only the properties with a mechanical hook, and Destructive,
 * Powerful, Accurate, Sturdy, Breakable, Durable, Weighted and Mangle have none
 * yet. Keeping the printed name means those eight are still *reportable* today
 * (`grantedProperties`, `effectiveSpecial`) and become mechanical the day their
 * property gets a regex, with no edit to this table.
 */
export const MOD_GRANTED_PROPERTIES: Readonly<Partial<Record<ModKey, readonly string[]>>> = {
  hardenedReceiver: ["Destructive", "Powerful"],
  laserSight: ["Accurate"],
  lightBuild: ["Breakable"],
  semiAutomatic: ["Semi-Automatic"],
  strengthen: ["Sturdy", "Defensive"],
  meleeStrengthen: ["Durable"],
  meleeDoubleSided: ["Defensive", "Two Handed"],
  meleeHeavy: ["Weighted"],
  meleeLightBuild: ["Breakable"],
  meleeSharpened: ["Mangle"],
};

/**
 * Every property this set of mods grants, printed names, de-duplicated and in
 * attachment order.
 *
 * A melee weapon can only carry one mod (pg 65) and no two ranged rows grant the
 * same property, so the de-duplication is defensive rather than load-bearing —
 * but `attachedModKeys` is filtered from stored flags that a hand-edited world
 * can put anything into, and a card reading "Defensive, Defensive" is a bug
 * report waiting to happen.
 */
export function grantedProperties(attached: readonly ModKey[]): string[] {
  const granted: string[] = [];
  for (const key of attached) {
    for (const property of MOD_GRANTED_PROPERTIES[key] ?? []) {
      if (!granted.includes(property)) granted.push(property);
    }
  }
  return granted;
}

/**
 * The weapon's mechanical properties **as modified** — the read every consumer
 * of `parseKeywords` should move to.
 *
 * The granted names are run through `parseKeywords` themselves rather than
 * mapped onto fields by hand. That is the whole reason the table above stores
 * printed names: there is then exactly one place in this system that knows how a
 * printed property name becomes a flag (the regexes above), so a property that
 * gains a hook later — Sturdy's decay clause, say — starts arriving from mods
 * with no edit here at all. The alternative, a second name→field mapping, is a
 * mapping that can drift from the first one silently.
 *
 * Booleans are OR-ed: a mod can only ever *add* a property, since no row in
 * either table removes one. The two non-boolean fields are taken from the
 * printed column alone and deliberately so — `automatic` carries a count that no
 * mod grants (the Semi-Automatic row is a different property that forbids
 * Automatic outright), and `automaticIrregular` is a transcription warning about
 * `special`, which mods do not change.
 *
 * **Universal since the handoff.** `WeaponData.keywords` (`src/data/items.ts`)
 * calls this rather than `parseKeywords(this.special)`, so every existing
 * consumer — the attack roll's Two Handed check, the sheet, the block — reads
 * mod-granted properties without knowing this function exists. Call it directly
 * only where there is no `WeaponData` to hand.
 */
export function weaponKeywords(special: string, attached: readonly ModKey[] = []): WeaponKeywords {
  const printed = parseKeywords(special);
  const granted = grantedProperties(attached);
  if (granted.length === 0) return printed;
  const gained = parseKeywords(granted.map((property) => `${property}.`).join(" "));
  return {
    automatic: printed.automatic,
    automaticSwitch: printed.automaticSwitch,
    semiAutomatic: printed.semiAutomatic || gained.semiAutomatic,
    spread: printed.spread || gained.spread,
    twoHanded: printed.twoHanded || gained.twoHanded,
    quickReload: printed.quickReload || gained.quickReload,
    manualReload: printed.manualReload || gained.manualReload,
    slowReload: printed.slowReload || gained.slowReload,
    unstable: printed.unstable || gained.unstable,
    defensive: printed.defensive || gained.defensive,
    kickback: printed.kickback || gained.kickback,
    unwieldy: printed.unwieldy || gained.unwieldy,
    dismember: printed.dismember || gained.dismember,
    corrosive: printed.corrosive || gained.corrosive,
    automaticIrregular: printed.automaticIrregular,
  };
}

/**
 * The special column as it should be *shown*: the printed text, plus whatever
 * the attached mods add that it does not already say.
 *
 * Derived on read and never stored — this is the display half of the merge
 * decision above. A property the weapon already prints is not repeated, which
 * is also the visible half of the "already has Destructive / already has
 * Accurate" test: a Hardened Receiver on a weapon whose column changes is a
 * weapon that did not already have it.
 */
export function effectiveSpecial(special: string, attached: readonly ModKey[] = []): string {
  const added = grantedProperties(attached).filter(
    (property) => !hasProperty(special, property),
  );
  if (added.length === 0) return special;
  const printed = special.trim();
  const suffix = added.map((property) => `${property}.`).join(" ");
  return printed.length === 0 ? suffix : `${printed} ${suffix}`;
}

// --------------------------------------------------------------- reloading

/**
 * What a reload costs.
 *
 * Manual Reload was reworked this edition (pg 70):
 *
 * > When you reload a weapon with this property, you can choose how much AP
 * > you spend to reload but you must spend at least 3. You reload 1 round for
 * > every AP spent to reload.
 *
 * v2.0 let you load one round for 1 AP with no floor. v2.1 keeps the 1 AP : 1
 * round rate and adds a 3 AP floor, which makes it a *partial-reload* option
 * rather than a discount — fully loading a 10-round rifle costs 10 AP, worse
 * than the plain 6.
 *
 * **The patch notes describe a different mechanic** ("at least 3 AP, and each
 * additional round is 1 AP", i.e. 3 AP for one round). The book wins, as it has
 * every other time the two have disagreed.
 */
/**
 * A second reload the weapon offers *as well as* its printed one — today only
 * the Speedloader (pg 77), D3 slice 7.
 *
 * `mod` travels with the AP so a card can name what is offering the choice
 * rather than printing a bare number the player has to account for.
 */
export interface ReloadAlternative {
  readonly ap: number;
  readonly mod: ModKey;
}

export type ReloadCost =
  | { kind: "flat"; ap: number; alternative: ReloadAlternative | null }
  | { kind: "manual"; minimumAp: number; alternative: ReloadAlternative | null };

export const RELOAD_AP_FLAT = 6;
export const RELOAD_AP_QUICK = 4;
export const RELOAD_AP_SLOW = 10;
export const RELOAD_AP_MANUAL_MINIMUM = 3;

/** *"You can choose to reload the weapon with 4 AP"* — Speedloader, pg 77. */
export const RELOAD_AP_SPEEDLOADER = 4;

/**
 * What a reload costs, and what else it could cost.
 *
 * **The Speedloader is an alternative, not a replacement**, and the book is
 * unusually clear about it: *"You can **choose** to reload the weapon with 4
 * AP."* Overwriting the printed cost would be wrong in both directions here,
 * and the pg 77 Equippable column is what proves it — the Speedloader fits
 * *"any revolver"*, and every revolver the book prints (Pipe, .357 Magnum, .44
 * Magnum, Ranger Sequoia) carries **Manual Reload**. So the real decision at the
 * table is: 3 AP for three rounds under Manual Reload, or 4 AP for the whole
 * cylinder with the Speedloader. Collapsing the two into a single number would
 * hide the 3 AP floor from a player who only wants two rounds back — and taking
 * the *minimum* of the two would report 3 AP for what a Speedloader does in 4.
 *
 * `alternative` is therefore reported beside the printed cost and never
 * substituted for it. It is `null` rather than absent because
 * `exactOptionalPropertyTypes` is on and a nullable field is what the rest of
 * this system's schemas use for "known to be nothing".
 */
export function reloadCost(
  keywords: WeaponKeywords,
  attached: readonly ModKey[] = [],
): ReloadCost {
  const alternative: ReloadAlternative | null = attached.includes("speedloader")
    ? { ap: RELOAD_AP_SPEEDLOADER, mod: "speedloader" }
    : null;
  if (keywords.manualReload) {
    return { kind: "manual", minimumAp: RELOAD_AP_MANUAL_MINIMUM, alternative };
  }
  if (keywords.quickReload) return { kind: "flat", ap: RELOAD_AP_QUICK, alternative };
  if (keywords.slowReload) return { kind: "flat", ap: RELOAD_AP_SLOW, alternative };
  return { kind: "flat", ap: RELOAD_AP_FLAT, alternative };
}

/**
 * The fewest AP that fully reloads the weapon — the printed cost, or the
 * Speedloader's 4 if it is cheaper.
 *
 * Manual Reload is the case that makes this worth a function rather than a
 * `Math.min`: its `minimumAp` is a *floor on a partial* reload, not the price of
 * a full one, so a full magazine under Manual Reload costs one AP per round.
 * That is `magazineSize` AP, which this function cannot know — so a Manual
 * Reload weapon reports the Speedloader's flat 4 when it has one and its own
 * floor otherwise, and the caller that knows the magazine can still do better.
 */
export function fullReloadAp(cost: ReloadCost, magazineSize?: number): number {
  const printed =
    cost.kind === "flat"
      ? cost.ap
      : Math.max(cost.minimumAp, Math.ceil(magazineSize ?? cost.minimumAp));
  return cost.alternative === null ? printed : Math.min(printed, cost.alternative.ap);
}

/**
 * Rounds a Manual Reload buys, capped at what the magazine can still take.
 *
 * The 3 AP floor is larger than three weapons' entire capacity — the Single
 * Shotgun holds one round, the Sawed-off and Double Barrel two — and the book
 * neither forbids the overspend nor refunds it. The surplus AP is forfeit, and
 * `wastedAp` reports how much, so a player can see the rework's rough edge
 * rather than wonder where their AP went.
 */
export function manualReloadRounds(
  ap: number,
  needed: number,
): { rounds: number; wastedAp: number } {
  const spent = Math.max(RELOAD_AP_MANUAL_MINIMUM, Math.floor(ap));
  const rounds = Math.min(spent, Math.max(0, needed));
  return { rounds, wastedAp: spent - rounds };
}

/**
 * Reloads between decay levels (pg 66): every tenth, or every fifth for an
 * Unstable weapon.
 *
 * The base rule is printed as "when you reload it for the **tenth** time",
 * which read strictly fires once and never again. Unstable's phrasing — "every
 * five times you reload it **instead of ten**" — is what settles it as a
 * repeating cycle, and that is how this system has always counted it.
 *
 * A Manual Reload complicates the count in a way the book does not address: one
 * Reload action, one AP, or one round could each be "a reload". This counts the
 * **action**, which is the only reading under which the property does not
 * shred the weapon.
 */
export const RELOAD_DECAY_INTERVAL = 10;
export const RELOAD_DECAY_INTERVAL_UNSTABLE = 5;

export function reloadDecayInterval(keywords: WeaponKeywords): number {
  return keywords.unstable ? RELOAD_DECAY_INTERVAL_UNSTABLE : RELOAD_DECAY_INTERVAL;
}

// ------------------------------------------------------------- two handed

/** Extra AP to attack one-handed with a Two Handed weapon (pg 61, 70). */
export const TWO_HANDED_AP = 2;
/**
 * "if your Strength ability score is greater than Strength requirement by at
 * least 3, you can wield [it] with one hand without having disadvantage".
 */
export const TWO_HANDED_STRENGTH_MARGIN = 3;

export interface OneHandedPenalty {
  /** Disadvantage unless the extra AP is paid (melee) or is paid (ranged). */
  disadvantage: boolean;
  /** The AP that buys the penalty off, or that the ranged rule demands. */
  extraAp: number;
  /** Ranged only: you fall prone after attacking if you did not pay. */
  prone: boolean;
  /** True when Strength alone lifts the penalty. */
  exempt: boolean;
}

/**
 * The cost of using a Two Handed weapon in one hand.
 *
 * The two glossaries differ, and the difference is not cosmetic:
 *
 * - **Melee (pg 61):** "you have disadvantage on the attack roll unless you
 *   spend 2 additional AP to attack."
 * - **Ranged (pg 70):** "you must spend an additional 2 AP. Otherwise you have
 *   disadvantage on the attack roll and after you attack you fall prone."
 *
 * Both are read the same way here — pay 2 AP or take the penalty — but only the
 * ranged one puts you on the ground for skipping it.
 *
 * The Strength exemption's wording waives "disadvantage ... or falling prone"
 * and pointedly does not mention the AP, which read literally leaves a strong
 * character still owing 2 AP for an exemption that then buys nothing. Read as
 * waiving the whole package, since the alternative makes the clause dead text.
 */
export function oneHandedPenalty(
  strengthScore: number,
  strengthReq: number,
  ranged: boolean,
): OneHandedPenalty {
  const exempt = strengthScore >= strengthReq + TWO_HANDED_STRENGTH_MARGIN;
  if (exempt) return { disadvantage: false, extraAp: 0, prone: false, exempt: true };
  return { disadvantage: true, extraAp: TWO_HANDED_AP, prone: ranged, exempt: false };
}

// ------------------------------------------------------- automatic, spread

/** Extra Automatic attacks must land within this of the *previous* target. */
export const AUTOMATIC_CHAIN_FEET = 10;

/** Spread catches everything within this of the primary target (pg 70). */
export const SPREAD_RADIUS_FEET = 5;

/** Switching an Automatic (Switch) weapon between its two modes (pg 69). */
export const AUTOMATIC_SWITCH_AP = 3;

/** Blocking with a Defensive weapon in hand adds this much DT (pg 61, 70). */
export const DEFENSIVE_BLOCK_DT = 2;

// ---------------------------------------------------------------- unwieldy

/**
 * Unwieldy (pg 70): "this weapon gives you disadvantage if you use one hand
 * unless your Perception is 10."
 *
 * A Perception **score** of 10, not a modifier — the property is written
 * against the printed character maximum (`ABILITY_MAX`), which is why it names
 * a single number rather than a threshold. Read here as "10 or more": creature
 * scores run to 20 (`ABILITY_MAX_CREATURE`), and an equality test would hand
 * the penalty back to anything sharper-eyed than a person, which is not a rule
 * the book states anywhere.
 *
 * Unlike Two Handed there is no AP that buys this off and no Strength
 * exemption: one hand, Perception under 10, disadvantage. Which hand the weapon
 * is in stays the player's declaration (`WeaponData.oneHanded`), exactly as it
 * is for Two Handed.
 */
export const UNWIELDY_PERCEPTION = ABILITY_MAX;

export function unwieldyDisadvantage(perceptionScore: number): boolean {
  return perceptionScore < UNWIELDY_PERCEPTION;
}
