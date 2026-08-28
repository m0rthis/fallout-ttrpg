# Extraction Notes — Fallout TTRPG v2.0 (fan-made) equipment tables

Source: `Fallout TTRPG v2.0 (PDF).pdf`. **In this PDF the printed page number equals the PDF
page index** (printed pg 52 is PDF page 52), not printed + 1. Every table page was read as an
image and cross-checked against `pdftotext -layout` run one page at a time.

Pages covered:

| Content | Pages |
| --- | --- |
| Armor types table | 52 |
| Armor upgrades table | 52 |
| Power Armor types and statistics | 54 |
| Power Armor upgrades | 54–56 |
| Melee special properties glossary | 57–58 |
| Bladed weapons | 58–59 |
| Blunt weapons | 59–60 |
| Mechanical weapons | 60–61 |
| Unarmed weapons | 61 |
| Melee weapon modifications | 62 |
| Ammunition (guns / energy / heavy) | 64 |
| Special ammunition (guns) | 64–65 |
| Special ammunition (energy weapons) | 65 |
| Special ammunition (syringer) | 66 |
| Ranged weapon special properties glossary | 66–67 |
| Handguns, Submachine Guns | 68 |
| Rifles, Shotguns | 69 |
| Big Guns | 70 |
| Energy Weapons | 71 |
| Ranged weapon modifications | 72–75 |
| Explosive special properties glossary | 76–77 |
| Thrown / Placed explosives | 78 |

Counts: weapons 109, armor 11, ammo 91, gear 75.

---

## Global judgment calls

### 1. `critChance` = 0 means "no critical hit listed"
Four entries have `-` in the Critical Hit column (all Area of Effect weapons, which do not make
an attack roll): **Flamer, Missile Launcher, Fat-Man** (pg 70) and **Cryolator** (pg 71).
`critChance` is `0` and `crit` is `""` for these, mirroring the schema's use of `0` for n/a
elsewhere. Do not read `0` as "crits on a 0".

**This note described the data but not the code for several releases.** `WeaponData.critChance`
carried `min: 2` — the floor a *printed* chance stops falling to under mod stacking — so Foundry
cleaned all four documents up to `2` on load, and `critThreshold` then subtracted half the Luck
modifier from that. In a shipped world these four weapons critically hit on a `2` or better and
announced an empty multiplier. The schema now allows `0`, `critThreshold` returns
`CRIT_IMPOSSIBLE` for it before doing any arithmetic, and `rollAttack`'s sneak-attack clause —
which grants a crit outright and never consults the threshold — is gated separately.

### 2. `crit` holds only the multiplier/dice; rider effects moved to `special`
The book's Critical Hit column often mixes a value with an effect, e.g. Sledgehammer
"20, 3d12, Dazed." The value goes in `crit` (`"3d12"`), the rider is appended to `special`
("Critical hit applies Dazed"). Where the column lists **only** an effect and no value,
`crit` is `""` and the effect is in `special`, flagged "(no crit damage listed)". Affected:
Protest Sign (pg 60), Cattle Prod, Drill, Plasma Cutter (pg 60–61), Sickle (pg 59),
Spiked Knuckles (pg 61), Syringer (pg 69), Solar Scorcher (pg 71).

### 3. Crit ranges of 19–20
Sickle "19, 20." (pg 59), Drill "19, 20." (pg 61), Spiked Knuckles "19 - 20" (pg 61) are recorded
as `critChance: 19` with the full text preserved in `special`. Note these three have **no**
crit multiplier at all — the column lists only the range plus "Applies bleeding".

### 4. "X or Y" damage types
The schema allows one `damageType`. Where the book lists two ("1d6 piercing or slashing"), the
**first** listed type is used and the full text is preserved in `special` as
`Damage: 1d6 piercing or slashing`. Affected: Knife, Switchblade, Combat Knife, Spear, Sword,
Assaultron Blade, Pitchfork, Shovel, Stop Sign, Bear Skull Arm, Junk Jet.

### 5. Two-part damage
Cattle Prod ("1d4 bludgeoning / 2d8 electricity", pg 60) and Shishkebab ("2d6 slashing, 2d6 fire",
pg 61) carry only the first die in `damage`/`damageType`; the full expression is in `special`.

