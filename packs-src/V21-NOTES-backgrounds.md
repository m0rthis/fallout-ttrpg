# v2.1 notes — Backgrounds, Unique Items, Explosives, Robot sub-types, Super Mutant

Source: `FALLOUT TTRPG 2.1.pdf` (136 pp.). **Printed page number == PDF page index** —
re-confirmed for this pass by rendering pp. 13-18 and reading the printed folio on each
(`pdftoppm -r 150 -f N -l N -png`), the same offset `BLUEPRINT-NOTES.md` establishes.

Method: `pdftotext -layout -f N -l N` for every page, **cross-read against a 150 dpi render of
that page**. Where the two disagree the image wins. Pages read as images for this pass:
**9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 78, 79, 91**. Pages 55, 56, 57, 60, 61, 80-87 and
92 were text-extracted for cross-checks only, and nothing in the output rests on them alone.

| Section | Pages | Delivered |
|---|---|---|
| A. Backgrounds | 13-18 | `packs-src/backgrounds.json`, `src/rules/backgrounds.ts`, `src/actions/backgrounds.ts`, the sheet panel |
| B. Unique Items | 91 | 8 rows into `packs-src/gear.json`, 1 into `packs-src/armor.json` |
| C. Explosives | 21, 78-79 | `src/rules/explosives.ts` |
| D. Robot sub-types | 9-11 | **extraction + change request only** — the fix needs `src/rules/targeted.ts` and `src/data/character.ts`, neither of which this pass owns |
| E. Super Mutant | 11-12 | **extraction + change request only** — same reason |

---

## A. Backgrounds (pg 13-18)

### A0. The brief says eighteen. There are twenty, plus Custom.

Counted off the printed pages: Cultist, Doctor, Drifter (pg 13); Entertainer, Farmer, Guard,
Hermit (pg 14); Journalist, Laborer, Mechanic (pg 15); Mercenary, Pastor, Pilgrim, Pit Fighter
(pg 16); Scientist, Scribe, Soldier, Trader (pg 17); Vault Dweller, Wastelander (pg 18). That is
**twenty named backgrounds**, preceded on pg 13 by **Custom Background**, which is a real row
with its own rules (three skills of your choice, no trait, and either another background's kit
or 850 caps of your own shopping).

The count is corroborated from inside the repo: `packs-src/traits.json` already ships **nineteen**
of the twenty background traits, extracted from the pg 27-29 Character Traits list. The twentieth
— **Adventurers Instinct**, the Wastelander's — is the one `V21-NOTES-perks.md:63` records as
*removed* from that list in v2.1 while noting it "still appears in v2.1 as a Background trait
(the Wastelander background, pg 18)". That prediction is now confirmed, and the consequence is
recorded as a gap in §A4.

**21 rows, 47 kits, 531 printed clauses.**

### A1. Data shape and where it lives

`packs-src/backgrounds.json` is the extraction of record. `src/rules/backgrounds.ts` carries a
byte-identical copy as a typed constant, and `scripts/build-packs.mjs` **throws** if the two
differ.

**Backgrounds are deliberately not a compendium pack.** A background is not any of the seven
Item types this system declares (`src/data/items.ts`), so a pack home for one needs a DataModel,
a `static/system.json` entry and a sheet before a single +2 can land — and it is read during a
*synchronous* sheet render, which an async pack read cannot serve. The rules-module-constant
route is the one `DISEASES` and `HAZARD_TYPES` already take. The JSON cannot simply be imported
because `tsconfig.json` sets `rootDir: "src"` and `packs-src/` is outside it. **No `packs` entry
in `static/system.json` is needed.**

**Regenerating the constant** after any edit to `packs-src/backgrounds.json` — the TS body is
literally `JSON.stringify(data, null, 2)`, which is why the build can parse it back out:

```sh
node -e 'const fs=require("fs");
const d=fs.readFileSync("packs-src/backgrounds.json","utf8");
const p="src/rules/backgrounds.ts", s=fs.readFileSync(p,"utf8");
const m="export const BACKGROUNDS: readonly Background[] = ", a=s.indexOf(m);
const b=s.indexOf("\n];\n", a)+4;
fs.writeFileSync(p, s.slice(0,a)+m+JSON.stringify(JSON.parse(d),null,2)+";\n"+s.slice(b));'
```

Each kit clause keeps the book's own words in `printed` and resolves to a shipped document name
in `name`, or to `null`. `null` is never "we failed to read it"; it is one of exactly three real
cases, all of which the panel and the chat card report rather than hide:

1. a choice the book hands the player — `x1 pip-boy (any)` (pg 18), whose four models are listed
   in `choices`;
2. an item the book's own tables never print — `x5 tomatoes` / `x2 tomatoes` (pg 14, Farmer);
3. the Custom Background, which has no kit at all.

