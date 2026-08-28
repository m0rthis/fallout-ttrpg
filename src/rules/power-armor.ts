/**
 * Power Armor beyond the Defense Point pool (pg 57-59).
 *
 * The DP pool shipped in v0.9.x; this is the rest of the suit. The full
 * extraction, including 23 catalogued contradictions, is in
 * `packs-src/V21-NOTES-power-armor.md`. What matters here:
 *
 * - **Allotted time is printed per suit model, in hours** (T-45 4h, T-51 6h,
 *   T-60 4h, X-01 3h, X-02 3h), but every drain in the book is expressed in
 *   minutes, so minutes is the unit that gets stored.
 * - **The book never prints a base drain rate.** It gives a total and four
 *   named extra drains, and never says whether the total is consumed per
 *   real-time minute worn, only while active, or only in combat. So the named
 *   drains are automated and the baseline is a control the GM turns: a suit
 *   that quietly drained itself across a night's rest would destroy itself
 *   between sessions on a rule the book does not actually state.
 * - **"Overheating" is two unrelated rules sharing a name.** This one is a
 *   binary state on the *armor* whose only consequence is losing allotted
 *   time. The leveled 1-10 creature condition from Extreme Heat (pg 123, 134)
 *   is a different rule entirely and lives in `rules/hazards.ts`. Neither
 *   references the other; do not merge them.
 * - **Decay does nothing to a suit except gate radiation and DP refill.**
 *   Pg 57 exempts Power Armor from the per-level AC/DT penalty *and* from
 *   breaking at ten levels, which orphans the whole pg 92-93 broken-item
 *   chapter for suits.
 */

/** 6 AP to enter or exit a suit (pg 57). No frame, rack, or station exists. */
export const ENTER_EXIT_AP = 6;

/** 5 AP to replace the Fusion Core (pg 58). */
export const CORE_SWAP_AP = 5;

/** Spending *more than* this in one turn overheats the suit (pg 58). */
export const OVERHEAT_AP_THRESHOLD = 15;

/** Allotted time lost each time the suit cools itself (pg 58). */
export const OVERHEAT_DRAIN_MINUTES = 30;

/**
 * Core Assembly (pg 59) moves the trigger, then cheapens the cooling.
 * Rank 1 -> 18 AP, rank 2 -> 20 AP, rank 3 -> 15 minutes instead of 30.
 */
export const CORE_ASSEMBLY_THRESHOLDS = [15, 18, 20, 20] as const;
export const CORE_ASSEMBLY_MAX_RANK = 3;
export const OVERHEAT_DRAIN_MINUTES_ASSEMBLY_3 = 15;

/**
 * "If a fusion core only has 30 minutes of its allotted time, and becomes
 * overheated, the Power Armor ejects the user and ceases function" (pg 58).
 * Printed as an equality; read as "30 or fewer", because a core with 10
 * minutes left is not covered by any other sentence and the general rule would
 * take it negative.
 */
export const OVERHEAT_EJECT_MINUTES = 30;

/** The reserve between the allotted time running out and the suit dying (pg 58). */
export const EMERGENCY_RESERVE_MINUTES = 1;

/** Additional AP for a Fusion Core targeted attack (pg 58). */
export const CORE_TARGET_AP = 5;

/**
 * "each time the fusion core has taken at least 30 damage; it becomes
 * overheated" (pg 58) — in the same sentence that says the attack "deals no
 * damage". Read as a repeating cumulative threshold (30, 60, 90...) on the
 * damage the attack *would* have dealt, because "each time" is plainly
 * iterative and a single-hit reading would make the rule near-unreachable.
 * Announced as our reading on the chat card; the book does not resolve it.
 */
export const CORE_TARGET_DAMAGE_THRESHOLD = 30;

/** Ten levels, at which DP stops refilling — but the suit does NOT break (pg 57). */
export const POWER_ARMOR_DECAY_MAX = 10;

/** Below six levels of decay the wearer is immune to Radiation (pg 57). */
export const RADIATION_IMMUNE_BELOW_DECAY = 6;

/** Hydraulic Machine: "Your Strength ability score is considered 12" (pg 57). */
export const HYDRAULIC_STRENGTH = 12;

/** Longer Strides: sprinting in Power Armor covers 20 extra feet (pg 57). */
export const LONGER_STRIDES_FEET = 20;

