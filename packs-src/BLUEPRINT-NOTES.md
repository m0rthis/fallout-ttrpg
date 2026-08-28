# Vault-Tec Item Blueprint Encyclopedia — extraction notes

Source: `FALLOUT TTRPG 2.1.pdf` (136 pp., Adobe InDesign 18.5, 612x792 pt). The rulebook is
not redistributed here; keep your own copy outside the repository.
Output: `packs-src/blueprints.json` — **376 rows**.

Extraction method: every page below was rendered with
`pdftoppm -r 300 -f N -l N -png` and **read as an image**. `pdftotext -layout` was used only to
locate section headings and to sanity-check spelling; **no value in the JSON comes from
`pdftotext` alone**. Twelve individual rows were additionally re-cropped and upscaled 150–220%
(see Rejection list) where a value looked anomalous.

## Page range verified

Printed page number == PDF page index (offset 0) — confirmed by extracting pp. 92–95 individually
and reading the printed folio on each.

- **p.93** — the rules text (not a table). Confirms the reading of the Repair DC column:
  *"Each item has a repair bonus listed in the table, you must succeed a crafting skill check to
  repair an item. **The DC is equal to 10 + the bonus listed.**"* So the printed "Repair DC" column
  holds a **bonus**; `repairBonus` records the raw printed number.
- **p.92** — the Crafting rules. *"…roll a Crafting skill check with the **DC equal to 10 + the
  item's Crafting DC listed on the table**."* **The Craft DC column carries the same
  bonus-not-DC caveat as Repair DC.** `craftDC` therefore also records the raw printed number.
  (p.92 also contains the known misprint: it cites the encyclopedia as being "on page 90"; the real
  start is p.94. p.90 is Robot Overclock Programs.)
- **Encyclopedia proper: p.94 through p.115 inclusive.** p.116 begins the MOVEMENT chapter, so
  p.115 (Drinks + Unique Items) is the true end. All 22 pages 94–115 were rendered and read.
- Also rendered and read for cross-checking: **p.56** (the Armor stat table) and text-searched
  pp. 55–92 (weapon stat tables) — see the cross-check section.

## Row count per table

| Page(s) | Printed heading | `category` | Rows |
|---|---|---|---|
| 94 | Armor | `armor` | 6 |
| 94 | Armor Upgrades | `armor-upgrades` | 10 |
| 94 (text) / 95 (tables) | Power Armor | `power-armor` | 6 |
| 95–96 | Power Armor Upgrades | `power-armor-upgrades` | 19 |
| 97–98 | Bladed Melee Weapons | `bladed-melee-weapons` | 20 |
| 98–99 | Blunt Melee Weapons | `blunt-melee-weapons` | 21 |
| 99 | Mechanical Melee Weapons | `mechanical-melee-weapons` | 7 |
| 99–100 | Unarmed Armor Upgrades | `unarmed-armor-upgrades` | 7 |
| 101 | Melee Weapon Mods | `melee-weapon-mods` | 7 |
| 101 | Gunpowder | `gunpowder` | 1 |
| 101 | Ammunition | `ammunition` | 16 |
| 102 | HEAVY AMMUNITION | `heavy-ammunition` | 3 |
| 102 | Energy Ammunition | `energy-ammunition` | 6 |
| 102 | Special Ammunition. | `special-ammunition` | 18 |
| 103 | Special Energy Weapons Ammunition | `special-energy-weapons-ammunition` | 4 |
| 103 | Syringes (Special Ammunition) | `syringes-special-ammunition` | 12 |
| 104 | Pistols | `pistols` | 14 |
| 105 | Sub-Machine Guns | `sub-machine-guns` | 5 |
| 106 | Rifles | `rifles` | 10 |
| 107 | Shotguns | `shotguns` | 6 |
| 108 | Big Guns | `big-guns` | 4 |
| 108–109 | Energy Weapons | `energy-weapons` | 15 |
| 110 | Ranged Weapons Mods | `ranged-weapons-mods` | 24 |
| 111 | Thrown Explosives | `thrown-explosives` | 8 |
| 111 | Placed Explosives | `placed-explosives` | 8 |
| 111–112 | Items and Gear | `items-and-gear` | 24 |
| 112–113 | Chems | `chems` | 23 |
| 113 | Medicine | `medicine` | 15 |
| 113 | Pre-Made Food | `pre-made-food` | 2 |
| 113–114 | *(no printed heading)* | `untitled-food-table` | 26 |
| 115 | Drinks → "Drink Ingredients" sub-table | `drink-ingredients` | 2 |
| 115 | Drinks | `drinks` | 21 |
| 115 | Unique Items | `unique-items` | 6 |
| | | **TOTAL** | **376** |