### 6. `damage` for flat values
Commie Whacker, Paddle Ball (pg 60), Acid Soaker (pg 68), H&H Tools nail gun (pg 68),
Syringer (pg 69) and Flash Bang (pg 78) list a flat `1` rather than dice. Recorded verbatim as
`"1"`. `"1d4 + 1"` / `"1d8 + 1"` (Brass Knuckles, Spiked Knuckles, Board with a nail) are
normalised to `"1d4+1"` / `"1d8+1"` — spacing only, no value change.

### 7. Flat ranges vs ×PER multipliers
`rangeNormal`/`rangeLong` are the two ×PER multipliers. Four ranged weapons list a **flat
distance** instead, so both fields are `0` and the real range is in `special`:

| Weapon | Page | Listed range |
| --- | --- | --- |
| Acid Soaker | 68 | 30 ft. |
| Flamer | 70 | 60 ft. line, 10 feet wide, or a 20 ft cone |
| Fat-Man | 70 | 120 feet |
| Tesla cannon | 71 | 30 feet |
| Cryolator | 71 | 20 ft cone |

Melee weapons are all `0/0`; their **Thrown** multipliers (which multiply STR, not PER) are kept
in `special` as e.g. `Thrown (x3/x6)`.

### 8. Melee thrown ranges are ×STR
Per pg 58, Thrown range = Strength score × the listed numbers. Not stored in `rangeNormal`.

---

## weapons.json specifics

- **Gamma gun (pg 71) — `damageType` is `""`.** The book lists `1d12 radiation`. The system's
  `DAMAGE_TYPES` (src/rules/constants.ts) has thirteen entries and deliberately excludes
  radiation ("radiation is tracked separately as rad levels"). Rather than invent a substitute
  I left the field empty and noted `Damage type is radiation` in `special`.
  **This is the one entry that needs a human decision.**
- **Cryolator / Crystalizing Cryolator (pg 71)** list damage as `3d10 cryo` / `2d10 cryo`.
  Mapped to `damageType: "cold"`; the original word "cryo" is preserved in `special`.
- **Power Fist (pg 61)** — the table says "Ammo, 20 rounds" without naming an ammo type.
  `magazineSize: 20`, `ammoType: ""`, and the gap is noted in `special`.
- **Solar Scorcher (pg 71)** — ammo column reads "The weapon can fire so long as it is in
  Sunlight." `ammoType: ""`, `magazineSize: 0`, text moved to `special`.
- **Junk Jet (pg 69)** — `ammoType` is the literal string
  `"Any item that is smaller than 1 cubic foot"`; there is no matching ammo.json item.
- **Acid Soaker (pg 68)** — ammo is "Acid, 20 rounds". The book has **no** Acid entry in any
  ammunition table, so `ammoType: "Acid"` has no matching ammo.json item.
- **Minigun (pg 70)** — `magazineSize: 120`; the "(uses 10 per attack)" note is in `special`.
- **Riot Shotgun (pg 69)** — printed as "Powerful. Semi-Automatic Spread. Two Handed." with a
  missing period; read as three properties: Powerful, Semi-Automatic, Spread (+ Two Handed).
- **Steel Bumper Sword (pg 59)** — property is printed as "Always Cleaves" (not "Cleave").
- **Chainsaw (pg 60)** — printed "Two-Handed" with a hyphen; every other entry uses
  "Two Handed". Left verbatim.
- **Assault Rifle (pg 69)** — the mode-specific block (`Single Shot:` / `Automatic:`) is
  flattened into one `special` string.
- **Missile Launcher / Fat-Man (pg 70)** — the radius is part of the Damage cell in the book;
  `damage` holds only the dice and the radius text is in `special`.
- **Ammo type name normalisation.** Weapon tables and the ammunition table spell some types
  differently. Weapon `ammoType` values were normalised to the ammunition table's names so they
  join up in Foundry. Changes made:
  `Energy Cells` → `Energy Cell`; `Microfusion Cells` → `Microfusion Cell`;
  `Flamer fuel` (Shishkebab) and `fuel` (Flamer) → `Fuel`; `Spike` (Railway Rifle) →
  `Railway Spike`; `Mini nuke` → `Mini Nuke`; `Cryo cell` → `Cryo Cell`; `Flare` (Flare Gun) →
  `Flares`; `.44` / `.357` / `.45-70 Gov't` → `.44 Magnum` / `.357 Magnum` / `.45-70 Gov't.`.
  No numbers were altered.

