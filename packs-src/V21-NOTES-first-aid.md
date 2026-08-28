# V2.1 extraction — Medicine-skill first aid (pg 21, 23, 131)

Covers ROADMAP D3 "Medicine-skill first aid (end Bleeding, stabilise the dying)" and closes
the D1 item 5 ruling debt.

Sources read: printed book pg 21, 23, 131 by `pdftotext -layout` **and** as 150 dpi page
images (`pdftoppm`), because the roadmap's working agreement requires the visual read. Both
passages are running prose, not tables, and the layout extraction matched the images
character for character — no column misalignment to correct. Also read: pg 86-87 (the
Medicine equipment entries), pg 61 (Revitalizing), pg 128-129 (severe injuries), pg 133
(the Bleeding condition), pg 38-39 (the perks that touch first aid), and the v2.1 patch
notes.

---

## 1. THE RULING — the DC to stabilise a dying creature

### 1.1 What is printed, verbatim

**Printing A — pg 131**, combat chapter, under its own bold heading *Stabilizing a Creature*,
sitting between *Damage at 0 Hit Points* and *Enemies and Death*:

> **Stabilizing a Creature.** The best way to save a creature with 0 hit points is to heal
> it. If healing is unavailable, the creature can at least be stabilized so that it isn't
> killed by a failed death saving throw. You can use 6 AP to administer first aid to a dying
> creature, roll a Medicine skill check with the DC equal to 10 - the creature's Endurance
> modifier. On a success, the creature returns to 1 hit point.

**Printing B — pg 21**, inside the *Medicine (skill)* blurb in the **Perception** ability
chapter:

> If another character is dying and has not failed all of their Death Saves, you can (at GM's
> discretion) spend 6 AP to make a Medicine check with the DC being 10 + their failed Death
> Saves and - their successful Death Saves. On a success the creature gains 1 hit point.

**Printing B again — pg 23**, the *Medicine (skill)* blurb in the **Intelligence** ability
chapter, reprinted because Medicine is dual-governed. One word differs:

