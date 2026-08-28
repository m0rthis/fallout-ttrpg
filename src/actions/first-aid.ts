/**
 * Medicine-skill first aid (pg 21, pg 23, pg 131) — the document-writing half.
 *
 * Two actions, both 6 AP, both a Medicine check by the medic against a DC the
 * *patient* sets:
 *
 * - **End Bleeding** — DC 15, plus 1 cloth junk item, on a creature within
 *   5 feet. Success ends the condition outright.
 * - **Stabilise** — DC `10 − the patient's Endurance modifier` (pg 131; the
 *   ruling and the rejected pg 21/23 formula are both at
 *   `src/rules/first-aid.ts`). Success returns a dying creature to 1 hit point.
 *
 * Three shapes borrowed from the rest of the actions layer:
 *
 * - **AP is reported, never deducted** (ROADMAP item 14), so a misclick cannot
 *   strand a character at 0 AP. The card names the cost.
 * - **A condition floor is the real bottom.** Bleeding is leveled and a disease
 *   can hold levels in place (pg 120), so this floors at
 *   `derived.conditionFloors.bleeding` the way `useAid`'s `relieve()` does, and
 *   says so when the floor is all that is left.
 * - **Nothing hooks anything.** These are buttons a person presses, for the
 *   reason `src/actions/situations.ts` sets out at length: this system does not
 *   write documents in response to document writes.
 */

import type { CharacterData } from "../data/character";
import { apLine, pushActionPoints } from "../combat/action-points";
import type { AidData, JunkType } from "../data/items";
import { deathSaveFailureLimit } from "../rules/constants";
import {
  BLEEDING_CLOTH_JUNK,
  canStabilize,
  EFFICIENT_DIAGNOSIS,
  efficientDiagnosisBonus,
  END_BLEEDING_DC,
  endBleedingRelief,
  FIRST_AID_AP_COST,
  FIRST_AID_RANGE_FEET,
  isDying,
  MEDICAL_KIT_ACTIONS,
  MEDICAL_KIT_AP,
  MEDICAL_KIT_MINUTES,
  MEDICAL_KIT_USES,
  type MedicalKitAction,
  type MedicalKitKind,
  medicalKitKind,
  PAIN_KILLER_HIT_POINTS,
  stabilizeDC,
  stitchWoundsHitPoints,
  summaryStabilizeDC,
  TOURNIQUET_BLEEDING_LEVELS,
  tourniquetRelief,
} from "../rules/first-aid";
import { hitPointUpdates, restoreHitPoints, suffocating } from "./healing";
import { consumeJunk, type JunkResult, junkLines } from "./junk";
import { SYSTEM_ID } from "../rules/effects";
import { rollSkillCheck } from "../dice/core";
import { perkRanks } from "./perks";
import { treatLimbConditions } from "./targeted-conditions";

/** What a first-aid attempt did, for the sheet and the smoke suite. */
export interface FirstAidReport {
  dc: number;
  rolled: number;
  succeeded: boolean;
  /** Reported, not deducted — see the module note. */
  apCost: number;
  /**
   * The junk this attempt spent and the junk it could not find (BACKLOG D2).
   * Absent on the two actions that cost no materials, so a caller can tell
   * "this action spends nothing" from "this one does and came up short".
   */
  junk?: JunkResult;
}

async function say(actor: FoundryActor, lines: string[]): Promise<void> {
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: lines.join("<br />"),
  });
}

/**
 * One Medicine check by the medic, posted as its own roll card.
 *
 * Now a thin wrapper over the shared `rollSkillCheck`. It used to build the
 * roll inline from the skill bonus and the flat d20 modifiers, which meant
 * advantage and disadvantage never reached it: `effectiveMode` was private to
 * `src/dice/rolls.ts`, and that module could not be imported here without a
 * cycle. The plumbing now lives in `src/dice/core.ts`, which any action module
 * may import, so a perk granting advantage on Medicine finally applies.
 */
