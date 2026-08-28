# V2.1 Rules Extraction — Grapple, Escape, Help, Ready, Unarmed Strike

Source of truth: `FALLOUT TTRPG 2.1.pdf` (136 pp). PDF page N == printed page N (verified 1:1).
Patch notes consulted only as corroboration; **the printed book governs**, and it overruled them
twice below (§3.1, §3.6).

Pages read: **125–128** (the actions and attacks), **133–135** (conditions), **52** (Holey Moley),
**58** (Power Armor dead core), **61** (Clasp), **80–81** (bear trap, rope), **36–37** (Stonewall,
Don't Fence Me In). The pg 126 **Actions in Combat** AP table was read as a rendered page image at
150 dpi, not from layout extraction, per the working agreement; pg 127 was rendered as well, because
the Help / Ready / Unarmed Strike paragraphs are the headline claims of this whole brief and sit in
a two-column flow.

Code: `src/rules/grapple.ts` (pure), `src/actions/combat-actions.ts` (documents),
AP constants in `src/rules/constants.ts`.

---

## 1. The pg 126 AP table — verbatim, read visually

| Action | AP Cost |
|---|---|
| Attack | Dependant on the weapon. |
| Dodge | 6 AP |
| Equip a weapon | 3 AP |
| **Escape** | **5 AP** |
| **Grapple** | **3 AP** |
| **Help** | **6 AP** |
| Hide | 6 AP |
| Interact with an object. | 3 AP |
| Move 5 feet. | 1 AP |
| **Ready** | **+2 AP** |
| Reload | 6 AP |
| Search | 3 AP |
| Shove | 4 AP |
| Sprint | 5 AP |
| Stand up from Prone | 5 AP |
| Stow an weapon | 3 AP |
| Take Cover | 3 AP |
| **Unarmed Strike.** | **3 AP** |
| Use a Chem | 4 AP |

This matches `docs/rules-v2.1-combat.md` §1.5 exactly, and matches v2.0's table row for row.
**Ready is the only row printed as a surcharge** (`+2 AP`) rather than a cost, which is what the
prose confirms: "spend the necessary AP with an additional 2 AP".

---

## 2. The rules, verbatim

### 2.1 Grapple (pg 126)

> **Grapple.** You use your appendages to hold someone in place. When you attempt to grapple another
> creature you make an Unarmed skill check with the DC equal to 10 + the creature's Unarmed skill. If
> you succeed or roll a 20, the creature is grappled.

### 2.2 Escape (pg 126) — renamed this edition

> **Escape.** You attempt to free yourself from a grapple, restrain, or chokehold. You must succeed a
> Unarmed skill check with the DC equal to 10 + the creature's Unarmed skill. If you succeed or roll a
> 20, you escape.

v2.0 pg 128 called this **"Escape a Grapple"** and resolved both actions as *opposed* rolls
(grappler's Strength vs the target's Strength **or** Agility). **v2.1 deletes the contest entirely.**
Only one creature rolls; the other side is a static DC. That is the single biggest change here and
the reason one function serves both directions.

### 2.3 Grappled (pg 134) — the whole condition

> **Grappled.** A grappled creature cannot spend AP to move.

One sentence. Unchanged from v2.0.

### 2.4 Restrained (pg 135) — a separate condition Escape also ends

> **Restrained.** A restrained creature cannot move. When a restrained creature takes damage it cannot
> be subtracted from their stamina points.

### 2.5 Help (pg 127)

> **Help.** You can lend your aid to another creature in the completion of a task. When you use your AP
> to Help, the creature you aid gains a bonus to their next ability check equal to half your bonus
> (rounded down) in the related skill. Alternatively, you can aid a friendly creature in attacking a
> creature within 5 feet of you. You feint, distract the target, or in some other way team up to make
> your ally's attack more effective. If your ally attacks the target before your next turn, the first
> attack roll is made with advantage.

v2.0's first branch granted flat **advantage**. The second (attack-aid) branch is **verbatim
identical between editions** — it still grants advantage, and was not changed.

### 2.6 Ready (pg 126)

> **Ready.** You prepare an action with a trigger. You must specify what the trigger is and spend the
> necessary AP with an additional 2 AP. When the trigger occurs, you may perform the action. If the
> trigger never occurs, you do not perform the action and instead you may recycle half the total amount
> of AP used at the start of your next turn.

v2.0 pg 128 ended: *"nor do you regain the AP if the trigger never occurs."* The refund is new.

### 2.7 Unarmed Strike (pg 126, 127)

> **Unarmed Strike.** You punch, kick, jab, slap, or perform any kind of attack to another creature
> within 5 feet of you.

> **Unarmed Attacks.** It costs 3 AP to make an unarmed strike. Alternatively, you can make two unarmed
> strikes by spending 5 AP. Unarmed strikes deal 1d4 + your Strength or Agility modifier in bludgeoning
> damage.

The middle sentence is the v2.1 addition; the rest is v2.0 verbatim.

### 2.8 Frightened — Freeze (pg 134)

> **Frightened - Freeze.** A creature with this condition cannot spend any AP on their turn, except to
> ready, while the source of their fear is within sight. They can still recycle what they don't use.

---

## 3. Contradictions, silences and rulings

Every ruling below is commented at the code that makes it, and none of them is presented as printed.

### 3.1 Help: the patch notes are wrong about *what* is halved

The patch note says Help adds **half the helper's ability modifier**. The printed book says
**"half your bonus (rounded down) in the related skill"** — a *skill bonus*, which in this system is
ability modifier + invested points + background + half-Luck, and is therefore usually much larger.
**Implemented as printed.** `helpBonus()` halves the skill bonus.

### 3.2 Help: "their next ability check", paid for out of a *skill* bonus

The sentence mixes vocabularies — the helper contributes a skill bonus, the recipient spends it on an
"ability check". The book never reconciles them. The bonus is written to `system.bonuses.d20`, which
reaches every d20, because nothing narrower exists in this system and inventing an "ability checks
only" bonus key would be a schema change on a distinction the book does not maintain elsewhere.
Because the effect is consumed by the *next* roll, the two readings only diverge if the aided creature
rolls something unrelated first — which is why `consumeHelp` announces what it spent.

### 3.3 Help: a negative helper makes their ally worse

`floor(-3 / 2) = -2`. The book prints no floor and Help is voluntary, so a helper with a negative skill
bonus hands their ally a penalty. Kept as printed — the same stance `blocking.ts` takes on a negative
Endurance modifier. A rule silently repaired is a rule the GM can no longer see.

### 3.4 "the creature's Unarmed **skill**" — bonus, not score

The book has no "skill score" anywhere; a skill is a bonus, computed at pg 4 step 5. It prints the
identical construction explicitly elsewhere: pg 134's frightened DC is *"8 + the Intimidation skill
**bonus** of the frightening creature"*. **Ruling: skill bonus.** Any other reading leaves the DC
formula with no defined input.

### 3.5 "or roll a 20" — with no matching natural 1

Both actions grant automatic success on a raw 20. Neither prints an automatic failure on a raw 1. The
nat-1 rule in this chapter is written for attack rolls only — pg 128: *"When you make an **attack roll**
… and the result of the d20 is a 1, you automatically miss and the weapon you attacked with gains one
level of decay"* — and Grapple and Escape are explicitly *skill checks*, not attacks. **Implemented as
printed: no auto-fail.** Asserted in the smoke fragment so it stays deliberate.

### 3.6 Head-shot AP and robot targeted-attack resistance

Re-confirmed while in this chapter, both already settled in the roadmap: pg 129 prints head **+3** (the
patch note is backwards), and pg 9's Severed Limbs contains **no** targeted-attack resistance sentence.
Nothing here changes either.

### 3.7 Grapple: what the book does *not* say

- **Nothing ends a grapple except Escape.** Not the grappler moving, being knocked out, dying, or
  going unconscious. No maintenance cost, no re-check. So nothing in the code ends it either — the
  status stays until an Escape lands or a person clicks it off. This is also what keeps the
  implementation out of a document hook: there is no event to watch, because the book names none.
- **No size limit.** Shove one line below has one ("no more than one size larger than you") and Clasp
  (pg 61) has one; Grapple has none. Not added.
- **No requirement that the grappler be unarmed or have a free hand.** "You use your appendages" is
  the whole requirement. Not added. (Contrast pg 126's Reload, which *does* now demand a free hand.)
- **No limit on how many creatures one grappler holds**, and no rule for grappling a creature that is
  already grappled by someone else. The `grappledBy` flag holds one record and the newest Grapple
  overwrites it; that is a storage decision, not a rule.

### 3.8 Escape against something that is not a creature

Escape covers "a grapple, **restrain, or chokehold**", but prices its DC off "the creature's Unarmed
skill". A bear trap has no Unarmed skill. The book's own answer is a bespoke DC per object — pg 80:
*"You can attempt to pry open a triggered bear trap with 6 AP and a Strength ability check equal to
15"*; pg 81's rope has AC/DT/HP and is attacked rather than escaped. **Ruling: with no grappler
recorded and no DC supplied, `escapeGrapple` refuses and says so** rather than inventing a general
object DC.

### 3.9 Clasp (pg 61) was not re-cut when Escape changed

> **Clasp.** When you deal damage to a creature's hit points with a weapon that has this property, the
> weapon clamps onto them and renders them unable to move away from you. The creature becomes grappled
> by you and any **Strength or Agility ability checks** made to escape this grapple have disadvantage.
> If the grappled creature is one size category larger than you, they are not grappled unless your
> Strength ability score is equal to 10. A creature two size categories, or larger, than you cannot be
> grappled in this way.

"Strength or Agility ability checks" is **v2.0's Escape**. pg 126 made Escape an Unarmed *skill* check
this edition and pg 61 still describes the old one. **Ruling: Clasp's disadvantage attaches to the
Escape action whatever it rolls** — the only reading under which the property still does anything.
Exposed as `escapeGrapple(..., { clasp: true })`. The size clauses are Clasp's own and are *not*
generalised to the Grapple action.

### 3.10 Stonewall and Don't Fence Me In have the same drift

- **Stonewall** (pg 36): *"whenever you roll a Strength or Ability check to resist being grappled,
  restrained, or knocked prone; you have advantage or you may flip one of your Karma Caps to
  automatically succeed."*
- **Don't Fence Me In** (pg 36): *"You can spend 3 AP to Escape grapples, restraints, or chokeholds and
  you always have advantage on the roll."*

Both describe the roll in v2.0's vocabulary. This is exactly why `check:resistGrapple` is a **named
check** scope rather than an ability category: it grants on the Escape *action*, immune to which
ability the action happens to roll. `escapeGrapple` consults it — the first thing in this system ever
to consult that scope. Don't Fence Me In's 3 AP is a cost, and AP is reported rather than charged
(roadmap item 14), so it is a table-side adjustment.

### 3.11 Ready: "half the total amount of AP used"

- **"Total" is read as the whole Ready cost** — the readied action's own AP plus the 2 AP surcharge —
  because that is what the reader just spent and the sentence names no smaller part.
- **Rounded down.** The sentence does not say. The Recycling Action Points rule two columns earlier on
  the *same page* halves 4 into 2, and the book floors every other halving it prints.
- **"You *may* recycle"** — optional, which is one more reason this is a button and not a hook.

### 3.12 Ready + Dazed

pg 133: *"A dazed creature's maximum AP is reduced by 3 and they cannot recycle AP."* Flat, no
exceptions. pg 126 calls Ready's refund a recycle. Neither rule cites the other. **Ruling: Dazed
blocks the Ready refund**, which is the reading that leaves both sentences meaning something.
`src/combat/turns.ts` already gates the ordinary leftover-AP recycle on Dazed the same way.

### 3.13 Ready's refund and the existing recycle pool

The refund pays out "at the start of your next turn", which is exactly when `src/combat/turns.ts`
hands back `system.resources.ap.recycled`. So `lapseReady` **adds** to that field rather than setting
it. Consequence, documented at the function: the end-of-turn hook *writes* that field with the
ordinary leftover-AP recycle, so declaring a lapsed Ready before your turn ends will be overwritten.
Declaring it after your turn has ended — which is also the only moment you can honestly know the
trigger never came — banks both. Fixing this properly means `endTurn` adding rather than assigning,
which is a change to a file this work does not own (see §5).

### 3.14 Unarmed strike: no crit chance, and no weapon to decay

- **Critical hits** are defined only off "the weapon's table" (pg 127) and bare hands are not in it.
  There is no general d20 crit rule to fall back on. **Ruling: a raw 20 is announced on the card and
  the table decides**; nothing here multiplies damage or forces a hit. (Note this also means the
  half-Luck crit-chance reduction has nothing to apply to.)
- **Critical failure** is *"you automatically miss and the weapon you attacked with gains one level of
  decay"*. The miss applies; the decay has nothing to land on. Implemented as a miss with no decay.

### 3.15 Unarmed strike: "Strength **or** Agility modifier", chooser unnamed

Every other either/or in the book that does name a chooser hands it to the creature rolling — the
frightened check's Endurance or Charisma (pg 134), the death save's Luck or Endurance (pg 25), Shove's
contested ability ("the target chooses the ability to use", pg 127). **Default: the better of the
two**, overridable by the caller. Nothing is decided that a player could not decide.

### 3.16 Unarmed strike: three strikes, and Holey Moley

The book prices exactly two bundles: 3 AP for one, 5 AP for two. There is no general "each extra
strike costs 2 AP" rule, so **three strikes returns null rather than an extrapolated price**.

The one place the book stacks strikes past two is **Holey Moley** (pg 52, Ghoul): *"Once per turn, when
you make an unarmed attack, you can spend 1 AP to make an additional one. This includes spending 5 AP
to make two unarmed attacks, you can spend 6 AP to make three unarmed attacks."* That worked example
is printed arithmetic, not an inference, and it is why `unarmedStrikeApCost` takes an `extraStrike`
flag on the paid bundle (3+1 = two strikes for 4 AP; 5+1 = three strikes for 6 AP) rather than a
formula.

### 3.17 Frightened — Freeze: wired only as far as it honestly goes

Freeze permits exactly one thing: *"cannot spend any AP on their turn, **except to ready**"*. Two
halves, and only one of them falls out of this work.

**What falls out:** the Ready action now exists, so a frozen character has the action the condition
allows, and `readyAction(..., frozen = true)` prints the pg 134 permission on the card.

**What does not, and why:** Freeze is *not enforced*, and cannot be from here.

1. **Nothing gates AP spending.** AP is spent by hand (roadmap item 14) — no action in this system
   deducts it, so there is no chokepoint at which "you may not spend AP except to ready" could be
   applied. Enforcing Freeze means item 14 landing first.
2. **"while the source of their fear is within sight" is not state.** Nothing in this system records
   *who* frightened a creature, let alone whether they are currently visible. Frightened is a token
   status with no source attached, and `rollFrightenedCheck` takes a DC, not a frightener. Deciding
   Freeze would mean inventing that state.

So: **Freeze remains text-only, and this work did not change that.** It is reported here rather than
quietly left out.

### 3.18 Grappled has no derived effect, and correctly so

pg 134's Grappled is *"cannot spend AP to move"*. This system does not price movement in AP at all —
that is the Foundry movement-hook job in roadmap section A item 3 — so there is no number for the
condition to modify. The token status **is** the implementation, which is the same standing Prone,
Blinded and Deafened already have here. Nothing was added to `system.bonuses` for it, and nothing
should be: a conditional effect cannot be decided in `prepareDerivedData` (see `src/actions/situations.ts`).

### 3.19 The Power Armor dead-core grapple (pg 58)

> …while in this state you are grappled and restrained and you cannot escape unless your Strength score
> is equal to 20.

Unreachable (scores cap at 10; the suit sets 12). Already ruled in the roadmap as reported-not-
automated. **Not touched.** Note the interaction it creates: a character in that state who presses
Escape gets an ordinary Escape roll, because nothing marks the override. Left alone deliberately — it
is a defect in the book that this system does not get to quietly fix.

---

## 4. Rejection list — what was extracted and deliberately NOT implemented

| # | Rule | Page | Why not |
|---|---|---|---|
| 1 | **Frightened — Freeze enforcement** | 134 | Two blockers, §3.17: nothing gates AP spending (roadmap item 14), and "source of fear within sight" is state nothing records. The Ready *permission* is printed on the card; the prohibition is not enforced. |
| 2 | **Grappled's "cannot spend AP to move"** | 134 | §3.18. Movement is not priced in AP anywhere in this system. The status is the whole implementation. |
| 3 | **Restrained status** | 135 | *Resolved after this pass:* Escape ends "a grapple, restrain, or chokehold", and at the time of writing this system registered no `restrained` status for pg 135's condition, so there was nothing for Escape to clear — naming a status id that does not exist would have been worse than the gap. The status is now registered in `src/fallout.ts` and the combat panel displays it, but **`escapeGrapple` still does not clear it**. That remains open. |
| 4 | **Clasp applying a grapple on hit** | 61 | Clasp fires "when you deal damage to a creature's hit points" — a damage-pipeline trigger, and `src/combat/damage.ts` is not this work's file. The *escape* half is implemented (`{ clasp: true }`); the *application* half needs the damage pipeline, exactly as Corrosive did. |
| 5 | **Clasp's size clauses** | 61 | Real, but Clasp-specific, and this system has no creature size field. Not generalised to Grapple, which prints no size limit at all. |
| 6 | **Bear trap / rope / chokehold as grapple sources** | 80, 81 | Each prints its own bespoke DCs and AP costs (trap: 6 AP + STR 15 to pry; rope: has AC/DT/HP and is attacked). They are item rules, not the Escape action, and belong with items. `escapeGrapple` accepts a GM-supplied DC so the table can run them today. |
| 7 | **Rope's "advantage on your Strength ability rolls" while grappling** | 81 | v2.0 vocabulary again — pg 126's Grapple is an Unarmed skill check with no Strength roll in it. Unlike Clasp there is no reading that makes this fire *and* stay printed, and it is an item mechanic besides. Left as item text. |
| 8 | **Don't Fence Me In's 3 AP Escape** | 36 | An AP cost. AP is reported, not charged (roadmap item 14), so the perk is a table-side adjustment. Its *advantage* half is a one-line pack change — see §5. |
| 9 | **Stonewall's "flip a Karma Cap to automatically succeed"** | 36 | No cap-spend workflow exists anywhere in this system; the same gap was reported for tainted food. Its advantage half is a pack change — see §5. |
| 10 | **Holey Moley's "once per turn"** | 52 | Per-turn use counters are state nothing holds. The 4 AP / 6 AP prices are implemented behind an explicit flag the presser sets; the once-per-turn limit is the table's. |
| 11 | **Automatic consumption of a Help** | 127 | The grant is a trigger-expiring effect exactly like a block, but the trigger is a *roll*, and the roll paths live in `src/dice/rolls.ts` — not this work's file. `consumeHelp()` is exported and is a one-line call away from automatic. See §5. |
| 12 | **Ready's "before your next turn" as a duration** | 126 | Making the marker a timed effect would have Foundry expire it silently and eat the refund the rule promises. A pending Ready outlives its window loudly instead. |
| 13 | **Deducting any AP** | 126–127 | Roadmap item 14, project-wide convention. Every action here reports its cost. The single exception is Ready's *refund*, which is the book handing AP back, not this system taking it. |
| 14 | **The Power Armor dead-core escape override** | 58 | §3.19. Already ruled in the roadmap. |
| 15 | **Grapple release on the grappler's death/incapacity/movement** | — | The book names no such trigger. Adding one would be inventing a rule *and* would need the document hook this project has ruled out. |
| 16 | **Shove, Dodge, Take Cover, Hide, Sprint, Stand, Stow/Equip, Search, Interact** | 126–127 | Extracted in passing and out of brief — they are roadmap D3's "other ~14 combat actions". Note for whoever takes them: **Shove is the only action in the chapter that is still an opposed roll** (Unarmed vs the target's Unarmed *or* Agility, target chooses), which makes it the odd one out now that Grapple and Escape are flat DCs. |

---

## 5. Integration required outside this work's files

1. **API exports** (`src/fallout.ts`) — for the sheet and for the smoke fragment:
   `grapple`, `escapeGrapple`, `grappledBy`, `unarmedBonusOf`, `unarmedStrike`, `helpAlly`,
   `consumeHelp`, `pendingHelp`, `readyAction`, `triggerReady`, `lapseReady`, `readiedActions`,
   plus the pure `unarmedContestDC`, `unarmedContestSucceeds`, `helpBonus`, `readyTotalApCost`,
   `readyRecycledAP`, `unarmedStrikeApCost`.
2. **Consume Help from the roll paths** (`src/dice/rolls.ts`) — call `consumeHelp(actor)` at the end of
   `rollSkill`, `rollAbility` and `rollAttack`, the way `endBlocking(actor)` is already called from
   `rollAttack`. Until then Help is spent by a button.
3. **Export the roll plumbing** (`src/dice/rolls.ts`) — `effectiveMode`, `d20Formula`, `d20Modifiers`
   and `keptD20` are module-private, so `combat-actions.ts` restates all four in a marked block.
   Exporting them and deleting that block removes a second copy of the advantage convention.
4. **Localization** — merge `packs-src/fragments/combat-actions.lang.json` under `FALLOUT` in
   `static/lang/en.json`. Five new namespaces (`Grapple`, `Escape`, `Unarmed`, `Help`, `Ready`), no
   existing key touched.
5. **Sheet controls** (`src/sheets/**`, `static/templates/**`) — Grapple (needs a target), Escape,
   Help (needs an ally and, for the check branch, a skill), Ready (needs a trigger string and the
   readied action's AP), Unarmed Strike (1 or 2 strikes). Suggested surfacing: the grappled creature's
   sheet shows `FALLOUT.Grapple.grappledBy` from `grappledBy(actor)`, and a pending Help/Ready shows
   as an effect row already.
6. **Smoke steps** — `packs-src/fragments/combat-actions.smoke.js`, to be pasted after the blocking
   block (it reuses that block's `blade`).
7. **A `restrained` status effect** (`src/fallout.ts` `STATUS_EFFECTS`, `BINARY_CONDITIONS`) — pg 135
   defines the condition, Escape ends it, and this system has neither. Rejection #3.
8. **Two pack changes** (`packs-src/perks.json`) that would make `check:resistGrapple` earn its keep —
   add `{"key": "system.bonuses.advantage.checks.resistGrapple", "mode": "add", "value": 1}` to
   **Stonewall** and to **Don't Fence Me In**. Both are unconditional grants on exactly that check
   (§3.10).

**No new advantage scope and no new bonus key are needed.** `check:resistGrapple` already exists and
is now consulted for the first time; Help's check branch rides `system.bonuses.d20` and its attack
branch rides `system.bonuses.advantage.attack`, both of which exist. Only AP-cost constants were
added: `UNARMED_DOUBLE_STRIKE_AP_COST`, `GRAPPLE_AP_COST`, `ESCAPE_AP_COST`, `HELP_AP_COST`,
`READY_AP_SURCHARGE`.
