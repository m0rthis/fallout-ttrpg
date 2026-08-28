# v2.0 → v2.1 Change Report — Aid packs (`aid-food.json`, `aid-med.json`)

Source: `FALLOUT TTRPG 2.1.pdf` (136 pages). **Printed page number = PDF page index, offset 0** —
verified on every page cited here. Every table page (82–91) was rendered as a PNG at 200 dpi and
read as an image; the five cells that changed meaning were re-cropped at 400 dpi and read again.
`pdftotext` (with and without `-layout`) was used only as a cross-check, plus
`manuscript Fallout TTRPG v2.1.pdf` for prose wording.

Method for finding changes: sentence-level diff of v2.0 pg 86–91 against v2.1 pg 86–90 prose
(`pdftotext` reading order), plus a row-by-row visual comparison of all six tables against the
existing JSON. `Patch Notes_ Fallout 2.1.pdf` was used as a checklist only.

## Section layout moved (this is why nearly every `description` changed)

| Content | v2.0 pg | v2.1 pg |
| --- | --- | --- |
| Food/Drink glossary: Consumption, **Spoiled** (new), Addictive, Alcoholic | 82 | 82 |
| Food/Drink glossary: Caffeinated … Charged, **Tainted** (new) | 82–83 | 83 |
| Pre-Made Food table, Produce table | 83 | 84 |
| Cooked Food table, Drinks table | 83–84 | 85 |
| Medicine (prose + table) | 86–87 | 86–87 |
| Skill Magazines | 88 | 88 |
| Chem rules + withdrawal list | 89 | 88 |
| Chem property glossary | 89 | 89 |
| Chems table | 90 | **89** |
| Robot Overclock Program rules | 90 | 90 |
| Robot Overclock Programs table | 91 | **90** |
| Unique Items | 92 | 91 |

All `(pg N)` citations inside `description` were retargeted accordingly. This is the bulk of the
diff and is a page-reference update only — no rules text changed with it.

## Counts

| File | v2.0 | v2.1 | Added | Removed | Entries with a changed table value |
| --- | --- | --- | --- | --- | --- |
| `aid-food.json` | 82 | 83 | 1 (Toxic water) | 0 | 5 (`effect`/`properties`/`duration`) |
| `aid-med.json` | 67 | 68 | 1 (Antibiotics) | 0 | 5 (3 `load`, 4 `effect`/`properties`, 1 `withdrawal`) |

`description` changed on 82/83 food entries and 40/68 med entries (page tags, the new Spoiled rule,
the reworded property glossaries, and the notes listed below).

---

# New properties — full glossary text

### `Tainted` (food/drink, pg 83) — NEW
> **Tainted.** If you consume a food or drink with this property, you contract a random disease.
> However, you may flip your cap to instead ignore contracting a disease.

Applied by the book to **4 items**: Baked Bloatfly, Bloodbug Steak, Grilled Radroach (all
Cooked Food, pg 85) and Toxic water (Drinks, pg 85). In all three cooked-food cases it **replaces**
the v2.0 `Putrid`. Ties into the new Diseases chapter and the new `Antibiotics` medicine.

### `Neuro-Stimulant` (chem, pg 89) — NEW
> **Neuro-Stimulant.** If you use a chem with this property, you gain 1 additional AP at the start
> of your turn *(to a maximum of 16)*. Additionally, you have advantage on all Intelligence and
> Perception ability and skill checks

The book prints **no closing period** on this entry. A period was added in the JSON so the
inlined glossary line reads consistently; no wording was altered.

### `Spoiled` (food rule, pg 82) — NEW paragraph, not a table property
> **Spoiled.** Cooked food becomes spoiled after 3 days, and any food that remains in an irradiated
> zone for more than an hour becomes spoiled. If you eat spoiled food, you contract dysentery.

Not a Properties-column value, so no `effect`/`properties` change. Inlined into the `description`
of all 61 `food` entries (not drinks), next to the existing pg 82 consumption rule — same
convention the v2.0 extraction used for the consumption text. **Judgment call**, see below.