/** Overriding the automatic cooling detonates the core (pg 58). */
export const CORE_EXPLOSION_DAMAGE = "20d10";
export const CORE_EXPLOSION_SHORT_FEET = 20;
export const CORE_EXPLOSION_LONG_FEET = 50;
export const CORE_EXPLOSION_ZONE_LEVEL = 5;

/**
 * Escaping an overridden dead core. Printed as "unless your Strength score is
 * equal to 20" — unreachable, since scores cap at 10 (pg 20) and the suit sets
 * you to 12. Kept as printed and reported rather than quietly lowered: it is a
 * defect in the book, not a rule we get to rewrite.
 */
export const OVERRIDE_ESCAPE_STRENGTH = 20;
export const OVERRIDE_ESCAPE_DECAY = 10;

/** Allotted time by suit model, in minutes (pg 58 table, read visually). */
export const ALLOTTED_MINUTES: Record<string, number> = {
  "t-45": 240,
  "t-51": 360,
  "t-60": 240,
  "x-01": 180,
  "x-02": 180,
};

/** Match a suit's name against the model table ("Power Armor: T-45" -> 240). */
export function allottedMinutesFor(name: string): number | null {
  const haystack = name.toLowerCase();
  for (const [model, minutes] of Object.entries(ALLOTTED_MINUTES)) {
    if (haystack.includes(model)) return minutes;
  }
  return null;
}

/** What a suit's decay level does to its wearer's radiation protection (pg 57). */
export type RadiationProtection = "immune" | "advantage" | "none";

export function radiationProtection(decay: number): RadiationProtection {
  if (decay < RADIATION_IMMUNE_BELOW_DECAY) return "immune";
  if (decay < POWER_ARMOR_DECAY_MAX) return "advantage";
  return "none";
}

/** The AP a turn may spend before the suit overheats, given Core Assembly rank. */
export function overheatThreshold(coreAssemblyRank: number): number {
  const rank = Math.min(Math.max(0, coreAssemblyRank), CORE_ASSEMBLY_MAX_RANK);
  return CORE_ASSEMBLY_THRESHOLDS[rank] ?? OVERHEAT_AP_THRESHOLD;
}

/** Allotted time one cooling cycle costs, given Core Assembly rank (pg 59). */
export function overheatDrainMinutes(coreAssemblyRank: number): number {
  return coreAssemblyRank >= CORE_ASSEMBLY_MAX_RANK
    ? OVERHEAT_DRAIN_MINUTES_ASSEMBLY_3
    : OVERHEAT_DRAIN_MINUTES;
}

/** Whether DP still refills when the pool empties (pg 57). */
export function refillsDefensePoints(decay: number): boolean {
  return decay < POWER_ARMOR_DECAY_MAX;
}

// ===========================================================================
// The pg 59 Power Armor Upgrades table
// ===========================================================================

/**
 * Nineteen upgrades, transcribed in `packs-src/V21-NOTES-power-armor.md` and
 * re-read from the page image before any of this was written.
 *
 * Two printed rules govern every row:
 *
 * - **Ranks are cumulative.** "Each rank grants a new ability which adds on to
 *   the previous one. IE: If you have a Rank 3 upgrade, it has the abilities of
 *   Rank 1, 2, and 3." (pg 58)
 * - **A Power Armor upgrade is not locked to a suit model** — "Power Armor
 *   upgrades can be attached to all pieces of armor unless otherwise specified"
 *   (pg 57) — and attaching or removing one takes 15 minutes, not the 1 minute
 *   a regular armor upgrade takes (pg 58 vs pg 56).
 *
 * The cumulative rule collides with how the table words two of its rows. Where
 * a rank restates a *delta* ("Passive sense increases by 5", three times) the
 * ranks plainly add: 5, 10, 20. Where a rank restates the whole sentence with a
 * bigger absolute number the book means a replacement — Sturdy on pg 57 is the
 * clearest case ("the first 2 levels of decay", then "the first 4 levels"),
 * which is a total, not a further two. Explosive Shielding is written that way
 * (5, 10, 15) and is read as totals here. **Prism shielding is written the same
 * way but does not escalate** (5, 5, 10): read as totals, buying rank 2 for
 * 1,800 caps would do nothing at all, so it is read as a delta instead —
 * 5, 10, 20. The book does not resolve this; the two readings are one constant
 * apart and both tables are right below.
 */
