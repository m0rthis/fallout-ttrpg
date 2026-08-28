// ------------------------------------------------------------- progression
// XP awards and level-up spending (pg 5-6), skill magazines (pg 88), caps and
// Barter's Discount (pg 22). Drop this block into scripts/smoke.mjs inside the
// main try, where `step`, `actor`, `api`, `game`, `until`, `settle`,
// `ActorClass` and `stamp` are in scope.
//
// Everything here is deterministic: none of these rules rolls a die. What the
// steps guard is arithmetic that the book leaves ambiguous (rounding, whether
// percentages compound), and *state that has to survive a re-read* — the
// magazine bonuses land in `derived.skillBonuses` through the data model, so
// every one of those is sampled after `settle()` rather than at the instant of
// the call, per the working agreement.
//
// Documents: this block creates its own SMOKE- actors and items and deletes
// them at the end. `awardExperience` is only ever called with an explicit
// recipient list, so it can never write to a real campaign actor — with the
// default list it writes to every player character in the world.

// pr1. the four printed modifiers (pg 5). Percentages are of the base and
//      summed, never compounded; the flat death award lands after them.
const award = api.experienceAward({
  base: 100,
  downed: 2,
  creatureDiscovery: true,
  locationDiscovery: true,
  deaths: 1,
});
step(
  "XP modifiers are summed percentages of the base, plus the flat death award",
  award.downedBonus === 20 &&
    award.creatureBonus === 20 &&
    award.locationBonus === 20 &&
    award.deathAward === 1000 &&
    award.total === 1160,
  JSON.stringify(award),
);

// pr2. rounding. The book never says; this rounds down, as it does everywhere
//      it does say. 10% of 125 is 12.5 -> 12, so the total is 137 and not 138.
const rounded = api.experienceAward({
  base: 125,
  downed: 1,
  creatureDiscovery: false,
  locationDiscovery: false,
  deaths: 0,
});
step(
  "XP percentage bonuses round down",
  rounded.downedBonus === 12 && rounded.total === 137,
  JSON.stringify(rounded),
);

// pr3. the catch-up rule (pg 5): everyone rises to the highest total, and the
//      amount each one gains is different — which is the whole reason it is
//      logged per character.
const gains = api.catchUpGains([1000, 2500, 2500]);
step(
  "catch-up raises every character to the party's highest XP total",
  gains.length === 3 && gains[0] === 1500 && gains[1] === 0 && gains[2] === 0,
  JSON.stringify(gains),
);

// pr4. the award applied to two characters who start at different totals. The
//      absolute totals depend on whatever else is in the world (catch-up reads
//      the whole party), so what is asserted is the rule: they end equal, and
//      the one who was behind gained more.
const rich = await ActorClass.create({ name: `SMOKE-Rich-${stamp}`, type: "character" });
const poor = await ActorClass.create({ name: `SMOKE-Poor-${stamp}`, type: "character" });
await rich.update({ "system.details.xp": 2000 });
await poor.update({ "system.details.xp": 500 });
const report = await api.awardExperience({
  base: 100,
  downed: 0,
  creatureDiscovery: false,
  locationDiscovery: false,
  deaths: 0,
  reason: "SMOKE-award",
  recipients: [rich, poor],
});
await settle();
step(
  "an XP award leaves both recipients on the same total, the poorer one gaining more",
  report !== null &&
    rich.system.details.xp === poor.system.details.xp &&
    rich.system.details.xp >= 2100 &&
    report.lines.length === 2 &&
    report.lines.some((line) => line.caughtUp > 0) &&
    poor.system.progression.awards.length === 1 &&
    poor.system.progression.awards[0].reason === "SMOKE-award",
  JSON.stringify({
    rich: rich.system.details.xp,
    poor: poor.system.details.xp,
    lines: report?.lines,
    log: poor.system.progression.awards,
  }),
);
await rich.delete();
await poor.delete();

// pr5. taking the level the XP entitles you to (pg 5), and only ever upward.
await actor.update({ "system.details.xp": 3000, "system.details.level": 1 });
await settle();
const levelled = await api.applyLevel(actor, actor.system);
await settle();
const again = await api.applyLevel(actor, actor.system);
step(
  "taking a level moves to the XP-earned level and then has nothing left to take",
  levelled === 4 && actor.system.details.level === 4 && again === null,
  JSON.stringify({ levelled, level: actor.system.details.level, again }),
);

