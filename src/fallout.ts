/**
 * Fallout TTRPG (Arcane Arcade v2.1) — system entry point for Foundry VTT v14.
 */

import { CharacterData } from "./data/character";
import {
  AidData,
  AmmoData,
  ArmorData,
  GearData,
  PerkData,
  TraitData,
  WeaponData,
} from "./data/items";
import { FalloutCharacterSheet } from "./sheets/character-sheet";
import { FalloutNpcSheet } from "./sheets/npc-sheet";
import { FalloutItemSheet } from "./sheets/item-sheet";
import { applyDamage, describeDamageResult } from "./combat/damage";
import { registerCombatHooks, spendActionPoints } from "./combat/turns";
import {
  fullHealShortCircuit, registerShortCircuitHooks, rerouteShortCircuit,
  shortCircuitLevels, wetShortCircuit,
} from "./actions/short-circuit";
import {
  applyTargetedCondition, fullHealLimbConditions, limbConditions,
  registerTargetedConditionHooks, treatLimbConditions,
} from "./actions/targeted-conditions";
import {
  isApplicable as limbConditionApplicable,
  targetedCondition,
} from "./rules/targeted-conditions";
import { promptObjectItem } from "./sheets/object-picker";
import { effectiveMode } from "./dice/core";
import {
  capacitorBoost,
  payableCapacitor,
  rollAbility,
  rollAddictionCheck,
  rollAttack,
  rollAutomaticBurst,
  rollBlindAttack,
  rollDamage,
  rollDeathSave,
  rollFrightenedCheck,
  rollSkill,
} from "./dice/rolls";
import { currentGroupSneak, currentPartyNerve } from "./rules/party";
import { applyCurrentTheme, registerThemeSettings } from "./theme";
import { applyLocalArt, indexLocalArt, registerArtHooks, registerArtSettings } from "./art";
import { useAid } from "./actions/use-aid";
import { clearConsumableEffects, clearExpiredEffects } from "./actions/consumable-effects";
import {
  gainRadiationLevels,
  removeRadiationLevels,
  rollGhoulification,
  rollRadiationCheck,
} from "./actions/radiation";
import {
  advanceDiseases,
  contractDisease,
  contractRandomDisease,
  diseaseDamageReactions,
  removeDisease,
  sleepDiseases,
  treatDisease,
} from "./actions/diseases";
import { endBlocking, isBlocking, startBlocking } from "./actions/blocking";
import { advanceDrinks, passDay, rest } from "./actions/rest";
import { repairItem } from "./actions/repair";
import { effectCondition, effectConditionNegated, setSituation, situationalEffects, syncSituations } from "./actions/situations";
import { sheetPartials } from "./sheets/panel-registry";
import {
  BLEEDING_HEAL_REDIRECT_LEVELS,
  bleedingRedirectsHealing,
  hitPointUpdates,
  restoreHitPoints,
  restoreStamina,
  staminaRegainBlocked,
} from "./actions/healing";
import {
  checkTurnOverheat,
  clearOverheat,
  coolAtTurnStart,
  damageFusionCore,
  drainAllottedTime,
  overheat,
  powerArmorItem,
  swapFusionCore,
  togglePowerArmor,
} from "./actions/power-armor";
import {
  DEFENSIVE_BLOCK_DT,
  MOD_GRANTED_PROPERTIES,
  RELOAD_AP_SPEEDLOADER,
  effectiveSpecial,
  fullReloadAp,
  grantedProperties,
  manualReloadRounds,
  parseKeywords,
  reloadCost,
  reloadDecayInterval,
  weaponKeywords,
} from "./rules/weapons";
import {
  announceLuckyCharms, luckyCharmConflict, luckyCharmWeapons,
  attachMod, detachMod, modHeld, modStacks, modKeyFrom,
} from "./actions/mods";
import { hasPerk, perkRanks } from "./actions/perks";
import {
  describeWeather,
  frigidWaterExposure,
  getWeather,
  recoverExposure,
  rollHazardCheck,
  rollLightningStrike,
  runZoneChecks,
  rangeMultiplier,
  setWeather,
  tickEnvironment,
} from "./actions/environment";

import { bestCover, coverAcBonus, explosiveExposure, hitsCoveringCreature, canTakeCover, TAKE_COVER_AP } from "./rules/cover";
import { CRIT_IMPOSSIBLE, critThreshold, rangeBand } from "./rules/formulas";
import {
  halvesRange,
  RANGE_HALVING_LIMBS,
  targetedApCost,
  targetedConditionCount,
} from "./rules/targeted";
import {
  helpBonus,
  readyRecycledAP,
  readyTotalApCost,
  unarmedContestDC,
  unarmedContestSucceeds,
  unarmedStrikeApCost,
} from "./rules/grapple";
import {
  consumeHelp,
  ESCAPABLE_STATUSES,
  escapeGrapple,
  grapple,
  grappledBy,
  helpAlly,
  lapseReady,
  pendingHelp,
  readiedActions,
  readyAction,
  triggerReady,
  unarmedStrike,
} from "./actions/combat-actions";
import {
  canStabilize,
  efficientDiagnosisBonus,
  isDying,
  MEDICAL_KIT_ACTIONS,
  MEDICAL_KIT_AP,
  MEDICAL_KIT_USES,
  medicalKitKind,
  stabilizeDC,
  stitchWoundsHitPoints,
  summaryStabilizeDC,
  tourniquetRelief,
} from "./rules/first-aid";
import { endBleeding, stabilizeCreature, useMedicalKit } from "./actions/first-aid";
import { craftDC, craftOutcome, craftsAutomatically, parseCraftTime, powerArmorSchedule } from "./rules/crafting";
import { craftItem } from "./actions/crafting";
import {
  flyWithJetPack,
  optimizedBracersStrike,
  overclockOverheat,
  powerArmorReflection,
  powerArmorShielding,
  powerArmorTurnStart,
  queryInternalDatabase,
  spendAllottedTime,
  syncPowerArmorEffects,
  targetedApWithVats,
  toggleTeslaCoils,
  triggerExplosiveVent,
} from "./actions/power-armor";

