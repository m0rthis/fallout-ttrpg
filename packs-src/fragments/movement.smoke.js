// Smoke steps for the movement chapter: travel pace, climbing, swimming,
// diving, jumping, sprinting, falling and suffocating (pg 116-118).
//
// Paste into the in-page suite of scripts/smoke.mjs. `step`, `actor`, `api`,
// `game`, `until`, `settle`, `ActorClass` and `stamp` all come from the
// surrounding scope. Step ids 8fa-8fu are claimed here; renumber if another
// block landed first.
//
// Every document created here is SMOKE- prefixed and deleted at the end, and
// every live assertion is made on documents this block built itself — the pure
// arithmetic runs against `actor`, but nothing that writes does. Inheriting a
// half-drowned actor has broken this suite before.
//
// Required on globalThis.falloutTTRPG before these run — none of it is exported
// today, so `src/fallout.ts` needs the additions:
//   from src/rules/movement.ts —
//     climbApPer5Feet, climbRoundLimit, swimApPer5Feet, swimRoundLimit, WATERS,
//     breathSeconds, breathAfterPenalties, suffocationRounds,
//     jumpLimitFeet, jumpApCost, jumpOverreachDC, jumpPlan,
//     sprint, sprintDistanceFeet,
//     fallDamageDice, fallDamageFormula, fallDistanceAfterTurns, fallOutcome,
//     travelHourLimit, passiveSneak, maxTravelDistanceMiles, travelPlan,
//     TRAVEL_PACES
//   from src/actions/movement.ts —
//     reportClimb, reportSwim, reportSprint, jump, fall,
//     holdBreath, spendBreath, breathPenalty, tickSuffocation, reachAir,
//     heldBreath, travel

const mover = await ActorClass.create({ name: `SMOKE-Mover-${stamp}`, type: "npc" });
// Endurance 7 is the book's own worked example for suffocating (pg 118), and
// Strength 8 gives a long jump with a non-degenerate limit.
await mover.update({
  "system.abilities.endurance.value": 7,
  "system.abilities.strength.value": 8,
});
await settle();

// ---------------------------------------------------------------- climbing

// 8fa. the three surface rates, and the −1 AP for gear that treacherous does
//      not get (pg 116-117). Sheer and Treacherous are both 4 AP bare; gear is
//      the only thing that separates them.
step(
  "climb rates are 3/4/4 AP per 5 ft, gear takes 1 off all but treacherous",
  api.climbApPer5Feet("scalable", false) === 3 &&
    api.climbApPer5Feet("sheer", false) === 4 &&
    api.climbApPer5Feet("scalable", true) === 2 &&
    api.climbApPer5Feet("sheer", true) === 3 &&
    api.climbApPer5Feet("treacherous", true) === 4,
  JSON.stringify({
    scalable: [api.climbApPer5Feet("scalable", false), api.climbApPer5Feet("scalable", true)],
    sheer: [api.climbApPer5Feet("sheer", false), api.climbApPer5Feet("sheer", true)],
    treacherous: api.climbApPer5Feet("treacherous", true),
  }),
);

// 8fb. "You cannot climb a treacherous surface without climbing equipment of
//      some kind" — a refusal, not an expensive price
step(
  "a treacherous surface without gear is impossible rather than priced",
  api.climbApPer5Feet("treacherous", false) === null,
  JSON.stringify({ bare: api.climbApPer5Feet("treacherous", false) }),
);

// 8fc. the climbing clock is an Endurance *score*, minimum one round (pg 116)
step(
  "the climb round limit is the Endurance score, floored at one round",
  api.climbRoundLimit(7) === 7 && api.climbRoundLimit(0) === 1 && api.climbRoundLimit(-3) === 1,
  JSON.stringify({ seven: api.climbRoundLimit(7), zero: api.climbRoundLimit(0) }),
);

