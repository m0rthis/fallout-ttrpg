/**
 * Hiding, detection, Surprise, and the sneak attack's trigger
 * (pg 21, 24, 116, 118, 125, 127, 128, 134).
 *
 * Pure rules only — no documents, no Foundry globals, no i18n. The half that
 * rolls dice and writes effects is `src/actions/stealth.ts`.
 *
 * This chapter is spread across five pages that were plainly not written in one
 * sitting, and the three of them that state the *same* comparison state it
 * three different ways. Rather than pick one silently, every disagreement is
 * quoted below and settled once, here, where the arithmetic is.
 *
 * ## The one term with two names
 *
 * pg 21 defines **Passive Sense** — *"A measurement of your senses at all times
 * … Your passive sense score is equal to 12 + your Perception modifier."* pg 24
 * calls the identical quantity **passive Perception**. There is no second score:
 * "passive Perception" is defined nowhere in 136 pages, and pg 127's Hide entry
 * uses "passive sense" for the same comparison pg 24 describes. One term.
 *
 * ## What Hide does *not* do
 *
 * pg 127 sends the reader to an *"Unseen Attackers and Targets"* section for the
 * benefits of hiding. **That section does not exist.** The phrase occurs exactly
 * once in the book — in the cross-reference itself. The benefits therefore have
 * to be gathered from where they actually print:
 *
 * - pg 24: *"If you attack a creature who you are hidden from, you gain
 *   advantage on the attack roll."*
 * - pg 128: the sneak attack, which requires something hiding alone does not
 *   supply — see `canSneakAttack`.
 *
 * That is the whole of it. Nothing else in the book attaches a benefit to being
 * hidden, so nothing else is claimed here.
 */

import type { CoverDegree } from "./cover";

// ------------------------------------------------------------------ AP costs

/**
 * *"On your turn you can spend 6 AP to hide"* (pg 24), and the pg 126 Actions in
 * Combat table prints Hide at 6 AP. The two agree, which in this chapter is
 * worth noting.
 */
export const HIDE_AP_COST = 6;

/**
 * Search, 3 AP (pg 126 table): *"You make an active perception check to look for
 * someone or something hidden."* (pg 127)
 *
 * pg 126's own improvised-action guide prices *"making an active perception
 * check to find something in the area"* at 3 AP as its worked example, so the
 * table row and the guide corroborate each other.
 */
export const SEARCH_AP_COST = 3;

// ------------------------------------------------- the comparison, settled once

/**
 * Whether a Sneak total beats a passive sense score.
 *
 * **The book says this three times and does not agree with itself.** Quoted in
 * full, because the ruling is a nose-count and the reader deserves the count:
 *
 * - pg 21 (the definition of Passive Sense): *"Creatures that sneak remain
 *   undetected if they roll **higher than** your passive sense score."*
 * - pg 24 (the Sneak skill): *"your Sneak skill check total is **equal to or
 *   greater than** their passive Perception, then you are hidden from them"*.
 * - pg 127 (the Hide action): *"a Sneak check with the DC equal to any nearby
 *   enemies passive sense scores … You are hidden from any enemies that have a
 *   **lower** passive sense compared to your sneak roll."*
 * - pg 116 (Passive Sneak, while travelling): *"Creatures whose passive sense is
 *   **lower** than their score cannot detect the party."*
 *
 * Three of the four make the tie a detection; one makes it a hide. Note pg 127
 * contains both readings in consecutive sentences — "the DC equal to" implies
 * the book's ordinary meets-it-beats-it DC handling, and the sentence after it
 * says *lower*. So the tie-succeeds reading rests on pg 24 plus an inference
 * from the word "DC"; the strictly-greater reading is printed, in those words,
 * on three separate pages including the definition of the score itself.
 *
 * **Ruled: strictly greater.** A tie is a detection. The dissent is pg 24 and it
 * is not repaired here — it is a one-point difference on a roll, and repairing
 * it by preferring the skill chapter over the definition, the action, and the
 * travel table would be the harder sentence to defend.
 */
