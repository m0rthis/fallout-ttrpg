# v2.0 → v2.1 Equipment Change Report

Source of truth: **`FALLOUT TTRPG 2.1.pdf`** (136 pp, printed page number == PDF page index).
Cross-checked against `Patch Notes_ Fallout 2.1.pdf` and `Fallout TTRPG v2.0 (PDF).pdf`.
Every table page was read as a 200–400 dpi PNG image, never `pdftotext -layout`.

Files updated in place: `weapons.json`, `armor.json`, `ammo.json`, `gear.json`.
All four re-serialise byte-identically to `JSON.stringify(…, null, 2) + "\n"`, so the diff
contains only real changes — no reformatting noise.

## Page map (v2.0 → v2.1)

| Content | v2.0 pg | v2.1 pg |
| --- | --- | --- |
| Armor types table | 52 | 56 |
| Armor upgrades table | 52 | 57 |
| Power Armor rules / types & statistics | 53–54 | 57–58 |
| Power Armor upgrades | 54–56 | 59 |
| Melee special properties glossary | 57–58 | 60–61 |
| Bladed weapons | 58–59 | 62 |
| Blunt weapons | 59–60 | 63 |
| Mechanical + Unarmed weapons | 60–61 | 64 |
| Melee weapon modifications | 62 | 65 |
| Ammunition (guns / energy / heavy) | 64 | 67 |
| Special ammunition (guns + energy) | 64–65 | 68 |
| Special ammunition (syringer) | 66 | 69 |
| Ranged special properties glossary | 66–67 | 69–70 |
| Handguns, Submachine Guns | 68 | 71 |
| Rifles, Shotguns | 69 | 72 |
| Big Guns | 70 | 73 |
| Energy Weapons | 71 | 74 |
| Ranged weapon modifications | 72–75 | 75–77 |
| Explosive properties glossary | 76–77 | 78–79 |
| Thrown / Placed explosives | 78 | 79 |
| **Items and Gear** (new to these packs) | — | 80–82 |

Page citations embedded in `description` / `special` strings were rewritten to the v2.1 numbers.
This is the single largest source of diff lines in `ammo.json` and `gear.json` and involves
**no value changes**. If you would rather keep the v2.0 citations, revert only those hunks.

## Entry counts

| File | v2.0 | v2.1 | delta |
| --- | --- | --- | --- |
| weapons.json | 109 | 110 | +1 (`.45 Auto Pistol`) |
| armor.json | 11 | 11 | 0 |
| ammo.json | 91 | 91 | 0 |
| gear.json | 75 | 102 | +27 (`Armor Upgrade: Insulated`, 26 Items and Gear) |

Nothing was removed from any file.

---

# 1. Where the patch notes disagree with the book

**The book wins in every case below. These are the places a reader of the patch notes alone
would have entered wrong data.**

| # | Patch note claim | What v2.1 actually prints | Resolution |
| --- | --- | --- | --- |
| 1 | "Chainsaw crit **reduced by 6d8 to 3d8**." | pg 64: Chainsaw Critical Hit = **`20. 6d8.`** v2.0 pg 60 printed `20. 3d8.` (verified by image in both editions). | The crit was **increased** from 3d8 to 6d8. The patch note is backwards *and* its stated end value is the old value. `crit: "6d8"`. |
| 2 | "Ripper crit **increased by 1d8** to 3d8." | pg 64: `20. 3d8.` v2.0 printed `20. 1d8.` | End value 3d8 is right; the delta is +2d8, not +1d8. No data impact. |
| 3 | "Sniper Rifle critical hit damage increased from x4 to x5." | pg 72: **`20, x5`**. v2.0 printed **`19, x4`**. | The **crit chance also moved 19 → 20**, which the patch notes omit entirely. Both fields updated. |
| 4 | "Anti-Material Rifle now has the destructive property and the critical hit damage increased from x4 to x5." | pg 72: **`20, x5.`** v2.0 printed `19, x4`. | Same omission — crit chance 19 → 20 as well as x4 → x5. Destructive added as stated. |
| 5 | "Handy buzz blade is now a mechanical weapon … Now has ammo and depleted property." | Correct, but the book **also renames it**: v2.0 printed `Mr. Handy buzz blade`, v2.1 prints `Handy buzz blade`. | See §5 "Judgment calls" — the JSON name was **not** changed. |
| 6 | "Power Fist now specifies it requires energy cells for its ammo." | Correct (pg 64, "Ammo, Energy Cells, 20 rounds"). | Applied. Resolves the v2.0 open question in EXTRACTION-NOTES.md §weapons "Power Fist". |
| 7 | "Load of all items reworked." | True, but the note gives no values. **89 individual load/STR changes** were found by comparing every row. | See §2. |
| 8 | (Not mentioned at all) | Power Armor **Defense Points** all increased (§3). | Found by table comparison, not from the notes. |
| 9 | (Not mentioned at all) | Four shotguns changed **Quick Reload → Manual Reload**; nine weapons **gained Quick Reload**. | See §2.6/§2.7. |
| 10 | (Not mentioned at all) | Missile Launcher and Fat-Man **range columns restructured** (§2.8). | Found by table comparison. |
| 11 | (Not mentioned at all) | Minigun STR requirement 10 → 9; Walther PPK, 12.7mm pistol, Ranger Sequoia STR reduced by 1 each. | Found by table comparison. |
| 12 | (Not mentioned at all) | New melee property **Precise**; seven weapons' "critical hit applies bleeding" text replaced by it. | See §2.1. |

