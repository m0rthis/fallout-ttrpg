# Aid Notes — Medicine, Skill Magazines, Chems, Robot Overclock Programs

Source: `Fallout TTRPG v2.0 (PDF).pdf`. **Printed page number = PDF page index** (printed pg 90 is
PDF page 90). Every table page was rendered at 200 dpi and read as an image, then cross-checked
against `pdftotext -layout` run one page at a time. Output: `packs-src/aid-med.json`.

Pages covered:

| Content | Pages | Items |
| --- | --- | --- |
| Medicine (prose pg 86–87, Name/Cost/Load table pg 87) | 86–87 | 18 |
| Skill Magazines (Name/Effect table, cost/load from prose) | 88 | 14 |
| Chems (property glossary + withdrawal list pg 89, table pg 90) | 89–90 | 23 |
| Robot Overclock Programs (rules pg 90 right column, table pg 91) | 90–91 | 10 |

**Total: 65 items.** Not extracted: pg 82–85 (food/drinks) and pg 92 (unique items) — other owners.

---

## THE HEADLINE FINDING: Rebound, Steady and Psychotats

**Rebound and Steady are named on pg 89 but have NO row in the pg 90 Chems table.** Verified
visually: the table runs Buffout → Psycho jet (23 rows) and stops; the column ends well above the
page bottom, so nothing was clipped, and pg 91 starts a different table (programs). A whole-book
`pdftotext` search finds "Rebound" and "Steady" on exactly **two** pages:

- pg 89 — the withdrawal list: *"Calmex, Jet, Jet fuel, **Rebound**, Rocket, and Ultrajet.
  Disadvantage on all Agility ability and skill checks."* and *"**Steady.** Any attack you make is
  decreased by 2."*
- pg 139 — the "Luck Roll / Chems and Medicine" random loot table (Rebound at 3, Steady at 12).

**Psychotats does not appear anywhere in the book.** Zero hits across all 179 pages. It is not in
the pg 89 withdrawal list either (the brief's assumption that it was listed there is wrong — pg 89
says "Fury, Overdrive, and all Psychos", which covers Psycho / Psycho buff / Psycho jet).

**Decision: Rebound and Steady are NOT in aid-med.json.** The book gives them no cost, no
Properties, and no Load — every field except `withdrawal` would have to be invented, and this
extraction does not fabricate values. They are rollable loot on pg 139 that players can obtain but
cannot buy or stat, so **this is the one item in scope that needs a human decision**: either add two
stub entries with `cost: 0` / `properties: ""` and the known withdrawal strings, or treat it as a
book erratum. Their known withdrawals, if you want them:

- Rebound → `Disadvantage on all Agility ability and skill checks.`
- Steady → `Any attack you make is decreased by 2.`

---

## Global judgment calls

### 1. `1 (10)` load means 0.1 per item
Every chem row and every program row prints Load as either `1` or `1 (10)`. `1 (10)` is read as
"ten of these together weigh 1 load", so `load` is **0.1**. The reading is spelled out in each
affected item's `description` so it can be reversed. All 10 programs are `1 (10)`; among chems,
13 are `1 (10)`, 9 are plain `1`, 1 is blank.

### 2. Blank / dashed Load cells become 0
- **Jet fuel (pg 90)** — the Load cell is genuinely **empty** in the table (not a dash). Recorded
  as `0`, noted in its description.
- **Cateye, Fixer, Rad-X (pg 87)** — Load prints `-`. Recorded as `0`, noted in each description.

### 3. `effect` vs `properties`
For chems and programs, `effect` is the Properties column **verbatim as printed** including the
book's period-separated style (`"Anabolic. Stimulant."`), and `properties` is the same list
normalised to comma-separated with no trailing periods (`"Anabolic, Stimulant"`). For medicine and
magazines the table has no Properties column, so `properties` is `""` and `effect` is a one-line
mechanical summary written for this extraction (not book text).

### 4. Property glossary is inlined into every description
Per the brief, each chem/program description spells out the pg 89 glossary text of each of its
listed properties, so a player reading the item in Foundry sees what "Anabolic" does without
flipping pages. The glossary sentences were rephrased from *"If you use a chem with this property,
you have advantage…"* to *"You have advantage…"* — wording only, no mechanical change.

### 5. `apCost: 0` means "not measured in AP"
Six items have no single AP cost and get `0`, with the real cost stated in `description`:

| Item | Why |
| --- | --- |
| Doctor's Bag | Per-action: 6 AP (Tourniquet / Pain Killer) or 10 minutes (Stitch Wounds / Set Bone) |
| First Aid Kit | Same, minus Set Bone |
| RadAway | 15 minutes |
| RadAway (Diluted) | 15 minutes |
| Auto-Inject Stimpak | Triggers automatically, costs nothing |
| Auto-Inject Super Stimpak | Triggers automatically, costs nothing |

