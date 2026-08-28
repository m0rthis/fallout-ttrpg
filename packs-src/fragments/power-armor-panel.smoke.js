// The Power Armor upgrades sheet panel (pg 59) — src/sheets/panels/power-armor.ts
// and templates/actor/parts/power-armor.hbs.
//
// Paste into the in-page suite of scripts/smoke.mjs after the Power Armor
// upgrades block (currently 8dj-8dz), which leaves `paSuit` equipped and on a
// live core. `step`, `actor`, `api`, `game`, `until` and `document` all come
// from the surrounding scope, and the panel is read off `actor.sheet.element`
// fresh each time rather than the `sheetElement` captured at step 4 — every
// click here re-renders the sheet, and the old element goes stale.
//
// Deliberately needs **no new api exports**. The panel is checked against the
// armor DataModel's own schema, which is the second independent reading of
// POWER_ARMOR_UPGRADES: if the table and the panel ever disagree about how many
// upgrades exist or how high a rank goes, these steps fail.

const panelOf = () => actor.sheet.element?.querySelector(".power-armor-upgrades");
const rowOf = (key) => panelOf()?.querySelector(`.upgrade-row[data-upgrade="${key}"]`);
// The printed maximum, read from the schema rather than from the panel, so the
// pip count below is compared against something the panel did not produce.
const schemaMax = (key) =>
  key === "coreAssembly"
    ? paSuit.system.schema.fields.coreAssemblyRank.max
    : paSuit.system.schema.fields.upgradeRanks.fields[key].max;
const upgradeKeys = ["coreAssembly", ...Object.keys(paSuit.system.upgradeRanks)];

// 8ea. the panel is on the sheet at all, and names the suit it belongs to.
//      The core is topped up first: the Tesla step below burns allotted time,
//      and a suit that ceases un-equips itself and takes the panel with it.
await paSuit.update({
  "system.equipped": true,
  "system.ceased": false,
  "system.overheated": false,
  "system.fusionCoreMinutes": 360,
});
await actor.sheet.render(true);
await until(() => !!panelOf());
step(
  "the upgrades panel renders for a worn suit",
  !!panelOf() && panelOf().textContent.includes(paSuit.name),
  JSON.stringify({ found: !!panelOf() }),
);

// 8eb. one row per upgrade in the table, and each row's pips stop exactly at
//      the rank pg 59 prints — a one-rank upgrade cannot be clicked to 2.
const rows = panelOf()?.querySelectorAll(".upgrade-row") ?? [];
const pipsMatchMax = upgradeKeys.every(
  (key) => (rowOf(key)?.querySelectorAll(".rank-pip").length ?? -1) === schemaMax(key),
);
step(
  "every upgrade has a row and no row offers more ranks than the table prints",
  rows.length === upgradeKeys.length && upgradeKeys.length === 19 && pipsMatchMax,
  JSON.stringify({
    rows: rows.length,
    upgrades: upgradeKeys.length,
    jetPackPips: rowOf("jetPack")?.querySelectorAll(".rank-pip").length,
    jetPackMax: schemaMax("jetPack"),
  }),
);

// 8ec. the honest half of the table: Headlamp is decoration, Sensor Array is
//      not, and the panel says so without anyone opening the rulebook.
const badge = (key) => rowOf(key)?.querySelector(".automation-badge");
step(
  "the panel marks text-only upgrades apart from automated ones",
  badge("headlamp")?.classList.contains("automation-text") === true &&
    rowOf("headlamp")?.classList.contains("text-only") === true &&
    badge("sensorArray")?.classList.contains("automation-effect") === true &&
    rowOf("sensorArray")?.classList.contains("text-only") === false,
  JSON.stringify({
    headlamp: badge("headlamp")?.className,
    sensorArray: badge("sensorArray")?.className,
  }),
);

// 8ed. clicking a pip writes the rank through upgradeRankPath — the nested
//      object for eighteen of them, the legacy field for Core Assembly.
await paSuit.update({ "system.upgradeRanks.sensorArray": 0, "system.coreAssemblyRank": 0 });
await actor.sheet.render(true);
await until(() => !!rowOf("sensorArray"));
rowOf("sensorArray")?.querySelector('.rank-pip[data-rank="2"]')?.click();
const sensorSet = await until(() => paSuit.system.upgradeRank("sensorArray") === 2);
await until(() => !!rowOf("coreAssembly"));
rowOf("coreAssembly")?.querySelector('.rank-pip[data-rank="3"]')?.click();
const assemblySet = await until(() => paSuit.system.coreAssemblyRank === 3);
step(
  "a rank pip writes to the path the upgrade actually stores",
  sensorSet && assemblySet && paSuit.system.upgradeRanks.sensorArray === 2,
  JSON.stringify({
    sensorArray: paSuit.system.upgradeRanks.sensorArray,
    coreAssembly: paSuit.system.coreAssemblyRank,
  }),
);

// 8ee. the rank a suit already has steps back down when clicked again, which is
//      the only way a rank returns to 0 — there is no separate clear control.
await until(() => rowOf("sensorArray")?.querySelector('.rank-pip[data-rank="2"].filled'));
rowOf("sensorArray")?.querySelector('.rank-pip[data-rank="2"]')?.click();
const steppedDown = await until(() => paSuit.system.upgradeRank("sensorArray") === 1);
await until(() => rowOf("sensorArray")?.querySelector('.rank-pip[data-rank="1"].filled'));
rowOf("sensorArray")?.querySelector('.rank-pip[data-rank="1"]')?.click();
const cleared = await until(() => paSuit.system.upgradeRank("sensorArray") === 0);
step(
  "clicking the current rank steps it back down, and rank 1 clears to 0",
  steppedDown && cleared,
  JSON.stringify({ sensorArray: paSuit.system.upgradeRank("sensorArray") }),
);

