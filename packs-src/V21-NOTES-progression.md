# V2.1 Rules Extraction — XP & Levelling, Skill Magazines, Caps & Barter's Discount

Source of truth: `FALLOUT TTRPG 2.1.pdf` (136 pp). PDF page N == printed page N (verified 1:1).
Patch notes not consulted; **the printed book governs**.
Table pages read visually at 150 dpi (`pdftoppm -r 150 -png`): **pg 6** (Level Up Table),
**pg 88** (skill magazine table). Prose pages read from `pdftotext -layout`: pg 5, 22, 88.

The two-column layout on pg 6 and pg 88 is exactly the case the working agreement warns
about — `pdftotext -layout` interleaves levels 1-20 with levels 21-30 on pg 6, and merges
the magazine table with the Chems column on pg 88. Both were read from the rendered image.

---

# SECTION 1 — XP and levelling (pg 5-6)

## 1.1 The XP-to-level rule

> "Whenever you gain 1000 XP, you gain a level."

Already implemented as `levelForXP` (`src/rules/formulas.ts`). The Level Up Table (pg 6)
stops at level 30; the book prints nothing about XP past it.

## 1.2 The five award rules — exact printed wording (pg 5, "Gaining XP")

> "The GM may award the players with XP at any time, but is typically awarded when the
> player characters spend any amount of time resting after completing a quest, encounter,
> or discovering something new. **Whenever you gain XP, if your XP total is lower than any
> other player character's total XP, you gain XP equal to the difference between your total
> and theirs. (Simply put: everyone shares the same amount of XP, defaulting to whoever has
> the highest).** Additionally, the following modifiers are added to the total."
>
> "**Reaching 0 Hit Points.** A 10% bonus of XP is awarded for each player character that
> fell to 0 hit points."
>
> "**Death.** 1000 XP is awarded to each player character if another player character
> permanently dies."
>
> "**Creature Discovery.** A 20% bonus of XP is awarded if the player characters roll combat
> sequence with a creature they have never rolled combat sequence with before."
>
> "**Location Discovery.** A 20% bonus of XP is awarded if the player characters rest in a
> city, town, ruin, dungeon, point of interest, or otherwise generalized location they have
> never rested in before."
>
> Sidebar: "Note: XP is not rewarded by killing people or monsters, it is instead rewarded
> for surviving encounters in the wasteland. Sometimes failure is the best teacher."

That is the complete XP chapter. Five rules; four are modifiers, one is the catch-up.

### What the book does not say, and how this system reads it

| Silence | Ruling | Why |
|---|---|---|
| **What "a 10% bonus of XP" is 10% *of*.** No antecedent is given. | Of the base award being handed out. | It is the only number in scope. Nothing else in the chapter is a quantity. |
| **Whether the percentages compound.** | **Summed**, then applied once. | The book calls them "modifiers … added to the total", which is addition, not multiplication. Compounding two discoveries plus three downed characters would silently reach ×1.73 instead of ×1.70 — small, but invented. |
| **How to round.** Never stated anywhere for any percentage in 136 pages. | **Round down.** | Every rounding rule the book *does* print rounds down (Party Nerve pg 22, bleeding, armor decay, chem limit). |
| **Where the flat 1000 XP death award sits relative to the percentages.** | Added **after** the rounded percentage total, never multiplied by it. | It is printed as a flat award, not a modifier; multiplying a printed integer by a discovery bonus is not something the text supports. |
| **What the base award is.** | Asked for. | The book prints **no table of XP amounts anywhere**. There is nothing to derive it from, and inventing an encounter-XP formula would be inventing the largest missing rule in the chapter. |
| **Whose XP "theirs" refers to in the catch-up sentence.** With three characters at three totals the sentence is circular. | Everyone rises to the **party maximum**. | The parenthetical settles it outright: "everyone shares the same amount of XP, defaulting to whoever has the highest". |
| **Whether a character who receives no award still catches up.** | **No.** | The rule is phrased as a consequence of gaining XP ("*Whenever you gain XP*, if your XP total is lower…"), not as a standing invariant. In practice the recipient list defaults to the whole party, so this only shows when a GM narrows it deliberately. |
| **Whether the death award is per dead character or once.** | Per dead character (a count). | "1000 XP is awarded to each player character if another player character permanently dies" reads as a consequence of *a* death; two deaths are two triggers. Defaults to 0 and is entered by the GM either way. |

Implemented: `experienceAward` and `catchUpGains` (`src/rules/progression.ts`),
`awardExperience` (`src/actions/progression.ts`).

## 1.3 Skill points and perk points (pg 5) — budgets already existed