Four clauses out of 531 are in that state. Every other clause resolves to a document that ships.

### A2. Applying a background: destructive, refusing, and reversible

Chosen model, and why the other two were rejected:

- **Refuses when one is already applied.** `applyBackground` writes a ledger flag
  (`flags["fallout-ttrpg"].background`) and will not run while it exists.
- **Not idempotent.** "Apply again" has no honest meaning: the skill half wants to be a no-op
  while the kit half wants to rebuild a kit the player has been eating, spending and breaking
  since character creation. A re-apply that silently restocked three crams would be worse than
  a refusal.
- **Reversible, but only over what it actually wrote.** `clearBackground` reads the *ledger*, not
  the current printing of the background, so a later data fix cannot make an old character's undo
  wrong. Skill points and caps come back exactly, floored at 0 (the sheet is editable and the
  player may have spent below the line; the schema's own minimum is 0 and a negative would fail
  validation rather than warn anyone). Documents come back **only if they are still there** —
  anything eaten, sold or deleted is counted and reported, because deleting "the three crams it
  granted" out of a stack the player has since added to is a guess, and this file does not guess
  with a player's inventory.

The ledger is a **flag, not schema**: `system.details.background` is a bare `StringField` in
`src/data/character.ts`, which this pass does not own. `details.background` is still written with
the background's name, so the sheet's existing text field stays truthful, and clearing empties it.

The three +2s are written to `system.skills.<key>.points`, not to `system.bonuses.skills.*`. pg 20
derives a skill bonus from points plus the governing ability modifier plus Luck; the sheet already
labels the six free creation points as background points
(`FALLOUT.Sheet.levelHelper`: *"+6 background"*), and six is exactly 3 × 2. Writing them into the
effect-bonus field instead would put them outside the number the book calls a skill bonus.

### A3. Contradictions and typos in the chapter, transcribed rather than fixed

Everything here is **printed as shown** and kept verbatim in each kit's `printed` and `label`.

1. **Guard's two race bullets are both labelled "Farmer"** (pg 14) — "• *Human, Ghoul or Super
   Mutant Farmer.*" and "• *Gen-2 Synth or Robot Farmer*", inside the Guard entry, immediately
   below the Farmer entry in the left column. Verified on the render. Kept as printed; the
   `races` arrays are read from the race words, not from the job word.
2. **Mechanic's second bullet is labelled "Laborer"** (pg 15). Same treatment.
3. **Pit Fighter's second bullet is labelled "Cultist"** (pg 16) — and spells the race group
   "Gen 2 Synth" without the hyphen every other row uses.
4. **Scribe's two bullets are labelled "Scientist"** (pg 17), and its two kits are *byte-identical*
   to Scientist's. Verified on the render: this is one copy-paste, not two coincidences. Both are
   transcribed, so Scribe genuinely grants Scientist's kit.
5. **Trader's two kits are byte-identical to Drifter's** (pg 13 vs pg 17), bullets correctly
   labelled. Also transcribed as printed.
6. **Mercenary's and Soldier's kits are identical** (pg 16 vs pg 17), bullets correct.
7. **The Guard kit has a cost worksheet left in the text** (pg 14): "x1 metal armor with one level
   of decay **225**, x1 police baton with two levels of decay **84**, x1 9mm pistol **200**, x20
   9mm ammo **40**, x10 9mm rubber ammo **10c**, …". The Journalist's human kit has one survivor
   of the same leak ("x1 energy cell **30**", pg 15), and the Guard's synth kit keeps only the
   "9mm pistol 200".
   These really are prices, and the arithmetic proves it: metal armor is 250c and this one has one
   level of decay, which pg 55's Decay Discount reduces by 10% → **225**; the police baton is 105c
   with two levels → **84**; 9mm is 2c × 20 → **40**; 9mm Rubber 1c × 10 → **10c**; binoculars 25c;
   purified water 20c × 3 → **60**; coffee 15c; donut 8c × 2 → **16**. The leak is preserved in
   `printedPrice` on each clause and stripped from the item name.
   **The worksheet also contains two errors of its own**: it prices the sleeping bag at 20 and the
   one-person tent at 25 (pg 81 prints 25c and 20c — swapped), and x2 pork n' beans at 10c
   (pg 84 prints 10c *each*).
8. **The Vault Dweller's human kit prints no caps.** Every other one of the 47 kits ends "and x50
   caps"; this one ends "x1 stimpak." Transcribed as printed — `caps: 0` — and asserted in the
   smoke suite so a later "fix" has to argue with a test.
9. **"Yum Yum Deviled Eggs" in that same kit has no `x1`** where every neighbouring clause does.
   Read as one, which is what the parser's default gives; flagged here because it is the only
   count in the chapter that is inferred rather than printed.
