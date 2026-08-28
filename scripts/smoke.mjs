#!/usr/bin/env node
/**
 * Headless smoke test: joins the live Foundry server as the dedicated
 * smoke-test user, boots the world, exercises the system (data models,
 * character sheet, rolls, ammo/reload) and reports every console error.
 *
 * Safety contract: this script only creates/deletes documents whose names
 * start with SMOKE-. It never touches other actors, items, scenes, world
 * settings, or the admin/setup screens.
 *
 * Config: scripts/smoke.config.json (gitignored) — {"url", "user", "password"} —
 * or the env vars FOUNDRY_URL / SMOKE_USER / SMOKE_PASSWORD, which win.
 *
 * Usage: npm run smoke
 * Artifacts: smoke-output/*.png, exit code 0 = clean.
 *
 * Note: the whole in-page suite runs inside a single page.evaluate, so its
 * total runtime is bounded by protocolTimeout below, not by any per-step wait.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer";

const projectRoot = path.dirname(path.dirname(new URL(import.meta.url).pathname));

// ------------------------------------------------------------------ config
const configFile = path.join(projectRoot, "scripts", "smoke.config.json");
const fileConfig = fs.existsSync(configFile)
  ? JSON.parse(fs.readFileSync(configFile, "utf8"))
  : {};
// The server this points at is deployment-specific and deliberately not
// committed: set FOUNDRY_URL/SMOKE_USER/SMOKE_PASSWORD, or put url/user/
// password in the gitignored scripts/smoke.config.json.
const FOUNDRY_URL = process.env.FOUNDRY_URL ?? fileConfig.url;
const SMOKE_USER = process.env.SMOKE_USER ?? fileConfig.user;
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD ?? fileConfig.password;
if (!FOUNDRY_URL || !SMOKE_USER || !SMOKE_PASSWORD) {
  console.error(
    "Missing config: set FOUNDRY_URL, SMOKE_USER and SMOKE_PASSWORD, or create\n" +
      "scripts/smoke.config.json with {\"url\", \"user\", \"password\"}.",
  );
  process.exit(2);
}

const outDir = path.join(projectRoot, "smoke-output");
fs.mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------------- state
const consoleErrors = [];
const consoleWarnings = [];
const failures = [];
const passes = [];

function pass(step) {
  passes.push(step);
  console.log(`  ✓ ${step}`);
}
function fail(step, detail = "") {
  failures.push(`${step}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ✗ ${step}${detail ? ` — ${detail}` : ""}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -------------------------------------------------------------------- main
const browser = await puppeteer.launch({
  headless: "new",
  // The whole in-page suite runs inside one page.evaluate, and it has grown
  // past Puppeteer's 180s default for a single protocol call. Raising this is
  // not papering over a slow system: each step waits on real server round
  // trips, and there are eighty of them.
  // The whole in-page suite is a single page.evaluate, so total runtime is
  // bounded here rather than by any per-step wait. 180s was outgrown at 97
  // steps and 600s at 351; raised with headroom rather than chased again.
  protocolTimeout: 2_400_000,
  acceptInsecureCerts: true, // internal CA
  args: [
    "--no-sandbox",
    "--ignore-certificate-errors",
    "--enable-unsafe-swiftshader", // software WebGL for the canvas
    "--window-size=1680,1050",
  ],
  defaultViewport: { width: 1680, height: 1050 },
});

try {
  const page = await browser.newPage();

  page.on("console", (message) => {
    const text = `${message.type()}: ${message.text()}`;
    if (message.type() === "error") {
      // Where it came from matters more than the message: Foundry logs some
      // errors from socket handlers, far from whatever triggered them.
      const frames = (message.stackTrace() ?? [])
        .slice(0, 6)
        .map((f) => `      at ${f.url ?? "?"}:${f.lineNumber ?? "?"}`)
        .join("\n");
      consoleErrors.push(frames ? `${text}\n${frames}` : text);
    } else if (message.type() === "warning") consoleWarnings.push(text);
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${String(error)}`));

  // ---- join screen -------------------------------------------------------
  console.log(`Joining ${FOUNDRY_URL} as "${SMOKE_USER}" ...`);
  await page.goto(`${FOUNDRY_URL}/join`, { waitUntil: "networkidle2", timeout: 30_000 });

  const onJoin = await page.$('select[name="userid"]');
  if (!onJoin) {
    const where = page.url();
    throw new Error(
      `No join form at ${where} — is the world launched? (setup/license screens are out of scope for this script)`,
    );
  }

  const userValue = await page.evaluate((wanted) => {
    const select = document.querySelector('select[name="userid"]');
    const option = Array.from(select?.options ?? []).find(
      (candidate) => candidate.textContent.trim().toLowerCase() === wanted.toLowerCase(),
    );
    return option?.value ?? null;
  }, SMOKE_USER);
  if (!userValue) {
    throw new Error(
      `User "${SMOKE_USER}" not in the join list — create an Assistant GM user with that name`,
    );
  }
  await page.select('select[name="userid"]', userValue);
  await page.type('input[name="password"]', SMOKE_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }),
    page.click('button[name="join"], button[type="submit"]'),
  ]);
  pass("logged in");

  // ---- game boot ---------------------------------------------------------
  await page.waitForFunction(() => globalThis.game?.ready === true, { timeout: 90_000 });
  const info = await page.evaluate(() => ({
    system: game.system.id,
    version: game.system.version,
    world: game.world.id,
    foundry: game.version,
  }));
  if (info.system !== "fallout-ttrpg") {
    throw new Error(`world runs system "${info.system}", not fallout-ttrpg`);
  }
  pass(`game ready (foundry ${info.foundry}, system ${info.system} v${info.version})`);

  // ---- in-page smoke -----------------------------------------------------
  const smoke = await page.evaluate(async () => {
    const report = { steps: [], sheetOpen: false, notifyErrors: [], stamp: 0 };
    const step = (name, ok, detail = "") => report.steps.push({ name, ok, detail });

    // ---- suite helpers, one copy each --------------------------------------
    // These were being re-declared inside almost every block added after the
    // first: ten copies of `settle`, five of `until` with the timeout drifting
    // from 4s to 15s for the same kind of wait, and five of the chat-card
    // readers. They live here now, and a new block gets them by being written
    // inside this evaluate — which every block already is.

    /**
     * Let pending document writes land before sampling. A click handler is
     * async and its click is not awaited, so a value read straight after one
     * can still be the old one — the lesson this project already learned once
     * about probing effect expiry.
     */
    const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

    /**
     * Poll rather than sleep a fixed span: sheet actions do sequential server
     * round trips, so a fixed wait races the later updates.
     *
     * The default of 4s is one document write and its refresh, which is what
     * most waits here are. Anything slower — a canvas draw, a combat turn, a
     * world-time sweep — passes its own timeout **at the call site**, where the
     * reason for the wait is visible; that is what the per-block copies were
     * really encoding, one block at a time, where nobody could see them differ.
     */
    const until = async (predicate, timeout = 4000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return predicate();
    };

    /** The newest chat card's flavour line. */
    const lastFlavor = () => String(game.messages.contents.at(-1)?.flavor ?? "");

    // The attack card is not the last message: the reveal hook and the 1d4
    // condition follow-up both post after it. The card is the last message whose
    // roll is a d20 — the follow-up rolls a d4 and the reveal rolls nothing.
    const lastAttackFlavor = () => {
      for (let i = game.messages.contents.length - 1; i >= 0; i -= 1) {
        const message = game.messages.contents[i];
        if (String(message.rolls?.[0]?.formula ?? "").includes("d20")) {
          return String(message.flavor ?? "");
        }
      }
      return "";
    };

    /** The same card's formula, whitespace stripped so it can be matched on. */
    const lastAttackFormula = () => {
      for (let i = game.messages.contents.length - 1; i >= 0; i -= 1) {
        const message = game.messages.contents[i];
        const formula = String(message.rolls?.[0]?.formula ?? "");
        if (formula.includes("d20")) return formula.replace(/\s+/g, "");
      }
      return "";
    };
    // Foundry surfaces server-side rejections through ui.notifications.error
    // from its socket handler, so tag each one with the step in flight.
    const originalNotifyError = ui.notifications.error.bind(ui.notifications);
    ui.notifications.error = (message, options) => {
      report.notifyErrors.push({
        message: String(message),
        afterStep: report.steps.length,
        lastStep: report.steps.at(-1)?.name ?? "(none)",
      });
      return originalNotifyError(message, options);
    };
    const ActorClass = game.actors.documentClass;
    const stamp = Date.now();
    report.stamp = stamp;
    let actor;
    try {
      // Purge what a *previous* run left behind, so this run is independent and
      // the world-time sweep cannot trip over a stale actor mid-iteration.
      //
      // Scoped by age, not by prefix. Deleting every SMOKE- actor made two
      // concurrent runs mutually destructive — one run's startup reclaimed the
      // other's actor out from under it, which is exactly how three attempts
      // died before this suite ever reached a verdict. Every actor this suite
      // creates carries the run's `Date.now()` stamp in its name, so anything
      // older than an hour is certainly abandoned and anything newer may well
      // belong to a run in progress.
      const STALE_AFTER_MS = 60 * 60 * 1000;
      for (const stale of game.actors.filter((a) => a.name.startsWith("SMOKE-"))) {
        const stamped = /SMOKE-(?:[A-Za-z]+-)?(\d{13})/.exec(stale.name);
        const age = stamped ? stamp - Number(stamped[1]) : Number.POSITIVE_INFINITY;
        if (age > STALE_AFTER_MS) await stale.delete();
      }
      // 1. actor creation + derived data
      actor = await ActorClass.create({ name: `SMOKE-${stamp}`, type: "character" });
      const derived = actor.system.derived;
      step("create character", !!actor);
      step(
        "derived defaults (HP 10, AP 10, carry 50)",
        derived.hpMax === 10 && derived.apMax === 10 && derived.carryLoadMax === 50,
        JSON.stringify({ hp: derived.hpMax, ap: derived.apMax, carry: derived.carryLoadMax }),
      );

      // 2. update propagates through prepareDerivedData
      await actor.update({ "system.abilities.strength.value": 8 });
      step(
        "STR 8 -> +3 mod, carry 80",
        actor.system.derived.abilityMods.strength === 3 &&
          actor.system.derived.carryLoadMax === 80,
      );
      await actor.update({ "system.conditions.hunger": 3 });
      step("hunger 3 -> d20 penalty 3", actor.system.derived.d20Penalty === 3);

      // 2b. v2.1 pg 25: a negative Luck modifier subtracts a flat 1 from every
      //     skill bonus, not half the modifier (LCK 2 -> mod -3, floor(-3/2)
      //     would be -2)
      await actor.update({ "system.abilities.luck.value": 2 });
      step(
        "negative Luck (LCK 2, mod -3) -> flat -1 skill bonus",
        actor.system.derived.abilityMods.luck === -3 &&
          actor.system.derived.skillBonuses.survival === -1,
        JSON.stringify({
          luckMod: actor.system.derived.abilityMods.luck,
          survivalBonus: actor.system.derived.skillBonuses.survival,
        }),
      );
      await actor.update({ "system.abilities.luck.value": 5 });

      // 3. embedded items
      const [weapon] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Pistol",
          type: "weapon",
          system: {
            weaponType: "handgun",
            damage: "1d6",
            apCost: 4,
            critChance: 20,
            ammoType: "10mm",
            magazineSize: 12,
            loadedAmmo: 1,
          },
        },
        { name: "SMOKE-Ammo", type: "ammo", system: { ammoType: "10mm", quantity: 30 } },
        {
          name: "SMOKE-Armor",
          type: "armor",
          system: { armorType: "leather", ac: 11, dt: 1, equipped: true },
        },
      ]);
      step("create weapon/ammo/armor items", actor.items.size === 3);
      step(
        "equipped armor -> AC 11, DT 1",
        actor.system.derived.ac === 11 && actor.system.derived.dt === 1,
        JSON.stringify({ ac: actor.system.derived.ac, dt: actor.system.derived.dt }),
      );

      // 4. sheet renders
      await actor.sheet.render(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const sheetElement = actor.sheet.element;
      report.sheetOpen = !!sheetElement && !!sheetElement.querySelector(".special-strip");
      step("character sheet renders", report.sheetOpen);

      // 5. rolls via the sheet's own action handlers.
      const clickAction = async (selector) => {
        const before = game.messages.size;
        const target = sheetElement?.querySelector(selector);
        if (!target) return { ok: false, detail: `missing ${selector}` };
        target.click();
        const ok = await until(() => game.messages.size > before);
        return { ok, detail: `messages ${before}->${game.messages.size}` };
      };

      let result = await clickAction('[data-action="rollSkill"][data-skill="guns"]');
      step("skill roll reaches chat", result.ok, result.detail);

      result = await clickAction('[data-action="rollAttack"]');
      step("weapon attack reaches chat", result.ok, result.detail);
      const consumed = await until(
        () => actor.items.getName("SMOKE-Pistol").system.loadedAmmo === 0,
      );
      step("attack consumed the loaded round", consumed);

      // empty magazine: attack must refuse, not roll
      const beforeEmpty = game.messages.size;
      sheetElement?.querySelector('[data-action="rollAttack"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 800));
      step("empty magazine blocks attack", game.messages.size === beforeEmpty);

      // reload pulls from inventory (two sequential updates — poll for both)
      sheetElement?.querySelector('[data-action="reload"]')?.click();
      const reloaded = await until(
        () =>
          actor.items.getName("SMOKE-Pistol").system.loadedAmmo === 12 &&
          actor.items.getName("SMOKE-Ammo").system.quantity === 18,
      );
      step(
        "reload fills magazine from ammo item (12 loaded, 18 left)",
        reloaded,
        JSON.stringify({
          loaded: actor.items.getName("SMOKE-Pistol").system.loadedAmmo,
          left: actor.items.getName("SMOKE-Ammo").system.quantity,
        }),
      );

      result = await clickAction('[data-action="rollDamage"]');
      step("damage roll reaches chat", result.ok, result.detail);

      // targeted attack: limb dialog -> attack roll (+ condition/severe follow-up)
      const beforeTargeted = game.messages.size;
      sheetElement?.querySelector('[data-action="rollTargeted"]')?.click();
      const dialogUp = await until(() => !!document.querySelector('select[name="limb"]'));
      let targetedOk = false;
      if (dialogUp) {
        document.querySelector('select[name="limb"]').value = "head";
        document.querySelector('button[data-action="attack"]')?.click();
        targetedOk = await until(() => {
          if (game.messages.size <= beforeTargeted) return false;
          return game.messages.contents
            .slice(beforeTargeted - game.messages.size)
            .some((message) => (message.flavor ?? "").includes("Targeted"));
        });
      }
      step(
        "targeted attack (head) via dialog",
        targetedOk,
        dialogUp ? `messages ${beforeTargeted}->${game.messages.size}` : "dialog never opened",
      );

      // 6. NPC statblock sheet
      const npc = await ActorClass.create({ name: `SMOKE-NPC-${stamp}`, type: "npc" });
      await npc.sheet.render(true);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      step(
        "npc statblock sheet renders",
        !!npc.sheet.element?.querySelector(".npc-skills"),
      );

      // 6b. THE CONDITION TRACK, ON BOTH SHEETS, READ OFF THE RENDERED DOM.
      //
      // The NPC template carried a hardcoded `min="0" max="10"` long after the
      // character sheet had learned the per-condition ceiling and the disease
      // floor — even though `FalloutNpcSheet` overrides only `PARTS` and
      // `DEFAULT_OPTIONS` and so was already being handed the corrected
      // context. It ignored it.
      //
      // The reason that survived is the reason these steps exist: the original
      // character-sheet fix shipped with **no assertion at all**, so nothing in
      // the suite would have gone red for either copy. Both sheets are checked
      // here, and both are checked by reading the attribute the browser
      // actually rendered — asserting the context object would have passed all
      // along, because the context was never the broken half.
      //
      // Short Circuit is the condition that proves it. It doubles on becoming
      // wet with no printed cap (pg 135), so a creature can legitimately hold
      // more than ten levels; a flat ceiling stores such a value fine and then
      // refuses to let a GM type it back in.
      // Both subjects are **throwaway actors made for this step**, and the
      // long-lived `actor` fixture is deliberately not one of them. The first
      // version of this step borrowed it, mutated two conditions, rendered its
      // sheet and closed it again — and closing it broke the next eight steps,
      // which click controls on the character sheet that step 4 leaves open
      // (`sheetElement.querySelector('[data-action="useAid"]').click()` and
      // friends). Eight red steps, none of them about condition tracks. A step
      // that needs a sheet open and shut should bring its own.
      const trackNpc = await ActorClass.create({
        name: `SMOKE-Track-NPC-${stamp}`,
        type: "npc",
      });
      const trackPc = await ActorClass.create({
        name: `SMOKE-Track-PC-${stamp}`,
        type: "character",
      });
      const trackChecks = [];
      for (const [label, subject] of [["npc", trackNpc], ["character", trackPc]]) {
        await subject.update({
          "system.conditions.shortCircuit": 14,
          "system.conditions.hunger": 2,
        });
        await subject.sheet.render(true);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const root = subject.sheet.element;
        const shortCircuit = root?.querySelector('input[name="system.conditions.shortCircuit"]');
        const hunger = root?.querySelector('input[name="system.conditions.hunger"]');
        trackChecks.push({
          sheet: label,
          // No ceiling at all, and the stored 14 renders back into the input.
          uncapped: shortCircuit?.hasAttribute("max") === false,
          roundTrip: shortCircuit?.value === "14",
          // And a condition whose printed track does stop at ten still says so.
          capped: hunger?.getAttribute("max") === "10",
          found: !!shortCircuit && !!hunger,
        });
        await subject.sheet.close();
      }
      step(
        "both sheets give Short Circuit no ceiling and keep the printed ten on the conditions that have one (pg 135)",
        trackChecks.length === 2 &&
          trackChecks.every((c) => c.found && c.uncapped && c.roundTrip && c.capped),
        JSON.stringify(trackChecks),
      );
      await trackNpc.delete();
      await trackPc.delete();
      await npc.sheet.close();

      // 7. damage pipeline: 12 ballistic vs SP 10 / DT 1 -> 10 SP, 1 HP
      const api = globalThis.falloutTTRPG;
      const dmg = await api.applyDamage(actor, 12, "ballistic");
      step(
        "damage pipeline SP -> DT -> HP (12 dmg: 10 SP, 1 stopped, 1 HP)",
        dmg.spLost === 10 &&
          dmg.dtPrevented === 1 &&
          dmg.hpLost === 1 &&
          actor.system.resources.hp.value === 9,
        JSON.stringify(dmg),
      );

      // 8. aid use: stimpak heals Healing Rate (3 at level 1 / END 5), capped at max
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Stimpak",
          type: "aid",
          system: { aidType: "medicine", healsHealingRate: true, quantity: 2 },
        },
      ]);
      const aidReady = await until(() =>
        !!sheetElement?.querySelector('[data-action="useAid"]'),
      );
      let aidOk = false;
      if (aidReady) {
        sheetElement.querySelector('[data-action="useAid"]').click();
        aidOk = await until(
          () =>
            actor.system.resources.hp.value === 10 &&
            actor.items.getName("SMOKE-Stimpak").system.quantity === 1,
        );
      }
      step(
        "stimpak heals to max and decrements",
        aidOk,
        JSON.stringify({
          hp: actor.system.resources.hp.value,
          qty: actor.items.getName("SMOKE-Stimpak")?.system.quantity,
        }),
      );

      // 8b. chem limit: 2 + half END mod, clamped 1-4 (pg 89)
      await actor.update({ "system.abilities.endurance.value": 9 });
      step(
        "chem limit from Endurance (END 9 -> +4 mod -> limit 4)",
        actor.system.derived.chemLimit === 4,
        `limit ${actor.system.derived.chemLimit}`,
      );
      await actor.update({ "system.abilities.endurance.value": 5 });

      // 8c. using a chem counts against the limit and rolls the addiction check.
      // Leveled conditions subtract from every d20, so clear them first: with
      // hunger 3 still applied, even DC 0 fails on a natural 1 or 2.
      await actor.update({ "system.conditions.hunger": 0 });
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Buffout",
          type: "aid",
          system: {
            aidType: "chem",
            quantity: 5,
            addictive: true,
            addictionDC: 0,
            duration: "1 hour",
            withdrawal: "Disadvantage on Strength and Endurance.",
          },
        },
      ]);
      let chem = actor.items.getName("SMOKE-Buffout");
      const beforeChem = game.messages.size;
      await api.useAid(actor, actor.system, chem);
      const usedOk = await until(
        () =>
          actor.system.chems.usedToday === 1 &&
          actor.items.getName("SMOKE-Buffout").system.quantity === 4 &&
          game.messages.size > beforeChem,
      );
      step(
        "chem use counts against the limit and posts to chat",
        usedOk && actor.system.chems.addictions === "",
        JSON.stringify({
          used: actor.system.chems.usedToday,
          addictions: actor.system.chems.addictions,
        }),
      );

      // 8d. a failed check (DC 20 never passes on d20 + 0) records the addiction
      chem = actor.items.getName("SMOKE-Buffout");
      // DC 25 is past the maximum reachable total (20 + 0 mod), so this
      // check always fails — DC 20 would pass on a natural 20.
      await chem.update({ "system.addictionDC": 25 });
      await api.useAid(actor, actor.system, actor.items.getName("SMOKE-Buffout"));
      const addictedOk = await until(() =>
        actor.system.chems.addictions.includes("SMOKE-Buffout"),
      );
      step(
        "failed addiction check records the addiction",
        addictedOk && actor.system.derived.addictions.length === 1,
        JSON.stringify({ addictions: actor.system.chems.addictions }),
      );

      // 8e. over the chem limit: 5 levels of exhaustion each (END 5 -> limit 2)
      await actor.update({
        "system.chems.usedToday": 2,
        "system.conditions.exhaustion": 0,
      });
      await api.useAid(actor, actor.system, actor.items.getName("SMOKE-Buffout"));
      const overOk = await until(
        () =>
          actor.system.conditions.exhaustion === 5 &&
          actor.system.derived.chemsOverLimit === 1,
      );
      step(
        "chem past the limit inflicts 5 levels of exhaustion",
        overOk,
        JSON.stringify({
          exhaustion: actor.system.conditions.exhaustion,
          over: actor.system.derived.chemsOverLimit,
        }),
      );
      await actor.update({
        "system.conditions.exhaustion": 0,
        "system.chems.usedToday": 3,
      });

      // 8e2. the sheet renders the chem tracker and its New Day reset works
      const chemRendered = await until(
        () =>
          !!document.querySelector('.fallout-ttrpg.character .chems [data-action="newDay"]'),
      );
      const chemPanel = document.querySelector(".fallout-ttrpg.character .chems");
      if (chemRendered) chemPanel.querySelector('[data-action="newDay"]').click();
      const newDayOk = await until(() => actor.system.chems.usedToday === 0);
      step(
        "sheet shows the chem tracker and New Day resets it",
        chemRendered && newDayOk,
        JSON.stringify({
          rendered: chemRendered,
          count: chemPanel?.querySelector(".chem-count")?.textContent.trim(),
          used: actor.system.chems.usedToday,
        }),
      );

      // 8f. food: any food removes a hunger level, Filling removes another
      await actor.update({ "system.conditions.hunger": 3 });
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Cram",
          type: "aid",
          system: { aidType: "food", quantity: 1, properties: "Filling, Bland" },
        },
      ]);
      await api.useAid(actor, actor.system, actor.items.getName("SMOKE-Cram"));
      const hungerOk = await until(() => actor.system.conditions.hunger === 1);
      step(
        "Filling food removes two levels of hunger",
        hungerOk,
        `hunger ${actor.system.conditions.hunger}`,
      );

      // 8g. drink: one level, or three with Hydrating (pg 82)
      await actor.update({ "system.conditions.dehydration": 5 });
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Water",
          type: "aid",
          system: { aidType: "drink", quantity: 1, properties: "Hydrating" },
        },
      ]);
      await api.useAid(actor, actor.system, actor.items.getName("SMOKE-Water"));
      const thirstOk = await until(() => actor.system.conditions.dehydration === 2);
      step(
        "Hydrating drink removes three levels of dehydration",
        thirstOk,
        `dehydration ${actor.system.conditions.dehydration}`,
      );
      await actor.update({
        "system.conditions.hunger": 0,
        "system.conditions.dehydration": 0,
      });

      // 8h. the shipped aid compendium reached the world
      const pack = game.packs.get("fallout-ttrpg.equipment");
      const entry = pack?.index.find((doc) => doc.name === "Buffout");
      const buffout = entry ? await pack.getDocument(entry._id) : null;
      step(
        "equipment compendium ships the aid entries",
        !!buffout &&
          buffout.system.aidType === "chem" &&
          buffout.system.addictive === true &&
          buffout.system.duration === "1 hour" &&
          buffout.system.withdrawal.length > 0 &&
          pack.index.size > 400,
        JSON.stringify({
          packSize: pack?.index.size,
          buffout: buffout
            ? {
                type: buffout.system.aidType,
                dc: buffout.system.addictionDC,
                dur: buffout.system.duration,
              }
            : null,
        }),
      );

      // 8i. local artwork override: inert (and non-throwing) with no folder set
      const indexed = await api.indexLocalArt();
      step(
        "local artwork index is a safe no-op when unconfigured",
        indexed === 0 && game.settings.get("fallout-ttrpg", "artOverridePath") === "",
        `indexed ${indexed}`,
      );

      // 8i2. v2.1 "Unaffected by Mortal Detriments" (pg 124): leveled
      //      conditions subtract from every d20 EXCEPT Luck rolls.
      // Clear every other leveled condition first: New Day now runs the full
      // pg 119 rollover and charges exhaustion for a day without sleep, so the
      // penalty this step measures has to be isolated to the hunger it sets.
      await actor.update({
        "system.conditions.hunger": 4,
        "system.conditions.dehydration": 0,
        "system.conditions.exhaustion": 0,
        "system.conditions.fatigue": 0,
        "system.conditions.rads": 0,
      });
      // Foundry re-spaces formulas, so compare with whitespace stripped.
      const formulaOf = () => {
        const message = game.messages.contents.at(-1);
        return (message?.rolls?.[0]?.formula ?? "").replace(/\s+/g, "");
      };
      await api.rollAbility(actor, actor.system, "luck", "normal");
      const luckFormula = formulaOf();
      await api.rollAbility(actor, actor.system, "strength", "normal");
      const strengthFormula = formulaOf();
      step(
        "v2.1: Luck rolls ignore leveled-condition penalties",
        !luckFormula.includes("-4") && strengthFormula.includes("-4"),
        JSON.stringify({ luck: luckFormula, strength: strengthFormula }),
      );
      await actor.update({ "system.conditions.hunger": 0 });

      // 8j. a perk's Active Effect transfers to its owner and folds into the
      //     derived skill bonus (v14: system.changes, type "add", initial phase)
      const gunsBefore = actor.system.derived.skillBonuses.guns;
      const [perkItem] = await actor.createEmbeddedDocuments("Item", [
        { name: "SMOKE-Perk", type: "perk" },
      ]);
      await perkItem.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "SMOKE-Perk",
          type: "base",
          transfer: true,
          system: {
            changes: [
              {
                key: "system.bonuses.skills.guns",
                type: "add",
                value: 2,
                phase: "initial",
                priority: 20,
              },
            ],
          },
        },
      ]);
      const perkOk = await until(
        () => actor.system.derived.skillBonuses.guns === gunsBefore + 2,
      );
      step(
        "perk Active Effect transfers and raises the skill bonus",
        perkOk,
        JSON.stringify({ before: gunsBefore, after: actor.system.derived.skillBonuses.guns }),
      );

      // 8k. suppressing the effect reverts it; deleting the perk removes it
      const perkEffect = perkItem.effects.contents[0];
      await perkEffect.update({ disabled: true });
      const revertOk = await until(
        () => actor.system.derived.skillBonuses.guns === gunsBefore,
      );
      await perkItem.delete();
      const removedOk = await until(
        () => actor.system.derived.skillBonuses.guns === gunsBefore,
      );
      step("disabling and deleting a perk revert its bonus", revertOk && removedOk);

      // 8l. a chem with a numeric property creates a timed effect that applies
      //     itself — Painkilling is DT +3 (pg 89), on top of the armor's DT 1
      const dtBefore = actor.system.derived.dt;
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Med-X",
          type: "aid",
          system: {
            aidType: "chem",
            quantity: 1,
            properties: "Painkilling",
            duration: "1 hour",
            addictive: false,
          },
        },
      ]);
      await api.useAid(actor, actor.system, actor.items.getName("SMOKE-Med-X"));
      const chemEffectOk = await until(
        () =>
          actor.system.derived.dt === dtBefore + 3 &&
          Array.from(actor.effects).some((e) => e.name === "SMOKE-Med-X"),
      );
      step(
        "chem creates a timed effect that applies its own bonus",
        chemEffectOk,
        JSON.stringify({
          dtBefore,
          dt: actor.system.derived.dt,
          effects: Array.from(actor.effects).map((e) => `${e.name}:${e.duration.label ?? "-"}`),
        }),
      );

      // 8m. Foundry retires the effect itself once world time passes the
      //     duration — asynchronously, and by deactivating rather than
      //     deleting. The bonus must stop applying; the row may remain.
      const startTime = game.time.worldTime;
      await game.time.advance(7200); // two hours: the 1-hour chem is spent
      const wornOff = await until(() => actor.system.derived.dt === dtBefore, 20000);
      const spent = Array.from(actor.effects).find((e) => e.name === "SMOKE-Med-X");
      step(
        "world time wears the chem off (core expiry, not ours)",
        wornOff && (!spent || (spent.duration.expired === true && !spent.active)),
        JSON.stringify({
          dt: actor.system.derived.dt,
          expired: spent?.duration.expired ?? "(removed)",
          active: spent?.active ?? "(removed)",
        }),
      );
      // Tidying an already-expired effect must not upset core.
      await api.clearExpiredEffects(actor);
      await game.time.advance(startTime - game.time.worldTime); // restore

      // 8n. New Day clears anything still running
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Rocket",
          type: "aid",
          system: {
            aidType: "chem",
            quantity: 1,
            properties: "Hyperstimulant",
            duration: "1 hour",
          },
        },
      ]);
      await api.useAid(actor, actor.system, actor.items.getName("SMOKE-Rocket"));
      const apBoosted = actor.system.derived.apMax;
      const cleared = await api.clearConsumableEffects(actor);
      const clearOk = await until(() => actor.system.derived.apMax === apBoosted - 4);
      step(
        "Hyperstimulant grants +4 AP and New Day clears it",
        cleared === 1 && clearOk,
        JSON.stringify({ boosted: apBoosted, now: actor.system.derived.apMax, cleared }),
      );

      // 8o. v2.1 radiation (pg 124): a level deals 1d4 to BOTH pools, and that
      //     damage is unhealable until every level is gone.
      await actor.update({
        "system.resources.hp.value": 10,
        "system.resources.sp.value": 10,
        "system.conditions.rads": 0,
        "system.resources.hp.locked": 0,
        "system.resources.sp.locked": 0,
      });
      const radResult = await api.gainRadiationLevels(actor, actor.system, 1);
      const radDmg = radResult.damagePerLevel[0];
      const radOk =
        actor.system.conditions.rads === 1 &&
        actor.system.resources.hp.value === 10 - radDmg &&
        actor.system.resources.sp.value === 10 - radDmg &&
        actor.system.resources.hp.locked === radDmg &&
        actor.system.derived.hpHealableMax === actor.system.derived.hpMax - radDmg;
      step(
        "radiation damages HP and SP and locks that damage",
        radOk,
        JSON.stringify({
          dmg: radDmg,
          hp: actor.system.resources.hp.value,
          sp: actor.system.resources.sp.value,
          locked: actor.system.resources.hp.locked,
          healable: actor.system.derived.hpHealableMax,
        }),
      );

      // healing must refuse to touch the locked portion
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Stimpak2",
          type: "aid",
          system: { aidType: "medicine", healsHealingRate: true, healRateMultiplier: 2, quantity: 1 },
        },
      ]);
      await api.useAid(actor, actor.system, actor.items.getName("SMOKE-Stimpak2"));
      step(
        "healing cannot restore radiation-locked damage",
        actor.system.resources.hp.value === actor.system.derived.hpHealableMax,
        JSON.stringify({
          hp: actor.system.resources.hp.value,
          healable: actor.system.derived.hpHealableMax,
          max: actor.system.derived.hpMax,
        }),
      );

      // RadAway clears the last level and releases the lock
      await actor.createEmbeddedDocuments("Item", [
        { name: "SMOKE-RadAway", type: "aid", system: { aidType: "medicine", quantity: 1, removesRads: 2 } },
      ]);
      await api.useAid(actor, actor.system, actor.items.getName("SMOKE-RadAway"));
      step(
        "RadAway clears Rads and releases the locked damage",
        actor.system.conditions.rads === 0 &&
          actor.system.resources.hp.locked === 0 &&
          actor.system.derived.hpHealableMax === actor.system.derived.hpMax,
        JSON.stringify({
          rads: actor.system.conditions.rads,
          locked: actor.system.resources.hp.locked,
        }),
      );

      // 8p. Power Armor Defense Points soak before stamina (pg 57)
      await actor.update({ "system.resources.hp.value": 10, "system.resources.sp.value": 10 });
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-PA",
          type: "armor",
          system: {
            armorType: "metal", ac: 14, dt: 0, equipped: true,
            isPowerArmor: true, defensePoints: 15, defensePointsValue: 15, decayMax: 10,
          },
        },
      ]);
      const paDmg = await api.applyDamage(actor, 6, "");
      const suit = actor.items.getName("SMOKE-PA");
      step(
        "Power Armor Defense Points soak damage before stamina",
        paDmg.dpLost === 6 &&
          paDmg.spLost === 0 &&
          suit.system.defensePointsValue === 9 &&
          actor.system.resources.sp.value === 10,
        JSON.stringify({ dp: paDmg.dpLost, sp: paDmg.spLost, left: suit.system.defensePointsValue }),
      );

      // emptying the pool refills it and costs the suit a level of decay
      const paDmg2 = await api.applyDamage(actor, 9, "");
      const suit2 = actor.items.getName("SMOKE-PA");
      step(
        "emptying the DP pool refills it and decays the suit",
        paDmg2.powerArmorDepleted &&
          suit2.system.defensePointsValue === 15 &&
          suit2.system.decay === 1,
        JSON.stringify({ depleted: paDmg2.powerArmorDepleted, dp: suit2.system.defensePointsValue, decay: suit2.system.decay }),
      );
      await suit2.delete();

      // 8q. v2.1 Dazed is a flat -3 AP (was: maximum halved)
      const apBefore = actor.system.derived.apMax;
      await actor.toggleStatusEffect("dazed", { active: true });
      const dazedOk = await until(() => actor.system.derived.apMax === apBefore - 3);
      await actor.toggleStatusEffect("dazed", { active: false });
      const dazedCleared = await until(() => actor.system.derived.apMax === apBefore);
      step(
        "v2.1 Dazed reduces maximum AP by 3",
        dazedOk && dazedCleared,
        JSON.stringify({ before: apBefore, now: actor.system.derived.apMax }),
      );

      // 8r. advantage as an Active Effect (release 1): a perk granting
      //     advantage on Strength must change the dice, not just the total.
      await actor.update({ "system.conditions.hunger": 0 });
      const [advPerk] = await actor.createEmbeddedDocuments("Item", [
        { name: "SMOKE-AdvPerk", type: "perk" },
      ]);
      await advPerk.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "SMOKE-AdvPerk", type: "base", transfer: true,
          system: {
            changes: [
              { key: "system.bonuses.advantage.strength", type: "add", value: 1, phase: "initial", priority: 20 },
            ],
          },
        },
      ]);
      const advApplied = await until(() => actor.system.derived.advantage.strength === 1);
      await api.rollAbility(actor, actor.system, "strength", "normal");
      const advFormula = formulaOf();
      // a Strength-governed skill inherits it; an unrelated ability does not
      await api.rollSkill(actor, actor.system, "meleeWeapons", "normal");
      const skillFormula = formulaOf();
      await api.rollAbility(actor, actor.system, "charisma", "normal");
      const otherFormula = formulaOf();
      step(
        "a perk grants advantage on its ability and the skills it governs",
        advApplied &&
          advFormula.includes("2d20kh") &&
          skillFormula.includes("2d20kh") &&
          otherFormula.includes("1d20"),
        JSON.stringify({ str: advFormula, melee: skillFormula, cha: otherFormula }),
      );

      // 8s. opposing sources cancel to a normal roll
      const [disPerk] = await actor.createEmbeddedDocuments("Item", [
        { name: "SMOKE-DisPerk", type: "perk" },
      ]);
      await disPerk.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "SMOKE-DisPerk", type: "base", transfer: true,
          system: {
            changes: [
              { key: "system.bonuses.disadvantage.strength", type: "add", value: 1, phase: "initial", priority: 20 },
            ],
          },
        },
      ]);
      await until(() => actor.system.derived.disadvantage.strength === 1);
      await api.rollAbility(actor, actor.system, "strength", "normal");
      const cancelled = formulaOf();
      step(
        "advantage and disadvantage cancel to a normal roll",
        cancelled.includes("1d20") && !cancelled.includes("2d20"),
        cancelled,
      );
      await disPerk.delete();
      await advPerk.delete();

      // 8t. Poisoned imposes disadvantage on every d20 (pg 134)
      await actor.toggleStatusEffect("poisoned", { active: true });
      const poisoned = await until(() => actor.system.derived.disadvantage.all === 1);
      await api.rollAbility(actor, actor.system, "charisma", "normal");
      const poisonFormula = formulaOf();
      await actor.toggleStatusEffect("poisoned", { active: false });
      await until(() => actor.system.derived.disadvantage.all === 0);
      step(
        "Poisoned imposes disadvantage on every d20",
        poisoned && poisonFormula.includes("2d20kl"),
        poisonFormula,
      );

      // 8u. the v2.1 frightened check reports the right tier
      const beforeFright = game.messages.size;
      await api.rollFrightenedCheck(actor, actor.system, 8, "charisma");
      step(
        "v2.1 frightened check rolls and reports a tier",
        game.messages.size > beforeFright,
        String(game.messages.contents.at(-1)?.flavor ?? "").slice(0, 90),
      );

      // 8v. AP economy across a turn change (pg 125): half the unused AP
      //     carries over, Fatigue sheds a level, Bleeding bites on the way in.
      const CombatClass = CONFIG.Combat.documentClass;
      let combat;
      try {
        const [ally] = await ActorClass.create([
          { name: `SMOKE-Ally-${stamp}`, type: "character" },
        ]);
        // Foundry's CombatTracker throws while rendering a sceneless combat
        // ("Cannot use 'in' operator to search for 'turn' in undefined"), so
        // attach it to a scene the way a GM would.
        const sceneId = game.scenes?.current?.id ?? game.scenes?.contents?.[0]?.id ?? null;
        combat = await CombatClass.create({ scene: sceneId });
        // Make it the tracker's viewed combat. Core's CombatTracker._onRender
        // does `renderData.find(...)` and then `"turn" in data` without
        // guarding the miss, so updating a combat it is NOT viewing throws
        // "Cannot use 'in' operator to search for 'turn' in undefined". That
        // is a core bug, but a GM running a combat would have it in view.
        await combat.activate();
        await combat.createEmbeddedDocuments("Combatant", [
          { actorId: actor.id, initiative: 20 },
          { actorId: ally.id, initiative: 10 },
        ]);
        await actor.update({
          "system.resources.ap.value": 7,
          "system.resources.ap.recycled": 0,
          "system.conditions.fatigue": 2,
          "system.conditions.bleeding": 0,
        });
        await combat.startCombat();
        await until(() => combat.round === 1, 8000);

        // ending our turn banks floor(7 / 2) and drops a Fatigue level
        await combat.nextTurn();
        const banked = await until(
          () => actor.system.resources.ap.recycled === 3 && actor.system.conditions.fatigue === 1,
          8000,
        );
        step(
          "ending a turn recycles half the unused AP and sheds Fatigue",
          banked,
          JSON.stringify({
            recycled: actor.system.resources.ap.recycled,
            fatigue: actor.system.conditions.fatigue,
          }),
        );

        // coming back around, AP refills to max plus the banked amount
        const expected = actor.system.derived.apMax + 3;
        await combat.nextTurn(); // wraps to round 2, back to us
        const refilled = await until(
          () =>
            actor.system.resources.ap.value === expected &&
            actor.system.resources.ap.recycled === 0,
          8000,
        );
        step(
          "a new turn refills AP to maximum plus the carry-over",
          refilled,
          JSON.stringify({ ap: actor.system.resources.ap.value, expected }),
        );
        await ally.delete();
      } finally {
        if (combat) await combat.delete();
      }

      // 8w. under a weapon's Strength requirement is disadvantage (pg 128)
      await actor.update({ "system.abilities.strength.value": 3 });
      const [heavy] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Heavy",
          type: "weapon",
          system: { weaponType: "blunt", damage: "1d8", strengthReq: 9, apCost: 4, critChance: 20 },
        },
      ]);
      await actor.sheet.render(true);
      await new Promise((resolve) => setTimeout(resolve, 900));
      const heavyRow = actor.sheet.element?.querySelector(
        `[data-item-id="${heavy.id}"] [data-action="rollAttack"]`,
      );
      heavyRow?.click();
      const heavyRolled = await until(() => formulaOf().includes("2d20"), 6000);
      const heavyFormula = formulaOf();
      step(
        "attacking under a weapon's Strength requirement is at disadvantage",
        !!heavyRow && heavyRolled && heavyFormula.includes("2d20kl"),
        JSON.stringify({ found: !!heavyRow, formula: heavyFormula }),
      );
      await heavy.delete();
      await actor.update({ "system.abilities.strength.value": 8 });

      // 8x. carrying too much flags encumbrance (pg 133-134)
      const [anvil] = await actor.createEmbeddedDocuments("Item", [
        { name: "SMOKE-Anvil", type: "gear", system: { quantity: 1, load: 200 } },
      ]);
      const enc = await until(() => actor.system.derived.encumbrance === "heavy");
      step(
        "carrying over double the limit is Heavily Encumbered",
        enc,
        JSON.stringify({
          load: actor.system.derived.carryLoad,
          max: actor.system.derived.carryLoadMax,
          state: actor.system.derived.encumbrance,
        }),
      );
      await anvil.delete();

      // 8y. damage taken while dying is a failed death save (pg 132)
      await actor.update({
        "system.resources.hp.value": 0,
        "system.resources.sp.value": 0,
        "system.resources.deathSaves.failures": 0,
      });
      const dyingHit = await api.applyDamage(actor, 3, "");
      step(
        "damage while dying costs a death save",
        dyingHit.deathSaveFailures === 1 &&
          actor.system.resources.deathSaves.failures === 1,
        JSON.stringify({ reported: dyingHit.deathSaveFailures }),
      );
      await actor.update({ "system.resources.deathSaves.failures": 0 });

      // ---------------------------------------------------------- release 3
      // Diseases, weather, hazardous environments, irradiated zones (pg 120-124).
      await actor.update({
        "system.resources.hp.value": 10,
        "system.conditions.dehydration": 0,
        "system.conditions.hunger": 0,
        "system.conditions.hypothermia": 0,
        "system.conditions.bleeding": 0,
        "system.abilities.endurance.value": 6,
        // Ghoulification earlier in the run may have changed the race, and
        // only Humans have a Radiation DC to roll against.
        "system.details.race": "human",
      });

      // 8z. Dysentery grants four levels of Dehydration that cannot be drunk
      //     away, and runs for (15 - END) days (pg 120).
      await api.contractDisease(actor, actor.system, "dysentery");
      const dys = actor.system.diseases.find((d) => d.key === "dysentery");
      step(
        "Dysentery locks four levels of Dehydration for (15 - END) days",
        actor.system.conditions.dehydration === 4 &&
          actor.system.derived.conditionFloors.dehydration === 4 &&
          dys?.remainingHours === (15 - 6) * 24,
        JSON.stringify({
          dehydration: actor.system.conditions.dehydration,
          floor: actor.system.derived.conditionFloors.dehydration,
          hours: dys?.remainingHours,
        }),
      );

      // 8aa. drinking cannot shift a locked level
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Water",
          type: "aid",
          system: { aidType: "drink", quantity: 1, properties: "Hydrating" },
        },
      ]);
      await api.useAid(actor, actor.system, actor.items.getName("SMOKE-Water"));
      step(
        "a locked condition level survives a drink",
        actor.system.conditions.dehydration === 4,
        JSON.stringify({ dehydration: actor.system.conditions.dehydration }),
      );

      // 8aa-b. And the lock is visible on the sheet rather than only enforced
      //        behind it: the input's floor is the disease's, so a GM cannot
      //        type the level below what Dysentery pins. Read off the rendered
      //        DOM for the same reason step 6b is — the context carried this
      //        correctly even while the NPC template was ignoring it.
      await actor.sheet.render(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const lockedInput = actor.sheet.element?.querySelector(
        'input[name="system.conditions.dehydration"]',
      );
      const lockedLabel = lockedInput?.closest("label");
      step(
        "a disease-locked condition renders its floor as the input's minimum, and says so",
        lockedInput?.getAttribute("min") === "4" &&
          lockedLabel?.classList.contains("locked") === true &&
          // The hint explains why it will not go lower.
          (lockedLabel?.getAttribute("title") ?? "").length > 0,
        JSON.stringify({
          min: lockedInput?.getAttribute("min"),
          locked: lockedLabel?.classList.contains("locked"),
        }),
      );
      // Left open, not closed. This step needs the real actor — the floor comes
      // from the Dysentery it is carrying — so it cannot use a throwaway the way
      // step 6b does, which makes it the caller's job to hand the sheet back in
      // the state it borrowed it in. It was open; it stays open.

      // 8ab. two antibiotics, a day apart: the second is refused until the day
      //      has passed (pg 120)
      await actor.createEmbeddedDocuments("Item", [
        { name: "SMOKE-Antibiotics", type: "aid", system: { aidType: "medicine", quantity: 5 } },
      ]);
      const pills = actor.items.getName("SMOKE-Antibiotics");
      await api.treatDisease(actor, actor.system, "dysentery", pills);
      const afterFirst = actor.system.diseases.find((d) => d.key === "dysentery")?.doses;
      const tooSoon = await api.treatDisease(actor, actor.system, "dysentery", pills);
      await api.advanceDiseases(actor, actor.system, 24);
      const cured = await api.treatDisease(actor, actor.system, "dysentery", pills);
      step(
        "a two-dose cure refuses the second dose until a day has passed",
        afterFirst === 1 && tooSoon === false && cured === true &&
          !actor.system.diseases.some((d) => d.key === "dysentery"),
        JSON.stringify({ afterFirst, tooSoon, cured }),
      );

      // 8ac. the lock lifts with the disease, and the levels can be drunk away
      await actor.createEmbeddedDocuments("Item", [
        { name: "SMOKE-Water2", type: "aid", system: { aidType: "drink", quantity: 1 } },
      ]);
      await api.useAid(actor, actor.system, actor.items.getName("SMOKE-Water2"));
      step(
        "curing the disease unlocks the levels it pinned",
        actor.system.derived.conditionFloors.dehydration === undefined &&
          actor.system.conditions.dehydration === 3,
        JSON.stringify({ dehydration: actor.system.conditions.dehydration }),
      );
      await actor.update({ "system.conditions.dehydration": 0 });

      // 8ad. Fever: maximum AP down 3 (floor 6) and disadvantage on every d20.
      //      Counted rather than read off a roll, because Poisoned and Shock
      //      also push "all" disadvantage and would mask the difference.
      const apBeforeFever = actor.system.derived.apMax;
      const disBeforeFever = actor.system.derived.disadvantage.all;
      await api.contractDisease(actor, actor.system, "fever");
      const feverAp = actor.system.derived.apMax;
      step(
        "Fever costs 3 maximum AP (floor 6) and imposes disadvantage on all d20 rolls",
        feverAp === Math.max(Math.min(apBeforeFever, 6), apBeforeFever - 3) &&
          actor.system.derived.disadvantage.all === disBeforeFever + 1,
        JSON.stringify({
          apBeforeFever,
          feverAp,
          disadvantage: actor.system.derived.disadvantage.all,
        }),
      );

      // 8ae. the sheet grows a diseases panel and the six exposure flags
      await actor.sheet.render(true);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const sheetNow = actor.sheet.element;
      const feverRow = sheetNow?.querySelector('.disease-row[data-disease="fever"]');
      const flagCount = sheetNow?.querySelectorAll(".environment .environment-flag").length ?? 0;
      step(
        "the sheet lists active diseases and the six environment flags",
        !!feverRow && flagCount === 6 && !!sheetNow?.querySelector(".weather-readout"),
        JSON.stringify({ feverRow: !!feverRow, flagCount }),
      );

      // 8af. Med-X suppresses a Fever without curing it (pg 120)
      await actor.createEmbeddedDocuments("Item", [
        { name: "SMOKE-Med-X-2", type: "aid", system: { aidType: "chem", quantity: 1 } },
      ]);
      await api.treatDisease(
        actor,
        actor.system,
        "fever",
        actor.items.getName("SMOKE-Med-X-2"),
      );
      const suppressed = actor.system.derived.diseases.find((d) => d.key === "fever");
      step(
        "Med-X suppresses a Fever without curing it",
        !!suppressed && suppressed.suppressed && actor.system.derived.apMax === apBeforeFever,
        JSON.stringify({
          suppressedHours: suppressed?.suppressedHours,
          apMax: actor.system.derived.apMax,
        }),
      );
      await api.removeDisease(actor, actor.system, "fever");

      // 8af. Weeping sores reacts to hit-point damage with a level of Bleeding
      await api.contractDisease(actor, actor.system, "weepingSores");
      await actor.update({ "system.resources.sp.value": 0, "system.resources.hp.value": 20 });
      const hit = await api.applyDamage(actor, 4, "");
      await api.diseaseDamageReactions(actor, actor.system, hit.hpLost);
      step(
        "Weeping sores turns hit-point damage into a level of Bleeding",
        actor.system.conditions.bleeding === 1,
        JSON.stringify({ hpLost: hit.hpLost, bleeding: actor.system.conditions.bleeding }),
      );
      await api.removeDisease(actor, actor.system, "weepingSores");
      await actor.update({ "system.conditions.bleeding": 0 });

      // 8ag. three diseases end on a night's sleep (pg 120)
      await api.contractDisease(actor, actor.system, "buzzBrain");
      const buzzOk = actor.system.derived.disadvantage.intelligence === 1;
      await api.sleepDiseases(actor, actor.system);
      step(
        "Buzz brain imposes disadvantage until you sleep it off",
        buzzOk && !actor.system.diseases.some((d) => d.key === "buzzBrain"),
        JSON.stringify({ buzzOk, left: actor.system.diseases.length }),
      );

      // 8ah. weather is scene state; a Radstorm carries an irradiated zone
      const SceneClass = CONFIG.Scene.documentClass;
      const smokeScene = await SceneClass.create({ name: `SMOKE-Scene-${stamp}` });
      await api.setWeather({ type: "radstorm", severity: 2, radSeverity: 0, linked: 0 }, smokeScene);
      const readBack = api.getWeather(smokeScene);
      const description = api.describeWeather(readBack);
      step(
        "weather round-trips through the scene and a Radstorm irradiates it",
        readBack.type === "radstorm" &&
          readBack.severity === 2 &&
          description.includes("level 5"),
        JSON.stringify({ readBack, description }),
      );

      // 8ai. Extreme Cold hands out Hypothermia on the printed clock, and
      //      Hypothermia cuts maximum AP by half its level (pg 122, 134)
      await actor.update({
        "system.abilities.endurance.value": 5,
        "system.conditions.hypothermia": 0,
        "system.environment.exposedWet": false,
        "system.environment.insulated": false,
        "system.environment.nearWarmth": false,
      });
      const apBeforeCold = actor.system.derived.apMax;
      // Severity 1 below END 6: one level per 15 minutes, so 45 minutes = 3.
      await api.tickEnvironment(actor, actor.system, 45, {
        type: "extremeCold",
        severity: 1,
        radSeverity: 0,
        linked: 0,
      });
      step(
        "Extreme Cold gives 3 levels of Hypothermia in 45 minutes, costing 1 AP",
        actor.system.conditions.hypothermia === 3 &&
          actor.system.derived.apMax === apBeforeCold - 1,
        JSON.stringify({
          hypothermia: actor.system.conditions.hypothermia,
          apBeforeCold,
          apMax: actor.system.derived.apMax,
        }),
      );

      // 8aj. standing by a fire stops it entirely (pg 122)
      await actor.update({ "system.environment.nearWarmth": true });
      await api.tickEnvironment(actor, actor.system, 45, {
        type: "extremeCold",
        severity: 1,
        radSeverity: 0,
        linked: 0,
      });
      step(
        "a source of warmth prevents Hypothermia outright",
        actor.system.conditions.hypothermia === 3,
        JSON.stringify({ hypothermia: actor.system.conditions.hypothermia }),
      );

      // 8ak. an hour by the fire sheds a level
      await api.recoverExposure(actor, actor.system, "hypothermia", 120);
      step(
        "shelter sheds a level of Hypothermia per hour",
        actor.system.conditions.hypothermia === 1,
        JSON.stringify({ hypothermia: actor.system.conditions.hypothermia }),
      );
      await actor.update({
        "system.conditions.hypothermia": 0,
        "system.environment.nearWarmth": false,
      });

      // 8al. an irradiated zone re-checks on the severity's clock (pg 124):
      //      level 4 is one check every three minutes.
      await actor.update({ "system.conditions.rads": 0, "system.radiation.dcBonus": 0 });
      const zoneRolls = await api.runZoneChecks(actor, actor.system, 4, 9);
      step(
        "a level 4 irradiated zone demands 3 checks over 9 minutes",
        zoneRolls === 3,
        JSON.stringify({ zoneRolls, rads: actor.system.conditions.rads }),
      );
      await actor.update({ "system.conditions.rads": 0, "system.radiation.dcBonus": 0 });

      // 8am. a gas mask drops Toxic Air's DC by 10 and blocks its diseases,
      //      but is worthless against irradiated water (pg 123)
      await actor.update({ "system.environment.gasMask": true });
      const diseasesBeforeAir = actor.system.diseases.length;
      const beforeAir = game.messages.size;
      for (let i = 0; i < 6; i++) await api.rollHazardCheck(actor, actor.system, "toxicAir");
      const airFlavor = game.messages.contents
        .slice(beforeAir)
        .map((m) => String(m.flavor ?? ""))
        .find((f) => f.includes("DC"));
      step(
        "a gas mask drops Toxic Air to DC 8 and blocks its diseases",
        String(airFlavor).includes("DC 8") &&
          actor.system.diseases.length === diseasesBeforeAir,
        JSON.stringify({ airFlavor, diseases: actor.system.diseases.length }),
      );
      await actor.update({
        "system.environment.gasMask": false,
        "system.conditions.exhaustion": 0,
      });
      // Clean the scene up before the actor sweep; it is the only non-actor
      // document this run creates.
      await smokeScene.delete();

      // ---------------------------------------------------------- release 4
      // 8an. blocking needs a melee weapon in hand (v2.1 dropped the unarmed
      //      option that v2.0 allowed) — pg 127
      await actor.update({ "system.abilities.endurance.value": 8 });
      const blockedWithoutWeapon = await api.startBlocking(actor, actor.system);
      step(
        "blocking is refused with no melee weapon in hand",
        blockedWithoutWeapon === null && !api.isBlocking(actor),
        JSON.stringify({ blockedWithoutWeapon, blocking: api.isBlocking(actor) }),
      );

      // 8ao. with one wielded: +2 + END mod DT, against melee only
      const [blade] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Blade",
          type: "weapon",
          system: { weaponType: "bladed", damage: "1d6", apCost: 3, critChance: 20, equipped: true },
        },
      ]);
      const dtUnblocked = actor.system.derived.dt;
      const blockDt = await api.startBlocking(actor, actor.system);
      const endMod = actor.system.derived.abilityMods.endurance;
      step(
        "blocking grants 2 + END mod DT against melee, and none against ranged",
        blockDt === 2 + endMod &&
          actor.system.derived.dtMelee === dtUnblocked + 2 + endMod &&
          actor.system.derived.dt === dtUnblocked,
        JSON.stringify({
          blockDt,
          endMod,
          dt: actor.system.derived.dt,
          dtMelee: actor.system.derived.dtMelee,
        }),
      );

      // 8ap. the melee threshold is the one the damage pipeline uses. The hit is
      //      big enough that neither threshold can absorb all of it, so both
      //      sides of the comparison stay above zero.
      const BLOW = 40;
      const hpFull = 100;
      await actor.update({
        "system.resources.sp.value": 0,
        "system.resources.hp.value": hpFull,
      });
      await api.applyDamage(actor, BLOW, "", { melee: true });
      const meleeLoss = hpFull - actor.system.resources.hp.value;
      await actor.update({ "system.resources.hp.value": hpFull });
      await api.applyDamage(actor, BLOW, "", { melee: false });
      const rangedLoss = hpFull - actor.system.resources.hp.value;
      step(
        "a block soaks melee damage but not ranged",
        meleeLoss === rangedLoss - (2 + endMod) && rangedLoss > meleeLoss,
        JSON.stringify({ meleeLoss, rangedLoss, dtUnblocked, endMod, hpFull }),
      );

      // 8aq. "until you attack again" (pg 127) — the attack roll is the trigger
      await api.rollAttack(actor, actor.system, blade, blade.system, "normal");
      step(
        "attacking ends the block",
        !api.isBlocking(actor) && actor.system.derived.dtMelee === actor.system.derived.dt,
        JSON.stringify({
          blocking: api.isBlocking(actor),
          dtMelee: actor.system.derived.dtMelee,
        }),
      );

      // 8ar. sneak attack (pg 128): an automatic critical whose damage bypasses
      //      stamina points entirely
      const beforeSneak = game.messages.size;
      await api.rollAttack(actor, actor.system, blade, blade.system, "normal", { sneak: true });
      const sneakFlavor = String(game.messages.contents.at(-1)?.flavor ?? "");
      step(
        "a sneak attack announces itself as a critical hit",
        sneakFlavor.includes("SNEAK ATTACK") && game.messages.size > beforeSneak,
        JSON.stringify({ sneakFlavor }),
      );

      // 8as. and its damage flag carries the stamina bypass through to apply
      await api.rollDamage(actor, actor.system, blade, blade.system, true);
      const sneakFlags = game.messages.contents.at(-1)?.getFlag("fallout-ttrpg", "damage");
      await actor.update({
        "system.resources.hp.value": 100,
        "system.resources.sp.value": 20,
      });
      await api.applyDamage(actor, 30, "", { ignoreSP: true, melee: true });
      step(
        "sneak attack damage bypasses stamina and is flagged for the Apply button",
        sneakFlags?.sneak === true &&
          sneakFlags?.melee === true &&
          actor.system.resources.sp.value === 20 &&
          actor.system.resources.hp.value < 100,
        JSON.stringify({
          sneakFlags,
          sp: actor.system.resources.sp.value,
          hp: actor.system.resources.hp.value,
        }),
      );
      await blade.delete();

      // 8at. Two Handed one-handed (pg 61 melee / pg 70 ranged): disadvantage
      //      unless 2 extra AP are paid, waived when Strength beats the
      //      requirement by 3.
      await actor.update({ "system.abilities.strength.value": 5 });
      const [rifle] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Rifle",
          type: "weapon",
          system: {
            weaponType: "rifle",
            damage: "1d8",
            apCost: 4,
            critChance: 20,
            strengthReq: 4,
            special: "Two Handed, Quick Reload",
            magazineSize: 0,
            oneHanded: true,
          },
        },
      ]);
      const beforeHand = game.messages.size;
      await api.rollAttack(actor, actor.system, rifle, rifle.system, "normal");
      const handFlavor = String(game.messages.contents.at(-1)?.flavor ?? "");
      const handFormula = String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");
      step(
        "a Two Handed weapon used one-handed rolls at disadvantage and warns about prone",
        game.messages.size > beforeHand &&
          handFormula.includes("2d20kl") &&
          handFlavor.includes("fall prone"),
        JSON.stringify({ handFormula, handFlavor }),
      );

      // 8au. Strength 3 above the requirement waives the whole penalty
      await actor.update({ "system.abilities.strength.value": 7 });
      await api.rollAttack(actor, actor.system, rifle, rifle.system, "normal");
      const exemptFlavor = String(game.messages.contents.at(-1)?.flavor ?? "");
      const exemptFormula = String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");
      step(
        "Strength 3 over the requirement waives the one-handed penalty",
        exemptFormula.includes("1d20") && !exemptFormula.includes("2d20kl"),
        JSON.stringify({ exemptFormula, exemptFlavor }),
      );
      await rifle.delete();

      // 8av. Quick Reload is 4 AP, Slow Reload 10, Manual Reload 1 round per AP
      //      with a 3 AP floor (pg 70) — and Unstable decays every 5th reload.
      const reloadApFor = (special) => api.reloadCost(api.parseKeywords(special));
      const interval = (special) => api.reloadDecayInterval(api.parseKeywords(special));
      const keywordProbe = {
        plain: reloadApFor("Kickback").ap,
        quick: reloadApFor("Quick Reload").ap,
        slow: reloadApFor("Slow Reload").ap,
        manual: reloadApFor("Manual Reload").minimumAp,
        // The 3 AP floor overshoots a one-round shotgun, and the book neither
        // forbids the overspend nor refunds it.
        singleShotgun: api.manualReloadRounds(3, 1),
        unstableInterval: interval("Automatic: 2, Unstable"),
        plainInterval: interval("Quick Reload"),
      };
      step(
        "reload costs and decay intervals follow the printed properties",
        keywordProbe.quick === 4 &&
          keywordProbe.slow === 10 &&
          keywordProbe.plain === 6 &&
          keywordProbe.manual === 3 &&
          keywordProbe.singleShotgun.rounds === 1 &&
          keywordProbe.singleShotgun.wastedAp === 2 &&
          keywordProbe.unstableInterval === 5 &&
          keywordProbe.plainInterval === 10,
        JSON.stringify(keywordProbe),
      );

      // 8aw. Automatic: N is N *free* extra attacks (pg 69), each consuming a
      //      round — so a burst empties 1 + N from the magazine.
      const [smg] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-SMG",
          type: "weapon",
          system: {
            weaponType: "submachineGun",
            damage: "1d6",
            apCost: 4,
            critChance: 20,
            ammoType: "10mm",
            magazineSize: 12,
            loadedAmmo: 12,
            special: "Automatic: 2, Two Handed, Unstable",
          },
        },
      ]);
      const beforeBurst = game.messages.size;
      await api.rollAutomaticBurst(actor, actor.system, smg, smg.system, "normal");
      const burstMessages = game.messages.contents.slice(beforeBurst);
      const burstFlavors = burstMessages.map((m) => String(m.flavor ?? "")).join(" | ");
      step(
        "Automatic: 2 fires three shots and spends three rounds",
        smg.system.loadedAmmo === 9 &&
          burstFlavors.includes("extra shot 1") &&
          burstFlavors.includes("extra shot 2"),
        JSON.stringify({ loaded: smg.system.loadedAmmo, cards: burstMessages.length }),
      );
      await smg.delete();

      // ------------------------------------------------ survival trackers
      // 8ax. ten irradiated levels become a level of Rads (pg 83)
      await actor.update({
        "system.details.race": "human",
        "system.survival.irradiated": 9,
        "system.conditions.rads": 0,
        "system.radiation.dcBonus": 0,
      });
      const [ration] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Ration",
          type: "aid",
          system: { aidType: "food", properties: "Irradiated", quantity: 5 },
        },
      ]);
      await api.useAid(actor, actor.system, ration);
      step(
        "the tenth irradiated level becomes a level of Rads and the counter rolls over",
        actor.system.survival.irradiated === 0 && actor.system.conditions.rads === 1,
        JSON.stringify({
          irradiated: actor.system.survival.irradiated,
          rads: actor.system.conditions.rads,
        }),
      );
      await actor.update({ "system.conditions.rads": 0, "system.radiation.dcBonus": 0 });

      // 8ay. a snack alone removes no hunger; the pair does (pg 83)
      await actor.update({ "system.conditions.hunger": 5, "system.survival.snacks": 0 });
      const [snack] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Snack",
          type: "aid",
          system: { aidType: "food", properties: "Snack", quantity: 5 },
        },
      ]);
      await api.useAid(actor, actor.system, snack);
      const afterOne = actor.system.conditions.hunger;
      await api.useAid(actor, actor.system, snack);
      step(
        "one snack removes no hunger, two remove it",
        afterOne === 5 && actor.system.conditions.hunger === 3,
        JSON.stringify({ afterOne, afterTwo: actor.system.conditions.hunger }),
      );
      await snack.delete();
      await ration.delete();

      // 8az. the drink ladder: High-Proof starts at drunk, and an Endurance
      //      score of 4 or lower starts a rung further along (pg 82-83)
      await actor.update({
        "system.abilities.endurance.value": 8,
        "system.survival.drinkStage": 0,
        "system.survival.drinkProgress": 0,
      });
      const [whiskey] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Whiskey",
          type: "aid",
          system: { aidType: "drink", properties: "High-Proof", quantity: 9 },
        },
      ]);
      await api.useAid(actor, actor.system, whiskey);
      const drunkStage = actor.system.survival.drinkStage;
      const apDrunk = actor.system.derived.apMax;
      // Two more take a drunk character to hammered, which is -5 on every d20.
      await api.useAid(actor, actor.system, whiskey);
      await api.useAid(actor, actor.system, whiskey);
      step(
        "High-Proof starts at drunk, and two more drinks reach hammered",
        drunkStage === 2 && actor.system.survival.drinkStage === 3,
        JSON.stringify({
          drunkStage,
          hammered: actor.system.survival.drinkStage,
          progress: actor.system.survival.drinkProgress,
        }),
      );

      // 8ba. Drunk costs 2 max AP and adds level stamina; Hammered doubles the
      //      stamina and subtracts 5 from every d20 but Luck (pg 133-134).
      // Measured as a delta: the actor is carrying leveled conditions from the
      // disease and weather steps above, so the absolute penalty is not 5.
      const hammeredPenalty = actor.system.derived.d20Penalty;
      const hammeredSpMax = actor.system.derived.spMax;
      await actor.update({ "system.survival.drinkStage": 0 });
      const soberPenalty = actor.system.derived.d20Penalty;
      const soberSpMax = actor.system.derived.spMax;
      await actor.update({ "system.survival.drinkStage": 3 });
      const beforeLadder = game.messages.size;
      await api.rollAbility(actor, actor.system, "intelligence", "normal");
      const ladderIntFormula = String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");
      await api.rollAbility(actor, actor.system, "luck", "normal");
      const ladderLuckFormula = String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");
      step(
        "hammered costs 5 on every d20 but Luck, 2 max AP, and doubles the stamina bonus",
        game.messages.size > beforeLadder &&
          hammeredPenalty - soberPenalty === 5 &&
          hammeredSpMax - soberSpMax === 2 * actor.system.details.level &&
          // Buzzed's disadvantage on Intelligence rides along underneath.
          ladderIntFormula.includes("2d20kl") &&
          !ladderLuckFormula.includes("-"),
        JSON.stringify({
          hammeredPenalty,
          soberPenalty,
          hammeredSpMax,
          soberSpMax,
          ladderIntFormula,
          ladderLuckFormula,
          apDrunk,
          apMax: actor.system.derived.apMax,
        }),
      );

      // 8bb. a rest burns the ladder off and restores stamina (pg 119)
      // Clear the radiation lock the earlier steps left behind, so this step
      // measures resting rather than re-measuring the pg 124 healing block.
      await actor.update({
        "system.resources.sp.value": 0,
        "system.resources.sp.locked": 0,
        "system.resources.hp.locked": 0,
        "system.conditions.rads": 0,
        "system.conditions.exhaustion": 3,
        "system.survival.drinkHours": 1,
      });
      const restReport = await api.rest(actor, actor.system, {
        hours: 6,
        comfortable: true,
        sleep: true,
      });
      step(
        "a comfortable 6-hour sleep fills stamina, heals, sheds exhaustion and sobers up",
        restReport.longRest === true &&
          restReport.exhaustionRemoved === 1 &&
          actor.system.conditions.exhaustion === 2 &&
          actor.system.survival.drinkStage === 0 &&
          // Stamina fills to the maximum the character wakes up with — the
          // Hammered bonus is gone by the time the rest ends.
          actor.system.resources.sp.value === actor.system.derived.spMax,
        JSON.stringify({
          restReport,
          sp: actor.system.resources.sp.value,
          spMax: actor.system.derived.spMax,
          spHealableMax: actor.system.derived.spHealableMax,
          exhaustion: actor.system.conditions.exhaustion,
        }),
      );
      await whiskey.delete();

      // 8bc. a day with nothing eaten or drunk costs 1 hunger, 3 dehydration
      //      and — having already slept above — no exhaustion (pg 119, 133-134)
      await actor.update({
        "system.conditions.hunger": 0,
        "system.conditions.dehydration": 0,
        "system.conditions.exhaustion": 0,
        "system.survival.foodsToday": 0,
        "system.survival.drinksToday": 0,
        "system.survival.hydratedToday": false,
        "system.survival.sleptToday": true,
      });
      const dayReport = await api.passDay(actor, actor.system);
      step(
        "a day without food or water costs 1 hunger and 3 dehydration, sleep spares exhaustion",
        dayReport.hunger === 1 &&
          dayReport.dehydration === 3 &&
          dayReport.exhaustion === 0 &&
          actor.system.survival.sleptToday === false,
        JSON.stringify({ dayReport, conditions: actor.system.conditions }),
      );

      // 8bd. alcohol addiction is two levels of exhaustion that no rest clears,
      //      and that lift while drunk (pg 82)
      await actor.update({
        "system.conditions.exhaustion": 0,
        "system.survival.alcoholAddiction": true,
        "system.survival.drinkStage": 0,
      });
      const addictedPenalty = actor.system.derived.d20Penalty;
      await actor.update({ "system.survival.drinkStage": 2 });
      const drunkPenalty = actor.system.derived.d20Penalty;
      await actor.update({
        "system.survival.alcoholAddiction": false,
        "system.survival.drinkStage": 0,
      });
      step(
        "alcohol addiction carries two levels of exhaustion that being drunk lifts",
        addictedPenalty - drunkPenalty === 2,
        JSON.stringify({ addictedPenalty, drunkPenalty }),
      );

      // ---------------------------------------------------------- repair
      // 8be. repairing decay: DC is 10 + the listed bonus, and matching it with
      //      your Crafting bonus succeeds without a roll (pg 93)
      const [busted] = await actor.createEmbeddedDocuments("Item", [
        { name: "SMOKE-Busted", type: "gear", system: { decay: 3, repairBonus: 0 } },
      ]);
      await actor.update({ "system.skills.crafting.points": 10 });
      const autoRepair = await api.repairItem(actor, actor.system, busted, { repairBonus: 0 });
      step(
        "a Crafting bonus that meets the repair bonus repairs without rolling",
        autoRepair.automatic === true &&
          autoRepair.succeeded === true &&
          busted.system.decay === 2,
        JSON.stringify({ autoRepair, decay: busted.system.decay }),
      );

      // 8bf. a broken item comes back at five levels of decay, not at zero
      await busted.update({ "system.decay": 10 });
      const brokenRepair = await api.repairItem(actor, actor.system, busted, { repairBonus: 0 });
      step(
        "repairing a broken item returns it at five levels of decay, never zero",
        brokenRepair.wasBroken === true &&
          (brokenRepair.succeeded ? busted.system.decay === 5 : busted.system.decay === 10),
        JSON.stringify({ brokenRepair, decay: busted.system.decay }),
      );
      await busted.delete();
      await actor.update({ "system.skills.crafting.points": 0 });

      // 8bg. the sheet renders the release-4 panels
      await actor.sheet.render(true);
      await new Promise((resolve) => setTimeout(resolve, 900));
      const root = actor.sheet.element;
      step(
        "the sheet shows the survival panel, the block control and a rest button",
        !!root?.querySelector(".survival .survival-row") &&
          !!root?.querySelector('[data-action="toggleBlock"]') &&
          !!root?.querySelector('[data-action="rest"]'),
        JSON.stringify({
          survival: !!root?.querySelector(".survival .survival-row"),
          block: !!root?.querySelector('[data-action="toggleBlock"]'),
          rest: !!root?.querySelector('[data-action="rest"]'),
        }),
      );

      // ---------------------------------------------------------- release 5
      // 8bh. scoped advantage: a grant on one named check reaches that check
      //      and nothing else (the shape most perk text actually uses)
      await actor.update({
        "system.bonuses.advantage.checks.addiction": 1,
        "system.bonuses.advantage.skills.sneak": 1,
      });
      const beforeScope = game.messages.size;
      await api.rollAddictionCheck(actor, actor.system, "SMOKE-Check", 6);
      const addictionFormula = String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");
      await api.rollSkill(actor, actor.system, "sneak", "normal");
      const sneakFormula = String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");
      await api.rollSkill(actor, actor.system, "barter", "normal");
      const barterFormula = String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");
      step(
        "advantage scoped to one check or one skill reaches only that roll",
        game.messages.size > beforeScope &&
          addictionFormula.includes("2d20kh") &&
          sneakFormula.includes("2d20kh") &&
          !barterFormula.includes("2d20kh"),
        JSON.stringify({ addictionFormula, sneakFormula, barterFormula }),
      );
      await actor.update({
        "system.bonuses.advantage.checks.addiction": 0,
        "system.bonuses.advantage.skills.sneak": 0,
      });

      // 8bi. death saves and radiation checks are scopes now too
      await actor.update({ "system.bonuses.advantage.checks.deathSave": 1 });
      await actor.update({ "system.resources.hp.value": 0 });
      await api.rollDeathSave(actor, actor.system);
      const deathFormula = String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");
      step(
        "a grant on death saves reaches the death save",
        deathFormula.includes("2d20kh"),
        JSON.stringify({ deathFormula }),
      );
      await actor.update({
        "system.bonuses.advantage.checks.deathSave": 0,
        "system.resources.hp.value": 20,
        "system.resources.deathSaves.successes": 0,
        "system.resources.deathSaves.failures": 0,
      });

      // 8bj. situations: the sheet decides the ones it can see, the table
      //      declares the rest, and Sync settles the effects against them
      await actor.update({
        "system.conditions.rads": 0,
        "system.situations.inSettlement": false,
      });
      const radsOff = actor.system.derived.situations.irradiated;
      await actor.update({ "system.conditions.rads": 2 });
      const radsOn = actor.system.derived.situations.irradiated;
      await api.setSituation(actor, "inSettlement", true);
      step(
        "sheet-derived situations follow the numbers, declared ones follow the table",
        radsOff === false &&
          radsOn === true &&
          actor.system.derived.situations.inSettlement === true,
        JSON.stringify({ radsOff, radsOn, situations: actor.system.derived.situations }),
      );

      // 8bk. a situational effect stays inert until its situation is synced on
      const [situPerk] = await actor.createEmbeddedDocuments("Item", [
        { name: "SMOKE-SituPerk", type: "perk" },
      ]);
      await situPerk.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "SMOKE-Situational",
          type: "base",
          transfer: true,
          disabled: true,
          system: {
            changes: [
              {
                key: "system.bonuses.advantage.charisma",
                type: "add",
                value: 1,
                phase: "initial",
                priority: 20,
              },
            ],
          },
          flags: { "fallout-ttrpg": { condition: "inSettlement" } },
        },
      ]);
      const beforeSync = actor.system.derived.advantage.charisma;
      const listed = api.situationalEffects(actor, actor.system);
      await api.syncSituations(actor, actor.system);
      const afterSync = actor.system.derived.advantage.charisma;
      step(
        "a situational effect is inert until Sync matches it to its situation",
        beforeSync === 0 && afterSync === 1 && listed.length === 1 &&
          listed[0].condition === "inSettlement",
        JSON.stringify({ beforeSync, afterSync, listed: listed.length }),
      );

      // 8bl. and Sync turns it back off when the situation ends
      await api.setSituation(actor, "inSettlement", false);
      await api.syncSituations(actor, actor.system);
      step(
        "ending the situation switches the effect back off",
        actor.system.derived.advantage.charisma === 0,
        JSON.stringify({ charisma: actor.system.derived.advantage.charisma }),
      );
      await situPerk.delete();
      await actor.update({ "system.conditions.rads": 0, "system.radiation.dcBonus": 0 });

      // 8bm. temporary hit points are spent before anything else and stay spent
      await actor.update({
        "system.resources.tempHp": 5,
        "system.resources.hp.value": 20,
        "system.resources.sp.value": 0,
        "system.resources.hp.locked": 0,
        "system.resources.sp.locked": 0,
      });
      const tempResult = await api.applyDamage(actor, 8, "");
      step(
        "temporary hit points soak first and are not healed back",
        tempResult.tempHpLost === 5 &&
          actor.system.resources.tempHp === 0 &&
          tempResult.adjusted === 8,
        JSON.stringify({ tempResult, tempHp: actor.system.resources.tempHp }),
      );

      // 8bn. the new bonus paths reach the numbers they name
      await actor.update({
        "system.bonuses.initiative": 3,
        "system.bonuses.partyNerve": 2,
        "system.bonuses.karmaCaps": 1,
      });
      step(
        "initiative, party nerve and karma cap bonuses are derived",
        actor.system.derived.initiativeBonus === 3 &&
          actor.system.derived.partyNerveBonus === 2 &&
          actor.system.derived.karmaCapsMax === actor.system.currency.karmaCaps + 1,
        JSON.stringify({
          initiative: actor.system.derived.initiativeBonus,
          nerve: actor.system.derived.partyNerveBonus,
          caps: actor.system.derived.karmaCapsMax,
        }),
      );
      await actor.update({
        "system.bonuses.initiative": 0,
        "system.bonuses.partyNerve": 0,
        "system.bonuses.karmaCaps": 0,
      });

      // 8bo. Automatic (Switch) only bursts in automatic mode (pg 69)
      const [switcher] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Switcher",
          type: "weapon",
          system: {
            weaponType: "rifle",
            damage: "1d8",
            apCost: 4,
            critChance: 20,
            magazineSize: 10,
            loadedAmmo: 10,
            special: "Automatic: 3 (Switch), Two Handed, Quick Reload",
          },
        },
      ]);
      await actor.sheet.render(true);
      await new Promise((resolve) => setTimeout(resolve, 900));
      const switchRow = () =>
        actor.sheet.element?.querySelector(`[data-item-id="${switcher.id}"] [data-action="rollBurst"]`);
      const burstHiddenInSingleShot = !switchRow();
      await switcher.update({ "system.autoMode": true });
      await actor.sheet.render(true);
      await new Promise((resolve) => setTimeout(resolve, 900));
      step(
        "an Automatic (Switch) weapon only offers its burst in automatic mode",
        burstHiddenInSingleShot && !!switchRow(),
        JSON.stringify({ burstHiddenInSingleShot, inAuto: !!switchRow() }),
      );
      await switcher.delete();

      // 8bp. ProseMirror replaced the description textareas (v14 custom element)
      const editorRoot = actor.sheet.element;
      step(
        "the biography is a ProseMirror editor, not a textarea",
        !!editorRoot?.querySelector('prose-mirror[name="system.details.biography"]') &&
          !editorRoot?.querySelector("textarea"),
        JSON.stringify({
          prosemirror: !!editorRoot?.querySelector("prose-mirror"),
          textareas: editorRoot?.querySelectorAll("textarea").length ?? -1,
        }),
      );

      // 8bp2. Existing is not the same as legible. A *toggled* editor displays
      //       its enriched BODY while closed and only loads the value attribute
      //       when opened, so an empty body reads as a blank panel — the shape
      //       this system shipped until the body was filled in. Assert the text
      //       is on screen without touching the edit button, and that each
      //       source line is its own paragraph rather than one run-on line.
      await actor.update({
        "system.details.biography": "First line of the story.\nSecond line of the story.",
      });
      await actor.sheet.render(true);
      await new Promise((resolve) => setTimeout(resolve, 900));
      const bioEditor = actor.sheet.element?.querySelector(
        'prose-mirror[name="system.details.biography"]',
      );
      const bioText = bioEditor?.innerText ?? "";
      const bioParagraphs = bioEditor?.querySelectorAll(".editor-content p").length ?? 0;
      step(
        "a closed biography editor shows its text, one paragraph per line",
        bioText.includes("First line of the story.") &&
          bioText.includes("Second line of the story.") &&
          bioParagraphs === 2,
        JSON.stringify({ text: bioText.slice(0, 120), paragraphs: bioParagraphs }),
      );
      await actor.update({ "system.details.biography": "" });

      // 8bp3. The 186 shipped perks store plain text with \n between paragraphs.
      //       Read-only: this renders a compendium sheet and closes it again.
      const perkPack = game.packs.get("fallout-ttrpg.perks");
      const perkEntry = perkPack?.index.contents?.[0];
      const packPerk = perkEntry ? await perkPack.getDocument(perkEntry._id) : null;
      let perkVisible = false;
      let perkDetail = "no perk in the compendium";
      if (packPerk) {
        await packPerk.sheet.render(true);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const flatten = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
        const editor = packPerk.sheet.element?.querySelector(
          'prose-mirror[name="system.description"]',
        );
        const body = editor?.querySelector(".editor-content");
        const shown = flatten(editor?.innerText);
        const wanted = flatten(String(packPerk.system.description ?? "").split("\n")[0]);
        // innerText reports text that is scrolled out of sight, so check the
        // box is tall enough for its content as well: core pins a closed
        // editor to a 6rem scroll box unless the system's CSS lets it grow.
        const clipped = (body?.scrollHeight ?? 0) > (body?.clientHeight ?? 0) + 2;
        perkVisible = wanted.length > 0 && shown.includes(wanted) && !clipped;
        perkDetail = JSON.stringify({
          perk: packPerk.name,
          wanted: wanted.slice(0, 70),
          shown: shown.slice(0, 70),
          clipped,
        });
        await packPerk.sheet.close();
      }
      step(
        "a compendium perk's description is readable on the closed sheet",
        perkVisible,
        perkDetail,
      );

      // 8bpz. the sheet-panel framework renders at all: the first-aid panel is
      //       a registered partial included by path, so a failure here means
      //       partial registration is broken rather than one panel being wrong.
      {
        await actor.sheet.render(true);
        await new Promise((r) => setTimeout(r, 400));
        const root = actor.sheet.element;
        const panelHtml = root?.querySelector(".panel.first-aid");
        const buttons = root?.querySelectorAll('.panel.first-aid [data-action="endBleeding"], .panel.first-aid [data-action="stabilizeCreature"]');
        step(
          "registered sheet panels render their partials with working actions",
          Boolean(panelHtml) && (buttons?.length ?? 0) === 2 &&
            !(root?.innerHTML ?? "").includes("templates/actor/parts/"),
          JSON.stringify({ found: Boolean(panelHtml), buttons: buttons?.length ?? 0 }),
        );
      }

      // 8bq. the situations panel renders
      step(
        "the sheet shows the situations panel and its flags",
        !!editorRoot?.querySelector(".situations .situation-flags") &&
          (editorRoot?.querySelectorAll(".situations .situation").length ?? 0) >= 7,
        JSON.stringify({
          panel: !!editorRoot?.querySelector(".situations .situation-flags"),
          flags: editorRoot?.querySelectorAll(".situations .situation").length,
        }),
      );

      // 8br. the Blueprint Encyclopedia is joined onto the shipped equipment,
      //      so repair no longer has to ask for a DC (pg 93-94)
      const equipmentPack = game.packs.get("fallout-ttrpg.equipment");
      const pick = async (itemName) => {
        const found = equipmentPack?.index.find((doc) => doc.name === itemName);
        return found ? await equipmentPack.getDocument(found._id) : null;
      };
      const weave = await pick("Ballistic Weave");
      const metal = await pick("Metal");
      const knife = await pick("Combat Knife");
      step(
        "compendium items carry their Blueprint Encyclopedia repair bonus",
        weave?.system.repairBonus === 10 &&
          // The book calls this row "Scrap Metal" on pg 94 and "Metal" on
          // pg 56; the build maps the one onto the other.
          metal?.system.repairBonus === 1 &&
          knife?.system.repairBonus === 3,
        JSON.stringify({
          weave: weave?.system.repairBonus,
          metal: metal?.system.repairBonus,
          knife: knife?.system.repairBonus,
        }),
      );

// ======================================================= D1: pg 91 unique items
{
  // The pg 91 "Unique Items" section — four Pip-Boys, the Vault Suit, the
  // Stealth Boy, the two-way radio and the two electronic lockpicks — ships as
  // item documents in the equipment compendium (packs-src/gear.json, plus the
  // Vault Suit in packs-src/armor.json).
  //
  // `ActorClass` and `stamp` are in scope (the 8cg compendium block is a good
  // neighbour). Read-only apart from one SMOKE- actor it creates and deletes.
  //
  // None of these items' mechanics are automated: this block asserts the
  // documents exist, carry their printed cost/load, and can be created onto an
  // actor — not that anything fires.
  const uniquePack = game.packs.get("fallout-ttrpg.equipment");
  const uniqueIndex = await uniquePack.getIndex();
  const fetchUnique = async (itemName) => {
    const found = uniqueIndex.find((doc) => doc.name === itemName);
    return found ? await uniquePack.getDocument(found._id) : null;
  };

  // Name, type, cost and load exactly as the pg 91 table prints them. The four
  // Pip-Boy names must stay verbatim: build-packs.mjs fans the single
  // "Pip-Boy 2000, 2000 Mark VI, 3000, 3000 Mark IV." blueprint row out to
  // these four names (BLUEPRINT_ALIASES), and the join matches by name.
  const pg91 = [
    { name: "Vault Suit", type: "armor", cost: 1300, load: 5 },
    { name: "Pip-Boy 2000", type: "gear", cost: 300, load: 4 },
    { name: "Pip-Boy 2000 Mark VI", type: "gear", cost: 600, load: 3 },
    { name: "Pip-Boy 3000", type: "gear", cost: 550, load: 4 },
    { name: "Pip-Boy 3000 Mark IV", type: "gear", cost: 850, load: 3 },
    { name: "Stealth Boy", type: "gear", cost: 500, load: 3 },
    { name: "Two-way Radio", type: "gear", cost: 120, load: 2 },
    { name: "Electronic Lockpick", type: "gear", cost: 500, load: 2 },
    { name: "Electronic Lockpick Mk II", type: "gear", cost: 750, load: 3 },
  ];

  const uniqueDocs = new Map();
  const uniqueMisses = [];
  for (const want of pg91) {
    const doc = await fetchUnique(want.name);
    uniqueDocs.set(want.name, doc);
    if (
      !doc ||
      doc.type !== want.type ||
      doc.system.cost !== want.cost ||
      doc.system.load !== want.load ||
      !String(doc.system.description ?? "").startsWith("(pg 91)")
    ) {
      uniqueMisses.push({
        name: want.name,
        found: !!doc,
        type: doc?.type,
        cost: doc?.system?.cost,
        load: doc?.system?.load,
      });
    }
  }
  step(
    "equipment compendium ships all nine pg 91 unique items at their printed cost and load",
    uniqueMisses.length === 0,
    JSON.stringify(uniqueMisses),
  );

  // The blueprint join lands on the fanned-out Pip-Boy names, not just on the
  // row the book prints. If a name ever drifts, this is the step that catches
  // it. The row's DC and time cells are printed "–" (null here): the
  // Encyclopedia's answer to crafting a Pip-Boy is "try one of those vaults".
  const pipBoyPlans = [
    "Pip-Boy 2000",
    "Pip-Boy 2000 Mark VI",
    "Pip-Boy 3000",
    "Pip-Boy 3000 Mark IV",
  ].map((n) => uniqueDocs.get(n)?.getFlag("fallout-ttrpg", "blueprint"));
  step(
    "the one Pip-Boy blueprint row reached all four Pip-Boy documents",
    pipBoyPlans.every(
      (plan) => !!plan && plan.craftDC === null && /Cannot be crafted/.test(plan.craftMaterials),
    ) && uniqueDocs.get("Stealth Boy")?.getFlag("fallout-ttrpg", "blueprint")?.craftDC === 20,
    JSON.stringify(pipBoyPlans.map((plan) => plan?.craftMaterials ?? null)),
  );

  // Stealth Boy's invisibility is text until the Nightkin Stealth Field
  // (pg 12) establishes the pattern — assert the caveat is on the document so
  // nobody assumes the system applies it.
  const stealthBoy = uniqueDocs.get("Stealth Boy");
  step(
    "Stealth Boy carries its book text and says the invisibility is not automated",
    !!stealthBoy &&
      stealthBoy.system.description.includes("3 AP") &&
      stealthBoy.system.description.includes("invisible for 1 minute") &&
      stealthBoy.system.description.includes("Not automated"),
    stealthBoy ? stealthBoy.system.description.slice(0, 120) : "missing",
  );

  // A compendium document is only useful if it survives the trip onto a sheet.
  const uniqueOwner = await ActorClass.create({
    name: `SMOKE-Unique-${stamp}`,
    type: "character",
  });
  const [carried] = await uniqueOwner.createEmbeddedDocuments("Item", [
    { ...uniqueDocs.get("Pip-Boy 3000 Mark IV").toObject(), name: "SMOKE-Pip-Boy-3000-Mk-IV" },
  ]);
  step(
    "a pg 91 unique item creates from the compendium onto an actor with its load intact",
    !!carried && carried.type === "gear" && carried.system.load === 3 && carried.system.cost === 850,
    JSON.stringify({ type: carried?.type, load: carried?.system?.load, cost: carried?.system?.cost }),
  );
  await uniqueOwner.delete();
}

      // ---------------------------------------------------------- release 6
      // 8c. Shock blocks stamina regain (pg 135), and the radiation lock caps
      //     it independently (pg 124) — the two rules are orthogonal.
      await actor.update({
        "system.resources.sp.value": 0,
        "system.resources.sp.locked": 0,
        "system.conditions.rads": 0,
      });
      const spCeiling = actor.system.derived.spHealableMax;
      const shockOff = api.restoreStamina(actor, actor.system, 5);
      await actor.toggleStatusEffect("shock", { active: true });
      const shockOn = api.restoreStamina(actor, actor.system, 5);
      await actor.toggleStatusEffect("shock", { active: false });
      step(
        "Shock blocks stamina regain; without it the same call restores",
        shockOff.restored === 5 && shockOn.restored === 0 && shockOn.blocked === true,
        JSON.stringify({ off: shockOff.restored, on: shockOn.restored, ceiling: spCeiling }),
      );

      // 8ca. the radiation lock caps a restore short without claiming Shock
      await actor.update({ "system.resources.sp.value": 0, "system.resources.sp.locked": 3 });
      const lockedGain = api.restoreStamina(actor, actor.system, 999);
      step(
        "radiation-locked stamina caps healing at the healable maximum",
        lockedGain.blocked === false &&
          lockedGain.capped === true &&
          lockedGain.value === actor.system.derived.spHealableMax,
        JSON.stringify({
          value: lockedGain.value,
          healable: actor.system.derived.spHealableMax,
          spMax: actor.system.derived.spMax,
        }),
      );
      await actor.update({ "system.resources.sp.locked": 0 });

      // 8cb. Tasty food restores stamina equal to level — 74 shipped
      //      consumables carry one of these properties and none did anything
      //      before this release.
      const [tastyFood] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Tasty Meal",
          type: "aid",
          system: { aidType: "food", properties: "Tasty", quantity: 5, apCost: 4 },
        },
      ]);
      await actor.update({
        "system.resources.sp.value": 0,
        "system.details.level": 4,
        "system.details.race": "human",
      });
      await api.useAid(actor, actor.system, tastyFood);
      step(
        "Tasty food restores stamina equal to level",
        actor.system.resources.sp.value === 4,
        JSON.stringify({ sp: actor.system.resources.sp.value, level: 4 }),
      );

      // 8cc. a Ghoul halves it (pg 8); a Gen-2 Synth gets nothing (pg 8-9)
      await actor.update({ "system.resources.sp.value": 0, "system.details.race": "ghoul" });
      await api.useAid(actor, actor.system, tastyFood);
      const ghoulSp = actor.system.resources.sp.value;
      await actor.update({ "system.resources.sp.value": 0, "system.details.race": "gen2synth" });
      await api.useAid(actor, actor.system, tastyFood);
      const synthSp = actor.system.resources.sp.value;
      await actor.update({ "system.details.race": "human" });
      step(
        "Ghouls halve consumable stamina and synths gain none",
        ghoulSp === 2 && synthSp === 0,
        JSON.stringify({ ghoulSp, synthSp }),
      );

      // 8cd. v2.1 pg 83: Tainted food or drink contracts a random disease —
      //      13 shipped items carry the property and none rolled it before
      //      this release.
      await actor.update({ "system.diseases": [] });
      const [taintedFood] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Tainted Meat",
          type: "aid",
          system: { aidType: "food", properties: "Tainted", quantity: 5, apCost: 4 },
        },
      ]);
      await api.useAid(actor, actor.system, taintedFood);
      step(
        "Tainted food contracts a random disease",
        actor.system.diseases.length === 1,
        JSON.stringify({ diseases: actor.system.diseases.map((d) => d.key) }),
      );

      // 8ce. Ice Cream and Apple Pie (pg 52) blocks Tainted's disease outright,
      //      and reads a food's Bland property as Tasty for its one-off
      //      stamina restoration.
      await actor.update({ "system.diseases": [] });
      const [iceCream] = await actor.createEmbeddedDocuments("Item", [
        { name: "Ice Cream and Apple Pie", type: "perk" },
      ]);
      await api.useAid(actor, actor.system, taintedFood);
      step(
        "Ice Cream and Apple Pie blocks Tainted's disease",
        actor.system.diseases.length === 0,
        JSON.stringify({ diseases: actor.system.diseases.map((d) => d.key) }),
      );

      const [blandFood] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Bland Meal",
          type: "aid",
          system: { aidType: "food", properties: "Bland", quantity: 5, apCost: 4 },
        },
      ]);
      await actor.update({ "system.resources.sp.value": 0, "system.details.level": 4 });
      await api.useAid(actor, actor.system, blandFood);
      step(
        "Ice Cream and Apple Pie reads Bland as Tasty (level, not half-level, stamina)",
        actor.system.resources.sp.value === 4,
        JSON.stringify({ sp: actor.system.resources.sp.value }),
      );
      await iceCream.delete();
      await actor.update({ "system.diseases": [] });

      // 8d. Power Armor: entering seeds the suit's allotted time from its model
      const paPack = game.packs.get("fallout-ttrpg.equipment");
      const paIndex = await paPack.getIndex();
      const paEntry = paIndex.find((e) => e.name === "Power Armor: T-51");
      const paSource = await paPack.getDocument(paEntry._id);
      const [paSuit] = await actor.createEmbeddedDocuments("Item", [
        { ...paSource.toObject(), name: "SMOKE-T-51" },
      ]);
      await api.togglePowerArmor(actor, paSuit);
      step(
        "entering Power Armor equips it with its model's allotted time",
        paSuit.system.equipped === true && paSuit.system.fusionCoreMinutes === 360,
        JSON.stringify({
          equipped: paSuit.system.equipped,
          minutes: paSuit.system.fusionCoreMinutes,
          capacity: paSuit.system.fusionCoreCapacity,
        }),
      );

      // 8da. Hydraulic Machine sets Strength to 12 (pg 57), above the printed
      //      score cap of 10 — and everything Strength-derived follows.
      await actor.update({ "system.abilities.strength.value": 6 });
      const suitStrength = actor.system.derived.abilityMods.strength;
      const paDecayAc = actor.system.derived.ac;
      await paSuit.update({ "system.decay": 4 });
      step(
        "a worn suit sets Strength to 12 and takes no AC penalty from decay",
        suitStrength === 7 && actor.system.derived.ac === paDecayAc,
        JSON.stringify({ mod: suitStrength, ac: actor.system.derived.ac, was: paDecayAc }),
      );

      // 8db. decay bands: under 6 immune to radiation, 6-9 advantage on Rad
      //      Resist, 10 nothing (pg 57)
      const radUnder6 = actor.system.derived.immuneRadiation;
      await paSuit.update({ "system.decay": 7 });
      const radAdvantage = actor.system.derived.advantage.checks.radiation;
      await paSuit.update({ "system.decay": 10 });
      const radAtTen = actor.system.derived.powerArmor.radiation;
      step(
        "Power Armor decay bands drive radiation protection",
        radUnder6 === true && radAdvantage >= 1 && radAtTen === "none",
        JSON.stringify({ radUnder6, radAdvantage, radAtTen }),
      );

      // 8dc. at ten levels of decay the Defense Point pool stops refilling
      await paSuit.update({ "system.defensePointsValue": 5 });
      await actor.update({ "system.resources.sp.value": 0, "system.resources.hp.value": 30 });
      const noRefill = await api.applyDamage(actor, 5, "", { ignoreSP: true });
      step(
        "a suit at ten levels of decay no longer refills Defense Points",
        paSuit.system.defensePointsValue === 0 &&
          paSuit.system.decay === 10 &&
          noRefill.dpLost === 5,
        JSON.stringify({
          dp: paSuit.system.defensePointsValue,
          decay: paSuit.system.decay,
          dpLost: noRefill.dpLost,
        }),
      );

      // 8dd. below ten it does refill, at the cost of a level, with the
      //      overflow carrying into the fresh pool. These are the exact numbers
      //      of the pg 57 worked example: 15 DP, 20 damage -> 0, +1 decay,
      //      back to 15, minus the leftover 5, for 10 DP.
      await paSuit.update({
        "system.decay": 2,
        "system.defensePoints": 15,
        "system.defensePointsValue": 15,
      });
      const refill = await api.applyDamage(actor, 20, "", { ignoreSP: true });
      step(
        "emptying the pool refills it for a level of decay, overflow included",
        paSuit.system.decay === 3 &&
          paSuit.system.defensePointsValue === 10 &&
          refill.dpLost === 20 &&
          refill.hpLost === 0,
        JSON.stringify({
          decay: paSuit.system.decay,
          dp: paSuit.system.defensePointsValue,
          dpLost: refill.dpLost,
          hpLost: refill.hpLost,
        }),
      );

      // 8de. overheating drains 30 minutes of allotted time (pg 58)
      await paSuit.update({ "system.fusionCoreMinutes": 360, "system.overheated": false });
      const beforeHeat = game.messages.size;
      await api.overheat(actor, paSuit, "actionPoints");
      step(
        "overheating costs the suit 30 minutes of allotted time",
        paSuit.system.overheated === true &&
          paSuit.system.fusionCoreMinutes === 330 &&
          game.messages.size > beforeHeat,
        JSON.stringify({
          overheated: paSuit.system.overheated,
          minutes: paSuit.system.fusionCoreMinutes,
        }),
      );

      // 8df. Core Assembly rank 3 halves that cost; ranks 1-2 raise the AP bar
      await paSuit.update({ "system.coreAssemblyRank": 3, "system.overheated": false });
      await api.overheat(actor, paSuit, "actionPoints");
      step(
        "Core Assembly rank 3 charges 15 minutes instead of 30",
        paSuit.system.fusionCoreMinutes === 315,
        JSON.stringify({ minutes: paSuit.system.fusionCoreMinutes }),
      );
      await paSuit.update({ "system.coreAssemblyRank": 0, "system.overheated": false });

      // 8dg. a core at or below 30 minutes ejects its user instead (pg 58)
      await paSuit.update({ "system.fusionCoreMinutes": 25, "system.equipped": true });
      const eject = await api.overheat(actor, paSuit, "actionPoints");
      step(
        "overheating on a nearly-dead core ejects the user and stops the suit",
        eject.ejected === true &&
          paSuit.system.ceased === true &&
          paSuit.system.equipped === false,
        JSON.stringify({
          ceased: paSuit.system.ceased,
          equipped: paSuit.system.equipped,
          minutes: paSuit.system.fusionCoreMinutes,
        }),
      );

      // 8dh. a ceased paSuit refuses re-entry until a fresh core goes in
      const refused = await api.togglePowerArmor(actor, paSuit);
      await api.swapFusionCore(actor, paSuit);
      step(
        "a dead suit refuses entry until a fresh Fusion Core restarts it",
        refused === false &&
          paSuit.system.ceased === false &&
          paSuit.system.fusionCoreMinutes === 360,
        JSON.stringify({
          refused,
          ceased: paSuit.system.ceased,
          minutes: paSuit.system.fusionCoreMinutes,
        }),
      );

      // 8di. Fusion Core targeting: cumulative damage, overheating every 30
      await paSuit.update({ "system.equipped": true, "system.coreDamage": 0, "system.overheated": false });
      const firstHit = await api.damageFusionCore(actor, paSuit, 18);
      const secondHit = await api.damageFusionCore(actor, paSuit, 18);
      step(
        "a fusion core overheats the suit every 30 cumulative damage",
        firstHit.triggered === false &&
          secondHit.triggered === true &&
          secondHit.total === 36,
        JSON.stringify({ first: firstHit, second: secondHit }),
      );

      // 8dj. the turn hook overheats a paSuit that spent more than 15 AP
      await paSuit.update({ "system.overheated": false, "system.fusionCoreMinutes": 360 });
      const overheated = await api.checkTurnOverheat(actor, 16);
      await paSuit.update({ "system.overheated": false });
      // Exactly 15 is under the bar: the trigger is "more than 15" (pg 58),
      // and 15 is precisely the base AP maximum, so a paSuit cannot overheat
      // without recycled AP or a perk.
      const notOverheated = await api.checkTurnOverheat(actor, 15);
      step(
        "spending more than 15 AP in a turn overheats a worn suit, 15 does not",
        overheated?.overheated === true && notOverheated === null,
        JSON.stringify({ over: overheated?.drained, at: notOverheated }),
      );

      // 8dk. a Fusion Core targeted attack deals no damage and applies no
      //      condition (pg 58) — every other limb rolls a d4 condition, so
      //      this asserts the *absence* of that follow-up card.
      const [paGun] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Core Rifle",
          type: "weapon",
          system: { weaponType: "rifle", damage: "1d8", apCost: 4, magazineSize: 5, loadedAmmo: 5 },
        },
      ]);
      const beforeCore = game.messages.size;
      await api.rollAttack(actor, actor.system, paGun, paGun.system, "normal", {
        limb: "fusionCore",
      });
      const coreCards = game.messages.contents.slice(beforeCore);
      const coreFollowUp = coreCards.some((m) =>
        String(m.rolls?.[0]?.formula ?? "").includes("1d4"),
      );
      // A normal limb on the same weapon still gets its condition roll. The
      // follow-up d4 only rolls when the attack is neither a natural 1 (no
      // follow-up at all) nor a critical hit (severe-injury card instead), so a
      // single attack fails this on dice luck — roughly 2 rolls in 20 (the run
      // of 2026-08-12 hit exactly that). Retry until the dice cooperate; ten
      // attempts puts the false-failure odds around 6e-9. Ammo is topped up
      // each try so the magazine cannot run dry mid-loop and fail differently.
      let limbFollowUp = false;
      for (let attempt = 0; attempt < 10 && !limbFollowUp; attempt += 1) {
        await paGun.update({ "system.loadedAmmo": paGun.system.magazineSize });
        const beforeLimb = game.messages.size;
        await api.rollAttack(actor, actor.system, paGun, paGun.system, "normal", { limb: "leg" });
        limbFollowUp = game.messages.contents
          .slice(beforeLimb)
          .some((m) => String(m.rolls?.[0]?.formula ?? "").includes("1d4"));
      }
      step(
        "a fusion core attack rolls no condition, while an ordinary limb still does",
        coreFollowUp === false && limbFollowUp === true,
        JSON.stringify({ coreFollowUp, limbFollowUp, cards: coreCards.length }),
      );

      // 8dl. the limb picker's fusion core entry has real label and effect
      //      text — a bare string here would render the raw key in the dialog.
      const coreLabel = game.i18n.localize("FALLOUT.Targeted.limbs.fusionCore.label");
      const coreEffect = game.i18n.localize("FALLOUT.Targeted.limbs.fusionCore.effect");
      step(
        "the fusion core limb entry localizes its label and effect",
        !coreLabel.includes("FALLOUT.") && !coreEffect.includes("FALLOUT.") &&
          coreEffect.toLowerCase().includes("no damage"),
        JSON.stringify({ coreLabel, coreEffect: coreEffect.slice(0, 60) }),
      );

      await paGun.delete();
      await paSuit.delete();
      await tastyFood.delete();
      await actor.update({ "system.abilities.strength.value": 5 });

      // 8dm. Unwieldy (pg 70): one hand and a Perception *score* under 10 is
      //      disadvantage, with no AP that buys it off. A score of 10 carries
      //      it — the property names the printed ability maximum.
      await actor.update({ "system.abilities.perception.value": 5 });
      const [acidRifle] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Unwieldy",
          type: "weapon",
          system: {
            weaponType: "energyWeapon",
            damage: "1d8",
            apCost: 4,
            critChance: 20,
            special: "Energy Weapon, Unwieldy, Quick Reload",
            magazineSize: 0,
            oneHanded: true,
          },
        },
      ]);
      await api.rollAttack(actor, actor.system, acidRifle, acidRifle.system, "normal");
      const unwieldyCard = game.messages.contents.at(-1);
      const unwieldyFlavor = String(unwieldyCard?.flavor ?? "");
      const unwieldyFormula = String(unwieldyCard?.rolls?.[0]?.formula ?? "");
      await actor.update({ "system.abilities.perception.value": 10 });
      await api.rollAttack(actor, actor.system, acidRifle, acidRifle.system, "normal");
      const perTenCard = game.messages.contents.at(-1);
      const perTenFlavor = String(perTenCard?.flavor ?? "");
      const perTenFormula = String(perTenCard?.rolls?.[0]?.formula ?? "");
      step(
        "Unwieldy one-handed is disadvantage under Perception 10, and none at 10",
        unwieldyFormula.includes("2d20kl") &&
          unwieldyFlavor.includes("Unwieldy") &&
          !perTenFormula.includes("2d20kl") &&
          perTenFlavor.includes("no penalty"),
        JSON.stringify({ unwieldyFormula, perTenFormula, perTenFlavor: perTenFlavor.slice(-80) }),
      );
      await acidRifle.delete();
      await actor.update({ "system.abilities.perception.value": 5 });

      // 8dn. v2.1 Dismember (pg 60-61): arm and leg targeted attacks cost no
      //      additional AP — zero, not the melee −2 (which floors at 1), and
      //      only for those two rows.
      const [ripper] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Ripper",
          type: "weapon",
          system: {
            weaponType: "mechanical",
            damage: "1d6",
            apCost: 3,
            critChance: 20,
            special: "Dismember, Depleted: 1d6 bludgeoning",
            magazineSize: 0,
          },
        },
      ]);
      const targetedFlavorAfter = (before) =>
        game.messages.contents
          .slice(before)
          .map((message) => String(message.flavor ?? ""))
          .find((flavor) => flavor.includes("Targeted:")) ?? "";
      const beforeArm = game.messages.size;
      await api.rollAttack(actor, actor.system, ripper, ripper.system, "normal", { limb: "arm" });
      const armFlavor = targetedFlavorAfter(beforeArm);
      const beforeHead = game.messages.size;
      await api.rollAttack(actor, actor.system, ripper, ripper.system, "normal", { limb: "head" });
      const headFlavor = targetedFlavorAfter(beforeHead);
      step(
        "Dismember zeroes the arm's extra AP while the head still pays the melee price",
        armFlavor.includes("(+0 AP)") &&
          armFlavor.includes("Dismember") &&
          headFlavor.includes("(+1 AP)"),
        JSON.stringify({ arm: armFlavor.slice(0, 90), head: headFlavor.slice(0, 90) }),
      );
      await ripper.delete();

      // 8do. Corrosive (pg 69), v2.1's replacement for the deleted Corroded
      //      condition: damage that reaches hit points decays the target's worn
      //      armor. The damage roll only carries the flag; the Apply pipeline
      //      is what knows the defender and whether HP were reached.
      await actor.update({
        "system.resources.hp.value": 20,
        "system.resources.sp.value": 0,
        "system.resources.tempHp": 0,
      });
      const [soaker] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "SMOKE-Soaker",
          type: "weapon",
          system: {
            weaponType: "handgun",
            damage: "1",
            damageType: "acid",
            apCost: 4,
            critChance: 20,
            special: "Corrosive, Range: 30 ft.",
            magazineSize: 0,
          },
        },
      ]);
      await api.rollDamage(actor, actor.system, soaker, soaker.system);
      const corrosiveFlags = game.messages.contents.at(-1)?.getFlag("fallout-ttrpg", "damage");
      // Whatever the actor is actually wearing — the same item the pipeline
      // reaches for — rather than a second suit stacked behind it.
      const wornArmor = actor.itemTypes.armor.find((item) => item.system.equipped);
      const decayBefore = wornArmor?.system.decay;
      const corroded = await api.applyDamage(actor, 8, "acid", { corrosive: true });
      const decayAfter = wornArmor?.system.decay;
      // Fully absorbed by stamina, so nothing reaches hit points and nothing
      // corrodes.
      await actor.update({ "system.resources.sp.value": 10 });
      const noHp = await api.applyDamage(actor, 4, "acid", { corrosive: true });
      step(
        "Corrosive decays worn armor only when the damage reaches hit points",
        corrosiveFlags?.corrosive === true &&
          corroded.hpLost > 0 &&
          decayBefore !== undefined &&
          decayAfter === decayBefore + 1 &&
          corroded.armorCorroded === decayAfter &&
          noHp.hpLost === 0 &&
          noHp.armorCorroded === undefined &&
          wornArmor?.system.decay === decayAfter,
        JSON.stringify({
          flag: corrosiveFlags?.corrosive,
          hpLost: corroded.hpLost,
          decayBefore,
          decayAfter,
          reported: corroded.armorCorroded,
          blocked: noHp.armorCorroded,
        }),
      );
      // Leave the armor as it was found: a level of decay here is invisible to
      // AC and DT (the pg 92 penalty is per *two* levels), but the next step
      // should not have to know that.
      if (wornArmor && decayBefore !== undefined) {
        await wornArmor.update({ "system.decay": decayBefore });
      }
      await soaker.delete();

      // ======================================================= release 7: cover-range
      {
        // ---------------------------------------------------------------- cover + range
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
      }

      // ======================================================= release 7: combat-actions
      {
        // Smoke steps for the v2.1 combat actions: Grapple, Escape, Help, Ready and
        // the unarmed strike (pg 126-127, plus Holey Moley on pg 52).
        //
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
        // Blocking needs a melee weapon in hand (pg 127). Earlier blocks leave
        // the equipped state wherever their own assertions needed it, so this
        // brings its own rather than inheriting one.
        const [punchBlade] = await actor.createEmbeddedDocuments("Item", [
          {
            name: "SMOKE-Block Blade",
            type: "weapon",
            system: { weaponType: "bladed", damage: "1d6", apCost: 3, equipped: true },
          },
        ]);
        await api.startBlocking(actor, actor.system);
        const blockingBeforePunch = api.isBlocking(actor);
        await api.unarmedStrike(actor, actor.system);
        step(
          "an unarmed strike ends a block, same as swinging a weapon",
          blockingBeforePunch === true && api.isBlocking(actor) === false,
          JSON.stringify({ blockingBeforePunch, blocking: api.isBlocking(actor) }),
        );

        await punchBlade.delete();
        await brawler.delete();
      }

      // ======================================================= release 7: first-aid
      {
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
      }

      // ======================================================= release 7: crafting
      {
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
      }

      // ======================================================= release 7: power-armor-upgrades
      {
        // Power Armor upgrades (pg 59) + the pg 57/9/11 gating.
        //
        // which leaves `paSuit` equipped, restarted, and on a full 360-minute core.
        // Style matches that block: `step(name, condition, detail)`, `actor`, `api` and
        // `game` in scope, documents prefixed SMOKE-.
        //
        // Requires these api exports (see the integration notes):
        //   spendAllottedTime, toggleTeslaCoils, flyWithJetPack, triggerExplosiveVent,
        //   overclockOverheat, optimizedBracersStrike, queryInternalDatabase,
        //   syncPowerArmorEffects, powerArmorTurnStart, powerArmorShielding,
        //   powerArmorReflection, targetedApWithVats

        // This block builds its own suit rather than inheriting one. The
        // release-6 Power Armor block deletes its `paSuit` when it finishes, so
        // reusing that name reached a destroyed document and every write threw.
        const paPack2 = game.packs.get("fallout-ttrpg.equipment");
        const paIndex2 = await paPack2.getIndex();
        const paSource2 = await paPack2.getDocument(
          paIndex2.find((e) => e.name === "Power Armor: T-51")._id,
        );
        const [paSuit] = await actor.createEmbeddedDocuments("Item", [
          { ...paSource2.toObject(), name: "SMOKE-T-51-upgrades" },
        ]);
        await api.togglePowerArmor(actor, paSuit);

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
        // Delete it: leaving an equipped suit behind means the *next* block's
        // suit is not the one powerArmorItem() returns, and every assertion
        // there reads a document nothing is writing to.
        await paSuit.delete();
      }

      // ================================================ sheet panel: combat-panel
      {
        // ------------------------------------------- the combat-actions sheet panel
        // The character-sheet panel that exposes the v2.1 combat actions — Grapple,
        // Escape, Unarmed Strike, Help and Ready (pg 126-127). The rules themselves are
        // covered by the combat-actions block (8ba-8bq); these steps are about the
        // *panel*: that its controls exist and are wired, that every AP figure on it
        // comes from the rules module rather than from the markup, and that the three
        // pieces of state a player cannot otherwise see — who is holding you, whose
        // Help you are carrying, what you have readied — are actually shown.
        //
        // block; `step`, `actor`, `api`, `game`, `ActorClass` and `stamp` all come from
        // the surrounding scope. Every document created here is SMOKE- prefixed and
        // deleted at the end.
        //
        // Requires packs-src/fragments/combat-panel.lang.json merged under FALLOUT in
        // static/lang/en.json — an unmerged key renders as its own path, and the two
        // steps that read a number out of the panel will say so by failing.

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
        // The strike above posts its card asynchronously and its click was not
        // awaited, so let the log go quiet before counting it — otherwise a
        // late card is indistinguishable from a roll this step should refuse.
        await settle(800);
        const messagesBefore = game.messages.size;
        panel?.querySelector('[data-action="escapeGrapple"]')?.click();
        await settle(800);
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
        // Wait for the bank, do not guess at it: a fixed sleep passed locally
        // and lost the race in the full suite. The action itself was verified
        // correct by direct probe.
        await until(() => actor.system.resources.ap.recycled > 0);
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
      }

      // ================================================ sheet panel: power-armor-panel
      {
        // Its own suit: the release-7 upgrades block scopes `paSuit` to itself,
        // and the release-6 block deletes the one it made. Inheriting either
        // reached a destroyed or out-of-scope document.
        const panelPack = game.packs.get("fallout-ttrpg.equipment");
        const panelIndex = await panelPack.getIndex();
        const panelSource = await panelPack.getDocument(
          panelIndex.find((e) => e.name === "Power Armor: T-51")._id,
        );
        // Defensive: the panel reads whatever suit powerArmorItem() finds, so
        // any other equipped suit would shadow this one.
        for (const worn of actor.itemTypes.armor.filter((i) => i.system.isPowerArmor)) {
          await worn.delete();
        }
        const [paSuit] = await actor.createEmbeddedDocuments("Item", [
          { ...panelSource.toObject(), name: "SMOKE-T-51-panel" },
        ]);
        await api.togglePowerArmor(actor, paSuit);

        // The Power Armor upgrades sheet panel (pg 59) — src/sheets/panels/power-armor.ts
        // and templates/actor/parts/power-armor.hbs.
        //
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
        // The previous step clears the rank; its effect rebuild has to land
        // before the baseline is read, or the baseline still carries it.
        await until(() => paSuit.system.upgradeRank("sensorArray") === 0);
        await settle(400);
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
        // The Tesla toggle above drains on activation and its click is not
        // awaited, so let the core settle before taking a baseline from it.
        await settle(400);
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

        await paSuit.delete();
      }

      // ================================================ sheet panel: crafting-panel
      {
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
                  // 8, deliberately above the character's Survival bonus: at 3
                  // it equalled it, and "equal to" is an automatic success by
                  // this system's standing ruling, so the row was right and the
                  // assertion was wrong.
                  craftDC: 8,
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
          rowText("SMOKE-Bench-Stew").includes("Survival DC 18") &&
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
          benchDialogText.includes("Survival DC 18") &&
            benchDialogText.includes("bloatfly meat") &&
            benchDialogText.includes("30 minutes") &&
            actor.items.size === benchItemsBefore,
          JSON.stringify({ dialog: benchDialogText.slice(0, 200), items: actor.items.size, before: benchItemsBefore }),
        );

        await benchBlade.delete();
        await benchStew.delete();
        await benchRelic.delete();
      }

      // ============================================ cover / range attack dialog
      {
        // The declared-not-measured half of cover and range (pg 130, pg 21/66),
        // driven through the sheet control rather than the API, because the
        // wiring is the part that was missing.
        const [covGun] = await actor.createEmbeddedDocuments("Item", [
          {
            name: "SMOKE-Cover Rifle",
            type: "weapon",
            system: {
              weaponType: "rifle",
              damage: "1d8",
              apCost: 4,
              rangeNormal: 4,
              rangeLong: 8,
              magazineSize: 10,
              loadedAmmo: 10,
            },
          },
        ]);
        await actor.sheet.render(true);
        await until(() => !!actor.sheet.element?.querySelector('[data-action="rollInSituation"]'));

        // Weapons render as `.weapon-card`, not table rows — the earlier
        // selector guessed at a structure this sheet does not use.
        const covRow = () =>
          [...actor.sheet.element.querySelectorAll(".weapon-card")].find((el) =>
            el.textContent.includes("SMOKE-Cover Rifle"),
          ) ?? null;
        step(
          "a weapon row offers the cover-and-range control alongside the plain attack",
          !!covRow()?.querySelector('[data-action="rollInSituation"]') &&
            !!covRow()?.querySelector('[data-action="rollAttack"]'),
          JSON.stringify({ row: !!covRow() }),
        );

        // The dialog offers every printed degree, and cancelling fires nothing.
        await settle(400);
        const covBefore = game.messages.size;
        covRow()?.querySelector('[data-action="rollInSituation"]')?.click();
        await until(() => !!document.querySelector('select[name="cover"]'), 6000);
        const covSelect = document.querySelector('select[name="cover"]');
        const covValues = [...(covSelect?.options ?? [])].map((o) => o.value);
        const hasDistance = !!document.querySelector('input[name="distance"]');
        const hasCreature = !!document.querySelector('input[name="creature"]');
        document.querySelector('dialog.application button[data-action="cancel"]')?.click();
        await until(() => !document.querySelector('select[name="cover"]'), 6000);
        await settle(500);
        step(
          "the dialog offers all four cover degrees plus distance, and cancelling rolls nothing",
          covValues.join(",") === "none,half,threeQuarters,total" &&
            hasDistance &&
            hasCreature &&
            game.messages.size === covBefore,
          JSON.stringify({ covValues, hasDistance, hasCreature }),
        );

        // Total cover refuses the attack outright and spends no ammunition
        // (pg 130) — the one degree that is a refusal rather than a modifier.
        await settle(300);
        const ammoBefore = covGun.system.loadedAmmo;
        await api.rollAttack(actor, actor.system, covGun, covGun.system, "normal", {
          cover: "total",
        });
        await settle(500);
        step(
          "total cover refuses the attack before any ammunition is spent",
          covGun.system.loadedAmmo === ammoBefore,
          JSON.stringify({ before: ammoBefore, after: covGun.system.loadedAmmo }),
        );

        // Beyond normal range is disadvantage: PER 5 x4 = 20 ft normal, 40 long.
        await actor.update({ "system.abilities.perception.value": 5 });
        await settle(300);
        await api.rollAttack(actor, actor.system, covGun, covGun.system, "normal", {
          distanceFeet: 30,
        });
        await settle(600);
        const farFormula = String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");
        await api.rollAttack(actor, actor.system, covGun, covGun.system, "normal", {
          distanceFeet: 10,
        });
        await settle(600);
        const nearFormula = String(game.messages.contents.at(-1)?.rolls?.[0]?.formula ?? "");
        step(
          "a shot past normal range rolls with disadvantage, and inside it does not",
          farFormula.includes("2d20kl") && !nearFormula.includes("2d20kl"),
          JSON.stringify({ farFormula, nearFormula }),
        );

        await covGun.delete();
      }

      // ==================================================== release 8: section-e
      {
        // ------------------------------------------------------- ROADMAP section E
        // The five dangling ends: Escape clearing Restrained (pg 126), Reactive Plates
        // reaching an attacker (pg 59), the VATS matrix overlay reaching a real roll
        // (pg 59), the pg 133 bleeding-healing redirect, and the pg 86 medical kits.
        //
        // `api`, `game`, `until` and `settle` are in scope. This block builds every
        // document it needs and deletes all of them at the end, so it inherits nothing
        // and leaves nothing — dropping it anywhere in the file is safe, and removing
        // it cannot break a later block.
        //
        // Requires these api exports (see the integration notes):
        //   escapeGrapple, ESCAPABLE_STATUSES, applyDamage, rollAttack,
        //   restoreHitPoints, hitPointUpdates, bleedingRedirectsHealing,
        //   BLEEDING_HEAL_REDIRECT_LEVELS, useAid, useMedicalKit, medicalKitKind,
        //   stitchWoundsHitPoints, tourniquetRelief, efficientDiagnosisBonus,
        //   MEDICAL_KIT_ACTIONS, MEDICAL_KIT_USES, targetedApWithVats
        {
          const ActorType = game.actors.documentClass;
          const seStamp = Date.now();
          const built = [];
          const makeActor = async (label, type = "character") => {
            const made = await ActorType.create({ name: `SMOKE-${label}-${seStamp}`, type });
            built.push(made);
            return made;
          };

          // =====================================================================
          // E1. Escape frees you from "a grapple, restrain, or chokehold" (pg 126)
          // =====================================================================

          const captive = await makeActor("Captive");
          await captive.update({ "system.skills.unarmed.points": 4 });
          await captive.toggleStatusEffect("grappled", { active: true });
          await captive.toggleStatusEffect("restrained", { active: true });
          // Statuses are embedded-document writes; sample after they land, not at the
          // instant of the call.
          await until(
            () => captive.statuses.has("grappled") && captive.statuses.has("restrained"),
          );

          // e1. A DC nothing can miss, so the step measures what a success *clears*
          //     rather than whether the die cooperated. Before this work the action
          //     cleared `grappled` only and left Restrained on the token forever.
          const escaped = await api.escapeGrapple(captive, captive.system, { dc: -99 });
          await until(
            () => !captive.statuses.has("grappled") && !captive.statuses.has("restrained"),
          );
          step(
            "Escape clears Restrained as well as Grappled (pg 126)",
            escaped !== null &&
              escaped.succeeded === true &&
              escaped.cleared.includes("grappled") &&
              escaped.cleared.includes("restrained") &&
              captive.statuses.has("grappled") === false &&
              captive.statuses.has("restrained") === false,
            JSON.stringify({
              cleared: escaped?.cleared ?? null,
              statuses: Array.from(captive.statuses),
              escapable: api.ESCAPABLE_STATUSES,
            }),
          );

          // e2. Only what was actually on comes off, so an escape from a bear trap
          //     (pg 80 — Restrained, no grappler) does not claim to have broken a
          //     grapple it was never in.
          await captive.toggleStatusEffect("restrained", { active: true });
          await until(() => captive.statuses.has("restrained"));
          const trapped = await api.escapeGrapple(captive, captive.system, { dc: -99 });
          await until(() => !captive.statuses.has("restrained"));
          step(
            "Escape reports only the conditions the creature actually had",
            trapped !== null &&
              trapped.cleared.length === 1 &&
              trapped.cleared[0] === "restrained",
            JSON.stringify({ cleared: trapped?.cleared ?? null }),
          );

          // =====================================================================
          // E2. The pg 133 bleeding-healing redirect
          // =====================================================================

          const patient = await makeActor("Patient");
          await patient.update({
            "system.abilities.endurance.value": 9,
            "system.details.level": 4,
          });

          // e3. The gate itself: "If a creature who has any levels of bleeding is
          //     healed, they do not gain any hit points, instead they remove two levels
          //     of bleeding" (pg 133). Pure arithmetic, so this is deterministic.
          await patient.update({
            "system.resources.hp.value": 1,
            "system.conditions.bleeding": 3,
          });
          const redirected = api.restoreHitPoints(patient, patient.system, 99);
          step(
            "healing a bleeding creature sheds two levels and grants no hit points",
            redirected.redirected === true &&
              redirected.restored === 0 &&
              redirected.value === 1 &&
              redirected.bleedingShed === api.BLEEDING_HEAL_REDIRECT_LEVELS &&
              redirected.bleedingValue === 1 &&
              api.bleedingRedirectsHealing(patient.system) === true,
            JSON.stringify(redirected),
          );

          // e4. …and with no Bleeding on the sheet the same call heals normally, capped
          //     by the healable maximum (pg 124's radiation lock rides the same gate).
          await patient.update({
            "system.resources.hp.value": 1,
            "system.conditions.bleeding": 0,
          });
          const healable = patient.system.derived.hpHealableMax;
          const plain = api.restoreHitPoints(patient, patient.system, 5);
          step(
            "with no Bleeding the gate heals normally",
            plain.redirected === false &&
              plain.bleedingShed === 0 &&
              plain.restored === Math.min(5, healable - 1) &&
              plain.value === 1 + plain.restored,
            JSON.stringify({ gain: plain, healable }),
          );

          // e5. End to end through a real consumable: the redirect is not a helper
          //     nobody calls, it is what `useAid` now does. A fixed heal formula rather
          //     than the healing rate, so the numbers are the die's business only where
          //     the rule is about a die.
          const stim = (
            await patient.createEmbeddedDocuments("Item", [
              {
                name: `SMOKE-Stimpak-${seStamp}`,
                type: "aid",
                system: {
                  aidType: "medicine",
                  quantity: 2,
                  healsHealingRate: false,
                  healFormula: "4",
                },
              },
            ])
          )[0];
          await patient.update({
            "system.resources.hp.value": 1,
            "system.conditions.bleeding": 4,
          });
          await api.useAid(patient, patient.system, stim);
          await until(() => patient.system.conditions.bleeding === 2);
          step(
            "a stimpak used on a bleeding creature sheds Bleeding instead of healing",
            patient.system.resources.hp.value === 1 && patient.system.conditions.bleeding === 2,
            JSON.stringify({
              hp: patient.system.resources.hp.value,
              bleeding: patient.system.conditions.bleeding,
            }),
          );

          // e6. Stamina is *not* redirected. Pg 133 says "gains no hit points" and says
          //     nothing about stamina points, so a bleeding character still eats.
          await patient.update({
            "system.resources.sp.value": 0,
            "system.conditions.bleeding": 3,
          });
          const staminaGain = api.restoreStamina(patient, patient.system, 3);
          step(
            "Bleeding does not block stamina restoration (pg 133 names hit points only)",
            staminaGain.blocked === false && staminaGain.restored > 0,
            JSON.stringify(staminaGain),
          );

          // =====================================================================
          // E3. Reactive Plates finally reach the attacker (pg 59)
          // =====================================================================

          const plated = await makeActor("Plated");
          const swinger = await makeActor("Swinger");
          await swinger.update({
            "system.resources.hp.value": 30,
            "system.resources.sp.value": 0,
          });
          const suit = (
            await plated.createEmbeddedDocuments("Item", [
              {
                name: `SMOKE-T-51-${seStamp}`,
                type: "armor",
                system: {
                  isPowerArmor: true,
                  equipped: true,
                  defensePoints: 0,
                  defensePointsValue: 0,
                  upgradeRanks: { reactivePlates: 3 },
                },
              },
            ])
          )[0];

          // e7. 20 damage, rank 3: two quarters rounded down (5 + 5) come back, and the
          //     15-foot knockback is reported. The reflected damage runs the attacker's
          //     own pipeline, which is what `reflected.result` proves.
          const melee = await api.applyDamage(plated, 20, "", { melee: true, attacker: swinger });
          const back = melee.reflected;
          step(
            "Reactive Plates reflect a quarter per rank at the melee attacker",
            back !== undefined &&
              back.damage === 10 &&
              back.knockback === 15 &&
              back.attacker === swinger.name &&
              back.result !== undefined &&
              back.result.adjusted === 10 &&
              back.result.hpLost + back.result.dtPrevented === 10,
            JSON.stringify(back ?? null),
          );

          // e8. Two things that must NOT reflect: a ranged hit (the upgrade says "from a
          //     melee attack"), and a hit whose attacker is unknown — which is every
          //     hazard, disease and environment tick in the system, and was every attack
          //     before this was threaded through.
          const ranged = await api.applyDamage(plated, 20, "", { melee: false, attacker: swinger });
          const anonymous = await api.applyDamage(plated, 20, "", { melee: true });
          step(
            "reflection needs both a melee flag and a named attacker",
            ranged.reflected === undefined && anonymous.reflected === undefined,
            JSON.stringify({ ranged: ranged.reflected ?? null, anonymous: anonymous.reflected ?? null }),
          );

          // e9. A reflection cannot bounce: the nested application names no attacker, so
          //     two plated creatures in melee resolve once and stop. Both suited, both
          //     rank 3 — before the guard this shape is what would have recursed.
          const counterSuit = (
            await swinger.createEmbeddedDocuments("Item", [
              {
                name: `SMOKE-X-01-${seStamp}`,
                type: "armor",
                system: {
                  isPowerArmor: true,
                  equipped: true,
                  defensePoints: 0,
                  defensePointsValue: 0,
                  upgradeRanks: { reactivePlates: 3 },
                },
              },
            ])
          )[0];
          await swinger.update({ "system.resources.hp.value": 30, "system.resources.sp.value": 0 });
          const exchange = await api.applyDamage(plated, 20, "", { melee: true, attacker: swinger });
          step(
            "a reflection does not itself reflect",
            exchange.reflected !== undefined &&
              exchange.reflected.damage === 10 &&
              exchange.reflected.result !== undefined &&
              exchange.reflected.result.reflected === undefined,
            JSON.stringify({
              outward: exchange.reflected?.damage ?? null,
              inward: exchange.reflected?.result?.reflected ?? null,
              suit: counterSuit.name,
            }),
          );

          // =====================================================================
          // E4. The VATS matrix overlay reaches a real targeted attack (pg 59)
          // =====================================================================

          const gunner = await makeActor("Gunner");
          const vatsSuit = (
            await gunner.createEmbeddedDocuments("Item", [
              {
                name: `SMOKE-T-60-${seStamp}`,
                type: "armor",
                system: {
                  isPowerArmor: true,
                  equipped: true,
                  upgradeRanks: { vatsMatrix: 2 },
                },
              },
            ])
          )[0];
          const pistol = (
            await gunner.createEmbeddedDocuments("Item", [
              {
                name: `SMOKE-10mm-${seStamp}`,
                type: "weapon",
                system: { weaponType: "handgun", magazineSize: 0, damage: "1d10" },
              },
            ])
          )[0];

          // e10. The helper on its own — already true before this work, kept as the
          //      control for the step below.
          step(
            "the VATS matrix overlay takes 1 additional AP off per rank, floored at 0",
            api.targetedApWithVats(gunner, 5) === 3 &&
              api.targetedApWithVats(gunner, 1) === 0 &&
              api.targetedApWithVats(plated, 5) === 5,
            JSON.stringify({
              eyes: api.targetedApWithVats(gunner, 5),
              melee: api.targetedApWithVats(gunner, 1),
              unsuited: api.targetedApWithVats(plated, 5),
              suit: vatsSuit.name,
            }),
          );

          // e11. …and the roll now asks for it. An eye shot costs +5 additional AP
          //      (pg 129 table, read from the page image); a rank 2 suit charges +3, and
          //      the card says so. Asserted against the chat flavor, because the attack
          //      roll is the call site this item was about.
          const expectedVats = game.i18n.localize("FALLOUT.PowerArmor.vatsReduced", {
            printed: 5,
            ap: 3,
          });
          const before = game.messages.size;
          await api.rollAttack(gunner, gunner.system, pistol, pistol.system, "normal", { limb: "eyes" });
          await until(() => game.messages.size > before);
          await settle();
          const cards = game.messages.contents.slice(before).map((m) => m.flavor ?? "");
          step(
            "a targeted attack roll prices its surcharge through the VATS overlay",
            cards.some((flavor) => flavor.includes(expectedVats)),
            JSON.stringify({ expected: expectedVats, cards }),
          );

          // =====================================================================
          // E5. The pg 86 First Aid Kit and Doctor's Bag
          // =====================================================================

          const medic = await makeActor("Medic");
          await medic.update({
            "system.abilities.intelligence.value": 8,
            "system.skills.medicine.points": 3,
          });
          const makeKit = async (label) =>
            (
              await medic.createEmbeddedDocuments("Item", [
                { name: label, type: "aid", system: { aidType: "medicine", quantity: 1 } },
              ])
            )[0];

          // e12. The two kits are recognised by name and offer what pg 86 prints them
          //      offering — Set Bone is in the Doctor's Bag entry only, and the First
          //      Aid Kit holds one action against the bag's three.
          const kit = await makeKit(`SMOKE-First Aid Kit-${seStamp}`);
          const bag = await makeKit(`SMOKE-Doctor's Bag-${seStamp}`);
          step(
            "the pg 86 kits are recognised, with the actions and uses the book prints",
            api.medicalKitKind(kit.name) === "firstAidKit" &&
              api.medicalKitKind(bag.name) === "doctorsBag" &&
              api.medicalKitKind(pistol.name) === null &&
              api.MEDICAL_KIT_USES.firstAidKit === 1 &&
              api.MEDICAL_KIT_USES.doctorsBag === 3 &&
              api.MEDICAL_KIT_ACTIONS.firstAidKit.length === 3 &&
              api.MEDICAL_KIT_ACTIONS.doctorsBag.length === 4 &&
              api.MEDICAL_KIT_ACTIONS.firstAidKit.includes("setBone") === false,
            JSON.stringify({
              kit: api.medicalKitKind(kit.name),
              bag: api.medicalKitKind(bag.name),
              firstAid: api.MEDICAL_KIT_ACTIONS.firstAidKit,
              doctors: api.MEDICAL_KIT_ACTIONS.doctorsBag,
            }),
          );

          // e13. Tourniquet: 6 AP, no check, up to two levels — and it consumes the
          //      First Aid Kit outright, because that kit holds exactly one action.
          await patient.update({ "system.conditions.bleeding": 5 });
          const tourniquet = await api.useMedicalKit(medic, medic.system, kit, patient, "tourniquet");
          await until(() => patient.system.conditions.bleeding === 3);
          await until(() => kit.system.quantity === 0);
          step(
            "Tourniquet removes two levels of Bleeding and spends the First Aid Kit",
            tourniquet !== null &&
              tourniquet.bleedingRemoved === 2 &&
              tourniquet.apCost === 6 &&
              tourniquet.exhausted === true &&
              patient.system.conditions.bleeding === 3 &&
              kit.system.quantity === 0,
            JSON.stringify({
              report: tourniquet,
              bleeding: patient.system.conditions.bleeding,
              quantity: kit.system.quantity,
            }),
          );

          // e14. An action with nothing to do is refused and keeps the supplies. The
          //      book never says either way; destroying an 80-cap item on a misclick is
          //      the worse guess, and the refusal is stated rather than silent.
          const spare = await makeKit(`SMOKE-First Aid Kit-spare-${seStamp}`);
          await patient.update({ "system.conditions.bleeding": 0 });
          const nothingToDo = await api.useMedicalKit(medic, medic.system, spare, patient, "tourniquet");
          await settle();
          step(
            "a kit action with no effect is refused and costs no supplies",
            nothingToDo === null && spare.system.quantity === 1,
            JSON.stringify({ report: nothingToDo, quantity: spare.system.quantity }),
          );

          // e15. Stitch Wounds: double the *patient's* healing rate plus the *medic's*
          //      Medicine bonus (pg 86 — two different creatures in one formula).
          await patient.update({
            "system.conditions.bleeding": 0,
            "system.resources.hp.value": 1,
          });
          const rate = patient.system.derived.healingRate;
          const medicine = medic.system.derived.skillBonuses.medicine;
          const expectedStitch = api.stitchWoundsHitPoints(rate, medicine);
          const stitched = await api.useMedicalKit(medic, medic.system, bag, patient, "stitchWounds");
          await until(() => patient.system.resources.hp.value > 1);
          step(
            "Stitch Wounds heals 2 × the patient's healing rate + the medic's Medicine bonus",
            stitched !== null &&
              stitched.minutes === 10 &&
              stitched.apCost === 0 &&
              expectedStitch === 2 * rate + medicine &&
              stitched.hitPointsHealed ===
                Math.min(expectedStitch, patient.system.derived.hpHealableMax - 1),
            JSON.stringify({
              report: stitched,
              rate,
              medicine,
              expected: expectedStitch,
              hp: patient.system.resources.hp.value,
            }),
          );

          // e16. Pain Killer on a dying creature that is NOT bleeding: 1 hit point, no
          //      check, and the death-save tallies cleared the way pg 131's own
          //      comparable outcome clears them.
          await patient.update({
            "system.resources.hp.value": 0,
            "system.conditions.bleeding": 0,
            "system.resources.deathSaves.failures": 2,
            "system.resources.deathSaves.successes": 1,
          });
          const painKiller = await api.useMedicalKit(medic, medic.system, bag, patient, "painKiller");
          await until(() => patient.system.resources.hp.value === 1);
          step(
            "Pain Killer returns a dying creature to 1 hit point and clears its death saves",
            painKiller !== null &&
              painKiller.apCost === 6 &&
              painKiller.hitPointsHealed === 1 &&
              painKiller.redirected === false &&
              patient.system.resources.hp.value === 1 &&
              patient.system.resources.deathSaves.failures === 0 &&
              patient.system.resources.deathSaves.successes === 0,
            JSON.stringify({
              report: painKiller,
              hp: patient.system.resources.hp.value,
              saves: patient.system.resources.deathSaves,
            }),
          );

          // e17. Pain Killer on a dying creature that IS bleeding: pg 86 calls it
          //      healing, so pg 133 takes it — no hit point, two levels shed, still at
          //      0. The single most arguable call in this work, asserted so that a
          //      future change of mind is a failing step rather than a silent drift.
          await patient.update({
            "system.resources.hp.value": 0,
            "system.conditions.bleeding": 3,
          });
          const painRedirected = await api.useMedicalKit(medic, medic.system, bag, patient, "painKiller");
          await until(() => patient.system.conditions.bleeding === 1);
          step(
            "Pain Killer on a bleeding dying creature is redirected by pg 133",
            painRedirected !== null &&
              painRedirected.redirected === true &&
              painRedirected.hitPointsHealed === 0 &&
              painRedirected.bleedingRemoved === 2 &&
              patient.system.resources.hp.value === 0 &&
              patient.system.conditions.bleeding === 1 &&
              painRedirected.exhausted === true,
            JSON.stringify({
              report: painRedirected,
              hp: patient.system.resources.hp.value,
              bleeding: patient.system.conditions.bleeding,
            }),
          );

          // e18. Three actions and the bag is gone (pg 86). The three above were Stitch
          //      Wounds, Pain Killer, Pain Killer — the book never says they must
          //      differ, and this proves the counter, not the menu.
          await until(() => bag.system.quantity === 0);
          step(
            "a Doctor's Bag is spent after three actions, not one",
            bag.system.quantity === 0 && painRedirected?.usesTotal === 3,
            JSON.stringify({ quantity: bag.system.quantity, uses: painRedirected?.usesSpent ?? null }),
          );

          // e19. Efficient Diagnosis (pg 38) is the one perk keying off this action
          //      rather than off a roll: +2 hit points per rank, up to three, and only
          //      "on another creature".
          step(
            "Efficient Diagnosis adds 2 hit points per rank, and nothing to self-treatment",
            api.efficientDiagnosisBonus(1, true) === 2 &&
              api.efficientDiagnosisBonus(3, true) === 6 &&
              api.efficientDiagnosisBonus(9, true) === 6 &&
              api.efficientDiagnosisBonus(3, false) === 0,
            JSON.stringify({
              one: api.efficientDiagnosisBonus(1, true),
              capped: api.efficientDiagnosisBonus(9, true),
              self: api.efficientDiagnosisBonus(3, false),
            }),
          );

          // e20. Set Bone spends its use and reports, because the condition it removes
          //      has no field: Broken Arm is chat text off the pg 129 table, and
          //      "Broken Leg" is named on pg 86 and defined nowhere in the book.
          const secondBag = await makeKit(`SMOKE-Doctor's Bag-2-${seStamp}`);
          const setBone = await api.useMedicalKit(medic, medic.system, secondBag, patient, "setBone");
          const refusedSetBone = await api.useMedicalKit(medic, medic.system, spare, patient, "setBone");
          await settle();
          step(
            "Set Bone is offered by the bag only, takes 10 minutes, and spends a use",
            setBone !== null &&
              setBone.minutes === 10 &&
              setBone.usesSpent === 1 &&
              setBone.exhausted === false &&
              refusedSetBone === null,
            JSON.stringify({ setBone, refusedFromKit: refusedSetBone }),
          );

          // ------------------------------------------------------------- teardown
          // Everything this block made, gone — including the embedded items, which go
          // with their actors. Nothing after this point may depend on anything above.
          for (const made of built) await made.delete();
        }
      }

      // ==================================================== release 8: progression
      {
        // ------------------------------------------------------------- progression
        // XP awards and level-up spending (pg 5-6), skill magazines (pg 88), caps and
        // Barter's Discount (pg 22). Drop this block into scripts/smoke.mjs inside the
        // main try, where `step`, `actor`, `api`, `game`, `until`, `settle`,
        // `ActorClass` and `stamp` are in scope.
        //
        // Everything here is deterministic: none of these rules rolls a die. What the
        // steps guard is arithmetic that the book leaves ambiguous (rounding, whether
        // percentages compound), and *state that has to survive a re-read* — the
        // magazine bonuses land in `derived.skillBonuses` through the data model, so
        // every one of those is sampled after `settle()` rather than at the instant of
        // the call, per the working agreement.
        //
        // Documents: this block creates its own SMOKE- actors and items and deletes
        // them at the end. `awardExperience` is only ever called with an explicit
        // recipient list, so it can never write to a real campaign actor — with the
        // default list it writes to every player character in the world.

        // pr1. the four printed modifiers (pg 5). Percentages are of the base and
        //      summed, never compounded; the flat death award lands after them.
        const award = api.experienceAward({
          base: 100,
          downed: 2,
          creatureDiscovery: true,
          locationDiscovery: true,
          deaths: 1,
        });
        step(
          "XP modifiers are summed percentages of the base, plus the flat death award",
          award.downedBonus === 20 &&
            award.creatureBonus === 20 &&
            award.locationBonus === 20 &&
            award.deathAward === 1000 &&
            award.total === 1160,
          JSON.stringify(award),
        );

        // pr2. rounding. The book never says; this rounds down, as it does everywhere
        //      it does say. 10% of 125 is 12.5 -> 12, so the total is 137 and not 138.
        const rounded = api.experienceAward({
          base: 125,
          downed: 1,
          creatureDiscovery: false,
          locationDiscovery: false,
          deaths: 0,
        });
        step(
          "XP percentage bonuses round down",
          rounded.downedBonus === 12 && rounded.total === 137,
          JSON.stringify(rounded),
        );

        // pr3. the catch-up rule (pg 5): everyone rises to the highest total, and the
        //      amount each one gains is different — which is the whole reason it is
        //      logged per character.
        const gains = api.catchUpGains([1000, 2500, 2500]);
        step(
          "catch-up raises every character to the party's highest XP total",
          gains.length === 3 && gains[0] === 1500 && gains[1] === 0 && gains[2] === 0,
          JSON.stringify(gains),
        );

        // pr4. the award applied to two characters who start at different totals. The
        //      absolute totals depend on whatever else is in the world (catch-up reads
        //      the whole party), so what is asserted is the rule: they end equal, and
        //      the one who was behind gained more.
        const rich = await ActorClass.create({ name: `SMOKE-Rich-${stamp}`, type: "character" });
        const poor = await ActorClass.create({ name: `SMOKE-Poor-${stamp}`, type: "character" });
        await rich.update({ "system.details.xp": 2000 });
        await poor.update({ "system.details.xp": 500 });
        const report = await api.awardExperience({
          base: 100,
          downed: 0,
          creatureDiscovery: false,
          locationDiscovery: false,
          deaths: 0,
          reason: "SMOKE-award",
          recipients: [rich, poor],
        });
        await settle();
        step(
          "an XP award leaves both recipients on the same total, the poorer one gaining more",
          report !== null &&
            rich.system.details.xp === poor.system.details.xp &&
            rich.system.details.xp >= 2100 &&
            report.lines.length === 2 &&
            report.lines.some((line) => line.caughtUp > 0) &&
            poor.system.progression.awards.length === 1 &&
            poor.system.progression.awards[0].reason === "SMOKE-award",
          JSON.stringify({
            rich: rich.system.details.xp,
            poor: poor.system.details.xp,
            lines: report?.lines,
            log: poor.system.progression.awards,
          }),
        );
        await rich.delete();
        await poor.delete();

        // pr5. taking the level the XP entitles you to (pg 5), and only ever upward.
        await actor.update({ "system.details.xp": 3000, "system.details.level": 1 });
        await settle();
        const levelled = await api.applyLevel(actor, actor.system);
        await settle();
        const again = await api.applyLevel(actor, actor.system);
        step(
          "taking a level moves to the XP-earned level and then has nothing left to take",
          levelled === 4 && actor.system.details.level === 4 && again === null,
          JSON.stringify({ levelled, level: actor.system.details.level, again }),
        );

        // pr6. skill points. Level 5 with Intelligence 6 grants 5 (pg 5-6 table); this
        //      spends 3 of them and then proves the budget is enforced, not decorative.
        await actor.update({
          "system.details.level": 5,
          "system.abilities.intelligence.value": 6,
          "system.skills.guns.points": 0,
          "system.progression.spends": [],
        });
        await settle();
        const gunsBefore = actor.system.derived.skillBonuses.guns;
        await api.spendSkillPoints(actor, actor.system, "guns", 3, "SMOKE");
        await settle();
        const overspent = await api.spendSkillPoints(actor, actor.system, "guns", 5);
        await settle();
        const budget = api.budgetFor(actor.system);
        step(
          "skill points spend, land on the skill, and cannot be overspent",
          actor.system.skills.guns.points === 3 &&
            actor.system.derived.skillBonuses.guns === gunsBefore + 3 &&
            actor.system.progression.spends.length === 1 &&
            overspent === false &&
            budget.skillTotal === 5 &&
            budget.skillSpent === 3 &&
            budget.skillRemaining === 2,
          JSON.stringify({ points: actor.system.skills.guns.points, budget }),
        );

        // pr7. undoing a spend hands the points back on both sides of the ledger.
        await api.undoSpend(actor, actor.system, 0);
        await settle();
        step(
          "undoing a skill spend removes the row and the points",
          actor.system.skills.guns.points === 0 &&
            actor.system.progression.spends.length === 0 &&
            actor.system.derived.skillBonuses.guns === gunsBefore,
          JSON.stringify({
            points: actor.system.skills.guns.points,
            spends: actor.system.progression.spends,
          }),
        );

        // pr8. a perk point spent on an ability score (pg 5), and undone.
        await actor.update({ "system.abilities.strength.value": 5 });
        await settle();
        await api.spendPerkPoint(actor, actor.system, { kind: "ability", ability: "strength" });
        await settle();
        const raised = actor.system.abilities.strength.value;
        await api.undoSpend(actor, actor.system, actor.system.progression.spends.length - 1);
        await settle();
        step(
          "a perk point raises an ability score by 1 and the undo puts it back",
          raised === 6 &&
            actor.system.abilities.strength.value === 5 &&
            actor.system.progression.spends.length === 0,
          JSON.stringify({ raised, now: actor.system.abilities.strength.value }),
        );

        // pr9. which skill a magazine raises (pg 88 table, read from the page image).
        //      The printed title is authoritative; a typographic apostrophe must not
        //      break it; effect text is the fallback; anything else is refused.
        step(
          "magazines resolve by printed title, by curly apostrophe, and by effect text",
          api.magazineSkill("¡La Fantoma!") === "sneak" &&
            api.magazineSkill("Fixin’ Things") === "crafting" &&
            api.magazineSkill("Tæles of Chivalrie") === "meleeWeapons" &&
            api.magazineSkill("SMOKE-Nonsense") === null &&
            api.magazineSkill("SMOKE-Nonsense", "Your Guns skill bonus increases by 1 until you rest.") ===
              "guns",
          JSON.stringify({
            fantoma: api.magazineSkill("¡La Fantoma!"),
            fixin: api.magazineSkill("Fixin’ Things"),
            unknown: api.magazineSkill("SMOKE-Nonsense"),
          }),
        );

        // pr10. read time (pg 88): 5 minus the Intelligence modifier, and the 6 AP
        //       branch only once that reaches 0. A negative modifier makes it longer,
        //       which is what the printed subtraction does.
        step(
          "reading takes 5 minus INT modifier in minutes, or 6 AP once that hits 0",
          api.magazineReadTime(1).minutes === 4 &&
            api.magazineReadTime(1).apCost === null &&
            api.magazineReadTime(5).minutes === 0 &&
            api.magazineReadTime(5).apCost === 6 &&
            api.magazineReadTime(-2).minutes === 7,
          JSON.stringify({
            plus1: api.magazineReadTime(1),
            plus5: api.magazineReadTime(5),
            minus2: api.magazineReadTime(-2),
          }),
        );

        // pr11. reading an issue. The item is SMOKE- named, so it resolves through the
        //       effect-text fallback rather than the printed title — which is also how
        //       a homebrew magazine would behave.
        await actor.update({ "system.progression.magazines": [] });
        await actor.createEmbeddedDocuments("Item", [
          {
            name: "SMOKE-Milsurp",
            type: "aid",
            system: {
              aidType: "magazine",
              quantity: 6,
              load: 2,
              apCost: 6,
              effect: "Your Guns skill bonus increases by 1 until you rest.",
            },
          },
        ]);
        await settle();
        const mag = actor.items.getName("SMOKE-Milsurp");
        const beforeRead = actor.system.derived.skillBonuses.guns;
        await api.readMagazine(actor, actor.system, mag, 1);
        await settle();
        step(
          "reading an issue grants +1 to its skill until you rest and consumes the copy",
          actor.system.derived.skillBonuses.guns === beforeRead + 1 &&
            actor.system.derived.magazines.untilRest.guns === 1 &&
            actor.system.derived.magazines.permanent.guns === 0 &&
            actor.items.getName("SMOKE-Milsurp").system.quantity === 5 &&
            actor.system.progression.magazines.length === 1 &&
            actor.system.progression.magazines[0].issues === "1",
          JSON.stringify({
            guns: actor.system.derived.skillBonuses.guns,
            magazines: actor.system.derived.magazines,
            ledger: actor.system.progression.magazines,
          }),
        );

        // pr12. "Once you read an issue of a skill magazine you can no longer gain its
        //       benefits" — the same issue again is worth nothing, and does not stack.
        const reread = await api.readMagazine(actor, actor.system, actor.items.getName("SMOKE-Milsurp"), 1);
        await settle();
        step(
          "re-reading a known issue gains nothing but still uses up the copy",
          reread !== null &&
            reread.alreadyRead === true &&
            actor.system.derived.magazines.untilRest.guns === 1 &&
            actor.system.progression.magazines[0].issues === "1" &&
            actor.items.getName("SMOKE-Milsurp").system.quantity === 4,
          JSON.stringify({
            report: reread,
            magazines: actor.system.derived.magazines,
            qty: actor.items.getName("SMOKE-Milsurp").system.quantity,
          }),
        );

        // pr13. five different issues make it permanent (pg 88). The fifth read is
        //       ruled to grant both bonuses — the table effect and the permanent one —
        //       because the book prints them as two sentences with two triggers.
        let permanent = null;
        for (const issue of [2, 3, 4, 5]) {
          permanent = await api.readMagazine(
            actor,
            actor.system,
            actor.items.getName("SMOKE-Milsurp"),
            issue,
          );
        }
        await settle();
        step(
          "five different issues grant a permanent +1, on top of that issue's until-rest +1",
          permanent !== null &&
            permanent.gainedPermanent === true &&
            permanent.issueCount === 5 &&
            actor.system.derived.magazines.permanent.guns === 1 &&
            actor.system.derived.magazines.untilRest.guns === 1 &&
            actor.system.derived.magazines.total.guns === 2 &&
            actor.system.derived.skillBonuses.guns === beforeRead + 2,
          JSON.stringify({
            report: permanent,
            magazines: actor.system.derived.magazines,
            guns: actor.system.derived.skillBonuses.guns,
          }),
        );

        // pr14. resting drops the until-rest half and leaves the permanent half alone.
        await api.clearMagazineBonuses(actor, actor.system);
        await settle();
        step(
          "a rest ends the until-rest bonus and never touches the permanent one",
          actor.system.derived.magazines.untilRest.guns === 0 &&
            actor.system.derived.magazines.permanent.guns === 1 &&
            actor.system.derived.skillBonuses.guns === beforeRead + 1,
          JSON.stringify({
            magazines: actor.system.derived.magazines,
            guns: actor.system.derived.skillBonuses.guns,
          }),
        );

        // pr15. Barter's Discount as arithmetic (pg 22): a percentage equal to the
        //       Barter skill bonus, rounded down, and never a surcharge.
        const quote = api.quotePurchase(250, 500, 7, true);
        const negative = api.quotePurchase(250, 500, -3, true);
        step(
          "the Discount is a percentage equal to the Barter bonus, rounded down and floored at 0",
          quote.discountPercent === 7 &&
            quote.discount === 17 &&
            quote.price === 233 &&
            negative.discountPercent === 0 &&
            negative.price === 250,
          JSON.stringify({ quote, negative }),
        );

        // pr16. the purchase itself: caps come off at the discounted price, and the
        //       Discount is spent. Barter is pushed to a bonus that makes the discount
        //       a real number rather than a rounding artefact.
        await actor.update({
          "system.currency.caps": 300,
          "system.progression.discountUsed": false,
          "system.abilities.charisma.value": 5,
          "system.abilities.luck.value": 5,
          "system.skills.barter.points": 7,
        });
        await settle();
        const barterBonus = actor.system.derived.skillBonuses.barter;
        const expected = api.quotePurchase(250, 300, barterBonus, true);
        const bought = await api.purchase(actor, actor.system, {
          price: 250,
          label: "SMOKE-goods",
          useDiscount: true,
        });
        await settle();
        step(
          "a purchase spends caps at the discounted price and uses up the Discount",
          // Relative to the live Barter bonus rather than a hard 67: earlier steps in
          // this suite attach effects to `actor`, and pr15 already pins the arithmetic.
          bought === true &&
            expected.discountPercent === barterBonus &&
            expected.discount > 0 &&
            actor.system.currency.caps === expected.remaining &&
            actor.system.progression.discountUsed === true,
          JSON.stringify({
            caps: actor.system.currency.caps,
            expected,
            barterBonus,
            used: actor.system.progression.discountUsed,
          }),
        );

        // pr17. the Discount is once per 8-hour rest, and caps do not go negative.
        const secondDiscount = await api.purchase(actor, actor.system, {
          price: 1,
          label: "SMOKE-again",
          useDiscount: true,
        });
        const capsBefore = actor.system.currency.caps;
        const unaffordable = await api.purchase(actor, actor.system, {
          price: 999999,
          label: "SMOKE-fusion-core",
          useDiscount: false,
        });
        await settle();
        step(
          "the Discount refuses a second use, and a purchase beyond your caps is refused",
          secondDiscount === false &&
            unaffordable === false &&
            actor.system.currency.caps === capsBefore,
          JSON.stringify({ secondDiscount, unaffordable, caps: actor.system.currency.caps }),
        );

        // pr18. a rest recharges the Discount only at the 8 hours pg 22 prints, which
        //       is longer than this system's 6-hour long rest (pg 119).
        // By here the fixture's 6 copies are spent: issue 1, the pr12 re-read
        // (which asserts that a re-read consumes a copy), and issues 2-5. That
        // emptiness silently broke this step for a whole run — reading issue 6
        // was refused with the "empty" warning, untilRest never set, and the
        // failure read as a rest bug. First pin the refusal as coverage, then
        // restock one copy for the read this step is actually about.
        const spentMag = actor.items.getName("SMOKE-Milsurp");
        const refusedEmpty = await api.readMagazine(actor, actor.system, spentMag, 6);
        step(
          "an empty magazine refuses to be read, and consumes nothing",
          refusedEmpty === null && spentMag.system.quantity === 0,
          JSON.stringify({ refusedEmpty, qty: spentMag.system.quantity }),
        );
        await spentMag.update({ "system.quantity": 1 });
        await api.readMagazine(actor, actor.system, actor.items.getName("SMOKE-Milsurp"), 6);
        await settle();
        const shortRest = await api.restProgression(actor, actor.system, 6);
        await settle();
        const shortStillUsed = actor.system.progression.discountUsed;
        const longRest = await api.restProgression(actor, actor.system, 8);
        await settle();
        step(
          "a 6-hour rest clears magazine bonuses but not the Discount; 8 hours clears both",
          shortRest.magazines === 1 &&
            shortRest.discount === false &&
            shortStillUsed === true &&
            longRest.discount === true &&
            actor.system.progression.discountUsed === false &&
            actor.system.derived.magazines.untilRest.guns === 0 &&
            actor.system.derived.magazines.permanent.guns === 1,
          JSON.stringify({
            shortRest,
            longRest,
            used: actor.system.progression.discountUsed,
            magazines: actor.system.derived.magazines,
          }),
        );

        await actor.items.getName("SMOKE-Milsurp").delete();

        // pr19. an actor saved before this release: a stored source with no
        //       `system.progression` key at all. DataModel must fill the four
        //       defaults on load and every derived number must still come out.
        //       This is the migration question (roadmap item 20) as an assertion.
        //
        //       It cannot be staged with `{"system.-=progression": null}`.
        //       `progression` is a required SchemaField, and v14 refuses to
        //       delete a required field: the update is rejected inside
        //       ClientDatabaseBackend##preUpdateDocumentArray with
        //       "progression: may not be undefined", never leaves the client,
        //       and leaves the key exactly where it was — so this step used to
        //       assert against an ordinary actor and pass vacuously, while the
        //       rejection was the suite's one unexplained console error. The
        //       modern `new ForcedDeletion()` spelling is refused identically.
        //       An old actor is a *source* missing the key, so build that source
        //       and hand it to the document class, which is precisely what the
        //       client does when the server sends it an old world's actor.
        const seed = await ActorClass.create({ name: `SMOKE-Legacy-${stamp}`, type: "character" });
        await seed.update({ "system.details.level": 5, "system.abilities.intelligence.value": 6 });
        await settle();
        const aged = seed.toObject();
        delete aged._id;
        delete aged.system.progression;
        const legacy = new ActorClass(aged);
        await seed.delete();
        step(
          "an actor with no stored progression data loads with sane defaults and full derived values",
          Array.isArray(legacy.system.progression.spends) &&
            legacy.system.progression.spends.length === 0 &&
            legacy.system.progression.awards.length === 0 &&
            legacy.system.progression.magazines.length === 0 &&
            legacy.system.progression.discountUsed === false &&
            legacy.system.derived.magazines.total.guns === 0 &&
            Number.isFinite(legacy.system.derived.skillBonuses.guns) &&
            api.budgetFor(legacy.system).skillTotal === 5 &&
            api.budgetFor(legacy.system).skillSpent === 0,
          JSON.stringify({
            progression: legacy.system.progression,
            budget: api.budgetFor(legacy.system),
            magazines: legacy.system.derived.magazines,
          }),
        );
        // `legacy` was never persisted — there is nothing to delete.

        // pr20. the progression panel renders on a real sheet without throwing, and
        //       shows the ledger it was given. `until` rather than a fixed wait: the
        //       sheet renders asynchronously and the partial is registered at init.
        await actor.sheet.render(true);
        const panelShown = await until(
          () => document.querySelector(".fallout-ttrpg .panel.progression") !== null,
        );
        step(
          "the progression panel renders on the character sheet",
          panelShown === true,
          JSON.stringify({ found: panelShown }),
        );
        await actor.update({ "system.progression.magazines": [], "system.progression.awards": [] });
      }

      // ==================================================== release 8: movement
      {
        // Smoke steps for the movement chapter: travel pace, climbing, swimming,
        // diving, jumping, sprinting, falling and suffocating (pg 116-118).
        //
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
      }

      // ==================================================== release 8: stealth
      {
        // Smoke steps for hiding, detection and Surprise (pg 24, 125, 127, 128), and
        // for the remaining pg 126 combat actions — Dodge, Shove, Take Cover, Search,
        // Stand, Stow and Equip (pg 126-127).
        //
        // block. `ActorClass`, `stamp`, `api`, `actor`, `step`, `settle` and `until`
        // all come from the surrounding scope. Every document created here is SMOKE-
        // prefixed and deleted at the end — nothing inherits state from an earlier
        // block and nothing is left behind for a later one, which is what broke this
        // suite twice before.
        //
        // Step letters 8ka-8kv are claimed here; 8h/8i/8j are left free for the other
        // briefs landing in this release.
        //
        // Required on globalThis.falloutTTRPG before these run:
        //   rules  — beatsPassiveSense, hideDC, hideOutcomes, canHide, hidingBroken,
        //            detectionOutcome, surpriseOutcomes, canSneakAttack,
        //            revealedByAttacking, passiveSneak, HIDE_AP_COST, SEARCH_AP_COST,
        //            COMBAT_ACTION_AP, dodgeBenefitLost, dodgeApplies, shoveSucceeds,
        //            bestShoveDefense, shoveAllowed, weaponsDroppedByEquipping
        //   actions — hide, hiddenState, revealHidden, breakHidingOnCover,
        //             revealAfterAttacking, searchFor, determineSurprise, isSurprised,
        //             endSurprise, sneakAttackPosture, dodge, dodgeState, useDodgeMove,
        //             endDodge, shove, takeCover, takingCover, leaveCover, standUp,
        //             stowWeapon, equipWeapon, heldWeapons, passiveSenseOf,
        //             cannotSpendApToMove

        // The suite's own formulaOf() reads the *last* message; several of these actions
        // post two rolls (a Search and the contested Sneak, a Shove and its defence), so
        // these walk back rather than counting positions.
        const stealthFormulaBack = (back) =>
          String(game.messages.contents.at(back)?.rolls?.[0]?.formula ?? "").replace(/\s+/g, "");
        const stealthLastD20 = (skip = 0) => {
          let seen = 0;
          for (let back = -1; back >= -8; back -= 1) {
            const formula = stealthFormulaBack(back);
            if (!formula.includes("d20")) continue;
            if (seen === skip) return formula;
            seen += 1;
          }
          return "";
        };

        // Two purpose-built NPCs: a guard to be hidden from, and a body to be shoved.
        // Built here and deleted at the end of the block.
        const guard = await ActorClass.create({ name: `SMOKE-Guard-${stamp}`, type: "npc" });
        await guard.update({ "system.abilities.perception.value": 6 });
        const brute = await ActorClass.create({ name: `SMOKE-Brute-${stamp}`, type: "npc" });
        await brute.update({ "system.abilities.agility.value": 8, "system.skills.unarmed.points": 0 });
        await settle();
        const guardSense = api.passiveSenseOf(guard);

        // 8ka. the comparison the book states three different ways, settled one way.
        //      pg 21 "higher than", pg 127 "lower passive sense", pg 116 "lower than"
        //      against pg 24's "equal to or greater than" — three to one, and a tie
        //      is therefore a detection.
        step(
          "a Sneak total must exceed passive sense, so a tie detects (pg 21/116/127 over pg 24)",
          api.beatsPassiveSense(13, 12) === true &&
            api.beatsPassiveSense(12, 12) === false &&
            api.beatsPassiveSense(11, 12) === false,
          JSON.stringify({
            over: api.beatsPassiveSense(13, 12),
            tie: api.beatsPassiveSense(12, 12),
            under: api.beatsPassiveSense(11, 12),
          }),
        );

        // 8kb. pg 127's DC is plural and gives one number; the same entry resolves it
        //      per enemy, so the single DC is the highest score in the room — and an
        //      empty room has no DC rather than an invented one
        step(
          "the Hide DC is the highest nearby passive sense, and null with no observers",
          api.hideDC([12, 15, 9]) === 15 && api.hideDC([]) === null,
          JSON.stringify({ dc: api.hideDC([12, 15, 9]), empty: api.hideDC([]) }),
        );

        // 8kc. and one roll resolves per observer: hidden from the two, seen by the third
        const outcomes = api.hideOutcomes(14, [
          { passiveSense: 12 },
          { passiveSense: 13 },
          { passiveSense: 14 },
        ]);
        step(
          "one Sneak roll hides from some observers and not others (pg 127)",
          outcomes.filter((o) => o.hidden).length === 2 && outcomes[2].hidden === false,
          JSON.stringify(outcomes.map((o) => [o.passiveSense, o.hidden])),
        );

        // 8kd. pg 127 requires heavy obscurement or full cover; pg 24's looser "if you
        //      have cover" is the reading this system declines, because taking it would
        //      leave the pg 127 sentence doing nothing. Invisible qualifies as printed
        //      (pg 134: "for the purpose of hiding, the creature is heavily obscured").
        const conceal = (over) => ({
          cover: "none",
          heavilyObscured: false,
          invisible: false,
          ...over,
        });
        step(
          "hiding needs full cover, heavy obscurement or invisibility — half cover is not enough",
          api.canHide(conceal({ cover: "total" })) === true &&
            api.canHide(conceal({ heavilyObscured: true })) === true &&
            api.canHide(conceal({ invisible: true })) === true &&
            api.canHide(conceal({ cover: "threeQuarters" })) === false &&
            api.canHide(conceal({})) === false,
          JSON.stringify({
            total: api.canHide(conceal({ cover: "total" })),
            obscured: api.canHide(conceal({ heavilyObscured: true })),
            invisible: api.canHide(conceal({ invisible: true })),
            threeQuarters: api.canHide(conceal({ cover: "threeQuarters" })),
          }),
        );

        // 8ke. the live Hide action: refuses without concealment, and refuses to invent
        //      a DC when nothing is targeted and none is given
        const noConcealment = await api.hide(actor, actor.system);
        const noObservers = await api.hide(actor, actor.system, {
          concealment: conceal({ cover: "total" }),
        });
        step(
          "Hide refuses without concealment, and without any enemy or DC to roll against",
          noConcealment === null && noObservers === null && api.hiddenState(actor) === null,
          JSON.stringify({ noConcealment, noObservers }),
        );

        // 8kf. a successful Hide records the total a later Search has to beat, and the
        //      per-observer lists (pg 127). DC forced low so the roll cannot flake.
        const hidReport = await api.hide(actor, actor.system, {
          concealment: conceal({ cover: "total" }),
          dc: -100,
        });
        await settle();
        const hidden = api.hiddenState(actor);
        step(
          "a landed Hide costs 6 AP and records the Sneak total for later contests",
          hidReport.hidden === true &&
            hidReport.ap === 6 &&
            hidReport.ap === api.COMBAT_ACTION_AP.hide &&
            hidden !== null &&
            hidden.sneakTotal === hidReport.total,
          JSON.stringify({ ap: hidReport.ap, total: hidReport.total, hidden }),
        );

        // 8kg. Hide is a Sneak *skill* check, so a skill-scoped advantage grant reaches
        //      it. Dice, not totals — the rule is about advantage.
        const [sneakAdv] = await actor.createEmbeddedDocuments("ActiveEffect", [
          {
            name: "SMOKE-SneakAdvantage",
            type: "base",
            system: {
              changes: [
                {
                  key: "system.bonuses.advantage.skills.sneak",
                  type: "add",
                  value: 1,
                  phase: "initial",
                  priority: 20,
                },
              ],
            },
          },
        ]);
        await settle();
        await api.hide(actor, actor.system, { concealment: conceal({ cover: "total" }), dc: -100 });
        await settle();
        step(
          "skill:sneak advantage reaches the Hide check — 2d20kh",
          stealthLastD20().includes("2d20kh"),
          JSON.stringify({ formula: stealthLastD20() }),
        );
        await sneakAdv.delete();
        await settle();

        // 8kh. pg 127 ends hiding on leaving full cover — and names *only* cover, while
        //      the requirement to hide also accepts heavy obscurement. The asymmetry is
        //      printed, so it is preserved: obscurement-hiding survives the same press.
        await api.hide(actor, actor.system, { concealment: conceal({ cover: "total" }), dc: -100 });
        await settle();
        const brokeOnCover = await api.breakHidingOnCover(actor, "none");
        await settle();
        const afterCover = api.hiddenState(actor);
        await api.hide(actor, actor.system, { concealment: conceal({ heavilyObscured: true }), dc: -100 });
        await settle();
        const brokeOnObscurement = await api.breakHidingOnCover(actor, "none");
        await settle();
        step(
          "leaving full cover ends hiding; hiding by obscurement survives it, as printed (pg 127)",
          brokeOnCover === true &&
            afterCover === null &&
            brokeOnObscurement === false &&
            api.hiddenState(actor) !== null,
          JSON.stringify({
            brokeOnCover,
            afterCover,
            brokeOnObscurement,
            stillHidden: api.hiddenState(actor) !== null,
          }),
        );

        // 8ki. attacking reveals you — established only by the exception the Silencer
        //      mod carves out of it (pg 77), the one sentence in the book on the subject
        const silenced = await api.revealAfterAttacking(actor, true);
        const stillHiddenAfterSilenced = api.hiddenState(actor) !== null;
        const loud = await api.revealAfterAttacking(actor, false);
        await settle();
        step(
          "a silenced attack keeps the hiding, an ordinary one loses it (pg 77, by exception)",
          silenced === "targetOnly" &&
            stillHiddenAfterSilenced === true &&
            loud === "everyone" &&
            api.hiddenState(actor) === null &&
            api.revealedByAttacking(false) === "everyone",
          JSON.stringify({ silenced, stillHiddenAfterSilenced, loud }),
        );

        // 8kj. the pg 24 contest, and the tie the book never addresses: "their total is
        //      higher" and "your total is higher" are the only branches printed, so a
        //      tie leaves the hider where they already were
        step(
          "a detection contest tie leaves the hider hidden (pg 24 addresses neither branch)",
          api.detectionOutcome(15, 14) === "detected" &&
            api.detectionOutcome(14, 14) === "stillHidden" &&
            api.detectionOutcome(13, 14) === "stillHidden",
          JSON.stringify({
            higher: api.detectionOutcome(15, 14),
            tie: api.detectionOutcome(14, 14),
            lower: api.detectionOutcome(13, 14),
          }),
        );

        // 8kk. Search is an active *ability* check (pg 21's distinction), so a Perception
        //      category grant reaches it. Dice again, not totals.
        const [perAdv] = await actor.createEmbeddedDocuments("ActiveEffect", [
          {
            name: "SMOKE-PerceptionAdvantage",
            type: "base",
            system: {
              changes: [
                {
                  key: "system.bonuses.advantage.perception",
                  type: "add",
                  value: 1,
                  phase: "initial",
                  priority: 20,
                },
              ],
            },
          },
        ]);
        await settle();
        const searchReport = await api.searchFor(actor, actor.system);
        await settle();
        step(
          "Search is a Perception ability check at 3 AP, and takes perception advantage — 2d20kh",
          searchReport.ap === 3 &&
            searchReport.ap === api.COMBAT_ACTION_AP.search &&
            searchReport.contest === null &&
            stealthLastD20().includes("2d20kh"),
          JSON.stringify({ ap: searchReport.ap, formula: stealthLastD20() }),
        );
        await perAdv.delete();
        await settle();

        // 8kl. and a Search aimed at a hidden creature runs pg 24's contest, both sides
        //      rolling fresh. The guard hides on a forced DC so there is something to find.
        await api.hide(guard, guard.system, { concealment: conceal({ cover: "total" }), dc: -100 });
        await settle();
        const contested = await api.searchFor(actor, actor.system, guard);
        await settle();
        step(
          "Search against a hidden creature contests a fresh Perception check with a fresh Sneak check",
          contested.contest !== null &&
            contested.contest.target === guard.name &&
            contested.contest.detected === contested.total > contested.contest.hiderTotal &&
            (contested.contest.detected ? api.hiddenState(guard) === null : api.hiddenState(guard) !== null),
          JSON.stringify(contested),
        );
        await api.revealHidden(guard, null);
        await settle();

        // 8km. Surprise, pg 125: "If neither side tries to be stealthy, they
        //      automatically notice each other" — no hiders, no surprise, whatever the
        //      passive senses are
        step(
          "nobody hiding means nobody surprised (pg 125)",
          api.surpriseOutcomes([], [{ passiveSense: 1 }])[0].surprised === false,
          JSON.stringify(api.surpriseOutcomes([], [{ passiveSense: 1 }])),
        );

        // 8kn. and a creature that notices *any* one threat is in the fight. The book
        //      says "doesn't notice a threat" and never disambiguates; both tallies are
        //      returned so the ruling stays auditable.
        const surprise = api.surpriseOutcomes([30, 5], [{ passiveSense: 12 }]);
        step(
          "noticing one threat of two is enough not to be surprised, and both tallies are reported",
          surprise[0].surprised === false &&
            surprise[0].missed.length === 1 &&
            surprise[0].noticed.length === 1,
          JSON.stringify(surprise),
        );

        // 8ko. the live procedure: passive sense finally consumed by something, seven
        //      releases after it was first computed. The +100 Sneak bonus is there so
        //      the step asserts the *procedure* rather than a die roll.
        const [sneakFloor] = await actor.createEmbeddedDocuments("ActiveEffect", [
          {
            name: "SMOKE-SneakFloor",
            type: "base",
            system: {
              changes: [
                {
                  key: "system.bonuses.skills.sneak",
                  type: "add",
                  value: 100,
                  phase: "initial",
                  priority: 20,
                },
              ],
            },
          },
        ]);
        await settle();
        const surpriseReport = await api.determineSurprise([actor], [guard]);
        await settle();
        const guardSurprised = api.isSurprised(guard);
        step(
          "determineSurprise compares Sneak against each opposing creature's passive sense (pg 125)",
          surpriseReport !== null &&
            surpriseReport.hiders.length === 1 &&
            surpriseReport.hiders[0].rolled === true &&
            guardSurprised !== null &&
            guardSurprised.passiveSense === guardSense &&
            surpriseReport.surprised.includes(guard.name),
          JSON.stringify({ surpriseReport, guardSurprised, guardSense }),
        );

        // 8kp. THE headline: hidden is not unaware. pg 127 says enemies "still know your
        //      general location", so hiding buys pg 24's advantage and nothing more;
        //      pg 128's sneak attack additionally needs unawareness, and Surprise is the
        //      book's only mechanism for it. This is what the hand-set `sneak` flag on
        //      AttackOptions has never been connected to.
        await api.endSurprise(guard, false);
        await api.revealHidden(actor, null);
        await settle();
        await api.hide(actor, actor.system, {
          concealment: conceal({ cover: "total" }),
          observers: [guard],
          dc: -100,
        });
        await settle();
        const hiddenOnly = api.sneakAttackPosture(actor, guard);
        await api.determineSurprise([actor], [guard]);
        await settle();
        const hiddenAndUnaware = api.sneakAttackPosture(actor, guard);
        step(
          "hiding alone is advantage (pg 24); hiding plus an unaware target is a sneak attack (pg 128)",
          hiddenOnly.advantage === true &&
            hiddenOnly.sneakAttack === false &&
            hiddenAndUnaware.advantage === true &&
            hiddenAndUnaware.sneakAttack === true &&
            hiddenAndUnaware.targetSurprised === true &&
            api.canSneakAttack(conceal({ cover: "total" }), false) === false &&
            api.canSneakAttack(conceal({ cover: "total" }), true) === true &&
            api.canSneakAttack(conceal({}), true) === false,
          JSON.stringify({ hiddenOnly, hiddenAndUnaware }),
        );
        await sneakFloor.delete();
        await api.endSurprise(guard, false);
        await api.revealHidden(actor, null);
        await settle();

        // 8kq. the pg 126 table, read off a rendered page image. Every row this brief
        //      added, checked against the printed number rather than the patch notes.
        step(
          "the pg 126 AP costs: Dodge 6, Hide 6, Search 3, Shove 4, Stand 5, Stow 3, Equip 3, Take Cover 3",
          api.COMBAT_ACTION_AP.dodge === 6 &&
            api.COMBAT_ACTION_AP.hide === 6 &&
            api.COMBAT_ACTION_AP.search === 3 &&
            api.COMBAT_ACTION_AP.shove === 4 &&
            api.COMBAT_ACTION_AP.standUpFromProne === 5 &&
            api.COMBAT_ACTION_AP.stowWeapon === 3 &&
            api.COMBAT_ACTION_AP.equipWeapon === 3 &&
            api.COMBAT_ACTION_AP.takeCover === 3 &&
            api.COMBAT_ACTION_AP.moveFiveFeet === 1 &&
            api.COMBAT_ACTION_AP.attack === null,
          JSON.stringify(api.COMBAT_ACTION_AP),
        );

        // 8kr. Dodge: a marker, because the disadvantage lands on an attack roll made
        //      from somebody else's sheet. The 15-foot reactive move is free and spends
        //      once.
        const dodgeReport = await api.dodge(actor, actor.system);
        await settle();
        const movedOnce = await api.useDodgeMove(actor);
        await settle();
        const movedTwice = await api.useDodgeMove(actor);
        step(
          "Dodge costs 6 AP and grants one free 15-foot reactive move, spendable exactly once",
          dodgeReport.ap === 6 &&
            dodgeReport.moveFeet === 15 &&
            dodgeReport.suppressed === false &&
            movedOnce === true &&
            movedTwice === false &&
            api.dodgeState(actor).used === true,
          JSON.stringify({ dodgeReport, movedOnce, movedTwice, state: api.dodgeState(actor) }),
        );

        // 8ks. "You lose this benefit if you are dying or you cannot spend AP to move"
        //      (pg 126) — which is Grappled (pg 134) or Restrained (pg 135), and nothing
        //      else in the book. Reported, not refused: the 6 AP is spent either way.
        await api.endDodge(actor, false);
        await actor.toggleStatusEffect("grappled", { active: true });
        await settle();
        const dodgeSuppressed = await api.dodge(actor, actor.system);
        await settle();
        step(
          "a grappled creature's Dodge is reported as doing nothing, and still costs its AP",
          api.cannotSpendApToMove(actor) === true &&
            dodgeSuppressed.suppressed === true &&
            dodgeSuppressed.ap === 6 &&
            api.dodgeBenefitLost(false, true) === true &&
            api.dodgeBenefitLost(true, false) === true &&
            api.dodgeBenefitLost(false, false) === false &&
            api.dodgeApplies(true, true) === false,
          JSON.stringify({ dodgeSuppressed, lost: api.dodgeBenefitLost(false, true) }),
        );
        await actor.toggleStatusEffect("grappled", { active: false });
        await api.endDodge(actor, false);
        await settle();

        // 8kt. Shove — the last opposed roll in the book. v2.1 rewrote Grapple and
        //      Escape into flat DCs and left this one contested, which is also why it is
        //      the only one of the three with no "or roll a 20" rider.
        step(
          "a Shove tie is a loss for the shover: pg 127 requires you to *win* the contest",
          api.shoveSucceeds(15, 14) === true &&
            api.shoveSucceeds(14, 14) === false &&
            api.bestShoveDefense(2, 5) === "agility" &&
            api.bestShoveDefense(5, 2) === "unarmed" &&
            api.shoveAllowed(false, true) === false &&
            api.shoveAllowed(true, false) === false,
          JSON.stringify({
            win: api.shoveSucceeds(15, 14),
            tie: api.shoveSucceeds(14, 14),
            best: api.bestShoveDefense(2, 5),
          }),
        );

        // 8ku. and the live contest, with the defender's *chosen* side taking advantage:
        //      an Agility defence answers to an agility grant, which is dice not totals
        const [agiAdv] = await brute.createEmbeddedDocuments("ActiveEffect", [
          {
            name: "SMOKE-AgilityAdvantage",
            type: "base",
            system: {
              changes: [
                {
                  key: "system.bonuses.advantage.agility",
                  type: "add",
                  value: 1,
                  phase: "initial",
                  priority: 20,
                },
              ],
            },
          },
        ]);
        await settle();
        const shoved = await api.shove(actor, actor.system, brute, {
          defense: "agility",
          outcome: "prone",
        });
        await settle();
        step(
          "Shove costs 4 AP, both sides roll, and the defender's Agility check takes agility advantage — 2d20kh",
          shoved.ap === 4 &&
            shoved.defense === "agility" &&
            shoved.succeeded === shoved.shoverTotal > shoved.targetTotal &&
            stealthLastD20().includes("2d20kh") &&
            brute.statuses.has("prone") === shoved.succeeded,
          JSON.stringify({ shoved, defenceFormula: stealthLastD20(), shoverFormula: stealthLastD20(1) }),
        );
        await agiAdv.delete();

        // 8kv. Take Cover (3 AP, pg 127) — the caller src/rules/cover.ts was built for.
        //      Gated on having only half or three-quarters cover, and dropped by
        //      attacking, which is a trigger and not a clock.
        const fromNone = await api.takeCover(actor, "none");
        const fromHalf = await api.takeCover(actor, "half");
        await settle();
        const covered = api.takingCover(actor);
        await api.leaveCover(actor, false);
        await settle();
        step(
          "Take Cover upgrades half cover to full for 3 AP, refuses from none, and ends on attacking",
          fromNone === null &&
            fromHalf.ap === 3 &&
            fromHalf.to === "total" &&
            covered.from === "half" &&
            api.takingCover(actor) === null,
          JSON.stringify({ fromNone, fromHalf, covered }),
        );

        // 8kw. Stand up from Prone (5 AP, pg 126-127): the printed way out of pg 135's
        //      condition, and the whole of the action
        await brute.toggleStatusEffect("prone", { active: true });
        await settle();
        const stood = await api.standUp(brute);
        await settle();
        const standAgain = await api.standUp(brute);
        step(
          "Stand up clears prone for 5 AP, and refuses when there is nothing to stand up from",
          stood === true && brute.statuses.has("prone") === false && standAgain === false,
          JSON.stringify({ stood, standAgain, prone: brute.statuses.has("prone") }),
        );

        // 8kx. Stow and Equip (3 AP each): the two lists the pair moves an item between.
        //      The pg 126 drop clause is computed and reported, never applied — there is
        //      no hands resource in this system or in 136 pages of book.
        const [shiv] = await actor.createEmbeddedDocuments("Item", [
          { name: "SMOKE-Shiv", type: "weapon", system: { weaponType: "bladed", equipped: false } },
        ]);
        const [pipe] = await actor.createEmbeddedDocuments("Item", [
          { name: "SMOKE-Pipe", type: "weapon", system: { weaponType: "blunt", equipped: false } },
        ]);
        await settle();
        await api.equipWeapon(actor, shiv);
        await settle();
        const heldAfterFirst = api.heldWeapons(actor).map((item) => item.name);
        const wouldDrop = api.weaponsDroppedByEquipping([shiv], pipe).map((item) => item.name);
        await api.stowWeapon(actor, shiv);
        await settle();
        step(
          "Equip and Stow flip the held flag, and the pg 126 drop clause is computed but not applied",
          heldAfterFirst.includes("SMOKE-Shiv") &&
            wouldDrop.length === 1 &&
            wouldDrop[0] === "SMOKE-Shiv" &&
            !api.heldWeapons(actor).some((item) => item.name === "SMOKE-Shiv"),
          JSON.stringify({ heldAfterFirst, wouldDrop, held: api.heldWeapons(actor).map((i) => i.name) }),
        );
        await shiv.delete();
        await pipe.delete();

        // 8ky. Passive Sneak (pg 116) — the second consumer of Group Sneak, and the
        //      reason that score has existed on the sheet with nothing reading it
        step(
          "Passive Sneak is 15/12/10 by pace plus the party's Group Sneak (pg 116)",
          api.passiveSneak("slow", 0) === 15 &&
            api.passiveSneak("normal", 0) === 12 &&
            api.passiveSneak("fast", 0) === 10 &&
            api.passiveSneak("normal", 3) === 15,
          JSON.stringify({
            slow: api.passiveSneak("slow", 0),
            normal: api.passiveSneak("normal", 0),
            fast: api.passiveSneak("fast", 0),
            withGroup: api.passiveSneak("normal", 3),
          }),
        );

        // 8kz. leave nothing behind — every marker this block created is a duration-less
        //      Active Effect, and inheriting one would silently change a later step
        await api.revealHidden(actor, null);
        await api.endDodge(actor, false);
        await api.leaveCover(actor, false);
        await api.endSurprise(actor, false);
        await settle();
        step(
          "the block leaves no hidden, dodging, cover or surprise markers on the shared actor",
          api.hiddenState(actor) === null &&
            api.dodgeState(actor) === null &&
            api.takingCover(actor) === null &&
            api.isSurprised(actor) === null,
          JSON.stringify({
            hidden: api.hiddenState(actor),
            dodging: api.dodgeState(actor),
            cover: api.takingCover(actor),
            surprised: api.isSurprised(actor),
          }),
        );

        await guard.delete();
        await brute.delete();
      }

      // ==================================================== release 8: light
      {
        // ------------------------------------------------------- vision, light, flames
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
            // Linked, or this token is a synthetic copy: burnFlameOccupants
            // (l15) damages the occupant token's actor, and with the default
            // unlinked prototype that is a delta the base actor never sees —
            // the suite asserts on the base actor.
            actorLink: true,
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
              // Core's _prepareDetectionModes replaces a null range with
              // Infinity during preparation, and JSON.stringify prints
              // Infinity as null — which made this assertion look green in
              // its own failure detail while comparing against the wrong
              // value. null lives only in _source; prepared is Infinity.
              visionToken.detectionModes.lightPerception?.range === Infinity,
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
      }

// B4 — coverage for 8db4d1a..ca72ff4; per-block headers inside.
{
  const Actors = game.actors.documentClass;

  // A pair of otherwise identical characters: the only difference is the race,
  // which is the whole of what Bulky turns on.
  // Looked up by name, never by createDocuments return order — the
  // returned array is not reliably input-ordered, and a swapped pair
  // inverted six assertions on the first live run.
  await Actors.createDocuments([
    {
      name: `SMOKE-Bulky-Mutant-${stamp}`,
      type: "character",
      system: { details: { race: "superMutant" }, abilities: { endurance: { value: 10 } } },
    },
    {
      name: `SMOKE-Bulky-Human-${stamp}`,
      type: "character",
      system: { details: { race: "human" }, abilities: { endurance: { value: 10 } } },
    },
  ]);
  const mutant = game.actors.getName(`SMOKE-Bulky-Mutant-${stamp}`);
  const human = game.actors.getName(`SMOKE-Bulky-Human-${stamp}`);

  try {
    const armorOf = (actor) => actor.itemTypes.armor.find((i) => i.name.includes("Plate"));
    const suitOf = (actor) => actor.itemTypes.armor.find((i) => i.name.includes("Suit"));
    const gunOf = (actor) => actor.itemTypes.weapon[0];

    for (const actor of [mutant, human]) {
      await actor.createEmbeddedDocuments("Item", [
        {
          name: `SMOKE-Bulky-Plate-${stamp}`,
          type: "armor",
          system: { armorType: "leather", ac: 10, dt: 0, decay: 0, equipped: true },
        },
        {
          // Power Armor is armor, so Bulky reaches it too (pg 12, pg 57).
          name: `SMOKE-Bulky-Suit-${stamp}`,
          type: "armor",
          system: {
            armorType: "leather",
            ac: 10,
            dt: 0,
            decay: 0,
            equipped: false,
            isPowerArmor: true,
            defensePoints: 5,
            defensePointsValue: 5,
          },
        },
        {
          name: `SMOKE-Bulky-Pistol-${stamp}`,
          type: "weapon",
          system: {
            weaponType: "handgun",
            damage: "1d6",
            apCost: 4,
            critChance: 20,
            ammoType: "10mm",
            magazineSize: 12,
            loadedAmmo: 0,
            decay: 0,
            // The tenth reload adds a level of decay (pg 70's Unstable clock is
            // fifth; the default is tenth) — a decay gain with no dice in it.
            reloadCount: 9,
          },
        },
        { name: `SMOKE-Bulky-Ammo-${stamp}`, type: "ammo", system: { ammoType: "10mm", quantity: 40 } },
      ]);
      // Nothing to soak with: stamina at 0 so damage reaches hit points, which
      // is what Corrosive's trigger asks about.
      await actor.update({
        "system.resources.sp.value": 0,
        "system.resources.hp.value": actor.system.derived.hpMax,
      });
    }
    await settle();

    // b1. Corrosive (pg 69) decays the worn armor when the damage reaches hit
    //     points — one level for a human, two for a Super Mutant.
    const mutantHit = await api.applyDamage(mutant, 3, "", { corrosive: true });
    const humanHit = await api.applyDamage(human, 3, "", { corrosive: true });
    await settle();
    step(
      "Bulky doubles the Corrosive decay a Super Mutant's armor takes (pg 12, pg 69)",
      mutantHit.armorCorroded === 2 &&
        humanHit.armorCorroded === 1 &&
        armorOf(mutant).system.decay === 2 &&
        armorOf(human).system.decay === 1,
      JSON.stringify({
        mutant: mutantHit.armorCorroded,
        human: humanHit.armorCorroded,
        onItem: [armorOf(mutant).system.decay, armorOf(human).system.decay],
      }),
    );

    // b2. The cap swallows the extra level rather than overflowing (pg 92): at
    //     9, a Bulky gain of 2 lands on 10, not 11.
    await armorOf(mutant).update({ "system.decay": 9 });
    await settle();
    const capped = await api.applyDamage(mutant, 3, "", { corrosive: true });
    await settle();
    step(
      "a Bulky level that would pass the decay cap lands on it instead",
      capped.armorCorroded === 10 && armorOf(mutant).system.decay === 10,
      JSON.stringify({ decay: armorOf(mutant).system.decay, reported: capped.armorCorroded }),
    );

    // b3. The reload clock (pg 70) is the weapon-side gain, and has no dice in
    //     it at all: the tenth reload decays the weapon, and Bulky rides along.
    //     Driven through the sheet because reloading is a sheet action, the same
    //     way step 8v's reload is.
    for (const actor of [mutant, human]) {
      await actor.sheet.render(true);
    }
    await settle(900);
    const clickReload = async (actor) => {
      const row = actor.sheet.element?.querySelector(
        `[data-item-id="${gunOf(actor).id}"] [data-action="reload"]`,
      );
      row?.click();
      return !!row;
    };
    const mutantClicked = await clickReload(mutant);
    const humanClicked = await clickReload(human);
    const decayed = await until(
      () => gunOf(mutant).system.decay === 2 && gunOf(human).system.decay === 1,
      8000,
    );
    step(
      "the tenth reload decays the weapon, and a Super Mutant's takes two levels",
      mutantClicked && humanClicked && decayed,
      JSON.stringify({
        found: [mutantClicked, humanClicked],
        decay: [gunOf(mutant).system.decay, gunOf(human).system.decay],
        loaded: [gunOf(mutant).system.loadedAmmo, gunOf(human).system.loadedAmmo],
      }),
    );
    for (const actor of [mutant, human]) await actor.sheet.close();

    // b4. Power Armor's Defense Point refill (pg 57) is the one gain site that
    //     cannot use the writing gate — it folds into the suit's own update —
    //     so it calls `extraDecayLevels` instead. Same rule, different plumbing,
    //     and worth its own assertion for exactly that reason.
    for (const actor of [mutant, human]) {
      await armorOf(actor).update({ "system.equipped": false });
      await suitOf(actor).update({
        "system.equipped": true,
        "system.decay": 0,
        "system.defensePointsValue": 5,
      });
    }
    await settle();
    await api.applyDamage(mutant, 5);
    await api.applyDamage(human, 5);
    await settle();
    step(
      "emptying a Super Mutant's Power Armor pool costs two levels of decay, not one",
      suitOf(mutant).system.decay === 2 &&
        suitOf(human).system.decay === 1 &&
        suitOf(mutant).system.defensePointsValue === 5,
      JSON.stringify({
        mutant: suitOf(mutant).system.decay,
        human: suitOf(human).system.decay,
        refilled: suitOf(mutant).system.defensePointsValue,
      }),
    );

    // b5. Repair is *not* a Bulky site: the rule triggers on decay being gained,
    //     and repair reduces it (src/rules/races.ts spells this out). A Super
    //     Mutant repairs exactly one level, the same as anyone else.
    await armorOf(mutant).update({ "system.decay": 4, "system.equipped": false });
    await armorOf(human).update({ "system.decay": 4 });
    await settle();
    // repairBonus 0 against a crafting bonus of 0 is the automatic success on
    // pg 93, so no die is rolled and nothing here depends on luck.
    const mutantRepair = await api.repairItem(mutant, mutant.system, armorOf(mutant));
    const humanRepair = await api.repairItem(human, human.system, armorOf(human));
    await settle();
    step(
      "repair is not a Bulky site — a Super Mutant still repairs one level (pg 12)",
      mutantRepair.automatic === true &&
        mutantRepair.levelsRepaired === 1 &&
        humanRepair.levelsRepaired === 1 &&
        armorOf(mutant).system.decay === 3 &&
        armorOf(human).system.decay === 3,
      JSON.stringify({
        mutant: { levels: mutantRepair.levelsRepaired, decay: armorOf(mutant).system.decay },
        human: { levels: humanRepair.levelsRepaired, decay: armorOf(human).system.decay },
      }),
    );
  } finally {
    await mutant.delete();
    await human.delete();
  }
}

// ============================================================================
// B4-2. Superior Strength (pg 11) — max(6, STR + 1), and a flat +40 carry load
// ----------------------------------------------------------------------------
// at all, which is the point — the rule has to land *before* anything derives
// from the score, so the assertion belongs on the derived numbers.
//
// Note for the coordinator: BACKLOG C4 (Super Mutant variant traits) is in
// flight and each variant *replaces* Superior Strength. These fixtures leave
// `details.mutantVariant` at its default `""`, which is the printed default,
// so they keep asserting the base trait after C4 lands.
// ============================================================================
{
  const Actors = game.actors.documentClass;

  // Looked up by name, never by createDocuments return order — the
  // returned array is not reliably input-ordered, and a swapped pair
  // inverted six assertions on the first live run.
  await Actors.createDocuments([
    {
      name: `SMOKE-Strong-Mutant-${stamp}`,
      type: "character",
      system: { details: { race: "superMutant" }, abilities: { strength: { value: 4 } } },
    },
    {
      name: `SMOKE-Strong-Human-${stamp}`,
      type: "character",
      system: { details: { race: "human" }, abilities: { strength: { value: 4 } } },
    },
  ]);
  const mutant = game.actors.getName(`SMOKE-Strong-Mutant-${stamp}`);
  const human = game.actors.getName(`SMOKE-Strong-Human-${stamp}`);

  try {
    await settle();

    // s1. "your Strength score increases by 1 and cannot be lower than 6" reads
    //     as max(6, score + 1): the +1 first, the floor catching what is short.
    //     STR 4 -> 6 -> modifier +1, where the human sits at -1.
    step(
      "Superior Strength floors a Super Mutant's Strength at 6 (STR 4 -> score 6, mod +1)",
      mutant.system.derived.abilityMods.strength === 1 &&
        human.system.derived.abilityMods.strength === -1,
      JSON.stringify({
        mutant: mutant.system.derived.abilityMods.strength,
        human: human.system.derived.abilityMods.strength,
      }),
    );

    // s2. Above the floor the +1 still applies: STR 8 -> 9 -> +4. The rejected
    //     reading (floor first, then add) would put a STR 3 mutant above a STR 5
    //     one; this one keeps them in order.
    await mutant.update({ "system.abilities.strength.value": 8 });
    await settle();
    const highMod = mutant.system.derived.abilityMods.strength;
    // And the pg 20 score cap is deliberately not applied here, mirroring Power
    // Armor's Hydraulic Machine: STR 10 operates at 11.
    await mutant.update({ "system.abilities.strength.value": 10 });
    await settle();
    const overCapMod = mutant.system.derived.abilityMods.strength;
    step(
      "the +1 keeps applying above the floor, and is not clamped at the pg 20 cap",
      highMod === 4 && overCapMod === 6,
      JSON.stringify({ str8: highMod, str10: overCapMod }),
    );

    // s3. Carry load. Compared at the *same effective score* so the flat bonus
    //     is isolated: a mutant at STR 4 operates at 6, and a human at STR 6 is
    //     also at 6 — 60 for the human, 100 for the mutant, and the difference
    //     is exactly the printed +40.
    await mutant.update({ "system.abilities.strength.value": 4 });
    await human.update({ "system.abilities.strength.value": 6 });
    await settle();
    step(
      "Superior Strength adds a flat 40 to Carry Load on top of the raised score",
      human.system.derived.carryLoadMax === 60 &&
        mutant.system.derived.carryLoadMax === 100 &&
        mutant.system.derived.carryLoadMax - human.system.derived.carryLoadMax === 40,
      JSON.stringify({
        mutant: mutant.system.derived.carryLoadMax,
        human: human.system.derived.carryLoadMax,
      }),
    );

    // s4. Every other race is untouched by both halves — the functions are the
    //     identity for anyone who is not a Super Mutant.
    await mutant.update({ "system.details.race": "ghoul" });
    await settle();
    step(
      "switching the race off Super Mutant takes both halves of the trait with it",
      mutant.system.derived.abilityMods.strength === -1 &&
        mutant.system.derived.carryLoadMax === 40,
      JSON.stringify({
        mod: mutant.system.derived.abilityMods.strength,
        carry: mutant.system.derived.carryLoadMax,
      }),
    );
  } finally {
    await mutant.delete();
    await human.delete();
  }
}

// ============================================================================
// B4-3. Healing Powder (pg 86) — banked on use, paid out per turn
// ----------------------------------------------------------------------------
//
// The block builds its own combat rather than borrowing step 8v's, for the
// reason the Power Armor upgrades block builds its own suit: 8v deletes its
// combat and its ally when it finishes. The combat is attached to whatever
// scene the world already has, exactly as 8v does, because Foundry's
// CombatTracker throws while rendering a sceneless combat.
// ============================================================================
{
  const Actors = game.actors.documentClass;
  const Combats = CONFIG.Combat.documentClass;
  // The last few cards, joined: `useAid` posts one card carrying every note.
  const recentText = (count = 3) =>
    game.messages.contents
      .slice(-count)
      .map((message) => String(message.content ?? "") + String(message.flavor ?? ""))
      .join(" ");

  // Looked up by name, never by createDocuments return order — the
  // returned array is not reliably input-ordered, and a swapped pair
  // inverted six assertions on the first live run.
  await Actors.createDocuments([
    {
      name: `SMOKE-Powder-Patient-${stamp}`,
      type: "character",
      // Endurance 10 -> Healing Rate 5, so half of it is a clean 2 per turn.
      system: { details: { race: "human" }, abilities: { endurance: { value: 10 } } },
    },
    {
      name: `SMOKE-Powder-Ghoul-${stamp}`,
      type: "character",
      system: { details: { race: "ghoul" }, abilities: { endurance: { value: 10 } } },
    },
    { name: `SMOKE-Powder-Ally-${stamp}`, type: "character" },
  ]);
  const patient = game.actors.getName(`SMOKE-Powder-Patient-${stamp}`);
  const ghoul = game.actors.getName(`SMOKE-Powder-Ghoul-${stamp}`);
  const ally = game.actors.getName(`SMOKE-Powder-Ally-${stamp}`);

  let combat;
  try {
    const powderData = {
      name: `SMOKE-Healing-Powder-${stamp}`,
      type: "aid",
      system: {
        aidType: "medicine",
        apCost: 6,
        quantity: 2,
        healsHealingRate: true,
        healRateMultiplier: 0.5,
        healRounds: 3,
        effect: "Heals half the target's healing rate at the start of each of their turns.",
      },
    };
    const [powder] = await patient.createEmbeddedDocuments("Item", [powderData]);
    const [ghoulPowder] = await ghoul.createEmbeddedDocuments("Item", [powderData]);
    await patient.update({ "system.resources.hp.value": 1 });
    await ghoul.update({ "system.resources.hp.value": 1 });
    await settle();

    const healingRate = patient.system.derived.healingRate;
    const perTurn = Math.floor(healingRate / 2);

    // h1. Using it heals nothing now and banks three turns instead (pg 86).
    await api.useAid(patient, patient.system, powder);
    await settle();
    const banked = patient.system.resources.healRounds;
    step(
      "Healing Powder banks three turns of healing and restores nothing on use (pg 86)",
      banked === 3 &&
        patient.system.resources.hp.value === 1 &&
        recentText().includes("Healing Powder takes hold"),
      JSON.stringify({ banked, hp: patient.system.resources.hp.value, rate: healingRate }),
    );

    // h2. "Ghouls, robots, and gen-2 synths are unaffected" — nothing banked,
    //     and the card says so rather than failing silently.
    await api.useAid(ghoul, ghoul.system, ghoulPowder);
    await settle();
    step(
      "a ghoul banks nothing from Healing Powder, and the card says why (pg 86)",
      ghoul.system.resources.healRounds === 0 &&
        ghoul.system.resources.hp.value === 1 &&
        recentText().includes("does nothing for ghouls"),
      JSON.stringify({
        rounds: ghoul.system.resources.healRounds,
        hp: ghoul.system.resources.hp.value,
      }),
    );

    // h3. The payout itself lives in `combatTurnChange`, so it needs a combat.
    //     The patient wins initiative, so their first turn opens the fight and
    //     the first tick lands there.
    const sceneId = game.scenes?.current?.id ?? game.scenes?.contents?.[0]?.id ?? null;
    combat = await Combats.create({ scene: sceneId });
    await combat.activate();
    await combat.createEmbeddedDocuments("Combatant", [
      { actorId: patient.id, initiative: 20 },
      { actorId: ally.id, initiative: 10 },
    ]);
    const hpBefore = patient.system.resources.hp.value;
    await combat.startCombat();
    const firstTick = await until(
      () => patient.system.resources.healRounds === 2,
      12000,
    );
    const hpAfterFirst = patient.system.resources.hp.value;
    step(
      "the first turn of combat pays out half the Healing Rate and spends a banked round",
      firstTick && hpAfterFirst === hpBefore + perTurn,
      JSON.stringify({
        rounds: patient.system.resources.healRounds,
        hp: hpAfterFirst,
        expected: hpBefore + perTurn,
        perTurn,
      }),
    );

    // h4. It keeps paying out each time that turn comes round, and the card
    //     counts down the remainder.
    await combat.nextTurn(); // to the ally
    await combat.nextTurn(); // wraps to round 2, back to the patient
    const secondTick = await until(
      () => patient.system.resources.healRounds === 1,
      12000,
    );
    step(
      "each of the patient's turns spends one banked round until they run out",
      secondTick &&
        patient.system.resources.hp.value === hpAfterFirst + perTurn &&
        recentText(4).includes("Healing Powder restores"),
      JSON.stringify({
        rounds: patient.system.resources.healRounds,
        hp: patient.system.resources.hp.value,
      }),
    );
  } finally {
    if (combat) await combat.delete();
    await patient.delete();
    await ghoul.delete();
    await ally.delete();
  }
}

// ============================================================================
// B4-4a. Sneak-attack posture (pg 24, 125, 128) — the rules seam, no canvas
// ----------------------------------------------------------------------------
// determineSurprise, sneakAttackPosture, isSurprised, hiddenState, rollAttack.
//
// `sneakAttackPosture` is the whole of the new wiring: Hide buys advantage
// (pg 24) and Surprise is what buys the sneak attack (pg 128), because hiding
// alone leaves the enemy knowing your general location (pg 127). This half
// asserts the posture itself plus the explicit-flag path of `rollAttack`,
// neither of which needs a target. B4-4b does the defaulting, which does.
// ============================================================================
{
  const Actors = game.actors.documentClass;
  const FULL_COVER = { cover: "total", heavilyObscured: false, invisible: false };

  // Looked up by name, never by createDocuments return order — the
  // returned array is not reliably input-ordered, and a swapped pair
  // inverted six assertions on the first live run.
  await Actors.createDocuments([
    { name: `SMOKE-Sneak-Attacker-${stamp}`, type: "character" },
    {
      name: `SMOKE-Sneak-Target-${stamp}`,
      type: "character",
      // Perception 1 -> passive sense 8, which a Sneak roll cannot fail to beat
      // once the bonus below is in place. No dice luck in this block.
      system: { abilities: { perception: { value: 1 } } },
    },
  ]);
  const sneak = game.actors.getName(`SMOKE-Sneak-Attacker-${stamp}`);
  const mark = game.actors.getName(`SMOKE-Sneak-Target-${stamp}`);

  try {
    // A flat +30 on Sneak: `bonuses.skills.<key>` is the effect-written path the
    // derived pass folds in, so the lowest possible total is 31 against a
    // passive sense of 8.
    await sneak.update({ "system.bonuses.skills.sneak": 30 });
    const [club] = await sneak.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Sneak-Club-${stamp}`,
        type: "weapon",
        system: { weaponType: "blunt", damage: "1d6", apCost: 4, critChance: 20, magazineSize: 0 },
      },
    ]);
    await settle();

    // p1. Hidden but the target is alert: advantage only. pg 127 says in as many
    //     words that enemies still know your general location, so hiding cannot
    //     be the "unaware" half of pg 128 by itself.
    const hidReport = await api.hide(sneak, sneak.system, {
      concealment: FULL_COVER,
      observers: [mark],
    });
    await settle();
    const alertPosture = api.sneakAttackPosture(sneak, mark);
    step(
      "hiding alone buys advantage, never a sneak attack (pg 24 vs pg 128)",
      hidReport?.hidden === true &&
        hidReport.hiddenFrom.includes(mark.name) &&
        alertPosture.advantage === true &&
        alertPosture.sneakAttack === false &&
        alertPosture.targetSurprised === false,
      JSON.stringify({ hidden: hidReport?.hidden, posture: alertPosture }),
    );

    // p2. Surprise is the procedure that makes a creature unaware (pg 125), and
    //     it reuses the recorded Hide total rather than rerolling it.
    const surprise = await api.determineSurprise([sneak], [mark]);
    await settle();
    const armedPosture = api.sneakAttackPosture(sneak, mark);
    step(
      "Surprise supplies the unawareness pg 128 wants, and reuses the recorded Sneak total",
      surprise?.surprised.includes(mark.name) === true &&
        surprise.hiders[0]?.rolled === false &&
        surprise.hiders[0]?.sneakTotal === hidReport?.total &&
        api.isSurprised(mark) !== null &&
        armedPosture.sneakAttack === true &&
        armedPosture.advantage === true,
      JSON.stringify({ surprise, posture: armedPosture }),
    );

    // p3. The GM override: "unaware" is a state of fiction (asleep, at a
    //     terminal), and Surprise is only its combat-opening special case.
    const asleep = api.sneakAttackPosture(sneak, mark, { unaware: true });
    const noConcealment = api.sneakAttackPosture(sneak, mark, {
      concealment: { cover: "none", heavilyObscured: false, invisible: false },
    });
    step(
      "an adjudicated `unaware` stands in for Surprise, and no concealment refuses either way",
      asleep.sneakAttack === true && noConcealment.sneakAttack === false,
      JSON.stringify({ asleep: asleep.sneakAttack, exposed: noConcealment.sneakAttack }),
    );

    // p4. An explicit flag always wins over the posture, in both directions —
    //     which is the half of the defaulting that needs no target.
    await api.rollAttack(sneak, sneak.system, club, club.system, "normal", { sneak: true });
    await settle();
    const forced = lastAttackFlavor();
    step(
      "an explicitly declared sneak attack marks the card whatever the posture says",
      forced.includes("SNEAK ATTACK") && !forced.includes("from your hidden position"),
      forced.slice(0, 160),
    );
  } finally {
    await sneak.delete();
    await mark.delete();
  }
}

// ============================================================================
// B4-4b. Sneak-attack posture — the defaulting, which needs a canvas target
// ----------------------------------------------------------------------------
// Paste immediately after B4-4a. Uses exported api: hide, determineSurprise,
// rollAttack, hiddenState.
//
// `rollAttack` reads `game.user.targets` and only defaults the flag when there
// is exactly one — "the target" is singular in the rule. Targeting is
// canvas-bound (see §2 of the file header): there is no `updateTokenTargets`
// on 14.365, and `User#_onUpdateTokenTargets` resolves ids through
// `canvas.tokens`. So this block views a SMOKE- scene, drops a linked token,
// and runs its assertions only if the target actually landed.
// ============================================================================
{
  const Actors = game.actors.documentClass;
  const Scenes = CONFIG.Scene.documentClass;
  const FULL_COVER = { cover: "total", heavilyObscured: false, invisible: false };

  // Looked up by name, never by createDocuments return order — the
  // returned array is not reliably input-ordered, and a swapped pair
  // inverted six assertions on the first live run.
  await Actors.createDocuments([
    { name: `SMOKE-Posture-Attacker-${stamp}`, type: "character" },
    {
      name: `SMOKE-Posture-Target-${stamp}`,
      type: "character",
      system: { abilities: { perception: { value: 1 } } },
    },
  ]);
  const sneak = game.actors.getName(`SMOKE-Posture-Attacker-${stamp}`);
  const mark = game.actors.getName(`SMOKE-Posture-Target-${stamp}`);
  const viewedBefore = globalThis.canvas?.scene ?? null;
  const scene = await Scenes.create({
    name: `SMOKE-Posture-Scene-${stamp}`,
    width: 2000,
    height: 2000,
    grid: { type: 1, size: 100, distance: 5, units: "ft" },
  });

  try {
    await sneak.update({ "system.bonuses.skills.sneak": 30 });
    // Linked, so the targeted token's `actor` is this document and not a
    // synthetic clone — the Hide and Surprise markers are written to the actor,
    // and an unlinked token would be reading a copy that never saw them.
    await mark.update({ "prototypeToken.actorLink": true });
    const [club] = await sneak.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Posture-Club-${stamp}`,
        type: "weapon",
        system: { weaponType: "blunt", damage: "1d6", apCost: 4, critChance: 20, magazineSize: 0 },
      },
    ]);

    // --- acquire the target -------------------------------------------------
    await scene.view();
    const drawn = await until(() => globalThis.canvas?.scene?.id === scene.id, 20000);
    const tokenData = await mark.getTokenDocument({ x: 500, y: 500 });
    const [markToken] = await scene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
    const placed = drawn && (await until(() => !!canvas.tokens?.get(markToken.id), 15000));
    if (placed) canvas.tokens.setTargets([markToken.id], { mode: "replace" });
    const targeted =
      placed &&
      (await until(
        () =>
          game.user.targets.size === 1 &&
          Array.from(game.user.targets)[0]?.actor?.id === mark.id,
        6000,
      ));

    if (!targeted) {
      // One honest failure naming the cause, rather than five that all say the
      // same thing. Everything the posture itself does is covered by B4-4a.
      step(
        "sneak-attack defaulting needs one targeted token, and the headless canvas produced none",
        false,
        JSON.stringify({
          canvasReady: globalThis.canvas?.ready ?? null,
          viewing: globalThis.canvas?.scene?.id ?? null,
          wanted: scene.id,
          drawn,
          placed,
          targets: game.user.targets.size,
        }),
      );
    } else {
      const arm = async () => {
        await api.hide(sneak, sneak.system, { concealment: FULL_COVER, observers: [mark] });
        await api.determineSurprise([sneak], [mark]);
        await settle();
      };

      // p5. No `sneak` option at all: the attack works the flag out from the
      //     attacker's own stealth, says where it came from, and takes pg 24's
      //     advantage as a *request* so it still cancels normally.
      await arm();
      await api.rollAttack(sneak, sneak.system, club, club.system, "normal");
      await settle();
      const defaulted = lastAttackFlavor();
      step(
        "an attack with no sneak option defaults it from the posture, and names the source",
        defaulted.includes("SNEAK ATTACK") &&
          defaulted.includes("from your hidden position") &&
          defaulted.includes("hidden from this target") &&
          defaulted.includes("2d20kh") === false, // the mode lives in the formula, not the flavor
        defaulted.slice(0, 200),
      );

      // p6. And the roll itself took the advantage, not just the note.
      const postureFormula = lastAttackFormula();
      step(
        "being hidden from the target reaches the dice, not only the card (pg 24)",
        postureFormula.includes("2d20kh"),
        postureFormula,
      );

      // p7. `sneak: false` is an opinion, and an explicit opinion always wins —
      //     the two call sites in the sheet were passing exactly this by
      //     accident on every ordinary click before 2ec142f stopped them.
      await arm();
      await api.rollAttack(sneak, sneak.system, club, club.system, "normal", { sneak: false });
      await settle();
      const suppressed = lastAttackFlavor();
      step(
        "an explicit `sneak: false` suppresses the defaulting entirely",
        !suppressed.includes("SNEAK ATTACK") && !suppressed.includes("from your hidden position"),
        suppressed.slice(0, 200),
      );
    }
  } finally {
    if (globalThis.canvas?.tokens) canvas.tokens.setTargets([], { mode: "replace" });
    if (viewedBefore) await viewedBefore.view();
    await scene.delete();
    await sneak.delete();
    await mark.delete();
  }
}

// ============================================================================
// B4-5. Attacking ends Hide and Take Cover; a Silencer keeps the Hide (pg 77, 127)
// ----------------------------------------------------------------------------
// takeCover, takingCover, rollAttack, revealAfterAttacking, leaveCover.
//
// This is the hook 8db4d1a re-landed after b4bd493 reverted it as a circular
// import, so what is really under test is that `rollAttack` can call into
// `actions/stealth` at all — a cycle here left every binding undefined at
// module init and broke every attack, which no assertion about the marker
// would have caught.
//
// No target needed: `revealAfterAttacking` and `leaveCover` are unconditional
// tails of the roll.
// ============================================================================
{
  const Actors = game.actors.documentClass;
  const FULL_COVER = { cover: "total", heavilyObscured: false, invisible: false };
  const recentContent = (count = 4) =>
    game.messages.contents
      .slice(-count)
      .map((message) => String(message.content ?? ""))
      .join(" ");

  // Looked up by name, never by createDocuments return order — the
  // returned array is not reliably input-ordered, and a swapped pair
  // inverted six assertions on the first live run.
  await Actors.createDocuments([
    { name: `SMOKE-Reveal-Shooter-${stamp}`, type: "character" },
  ]);
  const shooter = game.actors.getName(`SMOKE-Reveal-Shooter-${stamp}`);

  try {
    await shooter.update({ "system.bonuses.skills.sneak": 30 });
    const [pistol] = await shooter.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Reveal-Pistol-${stamp}`,
        type: "weapon",
        system: {
          weaponType: "handgun",
          damage: "1d6",
          apCost: 4,
          critChance: 20,
          magazineSize: 0, // no magazine: this block is about the tail, not ammo
        },
      },
    ]);
    await settle();

    // A hide with a declared DC and no observers: pg 127 prices the DC off
    // nearby enemies, and this block has none — the DC override is the same
    // escape hatch Escape's bear trap uses.
    const conceal = async () => {
      await api.hide(shooter, shooter.system, { concealment: FULL_COVER, dc: 1 });
      await api.takeCover(shooter, "half");
      await settle();
    };

    // r1. Attacking gives the position away and ends the stance you acted out of.
    await conceal();
    const armed = api.hiddenState(shooter) !== null && api.takingCover(shooter) !== null;
    await api.rollAttack(shooter, shooter.system, pistol, pistol.system, "normal");
    await settle();
    step(
      "attacking ends both the Hide and the Take Cover (pg 77 by exception, pg 127)",
      armed &&
        api.hiddenState(shooter) === null &&
        api.takingCover(shooter) === null &&
        recentContent().includes("Attacked from hiding"),
      JSON.stringify({
        armed,
        hidden: api.hiddenState(shooter) !== null,
        covered: api.takingCover(shooter) !== null,
      }),
    );

    // r2. The Silencer (pg 77) is the exception that establishes the rule: still
    //     hidden from everyone but the creature attacked. Take Cover is a stance
    //     you leave by acting out of it, so it goes either way.
    await conceal();
    await api.rollAttack(shooter, shooter.system, pistol, pistol.system, "normal", {
      silenced: true,
    });
    await settle();
    step(
      "a silenced attack keeps the Hide, and still ends the Take Cover (pg 77)",
      api.hiddenState(shooter) !== null &&
        api.takingCover(shooter) === null &&
        recentContent().includes("still hidden from everyone except"),
      JSON.stringify({
        hidden: api.hiddenState(shooter) !== null,
        covered: api.takingCover(shooter) !== null,
      }),
    );

    // r3. Nothing to reveal is not an error: the tail is silent for an attacker
    //     who was never hiding, which is every ordinary attack in the suite.
    await api.revealHidden(shooter, null);
    await settle();
    const quiet = game.messages.size;
    const nothing = await api.revealAfterAttacking(shooter, false);
    await settle();
    step(
      "the reveal hook says nothing when the attacker was not hiding",
      nothing === null && game.messages.size === quiet,
      JSON.stringify({ nothing, messages: game.messages.size - quiet }),
    );
  } finally {
    await shooter.delete();
  }
}

// ============================================================================
// B4-6. Skill magazines route to the reader, not to `useAid` (pg 88)
// ----------------------------------------------------------------------------
// magazineSkill, useAid.
//
// The Use button on an aid row now checks `aidType === "magazine"` and hands
// off to `promptReadMagazine` — a dialog, so the button itself is out of reach
// headless. What is assertable is the seam it routes to, and specifically the
// `skill` field the ledger gained in the same commit: `magazineSkill` can fall
// back to the item's effect text, which the derived pass cannot see, so
// without that field a renamed magazine reads correctly and then grants
// nothing.
//
// ⚠ This block writes `system.progression.magazines`, which is the field
// BACKLOG B3 is still open on (a malformed sub-path write diffing the parent to
// undefined). If B3 is unfixed these steps may fail or leave an
// "Actor validation error: system.progression" in the console capture — that is
// B3 reproducing, not a fault in this coverage.
// ============================================================================
{
  const Actors = game.actors.documentClass;

  // Looked up by name, never by createDocuments return order — the
  // returned array is not reliably input-ordered, and a swapped pair
  // inverted six assertions on the first live run.
  await Actors.createDocuments([
    { name: `SMOKE-Mag-Reader-${stamp}`, type: "character" },
  ]);
  const reader = game.actors.getName(`SMOKE-Mag-Reader-${stamp}`);

  try {
    const [magazine] = await reader.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Guns-Magazine-${stamp}`,
        type: "aid",
        system: {
          aidType: "magazine",
          quantity: 2,
          // Not one of the fourteen printed titles, so the resolution has to come
          // off this line — which is the case the stored `skill` exists for.
          effect: "Your Guns skill bonus increases by 1 until you rest.",
        },
      },
    ]);
    await settle();
    const gunsBefore = reader.system.derived.skillBonuses.guns;

    // m1. The title is authoritative and the effect text is the fallback;
    //     neither identifying a skill is a refusal, never a guess.
    step(
      "a magazine resolves by printed title, then by effect text, and refuses otherwise",
      // "Milsurp Review" is the printed guns title (pg 88); "Guns and Bullets"
      // is the video game's, which is exactly the trap the refusal exists for.
      api.magazineSkill("Milsurp Review") === "guns" &&
        api.magazineSkill(`SMOKE-Nonsense-${stamp}`, "raises your Energy Weapons skill") ===
          "energyWeapons" &&
        api.magazineSkill(`SMOKE-Nonsense-${stamp}`, "") === null,
      JSON.stringify({
        printed: api.magazineSkill("Guns and Bullets"),
        fallback: api.magazineSkill("x", "raises your Energy Weapons skill"),
        unknown: api.magazineSkill("x", ""),
      }),
    );

    // m2. The read writes the ledger with the resolved skill, and the derived
    //     pass picks the bonus up from there.
    const report = await api.readMagazine(reader, reader.system, magazine, 4);
    await settle();
    const entry = reader.system.progression.magazines[0];
    step(
      "reading an issue records it with its resolved skill, and the +1 lands (pg 88)",
      report?.skill === "guns" &&
        report.issue === 4 &&
        report.alreadyRead === false &&
        entry?.skill === "guns" &&
        entry.title === magazine.name &&
        entry.issues === "4" &&
        entry.untilRest === true &&
        reader.system.derived.skillBonuses.guns === gunsBefore + 1 &&
        magazine.system.quantity === 1,
      JSON.stringify({ report, entry, guns: reader.system.derived.skillBonuses.guns }),
    );

    // m3. A second read of the same issue is consumed and grants nothing —
    //     "once you read an issue … you can no longer gain its benefits".
    const again = await api.readMagazine(reader, reader.system, magazine, 4);
    await settle();
    step(
      "an issue already on the ledger is consumed and grants nothing (pg 88)",
      again?.alreadyRead === true &&
        reader.system.progression.magazines[0]?.issues === "4" &&
        reader.system.derived.skillBonuses.guns === gunsBefore + 1 &&
        magazine.system.quantity === 0,
      JSON.stringify({
        again,
        issues: reader.system.progression.magazines[0]?.issues,
        quantity: magazine.system.quantity,
      }),
    );

    // m4. Why the Use button had to be re-routed at all: `useAid` knows nothing
    //     of the ledger, so sending a magazine through it eats the issue and
    //     grants nothing. Asserted with a second copy, so the contrast is
    //     explicit rather than assumed.
    const [second] = await reader.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Guns-Magazine-B-${stamp}`,
        type: "aid",
        system: {
          aidType: "magazine",
          quantity: 1,
          effect: "Your Guns skill bonus increases by 1 until you rest.",
        },
      },
    ]);
    await settle();
    const ledgerBefore = reader.system.progression.magazines.length;
    await api.useAid(reader, reader.system, second);
    await settle();
    step(
      "consuming a magazine through `useAid` still grants nothing — hence the Use-button routing",
      second.system.quantity === 0 &&
        reader.system.progression.magazines.length === ledgerBefore &&
        reader.system.derived.skillBonuses.guns === gunsBefore + 1,
      JSON.stringify({
        quantity: second.system.quantity,
        ledger: reader.system.progression.magazines.length,
        guns: reader.system.derived.skillBonuses.guns,
      }),
    );
  } finally {
    await reader.delete();
  }
}

// ============================================================================
// B4-7. Advantage reaches the Crafting and Medicine checks (8db4d1a)
// ----------------------------------------------------------------------------
// endBleeding.
//
// Both were inline `1d20 + bonus` rolls until the roll plumbing moved to
// `src/dice/core.ts`: `effectiveMode` was private to `src/dice/rolls.ts` and
// `actions/` could not import it without a cycle, so a perk granting advantage
// on Crafting or Medicine reached the card and never the dice. The assertion is
// therefore about the *formula*, not the total.
// ============================================================================
{
  const Actors = game.actors.documentClass;
  // Both actions post their own summary card after the roll card, so the last
  // message is not the roll — walk back to the newest message that has one.
  const lastRolledFormula = () => {
    const rolled = game.messages.contents.filter((message) => (message.rolls?.length ?? 0) > 0);
    return String(rolled.at(-1)?.rolls?.[0]?.formula ?? "").replace(/\s+/g, "");
  };

  // Looked up by name, never by createDocuments return order — the
  // returned array is not reliably input-ordered, and a swapped pair
  // inverted six assertions on the first live run.
  await Actors.createDocuments([
    { name: `SMOKE-Adv-Medic-${stamp}`, type: "character" },
  ]);
  const medic = game.actors.getName(`SMOKE-Adv-Medic-${stamp}`);

  try {
    const [gear] = await medic.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Adv-Armor-${stamp}`,
        type: "armor",
        system: { armorType: "leather", ac: 10, dt: 0, decay: 4, equipped: false },
      },
    ]);
    await settle();

    // a1. The control. A repair bonus of 5 against a Crafting bonus of 0 is
    //     over the automatic-success line (pg 93), so a die is actually rolled.
    await api.repairItem(medic, medic.system, gear, { repairBonus: 5 });
    await settle();
    const plainRepair = lastRolledFormula();
    step(
      "an ordinary repair rolls one d20 (pg 93)",
      plainRepair.includes("1d20") && !plainRepair.includes("2d20"),
      plainRepair,
    );

    // a2. Advantage as a perk's Active Effect, scoped to the two skills — the
    //     shape src/rules/effects.ts writes (`advantageChange(skillScope(...))`
    //     resolves to `system.bonuses.advantage.skills.<key>`), and the same
    //     shape step 8r uses for Strength.
    const [perk] = await medic.createEmbeddedDocuments("Item", [
      { name: `SMOKE-Adv-Perk-${stamp}`, type: "perk" },
    ]);
    await perk.createEmbeddedDocuments("ActiveEffect", [
      {
        name: `SMOKE-Adv-Perk-${stamp}`,
        type: "base",
        transfer: true,
        system: {
          changes: [
            {
              key: "system.bonuses.advantage.skills.crafting",
              type: "add",
              value: 1,
              phase: "initial",
              priority: 20,
            },
            {
              key: "system.bonuses.advantage.skills.medicine",
              type: "add",
              value: 1,
              phase: "initial",
              priority: 20,
            },
          ],
        },
      },
    ]);
    const applied = await until(
      () =>
        medic.system.derived.advantage.skills.crafting === 1 &&
        medic.system.derived.advantage.skills.medicine === 1,
      6000,
    );

    await gear.update({ "system.decay": 4 });
    await settle();
    await api.repairItem(medic, medic.system, gear, { repairBonus: 5 });
    await settle();
    const advRepair = lastRolledFormula();
    step(
      "advantage on Crafting reaches the repair roll's dice, not just its card",
      applied && advRepair.includes("2d20kh"),
      JSON.stringify({ applied, formula: advRepair }),
    );

    // a3. First aid runs the same helper, so the same grant reaches a Medicine
    //     check. Self-treated: "within 5 feet" is fiction the sheet cannot see,
    //     and the action takes a medic and a target without insisting they differ.
    await medic.update({ "system.conditions.bleeding": 1 });
    await settle();
    await api.endBleeding(medic, medic.system, medic);
    await settle();
    const advMedicine = lastRolledFormula();
    step(
      "advantage on Medicine reaches the first-aid roll (pg 21, pg 23)",
      advMedicine.includes("2d20kh"),
      advMedicine,
    );

    await perk.delete();
  } finally {
    await medic.delete();
  }
}

// ============================================================================
// B4-8a. Robot body plans — what is assertable without a canvas target
// ----------------------------------------------------------------------------
//
// ⚠ Two of these steps are expected to FAIL until the bug in §3 of the file
// header is fixed: `rollAttack` builds `.effect`, `.c1`-`.c4` and `.severe`
// from the limb key instead of from `limbRowKey`/`severeInjuryFor`, and
// lang/en.json has no such keys for `jetEngine` or `rollers` — by design, since
// both borrow the leg row. The steps are written to the intended behaviour.
//
// ⚠ None of `src/rules/targeted.ts` is exported (see §1). With `limbKeysFor`,
// `hasLimb`, `targetedApCost` and `severeInjuryFor` on the api object, the
// whole of `LIMB_PROFILES` becomes six lines of pure assertion — a Handy has no
// head, groin or legs but keeps its torso; a Protectron loses eyes and groin; a
// Robobrain's rollers are not severable; no robot has a fusion core; a melee
// jet engine costs 2 under this file's ordering ruling and 3 under the rejected
// one. That is the coverage this backlog item really wants, and it is one
// export line away.
// ============================================================================
{
  const Actors = game.actors.documentClass;
  const recentContent = (count = 3) =>
    game.messages.contents
      .slice(-count)
      .map((message) => String(message.content ?? ""))
      .join(" ");

  // Looked up by name, never by createDocuments return order — the
  // returned array is not reliably input-ordered, and a swapped pair
  // inverted six assertions on the first live run.
  await Actors.createDocuments([
    { name: `SMOKE-Limb-Gunner-${stamp}`, type: "character" },
  ]);
  const gunner = game.actors.getName(`SMOKE-Limb-Gunner-${stamp}`);

  try {
    const [rifle] = await gunner.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Limb-Rifle-${stamp}`,
        type: "weapon",
        system: {
          weaponType: "rifle",
          damage: "1d8",
          apCost: 4,
          critChance: 20,
          magazineSize: 0,
          strengthReq: 1,
        },
      },
    ]);
    await settle();

    // t1. With no target the printed pg 129 table applies, which is what every
    //     attack did before robot profiles existed — the eyes cost 5.
    await api.rollAttack(gunner, gunner.system, rifle, rifle.system, "normal", { limb: "eyes" });
    await settle();
    const printedEyes = lastAttackFlavor();
    step(
      "with no target, a targeted attack falls back to the printed pg 129 table (eyes +5 AP)",
      printedEyes.includes("(+5 AP)"),
      printedEyes.slice(0, 160),
    );

    // t2. A limb no body has a profile entry for still resolves rather than
    //     throwing — `entryFor`'s fallback, which is the difference between an
    //     unusual attack and a broken sheet. The jet engine borrows the leg row
    //     at its own price of 4.
    await api.rollAttack(gunner, gunner.system, rifle, rifle.system, "normal", {
      limb: "jetEngine",
    });
    await settle();
    const jetFallback = lastAttackFlavor();
    step(
      "a robot limb named with no target resolves on the fallback entry (jet engine +4 AP)",
      jetFallback.includes("(+4 AP)"),
      jetFallback.slice(0, 160),
    );

    // t3. ⚠ EXPECTED FAILURE until `rollAttack` resolves its text through
    //     `limbRowKey` — the card currently prints the raw lang key, because
    //     `FALLOUT.Targeted.limbs.jetEngine.effect` does not exist and is not
    //     meant to: the jet engine "functions exactly the same as a targeted
    //     attack to the legs", so it should read the leg row's effect.
    step(
      "the jet engine's card reads the leg row's effect rather than a missing key (pg 9)",
      !jetFallback.includes("FALLOUT.Targeted") &&
        jetFallback.includes("Damage dice decreased by 1"),
      jetFallback.slice(0, 200),
    );

    // t4. ⚠ EXPECTED FAILURE for the same reason, one layer down: the
    //     non-critical follow-up rolls 1d4 for a condition and localizes
    //     `…limbs.jetEngine.c<n>`, which likewise does not exist. `sneak: false`
    //     keeps this off the critical branch; a natural 1 posts nothing at all,
    //     so the assertion tolerates that rather than retrying dice (B2).
    const followUp = recentContent(2);
    step(
      "the condition follow-up for a robot limb localizes, rather than printing its key",
      !followUp.includes("FALLOUT.Targeted.limbs"),
      followUp.slice(0, 200),
    );
  } finally {
    await gunner.delete();
  }
}

// ============================================================================
// B4-8b. Robot body plans — the defender's chassis, read off the targeted token
// ----------------------------------------------------------------------------
// Paste immediately after B4-8a. Uses exported api: rollAttack.
//
// "The robot type that matters is the *defender's*" — every pg 9-11 body-plan
// paragraph is second-person to the robot being shot at, and `rollAttack` reads
// it off the single targeted token. Same canvas requirement and same one-step
// fallback as B4-4b; see §2 of the file header.
// ============================================================================
{
  const Actors = game.actors.documentClass;
  const Scenes = CONFIG.Scene.documentClass;
  const recentContent = (count = 3) =>
    game.messages.contents
      .slice(-count)
      .map((message) => String(message.content ?? ""))
      .join(" ");

  // Looked up by name, never by createDocuments return order — the
  // returned array is not reliably input-ordered, and a swapped pair
  // inverted six assertions on the first live run.
  await Actors.createDocuments([
    { name: `SMOKE-Chassis-Gunner-${stamp}`, type: "character" },
    {
      name: `SMOKE-Chassis-Handy-${stamp}`,
      type: "character",
      system: { details: { race: "robot", robotType: "handy" } },
      prototypeToken: { actorLink: true },
    },
    {
      name: `SMOKE-Chassis-Robobrain-${stamp}`,
      type: "character",
      system: { details: { race: "robot", robotType: "robobrain" } },
      prototypeToken: { actorLink: true },
    },
  ]);
  const gunner = game.actors.getName(`SMOKE-Chassis-Gunner-${stamp}`);
  const handy = game.actors.getName(`SMOKE-Chassis-Handy-${stamp}`);
  const robobrain = game.actors.getName(`SMOKE-Chassis-Robobrain-${stamp}`);
  const viewedBefore = globalThis.canvas?.scene ?? null;
  const scene = await Scenes.create({
    name: `SMOKE-Chassis-Scene-${stamp}`,
    width: 2000,
    height: 2000,
    grid: { type: 1, size: 100, distance: 5, units: "ft" },
  });

  try {
    const [rifle] = await gunner.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Chassis-Rifle-${stamp}`,
        type: "weapon",
        system: {
          weaponType: "rifle",
          damage: "1d8",
          apCost: 4,
          critChance: 20,
          magazineSize: 0,
          strengthReq: 1,
        },
      },
    ]);

    await scene.view();
    const drawn = await until(() => globalThis.canvas?.scene?.id === scene.id, 20000);
    const tokens = [];
    for (const [index, actor] of [handy, robobrain].entries()) {
      const data = await actor.getTokenDocument({ x: 400 + index * 300, y: 400 });
      const [placed] = await scene.createEmbeddedDocuments("Token", [data.toObject()]);
      tokens.push(placed);
    }
    const placed =
      drawn && (await until(() => tokens.every((t) => !!canvas.tokens?.get(t.id)), 15000));

    const targetOnly = async (token, actor) => {
      canvas.tokens.setTargets([token.id], { mode: "replace" });
      return until(
        () =>
          game.user.targets.size === 1 &&
          Array.from(game.user.targets)[0]?.actor?.id === actor.id,
        6000,
      );
    };

    if (!placed || !(await targetOnly(tokens[0], handy))) {
      step(
        "the defender's chassis is read off a targeted token, and the headless canvas produced none",
        false,
        JSON.stringify({
          canvasReady: globalThis.canvas?.ready ?? null,
          viewing: globalThis.canvas?.scene?.id ?? null,
          wanted: scene.id,
          drawn,
          placed,
          targets: game.user.targets.size,
        }),
      );
    } else {
      // t5. The Handy's jet engine: "functions exactly the same as a targeted
      //     attack to the legs, except the attack costs 2 more AP" — leg is 2,
      //     so 4 for this ranged shot.
      await api.rollAttack(gunner, gunner.system, rifle, rifle.system, "normal", {
        limb: "jetEngine",
      });
      await settle();
      step(
        "a targeted attack on a Handy's jet engine costs 4 additional AP, ranged (pg 9)",
        lastAttackFlavor().includes("(+4 AP)") && lastAttackFlavor().includes("Jet Engine"),
        lastAttackFlavor().slice(0, 160),
      );

      // t6. And the reprice that proves the *defender's* profile is what was
      //     read: a Handy's eyes "cost 2 less AP", so 3 where the printed table
      //     says 5 (t1 in B4-8a is the same shot with nothing targeted).
      await api.rollAttack(gunner, gunner.system, rifle, rifle.system, "normal", { limb: "eyes" });
      await settle();
      step(
        "the Handy's eyes are repriced to 3 AP, so the card read the defender's body plan (pg 9)",
        lastAttackFlavor().includes("(+3 AP)"),
        lastAttackFlavor().slice(0, 160),
      );

      // t7. The Robobrain's rollers borrow the leg row at the leg's own price —
      //     no AP exception is printed for them.
      const brainTargeted = await targetOnly(tokens[1], robobrain);
      await api.rollAttack(gunner, gunner.system, rifle, rifle.system, "normal", {
        limb: "rollers",
      });
      await settle();
      step(
        "a Robobrain's all terrain rollers cost the leg's 2 additional AP (pg 10)",
        brainTargeted && lastAttackFlavor().includes("(+2 AP)"),
        lastAttackFlavor().slice(0, 160),
      );

      // t8. ⚠ EXPECTED FAILURE until `rollAttack` takes its critical branch from
      //     `severeInjuryFor`. "The rollers … cannot be severed" (pg 10) leaves
      //     the leg row's severe injury with nothing to do, and the ruling is
      //     pg 129's own alternative — up to two of the limb's conditions, which
      //     `FALLOUT.Targeted.cannotSever` already says. `sneak: true` forces the
      //     critical branch without touching the dice: a sneak attack is a
      //     critical hit outright (pg 128) on anything but a natural 1, which is
      //     why the loop below retries a handful of times rather than trusting
      //     one roll — the same shape as B2's de-flaking.
      let severeCard = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const before = game.messages.size;
        await api.rollAttack(gunner, gunner.system, rifle, rifle.system, "normal", {
          limb: "rollers",
          sneak: true,
        });
        await settle();
        if (game.messages.size > before + 1) {
          severeCard = recentContent(2);
          if (!severeCard.includes("critical failure")) break;
        }
      }
      step(
        "a critical hit on rollers that cannot be severed applies conditions instead (pg 10, pg 129)",
        severeCard.includes("cannot be severed") &&
          !severeCard.includes("Severed Leg") &&
          !severeCard.includes("FALLOUT.Targeted.limbs"),
        severeCard.slice(0, 240),
      );
    }
  } finally {
    if (globalThis.canvas?.tokens) canvas.tokens.setTargets([], { mode: "replace" });
    if (viewedBefore) await viewedBefore.view();
    await scene.delete();
    await gunner.delete();
    await handy.delete();
    await robobrain.delete();
  }
}

// C3 — the Handy fuel clock (pg 10). Self-contained: its own SMOKE- actor.
{
  const stampC3 = Date.now();
  const handy = await ActorClass.create({
    name: `SMOKE-Fuel-${stampC3}`,
    type: "character",
    system: {
      details: { race: "robot", robotType: "handy" },
      abilities: { endurance: { value: 10 } },
    },
  });
  try {
    // c3a. under the limit: hours accrue and no checks roll.
    const quiet = await api.advanceFuel(handy, handy.system, 100);
    step(
      "the fuel clock accrues quietly inside the 168-hour week",
      quiet !== null && quiet.fuelHours === 100 && quiet.checks.length === 0,
      JSON.stringify(quiet),
    );

    // c3b. crossing the limit rolls one Endurance check per unpaid hour, DC
    //      12 + 2 per success, and a failure ends in unconsciousness. With
    //      END 10 (+2 mod), DCs 12,14,16... eventually outrun the d20.
    const over = await api.advanceFuel(handy, handy.system, 100);
    const dcsClimb = over.checks.every(
      (check, index) => check.dc === 12 + 2 * index,
    );
    const stoppedAtFailure =
      over.checks.slice(0, -1).every((check) => check.passed) &&
      (over.unconscious === false || over.checks[over.checks.length - 1].passed === false);
    step(
      "past the week: escalating DC checks, stopping at the first failure",
      over !== null && over.fuelHours === 200 && over.checks.length >= 1 && dcsClimb && stoppedAtFailure,
      JSON.stringify({ checks: over.checks.length, unconscious: over.unconscious, first: over.checks[0] }),
    );

    // c3c. filling the tank resets the clock; a fusion core stretches it to 30 days.
    await api.fillFuelTank(handy, handy.system);
    const refilled = handy.system.survival.fuelHours === 0;
    await api.loadFuelCore(handy, handy.system);
    const coreQuiet = await api.advanceFuel(handy, handy.system, 300);
    step(
      "a fill resets the clock, and a fusion core runs 30 days without checks",
      refilled && handy.system.survival.fuelCore === true &&
        coreQuiet.checks.length === 0 && api.fuelLimitHours(true) === 720,
      JSON.stringify({ refilled, core: handy.system.survival.fuelCore, quiet: coreQuiet.checks.length }),
    );

    // c3d. the automatic clock is the Handy's — a Protectron accrues nothing.
    await handy.update({ "system.details.robotType": "protectron", "system.survival.fuelHours": 0, "system.survival.fuelCore": false });
    const notHandy = await api.advanceFuel(handy, handy.system, 500);
    step(
      "the automatic fuel clock runs for Handys only (printed in the Handy entry)",
      notHandy === null && api.fuelClockRuns("robot", "handy") === true && api.fuelClockRuns("robot", "protectron") === false,
      JSON.stringify({ notHandy }),
    );
  } finally {
    await handy.delete();
  }
}


// D3 slice 2 — the weapon-statistic derivation (the keystone).
{
  const Actors = game.actors.documentClass;

  await Actors.createDocuments([{ name: `SMOKE-Derive-Owner-${stamp}`, type: "character" }]);
  const owner = game.actors.getName(`SMOKE-Derive-Owner-${stamp}`);

  try {
    // One printed row, reused by every ranged step so that each assertion is
    // about the mods and not about which fixture it got. Deliberately awkward
    // numbers: load 8 halves cleanly *and* is not the same as 8 minus anything,
    // 2d6 is mid-ladder in both directions, and 6/12 multiply without rounding.
    const PRINTED = {
      weaponType: "rifle",
      apCost: 4,
      damage: "2d6",
      damageType: "ballistic",
      critChance: 20,
      crit: "x2",
      rangeNormal: 6,
      rangeLong: 12,
      magazineSize: 10,
      load: 8,
      strengthReq: 4,
      special: "",
    };
    const rifle = (name, system) => ({
      name: `SMOKE-Derive-${name}-${stamp}`,
      type: "weapon",
      system: { ...PRINTED, ...system },
    });

    await owner.createEmbeddedDocuments("Item", [
      rifle("Bare", {}),
      // 8 → halved to 4 → +2 (Silencer) +4 (Stock) = 10. Add-then-halve would
      // give 7, and the book never says which. Exactly 6 mod slots, so the
      // weapon also still functions (pg 75).
      rifle("Order", { attachedMods: { lightBuild: true, silencer: true, stock: true } }),
      // Ladder, middle: 2d6 → 2d4. The *die* steps, not the count.
      rifle("Step", { attachedMods: { silencer: true } }),
      // Ladder, floor: "to a minimum of d4" (pg 77) — already there.
      rifle("Floor", { damage: "1d4", attachedMods: { silencer: true } }),
      // Ladder, ceiling: "to a maximum of d12" (pg 76), and the Hardened
      // Receiver's step is gated on the weapon *already* printing Destructive.
      rifle("Ceiling", {
        damage: "2d12",
        special: "Destructive.",
        attachedMods: { hardenedReceiver: true },
      }),
      // Order-independence of the ladder: +1 and −1 on the same weapon cancel
      // rather than clamping on the way through. `attachedMods` records no
      // attachment order, so the fold must not depend on one.
      rifle("Cancel", {
        damage: "2d12",
        special: "Destructive.",
        attachedMods: { hardenedReceiver: true, silencer: true },
      }),
      // Range MODIFIERS (× Perception), not feet: 6 ×1.5 ×2 −2 = 16 and
      // 12 ×1.5 ×4 +10 = 82. Six slots again.
      rifle("Range", {
        attachedMods: { improvedRifling: true, longerBarrel: true, scope: true },
      }),
      // +1 +1 +1. Infrared Scope's +2 cannot join them — it conflicts with the
      // Holographic sight — so it gets its own weapon below.
      rifle("Aim", {
        attachedMods: { holographicSight: true, muzzleBrake: true, stock: true },
      }),
      rifle("Infrared", { attachedMods: { infraredScope: true } }),
      // The printed "or" (pg 76), left unanswered on purpose.
      rifle("Choice", { attachedMods: { ergonomicGrip: true } }),
      // A weapon with no printed magazine, and a mod that would add three
      // rounds to it.
      rifle("Unprinted", { magazineSize: 0, attachedMods: { increasedClipSize: true } }),
      // Melee: AP 6 +1 is capped at the row's own printed maximum of 6, load
      // 5 ×1.5 = 7.5, and the same "or" appears on this table too.
      {
        name: `SMOKE-Derive-Melee-${stamp}`,
        type: "weapon",
        system: {
          weaponType: "blunt",
          apCost: 6,
          damage: "2d6",
          crit: "x2",
          critChance: 20,
          load: 5,
          strengthReq: 4,
          attachedMods: { meleeHeavy: true },
        },
      },
    ]);
    await settle();

    // By name, never by createDocuments return order — the returned array is not
    // reliably input-ordered, and a swapped pair here would invert everything.
    const get = (name) => owner.items.getName(`SMOKE-Derive-${name}-${stamp}`);
    const stats = (name) => get(name).system.moddedStats;

    // d1. THE CONTROL, and the one step that has to pass before any other step
    //     means anything: a weapon with no mods derives its printed row back
    //     unchanged, field for field, and says so with `changed: false`. A fold
    //     that quietly rounded, re-formatted a damage string or defaulted a
    //     choice would fail here rather than in six subtle places.
    const bare = get("Bare");
    const bareStats = bare.system.moddedStats;
    step(
      "a weapon with no mods derives its printed numbers, unchanged (pg 65, 75-77)",
      bareStats.changed === false &&
        bareStats.load === 8 &&
        bare.system.effectiveLoad === 8 &&
        bareStats.strengthReq === 4 &&
        bareStats.apCost === 4 &&
        bareStats.critChance === 20 &&
        bareStats.crit === "x2" &&
        bareStats.damage === "2d6" &&
        bareStats.rangeNormal === 6 &&
        bareStats.rangeLong === 12 &&
        bareStats.magazineSize === 10 &&
        bareStats.attackBonus === 0 &&
        bare.system.modAttackBonus === 0 &&
        bareStats.pendingChoices.length === 0 &&
        bareStats.notes.length === 0,
      JSON.stringify(bareStats),
    );

    // d2. ORDER OF APPLICATION. The book prints "load decreases by half"
    //     (Light Build), "load increases by 2" (Silencer) and "increases by 4"
    //     (Stock) and never says which order. Ruled: proportional first, then
    //     flat — the lighter materials are the weapon's own body, the silencer
    //     and the stock are bolted to it afterwards and weigh what they weigh.
    //     8 → 4 → 10. The failing alternative is (8+2+4)/2 = 7.
    const order = stats("Order");
    step(
      "load folds proportional-then-flat: Light Build, Silencer and Stock on a load-8 rifle give 10, not 7",
      order.load === 10 &&
        get("Order").system.effectiveLoad === 10 &&
        // Light Build's other clause rides along, and the weapon is still
        // exactly on its six slots (pg 75), so nothing here is testing a
        // weapon the book says has ceased to function.
        order.strengthReq === 3 &&
        get("Order").system.modSlotsUsed === 6 &&
        get("Order").system.modSlotsExceeded === false,
      JSON.stringify({ load: order.load, str: order.strengthReq, slots: get("Order").system.modSlotsUsed }),
    );

    // d3. THE DAMAGE-DICE LADDER — d4, d6, d8, d10, d12 — with both of the ends
    //     the book prints, and the count left alone. A 2d6 weapon with a
    //     Silencer is 2d4, not 1d6 and not 2d6-1.
    const stepped = stats("Step");
    const floored = stats("Floor");
    const capped = stats("Ceiling");
    const cancelled = stats("Cancel");
    step(
      "the damage die steps a rank and the count does not: 2d6 → 2d4, with the printed d4 floor and d12 ceiling holding",
      stepped.damage === "2d4" &&
        // "to a minimum of d4" (Silencer, pg 77): already there, so nothing
        // moves, and the fold says the bound took it rather than staying quiet.
        floored.damage === "1d4" &&
        floored.notes.some((note) => note.kind === "bounded" && note.stat === "damage") &&
        // "to a maximum of d12" (Hardened Receiver, pg 76), and its step only
        // happens at all because this weapon prints Destructive.
        capped.damage === "2d12" &&
        capped.notes.some((note) => note.kind === "bounded" && note.stat === "damage") &&
        // +1 and −1 on one weapon cancel, rather than the +1 being eaten by the
        // ceiling and the −1 then biting: the flag set records no order.
        cancelled.damage === "2d12",
      JSON.stringify({
        stepped: stepped.damage,
        floored: floored.damage,
        capped: capped.damage,
        cancelled: cancelled.damage,
      }),
    );

    // d4. RANGE MODIFIERS, NOT FEET. Every range clause in the table names the
    //     *modifier* — the ×Perception multiplier the weapon table prints — so
    //     all three of these operate before weaponRange() ever runs, and a Scope
    //     is worth four times as much to a sharp-eyed shooter.
    const range = stats("Range");
    step(
      "range mods multiply the ×Perception modifiers, proportional before flat (6/12 → 16/82)",
      // 6 ×1.5 (Improved Rifling) ×2 (Scope) = 18, then −2 (Longer Barrel).
      range.rangeNormal === 16 &&
        // 12 ×1.5 ×4 = 72, then +10.
        range.rangeLong === 82 &&
        // Scope +2 and Longer Barrel +4; Improved Rifling prints no load.
        range.load === 14,
      JSON.stringify({ normal: range.rangeNormal, long: range.rangeLong, load: range.load }),
    );

    // d5. THE ATTACK-ROLL TOTAL — the cheapest win in the table, and the only
    //     part of this slice with a consumer today: rollAttack sums a `parts`
    //     array and this is one more term in it.
    const aim = stats("Aim");
    const infrared = stats("Infrared");
    step(
      "the four sight/brace rows add to the attack roll total: +1 each, Infrared Scope +2 (pg 76-77)",
      aim.attackBonus === 3 &&
        get("Aim").system.modAttackBonus === 3 &&
        infrared.attackBonus === 2 &&
        // Infrared Scope's other derived clauses ride along: the long range
        // modifier is tripled and the load is +2.
        infrared.rangeLong === 36 &&
        infrared.load === 10 &&
        // Muzzle Brake's −1 Strength requirement is in the same weapon.
        aim.strengthReq === 3,
      JSON.stringify({
        aim: aim.attackBonus,
        infrared: infrared.attackBonus,
        infraredLong: infrared.rangeLong,
        str: aim.strengthReq,
      }),
    );

    // d6. THE PRINTED "OR" IS STATE. Ergonomic Grip and melee Heavy both print
    //     "critical hit modifier or damage dice increases by 1" with no default,
    //     so an unanswered choice applies NEITHER half and reports itself. The
    //     alternative — quietly picking one — would be this system inventing a
    //     rule and hiding it inside a derived number.
    const choiceWeapon = get("Choice");
    const undecided = choiceWeapon.system.moddedStats;
    const undecidedOk =
      undecided.changed === false &&
      undecided.crit === "x2" &&
      undecided.damage === "2d6" &&
      choiceWeapon.system.pendingModChoices.includes("ergonomicGrip") &&
      undecided.notes.some(
        (note) => note.kind === "pendingChoice" && note.mod === "ergonomicGrip",
      );

    await choiceWeapon.update({ "system.modOptions.ergonomicGrip": "crit" });
    await settle();
    const chosenCrit = choiceWeapon.system.moddedStats;

    await choiceWeapon.update({ "system.modOptions.ergonomicGrip": "damage" });
    await settle();
    const chosenDamage = choiceWeapon.system.moddedStats;

    step(
      "an unmade 'critical hit modifier OR damage dice' choice applies neither half, and either answer applies exactly one (pg 76)",
      undecidedOk &&
        // "crit" raises the printed multiplier, which is what the Finesse trait
        // (pg 32) calls it when it prints the same sentence.
        chosenCrit.crit === "x3" &&
        chosenCrit.damage === "2d6" &&
        chosenCrit.pendingChoices.length === 0 &&
        // "damage" walks the same ladder as d3 above.
        chosenDamage.damage === "2d8" &&
        chosenDamage.crit === "x2" &&
        chosenDamage.pendingChoices.length === 0,
      JSON.stringify({
        undecided: { crit: undecided.crit, damage: undecided.damage, notes: undecided.notes },
        crit: chosenCrit.crit,
        damage: chosenDamage.damage,
      }),
    );

    // d7. A STATISTIC THE WEAPON DOES NOT PRINT CANNOT BE MODIFIED. 0 in these
    //     columns means the book printed nothing there (EXTRACTION-NOTES §1),
    //     and attackRangeReport already reads a 0 long range that way. So
    //     Increased Clip Size does not conjure a 3-round magazine onto a weapon
    //     that has none — it says it could not.
    const unprinted = stats("Unprinted");
    step(
      "a mod cannot add rounds to a weapon the book prints no magazine for — it reports instead",
      unprinted.magazineSize === 0 &&
        unprinted.changed === false &&
        unprinted.notes.some(
          (note) =>
            note.kind === "notPrinted" &&
            note.mod === "increasedClipSize" &&
            note.stat === "magazineSize",
        ),
      JSON.stringify({ magazine: unprinted.magazineSize, notes: unprinted.notes }),
    );

    // d8. THE MELEE TABLE, which is shaped differently and whose Heavy row
    //     carries a printed AP ceiling, a proportional load and the same "or".
    //     7.5 is not a rounding bug: this system already carries fractional
    //     loads (AmmoData.load is quantity/10), and the book prints no rounding.
    const melee = owner.items.getName(`SMOKE-Derive-Melee-${stamp}`);
    const heavy = melee.system.moddedStats;
    step(
      "melee Heavy: AP +1 stops at its printed maximum of 6, load ×1.5 keeps its half, STR req +1 (pg 65)",
      heavy.apCost === 6 &&
        heavy.notes.some((note) => note.kind === "bounded" && note.stat === "apCost") &&
        heavy.load === 7.5 &&
        melee.system.effectiveLoad === 7.5 &&
        heavy.strengthReq === 5 &&
        // The melee table's own "or", unanswered here, behaves exactly as the
        // ranged one did in d6.
        melee.system.pendingModChoices.includes("meleeHeavy") &&
        heavy.damage === "2d6",
      JSON.stringify({
        ap: heavy.apCost,
        load: heavy.load,
        str: heavy.strengthReq,
        pending: heavy.pendingChoices,
      }),
    );

    // d9. Detaching walks every number back. Without this, a getter that cached
    //     its first answer would pass every step above.
    await get("Order").update({
      "system.attachedMods.lightBuild": false,
      "system.attachedMods.silencer": false,
      "system.attachedMods.stock": false,
    });
    await settle();
    const stripped = stats("Order");
    step(
      "removing every mod returns the weapon to its printed row",
      stripped.changed === false &&
        stripped.load === 8 &&
        stripped.strengthReq === 4 &&
        stripped.damage === "2d6" &&
        stripped.attackBonus === 0 &&
        get("Order").system.modSlotsUsed === 0,
      JSON.stringify(stripped),
    );
  } finally {
    await owner.delete();
  }
}

// D3 slices 5/6 — Infrared Scope targeting, and the tracking mark.
{
  const Actors = game.actors.documentClass;
  const Scenes = CONFIG.Scene.documentClass;
  const NONE = { cover: "none", heavilyObscured: false, invisible: false };
  const DARK = { cover: "none", heavilyObscured: true, invisible: false };
  const UNSEEN = { cover: "none", heavilyObscured: false, invisible: true };
  const FULL_COVER = { cover: "total", heavilyObscured: false, invisible: false };
  const recentContent = (count = 4) =>
    game.messages.contents
      .slice(-count)
      .map((message) => String(message.content ?? ""))
      .join(" ");

  await Actors.createDocuments([
    {
      name: `SMOKE-ModStealth-Shooter-${stamp}`,
      type: "character",
      system: { abilities: { perception: { value: 5 } } },
    },
    { name: `SMOKE-ModStealth-Quarry-${stamp}`, type: "character" },
  ]);
  const shooter = game.actors.getName(`SMOKE-ModStealth-Shooter-${stamp}`);
  const quarry = game.actors.getName(`SMOKE-ModStealth-Quarry-${stamp}`);
  const viewedBefore = globalThis.canvas?.scene ?? null;
  const scene = await Scenes.create({
    name: `SMOKE-ModStealth-Scene-${stamp}`,
    width: 2000,
    height: 2000,
    grid: { type: 1, size: 100, distance: 5, units: "ft" },
  });

  try {
    // Big enough that the Hide below cannot fail on dice luck — the same
    // insurance every stealth block in this suite takes.
    await quarry.update({ "system.bonuses.skills.sneak": 30 });
    await quarry.update({ "prototypeToken.actorLink": true });

    const rifle = {
      type: "weapon",
      system: {
        weaponType: "rifle",
        damage: "1d10",
        apCost: 5,
        critChance: 20,
        magazineSize: 0,
        rangeNormal: 12,
        rangeLong: 24,
      },
    };
    await shooter.createEmbeddedDocuments("Item", [
      {
        ...rifle,
        name: `SMOKE-ModStealth-Infrared-${stamp}`,
        system: { ...rifle.system, attachedMods: { infraredScope: true } },
      },
      { ...rifle, name: `SMOKE-ModStealth-Plain-${stamp}` },
      {
        name: `SMOKE-ModStealth-Tracker-${stamp}`,
        type: "weapon",
        system: {
          weaponType: "energyWeapon",
          damage: "1d8",
          apCost: 4,
          critChance: 20,
          magazineSize: 0,
          rangeNormal: 8,
          rangeLong: 16,
          attachedMods: { onBoardTargetTracking: true },
        },
      },
    ]);
    await settle();
    // By name, never by createDocuments return order.
    const scoped = shooter.items.getName(`SMOKE-ModStealth-Infrared-${stamp}`);
    const plain = shooter.items.getName(`SMOKE-ModStealth-Plain-${stamp}`);
    const tracker = shooter.items.getName(`SMOKE-ModStealth-Tracker-${stamp}`);

    // --- slice 5: the Infrared Scope's targeting clause (pg 76) -------------

    // ir1. The pure rule, all four verdicts, both with and without the scope.
    //      This is the ruling itself: full cover refuses even the scope, and
    //      the two unseen states are two *different* printed rules (pg 128's
    //      blind attack, pg 134's disadvantage) that the scope both erases.
    step(
      "concealment decides what kind of attack is possible, and the Infrared Scope erases it (pg 76, 128, 130, 134)",
      api.targetingThroughConcealment(NONE) === "normal" &&
        api.targetingThroughConcealment(DARK) === "blind" &&
        api.targetingThroughConcealment(UNSEEN) === "disadvantaged" &&
        api.targetingThroughConcealment(FULL_COVER) === "refused" &&
        api.targetingThroughConcealment(DARK, true) === "normal" &&
        api.targetingThroughConcealment(UNSEEN, true) === "normal" &&
        // The one branch the scope cannot buy: "so long as they are not behind
        // full cover" is printed in the row itself.
        api.targetingThroughConcealment(FULL_COVER, true) === "refused" &&
        // "5 + the amount of feet your target is away from you, rounded down in
        // increments of 5" (pg 128).
        api.blindAttackDC(0) === 5 &&
        api.blindAttackDC(30) === 35 &&
        api.blindAttackDC(32) === 35,
      JSON.stringify({
        dark: api.targetingThroughConcealment(DARK),
        darkScoped: api.targetingThroughConcealment(DARK, true),
        coverScoped: api.targetingThroughConcealment(FULL_COVER, true),
        dc32: api.blindAttackDC(32),
      }),
    );

    // The quarry hides in darkness, from this shooter specifically — the Hide
    // marker's `hiddenFrom` list is what the report reads, so a creature hidden
    // from somebody else is not concealed from us.
    const hideFrom = async (concealment) => {
      await api.revealHidden(quarry, null);
      await api.hide(quarry, quarry.system, { concealment, observers: [shooter] });
      await settle();
    };
    await hideFrom(DARK);
    const hidBefore = api.hiddenState(quarry);

    // ir2. The control, and the half that makes ir3 mean something: the same
    //      creature, the same moment, a rifle without the mod. Nothing is
    //      declared — the concealment is read off the Hide marker.
    const plainReport = await api.reportConcealedTargeting(shooter, plain.system, quarry, {
      distanceFeet: 30,
    });
    await settle();
    step(
      "without the mod, a hidden creature can only be attacked blind (pg 128)",
      hidBefore !== null &&
        hidBefore.hiddenFrom.includes(shooter.name) &&
        plainReport.verdict === "blind" &&
        plainReport.canTargetNormally === false &&
        plainReport.scope === false &&
        plainReport.blindDC === 35 &&
        recentContent(2).includes("blind attack"),
      JSON.stringify(plainReport),
    );

    // ir3. THE POINT OF THE SLICE. Same target, same concealment, the scoped
    //      rifle — and an ordinary attack roll is available.
    const scopedReport = await api.reportConcealedTargeting(shooter, scoped.system, quarry, {
      distanceFeet: 30,
    });
    await settle();
    step(
      "an Infrared Scope can target a hidden creature normally (pg 76)",
      scopedReport.verdict === "normal" &&
        scopedReport.canTargetNormally === true &&
        scopedReport.scope === true &&
        scopedReport.blindDC === null,
      JSON.stringify(scopedReport),
    );

    // ir4. And the ruling's limit, which is the half most likely to be assumed
    //      away: this is targeting, not seeing. The quarry is still hidden,
    //      still needs a Search to find, and still has pg 24's advantage.
    step(
      "targeting through the scope does not un-hide anybody (pg 24, 76, 127)",
      api.hiddenState(quarry) !== null &&
        api.hiddenState(quarry).sneakTotal === hidBefore.sneakTotal &&
        api.hiddenState(quarry).hiddenFrom.includes(shooter.name) &&
        recentContent(2).includes("still hidden"),
      JSON.stringify({ after: api.hiddenState(quarry) }),
    );

    // ir5. Full cover refuses both — the row's own proviso, and pg 130's rule
    //      that `rollAttack` already enforces before ammunition is spent.
    await hideFrom(FULL_COVER);
    const coverScoped = await api.reportConcealedTargeting(shooter, scoped.system, quarry);
    const coverPlain = await api.reportConcealedTargeting(shooter, plain.system, quarry);
    await settle();
    step(
      "full cover still refuses, scope or no scope (pg 76, 130)",
      coverScoped.verdict === "refused" &&
        coverScoped.canTargetNormally === false &&
        coverPlain.verdict === "refused" &&
        coverScoped.concealment.cover === "total",
      JSON.stringify({ scoped: coverScoped.verdict, plain: coverPlain.verdict }),
    );

    // ir6. The declared form, for the two states that have no document: an
    //      invisible target is a normal roll at disadvantage (pg 134), not a
    //      blind attack, and the scope reads through that too.
    const invisiblePlain = await api.reportConcealedTargeting(shooter, plain.system, quarry, {
      concealment: UNSEEN,
    });
    const invisibleScoped = await api.reportConcealedTargeting(shooter, scoped.system, quarry, {
      concealment: UNSEEN,
    });
    // And the override wins in both directions, exactly as `silenced` does.
    const declaredOff = await api.reportConcealedTargeting(shooter, scoped.system, quarry, {
      concealment: DARK,
      infraredScope: false,
    });
    await settle();
    step(
      "invisibility is disadvantage, not a blind attack, and the scope flag can be declared either way (pg 76, 134)",
      invisiblePlain.verdict === "disadvantaged" &&
        invisibleScoped.verdict === "normal" &&
        declaredOff.verdict === "blind" &&
        declaredOff.scope === false,
      JSON.stringify({
        plain: invisiblePlain.verdict,
        scoped: invisibleScoped.verdict,
        declaredOff: declaredOff.verdict,
      }),
    );

    await api.revealHidden(quarry, null);
    await settle();

    // --- slice 6: On-Board Target Tracking's mark (pg 76) -------------------

    // The short range the mark is priced against: the first Range number at
    // this character's Perception (8 x 5 = 40 ft here).
    const shortRange = 8 * shooter.system.derived.abilityScores.perception;

    // k1. No mod, no ability. The 6 AP buys nothing on a bare weapon.
    const noMod = await api.markTarget(shooter, shooter.system, plain, plain.system, quarry);
    await settle();
    step(
      "marking needs the On-Board Target Tracking modification (pg 76)",
      noMod === null && api.markedByTracking(quarry) === null,
      JSON.stringify({ noMod, marked: api.markedByTracking(quarry) }),
    );

    // k2. Out of the weapon's short range, declared — a printed requirement, so
    //     a declared distance that fails it refuses.
    const tooFar = await api.markTarget(shooter, shooter.system, tracker, tracker.system, quarry, {
      distanceFeet: shortRange + 5,
    });
    await settle();
    step(
      "a target past the weapon's short range cannot be marked (pg 76)",
      tooFar === null && api.markedByTracking(quarry) === null,
      JSON.stringify({ tooFar, shortRange }),
    );

    // k3. The mark itself: 6 AP reported, the marker written on the *target*
    //     (unusual for this module and what the sentence asks for), and the
    //     record naming who spent it.
    const marked = await api.markTarget(shooter, shooter.system, tracker, tracker.system, quarry, {
      distanceFeet: 30,
    });
    await settle();
    const record = api.markedByTracking(quarry);
    step(
      "6 AP marks a creature within short range, and the mark lands on the target (pg 76)",
      marked !== null &&
        marked.ap === api.TARGET_MARK_AP_COST &&
        marked.ap === 6 &&
        marked.shortRange === shortRange &&
        record !== null &&
        record.by === shooter.name &&
        record.weapon === tracker.name &&
        api.withinMarkRange(30, shortRange) === true &&
        api.withinMarkRange(shortRange + 1, shortRange) === false &&
        recentContent(2).includes("advantage"),
      JSON.stringify({ marked, record }),
    );

    // k4. A second mark supersedes rather than stacks — one creature, one mark,
    //     the same rule a second Hide follows.
    await api.markTarget(shooter, shooter.system, tracker, tracker.system, quarry, {
      distanceFeet: 10,
    });
    await settle();
    step(
      "a second mark replaces the first rather than stacking",
      quarry.effects.filter((e) => e.getFlag("fallout-ttrpg", "targetMark")).length === 1,
      String(quarry.effects.filter((e) => e.getFlag("fallout-ttrpg", "targetMark")).length),
    );

    // --- the mark reaching an attack roll ----------------------------------
    // Needs a targeted token: `rollAttack` reads `game.user.targets` and only
    // consults the mark when there is exactly one — "the marked creature" is
    // singular, and picking one out of several would be guessing which.
    await scene.view();
    const drawn = await until(() => globalThis.canvas?.scene?.id === scene.id, 20000);
    const tokenData = await quarry.getTokenDocument({ x: 500, y: 500 });
    const [quarryToken] = await scene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
    const placed = drawn && (await until(() => !!canvas.tokens?.get(quarryToken.id), 15000));
    if (placed) canvas.tokens.setTargets([quarryToken.id], { mode: "replace" });
    const targeted =
      placed &&
      (await until(
        () =>
          game.user.targets.size === 1 &&
          Array.from(game.user.targets)[0]?.actor?.id === quarry.id,
        6000,
      ));

    if (!targeted) {
      // One honest failure naming the cause, rather than two that say the same
      // thing. Everything the mark does to documents is covered by k1-k4.
      step(
        "the mark's advantage needs one targeted token, and the headless canvas produced none",
        false,
        JSON.stringify({
          canvasReady: globalThis.canvas?.ready ?? null,
          viewing: globalThis.canvas?.scene?.id ?? null,
          wanted: scene.id,
          drawn,
          placed,
          targets: game.user.targets.size,
        }),
      );
    } else {
      // k5. The advantage reaches the dice, the card says where it came from,
      //     and the mark is spent by that roll — the ruled duration, since the
      //     book prints none.
      await api.rollAttack(shooter, shooter.system, tracker, tracker.system, "normal");
      await settle();
      const markedFlavor = lastAttackFlavor();
      const markedFormula = lastAttackFormula();
      step(
        "an attack against a marked creature has advantage, and spends the mark (pg 76)",
        markedFormula.includes("2d20kh") &&
          markedFlavor.includes("Marked") &&
          api.markedByTracking(quarry) === null,
        JSON.stringify({
          formula: markedFormula,
          flavor: markedFlavor.slice(0, 160),
          stillMarked: api.markedByTracking(quarry) !== null,
        }),
      );

      // k6. And the half that proves k5 is not vacuous: the very next attack,
      //     same shooter, same weapon, same target, is an ordinary roll. Without
      //     this a mark that never ended would pass every step above.
      await api.rollAttack(shooter, shooter.system, tracker, tracker.system, "normal");
      await settle();
      const afterFormula = lastAttackFormula();
      step(
        "the next attack on the same creature is ordinary — the mark ended on its ruled trigger",
        !afterFormula.includes("2d20kh") && !lastAttackFlavor().includes("Marked"),
        afterFormula,
      );

      // k7. The manual drop, for a GM who rules the lock was broken.
      await api.markTarget(shooter, shooter.system, tracker, tracker.system, quarry, {
        distanceFeet: 10,
      });
      await settle();
      const cleared = await api.consumeTargetMark(quarry);
      await settle();
      step(
        "a mark can also be dropped by hand, like every other marker in this module",
        cleared === 1 && api.markedByTracking(quarry) === null,
        JSON.stringify({ cleared }),
      );
    }
  } finally {
    if (globalThis.canvas?.tokens) canvas.tokens.setTargets([], { mode: "replace" });
    if (viewedBefore) await viewedBefore.view();
    await scene.delete();
    await shooter.delete();
    await quarry.delete();
  }
}

// D3 slices 3/7/11 — granted properties, Speedloader, Lucky Charm.
{
  const Actors = game.actors.documentClass;
  const modStamp = Date.now();
  const lastContent = () => String(game.messages.contents.at(-1)?.content ?? "");

  await Actors.createDocuments([
    { name: `SMOKE-ModProps-${modStamp}`, type: "character" },
    { name: `SMOKE-ModPropsNPC-${modStamp}`, type: "npc" },
  ]);
  const guard = game.actors.getName(`SMOKE-ModProps-${modStamp}`);
  const raider = game.actors.getName(`SMOKE-ModPropsNPC-${modStamp}`);

  try {
    // ---------------------------------------------- slice 3: granted properties

    // g1. The merge itself, and the decision behind it in one assertion: the
    //     printed column parses exactly as it always did, and the *same* string
    //     read with the mods attached gains Defensive. Nothing was rewritten —
    //     that is what makes the second half of this step possible.
    const printedSpecial = "Unwieldy.";
    const bare = api.parseKeywords(printedSpecial);
    const merged = api.weaponKeywords(printedSpecial, ["strengthen"]);
    step(
      "ranged Strengthen grants Sturdy and Defensive on top of the printed column (pg 77)",
      bare.defensive === false &&
        merged.defensive === true &&
        merged.unwieldy === true &&
        api.grantedProperties(["strengthen"]).join(",") === "Sturdy,Defensive" &&
        api.effectiveSpecial(printedSpecial, ["strengthen"]) === "Unwieldy. Sturdy. Defensive.",
      JSON.stringify({
        printed: bare.defensive,
        merged: merged.defensive,
        granted: api.grantedProperties(["strengthen"]),
      }),
    );

    // g2. The reason the merge is a merge: Hardened Receiver and Laser Sight
    //     both branch on "if the weapon **already** has" the very property they
    //     grant. Had attaching rewritten `special`, this test would be
    //     unanswerable a moment after the mod went on.
    const plainRifle = "Two Handed.";
    const alreadyDestructive = "Destructive. Two Handed.";
    step(
      'a granted property is still distinguishable from a printed one ("if it already has …")',
      api.hasProperty(plainRifle, "Destructive") === false &&
        api.hasProperty(alreadyDestructive, "Destructive") === true &&
        api.effectiveSpecial(plainRifle, ["hardenedReceiver"]).includes("Destructive") &&
        // Already printed, so it is not repeated — the visible half of the test.
        api.effectiveSpecial(alreadyDestructive, ["hardenedReceiver"]) ===
          "Destructive. Two Handed. Powerful.",
      JSON.stringify({
        plain: api.effectiveSpecial(plainRifle, ["hardenedReceiver"]),
        already: api.effectiveSpecial(alreadyDestructive, ["hardenedReceiver"]),
      }),
    );

    // g3. The melee half of the table, and the one property a mod grants that
    //     changes how the weapon is *held*: Double Sided's Two Handed. (What it
    //     costs to use one-handed is `oneHandedPenalty`, which is unchanged —
    //     this step is about the property arriving at all.) Semi-Automatic is
    //     asserted here too, with its benefit still gated on BACKLOG E1: the
    //     property is parsed, nothing spends the AP it would save.
    const meleeMerged = api.weaponKeywords("Cleave.", ["meleeDoubleSided"]);
    step(
      "melee Double Sided grants Defensive and Two Handed; Semi-Automatic grants its namesake (pg 65, 77)",
      meleeMerged.defensive === true &&
        meleeMerged.twoHanded === true &&
        api.weaponKeywords("", ["semiAutomatic"]).semiAutomatic === true &&
        api.parseKeywords("").semiAutomatic === false &&
        // The eight properties with no hook yet are reported, not silently lost.
        api.grantedProperties(["meleeSharpened"]).join(",") === "Mangle" &&
        api.grantedProperties(["meleeStrengthen"]).join(",") === "Durable" &&
        Object.keys(api.MOD_GRANTED_PROPERTIES).length === 10,
      JSON.stringify({
        defensive: meleeMerged.defensive,
        twoHanded: meleeMerged.twoHanded,
        rows: Object.keys(api.MOD_GRANTED_PROPERTIES).length,
      }),
    );

    // g4. THE POINT OF SLICE 3. Defensive already had a live consumer, so a
    //     granted Defensive has to arrive at a number: blocking is 2 + END, and
    //     2 more while holding a Defensive weapon (pg 61, 70, 127). The block
    //     needs a melee weapon in hand and the charm of this test is that the
    //     Defensive one is the *ranged* weapon — "holding", not "blocking with".
    await guard.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-ModProps-Club-${modStamp}`,
        type: "weapon",
        system: { weaponType: "blunt", damage: "1d6", special: "", equipped: true },
      },
      {
        name: `SMOKE-ModProps-Rifle-${modStamp}`,
        type: "weapon",
        system: {
          weaponType: "rifle",
          damage: "2d6",
          special: printedSpecial,
          equipped: true,
          magazineSize: 0,
          attachedMods: { strengthen: true },
        },
      },
    ]);
    await settle();
    const rifle = guard.items.getName(`SMOKE-ModProps-Rifle-${modStamp}`);
    const endurance = guard.system.derived.abilityMods.endurance;

    const withCharmDt = await api.startBlocking(guard, guard.system);
    await api.endBlocking(guard);
    await settle();
    await rifle.update({ "system.attachedMods.strengthen": false });
    await settle();
    const withoutDt = await api.startBlocking(guard, guard.system);
    await api.endBlocking(guard);
    await settle();
    step(
      "a Strengthened weapon's granted Defensive reaches the block's damage threshold (pg 77 -> 127)",
      withCharmDt === 2 + endurance + api.DEFENSIVE_BLOCK_DT &&
        withoutDt === 2 + endurance &&
        // And the transcription on the document was never touched by any of it.
        rifle.system.special === printedSpecial,
      JSON.stringify({ withCharmDt, withoutDt, endurance, special: rifle.system.special }),
    );

    // ------------------------------------------------- slice 7: the Speedloader

    // s1. "You can choose to reload the weapon with 4 AP" (pg 77) — an
    //     alternative reported *beside* the printed cost, never replacing it.
    //     Every revolver the book prints has Manual Reload, so the printed cost
    //     is a 3 AP floor on a partial reload and the Speedloader is 4 AP for
    //     the whole cylinder: taking the cheaper of the two would report 3.
    const revolver = api.parseKeywords("Accurate, Manual Reload");
    const plain = api.reloadCost(revolver);
    const loaded = api.reloadCost(revolver, ["speedloader"]);
    step(
      "the Speedloader offers a 4 AP reload alongside the printed Manual Reload, not instead of it (pg 77)",
      plain.kind === "manual" &&
        plain.minimumAp === 3 &&
        plain.alternative === null &&
        loaded.kind === "manual" &&
        loaded.minimumAp === 3 &&
        loaded.alternative?.ap === api.RELOAD_AP_SPEEDLOADER &&
        loaded.alternative?.mod === "speedloader" &&
        // Six rounds cost six AP by hand and four with the device.
        api.fullReloadAp(plain, 6) === 6 &&
        api.fullReloadAp(loaded, 6) === 4,
      JSON.stringify({ plain, loaded, full: api.fullReloadAp(loaded, 6) }),
    );

    // s2. And from a document, which is the path the Reload control will take —
    //     plus the one row in the table that costs no mod slots at all (pg 77).
    await guard.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-ModProps-Revolver-${modStamp}`,
        type: "weapon",
        system: {
          weaponType: "handgun",
          special: "Accurate, Manual Reload",
          magazineSize: 6,
          attachedMods: { speedloader: true },
        },
      },
    ]);
    await settle();
    const wheelgun = guard.items.getName(`SMOKE-ModProps-Revolver-${modStamp}`);
    const fromDoc = api.reloadCost(
      api.parseKeywords(wheelgun.system.special),
      wheelgun.system.attachedModKeys,
    );
    step(
      "a revolver document carries the Speedloader and it costs none of the six mod slots (pg 75, 77)",
      fromDoc.alternative?.ap === 4 &&
        wheelgun.system.modSlotsUsed === 0 &&
        wheelgun.system.modSlotsExceeded === false &&
        // The un-modded reload getter is unchanged: the alternative is extra.
        wheelgun.system.reloadCost === 3,
      JSON.stringify({
        alternative: fromDoc.alternative,
        slots: wheelgun.system.modSlotsUsed,
        printed: wheelgun.system.reloadCost,
      }),
    );

    // -------------------------------------------------- slice 11: Lucky Charm

    // l1. One charm is not a conflict, and nothing is said about it.
    await guard.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-ModProps-Charm-A-${modStamp}`,
        type: "weapon",
        system: { weaponType: "handgun", attachedMods: { luckyCharm: true } },
      },
    ]);
    await settle();
    const quietBefore = game.messages.contents.length;
    const single = api.luckyCharmConflict(guard);
    await api.announceLuckyCharms(guard);
    await settle();
    step(
      "one lucky charm is the legal arrangement and says nothing (pg 76)",
      single.conflict === false &&
        single.limited === true &&
        single.weapons.length === 1 &&
        game.messages.contents.length === quietBefore,
      JSON.stringify({ single, posted: game.messages.contents.length - quietBefore }),
    );

    // l2. THE POINT OF SLICE 11. A second charm on a second weapon is the
    //     arrangement the book forbids — and it is *reported*, not refused: both
    //     flags are still set after the announcement, because a weapon cannot
    //     answer an actor-scoped rule and this system does not delete a benefit
    //     a player can read on their own sheet.
    await guard.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-ModProps-Charm-B-${modStamp}`,
        type: "weapon",
        system: { weaponType: "rifle", attachedMods: { luckyCharm: true } },
      },
    ]);
    await settle();
    const pair = api.luckyCharmConflict(guard);
    await api.announceLuckyCharms(guard);
    await settle();
    const charmA = guard.items.getName(`SMOKE-ModProps-Charm-A-${modStamp}`);
    const charmB = guard.items.getName(`SMOKE-ModProps-Charm-B-${modStamp}`);
    step(
      "two lucky charms on two weapons are reported and neither is blocked (pg 76)",
      pair.conflict === true &&
        pair.weapons.length === 2 &&
        api.luckyCharmWeapons(guard).length === 2 &&
        // Nothing was refused, unset, or unattached by the report.
        charmA.system.attachedMods.luckyCharm === true &&
        charmB.system.attachedMods.luckyCharm === true &&
        charmA.system.hasMod("luckyCharm") === true &&
        lastContent().includes("lucky charm"),
      JSON.stringify({
        pair,
        stillA: charmA.system.attachedMods.luckyCharm,
        stillB: charmB.system.attachedMods.luckyCharm,
      }),
    );

    // l3. The scope ruling: "each **player character**" is read as the actor
    //     type, so a raider with a charm in each hand is a GM's business and
    //     draws no card at all.
    await raider.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-ModProps-NPC-Charm-A-${modStamp}`,
        type: "weapon",
        system: { weaponType: "handgun", attachedMods: { luckyCharm: true } },
      },
      {
        name: `SMOKE-ModProps-NPC-Charm-B-${modStamp}`,
        type: "weapon",
        system: { weaponType: "handgun", attachedMods: { luckyCharm: true } },
      },
    ]);
    await settle();
    const npcBefore = game.messages.contents.length;
    const npcReport = api.luckyCharmConflict(raider);
    await api.announceLuckyCharms(raider);
    await settle();
    step(
      "the one-per-character clause is scoped to player characters, so an NPC is not policed (pg 76)",
      npcReport.limited === false &&
        npcReport.conflict === false &&
        npcReport.weapons.length === 2 &&
        game.messages.contents.length === npcBefore,
      JSON.stringify({ npcReport, posted: game.messages.contents.length - npcBefore }),
    );
  } finally {
    await guard.delete();
    await raider.delete();
  }
}

// The 2026-08-14 v2.1 coverage audit — one block for each of its four gaps.
{
  const Actors = game.actors.documentClass;
  const auStamp = Date.now();
  const lastCard = () => String(game.messages.contents.at(-1)?.content ?? "");

  await Actors.createDocuments([{ name: `SMOKE-Audit-${auStamp}`, type: "character" }]);
  const bot = game.actors.getName(`SMOKE-Audit-${auStamp}`);

  try {
    // ---------------------------------------------------------- G1: Short Circuit

    // s1. THE GAP. Short Circuit was the only v2.1-new condition that was
    //     half-built: the −1 max AP per level landed and every other clause in
    //     the entry was absent, so it was a counter with no clock while
    //     Bleeding's identical twin ticked forty lines away.
    // Hit points are set **below** the maximum on purpose. `fullHealShortCircuit`
    // watches every hit-point write and clears the condition at full health, so
    // a fixture that topped the actor off would silently delete the very levels
    // it had just set — and every step below would then be testing nothing.
    // The hit-point maximum is pinned by override rather than derived, and it is
    // pinned **well above 24** — two levels of Short Circuit roll 2d12, so an
    // actor with 9 hit points dies to the tick, the dying clause clears the
    // condition, and every step below then runs against a creature that is not
    // shorting out. That is exactly what the first live run of this block did.
    //
    // It also makes the tick assertion mean something: with hit points below
    // the roll, `lost` is capped by the floor at 0 and a wildly wrong formula
    // reports the same number a correct one does.
    await bot.update({ "system.overrides.hpMax": 80 });
    const scMax = bot.system.derived.hpMax;
    await bot.update({
      "system.conditions.shortCircuit": 2,
      "system.resources.hp.value": scMax - 1,
    });
    step(
      "the Short Circuit fixture holds its levels and can survive its own tick (guards every step below)",
      bot.system.conditions.shortCircuit === 2 &&
        bot.system.resources.hp.value < scMax &&
        // Two levels roll at most 24, so the actor must have more than that.
        bot.system.resources.hp.value > 24,
      JSON.stringify({ levels: bot.system.conditions.shortCircuit, hp: bot.system.resources.hp.value, max: scMax }),
    );
    const withLevels = bot.system.derived.apMax;
    await bot.update({ "system.conditions.shortCircuit": 0 });
    const withoutLevels = bot.system.derived.apMax;
    await bot.update({ "system.conditions.shortCircuit": 2 });
    step(
      "Short Circuit costs 1 max AP per level, which was the only clause that ever shipped (pg 135)",
      withoutLevels - withLevels === 2,
      JSON.stringify({ withLevels, withoutLevels }),
    );

    // s1b. THE HOLE ITSELF: the per-turn tick. `combat/turns.ts` ticked Burning,
    //      Healing Powder and Bleeding and returned — Short Circuit's 1d12 per
    //      level never fired, so the condition could sit on a sheet forever
    //      costing nothing but AP. Driven through a real combat, because the
    //      tick lives on `combatTurnChange` like every other start-of-turn rule.
    const Combats = game.combats.documentClass;
    const sceneId = game.scenes?.current?.id ?? game.scenes?.contents?.[0]?.id ?? null;
    const scCombat = await Combats.create({ scene: sceneId });
    await scCombat.activate();
    await scCombat.createEmbeddedDocuments("Combatant", [{ actorId: bot.id, initiative: 20 }]);
    const hpBeforeTick = bot.system.resources.hp.value;
    await scCombat.startCombat();
    const ticked = await until(() => bot.system.resources.hp.value < hpBeforeTick, 12000);
    // `beginTurn` writes the actor and *then* posts its card, so waiting on the
    // hit-point drop can win a race against the card that explains it. Settle
    // before reading chat, or this asserts on whatever was posted last.
    await settle(900);
    const lost = hpBeforeTick - bot.system.resources.hp.value;
    step(
      "Short Circuit takes 1d12 electricity per level at the start of the turn (pg 135)",
      ticked &&
        // Two levels, so 2d12: between 2 and 24. The actor survives it, so this
        // is the roll itself rather than a number the hit-point floor capped —
        // which is what made the concatenation bug (2 levels rolling 21d12)
        // visible in the first place.
        lost >= 2 &&
        lost <= 24 &&
        bot.system.resources.hp.value > 0 &&
        lastCard().includes("Short Circuit"),
      JSON.stringify({ lost, hp: bot.system.resources.hp.value }),
    );
    await scCombat.delete();

    // s2. The re-route: 6 AP for one level, not all of them. "Reset your
    //     circuit" is the flavour and "remove one level" is the effect, and
    //     reading the first as overriding the second would make 6 AP strictly
    //     better than the full-heal clause the same paragraph prints.
    const reroute = await api.rerouteShortCircuit(bot);
    await settle();
    step(
      "re-routing removes exactly one level for 6 AP, reported not deducted (pg 135)",
      reroute?.before === 2 &&
        reroute.after === 1 &&
        bot.system.conditions.shortCircuit === 1 &&
        // "6 AP", not a bare "6": the number alone would be satisfied by any
        // digit that happened to land in the card.
        lastCard().includes("6 AP"),
      JSON.stringify({ reroute, now: bot.system.conditions.shortCircuit }),
    );

    // s3. Wet doubles the levels — on the *transition*, not on being wet. A
    //     clause that fired every time the flag was re-asserted would multiply a
    //     creature standing in the rain out of existence in four rounds.
    // The rule, as a computation. `wetShortCircuit` is **pure** — it decides what
    // the levels become and writes nothing, because the write belongs to the
    // `preUpdateActor` hook that folds it into the update that triggered it.
    // Asserting the actor's stored level here would be asserting the hook, which
    // is s3b's job and needs the sheet to be driven for real.
    const levelsForWet = bot.system.conditions.shortCircuit;
    const wetAgain = api.wetShortCircuit(bot, true, true);
    const wetNow = api.wetShortCircuit(bot, false, true);
    step(
      "becoming wet doubles the levels once; staying wet does nothing (pg 135)",
      wetAgain === null &&
        wetNow?.before === levelsForWet &&
        wetNow.after === levelsForWet * 2 &&
        // Pure: nothing was written by asking.
        bot.system.conditions.shortCircuit === levelsForWet,
      JSON.stringify({ staying: wetAgain, becoming: wetNow, stored: bot.system.conditions.shortCircuit }),
    );

    // s4. Healed to full removes all of them, and it is the state reached that
    //     matters rather than the size of the heal. Levels are set here rather
    //     than inherited: s3 above is a pure computation and deliberately
    //     changes nothing, so leaning on it would couple this step to a
    //     neighbour that does not write.
    await bot.update({ "system.conditions.shortCircuit": 2 });
    const cleared = await api.fullHealShortCircuit(
      bot,
      bot.system.derived.hpMax,
      bot.system.derived.hpMax,
    );
    await settle();
    step(
      "healing to full hit points removes every level of Short Circuit (pg 135)",
      cleared?.before === 2 &&
        cleared.after === 0 &&
        bot.system.conditions.shortCircuit === 0 &&
        // And a partial heal does not.
        (await api.fullHealShortCircuit(bot, 1, 10)) === null,
      JSON.stringify({ cleared, now: bot.system.conditions.shortCircuit }),
    );

    // s3b. The wet clause through the *sheet*, which is the path s3 bypasses and
    //      the path that was broken. It used to fire from `_prepareSubmitData`
    //      with an unawaited `actor.update`, racing the very submit that
    //      triggered it — and both writes carried
    //      `system.conditions.shortCircuit`, because the level input and the wet
    //      checkbox are on the same form. Whichever landed last won, so the
    //      doubling either applied or was silently reverted to the stale
    //      rendered value while the card announced it regardless.
    await bot.update({
      "system.conditions.shortCircuit": 2,
      "system.environment.exposedWet": false,
    });
    await bot.sheet.render(true);
    await settle(1200);
    const wetBox = bot.sheet.element?.querySelector('input[name="system.environment.exposedWet"]');
    if (wetBox) {
      wetBox.checked = true;
      wetBox.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const doubled = await until(() => bot.system.conditions.shortCircuit === 4, 8000);
    step(
      "ticking the wet box on the sheet doubles the levels and the submit does not revert it (pg 135)",
      !!wetBox &&
        doubled &&
        bot.system.environment.exposedWet === true &&
        // Settle and re-read: a losing race would land the stale 2 a beat later.
        (await (async () => {
          await settle(900);
          return bot.system.conditions.shortCircuit === 4;
        })()),
      JSON.stringify({
        levels: bot.system.conditions.shortCircuit,
        wet: bot.system.environment.exposedWet,
      }),
    );
    await bot.sheet.close();
    await bot.update({ "system.environment.exposedWet": false, "system.conditions.shortCircuit": 2 });

    // s4b. THE ONLY CLAUSE WHOSE DELIVERY IS A FOUNDRY ASSUMPTION. s4 above calls
    //      `fullHealShortCircuit` directly, which proves the rule and proves
    //      nothing about how it reaches a player: that runs through an
    //      `updateActor` hook reading the `changes` object, and a hook that
    //      never fires — or fires with a shape this build does not expect —
    //      fails silently and identically to one that works. So this heals for
    //      real, through the aid pipeline, and never touches the function.
    await bot.update({
      "system.conditions.shortCircuit": 3,
      "system.resources.hp.value": 1,
    });
    await bot.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Audit-Stim-${auStamp}`,
        type: "aid",
        // A fixed formula big enough to top the actor off from 1 hit point,
        // since reaching the maximum is the trigger's own condition.
        system: { aidType: "medicine", healFormula: "999", quantity: 1 },
      },
    ]);
    const stim = bot.items.getName(`SMOKE-Audit-Stim-${auStamp}`);
    const levelsBeforeHeal = bot.system.conditions.shortCircuit;
    await api.useAid(bot, bot.system, stim);
    const hookFired = await until(() => bot.system.conditions.shortCircuit === 0, 8000);
    step(
      "a real heal to full clears Short Circuit through the updateActor hook, not a direct call (pg 135)",
      levelsBeforeHeal === 3 &&
        hookFired &&
        bot.system.resources.hp.value === bot.system.derived.hpMax,
      JSON.stringify({
        before: levelsBeforeHeal,
        after: bot.system.conditions.shortCircuit,
        hp: bot.system.resources.hp.value,
        max: bot.system.derived.hpMax,
      }),
    );

    // ------------------------------------------------------------ G4: death saves

    // s5. THE DEFECT. `rollDeathSave` was the one d20 roll in the system that
    //     never called `d20Modifiers`, against fourteen call sites that do — so
    //     no leveled penalty and no perk d20 bonus ever reached one. The Luck
    //     exemption was satisfied by accident rather than by rule.
    await bot.update({
      "system.conditions.hunger": 3,
      "system.abilities.luck": 4,
      "system.abilities.endurance": 14,
      "system.resources.hp.value": 0,
      "system.resources.deathSaves.successes": 0,
      "system.resources.deathSaves.failures": 0,
    });
    const penalty = bot.system.derived.d20Penalty;
    await api.rollDeathSave(bot, bot.system, "endurance");
    await settle();
    const endFormula = lastAttackFormula();
    step(
      "a death save carries the leveled penalty when Endurance is elected (pg 133, 135-137)",
      penalty === 3 && endFormula.includes(`-${String(penalty)}`),
      JSON.stringify({ penalty, formula: endFormula }),
    );

    // s6. And the exemption, by rule this time: electing Luck drops the same
    //     penalty because Luck rolls ignore the leveled conditions (pg 124).
    await bot.update({ "system.resources.hp.value": 0 });
    await api.rollDeathSave(bot, bot.system, "luck");
    await settle();
    const luckFormula = lastAttackFormula();
    step(
      "electing Luck exempts the same save from the same penalty (pg 124, 132-134)",
      !luckFormula.includes(`-${String(penalty)}`) && lastAttackFlavor().includes("Luck"),
      JSON.stringify({ formula: luckFormula }),
    );

    // ------------------------------------------------------- G3: eyes/head range

    // s7. The v2.1 targeted table's one genuinely ambiguous cell. The book's
    //     "to hit ranged attack modifier is halved" can be read as the attack
    //     bonus or the range; the patch notes settle it — "attacking the eyes
    //     and head now halves the range of the weapon".
    step(
      "only the eyes and head rows halve the weapon's range (pg 129)",
      api.halvesRange("eyes") === true &&
        api.halvesRange("head") === true &&
        api.halvesRange("arm") === false &&
        api.halvesRange("torso") === false &&
        api.halvesRange(null) === false &&
        api.RANGE_HALVING_LIMBS.length === 2,
      JSON.stringify({ limbs: api.RANGE_HALVING_LIMBS }),
    );

    // s8. Live: the same shot, once at the body and once at the head, at a
    //     distance that sits inside normal range for one and past it for the
    //     other. The halving is the only thing that changed.
    // Weather scales every range in the system, and earlier blocks in this suite
    // set it. Cleared explicitly, or the "normal band" this step is built around
    // is whatever the last block left behind — which is how the first live run
    // of this step found the *body* shot already at disadvantage.
    // Severity 0 with no radiation unsets the flag entirely, which is how this
    // system spells "no weather" — there is no `clear` type.
    await api.setWeather({ type: "fog", severity: 0, radSeverity: 0, linked: 0 });
    await settle();
    await bot.update({
      "system.conditions.hunger": 0,
      "system.abilities.perception.value": 10,
      "system.resources.hp.value": 40,
    });
    await bot.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Audit-Rifle-${auStamp}`,
        type: "weapon",
        system: {
          weaponType: "rifle",
          damage: "1d10",
          apCost: 5,
          critChance: 20,
          magazineSize: 20,
          loadedAmmo: 20,
          rangeNormal: 4,
          rangeLong: 8,
          equipped: true,
        },
      },
    ]);
    const rifle = bot.items.getName(`SMOKE-Audit-Rifle-${auStamp}`);
    // Perception *score* 10, ×4 normal = 40 ft, so 30 ft is inside it; halved is
    // 20 ft, so 30 ft is outside that. Asserted rather than assumed, because
    // every ingredient here (the score, the weather scale, the printed
    // multiplier) is something another block can move.
    const perScore = bot.system.derived.abilityScores.perception;
    step(
      "the range fixture is what this step assumes: PER 10, ×4 normal, no weather scaling",
      perScore === 10 && rifle.system.rangeNormal === 4 && api.rangeMultiplier() === 1,
      JSON.stringify({
        perScore,
        normal: rifle.system.rangeNormal,
        weatherScale: api.rangeMultiplier(),
      }),
    );
    await api.rollAttack(bot, bot.system, rifle, rifle.system, "normal", { distanceFeet: 30 });
    await settle();
    const bodyShot = lastAttackFormula();
    await api.rollAttack(bot, bot.system, rifle, rifle.system, "normal", {
      distanceFeet: 30,
      limb: "head",
    });
    await settle();
    const headShot = lastAttackFormula();
    const headFlavor = lastAttackFlavor();
    step(
      "a head shot at 30 ft is past a halved 20 ft normal range, where a body shot at 30 ft is not",
      // The body shot being straight is the control: without it, a head shot at
      // disadvantage proves nothing about the halving.
      !bodyShot.includes("2d20kl") &&
        headShot.includes("2d20kl") &&
        headFlavor.includes("halves this weapon's range"),
      JSON.stringify({ body: bodyShot, head: headShot }),
    );
  } finally {
    await bot.delete();
  }
}

// Crafting and repair actually spend their materials — the half of D2 the
// backlog named and the seam that was still missing.
{
  const Actors = game.actors.documentClass;
  const rcStamp = Date.now();
  const lastCard = () => String(game.messages.contents.at(-1)?.content ?? "");

  await Actors.createDocuments([{ name: `SMOKE-Recipe-${rcStamp}`, type: "character" }]);
  const maker = game.actors.getName(`SMOKE-Recipe-${rcStamp}`);

  const junk = async (type, quantity) => {
    await maker.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Recipe-${type}-${rcStamp}`,
        type: "gear",
        system: { junkType: type, quantity },
      },
    ]);
  };

  const pattern = async (name, materials) => {
    const [doc] = await maker.createEmbeddedDocuments("Item", [
      {
        name,
        type: "weapon",
        system: { decay: 0 },
        flags: {
          "fallout-ttrpg": {
            blueprint: {
              name,
              category: "bladed-melee-weapons",
              craftDC: 0,
              craftMaterials: materials,
              craftTime: "1 hour.",
            },
          },
        },
      },
    ]);
    return doc;
  };

  try {
    await maker.update({ "system.skills.crafting.points": 30 });

    // c1. THE POINT. The cost was always computed correctly and always merely
    //     printed, because junk was not a document. It is spent now.
    await junk("steel", 10);
    await junk("wood", 10);
    const blade = await pattern(`SMOKE-Recipe-Blade-${rcStamp}`, "x3 steel, x2 wood.");
    const steelBefore = api.junkHeld(maker, "steel");
    const woodBefore = api.junkHeld(maker, "wood");
    const made = await api.craftItem(maker, maker.system, blade);
    await settle();
    step(
      "crafting spends the materials it has always reported (pg 92)",
      made.succeeded === true &&
        api.junkHeld(maker, "steel") === steelBefore - 3 &&
        api.junkHeld(maker, "wood") === woodBefore - 2,
      JSON.stringify({
        steel: [steelBefore, api.junkHeld(maker, "steel")],
        wood: [woodBefore, api.junkHeld(maker, "wood")],
      }),
    );

    // c2. Ruling 1: a cell printing "or" spends nothing. `parseMaterials` splits
    //     on "or", so both branches arrive as countable lines — charging both
    //     bills the player twice for one choice, and charging the first picks a
    //     branch for them. Neither is this system's to do.
    await junk("cloth", 20);
    const clothBefore = api.junkHeld(maker, "cloth");
    const bandage = await pattern(
      `SMOKE-Recipe-Bandage-${rcStamp}`,
      "x10 cloth or x1 large animal fur.",
    );
    await api.craftItem(maker, maker.system, bandage);
    await settle();
    step(
      'a recipe printing "or" spends nothing and says the pick is the table\'s',
      api.junkHeld(maker, "cloth") === clothBefore &&
        lastCard().includes("will not pick a branch"),
      JSON.stringify({ cloth: [clothBefore, api.junkHeld(maker, "cloth")] }),
    );

    // c3. Ruling 3: a material this system ships no document for is reported
    //     apart from a shortfall. Roughly forty Encyclopedia lines name a found
    //     object — a ski, a bear skull — and they are *correctly* unpayable, so
    //     folding them in with "you are three steel short" would make a working
    //     recipe look broken every time it ran.
    const oddity = await pattern(`SMOKE-Recipe-Ski-${rcStamp}`, "x1 ski, x1 steel.");
    const steelBeforeSki = api.junkHeld(maker, "steel");
    await api.craftItem(maker, maker.system, oddity);
    await settle();
    const skiCard = lastCard();
    step(
      "a material with no document is reported apart from a shortfall, and the rest still pays",
      api.junkHeld(maker, "steel") === steelBeforeSki - 1 &&
        skiCard.includes("ski") &&
        skiCard.includes("no document"),
      JSON.stringify({ steel: [steelBeforeSki, api.junkHeld(maker, "steel")] }),
    );

    // c4. A genuine shortfall is still a shortfall, and still does not block —
    //     the craft resolved before the spend, so a missing material is the
    //     table's to settle and never voids a roll already made.
    const greedy = await pattern(`SMOKE-Recipe-Greedy-${rcStamp}`, "x999 steel.");
    const steelBeforeGreedy = api.junkHeld(maker, "steel");
    const strained = await api.craftItem(maker, maker.system, greedy);
    await settle();
    step(
      "a shortfall is reported and the craft still stands — nothing is half-spent",
      strained.succeeded === true &&
        api.junkHeld(maker, "steel") === steelBeforeGreedy &&
        // "x999" as the recipe prints it, so a stamp carrying those digits
        // cannot stand in for the shortfall line.
        lastCard().includes("x999"),
      JSON.stringify({ steel: [steelBeforeGreedy, api.junkHeld(maker, "steel")] }),
    );

    // c5. Repair, which never even parsed its blueprint: it printed a generic
    //     "spend what the Encyclopedia lists" line. Failure halves the cost
    //     rounded down, which is the printed rule and the reason most failed
    //     repairs cost nothing at all.
    const worn = await pattern(`SMOKE-Recipe-Worn-${rcStamp}`, "x4 steel.");
    await worn.update({ "system.decay": 3, "system.repairBonus": 0 });
    const steelBeforeRepair = api.junkHeld(maker, "steel");
    const fixed = await api.repairItem(maker, maker.system, worn, { repairBonus: 0 });
    await settle();
    step(
      "repairing spends the blueprint's materials, which it never used to read (pg 93)",
      fixed.succeeded === true && api.junkHeld(maker, "steel") === steelBeforeRepair - 4,
      JSON.stringify({
        steel: [steelBeforeRepair, api.junkHeld(maker, "steel")],
        succeeded: fixed.succeeded,
      }),
    );
  } finally {
    await maker.delete();
  }
}

// D3 slice 10 — attaching a mod as a transaction rather than a hand-written
// boolean: the document is spent, the swap is priced, eligibility is surfaced.
{
  const Actors = game.actors.documentClass;
  const atStamp = Date.now();
  const lastCard = () => String(game.messages.contents.at(-1)?.content ?? "");

  await Actors.createDocuments([{ name: `SMOKE-Attach-${atStamp}`, type: "character" }]);
  const smith = game.actors.getName(`SMOKE-Attach-${atStamp}`);

  try {
    await smith.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Attach-Rifle-${atStamp}`,
        type: "weapon",
        system: { weaponType: "rifle", damage: "1d10", apCost: 5, critChance: 20, magazineSize: 10 },
      },
      // Two copies, so the spend can be seen to take exactly one.
      {
        name: `SMOKE-Attach-Silencer-${atStamp}`,
        type: "gear",
        system: { modKey: "silencer", quantity: 2 },
      },
    ]);
    const rifle = smith.items.getName(`SMOKE-Attach-Rifle-${atStamp}`);

    // a1. The transaction. Before this slice the flag was written by hand, so a
    //     crafted mod document sat in the pack forever and the swap time was
    //     never priced. All four halves in one step.
    const heldBefore = api.modHeld(smith, "silencer");
    const attach = await api.attachMod(smith, rifle, "silencer", smith.system);
    await settle();
    step(
      "fitting a mod spends one held copy, sets the flag, and prices the swap (pg 77)",
      attach.consumed === true &&
        heldBefore === 2 &&
        api.modHeld(smith, "silencer") === 1 &&
        rifle.system.attachedMods.silencer === true &&
        rifle.system.hasMod("silencer") === true &&
        // The Silencer's column prices the swap in **AP**, not minutes — the
        // shape that caught the first version of this, which reported a 6 AP
        // swap as a modification the book gives no way to move.
        attach.swap.kind === "ap" &&
        attach.swap.ap === 6 &&
        attach.minutes === null &&
        attach.slots === api.WEAPON_MODS.silencer.slots &&
        attach.ceased === false,
      JSON.stringify({ held: api.modHeld(smith, "silencer"), report: attach }),
    );

    // a1b. The other two currencies. Most rows price the swap in minutes with an
    //      Intelligence discount, and the Speedloader's column prints "N/A" —
    //      three shapes, and a report that carried only a number conflated the
    //      last two.
    const stockReport = await api.attachMod(smith, rifle, "stock", smith.system);
    await settle();
    step(
      "the swap cost is reported in whichever currency the row prints (minutes, AP, or none)",
      stockReport.swap.kind === "minutes" &&
        typeof stockReport.minutes === "number" &&
        api.WEAPON_MODS.speedloader.swap.kind === "never" &&
        api.swapMinutes(api.WEAPON_MODS.speedloader.swap, 10) === null &&
        // The Intelligence discount is real: a higher score fits it faster.
        api.swapMinutes(api.WEAPON_MODS.stock.swap, 10) <
          api.swapMinutes(api.WEAPON_MODS.stock.swap, 0),
      JSON.stringify({ swap: stockReport.swap, minutes: stockReport.minutes }),
    );
    await api.detachMod(smith, rifle, "stock", smith.system);
    await settle();

    // a2. The Silencer reaching the roll is D3 slice 1 and already covered; what
    //     this asserts is that the *transaction* is what put it there — the
    //     weapon now silences without anybody declaring `silenced`.
    step(
      "the fitted mod is live immediately: the weapon silences with nothing declared (pg 77)",
      rifle.system.silenced === true && api.silences(rifle.system.attachedModKeys) === true,
      JSON.stringify({ silenced: rifle.system.silenced }),
    );

    // a3. Fitting it twice is a no-op, not a second spend. The one refusal in a
    //     module that otherwise never refuses — because it is not a rule to
    //     weigh, it is nothing to do.
    const again = await api.attachMod(smith, rifle, "silencer", smith.system);
    await settle();
    step(
      "fitting a mod that is already on is refused before a second copy is eaten",
      again === null && api.modHeld(smith, "silencer") === 1,
      JSON.stringify({ returned: again, held: api.modHeld(smith, "silencer") }),
    );

    // a4. Eligibility is advisory, and the card carries the clauses rather than
    //     the attach refusing them. A melee mod on a rifle fails on category —
    //     about as clearly ineligible as the table gets — and still goes on.
    const wrong = await api.attachMod(smith, rifle, "meleeSharpened", smith.system);
    await settle();
    const wrongCard = lastCard();
    step(
      "an ineligible mod is fitted anyway and its failed clauses are named (advisory, pg 65)",
      wrong.reasons.length > 0 &&
        wrong.reasons.some((reason) => reason.kind === "category") &&
        rifle.system.attachedMods.meleeSharpened === true &&
        // Nothing was held, so the shortfall is reported rather than blocking.
        wrong.consumed === false &&
        wrongCard.includes("melee"),
      JSON.stringify({ reasons: wrong.reasons, consumed: wrong.consumed }),
    );

    // a5. Detaching gives the part back. The ruling: the column prints a time to
    //     *unequip* as well as to equip, and the Lucky Charm row says outright
    //     that a charm moves between weapons, so a mod that evaporated when
    //     unscrewed would contradict the only row describing the operation.
    const detach = await api.detachMod(smith, rifle, "silencer", smith.system);
    await settle();
    step(
      "taking a mod off clears the flag and returns the part to the pack (pg 77)",
      detach !== null &&
        rifle.system.attachedMods.silencer === false &&
        rifle.system.silenced === false &&
        api.modHeld(smith, "silencer") === 2 &&
        // Back onto the pile it came off, not a second one-quantity document:
        // an attach/detach cycle must not leave duplicates to tidy up.
        api.modStacks(smith, "silencer").length === 1,
      JSON.stringify({
        held: api.modHeld(smith, "silencer"),
        stacks: api.modStacks(smith, "silencer").length,
      }),
    );

    // a6. Taking off something that is not on is the mirror of a3.
    const notOn = await api.detachMod(smith, rifle, "silencer", smith.system);
    step(
      "taking off a mod that is not fitted does nothing",
      notOn === null && api.modHeld(smith, "silencer") === 2,
      JSON.stringify({ returned: notOn }),
    );

    // a7. The printed failure state, which is reported at full volume rather
    //     than refused: six slots is fine, past six the weapon stops working.
    //     Built by fitting real rows so the slot arithmetic is the table's.
    const big = ["stock", "longerBarrel", "hardenedReceiver", "scope"];
    let ceased = null;
    for (const key of big) {
      ceased = await api.attachMod(smith, rifle, key, smith.system);
      await settle();
    }
    // a8. The panel itself, on the weapon's own item sheet: the slot readout,
    //     one row per fitted mod, and a picker that lists every printed row —
    //     the ineligible ones bulleted rather than hidden, since eligibility is
    //     advisory and hiding them would make the UI enforce what the rules
    //     layer deliberately does not.
    await rifle.sheet.render(true);
    await settle(1200);
    const panel = rifle.sheet.element?.querySelector(".mods-panel");
    const rows = panel?.querySelectorAll(".mod-row") ?? [];
    const picker = panel?.querySelector("select.mod-picker");
    step(
      "the weapon sheet's modifications panel renders the slots, the fitted rows and the picker",
      !!panel &&
        !!panel.querySelector(".slot-readout") &&
        rows.length === rifle.system.attachedModKeys.length &&
        !!picker &&
        // Every unfitted row is offered, and at least one is marked ineligible.
        picker.options.length === api.MOD_KEYS.length - rifle.system.attachedModKeys.length + 1 &&
        Array.from(picker.options).some((option) => option.text.startsWith("\u2022")),
      JSON.stringify({
        rows: rows.length,
        attached: rifle.system.attachedModKeys.length,
        options: picker?.options.length,
      }),
    );
    await rifle.sheet.close();

    const rangedKeys = rifle.system.attachedModKeys.filter(
      (k) => api.WEAPON_MODS[k].category === "ranged",
    );
    const expectedSlots = rangedKeys.reduce((n, k) => n + api.WEAPON_MODS[k].slots, 0);
    step(
      "passing six mod slots is reported as the weapon ceasing to function, not refused (pg 75)",
      // Every one of the four went on, so nothing refused on the way past six.
      big.every((key) => rifle.system.attachedMods[key] === true) &&
        ceased.slots === expectedSlots &&
        expectedSlots > api.RANGED_MOD_SLOTS &&
        ceased.ceased === true &&
        api.ceasesFunction(rifle.system.attachedModKeys) === true,
      JSON.stringify({ slots: ceased.slots, expected: expectedSlots, ceased: ceased.ceased }),
    );
  } finally {
    await smith.delete();
  }
}

// Blind attack (pg 128) — the caller `rollBlindAttack` never had, and the perk
// that was wired onto a check nothing performed.
{
  const Actors = game.actors.documentClass;
  const baStamp = Date.now();

  await Actors.createDocuments([
    { name: `SMOKE-Blind-${baStamp}`, type: "character" },
    { name: `SMOKE-BlindTarget-${baStamp}`, type: "npc" },
  ]);
  const shooter = game.actors.getName(`SMOKE-Blind-${baStamp}`);
  const mark = game.actors.getName(`SMOKE-BlindTarget-${baStamp}`);

  const OPEN = { cover: "none", heavilyObscured: false, invisible: false };
  const DARK = { cover: "none", heavilyObscured: true, invisible: false };
  const UNSEEN = { cover: "none", heavilyObscured: false, invisible: true };
  const TOTAL = { cover: "total", heavilyObscured: false, invisible: false };

  try {
    // b1. The gate's whole truth table. The two that matter most are the ones
    //     that are NOT blind attacks: an invisible target is pg 134's
    //     disadvantage, which bends the roll where pg 128 replaces it, and total
    //     cover refuses the attack outright rather than converting it.
    step(
      "pg 128 applies to a blinded attacker and a heavily obscured target, and to nothing else",
      api.blindAttackApplies({ attackerBlinded: false, concealment: DARK }) === true &&
        api.blindAttackApplies({ attackerBlinded: true, concealment: OPEN }) === true &&
        api.blindAttackApplies({ attackerBlinded: false, concealment: UNSEEN }) === false &&
        api.blindAttackApplies({ attackerBlinded: false, concealment: TOTAL }) === false &&
        api.blindAttackApplies({ attackerBlinded: false, concealment: OPEN }) === false,
      JSON.stringify({
        dark: api.blindAttackApplies({ attackerBlinded: false, concealment: DARK }),
        invisible: api.blindAttackApplies({ attackerBlinded: false, concealment: UNSEEN }),
        total: api.blindAttackApplies({ attackerBlinded: false, concealment: TOTAL }),
      }),
    );

    // b2. The Infrared Scope's exemption, and the ruling on its limit: the row
    //     lets you *target* a concealed creature, so it answers the target half
    //     and says nothing about an attacker who cannot see.
    step(
      "an Infrared Scope exempts the target's obscurement but does not rescue a blinded attacker (pg 76)",
      api.blindAttackApplies({
        attackerBlinded: false,
        concealment: DARK,
        infraredScope: true,
      }) === false &&
        api.blindAttackApplies({
          attackerBlinded: true,
          concealment: DARK,
          infraredScope: true,
        }) === true,
      JSON.stringify({
        scopedTarget: api.blindAttackApplies({
          attackerBlinded: false,
          concealment: DARK,
          infraredScope: true,
        }),
        scopedAndBlind: api.blindAttackApplies({
          attackerBlinded: true,
          concealment: DARK,
          infraredScope: true,
        }),
      }),
    );

    // b3. Spray and Pray's second sentence (pg 49). The first — advantage —
    //     rides on an Active Effect and is asserted live in b6.
    step(
      "Spray and Pray halves the blind attack DC, rounding down (pg 49)",
      api.blindAttackDC(30) === 35 &&
        api.blindAttackDC(30, true) === 17 &&
        api.blindAttackDC(0) === 5 &&
        api.blindAttackDC(0, true) === 2,
      JSON.stringify({
        full: api.blindAttackDC(30),
        halved: api.blindAttackDC(30, true),
      }),
    );

    // b4. THE POINT. An ordinary attack at a heavily obscured target is not an
    //     attack roll at all any more — it is a Luck check against pg 128's DC.
    //     The formula is the proof: an attack builds from the weapon's skill
    //     bonus, and this one does not.
    await shooter.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Blind-Rifle-${baStamp}`,
        type: "weapon",
        system: {
          weaponType: "rifle",
          damage: "1d10",
          apCost: 5,
          critChance: 20,
          magazineSize: 10,
          loadedAmmo: 10,
          equipped: true,
        },
      },
    ]);
    const rifle = shooter.items.getName(`SMOKE-Blind-Rifle-${baStamp}`);
    await api.rollAttack(shooter, shooter.system, rifle, rifle.system, "normal", {
      concealment: DARK,
      distanceFeet: 30,
    });
    await settle();
    const blindFlavor = lastAttackFlavor();
    step(
      "an attack on a heavily obscured target becomes a blind attack against DC 35, not an AC roll (pg 128)",
      // The whole DC phrase. A bare "35" is also satisfied by the fixture
      // weapon's `Date.now()` stamp, which would let this pass with the DC
      // wrong — see the Spray and Pray step below, which failed the other way
      // round for exactly that reason.
      blindFlavor.includes("vs DC 35") &&
        blindFlavor.includes("30 ft") &&
        blindFlavor.includes("Blind attack") &&
        // The reason is named, so a roll that quietly changed kind can be checked.
        blindFlavor.includes("heavily obscured"),
      blindFlavor.slice(0, 200),
    );

    // b5. And the refusal that makes b4 honest: the DC is 5 + the distance, so
    //     without a distance there is no DC. Guessing 0 would hand the shooter a
    //     DC 5 they did not earn, so the shot is refused and nothing is spent.
    const loadedBefore = rifle.system.loadedAmmo;
    await api.rollAttack(shooter, shooter.system, rifle, rifle.system, "normal", {
      concealment: DARK,
    });
    await settle();
    step(
      "a blind attack with no declared distance is refused, and costs no ammunition",
      rifle.system.loadedAmmo === loadedBefore,
      JSON.stringify({ before: loadedBefore, after: rifle.system.loadedAmmo }),
    );

    // b6. Spray and Pray end to end, from the shipped compendium entry rather
    //     than a hand-built effect: the perk it was wired onto in D4 finally has
    //     a check to grant advantage on, and the halving reaches the same card.
    const perkPack = game.packs.get("fallout-ttrpg.perks");
    const sprayEntry = perkPack.index.find((entry) => entry.name === api.SPRAY_AND_PRAY);
    const sprayDoc = await perkPack.getDocument(sprayEntry._id);
    await shooter.createEmbeddedDocuments("Item", [sprayDoc.toObject()]);
    await settle();
    await api.rollAttack(shooter, shooter.system, rifle, rifle.system, "normal", {
      concealment: DARK,
      distanceFeet: 30,
    });
    await settle();
    const sprayFlavor = lastAttackFlavor();
    const sprayFormula = lastAttackFormula();
    step(
      "Spray and Pray reaches the roll it was wired for: advantage, and DC 35 halved to 17 (pg 49)",
      // Matched on the whole DC phrase, not on the bare numbers. This read
      // `includes("17") && !includes("35")` and passed by luck for several
      // runs before failing on a card that was entirely correct: the fixture
      // weapon is named from `Date.now()`, and that run's stamp ended
      // `...7235`. A bare "35" appears somewhere in a random eight-digit
      // stamp often enough that this assertion was a coin toss, and the
      // failure it produced looked exactly like the perk having broken.
      sprayFlavor.includes("vs DC 17") &&
        !sprayFlavor.includes("vs DC 35") &&
        sprayFormula.includes("2d20kh") &&
        sprayFlavor.includes("Spray and Pray"),
      JSON.stringify({ formula: sprayFormula, flavor: sprayFlavor.slice(0, 200) }),
    );

    // b7. The perk lookup that b6 rides on, and the reason it is one function
    //     now: three private copies had accumulated, and this was to be a fourth.
    step(
      "hasPerk finds a perk by the name its rule declares, and perkRanks counts the repeats",
      api.hasPerk(shooter, api.SPRAY_AND_PRAY) === true &&
        api.hasPerk(shooter, "No Such Perk") === false &&
        api.perkRanks(shooter, api.SPRAY_AND_PRAY) === 1 &&
        api.hasPerk(mark, api.SPRAY_AND_PRAY) === false,
      JSON.stringify({ ranks: api.perkRanks(shooter, api.SPRAY_AND_PRAY) }),
    );
  } finally {
    await shooter.delete();
    await mark.delete();
  }
}

// The pg 129 limb conditions, applied rather than printed.
//
// THE GAP. This was the last entry on either delta document's impact list that
// was text and only text: the attack rolled its d4, posted the sentence the
// table prints, and stopped. v2.1's rework of that table — "until the end of
// the target's next turn" becoming two turns, the head/torso/groin AP loss
// becoming a standing −2/−3, and the leg row's 30/20/15 ft caps — all landed on
// a chat card and nowhere else.
//
// What is asserted below is deliberately weighted towards the two things that
// could be wrong without anything failing loudly: that the attack penalty
// reaches attack rolls and *not* skill checks, and that the movement cap
// composes down to the tightest of several rather than to the last one written.
{
  const Actors = game.actors.documentClass;
  const lcStamp = Date.now();
  const lastCard = () => String(game.messages.contents.at(-1)?.content ?? "");

  await Actors.createDocuments([
    { name: `SMOKE-Limb-${lcStamp}`, type: "character" },
    { name: `SMOKE-Limb-Medic-${lcStamp}`, type: "character" },
  ]);
  const hurt = game.actors.getName(`SMOKE-Limb-${lcStamp}`);
  const medic = game.actors.getName(`SMOKE-Limb-Medic-${lcStamp}`);

  /** Apply one face of one row and hand back the effect it created. */
  const inflict = async (row, index) => {
    const report = await api.applyTargetedCondition(hurt, row, index);
    await settle(300);
    return {
      report,
      effect: report?.effectId ? hurt.effects.get(report.effectId) : null,
    };
  };
  const clearAll = async () => {
    const ids = Array.from(hurt.effects).map((effect) => effect.id);
    if (ids.length > 0) await hurt.deleteEmbeddedDocuments("ActiveEffect", ids);
    await hurt.toggleStatusEffect("prone", { active: false });
    await settle(300);
  };

  try {
    // The fixture, and it guards every step below. Hit points sit under the
    // maximum on purpose: the full-heal trigger watches every hit-point write
    // and clears the conditions flagged for it, so a fixture at full health
    // would delete what t9 is about to apply — the same vacuity trap the Short
    // Circuit fixture fell into. A real skill bonus is set for the same class of
    // reason: t2 proves a penalty is *absent* from a skill check, and a check
    // whose bonus is already zero cannot show the difference.
    await hurt.update({
      "system.overrides.hpMax": 60,
      "system.abilities.agility.value": 10,
      "system.skills.guns.points": 4,
      "system.resources.hp.value": 30,
    });
    const lcBonus = hurt.system.derived.skillBonuses.guns;
    const fixtureOk =
      hurt.system.resources.hp.value < hurt.system.derived.hpMax &&
      // Positive, not merely non-zero: t2 matches on `+${lcBonus}`.
      lcBonus > 0 &&
      hurt.system.derived.attackBonus === 0 &&
      hurt.system.derived.moveCapFeet === null;
    step(
      "the limb-condition fixture is under full health and has a visible skill bonus (guards every step below)",
      fixtureOk,
      JSON.stringify({
        hp: hurt.system.resources.hp.value,
        max: hurt.system.derived.hpMax,
        // Named explicitly, because `JSON.stringify` drops an undefined value
        // and the first run of this step reported `{"hp":30,"max":60}` — the
        // bonus was `undefined` (the skill is `guns`, not `smallGuns`) and the
        // detail line silently omitted the very field that was wrong.
        bonus: lcBonus === undefined ? "undefined" : lcBonus,
      }),
    );
    // A guard that only reports is not a guard. The steps below all read this
    // fixture, so a broken one produces a dozen failures that each look like a
    // separate defect — and the first of them threw, which is how one wrong
    // skill name cost the run 114 unrelated steps.
    if (!fixtureOk) throw new Error("limb-condition fixture is wrong; skipping the block");

    // t1. The table itself. Four faces of seven rows, and the entries this
    //     system reports rather than writes are reported as such rather than
    //     silently missing — a caller can tell "the book prints no condition
    //     here" from "this one is the table's to resolve".
    const eyes1 = api.targetedCondition("eyes", 1);
    step(
      "every face of every row has a realisation, and the ones that write nothing say which kind of nothing (pg 129)",
      eyes1.changes.some((c) => c.key === "system.bonuses.attack" && c.value === -5) &&
        eyes1.duration.rounds === 2 &&
        api.limbConditionApplicable(eyes1) === true &&
        // The book's own blank.
        api.targetedCondition("torso", 1).blank === true &&
        api.limbConditionApplicable(api.targetedCondition("torso", 1)) === false &&
        // Resolved at the table: no hand model.
        api.targetedCondition("arm", 1).manual === true &&
        // The object row is NOT manual any more — it carries a clause and asks
        // which item was hit. This line asserted the opposite until the row was
        // built, and is the assertion that had to move rather than the rule.
        api.targetedCondition("object", 3).manual === false &&
        api.targetedCondition("object", 3).object !== null &&
        // A Fusion Core applies no condition at all (pg 58).
        api.targetedCondition("fusionCore", 1) === null,
      JSON.stringify({ eyes1: eyes1.changes, torso1: api.targetedCondition("torso", 1) }),
    );

    // t2. THE POINT, and the one that could have been wrong invisibly. The five
    //     "−N to all attack rolls" entries needed a path that reaches attack
    //     rolls and nothing else; writing them through `d20Bonus` — the obvious
    //     shortcut, and the only flat path that existed — would have docked the
    //     target's skill checks, ability checks and death saves with them.
    await hurt.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Limb-Pistol-${lcStamp}`,
        type: "weapon",
        system: {
          weaponType: "handgun",
          skill: "guns",
          damage: "1d8",
          apCost: 4,
          critChance: 20,
          magazineSize: 10,
          loadedAmmo: 10,
          equipped: true,
        },
      },
    ]);
    const pistol = hurt.items.getName(`SMOKE-Limb-Pistol-${lcStamp}`);
    const eyesOne = await inflict("eyes", 1);
    await api.rollSkill(hurt, hurt.system, "guns", "normal");
    await settle();
    const checkFormula = lastAttackFormula();
    await api.rollAttack(hurt, hurt.system, pistol, pistol.system, "normal");
    await settle();
    const attackFormula = lastAttackFormula();
    step(
      "−5 to all attack rolls reaches the attack roll and leaves the skill check alone (pg 129)",
      eyesOne.report?.applied === true &&
        hurt.system.derived.attackBonus === -5 &&
        attackFormula.includes("-5") &&
        !checkFormula.includes("-5") &&
        // Both rolls are the same skill, so the difference is the penalty and
        // not two unrelated formulas being compared.
        checkFormula.includes(`+${String(lcBonus)}`) &&
        attackFormula.includes(`+${String(lcBonus)}`),
      JSON.stringify({ check: checkFormula, attack: attackFormula }),
    );

    // t2a. The boundary the separate path exists to draw, and the one place it
    //      was nearly missed: an unarmed strike is an attack roll — its own
    //      scopes say so — and builds its formula in `combat-actions.ts` rather
    //      than through `rollAttack`, so a penalty wired only into the weapon
    //      path would have let a punch ignore it. A Grapple sits ten lines away
    //      in the same file, rolls the same skill, and is *not* an attack roll,
    //      so it must not carry the penalty. Both are asserted, because either
    //      one alone passes for the wrong reason.
    await api.unarmedStrike(hurt, hurt.system, { strikes: 1 });
    await settle();
    const punchFormula = lastAttackFormula();
    // Pinned to a DC nothing beats, so the contest rolls and prints without
    // leaving the medic grappled — t10 needs them free to swing a doctor's bag.
    await api.grapple(hurt, hurt.system, medic, { dc: 100 });
    await settle();
    const grappleFormula = lastAttackFormula();
    step(
      "the attack penalty reaches an unarmed strike and not the Grapple contest beside it (pg 129)",
      punchFormula.includes("-5") && !grappleFormula.includes("-5"),
      JSON.stringify({ punch: punchFormula, grapple: grappleFormula }),
    );

    // t2b. And it reverts cleanly, which is the whole reason the change is
    //      guided against a real schema field rather than written into derived
    //      data in the `final` phase.
    await clearAll();
    step(
      "deleting the effect reverts the penalty, because the change was guided",
      hurt.system.derived.attackBonus === 0,
      JSON.stringify({ bonus: hurt.system.derived.attackBonus }),
    );

    // t3. The second eyes entry is disadvantage rather than a number, and it
    //     rides the advantage machinery that was already there.
    await inflict("eyes", 2);
    await api.rollAttack(hurt, hurt.system, pistol, pistol.system, "normal");
    await settle();
    const disFormula = lastAttackFormula();
    step(
      "disadvantage on all attack rolls for two turns bends the attack roll (pg 129)",
      disFormula.includes("2d20kl") && hurt.system.derived.disadvantage.attack >= 1,
      JSON.stringify({ formula: disFormula, counts: hurt.system.derived.disadvantage.attack }),
    );
    await clearAll();

    // t3b. A composition nobody wired, asserted rather than assumed because it
    //      chains three things in a row: the effect carries
    //      `statuses: ["blinded"]`, Foundry folds an applied effect's statuses
    //      into `actor.statuses`, and `rollAttack` reads that set to decide
    //      whether pg 128 replaces the attack roll with a Luck check entirely.
    //      If the first link fails, the sheet still shows a blinded creature
    //      and their attacks quietly stay ordinary attack rolls — which looks
    //      exactly like working.
    await inflict("eyes", 3);
    await api.rollAttack(hurt, hurt.system, pistol, pistol.system, "normal", {
      distanceFeet: 30,
    });
    await settle();
    const blindedFlavor = lastAttackFlavor();
    step(
      "a creature blinded by an eye shot attacks as a blind attack, which is pg 128 meeting pg 129",
      hurt.statuses.has("blinded") === true &&
        blindedFlavor.includes("Blind attack") &&
        blindedFlavor.includes("vs DC 35") &&
        // The card names why it changed kind, so a roll that silently became a
        // Luck check can be checked against the reason it did.
        blindedFlavor.includes("blinded"),
      JSON.stringify({
        blinded: hurt.statuses.has("blinded"),
        flavor: blindedFlavor.slice(0, 160),
      }),
    );
    await clearAll();

    // t4. "−3 AP for two turns" as a ceiling rather than a spend. This is the
    //     one place the table came near backlog E1, and the distinction is that
    //     E1 declines to track AP as a pool actions draw down — the AP *maximum*
    //     is a number the sheet already computes and a chem already raises.
    const apBefore = hurt.system.derived.apMax;
    await inflict("groin", 2);
    step(
      "−3 AP for two turns lowers the AP ceiling, which is not the pool E1 declines to track (pg 129)",
      hurt.system.derived.apMax === apBefore - 3,
      JSON.stringify({ before: apBefore, after: hurt.system.derived.apMax }),
    );
    await clearAll();

    // t5. THE OTHER ONE THAT COULD HAVE BEEN WRONG QUIETLY. A movement cap is a
    //     minimum, not a sum: 30 feet and 15 feet leave a creature at 15, and
    //     neither at 45 nor at whichever effect happened to be written last.
    //     That needs Foundry's `downgrade` change type against a field that does
    //     not start at 0, and this is the step that proves `downgrade` actually
    //     takes the lower on this build rather than being assumed to.
    await inflict("leg", 1);
    const capAfterFirst = hurt.system.derived.moveCapFeet;
    await inflict("leg", 3);
    const capAfterBoth = hurt.system.derived.moveCapFeet;
    // And the wider cap alone, applied second, must not loosen the tighter one.
    step(
      "two movement caps compose down to the tightest, not to the sum or the last one written (pg 129)",
      capAfterFirst === 30 && capAfterBoth === 15,
      JSON.stringify({ first: capAfterFirst, both: capAfterBoth }),
    );
    await clearAll();
    step(
      "clearing the conditions releases the cap entirely",
      hurt.system.derived.moveCapFeet === null,
      JSON.stringify({ cap: hurt.system.derived.moveCapFeet }),
    );

    // t6. Prone is a toggle and not part of the effect, because a creature is
    //     not prone for a duration — it is prone until it stands up. Groin 3 is
    //     the only entry that carries nothing else, so it creates no effect at
    //     all rather than leaving an empty row for the player to tidy away.
    const proneOnly = await inflict("groin", 3);
    step(
      "the groin's third condition knocks the target prone and creates no effect to expire (pg 129)",
      proneOnly.report?.applied === true &&
        proneOnly.report.toggled.includes("prone") &&
        proneOnly.report.effectId === null &&
        hurt.statuses.has("prone") === true,
      JSON.stringify({ report: proneOnly.report, prone: hurt.statuses.has("prone") }),
    );
    await clearAll();

    // t7. A status that *is* carried by the effect, and so goes when it does.
    //     Gut Wallop needs no changes of its own: `dazed` already costs AP and
    //     imposes disadvantage through the derived pass.
    const wallop = await inflict("torso", 4);
    const dazedOn = hurt.statuses.has("dazed");
    await hurt.deleteEmbeddedDocuments("ActiveEffect", [wallop.report.effectId]);
    await settle(300);
    step(
      "Gut Wallop's dazed rides the effect and lifts with it (pg 129)",
      dazedOn === true && hurt.statuses.has("dazed") === false,
      JSON.stringify({ on: dazedOn, off: hurt.statuses.has("dazed") }),
    );

    // t8. The durations, in v14's shape. `{value, units}` and not `{rounds: 2}`
    //     — the older per-unit keys are only shimmed on this build, and a
    //     shimmed duration is one Foundry could stop honouring. Rattled's three
    //     turns are the table's only span that is not two, and Temporary
    //     Blindness is its only clock measured in real time.
    const rattled = await inflict("head", 4);
    const blindness = await inflict("eyes", 4);
    step(
      "durations are authored in v14's {value, units} shape, in the units the book prints (pg 129)",
      rattled.effect?.duration?.units === "rounds" &&
        rattled.effect.duration.value === 3 &&
        blindness.effect?.duration?.units === "seconds" &&
        blindness.effect.duration.value === 3600 &&
        hurt.statuses.has("frightened") === true &&
        hurt.statuses.has("blinded") === true,
      JSON.stringify({
        rattled: rattled.effect?.duration,
        blindness: blindness.effect?.duration,
      }),
    );
    await clearAll();

    // t8b. AND THAT THE CLOCK ACTUALLY RUNS. The module docstring and the
    //      backlog both state that "two turns" is two combat rounds on the
    //      target and that the condition then stops applying — which is a claim
    //      about Foundry, not about this system, and was written without ever
    //      being watched. A round duration that core never retires would leave
    //      a −2 on every attack roll the character makes for the rest of the
    //      session, and the sheet would show a perfectly ordinary effect row.
    //
    //      Created *after* the combat starts, because that is what gives the
    //      duration a start round to count from. Read after settling: v14
    //      retires an elapsed effect asynchronously, which is the trap
    //      docs/foundry-v14-notes.md records costing this project a bug.
    const Combats = game.combats.documentClass;
    const lcSceneId = game.scenes?.current?.id ?? game.scenes?.contents?.[0]?.id ?? null;
    const lcCombat = await Combats.create({ scene: lcSceneId });
    await lcCombat.activate();
    await lcCombat.createEmbeddedDocuments("Combatant", [{ actorId: hurt.id, initiative: 20 }]);
    await lcCombat.startCombat();
    await settle(600);
    const timed = await inflict("head", 1);
    const penaltyInForce = hurt.system.derived.attackBonus;
    await lcCombat.nextRound();
    await lcCombat.nextRound();
    await lcCombat.nextRound();
    const retired = await until(
      () => hurt.effects.get(timed.report.effectId)?.duration?.expired === true,
      10000,
    );
    await settle(900);
    step(
      "a two-turn condition is two combat rounds, and its penalty stops applying when they run out (pg 129)",
      penaltyInForce === -2 &&
        retired &&
        // The point of the whole step: expired is not merely a label.
        hurt.system.derived.attackBonus === 0,
      JSON.stringify({
        inForce: penaltyInForce,
        expired: hurt.effects.get(timed.report.effectId)?.duration?.expired,
        after: hurt.system.derived.attackBonus,
        round: lcCombat.round,
      }),
    );
    await lcCombat.delete();
    await clearAll();

    // t9. THE TRIGGER, AND IT IS PROVEN THROUGH ITS DELIVERY PATH. "Until all
    //     hit points are healed" runs through an `updateActor` hook, and a hook
    //     that never fires fails silently and identically to one that works —
    //     so this heals for real through the aid pipeline instead of calling
    //     `fullHealLimbConditions`. Two conditions are applied and only one is
    //     flagged for the trigger, so a hook that cleared everything in sight
    //     would fail here too.
    await hurt.update({ "system.resources.hp.value": 5 });
    await inflict("leg", 4);
    await inflict("torso", 3);
    const beforeHeal = api.limbConditions(hurt).length;
    await hurt.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Limb-Stim-${lcStamp}`,
        type: "aid",
        system: { aidType: "medicine", healFormula: "999", quantity: 1 },
      },
    ]);
    await api.useAid(hurt, hurt.system, hurt.items.getName(`SMOKE-Limb-Stim-${lcStamp}`));
    const healFired = await until(() => api.limbConditions(hurt).length === 1, 8000);
    await settle(600);
    const left = api.limbConditions(hurt);
    step(
      "healing to full clears Leg Cripple through the updateActor hook and leaves the timed condition alone (pg 129)",
      beforeHeal === 2 &&
        healFired &&
        left.length === 1 &&
        left[0].row === "torso" &&
        hurt.system.derived.moveCapFeet === null &&
        hurt.system.resources.hp.value === hurt.system.derived.hpMax,
      JSON.stringify({ before: beforeHeal, left, cap: hurt.system.derived.moveCapFeet }),
    );
    await clearAll();
    await hurt.update({ "system.resources.hp.value": 30 });

    // t10. Set Bone (pg 86) finally has something to remove. That branch of
    //      `useMedicalKit` used to say so in as many words: Broken Arm was a
    //      condition this system printed on a card and stored in no field.
    //      "Broken Leg" is still not a thing — pg 86 names it and no entry in
    //      the book defines it — and this asserts that Leg Cripple is *not*
    //      quietly treated as its synonym, since a full heal is its trigger and
    //      the Set Bone paragraph never mentions one.
    await medic.update({
      "system.abilities.intelligence.value": 8,
      "system.skills.medicine.points": 3,
    });
    await medic.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Limb-Doctor's Bag-${lcStamp}`,
        type: "aid",
        system: { aidType: "medicine", quantity: 1 },
      },
    ]);
    const bag = medic.items.getName(`SMOKE-Limb-Doctor's Bag-${lcStamp}`);
    await inflict("arm", 4);
    await inflict("leg", 4);
    const brokenBefore = api.limbConditions(hurt).length;
    await api.useMedicalKit(medic, medic.system, bag, hurt, "setBone");
    await settle(700);
    const afterBone = api.limbConditions(hurt);
    step(
      "Set Bone removes Broken Arm and does not treat Leg Cripple as the Broken Leg the book never defines (pg 86, 129)",
      brokenBefore === 2 &&
        afterBone.length === 1 &&
        afterBone[0].row === "leg" &&
        lastCard().includes("Broken Arm"),
      JSON.stringify({ before: brokenBefore, after: afterBone }),
    );
    await clearAll();

    // t11. The two kinds of nothing, applied. Neither writes, and neither
    //      pretends to: the button is not even offered for these, and calling
    //      the function directly reports which kind it hit.
    //
    //      `arm` c1 and not `object` c2: the object row used to be the stock
    //      example of a manual entry and is not one any more — it asks for an
    //      item instead. Arm c1 ("drops whatever they are holding in that arm")
    //      still is, because nothing in this system says which hand holds what.
    const blank = await api.applyTargetedCondition(hurt, "torso", 1);
    const manual = await api.applyTargetedCondition(hurt, "arm", 1);
    await settle(300);
    step(
      "the book's own blank and the table's own business both write nothing, and say which they are",
      blank.applied === false &&
        blank.reason === "blank" &&
        manual.applied === false &&
        manual.reason === "manual" &&
        // A manual entry that quietly created a bare effect would be counted
        // here, since every effect this action writes carries the flag.
        api.limbConditions(hurt).length === 0,
      JSON.stringify({ blank, manual, held: api.limbConditions(hurt) }),
    );

    // t12. THE DELIVERY PATH FOR THE BUTTON. Everything above calls the action
    //      directly, which proves the rule and nothing about how a GM reaches
    //      it: the Apply button is built by a `renderChatMessageHTML` hook off a
    //      flag the attack's d4 card carries, and a card posted without that
    //      flag would offer no button at all while every step above still
    //      passed. So this rolls a real targeted attack and reads the flag.
    //
    //      The *row* is what must be on the card, not the limb — a jet engine
    //      resolves on the leg row, and the realisation table is keyed the way
    //      the text is.
    //
    //      Rolled up to five times on purpose. The d4 does not follow every
    //      attack: a natural 1 is an automatic miss and a natural 20 posts the
    //      severe injury instead, so one attack finds no card roughly one run in
    //      ten — a step that fails a tenth of the time is a step nobody trusts.
    let rolledFlag = null;
    for (let attempt = 0; attempt < 5 && !rolledFlag; attempt += 1) {
      await pistol.update({ "system.loadedAmmo": pistol.system.magazineSize });
      await api.rollAttack(hurt, hurt.system, pistol, pistol.system, "normal", { limb: "leg" });
      await settle(700);
      const d4Card = game.messages.contents
        .slice(-6)
        .reverse()
        .find((message) => message.getFlag("fallout-ttrpg", "limbConditionRoll"));
      rolledFlag = d4Card?.getFlag("fallout-ttrpg", "limbConditionRoll") ?? null;
    }
    step(
      "a targeted attack's d4 card carries the row and face the Apply button is built from (pg 129)",
      !!rolledFlag &&
        rolledFlag.row === "leg" &&
        rolledFlag.index >= 1 &&
        rolledFlag.index <= 4 &&
        // And the flag resolves to a real entry, which is what the hook checks
        // before it offers a button at all.
        api.targetedCondition(rolledFlag.row, rolledFlag.index) !== null,
      JSON.stringify({ flag: rolledFlag ?? null }),
    );

    // t13. THE OBJECT ROW, which asks rather than guesses.
    //
    //      All four faces act on a held item, and an attack names a limb. The
    //      apply path therefore takes a picker; these steps inject a stub one,
    //      which is the whole reason the picker is a parameter and not an
    //      imported dialog — a dialog cannot be driven from here.
    //
    //      Fresh fixtures rather than the pistol above: t2 leans on that
    //      weapon's formula, and decaying it two levels mid-block is exactly
    //      the kind of borrowed-fixture damage that broke eight later steps
    //      earlier in this session.
    await hurt.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Limb-Held-${lcStamp}`,
        type: "weapon",
        system: { weaponType: "handgun", skill: "guns", damage: "1d6", decay: 0, equipped: true },
      },
      // Gear carries decay but has no `equipped` field at all — it is carried,
      // never wielded. The flying clauses have to say so rather than silently
      // not writing.
      { name: `SMOKE-Limb-Junk-${lcStamp}`, type: "gear", system: { decay: 0 } },
    ]);
    const held = hurt.items.getName(`SMOKE-Limb-Held-${lcStamp}`);
    const junk = hurt.items.getName(`SMOKE-Limb-Junk-${lcStamp}`);
    const pick = (item, index) => () => Promise.resolve(index === undefined ? { item } : { item, index });

    // t13a. The gate the button reads. This is the assertion that would have
    //       gone red on every build before this one: the object row was
    //       `manual`, so `isApplicable` was false and the card offered no
    //       button at all.
    step(
      "the object row is offered a button at all, which it never was before (pg 129)",
      [1, 2, 3, 4].every((index) =>
        api.limbConditionApplicable(api.targetedCondition("object", index)),
      ),
      JSON.stringify(
        [1, 2, 3, 4].map((index) => api.limbConditionApplicable(api.targetedCondition("object", index))),
      ),
    );

    // t13b. c1: "The object gains two levels of decay."
    const decayBefore = held.system.decay;
    const c1 = await api.applyTargetedCondition(hurt, "object", 1, pick(held));
    await settle(300);
    step(
      "the object row's first face puts two levels of decay on the item the GM named (pg 129)",
      c1?.applied === true &&
        held.system.decay === decayBefore + 2 &&
        lastCard().includes(held.name),
      JSON.stringify({ report: c1, before: decayBefore, after: held.system.decay }),
    );

    // t13c. c2: "The object flies one foot away." The write that makes that
    //       mean something on the sheet is the item leaving the target's hands.
    const c2 = await api.applyTargetedCondition(hurt, "object", 2, pick(held));
    await settle(300);
    step(
      "the object row's second face knocks the item out of the target's hands and prints one foot, not 1 feet",
      c2?.applied === true &&
        held.system.equipped === false &&
        lastCard().includes("one foot"),
      JSON.stringify({ report: c2, equipped: held.system.equipped, card: lastCard().slice(0, 160) }),
    );

    // t13d. c3: "flies 1d4 × 5 feet away" — a real roll, so the distance has to
    //       land inside the range the formula can produce and nowhere else. A
    //       card that printed the formula rather than a total would pass a
    //       bare `includes` and fails this.
    await held.update({ "system.equipped": true });
    const c3 = await api.applyTargetedCondition(hurt, "object", 3, pick(held));
    await settle(400);
    const flungText = game.messages.contents
      .slice(-4)
      .reverse()
      .map((message) => String(message.content ?? ""))
      .find((text) => text.includes("feet away"));
    const flungFeet = Number(/flies (\d+) feet away/.exec(flungText ?? "")?.[1] ?? NaN);
    step(
      "the object row's third face rolls 1d4 × 5 and reports a distance that die could actually produce",
      c3?.applied === true &&
        [5, 10, 15, 20].includes(flungFeet) &&
        held.system.equipped === false,
      JSON.stringify({ report: c3, feet: flungFeet, text: (flungText ?? "").slice(0, 120) }),
    );

    // t13e. c4: "Choose condition 1, 2, or 3." The chosen face is resolved
    //       through the same table, so picking 1 has to decay by two — not by
    //       some second copy of the number.
    const chooseBefore = held.system.decay;
    const c4 = await api.applyTargetedCondition(hurt, "object", 4, pick(held, 1));
    await settle(300);
    // And a c4 that arrives with no choice writes nothing rather than guessing.
    const c4None = await api.applyTargetedCondition(hurt, "object", 4, pick(held));
    await settle(300);
    step(
      "the object row's fourth face resolves the chosen condition, and writes nothing when none was chosen",
      c4?.applied === true &&
        held.system.decay === chooseBefore + 2 &&
        c4None?.applied === false &&
        c4None?.reason === "noItem" &&
        held.system.decay === chooseBefore + 2,
      JSON.stringify({ chose: c4, none: c4None, before: chooseBefore, after: held.system.decay }),
    );

    // t13f. The two ways of being told nothing. No picker at all is the API
    //       caller's case and reports `manual`; a picker that returns null is
    //       the GM dismissing the prompt, and must leave the target untouched.
    const noPicker = await api.applyTargetedCondition(hurt, "object", 1);
    const cancelledBefore = held.system.decay;
    const cancelled = await api.applyTargetedCondition(hurt, "object", 1, () => Promise.resolve(null));
    await settle(300);
    step(
      "an object condition with nobody to ask, and one whose prompt was dismissed, both write nothing",
      noPicker?.applied === false &&
        noPicker?.reason === "manual" &&
        cancelled?.applied === false &&
        cancelled?.reason === "noItem" &&
        held.system.decay === cancelledBefore,
      JSON.stringify({ noPicker, cancelled, decay: held.system.decay }),
    );

    // t13g. Gear has no equip state, so "flies away" has nothing to write. It
    //       says so, and does not claim to have applied anything — the exact
    //       dishonesty the wet clause shipped with.
    const gear = await api.applyTargetedCondition(hurt, "object", 2, pick(junk));
    await settle(300);
    step(
      "an object with no equip state to clear reports honestly instead of claiming a write",
      gear?.applied === false &&
        gear?.reason === "manual" &&
        lastCard().includes(junk.name) &&
        junk.system.decay === 0,
      JSON.stringify({ report: gear, card: lastCard().slice(0, 160) }),
    );
  } catch (error) {
    // One block's exception must not end the run. This block's first version
    // named a skill (`smallGuns`) and a weapon type (`pistol`) that this system
    // does not have; the fixture guard caught it and said so, and then the very
    // next step threw on the undefined it had just been warned about — and
    // because a `try/finally` with no `catch` re-throws, the throw escaped past
    // the harness and took **every later block** with it. 114 steps that had
    // nothing to do with limb conditions simply did not run, and the summary
    // read 441 rather than 555 with no indication which of the two it was.
    //
    // So the failure is recorded as a failure and the suite carries on.
    step("the limb-condition block ran to completion", false, String(error?.message ?? error));
  } finally {
    await hurt.delete();
    await medic.delete();
  }
}

// Action Points, tracked but never enforced — backlog E1's half-step.
//
// THE GAP THIS CLOSES. Every AP-costing action in this system reported its
// price and left the pool alone, so the number on the sheet was the maximum
// forever and `endTurn`'s Power Armor overheat check — which measures what left
// the pool between `turnStart` and now (pg 58) — measured zero every turn.
//
// What is asserted is weighted at the two things that could be wrong without
// anything failing loudly: that a short pool does **not** refuse the action (it
// is a half-step, not full E1), and that nothing at all is charged outside
// combat, where no turn ever refills what would be taken.
{
  const Actors = game.actors.documentClass;
  const Combats = game.combats.documentClass;
  const apStamp = Date.now();
  const lastCard = () => String(game.messages.contents.at(-1)?.content ?? "");
  const lastFlavor = () => String(game.messages.contents.at(-1)?.flavor ?? "");

  // Read from the system rather than written here as a bare 6: a step that
  // hardcodes the price passes both when the price is right and when the
  // constant and the card have drifted apart in the same direction.
  const DODGE_AP = api.COMBAT_ACTION_AP.dodge;

  await Actors.createDocuments([{ name: `SMOKE-AP-${apStamp}`, type: "character" }]);
  const fighter = game.actors.getName(`SMOKE-AP-${apStamp}`);
  let apCombat = null;

  try {
    await fighter.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-AP-Rifle-${apStamp}`,
        type: "weapon",
        system: {
          weaponType: "rifle",
          skill: "guns",
          damage: "1d8",
          apCost: 4,
          magazineSize: 10,
          loadedAmmo: 10,
          equipped: true,
        },
      },
    ]);
    const rifle = fighter.items.getName(`SMOKE-AP-Rifle-${apStamp}`);

    // b0. The fixture guard. Everything below reads `resources.ap.value`, and a
    //     fixture whose pool never got populated would make every assertion
    //     below trivially true-looking. Named and fatal, for the reason the
    //     limb block's guard is.
    const apMax = fighter.system.derived.apMax;
    const fixtureOk =
      Number.isFinite(apMax) && apMax > DODGE_AP && rifle?.system?.apCost === 4 && DODGE_AP > 0;
    step(
      "the AP fixture has a real pool and a priced weapon (guards every step below)",
      fixtureOk,
      JSON.stringify({
        apMax: apMax ?? "undefined",
        weaponAp: rifle?.system?.apCost ?? "undefined",
        dodgeAp: DODGE_AP ?? "undefined",
      }),
    );
    if (!fixtureOk) throw new Error("AP fixture invalid — later steps would assert nothing");

    // b1. OUT OF COMBAT, NOTHING IS TRACKED. The pool is refilled by a turn
    //     beginning and outside initiative no turn ever begins, so an action
    //     that drained it here would leave a character at zero until the next
    //     fight. The card still prints the price, exactly as it always did.
    await fighter.update({ "system.resources.ap.value": apMax });
    const outBefore = fighter.system.resources.ap.value;
    await api.standUp(fighter).catch(() => null);
    await api.dodge(fighter, fighter.system);
    await settle(400);
    step(
      "out of combat an action prints its price and spends nothing, because no turn will refill it",
      fighter.system.resources.ap.value === outBefore &&
        lastCard().includes("out of combat"),
      JSON.stringify({
        before: outBefore,
        after: fighter.system.resources.ap.value,
        card: lastCard().slice(0, 140),
      }),
    );

    // b2. IN COMBAT, IT SPENDS. Same action, same actor, one difference.
    const apSceneId = game.scenes?.current?.id ?? game.scenes?.contents?.[0]?.id ?? null;
    apCombat = await Combats.create({ scene: apSceneId });
    await apCombat.activate();
    await apCombat.createEmbeddedDocuments("Combatant", [
      { actorId: fighter.id, initiative: 20 },
    ]);
    await apCombat.startCombat();
    await settle(700);
    // startCombat begins a turn, which refills the pool through `beginTurn`.
    const inBefore = fighter.system.resources.ap.value;
    await api.dodge(fighter, fighter.system);
    await settle(400);
    const afterDodge = fighter.system.resources.ap.value;
    step(
      "in combat the same action spends its price out of the pool (pg 126)",
      fighter.inCombat === true &&
        inBefore > 0 &&
        afterDodge === inBefore - DODGE_AP &&
        // Phrase, not a bare number: the card also prints the cost, and a bare
        // `includes(String(afterDodge))` would match that instead often enough
        // to pass while the remaining-pool half was broken.
        lastCard().includes(`${afterDodge} left`),
      JSON.stringify({ inCombat: fighter.inCombat, before: inBefore, after: afterDodge }),
    );

    // b3. THE ATTACK PATH, which is the highest-traffic spend in the system and
    //     the only one whose price is assembled from four separate numbers.
    //     A targeted head shot is the weapon's 4 AP plus the pg 129 surcharge,
    //     and the card has printed both as text since long before either left
    //     the pool.
    const attackBefore = fighter.system.resources.ap.value;
    await rifle.update({ "system.loadedAmmo": rifle.system.magazineSize });
    await api.rollAttack(fighter, fighter.system, rifle, rifle.system, "normal", { limb: "head" });
    await settle(700);
    const attackAfter = fighter.system.resources.ap.value;
    // The pg 129 surcharge, read from the rules rather than restated: this
    // step is about the *sum* reaching the pool, not about what head costs.
    // The fourth argument is the defender's robot type and defaults to "" —
    // passing null indexes the body-plan table with a key it does not have.
    const headSurcharge = api.targetedApCost("head", false, false, "");
    const attackSaidSo = game.messages.contents
      .slice(-6)
      .some((message) => String(message.flavor ?? "").includes("Spends"));
    step(
      "a targeted attack charges the weapon's AP and the pg 129 surcharge together",
      attackAfter === Math.max(0, attackBefore - (4 + headSurcharge)) && attackSaidSo,
      JSON.stringify({
        before: attackBefore,
        after: attackAfter,
        expected: attackBefore - (4 + headSurcharge),
        surcharge: headSurcharge,
      }),
    );

    // b4. THE POINT OF THE HALF-STEP: a pool that cannot pay does not refuse.
    //     Full E1 would have stopped here; this spends what there is, floors at
    //     zero, says by how much the action overdrew, and lets it happen. A
    //     regression to `spendActionPoints` — which *does* refuse — turns this
    //     red, and nothing else in the suite would notice.
    await fighter.update({ "system.resources.ap.value": 1 });
    const shortReport = await api.dodge(fighter, fighter.system);
    await settle(400);
    step(
      "a pool too small to pay is spent to zero and the action still happens — it is never refused",
      fighter.system.resources.ap.value === 0 &&
        shortReport?.ap === DODGE_AP &&
        lastCard().includes("over budget"),
      JSON.stringify({
        pool: fighter.system.resources.ap.value,
        report: shortReport ?? null,
        card: lastCard().slice(0, 140),
      }),
    );

    // b5. AND THE MACHINERY IT UNBLOCKS. `turnStart` minus the pool is what
    //     `endTurn` reads to price a Power Armor overheat (pg 58) and to bank
    //     half the unused AP (pg 126). Both read zero for as long as nothing
    //     spent; this asserts the difference is now a real number.
    await apCombat.nextRound();
    await settle(800);
    const opened = fighter.system.resources.ap.value;
    const turnStart = fighter.system.resources.ap.turnStart;
    await api.dodge(fighter, fighter.system);
    await settle(400);
    const spentThisTurn = turnStart - fighter.system.resources.ap.value;
    step(
      "what a turn has spent is now a measurable number, which is what the overheat check reads (pg 58)",
      opened > 0 && turnStart === opened && spentThisTurn === DODGE_AP,
      JSON.stringify({ opened, turnStart, now: fighter.system.resources.ap.value, spentThisTurn }),
    );
  } catch (error) {
    step("the action-point block ran to completion", false, String(error?.message ?? error));
  } finally {
    if (apCombat) await apCombat.delete();
    await fighter.delete();
  }
}

// The 2026-08-14 code review — one step per finding it confirmed, so none of
// them can come back quietly. Each names the wrong behaviour it replaced.
{
  const Actors = game.actors.documentClass;
  const revStamp = Date.now();

  await Actors.createDocuments([{ name: `SMOKE-Review-${revStamp}`, type: "character" }]);
  const hero = game.actors.getName(`SMOKE-Review-${revStamp}`);

  try {
    // r1. THE SHIPPED BUG. `critChance: 0` is the book's empty Critical Hit
    //     column — Flamer, Missile Launcher, Fat-Man, Cryolator. The schema's
    //     `min` was 2, so Foundry cleaned every one of those documents up to 2
    //     on load and `critThreshold` then subtracted half the Luck modifier
    //     from *that*: in a shipped world all four critically hit on a 2 or
    //     better, announcing an empty multiplier. The field must survive as 0.
    await hero.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Review-Fatman-${revStamp}`,
        type: "weapon",
        system: {
          weaponType: "bigGun",
          damage: "6d12",
          apCost: 8,
          critChance: 0,
          crit: "",
          magazineSize: 0,
          equipped: true,
        },
      },
    ]);
    const fatman = hero.items.getName(`SMOKE-Review-Fatman-${revStamp}`);
    step(
      "a weapon that prints no critical hit keeps critChance 0 — the schema no longer clamps it to 2",
      fatman.system.critChance === 0,
      JSON.stringify({ stored: fatman.system.critChance }),
    );

    // r2. And what 0 means downstream, at every Luck a character can reach: an
    //     unreachable threshold, not the best one in the game. A printed chance
    //     is unaffected, which is the half that proves this is a sentinel check
    //     and not a blanket floor.
    const unreachable = [-5, 0, 4, 10].every(
      (luck) => api.critThreshold(0, luck, false) === api.CRIT_IMPOSSIBLE,
    );
    step(
      "critChance 0 yields an unreachable threshold at every Luck; a printed 20 still lowers (pg 25, 129)",
      unreachable &&
        api.CRIT_IMPOSSIBLE > 20 &&
        api.critThreshold(20, 4, false) === 18 &&
        // Shotguns ignore Luck entirely, and that is untouched.
        api.critThreshold(20, 4, true) === 20,
      JSON.stringify({
        zero: api.critThreshold(0, 4, false),
        printed: api.critThreshold(20, 4, false),
        shotgun: api.critThreshold(20, 4, true),
      }),
    );

    // r3. The capacitors are priced in *rounds*, so a weapon this system tracks
    //     no magazine for cannot buy one — `rollAttack` had always refused, and
    //     `rollDamage` had always granted, from the same click. One shared
    //     gate now answers for both.
    const noMag = { isRanged: true, magazineSize: 0, attachedModKeys: ["overclockedCapacitor"] };
    const withMag = { isRanged: true, magazineSize: 6, attachedModKeys: ["overclockedCapacitor"] };
    step(
      "a magazine-less weapon cannot pay for a capacitor, on the damage roll as well as the attack (pg 75-76)",
      api.payableCapacitor(noMag, true) === null &&
        api.payableCapacitor(withMag, true)?.damage === 4 &&
        // Undeclared is still nothing, and the raw lookup is unchanged.
        api.payableCapacitor(withMag, false) === null &&
        api.capacitorBoost(["overclockedCapacitor"])?.damage === 4,
      JSON.stringify({
        noMag: api.payableCapacitor(noMag, true),
        withMag: api.payableCapacitor(withMag, true),
      }),
    );

    // r4. The Hide marker recorded one boolean — was it full cover — and
    //     `sneakAttackPosture` reconstructed the rest as "full cover, or else
    //     heavily obscured". That reads an *invisible* hider (pg 134) as
    //     standing in darkness (pg 118), which is a different paragraph with
    //     different rules. The marker now records what `canHide` accepted.
    const invisible = { cover: "none", heavilyObscured: false, invisible: true };
    await api.hide(hero, hero.system, { concealment: invisible, dc: 0 });
    await settle();
    const recorded = api.hiddenState(hero);
    const posture = api.sneakAttackPosture(hero, hero, { unaware: true });
    step(
      "an invisible hider is recorded and reported as invisible, not as heavily obscured (pg 134 vs 118)",
      recorded !== null &&
        recorded.concealment?.invisible === true &&
        recorded.concealment?.heavilyObscured === false &&
        recorded.fullCover === false &&
        posture.sneakAttack === true,
      JSON.stringify({ recorded: recorded?.concealment, sneak: posture.sneakAttack }),
    );
    await api.revealHidden(hero, null);
    await settle();

    // r5. Speedloader had no consumer at all: `reloadCost` grew the alternative
    //     branch, and both sheet call sites passed no mod keys, so no document
    //     could reach it. Asserted through a real weapon's own getter, which is
    //     the path the sheet takes.
    await hero.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-Review-Revolver-${revStamp}`,
        type: "weapon",
        system: {
          weaponType: "handgun",
          damage: "1d10",
          apCost: 4,
          critChance: 20,
          magazineSize: 6,
          special: "Manual Reload.",
          attachedMods: { speedloader: true },
        },
      },
    ]);
    const revolver = hero.items.getName(`SMOKE-Review-Revolver-${revStamp}`);
    const speedCost = api.reloadCost(revolver.system.keywords, revolver.system.attachedModKeys);
    const bareCost = api.reloadCost(revolver.system.keywords, []);
    step(
      "the Speedloader reaches the weapon's own reload cost and prices a full magazine (pg 77)",
      speedCost.kind === "manual" &&
        speedCost.alternative?.ap === api.RELOAD_AP_SPEEDLOADER &&
        bareCost.alternative === null &&
        // Six rounds by hand is 6 AP; the speedloader's flat 4 is cheaper.
        api.fullReloadAp(speedCost, 6) === api.RELOAD_AP_SPEEDLOADER &&
        api.fullReloadAp(bareCost, 6) === 6 &&
        api.WEAPON_MODS.speedloader.automation === "code",
      JSON.stringify({
        alternative: speedCost.alternative,
        full: api.fullReloadAp(speedCost, 6),
        bare: api.fullReloadAp(bareCost, 6),
      }),
    );

    // r6. `hasPrintedProperty` and `hasProperty` were the same four-line regex
    //     in two pure modules. One name now, and it still answers correctly —
    //     the twin's own test moved here rather than being deleted with it.
    step(
      "the printed-property test is one function, not two copies (rules/weapons → rules/mods)",
      api.hasProperty("Destructive. Two Handed.", "Destructive") === true &&
        api.hasProperty("Two Handed.", "Destructive") === false &&
        api.hasPrintedProperty === undefined,
      JSON.stringify({ twin: typeof api.hasPrintedProperty }),
    );
  } finally {
    await hero.delete();
  }
}

// D3 slices 4/8/12 — scope close-range, capacitors, Upgraded per-die.
{
  const Actors = game.actors.documentClass;

  // The attack card, not merely the last message: `rollAttack`'s tail posts the
  // reveal notice after it. Same trick as the suite's `lastAttackFlavor`, but
  // this block needs the roll's *formula* — 2d20kl is the only unambiguous
  // proof of a disadvantage, since the flavour suffix is localized text.
  const lastAttackCard = () => {
    for (let i = game.messages.contents.length - 1; i >= 0; i -= 1) {
      const message = game.messages.contents[i];
      if (String(message.rolls?.[0]?.formula ?? "").includes("d20")) return message;
    }
    return null;
  };
  const lastDamageCard = () => game.messages.contents.at(-1);

  await Actors.createDocuments([{ name: `SMOKE-ModRolls-${stamp}`, type: "character" }]);
  const shooter = game.actors.getName(`SMOKE-ModRolls-${stamp}`);

  try {
    // Ranges big enough that no shot in this block is ever out of its own normal
    // band: the distance clause and the scope clause share one cancellation
    // chain, so a shot that tripped both would prove nothing about either.
    // `attackBonusOverride: 0` is the same isolation — it switches off the
    // Strength-requirement and one-handed disadvantages, leaving the scope as
    // the only thing that can put 2d20kl on the card.
    const rifle = {
      type: "weapon",
      system: {
        weaponType: "rifle",
        damage: "1",
        apCost: 4,
        critChance: 20,
        magazineSize: 0,
        rangeNormal: 1000,
        rangeLong: 2000,
        attackBonusOverride: 0,
      },
    };
    await shooter.createEmbeddedDocuments("Item", [
      {
        ...rifle,
        name: `SMOKE-ModRolls-Scoped-${stamp}`,
        system: { ...rifle.system, attachedMods: { scope: true } },
      },
      {
        ...rifle,
        name: `SMOKE-ModRolls-Infrared-${stamp}`,
        system: { ...rifle.system, attachedMods: { infraredScope: true } },
      },
      { ...rifle, name: `SMOKE-ModRolls-Bare-${stamp}` },
      {
        type: "weapon",
        name: `SMOKE-ModRolls-Laser-${stamp}`,
        system: {
          weaponType: "energyWeapon",
          damage: "1",
          apCost: 4,
          critChance: 20,
          magazineSize: 20,
          loadedAmmo: 5,
          rangeNormal: 1000,
          rangeLong: 2000,
          attackBonusOverride: 0,
          attachedMods: { boostedCapacitor: true },
        },
      },
      {
        type: "weapon",
        name: `SMOKE-ModRolls-Bat-${stamp}`,
        // 2d2 cannot roll anything but 1s and 2s, so Upgraded's trigger is
        // forced without touching the dice: every die qualifies, every time.
        system: {
          weaponType: "blunt",
          damage: "2d2",
          apCost: 4,
          critChance: 20,
          magazineSize: 0,
          attackBonusOverride: 0,
          attachedMods: { meleeUpgraded: true },
        },
      },
    ]);
    await settle();
    // By name, never by creation order — the returned array is not reliably
    // input-ordered, and a swapped pair would invert every assertion below.
    const scoped = shooter.items.getName(`SMOKE-ModRolls-Scoped-${stamp}`);
    const infrared = shooter.items.getName(`SMOKE-ModRolls-Infrared-${stamp}`);
    const bare = shooter.items.getName(`SMOKE-ModRolls-Bare-${stamp}`);
    const laser = shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`);
    const bat = shooter.items.getName(`SMOKE-ModRolls-Bat-${stamp}`);

    const shoot = async (item, distance, mode = "normal", options = {}) => {
      await api.rollAttack(shooter, shooter.system, item, item.system, mode, {
        distanceFeet: distance,
        ...options,
      });
      await settle();
      const card = lastAttackCard();
      return {
        formula: String(card?.rolls?.[0]?.formula ?? ""),
        flavor: String(card?.flavor ?? ""),
      };
    };

    // ---- slice 4: Scope and Infrared Scope's close-range disadvantage -------

    // x1. The pure band first, so a failure downstream can be read as a wiring
    //     fault rather than an arithmetic one. "Within 50 feet" is inclusive at
    //     exactly 50 — the ruling stated at `scopeCloseRange`.
    step(
      "scopeCloseRange: 50 ft for a Scope, 30 for an Infrared Scope, inclusive at the edge (pg 76-77)",
      api.scopeCloseRange(["scope"], 20)?.feet === 50 &&
        api.scopeCloseRange(["scope"], 50)?.feet === 50 &&
        api.scopeCloseRange(["scope"], 51) === null &&
        api.scopeCloseRange(["infraredScope"], 30)?.feet === 30 &&
        api.scopeCloseRange(["infraredScope"], 31) === null &&
        api.scopeCloseRange([], 5) === null &&
        // A weapon wearing both — which the table forbids and nothing here
        // refuses — is at disadvantage inside the wider of the two bands.
        api.scopeCloseRange(["scope", "infraredScope"], 45)?.mod === "scope",
      JSON.stringify({
        at20: api.scopeCloseRange(["scope"], 20),
        at51: api.scopeCloseRange(["scope"], 51),
        both45: api.scopeCloseRange(["scope", "infraredScope"], 45),
      }),
    );

    // x2. Inside the band: the roll itself takes the disadvantage, and the card
    //     says which mod did it.
    const closeShot = await shoot(scoped, 20);
    const closeNote = game.i18n.localize("FALLOUT.Mods.scopeClose", {
      mod: game.i18n.localize("FALLOUT.Mods.names.scope"),
      page: "77",
      feet: 50,
      distance: 20,
    });
    step(
      "a Scope shot at 20 ft rolls at disadvantage and names the mod (pg 77)",
      closeShot.formula.includes("2d20kl") && closeShot.flavor.includes(closeNote),
      JSON.stringify(closeShot),
    );

    // x3. Outside the band, same weapon, same distance-declaring call: a plain
    //     1d20 and no note. Without this, x2 would also pass on a clause that
    //     fired unconditionally.
    const farShot = await shoot(scoped, 80);
    step(
      "the same scoped weapon at 80 ft rolls straight — the band is a band, not a penalty",
      farShot.formula.includes("1d20") &&
        !farShot.formula.includes("2d20") &&
        !farShot.flavor.includes("within"),
      JSON.stringify(farShot),
    );

    // x4. And the control at the top of the chain: an unmodded rifle at the same
    //     20 ft is untouched, so x2 is the mod's doing and not the distance's.
    const bareShot = await shoot(bare, 20);
    step(
      "an unmodded rifle at 20 ft is unaffected — the clause comes off the weapon's mods",
      bareShot.formula.includes("1d20") && !bareShot.formula.includes("2d20"),
      JSON.stringify(bareShot),
    );

    // x5. The Infrared Scope's shorter band, in both directions: 40 ft is inside
    //     a Scope's 50 and outside an Infrared's 30, which is the one distance
    //     that tells the two rows apart.
    const infraredFar = await shoot(infrared, 40);
    const infraredClose = await shoot(infrared, 25);
    step(
      "an Infrared Scope is clean at 40 ft and disadvantaged at 25 — its band is 30, not 50 (pg 76)",
      infraredFar.formula.includes("1d20") &&
        !infraredFar.formula.includes("2d20") &&
        infraredClose.formula.includes("2d20kl"),
      JSON.stringify({ at40: infraredFar.formula, at25: infraredClose.formula }),
    );

    // x6. **The cancellation convention.** One disadvantage total, and it cannot
    //     bury an advantage the character already had: a close scoped shot rolled
    //     with advantage comes out *normal*, exactly as the dodge, range and
    //     one-handed clauses in the same chain behave. The note still prints —
    //     the clause fired, it was simply cancelled.
    const advantaged = await shoot(scoped, 20, "advantage");
    step(
      "the Scope's disadvantage cancels a held advantage instead of burying it (the usual convention)",
      advantaged.formula.includes("1d20") &&
        !advantaged.formula.includes("2d20") &&
        advantaged.flavor.includes(closeNote),
      JSON.stringify(advantaged),
    );

    // ---- slice 8: Boosted / Overclocked Capacitor --------------------------

    // p1. The trade, and the stated ruling for a weapon wearing both (the table
    //     forbids the pair; `modEligibility` reports it and nothing refuses it).
    step(
      "capacitorBoost: 2 rounds for +2, 3 for +4, Overclocked winning a weapon that has both (pg 75-76)",
      api.capacitorBoost(["boostedCapacitor"])?.rounds === 2 &&
        api.capacitorBoost(["boostedCapacitor"])?.damage === 2 &&
        api.capacitorBoost(["overclockedCapacitor"])?.rounds === 3 &&
        api.capacitorBoost(["overclockedCapacitor"])?.damage === 4 &&
        api.capacitorBoost(["boostedCapacitor", "overclockedCapacitor"])?.mod ===
          "overclockedCapacitor" &&
        api.capacitorBoost([]) === null &&
        api.capacitorBoost(["silencer"]) === null,
      JSON.stringify({
        boosted: api.capacitorBoost(["boostedCapacitor"]),
        both: api.capacitorBoost(["boostedCapacitor", "overclockedCapacitor"]),
      }),
    );

    // p2. The spend: 2 rounds instead of 1, and a receipt on the card.
    const boostedShot = await shoot(laser, 100, "normal", { capacitor: true });
    const spentTwo = await until(
      () => shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`).system.loadedAmmo === 3,
    );
    step(
      "a Boosted Capacitor attack spends 2 rounds instead of 1 and says so (pg 75)",
      spentTwo &&
        boostedShot.flavor.includes(
          game.i18n.localize("FALLOUT.Mods.capacitorSpent", {
            mod: game.i18n.localize("FALLOUT.Mods.names.boostedCapacitor"),
            rounds: 2,
            damage: 2,
            loaded: 3,
          }),
        ),
      JSON.stringify({
        loaded: shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`).system.loadedAmmo,
        flavor: boostedShot.flavor,
      }),
    );

    // p3. Undeclared, the same weapon shoots for one round: the boost is a
    //     per-attack choice, not a property of owning the mod.
    await shoot(shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`), 100);
    const spentOne = await until(
      () => shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`).system.loadedAmmo === 2,
    );
    step(
      "the same weapon fired without the boost spends one round",
      spentOne,
      JSON.stringify({
        loaded: shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`).system.loadedAmmo,
      }),
    );

    // p4. **The early-out.** A magazine that cannot pay for the boost refuses
    //     the attack before anything is spent — no roll, no card, and the single
    //     round still in the magazine. The ruling that this refuses rather than
    //     quietly firing an unboosted shot is stated at the call site.
    await laser.update({ "system.loadedAmmo": 1 });
    await settle();
    const messagesBefore = game.messages.size;
    await api.rollAttack(
      shooter,
      shooter.system,
      shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`),
      shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`).system,
      "normal",
      { capacitor: true },
    );
    await settle(800);
    step(
      "a magazine that cannot pay for the boost refuses the attack and spends nothing (pg 75)",
      game.messages.size === messagesBefore &&
        shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`).system.loadedAmmo === 1,
      JSON.stringify({
        messages: `${messagesBefore}->${game.messages.size}`,
        loaded: shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`).system.loadedAmmo,
      }),
    );

    // p5. …and the round it refused to boost with is still good for a plain
    //     shot, which is what makes p4 a refusal of the *boost* rather than an
    //     ordinary empty magazine.
    await shoot(shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`), 100);
    const drained = await until(
      () => shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`).system.loadedAmmo === 0,
    );
    step(
      "the round the boost could not use still fires an ordinary attack",
      drained,
      JSON.stringify({
        loaded: shooter.items.getName(`SMOKE-ModRolls-Laser-${stamp}`).system.loadedAmmo,
      }),
    );

    // p6. The damage half. The weapon's printed damage is a flat 1 and the
    //     to-hit override zeroes the ability modifier, so the boost is the only
    //     thing that can move the number the Apply button will spend.
    await api.rollDamage(shooter, shooter.system, laser, laser.system, false, undefined, true);
    await settle();
    const boostedDamage = lastDamageCard()?.getFlag("fallout-ttrpg", "damage");
    await api.rollDamage(shooter, shooter.system, laser, laser.system);
    await settle();
    const plainDamage = lastDamageCard()?.getFlag("fallout-ttrpg", "damage");
    step(
      "the boost adds its +2 to the damage roll it was paid for (pg 75)",
      boostedDamage?.total === 3 && plainDamage?.total === 1,
      JSON.stringify({ boosted: boostedDamage?.total, plain: plainDamage?.total }),
    );

    // ---- slice 12: melee Upgraded ------------------------------------------

    // u1. The ruling, asserted directly: once per qualifying die, so 1 and 2 on
    //     a 2d6 is +4 and not +2. Dropped dice do not count — they contribute
    //     nothing to the damage this clause increases.
    const bonusOf = api.upgradedDamageBonus([
      {
        results: [
          { result: 1, active: true },
          { result: 2, active: true },
          { result: 5, active: true },
          { result: 1, active: false },
        ],
      },
    ]);
    step(
      "Upgraded pays +2 per qualifying die, ignoring dropped dice (pg 65 — the stated ruling)",
      bonusOf.count === 2 &&
        bonusOf.bonus === 4 &&
        api.upgradedDamageBonus([{ results: [{ result: 3, active: true }] }]).bonus === 0 &&
        api.upgradedDamageBonus([]).bonus === 0,
      JSON.stringify(bonusOf),
    );

    // u2. Live, with the low roll forced rather than hoped for: 2d2 can only
    //     roll 1s and 2s, so both dice always qualify and the bump is always 4.
    //     This is the first thing in the system to read individual die results,
    //     so the assertion is against the roll's own total rather than a fixed
    //     number.
    await api.rollDamage(shooter, shooter.system, bat, bat.system);
    await settle();
    const upgradedCard = lastDamageCard();
    const upgradedFlag = upgradedCard?.getFlag("fallout-ttrpg", "damage");
    const rolledTotal = Number(upgradedCard?.rolls?.[0]?.total ?? 0);
    step(
      "Upgraded adds 2 per low die to the damage that gets applied (pg 65)",
      upgradedFlag?.total === rolledTotal + 4 &&
        rolledTotal >= 2 &&
        rolledTotal <= 4 &&
        String(upgradedCard?.flavor ?? "").includes(
          game.i18n.localize("FALLOUT.Mods.upgraded", {
            count: 2,
            bonus: 4,
            total: rolledTotal + 4,
          }),
        ),
      JSON.stringify({ rolled: rolledTotal, applied: upgradedFlag?.total }),
    );

    // u3. The control: the same weapon and the same forced-low dice without the
    //     mod applies exactly what it rolled.
    await bat.update({ "system.attachedMods.meleeUpgraded": false });
    await settle();
    await api.rollDamage(
      shooter,
      shooter.system,
      shooter.items.getName(`SMOKE-ModRolls-Bat-${stamp}`),
      shooter.items.getName(`SMOKE-ModRolls-Bat-${stamp}`).system,
    );
    await settle();
    const plainCard = lastDamageCard();
    const plainFlag = plainCard?.getFlag("fallout-ttrpg", "damage");
    const plainRolled = Number(plainCard?.rolls?.[0]?.total ?? 0);
    step(
      "removing Upgraded leaves the same forced-low roll applying exactly what it rolled",
      plainFlag?.total === plainRolled && plainRolled >= 2 && plainRolled <= 4,
      JSON.stringify({ rolled: plainRolled, applied: plainFlag?.total }),
    );
  } finally {
    await shooter.delete();
  }
}

// D3 — weapon mods: the foundation and the Silencer slice, end to end.
{
  const Actors = game.actors.documentClass;
  const FULL_COVER = { cover: "total", heavilyObscured: false, invisible: false };
  const recentContent = (count = 4) =>
    game.messages.contents
      .slice(-count)
      .map((message) => String(message.content ?? ""))
      .join(" ");

  await Actors.createDocuments([{ name: `SMOKE-Mods-Shooter-${stamp}`, type: "character" }]);
  const shooter = game.actors.getName(`SMOKE-Mods-Shooter-${stamp}`);

  try {
    // A Sneak bonus large enough that the hide below cannot fail on dice luck,
    // the same insurance the B4-5 reveal block takes.
    await shooter.update({ "system.bonuses.skills.sneak": 30 });

    // Two 10mm pistols: one with a Silencer bolted on, one bare. Both have no
    // magazine, because this block is about the tail of the roll and an empty
    // magazine would refuse the attack before the tail ever ran.
    const base = {
      type: "weapon",
      system: { weaponType: "handgun", damage: "1d6", apCost: 4, critChance: 20, magazineSize: 0 },
    };
    await shooter.createEmbeddedDocuments("Item", [
      {
        ...base,
        name: `SMOKE-Mods-Silenced-${stamp}`,
        system: { ...base.system, attachedMods: { silencer: true } },
      },
      { ...base, name: `SMOKE-Mods-Loud-${stamp}` },
    ]);
    await settle();
    // By name, never by createDocuments return order — the returned array is not
    // reliably input-ordered, and a swapped pair here would invert every
    // assertion in the block.
    const quiet = shooter.items.getName(`SMOKE-Mods-Silenced-${stamp}`);
    const loudGun = shooter.items.getName(`SMOKE-Mods-Loud-${stamp}`);

    // m1. The schema round-trips, and the derived answer follows from it. This
    //     is the assertion that would have caught the ArrayField→TypedObjectField
    //     class of bug: a SchemaField of booleans that silently dropped its keys
    //     would leave `silenced` false and every later step would look like a
    //     stealth bug instead of a schema one.
    step(
      "a weapon stores its attached mods and derives the Silencer from them (pg 77)",
      quiet.system.attachedMods.silencer === true &&
        quiet.system.silenced === true &&
        quiet.system.attachedModKeys.join(",") === "silencer" &&
        quiet.system.modSlotsUsed === 2 &&
        quiet.system.modSlotsExceeded === false &&
        loudGun.system.silenced === false &&
        loudGun.system.attachedModKeys.length === 0 &&
        loudGun.system.modSlotsUsed === 0,
      JSON.stringify({
        stored: quiet.system.attachedMods.silencer,
        silenced: quiet.system.silenced,
        keys: quiet.system.attachedModKeys,
        slots: quiet.system.modSlotsUsed,
        loudSilenced: loudGun.system.silenced,
      }),
    );

    // A hide with a declared DC and no observers: pg 127 prices the DC off
    // nearby enemies and this block has none, so the DC override is the same
    // escape hatch the B4-5 block and Escape's bear trap both use.
    const conceal = async () => {
      await api.hide(shooter, shooter.system, { concealment: FULL_COVER, dc: 1 });
      await api.takeCover(shooter, "half");
      await settle();
    };

    // m2. THE POINT OF THE ITEM. Nothing is declared: the weapon answers.
    await conceal();
    const armedQuiet = api.hiddenState(shooter) !== null && api.takingCover(shooter) !== null;
    await api.rollAttack(shooter, shooter.system, quiet, quiet.system, "normal");
    await settle();
    step(
      "attacking with a Silencer-modded weapon keeps the Hide, with nothing declared (pg 77)",
      armedQuiet &&
        api.hiddenState(shooter) !== null &&
        // Take Cover is a stance you leave by acting out of it, silencer or not.
        api.takingCover(shooter) === null &&
        recentContent().includes("still hidden from everyone except"),
      JSON.stringify({
        armedQuiet,
        hidden: api.hiddenState(shooter) !== null,
        covered: api.takingCover(shooter) !== null,
      }),
    );

    // m3. The control, and the half that proves m2 is not vacuous: the same
    //     actor, the same posture, a weapon without the mod, and the hiding is
    //     gone.
    await conceal();
    const armedLoud = api.hiddenState(shooter) !== null;
    await api.rollAttack(shooter, shooter.system, loudGun, loudGun.system, "normal");
    await settle();
    step(
      "attacking with an unmodded weapon still gives the position away (pg 77, by exception)",
      armedLoud &&
        api.hiddenState(shooter) === null &&
        api.takingCover(shooter) === null &&
        recentContent().includes("Attacked from hiding"),
      JSON.stringify({ armedLoud, hidden: api.hiddenState(shooter) !== null }),
    );

    // m4. The declared option still wins, on a weapon that carries no mod. GMs
    //     improvise suppressed weapons and homebrew invents them; the mod being
    //     detectable must not take the declaration away.
    await conceal();
    await api.rollAttack(shooter, shooter.system, loudGun, loudGun.system, "normal", {
      silenced: true,
    });
    await settle();
    step(
      "an explicit silenced:true still wins on a weapon with no Silencer attached",
      api.hiddenState(shooter) !== null &&
        recentContent().includes("still hidden from everyone except"),
      JSON.stringify({ hidden: api.hiddenState(shooter) !== null }),
    );

    // m5. And it wins in the other direction too, which is the same convention
    //     `sneak` already uses: a declaration is a declaration. A GM who rules
    //     that this particular shot was loud gets a loud shot even off a
    //     silenced weapon.
    await conceal();
    await api.rollAttack(shooter, shooter.system, quiet, quiet.system, "normal", {
      silenced: false,
    });
    await settle();
    step(
      "an explicit silenced:false suppresses a real Silencer (declarations win both ways)",
      api.hiddenState(shooter) === null && recentContent().includes("Attacked from hiding"),
      JSON.stringify({ hidden: api.hiddenState(shooter) !== null }),
    );

    // m6. Detaching is just clearing the flag, and the derived answer follows it
    //     back down. Without this, a stuck getter would pass every step above.
    await quiet.update({ "system.attachedMods.silencer": false });
    await settle();
    await conceal();
    await api.rollAttack(shooter, shooter.system, quiet, quiet.system, "normal");
    await settle();
    step(
      "removing the Silencer makes the same weapon loud again",
      quiet.system.silenced === false &&
        quiet.system.modSlotsUsed === 0 &&
        api.hiddenState(shooter) === null,
      JSON.stringify({
        silenced: quiet.system.silenced,
        slots: quiet.system.modSlotsUsed,
        hidden: api.hiddenState(shooter) !== null,
      }),
    );

    // m7. The compendium half: all 31 pg 65 / pg 75-77 mods ship as gear
    //     documents and now name themselves to code through `system.modKey`.
    //     That key is the seam the attach control will use, and a build that
    //     stopped writing it would be invisible everywhere else.
    const equipment = game.packs.get("fallout-ttrpg.equipment");
    const index = await equipment.getIndex({ fields: ["system.modKey", "type"] });
    const keyed = index.filter((entry) => (entry.system?.modKey ?? "") !== "");
    const silencerDoc = index.find((entry) => entry.name === "Ranged Weapon Mod: Silencer");
    step(
      "all 31 weapon mods ship as gear documents carrying their mod key (pg 65, 75-77)",
      keyed.length === 31 && silencerDoc?.system?.modKey === "silencer",
      JSON.stringify({ keyed: keyed.length, silencer: silencerDoc?.system?.modKey }),
    );
  } finally {
    await shooter.delete();
  }
}

// D4 — the perk/trait mechanics audit: 11 -> 27 entries carry an effect.
{
  const d4Stamp = Date.now();
  const perkPack = game.packs.get("fallout-ttrpg.perks");
  const perkIndex = await perkPack.getIndex();
  /** Pull a shipped perk/trait document out of the compendium by name. */
  const fetchPerk = async (perkName) => {
    const found = perkIndex.find((doc) => doc.name === perkName);
    return found ? await perkPack.getDocument(found._id) : null;
  };

  const hauler = await fetchPerk("Hauler");
  const denseCircuitry = await fetchPerk("Dense Circuitry");
  const bloodyMess = await fetchPerk("Bloody Mess");
  const doNoHarm = await fetchPerk("Do No Harm");
  const nuclearReactor = await fetchPerk("Nuclear Reactor");
  step(
    "the five audited perks/traits ship in the perks compendium",
    !!hauler && !!denseCircuitry && !!bloodyMess && !!doNoHarm && !!nuclearReactor,
    JSON.stringify({
      hauler: !!hauler,
      denseCircuitry: !!denseCircuitry,
      bloodyMess: !!bloodyMess,
      doNoHarm: !!doNoHarm,
      nuclearReactor: !!nuclearReactor,
    }),
  );

  // d1. Hauler (pg 36): "Your maximum carry load increases by 50." The flattest
  //     case in the audit — no condition, no scaling, no choice — and it went
  //     unwritten for two passes only because `carryLoad` was not yet a bonus
  //     path. Carry load is derived from Strength, so the assertion is against
  //     the pool the sheet shows, not against the raw bonus.
  const carrier = await ActorClass.create({
    name: `SMOKE-D4-Hauler-${d4Stamp}`,
    type: "character",
    system: { details: { race: "human" }, abilities: { strength: { value: 6 } } },
  });
  try {
    const loadBefore = carrier.system.derived.carryLoadMax;
    await carrier.createEmbeddedDocuments("Item", [hauler.toObject()]);
    await settle();
    step(
      "Hauler raises the derived carry load maximum by 50 (pg 36)",
      carrier.system.derived.carryLoadMax === loadBefore + 50,
      JSON.stringify({
        before: loadBefore,
        after: carrier.system.derived.carryLoadMax,
      }),
    );
  } finally {
    await carrier.delete();
  }

  // d2. Dense Circuitry (trait, pg 26): "You gain a bonus to your Healing Rate
  //     maximum equal to 2. However, your Combat Sequence rolls are decreased
  //     by 2." Both halves are flat and unconditional, and they land on two
  //     different derived numbers — healing rate is computed from level and
  //     Endurance, while the combat sequence penalty rides `initiativeBonus`,
  //     which the initiative formula in `fallout.ts` reads directly.
  const synth = await ActorClass.create({
    name: `SMOKE-D4-Dense-${d4Stamp}`,
    type: "character",
    system: { details: { race: "gen2synth" }, abilities: { endurance: { value: 6 } } },
  });
  try {
    const healBefore = synth.system.derived.healingRate;
    const initBefore = synth.system.derived.initiativeBonus;
    await synth.createEmbeddedDocuments("Item", [denseCircuitry.toObject()]);
    await settle();
    step(
      "Dense Circuitry pays 2 Healing Rate for 2 Combat Sequence (pg 26)",
      synth.system.derived.healingRate === healBefore + 2 &&
        synth.system.derived.initiativeBonus === initBefore - 2,
      JSON.stringify({
        healing: [healBefore, synth.system.derived.healingRate],
        initiative: [initBefore, synth.system.derived.initiativeBonus],
      }),
    );
  } finally {
    await synth.delete();
  }

  // d3. Bloody Mess (pg 49) "+2 damage with a weapon or explosive" and Do No
  //     Harm (trait, pg 27) "the damage is reduced by 1 to a minimum of 1" both
  //     write `system.bonuses.damage`, the same field Psychosis and
  //     Strengthening already use. Held together they must *sum* to +1 rather
  //     than one overwriting the other — and the book's minimum of 1 needs no
  //     annotation, because `rollDamage` already floors at MINIMUM_DAMAGE.
  const brawler = await ActorClass.create({
    name: `SMOKE-D4-Damage-${d4Stamp}`,
    type: "character",
    system: { details: { race: "human" } },
  });
  try {
    const damageBefore = brawler.system.derived.damageBonus;
    await brawler.createEmbeddedDocuments("Item", [bloodyMess.toObject()]);
    await settle();
    const withBloody = brawler.system.derived.damageBonus;
    await brawler.createEmbeddedDocuments("Item", [doNoHarm.toObject()]);
    await settle();
    step(
      "Bloody Mess +2 and Do No Harm −1 stack on one damage bonus (pg 49, 27)",
      damageBefore === 0 && withBloody === 2 && brawler.system.derived.damageBonus === 1,
      JSON.stringify({
        base: damageBefore,
        bloodyMess: withBloody,
        both: brawler.system.derived.damageBonus,
      }),
    );
  } finally {
    await brawler.delete();
  }

  // d4. Nuclear Reactor (pg 52) — the entry both previous passes named as the
  //     best promotion candidate and both left as text, because its whole
  //     paragraph hangs off "While in an irradiated zone" and an always-on
  //     +1 AC / +2 DT / advantage-on-everything would be wrong whenever the
  //     character stepped out of the glow. It is now exactly what a conditional
  //     effect is for: nine changes in one group, shipped disabled, switched by
  //     the same Sync button Hoarder uses — and switched back off again.
  const glowing = await ActorClass.create({
    name: `SMOKE-D4-Reactor-${d4Stamp}`,
    type: "character",
    system: { details: { race: "human" } },
  });
  try {
    const acBefore = glowing.system.derived.ac;
    const dtBefore = glowing.system.derived.dt;
    await glowing.createEmbeddedDocuments("Item", [nuclearReactor.toObject()]);
    await settle();

    // d4a. Shipped disabled and *staying* disabled: nothing has declared the
    //      zone, so none of the nine changes may reach the sheet yet.
    const reactorEffects =
      glowing.items.find((i) => i.name === "Nuclear Reactor")?.effects.contents ?? [];
    step(
      "Nuclear Reactor arrives as one disabled, condition-flagged effect",
      reactorEffects.length === 1 &&
        reactorEffects[0].disabled === true &&
        api.effectCondition(reactorEffects[0]) === "inIrradiatedZone" &&
        api.effectConditionNegated(reactorEffects[0]) === false &&
        reactorEffects[0].system.changes.length === 9 &&
        glowing.system.derived.ac === acBefore &&
        glowing.system.derived.dt === dtBefore &&
        glowing.system.derived.advantage.strength === 0,
      JSON.stringify({
        effects: reactorEffects.length,
        disabled: reactorEffects[0]?.disabled,
        condition: reactorEffects[0] ? api.effectCondition(reactorEffects[0]) : null,
        changes: reactorEffects[0]?.system.changes.length,
        ac: glowing.system.derived.ac,
        dt: glowing.system.derived.dt,
      }),
    );

    // d4b. `inIrradiatedZone` is a *declared* situation — the sheet cannot see
    //      a zone the way it can see a carry load — so the table sets it and
    //      Sync brings the effect into line.
    await api.setSituation(glowing, "inIrradiatedZone", true);
    await settle();
    const synced = await api.syncSituations(glowing, glowing.system);
    await settle();
    const advantage = glowing.system.derived.advantage;
    const abilities = ["strength", "perception", "endurance", "charisma", "intelligence", "agility", "luck"];
    step(
      "in an irradiated zone Nuclear Reactor grants AC +1, DT +2 and advantage on every ability (pg 52)",
      synced.enabled.includes("Nuclear Reactor") &&
        glowing.system.derived.ac === acBefore + 1 &&
        glowing.system.derived.dt === dtBefore + 2 &&
        abilities.every((ability) => advantage[ability] === 1) &&
        // "all ability and skill checks" is the seven ability categories, which
        // cover the skills they govern — not `all`, which would also sweep in
        // attack rolls and combat sequence the perk never mentions.
        advantage.attack === 0 &&
        advantage.initiative === 0 &&
        api.effectiveMode(glowing.system, ["luck"], "normal") === "advantage",
      JSON.stringify({
        enabled: synced.enabled,
        ac: glowing.system.derived.ac,
        dt: glowing.system.derived.dt,
        advantage: abilities.map((ability) => advantage[ability]),
        attack: advantage.attack,
      }),
    );

    // d4c. Walk out of the zone: the same button takes all nine back. This is
    //      the half a plain always-on annotation could never have done, and the
    //      reason both earlier passes were right to leave it as text until the
    //      emitter could write a condition flag.
    await api.setSituation(glowing, "inIrradiatedZone", false);
    await settle();
    const cleared = await api.syncSituations(glowing, glowing.system);
    await settle();
    step(
      "leaving the zone takes every Nuclear Reactor bonus back",
      cleared.disabled.includes("Nuclear Reactor") &&
        glowing.system.derived.ac === acBefore &&
        glowing.system.derived.dt === dtBefore &&
        glowing.system.derived.advantage.luck === 0,
      JSON.stringify({
        disabled: cleared.disabled,
        ac: glowing.system.derived.ac,
        dt: glowing.system.derived.dt,
        luck: glowing.system.derived.advantage.luck,
      }),
    );
  } finally {
    await glowing.delete();
  }
}

// Hoarder (pg 32) — the trait the whole EFFECT_CONDITIONS machinery was built
// for, and which carried no mechanics at all until this batch: the condition
// existed, the emitter had no way to write its flag, and the trait therefore
// granted neither its +25 Carry Load nor its disadvantage.
{
  const hoardStamp = Date.now();
  const hoarder = await ActorClass.create({
    name: `SMOKE-Hoarder-${hoardStamp}`,
    type: "character",
    system: { details: { race: "human" }, abilities: { strength: { value: 6 } } },
  });
  try {
    const pack = game.packs.get("fallout-ttrpg.perks");
    const index = await pack.getIndex();
    const entry = index.find((e) => e.name === "Hoarder");
    step("the Hoarder trait ships in the perks compendium", !!entry, JSON.stringify({ found: !!entry }));
    if (entry) {
      const source = await pack.getDocument(entry._id);
      const loadBefore = hoarder.system.derived.carryLoadMax;
      await hoarder.createEmbeddedDocuments("Item", [source.toObject()]);
      await settle();

      // h1. Two effects, split by condition: the flat bonus must not come and
      //     go with the load it exists to help you reach.
      const effects = hoarder.items.find((i) => i.name === "Hoarder")?.effects.contents ?? [];
      const conditional = effects.filter((e) => api.effectCondition(e) !== null);
      const flat = effects.filter((e) => api.effectCondition(e) === null);
      step(
        "Hoarder splits into an unconditional bonus and a conditional penalty",
        effects.length === 2 && flat.length === 1 && conditional.length === 1 &&
          flat[0].disabled === false && conditional[0].disabled === true,
        JSON.stringify(effects.map((e) => ({ n: e.name, off: e.disabled, c: api.effectCondition(e) }))),
      );

      // h2. The +25 applies immediately, with nothing synced and the situation
      //     false — which is the half a single merged effect would have broken.
      step(
        "the +25 Carry Load applies unconditionally (pg 32)",
        hoarder.system.derived.carryLoadMax === loadBefore + 25,
        JSON.stringify({ before: loadBefore, after: hoarder.system.derived.carryLoadMax }),
      );

      // h3. The disadvantage is negated: it waits on NOT carrying 50 load, so
      //     an empty-handed hoarder is the case where it bites.
      const listed = api.situationalEffects(hoarder, hoarder.system);
      const hoardEntry = listed.find((e) => e.condition === "carryingHeavy");
      step(
        "Hoarder's penalty waits on the inverse of its own condition (negated)",
        !!hoardEntry && hoardEntry.negated === true &&
          hoarder.system.derived.situations.carryingHeavy === false &&
          hoardEntry.holds === true,
        JSON.stringify({ negated: hoardEntry?.negated, holds: hoardEntry?.holds,
                         situation: hoarder.system.derived.situations.carryingHeavy }),
      );

      // h4. Sync switches it on while under 50 load, and the disadvantage
      //     reaches the roll layer for ability, skill and attack alike.
      await api.syncSituations(hoarder, hoarder.system);
      await settle();
      const d = hoarder.system.derived.disadvantage;
      step(
        "an under-loaded Hoarder takes disadvantage on abilities, skills and attacks",
        d.strength >= 1 && d.attack >= 1 &&
          api.effectiveMode(hoarder.system, ["strength"], "normal") === "disadvantage" &&
          api.effectiveMode(hoarder.system, ["attack"], "normal") === "disadvantage",
        JSON.stringify({ strength: d.strength, attack: d.attack }),
      );

      // h5. Load it up past 50 and the same Sync takes the penalty away —
      //     the situation now holds, so the negated effect switches off.
      await hoarder.createEmbeddedDocuments("Item", [
        { name: `SMOKE-Hoard-${hoardStamp}`, type: "gear", system: { quantity: 1, load: 60 } },
      ]);
      await settle();
      await api.syncSituations(hoarder, hoarder.system);
      await settle();
      step(
        "carrying 50+ load clears the penalty, and the Carry Load bonus stays",
        hoarder.system.derived.situations.carryingHeavy === true &&
          hoarder.system.derived.disadvantage.strength === 0 &&
          hoarder.system.derived.carryLoadMax === loadBefore + 25,
        JSON.stringify({ heavy: hoarder.system.derived.situations.carryingHeavy,
                         str: hoarder.system.derived.disadvantage.strength,
                         load: hoarder.system.derived.carryLoadMax }),
      );
    }
  } finally {
    await hoarder.delete();
  }
}

// D2 — junk as documents: the consumption seam. Twelve steps, header inside.
{
const junkPack = game.packs.get("fallout-ttrpg.equipment");
const junkIndex = await junkPack.getIndex();
const fetchJunk = async (itemName) => {
  const found = junkIndex.find((doc) => doc.name === itemName);
  return found ? await junkPack.getDocument(found._id) : null;
};

// j1. the junk documents reached the world, carry a junkType, and did not turn
//     the rest of gear into junk on the way. "Junk: Cloth" is the one the first
//     aid rule spends by name (pg 21, 23); Lockpicks is an ordinary tool and
//     must still read as non-junk.
const junkCloth = await fetchJunk("Junk: Cloth");
const junkSteel = await fetchJunk("Junk: Steel");
const junkScrews = await fetchJunk("Junk: Screws");
const notJunk = await fetchJunk("Lockpicks");
const junkNames = junkIndex.filter((doc) => doc.name.startsWith("Junk: "));
step(
  "the equipment compendium ships the crafting junk with a junkType",
  junkNames.length >= 40 &&
    !!junkCloth &&
    junkCloth.type === "gear" &&
    junkCloth.system.junkType === "cloth" &&
    junkCloth.system.quantity === 1 &&
    junkSteel?.system.junkType === "steel" &&
    junkScrews?.system.junkType === "screws" &&
    !!notJunk &&
    notJunk.system.junkType === "",
  JSON.stringify({
    junkDocuments: junkNames.length,
    cloth: junkCloth ? { type: junkCloth.type, junkType: junkCloth.system.junkType } : null,
    lockpicks: notJunk ? notJunk.system.junkType : null,
  }),
);

// j2. three materials share a name with an armor type, which is why every junk
//     document carries the "Junk: " prefix. If the prefix is ever dropped, the
//     blueprint join in build-packs.mjs hands the junk stack the armor's repair
//     DC — so assert the two documents are still distinct things.
const steelArmor = await fetchJunk("Steel");
step(
  "junk named after an armor type is a separate document from the armor",
  !!steelArmor &&
    steelArmor.type === "armor" &&
    junkSteel?.type === "gear" &&
    steelArmor?.id !== junkSteel?.id &&
    !!junkSteel,
  JSON.stringify({ armor: steelArmor?.type, junk: junkSteel?.type }),
);

// A scavenger of its own, so nothing else's inventory is spent by these steps.
const scavenger = await ActorClass.create({
  name: `SMOKE-Scavenger-${stamp}`,
  type: "character",
});

/** Put a stack of one material on the scavenger, from the compendium document. */
const stock = async (itemName, quantity) => {
  // A missing pack document is exactly the regression these steps exist to
  // catch — surface it as its own failing step instead of a TypeError that
  // aborts every block after this one.
  
  const source = await fetchJunk(itemName);
  if (!source) {
    step(`junk fixture "${itemName}" exists in the equipment pack`, false, "missing");
    return;
  }
  const [created] = await scavenger.createEmbeddedDocuments("Item", [
    { ...source.toObject(), system: { ...source.toObject().system, quantity } },
  ]);
  return created;
};

// j3. a want that is covered is spent, and the stack goes down by exactly that
//     much. junkHeld is the same number read back off the sheet.
await stock("Junk: Steel", 10);
const spentSteel = await api.consumeJunk(scavenger, [{ type: "steel", count: 3 }]);
step(
  "consumeJunk spends a covered material out of the stack",
  spentSteel.paid === true &&
    spentSteel.missing.length === 0 &&
    spentSteel.consumed.length === 1 &&
    spentSteel.consumed[0].type === "steel" &&
    spentSteel.consumed[0].count === 3 &&
    api.junkHeld(scavenger, "steel") === 7,
  JSON.stringify({ result: spentSteel, held: api.junkHeld(scavenger, "steel") }),
);

// j4. a line is all-or-nothing (the ruling in src/actions/junk.ts): asking for
//     more than is held spends *nothing* of it and reports what is there. The
//     seven steel must still be seven afterwards.
const short = await api.consumeJunk(scavenger, [{ type: "steel", count: 20 }]);
step(
  "a material that is short is reported in full and none of it is spent",
  short.paid === false &&
    short.consumed.length === 0 &&
    short.missing.length === 1 &&
    short.missing[0].type === "steel" &&
    short.missing[0].wanted === 20 &&
    short.missing[0].held === 7 &&
    api.junkHeld(scavenger, "steel") === 7,
  JSON.stringify({ result: short, held: api.junkHeld(scavenger, "steel") }),
);

// j5. lines are independent — the affordable one is paid while the missing one
//     is reported, which is what stops one absent screw making a whole recipe
//     free. Also the pg 11 robot-limb cost, as it happens: 3 steel + 1
//     circuitry, with no circuitry on the sheet.
const mixed = await api.consumeJunk(scavenger, [
  { type: "steel", count: 3 },
  { type: "circuitry", count: 1 },
]);
step(
  "consumeJunk pays the lines it can and reports only the ones it cannot",
  mixed.paid === false &&
    mixed.consumed.length === 1 &&
    mixed.consumed[0].type === "steel" &&
    mixed.missing.length === 1 &&
    mixed.missing[0].type === "circuitry" &&
    mixed.missing[0].held === 0 &&
    api.junkHeld(scavenger, "steel") === 4,
  JSON.stringify({ result: mixed, steel: api.junkHeld(scavenger, "steel") }),
);

// j6. duplicate lines for one material are summed before anything is spent, so
//     the same stack cannot be sold twice. 4 steel held, 2 + 3 wanted -> short.
const doubled = await api.consumeJunk(scavenger, [
  { type: "steel", count: 2 },
  { type: "steel", count: 3 },
]);
step(
  "two wants of the same material are summed, not served from the same stack",
  doubled.paid === false &&
    doubled.missing.length === 1 &&
    doubled.missing[0].wanted === 5 &&
    api.junkHeld(scavenger, "steel") === 4,
  JSON.stringify({ result: doubled, held: api.junkHeld(scavenger, "steel") }),
);

// j7. an emptied stack is deleted rather than left at zero — junk is a pile,
//     and a sheet of empty piles is housekeeping the player did not ask for.
const emptied = await api.consumeJunk(scavenger, [{ type: "steel", count: 4 }]);
step(
  "a stack spent to nothing is removed from the sheet",
  emptied.paid === true &&
    api.junkHeld(scavenger, "steel") === 0 &&
    api.junkStacks(scavenger, "steel").length === 0,
  JSON.stringify({ result: emptied, stacks: api.junkStacks(scavenger, "steel").length }),
);

// j8. the book's own singular/plural drift resolves: the Encyclopedia writes
//     "x9 screws" and the Syringer's "x1 screw" for the same material, and
//     "x2 spring" against Light rank 3's "x4 springs".
await stock("Junk: Screws", 5);
const inflected = await api.consumeJunk(scavenger, [{ type: "screw", count: 2 }]);
step(
  "junkTypeKey folds the book's singular/plural spellings onto one material",
  inflected.paid === true &&
    api.junkHeld(scavenger, "screws") === 3 &&
    api.junkTypeKey("Screw.") === "screws" &&
    api.junkTypeKey("springs") === "spring" &&
    api.junkTypeKey("Junk: Fiber Optics") === "fiber optics" &&
    // Not an inflection, so deliberately not folded into "circuitry".
    api.junkTypeKey("circuit") === "circuit",
  JSON.stringify({
    screws: api.junkHeld(scavenger, "screws"),
    circuit: api.junkTypeKey("circuit"),
  }),
);

// j9. matching is on the junkType field, with one documented forgiveness: a
//     `gear` document with a blank junkType falls back to its own name, so a
//     hand-typed stack still works. Either way a thing called "Scrap" is scrap
//     and is not steel — no material is ever paid out of a document that merely
//     sounds like it.
const [decoy] = await scavenger.createEmbeddedDocuments("Item", [
  { name: "Scrap", type: "gear", system: { quantity: 9 } },
]);
step(
  "blank-junkType gear falls back to its name and never stands in for another material",
  decoy.system.junkType === "" &&
    api.junkHeld(scavenger, "scrap") === 9 &&
    api.junkHeld(scavenger, "steel") === 0,
  JSON.stringify({ steel: api.junkHeld(scavenger, "steel"), junkType: decoy.system.junkType }),
);

// j10. first aid: the wired report-site (pg 21, 23). One cloth on the sheet, and
//      ending Bleeding takes it — before the roll, so the outcome of the check
//      does not decide whether it was spent.
const junkPatient = await ActorClass.create({
  name: `SMOKE-Bleeder-${stamp}`,
  type: "character",
});
await junkPatient.update({ "system.conditions.bleeding": 3 });
await stock("Junk: Cloth", 1);
const withCloth = await api.endBleeding(scavenger, scavenger.system, junkPatient);
step(
  "ending Bleeding spends a cloth junk item from the medic's sheet",
  withCloth !== null &&
    withCloth.dc === 15 &&
    withCloth.junk.paid === true &&
    withCloth.junk.consumed.length === 1 &&
    withCloth.junk.consumed[0].type === "cloth" &&
    withCloth.junk.consumed[0].count === 1 &&
    withCloth.junk.missing.length === 0 &&
    api.junkHeld(scavenger, "cloth") === 0,
  JSON.stringify({ report: withCloth, cloth: api.junkHeld(scavenger, "cloth") }),
);

// j11. and with no cloth left, the rule still runs: the check is rolled, the
//      shortfall is reported, and the bleeding still ends on a success. The
//      whole point of the seam is that it reports rather than blocks.
await junkPatient.update({ "system.conditions.bleeding": 3 });
const withoutCloth = await api.endBleeding(scavenger, scavenger.system, junkPatient);
step(
  "ending Bleeding without a cloth still rolls, and reports the missing cloth",
  withoutCloth !== null &&
    withoutCloth.dc === 15 &&
    withoutCloth.junk.paid === false &&
    withoutCloth.junk.missing.length === 1 &&
    withoutCloth.junk.missing[0].type === "cloth" &&
    withoutCloth.junk.missing[0].wanted === 1 &&
    withoutCloth.junk.missing[0].held === 0 &&
    (withoutCloth.succeeded
      ? junkPatient.system.conditions.bleeding === 0
      : junkPatient.system.conditions.bleeding === 3),
  JSON.stringify({
    report: withoutCloth,
    bleeding: junkPatient.system.conditions.bleeding,
  }),
);

// j12. a refused attempt spends nothing: "not bleeding" returns before the cost
//      is taken, so a misclick on a healthy target cannot eat the cloth.
await junkPatient.update({ "system.conditions.bleeding": 0 });
await stock("Junk: Cloth", 2);
const refused = await api.endBleeding(scavenger, scavenger.system, junkPatient);
step(
  "first aid on a creature that is not bleeding spends no cloth",
  refused === null && api.junkHeld(scavenger, "cloth") === 2,
  JSON.stringify({ report: refused, cloth: api.junkHeld(scavenger, "cloth") }),
);

await junkPatient.delete();
await scavenger.delete();
}


// Faulty programming (pg 90) — the Robot Overclock Program's version of an
// addiction, and until this batch the only entry in the addiction list with no
// printed way out: `addictionRecoveryWeeks` is abstinence, and a robot does not
// abstain. The rule spends the circuitry whether the check passes or fails,
// which is the half worth testing.
{
  const faultyStamp = Date.now();
  const bot = await ActorClass.create({
    name: `SMOKE-Faulty-${faultyStamp}`,
    type: "character",
    system: {
      details: { race: "robot", robotType: "protectron" },
      chems: { addictions: "Servo Override" },
      skills: { crafting: { points: 30 } },
    },
  });
  try {
    // Own pack handle: the D2 block's `junkPack` is scoped to its own braces.
    const equipment = game.packs.get("fallout-ttrpg.equipment");
    const circuitryEntry = (await equipment.getIndex()).find(
      (e) => e.name === "Junk: Circuitry",
    );
    const circuitry = circuitryEntry ? await equipment.getDocument(circuitryEntry._id) : null;
    if (!circuitry) {
      step("Junk: Circuitry exists for the faulty-programming cure", false, "missing from pack");
      throw new Error("SMOKE: Junk: Circuitry missing");
    }
    await bot.createEmbeddedDocuments("Item", [
      { ...circuitry.toObject(), system: { ...circuitry.toObject().system, quantity: 12 } },
    ]);
    await settle();

    // f1. Refuses a program the machine is not faulty on, rather than spending
    //     five circuitry to cure nothing.
    const notFaulty = await api.clearFaultyProgramming(bot, bot.system, "Coolant Rerouter");
    step(
      "clearing a program the robot is not faulty on is refused, and costs nothing",
      notFaulty === null && api.junkHeld(bot, "circuitry") === 12,
      JSON.stringify({ notFaulty, held: api.junkHeld(bot, "circuitry") }),
    );

    // `JunkResult.consumed` is an array of {type, count, from}, not a map keyed
    // by material — the first run of these steps asserted the map shape and
    // failed against a system that had done everything right.
    const spentOf = (result, type) =>
      (result?.junk?.consumed ?? []).find((c) => c.type === type)?.count ?? 0;

    // f2. A high Crafting bonus against DC 20: succeeds, clears the entry, and
    //     spends the circuitry.
    const held = api.junkHeld(bot, "circuitry");
    const fixed = await api.clearFaultyProgramming(bot, bot.system, "Servo Override");
    await settle();
    step(
      "5 circuitry and a DC 20 Crafting check clear faulty programming (pg 90)",
      fixed !== null && fixed.dc === 20 &&
        spentOf(fixed, "circuitry") === 5 &&
        api.junkHeld(bot, "circuitry") === held - 5 &&
        (fixed.succeeded
          ? api.isAddictedTo(bot.system.chems.addictions, "Servo Override") === false
          : api.isAddictedTo(bot.system.chems.addictions, "Servo Override") === true),
      JSON.stringify({
        dc: fixed?.dc, rolled: fixed?.rolled, ok: fixed?.succeeded,
        spent: fixed?.junk?.consumed, left: api.junkHeld(bot, "circuitry"),
        addictions: bot.system.chems.addictions,
      }),
    );

    // f3. The failure clause, asserted on the rule rather than on the dice: the
    //     circuitry leaves the sheet either way. Re-add the fault and drop the
    //     Crafting bonus so the check cannot pass, then check the spend.
    await bot.update({
      "system.chems.addictions": "Servo Override",
      "system.skills.crafting.points": 0,
      "system.abilities.intelligence.value": 1,
    });
    await settle();
    const beforeFail = api.junkHeld(bot, "circuitry");
    const failed = await api.clearFaultyProgramming(bot, bot.system, "Servo Override");
    await settle();
    step(
      "a failed repair still spends the circuitry, and the programming stays faulty",
      failed !== null && spentOf(failed, "circuitry") === 5 &&
        api.junkHeld(bot, "circuitry") === beforeFail - 5 &&
        (failed.succeeded === false
          ? api.isAddictedTo(bot.system.chems.addictions, "Servo Override") === true
          : true),
      JSON.stringify({ ok: failed?.succeeded, spent: failed?.junk?.consumed,
                       left: api.junkHeld(bot, "circuitry"),
                       addictions: bot.system.chems.addictions }),
    );

    // f4. removeAddiction is surgical: clearing one entry leaves the others.
    step(
      "removeAddiction takes one entry and leaves the rest, case-insensitively",
      api.removeAddiction("Med-X, Servo Override, Jet", "servo override") === "Med-X, Jet" &&
        api.removeAddiction("Med-X", "Buffout") === "Med-X",
      api.removeAddiction("Med-X, Servo Override, Jet", "servo override"),
    );
  } finally {
    await bot.delete();
  }
}

// A2 — blindsight DetectionMode on a live canvas. Header in the probe file;
// proves registration (a1), cutoffs leaving blindsight alone (a2), the
// TypedObjectField round-trip vs the array trap (a3), and testVisibility (a4).
{
    // ------------------------------------------------------------------------
    // A2. Blindsight as a canvas detection mode (pg 119).
    // Uses exported api: setSenses, setSceneLight, applyVisionCutoffs.
    // Needs a canvas, like B4-4b/B4-8b; see §2 of the file header. Its scene
    // additionally sets `tokenVision: true`, because core only builds a vision
    // source for a token on a token-vision scene.
    // ------------------------------------------------------------------------
    {
      const Actors = game.actors.documentClass;
      const Scenes = CONFIG.Scene.documentClass;
      const MODE_ID = "falloutBlindsight";
      const BLINDSIGHT_FEET = 30;

      // A character's prototype token ships `sight.enabled: false` — a prop,
      // not a creature, and `applyVisionCutoffs` skips it. Every token here
      // switches sight on explicitly.
      await Actors.createDocuments([
        { name: `SMOKE-Blind-Seer-${stamp}`, type: "character", prototypeToken: { actorLink: true, sight: { enabled: true, range: 60 } } },
        { name: `SMOKE-Blind-Mark-${stamp}`, type: "character", prototypeToken: { actorLink: true, sight: { enabled: true, range: 60 } } },
        { name: `SMOKE-Blind-Far-${stamp}`, type: "character", prototypeToken: { actorLink: true, sight: { enabled: true, range: 60 } } },
        { name: `SMOKE-Blind-Control-${stamp}`, type: "character", prototypeToken: { actorLink: true, sight: { enabled: true, range: 60 } } },
      ]);
      // Looked up by name, never by createDocuments return order (B4-8b).
      const seerActor = game.actors.getName(`SMOKE-Blind-Seer-${stamp}`);
      const markActor = game.actors.getName(`SMOKE-Blind-Mark-${stamp}`);
      const farActor = game.actors.getName(`SMOKE-Blind-Far-${stamp}`);
      const controlActor = game.actors.getName(`SMOKE-Blind-Control-${stamp}`);

      const viewedBefore = globalThis.canvas?.scene ?? null;
      // 100 px = 5 ft, so 20 px to the foot: the seer's 30 ft of blindsight is
      // a 600 px radius, and every distance below is chosen against that.
      const scene = await Scenes.create({
        name: `SMOKE-Blind-Scene-${stamp}`,
        width: 2000,
        height: 2000,
        grid: { type: 1, size: 100, distance: 5, units: "ft" },
        tokenVision: true,
      });

      try {
        await scene.view();
        const drawn = await until(() => globalThis.canvas?.scene?.id === scene.id, 20000);

        //   seer (400,400) ── mark (500,400)          5 ft apart, adjacent
        //     │                                       far (1200,400)  40 ft
        //   control (400,700)                         ~16 ft from mark
        const placements = [
          [seerActor, 400, 400],
          [markActor, 500, 400],
          [farActor, 1200, 400],
          [controlActor, 400, 700],
        ];
        const placed = {};
        for (const [actor, x, y] of placements) {
          const data = await actor.getTokenDocument({ x, y });
          const [token] = await scene.createEmbeddedDocuments("Token", [data.toObject()]);
          placed[actor.id] = token;
        }
        const seerToken = placed[seerActor.id];
        const markToken = placed[markActor.id];
        const farToken = placed[farActor.id];
        const controlToken = placed[controlActor.id];
        // Canvas-grade wait, so the timeout is explicit at the site (CL3).
        const onCanvas = await until(
          () => Object.values(placed).every((token) => !!canvas.tokens?.get(token.id)),
          15000,
        );

        // a1. The registration itself: present, a real DetectionMode, and every
        //     field `blindsightModeConfig()` asked for round-tripped. `type: 3`
        //     is checked against core's own enum rather than the literal, which
        //     is the half of the guess that could not be checked offline.
        const DetectionMode = foundry.canvas.perception.DetectionMode;
        const mode = CONFIG.Canvas.detectionModes[MODE_ID];
        step(
          "the blindsight detection mode is registered at init, as OTHER and wall-bounded (pg 119)",
          !!mode &&
            mode instanceof DetectionMode &&
            mode.id === MODE_ID &&
            mode.type === DetectionMode.DETECTION_TYPES.OTHER &&
            mode.walls === true &&
            mode.angle === false &&
            mode.tokenConfig === true &&
            mode.label === "FALLOUT.Light.blindsight",
          JSON.stringify({
            registered: !!mode,
            ctor: mode?.constructor?.name ?? null,
            data: mode ? mode.toObject() : null,
            OTHER: DetectionMode.DETECTION_TYPES.OTHER,
          }),
        );

        // Blindsight on the seer, pitch dark, cutoffs pushed onto every token.
        // "darkness" is the darkest of LIGHT_LEVELS — globalLight off,
        // darknessLevel 1.
        await api.setSenses(seerActor, { blindsight: BLINDSIGHT_FEET, nightvision: 0 });
        await api.setSceneLight("darkness", scene);
        const cutoffs = await api.applyVisionCutoffs(scene);
        await settle();

        // a2. What the cutoffs did and, just as load-bearing, what they did not:
        //     `src/actions/light.ts` states in prose that blindsight is not
        //     written here. Asserted, so the day it starts being written this
        //     step says so instead of a2 quietly passing on a different path.
        const seerSource = seerToken._source;
        step(
          "in darkness the cutoffs blind unaided sight (basicSight 0) and write no blindsight mode",
          cutoffs.level === "darkness" &&
            cutoffs.capped.length === 4 &&
            seerSource.sight.range === 0 &&
            seerSource.detectionModes.basicSight?.range === 0 &&
            seerSource.detectionModes.lightPerception?.range === null &&
            seerSource.detectionModes[MODE_ID] === undefined,
          JSON.stringify({
            level: cutoffs.level,
            capped: cutoffs.capped.length,
            sight: seerSource.sight.range,
            modes: seerSource.detectionModes,
          }),
        );

        // a3. So the token is given the mode here, in the v14 `TypedObjectField`
        //     shape — which is itself the assertion, because the pre-v14 array
        //     shape every example on the internet uses is silently cleaned away
        //     to nothing (a3b, below).
        await seerToken.update({
          detectionModes: { [MODE_ID]: { enabled: true, range: BLINDSIGHT_FEET } },
        });
        await settle();
        const written = seerToken._source.detectionModes[MODE_ID];
        step(
          "a token round-trips the blindsight mode written as a TypedObjectField entry",
          !!written &&
            written.enabled === true &&
            written.range === BLINDSIGHT_FEET &&
            seerToken._source.detectionModes.basicSight?.range === 0,
          JSON.stringify(seerToken._source.detectionModes),
        );

        // a3b. Two controls on that claim, on a token whose vision does not
        //      matter until a4 gives it its own. First the array shape, which is
        //      cleaned to nothing — the documented v14 trap. Second an
        //      unregistered id, which persists exactly as happily as a
        //      registered one: `detectionModes` is a `TypedObjectField` with no
        //      `validateKey`, so persistence alone proves nothing about
        //      CONFIG. a1 and a4 are what prove the registration.
        await farToken.update({
          detectionModes: [{ id: MODE_ID, enabled: true, range: BLINDSIGHT_FEET }],
        });
        await settle();
        // Copied, not referenced: `_source.detectionModes` is live and the next
        // update would rewrite the snapshot this step reports.
        const arrayShape = JSON.parse(JSON.stringify(farToken._source.detectionModes));
        await farToken.update({ detectionModes: { falloutNotAMode: { enabled: true, range: 5 } } });
        await settle();
        const bogus = farToken._source.detectionModes.falloutNotAMode;
        step(
          "the pre-v14 array shape is silently dropped, while an unregistered id persists (so persistence is not proof)",
          arrayShape[MODE_ID] === undefined && !!bogus && bogus.range === 5,
          JSON.stringify({ afterArray: arrayShape, bogus }),
        );
        await farToken.update({ detectionModes: { "-=falloutNotAMode": null } });

        // ---- the visibility half ------------------------------------------
        // A GM gets a vision source only for a *controlled* token
        // (`Token#_isVisionSource`), so each seer is controlled in turn and the
        // detection is aimed at one source rather than read off the aggregate.
        const visionSourceFor = (token) =>
          canvas.effects.visionSources.find((s) => s.object?.document?.id === token.id) ?? null;
        const activate = async (token) => {
          canvas.tokens.get(token.id)?.control({ releaseOthers: true });
          canvas.perception.update({ initializeVision: true, refreshVision: true });
          await settle();
          return until(() => !!visionSourceFor(token)?.active, 8000);
        };
        // The exact call core makes in the special-detection-mode loop of
        // `CanvasVisibility#testVisibility`, isolated to one source.
        const detects = (source, target, modeId = MODE_ID) => {
          const dm = CONFIG.Canvas.detectionModes[modeId];
          const modeData = source.detectionModes[modeId];
          const vs = visionSourceFor(source);
          if (!dm || !modeData || !vs) return null;
          const object = canvas.tokens.get(target.id);
          const config = canvas.visibility._createVisibilityTestConfig(
            target.getVisibilityTestPoints(),
            { tolerance: 0, object },
          );
          return dm.testVisibility(vs, modeData, config);
        };
        // And the aggregate the renderer actually consults. Meaningless unless
        // some vision source is active — with none it short-circuits to
        // `game.user.isGM`, which for this user is `true` and would pass every
        // assertion below for the wrong reason.
        const anyoneSees = (target) => {
          const object = canvas.tokens.get(target.id);
          return canvas.visibility.testVisibility(target.getVisibilityTestPoints(), {
            tolerance: 0,
            object,
          });
        };

        const seerActive = await activate(seerToken);
        const sourcesActive = canvas.effects.visionSources.some((s) => s.active);
        const seerSees = detects(seerToken, markToken);
        const aggregateSeesMark = anyoneSees(markToken);
        const seerVision = visionSourceFor(seerToken);

        // a4. Adjacent, in the dark, with sight capped to nothing and no light
        //     for lightPerception to find: the only thing that can return true
        //     is the registered blindsight mode.
        step(
          "a blindsighted token detects an adjacent token in pitch darkness (pg 119)",
          onCanvas === true &&
            drawn === true &&
            seerActive === true &&
            sourcesActive === true &&
            seerSees === true &&
            aggregateSeesMark === true,
          JSON.stringify({
            drawn,
            onCanvas,
            seerActive,
            sourcesActive,
            isolatedModeTest: seerSees,
            aggregateTestVisibility: aggregateSeesMark,
            blindedByDarknessSource: seerVision?.blinded?.darkness ?? null,
            sourceIsBlinded: seerVision?.isBlinded ?? null,
            // Reported, never asserted: culling is not meaningful headless.
            markIsVisible: canvas.tokens.get(markToken.id)?.isVisible ?? null,
          }),
        );

        // a4b. And it stops at 30 ft. Without this, a4 proves only that
        //      something returned true.
        const seerSeesFar = detects(seerToken, farToken);
        const aggregateSeesFar = anyoneSees(farToken);
        step(
          "blindsight stops at its radius — a token 40 ft away is not detected (pg 119)",
          seerSeesFar === false && aggregateSeesFar === false,
          JSON.stringify({ isolated: seerSeesFar, aggregate: aggregateSeesFar }),
        );

        // a4c. The control: same darkness, same distance band, vision enabled,
        //      no blindsight mode on the token and none granted by the cutoffs.
        //      It must see nothing at all.
        const controlActive = await activate(controlToken);
        const controlHasMode = controlToken.detectionModes?.[MODE_ID] ?? null;
        const controlSeesMark = anyoneSees(markToken);
        const controlSourcesActive = canvas.effects.visionSources.some((s) => s.active);
        step(
          "a token without blindsight detects nothing in the same darkness (the control)",
          controlActive === true &&
            controlSourcesActive === true &&
            controlHasMode === null &&
            controlSeesMark === false,
          JSON.stringify({
            controlActive,
            controlSourcesActive,
            controlHasBlindsightMode: controlHasMode,
            aggregateTestVisibility: controlSeesMark,
          }),
        );

        // a5. Blindsight inside a *darkness source* (a negative AmbientLight),
        //     which is the case the whole registration exists for: a creature
        //     that senses without sight should not be switched off by magical
        //     dark. This step failed on v0.28.0 and found a two-layer bug —
        //     core refuses in `_canDetect` (`walls && blinded.darkness`) AND
        //     collapses the vision polygon itself to `externalRadius` in
        //     `_getPolygonConfiguration`, so overriding `_canDetect` alone left
        //     the LOS test failing against a footprint-sized polygon. The
        //     registration in `src/fallout.ts` now overrides both, restoring
        //     only the radius darkness took away. Walls still block and
        //     `_testRange` still holds the printed radius; scene-darkness never
        //     triggered this at all (a1-a4 pass without it).
        await scene.createEmbeddedDocuments("AmbientLight", [
          {
            x: 450,
            y: 450,
            config: { negative: true, bright: 20, dim: 20, priority: 0 },
          },
        ]);
        await activate(seerToken);
        canvas.perception.update({ initializeVision: true, refreshLighting: true });
        await settle(600);
        const vsInDark = visionSourceFor(seerToken);
        const seesInsideDarknessSource = detects(seerToken, markToken);
        step(
          "blindsight survives a darkness source, where sight is switched off (pg 118-119)",
          seesInsideDarknessSource === true,
          JSON.stringify({
            isolated: seesInsideDarknessSource,
            blindedByDarknessSource: vsInDark?.blinded?.darkness ?? null,
            darknessSources: canvas.effects.darknessSources?.size ?? null,
          }),
        );
      } finally {
        if (globalThis.canvas?.tokens) {
          canvas.tokens.releaseAll();
          canvas.tokens.setTargets([], { mode: "replace" });
        }
        if (viewedBefore) await viewedBefore.view();
        await scene.delete();
        await seerActor.delete();
        await markActor.delete();
        await farActor.delete();
        await controlActor.delete();
      }
    }
}

// ------------------------------- BACKLOG C1: the four declared robot traits
//                                  BACKLOG C2: severed-limb reattachment
//
// release-8 blocks. It depends on nothing before it: it creates its own actors
// and deletes them again, so it can be moved or removed whole.
//
// In scope: step(), until(), settle(), api, game, CONFIG, canvas.
// Every document created here is SMOKE- prefixed and deleted at the end.
//
// Requires on api (globalThis.falloutTTRPG) — the four already exported are
// marked, the rest are new exports this batch needs:
//   actions — reportClimb (already), reportSprint (already),
//             applyDamage (already), rollAttack (already), reattachLimb (NEW)
//   pure    — targetedConditionCount (NEW, src/rules/targeted.ts),
//             robotReattachCost (NEW, src/rules/robots.ts),
//             robotTraitsFor (NEW, src/rules/robots.ts)
//
// The four traits get one step each (c1a-c1e, NeuroTransmitters being two
// clauses and so two steps), then the reattachment control gets three.
{
  const RobotActorClass = CONFIG.Actor.documentClass;
  const rStamp = Date.now();
  const robots = [];
  const makeRobot = async (label, robotType, race = "robot") => {
    const made = await RobotActorClass.create({
      name: `SMOKE-${label}-${rStamp}`,
      type: "character",
      system: { details: { race, robotType } },
    });
    robots.push(made);
    return made;
  };

  try {
    const protectron = await makeRobot("Protectron", "protectron");
    const robobrain = await makeRobot("Robobrain", "robobrain");
    const human = await makeRobot("Mechanic", "", "human");

    // c1a. Reinforced Plating (pg 10): "Your DT increases by 1 even if you
    //      aren't wearing armor." Unarmored is the whole point of the clause, so
    //      that is what this asserts — and that the +1 is the sub-type's and not
    //      the race's, by leaving a stale `robotType` on a human.
    const platedDt = protectron.system.derived.dt;
    const platedMelee = protectron.system.derived.dtMelee;
    const brainDt = robobrain.system.derived.dt;
    await human.update({ "system.details.robotType": "protectron" });
    const staleDt = human.system.derived.dt;
    await human.update({ "system.details.robotType": "" });
    step(
      "Reinforced Plating gives an unarmored Protectron DT 1, and only a Protectron (pg 10)",
      platedDt === 1 && platedMelee === 1 && brainDt === 0 && staleDt === 0,
      JSON.stringify({ platedDt, platedMelee, brainDt, staleDt }),
    );

    // c1b. Slow (pg 10): "Protectrons can only spend a maximum of 6 AP on
    //      movement during their turns." Reported on the movement cards, since
    //      no AP is deducted anywhere (BACKLOG E1). A 20 ft scalable climb is
    //      12 AP, which is over the cap on its own — the case worth flagging.
    const beforeSlow = game.messages.size;
    await api.reportClimb(protectron, protectron.system, {
      surface: "scalable",
      feet: 20,
      gear: false,
    });
    const slowCard = String(game.messages.contents.at(-1)?.content ?? "");
    await api.reportClimb(human, human.system, { surface: "scalable", feet: 20, gear: false });
    const humanCard = String(game.messages.contents.at(-1)?.content ?? "");
    step(
      "the movement cards report a Protectron's 6 AP movement cap, and say when one move blows it (pg 10)",
      game.messages.size > beforeSlow &&
        slowCard.includes("Slow") &&
        slowCard.includes("12 AP") &&
        !humanCard.includes("Slow"),
      JSON.stringify({ slow: slowCard.slice(0, 200), control: humanCard.slice(0, 80) }),
    );

    // c1c. All Terrain Rollers (pg 11): "You do not have to spend extra AP to
    //      move through difficult terrain." The only extra AP the book charges
    //      is pg 116's per-5-feet surcharge — a sprint is *ended* by difficult
    //      terrain rather than surcharged (pg 117), so the card names the trait
    //      and then says it does not save the run.
    const beforeRollers = game.messages.size;
    await api.reportSprint(robobrain, { difficultTerrain: true });
    const rollerCard = String(game.messages.contents.at(-1)?.content ?? "");
    await api.reportSprint(human, { difficultTerrain: true });
    const rollerControl = String(game.messages.contents.at(-1)?.content ?? "");
    step(
      "All Terrain Rollers is reported where difficult terrain is, and does not rescue a sprint (pg 11, pg 117)",
      game.messages.size > beforeRollers &&
        rollerCard.includes("All Terrain Rollers") &&
        rollerCard.includes("pg 117") &&
        !rollerControl.includes("All Terrain Rollers"),
      JSON.stringify({ rollers: rollerCard.slice(0, 240), control: rollerControl.slice(0, 80) }),
    );

    // c1d. NeuroTransmitters, first clause (pg 11): "You are vulnerable to
    //      electricity damage." Derived, not written into the sheet's own
    //      vulnerability field — so a GM's typed entry survives untouched and
    //      nothing persists to the source data when the sub-type changes.
    await robobrain.update({
      "system.defenses.vulnerabilities": "fire",
      "system.resources.hp.value": 10,
      "system.resources.sp.value": 10,
    });
    const derivedVulns = robobrain.system.derived.vulnerabilities;
    const typedStill = robobrain.system.defenses.vulnerabilities;
    const zapped = await api.applyDamage(robobrain, 3, "electricity");
    const burned = await api.applyDamage(robobrain, 3, "fire");
    const plain = await api.applyDamage(robobrain, 3, "ballistic");
    step(
      "NeuroTransmitters doubles electricity without clobbering the typed vulnerabilities (pg 11)",
      derivedVulns.includes("electricity") &&
        derivedVulns.includes("fire") &&
        typedStill === "fire" &&
        zapped.adjusted === 6 &&
        burned.adjusted === 6 &&
        plain.adjusted === 3,
      JSON.stringify({ derivedVulns, typedStill, zap: zapped.adjusted, fire: burned.adjusted, plain: plain.adjusted }),
    );

    // c1e. NeuroTransmitters, second clause (pg 11): "when you take damage from
    //      a targeted attack to the head; you gain two conditions instead of
    //      one." The count is a pure function of the limb and the defender's
    //      chassis; the attack path then rolls that many d4s.
    //
    //      A crit is deliberately NOT doubled — the trait replaces the single
    //      condition, and a critical hit has no "one" to replace (the ruling is
    //      at `targetedConditionCount` in src/rules/targeted.ts).
    const countHead = api.targetedConditionCount("head", "robobrain");
    const countArm = api.targetedConditionCount("arm", "robobrain");
    const countPlain = api.targetedConditionCount("head", "");
    const countProtectron = api.targetedConditionCount("head", "protectron");

    // The integration half needs a *targeted token*, because that is the only
    // thing `rollAttack` knows about the other end of the exchange. It is
    // attempted rather than required: with no viewed canvas the pure counts
    // above are still asserted, and the detail says the card half was skipped.
    let brainToken = null;
    let targeted = false;
    let d4Cards = null;
    const [gun] = await human.createEmbeddedDocuments("Item", [
      {
        name: `SMOKE-NeuroRifle-${rStamp}`,
        type: "weapon",
        system: { weaponType: "rifle", damage: "1d8", apCost: 4, magazineSize: 5, loadedAmmo: 5 },
      },
    ]);
    try {
      const scene = canvas?.scene ?? null;
      if (scene && canvas?.ready) {
        const tokenData = await robobrain.getTokenDocument({ x: 1000, y: 1000 });
        [brainToken] = await scene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
        await until(() => !!brainToken.object);
        brainToken.object?.setTarget(true, { releaseOthers: true });
        targeted = game.user.targets.size === 1;
      }
      if (targeted) {
        // Same retry shape as the fusion-core block (BACKLOG B2): a natural 1
        // posts no follow-up and a crit posts the severe-injury card instead,
        // so a single attack fails this on dice luck rather than on the rule.
        for (let attempt = 0; attempt < 10 && d4Cards === null; attempt += 1) {
          await gun.update({ "system.loadedAmmo": gun.system.magazineSize });
          const beforeHead = game.messages.size;
          await api.rollAttack(human, human.system, gun, gun.system, "normal", { limb: "head" });
          const rolled = game.messages.contents
            .slice(beforeHead)
            .filter((m) => String(m.rolls?.[0]?.formula ?? "").includes("1d4")).length;
          if (rolled > 0) d4Cards = rolled;
        }
      }
    } finally {
      if (brainToken) {
        brainToken.object?.setTarget(false, { releaseOthers: true });
        await brainToken.delete();
      }
      await gun.delete();
    }
    step(
      "a targeted attack to a Robobrain's head inflicts two conditions, and only there (pg 11)",
      countHead === 2 &&
        countArm === 1 &&
        countPlain === 1 &&
        countProtectron === 1 &&
        (targeted ? d4Cards === 2 : true),
      JSON.stringify({
        countHead,
        countArm,
        countPlain,
        countProtectron,
        d4Cards,
        cardHalf: targeted ? "ran" : "skipped — no viewed canvas to target a token on",
      }),
    );

    // c2a. The printed cost (pg 11): "a number of minutes equal to 10 - their or
    //      your crafting skill bonus. If the amount of time is reduced to 0, it
    //      takes 6 AP to reattach the limb instead." A bonus above 10 drives the
    //      subtraction negative, which the book never contemplates — ruled as
    //      the AP case, since a negative number of minutes is not a duration.
    const cost0 = api.robotReattachCost(0);
    const cost3 = api.robotReattachCost(3);
    const cost10 = api.robotReattachCost(10);
    const cost14 = api.robotReattachCost(14);
    step(
      "reattachment is 10 minutes less the Crafting bonus, and 6 AP once that reaches zero (pg 11)",
      cost0.minutes === 10 &&
        cost0.ap === 0 &&
        cost3.minutes === 7 &&
        cost10.minutes === 0 &&
        cost10.ap === 6 &&
        cost14.minutes === 0 &&
        cost14.ap === 6,
      JSON.stringify({ cost0, cost3, cost10, cost14 }),
    );

    // c2b. The control reports the mechanic's own bonus, the junk, and the
    //      time — and consumes none of it, because no junk documents exist
    //      (BACKLOG D2) and no AP is ever deducted (BACKLOG E1).
    await human.update({ "system.skills.crafting.points": 0 });
    const bonus = human.system.derived.skillBonuses.crafting;
    const beforeReattach = game.messages.size;
    const slow = await api.reattachLimb(human, human.system, protectron);
    const reattachCard = String(game.messages.contents.at(-1)?.content ?? "");
    await human.update({ "system.skills.crafting.points": 14 });
    const fast = await api.reattachLimb(human, human.system, robobrain);
    await human.update({ "system.skills.crafting.points": 0 });
    step(
      "the reattachment control prices the job off the mechanic's Crafting and reports 3 steel + 1 circuitry (pg 11)",
      game.messages.size > beforeReattach &&
        slow?.minutes === api.robotReattachCost(bonus).minutes &&
        slow?.steel === 3 &&
        slow?.circuitry === 1 &&
        fast?.minutes === 0 &&
        fast?.ap === 6 &&
        reattachCard.includes("steel"),
      JSON.stringify({ bonus, slow, fast, card: reattachCard.slice(0, 200) }),
    );

    // c2c. It is a robot clause: the sentence is printed in the Robot entry
    //      (pg 11) and a human arm is not put back on with circuitry.
    const beforeRefusal = game.messages.size;
    const refused = await api.reattachLimb(human, human.system, human);
    step(
      "reattachment refuses a body the clause was not printed for (pg 11)",
      refused === null && game.messages.size === beforeRefusal,
      JSON.stringify({ refused, posted: game.messages.size - beforeRefusal }),
    );
  } finally {
    for (const made of robots) await made.delete();
  }
}

// C4 — Super Mutant variant traits (v2.1 pg 12) — see the header inside.
{
// C4 — Super Mutant variant traits (v2.1 pg 12): Defective Strain, Nightkin,
// and the Nightkin Stealth Field.
//
// `until`, `settle`, `ActorClass` and `stamp` all come from the surrounding
// scope. Step ids 8ma-8mo are claimed here; renumber if another block landed
// first.
//
// Every document this block touches is one it created itself, SMOKE- prefixed
// and deleted at the end. It deliberately does NOT use the suite's shared
// `actor`: the variant lives on `system.details`, and leaving a half-mutated
// race behind has broken later blocks before.
//
// Requires these on globalThis.falloutTTRPG — none of them is exported today,
// so `src/fallout.ts` needs the additions listed in c4-integration.md §4:
//   from src/rules/races.ts —
//     raceStrengthScore, raceAbilityScore, raceCarryLoadBonus,
//     defectiveStrainIntelligence, mutantVariantOf, hasStealthField,
//     stealthFieldPerceptionCost, SUPER_MUTANT_VARIANTS
//   from src/actions/stealth-field.ts —
//     raiseStealthField, endStealthField, isStealthFieldActive,
//     stealthFieldUsesToday, stealthFieldPerceptionPenalty,
//     resetStealthFieldUses, clearStealthFieldDecay
//
// Requires the schema field `system.details.mutantVariant` (c4-integration.md
// §1) and the prepareDerivedData call-site changes (§1c-§1e). Without them the
// pure steps still pass and every live step fails — which is the correct
// failure, not a flake.

// ------------------------------------------------------- pure: the numbers

// 8ma. Superior Strength is untouched by the refactor: the old two-argument
//      call still means what it meant, and "" is the same as omitting it.
step(
  "raceStrengthScore keeps Superior Strength's max(6, STR+1) with no variant",
  api.raceStrengthScore("superMutant", 3) === 6 &&
    api.raceStrengthScore("superMutant", 3, "") === 6 &&
    api.raceStrengthScore("superMutant", 8) === 9 &&
    api.raceStrengthScore("human", 3) === 3,
  JSON.stringify({
    three: api.raceStrengthScore("superMutant", 3),
    eight: api.raceStrengthScore("superMutant", 8),
    human: api.raceStrengthScore("human", 3),
  }),
);

// 8mb. Defective Strain is +2 with NO floor — the "cannot be lower than 6"
//      clause belongs to Superior Strength, which this trait replaces (pg 12).
//      STR 3 therefore lands on 5, below what a plain Super Mutant would get.
step(
  "Defective Strain adds 2 to Strength and inherits no floor",
  api.raceStrengthScore("superMutant", 3, "defectiveStrain") === 5 &&
    api.raceStrengthScore("superMutant", 4, "defectiveStrain") === 6 &&
    api.raceStrengthScore("superMutant", 8, "defectiveStrain") === 10,
  JSON.stringify({
    three: api.raceStrengthScore("superMutant", 3, "defectiveStrain"),
    four: api.raceStrengthScore("superMutant", 4, "defectiveStrain"),
    eight: api.raceStrengthScore("superMutant", 8, "defectiveStrain"),
  }),
);

// 8mc. …and it REPLACES rather than stacks: a Strength 4 Defective Strain is 6
//      (4 + 2), not 7 (floor then +2) and not 8 (max(6, 4+1) + 2).
step(
  "a variant replaces Superior Strength rather than stacking with it",
  api.raceStrengthScore("superMutant", 4, "defectiveStrain") === 6 &&
    api.raceStrengthScore("superMutant", 4, "nightkin") ===
      api.raceStrengthScore("superMutant", 4, "") &&
    api.raceCarryLoadBonus("superMutant", "defectiveStrain") === 40 &&
    api.raceCarryLoadBonus("superMutant", "nightkin") === 40 &&
    api.raceCarryLoadBonus("superMutant", "") === 40 &&
    api.raceCarryLoadBonus("human", "nightkin") === 0,
  JSON.stringify({
    defectiveStr: api.raceStrengthScore("superMutant", 4, "defectiveStrain"),
    nightkinStr: api.raceStrengthScore("superMutant", 4, "nightkin"),
    baseStr: api.raceStrengthScore("superMutant", 4, ""),
    carry: [
      api.raceCarryLoadBonus("superMutant", "defectiveStrain"),
      api.raceCarryLoadBonus("superMutant", "nightkin"),
      api.raceCarryLoadBonus("superMutant", ""),
      api.raceCarryLoadBonus("human", "nightkin"),
    ],
  }),
);

// 8md. Endurance +2 belongs to Defective Strain alone, and only on a mutant.
step(
  "Defective Strain adds 2 to Endurance; nothing else does",
  api.raceAbilityScore("superMutant", "endurance", 6, "defectiveStrain") === 8 &&
    api.raceAbilityScore("superMutant", "endurance", 6, "nightkin") === 6 &&
    api.raceAbilityScore("superMutant", "endurance", 6, "") === 6 &&
    api.raceAbilityScore("human", "endurance", 6, "defectiveStrain") === 6 &&
    api.raceAbilityScore("superMutant", "agility", 6, "defectiveStrain") === 6,
  JSON.stringify({
    defective: api.raceAbilityScore("superMutant", "endurance", 6, "defectiveStrain"),
    nightkin: api.raceAbilityScore("superMutant", "endurance", 6, "nightkin"),
    human: api.raceAbilityScore("human", "endurance", 6, "defectiveStrain"),
  }),
);

// 8me. Intelligence: reduce by 2, THEN cap at 3 (ruling — see races.ts). A high
//      score lands on the printed cap; a low one takes the −2; and the −2
//      floors at 1, which the book leaves silent for this trait.
step(
  "Defective Strain's Intelligence is min(3, INT − 2), floored at 1",
  api.defectiveStrainIntelligence(8) === 3 &&
    api.defectiveStrainIntelligence(5) === 3 &&
    api.defectiveStrainIntelligence(4) === 2 &&
    api.defectiveStrainIntelligence(3) === 1 &&
    api.defectiveStrainIntelligence(1) === 1 &&
    api.raceAbilityScore("superMutant", "intelligence", 8, "defectiveStrain") === 3 &&
    api.raceAbilityScore("superMutant", "intelligence", 8, "nightkin") === 8,
  JSON.stringify([8, 5, 4, 3, 1].map((n) => api.defectiveStrainIntelligence(n))),
);

// 8mf. A stored variant only means something on a Super Mutant, and anything
//      unrecognised normalises to "" — the same contract robotTypeOf has.
step(
  "the variant is normalised and gated on the race",
  api.mutantVariantOf("nightkin") === "nightkin" &&
    api.mutantVariantOf("Nightkin") === "" &&
    api.mutantVariantOf(undefined) === "" &&
    api.mutantVariantOf("supermutant") === "" &&
    api.hasStealthField("superMutant", "nightkin") === true &&
    api.hasStealthField("ghoul", "nightkin") === false &&
    api.hasStealthField("superMutant", "defectiveStrain") === false &&
    api.SUPER_MUTANT_VARIANTS.length === 2,
  JSON.stringify({ variants: api.SUPER_MUTANT_VARIANTS }),
);

// 8mg. The Perception ladder, before any document exists: the first use of the
//      day is free, every later one costs 1, and the cost stops at a score of 1.
step(
  "the Stealth Field's Perception cost is free once a day, then 1, then nothing at the floor",
  api.stealthFieldPerceptionCost(0, 6) === 0 &&
    api.stealthFieldPerceptionCost(1, 6) === 1 &&
    api.stealthFieldPerceptionCost(4, 6) === 1 &&
    api.stealthFieldPerceptionCost(4, 1) === 0 &&
    api.stealthFieldPerceptionCost(0, 1) === 0,
  JSON.stringify({
    first: api.stealthFieldPerceptionCost(0, 6),
    second: api.stealthFieldPerceptionCost(1, 6),
    atFloor: api.stealthFieldPerceptionCost(4, 1),
  }),
);

// --------------------------------------------- live: Defective Strain sheet

const strain = await ActorClass.create({
  name: `SMOKE-Strain-${stamp}`,
  type: "character",
  system: {
    details: { race: "superMutant", mutantVariant: "defectiveStrain", level: 1 },
    abilities: { strength: { value: 5 }, endurance: { value: 6 }, intelligence: { value: 8 } },
  },
});
await settle();

// 8mh. STR 5 → 7 (+2), END 6 → 8 (+2), INT 8 → 3 (−2, capped). Modifiers are
//      score − 5, carry load is score × 10 plus the flat 40.
step(
  "a Defective Strain sheet derives +2 STR, +2 END and a capped INT",
  strain.system.derived.abilityMods.strength === 2 &&
    strain.system.derived.abilityMods.endurance === 3 &&
    strain.system.derived.abilityMods.intelligence === -2 &&
    strain.system.derived.carryLoadMax === 110,
  JSON.stringify({
    mods: strain.system.derived.abilityMods,
    carry: strain.system.derived.carryLoadMax,
  }),
);

// 8mi. The cap bites however high the stored score is — the sheet still shows
//      what the player bought, every rule reads 3.
await strain.update({ "system.abilities.intelligence.value": 10 });
await settle();
step(
  "raising Intelligence past the cap changes nothing that is derived from it",
  strain.system.abilities.intelligence.value === 10 &&
    strain.system.derived.abilityMods.intelligence === -2,
  JSON.stringify({
    stored: strain.system.abilities.intelligence.value,
    mod: strain.system.derived.abilityMods.intelligence,
  }),
);

// 8mj. No Strength floor, live: STR 3 lands on 5 and 90 carry load, where a
//      plain Super Mutant of the same score would be 6 and 100.
await strain.update({ "system.abilities.strength.value": 3 });
await settle();
const strainLow = {
  mod: strain.system.derived.abilityMods.strength,
  carry: strain.system.derived.carryLoadMax,
};
await strain.update({ "system.details.mutantVariant": "" });
await settle();
step(
  "Defective Strain has no Strength floor, and switching back restores one",
  strainLow.mod === 0 &&
    strainLow.carry === 90 &&
    strain.system.derived.abilityMods.strength === 1 &&
    strain.system.derived.carryLoadMax === 100,
  JSON.stringify({
    defective: strainLow,
    superiorStrength: {
      mod: strain.system.derived.abilityMods.strength,
      carry: strain.system.derived.carryLoadMax,
    },
  }),
);

// -------------------------------------------------- live: the Stealth Field

// Perception 2, so the whole ladder — free use, one decay, then the floor —
// fits without ever pushing the score below the printed minimum of 1.
const nk = await ActorClass.create({
  name: `SMOKE-Nightkin-${stamp}`,
  type: "character",
  system: {
    details: { race: "superMutant", mutantVariant: "nightkin", level: 1 },
    abilities: { strength: { value: 4 }, perception: { value: 2 } },
  },
});
await settle();

// 8mk. Nightkin keeps Superior Strength's numbers exactly (pg 12), and gains
//      the ability a plain Super Mutant does not have.
step(
  "a Nightkin sheet reads as Superior Strength plus an ability",
  nk.system.derived.abilityMods.strength === 1 &&
    nk.system.derived.carryLoadMax === 100 &&
    api.hasStealthField(nk.system.details.race, nk.system.details.mutantVariant) === true,
  JSON.stringify({
    mod: nk.system.derived.abilityMods.strength,
    carry: nk.system.derived.carryLoadMax,
  }),
);

// 8ml. First use of the day: 3 AP, one minute, no Perception cost, and the
//      creature is carrying core's `invisible` status.
const first = await api.raiseStealthField(nk, nk.system);
await settle();
step(
  "the first Stealth Field of the day is free and turns the token invisible",
  first !== null &&
    first.ap === 3 &&
    first.seconds === 60 &&
    first.use === 1 &&
    first.perceptionLost === 0 &&
    nk.system.abilities.perception.value === 2 &&
    api.isStealthFieldActive(nk) === true &&
    (nk.statuses?.has("invisible") ?? false) &&
    api.stealthFieldUsesToday(nk) === 1,
  JSON.stringify({ report: first, statuses: Array.from(nk.statuses ?? []) }),
);

// 8mm. Raising it again while it is up is refused rather than charged — the
//      minute is already running, and a second use would cost Perception.
const doubled = await api.raiseStealthField(nk, nk.system);
step(
  "the Stealth Field cannot be raised on top of itself",
  doubled === null && api.stealthFieldUsesToday(nk) === 1,
  JSON.stringify({ refused: doubled === null, uses: api.stealthFieldUsesToday(nk) }),
);

// 8mn. Second use the same day: −1 Perception for 24 hours. The reduction is an
//      Active Effect against the stored score, so the sheet's Perception itself
//      moves — passive sense and everything else follow for free.
await api.endStealthField(nk);
await settle();
const second = await api.raiseStealthField(nk, nk.system);
await settle();
step(
  "each Stealth Field after the first costs a point of Perception for 24 hours",
  second !== null &&
    second.use === 2 &&
    second.perceptionLost === 1 &&
    second.perceptionPenalty === 1 &&
    nk.system.abilities.perception.value === 1 &&
    api.stealthFieldPerceptionPenalty(nk) === 1,
  JSON.stringify({ report: second, perception: nk.system.abilities.perception.value }),
);

// 8mo. Third use, now at the printed minimum of 1: still allowed, still
//      invisible, but there is nothing left to take. The book prices the
//      ability, it never forbids it.
await api.endStealthField(nk);
await settle();
const third = await api.raiseStealthField(nk, nk.system);
await settle();
step(
  "at Perception 1 further uses cost nothing more and are still allowed",
  third !== null &&
    third.use === 3 &&
    third.perceptionLost === 0 &&
    third.atFloor === true &&
    nk.system.abilities.perception.value === 1 &&
    api.stealthFieldPerceptionPenalty(nk) === 1 &&
    api.isStealthFieldActive(nk) === true,
  JSON.stringify({ report: third, perception: nk.system.abilities.perception.value }),
);

// 8mp. The day rolls over: the counter resets so the next use is free again,
//      while the 24-hour reductions keep running on their own clock. This is
//      what `passDay` calls (c4-integration.md §2) — asserted directly here so
//      the ladder is testable without advancing the world day.
await api.endStealthField(nk);
await api.resetStealthFieldUses(nk);
await settle();
const nextDay = await api.raiseStealthField(nk, nk.system);
await settle();
step(
  "a new day makes the next Stealth Field free again without refunding the decay",
  nextDay !== null &&
    nextDay.use === 1 &&
    nextDay.perceptionLost === 0 &&
    api.stealthFieldPerceptionPenalty(nk) === 1 &&
    nk.system.abilities.perception.value === 1,
  JSON.stringify({ report: nextDay, penalty: api.stealthFieldPerceptionPenalty(nk) }),
);

// 8mq. Only a Nightkin has it. Dropping the variant leaves a plain Super Mutant
//      with Superior Strength and no ability, and the action refuses.
await api.endStealthField(nk);
await api.clearStealthFieldDecay(nk);
await nk.update({ "system.details.mutantVariant": "" });
await settle();
const refused = await api.raiseStealthField(nk, nk.system);
step(
  "a Super Mutant without the Nightkin variant has no Stealth Field",
  refused === null &&
    api.isStealthFieldActive(nk) === false &&
    nk.system.abilities.perception.value === 2 &&
    nk.system.derived.abilityMods.strength === 1,
  JSON.stringify({
    refused: refused === null,
    perception: nk.system.abilities.perception.value,
    strength: nk.system.derived.abilityMods.strength,
  }),
);

await nk.delete();
await strain.delete();
}

// ------------------------------------------- BACKLOG C5: Vision & Fire polish
// Two exports the panel needed and did not have: `flameAreaOf`, which hands a
// burning region's parsed FlameArea back out from behind the flag key, and
// `reportObscurement`, which posts the obscurement sentence so the sheet panel
// no longer calls ChatMessage.create itself.
//
// release-8 light block (it does not depend on it — it builds and deletes its
// own scene — but it reads best next to it).
//
// In scope: step(), until(), settle(), actor, api, game, CONFIG.
// Every document created here is SMOKE- prefixed and deleted again at the end.
//
// Requires on api (globalThis.falloutTTRPG):
//   actions — igniteFlames, spreadFlameAreas, flameRegions, flameAreaOf,
//             extinguishAllFlames, describeObscurement, reportObscurement
//   pure    — flameRadiusFeet, flameDamageFormula, roundsToNextFlameDie,
//             flamesAtMaximum
{
  const SceneClassC5 = CONFIG.Scene.documentClass;
  const c5Stamp = Date.now();
  const c5Scene = await SceneClassC5.create({
    name: `SMOKE-VisionPolish-${c5Stamp}`,
    width: 2000,
    height: 2000,
    grid: { type: 1, size: 100, distance: 5, units: "ft" },
  });

  try {
    // c5a. flameAreaOf reads the ignited area back out of the region — the
    //      numbers the panel prints per fire row. 5 ft, 2d10 at ignition, and
    //      four rounds until it gains a die (5 ft/round outward, one more d10
    //      per 20 ft of growth — pg 118).
    const c5Area = { originRadiusFeet: 5, rounds: 0, spreadFeetPerRound: 5 };
    const c5Region = await api.igniteFlames(500, 500, c5Area, c5Scene);
    await settle(800);
    const litArea = c5Region ? api.flameAreaOf(c5Region) : null;
    step(
      "flameAreaOf returns the ignited area: 5 ft, 2d10, a die in four rounds (pg 118)",
      !!litArea &&
        litArea.originRadiusFeet === 5 &&
        litArea.rounds === 0 &&
        litArea.spreadFeetPerRound === 5 &&
        api.flameRadiusFeet(litArea) === 5 &&
        api.flameDamageFormula(litArea) === "2d10" &&
        api.roundsToNextFlameDie(litArea) === 4 &&
        api.flamesAtMaximum(litArea) === false,
      JSON.stringify({
        area: litArea,
        radius: litArea && api.flameRadiusFeet(litArea),
        formula: litArea && api.flameDamageFormula(litArea),
        nextDie: litArea && api.roundsToNextFlameDie(litArea),
      }),
    );

    // c5b. and it tracks the fire as it grows: four rounds of spread is 25 ft
    //      and 3d10, which is what the panel row has to say without going near
    //      the flag key itself.
    for (let i = 0; i < 4; i++) await api.spreadFlameAreas(c5Scene);
    const c5Grown = () => {
      const region = api.flameRegions(c5Scene)[0];
      return region ? api.flameAreaOf(region) : null;
    };
    const grownOkC5 = await until(() => c5Grown()?.rounds === 4);
    const grownArea = c5Grown() ?? { originRadiusFeet: 0, rounds: -1, spreadFeetPerRound: 0 };
    step(
      "flameAreaOf tracks the spread: four rounds is 25 ft and 3d10 (pg 118)",
      grownOkC5 &&
        api.flameRadiusFeet(grownArea) === 25 &&
        api.flameDamageFormula(grownArea) === "3d10" &&
        api.roundsToNextFlameDie(grownArea) === 4,
      JSON.stringify({
        area: grownArea,
        radius: api.flameRadiusFeet(grownArea),
        formula: api.flameDamageFormula(grownArea),
        nextDie: api.roundsToNextFlameDie(grownArea),
      }),
    );
    await api.extinguishAllFlames("water", c5Scene);

    // c5c. reportObscurement posts the readout as a card in the creature's
    //      voice, and posts *exactly* describeObscurement's sentence — the sheet
    //      row and the chat card are the same string by construction, which is
    //      the whole reason the panel stopped composing its own.
    const beforeC5 = game.messages.size;
    const expected = api.describeObscurement(actor, 5, c5Scene);
    const posted = await api.reportObscurement(actor, 5, c5Scene);
    const cardOk = await until(() => game.messages.size > beforeC5);
    const card = game.messages.contents.at(-1);
    step(
      "reportObscurement posts the obscurement readout as a card in the actor's voice",
      cardOk &&
        posted === expected &&
        String(card?.content ?? "") === expected &&
        card?.speaker?.actor === actor.id &&
        (card?.rolls?.length ?? 0) === 0,
      JSON.stringify({
        posted,
        content: String(card?.content ?? "").slice(0, 120),
        speaker: card?.speaker?.actor,
        actor: actor.id,
      }),
    );
  } finally {
    await c5Scene.delete();
  }
}

      // ==================================================== release 8: backgrounds
      {
        // Smoke steps for backgrounds (pg 13-18) and the explosives arm/throw table
        // (pg 21, 78-79).
        //
        // `api`, `game`, `ActorClass`, `stamp`, `until` and `settle` are all in scope.
        //
        // **Every document here is built by this block and deleted at the end**, and
        // nothing asserts against the suite's shared `actor`: applying a background is
        // the most destructive write in the system (three skill raises, a trait, up to
        // twenty-five items and fifty caps) and letting it land on the actor the other
        // eighty steps share would poison every skill assertion after it.
        //
        // Required on globalThis.falloutTTRPG before these run:
        //   applyBackground, clearBackground, appliedBackground,
        //   BACKGROUNDS, getBackground, kitForRace, grantableEntries, reportedEntries,
        //   armAndThrowOutcome, throwbackOutcome, armDC, armsAutomatically,
        //   disarmOutcome, throwDistanceFeet, printedThrowDistanceFeet, damageBandAt,
        //   senseLossRounds, explosiveByName.

        // ---------------------------------------------------------------- data shape

        // 9a. the chapter is twenty printed backgrounds plus Custom, and every one of
        //     them covers all five races exactly once
        step(
          "21 backgrounds (20 printed + Custom), each covering all five races",
          api.BACKGROUNDS.length === 21 &&
            api.BACKGROUNDS.filter((background) => background.kits.length > 0).length === 20 &&
            api.BACKGROUNDS.every(
              (background) =>
                background.kits.length === 0 ||
                ["human", "ghoul", "gen2synth", "robot", "superMutant"].every(
                  (race) => background.kits.filter((kit) => kit.races.includes(race)).length === 1,
                ),
            ),
          JSON.stringify({
            total: api.BACKGROUNDS.length,
            kits: api.BACKGROUNDS.reduce((sum, background) => sum + background.kits.length, 0),
          }),
        );

        // 9b. "+2 to three different skills" (pg 13) — three, never two, never a repeat
        step(
          "every printed background raises exactly three distinct skills",
          api.BACKGROUNDS.every(
            (background) =>
              background.key === "custom" ||
              (background.skills.length === 3 && new Set(background.skills).size === 3),
          ),
          JSON.stringify(api.BACKGROUNDS.map((background) => background.skills.length)),
        );

        // --------------------------------------------------------------- applying

        const dweller = await ActorClass.create({
          name: `SMOKE-Dweller-${stamp}`,
          type: "character",
        });
        await dweller.update({ "system.details.race": "human" });
        await settle();

        const before = {};
        for (const skill of ["medicine", "speech", "science", "guns"]) {
          before[skill] = dweller.system.skills[skill].points;
        }
        const beforeCaps = dweller.system.currency.caps;
        const beforeItems = dweller.items.size;

        // 9c. the Vault Dweller (pg 18): +2 Medicine/Speech/Science, the Talented
        //     trait, a vault suit and a Pip-Boy the book leaves the player to pick
        const applied = await api.applyBackground(dweller, dweller.system, "vaultDweller");
        const settled = await until(
          () => dweller.system.skills.medicine.points === before.medicine + 2,
        );
        step(
          "applying Vault Dweller writes +2 to each of its three skills and no others",
          settled &&
            dweller.system.skills.medicine.points === before.medicine + 2 &&
            dweller.system.skills.speech.points === before.speech + 2 &&
            dweller.system.skills.science.points === before.science + 2 &&
            dweller.system.skills.guns.points === before.guns,
          JSON.stringify({
            medicine: dweller.system.skills.medicine.points,
            speech: dweller.system.skills.speech.points,
            science: dweller.system.skills.science.points,
            guns: dweller.system.skills.guns.points,
          }),
        );

        // 9d. the kit lands as real documents, including the pg 91 unique items that
        //     until now existed only as blueprint rows
        await settle();
        const names = dweller.items.contents.map((item) => item.name);
        step(
          "the Vault Dweller kit creates its documents, Vault Suit included",
          dweller.items.size > beforeItems &&
            names.includes("Vault Suit") &&
            names.includes("10mm pistol"),
          JSON.stringify({ created: dweller.items.size - beforeItems, names: names.slice(0, 8) }),
        );

        // 9e. the trait comes across as a document, and its Active Effect with it —
        //     copying only `system` would leave a mechanical trait inert
        step(
          "the background's trait is granted as a trait document",
          dweller.itemTypes.trait.some((item) => item.name === "Talented"),
          JSON.stringify(dweller.itemTypes.trait.map((item) => item.name)),
        );

        // 9f. "x1 pip-boy (any)" (pg 18) is a choice the book hands the player, so it
        //     is reported and never granted — four models, none of them picked for you
        step(
          "the pip-boy (any) clause is reported rather than granted",
          applied.reported.some((printed) => printed.includes("pip-boy")) &&
            !names.some((name) => name.startsWith("Pip-Boy")),
          JSON.stringify({ reported: applied.reported }),
        );

        // 9g. the Vault Dweller's human kit is the one background in the chapter that
        //     prints no caps at all — every other kit ends "and x50 caps"
        step(
          "the Vault Dweller human kit grants no caps, as printed",
          applied.caps === 0 && dweller.system.currency.caps === beforeCaps,
          JSON.stringify({ caps: applied.caps, onSheet: dweller.system.currency.caps }),
        );

        // 9h. refusing, not stacking: a second background on a played sheet would add
        //     three more +2s and a second kit
        const second = await api.applyBackground(dweller, dweller.system, "soldier");
        await settle();
        step(
          "a second background is refused while one is applied",
          second === null &&
            api.appliedBackground(dweller).key === "vaultDweller" &&
            dweller.system.skills.medicine.points === before.medicine + 2,
          JSON.stringify({
            second,
            ledger: api.appliedBackground(dweller)?.key,
            medicine: dweller.system.skills.medicine.points,
          }),
        );

        // --------------------------------------------------------------- clearing

        // 9i. the player eats one of the granted items before undoing, which is the
        //     whole reason the undo works off a ledger rather than off the book
        const eaten = dweller.items.get(api.appliedBackground(dweller).itemIds[0]);
        const eatenName = eaten?.name;
        await eaten?.delete();
        await settle();

        const cleared = await api.clearBackground(dweller, dweller.system);
        const reverted = await until(
          () => dweller.system.skills.medicine.points === before.medicine,
        );
        step(
          "clearing reverses the skill points it wrote and empties the ledger",
          reverted &&
            dweller.system.skills.medicine.points === before.medicine &&
            dweller.system.skills.speech.points === before.speech &&
            api.appliedBackground(dweller) === null &&
            dweller.system.details.background === "",
          JSON.stringify({
            medicine: dweller.system.skills.medicine.points,
            ledger: api.appliedBackground(dweller),
          }),
        );

        // 9j. …and reports the one it could not remove instead of guessing at a
        //     replacement
        step(
          "clearing removes only the documents it created, and names the one already gone",
          cleared.missing.length === 1 && dweller.items.size === beforeItems,
          JSON.stringify({ eatenName, missing: cleared.missing.length, items: dweller.items.size }),
        );

        // 9k. cleared means clearable again — the refusal is state, not a one-way door
        const reapplied = await api.applyBackground(dweller, dweller.system, "soldier", { quiet: true });
        await settle();
        step(
          "a different background applies once the first is cleared",
          reapplied !== null &&
            api.appliedBackground(dweller).key === "soldier" &&
            dweller.system.skills.guns.points === before.guns + 2,
          JSON.stringify({ key: api.appliedBackground(dweller)?.key, guns: dweller.system.skills.guns.points }),
        );

        // 9l. a race with no printed kit is refused rather than handed a Human's:
        //     details.race is free text, and a typo must not silently pick a kit
        const stray = await ActorClass.create({ name: `SMOKE-Stray-${stamp}`, type: "character" });
        await stray.update({ "system.details.race": "deathclaw" });
        await settle();
        const refused = await api.applyBackground(stray, stray.system, "wastelander");
        step(
          "a race the chapter prints no kit for is refused, not defaulted",
          refused === null && api.appliedBackground(stray) === null,
          JSON.stringify({ refused, race: stray.system.details.race }),
        );

        // ------------------------------------------------------------- explosives

        // 9m. pg 78's table, which is the printing this system follows — pg 21's
        //     sentence claims 3 twice and leaves 4 in neither band
        step(
          "arm-and-throw bands are pg 78's 1 / 2-3 / 4-14 / 15+",
          api.armAndThrowOutcome(1) === "inHand" &&
            api.armAndThrowOutcome(2) === "shortDelayed" &&
            api.armAndThrowOutcome(3) === "shortDelayed" &&
            api.armAndThrowOutcome(4) === "delayed" &&
            api.armAndThrowOutcome(14) === "delayed" &&
            api.armAndThrowOutcome(15) === "thisTurn" &&
            api.armAndThrowOutcome(30) === "thisTurn",
          JSON.stringify([1, 2, 3, 4, 14, 15, 30].map((total) => api.armAndThrowOutcome(total))),
        );

        // 9n. "If the **total** is a 1" (pg 21) — the skill bonus is inside the
        //     comparison, so a trained demolitionist genuinely cannot blow their own
        //     hand off on the throw. This is the rule, not a bug.
        step(
          "it is the total that detonates in hand, not a natural 1",
          api.armAndThrowOutcome(1 + 5) === "delayed" && api.armAndThrowOutcome(1 - 3) === "inHand",
          JSON.stringify({ trained: api.armAndThrowOutcome(6), unskilled: api.armAndThrowOutcome(-2) }),
        );

        // 9o. both printings of Throwback leave exactly 13 undefined; read as
        //     succeeding, which is the only reading that covers the d20
        step(
          "throwback: 12 or below goes off in hand, 13 and up lands",
          api.throwbackOutcome(12) === "inHand" &&
            api.throwbackOutcome(13) === "thisTurn" &&
            api.throwbackOutcome(14) === "thisTurn",
          JSON.stringify([12, 13, 14].map((total) => api.throwbackOutcome(total))),
        );

        // 9p. the Arm DC column is a bonus, not a DC (pg 78) — the same trap the
        //     Blueprint Encyclopedia sets, and the same fix
        step(
          "arming a Frag Mine is DC 14 (10 + the printed +4), and a +4 bonus auto-succeeds",
          api.armDC(4) === 14 &&
            api.armsAutomatically(4, 4) === true &&
            api.armsAutomatically(3, 4) === false,
          JSON.stringify({ dc: api.armDC(4) }),
        );

        // 9q. disarming: fail by 5 or more and it goes off now, fail by less and it
        //     keeps its own clock
        step(
          "disarm outcomes split at a margin of 5",
          api.disarmOutcome(14, 4) === "disarmed" &&
            api.disarmOutcome(10, 4) === "unchanged" &&
            api.disarmOutcome(9, 4) === "inHand",
          JSON.stringify([14, 10, 9].map((total) => api.disarmOutcome(total, 4))),
        );

        // 9r. pg 78 prints "Strength ability modifier", which at Strength 5 is a throw
        //     of zero feet. The score is used; the printed arithmetic is kept beside it.
        step(
          "throw range uses the Strength score, and the printed modifier form is still available",
          api.throwDistanceFeet(5, 6) === 30 && api.printedThrowDistanceFeet(0, 6) === 0,
          JSON.stringify({
            used: api.throwDistanceFeet(5, 6),
            printed: api.printedThrowDistanceFeet(0, 6),
          }),
        );

        // 9s. the two-band area of effect, on the book's own worked example (pg 78)
        const dynamite = api.explosiveByName("Dynamite");
        step(
          "Dynamite's 5ft / 20ft bands read full / half / none",
          api.damageBandAt(4, dynamite.area) === "full" &&
            api.damageBandAt(15, dynamite.area) === "half" &&
            api.damageBandAt(25, dynamite.area) === "none",
          JSON.stringify(dynamite.area),
        );

        // 9t. Blinding and Deafening: "4 - their Endurance ability modifier to a
        //     minimum of 1"
        step(
          "sense loss is 4 - END modifier, floored at 1",
          api.senseLossRounds(0) === 4 && api.senseLossRounds(3) === 1 && api.senseLossRounds(5) === 1,
          JSON.stringify([0, 3, 5].map((mod) => api.senseLossRounds(mod))),
        );

        // ------------------------------------------------------------------ cleanup
        await dweller.delete();
        await stray.delete();
        await settle();
        step(
          "background smoke actors cleaned up",
          !game.actors.get(dweller.id) && !game.actors.get(stray.id),
          JSON.stringify({ remaining: game.actors.filter((a) => a.name.startsWith("SMOKE-")).length }),
        );
      }

      // 9. death save at 0 HP (random outcome; assert bookkeeping moved)
      await actor.update({ "system.resources.hp.value": 0 });
      const beforeSave = game.messages.size;
      await api.rollDeathSave(actor, actor.system);
      const saves = actor.system.resources.deathSaves;
      step(
        "death save rolls and updates tally",
        game.messages.size > beforeSave &&
          (saves.successes + saves.failures > 0 || actor.system.resources.hp.value === 1),
        JSON.stringify({ ...saves, hp: actor.system.resources.hp.value }),
      );
    } catch (error) {
      step("unexpected exception", false, String(error?.stack ?? error));
    }
    return report;
  });

  for (const step of smoke.steps) {
    if (step.ok) pass(step.name);
    else fail(step.name, step.detail);
  }

  for (const entry of smoke.notifyErrors ?? []) {
    console.log(`  ! server rejection after step ${entry.afterStep} (${entry.lastStep}): ${entry.message}`);
  }

  if (smoke.sheetOpen) {
    const sheet = await page.$(".fallout-ttrpg.character");
    await (sheet ?? page).screenshot({ path: path.join(outDir, "character-sheet.png") });
  }
  await page.screenshot({ path: path.join(outDir, "game.png") });

  // ---- cleanup: ONLY documents this run created (SMOKE- prefix) ----------
  const cleaned = await page.evaluate(async (stamp) => {
    // Drain any sweep still running from the world-time changes above; the
    // sweep walks every actor, and deleting one mid-iteration makes the
    // server reject the effect delete.
    //
    // Only this run's actors: every name this suite creates carries the run's
    // stamp, and reclaiming another run's documents is what made concurrent
    // runs destroy each other.
    const mine = game.actors.filter(
      (actor) => actor.name.startsWith("SMOKE-") && actor.name.includes(String(stamp)),
    );
    for (const actor of mine) await actor.delete();
    // The weather steps create one scene; drop it too if an error left it.
    for (const scene of (game.scenes?.contents ?? []).filter((s) =>
      s.name.startsWith("SMOKE-"),
    )) {
      await scene.delete();
    }
    return mine.length;
  }, smoke.stamp);
  pass(`cleanup: removed ${cleaned} SMOKE- actor(s)`);
} catch (error) {
  fail("fatal", String(error.message ?? error));
} finally {
  await browser.close();
}

// ------------------------------------------------------------------ report
console.log("\n================ smoke summary ================");
console.log(`passed: ${passes.length}   failed: ${failures.length}`);
if (consoleErrors.length) {
  console.log(`\nconsole ERRORS (${consoleErrors.length}):`);
  for (const line of [...new Set(consoleErrors)]) console.log(`  ${line}`);
}
const systemWarnings = [...new Set(consoleWarnings)].filter((line) =>
  /fallout|deprecat/i.test(line),
);
if (systemWarnings.length) {
  console.log(`\nrelevant warnings (${systemWarnings.length}):`);
  for (const line of systemWarnings) console.log(`  ${line}`);
}
console.log(`screenshots: ${outDir}`);
process.exit(failures.length > 0 || consoleErrors.length > 0 ? 1 : 0);
