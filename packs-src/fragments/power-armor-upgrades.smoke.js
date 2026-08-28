// Power Armor upgrades (pg 59) + the pg 57/9/11 gating.
//
// Paste into scripts/smoke.mjs after the existing Power Armor block (8d-8di),
// which leaves `paSuit` equipped, restarted, and on a full 360-minute core.
// Style matches that block: `step(name, condition, detail)`, `actor`, `api` and
// `game` in scope, documents prefixed SMOKE-.
//
// Requires these api exports (see the integration notes):
//   spendAllottedTime, toggleTeslaCoils, flyWithJetPack, triggerExplosiveVent,
//   overclockOverheat, optimizedBracersStrike, queryInternalDatabase,
//   syncPowerArmorEffects, powerArmorTurnStart, powerArmorShielding,
//   powerArmorReflection, targetedApWithVats

// 8dj. Race gating: a Robot cannot use Power Armor at all (pg 9)
const originalRace = actor.system.details.race;
await paSuit.update({ "system.equipped": false });
await actor.update({ "system.details.race": "robot" });
const robotRefused = await api.togglePowerArmor(actor, paSuit);
step(
  "a Robot cannot enter Power Armor",
  robotRefused === false && paSuit.system.equipped === false,
  JSON.stringify({ refused: robotRefused, equipped: paSuit.system.equipped }),
);

// 8dk. A Super Mutant needs the Super Mutant Fitting (pg 11, 59); once fitted,
//      humans and ghouls are locked out (pg 59).
await actor.update({ "system.details.race": "superMutant" });
const mutantRefused = await api.togglePowerArmor(actor, paSuit);
await paSuit.update({ "system.upgradeRanks.superMutantFitting": 1 });
const mutantEntered = await api.togglePowerArmor(actor, paSuit);
await api.togglePowerArmor(actor, paSuit);
await actor.update({ "system.details.race": "human" });
const humanRefused = await api.togglePowerArmor(actor, paSuit);
step(
  "the Super Mutant Fitting gates entry both ways",
  mutantRefused === false && mutantEntered === true && humanRefused === false,
  JSON.stringify({ mutantRefused, mutantEntered, humanRefused }),
);
await paSuit.update({ "system.upgradeRanks.superMutantFitting": 0 });
await actor.update({ "system.details.race": originalRace });
await api.togglePowerArmor(actor, paSuit);

// 8dl. The baseline drain finally has a caller: minutes only leave the core
//      when someone spends them, because the book prints no drain rate.
await paSuit.update({ "system.fusionCoreMinutes": 360 });
const manual = await api.spendAllottedTime(actor, paSuit, 45);
step(
  "allotted time can be spent by hand",
  manual.minutes === 315 && paSuit.system.fusionCoreMinutes === 315,
  JSON.stringify({ left: paSuit.system.fusionCoreMinutes }),
);

// 8dm. Tesla Coils: 10 minutes a round at rank 1, 25 at rank 3 (10 + 5 + 10),
//      charged on activation and again at each of the wearer's turn starts.
await paSuit.update({
  "system.upgradeRanks.teslaCoils": 3,
  "system.fusionCoreMinutes": 360,
  "system.overheated": false,
});
const teslaOn = await api.toggleTeslaCoils(actor, paSuit);
const afterActivation = paSuit.system.fusionCoreMinutes;
await api.powerArmorTurnStart(actor);
step(
  "Tesla Coils burn 25 minutes a round at rank 3",
  teslaOn === true &&
    afterActivation === 335 &&
    paSuit.system.fusionCoreMinutes === 310 &&
    paSuit.system.teslaCoilsActive === true,
  JSON.stringify({ afterActivation, afterTurn: paSuit.system.fusionCoreMinutes }),
);

// 8dn. Climbing out switches them off, so the next wearer is not charged for a
//      round they did not spend.
await api.togglePowerArmor(actor, paSuit);
const coilsOffOnExit = paSuit.system.teslaCoilsActive === false;
await api.togglePowerArmor(actor, paSuit);
step("exiting a suit shuts the Tesla Coils down", coilsOffOnExit, JSON.stringify({ coilsOffOnExit }));
await paSuit.update({ "system.upgradeRanks.teslaCoils": 0 });