> "**Skill Points.** Whenever you gain Skill Points, you can distribute these points among
> your skills. Each point you spend in a skill grants it a permanent +1. … If your
> Intelligence score is a 5, you gain 4 skill points when you reach 5th, 9th, 13th, 17th,
> 21st, 25th, and 29th level. If your Intelligence score is 6 or higher, you gain 5 … If
> your Intelligence score is 4 or lower, you gain 3 … If your Intelligence score ever
> changes, you gain or lose Skill Points equal to the total available at your level."
>
> "**Perk.** When you gain a perk point, you can use it to increase one of your ability
> scores by 1 or you can choose a perk that you meet the requirements for from the list on
> page 27, you gain its effects when you choose it. You gain 1 perk point at each level
> except for 5th, 9th, 13th, 17th, and 19th level."

`totalSkillPoints` / `totalPerkPoints` (`src/rules/formulas.ts`) already computed both, and
were verified against the pg 6 image column by column — the table's three Intelligence
columns are headed **−1 / 0 / +1** (modifiers), which correspond to Intelligence scores
≤4 / 5 / ≥6 in the prose, and the values (3/4/5 per milestone, cumulative 15/20/25 by level
21) agree.

**Two print errors in the pg 6 table, noted and not followed** (the prose governs, and the
code already follows the prose):

- **Level 8, Intelligence −1 column reads `6`.** Every neighbour reads `3` (levels 5, 6, 7)
  and the next grant is at 9th level, where the column correctly jumps to `6`. The row is a
  duplicated cell; a character does not gain skill points at 8th level under any reading of
  pg 5.
- **Level 9 reads `30 HP +END mod x4`** where every other row pairs SP and HP with the same
  multiplier and level 10 reads `x5`. Pg 5's prose ("You increase your maximum hit points by
  5 + your Endurance modifier when you reach 3rd, 5th, 7th, 9th…") gives x5 at 9th level.
  `maxHitPoints` already computes it from the prose.

**What did not exist: the spend side.** The book prints budgets and prints "each point you
spend in a skill grants it a permanent +1", and the sheet's `skills.<key>.points` field has
always held *both* invested points and a background's three +2s (pg 13-18). So that field
cannot answer "how many level-up points are left". The new ledger
(`system.progression.spends`) records each point as a receipt; the panel prints the
difference between the ledger and the sheet rather than reconciling it silently.

### Rulings on spending

- **A perk point spent on an ability score is capped at 10.** Pg 5 names no ceiling of its
  own; pg 20 caps player-character ability scores at 10. Creatures reach 20 but do not spend
  perk points.
- **Perk requirements are not checked.** All 186 perks state their requirements in prose
  ("Endurance 6 and level 4 or higher", "must be a Ghoul", "Guns 4"). There is no structured
  requirement field, and refusing a pick on a string parse would refuse legitimate ones.
- **Taking a perk records the choice, it does not create the item.** Adding the perk
  document is the existing drag-from-compendium flow; two ways to gain a perk could disagree.
- **Overspending is refused, undo is offered.** The book has no rule for borrowing against a
  future level, and no rule for losing a level either — so `applyLevel` only ever raises.

---

# SECTION 2 — Skill magazines (pg 88)

## 2.1 Exact printed wording

