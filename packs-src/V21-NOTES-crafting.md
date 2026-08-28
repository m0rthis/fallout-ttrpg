# Crafting (pg 92, 94-115) — extraction notes

Source: `FALLOUT TTRPG 2.1.pdf`, printed page number == PDF page index (offset 0).
The rulebook is not redistributed here.

Method: pg 92 (the rules prose), pg 94 (the Power Armor paragraph) and pg 115 (the Drinks
paragraph) were read as 150 dpi renders **and** cross-checked with `pdftotext -layout`; the
two agree, because those pages are prose in a two-column layout rather than tables. Every
**column heading** quoted below was read off a page render, never off `pdftotext` — the
heading is what decides which skill a row is rolled against, and it is inside a table cell.
Pages rendered and read for headings: **94, 95, 97, 99, 101, 102, 103, 110, 111, 112, 113,
115**. The headings recovered this way independently match the ones
`packs-src/BLUEPRINT-NOTES.md` recorded in its per-row `note` strings, which is a useful
double-blind: two passes, two renders, no disagreement.

The 376 recipe rows themselves were **not** re-extracted. They already exist in
`packs-src/blueprints.json` and this pass consumed them as-is.

---

## The rules, with citations

### 1. How to Craft (pg 92)

> You can craft any item so long as you have the listed materials and your Crafting skill
> bonus is equal to the listed requirement.

Meeting the listed bonus means the item is simply made. **No roll happens.** This is the
normal path, not a special case — `craftsAutomatically()` in `src/rules/crafting.ts`.

Also on pg 92: *"you must have the suitable space and tools to craft the item"*, usually a
Workbench, otherwise something jury-rigged **at GM discretion**. Reported on the chat card,
not enforced — nothing in this system models a workbench, and the book explicitly hands the
call to the GM. Note the asymmetry with repair: `src/actions/repair.ts` already ruled that
the workbench paragraph is written for crafting and does not extend to repairing.

### 2. The Crafting check and its DC (pg 92)

> If your Crafting skill does not meet the required amount, you can instead roll a Crafting
> skill check with the DC equal to 10 + the item's Crafting DC listed on the table.

So the **"Craft DC" column holds a bonus, not a DC** — identical to the "Repair DC" trap on
pg 93. Combat Knife's `+10` is DC 20. `CRAFT_DC_BASE = 10`.

> You can also roll a Crafting skill check even if your Crafting skill meets the required
> amount in an attempt to reduce less materials, however if you do; you run the risk of
> potentially failing to craft the item.

A qualified crafter may gamble for the material discount. Exposed as `CraftOptions.pushLuck`.

### 3. The result ladder (pg 92)

| Result | Printed text | Modelled as |
|---|---|---|
| **Failed** | "you lose 1d4 of each material used (to a minimum of 1 material)" | `outcome: "failed"` |
| **Failed by 8 or more** | "you lose 1d6 of each material used" | `outcome: "failedBadly"` |
| **Succeeded** | "you use all the required materials" | `outcome: "succeeded"` |
| **Succeeded by 8 or more** | "use 1d4 less material from one material used (to a minimum of 1 material)" | `outcome: "succeededWell"` |

`CRAFT_MARGIN = 8`, keyed on `total − dc`. Note the tiers are about *materials only*: a
failure by 1 and a failure by 20 both craft nothing.

### 4. Which skill (pg 94-115 column headings)

**This is the finding that most changes the shape of the feature.** Crafting is not always a
Crafting check. Fourteen of the thirty-three Encyclopedia tables head their DC column with a
different skill. All verified on a page render:

| Heading, verbatim | Page | Categories |
|---|---|---|
| `Crafting DC` | 94-101, 104-112, 115 | armor, armor-upgrades, power-armor, power-armor-upgrades, the four melee tables, unarmed-armor-upgrades, melee-weapon-mods, ammunition, the six gun tables, ranged-weapons-mods, items-and-gear, unique-items |
| `Crafting, Science, or Explosives DC` | 101 | gunpowder |
| `Crafting / Explosive DC.` | 102 | heavy-ammunition |
| `Science DC` | 102 | energy-ammunition |
| `Crafting DC modifier.` | 102 | special-ammunition |
| `Science DC modifier.` | 103 | special-energy-weapons-ammunition |
| `Medicine or Science DC modifier.` | 103 | syringes-special-ammunition |
| `Crafting and Explosives DC` | 111 | thrown-explosives, placed-explosives |
| `Crafting or Science DC` | 112 | chems |
| `Medicine DC` | 113 | medicine |
| `Survival DC` | 113-115 | pre-made-food, untitled-food-table, drink-ingredients |
| `Science or Survival DC` | 115 | drinks |