// 8do. Jet Pack: 1 AP per 5 feet, 1 minute of allotted time per 10, rounded up
await paSuit.update({ "system.upgradeRanks.jetPack": 1, "system.fusionCoreMinutes": 360 });
const flight = await api.flyWithJetPack(actor, paSuit, 25);
step(
  "the Jet Pack spends a minute per 10 feet flown",
  flight.minutes === 357,
  JSON.stringify({ left: paSuit.system.fusionCoreMinutes }),
);

// 8dp. Explosive vent: 20 minutes per activation, radius 30 at rank 3
await paSuit.update({ "system.upgradeRanks.explosiveVent": 3 });
const vent = await api.triggerExplosiveVent(actor, paSuit);
step(
  "the Explosive vent costs 20 minutes each time it fires",
  vent.minutes === 337,
  JSON.stringify({ left: paSuit.system.fusionCoreMinutes }),
);

// 8dq. Flat upgrades ride on Active Effects against real bonus paths, and are
//      disabled while the suit is off. Sensor Array 5+5+10, Shocks 15+15+20.
const senseBefore = actor.system.derived.passiveSense;
const loadBefore = actor.system.derived.carryLoadMax;
await paSuit.update({
  "system.upgradeRanks.sensorArray": 3,
  "system.upgradeRanks.calibratedShocks": 3,
});
await api.syncPowerArmorEffects(actor, paSuit);
step(
  "Sensor Array and Calibrated Shocks are cumulative Active Effects",
  actor.system.derived.passiveSense === senseBefore + 20 &&
    actor.system.derived.carryLoadMax === loadBefore + 50,
  JSON.stringify({
    sense: actor.system.derived.passiveSense,
    load: actor.system.derived.carryLoadMax,
  }),
);

// 8dr. Taking the suit off takes its bonuses with it
await api.togglePowerArmor(actor, paSuit);
const senseOut = actor.system.derived.passiveSense;
await api.togglePowerArmor(actor, paSuit);
step(
  "an unworn suit grants none of its upgrade bonuses",
  senseOut === senseBefore,
  JSON.stringify({ senseOut, senseBefore }),
);

// 8ds. Emergency protocols rank 2: +5 DT only while under half hit points
await paSuit.update({ "system.upgradeRanks.emergencyProtocols": 2 });
await actor.update({ "system.resources.hp.value": actor.system.derived.hpMax });
await api.syncPowerArmorEffects(actor, paSuit);
const dtHealthy = actor.system.derived.dt;
await actor.update({ "system.resources.hp.value": 1 });
await api.syncPowerArmorEffects(actor, paSuit);
step(
  "Emergency protocols rank 2 gives +5 DT only below half hit points",
  actor.system.derived.dt === dtHealthy + 5,
  JSON.stringify({ healthy: dtHealthy, hurt: actor.system.derived.dt }),
);
await paSuit.update({ "system.upgradeRanks.emergencyProtocols": 0 });
await actor.update({ "system.resources.hp.value": actor.system.derived.hpMax });

// 8dt. Overclock Hydraulics: +2 max AP at rank 3, +2 more and advantage on
//      attack rolls while overheated, and rank 2 buys the overheat for 3 AP.
const apBefore = actor.system.derived.apMax;
await paSuit.update({
  "system.upgradeRanks.overclockHydraulics": 3,
  "system.fusionCoreMinutes": 360,
  "system.overheated": false,
});
await api.syncPowerArmorEffects(actor, paSuit);
const apRank3 = actor.system.derived.apMax;
await api.overclockOverheat(actor, paSuit);
step(
  "Overclock Hydraulics stacks its unconditional and overheated AP",
  apRank3 === apBefore + 2 &&
    actor.system.derived.apMax === apBefore + 4 &&
    actor.system.derived.advantage.attack >= 1 &&
    paSuit.system.overheated === true,
  JSON.stringify({
    base: apBefore,
    rank3: apRank3,
    overheated: actor.system.derived.apMax,
    advantage: actor.system.derived.advantage.attack,
  }),
);

