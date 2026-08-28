// ---------------------------------------------------------------- first aid
// Medicine-skill first aid (pg 21, 23, 131): ending Bleeding, and stabilising
// a dying creature. Drop this block into scripts/smoke.mjs inside the main
// try, where `step`, `actor`, `api`, `game` and `ActorClass` are in scope.
//
// Both actions roll, so the outcome is random. Following the existing
// death-save step, these assert that the *bookkeeping moved* — the DC used, the
// tallies cleared, the floor respected — rather than a particular total. The
// two DC steps are the exception and are fully deterministic: the whole point
// of the ruling is which number gets asked for.

// A patient of its own, so the medic's Medicine bonus and the patient's
// Endurance stay independent. `SMOKE-` prefixed, so the run's own purge sweep
// reclaims it.
const patient = await ActorClass.create({ name: `SMOKE-Patient-${stamp}`, type: "character" });

// fa1. the stabilise DC is the pg 131 one, not the pg 21/23 one.
//      END 8 -> mod +3 -> DC 7. The rejected printing, with 2 failures and
//      1 success on the sheet, would have asked for 11 — so the two numbers
//      cannot coincide by accident here.
await patient.update({
  "system.abilities.endurance.value": 8,
  "system.resources.hp.value": 0,
  "system.resources.deathSaves.successes": 1,
  "system.resources.deathSaves.failures": 2,
});
step(
  "stabilise DC follows pg 131 (10 - END mod), not pg 21/23",
  api.stabilizeDC(patient.system.derived.abilityMods.endurance) === 7 &&
    api.summaryStabilizeDC(2, 1) === 11,
  JSON.stringify({
    combatChapter: api.stabilizeDC(patient.system.derived.abilityMods.endurance),
    summaryPage: api.summaryStabilizeDC(2, 1),
    endMod: patient.system.derived.abilityMods.endurance,
  }),
);

// fa2. a successful stabilise returns the patient to 1 HP and clears both
//      tallies; a failure leaves every number exactly where it was. Which of
//      the two happens is the die's business, so assert the pair.
const stabilized = await api.stabilizeCreature(actor, actor.system, patient);
step(
  "stabilise reports the pg 131 DC and moves the sheet only on a success",
  stabilized !== null &&
    stabilized.dc === 7 &&
    stabilized.apCost === 6 &&
    (stabilized.succeeded
      ? patient.system.resources.hp.value === 1 &&
        patient.system.resources.deathSaves.successes === 0 &&
        patient.system.resources.deathSaves.failures === 0
      : patient.system.resources.hp.value === 0 &&
        patient.system.resources.deathSaves.failures === 2),
  JSON.stringify({
    report: stabilized,
    hp: patient.system.resources.hp.value,
    saves: patient.system.resources.deathSaves,
  }),
);

// fa3. AP is reported, never deducted (roadmap item 14) — the medic's pool is
//      untouched by a 6 AP action.
const apBefore = actor.system.resources.ap.value;
await patient.update({
  "system.resources.hp.value": 0,
  "system.resources.deathSaves.successes": 0,
  "system.resources.deathSaves.failures": 0,
});
await api.stabilizeCreature(actor, actor.system, patient);
step(
  "first aid reports its 6 AP rather than spending it",
  actor.system.resources.ap.value === apBefore,
  JSON.stringify({ before: apBefore, after: actor.system.resources.ap.value }),
);

// fa4. a creature that has failed all of its death saves is past first aid.
//      Humans die on the fourth (Tenacity, pg 8), so four is the limit here.
await patient.update({
  "system.details.race": "human",
  "system.resources.hp.value": 0,
  "system.resources.deathSaves.failures": 4,
});
const tooLate = await api.stabilizeCreature(actor, actor.system, patient);
step(
  "first aid refuses a creature that has failed all its death saves",
  tooLate === null && patient.system.resources.hp.value === 0,
  JSON.stringify({ report: tooLate, saves: patient.system.resources.deathSaves }),
);

// fa5. a creature that is not dying is not a stabilise target at all.
await patient.update({
  "system.resources.hp.value": 10,
  "system.resources.deathSaves.failures": 0,
});
step(
  "stabilise refuses a creature that is not at 0 hit points",
  (await api.stabilizeCreature(actor, actor.system, patient)) === null,
);

// fa6. ending Bleeding is DC 15 and takes every level, not two. Deterministic
//      on the DC and on the shape of the outcome; the roll decides which.
await patient.update({ "system.conditions.bleeding": 5 });
const bleed = await api.endBleeding(actor, actor.system, patient);
step(
  "ending Bleeding is a DC 15 Medicine check that clears every level",
  bleed !== null &&
    bleed.dc === 15 &&
    bleed.apCost === 6 &&
    (bleed.succeeded
      ? patient.system.conditions.bleeding === 0
      : patient.system.conditions.bleeding === 5),
  JSON.stringify({ report: bleed, bleeding: patient.system.conditions.bleeding }),
);

// fa7. a disease floor is the real bottom. Weeping sores does not lock
//      Bleeding, so the floor is set directly — the point is that first aid
//      honours `derived.conditionFloors`, whatever puts one there.
await patient.update({ "system.conditions.bleeding": 3 });
const floorSpy = patient.system.derived.conditionFloors;
floorSpy.bleeding = 3;
const blocked = await api.endBleeding(actor, actor.system, patient);
step(
  "first aid will not write Bleeding below a disease floor",
  blocked === null && patient.system.conditions.bleeding === 3,
  JSON.stringify({ report: blocked, bleeding: patient.system.conditions.bleeding, floor: 3 }),
);

// fa8. nothing to treat is a refusal, not a wasted roll.
await patient.update({ "system.conditions.bleeding": 0 });
step(
  "ending Bleeding refuses a creature that is not bleeding",
  (await api.endBleeding(actor, actor.system, patient)) === null,
);

await patient.delete();
