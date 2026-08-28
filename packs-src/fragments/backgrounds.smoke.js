// Smoke steps for backgrounds (pg 13-18) and the explosives arm/throw table
// (pg 21, 78-79).
//
// Paste into the in-page suite of scripts/smoke.mjs, where `step`, `actor`,
// `api`, `game`, `ActorClass`, `stamp`, `until` and `settle` are all in scope.
//
// **Every document here is built by this block and deleted at the end**, and
// nothing asserts against the suite's shared `actor`: applying a background is
// the most destructive write in the system (three skill raises, a trait, up to
// twenty-five items and fifty caps) and letting it land on the actor the other
// eighty steps share would poison every skill assertion after it.
//
// Required on globalThis.falloutTTRPG before these run:
//   applyBackground, clearBackground, appliedBackground,
//   BACKGROUNDS, getBackground, kitForRace, grantableEntries, reportedEntries,
//   armAndThrowOutcome, throwbackOutcome, armDC, armsAutomatically,
//   disarmOutcome, throwDistanceFeet, printedThrowDistanceFeet, damageBandAt,
//   senseLossRounds, explosiveByName.

// ---------------------------------------------------------------- data shape

// 9a. the chapter is twenty printed backgrounds plus Custom, and every one of
//     them covers all five races exactly once
step(
  "21 backgrounds (20 printed + Custom), each covering all five races",
  api.BACKGROUNDS.length === 21 &&
    api.BACKGROUNDS.filter((background) => background.kits.length > 0).length === 20 &&
    api.BACKGROUNDS.every(
      (background) =>
        background.kits.length === 0 ||
        ["human", "ghoul", "gen2synth", "robot", "superMutant"].every(
          (race) => background.kits.filter((kit) => kit.races.includes(race)).length === 1,
        ),
    ),
  JSON.stringify({
    total: api.BACKGROUNDS.length,
    kits: api.BACKGROUNDS.reduce((sum, background) => sum + background.kits.length, 0),
  }),
);

// 9b. "+2 to three different skills" (pg 13) — three, never two, never a repeat
step(
  "every printed background raises exactly three distinct skills",
  api.BACKGROUNDS.every(
    (background) =>
      background.key === "custom" ||
      (background.skills.length === 3 && new Set(background.skills).size === 3),
  ),
  JSON.stringify(api.BACKGROUNDS.map((background) => background.skills.length)),
);

// --------------------------------------------------------------- applying

const dweller = await ActorClass.create({
  name: `SMOKE-Dweller-${stamp}`,
  type: "character",
});
await dweller.update({ "system.details.race": "human" });
await settle();

const before = {};
for (const skill of ["medicine", "speech", "science", "guns"]) {
  before[skill] = dweller.system.skills[skill].points;
}
const beforeCaps = dweller.system.currency.caps;
const beforeItems = dweller.items.size;

// 9c. the Vault Dweller (pg 18): +2 Medicine/Speech/Science, the Talented
//     trait, a vault suit and a Pip-Boy the book leaves the player to pick
const applied = await api.applyBackground(dweller, dweller.system, "vaultDweller");
const settled = await until(
  () => dweller.system.skills.medicine.points === before.medicine + 2,
);
step(
  "applying Vault Dweller writes +2 to each of its three skills and no others",
  settled &&
    dweller.system.skills.medicine.points === before.medicine + 2 &&
    dweller.system.skills.speech.points === before.speech + 2 &&
    dweller.system.skills.science.points === before.science + 2 &&
    dweller.system.skills.guns.points === before.guns,
  JSON.stringify({
    medicine: dweller.system.skills.medicine.points,
    speech: dweller.system.skills.speech.points,
    science: dweller.system.skills.science.points,
    guns: dweller.system.skills.guns.points,
  }),
);

// 9d. the kit lands as real documents, including the pg 91 unique items that
//     until now existed only as blueprint rows
await settle();
const names = dweller.items.contents.map((item) => item.name);
step(
  "the Vault Dweller kit creates its documents, Vault Suit included",
  dweller.items.size > beforeItems &&
    names.includes("Vault Suit") &&
    names.includes("10mm pistol"),
  JSON.stringify({ created: dweller.items.size - beforeItems, names: names.slice(0, 8) }),
);