## Field conventions (decisions I made — please audit these)

1. **`repairBonus`** — integer as printed, or `null`. A printed "–"/"-" or a blank means the item
   cannot be repaired and is recorded as `null`, never `0`. Note that `+0` is a *real, distinct*
   value and appears on: Armor/Cloth, Blunt/Board, Blunt/Board with a nail. Those are `0`, not null.
2. **`craftDC`** — integer when the cell holds a single `+N`; **string, verbatim**, when the cell
   holds anything else; `null` when printed "-". Strings occur for:
   - multi-rank cells (`"Rank 1: +8; Rank 2: +20"`) — the book stacks ranks on separate lines;
     I joined them with `"; "`.
   - compound skill requirements (`"Crafting +18 and Science +9"`, `"+4 and Crafting +8"`,
     `"+2 Medicine or Survival."`, `"+2 and Luck ability score must be 7 or higher."`).
   - dual-DC columns: Heavy Ammunition prints `"Crafting / Explosive DC."` → stored `"+25/+20"`;
     Thrown/Placed Explosives print `"Crafting and Explosives DC"` → stored `"+5 and +3"`.
   **Consumers must handle a mixed int|string|null type on `craftDC`.** I chose not to invent a
   canonical numeric because picking one of the two numbers, or one of three ranks, would be a
   fabrication.
3. **`repairTime` / `craftTime`** — **All eight weapon tables plus Unarmed Armor Upgrades merge
   both times into a single printed column headed `Repair/Crafting time`, formatted `A/B`.**
   I split on the first `/`: left → `repairTime`, right → `craftTime`. Craft-only tables
   (upgrades, mods, ammo, gear, chems, medicine, food, drinks, unique items) have `repairTime: null`.
4. **Multi-line material cells** were joined with `", "` where each printed line is one material,
   and with a space where the line-break is mid-sentence (e.g. the "…or" riders). Trailing periods
   are transcribed exactly as printed (they are inconsistent in the book).
5. Every per-item oddity below is *also* stored on that row as a `note` key.

## Ambiguities, oddities and per-item riders (all verbatim)

### Rows carrying special rider text
- **Sharpened Pole** (p.97) — Repair Materials cell is the rider itself:
  `"x1 wood repairs two levels of decay instead of one."`
- **Plastic Bumper Sword** (p.97) — `"x1 Plastic Car Bumper repairs two levels of decay instead of
  one, or"` + the normal `x1 crafting material` ×2.
- **Steel Bumper Sword** (p.97) — same rider with Steel Car Bumper.
- **Ski Sword** (p.97) — `"x1 Ski repairs up to three levels of decay, or"` + `x1 crafting material`.
  Note this one says *up to three* levels, not two.

### Cells that cannot be split into repair vs craft time
- **Shiv** (p.97) — time cell is a single `"10 minutes."` with no `/`. The item is unrepairable
  (Repair DC "-"), so the value was assigned to `craftTime` and `repairTime` left `null`.
- **Board** (p.98) — time cell reads **`"It's just a board!"`**, no `/`. The row *does* have a
  repair bonus (+0) and repair materials, so a repair time logically exists but is not printed
  separately. Both time fields left `null`; the joke string is preserved only in the `note`.
- **Board with a nail** (p.98) — time cell reads **`"The time it takes you to hammer that board
  with a nail."`**, no `/`. Same treatment.
