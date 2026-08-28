// Smoke steps for the v2.1 combat actions: Grapple, Escape, Help, Ready and
// the unarmed strike (pg 126-127, plus Holey Moley on pg 52).
//
// Paste into the in-page suite of scripts/smoke.mjs, after the blocking block
// (currently 8an-8aq) — the last two steps reuse the `blade` weapon that block
// equips, and `ActorClass`, `stamp`, `api`, `actor` and `step` all come from
// the surrounding scope. Every document created here is SMOKE- prefixed and
// deleted at the end.
//
// Required on globalThis.falloutTTRPG before these run: grapple, escapeGrapple,
// grappledBy, unarmedStrike, helpAlly, consumeHelp, readyAction, triggerReady,
// lapseReady, readiedActions, unarmedContestDC, unarmedContestSucceeds.

// The suite's own formulaOf() reads the *last* message; some of these actions
// post an attack and then its damage, so this walks back to the most recent
// d20 rather than counting positions (a natural 1 posts no damage message).
const formulaBack = (back) =>
  String(game.messages.contents.at(back)?.rolls?.[0]?.formula ?? "").replace(/\s+/g, "");
const lastD20Formula = () => {
  for (let back = -1; back >= -6; back -= 1) {
    const formula = formulaBack(back);
    if (formula.includes("d20")) return formula;
  }
  return "";
};

const brawler = await ActorClass.create({ name: `SMOKE-Brawler-${stamp}`, type: "npc" });
await brawler.update({ "system.skills.unarmed.points": 4 });
const brawlerUnarmed = brawler.system.derived.skillBonuses.unarmed;

// 8ba. the pg 126 DC — v2.1 deleted v2.0's opposed roll, so only one side rolls
step(
  "grapple/escape DC is 10 + the other creature's Unarmed skill bonus",
  api.unarmedContestDC(brawlerUnarmed) === 10 + brawlerUnarmed,
  JSON.stringify({ brawlerUnarmed, dc: api.unarmedContestDC(brawlerUnarmed) }),
);

// 8bb. "If you succeed or roll a 20" — and, pointedly, no natural-1 auto-fail:
//      pg 128's critical failure rule is written for attack rolls, not checks
step(
  "a raw 20 carries the contest regardless of the DC, and a raw 1 does not sink it",
  api.unarmedContestSucceeds(3, 40, 20) === true &&
    api.unarmedContestSucceeds(45, 40, 1) === true &&
    api.unarmedContestSucceeds(39, 40, 7) === false,
  JSON.stringify({
    nat20: api.unarmedContestSucceeds(3, 40, 20),
    nat1: api.unarmedContestSucceeds(45, 40, 1),
    short: api.unarmedContestSucceeds(39, 40, 7),
  }),
);

// 8bc. a landed grapple applies the pg 134 status and remembers who did it, so
//      the target's Escape can price its own DC without selecting the grappler
const grabbed = await api.grapple(actor, actor.system, brawler, { dc: -100 });
step(
  "a successful grapple applies the grappled status and records the grappler",
  grabbed.succeeded === true &&
    brawler.statuses.has("grappled") &&
    api.grappledBy(brawler)?.name === actor.name,
  JSON.stringify({
    succeeded: grabbed.succeeded,
    ap: grabbed.ap,
    status: brawler.statuses.has("grappled"),
    captor: api.grappledBy(brawler),
  }),
);

// 8bd. and the recorded grappler is what Escape rolls against
const escapeDC = api.unarmedContestDC(api.grappledBy(brawler).unarmed);
const freed = await api.escapeGrapple(brawler, brawler.system, { dc: -100 });
step(
  "escape clears the status and the grappler record, and prices itself at 5 AP",
  freed.succeeded === true &&
    freed.ap === 5 &&
    !brawler.statuses.has("grappled") &&
    api.grappledBy(brawler) === null,
  JSON.stringify({ escapeDC, freed, status: brawler.statuses.has("grappled") }),
);

// 8be. nothing holding you and no DC given: the formula has no input, and the
//      book's own object grapples (bear trap, pg 80) print bespoke DCs
const noDC = await api.escapeGrapple(brawler, brawler.system);
step(
  "escape refuses to invent a DC when nothing recorded a grappler",
  noDC === null,
  JSON.stringify({ noDC }),
);

// 8bf. Clasp (pg 61) still describes the escape in v2.0 vocabulary; read as
//      disadvantage on the pg 126 check, which is the only reading that leaves
//      the property doing anything
await api.escapeGrapple(actor, actor.system, { dc: 5, clasp: true });
step(
  "Clasp gives the Escape check disadvantage",
  lastD20Formula().includes("2d20kl"),
  JSON.stringify({ formula: lastD20Formula() }),
);

// 8bg. check:resistGrapple has existed in src/rules/effects.ts with nothing
//      consulting it; the Escape action is the roll it was added for
const [stonewall] = await actor.createEmbeddedDocuments("ActiveEffect", [
  {
    name: "SMOKE-Stonewall",
    type: "base",
    system: {
      changes: [
        {
          key: "system.bonuses.advantage.checks.resistGrapple",
          type: "add",
          value: 1,
          phase: "initial",
          priority: 20,
        },
      ],
    },
  },
]);
await api.escapeGrapple(actor, actor.system, { dc: 5 });
step(
  "check:resistGrapple reaches a roll at last — the Escape check rolls 2d20kh",
  lastD20Formula().includes("2d20kh"),
  JSON.stringify({ formula: lastD20Formula() }),
);
await stonewall.delete();