// 8fd. and the action reports rather than writes — no AP moves, no state changes
const apBeforeClimb = mover.system.resources.ap.value;
const climbCard = await api.reportClimb(mover, mover.system, {
  surface: "sheer",
  feet: 15,
  gear: false,
});
await settle();
step(
  "climbing 15 ft up a sheer surface reports 12 AP and deducts nothing",
  climbCard.ap === 12 &&
    climbCard.roundLimit === 7 &&
    mover.system.resources.ap.value === apBeforeClimb,
  JSON.stringify({ card: climbCard, apBefore: apBeforeClimb, apAfter: mover.system.resources.ap.value }),
);

// ---------------------------------------------------------------- swimming

// 8fe. the three water rates, and the +1 AP for being underwater (pg 117)
step(
  "swim rates are 2/2/3 AP per 5 ft, and 1 more while underwater",
  api.swimApPer5Feet("still", false) === 2 &&
    api.swimApPer5Feet("rushing", false) === 2 &&
    api.swimApPer5Feet("treacherous", false) === 3 &&
    api.swimApPer5Feet("still", true) === 3 &&
    api.swimApPer5Feet("treacherous", true) === 4,
  JSON.stringify({
    surface: ["still", "rushing", "treacherous"].map((w) => api.swimApPer5Feet(w, false)),
    under: ["still", "rushing", "treacherous"].map((w) => api.swimApPer5Feet(w, true)),
  }),
);

// 8ff. the currents: 10 ft in rushing water, 20 in treacherous. The book's
//      Treacherous paragraph says "rushing" twice — a copy-paste it does not
//      re-edit — and this asserts the numbers, which are what distinguish them.
step(
  "rushing water drags you 10 ft a turn and treacherous 20, still water none",
  api.WATERS.still.currentFeet === 0 &&
    api.WATERS.rushing.currentFeet === 10 &&
    api.WATERS.treacherous.currentFeet === 20,
  JSON.stringify({
    still: api.WATERS.still.currentFeet,
    rushing: api.WATERS.rushing.currentFeet,
    treacherous: api.WATERS.treacherous.currentFeet,
  }),
);

// 8fg. the round limit is printed for treacherous water only — extending it to
//      the other two would make swimming a pool impossible
step(
  "only treacherous water has a printed round limit",
  api.swimRoundLimit("still", 7) === null &&
    api.swimRoundLimit("rushing", 7) === null &&
    api.swimRoundLimit("treacherous", 7) === 7,
  JSON.stringify({
    still: api.swimRoundLimit("still", 7),
    treacherous: api.swimRoundLimit("treacherous", 7),
  }),
);

// ------------------------------------------------------------------ breath

// 8fh. the book's own worked example (pg 118): "a creature with an Endurance of
//      7 can hold its breath for 3 minutes. If it starts suffocating, it has 2
//      rounds to reach air". Endurance 7 is a +2 modifier in this system, so
//      this step doubles as a check on the modifier formula.
step(
  "pg 118's worked example: Endurance 7 holds its breath 3 minutes, then 2 rounds",
  api.breathSeconds(2) === 180 && api.suffocationRounds(2) === 2,
  JSON.stringify({ seconds: api.breathSeconds(2), rounds: api.suffocationRounds(2) }),
);

// 8fi. and both floors: 30 seconds of breath, 1 round of suffocating
step(
  "breath floors at 30 seconds and suffocating at one round, however bad the modifier",
  api.breathSeconds(-4) === 30 && api.breathSeconds(-1) === 30 && api.suffocationRounds(-4) === 1,
  JSON.stringify({ worst: api.breathSeconds(-4), minusOne: api.breathSeconds(-1) }),
);

// 8fj. each diving penalty costs 30 seconds off the maximum (pg 117)
step(
  "each diving penalty takes 30 seconds off the breath, floored at zero",
  api.breathAfterPenalties(2, 1) === 150 &&
    api.breathAfterPenalties(2, 3) === 90 &&
    api.breathAfterPenalties(2, 99) === 0,
  JSON.stringify({
    one: api.breathAfterPenalties(2, 1),
    three: api.breathAfterPenalties(2, 3),
    many: api.breathAfterPenalties(2, 99),
  }),
);

