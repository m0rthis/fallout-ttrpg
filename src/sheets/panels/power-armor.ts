/**
 * Sheet panel: the pg 59 Power Armor upgrade table and its controls.
 *
 * The suit's *state* — allotted time, decay, overheat threshold, radiation band
 * — already has a block in the main sheet template. This is the other half: the
 * nineteen upgrades, the seven things a wearer can press, and the button that
 * rebuilds the Active Effects the ranks imply.
 *
 * Three things shape it:
 *
 * - **Nothing here is hand-written per upgrade.** Every row comes out of
 *   `POWER_ARMOR_UPGRADES`, is written through `upgradeRankPath(key)` and is
 *   clamped by `clampRank`, so an upgrade added to the table appears here with
 *   no edit, and one whose printed maximum changes cannot drift out of step.
 * - **The panel says how far each upgrade is actually automated.** The
 *   `automation` field on the table is the honest half of it (pg 59 is a long
 *   table and this system runs about two thirds of it), and hiding that would
 *   let a player buy Headlamp for 250 caps expecting the light to work.
 * - **Ranks are edited by hand, so effects do not follow by themselves.** The
 *   sync is a button somebody presses, never a hook — `src/actions/situations.ts`
 *   sets out at length why this system refuses to write documents in response to
 *   document writes.
 *
 * Ranks are set by clicking a pip rather than typing into a field: the sheet is
 * one form bound to the *actor*, and these ranks live on the suit *item*, so a
 * named input would submit an actor path that does not exist. Clicking the rank
 * you already have steps back down, which is how a rank returns to 0 — the same
 * trick the karma caps use.
 */

import type { ArmorData } from "../../data/armor";
import {
  flyWithJetPack,
  optimizedBracersStrike,
  overclockOverheat,
  powerArmorItem,
  queryInternalDatabase,
  spendAllottedTime,
  syncPowerArmorEffects,
  toggleTeslaCoils,
  triggerExplosiveVent,
} from "../../actions/power-armor";
import {
  clampRank,
  EXPLOSIVE_VENT_DRAIN_MINUTES,
  EXPLOSIVE_VENT_FALL_FEET,
  INTERNAL_DATABASE_AP,
  INTERNAL_DATABASE_STATS,
  type InternalDatabaseStat,
  JET_PACK_AP_PER_FEET,
  OPTIMIZED_BRACERS_AP,
  OVERCLOCK_OVERHEAT_AP,
  POWER_ARMOR_UPGRADE_KEYS,
  POWER_ARMOR_UPGRADES,
  type PowerArmorUpgrade,
  TESLA_ACTIVATE_AP,
  upgradeRankPath,
} from "../../rules/power-armor";
import { registerPanel, type PanelHost } from "../panel-registry";

/** The upgrade rank each control needs before the book lets you press it (pg 59). */
const CONTROL_REQUIREMENTS: Readonly<Record<string, { upgrade: PowerArmorUpgrade; rank: number }>> =
  {
    toggleTeslaCoils: { upgrade: "teslaCoils", rank: 1 },
    flyWithJetPack: { upgrade: "jetPack", rank: 1 },
    triggerExplosiveVent: { upgrade: "explosiveVent", rank: 1 },
    // Rank 2 is the one that lets you overheat yourself on purpose; rank 1 is
    // the buff that makes doing so worth anything.
    overclockOverheat: { upgrade: "overclockHydraulics", rank: 2 },
    optimizedBracersStrike: { upgrade: "optimizedBracers", rank: 1 },
    queryInternalDatabase: { upgrade: "internalDatabase", rank: 1 },
  };

function localize(key: string, data?: Record<string, string | number>): string {
  return data === undefined ? game.i18n.localize(key) : game.i18n.localize(key, data);
}

/**
 * A localized string, or "" when the key does not exist.
 *
 * Foundry hands back the key itself for a miss, which is exactly what a sheet
 * must not render. Only nine of the nineteen upgrades have a hand-application
 * note, and which nine is the lang file's business, not a list repeated here.
 */
function optionalText(key: string): string {
  const text = game.i18n.localize(key);
  return text === key ? "" : text;
}

function isUpgradeKey(value: string | undefined): value is PowerArmorUpgrade {
  return value !== undefined && (POWER_ARMOR_UPGRADE_KEYS as string[]).includes(value);
}

/**
 * The equipped suit, or null with a warning already shown.
 *
 * Every control routes through this so the panel and the actions it calls agree
 * on which document they are talking about: `powerArmorItem` is the same lookup
 * `src/actions/power-armor.ts` performs internally.
 */
