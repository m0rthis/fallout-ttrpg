# Perk & Trait Notes — Fallout TTRPG v2.0 (fan-made)

Source: `Fallout TTRPG v2.0 (PDF).pdf`. **Printed page number = PDF page index** (printed pg 32 is
PDF page 32). Outputs: `packs-src/traits.json`, `packs-src/perks.json`.

These chapters are two-column *prose*, not tables, so `pdftotext -layout` reads them correctly
(left column then right column, line-interleaved). Even so, **every page in scope was rendered at
110–150 dpi and read as an image** and compared against per-page `pdftotext -layout`. No
reordering or truncation was found on any page; the only layout hazard is entries whose heading
sits at the bottom of the left column with the body at the top of the right column (see §3).

## Page ranges (verified, not assumed)

| Section | Pages | Count |
| --- | --- | --- |
| **Traits** (heading pg 25 right column, ends with a horizontal rule after Trigger Discipline on pg 31) | **25–31** | **48** |
| **Perks** — chapter opens pg 32, ends with a horizontal rule after Evolution on pg 50 | **32–50** | **173** |
| — General Perks | 32–33 | 12 |
| — Strength Perks | 34–35 | 18 |
| — Perception Perks | 35–37 | 18 |
| — Endurance Perks | 38–39 | 18 |
| — Charisma Perks | 40–41 | 19 |
| — Intelligence Perks | 42–43 | 18 |
| — Agility Perks | 44–45 | 19 |
| — Luck Perks | 46–47 | 18 |
| — Race Perks | 48–50 | 33 |

Race Perks subdivides further (the counts above sum inside the 33):

| Race subsection | Pages | Count |
| --- | --- | --- |
| (no subheading — multi-race perks, printed before "Human Perks.") | 48 | 8 |
| Human Perks. | 48–49 | 5 |
| Ghoul Perks. | 49 | 8 |
| Robot Perks. | 49 | 3 |
| Synth Perks. | 50 | 3 |
| Super Mutant Perks. | 50 | 6 |

pg 51 begins "Items and Cost" — out of scope, and already covered by `EXTRACTION-NOTES.md`.

**The brief's guessed ranges were slightly off in one direction:** perks run to pg 50, not through
a Luck-Perks-terminated pg 50; and the brief's "sections by governing ability (Strength … Luck)"
misses **two** sections that have no governing ability at all — **General Perks** and **Race
Perks** — which together are 45 of the 173 perks. See §2 for how those were labelled.

## Verification notes

- **pg 33 is mostly blank.** `pdftotext` returns only three entries (Purifier, Sneering
  Imperialist, Swift Learner) in a single left column and there is an alphabetical gap between
  "Here and Now" (pg 32) and "Purifier". This looked like a dropped column, so pg 33 was rendered
  and read as an image: the right half of the page is **genuinely empty** and the left column ends
  a third of the way down. Nothing is missing; the General Perks list simply is not exhaustive
  through the alphabet.
- pg 37, 43, 45 are likewise partial pages with a genuinely empty right column (verified visually).
- Traits are **not** alphabetised across the whole list. The race-gated ones come first (pg 25–26),
  then loose thematic groupings, then a roughly alphabetical run pg 29–31 — but **Brawny** sits
  between Good Natured and Hoarder on pg 30, well out of alphabetical order. Transcribed in book
  order; nothing was reordered.

---

## 1. Field conventions

### `wildWasteland` is always `false`
Per the brief. The variant paragraph lives in `wildWastelandEffect`. Every one of the 48 traits has
a Wild Wasteland paragraph — there are no gaps.

