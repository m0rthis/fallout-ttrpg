# V2.1 Rules Extraction — Movement, Falling, Suffocating, Travel Pace

Source of truth: `FALLOUT TTRPG 2.1.pdf` (136 pp). PDF page N == printed page N (verified 1:1).
Pages read: **116, 117, 118** (the chapter), **126, 127** (the Actions in Combat table and
Sprint's second printing), **122** (Dust Storm), **124** (round length), **129** (limb
conditions), **135** (Prone).

**Pages 116, 117, 118 and 126 were read as rendered page images at 150 dpi**, not only through
`pdftotext -layout` — the Travel Pace table and the AP cost table both misalign under layout
extraction. Prose was cross-read both ways.

The printed book governs. Where the book is silent or contradicts itself, the ruling is named
as a ruling and the losing reading is written down.

Implemented at `src/rules/movement.ts` (pure), `src/actions/movement.ts` (writes),
`src/sheets/panels/movement.ts` + `static/templates/actor/parts/movement.hbs`.

---

## 0. The standing constraint: there is no movement budget

Nothing in this system tracks feet moved. There is no speed field, no per-turn distance
counter, no hook on token movement, and `derived.moveCapFeet` — the distance cap the leg limb
conditions (pg 129) already impose — is computed and consulted by nothing.

So **every distance in this chapter is reported, and none is spent from anything.** A character
who sprints 50 feet and then walks another 40 is told the price of both and stopped by neither.
That is the same standing AP itself has (ROADMAP item 14) and the same standing difficult
terrain has (ROADMAP section A item 1, already reclassified as a Foundry-integration job).

This is stated on the panel's own face rather than left to be discovered. It is also why
several of the rules below are honest reports rather than enforcement:

| Rule | Printed | What this system does |
|---|---|---|
| Climb / swim per-5-ft AP | pg 116-117 | reports the rate and the total |
| Climb round limit → you fall | pg 116 | reports the limit; the GM presses Fall |
| Swim round limit → you drown | pg 117 | reports the limit; the GM starts the breath clock |
| Jump AP, and "you cannot jump without enough AP" | pg 117 | reports; nothing refuses |
| Sprint's 50 ft and its termination | pg 117, 127 | reports |
| Suffocating's "can't regain hit points or be stabilized" | pg 118 | **reports — see §3.2** |
| Travel fatigue | pg 116 | **writes** |
| Falling damage, prone, limb conditions | pg 117-118 | **writes** |
| Overreaching jump's Strength check | pg 117 | **rolls** |

---

# SECTION 1 — Special Types of Movement (pg 116-117)

## 1.1 Climbing (pg 116-117), verbatim

