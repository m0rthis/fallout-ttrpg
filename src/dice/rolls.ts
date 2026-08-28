import type { CharacterData } from "../data/character";
import type { WeaponData } from "../data/items";
import { critThreshold, rangeBand, weaponRange, type RangeBand } from "../rules/formulas";
import {
  blocksTargeting,
  coverAcBonus,
  CREATURE_COVER_HIT_MAX,
  explosiveExposure,
  hitsCoveringCreature,
  type CoverDegree,
} from "../rules/cover";
import { rangeMultiplier } from "../actions/environment";
import { ABILITY_ABBREVIATIONS, SKILLS, type SkillKey } from "../rules/constants";
import {
  d20Formula,
  d20Modifiers,
  effectiveMode,
  keptD20,
  modeSuffix,
  signed,
  skillLabel,
  type RollMode,
} from "./core";
import {
  dealsDamage,
  limbLabelKey,
  limbRowKey,
  severeInjuryFor,
  targetedApCost,
  targetedConditionCount,
  type LimbKey,
  halvesRange,
} from "../rules/targeted";
import { robotTypeOf } from "../rules/robots";
import {
  blindAttackApplies,
  blindAttackDC,
  NO_CONCEALMENT,
  SPRAY_AND_PRAY,
  type Concealment,
} from "../rules/stealth";
import { DEATH_SAVE_DC, deathSaveFailureLimit } from "../rules/constants";
import { MINIMUM_DAMAGE } from "../rules/diseases";
import { currentPartyNerve } from "../rules/party";
import { bulkyNote, decayItem } from "../actions/decay";
import { noteActionPoints } from "../combat/action-points";
import { endBlocking } from "../actions/blocking";
import { consumeHelp } from "../actions/combat-actions";
import {
  concealmentPresentedTo,
  consumeTargetMark,
  leaveCover,
  markedByTracking,
  revealAfterAttacking,
  sneakAttackPosture,
} from "../actions/stealth";
import { hasPerk } from "../actions/perks";
import { targetedApWithVats } from "../actions/power-armor";
import {
  AUTOMATIC_CHAIN_FEET,
  oneHandedPenalty,
  SPREAD_RADIUS_FEET,
  TWO_HANDED_STRENGTH_MARGIN,
  unwieldyDisadvantage,
  UNWIELDY_PERCEPTION,
} from "../rules/weapons";
import { checkScope, skillScope } from "../rules/effects";
import {
  scopeCloseRange,
  upgradedDamageBonus,
  WEAPON_MODS,
  type ModKey,
} from "../rules/mods";
import {
  improvisedThrowRange,
  improvisedTier,
  isUnprintedLoadGap,
} from "../rules/improvised";

/**
 * The rolls that *do things* — attacks, damage, death saves — as opposed to the
 * plumbing they share, which lives in `./core`. This module is free to import
 * `src/actions/`; `./core` is not, and that asymmetry is what keeps the two
 * layers acyclic. See the comment at the top of `./core` for the history.
 *
 * The plumbing is re-exported below so that existing importers of this module
 * keep working unchanged.
 */
export {
  d20Formula,
  d20Modifiers,
  effectiveMode,
  keptD20,
  modeSuffix,
  rollAddictionCheck,
  rollModeFromEvent,
  rollSkillCheck,
  signed,
  skillLabel,
  type RollMode,
  type SkillCheckResult,
} from "./core";

/**
 * Everything an attack can be beyond a plain swing.
 *
 * ## Why cover and distance are declared, not measured
 *
 * Both are facts about a *pair of tokens on a scene*, which is exactly the kind
 * of state this system has repeatedly refused to guess at: a perk that grants
 * advantage "against any ghoul" stays text (`src/rules/effects.ts`), a Fusion
 * Core hit is reported by the person who landed it
 * (`src/actions/power-armor.ts`), and the sneak-attack card states its
 * condition rather than resolving it, because the target's AC is not something
 * an attacker's sheet can see. Cover and range are the same shape of problem,
 * so they get the same answer — a per-attack option a person sets, defaulting
 * to "no cover, distance unstated", which is exactly today's behaviour.
 *
 * Taking the two halves separately, because they are not equally automatable:
 *
 * - **Cover cannot be computed at all.** Its degrees are adjudications, not
 *   geometry: "an obstacle blocks at least half of its body", "about
 *   three-quarters of it is covered", and a list of examples (an arrow slit, a
 *   portcullis, a friend standing in the way) that no wall-collision test
 *   distinguishes. Foundry knows where walls are; it does not know whether the
 *   low wall you are crouched behind covers half of you or three-quarters, and
 *   the book puts that call at the table. Guessing it would silently hand out
 *   a +5 AC the GM never granted.
 * - **Distance genuinely could be measured** — and is still declared, for
 *   three reasons. It needs a canvas: an attacking token (an actor may own
 *   several, or none, and a sheet rolled from the sidebar has no token at all),
 *   a target, a grid, and elevation. It needs API surface this project has not
 *   probed on a live server, which the working agreement forbids building on
 *   sight-unseen, and which the ambient typings in `src/types/foundry.d.ts`
 *   do not declare. And distance changes constantly, so keeping a measured
 *   value honest wants a token-movement hook — the pattern `situations.ts`
 *   argues against at length and this system has already been burned by once.
 *   A number typed into the attack dialog is worth more than a number measured
 *   from the wrong token.
 *
 * The bands themselves *are* computed once the distance is known: they depend
 * on the weapon's multipliers, the attacker's Perception, the weather, and
 * Kickback, all of which are sheet state. That is the whole automation on
 * offer here, and it is the half worth having.
 */
export interface AttackOptions {
  /** Targeted attack (pg 130-131) at a specific limb. */
  limb?: LimbKey;
  /**
   * This swing costs no Action Points.
   *
   * Set by the free shots an Automatic burst grants (pg 71): the burst prices
   * one attack and hands the rest over, so charging each echo would bill four
   * attacks' AP for a three-shot burst. The comment inside `rollAutomaticBurst`
   * has said "no AP" since long before anything spent any, and this is what
   * keeps that true now that the pool is real.
   */
  free?: boolean;
  /**
   * Sneak attack (pg 128): against a target that is unaware of you and cannot
   * sense you, the attack is a critical hit and ignores stamina points — but it
   * must still beat their armor class.
   *
   * Leave it undefined and the attack works it out from the attacker's own
   * stealth state against the single targeted token, via `sneakAttackPosture`
   * (`src/actions/stealth.ts`). Setting it explicitly always wins, which is what
   * the GM-adjudicated cases need — a sleeping target is unaware in a way no
   * marker records. Note this is the one piece of pair-of-tokens state the
   * system does read, and it can: the posture is computed from *documents*
   * (a Hide marker and a Surprise marker), never from geometry.
   */
  sneak?: boolean;
  /**
   * The target took the Dodge action and can see the attacker (pg 126), so this
   * attack has disadvantage.
   *
   * Declared for the same reason cover and distance are: the rule turns on
   * *"if you can see the attacker"*, a sightline this system does not model.
   * `dodgeApplies` in `src/rules/actions.ts` carries the argument. The attack
   * cannot check whether the target actually has a Dodge running either, since
   * that is the target's marker and this is the attacker's roll.
   */
  targetDodging?: boolean;
  /**
   * The target's cover (pg 130), as declared by whoever is rolling. Total cover
   * refuses the attack outright; half and three-quarters are reported, because
   * they raise the *target's* AC and this side of the roll never sees an AC.
   */
  cover?: CoverDegree;
  /**
   * Whether the thing giving cover is another creature (pg 130): a low enough
   * attack roll hits the creature in the way instead. Deliberately independent
   * of `cover` — pg 130 lists a creature among the obstacles that *might* give
   * half cover, so which degree a body in the way is worth stays the GM's call.
   */
  coverIsCreature?: boolean;
  /**
   * Distance to the target in feet, for the range bands (pg 21, pg 66). Omit it
   * and nothing about distance is checked, which is how every existing caller
   * behaves today.
   */
  distanceFeet?: number;
  /**
   * Whether this attack is silenced (pg 77), which keeps a hidden attacker
   * hidden from everyone except the creature they shot.
   *
   * **Now an override, not the only source.** Leave it undefined and the attack
   * asks the weapon: `WeaponData.silenced` reads the Silencer out of
   * `system.attachedMods`, the validated mod set added by backlog D3. Setting it
   * explicitly always wins — in *both* directions, exactly as `sneak` above
   * behaves — because a declaration is a declaration: a GM improvising a
   * suppressed weapon that has no mod attached needs `true`, and homebrew that
   * has decided this particular shot was loud needs `false`.
   *
   * It used to be the only source, and the reason is worth keeping: `system.mods`
   * is a bare free-text string that nothing populates, so sniffing it for the
   * word "silencer" would have been a guess dressed as a rule. It still is —
   * `attachedMods` is a different field, and a closed one.
   */
  silenced?: boolean;
  /**
   * Spend the extra rounds a Boosted or Overclocked Capacitor offers (pg 75-76):
   * *"you can spend 2 rounds of ammunition instead of 1 to increase the damage
   * by 2"* / *"3 rounds… by 4"*.
   *
   * Declared per attack because the book makes it a choice — *"you **can**
   * spend"* — and the choice is worth making shot by shot, since it trades the
   * magazine against the damage. Which of the two boosts is on offer is not
   * declared: the weapon answers that from `attachedMods`, so a weapon with
   * neither capacitor quietly ignores the flag and a weapon with one applies its
   * own numbers. See `capacitorBoost` for what happens if a table has attached
   * both, which the book forbids and nothing here refuses.
   *
   * The damage half is a separate roll in this system, so `rollDamage` takes the
   * same flag; see its parameter for why the two are not one call.
   */
  capacitor?: boolean;
  /**
   * What the target presents to this attacker (pg 118, 130, 134).
   *
   * Read off the target's own documents when omitted — the Hide marker and the
   * Invisible status. **Darkness is the exception and the reason this option
   * exists**: scene light is not a per-creature fact, `src/actions/light.ts`
   * reports obscurement rather than stamping it on actors, and pg 128's most
   * common trigger is a target standing in the dark. Nothing on a document can
   * answer that, so the table declares it and the attack believes them.
   */
  concealment?: Concealment;
  /**
   * Force pg 128's blind attack on or off, overriding what `blindAttackApplies`
   * works out from the attacker's condition and the target's concealment.
   *
   * Same convention as `silenced` — an explicit value wins in *both* directions
   * — but a narrower purpose. The paragraph says an attack in those conditions
   * *is* a blind attack rather than may be one, so this is not a player's choice
   * between two rolls: it is there for a GM running a situation the concealment
   * vocabulary has no word for, and for `false` when a table has ruled that some
   * unprinted sense sees through the dark.
   */
  blindAttack?: boolean;
}

