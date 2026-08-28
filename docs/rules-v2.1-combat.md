# Fallout TTRPG v2.0 → v2.1 — Rules DELTA (Character Creation, Races, Abilities, Combat, Conditions)

Scope: v2.1 pages **4–33** and **125–136**, diffed against v2.0. Companion to `docs/rules-reference.md`
(which is v2.0-derived). **Anything listed in §1 means `rules-reference.md` is now wrong.**

Sources, both offset 0 (printed page == PDF page index):
- `FALLOUT TTRPG 2.1.pdf` — 136 pp. **Authoritative.** Book ends with Conditions on pg 135; pg 136 blank.
  (v2.1 drops v2.0's GM Section / loot tables / statblocks, v2.0 pp. 138–179.)
- `Fallout TTRPG v2.0 (PDF).pdf` — 179 pp.
- `manuscript Fallout TTRPG v2.1.pdf` — **unformatted draft; diverges from the printed book. Do not trust it.** See §1.4.
- `Patch Notes_ Fallout 2.1.pdf` — **unreliable.** Its head-AP claim is exactly backwards. See §2.1.

Every table below was read visually as a rendered page image in **both** editions.

---

## 1. Changed rules

### 1.1 Luck is exempt from "Mortal Detriments" — the single biggest change

**v2.0 (pg 135–136):** every leveled detriment reads *"Whenever you roll a d20, the total is subtracted by 1
for each level of X."* No exemption anywhere. `rules-reference.md` correctly modelled this as a flat penalty
on every d20.

**v2.1 (pg 25, Luck section) — new paragraph, verbatim:**

> ***Unaffected by Mortal Detriments.*** *If you have levels of Hunger, Dehydration, Fatigue, Exhaustion,
> Radiation, or Overheating; Luck rolls are unaffected by these levels.*

**v2.1 (pg 133–135)** re-words each condition to match. The exact new phrase, identical in every one:

> *"Whenever you roll a d20 **(besides Luck)**, the total is subtracted by 1 for each level of X."*

Conditions carrying the `(besides Luck)` clause in v2.1:

| Condition | v2.1 pg | Penalty |
|---|---|---|
| Dehydration | 133 | −1 per level |
| Exhaustion | 133 | −1 per level |
| Fatigue | 133 | −1 per level |
| Hunger | 134 | −1 per level |
| Hypothermia | 134 | −1 per level (**+ AP reduced by `floor(levels/2)`**) |
| Overheating | 134 | −1 per level (**+ AP reduced by `floor(levels/2)`**) |
| Radiation or Rads | 135 | −1 per level |
| **Hammered** | 134 | **−5 flat** (`"whenever you roll a d20 (besides Luck) it is subtracted by 5"`) |

**Exact scope — what "a Luck roll" is.** The book never defines the term. Mechanically, in this system Luck
governs **no skill** (all 14 skills are governed by the other six abilities, pg 19/21), so the exemption
cannot mean "Luck-based skill checks." What is left, i.e. every d20 that adds the **Luck modifier**:

- Luck **ability checks** (incl. the GM's optional combat-sequence tie-break Luck check, pg 125).
- **Blind attacks** — `d20 + Luck mod` vs `DC 5 + (feet/5)` (pg 128). This is an attack roll but its modifier
  is Luck, so it is exempt.
- The **Radiation death Luck check, DC 20** (pg 135) and the disease Luck check from the new
  *Immuno-Four-Leaf Clover* perk.
- **Death Saves *only when the player elects the Luck modifier***. Death save = `d20 + (Luck mod OR END mod)
  + Party Nerve` (pg 25, pg 131). The rules give the player the choice per save; choosing Luck makes it a
  Luck roll and therefore exempt, choosing Endurance does not. **This is the one genuinely ambiguous case
  and it is load-bearing** — a starving, irradiated PC can now dodge a −8 on death saves by picking Luck.
  Recommend implementing the exemption keyed off *which modifier the roll actually uses*.
- **NOT exempt:** attack rolls (weapon skill), all 14 skill checks, all non-Luck ability checks, combat
  sequence (a Perception check), and the crit-chance reduction (that is a threshold shift, not a d20 total).
  The half-Luck bonus to skills (pg 25) is unchanged and does **not** make a skill check a "Luck roll."

**Two inconsistencies in the printed book, flag them:**
1. The pg 25 list omits **Hypothermia**, but Hypothermia's own entry (pg 134) *does* carry `(besides Luck)`.
   The condition text is more specific; treat Hypothermia as exempt (8 conditions total, not 6).
2. The pg 25 list omits **Hammered**, whose entry (pg 134) also carries `(besides Luck)`.

`rules-reference.md` line 94 ("−1 per level to all d20") is now wrong for all eight conditions above.

### 1.2 Character Creation checklist (pg 4) — steps renumbered, 22 → 24

v2.0 pg 4 order: 4 skill bonuses → 5 half-Luck → 6 **Background** → 7 traits … 22 damage bonus (ends).
v2.1 pg 4 order:

| Step | v2.1 pg 4 | v2.0 equivalent |
|---|---|---|
| 4 | **Choose your Background** (+2 to three skills) | step 6 |
| 5 | Calculate skill bonuses | step 4 |
| 6 | Add `floor(Luck mod / 2)` to all skills | step 5 |
| 7 | Optional 1–2 Traits (+ Wild Wasteland) | step 7 |
| 8–20 | SP, HP, AP, Healing Rate, Carry Load, Passive Sense, Party Nerve, Group Sneak, equipment/850 caps, AC, DT, Hunger/Dehydration/Exhaustion = 0, Radiation DC | identical, same numbers |
| 21–22 | Attack bonus, damage bonus | identical |
| **23** | **Choose a Perk that you meet the requirements for** | *(did not exist)* |
| **24** | Traits, if not already chosen | *(did not exist)* |

Everything else on pg 4 is byte-identical, **including the modifier wording bug**: v2.1 still prints
*"your modifier is equal to 5 minus your score"* with the example *"7 in Luck → +2, 3 in Strength → −2"*.
Formula remains `mod = score − 5`.

### 1.3 Races (pg 7–12)

- **Human — `Tenacity` (NEW, pg 7):** *"When you roll death saves, you die when you fail your fourth death
  save instead of your third."* v2.0 pg 8 Human had only Age + Size. Successes are unchanged (3 → 1 HP).
  So for Humans: **3 successes = stabilise, 4 failures = death.** The generic rule on pg 131 still prints
  *"If you fail 3 Death Saves, you die"* — Tenacity is the race-level override.
  Note the interaction with `Rolling 1 or 20` (pg 131): a nat 1 is still **two** failures, so a Human can
  still die from two nat-1s, and Bleeding still auto-fails one save per turn.
  Human variants `Resourceful` / `Unexposed` / `Gen 3 Synth` unchanged.
- **Ghoul, Gen-2 Synth, Robot, Super Mutant, all sub-types, all backgrounds (pg 13–18):
  no mechanical change.** Verified sentence-by-sentence. Only cosmetic edits ("ghouls" → "feral ghouls" in
  the Mercenary background blurb; headings set in caps).

### 1.4 Two patch-note claims the printed v2.1 book does NOT contain

Verified visually on v2.1 pg 9. The **manuscript** has both; the **published book does not**. Implement the book.

| Patch note claims | v2.1 book, pg 9 (verbatim) | Manuscript (rejected) |
|---|---|---|
| "Inorganic Body … updated" | Robot: *"You cannot gain radiation levels, you are immune to radiation damage and poison damage. You cannot gain levels of bleeding. You gain no effects from Chems, Drinks or Food…"* — **identical to v2.0 pg 12**. Gen-2 Synth: *"You are immune to radiation and poison. You gain no effects from Chems, Drinks or Food…"* — **identical to v2.0 pg 10**. | adds *"…and Disease"* and *"…or Medicine (except for RobCo Quick Fix-its)"* |
| "Robots are now resistant to damage dealt from targeted attacks" | `Severed Limbs` (pg 9) contains **no such sentence**. | inserts *"You are resistant to damage dealt from targeted attacks."* |

**Do not implement either.** Robots remain immune to Bleeding (which is why Short Circuit exists, §3).

### 1.5 Actions in Combat (pg 126–127)

AP-cost table is **numerically identical** to v2.0 pg 128 in every row. Only one row is renamed.
The *resolutions* changed:

| Action | AP | v2.0 (pg 128–129) | v2.1 (pg 126–127) |
|---|---|---|---|
| **Escape** *(was "Escape a Grapple")* | 5 | contested `STR or AGI` check vs grappler's `STR` check | **`Unarmed` skill check vs `DC 10 + target's Unarmed skill`. Success *or a raw 20* = escape.** Also covers restraints and chokeholds. |
| **Grapple** | 3 | contested `STR` check vs target's `STR or AGI` | **`Unarmed` skill check vs `DC 10 + target's Unarmed skill`. Success *or a raw 20* = grappled.** |
| **Help** | 6 | target gains **advantage** on its next ability check | target adds **`floor(your bonus in the related skill / 2)`** to its next ability check. *(Attack-aid branch unchanged: ally's first attack roll before your next turn has advantage.)* |
| **Ready** | +2 | *"nor do you regain the AP if the trigger never occurs"* | **if the trigger never occurs you recycle `floor(total AP used / 2)` at the start of your next turn** |
| **Reload** | 6 | — | **"You must have a free hand in order to reload."** |
| **Move 5 feet** | 1 | difficult terrain blocks | **"An enemy space is considered difficult terrain."** |
| Dodge, Equip, Hide, Interact, Search, Shove, Sprint, Stand from Prone, Stow, Take Cover, Unarmed Strike, Use a Chem, Attack | 6/3/6/3/3/4/5/5/3/3/3/4/weapon | — | **unchanged, verbatim** |

Related (v2.1 pg 116, outside scope but it changes the cost of `Move 5 feet`):
**Difficult terrain now costs `+1 AP per 5 ft` (2 AP total), extreme difficult terrain `+2 AP` (3 AP total).**
v2.0 instead capped you at 20 ft of difficult terrain per turn. Enemy spaces are difficult terrain.

### 1.6 Attacks (pg 127–128)

| Rule | v2.0 (pg 129–130) | v2.1 (pg 127–128) |
|---|---|---|
| **Unarmed** | *"Unarmed attacks cost 3 AP. 1d4 + STR or AGI mod bludgeoning."* | same, **plus: "you can make two unarmed strikes by spending 5 AP."** |
| **Blocking** | *"While **unarmed or** wielding a melee weapon, you can spend 3 AP to block."* | *"**While wielding a melee weapon**, you can spend 3 AP to block."* — **you can no longer block unarmed.** DT bonus unchanged: `+2 + END mod` vs melee, until you attack again. |
| **Improvised Attack** | *(did not exist)* | **NEW.** Melee Weapons skill at **disadvantage** (unless *Never Unarmed* perk). GM sets AP/damage; baseline table by object Load (see §1.7). |
| Critical Hit / Critical Failure / Sneak Attack / Blind Attack | — | **unchanged, verbatim** (crit chance still lowered by `floor(Luck mod / 2)`, shotguns excepted; nat 1 = auto-miss + 1 decay; sneak attack = auto-crit ignoring SP but must beat AC; blind attack = `d20 + Luck mod` vs `DC 5 + floor(feet/5)`) |

### 1.7 Improvised Attack table (NEW, v2.1 pg 128)

| Object Load | AP | Damage | Thrown Distance (× STR score) |
|---|---|---|---|
| 2 or less | 3 | `1d4 + STR` | ×6 / ×12 |
| 3 to 9 | 4 | `1d8 + STR` | ×4 / ×10 |
| 10 to 15 | 4 | `1d10 + STR` | ×3 / ×8 |
| 16 to 20 | 5 | `2d8 + STR` | ×3 / ×6 |
| 21 to 30 | 5 | `3d6 + STR` | ×3 / ×5 |
| 31 to 40 | 6 | `3d10 + STR` | ×2 / ×4 |
| 50+ | 7+ | `4d12 + STR` | ×1 |

*(The book prints no row for Load 41–49.)*

### 1.8 Targeted Attacks (pg 128–129) — see §2 for the full table

Prose is **unchanged verbatim** between editions: choose a limb, pay the extra AP, on **HP damage** roll d4
for the condition (re-rollable `Luck mod` times, **must take the new result**, pg 25), crit → severe injury
*or* up to two chosen conditions, **melee weapons reduce the extra AP by 2 to a minimum of 1**.
All 12 severe-injury definitions (Eye Gouged, Concussion, Broken Arm, Severed Arm/Hand, Rattled, Sliced
Jugular, Temporary Blindness, Internal Bleeding, Intense Agony, Severed Leg/Foot, Gut Wallop, Painful
Collapse, Leg Cripple) are **byte-identical** to v2.0 pg 130.

Only the **table cells** changed. Also relevant, from the equipment chapter (v2.1 pg ~47):
**`Dismember` melee property reworked** — v2.0: *"they gain a random arm or leg condition"*;
v2.1: ***"Targeted attacks to the arms or legs with this weapon do not cost additional AP."***
(The sever-on-0-HP clause survives in both.) This zeroes the arm/leg AP surcharge, it does not merely
reduce it by 2.

### 1.9 Cover, Damage and Healing (pg 130–132)

**Entirely unchanged.** Verified against v2.0 pp. 132–134 line by line: half cover `+2 AC`, three-quarters
`+5 AC`, total cover untargetable, both partial grades give **resistance to explosive/trap damage from
beyond the cover**, using a creature as cover means an attack roll of **6 or below** hits the covering
creature; damage types, resistance = halved / vulnerability = doubled, order of damage, temp SP/HP,
Dropping to 0 HP, Severe Injuries on overflow, Instant Death at 3× HP max, Death Saves DC 10,
Damage at 0 HP, Stabilizing (6 AP, `Medicine` vs `DC 10 − target's END mod` → 1 HP), Knocking Out
(`1d4 − END mod` hours, min 1).

One wording edit only: v2.0 *"**At the beginning of each of your turns**, you can spend 2 AP to make a Death
Save"* → v2.1 *"You can spend 2 AP to make a Death Save with a DC of 10."* The auto-fail clause still reads
*"If you do not make a Death Save at the beginning of your turn, you automatically fail it."* Net effect:
the timing restriction is gone; the once-per-turn auto-fail remains.

`rules-reference.md` never recorded the cover AC bonuses or the Stabilize action — add them, they are correct
in both editions.

### 1.10 Other small deltas inside scope

| Rule | v2.0 | v2.1 | pg |
|---|---|---|---|
| AP guide prose | "an AP cost between 1 and 6" | "an AP cost **typically between 3 and 6** points" | 125 |
| Healing Rate sources | rest 8h, certain foods, First Aid perk, stimpak (non-robot) | + **RobCo Quick Fix-It** | 22 |
| Medicine field-aid DC | `10 + failed death saves − successful death saves` | `10 + failed death saves **and** their successful death saves` (**minus sign dropped — almost certainly a typo; keep the v2.0 subtraction**) | 21 |
| Frightened check ability | Endurance only | **Endurance *or* Charisma** | 134 |
| Radiation damage | `1d12` to HP, unhealable while in an irradiated zone | **`1d4` to HP *and* SP, unhealable until you have 0 rad levels** | 135 |

**Unchanged and re-verified in scope:** DC ladder (1/4/8/12/16/20/25/30), the 14-skill list and their
governing abilities, ability scores 1–10 starting at 5 with 3 points, Radiation DC `12 − END mod`,
Party Nerve, Group Sneak, Karma Caps (incl. the Luck-10 bonus cap), half-Luck skill bonus (incl. the
"negative Luck mod → all skill bonuses −1 regardless" clause, which was already in v2.0), Traits chapter
roster (all 30+ names present in both editions; chapter merely shifted from pg 25 to pg 26), all 12
Backgrounds and their `+2` skill triples and starting kits.

---

## 2. The full v2.1 Targeted Attack Table (pg 129)

Column header in v2.1 is **"AP cost + Modifiers"** (v2.0: just "AP cost").
Extra AP is **additive to the weapon's own AP cost**. Melee weapons: `extra_AP = max(1, listed − 2)`.
Weapons with `Dismember`: arm/leg `extra_AP = 0`.

| Target | AP cost + Modifiers | Effects | Condition 1 | Condition 2 | Condition 3 | Condition 4 | Severe Injury |
|---|---|---|---|---|---|---|---|
| **Eyes** | **+5**, to hit ranged attack modifier is halved. | The total damage is halved. | −5 to all attack rolls for **two turns**. | Disadvantage to all attack rolls for **two turns**. | Blinded for **two turns**. | *Temporary Blindness.* | *Eye Gouged.* |
| **Head** | **+3**, to hit ranged attack modifier is halved. | Damage dice is increased by 1. *(Example: 1d10 to 2d10)* | −2 to all attack rolls for **two turns**. | −5 to all attack rolls for **two turns**. | **−2 AP for two turns.** | *Rattled.* | *Sliced Jugular or Concussion.* |
| **Arm** | **+3** | Damage dice is decreased by 1 **to minimum of 1**. *(Example: 2d10 to 1d10)* | Target drops whatever they are holding in that arm. | −2 to all attack rolls for **two turns**. | −5 to all attack rolls for **two turns**. | *Broken Arm.* | *Severed Arm/Hand.* |
| **Torso** | **+2** | None. | No condition. | No condition. | **−2 AP for two turns.** | *Gut Wallop.* | *Internal Bleeding.* |
| **Groin** | **+3** | None. | **−2 AP for two turns.** | **−3 AP for two turns.** | The target falls prone. | *Painful Collapse.* | *Intense Agony.* |
| **Leg** | **+2** | Damage dice is decreased by 1 **to minimum of 1**. *(Example: 2d10 to 1d10)* | **Can only move a maximum of 30 feet for two turns.** | **Can only move a maximum of 20 feet for two turns.** | **Can only move a maximum of 15 feet for two turns.** | *Leg Cripple.* | *Severed Leg/Foot.* |
| **Held or Carried Object** | **+4** | Target object gains one level of decay. Target creature takes no damage. | Target object gains two levels of decay. | Target object flies one foot away. | Object flies `1d4 × 5` feet away. | Choose either condition 1, 2, or 3. | The target object is destroyed beyond repair **(GM's discretion)**. |

### 2.1 The head row — definitive

| Edition | Page | Head AP |
|---|---|---|
| **v2.0** | 131 | **+4** |
| **v2.1** | 129 | **+3** |

**The patch note is exactly backwards.** It says *"attacking the head now costs 4 AP instead of 3"*; the
books say the head went **from +4 down to +3**. The current implementation hardcodes head = 4, which was
right for v2.0 and is **wrong for v2.1**. It must become **3**.

### 2.2 Every other v2.0 → v2.1 table diff

| Cell | v2.0 (pg 131) | v2.1 (pg 129) |
|---|---|---|
| Head AP | **+4** | **+3** |
| **Held/Carried Object AP** | **+3** | **+4** |
| Eyes AP modifier | *(none)* | **"to hit ranged attack modifier is halved"** |
| Head AP modifier | *(none)* | **"to hit ranged attack modifier is halved"** |
| All "until the end of the target's next turn" durations | "until the end of the target's next turn" | **"for two turns"** (eyes 1/2/3, head 1/2, arm 2/3) |
| Head cond. 3 | "At the start of the target's next turn, they lose 2 AP." | **"−2 AP for two turns."** |
| Torso cond. 3 | "At the start of the target's next turn, they lose 2 AP." | **"−2 AP for two turns."** |
| Groin cond. 1 | "At the start of the target's next turn, they lose 2 AP." | **"−2 AP for two turns."** |
| Groin cond. 2 | "At the start of the target's next turn, they lose 3 AP." | **"−3 AP for two turns."** |
| Leg cond. 1 | **"No condition."** | **"Can only move a maximum of 30 feet for two turns."** |
| Leg cond. 2 | "Target can only move a maximum of 30 feet on their next turn." | **"Can only move a maximum of 20 feet for two turns."** |
| Leg cond. 3 | "Target can only move a maximum of 20 feet on their next turn." | **"Can only move a maximum of 15 feet for two turns."** |
| Leg Effects | "Decrease Damage by 1 dice." | "Damage dice is decreased by 1 **to minimum of 1**." |
| Arm Effects | "Damage dice is decreased by 1." | "Damage dice is decreased by 1 **to minimum of 1**." |
| Arm Severe Injury | ***Severed Hand.*** | ***Severed Arm/Hand.*** |
| Leg Severe Injury | ***Severed Foot.*** | ***Severed Leg/Foot.*** |
| Object Severe Injury | "…destroyed beyond repair." | "…destroyed beyond repair **(GM's discretion)**." |
| Eyes/Torso/Groin AP; Arm AP; all Cond. 4 entries | +5 / +2 / +3, +3 | **unchanged** |

Unchanged: Torso conditions 1 and 2 are **still "No condition."** in both editions.
The leg row **gained** a Condition 1 (v2.0's leg had a dead slot); every limb now has four live conditions
except Torso, which still has two dead slots.

### 2.3 The eyes/head "modifier" cell — ambiguity to resolve with the GM

The cell reads verbatim: *"+5, to hit ranged attack modifier is halved."*
The patch note glosses it as *"attacking the eyes and head now halves the **range of the weapon**."*
Two readings:
- **(a)** the weapon's **range multipliers** (`×N normal / ×N long`, applied to PER score) are halved —
  matches the patch note;
- **(b)** the **attack-roll bonus** is halved.

Reading (a) is the intended one per the patch note and is the only one where the word "ranged" does work.
Implement (a); make it a config flag.

---

## 3. The full v2.1 Conditions list (pg 133–135)

**29 conditions in v2.1** (v2.0 pg 135–137 had **27**): **3 new**, **1 removed**, **5 reworked**.
`Dying` and `Diseased` are referenced elsewhere but are **not** entries in the Conditions chapter in either
edition. `Frightened` has 4 sub-modes.

Legend: 🆕 new · ❌ removed · 🔧 reworked · = unchanged.

| # | Condition | v2.1 mechanics (pg) | Status |
|---|---|---|---|
| 1 | **Blinded** | Can't see; auto-fails any sight-based ability check; attacks against it have advantage; may attack via blind attack if aware. (133) | = |
| 2 | **Bleeding** *(leveled)* | Start of your turn: lose `floor(healingRate / 2)` HP **per level**. A dying creature with any levels **auto-fails a death save at the start of its turn**. Healing a bleeding creature grants **0 HP** and instead removes **2 levels**. (133) | = *(2nd-person rewording only)* |
| 3 | **Burning** | `1d10` fire at the start of your turns; **6 AP** to put yourself out. (133) | = |
| 4 | **Buzzed** | Disadvantage on all INT and PER ability **and** skill checks; advantage on all END and STR ability **and** skill checks. (133) | = |
| — | ~~**Corroded**~~ | v2.0 pg 135: *"your DT is reduced by 5."* **Deleted in v2.1.** Replaced by the ranged-weapon property **`Corrosive`** (v2.1 pg ~55): *"When you deal damage to a creature's hit points with a weapon that has this property, their armor gains one level of decay. If they have natural armor, their AC and DT decrease by 1 to a maximum of 3…"* | ❌ |
| 5 | **Dazed** | **"maximum AP is reduced by 3 and they cannot recycle AP."** v2.0: *"maximum AP is reduced by **half (rounded down)** and you do not recycle."* | 🔧 |
| 6 | **Deafened** | Can't hear; auto-fails any hearing-based ability check. (133) | = |
| 7 | **Dehydration** *(leveled, max 10)* | `−1 per level` to every d20 **(besides Luck)**. `+3 levels` at the end of each day / 24 h without ≥3 drinks or one `Hydrating` drink. **10th level = death.** (133) | 🔧 *(Luck exemption)* |
| 8 | **Drunk** | Gain Buzzed; **2 less AP**; max SP increases by your level. (133) | = |
| 9 | **Encumbered** | `2 AP per 5 ft`; travel pace halved; +1 Fatigue per hour encumbered. (133) | = |
| 10 | **Exhaustion** *(leveled, max 10)* | `−1 per level` to every d20 **(besides Luck)**. **10th level = death.** Human/Ghoul/Super Mutant remove 1 per **6 h** rest; Robot/Gen-2 Synth per **2 h**. (133) | 🔧 *(Luck exemption)* |
| 11 | **Fatigue** *(leveled, max 9)* | `−1 per level` to every d20 **(besides Luck)**. Lose 1 level at the end of each of your turns. (133) | 🔧 *(Luck exemption)* |
| 12 | **Frightened** | See breakdown below. (134) | 🔧 |
| 13 | **Grappled** | Cannot spend AP to move. (134) | = |
| 14 | **Hammered** | Gain Buzzed + Drunk; max SP `+level`; **every d20 (besides Luck) is subtracted by 5.** (134) | 🔧 *(Luck exemption)* |
| 15 | **Heavily Encumbered** | `3 AP per 5 ft`; travel pace halved; each hour travelled `−2` max SP (resets on sleep); each day travelled `−10` carry load (resets after a day unencumbered). (134) | = |
| 16 | **Hunger** *(leveled, max 10)* | `−1 per level` to every d20 **(besides Luck)**. `+1 level` per day/24 h without ≥1 food. **10th level = death.** (134) | 🔧 *(Luck exemption)* |
| 17 | **Hypothermia** *(leveled, max 10)* | `−1 per level` to every d20 **(besides Luck)**; **AP reduced by `floor(levels / 2)`**. **10th level = death.** *Preventing:* cannot gain levels within 5 ft of a source of warmth. (134) | 🆕 |
| 18 | **Invisible** | Impossible to see; counts as heavily obscured for hiding; located by noise/tracks; attacks against it have disadvantage, its attacks have advantage. (134) | = |
| 19 | **Overheating** *(leveled, max 10)* | `−1 per level` to every d20 **(besides Luck)**; **AP reduced by `floor(levels / 2)`**. **10th level = death.** *Removing:* 1 level per hour in a cooled shelter / out of Extreme Heat. (134) | 🆕 |
| 20 | **Poisoned** | Disadvantage on **all** d20 rolls. (134) — note: no Luck exemption, this is advantage/disadvantage, not a numeric penalty. | = |
| 21 | **Prone** | Only movement is crawling until you stand; disadvantage on attack rolls; attacks against you have advantage within 5 ft, disadvantage beyond. (135) | = |
| 22 | **Radiation or Rads** *(leveled, max 10)* | `−1 per level` to every d20 **(besides Luck)**. **Each level gained deals `1d4` radiation damage to *both* HP and SP, unhealable until you have no rad levels.** If that damage brings you to 0 HP, or you would gain a 10th level: **you die** — roll a **Luck check DC 20**; success → return as a **ghoul with 1 HP**; a roll **below 5** → return as a **feral ghoul under GM control**. (135) | 🔧 |
| 23 | **Restrained** | Cannot move; incoming damage **cannot be subtracted from stamina points** (goes straight past SP). (135) | = |
| 24 | **Shadowed** | Undetectable by sight to creatures without night vision; an aware creature without night vision may attempt a blind attack. (135) | = |
| 25 | **Shock** | **"cannot regain stamina points and has disadvantage on all d20 rolls."** v2.0 pg 137: *"has their stamina points **immediately drop to 0** and starts their next turn with a **maximum of 6 AP**."* | 🔧 |
| 26 | **Short Circuit** *(leveled)* | Start of each of your turns, **per level**: `1d12` electricity damage to HP **and max AP `−1`**. Becoming **wet** while you have levels → **double the levels**. All levels removed if you **start dying** or are **healed to full HP**. **6 AP** on your turn to re-route → remove **one** level. (135) — the robot/Gen-2-Synth analogue of Bleeding (those races are immune to Bleeding, pg 9). | 🆕 |
| 27 | **Slowed** | Starts their turn with a maximum of 6 AP. (135) | = |
| 28 | **Unconscious** | Drops what it holds, all SP → 0, cannot move or speak, unaware of surroundings. (135) | = |
| 29 | **Wasted** | Gain Buzzed + Drunk + Hammered; remember nothing; fall Unconscious after 1 hour. (135) | = |

### 3.1 Frightened, in full (v2.1 pg 134)

Check: **`Endurance` *or* `Charisma` ability check** vs `DC 8 + the frightening creature's Intimidation skill bonus`.
(v2.0 pg 136: **Endurance only**.)

| Result | v2.0 | v2.1 |
|---|---|---|
| Succeed by **10+** | *(no such tier)* | **not frightened** |
| Succeed by **5+** | **not frightened** | *(no longer an escape; falls into "succeed")* |
| Succeed | choose Flight/Fight/Freeze/Fawn for **half (rounded down)** the allotted time | same |
| Fail | choose Flight/Fight/Freeze/Fawn for the allotted time | same |
| Fail by **5+** | choose **Flight or Freeze** for the allotted time | same |
| **Critical failure** | *(no such tier)* | **choose Flight or Freeze for DOUBLE the allotted time** |

Sub-modes:
- **Flight** — must spend AP on your turn to move as far from the source as possible. *(=)*
- **Fight** — must spend AP to attack the source with intent to kill; cannot spend AP to move away. *(=)*
- **Freeze** — 🔧 **v2.1:** *"cannot spend any AP on their turn, **except to ready**, while the source of their
  fear is within sight. **They can still recycle what they don't use.**"*
  **v2.0:** *"loses **half their maximum AP (rounded down)** and cannot spend any AP to move."*
- **Fawn** — uses all AP to attack enemies of the source, or to heal/help the source. *(=)*

---

## 4. Unchanged but verified — do NOT touch these

Every one confirmed by reading both editions' pages.

```
ability modifier      = score - 5                        (pg 4 step 3; pg 19-25) — wording bug intact
SP max                = 10 + 5*k + AGI_mod * (k + 1),  k = floor((level - 1) / 2)   (pg 5, table pg 6)
HP max                = 10 + 5*k + END_mod * (k + 1),  k = floor((level - 1) / 2)   (pg 5, table pg 6)
AP                    = 10 + AGI_mod                     (pg 4 step 10; pg 125)
AP recycling          = floor(unspent / 2) into next turn (pg 126)
Healing Rate          = floor((level + END_score) / 2)    (pg 4 step 11; pg 22)
Carry Load            = STR_score * 10                    (pg 4 step 12)
Passive Sense         = 12 + PER_mod                      (pg 4 step 13)
Passive combat seq.   = 10 + PER_mod                      (pg 125)
Party Nerve           = floor(sum(all PC CHA mods) / 2)   (pg 4 step 14)
Group Sneak           = mean(all PC Sneak modifiers)      (pg 4 step 15)
AC at 1st level       = 10, floor of 10                   (pg 4 step 17)
DT at 1st level       = 0                                 (pg 4 step 18)
Radiation DC          = 12 - END_mod  (Humans only)       (pg 4 step 20; pg 22)
skill bonus           = ability_mod + points + background(+2) + floor(Luck_mod / 2)  (pg 4 steps 4-6; pg 25)
  negative Luck mod  -> all skill bonuses -1 regardless   (pg 25, present in BOTH editions)
crit threshold        = weapon_crit - floor(Luck_mod / 2), shotguns exempt          (pg 25, pg 127)
damage order          = tempSP -> SP -> resist/vuln -> DT -> tempHP -> HP           (pg 132)
resistance / vuln     = halved (round down) / doubled     (pg 131)
death save            = d20 + (Luck_mod OR END_mod) + PartyNerve  vs DC 10, 2 AP    (pg 25, pg 131)
  nat 1 = two failures; nat 20 = regain 1 HP; 3 successes = 1 HP
  3 failures = death  ... EXCEPT Humans (Tenacity, 4 failures)                      (pg 7)
dying                 = prone, AP -> 0, +4 AP/turn, recycle all unspent, cap 6 AP   (pg 131)
severe injury         = remaining damage after reaching 0 HP >= HP max              (pg 131)
instant death         = a single hit of 3x HP max reducing you to 0                 (pg 131)
damage at 0 HP        = 1 failed death save (2 if a crit); >= HP max = instant death (pg 131)
stabilize             = 6 AP, Medicine check vs DC 10 - target END_mod -> 1 HP      (pg 131)
knockout              = melee reduces to 0 HP -> unconscious 1d4 - END_mod hours, min 1 (pg 131)
cover                 = half +2 AC, three-quarters +5 AC, total = untargetable      (pg 130)
  both partial grades: resistance to explosive/trap damage from beyond the cover
  creature as cover: attack roll of 6 or below hits the covering creature
blocking DT           = +2 + END_mod vs melee, until you attack again               (pg 127)
blind attack          = d20 + Luck_mod vs DC 5 + floor(feet / 5)                    (pg 128)
sneak attack          = auto-crit, ignores SP, must still beat AC                   (pg 128)
crit failure          = raw 1 -> auto-miss + 1 level of weapon decay                (pg 128)
XP                    = 1000/level, levels 1-30, party-shared to the highest total  (pg 5)
perk points           = 1 per level EXCEPT levels 5, 9, 13, 17, 19                  (pg 5, table pg 6)
skill points          = at levels 5,9,13,17,21,25,29; INT<=4 -> 3, INT 5 -> 4, INT>=6 -> 5,
                        retroactive on INT change                                   (pg 5, table pg 6)
DC ladder             = 1 / 4 / 8 / 12 / 16 / 20 / 25 / 30                          (pg 19)
skills                = the same 14, same governing abilities                       (pg 19, 21)
targeted-attack melee = extra AP reduced by 2, minimum 1                            (pg 128)
targeted-attack d4    = re-rollable Luck_mod times, must take the new result        (pg 25, pg 128)
```

Both **Level Up Table typos survive into v2.1 pg 6** — do not "fix" them silently, but do not implement them:
- level 9 prints `30 HP +END mod x4` where the prose (pg 5) requires **×5**;
- level 8 prints skill-point `6` in the INT-modifier `−1` column where the pattern requires **3**.

---

## 5. Implementation impact, priority-ordered

| # | Change | Cost | Where |
|---|---|---|---|
| 1 | **Targeted attack AP: head `4 → 3`, held object `3 → 4`.** Everything else in the AP column stands. | **cheap** — two constants | §2 |
| 2 | **Luck exemption.** The global "subtract condition levels from every d20" hook must skip rolls whose modifier is the Luck modifier. Affected conditions: Hunger, Dehydration, Fatigue, Exhaustion, Radiation, Hypothermia, Overheating, **and Hammered (−5)**. Death saves need a per-roll "which modifier did the player pick" signal. | **expensive** — roll pipeline needs a `usesLuck` flag threaded through ability checks, blind attacks and death saves; the death-save modifier choice may need UI | §1.1 |
| 3 | **Condition data: +3 new, −1 removed, 5 reworked.** Add `Hypothermia`, `Overheating`, `Short Circuit` (all leveled, with their own AP/damage riders). Delete `Corroded`, add the `Corrosive` ranged-weapon property. Rewrite `Dazed` (`max AP ÷ 2` → `max AP − 3`), `Shock` (SP-to-0 + 6 AP cap → **disadvantage on all d20 + cannot regain SP**), `Radiation` (`1d12` HP → `1d4` HP **and** SP). | **expensive** — new condition documents, new active effects, Short Circuit needs "wet" and "healed to full" triggers | §3 |
| 4 | **Targeted-attack condition tables.** Every limb's Conditions 1–3 changed text and/or duration: all "end of target's next turn" → **2 turns**; head/torso/groin AP-loss becomes a **standing −2/−3 AP for two turns** (a persistent effect, not a one-shot deduction); the **whole leg row shifted** (30/20/15 ft for two turns, with Condition 1 no longer empty). | **expensive** — durations move from instantaneous to 2-round effects; leg movement caps need a new effect type | §2.2 |
| 5 | **Human `Tenacity`.** Death-save failure threshold becomes a per-actor value: 4 for Humans, 3 for everyone else. Successes stay at 3. | **cheap-ish** — one race trait + one comparison, but the death-save tracker's "3" is likely hardcoded | §1.3 |
| 6 | Frightened: check is `END or CHA`; not frightened on **succeed by 10+** (was 5+); **crit failure doubles duration**; **Freeze** = "no AP except to ready while the source is in sight, may still recycle" (was "lose half max AP, can't move"). | medium | §3.1 |
| 7 | Grapple / Escape: both become `Unarmed` skill check vs `DC 10 + target's Unarmed skill` (success **or raw 20**); "Escape a Grapple" renamed **Escape** and now also covers restraints and chokeholds. | medium | §1.5 |
| 8 | Help: `+floor(helper's related skill bonus / 2)` instead of advantage. | cheap | §1.5 |
| 9 | Blocking now requires a **melee weapon** (unarmed blocking removed). Unarmed gains **two strikes for 5 AP**. Reload requires a **free hand**. | cheap | §1.6 |
| 10 | Ready: unspent AP on an untriggered readied action now recycles at **half**. | cheap | §1.5 |
| 11 | Difficult terrain: `+1 AP per 5 ft` (extreme `+2`), and **enemy spaces count as difficult terrain**. | medium — movement cost hook | §1.5 |
| 12 | `Dismember` weapon property: arm/leg targeted attacks cost **no additional AP** (was: random arm/leg condition). Interacts with #1 and the melee −2. | cheap once the AP formula is data-driven | §1.8 |
| 13 | Eyes/head targeted attacks halve the weapon's **range multipliers**. | medium — needs a per-attack range override | §2.3 |
| 14 | Character-creation wizard: Background moves to step **4**, "Choose a Perk" becomes step **23**, traits step **24** (22 → 24 steps). | cheap — UI ordering only, no math changes | §1.2 |
| 15 | **Do NOT implement** the patch notes' Robot claims (targeted-attack resistance, Disease immunity, Medicine exception). The published book does not contain them; only the manuscript does. | n/a | §1.4 |
| 16 | Healing Rate source list: add RobCo Quick Fix-It. | cheap | §1.10 |

Nothing in §4 needs to change. In particular **do not touch** the SP/HP progression, AP formula, healing
rate, carry load, passive sense, crit-threshold-from-Luck, damage order, cover values, or the death-save
DC — all confirmed identical across the two editions.