function suitOf(host: PanelHost): FoundryItem | null {
  const item = powerArmorItem(host.actor);
  if (!item) {
    ui.notifications.warn(localize("FALLOUT.PowerArmor.noSuit"));
    return null;
  }
  return item;
}

/**
 * The single targeted actor, or null with a warning already shown.
 *
 * The same strictness as the first-aid panel, for the same reason: the Internal
 * database reads one creature's numbers, and "whichever token happened to be
 * first in the set" is not a creature anybody chose.
 */
function targetedOne(): boolean {
  const targets = Array.from(game.user.targets).filter((token) => token.actor !== null);
  if (targets.length !== 1) {
    ui.notifications.warn(localize("FALLOUT.PowerArmor.pickOneTarget"));
    return false;
  }
  return true;
}

/**
 * A small DialogV2 wrapper, mirroring the sheet's own private `#prompt`.
 *
 * A panel cannot reach a private method on the class it is mounted on, and the
 * registry deliberately hands panels the smallest host surface it can, so this
 * is a copy rather than a shared helper. Buttons carry `{ action, label, field }`
 * only — nothing here needs a per-button default.
 */
async function prompt(
  title: string,
  content: string,
  button: { action: string; label: string; field: string },
): Promise<string | null> {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content,
    rejectClose: false,
    buttons: [
      {
        action: button.action,
        label: button.label,
        default: true,
        callback: (_event: Event, element: HTMLButtonElement) => {
          const field = element.form?.elements.namedItem(button.field);
          if (field instanceof HTMLInputElement) return field.value;
          return field instanceof HTMLSelectElement ? field.value : "";
        },
      },
      { action: "cancel", label: localize("FALLOUT.Targeted.cancel") },
    ],
  });
  return typeof result === "string" ? result : null;
}

/** Ask for a count of something, refusing anything that is not a real number. */
async function promptNumber(
  titleKey: string,
  labelKey: string,
  hintKey: string,
  actionKey: string,
  initial: number,
  step: number,
): Promise<number | null> {
  const answer = await prompt(
    localize(titleKey),
    `<label style="display:flex;gap:0.5rem;align-items:center;">
       ${localize(labelKey)}
       <input type="number" name="amount" value="${String(initial)}" min="1" step="${String(step)}" />
     </label>
     <p class="hint">${localize(hintKey)}</p>`,
    { action: "confirm", label: localize(actionKey), field: "amount" },
  );
  if (answer === null) return null;
  const value = Number(answer);
  // A blank field parses as 0 and a typo as NaN; neither is a flight or a
  // stretch of time, and both would post a card claiming nothing happened.
  return Number.isFinite(value) && value > 0 ? value : null;
}

interface UpgradeView {
  key: PowerArmorUpgrade;
  label: string;
  rank: number;
  maxRank: number;
  installed: boolean;
  /** The `automation` field, as a CSS class hook. */
  automation: string;
  /** False only for the rows this system deliberately does not run. */
  automated: boolean;
  automationLabel: string;
  /** What the badge means, plus the upgrade's hand-application note if it has one. */
  hint: string;
  pips: { rank: number; filled: boolean }[];
}

interface ControlView {
  action: string;
  label: string;
  hint: string;
  /** The printed cost, already formatted; "" where the book prints none. */
  cost: string;
  /** Whether the suit carries the rank this control needs. */
  available: boolean;
}

function upgradeViews(armor: ArmorData): UpgradeView[] {
  return POWER_ARMOR_UPGRADE_KEYS.map((key) => {
    const definition = POWER_ARMOR_UPGRADES[key];
    const rank = armor.upgradeRank(key);
    const note = optionalText(`FALLOUT.PowerArmor.manual.${key}`);
    const badge = localize(`FALLOUT.PowerArmor.automation.${definition.automation}`);
    const badgeHint = localize(`FALLOUT.PowerArmor.automationHint.${definition.automation}`);
    return {
      key,
      label: localize(`FALLOUT.PowerArmor.upgrade.${key}`),
      rank,
      maxRank: definition.maxRank,
      installed: rank > 0,
      automation: definition.automation,
      automated: definition.automation !== "text",
      automationLabel: badge,
      hint: note === "" ? badgeHint : `${badgeHint} ${note}`,
      // Only the ranks the pg 59 table actually prints, so a one-rank upgrade
      // shows one pip and cannot be clicked to 2.
      pips: Array.from({ length: definition.maxRank }, (_unused, index) => ({
        rank: index + 1,
        filled: rank >= index + 1,
      })),
    };
  });
}

