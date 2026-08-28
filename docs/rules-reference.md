# Fallout TTRPG (Arcane Arcade) — Rules Reference for System Implementation

> **Edition note.** The body of this document was extracted from **v2.0**. The system now
> targets **v2.1**; where the editions differ, `docs/rules-v2.1-combat.md` and
> `docs/rules-v2.1-environment.md` supersede this file. The creature statblocks remain
> v2.0-sourced because v2.1 omits that chapter entirely ("Coming Soon").

Extracted from the local PDFs in `coding/ts/`:
- `Fallout TTRPG v2.0 (PDF).pdf` (179 pages) — the rulebook by Jacob / Arcane Arcade ("XP to Level 3")
- `Character Sheet Arcane-Arcade Fallout 2.0.pdf` (1 page)

This doc records only what the Foundry system needs to model. Page references are from the rulebook.

## Core resolution

- d20 + modifiers vs a Difficulty Class. Advantage/disadvantage (D&D-style, roll 2d20 keep best/worst) is used throughout.
- DC ladder (pg 21): 1 (extremely small chance of failure), 4 very easy, 8 easy, 12 medium, 16 hard, 20 very hard, 25 nearly impossible, 30 extremely small chance of success.

## Abilities — S.P.E.C.I.A.L. (pg 20-25)

Strength, Perception, Endurance, Charisma, Intelligence, Agility, Luck.

- PC scores range **1–10** (monsters up to 20). Typical human average is 5.
- **Modifier = score − 5** (score 1 → −4 … score 10 → +5). (The book phrases it "5 minus your score" but its own example — 7 Luck → +2, 3 STR → −2 — confirms score − 5.)
- Character creation: every score starts at 5, 3 points to distribute; you may lower a score to gain extra points. Min 1, max 10.
- If any ability score reaches 0, the character dies.
- Perk points may be spent to raise an ability score by 1 instead of taking a perk.

## Skills (14) (pg 21-25)

| Skill | Ability (choice allowed where "or") |
|---|---|
| Barter | Charisma |
| Breach | Perception **or** Intelligence |
| Crafting | Intelligence |
| Energy Weapons | Perception |
| Explosives | Perception |
| Guns | Agility |
| Intimidation | Strength **or** Charisma |
| Medicine | Perception **or** Intelligence |
| Melee Weapons | Strength |
| Science | Intelligence |
| Sneak | Agility |
| Speech | Charisma |
| Survival | Endurance |
| Unarmed | Strength |

**Skill bonus = governing ability modifier + invested skill points + background bonus + floor(Luck modifier / 2)** (the half-Luck bonus applies to ALL skills; creation checklist step 5).

- Background: +2 to three skills listed in the chosen background (creation step 6).
- **Skill points** are granted at levels 5, 9, 13, 17, 21, 25, 29. Per milestone: INT score ≤ 4 → 3 points, INT 5 → 4 points, INT ≥ 6 → 5 points. Retroactive if INT changes. Each point = permanent +1 to one skill.
- Breach special: may re-roll a Breach check up to Luck-modifier times (GM discretion).

## Derived statistics

Let `k = floor((level − 1) / 2)` (number of odd levels ≥3 reached).

- **Stamina Points (SP)** max = `10 + 5*k + AGI_mod * (k + 1)` — i.e. 10 + AGI mod at L1, +5 + AGI mod at each odd level 3rd–29th. Level-up table pg 6 confirms (its "level 9 HP ×4" cell is a book typo; the ×(k+1) progression is stated in prose, pg 5).
- **Hit Points (HP)** max = `10 + 5*k + END_mod * (k + 1)` — same progression with Endurance.
- **Action Points (AP)** = `10 + AGI_mod` (pg 127). Recycling: half of unused AP (rounded down) carries into your next turn.
- **Healing Rate** = `floor((level + END_score) / 2)` (pg 23).
- **Carry Load** max = `STR_score × 10`. Over max → Encumbered; over double max → Heavily Encumbered.
- **Passive Sense** = `12 + PER_mod`.
- **Combat Sequence** (initiative) = Perception check (d20 + PER mod); passive = `10 + PER_mod`.
- **AC** = 10 while unarmored (floor of 10 unless an ability says otherwise); armor sets AC to its listed value.
- **Damage Threshold (DT)** = 0 at 1st level; granted by armor/perks/abilities. Damage to HP is reduced by DT (never below-0 DT).
- **Radiation DC** (Humans only) = `12 − END_mod`. On entering/starting a turn in an Irradiated Zone, roll d20 (subtracting END mod is already in the DC; no other mods) vs Radiation DC; fail → +1 level of Rads; success → Radiation DC +2 until all Rad levels removed.
- **Party Nerve** = `floor(sum of all party members' CHA mods / 2)` — added to Death Saves; grants temp SP equal to bonus when rolling combat sequence.
- **Group Sneak** (sheet) = sum of all players' Sneak bonuses ÷ number of players.

