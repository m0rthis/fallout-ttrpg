# Perks & Traits — v2.0 → v2.1 change report

Source: `FALLOUT TTRPG 2.1.pdf` (136 pp). **Printed page number = PDF page index**, verified.
Cross-checked against `Patch Notes_ Fallout 2.1.pdf`; the book won every disagreement (§6).
Files updated in place: `packs-src/traits.json`, `packs-src/perks.json`.
The v2.0 conventions in `PERK-TRAIT-NOTES.md` (field shapes, `(pg NN)` prefix, `Governing
ability:` line, `Repeat:` relabelling, Wild Wasteland label stripping) are unchanged and were
carried forward — only content the book changed was touched.

## Headline counts

| | v2.0 | v2.1 |
| --- | --- | --- |
| Traits | 48 | **47** (−1 removed, 0 added) |
| Perks | 173 | **186** (+13 added, 0 removed) |

- **1 trait removed**, **1 trait reworded**, all 47 re-paged.
- **13 perks added** (11 from the patch notes' "New Perks" page **+ 2 the patch notes never
  mention**), **30 perks changed**, all 186 re-paged.
- **1 `mechanics` entry added** (Made of Sterner Stuff, AC +1). The 8 pre-existing `mechanics`
  entries were all re-verified against v2.1 and **none changed value**.

## Verified page ranges (follow the headings, not the brief's guesses)

| Section | v2.0 | **v2.1** | Count |
| --- | --- | --- | --- |
| **Traits** (chapter opens pg 26, ends with Trigger Discipline pg 33) | 25–31 | **26–33** | 47 |
| **Perks** (chapter opens pg 34, ends with Evolution pg 54) | 32–50 | **34–54** | 186 |
| — General Perks | 32–33 | 34–35 | 12 |
| — Strength Perks | 34–35 | 35–37 | 20 |
| — Perception Perks | 35–37 | 37–39 | 20 |
| — Endurance Perks | 38–39 | 40–41 | 20 |
| — Charisma Perks | 40–41 | 42–44 | 20 |
| — Intelligence Perks | 42–43 | 44–46 | 20 |
| — Agility Perks | 44–45 | 47–48 | 20 |
| — Luck Perks | 46–47 | 49–51 | 20 |
| — Race Perks (all subsections) | 48–50 | 51–54 | 34 |
| — — multi-race (no subheading) | 48 | 51–52 | 9 |
| — — Human Perks | 48–49 | 52 | 5 |
| — — Ghoul Perks. | 49 | 52–53 | 8 |
| — — Robot Perks. | 49 | 53 | 3 |
| — — Synth Perks. | 50 | 54 | 3 |
| — — Super Mutant Perks. | 50 | 54 | 6 |

pg 55 begins "Items and Cost" — out of scope. Note the v2.1 Human Perks heading prints
**without** the trailing period ("HUMAN PERKS"); Ghoul/Robot/Synth/Super Mutant still print one.
This affects nothing in the JSON (subsection survives only in the `Governing ability: Race (X).`
parenthetical, which is unchanged).

**Method.** Both chapters were re-extracted by cropping each page into its two columns with
`pdftotext -layout -x/-W` (rather than the v2.0 whole-page approach), so column interleaving and
across-column entry continuations are handled structurally. Every entry was then diffed
character-by-character against the committed v2.0 JSON. Pages 29, 40, 41, 43, 45, 46, 50 and 52
were additionally rendered at 150 dpi and read as images to confirm the removals, the new entries,
the reworded Requirements lines and the Mysterious Stranger table.

---

## 1. Traits

### 1a. Removed (1)

- **Adventurers Instinct** — gone from the Character Traits list. Confirmed visually on pg 29:
  the alphabetical run goes Talented → The Sight Beyond → Vigilant Watch → Wasteland Knowledge
  and the right column simply ends. The name still appears in v2.1 as a **Background trait**
  (the **Wastelander** background, pg 18), which is a list this pack has never extracted — so the entry
  was deleted from `traits.json` rather than re-homed. **If a human wants Background Traits in
  the pack, that is a separate, still-unextracted list.**

### 1b. Changed (1)

- **Do No Harm** (pg 27) — first clause generalised.
  - old: "…intend to heal others **in the wasteland instead of hurting them. Whenever you use a
    first aid kit, stimpak, perk, or ability to restore hit points to another creature**, you
    restore an additional 1 hit point."
  - new: "…intend to heal others**. Whenever you restore hit points**, you restore an additional
    1 hit point."
  - The damage-reduction clause and the Wild Wasteland paragraph are unchanged.

### 1c. Unchanged