import {
  awardExperience, applyLevel, spendSkillPoints, spendPerkPoint, undoSpend,
  readMagazine, clearMagazineBonuses, restProgression, purchase, resetDiscount, budgetFor,
} from "./actions/progression";
import {
  experienceAward, catchUpGains, magazineSkill, magazineReadTime, quotePurchase, progressionBudget,
} from "./rules/progression";
import {
  reportClimb, reportSwim, reportSprint, jump, fall,
  holdBreath, spendBreath, breathPenalty, tickSuffocation, reachAir, heldBreath, travel,
} from "./actions/movement";
import {
  climbApPer5Feet, climbRoundLimit, swimApPer5Feet, swimRoundLimit, WATERS,
  breathSeconds, breathAfterPenalties, suffocationRounds,
  jumpLimitFeet, jumpApCost, jumpOverreachDC, jumpPlan,
  sprint, sprintDistanceFeet,
  fallDamageDice, fallDamageFormula, fallDistanceAfterTurns, fallOutcome,
  travelHourLimit, passiveSneak, maxTravelDistanceMiles, travelPlan, TRAVEL_PACES,
} from "./rules/movement";
import {
  hide, hiddenState, revealHidden, searchFor, determineSurprise, isSurprised, endSurprise,
  sneakAttackPosture, dodge, dodgeState, endDodge, shove, takeCover, takingCover,
  standUp, stowWeapon, equipWeapon, heldWeapons, passiveSenseOf,
  breakHidingOnCover, cannotSpendApToMove, leaveCover, revealAfterAttacking, useDodgeMove,
  reportConcealedTargeting, markTarget, markedByTracking, consumeTargetMark,
  concealmentPresentedTo,
} from "./actions/stealth";
import {
  setSceneLight, getSceneLight, getSenses, setSenses, describeObscurement,
  applyVisionCutoffs, clearVisionCutoffs, visionCutoffsApplied,
  igniteFlames, spreadFlameAreas, burnFlameOccupants, extinguishFlames,
  extinguishAllFlames, describeFlames, flameRegions, obscurementAt, weatherBands,
  flameAreaOf, reportObscurement,
  blindsightModeConfig,
} from "./actions/light";
import {
  bandObscurement, blindsightReaches, flameDamageDice, flameDamageFormula,
  flameRadiusFeet, nightvisionObscurement, obscurementEffect, obscurementOfLight,
  perceivedObscurement, spreadFlames, visionRanges, worstObscurement,
  roundsToNextFlameDie, flamesAtMaximum,
} from "./rules/light";
import {
  beatsPassiveSense, canHide, canSneakAttack, detectionOutcome, hideDC,
  hideOutcomes, revealedByAttacking, surpriseOutcomes,
  targetingThroughConcealment, blindAttackDC, blindAttackApplies, SPRAY_AND_PRAY,
  withinMarkRange, TARGET_MARK_AP_COST,
} from "./rules/stealth";
import {
  bestShoveDefense, COMBAT_ACTION_AP, dodgeApplies, dodgeBenefitLost,
  shoveAllowed, shoveSucceeds, weaponsDroppedByEquipping,
} from "./rules/actions";
import {
  raceAbilityScore, raceCarryLoadBonus, raceStrengthScore, defectiveStrainIntelligence,
  mutantVariantOf, hasStealthField, stealthFieldPerceptionCost, SUPER_MUTANT_VARIANTS,
} from "./rules/races";
import {
  raiseStealthField, endStealthField, isStealthFieldActive, stealthFieldUsesToday,
  stealthFieldPerceptionPenalty, resetStealthFieldUses, clearStealthFieldDecay,
} from "./actions/stealth-field";
import { robotReattachCost, robotTraitsFor, robotTypeOf, isRobotSubType, ROBOT_SUB_TYPES as ROBOT_SUB_TYPE_KEYS, ROBOT_TRAITS, fuelClockRuns, fuelLimitHours, fuelCheckDC, FUEL_WEEK_HOURS, FUEL_CORE_HOURS } from "./rules/robots";
import { bulkyNote, decayItem, extraDecayLevels } from "./actions/decay";
import { FAULTY_CIRCUITRY, FAULTY_REPAIR_DC, isAddictedTo, removeAddiction } from "./rules/chems";
import { decaysExtra, healingPowderWorks, SUPER_MUTANT_STRENGTH_FLOOR, SUPER_MUTANT_CARRY_LOAD } from "./rules/races";
import { limbKeysFor, hasLimb, limbProfile, limbRowKey, limbLabelKey, isSeverable, severeInjuryFor, LIMB_KEYS, LIMB_PROFILES, type PrintedLimbKey } from "./rules/targeted";
import { advanceFuel, clearFaultyProgramming, fillFuelTank, loadFuelCore, reattachLimb } from "./actions/robots";
import {
  WEAPON_MODS, MOD_KEYS, RANGED_MOD_KEYS, MELEE_MOD_KEYS,
  isModKey, slotsUsed, ceasesFunction, swapMinutes, modCaps, modEligibility,
  isRevolver, hasProperty, silences, RANGED_MOD_SLOTS, MELEE_MOD_LIMIT,
  scopeCloseRange, upgradedDamageBonus,
  MOD_CHOICES, MOD_CHOICE_KEYS, applyMods,
} from "./rules/mods";
import {
  consumeJunk, junkHeld, junkStacks, recipeLines, spendRecipeMaterials,
} from "./actions/junk";
import { JUNK_TYPES, junkTypeKey } from "./data/items";
import { applyBackground, clearBackground, appliedBackground } from "./actions/backgrounds";
import { BACKGROUNDS, getBackground, kitForRace, grantableEntries, reportedEntries } from "./rules/backgrounds";
import {
  armAndThrowOutcome, throwbackOutcome, armDC, armsAutomatically, armOutcome, disarmOutcome,
  throwDistanceFeet, printedThrowDistanceFeet, damageBandAt, senseLossRounds, destructiveDie,
  detonatesFromDamage, outcomeWithProperties, explosiveByName, EXPLOSIVES,
} from "./rules/explosives";

