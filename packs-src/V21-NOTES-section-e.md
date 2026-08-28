# V2.1 extraction — ROADMAP section E items 1-5 (the dangling ends)

Five things that existed and worked with a known edge left open. Sources read for this work:
printed book **pg 57-59** (Power Armor and the upgrades table), **pg 86** (Medicine equipment),
**pg 126** (Escape), **pg 128-129** (targeted attacks and the severe injuries), **pg 131**
(healing, dying, stabilising), **pg 133** (Bleeding and the conditions list), **pg 135**
(Restrained). Every page by `pdftotext -layout`; **pg 59, 86, 128 and 129 additionally read as
150 dpi page images** (`pdftoppm`), because three of them are tables and pg 86 is the two-column
entry this whole item turns on. The layout extraction and the images agreed everywhere; nothing
had to be corrected from the visual read this time, but the pg 59 and pg 129 tables would not
have been trustworthy without it.

Also read and cross-checked: `packs-src/V21-NOTES-first-aid.md` (which predicted three of these
five), `packs-src/V21-NOTES-power-armor.md`'s upgrade table, and the shipped `aid-med.json`
entries for both kits.

---

## 1. Escape and the Restrained condition (pg 126, 135)

### 1.1 What is printed

**Pg 126**, *Actions in Combat*:

> **Escape.** You attempt to free yourself from a grapple, restrain, or chokehold. You must
> succeed a Unarmed skill check with the DC equal to 10 + the creature's Unarmed skill. If you
> succeed or roll a 20, you escape.

**Pg 135**, the condition itself:

> **Restrained.** A restrained creature cannot move. When a restrained creature takes damage it
> cannot be subtracted from their stamina points.

### 1.2 What was wrong, and the fix

`escapeGrapple` cleared `grappled` and nothing else, with a comment claiming no `restrained`
status was registered. That comment was **stale** — `src/fallout.ts` registers `restrained`
(padlock icon), `static/lang/en.json` localizes it, and the combat panel displays it. So a
successful Escape left the second of the three named conditions on the token permanently.

Fixed: `ESCAPABLE_STATUSES` is `["grappled", "restrained"]`, and a success toggles off every
one the creature actually had. The report gained a `cleared` array (`EscapeReport`), so the card
can say what came off and a smoke step can assert it.

### 1.3 The third word in that sentence

**"Chokehold" is not a condition anywhere in 136 pages.** It appears in this one sentence, has
no entry in the pg 133-135 condition list, and no creature, weapon or trap in the book applies
one. There is nothing to clear and nothing was invented — the gap is named in the code rather
than papered over with a status id the book never defines.

### 1.4 What was deliberately not changed

- **Only the conditions actually present are toggled.** An escape from a bear trap (pg 80,
  Restrained with no grappler behind it) does not announce that a grapple was broken.
- **The `grappledBy` flag is still cleared unconditionally**, because it is bookkeeping rather
  than a condition.
- **Nothing sets `restrained`.** The book gives no action that applies it; it stays a status a
  GM turns on, which is the standing pattern (`src/actions/situations.ts`).

---

## 2. Reactive Plates (pg 59) — the attacker the pipeline never knew

### 2.1 What is printed (pg 59 table, read from the page image)

| Rank | Effect |
|---|---|
| 1 | When you take damage from a melee attack, the attacker takes a quarter (rounded down) of the damage they dealt. |
| 2 | The attacker takes another quarter (rounded down) of the damage they dealt. *(effectively half of the total).* |
| 3 | When you take damage from a melee attack, the attacker is knocked by 15 feet. |

Ranks are cumulative (pg 58), so rank 3 is two quarters **and** the knockback.

### 2.2 The structural problem, and how it was threaded

`applyDamage` is a pipeline about the **defender**: every rule in it reads the defender's pools,
armor, thresholds and conditions. Reactive Plates is the only printed rule in the chapter that
needs the other end of the exchange, and the defender's suit is what decides — not the
attacker's sheet.

