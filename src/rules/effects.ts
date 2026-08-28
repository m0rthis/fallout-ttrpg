/**
 * Active Effects (Foundry v14).
 *
 * v14 reworked Active Effects substantially, verified against build 14.365 on
 * the live server rather than guessed:
 *
 * - ActiveEffect is a typed document; changes live in `system.changes`, not at
 *   the top level (the old placement still works through a shim deprecated
 *   since v14, so we author the modern shape).
 * - A change is `{key, type, value, phase, priority}`. The numeric `mode` is
 *   gone: `CONST.ACTIVE_EFFECT_MODES` is now empty and `type` is a string from
 *   `ActiveEffect.CHANGE_TYPES` — add, subtract, multiply, divide-ish
 *   (downgrade/upgrade), override, custom.
 * - Changes apply in two phases. `initial` runs before `prepareDerivedData`,
 *   `final` runs after it. Anything this system computes in
 *   `prepareDerivedData` would be clobbered by an `initial` change, so effects
 *   target real schema fields (`system.abilities.*.value`, `system.bonuses.*`)
 *   in the `initial` phase and let the derived pass fold them in. That keeps
 *   every change *guided* — validated against a real DataField — instead of
 *   relying on unguided writes into computed data.
 * - Effects on an owned item with `transfer: true` apply to the actor, and
 *   disabling or deleting the item cleanly reverts them.
 * - Durations DO expire on their own, asynchronously: core marks an elapsed
 *   effect expired and inactive a moment after world time passes it, and its
 *   changes stop applying. Nothing here removes them on a timer — doing so
 *   races core's own update. See docs/foundry-v14-notes.md.
 */

import type { SkillKey } from "./constants";

export const SYSTEM_ID = "fallout-ttrpg";

/** One entry of an Active Effect's `system.changes` array (v14 shape). */
export interface EffectChange {
  key: string;
  type: "add" | "subtract" | "multiply" | "override" | "upgrade" | "downgrade" | "custom";
  value: number;
  phase: "initial" | "final";
  priority?: number;
}

/** Build an additive change against a real schema field (guided, pre-derived). */
export function addChange(key: string, value: number): EffectChange {
  return { key, type: "add", value, phase: "initial", priority: 20 };
}

/** Bonus paths a perk, trait, or chem may target. */
export const BONUS_KEYS = [
  "ac",
  "dt",
  // Blocking's DT applies only against melee attacks (pg 127), so it needs a
  // bonus of its own rather than adding to the general one.
  "dtMelee",
  "hpMax",
  "spMax",
  "apMax",
  "carryLoad",
  "passiveSense",
  "healingRate",
  "d20",
  "damage",
  // Release 5: paths perk text names that had nothing to target (see
  // PERK-TRAIT-NOTES.md). Temporary hit points are deliberately NOT here —
  // they are a pool that damage spends, and an effect-written bonus cannot be
  // decremented, so they are a stored resource instead.
  "initiative",
  "partyNerve",
  "karmaCaps",
  // A flat penalty or bonus on **attack rolls only**, which `d20` could not
  // express: five of the pg 129 limb conditions read "−2/−5 to all attack
  // rolls", and writing those to `d20` would have docked the target's skill
  // checks and saving throws too. Consumed by `rollAttack` and by
  // `rollImprovisedAttack` — the two paths that roll to hit — and deliberately
  // not by `rollBlindAttack`, which is a Luck check the book never calls an
  // attack roll.
  "attack",
] as const;
export type BonusKey = (typeof BONUS_KEYS)[number];

export function bonusPath(key: BonusKey): string {
  return `system.bonuses.${key}`;
}

/**
 * The sentinel `system.bonuses.moveCap` holds when nothing is capping movement.
 *
 * A cap is a **minimum**, not a sum: two sources capping a creature at 30 and
 * 15 feet leave it at 15, and neither at 45 nor at whichever landed last. The
 * only Active Effect change type that composes that way is `downgrade` (take
 * the lower), and `downgrade` against the 0 every other bonus initialises to
 * would never apply — 0 is already the lowest number there is.
 *
 * So this field initialises at a distance no creature in the book moves, and
 * the derived pass reads any value below it as a real cap. The number is
 * arbitrary and is never shown; what matters is that it is above every printed
 * cap (the widest is the leg row's 30 feet) and above any speed a sane sheet
 * would name.
 */
export const MOVE_CAP_UNCAPPED = 9999;

export function moveCapPath(): string {
  return "system.bonuses.moveCap";
}

/** Cap this creature's movement at `feet`, tightest cap winning. */
export function moveCapChange(feet: number): EffectChange {
  return { key: moveCapPath(), type: "downgrade", value: feet, phase: "initial", priority: 20 };
}

export function skillBonusPath(skill: SkillKey): string {
  return `system.bonuses.skills.${skill}`;
}