// pr6. skill points. Level 5 with Intelligence 6 grants 5 (pg 5-6 table); this
//      spends 3 of them and then proves the budget is enforced, not decorative.
await actor.update({
  "system.details.level": 5,
  "system.abilities.intelligence.value": 6,
  "system.skills.guns.points": 0,
  "system.progression.spends": [],
});
await settle();
const gunsBefore = actor.system.derived.skillBonuses.guns;
await api.spendSkillPoints(actor, actor.system, "guns", 3, "SMOKE");
await settle();
const overspent = await api.spendSkillPoints(actor, actor.system, "guns", 5);
await settle();
const budget = api.budgetFor(actor.system);
step(
  "skill points spend, land on the skill, and cannot be overspent",
  actor.system.skills.guns.points === 3 &&
    actor.system.derived.skillBonuses.guns === gunsBefore + 3 &&
    actor.system.progression.spends.length === 1 &&
    overspent === false &&
    budget.skillTotal === 5 &&
    budget.skillSpent === 3 &&
    budget.skillRemaining === 2,
  JSON.stringify({ points: actor.system.skills.guns.points, budget }),
);

// pr7. undoing a spend hands the points back on both sides of the ledger.
await api.undoSpend(actor, actor.system, 0);
await settle();
step(
  "undoing a skill spend removes the row and the points",
  actor.system.skills.guns.points === 0 &&
    actor.system.progression.spends.length === 0 &&
    actor.system.derived.skillBonuses.guns === gunsBefore,
  JSON.stringify({
    points: actor.system.skills.guns.points,
    spends: actor.system.progression.spends,
  }),
);

// pr8. a perk point spent on an ability score (pg 5), and undone.
await actor.update({ "system.abilities.strength.value": 5 });
await settle();
await api.spendPerkPoint(actor, actor.system, { kind: "ability", ability: "strength" });
await settle();
const raised = actor.system.abilities.strength.value;
await api.undoSpend(actor, actor.system, actor.system.progression.spends.length - 1);
await settle();
step(
  "a perk point raises an ability score by 1 and the undo puts it back",
  raised === 6 &&
    actor.system.abilities.strength.value === 5 &&
    actor.system.progression.spends.length === 0,
  JSON.stringify({ raised, now: actor.system.abilities.strength.value }),
);

// pr9. which skill a magazine raises (pg 88 table, read from the page image).
//      The printed title is authoritative; a typographic apostrophe must not
//      break it; effect text is the fallback; anything else is refused.
step(
  "magazines resolve by printed title, by curly apostrophe, and by effect text",
  api.magazineSkill("¡La Fantoma!") === "sneak" &&
    api.magazineSkill("Fixin’ Things") === "crafting" &&
    api.magazineSkill("Tæles of Chivalrie") === "meleeWeapons" &&
    api.magazineSkill("SMOKE-Nonsense") === null &&
    api.magazineSkill("SMOKE-Nonsense", "Your Guns skill bonus increases by 1 until you rest.") ===
      "guns",
  JSON.stringify({
    fantoma: api.magazineSkill("¡La Fantoma!"),
    fixin: api.magazineSkill("Fixin’ Things"),
    unknown: api.magazineSkill("SMOKE-Nonsense"),
  }),
);

// pr10. read time (pg 88): 5 minus the Intelligence modifier, and the 6 AP
//       branch only once that reaches 0. A negative modifier makes it longer,
//       which is what the printed subtraction does.
step(
  "reading takes 5 minus INT modifier in minutes, or 6 AP once that hits 0",
  api.magazineReadTime(1).minutes === 4 &&
    api.magazineReadTime(1).apCost === null &&
    api.magazineReadTime(5).minutes === 0 &&
    api.magazineReadTime(5).apCost === 6 &&
    api.magazineReadTime(-2).minutes === 7,
  JSON.stringify({
    plus1: api.magazineReadTime(1),
    plus5: api.magazineReadTime(5),
    minus2: api.magazineReadTime(-2),
  }),
);