10. **Pit Fighter's human kit grants no armor at all** (pg 16) — it opens with the lead pipe. Its
    synth kit *does* grant metal armor. Transcribed as printed.
11. **Pit Fighter's skill line prints "Melee"** (pg 16) where the other five melee backgrounds and
    the pg 20 skill list print "Melee Weapons". Mapped to `meleeWeapons`; see rejection R2.
12. **Laborer splits Ghoul out of the first bullet** ("Human or Super Mutant" / "Ghoul" /
    "Gen-2 Synth or Robot", pg 15) where every other three-bullet background groups Human, Ghoul
    and Super Mutant together. Not a typo — the Ghoul kit really does swap purified water and
    healing powder for dirty water and a stimpak. Cultist is the only four-bullet background,
    splitting Gen-2 Synth from Robot over one RobCo Quick Fix-it.
13. **"RobCo Quick FIx-it 2.0"** with a capital I (pg 14, Entertainer). Case-insensitive
    resolution handles it; the typo is kept in `printed`.
14. **Farmer and Guard ask for an unversioned "RobCo Quick Fix-It"** (pg 14) where every other
    reference in the chapter names 1.0 or 2.0. See rejection R3.

Sanity checks that came back clean: every one of the twenty printed backgrounds raises exactly
three skills, no background raises the same skill twice, and every background covers all five
races exactly once across its kits. All three are asserted in the smoke fragment.

### A4. The Wastelander's trait does not exist as a document

**Adventurers Instinct** (pg 18) is named as the Wastelander's trait and appears nowhere else in
v2.1 — `V21-NOTES-perks.md` records it being deleted from the pg 27-29 Character Traits list, and
confirms the alphabetical run on pg 29 closes without it. **The book therefore names a trait it
never defines.** No text for it exists to extract.

Consequence, by design: applying Wastelander grants its three +2s and its kit, finds no
`Adventurers Instinct` in the perks compendium, and says so on the card
(`FALLOUT.Backgrounds.cardTraitMissing`) rather than failing or inventing one. **This is the one
background that cannot be fully applied, and it is the book's gap, not the code's.**

Restoring the v2.0 text would be re-adding a trait the author removed; that is a decision for a
human, and `packs-src/traits.json` is where it would go.

---

## B. Unique Items (pg 91)

Nine documents, all previously present only as blueprint rows and therefore visible in the
crafting bench as recipes for items nobody could own.

| Name | Cost | Load | Home |
|---|---|---|---|
| Vault Suit | 1300c | 5 | `armor.json` |
| Pip-Boy 2000 | 300c | 4 | `gear.json` |
| Pip-Boy 2000 Mark VI | 600c | 3 | `gear.json` |
| Pip-Boy 3000 | 550c | 4 | `gear.json` |
| Pip-Boy 3000 Mark IV | 850c | 3 | `gear.json` |
| Stealth Boy | 500c | 3 | `gear.json` |
| Two-way Radio | 120c | 2 | `gear.json` |
| Electronic Lockpick | 500c | 2 | `gear.json` |
| Electronic Lockpick Mk II | 750c | 3 | `gear.json` |

Costs and loads read off the pg 91 table as an image. Each description carries the item's own
paragraph verbatim plus the chapter's GM-discretion note.

**The Vault Suit is armor, and it is cloth.** pg 91: *"Any vault suit functions as cloth armor
with a rank 1 Lead Lined upgrade, rank 1 Reinforced upgrade, rank 1 Fitted upgrade, and rank 1
Sturdy upgrade."* Corroborated on pg 55, which says outright *"Most vault suits are considered
cloth armor."* So it takes cloth's pg 56 line — AC 10, DT 0, 8 slots, load 5, STR req 1 — and the
four rank-1 upgrades ride on top (pg 57):

- **Reinforced rank 1 is "+1 bonus to DT"** — a number the schema can hold, so the shipped `dt` is
  **1**. This is the one derived value on the row; see rejection R6.
- Lead Lined rank 1 ("Radiation DC decreases by 2"), Fitted rank 1 ("your DT is doubled" against
  area of effect) and Sturdy rank 1 ("ignore the negative effects of the first 2 levels of decay")
  have **no field to land in**, so they are text in `description` and named in `upgrades`.
- `slots` stays at cloth's **8**. pg 56 says ranks do not count against the slot total but is
  silent on whether a built-in upgrade consumes one; four of eight would be an inference, and the
  system does not track used slots anywhere to spend them against.

**Blueprint join.** pg 115 prints **one** Encyclopedia row headed `"Pip-Boy 2000, 2000 Mark VI,
3000, 3000 Mark IV."` against four pg 91 documents, so `BLUEPRINT_ALIASES` in
`scripts/build-packs.mjs` now accepts an **array** value and fans that row out to all four. The
row says *"Cannot be crafted. Try one of those vaults."* for all four, so fanning it out copies a
rule rather than inventing three. Result: blueprint orphans drop from **10 to 4**, and the four
left (Power Armor Chassis, Gunpowder, Yeast, Alcohol Yeast) are crafting intermediates that were
never equipment. Equipment pack: **465 → 474 documents**.