/**
 * Categories a source can grant advantage or disadvantage on. The seven
 * abilities cover both ability checks and the skill checks they govern, which
 * is how the book phrases it ("all Strength ability and skill checks").
 * `attack` covers attack rolls, `initiative` combat sequence, and `all` every
 * d20 (Poisoned, and v2.1's reworked Shock).
 */
export const ADVANTAGE_CATEGORIES = [
  "strength",
  "perception",
  "endurance",
  "charisma",
  "intelligence",
  "agility",
  "luck",
  "attack",
  "initiative",
  "all",
] as const;
export type AdvantageCategory = (typeof ADVANTAGE_CATEGORIES)[number];

/**
 * Named rolls that are not ability checks and so belong to no category.
 *
 * The audit behind this list is in `packs-src/V21-NOTES-advantage.md`: of 233
 * perks and traits, exactly **one** grants advantage that is unconditional and
 * coextensive with a whole category. Reading the other 32 rejections, the
 * single most common reason is not that the grant is conditional — it is that
 * the grant is **scoped to a roll the category model cannot name**. Radiation
 * checks, death saves, addiction checks, encounter rolls, resisting a grapple:
 * each is a real, always-on, perfectly unambiguous grant that had nowhere to go.
 *
 * Adding them as scopes automates seven entries without a line of condition
 * machinery, which is why scope and condition are separated here rather than
 * lumped together as "conditional effects".
 */
export const CHECK_SCOPES = [
  /** Death Save (pg 133) — Can't Put Me Down. */
  "deathSave",
  /** Radiation check (pg 124) — Activated Actinides. */
  "radiation",
  /** Addiction check (pg 82, 89) — Chemist, Enhancement Resistant/Reliant. */
  "addiction",
  /** Travel encounter roll (pg 116) — Trailblazer's Instinct. */
  "encounter",
  /** Resisting grapple, restraint, or being knocked prone — Stonewall. */
  "resistGrapple",
  /** The pg 134 frightened check — Toughness rank 2. */
  "resistFrightened",
  /** Blind attack (pg 128) — Spray and Pray. */
  "blindAttack",
] as const;
export type CheckScope = (typeof CHECK_SCOPES)[number];

/**
 * Anything a source can grant advantage on: a category, one named skill, or one
 * named check. Written as prefixed strings so a roll can name every scope that
 * applies to it in one flat list.
 */
export type RollScope = AdvantageCategory | `skill:${SkillKey}` | `check:${CheckScope}`;

export function skillScope(skill: SkillKey): RollScope {
  return `skill:${skill}`;
}

export function checkScope(check: CheckScope): RollScope {
  return `check:${check}`;
}

/** The `system.bonuses` path a scope writes to. */
function scopePath(kind: "advantage" | "disadvantage", scope: RollScope): string {
  if (scope.startsWith("skill:")) {
    return `system.bonuses.${kind}.skills.${scope.slice("skill:".length)}`;
  }
  if (scope.startsWith("check:")) {
    return `system.bonuses.${kind}.checks.${scope.slice("check:".length)}`;
  }
  return `system.bonuses.${kind}.${scope}`;
}

export function advantagePath(scope: RollScope): string {
  return scopePath("advantage", scope);
}

export function disadvantagePath(scope: RollScope): string {
  return scopePath("disadvantage", scope);
}

/** Grant advantage on a scope through an Active Effect. */
export function advantageChange(scope: RollScope): EffectChange {
  return addChange(advantagePath(scope), 1);
}

/** Impose disadvantage on a scope through an Active Effect. */
export function disadvantageChange(scope: RollScope): EffectChange {
  return addChange(disadvantagePath(scope), 1);
}

/**
 * Situations a perk or trait can name as the condition on its grant.
 *
 * These are the conditions the rejection table actually uses, and they split
 * cleanly in two:
 *
 * - **Sheet-evaluable** (`carryingHeavy`, `irradiated`, `undamaged`): the
 *   character sheet already tracks the state, so the derived pass decides.
 * - **Declared** (everything else): "while in a settlement", "in an irradiated
 *   zone", "in low light" are fiction the sheet cannot see. These follow the
 *   pattern the environment chapter already established — a flag the table
 *   toggles — rather than being guessed at.
 *
 * Nothing here tries to evaluate a condition about the *target* ("Charisma
 * checks to interact with animals", "Speech checks with any ghoul"). Those stay
 * text, because a target is not sheet state and pretending otherwise would
 * grant advantage on rolls the book never gave.
 */
export const EFFECT_CONDITIONS = [
  /** Hoarder: while carrying at least 50 load. */
  "carryingHeavy",
  /** While you have any levels of Rads. */
  "irradiated",
  /** Keeping your Cool: while your hit points are untouched. */
  "undamaged",
  /** Declared by the table: in combat. */
  "inCombat",
  /** Declared: standing in an irradiated zone (Nuclear Reactor). */
  "inIrradiatedZone",
  /** Declared: inside a settlement (Street Rat). */
  "inSettlement",
  /** Declared: dim light or darkness (Friend of the Night). */
  "lowLight",
] as const;
export type EffectCondition = (typeof EFFECT_CONDITIONS)[number];

