/**
 * Robot chassis rules that write or post — currently one: reattaching a severed
 * limb (v2.1 pg 11).
 *
 * The arithmetic and every ruling behind it are in `src/rules/robots.ts`, which
 * is pure. This file exists because a sheet panel may not post chat itself: the
 * one panel that does (`src/sheets/panels/vision.ts`) is on the backlog to be
 * fixed for exactly that reason (BACKLOG C5), so a new control is not going to
 * add a second offender.
 *
 * > **Severed Limbs.** …If any of your limbs are severed, you do not go into
 * > shock and they can be reattached with 3 steel and 1 circuitry junk item.
 * > When you or a creature reattaches a limb, it takes a number of minutes
 * > equal to 10 - their or your crafting skill bonus. If the amount of time is
 * > reduced to 0, it takes 6 AP to reattach the limb instead.
 *
 * Nothing here is spent and nothing is consumed:
 *
 * - **The junk is reported.** No junk documents exist in this system at all
 *   (BACKLOG D2), which is why crafting, repair and first aid all report their
 *   materials too. When junk becomes a document type, this is one of the sites
 *   that gets taught to consume.
 * - **The AP is reported**, as all AP is (BACKLOG E1).
 * - **Nothing tracks which limb is off.** Severance is narrated — a severe
 *   injury card names it and the table remembers — so this control does not ask
 *   which limb, and could not check that one is missing if it did. It prices
 *   the job the book prices.
 */

import type { CharacterData } from "../data/character";
import { apLine, pushActionPoints } from "../combat/action-points";
import { consumeJunk, junkLines, type JunkResult } from "./junk";
import { FAULTY_CIRCUITRY, FAULTY_REPAIR_DC, isAddictedTo, removeAddiction } from "../rules/chems";
import { rollSkillCheck } from "../dice/core";
import {
  FUEL_OIL_JUNK,
  FUEL_TANK_AP_COST,
  ROBOT_CHASSIS_RACES,
  ROBOT_REATTACH_BASE_MINUTES,
  ROBOT_REATTACH_JUNK,
  fuelCheckDC,
  fuelClockRuns,
  fuelLimitHours,
  hasSeveredLimbRules,
  robotReattachCost,
} from "../rules/robots";

/** What a reattachment costs, for the card, the sheet and the smoke suite. */
async function say(actor: FoundryActor, lines: readonly string[]): Promise<void> {
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: lines.join("<br />"),
  });
}

export interface ReattachReport {
  /** Minutes of work, or 0 when the crafting bonus has bought them all off. */
  minutes: number;
  /** 6 AP, and only when `minutes` is 0. Reported, not deducted. */
  ap: number;
  /** The crafting bonus used — the mechanic's, not the patient's. See below. */
  craftingBonus: number;
  steel: number;
  circuitry: number;
}

/**
 * Reattach a severed limb (pg 11).
 *
 * `actor`/`system` is whoever is doing the work — the sheet the button was
 * pressed on — and `patient` is the robot being repaired, resolved by the
 * caller from the user's single target the same way the first-aid controls
 * resolve theirs.
 *
 * **Whose crafting bonus.** The book says "their or your crafting skill bonus"
 * and never says the better of the two is used, so `robotReattachCost` takes
 * one number and refuses to pick. This picks the *mechanic's*, because that is
 * who pressed the button and because the alternative reading is already
 * available at the table for free: a robot repairing itself targets itself, and
 * the card names whose bonus it used so nobody has to guess.
 *
 * Returns null when the target is not a body the clause covers — the sentence
 * is printed in the Robot race's entry, and a human arm is not reattached with
 * circuitry. The refusal is a notification rather than a card, because it is a
 * mis-click rather than an event in the fiction.
 */
