// ------------------------------------------- the combat-actions sheet panel
// The character-sheet panel that exposes the v2.1 combat actions — Grapple,
// Escape, Unarmed Strike, Help and Ready (pg 126-127). The rules themselves are
// covered by the combat-actions block (8ba-8bq); these steps are about the
// *panel*: that its controls exist and are wired, that every AP figure on it
// comes from the rules module rather than from the markup, and that the three
// pieces of state a player cannot otherwise see — who is holding you, whose
// Help you are carrying, what you have readied — are actually shown.
//
// Paste into the in-page suite of scripts/smoke.mjs after the combat-actions
// block; `step`, `actor`, `api`, `game`, `ActorClass` and `stamp` all come from
// the surrounding scope. Every document created here is SMOKE- prefixed and
// deleted at the end.
//
// Requires packs-src/fragments/combat-panel.lang.json merged under FALLOUT in
// static/lang/en.json — an unmerged key renders as its own path, and the two
// steps that read a number out of the panel will say so by failing.

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const showPanel = async () => {
  await actor.sheet.render(true);
  await settle();
  return actor.sheet.element?.querySelector(".panel.combat-actions") ?? null;
};

const captor = await ActorClass.create({ name: `SMOKE-Captor-${stamp}`, type: "npc" });
await captor.update({ "system.skills.unarmed.points": 3, "system.skills.medicine.points": 6 });

// cp1. the panel mounts at all, with every control the brief asks of it. A
//      failure with the other panels passing means this panel; a failure with
//      all of them means partial registration (see 8bpz).
let panel = await showPanel();
const controls = [
  "grapple",
  "escapeGrapple",
  "unarmedStrike",
  "helpAlly",
  "readyAction",
];
step(
  "the combat-actions panel renders with a control for each v2.1 action",
  !!panel && controls.every((action) => !!panel.querySelector(`[data-action="${action}"]`)),
  JSON.stringify({
    panel: !!panel,
    missing: controls.filter((action) => !panel?.querySelector(`[data-action="${action}"]`)),
  }),
);

// cp2. AP is reported, and reported from one place: the strike buttons are
//      rendered from unarmedStrikeApCost, so a price typed into the markup
//      would diverge here. Three bundles — 1, 2 (the v2.1 addition) and the
//      third that exists only because Holey Moley prices it (pg 52, 127).
const strikeButtons = Array.from(panel?.querySelectorAll('[data-action="unarmedStrike"]') ?? []);
const priced = strikeButtons.map((button) => ({
  strikes: Number(button.dataset.strikes),
  extra: button.dataset.extra === "true",
  shown: Number(String(button.querySelector(".ap-cost")?.textContent ?? "").replace(/[^0-9]/g, "")),
}));
step(
  "every unarmed-strike button prices itself from the rules module",
  priced.length === 3 &&
    priced.every((bundle) => bundle.shown === api.unarmedStrikeApCost(bundle.strikes, bundle.extra)),
  JSON.stringify({
    shown: priced,
    expected: priced.map((bundle) => api.unarmedStrikeApCost(bundle.strikes, bundle.extra)),
  }),
);

// cp3. and pressing one reports that cost rather than spending it (roadmap
//      item 14) — the panel is a reporter, not a cashier.
const apBefore = actor.system.resources.ap.value;
panel?.querySelector('[data-action="unarmedStrike"]')?.click();
await settle(600);
step(
  "pressing an unarmed strike reports its AP and deducts none",
  actor.system.resources.ap.value === apBefore,
  JSON.stringify({ before: apBefore, after: actor.system.resources.ap.value }),
);