/** Hoarder (trait, pg 32): the load below which its disadvantage bites. */
export const HOARDER_LOAD = 50;

/** Conditions the sheet decides for itself; the rest are table declarations. */
export const DERIVED_CONDITIONS: readonly EffectCondition[] = [
  "carryingHeavy",
  "irradiated",
  "undamaged",
];

/**
 * Chem properties and what they do mechanically (pg 89). Flat numbers and
 * advantage both have fields now; what remains text-only is temporary hit
 * points and one-off restoration, which no field expresses.
 */
export const CHEM_PROPERTY_EFFECTS: Record<string, EffectChange[]> = {
  // Advantage on Strength and Endurance checks; its temporary hit points
  // equal to your level still have no field and stay in the item's text.
  anabolic: [advantageChange("strength"), advantageChange("endurance")],
  // Advantage on Charisma checks, combat sequence, and resisting frightened.
  anxiolytic: [advantageChange("charisma"), advantageChange("initiative")],
  // Advantage on all Luck checks (it also lets you flip a karma cap).
  hallucinogenic: [advantageChange("luck")],
  anesthetic: [addChange(bonusPath("dt"), 6)],
  painkilling: [addChange(bonusPath("dt"), 3)],
  psychosis: [addChange(bonusPath("damage"), 5)],
  sedative: [addChange(bonusPath("passiveSense"), 5)],
  stimulant: [addChange(bonusPath("apMax"), 1), addChange(bonusPath("d20"), 1)],
  superstimulant: [addChange(bonusPath("apMax"), 2), addChange(bonusPath("d20"), 2)],
  hyperstimulant: [addChange(bonusPath("apMax"), 4), addChange(bonusPath("d20"), 2)],
  // v2.1 (pg 89): a new property that took over the Mentats family from
  // Stimulant. +1 AP and advantage on Intelligence and Perception checks.
  // Note it grants no d20 bonus and no exhaustion immunity, unlike Stimulant.
  neurostimulant: [
    addChange(bonusPath("apMax"), 1),
    advantageChange("intelligence"),
    advantageChange("perception"),
  ],
};

/** Food and drink properties with a flat, duration-limited numeric effect (pg 82). */
export const AID_PROPERTY_EFFECTS: Record<string, EffectChange[]> = {
  energizing: [addChange(bonusPath("apMax"), 1)],
  empowering: [addChange(bonusPath("apMax"), 2)],
  spicy: [addChange(bonusPath("dt"), 3)],
  pungent: [addChange(bonusPath("dt"), 1)],
  hearty: [addChange(bonusPath("carryLoad"), 50)],
  strengthening: [addChange(bonusPath("damage"), 2)],
  caffeinated: [addChange(bonusPath("d20"), 1)],
};

/**
 * Aid properties that restore stamina the moment they are consumed, as a
 * multiple of the character's level (pg 83 for food, pg 89 for Invigorating).
 *
 * These are one-off restorations, not buffs, so they are not Active Effect
 * changes: nothing is applied *for a duration* and nothing wears off. They run
 * through `restoreStamina` in `actions/healing.ts` like every other stamina
 * gain, which is what makes Shock (pg 135) stop them.
 *
 * No shipped consumable carries two of these, so summing them is a safe reading
 * of an untested case rather than a decision the book forces.
 */
export const STAMINA_PROPERTY_LEVELS: Record<string, number> = {
  /** "stamina points equal to half your level" */
  bland: 0.5,
  invigorating: 0.5,
  /** "equal to your level" */
  tasty: 1,
  /** "equal to double your level" */
  flavorsome: 2,
  /** "equal to triple your level" */
  delicacy: 3,
};

/** Stamina a consumable's property list restores at the given level. */
export function staminaFromProperties(properties: string, level: number): number {
  let total = 0;
  for (const raw of properties.split(",")) {
    const multiplier = STAMINA_PROPERTY_LEVELS[propertyKey(raw)];
    // Halves round down, which is the book's house style everywhere it rounds.
    if (multiplier !== undefined) total += Math.floor(multiplier * level);
  }
  return total;
}

/** Normalize a printed property name ("Super Stimulant.") to a lookup key. */
export function propertyKey(property: string): string {
  return property.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Collect the numeric changes for a consumable's property list. Unknown or
 * non-numeric properties contribute nothing, which is the intended outcome.
 */
export function changesForProperties(properties: string): EffectChange[] {
  const changes: EffectChange[] = [];
  for (const raw of properties.split(",")) {
    const key = propertyKey(raw);
    if (!key) continue;
    changes.push(...(CHEM_PROPERTY_EFFECTS[key] ?? []), ...(AID_PROPERTY_EFFECTS[key] ?? []));
  }
  return changes;
}
