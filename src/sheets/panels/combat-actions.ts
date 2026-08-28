/**
 * Sheet panel: the v2.1 combat actions — Grapple, Escape, Unarmed Strike, Help
 * and Ready (pg 126-127).
 *
 * Built to the contract in `src/sheets/panel-registry.ts` and to the shape of
 * the reference panel in `./medical.ts`: actions, context and a partial here,
 * nothing else touched. The rules all live in `src/rules/grapple.ts` and
 * `src/actions/combat-actions.ts`; this file only presses their buttons and
 * reads back what is already true.
 *
 * Two of these actions land on somebody *else* — Grapple and Help — so they use
 * the reference panel's `targetedActor()` discipline: exactly one target, or a
 * refusal. A grapple check spent on the wrong body is the same waste a first-aid
 * check on the wrong patient is, and the sheet has no better guess to make.
 *
 * **AP is reported, never deducted** (roadmap item 14). Every cost shown here
 * comes from the rules module — `unarmedStrikeApCost` for the strike bundles,
 * the `*_AP_COST` constants for the rest — so the panel cannot drift from the
 * book by having a number typed into it twice. The one number that moves is
 * Ready's refund, and that is the book handing AP back rather than this system
 * taking any.
 */

import type { CharacterData } from "../../data/character";
import {
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
} from "../../actions/combat-actions";
import { rollFrightenedCheck, rollModeFromEvent } from "../../dice/rolls";
import {
  ESCAPE_AP_COST,
  GRAPPLE_AP_COST,
  HELP_AP_COST,
  READY_AP_SURCHARGE,
  SKILL_KEYS,
  type SkillKey,
} from "../../rules/constants";
import {
  helpBonus,
  readyRecycledAP,
  unarmedContestDC,
  unarmedStrikeAbility,
  unarmedStrikeApCost,
} from "../../rules/grapple";
import { registerPanel, type PanelHost } from "../panel-registry";

/**
 * The single targeted actor, or null with a warning already shown.
 *
 * Lifted deliberately from `./medical.ts` rather than shared: the reference
 * panel's whole point is that a target-taking control refuses instead of
 * guessing, and both actions here have the same one-medic-one-patient shape.
 * The warning is a parameter because "target a creature to grapple" and "target
 * the ally you are helping" are different instructions.
 */
function targetedActor(warning: string): FoundryActor | null {
  const targets = Array.from(game.user.targets)
    .map((token) => token.actor)
    .filter((actor): actor is FoundryActor => actor !== null);
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
  field?: string;
  fields?: string[];
}

/**
 * A small `DialogV2` wrapper, the same shape the character sheet uses for its
 * own prompts: render some named controls, hand back which button was pressed
 * and what those controls held.
 *
 * Three of this panel's controls need input the sheet cannot infer — a GM's DC
 * for a restraint, the skill a Help relates to, a Ready's trigger and price —
 * and a dialog is the only honest way to ask. Note the button descriptors carry
 * no `default`: the first button is defaulted here, and the descriptor type
 * deliberately has no such key.
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
          const names = button.fields ?? (button.field === undefined ? [] : [button.field]);
          return JSON.stringify({ action: button.action, values: names.map(read) });
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

function isSkillKey(value: string): value is SkillKey {
  return (SKILL_KEYS as readonly string[]).includes(value);
}

function signed(value: number): string {
  return value >= 0 ? `+${String(value)}` : String(value);
}

/** Whether anything on the sheet says this creature is being held. */
function heldFast(actor: FoundryActor): boolean {
  const statuses = actor.statuses;
  return statuses?.has("grappled") === true || statuses?.has("restrained") === true;
}

/**
 * The unarmed-strike bundles the panel offers, in the order they are printed.
 *
 * Only the shapes are listed; every price comes from `unarmedStrikeApCost`,
 * which is the module that knows the book prices exactly two bundles (pg 127)
 * and that Holey Moley (pg 52) buys one more strike on top of either. A bundle
 * the rules price at null is dropped rather than shown with a guessed cost.
 */
const UNARMED_BUNDLES: readonly { strikes: number; extra: boolean }[] = [
  { strikes: 1, extra: false },
  { strikes: 2, extra: false },
  { strikes: 3, extra: true },
];