All other AP values are taken from each item's own prose sentence, not assumed: Addictol 4,
Antivenom 5, Cateye 3, Fixer 4, Healing Powder 6, Rad-X 3, all three RobCo Quick Fix-its 4, all
three stimpaks 4, all chems 4 (pg 89 "Usage"), all programs 4 (pg 90 "Usage").

### 6. Healing-rate multipliers — all verified against prose
| Item | Multiplier | Prose |
| --- | --- | --- |
| Stimpak | 1 | "equal to their healing rate" (ghoul: half) |
| Stimpak (Diluted) | 0.5 | "half their healing rate" (ghoul: a quarter) |
| Super Stimpak | 2 | "double their healing rate" (ghoul: their healing rate) |
| Auto-Inject Stimpak | 1 | "the effects of a stimpak" |
| Auto-Inject Super Stimpak | 2 | "the effects of a super stimpak" |
| Healing Powder | 0.5 | "half their healing rate (rounded down)", once per round for 3 rounds |
| RobCo Quick Fix-it 1.0 | 0.5 | "half their healing rate" |
| RobCo Quick Fix-it 2.0 | 1 | "equal to their healing rate" |
| Extreme Damages RobCo Quick Fix-it 2.0 | 2 | "double their healing rate" |

The brief's list was correct on every row. **The two Auto-Inject entries were added to the healing
set** — they have no prose of their own but explicitly deliver "the effects of a stimpak / super
stimpak", so they carry the same multipliers.

Things the schema cannot represent, pushed into `description`:
- **Ghoul half-rate clause.** Every stimpak has a second, halved rate for ghouls. Not fielded.
- **Species gating.** Stimpaks exclude ghouls-at-full-rate and robots entirely; RobCo Quick
  Fix-its only work on robots and gen-2 synths; Healing Powder explicitly does nothing for ghouls,
  robots or gen-2 synths. Not fielded.
- **Healing Powder is 3 × 0.5-rate, not one 0.5-rate heal.** `healRateMultiplier` is a single
  number, so `0.5` is the *per-round* amount; `duration: "3 rounds"` carries the rest.

### 7. Book errors transcribed as printed, flagged in-line
- **pg 86 "RobCo Quick Fix-it 2.0" appears twice.** The first paragraph is headed
  *"RobCo Quick Fix-it 2.0"* but its body reads *"The RobCo Quick Fix-it **1.0** is a healing stim…"*
  and heals half the healing rate. The second is the real 2.0 (full healing rate). The first
  paragraph was matched to the **1.0** table row; the typo is noted in that item's description.
- **RadAway / RadAway (Diluted) contradict themselves**: *"You can spend **15 minutes** to use
  this… At the end of **the hour**, the affected creature removes…"* Both phrasings kept.
- **Healing Powder's paragraph ends without a period** ("unaffected by healing powder"). A period
  was added.
- **"the doctor' bag supplies"** (pg 86) is a broken possessive in the source; transcribed as
  printed.
- **Hyperstimulant vs Super Stimulant (pg 89)** are near-identical: 4 AP / eight exhaustion levels
  vs 2 AP / five levels, but **both cap at 20 AP**. Probably a copy-paste artefact; transcribed as
  printed.
- **`Tæles of Chivalrie`** (pg 88) is spelled with an æ ligature in the book; kept. Likewise
  `¡La Fantoma!`, `Fixin’ Things` (curly apostrophe) and `Doctor’s Bag`. The magazine names use a
  mix of straight (`Patriot's`, `Lad's`) and curly (`Fixin’`) apostrophes in the source — both were
  preserved as printed rather than normalised.
- **`EISENHOWER PROTOCOL`** (pg 91) is printed in full caps; kept.

### 8. Withdrawal mapping (all 33 chems + programs accounted for)
The pg 89 list groups several chems per line. Mapping used:

| pg 89 line | Applied to |
| --- | --- |
| Buffout, Buffjet, and Bufftats — Disadvantage on STR & END | Buffout, Buffjet, Bufftats |
| Calmex, Jet, Jet fuel, Rebound, Rocket, and Ultrajet — Disadvantage on AGI | Calmex, Jet, Jet fuel, Rocket, Ultrajet (Rebound has no table row) |
| Cigarette and Coyote tobacco chew — Disadvantage on PER | Cigarette, Coyote tobacco chew |
| Daddy-O — passive sense −5 | Daddy-O |
| Day Tripper — karma cap does not flip back | Day Tripper |
| Fury, Overdrive, and **all Psychos** — AC −2 | Fury, Overdrive, Psycho, Psycho buff, Psycho jet |
| Hydra — max HP reduced by your level | Hydra |
| Med-X — damage taken +2 | Med-X |
| **All Mentats** — Disadvantage on CHA | Mentats, Berry Mentats, Grape Mentats, Orange Mentats |
| Steady — attacks decreased by 2 | (no table row) |