## armor.json specifics

- The six base types (pg 52) are transcribed exactly.
- **Power Armor (pg 54) is a schema mismatch and needs review.** T-45/T-51/T-60/X-01/X-02 are
  included as named armor with `armorType: "metal"` (a guess — the book does not assign them a
  material). Power Armor has **Defense Points (DP)**, not a Damage Threshold, so `dt` is `0` and
  the real DP value, Repair DC and Allotted Time are written into `description`.
  `load: 100` and `strengthReq: 0` per pg 53 ("All Power Armor has a load of 100. If you are
  wearing the Power Armor, its load is equal to 0, Power Armor has no Strength Requirement").
  Names are prefixed `Power Armor: ` (e.g. `Power Armor: T-45`).
- Costs are transcribed with the thousands separators removed: 4,050 → 4050, 80,250 → 80250,
  85,750 → 85750, 133,500 → 133500, 155,000 → 155000.
- The book lists no other named armor variants — armor is generic types plus upgrades.

## ammo.json specifics

- 25 standard types: 16 guns + 6 energy + 3 heavy (pg 64).
- **Nails** is priced "2c. (Pack of 5)". The item is named `Nails (Pack of 5)` with
  `costPerRound: 2`, i.e. **the cost is per pack of five, not per nail**. Noted in its
  description.
- Heavy ammunition (Fuel, Mini Nuke, Missile) has an "Individual Load" (20 / 12 / 10) which the
  schema has no field for; it is recorded in `description`.
- **Special ammunition is expanded per applicable base round.** The book gives one row per
  special type with a list of compatible calibres and a cost *modifier*. Each combination became
  its own item named `<base> — <special>` (e.g. `10mm — Hollow Point`), with `costPerRound`
  computed as `base cost × modifier`. Both the modifier and the arithmetic are spelled out in
  `special`, so any computed value can be checked. 46 gun variants + 8 energy variants.
- Non-integer computed costs (the book gives no rounding rule) are stored as decimals:
  `12 gauge — Bean Bag` 2.5, `12 gauge — Buck` 3.75, `20 gauge — Buck` 1.5,
  `5mm — Rubber` 2.5, `Microfusion Cell — Bulk` 17.5.
- `-50%` was read as ×0.5 and `-25%` as ×0.75.
- The special-ammo tables abbreviate `.357`, `.44` and `.45-70`; matched to the base table's
  `.357 Magnum`, `.44 Magnum`, `.45-70 Gov't.`.
- **`Incendiary` special ammo applies to `.50` and `Missile`** (pg 65). Missile's base cost is
  50c (heavy ammunition table), giving `Missile — Incendiary` at 200c.
- The 12 Syringer types (pg 66) are included as ammo with `ammoType: "Syringe"` and names
  `Syringe — <name>`; these have their own flat costs, not modifiers.

## gear.json specifics

Everything here has no cost/load column of its own in some cases — see below.

- **Armor Upgrades** (9, pg 52), prefixed `Armor Upgrade: `. Rank 1/2/3 effects are all in
  `description`. `load: 0` (the book gives upgrades no load).
- **Power Armor Upgrades** (19, pg 54–56), prefixed `Power Armor Upgrade: `.
  - `Jet Pack` Rank 1 text is **truncated in the source**: "You can spend 1 AP on your turn to
    fly 5 feet upwards. For every 5 feet you fly you" — the sentence ends mid-clause on pg 55.
    Transcribed as printed.
  - `Super Mutant Fitting` costs "50% base cost." — not a fixed number, so `cost: 0` with the
    text in `description`.
  - `Tesla Coils` and `Overclock Hydraulics` rank-1 text spans the pg 54→55 and pg 55→56 page
    breaks; the halves were rejoined.
- **Melee Weapon Modifications** (7, pg 62), prefixed `Melee Weapon Mod: `. All are priced as a
  percentage of the host weapon's cost, so `cost: 0` and the percentage is in `description`.
  The book's row is titled "Sharpened, Serrated, or Barbed." — stored as
  `Melee Weapon Mod: Sharpened, Serrated, or Barbed`.
- **Ranged Weapon Modifications** (24, pg 72–75), prefixed `Ranged Weapon Mod: `. Same
  percentage-cost issue; `cost: 0` except **Lucky Charm (50c)** and **Speedloader (450c)**,
  which are flat. Mod Slot Total, equip time and the Equippable Weapons column are all in
  `description`.
  - `Scope`'s Equippable column reads "Any revolver or rifle. The Laser Rifle, Plasma Rifle, or
    Gauss Rifle." — the second sentence lacks a connective ("including"?) that the parallel
    Infrared Scope row has. Transcribed as printed.
  - `On-Board Target Tracking` excludes the "Gatling Gun" — the weapon table calls it
    **Gatling laser**. Transcribed as printed.
- **Name prefixes are an addition, not from the book.** They were added because several upgrade
  names collide across tables (`Sturdy`, `Light Build`, `Strengthen`, `Ergonomic`/`Ergonomic
  Grip`, `Explosive Shielding`) and Foundry compendium entries want unique names. Strip the
  prefixes if you'd rather have the raw names.
- **Explosives** (16, pg 78) went to gear.json, not weapons.json, because their table has a
  different shape: no Critical Hit, no Strength Requirement, and an Area of Effect column
  instead of a Range/crit pair. Names are verbatim. AP, damage, range/Arm DC, area of effect,
  special properties and load are all written into `description`; `cost` and `load` are also
  fielded.
  - Placed explosives list Arm DC as a bonus (`+1`, `+4`, …). Per pg 76 the actual check is
    `10 + that bonus`; the description says so explicitly.
  - `Plasma Grenade`'s Special Properties cell is `-` (none).
  - `Nuke Mine` damage is "12d10 explosive and two levels of rads."
  - `C-4 plastic Explosive` is capitalised exactly as printed.

## Things intentionally NOT extracted

- The special-properties glossaries (melee pg 57–58, ranged pg 66–67, explosive pg 76–77) are
  rules text, not item tables. Property keywords appear in each item's `special` field; the
  definitions were not duplicated into any pack.
- "Other Equipment / Items and Gear" (pg 79 onward) was outside the requested page range.
- Crafting tables, which reference these items from elsewhere in the book.

## Addendum — Unique Items (v2.1, pg 91)

Source for this section only: `FALLOUT TTRPG 2.1.pdf`, printed pg 91 (`pdftotext -f 90 -l 92`),
which is where the v2.1 book prints the "UNIQUE ITEMS" section. Everything above this heading
was extracted from the v2.0 PDF and its page numbers refer to that book.

The section names **nine** items, not the seven BACKLOG D1 lists — it also prints a
**Two-way Radio**, and the "lockpicks" of that entry are two separate items
(**Electronic Lockpick** and **Electronic Lockpick Mk II**), distinct from the ordinary
`Lockpicks` gear item. All nine ship as documents and their names match the Blueprint
Encyclopedia rows, so all nine join:

| Name | File | Cost | Load |
| --- | --- | --- | --- |
| Vault Suit | `armor.json` (cloth armor) | 1300c | 5 |
| Pip-Boy 2000 | `gear.json` | 300c | 4 |
| Pip-Boy 2000 Mark VI | `gear.json` | 600c | 3 |
| Pip-Boy 3000 | `gear.json` | 550c | 4 |
| Pip-Boy 3000 Mark IV | `gear.json` | 850c | 3 |
| Stealth Boy | `gear.json` | 500c | 3 |
| Two-way Radio | `gear.json` | 120c | 2 |
| Electronic Lockpick | `gear.json` | 500c | 2 |
| Electronic Lockpick Mk II | `gear.json` | 750c | 3 |

Judgment calls:

- **The four Pip-Boy names are load-bearing.** The Encyclopedia prints one row,
  "Pip-Boy 2000, 2000 Mark VI, 3000, 3000 Mark IV.", which `BLUEPRINT_ALIASES` in
  `scripts/build-packs.mjs` fans out to exactly these four names. Renaming any of them
  silently drops its recipe (that row's craft DC and time are printed "–"; its materials cell
  reads "Cannot be crafted. Try one of those vaults.").
- **The shared Pip-Boy paragraph is repeated on all four documents**, followed by that model's
  own sentence. The book prints the common text once above the model list; a player who imports
  only one model would otherwise lose the maps/holotape/vitals text.
- **Pip-Boy 2000 Mark VI's sentence has no closing period in the book.** Transcribed as printed.
- **Vault Suit is an `armor` document, not `gear`** — the book says it "functions as cloth
  armor" with four rank-1 upgrades built in, so it carries cloth's AC/load and its description
  spells out what those four upgrades (pg 57) do rather than relying on an upgrade system that
  does not attach.
- **Nothing here is automated**, and each of the eight `gear.json` entries now says so in a
  `Not automated:` line: no sheet control reads a Pip-Boy, activating a Stealth Boy applies no
  invisibility and does not mark itself spent, the radio's 100 activations are hand-tracked, and
  the lockpicks are not consumed or destroyed by use. The Stealth Boy note points at the Nightkin
  **Stealth Field** (pg 12) as the invisibility pattern to follow once that lands (BACKLOG C4).
- **No schema field is missing.** `GearData` (`src/data/items.ts`) has no "note" or "uses"
  field, so the not-automated caveats live in `description`; per-item charges (the radio's 100
  activations, the Mk II lockpick's three uses) have nowhere to live as data, which is a real
  but deliberate gap — nothing else in the system tracks item charges either.

## Addendum — Crafting junk (v2.1, pg 94-115) — `junk.json`

Source for this section only: `FALLOUT TTRPG 2.1.pdf`. Everything above the
"Unique Items" heading was extracted from the v2.0 PDF; page numbers here are
v2.1's.

### The book prints no junk table

This is the finding, and it changes what "extraction" means for this file.
BACKLOG D2 asked for "the pg 94+ junk list". There is no such list. What the
book has is:

- a Crafting chapter (pg 92-93) that spends junk on every page and never
  enumerates it;
- the **Vault-Tec Item Blueprint Encyclopedia** (pg 94-115), whose *Crafting
  Materials* and *Repair Materials* columns name a material 1,807 times;
- four rules elsewhere that spend a named junk item — "1 cloth junk item"
  (pg 21, 23), "3 steel and 1 circuitry junk" (pg 11), "six oil junk items"
  (pg 10), "5 circuitry junk items" (pg 88);
- the **Randomizer** perk (pg 50), which replaces a requirement with "a randomly
  chosen junk material" — a rule that *presupposes* an enumerated set and is
  given none;
- **Hoarder** (pg 26), which counts "junk items" toward a Carry Load threshold.

`pdftotext -layout` over the whole book returns twelve hits for "junk". Three of
them are the *Junk Jet* weapon and one is the word "junkies"; the other eight are
the rules listed above. None is a heading, and none introduces a table. So
`junk.json` is a **census of the Encyclopedia's two materials columns**, not a
transcription of a printed table, and it should be read as this system's answer
to a silence rather than as book data. The census was taken with the same
splitter `parseMaterials()` uses in `src/rules/crafting.ts`, run over
`packs-src/blueprints.json`, which is why it agrees with what crafting actually
parses at runtime. 164 distinct names came out.

### What the 164 were cut down to

**41 documents ship.** The cuts, in order of how many names each removed:

1. **~40 prose lines are not materials at all** and parse as null-quantity
   fragments: "Cannot be crafted", "no materials required", "of each material
   required to craft the type armor you are modifying", "reduce required lead by
   1", "a sharp edge", "copy of the weapon that has no levels of decay". The
   parser keeps these deliberately (see its own comment) and they are correctly
   not documents.
2. **37 names already ship as documents in another pack** — mostly food, drink
   and chems used as ingredients (razorgrain, mutfruit, tato, carrot, brain
   fungus, purified water, dirty water, nuka-cola, buffout, jet, psycho, med-x,
   mentats, stimpak, healing powder, beer, vodka, whiskey…), plus four that are
   `ammo` (fuel, cryo cell, microfusion cell, mini nuke) and one that is `gear`
   (bear trap). Duplicating any of these as junk would put two documents behind
   one material and hide the existing one from `consumeJunk`.
3. **~40 more are food and drink ingredients that ship nowhere yet** — hubflower,
   coffee beans, molasses, sugar, maize, citrus, flour, potatoes, tobacco leaf,
   radstag/mole rat/bear/gecko/bloatfly/radroach meat, deathclaw egg,
   radscorpion stinger, nightstalker blood, broc flower, ander root, glowing
   fungus, barrel cactus fruit, pinyon nuts. These are a **gap in `aid-food.json`,
   not in `junk.json`**: their published siblings are `aid` documents, and
   shipping them here would split one category across two item types. Left for a
   later batch and recorded in the D2 integration notes.
4. **~20 name a specific found object rather than a stocked material**, each used
   by exactly one recipe: a ski (Ski Sword), a bear skull (Bear Skull Arm), a
   deathclaw hand (Deathclaw Gauntlet), a plastic/steel car bumper (the Bumper
   Swords), an assaultron circuit board, a solar panel, a terminal, a fission
   battery, bottle caps (Bottlecap Mine), a knife or a copy of the weapon
   (Bayonet, Double Sided). These are GM loot, not inventory a player stocks;
   `consumeJunk` reports them missing and the recipe's printed cell still says
   what is wanted.
5. **Two are the book's own typos**, left unmapped: "mentants" for Mentats
   (Yellow Belly, pg 113) and "x 6 oil" with a stray space (already handled by
   the parser). "x1 circuit" (Laser rifle) is **not** mapped onto `circuitry`
   despite 67 uses of the latter — that is a guess about a different word, and
   the alias table is only for inflections.

### The 41, and the four groups they are commented under

| Group | Materials |
| --- | --- |
| Raw scrap | steel, aluminum, copper, lead, gold, silver, ceramic, glass, plastic, rubber, wood, cloth, leather, fiberglass, ballistic fiber, cardboard, asbestos, tin can, large animal bone, large animal fur |
| Salvaged components | screws, nails, spring, gear, circuitry, fiber optics, crystal, power armor chassis |
| Chemicals and compounds | adhesive, acid, oil, antiseptic, abraxo cleaner, fertilizer, paint, gunpowder, nuclear material, nuclear component |
| Brewing intermediates | yeast, alcohol yeast |
| Generic | crafting material |

Judgment calls:

- **Every document is named `Junk: <Material>`, and the prefix is load-bearing.**
  Three materials share a name with an armor type — Steel, Cloth and Leather —
  and `build-packs.mjs` joins blueprints onto items *by name*. An unprefixed
  `Steel` junk document would have been handed the steel armor's repair DC and
  crafting recipe. The prefix also groups all 41 together in a compendium list,
  which is how a player will actually use them. Nothing matches on the display
  name: `system.junkType` carries the canonical key.
- **`crafting material` ships as a document** even though it names no substance.
  284 Encyclopedia cells ask for it — more than steel and adhesive combined —
  and almost every weapon in the book is built out of it. The book counts it, so
  it is countable; what one *is* remains a table question.
- **`power armor chassis` is junk rather than gear.** It is crafted (Crafting
  +20, 7 days) and then consumed whole by each of the five power armor recipes,
  which is a material's life cycle, not equipment's.
- **`yeast` and `alcohol yeast` are the two ingredients that ship as junk.** Both
  are craftable Encyclopedia rows with no document anywhere, and neither is eaten
  or drunk — they are brewing intermediates. The rest of the drink-ingredients
  category is food and is excluded under cut 3 above.
- **`tin can` absorbs `tin`** (War Drum's "x2 tin can" against the Canteen's "x2
  tin"), and `large animal bone` absorbs the Shiv's bare `bone`. Both are one
  material spelled two ways in adjacent rows.
- **Inflections are folded, different words are not.** `JUNK_ALIASES` in
  `src/data/items.ts` maps screw→screws, nail→nails, springs→spring, gears→gear
  and the two above. It does not map circuit→circuitry.
- **No junk has a price or a Carry Load**, because the book prints neither for
  any material anywhere. Every document ships `cost: 0, load: 0` and says so in
  its description rather than carrying an invented number. The one visible cost
  of that choice is Hoarder (pg 26), whose 50-load threshold counts junk items
  and will count these as nothing.
- **Four orphan recipes now join.** Gunpowder, Yeast, Alcohol Yeast and Power
  Armor Chassis were the entire "unstocked recipes" report the build has printed
  since D1; `BLUEPRINT_ALIASES` in `scripts/build-packs.mjs` maps each onto its
  `Junk:` name and the build now reports **0 blueprints with no matching item**.

### Regenerating

`junk.json` is derived from `blueprints.json` — the per-document description
carries the cell count, the blueprint count and four example recipes, all read
out of it. If `blueprints.json` is ever re-extracted, those numbers go stale
silently. Re-take the census the same way (parse both materials columns of every
non-modifier row with `parseMaterials`'s splitter, count by normalised name)
rather than editing the counts by hand.

## Addendum — Weapon modifications (v2.1, pg 65 and pg 75-77) — `mods.json`

BACKLOG D3. `system.mods` on a weapon was a bare free-text string that nothing
read, which is why the Silencer's one mechanical clause had to be *declared* at
the call site (`AttackOptions.silenced`). `mods.json` is the transcription of
both printed tables; `src/rules/mods.ts` is the machine-readable half.

### The page range in the backlog was wrong

The backlog entry said "pg 71-77". Verified by extracting single physical pages
(in this PDF the physical page number equals the printed folio):

- **pg 65** — Melee Weapon Modifications, 7 rows, entirely on one page.
- **pg 75-77** — Ranged Weapon Modifications, 24 rows. Page 75 carries the
  section text and Auto-Firing Turret through Holographic weapon sight; page 76
  Improved Rifling through Overclocked Capacitor; page 77 Remote Controlled
  Turret through Strengthen. **The Silencer is on pg 77**, which is what every
  existing citation in the code already said.
- **pg 101** and **pg 110-111** — the crafting-blueprint tables for the same 31
  rows, already in `blueprints.json` under the categories `melee-weapon-mods`
  and `ranged-weapons-mods`, and already joined onto the gear documents.

31 rows in total.

### These documents already existed

All 31 mods have shipped as `gear` documents since the equipment extraction —
`"Ranged Weapon Mod: Silencer"`, `"Melee Weapon Mod: Heavy"` — carrying the
printed prose and nothing machine-readable, and `CATEGORY_PREFIXES` in
`scripts/build-packs.mjs` has been joining their crafting DCs on by that name
for as long as the blueprint join has existed. So `mods.json` is **not** a new
set of documents; `gear.json` is untouched. The build reads `mods.json` and
writes exactly one field onto the documents that already exist,
`system.modKey`, and refuses to build if the two lists disagree in either
direction or if a key is not declared in `src/rules/mods.ts`.

### Judgment calls in the transcription

- **Three names collide across the two tables.** Strengthen and Light Build are
  printed in both and do different things with different crafting DCs; melee
  "Ergonomic" is a different mod from ranged "Ergonomic Grip". The document
  names have always been kept apart by their table prefix; the *keys* are kept
  apart by prefixing all seven melee keys with `melee` — all seven rather than
  only the colliding three, so the rule is "melee mods are prefixed" instead of
  "melee mods are prefixed when they happen to collide".
- **The melee table has no Mod Slot column and no Equippable Weapons column.**
  `modSlotTotal` is `null` for all seven, and `equippableWeapons` carries the
  page's own sentence: "whether or not a weapon can use the mods is up to your
  GM". The one-mod limit is pg 65's prose, not a column.
- **The melee table has no Time to Equip column either.** One sentence covers
  all seven ("switched for another with 5 minutes of time unless otherwise
  specified"), and four rows specify otherwise inside their own effect text.
  Those four carry `"timeToEquip": "Permanent; cannot be switched."`, which is a
  restatement of their own effect text rather than a column that exists.
- **"Any weapon." in the ranged table means any *ranged* weapon.** The section
  opens "Most ranged weapons can be customized with the following
  modifications" and its limit sentence is written about ranged weapons only, so
  the column is scoped by its own heading. Transcribed verbatim; the scoping
  lives in `rules/mods.ts`.
- **The book has a weapon category this system does not.** Four rows are
  restricted to "Any revolver", and revolver is not one of the six printed
  ranged weapon types — every revolver in `weapons.json` is a `handgun`
  distinguished only by its name. `rules/mods.ts` matches the word in the name
  and says so at length; nothing here invents a type.
- **Multi-line materials cells are joined with a space**, preserving the
  book's own sentence punctuation: the Auto-Firing Turret's second line is an
  either/or ("x6 steel or x12 wood") and must not be flattened into the comma
  list above it.
- **`craftDC` is a string, not a number**, because Lucky Charm's cell is not a
  number: "+2 and Luck ability score must be 7 or higher". The numeric DCs the
  crafting code uses continue to come from `blueprints.json` as before; the
  column is transcribed here for provenance only.
- **"Sharpened, Serrated, or Barbed." is one row, not three**, and its printed
  heading really does carry a trailing period.

### Not a third mod table

The Encyclopedia's **"Unarmed Armor Upgrades"** category (pg 100-101) is named
like one and is not: its seven rows are Brass Knuckles, Spiked Knuckles, Boxing
Gloves, Bear Skull Arm, Deathclaw Gauntlet, Bear Trap Fist and Power Fist — the
unarmed *weapons* themselves. Ordinary **Armor Upgrades** (pg 56-57, 10 rows)
and **Power Armor Upgrades** (pg 59, 19 rows) are real and separate; the latter
is already modelled in `src/rules/power-armor.ts`.

### One name in the ranged table matches no weapon

On-Board Target Tracking (pg 76) excludes "the Gauss rifle, Gauss pistol, or
**Gatling Gun**". No weapon in this book is called a Gatling Gun: the tables
print a *Gatling laser* (energy weapon, pg 75) and a *Minigun* (big gun).
`mods.json` transcribes the column as printed; `src/rules/mods.ts` excludes both
the printed name and the Gatling laser, on the reading that the mod fits energy
weapons only and the Minigun is not one. Stated there in full — an exclusion
that matches no shipped document is silently wrong.

### What the mod derivation needed back from this extraction

D3's second slice folds the mods' printed clauses into the weapon's own numbers
(`applyMods` in `src/rules/mods.ts`). Nothing in `mods.json` changed for it —
that file stays a transcription of the printed cells, and the arithmetic lives in
the rules module, joined by key — but two of the transcription decisions above
turned out to decide a rule, which is worth recording where the decisions are.

- **§2, "`crit` holds only the multiplier/dice", decides half of Ergonomic
  Grip.** Two rows (Ergonomic Grip pg 76, melee Heavy pg 65) print "the weapon's
  critical hit **modifier** or damage dice increases by 1". The Finesse trait
  (pg 32) prints the same sentence with the word spelled out — "the critical hit
  damage **multiplier**" — so the branch operates on the multiplier. But the
  Critical Hit column is not always one: §2 kept the blunt weapons' *dice* form
  verbatim (`"3d12"`), two rows print a flat `"+1"`/`"+2"`, and twelve are `""`
  because the column carried only a rider effect. So the crit branch applies to
  the multiplier and flat forms and **reports itself inapplicable** on the other
  two, rather than inventing a second ranking for a column the book never ranks.
  Had §2 normalised that column into a number, the choice would have looked
  applicable everywhere and been silently wrong on the 63 of 110 weapons whose
  Critical Hit column is dice (51) or empty (12).
- **§1, "`critChance` = 0 means no critical hit listed", generalises into the
  fold.** `applyMods` reads a printed 0 in `critChance`, `rangeNormal`,
  `rangeLong` and `magazineSize` as "the book printed nothing here" and refuses
  to modify it — Lucky Charm does not improve a Flamer's crit and Increased Clip
  Size does not conjure a magazine onto a weapon with none. `attackRangeReport`
  in `src/dice/rolls.ts` already read a 0 long range that way; this makes it one
  convention across four columns instead of one habit in one function.
- **The damage column vindicates the rank ladder.** The derivation rules the
  ladder as d4→d6→d8→d10→d12 (the die, not the count), and the extracted data is
  part of the evidence: of the 110 weapons, 105 print a damage die and every one
  of those is a d4, d6, d8, d10 or d12 — no d2, no d3, no d20 anywhere in the
  column — while the other five print the flat number `1` and so have no rank to
  step at all (the fold reports those rather than guessing one). The only two
  bounds the mod table prints —
  Silencer's "minimum of d4", Hardened Receiver's "maximum of d12" — are exactly
  its ends. The Throwing Knife's "If thrown, damage die increases to 1d6" on a
  1d4 weapon (pg 62) is the book stepping the same ladder in its own words.
