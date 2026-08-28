/**
 * Sheet panel: hiding, detection and Surprise (pg 24, 125, 127, 128), and the
 * rest of the pg 126 Actions in Combat table — Dodge, Shove, Take Cover, Search,
 * Stand, Stow and Equip (pg 126-127).
 *
 * Built to the contract in `src/sheets/panel-registry.ts` and to the shape of
 * the reference panel in `./medical.ts`: actions, context and a partial here,
 * nothing else touched. The rules live in `src/rules/stealth.ts` and
 * `src/rules/actions.ts`, the documents in `src/actions/stealth.ts`; this file
 * presses their buttons and reads back what is already true.
 *
 * Three of these controls act on somebody else — Search, Shove and Determine
 * Surprise — so they use the reference panel's `targetedActor()` discipline.
 * Surprise is the one that takes *many* targets rather than exactly one, and
 * deliberately: pg 125 says *"the GM compares the Sneak checks of anyone hiding
 * with the passive sense score of each creature **on the opposing side**"*, which
 * is a whole side, not one creature.
 *
 * **AP is reported, never deducted** (roadmap item 14). Every figure here comes
 * from `COMBAT_ACTION_AP` — the pg 126 table itself, read once off a rendered
 * page image — so no cost is typed into this project twice.
 */

import type { CharacterData } from "../../data/character";
import {
  breakHidingOnCover,
  cannotSpendApToMove,
  determineSurprise,
  dodge,
  dodgeState,
  endDodge,
  endSurprise,
  equipWeapon,
  heldWeapons,
  hiddenState,
  hide,
  isSurprised,
  leaveCover,
  passiveSenseOf,
  revealAfterAttacking,
  revealHidden,
  searchFor,
  shove,
  sneakAttackPosture,
  standUp,
  stowWeapon,
  takeCover,
  takingCover,
  useDodgeMove,
} from "../../actions/stealth";
import { rollModeFromEvent } from "../../dice/rolls";
import {
  COMBAT_ACTION_AP,
  DODGE_REACTIVE_MOVE_FEET,
  dodgeBenefitLost,
  SHOVE_DEFENSES,
  SHOVE_OUTCOMES,
  SHOVE_PUSH_FEET,
  type ShoveDefense,
  type ShoveOutcome,
} from "../../rules/actions";
import { type CoverDegree } from "../../rules/cover";
import { currentGroupSneak } from "../../rules/party";
import {
  type Concealment,
  NO_CONCEALMENT,
  passiveSneak,
  TRAVEL_PACES,
} from "../../rules/stealth";
import { registerPanel, type PanelHost } from "../panel-registry";

/** Every actor the user has targeted, in selection order. */
function targetedActors(): FoundryActor[] {
  return Array.from(game.user.targets)
    .map((token) => token.actor)
    .filter((actor): actor is FoundryActor => actor !== null);
}

/**
 * The single targeted actor, or null with a warning already shown.
 *
 * Lifted from `./medical.ts` and `./combat-actions.ts` rather than shared, for
 * the reason the second one gives: the discipline is the point, and the warning
 * differs per control — "target the creature you are shoving" and "target the
 * creature you are looking for" are different instructions.
 */
function targetedActor(warning: string): FoundryActor | null {
  const targets = targetedActors();
  if (targets.length !== 1) {
    ui.notifications.warn(game.i18n.localize(warning));
    return null;
  }
  return targets[0] ?? null;
}

/** A button in `prompt()`, and the named form fields it reads on the way out. */
interface PromptButton {
  action: string;
  label: string;
  fields?: string[];
}

/**
 * A small `DialogV2` wrapper — the same one `./combat-actions.ts` carries, for
 * the same reason: two controls here need input the sheet cannot infer (what
 * the hider is concealed by; how the shove target defends and what a win does),
 * and a dialog is the only honest way to ask.
 */
async function prompt(
  title: string,
  content: string,
  buttons: PromptButton[],
): Promise<{ action: string; values: string[] } | null> {
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
          return JSON.stringify({
            action: button.action,
            values: (button.fields ?? []).map(read),
          });
        },
      })),
      { action: "cancel", label: game.i18n.localize("FALLOUT.CombatPanel.cancel") },
    ],
  });
  if (typeof result !== "string") return null;
  try {
    const parsed = JSON.parse(result) as { action: string; values: string[] };
    return { action: parsed.action, values: parsed.values };
  } catch {
    return null;
  }
}

/**
 * The three things pg 127 accepts as concealment, as a `Concealment`.
 *
 * Half and three-quarters cover are deliberately absent: pg 127 requires
 * *"heavily obscured or within full cover"*, and pg 24's looser "if you have
 * cover" is the reading `canHide` declines. Offering half cover in this picker
 * would put the rejected reading back in through the UI.
 */