registerPanel({
  id: "combatActions",
  template: "systems/fallout-ttrpg/templates/actor/parts/combat-actions.hbs",

  actions: {
    /**
     * The Frightened check (pg 134).
     *
     * `rollFrightenedCheck` implements every part of v2.1's rework — Endurance
     * **or** Charisma, escape at succeed-by-10 where v2.0 said 5, the
     * critical-failure tier that doubles the duration — and until this button
     * existed nothing called it. A GM could reach a finished, correct roll only
     * by writing a macro.
     *
     * The DC is asked for rather than derived: it is `8 + the frightening
     * creature's Intimidation bonus`, and the frightening creature is not the
     * target of this roll and may not be on the canvas at all. The ability is
     * asked in the same breath because the book gives the choice to the player
     * and prints no tiebreak.
     */
    async rollFrightened(this: PanelHost) {
      const choice = await prompt(
        game.i18n.localize("FALLOUT.Frightened.dialogTitle"),
        `<label style="display:flex;flex-direction:column;gap:0.3rem;">
           ${game.i18n.localize("FALLOUT.Frightened.pickDc")}
           <input type="number" name="dc" value="8" min="0" step="1" />
         </label>
         <label style="display:flex;flex-direction:column;gap:0.3rem;margin-top:0.4rem;">
           ${game.i18n.localize("FALLOUT.Frightened.pickAbility")}
           <select name="ability">
             <option value="endurance">${game.i18n.localize("FALLOUT.Abilities.endurance")}</option>
             <option value="charisma">${game.i18n.localize("FALLOUT.Abilities.charisma")}</option>
           </select>
         </label>
         <p class="hint">${game.i18n.localize("FALLOUT.Frightened.dcHint")}</p>`,
        [
          {
            action: "roll",
            label: game.i18n.localize("FALLOUT.Frightened.roll"),
            fields: ["dc", "ability"],
          },
        ],
      );
      if (!choice) return;
      const [rawDc = "8", rawAbility = "endurance"] = choice.values;
      const dc = Number(rawDc);
      if (!Number.isFinite(dc)) return;
      await rollFrightenedCheck(
        this.actor,
        this.characterSystem,
        dc,
        rawAbility === "charisma" ? "charisma" : "endurance",
      );
    },

    /** Grapple the targeted creature (3 AP, pg 126). */
    async grapple(this: PanelHost, event: PointerEvent) {
      const target = targetedActor("FALLOUT.Grapple.noTarget");
      if (target) {
        await grapple(this.actor, this.characterSystem, target, {
          mode: rollModeFromEvent(event),
        });
      }
    },

    /**
     * Escape whatever is holding you (5 AP, pg 126).
     *
     * Three cases, and only the first needs nothing from the user:
     *
     * - A Grapple recorded its grappler, so the DC is `10 + their Unarmed`
     *   and this just rolls it.
     * - Something else is holding you — a bear trap (pg 80), a rope (pg 81), a
     *   Clasp weapon (pg 61), or a status a GM toggled on. pg 126 prices the DC
     *   off "the creature's Unarmed skill" and none of those is a creature, so
     *   this asks the GM for the number the way the book does, and offers the
     *   Clasp disadvantage in the same breath since a Clasp grapple is applied
     *   by hand today.
     * - Nothing says you are held at all, which is a refusal: rolling an Escape
     *   against nothing spends AP for a result no rule reads.
     */
    async escapeGrapple(this: PanelHost, event: PointerEvent) {
      const mode = rollModeFromEvent(event);
      if (grappledBy(this.actor) !== null) {
        await escapeGrapple(this.actor, this.characterSystem, { mode });
        return;
      }
      if (!heldFast(this.actor)) {
        ui.notifications.warn(game.i18n.localize("FALLOUT.CombatPanel.notHeld"));
        return;
      }

      const choice = await prompt(
        game.i18n.localize("FALLOUT.CombatPanel.escapeTitle"),
        `<label style="display:flex;flex-direction:column;gap:0.3rem;">
           ${game.i18n.localize("FALLOUT.CombatPanel.escapeDcPick")}
           <input type="number" name="dc" value="15" min="0" step="1" />
         </label>
         <label style="display:flex;align-items:center;gap:0.4rem;">
           <input type="checkbox" name="clasp" />
           ${game.i18n.localize("FALLOUT.CombatPanel.escapeClasp")}
         </label>
         <p class="hint">${game.i18n.localize("FALLOUT.CombatPanel.escapeDcHint")}</p>`,
        [
          {
            action: "escape",
            label: game.i18n.localize("FALLOUT.Escape.action"),
            fields: ["dc", "clasp"],
          },
        ],
      );
      if (choice === null) return;
      const dc = Number(choice.values[0]);
      if (!Number.isFinite(dc)) return;
      await escapeGrapple(this.actor, this.characterSystem, {
        dc,
        clasp: choice.values[1] === "true",
        mode,
      });
    },

    /**
     * One unarmed strike, two for 5 AP, or three with Holey Moley (pg 127, 52).
     *
     * The bundle rides on the button's dataset rather than a dialog, because
     * the book prices a fixed and very short list of them.
     */
    async unarmedStrike(this: PanelHost, event: PointerEvent, target: HTMLElement) {
      const strikes = Number(target.dataset.strikes ?? "1");
      if (!Number.isFinite(strikes)) return;
      await unarmedStrike(this.actor, this.characterSystem, {
        strikes,
        extraStrike: target.dataset.extra === "true",
        mode: rollModeFromEvent(event),
      });
    },

    /**
     * Help the targeted ally (6 AP, pg 127).
     *
     * Two branches and two buttons, because they are two different rules: the
     * check branch hands over half the helper's bonus *in a named skill*, which
     * is why the skill picker exists and why there is no default — the book
     * makes the number depend on it. The attack branch takes no skill and still
     * grants flat advantage, unchanged from v2.0.
     *
     * The picker shows both numbers per skill (the helper's bonus, and the half
     * the ally would receive) so the choice is made on what it is worth rather
     * than on a guess — including when it is worth a penalty, which a negative
     * bonus makes it.
     */
    async helpAlly(this: PanelHost) {
      const ally = targetedActor("FALLOUT.CombatPanel.helpNoTarget");
      if (!ally) return;

      const bonuses = this.characterSystem.derived.skillBonuses;
      const options = SKILL_KEYS.map((skill) => {
        const label = game.i18n.localize(`FALLOUT.Skills.${skill}`);
        return `<option value="${skill}">${label} ${signed(bonuses[skill])} → ${signed(
          helpBonus(bonuses[skill]),
        )}</option>`;
      }).join("");

      const choice = await prompt(
        game.i18n.localize("FALLOUT.CombatPanel.helpTitle", { ally: ally.name }),
        `<label style="display:flex;flex-direction:column;gap:0.3rem;">
           ${game.i18n.localize("FALLOUT.CombatPanel.helpPick")}
           <select name="skill">${options}</select>
         </label>
         <p class="hint">${game.i18n.localize("FALLOUT.CombatPanel.helpHint")}</p>`,
        [
          {
            action: "check",
            label: game.i18n.localize("FALLOUT.CombatPanel.helpCheck"),
            field: "skill",
          },
          { action: "attack", label: game.i18n.localize("FALLOUT.CombatPanel.helpAttack") },
        ],
      );
      if (choice === null) return;

      if (choice.action === "attack") {
        await helpAlly(this.actor, this.characterSystem, ally, { mode: "attack" });
        return;
      }
      const skill = choice.values[0];
      if (skill === undefined || !isSkillKey(skill)) return;
      await helpAlly(this.actor, this.characterSystem, ally, { mode: "check", skill });
    },

    /**
     * Ready an action (+2 AP, pg 126).
     *
     * The book requires two things this sheet cannot know — *"you must specify
     * what the trigger is"*, and the readied action's own AP, since Ready is
     * printed as a surcharge on top of a cost rather than as a cost — so both
     * are asked for. A trigger of empty text is refused: the marker's entire
     * job is to record what the table agreed the trigger was.
     *
     * A frightened creature gets pg 134's Freeze permission printed on the
     * card. Freeze is not enforced anywhere — nothing in this system gates AP
     * spending, and "while the source of their fear is within sight" is state
     * nothing records — so this prints the one sentence that helps and claims
     * nothing further.
     */
    async readyAction(this: PanelHost) {
      const choice = await prompt(
        game.i18n.localize("FALLOUT.CombatPanel.readyTitle"),
        `<label style="display:flex;flex-direction:column;gap:0.3rem;">
           ${game.i18n.localize("FALLOUT.CombatPanel.readyTrigger")}
           <input type="text" name="trigger" />
         </label>
         <label style="display:flex;flex-direction:column;gap:0.3rem;">
           ${game.i18n.localize("FALLOUT.CombatPanel.readyCost", { surcharge: READY_AP_SURCHARGE })}
           <input type="number" name="ap" value="3" min="0" step="1" />
         </label>
         <p class="hint">${game.i18n.localize("FALLOUT.Ready.hint")}</p>`,
        [
          {
            action: "ready",
            label: game.i18n.localize("FALLOUT.Ready.action"),
            fields: ["trigger", "ap"],
          },
        ],
      );
      if (choice === null) return;

      const trigger = (choice.values[0] ?? "").trim();
      const ap = Number(choice.values[1]);
      if (trigger === "" || !Number.isFinite(ap)) {
        ui.notifications.warn(game.i18n.localize("FALLOUT.CombatPanel.readyNeedsTrigger"));
        return;
      }
      await readyAction(
        this.actor,
        trigger,
        ap,
        this.actor.statuses?.has("frightened") === true,
      );
    },

    /** The trigger fired: clear the marker, refund nothing (pg 126). */
    async triggerReady(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      // The row names which readied action it is; without one, resolve them all.
      const id = target.dataset.effectId;
      await triggerReady(this.actor, ...(id === undefined ? [] : [id]));
    },

    /** The trigger never came: clear the marker and bank half the AP (pg 126). */
    async lapseReady(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const id = target.dataset.effectId;
      await lapseReady(this.actor, this.characterSystem, ...(id === undefined ? [] : [id]));
    },
  },

  context(actor: FoundryActor, system: CharacterData) {
    const captor = grappledBy(actor);
    const statuses = actor.statuses;
    const readied = readiedActions(actor);
    // pg 133: a dazed creature "cannot recycle AP", and pg 126 calls Ready's
    // refund a recycle. `lapseReady` reads it that way, so the panel had better
    // show the same number it is about to hand back — a refund the sheet
    // promised and the action then withheld would look like a bug.
    const dazed = statuses?.has("dazed") === true;
    const committed = readied.reduce((total, entry) => total + entry.ap, 0);

    return {
      // The header reads like the medical panel's: the bonus actually rolled,
      // and the ability governing it, since Unarmed is what every check and
      // strike in this panel runs on.
      // Shown so the Frightened control has visible context: the check is
      // rolled to shed the condition, and a creature that is not frightened is
      // usually rolling it in anticipation rather than in effect.
      frightened: actor.statuses?.has("frightened") === true,
      unarmedBonus: system.derived.skillBonuses.unarmed,
      unarmedAbility: system.derived.skillAbilities.unarmed,
      // "Strength **or** Agility modifier" (pg 127) with no chooser named; the
      // rules module defaults to the better of the two, and the panel says
      // which one that is rather than leaving it to the chat card. Localized
      // here rather than in the partial because Handlebars cannot build the
      // key, and this one reads as prose rather than as a parenthesised note.
      strikeAbility: game.i18n.localize(
        `FALLOUT.Abilities.${unarmedStrikeAbility(
          system.derived.abilityMods.strength,
          system.derived.abilityMods.agility,
        )}`,
      ),

      grappleAp: GRAPPLE_AP_COST,
      escapeAp: ESCAPE_AP_COST,
      helpAp: HELP_AP_COST,
      readySurcharge: READY_AP_SURCHARGE,

      // Escape needs no target, so who is holding you is the only thing that
      // prices it — and the sheet is the one place that can say so before the
      // roll is made rather than after it is refused.
      captor: captor?.name ?? null,
      escapeDC: captor === null ? null : unarmedContestDC(captor.unarmed),
      grappled: statuses?.has("grappled") === true,
      // pg 135's Restrained is a separate condition that Escape also ends, and
      // it clears nothing automatically — worth showing beside Grappled so the
      // difference is visible.
      restrained: statuses?.has("restrained") === true,
      // Held by something with no record behind it: the Escape control will ask
      // the GM for a DC rather than refuse, and saying so beats surprising them.
      heldWithoutRecord: captor === null && heldFast(actor),

      strikes: UNARMED_BUNDLES.flatMap((bundle) => {
        const ap = unarmedStrikeApCost(bundle.strikes, bundle.extra);
        return ap === null ? [] : [{ ...bundle, ap }];
      }),

      // A Help is spent by the very next roll and says so nowhere else on the
      // sheet, so a held Help that quietly evaporates is exactly the confusion
      // this row exists to prevent.
      helps: pendingHelp(actor).map((help) => ({
        helper: help.helper,
        bonus: help.bonus,
        isCheck: help.mode === "check",
      })),

      // Each row carries its effect id, so its controls resolve that row alone,
      // and therefore its own refund is the honest figure to print beside it.
      readied: readied.map((entry) => ({
        id: entry.id,
        trigger: entry.trigger,
        ap: entry.ap,
        refund: dazed ? 0 : readyRecycledAP(entry.ap),
      })),
      // Still shown for the whole list, because lapsing them together floors
      // once rather than per row and can therefore pay more — see `lapseReady`.
      readyRefund: dazed ? 0 : readyRecycledAP(committed),
      readyDazed: dazed,
      // With more than one readied, lapsing them together can bank more than
      // lapsing each in turn (one floor instead of several). The panel offers
      // both and says so rather than picking for the player.
      readyMultiple: readied.length > 1,
    };
  },
});