export type PowerArmorUpgrade =
  | "explosiveShielding"
  | "prismShielding"
  | "emergencyProtocols"
  | "kineticDynamo"
  | "teslaCoils"
  | "reactivePlates"
  | "coreAssembly"
  | "jetPack"
  | "sensorArray"
  | "vatsMatrix"
  | "internalDatabase"
  | "targetingHud"
  | "headlamp"
  | "rustyKnuckles"
  | "optimizedBracers"
  | "calibratedShocks"
  | "overclockHydraulics"
  | "explosiveVent"
  | "superMutantFitting";

/**
 * How far this system takes an upgrade — the honest half of the table.
 *
 * - `code` — the rule is enforced by this module.
 * - `control` — a person presses something and the suit's state changes.
 * - `effect` — an Active Effect against a real bonus path, synced by
 *   `syncPowerArmorEffects`.
 * - `helper` — the arithmetic is here and correct, but the place that must
 *   apply it (the damage pipeline, the targeted-attack table, the attack roll)
 *   is not part of this subsystem. Reported, not enforced.
 * - `text` — deliberately not automated. The reason is on the constant.
 */
export type UpgradeAutomation = "code" | "control" | "effect" | "helper" | "text";

export interface PowerArmorUpgradeDefinition {
  /** Ranks the pg 59 table prints. */
  readonly maxRank: number;
  /** Base cost in caps, or null for Super Mutant Fitting ("50% base cost"). */
  readonly cost: number | null;
  readonly automation: UpgradeAutomation;
}

export const POWER_ARMOR_UPGRADES: Readonly<
  Record<PowerArmorUpgrade, PowerArmorUpgradeDefinition>
> = {
  explosiveShielding: { maxRank: 3, cost: 1350, automation: "helper" },
  prismShielding: { maxRank: 3, cost: 1800, automation: "helper" },
  emergencyProtocols: { maxRank: 2, cost: 1800, automation: "effect" },
  kineticDynamo: { maxRank: 1, cost: 2400, automation: "control" },
  teslaCoils: { maxRank: 3, cost: 2400, automation: "control" },
  reactivePlates: { maxRank: 3, cost: 2700, automation: "helper" },
  coreAssembly: { maxRank: 3, cost: 2250, automation: "code" },
  jetPack: { maxRank: 1, cost: 6000, automation: "control" },
  sensorArray: { maxRank: 3, cost: 4500, automation: "effect" },
  vatsMatrix: { maxRank: 2, cost: 2700, automation: "helper" },
  internalDatabase: { maxRank: 1, cost: 2400, automation: "control" },
  targetingHud: { maxRank: 3, cost: 1800, automation: "text" },
  headlamp: { maxRank: 3, cost: 250, automation: "text" },
  rustyKnuckles: { maxRank: 1, cost: 100, automation: "text" },
  optimizedBracers: { maxRank: 3, cost: 1700, automation: "control" },
  calibratedShocks: { maxRank: 3, cost: 1000, automation: "effect" },
  overclockHydraulics: { maxRank: 3, cost: 1950, automation: "control" },
  explosiveVent: { maxRank: 3, cost: 1250, automation: "control" },
  superMutantFitting: { maxRank: 1, cost: null, automation: "code" },
};

export const POWER_ARMOR_UPGRADE_KEYS = Object.keys(
  POWER_ARMOR_UPGRADES,
) as PowerArmorUpgrade[];

/**
 * Core Assembly shipped before there was anywhere to put nineteen ranks, and
 * the sheet, the derived pass, and the smoke suite all read
 * `system.coreAssemblyRank`. Moving it would break saved worlds for nothing, so
 * it keeps its own field and every other upgrade lives under `upgradeRanks`.
 */
export const LEGACY_RANK_UPGRADE: PowerArmorUpgrade = "coreAssembly";

export const NESTED_UPGRADE_KEYS: readonly PowerArmorUpgrade[] =
  POWER_ARMOR_UPGRADE_KEYS.filter((key) => key !== LEGACY_RANK_UPGRADE);

/** The update path a rank is written to. */
export function upgradeRankPath(key: PowerArmorUpgrade): string {
  return key === LEGACY_RANK_UPGRADE
    ? "system.coreAssemblyRank"
    : `system.upgradeRanks.${key}`;
}