// ===========================================================================
// The capacitors — the one mod clause that needs the weapon, not just its keys
// ===========================================================================
//
// `scopeCloseRange` and `upgradedDamageBonus` used to sit here beside these and
// have moved to `src/rules/mods.ts`, where the rows they interpret live: both
// are pure and read only mod keys. What is left is the pair that cannot follow
// them. `payableCapacitor` asks whether the *weapon* can pay — `isRanged` and
// `magazineSize`, fields of `WeaponData` — and `rules/` does not import
// `data/`. `capacitorBoost` stays with it because splitting a two-function pair
// across two modules to satisfy a rule neither half breaks would be worse than
// the rule.

/** What one attack's capacitor boost costs and what it buys. */
export interface CapacitorBoost {
  readonly mod: ModKey;
  /** Rounds this attack spends *instead of* one, not on top of one. */
  readonly rounds: number;
  /** Flat damage added to the damage roll. */
  readonly damage: number;
}

/**
 * The two capacitors, stronger first (pg 75, 76).
 *
 * The order is the ruling: the rows conflict outright — *"A weapon cannot have
 * a boosted capacitor if it has an overclocked capacitor"*, recorded on both
 * rows in `rules/mods.ts` — but attachment is advisory here, so a weapon can
 * end up wearing both. It cannot spend 2 rounds and 3 rounds for one shot, and
 * the book gives no way to combine them, so the Overclocked Capacitor wins: it
 * is the strictly larger trade in both directions, so the choice the player
 * made ("boost this shot") is honoured at its full printed price rather than
 * being quietly discounted.
 */
const CAPACITORS: readonly CapacitorBoost[] = [
  { mod: "overclockedCapacitor", rounds: 3, damage: 4 },
  { mod: "boostedCapacitor", rounds: 2, damage: 2 },
];

/** The boost this weapon's mods offer, or null if it has neither capacitor. */
export function capacitorBoost(attached: readonly ModKey[]): CapacitorBoost | null {
  return CAPACITORS.find((capacitor) => attached.includes(capacitor.mod)) ?? null;
}

/**
 * The boost this weapon can actually *pay* for, or null.
 *
 * A capacitor is priced in rounds of ammunition, so a weapon this system tracks
 * no magazine for — every statblock weapon with `magazineSize: 0`, which never
 * spends a round for an ordinary attack either — has no way to buy one. The
 * attack refuses it and says so on the card, and the damage roll has to refuse
 * it on exactly the same terms: attack and damage are two separate button
 * presses here, so a damage roll that asked only `capacitorBoost` would hand out
 * the +2 or +4 the attack had just declined, from the same click.
 */
export function payableCapacitor(
  weaponSystem: WeaponData,
  declared: boolean,
): CapacitorBoost | null {
  if (!declared) return null;
  if (!weaponSystem.isRanged || weaponSystem.magazineSize <= 0) return null;
  return capacitorBoost(weaponSystem.attachedModKeys);
}

/** A weapon's bands at this character's Perception, and where the shot falls. */
interface RangeReport {
  band: RangeBand;
  /** The declared distance, floored at 0. */
  distance: number;
  normal: number;
  long: number;
  /** Whether weather, Kickback or a targeted limb shrank the printed numbers. */
  shrunk: boolean;
  /** The eyes/head row halved it (pg 129). */
  limbHalved: boolean;
}

/**
 * Work out which band a declared distance falls in for this weapon.
 *
 * Null when the weapon has no range to compare against — every melee weapon,
 * and any NPC statblock row that never filled the column in. The arithmetic
 * deliberately mirrors what the character sheet prints on the weapon row: the
 * player reads "60/120 ft" there and picks a distance against it, so the band
 * has to be computed from the same numbers, weather multiplier (pg 121-123)
 * and Kickback halving (pg 70) included.
 */
function attackRangeReport(
  system: CharacterData,
  weaponSystem: WeaponData,
  distanceFeet: number,
  limb?: LimbKey | null,
): RangeReport | null {
  if (!weaponSystem.isRanged || weaponSystem.rangeLong <= 0) return null;
  const scale = rangeMultiplier();
  const handScale = weaponSystem.keywords.kickback && weaponSystem.oneHanded ? 0.5 : 1;
  // A targeted attack at the eyes or the head halves the weapon's range
  // (pg 129) — the ruling and the patch-note evidence are at `halvesRange`.
  // One more factor in the same product, so it composes with the weather scale
  // and Kickback exactly as those two compose with each other.
  const limbScale = halvesRange(limb) ? 0.5 : 1;
  const printed = weaponRange(
    { normal: weaponSystem.rangeNormal, long: weaponSystem.rangeLong },
    system.derived.abilityScores.perception,
  );
  const normal = Math.floor(printed.normal * scale * handScale * limbScale);
  const long = Math.floor(printed.long * scale * handScale * limbScale);
  const distance = Math.max(0, distanceFeet);
  return {
    band: rangeBand(distance, { normal, long }),
    distance,
    normal,
    long,
    shrunk: scale !== 1 || handScale !== 1 || limbScale !== 1,
    limbHalved: limbScale !== 1,
  };
}

/**
 * A d20 skill check: d20 + skill bonus − leveled-condition penalty
 * (hunger, dehydration, exhaustion, fatigue, rads each subtract 1 per level).
 */
export async function rollSkill(
  actor: FoundryActor,
  system: CharacterData,
  skill: SkillKey,
  mode: RollMode,
): Promise<void> {
  const bonus = system.derived.skillBonuses[skill];
  const governing = system.derived.skillAbilities[skill];
  // A skill check answers to its governing ability *and* to anything scoped to
  // this skill alone — which is what most of the perk text actually grants.
  const rolled = effectiveMode(system, [governing, skillScope(skill)], mode);
  const parts = [d20Formula(rolled), signed(bonus), ...d20Modifiers(system)];

  const roll = new foundry.dice.Roll(parts.join(" "));
  await roll.evaluate();
  const ability = ABILITY_ABBREVIATIONS[governing];
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${skillLabel(skill)} (${ability})${modeSuffix(rolled)}`,
  });
  // A Help is spent by the next roll the helped character makes (pg 127), the
  // same "expires on its trigger" shape as a Block ending on an attack.
  await consumeHelp(actor);
}

/** A raw ability check: d20 + ability modifier − condition penalty. */
export async function rollAbility(
  actor: FoundryActor,
  system: CharacterData,
  ability: keyof typeof ABILITY_ABBREVIATIONS,
  mode: RollMode,
): Promise<void> {
  const rolled = effectiveMode(system, [ability], mode);
  const parts = [
    d20Formula(rolled),
    signed(system.derived.abilityMods[ability]),
    ...d20Modifiers(system, ability),
  ];

  const roll = new foundry.dice.Roll(parts.join(" "));
  await roll.evaluate();
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${game.i18n.localize(`FALLOUT.Abilities.${ability}`)}${modeSuffix(rolled)}`,
  });
  await consumeHelp(actor);
}

/**
 * Weapon attack: d20 + governing skill bonus vs the target's AC. The raw die
 * is compared against the weapon's crit chance (lowered by half the Luck
 * modifier, shotguns excepted — pg 129); a raw 1 is a critical failure that
 * decays the weapon.
 *
 * With a `limb`, this is a targeted attack (pg 130-131): flavor carries the
 * limb, extra AP, and damage modifier; a follow-up d4 announces the condition
 * to apply if the damage reaches hit points (crit → severe injury instead).
 *
 * With `sneak`, it is a sneak attack (pg 128): a critical hit that ignores
 * stamina points, provided it beats the target's AC. This system never knows
 * the target's AC at roll time, so the card states the condition rather than
 * resolving it.
 *
 * With `cover` and `distanceFeet` — both declared, never measured; see
 * `AttackOptions` — the attack also answers to cover (pg 130) and the range
 * bands (pg 21, pg 66). Total cover refuses the attack; a target past normal
 * range is at disadvantage; past long range the card carries both of the
 * book's two incompatible rulings for that case.
 */