// 8du. Clearing the overheat takes the overheated half away again
await api.clearOverheat(actor);
step(
  "the overheated buff lapses with the overheat",
  actor.system.derived.apMax === apBefore + 2,
  JSON.stringify({ ap: actor.system.derived.apMax }),
);
await paSuit.update({ "system.upgradeRanks.overclockHydraulics": 0 });
await api.syncPowerArmorEffects(actor, paSuit);

// 8dv. Kinetic dynamo: 1 AP per level of decay taken since the last turn, and
//      the turn-start figure moves with it so the overheat check still reads
//      what the turn actually spent.
await paSuit.update({
  "system.upgradeRanks.kineticDynamo": 1,
  "system.decay": 3,
  "system.decayLastTurn": 1,
  "system.overheated": false,
  "system.fusionCoreMinutes": 360,
});
await actor.update({
  "system.resources.ap.value": 10,
  "system.resources.ap.turnStart": 10,
});
await api.powerArmorTurnStart(actor);
step(
  "Kinetic dynamo returns an AP per level of decay taken since your last turn",
  actor.system.resources.ap.value === 12 &&
    actor.system.resources.ap.turnStart === 12 &&
    paSuit.system.decayLastTurn === 3,
  JSON.stringify({
    ap: actor.system.resources.ap.value,
    turnStart: actor.system.resources.ap.turnStart,
    snapshot: paSuit.system.decayLastTurn,
  }),
);
await paSuit.update({ "system.upgradeRanks.kineticDynamo": 0 });

// 8dw. VATS matrix overlay cuts the *additional* AP of a targeted attack by 1
//      per rank, to a floor of 0 — the Fusion Core's +5 becomes +3.
await paSuit.update({ "system.upgradeRanks.vatsMatrix": 2 });
const coreAp = api.targetedApWithVats(actor, 5);
const eyeAp = api.targetedApWithVats(actor, 1);
step(
  "VATS matrix overlay reduces targeted-attack AP and floors at zero",
  coreAp === 3 && eyeAp === 0,
  JSON.stringify({ coreAp, eyeAp }),
);
await paSuit.update({ "system.upgradeRanks.vatsMatrix": 0 });

// 8dx. Explosive and Prism shielding reduce damage of their own types only
await paSuit.update({
  "system.upgradeRanks.explosiveShielding": 3,
  "system.upgradeRanks.prismShielding": 3,
});
const boom = api.powerArmorShielding(actor, 40, "explosive");
const laser = api.powerArmorShielding(actor, 40, "laser");
const bullet = api.powerArmorShielding(actor, 40, "ballistic");
step(
  "shielding reduces only the damage types it names",
  boom.amount === 25 && laser.amount === 20 && bullet.amount === 40,
  JSON.stringify({ boom: boom.amount, laser: laser.amount, bullet: bullet.amount }),
);
await paSuit.update({
  "system.upgradeRanks.explosiveShielding": 0,
  "system.upgradeRanks.prismShielding": 0,
});

// 8dy. Reactive Plates reflect a quarter per rank, rounded down each time —
//      not half of the total, whatever the printed aside says.
await paSuit.update({ "system.upgradeRanks.reactivePlates": 3 });
const reflected = api.powerArmorReflection(actor, 7);
step(
  "Reactive Plates reflect two quarters, each rounded down",
  reflected.damage === 2 && reflected.knockback === 15,
  JSON.stringify(reflected),
);
await paSuit.update({ "system.upgradeRanks.reactivePlates": 0 });

// 8dz. One accessor for nineteen upgrades: Core Assembly still answers from the
//      legacy field it shipped in, everything else from `upgradeRanks`.
await paSuit.update({ "system.coreAssemblyRank": 2, "system.upgradeRanks.internalDatabase": 1 });
step(
  "upgradeRank() reads both the legacy Core Assembly field and the new object",
  paSuit.system.upgradeRank("coreAssembly") === 2 &&
    paSuit.system.upgradeRank("internalDatabase") === 1 &&
    paSuit.system.upgradeRank("headlamp") === 0,
  JSON.stringify({
    coreAssembly: paSuit.system.upgradeRank("coreAssembly"),
    internalDatabase: paSuit.system.upgradeRank("internalDatabase"),
  }),
);
await paSuit.update({ "system.coreAssemblyRank": 0 });