/** Clamp a stored rank into the range the table actually prints. */
export function clampRank(rank: number, key: PowerArmorUpgrade): number {
  return Math.min(Math.max(0, Math.floor(rank)), POWER_ARMOR_UPGRADES[key].maxRank);
}

/** Read a cumulative per-rank table, with rank 0 meaning "not installed". */
function byRank(table: readonly number[], rank: number): number {
  return table[Math.min(Math.max(0, Math.floor(rank)), table.length - 1)] ?? 0;
}

// -------------------------------------------------------------- Tesla Coils

/** "Spend 3 AP to activate or deactivate" (pg 59). */
export const TESLA_ACTIVATE_AP = 3;
/** "each creature within 10 feet of you" (pg 59). */
export const TESLA_RADIUS_FEET = 10;
export const TESLA_DAMAGE_TYPE = "electricity";

/**
 * Damage by rank: 1d6, "increases by 1d6", "increases by 2d6" (pg 59).
 * It lands "when you activate and at the start of their turns" — the targets'
 * turns, not the wearer's, which is why activation rolls damage immediately.
 */
export const TESLA_DAMAGE = ["", "1d6", "2d6", "4d6"] as const;

/**
 * Allotted time per round active: 10, then "an additional 5", then "an
 * additional 10" (pg 59) — cumulative, so 10 / 15 / 25.
 *
 * **When a round is charged is not printed.** "For each round active" is
 * charged here on activation and again at the start of each of the wearer's
 * turns while the coils are still on, which is the only cadence this system can
 * see; a suit that switched them on and off between turns would otherwise fly
 * for free.
 */
export const TESLA_DRAIN_MINUTES = [0, 10, 15, 25] as const;

export function teslaCoilDamage(rank: number): string {
  const index = Math.min(Math.max(0, Math.floor(rank)), TESLA_DAMAGE.length - 1);
  return TESLA_DAMAGE[index] ?? "";
}

export function teslaCoilDrain(rank: number): number {
  return byRank(TESLA_DRAIN_MINUTES, rank);
}

// ------------------------------------------------------------------ Jet Pack

/** "You can spend 1 AP on your turn to fly 5 feet" (pg 59). */
export const JET_PACK_AP_PER_FEET = 5;
/**
 * "For every 10 feet you fly **or every second that you fly** you use 1 minute
 * of the fusion core's allotted time" (pg 59).
 *
 * The two halves of that sentence are different rates — a round is not measured
 * in seconds anywhere in this book's combat chapter, and the distance clause is
 * the one that can be metered, so distance is what is charged. Partial
 * increments round *up*: at 1 AP the smallest possible flight is 5 feet, and
 * rounding down would make half of every flight free, which cannot be the
 * intent of a drain rule.
 */
export const JET_PACK_FEET_PER_MINUTE = 10;

export function jetPackApCost(feet: number): number {
  return Math.ceil(Math.max(0, feet) / JET_PACK_AP_PER_FEET);
}

export function jetPackDrainMinutes(feet: number): number {
  return Math.ceil(Math.max(0, feet) / JET_PACK_FEET_PER_MINUTE);
}

// ------------------------------------------------------------ Explosive vent

/** "If you fall at least 15 feet … you can choose to activate" (pg 59). */
export const EXPLOSIVE_VENT_FALL_FEET = 15;
/** "Remove 20 minutes from the armor's allotted time each time" (pg 59). */
export const EXPLOSIVE_VENT_DRAIN_MINUTES = 20;
/** 3d6 fire *and* 3d6 explosive, each +1d6 at rank 2 (pg 59). */
export const EXPLOSIVE_VENT_DAMAGE = ["", "3d6", "4d6", "4d6"] as const;
/** Two separate damage types, rolled separately (pg 59). */
export const EXPLOSIVE_VENT_DAMAGE_TYPES: readonly string[] = ["fire", "explosive"];
/** 20 feet, "the radius increases by 10 feet" at rank 3 (pg 59). */
export const EXPLOSIVE_VENT_RADIUS = [0, 20, 20, 30] as const;

