// ---------------------------------------------------------------- crafting
// Insert after the existing repair block (8be/8bf) — it reuses the same
// "raise crafting, craft, put it back" shape. Assumes `actor`, `api`, `game`
// and `step` are in scope, and follows the suite's contract: every document
// created here is named SMOKE-* and is deleted again.
//
// Everything asserted below is deterministic. The crafting check is 1d20 +
// bonus against 10 + the printed Craft DC (pg 92), so the tests either meet
// the requirement outright (no roll happens at all) or set a DC no d20 can
// reach, rather than asserting on a die.

// 8ca. meeting the listed requirement crafts the item with no roll at all —
//      the pg 92 "How to Craft" path, which is the *normal* path, not a
//      special case. Materials are reported in full.
const blueprint = {
  name: "SMOKE-Blade",
  category: "bladed-melee-weapons",
  craftDC: 5,
  craftMaterials: "x1 adhesive, x2 wood, x3 steel.",
  craftTime: "1 hour.",
};
const [pattern] = await actor.createEmbeddedDocuments("Item", [
  {
    name: "SMOKE-Blade",
    type: "weapon",
    system: { decay: 4 },
    flags: { "fallout-ttrpg": { blueprint } },
  },
]);
await actor.update({ "system.skills.crafting.points": 30 });
const before = actor.items.size;
const auto = await api.craftItem(actor, actor.system, pattern);
step(
  "a Crafting bonus that meets the listed requirement crafts without rolling",
  auto.automatic === true &&
    auto.succeeded === true &&
    auto.rolled === 0 &&
    actor.items.size === before + 1,
  JSON.stringify({ auto: { automatic: auto.automatic, rolled: auto.rolled }, before, after: actor.items.size }),
);

// 8cb. the crafted copy is a *new* item at zero decay, not a reference to the
//      pattern — a fresh build is not born damaged.
const built = actor.items.filter((item) => item.name === "SMOKE-Blade" && item.id !== pattern.id)[0];
step(
  "the crafted item is a new document at zero decay",
  !!built && built.system.decay === 0 && pattern.system.decay === 4,
  JSON.stringify({ built: built?.system.decay, pattern: pattern.system.decay }),
);
if (built) await built.delete();

// 8cc. the DC is 10 + the printed bonus, and materials tier off the margin:
//      failing by 8 or more loses 1d6 of each material used, capped at what the
//      recipe called for (pg 92). DC 50 is unreachable, so this is not a
//      dice-dependent assertion.
await actor.update({ "system.skills.crafting.points": 0 });
const rout = await api.craftItem(actor, actor.system, pattern, { dcBonus: 40 });
step(
  "a Crafting check that misses by 8 or more fails the craft and burns materials",
  rout.succeeded === false &&
    rout.outcome === "failedBadly" &&
    rout.dc === 50 &&
    rout.materials.every((material) => material.spent >= 1 && material.spent <= material.required),
  JSON.stringify({ outcome: rout.outcome, dc: rout.dc, materials: rout.materials }),
);

// 8cd. assistance halves the crafting time once per additional creature, and
//      an assistant who cannot meet the requirement can sink the whole build
//      however well the crafter rolled (pg 92). The crafter here needs no roll.
await actor.update({ "system.skills.crafting.points": 30 });
const zeroBonuses = Object.fromEntries(
  Object.keys(actor.system.derived.skillBonuses).map((skill) => [skill, -50]),
);
const helped = await api.craftItem(actor, actor.system, pattern, {
  assistants: [
    { name: "SMOKE-Helper-A", skillBonuses: actor.system.derived.skillBonuses },
    { name: "SMOKE-Helper-B", skillBonuses: zeroBonuses },
  ],
});
step(
  "two assistants quarter the crafting time, and an unqualified one fails the craft",
  helped.minutes === 15 && helped.automatic === true && helped.succeeded === false,
  JSON.stringify({ minutes: helped.minutes, automatic: helped.automatic, succeeded: helped.succeeded }),
);
for (const item of actor.items.filter((i) => i.name === "SMOKE-Blade" && i.id !== pattern.id)) {
  await item.delete();
}
await pattern.delete();