**Not automated, and why.** Every one of these items is an activated ability with a printed AP
cost and no numeric hook: the Stealth Boy's one-shot invisibility, the Two-way Radio's 100
activations, the Electronic Lockpicks' one and three uses, the Pip-Boy sensors' 60-foot cardinal
ping, and the Pip-Boy + Vault Suit healing rider (*"you heal an additional amount equal to your
level"*, which does have a home at the `src/actions/healing.ts` gate but needs to see both a worn
suit and a worn Pip-Boy, and no field marks either as worn — `equipped` exists on armor only).
They ship as described items, exactly like the 24 pg 80-82 gear rows already do.

---

## C. Explosives (pg 21, 78-79)

`src/rules/explosives.ts`: the arm/throw table, Throwback, Arm DC, Disarming, throw range, the
two-band area of effect, the twelve special properties, and all sixteen printed devices typed
against the gear documents they already ship as.

### C1. The book prints the throw table twice and they disagree

| | 1 | 2-3 | 4-14 | 15+ |
|---|---|---|---|---|
| **pg 78** (table) | in hand | half distance, start of next turn | start of next turn | end of your turn |
| **pg 21** (sentence) | "the total is a 1" | "a 2 or 3" | **"between 3 and 14"** | "a 15 or higher" |

pg 21 claims 3 in two bands and leaves 4 in none unless "between" is read exclusively — in which
case it leaves 4 *and* 14 out. **pg 78's table wins**: it is the chapter's own printing, it is a
table rather than a sentence, and it is the only one of the two that partitions the d20 without
an overlap. The two agree on every *outcome*; only the boundaries differ.

### C2. It is the total, and that is not a natural-1 rule

pg 21 is explicit — *"If the **total** is a 1"* — so the Explosives skill bonus is inside the
comparison and **a character with any positive Explosives bonus cannot detonate a grenade in
their own hand on the throw.** That reads like a bug and is not one: pg 128's natural-1 critical
failure is written for *attack rolls*, and pg 78 opens by saying an explosive makes no attack roll
at all (*"Instead of making an attack roll…"*). Transcribed as printed and asserted both ways in
the smoke fragment, because it is exactly the rule a future reader will "fix".

### C3. Both printings of Throwback skip 13

pg 21 and pg 78, identically: *"If the result is a 12 or below, the explosive detonates
immediately… If the result is above an 13, the explosive detonates at the end of your turn."* A
total of exactly 13 falls in neither clause. **Read as 13-or-higher succeeding**, the only reading
under which the two clauses cover the die; the strict reading would leave 13 a result with no
printed consequence. Exported as `THROWBACK_UNDEFINED_TOTAL` so the gap is named in code.

### C4. Throw range: the book gives two different Strength rules

- **pg 78 (Range):** *"a number of feet equal to your Strength ability **modifier** multiplied by
  the number listed in the range column."*
- **pg 61 (Thrown, the identical rule for melee weapons):** *"a number of feet equal to your
  Strength **score** multiplied by the numbers listed in the table."*

Ability scores run 1-10 and a modifier is `score − 5`, so pg 78 as printed gives **every character
with Strength 5 or less a throw range of zero feet or less** — half the table cannot throw a
grenade. `throwDistanceFeet()` uses the **score**, matching the melee rule this one is plainly
copied from; `printedThrowDistanceFeet()` keeps pg 78's arithmetic alive so a card can show the
table what the page asks for, the same shape `summaryStabilizeDC` takes in
`src/rules/first-aid.ts`. **This is our reading, not the book's.**

### C5. Disarming asks for a DC that does not exist

pg 78: *"succeed an explosives skill check equal to 10 + the **timed bonus** listed in the special
properties column."* **No explosive in either table prints a property called Timed, and the pg
78-79 glossary never defines one.** The closest printed thing is Long Fuse Dynamite's
`Slow: 3 rounds (18 seconds)`, which is a duration, not a bonus.

`disarmOutcome()` takes the **Arm DC** bonus instead — the only per-row bonus printed anywhere
near a placed explosive, and disarming is that column's rule run backwards. The parameter is named
`armBonus` rather than `timedBonus` so the substitution is visible at every call site. Flagged,
not presented as printed.

### C6. Smaller findings, all transcribed

- **Smoke is defined and never used.** The pg 79 glossary defines a Smoke property in full
  (spreads round corners, heavily obscured, blinded, 1 minute) and **no explosive in either table
  carries it.** The constant ships (`SMOKE_DURATION_MINUTES`) with no device attached.
