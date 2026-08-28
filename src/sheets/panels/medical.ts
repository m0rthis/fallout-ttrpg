/**
 * Sheet panel: Medicine-skill first aid (pg 21, 23, 131).
 *
 * **This is the reference panel.** It is the smallest complete example of the
 * contract in `src/sheets/panel-registry.ts`, and the other panels are built to
 * match it: declare `actions` and `context` here, put the markup in the partial
 * named by `template`, and touch nothing else.
 *
 * All three actions operate on somebody *else*, which is the shape every
 * target-taking control in this system has: the medic is the sheet, and the
 * patient is whoever the user has targeted. Foundry keeps that on
 * `game.user.targets`, and this refuses rather than guessing when the selection
 * is not exactly one creature — a first-aid check spent on the wrong body is
 * worse than a warning.
 *
 * The third is a robot's severed-limb reattachment (pg 11), which is field
 * repair rather than medicine and shares nothing with the two Medicine checks
 * but its shape: one mechanic, one patient, a price reported and nothing spent.
 * It lives here because that shape is the whole cost of adding it, and because
 * "the thing you press when a limb comes off" is what this panel already is —
 * the alternative was a fourth panel holding one button.
 */

import type { CharacterData } from "../../data/character";
import { endBleeding, stabilizeCreature } from "../../actions/first-aid";
import { FIRST_AID_AP_COST, isDying } from "../../rules/first-aid";
import { reattachLimb } from "../../actions/robots";
import { ROBOT_REATTACH_JUNK, robotReattachCost } from "../../rules/robots";
import { registerPanel, type PanelHost } from "../panel-registry";

/**
 * The single targeted actor, or null with a warning already shown.
 *
 * Shared by both actions and deliberately strict about the count: "apply to
 * every target" is right for damage, where the GM has lined up a blast radius,
 * and wrong for a check one medic makes on one patient.
 */
function targetedActor(): FoundryActor | null {
  const targets = Array.from(game.user.targets)
    .map((token) => token.actor)
    .filter((actor): actor is FoundryActor => actor !== null);
  if (targets.length !== 1) {
    ui.notifications.warn(game.i18n.localize("FALLOUT.FirstAid.pickOne"));
    return null;
  }
  return targets[0] ?? null;
}

registerPanel({
  id: "medical",
  template: "systems/fallout-ttrpg/templates/actor/parts/medical.hbs",

  actions: {
    async endBleeding(this: PanelHost) {
      const patient = targetedActor();
      if (patient) await endBleeding(this.actor, this.characterSystem, patient);
    },
    async stabilizeCreature(this: PanelHost) {
      const patient = targetedActor();
      if (patient) await stabilizeCreature(this.actor, this.characterSystem, patient);
    },
    async reattachLimb(this: PanelHost) {
      const patient = targetedActor();
      if (patient) await reattachLimb(this.actor, this.characterSystem, patient);
    },
  },

  context(_actor: FoundryActor, system: CharacterData) {
    // The reattachment price the sheet advertises is this character's, computed
    // from their own Crafting bonus — which is the one the action will use, for
    // the reason set out at `reattachLimb`. The label switches between minutes
    // and AP at the same boundary the rule does, so the button never promises a
    // cost the card then contradicts.
    const reattach = robotReattachCost(system.derived.skillBonuses.crafting);
    return {
      ap: FIRST_AID_AP_COST,
      // Medicine is dual-governed (Perception or Intelligence), so the sheet
      // shows whichever the character actually rolls rather than assuming one.
      bonus: system.derived.skillBonuses.medicine,
      ability: system.derived.skillAbilities.medicine,
      // A medic bleeding out themselves is a detail worth surfacing, since the
      // panel's whole subject is other people.
      selfDying: isDying(system.resources.hp.value),
      crafting: system.derived.skillBonuses.crafting,
      reattachMinutes: reattach.minutes,
      reattachAp: reattach.ap,
      steel: ROBOT_REATTACH_JUNK.steel,
      circuitry: ROBOT_REATTACH_JUNK.circuitry,
    };
  },
});