## Leveling (pg 5-6)

- 1000 XP per level, levels 1–30. XP is party-shared: lower-XP members are topped up to the highest total.
- **Perk points**: 1 at every level EXCEPT 5th, 9th, 13th, 17th, 19th.
- XP bonuses: +10% per PC that hit 0 HP, +1000 flat per permanent PC death, +20% first-time creature discovery, +20% first-time location rest.

## Death & dying (pg 22)

At 0 HP: dying condition — fall prone, AP → 0, gain 4 AP/turn (max 6, unspent recycle). Death Save: 2 AP, d20 + (Luck mod OR END mod) + Party Nerve vs DC 10; not attempting = auto-fail. 3 successes → regain 1 HP; 3 failures → death. Bleeding levels cause an automatic failed death save each turn.

## Combat (pg 127-134)

- Round = 6s; AP economy, action costs 1–6 AP (guide pg 128), soft cap 6.
- Named actions: Attack (weapon AP cost), Dodge (attacks vs you at disadvantage + 15 ft reactive move), Equip weapon, Grapple / Escape grapple (contested STR vs STR/AGI), Help (advantage), Hide (Sneak vs passive sense; needs heavy obscurement/full cover), Interact, **Move 5 ft = 1 AP**, Ready (+2 AP), Reload (**6 AP**), Search, Shove (contested Unarmed vs Unarmed/AGI), **Sprint (5 AP, 50 ft line)**, Stand from prone, Stow weapon, Take Cover (3 AP), Unarmed Strike (**3 AP**, 1d4 + STR or AGI mod bludgeoning), Use a Chem.
- **Attack roll** = d20 + weapon's skill bonus vs target AC. Damage = weapon dice + governing ability modifier (Guns→AGI, Energy Weapons→PER, Melee/Unarmed→STR [unarmed may use AGI], Explosives→PER). Min 1 damage if negative mod reduces to 0.
- Damage depletes **SP first**; once SP is 0, damage applies to HP and is reduced by DT. Sneak attacks bypass SP entirely.
- **Critical hit**: raw d20 ≥ weapon's listed crit chance → auto-hit + extra damage per weapon's crit entry (either bonus dice or "×N" multiplier of rolled damage). All weapons except shotguns lower their crit chance by `floor(Luck_mod / 2)`.
- **Critical failure**: raw 1 → auto-miss, weapon gains a level of decay.
- **Blocking**: 3 AP while melee/unarmed; +2 + END mod DT vs melee attacks until you next attack.
- **Sneak attack**: target unaware & cannot sense you → attack is a critical hit and ignores SP (must still beat AC).
- **Blind attack**: d20 + Luck mod vs DC 5 + (distance in 5 ft increments).
- **Weapon STR requirement**: attacking without meeting it → disadvantage (avoidable: ranged, wield two-handed +2 AP; melee, +2 AP).
- **Ranged range**: weapon lists two multipliers; normal/long range in feet = multiplier × PER **score**. Beyond normal → disadvantage. Past long range the book contradicts itself: pg 21 (Perception sidebar) says you *cannot attack at all*; pg 66 (Ranged Weapons) says the attack "only hits if you roll a 20". **Ruled pg 66** — it is the weapon chapter's own rule, in the terms the weapon tables use, and it leaves the table a legal move where pg 21 only permits a refusal. Both sentences print on the chat card. See `packs-src/V21-NOTES-cover-range.md`.
- **Cover** (pg 130): half = +2 AC, three-quarters = +5 AC, total = cannot be targeted. Only the most protective degree applies. Against explosives, total/full cover is *immunity*, not resistance (pg 78: "every creature… that isn't behind full cover"). A creature can be the cover: an attack whose **total** is 6 or below hits the covering creature instead (pg 66).
- **Targeted attacks** (pg 130-131, table verified visually): extra AP by limb — Eyes +5 (damage halved), Head +4 (+1 damage die), Arm +3 (−1 damage die), Torso +2, Groin +3, Leg +2 (−1 damage die), Held Object +3 (object decays, creature unharmed). Melee weapons reduce extra AP by 2, min 1. On HP damage, roll d4 for the limb's condition (re-roll up to Luck mod times). Crit → the limb's severe injury, or up to two of its conditions.
- **Severe injuries on overflow** (pg 133): dropping to 0 HP with remaining damage ≥ your HP maximum inflicts a severe injury; damage in one hit ≥ 3× HP maximum is instant death. Damage while at 0 HP = a failed death save (two if a crit); death-save nat 1 = two failures, nat 20 = regain 1 HP. Melee attackers may knock out instead of kill (unconscious 1d4 − END mod hours, min 1).