async function medicineCheck(
  medic: FoundryActor,
  system: CharacterData,
  dc: number,
  flavor: string,
): Promise<{ rolled: number; succeeded: boolean }> {
  const result = await rollSkillCheck(medic, system, "medicine", dc, "normal", [], flavor);
  return { rolled: result.total, succeeded: result.success };
}

/**
 * The material that `BLEEDING_CLOTH_JUNK` counts.
 *
 * The rules constant next to it is a bare *quantity* — "1 cloth junk item" — and
 * lives in `src/rules/first-aid.ts`, which is pure and has no business knowing
 * what a compendium calls anything. Which material that is, is a data-layer
 * fact, so the join to `packs-src/junk.json`'s `junkType` is made here. Typed as
 * `JunkType` so a typo is a compile error rather than a shortfall that can never
 * be paid.
 */
const BLEEDING_CLOTH_JUNK_TYPE: JunkType = "cloth";

/**
 * End the Bleeding condition on a creature within 5 feet (pg 21, pg 23).
 *
 * > If you are within 5 feet of a creature with the bleeding condition, you can
 * > spend 6 AP, use 1 cloth junk item, and succeed a DC 15 Medicine skill check
 * > to end the condition.
 *
 * Printed identically in both ability chapters and nowhere contradicted, so
 * unlike its neighbouring sentence this one has no ruling attached to it.
 *
 * What the book leaves open, and what is done with it: **failure costs nothing
 * further** and the attempt is **repeatable**, because the rule states no
 * consequence and no limit.
 *
 * ## The cloth is now spent (BACKLOG D2)
 *
 * This is the first report-site wired to `consumeJunk`, and it moves one clause
 * of the older ruling. The cloth used to be reported because the system shipped
 * no junk to consume; `packs-src/junk.json` now ships "Junk: Cloth", so a medic
 * carrying a stack of it pays for the attempt out of that stack.
 *
 * Two calls fall out of that, both readings of the sentence above rather than
 * new rules:
 *
 * - **The attempt spends the cloth, not the success.** The sentence lists three
 *   things — spend 6 AP, use 1 cloth, succeed a check — and only the third is
 *   conditional. So the cloth goes before the die, exactly as the AP does, and
 *   a failed check has still cost it. ("Failure costs nothing" was always about
 *   *additional* penalties; the card has said "nothing is lost but the AP"
 *   since before junk existed, and now says the cloth too.)
 * - **No cloth is not a refusal.** The check still rolls and the card names what
 *   was missing — the layer's standing position on costs it cannot verify, set
 *   out at length in `src/actions/junk.ts`. A medic whose player is tracking
 *   junk on paper must not be locked out of a rule by an empty sheet.
 *
 * Returns null when there was nothing to treat.
 */