// 8fk. the live clock: a marker effect, advanced by a person, never by a timer
await api.holdBreath(mover, mover.system);
await until(() => api.heldBreath(mover) !== null);
const started = api.heldBreath(mover);
step(
  "holding breath creates a marker carrying 180 seconds and no suffocation clock",
  started?.seconds === 180 && started.suffocating === null,
  JSON.stringify({ started }),
);

// 8fl. burning it all rolls into suffocating, with the pg 118 round count
await api.spendBreath(mover, mover.system, 180);
await until(() => api.heldBreath(mover)?.suffocating !== null);
const drowning = api.heldBreath(mover);
step(
  "running out of breath starts the drowning clock at the Endurance modifier",
  drowning?.seconds === 0 && drowning.suffocating === 2,
  JSON.stringify({ drowning }),
);

// 8fm. and the clock's end: 0 hit points, dying, and stamina gone with it
await mover.update({ "system.resources.hp.value": 12, "system.resources.sp.value": 6 });
await settle();
const firstTick = await api.tickSuffocation(mover, mover.system);
const secondTick = await api.tickSuffocation(mover, mover.system);
await until(() => mover.system.resources.hp.value === 0);
step(
  "the drowning clock drops the creature to 0 hit points and 0 stamina, dying",
  firstTick.dropped === false &&
    secondTick.dropped === true &&
    mover.system.resources.hp.value === 0 &&
    mover.system.resources.sp.value === 0 &&
    mover.statuses.has("dying"),
  JSON.stringify({
    firstTick,
    secondTick,
    hp: mover.system.resources.hp.value,
    sp: mover.system.resources.sp.value,
    dying: mover.statuses.has("dying"),
  }),
);

// 8fn. reaching air clears the marker and heals nothing — the pg 118 lock is
//      reported, not enforced, and this asserts that it is not quietly undone
await api.reachAir(mover);
await until(() => api.heldBreath(mover) === null);
step(
  "reaching air stops the clock and restores nothing",
  api.heldBreath(mover) === null && mover.system.resources.hp.value === 0,
  JSON.stringify({ breath: api.heldBreath(mover), hp: mover.system.resources.hp.value }),
);
await mover.toggleStatusEffect("dying", { active: false });
await mover.update({ "system.resources.hp.value": mover.system.derived.hpMax });
await settle();

// ----------------------------------------------------------------- jumping

// 8fo. long jump: 5 × Strength modifier, minimum 5 ft, halved standing, and
//      1 AP per 5 feet cleared (pg 117). Strength 8 is a +3 modifier → 15 ft.
step(
  "a long jump is 5 × Strength modifier, halved without moving, at 1 AP per 5 ft",
  api.jumpLimitFeet("long", 3, true) === 15 &&
    api.jumpLimitFeet("long", 3, false) === 7 &&
    api.jumpLimitFeet("long", 0, true) === 5 &&
    api.jumpApCost("long", 15) === 3 &&
    api.jumpApCost("long", 11) === 3,
  JSON.stringify({
    moved: api.jumpLimitFeet("long", 3, true),
    standing: api.jumpLimitFeet("long", 3, false),
    floor: api.jumpLimitFeet("long", 0, true),
    ap: api.jumpApCost("long", 15),
  }),
);

// 8fp. high jump: 3 + Strength modifier, minimum 1 ft, and 1 AP per *foot*
step(
  "a high jump is 3 + Strength modifier and costs 1 AP per foot, not per 5 ft",
  api.jumpLimitFeet("high", 3, true) === 6 &&
    api.jumpLimitFeet("high", 3, false) === 3 &&
    api.jumpLimitFeet("high", -5, true) === 1 &&
    api.jumpApCost("high", 6) === 6,
  JSON.stringify({
    moved: api.jumpLimitFeet("high", 3, true),
    standing: api.jumpLimitFeet("high", 3, false),
    ap: api.jumpApCost("high", 6),
  }),
);

