# Power Armor — v2.1 rules extraction

**Source of truth:** `FALLOUT TTRPG 2.1.pdf` (printed book, 136 pp). PDF page number == printed
page number (verified 1:1 on pg 56/57/58/59).
**Cross-checked against:** `manuscript Fallout TTRPG v2.1.pdf` (identical wording for the whole
Power Armor section — no divergence found) and `Patch Notes_ Fallout 2.1.pdf`.
**Tables read visually** (`pdftoppm -r 150`) as required: pg 57 (Armor Upgrades + body text),
pg 58 (Power Armor Types and Statistics), pg 59 (Power Armor Upgrades). Column alignment confirmed
by eye; the layout dump matched the image in all three cases.

The whole Power Armor rule block is **pg 57 (bottom two columns) through pg 59**. Everything else is
scattered single mentions, all of which are catalogued in §8.

---

## 1. Entering and exiting a suit

**Rule (pg 57, "Operation"):**
> "**Operation.** It costs 6 AP on your turn to enter or exit Power Armor."

That is the entire printed rule. Notes:

- **6 AP confirmed.** The roadmap is right.
- **It is not "an action."** This system has no action/bonus-action economy — everything is an AP
  cost spent on your turn (pg 125–126, "Action Points"). Enter/exit is *not* listed in the
  "Actions in Combat" table on pg 126; the 6 AP figure exists only in the pg 57 sentence.
- **No frame, no rack, no power-armor station, no assistance is required.** Grepping the full text
  for `frame`, `chassis`, `rack`, `station` turns up nothing of the sort. "Power Armor Chassis" is
  only a *crafting component* (pg 95, Crafting DC +20, 7 days) and the word "chassis" in the rules
  text refers to the suit's own interior (pg 58: "its interior chassis supports its user entirely").
  The flavour text (pg 56) says the suit "opens from the back, allowing its operator to step inside."
- **Race gating on who may enter at all:**
  - Robots: "you cannot use power armor." (pg 9, Robot race)
  - Super Mutants: "Due to the specifics required for it, you cannot use power armor unless it is
    specifically modded to your body type." (pg 11) — the mod is the **Super Mutant Fitting**
    upgrade, pg 59, 50% of base cost, and "once this upgrade has been added, it requires the same
    price or crafting materials to remove it"; while fitted, "humans and ghouls can no longer use
    the armor."

**What happens on exit (pg 57, "Defense Points"):**
> "If you exit Power Armor, you no longer have defense points. If any creature enters the armor,
> they gain defense points equal to the amount that previous user had when they exited."

So the DP total is **stored on the suit**, not on the character, and the next occupant inherits the
depleted value. That is explicit and unambiguous.

**Whether the suit stays standing / becomes an object with AC & HP on exit:** *the book does not
say.* There is no statline for an unoccupied suit beyond its AC and DP in the pg 58 table, no HP,
no "the suit remains upright," and no rule for attacking an empty suit.

**A suit with no Fusion Core:** the book only covers a core running *out* while worn (pg 58,
quoted in §2). It says nothing about entering, wearing, or operating a suit that has **no core
installed at all**. Undefined. See §9.

---

## 2. Fusion Cores

**Rule (pg 58, "Fusion Core"), quoted in full:**
> "**Fusion Core.** Power Armor requires a special type of condensed nuclear power called a Fusion
> Core to operate. It slots into its back and provides an allotted time of operation. You can spend
> 5 AP on your turn to replace the Fusion Core on a set of Power Armor. Once the allotted time is
> up, the Power Armor pulls power from its emergency reserves granting it a minute of operation.
> After the minute is up, the power armor uses its last amount of power to open its back to allow
> its user to exit the armor. Then, it ceases function. If necessary, you can choose to override
> this function to keep yourself in the power armor. However, while in this state you are grappled
> and restrained and you cannot escape unless your Strength score is equal to 20. Escaping in this
> way decays the Power Armor by 10 levels."

### 2a. Runtime

**Runtime is printed per *suit model*, in hours, not per core and not in minutes** (pg 58 table,
read visually):

| Name | Base Cost | AC | DP | Slots | Repair | Allotted Time |
|---|---|---|---|---|---|---|
| T-45 | 4,050c | 14 | 15 | 6 | DC 16 | 4 hours. |
| T-51 | 80,250c | 17 | 20 | 5 | DC 23 | 6 hours. |
| T-60 | 85,750c | 16 | 30 | 6 | DC 20 | 4 hours. |
| X-01 | 133,500c | 16 | 45 | 4 | DC 25 | 3 hours. |
| X-02 | 155,000c | 18 | 40 | 4 | DC 25 | 3 hours. |

In minutes: T-45 240, T-51 360, T-60 240, X-01 180, X-02 180.

Note the table has **no DT column** — see §9.

A Fusion Core as an item costs **200c** and is listed under Energy Ammunition (pg 67). Ammunition
load: "Any ten individual ammunitions are equal to 1 load" (pg 67), so a core is 0.1 load. A core
**cannot be crafted** (pg 102, Item Blueprint Encyclopedia: "Fusion Core — Cannot be crafted").

### 2b. What drains it, and at what rate

Base drain is simply the passage of time — the suit consumes its allotted time while operating.
**The book never states a per-round or per-minute combat drain rate**; only the total. Everything
below is an *additional* drain, and these are the only printed ones:

| Source | Drain | Page |
|---|---|---|
| Overheating (automatic cooling) | −30 minutes, on first becoming overheated and again at the start of your turn if still overheated | 58 |
| Overheating, with **Core Assembly** rank 3 | −15 minutes instead of 30 | 59 |
| **Tesla Coils** rank 1, per round active | −10 minutes | 59 |
| **Tesla Coils** rank 2, per round active | an additional −5 minutes | 59 |
| **Tesla Coils** rank 3, per round active | an additional −10 minutes | 59 |
| **Jet Pack** rank 1 | −1 minute "for every 10 feet you fly or every second that you fly" | 59 |
| **Explosive vent**, each activation | −20 minutes | 59 |

No other upgrade costs allotted time. (Explicitly: Overclock Hydraulics, Kinetic dynamo, Targeting
HUD, Headlamp, Sensor Array, Internal database, VATS matrix overlay, Optimized bracers, Rusty
knuckles, Calibrated Shocks, Reactive Plates, Prism/Explosive Shielding, Emergency protocols cost
**nothing** in core drain.)

Tesla Coils rank 3 stacked cost is 10+5+10 = **25 minutes per round active** if the ranks add
("Each rank grants a new ability which adds on to the previous one", pg 58/59).

### 2c. What happens at 0 minutes

Three-stage shutdown, all on pg 58:
1. Allotted time expires → **emergency reserves give 1 minute of operation.** The book does not say
   whether the suit is degraded during this minute — read literally it operates normally.
2. After that minute → the suit spends its last power to **open its back so the user can exit**.
3. **"Then, it ceases function."**

So it is a *full* stop, not partial — but only after the 1-minute reserve, and the suit
deliberately lets you out first. The book does not say whether "ceases function" also zeroes DP or
the AC bonus, or whether the suit can be restarted simply by slotting a fresh core (it strongly
implies yes, since replacing a core is a 5 AP action, but it never says so).