export async function endBleeding(
  medic: FoundryActor,
  medicSystem: CharacterData,
  target: FoundryActor,
): Promise<FirstAidReport | null> {
  const patient = target.system as CharacterData;
  const floor = patient.derived.conditionFloors.bleeding ?? 0;
  const relief = endBleedingRelief(patient.conditions.bleeding, floor);

  if (patient.conditions.bleeding <= 0) {
    ui.notifications.info(
      game.i18n.localize("FALLOUT.FirstAid.notBleeding", { target: target.name }),
    );
    return null;
  }
  if (relief.floorBlocked) {
    // Every remaining level is held by a disease, so the check has nothing to
    // remove. Refusing the roll rather than letting it succeed onto no effect.
    await say(medic, [
      game.i18n.localize("FALLOUT.FirstAid.floorBlocked", {
        target: target.name,
        levels: relief.levels,
      }),
    ]);
    return null;
  }

  // Before the roll: the cloth pays for the attempt, not for the result.
  const junk = await consumeJunk(medic, [
    { type: BLEEDING_CLOTH_JUNK_TYPE, count: BLEEDING_CLOTH_JUNK },
  ]);

  const check = await medicineCheck(
    medic,
    medicSystem,
    END_BLEEDING_DC,
    game.i18n.localize("FALLOUT.FirstAid.bleedingCheck", {
      target: target.name,
      dc: END_BLEEDING_DC,
    }),
  );

  const lines = [
    game.i18n.localize(
      check.succeeded ? "FALLOUT.FirstAid.bleedingSucceeded" : "FALLOUT.FirstAid.bleedingFailed",
      {
        target: target.name,
        levels: relief.removed,
        dc: END_BLEEDING_DC,
        ap: FIRST_AID_AP_COST,
      },
    ),
    game.i18n.localize("FALLOUT.FirstAid.cost", {
      ap: FIRST_AID_AP_COST,
      cloth: BLEEDING_CLOTH_JUNK,
      feet: FIRST_AID_RANGE_FEET,
    }),
    ...junkLines(junk),
  ];
  if (check.succeeded && relief.levels > 0) {
    // Succeeded, but a disease is keeping some levels: "end the condition"
    // cannot reach through a pg 120 lock.
    lines.push(
      game.i18n.localize("FALLOUT.FirstAid.floorRemains", { levels: relief.levels }),
    );
  }
  if (check.succeeded) await target.update({ "system.conditions.bleeding": relief.levels });
  await pushActionPoints(medic, FIRST_AID_AP_COST, lines);
  await say(medic, lines);

  return {
    dc: END_BLEEDING_DC,
    rolled: check.rolled,
    succeeded: check.succeeded,
    apCost: FIRST_AID_AP_COST,
    junk,
  };
}

/**
 * Administer first aid to a dying creature (pg 131).
 *
 * > You can use 6 AP to administer first aid to a dying creature, roll a
 * > Medicine skill check with the DC equal to 10 - the creature's Endurance
 * > modifier. On a success, the creature returns to 1 hit point.
 *
 * The competing pg 21/23 DC and the reasoning that settled it live at
 * `stabilizeDC` in `src/rules/first-aid.ts`. The rejected number is still
 * computed and printed on the card, so a GM who reads pg 21 can see both.
 *
 * ## What "returns to 1 hit point" does to the sheet
 *
 * Hit points go to 1, and **both death-save tallies are cleared**. The clearing
 * is an inference: neither printing mentions the tallies at all. But at 1 hit
 * point the creature is no longer dying, and leaving a stale count of failures
 * on the sheet would have them carry silently into the *next* time it drops.
 * The book's own comparable outcome does the same thing — three successful
 * death saves also end at 1 hit point (pg 131), and `rollDeathSave` already
 * zeroes both tallies there. Consistency with that path, not a printed rule.
 *
 * ## The heading and the rule disagree
 *
 * Pg 131's prose describes the D&D notion of stabilising — "stabilized so that
 * it isn't killed by a failed death saving throw", i.e. still at 0 hit points,
 * just off the clock. Its own next sentence then hands back 1 hit point, which
 * ends the dying condition outright and is not stabilising at all. The
 * operative sentence is the one with the numbers in it, so this heals to 1.
 *
 * ## Bleeding
 *
 * Pg 133: "If a creature who has any levels of bleeding is healed, they do not
 * gain any hit points, instead they remove two levels of bleeding." Read
 * literally that would make this action useless against the one condition that
 * most often kills a dying creature (a bleeding dying creature fails a death
 * save every turn, same page). It does not apply here: pg 131 sets stabilising
 * *against* healing in its own opening sentence — "the best way to save a
 * creature with 0 hit points is to heal it. **If healing is unavailable**, the
 * creature can at least be stabilized" — so the two are distinct acts by the
 * book's own framing. An inference from that contrast, not a printed
 * exclusion, so a bleeding patient gets a note on the card rather than a silent
 * decision.
 *
 * Returns null when the target is not a dying creature this can reach.
 */
