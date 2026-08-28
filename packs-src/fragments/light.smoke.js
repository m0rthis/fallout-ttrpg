// ------------------------------------------------------- vision, light, flames
// Drop this inside the in-page suite in scripts/smoke.mjs, after the weather
// steps (8ah onwards) — it reuses the same "make a SMOKE- scene" shape and it
// needs setWeather to already be exercised.
//
// In scope: step(), until(), settle(), actor, api, game. Every document created
// here is SMOKE- prefixed and deleted again at the end; every call takes the
// scene explicitly, so the suite never touches a real scene it did not create.
//
// Requires on api (globalThis.falloutTTRPG):
//   pure   — obscurementOfLight, perceivedObscurement, worstObscurement,
//            obscurementEffect, visionRanges, bandObscurement,
//            nightvisionObscurement, blindsightReaches, flameDamageDice,
//            flameDamageFormula, flameRadiusFeet, spreadFlames
//   actions— getSceneLight, setSceneLight, getSenses, setSenses, weatherBands,
//            obscurementAt, describeObscurement, applyVisionCutoffs,
//            clearVisionCutoffs, visionCutoffsApplied, igniteFlames,
//            spreadFlameAreas, burnFlameOccupants, extinguishAllFlames,
//            flameRegions

const SceneClass2 = CONFIG.Scene.documentClass;
const lightStamp = Date.now();
const lightScene = await SceneClass2.create({
  name: `SMOKE-Light-${lightStamp}`,
  width: 2000,
  height: 2000,
  grid: { type: 1, size: 100, distance: 5, units: "ft" },
});

