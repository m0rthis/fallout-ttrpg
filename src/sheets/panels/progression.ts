/**
 * Sheet panel: levelling, skill magazines, and caps (pg 5-6, 22, 88).
 *
 * The sheet already printed the *budgets* a level grants — "4 perk points, 3/8
 * skill points" under the level box. What it could not print was where any of
 * it went, which issues had been read, or what anything cost. All three are
 * ledgers, so this panel is mostly a ledger view with the four controls that
 * write to one.
 *
 * Three things worth knowing before reading further:
 *
 * - **The skill-point column on the sheet is not the ledger.**
 *   `skills.<key>.points` has always held background bonuses next to invested
 *   points, so it cannot answer "how many of my level-up points are left". The
 *   ledger answers that, and the panel prints the *difference* between the two
 *   rather than hiding it — a background character legitimately shows six
 *   points the ledger never issued.
 * - **XP awards are party-wide and GM-only.** Pg 5's catch-up rule levels every
 *   recipient to the party's highest total, so the control cannot be per-sheet
 *   arithmetic: it writes to every player character in the world, and says on
 *   the card what each one got.
 * - **Nothing here is deducted that the book does not deduct.** Reading a
 *   magazine reports its minutes or its 6 AP; a purchase spends caps, because
 *   pg 22 is a rule about paying.
 */

import type { CharacterData } from "../../data/character";
import {
  applyLevel,
  awardExperience,
  budgetFor,
  clearMagazineBonuses,
  purchase,
  readMagazine,
  resetDiscount,
  spendPerkPoint,
  spendSkillPoints,
  undoSpend,
} from "../../actions/progression";
import type { AidData } from "../../data/items";
import { ABILITIES, SKILL_KEYS, type SkillKey } from "../../rules/constants";
import {
  DISCOUNT_REST_HOURS,
  isAbilityKey,
  isSkillKey,
  magazineReadTime,
  magazineSkill,
  MAGAZINE_ISSUES_FOR_PERMANENT,
  parseIssues,
  quotePurchase,
} from "../../rules/progression";
import { registerPanel, type PanelHost } from "../panel-registry";

function localize(key: string, data?: Record<string, string | number>): string {
  return data === undefined ? game.i18n.localize(key) : game.i18n.localize(key, data);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * DialogV2 reading named form controls, and reporting which button was pressed.
 *
 * The same helper `src/sheets/panels/crafting.ts` carries, and for the same
 * reason: the character sheet's own `#prompt` is private, `PanelHost` is
 * deliberately the smallest surface that works, and importing the sheet from a
 * panel would be circular.
 */
async function promptFields(
  title: string,
  content: string,
  buttons: readonly { action: string; label: string; fields: readonly string[] }[],
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
          return JSON.stringify({ action: button.action, values: button.fields.map(read) });
        },
      })),
      { action: "cancel", label: localize("FALLOUT.Progression.cancel") },
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

function labelBlock(text: string, control: string): string {
  return `<label style="display:flex;flex-direction:column;gap:0.3rem;margin-top:0.4rem;">
    ${escapeHtml(text)}
    ${control}
  </label>`;
}

function checkboxBlock(name: string, text: string): string {
  return `<label style="display:flex;gap:0.4rem;align-items:center;margin-top:0.4rem;">
    <input type="checkbox" name="${name}" />
    ${escapeHtml(text)}
  </label>`;
}

function numberField(name: string, value: number, min = 0): string {
  return `<input type="number" name="${name}" value="${String(value)}" min="${String(min)}" />`;
}