export function beatsPassiveSense(sneakTotal: number, passiveSense: number): boolean {
  return sneakTotal > passiveSense;
}

/**
 * The DC pg 127 names: *"a Sneak check with the DC equal to any nearby enemies
 * passive sense scores"*.
 *
 * The sentence is plural and gives one DC, which cannot be literally true when
 * two enemies have different scores. The rest of the same entry answers it —
 * *"You are hidden from any enemies that have a lower passive sense compared to
 * your sneak roll"* — so hiding is resolved **per enemy**, and this single
 * number is only the bar for hiding from *all* of them: the highest score in the
 * room. `hideOutcomes` is what actually decides the rule; this is the headline.
 *
 * @returns the highest passive sense among the observers, or null when there are
 *          none — an empty room has no DC, and inventing one (10? 12?) would be
 *          inventing a rule.
 */
export function hideDC(observerPassiveSenses: readonly number[]): number | null {
  if (observerPassiveSenses.length === 0) return null;
  return Math.max(...observerPassiveSenses);
}

/** One observer, and whether this Sneak total got past them. */
export interface HideOutcome<T> {
  observer: T;
  passiveSense: number;
  hidden: boolean;
}

/**
 * Resolve a Sneak total against every observer separately (pg 127).
 *
 * Hiding is not all-or-nothing in this edition: *"You are hidden from any
 * enemies that have a lower passive sense compared to your sneak roll"* — so one
 * roll can hide you from the two guards and not from their sergeant, and pg 125
 * says the same thing about Surprise (*"A member of a group can be surprised
 * even if the other members aren't"*).
 */
export function hideOutcomes<T extends { passiveSense: number }>(
  sneakTotal: number,
  observers: readonly T[],
): HideOutcome<T>[] {
  return observers.map((observer) => ({
    observer,
    passiveSense: observer.passiveSense,
    hidden: beatsPassiveSense(sneakTotal, observer.passiveSense),
  }));
}

// ---------------------------------------------------------------- concealment

/**
 * The concealment a creature has right now, as declared.
 *
 * Cover is not measured by this system — it is declared per attack, and the
 * reasoning is in `src/rules/cover.ts` and the `AttackOptions` docstring. Hiding
 * asks the same question of the same fiction, so it takes the same declaration
 * rather than growing a second, incompatible model of what a wall is.
 */
export interface Concealment {
  /** The declared degree of cover (pg 130). */
  cover: CoverDegree;
  /**
   * A heavily obscured area (pg 118): *"darkness, opaque fog, or dense
   * foliage—blocks vision entirely. A creature effectively suffers from the
   * blinded condition when trying to see something in that area."*
   */
  heavilyObscured: boolean;
  /** The Invisible condition (pg 134). */
  invisible: boolean;
}

/** Nothing between you and them. */
export const NO_CONCEALMENT: Concealment = {
  cover: "none",
  heavilyObscured: false,
  invisible: false,
};

/**
 * Whether the creature may take the Hide action at all.
 *
 * pg 127: *"In order to hide you must be heavily obscured or within full
 * cover."* pg 130 calls that degree "total cover"; pg 127 calls it "full cover";
 * `src/rules/cover.ts` already rules those are one degree under two names.
 *
 * **pg 24 disagrees and is not followed.** The Sneak skill entry says only *"if
 * you have cover against any creatures"* — any degree, half included. pg 127 is
 * the action, states a requirement in the imperative ("you must"), and is the
 * page that also states how hiding *ends*; taking pg 24's looser reading would
 * make the pg 127 sentence do nothing at all. So: full cover, heavy obscurement,
 * or nothing.
 *
 * Invisible qualifies, and that is printed rather than inferred — pg 134:
 * *"An invisible creature is impossible to see. **For the purpose of hiding, the
 * creature is heavily obscured.**"*
 */