const SYSTEM_ID = "fallout-ttrpg";

/** Book conditions surfaced as token status effects (core SVG icons). */
const STATUS_EFFECTS: { id: string; name: string; img: string }[] = [
  { id: "dazed", name: "FALLOUT.Statuses.dazed", img: "icons/svg/daze.svg" },
  { id: "blinded", name: "FALLOUT.Statuses.blinded", img: "icons/svg/blind.svg" },
  { id: "deafened", name: "FALLOUT.Statuses.deafened", img: "icons/svg/deaf.svg" },
  { id: "poisoned", name: "FALLOUT.Statuses.poisoned", img: "icons/svg/poison.svg" },
  { id: "frightened", name: "FALLOUT.Statuses.frightened", img: "icons/svg/terror.svg" },
  { id: "grappled", name: "FALLOUT.Statuses.grappled", img: "icons/svg/net.svg" },
  // Restrained is defined on pg 135 and ended by the Escape action, but had no
  // status to toggle until the combat actions landed.
  { id: "restrained", name: "FALLOUT.Statuses.restrained", img: "icons/svg/padlock.svg" },
  // Hiding and Surprise are marker effects the stealth actions manage; these
  // put them on the token HUD so a GM can see the state they are adjudicating.
  { id: "hidden", name: "FALLOUT.Statuses.hidden", img: "icons/svg/mystery-man.svg" },
  { id: "surprised", name: "FALLOUT.Statuses.surprised", img: "icons/svg/stoned.svg" },
  { id: "burning", name: "FALLOUT.Statuses.burning", img: "icons/svg/fire.svg" },
  { id: "bleeding", name: "FALLOUT.Statuses.bleeding", img: "icons/svg/blood.svg" },
  { id: "shock", name: "FALLOUT.Statuses.shock", img: "icons/svg/paralysis.svg" },
  { id: "slowed", name: "FALLOUT.Statuses.slowed", img: "icons/svg/downgrade.svg" },
  { id: "encumbered", name: "FALLOUT.Statuses.encumbered", img: "icons/svg/anchor.svg" },
  { id: "dying", name: "FALLOUT.Statuses.dying", img: "icons/svg/skull.svg" },
  // v2.1 (pg 134-135). Corroded was deleted this edition and became the
  // Corrosive ranged-weapon property instead.
  { id: "hypothermia", name: "FALLOUT.Statuses.hypothermia", img: "icons/svg/frozen.svg" },
  { id: "overheating", name: "FALLOUT.Statuses.overheating", img: "icons/svg/fire.svg" },
  { id: "shortCircuit", name: "FALLOUT.Statuses.shortCircuit", img: "icons/svg/lightning.svg" },
];

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initializing the Fallout TTRPG system`);

  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = CharacterData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.ammo = AmmoData;
  CONFIG.Item.dataModels.aid = AidData;
  CONFIG.Item.dataModels.perk = PerkData;
  CONFIG.Item.dataModels.trait = TraitData;
  CONFIG.Item.dataModels.gear = GearData;

  // Combat Sequence is a Perception check (pg 127), plus anything a perk or
  // trait adds — a path that only exists as of release 5.
  CONFIG.Combat.initiative = {
    formula: "1d20 + @derived.abilityMods.perception + @derived.initiativeBonus",
    decimals: 0,
  };

  // Token resource bars.
  CONFIG.Actor.trackableAttributes = {
    character: {
      bar: ["resources.hp", "resources.sp", "resources.ap"],
      value: ["derived.passiveSense"],
    },
    npc: {
      bar: ["resources.hp", "resources.sp", "resources.ap"],
      value: ["derived.passiveSense"],
    },
  };

  // Token status effects for the book's conditions. v14 made statusEffects
  // an object (array form is BC-shimmed) — support both, and NEVER add an id
  // core already ships (burning, bleeding, prone, …) or Foundry errors on
  // the duplicate at world load.
  const config = CONFIG as unknown as { statusEffects: unknown };
  if (Array.isArray(config.statusEffects)) {
    const existing = new Set(
      (config.statusEffects as { id?: string }[]).map((effect) => effect.id),
    );
    config.statusEffects.push(...STATUS_EFFECTS.filter((effect) => !existing.has(effect.id)));
  } else {
    const target = config.statusEffects as Record<string, unknown>;
    for (const effect of STATUS_EFFECTS) {
      if (!(effect.id in target)) target[effect.id] = { name: effect.name, img: effect.img };
    }
  }

  // Core gates every sight-typed detection mode on
  // `CONFIG.specialStatusEffects.BLIND`, which ships as "blind". This system
  // registers "blinded" — core already owns "blind", so the init filter above
  // drops ours if we reuse the id. The result was that a Blinded creature here
  // saw perfectly on the canvas: the condition applied its disadvantage and
  // nothing else. Point the constant at the id we actually register.
  // Verified on 14.365; see docs/foundry-v14-notes.md.
  (CONFIG as unknown as { specialStatusEffects: Record<string, string> })
    .specialStatusEffects.BLIND = "blinded";

  // Blindsight (pg 118-119) as a canvas detection mode, so a creature that has
  // it actually sees in the dark instead of merely saying so on its sheet.
  //
  // `DetectionMode` is a plain `DataModel` on 14.365 — schema id/label/type/
  // walls/angle/tokenConfig — and its base `_canDetect` is permissive, so
  // blindsight needs no subclass: an instance registered under
  // `CONFIG.Canvas.detectionModes` is the whole registration. `type: 3` is
  // `DETECTION_TYPES.OTHER` (SIGHT 0, SOUND 1, MOVE 2, OTHER 3), which is what
  // keeps it out of the BLIND gate above — a blinded creature should still have
  // its blindsight.
  //
  // ⚠ Read off the deployed `foundry.mjs` rather than exercised on a live
  // canvas: the smoke suite could not log in when this landed. The shape is
  // verified, the *behaviour* is not, which is why it is wrapped — a wrong
  // guess here must not take the whole system's init down with it.
  // Tracked in docs/ROADMAP.md as needing a live check.
  try {
    const canvasConfig = (CONFIG as unknown as {
      Canvas?: { detectionModes?: Record<string, unknown> };
    }).Canvas;
    const DetectionMode = (
      foundry as unknown as { canvas: { perception: { DetectionMode: new (data: object) => unknown } } }
    ).canvas.perception.DetectionMode;
    if (canvasConfig?.detectionModes && typeof DetectionMode === "function") {
      const config = blindsightModeConfig();
      // A subclass, not a bare instance: the base `_canDetect` on 14.365 (read
      // verbatim off the deployed foundry.mjs) opens with
      //
      //   if ( this.walls && visionSource.blinded.darkness ) return false;
      //
      // — so a bare walled mode dies inside a darkness source, which is the
      // one place blindsight most needs to work. Blindsight is not sight
      // (type OTHER): darkness-blindness must not gate it. The rest of the
      // base body is preserved: for a non-SIGHT mode the two `isSight` clauses
      // are dead, leaving only the BURROW gates (source and target), which are
      // kept — blindsight does not reach through the ground. The live smoke
      // step a5 asserts exactly this survives a darkness source.
      interface DetectsLike {
        object: { document: { hasStatusEffect(id: string): boolean } };
      }
      interface BlindableSource {
        los?: { config?: Record<string, unknown> };
        blinded?: { darkness?: boolean };
        data?: { disabled?: boolean };
        suppressed?: boolean;
      }
      const statusEffects = (CONFIG as unknown as {
        specialStatusEffects: Record<string, string>;
      }).specialStatusEffects;
      const burrow = statusEffects.BURROW ?? "burrow";
      const Blindsight = class extends (DetectionMode as new (data: object) => object) {
        _canDetect(visionSource: DetectsLike, target: unknown): boolean {
          if (visionSource.object.document.hasStatusEffect(burrow)) return false;
          const document = (target as { document?: { hasStatusEffect?(id: string): boolean } } | null)
            ?.document;
          if (typeof document?.hasStatusEffect === "function" &&
              document.hasStatusEffect(burrow)) {
            return false;
          }
          return true;
        }

        /**
         * Darkness clips the *polygon*, not just `_canDetect` — which is why
         * overriding `_canDetect` alone did not rescue blindsight, and the live
         * smoke step a5 caught it. `PointVisionSource#_getPolygonConfiguration`
         * on 14.365 reads:
         *
         *   radius: disabled || suppressed ? 0
         *         : (blinded.darkness ? externalRadius : canvas.dimensions.maxR)
         *
         * so inside a negative AmbientLight the source's LOS collapses to the
         * token's own footprint and every point beyond it fails the wall test,
         * whatever this mode says it can detect.
         *
         * The collision is therefore re-run against a config with the radius
         * darkness took away. Walls still block — `_testCollision` walks them
         * exactly as before — and `_testRange` still holds the creature to its
         * printed blindsight radius. Only the darkness clipping is undone, and
         * only when darkness is the cause: a vision source that is genuinely
         * disabled or suppressed keeps its 0 and stays blind.
         */
        _testLOS(visionSource: BlindableSource, _mode: unknown, _target: unknown, test: unknown): boolean {
          const config: Record<string, unknown> = {
            ...(visionSource.los?.config ?? {}),
            // `angle: false` on this mode means "not constrained by the vision
            // angle", which is what the base class expresses as 360 here.
            angle: 360,
          };
          const clipped =
            visionSource.blinded?.darkness === true &&
            visionSource.data?.disabled !== true &&
            visionSource.suppressed !== true;
          if (clipped) {
            // `canvas` is a runtime global the ambient typings do not declare.
            config.radius = (globalThis as unknown as {
              canvas: { dimensions: { maxR: number } };
            }).canvas.dimensions.maxR;
          }
          // Called through the constructor rather than detached, so `this`
          // inside core's static stays the class it belongs to.
          const owner = this.constructor as unknown as {
            _testCollision(source: unknown, test: unknown, config: unknown): boolean;
          };
          return !owner._testCollision(visionSource, test, config);
        }
      };
      canvasConfig.detectionModes[config.id] = new Blindsight(config);
    }
  } catch (error) {
    console.error(`${SYSTEM_ID} | blindsight detection mode not registered`, error);
  }

  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet(SYSTEM_ID, FalloutCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "FALLOUT.SheetLabels.character",
  });
  Actors.registerSheet(SYSTEM_ID, FalloutNpcSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "FALLOUT.SheetLabels.npc",
  });
  Items.registerSheet(SYSTEM_ID, FalloutItemSheet, {
    makeDefault: true,
    label: "FALLOUT.SheetLabels.item",
  });

  registerThemeSettings();
  registerArtSettings();
  registerArtHooks();
  registerCombatHooks();
  registerShortCircuitHooks();
  registerTargetedConditionHooks();

  // Sheet panels ship their own partials, and so does the condition track the
  // character sheet and the NPC statblock share. Core registers a partial under
  // its full path (verified on 14.365: `templates/ui/players.hbs` and friends
  // are keyed that way), which is how both templates include them.
  void foundry.applications.handlebars.loadTemplates(sheetPartials());

  // Scripting/smoke-test API.
  (globalThis as Record<string, unknown>).falloutTTRPG = {
    applyDamage,
    rollAbility,
    rollSkill,
    rollDeathSave,
    rollFrightenedCheck,
    rollBlindAttack,
    rollAddictionCheck,
    rollAttack,
    rollDamage,
    spendActionPoints,
    rerouteShortCircuit, wetShortCircuit, fullHealShortCircuit, shortCircuitLevels,
    applyTargetedCondition, limbConditions, fullHealLimbConditions, treatLimbConditions,
    targetedCondition, limbConditionApplicable, promptObjectItem,
    useAid,
    currentPartyNerve,
    currentGroupSneak,
    applyLocalArt,
    indexLocalArt,
    clearExpiredEffects,
    clearConsumableEffects,
    gainRadiationLevels,
    removeRadiationLevels,
    rollRadiationCheck,
    rollGhoulification,
    contractDisease,
    contractRandomDisease,
    treatDisease,
    removeDisease,
    advanceDiseases,
    sleepDiseases,
    diseaseDamageReactions,
    getWeather,
    setWeather,
    describeWeather,
    tickEnvironment, rangeMultiplier,
    rollLightningStrike,
    runZoneChecks,
    rollHazardCheck,
    frigidWaterExposure,
    recoverExposure,
    startBlocking,
    endBlocking,
    isBlocking,
    rollAutomaticBurst,
    rest,
    passDay,
    advanceDrinks,
    repairItem,
    parseKeywords,
    reloadCost,
    reloadDecayInterval,
    manualReloadRounds,
    syncSituations,
    setSituation,
    situationalEffects,
    restoreStamina,
    staminaRegainBlocked,
    togglePowerArmor,
    swapFusionCore,
    drainAllottedTime,
    overheat,
    checkTurnOverheat,
    coolAtTurnStart,
    clearOverheat,
    damageFusionCore,
    powerArmorItem,
    // --- release 7: cover and range bands
    bestCover,
    coverAcBonus,
    explosiveExposure,
    hitsCoveringCreature,
    canTakeCover,
    TAKE_COVER_AP,
    rangeBand,
    critThreshold, CRIT_IMPOSSIBLE,
    // --- release 7: grapple and the v2.1 combat actions
    grapple,
    escapeGrapple,
    grappledBy,
    unarmedStrike,
    helpAlly,
    consumeHelp,
    pendingHelp,
    readyAction,
    triggerReady,
    lapseReady,
    readiedActions,
    unarmedContestDC,
    unarmedContestSucceeds,
    helpBonus,
    readyTotalApCost,
    readyRecycledAP,
    unarmedStrikeApCost,
    // --- release 7: first aid
    endBleeding,
    stabilizeCreature,
    stabilizeDC,
    summaryStabilizeDC,
    isDying,
    canStabilize,
    // --- section E: the pg 86 kits, and the pg 133 healing gate
    useMedicalKit,
    medicalKitKind,
    stitchWoundsHitPoints,
    tourniquetRelief,
    efficientDiagnosisBonus,
    MEDICAL_KIT_ACTIONS,
    MEDICAL_KIT_AP,
    MEDICAL_KIT_USES,
    restoreHitPoints,
    hitPointUpdates,
    bleedingRedirectsHealing,
    BLEEDING_HEAL_REDIRECT_LEVELS,
    ESCAPABLE_STATUSES,
    // --- release 7: crafting
    craftItem,
    craftDC,
    craftOutcome,
    craftsAutomatically,
    parseCraftTime,
    powerArmorSchedule,
    // --- release 7: Power Armor upgrades
    spendAllottedTime,
    toggleTeslaCoils,
    flyWithJetPack,
    triggerExplosiveVent,
    overclockOverheat,
    optimizedBracersStrike,
    queryInternalDatabase,
    syncPowerArmorEffects,
    powerArmorTurnStart,
    powerArmorShielding,
    powerArmorReflection,
    targetedApCost,
  targetedApWithVats,
    // --- release 8: progression, movement, stealth, light, backgrounds
    awardExperience, applyLevel, spendSkillPoints, spendPerkPoint, undoSpend,
    readMagazine, clearMagazineBonuses, restProgression, purchase, resetDiscount, budgetFor,
    experienceAward, catchUpGains, magazineSkill, magazineReadTime, quotePurchase, progressionBudget,
    reportClimb, reportSwim, reportSprint, jump, fall,
    holdBreath, spendBreath, breathPenalty, tickSuffocation, reachAir, heldBreath, travel,
    climbApPer5Feet, climbRoundLimit, swimApPer5Feet, swimRoundLimit, WATERS,
    breathSeconds, breathAfterPenalties, suffocationRounds,
    jumpLimitFeet, jumpApCost, jumpOverreachDC, jumpPlan,
    sprint, sprintDistanceFeet,
    fallDamageDice, fallDamageFormula, fallDistanceAfterTurns, fallOutcome,
    travelHourLimit, passiveSneak, maxTravelDistanceMiles, travelPlan, TRAVEL_PACES,
    hide, hiddenState, revealHidden, searchFor, determineSurprise, isSurprised, endSurprise,
    sneakAttackPosture, dodge, dodgeState, endDodge, shove, takeCover, takingCover,
    standUp, stowWeapon, equipWeapon, heldWeapons, passiveSenseOf,
    setSceneLight, getSenses, setSenses, describeObscurement,
    applyVisionCutoffs, clearVisionCutoffs,
    igniteFlames, spreadFlameAreas, burnFlameOccupants, extinguishFlames,
    applyBackground, clearBackground, appliedBackground,
    BACKGROUNDS, getBackground, kitForRace, grantableEntries, reportedEntries,
    // rules/explosives is reached from nowhere else — without this the whole
    // module is tree-shaken out of the bundle.
    armAndThrowOutcome, throwbackOutcome, armDC, armsAutomatically, armOutcome, disarmOutcome,
    throwDistanceFeet, printedThrowDistanceFeet, damageBandAt, senseLossRounds, destructiveDie,
    detonatesFromDamage, outcomeWithProperties, explosiveByName, EXPLOSIVES,
    // The stealth, light and combat-action *rules* modules, plus the action
    // entry points the first pass missed. Same lesson as the movement rules
    // (a1a0ff7), now audited mechanically: BACKLOG B1 diffs every `api.*` call
    // in scripts/smoke.mjs against this object, and these 39 were the gap.
    breakHidingOnCover, cannotSpendApToMove, leaveCover, revealAfterAttacking, useDodgeMove,
    beatsPassiveSense, canHide, canSneakAttack, detectionOutcome, hideDC,
    hideOutcomes, revealedByAttacking, surpriseOutcomes,
    bestShoveDefense, COMBAT_ACTION_AP, dodgeApplies, dodgeBenefitLost,
    shoveAllowed, shoveSucceeds, weaponsDroppedByEquipping,
    getSceneLight, visionCutoffsApplied, extinguishAllFlames, describeFlames,
    flameRegions, obscurementAt, weatherBands,
    bandObscurement, blindsightReaches, flameDamageDice, flameDamageFormula,
    flameRadiusFeet, nightvisionObscurement, obscurementEffect, obscurementOfLight,
    perceivedObscurement, spreadFlames, visionRanges, worstObscurement,
    // C5 polish: the fire readout's parser and the posting counterpart.
    flameAreaOf, reportObscurement, roundsToNextFlameDie, flamesAtMaximum,
    // C4: Super Mutant variants and the Nightkin Stealth Field.
    raceAbilityScore, raceCarryLoadBonus, raceStrengthScore, defectiveStrainIntelligence,
    mutantVariantOf, hasStealthField, stealthFieldPerceptionCost, SUPER_MUTANT_VARIANTS,
    raiseStealthField, endStealthField, isStealthFieldActive, stealthFieldUsesToday,
    stealthFieldPerceptionPenalty, resetStealthFieldUses, clearStealthFieldDecay,
    // C1/C2: robot traits and severed-limb reattachment.
    reattachLimb, robotReattachCost, robotTraitsFor, targetedConditionCount,
    halvesRange, RANGE_HALVING_LIMBS,
    // B4: the decay gate, race seams and limb profiles, exported so the suite
    // can assert the rules directly instead of only through integration paths.
    decayItem, extraDecayLevels, bulkyNote,
    decaysExtra, healingPowderWorks, SUPER_MUTANT_STRENGTH_FLOOR, SUPER_MUTANT_CARRY_LOAD,
    limbKeysFor, hasLimb, limbProfile, limbRowKey, limbLabelKey, isSeverable,
    severeInjuryFor, LIMB_KEYS, LIMB_PROFILES,
    robotTypeOf, isRobotSubType, ROBOT_TRAITS,
    robotSubTypes: ROBOT_SUB_TYPE_KEYS,
    // C3: the Handy fuel clock.
    advanceFuel, fillFuelTank, loadFuelCore,
    fuelClockRuns, fuelLimitHours, fuelCheckDC, FUEL_WEEK_HOURS, FUEL_CORE_HOURS,
    // pg 90: the robot cure for faulty programming — the addiction list's only exit.
    clearFaultyProgramming, removeAddiction, isAddictedTo, FAULTY_CIRCUITRY, FAULTY_REPAIR_DC,
    // D2: junk as documents — the consumption seam and its readers.
    consumeJunk, junkHeld, junkStacks, junkTypeKey, JUNK_TYPES,
    spendRecipeMaterials, recipeLines,
    // Conditional effects: Hoarder is the first content to use them.
    effectCondition, effectConditionNegated,
    // D3 slice 1: the weapon-mod rules layer. Same lesson as B1 and the
    // movement-rules omission — a rules module nothing exports is one nothing
    // can test, and mods.ts was reachable only through WeaponData.
    WEAPON_MODS, MOD_KEYS, RANGED_MOD_KEYS, MELEE_MOD_KEYS,
    isModKey, slotsUsed, ceasesFunction, swapMinutes, modCaps, modEligibility,
    isRevolver,
    // D3 slices 4/8/12. These three are pure and read only mod keys, so they
    // belong beside `silences()` in rules/mods.ts — they live in rolls.ts only
    // because mods.ts was another agent's file this batch. Moving them is a
    // rename plus an import, tracked in the backlog.
    scopeCloseRange, capacitorBoost, payableCapacitor, upgradedDamageBonus,
    // D3 slices 3/7/11: granted properties merged after the parse (never
    // written back — the "if it already has Destructive/Accurate" clauses
    // depend on the printed string staying printed), the Speedloader's
    // alternative reload, and the Lucky Charm scan.
    MOD_GRANTED_PROPERTIES, grantedProperties, weaponKeywords, effectiveSpecial,
    DEFENSIVE_BLOCK_DT,
    hasProperty, RELOAD_AP_SPEEDLOADER, fullReloadAp,
    luckyCharmWeapons, luckyCharmConflict, announceLuckyCharms,
    attachMod, detachMod, modHeld, modStacks, modKeyFrom,
    silences, RANGED_MOD_SLOTS, MELEE_MOD_LIMIT, MOD_CHOICES, MOD_CHOICE_KEYS, applyMods,
    // D3 slices 5/6: the Infrared Scope's targeting permission and the
    // On-Board Target Tracking mark.
    reportConcealedTargeting, markTarget, markedByTracking, consumeTargetMark,
    concealmentPresentedTo, hasPerk, perkRanks,
    targetingThroughConcealment, blindAttackDC, blindAttackApplies, SPRAY_AND_PRAY,
    withinMarkRange, TARGET_MARK_AP_COST,
    // The roll-mode resolver, so a test can assert a disadvantage counter
    // actually reaches the dice rather than only landing in derived data.
    effectiveMode,
  };
});