So the attacker rides in as `options.attacker`, and the place that fills it in is the GM's
**"Apply to targets"** button (`src/fallout.ts`), which is the one moment both ends are in the
same room: the GM has the defender targeted, and the card was posted by the attacker.

Who the attacker is comes from two places, in order:

1. **A new `attacker` field on the damage flag**, written by every roll path that knows it is an
   attack — `rollDamage`, `rollImprovisedAttack` (`src/dice/rolls.ts`) and `unarmedStrike`
   (`src/actions/combat-actions.ts`). An actor id, because a flag is JSON.
2. **The chat message's own `speaker.actor`**, as a fallback for a damage card posted by
   something older or by hand. Same id, resolved the same way.

**The attacker genuinely cannot be known for every caller, and this is not faked.** Every other
caller of `applyDamage` in the system is a hazard, a disease, a radiation tick or an environment
effect, none of which has an attacker at all. Omit the option and nothing about the defender's
side changes — which is exactly the behaviour that shipped before.

One limit, stated rather than worked around: **an unlinked token's actor is not in
`game.actors`**, so an attacker that exists only as a synthetic token actor will not resolve and
the reflection simply does not fire. That is the same silence as before this was wired, rather
than a guess at whose sheet to write to.

### 2.3 Three silences the table does not fill, decided here

- **Which number is "the damage they dealt".** Read as the damage that *left* the attacker — the
  rolled total, before the defender's resistances, shielding, Defense Points and thresholds get
  their say. Those are all facts about the defender, and a suit that reflected less because its
  own armor worked would punish the armor. It also keeps the reflection readable at the table: a
  quarter of the number printed on the damage card.
- **Whether the reflection is itself damage.** The table says the attacker "takes" it, so it runs
  the attacker's own pipeline — Defense Points, stamina, threshold and all. It carries **no
  damage type**, because the table names none, so no resistance or vulnerability touches it.
- **Whether reflections bounce.** Two plated creatures in melee is a real table configuration. The
  reflected damage is not "damage from a melee attack" — it is the plates discharging — so it
  cannot trigger the attacker's own plates. Enforced **structurally**, not by a flag: the nested
  application passes no `attacker`, so there is no second end for a reflection to reach and the
  recursion cannot start.

### 2.4 The printed gloss that was rejected

Rank 2's aside — *"(effectively half of the total)"* — is arithmetically false: two quarters each
rounded down is not half of an odd number (7 damage gives 1 + 1 = 2, not 3). "Rounded down" is
stated twice and the gloss once, so the arithmetic wins. This was already the ruling at
`reactivePlatesReflected`; it is now visible on the chat card as well, since the number finally
reaches a player.

### 2.5 Also refused

**A creature reflecting at itself.** The GM's Apply button skips the reflection when the
attacker and the target are the same actor. The book never contemplates it; refusing is the only
non-absurd reading.

---

## 3. VATS matrix overlay (pg 59) — the surcharge finally asks

### 3.1 What is printed

Ranks 1 and 2, identically: *"Whenever you make a targeted attack roll, reduce the additional AP
cost by 1."* Rank 3 is a dash — the upgrade caps at 2, for −2 total.

### 3.2 Where it now applies

Both call sites of `targetedApCost`, wrapped in `targetedApWithVats(actor, …)`:

- **`rollAttack`** (`src/dice/rolls.ts`) — the attack card now prints the reduced surcharge and
  names the reduction when one happened.
- **The limb-picker dialog** (`src/sheets/character-sheet.ts`) — every row is priced the way the
  roll will price it. A dialog quoting the printed surcharge while the card charged a smaller one
  would be the sheet disagreeing with itself.

`fusionCoreTargetAp(rank)` in `src/rules/power-armor.ts` is now redundant with this path: the
`fusionCore` row rides the same table (`src/rules/targeted.ts`), so its +5 goes through the same
wrapper. It is left alone — it is not this work's file, and it still answers the same question
correctly for any caller that has a rank rather than an actor.