function controlViews(armor: ArmorData): ControlView[] {
  const has = (action: string): boolean => {
    const requirement = CONTROL_REQUIREMENTS[action];
    return requirement === undefined || armor.upgradeRank(requirement.upgrade) >= requirement.rank;
  };
  const hintFor = (action: string, key: string): string => {
    const hint = localize(key);
    const requirement = CONTROL_REQUIREMENTS[action];
    if (requirement === undefined || has(action)) return hint;
    return `${hint} ${localize("FALLOUT.PowerArmor.requiresRank", {
      upgrade: localize(`FALLOUT.PowerArmor.upgrade.${requirement.upgrade}`),
      rank: requirement.rank,
    })}`;
  };
  const control = (action: string, labelKey: string, hintKey: string, cost: string): ControlView => ({
    action,
    label: localize(labelKey),
    hint: hintFor(action, hintKey),
    cost,
    available: has(action),
  });

  return [
    control(
      "toggleTeslaCoils",
      armor.teslaCoilsActive
        ? "FALLOUT.PowerArmor.teslaOffButton"
        : "FALLOUT.PowerArmor.teslaOnButton",
      "FALLOUT.PowerArmor.teslaButtonHint",
      localize("FALLOUT.PowerArmor.apCost", { ap: TESLA_ACTIVATE_AP }),
    ),
    control(
      "flyWithJetPack",
      "FALLOUT.PowerArmor.jetPackButton",
      "FALLOUT.PowerArmor.jetPackButtonHint",
      localize("FALLOUT.PowerArmor.perFeetCost", { ap: 1, feet: JET_PACK_AP_PER_FEET }),
    ),
    control(
      "triggerExplosiveVent",
      "FALLOUT.PowerArmor.ventButton",
      "FALLOUT.PowerArmor.ventButtonHint",
      // The vent prints no AP at all — it is a landing, and what it costs is
      // twenty minutes of core.
      localize("FALLOUT.PowerArmor.minutesCost", { minutes: EXPLOSIVE_VENT_DRAIN_MINUTES }),
    ),
    control(
      "overclockOverheat",
      "FALLOUT.PowerArmor.overclockButton",
      "FALLOUT.PowerArmor.overclockButtonHint",
      localize("FALLOUT.PowerArmor.apCost", { ap: OVERCLOCK_OVERHEAT_AP }),
    ),
    control(
      "optimizedBracersStrike",
      "FALLOUT.PowerArmor.bracersButton",
      "FALLOUT.PowerArmor.bracersButtonHint",
      localize("FALLOUT.PowerArmor.apCost", { ap: OPTIMIZED_BRACERS_AP }),
    ),
    control(
      "queryInternalDatabase",
      "FALLOUT.PowerArmor.databaseButton",
      "FALLOUT.PowerArmor.databaseButtonHint",
      localize("FALLOUT.PowerArmor.apCost", { ap: INTERNAL_DATABASE_AP }),
    ),
    // The last two belong to no upgrade: one is the drain the book never rates,
    // the other is the effect rebuild that hand-edited ranks require.
    control(
      "spendAllottedTime",
      "FALLOUT.PowerArmor.spendTime",
      "FALLOUT.PowerArmor.spendTimeHint",
      "",
    ),
    control(
      "syncUpgradeEffects",
      "FALLOUT.PowerArmor.syncUpgrades",
      "FALLOUT.PowerArmor.syncUpgradesHint",
      "",
    ),
  ];
}