const HIDE_CONCEALMENTS: Record<string, Concealment> = {
  fullCover: { ...NO_CONCEALMENT, cover: "total" },
  heavilyObscured: { ...NO_CONCEALMENT, heavilyObscured: true },
  invisible: { ...NO_CONCEALMENT, invisible: true },
};

/** The two degrees Take Cover can be entered from (pg 127). */
const TAKE_COVER_FROM: readonly CoverDegree[] = ["half", "threeQuarters"];

function isShoveDefense(value: string): value is ShoveDefense {
  return (SHOVE_DEFENSES as readonly string[]).includes(value);
}

function isShoveOutcome(value: string): value is ShoveOutcome {
  return (SHOVE_OUTCOMES as readonly string[]).includes(value);
}

registerPanel({
  id: "stealth",
  template: "systems/fallout-ttrpg/templates/actor/parts/stealth.hbs",

  actions: {
    /**
     * **Hide** (6 AP, pg 126-127).
     *
     * Two things have to be declared and neither can be guessed: what the hider
     * is concealed by, and who they are hiding *from*. The first is a picker;
     * the second is the targeting selection, because pg 127 prices the DC off
     * *"any nearby enemies passive sense scores"* and this system does not know
     * which tokens count as nearby enemies. With nothing targeted the dialog's
     * DC field is what carries the roll, the same escape hatch Escape's DC
     * override provides for a bear trap.
     */
    async hide(this: PanelHost, event: PointerEvent) {
      const observers = targetedActors();
      const options = Object.keys(HIDE_CONCEALMENTS)
        .map(
          (key) =>
            `<option value="${key}">${game.i18n.localize(`FALLOUT.Hide.concealment.${key}`)}</option>`,
        )
        .join("");
      const suggested = observers.length
        ? Math.max(...observers.map((observer) => passiveSenseOf(observer)))
        : 12;

      const choice = await prompt(
        game.i18n.localize("FALLOUT.Hide.title"),
        `<label style="display:flex;flex-direction:column;gap:0.3rem;">
           ${game.i18n.localize("FALLOUT.Hide.concealmentPick")}
           <select name="concealment">${options}</select>
         </label>
         <label style="display:flex;flex-direction:column;gap:0.3rem;">
           ${game.i18n.localize("FALLOUT.Hide.dcPick", { count: observers.length })}
           <input type="number" name="dc" value="${String(suggested)}" step="1" />
         </label>
         <p class="hint">${game.i18n.localize("FALLOUT.Hide.dialogHint")}</p>`,
        [
          {
            action: "hide",
            label: game.i18n.localize("FALLOUT.Hide.action"),
            fields: ["concealment", "dc"],
          },
        ],
      );
      if (choice === null) return;

      const concealment = HIDE_CONCEALMENTS[choice.values[0] ?? ""];
      if (concealment === undefined) return;
      const dc = Number(choice.values[1]);
      // Targets win over the typed DC: the book's DC *is* their passive senses,
      // and the field only exists for when there are none to read.
      await hide(this.actor, this.characterSystem, {
        concealment,
        observers,
        ...(observers.length === 0 && Number.isFinite(dc) ? { dc } : {}),
        mode: rollModeFromEvent(event),
      });
    },

    /** Left full cover, so the hiding ends (pg 127). */
    async breakHiding(this: PanelHost) {
      await breakHidingOnCover(this.actor, "none");
    },

    /** Attacked from hiding — revealed, unless the weapon is silenced (pg 77). */
    async revealAfterAttacking(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      await revealAfterAttacking(this.actor, target.dataset.silenced === "true");
    },

    /** Drop the hiding by hand. */
    async revealHidden(this: PanelHost) {
      await revealHidden(this.actor);
    },

    /**
     * **Search** (3 AP, pg 126-127) — an active Perception check.
     *
     * With one creature targeted it runs pg 24's contest against them if they
     * are hiding; with nothing targeted it rolls the check and reports it,
     * because the DC for finding an unspecified something is the GM's to set.
     */
    async searchFor(this: PanelHost, event: PointerEvent) {
      const targets = targetedActors();
      await searchFor(
        this.actor,
        this.characterSystem,
        targets.length === 1 ? (targets[0] ?? null) : null,
        rollModeFromEvent(event),
      );
    },

    /**
     * **Determine surprise** (pg 125, combat step 1).
     *
     * Pressed from the sneaker's sheet with the opposing side targeted, which is
     * how the rule is written: the GM compares *"the Sneak checks of anyone
     * hiding"* against *"each creature on the opposing side"*. A Hide already
     * rolled supplies its total; otherwise a Sneak check is rolled here.
     */
    async determineSurprise(this: PanelHost) {
      const opposition = targetedActors();
      if (opposition.length === 0) {
        ui.notifications.warn(game.i18n.localize("FALLOUT.Surprise.noSide"));
        return;
      }
      await determineSurprise([this.actor], opposition);
    },

    /** The surprised creature's first turn has ended (pg 125). */
    async endSurprise(this: PanelHost) {
      await endSurprise(this.actor);
    },

    /** **Dodge** (6 AP, pg 126). */
    async dodge(this: PanelHost) {
      await dodge(this.actor, this.characterSystem);
    },

    /** The Dodge's one free 15-foot reaction move (pg 126). */
    async useDodgeMove(this: PanelHost) {
      await useDodgeMove(this.actor);
    },

    /** Drop the Dodge at the start of your next turn. */
    async endDodge(this: PanelHost) {
      await endDodge(this.actor);
    },

    /**
     * **Shove** (4 AP, pg 127) — the last opposed roll in the book.
     *
     * The dialog asks the two things the book explicitly hands to people rather
     * than to a formula: which check the *target* defends with (*"the target
     * chooses the ability to use"*) and what a win does (*"you either knock the
     * target prone or push it 5 feet"*). The defence is pre-selected to whichever
     * of the target's two numbers is larger, so a target prompted on somebody
     * else's turn is not defended badly by default.
     */
    async shove(this: PanelHost, event: PointerEvent) {
      const target = targetedActor("FALLOUT.Shove.noTarget");
      if (!target) return;

      const targetSystem = target.system as CharacterData;
      const unarmed = targetSystem.derived.skillBonuses.unarmed;
      const agility = targetSystem.derived.abilityMods.agility;
      const best = agility > unarmed ? "agility" : "unarmed";
      const options = SHOVE_DEFENSES.map((defense) => {
        const bonus = defense === "unarmed" ? unarmed : agility;
        const label = game.i18n.localize(
          defense === "unarmed" ? "FALLOUT.Skills.unarmed" : "FALLOUT.Abilities.agility",
        );
        const sign = bonus >= 0 ? `+${String(bonus)}` : String(bonus);
        return `<option value="${defense}"${defense === best ? " selected" : ""}>${label} ${sign}</option>`;
      }).join("");

      const choice = await prompt(
        game.i18n.localize("FALLOUT.Shove.title", { target: target.name }),
        `<label style="display:flex;flex-direction:column;gap:0.3rem;">
           ${game.i18n.localize("FALLOUT.Shove.defensePick")}
           <select name="defense">${options}</select>
         </label>
         <label style="display:flex;align-items:center;gap:0.4rem;">
           <input type="checkbox" name="reach" checked />
           ${game.i18n.localize("FALLOUT.Shove.reach")}
         </label>
         <label style="display:flex;align-items:center;gap:0.4rem;">
           <input type="checkbox" name="size" checked />
           ${game.i18n.localize("FALLOUT.Shove.size")}
         </label>
         <p class="hint">${game.i18n.localize("FALLOUT.Shove.dialogHint")}</p>`,
        [
          {
            action: "prone",
            label: game.i18n.localize("FALLOUT.Shove.knockProne"),
            fields: ["defense", "reach", "size"],
          },
          {
            action: "push",
            label: game.i18n.localize("FALLOUT.Shove.push", { feet: SHOVE_PUSH_FEET }),
            fields: ["defense", "reach", "size"],
          },
        ],
      );
      if (choice === null || !isShoveOutcome(choice.action)) return;

      const defense = choice.values[0] ?? "";
      await shove(this.actor, this.characterSystem, target, {
        ...(isShoveDefense(defense) ? { defense } : {}),
        outcome: choice.action,
        withinReach: choice.values[1] === "true",
        sizeAllows: choice.values[2] === "true",
        mode: rollModeFromEvent(event),
      });
    },

    /** **Take Cover** (3 AP, pg 127): duck from half or three-quarters into full. */
    async takeCover(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const from = target.dataset.cover;
      if (from === undefined) return;
      await takeCover(this.actor, from as CoverDegree);
    },

    /** "If you attack while taking cover, you no longer have full cover" (pg 127). */
    async leaveCover(this: PanelHost) {
      await leaveCover(this.actor);
    },

    /** **Stand up from Prone** (5 AP, pg 126-127). */
    async standUp(this: PanelHost) {
      await standUp(this.actor);
    },

    /** **Stow a weapon** (3 AP, pg 127). */
    async stowWeapon(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const id = target.dataset.itemId;
      const weapon = id === undefined ? undefined : this.actor.items.get(id);
      if (weapon) await stowWeapon(this.actor, weapon);
    },

    /** **Equip a weapon** (3 AP, pg 126). */
    async equipWeapon(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const id = target.dataset.itemId;
      const weapon = id === undefined ? undefined : this.actor.items.get(id);
      if (weapon) await equipWeapon(this.actor, weapon);
    },
  },

  context(actor: FoundryActor, system: CharacterData) {
    const hidden = hiddenState(actor);
    const surprised = isSurprised(actor);
    const dodging = dodgeState(actor);
    const cover = takingCover(actor);
    const targets = targetedActors();
    const single = targets.length === 1 ? targets[0] : undefined;

    const dying = system.resources.hp.value <= 0 || actor.statuses?.has("dying") === true;
    const groupSneak = currentGroupSneak();

    const weapons = actor.itemTypes.weapon ?? [];
    const held = heldWeapons(actor);
    const heldIds = new Set(held.map((item) => item.id));

    return {
      // The header reads like the medical panel's: the bonus actually rolled and
      // the ability governing it. Sneak is Agility-governed and every roll in the
      // hiding half of this panel runs on it.
      sneakBonus: system.derived.skillBonuses.sneak,
      sneakAbility: system.derived.skillAbilities.sneak,
      // The two scores this system has computed since v0.5 and consumed nowhere.
      // They are the whole reason this panel exists, so they are the subtitle.
      passiveSense: system.derived.passiveSense,
      groupSneak,

      // Every cost from the pg 126 table itself — read once, off a page image.
      hideAp: COMBAT_ACTION_AP.hide,
      searchAp: COMBAT_ACTION_AP.search,
      dodgeAp: COMBAT_ACTION_AP.dodge,
      shoveAp: COMBAT_ACTION_AP.shove,
      standAp: COMBAT_ACTION_AP.standUpFromProne,
      dodgeFeet: DODGE_REACTIVE_MOVE_FEET,

      // Hiding, with both lists: one roll can hide you from two guards and not
      // from their sergeant, and the sheet is the only place that can say so.
      hidden: hidden
        ? {
            total: hidden.sneakTotal,
            dc: hidden.dc,
            hiddenFrom: hidden.hiddenFrom.join(", ") || "—",
            seenBy: hidden.seenBy.join(", ") || "—",
            fullCover: hidden.fullCover,
          }
        : null,

      surprised: surprised
        ? {
            passiveSense: surprised.passiveSense,
            missed: surprised.missedThreats.join(", ") || "—",
          }
        : null,

      dodging: dodging ? { moveFeet: dodging.moveFeet, used: dodging.used } : null,
      // Reported rather than enforced: a creature that dodges while grappled has
      // spent 6 AP on nothing, and the sheet says so instead of refusing.
      dodgeLost: dodgeBenefitLost(dying, cannotSpendApToMove(actor)),

      // Degree labels are localized here rather than in the partial, the way
      // `./combat-actions.ts` localizes its strike ability: Handlebars cannot
      // build a localization key, and this project does not ask it to.
      takingCover: cover
        ? { from: game.i18n.localize(`FALLOUT.Cover.degrees.${cover.from}`) }
        : null,
      coverFrom: TAKE_COVER_FROM.map((degree) => ({
        degree,
        label: game.i18n.localize(`FALLOUT.Cover.degrees.${degree}`),
        ap: COMBAT_ACTION_AP.takeCover,
      })),
      prone: actor.statuses?.has("prone") === true,

      // What the attacker's stealth is worth against the current target — the
      // wiring `AttackOptions.sneak` never had. Only shown for exactly one
      // target, since "which creature is unaware of you" has no answer for two.
      posture:
        single === undefined
          ? null
          : { target: single.name, ...sneakAttackPosture(actor, single) },
      targetCount: targets.length,

      // Passive Sneak (pg 116) — the other consumer of Group Sneak, and the
      // reason that score existed. Distance, fatigue and the pace's own
      // combat-sequence rider belong to the Movement chapter, not here.
      passiveSneak: TRAVEL_PACES.map((pace) => ({
        pace,
        label: game.i18n.localize(`FALLOUT.Stealth.pace.${pace}`),
        score: passiveSneak(pace, groupSneak),
      })),

      // Stow acts on what is held, Equip on what is not — the two lists the
      // pg 126-127 pair of actions moves items between.
      held: held.map((item) => ({
        id: item.id,
        name: item.name,
        ap: COMBAT_ACTION_AP.stowWeapon,
      })),
      stowed: weapons
        .filter((item) => !heldIds.has(item.id))
        .map((item) => ({
          id: item.id,
          name: item.name,
          ap: COMBAT_ACTION_AP.equipWeapon,
        })),
    };
  },
});