The other 46 traits are textually identical, prerequisites included. Every trait's `(pg NN)`
moved (chapter shifted +1 to +2 pages).

---

## 2. Perks added (13)

All transcribed from the book's own pages, not from the patch notes.

| Perk | Section | pg | Requirements | ranks |
| --- | --- | --- | --- | --- |
| Don’t Fence Me In | Strength | 36 | Strength 5 | 1 |
| Dual Wielder | Strength | 36 | Strength 7 | 1 |
| Nose For Trouble | Perception | 38 | Perception 5 | 1 |
| Act on Instinct | Perception | 39 | Perception 7 | 1 |
| Walk It Off | Endurance | 40 | Endurance 5 | 1 |
| Made of Sterner Stuff | Endurance | 41 | Endurance 7 | 1 |
| Keeping your Cool | Charisma | 43 | Charisma 7 | **2** |
| **Home Remedy Virologist** | Intelligence | 45 | Intelligence 5 | 1 |
| **Power Armor Master** | Intelligence | 46 | Intelligence 7 | 1 |
| Guns Akimbo! | Agility | 48 | Agility 7 | 1 |
| Immuno-Four-Leaf Clover | Luck | 49 | Luck 5 | 1 |
| Inflictable Opportunity | Luck | 50 | Luck 7 | 1 |
| Ice Cream and Apple Pie | Race (multi-race) | 52 | Human, Ghoul, or Super Mutant | 1 |

**The two bolded perks are not in the patch notes at all.** The notes say "11 New Perks! See last
page" and print eleven. The book's Intelligence section grew from 18 to 20 entries; the extras are
**Home Remedy Virologist** (pg 45 left, between On-the-Go Mechanic and Light Touch) and **Power
Armor Master** (pg 46 left, between In Shining Armor and Robotic Expert). Both were read off the
rendered page images to be sure they are real headings and not mis-parsed body text. Neither is a
rename of a removed perk — no perk was removed in v2.1.

Only **Keeping your Cool** has a `Repeat:` clause ("up to a maximum of twice") → `ranks: 2`,
consistent with the v2.0 reading of that phrasing. The other twelve have none → `ranks: 1`.

New entries were inserted at their **book-order positions** inside their sections rather than
appended, so the diff reads as insertions in context. Existing entries were not re-sorted even
where v2.1 moved them on the page (Big Ego, Chemist/Adroit Alchemist, Terrifying Presence,
Robotic Expert all shifted position because their requirement numbers changed) — order carries no
meaning and re-sorting would have buried the real changes.

---

## 3. Perks changed (30)

Flagged by the patch notes and verified (14):

| Perk | pg | old → new |
| --- | --- | --- |
| Butcher | 35 | sever a limb on "more than double their **level in points** of damage" → "more than double their **hit points** of damage" |
| Toughness | 40 | "whenever you become frightened, you can always choose to be frightened (fight)" → "whenever you roll a check to resist becoming frightened, you are not frightened if you succeed by 5 or less"; Repeat gains "**and you have advantage on checks to resist becoming frightened**" |
| Animal Friend | 42 | + "Additionally, you have advantage on any Charisma checks to interact with animals." |
| Big Ego | 42 | **Requirements: Charisma 7 → Charisma 5**; flavour trimmed ("With all that charm, even YOU…" → "Even YOU…") |
| Terrifying Presence | 43 | "**must becomes** frightened (see page **#**)" → "becomes frightened **until the end of their turn**. (see page **130**)" |
| Legend of the Wastelander | 43 | "Your Party Nerve negatively affects any enemies' Stamina Points that you are in combat with." → "When you roll combat sequence, each enemy creature's maximum stamina points are reduced by an amount equal to your party nerve." |
| Commander | 43 | + "**Once per turn**,"; "That creature **immediately** gains 6 AP" → "That creature gains 6 AP"; "do not remain or are not recycled after the command is completed" → "do not carry over to the next turn and cannot be recycled" |
| Celebrity | 44 | + "(So long as you don't act like a jackass)"; "lose **your Karma Cap**" → "lose **one of your Karma Caps**"; "you gain your Karma Cap back **at the beginning of the next game session**" → "you gain your Karma Cap back" |
| Nerd Rage! | 45 | "your DT increases by **2**" → "your DT increases by **3 and you deal an additional 3 damage**" |
| Chemist | 44 | **Requirements: Intelligence 6 → 5** |
| Adroit Alchemist | 45 | **Requirements: Intelligence 5 → 6** |
| Patch Up | 44 | "heal a creature up to their healing rate" → "…up to their healing rate **with 5 AP**" |
| Computer Whiz | 46 | "fail a Breach skill check **on** a computer, spend 10 minutes to **automatically succeed the check instead (up to GM's discretion)**" → "fail a Breach skill check **to hack** a computer, spend 10 minutes to make your check equal to **8 + your breach skill bonus**, or spend an hour for **8 + double your breach skill bonus**" |
| Bloody Mess | 49 | "damage with a weapon" → "damage with a weapon **or explosive**"; trigger "reduce a creature to 0 hit points **with a weapon attack**" → "reduce a creature to 0 hit points"; "body bursts" → "body bursts **into a horrific visceral mess**" |