registerPanel({
  id: "powerArmor",
  template: "systems/fallout-ttrpg/templates/actor/parts/power-armor.hbs",

  actions: {
    /**
     * Set one upgrade's rank, then rebuild the effects it grants.
     *
     * The sync here is not the hook this system refuses to write: it is the
     * click that just happened, on the one control that can change the answer
     * from inside the sheet. The standalone "apply upgrade effects" button stays
     * because ranks also change from the item sheet, a compendium import, or a
     * console one-liner, and nothing tells this panel when they do.
     */
    async setUpgradeRank(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const item = suitOf(this);
      if (!item) return;
      const key = target.dataset.upgrade;
      if (!isUpgradeKey(key)) return;
      const clicked = Number(target.dataset.rank);
      if (!Number.isInteger(clicked)) return;

      const armor = item.system as ArmorData;
      const current = armor.upgradeRank(key);
      const next = clampRank(current === clicked ? clicked - 1 : clicked, key);
      if (next === current) return;
      await item.update({ [upgradeRankPath(key)]: next });
      await syncPowerArmorEffects(this.actor, item);
      this.render();
    },

    async toggleTeslaCoils(this: PanelHost) {
      const item = suitOf(this);
      if (!item) return;
      await toggleTeslaCoils(this.actor, item);
      // The button's own label is the toggle's state, so it has to come back.
      this.render();
    },

    async flyWithJetPack(this: PanelHost) {
      const item = suitOf(this);
      if (!item) return;
      const feet = await promptNumber(
        "FALLOUT.PowerArmor.jetPackButton",
        "FALLOUT.PowerArmor.jetPackFeet",
        "FALLOUT.PowerArmor.jetPackButtonHint",
        "FALLOUT.PowerArmor.fly",
        JET_PACK_AP_PER_FEET,
        JET_PACK_AP_PER_FEET,
      );
      if (feet === null) return;
      await flyWithJetPack(this.actor, item, feet);
    },

    async triggerExplosiveVent(this: PanelHost) {
      const item = suitOf(this);
      if (!item) return;
      await triggerExplosiveVent(this.actor, item);
    },

    async overclockOverheat(this: PanelHost) {
      const item = suitOf(this);
      if (!item) return;
      await overclockOverheat(this.actor, item);
      // Overheating switches the rank 1 buff on and can eject the wearer, and
      // both of those change what this panel is allowed to show.
      this.render();
    },

    async optimizedBracersStrike(this: PanelHost) {
      const item = suitOf(this);
      if (!item) return;
      await optimizedBracersStrike(this.actor, item);
    },

    async queryInternalDatabase(this: PanelHost) {
      const item = suitOf(this);
      if (!item) return;
      // Asked before the stat, so nobody picks a reading and is then told there
      // was nothing to read it from.
      if (!targetedOne()) return;
      const options = INTERNAL_DATABASE_STATS.map(
        (stat) =>
          `<option value="${stat}">${localize(`FALLOUT.PowerArmor.stat.${stat}`)}</option>`,
      ).join("");
      const answer = await prompt(
        localize("FALLOUT.PowerArmor.databaseButton"),
        `<label style="display:flex;flex-direction:column;gap:0.3rem;">
           ${localize("FALLOUT.PowerArmor.databasePick")}
           <select name="stat">${options}</select>
         </label>
         <p class="hint">${localize("FALLOUT.PowerArmor.databaseButtonHint")}</p>`,
        { action: "query", label: localize("FALLOUT.PowerArmor.query"), field: "stat" },
      );
      if (answer === null) return;
      if (!(INTERNAL_DATABASE_STATS as readonly string[]).includes(answer)) return;
      await queryInternalDatabase(this.actor, item, answer as InternalDatabaseStat);
    },

    async spendAllottedTime(this: PanelHost) {
      const item = suitOf(this);
      if (!item) return;
      const minutes = await promptNumber(
        "FALLOUT.PowerArmor.spendTime",
        "FALLOUT.PowerArmor.minutes",
        "FALLOUT.PowerArmor.spendTimeHint",
        "FALLOUT.PowerArmor.spend",
        30,
        5,
      );
      if (minutes === null) return;
      await spendAllottedTime(this.actor, item, minutes);
    },

    /** Rebuild the upgrade effects after ranks were edited somewhere else. */
    async syncUpgradeEffects(this: PanelHost) {
      const item = suitOf(this);
      if (!item) return;
      const changed = await syncPowerArmorEffects(this.actor, item);
      ui.notifications.info(localize("FALLOUT.PowerArmor.syncDone", { count: changed }));
      this.render();
    },
  },

  // The suit is an item, so nothing here needs the actor's system data — the
  // registry's second argument is simply not taken.
  context(actor: FoundryActor) {
    const item = powerArmorItem(actor);
    // No suit, no panel: the partial renders nothing at all rather than an
    // empty frame, which is what `worn` gates in the template.
    if (!item) return { worn: false };
    const armor = item.system as ArmorData;
    return {
      worn: true,
      suit: item.name,
      // A suit is un-equipped when it ceases, so this is only reachable when a
      // GM has set the flag by hand — worth saying rather than silently
      // offering controls that will all refuse.
      ceased: armor.ceased,
      fallFeet: EXPLOSIVE_VENT_FALL_FEET,
      upgrades: upgradeViews(armor),
      controls: controlViews(armor),
    };
  },
});
