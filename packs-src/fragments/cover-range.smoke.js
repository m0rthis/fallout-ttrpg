// ---------------------------------------------------------------- cover + range
// Drop this inside the in-page suite in scripts/smoke.mjs, alongside the other
// keyword steps (after 8au reads well — it reuses the same rifle shape).
// In scope: step(), until(), actor, api, game. Documents are SMOKE- prefixed.
//
// The rule under test is about advantage, so these assert the DICE (2d20kl vs
// 1d20), not totals — a total can pass for the wrong reason.
//
// Requires on api (globalThis.falloutTTRPG): rollAttack (already exported), plus
// bestCover / rangeBand for the two pure-rule steps at the end.

// A weapon with clean range multipliers: at Perception 5 the bands land on
// exactly 10 ft normal / 30 ft long, so the boundaries are testable.
await actor.update({ "system.abilities.perception.value": 5, "system.abilities.strength.value": 8 });
const [carbine] = await actor.createEmbeddedDocuments("Item", [
  {
    name: "SMOKE-Carbine",
    type: "weapon",
    system: {
      weaponType: "rifle",
      damage: "1d8",
      apCost: 4,
      critChance: 20,
      strengthReq: 4,
      rangeNormal: 2,
      rangeLong: 6,
      magazineSize: 0,
      oneHanded: false,
    },
  },
]);
const lastFlavor = () => String(game.messages.contents.at(-1)?.flavor ?? "");
const lastFormula = () => String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");

// r1. inside normal range: no penalty, and the boundary itself is clean
//     ("beyond normal range", pg 21 — 10 ft is not beyond 10 ft)
await api.rollAttack(actor, actor.system, carbine, carbine.system, "normal", { distanceFeet: 10 });
const nearFormula = lastFormula();
step(
  "a shot at exactly normal range rolls straight (pg 21)",
  nearFormula.includes("1d20") && !nearFormula.includes("2d20"),
  nearFormula,
);

// r2. past normal range, inside long range: disadvantage
await api.rollAttack(actor, actor.system, carbine, carbine.system, "normal", { distanceFeet: 20 });
const midFormula = lastFormula();
const midFlavor = lastFlavor();
step(
  "past normal range the attack is at disadvantage (pg 21, pg 66)",
  midFormula.includes("2d20kl") && midFlavor.includes("20 ft"),
  JSON.stringify({ midFormula, midFlavor }),
);

// r3. past long range: still disadvantage, and the card carries both of the
//     book's incompatible rulings plus this roll's verdict
await api.rollAttack(actor, actor.system, carbine, carbine.system, "normal", { distanceFeet: 100 });
const farFormula = lastFormula();
const farFlavor = lastFlavor();
const farRaw = game.messages.contents.at(-1)?.rolls?.[0]?.dice?.[0]?.results?.find((r) => r.active)
  ?.result;
step(
  "beyond long range: disadvantage, both printings named, hit only on a natural 20 (pg 66 over pg 21)",
  farFormula.includes("2d20kl") &&
    farFlavor.includes("pg 66") &&
    farFlavor.includes("pg 21") &&
    (farRaw === 20 ? farFlavor.includes("it hits") : farFlavor.includes("misses")),
  JSON.stringify({ farFormula, farRaw, farFlavor }),
);

// r4. a melee weapon has no bands to compare against, so a distance is ignored
//     rather than read as "beyond a 0 ft long range"
const [club] = await actor.createEmbeddedDocuments("Item", [
  {
    name: "SMOKE-Club",
    type: "weapon",
    system: { weaponType: "blunt", damage: "1d6", apCost: 3, critChance: 20, magazineSize: 0 },
  },
]);
await api.rollAttack(actor, actor.system, club, club.system, "normal", { distanceFeet: 200 });
const meleeFormula = lastFormula();
step(
  "a weapon with no printed range ignores a declared distance",
  meleeFormula.includes("1d20") && !meleeFormula.includes("2d20"),
  meleeFormula,
);
await club.delete();

// c1. total cover refuses the attack outright (pg 130) — no roll, no message
const beforeTotal = game.messages.size;
await api.rollAttack(actor, actor.system, carbine, carbine.system, "normal", { cover: "total" });
step(
  "total cover blocks the attack entirely (pg 130)",
  game.messages.size === beforeTotal,
  `messages ${beforeTotal}->${game.messages.size}`,
);

// c2. half and three-quarters cover are reported with their printed AC, and do
//     NOT touch the dice — the bonus belongs to the target's AC
await api.rollAttack(actor, actor.system, carbine, carbine.system, "normal", { cover: "half" });
const halfFlavor = lastFlavor();
const halfFormula = lastFormula();
await api.rollAttack(actor, actor.system, carbine, carbine.system, "normal", {
  cover: "threeQuarters",
});
const tqFlavor = lastFlavor();
step(
  "cover reports +2 / +5 to the target's AC and leaves the attacker's dice alone (pg 130)",
  halfFlavor.includes("+2") &&
    tqFlavor.includes("+5") &&
    halfFormula.includes("1d20") &&
    !halfFormula.includes("2d20"),
  JSON.stringify({ halfFlavor, tqFlavor, halfFormula }),
);

// c3. a covering creature: the redirect note is always announced, and the
//     redirect itself fires exactly when the total is 6 or below (pg 130)
await api.rollAttack(actor, actor.system, carbine, carbine.system, "normal", {
  cover: "half",
  coverIsCreature: true,
});
const creatureFlavor = lastFlavor();
const creatureTotal = game.messages.contents.at(-1)?.rolls?.[0]?.total ?? 99;
step(
  "a covering creature takes the hit on a total of 6 or below (pg 130)",
  creatureFlavor.includes("using a creature as cover") &&
    (creatureTotal <= 6) === creatureFlavor.includes("goes to the covering creature"),
  JSON.stringify({ creatureTotal, creatureFlavor }),
);

// c4. the printed non-stacking rule: "only the most protective degree of cover
//     applies; the degrees aren't added together" (pg 130)
step(
  "stacked cover takes the most protective degree, never the sum (pg 130)",
  api.bestCover(["half", "threeQuarters"]) === "threeQuarters" &&
    api.bestCover([]) === "none" &&
    api.bestCover(["total", "half"]) === "total",
  JSON.stringify(["half", "threeQuarters"].map((d) => api.bestCover([d, "half"]))),
);

// c5. the band boundaries, straight off the pure classifier
step(
  "range bands: at normal is normal, past normal is long, past long is beyond",
  api.rangeBand(10, { normal: 10, long: 30 }) === "normal" &&
    api.rangeBand(11, { normal: 10, long: 30 }) === "long" &&
    api.rangeBand(30, { normal: 10, long: 30 }) === "long" &&
    api.rangeBand(31, { normal: 10, long: 30 }) === "beyond",
);

await carbine.delete();