Encoded as `CATEGORY_FORMATS`. The consequence at the table: a character with Crafting +30
and Survival +0 still has to roll to cook a bloatfly.

### 5. "and" versus "or" is load-bearing (pg 102-115)

The book distinguishes them consistently:

- Healing Powder (pg 113) prints `+2 Medicine or Survival.` — **one** check, crafter's choice.
- Auto-Inject Stimpak (pg 113) prints `+4 and Crafting +8` — **two** checks, both required
  (Medicine from the column heading, Crafting named).
- Thrown/Placed Explosives print `+5 and +3` under `Crafting and Explosives DC` — two
  checks, the numbers in header order.
- Every power-armor upgrade with a Science half prints `Crafting +12 and Science +6`.

`craftRequirement()` parses all 52 string DC cells, plus the 303 plain integers and the 21
printed `-`. **0 of 376 rows fail to parse**; the breakdown is 321 craftable, 21 uncraftable,
34 modifier rows (correctly refused).

### 6. Assistance (pg 92)

> the crafting time is reduced by half for every additional creature that assists. (An item
> that has a crafting time of 1 hour is reduced to 30 minutes if one creature assists, and to
> 15 minutes if two creatures assist) However, they must also succeed in the crafting check
> if their crafting skill does not meet the required amount following the crafting check
> rules above. If they fail, the item fails to be crafted even if you or any other creatures
> succeed

(The section genuinely ends there — mid-sentence, no full stop.)

`assistedMinutes(minutes, n) = minutes / 2ⁿ`. An assistant who *does* meet the requirement
never rolls; one who does not rolls and can sink the build even when the crafter needed no
roll of their own. That last point is easy to miss and is implemented deliberately.

### 7. Power Armor: the multi-day build (pg 94)

> Successfully crafting fully functioning power armor is an extremely difficult task. Each
> day you spend crafting power armor, you must succeed the Crafting skill check (unless your
> crafting bonus is equal to the DC) and you must spend the required crafting materials each
> day. If you ever fail this crafting check, the entire armor build is failed and you must
> restart. If another creature assists you in crafting power armor, the crafting time is
> still reduced however you still require the same amount of materials. Instead of using the
> materials each day, multiple all the required materials by the original crafting time.

("multiple" is printed for "multiply".)

Printed build lengths (pg 95): Chassis 7 days, T-45 10, T-51 14, T-60 18, X-01 25, X-02 30.
So an X-02 is thirty consecutive checks, any one of which loses everything.

`powerArmorSchedule()` returns `{originalDays, days, materialMultiplier}`, where `days` is
the assisted length (one check each) and the multiplier is always the **original** count —
assistance buys time, never materials.

### 8. Drinks are gated before their own DC (pg 115)

> But for starters, you would need to at least have a Crafting, Survival, and Science skill
> bonuses of at least +8, access to the various ingredients, and lots of time to brew the
> drinks.

Three separate skills at +8 or better, on top of the row's own `Science or Survival DC`.
This is the only prerequisite in the chapter that gates an entire table.

### 9. Special Ammunition is a modifier, not a recipe (pg 102)

> the crafting DC increases by an amount equal to the Crafting DC listed on the special
> ammunition table below. […] to craft six armor piercing .308 rounds requires x5 gunpowder,
> x16 lead, x20 steel with a crafting DC of +12.

Thirty-four rows across three tables. `craftRequirement()` refuses them with
`reason: "modifier"` and points the user at the base item, rather than treating `+6` as an
absolute DC.

---

## Contradictions and ambiguities

Every one of these is commented at the code that acts on it.

1. **pg 94 says "unless your crafting bonus is equal to the DC"; pg 92 says "equal to the
   listed requirement".** These are different numbers — the requirement is the printed bonus,
   the DC is `10 +` that. Taken literally, a T-45 (`+18`) would need Crafting +28 to build
   without rolling. **Ruled: pg 92 wins.** The book uses "DC" loosely for that column
   everywhere, starting with the column heading itself, which holds a bonus. The stricter
   reading is implemented nowhere.

2. **"equal to" is read as "at least".** Same ruling `repairItem()` already made: a better
   crafter failing where a worse one succeeds cannot be the intent.

3. **"you lose 1d4 of each material used" — one roll or one roll per material?** Ruled: **one
   roll**, applied to every line. A single die expression governing "each material" is the
   plain reading of the sentence.

4. **"(to a minimum of 1 material)" — minimum of what?** The parallel construction in the
   success tier settles it: "use 1d4 less material from one material used (to a minimum of 1
   material)" can only mean the resulting quantity floors at 1. Applied the same way to the
   failure tier, and the loss is additionally **capped at the quantity the recipe called
   for** — you cannot lose 4 steel from a recipe that used 1.