// 8bh. Help, v2.1: a number, not advantage — half the helper's bonus in the
//      related skill, rounded down (the patch notes say "ability modifier";
//      the printed book says skill bonus, and the book wins)
await actor.update({ "system.skills.medicine.points": 6 });
const medBonus = actor.system.derived.skillBonuses.medicine;
const beforeHelp = brawler.system.derived.d20Bonus;
const help = await api.helpAlly(actor, actor.system, brawler, {
  mode: "check",
  skill: "medicine",
});
step(
  "Help adds half the helper's related skill bonus, rounded down",
  help.bonus === Math.floor(medBonus / 2) &&
    brawler.system.derived.d20Bonus === beforeHelp + Math.floor(medBonus / 2),
  JSON.stringify({ medBonus, bonus: help.bonus, d20Bonus: brawler.system.derived.d20Bonus }),
);

// 8bi. "their next ability check" is a trigger, not a clock — the roll spends it
const spentHelp = await api.consumeHelp(brawler);
step(
  "the next roll spends the Help and the bonus goes away",
  spentHelp === 1 && brawler.system.derived.d20Bonus === beforeHelp,
  JSON.stringify({ spentHelp, d20Bonus: brawler.system.derived.d20Bonus }),
);

// 8bj. the attack branch is the half v2.1 did NOT change: still advantage, so
//      this asserts the dice rather than a total
await api.helpAlly(actor, actor.system, brawler, { mode: "attack" });
await api.unarmedStrike(brawler, brawler.system);
step(
  "the Help attack branch still grants advantage — 2d20kh on the ally's attack",
  brawler.system.derived.advantage.attack === 1 &&
    brawler.system.derived.d20Bonus === beforeHelp &&
    lastD20Formula().includes("2d20kh"),
  JSON.stringify({
    attackAdv: brawler.system.derived.advantage.attack,
    formula: lastD20Formula(),
  }),
);
await api.consumeHelp(brawler);

// 8bk. Ready: the readied action's own AP plus a flat 2 (pg 126)
await actor.update({ "system.resources.ap.recycled": 0 });
const readied = await api.readyAction(actor, "SMOKE-trigger", 6);
step(
  "Ready costs the readied action plus a 2 AP surcharge",
  readied.ap === 8 && api.readiedActions(actor).length === 1,
  JSON.stringify({ readied, pending: api.readiedActions(actor).length }),
);

// 8bl. and the v2.1 refund: half the total, at the start of the next turn —
//      v2.0 gave back nothing at all
const refund = await api.lapseReady(actor, actor.system);
step(
  "a Ready whose trigger never fires recycles half the total AP (new in v2.1)",
  refund === 4 &&
    actor.system.resources.ap.recycled === 4 &&
    api.readiedActions(actor).length === 0,
  JSON.stringify({ refund, recycled: actor.system.resources.ap.recycled }),
);

// 8bm. a trigger that does fire refunds nothing
await actor.update({ "system.resources.ap.recycled": 0 });
await api.readyAction(actor, "SMOKE-trigger", 3);
const fired = await api.triggerReady(actor);
step(
  "a trigger that fires clears the Ready and refunds nothing",
  fired === 1 &&
    actor.system.resources.ap.recycled === 0 &&
    api.readiedActions(actor).length === 0,
  JSON.stringify({ fired, recycled: actor.system.resources.ap.recycled }),
);

// 8bn. Dazed "cannot recycle AP" (pg 133), and Ready's refund is a recycle.
//      A reading, not a printed interaction — asserted so it stays deliberate.
await actor.toggleStatusEffect("dazed", { active: true });
await api.readyAction(actor, "SMOKE-trigger", 6);
const dazedRefund = await api.lapseReady(actor, actor.system);
step(
  "a dazed creature recycles nothing when a Ready lapses",
  dazedRefund === 0 && actor.system.resources.ap.recycled === 0,
  JSON.stringify({ dazedRefund, recycled: actor.system.resources.ap.recycled }),
);
await actor.toggleStatusEffect("dazed", { active: false });

// 8bo. the unarmed strike — the action UNARMED_STRIKE_AP_COST was declared for
const one = await api.unarmedStrike(actor, actor.system);
const two = await api.unarmedStrike(actor, actor.system, { strikes: 2 });
step(
  "one unarmed strike costs 3 AP, two cost 5 AP and roll separately (v2.1)",
  one.ap === 3 && one.attacks.length === 1 && two.ap === 5 && two.attacks.length === 2,
  JSON.stringify({ one: one.ap, two: two.ap, twoRolls: two.attacks.length }),
);

// 8bp. and nothing beyond those two bundles has a printed price
const three = await api.unarmedStrike(actor, actor.system, { strikes: 3 });
const holey = await api.unarmedStrike(actor, actor.system, { strikes: 3, extraStrike: true });
step(
  "three strikes is unpriced without Holey Moley, and 6 AP with it (pg 52)",
  three === null && holey.ap === 6 && holey.attacks.length === 3,
  JSON.stringify({ three, holey: holey?.ap, rolls: holey?.attacks.length }),
);

// 8bq. "your block lasts until you attack again" (pg 127) — punching is
//      attacking. Reuses the `blade` from the blocking block above.
await api.startBlocking(actor, actor.system);
const blockingBeforePunch = api.isBlocking(actor);
await api.unarmedStrike(actor, actor.system);
step(
  "an unarmed strike ends a block, same as swinging a weapon",
  blockingBeforePunch === true && api.isBlocking(actor) === false,
  JSON.stringify({ blockingBeforePunch, blocking: api.isBlocking(actor) }),
);

await brawler.delete();