// 8ef. a pip click is a person pressing a button, so it rebuilds the effects the
//      rank implies — Sensor Array's passive sense arrives without anyone
//      pressing "Apply upgrade effects" as well.
const senseBefore = actor.system.derived.passiveSense;
await until(() => !!rowOf("sensorArray"));
rowOf("sensorArray")?.querySelector('.rank-pip[data-rank="2"]')?.click();
const senseArrived = await until(
  () => actor.system.derived.passiveSense === senseBefore + 10,
);
step(
  "setting a rank syncs the Active Effect it grants (Sensor Array 2 = +10 sense)",
  senseArrived,
  JSON.stringify({ before: senseBefore, after: actor.system.derived.passiveSense }),
);

// 8eg. and the standalone control still works, because ranks also change from
//      the item sheet, a compendium import, or the console — which is the case
//      the button exists for. Set a rank behind the panel's back, press it, and
//      the effect follows.
await paSuit.update({ "system.upgradeRanks.calibratedShocks": 3 });
// The raw bonus, not derived.carryLoadMax: an encumbrance halving elsewhere on
// the sheet would turn +50 into +25 and make this step lie about the effect.
const loadBefore = actor.system.bonuses.carryLoad;
await until(() => !!panelOf());
panelOf()?.querySelector('[data-action="syncUpgradeEffects"]')?.click();
const loadArrived = await until(() => actor.system.bonuses.carryLoad === loadBefore + 50);
step(
  "“Apply upgrade effects” picks up a rank edited outside the panel",
  loadArrived,
  JSON.stringify({ before: loadBefore, after: actor.system.bonuses.carryLoad }),
);
await paSuit.update({
  "system.upgradeRanks.calibratedShocks": 0,
  "system.upgradeRanks.sensorArray": 0,
  "system.coreAssemblyRank": 0,
});
await until(() => !!panelOf());
panelOf()?.querySelector('[data-action="syncUpgradeEffects"]')?.click();
await until(() => actor.system.bonuses.carryLoad === loadBefore);

// 8eh. the eight controls are all present, and the six that need an upgrade are
//      marked unavailable while the suit does not carry it.
await actor.sheet.render(true);
await until(() => !!panelOf());
const control = (action) => panelOf()?.querySelector(`[data-action="${action}"]`);
const controlActions = [
  "toggleTeslaCoils",
  "flyWithJetPack",
  "triggerExplosiveVent",
  "overclockOverheat",
  "optimizedBracersStrike",
  "queryInternalDatabase",
  "spendAllottedTime",
  "syncUpgradeEffects",
];
step(
  "the panel offers all seven controls plus the effect rebuild",
  controlActions.every((action) => !!control(action)),
  JSON.stringify(controlActions.filter((action) => !control(action))),
);
step(
  "a control whose upgrade is not installed is marked unavailable",
  control("flyWithJetPack")?.classList.contains("unavailable") === true &&
    control("spendAllottedTime")?.classList.contains("unavailable") === false,
  JSON.stringify({
    jetPack: control("flyWithJetPack")?.className,
    spendTime: control("spendAllottedTime")?.className,
  }),
);

// 8ei. installing the upgrade makes its control live, and the Tesla button says
//      which way it will throw the switch.
await paSuit.update({ "system.upgradeRanks.teslaCoils": 1, "system.teslaCoilsActive": false });
await actor.sheet.render(true);
await until(() => control("toggleTeslaCoils")?.classList.contains("unavailable") === false);
const teslaLabelOff = control("toggleTeslaCoils")?.textContent.trim();
control("toggleTeslaCoils")?.click();
const teslaOn = await until(() => paSuit.system.teslaCoilsActive === true);
await until(() => control("toggleTeslaCoils")?.textContent.includes("off"));
step(
  "the Tesla control goes live with the upgrade and reports its own state",
  teslaOn && !teslaLabelOff.includes("off"),
  JSON.stringify({ off: teslaLabelOff, on: control("toggleTeslaCoils")?.textContent.trim() }),
);
control("toggleTeslaCoils")?.click();
await until(() => paSuit.system.teslaCoilsActive === false);
await paSuit.update({ "system.upgradeRanks.teslaCoils": 0 });

// 8ej. a control that needs a number asks for one, and cancelling spends
//      nothing — the book prints no base drain rate, so an accidental dialog
//      must not cost the suit minutes it never agreed to.
const minutesBefore = paSuit.system.fusionCoreMinutes;
await until(() => !!panelOf());
control("spendAllottedTime")?.click();
const promptUp = await until(() => !!document.querySelector('input[name="amount"]'));
document.querySelector('button[data-action="cancel"]')?.click();
await until(() => !document.querySelector('input[name="amount"]'));
step(
  "spending allotted time prompts for minutes and cancelling costs nothing",
  promptUp && paSuit.system.fusionCoreMinutes === minutesBefore,
  JSON.stringify({ before: minutesBefore, after: paSuit.system.fusionCoreMinutes }),
);

// 8ek. no suit, no panel. Not an empty frame and not a disabled one: the whole
//      section is absent when nobody is wearing anything.
await paSuit.update({ "system.equipped": false });
await actor.sheet.render(true);
const gone = await until(() => !panelOf());
step("the panel disappears entirely when no Power Armor is worn", gone);
await paSuit.update({ "system.equipped": true });
await actor.sheet.render(true);
await until(() => !!panelOf());