Every one of the 23 chems has a withdrawal. Programs use the pg 90 right-column list, which covers
all 10; note the grouped lines **"EISENHOWER PROTOCOL, Military Auto-Tank AI Upload, Military
Turret Operating System"** (AC −2) and **"Overclock Hardware, including v.2.0"** (CHA), the latter
covering both `Overclock Hardware` and `Overclock Hardware v2.0`. The pg 90 list writes "v.2.0"
while the pg 91 table writes "v2.0"; the table spelling was used for the item name.

### 9. Skill magazines: cost and load are not tabled
The pg 88 table has only Name and Effect. Per the prose, *"Each magazine typically costs around 50
caps and has a load of 2 (GM's discretion)."* → `cost: 50`, `load: 2` for all 14, with the GM's
discretion caveat repeated in every description. `apCost: 6` is the prose's edge case (reading
normally takes 5 − INT modifier **minutes**; only when that reaches 0 can you read it for 6 AP) —
the full rule is in the description. `duration: "Until you rest"`, matching the effect text.
`addictive: false` for all.

### 10. Chem/program cross-table oddity worth knowing
The programs are clearly a robot re-skin of the chems and mostly mirror them 1:1 by cost and
properties (Servo Override ≙ Buffout 20c Anabolic; Coolant Rerouter ≙ Calmex 100c Sedative;
EISENHOWER PROTOCOL ≙ Fury 60c; Military Auto-Tank AI Upload ≙ Psycho 50c; Military Turret
Operating System ≙ Overdrive 55c). **Two do not line up** and were transcribed as printed rather
than "corrected":
- **Cache Clearer** — 5c matches Cigarette, and its withdrawal is Cigarette's (Perception), but its
  Properties read `Anxiolytic. Stimulant.` where Cigarette is only `Anxiolytic.`
- **Incoming Projectile Predictor** — 20c where its chem counterpart Med-X is 50c, same
  `Anesthetic.` property and same withdrawal.

### 11. `addictive`
`true` for all 23 chems (pg 89 "Addiction and Side Effects. **Every** chem has this property") and
all 10 programs (pg 90 "Truncated Bytes and Faulty Programming. **Every** program has this
property" — mechanically identical, Endurance DC 6). `false` for all medicine (pg 86 opens
"**Non-addictive** healing and therapeutic tools") and all magazines. The cure conditions differ and
the schema has no field for them, so they live in `description`: chems clear after
`6 − END modifier` weeks (minimum 1); faulty programming clears by spending 5 circuitry junk items
and passing a Crafting check DC 20.

---

## Verification

- All four tables read as 200 dpi PNGs and compared row-by-row against per-page `pdftotext -layout`.
  No row-offset discrepancies found in any of the four; the layout extraction happened to be
  faithful here (the medicine and magazine tables are only 2–3 columns wide).
- `node -e "JSON.parse(...)"` passes. A key-order/shape check confirms all 65 objects have exactly
  the 14 schema keys in order, `type: "aid"`, and no HTML in any description.
- `aidType` values checked against `AID_TYPES` in `src/data/items.ts`
  (`food | drink | medicine | chem | program | magazine | other`).
- No duplicate names.

---

## Post-extraction changes (integration pass)

1. **`addictionDC: 6` added to every entry** (schema gained a per-item DC so alcohol's
   pg 82 DC 5 and the chem DC 6 can coexist).
2. **Rebound and Steady were added by hand** as `chem` entries. The agent correctly
   found that the pg 90 table has no row for either, but pg 89 lists their withdrawal
   effects and pg 139 puts both on the loot table, so omitting them would break that
   table. They carry their known withdrawal strings, `cost: 0`, empty `properties`, and
   a description that states plainly that the book prints no stat row. Psychotats does
   not exist in this book and was not added.
3. **Chem/program artwork** uses new per-category fallbacks in `icon-map.json`
   (`_fallback:aid:chem` → lorc/syringe, `:program` → lorc/circuitry,
   `:medicine` → sbed/medical-pack, `:food` → lorc/meat-cleaver,
   `:drink` → delapouite/bottle-cap, `:magazine` → lorc/wooden-sign), all already
   vendored, so no new CC-BY attributions were needed.