// pr11. reading an issue. The item is SMOKE- named, so it resolves through the
//       effect-text fallback rather than the printed title — which is also how
//       a homebrew magazine would behave.
await actor.update({ "system.progression.magazines": [] });
await actor.createEmbeddedDocuments("Item", [
  {
    name: "SMOKE-Milsurp",
    type: "aid",
    system: {
      aidType: "magazine",
      quantity: 6,
      load: 2,
      apCost: 6,
      effect: "Your Guns skill bonus increases by 1 until you rest.",
    },
  },
]);
await settle();
const mag = actor.items.getName("SMOKE-Milsurp");
const beforeRead = actor.system.derived.skillBonuses.guns;
await api.readMagazine(actor, actor.system, mag, 1);
await settle();
step(
  "reading an issue grants +1 to its skill until you rest and consumes the copy",
  actor.system.derived.skillBonuses.guns === beforeRead + 1 &&
    actor.system.derived.magazines.untilRest.guns === 1 &&
    actor.system.derived.magazines.permanent.guns === 0 &&
    actor.items.getName("SMOKE-Milsurp").system.quantity === 5 &&
    actor.system.progression.magazines.length === 1 &&
    actor.system.progression.magazines[0].issues === "1",
  JSON.stringify({
    guns: actor.system.derived.skillBonuses.guns,
    magazines: actor.system.derived.magazines,
    ledger: actor.system.progression.magazines,
  }),
);

// pr12. "Once you read an issue of a skill magazine you can no longer gain its
//       benefits" — the same issue again is worth nothing, and does not stack.
const reread = await api.readMagazine(actor, actor.system, actor.items.getName("SMOKE-Milsurp"), 1);
await settle();
step(
  "re-reading a known issue gains nothing but still uses up the copy",
  reread !== null &&
    reread.alreadyRead === true &&
    actor.system.derived.magazines.untilRest.guns === 1 &&
    actor.system.progression.magazines[0].issues === "1" &&
    actor.items.getName("SMOKE-Milsurp").system.quantity === 4,
  JSON.stringify({
    report: reread,
    magazines: actor.system.derived.magazines,
    qty: actor.items.getName("SMOKE-Milsurp").system.quantity,
  }),
);

// pr13. five different issues make it permanent (pg 88). The fifth read is
//       ruled to grant both bonuses — the table effect and the permanent one —
//       because the book prints them as two sentences with two triggers.
let permanent = null;
for (const issue of [2, 3, 4, 5]) {
  permanent = await api.readMagazine(
    actor,
    actor.system,
    actor.items.getName("SMOKE-Milsurp"),
    issue,
  );
}
await settle();
step(
  "five different issues grant a permanent +1, on top of that issue's until-rest +1",
  permanent !== null &&
    permanent.gainedPermanent === true &&
    permanent.issueCount === 5 &&
    actor.system.derived.magazines.permanent.guns === 1 &&
    actor.system.derived.magazines.untilRest.guns === 1 &&
    actor.system.derived.magazines.total.guns === 2 &&
    actor.system.derived.skillBonuses.guns === beforeRead + 2,
  JSON.stringify({
    report: permanent,
    magazines: actor.system.derived.magazines,
    guns: actor.system.derived.skillBonuses.guns,
  }),
);

// pr14. resting drops the until-rest half and leaves the permanent half alone.
await api.clearMagazineBonuses(actor, actor.system);
await settle();
step(
  "a rest ends the until-rest bonus and never touches the permanent one",
  actor.system.derived.magazines.untilRest.guns === 0 &&
    actor.system.derived.magazines.permanent.guns === 1 &&
    actor.system.derived.skillBonuses.guns === beforeRead + 1,
  JSON.stringify({
    magazines: actor.system.derived.magazines,
    guns: actor.system.derived.skillBonuses.guns,
  }),
);

// pr15. Barter's Discount as arithmetic (pg 22): a percentage equal to the
//       Barter skill bonus, rounded down, and never a surcharge.
const quote = api.quotePurchase(250, 500, 7, true);
const negative = api.quotePurchase(250, 500, -3, true);
step(
  "the Discount is a percentage equal to the Barter bonus, rounded down and floored at 0",
  quote.discountPercent === 7 &&
    quote.discount === 17 &&
    quote.price === 233 &&
    negative.discountPercent === 0 &&
    negative.price === 250,
  JSON.stringify({ quote, negative }),
);

