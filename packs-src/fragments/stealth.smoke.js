// Smoke steps for hiding, detection and Surprise (pg 24, 125, 127, 128), and
// for the remaining pg 126 combat actions — Dodge, Shove, Take Cover, Search,
// Stand, Stow and Equip (pg 126-127).
//
// Paste into the in-page suite of scripts/smoke.mjs, after the combat-actions
// block. `ActorClass`, `stamp`, `api`, `actor`, `step`, `settle` and `until`
// all come from the surrounding scope. Every document created here is SMOKE-
// prefixed and deleted at the end — nothing inherits state from an earlier
// block and nothing is left behind for a later one, which is what broke this
// suite twice before.
//
// Step letters 8ka-8kv are claimed here; 8h/8i/8j are left free for the other
// briefs landing in this release.
//
// Required on globalThis.falloutTTRPG before these run:
//   rules  — beatsPassiveSense, hideDC, hideOutcomes, canHide, hidingBroken,
//            detectionOutcome, surpriseOutcomes, canSneakAttack,
//            revealedByAttacking, passiveSneak, HIDE_AP_COST, SEARCH_AP_COST,
//            COMBAT_ACTION_AP, dodgeBenefitLost, dodgeApplies, shoveSucceeds,
//            bestShoveDefense, shoveAllowed, weaponsDroppedByEquipping
//   actions — hide, hiddenState, revealHidden, breakHidingOnCover,
//             revealAfterAttacking, searchFor, determineSurprise, isSurprised,
//             endSurprise, sneakAttackPosture, dodge, dodgeState, useDodgeMove,
//             endDodge, shove, takeCover, takingCover, leaveCover, standUp,
//             stowWeapon, equipWeapon, heldWeapons, passiveSenseOf,
//             cannotSpendApToMove

// The suite's own formulaOf() reads the *last* message; several of these actions
// post two rolls (a Search and the contested Sneak, a Shove and its defence), so
// these walk back rather than counting positions.
const stealthFormulaBack = (back) =>
  String(game.messages.contents.at(back)?.rolls?.[0]?.formula ?? "").replace(/\s+/g, "");
const stealthLastD20 = (skip = 0) => {
  let seen = 0;
  for (let back = -1; back >= -8; back -= 1) {
    const formula = stealthFormulaBack(back);
    if (!formula.includes("d20")) continue;
    if (seen === skip) return formula;
    seen += 1;
  }
  return "";
};

// Two purpose-built NPCs: a guard to be hidden from, and a body to be shoved.
// Built here and deleted at the end of the block.
const guard = await ActorClass.create({ name: `SMOKE-Guard-${stamp}`, type: "npc" });
await guard.update({ "system.abilities.perception.value": 6 });
const brute = await ActorClass.create({ name: `SMOKE-Brute-${stamp}`, type: "npc" });
await brute.update({ "system.abilities.agility.value": 8, "system.skills.unarmed.points": 0 });
await settle();
const guardSense = api.passiveSenseOf(guard);

// 8ka. the comparison the book states three different ways, settled one way.
//      pg 21 "higher than", pg 127 "lower passive sense", pg 116 "lower than"
//      against pg 24's "equal to or greater than" — three to one, and a tie
//      is therefore a detection.
step(
  "a Sneak total must exceed passive sense, so a tie detects (pg 21/116/127 over pg 24)",
  api.beatsPassiveSense(13, 12) === true &&
    api.beatsPassiveSense(12, 12) === false &&
    api.beatsPassiveSense(11, 12) === false,
  JSON.stringify({
    over: api.beatsPassiveSense(13, 12),
    tie: api.beatsPassiveSense(12, 12),
    under: api.beatsPassiveSense(11, 12),
  }),
);

// 8kb. pg 127's DC is plural and gives one number; the same entry resolves it
//      per enemy, so the single DC is the highest score in the room — and an
//      empty room has no DC rather than an invented one
step(
  "the Hide DC is the highest nearby passive sense, and null with no observers",
  api.hideDC([12, 15, 9]) === 15 && api.hideDC([]) === null,
  JSON.stringify({ dc: api.hideDC([12, 15, 9]), empty: api.hideDC([]) }),
);