- **Bone Club** (p.98) — `"5 minutes/ You… you just pick it up."` *does* have a `/`, so it split
  cleanly: `repairTime "5 minutes"`, `craftTime "You… you just pick it up."` (with the U+2026
  ellipsis as printed).

### Blank / unreadable / apparently-truncated cells
- **Super Mutant Fitting** (p.96, Power Armor Upgrades) — **Crafting Materials cell is printed
  completely blank.** It has a DC (+15) and a time (10 hours.). Recorded `craftMaterials: null`.
  This is the only blank materials cell in the whole encyclopedia.
- **Tri-Beam laser rifle** (p.108, Energy Weapons) — materials list ends at `x7 screws` with **no
  steel entry**, whereas every peer laser weapon (Laser pistol x20 steel, Laser rifle x24,
  Automatic laser rifle x24) lists steel. Re-cropped at 300 dpi: the table's closing rule sits
  directly under `x7 screws`, and p.109 begins a new row (Plasma pistol), so nothing is continued.
  Transcribed as printed; **no steel value was invented.**
- **Wasteland Wine** (p.115) — materials cell ends with a **trailing comma**
  (`"…x2 plastic, x8 wood,"`), suggesting a truncated list. Transcribed verbatim including comma.

### Duplicated / contradictory material lines (all re-verified by upscaled crop)
- **9 iron** (p.98) — lists `x10 steel` **and** `x5 steel`. Both transcribed.
- **Cryolator** (p.109) — lists `x13 screws` **and** `x34 screws`; almost certainly `x34 steel`
  in the author's intent, but *steel is never named*, so it was transcribed as printed.
- **Crystalizing Cryolator** (p.109) — byte-identical materials to Cryolator, same double-"screws".
- **Bottlecap Mine** (p.111) — lists `x2 steel` **and** `x1 steel`; and the cell wraps across two
  lines with **no punctuation between `x10 bottle caps` and `x5 circuitry`**.

### Printed typos transcribed verbatim
- **Machete** (p.97) — repair materials first line is `"xx1 crafting material"` (double x).
- **Armor Upgrades → Pocketed** (p.94) — all **three** material lines are labelled `"Rank 1:"`.
  They obviously map to ranks 1/2/3 (materials escalate 4/6/8 cloth), but the labels are wrong in
  print and are kept as printed.
- **Yellow Belly** syringe (p.103) — `"x1 mentants"` (for *mentats*).
- **Medicine table** (p.113) — the same table spells it **"Stimpak"** in four rows and
  **"Stimpack (Diluted)"** in one.
- **Laser rifle** (p.108) — `"x4 Circuit"` where every peer row prints `"x4 circuitry"`.
- **Plasma Cutter** (p.99) — `"x7 Nuclear Component"` where the rest of the book says
  `"nuclear material"`.
- **Overclock Hydraulics** (p.96) — `"x 6 oil"` (stray space) on all three ranks.
- **12 gauge. / 20 gauge.** (p.101) — `"x5 plastic x3 steel."` (missing comma) on both rows.

### Structural oddities
- **"Unarmed Armor Upgrades"** (p.99) is a **misnomer in the book**: the table's rows (Brass
  Knuckles, Spiked Knuckles, Boxing Gloves, Bear Skull Arm, Deathclaw Gauntlet, Bear Trap Fist,
  Power fist) are unarmed *weapons*, not armor upgrades, and the table uses the weapon column
  layout (Repair DC / Repair Materials / Crafting DC / Crafting Materials / Repair-Crafting time).
  The printed heading was used for `category` as instructed.
- **Power Armor (p.95)** is printed as **two separate tables** with two separate header rows: a
  one-row Power Armor Chassis table, then the five-model table (T-45…X-02). Both were assigned
  `category: "power-armor"` since the only printed heading ("Power Armor", p.94) covers both.
- **`untitled-food-table` (pp. 113–114, 26 rows)** — this table has its own header row
  (Type / Survival DC / Crafting Materials / Crafting Time) but **no printed section heading**. It
  starts immediately after the two-row "Pre-Made Food" table with Baked Bloatfly on p.113 and runs
  to Wasteland omelet on p.114. **The category name `untitled-food-table` is mine, not the book's.**
  Every row in it carries a `note` saying so.