Hooks.once("ready", () => {
  applyCurrentTheme();
  // Index once so compendium imports find local art without a manual scan.
  void indexLocalArt();
});

// Nothing hooks updateWorldTime: Foundry retires elapsed effects itself,
// marking them expired and inactive so their changes stop applying. Deleting
// them here as well only races core's own update. See
// src/actions/consumable-effects.ts.

// GM-only "Apply to targets" button on damage rolls: runs the pg 132 pipeline
// (resist/vuln -> SP -> DT -> HP) against every targeted token.
Hooks.on("renderChatMessageHTML", (...args) => {
  const [message, html] = args as [
    { getFlag(scope: string, key: string): unknown; speaker?: ChatSpeakerData },
    HTMLElement,
  ];
  const damage = message.getFlag(SYSTEM_ID, "damage") as
    | {
        total: number;
        type: string;
        melee?: boolean;
        sneak?: boolean;
        corrosive?: boolean;
        attacker?: string;
      }
    | undefined;
  if (!damage || !game.user.isGM) return;

  // Who swung. The damage pipeline knows the defender and nothing else, and
  // exactly one printed rule needs the other end of the exchange — Reactive
  // Plates (pg 59), which throws a quarter of a melee hit back at the attacker.
  // This button is the one place both ends are in the same room: the GM has the
  // defender targeted, and the card was posted by the attacker.
  //
  // The flag is preferred over the speaker because it is set deliberately by
  // the roll paths that know they are an attack; the speaker is the fallback
  // for a damage card posted by something older or by hand. Both carry an actor
  // id, so both resolve the same way. An unlinked token's actor is not in
  // `game.actors` and will not resolve — the reflection is then simply not
  // applied, which is the same silence as before this was wired, rather than a
  // guess at whose sheet to write to.
  const attackerId = damage.attacker ?? message.speaker?.actor ?? null;
  const attacker = attackerId === null ? undefined : game.actors.get(attackerId);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "fallout-apply-damage";
  button.textContent = game.i18n.localize("FALLOUT.Damage.applyButton", {
    total: damage.total,
  });
  button.addEventListener("click", () => {
    void (async () => {
      const targets = Array.from(game.user.targets);
      if (targets.length === 0) {
        ui.notifications.warn(game.i18n.localize("FALLOUT.Damage.noTargets"));
        return;
      }
      for (const target of targets) {
        if (!target.actor) continue;
        // A sneak attack bypasses stamina and is a critical hit (pg 128); a
        // melee hit is measured against the DT a Block may have raised; a
        // Corrosive weapon decays their armor if this reaches hit points
        // (pg 69).
        // A target reflecting damage back at its attacker must not reflect it
        // at itself: a suited character who swings at their own token would
        // otherwise take the hit and the reflection of it. The book never
        // contemplates the case; refusing it is the only reading that is not
        // absurd.
        const swinger = attacker && attacker.id !== target.actor.id ? attacker : undefined;
        const result = await applyDamage(target.actor, damage.total, damage.type, {
          melee: damage.melee === true,
          ignoreSP: damage.sneak === true,
          critical: damage.sneak === true,
          corrosive: damage.corrosive === true,
          ...(swinger === undefined ? {} : { attacker: swinger }),
        });
        await foundry.documents.ChatMessage.create({
          content: describeDamageResult(target.name, result),
        });
        // Blood worms, Bone worms, Glowing pustules and Weeping sores all fire
        // on damage that reaches hit points (pg 120). Run outside the damage
        // pipeline so a reaction that deals its own damage cannot recurse.
        await diseaseDamageReactions(
          target.actor,
          target.actor.system as CharacterData,
          result.hpLost,
        );
      }
    })();
  });
  html.appendChild(button);

  // A Fusion Core targeted attack (pg 58) resolves nowhere near the ordinary
  // pipeline: it deals no damage to the armor or its operator and applies no
  // condition, and the rolled damage only accumulates against the core's
  // 30-damage overheat threshold. It also needs line of sight to the wearer's
  // *back*, which is not sheet state — so this is a second button the GM
  // presses instead of a branch the attack roll takes by itself.
  const coreButton = document.createElement("button");
  coreButton.type = "button";
  coreButton.className = "fallout-damage-core";
  coreButton.textContent = game.i18n.localize("FALLOUT.PowerArmor.applyCoreButton", {
    total: damage.total,
  });
  coreButton.addEventListener("click", () => {
    void (async () => {
      const targets = Array.from(game.user.targets);
      if (targets.length === 0) {
        ui.notifications.warn(game.i18n.localize("FALLOUT.Damage.noTargets"));
        return;
      }
      for (const target of targets) {
        if (!target.actor) continue;
        const suit = powerArmorItem(target.actor);
        if (!suit) {
          ui.notifications.warn(
            game.i18n.localize("FALLOUT.PowerArmor.targetNotArmored", { name: target.name }),
          );
          continue;
        }
        await damageFusionCore(target.actor, suit, damage.total);
      }
    })();
  });
  html.appendChild(coreButton);
});

