/**
 * The shared d20 machinery, with no dependencies on `src/actions/`.
 *
 * ## Why this module exists
 *
 * Everything here used to live in `src/dice/rolls.ts`, which is also where the
 * attack and damage rolls live — and those need the action modules: an attack
 * ends a Block (`actions/blocking`), spends a Help (`actions/combat-actions`),
 * and should reveal a hidden attacker (`actions/stealth`). The action modules,
 * in turn, need the helpers below to roll anything at all. That is a cycle, and
 * it is not a theoretical one: wiring `revealAfterAttacking` into `rollAttack`
 * made `actions/stealth` and `dice/rolls` import each other, left one side's
 * bindings undefined at module-init time, and broke *every attack in the
 * system*. It shipped, and had to be reverted (`b4bd493`).
 *
 * Splitting the layer in two removes the cycle by construction rather than by
 * care:
 *
 * - **`dice/core.ts`** (this file) — pure roll plumbing. Imports `rules/` and
 *   `data/` only. Never imports `actions/`, and must not start: that single
 *   constraint is the whole point of the file, and it is what makes the layering
 *   below acyclic.
 * - **`dice/rolls.ts`** — the rolls that *do things*: attacks, damage, death
 *   saves. Free to import `actions/`, because nothing in `actions/` imports it.
 *
 * So the dependency arrows all run one way: `rules/` → `dice/core` →
 * `actions/` → `dice/rolls` → the sheet. Three call sites had grown their own
 * inline copies of this plumbing while it was unreachable (`repairItem`, first
 * aid's Medicine check, and the combat actions), and all three silently lost
 * advantage and disadvantage by doing so — `effectiveMode` was private to a
 * module they could not import. They now share this one.
 */

import type { CharacterData, ScopeCounters } from "../data/character";
import { ABILITY_ABBREVIATIONS, type Ability, type SkillKey } from "../rules/constants";
import { ADDICTION_DC } from "../rules/chems";
import type { AdvantageCategory, CheckScope, RollScope } from "../rules/effects";
import { checkScope, skillScope } from "../rules/effects";

export type RollMode = "normal" | "advantage" | "disadvantage";

export function d20Formula(mode: RollMode): string {
  if (mode === "advantage") return "2d20kh";
  if (mode === "disadvantage") return "2d20kl";
  return "1d20";
}

/**
 * The roll mode once perks, traits, chems, and conditions have their say.
 *
 * Sources are counted per category rather than flagged, so several can stack,
 * but the outcome follows the usual d20 convention: any advantage together
 * with any disadvantage cancels to a normal roll, however many of each.
 * `all` (Poisoned, v2.1 Shock) is folded into every category.
 */
function scopeCount(counters: ScopeCounters, scope: RollScope): number {
  // The scope strings are built by `skillScope`/`checkScope` from the same key
  // lists the schema was generated from, so every branch resolves to a field
  // that exists.
  if (scope.startsWith("skill:")) {
    return counters.skills[scope.slice("skill:".length) as SkillKey];
  }
  if (scope.startsWith("check:")) {
    return counters.checks[scope.slice("check:".length) as CheckScope];
  }
  return counters[scope as AdvantageCategory];
}

export function effectiveMode(
  system: CharacterData,
  scopes: readonly RollScope[],
  requested: RollMode,
): RollMode {
  // `all` rides along with every roll: it is what Poisoned and v2.1's Shock
  // impose, and what a whole-character grant means.
  const relevant: RollScope[] = [...scopes, "all"];
  const advantage =
    requested === "advantage" ||
    relevant.some((scope) => scopeCount(system.derived.advantage, scope) > 0);
  const disadvantage =
    requested === "disadvantage" ||
    relevant.some((scope) => scopeCount(system.derived.disadvantage, scope) > 0);

  if (advantage && disadvantage) return "normal";
  if (advantage) return "advantage";
  if (disadvantage) return "disadvantage";
  return "normal";
}

/** Read the roll mode from a click's modifier keys: Shift = advantage, Ctrl = disadvantage. */
export function rollModeFromEvent(event: PointerEvent): RollMode {
  if (event.shiftKey) return "advantage";
  if (event.ctrlKey || event.metaKey) return "disadvantage";
  return "normal";
}

export function signed(value: number): string {
  return value >= 0 ? `+${String(value)}` : String(value);
}

/**
 * The modifiers every d20 roll carries: leveled conditions subtract a level
 * each (pg 135-137), and Active Effects from perks, traits, and chems add
 * their flat bonus.
 *
 * v2.1 "Unaffected by Mortal Detriments" (pg 124, 132-134): Luck rolls ignore
 * the leveled penalties entirely — hunger, dehydration, exhaustion, fatigue,
 * rads. Effect bonuses still apply. No skill in this system is governed by
 * Luck, so the exemption reaches ability checks only.
 */