**Changed but NOT flagged by the patch notes (15)** — found by full-text diff:

| Perk | pg | old → new |
| --- | --- | --- |
| Educated | 34 | unfilled cross-ref "(Use the Level Up table on page **#**…)" → "page **6**" |
| Assert Power | 36 | "(See page **#** for the frightened condition)" → "page **130**" |
| Never Unarmed | 37 | fully rewritten for the new Improvised Attack rules: "Whenever you make an attack roll with an improvised weapon, the damage is increased by 1 die rank and the critical hit chance is decreased by 1." → "You no longer have disadvantage on improvised attack rolls (unless you already have disadvantage, like the prone condition or the long range for thrown objects), and your critical hit chance is decreased by 2 when you attack with an improvised weapon." **The damage bonus is gone.** |
| Living Weapons | 37 | "you must succeed a grapple check to use them" → "**they must first be grappled** to use them"; cost **6 AP → 5 AP** |
| Slayer | 37 | "Whenever you spend action points to attack…, **you gain 1 action point**" → "Whenever you spend AP to attack…, **it costs 1 less**" |
| Standoff | 38 | opening sentence "You've got a nose for trouble." **deleted** (presumably because Nose For Trouble is now a perk name). Mechanics otherwise identical |
| Grit | 40 | Repeat: "you gain 2 additional action points…" → "you gain **two** additional action points… **(for a total of 3)**" — a clarification, not a buff |
| PHOENIX Implant | 41 | `Repeat: You can take this perk up to a maximum of once.` **deleted from the book**. `ranks` stays `1`. See §5 |
| Medicinal Master | 39 | missing sentence-final period after "heal them of all their hit points" is now printed. (The doubled "you you" typo is **still** there) |
| Stand and Fight | 44 | **30 → 60 feet**; "turn that roll into a **success**" → "into a **critical success**"; "cannot use it on them again **until you roll combat sequence**" → "**for 12 hours**" |
| On-the-Go Mechanic | 45 | "Your tools are 5 Load." → "Your tools are **equal to** 5 Load." |
| Remedial Atomizer | 46 | "two **robot repair kits**" → "two **RobCo Quick Fix-Its**" (item rename). Note the Repeat clause still says "robot repair kits" — book inconsistency, transcribed as printed |
| Mysterious Stranger | 50 | + "(you can choose to add your Luck ability modifier to this roll**, this is not considered an ability or skill check**)". Table values unchanged |
| Springboard Recovery | 52 | "until you rest for at least **6** hours" → "**8** hours" |
| Holey Moley | 52 | "**whenever** you make an unarmed attack" → "**when**"; + "This includes spending 5 AP to make two unarmed attacks, you can spend 6 AP to make three unarmed attacks." |
| Reinforced Recovery | 54 | "cannot use it again **until you sleep**" → "**until you rest for at least 8 hours**" |

(14 + 16 = 30. Educated and Assert Power are unfilled-cross-reference fills rather than rules
changes, so a rules-only count is 28.)

### 3a. Differences deliberately NOT applied