function readNumber(values: readonly string[], index: number): number {
  const parsed = Number.parseInt(values[index] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readFlag(values: readonly string[], index: number): boolean {
  return (values[index] ?? "") === "true";
}

// ------------------------------------------------------------------ context

function skillLabel(skill: SkillKey): string {
  return localize(`FALLOUT.Skills.${skill}`);
}

/** Every skill magazine on the character's sheet, keyed by its title. */
function ownedMagazines(actor: FoundryActor): Map<string, FoundryItem> {
  const found = new Map<string, FoundryItem>();
  for (const item of actor.itemTypes.aid ?? []) {
    if ((item.system as AidData).aidType === "magazine") found.set(item.name, item);
  }
  return found;
}

interface MagazineRow {
  readonly id: string;
  readonly title: string;
  readonly skill: string;
  readonly issues: string;
  readonly count: number;
  readonly needed: number;
  readonly permanent: boolean;
  readonly untilRest: boolean;
  readonly quantity: number;
  readonly owned: boolean;
  readonly unknown: boolean;
}

registerPanel({
  id: "progression",
  template: "systems/fallout-ttrpg/templates/actor/parts/progression.hbs",

  actions: {
    /** Hand out XP to the whole party (pg 5). GM only — it writes other sheets. */
    async awardExperience(this: PanelHost) {
      if (!game.user.isGM) {
        ui.notifications.warn(localize("FALLOUT.Progression.gmOnly"));
        return;
      }
      const answer = await promptFields(
        localize("FALLOUT.Progression.awardTitle"),
        [
          `<p class="hint">${escapeHtml(localize("FALLOUT.Progression.awardDialogHint"))}</p>`,
          labelBlock(localize("FALLOUT.Progression.awardReason"), `<input type="text" name="reason" value="" />`),
          labelBlock(localize("FALLOUT.Progression.awardBase"), numberField("base", 0)),
          labelBlock(localize("FALLOUT.Progression.awardDowned"), numberField("downed", 0)),
          checkboxBlock("creature", localize("FALLOUT.Progression.awardCreature")),
          checkboxBlock("location", localize("FALLOUT.Progression.awardLocation")),
          labelBlock(localize("FALLOUT.Progression.awardDeaths"), numberField("deaths", 0)),
        ].join("\n"),
        [
          {
            action: "award",
            label: localize("FALLOUT.Progression.awardAction"),
            fields: ["reason", "base", "downed", "creature", "location", "deaths"],
          },
        ],
      );
      if (!answer) return;
      await awardExperience({
        reason: answer.values[0] ?? "",
        base: readNumber(answer.values, 1),
        downed: readNumber(answer.values, 2),
        creatureDiscovery: readFlag(answer.values, 3),
        locationDiscovery: readFlag(answer.values, 4),
        deaths: readNumber(answer.values, 5),
      });
      this.render();
    },

    /** Take the level the XP total already entitles this character to (pg 5). */
    async applyLevel(this: PanelHost) {
      await applyLevel(this.actor, this.characterSystem);
      this.render();
    },

    /** Spend skill points on one skill (pg 5). */
    async spendSkillPoints(this: PanelHost) {
      const system = this.characterSystem;
      const budget = budgetFor(system);
      const options = SKILL_KEYS.map((skill) => {
        const label = `${skillLabel(skill)} (${String(system.skills[skill].points)})`;
        return `<option value="${skill}">${escapeHtml(label)}</option>`;
      }).join("");
      const answer = await promptFields(
        localize("FALLOUT.Progression.spendSkillTitle"),
        [
          `<p class="hint">${escapeHtml(localize("FALLOUT.Progression.spendSkillHint", { left: budget.skillRemaining }))}</p>`,
          labelBlock(localize("FALLOUT.Progression.skill"), `<select name="skill">${options}</select>`),
          labelBlock(localize("FALLOUT.Progression.points"), numberField("points", 1, 1)),
          labelBlock(localize("FALLOUT.Progression.note"), `<input type="text" name="note" value="" />`),
        ].join("\n"),
        [
          {
            action: "spend",
            label: localize("FALLOUT.Progression.spendAction"),
            fields: ["skill", "points", "note"],
          },
        ],
      );
      if (!answer) return;
      const skill = answer.values[0] ?? "";
      if (!isSkillKey(skill)) return;
      await spendSkillPoints(
        this.actor,
        system,
        skill,
        readNumber(answer.values, 1),
        answer.values[2] ?? "",
      );
      this.render();
    },

    /**
     * Spend a perk point (pg 5) — one dialog, two buttons, because the book
     * makes the ability raise and the perk pick alternatives for one point.
     */
    async spendPerkPoint(this: PanelHost) {
      const system = this.characterSystem;
      const budget = budgetFor(system);
      const options = ABILITIES.map((ability) => {
        const label = `${localize(`FALLOUT.Abilities.${ability}`)} (${String(system.abilities[ability].value)})`;
        return `<option value="${ability}">${escapeHtml(label)}</option>`;
      }).join("");
      const answer = await promptFields(
        localize("FALLOUT.Progression.spendPerkTitle"),
        [
          `<p class="hint">${escapeHtml(localize("FALLOUT.Progression.spendPerkHint", { left: budget.perkRemaining }))}</p>`,
          labelBlock(localize("FALLOUT.Progression.ability"), `<select name="ability">${options}</select>`),
          labelBlock(localize("FALLOUT.Progression.perkName"), `<input type="text" name="perk" value="" />`),
          `<p class="hint">${escapeHtml(localize("FALLOUT.Progression.perkDocumentHint"))}</p>`,
        ].join("\n"),
        [
          {
            action: "ability",
            label: localize("FALLOUT.Progression.raiseAbility"),
            fields: ["ability", "perk"],
          },
          {
            action: "perk",
            label: localize("FALLOUT.Progression.takePerk"),
            fields: ["ability", "perk"],
          },
        ],
      );
      if (!answer) return;
      if (answer.action === "ability") {
        const key = answer.values[0] ?? "";
        if (!isAbilityKey(key)) return;
        await spendPerkPoint(this.actor, system, { kind: "ability", ability: key });
      } else {
        await spendPerkPoint(this.actor, system, { kind: "perk", name: answer.values[1] ?? "" });
      }
      this.render();
    },

    /** Reverse one ledger row. */
    async undoSpend(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const index = Number.parseInt(target.dataset.index ?? "", 10);
      if (!Number.isInteger(index)) return;
      await undoSpend(this.actor, this.characterSystem, index);
      this.render();
    },

    /** Read one issue of a skill magazine (pg 88). */
    async readMagazine(this: PanelHost, _event: PointerEvent, target: HTMLElement) {
      const item = this.actor.items.get(target.dataset.itemId ?? "");
      if (!item) return;
      if (await promptReadMagazine(this.actor, this.characterSystem, item)) this.render();
    },

    /**
     * End every magazine's "+1 until you rest" (pg 88).
     *
     * A button because `rest()` does not call `restProgression()` yet — see the
     * header of `src/actions/progression.ts`. Once it does, this stays as the
     * manual override for a rest the sheet never saw.
     */
    async clearMagazineBonuses(this: PanelHost) {
      const cleared = await clearMagazineBonuses(this.actor, this.characterSystem);
      ui.notifications.info(localize("FALLOUT.Progression.magazinesCleared", { count: cleared }));
      this.render();
    },

    /** Buy something with caps, optionally spending Barter's Discount (pg 22). */
    async buyWithCaps(this: PanelHost) {
      const system = this.characterSystem;
      const answer = await promptFields(
        localize("FALLOUT.Progression.buyTitle"),
        [
          `<p class="hint">${escapeHtml(
            localize("FALLOUT.Progression.buyHint", {
              caps: system.currency.caps,
              percent: Math.max(0, system.derived.skillBonuses.barter),
            }),
          )}</p>`,
          labelBlock(localize("FALLOUT.Progression.buyLabel"), `<input type="text" name="label" value="" />`),
          labelBlock(localize("FALLOUT.Progression.buyPrice"), numberField("price", 0)),
          checkboxBlock(
            "discount",
            localize(
              system.progression.discountUsed
                ? "FALLOUT.Progression.buyDiscountSpent"
                : "FALLOUT.Progression.buyDiscount",
              { hours: DISCOUNT_REST_HOURS },
            ),
          ),
        ].join("\n"),
        [
          {
            action: "buy",
            label: localize("FALLOUT.Progression.buyAction"),
            fields: ["label", "price", "discount"],
          },
        ],
      );
      if (!answer) return;
      await purchase(this.actor, system, {
        label: answer.values[0] ?? "",
        price: readNumber(answer.values, 1),
        useDiscount: readFlag(answer.values, 2),
      });
      this.render();
    },

    /** Hand Barter's Discount back without an 8-hour rest (pg 22) — GM override. */
    async resetDiscount(this: PanelHost) {
      await resetDiscount(this.actor);
      this.render();
    },
  },

  context(actor: FoundryActor, system: CharacterData) {
    const budget = budgetFor(system);

    const spends = system.progression.spends.map((record, index) => {
      const label =
        record.kind === "skill" && isSkillKey(record.key)
          ? skillLabel(record.key)
          : record.kind === "ability" && isAbilityKey(record.key)
            ? localize(`FALLOUT.Abilities.${record.key}`)
            : record.key;
      return {
        index,
        kind: record.kind,
        kindLabel: localize(`FALLOUT.Progression.kind.${record.kind}`),
        label,
        points: record.points,
        level: record.level,
        note: record.note,
      };
    });

    // The ledger first, then any magazine on the sheet that has never been
    // opened — so a character who has read five issues and sold the last copy
    // still sees their permanent +1 and where it came from.
    const owned = ownedMagazines(actor);
    const rows: MagazineRow[] = [];
    const seen = new Set<string>();
    for (const entry of system.progression.magazines) {
      const issues = parseIssues(entry.issues);
      const skill = magazineSkill(entry.title);
      const item = owned.get(entry.title);
      seen.add(entry.title);
      rows.push({
        id: item?.id ?? "",
        title: entry.title,
        skill: skill ? skillLabel(skill) : localize("FALLOUT.Progression.unknownSkill"),
        issues: entry.issues,
        count: issues.length,
        needed: MAGAZINE_ISSUES_FOR_PERMANENT,
        permanent: issues.length >= MAGAZINE_ISSUES_FOR_PERMANENT,
        untilRest: entry.untilRest,
        quantity: item ? (item.system as AidData).quantity : 0,
        owned: item !== undefined,
        unknown: skill === null,
      });
    }
    for (const [title, item] of owned) {
      if (seen.has(title)) continue;
      const skill = magazineSkill(title, (item.system as AidData).effect);
      rows.push({
        id: item.id,
        title,
        skill: skill ? skillLabel(skill) : localize("FALLOUT.Progression.unknownSkill"),
        issues: "",
        count: 0,
        needed: MAGAZINE_ISSUES_FOR_PERMANENT,
        permanent: false,
        untilRest: false,
        quantity: (item.system as AidData).quantity,
        owned: true,
        unknown: skill === null,
      });
    }

    const readTime = magazineReadTime(system.derived.abilityMods.intelligence);
    const barter = system.derived.skillBonuses.barter;
    // Priced against a nominal 100 caps purely so the panel can show what the
    // ability is worth before a price exists — pg 22's discount is a percentage
    // and has no meaning without one.
    const sample = quotePurchase(100, system.currency.caps, barter, true);

    return {
      budget,
      spends,
      // The gap between the sheet's skill-point column and the ledger. Positive
      // is ordinary (backgrounds grant +2s); negative means they disagree.
      unledgered: budget.unledgeredSkillPoints,
      magazines: rows,
      magazineBonuses: SKILL_KEYS.filter(
        (skill) => system.derived.magazines.total[skill] > 0,
      ).map((skill) => ({
        skill: skillLabel(skill),
        permanent: system.derived.magazines.permanent[skill],
        untilRest: system.derived.magazines.untilRest[skill],
        total: system.derived.magazines.total[skill],
      })),
      readMinutes: readTime.minutes,
      readAp: readTime.apCost,
      caps: system.currency.caps,
      barter,
      discountPercent: sample.discountPercent,
      discountAvailable: !system.progression.discountUsed,
      discountHours: DISCOUNT_REST_HOURS,
      isGM: game.user.isGM,
      awards: [...system.progression.awards].reverse().slice(0, 5),
    };
  },
});

/**
 * Ask which issue, then read it (pg 88).
 *
 * Exported because the sheet's ordinary **Use** button on an aid row routes here
 * too: a magazine used through `useAid()` was consumed for nothing, since
 * `useAid` knows how to eat a consumable and nothing about the read-issue
 * ledger. Rather than teach `useAid` about magazines — it is the wrong layer, it
 * has no dialog, and the ledger is a progression concern — both entry points
 * share this one prompt.
 *
 * Returns whether anything was actually read, so a caller can decide to re-render.
 */
export async function promptReadMagazine(
  actor: FoundryActor,
  system: CharacterData,
  item: FoundryItem,
): Promise<boolean> {
  const time = magazineReadTime(system.derived.abilityMods.intelligence);
  const answer = await promptFields(
    localize("FALLOUT.Progression.readTitle", { item: item.name }),
    [
      `<p class="hint">${escapeHtml(
        time.apCost === null
          ? localize("FALLOUT.Progression.readDialogMinutes", { minutes: time.minutes })
          : localize("FALLOUT.Progression.readDialogAp", { ap: time.apCost }),
      )}</p>`,
      labelBlock(localize("FALLOUT.Progression.issue"), numberField("issue", 1, 1)),
      `<p class="hint">${escapeHtml(localize("FALLOUT.Progression.issueHint"))}</p>`,
    ].join("\n"),
    [{ action: "read", label: localize("FALLOUT.Progression.readAction"), fields: ["issue"] }],
  );
  if (!answer) return false;
  await readMagazine(actor, system, item, readNumber(answer.values, 0));
  return true;
}