5. **The "failed by 8 or more" tier prints no minimum-of-1 rider at all.** Silence, not a
   distinction. The same floor and cap are applied anyway: without the cap, failing by 8
   could cost 6 of a material the recipe uses 1 of; without the floor, a *worse* failure
   could cost *less* than a better one. Flagged in `materialsSpent()`.

6. **"1d4 less material from one material used" never says who picks the material.** Ruled:
   the crafter picks, and the implementation defaults to the largest line — anywhere else the
   minimum-of-1 floor eats most of the discount. `bestSavingIndex()`.

7. **Heavy Ammunition's slash.** `Crafting / Explosive DC.` printing `+25/+20` is the only
   two-number cell in the chapter that says neither "and" nor "or". **Ruled: "and"**, matching
   every other two-number cell (Thrown Explosives, Placed Explosives, Medicine, and every
   power-armor upgrade all write "and"). Reading it as "or" would make the Crafting half dead
   text, since the Explosives number is always the lower of the two.

8. **The Drinks gate versus the Drink Ingredients table.** The pg 115 paragraph sits above
   *both* tables, but Yeast prints its own `Survival +5` immediately below it. **Ruled: the
   +8/+8/+8 gate applies to `drinks` only.** Demanding three skills at +8 to make yeast would
   contradict the row directly under the paragraph.

9. **Multi-day builds in general.** Wasteland Wine takes six months and Vodka three weeks,
   but the daily-check rule is printed under the "Power Armor" heading and nowhere else.
   **Not generalised.** `isPowerArmorBuild()` is category-scoped to the six `power-armor`
   rows; the Power Armor **Upgrades** table (3 hours a piece) is a different table and is not
   brought in either.

10. **Rank ordering is unconstrained.** The upgrade tables print ranks 1-3 but the book never
    says you must build them in order, or that rank 3 requires rank 2. Nothing enforces it.

11. **Camouflage rank 3 (pg 94) prints an alternative qualification** — "+16, or Sneak skill
    bonus equal to +8" — and Lucky Charm (pg 110) prints a non-skill gate, "Luck ability
    score must be 7 or higher." Both are parsed out as a `rider` string and printed on the
    card. Neither is enforced: the first is a second route to the same craft that the book
    does not price against the first, and the second is an ability-score gate with no other
    example in the chapter to pattern it on.

12. **Syringes (pg 103) are half a modifier table.** Their DC column is headed "Medicine or
    Science DC modifier." but their materials column is headed plain "Crafting Materials." —
    absolute, not a delta. `BLUEPRINT-NOTES.md` lumped all three modifier tables together.
    They are still refused as recipes here, because the DC half is what would be wrong.

13. **Three time cells are jokes, not durations** (pg 98): "It's just a board!", "The time it
    takes you to hammer that board with a nail.", "You… you just pick it up." `parseCraftTime`
    returns null and the card prints the text.

14. **The book never defines a month.** Only Wasteland Wine ("Six months.") needs one; 30
    days is this system's assumption, commented at `MINUTES_PER_UNIT`.

15. **pg 92 cites the Encyclopedia as "on page 90".** It starts on page 94. Page 90 is Robot
    Overclock Programs. Already noted by the blueprint extraction; repeated here because it
    is the citation a reader will follow.

---

## What changed in `scripts/build-packs.mjs`

1. **The craft half of each row now travels onto the item** as
   `flags["fallout-ttrpg"].blueprint` — the whole row, plus a parsed `yield`. A flag rather
   than schema fields because the data has to reach armor, ammo, aid, weapon **and** gear
   documents, and those five DataModels share no base to extend; also because it is static
   reference data, not mutable actor state, so it needs no migration and no validation.
   `src/data/items.ts` was therefore **not** modified.

2. **Fixed a live bug:** `MODIFIER_CATEGORIES` contained `"syringes"`, but the extraction
   calls that category `syringes-special-ammunition`. All twelve syringe rows were being
   treated as ordinary recipes. (They match no item name, so nothing was visibly wrong — it
   would have surfaced the moment a syringe document was added.)

3. **Name matching now survives punctuation.** The Encyclopedia prints "10mm.", "Flares.",
   "Bag, Backpack." with trailing periods the stat tables omit, and "Doctors Bag" against the
   pack's "Doctor's Bag" — a curly apostrophe against none at all. Normalising both sides
   (lowercase, drop apostrophes, drop a trailing period, collapse whitespace) fixes 12 rows.

