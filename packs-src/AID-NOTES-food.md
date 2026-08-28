# Extraction Notes — Food and Drinks (`aid-food.json`)

Source: `Fallout TTRPG v2.0 (PDF).pdf`. **Printed page number equals the PDF page index**
(printed pg 83 is PDF page 83), no offset. Every table page was rendered at 200–300 dpi and read
as an image, then cross-checked against `pdftotext -layout` run one page at a time. Rows that sit
on a column/page boundary were re-cropped at 300 dpi and read again.

Pages covered:

| Content | Pages |
| --- | --- |
| Food and Drink property glossary (Consumption, Addictive … Pungent) | 82 |
| Property glossary continued (Putrid, Cleansing, Strengthening, Lucky, Charged) | 83 |
| Pre-Made Food table | 83 |
| Produce table | 83 |
| Cooked Food table | 83–84 |
| Drinks table | 84 |

**The section ends on pg 84, not 85.** Printed pg 85 is blank (`pdftotext` returns only the page
number, and the rendered image is empty). Medicine starts on pg 86 and is out of scope.

Counts: **82 items** — Pre-Made Food 12, Produce 23, Cooked Food 26, Drinks 21.
`aidType`: 61 `food`, 21 `drink`.

---

## Judgment calls

### 1. `addictive` is `true` for the 12 drinks with the Addictive property
The brief's default was `false`/`""` for all food and drink, "but if the text says otherwise,
follow the text." The text says otherwise: the **Addictive** property on pg 82 is a real
addiction rule — "you must succeed an Endurance ability check equal to 5. If you fail, you become
addicted to alcoholic drinks." So every drink whose Properties column lists **Addictive** has
`addictive: true` and a `withdrawal` string transcribing the pg 82 consequence and cure:

> Alcohol addiction (pg 82): while addicted to alcoholic drinks you always have two levels of
> exhaustion unless you are drunk. You lose the addiction if you spend a number of weeks equal to
> 6 minus your Endurance ability modifier (minimum 1).

Affected (12, all drinks): Absinthe, Beer, Dirty Wastelander, Moonshine, Rum, Scotch, Vodka,
Wasteland Tequila, Whiskey, Dead Man's Wine, Wasteland Wine, Wine. **No food item is addictive.**
Note the book's own wording makes the Addictive check conditional on the drink *also* having the
Alcoholic property; Absinthe, Dirty Wastelander, Moonshine, Rum, Scotch, Vodka, Wasteland Tequila
and Whiskey are **High-Proof**, not Alcoholic, so a strict reading would exempt them. The flag is
set on all twelve because the table clearly intends them to be addictive; the strict reading is
recorded here in case a human wants it the other way.

### 2. Produce carries `Irradiated` in `properties` but not in `effect`
Pg 83 prints "All produce has the Irradiated property." above the table, and the table's
Properties column never repeats it. `effect` is verbatim as printed (so it omits Irradiated);
`properties` — the machine-readable list — has `Irradiated` appended so automation and search
match the rule. Every produce `description` opens with a line saying exactly this. All 23 produce
rows are affected. **This is the one place where `effect` and `properties` deliberately differ.**

### 3. `duration` combines multiple timed properties
`duration` is one string but several properties each carry their own clock (Caffeinated 6 h,
Alcoholic/High-Proof 1d4 h, Fortifying 6 h, Energizing/Empowering 4 h, Spicy 6 h, Hearty 6 h,
Pungent 6 h, Putrid 4 h, Lucky 6 h, Charged 1 h). Convention used:

- exactly one timed property → the bare value, e.g. Coffee `"6 hours"`;
- more than one → labelled and semicolon-joined in property order, e.g. Baked Bloatfly
  `"Fortifying 6 hours; Putrid 4 hours"`, Nuka-Cola `"Caffeinated 6 hours; Lucky 6 hours"`;
- no timed property → `""`.

Properties with no stated duration (Addictive, Irradiated, Filling, Bland, Tasty, Flavorsome,
Delicacy, Regenerating, Refreshing, Snack, Hydrating, Cleansing, Strengthening) never contribute.

### 4. Stamina healing is NOT recorded in the heal fields
Bland / Tasty / Flavorsome / Delicacy heal **stamina points** (half / one / double / triple your
level), not hit points. The schema's `healsHealingRate` / `healRateMultiplier` / `healFormula`
are hit-point fields (the medicine/stimpak machinery), so those four properties leave them at
`false` / `0` / `""`. The stamina rule is spelled out in each item's `description`. **This affects
most of the pack and is worth a human's eye** — if the system ever gains a stamina-restore field,
those values can be recovered from the property list.

Only **Regenerating** heals hit points ("a number of hit points equal to your healing rate"), so
the 4 items with it get `healsHealingRate: true`, `healRateMultiplier: 1`:
Bloodleaf (produce), Bloodbug Steak, Deathclaw Egg Omelette, Wasteland omelet (cooked).
`healFormula` is `""` for every item in the pack — nothing in this section heals a flat amount
or dice.