export function explosiveVentDamage(rank: number): string {
  const index = Math.min(Math.max(0, Math.floor(rank)), EXPLOSIVE_VENT_DAMAGE.length - 1);
  return EXPLOSIVE_VENT_DAMAGE[index] ?? "";
}

export function explosiveVentRadius(rank: number): number {
  return byRank(EXPLOSIVE_VENT_RADIUS, rank);
}

// --------------------------------------------------- Flat, always-on numbers

/** "Passive sense increases by 5 / by 5 / by 10" (pg 59) — cumulative. */
export const SENSOR_ARRAY_SENSE = [0, 5, 10, 20] as const;
/** "Carry Load increases by 15 / by 15 / by 20" (pg 59) — cumulative. */
export const CALIBRATED_SHOCKS_LOAD = [0, 15, 30, 50] as const;

export function sensorArraySense(rank: number): number {
  return byRank(SENSOR_ARRAY_SENSE, rank);
}

export function calibratedShocksLoad(rank: number): number {
  return byRank(CALIBRATED_SHOCKS_LOAD, rank);
}

// ------------------------------------------------------------------ Shielding

/** "Reduce explosive damage taken by 5 / by 10 / by 15" (pg 59), as totals. */
export const EXPLOSIVE_SHIELDING_REDUCTION = [0, 5, 10, 15] as const;
/**
 * "Reduce laser and plasma damage taken by 5 / by 5 / by 10" (pg 59), read
 * cumulatively — see the header note: as totals, rank 2 would buy nothing.
 */
export const PRISM_SHIELDING_REDUCTION = [0, 5, 10, 20] as const;

/** Damage types Prism shielding names (pg 59). */
export const PRISM_DAMAGE_TYPES: readonly string[] = ["laser", "plasma"];
export const EXPLOSIVE_DAMAGE_TYPE = "explosive";

/**
 * Flat damage reduction a suit's shielding gives against one damage type.
 *
 * The book does not say whether the reduction lands before or after Defense
 * Points, nor whether it can reduce a hit below zero. It is a reduction of
 * "damage taken", so the natural place is the top of the damage pipeline, and
 * it floors at zero rather than healing anyone.
 */
export function shieldingReduction(
  damageType: string,
  explosiveRank: number,
  prismRank: number,
): number {
  const type = damageType.trim().toLowerCase();
  if (type === EXPLOSIVE_DAMAGE_TYPE) return byRank(EXPLOSIVE_SHIELDING_REDUCTION, explosiveRank);
  if (PRISM_DAMAGE_TYPES.includes(type)) return byRank(PRISM_SHIELDING_REDUCTION, prismRank);
  return 0;
}

// ------------------------------------------------------- Emergency protocols

/** Rank 1: "spend 1 AP to move 10 feet" while under half hit points (pg 59). */
export const EMERGENCY_MOVE_AP = 1;
export const EMERGENCY_MOVE_FEET = 10;
/**
 * Rank 2: "your DT increases by 5 (only for damage against HP)" (pg 59).
 *
 * The parenthetical is already how this system works — DT is subtracted after
 * Defense Points and stamina, from the damage that reaches hit points — so the
 * general `dt` bonus path expresses it exactly.
 *
 * "If you start your turn with less than half your hit points" gives a trigger
 * and no duration. Read as *while* under half, re-evaluated at the start of
 * each turn and on every sync; the book does not say whether the DT persists
 * through a turn in which you are healed above half.
 */
export const EMERGENCY_PROTOCOLS_DT = 5;
export const EMERGENCY_PROTOCOLS_DT_RANK = 2;

/** Whether the wearer is under the half-hit-point line the upgrade names. */
export function belowHalfHitPoints(hp: number, hpMax: number): boolean {
  return hp * 2 < hpMax;
}

// ------------------------------------------------------ Overclock Hydraulics

/** Rank 1 while overheated, and rank 3 unconditionally: +2 maximum AP (pg 59). */
export const OVERCLOCK_AP_BONUS = 2;
/** Rank 2: "You can spend 3 AP to overheat the fusion core" (pg 59). */
export const OVERCLOCK_OVERHEAT_AP = 3;
/** Rank 1's other halves, which have no field to live in (pg 59). */
export const OVERCLOCK_MOVE_FEET = 15;
export const OVERCLOCK_MOVE_AP = 1;
export const OVERCLOCK_UNARMED_DAMAGE = "3d6";
export const OVERCLOCK_UNARMED_TYPE = "fire";

