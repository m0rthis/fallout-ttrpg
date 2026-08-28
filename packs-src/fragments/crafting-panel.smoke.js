// ------------------------------------------------------- crafting bench panel
// The sheet panel over the crafting rules (pg 92; Encyclopedia pg 94-115).
// Drop this block into scripts/smoke.mjs inside the main try, after the
// crafting block (8ca-8c*), where `step`, `actor`, `api`, `game`, `until` and
// `sheetElement` are in scope. Every document it creates is SMOKE-* prefixed
// and deleted again.
//
// The panel's whole job is to state the check *before* it is rolled, so every
// assertion here is on what the rendered panel says, and all of it is
// deterministic: no step below rolls anything.

const bench = () => sheetElement?.querySelector(".crafting-bench") ?? null;
const benchText = () => (bench()?.textContent ?? "").replace(/\s+/g, " ").trim();
const benchRow = (name) =>
  Array.from(bench()?.querySelectorAll(".craft-row") ?? []).find((row) =>
    (row.textContent ?? "").includes(name),
  ) ?? null;
const rowText = (name) => (benchRow(name)?.textContent ?? "").replace(/\s+/g, " ").trim();

// cp1. the panel renders, names every skill the Encyclopedia rolls against —
//      fourteen of its thirty-three tables are not Crafting tables (pg 94-115)
//      — and says up front that materials are reported rather than deducted.
await until(() => bench() !== null);
const benchStrip = benchText();
step(
  "the crafting bench renders with all five Encyclopedia skills and the materials note",
  bench() !== null &&
    ["Crafting", "Science", "Explosives", "Medicine", "Survival"].every((skill) =>
      benchStrip.includes(skill),
    ) &&
    benchStrip.includes("never deducted"),
  benchStrip.slice(0, 200),
);

// cp2. a recipe on the sheet is listed with the check it would actually be
//      rolled against: DC is 10 + the printed Craft DC bonus (pg 92), so +5
//      reads DC 15, not DC 5.
await actor.update({ "system.skills.crafting.points": 0 });
const [benchBlade] = await actor.createEmbeddedDocuments("Item", [
  {
    name: "SMOKE-Bench-Blade",
    type: "weapon",
    system: {},
    flags: {
      "fallout-ttrpg": {
        blueprint: {
          name: "SMOKE-Bench-Blade",
          category: "bladed-melee-weapons",
          craftDC: 5,
          craftMaterials: "x2 steel, x1 adhesive.",
          craftTime: "1 hour.",
        },
      },
    },
  },
]);
await until(() => benchRow("SMOKE-Bench-Blade") !== null);
step(
  "an owned recipe lists its check as 10 + the printed Craft DC bonus",
  rowText("SMOKE-Bench-Blade").includes("Crafting DC 15") &&
    rowText("SMOKE-Bench-Blade").includes("x2 steel") &&
    rowText("SMOKE-Bench-Blade").includes("1 hour"),
  rowText("SMOKE-Bench-Blade"),
);

// cp3. short of the listed bonus, no automatic marker; meeting it, the marker
//      appears. Meeting the requirement is the pg 92 *normal* path — no roll at
//      all — and the point of the panel is that you can see that before you
//      commit to a click.
const benchBeforeRaise = benchRow("SMOKE-Bench-Blade")?.querySelector(".craft-auto") ?? null;
await actor.update({ "system.skills.crafting.points": 20 });
await until(() => (benchRow("SMOKE-Bench-Blade")?.querySelector(".craft-auto") ?? null) !== null);
step(
  "the panel marks an automatic success only once the listed requirement is met",
  benchBeforeRaise === null &&
    (benchRow("SMOKE-Bench-Blade")?.querySelector(".craft-auto") ?? null) !== null &&
    api.craftsAutomatically(
      { checks: [{ skills: ["crafting"], bonus: 5 }], rankCount: 1, rank: 1, rider: null },
      actor.system.derived.skillBonuses,
    ),
  JSON.stringify({ before: benchBeforeRaise !== null, crafting: actor.system.derived.skillBonuses.crafting }),
);

// cp4. the finding that most changes the feature: a Survival-headed table is a
//      Survival check (pg 113-114). Crafting +20 and Survival +0 still reads
//      Survival, and still is not automatic.
const [benchStew] = await actor.createEmbeddedDocuments("Item", [
  {
    name: "SMOKE-Bench-Stew",
    type: "aid",
    system: {},
    flags: {
      "fallout-ttrpg": {
        blueprint: {
          name: "SMOKE-Bench-Stew",
          category: "pre-made-food",
          craftDC: 3,
          craftMaterials: "x1 bloatfly meat.",
          craftTime: "30 minutes.",
        },
      },
    },
  },
]);
await until(() => benchRow("SMOKE-Bench-Stew") !== null);
step(
  "a Survival-headed table reads Survival on the panel, whatever the Crafting bonus is",
  rowText("SMOKE-Bench-Stew").includes("Survival DC 13") &&
    !rowText("SMOKE-Bench-Stew").includes("Crafting DC") &&
    (benchRow("SMOKE-Bench-Stew")?.querySelector(".craft-auto") ?? null) === null,
  JSON.stringify({
    row: rowText("SMOKE-Bench-Stew"),
    crafting: actor.system.derived.skillBonuses.crafting,
    survival: actor.system.derived.skillBonuses.survival,
  }),
);