// 9e. the trait comes across as a document, and its Active Effect with it —
//     copying only `system` would leave a mechanical trait inert
step(
  "the background's trait is granted as a trait document",
  dweller.itemTypes.trait.some((item) => item.name === "Talented"),
  JSON.stringify(dweller.itemTypes.trait.map((item) => item.name)),
);

// 9f. "x1 pip-boy (any)" (pg 18) is a choice the book hands the player, so it
//     is reported and never granted — four models, none of them picked for you
step(
  "the pip-boy (any) clause is reported rather than granted",
  applied.reported.some((printed) => printed.includes("pip-boy")) &&
    !names.some((name) => name.startsWith("Pip-Boy")),
  JSON.stringify({ reported: applied.reported }),
);

// 9g. the Vault Dweller's human kit is the one background in the chapter that
//     prints no caps at all — every other kit ends "and x50 caps"
step(
  "the Vault Dweller human kit grants no caps, as printed",
  applied.caps === 0 && dweller.system.currency.caps === beforeCaps,
  JSON.stringify({ caps: applied.caps, onSheet: dweller.system.currency.caps }),
);

// 9h. refusing, not stacking: a second background on a played sheet would add
//     three more +2s and a second kit
const second = await api.applyBackground(dweller, dweller.system, "soldier");
await settle();
step(
  "a second background is refused while one is applied",
  second === null &&
    api.appliedBackground(dweller).key === "vaultDweller" &&
    dweller.system.skills.medicine.points === before.medicine + 2,
  JSON.stringify({
    second,
    ledger: api.appliedBackground(dweller)?.key,
    medicine: dweller.system.skills.medicine.points,
  }),
);

// --------------------------------------------------------------- clearing

// 9i. the player eats one of the granted items before undoing, which is the
//     whole reason the undo works off a ledger rather than off the book
const eaten = dweller.items.get(api.appliedBackground(dweller).itemIds[0]);
const eatenName = eaten?.name;
await eaten?.delete();
await settle();

const cleared = await api.clearBackground(dweller, dweller.system);
const reverted = await until(
  () => dweller.system.skills.medicine.points === before.medicine,
);
step(
  "clearing reverses the skill points it wrote and empties the ledger",
  reverted &&
    dweller.system.skills.medicine.points === before.medicine &&
    dweller.system.skills.speech.points === before.speech &&
    api.appliedBackground(dweller) === null &&
    dweller.system.details.background === "",
  JSON.stringify({
    medicine: dweller.system.skills.medicine.points,
    ledger: api.appliedBackground(dweller),
  }),
);

// 9j. …and reports the one it could not remove instead of guessing at a
//     replacement
step(
  "clearing removes only the documents it created, and names the one already gone",
  cleared.missing.length === 1 && dweller.items.size === beforeItems,
  JSON.stringify({ eatenName, missing: cleared.missing.length, items: dweller.items.size }),
);

// 9k. cleared means clearable again — the refusal is state, not a one-way door
const reapplied = await api.applyBackground(dweller, dweller.system, "soldier", { quiet: true });
await settle();
step(
  "a different background applies once the first is cleared",
  reapplied !== null &&
    api.appliedBackground(dweller).key === "soldier" &&
    dweller.system.skills.guns.points === before.guns + 2,
  JSON.stringify({ key: api.appliedBackground(dweller)?.key, guns: dweller.system.skills.guns.points }),
);

// 9l. a race with no printed kit is refused rather than handed a Human's:
//     details.race is free text, and a typo must not silently pick a kit
const stray = await ActorClass.create({ name: `SMOKE-Stray-${stamp}`, type: "character" });
await stray.update({ "system.details.race": "deathclaw" });
await settle();
const refused = await api.applyBackground(stray, stray.system, "wastelander");
step(
  "a race the chapter prints no kit for is refused, not defaulted",
  refused === null && api.appliedBackground(stray) === null,
  JSON.stringify({ refused, race: stray.system.details.race }),
);

// ------------------------------------------------------------- explosives