// pr16. the purchase itself: caps come off at the discounted price, and the
//       Discount is spent. Barter is pushed to a bonus that makes the discount
//       a real number rather than a rounding artefact.
await actor.update({
  "system.currency.caps": 300,
  "system.progression.discountUsed": false,
  "system.abilities.charisma.value": 5,
  "system.abilities.luck.value": 5,
  "system.skills.barter.points": 7,
});
await settle();
const barterBonus = actor.system.derived.skillBonuses.barter;
const expected = api.quotePurchase(250, 300, barterBonus, true);
const bought = await api.purchase(actor, actor.system, {
  price: 250,
  label: "SMOKE-goods",
  useDiscount: true,
});
await settle();
step(
  "a purchase spends caps at the discounted price and uses up the Discount",
  // Relative to the live Barter bonus rather than a hard 67: earlier steps in
  // this suite attach effects to `actor`, and pr15 already pins the arithmetic.
  bought === true &&
    expected.discountPercent === barterBonus &&
    expected.discount > 0 &&
    actor.system.currency.caps === expected.remaining &&
    actor.system.progression.discountUsed === true,
  JSON.stringify({
    caps: actor.system.currency.caps,
    expected,
    barterBonus,
    used: actor.system.progression.discountUsed,
  }),
);

// pr17. the Discount is once per 8-hour rest, and caps do not go negative.
const secondDiscount = await api.purchase(actor, actor.system, {
  price: 1,
  label: "SMOKE-again",
  useDiscount: true,
});
const capsBefore = actor.system.currency.caps;
const unaffordable = await api.purchase(actor, actor.system, {
  price: 999999,
  label: "SMOKE-fusion-core",
  useDiscount: false,
});
await settle();
step(
  "the Discount refuses a second use, and a purchase beyond your caps is refused",
  secondDiscount === false &&
    unaffordable === false &&
    actor.system.currency.caps === capsBefore,
  JSON.stringify({ secondDiscount, unaffordable, caps: actor.system.currency.caps }),
);

// pr18. a rest recharges the Discount only at the 8 hours pg 22 prints, which
//       is longer than this system's 6-hour long rest (pg 119).
await api.readMagazine(actor, actor.system, actor.items.getName("SMOKE-Milsurp"), 6);
await settle();
const shortRest = await api.restProgression(actor, actor.system, 6);
await settle();
const shortStillUsed = actor.system.progression.discountUsed;
const longRest = await api.restProgression(actor, actor.system, 8);
await settle();
step(
  "a 6-hour rest clears magazine bonuses but not the Discount; 8 hours clears both",
  shortRest.magazines === 1 &&
    shortRest.discount === false &&
    shortStillUsed === true &&
    longRest.discount === true &&
    actor.system.progression.discountUsed === false &&
    actor.system.derived.magazines.untilRest.guns === 0 &&
    actor.system.derived.magazines.permanent.guns === 1,
  JSON.stringify({
    shortRest,
    longRest,
    used: actor.system.progression.discountUsed,
    magazines: actor.system.derived.magazines,
  }),
);

await actor.items.getName("SMOKE-Milsurp").delete();

// pr19. an actor saved before this release. The stored `system.progression`
//       key is deleted outright, which is exactly what an older world's actor
//       document looks like; DataModel must fill the four defaults on load and
//       every derived number must still come out. This is the migration
//       question (roadmap item 20) asked as an assertion.
const legacy = await ActorClass.create({ name: `SMOKE-Legacy-${stamp}`, type: "character" });
await legacy.update({ "system.details.level": 5, "system.abilities.intelligence.value": 6 });
await legacy.update({ "system.-=progression": null });
await settle();
step(
  "an actor with no stored progression data loads with sane defaults and full derived values",
  Array.isArray(legacy.system.progression.spends) &&
    legacy.system.progression.spends.length === 0 &&
    legacy.system.progression.awards.length === 0 &&
    legacy.system.progression.magazines.length === 0 &&
    legacy.system.progression.discountUsed === false &&
    legacy.system.derived.magazines.total.guns === 0 &&
    Number.isFinite(legacy.system.derived.skillBonuses.guns) &&
    api.budgetFor(legacy.system).skillTotal === 5 &&
    api.budgetFor(legacy.system).skillSpent === 0,
  JSON.stringify({
    progression: legacy.system.progression,
    budget: api.budgetFor(legacy.system),
    magazines: legacy.system.derived.magazines,
  }),
);
await legacy.delete();

// pr20. the progression panel renders on a real sheet without throwing, and
//       shows the ledger it was given. `until` rather than a fixed wait: the
//       sheet renders asynchronously and the partial is registered at init.
await actor.sheet.render(true);
const panelShown = await until(
  () => document.querySelector(".fallout-ttrpg .panel.progression") !== null,
);
step(
  "the progression panel renders on the character sheet",
  panelShown === true,
  JSON.stringify({ found: panelShown }),
);
await actor.update({ "system.progression.magazines": [], "system.progression.awards": [] });