> If another character is **unconscious** and has not failed all of their Death Saves, you can
> (at GM's discretion) spend 6 AP to make a Medicine check with the DC being 10 + their failed
> Death Saves and - their successful Death Saves. On a success the creature gains 1 hit point.

These are two mechanics, not a rounding difference. A's DC is fixed by how tough the patient
is (range 14 down to −5, since the Endurance modifier is `score − 5` and creature scores run
to 20). B's DC rises as the patient dies (practical range 10 to 14) — a designed death
spiral. On a typical PC they will rarely agree.

### 1.2 The ruling

**Pg 131 governs. `DC = 10 − the creature's Endurance modifier`.**

Implemented at `stabilizeDC()` in `src/rules/first-aid.ts`, where the full reasoning is the
function's docstring.

### 1.3 Why

**1. The patch notes do not decide it.** The standing first precedence rule — the printed book
beats the patch notes — has nothing to act on. An exhaustive grep of *Patch Notes: Fallout
2.1.pdf* for `stabil`, `first aid`, `bleeding`, `medicine`, `death save` and `dying` returns
exactly two hits, neither of them this rule: Human Tenacity (fourth death save) and the new
Short Circuit condition. Stabilising was not touched in v2.1. The book decides alone.

**2. The dedicated chapter beats the summary page — this project's own precedent, applied
twice, both times against the ability-score chapter.** From
`packs-src/V21-NOTES-stamina-terrain.md`:

- **C1**, rest timings, pg 24 vs pg 119: *"pg 119 is the operative rule — it is the dedicated
  Resting section… pg 24 reads as a stale one-paragraph summary in the ability-score chapter,
  carrying the pre-rework numbers."*
- **C14**, optional vs mandatory stamina absorption, pg 24 vs pg 130: *"pg 130 is the combat
  chapter and should govern."*

Pg 21 and pg 23 are ability-score chapter skill blurbs — character-creation summary material,
the same category that lost both earlier arguments. Pg 131 is the combat chapter, under a
heading of its own, embedded in the rules that define the dying condition, death saves, damage
at 0 hit points and instant death. Ruling for B here would break a precedent this project has
already relied on twice.

**3. The summary text is demonstrably stale, because it has drifted from itself.** Printing B
appears twice and the two copies do not match: pg 21 says *dying*, pg 23 says *unconscious*.
The book never defines "unconscious" as a distinct hit-point state with its own rule — pg 131
uses the two words interchangeably ("either die outright or fall unconscious"). A duplicated
blurb that has already diverged from its own duplicate is exactly the shape of text that was
not updated when the mechanic changed.

**4. Pg 131 is the passage the rest of the book behaves as though it means.** Every other
6-AP route to a dying creature's first hit point — the First Aid Kit and Doctor's Bag *Pain
Killer* action (pg 86), the *Revitalizing* weapon property (pg 61) — is written in pg 131's
idiom: 6 AP, one hit point, no reference to death-save tallies. Nothing anywhere else in the
book reads the tallies as an input to anything except death itself.

### 1.4 Keeping the inconsistency visible

Per house style the contradiction is not smoothed away. Three places carry it:

- `stabilizeDC()`'s docstring quotes both printings in full and states the ruling.
- `summaryStabilizeDC(failures, successes)` — the **rejected** pg 21/23 formula — is
  implemented and exported, not deleted.
- **The chat card prints both numbers at the table.** Every stabilise attempt says what pg
  21/23 would have asked for and why the code asked for something else
  (`FALLOUT.FirstAid.otherPrinting`). A GM who reads pg 21 finds out from the card, not from a
  surprise.

### 1.5 What the ruling does *not* settle, and what was done instead

- **No floor or cap on the DC.** Nothing is clamped. A creature with an Endurance score of 15+
  yields a DC of 0 or below; the book prints no floor, and inventing one would be inventing a
  rule. No skill check in this system auto-fails on a natural 1 (only attacks and death saves
  do), so a DC of 1 or less is a formality. Stated in the docstring; not enforced.
- **Failure has no printed consequence** and no printed limit on retrying, so the action is
  repeatable and costs nothing but the AP. Same reading `repairItem` takes of the same
  silence.
- **The "(at GM's discretion)" clause** of pg 21/23 is not modelled — a GM who does not want
  the attempt made does not let it be made. The card mentions the clause exists.

---

## 2. THE RULES AS EXTRACTED

### 2.1 End the Bleeding condition — pg 21, pg 23

Printed identically in both ability chapters, word for word, and **contradicted nowhere**. Pg
131 says nothing about bleeding, so unlike its neighbouring sentence this one has no
competing printing and the summary page is the only source. No ruling attached.

> If you are within 5 feet of a creature with the bleeding condition, you can spend 6 AP, use
> 1 cloth junk item, and succeed a DC 15 Medicine skill check to end the condition.

| Element | Value | Cite |
|---|---|---|
| AP | 6 | pg 21, 23 |
| Skill | Medicine | pg 21, 23 |
| Governing ability | Perception, or Intelligence by the alternate (already modelled) | pg 21, 23 |
| DC | flat 15 | pg 21, 23 |
| Range | within 5 feet | pg 21, 23 |
| Item | 1 cloth junk item | pg 21, 23 |
| Success | **ends the condition** — every level, not one | pg 21, 23 |
| Failure | not stated → nothing happens | — |
| Repeatable | not forbidden → yes | — |

### 2.2 Stabilise a dying creature — pg 131 (ruling §1)

| Element | Value | Cite |
|---|---|---|
| AP | 6 | pg 131 (and pg 21, 23 — the one number all three agree on) |
| Skill | Medicine | all three |
| DC | 10 − the **creature's** Endurance modifier | pg 131 (**ruled**, §1) |
| Range | not stated on pg 131; pg 21/23 state 5 ft for the bleeding half only | — |
| Item | **none** | pg 131 |
| Success | the creature returns to 1 hit point | pg 131 (pg 21/23: "gains 1 hit point" — same outcome from 0) |
| Gate | not dead (see §3.4) | pg 131 / pg 21, 23 |
| Failure | not stated → nothing happens; repeatable | — |

**What the success does to the sheet.** HP to 1, and **both death-save tallies cleared**. The
clearing is an inference and is labelled as one on the card: neither printing mentions the
tallies. But at 1 hit point the creature is no longer dying, and leaving a stale failure count
would carry it silently into the next time the creature drops. The book's own comparable
outcome does the same — three successful death saves also end at 1 hit point (pg 131), and
`rollDeathSave` already zeroes both there. Consistency with the existing path, not a printed
rule.

### 2.3 What first aid needs in the way of equipment — checked, answer is "nothing"

The brief asked whether a stimpak or doctor's bag is required. **Neither action requires any
medical item.** The equipment chapter (pg 86-87) makes them *alternatives* to the Medicine
check, not prerequisites for it:

- **First Aid Kit** (80c, load 4, pg 86) — choose one of *Tourniquet* (6 AP, remove up to two
  levels of bleeding), *Pain Killer* (6 AP, heal a dying creature 1 hit point), *Stitch
  Wounds* (10 minutes, `2 × healing rate + your Medicine skill bonus` hit points). "After you
  have used one of these actions, the first aid kit's supplies are used and it no longer
  functions." **No check for any of them.**
- **Doctor's Bag** (300c, load 15, pg 86) — same three actions, same no-check. Also the only
  thing that removes the *Severed Arm/Hand* severe injury (pg 128).

The only item either Medicine action names is **1 cloth junk item** for the bleeding half.

### 2.4 The Medicine check is the *worst* of the four routes

Worth flagging for whoever wires the sheet, because a player will ask. Four things give a
dying creature 1 hit point for 6 AP:

| Route | Cost | Check? | Cite |
|---|---|---|---|
| Medicine first aid | 6 AP | **yes**, DC 10 − END mod | pg 131 |
| First Aid Kit — Pain Killer | 6 AP + consumes the kit | no | pg 86 |
| Doctor's Bag — Pain Killer | 6 AP | no | pg 86 |
| Revitalizing weapon property | 6 AP | no | pg 61 |

And for bleeding: the Medicine check (6 AP + cloth + DC 15) removes **all** levels; the
Tourniquet (6 AP, no check) removes **two**. So the check is strictly better only on a target
bleeding three or more. Both asymmetries are the book's; nothing here evens them out.

---

## 3. CONTRADICTIONS AND SILENCES

**F1 — Two DCs for stabilising (pg 21/23 vs pg 131).** The headline. Settled in §1.

**F2 — Pg 21 and pg 23 print the same paragraph differently.** "dying" vs "unconscious". The
book defines the dying condition (0 hit points, pg 21 and pg 131) and never defines
unconscious as a separate hit-point state; pg 131 uses the words interchangeably in one
sentence. Read as the same state — 0 hit points is the whole test (`isDying`).

**F3 — Pg 131's heading and its own rule disagree.** The prose describes the D&D notion of
stabilising: *"the creature can at least be stabilized so that it isn't killed by a failed
death saving throw"* — i.e. still at 0 hit points, just off the clock. The very next sentence
hands back 1 hit point, which ends the dying condition outright and is not stabilising at all.
**The operative sentence is the one with numbers in it**; the code heals to 1. Commented at
`stabilizeCreature`.

**F4 — Does stabilising trigger the pg 133 bleeding redirect?** Pg 133: *"If a creature who has
any levels of bleeding is healed, they do not gain any hit points, instead they remove two
levels of bleeding."* Read literally against pg 131's "returns to 1 hit point", stabilising a
bleeding creature would leave it at 0, still dying — useless against precisely the condition
that most often kills a dying creature, since pg 133 also says *"A dying creature with any
levels of this condition fails a death save at the start of their turns."*

**Ruled: the redirect does not fire.** Pg 131 sets stabilising *against* healing in its own
opening sentence — *"The best way to save a creature with 0 hit points is to heal it. **If
healing is unavailable**, the creature can at least be stabilized"* — so the book itself
treats them as different acts in the paragraph that defines the action. This is an inference
from that contrast, not a printed exclusion, so it is **stated on the chat card** whenever the
patient is bleeding, with the invitation to overrule. This is the single most arguable call in
this work.

**F5 — Pg 131 gives stabilising no range.** The bleeding half says "within 5 feet"; the
stabilise half says nothing. Not invented. (Nothing in this system consults token positions
anyway — the pg 21 range bands are unenforced for the same reason, ROADMAP D3.)

**F6 — "1 cloth junk item" cannot be enforced.** There is no junk in this system: the shipped
item types are weapon / armor / ammo / aid / perk / trait / gear, and no pack ships a junk
document. Junk exists only as strings inside crafting descriptions ("x2 lead and x1 cloth",
"5 circuitry junk items"). Reported on the card, not consumed. **This rule should start
consuming cloth the day crafting lands** (ROADMAP D3 — the blueprint materials are already
extracted and then dropped by `scripts/build-packs.mjs`).

**F7 — Whether a failed check costs the cloth is not stated.** Nothing is consumed either way
today, so nothing was decided.

**F8 — Pg 21 refers to a "First Aid perk" that does not exist.** *"You heal a number of hit
points equal to your Healing Rate whenever you rest for 8 hours, eat certain foods, use the
First Aid perk, a stimpak, or RobCo Quick Fix-It."* No perk of that name is in the 186-perk
extraction. The nearest are **Efficient Diagnosis** (pg 38, +2 HP when you use a stimpak,
first aid kit or doctor's bag on another creature) and **Medicinal Master** (pg 39). A dangling
reference; nothing built on it.

**F9 — Pg 21/23's gate is vacuous.** "has not failed all of their Death Saves" — a creature
that has failed all of them is dead (pg 131; four rather than three for a Human's Tenacity,
pg 8), and nothing brings the dead back with a Medicine check. The gate is the same test as
"is dying and not yet dead" under either printing, which is what `canStabilize` implements.

**F10 — Medicine's default governing ability is circular.** Pg 21: *"You can optionally choose
for your Medicine skill to be modified by your **Perception** modifier instead of
Intelligence."* Pg 23: *"…by your **Intelligence** modifier instead of Perception."* Each
chapter names itself as the alternative, so the book never states the default. Already settled
in this system (`medicine: { ability: "perception", altAbility: "intelligence" }`,
`src/rules/constants.ts`) and left alone — noting it only because both stabilise printings
sit inside that same paragraph.

---

## 4. EXPLICIT REJECTION LIST

Considered and **deliberately excluded**:

1. **The pg 21/23 stabilise DC (`10 + failed − successful death saves`)** as the operative
   rule. Rejected under the dedicated-chapter precedent (§1.3). *Not deleted* — implemented as
   `summaryStabilizeDC` and printed on every card.
2. **Splitting the difference / averaging the two DCs, or taking the lower.** Both are printed
   rules; a third number is in neither.
3. **Making stabilising leave the creature at 0 HP but off the death-save clock** (the D&D
   reading the pg 131 *heading* suggests). Rejected: the sentence with the numbers says 1 hit
   point. See F3.
4. **Applying the pg 133 bleeding redirect to stabilising.** Rejected on pg 131's own
   healing/stabilising contrast; surfaced as a card note instead. See F4.
5. **Auto-fail on a natural 1.** No skill check in this system carries one; only attacks
   (pg 128) and death saves (pg 131) do. Not invented to plug the DC ≤ 1 hole.
6. **Clamping the stabilise DC to a minimum.** No floor is printed. Left as computed.
7. **Consuming a cloth junk item.** Nothing to consume (F6). Reported.
8. **Deducting the 6 AP.** ROADMAP item 14: AP is spent by hand until a confirmation path
   exists. Reported on the card.
9. **Enforcing the 5-foot range.** Nothing in this system knows where tokens are.
10. **The First Aid Kit / Doctor's Bag *Pain Killer* and *Tourniquet* actions (pg 86).**
    Item-driven, no check, and they belong to the aid pipeline (`src/actions/use-aid.ts`),
    not here. Named in the localized hints so the sheet can tell a player the cheaper option
    exists. **Currently unwired anywhere** — see §5.
11. **The *Revitalizing* weapon property (pg 61)** — 6 AP, no check, 1 hit point to a dying
    creature. A weapon keyword; belongs with `src/rules/weapons.ts`, not first aid.
12. **The Doctor's Bag removing the Severed Arm/Hand severe injury (pg 128).** Real, cited,
    and out of scope — severe injuries are `src/combat/damage.ts`.
13. **Efficient Diagnosis (pg 38) and Medicinal Master (pg 39).** Both key off *items*
    ("stimpak, first aid kit, or doctor's bag"), not off the Medicine check, so neither
    modifies either action here.
14. **Auto-clearing Bleeding when a creature is healed by other means (pg 133's two-level
    redirect).** That belongs at the healing choke point (`src/actions/healing.ts` /
    `useAid`), not in first aid. **It is not implemented anywhere today** — see §5.
15. **Modelling "(at GM's discretion)".** A permission, not a mechanic.

---

## 5. WHAT THIS LEAVES OPEN FOR SOMEONE ELSE

- **`rolls.ts` needs a shared `rollSkillCheck(actor, system, skill, dc)` that returns
  success.** `medicineCheck` here builds its d20 inline the way `repairItem` does, which means
  **advantage and disadvantage do not reach either of these checks** — `effectiveMode` is
  private to `src/dice/rolls.ts`. Duplicating it would give the system two answers to one
  question, so it was not duplicated. `repairItem` has the identical gap.
- **The pg 133 bleeding-healing redirect is unimplemented system-wide** — "a bleeding creature
  that is healed gains no hit points and sheds two levels of bleeding instead" is honoured by
  nothing in `useAid`, `restoreStamina` or the stimpak path. Surfaced by this work; belongs at
  the healing gate.
- **Junk items do not exist** (F6), so the cloth requirement can only ever be reported until
  crafting lands.
- **The First Aid Kit and Doctor's Bag actions (pg 86) are unwired.** Their three actions are
  description text on the pack items; nothing spends 6 AP for a Tourniquet or a Pain Killer.