// 8fq. the two overreach DCs, which are the one number that differs between the
//      two jumps: 10 + extra feet long, 18 + extra feet high
step(
  "overreaching a long jump is DC 10 + extra feet, a high jump DC 18 + extra feet",
  api.jumpOverreachDC("long", 4) === 14 && api.jumpOverreachDC("high", 4) === 22,
  JSON.stringify({ long: api.jumpOverreachDC("long", 4), high: api.jumpOverreachDC("high", 4) }),
);

// 8fr. and the AP is the *attempted* distance's, paid whether or not the check
//      lands — "you still use the AP it would have taken to clear the distance"
const overreach = api.jumpPlan("long", 3, 25, { moved: true, availableAp: 3 });
step(
  "an overreaching jump is priced on what it attempts, and can be unaffordable",
  overreach.ap === 5 &&
    overreach.extraFeet === 10 &&
    overreach.dc === 20 &&
    overreach.affordable === false,
  JSON.stringify({ overreach }),
);

// --------------------------------------------------------------- sprinting

// 8fs. the action SPRINT_AP_COST was declared for: 5 AP, 50 ft, no refund
const run = api.sprint({});
const stormRun = api.sprint({ halved: true });
step(
  "a sprint is 5 AP for 50 ft with no refund, and a Dust Storm halves it (pg 117, 122, 127)",
  run.ap === 5 && run.feet === 50 && run.refund === 0 && stormRun.feet === 25,
  JSON.stringify({ run, stormRun }),
);

// 8ft. difficult terrain *ends* a sprint rather than surcharging it — the one
//      place in the book where difficult terrain does not cost an extra AP
const blocked = api.sprint({ difficultTerrain: true });
step(
  "difficult terrain terminates a sprint instead of taxing it, still with no refund",
  blocked.terrainEnds === true && blocked.ap === 5 && blocked.refund === 0,
  JSON.stringify({ blocked }),
);

// ----------------------------------------------------------------- falling

// 8fu. the size table's dice: 1d6 per 10 ft for Medium, 2d6 per 10 for Large,
//      2d10 per *20* for Huge, and every one of them capped (pg 118)
step(
  "falling dice scale by size and cap where the book caps them",
  api.fallDamageDice("medium", 100) === 10 &&
    api.fallDamageDice("medium", 99999) === 150 &&
    api.fallDamageDice("large", 100) === 20 &&
    api.fallDamageDice("huge", 100) === 10 &&
    api.fallDamageDice("gargantuan", 100) === 20 &&
    api.fallDamageFormula("medium", 100) === "10d6",
  JSON.stringify({
    medium100: api.fallDamageDice("medium", 100),
    mediumCap: api.fallDamageDice("medium", 99999),
    large100: api.fallDamageDice("large", 100),
    huge100: api.fallDamageDice("huge", 100),
    formula: api.fallDamageFormula("medium", 100),
  }),
);

// 8fv. falling *speed* is a separate table from falling damage, and the first
//      turn is shorter than every turn after it
step(
  "a medium creature falls 500 ft on turn one and 1000 on each turn after",
  api.fallDistanceAfterTurns("medium", 1) === 500 &&
    api.fallDistanceAfterTurns("medium", 3) === 2500 &&
    api.fallDistanceAfterTurns("tiny", 2) === 75,
  JSON.stringify({
    one: api.fallDistanceAfterTurns("medium", 1),
    three: api.fallDistanceAfterTurns("medium", 3),
    tiny: api.fallDistanceAfterTurns("tiny", 2),
  }),
);

// 8fw. Tiny is the exception the whole rule turns on: no damage ever, and one
//      condition on *distance* past 50 ft rather than one per limb on damage
const tinyShort = api.fallOutcome("tiny", 40);
const tinyLong = api.fallOutcome("tiny", 60);
step(
  "a tiny creature takes no damage and gains one arm-or-leg condition past 50 ft",
  tinyShort.formula === "" &&
    tinyShort.conditionOnDistance === false &&
    tinyLong.conditionOnDistance === true &&
    tinyLong.limbConditions === "armOrLeg" &&
    api.fallOutcome("medium", 60).limbConditions === "armAndLeg",
  JSON.stringify({ tinyShort, tinyLong }),
);