Also noted, outside my scope but confirming the caller's warning: the patch note "attacking the
head now costs 4 AP instead of 3" is contradicted by the v2.1 targeted-attack table, which
prints **+3**. I did not touch that table (it is not equipment data).

---

# 2. weapons.json — every changed field

Format: `field: old → new`. Unlisted rows/fields are byte-identical to v2.0.

## 2.1 Bladed weapons (pg 62)

| Weapon | Change |
| --- | --- |
| Switchblade | `load: 2 → 1` |
| Sharpened Pole | `load: 4 → 7` |
| Combat Knife | `load: 3 → 2`; `special`: `Thrown (x3/x8), Critical hit applies bleeding, Damage: …` → `Precise, Thrown (x3/x8), Damage: …` |
| Throwing Knife | `load: 2 → 1`; `special`: `Fragile, Thrown (x4/x8), Critical hit applies bleeding, If thrown…` → `Precise, Fragile, Thrown (x4/x8), If thrown…` |
| Spear | `load: 2 → 8` |
| Fire Axe | `load: 5 → 10` |
| Machete | `special`: `Sturdy, Critical hit applies bleeding` → `Precise, Sturdy` |
| Assaultron Blade | `special`: `Sturdy, Defensive, Critical hit applies bleeding, Damage: …` → `Defensive, Precise, Sturdy, Damage: …` |
| Sickle | `special`: `…Critical hit on 19-20 applies bleeding…` → `Defensive, Debilitating, Precise, Critical hit chance is 19-20 (no crit multiplier listed)` |
| Pitchfork | `load: 5 → 8`; `special` gains `Two Handed` |
| Mr. Handy buzz blade | moved to Mechanical — see §2.3 |

**New property "Precise" (pg 61):** *"When you deal damage to a creature's hit points from a
critical hit with a weapon that has this property, the target gains two levels of bleeding or two
levels of short circuit if they are a robot or synth."* v2.1 replaces the per-weapon prose
"Applies bleeding" in the Critical Hit column with this keyword on Combat Knife, Throwing Knife,
Machete, Assaultron Blade, Sickle, Drill and Spiked Knuckles. **Bear Skull Arm lost its
"Applies bleeding" rider and did *not* gain Precise** — v2.1 prints only `20, x2.` (verified;
this is a real nerf, not a transcription slip).

Bladed rows with **no** change: Shiv, Knife, Sword, Plastic Bumper Sword, Steel Bumper Sword,
Cleaver, Hatchet, Guitar Sword, Ski Sword, Pickaxe.

## 2.2 Blunt weapons (pg 63)