export function canHide(concealment: Concealment): boolean {
  return (
    concealment.cover === "total" || concealment.heavilyObscured || concealment.invisible
  );
}

/**
 * Whether hiding has broken because the concealment went away (pg 127):
 * *"If you are no longer within full cover of an enemy you are hidden from, you
 * are no longer hidden."*
 *
 * **Read exactly as printed, including its asymmetry.** The requirement to hide
 * is "heavily obscured **or** within full cover"; the sentence that breaks it
 * names only full cover. Taken literally, a creature hiding in darkness never
 * stops hiding, however the darkness changes — which is plainly not intended and
 * is equally plainly what the book says. This returns true only for the printed
 * trigger, and `src/actions/stealth.ts` prints the gap on the card so a GM can
 * call the obscurement case themselves. Extending the sentence to cover
 * obscurement would be writing the rule the book skipped.
 */
export function hidingBroken(concealment: Concealment): boolean {
  return concealment.cover !== "total";
}

// ------------------------------------------------------------ being found out

/** How a detection contest came out (pg 24). */
export type DetectionResult = "detected" | "stillHidden";

/**
 * The contest pg 24 prescribes when somebody already knows you are *there*:
 *
 * > If a creature is aware of your presence, but cannot see you because you are
 * > hidden, they may make a Perception check contested against a Sneak check
 * > from you. If their total is higher, you are no longer hidden. If your total
 * > is higher, then you remain hidden.
 *
 * Two things worth saying out loud:
 *
 * - **A tie is not addressed.** The sentence covers "their total is higher" and
 *   "your total is higher" and stops. Ruled in favour of the hider, on the
 *   narrow ground that neither printed branch fires, so nothing changes the
 *   state the creature is already in. That is the same shape as the ruling one
 *   line up in `beatsPassiveSense` — which cuts the other way — because these
 *   are two different sentences with two different silences, not one rule.
 * - **The hider rolls again.** "contested against a Sneak check from you" is a
 *   new check, not the total recorded when they hid. The searcher's own roll is
 *   new too, so freezing one side and not the other would be the odd choice.
 */
export function detectionOutcome(
  searcherPerceptionTotal: number,
  hiderSneakTotal: number,
): DetectionResult {
  return searcherPerceptionTotal > hiderSneakTotal ? "detected" : "stillHidden";
}

// ------------------------------------------------------------------- Surprise

/** One creature on the opposing side, weighed against the hiders (pg 125). */
export interface SurpriseOutcome<T> {
  creature: T;
  passiveSense: number;
  /** The Sneak totals this creature failed to beat — the threats it missed. */
  missed: number[];
  /** The Sneak totals this creature's passive sense caught. */
  noticed: number[];
  surprised: boolean;
}

/**
 * Step 1 of combat (pg 125): *"The GM determines whether anyone involved in the
 * combat encounter is surprised."*
 *
 * > The GM compares the Sneak checks of anyone hiding with the passive sense
 * > score of each creature on the opposing side. Any character or creature that
 * > doesn't notice a threat is surprised at the start of the encounter. […] A
 * > member of a group can be surprised even if the other members aren't.
 *
 * Two rulings, both forced:
 *
 * - **Nobody hiding, nobody surprised.** *"If neither side tries to be stealthy,
 *   they automatically notice each other."* An empty `sneakTotals` is that case,
 *   and it short-circuits before any comparison.
 * - **"Doesn't notice *a* threat" is read as "notices none of them."** The other
 *   reading — surprised if any single threat goes unnoticed — makes a creature
 *   who has already spotted one raider still count as caught off-guard while a
 *   second one creeps up, which is not what the word means and not what the
 *   worked examples describe (raiders springing from ruins, a mutant unnoticed
 *   *until* it swings). A creature that has noticed something is in the fight.
 *   The book does not say which, so this is a ruling and both tallies are
 *   returned, not just the verdict.
 *
 * Note the comparison is the ordinary `beatsPassiveSense`: the sneaker's total
 * must exceed the sense score to go unnoticed, ties detect.
 *
 * **What Surprise costs is not enforced anywhere.** *"If you're surprised, you
 * can't move or take an action on your first turn of the combat, and you can't
 * take a reaction until that turn ends."* This system gates no AP spending (the
 * Frightened-Freeze condition hit the same wall — `src/actions/combat-actions.ts`)
 * and models no reactions at all, so that sentence is printed on the card and
 * honoured at the table. Surprise's *mechanical* teeth are the ones it grows
 * through `canSneakAttack` below: it is the book's only procedure for
 * establishing that a creature is unaware.
 */