**Override:** you may refuse to be ejected. Then "you are grappled and restrained and you cannot
escape unless your Strength score is equal to 20." Escaping that way "decays the Power Armor by 10
levels." Relevant condition text: *Grappled* — "A grappled creature cannot spend AP to move"
(pg 134); *Restrained* — "A restrained creature cannot move. When a restrained creature takes
damage it cannot be subtracted from their stamina points" (pg 136).

**The Strength 20 requirement is almost certainly a defect** — see §9.

### 2d. Swapping a core

> "You can spend 5 AP on your turn to replace the Fusion Core on a set of Power Armor." (pg 58)

5 AP. The book does not say whether you must be outside the suit, whether the suit must be
powered down, whether an enemy can pull your core, or whether a partially-drained core keeps its
remaining time when moved between suits (see §9).

---

## 3. Overheating (the Power Armor mechanic)

**Rule (pg 58, "Overheating"), quoted in full:**
> "**Overheating.** If you spend more than 15 AP on a turn while you wear Power Armor, it overheats
> until the end of your next turn. When Power Armor first becomes overheated, or is overheated at
> the start of your turn; the armor must spend additional energy to cool itself and the fusion core,
> draining its energy significantly, losing 30 minutes of its allotted time. If a fusion core only
> has 30 minutes of its allotted time, and becomes overheated, the Power Armor ejects the user and
> ceases function. You can choose to override the automatic cooling so as to not lose any allotted
> time. However, if you do, the fusion core explodes at the end of your next turn. This explosion
> has a small radius of 20 feet and a large radius of 50 feet. All creatures and objects in the
> short radius take 20d10 explosive damage, or half as much in the large radius. The Power Armor is
> destroyed, and if its user was still inside; they incinerate into carbon molecules. Additionally,
> the area of the explosion becomes a Level 5 Irradiated Zone, decreasing in its level by 1 every
> 24 hours."

**Trigger:** AP *spent on a turn*, of any kind — not movement only, not attacks only. Strictly
**more than 15**, i.e. 16+.