// 8ce. Power Armor is a multi-day build: one check per day, and the materials
//      are the printed daily cost multiplied by the *original* day count
//      (pg 94). Three printed days, so x2 steel becomes x6.
const [suit] = await actor.createEmbeddedDocuments("Item", [
  {
    name: "SMOKE-Suit",
    type: "armor",
    system: { isPowerArmor: true },
    flags: {
      "fallout-ttrpg": {
        blueprint: {
          name: "SMOKE-Suit",
          category: "power-armor",
          craftDC: 0,
          craftMaterials: "x2 steel.",
          craftTime: "3 days.",
        },
      },
    },
  },
]);
const armor = await api.craftItem(actor, actor.system, suit);
step(
  "a Power Armor build runs for its printed days and multiplies its materials",
  armor.days === 3 && armor.succeeded === true && armor.materials[0].spent === 6,
  JSON.stringify({ days: armor.days, materials: armor.materials }),
);
for (const item of actor.items.filter((i) => i.name === "SMOKE-Suit" && i.id !== suit.id)) {
  await item.delete();
}
await suit.delete();
await actor.update({ "system.skills.crafting.points": 0 });

// 8cf. not every Encyclopedia table rolls Crafting. Food heads its DC column
//      "Survival DC" (pg 113), so a character with 30 crafting points and no
//      Survival must still roll — the automatic path must not fire.
const [meal] = await actor.createEmbeddedDocuments("Item", [
  {
    name: "SMOKE-Meal",
    type: "aid",
    system: { aidType: "food" },
    flags: {
      "fallout-ttrpg": {
        blueprint: {
          name: "SMOKE-Meal",
          category: "untitled-food-table",
          craftDC: 40,
          craftMaterials: "x2 Bloatfly meat",
          craftTime: "30 minutes",
        },
      },
    },
  },
]);
await actor.update({ "system.skills.crafting.points": 30, "system.skills.survival.points": 0 });
const cooked = await api.craftItem(actor, actor.system, meal);
step(
  "cooking rolls Survival, not Crafting — the Craft DC column heading decides",
  cooked.automatic === false && cooked.dc === 50,
  JSON.stringify({ automatic: cooked.automatic, dc: cooked.dc }),
);
for (const item of actor.items.filter((i) => i.name === "SMOKE-Meal" && i.id !== meal.id)) {
  await item.delete();
}
await meal.delete();
await actor.update({ "system.skills.crafting.points": 0 });

// 8cg. the build carries the craft half of the Encyclopedia onto the shipped
//      equipment, including the upgrade and mod documents whose names the
//      tables print without their prefix. Read-only: nothing is created here.
const equipment = game.packs.get("fallout-ttrpg.equipment");
const fetch = async (itemName) => {
  const found = equipment?.index.find((doc) => doc.name === itemName);
  return found ? await equipment.getDocument(found._id) : null;
};
const knife = await fetch("Combat Knife");
const t45 = await fetch("Power Armor: T-45");
const insulated = await fetch("Armor Upgrade: Insulated");
const nineMil = await fetch("9mm");
const knifePlan = knife?.getFlag("fallout-ttrpg", "blueprint");
const t45Plan = t45?.getFlag("fallout-ttrpg", "blueprint");
const insulatedPlan = insulated?.getFlag("fallout-ttrpg", "blueprint");
step(
  "compendium items carry their Blueprint Encyclopedia craft DC, materials and time",
  knifePlan?.craftDC === 10 &&
    knifePlan?.craftTime === "1 hour." &&
    t45Plan?.craftDC === 18 &&
    t45Plan?.craftTime === "10 days." &&
    // A bare "Insulated" in the book, "Armor Upgrade: Insulated" in the pack.
    insulatedPlan?.craftDC === "Rank 1: +8; Rank 2: +20" &&
    // The ammunition tables print how many rounds one recipe makes.
    nineMil?.getFlag("fallout-ttrpg", "blueprint")?.yield === 12,
  JSON.stringify({
    knife: knifePlan?.craftDC,
    t45: t45Plan?.craftDC,
    insulated: insulatedPlan?.craftDC,
    nineMil: nineMil?.getFlag("fallout-ttrpg", "blueprint")?.yield,
  }),
);