// 8kc. and one roll resolves per observer: hidden from the two, seen by the third
const outcomes = api.hideOutcomes(14, [
  { passiveSense: 12 },
  { passiveSense: 13 },
  { passiveSense: 14 },
]);
step(
  "one Sneak roll hides from some observers and not others (pg 127)",
  outcomes.filter((o) => o.hidden).length === 2 && outcomes[2].hidden === false,
  JSON.stringify(outcomes.map((o) => [o.passiveSense, o.hidden])),
);

// 8kd. pg 127 requires heavy obscurement or full cover; pg 24's looser "if you
//      have cover" is the reading this system declines, because taking it would
//      leave the pg 127 sentence doing nothing. Invisible qualifies as printed
//      (pg 134: "for the purpose of hiding, the creature is heavily obscured").
const conceal = (over) => ({
  cover: "none",
  heavilyObscured: false,
  invisible: false,
  ...over,
});
step(
  "hiding needs full cover, heavy obscurement or invisibility — half cover is not enough",
  api.canHide(conceal({ cover: "total" })) === true &&
    api.canHide(conceal({ heavilyObscured: true })) === true &&
    api.canHide(conceal({ invisible: true })) === true &&
    api.canHide(conceal({ cover: "threeQuarters" })) === false &&
    api.canHide(conceal({})) === false,
  JSON.stringify({
    total: api.canHide(conceal({ cover: "total" })),
    obscured: api.canHide(conceal({ heavilyObscured: true })),
    invisible: api.canHide(conceal({ invisible: true })),
    threeQuarters: api.canHide(conceal({ cover: "threeQuarters" })),
  }),
);

// 8ke. the live Hide action: refuses without concealment, and refuses to invent
//      a DC when nothing is targeted and none is given
const noConcealment = await api.hide(actor, actor.system);
const noObservers = await api.hide(actor, actor.system, {
  concealment: conceal({ cover: "total" }),
});
step(
  "Hide refuses without concealment, and without any enemy or DC to roll against",
  noConcealment === null && noObservers === null && api.hiddenState(actor) === null,
  JSON.stringify({ noConcealment, noObservers }),
);

// 8kf. a successful Hide records the total a later Search has to beat, and the
//      per-observer lists (pg 127). DC forced low so the roll cannot flake.
const hidReport = await api.hide(actor, actor.system, {
  concealment: conceal({ cover: "total" }),
  dc: -100,
});
await settle();
const hidden = api.hiddenState(actor);
step(
  "a landed Hide costs 6 AP and records the Sneak total for later contests",
  hidReport.hidden === true &&
    hidReport.ap === 6 &&
    hidReport.ap === api.COMBAT_ACTION_AP.hide &&
    hidden !== null &&
    hidden.sneakTotal === hidReport.total,
  JSON.stringify({ ap: hidReport.ap, total: hidReport.total, hidden }),
);

// 8kg. Hide is a Sneak *skill* check, so a skill-scoped advantage grant reaches
//      it. Dice, not totals — the rule is about advantage.
const [sneakAdv] = await actor.createEmbeddedDocuments("ActiveEffect", [
  {
    name: "SMOKE-SneakAdvantage",
    type: "base",
    system: {
      changes: [
        {
          key: "system.bonuses.advantage.skills.sneak",
          type: "add",
          value: 1,
          phase: "initial",
          priority: 20,
        },
      ],
    },
  },
]);
await settle();
await api.hide(actor, actor.system, { concealment: conceal({ cover: "total" }), dc: -100 });
await settle();
step(
  "skill:sneak advantage reaches the Hide check — 2d20kh",
  stealthLastD20().includes("2d20kh"),
  JSON.stringify({ formula: stealthLastD20() }),
);
await sneakAdv.delete();
await settle();