Context on reachability: AP total is `10 + Agility modifier` (pg 125), the modifier caps at +5 at
Agility 10 (pg 20 table), so the base cap is exactly **15 AP** — you cannot overheat on base AP
alone. You get there via *Recycling* ("If you don't use all your AP on your turn, you can recycle
half of them for your next turn", pg 126), the **Action Boy/Girl**-style perk at pg 43
("Your action point maximum increases by 2"), or **Overclock Hydraulics** rank 3 (+2 max AP, pg 59).

**Consequence:** the *only* consequence is the −30 minutes of allotted time, charged once when it
first becomes overheated and once more at the start of each of your turns while still overheated.
There is **no** AP penalty, no roll penalty, no damage, no condition applied to the wearer.

**Duration:** "until the end of your next turn."

**Does it stack?** *The book does not say.* The wording is written as a binary state ("it
overheats", "is overheated"), and the drain is gated on "first becomes overheated, or is overheated
at the start of your turn", which reads as a hard cap of one charge per turn-start plus one on
onset. There is no notion of stacking levels for the Power Armor version.

**How it clears:** automatically, at the end of your next turn. There is no repair, cooling, or
check to clear it. Alternatively, the suit is force-cleared when it ejects you (fusion core at
30 minutes) or when you override and it explodes.

**Threshold modifiers:**
- **Core Assembly** (pg 59, 2250c): rank 1 → 18 AP; rank 2 → 20 AP; rank 3 → overheating costs
  15 minutes instead of 30.
- **Power Armor Master** perk (pg 46, req. Intelligence 7): "When you use power armor, you do not
  overheat if you spend more than 15 AP on a turn." Total immunity to the *AP* trigger — it does
  not mention the Fusion Core Targeting trigger.
- **Overclock Hydraulics** rank 2 (pg 59): "You can spend 3 AP to overheat the fusion core" —
  a *deliberate* self-overheat, because rank 1 gives a large buff *while overheated*: "your maximum
  AP increases by 2, you have advantage on all attack rolls, you can move 15 feet with 1 AP, and
  your unarmed attacks deal an additional 3d6 fire damage."

### 3a. Is this the same "Overheating" as the environmental condition?

**No. They are two entirely different rules that share a name.** State this explicitly in code.

| | Power Armor Overheating (pg 58) | Overheating condition (pg 123 + pg 134) |
|---|---|---|
| Applies to | the **armor** | the **creature** |
| Structure | binary state, on/off | **leveled**, 1–10 |
| Source | spending >15 AP in a turn while wearing PA; fusion core taking 30 damage | Extreme Heat weather severity 1–4 (pg 123) |
| Effect | −30 min of the suit's allotted time | −1 to every d20 (except Luck) per level; AP reduced by half your levels rounded down; **at 10 levels you die** |
| Clears | end of your next turn, automatically | "Every hour that you spend in a shelter that has a source of cooling or is not considered Extreme Heat, you remove one level of overheating." |

The condition text (verbatim, pg 134, duplicated at pg 123):
> "Whenever you roll a d20 (besides Luck), the total is subtracted by 1 for each level of
> overheating you have. Additionally, your action points are reduced by a number equal to half the
> amount of Overheating levels you have, rounded down. When you gain your tenth level of
> Overheating, you die."

Nothing in either section cross-references the other. Wearing overheated Power Armor does **not**
give you levels of the Overheating condition, and gaining levels of the Overheating condition does
**not** overheat your suit. Also note the Luck perk exemption at pg 25 ("Unaffected by Mortal
Detriments … Overheating; Luck rolls are unaffected by these levels") applies only to the leveled
condition — "levels" is the tell.

---

## 4. Fusion Core Targeting

**Rule (pg 58), quoted in full:**
> "**Fusion Core Targeting.** Power Armor has one weakness; its fusion core is exposed to allow
> itself to cool. Any creature who can see the back of another creature that wears power armor can
> make a targeted attack against it. To make this targeted attack you must spend an additional 5 AP
> and the attack deals no damage to the armor or its operator and applies no condition. But, each
> time the fusion core has taken at least 30 damage; it becomes overheated until the start of its
> operator's next turn (see Overheating below)."

- **AP cost:** the weapon's normal AP cost **+5 additional AP**. For scale, the targeted-attack
  table on pg 129 charges +5 (eyes), +3 (head/arm/groin), +2 (torso/leg), +4 (held object). So the
  core is the joint-most-expensive target in the game.
- **Requirement:** the attacker "can see the back of" the wearer.
- **DC / AC modifier:** **none printed.** Unlike Eyes and Head (pg 129: "to hit ranged attack
  modifier is halved"), the fusion core entry states no attack-roll modifier and no separate AC for
  the core. By the general rule (pg 128) it is an ordinary attack roll against the target's AC.
- **Damage/effect:** *no* damage to armor or operator, *no* condition. The sole effect is: once the
  core "has taken at least 30 damage", it becomes overheated **until the start of its operator's
  next turn** — note this is a *different* duration from the AP-triggered overheat (which lasts
  until the *end* of your next turn). Via §3, that overheat costs the suit 30 minutes of allotted
  time (or ejects the user if the core is down to 30 minutes).
- **Does it destroy the core?** **No.** The book never says the core is destroyed, disabled, or
  removed by this attack. The only way a core is destroyed in print is the override explosion
  (pg 58), which is a choice made by the *operator*, not by the attacker.
- **Interacting upgrade:** **VATS matrix overlay** (pg 59, 2700c) — "Whenever you make a targeted
  attack roll, reduce the additional AP cost by 1" per rank, max rank 2 → 5 AP becomes 3 AP.

---

## 5. Power Armor decay

### 5a. The general decay chassis (pg 92–93)

> "**Decay with all items.** Any item can have a level of decay, to a total of nine. Items can only
> gain levels of decay in three ways: If the item specifies it gains levels of decay in a unique way
> (like weapons and armor described below), if the item takes damage from a targeted attack, or if
> your GM rules that the item gains levels of decay from a unique situation or scenario. When an
> item gains its tenth level of decay; it breaks and ceases function."
>
> "**Broken items.** When an item gains its tenth level of decay and breaks, it cannot be used or
> operated. It ceases function, cannot apply benefits, or gain any benefits from mods, upgrades,
> abilities, or perks. However, a broken item still retains its load and can be used as an
> improvised weapon."
>
> "**Armor Decay.** Unlike other items, armor cannot be the target of a targeted attack and instead
> gains levels of decay in unique ways. Armor gains a level of decay if you are wearing it and; you
> are the target of an attack that is a critical hit, or whenever you fall to 0 hit points. When any
> piece of armor has levels of decay, its AC and DT bonus are each decreased by a number equal to
> half the amount of levels of decay it has, rounded down."

### 5b. Power Armor's overrides

**Power Armor does not use the normal per-level penalty and is never "broken" by decay** (pg 57,
"Repair"):
> "**Repair.** Unlike other weapons and armor, levels of decay do not apply any negative effects to
> the armor or user (besides a loss in defense points) and Power Armor does not cease to function
> when it reaches 10 levels of decay."

So: no AC loss, no DT loss, no attack penalty, no "broken" state from decay. The ten levels do
exactly **three** things in print:

| Decay level | Printed effect | Page |
|---|---|---|
| 0–5 | "You are immune to Radiation so long as the power armor has less than six levels of decay." | 57 |
| 6–9 | "If the armor has six to nine levels of decay or more, you have advantage on Rad Resist checks" | 57 |
| 10 | "if the armor has ten levels of decay; it offers no protection against radiation" | 57 |
| 10 | "If the Power Armor has 10 levels of decay, you no longer regain defense points." | 57 |

There is **no** printed per-level effect for levels 1–5 or 7–9 individually; the bands are the
whole ruleset. Anything more granular is invention.

### 5c. Sources of decay for a suit

1. **DP hitting 0** (pg 57, quoted below) — the Power-Armor-specific source.
2. The generic armor sources still apply, since nothing exempts PA: wearer is the target of a
   critical hit; wearer falls to 0 hit points (pg 92).
3. "Escaping in this way decays the Power Armor by 10 levels" — overriding a dead core and forcing
   your way out (pg 58).
4. Explicitly **immune** to the **Corrosive** ranged-weapon property (pg 69): "…their armor gains
   one level of decay… **Power Armor is unaffected by this condition.**"

### 5d. The DP↔decay loop (the `decayMax` assumption)

**Rule (pg 57, "Defense Points"), quoted in full:**
> "**Defense Points.** When you enter Power Armor you gain a new set of points called defense points
> (abbreviated to DP). Defense points operate similarly to stamina points; whenever you take damage
> you may subtract the damage from your defense points instead of your hit points or stamina points.
> However, defense points are not modified by any ability scores, instead the total you gain is a
> flat amount described in the Power Armor table below. If you exit Power Armor, you no longer have
> defense points. If any creature enters the armor, they gain defense points equal to the amount
> that previous user had when they exited. When your defense points hit 0, the Power Armor gains a
> level of decay and you regain defense points equal to its total. If the Power Armor has 10 levels
> of decay, you no longer regain defense points. *(Example: You have 15 DP. You take 20 damage. Your
> DP falls to 0, and the Power Armor gains a level of decay, you gain 15 more DP, and subtract the
> remaining 5 for a total of 10 DP.)*"

The worked example nails the ordering: **overflow damage carries into the refilled pool.** 15 DP,
20 damage → 0, +1 decay, refill to 15, subtract the leftover 5 → 10 DP.

**`decayMax = 10` is correct**, and 10 is where the refill stops — it is not where the suit dies.

**Perk interaction:** **Power Armor Master** (pg 46, req. Int 7) — "you can craft a special upgrade
for any power armor that increases its **maximum and regained defense points by 2**." Note this
upgrade has no name, no cost, and no crafting DC; its materials are "equal to the materials needed
to repair the power armor" (i.e. 5 steel, 3 circuitry, 3 aluminum, 3 adhesive). It is not in the
pg 59 upgrade table and does not appear in the pg 95 crafting table.

### 5e. Repairing a suit

**Rule (pg 57–58, "Repair"):**
> "To repair any levels of decay from Power Armor, you must; spend at least 15 minutes per level of
> decay you attempt to repair, have the materials (5 steel, 3 circuitry, 3 aluminum, and 3
> adhesive), and roll a successful Crafting check against the DC listed in the Repair section."

The "Repair section" is the **Repair column of the pg 58 table**: T-45 DC 16, T-51 DC 23,
T-60 DC 20, X-01 DC 25, X-02 DC 25. Power Armor is **not** listed in the pg 94 Item Blueprint
Encyclopedia repair table — this prose is the only repair rule for it.

**Power Armor Master** again (pg 46): "when you repair power armor you spend one less of each
material" → 4 steel, 2 circuitry, 2 aluminum, 2 adhesive.
**Quick Repair** perk (pg 46, req. Int 9): 6 AP removes two levels of decay from *an item*, once
per 8-hour rest; nothing exempts Power Armor.

### 5f. What "broken" means for a suit

**Decay can never break a suit** (pg 57, quoted in §5b). The general "Broken items" rule (pg 92) and
the "Repairing a Broken Item" rule (pg 93, ×5 time and resources, DC +5, comes back at five levels
of decay) are therefore **dead letters for Power Armor** as printed.

The only printed way to lose a suit permanently is the override explosion (pg 58): "The Power Armor
is **destroyed**, and if its user was still inside; they incinerate into carbon molecules."
20d10 explosive in a 20 ft radius, half in 50 ft, and the area becomes a Level 5 Irradiated Zone
decaying 1 level per 24 hours. "Destroyed" is not defined as a game term anywhere and is not the
same word as "broken."

---

## 6. Strength, load, and mobility while worn

**Rule (pg 58), quoted in full:**
> "**Carry Load and Strength Requirement.** All Power Armor has a load of 100. If you are wearing
> the Power Armor, its load is equal to 0, Power Armor has no Strength Requirement as its interior
> chassis supports its user entirely. Even if you are missing limbs, you can still use Power Armor."

**The code assumption is exactly right on both counts.** Load 100 when carried/stowed, **0 when
worn** (note: not halved like normal armor, which is "if you are wearing the armor, its load is
halved", pg 56 — Power Armor gets a full waiver). **No Strength requirement at all**, so the
"slowed" penalty for under-strength armor (pg 56) can never trigger.

Mobility and body-related grants while worn (all pg 57):
- **Hydraulic Machine.** "Your Strength ability score is considered 12 and your size is Large."
- **Longer Strides.** "If you sprint in Power Armor, you move an additional 20 feet." (Sprint is
  5 AP for 50 feet in a line, pg 126/128 — so 70 ft in PA.)
- **Calibrated Impact Servos.** "If an effect, weapon, ability, or perk would knock you prone; you
  can choose to instead spend 5 defense points and not fall prone. If you are subjected to an
  effect that would push you back or pull you, you move half the distance you normally would.
  Additionally, you are resistant to impact damage."
- **Automatic Injector.** "Stimpaks and Chems cost 1 AP to use." (Normally 4 AP for a chem, pg 126.)
- **Lead Plated Exoskeleton.** "You ignore limb conditions and your limbs cannot be severed." Plus
  the radiation band table in §5b.
- **Oxygen Tank.** "You can breathe underwater, however you cannot swim and you sink at a rate of
  100 feet each round." — the one hard *downside* of wearing a suit.
- **Calibrated Shocks** upgrade (pg 59, 1000c): carry load +15 / +15 / +20 by rank.
  **Pocketed** is a *regular* armor upgrade (pg 57) that also raises carry load, +10/+15/+25.

Strength 12 is above the printed ability-score cap of 10 (pg 20: "You can have a maximum of 10 in
an ability score"), and the modifier table only runs to 10 → +5. See §9.

---

## 7. Upgrades and everything else Power-Armor-specific

### 7a. Upgrade slots and attachment

- **Slots** are per model (pg 58 table): T-45 6, T-51 5, T-60 6, X-01 4, X-02 4.
- "Power Armor can be upgraded just like regular armor… Unlike regular armor, Power Armor upgrades
  can be attached to all pieces of armor unless otherwise specified." (pg 57) — i.e. a PA upgrade
  is not locked to one suit *model*, whereas a regular armor upgrade is locked to its material.
- **Attach/remove time: 15 minutes each way** (pg 58), versus **1 minute** for regular armor
  upgrades (pg 56). Do not conflate them.
- **Ranks** are cumulative and each rank costs the base price again; you cannot buy rank N without
  rank N−1 (pg 56/58). "ranks in an upgrade do not count against the armor's slot total" (pg 56,
  stated for regular armor).

### 7b. The Power Armor Upgrades table (pg 59 — verified visually)

| Upgrade | Cost | Rank 1 | Rank 2 | Rank 3 |
|---|---|---|---|---|
| Explosive Shielding | 1350c | Reduce explosive damage taken by 5 | by 10 | by 15 |
| Prism shielding | 1800c | Reduce laser and plasma damage taken by 5 | by 5 | by 10 |
| Emergency protocols | 1800c | If you start your turn with less than half your hit points, you can spend 1 AP to move 10 feet. | If you start your turn with less than half your hit points, your DT increases by 5 (only for damage against HP). | — |
| Kinetic dynamo | 2400c | You gain an additional AP at the start of your turn for each level of decay the power armor gained since your last turn. | — | — |
| Tesla Coils | 2400c | Spend 3 AP to activate or deactivate, each creature within 10 feet of you takes 1d6 electricity damage when you activate and at the start of their turns. For each round active, remove 10 minutes from allotted time. | Electricity damage increases by 1d6. For each round active, remove an additional 5 minutes from allotted time. | Electricity damage increases by 2d6. For each round active, remove an additional 10 minutes from allotted time. |
| Reactive Plates | 2700c | When you take damage from a melee attack, the attacker takes a quarter (rounded down) of the damage they dealt. | The attacker takes another quarter (rounded down) of the damage they dealt. (effectively half of the total). | When you take damage from a melee attack, the attacker is knocked by 15 feet. |
| Core Assembly | 2250c | Spending more than 18 AP on your turn causes overheating instead of 15. | Spending more than 20 AP on your turn causes overheating instead of 15. | Overheating requires 15 minutes of allotted time loss instead of 30. |
| Jet Pack | 6000c | You can spend 1 AP on your turn to fly 5 feet. For every 10 feet you fly or every second that you fly you use 1 minute of the fusion core's allotted time. | — | — |
| Sensor Array | 4500c | Passive sense increases by 5. | +5 | +10 |
| VATS matrix overlay | 2700c | Whenever you make a targeted attack roll, reduce the additional AP cost by 1. | same again | — |
| Internal database | 2400c | If you can see a creature, you can spend 6 AP on your turn to learn its HP total, SP total, AC, or DT. | — | — |
| Targeting HUD | 1800c | If you can see a creature, you can spend 3 AP to mark it. You can only have one marked creature at a time. Whenever you deal damage to a marked creature, you deal an additional die of damage. | You can mark up to two more creatures. | Whenever you deal damage to a marked creature, you deal an additional die of damage. |
| Headlamp | 250c | You can spend 1 AP on your turn to turn on your headlamp. The headlamp shines bright light in a 40 foot cone and dim light for an additional 40. | The bright and dim light both shine an additional 10 feet. | …additional 10 feet. If you turn on this light while in darkness, each creature within 5 feet of you becomes blinded for one round. |
| Rusty knuckles | 100c | If you hit a creature with an unarmed attack, they bleed. | — | — |
| Optimized bracers | 1700c | You can spend 6 AP on your turn to make a powerful unarmed attack that deals 2d6 bludgeoning damage. | The damage increases by 1d6. | The damage increases by 1d6 and pushes targets 15 feet back. |
| Calibrated Shocks | 1000c | Carry Load increases by 15. | +15 | +20 |
| Overclock Hydraulics | 1950c | While overheated, your maximum AP increases by 2, you have advantage on all attack rolls, you can move 15 feet with 1 AP, and your unarmed attacks deal an additional 3d6 fire damage. | You can spend 3 AP to overheat the fusion core. | Your maximum AP increases by 2. |
| Explosive vent | 1250c | If you fall at least 15 feet, when you hit the ground you can choose to activate this upgrade. Each creature within 20 feet of you takes 3d6 fire damage and 3d6 explosive damage. Remove 20 minutes from the armor's allotted time each time you activate this upgrade. | The fire and explosive damage each increase by 1d6. | The radius increases by 10 feet. |
| Super Mutant Fitting | 50% base cost | The armor is modified and fitted to allow a super mutant to use it. However, humans and ghouls can no longer use the armor. Once this upgrade has been added, it requires the same price or crafting materials to remove it. | (single rank) | (single rank) |

Crafting DCs / materials / times for all of these are on **pg 95–96** (all 3 hours except Super
Mutant Fitting at 10 hours; several require both a Crafting and a Science bonus — e.g. Prism
shielding rank 1 is "Crafting +12 and Science +6", Jet Pack and Explosive vent are both
"Crafting +20 and Science +12"). **Super Mutant Fitting (pg 96) lists Crafting DC +15 and 10 hours
but its Crafting Materials cell is blank** — see §8 item 23.

### 7c. Crafting a suit (pg 94–95)

> "Successfully crafting fully functioning power armor is an extremely difficult task. Each day you
> spend crafting power armor, you must succeed the Crafting skill check (unless your crafting bonus
> is equal to the DC) and you must spend the required crafting materials each day. **If you ever
> fail this crafting check, the entire armor build is failed and you must restart.** If another
> creature assists you in crafting power armor, the crafting time is still reduced however you still
> require the same amount of materials. Instead of using the materials each day, multiple all the
> required materials by the original crafting time." (pg 94)

| Type | Crafting DC | Materials | Time |
|---|---|---|---|
| Power Armor Chassis | +20 | x8 aluminum, x2 circuitry, x4 gear, x1 nuclear material, x5 oil, x10 plastic, x3 rubber, x9 screws, x2 spring, x14 steel | 7 days |
| T-45 | +18 | x1 power armor chassis + the same list again | 10 days |
| T-51 | +22 | ″ | 14 days |
| T-60 | +26 | ″ | 18 days |
| X-01 | +30 | ″ | 25 days |
| X-02 | +32 | ″ | 30 days |

### 7d. Every other Power Armor mention in the book

- **pg 9 (Robot race):** "you cannot use power armor."
- **pg 10 (Protectron):** a robot PC can "load a fusion core into your chassis. If you do, you can
  operate for 30 days without requiring fuel." — a competing use for cores, unrelated to PA.
- **pg 11 (Super Mutant):** cannot use PA "unless it is specifically modded to your body type."
- **pg 39 (Sniper perk):** the guaranteed-kill headshot fails if the target "isn't wearing a power
  armor helmet" — i.e. a PA helmet blocks it.
- **pg 46 (Power Armor Master perk):** quoted in §3 and §5d.
- **pg 68 (Dragon's Breath shotgun round):** "when dealing damage to a Robot or a creature in Power
  Armor; the damage is doubled."
- **pg 69 (Corrosive ranged-weapon property):** "Power Armor is unaffected by this condition."
- **pg 74 (Gatling laser):** "1 Fusion Core = 100 rounds" — cores double as heavy-weapon ammo.
- **pg 81 (Hazmat Suit):** flavour comparison only ("the most protection from radiation without
  wearing power armor").
- **pg 102:** Fusion Core "Cannot be crafted."

---

## 8. Contradictions, ambiguities, and undefined mechanics

This is the section that matters. Ordered roughly by how likely you are to hit it in code.

1. **The Strength 20 escape requirement is unreachable.** pg 58: "you cannot escape unless your
   Strength score is equal to 20." The printed cap on an ability score is **10** (pg 20), and
   Hydraulic Machine sets you to **12** while in the suit (pg 57). There is no printed way to reach
   20. Read literally, choosing to override a dead core is a **permanent, unescapable trap** and
   "Escaping in this way decays the Power Armor by 10 levels" is unreachable dead text. Note also
   that "equal to 20" is written as an equality, not "20 or higher." **The book does not resolve
   this.** (Suspected intent: 20 is a leftover from a d20-style Strength scale, or the "12" from
   Hydraulic Machine was meant to be higher.)

2. **Allotted Time is a property of the *suit*, but the rules text treats it as a property of the
   *core*.** The pg 58 table gives Allotted Time per model (T-51 6 hours, X-01 3 hours), but the
   prose says "**the fusion core's** allotted time" (Jet Pack, pg 59), "losing 30 minutes of **its**
   allotted time", "if **a fusion core** only has 30 minutes of its allotted time". Consequences
   the book does not resolve:
   - Does a fresh 200c core give 6 hours in a T-51 and 3 hours in an X-01? (Implied yes by the
     table, which is odd physically.)
   - If you pull a half-drained core out of a T-51 (3 hours left) and slot it into an X-01 (max
     3 hours), what does it have? Undefined.
   - Is remaining time tracked on the core item, or on the suit? Undefined. **You must pick one for
     the data model; the book gives no guidance.**

3. **No base drain rate is printed.** The suit has N hours of allotted time, but the book never says
   how time is consumed — per real-time minute of wear, only while active, only in combat, only
   while moving? All the *named* drains (overheat, Tesla Coils, Jet Pack, Explosive vent) are
   expressed in minutes, which implies the baseline is wall-clock minutes of wear, but this is never
   stated. A 6-second combat round would then cost 0.1 minutes, which the book never says either.

4. **Fusion Core Targeting contradicts itself about damage.** "the attack deals **no damage** to the
   armor or its operator" and then "each time **the fusion core has taken at least 30 damage**".
   The core apparently accumulates damage that the attack explicitly does not deal. Undefined:
   *whose* damage number is tracked (the weapon's rolled damage? before or after DT?), whether the
   30 is **cumulative across the whole combat/session** or must be 30 **in a single hit**, and
   whether the counter **resets** after triggering. "Each time … has taken at least 30 damage" reads
   like a repeating threshold (30, 60, 90…), but that is a reading, not a statement.

5. **Two different overheat durations.** AP-triggered overheat lasts "until the **end** of your next
   turn" (pg 58, Overheating). Core-targeting overheat lasts "until the **start** of its operator's
   next turn" (pg 58, Fusion Core Targeting). The book never reconciles them or says what happens if
   both apply.

6. **Overheat stacking is undefined.** No statement about becoming overheated while already
   overheated: does the 30-minute charge apply again on the second onset, or only at turn start?
   Also undefined: whether an *enemy*-triggered (core targeting) overheat gives the *operator* the
   "override the automatic cooling" choice, or whether that override is only available for the
   self-inflicted AP overheat. The override sentence sits in the Overheating paragraph and reads
   generally, which would let an attacker's hit hand the operator a 20d10 suicide-bomb option.

7. **"If a fusion core only has 30 minutes."** Exactly 30, or 30-or-fewer? What about a core with
   10 minutes left that becomes overheated — the sentence does not cover it, and the general rule
   (lose 30 minutes) would take it negative. Undefined. Note this ejection is *instant* and skips
   the 1-minute emergency reserve and the polite back-opening that a natural time-out gives you.

8. **Power Armor has no DT.** The pg 58 table has columns Name / Base Cost / AC / DP / Slots /
   Repair / Allotted Time — **no DT column**, while every regular armor on pg 56 has one. The book
   never says whether PA has DT 0, or whether you keep some other DT. This matters because several
   upgrades and perks manipulate DT (Emergency protocols rank 2 "+5 DT", Reinforced armor upgrade
   "+1 to DT", Internal database can read a creature's DT). **The book does not say.**

9. **Whether *regular* armor upgrades (pg 57) can go on Power Armor.** pg 57 says "Power Armor can
   be upgraded just like regular armor" and points at "the table below" for slot count, then says
   "For more details on upgrades, see Power Armor Upgrades below" — but pg 59 is a *separate* table
   with a disjoint list. Meanwhile pg 56 constrains regular upgrades by armor *material*
   ("cannot attach it to another set of armor unless it is of the same material"). Can you bolt
   **Hardened** (+1 AC ×3) or **Sturdy** or **Lead Lined** onto a T-60? Undefined. The 15-minute vs
   1-minute attach times also differ between the two tables with no rule saying which applies.

10. **General decay text contradicts itself, before Power Armor even enters.** pg 92: "Any item can
    have a level of decay, **to a total of nine**." Immediately followed by: "When an item gains its
    **tenth** level of decay; it breaks." Ten levels is what every other rule (including all the
    Power Armor rules) uses. The "nine" appears to be the error.

11. **"Escaping in this way decays the Power Armor by 10 levels."** Is that +10 levels (capped at
    10), or set-to-10? If the suit already had 4 levels, does it become 10 or 14? Since 10 is the
    ceiling everywhere else, +10 and set-to-10 are indistinguishable in practice — but the book
    never states a decay ceiling for Power Armor either, only that DP stops refilling at 10.
    **Whether a suit can exceed 10 levels of decay is undefined.**

12. **Power Armor is never "broken", so `broken` has no meaning for a suit.** pg 57 explicitly
    exempts it, which orphans the pg 92 "Broken items" rule and the pg 93 "Repairing a Broken Item"
    rule (×5 cost, DC+5, returns at five levels of decay). If the Foundry system has a shared
    `broken` flag driven by decay ≥ 10, Power Armor must be excluded from it.

13. **Repair DC ambiguity.** For every other item the encyclopedia lists a repair **bonus** and the
    DC is "10 + the bonus listed" (pg 93). The Power Armor table instead prints "**DC 16**",
    "**DC 23**", etc. — already phrased as a DC. Is a T-45 repaired at DC 16, or at 10+16 = 26?
    The pg 58 wording ("roll a successful Crafting check against the DC listed") supports the flat
    reading, but the column is headed "Repair" like the bonus columns elsewhere.

14. **How many decay levels one Power Armor repair check fixes.** pg 93 general rule: "You can
    repair **one** level of decay from any item so long as you succeed a crafting check." pg 58 PA
    rule: "spend at least 15 minutes **per level of decay you attempt to repair**" + one set of
    materials + "**a** successful Crafting check" — singular check, plural levels. Does one check
    at 45 minutes with one material set repair 3 levels? Undefined, and the two readings differ by
    a factor of the number of levels in materials cost.

15. **Failed PA repair.** pg 93 says a failed repair costs half the time and half the materials.
    Nothing says whether that applies to the PA prose rule, which has its own fixed material list.

16. **Nothing describes an unoccupied suit.** No HP, no "the suit remains standing", no rules for
    attacking, moving, looting, or stealing an empty suit, no rule for what a creature can do to a
    suit someone else is *not* in. Its AC (14–18) and DP are printed, and DP persists on the suit —
    but whether an empty suit *has* an AC/DP that anything can interact with is never stated.

17. **A suit with no core installed is completely undefined.** The book only handles a core running
    out *while worn*. It never says whether you can enter a coreless suit, whether a coreless suit
    grants DP/AC/Hydraulic Machine, or whether you are immediately trapped in one.

18. **Restarting a dead suit.** After "Then, it ceases function", the book never says that inserting
    a fresh core revives it. The 5 AP "replace the Fusion Core" action implies it, but the sequence
    (suit opens, ejects you, ceases function) plus the override-trap wording leaves it unstated.

19. **Hydraulic Machine's Strength 12 breaks the ability system.** Scores cap at 10 (pg 20) and the
    modifier table stops at 10 → +5. The stated formula is even printed backwards on pg 20 ("Your
    modifier is equal to 5 minus your score", which would make a 7 give −2, contradicting its own
    example two clauses later). Strength 12 → +7 by the table's actual pattern, but **the book does
    not print a modifier for 12**, and none of the Strength-derived passives (carry load, melee
    damage, Intimidation) are told what to do with it.

20. **Calibrated Impact Servos "resistant to impact damage".** "Impact" is not a damage type
    elsewhere in the damage-type list. Undefined which damage type this maps to (bludgeoning? fall
    damage?).

21. **Does DP-to-0 also trigger the generic armor decay sources?** A critical hit that empties your
    DP would arguably decay the suit twice (once for the crit per pg 92, once for DP hitting 0 per
    pg 57). The book never addresses whether the two stack.

22. **Kinetic dynamo's timing** (pg 59): "an additional AP at the start of your turn for each level
    of decay the power armor gained **since your last turn**." Combined with the DP refill loop, a
    burst that empties DP twice in one round would grant +2 AP — which can push you over the 15 AP
    overheat line, which drains the core. That interaction is presumably intentional but is never
    acknowledged.

23. **Super Mutant Fitting has no crafting materials.** pg 96 gives it Crafting DC **+15** and a
    crafting time of **10 hours**, but the Crafting Materials cell is **empty**. pg 59 says it costs
    "50% base cost" in caps and that removing it "requires the same price **or crafting materials**"
    — which points at a materials list that was never printed.

### Book vs Patch Notes

The patch notes' Power Armor bullets **agree with the printed book** on every point I could check —
this is one of the rare places they didn't drift:

| Patch note claim | Printed book | Verdict |
|---|---|---|
| "Hydraulic Machine now makes your Strength 12 instead of 10." | pg 57: "Your Strength ability score is considered 12" | Agrees |
| "Extended Limbs is removed and replaced with Longer Strides which allows you to move an additional 20 feet when you sprint" | pg 57: "If you sprint in Power Armor, you move an additional 20 feet." | Agrees |
| "Calibrated Impact Servos now lets you spend 5 DP to not fall prone instead of standing up from prone costing 1 AP." | pg 57: "you can choose to instead spend 5 defense points and not fall prone" | Agrees |
| "Automatic Injector makes stimpaks and chems cost 1 AP instead of none." | pg 57: "Stimpaks and Chems cost 1 AP to use." | Agrees |
| "Lead Plated Exoskeleton still protects against radiation, but if the armor decays, it offers less protection." | pg 57 decay bands | Agrees |
| "Jet Pack Upgrade now specifies how long you can use it." | pg 59: 1 minute of allotted time per 10 ft flown / per second flown | Agrees |
| "Explosive vent power armor mod is now craftable" | pg 96: "Explosive vent — Crafting +20 and Science +12 — x5 adhesive, x9 aluminum, x8 asbestos, x10 nuclear material — 3 hours." | Agrees |

The patch notes say nothing about DP, decay, overheating, fusion core targeting, or entering/exiting.
**Where anything conflicts, the printed book governs** — but nothing here conflicts.

The manuscript PDF's Power Armor section is **word-for-word identical** to the printed book,
including the same table values. No divergence to report.

---

## 9. Verify — the flagged code assumptions

| # | Assumption | Verdict | Citation |
|---|---|---|---|
| 1 | Entering/exiting costs **6 AP** | **Yes** | pg 57, "Operation. It costs 6 AP on your turn to enter or exit Power Armor." |
| 2 | Entering/exiting is "an action" | **N/A — the system has no action economy.** It is an AP cost on your turn. It is also *not* in the pg 126 Actions in Combat table. | pg 125–126 |
| 3 | A frame / rack / station is required | **No — no such requirement exists.** | absence across pp. 56–59, 94–95 |
| 4 | Assistance is required to enter/exit | **No — the book does not mention it.** | pg 57 |
| 5 | What happens to a suit with **no Fusion Core** | **Undefined — the book does not say.** Only core *depletion while worn* is covered. | pg 58 |
| 6 | On exit, **DP persists on the suit** | **Yes** | pg 57: "If any creature enters the armor, they gain defense points equal to the amount that previous user had when they exited." |
| 7 | The **next occupant inherits** the depleted DP | **Yes** — same sentence. | pg 57 |
| 8 | The suit stays standing on exit | **Undefined — the book does not say.** No rules at all for an unoccupied suit. | — |
| 9 | Core runtime is in **minutes** | **No — printed in hours, and per suit model, not per core.** T-45 4h, T-51 6h, T-60 4h, X-01 3h, X-02 3h. | pg 58 table (visually verified) |
| 10 | There is a defined base **drain rate** | **No — undefined.** Only the total, plus named extra drains. | pg 58 |
| 11 | Each *upgrade* has a core-drain cost | **Partly.** Only 4 upgrades drain: Tesla Coils (10/+5/+10 min per round active), Jet Pack (1 min per 10 ft or per second flown), Explosive vent (20 min per activation), and Core Assembly rank 3 *reduces* overheat drain 30→15. All others cost nothing. | pg 59 |
| 12 | At 0 minutes the suit **stops working entirely** | **Yes, but staged**: 1 minute of emergency reserve → suit opens its back to let you out → "Then, it ceases function." Not partial. | pg 58 |
| 13 | Swapping a core costs **5 AP** | **Yes** | pg 58: "You can spend 5 AP on your turn to replace the Fusion Core on a set of Power Armor." |
| 14 | Overheat trigger is **AP spent in a turn** (not movement only) | **Yes** — "If you spend more than 15 AP on a turn while you wear Power Armor". Any AP, strictly >15. | pg 58 |
| 15 | Overheat consequence | **−30 minutes of allotted time**, charged on onset and again at each of your turn-starts while overheated. **No other consequence.** | pg 58 |
| 16 | Overheat **stacks** | **Undefined — the book does not say.** Written as a binary state. | pg 58 |
| 17 | Overheat **clears** | **Automatically at the end of your next turn** (AP-triggered) / **at the start of the operator's next turn** (core-targeting-triggered). Two different durations. | pg 58 |
| 18 | PA "Overheating" == the environmental **Overheating condition** | **No — two different rules sharing a name.** PA overheat is a binary state on the armor draining allotted time. The condition is a 1–10 leveled *creature* condition from Extreme Heat that penalizes d20s, cuts AP, and kills at level 10. Neither references the other. **Implement them separately.** | pg 58 vs pg 123 + pg 134 |
| 19 | Fusion Core Targeting AP cost | **+5 AP additional**, on top of the weapon's normal cost. Reducible to +3 with VATS matrix overlay rank 2. | pg 58, pg 59 |
| 20 | Fusion Core Targeting has a **DC or AC modifier** | **No — none printed.** Unlike Eyes/Head on pg 129, no attack-roll modifier and no separate AC for the core. Requirement is only line-of-sight to the wearer's **back**. | pg 58, pg 129 |
| 21 | Fusion Core Targeting damage/effect | **No damage, no condition.** Only: once the core "has taken at least 30 damage" it becomes overheated until the start of the operator's next turn. | pg 58 |
| 22 | Fusion Core Targeting **destroys the core** | **No — the book never says it does.** The only core destruction in print is the operator's voluntary override explosion. | pg 58 |
| 23 | Power Armor has **10 decay levels** (`decayMax = 10`) | **Yes** — 10 is where DP refill stops and where radiation protection ends. | pg 57 |
| 24 | Emptying DP **refills the pool at the cost of one decay level** | **Yes, exactly**, and overflow damage carries into the refilled pool (worked example: 15 DP − 20 dmg → 0, +1 decay, +15, −5 = 10 DP). Stops working at 10 levels of decay. | pg 57 |
| 25 | Each decay level has an effect | **No.** "levels of decay do not apply any negative effects to the armor or user (besides a loss in defense points)". Only three thresholds exist: <6 / 6–9 / 10, all radiation-related, plus the DP-refill cutoff at 10. | pg 57 |
| 26 | "Broken" means something for a suit | **No.** "Power Armor does not cease to function when it reaches 10 levels of decay." A suit is never broken by decay; it can only be **destroyed** by the fusion core explosion. | pg 57, pg 58 |
| 27 | Power Armor imposes **no Strength requirement** | **Yes** — "Power Armor has no Strength Requirement as its interior chassis supports its user entirely." | pg 58 |
| 28 | Power Armor imposes **no load while worn** | **Yes** — "All Power Armor has a load of 100. If you are wearing the Power Armor, its load is equal to 0." (Note: 0, not halved — unlike regular armor.) | pg 58 |

---

## 10. Explicit rejection list — considered and left out

- **The regular Armor Upgrades table (pg 57)** — Insulated, Camouflage, Light, Fitted, Lead Lined,
  Strengthened, Sturdy, Pocketed, Reinforced, Hardened. Left out of the Power Armor upgrade data
  because they live under the *regular* armor rules with material-locking and 1-minute attach times,
  and pg 59 gives Power Armor its own disjoint list. **But flagged in §8 item 9** as a genuine
  ambiguity, because pg 57 does say "Power Armor can be upgraded just like regular armor."
- **The full pg 92–93 Decay and Repair chapter** — summarised only where Power Armor overrides or
  inherits it. The general per-level AC/DT penalty, weapon decay on a natural 1, "Using another
  Weapon for Repair Materials", etc. are not Power Armor rules.
- **Pg 128–129 general targeted-attack machinery** — the d4 condition roll, severe injuries, the
  limb table, the melee −2 AP discount. Included only as the *baseline* against which Fusion Core
  Targeting is defined; the core explicitly deals no damage and applies no condition, so none of the
  condition/severe-injury machinery fires. (I did note the melee −2 AP discount as an open question
  in passing — but it is stated for "a targeted attack with a melee weapon", and whether the fusion
  core counts as a limb for that purpose is not worth asserting either way; the book does not say.)
- **The Hazmat Suit (pg 81)** — mentions power armor only as a flavour comparison, no mechanical
  interaction.
- **Robot PC fusion core use (pg 10)** — "load a fusion core into your chassis… operate for 30 days
  without requiring fuel." This is a *robot race* rule with no Power Armor connection beyond sharing
  the core item. Listed in §7d for completeness, not modelled as a PA mechanic.
- **Gatling laser (pg 74, "1 Fusion Core = 100 rounds")** — a weapon ammo rule. Noted in §7d because
  it competes for the same item, not because it is a PA rule.
- **Backgrounds/starting-equipment lists (pp 25–35)** — many mention "levels of decay" on starting
  gear. None grant or mention Power Armor. Grepped, checked, discarded.
- **The v2.0 book (`Fallout TTRPG v2.0 (PDF).pdf`)** — not consulted. v2.1 is the target and the
  patch notes already summarise the deltas; pulling v2.0 differences in would invite exactly the
  kind of stale-rule contamination this pass is meant to avoid.
- **Verbatim per-rank crafting material lists for all 19 Power Armor upgrades (pg 95–96)** — read
  and confirmed present, but not reproduced row-by-row here; they are a straight data-entry job for
  the compendium, not a rules question. The two things worth knowing from them are captured above:
  several upgrades gate on a **Science** bonus as well as Crafting, and Super Mutant Fitting's
  materials cell is blank.
- **Any "power armor frame" concept from the video games** — deliberately excluded. The book has no
  frame, no rack, no station, and no "power armor without the frame" state. Inventing one would be
  exactly the kind of fabrication this report is supposed to prevent.

---

## 11. Implementing the pg 59 upgrade table (added by the upgrades pass)

The table above was re-read from the page image (`pdftoppm`/`pdftotext -layout`, pg 59) before any
of this was written; the transcription in §7b is correct in every cell. What follows is only what
implementing it forced into the open. Nothing above was changed.

### 11a. Two rows use the same words for two different arithmetics

Pg 58 prints the general rank rule: *"Each rank grants a new ability which adds on to the previous
one. IE: If you have a Rank 3 upgrade, it has the abilities of Rank 1, 2, and 3."* The table then
uses two incompatible conventions and never labels them:

- **Delta phrasing** — "Passive sense increases by 5 / by 5 / by 10", "Carry Load increases by
  15 / by 15 / by 20". These plainly add: **5/10/20** and **15/30/50**. The regular armor table on
  pg 57 does the same (Reinforced +1/+1/+2 DT, Pocketed +10/+15/+25).
- **Restatement phrasing** — the whole sentence repeated with a bigger absolute number. Pg 57's
  **Sturdy** is the unambiguous case: "the first **2** levels of decay", then "the first **4**
  levels" — 4 is a total, not two more. **Explosive Shielding** is written this way (by 5 / by 10 /
  by 15) and is read as totals: **5/10/15**.

**Prism shielding breaks both readings.** It is restatement-phrased but does not escalate: "by 5 /
by 5 / by 10". Read as totals, rank 2 costs 1,800 caps and changes nothing at all. Read as deltas
it is 5/10/20. *Ruling:* deltas — **5/10/20** — because the alternative makes a printed, purchasable
rank a no-op, and a rule that does nothing is the one reading the house style forbids. This is
recorded as ours, not as printed; the two constants sit next to each other in
`src/rules/power-armor.ts` and swapping them is one line.

### 11b. Undefined things the upgrades forced a decision on

| # | The gap | Ruling |
|---|---|---|
| 24 | **Tesla Coils: "for each round active" never says *when* a round is charged.** A round is not a thing this system can observe directly; only turns are. | Charged on activation and again at the start of each of the wearer's turns while the coils are on. Otherwise a wearer who switched them on and off inside a turn would pay nothing. |
| 25 | **Jet Pack prints two different rates in one sentence** — "for every 10 feet you fly **or** every second that you fly". A round has no printed length in seconds anywhere in the combat chapter. | Charge by distance. Partial increments round **up**: the smallest possible flight is 5 feet (1 AP), and rounding down would make half of every flight free. |
| 26 | **Reactive Plates' arithmetic contradicts its own gloss.** "a quarter (rounded down)" twice, then "(effectively half of the total)". For 7 damage that is 1+1=2, not 3. | Keep the mechanic (two floored quarters), drop the gloss. "Rounded down" is stated twice; "effectively half" is an aside. |
| 27 | **Emergency protocols rank 2 has a trigger and no duration.** "If you start your turn with less than half your hit points, your DT increases by 5" — for how long? | Read as *while* under half, re-evaluated at each turn start and on every sync. The book does not say whether being healed above half mid-turn takes the DT away. |
| 28 | **Overclock Hydraulics rank 1 and rank 3 both grant +2 maximum AP** and the ranks are cumulative. | Both apply: a rank 3 suit that is overheated carries +4. Follows the printed rank rule; the book never acknowledges the stack. |
| 29 | **Overclock rank 2 lets you overheat on purpose, and the pg 58 ejection rule is not carved out for it.** A suit at 30 minutes or less that becomes overheated "ejects the user and ceases function". | No carve-out. Deliberately overheating a nearly-dead core throws you out of the suit. |
| 30 | **VATS matrix overlay has no floor.** "reduce the additional AP cost by 1" per rank, against surcharges as low as +2 (torso/leg, pg 129). | Floored at 0. A negative surcharge would refund AP for aiming. |
| 31 | **Super Mutant Fitting's exclusion list names "humans and ghouls" only.** Gen-2 Synths are not mentioned, and Robots are already barred by pg 9. | Follow the printed list literally: a Gen-2 Synth may wear a fitted suit. The book could have written "anyone but a super mutant" and did not. |
| 32 | **Kinetic dynamo needs "the decay the suit had at your last turn"**, which nothing stored. | A `decayLastTurn` snapshot on the suit, written at each of the wearer's turn starts. Note the loop the book never acknowledges: emptying the DP pool decays the suit, which hands back AP, which can push the turn over the overheat line, which drains the core. |
| 33 | **Whether shielding applies before or after Defense Points** is not stated, and neither is whether it can take a hit below zero. | It reduces "damage taken", so it belongs at the top of the pipeline, floored at zero. |

### 11c. Rejection list — automatable in principle, deliberately left as text

- **Targeting HUD** (1800c). A mark is state about *another creature*, and the extra die is added
  inside the attack roll. Neither is suit state, and there is no per-creature flag store here.
- **Headlamp** (250c). Bright/dim cones are token lighting configuration. This system has never
  written a token's light, and the rank 3 blinding rider needs "creatures within 5 feet in
  darkness", which is scene geometry rather than sheet state.
- **Rusty knuckles** (100c). "If you hit a creature with an unarmed attack, they bleed" — applying
  Bleeding needs the attack roll to know it landed and on whom.
- **Emergency protocols rank 1** (1 AP to move 10 feet under half hit points). Nothing in this
  system meters movement; the same reason difficult terrain (roadmap A3) is not enforced.
- **Overclock Hydraulics rank 1's other two halves** (15 feet for 1 AP; +3d6 fire on unarmed
  attacks). The first is movement again; the second is a damage rider on an attack the suit does not
  own. Both are announced on the chat card at the moment they are actually in force.
- **Explosive Shielding / Prism shielding / Reactive Plates / VATS matrix overlay.** The arithmetic
  is implemented and tested; the *application* belongs to the damage pipeline and the targeted-attack
  table, which are not part of this subsystem. Reported as helpers with exact call sites rather than
  half-wired.
- **Hydraulic Machine's "your size is Large"** (pg 57). No creature in this system has a size, and
  the only printed consumers are the grapple size clauses (pg 63) and Help (pg 126). Reported on the
  entry card.
- **Longer Strides** (pg 57). There is no movement budget to add 20 feet to, so the suited sprint
  distance (70 feet) is reported on entry and exposed as `sprintFeet()`.
- **The 15-minute attach/remove time** for a Power Armor upgrade (pg 58, against 1 minute for a
  regular one, pg 56). A downtime clock with no state to change; ranks are edited directly.
- **Costs and crafting.** Every rank costs the base price again (pg 58) and the crafting rows are on
  pg 95-96. Cost is carried on the upgrade catalogue for the sheet; nothing here spends caps.