export function surpriseOutcomes<T extends { passiveSense: number }>(
  hiderSneakTotals: readonly number[],
  opposingSide: readonly T[],
): SurpriseOutcome<T>[] {
  return opposingSide.map((creature) => {
    const missed: number[] = [];
    const noticed: number[] = [];
    for (const total of hiderSneakTotals) {
      (beatsPassiveSense(total, creature.passiveSense) ? missed : noticed).push(total);
    }
    return {
      creature,
      passiveSense: creature.passiveSense,
      missed,
      noticed,
      // "If neither side tries to be stealthy, they automatically notice each
      // other" — no hiders means no surprise, whatever anyone's senses are.
      surprised: hiderSneakTotals.length > 0 && noticed.length === 0,
    };
  });
}

// --------------------------------------------------------------- sneak attack

/**
 * Whether a sneak attack is on (pg 128):
 *
 * > **Sneak Attacks.** If an enemy cannot sense you (being invisible, heavily
 * > obscured, full cover) and are unaware of your presence. Your attacks are
 * > critical hits and ignore Stamina Points. However you still must roll attack
 * > and beat the target's AC.
 *
 * **This is the sentence that makes hiding and Surprise into two different
 * things, and it is why `sneak` on an attack roll has been a hand-set flag.**
 * The rule has two conditions joined by *and*:
 *
 * 1. **They cannot sense you** — the parenthesis is the book's own list, and it
 *    is exactly the concealment `canHide` requires. A creature that has
 *    successfully hidden satisfies this.
 * 2. **They are unaware of your presence** — and hiding, pointedly, does *not*
 *    give you this. pg 127: *"While hiding, you are acting unpredictably to
 *    confuse your enemy. **Enemies still know your general location** and can
 *    move to try and make line of sight again to notice you."*
 *
 * So the ladder the book actually builds, once the missing "Unseen Attackers and
 * Targets" section is reconstructed from the pages that do exist:
 *
 * - **Hidden** (concealed; they know roughly where you are) → *advantage* on the
 *   attack roll, pg 24, and nothing more.
 * - **Concealed *and* unaware** → *sneak attack*: an automatic critical hit that
 *   bypasses stamina points, pg 128.
 *
 * And the book's own mechanism for unawareness is **Surprise** (pg 125): *"Any
 * character or creature that doesn't notice a threat is surprised."* That is the
 * only place in 136 pages where a creature is procedurally established as not
 * knowing somebody is there. Which is the answer to "what makes a creature
 * unaware": a Sneak check that beat their passive sense *before the encounter
 * started*, not one made in front of them.
 *
 * A GM may of course declare a target unaware for reasons of fiction — asleep,
 * facing the wrong way, absorbed in a terminal — which is why `unaware` is a
 * parameter and not read off a status.
 *
 * The stamina bypass has a second, independent printing worth knowing about,
 * because it means the pg 128 clause is not an exception but an instance:
 * pg 129 says damage goes to hit points *"if they are unconscious, **unaware of
 * their surroundings**, or otherwise incapable of moving."*
 */
export function canSneakAttack(concealment: Concealment, targetUnaware: boolean): boolean {
  return targetUnaware && canHide(concealment);
}

