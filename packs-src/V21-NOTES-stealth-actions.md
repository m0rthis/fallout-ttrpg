# V2.1 Rules Extraction — Hide / detection / Surprise (pg 24, 125, 127, 128) and the remaining pg 126 combat actions

Source of truth: `FALLOUT TTRPG 2.1.pdf` (136 pp). PDF page N == printed page N (verified 1:1 —
pg 126 renders the Grapple entry, pg 125 the Surprise entry).
Method: `pdftotext -layout` for prose; **the pg 126 Actions in Combat table was read visually** at
150 dpi (`pdftoppm -r 150 -png`), cropped to the right-hand column, because that page interleaves
the table with the improvised-action AP guide and layout extraction has misaligned this project's
columns before. The image and the extraction agree row for row. Patch notes consulted only as
corroboration; **the printed book governs**.

Two headline findings:

- **§1.1 — the cross-reference in the Hide action points at a section that does not exist.** The
  phrase "Unseen Attackers and Targets" occurs exactly once in 136 pages: in the cross-reference
  itself. The "certain benefits" of hiding have to be reassembled from pg 24 and pg 128.
- **§1.2 — the book states the Sneak-vs-passive-sense comparison four times and disagrees with
  itself.** Three printings make a tie a detection, one makes it a hide.

---

# SECTION 1 — Hiding and detection

## 1.0 The printed entries, verbatim

**pg 21 — Passive Sense (the definition):**

> **Passive Sense.** A measurement of your senses at all times. When you roll a Perception ability
> check, your character is actively trying to find something they may already be aware of. Creatures
> that sneak remain undetected if they roll **higher than** your passive sense score. Your passive
> sense score is equal to 12 + your Perception modifier.

**pg 24 — the Sneak skill:**

> **Sneak (skill).** The Sneak skill measures your ability to remain quiet or inconspicuous. On your
> turn you can spend 6 AP to hide. When you hide you roll a Sneak skill check, **if you have cover**
> against any creatures and your Sneak skill check total is **equal to or greater than** their
> **passive Perception**, then you are hidden from them and they cannot see you. **If you attack a
> creature who you are hidden from, you gain advantage on the attack roll.** If a creature is aware of
> your presence, but cannot see you because you are hidden, they may make a Perception check contested
> against a Sneak check from you. If their total is higher, you are no longer hidden. If your total is
> higher, then you remain hidden. Player characters, while traveling, can move at half pace and use
> their Group Sneak to remain stealthy while traveling. Your Group Sneak is equal to each player
> character's Sneak modifier divided by the number of player characters.

**pg 127 — the Hide action:**

> **Hide.** When you take the Hide action, you make a Sneak check with the **DC equal to** any nearby
> enemies passive sense scores. **In order to hide you must be heavily obscured or within full
> cover.** You are hidden from any enemies that have a **lower** passive sense compared to your sneak
> roll. If you succeed, you gain certain benefits, as described in the **"Unseen Attackers and
> Targets"** section. While hiding, you are acting unpredictably to confuse your enemy. **Enemies
> still know your general location** and can move to try and make line of sight again to notice you.
> If you are no longer within full cover of an enemy you are hidden from, you are no longer hidden.

**pg 128 — Sneak Attacks:**

> **Sneak Attacks.** If an enemy cannot sense you (being invisible, heavily obscured, full cover) and
> are unaware of your presence. Your attacks are critical hits and ignore Stamina Points. However you
> still must roll attack and beat the target's AC.

**pg 118 — heavily obscured:**

> A heavily obscured area—such as darkness, opaque fog, or dense foliage—blocks vision entirely. A
> creature effectively suffers from the blinded condition when trying to see something in that area.

**pg 134 — Invisible:**

> An invisible creature is impossible to see. **For the purpose of hiding, the creature is heavily
> obscured.** The creature's location can be detected by any noise it makes or any tracks it leaves.
> Attack rolls against the creature have disadvantage, and the creature's attack rolls have advantage.

**pg 77 — the Silencer weapon mod:**

> While you are hidden; any attack rolls you make with a weapon that has a silencer modification does
> not reveal your presence to nearby creatures, allowing you to remain hidden **except against the
> creature you attacked**.

## 1.1 FINDING: "Unseen Attackers and Targets" does not exist