### `Contaminated` — printed but UNDEFINED
Roasted ant (pg 85) prints `Filling. Bland. Contaminated.` **`Contaminated` appears nowhere else in
the 136-page book** (whole-book text search: one hit, this table cell; the only other "contaminated"
is prose about irradiated water on pg 123). The pg 82–83 glossary has no such entry, and v2.0
printed `Putrid` here. Transcribed **as printed** rather than "corrected", with a description note
flagging it as a book erratum and suggesting Tainted or Putrid. See ambiguities.

---

# `aid-food.json`

## Items added (1)

**Toxic water** — Drinks table, pg 85, between Dirty water and Moonshine.
`drink`, cost **0**, load **2**, `effect`/`properties` = `Irradiated. Tainted.`, apCost 4,
duration `""`, not addictive.
- Printed in the Name column as **"Toxic water."** with a trailing period; the period was dropped
  from the item name, matching the v2.0 treatment of "Wasteland Wine."
- **Its Load cell is blank in the table.** Recorded as **2** from the pg 85 rule *"Every 8 oz of a
  drink is equal to 2 load."* This deviates from the v2.0 convention of recording blank Load cells
  as `0` (Jet fuel); the explicit section-wide rule was judged to win over the empty cell. Noted in
  the item's description so it can be reversed.

## Items removed (0)

## Table-value changes (5 items)

| Item | Field | v2.0 | v2.1 |
| --- | --- | --- | --- |
| Canned Dog Food | `effect` | `Filling. Tasty. Irradiated. Putrid.` | `Filling. Tasty. Irradiated.` |
| | `properties` | `Filling, Tasty, Irradiated, Putrid` | `Filling, Tasty, Irradiated` |
| | `duration` | `4 hours` | `""` |
| Baked Bloatfly | `effect` | `Tasty. Fortifying. Putrid.` | `Tasty. Fortifying. Tainted.` |
| | `properties` | `Tasty, Fortifying, Putrid` | `Tasty, Fortifying, Tainted` |
| | `duration` | `Fortifying 6 hours; Putrid 4 hours` | `6 hours` |
| Bloodbug Steak | `effect` | `Bland. Regenerating. Putrid.` | `Bland. Regenerating. Tainted.` |
| | `properties` | `Bland, Regenerating, Putrid` | `Bland, Regenerating, Tainted` |
| | `duration` | `4 hours` | `""` |
| Grilled Radroach | `effect` | `Fortifying. Tasty. Putrid.` | `Fortifying. Tainted.` |
| | `properties` | `Fortifying, Tasty, Putrid` | `Fortifying, Tainted` |
| | `duration` | `Fortifying 6 hours; Putrid 4 hours` | `6 hours` |
| Roasted ant | `effect` | `Filling. Bland. Putrid.` | `Filling. Bland. Contaminated.` |
| | `properties` | `Filling, Bland, Putrid` | `Filling, Bland, Contaminated` |
| | `duration` | `4 hours` | `""` |

`duration` follows the v2.0 convention (only timed properties contribute; Tainted and the
undefined Contaminated carry no clock, so they contribute nothing). Grilled Radroach also **lost
`Tasty`** — verified at 400 dpi, the v2.1 cell reads exactly `Fortifying. Tainted.`

## Everything else in the food section is UNCHANGED

- **No cost changed. No load changed.** All 12 Pre-Made Food, all 23 Produce, all 26 Cooked Food and
  all 21 pre-existing Drinks rows carry byte-identical Cost and Load to v2.0. See the patch-notes
  disagreement below.
- All 25 pre-existing food/drink property glossary texts are word-for-word identical to v2.0
  (Addictive, Alcoholic, Caffeinated, High-Proof, Hydrating, Irradiated, Filling, Bland, Tasty,
  Flavorsome, Delicacy, Fortifying, Energizing, Empowering, Regenerating, Refreshing, Snack, Spicy,
  Hearty, Pungent, Putrid, Cleansing, Strengthening, Lucky, Charged) — only their page tags moved.
- Table row **ordering quirks survive into v2.1** and the v2.0 notes about them are still accurate:
  Produce is out of alphabetical order at the column break (… Apple, **Yucca Fruit**, **Cactus
  Fruit**, Blackberries …); Cooked Food groups the three donuts before Fire ant fricassée; Drinks
  runs alphabetical through Whiskey then appends Dead Man's Wine, Wasteland Wine, Wine.