- **Apostrophes and quotes.** v2.1 is set in Roboto and now emits curly `’ “ ”` where v2.0 emitted
  straight ones in a handful of entries (Fight the Power!'s `"authorities"`, Hit the Deck's
  `"incoming"`, Butcher's `creature's`, Nerd Rage's `You've`, and ~15 traits). This is a font
  change, not a rules change, so the stored strings keep their existing glyphs and the diff stays
  readable. New entries use the curly forms the book prints.
- **`Requirement:` vs `Requirements:` labels.** Adaptive Reflexes, Blind Devil, Educated and Here
  and Now still print the singular; Legend of the Wastelander still prints **no colon**; Action
  Hero, Reinforced Recovery, Fine-Toothed Giant and Wasteland Camel still print no trailing
  period. The `requirements` field stores only the value, so none of this is representable and
  none of it changed.
- **Line-break hyphenation** ("non-functional", "Fix-Its", "RE-SISTANT") is rejoined, as in v2.0.

---

## 4. `mechanics` changes

### 4a. Added (1)

| Entry | File | Key | Value | Clause |
| --- | --- | --- | --- | --- |
| **Made of Sterner Stuff** | perk, pg 41 | `system.bonuses.ac` | **+1** | "Your AC increases by 1 regardless if you are armored" |

Unconditional, flat, permanent, and the book goes out of its way to say it applies **regardless of
armor** — no trigger, no duration, no choice. Its second clause (block without a melee weapon;
DT +2 against melee **while wielding a melee weapon**) is conditional and stays text.

**Key-spelling note for the reviewer.** This entry is written as `system.bonuses.ac`, the
canonical path in the brief and in `src/rules/effects.ts`. The 8 pre-existing entries use the
older `system.overrides.ac|dt` spelling, which `scripts/build-packs.mjs` `bonusKeyFor()` remaps to
exactly the same `system.bonuses.*` field. Both build identically. They were **left untouched**
for a minimal diff — but the file now mixes two spellings for one concept, and normalising the
8 legacy ones to `system.bonuses.*` would be a clean, zero-behaviour-change follow-up.

### 4b. Re-verified, no change (8)

Every pre-existing annotation was checked against v2.1 text; all eight clauses are verbatim
identical to v2.0 and all eight values still hold:

| Entry | Key | Value | v2.1 status |
| --- | --- | --- | --- |
| Gifted (trait, pg 31) | carryLoad +10, 14 × skills −3 | — | clause unchanged |
| Cheaper Parts (trait, pg 26) | `overrides.ac` −1 | −1 | unchanged |
| Stonewall (perk, pg 36) | `overrides.dt` +2 | +2 | unchanged |
| Toughness (perk, pg 40) | `overrides.dt` +1 | +1 | **DT clause unchanged** — only the frightened clause was rewritten |
| Can’t Put Me Down (perk, pg 53) | `overrides.dt` +1 | +1 | unchanged |
| Thick Plating (perk, pg 53) | `overrides.ac` +1, `overrides.dt` +1 | +1/+1 | unchanged |
| Feel No Wounds (perk, pg 54) | `overrides.dt` +1 | +1 | unchanged |
| Evolution (perk, pg 54) | `overrides.ac` +1, `overrides.dt` +1 | +1/+1 | unchanged |

Nothing was removed.

### 4c. Deliberately left `[]` — things that now *look* automatable

| Entry | Text | Why text, not an effect |
| --- | --- | --- |
| **Keeping your Cool** (new perk, pg 43) | "your AC increases by 1" | Gated three ways: only **during combat**, only **so long as you haven't taken hit-point damage this combat**, and it is **lost permanently for that combat** once you do — even if healed. An always-on +1 AC would be wrong for most of every fight. |
| **Nerd Rage!** (perk, pg 45) | "your DT increases by **3** and you deal an additional 3 damage" | The value changed (2 → 3) but the gate did not: "whenever you **start your turn with less than half your total hit points**". Still conditional; still `[]`. Also, damage bonuses have no allowed path. |
| **Made of Sterner Stuff**, 2nd clause (pg 41) | "your DT increases by 2 against other Melee attacks" | Conditional on wielding a melee weapon **and** on the incoming damage being melee. |
| **Nuclear Reactor** (perk, pg 52) | "your AC increases by 1, your DT increases by 2" | Text is **verbatim unchanged** in v2.1, so the v2.0 ruling stands: the "Additionally," sentence sits under "While in an irradiated zone…" and the scope is still unresolved. Still the best candidate for a human to promote. |
| **Rooted / Back to Back / Fight the Power! / Hunter's Wisdom / Anticipated Reflexes / Godspeed** | AC or DT bonuses | All unchanged in v2.1 and all still conditional (AP cost, adjacency, creature type, opt-in). |
| **Immuno-Four-Leaf Clover, Walk It Off, Inflictable Opportunity, Act on Instinct, Nose For Trouble, Don't Fence Me In, Dual Wielder, Guns Akimbo!, Ice Cream and Apple Pie, Home Remedy Virologist, Power Armor Master** (new) | — | None grants a flat always-on number. They grant AP discounts, advantage, halved damage from sneak attacks, crafting discounts, food-property immunity. Nothing maps to an allowed key. |

**Worth a human decision (out of scope here).** `src/rules/effects.ts` `BONUS_KEYS` now also
contains `hpMax`, `spMax`, `apMax`, `passiveSense`, `healingRate`, `d20` and `damage` — paths that
did not exist when the v2.0 annotations were written and that the brief for this pass did not
authorise. Several currently-text entries would become mechanical with them: Lifegiver (+10 max
HP), Implant Y-7 (Healing Rate +2), Action Hero (AP max +2), Blind Devil (passive sense +5),
Fast Metabolism / Cheaper Parts / Dense Circuitry / Onerous Regeneration (Healing Rate +2),
Brawny / Small Frame (±level, needs a formula). Deliberately **not** done in this pass.

---

## 5. `ranks` — one clause disappeared

**PHOENIX Implant** (pg 41) no longer prints `Repeat: You can take this perk up to a maximum of
once.` The line was simply deleted from the book, and the perk now reads as a plain non-repeating
perk. `ranks` was already `1` under the v2.0 reading of "maximum of once", so **no value changed** —
but this is a small piece of evidence that the v2.0 call (§2 of `PERK-TRAIT-NOTES.md`, "maximum of
once" = 1, not 2) was right. The other four "maximum of once" perks — Hit the Deck, Meltdown,
Fortune Favors the Bold, Outrageous Advantage — still print the clause verbatim in v2.1 and keep
`ranks: 1`.

**Deadeye and Duelist** (pg 34) *still* label their repeat clause `Requirements:` — the v2.0 book
typo survives into v2.1 unchanged. The v2.0 handling (`requirements: ""`, `ranks: 3`, sentence
moved to a `Repeat:` line) is carried forward untouched; it remains the most interpretive call in
either file.

No other perk's `ranks` changed. The 13 new perks contribute one `ranks: 2` (Keeping your Cool).

---

## 6. Where the patch notes are wrong or incomplete

1. **"11 New Perks!" is wrong — there are 13.** **Home Remedy Virologist** (Int 5, pg 45) and
   **Power Armor Master** (Int 7, pg 46) are in the book and absent from the notes. Both are
   transcribed from the book pages.
2. **Dual Wielder — the notes narrow the perk.** Notes: "If you wield a **melee weapon** in one
   hand while you wield another **melee weapon** in your other hand…". Book (pg 36): "If you wield
   a **melee or unarmed weapon** in one hand while you wield another **melee or unarmed weapon**
   in your other hand…". **Book wins**; the JSON says "melee or unarmed weapon".
3. **The notes miss 15 changed perks** (§3, second table). The largest are Never Unarmed (rewritten
   — loses its damage bonus), Slayer (rewritten — AP gain becomes an AP discount), Stand and Fight
   (30→60 ft, success→critical success, recharge changed) and Living Weapons (6→5 AP).
4. **The notes miss the removed trait.** Adventurers Instinct is gone from the Character Traits
   list and the notes say nothing.
5. **Frightened-rule mismatch (informational).** The notes' Conditions section says the frightened
   check now succeeds on "**10 or more**", while the Toughness perk text (and the notes' own
   Toughness bullet) says "**5 or less**". These are two different thresholds in two different
   rules; the perk text is transcribed exactly as the book prints it and no reconciliation was
   attempted — a rules question for the author, not an extraction question.
6. Everything else the notes flag for perks (Butcher, Toughness, Animal Friend, Big Ego,
   Terrifying Presence, Legend of the Wastelander, Commander, Celebrity, Nerd Rage, Chemist,
   Adroit Alchemist, Patch Up, Computer Whiz, Bloody Mess) **matched the book** and is applied.

---

## 7. Validation performed

- `JSON.parse` / `json.load` pass on both files.
- Shape check: all 47 traits are exactly `{name, type:"trait", system:{prerequisite,
  wildWasteland, wildWastelandEffect, description, mechanics}}`; all 186 perks are exactly
  `{name, type:"perk", system:{requirements, ranks, description, mechanics}}` — same key set,
  same key order, no additions.
- `wildWasteland === false` and non-empty `wildWastelandEffect` on all 47 traits.
- Every trait description starts `(pg NN) `; every perk description starts
  `(pg NN) Governing ability: `. All page numbers fall inside the verified ranges (traits 26–33,
  perks 34–54).
- No duplicate names within either file; no name collides across the two files.
- Section counts recomputed from the book and matched: 12 / 20 / 20 / 20 / 20 / 20 / 20 / 20 / 34
  = 186.
- Every `mechanics` key checked against `BONUS_KEYS` / `bonusKeyFor()` in
  `scripts/build-packs.mjs`; all 9 annotated entries map to a real `system.bonuses.*` field.
- File formatting preserved: 2-space indent, one-line `mechanics` objects, the 8 blank-line
  section separators in `perks.json`, trailing newline. The diff contains no reformat-only hunks.
