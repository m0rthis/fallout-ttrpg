import type { CharacterData } from "../data/character";
import type { ArmorData } from "../data/armor";
import {
  powerArmorItem,
  swapFusionCore,
  targetedApWithVats,
  togglePowerArmor,
} from "../actions/power-armor";
import type { WeaponData } from "../data/items";
import {
  ABILITIES,
  ABILITY_ABBREVIATIONS,
  LEVELED_CONDITIONS,
  RACES,
  SKILL_KEYS,
  SKILLS,
  type Ability,
} from "../rules/constants";
import {
  rollAbility,
  type AttackOptions,
  rollAttack,
  rollAutomaticBurst,
  rollDamage,
  rollDeathSave,
  rollImprovisedAttack,
  rollModeFromEvent,
  signed,
  rollSkill,
} from "../dice/rolls";
import {
  AUTOMATIC_SWITCH_AP,
  manualReloadRounds,
  fullReloadAp,
  reloadCost,
  reloadDecayInterval,
} from "../rules/weapons";
import {
  limbKeysFor,
  limbLabelKey,
  limbRowKey,
  targetedApCost,
  type LimbKey,
} from "../rules/targeted";
import { ROBOT_SUB_TYPES, robotTypeOf } from "../rules/robots";
import { hasStealthField, SUPER_MUTANT_VARIANTS } from "../rules/races";
import {
  endStealthField,
  isStealthFieldActive,
  raiseStealthField,
} from "../actions/stealth-field";
import { COVER_DEGREES, type CoverDegree } from "../rules/cover";
import { levelForXP, totalPerkPoints, totalSkillPoints } from "../rules/formulas";
import { currentGroupSneak, currentPartyNerve } from "../rules/party";
import { useAid } from "../actions/use-aid";
import { useMedicalKit } from "../actions/first-aid";
import {
  MEDICAL_KIT_ACTIONS,
  MEDICAL_KIT_USES,
  type MedicalKitAction,
  medicalKitKind,
} from "../rules/first-aid";
import { ADVANTAGE_CATEGORIES } from "../rules/effects";
import { passDay, rest } from "../actions/rest";
import { restProfile } from "../rules/rest";
import { repairItem } from "../actions/repair";
import { bulkyNote, decayItem } from "../actions/decay";
import { DRINK_STAGES, IRRADIATED_PER_RAD, SNACKS_PER_MEAL } from "../rules/survival";
import { setSituation, situationalEffects, syncSituations } from "../actions/situations";
import { DERIVED_CONDITIONS, EFFECT_CONDITIONS, type EffectCondition } from "../rules/effects";
import { enrichField } from "./enrich";
import type { AidData } from "../data/items";
import { DISEASE_KEYS } from "../rules/diseases";
import {
  contractDisease,
  contractRandomDisease,
  doseWaitHours,
  removeDisease,
  sleepDiseases,
  treatDisease,
} from "../actions/diseases";
import {
  describeWeather,
  getWeather,
  rangeMultiplier,
  recoverExposure,
  rollHazardCheck,
  setWeather,
  tickEnvironment,
} from "../actions/environment";
import {
  blockDamageThreshold,
  defensiveBonusHeld,
  endBlocking,
  isBlocking,
  startBlocking,
  wieldedMeleeWeapon,
} from "../actions/blocking";
import { HAZARD_TYPES, RADIATION_SEVERITY_MAX, type HazardType } from "../rules/hazards";
import { severityCount, WEATHER_TYPES, type WeatherType } from "../rules/weather";

import { panelActions, panelContext } from "./panel-registry";
import "./panels/crafting";
import "./panels/medical";
import "./panels/combat-actions";
import "./panels/power-armor";
import "./panels/stealth";
import "./panels/movement";
import "./panels/progression";
import { promptReadMagazine } from "./panels/progression";
import "./panels/vision";
import "./panels/backgrounds";
import { rerouteShortCircuit } from "../actions/short-circuit";
import { CONDITION_TRACK_MAX, SHORT_CIRCUIT_REROUTE_AP } from "../rules/constants";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

interface SheetTarget extends HTMLElement {
  dataset: DOMStringMap;
}