export async function reattachLimb(
  actor: FoundryActor,
  system: CharacterData,
  patient: FoundryActor,
): Promise<ReattachReport | null> {
  const patientSystem = patient.system as CharacterData;
  if (!hasSeveredLimbRules(patientSystem.details.race)) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Robots.reattachNotRobot", { name: patient.name }),
    );
    return null;
  }

  const craftingBonus = system.derived.skillBonuses.crafting;
  const cost = robotReattachCost(craftingBonus);

  // The mechanic's junk pays for the job (BACKLOG D2): 3 steel and 1 circuitry
  // out of whoever pressed the button — the same reading `endBleeding` takes of
  // its cloth, and the same never-block stance: a shortfall is named on the
  // card, not turned into a refusal, because a table tracking junk on paper
  // must not be locked out of a printed rule by an empty sheet.
  const junk = await consumeJunk(actor, [
    { type: "steel", count: ROBOT_REATTACH_JUNK.steel },
    { type: "circuitry", count: ROBOT_REATTACH_JUNK.circuitry },
  ]);

  const lines = [
    game.i18n.localize("FALLOUT.Robots.reattachCard", {
      mechanic: actor.name,
      patient: patient.name,
    }),
    game.i18n.localize("FALLOUT.Robots.reattachJunk", {
      steel: ROBOT_REATTACH_JUNK.steel,
      circuitry: ROBOT_REATTACH_JUNK.circuitry,
    }),
    ...junkLines(junk),
    cost.minutes > 0
      ? game.i18n.localize("FALLOUT.Robots.reattachMinutes", { minutes: cost.minutes })
      : game.i18n.localize("FALLOUT.Robots.reattachAp", { ap: cost.ap }),
    // Charged only when it is being done at combat speed; the ten-minute
    // version is priced in minutes and costs no AP (pg 10).
    ...(cost.minutes > 0 ? [] : (await apLine(actor, cost.ap))),
    game.i18n.localize("FALLOUT.Robots.reattachWhose", {
      mechanic: actor.name,
      bonus: craftingBonus,
      base: ROBOT_REATTACH_BASE_MINUTES,
    }),
    game.i18n.localize("FALLOUT.Robots.severedLimbs"),
    game.i18n.localize("FALLOUT.Robots.reattachReported"),
  ];

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: lines.join("<br />"),
  });

  return {
    minutes: cost.minutes,
    ap: cost.ap,
    craftingBonus,
    steel: ROBOT_REATTACH_JUNK.steel,
    circuitry: ROBOT_REATTACH_JUNK.circuitry,
  };
}

// ================================================================ pg 10 — Fuel

/** What advancing the fuel clock did, for the card and the smoke suite. */
export interface FuelReport {
  /** Hours on the clock after this advance (or 0 after a fill). */
  fuelHours: number;
  /** Hours past the limit that had not yet been paid for with a check. */
  hoursOver: number;
  /** Endurance checks rolled this advance, in order, with the DC each faced. */
  checks: { dc: number; total: number; passed: boolean }[];
  /** The machine ran dry mid-sequence: unconscious until refuelled (pg 10). */
  unconscious: boolean;
}

/**
 * Fill the tank (pg 10): 6 AP and a gallon of fuel, or six oil junk items.
 *
 * Works on any robot, not only the Handy the automatic clock runs for — see
 * the ruling on `fuelClockRuns`. The AP and the fuel are reported, never
 * deducted: AP by the standing item-14 rule, the gallon because no fuel or
 * junk documents exist to consume (BACKLOG D2). The card also names the
 * pg 10 consequence this ends — "unconscious until another creature fills
 * your tank" — because unconsciousness is not a status this system tracks,
 * so the sentence on the card is the whole mechanism.
 */