// cp4. Escape takes no target, so with nothing holding you it has nothing to
//      roll against: pg 126 frees you from "a grapple, restrain, or chokehold"
//      and the DC comes off a creature's Unarmed skill. Refusing is the whole
//      behaviour — no roll is posted at all.
if (api.grappledBy(actor)) await actor.unsetFlag("fallout-ttrpg", "grappledBy");
await actor.toggleStatusEffect("grappled", { active: false });
await actor.toggleStatusEffect("restrained", { active: false });
panel = await showPanel();
const messagesBefore = game.messages.size;
panel?.querySelector('[data-action="escapeGrapple"]')?.click();
await settle(600);
step(
  "Escape refuses, and rolls nothing, when nothing is holding you",
  game.messages.size === messagesBefore,
  JSON.stringify({ before: messagesBefore, after: game.messages.size }),
);

// cp5. once something is, the sheet names it and prints the DC the Escape will
//      roll against — the one number a grappled player cannot otherwise see,
//      since it is priced off the *grappler's* Unarmed skill.
await api.grapple(captor, captor.system, actor, { dc: -100 });
const escapeDC = api.unarmedContestDC(api.grappledBy(actor).unarmed);
panel = await showPanel();
const heldText = panel?.textContent ?? "";
step(
  "the panel names who is holding you and the DC your Escape rolls against",
  heldText.includes(captor.name) && heldText.includes(String(escapeDC)),
  JSON.stringify({ captor: captor.name, escapeDC, shown: heldText.includes(captor.name) }),
);

// cp6. a Help is spent by the very next roll and is announced nowhere else on
//      the sheet, so a held one is surfaced — and stops being surfaced the
//      moment it is spent. The grapple is released first, so the only thing
//      that can be putting the captor's name on this panel is the Help.
await actor.toggleStatusEffect("grappled", { active: false });
await actor.unsetFlag("fallout-ttrpg", "grappledBy");
const help = await api.helpAlly(captor, captor.system, actor, {
  mode: "check",
  skill: "medicine",
});
panel = await showPanel();
const withHelp = panel?.textContent ?? "";
await api.consumeHelp(actor, false);
panel = await showPanel();
const afterHelp = panel?.textContent ?? "";
step(
  "a held Help is shown with its bonus, and disappears when it is spent",
  withHelp.includes(captor.name) &&
    withHelp.includes(String(help.bonus)) &&
    !afterHelp.includes(captor.name) &&
    api.pendingHelp(actor).length === 0,
  JSON.stringify({
    bonus: help.bonus,
    shownWhileHeld: withHelp.includes(captor.name),
    shownAfterSpending: afterHelp.includes(captor.name),
  }),
);

// cp7. Ready lists what is pending with controls to resolve it, and prints the
//      refund — the interesting half, since v2.0 gave back nothing at all
//      (pg 126). Pressing "never fired" banks it through the panel's own
//      action, which is the end-to-end wiring this whole fragment is for.
await actor.update({ "system.resources.ap.recycled": 0 });
const readied = await api.readyAction(actor, `SMOKE-panel-${stamp}`, 6);
panel = await showPanel();
const readyRow = panel?.querySelector(".ready-list li");
const readyText = panel?.textContent ?? "";
const refundShown = readyText.includes(String(api.readyRecycledAP(readied.ap)));
panel?.querySelector('[data-action="lapseReady"]')?.click();
await settle(600);
step(
  "a readied action lists with its refund, and the lapse control banks it",
  !!readyRow &&
    !!panel?.querySelector('[data-action="triggerReady"]') &&
    refundShown &&
    api.readiedActions(actor).length === 0 &&
    actor.system.resources.ap.recycled === api.readyRecycledAP(readied.ap),
  JSON.stringify({
    row: !!readyRow,
    committed: readied.ap,
    refundShown,
    recycled: actor.system.resources.ap.recycled,
    pending: api.readiedActions(actor).length,
  }),
);

await actor.update({ "system.resources.ap.recycled": 0 });
await actor.toggleStatusEffect("grappled", { active: false });
if (api.grappledBy(actor)) await actor.unsetFlag("fallout-ttrpg", "grappledBy");
await captor.delete();