### 5. `apCost` is 4 everywhere
The Food and Drinks section never states an AP cost to eat or drink. Pg 82 gives only timing
("you do not gain the benefits or the effects of any foods until after 1 minute … you gain the
benefits and effects of drinks immediately"), which is transcribed into every description. The
brief's default of 4 is used unchanged for all 82 items.

---

## Row-level oddities and ambiguous cells

- **Deathclaw Steak (pg 83→84)** — the single worst row. It straddles the pg 83 right-column /
  pg 84 left-column break: pg 83 prints `Deathclaw | 60c | Delicacy. Empowering | 8` and pg 84
  opens with `Steak | (blank) | Filling. | (blank)`. Reassembled as
  **Deathclaw Steak, 60c, "Delicacy. Empowering. Filling.", load 8**, `description` page tag
  `(pg 83-84)`. The missing period after "Empowering" was added, because leaving it would corrupt
  the property list; the split is documented in the item's own description.
- **Bear roast (pg 83)** — Properties cell printed with no final period
  ("Filling. Flavorsome. Strengthening"). Left verbatim in `effect`.
- **Wasteland Wine (pg 84)** — printed in the Name column as **"Wasteland Wine."** with a trailing
  period. The period is dropped from the item name (item names in Foundry should not end in a
  period); noted in the item's description. This is the only name normalised.
- **Absinthe (pg 84)** — Properties cell is "High-Proof. Addictive. Hallucinogenic. *(see Chems)*".
  **Hallucinogenic is not defined in the pg 82–83 food/drink glossary**; the book points at the
  Chems section (pg 89+, owned by the medicine/chems extraction). `properties` includes
  `Hallucinogenic`; its description line says the definition lives with the Chems. The
  "(see Chems)" pointer is kept in `effect` verbatim. **Cross-check this against the chems pack.**
- **Produce table ordering is not alphabetical at the column break.** The left column ends
  Agave Fruit, Apple, **Yucca Fruit**; the right column opens **Cactus Fruit**, then Blackberries,
  Bloodleaf, Brain fungus, Carrot … Both out-of-order rows were re-read at 300 dpi and the cells
  are exactly as transcribed — this is the book's own error, not a misalignment on my part. Both
  items carry a description line saying so.
- **Cooked Food ordering** likewise groups the donuts together (Donut, Fruit filled donut,
  Quantum crunch donut) before Fire ant fricassée. Transcribed in printed order.
- **Drinks ordering** is alphabetical through Whiskey, then appends Dead Man's Wine, Wasteland
  Wine, Wine. Transcribed in printed order.
- **Every Load cell in this section is a plain integer.** No `1 (10)` fractional forms and no
  conditional forms ("2, 4 when full") appear on pg 83–84, so no `load` value needed the 0.1
  treatment or a base-plus-note split. No blank or `-` Load cells either, except the split
  Deathclaw Steak row above, whose Load (8) is printed on pg 83.
- **Every drink is Load 2**, per the pg 84 rule "Every 8 oz of a drink is equal to 2 load."
- Names with non-ASCII characters kept as printed: **Jalapeño pepper**, **Fire ant fricassée**.
  Curly apostrophes from the PDF (Dead Man’s Wine) were converted to ASCII `'` to match the
  existing packs, which contain zero curly quotes.
- Spelling/capitalisation is verbatim: "Noodle cup", "Pork n' Beans", "Bloodbug Steak",
  "Wasteland omelet" (one t), "Radscorpion egg omelette" vs "Deathclaw Egg Omelette"
  (the book capitalises them inconsistently), "Silt bean", "Brain fungus", "Cave Fungus".

## Things the schema could not represent

- **Stamina healing** (see judgment call 4) — the largest gap.
- **Hunger / dehydration / irradiated levels.** Filling, Snack, Refreshing, Hydrating and
  Irradiated all move survival counters the aid schema does not model. All are in `description`.
- **Drink volume.** Pg 84: "Each drink listed in this table is a representation of 8 oz … if a
  character wanted to purchase a 36 oz bottle of Rum, it would cost them 125c and have five total
  drinks from it." `cost` and `load` are the 8 oz values; the bottle rule is in every drink's
  description. Note the book's own example does not divide evenly (36 oz ÷ 8 oz = 4.5, but it says
  five drinks at 125c against a 25c per-8-oz price); transcribed as printed, not corrected.
- **The Consumption rules and the drunk/buzzed/hammered/wasted ladder** (pg 82) are conditions,
  not item fields; they live in the Alcoholic / High-Proof glossary text inside each description.

## Not extracted (out of scope)

- Pg 85 — blank.
- Pg 86+ — Medicine, and pg 89+ Chems, owned by another extraction.
- The pg 82–83 glossary is not made into its own items; its text is inlined per item instead, the
  same convention `gear.json` used.

---

## Post-extraction changes (integration pass)

1. **`addictionDC` added to every entry.** The schema gained a per-item DC because
   alcohol (pg 82, DC 5) and chems (pg 89, DC 6) differ. Addictive drinks got 5;
   everything else keeps the 6 default, which is inert while `addictive` is false.
2. **The Alcoholic-only trigger was NOT enforced.** Pg 82 fires the Addictive check
   only for drinks that also have the **Alcoholic** property, which would exempt the
   8 High-Proof ones. Since those items carry the printed Addictive property and
   High-Proof is defined as *stronger* alcohol, this reads as an editing slip rather
   than intent, so the sheet rolls the check for all 12. Each of the 8 affected
   descriptions now ends with a note naming the strict reading and telling the GM to
   uncheck Addictive to follow it.
3. **Absinthe's `Hallucinogenic` property** is defined only in the chem glossary
   (pg 89: advantage on Luck checks, may flip your karma cap) — cross-checked against
   `aid-med.json` and left as-is.