export async function rollAttack(
  actor: FoundryActor,
  system: CharacterData,
  weapon: FoundryItem,
  weaponSystem: WeaponData,
  mode: RollMode,
  options: AttackOptions = {},
): Promise<void> {
  const {
    limb,
    cover = "none",
    coverIsCreature = false,
    distanceFeet,
    targetDodging = false,
  } = options;

  // The Silencer (pg 77), from the weapon's own attached mods unless the caller
  // declared otherwise. `??` rather than `||` so an explicit `false` suppresses
  // a real silencer instead of being swallowed — the same convention `sneak`
  // uses a few lines below for the same reason.
  const silenced = options.silenced ?? weaponSystem.silenced;

  // The sneak-attack flag, worked out from the attacker's stealth state when the
  // caller did not decide for itself (pg 128). Exactly one target, for the same
  // reason the medical panel insists on one: "the target" is singular in the
  // rule, and picking one out of several would be guessing which.
  //
  // `posture.advantage` is pg 24's separate grant — being hidden *from this
  // target* is worth advantage whether or not the sneak attack applies — so it
  // is folded into the requested mode below rather than into `sneak`.
  const targets = Array.from(game.user.targets)
    .map((token) => token.actor)
    .filter((candidate): candidate is FoundryActor => candidate !== null);
  const posture =
    targets.length === 1 && targets[0] ? sneakAttackPosture(actor, targets[0]) : null;
  const sneak = options.sneak ?? posture?.sneakAttack ?? false;

  // On-Board Target Tracking (pg 76): "Attack rolls against the marked creature
  // have advantage." The sentence names no attacker, so any attack takes it —
  // and this roll spends it, which is the ruled duration (see `markTarget`).
  const markedTarget =
    targets.length === 1 && targets[0] && markedByTracking(targets[0]) !== null ? targets[0] : null;

  // "A target with total cover can't be targeted directly by an attack" (pg
  // 130). Refused before the magazine is touched, so a shot the rules do not
  // allow does not also cost a round — the same early-out the empty magazine
  // below already uses. The book's own escape hatch (an area of effect that
  // includes the target) is not an attack roll, so it does not come through
  // here at all.
  if (blocksTargeting(cover)) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Cover.totalBlocks"));
    return;
  }

  // Blind attack (pg 128): *"If you are blinded, or your target is heavily
  // obscured but not behind total cover, **any attack you make against them is
  // a blind attack**."* Not an option beside the ordinary attack — a
  // replacement for it — so it is asked here, before the magazine is touched
  // and before a single modifier is assembled, and it takes the whole roll.
  //
  // This is the caller `rollBlindAttack` never had. It existed, was exported,
  // and nothing routed into it, so the substitution the book prints was
  // available only to somebody driving the API by hand.
  //
  // Total cover is already gone above, which is why `blindAttackApplies` can
  // treat its own "refused" verdict as "not a blind attack" and say nothing.
  const targetConcealment =
    options.concealment ??
    (targets.length === 1 && targets[0]
      ? concealmentPresentedTo(actor, targets[0])
      : NO_CONCEALMENT);
  const blind =
    options.blindAttack ??
    blindAttackApplies({
      attackerBlinded: actor.statuses?.has("blinded") === true,
      concealment: targetConcealment,
      infraredScope: weaponSystem.hasMod("infraredScope"),
    });
  if (blind) {
    // The DC is 5 + the distance, so without a distance there is no DC and no
    // roll to make. Refused rather than guessed: this system never measures a
    // distance (see `AttackOptions.distanceFeet`), and defaulting to 0 would
    // hand the shooter a DC 5 they did not earn.
    if (distanceFeet === undefined) {
      ui.notifications.warn(game.i18n.localize("FALLOUT.Roll.blindNeedsDistance"));
      return;
    }
    // The blind path replaces the *roll*, not the cost — the weapon still
    // fired. Charged here because this branch returns before the ordinary
    // charge below, and a blinded attacker swinging for free is not a rule.
    //
    // The weapon's AP and the pg 120 disease surcharge only: this path discards
    // the limb (a blind attack is a Luck check against a DC, not a hit on a
    // named part), and the one-handed penalty is resolved a hundred lines
    // further down than this early return can see.
    await noteActionPoints(
      actor,
      weaponSystem.apCost +
        (weaponSystem.isRanged
          ? system.derived.attackApSurcharge.ranged
          : system.derived.attackApSurcharge.melee),
    );
    await rollBlindAttack(actor, system, distanceFeet, {
      weapon: weapon.name,
      reason: actor.statuses?.has("blinded") === true ? "blinded" : "obscured",
    });
    return;
  }

  // Boosted Capacitor (pg 75) and Overclocked Capacitor (pg 76): "you can spend
  // 2 rounds of ammunition instead of 1 to increase the damage by 2" / "3
  // rounds… by 4". Declared per attack (`AttackOptions.capacitor`), priced from
  // the weapon's own mods.
  //
  // The boost is *rounds*, so a weapon this system tracks no magazine for has no
  // way to pay for it — every statblock weapon with `magazineSize: 0`, which
  // never spends a round for an ordinary attack either. Rather than hand out
  // free damage nobody paid for, the boost does not apply and the card says so:
  // this system reports rather than invents, and an unpaid +4 is an invention.
  const tracksAmmo = weaponSystem.isRanged && weaponSystem.magazineSize > 0;
  // `declaredBoost` is kept only so the card can name the boost it refused.
  const declaredBoost = options.capacitor === true
    ? capacitorBoost(weaponSystem.attachedModKeys)
    : null;
  const capacitor = payableCapacitor(weaponSystem, options.capacitor === true);

  // Ranged weapons with a magazine consume a round per attack (pg 63) — or the
  // capacitor's 2 or 3 *instead of* that one, as printed.
  if (tracksAmmo) {
    const rounds = capacitor?.rounds ?? 1;
    if (weaponSystem.loadedAmmo < rounds) {
      // Refused before anything is spent, exactly as the empty magazine has
      // always been and as total cover is above it.
      //
      // **Ruling on a magazine that can pay for a plain shot but not a boosted
      // one:** the whole attack is refused rather than silently downgraded. The
      // player declared a 3-round shot; firing a 1-round one in its place would
      // change their declaration and their damage without telling them, and the
      // way back is one click (attack again without the boost) rather than an
      // undo. Nothing has been spent at this point, so refusing costs nothing.
      ui.notifications.warn(
        capacitor === null
          ? game.i18n.localize("FALLOUT.Roll.outOfAmmo", { weapon: weapon.name })
          : game.i18n.localize("FALLOUT.Mods.capacitorDry", {
              weapon: weapon.name,
              mod: game.i18n.localize(`FALLOUT.Mods.names.${capacitor.mod}`),
              rounds: capacitor.rounds,
              loaded: weaponSystem.loadedAmmo,
            }),
      );
      return;
    }
    await weapon.update({ "system.loadedAmmo": weaponSystem.loadedAmmo - rounds });
  }

  const keywords = weaponSystem.keywords;

  const skill = weaponSystem.skill;
  // NPC statblock weapons can pin a fixed to-hit instead of the skill bonus.
  const bonus = weaponSystem.attackBonusOverride ?? system.derived.skillBonuses[skill];
  // An attack is a skill check, so the governing ability's advantage applies
  // as well as anything targeting attack rolls specifically.
  // Being hidden from this particular target is worth advantage on the attack
  // (pg 24), independently of whether it also amounts to a sneak attack. It is
  // requested rather than applied directly, so it cancels against a
  // disadvantage the usual way instead of overriding one.
  const requested: RollMode =
    mode === "normal" && (posture?.advantage === true || markedTarget !== null)
      ? "advantage"
      : mode;
  let rolled = effectiveMode(
    system,
    [SKILLS[skill].ability, skillScope(skill), "attack"],
    requested,
  );

  // The target is dodging and can see who is shooting (pg 126). Same
  // cancellation convention as every other declared penalty below: one
  // disadvantage, and it cannot bury an advantage already held.
  if (targetDodging && rolled !== "disadvantage") {
    rolled = rolled === "advantage" ? "normal" : "disadvantage";
  }
  // Wielding a weapon whose Strength requirement you do not meet is at
  // disadvantage (pg 128). The book offers ways to avoid it by spending extra
  // AP, which is the player's call, so this only reports the shortfall.
  const understrength =
    weaponSystem.strengthReq > system.derived.abilityScores.strength &&
    weaponSystem.attackBonusOverride === null;
  if (understrength && rolled !== "disadvantage") {
    rolled = rolled === "advantage" ? "normal" : "disadvantage";
  }

  // Two Handed used in one hand (pg 61 melee, pg 70 ranged): disadvantage
  // unless 2 extra AP are paid, and — ranged only — you fall prone if they are
  // not. AP is still spent by hand, so this reports the choice rather than
  // making it: the roll takes the penalty, and the note names the way out.
  const oneHanded =
    keywords.twoHanded && weaponSystem.oneHanded && weaponSystem.attackBonusOverride === null;
  const handPenalty = oneHanded
    ? oneHandedPenalty(
        system.derived.abilityScores.strength,
        weaponSystem.strengthReq,
        weaponSystem.isRanged,
      )
    : null;

  // Unwieldy (pg 70): "this weapon gives you disadvantage if you use one hand
  // unless your Perception is 10" — a score, not a modifier. Same declared
  // stance as Two Handed above, but with no AP that buys it off and no Strength
  // exemption, so there is nothing here to report as a choice.
  const unwieldy =
    keywords.unwieldy && weaponSystem.oneHanded && weaponSystem.attackBonusOverride === null;
  const unwieldyPenalty = unwieldy && unwieldyDisadvantage(system.derived.abilityScores.perception);

  // One cancellation step for both hold penalties: a weapon that is Two Handed
  // *and* Unwieldy imposes one disadvantage, not two, and cannot bury an
  // advantage the character already had (the usual d20 convention, and what
  // `effectiveMode` does with its own sources).
  if ((handPenalty?.disadvantage === true || unwieldyPenalty) && rolled !== "disadvantage") {
    rolled = rolled === "advantage" ? "normal" : "disadvantage";
  }

  // Distance, if the attacker declared one (pg 21, pg 66). Same cancellation
  // convention as the hold penalties above: one disadvantage, and it cannot
  // bury an advantage the character already had.
  //
  // Pg 66: "You have disadvantage on attack rolls against targets who are
  // beyond the short range of the weapon." A target past *long* range is also
  // past short range, so by the letter the disadvantage rides along out there
  // too — the book never carves out the far band, and nothing about the
  // sentence suggests it meant to.
  const ranged = distanceFeet === undefined
    ? null
    : attackRangeReport(system, weaponSystem, distanceFeet, limb);
  if (ranged !== null && ranged.band !== "normal" && rolled !== "disadvantage") {
    rolled = rolled === "advantage" ? "normal" : "disadvantage";
  }

  // A Scope or Infrared Scope pointed at something too close (pg 76-77): "any
  // attacks made at targets within 50 feet are made at disadvantage" / "within
  // 30 feet". The last link in the same chain, and it obeys the same convention
  // — one disadvantage, and it cannot bury an advantage the character already
  // had. So a scoped shot at 20 feet from a hidden position is a *normal* roll,
  // not a disadvantaged one, exactly as a dodging target would make it.
  //
  // Keyed off the declared distance rather than the range report, because the
  // two answer different questions: `attackRangeReport` is null for a weapon
  // with no printed long range, but "within 50 feet" is a fact about the shot,
  // not about the weapon's bands, and the scope's own sentence does not consult
  // them. It needs a declared distance, though — with none, nothing about
  // distance is checked here any more than it is above.
  const scoped = distanceFeet === undefined
    ? null
    : scopeCloseRange(weaponSystem.attachedModKeys, distanceFeet);
  if (scoped !== null && rolled !== "disadvantage") {
    rolled = rolled === "advantage" ? "normal" : "disadvantage";
  }

  // Weapon decay subtracts 1 per level on top of the usual d20 modifiers.
  const parts = [d20Formula(rolled), signed(bonus), ...d20Modifiers(system)];
  if (weaponSystem.decay > 0) parts.push(`-${String(weaponSystem.decay)}`);
  // Modifiers that reach attack rolls and nothing else — five of the pg 129
  // limb conditions are "−2/−5 to all attack rolls", and writing those through
  // `d20Bonus` would have docked the target's skill checks with them. Applied
  // after decay and before the mod bonuses purely for reading order; they all
  // sum.
  if (system.derived.attackBonus !== 0) parts.push(signed(system.derived.attackBonus));
  // Mod attack bonuses (pg 75-77): Holographic Sight, Muzzle Brake and Stock
  // are +1 each, Infrared Scope +2. Gated on `attackBonusOverride` for the same
  // reason the Strength and Two Handed penalties are — a statblock's printed
  // to-hit is a finished number, not a base to build on.
  const modBonus = weaponSystem.attackBonusOverride === null ? weaponSystem.modAttackBonus : 0;
  if (modBonus !== 0) parts.push(signed(modBonus));

  const roll = new foundry.dice.Roll(parts.join(" "));
  await roll.evaluate();

  const raw = keptD20(roll);
  const threshold = critThreshold(
    weaponSystem.critChance,
    system.derived.abilityMods.luck,
    weaponSystem.weaponType === "shotgun",
  );

  // A sneak attack is a critical hit outright (pg 128). A natural 1 is still an
  // automatic miss, so it cannot be one.
  //
  // Neither route can crit a weapon that prints no critical hit — the four
  // area-of-effect weapons carry `critChance: 0` and an empty `crit` column, so
  // "a critical hit" would announce a multiplier the row does not have. The
  // threshold guard already refuses the roll; the sneak clause has to be told
  // separately, because it never consults the threshold at all.
  const canCrit = weaponSystem.critChance > 0;
  const isCrit = canCrit && raw !== 1 && (sneak || raw >= threshold);
  let outcome = "";
  if (raw === 1) {
    outcome = ` — ${game.i18n.localize("FALLOUT.Roll.criticalFailure")}`;
    // Through the shared gate, so Super Mutant Bulky (pg 12) reaches it.
    outcome += bulkyNote(await decayItem(actor, weapon));
  } else if (isCrit) {
    outcome = ` — ${game.i18n.localize("FALLOUT.Roll.criticalHit", { crit: weaponSystem.crit })}`;
  }
  const sneakNote = sneak ? ` ${game.i18n.localize("FALLOUT.Roll.sneakAttack")}` : "";
  // Say where an unrequested sneak attack came from — a card that silently
  // upgrades itself to a critical hit is a card nobody can check.
  const postureNote =
    options.sneak === undefined && posture?.sneakAttack === true
      ? ` ${game.i18n.localize("FALLOUT.Roll.sneakFromPosture")}`
      : "";
  // The mark only *requests* advantage, and only from a normal roll — the same
  // gate `hiddenNote` below reads. It is spent by this attack either way (the
  // ruled trigger, in `markTarget`), so a declared advantage or disadvantage has
  // to be told that the 6 AP was consumed without changing anything, rather than
  // being handed a note claiming an advantage the roll never had.
  const markNote =
    markedTarget === null
      ? ""
      : mode === "normal"
        ? ` ${game.i18n.localize("FALLOUT.Mods.markedTarget")}`
        : ` ${game.i18n.localize("FALLOUT.Mods.markedNoAdvantage")}`;
  const hiddenNote =
    mode === "normal" && posture?.advantage === true
      ? ` ${game.i18n.localize("FALLOUT.Roll.hiddenFromTarget")}`
      : "";
  const dodgeNote = targetDodging ? ` ${game.i18n.localize("FALLOUT.Roll.targetDodging")}` : "";
  // Where the silence came from, for exactly the reason `postureNote` above
  // exists: an attack that quietly leaves its owner hidden is one nobody at the
  // table can check. Only said when the *weapon* answered — a declared
  // `silenced` is already the caller's own statement, and does not need echoing.
  const silencerNote =
    options.silenced === undefined && silenced
      ? ` ${game.i18n.localize("FALLOUT.Mods.silencerFromWeapon")}`
      : "";

  // The scope's close-range clause is stated whenever it fires, even when the
  // disadvantage it asks for was already on the roll from something else — the
  // note is what the mod did to *this* shot, and a reader comparing the card to
  // pg 77 needs to see that the band was checked.
  const scopeNote = scoped
    ? ` ${game.i18n.localize("FALLOUT.Mods.scopeClose", {
        mod: game.i18n.localize(`FALLOUT.Mods.names.${scoped.mod}`),
        page: WEAPON_MODS[scoped.mod].page,
        feet: scoped.feet,
        distance: Math.max(0, distanceFeet ?? 0),
      })}`
    : "";

  // What the boost cost and what it buys. The rounds are already gone by here,
  // so this is a receipt, not an offer — and the damage half of it lands on the
  // separate damage card, which is why both cards name the mod.
  let capacitorNote = "";
  if (capacitor) {
    capacitorNote = ` ${game.i18n.localize("FALLOUT.Mods.capacitorSpent", {
      mod: game.i18n.localize(`FALLOUT.Mods.names.${capacitor.mod}`),
      rounds: capacitor.rounds,
      damage: capacitor.damage,
      loaded: Math.max(0, weaponSystem.loadedAmmo - capacitor.rounds),
    })}`;
  } else if (declaredBoost !== null && !tracksAmmo) {
    capacitorNote = ` ${game.i18n.localize("FALLOUT.Mods.capacitorNoMagazine", {
      mod: game.i18n.localize(`FALLOUT.Mods.names.${declaredBoost.mod}`),
      rounds: declaredBoost.rounds,
    })}`;
  }

  let handNote = "";
  if (handPenalty?.exempt === true) {
    handNote = ` ${game.i18n.localize("FALLOUT.Keywords.oneHandedExempt", {
      margin: TWO_HANDED_STRENGTH_MARGIN,
    })}`;
  } else if (handPenalty) {
    handNote = ` ${game.i18n.localize(
      handPenalty.prone ? "FALLOUT.Keywords.oneHandedRanged" : "FALLOUT.Keywords.oneHandedMelee",
      { ap: handPenalty.extraAp },
    )}`;
  }

  const unwieldyNote = unwieldy
    ? ` ${game.i18n.localize(
        unwieldyPenalty ? "FALLOUT.Keywords.unwieldy" : "FALLOUT.Keywords.unwieldyExempt",
        { score: UNWIELDY_PERCEPTION },
      )}`
    : "";

  // Spread only fires in the *second* range increment (pg 70) — which is also
  // the band that already carries disadvantage for distance, so a shotgun's
  // signature property never applies at close range. That reads like a design
  // slip, but no errata says otherwise, so it stands.
  const spreadNote = keywords.spread
    ? ` ${game.i18n.localize("FALLOUT.Keywords.spread", { feet: SPREAD_RADIUS_FEET })}`
    : "";

  // Cover (pg 130) is a bonus to the *target's* AC, and this side of a roll has
  // never known the target's AC — the same wall the sneak-attack card runs
  // into. So a declared degree is stated, with its number, for whoever compares
  // the total. The explosive/trap resistance rides on the same sentence in the
  // book, so it is printed alongside when the weapon actually deals explosive
  // damage; it is a damage-side rule, and the damage pipeline does not read it.
  let coverNote = "";
  if (cover !== "none") {
    const resists =
      weaponSystem.damageType === "explosive" && explosiveExposure(cover) === "resistant";
    coverNote = ` ${game.i18n.localize(
      resists ? "FALLOUT.Cover.noteExplosive" : "FALLOUT.Cover.note",
      {
        degree: game.i18n.localize(`FALLOUT.Cover.degrees.${cover}`),
        ac: coverAcBonus(cover),
      },
    )}`;
  }

  // Using another creature as cover (pg 130): a total of 6 or below "deals
  // damage against the covering creature". Which creature that is, and whose
  // damage roll it eats, are table facts, so this announces the redirect and
  // leaves the damage roll to be applied at the covering creature by hand.
  const creatureCoverNote = coverIsCreature
    ? ` ${game.i18n.localize("FALLOUT.Cover.creature", { max: CREATURE_COVER_HIT_MAX })}`
    : "";
  const creatureCoverHit =
    coverIsCreature && hitsCoveringCreature(roll.total)
      ? ` ${game.i18n.localize("FALLOUT.Cover.creatureHit", {
          total: roll.total,
          max: CREATURE_COVER_HIT_MAX,
        })}`
      : "";

  // Beyond long range the book stops agreeing with itself, and this is the only
  // place in either chapter where it does:
  //
  // - pg 21 (Perception, "Weapon range"): "You can't attack a target beyond the
  //   weapon's long range."
  // - pg 66 (Ranged Weapons, "Range"): "Attack rolls against targets beyond the
  //   long range of the weapon only hit if you roll a 20."
  //
  // Pg 66 is followed. It is the weapon chapter's own statement of its own
  // rule, it uses the names off the weapon tables' Range column (pg 21 calls
  // the first number "normal range"; no table anywhere uses that word), and it
  // is the more specific of the two — pg 21 reads as the ability page's summary
  // of it. It is also the reading that leaves the table its say: a GM running
  // pg 21 narrates a refusal, whereas refusing to roll here would give a table
  // running pg 66 no way to make an attack the book allows. Both sentences go
  // on the card so nobody has to take this on trust.
  let rangeNote = "";
  let rangeOutcome = "";
  // Said whenever the eyes/head row shortened the weapon, even on a shot that
  // still lands in the normal band: the halving is the reason the bands moved,
  // and a player who cannot see it happen cannot check it.
  const limbRangeNote =
    ranged?.limbHalved === true
      ? ` ${game.i18n.localize("FALLOUT.Range.limbHalved", {
          normal: ranged.normal,
          long: ranged.long,
        })}`
      : "";
  if (ranged !== null && ranged.band !== "normal") {
    const shrunk = ranged.shrunk ? game.i18n.localize("FALLOUT.Range.shrunk") : "";
    rangeNote = ` ${game.i18n.localize(
      ranged.band === "beyond" ? "FALLOUT.Range.beyond" : "FALLOUT.Range.long",
      { distance: ranged.distance, normal: ranged.normal, long: ranged.long, shrunk },
    )}`;
    if (ranged.band === "beyond") {
      rangeOutcome = ` ${game.i18n.localize(
        raw === 20 ? "FALLOUT.Range.beyondHit" : "FALLOUT.Range.beyondMiss",
      )}`;
    }
  }

  // Jelly fingers and Lock joint add an AP to ranged and melee attacks
  // respectively (v2.1 pg 120). AP is still spent by hand, so this reports the
  // surcharge rather than charging it.
  const surcharge = weaponSystem.isRanged
    ? system.derived.attackApSurcharge.ranged
    : system.derived.attackApSurcharge.melee;
  const surchargeNote =
    surcharge > 0 ? ` ${game.i18n.localize("FALLOUT.Diseases.apSurcharge", { ap: surcharge })}` : "";

  // The robot type that matters is the *defender's* — every one of the pg 9-11
  // body-plan paragraphs is written second-person to the robot being shot at.
  // The single targeted token is the only thing this roll knows about the other
  // end, and it is the same one the sneak posture came from; with no target the
  // printed pg 129 table applies, which is what every attack did before robot
  // profiles existed.
  //
  // Resolved out here rather than inside the card-building block below, because
  // the follow-up card after the roll needs it too: NeuroTransmitters (pg 11)
  // doubles the conditions a head hit inflicts, and the rollers cannot be
  // severed. One resolution, so the AP the card charged and the injury it
  // inflicts cannot disagree about who was shot.
  const defender = targets.length === 1 ? targets[0] : undefined;
  const defenderRobotType = robotTypeOf(
    defender ? (defender.system as CharacterData).details.robotType : undefined,
  );

  let targetedPrefix = "";
  // The targeted surcharge, hoisted so the AP charge below can see it. The card
  // has always printed it; nothing outside this block could read it.
  let targetedAP = 0;
  if (limb) {
    const limbLabel = game.i18n.localize(limbLabelKey(limb));
    // Dismember (pg 60-61) zeroes the arm/leg surcharge outright, so the card can
    // print a +0 AP targeted attack — which is odd enough to name its cause.
    const printedAP = targetedApCost(
      limb,
      !weaponSystem.isRanged,
      keywords.dismember,
      defenderRobotType,
    );
    // VATS matrix overlay (pg 59): "Whenever you make a targeted attack roll,
    // reduce the additional AP cost by 1" per rank, to a maximum of rank 2. It
    // reduces *the additional* cost — the pg 129 surcharge and the Fusion Core's
    // +5 — never the weapon's own AP, which is the number this line has never
    // printed anyway. See `targetedApWithVats` for the floor at zero.
    const extraAP = targetedApWithVats(actor, printedAP);
    targetedAP = extraAP;
    const dismemberNote =
      keywords.dismember && printedAP === 0
        ? ` ${game.i18n.localize("FALLOUT.Keywords.dismember")}`
        : "";
    // The two reductions stack, and the book does not say they may not: pg 130
    // floors the melee discount at 1 additional AP, and pg 59 prints no floor at
    // all, so a rank 2 suit takes that last point off. Named on the card,
    // because a targeted attack that costs nothing extra is worth explaining.
    const vatsNote =
      extraAP < printedAP
        ? ` ${game.i18n.localize("FALLOUT.PowerArmor.vatsReduced", {
            printed: printedAP,
            ap: extraAP,
          })}`
        : "";
    // The damage modifier is read off the pg 129 *row* this limb resolves on, not
    // off the limb's own key: a Handy's jet engine and a Robobrain's rollers
    // "function exactly the same as a targeted attack to the legs" (pg 9-10) and
    // so have no printed effect text of their own to localize. This is what
    // `limbRowKey` is for, and the limb picker in `character-sheet.ts` has
    // always used it — the card was the one place still keying off the limb.
    targetedPrefix = ` — ${game.i18n.localize("FALLOUT.Targeted.flavor", {
      limb: limbLabel,
      ap: extraAP,
      effect: game.i18n.localize(
        `FALLOUT.Targeted.limbs.${limbRowKey(limb, defenderRobotType)}.effect`,
      ),
    })}${dismemberNote}${vatsNote}`;
  }

  // What the swing actually costs, all four components: the weapon's printed
  // AP, the disease surcharge, the one-handed penalty, and the targeted
  // surcharge after VATS. Every one of them was already on the card as text;
  // this is the first time their sum leaves the pool. Never refuses — see
  // `combat/action-points.ts` for why the half-step is not full E1.
  const apNote = options.free === true
    ? null
    : await noteActionPoints(
        actor,
        weaponSystem.apCost +
          surcharge +
          (handPenalty?.exempt === true ? 0 : (handPenalty?.extraAp ?? 0)) +
          targetedAP,
      );
  const apNoteText = apNote === null ? "" : ` ${apNote.line}`;

  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${weapon.name} — ${skillLabel(skill)}${modeSuffix(rolled)}${
      understrength
        ? ` ${game.i18n.localize("FALLOUT.Roll.understrength", { req: weaponSystem.strengthReq })}`
        : ""
    }${surchargeNote}${handNote}${unwieldyNote}${spreadNote}${rangeNote}${limbRangeNote}${scopeNote}${capacitorNote}${coverNote}${creatureCoverNote}${targetedPrefix}${hiddenNote}${markNote}${dodgeNote}${silencerNote}${sneakNote}${postureNote}${outcome}${rangeOutcome}${creatureCoverHit}${apNoteText}`,
  });

  // "Until you attack again" (pg 127) — the trigger that ends a block.
  await endBlocking(actor);
  // Attacking gives away a hiding place — pg 77's Silencer exception ("you stay
  // hidden when you attack") only makes sense as an exception to a rule that
  // attacking reveals you — and it ends Take Cover, which is a stance you leave
  // by acting out of it. `revealAfterAttacking` applies the carve-out; the flag
  // it is handed comes from the weapon's `attachedMods` (D3), unless this call
  // declared one — see `AttackOptions.silenced`.
  //
  // This call is why `dice/core.ts` exists: it was reverted once (`b4bd493`)
  // because `actions/stealth` imported this module and importing it back made a
  // cycle that left bindings undefined at module init, breaking every attack.
  // Stealth now takes its roll plumbing from `dice/core`, so the arrow only runs
  // one way and this is safe.
  await revealAfterAttacking(actor, silenced);
  await leaveCover(actor);
  // The mark is spent by the first attack against the marked creature, by
  // anybody — the ruled duration; see `markTarget` for why it is a trigger and
  // not a clock.
  if (markedTarget !== null) await consumeTargetMark(markedTarget);
  // A Help is likewise spent by the roll it was given for (pg 127).
  await consumeHelp(actor);

  // Follow-up for targeted attacks: crit = severe injury; otherwise a d4
  // picks the condition inflicted if the damage reaches hit points.
  //
  // Both halves read the defender's body plan (pg 9-11) through the rules
  // module rather than off the limb key, for the reason given at the flavor
  // line above: a jet engine and a set of rollers borrow the leg row's text.
  if (limb && raw !== 1 && dealsDamage(limb)) {
    const limbLabel = game.i18n.localize(limbLabelKey(limb));
    const rowKey = limbRowKey(limb, defenderRobotType);
    if (isCrit) {
      // `severeInjuryFor` returns a null `severeKey` for exactly one case — a
      // Robobrain's rollers, "except they cannot be severed" (pg 10) — and the
      // rider then carries pg 129's own alternative, up to two of the limb's
      // conditions. Riders also carry the Handy's "you fall prone and cannot
      // move until it is reattached" (pg 9) on top of a severed jet engine.
      const outcome = severeInjuryFor(limb, defenderRobotType);
      const severeLine =
        outcome.severeKey === null
          ? ""
          : game.i18n.localize("FALLOUT.Targeted.severeInjury", {
              limb: limbLabel,
              injury: game.i18n.localize(outcome.severeKey),
            });
      const riders = outcome.riderKeys.map((key) => game.i18n.localize(key));
      await foundry.documents.ChatMessage.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        content: [severeLine, ...riders].filter(Boolean).join(" "),
      });
    } else {
      // NeuroTransmitters (pg 11): "when you take damage from a targeted attack
      // to the head; you gain two conditions instead of one." Two separate d4s
      // rather than one card saying "twice", because each condition is its own
      // roll off the same table and each is independently re-rollable with Luck
      // — and because the two can come up the same, which a player watching one
      // die would have no way to check.
      //
      // The count comes from `targetedConditionCount`, which scopes the trait to
      // the head row and to this non-critical path only; the ruling that a
      // critical hit's severe injury is *not* doubled is set out there, and the
      // crit branch above is what implements it.
      const conditions = targetedConditionCount(limb, defenderRobotType);
      for (let index = 1; index <= conditions; index += 1) {
        const conditionRoll = new foundry.dice.Roll("1d4");
        await conditionRoll.evaluate();
        const condition = game.i18n.localize(
          `FALLOUT.Targeted.limbs.${rowKey}.c${String(conditionRoll.total)}`,
        );
        const neuroNote =
          conditions > 1
            ? ` ${game.i18n.localize("FALLOUT.Robots.neuroCondition", {
                index,
                count: conditions,
              })}`
            : "";
        await conditionRoll.toMessage({
          speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
          flavor: `${game.i18n.localize("FALLOUT.Targeted.conditionFlavor", {
            limb: limbLabel,
            condition,
            rerolls: Math.max(0, system.derived.abilityMods.luck),
          })}${neuroNote}`,
          // Read by the renderChatMessageHTML hook to offer the GM an Apply
          // button. The *row* is stored, not the limb: a jet engine and a set
          // of rollers resolve on the leg row, and the realisation table is
          // keyed the same way the text is.
          //
          // The button is deliberately not pressed by this roll. The whole
          // table is conditional on damage reaching hit points, which has not
          // been rolled yet here, let alone taken through stamina and DT — so
          // the card announces and a person applies.
          flags: {
            "fallout-ttrpg": {
              limbConditionRoll: { row: rowKey, index: conditionRoll.total },
            },
          },
        });
      }
    }
  }
}

/**
 * Weapon damage: damage dice + the governing ability's modifier (pg 5).
 * A negative modifier cannot reduce damage below 1 (pg 57).
 *
 * `sneak` marks the roll as a sneak attack's damage, which bypasses stamina
 * points entirely (pg 128, 131). The flag rides on the chat message so the
 * GM's Apply button runs the right pipeline; the crit *multiplier* is still
 * applied by hand, as it is for every other critical hit in this system.
 *
 * `capacitor` is the damage half of the same per-attack choice `rollAttack`
 * charged the rounds for (pg 75-76) — see the parameter.
 *
 * Melee **Upgraded** (pg 65) needs no flag at all: it reads the weapon's mods
 * and the roll's own dice. It is the first thing in this system to look at
 * individual die results rather than a total.
 */
export async function rollDamage(
  actor: FoundryActor,
  system: CharacterData,
  weapon: FoundryItem,
  weaponSystem: WeaponData,
  sneak = false,
  burst?: { suppressAgility: boolean; shot: number },
  /**
   * The attack spent a capacitor's extra rounds (pg 75-76), so this damage roll
   * carries its +2 or +4.
   *
   * Declared, and trusted, for the same reason `sneak` is: attack and damage are
   * two separate button presses in this system, so the damage roll cannot see
   * what the attack roll charged, and no state is stashed between them on
   * purpose — a boost that leaked into the *next* damage roll would be far worse
   * than one that has to be clicked twice. Which boost applies is still the
   * weapon's answer, not the caller's: a weapon with no capacitor attached — or
   * no magazine to buy one with — adds nothing however this is set. Both refusals
   * live in `payableCapacitor`, shared with `rollAttack`, so the damage roll can
   * never grant what the attack roll declined.
   */
  capacitor = false,
): Promise<void> {
  const governing = SKILLS[weaponSystem.skill].ability;
  // Statblock weapons (fixed to-hit) bake their bonus into the damage dice.
  // An Automatic weapon's extra shots drop the Agility modifier — and only
  // Agility, which is why an Energy Weapon's Perception bonus survives here.
  const suppressed = burst?.suppressAgility === true && governing === "agility";
  const mod =
    weaponSystem.attackBonusOverride !== null || suppressed
      ? 0
      : system.derived.abilityMods[governing];
  // Perks, traits, and chems (Psychosis, Strengthening) add flat damage; Rattle
  // hands takes 2 off every ranged hit, never below 1 (v2.1 pg 120).
  const diseasePenalty = weaponSystem.isRanged ? system.derived.rangedDamagePenalty : 0;
  // The capacitor's flat bonus rides in the formula rather than being added to
  // the total afterwards, so the card shows the arithmetic the player agreed to
  // when they spent the rounds.
  const boost = payableCapacitor(weaponSystem, capacitor);
  const total = mod + system.derived.damageBonus - diseasePenalty + (boost?.damage ?? 0);
  const formula = total === 0 ? weaponSystem.damage : `${weaponSystem.damage} ${signed(total)}`;

  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();

  // Melee Upgraded (pg 65): "roll a 1 or a 2 on the damage dice, the damage is
  // increased by 2" — once per qualifying die, the ruling argued in full at
  // `upgradedDamageBonus`. Added after the roll rather than folded into the
  // formula for the obvious reason: it depends on what the formula rolled.
  //
  // The Roll's own total keeps its printed arithmetic, and the bonus is added to
  // the number the Apply button actually spends, with the note saying how many
  // dice earned it — a card whose damage silently exceeds its own formula is a
  // card nobody can check.
  const upgraded = weaponSystem.hasMod("meleeUpgraded")
    ? upgradedDamageBonus(roll.dice)
    : { count: 0, bonus: 0 };
  const applied = Math.max(MINIMUM_DAMAGE, roll.total + upgraded.bonus);
  const typeSuffix = weaponSystem.damageType ? ` (${weaponSystem.damageType})` : "";
  const diseaseNote =
    diseasePenalty > 0
      ? ` ${game.i18n.localize("FALLOUT.Diseases.damagePenalty", { penalty: diseasePenalty })}`
      : "";
  const sneakNote = sneak ? ` ${game.i18n.localize("FALLOUT.Roll.sneakDamage")}` : "";
  // Corrosive (pg 69) triggers on damage that *reaches hit points*, which this
  // roll cannot know and the Apply pipeline computes exactly. So the property
  // rides on the flag rather than resolving here, the way `sneak` and `melee`
  // already do; the note only tells the reader what the button is about to do.
  const corrosive = weaponSystem.keywords.corrosive;
  const corrosiveNote = corrosive ? ` ${game.i18n.localize("FALLOUT.Keywords.corrosive")}` : "";
  let burstNote = "";
  if (burst) {
    burstNote = ` ${game.i18n.localize(
      suppressed ? "FALLOUT.Keywords.burstShot" : "FALLOUT.Keywords.burstShotKeepsMod",
      { shot: burst.shot, ability: game.i18n.localize(`FALLOUT.Abilities.${governing}`) },
    )}`;
  }
  const capacitorNote = boost
    ? ` ${game.i18n.localize("FALLOUT.Mods.capacitorDamage", {
        mod: game.i18n.localize(`FALLOUT.Mods.names.${boost.mod}`),
        rounds: boost.rounds,
        damage: boost.damage,
      })}`
    : "";
  const upgradedNote =
    upgraded.bonus > 0
      ? ` ${game.i18n.localize("FALLOUT.Mods.upgraded", {
          count: upgraded.count,
          bonus: upgraded.bonus,
          total: applied,
        })}`
      : "";
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${weapon.name} — ${game.i18n.localize("FALLOUT.Roll.damage")}${typeSuffix}${diseaseNote}${capacitorNote}${upgradedNote}${sneakNote}${corrosiveNote}${burstNote}`,
    // Read by the renderChatMessageHTML hook to offer GMs an Apply button.
    // `melee` picks between the general DT and the one a Block raised; `sneak`
    // bypasses stamina and counts double against a dying target; `corrosive`
    // decays the target's armor if the damage reaches their hit points.
    //
    // `attacker` is who swung, which the damage pipeline otherwise never learns
    // — it knows the defender and nothing else. Reactive Plates (pg 59) is the
    // one printed rule that needs the other end of the exchange, and the Apply
    // button is where both ends are in the same place. Stored as an actor id
    // rather than a document, because a flag is JSON; the button also falls
    // back to the message's own speaker, which carries the same id.
    flags: {
      "fallout-ttrpg": {
        damage: {
          total: applied,
          type: weaponSystem.damageType,
          melee: !weaponSystem.isRanged,
          sneak,
          corrosive,
          attacker: actor.id,
        },
      },
    },
  });
}