4. **Category prefixes join the upgrade and mod tables.** The book prints "Insulated" and
   "Bayonet"; the packs ship "Armor Upgrade: Insulated" and "Ranged Weapon Mod: Bayonet". The
   earlier pass wrote 60 of these off as "upgrades, not items" — they *are* items, and they
   are exactly what a player crafts. Prefixing per category also keeps the two "Light Build"
   rows and the two "Strengthen" rows apart; they are different mods with different DCs.

5. **`yield` is parsed out of the `note` strings.** The ammunition tables print a "No. of
   single ammunitions crafted" column and two medicine rows carry an italic "(makes two)"
   rider; neither had a schema key, so the extraction preserved both verbatim in `note`.
   Reading the number back out is transcription, not invention — and without it, crafting
   9mm would make one round instead of twelve.

**Result: 332 blueprints joined (was 260), of which 312 are craftable. 10 orphans remain**,
and all ten are genuine: Power Armor Chassis, Gunpowder, Yeast, Alcohol Yeast and the six
pg 115 unique items have **no equipment document in the packs at all**. That is the D3
roadmap item "Unique items — not in the shipped packs", now narrowed to exactly ten names.

---

## Rejection list

Considered and deliberately left out.

1. **Rejected: deducting materials from an inventory.** Nothing in this system represents
   steel, adhesive or "1 crafting material" — junk is not modelled, and there are no
   documents to decrement. The card prints exact quantities instead. `repairItem()` made the
   same call for the same reason. Inventing a junk economy is a separate feature, not a
   crafting rule.

2. **Rejected: picking one number for the 52 multi-value DC cells.** Instead they are
   *parsed*, into as many checks as the cell prints. Where a cell holds something that is not
   a skill check at all (Lucky Charm's Luck gate) that text is surfaced as a rider rather
   than dropped or invented into a mechanic.

3. **Rejected: generalising the pg 94 daily check to every multi-day recipe.** Wasteland
   Wine's six months would become 180 checks on a rule the book prints only for Power Armor.

4. **Rejected: applying the pg 94 daily rule to Power Armor *Upgrades*.** Different table,
   three hours a piece, and the paragraph is headed "Power Armor" and sits above the model
   table.

5. **Rejected: reading pg 94's "crafting bonus is equal to the DC" literally.** See
   contradiction 1.

6. **Rejected: enforcing the workbench.** pg 92 makes finding, creating or jury-rigging one
   explicitly a GM call. There is no world state to check and inventing one would gate every
   craft behind a flag the GM never set.

7. **Rejected: enforcing Camouflage's Sneak alternative and Lucky Charm's Luck 7.** Printed,
   surfaced on the card, not automated — see contradiction 11.

8. **Rejected: enforcing rank order on upgrades.** The book does not state it.

9. **Rejected: crafting the 34 modifier rows as items.** They are deltas on a base recipe
   (pg 102 worked example). Refused with an explanation rather than silently mis-costed.

10. **Rejected: choosing between alternative recipes automatically.** Roughly twenty cells
    print two recipes ("…and x1 steel. Or; …x3 healing powder", Stimpak pg 113). The first is
    costed and the whole printed cell is shown, flagged as having alternatives. Picking one
    is a player decision the book leaves open.

11. **Rejected: repairing the book's damaged materials cells.** Tri-Beam laser rifle's missing
    steel line, the Cryolator's doubled "screws", Super Mutant Fitting's blank materials cell,
    Wasteland Wine's trailing comma, Bottlecap Mine's missing punctuation. The parser copes
    with the punctuation (it splits an interior `xN` boundary, so "x10 bottle caps x5
    circuitry" counts as two lines) but **no missing value is invented**. This matches the
    blueprint extraction's own rejections 3, 4 and 5.

12. **Rejected: adding craft fields to `src/data/items.ts` or `src/data/armor.ts`.** See
    build-packs change 1 — a flag reaches all five document types, and `armor.ts` is not a
    file this pass owns.

13. **Rejected: creating the ten missing equipment documents** (Power Armor Chassis,
    Gunpowder, Yeast, Alcohol Yeast, Vault Suit, Pip-Boy, Stealth Boy, Two-way Radio, and the
    two Electronic Lockpicks). They belong in `packs-src/gear.json`, which this pass does not
    own, and the unique items need stat blocks from pg 91 rather than just a recipe.

14. **Rejected: a chat card per day on a Power Armor build.** Thirty roll cards for one X-02
    is worse than a summary; the day-by-day totals print on the single result card, and a
    same-session craft still narrates every roll normally.

15. **Could not verify — nothing.** Every column heading claimed above was read off a page
    render. The one number in this document that is an assumption rather than a reading is
    "30 days in a month" (contradiction 14), and it affects exactly one row.