`pdftotext -layout` over all 136 pages returns exactly **one** hit for "Unseen", and it is the
cross-reference on pg 127 quoted above. There is no such section, no such heading, and no such
sidebar. (The book carries at least three other dangling references of the same kind — `(see pg #)`
appears unfilled for off-balance on pg 116 and for Rattled's frightened on pg 128 — so this is a
production defect, not a reading error.)

The "certain benefits" therefore have to be reassembled from the pages that do exist. There are
exactly two, and they are **different rules with different requirements**:

| Benefit | Where it prints | What it needs |
|---|---|---|
| Advantage on your attack roll | pg 24 | hidden from that creature |
| Sneak attack — automatic critical hit, ignores stamina points | pg 128 | concealed **and** the target unaware |

**Ruling: hiding grants the first and not the second.** pg 127 says in as many words that "Enemies
still know your general location", which is the precise negation of pg 128's "unaware of your
presence". Reading Hide as granting a sneak attack would make that sentence false on the page it is
printed on.

**Which means: Surprise is what turns hiding into a sneak attack.** pg 125's Surprise is the only
procedure in 136 pages that establishes a creature does not know somebody is there. That is the
answer to "what does the book say makes a creature unaware", and it is why `sneakAttackPosture` reads
the Surprise marker rather than the Hidden one. A GM may of course declare a target unaware for
reasons of fiction (asleep, at a terminal, facing away) — the parameter allows it — but Surprise is
the printed mechanism.

Corroboration from a third page: pg 129 says damage goes to hit points "if they are unconscious,
**unaware of their surroundings**, or otherwise incapable of moving." So pg 128's stamina bypass is
not an exception; it is an instance of a general rule about unawareness.

## 1.2 FINDING: the comparison is printed four times, three ways

| Page | Wording | Tie |
|---|---|---|
| 21 (defines the score) | "remain undetected if they roll **higher than** your passive sense score" | detected |
| 24 (Sneak skill) | "total is **equal to or greater than** their passive Perception" | hidden |
| 127 (Hide action) | "the **DC equal to** … passive sense scores" | hidden (by DC convention) |
| 127 (next sentence) | "enemies that have a **lower** passive sense compared to your sneak roll" | detected |
| 116 (Passive Sneak) | "Creatures whose passive sense is **lower than** their score cannot detect" | detected |

**Ruled: strictly greater — a tie is a detection.** Three printings say so in those words, including
the definition of the score itself and the travel-pace rule; the tie-succeeds reading rests on pg 24
plus an inference from the word "DC" in a sentence whose very next clause contradicts it. The dissent
is not repaired: it is a one-point difference, and preferring the skill chapter over the definition,
the action, and the travel table would be the harder position to defend. Coded at
`beatsPassiveSense()`.

## 1.3 FINDING: pg 24 and pg 127 disagree about what you can hide behind

pg 24: "**if you have cover** against any creatures" — any degree, half included.
pg 127: "**In order to hide you must be heavily obscured or within full cover**."

**Ruled: pg 127.** It is the action entry, it states a requirement in the imperative, and it is the
page that also states how hiding ends. Taking pg 24's looser reading would leave pg 127's sentence
doing nothing whatever. Coded at `canHide()`; the sheet's concealment picker deliberately offers only
the three qualifying states, so the rejected reading cannot come back in through the UI.

Invisible qualifies, and that is printed rather than inferred (pg 134, quoted above).

## 1.4 FINDING: the clause that ends hiding is narrower than the clause that starts it

You may hide if "heavily obscured **or** within full cover". You stop being hidden "if you are no
longer within **full cover**". A creature hiding in darkness therefore never stops hiding, however
the darkness changes.

**Ruled: as printed, and reported.** `hidingBroken()` fires only on the cover clause;
`breakHidingOnCover` refuses to end an obscurement-hiding and says why on the card, and the panel
carries a standing note. Extending the sentence would be writing the rule the book skipped; silently
extending it would hide the defect from the GM.

## 1.5 SILENCE: the detection contest does not address a tie

pg 24 gives "If their total is higher, you are no longer hidden. If your total is higher, then you
remain hidden." Neither branch fires on equal totals.

**Ruled in the hider's favour** (`detectionOutcome()`), on the narrow ground that nothing printed
changes the state the creature is already in. Note this cuts the opposite way from §1.2's ruling —
deliberately: they are two different sentences with two different silences, not one rule stated
twice.

## 1.6 SILENCE: what attacking does to hiding is never stated directly