/**
 * Automatic fire (pg 69).
 *
 * > When you spend AP to attack with a weapon that has this property, you can
 * > make a number of additional attacks **without spending any additional AP**,
 * > the target of these additional attacks must be within 10 feet of the
 * > previous target and you do not add your agility modifier to the damage of
 * > the additional attacks.
 *
 * So a burst is the paid attack plus N free ones. Three things the rule leaves
 * open, decided here and stated on the card:
 *
 * - **Ammunition is never mentioned**, and the book has no general "an attack
 *   costs a round" rule either. One round per attack is the only reading the
 *   rest of the book supports (the Minigun's bespoke "uses 10 per attack" note
 *   and the capacitor mods' "instead of 1" both imply a baseline of one), so a
 *   burst of N extra shots consumes N+1 rounds — and stops early if the
 *   magazine runs dry mid-burst.
 * - **Separate attack rolls**: the entry says "make a number of additional
 *   attacks", and the book says so explicitly when it means one shared roll
 *   (Cleave) or none at all (Area of Effect).
 * - **Only Agility is suppressed.** An Energy Weapon adds Perception "instead
 *   of any other ability modifier" (pg 70), and Automatic names Agility alone,
 *   so by the letter a Gatling laser keeps its Perception bonus on every shot.
 *   Almost certainly not intended; kept as printed, and flagged on the card.
 *
 * **`options` reaches every shot in the burst**, which is the only arrangement
 * that survives contact with the rules that read it. It took no options at all
 * until pg 128's blind attack acquired a caller: an unforwarded burst against a
 * heavily obscured target asked for a distance it had not been given, once per
 * shot, and fired nothing. Cover, distance and the capacitor are forwarded for
 * the same reason — they describe the shot, and every shot in a burst is at the
 * same target's cover and the same distance.
 */