/**
 * The Silencer weapon mod (pg 77): *"While you are hidden; any attack rolls you
 * make with a weapon that has a silencer modification does not reveal your
 * presence to nearby creatures, allowing you to remain hidden except against the
 * creature you attacked."*
 *
 * This is the only sentence in the book that says what attacking does to hiding
 * — by exception. Read backwards, it establishes the default: **attacking
 * reveals you**, to the target and to everyone nearby. That default is printed
 * nowhere directly, which is why it is derived here in the open rather than
 * assumed in a caller.
 *
 * Whether a silencer is fitted is now answerable from the weapon
 * (`WeaponData.silenced`, backlog D3); this pure function still takes the
 * boolean, because it decides what the reveal *reaches* rather than what the
 * weapon carries.
 *
 * @returns the creatures a post-attack reveal reaches: everyone, or only the
 *          creature attacked.
 */
export function revealedByAttacking(silenced: boolean): "everyone" | "targetOnly" {
  return silenced ? "targetOnly" : "everyone";
}

// ------------------------------------- attacking something you cannot see (pg 128)

/**
 * What a target's concealment does to an attack aimed at it.
 *
 * The book's cross-reference to *"Unseen Attackers and Targets"* goes nowhere
 * (see the module docstring), but the rules it would have gathered do print —
 * they are just scattered, and the Infrared Scope's targeting clause cannot be
 * ruled on without them. All three, in full:
 *
 * - **Blind Attack** (pg 128, the paragraph immediately below Sneak Attacks):
 *   *"If you are blinded, or your target is heavily obscured but not behind
 *   total cover, any attack you make against them is a blind attack. When you
 *   make a blind attack, you add your Luck ability modifier to your roll instead
 *   of your normal modifier. Instead of beating your target's AC, your Luck
 *   ability check must beat the blind attack DC."*
 * - **Invisible** (pg 134): *"Attack rolls against the creature have
 *   disadvantage, and the creature's attack rolls have advantage."* Note this is
 *   a *different* consequence from the one above, and pg 134's own "for the
 *   purpose of hiding, the creature is heavily obscured" is scoped to hiding in
 *   as many words — so an invisible target is a normal roll at disadvantage, not
 *   a blind attack.
 * - **Total cover** (pg 130): *"can't be targeted directly by an attack"*, which
 *   `blocksTargeting` in `src/rules/cover.ts` already owns and `rollAttack`
 *   already refuses on.
 *
 * `hidden` is not a fourth case: a creature that hid had to be in full cover or
 * heavily obscured to do it (`canHide`), and the Hide marker records which. So
 * hiding collapses onto the two states above and needs no separate branch —
 * which is also why nothing here has to measure anything. The concealment is the
 * same declared value cover and Hide already take.
 *
 * **The Infrared Scope** (pg 76): *"You can target creatures that are hidden,
 * shrouded, in complete darkness, or invisible so long as they are not behind
 * full cover."* Ruled: the scope's owner rolls an **ordinary attack** against
 * every one of those states, and total cover still refuses. The reasoning is
 * that the weaker reading has no content. "Target" is the book's own verb for
 * what a blind attack does — the Shadowed condition (pg 134) says an aware
 * creature *"can attempt to **target** you with a blind attack"* — so reading
 * the scope as merely granting permission to *try* grants a permission every
 * attacker already has, and the row would do nothing at all. The only reading
 * under which the sentence adds something is that it removes what the
 * concealment was doing to the roll.
 *
 * Two things the scope pointedly does **not** do, both because it says "target"
 * and not "see": it grants no Perception, no passive sense and no detection (so
 * `beatsPassiveSense`, `detectionOutcome` and the Hide marker are untouched — a
 * creature shot at through a thermal sight is still hidden, and still has pg
 * 24's advantage when it shoots back), and it is not a sense on the canvas. See
 * `reportConcealedTargeting` in `src/actions/stealth.ts` for the rest of that
 * ruling.
 *
 * *"Shrouded"* occurs exactly once in 136 pages — here. The nearest printed
 * state is the **Shadowed** condition (pg 134), whose effect is that sighted
 * creatures cannot detect you and must fall back on a blind attack, i.e. the
 * heavily-obscured branch. It is read as that, and it needs no flag of its own.
 */