- Bear roast still prints with no final period (`Filling. Flavorsome. Strengthening`) — left verbatim.
- Absinthe still reads `High-Proof. Addictive. Hallucinogenic. (see Chems)`; Hallucinogenic is still
  defined only in the chem glossary (pg 89) and its text there is unchanged.
- Chem limit, alcohol DC 5, and every stamina/hunger/dehydration mechanic are unchanged.

## Description-only changes

- Page tags retargeted per the table at the top.
- The new **Spoiled** rule inlined into all 61 `food` entries.
- **Deathclaw Steak**: in v2.0 this row straddled the pg 83/84 column break and the description
  documented the reassembly. In v2.1 it is a single intact row on pg 85 — that note was removed and
  replaced with a note that the cell is still printed `Delicacy. Empowering Filling.` with **no
  period after Empowering** (the period is still added in `effect` so the property list parses).

---

# `aid-med.json`

## Items added (1)

**Antibiotics** — Medicine, pg 86 prose + pg 87 table, inserted between Addictol and Antivenom
(printed order). `medicine`, cost **75**, load **1**, apCost **5**, non-addictive, no healing fields.
> *Antibiotics.* This bottled medicine can stop diseases. How it affects the disease you contracted
> is dependent on the disease. You can consume this bottled medicine with 5 AP.

Its effect is entirely disease-dependent, which the aid schema cannot model, so `effect` is a
one-line summary and the book prose lives in `description`.

## Items removed (0)

## Table-value changes

### Load notation changed: `-` → `x10 = 1` (3 items)
The v2.1 Medicine table replaces the v2.0 em-dash Load cells with the explicit `x10 = 1` form.
Read the same way as the chem table's `1 (10)` — ten items weigh 1 load:

| Item | v2.0 `load` | v2.1 `load` |
| --- | --- | --- |
| Cateye | 0 (`-` printed) | **0.1** |
| Fixer | 0 (`-` printed) | **0.1** |
| Rad-X | 0 (`-` printed) | **0.1** |

This is the **only** load change in the whole aid scope. Each affected description's
"The Load column prints '-' … recorded as 0" line was replaced with the `x10 = 1` explanation.

### Mentats → Neuro-Stimulant (4 items)

| Item | `effect` / `properties` v2.0 | v2.1 |
| --- | --- | --- |
| Mentats | `Stimulant.` / `Stimulant` | `Neuro-Stimulant.` / `Neuro-Stimulant` |
| Berry Mentats | `Extrapolating. Stimulant.` | `Extrapolating. Neuro-Stimulant.` |
| Grape Mentats | `Anxiolytic. Stimulant.` | `Anxiolytic. Neuro-Stimulant.` |
| Orange Mentats | `Sedative. Stimulant.` | `Sedative. Neuro-Stimulant.` |

The inlined `Stimulant.` glossary paragraph in each of those four descriptions was replaced with the
`Neuro-Stimulant.` text. `Stimulant` itself is unchanged and still carried by Buffjet, Bufftats,
Cache Clearer and Overclock Hardware v2.0.

*(The v2.1 chem table prints Berry Mentats' cell as "Neuro-<linebreak>Stimulant." — the hyphen is a
line break, not a missing hyphen; the other three print `Neuro-Stimulant.` inline.)*

### `Steady` withdrawal reworded (1 item)

| v2.0 | v2.1 |
| --- | --- |
| `Any attack you make is decreased by 2.` | `Your attack roll totals are decreased by 2.` |

## Property glossary change NOT flagged by the patch notes

### `Extrapolating` was rewritten
| v2.0 (pg 89) | v2.1 (pg 89) |
| --- | --- |
| *If you use a chem with this property, you have advantage on all Intelligence and Perception ability and skill checks. However, you have disadvantage on all Charisma ability and skill checks.* | *If you use a chem with this property, any rolls you make with Intelligence or Perception are increased by a number equal to your level.* |

The Charisma penalty is gone and advantage became a flat level bonus. **Affects 3 items** whose
inlined glossary text was updated: `Daddy-O`, `Berry Mentats` (chems) and `Data Scrubber` (program).
No `effect`/`properties` change — the property name is the same.

