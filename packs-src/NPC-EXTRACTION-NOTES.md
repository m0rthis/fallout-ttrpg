# NPC Extraction Notes

Source: fan-made **Fallout TTRPG v2.0** rulebook, "Statblocks" section, printed pages **142-178**
(page 179 is a closing quote only). PDF page numbers match printed page numbers exactly — offset 0,
not +1.

Output: `packs-src/npcs.json` — **71 creatures**.

## Verification status

**Every statblock was read visually from the PDF** (all 37 pages rendered as images and transcribed
by eye). On top of that, three independent programmatic cross-checks were run against
`pdftotext` output:

| Check | Result |
|---|---|
| Statblock count (`Size type` subtitle lines) | 71 in text vs 71 in JSON — match |
| Armor Class, Damage Threshold, Hit Points, Action Points (in document order, all 71) | exact match |
| Stamina Points (57 non-robot statblocks; robots have no SP line) | exact match |
| All 7 ability scores × 71 creatures | exact match |
| Skills lists and attack to-hit bonuses | all apparent diffs traced to line-wrapping / `+N to roll` grenade phrasing; **no real discrepancies** |

**There are no creatures whose numbers could not be verified.** Every number in `npcs.json` was
confirmed both visually and by a second independent extraction.

The remainder of this document records **oddities in the source book itself** (errata, typos,
internal inconsistencies) that were transcribed as printed, plus schema decisions.

## Source-book oddities transcribed verbatim

These are *not* extraction uncertainty — the book itself is inconsistent here. Each is also recorded
in that creature's `notes` field.

### Stated averages that don't match the dice
- **Mutated Bear** (p155) — *Bite* printed as `26 (3d8+4)`; 3d8+4 averages 17.5. The *Claw* on the
  same statblock uses the same dice and is printed as `17`.
- **Protectron Fire Brigadier** (p172) — *Cryo Spray* printed as `6 (1d10)` cold; 1d10 averages 5.5.
- **Junkie** (p178) — *Shiv* printed as `5 (1d4)` piercing; 1d4 averages 2.5.

### Loot / statblock mismatches
- **Super Mutant Skirmisher** (p149) — loot lists `x2 packs of .308's` but the weapon is a Thompson SMG.
- **Super Mutant Brute** (p149) — loot lists `x1 hunting rifle` but the statblock's ranged attack is a
  Combat Shotgun.
- **Behemoth** (p151) — loot says "Roll a 1d6" but the table only has rows **1-4**.
- **Fog Crawler** (p159) — loot is `x5 mirelurk meat` (mirelurk, not fog crawler).
- **Doctor** (p177) — loot contains a stray `x1,` with no item named.
- **Junkie** (p178) — the **Loot** heading is printed with nothing after it. Recorded as `""`.

### Probable copy/paste errors
- **Junkie** (p178) — *Psycho* and *Jet* are printed as **Ranged Weapon Attacks**, range 20/35 ft.,
  `10 (3d6)` ballistic, "Reload every 5 attacks", crit `20/21 (6d6)` — byte-identical to the Guard's
  *Hunting Shotgun* on the facing column. Psycho and Jet are drugs, not weapons. Transcribed as printed.
- **Mongrel, Alpha.** (p153) — *Bite* is numerically identical to the base Mongrel's (`+5`, `1d4+1`)
  despite 3× the HP/SP.
- **Cazador, Legendary.** (p162) — flight trait is named **Flying**, while the base Cazador and
  Cazador, Young. call the same 10 ft./1 AP ability **Adept Flying**.