### 3.3 The interaction the book does not print

Pg 130 reduces a **melee** targeted attack's additional AP by 2, *"to a minimum of 1"*. Pg 59
prints **no floor at all**. Applied in that order — melee discount first, then the suit — a rank
2 suit takes that last point off and a melee targeted attack can cost +0 additional AP. Nothing
forbids the stacking, and `vatsTargetedApCost` already floors at zero so no attack refunds AP for
aiming. Stated on the card, because a targeted attack costing nothing extra is worth explaining.

Dismember (pg 60-61) already zeroes the arm/leg surcharge outright, so the two never compete for
the same point.

---

## 4. The pg 133 bleeding-healing redirect

### 4.1 What is printed (pg 133, *Bleeding*)

> At the start of each of your turns, for every level of bleeding you have you lose hit points
> equal to half your healing rate (rounded down). A dying creature with any levels of this
> condition fails a death save at the start of their turns. **If a creature who has any levels of
> bleeding is healed, they do not gain any hit points, instead they remove two levels of
> bleeding.**

### 4.2 Where it lives

`src/actions/healing.ts` gained `restoreHitPoints(system, amount, options)` beside the existing
`restoreStamina`, plus `hitPointUpdates(gain)` so a caller can merge the two writes (hit points,
and the new Bleeding level) into its own batch.

**Why a sibling gate in the same module rather than one shared gate**, as the brief allowed
either way: the two pools are refused by different rules *and in different shapes*. Shock (pg
135) names stamina points and nothing else. Pg 133's redirect names hit points and nothing else,
and it does not merely reduce the healing — it **spends it on something else**, so its return
value has to carry a second document write that a stamina gain has no analogue for. Folding both
into one function would mean a `pool: "hp" | "sp"` parameter and a body that branches on it at
every step: two functions wearing one name. One module, one doorway per pool. The comment saying
so is at the top of the file.

### 4.3 Call sites wired

| Path | State |
|---|---|
| `useAid` — every stimpak, healing powder, and `healFormula` item | **wired** |
| First Aid Kit / Doctor's Bag *Stitch Wounds* | **wired** (new, §5) |
| First Aid Kit / Doctor's Bag *Pain Killer* | **wired** (new, §5) |
| `restoreStamina` | deliberately untouched — see §4.5 |
| `stabilizeCreature` (pg 131) | deliberately exempt — see §4.4 |
| `rest()` — the 8-hour heal, `src/actions/rest.ts` | **not wired: file not owned.** See §7 |
| Healing Powder's per-turn heal, `src/combat/turns.ts` | **not wired: file not owned.** See §7 |
| Death saves (nat 20, three successes), `src/dice/rolls.ts` | deliberately excluded — see §4.6 |

### 4.4 The pg 131 exemption, honoured

`packs-src/V21-NOTES-first-aid.md` F4 already ruled that the redirect does **not** fire on
stabilising, because pg 131 sets stabilising against healing in its own opening sentence:
*"The best way to save a creature with 0 hit points is to heal it. **If healing is unavailable**,
the creature can at least be stabilized."* That ruling is respected: `stabilizeCreature` writes
its 1 hit point directly and keeps its existing card note. `restoreHitPoints` carries
`bleedingRedirect: false` as the way a caller declares it is doing something the book does not
call healing; **nothing in the system passes it today**, which is the honest state — the one
exempt path predates the gate and does not go through it.

### 4.5 Three silences, decided

- **Stamina is untouched.** The sentence says "gains no hit points" and says nothing about
  stamina points, so `restoreStamina` does not consult Bleeding at all. A bleeding character
  still gets stamina from a hot meal. Asserted by a smoke step so a later reading cannot drift.
- **Two levels, flat.** One hit point of healing and fifty both buy exactly two levels. The book
  prices it per act of healing, not per point.