All other chem property definitions are byte-identical to v2.0 (Anabolic, Anesthetic, Anxiolytic,
Hallucinogenic, Hyperstimulant, Invigorating, Painkilling, Psychosis, Sedative, Stimulant,
Super Stimulant), as are every withdrawal entry except Steady, and the program glossary/withdrawals.

## Prose changes (description only)

1. **`Stimpak` no longer lists gen-2 synth.** v2.0: *"human, mutant, **gen-2 synth**, abomination,
   animal, or insect"*; v2.1: *"human, mutant, abomination, animal, or insect"*. Confirmed in both
   the formatted book (pg 87) and the manuscript. **Stimpak (Diluted) and Super Stimpak still list
   gen-2 synth**, so this may be a book slip; transcribed as printed with a note on the item.
   Not mentioned in the patch notes.
2. **The v2.0 `RobCo Quick Fix-it 2.0` heading typo is fixed.** In v2.0 the 1.0's paragraph was
   headed "RobCo Quick Fix-it 2.0"; v2.1 correctly heads it "RobCo Quick Fix-it 1.0". The
   "Book typo…" note was removed from that item's description.

## Explicitly verified UNCHANGED in v2.1 (as the brief stated)

- Chem limit = 2 + half Endurance modifier (rounded down), minimum 1, maximum 4; 5 levels of
  exhaustion per chem over the limit. Same wording for the program RAM limit.
- Addiction check = Endurance ability check equal to **6**; cure = 6 − END modifier weeks (min 1).
  Faulty programming cure = 5 circuitry + Crafting DC 20.
- All chem and program effects last **1 hour**. Usage = 4 AP for both.
- Every chem cost, every program cost, and every chem/program Load (`1`, `1 (10)`, or Jet fuel's
  blank cell) is identical to v2.0.
- All 14 skill magazines: same names, same effects, same 50c / load 2 / 6 AP prose. Unchanged.
- All medicine costs and all other medicine loads unchanged; all healing-rate multipliers unchanged;
  Doctor's Bag / First Aid Kit action lists, RadAway's 15-minutes-vs-the-hour contradiction, and
  Healing Powder's missing final period all survive verbatim.

---

# Rebound and Steady — the finding

**v2.1 still prints no stat row for either.** Verified visually on pg 89: the Chems table runs
Buffout → Psycho jet, **23 rows**, and stops; pg 90 starts the Programs table. A whole-book text
search finds **"Rebound" on exactly one page** (pg 88, the withdrawal list) and "Steady" likewise
(pg 88; the only other "steady" is lowercase prose in a perk on pg 13).

**It got worse, not better:** the v2.0 pg 139 *Luck Roll / Chems and Medicine* random-loot table,
which was the only other place either name appeared and the main argument for keeping them as
items, **no longer exists** — v2.1 is 136 pages and has no random-loot tables at all.

**Decision: both entries kept, values unchanged, caveat kept and updated.** They still carry
`cost: 0`, `properties: ""`, `effect: ""`, the hand-set `load: 0.1`, and a description that now
states plainly that v2.1 still prints no row and that the loot table is gone. `Steady`'s
`withdrawal` was updated to the new v2.1 wording. **Still the one thing in this scope that wants a
human decision** — they are now pure orphans and a case could be made for deleting them.

*(`Psychotats` still does not exist anywhere in v2.1, same as v2.0.)*

---

# Disagreements with `Patch Notes_ Fallout 2.1.pdf`

1. **"Load of all items reworked. Many Load totals were inconsistent and now should be a bit more
   realistic."** — **False for this scope, with one exception.** Every one of the 82 food and drink
   Loads is byte-identical to v2.0, as is every chem, program and magazine Load, and 16 of the 19
   medicine Loads. The only change is the notation switch `-` → `x10 = 1` on Cateye, Fixer and
   Rad-X (0 → 0.1). **Every item in scope was checked individually, not sampled.** Spot-checking the
   adjacent pg 82 Items and Gear table found its Loads unchanged too, so whatever the notes are
   describing presumably landed in weapons/armor — worth confirming before anyone trusts that line
   for `gear.json`.