export type TargetingVerdict = "normal" | "disadvantaged" | "blind" | "refused";

/**
 * @param infraredScope whether the attacking weapon carries the Infrared Scope
 *        (pg 76). Read off `WeaponData.hasMod("infraredScope")` by the caller.
 */
export function targetingThroughConcealment(
  concealment: Concealment,
  infraredScope = false,
): TargetingVerdict {
  // Printed on both sides — pg 130's total cover and the scope row's own "so
  // long as they are not behind full cover" — so this is the one branch the
  // scope cannot buy its way past.
  if (concealment.cover === "total") return "refused";
  if (infraredScope) return "normal";
  // Heavy obscurement first: a creature that is both invisible *and* in
  // darkness is attacked through the darkness, because pg 128's blind attack
  // names the obscurement and replaces the whole roll, while pg 134's
  // disadvantage only bends it. Applying the lighter rule to the heavier
  // situation would be the odd choice.
  if (concealment.heavilyObscured) return "blind";
  if (concealment.invisible) return "disadvantaged";
  return "normal";
}

/**
 * The blind attack DC (pg 128): *"The DC is equal to 5 + the amount of feet your
 * target is away from you, rounded down in increments of 5."*
 *
 * Rolled as well as reported: `rollAttack` routes into `rollBlindAttack` when
 * `blindAttackApplies` says the paragraph is in force, and the number is still
 * printed on the Infrared Scope's card so the scope's benefit is a quantity
 * somebody can see rather than an assertion.
 *
 * **Spray and Pray** (pg 49) *"the blind attack DC is halved"* — the `halved`
 * parameter. Rounding is not printed, and this system rounds a halved DC **down**
 * for the same reason it rounds the distance down: every rounding the blind
 * attack paragraph does print is downward, and the perk exists to make the shot
 * easier, so the reading that resolves a tie in the perk's favour is the one
 * that matches what the row is for. Halved after the distance is folded in, not
 * before, because the DC is what the sentence names.
 */
export const BLIND_ATTACK_DC_BASE = 5;

export function blindAttackDC(distanceFeet: number, halved = false): number {
  const feet = Math.max(0, distanceFeet);
  const dc = BLIND_ATTACK_DC_BASE + Math.floor(feet / 5) * 5;
  return halved ? Math.floor(dc / 2) : dc;
}

/** The perk that halves the DC above and grants advantage on the roll (pg 49). */
export const SPRAY_AND_PRAY = "Spray and Pray";

/**
 * Whether pg 128 replaces this attack outright.
 *
 * > If you are blinded, or your target is heavily obscured but not behind total
 * > cover, any attack you make against them is a blind attack.
 *
 * **"Is", not "may be".** The paragraph does not offer a blind attack as an
 * option, so this is a gate on the ordinary attack rather than a button beside
 * it — which is why `rollAttack` asks before it rolls anything, and why the
 * override that exists (`AttackOptions.blindAttack`) is a declaration for a GM
 * running something unprinted rather than a player's choice.
 *
 * Two halves, and only one of them is about the target:
 *
 * - **The target is heavily obscured.** `targetingThroughConcealment` already
 *   owns this, including the Infrared Scope's exemption and total cover's
 *   refusal, so it is asked rather than re-derived. Its `"disadvantaged"`
 *   verdict — an invisible target, pg 134 — is deliberately *not* a blind
 *   attack: that rule bends the roll where this one replaces it.
 * - **You are blinded.** The attacker's own condition, which no concealment
 *   function knows about.
 *
 * **Ruling: the Infrared Scope does not rescue a blinded attacker.** The row
 * says you can *target* creatures that are shrouded, in complete darkness or
 * invisible — every one of those is a statement about where the target is, and
 * the scope is a sight. A character who cannot see cannot see through it either.
 * So the scope is passed to the concealment half and ignored by this one.
 *
 * Total cover still refuses the attack outright and is not a blind attack, so a
 * `"refused"` verdict returns false here and `rollAttack`'s own cover check —
 * which runs first — is what stops the shot.
 */