- **Healing that lands on nobody still counts.** A bleeding creature at full hit points sheds the
  two levels: the refusal is the rule's *first* clause and nothing conditions it on the hit points
  having anywhere to go.

**One genuine collision the book does not resolve:** pg 120 lets a disease **lock** levels of a
condition in place (`derived.conditionFloors`). If every level of Bleeding is held, the redirect
has nothing to remove — and the hit points are **still refused**, because pg 133's trigger is
only *having* levels. That is the literal reading; the alternative (let the healing through
because the redirect is a dead end) would be more generous and is not printed anywhere. The
collision is stated on the chat card rather than smoothed away. No shipped disease locks Bleeding
today, so this is currently hypothetical.

### 4.6 Death saves: excluded, deliberately

Pg 131 hands back a hit point on a natural 20 and on the third success. Read literally against
pg 133, a bleeding dying creature could never come back from a death save either. This was
**left alone**, for the same reason F4 exempted stabilising: the death-save track is the pg 131
machinery that pg 131 explicitly contrasts with healing, and "you regain 1 hit point" is the
outcome of a save rather than an act of healing administered to a creature. Named here because
`src/dice/rolls.ts` *is* an owned file, so this is a decision rather than a scope limit.

---

## 5. The pg 86 First Aid Kit and Doctor's Bag

### 5.1 What is printed, verbatim (pg 86, confirmed against the page image)

> **First Aid Kit.** You can use this kit on yourself or another creature so long as they are
> next to you. When you use it, choose one of the following actions.
> - **Tourniquet.** Spend 6 AP and remove up to two levels of bleeding.
> - **Pain Killer.** Spend 6 AP to heal a dying creature 1 hit point.
> - **Stitch Wounds.** Spend 10 minutes and heal a creature with a number of hit points equal to
>   double their healing rate + your medicine skill bonus.
>
> After you have used one of these actions, the first aid kit's supplies are used and it no
> longer functions.

The **Doctor's Bag** prints the identical paragraph with one action added and one number changed:

> - **Set Bone.** Spend 10 minutes and a creature with the Broken Arm or Broken Leg condition may
>   remove it.
>
> After you have used three of these actions, the doctor' bag supplies are used and it no longer
> functions.

| | First Aid Kit | Doctor's Bag |
|---|---|---|
| Cost / Load | 80c / 4 | 300c / 15 |
| Uses | 1 | 3 |
| Actions | Tourniquet, Pain Killer, Stitch Wounds | those three **plus Set Bone** |
| Check | **none, for any action** | **none, for any action** |
| Range | "next to you" | "next to you" |

### 5.2 What was built

`useMedicalKit(medic, medicSystem, item, target, action)` in `src/actions/first-aid.ts`, with the
pure half in `src/rules/first-aid.ts`. Surfaced on the existing **Use** button of the aid row:
a kit opens an action picker instead of being swallowed whole, and the patient is whoever the
user has targeted, falling back to the character themselves — which is exactly "on yourself or
another creature".

**Uses are counted in an item flag** (`flags.fallout-ttrpg.kitUses`), not a schema field: the aid
data model has no uses column and `src/data/**` was out of scope. A flag round-trips on an owned
item, survives a reload, and costs no migration — the same trade `grappledBy` makes on an actor.
`quantity` is how many kits are carried, so exhausting one decrements it and resets the counter
for the next one in the bag.

### 5.3 Decisions

**An action that cannot do anything is refused, and keeps the supplies.** The book never says
what happens when you Tourniquet a creature that is not bleeding, and never says the supplies are
spent regardless. An 80-cap item destroyed by a misclick is the worse of the two silences to guess
wrong on. Refused: Tourniquet with no Bleeding (or with every level disease-locked), Pain Killer
on a creature that is not dying, Stitch Wounds on a creature at full healable hit points and not
bleeding.