/**
 * Maximum-AP bonus from Overclock Hydraulics.
 *
 * Ranks add on (pg 58), so a rank 3 suit that is also overheated carries both
 * halves: +2 always, +2 more while overheated.
 */
export function overclockApBonus(rank: number, overheated: boolean): number {
  const clamped = clampRank(rank, "overclockHydraulics");
  return (clamped >= 3 ? OVERCLOCK_AP_BONUS : 0) + (clamped >= 1 && overheated ? OVERCLOCK_AP_BONUS : 0);
}

// ------------------------------------------------------------ Kinetic dynamo

/**
 * "You gain an additional AP at the start of your turn for each level of decay
 * the power armor gained since your last turn" (pg 59).
 *
 * One AP per level, which requires remembering the decay the suit had at the
 * wearer's last turn — hence `decayLastTurn` on the suit. Note the loop the
 * book never acknowledges: emptying the Defense Point pool decays the suit,
 * which hands back AP, which can push a turn over the overheat threshold, which
 * drains the core.
 */
export const KINETIC_DYNAMO_AP_PER_DECAY = 1;

export function kineticDynamoAP(rank: number, decayGained: number): number {
  if (clampRank(rank, "kineticDynamo") < 1) return 0;
  return Math.max(0, Math.floor(decayGained)) * KINETIC_DYNAMO_AP_PER_DECAY;
}

// ----------------------------------------------------------- Reactive Plates

/**
 * "the attacker takes a quarter (rounded down) of the damage they dealt", and
 * at rank 2 "another quarter (rounded down) … (effectively half of the total)"
 * (pg 59).
 *
 * The printed arithmetic and the printed gloss disagree: two quarters each
 * rounded down is not half of an odd total (7 damage gives 1 + 1 = 2, not 3).
 * The mechanic is kept and the gloss is not, because "rounded down" is stated
 * twice and "effectively half" is an aside.
 *
 * Rank 3 knocks the attacker back 15 feet instead of adding a third quarter.
 */
export const REACTIVE_PLATES_KNOCKBACK_FEET = 15;

export function reactivePlatesReflected(rank: number, damage: number): number {
  const clamped = clampRank(rank, "reactivePlates");
  const quarters = Math.min(clamped, 2);
  return quarters * Math.floor(Math.max(0, damage) / 4);
}

export function reactivePlatesKnocksBack(rank: number): boolean {
  return clampRank(rank, "reactivePlates") >= 3;
}

// -------------------------------------------------------- VATS matrix overlay

/**
 * "Whenever you make a targeted attack roll, reduce the additional AP cost by
 * 1" per rank, to a maximum of rank 2 (pg 59).
 *
 * It says *the additional* AP cost, which is the surcharge the pg 129 table
 * charges (+5 eyes, +3 head, +2 torso) and the +5 for a Fusion Core — not the
 * weapon's own cost. Floored at zero: the book gives no floor, and a negative
 * surcharge would refund AP for aiming.
 */
export function vatsTargetedApCost(surcharge: number, rank: number): number {
  return Math.max(0, surcharge - clampRank(rank, "vatsMatrix"));
}

/** The additional AP a Fusion Core targeted attack costs this attacker (pg 58-59). */
export function fusionCoreTargetAp(vatsRank: number): number {
  return vatsTargetedApCost(CORE_TARGET_AP, vatsRank);
}

// ----------------------------------------------------- The reported remainder

/** "you can spend 6 AP on your turn to learn its HP total, SP total, AC, or DT" (pg 59). */
export const INTERNAL_DATABASE_AP = 6;
export const INTERNAL_DATABASE_STATS = ["hp", "sp", "ac", "dt"] as const;
export type InternalDatabaseStat = (typeof INTERNAL_DATABASE_STATS)[number];

/** Targeting HUD: 3 AP to mark, 1 marked creature, +2 more at rank 2 (pg 59). */
export const TARGETING_HUD_AP = 3;
export const TARGETING_HUD_MARKS = [0, 1, 3, 3] as const;
export const TARGETING_HUD_DICE = [0, 1, 1, 2] as const;

export function targetingHudMarks(rank: number): number {
  return byRank(TARGETING_HUD_MARKS, rank);
}

