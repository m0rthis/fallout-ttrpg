/**
 * Asking which held object a targeted attack hit (pg 129, the object row).
 *
 * Every clause on that row acts on a specific carried thing — two levels of
 * decay, or the object flying out of the target's hands — and an attack roll
 * names a limb, never an item. That missing fact is the only reason the row was
 * printed and not applied for as long as it was, and there is no honest way to
 * derive it: "whatever they are wielding" is a guess that is wrong the moment
 * the shot was aimed at a lantern, a Pip-Boy, or a stack of armor.
 *
 * So it is asked, once, at apply time.
 *
 * ## Why it lives here and not beside the writes
 *
 * `actions/targeted-conditions.ts` writes documents; dialogs are a sheet
 * concern, and nothing under `actions/` has ever opened an `ApplicationV2`.
 * Rather than make this the first, the apply path takes an `ObjectPicker` and
 * the two call sites that have a GM in front of them — the chat card's button —
 * inject this one. A macro or a test can inject its own and drive the whole row
 * without a dialog existing.
 */

import type {
  ObjectPicker,
  ObjectResolution,
} from "../actions/targeted-conditions";
import type { TargetedCondition } from "../rules/targeted-conditions";

/**
 * Item types that can plausibly be the object a shot was aimed at.
 *
 * Weapons and armor carry both a decay level and an equip state; gear carries
 * decay alone (it is carried, never wielded — `resolveObjectClause` says so on
 * the card rather than silently not unequipping it). Ammo, aid, perks and
 * traits are left out: a perk is not a held object, and the book's clause is
 * about something that can be knocked out of a hand.
 */
const CANDIDATE_TYPES: readonly string[] = ["weapon", "armor", "gear"];

interface Candidate {
  readonly id: string;
  readonly label: string;
  readonly equipped: boolean;
}

function isEquipped(item: FoundryItem): boolean {
  const system = item.system as { equipped?: unknown };
  return system.equipped === true;
}

/**
 * Everything on the actor worth offering, equipped first.
 *
 * The ordering is the whole of the convenience here: the object a creature is
 * holding is overwhelmingly the one that gets shot, so it should be the default
 * without being the only choice.
 */
function candidates(actor: FoundryActor): Candidate[] {
  const out: Candidate[] = [];
  for (const item of actor.items) {
    if (!CANDIDATE_TYPES.includes(item.type)) continue;
    const equipped = isEquipped(item);
    out.push({
      id: item.id,
      label: equipped
        ? game.i18n.localize("FALLOUT.Targeted.objectEquipped", { item: item.name })
        : item.name,
      equipped,
    });
  }
  out.sort((a, b) => Number(b.equipped) - Number(a.equipped));
  return out;
}

/**
 * Escape text for interpolation into the prompt's markup.
 *
 * Every other dialog in this system interpolates localized labels, which are
 * ours; this one interpolates **item and actor names**, which are typed by
 * whoever made the document. Written out rather than reaching for
 * `foundry.utils.escapeHTML`, which is not in `types/foundry.d.ts` and has not
 * been probed on 14.365 — five lines beat an unverified dependency.
 */
function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `<option>` rows, escaped — an item name is user-supplied text. */
function options(entries: readonly { value: string; label: string }[]): string {
  return entries
    .map((entry) => `<option value="${escape(entry.value)}">${escape(entry.label)}</option>`)
    .join("");
}

/**
 * The three faces c4 offers, by their printed text.
 *
 * Read from the same lang keys the table prints, so the prompt and the card can
 * never disagree about what condition 2 says.
 */
function choiceOptions(): { value: string; label: string }[] {
  return [1, 2, 3].map((index) => ({
    value: String(index),
    label: game.i18n.localize(`FALLOUT.Targeted.limbs.object.c${String(index)}`),
  }));
}

/**
 * Ask the GM which object was hit, and — on c4 — which condition it suffers.
 *
 * Returns null when there is nothing to hit or the prompt was dismissed, which
 * the apply path treats as "write nothing", not as a failure.
 */
export const promptObjectItem: ObjectPicker = async (
  actor: FoundryActor,
  condition: TargetedCondition,
): Promise<ObjectResolution | null> => {
  const carried = candidates(actor);
  if (carried.length === 0) {
    ui.notifications.warn(
      game.i18n.localize("FALLOUT.Targeted.objectNothingCarried", { name: actor.name }),
    );
    return null;
  }

  const choosing = condition.object?.choose === true;
  const content = [
    `<p>${escape(game.i18n.localize("FALLOUT.Targeted.objectPrompt", { name: actor.name }))}</p>`,
    `<div class="form-group"><label>${game.i18n.localize("FALLOUT.Targeted.objectLabel")}</label>`,
    `<select name="item">${options(carried.map((entry) => ({ value: entry.id, label: entry.label })))}</select></div>`,
    ...(choosing
      ? [
          `<div class="form-group"><label>${game.i18n.localize("FALLOUT.Targeted.objectChoiceLabel")}</label>`,
          `<select name="choice">${options(choiceOptions())}</select></div>`,
        ]
      : []),
  ].join("");

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("FALLOUT.Targeted.objectTitle") },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "apply",
        label: game.i18n.localize("FALLOUT.Targeted.applyButton"),
        default: true,
        callback: (_event: Event, element: HTMLButtonElement) => {
          const form = element.form;
          const read = (name: string): string => {
            const field = form?.elements.namedItem(name);
            return field instanceof HTMLSelectElement ? field.value : "";
          };
          return JSON.stringify({ item: read("item"), choice: read("choice") });
        },
      },
      { action: "cancel", label: game.i18n.localize("FALLOUT.CombatPanel.cancel") },
    ],
  });
  if (typeof result !== "string") return null;

  let parsed: { item?: unknown; choice?: unknown };
  try {
    parsed = JSON.parse(result) as { item?: unknown; choice?: unknown };
  } catch {
    return null;
  }
  if (typeof parsed.item !== "string") return null;
  const item = actor.items.get(parsed.item);
  if (item === undefined) return null;

  // Only c4 reads a choice, and an unparseable one is dropped rather than
  // defaulted: `chosenObjectClause` rejects it and the apply path says so.
  const choice = Number(parsed.choice);
  if (!choosing) return { item };
  return choice === 1 || choice === 2 || choice === 3 ? { item, index: choice } : { item };
};