export async function fillFuelTank(
  actor: FoundryActor,
  system: CharacterData,
  options: {
    /**
     * Pay with the six oil junk items rather than the gallon (pg 10). The book
     * prints an either/or, so which side pays is the *caller's* declaration —
     * auto-spending the oil whenever it was held silently picked a side of an
     * "or" for a player who may have been holding the gallon precisely to
     * spend it. Defaults to oil (the automated path); pass false when the
     * gallon pays, and nothing is consumed: "Fuel" ships as an ammo document
     * for the Flamer, and whether that is the same fuel is a data ruling this
     * control does not make. The card says which path was taken.
     */
    spendOil?: boolean;
  } = {},
): Promise<FuelReport | null> {
  if (!ROBOT_CHASSIS_RACES.includes(system.details.race)) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Robots.fuelNotARobot"));
    return null;
  }
  const { spendOil = true } = options;
  await actor.update({ "system.survival.fuelHours": 0 });
  const junk = spendOil
    ? await consumeJunk(actor, [{ type: "oil", count: FUEL_OIL_JUNK }])
    : null;
  const fuelLines = [
    game.i18n.localize("FALLOUT.Robots.fuelFilled", {
      ap: FUEL_TANK_AP_COST,
      junk: FUEL_OIL_JUNK,
    }),
    ...(junk ? junkLines(junk) : [game.i18n.localize("FALLOUT.Robots.fuelGallonPaid")]),
  ];
  await pushActionPoints(actor, FUEL_TANK_AP_COST, fuelLines);
  await say(actor, fuelLines);
  return { fuelHours: 0, hoursOver: 0, checks: [], unconscious: false };
}

/** Load a fusion core (pg 10): the fill that lasts 30 days. Reported, and the clock restarts. */
export async function loadFuelCore(
  actor: FoundryActor,
  system: CharacterData,
): Promise<FuelReport | null> {
  if (!ROBOT_CHASSIS_RACES.includes(system.details.race)) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Robots.fuelNotARobot"));
    return null;
  }
  await actor.update({ "system.survival.fuelHours": 0, "system.survival.fuelCore": true });
  await say(actor, [game.i18n.localize("FALLOUT.Robots.fuelCoreLoaded", { days: 30 })]);
  return { fuelHours: 0, hoursOver: 0, checks: [], unconscious: false };
}

/**
 * Advance the fuel clock by some hours (pg 10) — called by `rest` and
 * `passDay` alongside the disease clocks, because the book prices this in the
 * same hours. No-op unless the automatic clock runs for this creature
 * (`fuelClockRuns`), so nothing about any other character changes.
 *
 * Past the limit, one Endurance check per unpaid hour, DC 12 + 2 per success
 * so far, rolled here in sequence and posted as ONE card — a night's sleep
 * eight hours dry would otherwise post eight cards. A failure ends the
 * sequence: the machine is unconscious until someone fills the tank, and no
 * further checks accrue (the book stops rolling too — an unconscious Handy
 * cannot "must succeed" anything).
 *
 * The clock still advances while unconscious-shaped (fuelHours keeps
 * counting), but hours already paid for with a successful check are not
 * re-charged: the check count is derived from how far past the limit the
 * clock had already run.
 */
export async function advanceFuel(
  actor: FoundryActor,
  system: CharacterData,
  hours: number,
): Promise<FuelReport | null> {
  if (hours <= 0) return null;
  if (!fuelClockRuns(system.details.race, system.details.robotType)) return null;

  const limit = fuelLimitHours(system.survival.fuelCore);
  const before = system.survival.fuelHours;
  const after = before + hours;
  await actor.update({ "system.survival.fuelHours": after });

  const paidHours = Math.max(0, Math.floor(before - limit));
  const dueHours = Math.max(0, Math.floor(after - limit)) - paidHours;
  const report: FuelReport = {
    fuelHours: after,
    hoursOver: dueHours,
    checks: [],
    unconscious: false,
  };
  if (dueHours <= 0) return report;

  // The DC picks up where previous advances left it: successes so far are the
  // hours already paid, since only a success buys an hour.
  let successes = paidHours;
  const mod = system.derived.abilityMods.endurance;
  for (let hour = 0; hour < dueHours; hour += 1) {
    const dc = fuelCheckDC(successes);
    const roll = new foundry.dice.Roll(`1d20 + ${String(mod)}`);
    await roll.evaluate();
    const passed = roll.total >= dc;
    report.checks.push({ dc, total: roll.total, passed });
    if (!passed) {
      report.unconscious = true;
      break;
    }
    successes += 1;
  }

  await say(actor, [
    game.i18n.localize("FALLOUT.Robots.fuelOverdue", {
      hours: report.checks.length,
      limit,
    }),
    ...report.checks.map((check, index) =>
      game.i18n.localize("FALLOUT.Robots.fuelCheck", {
        hour: index + 1,
        dc: check.dc,
        total: check.total,
        outcome: game.i18n.localize(
          check.passed ? "FALLOUT.Robots.fuelPassed" : "FALLOUT.Robots.fuelFailed",
        ),
      }),
    ),
    ...(report.unconscious ? [game.i18n.localize("FALLOUT.Robots.fuelUnconscious")] : []),
  ]);
  return report;
}