export async function rollAutomaticBurst(
  actor: FoundryActor,
  system: CharacterData,
  weapon: FoundryItem,
  weaponSystem: WeaponData,
  mode: RollMode,
  options: AttackOptions = {},
): Promise<void> {
  const extra = weaponSystem.keywords.automatic;
  if (extra === null || extra <= 0) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Keywords.notAutomatic"));
    return;
  }

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: game.i18n.localize("FALLOUT.Keywords.burstHeader", {
      weapon: weapon.name,
      shots: extra + 1,
      extra,
      feet: AUTOMATIC_CHAIN_FEET,
    }),
  });

  // The paid attack: an ordinary one, ability modifier and all.
  await rollAttack(actor, system, weapon, weaponSystem, mode, options);
  await rollDamage(actor, system, weapon, weaponSystem, false, undefined, options.capacitor === true);

  for (let shot = 1; shot <= extra; shot += 1) {
    // Re-read the weapon: the first attack spent a round, and so does each of
    // these. Running dry ends the burst rather than firing on an empty chamber.
    const current = weapon.system as WeaponData;
    if (current.magazineSize > 0 && current.loadedAmmo <= 0) {
      await foundry.documents.ChatMessage.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        content: game.i18n.localize("FALLOUT.Keywords.burstDry", { fired: shot - 1 }),
      });
      return;
    }
    // The free shots inherit the situation but not the purchase. A capacitor is
    // bought per attack ("you can spend 2 rounds of ammunition instead of 1"),
    // and one tick of a checkbox must not spend up to 3 rounds on each of N+1
    // shots — that empties a magazine from a single click, and `rollAttack`
    // would then refuse mid-burst with rounds already gone. The free shots are
    // the diminished echo of the paid one anyway (no AP, no Agility on the
    // damage), so the reading that keeps the purchase with the paid attack is
    // both the cheaper and the less surprising one. A table that wants every
    // shot boosted fires them singly.
    await rollAttack(actor, system, weapon, current, mode, {
      ...options,
      capacitor: false,
      free: true,
    });
    await rollDamage(actor, system, weapon, current, false, { suppressAgility: true, shot });
  }
}