## Conditions (pg 135-137)

Blinded; Bleeding (leveled — start of turn take `floor(healingRate/2)` HP damage per level; healing removes 2 levels instead of healing; auto-fails a death save if dying); Burning (1d10 fire/turn, 6 AP to extinguish); Buzzed; Corroded (DT −5); Dazed (max AP halved, no AP recycling); Deafened; **Dehydration** (leveled, −1 per level to all d20; +3 levels per day without ≥3 drinks; 10th level = death); Drunk; Encumbered (2 AP per 5 ft, +1 Fatigue/hr); **Exhaustion** (leveled, −1 per level to d20; death at 10; humans/ghouls/super mutants remove 1 per 6h rest, robots/synths per 2h); **Fatigue** (leveled, −1 per level to d20, max 9, lose 1 at end of each turn); Frightened (END check vs 8 + intimidator's Intimidation; four modes: Flight/Fight/Freeze/Fawn); Grappled; Hammered; Heavily Encumbered (3 AP per 5 ft); **Hunger** (leveled, −1 per level to d20; +1 level per day without food; death at 10); Invisible; Poisoned (disadvantage on all d20s); Prone; **Radiation/Rads** (leveled; per char sheet: −1 to d20 rolls per level and 1d12 damage); plus referenced states: Dying, Slowed, Shock, Diseased.

Immunities (char sheet): Gen-2 Synths and Robots are immune to Hunger and Dehydration; only Humans are subject to Radiation.

## Races (pg 7-13)

Human, Ghoul, Gen-2 Synth, Robot, Super Mutant. Races have traits (Age, Size, Variant + racial abilities). Most are Medium; some Large (8–12 ft). Humans: d20 on creation, nat 20 = secretly a Gen-3 Synth (narrative).

## Traits (pg 25-31)

Optional, 1–2 at creation (or later). Each has a benefit AND a drawback; race prerequisites common. **Wild Wasteland** variant per trait: doubled numbers / altered abilities. Structure: name, prerequisite, effect text, Wild Wasteland text.

## Perks (pg 32-50)

Structure: name, `Requirements:` (ability score minimums, sometimes level/race), effect text, optional `Repeat:` clause (some perks stack, e.g. It Just Works ×2). Organized by governing ability (Strength Perks … Luck Perks).

## Equipment

- **Currency**: caps. Also "Karma Caps" (meta-currency; Luck perk "Make it Double" grants an extra one).
- **Armor** (pg 52+): types Cloth, Leather, Metal, Multilayered, Ballistic Weave, Steel. Fields: AC, DT, upgrade slots, load, STR requirement (unmet → Slowed), decay levels. Worn armor's load is halved. Upgrades attach per material type, one of each type, ranks cost base price and stack cumulatively; ranks don't consume slots.
- **Melee weapons** (pg 57+): types Bladed, Blunt, Mechanical, Unarmed. Fields: AP cost, damage dice (+STR mod), range (5 ft default), crit chance + crit damage (dice or ×N), special properties, load, STR req, decay. Decay on nat 1 or improper throw.
- **Ranged weapons** (pg 63+): types Handguns, SMGs, Rifles, Shotguns, Big Guns, Energy Weapons. Fields: AP cost, damage dice (+AGI mod, or PER for energy), range multipliers (× PER score, normal/long), crit chance + crit damage, special properties, ammo type + capacity, load, STR req, decay. Reload = 6 AP. Decay on every 10th reload and on nat 1.
- **Special property keywords** include: Ammo/Depleted (melee w/ fuel), Breakable (decay on ≤3), Clasp (grapple on hit), Spread, Thrown, Incendiary, Destructive, Mangle, Durable — full glossaries pg 57-62 (melee) and pg 63+ (ranged).
- **Ammunition** (pg 64+): 10 rounds = 1 Load. Standard types w/ per-round cost (10mm 4c, 12ga 5c, .308, .50, 5mm, 5.56mm, 20ga, nails, railway spikes…). Energy ammo is battery-like: one cell powers N shots (energy cell 30c, microfusion 35c, cryo 50c, gamma 60c, 2mm EC 40c, fusion core 200c). Special ammo variants apply cost multipliers and rider effects (AP/FMJ pierce DT, Hollow Point, Magnum, Dragon's Breath, Explosive, Bean Bag, Pulse Slug…).
- **Decay & repair** (pg 93): items accumulate decay levels with penalties; repairable.

## Aid — food, drinks, medicine, chems (pg 82-91)

### Food and drinks (pg 82-84)

- Consuming **any food removes one level of hunger**; **any drink removes one level of dehydration**. Food effects apply after 1 minute, drink effects immediately.
- Properties that change that: **Filling** (remove another hunger level), **Refreshing** (food that also removes a dehydration level), **Hydrating** (drink removes *two additional* dehydration levels, three total), **Snack** (removes no hunger unless you eat two of them).
- **Irradiated** food gives one *irradiated level*; ten irradiated levels become one level of Rads.
- Stamina healing by flavour tier: **Bland** = half level, **Tasty** = level, **Flavorsome** = double, **Delicacy** = triple. **Regenerating** heals hit points equal to your Healing Rate.
- **Alcoholic / High-Proof** escalate buzzed → drunk → hammered → wasted for 1d4 hours (Endurance score ≤ 4 starts one step further along).
- **Addictive** (pg 82): a drink with the **Alcoholic** property *and* this one forces an **Endurance check vs DC 5**; failure means alcohol addiction — permanently two levels of exhaustion unless drunk — cleared by `6 − END mod` weeks (min 1). Note the book's trigger clause names only Alcoholic, so High-Proof drinks that carry the Addictive property arguably never check; the compendium keeps them addictive and flags the ambiguity per item.
- Other buffs: Caffeinated, Energizing (+1 AP/turn 4h), Empowering (+2 AP/turn 4h), Fortifying (rad DC −2 6h), Spicy (+3 DT vs fire/laser 6h), Hearty (+50 carry load 6h), Pungent (+1 DT 6h), Lucky, Charged, Strengthening, Cleansing (cures one addiction), Putrid (poisoned 4h if END ≤ 5).

### Medicine (pg 86-87)

Non-addictive. **Stimpak** heals your Healing Rate; **diluted** half, **super** double (ghouls get half the listed amount). **Healing Powder** heals half your Healing Rate at the start of each of three turns. **RadAway** removes two rad levels (diluted: one) but adds a level of thirst, 15 minutes. **Rad-X** lowers radiation DC by 2 for 3 hours, stacking up to three doses. **Addictol** cures all addictions at the cost of three levels each of dehydration, hunger, and exhaustion; **Fixer** cures one for one level each. Doctor's Bag (3 uses) and First Aid Kit (1 use) offer Tourniquet / Pain Killer / Stitch Wounds / Set Bone. The RobCo Quick Fix-it line is the robot/gen-2-synth equivalent of the stimpak line.

### Skill magazines (pg 88)

+1 to one skill until you rest; reading takes `5 − INT mod` minutes (0 → 6 AP). Five different issues of the same magazine make that +1 permanent. ~50c, load 2.

### Chems and Robot Overclock Programs (pg 89-91)

- **Usage**: 4 AP. **Duration**: every chem and program effect lasts **1 hour**.
- **Chem limit** = `2 + floor(END mod / 2)`, minimum 1, maximum 4. Each chem used past the limit **within a day** inflicts **5 levels of exhaustion**. Programs call the same number the RAM limit.
- **Addiction**: every chem forces an **Endurance ability check vs DC 6** on use. Failure = addicted; while addicted and *not* under the chem's effects you suffer that chem's withdrawal effect. Cleared by `6 − END mod` weeks clean (minimum 1). Robots instead clear "faulty programming" with 5 circuitry junk items and a DC 20 Crafting check.
- **Properties** (the buff side): Anabolic, Anesthetic, Anxiolytic, Extrapolating, Hallucinogenic, Hyperstimulant, Invigorating, Painkilling, Psychosis, Sedative, Stimulant, Super Stimulant.
- Withdrawal effects are per chem family (e.g. all Mentats → disadvantage on Charisma; Fury/Overdrive/all Psychos → AC −2; Med-X → incoming HP damage +2).
- **Rebound** and **Steady** are named in the pg 89 withdrawal list and the pg 139 loot table but have **no row in the pg 90 chem table** — the book prints no cost, properties, or load for either.

## Character sheet layout (1-page PDF)

Header: Name, Race, Background, Level, XP. Center-top: SPECIAL scores each with modifier box below. Left column: 14 skills with governing ability labels. Center: AC, DT, armor upgrades + decay, current conditions; Stamina Points, Hit Points, Healing Rate; Combat Sequence, Action Points, Fatigue levels; Hunger / Dehydration / Exhaustion levels, Radiation DC + Rad levels; Passive Sense, Party Nerve, Group Sneak. Right: three weapon blocks (Weapon, AP, Attack, Damage, Range, Crit, Special Properties, Ammo, Mods, Decay levels). Bottom: Traits & Perks (large text area), inventory lines, Caps, Carry Load.