### The `Wild Wasteland:` label is stripped from `wildWastelandEffect`
The field *is* the Wild Wasteland text, so repeating the label would be noise. Three traits print
**`Wild Wasteland, true to the original:`** (Claustrophobia, Early Bird, Night Person) — for those
the label was reduced to `True to the original: ` because it is meaningful (it flags a variant that
mirrors the video-game trait rather than doubling this book's numbers).

### `Prerequisite:` vs `Requirements:`
Traits print **`Prerequisite:`**; perks print **`Requirements:`**. Both go in their respective field
with the label removed. Six traits have one (Fast Metabolism/Human, Cheaper Parts/Robot, Dense
Circuitry/Synth, Activated Actinides/Ghoul, Onerous Regeneration/Super Mutant, Skilled/"An ability
score equal to or lower than 3."); the other 42 have none and get `""`.

### Trailing periods stripped from `requirements`
The book prints `Requirements: Strength 6.` — the field holds `Strength 6`, matching the brief's
example shape. No other change: multi-clause requirements keep the book's internal comma
(`Robot or Synth, Level 10`, `Human, Endurance 5`, `Human, Ghoul, or Super Mutant`). The one
exception is **Skilled**, a trait, whose prerequisite is a full sentence and keeps its period.

### `description` line 1/line 2
Perks: `(pg NN) Governing ability: <X>.` then the effect text, then the `Repeat:` clause if any,
each separated by `\n`. Traits: `(pg NN) ` then the benefit-and-drawback body, with the
prerequisite and the Wild Wasteland paragraph pulled out into their own fields.

### Governing ability for the two ability-less sections
- General Perks → `Governing ability: General.`
- Race Perks → `Governing ability: Race.` for the 8 multi-race perks printed before any subheading,
  and `Governing ability: Race (Human).` / `(Ghoul)` / `(Robot)` / `(Synth)` / `(Super Mutant)` for
  the five subsections. **This parenthetical is an addition, not book text** — it exists so the
  subsection survives into Foundry. Strip it if you'd rather key off `requirements`.

### Page citation for entries split across a page break
Five entries have their heading at the bottom of one column and their body at the top of the next.
The `(pg NN)` cite uses the **heading** page, since that is where a reader looking the entry up
will find it:

| Entry | Heading | Body |
| --- | --- | --- |
| Small Frame (trait) | pg 31 left | pg 31 right |
| Assert Power (perk) | pg 34 left | pg 34 right |
| Celebrity (perk) | pg 41 left | pg 41 right |
| Mysterious Stranger (perk) | pg 46 right | **pg 47** left |
| Fortune Favors the Bold (perk) | pg 47 left | pg 47 right |

Only Mysterious Stranger crosses an actual page boundary; its body and Luck table are on pg 47 but
it is cited `(pg 46)`.

---

## 2. `ranks` — every perk with a `Repeat:` clause and how it was read

29 of the 173 perks have `ranks != 1`. Full list, grouped by how the clause was read:

### "up to a maximum of twice" → `2` (10 perks)
Fight the Power!, Sneering Imperialist, Swift Learner, Pulsion Perforation, Roughin' It,
Cunning Strategist, Remedial Atomizer, It Just Works, Dumb Luck, Back to Back.

### "up to a maximum of three times" → `3` (11 perks)
Deadeye, Duelist, Purifier, Empowered Energy, Standoff, Efficient Diagnosis, Pack Rat,
Demolitions Expert, Survivorship Bias, Quick Repair, Thick Plating.

### "If you take this perk again…" with no stated cap → `2` (7 perks)
Friend of the Night, Splash Damage, Medicinal Master, Oracle, Lifegiver, Toughness, Grit.
These describe exactly **one** additional taking and no more, so `2` (not `99`) is the honest read.

### "**up to a maximum of once**" → `1` (5 perks) — *the reading to sanity-check*
Hit the Deck, Meltdown, PHOENIX Implant, Fortune Favors the Bold, Outrageous Advantage.

Taken literally this makes the `Repeat:` section a no-op, which is odd. The reason it is read as
`1` rather than `2` is **Fortune Favors the Bold** and **Outrageous Advantage**: both continue
*"…maximum of once. **If any other player character takes this perk**, …"*. The clause is about
other party members taking it, not about you taking it twice. Compare Mysterious Stranger's
*"This perk can only be taken once and only by one player character"* — unambiguously 1. So
"maximum of once" = one per character, and Hit the Deck / Meltdown / PHOENIX Implant follow suit.
**If a human disagrees, these five are the entries to flip to `2`.**

### `99` — the one uncapped repeat
**Adaptive Reflexes** (pg 32): *"Repeat: You can take this perk as many times as you have missing
arms or legs."* There is no number in the text, so per the brief it is `99`. In practice the real
cap is the character's count of missing arms/legs — at most 4, and gated by the perk's own
`Requirements: Missing Hand, Arm, Foot, or Leg`. A human may prefer `4`.

### Repeat clauses that are party-scoped, not rank-scoped → `1`
- **Ferocious Loyalty** (pg 40): *"Repeat: Once a player character has taken this perk, it cannot
  be taken by any other characters."* This restricts the **party**, not the character's rank count.
  `ranks: 1`.
- **Mysterious Stranger** (pg 47): *"can only be taken once and only by one player character."*
  `ranks: 1`.
- **Swift Learner** (pg 33) mixes both: *"twice by one player character **or** once by a total of
  two player characters."* `ranks: 2` (the per-character cap); the party rule is text-only.
- **Back to Back** (pg 40) mixes both too: the party restriction *and* a genuine second rank
  ("If you take this perk again, the AC bonus increases by 1…"). `ranks: 2`.
- **Here and Now** (pg 32) has no `Repeat:` label but says *"Once this perk has been taken, it
  cannot be taken again by any other player characters."* — same party-scope idea. `ranks: 1`.

---

## 3. Judgment calls and book errors

### 3a. Deadeye and Duelist label their Repeat clause "Requirements:" (pg 32) — book error
Both print:

> *Requirements: You can take this perk up to a maximum of three times.*

That is plainly a Repeat clause mislabelled, and neither perk has any real prerequisite (they sit
in General Perks, which by definition has no ability score attached). Read as
`requirements: ""`, `ranks: 3`, and the sentence was moved to a `Repeat:` line in the description.
**This is the single most interpretive change in either file.** Every other `Requirements:` line in
the book is an actual gate.

### 3b. "Robotic Expert:" (pg 43) prints a stray colon in its heading
Stored as `Robotic Expert`. Every other perk heading is colon-free.

### 3c. Missing punctuation in the source, transcribed as printed
- **Action Hero** (pg 44): `Requirements: Agility 4` — no period. (Field strips periods anyway.)
- **Legend of the Wastelander** (pg 41): `Requirements Charisma 8.` — **no colon** after
  "Requirements".
- **Reinforced Recovery**, **Fine-Toothed Giant**, **Wasteland Camel** (pg 50):
  `Requirements: Super Mutant` — no period.
- **Unstoppable Force** (pg 35): the effect text ends without a period
  ("…their DT is not subtracted from your damage total").
- **Medicinal Master** (pg 37): ends without a period ("…heal them of all their hit points") and
  contains the doubled word "**you you** can use a first aid kit".
- **Built to Destroy** trait (pg 29) Wild Wasteland: "it **gaines** Breakable" (sic), and cites
  "(see pg #)".
- Several entries cite an unfilled cross-reference — literal `page #` or `page 1` — in
  Assert Power, Terrifying Presence, Educated, Blind Devil-adjacent text and Built to Destroy.
  Left exactly as printed.

### 3d. "Jinxed" (a trait) calls itself a perk
pg 30: *"(Example: If only one player character has taken this **perk**; …)"*. It is in the Traits
chapter under a Traits heading. Kept as printed; it is a trait.

### 3e. Bruiser has TWO Wild Wasteland variants (pg 29)
Uniquely, Bruiser prints *"Wild Wasteland, option 1:"* and *"Wild Wasteland, option 2, true to the
original:"*. Both were kept, joined by `\n`, relabelled `Option 1:` / `Option 2, true to the
original:`. Note that option 2 is the only place in the whole Traits chapter that grants a flat
**Strength +2** — but since `wildWasteland` is `false`, it produces no `mechanics` entry.

### 3f. Fisticuffs (pg 34) has a garbled formula
*"…dazed for a number of rounds equal to their **8 - their Endurance ability score** (minimum of
1)."* The stray "their" before the 8 is in the book. Transcribed verbatim; do not "fix" the
arithmetic without a ruling.

### 3g. Multitarget Hotshot (pg 44) embeds two small-font clarification paragraphs
The book sets "Clarification: …" and "Further clarification, …" in a smaller face inside the perk
body. They are part of the rules text and were flattened into the same description paragraph.

### 3h. Mysterious Stranger's Luck table (pg 47) was flattened into text
It is the only table inside either chapter. Its four rows were rewritten as
`Luck Check 1-9: …` / `10 - 20:` / `21 - 24:` / `25+:` lines, one per `\n`, preserving the book's
spacing inside the ranges. No values altered.

### 3i. Adaptive Reflexes' benefit is internally inconsistent (pg 32)
*"If you lost your **hand or foot**: you gain 3 points… If you lost your **arm or leg**: you gain
5 points"* — but the opening sentence only addresses "foot or leg" for the movement clause, and the
requirement line is "Missing Hand, Arm, Foot, or Leg". A foot therefore appears in both the 3-point
and the movement clause. Transcribed as printed; **flagged for a human ruling**.

### 3j. Nuclear Reactor's AC/DT sentence is ambiguous (pg 48)
*"**While in an irradiated zone** you have advantage on all ability and skill checks.
**Additionally**, your AC increases by 1, your DT increases by 2, and you gain temporary hit points
equal to your level."* Whether the irradiated-zone condition governs the second sentence is not
stated. It was read as **conditional** (the perk is entirely radiation-themed and the temp-HP
clause is plainly situational), so it gets **no** `mechanics`. See §4b.

### 3k. Apostrophes and quotes preserved as printed
The source mixes straight and curly apostrophes (`don't` vs `You’ve`, `Grim Reaper's Sprint` vs
`Ranger’s Deadly Aim`, `Flaunt ‘n Taunt`, `Alive and Kickin’`, `Roughin’ It`, `Can’t Put Me Down`,
`Trailblazer’s Instinct`, `Hunter’s Wisdom`). Both were kept exactly. Likewise the curly quotes in
`“see”` (Blind Devil), `“Bulky”` (Fine-Toothed Giant), `“hydrating”` (Wasteland Camel) and
`“Primum non nocere”` (Do No Harm), and the straight quotes in Fight the Power!'s
`so-called "authorities"` and Hit the Deck's `the word "incoming"`.
`Been There, Done That.` keeps the period the book puts inside its heading.

### 3l. Entries deliberately NOT extracted
- The Traits chapter intro (pg 25) and the Perks / General Perks / Race Perks section intros —
  rules text, not entries.
- **Background Traits.** pg 25 says *"Your Background also provides you with an optional trait,
  found under the Background Traits list."* That list is **not** in pg 25–31; the Character Traits
  list is what this chapter contains. If a Background Traits list exists elsewhere in the book it
  is outside this scope and was not searched exhaustively — worth a follow-up.
- The chapter-opening quotes (Doc Mitchell, The Ghoul, Veronica, Macready, Ulysses, The Courier,
  Robert House, Vault Tec Instructional Video, Hancock, Virgil, Arroyo elder).

---

## 4. `mechanics` — what got annotated and what deliberately did not

**7 of 221 entries** carry a `mechanics` array (1 trait, 6 perks). Everything else is `[]`.

### 4a. The seven annotations

| Entry | File | Key(s) | Value | Clause |
| --- | --- | --- | --- | --- |
| Cheaper Parts | trait, pg 26 | `system.overrides.ac` | **-1** | "your AC is reduced by 1" |
| Stonewall | perk, pg 34 | `system.overrides.dt` | +2 | "Your damage threshold increases by 2" |
| Toughness | perk, pg 38 | `system.overrides.dt` | +1 | "Your DT increases by 1" |
| Can't Put Me Down | perk, pg 49 | `system.overrides.dt` | +1 | "Your DT increases by 1" |
| Thick Plating | perk, pg 49 | `system.overrides.ac`, `system.overrides.dt` | +1, +1 | "Your AC and DT increase by 1" |
| Feel No Wounds | perk, pg 50 | `system.overrides.dt` | +1 | "Your DT increases by 1" |
| Evolution | perk, pg 50 | `system.overrides.ac`, `system.overrides.dt` | +1, +1 | "Your AC increases by 1, your DT increases by 1" |

All seven are unconditional, permanent, flat, and unambiguous — no trigger, no choice, no duration,
no "while".

**Two caveats for the Foundry integration:**
1. **The mechanics describe ONE rank.** `Toughness` (`ranks: 2`) and `Thick Plating` (`ranks: 3`)
   both explicitly stack on repeat, so whatever builds the Active Effects must multiply by the
   number of ranks taken. `Toughness`'s Repeat clause says so in as many words
   ("If you take this perk again, your DT increases by 1"); `Thick Plating`'s does not restate the
   bonus, and the "+1 per rank" reading is an inference — **flagged.**
2. **No trait or perk in either chapter produces a `system.abilities.*.value` or
   `system.skills.*.points` entry.** Everything that touches an ability score or a skill in this
   book is either a choice ("five different Skill modifiers of your choice"), a perk-requirement
   fiction (Good Natured), a level-scaled amount, or gated on the Wild Wasteland toggle. That is
   why the annotation set is entirely AC/DT.

### 4b. Deliberately left `[]` — the boundary cases a human should review

These *look* automatable. Each was rejected for a stated reason.

| Entry | Text | Why `[]` |
| --- | --- | --- |
| **Gifted** (trait, pg 30) | "you decrease all your **skill check bonuses** by 3" | The only "all fourteen skills, flat, always-on" candidate in the book. Rejected because the schema path is `skills.<x>.**points**` and the book says *bonus*, not points — in this system a skill bonus is points + ability modifier + half Luck, so writing -3 into `points` is an interpretation, not a transcription. **Best candidate for a human to promote** (14 entries at -3). Its Wild Wasteland variant is -6. |
| **Talented** (trait, pg 28) | "five different skill modifiers of your **choice** decrease by 2" | Requires a player choice. |
| **Recluse** (trait, pg 27) | "five different Skill modifiers of your **choice** increase by 2" | Same. |
| **Skilled** (trait, pg 31) | "Increase **one** Skill modifier by 2" | Same. |
| **Godspeed** (trait, pg 30) | "**if you do so**, your AC and DT are each decreased by 2" | Conditional on opting into the AP gain. |
| **Good Natured** (trait, pg 30) | "+2 Charisma / -2 Agility and Strength **for any perk requirement**" | Not a real ability score change — it only alters gating. Writing it to `abilities.*.value` would wrongly change modifiers, damage and AP. |
| **Feral** (trait, pg 29, WW) / **Bruiser** (trait, pg 29, WW opt 2) | "a 4 in Charisma for any perk requirement" / "Strength score is increased by 2" | Both are Wild Wasteland text, and `wildWasteland` is `false`. |
| **Brawny / Small Frame** (traits, pg 30–31) | max HP / max SP ±level | Level-scaled, and neither HP nor SP is an allowed path. |
| **Nuclear Reactor** (perk, pg 48) | "your AC increases by 1, your DT increases by 2" | Ambiguous scope — read as gated on "while in an irradiated zone". See §3j. **Second-best candidate for promotion** if a human rules the sentence unconditional. |
| **Nerd Rage!** (perk, pg 42) | "your DT increases by 2" | Gated on "start your turn with less than half your total hit points". |
| **Rooted** (perk, pg 35) | "your DT increases by 5" | Only while the Rooted condition is active (costs 4 AP). |
| **Back to Back** (perk, pg 40) | "Your AC increases by 1, your DT increases by 2" | Only while within 5 feet of a chosen ally, chosen at combat sequence. |
| **Fight the Power!** (perk, pg 32) | "your DT is increased by 1" | Only against faction-affiliated creatures. |
| **Hunter's Wisdom** (perk, pg 48) | "your DT increases by 2" | Only against animals/insects. |
| **Anticipated Reflexes** (perk, pg 45) | AC +1/+2/+3 | Costs AP, reactive, player-chosen amount. |
| **Adaptive Reflexes** / **Partition Reset** (perks, pg 32/48) | "3 points / 5 points which you can use to increase any of your ability scores" | Player choice of which ability. |
| **Deadeye / Duelist / Bloody Mess / Built to Destroy / Feral / One Hander / Purifier / Sneering Imperialist / Gunslinger** | "add 2 to the result", "damage increases by 2", etc. | Attack and damage rolls are not among the allowed paths. |
| **Blind Devil / Alertness** (perks, pg 32/35) | "passive sense increases by 5" / "+ Perception score" | Passive sense is not an allowed path (and Alertness is gated on 10 minutes stationary). |
| **Hauler / Pack Rat / Hoarder / Gifted** | carry load +50 / +10 / +25 / +10 | Carry load is not an allowed path. |
| **Action Hero** (perk, pg 44) | "action point maximum increases by 2" | AP is not an allowed path (and the brief excludes AP changes). |
| **Implant Y-7 / Lifegiver** (perks, pg 39/38) | max HP + 2×level / +10 | HP is not an allowed path. |
| **Fast Metabolism / Cheaper Parts / Dense Circuitry / Onerous Regeneration** (traits) | "Healing Rate is increased by 2" | Healing Rate is not an allowed path — note that Cheaper Parts *does* get a mechanics entry, but only for its AC drawback, not its Healing Rate benefit. |
| **Rad-Tastic!** (perk, pg 48) / **Fast Metabolism** (trait, pg 25) | Radiation DC -3 / +3 | Radiation DC is not an allowed path. |
| **Vigilant Watch / Trigger Discipline / Dense Circuitry** (traits) | combat sequence bonus -1 / -2 / -2 | Combat sequence is not an allowed path. |

---

## 5. Validation performed

- `node -e "JSON.parse(...)"` passes on both files.
- Shape check: all 48 traits are exactly `{name, type:"trait", system:{prerequisite, wildWasteland,
  wildWastelandEffect, description, mechanics}}`; all 173 perks are exactly
  `{name, type:"perk", system:{requirements, ranks, description, mechanics}}`. No extra keys, no
  missing keys, keys in the documented order.
- `wildWasteland === false` on all 48 traits; all 48 have non-empty `wildWastelandEffect`.
- Every `description` begins `(pg NN) `. No HTML tags anywhere in either file.
- No duplicate names within either file. (Note across files: nothing collides — no trait shares a
  name with a perk.)
- Section counts recomputed from the `Governing ability:` line of each perk description and matched
  against the page-by-page image read: 12 / 18 / 18 / 18 / 19 / 18 / 19 / 18 / 33 = 173.
- Every `mechanics` key checked against the four allowed path families in the brief.

---

## Post-extraction changes (integration pass)

1. **Gifted was promoted to `mechanics`** (15 changes: Carry Load +10, and −3 to each of the
   14 skills). The agent correctly declined this against the brief's original key list,
   reasoning that the book says skill *bonus* while `system.skills.*.points` means invested
   points. That objection dissolved when the character model gained
   `system.bonuses.skills.<skill>`, which is precisely the skill bonus the trait reduces.
   Gifted's other clauses (Combat Sequence +1, an extra Discount use per rest, Party Nerve +1,
   an extra Karma Cap) remain text: Party Nerve is computed across the whole party, Karma Caps
   are a stored count, and there is no initiative bonus field yet.
2. **Nuclear Reactor stays `[]`.** Its AC +1 / DT +2 sits in a sentence beginning
   "Additionally," directly after "While in an irradiated zone…", so whether the bonus is
   conditional is genuinely unresolved in the text. An always-on effect would be wrong half
   the time; text is the honest reading.
3. **`mechanics` is stripped at pack-build time** — it is an authoring annotation, not part of
   the item schema. `scripts/build-packs.mjs` converts each entry into an embedded
   ActiveEffect with `transfer: true`, remapping the annotation keys onto `system.bonuses.*`
   and emitting the v14 change shape `{key, type, value, phase: "initial", priority}`.
4. **Artwork**: perks and traits get generated Pip-Boy tiles via new `_fallback:perk`
   (lorc/muscle-up) and `_fallback:trait` (lorc/mad-scientist) entries in `icon-map.json`,
   both already vendored, so no new CC-BY attributions were needed.

---

## 6. The D4 mechanics audit (BACKLOG D4)

All 233 entries were re-read against v2.1 with two capabilities that did not exist when the
earlier passes wrote their rejection tables:

- **Conditions.** A mechanics entry may name a `condition` from `EFFECT_CONDITIONS` (and
  `negate: true` for "while you are NOT …"); the emitter splits an entry into one effect per
  condition group. "Filed as conditional" no longer means "filed as text".
- **Paths.** `BONUS_KEYS` grew `hpMax`, `spMax`, `apMax`, `carryLoad`, `passiveSense`,
  `healingRate`, `d20`, `damage`, `initiative`, `partyNerve`, `karmaCaps` — the exact list
  `V21-NOTES-perks.md` §4c parked as "worth a human decision". This pass is that decision:
  every one of them is a real derived number on the sheet (`character.ts` folds all eleven), so
  a clause that names one and is otherwise flat and unconditional is now an effect.

**Result: 11 → 27 of 233 entries carry an Active Effect** (16 newly annotated, three of which
extend an entry that already had one). No `name`, `type`, `description`, `requirements`,
`ranks`, `prerequisite`, `wildWasteland` or `wildWastelandEffect` changed; no entry was added,
removed or reordered; the only diff in either file is inside `mechanics`.

### 6a. Annotated or extended (19 entries; 16 of them newly carry an effect)

| Entry | pg | Change(s) | Clause |
| --- | --- | --- | --- |
| Fast Metabolism | trait 26 | `healingRate` +2 | "Your Healing Rate is increased by 2" |
| Cheaper Parts | trait 26 | + `healingRate` +2 | its benefit half, alongside the AC −1 it already had |
| Dense Circuitry | trait 26 | `healingRate` +2, `initiative` −2 | "Healing Rate maximum equal to 2 … Combat Sequence rolls are decreased by 2" |
| Onerous Regeneration | trait 26 | `healingRate` +2 | "Your Healing Rate is increased by 2" |
| Do No Harm | trait 27 | `damage` −1 | "the damage is reduced by 1 to a minimum of 1" |
| Vigilant Watch | trait 29 | `initiative` −1 | "your Combat Sequence bonus is reduced by 1" |
| Built to Destroy | trait 30 | `damage` +1 | "Any damage you deal with a weapon is increased by 1" |
| Gifted | trait 31 | + `initiative` +1, `partyNerve` +1, `karmaCaps` +1 | see §6c — this overturns a ruling |
| Trigger Discipline | trait 33 | `initiative` −2 | "your combat sequence bonus is reduced by 2" |
| Blind Devil | perk 34 | + `passiveSense` +5 | "your passive sense increases by 5" |
| Hauler | perk 36 | `carryLoad` +50 | "Your maximum carry load increases by 50" |
| Pack Rat | perk 38 | `carryLoad` +10 | "Each player character's carry load increases by 10" — this character's share only |
| Lifegiver | perk 40 | `hpMax` +10 | "Your maximum hit points increase by 10" — the party's +1 each stays text |
| Implant Y-7 | perk 41 | `healingRate` +2 | "your Healing Rate increases by 2" (its HP clause is level-scaled, §6d) |
| Keeping your Cool | perk 43 | `ac` +1 **if `undamaged`** | see §6b |
| Action Hero | perk 47 | `apMax` +2 | "Your action point maximum increases by 2 to a maximum of 15" |
| Bloody Mess | perk 49 | `damage` +2 | "Whenever you deal damage with a weapon or explosive, the damage increases by 2" |
| Make it Double | perk 49 | `karmaCaps` +1 | "You gain an additional Karma Cap" — the field's own comment names this perk |
| Nuclear Reactor | perk 52 | `ac` +1, `dt` +2, `advantage.<7 abilities>` **if `inIrradiatedZone`** | see §6b |

Four things checked before writing them:

1. **The paths reach the sheet.** `derived.healingRate`, `passiveSense`, `carryLoadMax`,
   `hpMax`, `apMax`, `damageBonus`, `initiativeBonus`, `partyNerveBonus` and `karmaCapsMax` each
   read their `bonuses.*` field in `character.ts`; none is a write-only key.
2. **Do No Harm's "minimum of 1" needs no annotation.** `rollDamage` already floors the applied
   total at `MINIMUM_DAMAGE` (= 1), so a −1 bonus cannot take a hit below the book's floor.
3. **Bloody Mess's explosive half under-applies, deliberately.** `damageBonus` is read by
   `rollDamage` and the improvised-attack path, not by `explosives.ts`. Built to Destroy ("with
   a weapon") is therefore exact; Bloody Mess ("with a weapon or explosive") is correct on
   weapons and silent on explosives, which is the conservative direction.
4. **Action Hero's "to a maximum of 15" is already ruled on.** `formulas.ts` documents the pg 24
   ceiling as contradicted by pg 89's chem caps and deliberately leaves `apMax` uncapped; the
   perk inherits that ruling rather than restating it.

### 6b. The two conditional promotions

**Nuclear Reactor (pg 52)** was named the best promotion candidate by both earlier passes and
left as text by both, for the same reason each time: the paragraph hangs off "While in an
irradiated zone", and an always-on grant would be wrong whenever the character walked out.
Nothing about that reading changed — what changed is that the conditional reading is now
*writable*. So it is annotated exactly as it was ruled: one group flagged `inIrradiatedZone`,
shipped disabled, carrying AC +1, DT +2 and advantage on the seven ability categories.

The category choice follows Hoarder: "all ability and skill checks" is the seven abilities (each
covers the skills it governs), **not** `all`, which the engine defines as every d20 and which
would hand out advantage on attack rolls and combat sequence the perk never mentions. Its
"temporary hit points equal to your level" clause stays text — temp HP is a spendable pool that
an effect-written bonus cannot decrement, which `effects.ts` says outright.

**Keeping your Cool (pg 43)** is gated twice: "During combat … so long as you haven't taken any
damage to your hit points during the combat." A mechanics entry carries **one** condition, so
only the AC +1 is annotated, under `undamaged`. That is defensible for AC specifically — AC is
consulted only when something attacks you, and being attacked *is* the combat half of the gate —
but it is not defensible for the perk's other half, so "advantage on all Charisma checks" stays
text: at full hit points out of combat it would fire in exactly the scene where Charisma checks
happen. The remaining error is the book's "even if you heal back those hit points", which
`undamaged` (hp ≥ hpMax) cannot see. Both gaps are listed in §6d.

### 6c. Where this pass disagreed with an earlier ruling

**One, and only on a stated reason that has since dissolved.** The integration-pass note above
(§ "Post-extraction changes" 1) rules that Gifted's Combat Sequence +1, Party Nerve +1 and extra
Karma Cap "remain text: Party Nerve is computed across the whole party, Karma Caps are a stored
count, and **there is no initiative bonus field yet**." All three fields now exist and are
consumed: `derived.initiativeBonus` feeds the initiative formula registered in `fallout.ts`,
`derived.partyNerveBonus` is added to `currentPartyNerve()` in `dice/rolls.ts`, and
`derived.karmaCapsMax` is `currency.karmaCaps + bonuses.karmaCaps` — with a comment that names
Make it Double as the perk it was built for. Gifted's fourth clause, "you can use Discount an
additional time per rest", genuinely has no field and stays text.

Everything else in every earlier rejection table was re-read and **upheld**, including the two
standing rules: a grant conditioned on the *target* (Animal Friend, How do you do fellow Ghouls?,
Computer Cousin, Hunter's Wisdom, Fight the Power!, Entomologist, Purifier, Sneering Imperialist,
Field Research) stays text because a target is not sheet state; and a perk that *removes* a
conditional disadvantage this system never applied (Weapon Handling, Never Unarmed, Friend of the
Night — `light.ts` reports obscurement, it does not write a `disadvantage` counter) stays text.

### 6d. Wants a capability that does not exist — reported, not invented

| # | Blocked entries | What it would need |
| --- | --- | --- |
| 1 | Street Rat (trait 29, `skills.sneak`/`breach` + `speech`/`barter`, condition `inSettlement`), Activated Actinides (26, radiation), Enhancement Resistant / Enhancement Reliant (30, addiction), Chemist (44, addiction), Stonewall (36, resistGrapple), Toughness rank 2 (40, resistFrightened), Trailblazer's Instinct (40, encounter), Spray and Pray (49, blindAttack), Can't Put Me Down (53, deathSave) | **`bonusKeyFor()` cannot emit a scoped advantage path.** Its regex accepts `system.bonuses.advantage.<category>` but not the three-segment `…advantage.skills.<skill>` / `…advantage.checks.<check>` that `advantagePath()` produces and that `character.ts` already stores and reads (Power Armor writes `advantage.checks.radiation` today). `CHECK_SCOPES` was added *for these seven entries* — the scopes exist, the schema exists, only the emitter's key filter rejects them. **Highest-value single fix in this list: ten entries.** |
| 2 | Nerd Rage! (45), Rooted (36), Godspeed (31), Hot Blooded (32), Back to Back (43), Made of Sterner Stuff 2nd clause (41, `dtMelee` +2 while wielding a melee weapon) | **Conditions the list does not contain**: "below half hit points", "while Rooted", "at 0 stamina", "within 5 feet of the chosen ally", "wielding a melee weapon". The first is sheet-derivable (it is the inverse of `undamaged`'s neighbourhood); the rest would be declared flags. |
| 3 | Keeping your Cool's Charisma advantage (43) | **Conjunction.** A mechanics entry carries one `condition`; this clause needs `inCombat` **and** `undamaged`. Also needs a "lost for the rest of this combat even if healed" latch, which no derived condition can express. |
| 4 | Brawny / Small Frame (32–33), Onerous Regeneration (26), Evolution (54), Implant Y-7's HP clause (41), Alertness (37), Standoff (38), Quick Recovery (41), Atomic! (52), Been There Done That (50), Dumb Luck (50), Big Ego (42) | **Formula values.** `value` must be a number; these are "equal to your level", "equal to your Perception modifier", "doubled". A `value: "@details.level"` / a `multiply` type would cover most of them. |
| 5 | Finesse (31), One Hander (33), Deadeye / Duelist / Purifier / Sneering Imperialist (34–35), Butcher (35), Gunslinger (47), Multitarget Hotshot (48) | **No attack-roll bonus path.** `d20` exists but applies to every check; an `attack` numeric bonus (parallel to the `attack` advantage category) is what the text names. Most of these are also weapon-type-scoped, so a path alone would not finish them. |
| 6 | Fast Metabolism (26), Rad-Tastic! (52) | **No `radiationDC` bonus key.** `derived.radiationDC` adds `radiation.dcBonus`, which is the pg 124 success ladder — a resettable counter, not an effect target. |
| 7 | Do No Harm's healing clause (27), Efficient Diagnosis (38), Quick Recovery (41) | **No "hit points restored" bonus key.** `healingRate` is the pool, not the per-heal amount. |
| 8 | Nuclear Reactor's temp HP (52), Roughin' It (41), Indomitable Spirit (41), A Moment of Respite (27) | **Temporary hit/stamina points are a spendable pool, deliberately not a `BONUS_KEY`** (`effects.ts` says so). Nothing to do here unless that ruling changes. |

Also worth recording: the *shape* of the remaining 206 text entries has not changed. They are AP
discounts, once-per-rest abilities, karma-cap economies, crafting and travel procedures, and
grants aimed at other creatures — none of which is a number on a sheet. The ratio is now what the
audit expected it to be.