export async function stabilizeCreature(
  medic: FoundryActor,
  medicSystem: CharacterData,
  target: FoundryActor,
): Promise<FirstAidReport | null> {
  const patient = target.system as CharacterData;
  const { successes, failures } = patient.resources.deathSaves;
  const limit = deathSaveFailureLimit(patient.details.race);

  // pg 118 names stabilising alongside healing: a suffocating creature "can't
  // regain hit points **or be stabilized** until it can breathe again". The
  // healing gate refuses the first half; this is the second, and it lives here
  // rather than in the gate because stabilising writes hit points directly.
  if (suffocating(target)) {
    ui.notifications.info(
      game.i18n.localize("FALLOUT.Movement.stabilizeSuffocating", { target: target.name }),
    );
    return null;
  }

  if (!isDying(patient.resources.hp.value)) {
    ui.notifications.info(
      game.i18n.localize("FALLOUT.FirstAid.notDying", { target: target.name }),
    );
    return null;
  }
  if (!canStabilize(patient.resources.hp.value, failures, limit)) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.FirstAid.tooLate", { target: target.name, failures }),
    );
    return null;
  }

  const dc = stabilizeDC(patient.derived.abilityMods.endurance);
  const check = await medicineCheck(
    medic,
    medicSystem,
    dc,
    game.i18n.localize("FALLOUT.FirstAid.stabilizeCheck", { target: target.name, dc }),
  );

  const lines = [
    game.i18n.localize(
      check.succeeded ? "FALLOUT.FirstAid.stabilizeSucceeded" : "FALLOUT.FirstAid.stabilizeFailed",
      { target: target.name, dc, ap: FIRST_AID_AP_COST },
    ),
    game.i18n.localize("FALLOUT.FirstAid.stabilizeCost", { ap: FIRST_AID_AP_COST }),
    ...(await apLine(medic, FIRST_AID_AP_COST)),
    // The book's own disagreement, on the card rather than buried in a
    // comment: pg 21/23 would have set a different DC from a different input.
    game.i18n.localize("FALLOUT.FirstAid.otherPrinting", {
      dc: summaryStabilizeDC(failures, successes),
    }),
  ];
  if (patient.conditions.bleeding > 0) {
    lines.push(
      game.i18n.localize("FALLOUT.FirstAid.stabilizeBleeding", {
        levels: patient.conditions.bleeding,
      }),
    );
  }
  if (check.succeeded) {
    await target.update({
      "system.resources.hp.value": 1,
      "system.resources.deathSaves.successes": 0,
      "system.resources.deathSaves.failures": 0,
    });
    lines.push(
      game.i18n.localize("FALLOUT.FirstAid.deathSavesCleared", { successes, failures }),
    );
  }
  await say(medic, lines);

  return { dc, rolled: check.rolled, succeeded: check.succeeded, apCost: FIRST_AID_AP_COST };
}

// ===========================================================================
// The pg 86 medical kits
// ===========================================================================

export interface MedicalKitReport {
  kind: MedicalKitKind;
  action: MedicalKitAction;
  /** Reported, never deducted — 0 for the two timed actions (pg 86). */
  apCost: number;
  /** Minutes the action takes, 0 for the two AP-priced ones (pg 86). */
  minutes: number;
  /** Uses this kit has spent, after this one. */
  usesSpent: number;
  /** Uses the kit holds in total (pg 86: one, or three for a bag). */
  usesTotal: number;
  /** The supplies ran out on this action, so a kit was consumed. */
  exhausted: boolean;
  hitPointsHealed: number;
  bleedingRemoved: number;
  /** Pg 133 turned the healing into shed Bleeding levels instead. */
  redirected: boolean;
}

/** Uses this kit has already spent, from the flag the last use wrote. */
function kitUsesSpent(item: FoundryItem): number {
  const flag = item.getFlag(SYSTEM_ID, "kitUses");
  return typeof flag === "number" && Number.isFinite(flag) ? Math.max(0, Math.floor(flag)) : 0;
}