**Pain Killer answers to the pg 133 redirect. This is the most arguable call in this work.**
Pg 86 says "**heal** a dying creature 1 hit point"; pg 133 says a healed bleeding creature gains
no hit points. So a Pain Killer given to a bleeding dying creature sheds two levels of Bleeding
and leaves them at 0, still dying. That reads badly — and it is what the two sentences say. The
carve-out this project already ruled (F4) is specifically about pg 131 *stabilising*, which
contrasts itself with healing in its own opening sentence; **pg 86 draws no such contrast and
uses the word "heal"**. Extending F4's exemption to pg 86 would be inventing a second exemption
from an argument the book only makes once. The card says all of this, names the Medicine
stabilise route that does work, and invites the overrule. A smoke step asserts it, so a future
change of mind is a failing step rather than a silent drift.

**Pain Killer clears the death-save tallies**, the same inference `stabilizeCreature` makes and
labelled the same way: pg 86 says nothing about them, but at 1 hit point the creature is no longer
dying and a stale failure count would carry silently into the next time it drops. Not done when
the redirect fires, because the creature is then still at 0.

**Stitch Wounds' two pronouns are read literally.** *"double **their** healing rate + **your**
medicine skill bonus"* — the healing rate is the patient's, the Medicine bonus is the medic's.
Floored at zero, so a negative Medicine bonus cannot make a healing item deal damage.