| Weapon | Change |
| --- | --- |
| Police Baton | `load: 2 → 3` |
| Wrench | `load: 3 → 5` |
| Crowbar | `load: 18 → 20` |
| Sledgehammer | `load: 22 → 26` |
| Baseball Bat | `load: 4 → 8` |
| Super Sledge | `load: 26 → 30` |
| 9 iron | `load: 4 → 5` |
| Dress cane | `load: 2 → 3` |
| Shovel | `load: 8 → 10` |
| Tire iron | `load: 2 → 4` |
| Pool cue | `load: 2 → 4` |
| Bone Club | `load: 2 → 5` |
| Commie Whacker | `special` gains `Fragile, Weak` |
| Paddle Ball | `special`: `Fragile` → `Fragile, Weak` |
| Board | `load: 10 → 8` |
| Board with a nail | `load: 10 → 8` |
| Protest Sign | `load: 6 → 8` |
| **Stop Sign** | `cost: 350 → 75`; `damage: "5d8" → "3d8"`; `special`: `Slow` **removed**, damage note updated to `Damage: 3d8 bludgeoning or slashing`. Load stays 45, STR stays 9. |
| War Drum | `load: 8 → 10` |

No change: Lead pipe, Rolling pin.

New property **Weak** (pg 61): *"When you deal damage with a weapon that has this property, you do
not add any ability score modifier to the damage roll."*

## 2.3 Mechanical weapons (pg 64)

