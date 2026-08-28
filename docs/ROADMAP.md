# Roadmap

State as of v0.23.0 (2026-08-12, including the post-release audit in section D). The system
targets rulebook **v2.1**, except the creature statblocks, which stay v2.0-sourced because
v2.1 omits that chapter.

Work is split three ways, because the v2.1 conversion changed what "done" means:

- **A — Finish the v2.1 conversion.** The system is *wrong* here today. Highest priority:
  these are corrections, not features.
- **B — New v2.1 content.** Chapters that did not exist in v2.0 and were never on any
  earlier roadmap.
- **C — Original roadmap.** Items carried over from before v2.1 arrived, still outstanding.

## Working agreement (how this project is built)

- **Probe the live server before building on a Foundry API.** Throwaway Puppeteer scripts run
  from the project root against a live Foundry server, configured through the gitignored
  `scripts/smoke.config.json`. This caught the Active Effect rework, the combat turn hook
  shape, and a core CombatTracker bug. Findings go in `docs/foundry-v14-notes.md`.
- **Sample after settling, not at the instant of the call.** A synchronous probe of effect
  expiry produced a wrong conclusion that a whole subsystem was then built on.
- **The book beats the patch notes.** The v2.1 notes were wrong or incomplete at least five
  times. Every value is verified against the printed page, read visually where it is a table.
- **Batch 3-5 roadmap items per release**, then deploy and run `npm run smoke`. Console
  errors fail the suite. The suite asserts dice (`2d20kh`) rather than totals where the rule
  is about advantage.
- **Agents do extraction; the code is written here.** Agent briefs demand a change report and
  an explicit rejection list, because the rejections are where judgment needs auditing.

---

## A. Finish the v2.1 conversion (correctness) — the leftovers are closed, with gaps noted