- **Detonator names a range it never prints.** pg 78: *"so long as you are within the range noted
  next to the property's name."* The only Detonator explosive is C-4, whose cell reads plain
  `Detonator.` with no range. The property is typed with no range field, because there is nothing
  to put in one.
- **Both DC columns are bonuses, not DCs** — Arm DC `+1`…`+10`, the check is `10 +` that (pg 78).
  Same trap as the Encyclopedia's Repair and Craft columns (pg 92-93), same naming fix
  (`armBonus`).
- **Shattering beats the roll outright** — *"always detonates at the end of your turn regardless
  of your explosive roll"* (pg 79), read as beating the 1 as well, since the sentence admits no
  exception and its only carrier is the Molotov Cocktail, the one device that goes off on impact.
- **Flash Bang's damage is a flat `1`**, not dice (pg 79) — as `weapons.json` already records for
  five other entries.
- **Frag Mine's 2.5 ft radius** is the only fractional distance in either table.
- **Nuke Mine's damage cell carries a rider** — "12d10 explosive **and two levels of rads**" — kept
  in `rider` rather than in the dice.
- **Plasma Grenade's Special Properties cell is `-`** (none), not blank.
- **Electricity, not "electrical"**: Pulse Grenade / Pulse Mine map onto the system's
  `electricity` damage type; Cryogenic Grenade / Cryo Mine onto `cold`, as `weapons.json` already
  does for the Cryolator.

---

## D. Robot sub-types (pg 9-11) — extraction, and the change this needs

**Not implemented.** The single blocker is that `src/rules/targeted.ts` holds one fixed `LIMBS`
object and this pass does not own that file. Everything below is the extraction; the change
request is §D4.

### D1. The three sub-types (pg 9: *"There are three types of robot that you can choose from"*)

| | Handy (pg 9-10) | Protectron (pg 10) | Robobrain (pg 11) |
|---|---|---|---|
| Has | 3 arms, 3 eyes, up to 3 hands | 2 arms, 2 legs, 2 hands, 2 feet, head, torso | 2 arms, 2 hands, head, torso |
| **Cannot be targeted or severed** | head, groin, legs | eyes, groin | legs, feet, eyes, groin |
| Extra target | **jet engine** — "functions exactly the same as a targeted attack to the legs, except the attack costs 2 more AP"; severed → prone and cannot move until reattached | — | **all terrain rollers** — "function exactly the same as a targeted attack to the legs **except they cannot be severed**" |
| AP change | "targeted attacks to your eyes cost **2 less AP**" | — | — |
| Other | Jet Engine: hovers, ignores floor traps; falls if prone/stunned/unconscious. Fuel clock (§D2). Incredible Multi-Talented Appliance: three built-in tools | Reinforced Plating: **DT +1 even with no armor**. Slow: **max 6 AP on movement per turn**. Protect and Serve: one built-in tool | All Terrain Rollers: **no extra AP for difficult terrain**. NeuroTransmitters: **vulnerable to electricity**, and **two conditions instead of one** from a targeted attack to the head |

Against the pg 129 limb table (`eyes 5, head 3, arm 3, torso 2, groin 3, leg 2, object 4`) that
gives, before the melee reduction: Handy eyes **3**, Handy jet engine **4**; Robobrain rollers
**2**.

Shared robot rules already on pg 9 and not sub-type specific: severed limbs reattach with 3 steel
+ 1 circuitry in `10 − crafting skill bonus` minutes (6 AP if that reaches 0), robots do not go
into shock from a severed limb, and robots cannot use power armor.

### D2. Robot fuel (pg 9-10, Handy only)

*"Every week, 7 days, or 168 hours; you can spend **6 AP** to fill your tank with **a gallon of
fuel or six oil junk items** which are consumed upon use. If you fail to consume a gallon of fuel
after the week, you must succeed a **DC 12 Endurance check for each hour past 168. For each
successful check, the DC increases by 2.** On a fail, you become unconscious until another
creature fills your tank with fuel. Alternatively, you can load a **fusion core** into your
chassis. If you do, you can operate for **30 days** without requiring fuel."*

This is the **same escalating-DC shape as the radiation check** already implemented in
`src/actions/radiation.ts` (`system.radiation.dcBonus`), so it wants the same treatment: a stored
`dcBonus` that resets when the tank is filled. Note the rule is printed under **Handy** only, in
the Handy section, after the Handy quote — Protectron and Robobrain print no fuel requirement at
all. Whether that is deliberate or a layout slip the book does not say; transcribed as printed.

The book's "gallon of fuel" maps to the `Fuel` heavy-ammunition document; "oil junk items" have no
document, like every other junk item in this system.

### D3. Sub-type built-in weapons — nine statblocks the packs do not ship