// 8kh. pg 127 ends hiding on leaving full cover — and names *only* cover, while
//      the requirement to hide also accepts heavy obscurement. The asymmetry is
//      printed, so it is preserved: obscurement-hiding survives the same press.
await api.hide(actor, actor.system, { concealment: conceal({ cover: "total" }), dc: -100 });
await settle();
const brokeOnCover = await api.breakHidingOnCover(actor, "none");
await settle();
const afterCover = api.hiddenState(actor);
await api.hide(actor, actor.system, { concealment: conceal({ heavilyObscured: true }), dc: -100 });
await settle();
const brokeOnObscurement = await api.breakHidingOnCover(actor, "none");
await settle();
step(
  "leaving full cover ends hiding; hiding by obscurement survives it, as printed (pg 127)",
  brokeOnCover === true &&
    afterCover === null &&
    brokeOnObscurement === false &&
    api.hiddenState(actor) !== null,
  JSON.stringify({
    brokeOnCover,
    afterCover,
    brokeOnObscurement,
    stillHidden: api.hiddenState(actor) !== null,
  }),
);

// 8ki. attacking reveals you — established only by the exception the Silencer
//      mod carves out of it (pg 77), the one sentence in the book on the subject
const silenced = await api.revealAfterAttacking(actor, true);
const stillHiddenAfterSilenced = api.hiddenState(actor) !== null;
const loud = await api.revealAfterAttacking(actor, false);
await settle();
step(
  "a silenced attack keeps the hiding, an ordinary one loses it (pg 77, by exception)",
  silenced === "targetOnly" &&
    stillHiddenAfterSilenced === true &&
    loud === "everyone" &&
    api.hiddenState(actor) === null &&
    api.revealedByAttacking(false) === "everyone",
  JSON.stringify({ silenced, stillHiddenAfterSilenced, loud }),
);

// 8kj. the pg 24 contest, and the tie the book never addresses: "their total is
//      higher" and "your total is higher" are the only branches printed, so a
//      tie leaves the hider where they already were
step(
  "a detection contest tie leaves the hider hidden (pg 24 addresses neither branch)",
  api.detectionOutcome(15, 14) === "detected" &&
    api.detectionOutcome(14, 14) === "stillHidden" &&
    api.detectionOutcome(13, 14) === "stillHidden",
  JSON.stringify({
    higher: api.detectionOutcome(15, 14),
    tie: api.detectionOutcome(14, 14),
    lower: api.detectionOutcome(13, 14),
  }),
);

// 8kk. Search is an active *ability* check (pg 21's distinction), so a Perception
//      category grant reaches it. Dice again, not totals.
const [perAdv] = await actor.createEmbeddedDocuments("ActiveEffect", [
  {
    name: "SMOKE-PerceptionAdvantage",
    type: "base",
    system: {
      changes: [
        {
          key: "system.bonuses.advantage.perception",
          type: "add",
          value: 1,
          phase: "initial",
          priority: 20,
        },
      ],
    },
  },
]);
await settle();
const searchReport = await api.searchFor(actor, actor.system);
await settle();
step(
  "Search is a Perception ability check at 3 AP, and takes perception advantage — 2d20kh",
  searchReport.ap === 3 &&
    searchReport.ap === api.COMBAT_ACTION_AP.search &&
    searchReport.contest === null &&
    stealthLastD20().includes("2d20kh"),
  JSON.stringify({ ap: searchReport.ap, formula: stealthLastD20() }),
);
await perAdv.delete();
await settle();

// 8kl. and a Search aimed at a hidden creature runs pg 24's contest, both sides
//      rolling fresh. The guard hides on a forced DC so there is something to find.
await api.hide(guard, guard.system, { concealment: conceal({ cover: "total" }), dc: -100 });
await settle();
const contested = await api.searchFor(actor, actor.system, guard);
await settle();
step(
  "Search against a hidden creature contests a fresh Perception check with a fresh Sneak check",
  contested.contest !== null &&
    contested.contest.target === guard.name &&
    contested.contest.detected === contested.total > contested.contest.hiderTotal &&
    (contested.contest.detected ? api.hiddenState(guard) === null : api.hiddenState(guard) !== null),
  JSON.stringify(contested),
);
await api.revealHidden(guard, null);
await settle();

// 8km. Surprise, pg 125: "If neither side tries to be stealthy, they
//      automatically notice each other" — no hiders, no surprise, whatever the
//      passive senses are
step(
  "nobody hiding means nobody surprised (pg 125)",
  api.surpriseOutcomes([], [{ passiveSense: 1 }])[0].surprised === false,
  JSON.stringify(api.surpriseOutcomes([], [{ passiveSense: 1 }])),
);