export function targetingHudDice(rank: number): number {
  return byRank(TARGETING_HUD_DICE, rank);
}

/** Headlamp: 1 AP, a 40 ft bright cone and 40 ft more of dim, +10 per rank (pg 59). */
export const HEADLAMP_AP = 1;
export const HEADLAMP_FEET = [0, 40, 50, 60] as const;
export const HEADLAMP_BLIND_FEET = 5;

export function headlampFeet(rank: number): number {
  return byRank(HEADLAMP_FEET, rank);
}

/** Optimized bracers: 6 AP for 2d6 bludgeoning, +1d6 per rank, 15 ft push at 3 (pg 59). */
export const OPTIMIZED_BRACERS_AP = 6;
export const OPTIMIZED_BRACERS_DAMAGE = ["", "2d6", "3d6", "4d6"] as const;
export const OPTIMIZED_BRACERS_PUSH_FEET = 15;
export const OPTIMIZED_BRACERS_TYPE = "bludgeoning";

export function optimizedBracersDamage(rank: number): string {
  const index = Math.min(
    Math.max(0, Math.floor(rank)),
    OPTIMIZED_BRACERS_DAMAGE.length - 1,
  );
  return OPTIMIZED_BRACERS_DAMAGE[index] ?? "";
}

// ============================================================= pg 57 and pg 9-11

/**
 * Who may climb into a suit.
 *
 * - Robots: "you cannot use power armor." (pg 9) — flat, no exception.
 * - Super Mutants: "you cannot use power armor unless it is specifically modded
 *   to your body type" (pg 11), and the mod is the Super Mutant Fitting upgrade
 *   (pg 59).
 * - A fitted suit: "humans and ghouls can no longer use the armor" (pg 59).
 *
 * The exclusion list on a fitted suit names **humans and ghouls only**. It says
 * nothing about Gen-2 Synths, so they are not blocked here — the printed list is
 * followed literally rather than widened to "everyone but super mutants", which
 * the book could have written and did not.
 */
export type PowerArmorEntry = "ok" | "robot" | "needsFitting" | "fittedOut";

export const FITTING_EXCLUDED_RACES: readonly string[] = ["human", "ghoul"];

export function powerArmorEntry(race: string, fitted: boolean): PowerArmorEntry {
  if (race === "robot") return "robot";
  if (race === "superMutant") return fitted ? "ok" : "needsFitting";
  return fitted && FITTING_EXCLUDED_RACES.includes(race) ? "fittedOut" : "ok";
}

/** "You can spend 5 action points on your turn to sprint … 50 feet in a line" (pg 126). */
export const SPRINT_BASE_FEET = 50;

/** Longer Strides: "If you sprint in Power Armor, you move an additional 20 feet" (pg 57). */
export function sprintFeet(inPowerArmor: boolean): number {
  return SPRINT_BASE_FEET + (inPowerArmor ? LONGER_STRIDES_FEET : 0);
}

/**
 * Hydraulic Machine's other half: "your size is Large" (pg 57).
 *
 * Kept as a constant and reported, not enforced. Nothing in this system tracks
 * a creature's size, and the only printed consumers of size are the grapple
 * rules (pg 63: a creature one category larger is not grappled unless the
 * grappler's Strength is 10; two categories or more cannot be grappled at all)
 * and Help (pg 126). Both live outside this subsystem.
 */
export const POWER_ARMOR_SIZE = "Large";

export interface CoreDrain {
  /** Allotted time left after the drain. */
  minutes: number;
  /** The suit dipped into its one-minute emergency reserve. */
  onReserve: boolean;
  /** The reserve is gone: the suit opens up, ejects its user, and stops. */
  ceased: boolean;
}

/**
 * Spend allotted time, staging the pg 58 shutdown.
 *
 * Allotted time runs out, one minute of emergency reserve carries the wearer,
 * then the suit opens its back, lets them out, and ceases function. The reserve
 * is modelled as the last minute of the pool so a single number tracks all of
 * it — the book gives the reserve no separate clock.
 */
export function drainCore(minutes: number, spent: number): CoreDrain {
  const left = Math.max(0, minutes - Math.max(0, spent));
  return {
    minutes: left,
    onReserve: left > 0 && left <= EMERGENCY_RESERVE_MINUTES,
    ceased: left === 0,
  };
}