/**
 * Charge the kit one action, and consume it when the supplies run out.
 *
 * The count lives in an item **flag** rather than a schema field, because the
 * aid data model has no "uses" column and `src/data/**` is out of scope here. A
 * flag round-trips on an owned item, survives a world reload, and costs no
 * migration — the same trade `grappledBy` makes on an actor.
 *
 * `quantity` is how many kits are carried, so exhausting one decrements it and
 * resets the counter for the next one in the bag. At zero the item is empty and
 * `useAid`'s existing guard already refuses it.
 */
async function spendKitUse(
  item: FoundryItem,
  kind: MedicalKitKind,
): Promise<{ spent: number; total: number; exhausted: boolean }> {
  const total = MEDICAL_KIT_USES[kind];
  const spent = kitUsesSpent(item) + 1;
  const exhausted = spent >= total;
  const quantity = (item.system as AidData).quantity;
  await item.update({
    ...(exhausted ? { "system.quantity": Math.max(0, quantity - 1) } : {}),
    [`flags.${SYSTEM_ID}.kitUses`]: exhausted ? 0 : spent,
  });
  return { spent, total, exhausted };
}

/**
 * Use a First Aid Kit or a Doctor's Bag (pg 86).
 *
 * > You can use this kit on yourself or another creature so long as they are
 * > next to you. When you use it, choose one of the following actions.
 *
 * Four actions, none of which rolls anything — that is what the equipment route
 * buys over the Medicine check above, and what it pays for in supplies.
 *
 * ## What this decides, and why
 *
 * - **An action that cannot do anything is refused rather than wasted.** The
 *   book never says what happens when you Tourniquet a creature that is not
 *   bleeding or hand a Pain Killer to somebody standing up; it also never says
 *   the supplies are spent regardless. An 80-cap item destroyed by a misclick is
 *   the worse of the two silences to guess wrong on, so the action refuses and
 *   the kit keeps its use. Set Bone is the exception — see below.
 * - **Pain Killer answers to the pg 133 bleeding redirect; stabilising does
 *   not.** Pg 86 says "**heal** a dying creature 1 hit point", and pg 133 says a
 *   healed bleeding creature gains no hit points. So a Pain Killer given to a
 *   bleeding dying creature sheds two levels of Bleeding and leaves them at 0.
 *   That reads badly, and it is the printed rule: the carve-out this project
 *   ruled for (`packs-src/V21-NOTES-first-aid.md` F4) is specifically about
 *   pg 131 *stabilising*, which sets itself against healing in its own opening
 *   sentence. Pg 86 uses the word "heal" and has no such contrast. The card says
 *   so, names the Medicine route that does work, and invites the overrule.
 * - **The 5-foot range is reported, not enforced.** Nothing in this system reads
 *   token positions (ROADMAP D3), which is the same answer `endBleeding` gives.
 * - **AP is reported, never deducted** (ROADMAP item 14), and the two
 *   ten-minute actions are not AP at all.
 *
 * Returns null when the item is not a kit, the action is not one it offers, or
 * there was nothing for the action to do.
 */