> You can spend AP on your turn to climb vertical surfaces. While you are climbing, you are
> considered *off-balance* (see pg #).
> While in combat sequence, you have a limit to how many rounds you can continue to climb. You
> can continue climbing on each of your turns for a number of rounds equal to your Endurance
> ability score (to a minimum of one round). At the start of your next turn after climbing past
> your limit, you fall.
> Before you climb, the GM ranks the vertical surface between Scalable, Sheer, or Treacherous.
> […] If you have climbing gear such as ropes or stakes; you use 1 less AP to climb 5 feet
> (except for treacherous surfaces where climbing equipment is required).

| Surface | Bare | With gear | Note |
|---|---|---|---|
| Scalable | **3 AP** / 5 ft | 2 AP | rocky cliffs, brick walls, a large tree |
| Sheer | **4 AP** / 5 ft | 3 AP | intact building, smooth cliff, rain on a scalable wall |
| Treacherous | **impossible** | **4 AP** / 5 ft | vault interior wall, outward-slanting cliff; gear required and gives no discount |

Sheer and Treacherous are both 4 AP bare. That is what is printed on the rendered page — gear
is the only thing separating the two ranks, and it separates them completely (sheer drops to 3,
treacherous stays at 4 and is otherwise forbidden).

**Round limit is an Endurance *score*, minimum one round.** The same shape frigid water uses
(pg 123). Compare the suffocation clock, which is the *modifier* — the book switches deliberately
and both are implemented as printed.

## 1.2 Swimming and Diving (pg 117), verbatim

> You can spend AP on your turn to swim. While you are swimming, you are considered
> *off-balance* (see pg #). Before you swim, the GM ranks how hazardous the body water is
> between Still, Rushing, or Hazardous.
>
> **Diving.** […] Swimming while underwater requires 1 more AP to move 5 feet. You can hold your
> breath for a number of minutes equal to 1 + your Endurance ability modifier (minimum of 30
> seconds). The amount of time you can hold your breath reduces by 30 seconds (6 rounds) each
> time you take damage or use more than half your AP on your turn.

| Water | AP / 5 ft | Underwater | Current at start of turn | Round limit |
|---|---|---|---|---|
| Still | **2** | 3 | — | none printed |
| Rushing | **2** | 3 | **10 ft**, GM's direction | none printed |
| Treacherous | **3** | 4 | **20 ft**, GM's direction | Endurance score, then drowning |

### Two printing errors in this section (findings, not transcription slips)

1. **"Still, Rushing, or Hazardous" vs the three defined ranks.** The lead-in names *Hazardous*;
   the subsections define Still, Rushing and **Treacherous**. No "Hazardous Waters" entry exists
   anywhere in the book. Read as one rank under two names; **Treacherous** is used, because it
   is the one with a definition and it matches the climbing section's own third rank one page
   earlier.
2. **The Treacherous Waters paragraph says "rushing" twice.** "…at the start of your turn while
   you swim in **rushing** waters, you move 20 feet…" and "…you can spend 3 AP to swim 5 feet
   across **rushing** waters." Copied from the Rushing paragraph above it and not re-edited —
   note the *numbers* differ (20 ft not 10, 3 AP not 2), which is how you can tell. Read as
   Treacherous throughout, since otherwise the paragraph contradicts the one above it while
   defining nothing of its own.

### The round limit is printed for treacherous water only

"You have a limit to how many rounds you can continue to swim **in treacherous waters**." Still
and Rushing have none. Left where it is printed — extending it to all water would make swimming
across a pool impossible, which no sentence in the book asks for.

## 1.3 Jumping (pg 117)

| | Distance | AP | Overreach DC |
|---|---|---|---|
| **Long jump** | `5 × STR mod`, min 5 ft | **1 AP per 5 feet** cleared | `10 + extra feet` |
| **High jump** | `3 + STR mod`, min 1 ft | **1 AP per foot** cleared | `18 + extra feet` |

Both: *"so long as the last two action points you used were to move (note: You could have used
these two action points on your last turn, with a readied action, or with the commander perk).
If you don't move, you can leap only half that distance."*

Overreaching: *"You must first spend the amount of AP it would take to clear the jump. Then you
must succeed a Strength ability check […] On a failure, you do not clear the distance and you
still use the AP it would have taken to clear the distance."*

**Rulings.**

- **The two-AP movement precondition is an input, not a check.** Nothing in this system records
  what AP was spent on — AP is not spent through this system at all — and the book itself allows
  those two points to have come from a previous turn, a readied action, or the Commander perk.
  The panel asks; the card prints which way it was answered.
- **The halved distance floors.** The book prints no rounding for "half that distance". Floored,
  which is the convention it states everywhere it states one.
- **The printed minimum does not survive the halving.** The minimum is attached to the formula
  ("a number of feet equal to 5 × your Strength modifier (minimum of 5 feet)"); the halving is a
  separate sentence applied to "that distance". So a standing long jump bottoms out at 2 ft and
  a standing high jump at 0. Reporting a 0-foot standing high jump is more honest than granting
  a floor the book does not print.
- **A partial five feet costs a whole AP on a long jump.** The book prices "every 5 feet"; the
  alternative lets an 11-foot jump cost 2 AP.

## 1.4 Sprinting — the two printings, reconciled

**pg 117**, Special Types of Movement:

> You can spend 5 AP to immediately move 50 feet in a straight line. If you stop or are
> **obstructed by difficult terrain** before you finish this movement, your movement ends.

**pg 127**, Actions in Combat (priced at 5 AP in the pg 126 table):

> You can spend 5 action points on your turn to sprint. When you sprint, you move 50 feet in a
> line. If you stop or are **obstructed** before you move 50 feet, your movement ends **and you
> do not regain any action points**.

### Which governs

**pg 127 governs the action; pg 117 governs its collision with terrain.** They agree on both
numbers — 5 AP, 50 feet — so nothing is at stake there. Where they differ, each printing says
something the other does not, and neither contradicts the other:

- **pg 127 is the action's definition.** It is the Actions in Combat entry, it is what the pg 126
  cost table points at, and it is the only printing that states the **no refund**.
- **pg 117 supplies the terrain clause.** It is the only printing that names difficult terrain,
  and naming it is the whole point: everywhere else in the book difficult terrain adds AP per
  five feet (pg 116), and this is the one place it does something else — it **terminates** the
  sprint instead of taxing it. Dropping that sentence in favour of pg 127's broader "obstructed"
  would delete a printed rule; keeping it as an instance of "obstructed" loses nothing.

**Merged rule as implemented:** any obstruction ends the sprint, difficult terrain counts as one,
and no AP comes back. This is what `SPRINT_AP_COST` now means; it was declared in
`src/rules/constants.ts` and imported by nothing until this work.

### What neither printing says

- **Whether you finish the five feet you were entering** when the obstruction stops you.
- **How the Dust Storm interacts.** pg 122 halves a sprint ("when you sprint you move half as
  much"); pg 117 ends one in difficult terrain. Sprinting through difficult terrain during a dust
  storm triggers both and the book resolves neither. **Ruled orthogonal** — the storm sets the
  distance the sprint *would* cover, the terrain cuts it short — since they act on different
  quantities and both can apply without either being overruled. The halving is read off the
  scene's weather state, which `src/rules/weather.ts` already records as `sprintHalved`.
- **A Robobrain (pg 11)**, whose All Terrain Rollers removes "extra AP to move through difficult
  terrain", still has its sprint terminated: the ability removes a *cost*, and Sprint's clause is
  not a cost. Already noted in `V21-NOTES-stamina-terrain.md` §2.6.

---

# SECTION 2 — Falling (pg 117-118)

> A creature's falling speed and damage it takes at the end of a fall depends on its size.

| Size | Turn 1 | Each turn after | Damage | Per | Cap | Prone | Limb condition |
|---|---|---|---|---|---|---|---|
| Tiny | 25 ft | 50 ft | **none** | — | — | no | one **arm or leg**, past 50 ft fallen |
| Small | 400 ft | 800 ft | 1d4 | 10 ft | 120d4 | yes | arm **and** leg, if damage reaches HP |
| Medium | 500 ft | 1000 ft | 1d6 | 10 ft | 150d6 | yes | arm **and** leg, if damage reaches HP |
| Large | 800 ft | 1600 ft | 2d6 | 10 ft | 240d6 | yes | arm **and** leg, if damage reaches HP |
| Huge | 1100 ft | 2200 ft | 2d10 | **20 ft** | 330d10 | yes | arm **and** leg, if damage reaches HP |
| Gargantuan | 2000 ft | 4000 ft | 4d10 | **20 ft** | 800d10 | yes | arm **and** leg, if damage reaches HP |

Damage type: **impact** (already a shipped damage type).

## 2.1 Findings in the printing

1. **The Huge entry says "a large creature lands prone."** It sits under the Huge heading with
   Huge's own numbers on either side of the phrase — a copy-paste from the Large paragraph. Read
   as Huge.
2. **Tiny is worded differently on purpose.** Every other row says the creature gains "a random
   arm **and** leg condition" *if the damage reaches hit points*; Tiny takes no damage at all and
   gains "one random arm **or** leg limb condition" *if it falls more than 50 feet*. Two
   different triggers and two different outcomes. That and/or contrast in adjacent paragraphs is
   what settles the ambiguity for the other five rows — see §2.2.
3. **Huge and Gargantuan count per 20 feet**, not per 10. Not a slip; their dice are bigger too.
4. **The caps imply maximum meaningful fall distances** that are printed nowhere: 1,200 ft
   (Small), 1,500 (Medium), 1,200 (Large), 3,300 (Huge), 4,000 (Gargantuan). **Large caps at a
   shorter fall than Medium does.** As printed.

## 2.2 Rulings

- **"a random arm and leg condition" is two conditions, one per limb.** Settled by the Tiny
  contrast above. Two `1d4` rolls on the pg 129 tables, one on the arm row and one on the leg row.
- **The trigger is damage that reaches hit points.** "If this damage is dealt to the creature's
  hit points" — so stamina absorbing the whole fall means no conditions. Same trigger the
  Corrosive property already reads in `applyDamage`.
- **The damage goes through the ordinary pipeline.** Power Armor Defense Points, temporary hit
  points, Stamina Points, damage threshold, the dying transition and the death-save-on-damage
  rule all apply, because nothing in pg 118 exempts a fall from any of them. Contrast the pg 121
  lightning strike, which the book explicitly sends "to your hit points" and which therefore
  bypasses the pipeline in `rollLightningStrike`.
- **The conditions reuse the pg 129 tables and their existing localization keys.** A fall
  inflicts the printed limb conditions, not a private copy of them.
- **Tiny's "arm or leg" is a coin flip.** The book names no weighting.

## 2.3 What the book does not print about falling

- **Nothing causes or stops a fall.** No check to catch yourself, no reduction for what you land
  on or for landing in water, no rule for falling onto another creature, no rule for a voluntary
  drop. The distance is declared by whoever presses the button.
- **"unless they land on something hazardous"** (Tiny) is the GM's, and is printed on the card
  rather than rolled.
- **No interaction with the leg limb-condition distance caps** (pg 129) or with `moveCapFeet`.
- **Falling is never connected to the climbing round limit's "you fall"** beyond the word. The
  climb rule does not say how far.

---

# SECTION 3 — Suffocating (pg 118)

> A creature can hold its breath for a number of minutes equal to 1 + its Endurance modifier
> (minimum of 30 seconds). When a creature runs out of breath or is choking, it can survive for a
> number of rounds equal to its Endurance modifier (minimum of 1 round). At the start of its next
> turn, it drops to 0 hit points and is dying, and it can't regain hit points or be stabilized
> until it can breathe again. *For example, a creature with an Endurance of 7 can hold its breath
> for 3 minutes. If it starts suffocating, it has 2 rounds to reach air before it drops to 0 hit
> points.*

The breath sentence is printed **twice, identically** — pg 117 under Diving and pg 118 under
Suffocating. No contradiction between them.

**The worked example confirms this system's ability-modifier formula.** Endurance 7 is a +2
modifier (`score − 5`), and 1 + 2 = 3 minutes, 2 rounds. Asserted as a smoke step for that
reason as much as this one.

Note the switch: **breath and suffocating use the Endurance *modifier*; the climb and swim round
limits use the *score*.** Both are implemented as printed.

## 3.1 The diving penalty

> The amount of time you can hold your breath reduces by 30 seconds (6 rounds) each time you take
> damage or use more than half your AP on your turn.

- **Neither trigger is detected.** Taking damage is a hook this system does not write, and "more
  than half your AP on your turn" cannot be seen at all while AP is spent by hand (ROADMAP item
  14). So it is a button, and the panel says which two things it is for.
- **It reduces the maximum, not the remainder.** "The amount of time you can hold your breath" is
  the maximum. Implemented as a recomputed ceiling that the remaining time is clamped to, which
  only differs from a plain subtraction once some breath has already been spent.
- **The book does not say what happens when the penalties exceed the total.** Floored at zero,
  and zero is treated as out of breath, which is the only reading that terminates.
- **A round is 5 seconds here and 6 seconds on pg 124.** "30 seconds (6 rounds)" makes it 5; the
  radiation zone severity 7 cadence ("a check every six seconds") makes it 6, and
  `src/rules/hazards.ts` already encodes 6. Both stand as printed in their own chapters; nothing
  needs both at once.

## 3.2 The healing lock is reported, not enforced

*"…it can't regain hit points or be stabilized until it can breathe again."*

Enforcing it needs a derived healing gate keyed to suffocation. The only such gate that exists is
`derived.hpHealableMax`, which belongs to the radiation lock (pg 124) and is computed in
`src/data/character.ts` — not a file this chapter owns. So:

- The clause is printed on the chat card and on the panel while the clock is running.
- `stabilizeCreature` (pg 131) will still return a drowning creature to 1 hit point if somebody
  presses it.

**This is the one integration this chapter wants** — see §6.

## 3.3 What the book does not print about suffocating

- **Nothing says how a creature *stops* suffocating** beyond "until it can breathe again". No
  recovery, no partial breath, no rule for surfacing mid-clock. `reachAir` stops the clock and
  restores nothing, because restoring anything would be inventing a rule.
- **"or is choking"** is the only other named cause and is defined nowhere.
- **Whether a fresh breath resets the maximum or only the remainder.** Reset to full, since the
  penalties are described as reducing "the amount of time you can hold your breath" for a
  particular held breath, and a new one is a new breath.
- **Nothing says a Gen-2 Synth or Robot breathes.** They are exempt from hunger, dehydration and
  sleep (pg 8-9, 119) and the book never mentions air. Not exempted here; not automated either —
  the control is pressed by a person.

---

# SECTION 4 — Travel Pace (pg 116)

## 4.1 The table (read as a rendered page image)

| Speed | Distance | Passive Sneak | Effect |
|---|---|---|---|
| Slow | **18 miles** (2.25 mph) | 15 + Average Group Sneak Bonus | Advantage on Combat Sequence rolls |
| Normal | **24 miles** (3 mph) | 12 + Average Group Sneak Bonus | – |
| Fast | **30 miles** (3.75 mph) | 10 + Average Group Sneak Bonus | Disadvantage on Combat Sequence rolls |

Every row is exactly eight hours: 18/2.25 = 24/3 = 30/3.75 = 8. That is what ties the Distance
column to the Traveling Limits rule beneath it.

Passive Sneak reuses `currentGroupSneak()` (`src/rules/party.ts`), which already averages the
party's Sneak bonuses for the sheet. The pure rule takes the average as a number.

## 4.2 The three fatigue rules

- **Traveling Limits.** *"Each character can travel a number of hours equal to 8 + half their
  endurance modifier (rounded down). For each hour traveled beyond their maximum, characters gain
  one additional level of fatigue."* Hours.
- **The Roads Walked.** *"Regardless of pace or how long the characters walk, each character
  gains a level of fatigue when they travel **on foot** for at least half their maximum distance
  (rounded down)."* Miles, and explicitly on foot.
- **Vehicles and Mounts.** The exemptions — §4.4.

Fatigue is capped at nine (pg 136, `FATIGUE_MAX`), the same ceiling `src/combat/turns.ts` reads
when it sheds a level at the start of a turn. Levels past the cap are announced, not silently
dropped.

## 4.3 "Maximum travel distance" — used four times, defined nowhere

The term appears in the mount rule ("they use the mount's maximum travel distance instead of
their own"), the vehicle rule ("their maximum travel distance is doubled"), and The Roads Walked
("half their maximum distance"). The table has a *Distance* column; Traveling Limits has an
*hours* limit. **Neither is labelled "maximum travel distance."**

**Ruling: `mph × (8 + half END mod)`.**

- It is the only reading under which the hours rule and the distance rule describe the same
  journey. Read the other way — maximum distance is just the table's flat 18/24/30 — a tough
  character's extra hours add no distance at all, and the Endurance interaction does nothing.
- It reproduces the printed table **exactly** at an Endurance modifier of 0, which is what the
  table's own `miles ÷ mph = 8` says it was built from.

**This is an inference and is labelled as one on every travel card.** A table that reads the
Distance column as a flat cap loses only the Endurance interaction.

## 4.4 The passenger contradiction

> Characters who ride in a caravan, on the back of a beast, or drive a vehicle have the luxury of
> not becoming fatigued at the end of their journey and can potentially travel even further
> distances.
> […]
> If a character is riding a mount, they use the mount's maximum travel distance instead of their
> own and gain no levels of fatigue for traveling. […]
> If the character is driving a vehicle, they gain no levels of fatigue for traveling half their
> maximum distance and their maximum travel distance is doubled. **This does not apply to any
> characters riding in a vehicle that they are not driving.**

Riding in a caravan is named as exempt in the first sentence and excluded by the last.

**Ruled for the first sentence: a passenger is exempt from travel fatigue**, and what the last
sentence denies them is the *driver's doubled distance* — the other thing that paragraph grants.
That reading leaves both sentences meaning something. The alternative has the book listing
caravan travel as a fatigue-free way to move and then charging fatigue for it.

**The contradiction is printed on the card**, because a table is entitled to read it the other
way.

Two smaller readings in the same paragraph:

- **A mount exempts both fatigue clauses** ("gain no levels of fatigue for traveling", flat).
- **A driver is printed as exempt only from The Roads Walked** ("no levels of fatigue for
  traveling half their maximum distance"). The opening sentence's blanket exemption is read as
  covering the hours clause too, on the same grounds as the passenger ruling.

## 4.5 The gallop

> A mounted character can ride at a gallop for an hour, covering twice the usual distance for a
> fast pace. However, their mount gains one level of fatigue.

**Ruling: twice a fast pace's *hourly* distance, i.e. 7.5 miles in that hour** — not twice the
30-mile day, which would put a horse at 60 miles in an hour. The book does not disambiguate.
Exposed as `gallopMiles()`; the mount's level of fatigue is the GM's to record, since no mount
document exists in this system.

## 4.6 Terrain at travel scale

> When traveling, the distance traveled is halved when moving through difficult terrain. […]
> quartered when moving through extreme difficult terrain.

Divides the **distance**, never the hours. A route that is only partly difficult has no printed
resolution — one tier is applied to the whole leg, which is the only thing a single control can
mean. Already recorded as T13 in `V21-NOTES-stamina-terrain.md`.

---

# SECTION 5 — Rules the book does not print at all

These are findings, not gaps in the implementation. Nothing was invented for any of them.

1. **Crawling has no rate and no AP cost anywhere in 136 pages.** Prone (pg 135) says "A prone
   creature's only movement option is to crawl" and Severed Leg/Foot (pg 129) says the same, and
   no page prices it. **There is deliberately no crawl control and no `crawlApPer5Feet`**, and
   the panel says so on its face so nobody goes looking. Previously recorded as T5 in
   `V21-NOTES-stamina-terrain.md`; re-confirmed by a full-book read of pg 116-118 and 126-127.
2. **"Off-balance" is referenced twice and defined nowhere.** Climbing (pg 116) and Swimming
   (pg 117) both say "you are considered *off-balance* (see pg #)" — an unfilled cross-reference.
   The term appears in no conditions list (pg 133-135) and on no other page. Reported on every
   climb and swim card with no mechanical effect attached, because attaching one would be writing
   the missing rule. (T6.)
3. **Two unfilled cross-references to Suffocating.** Diving (pg 117) and the treacherous-water
   round limit (pg 117) both say "see suffocating on pg #". The target is unambiguous — pg 118 is
   the only Suffocating section — so this one is harmless, but it is the same unfinished
   editorial pass.
4. **A combat round is 5 seconds on pg 117 and 6 on pg 124.** §3.1.
5. **Jumping over difficult terrain is unaddressed** (T10), as is **climbing or swimming through
   it** (T9). Nothing here stacks a surcharge onto a climb or swim rate — see §0.

---

# SECTION 6 — Integration points (files this chapter does not own)

1. **`src/fallout.ts` — API exports.** None of the movement API is on
   `globalThis.falloutTTRPG`, so `packs-src/fragments/movement.smoke.js` cannot run until it is.
   The list is in that file's header.
2. **`static/lang/en.json`** — merge `packs-src/fragments/movement.lang.json` under `FALLOUT.`.
3. **`static/styles/fallout.css`** — one new class, `.movement-list`, used for the climb, swim,
   jump and pace rate rows. It wants exactly what `.ready-list` already has (list-style none,
   zero padding, a flex row per `li` with the label left and `.panel-controls` right); reusing
   `.ready-list` under a name meaning something else in another panel seemed worse than one new
   selector. Everything else reuses existing classes: `.panel`, `.panel-note`, `.panel-controls`,
   `.pip-button`, `.ap-cost`, `.hint`, `.hint.warning`, `.combat-action-row`.
4. **`src/rules/constants.ts` — `SPRINT_AP_COST` now has an importer** and needs no change. It is
   imported by `src/rules/movement.ts` and re-exported from both movement modules so callers
   never type 5 twice.
5. **The suffocation healing lock** (§3.2) wants a derived gate. If `derived.hpHealableMax` ever
   grows a second contributor, suffocation is the obvious one: a flag on the breath marker could
   zero it, which would make `stabilizeCreature` and the healing gate refuse a drowning creature
   as pg 118 requires.
6. **`ROADMAP.md`** — D3's "Special movement (climb/swim/dive/jump/sprint), Falling, Suffocating"
   and "Travel pace" rows, and section E item 6 (`SPRINT_AP_COST` declared and imported by
   nothing), are all closed by this work. Section E item 6's stated fix — "the same shape as
   `UNARMED_STRIKE_AP_COST` before the combat actions landed" — is exactly what happened.

---

# SECTION 7 — EXPLICIT REJECTION LIST

Considered and **excluded**, with reasons.

**Not implemented because the book does not print the rule:**

- **A crawl rate or AP cost.** §5.1. The single most-requested missing number in this chapter and
  the one it would be easiest to invent. Not invented.
- **Any mechanical effect for "off-balance".** §5.2.
- **A distance for the climb-limit fall.** "You fall" (pg 116) with no height. The GM declares it
  to the Fall control.
- **A movement budget, a speed stat, or per-turn distance tracking.** §0. Enforcing the
  leg-condition caps, the difficult-terrain surcharge and the sprint's 50 feet are all one
  Foundry-integration job, already classified as such (ROADMAP section A item 1). Building half
  of it here would have produced a second, inconsistent answer.
- **Stacking the difficult-terrain surcharge onto climb or swim rates.** The book never does, and
  `V21-NOTES-stamina-terrain.md` §2.7 shows the surcharge-vs-absolute-rate mixture is undefined.
  Rushing Waters' own description cites "difficult terrain" as a *reason* its rate is what it is,
  which if anything says the surcharge is already priced in — but that is flavor, not a rule.
- **A mount document, or mount fatigue.** The gallop gives a mount a level of fatigue (pg 116)
  and no mount exists in this system to give it to. Reported.
- **Vehicles as anything but a travel mode.** The book prints no vehicle rules beyond the two
  sentences on pg 116.

**Belongs to a neighbouring chapter, deliberately left there:**

- **Difficult terrain's combat surcharge (pg 116).** Reproduced in `src/rules/movement.ts` only
  as a named constant, because Sprint's clause needs something to refer to. Not combined with
  anything, not enforced, and the extraction that settled it is
  `V21-NOTES-stamina-terrain.md` §2.
- **The Dust Storm (pg 122)** — its sprint halving and its 2 AP per 5 ft are already in
  `src/rules/weather.ts`; the sprint reads that flag rather than restating the weather table.
- **Frigid water (pg 123)** — `frigidWaterExposure` already implements the Endurance-score swim
  timer and its Hypothermia. It is a hazardous-environment rule, not a swimming rule, and the two
  are independent: a character in frigid rushing water pays this chapter's 2 AP per 5 ft *and*
  that chapter's minute clock.
- **Flames as a spreading area (pg 118)** — on the same page as Falling and Suffocating and
  belongs to the environment chapter. Out of scope; still absent (ROADMAP D3).
- **Vision and light (pg 118-119)** — same page, same reason, still absent.
- **The leg limb-condition distance caps (pg 129)** — 30/20/15 ft for two turns, Leg Cripple's
  20 ft, Severed Leg/Foot's 20 ft. Genuine caps, already extracted, and already unenforced for
  the reason in §0. They are limb conditions, not movement rules, and a fall now *inflicts* them
  rather than restating them.
- **Passive Sneak's detection half** — "Creatures whose passive sense is lower than their score
  cannot detect the party" is a detection rule and belongs with Hide / detection / Surprise
  (ROADMAP D3). The number is computed and printed; nothing consumes it, which is the same
  standing `passiveSense` and `groupSneak` already have.

**Considered as an interaction and found to have no printed rule:**

- **Dodge's 15-foot reaction move (pg 126)** — granted without an AP price, so there is nothing
  for any rate in this chapter to attach to. (T11.)
- **The Light armor mod rank 3 (pg 57)** — "If you spend at least 4 AP on your turn to move, you
  can move an additional 10 feet." A flat distance bonus with no budget to add it to. Near-miss,
  listed for completeness.
- **Grappled (pg 134)** — "cannot spend AP to move", which the status already carries as its
  whole meaning.
- **Slowed (pg 135) and Dazed (pg 133)** — AP budget caps with no movement clause.
- **Trailblazer's Instinct (pg 40)** — raises a Survival DC for a difficult-terrain route; touches
  no movement cost.