export function d20Modifiers(system: CharacterData, ability?: Ability): string[] {
  const parts: string[] = [];
  if (ability !== "luck" && system.derived.d20Penalty > 0) {
    parts.push(`-${String(system.derived.d20Penalty)}`);
  }
  if (system.derived.d20Bonus !== 0) parts.push(signed(system.derived.d20Bonus));
  return parts;
}

export function skillLabel(skill: SkillKey): string {
  return game.i18n.localize(`FALLOUT.Skills.${skill}`);
}

export function modeSuffix(mode: RollMode): string {
  if (mode === "normal") return "";
  return ` (${game.i18n.localize(`FALLOUT.Roll.${mode}`)})`;
}

/** The raw face of the first (kept) d20 in an evaluated roll. */
export function keptD20(roll: foundry.dice.Roll): number {
  const firstDie = roll.dice[0];
  if (!firstDie) return 0;
  const active = firstDie.results.find((r) => r.active);
  return active?.result ?? 0;
}

export interface SkillCheckResult {
  total: number;
  raw: number;
  success: boolean;
  mode: RollMode;
}

/**
 * A skill check against a DC, returning whether it beat it.
 *
 * The same shape as `rollSkill`, but it answers a question instead of just
 * announcing a number — which is what every rule that gates on a check needs.
 *
 * `extraScopes` carries the scopes a caller knows about that the skill itself
 * does not imply — `check:resistGrapple` on an Escape, say.
 *
 * Deliberately does **not** spend a Help: `consumeHelp` lives in `actions/`,
 * which this layer cannot import (see the module comment), and the callers that
 * want it already spend it themselves. `rollSkill` in `dice/rolls.ts` is the
 * variant that does.
 */
export async function rollSkillCheck(
  actor: FoundryActor,
  system: CharacterData,
  skill: SkillKey,
  dc: number,
  mode: RollMode = "normal",
  extraScopes: RollScope[] = [],
  /**
   * Replaces the default "Skill (ABL) vs DC n" flavor. Callers that already
   * announce their own check — first aid's Medicine roll, say — pass the text
   * they were printing before, so adopting this helper does not silently
   * rewrite their chat cards. The mode suffix is appended either way, since
   * that is the part the caller could not have known.
   */
  flavor?: string,
): Promise<SkillCheckResult> {
  const bonus = system.derived.skillBonuses[skill];
  const governing = system.derived.skillAbilities[skill];
  const rolled = effectiveMode(system, [governing, skillScope(skill), ...extraScopes], mode);
  const roll = new foundry.dice.Roll(
    [d20Formula(rolled), signed(bonus), ...d20Modifiers(system)].join(" "),
  );
  await roll.evaluate();
  const raw = keptD20(roll);
  const base =
    flavor ??
    `${skillLabel(skill)} (${ABILITY_ABBREVIATIONS[governing]}) ${game.i18n.localize(
      "FALLOUT.Roll.againstDC",
      { dc },
    )}`;
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${base}${modeSuffix(rolled)}`,
  });
  return { total: roll.total, raw, success: roll.total >= dc, mode: rolled };
}

/**
 * Addiction check (pg 89): using a chem forces an Endurance ability check
 * against DC 6. On a failure you become addicted, and suffer that chem's
 * withdrawal effect whenever you are not under its influence. Robot Overclock
 * Programs use the identical check for faulty programming (pg 90).
 *
 * @returns true when the check failed and the addiction was contracted.
 */
export async function rollAddictionCheck(
  actor: FoundryActor,
  system: CharacterData,
  chemName: string,
  dc: number = ADDICTION_DC,
): Promise<boolean> {
  // Chemist and Enhancement Resistant/Reliant grant or impose on exactly this
  // roll and nothing else — a scope, not a condition (pg 82, 89).
  const rolled = effectiveMode(system, ["endurance", checkScope("addiction")], "normal");
  const parts = [
    d20Formula(rolled),
    signed(system.derived.abilityMods.endurance),
    ...d20Modifiers(system),
  ];

  const roll = new foundry.dice.Roll(parts.join(" "));
  await roll.evaluate();
  const addicted = roll.total < dc;

  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.localize(
      addicted ? "FALLOUT.Chems.addictionFailed" : "FALLOUT.Chems.addictionPassed",
      { chem: chemName, dc },
    ),
  });
  return addicted;
}