- **Ammunition (p.101) and Energy Ammunition (p.102)** carry an extra printed column,
  "No. of single ammunitions crafted". There is no key for it in the requested schema, so the value
  is recorded verbatim in each row's `note` (e.g. `"No. of single ammunitions crafted: 6."`).
  Gunpowder's equivalent column ("No. crafted" = 15) is likewise in its `note`.
- **Special Ammunition (p.102), Special Energy Weapons Ammunition (p.103) and Syringes (p.103)**
  are **modifier tables, not recipes.** Their DC column is explicitly headed "Crafting DC modifier."
  / "Science DC modifier." / "Medicine or Science DC modifier.", and the materials column is a
  materials *modifier* ("Reduce required lead by 1.", "Replace any lead with rubber."). They have
  **no crafting-time column at all**, so `craftTime` is `null` for all 34 rows. Every row's `note`
  flags this. **Do not join these DCs onto ammo items as absolute DCs.**
- **Gunpowder (p.101)** — the table's first column header cell is literally `"-"`, not "Type".
- **Pip-Boy row (p.115)** — one row covers four models; the name is stored verbatim as
  `"Pip-Boy 2000, 2000 Mark VI, 3000, 3000 Mark IV."`
- **Italic sub-labels inside the Type cell** were kept out of `name` and put in `note`:
  `(makes two)` on RadAway (Diluted) and Stimpack (Diluted); `(16 oz)` on Beer, Moonshine, Rum,
  Vodka; `(1 gallon)` on Dead Man's Wine; `(60 gallon barrel)` on Wasteland Wine.
- **Rank-count inconsistency in the upgrade tables**: Insulated, Emergency protocols and
  VATS matrix overlay have only 2 ranks; Kinetic dynamo, Jet Pack, Internal database, Rusty
  knuckles, Explosive vent and Super Mutant Fitting have no ranks at all; everything else has 3.