// 8kn. and a creature that notices *any* one threat is in the fight. The book
//      says "doesn't notice a threat" and never disambiguates; both tallies are
//      returned so the ruling stays auditable.
const surprise = api.surpriseOutcomes([30, 5], [{ passiveSense: 12 }]);
step(
  "noticing one threat of two is enough not to be surprised, and both tallies are reported",
  surprise[0].surprised === false &&
    surprise[0].missed.length === 1 &&
    surprise[0].noticed.length === 1,
  JSON.stringify(surprise),
);

// 8ko. the live procedure: passive sense finally consumed by something, seven
//      releases after it was first computed. The +100 Sneak bonus is there so
//      the step asserts the *procedure* rather than a die roll.
const [sneakFloor] = await actor.createEmbeddedDocuments("ActiveEffect", [
  {
    name: "SMOKE-SneakFloor",
    type: "base",
    system: {
      changes: [
        {
          key: "system.bonuses.skills.sneak",
          type: "add",
          value: 100,
          phase: "initial",
          priority: 20,
        },
      ],
    },
  },
]);
await settle();
const surpriseReport = await api.determineSurprise([actor], [guard]);
await settle();
const guardSurprised = api.isSurprised(guard);
step(
  "determineSurprise compares Sneak against each opposing creature's passive sense (pg 125)",
  surpriseReport !== null &&
    surpriseReport.hiders.length === 1 &&
    surpriseReport.hiders[0].rolled === true &&
    guardSurprised !== null &&
    guardSurprised.passiveSense === guardSense &&
    surpriseReport.surprised.includes(guard.name),
  JSON.stringify({ surpriseReport, guardSurprised, guardSense }),
);

// 8kp. THE headline: hidden is not unaware. pg 127 says enemies "still know your
//      general location", so hiding buys pg 24's advantage and nothing more;
//      pg 128's sneak attack additionally needs unawareness, and Surprise is the
//      book's only mechanism for it. This is what the hand-set `sneak` flag on
//      AttackOptions has never been connected to.
await api.endSurprise(guard, false);
await api.revealHidden(actor, null);
await settle();
await api.hide(actor, actor.system, {
  concealment: conceal({ cover: "total" }),
  observers: [guard],
  dc: -100,
});
await settle();
const hiddenOnly = api.sneakAttackPosture(actor, guard);
await api.determineSurprise([actor], [guard]);
await settle();
const hiddenAndUnaware = api.sneakAttackPosture(actor, guard);
step(
  "hiding alone is advantage (pg 24); hiding plus an unaware target is a sneak attack (pg 128)",
  hiddenOnly.advantage === true &&
    hiddenOnly.sneakAttack === false &&
    hiddenAndUnaware.advantage === true &&
    hiddenAndUnaware.sneakAttack === true &&
    hiddenAndUnaware.targetSurprised === true &&
    api.canSneakAttack(conceal({ cover: "total" }), false) === false &&
    api.canSneakAttack(conceal({ cover: "total" }), true) === true &&
    api.canSneakAttack(conceal({}), true) === false,
  JSON.stringify({ hiddenOnly, hiddenAndUnaware }),
);
await sneakFloor.delete();
await api.endSurprise(guard, false);
await api.revealHidden(actor, null);
await settle();

// 8kq. the pg 126 table, read off a rendered page image. Every row this brief
//      added, checked against the printed number rather than the patch notes.
step(
  "the pg 126 AP costs: Dodge 6, Hide 6, Search 3, Shove 4, Stand 5, Stow 3, Equip 3, Take Cover 3",
  api.COMBAT_ACTION_AP.dodge === 6 &&
    api.COMBAT_ACTION_AP.hide === 6 &&
    api.COMBAT_ACTION_AP.search === 3 &&
    api.COMBAT_ACTION_AP.shove === 4 &&
    api.COMBAT_ACTION_AP.standUpFromProne === 5 &&
    api.COMBAT_ACTION_AP.stowWeapon === 3 &&
    api.COMBAT_ACTION_AP.equipWeapon === 3 &&
    api.COMBAT_ACTION_AP.takeCover === 3 &&
    api.COMBAT_ACTION_AP.moveFiveFeet === 1 &&
    api.COMBAT_ACTION_AP.attack === null,
  JSON.stringify(api.COMBAT_ACTION_AP),
);