Nowhere does the book say that attacking reveals you. It is established **only by exception**, in the
Silencer mod on pg 77 — a mod whose entire benefit is that attacking with it does *not* reveal you,
"except against the creature you attacked". An exception that specific establishes what it is an
exception to.

Coded at `revealedByAttacking()`. Silenced is declared, not detected: `system.mods` is a bare string
in this system (roadmap D2 — weapon mods are not mechanical at all).

## 1.7 Search (pg 126-127, 3 AP)

> **Search.** You make an active perception check to look for someone or something hidden.

No DC is printed, and pg 21 explains why the book does not think one is needed: the active/passive
split is the whole point ("When you roll a Perception ability check, your character is *actively*
trying to find something"). Against a specific hidden creature there **is** a printed comparison and
it is the only one — pg 24's contest — so `searchFor` runs that, both sides rolling fresh. Against
nothing in particular it rolls the check and reports it.

It is an **ability** check, not a skill check: "perception check" names no skill, and Perception
governs five of them here. Corroboration for the 3 AP: pg 126's own improvised-action guide uses
"making an active perception check to find something in the area" as its worked 3 AP example.

---

# SECTION 2 — Surprise (pg 125)

## 2.0 Verbatim

> **Surprise**
> Raiders sneak up on a pack of ghouls, springing from the ruins to attack them. A super mutant stalks
> down a vault passage, unnoticed by the characters until the mutant pummels them with a super sledge.
> In these situations, one side of the battle gains surprise over the other. The GM determines who
> might be surprised. **If neither side tries to be stealthy, they automatically notice each other.**
> Otherwise, the GM compares the Sneak checks of anyone hiding with the passive sense score of each
> creature on the opposing side. **Any character or creature that doesn't notice a threat is surprised
> at the start of the encounter.** If you're surprised, you can't move or take an action on your first
> turn of the combat, and you can't take a reaction until that turn ends. **A member of a group can be
> surprised even if the other members aren't.**

It is step 1 of "Combat Step by Step" on the same page, ahead of positions and combat sequence.

## 2.1 RULING: "doesn't notice **a** threat" is read as "notices none of them"

The sentence is ambiguous when there is more than one hider. The alternative reading — surprised if
any single threat goes unnoticed — makes a creature who has already spotted one raider still count as
caught off-guard while a second creeps up, which is neither what the word means nor what the two
worked examples describe (both are *first contact*: "springing from the ruins", "unnoticed **until**
the mutant pummels them").

`surpriseOutcomes()` returns both tallies (`missed` and `noticed`) as well as the verdict, so the
ruling stays auditable rather than buried in a boolean.

## 2.2 What Surprise does, and what this system does with it

The printed cost — no movement, no action, no reaction — is **not enforced**. Nothing in this system
gates AP spending or models reactions at all; Frightened-Freeze hit the identical wall and was left as
printed text (`src/actions/combat-actions.ts`). Surprise is therefore a marker, a chat card, and one
sentence on the sheet.

Its *mechanical* teeth are §1.1: a surprised creature is unaware, and unawareness is the second half
of the sneak attack's requirement. That is what makes this worth building rather than narrating.

## 2.3 Wiring note: the opposing side is the targeting selection

The rule is written twice as something the GM does ("The GM determines", "The GM compares") against a
side they have in mind. `determineSurprise` takes the targeted creatures as that side. This is not
only convenient — `game.combat` is not in this system's typed Foundry globals, so there is no combat
document to read a side off in any case.

---

# SECTION 3 — The pg 126 Actions in Combat table

Read at 150 dpi from a rendered page image; the `-layout` extraction agrees row for row. Reproduced
complete, because this is the first time the whole table has been recorded in one place.

| Action | AP | State before this work |
|---|---|---|
| Attack | *Dependant on the weapon.* | done |
| **Dodge** | **6** | absent |
| **Equip a weapon** | **3** | absent |
| Escape | 5 | done |
| Grapple | 3 | done |
| Help | 6 | done |
| **Hide** | **6** | absent |
| **Interact with an object.** | **3** | absent (constant only) |
| Move 5 feet. | 1 | movement chapter |
| Ready | +2 | done |
| Reload | 6 | done |
| **Search** | **3** | absent |
| **Shove** | **4** | absent |
| Sprint | 5 | `SPRINT_AP_COST` declared, unused |
| **Stand up from Prone** | **5** | absent |
| **Stow an weapon** *(sic)* | **3** | absent |
| **Take Cover** | **3** | `TAKE_COVER_AP` declared, no caller |
| Unarmed Strike. | 3 | done |
| Use a Chem | 4 | done |

`COMBAT_ACTION_AP` in `src/rules/actions.ts` carries the whole table and **imports** the constants
that already existed rather than restating their numbers, so the table cannot drift from the code
that uses it.

## 3.1 Dodge (6 AP, pg 126)

> **Dodge.** You prepare to move quickly out of the way of an attack or explosion. Until the start of
> your next turn, any attack roll made against you has disadvantage if you can see the attacker.
> Additionally, you can move up to 15 feet in reaction to any other creature's action one time before
> the start of your next turn. You lose this benefit if you are dying or you cannot spend AP to move.

Four notes:

- **The disadvantage lands on somebody else's roll.** Advantage and disadvantage are Active Effects
  on the creature that *rolls*, and an attack is rolled from the attacker's sheet, which never learns
  who it is aimed at. Same wall cover ran into, same answer: declared, not measured. `dodge()` writes
  a marker and the panel announces it; the attacker ctrl-clicks.
- **"An attack **or explosion**" is flavour that overpromises.** The mechanical sentence only ever
  touches "any attack roll made against you". An explosive that forces no attack roll (pg 78-79) gets
  nothing from a Dodge, and the book offers no saving throw or dodge check against a blast anywhere.
- **"This benefit" is read as both benefits** (`dodgeBenefitLost`). The sentence follows a paragraph
  that granted two things. The alternative leaves a dying creature, prone at 0 hit points, still
  imposing disadvantage on everyone attacking it.
- **"Cannot spend AP to move" is Grappled or Restrained, and nothing else.** Grappled is that phrase
  verbatim (pg 134); Restrained is "cannot move" (pg 135). Notably **not** Prone: a prone creature's
  "only movement option is to crawl" (pg 135), which is still movement — and crawling has no printed
  rate or AP cost anywhere, a gap the roadmap already records.
- The 15-foot reactive move is **free** — no AP is priced for it, in a chapter where movement costs
  1 AP per 5 feet. Three free steps, and the half of this action nobody remembers, so it is a control.

## 3.2 Shove (4 AP, pg 127) — the last opposed roll in the book

> **Shove.** You knock a target prone or push it away from you. The target must be no more than one
> size larger than you and must be within your reach. Instead of making an attack roll, you make an
> Unarmed check contested by the target's Unarmed check or Agility check (the target chooses the
> ability to use). If you win the contest, you either knock the target prone or push it 5 feet away
> from you.

- **v2.1 rewrote Grapple and Escape into flat DCs and left this one contested.** It is now the only
  action in the chapter where both sides roll — and, as a direct consequence of not being rewritten,
  **the only one of the three without the "If you succeed or roll a 20" rider.** Preserved as
  printed: reading the rider across would be inventing the clause the rewrite chose not to grant.
- **A tie is a loss for the shover** — "if you *win* the contest". Close to printed rather than ruled.
- **The two sides are different kinds of number, and that is printed.** The shover rolls an Unarmed
  *skill* check (Strength-governed); the target picks between their Unarmed *skill bonus* and their
  raw *Agility modifier*. `bestShoveDefense` pre-selects the larger so a target prompted on somebody
  else's turn is not defended badly by default; the dialog lets them override, which is what the book
  actually grants them.
- **Size and reach are declared.** Nothing in this system records a creature's size, and the book
  prints no size for a player character either — the categories (Large, Huge, Gargantuan) appear only
  in the pg 117-118 falling rules and in creature statblocks. There is no field to check and no
  printed value to check against.
- **A push moves nobody.** Which direction 5 feet goes is the map's answer, not the sheet's.

## 3.3 Take Cover (3 AP, pg 127)

> **Take Cover.** If you only have three quarters or half cover, you can spend 3 AP to squat, kneel,
> or duck into cover to gain full cover. If you attack while taking cover, you no longer have full
> cover.

`TAKE_COVER_AP`, `canTakeCover` and `coverAfterTakingCover` have existed in `src/rules/cover.ts` since
the cover chapter shipped, with a docstring saying they were built for whoever wired this action.
`takeCover()` is that caller and restates none of the arithmetic.

The upgrade matters more than a +5 AC: full cover means "can't be targeted directly by an attack"
(pg 130), and `rollAttack` already refuses such an attack before ammunition is spent. Ends on the
trigger the rule names, which is `endBlocking`'s shape exactly.

## 3.4 Stand up from Prone (5 AP), Stow (3 AP), Equip (3 AP)

> **Stand up from Prone.** You stand back up from being prone.
> **Stow a weapon.** You take a weapon you are holding and put it into your inventory.
> **Equip a weapon.** You take a weapon within reach and prepare to attack with it with any hands you
> have free. If you have a weapon in your hands already and have not stowed it, you drop it on the
> ground.

- Standing up is 5 AP against Move 5 feet's 1, which is worth noticing at the table.
- **Equip's drop clause is reported, never applied.** It needs to know how many hands are free, and
  **there is no hands resource in this system or in the book**: 136 pages never say how many hands a
  creature has, never say a Two Handed weapon occupies two, and the v2.1 free-hand reload requirement
  hit the identical wall and was reported for the identical reason. `weaponsDroppedByEquipping`
  computes the list the printed sentence would drop and the chat card names it.

---

# SECTION 4 — Passive Sneak (pg 116), the second consumer of Group Sneak

The Travel Pace table, read from pg 116:

| Speed | Distance | Passive Sneak | Effect |
|---|---|---|---|
| Slow | 18 miles (2.25 mph) | **15** + Average Group Sneak Bonus | Advantage on Combat Sequence rolls |
| Normal | 24 miles (3 mph) | **12** + Average Group Sneak Bonus | — |
| Fast | 30 miles (3.75 mph) | **10** + Average Group Sneak Bonus | Disadvantage on Combat Sequence rolls |

> **Passive Sneak.** Depending on the character's speed while traveling, they can move through the
> wasteland unnoticed. … Creatures whose passive sense is lower than their score cannot detect the
> party while they travel unless (to GM's discretion) the party blows their cover by entering combat,
> making lots of noise, or becoming obvious to their surroundings.

**Only the detection half is implemented here** (`passiveSneak`, `travelsUndetectedBy`, and a
read-only table on the stealth panel). Distance, the travel-limit fatigue rule, and each pace's
advantage or disadvantage on Combat Sequence belong to the Movement chapter and are deliberately left
to it — flagged as a possible overlap in the change report.

Note the table says Group Sneak **bonus** where pg 4 step 15 and pg 24 both say *modifier*. That is
the slip `groupSneak()` in `src/rules/formulas.ts` already ruled on, in the direction it chose; this
table is the printing that agrees with the existing code.

---

# SECTION 5 — Rejections

Extracted, understood, and deliberately **not** built:

1. **Surprise's AP and reaction ban.** Nothing in this system gates AP spending or models reactions;
   Frightened-Freeze is the precedent. Printed on the card, enforced nowhere.
2. **The Dodge disadvantage as an Active Effect.** It belongs on an attack roll made from a different
   sheet. Declared, like cover. One field on `AttackOptions` would automate it — reported.
3. **Take Cover as an automatic AC/targeting change.** Same reason: cover is declared per attack in
   this system by design.
4. **Equip's "you drop it on the ground".** No hands resource exists in the system or the book.
   Computed and named on the card; never applied.
5. **The 5-foot push moving a token.** Direction is a map question.
6. **Extending pg 127's "no longer within full cover" to cover heavy obscurement.** §1.4 — the gap is
   printed and is reported instead.
7. **A `hidden` or `surprised` token status.** `src/fallout.ts` is not this work's to edit; the
   markers are Active Effects with their own names and icons. Reported as a one-line addition.
8. **Travel pace distance, fatigue and the Combat Sequence rider** (pg 116). Movement chapter.
9. **The Cowboy perk's "if you attack and hit a surprised creature … the attack critically hits"**
   (pg 34). Now newly *checkable* — the Surprise marker exists — but it is
   gated on three named weapon families and lives in the perks pack, which this brief does not own.
   Reported as newly automatable.
10. **Nose for Trouble** (pg 38): "If a creature rolls a sneak ability check against your passive
    sense and succeeds by 5 or less, you are aware of the presence but are unable to detect the
    location"; "you are always aware if you have failed a sneak check to hide". Both are now
    computable from `hideOutcomes` — a margin and a failure flag — and both are perk-pack text.
    Reported.
11. **Shadowed** (pg 135): "you cannot be detected via sight from creatures who do not have night
    vision". Night vision is not modelled anywhere in this system (roadmap D3: vision and light).
12. **The "Unseen Attackers and Targets" section itself.** It does not exist; nothing was invented to
    fill it. §1.1 reassembles the two benefits that do print, and claims no third.