- **Explosive vent** (p.96) and **Jet Pack** (p.95) have **identical** DC ("Crafting +20 and
  Science +12.") and identical materials ("x5 adhesive, x9 aluminum, x8 asbestos, x10 nuclear
  material."). Not an extraction error — verified on both pages.
- **Rum and Vodka** (p.115) have identical DC (+10) and identical materials; only the time differs
  (1 week vs 3 weeks). Verified.
- **Sturdy** armor upgrade (p.94) escalates x3→x3→**x5** materials, unlike Strengthened
  (x5→x5→x5) and Reinforced (x5→x5→x8). Verified; not a mis-read.

### Items appearing twice
No item name is duplicated *within* a table. Across tables there are three legitimate collisions,
all kept as separate rows because they are different things:
- **"Light Build"** — `melee-weapon-mods` (+10, None., 1 hour.) and `ranged-weapons-mods`
  (+10, None., 1 hour.). Identical values, different tables.
- **"Strengthen." / "Strengthen"** — `melee-weapon-mods` (printed with a trailing period, +6) and
  `ranged-weapons-mods` (no period, +8). Different DCs, so genuinely two entries.
- **"Rusty knuckles"** appears in `power-armor-upgrades` (p.96) — it is a power-armor mod there, not
  the unarmed weapon.

## Rejection list — values considered and discarded, and things I could not verify

This section is deliberately exhaustive.

1. **Rejected: "Repair DC" and "Craft DC" as literal DCs.** p.93 and p.92 both state the value is a
   bonus and the real DC is `10 + value`. Stored raw. If these are later surfaced in the UI as
   "DC 3" for Combat Knife that will be wrong; the DC is 13.
2. **Rejected: `0` for unrepairable items.** Shiv, Fusion Core, Weapon Repair Kit, Buffout, Calmex,
   Daddy-O, Day Tripper, Med-X, Addictol, Cateye, Fixer, Rad-X, the Pip-Boy row and 8 uncraftable
   Drinks all print "-". All recorded `null`.
3. **Rejected: inventing `x34 steel` for the Cryolator / Crystalizing Cryolator.** The arithmetic
   pattern of every other energy weapon says the last line "should" be steel, and the duplicate
   `screws` line is transparently a copy-paste slip. I re-cropped both cells at 200% and the word
   is unambiguously "screws" in both. **Transcribed as printed. Flagged, not fixed.**
4. **Rejected: adding a steel line to Tri-Beam laser rifle.** Same reasoning; the cell simply ends.
   Re-cropped the bottom of p.108 at 160% to confirm the row is closed and not continued on p.109.
5. **Rejected: correcting `x5 steel` → `x5 wood` on 9 iron** (p.98). Every peer club lists wood, and
   the row already has `x10 steel`, so `x5 wood` is the likely intent. Re-cropped at 200%: it reads
   "x5 steel". Transcribed as printed.
6. **Rejected: relabelling Pocketed's rank-2/rank-3 material lines.** The DC column clearly shows
   Rank 1/2/3, so the materials labels are wrong — but "fixing" them would silently edit the book.
7. **Rejected: splitting `"It's just a board!"` across repairTime and craftTime.** There is no `/`,
   and duplicating the string into both fields would fabricate a repair time. Both left `null`.
   **Consequence: Board and Board with a nail are the only two repairable items in the file with a
   `null` `repairTime`. That is intentional, not a gap.**
8. **Rejected: a numeric `craftDC` for the 52 multi-rank / compound-DC rows** (52 string values,
   plus 21 `null` for uncraftable items, leaving 303 plain integers). Choosing rank 1, or
   the Crafting half of a "Crafting X and Science Y" pair, would silently drop a requirement.
9. **Rejected: treating the Special Ammunition / Special Energy / Syringes DCs as absolute.** They
   are explicitly modifiers (p.102 worked example: base .308 is +6; armor-piercing adds +6 → +12).
10. **Rejected: `pdftotext` output wherever it conflicted with the image.** Concrete example:
    `pdftotext -layout` on p.94 scrambles the Reinforced row so that Rank 2's "x5 screws" continuation
    line migrates up into Rank 1's cell, and it scrambles the p.100 Bear Skull Arm row. The images
    are authoritative throughout. (This is the same class of artefact that produced the phantom
    weapon property in the earlier pass.)
11. **Could not verify — nothing.** Every one of the 376 rows was read off a 300 dpi render. There
    are no cells I was unable to read. The twelve cells I re-cropped and re-read at higher
    magnification were: 9 iron materials, Machete repair materials, Bone Club time, Board time,
    12 gauge/20 gauge materials, Tri-Beam laser rifle materials (bottom of p.108), Cryolator +
    Crystalizing Cryolator materials, Super Mutant Fitting materials cell, the "Unarmed Armor
    Upgrades" heading, and the p.56 Armor stat table (for the Metal/Scrap Metal cross-check).
12. **Not extracted (out of scope of the requested schema):** the "No. of single ammunitions
    crafted" column values are in `note` strings rather than a first-class key; the p.94/95 prose
    paragraphs on Power Armor crafting (per-day check, materials multiplied by the original crafting
    time on failure) and the p.115 prose on brewing drinks (needs Crafting, Survival **and** Science
    +8 minimum) are rules text, not table rows, and were not captured as items.
13. **Uncertainty I am flagging rather than resolving:** the `untitled-food-table` may be intended
    as a continuation of "Pre-Made Food". I judged it a separate table because it has its own
    header row and a visible gap between the two tables on p.113, and because its contents (cooked
    meats) differ in kind from InstaMash/Noodle cup. If the compiler wants one food category, merge
    `pre-made-food` + `untitled-food-table` (28 rows).

## Cross-check against the 465 shipped equipment documents

Matching is case-insensitive, punctuation-normalised, trailing-period-stripped, curly-apostrophe-
normalised, against the union of names in `armor.json` (11), `weapons.json` (110), `ammo.json` (91),
`gear.json` (102), `aid-food.json` (83), `aid-med.json` (68) = 465.

**116 of 376 blueprint rows (30.9%) fail to match an existing item name.**

**94 of those 116 are expected and are not name mismatches** — they are mod/upgrade/modifier rows
that were never compiled as equipment documents in the first place:

| category | unmatched | why |
|---|---|---|
| `armor-upgrades` | 10 | upgrades, not items |
| `power-armor-upgrades` | 19 | upgrades, not items |
| `melee-weapon-mods` | 7 | mods, not items |
| `ranged-weapons-mods` | 24 | mods, not items |
| `special-ammunition` | 18 | modifier rows; the packs instead ship combined names like `.308 — Armor Piercing`, `12 gauge — Buck` |
| `special-energy-weapons-ammunition` | 4 | modifier rows |
| `syringes-special-ammunition` | 12 | modifier rows |

**The remaining 22 are real name mismatches that will break a naive join.** Listed with the
existing document they almost certainly correspond to:

| blueprint name (p.) | category | existing document | verdict |
|---|---|---|---|
| `Scrap Metal` (94) | armor | `Metal` (armor.json) | **In-book inconsistency, verified on p.56.** The Armor *stat* table on p.56 calls it "Metal"; the blueprint table on p.94 calls it "Scrap Metal". Same armor (it is the 3rd row in both tables, between Leather and Multilayered). |
| `T-45` `T-51` `T-60` `X-01` `X-02` (95) | power-armor | `Power Armor: T-45` … `Power Armor: X-02` | prefix difference only |
| `Power Armor Chassis` (95) | power-armor | *(none)* | the chassis is a crafting intermediate; no equipment doc exists |
| `Ranger Sequoia` (104) | pistols | `Ranger Sequoia revolver` (weapons.json) | the book's own weapon stat table (p.~90) also prints "Ranger Sequoia"; the `revolver` suffix is a pack-side addition |
| `Powered Hazmat Suit` (112) | items-and-gear | `Hazmat Suit, Powered` (gear.json) | word order |
| `Doctors Bag` (113) | medicine | `Doctor's Bag` (aid-med.json) | apostrophe; **the book prints no apostrophe** |
| `Stimpack (Diluted)` (113) | medicine | `Stimpak (Diluted)` (aid-med.json) | the book misspells it in this one row |
| `.308 rounds` (101) | ammunition | `.308` (ammo.json) | trailing word |
| `Nails.` (101) | ammunition | `Nails (Pack of 5)` (ammo.json) | pack-side name encodes the "5 crafted" column |
| `Gunpowder` (101) | gunpowder | *(none)* | crafting material, not equipment |
| `Yeast`, `Alcohol Yeast` (115) | drink-ingredients | *(none)* | crafting intermediates, not equipment |
| `Vault Suit`, `Stealth Boy`, `Two-way Radio`, `Electronic Lockpick`, `Electronic Lockpick Mk II`, `Pip-Boy 2000, …` (115) | unique-items | *(none)* | 6 unique items with no equipment document at all |

### Reverse check — shipped items with NO blueprint row

- `weapons.json`: **2 of 110** have no blueprint row.
  - **`Hunting Trap Fist`** — this is a **genuine gap in the book.** The weapon stat table prints
    *both* "Hunting Trap Fist" (265c, 4d4 piercing) and "Bear Trap Fist" (320c, 3d12 piercing) as
    separate weapons, but the p.100 Unarmed table gives a blueprint for **Bear Trap Fist only**.
    Hunting Trap Fist cannot be crafted or repaired by the printed rules.
  - `Ranger Sequoia revolver` — naming only (see table above).
- `armor.json`: **6 of 11** have no blueprint row: `Metal` (naming — it is "Scrap Metal"), and the
  five `Power Armor: T-xx / X-xx` (prefix only). **No armor is genuinely without a blueprint.**
- Not reverse-checked: `ammo.json`, `gear.json`, `aid-food.json`, `aid-med.json` — the encyclopedia
  is not intended to cover every consumable (e.g. it lists ~26 cooked foods against 83 food docs),
  so a reverse gap there is expected rather than diagnostic.
