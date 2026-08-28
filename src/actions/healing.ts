/**
 * The gates every restoration passes through — one per pool.
 *
 * Several separate rules can refuse to give a character a pool back, and until
 * this module existed none of them was enforced anywhere except inside
 * `rest()`:
 *
 * - **Shock** (pg 135) blocks the regaining of stamina points outright.
 * - **Radiation** (pg 124) locks a portion of both pools until the last level
 *   of Rads clears, which is what `derived.spHealableMax` and
 *   `derived.hpHealableMax` express.
 * - **Bleeding** (pg 133) redirects hit-point healing into shedding two levels
 *   of the condition instead.
 *
 * Enforcing those at each call site is how you end up with a Shocked character
 * eating a Tasty meal and getting stamina anyway. So every path that restores
 * stamina goes through `restoreStamina`, and every path that restores hit
 * points goes through `restoreHitPoints`.
 *
 * ## Why two functions rather than one
 *
 * Hit points get a **sibling gate in this module**, not a shared one, because
 * the two pools are refused by different rules and refused in different
 * *shapes*. Shock names stamina points and nothing else; pg 133's redirect
 * names hit points and nothing else, and it does not merely reduce the healing
 * — it spends it on something else entirely, so its return value has to carry a
 * second write (the new Bleeding level) that a stamina gain has no analogue
 * for. Folding both into one function would mean a `pool: "hp" | "sp"`
 * parameter and a body that branches on it at every step, which is two
 * functions wearing one name. One module, one doorway per pool, is the shape
 * that keeps each rule readable next to its citation.
 *
 * These functions are **pure**: they return the values to write and the lines
 * to say, and never touch the document. Callers batch their own `actor.update`
 * (see `useAid`, which builds one update out of a dozen rules), and a helper
 * that wrote on its own would break that batching and fire a second render.
 */

import type { CharacterData } from "../data/character";
import { heldBreath } from "./movement";

export interface StaminaGain {
  /** Points actually gained, after every limit. */
  restored: number;
  /** The stamina value to write. Unchanged from current when nothing landed. */
  value: number;
  /** Shock refused it (pg 135). */
  blocked: boolean;
  /** Radiation-locked stamina capped it short of the full amount (pg 124). */
  capped: boolean;
  /** Chat lines explaining anything that got in the way. */
  notes: string[];
}

/** Shock stops a creature regaining stamina points (pg 135). */
export function staminaRegainBlocked(actor: FoundryActor): boolean {
  return (actor.statuses ?? new Set<string>()).has("shock");
}

/**
 * Work out what a stamina restoration is actually worth.
 *
 * `ceiling` overrides the healable maximum for callers that know the character
 * is about to lose maximum stamina in the same action — resting off a drink is
 * the case that exists (see `rest`), where filling to the drunk ceiling and
 * then sobering up would leave stamina above the new maximum.
 */
export function restoreStamina(
  actor: FoundryActor,
  system: CharacterData,
  amount: number,
  options: { ceiling?: number } = {},
): StaminaGain {
  const current = system.resources.sp.value;
  const wanted = Math.max(0, Math.floor(amount));
  if (wanted === 0) {
    return { restored: 0, value: current, blocked: false, capped: false, notes: [] };
  }

  if (staminaRegainBlocked(actor)) {
    return {
      restored: 0,
      value: current,
      blocked: true,
      capped: false,
      notes: [game.i18n.localize("FALLOUT.Shock.staminaBlocked")],
    };
  }

  const healable = system.derived.spHealableMax;
  const ceiling = Math.max(0, Math.min(options.ceiling ?? healable, healable));
  const value = Math.max(current, Math.min(ceiling, current + wanted));
  const restored = value - current;

  // Only call it capped when the radiation lock is what did it. Being already
  // full is not a rule getting in the way, and saying so on every chat card
  // would train players to ignore the line.
  const capped = restored < wanted && system.resources.sp.locked > 0 && value >= healable;
  return {
    restored,
    value,
    blocked: false,
    capped,
    notes: capped ? [game.i18n.localize("FALLOUT.Radiation.staminaBlocked")] : [],
  };
}

// ===========================================================================
// Hit points
// ===========================================================================

/**
 * "…instead they remove **two** levels of bleeding" (pg 133). Flat, regardless
 * of how much healing was refused: one hit point and fifty buy the same two
 * levels, and the book prices it per *act of healing*, not per point.
 */
export const BLEEDING_HEAL_REDIRECT_LEVELS = 2;

export interface HitPointGain {
  /** Hit points actually gained, after every limit. */
  restored: number;
  /** The hit-point value to write. Unchanged from current when nothing landed. */
  value: number;
  /** Pg 133 sent the healing into Bleeding instead of hit points. */
  redirected: boolean;
  /** Levels of Bleeding actually shed. */
  bleedingShed: number;
  /** The Bleeding level to write. Equal to the current level when nothing moved. */
  bleedingValue: number;
  /** Radiation-locked hit points capped it short of the full amount (pg 124). */
  capped: boolean;
  /** Chat lines explaining anything that got in the way. */
  notes: string[];
}

/** Whether pg 133's redirect would fire on this creature right now. */
export function bleedingRedirectsHealing(system: CharacterData): boolean {
  return system.conditions.bleeding > 0;
}