**Set Bone is offered, spends its use, and reports.** There is nothing in this system to remove:
Broken Arm is a pg 129 targeted-attack condition that this system prints on a chat card and
stores in no field, and — worse — **"Broken Leg" appears on pg 86 and nowhere else in the
book**. The pg 129 leg row's fourth condition is *Leg Cripple*; no entry anywhere defines a
Broken Leg. So the removal goes to the table, and the use is spent because the book spends it.
(Pg 128 confirms the direction of travel: *"Broken Arm. … This condition can be removed with a
doctor's bag."*)

**Efficient Diagnosis (pg 38) is wired**, because it is the one perk in 186 that keys off *this
action* rather than off a roll, and `V21-NOTES-first-aid.md` §4.13 rejected it only because there
was no kit action for it to modify. +2 hit points per rank, capped at the printed three, and
"on another creature" is literal — self-treatment gains nothing. Ranks are counted as copies of
the perk item, which is how a repeatable perk is represented here. **The Karma Cap alternative
("heal double the amount you normally would") is not automated** — no cap-spend workflow exists
anywhere in the actions layer, the same wall Tainted food's cap escape ran into — so it is
offered as a card reminder.

**Range and AP are reported, not enforced**: nothing in this system reads token positions
(ROADMAP D3), and AP is spent by hand (ROADMAP item 14). The two ten-minute actions are not AP at
all and say so.

### 5.4 The asymmetry the book creates, left alone

Four routes give a dying creature its first hit point, and the one that costs a check is the
worst of them (`V21-NOTES-first-aid.md` §2.4). Likewise the DC 15 Medicine check removes *every*
level of Bleeding for the same 6 AP a Tourniquet spends on two. Both asymmetries are the book's;
nothing here evens them out, and both cards now name the other option so a player can see it.

---

## 6. EXPLICIT REJECTION LIST

Considered and **deliberately excluded**:

1. **Inventing a `chokehold` status** so Escape's third noun has something to clear. Defined
   nowhere in the book. Named in the code instead.
2. **Having Escape *apply* nothing and only report.** The two conditions it frees you from are
   both registered statuses; clearing them is the action.
3. **Making the grapple break when the grappler dies, moves, or is knocked out.** Still not
   printed, still not done — this was already the ruling at `grapple`.
4. **Reflecting a quarter of the damage that actually *landed*** (post-DP, post-DT). Those are the
   defender's numbers; reflecting less because the defender's own armor worked would punish the
   armor. §2.3.
5. **"Effectively half of the total"** as the rank 2 rule. Arithmetically false against the same
   row's own "rounded down", stated twice. §2.4.
6. **Giving the reflection a damage type** so resistances apply. The table names none.
7. **Letting a reflection trigger the attacker's own Reactive Plates.** §2.3.
8. **Applying the reflection from anywhere except the Apply button.** Every other `applyDamage`
   caller is a hazard, a disease or an environment tick with no attacker to reflect at. Faking one
   was the alternative the brief asked to be told about instead of taken.
9. **Measuring the 15-foot knockback into token movement.** Nothing in this system moves tokens;
   reported, like every other push and pull in the book.
10. **Applying the VATS reduction to the weapon's own AP cost.** It says *the additional* AP cost,
    which is the pg 129 surcharge and the Fusion Core's +5.
11. **Floor of 1 on the VATS-reduced surcharge**, borrowed from pg 130's melee discount. Pg 59
    prints no floor; borrowing one from a different rule would be inventing an interaction. §3.3.
12. **Extending the pg 133 redirect to stamina.** The sentence names hit points. §4.5.
13. **Extending the pg 131 stabilise exemption to the pg 86 Pain Killer.** Pg 86 uses the word
    "heal" and offers no contrast to hang an exemption on. §5.3.
14. **Extending the redirect to death saves.** §4.6.
15. **Letting the healing through when a disease floor makes the redirect a dead end.** More
    generous, printed nowhere. §4.5.
16. **Making the redirect scale with the healing** (four levels for a big heal). "Two levels",
    flat.
17. **Adding a `uses` field to the aid data model.** `src/data/**` is out of scope, and a flag
    does the job without a migration. §5.2.
18. **Spending a kit's supplies on an action with no effect.** §5.3.
19. **Inventing Broken Arm / Broken Leg as sheet state so Set Bone could remove them.** One of the
    two names is defined nowhere in the book. §5.3.
20. **Automating Efficient Diagnosis' Karma Cap alternative.** No cap-spend workflow exists.
21. **Enforcing "next to you" / "within 5 feet"** for any kit action. Nothing here reads token
    positions.
22. **Deducting the 6 AP** for a Tourniquet or a Pain Killer. ROADMAP item 14.
23. **Migrating `stabilizeCreature` and `repairItem` onto `rollSkillCheck`.** Real and worth
    doing — `rollSkillCheck` now exists in `src/dice/rolls.ts` and both still build their d20
    inline, so advantage does not reach either — but it is a different item and touching it here
    would have hidden this work's diff inside somebody else's.

---

## 7. WHAT THIS LEAVES OPEN FOR SOMEONE ELSE

- **`rest()` does not pass its hit-point healing through the gate** (`src/actions/rest.ts`, not an
  owned file). The 8-hour rest heals a bleeding character normally today. One-line fix:
  `restoreHitPoints(system, healed)` plus `hitPointUpdates(gain)` merged into the existing
  `updates` object, exactly as `useAid` now does it.
- **Healing Powder's per-turn heal is unimplemented, and would need the same gate**
  (`src/combat/turns.ts`, not owned). Pg 86: half the healing rate at the start of each of three
  turns.
- **The NPC sheet has no Use-aid path**, so the kit picker is character-sheet only.
- **A panel row for the kit actions.** They are behind the existing Use button, which is enough to
  play with; a medical-panel row listing "Tourniquet / Pain Killer / Stitch Wounds" with the uses
  remaining would be better, and `src/sheets/panels/**` was not this work's to touch.
- **`fusionCoreTargetAp` in `src/rules/power-armor.ts` is now a second route to the same answer**
  as `targetedApWithVats` on the `fusionCore` row. Harmless, worth collapsing when that file is
  next opened.
- **Junk items still do not exist**, so `endBleeding`'s cloth requirement is still reported
  (`V21-NOTES-first-aid.md` F6). Unchanged by this work.
- **Broken Arm / Broken Leg / Leg Cripple as real conditions.** The pg 129 targeted-attack riders
  are chat text (ROADMAP D2), and Set Bone will stay a callout until they are state.