// 8fx. the live fall: damage through the ordinary pipeline, prone on landing,
//      and the limb conditions only once the damage reaches hit points
const faller = await ActorClass.create({ name: `SMOKE-Faller-${stamp}`, type: "npc" });
await faller.update({
  "system.resources.hp.value": 4,
  "system.resources.sp.value": 0,
  "system.overrides.dt": 0,
});
await settle();
const landed = await api.fall(faller, faller.system, { feet: 100, size: "medium" });
await until(() => faller.system.resources.hp.value < 4 || landed.damage === 0);
step(
  "a 100 ft fall rolls 10d6 impact, lands the creature prone, and inflicts two limb conditions",
  landed.formula === "10d6" &&
    landed.damage > 0 &&
    landed.hpLost > 0 &&
    landed.prone === true &&
    faller.statuses.has("prone") &&
    landed.conditions.length === 2,
  JSON.stringify({ landed, prone: faller.statuses.has("prone"), hp: faller.system.resources.hp.value }),
);

// 8fy. and stamina soaking the whole fall means no conditions at all — "if this
//      damage is dealt to the creature's hit points" is the printed trigger
const cushioned = await ActorClass.create({ name: `SMOKE-Cushion-${stamp}`, type: "npc" });
await cushioned.update({
  "system.overrides.spMax": 400,
  "system.overrides.hpMax": 400,
});
await settle();
await cushioned.update({
  "system.resources.sp.value": 400,
  "system.resources.hp.value": 400,
});
await settle();
const soaked = await api.fall(cushioned, cushioned.system, { feet: 20, size: "medium" });
step(
  "a fall absorbed entirely by stamina inflicts no limb conditions",
  soaked.damage > 0 && soaked.hpLost === 0 && soaked.conditions.length === 0,
  JSON.stringify({ soaked, sp: cushioned.system.resources.sp.value }),
);

// ------------------------------------------------------------- travel pace

// 8fz. the pg 116 table, read as a rendered page image: 18/24/30 miles, and a
//      Passive Sneak of 15/12/10 plus the party's average Group Sneak bonus
step(
  "the travel pace table is 18/24/30 miles at Passive Sneak 15/12/10 + Group Sneak",
  api.TRAVEL_PACES.slow.miles === 18 &&
    api.TRAVEL_PACES.normal.miles === 24 &&
    api.TRAVEL_PACES.fast.miles === 30 &&
    api.passiveSneak("slow", 4) === 19 &&
    api.passiveSneak("normal", 4) === 16 &&
    api.passiveSneak("fast", 4) === 14,
  JSON.stringify({
    miles: ["slow", "normal", "fast"].map((p) => api.TRAVEL_PACES[p].miles),
    sneak: ["slow", "normal", "fast"].map((p) => api.passiveSneak(p, 4)),
  }),
);

// 8ga. Traveling Limits: 8 + half the Endurance modifier, rounded down. Note
//      the halving floors toward negative infinity, so a −1 modifier costs an
//      hour — which is what "rounded down" says.
step(
  "the travel hour limit is 8 + half the Endurance modifier, rounded down",
  api.travelHourLimit(0) === 8 &&
    api.travelHourLimit(2) === 9 &&
    api.travelHourLimit(5) === 10 &&
    api.travelHourLimit(-1) === 7,
  JSON.stringify({
    zero: api.travelHourLimit(0),
    two: api.travelHourLimit(2),
    minusOne: api.travelHourLimit(-1),
  }),
);

