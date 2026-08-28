import {
  ARMOR_TYPES,
  DAMAGE_TYPES,
  MELEE_WEAPON_TYPES,
  RANGED_WEAPON_TYPES,
} from "../rules/constants";
import { AID_TYPES, type WeaponData } from "../data/items";
import type { CharacterData } from "../data/character";
import { enrichField } from "./enrich";
import { attachMod, detachMod, modKeyFrom } from "../actions/mods";
import {
  ceasesFunction,
  modEligibility,
  MOD_CHOICES,
  MOD_CHOICE_KEYS,
  MOD_KEYS,
  RANGED_MOD_SLOTS,
  slotsUsed,
  WEAPON_MODS,
} from "../rules/mods";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/** One sheet class for every item type; the template branches on item.type. */
export class FalloutItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS: foundry.applications.api.ApplicationConfiguration = {
    classes: ["fallout-ttrpg", "sheet", "item"],
    position: { width: 480, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      createEffect() {
        return (this as FalloutItemSheet).#onCreateEffect();
      },
      editEffect(_event: PointerEvent, target: HTMLElement) {
        (this as FalloutItemSheet).#effectFromTarget(target)?.sheet.render(true);
      },
      toggleEffect(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutItemSheet).#onToggleEffect(target);
      },
      deleteEffect(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutItemSheet).#onDeleteEffect(target);
      },
      attachMod() {
        return (this as FalloutItemSheet).#onAttachMod();
      },
      detachMod(_event: PointerEvent, target: HTMLElement) {
        return (this as FalloutItemSheet).#onDetachMod(target);
      },
    },
  };

  static override PARTS = {
    body: {
      template: "systems/fallout-ttrpg/templates/item/item-sheet.hbs",
      scrollable: [".sheet-body"],
    },
  };

  protected override async _prepareContext(
    options: foundry.applications.api.ApplicationRenderOptions,
  ): Promise<Record<string, unknown>> {
    const context = await super._prepareContext(options);
    const localizedOptions = (prefix: string, keys: readonly string[]): Record<string, string> =>
      Object.fromEntries(keys.map((key) => [key, game.i18n.localize(`${prefix}.${key}`)]));

    return {
      ...context,
      item: this.item,
      system: this.item.system,
      // A toggled <prose-mirror> shows its *body*, not its value, while closed
      // (see sheets/enrich.ts) — without this the description reads as blank.
      enrichedDescription: await enrichField(
        (this.item.system as { description?: string }).description,
        { secrets: this.item.isOwner, relativeTo: this.item },
      ),
      typeLabel: game.i18n.localize(`FALLOUT.ItemTypes.${this.item.type}`),
      weaponTypes: localizedOptions("FALLOUT.WeaponTypes", [
        ...MELEE_WEAPON_TYPES,
        ...RANGED_WEAPON_TYPES,
      ]),
      armorTypes: localizedOptions("FALLOUT.ArmorTypes", ARMOR_TYPES),
      damageTypes: localizedOptions("FALLOUT.DamageTypes", DAMAGE_TYPES),
      aidTypes: localizedOptions("FALLOUT.AidTypes", AID_TYPES),
      effects: Array.from(this.item.effects).map((effect) => ({
        id: effect.id,
        name: effect.name,
        img: effect.img,
        disabled: effect.disabled,
      })),
      editable: this.isEditable,
      ...(this.item.type === "weapon" ? this.#modContext() : {}),
    };
  }

  /**
   * Everything the weapon sheet's modifications panel renders.
   *
   * The panel is on the *item* sheet rather than the character sheet because a
   * modification belongs to a weapon: the slot budget, the eligibility clauses
   * and the printed "or" are all facts about one document, and a weapon in a
   * GM's sidebar with no owner at all still has all three — which is why the
   * readout renders there and only the *fitting* asks for an actor. The one
   * clause that spans two weapons (Lucky Charm) is announced from
   * `actions/mods.ts` after an attach, which is where an actor is in scope.
   *
   * The picker lists every mod in the table, not only the eligible ones, and
   * marks the ineligible with a bullet. `modEligibility` is advisory by design —
   * the melee table hands the question to the GM outright — so hiding the rows
   * it fails would turn an advisory into a refusal by way of the UI.
   */
  #modContext(): Record<string, unknown> {
    const system = this.item.system as WeaponData;
    const attachedKeys = system.attachedModKeys;
    const rangedAttached = attachedKeys.filter((key) => WEAPON_MODS[key].category === "ranged");
    const pending = system.pendingModChoices;
    const weapon = {
      weaponType: system.weaponType,
      name: this.item.name,
      special: system.special,
      attached: attachedKeys,
    };

    return {
      modSlots: {
        used: slotsUsed(rangedAttached),
        limit: RANGED_MOD_SLOTS,
        ceased: ceasesFunction(attachedKeys),
      },
      modChoicesPending: pending,
      modChoiceOptions: Object.fromEntries(
        MOD_CHOICES.map((choice) => [choice, game.i18n.localize(`FALLOUT.Mods.choices.${choice}`)]),
      ),
      attachedMods: attachedKeys.map((key) => {
        const definition = WEAPON_MODS[key];
        return {
          key,
          name: game.i18n.localize(`FALLOUT.Mods.names.${key}`),
          page: definition.page,
          slots: definition.slots,
          automation: game.i18n.localize(`FALLOUT.Mods.automation.${definition.automation}`),
          // Only the rows that print an "or" get a picker, and it shows blank
          // until somebody answers — an unanswered choice is a question, not a
          // default, so the derivation must not be handed one.
          ...(MOD_CHOICE_KEYS.includes(key)
            ? { choice: { selected: system.modChoices[key] ?? "" } }
            : {}),
        };
      }),
      attachableMods: Object.fromEntries(
        MOD_KEYS.filter((key) => !attachedKeys.includes(key)).map((key) => {
          const fits = modEligibility(key, weapon).ok;
          const label = game.i18n.localize(`FALLOUT.Mods.names.${key}`);
          return [key, fits ? label : `• ${label}`];
        }),
      ),
    };
  }

  /** Fit the mod the picker is showing. */
  async #onAttachMod(): Promise<void> {
    const picker = this.element.querySelector<HTMLSelectElement>("select.mod-picker");
    const key = modKeyFrom(picker?.value ?? "");
    if (!key) {
      ui.notifications.warn(game.i18n.localize("FALLOUT.Mods.pickFirst"));
      return;
    }
    // Fitting needs an owner, where the readout above does not: the transaction
    // spends the crafted part out of somebody's pack, prices the work off their
    // Intelligence, and posts a card in their voice. A weapon sitting in the
    // sidebar has none of those, so this is the one part of the panel that
    // refuses rather than reporting — there is no actor to report *to*.
    const actor = this.item.actor;
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("FALLOUT.Mods.needsOwner"));
      return;
    }
    await attachMod(actor, this.item, key, actor.system as CharacterData);
    await this.render();
  }

  async #onDetachMod(target: HTMLElement): Promise<void> {
    const key = modKeyFrom(target.closest<HTMLElement>("[data-mod-key]")?.dataset.modKey ?? "");
    if (!key) return;
    const actor = this.item.actor;
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("FALLOUT.Mods.needsOwner"));
      return;
    }
    await detachMod(actor, this.item, key, actor.system as CharacterData);
    await this.render();
  }

  /**
   * A new effect on a perk or trait transfers to whoever owns the item, so its
   * bonuses apply as soon as the perk is added to a character. Core's
   * ActiveEffect sheet handles the change rows.
   */
  async #onCreateEffect(): Promise<void> {
    const [effect] = await this.item.createEmbeddedDocuments("ActiveEffect", [
      {
        name: this.item.name,
        img: this.item.img,
        type: "base",
        transfer: true,
        origin: this.item.uuid,
      },
    ]);
    effect?.sheet.render(true);
  }

  async #onToggleEffect(target: HTMLElement): Promise<void> {
    const effect = this.#effectFromTarget(target);
    if (effect) await effect.update({ disabled: !effect.disabled });
  }

  async #onDeleteEffect(target: HTMLElement): Promise<void> {
    const effect = this.#effectFromTarget(target);
    if (effect) await effect.delete();
  }

  #effectFromTarget(target: HTMLElement): FoundryActiveEffect | undefined {
    const row = target.closest<HTMLElement>("[data-effect-id]");
    const id = row?.dataset.effectId;
    return id ? this.item.effects.get(id) : undefined;
  }
}