### Typographic / formatting oddities
- **Doctor** (p177) — PER is printed `7 (+1)`; everywhere else in the book a score of 7 gives `+2`
  (e.g. Guard's STR `7 (+2)`). The **score 7** is what is transcribed; the printed modifier is ignored.
- **Brotherhood Paladin** (p176) — a stray lone `x` is printed on the line below "Action Points 12".
- **Guard** (p178) and **Junkie** (p178) — Hunting Shotgun / Psycho / Jet crit is printed
  `Crit Chance, 20/21 (6d6)`, an notation used nowhere else.
- **Deathclaw** (p155) — the *Toss* damage sentence `...takes 14 (4d6)` has no damage type and no
  terminating period.
- **Giant Ant, Soldier** (p156) — the Bite line ends without a period.
- **Super Mutant Butcher / Master** (p150) and **Behemoth** (p151) — ability rows are printed with
  irregular column spacing. Values were confirmed against a second extraction and are correct.
- **Rattler** (p165) — **Healing Rate is printed as `-`** (a dash, no value). The `healingRate` key is
  therefore omitted for this creature only. Page 165 also carries an author aside: *"A Rattler is a
  creature I came up with for our Fallout: Zero campaign. It's a mix of a brown recluse spider and a
  rattlesnake."*
- **Humanoids** section (p175) opens with: *"This area isn't totally done yet, there will be more to
  come in the future!"*
- Several names are printed **with a trailing period** (`Feral Ghoul, Withered.`,
  `Glowing One, Putrid.`, `Mongrel, Alpha.`, `Cazador, Young.`, `Protectron, Utility.`, etc.). These
  are preserved verbatim in `name`; strip at import time if undesired.
- **Dog** (p152) is typed `Medium animal` — the only non-"mutated" animal. Humanoids are typed
  `Medium Human` with a capital H.

### Flat (diceless) damage
`Giant Ant` Bite, `Fire Ant` Fire Breath, `Bloatfly` Whack and `Bloatfly, Black` Whack deal a flat
number with **no dice expression**. `damage` holds the bare number and `special` says so.

## Schema decisions

The requested shape was followed. Where the book prints data the requested schema has no slot for,
an extra key was added rather than dropping the data. Ignore these at import time if not needed.

**Top level**
- `passiveSense` (int) — from the `Senses passive sense N` line. Present on all 71.
- `healingRate` (int) — from `Healing Rate N`. Omitted for Rattler (printed as `-`) and for all robots.
- `repairRate` (int) — robots print `Repair Rate N` instead of `Healing Rate`.
- `conditionImmunities` (array) — the book separates **Damage Immunities** from **Condition
  Immunities**. `immunities` holds damage immunities only; condition immunities (`Irradiated`,
  `poisoned`) go here so the distinction survives.
- `combatSequenceBonus` — **omitted on every creature**. No statblock lists a numeric bonus. The Guard's
  *Eye for Trouble* grants *advantage* on Combat Sequence rolls and is recorded as a trait.

**Attacks**
- `attackType` (string) — `Unarmed Attack` / `Melee Weapon Attack` / `Ranged Weapon Attack` /
  `Thrown Explosive`, as printed.
- `critChance` (string) — the `Crit Chance, ...` clause verbatim (e.g. `20/x2`, `20/5d10`,
  `20/x2, 2d4 fire damage`, `20/prone and knockback 15 feet`).
- `damage` holds the dice expression only (`4d10+7`); `damageAverage` (int) holds the average the book
  prints before it (`29`). Kept separate so the mismatches listed above stay visible.
- `target` (string) — e.g. `one target`, `up to three targets within 10 feet of each other`.
- **AP-costed actions with no attack roll** (Rad Revive, Touchdown!, Toss, Dirt Fling, Ground Slam,
  Acid Spray, Fire Breath, Charge Laser Beam, Laser Beam, Cloaking, Stimpak, First Aid Kit,
  Auto-Inject Stimpak, Mesmetron) are listed under `attacks` with `toHit` **omitted** and the full text
  in `special`. They are actions, not passives, so they do not belong in `traits`.
- Multi-attack riders (`makes 3 attacks`, `only makes one attack per turn`) and reload counts are kept
  in `special`.
- Secondary damage (e.g. Assaultron Invader's Shock Claw: bludgeoning **and** electricity) is recorded
  in `special`; `damage`/`damageType` carry the primary component.
- Negative to-hit values are real: Civilian and Junkie 9mm Pistol are `-1`; Brotherhood Initiate Baton,
  Civilian/Doctor Knife and Junkie Shiv are `+0`.
- Grenades and molotovs print `+N to roll` rather than `+N to hit`; recorded in `toHit` regardless.

**Loot** — roll tables are flattened into the `loot` string as
`Roll a 1d6 to determine... 1: X. 2: Y. ...`.

**Robots** — no `Stamina Points` line is printed for any robot, so `sp` is `0` per spec (14 statblocks:
all Assaultrons, Eyebot, Gutsies, Mister Handy, all Protectrons, Sentry Bot, Robobrain).