2. **"New Food Property: Tainted which causes disease!"** — true, but the notes do not mention that
   Tainted *replaces* Putrid on three existing items, that Canned Dog Food lost Putrid outright,
   that Grilled Radroach also lost Tasty, or that Roasted ant's Putrid became the undefined
   `Contaminated`.
3. **"Mentats now have Neuro-Stimulant instead of Stimulant."** — true and complete.
4. **Not in the patch notes at all** (found by diffing the book): the `Extrapolating` rewrite; the
   new `Antibiotics` medicine; the new `Spoiled` food rule; the new `Toxic water` drink; Stimpak
   dropping gen-2 synth; the Steady withdrawal rewording; the RobCo 1.0 heading fix.
5. **"Chem Loader syringe ammunition type now specifies you cannot load a chem into it that has an
   inhaler, such as jet."** — verified present in the book, but it is a **weapon ammunition
   property**, not an aid field. Nothing in the Chems section marks which chems are inhalers (Jet is
   named only by the Chem Loader rule itself), so there is no aid field to set and no aid item was
   touched. **This belongs in `ammo.json` / `weapons.json`, not here.**

---

# Ambiguities resolved by judgment

1. **Page-reference updates.** Every section in scope moved by 1–2 pages, so all `(pg N)` tags in
   `description` were retargeted. This is what makes the diff large. The alternative — leaving them
   pointing at v2.0 pages — would silently mis-cite the shipping book, so they were updated.
2. **Toxic water's blank Load recorded as 2**, not 0. Rationale above. The v2.0 precedent for blank
   Load cells is `0` (Jet fuel), so this is a deliberate departure; it is documented on the item.
3. **Toxic water's name** stripped of its printed trailing period, following the v2.0 "Wasteland
   Wine." precedent.
4. **`Contaminated` transcribed as printed** on Roasted ant instead of being silently normalised to
   Tainted or Putrid, with an erratum note on the item. It will not match any property lookup in
   the system — that is intentional and visible rather than hidden.
5. **`Spoiled` inlined into all 61 food descriptions.** It is a general rule, not a per-item
   property, so this is an editorial addition; it follows the existing convention of inlining the
   pg 82 consumption rules into every food item. Drinks were excluded (the rule says "food").
   Revert with a search for the string "Spoiled: Cooked food becomes spoiled" if unwanted.
6. **Neuro-Stimulant's missing final period** added.
7. **Rebound / Steady kept** rather than deleted — see above.
8. **`Antibiotics` given `effect` as a written summary**, not book text, matching the convention
   already used for every other medicine (the Medicine table has no Properties column).
9. **Stimpak's gen-2 synth omission transcribed as printed** rather than harmonised with the other
   two stimpaks, with a note.
10. **Unique Items (pg 91) was not touched.** It is in the brief's page range but its items
    (Vault Suit, Pip-Boys, Stealth Boy, Two-way Radio, Electronic Lockpicks) are not `aid` items and
    do not live in either file; they belong to `gear.json`, which was explicitly out of scope.
    **For whoever owns `gear.json`: that table did change** — it now prints Vault Suit 1300c/5,
    Pip-Boy 2000 300c/4, Pip-Boy 2000 Mark VI 600c/3, Pip-Boy 3000 550c/4, Pip-Boy 3000 Mark IV
    850c/3, Stealth Boy 500c/3, Two-way Radio 120c/2, Electronic Lockpick 500c/2, Electronic
    Lockpick Mk II 750c/3.

---

# Verification

- `JSON.parse` passes on both files. Both round-trip byte-identically through
  `json.dumps(indent=2, ensure_ascii=False)`, so the diff contains no reformatting noise.
- Key-set and key-order check: all 83 + 68 entries have exactly the 15 schema keys, `type: "aid"`.
  Existing per-entry key order was preserved verbatim — note that `Rebound` and `Steady` order
  `addictionDC` before `withdrawal` while every other entry puts it last; that pre-existing quirk
  was deliberately left alone.
- No duplicate names in either file. No HTML in any description.
- Every cost and load in both files was re-read against the v2.1 tables item by item.
- Files touched: `packs-src/aid-food.json`, `packs-src/aid-med.json`, and this file. Nothing else.