try {
  // l1. the printed equivalences (pg 118-119): bright sees normally, dim is a
  //     lightly obscured area, darkness is a heavily obscured one
  step(
    "light levels map onto the two degrees of obscurement (pg 118-119)",
    api.obscurementOfLight("bright") === "none" &&
      api.obscurementOfLight("dim") === "light" &&
      api.obscurementOfLight("darkness") === "heavy",
    JSON.stringify(["bright", "dim", "darkness"].map(api.obscurementOfLight)),
  );

  // l2. the numbers, printed once and only for the light degree. Heavy carries
  //     no passive-sense figure and no range multiplier — the book gives none,
  //     and a guess would make the worse degree look milder.
  const lightEffect = api.obscurementEffect("light");
  const heavyEffect = api.obscurementEffect("heavy");
  step(
    "lightly obscured: −5 passive sense, ranged range halved, sight Perception at disadvantage (pg 118)",
    lightEffect.passiveSense === -5 &&
      lightEffect.rangeMultiplier === 0.5 &&
      lightEffect.sightPerceptionDisadvantage === true &&
      lightEffect.blinded === false &&
      heavyEffect.blinded === true &&
      heavyEffect.passiveSense === undefined &&
      heavyEffect.rangeMultiplier === undefined,
    JSON.stringify({ lightEffect, heavyEffect }),
  );

  // l3. Nightvision (pg 119) softens DARKNESS to dim within its range, and does
  //     nothing at all outside it — nor against fog, which the sentence never
  //     mentions
  step(
    "nightvision makes darkness only lightly obscured inside its range (pg 119)",
    api.nightvisionObscurement("darkness", 30, 60) === "light" &&
      api.nightvisionObscurement("darkness", 90, 60) === "heavy" &&
      api.nightvisionObscurement("darkness", 30, 0) === "heavy" &&
      api.nightvisionObscurement("dim", 30, 60) === "light" &&
      api.nightvisionObscurement("bright", 30, 60) === "none",
    JSON.stringify({
      inRange: api.nightvisionObscurement("darkness", 30, 60),
      outOfRange: api.nightvisionObscurement("darkness", 90, 60),
    }),
  );

  // l4. Blindsight (pg 119) does not rely on sight, so nothing that obscures
  //     sight reaches it — inside the radius, and only inside it
  step(
    "blindsight perceives unobscured inside its radius and nothing outside it (pg 119)",
    api.blindsightReaches(30, 30) === true &&
      api.blindsightReaches(31, 30) === false &&
      api.blindsightReaches(10, 0) === false &&
      api.perceivedObscurement(20, "darkness", { blindsight: 30, nightvision: 0 }) === "none" &&
      api.perceivedObscurement(40, "darkness", { blindsight: 30, nightvision: 0 }) === "heavy",
    JSON.stringify({
      inside: api.perceivedObscurement(20, "darkness", { blindsight: 30, nightvision: 0 }),
      outside: api.perceivedObscurement(40, "darkness", { blindsight: 30, nightvision: 0 }),
    }),
  );

  // l5. two obscuring sources take the WORST, never the sum — the pg 130 cover
  //     precedent read from the other side, and a ruling, not a printed rule
  step(
    "stacked obscurement takes the worst degree, never the sum (ruled from pg 130)",
    api.worstObscurement("light", "heavy") === "heavy" &&
      api.worstObscurement() === "none" &&
      api.worstObscurement("none", "light") === "light" &&
      api.bandObscurement({ obscuredBeyondFeet: 15, blindBeyondFeet: 50 }, 10) === "none" &&
      api.bandObscurement({ obscuredBeyondFeet: 15, blindBeyondFeet: 50 }, 16) === "light" &&
      api.bandObscurement({ obscuredBeyondFeet: 15, blindBeyondFeet: 50 }, 51) === "heavy",
  );

  // l6. the ranges a virtual tabletop needs. In darkness unaided sight reaches
  //     nothing, but a LIT thing is still visible — pg 118's own distinction,
  //     and the reason a cutoff has to cap lightPerception too.
  const darkRanges = api.visionRanges({ blindsight: 0, nightvision: 0 }, "darkness", {});
  const nightRanges = api.visionRanges({ blindsight: 0, nightvision: 60 }, "darkness", {});
  const stormRanges = api.visionRanges({ blindsight: 0, nightvision: 60 }, "darkness", {
    blindBeyondFeet: 30,
  });
  step(
    "vision ranges: dark blinds unaided sight, nightvision restores it, a cutoff caps both",
    darkRanges.sightFeet === 0 &&
      darkRanges.lightPerceptionFeet === null &&
      nightRanges.sightFeet === 60 &&
      nightRanges.monochromeInDarkness === true &&
      stormRanges.sightFeet === 30 &&
      stormRanges.lightPerceptionFeet === 30,
    JSON.stringify({ darkRanges, nightRanges, stormRanges }),
  );

  // l7. scene light is scene state and paints the canvas. globalLight.bright
  //     is the knob that makes "dim everywhere" a real setting rather than an
  //     approximation.
  await api.setSceneLight("dim", lightScene);
  await settle();
  const dimEnv = {
    level: api.getSceneLight(lightScene),
    enabled: lightScene.environment.globalLight.enabled,
    bright: lightScene.environment.globalLight.bright,
  };
  await api.setSceneLight("darkness", lightScene);
  await settle();
  const darkEnv = {
    level: api.getSceneLight(lightScene),
    enabled: lightScene.environment.globalLight.enabled,
    darkness: lightScene.environment.darknessLevel,
  };
  step(
    "scene light round-trips and paints global light (dim = globally lit, not bright)",
    dimEnv.level === "dim" &&
      dimEnv.enabled === true &&
      dimEnv.bright === false &&
      darkEnv.level === "darkness" &&
      darkEnv.enabled === false &&
      darkEnv.darkness === 1,
    JSON.stringify({ dimEnv, darkEnv }),
  );

  // l8. senses round-trip, and clearing them removes the flag rather than
  //     storing a zero
  await api.setSenses(actor, { blindsight: 30, nightvision: 60 });
  const sensesSet = api.getSenses(actor);
  await api.setSenses(actor, { blindsight: 0, nightvision: 0 });
  const sensesCleared = api.getSenses(actor);
  step(
    "blindsight and nightvision ranges round-trip through the actor",
    sensesSet.blindsight === 30 &&
      sensesSet.nightvision === 60 &&
      sensesCleared.blindsight === 0 &&
      sensesCleared.nightvision === 0,
    JSON.stringify({ sensesSet, sensesCleared }),
  );

  // l9. the weather's own cutoff bands reach this chapter without being
  //     restated — Dust Storm severity 1 is "blind beyond 30 ft" (pg 123)
  await api.setWeather({ type: "dustStorm", severity: 1, radSeverity: 0, linked: 0 }, lightScene);
  await settle();
  const bands = api.weatherBands(lightScene);
  step(
    "the weather chapter's blind-beyond band reaches the vision layer (pg 123)",
    bands.blindBeyondFeet === 30,
    JSON.stringify(bands),
  );

  // l10. the cutoffs actually land on a token. detectionModes is a v14
  //      TypedObjectField keyed by mode id — an ARRAY is silently cleaned away
  //      to {}, which is the whole reason this looked out of reach.
  const tokenData = await actor.getTokenDocument({
    x: 500,
    y: 500,
    sight: { enabled: true, range: 0 },
  });
  const [visionToken] = await lightScene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
  await api.setSenses(actor, { blindsight: 0, nightvision: 60 });
  await api.setSceneLight("darkness", lightScene);
  await settle();

  await api.applyVisionCutoffs(lightScene);
  const cappedOk = await until(() => {
    const modes = visionToken._source.detectionModes;
    return modes.basicSight?.range === 30 && modes.lightPerception?.range === 30;
  });
  const cappedModes = foundry.utils.deepClone(visionToken._source.detectionModes);
  step(
    "a 30 ft blind-beyond band caps BOTH basicSight and lightPerception on the token",
    cappedOk &&
      visionToken.sight.range === 30 &&
      visionToken.sight.visionMode === "darkvision" &&
      api.visionCutoffsApplied(lightScene) === true,
    JSON.stringify({
      modes: cappedModes,
      range: visionToken.sight.range,
      mode: visionToken.sight.visionMode,
    }),
  );

  // l11. and come back off exactly as authored: the keys this system added are
  //      deleted so core recomputes its own defaults
  await api.clearVisionCutoffs(lightScene);
  const clearedOk = await until(
    () =>
      Object.keys(visionToken._source.detectionModes).length === 0 &&
      visionToken._source.sight.range === 0,
  );
  step(
    "clearing hands the token back its own vision and deletes the added modes",
    clearedOk &&
      visionToken.sight.visionMode === "basic" &&
      api.visionCutoffsApplied(lightScene) === false &&
      // core's defaults are back: basicSight tracks sight.range, light is unlimited
      visionToken.detectionModes.basicSight?.range === 0 &&
      visionToken.detectionModes.lightPerception?.range === null,
    JSON.stringify({
      source: foundry.utils.deepClone(visionToken._source.detectionModes),
      prepared: foundry.utils.deepClone(visionToken.detectionModes),
    }),
  );

  // l12. flames: the damage climbs with the area, on the outward reading of
  //      "for every 20 additional feet a flaming area grows" (pg 118).
  //      5 ft per round outward, so a die every four rounds.
  const fresh = { originRadiusFeet: 5, rounds: 0, spreadFeetPerRound: 5 };
  const fourRounds = { ...fresh, rounds: 4 };
  const forever = { ...fresh, rounds: 1000 };
  step(
    "flame damage: 2d10 at ignition, +1d10 per 20 ft of outward growth, capped at 50d10 (pg 118)",
    api.flameDamageFormula(fresh) === "2d10" &&
      api.flameDamageFormula({ ...fresh, rounds: 3 }) === "2d10" &&
      api.flameDamageFormula(fourRounds) === "3d10" &&
      api.flameRadiusFeet(fourRounds) === 25 &&
      api.flameDamageDice(forever) === 50 &&
      api.flameDamageFormula(api.spreadFlames(fresh)) === "2d10",
    JSON.stringify({
      atZero: api.flameDamageFormula(fresh),
      atFour: api.flameDamageFormula(fourRounds),
      radiusAtFour: api.flameRadiusFeet(fourRounds),
      capped: api.flameDamageDice(forever),
    }),
  );

  // l13. a fire is a resizable Region, not a MeasuredTemplate (whose distance
  //      silently refuses to update on 14.365), and it carries its own light
  const region = await api.igniteFlames(500, 500, fresh, lightScene);
  await settle(800);
  step(
    "igniting flames creates a region carrying its area, plus a light",
    !!region &&
      api.flameRegions(lightScene).length === 1 &&
      lightScene.lights.size === 1 &&
      region.shapes[0].radius === 100, // 5 ft at 100px / 5 ft
    JSON.stringify({
      regions: api.flameRegions(lightScene).length,
      lights: lightScene.lights.size,
      radiusPx: region?.shapes?.[0]?.radius,
    }),
  );

  // l14. spreading grows the shape and the light together, and the damage with
  //      them once four rounds have passed
  for (let i = 0; i < 4; i++) await api.spreadFlameAreas(lightScene);
  const grownOk = await until(() => api.flameRegions(lightScene)[0]?.shapes?.[0]?.radius === 500);
  const grown = api.flameRegions(lightScene)[0];
  step(
    "four rounds of spread grow the area to 25 ft and the damage to 3d10 (pg 118)",
    grownOk && api.describeFlames(grown.getFlag("fallout-ttrpg", "flames")).includes("3d10"),
    JSON.stringify({
      radiusPx: grown?.shapes?.[0]?.radius,
      note: api.describeFlames(grown.getFlag("fallout-ttrpg", "flames")),
    }),
  );

  // l15. everything standing in the flames takes fire damage and gains Burning
  await actor.update({
    "system.resources.hp.value": 20,
    "system.resources.sp.value": 20,
    "system.conditions.rads": 0,
  });
  await actor.toggleStatusEffect("burning", { active: false });
  const spBefore = actor.system.resources.sp.value;
  const burns = await api.burnFlameOccupants(lightScene);
  const burntOk = await until(
    () =>
      actor.system.resources.sp.value < spBefore &&
      (actor.statuses?.has("burning") ?? false),
  );
  step(
    "a creature in the flames takes the area's fire damage and gains Burning (pg 118)",
    burns.length === 1 && burntOk,
    JSON.stringify({
      burns,
      spBefore,
      sp: actor.system.resources.sp.value,
      burning: actor.statuses?.has("burning"),
    }),
  );
  await actor.toggleStatusEffect("burning", { active: false });

  // l16. putting it out removes the region and its light, and rolls nothing —
  //      the book gives no DC, no quantity and no action cost (pg 118)
  const beforeMessages = game.messages.size;
  const putOut = await api.extinguishAllFlames("water", lightScene);
  const goneOk = await until(
    () => api.flameRegions(lightScene).length === 0 && lightScene.lights.size === 0,
  );
  step(
    "water puts the flames out, taking the light with them, and rolls nothing (pg 118)",
    putOut === 1 &&
      goneOk &&
      !game.messages.contents
        .slice(beforeMessages - game.messages.size)
        .some((message) => (message.rolls?.length ?? 0) > 0),
    JSON.stringify({ putOut, regions: api.flameRegions(lightScene).length, lights: lightScene.lights.size }),
  );

  // l17. the reporting layer a GM actually reads at the table
  await api.setSenses(actor, { blindsight: 10, nightvision: 60 });
  const nearNote = api.describeObscurement(actor, 5, lightScene);
  const farNote = api.describeObscurement(actor, 200, lightScene);
  step(
    "the readout names the degree, its penalties, and which sense is carrying it",
    nearNote.includes("Blindsight") &&
      api.obscurementAt(actor, 5, lightScene) === "none" &&
      farNote.includes("Blinded") &&
      api.obscurementAt(actor, 200, lightScene) === "heavy",
    JSON.stringify({ nearNote, farNote }),
  );
  await api.setSenses(actor, { blindsight: 0, nightvision: 0 });
} finally {
  await lightScene.delete();
}