/**
 * Work out what a hit-point restoration is actually worth.
 *
 * ## The pg 133 redirect
 *
 * > If a creature who has any levels of bleeding is healed, they do not gain
 * > any hit points, instead they remove two levels of bleeding.
 *
 * The trigger is simply *having levels of Bleeding* — not being at full
 * health, not the healing coming from a particular source. So any restoration
 * that reaches this gate on a bleeding creature is converted, and the hit
 * points are refused outright rather than reduced.
 *
 * **The one printed exemption is stabilising a dying creature** (pg 131), which
 * opens by setting itself against healing: *"The best way to save a creature
 * with 0 hit points is to heal it. **If healing is unavailable**, the creature
 * can at least be stabilized."* The book treats the two as different acts in
 * the paragraph that defines the action, so `stabilizeCreature` writes its 1
 * hit point directly instead of coming through here — the ruling and its
 * reasoning are at `packs-src/V21-NOTES-first-aid.md` F4, and it is an
 * inference from a contrast rather than a printed exclusion. `bleedingRedirect:
 * false` is how a caller declares it is doing something the book does not call
 * healing; nothing else in this system passes it.
 *
 * ## Three silences, none invented around
 *
 * - **Stamina is untouched.** The sentence says "gains no hit points" and says
 *   nothing about stamina points, so `restoreStamina` does not consult
 *   Bleeding at all. A Tasty meal still feeds a bleeding character.
 * - **A disease floor can make the redirect a dead end.** Pg 120 lets a disease
 *   lock levels of a condition in place, and `derived.conditionFloors` is where
 *   that lives. If every level of Bleeding is held, the redirect has nothing to
 *   remove — and the hit points are still refused, because pg 133's trigger is
 *   only *having* levels. The two rules collide and the book resolves neither,
 *   so the collision is said on the card rather than smoothed away. No shipped
 *   disease locks Bleeding today.
 * - **Healing that lands on nobody still counts.** Healing a bleeding creature
 *   that is already at its maximum hit points sheds the two levels: the rule
 *   refuses the hit points as its *first* clause, and nothing conditions it on
 *   the hit points having anywhere to go.
 */
/**
 * Whether the creature has run out of air (pg 118).
 *
 * "A creature that is suffocating can't regain hit points or be stabilized
 * until it can breathe again." The breath clock lives in `actions/movement.ts`
 * as a marker effect a person advances; a creature is suffocating once that
 * marker has passed from held breath into the suffocation countdown.
 */
export function suffocating(actor: FoundryActor): boolean {
  const breath = heldBreath(actor);
  return breath !== null && breath.suffocating !== null;
}

export function restoreHitPoints(
  actor: FoundryActor,
  system: CharacterData,
  amount: number,
  options: { bleedingRedirect?: boolean } = {},
): HitPointGain {
  const current = system.resources.hp.value;
  const bleeding = system.conditions.bleeding;
  const wanted = Math.max(0, Math.floor(amount));
  const idle: HitPointGain = {
    restored: 0,
    value: current,
    redirected: false,
    bleedingShed: 0,
    bleedingValue: bleeding,
    capped: false,
    notes: [],
  };

  // Out of air: "a creature that is suffocating can't regain hit points or be
  // stabilized until it can breathe again" (pg 118). Refused here rather than
  // at each caller, which is the entire reason this gate exists.
  if (wanted > 0 && suffocating(actor)) {
    return { ...idle, notes: [game.i18n.localize("FALLOUT.Movement.healingSuffocating")] };
  }
  if (wanted === 0) return idle;

  if ((options.bleedingRedirect ?? true) && bleeding > 0) {
    const floor = system.derived.conditionFloors.bleeding ?? 0;
    const bleedingValue = Math.max(floor, bleeding - BLEEDING_HEAL_REDIRECT_LEVELS);
    const shed = bleeding - bleedingValue;
    return {
      ...idle,
      redirected: true,
      bleedingShed: shed,
      bleedingValue,
      notes: [
        game.i18n.localize(
          shed > 0 ? "FALLOUT.Bleeding.healRedirect" : "FALLOUT.Bleeding.healRedirectFloor",
          { refused: wanted, shed, levels: bleedingValue },
        ),
      ],
    };
  }

  // Radiation damage cannot be healed until the last level of Rads clears
  // (pg 124), so the ceiling is the healable maximum rather than the raw one.
  const healable = system.derived.hpHealableMax;
  const value = Math.max(current, Math.min(healable, current + wanted));
  const restored = value - current;

  // Only called capped when the radiation lock is what did it — being already
  // at full hit points is not a rule getting in the way, and saying so on every
  // card would train players to ignore the line. Same test `restoreStamina`
  // applies to its own pool, and for the same reason.
  const capped = restored < wanted && system.resources.hp.locked > 0 && value >= healable;
  return {
    ...idle,
    restored,
    value,
    capped,
    notes: capped ? [game.i18n.localize("FALLOUT.Radiation.healingBlocked")] : [],
  };
}

/**
 * The updates a `HitPointGain` wants written, ready to merge into a caller's
 * batch. Empty when nothing moved, so a caller can tell "nothing happened"
 * from "something happened and landed on zero".
 */
export function hitPointUpdates(gain: HitPointGain): Record<string, number> {
  const updates: Record<string, number> = {};
  if (gain.restored > 0) updates["system.resources.hp.value"] = gain.value;
  if (gain.bleedingShed > 0) updates["system.conditions.bleeding"] = gain.bleedingValue;
  return updates;
}