/**
 * Blind attack (pg 128).
 *
 * > If you are blinded, or your target is heavily obscured but not behind total
 * > cover, any attack you make against them is a blind attack. When you make a
 * > blind attack, you add your Luck ability modifier to your roll **instead of**
 * > your normal modifier. **Instead of beating your target's AC**, your Luck
 * > ability check must beat the blind attack DC. The DC is equal to 5 + the
 * > amount of feet your target is away from you, rounded down in increments of 5.
 *
 * **This roll IS the attack, and its success IS the hit.** Both "instead of"s
 * are replacements, not additions: Luck stands in for the skill bonus, and the
 * DC stands in for the target's AC. This function and its card used to say
 * "found the target — roll the attack", which made a blinded character clear
 * two gates — the Luck check *and* an ordinary AC comparison — where the book
 * replaces one with the other, and so made every blind attack materially harder
 * than printed. Caught while ruling on the Infrared Scope, which is the mod
 * that exempts you from this whole paragraph.
 */
export async function rollBlindAttack(
  actor: FoundryActor,
  system: CharacterData,
  distanceFeet: number,
  context: {
    /** The weapon the shot was made with, when one routed here. */
    weapon?: string;
    /** Which half of pg 128's sentence put the shooter here. */
    reason?: "blinded" | "obscured";
  } = {},
): Promise<boolean> {
  // Spray and Pray (pg 49): *"Whenever you make a blind attack, you have
  // advantage on the attack roll. Additionally, the blind attack DC is
  // halved."* The advantage half arrives on its own, through the Active Effect
  // the compendium builds onto `advantage.checks.blindAttack` — which is why
  // the mode below is asked for as "normal" and comes back as advantage. The
  // halving has no effect key to ride on (it changes a DC, not a sheet field),
  // so the perk is looked up by name, the one hook a clause like this has.
  const sprayAndPray = hasPerk(actor, SPRAY_AND_PRAY);
  // One formula, shared with the Infrared Scope's card (`blindAttackDC`).
  // This line used to read `5 + floor(feet / 5)`, which is the *increments*
  // and not the feet: at 30 ft it produced DC 11 where the book asks for 35,
  // making every blind attack roughly seven times easier than printed. The
  // scope slice computed the DC correctly for its card and the two shipped
  // side by side for one commit, which is how it surfaced.
  const dc = blindAttackDC(distanceFeet, sprayAndPray);
  const rolled = effectiveMode(system, ["luck", checkScope("blindAttack")], "normal");
  // Luck rolls ignore leveled-condition penalties (v2.1 pg 25).
  const roll = new foundry.dice.Roll(
    [d20Formula(rolled), signed(system.derived.abilityMods.luck), ...d20Modifiers(system, "luck")]
      .join(" "),
  );
  await roll.evaluate();
  const hit = roll.total >= dc;
  // Where this roll came from, for the same reason the attack card says where an
  // unrequested sneak attack came from: an ordinary attack that silently turned
  // into a Luck check is one nobody at the table can check.
  const reasonNote =
    context.reason === undefined
      ? ""
      : ` ${game.i18n.localize(
          context.reason === "blinded"
            ? "FALLOUT.Roll.blindBecauseBlinded"
            : "FALLOUT.Roll.blindBecauseObscured",
          { weapon: context.weapon ?? "" },
        )}`;
  const sprayNote = sprayAndPray
    ? ` ${game.i18n.localize("FALLOUT.Roll.blindSprayAndPray", { dc })}`
    : "";
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${game.i18n.localize("FALLOUT.Roll.blindAttack", {
      dc,
      distance: distanceFeet,
    })}${modeSuffix(rolled)} — ${game.i18n.localize(
      hit ? "FALLOUT.Roll.blindHit" : "FALLOUT.Roll.blindMiss",
    )}${reasonNote}${sprayNote}`,
  });
  return hit;
}

/**
 * Frightened check (v2.1 pg 134) — reworked this edition. The check is now an
 * Endurance **or** Charisma ability check against `8 + the frightening
 * creature's Intimidation bonus`; v2.0 allowed Endurance only. Succeeding by
 * 10 or more escapes it outright (v2.0 said 5), and a critical failure doubles
 * the duration, a tier v2.0 did not have.
 *
 * Which of Flight/Fight/Freeze/Fawn applies is the player's choice, so this
 * reports the tier reached and leaves the mode to the table.
 */
export async function rollFrightenedCheck(
  actor: FoundryActor,
  system: CharacterData,
  dc: number,
  ability: "endurance" | "charisma" = "endurance",
): Promise<void> {
  const rolled = effectiveMode(system, [ability, checkScope("resistFrightened")], "normal");
  const parts = [
    d20Formula(rolled),
    signed(system.derived.abilityMods[ability]),
    ...d20Modifiers(system, ability),
  ];
  const roll = new foundry.dice.Roll(parts.join(" "));
  await roll.evaluate();
  const raw = keptD20(roll);
  const margin = roll.total - dc;

  let outcome: string;
  if (raw === 1) outcome = "FALLOUT.Frightened.criticalFailure";
  else if (margin >= 10) outcome = "FALLOUT.Frightened.escaped";
  else if (margin >= 0) outcome = "FALLOUT.Frightened.halfDuration";
  else if (margin <= -5) outcome = "FALLOUT.Frightened.flightOrFreeze";
  else outcome = "FALLOUT.Frightened.fullDuration";

  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${game.i18n.localize("FALLOUT.Frightened.flavor", {
      dc,
      ability: game.i18n.localize(`FALLOUT.Abilities.${ability}`),
    })}${modeSuffix(rolled)} — ${game.i18n.localize(outcome)}`,
  });
}

/**
 * Improvised attack (v2.1 pg 128): grab whatever is to hand. Damage and AP
 * come from the object's Load; the attack uses Melee Weapons, and damage adds
 * the Strength modifier like any other melee swing.
 */
export async function rollImprovisedAttack(
  actor: FoundryActor,
  system: CharacterData,
  load: number,
  mode: RollMode,
  thrown = false,
): Promise<void> {
  const tier = improvisedTier(load);
  const bonus = system.derived.skillBonuses.meleeWeapons;
  const rolled = effectiveMode(system, ["strength", "attack"], mode);
  // Throwing a toaster at somebody is still an attack roll, so the pg 129 limb
  // conditions' flat attack penalty reaches it — see `rollAttack`.
  const attackMod = system.derived.attackBonus;
  const attack = new foundry.dice.Roll(
    [
      d20Formula(rolled),
      signed(bonus),
      ...d20Modifiers(system),
      ...(attackMod === 0 ? [] : [signed(attackMod)]),
    ].join(" "),
  );
  await attack.evaluate();

  const range = improvisedThrowRange(tier, system.derived.abilityScores.strength);
  const detail = thrown
    ? game.i18n.localize("FALLOUT.Improvised.thrownRange", {
        normal: range.normal,
        long: range.long,
      })
    : "";
  const caveat = isUnprintedLoadGap(load)
    ? ` ${game.i18n.localize("FALLOUT.Improvised.loadGap")}`
    : "";

  const apNote = await noteActionPoints(actor, tier.apCost);
  await attack.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${game.i18n.localize("FALLOUT.Improvised.flavor", {
      load,
      ap: tier.apCost,
    })}${modeSuffix(rolled)} ${detail}${caveat}${apNote === null ? "" : ` ${apNote.line}`}`,
  });

  const mod = system.derived.abilityMods.strength + system.derived.damageBonus;
  const damage = new foundry.dice.Roll(
    mod === 0 ? tier.damage : `${tier.damage} ${signed(mod)}`,
  );
  await damage.evaluate();
  await damage.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.localize("FALLOUT.Improvised.damage"),
    flags: {
      "fallout-ttrpg": {
        damage: {
          total: damage.total,
          type: "bludgeoning",
          melee: true,
          attacker: actor.id,
        },
      },
    },
  });

  // Improvising something at someone is still attacking, so it ends a block.
  await endBlocking(actor);
}