| Weapon | Change |
| --- | --- |
| Cattle Prod | `load: 3 → 5` |
| **Ripper** | `cost: 410 → 475`; `crit: "1d8" → "3d8"`; `load: 4 → 5` |
| **Mr. Handy buzz blade** | `weaponType: "bladed" → "mechanical"`; `ammoType: "" → "Energy Cell"`; `magazineSize: 0 → 10`; `load: 4 → 10`; `special`: `Weighted, Mangle` → `Weighted, Mangle, Depleted: 1d6 slashing` |
| **Chainsaw** | `crit: "3d8" → "6d8"` (see §1 #1) |
| Drill | `load: 5 → 8`; `special` gains `Precise`, crit-range wording normalised |
| Plasma Cutter | `load: 8 → 12`; crit rider text `severe arm or leg condition` → `severe limb conditions of your choice` |
| Shishkebab | `load: 6 → 18` |

## 2.4 Unarmed weapons (pg 64)

| Weapon | Change |
| --- | --- |
| Brass Knuckles | `load: 3 → 2` |
| Spiked Knuckles | `special`: `Unarmed, Critical hit on 19-20 applies bleeding…` → `Unarmed, Precise, Critical hit chance is 19-20 (no crit damage listed)` |
| Boxing Gloves | `load: 4 → 6` |
| Bear Skull Arm | `load: 10 → 15`; `special` drops `Critical hit applies bleeding` |
| Deathclaw Gauntlet | `load: 6 → 10` |
| **Power Fist** | `load: 10 → 12`; `ammoType: "" → "Energy Cell"`; `special` drops the v2.0 note `Ammo type unspecified in table (20 rounds)` |

No change: Hunting Trap Fist, Bear Trap Fist.

## 2.5 Handguns (pg 71)

| Weapon | Change |
| --- | --- |
| Flare Gun | `load: 2 → 3`; `special`: `Incendiary` → `Incendiary, Quick Reload` |
| Acid Soaker | `load: 4 → 5` |
| Pipe pistol | `load: 8 → 6` |
| Bolt-action Pipe pistol | `load: 8 → 6` |
| 10mm pistol | `load: 10 → 6` |
| 9mm pistol | `load: 6 → 5` |
| 5.56mm pistol | `load: 8 → 7` |
| Pipe revolver | `load: 6 → 5` |
| .357 Magnum revolver | `load: 6 → 4` |
| .44 Magnum revolver | `load: 8 → 5` |
| Walther PPK | `load: 6 → 3`; `strengthReq: 4 → 3` |
| 12.7mm pistol | `load: 10 → 8`; `strengthReq: 6 → 5` |
| Ranger Sequoia revolver | `load: 10 → 8`; `strengthReq: 6 → 5` |

**ADDED — `.45 Auto Pistol` (pg 71).** Transcribed exactly:
`450c · 4 AP · 1d10 ballistic · x10/x16 · 20, x3. · .45, 7 rounds · Semi-Automatic. Kickback.
Quick Reload. · Load: 6, STR req: 3`. Inserted between `12.7mm pistol` and
`Ranger Sequoia revolver` to match the book's row order; `ammoType` is `".45"`, matching the
existing `.45` entry in `ammo.json`. `mods`/`description` empty, `decay`/`loadedAmmo`/
`reloadCount` zero, exactly like its neighbours.

## 2.6 Submachine Guns (pg 71)

| Weapon | Change |
| --- | --- |
| H&H Tools nail gun | `load: 5 → 8` |
| 9mm SMG | `load: 8 → 6` |
| 10mm SMG | `load: 12 → 8` |
| Tommy Gun | `load: 14 → 12`; `special` gains `Quick Reload` |

No change: 12.7mm SMG.

## 2.7 Rifles and Shotguns (pg 72)

| Weapon | Change |
| --- | --- |
| Syringer | `special` gains `Quick Reload` |
| Lever Action Rifle | `load: 15 → 12` |
| Cowboy Repeater | `load: 12 → 13` |
| Varmint Rifle | `load: 12 → 13` |
| Trail Carbine | `load: 12 → 13` |
| Railway Rifle | `load: 18 → 21`; `special` gains `Defensive` |
| **Sniper Rifle** | `critChance: 19 → 20`; `crit: "x4" → "x5"` |
| Assault Rifle | `special` gains `Quick Reload` |
| **Anti-Material Rifle** | `critChance: 19 → 20`; `crit: "x4" → "x5"`; `special` gains `Destructive` |
| Lever-action Shotgun | `load: 10 → 12` |
| **Single Shotgun** | `load: 10 → 11`; `Quick Reload` → **`Manual Reload`** |
| **Sawed-off Shotgun** | `Quick Reload` → **`Manual Reload`** |
| **Double Barrel Shotgun** | `Quick Reload` → **`Manual Reload`** |
| Combat Shotgun | `load: 14 → 12` |
| Riot Shotgun | `load: 10 → 12` |

No change: Junk Jet.

The Quick Reload ⇄ Manual Reload swaps follow the reworked **Manual Reload** rule (pg 70):

> When you reload a weapon with this property, you can choose how much AP you spend to reload
> but you must spend at least 3. You reload 1 round for every AP spent to reload.

**Corrected 2026-08-12.** This note previously paraphrased the *patch notes* ("at least 3 AP,
and each additional round manually loaded costs 1 AP"), which describes a different mechanic —
3 AP for the first round, then 1 AP each. The book gives a flat 1 AP : 1 round rate with a 3 AP
floor. v2.0's version was 1 AP per round with no floor, so the rework only added the floor.
That makes the sixth confirmed patch-note error.
Note the interaction with the **Increased Clip Size** mod, which still excludes any weapon with
Manual Reload or Quick Reload — the three shotguns above stay excluded either way.

## 2.8 Big Guns (pg 73)

| Weapon | Change |
| --- | --- |
| **Flamer** | `special`: `Slow` **removed** (`Slow Reload` retained — they are two different properties) |
| **Missile Launcher** | Range column `x10/x40` → **`x40`** (a single multiplier). `rangeNormal: 10 → 40`, `rangeLong: 40 → 0`, and `special` gains `Range is printed as a single multiplier (x40) with no long range`. |
| Minigun | `strengthReq: 10 → 9` |
| **Fat-Man** | Range column `120 feet.` → **`x25`** — it is now a PER multiplier, not a flat distance. `rangeNormal: 0 → 25` (v2.0 used `0/0` per EXTRACTION-NOTES §7); `special` note rewritten from `Range: 120 feet` to `Range is printed as a single multiplier (x25) with no long range`. |

## 2.9 Energy Weapons (pg 74)

| Weapon | Change |
| --- | --- |
| Solar Scorcher | `load: 4 → 3` |
| Laser pistol | `load: 6 → 5`; `special` gains `Quick Reload` |
| Laser rifle | `load: 10 → 8`; `special` gains `Quick Reload` |
| Automatic laser rifle | `load: 12 → 10`; `special` gains `Quick Reload` |
| Tri-Beam laser rifle | `load: 12 → 10`; `special` gains `Quick Reload` |
| Plasma pistol | `load: 8 → 4` |
| Plasma rifle | `load: 12 → 8` |
| Multiplas rifle | `load: 12 → 10` |
| Tesla cannon | `load: 15 → 12` |
| Gamma gun | `load: 8 → 5` |
| Cryolator | `load: 25 → 20` |
| Crystalizing Cryolator | `load: 25 → 20` |
| Gauss pistol | `load: 12 → 14` |
| Gauss rifle | `load: 18 → 20` |

No change: Gatling laser.

**The v2.0 Gamma gun `damageType: ""` problem is unchanged.** v2.1 pg 74 still prints
`1d12 radiation`, and `radiation` is still not one of the system's thirteen `DAMAGE_TYPES`.
Left empty with the note preserved in `special`. **Still needs a human decision.**

---

# 3. armor.json

## 3.1 Armor types (pg 56) — no change

All six rows are byte-identical to v2.0: Cloth 50c/AC10/DT0/8 slots/L5/STR1, Leather
175c/11/1/6/L15/STR1, Metal 250c/12/**DT 0**/4/L20/STR5, Multilayered 275c/10/2/5/L40/STR3,
Ballistic Weave 800c/12/3/2/L10/STR3, Steel 650c/13/2/2/L50/STR6.
(Metal's DT of 0 looks like a book typo but it is printed that way in **both** editions, so it
was not "fixed".)

## 3.2 Power Armor (pg 58) — Defense Points increased across the board

Only DP changed. Base Cost, AC, Slots, Repair DC and Allotted Time are all identical to v2.0.

| Suit | Cost | AC | **DP old → new** | Slots | Repair | Allotted Time |
| --- | --- | --- | --- | --- | --- | --- |
| T-45 | 4,050c | 14 | **10 → 15** | 6 | DC 16 | 4 hours |
| T-51 | 80,250c | 17 | **15 → 20** | 5 | DC 23 | 6 hours |
| T-60 | 85,750c | 16 | **20 → 30** | 6 | DC 20 | 4 hours |
| X-01 | 133,500c | 16 | **35 → 45** | 4 | DC 25 | 3 hours |
| X-02 | 155,000c | 18 | **30 → 40** | 4 | DC 25 | 3 hours |

Page citation in each `description` updated `(pg 54)` → `(pg 58)`.

### Schema gap — unchanged from v2.0, still needs fields

The v2.0 workaround is retained: Power Armor is stored as `armor` with `armorType: "metal"`
(a guess — the book assigns no material), `dt: 0`, `load: 100`, `strengthReq: 0`, and the real
numbers written into `description`. **The armor schema would need these additional fields to
model Power Armor properly:**

| Needed field | Type | Why | Example (X-01) |
| --- | --- | --- | --- |
| `defensePoints` | integer | A separate damage pool that soaks damage before HP/SP, is **not** modified by ability scores, and refills to full each time it empties (costing the suit 1 level of decay). Nothing in the current schema represents it; `dt` is the wrong semantic and is being zeroed to avoid a double benefit. | 45 |
| `defensePointsCurrent` | integer | The suit retains its remaining DP when a user exits; the next occupant inherits that value (pg 57). Needs to be persisted per-item, not derived. | 0–45 |
| `repairDC` | integer | Power Armor repair rolls against a per-suit Crafting DC (pg 58). Regular armor has no such column. | 25 |
| `fusionCoreMinutes` / `allottedTime` | integer (minutes) | The suit only functions while a Fusion Core has allotted time left; several upgrades (Tesla Coils, Jet Pack, Explosive vent, overheating) **subtract minutes** from it, so it must be a live counter, not prose. | 180 |
| `decayMax` | integer | Power Armor caps at 10 levels of decay with different consequences from ordinary armor (it keeps functioning; it just stops regaining DP). | 10 |
| `isPowerArmor` | boolean | Gates the whole distinct rule set: 6 AP to enter/exit, no STR requirement, load 0 while worn, immunity/limb rules, Fusion Core Targeting, Overheating at >15 AP/turn. | true |

I did **not** invent any of these. Every number above is currently only in the `description`
string.

---

# 4. ammo.json — no value changes

All 25 base types (16 guns / 6 energy / 3 heavy, pg 67), all 46 gun special-ammo variants and 8
energy variants (pg 68), and all 12 syringes (pg 69) carry **identical costs, modifiers, effects
and applicable-round lists** to v2.0. Verified row by row from the page images.

Two edits only:

1. **`Syringe — Chem Loader`** — `special` gains the new sentence
   *"Note: You cannot load a chem that has an inhaler."* (pg 69, printed in italics after the
   existing text). Cost stays 25c.
2. **Page citations** in all 91 `description` strings: `(pg 64)` → `(pg 67)`,
   `(pg 64-65)` → `(pg 68)`, `pg 66` → `pg 69`. No numbers touched.

The v2.0 arithmetic conventions in EXTRACTION-NOTES.md §ammo (expanded special ammo per base
round, `-50%` read as ×0.5 and `-25%` as ×0.75, decimal costs left unrounded, `Nails (Pack of 5)`
priced per pack) all still hold — the v2.1 tables print the same modifiers.

---

# 5. gear.json

## 5.1 Armor Upgrades (pg 57)

**ADDED — `Armor Upgrade: Insulated`, 100c** (the book's first row, so inserted at index 0).
- Rank 1: You are insulated against hypothermia. However, your maximum AP decreases by 1 to a minimum of 6.
- Rank 2: Your AP is no longer decreased and you remain insulated. However, this upgrade costs 800 caps instead of 100.
- Rank 3: `-`

The Rank 2 cost quirk (800c, not the 100c base like every other rank) is transcribed verbatim in
the description; the `cost` field holds the **base** 100 to stay consistent with every other
upgrade entry.

The other nine upgrades (Camouflage 125c, Light 75c, Fitted 175c, Lead Lined 125c,
Strengthened 410c, Sturdy 475c, Pocketed 210c, Reinforced 450c, Hardened 800c) are **unchanged**
in cost and in all three rank texts. Only the page citation moved 52 → 57.

## 5.2 Power Armor Upgrades (pg 59)

All 19 upgrades keep their names, costs and rank texts. **One text change:**

- **`Power Armor Upgrade: Jet Pack`** — the v2.0 Rank 1 text was truncated mid-sentence in the
  source (*"…fly 5 feet upwards. For every 5 feet you fly you"*). v2.1 prints the complete rule:
  *"You can spend 1 AP on your turn to fly 5 feet. For every 10 feet you fly or every second that
  you fly you use 1 minute of the fusion core's allotted time."* Note this is not merely the
  missing tail — "5 feet **upwards**" became "5 feet", and the cost interval changed from every
  5 feet to every 10 feet. Both corrections applied.

Page citation `(pg 54-56)` → `(pg 59)` on all 19.

**Patch-note items that are NOT upgrade-table rows.** The notes list Hydraulic Machine, Longer
Strides (replacing Extended Limbs), Calibrated Impact Servos, Automatic Injector and Lead Plated
Exoskeleton under "Power Armor". These are **inherent abilities of wearing any Power Armor**,
printed as body text on pg 57–58, not rows in the upgrades table. They were not in `gear.json`
in v2.0 and were not added now. For the record, the v2.1 text reads:

- **Hydraulic Machine** — Strength is considered **12** (was 10) and your size is Large.
- **Longer Strides** — replaces v2.0's *Extended Limbs*; if you sprint in Power Armor you move an additional 20 feet.
- **Calibrated Impact Servos** — you may spend **5 DP** to not fall prone (instead of standing up costing 1 AP); forced movement is halved; resistant to impact damage.
- **Automatic Injector** — Stimpaks and Chems cost **1 AP** to use (was free).
- **Lead Plated Exoskeleton** — immune to Radiation while the armor has fewer than six levels of decay; at six to nine levels you instead get advantage on Rad Resist checks; at ten levels it offers no protection at all.

If you want these as items later they would need a home other than `gear.json` (they have no
cost and no load).

## 5.3 Melee Weapon Modifications (pg 65) — no change

All 7 mods identical in name, percentage cost and effect text. Page citation 62 → 65 only.

## 5.4 Ranged Weapon Modifications (pg 75–77)

All 24 mods keep their names, percentage/flat costs, equip times, Mod Slot totals and Equippable
Weapons columns. **Three effect-text changes:**

| Mod | Change |
| --- | --- |
| **Scope** | Was *"The weapon's long range modifier is quadrupled."* Now *"The weapon's short range modifier is doubled and the long range modifier is quadrupled. However, any attacks made at targets within 50 feet are made at disadvantage."* |
| **Infrared Scope** | Was *"The weapon's long range modifier is tripled."* Now adds *"However, any attacks made at targets within 30 feet are made at disadvantage."* |
| **Lucky Charm** | Was *"The weapon's critical hit chance decreases by 1."* Now adds *"Each player character can only benefit from one lucky charm. (The charm can be moved to other weapons, but you cannot have two charms on two different weapons.)"* |

The v2.0 transcription quirks noted in EXTRACTION-NOTES.md are **still present in v2.1 and were
left verbatim**: Scope's Equippable column still reads *"Any revolver or rifle. The Laser Rifle,
Plasma Rifle, or Gauss Rifle."* with no connective (Infrared Scope's parallel row says
"including"), and On-Board Target Tracking still excludes the *"Gatling Gun"* while the weapon
table calls it *Gatling laser*.

Page citation `(pg 72-75)` → `(pg 75-77)` on all 24.

## 5.5 Explosives (pg 79) — no change

All 16 explosives (8 thrown, 8 placed) are **byte-identical in every value**: cost, AP, damage,
range/Arm DC, area of effect, special properties and load. Verified row by row against the page
image. Page citation `(pg 78)` → `(pg 79)` only.

## 5.6 Items and Gear (pg 80–82) — 26 entries ADDED

This section was explicitly out of scope for the v2.0 extraction (EXTRACTION-NOTES.md, "Things
intentionally NOT extracted"). The pg 82 cost/load table is now transcribed in full, with each
item's rules text taken from the pg 80–81 prose and stored in `description`. Names use the
**table's** spelling; where the prose spells a name differently that is noted in the description.

| Name | Cost | Load field | Load as printed |
| --- | --- | --- | --- |
| Bag, Backpack | 20c | 10 | 10 while not worn |
| Bag, Camping Backpack | 100c | 20 | 20 while not worn |
| Bag, Range | 50c | 12 | 12 while not worn |
| Bandolier | 30c | 8 | 8 while not worn |
| Ball Bearings | 10c | 2 | 2 |
| Bear Trap | 60c | 30 | 30 |
| Binoculars | 25c | 2 | 2 |
| Caltrops | 50c | 2 | 2 |
| Canteen | 10c | 1 | 1, 2 when full |
| Chain | 15c | 12 | 12 |
| Flare | 10c | 1 | 1 |
| Flashlight | 100c | 2 | 2 |
| Gas mask | 80c | 12 | 12 |
| Geiger Counter | 200c | 4 | 4 |
| Grappling Hook | 35c | 10 | 10 |
| Hazmat Suit | 10c | 50 | 50 (equal to 10 while worn) |
| Hazmat Suit, Powered | 450c | 80 | 80 (equal to 5 while worn) |
| Insulated Clothing | 50c | 20 | 20 (equal to 5 while worn) |
| Insulated Clothing, Lightweight | 750c | 10 | 10 (equal to 2 while worn) |
| Lockpicks | 100c | 4 | 4 |
| Rope | 10c | 8 | 8 |
| Sleeping Bag | 25c | 10 | 10 |
| Tent (one person) | 20c | 12 | 12 |
| Tent (two person) | 25c | 18 | 18 |
| Water Skin | 30c | 2 | 2, 4 when full |
| Weapon Repair Kit | 90c | 10 | 10 |

Conventions used (see also §6):

- The `load` field holds the **unworn / empty** number, which is the larger and more conservative
  of the two in every case. The full printed string (`"10 while not worn"`, `"2, 4 when full"`,
  `"50 (equal to 10 while worn)"`) is the **first line** of every affected `description` so the
  conditional value is never lost.
- Trailing periods in the book's names (`"Bag, Backpack."`, `"Hazmat Suit, Powered."`) were
  dropped so names match the style of every other entry in these packs.
- No `Items and Gear: ` prefix was added. Unlike the upgrade tables, none of these names collide
  with anything else in the packs, so the v2.0 prefixing rationale does not apply.

**Four items described in the Items and Gear prose were deliberately NOT added:** *Electronic
Lockpick*, *Electronic Lockpick Mk II*, *Stealth Boy* and *Two-way Radio*. They have no row in
the pg 82 cost/load table; their prices and loads are printed in the **Unique Items** table on
**pg 91** (Stealth Boy 500c/3, Two-way Radio 120c/2, Electronic Lockpick 500c/2, …), which is a
separate chapter outside the 55–81 scope and sits behind the Food / Medicine / Chems chapters
that belong to the `aid-*` packs. Add them together with Vault Suit and the four Pip-Boy models
when someone extracts pg 91.

---

# 6. Judgment calls made in this update

1. **`Mr. Handy buzz blade` was NOT renamed.** The book renames it to `Handy buzz blade`, but
   `packs-src/icon-map.json` keys the icon off the exact string
   `"item:weapon:Mr. Handy buzz blade"`, and I was instructed not to modify other files.
   Renaming here would silently orphan that icon. **If you want the book's name, change both
   files together.** Everything else about the entry (type, ammo, load, properties) is updated.
2. **`Mr. Handy buzz blade` was not re-sorted.** It is now a mechanical weapon but stays at its
   old array index between `Assaultron Blade` and `Guitar Sword`. Moving it would have produced a
   ~40-line move hunk for zero data benefit; `weaponType` is the field that matters.
3. **Single-value range columns.** Missile Launcher (`x40`) and Fat-Man (`x25`) now print one
   multiplier where the schema has two fields. I put the printed number in `rangeNormal`, set
   `rangeLong` to `0`, and said so explicitly in `special`. Both weapons are Area of Effect and
   make no attack roll, so the short/long distinction has no mechanical effect for them — but do
   not read `rangeLong: 0` as "no long range exists".
4. **"Precise" replaced prose, so the prose was removed.** Where v2.1 prints the keyword
   `Precise` and drops "Applies bleeding" from the Critical Hit column, I removed the v2.0
   `Critical hit applies bleeding` text rather than keeping both — retaining it would double the
   effect for anyone reading `special`. Crit-*chance* text (`19-20`) is retained, reworded to
   `Critical hit chance is 19-20` since it no longer carries a rider.
5. **Page citations were rewritten.** A v2.1 pack citing v2.0 page numbers is a defect, so all
   embedded `(pg NN)` strings were updated. This is the bulk of the `ammo.json` and `gear.json`
   diff and involves no values; the hunks are trivially separable if you disagree.
6. **New-item field defaults.** `.45 Auto Pistol` and the 26 gear items use the exact key set and
   key order of their neighbours, with `decay`/`loadedAmmo`/`reloadCount`/`quantity` at the same
   defaults the existing entries use.
7. **Power Armor DP stays in `description`.** I did not add a `defensePoints` field, per
   instruction. §3.2 lists precisely what fields would be required.
8. **`Slow` vs `Slow Reload`.** Flamer lost `Slow` but kept `Slow Reload`. These are two distinct
   properties; do not collapse them when diffing.

---

# 7. Item Blueprint Encyclopedia (pg 94–116) — NOT touched, as instructed

For your awareness only. It is a ~23-page crafting/repair reference that cross-tabulates
essentially every item in the book — armor, power armor chassis and upgrades, all four melee
weapon tables, ranged weapons, ammunition, explosives, gear, food, chems and medicine — against
**Repair DC, Repair Materials, Repair Time, Crafting DC, Crafting Materials and Crafting Time**.
Rank-1/2/3 upgrades get one crafting line per rank. Materials are given as quantified component
lists (`x8 aluminum, x2 circuitry, x4 gear, x1 nuclear material, x5 oil, x10 plastic, x3 rubber,
x9 steel`), and times range from hours to days.

It contains **no cost, damage, load or property data** — nothing that would change the four packs
I edited. Extracting it would be a self-contained follow-up producing a new crafting/recipe pack
(the current schemas have no fields for materials, DCs or build times). Two of its entries are
new in v2.1 per the patch notes: **Explosive vent** power armor mod and **Shiv** are now craftable.

---

# 8. Validation performed

- All four files parse: `node -e "JSON.parse(require('fs').readFileSync('<f>','utf8'))"` — clean.
- All four re-serialise byte-identically to `JSON.stringify(d, null, 2) + "\n"`, confirmed
  against the pre-edit files, so no reformatting noise entered the diff.
- Key sets and key order preserved on every pre-existing entry; new entries were built by copying
  a neighbour's key order.
- Changed-line counts: `weapons.json` 275, `armor.json` 10, `ammo.json` 184, `gear.json` 420.
- No file outside `packs-src/{weapons,armor,ammo,gear}.json` and this report was modified.