export async function useMedicalKit(
  medic: FoundryActor,
  medicSystem: CharacterData,
  item: FoundryItem,
  target: FoundryActor,
  action: MedicalKitAction,
): Promise<MedicalKitReport | null> {
  const kind = medicalKitKind(item.name);
  if (kind === null) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.FirstAid.notAKit", { item: item.name }));
    return null;
  }
  if (!MEDICAL_KIT_ACTIONS[kind].includes(action)) {
    // Set Bone is printed in the Doctor's Bag entry only (pg 86).
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.FirstAid.kitLacksAction", {
        item: item.name,
        action: game.i18n.localize(`FALLOUT.FirstAid.kitActions.${action}`),
      }),
    );
    return null;
  }
  if ((item.system as AidData).quantity <= 0) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.Aid.empty", { item: item.name }));
    return null;
  }

  const patient = target.system as CharacterData;
  const timed = action === "stitchWounds" || action === "setBone";
  const lines: string[] = [];
  const updates: Record<string, unknown> = {};
  let hitPointsHealed = 0;
  let bleedingRemoved = 0;
  let redirected = false;

  if (action === "tourniquet") {
    // "Spend 6 AP and remove up to two levels of bleeding" (pg 86). No check,
    // and only two levels — the DC 15 Medicine check on pg 21/23 removes every
    // level for the same 6 AP. That asymmetry is the book's.
    const floor = patient.derived.conditionFloors.bleeding ?? 0;
    const relief = tourniquetRelief(patient.conditions.bleeding, floor);
    if (patient.conditions.bleeding <= 0) {
      ui.notifications.info(
        game.i18n.localize("FALLOUT.FirstAid.notBleeding", { target: target.name }),
      );
      return null;
    }
    if (relief.floorBlocked) {
      // Every remaining level is locked by a disease (pg 120), so there is
      // nothing for the tourniquet to take off and no reason to spend the kit.
      ui.notifications.warn(
        game.i18n.localize("FALLOUT.FirstAid.floorBlocked", {
          target: target.name,
          levels: relief.levels,
        }),
      );
      return null;
    }
    bleedingRemoved = relief.removed;
    updates["system.conditions.bleeding"] = relief.levels;
    lines.push(
      game.i18n.localize("FALLOUT.FirstAid.tourniquetDone", {
        target: target.name,
        levels: relief.removed,
        max: TOURNIQUET_BLEEDING_LEVELS,
        remaining: relief.levels,
      }),
    );
  } else if (action === "painKiller") {
    // "Spend 6 AP to heal a dying creature 1 hit point" (pg 86).
    if (!isDying(patient.resources.hp.value)) {
      ui.notifications.info(
        game.i18n.localize("FALLOUT.FirstAid.notDying", { target: target.name }),
      );
      return null;
    }
    const gain = restoreHitPoints(target, patient, PAIN_KILLER_HIT_POINTS);
    hitPointsHealed = gain.restored;
    bleedingRemoved = gain.bleedingShed;
    redirected = gain.redirected;
    Object.assign(updates, hitPointUpdates(gain));
    lines.push(...gain.notes);
    if (gain.redirected) {
      lines.push(game.i18n.localize("FALLOUT.FirstAid.painKillerRedirected", { target: target.name }));
    } else {
      lines.push(
        game.i18n.localize("FALLOUT.FirstAid.painKillerDone", {
          target: target.name,
          hp: gain.restored,
        }),
      );
      // At 1 hit point the creature is no longer dying, so a stale tally would
      // carry silently into the next time it drops. The same inference
      // `stabilizeCreature` makes, labelled the same way: pg 86 says nothing
      // about death saves, and pg 131's own comparable outcome clears them.
      if (gain.restored > 0) {
        updates["system.resources.deathSaves.successes"] = 0;
        updates["system.resources.deathSaves.failures"] = 0;
        lines.push(
          game.i18n.localize("FALLOUT.FirstAid.deathSavesCleared", {
            successes: patient.resources.deathSaves.successes,
            failures: patient.resources.deathSaves.failures,
          }),
        );
      }
    }
  } else if (action === "stitchWounds") {
    // "Spend 10 minutes and heal a creature with a number of hit points equal
    // to double their healing rate + your medicine skill bonus" (pg 86).
    const base = stitchWoundsHitPoints(
      patient.derived.healingRate,
      medicSystem.derived.skillBonuses.medicine,
    );
    // Efficient Diagnosis (pg 38) is the one perk that keys off this action
    // rather than off a roll, and its "on another creature" clause is literal.
    const ranks = perkRanks(medic, EFFICIENT_DIAGNOSIS);
    const perkBonus = efficientDiagnosisBonus(ranks, medic.id !== target.id);
    const wanted = base + perkBonus;
    const full =
      patient.resources.hp.value >= patient.derived.hpHealableMax &&
      patient.conditions.bleeding <= 0;
    if (wanted <= 0 || full) {
      // Nothing to heal and nothing to redirect into: the kit keeps its use.
      ui.notifications.info(
        game.i18n.localize("FALLOUT.FirstAid.stitchNothing", { target: target.name }),
      );
      return null;
    }
    const gain = restoreHitPoints(target, patient, wanted);
    hitPointsHealed = gain.restored;
    bleedingRemoved = gain.bleedingShed;
    redirected = gain.redirected;
    Object.assign(updates, hitPointUpdates(gain));
    lines.push(...gain.notes);
    if (!gain.redirected) {
      lines.push(
        game.i18n.localize("FALLOUT.FirstAid.stitchDone", {
          target: target.name,
          hp: gain.restored,
          rate: patient.derived.healingRate,
          medicine: medicSystem.derived.skillBonuses.medicine,
        }),
      );
    }
    if (perkBonus > 0) {
      lines.push(
        game.i18n.localize("FALLOUT.FirstAid.efficientDiagnosis", {
          ranks: Math.min(ranks, 3),
          hp: perkBonus,
        }),
      );
    }
  } else {
    // Set Bone (pg 86, Doctor's Bag only): "Spend 10 minutes and a creature
    // with the Broken Arm or Broken Leg condition may remove it."
    //
    // **Half of this now has something to remove.** Broken Arm is the pg 129 arm
    // row's fourth condition, and since the limb conditions became real effects
    // it is a marker on the target flagged "until treated with a doctor's bag" —
    // which is this action, and only this action. `treatLimbConditions` clears
    // it and reports how many went.
    //
    // **The other half is still not a thing.** "Broken Leg" appears on pg 86 and
    // nowhere else in the book: the leg row's fourth condition is Leg Cripple,
    // which is not the same condition under another name — it is removed by a
    // full heal, a trigger this paragraph never mentions. So Set Bone clears
    // what the book defines and leaves the undefined half where it has always
    // been left, with the table, rather than inventing an entry to satisfy a
    // name that has no definition.
    const treated = await treatLimbConditions(target);
    lines.push(
      game.i18n.localize(
        treated > 0 ? "FALLOUT.FirstAid.setBoneTreated" : "FALLOUT.FirstAid.setBoneDone",
        {
          target: target.name,
          minutes: MEDICAL_KIT_MINUTES,
          count: treated,
        },
      ),
    );
  }

  if (Object.keys(updates).length > 0) await target.update(updates);
  const supplies = await spendKitUse(item, kind);

  await say(medic, [
    game.i18n.localize("FALLOUT.FirstAid.kitUsed", {
      item: item.name,
      target: target.name,
      action: game.i18n.localize(`FALLOUT.FirstAid.kitActions.${action}`),
      cost: timed
        ? game.i18n.localize("FALLOUT.FirstAid.kitMinutes", { minutes: MEDICAL_KIT_MINUTES })
        : game.i18n.localize("FALLOUT.FirstAid.kitAp", { ap: MEDICAL_KIT_AP }),
      feet: FIRST_AID_RANGE_FEET,
    }),
    ...lines,
    // Timed use costs no AP at all (pg 86), so nothing is charged for it.
    ...(await apLine(medic, timed ? 0 : MEDICAL_KIT_AP)),
    game.i18n.localize(
      supplies.exhausted ? "FALLOUT.FirstAid.kitExhausted" : "FALLOUT.FirstAid.kitSupplies",
      { item: item.name, spent: supplies.spent, total: supplies.total },
    ),
  ]);

  return {
    kind,
    action,
    apCost: timed ? 0 : MEDICAL_KIT_AP,
    minutes: timed ? MEDICAL_KIT_MINUTES : 0,
    usesSpent: supplies.spent,
    usesTotal: supplies.total,
    exhausted: supplies.exhausted,
    hitPointsHealed,
    bleedingRemoved,
    redirected,
  };
}

export {
  END_BLEEDING_DC,
  FIRST_AID_AP_COST,
  MEDICAL_KIT_ACTIONS,
  MEDICAL_KIT_AP,
  MEDICAL_KIT_USES,
  medicalKitKind,
  stabilizeDC,
  stitchWoundsHitPoints,
  summaryStabilizeDC,
  tourniquetRelief,
};