*Done in release 6:* **Shock's SP-regain block** — every stamina restoration now goes through
one gate (`src/actions/healing.ts`), which also made the 74 consumables carrying Bland, Tasty,
Flavorsome, Delicacy or Invigorating actually restore stamina for the first time, with the
Ghoul half and the Gen-2 Synth/Robot nil. **Power Armor beyond the pool** — enter/exit,
Fusion Core allotted time with the staged shutdown, core swap, Overheating with the Core
Assembly thresholds, Fusion Core Targeting, the decay bands driving radiation protection, and
the DP refill cutoff at ten levels. Fixed on the way: Power Armor was taking ordinary armor's
per-decay AC/DT penalty and load halving, and the DP refill was passing overflow damage
through to stamina instead of absorbing it in the refilled pool (pg 57's worked example).

*Done since:* **Power Armor upgrades** (pg 59) — seven controls, five Active Effects, and the
drain path that had three localization strings and no caller now has five callers. Badges on
each row say whether an upgrade is automated, a button, an effect, a reported helper, or text
only, read off the upgrade table itself so the panel cannot drift from it. **Race gating** —
Robots barred, Super Mutants gated on the Fitting, a fitted suit locked to them.

1. **Difficult terrain** (pg 116) — the extraction confirms the `+1 AP per 5 ft` surcharge
   (`+2` extreme) is the correct v2.1 rule and that enemy spaces count; the 20 ft cap was a
   v2.0 rule and is gone. What is left is not a rules question: enforcing it needs Foundry
   movement-cost hooks and terrain regions. **The book also mixes surcharges with absolute
   rates** (Dust Storm "costs 2 AP", Encumbered "2 AP per 5 feet") and never says how they
   combine — see `packs-src/V21-NOTES-stamina-terrain.md`. Two rules are simply missing from
   the book: crawling has no rate or AP cost anywhere, and "off-balance" is referenced twice
   with an unfilled `(see pg #)` placeholder and defined nowhere.
2. **Attacking does not reveal a hidden attacker or end Take Cover.** Both are printed (pg 77's
   Silencer exception establishes the first) and both exist as functions. They cannot be called
   from `rollAttack`, because `actions/stealth.ts` imports `dice/rolls.ts` for its roll helpers
   and importing back makes a cycle whose undefined bindings break every attack at module init.
   The fix is to extract the shared roll helpers into their own module — `effectiveMode`,
   `d20Formula`, `d20Modifiers`, `keptD20` and `rollSkillCheck` are the whole set, and three
   separate agents have now wanted them from outside `rolls.ts`.
3. **Burning deals no damage.** The status ships, the flames chapter now applies it, and
   nothing rolls its per-turn 1d10 (pg 133) or offers the 6 AP to put yourself out. It belongs
   in `src/combat/turns.ts` beside Bleeding, which is the same shape and already there.

*Done in the conversion:* Luck exemption, Human Tenacity, targeted-attack AP costs **and**
condition tables, Corroded removal, Hypothermia/Overheating/Short Circuit, Neuro-Stimulant,
the full compendium re-extraction (465 equipment, 233 perks/traits), the **radiation rework**
(1d4 to both pools with an unhealable lock, RadAway releasing it, the escalating check DC),
**Power Armor Defense Points** as an ablative layer ahead of stamina with pool-refill decay,
**Dazed** as a flat −3 AP, and **Improvised Attacks**.

## B. New v2.1 content (never on an earlier roadmap)

*Done in this section:* the **Item Blueprint Encyclopedia** (pg 94-115, joined onto the
465 equipment documents at build time), **diseases** (all 20, with END-derived durations, multi-dose cures
that enforce the printed day between doses, Fever's Med-X suppression, sleep-clearing, the
four damage reactions, and locked condition levels), **hazardous weather** (8 types as scene
state, with sense deltas, range multipliers, vision cutoffs, the Dust Storm surcharge, the
10-minute lightning check, and exposure clocks), **hazardous environments** (all 5), and
**radiation zone severity** (1-7 driving the re-check cadence).

What was *not* automated, and why: **vision cutoffs are reported, not enforced** — mapping
"blind beyond 40 ft" onto Foundry's detection modes needs token-level vision overrides, which
is a bigger job than the rest of the chapter combined. Weather ticks are **GM-triggered**
rather than hooked to world time, deliberately: this system has already been burned once by
racing Foundry's own clock-driven updates (`docs/foundry-v14-notes.md`), and a wasteland hour
is a GM beat rather than a background timer.

## C. Original roadmap, still outstanding

14. **Action costs deducted automatically** — `spendActionPoints()` exists and the turn
    economy runs, but attacks and item uses do not yet call it, so AP is still spent by
    hand. Deliberate: it wants a confirmation path so a misclick cannot strand a character
    at 0 AP mid-turn. Power Armor's overheat check works around it by reading the pool at
    both ends of a turn rather than counting deductions.
20. **Migrations** — required once a real campaign exists. Purely *added* fields need none;
    DataModel fills defaults on load, which is what every release so far has relied on.
    Release 6 is still additive.

*Done in release 6:* **21 — FOSS release prep.** MIT `LICENSE` for the code, `NOTICE.md`
covering the two bodies of third-party content, a `CHANGELOG.md`, a README written for
someone who has never seen the project, and manifest-URL install through
`.github/workflows/release.yml` — tag, push, and a GitHub Release appears with the manifest
and zip attached. Nothing needs configuring, because the manifest committed here carries **no
URLs at all**: `license`, `readme` and `changelog` are relative paths inside the package, and
`manifest`/`download`/`url`/`bugs` are stamped in from whatever repository the workflow runs
in. The public repository was started from a single commit rather than a mirror push, so no
development history came with it.

## E. Wired but incomplete — the dangling ends

Things that exist and work, with a known edge left open. These are the cheapest items on this
page, and the easiest to lose track of, which is why they are listed rather than remembered.

1. **`escapeGrapple` does not clear the `restrained` status.** pg 126 frees you from "a
   grapple, restrain, or chokehold". The status is registered and the panel displays it; the
   action only clears `grappled`.
2. **`powerArmorReflection` (Reactive Plates) is computed and never called.** It needs the
   melee attacker's identity, which `applyDamage` does not receive — the damage pipeline knows
   the defender, not who swung.
3. **`targetedApWithVats` (VATS matrix overlay) is computed and never called.** It belongs at
   `targetedApCost`'s call sites in `src/dice/rolls.ts` and the limb-picker dialog, which do
   not currently know which suit the attacker is wearing.
4. **The pg 133 bleeding-healing redirect is unimplemented system-wide** — "a healed bleeding
   creature gains no hit points and sheds two bleeding levels instead". Nothing in `useAid`,
   `restoreStamina` or the stimpak path honours it. It belongs at the healing gate
   (`src/actions/healing.ts`), which is the choke point that now exists for exactly this.
5. ~~**The pg 86 First Aid Kit and Doctor's Bag actions are description text only.**~~ Done.
5b. **Healing Powder heals once, immediately, instead of over three rounds.** Pg 86: "heals
   half the target's healing rate at the start of each of their turns for three rounds". The
   item is `healsHealingRate` with a `"3 rounds"` duration string, so `useAid` pays it all out
   at once. It needs a per-turn effect with a round counter read by `src/combat/turns.ts`, and
   it must go through the hit-point gate like everything else. Found while wiring section E.
6. **`SPRINT_AP_COST` is declared and imported by nothing** — the same shape as
   `UNARMED_STRIKE_AP_COST` before the combat actions landed, and the same fix.
7. **Unique items are still not in the shipped packs**: Pip-Boys, Stealth Boy, Vault Suit.
   They exist only as blueprint rows, and now that crafting reads those rows, the recipes are
   visible for items nobody can own. They belong in `packs-src/gear.json`.

## D. 2026-08-12 audit — findings the sections above did not track

A full pass compared the code against the v2.1 patch notes and the printed book. The two
contradiction claims in D1 were re-verified by reading pg 24-25 of the published PDF
directly, not from the extraction docs.

### D1. The code contradicted the book (all fixed, released, and verified by smoke)

1. *Fixed:* **Negative-Luck skill penalty was doubled.** Pg 25: *"If your Luck has a
   negative modifier, all your skill bonuses are subtracted by 1 regardless of your
   modifier."* `luckSkillBonus` returned `floor(luckMod / 2)` unconditionally — −2 on all
   14 skills where the book says −1. Now a flat −1 for any negative modifier
   (`src/rules/formulas.ts`), with a smoke step asserting it on a live actor.
2. *Fixed:* **Unlucky characters could never crit.** `critThreshold` computed
   `critChance − floor(luckMod / 2)`, which at negative Luck exceeds 20 and makes
   `raw >= threshold` permanently false. Clamped at 20 with the ruling commented — pg 25
   only ever illustrates the positive case and never contemplates crits becoming
   impossible.
3. *Ruled, no behavior change:* **the pg 24 hard cap of 15 AP.** The book contradicts
   itself — the pg 89 chem properties print their own caps of 16 and 20 — and
   `system.bonuses` sums every effect source with no per-source record (the
   `foundry-v14-notes.md` constraint), so a 15-cap would also clip the printed chem caps.
   The code sides with the chem printing, uncapped; the ruling now lives at
   `maxActionPoints()`.
4. *Fixed:* **perk descriptions rendered blank on the item sheet** (reported at the
   table). The data was never damaged — all 186 perks carry full descriptions into the
   built pack. Probed live on 14.365: a toggled `<prose-mirror>` displays only its element
   *body* when closed, and the templates passed the text solely as the `value` attribute
   with an empty body. Fixed by enriching in `_prepareContext` and emitting the enriched
   HTML as the element body (item description, character biography, NPC sheet), splitting
   tag-free pack text into paragraphs at render time, plus a CSS fix for the closed
   editor's absolute-positioned content box clipping past ~2 paragraphs. The smoke
   assertions now require the text to be *visible and unclipped*, not merely the element
   to exist, and were shown to fail against the unfixed build.
   `docs/foundry-v14-notes.md` corrected — its "works as a drop-in" claim was the trap.
5. Still open, ruling debts: the book prints **two different DCs for stabilising a dying
   creature** (pg 21/23: 10 + failed − successful death saves; pg 131: 10 − END mod) — the
   ruling must be written down before first aid (D3) ships. **Group Sneak**
   bonus-vs-modifier is now commented at `groupSneak()` (pg 4/24 say "modifier", the code
   averages the full skill bonus, almost certainly what the book means).

### D2. v2.1 patch-note mechanics that fell through untracked

Everything here is from the official v2.1 patch notes and appears nowhere in sections A-C.

- **Grappling does not exist** beyond a token status with zero derived effect and the
  `resistGrapple` advantage scope — no Grapple or Escape action, no Unarmed-vs-Unarmed
  contest (a headline v2.1 change; full rule already extracted at
  `docs/rules-v2.1-combat.md:123`).
- **Help action** (v2.1: add half the helper's ability modifier, not advantage) and
  **Ready** (v2.1: recycle half the spent AP if the trigger never fires) — absent; Ready's
  absence also blocks the Frightened-Freeze mode, which is otherwise text-only.
- **No unarmed-strike action exists.** `UNARMED_STRIKE_AP_COST` is declared
  (`src/rules/constants.ts:245`) and imported by nothing; the v2.1 "two unarmed strikes for
  5 AP" rule is moot until one does.
- *Done (same day as the audit):* **Tainted food now contracts a random disease** (pg 83),
  with the flip-a-Karma-Cap escape surfaced as a chat note (no cap-spend workflow exists to
  enforce it), and the **Ice Cream and Apple Pie** perk grants its printed immunity plus
  the Bland→Tasty upgrade — the first perk gated by item lookup rather than a numeric
  effect. **Putrid remains unwired** (poisoned 4h if END ≤ 5, pg 83) — surfaced by this
  work; the same perk should gate it when it lands.
- *Done (same day):* **the dead keywords are wired.** `Unwieldy` applies its one-handed
  disadvantage unless Perception ≥ 10 (ruled ≥, not the printed "is 10" — creature scores
  run to 20); `Dismember` zeroes the extra AP on arm/leg targeted attacks, in the roll and
  in the limb-picker dialog; `Corrosive` decays the target's equipped armor when damage
  reaches hit points, riding the Apply-damage flag path, with Power Armor exempt as
  printed and the natural-armor clause left as a GM callout (nothing marks a creature as
  naturally armored, and its "maximum of 3" is per-creature state no field holds).
- **Targeted-attack riders are chat text only**: the v2.1 leg movement caps (30/20/15 ft
  for two turns) and the eyes/head range halving print on the card but create no effect.
- **Weapon mods are not mechanical at all** — `system.mods` is a bare string, so the v2.1
  Scope and Infrared Scope disadvantage bands and the Lucky Charm one-per-PC limit live in
  descriptions only.
- 10 of the 11 new v2.1 perks are text-only — documented and defensible
  (`packs-src/V21-NOTES-perks.md:232`: nothing maps to an allowed effect key), but Dual
  Wielder and Guns Akimbo additionally wait on hand state that does not exist, and
  Immuno-Four-Leaf Clover could hook the disease-contraction path once one exists.

Checked and endorsed as deliberate: robot targeted-attack resistance stays out (the
published book contains no such sentence — patch notes vs book), and head-shot AP stays 3
(`docs/rules-v2.1-combat.md:226`: the patch note is backwards).

### D3. Rulebook chapters with no coverage at all

None of these are regression risks — the smoke suite touches none of them. Roughly in
value-for-effort order:

| System | Pages | State |
|---|---|---|
| ~~Cover~~ | 130 | **done** — declared per attack, not measured; total cover refuses before ammo is spent |
| Hide / detection / Surprise | 24, 125-127 | inputs (passive sense, Group Sneak) computed, nothing consumes them; sneak attack is a manual flag |
| ~~Crafting~~ | 92, 94-115 | **done** — 312 recipes carry DC/materials/time as flags; the bench is a sheet panel. Materials are still reported, never consumed: no junk documents exist |
| ~~Range bands~~ | 21, 66 | **done** — distance is declared per attack; pg 66 governs past long range (only a 20 hits), not pg 21 |
| The other combat actions (Dodge, Shove, Take Cover, Search, Stand, Stow/Equip…) | 126-127 | **partly** — Grapple, Escape, Help, Ready and unarmed strikes shipped. The rest are buttons away; **Shove is the only opposed roll left in the chapter** |
| Special movement (climb/swim/dive/jump/sprint), Falling, Suffocating | 116-118 | absent; `SPRINT_AP_COST` declared, unused; falling can reuse the limb-condition machinery |
| Skill magazines | 88 | items exist with `aidType: "magazine"`; the +1-until-rest and five-issues-permanent rules do not — needs a read-issues ledger |
| Robot sub-types | 9-11 | **partly** — limb profiles wired (defender's chassis); the four `ROBOT_TRAITS` (Plating, Slow, Rollers, NeuroTransmitters), reattachment and fuel are BACKLOG C1-C3 |
| Backgrounds (18, each: three +2 skills, a trait, starting kit) | 13-18 | a bare string field; no `backgrounds.json` |
| XP awards and level-up spend tracking | 5-6 | budgets shown; spending untracked; none of the five award rules exist |
| Explosives arm/throw table (roll 1 detonates in hand…) | 21, 78-79 | data-only |
| ~~First aid~~ | 21, 131 | **done** — the stabilise-DC contradiction is ruled for pg 131, with the losing formula printed on every card |
| Unique items (Pip-Boys, Stealth Boy, Vault Suit, lockpicks) | 91 | **not in the shipped packs at all** — they exist only as blueprint rows, which are dropped |
| Caps, Barter's Discount ability | 22 | caps stored and editable; nothing spends them |
| ~~Vision and light~~ | 118-119 | **done** — sheet panel for light, cutoffs, senses and obscurement; blindsight registered as a detection mode (**registration unverified on a live canvas**) |
| ~~Flames as a spreading area~~ | 118 | **done** — Ignite/Spread/Burn/Extinguish on the Vision & Fire panel |
| ~~Super Mutant Superior Strength and Bulky~~ | 11-12 | **done** — Bulky routes all four decay-gain sites through `src/actions/decay.ts` |
| Travel pace (18/24/30 mi, fatigue overage, mounts) | 116 | absent |

---

## Suggested order

*Done in this section:* **weapon keywords** (Automatic: N as free extra attacks,
Spread's second-increment trigger, Two Handed's one-handed penalties, the reworked
Manual Reload, Quick/Slow Reload, Unstable's five-reload decay clock, and Defensive
feeding the block), **blocking and sneak attacks**, **resting and the daily survival
clock**, **decay repair**, and the three **survival trackers** (irradiated levels,
snack pairing, the alcohol ladder).

What was *not* automated, and why: **Semi-Automatic** ("two paid attacks in a row grant a
third free") is reported on the weapon card. It waited on item 14 while AP was spent by
hand; AP is now charged (E1's half-step, 2026-08-15), so what it still lacks is a record of
*consecutive paid attacks*, which nothing keeps. **Spread's extra hits** are announced but not resolved:
the book says only that they are targeted, never whether the same attack roll is compared
to each AC (the Cleave model) or they are hit automatically (the Area of Effect model), and
inventing either would be inventing a rule. **The free-hand reload requirement** (new in
v2.1) is reported rather than enforced, because the book gives nothing to check it against
— it never says a Two Handed weapon occupies two hands, and there is no hands resource
anywhere in 136 pages.

*Done in release 5:* **scoped advantage** (a grant can now name one skill or one of seven
named checks, not just a category — which is what most perk text actually does), **situational
effects**, the **initiative / Party Nerve / Karma Cap** bonus paths, **temporary hit points**,
**ProseMirror** editors, Automatic (Switch) mode tracking, and the **Blueprint Encyclopedia**.

What is still text, and why: a grant conditioned on the *target* ("Charisma checks to
interact with animals", "Speech checks with any ghoul") stays text, because a target is not
sheet state and pretending otherwise would grant advantage on rolls the book never gave.
Perks that *remove* a conditional disadvantage (Weapon Handling, Never Unarmed, Friend of the
Night) likewise stay text: a −1 change would work mechanically, but each removes a
disadvantage this system never applied from that source, so there is nothing to cancel.

*Done in release 6:* **FOSS release prep** and the section A correctness leftovers — Shock's
stamina gate and Power Armor beyond the pool. Difficult terrain was confirmed already correct
as a rules model and reclassified as a Foundry-integration job rather than a conversion gap.

What is still text, and why: **the dead-core override** ("you cannot escape unless your
Strength score is equal to 20" — unreachable, since scores cap at 10 and the suit sets you to
12) and **overriding the automatic cooling** (a 20d10 explosion that destroys the suit and
incinerates its wearer) are both reported on the chat card rather than automated. The first is
a defect we do not get to quietly fix; the second is not something a button should do without
a person deciding it. **The baseline Fusion Core drain rate is a GM control**, because the
book prints a total and four named drains and never says how the total is consumed — a suit
that drained itself across a night's rest would destroy itself between sessions on a rule the
book does not state.

## What's left lives in BACKLOG.md

As of 2026-08-12, **`docs/BACKLOG.md` is the single work queue** — every open
item, verified against the code rather than this file's table, in the order to
work them. This document remains the book of rulings and history; its status
table below is retained but no longer maintained as a TODO list. When they
disagree, BACKLOG.md wins.

**Next:** the D1 fixes and the cheap D2 wiring landed the day of the audit — a deploy plus
`npm run smoke` is the outstanding verification step. Then: the remaining D2 combat actions
(Grapple/Escape, Help, Ready, an unarmed-strike action), Putrid, and range bands and cover
from D3 (both small, both make ranged combat rules-accurate). The largest feature gap
remains **Power Armor upgrades** (section A item 1) — the pg 59 table is 19 entries deep
and only Core Assembly is wired. After that:
item 20 (declined outright 2026-08-15 — this is a throwaway world) and the two
Foundry-integration jobs — difficult terrain and vision cutoffs — neither of which is a
rules question any more. **Item 14 is done as a half-step** (2026-08-15): actions spend
from the AP pool, report what they spent, and never refuse.

Nothing outstanding blocks play: the system is usable at the table now, and everything left is
automation the GM currently does by hand.

## Done

- v0.18.0 — FOSS release prep (LICENSE, NOTICE, CHANGELOG, a host-neutral manifest), Shock's
  stamina gate with the 74 consumables that restore stamina, and Power Armor beyond the DP
  pool. Two latent bugs fixed: Power Armor was taking ordinary armor's decay penalty and load
  halving, and the DP refill leaked overflow damage past the suit.
- v0.17.0 — the Item Blueprint Encyclopedia joined onto the shipped equipment.
- v0.16.0 — scoped advantage (skill and named-check scopes), situational effects with a
  Sync button, the initiative/Party Nerve/Karma Cap bonus paths, temporary hit points as a
  stored pool, ProseMirror editors, and Automatic (Switch) mode tracking.
- v0.15.x — weapon keywords, blocking, sneak attacks, resting and the daily survival clock,
  decay repair, and the irradiated/snack/alcohol trackers. Blocking is the first effect here
  that expires on a trigger rather than a clock.
- v0.14.0 — the v2.1 environment chapters: 20 diseases with locked condition levels and
  multi-dose cures, weather as scene state with exposure clocks and lightning, the five
  hazardous environments, and irradiated zone severity.
- v0.13.0 — AP economy on the combat turn hook (recycling half of unused AP, Fatigue shedding
  a level, Bleeding biting at turn start and failing a dying creature's death save),
  Strength-requirement disadvantage, automatic encumbrance, blind attacks, and damage taken
  while dying costing a death save.
- v0.12.0 — the single perk whose advantage is unconditional (Blind Devil); the audit behind
  that number is in `packs-src/V21-NOTES-advantage.md`.
- v0.11.0 — advantage and disadvantage as Active Effects, consulted by every roll path;
  Poisoned and Shock automated from token statuses; the v2.1 frightened check; four chem
  properties gained their mechanical half.

- v0.9.x — retargeted at v2.1: compendium re-extraction, Luck exemption, Tenacity, targeted
  attacks, condition changes, Neuro-Stimulant. Corrected the effect-expiry model to let
  Foundry retire timed effects itself.
- v0.8.0 — Active Effects engine (`system.bonuses`, guided initial-phase changes), perks and
  traits compendium, chems applying their own numeric buffs, effect UI on both sheets.
- v0.7.0 — aid compendium, chem limit + addiction workflow, hunger/dehydration relief,
  local artwork override folder.
- v0.6.0 — compendium artwork, Pip-Boy color themes.
- v0.5.0 — NPC statblock sheet, damage pipeline, death saves, targeted attacks,
  ammo/reload, Karma Caps, token statuses.