// ====================================================== pg 90 — faulty programming

/** What an attempt to clear faulty programming did. */
export interface FaultyRepairReport {
  /** The program whose faulty flag was targeted. */
  program: string;
  dc: number;
  rolled: number;
  succeeded: boolean;
  /** Circuitry actually spent, and what was missing (BACKLOG D2). */
  junk: JunkResult;
  /** Whether the addiction list was actually rewritten. */
  cleared: boolean;
}

/**
 * Clear faulty programming (pg 90).
 *
 * > Your programming becomes no longer faulty if you use 5 circuitry junk items
 * > and make a crafting skill check with the DC equal to 20. On a failure, you
 * > lose the circuitry and your programming is still faulty.
 *
 * Faulty programming is stored in the same list as chem addictions, because it
 * is contracted by the same check against the same DC (pg 89-90) — a Robot
 * Overclock Program that fails its Endurance check goes into
 * `system.chems.addictions` exactly as a chem does. Until now nothing could
 * take it back out again: `addictionRecoveryWeeks` is abstinence, and a robot
 * does not abstain.
 *
 * Two things the rule states that this honours literally:
 *
 * - **The circuitry is spent either way.** "On a failure, you lose the
 *   circuitry" — so the junk is consumed before the roll, and a failed attempt
 *   costs five circuitry for nothing. That is the whole weight of the rule; a
 *   free retry would remove it.
 * - **A shortfall does not refuse the attempt.** Consistent with every other
 *   junk site (see `src/actions/junk.ts`): what is held is spent, what is
 *   missing is named on the card, and the table decides. Locking a robot out of
 *   its only cure because the sheet has no circuitry on it would be worse than
 *   reporting the shortfall.
 */
export async function clearFaultyProgramming(
  actor: FoundryActor,
  system: CharacterData,
  program: string,
): Promise<FaultyRepairReport | null> {
  if (!isAddictedTo(system.chems.addictions, program)) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Robots.faultyNotFaulty", { program }),
    );
    return null;
  }

  // Before the roll, and spent whether or not it succeeds (pg 90).
  const junk = await consumeJunk(actor, [{ type: "circuitry", count: FAULTY_CIRCUITRY }]);

  const check = await rollSkillCheck(
    actor,
    system,
    "crafting",
    FAULTY_REPAIR_DC,
    "normal",
    [],
    game.i18n.localize("FALLOUT.Robots.faultyCheck", {
      program,
      dc: FAULTY_REPAIR_DC,
      circuitry: FAULTY_CIRCUITRY,
    }),
  );

  if (check.success) {
    await actor.update({
      "system.chems.addictions": removeAddiction(system.chems.addictions, program),
    });
  }

  await say(actor, [
    game.i18n.localize(
      check.success ? "FALLOUT.Robots.faultyCleared" : "FALLOUT.Robots.faultyFailed",
      { program, dc: FAULTY_REPAIR_DC, circuitry: FAULTY_CIRCUITRY },
    ),
    ...junkLines(junk),
  ]);

  return {
    program,
    dc: FAULTY_REPAIR_DC,
    rolled: check.total,
    succeeded: check.success,
    junk,
    cleared: check.success,
  };
}