/**
 * Death Save (pg 133): 2 AP, `d20 + your Luck **or** Endurance modifier + your
 * Party Nerve bonus`, vs DC 10. Nat 1 counts as two failures; nat 20 regains 1
 * HP outright. Three successes stabilize at 1 HP; three failures kill (four for
 * a Human — Tenacity, pg 8).
 *
 * **The election is the player's, and it is not simply the larger modifier.**
 * The book prints "your Luck or Endurance modifier" and offers no tiebreak, so
 * `ability` declares it. What the default compares is the *effective* total
 * rather than the raw modifier, because the two are not scored the same way:
 * Luck rolls ignore the leveled penalties entirely (pg 124, 132-134), so a
 * starving, irradiated character can be better off electing a Luck modifier
 * lower than their Endurance one. Comparing raw modifiers would elect Endurance
 * and then hand it a penalty the player never saw coming.
 *
 * **This roll used to carry no `d20Modifiers` at all** — the one d20 roll in the
 * system that skipped them, against fourteen call sites that do not. Two things
 * were wrong as a result: the leveled penalties never reached a death save, so
 * the Luck exemption was satisfied by accident rather than by rule and the
 * Endurance branch was wrong in the player's favour; and no perk or chem
 * `d20Bonus` reached one either.
 */
export async function rollDeathSave(
  actor: FoundryActor,
  system: CharacterData,
  ability?: "luck" | "endurance",
): Promise<void> {
  // The only thing that separates the two is the leveled penalty, so the
  // comparison is one subtraction rather than a second call into the modifiers.
  const elected =
    ability ??
    (system.derived.abilityMods.luck >=
    system.derived.abilityMods.endurance - system.derived.d20Penalty
      ? "luck"
      : "endurance");
  const mod = system.derived.abilityMods[elected];
  const rolled = effectiveMode(system, [elected, checkScope("deathSave")], "normal");
  // Party Nerve is a party-wide number; a perk can add to this character's
  // share of it, which is what `partyNerve` in the bonus keys is for.
  const nerve = currentPartyNerve() + system.derived.partyNerveBonus;
  const parts = [d20Formula(rolled), signed(mod), ...d20Modifiers(system, elected)];
  if (nerve !== 0) parts.push(signed(nerve));
  const roll = new foundry.dice.Roll(parts.join(" "));
  await roll.evaluate();
  const raw = keptD20(roll);

  let successes = system.resources.deathSaves.successes;
  let failures = system.resources.deathSaves.failures;
  let outcomeKey: string;
  let hp = 0;

  // v2.1 "Tenacity" (pg 8): Humans die on the fourth failure, everyone else
  // still on the third.
  const fatal = deathSaveFailureLimit(system.details.race);

  if (raw === 20) {
    outcomeKey = "FALLOUT.DeathSave.nat20";
    hp = 1;
    successes = 0;
    failures = 0;
  } else if (raw === 1) {
    failures = Math.min(fatal, failures + 2);
    outcomeKey = "FALLOUT.DeathSave.nat1";
  } else if (roll.total >= DEATH_SAVE_DC) {
    successes = Math.min(3, successes + 1);
    outcomeKey = "FALLOUT.DeathSave.success";
  } else {
    failures = Math.min(fatal, failures + 1);
    outcomeKey = "FALLOUT.DeathSave.failure";
  }

  if (failures >= fatal) outcomeKey = "FALLOUT.DeathSave.dead";
  else if (successes >= 3) {
    outcomeKey = "FALLOUT.DeathSave.stabilized";
    hp = 1;
    successes = 0;
    failures = 0;
  }

  await actor.update({
    "system.resources.hp.value": hp,
    "system.resources.deathSaves.successes": successes,
    "system.resources.deathSaves.failures": failures,
  });
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `${game.i18n.localize("FALLOUT.DeathSave.flavor", {
      successes,
      failures,
    })} ${game.i18n.localize("FALLOUT.DeathSave.usingAbility", {
      ability: game.i18n.localize(`FALLOUT.Abilities.${elected}`),
    })}${modeSuffix(rolled)} — ${game.i18n.localize(outcomeKey)}`,
  });
}