> "Reading a skill magazine can give you some tips and grant an edge on your skill rolls.
> Skill magazines are typically found or bought in issues and they take a number of minutes
> to read equal to 5 minus your Intelligence ability modifier, if this number is reduced to
> 0 you can read the skill magazine with 6 AP.
>
> Once you read an issue of a skill magazine you can no longer gain its benefits. Be sure to
> keep track of which issues you've read after reading them. (Example: ¡La Fantoma! issue #4
> read.) After you read five different issues of the same magazine, your associated skill
> bonus permanently increases by 1. Each magazine typically costs around 50 caps and has a
> load of 2 (GM's discretion)."

## 2.2 The table (pg 88, read from the page image)

Fourteen titles, one per skill, every effect identical in form:

| Name | Effect |
|---|---|
| Milsurp Review | Guns skill bonus +1 until you rest |
| Future Weapons Today | Energy Weapons +1 until you rest |
| Patriot's Cookbook | Explosives +1 until you rest |
| Tæles of Chivalrie | Melee Weapons +1 until you rest |
| Boxing Times | Unarmed +1 until you rest |
| Today's Physician | Medicine +1 until you rest |
| Locksmith's Reader | Breach +1 until you rest |
| Fixin' Things | Crafting +1 until you rest |
| ¡La Fantoma! | Sneak +1 until you rest |
| Lad's Life | Survival +1 until you rest |
| Salesman Weekly | Barter +1 until you rest |
| Horror Comics | Intimidation +1 until you rest |
| Meeting People | Speech +1 until you rest |
| Programmer's Digest | Science +1 until you rest |

All fourteen already ship in `packs-src/aid-med.json` with `aidType: "magazine"`, `cost: 50`,
`load: 2`, `apCost: 6` and the effect sentence verbatim — matching the printed table exactly.
The titles are the lookup key; the effect sentence is the fallback for a renamed or homebrew
magazine, and a magazine that resolves to neither is **refused** rather than guessed at.

## 2.3 Rulings

| Silence | Ruling | Why |
|---|---|---|
| **Do two issues of the same title stack their until-rest +1?** | **No — one +1 per title, refreshed.** | The table prints one line per magazine and the prose never contemplates two at once. Stacking would make five issues read in one afternoon worth +5 until the next rest, five times the permanent reward for the same five issues. |
| **Does the fifth issue grant the until-rest +1 *and* the permanent +1?** | **Yes — literally.** | Two sentences, two triggers: the table effect applies to every issue read, and pg 88 adds the permanent one separately. The book never says the until-rest bonus is what becomes permanent. The difference lasts exactly one rest. |
| **Does a tenth issue grant a second permanent +1?** | **No.** | "After you read five different issues … increases by 1" is a one-time threshold. An every-five escalation appears nowhere. |
| **What happens on re-reading a known issue?** | Nothing gained; the copy is still consumed. | "Once you read an issue of a skill magazine you can no longer gain its benefits" is explicit. The character still spent the time on it. |
| **Below-zero read time (Intelligence modifier above +5).** | ≤ 0 takes the 6 AP branch. | A player character reaches exactly 0 at Intelligence 10 and cannot go lower; only a creature could, and the book never contemplates it. The negative direction is printed as written: Intelligence 3 makes the read take 7 minutes. |
| **Where the permanent +1 is stored.** | Derived from the issue ledger, **not** written into `skills.<key>.points`. | That field is the level-up spend column. A magazine's +1 is not a skill point, and folding it in would make every reader look overspent. |
| **What "until you rest" means, given this system's two rest lengths.** | **Any** rest. | Pg 88 says only "until you rest" and names no duration, unlike Barter's Discount which prints 8 hours. This system's long rest is 6 hours (pg 119); the magazine bonus goes on any of them. |

Time and AP are **reported, not deducted** — the position every AP cost in this system takes
while roadmap item 14 is open.

---

# SECTION 3 — Caps and Barter's Discount (pg 22)

## 3.1 Exact printed wording

> "**Barter (skill).** The Barter skill measures your expertise in trade. Whether that be
> with merchants when trading valuables, or with powerful figures to discuss terms. Barter
> encompasses all manner of exchange, this for that. The higher your Barter skill, the more
> convincing you are when it comes to sweetening your deals. **You can also use this skill
> with a unique ability called Discount: When you purchase an item from a merchant with any
> kind of currency, you can gain a percentage discount equal to your Barter skill bonus on
> that item. Once you use this ability, you cannot use it again until you rest for 8 hours.**"

That is the entire caps economy in the book. There is no price list, no haggling check, no
sale rule, no rule for gaining caps, and no other rule anywhere that spends them.

## 3.2 Rulings

| Silence | Ruling | Why |
|---|---|---|
| **A negative Barter bonus.** | Clamped to 0 — the ability simply buys nothing. | The rule is written as a benefit the player elects to use ("you *can* gain"), never as a surcharge. Nobody opts into paying more. |
| **Rounding of the discount.** | Round the **discount** down. | Consistent with every rounding rule the book does print. Also stops a 1-cap item becoming free. |
| **Whether a character may go into debt.** | No — an unaffordable purchase is refused. | `currency.caps` is floored at 0 in the schema and the book never contemplates debt. |
| **Which rest recharges it.** | The printed **8 hours**, not this system's 6-hour long rest (pg 119). | The Discount prints its own duration explicitly, which is the same 8 hours ~20 perk and trait recharge clauses name (`REST_RECHARGE_HOURS`). See `src/rules/rest.ts` for that contradiction in full. |
| **Whether the Discount is spent when the bonus rounds to 0 caps.** | Yes, it is spent. | "Once you use this ability" — using it is the trigger, not saving caps by it. The chat card says so when the saving is 0. |
| **Whether buying creates the item.** | No. | Pg 22 is a rule about *paying*. The goods come from the GM's merchant and land on the sheet the usual way; a purchase that conjured a document would have to invent which document. |

---

# SECTION 4 — What is deliberately not implemented

- **An XP-per-encounter table.** The book has none, on any page. The base award is the GM's.
- **Automatic award triggers.** "Fell to 0 hit points", "a creature you have never rolled
  combat sequence with", "a location you have never rested in" are all *campaign* facts. The
  first is trackable in principle; the other two need a bestiary-seen set and a
  locations-rested-in set that no document in this system holds, and pg 5 makes all three
  the GM's call at award time. They are dialog inputs, not sensors.
- **Level-down.** No printed rule; `applyLevel` only raises.
- **Perk requirement enforcement.** See §1.3.
- **A caps economy** — prices, selling, haggling. The book prints one price ("around 50 caps"
  for a magazine, GM's discretion) and one spending rule.