// cp5. the 21 rows printed "-" are a rule, not missing data: the panel offers
//      no craft control for them at all.
const [benchRelic] = await actor.createEmbeddedDocuments("Item", [
  {
    name: "SMOKE-Bench-Relic",
    type: "gear",
    system: {},
    flags: {
      "fallout-ttrpg": {
        blueprint: {
          name: "SMOKE-Bench-Relic",
          category: "unique-items",
          craftDC: null,
          craftMaterials: "Cannot be crafted.",
          craftTime: null,
        },
      },
    },
  },
]);
await until(() => benchRow("SMOKE-Bench-Relic") !== null);
step(
  "an uncraftable row offers no craft control and says why",
  rowText("SMOKE-Bench-Relic").includes("Cannot be crafted") &&
    (benchRow("SMOKE-Bench-Relic")?.querySelector('[data-action="craftOwned"]') ?? null) === null,
  rowText("SMOKE-Bench-Relic"),
);

// cp6. the pg 115 drinks gate is the only prerequisite in the chapter that
//      closes a whole table, so the panel warns about it unprompted — and stops
//      warning once all three skills clear +8.
await actor.update({
  "system.skills.crafting.points": 20,
  "system.skills.survival.points": 0,
  "system.skills.science.points": 0,
});
await until(() => (bench()?.querySelector(".hint.warning") ?? null) !== null);
const benchGate = (bench()?.querySelector(".hint.warning")?.textContent ?? "").replace(/\s+/g, " ");
await actor.update({
  "system.skills.survival.points": 20,
  "system.skills.science.points": 20,
});
await until(() => (bench()?.querySelector(".hint.warning") ?? null) === null);
step(
  "the drinks gate warns while any of the three skills is short of +8, and clears when none is",
  benchGate.includes("Survival") &&
    benchGate.includes("Science") &&
    benchGate.includes("+8") &&
    (bench()?.querySelector(".hint.warning") ?? null) === null,
  benchGate,
);

// cp7. the picker's source: the equipment compendium, whose documents carry
//      their recipe as flags["fallout-ttrpg"].blueprint (build-packs.mjs). The
//      panel reads this once, lazily, from its async action — never from the
//      synchronous context() — so this asserts the data is there to read.
const benchPack = game.packs.get("fallout-ttrpg.equipment");
const benchPackDocs = benchPack ? await benchPack.getDocuments() : [];
const benchBlueprints = benchPackDocs.filter((doc) => doc.getFlag("fallout-ttrpg", "blueprint"));
const benchCraftable = benchBlueprints.filter(
  (doc) => (doc.getFlag("fallout-ttrpg", "blueprint").craftDC ?? null) !== null,
);
step(
  "the equipment compendium carries the recipes the picker reads",
  benchBlueprints.length > 300 && benchCraftable.length > 300,
  JSON.stringify({
    documents: benchPackDocs.length,
    blueprints: benchBlueprints.length,
    craftable: benchCraftable.length,
  }),
);

// cp8. clicking a recipe opens the craft dialog, which states the skill, the
//      DC and the materials before anything is rolled — and cancelling it
//      builds nothing.
const benchItemsBefore = actor.items.size;
benchRow("SMOKE-Bench-Stew")?.querySelector('[data-action="craftOwned"]')?.click();
await until(() => document.querySelector("dialog.application") !== null, 6000);
const benchDialog = document.querySelector("dialog.application");
const benchDialogText = (benchDialog?.textContent ?? "").replace(/\s+/g, " ").trim();
const benchCancel = benchDialog?.querySelector('button[data-action="cancel"]') ?? null;
if (benchCancel) benchCancel.click();
else if (benchDialog) benchDialog.close();
await until(() => document.querySelector("dialog.application") === null, 6000);
step(
  "the craft dialog states the check, the materials and the time before committing, and cancels clean",
  benchDialogText.includes("Survival DC 13") &&
    benchDialogText.includes("bloatfly meat") &&
    benchDialogText.includes("30 minutes") &&
    actor.items.size === benchItemsBefore,
  JSON.stringify({ dialog: benchDialogText.slice(0, 200), items: actor.items.size, before: benchItemsBefore }),
);

await benchBlade.delete();
await benchStew.delete();
await benchRelic.delete();