// 9m. pg 78's table, which is the printing this system follows — pg 21's
//     sentence claims 3 twice and leaves 4 in neither band
step(
  "arm-and-throw bands are pg 78's 1 / 2-3 / 4-14 / 15+",
  api.armAndThrowOutcome(1) === "inHand" &&
    api.armAndThrowOutcome(2) === "shortDelayed" &&
    api.armAndThrowOutcome(3) === "shortDelayed" &&
    api.armAndThrowOutcome(4) === "delayed" &&
    api.armAndThrowOutcome(14) === "delayed" &&
    api.armAndThrowOutcome(15) === "thisTurn" &&
    api.armAndThrowOutcome(30) === "thisTurn",
  JSON.stringify([1, 2, 3, 4, 14, 15, 30].map((total) => api.armAndThrowOutcome(total))),
);

// 9n. "If the **total** is a 1" (pg 21) — the skill bonus is inside the
//     comparison, so a trained demolitionist genuinely cannot blow their own
//     hand off on the throw. This is the rule, not a bug.
step(
  "it is the total that detonates in hand, not a natural 1",
  api.armAndThrowOutcome(1 + 5) === "delayed" && api.armAndThrowOutcome(1 - 3) === "inHand",
  JSON.stringify({ trained: api.armAndThrowOutcome(6), unskilled: api.armAndThrowOutcome(-2) }),
);

// 9o. both printings of Throwback leave exactly 13 undefined; read as
//     succeeding, which is the only reading that covers the d20
step(
  "throwback: 12 or below goes off in hand, 13 and up lands",
  api.throwbackOutcome(12) === "inHand" &&
    api.throwbackOutcome(13) === "thisTurn" &&
    api.throwbackOutcome(14) === "thisTurn",
  JSON.stringify([12, 13, 14].map((total) => api.throwbackOutcome(total))),
);

// 9p. the Arm DC column is a bonus, not a DC (pg 78) — the same trap the
//     Blueprint Encyclopedia sets, and the same fix
step(
  "arming a Frag Mine is DC 14 (10 + the printed +4), and a +4 bonus auto-succeeds",
  api.armDC(4) === 14 &&
    api.armsAutomatically(4, 4) === true &&
    api.armsAutomatically(3, 4) === false,
  JSON.stringify({ dc: api.armDC(4) }),
);

// 9q. disarming: fail by 5 or more and it goes off now, fail by less and it
//     keeps its own clock
step(
  "disarm outcomes split at a margin of 5",
  api.disarmOutcome(14, 4) === "disarmed" &&
    api.disarmOutcome(10, 4) === "unchanged" &&
    api.disarmOutcome(9, 4) === "inHand",
  JSON.stringify([14, 10, 9].map((total) => api.disarmOutcome(total, 4))),
);

// 9r. pg 78 prints "Strength ability modifier", which at Strength 5 is a throw
//     of zero feet. The score is used; the printed arithmetic is kept beside it.
step(
  "throw range uses the Strength score, and the printed modifier form is still available",
  api.throwDistanceFeet(5, 6) === 30 && api.printedThrowDistanceFeet(0, 6) === 0,
  JSON.stringify({
    used: api.throwDistanceFeet(5, 6),
    printed: api.printedThrowDistanceFeet(0, 6),
  }),
);

// 9s. the two-band area of effect, on the book's own worked example (pg 78)
const dynamite = api.explosiveByName("Dynamite");
step(
  "Dynamite's 5ft / 20ft bands read full / half / none",
  api.damageBandAt(4, dynamite.area) === "full" &&
    api.damageBandAt(15, dynamite.area) === "half" &&
    api.damageBandAt(25, dynamite.area) === "none",
  JSON.stringify(dynamite.area),
);

// 9t. Blinding and Deafening: "4 - their Endurance ability modifier to a
//     minimum of 1"
step(
  "sense loss is 4 - END modifier, floored at 1",
  api.senseLossRounds(0) === 4 && api.senseLossRounds(3) === 1 && api.senseLossRounds(5) === 1,
  JSON.stringify([0, 3, 5].map((mod) => api.senseLossRounds(mod))),
);

// ------------------------------------------------------------------ cleanup
await dweller.delete();
await stray.delete();
await settle();
step(
  "background smoke actors cleaned up",
  !game.actors.get(dweller.id) && !game.actors.get(stray.id),
  JSON.stringify({ remaining: game.actors.filter((a) => a.name.startsWith("SMOKE-")).length }),
);