Handy tools (pg 10, choose one per arm, three arms): **Buzz Saw** (melee, 5 AP, 1d8 slashing,
crit 20 ×2 + bleeding, Cleave/Durable), **Clippers** (melee, 3 AP, 1d4 piercing, crit "19, 20.
1d4 piercing", Dismember/Durable), **Drill** (melee, 6 AP, 1d8 slashing, crit 20 2d8 slashing,
Durable/Mangle), **Gripper** (not a weapon — a hand; fewer than two Grippers means you effectively
have one hand), **Torch** (ranged, 10 ft line, 5 AP, 1d10 fire, fuel 5 rounds, Area of
Effect/Durable/Incendiary).

Protectron tools (pg 10, choose one): **Taser** (melee, 4 AP, 2d8 electricity, crit 20 ×2 +
dazed, Durable), **Laser** (ranged x10/x20, 4 AP, 1d8 laser, crit 20 ×2 + burning, Fusion cell 30
rounds, Durable/Semi-Automatic), **Defibrillator** (unarmed, 6 AP, 2d8 electricity, crit 20 1d8,
Durable/**Revitalizing**), **Cryo Spray** (ranged 20 ft cone, 5 AP, 2d4 cold, Cryo cell 3 rounds,
Area of Effect/Durable/Freezing/Slow), **Nail Gun** (ranged x3/x10, 6 AP, 1 piercing per attack,
crit 20 10 piercing, Nails 90 rounds, Automatic: 2 / Durable).

Two problems if these are ever shipped as weapon documents, both in the book:
- **The Protectron Laser's ammo is "Fusion cell"**, which is not a type the ammunition tables
  print — pg 102's energy ammunition has `Energy Cell`, `Microfusion Cell` and `Fusion Core`.
- **"Revitalizing" is not defined anywhere.** The Defibrillator cites pg 47 for its properties;
  the melee glossary has Durable and no Revitalizing.

They were not added to `weapons.json` because this pass does not own that file.

### D4. Exact change requested in `src/rules/targeted.ts` (not owned)

1. **Two rows in `LIMBS`:**
   ```ts
   jetEngine: { apCost: 4 },  // pg 9: legs (2) + "costs 2 more AP"
   rollers:   { apCost: 2 },  // pg 11: "exactly the same as … the legs"
   ```
2. **A profile table**, so the picker and the AP cost stop being one fixed object:
   ```ts
   export const LIMB_PROFILES = {
     default:    { available: LIMB_KEYS.filter(k => k !== "jetEngine" && k !== "rollers") },
     handy:      { available: ["eyes","arm","torso","object","jetEngine"], apDelta: { eyes: -2 } },
     protectron: { available: ["head","arm","torso","leg","object"] },
     robobrain:  { available: ["head","arm","torso","object","rollers"], unseverable: ["rollers"] },
   } as const;
   ```
   (Handy also loses head/groin/leg; Protectron loses eyes/groin; Robobrain loses leg/groin/eyes.
   `fusionCore` stays out of every profile except where a robot wears power armor, which pg 9
   forbids outright.)
3. **A fourth parameter on `targetedApCost(limb, isMelee, dismember = false, profile = "default")`**,
   applying `apDelta` **before** the melee reduction — Handy eyes 5 → 3 → melee `max(1, 1)` = 1;
   jet engine 4 → melee 2.
4. `LIMB_KEYS` is consumed by the limb-picker dialog in `src/dice/rolls.ts` and by
   `src/combat/*`; those call sites need the profile's `available` list rather than `LIMB_KEYS`.

**Also needed, outside `targeted.ts`:**
- `src/data/character.ts` — a `details.robotType` field (`"" | "handy" | "protectron" | "robobrain"`),
  since nothing today records which robot a Robot is. Purely additive; DataModel fills the default.
- `static/lang/en.json` — `FALLOUT.Targeted.limbs.jetEngine` and `.rollers`, plus labels for the
  three sub-types.
- Protectron's `Reinforced Plating` (+1 DT with no armor) belongs in the derived DT in
  `src/data/character.ts`; its `Slow` (6 AP movement cap) belongs with whoever owns movement;
  Robobrain's `All Terrain Rollers` (no difficult-terrain surcharge) belongs with difficult
  terrain, which ROADMAP A1 already parks as a Foundry-integration job.
- Robobrain's `NeuroTransmitters` doubles head-shot conditions, which is the same hook the Gen-2
  Synth `Brittle Body` variant needs (pg 9, "two limb conditions instead of one") — worth one
  shared rule rather than two.

---

## E. Super Mutant Superior Strength and Bulky (pg 11-12) — extraction, and the change

**Not implemented.** Both live in `src/data/character.ts` and `src/rules/constants.ts`, neither of
which this pass owns. Verified absent: nothing in `src/` mentions `superMutant` outside
`RACES` and `IRRADIATION_IMMUNE_RACES`.

**Superior Strength** (pg 11, verbatim): *"Due to your increased mass in muscle, your Strength
score increases by 1 and cannot be lower than 6. Additionally your Carry Load is increased by 40."*

Three separate effects, and the order matters: `+1` to the score, then a **floor of 6** on the
result, and `+40` carry load. A Super Mutant who rolls Strength 3 ends at 6, not 4. The floor is
on the *score*, so it feeds the modifier, `maxCarryLoad()`, the melee/unarmed/intimidation skill
bonuses and every Strength-requirement check.

**Bulky** (pg 12, verbatim): *"Super mutants have many advantages but precision does not come
easy, whenever your weapons or armor would gain a level of decay, they gain an additional one."*

**Mass Exertion** (pg 12) is already done.

**The two variants** that *replace* Superior Strength (pg 12, "If your GM allows it… one of these
variant abilities which replaces the Superior Strength trait"):
- **Defective Strain** — Strength **and** Endurance +2, Carry Load +40, Intelligence −2 **and
  cannot be raised higher than a 3**. Note this one has **no Strength floor** and an Intelligence
  *ceiling*, which is a shape no other rule in the book uses.
- **Nightkin** — Superior Strength unchanged, plus a **Stealth field**: 3 AP to turn invisible for
  1 minute; every use after the first each day drops Perception by 1 for 24 hours (minimum 1), and
  *"your Perception ability score being decreased in this way does not limit you in using or
  choosing perks that have a Perception ability score requirement"* — a per-use, per-day,
  24-hour-decaying penalty with a perk-prerequisite exemption.

### Exact change requested

1. `src/rules/constants.ts` — three constants beside the existing race lists:
   ```ts
   export const SUPER_MUTANT_STRENGTH_BONUS = 1;
   export const SUPER_MUTANT_STRENGTH_FLOOR = 6;
   export const SUPER_MUTANT_CARRY_LOAD_BONUS = 40;
   ```
2. `src/data/character.ts`, in the derived pass — for `details.race === "superMutant"`, apply
   `max(FLOOR, strength + BONUS)` **before** the modifier is taken, and add the carry-load bonus
   into `carryLoadMaxBase` alongside `b.carryLoad`. It cannot ride an Active Effect: nothing
   creates a per-race effect, and `system.bonuses` sums every source with no per-source record
   (the `foundry-v14-notes.md` constraint), so the floor could not be expressed there anyway.
3. **Bulky needs one gate, because decay is written from four places today**:
   `src/dice/rolls.ts:521` (weapon, natural 1), `src/sheets/character-sheet.ts:802` (the sheet's
   own control), `src/combat/damage.ts:229` (worn armor on a critical hit or a fall to 0 hp) and
   the Corrosive path in the same file. A shared `decayItem(actor, item, levels)` — the same shape
   `src/actions/healing.ts` became for stamina — is the right fix, and Bulky is the rule that
   forces it. Applying Bulky at only some of the four would be worse than not applying it.
4. The two variants are GM-optional and character-creation-time; they want a
   `details.superMutantVariant` field on the same additive footing as `details.robotType`. Nightkin's
   Stealth field is a per-day counter with a 24-hour clock, i.e. the same machinery as
   `survival.drinkHours` — a bigger job than the other three combined, and worth deferring.

---

## Rejection list — considered and discarded

**R1. Rejected: compiling backgrounds into a compendium pack.** It would need a new Item type
(`src/data/items.ts`), a `packs` entry in `static/system.json`, a DataModel and a sheet — four
files this pass does not own — and it cannot serve a synchronous sheet render anyway. The
rules-module-constant route is what `DISEASES` already uses. **No `static/system.json` change is
required by this pass.**

**R2. Rejected: keeping Pit Fighter's skill as a distinct "Melee".** pg 16 prints "+2 to Barter,
Melee, and Unarmed" where Cultist, Guard, Laborer and Mercenary all print "Melee Weapons" and the
pg 20 skill list has fourteen skills including Melee Weapons and no Melee. Mapped to
`meleeWeapons`. Inventing a fifteenth skill for one background would be inventing a skill.

**R3. Rejected: leaving the Farmer's and Guard's unversioned "RobCo Quick Fix-It" unresolved.**
The packs ship 1.0, 2.0 and "Extreme Damages 2.0"; every other reference in the chapter names a
version. Resolved to **1.0**, the base model, and each of the two clauses carries
`"inferred": "unversioned"` so the guess is visible in the data and on the panel. Considered and
rejected: 2.0 (the more expensive model, no reason to assume generosity) and leaving it null
(which would silently drop an item from two kits).

**R4. Rejected: resolving "tomatoes" to "Tato".** The Farmer kit (pg 14) asks for x5 and x2
tomatoes; the pg 84-87 food tables contain **Potato, Potato Crisps and Tato** and no Tomato. Tato
is the Fallout tomato-potato hybrid and is very likely what was meant. **Left `null` and reported
on the card and in the panel**, because "very likely what was meant" is exactly the inference the
house style forbids presenting as printed, and a GM adding a Tato by hand costs one drag. This is
the only genuinely unresolvable clause in all 531; it is flagged in two places rather than fixed
in one.

**R5. Rejected: granting the Vault Dweller a Pip-Boy.** pg 18 says "x1 pip-boy (any)" and pg 91
prints four models with different costs and different abilities. Picking one for the player would
be making their choice; picking the cheapest would be making it badly. Reported with all four
models listed, and the smoke suite asserts that none of them lands.

**R6. Rejected: leaving the Vault Suit at DT 0.** Its printed rank 1 Reinforced upgrade is
"+1 bonus to DT" (pg 57) and nothing in this system parses the free-text `upgrades` field, so a DT
of 0 would mean the suit's one numeric upgrade did nothing at all. Shipped at **DT 1**, with the
derivation spelled out in the description and in `upgrades`. Considered and rejected: also folding
in Fitted's "DT is doubled" against area of effect (conditional, and no field holds a conditional
DT) and Lead Lined's "Radiation DC decreases by 2" (no armor field holds it; the radiation DC is
derived on the character).

**R7. Rejected: consuming four of the Vault Suit's eight upgrade slots.** pg 56 says ranks do not
count against the slot total and is silent on built-in upgrades, and nothing in this system tracks
*used* slots, so a printed 8 reduced to 4 would be an inference dressed as a table value.

**R8. Rejected: "fixing" the Guard, Mechanic, Pit Fighter and Scribe bullet labels.** All four are
verified on the render as printed. The `races` arrays are read from the race words, which are
correct in every case; the job word is left wrong so a reader can see what the book did.

**R9. Rejected: giving the Vault Dweller 50 caps.** Every other kit in the chapter prints "and x50
caps" and this one does not. Transcribed as printed and asserted in the smoke suite, so a future
"consistency fix" has to argue with a test rather than slip through.

**R10. Rejected: pg 21's throw bands.** See §C1 — pg 21 overlaps at 3 and drops 4. pg 78's table
is the printing that partitions the die.

**R11. Rejected: reading "detonates on a 1" as a natural 1.** pg 21 says "total", and pg 78 says
an explosive makes no attack roll, so pg 128's natural-1 rule has nothing to attach to. The
consequence — a skilled thrower cannot fumble one into their own hand — is the printed rule.

**R12. Rejected: "above an 13" meaning 14+.** That leaves a total of 13 with no printed outcome at
all. Read as 13 or higher; named in code as `THROWBACK_UNDEFINED_TOTAL`.

**R13. Rejected: pg 78's Strength *modifier* for throw range.** It gives zero feet at Strength 5.
The score is used, matching pg 61's identical melee rule, and the printed arithmetic is exported
beside it as `printedThrowDistanceFeet` rather than deleted.

**R14. Rejected: inventing a "Timed" bonus for Disarming.** pg 78 asks for one and no explosive
prints one. The Arm DC bonus is substituted, under a parameter named `armBonus` so the
substitution is legible at the call site.

**R15. Rejected: re-adding the Adventurers Instinct trait from v2.0.** v2.1 deleted it from the
Character Traits list (confirmed on pg 29 by the earlier perks pass and re-confirmed here) while
still naming it as the Wastelander's background trait. Restoring text the author removed is a
human's call. Applying Wastelander says on the card that the trait was not found.

**R16. Rejected: implementing robot sub-types by copying `LIMBS` into a second table.** Three
sub-types × a fixed limb object is four objects that must agree, and the reason this has never
worked is that there is one. The change request in §D4 asks for a profile parameter instead.

**R17. Rejected: shipping the nine Handy/Protectron built-in weapons into `weapons.json`.** Two of
them cite an ammunition type and a weapon property the book never defines (`Fusion cell`,
`Revitalizing`), and `weapons.json` is not owned by this pass. Fully transcribed in §D3 instead.

**R18. Rejected: making `applyBackground` idempotent.** See §A2. There is no honest second
application: the skills would want a no-op and the kit would want a rebuild, and a rebuild
restocks equipment the player has been spending.

**R19. Rejected: `clearBackground` deleting by item *name*.** It deletes by the ids it recorded, so
a player who bought a second backpack keeps it and a player who ate a cram is told the cram is
gone. Name-matching would have taken the wrong document about half the time.

**R20. Could not verify — nothing.** Every value in `backgrounds.json`, in the pg 91 table and in
the pg 79 explosive tables was read off a 150 dpi render of the page. `pdftotext -layout` agreed
with the image on all fourteen pages read this pass, including pg 14's price leak and pg 79's
two tables, which is unusual for this book and is recorded here so the next pass knows these
particular pages are clean.