export function blindAttackApplies(options: {
  /** The attacker has the Blinded condition (pg 133). */
  attackerBlinded: boolean;
  /** What the target presents; pass `NO_CONCEALMENT` when nothing is declared. */
  concealment: Concealment;
  /** Whether the attacking weapon carries the Infrared Scope (pg 76). */
  infraredScope?: boolean;
}): boolean {
  const verdict = targetingThroughConcealment(options.concealment, options.infraredScope ?? false);
  if (verdict === "refused") return false;
  if (options.attackerBlinded) return true;
  return verdict === "blind";
}

// ------------------------------------------ On-Board Target Tracking (pg 76)

/**
 * *"Before you make an attack with a weapon that has this modification, you can
 * spend 6 AP to mark a target creature within the weapon's short range."*
 *
 * Six, and it is the mod's whole price in AP — reported, never deducted
 * (backlog E1), like every other cost in this chapter.
 */
export const TARGET_MARK_AP_COST = 6;

/**
 * *"…to mark a target creature within the weapon's short range"* (pg 76).
 *
 * "Short range" is the first of the two numbers on the weapon table's Range
 * column, i.e. `weaponRange().normal` — the same quantity pg 66 calls short
 * range and pg 21 calls normal range, already ruled one thing by
 * `src/rules/formulas.ts`. *Within* is inclusive here for the same reason
 * `rangeBand` puts a shot at exactly the normal range inside it: both printings
 * penalise only distances *beyond* a number.
 */
export function withinMarkRange(distanceFeet: number, shortRangeFeet: number): boolean {
  return Math.max(0, distanceFeet) <= shortRangeFeet;
}

// -------------------------------------------------- Passive Sneak (travelling)

/**
 * The three travel paces (pg 116). Distance and fatigue belong to the Movement
 * chapter; what is here is the detection half only.
 */
export const TRAVEL_PACES = ["slow", "normal", "fast"] as const;
export type TravelPace = (typeof TRAVEL_PACES)[number];

/**
 * The Passive Sneak base per pace, read off the pg 116 Travel Pace table:
 * slow 15, normal 12, fast 10, each *"+ Average Group Sneak Bonus"*.
 *
 * Note the table says **bonus** where pg 4 and pg 24 say Sneak *modifier* — the
 * same slip `groupSneak()` in `src/rules/formulas.ts` already rules on, and in
 * the direction that function chose. Three printings, two of them "modifier",
 * one "bonus"; the code averages the bonus, and this table is the printing that
 * agrees with it.
 */
export const PASSIVE_SNEAK_BASE: Record<TravelPace, number> = {
  slow: 15,
  normal: 12,
  fast: 10,
};

/**
 * The party's Passive Sneak at a pace (pg 116) — the second consumer of Group
 * Sneak, and until now the score had no consumer at all.
 */
export function passiveSneak(pace: TravelPace, groupSneakBonus: number): number {
  return PASSIVE_SNEAK_BASE[pace] + groupSneakBonus;
}

/**
 * *"Creatures whose passive sense is lower than their score cannot detect the
 * party while they travel"* (pg 116) — the same strictly-greater comparison as
 * everywhere else, stated from the other side.
 *
 * The rest of that sentence stays with the GM, as printed: *"unless (to GM's
 * discretion) the party blows their cover by entering combat, making lots of
 * noise, or becoming obvious to their surroundings."*
 */
export function travelsUndetectedBy(observerPassiveSense: number, partyPassiveSneak: number): boolean {
  return observerPassiveSense < partyPassiveSneak;
}