// 8kr. Dodge: a marker, because the disadvantage lands on an attack roll made
//      from somebody else's sheet. The 15-foot reactive move is free and spends
//      once.
const dodgeReport = await api.dodge(actor, actor.system);
await settle();
const movedOnce = await api.useDodgeMove(actor);
await settle();
const movedTwice = await api.useDodgeMove(actor);
step(
  "Dodge costs 6 AP and grants one free 15-foot reactive move, spendable exactly once",
  dodgeReport.ap === 6 &&
    dodgeReport.moveFeet === 15 &&
    dodgeReport.suppressed === false &&
    movedOnce === true &&
    movedTwice === false &&
    api.dodgeState(actor).used === true,
  JSON.stringify({ dodgeReport, movedOnce, movedTwice, state: api.dodgeState(actor) }),
);

// 8ks. "You lose this benefit if you are dying or you cannot spend AP to move"
//      (pg 126) — which is Grappled (pg 134) or Restrained (pg 135), and nothing
//      else in the book. Reported, not refused: the 6 AP is spent either way.
await api.endDodge(actor, false);
await actor.toggleStatusEffect("grappled", { active: true });
await settle();
const dodgeSuppressed = await api.dodge(actor, actor.system);
await settle();
step(
  "a grappled creature's Dodge is reported as doing nothing, and still costs its AP",
  api.cannotSpendApToMove(actor) === true &&
    dodgeSuppressed.suppressed === true &&
    dodgeSuppressed.ap === 6 &&
    api.dodgeBenefitLost(false, true) === true &&
    api.dodgeBenefitLost(true, false) === true &&
    api.dodgeBenefitLost(false, false) === false &&
    api.dodgeApplies(true, true) === false,
  JSON.stringify({ dodgeSuppressed, lost: api.dodgeBenefitLost(false, true) }),
);
await actor.toggleStatusEffect("grappled", { active: false });
await api.endDodge(actor, false);
await settle();

// 8kt. Shove — the last opposed roll in the book. v2.1 rewrote Grapple and
//      Escape into flat DCs and left this one contested, which is also why it is
//      the only one of the three with no "or roll a 20" rider.
step(
  "a Shove tie is a loss for the shover: pg 127 requires you to *win* the contest",
  api.shoveSucceeds(15, 14) === true &&
    api.shoveSucceeds(14, 14) === false &&
    api.bestShoveDefense(2, 5) === "agility" &&
    api.bestShoveDefense(5, 2) === "unarmed" &&
    api.shoveAllowed(false, true) === false &&
    api.shoveAllowed(true, false) === false,
  JSON.stringify({
    win: api.shoveSucceeds(15, 14),
    tie: api.shoveSucceeds(14, 14),
    best: api.bestShoveDefense(2, 5),
  }),
);

// 8ku. and the live contest, with the defender's *chosen* side taking advantage:
//      an Agility defence answers to an agility grant, which is dice not totals
const [agiAdv] = await brute.createEmbeddedDocuments("ActiveEffect", [
  {
    name: "SMOKE-AgilityAdvantage",
    type: "base",
    system: {
      changes: [
        {
          key: "system.bonuses.advantage.agility",
          type: "add",
          value: 1,
          phase: "initial",
          priority: 20,
        },
      ],
    },
  },
]);
await settle();
const shoved = await api.shove(actor, actor.system, brute, {
  defense: "agility",
  outcome: "prone",
});
await settle();
step(
  "Shove costs 4 AP, both sides roll, and the defender's Agility check takes agility advantage — 2d20kh",
  shoved.ap === 4 &&
    shoved.defense === "agility" &&
    shoved.succeeded === shoved.shoverTotal > shoved.targetTotal &&
    stealthLastD20().includes("2d20kh") &&
    brute.statuses.has("prone") === shoved.succeeded,
  JSON.stringify({ shoved, defenceFormula: stealthLastD20(), shoverFormula: stealthLastD20(1) }),
);
await agiAdv.delete();