// GM-only "Apply condition" button on the pg 129 limb-condition d4.
//
// A second hook rather than a branch inside the damage one, because the two
// cards are different cards: the damage roll carries a `damage` flag and this
// carries a `limbConditionRoll`, and a message never has both.
//
// Why a button at all, when the d4 has already been rolled: the whole table is
// conditional on the damage reaching hit points, and at the moment the attack
// rolls that d4 the damage has not been rolled — let alone taken through
// stamina and DT. The GM presses this once it has. `rules/targeted-conditions.ts`
// sets out the rest of the reasoning, including why this is not the AP-deduction
// line (backlog E1) being crossed.
Hooks.on("renderChatMessageHTML", (...args) => {
  const [message, html] = args as [
    { getFlag(scope: string, key: string): unknown },
    HTMLElement,
  ];
  const rolled = message.getFlag(SYSTEM_ID, "limbConditionRoll") as
    | { row?: unknown; index?: unknown }
    | undefined;
  if (!rolled || !game.user.isGM) return;
  if (typeof rolled.row !== "string" || typeof rolled.index !== "number") return;
  const row = rolled.row as PrintedLimbKey;
  const index = rolled.index;
  const condition = targetedCondition(row, index);
  // No realisation at all — a hand-made flag, or a row this table does not
  // cover. Offering a button that cannot do anything is worse than offering
  // none.
  if (condition === null) return;
  // The book's own "No condition" (torso 1-2) and the four entries this system
  // reports rather than writes get no button either; `applyTargetedCondition`
  // would only tell the GM so in a notification they did not ask for.
  if (!limbConditionApplicable(condition)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "fallout-apply-limb-condition";
  button.textContent = game.i18n.localize("FALLOUT.Targeted.applyButton");
  button.addEventListener("click", () => {
    void (async () => {
      const targets = Array.from(game.user.targets);
      if (targets.length === 0) {
        ui.notifications.warn(game.i18n.localize("FALLOUT.Damage.noTargets"));
        return;
      }
      for (const target of targets) {
        if (!target.actor) continue;
        // The object row needs to know which of the target's things was hit,
        // which no roll carries. `promptObjectItem` is injected rather than
        // imported by the apply path so `actions/` stays free of dialogs; every
        // other row ignores it.
        await applyTargetedCondition(target.actor, row, index, promptObjectItem);
      }
    })();
  });
  html.appendChild(button);
});