// 8gb. maximum travel distance — the term the book uses four times and defines
//      nowhere. Ruled as mph × hour limit, which reproduces the printed table
//      exactly at a modifier of 0, and a driver doubles it.
step(
  "maximum travel distance reproduces the printed 18/24/30 at an Endurance modifier of 0",
  api.maxTravelDistanceMiles("slow", 0, "foot") === 18 &&
    api.maxTravelDistanceMiles("normal", 0, "foot") === 24 &&
    api.maxTravelDistanceMiles("fast", 0, "foot") === 30 &&
    api.maxTravelDistanceMiles("normal", 0, "driving") === 48 &&
    api.maxTravelDistanceMiles("normal", 0, "mount", 40) === 40,
  JSON.stringify({
    foot: ["slow", "normal", "fast"].map((p) => api.maxTravelDistanceMiles(p, 0, "foot")),
    driving: api.maxTravelDistanceMiles("normal", 0, "driving"),
    mount: api.maxTravelDistanceMiles("normal", 0, "mount", 40),
  }),
);

// 8gc. the two fatigue rules are separate: hours past the limit, and The Roads
//      Walked's half-your-maximum-distance on foot
const easyDay = api.travelPlan({ pace: "normal", hours: 3, enduranceModifier: 0 });
const fullDay = api.travelPlan({ pace: "normal", hours: 8, enduranceModifier: 0 });
const longDay = api.travelPlan({ pace: "normal", hours: 11, enduranceModifier: 0 });
step(
  "fatigue comes from hours past the limit and from walking half your maximum distance",
  easyDay.fatigue === 0 &&
    fullDay.roadsWalkedFatigue === 1 &&
    fullDay.overageFatigue === 0 &&
    longDay.overageFatigue === 3 &&
    longDay.fatigue === 4,
  JSON.stringify({ easyDay, fullDay, longDay }),
);

// 8gd. terrain divides the distance travelled, never the hours (pg 116)
const rough = api.travelPlan({
  pace: "normal",
  hours: 8,
  enduranceModifier: 0,
  terrain: "extreme",
});
step(
  "difficult terrain quarters the distance travelled without changing the hours",
  rough.hours === 8 && rough.miles === 6,
  JSON.stringify({ rough }),
);

// 8ge. a mount is flatly exempt, and so — under the ruling at travelPlan — is a
//      passenger, whom the book's own two sentences both exempt and do not
const ridden = api.travelPlan({ pace: "fast", hours: 14, enduranceModifier: 0, mode: "mount" });
const carried = api.travelPlan({ pace: "fast", hours: 14, enduranceModifier: 0, mode: "passenger" });
step(
  "riding a mount or a caravan costs no fatigue however long the journey",
  ridden.fatigue === 0 && ridden.fatigueExempt === true && carried.fatigue === 0,
  JSON.stringify({ ridden, carried }),
);

// 8gf. and the live half: travel is the one control in this chapter that writes
//      to the sheet, and it writes fatigue
const walker = await ActorClass.create({ name: `SMOKE-Walker-${stamp}`, type: "npc" });
await walker.update({ "system.abilities.endurance.value": 5, "system.conditions.fatigue": 0 });
await settle();
const trip = await api.travel(walker, walker.system, { pace: "normal", hours: 11 });
await until(() => walker.system.conditions.fatigue > 0);
step(
  "an eleven-hour walk writes four levels of fatigue: three for the hours, one for the road",
  trip.fatigueApplied === 4 && walker.system.conditions.fatigue === 4,
  JSON.stringify({ trip, fatigue: walker.system.conditions.fatigue }),
);

// 8gg. fatigue stops at nine (pg 136) and the overflow is announced, not lost
//      silently
await walker.update({ "system.conditions.fatigue": 8 });
await settle();
const capped = await api.travel(walker, walker.system, { pace: "normal", hours: 14 });
await until(() => walker.system.conditions.fatigue === 9);
step(
  "fatigue caps at nine and the levels that went nowhere are reported",
  capped.fatigue === 7 && capped.fatigueApplied === 1 && walker.system.conditions.fatigue === 9,
  JSON.stringify({ capped, fatigue: walker.system.conditions.fatigue }),
);

await mover.delete();
await faller.delete();
await cushioned.delete();
await walker.delete();