// 8kv. Take Cover (3 AP, pg 127) — the caller src/rules/cover.ts was built for.
//      Gated on having only half or three-quarters cover, and dropped by
//      attacking, which is a trigger and not a clock.
const fromNone = await api.takeCover(actor, "none");
const fromHalf = await api.takeCover(actor, "half");
await settle();
const covered = api.takingCover(actor);
await api.leaveCover(actor, false);
await settle();
step(
  "Take Cover upgrades half cover to full for 3 AP, refuses from none, and ends on attacking",
  fromNone === null &&
    fromHalf.ap === 3 &&
    fromHalf.to === "total" &&
    covered.from === "half" &&
    api.takingCover(actor) === null,
  JSON.stringify({ fromNone, fromHalf, covered }),
);

// 8kw. Stand up from Prone (5 AP, pg 126-127): the printed way out of pg 135's
//      condition, and the whole of the action
await brute.toggleStatusEffect("prone", { active: true });
await settle();
const stood = await api.standUp(brute);
await settle();
const standAgain = await api.standUp(brute);
step(
  "Stand up clears prone for 5 AP, and refuses when there is nothing to stand up from",
  stood === true && brute.statuses.has("prone") === false && standAgain === false,
  JSON.stringify({ stood, standAgain, prone: brute.statuses.has("prone") }),
);

// 8kx. Stow and Equip (3 AP each): the two lists the pair moves an item between.
//      The pg 126 drop clause is computed and reported, never applied — there is
//      no hands resource in this system or in 136 pages of book.
const [shiv] = await actor.createEmbeddedDocuments("Item", [
  { name: "SMOKE-Shiv", type: "weapon", system: { weaponType: "bladed", equipped: false } },
]);
const [pipe] = await actor.createEmbeddedDocuments("Item", [
  { name: "SMOKE-Pipe", type: "weapon", system: { weaponType: "blunt", equipped: false } },
]);
await settle();
await api.equipWeapon(actor, shiv);
await settle();
const heldAfterFirst = api.heldWeapons(actor).map((item) => item.name);
const wouldDrop = api.weaponsDroppedByEquipping([shiv], pipe).map((item) => item.name);
await api.stowWeapon(actor, shiv);
await settle();
step(
  "Equip and Stow flip the held flag, and the pg 126 drop clause is computed but not applied",
  heldAfterFirst.includes("SMOKE-Shiv") &&
    wouldDrop.length === 1 &&
    wouldDrop[0] === "SMOKE-Shiv" &&
    !api.heldWeapons(actor).some((item) => item.name === "SMOKE-Shiv"),
  JSON.stringify({ heldAfterFirst, wouldDrop, held: api.heldWeapons(actor).map((i) => i.name) }),
);
await shiv.delete();
await pipe.delete();

// 8ky. Passive Sneak (pg 116) — the second consumer of Group Sneak, and the
//      reason that score has existed on the sheet with nothing reading it
step(
  "Passive Sneak is 15/12/10 by pace plus the party's Group Sneak (pg 116)",
  api.passiveSneak("slow", 0) === 15 &&
    api.passiveSneak("normal", 0) === 12 &&
    api.passiveSneak("fast", 0) === 10 &&
    api.passiveSneak("normal", 3) === 15,
  JSON.stringify({
    slow: api.passiveSneak("slow", 0),
    normal: api.passiveSneak("normal", 0),
    fast: api.passiveSneak("fast", 0),
    withGroup: api.passiveSneak("normal", 3),
  }),
);

// 8kz. leave nothing behind — every marker this block created is a duration-less
//      Active Effect, and inheriting one would silently change a later step
await api.revealHidden(actor, null);
await api.endDodge(actor, false);
await api.leaveCover(actor, false);
await api.endSurprise(actor, false);
await settle();
step(
  "the block leaves no hidden, dodging, cover or surprise markers on the shared actor",
  api.hiddenState(actor) === null &&
    api.dodgeState(actor) === null &&
    api.takingCover(actor) === null &&
    api.isSurprised(actor) === null,
  JSON.stringify({
    hidden: api.hiddenState(actor),
    dodging: api.dodgeState(actor),
    cover: api.takingCover(actor),
    surprised: api.isSurprised(actor),
  }),
);

await guard.delete();
await brute.delete();
