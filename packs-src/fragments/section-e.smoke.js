// ------------------------------------------------------- ROADMAP section E
// The five dangling ends: Escape clearing Restrained (pg 126), Reactive Plates
// reaching an attacker (pg 59), the VATS matrix overlay reaching a real roll
// (pg 59), the pg 133 bleeding-healing redirect, and the pg 86 medical kits.
//
// Paste into scripts/smoke.mjs inside the main try, where `step`, `actor`,
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
  const redirected = api.restoreHitPoints(patient.system, 99);
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
  const plain = api.restoreHitPoints(patient.system, 5);
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