/** Dotted paths of every leaf in a nested object — `{a:{b:1}}` → `["a.b"]`. */
function flattenKeys(value: object, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      keys.push(...flattenKeys(child as object, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/**
 * Delete `path` from `data`, whether stored as one dotted key or nested.
 *
 * `Reflect.deleteProperty` rather than the `delete` operator, because the lint
 * config forbids dynamic `delete` — and the whole point here is that the key
 * *is* dynamic: it comes from `actor.overrides`, whose shape is whatever the
 * active effects happen to target.
 */
function deleteByPath(data: Record<string, unknown>, path: string): void {
  if (path in data) {
    Reflect.deleteProperty(data, path);
    return;
  }
  const parts = path.split(".");
  let node: Record<string, unknown> = data;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (next === null || typeof next !== "object") return;
    node = next as Record<string, unknown>;
  }
  Reflect.deleteProperty(node, parts[parts.length - 1] ?? "");
}

function isAbility(value: string): value is Ability {
  return (ABILITIES as readonly string[]).includes(value);
}

export class FalloutCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /**
   * Strip Active-Effect-overridden fields out of a form submit.
   *
   * The sheet is one form with `submitOnChange: true`, and its inputs render
   * *prepared* values. When an Active Effect targets a stored field — the
   * Nightkin Stealth Field's 24-hour Perception decay is the one effect in
   * this system that does — any edit anywhere on the sheet would write the
   * temporarily-reduced number back into `_source`. The effect then applies
   * again on top, the next edit persists that, and a printed-as-temporary
   * −1 ratchets a real ability score down to the schema floor.
   *
   * Legacy AppV1 ActorSheet did exactly this stripping; DocumentSheetV2 on
   * 14.365 does not (verified against the deployed foundry.mjs), so the sheet
   * does it itself. `actor.overrides` is core's own record of every key an
   * effect is currently overriding.
   */
  // No `override` modifier and a cast on the super call: the ambient typings
  // in src/types/foundry.d.ts do not declare `_prepareSubmitData` (or
  // `foundry.utils`), but the method is real on 14.365 — read off the
  // deployed foundry.mjs, which is this project's standing rule for API the
  // typings do not carry.
  protected _prepareSubmitData(
    event: SubmitEvent,
    form: HTMLFormElement,
    formData: unknown,
    updateData?: object,
  ): object {
    const base = (
      ActorSheetV2.prototype as unknown as {
        _prepareSubmitData: (
          event: SubmitEvent,
          form: HTMLFormElement,
          formData: unknown,
          updateData?: object,
        ) => object;
      }
    )._prepareSubmitData;
    const data = base.call(this, event, form, formData, updateData) as Record<string, unknown>;
    const overrides = (this.actor as unknown as { overrides?: object }).overrides ?? {};
    for (const key of flattenKeys(overrides)) {
      deleteByPath(data, key);
    }

    // Short Circuit's wet clause used to fire from here and raced the very
    // submit that triggered it — both writes carried
    // `system.conditions.shortCircuit`, since the level input and the wet
    // checkbox are on this same form. It lives in a `preUpdateActor` hook now,
    // which folds the doubled level into this update instead of issuing a
    // second one. See `registerShortCircuitHooks`.
    return data;
  }

  static override DEFAULT_OPTIONS: foundry.applications.api.ApplicationConfiguration = {
    classes: ["fallout-ttrpg", "sheet", "character"],
    position: { width: 860, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      // Panel-supplied handlers. Declared first so a panel colliding with a
      // built-in name is a loud override rather than a silent one — the
      // registry throws on panel-vs-panel collisions.
      ...panelActions(),
      rollAbility(event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onRollAbility(event, target);
      },
      rerouteShortCircuit() {
        return (this as FalloutCharacterSheet).#onRerouteShortCircuit();
      },
      rollSkill(event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onRollSkill(event, target);
      },
      rollAttack(event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onRollWeapon(event, target, "attack");
      },
      rollDamage(event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onRollWeapon(event, target, "damage");
      },
      rollTargeted(event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onRollTargeted(event, target);
      },
      rollInSituation(event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onRollInSituation(event, target);
      },
      createItem(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onCreateItem(target);
      },
      editItem(_event: PointerEvent, target: HTMLElement) {
        ;(this as FalloutCharacterSheet).#onEditItem(target);
      },
      deleteItem(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onDeleteItem(target);
      },
      toggleEquip(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onToggleEquip(target);
      },
      reload(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onReload(target);
      },
      flipKarmaCap(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onFlipKarmaCap(target);
      },
      useAid(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onUseAid(target);
      },
      newDay() {
        return (this as FalloutCharacterSheet).#onNewDay();
      },
      swapFusionCore() {
        return (this as FalloutCharacterSheet).#onSwapFusionCore();
      },
      toggleEffect(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onToggleEffect(target);
      },
      deleteEffect(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onDeleteEffect(target);
      },
      editEffect(_event: PointerEvent, target: HTMLElement) {
        (this as FalloutCharacterSheet).#effectFromTarget(target)?.sheet.render(true);
      },
      rollDeathSave(event: PointerEvent) {
        return (this as FalloutCharacterSheet).#onRollDeathSave(event);
      },
      rollImprovised(event: PointerEvent) {
        return (this as FalloutCharacterSheet).#onRollImprovised(event);
      },
      contractDisease() {
        return (this as FalloutCharacterSheet).#onContractDisease();
      },
      treatDisease(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onTreatDisease(target);
      },
      removeDisease(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onRemoveDisease(target);
      },
      sleep() {
        return (this as FalloutCharacterSheet).#onSleep();
      },
      setWeather() {
        return (this as FalloutCharacterSheet).#onSetWeather();
      },
      passTime() {
        return (this as FalloutCharacterSheet).#onPassTime();
      },
      hazardCheck() {
        return (this as FalloutCharacterSheet).#onHazardCheck();
      },
      recoverExposure() {
        return (this as FalloutCharacterSheet).#onRecoverExposure();
      },
      stealthField() {
        return (this as FalloutCharacterSheet).#onStealthField();
      },
      toggleBlock() {
        return (this as FalloutCharacterSheet).#onToggleBlock();
      },
      rollBurst(event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onRollBurst(event, target);
      },
      toggleOneHanded(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onToggleOneHanded(target);
      },
      rest() {
        return (this as FalloutCharacterSheet).#onRest();
      },
      repairItem(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onRepairItem(target);
      },
      syncSituations() {
        return (this as FalloutCharacterSheet).#onSyncSituations();
      },
      toggleSituation(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onToggleSituation(target);
      },
      toggleAutoMode(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutCharacterSheet).#onToggleAutoMode(target);
      },
    },
  };

  static override PARTS = {
    body: {
      template: "systems/fallout-ttrpg/templates/actor/character-sheet.hbs",
      scrollable: [".sheet-body"],
    },
  };

  get characterSystem(): CharacterData {
    return this.document.system as CharacterData;
  }

  protected override async _prepareContext(
    options: foundry.applications.api.ApplicationRenderOptions,
  ): Promise<Record<string, unknown>> {
    const context = await super._prepareContext(options);
    const system = this.characterSystem;
    const itemTypes = this.actor.itemTypes;

    const abilities = ABILITIES.map((ability) => ({
      key: ability,
      abbr: ABILITY_ABBREVIATIONS[ability],
      label: game.i18n.localize(`FALLOUT.Abilities.${ability}`),
      value: system.abilities[ability].value,
      mod: system.derived.abilityMods[ability],
    }));

    const skills = SKILL_KEYS.map((skill) => {
      const definition = SKILLS[skill];
      const hasAlt = "altAbility" in definition;
      return {
        key: skill,
        label: game.i18n.localize(`FALLOUT.Skills.${skill}`),
        ability: ABILITY_ABBREVIATIONS[system.derived.skillAbilities[skill]],
        hasAlt,
        useAlt: system.skills[skill].useAlt,
        points: system.skills[skill].points,
        bonus: system.derived.skillBonuses[skill],
      };
    });

    // Fog, storms and dust cut every ranged weapon's reach (v2.1 pg 121-123).
    const weather = getWeather();
    const rangeScale = rangeMultiplier(weather);
    const weapons = (itemTypes.weapon ?? []).map((item) => {
      const weapon = item.system as WeaponData;
      const keywords = weapon.keywords;
      // Kickback halves both ranges in one hand (pg 70), on top of any weather.
      const handScale = keywords.kickback && weapon.oneHanded ? 0.5 : 1;
      const reach = (multiplier: number): number =>
        Math.floor(multiplier * system.derived.abilityScores.perception * rangeScale * handScale);
      // Mod keys go in, so a Speedloader (pg 76) reaches `cost.alternative` —
      // without them `reloadCost` can only ever answer with the printed row.
      const cost = reloadCost(keywords, weapon.attachedModKeys);
      const printedReloadAp =
        cost.kind === "manual"
          ? game.i18n.localize("FALLOUT.Keywords.manualAp", { min: cost.minimumAp })
          : String(cost.ap);
      return {
        item,
        system: weapon,
        keywords,
        skillLabel: game.i18n.localize(`FALLOUT.Skills.${weapon.skill}`),
        attackBonus: system.derived.skillBonuses[weapon.skill] - weapon.decay,
        canReload: weapon.isRanged && weapon.magazineSize > 0,
        // Both prices, never one: the printed cost is what the row says and the
        // Speedloader's flat 4 is what the mod offers, and which is cheaper
        // depends on the magazine for a Manual Reload weapon. Showing only the
        // better of the two would hide the choice the player is entitled to make.
        reloadAp:
          cost.alternative === null
            ? printedReloadAp
            : game.i18n.localize("FALLOUT.Keywords.speedloaderAp", {
                printed: printedReloadAp,
                ap: cost.alternative.ap,
              }),
        decayEvery: reloadDecayInterval(keywords),
        // An Automatic (Switch) weapon only bursts while switched to automatic.
        canBurst:
          keywords.automatic !== null &&
          keywords.automatic > 0 &&
          (!keywords.automaticSwitch || weapon.autoMode),
        canSwitch: keywords.automaticSwitch,
        autoMode: weapon.autoMode,
        burstShots: keywords.automatic ?? 0,
        switchAp: keywords.automaticSwitch ? AUTOMATIC_SWITCH_AP : 0,
        kickbackHalved: handScale !== 1,
        weatherRange: rangeScale !== 1,
        range: weapon.isRanged
          ? `${String(reach(weapon.rangeNormal))}/${String(reach(weapon.rangeLong))} ft`
          : "5 ft",
      };
    });

    const karmaCapList = Array.from({ length: system.currency.karmaCaps }, (_, index) => ({
      index,
      flipped: index < system.currency.karmaCapsFlipped,
    }));

    const conditions = LEVELED_CONDITIONS.map((condition) => ({
      key: condition,
      label: game.i18n.localize(`FALLOUT.Conditions.${condition}`),
      value: system.conditions[condition],
      // Dysentery and Parasites pin levels in place until they are cured.
      floor: system.derived.conditionFloors[condition] ?? 0,
      // The input's ceiling, which is *not* the schema's — `levelField` has no
      // maximum at all. Ten is the sheet's convention for the conditions whose
      // printed tracks stop there, and Short Circuit is the one that does not:
      // it doubles on becoming wet (pg 135) with no cap, so a creature can pass
      // ten legitimately. The old flat `max="10"` stored such a value fine and
      // then refused to let a GM type it back in by hand, which is the worst of
      // both — the number was real and the sheet would not accept it.
      max: condition === "shortCircuit" ? null : CONDITION_TRACK_MAX,
    }));

    const diseases = system.derived.diseases.map((disease) => {
      const wait = doseWaitHours(disease);
      const cure = disease.definition.cure;
      return {
        key: disease.key,
        name: game.i18n.localize(`FALLOUT.Diseases.${disease.key}.name`),
        effect: game.i18n.localize(`FALLOUT.Diseases.${disease.key}.effect`),
        suppressed: disease.suppressed,
        suppressedHours: Math.round(disease.suppressedHours * 10) / 10,
        remaining:
          disease.remainingHours === null
            ? game.i18n.localize("FALLOUT.Diseases.untilSleep")
            : game.i18n.localize("FALLOUT.Diseases.remaining", {
                hours: Math.round(disease.remainingHours * 10) / 10,
              }),
        doses: cure.kind === "item" ? `${String(disease.doses)}/${String(cure.doses)}` : "",
        wait,
        cureHint: game.i18n.localize(`FALLOUT.Diseases.${disease.key}.cure`),
      };
    });

    const level = system.details.level;
    const skillSpent = SKILL_KEYS.reduce((sum, key) => sum + system.skills[key].points, 0);
    const suggestedLevel = levelForXP(system.details.xp);

    return {
      ...context,
      actor: this.actor,
      system,
      derived: system.derived,
      // A toggled <prose-mirror> shows its *body*, not its value, while closed
      // (see sheets/enrich.ts) — without this the biography reads as blank.
      enrichedBiography: await enrichField(system.details.biography, {
        secrets: this.actor.isOwner,
        relativeTo: this.actor,
      }),
      partyNerve: currentPartyNerve(),
      groupSneak: currentGroupSneak(),
      showDeathSaves: system.resources.hp.value === 0,
      levelHelper: {
        perkTotal: totalPerkPoints(level),
        skillTotal: totalSkillPoints(level, system.derived.abilityScores.intelligence),
        skillSpent,
        suggestedLevel,
        levelMismatch: suggestedLevel !== level,
      },
      abilities,
      skills,
      weapons,
      karmaCapList,
      conditions,
      diseases,
      // Blocking (pg 127): melee weapon in hand, 3 AP, and it lasts until the
      // next attack rather than for a span of time.
      blocking: isBlocking(this.actor),
      canBlock: wieldedMeleeWeapon(this.actor) !== undefined,
      blockDt: blockDamageThreshold(
        system.derived.abilityMods.endurance,
        defensiveBonusHeld(this.actor),
      ),
      // The three counters the food and drink chapter needs (pg 82-83).
      survival: {
        ...system.survival,
        stageLabel: game.i18n.localize(
          `FALLOUT.Survival.stages.${DRINK_STAGES[system.derived.drinkStage] ?? "sober"}`,
        ),
        drunk: system.derived.drinkStage > 0,
        blackout: system.derived.drinkBlackout,
        perRad: IRRADIATED_PER_RAD,
        snacksNeeded: SNACKS_PER_MEAL,
      },
      restHours: restProfile(system.details.race).longHours,
      // Each registered panel's values, namespaced by panel id so two panels
      // cannot collide on a key name.
      panels: panelContext(this.actor, system),
      // The three decay bands read as words rather than a raw enum (pg 57).
      powerArmorRadiation: system.derived.powerArmor
        ? game.i18n.localize(
            `FALLOUT.PowerArmor.radiation${
              system.derived.powerArmor.radiation === "immune"
                ? "Immune"
                : system.derived.powerArmor.radiation === "advantage"
                  ? "Advantage"
                  : "None"
            }`,
          )
        : "",
      // Situations the table declares, and the effects waiting on them.
      situations: EFFECT_CONDITIONS.map((key) => ({
        key,
        label: game.i18n.localize(`FALLOUT.Situations.conditions.${key}`),
        holds: system.derived.situations[key],
        // The three the sheet works out for itself are shown but not clickable:
        // toggling them would be overwritten on the next preparation pass.
        derived: DERIVED_CONDITIONS.includes(key),
      })),
      situationalEffects: situationalEffects(this.actor, system).map((entry) => ({
        ...entry,
        conditionLabel: game.i18n.localize(`FALLOUT.Situations.conditions.${entry.condition}`),
        stale: entry.holds !== entry.active,
      })),
      // Ambient conditions (pg 121-124): weather lives on the scene, the
      // exposure flags on the character.
      weatherLabel: describeWeather(weather),
      environmentFlags: (
        ["insulated", "exposedWet", "sheltered", "nearWarmth", "nearCooling", "gasMask"] as const
      ).map((flag) => ({
        key: flag,
        label: game.i18n.localize(`FALLOUT.Environment.${flag}`),
        hint: game.i18n.localize(`FALLOUT.Environment.${flag}Hint`),
        value: system.environment[flag],
      })),
      moveCapFeet: system.derived.moveCapFeet,
      // Short Circuit's re-route price (pg 135), read from the rules module so
      // the number is not typed twice — the same arrangement Burning uses.
      shortCircuitAp: SHORT_CIRCUIT_REROUTE_AP,
      isGM: game.user.isGM,
      // What perks, chems, and statuses are currently doing to roll modes.
      rollSwings: ADVANTAGE_CATEGORIES.flatMap((category) => {
        const advantage = system.derived.advantage[category];
        const disadvantage = system.derived.disadvantage[category];
        if (advantage === 0 && disadvantage === 0) return [];
        const label = game.i18n.localize(`FALLOUT.AdvantageCategories.${category}`);
        if (advantage > 0 && disadvantage > 0) {
          return [{ label, kind: "cancels", text: game.i18n.localize("FALLOUT.Effects.cancels") }];
        }
        return [
          {
            label,
            kind: advantage > 0 ? "advantage" : "disadvantage",
            text: game.i18n.localize(
              advantage > 0 ? "FALLOUT.Effects.advantage" : "FALLOUT.Effects.disadvantage",
            ),
          },
        ];
      }),
      // Perk/trait effects transfer from their item; chems are created on use.
      activeEffects: Array.from(this.actor.effects).map((effect) => ({
        id: effect.id,
        name: effect.name,
        img: effect.img,
        disabled: effect.disabled,
        // Foundry retires elapsed effects itself; they linger as inert rows.
        expired: effect.duration.expired === true,
        temporary: effect.isTemporary,
        remaining: effect.duration.label ?? "",
      })),
      armor: itemTypes.armor ?? [],
      aid: (itemTypes.aid ?? []).map((item) => {
        const consumable = item.system as AidData;
        return {
          item,
          system: consumable,
          typeLabel: game.i18n.localize(`FALLOUT.AidTypes.${consumable.aidType}`),
          // Chems the character is already hooked on need no second check.
          addicted: system.derived.addictions.some(
            (name) => name.toLowerCase() === item.name.toLowerCase(),
          ),
        };
      }),
      ammo: itemTypes.ammo ?? [],
      gear: itemTypes.gear ?? [],
      perks: itemTypes.perk ?? [],
      traits: itemTypes.trait ?? [],
      races: Object.fromEntries(
        RACES.map((race) => [race, game.i18n.localize(`FALLOUT.Races.${race}`)]),
      ),
      // Only meaningful for Robots (pg 9-11), so the sheet hides the picker for
      // everyone else rather than offering a chassis to a ghoul.
      isRobot: system.details.race === "robot",
      robotTypes: {
        "": game.i18n.localize("FALLOUT.RobotType.none"),
        ...Object.fromEntries(
          ROBOT_SUB_TYPES.map((type) => [type, game.i18n.localize(`FALLOUT.RobotType.${type}`)]),
        ),
      },
      // Only meaningful for Super Mutants, and only when the GM has allowed a
      // variant (pg 12) — the sheet hides the picker for everyone else rather
      // than offering Nightkin to a ghoul. Same shape as the robot chassis
      // picker above.
      isSuperMutant: system.details.race === "superMutant",
      mutantVariants: {
        "": game.i18n.localize("FALLOUT.MutantVariant.none"),
        ...Object.fromEntries(
          SUPER_MUTANT_VARIANTS.map((variant) => [
            variant,
            game.i18n.localize(`FALLOUT.MutantVariant.${variant}`),
          ]),
        ),
      },
      isNightkin: hasStealthField(system.details.race, system.details.mutantVariant),
      stealthFieldUp: isStealthFieldActive(this.actor),
      editable: this.isEditable,
    };
  }

  async #onRollAbility(event: PointerEvent, target: SheetTarget): Promise<void> {
    const ability = target.dataset.ability ?? "";
    if (!isAbility(ability)) return;
    await rollAbility(this.actor, this.characterSystem, ability, rollModeFromEvent(event));
  }

  async #onRollSkill(event: PointerEvent, target: SheetTarget): Promise<void> {
    const skill = target.dataset.skill ?? "";
    if (!(SKILL_KEYS as readonly string[]).includes(skill)) return;
    await rollSkill(
      this.actor,
      this.characterSystem,
      skill as (typeof SKILL_KEYS)[number],
      rollModeFromEvent(event),
    );
  }

  async #onRollWeapon(
    event: PointerEvent,
    target: SheetTarget,
    kind: "attack" | "damage",
  ): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (item?.type !== "weapon") return;
    const weapon = item.system as WeaponData;
    // Alt declares a sneak attack (pg 128) — held for the attack to make it a
    // critical, and again for the damage so it bypasses stamina. Keeping it a
    // per-click modifier rather than stored state means a sneak attack can
    // never leak into the next roll.
    const sneak = event.altKey;
    if (kind === "attack") {
      await rollAttack(this.actor, this.characterSystem, item, weapon, rollModeFromEvent(event), {
        sneak,
      });
    } else {
      await rollDamage(this.actor, this.characterSystem, item, weapon, sneak);
    }
  }

  /**
   * An attack that declares its cover and its distance (pg 130, pg 21/66).
   *
   * Both are facts about a *pair of tokens*, and `src/dice/rolls.ts` explains at
   * length why this system asks rather than measures: cover's degrees are
   * adjudications no wall test distinguishes ("at least half of its body",
   * "about three-quarters"), and a measured distance would need canvas API this
   * project has never probed live plus a token-movement hook to stay honest.
   *
   * So it is a separate control rather than a modifier on the ordinary attack.
   * The plain attack button keeps meaning exactly what it means today — no
   * cover, distance unstated — and nobody pays a dialog for a shot across a
   * room at someone standing in the open.
   */
  async #onRollInSituation(event: PointerEvent, target: SheetTarget): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (item?.type !== "weapon") return;
    const weapon = item.system as WeaponData;
    const options = await this.#askAttackSituation(item.name, event.altKey);
    if (!options) return;
    await rollAttack(
      this.actor,
      this.characterSystem,
      item,
      weapon,
      rollModeFromEvent(event),
      options,
    );
  }

  /**
   * The cover/distance/obscurement dialog, and the `AttackOptions` it builds.
   *
   * Shared with the burst control since pg 128 acquired a caller: a burst is a
   * sequence of attacks, so a heavily obscured target makes every shot in it a
   * blind attack, and a control with no way to declare a distance could not fire
   * one at all. Returns null when the dialog was dismissed.
   */
  async #askAttackSituation(weaponName: string, forceSneak: boolean): Promise<AttackOptions | null> {
    const coverOptions = COVER_DEGREES.map((degree) => {
      const label = game.i18n.localize(`FALLOUT.Cover.degrees.${degree}`);
      return `<option value="${degree}">${label}</option>`;
    }).join("");

    const choice = await this.#prompt(
      game.i18n.localize("FALLOUT.Cover.dialogTitle", { weapon: weaponName }),
      `<label style="display:flex;flex-direction:column;gap:0.3rem;">
        ${game.i18n.localize("FALLOUT.Cover.pickCover")}
        <select name="cover">${coverOptions}</select>
      </label>
      <label style="display:flex;gap:0.5rem;align-items:center;margin-top:0.4rem;">
        <input type="checkbox" name="creature" />
        ${game.i18n.localize("FALLOUT.Cover.pickCreature")}
      </label>
      <label style="display:flex;flex-direction:column;gap:0.3rem;margin-top:0.4rem;">
        ${game.i18n.localize("FALLOUT.Cover.pickDistance")}
        <input type="number" name="distance" min="0" step="5" placeholder="—" />
      </label>
      <label style="display:flex;gap:0.5rem;align-items:center;margin-top:0.4rem;">
        <input type="checkbox" name="obscured" />
        ${game.i18n.localize("FALLOUT.Cover.pickObscured")}
      </label>
      <p class="hint">${game.i18n.localize("FALLOUT.Cover.hint")}</p>
      <p class="hint">${game.i18n.localize("FALLOUT.Cover.obscuredHint")}</p>`,
      [
        {
          action: "attack",
          label: game.i18n.localize("FALLOUT.Sheet.attack"),
          fields: ["cover", "creature", "distance", "obscured"],
        },
      ],
    );
    if (!choice) return null;

    const [rawCover = "none", rawCreature = "false", rawDistance = "", rawObscured = "false"] =
      choice.values;
    const cover = this.#coverFrom(rawCover);
    const distance = Number(rawDistance.trim());

    // Every option is omitted rather than passed as undefined: the attack
    // options are exactOptionalPropertyTypes, and an unstated distance has to
    // mean "nothing about distance is checked" rather than "zero feet".
    return {
      // Alt forces a sneak attack; without it the option is omitted entirely so
      // `rollAttack` can work it out from the attacker's stealth (pg 128). An
      // explicit `false` would suppress it instead.
      ...(forceSneak ? { sneak: true } : {}),
      ...(cover === "none" ? {} : { cover }),
      ...(rawCreature === "true" ? { coverIsCreature: true } : {}),
      ...(rawDistance.trim() !== "" && Number.isFinite(distance) && distance >= 0
        ? { distanceFeet: distance }
        : {}),
      // Darkness is the one concealment with no document behind it — scene light
      // is not a per-creature fact — so pg 128's commonest trigger has to be
      // declared here or it can never fire. Only sent when ticked: an unticked
      // box must mean "nothing declared", leaving `rollAttack` to read the
      // target's own Hide marker and Invisible status, not "definitely clear".
      ...(rawObscured === "true"
        ? { concealment: { cover: "none", heavilyObscured: true, invisible: false } }
        : {}),
    };
  }

  /** Narrow a select's value back to a cover degree, defaulting to none. */
  #coverFrom(value: string): CoverDegree {
    return (COVER_DEGREES as readonly string[]).includes(value)
      ? (value as CoverDegree)
      : "none";
  }

  /**
   * Automatic fire (pg 69): the paid attack plus its free extra shots.
   *
   * **Asks for the situation, where it used to ask nothing.** A burst is a
   * sequence of ordinary attacks, so every rule that reads an attack's situation
   * applies to each shot — and until now none of them could: cover, the range
   * bands and the distance were all unreachable from this control, and pg 128's
   * blind attack (which a burst against an obscured target simply *is*) has no
   * DC without a distance. One dialog for N+1 shots is proportionate to what it
   * unlocks, and the burst is already the most deliberate button on the sheet.
   */
  async #onRollBurst(event: PointerEvent, target: SheetTarget): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (item?.type !== "weapon") return;
    const options = await this.#askAttackSituation(item.name, event.altKey);
    if (!options) return;
    await rollAutomaticBurst(
      this.actor,
      this.characterSystem,
      item,
      item.system as WeaponData,
      rollModeFromEvent(event),
      options,
    );
  }

  /**
   * Declare that a Two Handed weapon is being used one-handed (pg 61, 70).
   *
   * This is a stance rather than a weapon statistic: the book never says a Two
   * Handed weapon *takes* two hands, only what it costs to use one anyway.
   */
  async #onToggleOneHanded(target: SheetTarget): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (item?.type !== "weapon") return;
    const weapon = item.system as WeaponData;
    await item.update({ "system.oneHanded": !weapon.oneHanded });
  }

  /** Limb-picker dialog, then a targeted attack (pg 130-131). */
  async #onRollTargeted(event: PointerEvent, target: SheetTarget): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (item?.type !== "weapon") return;
    const weapon = item.system as WeaponData;
    const mode = rollModeFromEvent(event);

    // The picker prices every limb the way the attack roll will, VATS matrix
    // overlay included (pg 59): the suit reduces "the additional AP cost by 1"
    // per rank, and a dialog that quoted the printed surcharge while the card
    // charged a smaller one would be the sheet disagreeing with itself. Same
    // wrapper, same order — the melee discount first (pg 130), then the suit.
    // Which limbs there are to aim at is a fact about the *target*, not the
    // attacker (pg 9-11): a Handy has no head to shoot at, a Robobrain has
    // rollers instead of legs. Read off the single targeted token, falling back
    // to the printed pg 129 table when nothing (or more than one thing) is
    // targeted — which is exactly what this picker offered before.
    const picked = Array.from(game.user.targets)
      .map((token) => token.actor)
      .filter((candidate): candidate is FoundryActor => candidate !== null);
    const defenderRobotType = robotTypeOf(
      picked.length === 1 && picked[0]
        ? (picked[0].system as CharacterData).details.robotType
        : undefined,
    );

    let vatsSaving = 0;
    const options = limbKeysFor(defenderRobotType)
      .map((limb) => {
        const label = game.i18n.localize(limbLabelKey(limb));
        // jetEngine and rollers have no rules text of their own — both "function
        // exactly the same as a targeted attack to the legs", so they read the
        // leg row.
        const effect = game.i18n.localize(
          `FALLOUT.Targeted.limbs.${limbRowKey(limb, defenderRobotType)}.effect`,
        );
        const printed = targetedApCost(
          limb,
          !weapon.isRanged,
          weapon.keywords.dismember,
          defenderRobotType,
        );
        const ap = targetedApWithVats(this.document, printed);
        vatsSaving = Math.max(vatsSaving, printed - ap);
        return `<option value="${limb}">${label} (+${String(ap)} AP) — ${effect}</option>`;
      })
      .join("");
    // Only shown when the suit is actually taking something off, so the hint
    // does not claim an upgrade a bare-headed character does not have.
    const vatsHint =
      vatsSaving > 0
        ? `<p class="hint">${game.i18n.localize("FALLOUT.PowerArmor.vatsHint", {
            ap: vatsSaving,
          })}</p>`
        : "";
    const content = `
      <label style="display:flex;flex-direction:column;gap:0.3rem;">
        ${game.i18n.localize("FALLOUT.Targeted.pick")}
        <select name="limb">${options}</select>
      </label>
      <p class="hint">${game.i18n.localize("FALLOUT.Targeted.hint")}</p>${vatsHint}`;

    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: `${game.i18n.localize("FALLOUT.Targeted.title")}: ${item.name}` },
      content,
      rejectClose: false,
      buttons: [
        {
          action: "attack",
          label: game.i18n.localize("FALLOUT.Sheet.attack"),
          default: true,
          callback: (_event, button) => {
            const select = button.form?.elements.namedItem("limb");
            return select instanceof HTMLSelectElement ? select.value : null;
          },
        },
        { action: "cancel", label: game.i18n.localize("FALLOUT.Targeted.cancel") },
      ],
    });
    // Validated against the same body plan the picker was built from, so a
    // Handy's jet engine or a Robobrain's rollers pass and a limb that body does
    // not have cannot be smuggled through.
    const offered = limbKeysFor(defenderRobotType) as readonly string[];
    if (typeof choice !== "string" || !offered.includes(choice)) return;
    await rollAttack(this.actor, this.characterSystem, item, weapon, mode, {
      limb: choice as LimbKey,
      // Only forced when Alt is held. Passing `event.altKey` outright would send
      // an explicit `false` on every ordinary click, which now *suppresses* the
      // sneak attack the posture would otherwise have worked out (pg 128).
      ...(event.altKey ? { sneak: true } : {}),
    });
  }

  async #onCreateItem(target: SheetTarget): Promise<void> {
    const type = target.dataset.type ?? "gear";
    const name = game.i18n.localize(`FALLOUT.ItemTypes.${type}`);
    await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
  }

  #onEditItem(target: SheetTarget): void {
    this.#itemFromTarget(target)?.sheet.render(true);
  }

  async #onDeleteItem(target: SheetTarget): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (item) await item.delete();
  }

  async #onToggleEquip(target: SheetTarget): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (!item) return;
    // Climbing into Power Armor is a rule, not a checkbox: 6 AP, a refusal if
    // the suit has ceased function, and the suit's own allotted time seeded
    // from its model the first time anyone wears it (pg 57-58).
    if (item.type === "armor" && (item.system as ArmorData).isPowerArmor) {
      await togglePowerArmor(this.document, item);
      return;
    }
    const equipped = (item.system as { equipped?: boolean }).equipped ?? false;
    await item.update({ "system.equipped": !equipped });
  }

  /** Slot a fresh Fusion Core into the worn suit: 5 AP (pg 58). */
  async #onSwapFusionCore(): Promise<void> {
    const item = powerArmorItem(this.document);
    if (!item) {
      ui.notifications.warn(game.i18n.localize("FALLOUT.PowerArmor.noSuit"));
      return;
    }
    await swapFusionCore(this.document, item);
  }

  /**
   * Reload a ranged weapon from carried ammunition (pg 66). Energy weapons
   * consume one cell to fill the magazine; everything else moves individual
   * rounds. The cost is 6 AP, 4 with Quick Reload, 10 with Slow Reload, or a
   * player-chosen amount with the reworked Manual Reload — and every tenth
   * reload adds a level of decay, every fifth if the weapon is Unstable.
   *
   * v2.1 also added "you must have a free hand in order to reload" (pg 66,
   * 127). The book gives no hands resource to check that against — it never
   * even says a Two Handed weapon occupies two hands — so this reports the
   * requirement rather than enforcing a rule the book did not finish writing.
   */
  async #onReload(target: SheetTarget): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (item?.type !== "weapon") return;
    const weapon = item.system as WeaponData;
    if (!weapon.isRanged || weapon.magazineSize <= 0) return;

    const needed = weapon.magazineSize - weapon.loadedAmmo;
    if (needed <= 0) {
      ui.notifications.info(game.i18n.localize("FALLOUT.Roll.magazineFull", { weapon: item.name }));
      return;
    }

    // Manual Reload buys rounds one per AP, minimum 3 — so it needs to ask.
    const cost = reloadCost(weapon.keywords, weapon.attachedModKeys);
    let manual: { rounds: number; wastedAp: number } | null = null;
    if (cost.kind === "manual") {
      const choice = await this.#prompt(
        game.i18n.localize("FALLOUT.Keywords.manualTitle", { weapon: item.name }),
        `<label style="display:flex;flex-direction:column;gap:0.3rem;">
          ${game.i18n.localize("FALLOUT.Keywords.manualPick", { min: cost.minimumAp })}
          <input type="number" name="ap" value="${String(Math.max(cost.minimumAp, needed))}"
                 min="${String(cost.minimumAp)}" step="1" />
        </label>
        <p class="hint">${game.i18n.localize("FALLOUT.Keywords.manualHint", {
          min: cost.minimumAp,
          needed,
        })}</p>`,
        [{ action: "reload", label: game.i18n.localize("FALLOUT.Sheet.reload"), field: "ap" }],
      );
      if (!choice) return;
      manual = manualReloadRounds(Number(choice.value), needed);
      if (manual.rounds <= 0) return;
    }

    const wanted = weapon.ammoType.trim().toLowerCase();
    const ammoItem = (this.actor.itemTypes.ammo ?? []).find((candidate) => {
      const ammo = candidate.system as { ammoType: string; quantity: number };
      return ammo.quantity > 0 && ammo.ammoType.trim().toLowerCase() === wanted;
    });
    if (!ammoItem) {
      ui.notifications.warn(
        game.i18n.localize("FALLOUT.Roll.noAmmoItem", { ammoType: weapon.ammoType || "?" }),
      );
      return;
    }
    const ammo = ammoItem.system as { quantity: number };

    // Energy cells are batteries: one cell powers a full magazine (pg 64).
    // A Manual Reload loads only what the player paid for.
    const isEnergy = weapon.weaponType === "energyWeapon";
    const wantRounds = manual ? Math.min(manual.rounds, needed) : needed;
    const consumed = isEnergy ? 1 : Math.min(wantRounds, ammo.quantity);
    const newLoaded = isEnergy ? weapon.magazineSize : weapon.loadedAmmo + consumed;

    // One Reload *action* advances the decay counter, however many rounds it
    // moved — the book never says which of action/AP/round it counts, and this
    // is the only reading under which Manual Reload does not shred the weapon.
    const reloadCount = weapon.reloadCount + 1;
    const interval = reloadDecayInterval(weapon.keywords);
    const updates: Record<string, unknown> = {
      "system.loadedAmmo": newLoaded,
      "system.reloadCount": reloadCount,
    };
    const decays = reloadCount % interval === 0;
    await item.update(updates);
    // Unstable's reload clock (pg 70). Written after the ammo update rather than
    // folded into it, so it can go through the shared gate and pick up Super
    // Mutant Bulky (pg 12) like every other way a weapon gains decay.
    if (decays) {
      const report = await decayItem(this.actor, item);
      ui.notifications.warn(
        game.i18n.localize("FALLOUT.Roll.reloadDecay", {
          weapon: item.name,
          interval,
        }) + bulkyNote(report),
      );
    }
    await ammoItem.update({ "system.quantity": ammo.quantity - consumed });

    const ap = manual ? manual.rounds + manual.wastedAp : (cost as { ap: number }).ap;
    ui.notifications.info(
      game.i18n.localize("FALLOUT.Roll.reloaded", {
        weapon: item.name,
        loaded: newLoaded,
        size: weapon.magazineSize,
        ap,
      }),
    );
    // A Speedloader (pg 76) fills the magazine for a flat 4 AP. It is reported,
    // not substituted: AP is never deducted here (backlog E1), the mod is a
    // *choice* the player makes at the table rather than a discount that applies
    // itself, and it only replaces a reload that actually fills the magazine.
    // Said only when it would have been the cheaper of the two.
    if (
      cost.alternative !== null &&
      newLoaded >= weapon.magazineSize &&
      fullReloadAp(cost, weapon.magazineSize) < ap
    ) {
      ui.notifications.info(
        game.i18n.localize("FALLOUT.Keywords.speedloaderCheaper", {
          ap: cost.alternative.ap,
          printed: ap,
        }),
      );
    }
    // The 3 AP floor is bigger than three shotguns' whole magazine, and the
    // book neither forbids the overspend nor refunds it. Say where it went.
    if (manual && manual.wastedAp > 0) {
      ui.notifications.warn(
        game.i18n.localize("FALLOUT.Keywords.manualWasted", { ap: manual.wastedAp }),
      );
    }
  }

  /** Consume an aid item; chems additionally run the addiction workflow. */
  async #onUseAid(target: SheetTarget): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (item?.type !== "aid") return;
    // A First Aid Kit or Doctor's Bag is not consumed as a whole (pg 86): it
    // holds one or three *actions*, and using it means choosing which. So the
    // same button asks, instead of swallowing the kit for nothing.
    if (medicalKitKind(item.name) !== null) {
      await this.#onUseMedicalKit(item);
      return;
    }
    // A skill magazine is not drunk, eaten or injected — it is *read*, and which
    // issue matters (pg 88). Falling through to `useAid` consumed the item and
    // granted nothing, because `useAid` has no notion of the read-issue ledger.
    if ((item.system as AidData).aidType === "magazine") {
      if (await promptReadMagazine(this.actor, this.characterSystem, item)) {
        await this.render();
      }
      return;
    }
    await useAid(this.actor, this.characterSystem, item);
  }

  /**
   * The pg 86 kit actions, behind the Use button the aid row already has.
   *
   * The patient is whoever the user has targeted, falling back to this
   * character — which is exactly the book's "on yourself or another creature so
   * long as they are next to you", with the "next to you" half reported rather
   * than measured (nothing in this system reads token positions).
   *
   * Only the actions the kit actually prints are offered, so a First Aid Kit
   * never shows Set Bone.
   */
  async #onUseMedicalKit(item: FoundryItem): Promise<void> {
    const kind = medicalKitKind(item.name);
    if (kind === null) return;
    const targeted = Array.from(game.user.targets)[0]?.actor;
    const patient = targeted ?? this.document;

    const options = MEDICAL_KIT_ACTIONS[kind]
      .map((action) => {
        const label = game.i18n.localize(`FALLOUT.FirstAid.kitActions.${action}`);
        const hint = game.i18n.localize(`FALLOUT.FirstAid.kitHints.${action}`);
        return `<option value="${action}">${label} — ${hint}</option>`;
      })
      .join("");
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("FALLOUT.FirstAid.kitTitle", { item: item.name }) },
      content: `
        <label style="display:flex;flex-direction:column;gap:0.3rem;">
          ${game.i18n.localize("FALLOUT.FirstAid.kitPick", { target: patient.name })}
          <select name="kitAction">${options}</select>
        </label>
        <p class="hint">${game.i18n.localize("FALLOUT.FirstAid.kitHint", {
          uses: MEDICAL_KIT_USES[kind],
        })}</p>`,
      rejectClose: false,
      buttons: [
        {
          action: "use",
          label: game.i18n.localize("FALLOUT.Sheet.use"),
          default: true,
          callback: (_event, button) => {
            const select = button.form?.elements.namedItem("kitAction");
            return select instanceof HTMLSelectElement ? select.value : null;
          },
        },
        { action: "cancel", label: game.i18n.localize("FALLOUT.Targeted.cancel") },
      ],
    });
    if (typeof choice !== "string") return;
    if (!(MEDICAL_KIT_ACTIONS[kind] as readonly string[]).includes(choice)) return;
    await useMedicalKit(
      this.actor,
      this.characterSystem,
      item,
      patient,
      choice as MedicalKitAction,
    );
  }

  /**
   * A new in-game day (pg 119, 133-134): charge hunger, dehydration and
   * exhaustion for whatever the character went without, reset the chem counter
   * (pg 89: "within a day"), and drop any consumable effects still running.
   */
  async #onNewDay(): Promise<void> {
    await passDay(this.actor, this.characterSystem);
  }

  /**
   * Rest (pg 119). Asks for the span, whether it was comfortable, and whether
   * it was sleep — sleep is what clears the three sleep-gated diseases and
   * stops the 24-hour exhaustion clock.
   */
  async #onRest(): Promise<void> {
    const profile = restProfile(this.characterSystem.details.race);
    const choice = await this.#prompt(
      game.i18n.localize("FALLOUT.Rest.title"),
      `<label style="display:flex;flex-direction:column;gap:0.3rem;">
        ${game.i18n.localize("FALLOUT.Rest.hours")}
        <input type="number" name="hours" value="${String(profile.longHours)}" min="0" step="1" />
      </label>
      <label style="display:flex;gap:0.4rem;align-items:center;margin-top:0.4rem;">
        <input type="checkbox" name="comfortable" checked />
        ${game.i18n.localize("FALLOUT.Rest.comfortable")}
      </label>
      <label style="display:flex;gap:0.4rem;align-items:center;">
        <input type="checkbox" name="sleep" checked />
        ${game.i18n.localize("FALLOUT.Rest.isSleep")}
      </label>
      <p class="hint">${game.i18n.localize("FALLOUT.Rest.hint", {
        long: profile.longHours,
        sleep: profile.needsSleep
          ? game.i18n.localize("FALLOUT.Rest.needsSleep")
          : game.i18n.localize("FALLOUT.Rest.noSleep"),
      })}</p>`,
      [
        {
          action: "rest",
          label: game.i18n.localize("FALLOUT.Rest.action"),
          fields: ["hours", "comfortable", "sleep"],
        },
      ],
    );
    if (!choice) return;
    const [hours, comfortable, sleep] = choice.values;
    await rest(this.actor, this.characterSystem, {
      hours: Number(hours ?? 0),
      comfortable: comfortable === "true",
      sleep: sleep === "true",
    });
  }

  /** Bring every situational effect into line with the situations that hold. */
  async #onSyncSituations(): Promise<void> {
    await syncSituations(this.actor, this.characterSystem);
  }

  /** Declare a situation the sheet cannot see for itself. */
  async #onToggleSituation(target: SheetTarget): Promise<void> {
    const key = target.dataset.situation;
    if (key === undefined || !(EFFECT_CONDITIONS as readonly string[]).includes(key)) return;
    const condition = key as EffectCondition;
    await setSituation(this.actor, condition, !this.characterSystem.situations[condition]);
  }

  /** Flip an Automatic (Switch) weapon between single-shot and automatic (pg 69). */
  async #onToggleAutoMode(target: SheetTarget): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (item?.type !== "weapon") return;
    const weapon = item.system as WeaponData;
    await item.update({ "system.autoMode": !weapon.autoMode });
    ui.notifications.info(
      game.i18n.localize("FALLOUT.Keywords.switched", {
        weapon: item.name,
        mode: game.i18n.localize(
          weapon.autoMode ? "FALLOUT.Keywords.singleShot" : "FALLOUT.Keywords.automatic",
        ),
        ap: AUTOMATIC_SWITCH_AP,
      }),
    );
  }

  /** Repair a level of decay off an item (pg 93). */
  async #onRepairItem(target: SheetTarget): Promise<void> {
    const item = this.#itemFromTarget(target);
    if (!item) return;
    const system = item.system as { decay?: number; repairBonus?: number };
    const choice = await this.#prompt(
      game.i18n.localize("FALLOUT.Repair.title", { item: item.name }),
      `<label style="display:flex;flex-direction:column;gap:0.3rem;">
        ${game.i18n.localize("FALLOUT.Repair.bonus")}
        <input type="number" name="bonus" value="${String(system.repairBonus ?? 0)}" min="0" step="1" />
      </label>
      <label style="display:flex;gap:0.4rem;align-items:center;margin-top:0.4rem;">
        <input type="checkbox" name="cannibalize" />
        ${game.i18n.localize("FALLOUT.Repair.cannibalize")}
      </label>
      <p class="hint">${game.i18n.localize("FALLOUT.Repair.hint")}</p>`,
      [
        {
          action: "repair",
          label: game.i18n.localize("FALLOUT.Repair.action"),
          fields: ["bonus", "cannibalize"],
        },
      ],
    );
    if (!choice) return;
    const [bonus, cannibalize] = choice.values;
    await repairItem(this.actor, this.characterSystem, item, {
      repairBonus: Number(bonus ?? 0),
      cannibalize: cannibalize === "true",
    });
  }

  /** Improvised attack (v2.1 pg 128): ask for the object's Load, then swing or throw it. */
  async #onRollImprovised(event: PointerEvent): Promise<void> {
    const mode = rollModeFromEvent(event);
    const content = `
      <label style="display:flex;flex-direction:column;gap:0.3rem;">
        ${game.i18n.localize("FALLOUT.Improvised.pick")}
        <input type="number" name="load" value="2" min="0" step="1" />
      </label>
      <p class="hint">${game.i18n.localize("FALLOUT.Improvised.hint")}</p>`;

    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("FALLOUT.Improvised.title") },
      content,
      rejectClose: false,
      buttons: [
        {
          action: "swing",
          label: game.i18n.localize("FALLOUT.Improvised.attack"),
          default: true,
          callback: (_event, button) => {
            const input = button.form?.elements.namedItem("load");
            return input instanceof HTMLInputElement ? `swing:${input.value}` : null;
          },
        },
        {
          action: "throw",
          label: game.i18n.localize("FALLOUT.Improvised.throw"),
          callback: (_event, button) => {
            const input = button.form?.elements.namedItem("load");
            return input instanceof HTMLInputElement ? `throw:${input.value}` : null;
          },
        },
        { action: "cancel", label: game.i18n.localize("FALLOUT.Improvised.cancel") },
      ],
    });
    if (typeof choice !== "string") return;
    const [kind, raw] = choice.split(":");
    const load = Number(raw);
    if (!Number.isFinite(load)) return;
    await rollImprovisedAttack(this.actor, this.characterSystem, load, mode, kind === "throw");
  }

  /**
   * A death save, with the election the book actually gives the player.
   *
   * pg 133 says "add your Luck **or** Endurance modifier" and prints no
   * tiebreak, so this offers both — each labelled with what it would actually
   * be worth, since the two are not scored alike: Luck ignores the leveled
   * penalties and Endurance does not. Alt skips the dialog and takes the
   * default, for a table rolling saves in a hurry.
   */
  async #onRollDeathSave(event: PointerEvent): Promise<void> {
    if (event.altKey) {
      await rollDeathSave(this.actor, this.characterSystem);
      return;
    }
    const system = this.characterSystem;
    const penalty = system.derived.d20Penalty;
    const option = (ability: "luck" | "endurance", effective: number): string =>
      `<option value="${ability}">${game.i18n.localize(
        `FALLOUT.Abilities.${ability}`,
      )} ${signed(effective)}</option>`;
    const choice = await this.#prompt(
      game.i18n.localize("FALLOUT.DeathSave.pickTitle"),
      `<label style="display:flex;flex-direction:column;gap:0.3rem;">
        ${game.i18n.localize("FALLOUT.DeathSave.pickAbility")}
        <select name="ability">
          ${option("luck", system.derived.abilityMods.luck)}
          ${option("endurance", system.derived.abilityMods.endurance - penalty)}
        </select>
      </label>
      ${penalty > 0 ? `<p class="hint">${game.i18n.localize("FALLOUT.DeathSave.penaltyHint", { penalty })}</p>` : ""}`,
      [
        {
          action: "roll",
          label: game.i18n.localize("FALLOUT.DeathSave.roll"),
          field: "ability",
        },
      ],
    );
    if (!choice) return;
    const ability = choice.value === "endurance" ? "endurance" : "luck";
    await rollDeathSave(this.actor, this.characterSystem, ability);
  }

  // ------------------------------------------------------------- diseases

  /** Catch a disease by name, or let the d20 pick one (pg 120). */
  async #onContractDisease(): Promise<void> {
    const options = DISEASE_KEYS.map(
      (key) =>
        `<option value="${key}">${game.i18n.localize(`FALLOUT.Diseases.${key}.name`)}</option>`,
    ).join("");
    const choice = await this.#prompt(
      game.i18n.localize("FALLOUT.Diseases.contractTitle"),
      `<label style="display:flex;flex-direction:column;gap:0.3rem;">
         ${game.i18n.localize("FALLOUT.Diseases.pick")}
         <select name="disease">${options}</select>
       </label>
       <p class="hint">${game.i18n.localize("FALLOUT.Diseases.randomHint")}</p>`,
      [
        { action: "pick", label: game.i18n.localize("FALLOUT.Diseases.contract"), field: "disease" },
        { action: "random", label: game.i18n.localize("FALLOUT.Diseases.random") },
      ],
    );
    if (choice === null) return;
    if (choice.action === "random") {
      await contractRandomDisease(this.actor, this.characterSystem);
      return;
    }
    await contractDisease(this.actor, this.characterSystem, choice.value);
  }

  /** Spend a carried consumable against a disease: a dose, or a suppression. */
  async #onTreatDisease(target: SheetTarget): Promise<void> {
    const key = target.closest<HTMLElement>("[data-disease]")?.dataset.disease;
    if (!key) return;
    const aid = (this.actor.itemTypes.aid ?? []).filter(
      (item) => (item.system as AidData).quantity > 0,
    );
    if (aid.length === 0) {
      ui.notifications.warn(game.i18n.localize("FALLOUT.Diseases.noAid"));
      return;
    }
    const options = aid
      .map((item) => `<option value="${item.id}">${item.name}</option>`)
      .join("");
    const choice = await this.#prompt(
      game.i18n.localize("FALLOUT.Diseases.treatTitle"),
      `<label style="display:flex;flex-direction:column;gap:0.3rem;">
         ${game.i18n.localize(`FALLOUT.Diseases.${key}.cure`)}
         <select name="item">${options}</select>
       </label>`,
      [{ action: "treat", label: game.i18n.localize("FALLOUT.Diseases.treat"), field: "item" }],
    );
    if (choice === null) return;
    const item = this.actor.items.get(choice.value);
    if (!item) return;
    // Only consume the item when it actually did something.
    if (await treatDisease(this.actor, this.characterSystem, key, item)) {
      const consumable = item.system as AidData;
      await item.update({ "system.quantity": Math.max(0, consumable.quantity - 1) });
    }
  }

  async #onRemoveDisease(target: SheetTarget): Promise<void> {
    const key = target.closest<HTMLElement>("[data-disease]")?.dataset.disease;
    if (key) await removeDisease(this.actor, this.characterSystem, key);
  }

  /**
   * A night's sleep, as far as diseases are concerned (pg 120). Full rest —
   * stamina restoration and the exhaustion tick of pg 119 — is still the GM's
   * to run by hand until the downtime workflow lands.
   */
  /**
   * Raise or lower a block (pg 127): 3 AP, `+2 + END mod` DT against melee
   * until you attack again. Attacking clears it by itself; this is the way to
   * drop it deliberately.
   */
  /** Nightkin Stealth Field (pg 12): raise it, or end it early by choice. */
  async #onStealthField(): Promise<void> {
    if (isStealthFieldActive(this.actor)) {
      await endStealthField(this.actor, true);
      return;
    }
    await raiseStealthField(this.actor, this.characterSystem);
  }

  async #onToggleBlock(): Promise<void> {
    if (isBlocking(this.actor)) {
      await endBlocking(this.actor, true);
      return;
    }
    await startBlocking(this.actor, this.characterSystem);
  }

  async #onSleep(): Promise<void> {
    const result = await sleepDiseases(this.actor, this.characterSystem);
    if (result.ended.length === 0 && result.radsGained === 0) {
      ui.notifications.info(game.i18n.localize("FALLOUT.Diseases.sleptNothing"));
    }
  }

  /**
   * Short Circuit's re-route (pg 135): 6 AP to remove one level.
   *
   * Sits in the conditions block rather than a panel because that is where the
   * level it removes is displayed, and it only renders when there is a level to
   * remove — a button that does nothing is a button that teaches nothing.
   */
  async #onRerouteShortCircuit(): Promise<void> {
    await rerouteShortCircuit(this.actor);
  }

  // ---------------------------------------------------------- environment

  /** Set the scene's weather, its severity, and any radiation score (pg 121). */
  async #onSetWeather(): Promise<void> {
    const state = getWeather();
    const types = WEATHER_TYPES.map(
      (type) =>
        `<option value="${type}" ${type === state.type ? "selected" : ""}>${game.i18n.localize(
          `FALLOUT.Weather.types.${type}`,
        )} (1-${String(severityCount(type))})</option>`,
    ).join("");
    const choice = await this.#prompt(
      game.i18n.localize("FALLOUT.Weather.setTitle"),
      `<label style="display:flex;flex-direction:column;gap:0.3rem;">
         ${game.i18n.localize("FALLOUT.Weather.type")}
         <select name="type">${types}</select>
       </label>
       <label style="display:flex;gap:0.5rem;align-items:center;">
         ${game.i18n.localize("FALLOUT.Weather.severity")}
         <input type="number" name="severity" value="${String(state.severity)}" min="0" max="4" />
       </label>
       <label style="display:flex;gap:0.5rem;align-items:center;">
         ${game.i18n.localize("FALLOUT.Weather.radSeverity")}
         <input type="number" name="rad" value="${String(state.radSeverity)}" min="0"
                max="${String(RADIATION_SEVERITY_MAX)}" />
       </label>
       <label style="display:flex;gap:0.5rem;align-items:center;">
         ${game.i18n.localize("FALLOUT.Weather.linked")}
         <input type="number" name="linked" value="${String(state.linked)}" min="0" max="4" />
       </label>
       <p class="hint">${game.i18n.localize("FALLOUT.Weather.setHint")}</p>`,
      [{ action: "set", label: game.i18n.localize("FALLOUT.Weather.set"), fields: ["type", "severity", "rad", "linked"] }],
    );
    if (choice === null) return;
    const [type, severity, rad, linked] = choice.values;
    if (type === undefined || !(WEATHER_TYPES as readonly string[]).includes(type)) return;
    await setWeather({
      type: type as WeatherType,
      severity: Number(severity) || 0,
      radSeverity: Number(rad) || 0,
      linked: Number(linked) || 0,
    });
    await this.render();
  }

  /** Let time pass: exposure, lightning, zone checks, and disease clocks. */
  async #onPassTime(): Promise<void> {
    const choice = await this.#prompt(
      game.i18n.localize("FALLOUT.Weather.passTitle"),
      `<label style="display:flex;gap:0.5rem;align-items:center;">
         ${game.i18n.localize("FALLOUT.Weather.minutes")}
         <input type="number" name="minutes" value="60" min="0" step="5" />
       </label>
       <p class="hint">${game.i18n.localize("FALLOUT.Weather.passHint")}</p>`,
      [{ action: "pass", label: game.i18n.localize("FALLOUT.Weather.pass"), field: "minutes" }],
    );
    if (choice === null) return;
    const minutes = Number(choice.value);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    await tickEnvironment(this.actor, this.characterSystem, minutes);
  }

  /** One hazardous-environment check (pg 123). */
  async #onHazardCheck(): Promise<void> {
    const options = HAZARD_TYPES.map(
      (hazard) =>
        `<option value="${hazard}">${game.i18n.localize(`FALLOUT.Hazards.types.${hazard}`)}</option>`,
    ).join("");
    const choice = await this.#prompt(
      game.i18n.localize("FALLOUT.Hazards.title"),
      `<label style="display:flex;flex-direction:column;gap:0.3rem;">
         ${game.i18n.localize("FALLOUT.Hazards.pick")}
         <select name="hazard">${options}</select>
       </label>
       <p class="hint">${game.i18n.localize("FALLOUT.Hazards.hint")}</p>`,
      [{ action: "check", label: game.i18n.localize("FALLOUT.Hazards.check"), field: "hazard" }],
    );
    if (choice === null) return;
    await rollHazardCheck(this.actor, this.characterSystem, choice.value as HazardType);
  }

  /** Warm up or cool down: a level an hour, at the risk pg 122 attaches. */
  async #onRecoverExposure(): Promise<void> {
    const choice = await this.#prompt(
      game.i18n.localize("FALLOUT.Weather.recoverTitle"),
      `<label style="display:flex;flex-direction:column;gap:0.3rem;">
         ${game.i18n.localize("FALLOUT.Weather.recoverPick")}
         <select name="condition">
           <option value="hypothermia">${game.i18n.localize("FALLOUT.Conditions.hypothermia")}</option>
           <option value="overheating">${game.i18n.localize("FALLOUT.Conditions.overheating")}</option>
         </select>
       </label>
       <label style="display:flex;gap:0.5rem;align-items:center;">
         ${game.i18n.localize("FALLOUT.Weather.hours")}
         <input type="number" name="hours" value="1" min="1" />
       </label>
       <label style="display:flex;gap:0.5rem;align-items:center;">
         <input type="checkbox" name="heat" />
         ${game.i18n.localize("FALLOUT.Weather.viaExtremeHeat")}
       </label>`,
      [
        {
          action: "recover",
          label: game.i18n.localize("FALLOUT.Weather.recover"),
          fields: ["condition", "hours", "heat"],
        },
      ],
    );
    if (choice === null) return;
    const [condition, hours, heat] = choice.values;
    await recoverExposure(
      this.actor,
      this.characterSystem,
      condition === "overheating" ? "overheating" : "hypothermia",
      (Number(hours) || 0) * 60,
      heat === "true",
    );
  }

  /**
   * A small DialogV2 wrapper: every prompt in this sheet reads one or more
   * named form controls and hands back which button was pressed.
   */
  async #prompt(
    title: string,
    content: string,
    buttons: { action: string; label: string; field?: string; fields?: string[] }[],
  ): Promise<{ action: string; value: string; values: string[] } | null> {
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title },
      content,
      rejectClose: false,
      buttons: [
        ...buttons.map((button, index) => ({
          action: button.action,
          label: button.label,
          default: index === 0,
          callback: (_event: Event, element: HTMLButtonElement) => {
            const form = element.form;
            const read = (name: string): string => {
              const field = form?.elements.namedItem(name);
              if (field instanceof HTMLInputElement) {
                return field.type === "checkbox" ? String(field.checked) : field.value;
              }
              return field instanceof HTMLSelectElement ? field.value : "";
            };
            const names = button.fields ?? (button.field ? [button.field] : []);
            return JSON.stringify({ action: button.action, values: names.map(read) });
          },
        })),
        { action: "cancel", label: game.i18n.localize("FALLOUT.Targeted.cancel") },
      ],
    });
    if (typeof result !== "string") return null;
    try {
      const parsed = JSON.parse(result) as { action: string; values: string[] };
      return { action: parsed.action, value: parsed.values[0] ?? "", values: parsed.values };
    } catch {
      return null;
    }
  }

  /** Karma Caps are fungible: clicking a flipped cap unflips one, and vice versa. */
  async #onFlipKarmaCap(target: SheetTarget): Promise<void> {
    const index = Number(target.dataset.index ?? "0");
    const currency = this.characterSystem.currency;
    const flipped =
      index < currency.karmaCapsFlipped
        ? currency.karmaCapsFlipped - 1
        : Math.min(currency.karmaCaps, currency.karmaCapsFlipped + 1);
    await this.document.update({ "system.currency.karmaCapsFlipped": flipped });
  }

  async #onToggleEffect(target: SheetTarget): Promise<void> {
    const effect = this.#effectFromTarget(target);
    if (effect) await effect.update({ disabled: !effect.disabled });
  }

  async #onDeleteEffect(target: SheetTarget): Promise<void> {
    const effect = this.#effectFromTarget(target);
    if (effect) await effect.delete();
  }

  #effectFromTarget(target: SheetTarget): FoundryActiveEffect | undefined {
    const row = target.closest<HTMLElement>("[data-effect-id]");
    const id = row?.dataset.effectId;
    return id ? this.actor.effects.get(id) : undefined;
  }

  #itemFromTarget(target: SheetTarget): FoundryItem | undefined {
    const row = target.closest<HTMLElement>("[data-item-id]");
    const id = row?.dataset.itemId;
    return id ? this.actor.items.get(id) : undefined;
  }
}
