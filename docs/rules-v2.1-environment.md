# Fallout TTRPG v2.1 — Movement, Environment, Diseases, Weather, Hazards, Radiation

Extracted from `coding/ts/FALLOUT TTRPG 2.1.pdf` (136 pages). Printed page number == PDF page index (offset 0).
Cross-checked against `manuscript Fallout TTRPG v2.1.pdf`, `Patch Notes_ Fallout 2.1.pdf`, and `Fallout TTRPG v2.0 (PDF).pdf` for deltas.
All tables on pp. 116, 120, 121–123, 124 were read visually as 200–300 dpi renders, not from `pdftotext`.

Companion to `rules-reference.md` (v2.0). Same conventions: only what the Foundry system must model, every number kept, page cite in parentheses.

**Actual chapter ranges** (headings, not the task's guesses):

| Chapter | Pages | Status |
|---|---|---|
| Movement | 116–117 | Existed in v2.0 (pp. 121–123); **Difficult Terrain reworked** |
| The Environment | 118–119 | Existed in v2.0 (pp. 124–125); near-identical, one typo fix |
| Diseases | 120 | **New chapter** |
| Hazardous Weather | 121–123 (left column of 123) | **New chapter** |
| Hazardous Environments | 123 (right column only) | **New chapter** |
| Radiation | 124 | Existed in v2.0 (p. 126); **Rads condition reworked** |

Combat begins on p. 125, so 124 is the last page in scope.

---

## Movement (pg 116–117)

### Travel Pace (pg 116) — table transcribed verbatim

| Speed | Distance | Passive Sneak | Effect |
|---|---|---|---|
| Slow | 18 miles. (2.25 mph) | 15 + Average Group Sneak Bonus | Advantage on Combat Sequence rolls. |
| Normal | 24 miles. (3 mph) | 12 + Average Group Sneak Bonus | - |
| Fast | 30 miles. (3.75 mph) | 10 + Average Group Sneak Bonus | Disadvantage on Combat Sequence rolls. |

Identical to v2.0 pg 121. "Average Group Sneak Bonus" is the existing char-sheet Group Sneak value (sum of players' Sneak bonuses ÷ number of players).

- **Traveling Limits**: hours travelable per day = `8 + floor(END_mod / 2)`. Each hour beyond that = +1 level of Fatigue.
- **The Roads Walked**: traveling **on foot** for at least `floor(max distance / 2)` = +1 level of Fatigue, regardless of pace or duration.
- **Passive Sneak**: creatures whose passive sense < the party's passive sneak score cannot detect the party while traveling (GM may override if the party enters combat/makes noise).
- **Vehicles and Mounts**:
  - Mount: use the **mount's** max travel distance instead of your own; rider gains no Fatigue. Gallop = 1 hour at twice fast-pace distance; the **mount** gains 1 level of Fatigue.
  - Driving a vehicle: no Fatigue for traveling half your max distance; your max travel distance is **doubled**. Passengers get neither benefit.

### Difficult Terrain (pg 116) — **REWORKED, supersedes v2.0**

| | Travel | Combat |
|---|---|---|
| Difficult terrain | Distance traveled **halved** | **+1 AP** per 5 ft moved |
| Extreme difficult terrain | Distance traveled **quartered** | **+2 AP** per 5 ft moved |

- **Moving through an enemy's space is difficult terrain** (new clause).
- v2.0 (pg 121) instead **capped** movement at 20 ft/turn in difficult terrain and 10 ft/turn in extreme difficult terrain, with no AP surcharge. **Our v2.0-based implementation must drop the cap and add the surcharge.**
- Terrain examples changed too: v2.0 listed "steep mountains, and ice-covered ground" under difficult terrain; v2.1 drops them (ice now has its own rule, pg 123).

### Special Types of Movement (pg 116–117)

Unchanged from v2.0 except where noted. All costs are per 5 feet unless stated.

**Climbing (pg 116–117)**

| Surface | AP per 5 ft | Notes |
|---|---|---|
| Scalable | 3 AP | Handholds, rugged, not perfectly vertical |
| Sheer | 4 AP | Few handholds, smooth/slippery/vertical |
| Treacherous | 4 AP (**climbing equipment required**) | Cannot be climbed at all without gear |

- While climbing you are **off-balance** (the book cites "see pg #" — see *Dangling references* below).
- Climbing gear (rope, stakes) reduces cost by **1 AP** per 5 ft, except on treacherous surfaces where it is a prerequisite, not a discount.
- Round limit in combat = your **Endurance score** (min 1). At the start of your next turn after exceeding it, you **fall**.

**Swimming (pg 117)**

| Water | AP per 5 ft | Forced movement | Round limit |
|---|---|---|---|
| Still | 2 AP | — | — |
| Rushing | 2 AP | 10 ft in the GM's chosen direction at the start of your turn | — |
| Treacherous | 3 AP | 20 ft in the GM's chosen direction at the start of your turn | END score (min 1), then you begin drowning |

- Off-balance while swimming.
- **Diving**: underwater movement costs **+1 AP** per 5 ft. Breath = `1 + END_mod` minutes (min 30 s). Breath remaining is reduced by **30 s (6 rounds)** each time you take damage **or** spend more than half your AP on a turn. Out of breath underwater → drowning (Suffocating, pg 118).
- Book inconsistency: the intro sentence names the three tiers "Still, Rushing, or **Hazardous**" but the third heading is "Treacherous Waters", and that entry's rule text says "swim 5 feet across **rushing** waters" (copy-paste). Treat as Treacherous @ 3 AP.

**Jumping (pg 117)**

| Jump | Distance | AP | Overreach check |
|---|---|---|---|
| Long | `5 × STR_mod` ft (min 5) | 1 AP per 5 ft cleared | STR check, DC `10 + extra feet` |
| High | `3 + STR_mod` ft (min 1) | 1 AP per **foot** cleared | STR check, DC `18 + extra feet` |

- Requires that **the last two AP you spent were on movement** (may be from your previous turn, a readied action, or the Commander perk). Without that, distance is **halved**.
- You may not jump at all if you cannot pay the full AP cost. On an overreach, AP is spent **before** the check and is lost on a failure.

**Sprinting (pg 117)**: 5 AP → move 50 ft in a straight line immediately. Stopping or being obstructed by difficult terrain ends the movement; **the AP is still spent**. (Matches the existing v2.0 entry.)

---

## The Environment (pg 118–119)

Substantively identical to v2.0 pp. 124–125. Recorded here because `rules-reference.md` never captured it.

### Falling (pg 118) — table compiled from prose

| Size | Fall, 1st turn | Fall, each later turn | Impact damage | Max | On landing |
|---|---|---|---|---|---|
| Tiny | 25 ft | 50 ft | none | — | No damage unless it lands on something hazardous. Fall > 50 ft → 1 random **arm or leg** limb condition. |
| Small | 400 ft | 800 ft | 1d4 per 10 ft | 120d4 | Prone. If damage reaches HP → a random arm **and** leg condition. |
| Medium | 500 ft | 1000 ft | 1d6 per 10 ft | 150d6 | Prone. If damage reaches HP → a random arm **and** leg condition. |
| Large | 800 ft | 1600 ft | 2d6 per 10 ft | 240d6 | Prone. If damage reaches HP → a random arm **and** leg condition. |
| Huge | 1100 ft | 2200 ft | 2d10 per **20** ft | 330d10 | Prone. If damage reaches HP → a random arm **and** leg condition. |
| Gargantuan | 2000 ft | 4000 ft | 4d10 per **20** ft | 800d10 | Prone. If damage reaches HP → a random arm **and** leg condition. |

- Damage type is **impact** (v2.0 pg ~131 glossary: bludgeoning on a larger scale).
- v2.0 printed the Medium maximum as "150d4" while charging 1d6 per 10 ft; **v2.1 corrects it to 150d6**. Use 150d6.

### Suffocating (pg 118)

- Breath = `1 + END_mod` minutes (min 30 s).
- Out of breath / choking: survive `END_mod` rounds (min 1).
- Then, at the start of its next turn, the creature **drops to 0 HP and is dying**, and **cannot regain HP or be stabilized until it can breathe again**.

### Flames (pg 118)

- Entering or starting your turn in a flaming area: **2d10 fire damage + the Burning condition**.
- The area **spreads 5 ft in all directions at the start of each round** (GM may slow it for wind/rain/non-flammable surroundings).
- Damage scales: **+1d10 for every 20 additional feet** the area has grown, to a maximum of **50d10**.
- Fires last up to a few hours unless extinguished by water, a cryo-damage weapon, or a fire extinguisher.

### Vision and Light (pg 118–119)

- **Lightly obscured** (dim light, patchy fog, moderate foliage): disadvantage on sight-based Perception checks, **passive sense −5**, **all ranged weapon range halved**.
- **Heavily obscured** (darkness, opaque fog, dense foliage): counts as the **Blinded** condition for anything seen in that area.
- Illumination tiers: **bright light** (normal vision; gloomy daylight, flashlights, lanterns, fires within a radius), **dim light** (= lightly obscured; twilight/dawn, bright full moon), **darkness** (= heavily obscured; night outdoors, unlit cave, powered-down vault).
- **Blindsight**: perceives surroundings without sight within a radius.
- **Nightvision**: within a range, darkness is treated as dim light (so only lightly obscured); no color, shades of gray only.

### Interacting with Objects (pg 119)

No fixed mechanics. GM sets an ad-hoc DC (e.g. STR to force a lever, INT to rewire a switch).

### Food and Water (pg 119)

Ghoul / Human / Super Mutant: **+1 level of Hunger per 24 h without food**; **+3 levels of Dehydration per 24 h without water**. (Gen-2 Synths and Robots are immune — racial traits, pp. 7–11.)

### Resting (pg 119)

| Race group | Sleep requirement | 1 hour of rest | Long rest |
|---|---|---|---|
| Ghoul, Human, Super Mutant | +1 level of Exhaustion per 24 h without sleep | SP restored to **half maximum**; sleeping comfortably restores SP to **full** | **6 hours**: heal HP = `floor(END_score / 2) + level`, remove 1 level of Exhaustion |
| Gen-2 Synth, Robot | None (does not require sleep) | SP restored to **full** | **2 hours**: heal HP = `floor(max(INT, PER)_score / 2) + level` (book: "half your INT or PER score"), remove 1 level of Exhaustion |

- **Sleeping Comfortably** requires a soft surface (blanket, bedroll) **and** shelter (cave, building, tent). Without it, you regain **half** the normal SP and HP.
- Note: the synth/robot HP formula says "half your INT **or** PER score" — player's choice is implied but not stated; flag for GM config.

---

## Diseases (pg 120) — **NEW CHAPTER**

The chapter is one table and nothing else. Transcribed verbatim (20 rows, verified visually at 300 dpi).

| Name | Effect | Duration | Cure |
|---|---|---|---|
| Blood worms | Whenever you take damage to your hit points, you take an additional 1d4 poison damage. | `12 − END score` hours. | x1 antibiotic and an hour. |
| Bone worms | Whenever you take damage to your hit points, you gain a random limb condition. (Roll a d6: 1 eyes, 2 head, 3 arms, 4 legs, 5 torso, 6 groin) | `12 − END score` hours. | x1 antibiotic and an hour. |
| Buzz brain | You have disadvantage on any Intelligence ability or skill checks. | You are no longer affected by this disease after you sleep. | x1 food or chem with the **stimulant** property. |
| Dysentery | You gain four levels of Dehydration that cannot be removed until you no longer have this disease. | `15 − END score` days (minimum 1). | x2 antibiotics, each one taken one day apart. |
| Fever | Your maximum action points are reduced by 3 to a minimum of 6 and you have disadvantage on all d20 rolls. | 2 days if END score ≥ 6. 4 days if END score ≤ 5. | x1 Med-X **suppresses** the effects of a fever by 1d4 hours. |
| Flap limb | You have disadvantage on any checks, skill checks, or attack rolls using Strength. | You are no longer affected by this disease after you sleep. | x1 stimpak. |
| Glowing pustules | Whenever you take damage to your hit points, you and each creature within 10 feet of you gain one level of Rads. | `15 − END score` days (minimum 1). | x2 antibiotics, each one taken one day apart. |
| Heat flashes | You have disadvantage on any Endurance ability or skill checks. | `12 − END score` hours. | You are no longer affected by this disease after you sleep **so long as you have no levels of dehydration**. |
| Jelly fingers | Attacking with a ranged weapon costs 1 additional action point. | `12 − END score` hours. | x1 antibiotic and an hour. |
| Lock joint | Attacking with a melee weapon costs 1 additional action point. | `12 − END score` hours. | x1 antibiotic and an hour. |
| Needle spine | Your carry load is halved. | 2 days if END score ≥ 6. 4 days if END score ≤ 5. | x1 Med-X. |
| Parasites | You gain four levels of Hunger that cannot be removed until you no longer have this disease. | 2 days if END score ≥ 6. 4 days if END score ≤ 5. | x1 antibiotic and an hour. |
| Rad worms | You gain one level of radiation whenever you sleep. | `12 − END score` days (minimum 1). | x2 rad-away, each one taken one day apart. |
| Rattle hands | Whenever you deal damage from an attack with a ranged weapon, the damage is reduced by 2 (to a minimum of 1). | `12 − END score` days (minimum 1). | x1 chem with the **sedative** property. |
| Sludge lung | Your maximum AP is reduced by 2 to a minimum of 6 and you can only move a maximum of 20 feet on your turn. | `12 − END score` days (minimum 1). | x2 antibiotics, each one taken one day apart. |
| Snot ear | You have disadvantage on any checks, skill checks, or attack rolls using Perception. | 2 days if END score ≥ 6. 4 days if END score ≤ 5. | x1 antibiotic and an hour. |
| Swamp gas | You have disadvantage on any Charisma ability or skill checks. | 2 days if END score ≥ 6. 4 days if END score ≤ 5. | x1 antibiotic and an hour. |
| Swamp itch | You have disadvantage on any checks, skill checks, or attack rolls using Agility. | 2 days if END score ≥ 6. 4 days if END score ≤ 5. | x1 antibiotic and an hour. |
| Weeping sores | Whenever you take damage to your hit points, you gain one level of bleeding. | 2 days if END score ≥ 6. 4 days if END score ≤ 5. | x1 antibiotic and an hour. |
| The Woopsies | You have disadvantage on any checks, skill checks, or attack rolls using Luck. | `12 − END score` days. (no stated minimum) | x1 Nuka cola quantum, **or** tossing 2d20 caps into the ocean, a lake, river, or fountain. If you take back the caps, you are re-afflicted by the Woopsies. |

Notes on the duration column, which is inconsistent in the book:
- The hour-based rows (`12 − END score` hours) carry **no minimum**; with END 10 that is 2 hours, with END 12+ (monsters) it goes to zero or negative.
- `15 − END score` days and `12 − END score` days rows say "(minimum 1)" except **The Woopsies**, which omits it.
- Durations are keyed off the **Endurance score**, not the modifier.

### Ways to contract a disease (all outside this chapter)

- **Toxic Water** (pg 123): roll below 5 on the Rad Resist check → a **random** disease.
- **Water** (pg 123): roll a natural 1 on the Rad Resist check → **Parasites** specifically.
- **Toxic Air** (pg 123): roll below 5 on the Endurance check → **Sludge lung**; roll a natural 1 → a **random** disease. A gas mask prevents disease entirely.
- **Tainted** food/drink property (pg 83, new in v2.1): consuming it makes you contract a **random** disease; you may **flip your Karma Cap** to ignore it instead.
- Creature abilities (e.g. mole rats, bloodbugs) inflict "diseased" in stat blocks.
- **Immuno-Four-Leaf Clover** perk (pg 49, Luck 5): when you or another PC contracts a disease, roll a Luck check vs DC `10 + 2d4`; on a success you do not contract it and the next such DC rises by 1d4. The DC resets to `10 + 2d4` after you do contract a disease.

**The book never defines how to roll a "random disease."** The table has exactly 20 rows in alphabetical order, so a d20 against the table row order is the obvious implementation, but it is our inference, not printed.

**Antibiotics** (rules pg 86; price table pg 87: **75 caps, load 1**): "This bottled medicine can stop diseases. How it affects the disease you contracted is dependent on the disease. You can consume this bottled medicine with **5 AP**." The per-disease effect lives in the Cure column above.

### New character-sheet state required

- **A disease list per actor.** Each entry needs: disease id, effect payload, **remaining duration** (in hours or days, computed from END score at contraction time), a **cure-progress counter** (the "x2 antibiotics, one day apart" cures need a doses-taken count plus a timestamp of the last dose), and a cure-condition flag for the sleep-gated ones.
- **Sleep-triggered clearing.** Buzz brain, Flap limb and Heat flashes end "after you sleep" — the rest workflow must run a disease-clearing pass, and Heat flashes must additionally check `dehydration levels == 0`.
- **Suppression vs cure.** Fever's Med-X entry is a *suppression* for 1d4 hours, not a cure — a disease needs a "suppressed until" timestamp separate from its duration.
- **Locked condition levels.** Dysentery grants 4 levels of Dehydration and Parasites 4 levels of Hunger that **cannot be removed** while the disease lasts. Our condition-level fields are plain counters; they need a locked/floor component, or drinking/eating will incorrectly clear them.
- **The Woopsies' cure is stateful and reversible**: caps thrown into water cure it, and retrieving them re-afflicts. Needs a persistent flag, not a one-shot cure.
- **AP-cost and carry-load modifiers as disease-sourced effects**: Fever (max AP −3, floor 6), Sludge lung (max AP −2, floor 6, plus a 20 ft/turn movement cap), Needle spine (carry load halved), Jelly fingers / Lock joint (+1 AP on ranged / melee attacks).

---

## Hazardous Weather (pg 121–123) — **NEW CHAPTER**

Framing (pg 121): the GM chooses the weather type and its **severity level**. **Any** weather may additionally be assigned a **Radiation Severity Score** (pg 124) layered on top of its listed effects.

### Fog (pg 121)

Typical duration: **1d4 hours**. Always: Perception checks relying on **sound** have disadvantage, and **passive sense −8** (this applies at all severities, in addition to the per-severity list).

| Severity | See normally to | Lightly obscured beyond | Blind beyond |
|---|---|---|---|
| 1 | 30 ft | 30 ft | 100 ft |
| 2 | 15 ft | 15 ft | 50 ft |
| 3 | 5 ft | 5 ft | 20 ft |

### Thunderstorm (pg 121)

Typical duration: **15 minutes to an hour**. Storm radius = **6d4 miles**.

**Lightning strike check**: after spending **10 minutes** in the storm, roll `4d10 − floor(Luck_mod / 2)` (add half your Luck modifier instead if it is negative). Result **≥ 40** → you are struck: **3d12 electricity damage to your hit points** and **six levels of Exhaustion**.

| Severity | Effects |
|---|---|
| 1 | Passive sense −4; all ranged weapon range halved. |
| 2 | Passive sense −8; all ranged weapon range reduced by three quarters (half of half). |

### Radstorm (pg 121)

Typical duration: **15 minutes to an hour**. Storm radius = **6d4 miles**.

**Lightning strike check**: same trigger and formula as Thunderstorm (10 minutes, `4d10 − floor(Luck_mod / 2)`, ≥ 40). On a strike: **2d12 electricity damage and 2d12 radiation damage to your hit points**, **three levels of Exhaustion**, and **three levels of Rads**.

| Severity | Passive sense | Ranged range | Zone |
|---|---|---|---|
| 1 | −4 | halved | Level 4 irradiated zone |
| 2 | −8 | three quarters (half of half) | Level 5 irradiated zone |
| 3 | −8 | three quarters (half of half) | Level 6 irradiated zone |

(Severity 3's sense/range values are identical to Severity 2 as printed — only the zone level escalates.)

### Blizzard (pg 121)

Freezing wind and snow; **coincides with Extreme Cold**, whose effects apply in addition.

| Severity | Extreme Cold | Passive sense | Blind beyond | Ranged range |
|---|---|---|---|---|
| 1 | Severity 1 or 2 | −6 | 100 ft | — |
| 2 | Severity 3 or 4 | −10 | 50 ft | three quarters (half of half) |

### Rain (pg 122)

| Severity | Passive sense | Hypothermia (no shelter) | Ranged range |
|---|---|---|---|
| 1 | −2 | — | — |
| 2 | −4 | END ≥ 6: 1 level per **4 hours**; otherwise 1 level per **3 hours** | — |
| 3 | −6 | END ≥ 6: 1 level per **2 hours**; otherwise 1 level per **hour** | halved |

### Dust Storm (pg 122)

Applies at **all** severities: all ranged weapon range reduced by three quarters (half of half); **moving 5 feet costs 2 AP** and **sprinting moves half as far**; without shelter, **+1 level of Exhaustion after 30 minutes**.

| Severity | Passive sense | Blind beyond |
|---|---|---|
| 1 | −10 | 30 ft |
| 2 | −15 | 10 ft |

### Extreme Cold (pg 122)

Air temperature below 30 °F; each severity step is roughly −20 °F. **Exposed or wet → levels gained are doubled.** **Insulated → the interval is doubled, or the levels gained drop from two to one.**

| Severity | Temperature | Hypothermia gain |
|---|---|---|
| 1 | about 30° – 21° | END ≥ 6: 1 level per **30 minutes**; otherwise 1 level per **15 minutes** |
| 2 | about 20° – 11° | END ≥ 7: 1 level per **15 minutes**; otherwise **2 levels** per 15 minutes |
| 3 | about 11° – 0° | END ≥ 9: 1 level per **5 minutes**; otherwise **2 levels** per 5 minutes |
| 4 | Sub-Zero | **2 levels per minute** (no Endurance exemption) |

Endurance thresholds are **scores**, and they escalate per severity (6 / 7 / 9 / none).

### Extreme Heat (pg 123)

Air temperature above 90 °F; each severity step is roughly +10 °F. **Insulated, or holding any level of Dehydration → levels gained are doubled.**

| Severity | Temperature | Overheating gain | Water requirement |
|---|---|---|---|
| 1 | about 90° – 99° | END ≥ 6: 1 level per **2 hours**; otherwise 1 level per **hour** | normal |
| 2 | about 100° – 109° | END ≥ 7: 1 level per **hour**; otherwise 1 level per **30 minutes** | **doubled** |
| 3 | 110° – 119° | END ≥ 9: 1 level per **30 minutes**; otherwise **2 levels** per 30 minutes | **tripled** |
| 4 | Above 120° | **1 level per 10 minutes** (no Endurance exemption) | (not restated) |

### Hypothermia (pg 122; canonical text in Conditions, pg 132–134) — **NEW CONDITION**

- Leveled. Whenever you roll a d20 (**except Luck rolls**), subtract **1 per level**.
- **Action points are reduced by `floor(levels / 2)`.**
- **Tenth level = death.**
- **Preventing**: you cannot gain levels while within **5 feet of a source of warmth** that could feasibly warm you (fire, heater); certain items also generate warmth.
- **Removing**: 1 level per **hour** spent in a shelter with a heat source, or anywhere not considered Extreme Cold. **If that heat source is Extreme Heat, you must succeed a DC 20 Endurance check at the end of the hour or you die.**

### Overheating (pg 123; canonical text in Conditions, pg 132–134) — **NEW CONDITION**

- Leveled. Whenever you roll a d20 (**except Luck rolls**), subtract **1 per level**.
- **Action points are reduced by `floor(levels / 2)`.**
- **Tenth level = death.**
- **Removing**: 1 level per **hour** spent in a shelter with a cooling source, or anywhere not considered Extreme Heat. No prevention clause is printed (unlike Hypothermia).
- Name collision: Power Armor (pp. 58–59) already uses "Overheating" for its own >15 AP-per-turn rule. **These are different mechanics with the same name** — do not merge them in the data model.

### New character-sheet state required

- **Two new leveled conditions**, Hypothermia and Overheating, each 0–10, each applying a global d20 penalty (Luck-exempt) and an **AP reduction of `floor(levels/2)`** — the AP reduction is a kind our v2.0 model does not have (Fatigue/Hunger/Dehydration/Exhaustion only touch the d20).
- **Ambient weather state on the scene**, not the actor: weather type + severity + optional Radiation Severity Score, driving passive-sense penalties, ranged-range multipliers, movement AP surcharges (Dust Storm), and per-interval condition ticks.
- **Two per-actor environmental flags** the weather rules key off: **Insulated** and **Exposed/wet** (Extreme Cold doubles gains when exposed/wet and halves them when insulated; Extreme Heat *doubles* gains when insulated — the two chapters use "insulated" with opposite valence, which is intentional but easy to get backwards).
- **A "shelter" / "near warmth" / "near cooling" flag** for prevention and removal.
- **A per-actor timer for interval ticks** (every 10/15/30 minutes, hourly, etc.) plus the Thunderstorm/Radstorm 10-minute lightning check.
- **Vision-range overrides**: "blind beyond N feet" and "lightly obscured beyond N feet" are per-weather values that must feed Foundry's vision/detection ranges.
- **Ranged range multipliers** (×1/2 and ×1/4) must apply to the existing `multiplier × PER score` range computation.

---

## Hazardous Environments (pg 123) — **NEW CHAPTER**

| Hazard | Rule |
|---|---|
| **Water** | Swimming in it: succeed a **Rad Resist check** or take a level of Rads. **A gas mask does not help on this check.** Roll a natural **1** → you also contract **Parasites**. |
| **Toxic Water** | Swimming: succeed a **Rad Resist check** or take a level of Rads; gas mask does not help. Roll **below a 5** → you also contract a **random disease**. |
| **Frigid Water** | You may swim for `END score` minutes; **every minute beyond that = 1 level of Hypothermia**. Also: succeed a **Rad Resist check** or take a level of Rads; gas mask does not help. |
| **Ice** | Each time you move **more than 20 feet on your turn in combat**, succeed an **Agility or Luck check vs DC 18** or **fall prone**. |
| **Toxic Air** | Each **minute** in it, succeed an **Endurance check vs DC 18** or take **1 level of Exhaustion**. Roll **below 5** → contract **Sludge lung**. Roll a **1** → contract a **random disease**. **Wearing a gas mask reduces the DC by 10 (to 8) and makes you immune to contracting a disease.** |

- "**Rad Resist check**" is used here (and in the Power Armor section, pg 57, and throughout v2.0 creature stat blocks) but **is never formally defined**. It is the d20-vs-Radiation-DC roll from pg 124. Since only **Humans** have a Radiation DC (pg 124 and the Endurance section), the rules do not say what non-humans roll for swimming in irradiated water. Treat non-humans as exempt, consistent with v2.0, and flag it as a GM setting.
- Ice's "Agility or Luck check equal to 18" is a flat **ability check** (d20 + ability mod), not a skill check.

### New character-sheet state required

- Mostly **scene/region state**, not actor state: a region needs a hazard type (water / toxic water / frigid water / ice / toxic air) with its own tick interval.
- **Gas mask equipped** must be a queryable actor flag — it flips the Toxic Air DC by 10 and grants disease immunity, but is explicitly **ignored** for all three water Rad Resist checks.
- **Frigid-water immersion timer** (minutes swum) per actor.

---

## Radiation (pg 124) — **REWORKED**

### Radiation Severity Score (pg 124) — table transcribed verbatim

| Severity | END Check Frequency | RADS Per Second |
|---|---|---|
| Level 1 | 1 hour | 0.05/second |
| Level 2 | 30 minutes | 0.1/second |
| Level 3 | 10 minutes | 0.3/second |
| Level 4 | 3 minutes | 1/second |
| Level 5 | 1 minute | 3/second |
| Level 6 | 30 seconds | 5/second |
| Level 7 | 6 Seconds | 30/second |

- Identical to the v2.0 table (pg 126) — **not** a new table, but it was never recorded in `rules-reference.md`, so our implementation has no notion of zone severity at all.
- The **RADS Per Second** column is flavour/Geiger-readout only; nothing in the rules consumes it. **END Check Frequency** is the mechanical column: it is how often an occupant re-rolls against their Radiation DC. Level 7 (6 seconds) = once per combat round.
- A character with a **Geiger counter or Pip-Boy** is told the zone's Radiation Severity Score by the GM.
- The Radstorm (pg 121) creates Level 4 / 5 / 6 irradiated zones by severity.

### Radiation DC (pg 124, repeated from the Endurance section) — unchanged from v2.0

```
Radiation DC = 12 − END_mod          (Humans only)
```

- On entering, or starting your turn for the first time in, an Irradiated Zone: roll a d20 against your Radiation DC. **No ability modifier is added** — the Endurance modifier is already baked into the DC.
- **Fail** → +1 level of Rads. **Succeed** → your Radiation DC **increases by 2** until you remove all your levels of Rads.
- The zone's Radiation Severity Score determines the re-roll frequency (table above).
- Items, equipment, and perks may reduce your Radiation DC (e.g. Rad-X −2 for 3 hours, stacking three doses).

### Rads condition (pg 124; canonical in Conditions, pg 132–134) — **REWORKED, supersedes v2.0**

- Whenever you roll a d20 (**except Luck rolls**), subtract **1 per level of Rads**.
- **Each time you gain a level of Rads you take `1d4` radiation damage to your hit points AND your stamina points.** That damage **cannot be healed until you have no levels of Rads at all.**
- If that radiation damage reduces you to 0 HP, **or** you would gain your **10th** level of Radiation, **you die**. Then roll a **Luck check vs DC 20**:
  - Success → you return to life as a **ghoul with 1 hit point**.
  - Roll **below a 5** → you return as a **feral ghoul** and the GM controls your character.
  - (The book prints no outcome for a failure of 5–19; by v2.0's identical wording, that is simply death. Flag as an ambiguity.)

**Deltas from v2.0** (v2.0 pg 108 / Conditions):

| | v2.0 | v2.1 (pg 124) |
|---|---|---|
| Damage per rad level gained | **1d12** | **1d4** |
| Applied to | hit points only | **hit points AND stamina points** (1d4 to each; the text reads "1d4 radiation damage to your hit points and stamina points") |
| Unhealable until | "you are no longer in an irradiated zone" | **"you no longer have any levels of rads"** |
| d20 penalty | −1 per level on **all** d20 rolls | −1 per level, **Luck rolls exempt** (global "Mortal Detriments" change, patch notes) |
| Radiation DC, ghoulification | unchanged | unchanged |

The unhealable clause is much harsher in v2.1: leaving the zone no longer unlocks healing — you must clear **every** rad level (RadAway removes 2, diluted 1; pg 86–87) before any of that damage can be restored.

### New character-sheet state required

- **An unhealable-damage pool**, separate from current HP and SP. Both HP and SP now carry a "radiation-locked" amount that healing effects must skip, and which is released only when rad levels hit 0. This is the single biggest data-model addition in scope — v2.0's model has no concept of it, and its release condition changed too (rad levels, not zone occupancy).
- **Zone severity on scenes/regions**, plus a per-actor "last Radiation DC check" timestamp so re-roll cadence can follow the severity table.
- **Radiation DC escalation state**: the "+2 until you remove all your levels of Rads" bonus is already in v2.0 but is per-character mutable state that resets on reaching 0 rad levels; verify our implementation actually tracks and resets it.
- **Luck-roll exemption** now applies to Rads, Hypothermia, Overheating, Hunger, Dehydration, Exhaustion, Fatigue — a global change to how leveled penalties are applied.

---

## Cross-chapter contradictions with v2.0

Ordered by how much of the existing implementation they invalidate.

1. **Rads damage** (pg 124): `1d12` HP → `1d4` HP **and** `1d4` SP, unhealable until **zero rad levels** rather than until you leave the zone. Our v2.0 implementation is wrong on the die, the target pools, and the unlock condition.
2. **Difficult terrain** (pg 116): the 20 ft / 10 ft per-turn movement caps are **gone**, replaced by **+1 AP / +2 AP per 5 feet**, and **enemy spaces now count as difficult terrain**.
3. **Luck exemption** (patch notes; pg 124, 132–134): leveled penalties (Rads, Hunger, Dehydration, Exhaustion, Fatigue, and the new Hypothermia/Overheating) no longer subtract from **Luck** d20 rolls.
4. **Medium falling maximum** (pg 118): v2.0's "150d4" was a typo; v2.1 prints **150d6**.
5. **New conditions** Hypothermia and Overheating join the v2.0 condition list; "Overheating" now collides by name with the Power Armor AP-overload rule (pp. 58–59).
6. **New "Diseased" state** is now a real subsystem (20 named diseases) rather than a bare keyword referenced by creature stat blocks.
7. **New Tainted food property** (pg 83) and **Antibiotics** item (pg 86, 75c, load 1, 5 AP to consume) tie the item compendium into the disease system.

### Dangling references in the book (not our bugs to fix, but they block automation)

- **Off-balance** is applied by Climbing and Swimming (pg 116–117) with a "(see pg #)" placeholder and **is never defined anywhere in v2.1**, including the Conditions chapter (pp. 132–134). Same defect as v2.0. Nothing can be automated for it.
- Several "(see pg #)" placeholders remain (Suffocating, Blinded, Off-balance).
- "Rad Resist check" is used but never defined (see Hazardous Environments above).
- "Random disease" is invoked three times with no roll table specified.
- Swimming's third tier is called both "Hazardous" and "Treacherous," and its rule text says "rushing waters."

---

## Implementation impact

Priority order. "Cheap" = a value or a small effect in an existing field; "expensive" = new schema, new UI, or new automation.

1. **Rads damage rework — cheap number change, expensive pool change.** Changing `1d12` → `1d4` is a one-line edit. Applying it to **both** HP and SP, and gating healing on it, requires a new **unhealable/locked damage pool** per resource with a release trigger on `radLevels == 0`. Every healing path (stimpaks, healing powder, rest, food SP restore, RobCo Quick Fix-it) must respect it. **Do this first — it is both the most-used rule in scope and the one our current code gets wrong in three separate ways.**
2. **Difficult terrain AP surcharge — moderate.** Replace the movement cap with a per-5-ft AP surcharge (+1 / +2). Needs Foundry terrain-region tagging and a movement-cost hook; enemy-occupied squares must be treated as difficult terrain, which means querying token positions during movement cost calculation. Cheap if the system already computes movement AP per 5 ft (it does — `Move 5 ft = 1 AP`); expensive if terrain is not modeled at all yet.
3. **Two new leveled conditions (Hypothermia, Overheating) — moderate.** The d20 penalty reuses the existing leveled-condition machinery (Fatigue/Hunger/etc.), so that half is cheap. The **`floor(levels/2)` AP reduction** is a new effect kind, and the death-at-10 and per-level removal rules need the same treatment the existing 10-level conditions get. Rename the Power Armor rule internally to avoid the key collision.
4. **Luck-roll exemption for all leveled penalties — cheap.** One predicate in the roll pipeline: skip level penalties when the roll's ability is Luck. Touches Rads, Hunger, Dehydration, Exhaustion, Fatigue, Hypothermia, Overheating.
5. **Disease subsystem — expensive.** New item/effect subtype with 20 compendium entries; per-actor active-disease list with remaining duration (derived from END score at contract time), suppression window (Fever/Med-X), and multi-dose cure progress with a one-day spacing rule. Needs UI on the sheet (a diseases panel), a rest hook (three diseases clear on sleep, one conditionally on zero Dehydration), and **locked condition levels** so Dysentery's 4 Dehydration and Parasites' 4 Hunger cannot be drunk/eaten away. Also needs a "random disease" roll table we define ourselves (d20 over the alphabetical list) since the book omits one.
6. **Radiation Severity Score zones — moderate.** Add a severity level (1–7) to irradiated regions and drive the re-check cadence from the frequency column (1 h → 6 s). Cheap as data, moderate as automation (a per-actor timer keyed to in-world time, plus Foundry region enter/exit hooks). Radstorms must be able to stamp a whole scene as a Level 4–6 zone.
7. **Ambient weather state — expensive.** A scene-level weather record (type + severity + optional radiation severity) that emits: passive-sense deltas (−2 … −15), ranged-range multipliers (×½, ×¼), vision cutoffs ("blind beyond N ft", "normal to N ft"), a movement AP surcharge (Dust Storm: 2 AP per 5 ft, sprint halved), interval condition ticks, and the 10-minute lightning check for Thunderstorm/Radstorm (`4d10 − floor(Luck_mod/2) ≥ 40`). Vision cutoffs in particular have to map onto Foundry's detection modes, which is the costly part.
8. **Environmental actor flags (Insulated, Exposed/Wet, Sheltered, Near Warmth, Near Cooling, Gas Mask equipped) — cheap individually, but they are new sheet state.** Six booleans, mostly derivable from equipment, that the weather and hazard tick logic reads. Note the inverted sense of "Insulated" between Extreme Cold (helps) and Extreme Heat (hurts).
9. **Hazardous environment regions — moderate.** Five region types (water, toxic water, frigid water, ice, toxic air) with per-interval checks, plus the Ice per-move DC 18 AGI/LUK check hooked to a >20 ft movement trigger, and a frigid-water immersion timer.
10. **The Environment chapter baseline (falling, suffocating, flames, obscurement, resting) — mostly cheap data.** These are unchanged from v2.0 but absent from our reference. The falling table, the flame spread/damage escalation, and the two rest profiles are all straightforward table lookups. Suffocating's "cannot regain HP or be stabilized" is one flag on the dying state. The only real work is the Rest workflow, which now must also clear diseases and tick Exhaustion.
11. **Travel/exploration pace — cheap, low value.** The Travel Pace table, traveling limits (`8 + floor(END_mod/2)` hours), the Roads Walked fatigue, and mount/vehicle modifiers are pure bookkeeping and unchanged from v2.0. Implement as a simple travel calculator, or skip; nothing else depends on it.
12. **Off-balance — blocked.** Applied by Climbing and Swimming, defined nowhere. Leave it as an inert flag with a tooltip until the author publishes a definition.
