# V2.1 Rules Extraction — Stamina Point Restoration & Difficult Terrain

Source of truth: `FALLOUT TTRPG 2.1.pdf` (136 pp). PDF page N == printed page N (verified 1:1).
Patch notes consulted only as corroboration; **the printed book governs**.
Table pages read visually at 140 dpi: pg 6, 85, 89, 116, 126. Prose pages read from `pdftotext -layout`.

---

# SECTION 1 — Every Way Stamina Points Are Restored (for the Shock condition)

## 1.0 Baseline: what SP is, and the two pools

**Definition (pg 24, Agility chapter):**
> "Stamina Points. Stamina points represent a combination of fatigue, stress, and reflexes… At 1st level you have a total of 10 stamina points + your Agility modifier. Whenever you take damage from a source, and you are aware of the source, you may subtract the damage from your stamina points instead of your hit points. When your stamina points reach 0, any damage you take is subtracted from your hit points. **You can regain up to half your maximum number of stamina points after resting for 10 minutes, and you regain all your stamina points after you rest for 8 hours. Stamina points can also be regained by eating food or drinking certain drinks.**"

**Second definition (pg 130, Combat chapter):** repeats the damage-absorption rule, says nothing about restoration.

**Temporary SP is a SEPARATE pool (pg 132), not SP:**
> "Some consumables and perks grant temporary stamina points or temporary hit points to a creature… **Healing can't restore temporary stamina or hit points, and they can't be added together.** If you have temporary stamina or hit points and receive more of them, you decide whether to keep the ones you have or to gain the new ones."
> "Unless a consumable, item, perk, or ability that grants you temporary stamina or hit points has a duration, they last until they're depleted or if you finish a rest that was at least 1 hour."

This distinction is load-bearing for Shock — see §1.2.

---

## 1.1 Shock — exact printed wording

**pg 135, Conditions:**
> **Shock**
> "A creature in shock cannot regain stamina points and has disadvantage on all d20 rolls."

That is the **entire** printed entry. Two clauses, nothing else. Specifically the book prints:

- **No duration.** No round count, no save, no "until healed to full", nothing.
- **No removal condition.** The only printed escape is immunity, not cure.
- **No mention of hit points.** Shock does **not** block hit point healing.
- **No mention of temporary hit points.** Shock does **not** block temporary HP.
- **No mention of temporary stamina points.** See §1.2.
- **No mention of maximum SP.** Shock does not stop max-SP increases (e.g. Drunk, pg 133).

**Sources of Shock (all pg 128–129, Targeted Attacks):**
- Severed Arm/Hand (severe injury, Arm): "they go into shock, gain two levels of bleeding" (hand) / "four levels of bleeding" (arm).
- Severed Leg/Foot (severe injury, Leg): same structure.
- Intense Agony (severe injury, Groin): "The target goes into shock and is dazed for 2 turns." — note the *dazed* half has a duration and the *shock* half does not.

**Immunity / exemption:**
- **Pure Determination** perk (pg 41, Endurance 8): "…Additionally, you are immune to the shock condition."
- **Gen-2 Synth / Robot, Severed Limbs** (pg 9): "If any of your limbs are severed, **you do not go into shock** and they can be reattached with 3 steel and 1 circuitry junk item."

## 1.2 Does Shock's wording stop ALL SP restoration, or only some?

**Strictly as printed: only some.** The book uses **three different verbs** for putting SP back, and Shock only names one of them:

| Verb used | Where |
|---|---|
| "**regain**" | pg 24 (rest), pg 42 (Party Animal, Ferocious Loyalty), pg 48 (Nerves of Steel), pg 89 (Invigorating chems), pg 26/28 (traits referring to rest) |
| "**heal**" | pg 41 (Quick Recovery), pg 51 (Cannibal / Hunter's Wisdom / Ghastly Scavenger), pg 52 (Springboard Recovery), pg 54 (Pump the Coolant), pg 83 (Bland/Tasty/Flavorsome/Delicacy food properties) |
| "**restore**" | pg 119 (the actual Resting rules: "1 hour of rest **restores** your stamina points to half your maximum") |
| "**gain**" | pg 41 (The Long Road: "you **gain** all of your stamina points after resting for an hour") |

A pedantic reading of "cannot regain stamina points" would leave every **food**, every SP-**healing** perk, and the **pg 119 rest rules** untouched, which is obviously not the intent — pg 24 itself uses "regain" and "regained" for both resting and eating in the same paragraph, proving the book treats the verbs as synonyms. **Ruling for automation: Shock blocks all SP restoration regardless of verb.** But it is a wording gap, not an explicit rule.

**Temporary SP is NOT blocked by Shock as printed.** Temp SP is *granted*, never "regained" (pg 132 explicitly says healing cannot restore it), and Shock says nothing about it. So RAW, a character in Shock still gains:
- Party Nerve temp SP on rolling combat sequence (pg 22),
- A Moment of Respite temp SP (pg 27), Solar Powered (pg 41), Roughin' It (pg 41), Master Chef food (pg 40).

This is defensible flavor-wise (temp SP is "an edge in combat… pushing beyond their limit", pg 132) and is likely intended, but the book never says so. **Recommend routing temp SP grants around the Shock choke point, and flagging it in a tooltip.**

**Shock does NOT block hit point healing or temporary hit points.** Nothing in the entry touches HP. So stimpaks, Regenerating food, Anabolic chems (temp HP), Indomitable Spirit (temp HP), Pure Determination, Quick Recovery's *hit point* half, etc. all still work while in Shock.

---

## 1.3 THE COMPLETE LIST — every printed way SP goes up

### A. Resting

| # | Source | Page | Amount | Precondition |
|---|---|---|---|---|
| A1 | Rest (Agility chapter version) | 24 | up to **half max SP** | 10 minutes of rest |
| A2 | Rest (Agility chapter version) | 24 | **all SP** | 8 hours of rest |
| A3 | Rest — Ghoul / Human / Super Mutant | 119 | **to half your maximum** | 1 hour of rest |
| A4 | Sleep — Ghoul / Human / Super Mutant | 119 | **to full** | "Sleeping comfortably" |
| A5 | Rest — Gen-2 Synth / Robot | 119 | **to full** | 1 hour of rest (they "do not require sleep") |
| A6 | Uncomfortable-sleep modifier | 119 | **halve** whatever A3–A5 would give | see below |

**pg 119 printed wording:**
> **Ghoul, Human, and Super Mutant Rest** — "1 hour of rest restores your stamina points to half your maximum. Sleeping comfortably restores your stamina points to full."
> **Gen-2 Synth and Robot Rest** — "You do not require sleep. / 1 hour of rest restores your stamina points to full."
> **Sleeping Comfortably.** "You can sleep anywhere you want, however, some characters won't feel as refreshed when sleeping in rain, cold, extreme heat, or other rough circumstances. **If you do not sleep comfortably, you regain half as much SP and HP as you normally would.** A soft surface (such as a blanket or bedroll) along with shelter (such as a cave, building, or tent) allow any character to sleep comfortably."

Rest is defined loosely (pg 119): *"Resting does not have to be sleep, but could be light activity, downtime, or any light activity."*

**A1/A2 vs A3/A4 is a direct contradiction — see §1.5-C1.**

### B. Food properties (pg 83; item tables pg 84–85, verified visually)

| Property | SP restored (pg 83 verbatim) |
|---|---|
| **Bland** | "you heal a number of stamina points equal to **half your level**" |
| **Tasty** | "you heal a number of stamina points equal to **your level**" |
| **Flavorsome** | "you heal a number of stamina points equal to **double your level**" |
| **Delicacy** | "you heal a number of stamina points equal to **triple your level**" |

No other food property restores SP. (Regenerating heals **hit** points = healing rate — pg 83.)

**Racial modifiers to B:**
- **Ghoul, Resilient Anatomy (pg 8):** "Any stamina points you would gain from consuming **food, drinks, or chems** is **halved (rounded down)**."
- **Gen-2 Synth, Inorganic Body (pg 8)** and **Robot, Inorganic Body (pg 9):** "You gain **no effects** from Chems, Drinks or Food." → B, C, and D1 are all null for them; only D2 (overclock programs) applies.

### C. Drinks (pg 85, verified visually)

Drinks in the printed table carry **Tasty** (Coffee, Nuka-Cola, Nuka-Cola Quantum, Rum, Scotch, Wasteland Wine, Wine) and **Flavorsome** (Nuka-Cola Cherry, Sunset Sarsaparilla). The property text on pg 83 says "if you consume a **food** with this property" — see §1.5-C5. pg 24 explicitly backs drinks: *"Stamina points can also be regained by eating food or **drinking certain drinks**."*

- **C1 — Party Animal perk (pg 42, Charisma 4):** "You cannot become addicted to Alcohol and **whenever you drink an alcoholic drink, you regain a number of stamina points equal to your level**." (No cap, no per-rest limiter printed. Applies to any drink with the Alcoholic or High-Proof property.)

### D. Chems & Robot Overclock Programs

**D1 — Invigorating chem property (pg 89):**
> "**Invigorating.** If you use a chem with this property, you **regain stamina points equal to half your level**."

Chems carrying Invigorating (pg 89 table, verified visually): **Jet fuel**, **Ultrajet**, **Overdrive**. Usage cost 4 AP (pg 88/126); 1 AP with Power Armor's Automatic Injector (pg 57).

**D2 — Robot Overclock Programs (pg 90 table):** programs "function near identical to chems". Carrying Invigorating: **Military Turret Operating System**, **Overclock Hardware v2.0**. Usage 4 AP.

### E. Perks that restore actual SP

| Perk | Page | Req | Amount | Precondition / limiter |
|---|---|---|---|---|
| **The Long Road** | 41 | END 6 | "you gain **all of your stamina points** after resting for an hour instead of eight" | 1 hour rest |
| **Quick Recovery** | 41 | END 8 | "heal a number of stamina points **or** hit points equal to your **healing rate**" | 3 AP on your turn; "cannot use it again until you rest for at least **6 hours**" |
| **Nerves of Steel** | 48 | AGI 10 | "regain stamina points equal to **half your level (rounded down)**" | **At the start of each of your turns**, "so long as your hit point total isn't below half" |
| **Ferocious Loyalty** | 42 | CHA 6 | "your **party members** can regain **all their stamina points**" | triggers when *you* first take damage to your hit points; party members must "sense you"; once per 8-hour rest; only one PC may ever take this perk |
| **Cannibal** | 51 | Human/Ghoul/S.Mutant | "heal a number of stamina points equal to **your level**" | consume **prepared** human or ghoul flesh |
| **Hunter's Wisdom** | 51 | Human/Ghoul/S.Mutant | "heal a number of stamina points equal to **your level**" | consume **prepared** animal or insect meat |
| **Ghastly Scavenger** | 51 | Human/Ghoul/S.Mutant | "heal a number of stamina points equal to **your level**" | consume **prepared** abomination flesh |
| **Springboard Recovery** | 52 | Human | "heal a number of stamina points equal to your **healing rate**" | 3 AP on your turn; once per 8-hour rest |
| **Pump the Coolant** | 54 | Synth, Lv 5 | "heal a number of stamina points equal to **double your healing rate**" | 6 AP on your turn; once per 8-hour rest |

**Healing Rate** (pg 21): "equal to half of the total of: your level + your Endurance ability score." (Book does not print a rounding rule — see §1.5-C10.)

### F. Perks / traits that grant TEMPORARY SP (separate pool — see §1.2)

| Source | Page | Amount | Precondition |
|---|---|---|---|
| **Party Nerve** (Charisma, universal rule) | 22 | temp SP = **Party Nerve bonus** (sum of all PCs' CHA mods, halved, rounded down) | "whenever you roll combat sequence" |
| **A Moment of Respite** (trait) | 27 | temp SP = **your Charisma score** to you and each other PC resting | you rest and perform (music/story/speech); group stealth −2 |
| **Solar Powered** (perk, END 7) | 41 | temp SP = **your level** | rest ≥1 hour in direct sunlight; can be *spent* to boost damage 1:1 |
| **Roughin' It** (perk, END 7) | 41 | temp HP **and** temp SP = **your level**, lasting 8 hours | rest **outside** ≥1 hour; repeatable once to extend to allies |
| **Master Chef** (perk, END 4) | 40 | temp SP = **their level** to any creature who consumes the food | you cook it (5 min on pre-made food, or any cooked food you make) |
| **Claustrophobia** (trait) | 30 | **doubles** Party Nerve temp SP while outside | nullifies Party Nerve indoors/underground |
| **Big Ego** (perk, CHA 5) | 42 | "Your Party Nerve modifier is **doubled** for you" | — |

### G. Combat turn economy — nothing restores SP

Checked pg 24 (AP rules), pg 126–127 (Actions in Combat table + action descriptions, verified visually), pg 131 (Death Saves). **The turn economy restores AP only, never SP.** At the start of your turn you regain all spent AP and recycle half of unspent AP (pg 24, 126). The only start-of-turn SP restoration in the entire book is the **Nerves of Steel** perk (E, pg 48).

### H. Level up / maximum SP — NOT restoration

The book never says leveling fills you to your new maximum. pg 5: *"You increase your maximum stamina points by 5 + your Agility modifier when you reach 3rd, 5th, 7th, 9th, 11th, 13th, 15th, 17th, 19th, 21st, 23rd, 25th, 27th, and 29th level."* Retroactive AGI-mod recalculation as printed. Full progression on the Level Up Table (pg 6, verified visually).

Other **maximum**-SP movers (all excluded from the choke point):
- **Long Days, Long Nights** trait (pg 28): +1 extra point when SP increases from leveling (WW: +2).
- **Hardened by the Earth** trait, Wild Wasteland (pg 28): +1 extra HP and SP on level up.
- **Small Frame** trait (pg 33): max SP **+ level** (max HP − level).
- **Brawny** trait (pg 32): max SP **− level**.
- **Onerous Regeneration** trait (pg 26, Super Mutant): max SP **− level**.
- **Evolution** perk (pg 54, Super Mutant Lv 10): "your stamina points increase by a number equal to your level".
- **Fitted** armor mod, rank 2 (pg 57): "Your maximum stamina points increase by a number equal to your level."
- **Legend of the Wastelander** perk (pg 43, CHA 8): reduces **enemy** max SP by your Party Nerve on combat sequence.
- **Drunk** condition (pg 133) and **Hammered** (pg 134): max SP **+ level**.
- **Heavily Encumbered** (pg 134): "Every hour a heavily encumbered creature travels reduces their maximum stamina points by 2 (resets upon sleeping)."

### I. Things that SET SP to 0 (relevant to the same choke point)

- **Dropping to 0 hit points (pg 131):** "When you drop to 0 hit points, **you lose all of your stamina points** (if you had any)…"
- **Unconscious (pg 135):** "…it drops anything it was holding and **all of its stamina points drop to 0**."

### J. Karma, Party Nerve, environment, level-up, diseases, weather — nothing else

Exhaustive grep of "stamina" across all 136 pages. **No karma rule restores SP** (Karma Caps do rerolls, damage boosts, and one HP heal via Pure Determination, pg 41). **No Party Nerve rule restores actual SP** — only temporary (pg 22). **No environmental, weather (pg 121–122), radiation (pg 124), disease, hunger/thirst, or hazardous-environment rule restores SP.** No consumable outside food/drink/chems does.

---

## 1.4 The radiation "unhealable" lock (`spHealableMax`)

**Printed wording, pg 124 (Radiation chapter), repeated VERBATIM at pg 135 (Conditions → Radiation or Rads):**
> "Whenever you roll a d20 (besides Luck), the total is subtracted by 1 for each level of rads you have. Additionally, **each time you gain a level of rads you take 1d4 radiation damage to your hit points and stamina points that cannot be healed until you no longer have any levels of rads.** If this radiation damage reduces you to 0 hit points, or you would gain your 10th level of radiation; you die."

Corroborated by the patch notes ("Gaining a level deals 1d4 damage to your hp and sp that cannot be healed until you have no levels of rads, instead of 1d12 to your hp that you cannot heal until you're no longer in an irradiated zone") — **book and patch notes agree here.**

**How it works:** it is not a max-SP reduction. It is unhealable *damage*, which functions as a lowered **healable ceiling**: `spHealableMax = maxSP − (accumulated unhealed rad damage to SP)`. It **clears entirely** when your rad level reaches 0 — not on rest, not on healing.

**Interaction with Shock:** **the book never connects them.** They are orthogonal and both apply:
- Shock blocks the *act* of regaining SP (all of §1.3 A–E).
- The rad lock caps *how high* regaining can go, independent of Shock.
- Curing Shock does not clear the rad lock; clearing rads does not cure Shock.
- Neither entry references the other.

**Ambiguity in the lock itself: "1d4 radiation damage to your hit points and stamina points."** Two readings, book does not disambiguate:
  - (a) **one** 1d4 roll, applied to SP first then HP per the normal damage order (pg 132);
  - (b) 1d4 to **each** pool independently.
  Reading (b) makes the "or you would gain your 10th level" death clause redundant with the "reduces you to 0 hit points" clause much sooner. **Reading (a) is the safer conversion**, but the book does not say. Note the order-of-damage rules on pg 132 would normally send all of it to SP first, which would make the "If this radiation damage reduces you to 0 hit points" clause nearly unreachable at high SP — another sign the printed wording is loose.

---

## 1.5 CONTRADICTIONS & AMBIGUITIES (Section 1)

**C1 — Rest timings flatly contradict each other. (pg 24 vs pg 119)**
- pg 24: "**up to half** your maximum number of stamina points after resting for **10 minutes**, and… **all** your stamina points after you rest for **8 hours**."
- pg 119: "**1 hour** of rest restores your stamina points **to half your maximum**. **Sleeping comfortably** restores your stamina points **to full**." (Synth/Robot: 1 hour → full.)

Both durations *and* the full-restore trigger differ (8 hours of any rest vs. comfortable **sleep**). **Both are printed; the book governs both.** Recommended resolution: **pg 119 is the operative rule** — it is the dedicated Resting section, it is race-differentiated, and two traits are written against it (see C2). pg 24 reads as a stale one-paragraph summary in the ability-score chapter, carrying the pre-rework numbers. But this is a ruling, not a printed reconciliation.

**C2 — Two traits corroborate pg 119, not pg 24.**
- **Long Days, Long Nights**, Wild Wasteland (pg 28): "whenever you regain stamina points from **any rest that isn't sleep**, you regain **a fourth of your maximum** stamina points **instead of half**." → presupposes non-sleep rest = half max, i.e. pg 119's rule, not pg 24's 10-minute rule.
- **Onerous Regeneration**, Wild Wasteland (pg 26): "whenever you regain stamina points **from sleep**, you regain half as much." → presupposes sleep is the full-restore trigger, i.e. pg 119.
- Neither trait says what happens to a **Gen-2 Synth or Robot** (who don't sleep and get *full* SP from 1 hour). Onerous Regeneration is Super-Mutant-gated so it's moot; Long Days Long Nights is not race-gated and is **undefined** for synths/robots — "a fourth instead of half" doesn't parse when the printed value is "full".

**C3 — The Long Road perk (pg 41) is written against the pg 24 numbers.** "you gain all of your stamina points after resting for an hour **instead of eight**." The "instead of eight" clause only makes sense against pg 24's 8-hour rule. Under pg 119 the perk still functions (1 hour goes from half → full) but its stated baseline doesn't exist. Also note it duplicates the **Gen-2 Synth/Robot** racial rest exactly — the perk is a dead pick for those races and the book doesn't say so.

**C4 — "regain" vs "heal" vs "restore" vs "gain".** Shock blocks only "regain". See §1.2. The book plainly means all of them; the wording does not.

**C5 — Food properties say "food", but drinks carry them.** pg 83: "Bland/Tasty/Flavorsome/Delicacy. If you consume a **food** with this property…" Yet the Drinks table (pg 85) assigns Tasty to 7 drinks and Flavorsome to 2. Countervailing evidence that drinks are meant to work: pg 24 ("drinking certain drinks"), and the **Ghoul** racial (pg 8) which halves SP gained from "food, **drinks**, or chems". **Ruling: drinks with these properties restore SP.** The property text is simply sloppy.

**C6 — pg 132 contradicts itself on temporary SP healing.**
- "Healing **can't** restore temporary stamina or hit points."
- Four sentences later: "**If a creature ever heals their stamina points, or temporary stamina points**; the next time they take damage it is subtracted from their stamina points again."
The second sentence presumes temp SP *can* be healed. First sentence should govern; the second is describing the "damage pointer resets" rule and used loose wording.

**C7 — Shock has no printed duration, no printed cure.** As written it is **permanent** once inflicted, on every creature that lacks Pure Determination (pg 41) or synth/robot Severed Limbs (pg 9). Since the only Shock sources are severe injuries, this is arguably intentional (shock persists with the mutilation) — but the book never says how, or whether, it ends. **This is the single largest gap for automating Shock.** Note the sibling clause in Intense Agony (pg 129) *does* time-limit the *dazed* half ("for 2 turns") while leaving shock open-ended, which suggests the open-endedness is deliberate.

**C8 — Shock is silent on temporary SP, temporary HP, HP healing, and max SP.** See §1.2. All four are unblocked as printed.

**C9 — pg 131's cross-reference is wrong.** "Rest can restore a creature's hit points (as explained on **page 76 and 77**)." Pages 76–77 are the **weapon mod tables**. Resting is on **pg 119**. Purely a typo, but note it if any tooling scrapes page refs.

**C10 — Healing Rate rounding is never printed.** pg 21: "half of the total of: your level + your Endurance ability score." No rounding rule. Several SP-restoration perks (Quick Recovery, Springboard Recovery, Pump the Coolant) key off it. The book prints "(rounded down)" for many other halves, so round-down is the consistent house reading, but it is not printed here.

**C11 — No per-rest limiter on food/drink SP healing.** Nothing caps how many Delicacies you can eat in a round. Stimpak-analogue perks (Cannibal, Hunter's Wisdom, Ghastly Scavenger, pg 51) explicitly limit only their *hit point* halves ("cannot heal in this way again until you rest for at least 8 hours") — their **SP** halves ("If you consume prepared… flesh, you heal a number of stamina points equal to your level") carry **no limiter at all**. Almost certainly an oversight; as printed, unlimited.

**C12 — Ferocious Loyalty's trigger is ambiguous.** pg 42: "When **you** first take damage to your hit points, **your party members** can regain all their stamina points… Once this ability triggers it doesn't trigger again until you rest for at least 8 hours." Unclear whether the perk-holder is included in "party members" (probably not — "your party members" is contrastive with "you"), and "can regain" reads as optional per member.

**C13 — Party Nerve's temp SP has no interaction rule with the pg 132 "keep old or take new" clause when multiple temp-SP sources land at once** (e.g. rolling combat sequence with Party Nerve while Roughin' It temp SP is still running). pg 132's rule technically covers it ("you decide whether to keep the ones you have or to gain the new ones") but the book never flags the common overlap.

**C14 — "You may subtract the damage from your stamina points" (pg 24) vs "the damage IS subtracted from their stamina points" (pg 130).** pg 24 makes SP absorption **optional**; pg 130 makes it **mandatory** (conditioned on awareness). Not a restoration rule, but it changes how often a Shocked creature's SP matters. pg 130 is the combat chapter and should govern.

---

## 1.6 EXPLICIT REJECTION LIST (Section 1)

Considered and **excluded** from the SP-restoration choke point, with reasons:

**Heals hit points only, never SP:**
- Stimpak / Stimpak (Diluted) / Super Stimpak / Auto-Inject Stimpak / Auto-Inject Super Stimpak (pg 87).
- Healing Powder, First Aid Kit (Stitch Wounds/Pain Killer), Doctor's Bag, RobCo Quick Fix-it 1.0 / 2.0 / Extreme Damages (pg 86–87).
- **Regenerating** food/drink property (pg 83) — heals HP = healing rate.
- Medicinal Master perk (pg 39), Pure Determination (pg 41), Implant Y-7 (pg 41), Phoenix Implant (pg 41), Reinforced Recovery (pg 54), the HP halves of Cannibal / Hunter's Wisdom / Ghastly Scavenger (pg 51).
- Death save success / natural 20 (pg 131) — grants 1 **hit** point.

**Grants temporary HIT points, not SP:**
- **Anabolic** chem property (pg 89), Indomitable Spirit perk (pg 41), Roughin' It's HP half (pg 41).

**Raises maximum SP but restores nothing** — full list in §1.3-H (level up pg 5–6; Small Frame, Brawny, Onerous Regeneration, Long Days Long Nights, Hardened by the Earth WW; Evolution perk; Fitted armor mod; Drunk/Hammered conditions; Heavily Encumbered's max reduction; Legend of the Wastelander's enemy max reduction).

**Reduces or negates SP damage — not restoration:**
- Evasive Action perk (pg 47, AGI 5): first SP damage after combat sequence reduced to 0.
- Hit the Deck perk (pg 39, PER 8): explosive SP damage halved.
- Keeping your Cool perk repeat (pg 43, CHA 7): SP damage reduced by 1.
- Restrained condition (pg 135): "When a restrained creature takes damage it cannot be subtracted from their stamina points."
- Sneak Attacks (pg 128): "Your attacks are critical hits and **ignore Stamina Points**."

**Separate resource pool, deliberately excluded:**
- **Defense Points** in Power Armor (pg 57). Near-miss: DP "operate similarly to stamina points" and self-refill — "When your defense points hit 0, the Power Armor gains a level of decay and **you regain defense points equal to its total**." This is a DP refresh, **not** SP, and Shock's wording does not touch it. Worth an explicit test case.

**Triggers at 0 SP but doesn't restore:**
- Godspeed trait (pg 31), Hot Blooded trait (pg 32).

**Reads SP but doesn't change it:**
- Wasteland Knowledge trait (pg 29), Survivorship Bias perk (pg 40), Fisticuffs perk (pg 35).

**Not SP at all:**
- AP recycling (pg 24, 126), all AP-granting chem properties (Stimulant / Super Stimulant / Hyperstimulant / Neuro-Stimulant, pg 89), Energizing / Empowering / Charged / Caffeinated food & drink properties (pg 83), Commander perk AP grant (pg 43).
- Fatigue self-removal at end of turn (pg 133); exhaustion removal by rest (pg 133); Hypothermia/Overheating removal (pg 122, 134). Level-based conditions, not SP.
- All of Hazardous Weather (pg 121–122), Radiation (pg 124), and the diseases/hazardous-environments chapters — grep confirms **zero** SP restoration anywhere in them.

---
---

# SECTION 2 — Difficult Terrain (pg 116)

## 2.1 The complete printed rule, verbatim (pg 116, verified against the rendered page)

> ### Difficult Terrain
> The travel speeds given in the Travel Pace table assume relatively simple terrain: roads, open plains, or deserts. But wastelanders often face dense forests, deep swamps, rubble-filled ruins — all considered difficult terrain.
>
> When traveling, the distance traveled is halved when moving through difficult terrain. **In combat, a creature must spend an additional action point to move through 5 feet of difficult terrain. Moving through an enemy space is also considered difficult terrain.**
>
> **Extreme Difficult Terrain.** Terrain such as sharp piles of rubble, unstable floating objects, flimsy boards spanning a drop, or waist high sludge are all examples of extreme difficult terrain. When traveling, the distance traveled is quartered when moving through extreme difficult terrain. **In combat, a creature must spend two additional action points to move through 5 feet of extreme difficult terrain.**

**Second printing, pg 127 (Actions in Combat → Move 5 feet):**
> "**Move 5 feet.** You move 5 feet in any direction so long as your movement isn't impeded or the area isn't difficult terrain. **An enemy space is considered difficult terrain.**"

**Base movement cost, pg 126 table (verified visually): "Move 5 feet. — 1 AP".**

## 2.2 Verdict on the system's current model

**The system is CORRECT.** v2.1 models difficult terrain as **+1 AP per 5 ft** (total 2 AP/5 ft), and extreme as **+2 AP per 5 ft** (total 3 AP/5 ft). The "20 ft movement cap" is the **v2.0** rule and is gone.

Confirmed by the patch notes, which agree with the book here:
> "Difficult Terrain reworked. Instead of only being able to move 20 feet through difficult terrain on your turn, now you must spend an additional action point to move through 5 feet of difficult terrain. Moving through an enemy space is also considered difficult terrain. Same change to Extreme Difficult Terrain."

Note the wording is "**an additional action point**" — a **surcharge on top of the base cost**, not a replacement rate. This matters for stacking (§2.7).

## 2.3 Every printed example of what counts

**Difficult terrain (pg 116):**
- dense forests
- deep swamps
- rubble-filled ruins
- **an enemy-occupied space** (pg 116 *and* pg 127)

**Extreme difficult terrain (pg 116):**
- sharp piles of rubble
- unstable floating objects
- flimsy boards spanning a drop
- waist-high sludge

That is the **complete** printed list. The lead-in "The travel speeds… assume relatively simple terrain: **roads, open plains, or deserts**" is the printed negative example set.

**Not an example, despite the word appearing:** pg 117 describes Rushing Waters as "either having lots of movement, **difficult terrain**, or small objects to avoid" — that is flavor inside the swim-cost definition, not a ruling that water is difficult terrain. See §2.5.

## 2.4 Enemy-occupied spaces — CONFIRMED YES

Printed **twice**, identically, and confirmed a third time in the patch notes ("Enemy spaces are now considered difficult terrain"). The system's assumption is right.

**But note the exact word: "enemy space."** The book says nothing about:
- **allied or neutral creatures' spaces** — not covered. RAW, moving through an ally costs nothing extra. (Contrast pg 130's Cover rules, which explicitly say a creature giving cover can be "an enemy or a friend" — the book distinguishes friend/enemy when it wants to.)
- **whether you may enter an enemy space at all** — the book gives a *cost* but never a *permission*, and never mentions creature size, ending your movement in an occupied space, or squeezing.
- **dead / unconscious / prone creatures' spaces.**

## 2.5 Interactions

| Interaction | What the book says | Page |
|---|---|---|
| **Base movement** | 1 AP per 5 ft → **2 AP** in difficult, **3 AP** in extreme difficult | 126, 116 |
| **Sprint** | "You can spend 5 AP to immediately move 50 feet in a straight line. **If you stop or are obstructed by difficult terrain before you finish this movement, your movement ends.**" — difficult terrain does **not** add AP to a Sprint, it **terminates** it, with no refund ("you do not regain any action points", pg 127) | **117**, 127 |
| **Dust Storm** (weather) | "**Moving 5 feet costs 2 AP** and when you sprint you move half as much." Stated as an **absolute cost**, not a surcharge. Stacking with difficult terrain **UNDEFINED** — see §2.7 | 122 |
| **Prone** | "A prone creature's only movement option is to crawl, unless it stands up." **The book never defines a crawl rate or AP cost anywhere.** Prone + difficult terrain is therefore fully undefined | 135 |
| **Climbing** | Own per-5-ft AP costs: **Scalable 3 AP**, **Sheer 4 AP**, **Treacherous 4 AP (climbing equipment required)**; −1 AP with climbing gear except on treacherous. Book **never** says a climbing surface is difficult terrain or that the surcharge stacks. Climbing also makes you *off-balance* | 116–117 |
| **Swimming** | Own per-5-ft AP costs: **Still 2 AP**, **Rushing 2 AP**, **Treacherous 3 AP**; **+1 AP** more while underwater/diving. Book **never** stacks difficult terrain on top. Rushing waters' *description* invokes "difficult terrain" as the reason its cost is what it is, implying the surcharge is already priced in | 117 |
| **Jumping** | Long jump: 5 × STR mod feet, "**every 5 feet you clear on the jump costs 1 AP**". High jump: 3 + STR mod feet, "**every foot you clear on the jump costs 1 AP**". Both require "the last two action points you used were to move". Book is **silent** on jumping over difficult terrain — the natural read is that clearing it bypasses the surcharge, but it is not printed | 117 |
| **Slowed** | "A slowed creature starts their turn with a maximum of 6 AP." Purely an AP-budget cap — **no interaction** with terrain beyond shrinking the budget | 135 |
| **Dazed** | "A dazed creature's maximum AP is reduced by 3 and they cannot recycle AP." Same — budget only, no terrain interaction | 133 |
| **Encumbered** | "moves slowly (**2 AP per 5 feet**)" — absolute rate. Stacking with difficult terrain **UNDEFINED** | 133 |
| **Heavily Encumbered** | "moves slowly (**3 AP per 5 feet**)" — absolute rate. Stacking **UNDEFINED** | 134 |
| **Grappled** | "A grappled creature cannot spend AP to move." Moot | 134 |
| **Frightened – Flight** | "must use their action points on their turn to move as far away from the source of their fear as possible" — the surcharge just reduces how far | 134 |
| **Dodge action** | Grants "you can move up to 15 feet in reaction to any other creature's action one time" — the book does **not** say this movement costs AP, so there is **no hook** for a per-5-ft surcharge. Undefined whether difficult terrain reduces it | 126 |
| **Commander perk** | Grants an ally "6 AP to complete the described action immediately" — ordinary AP, so the surcharge applies normally | 43 |
| **Leg limb conditions** | Independent **distance caps**, not AP costs: "Can only move a maximum of 30 / 20 / 15 feet for two turns", **Leg Cripple** "maximum of 20 feet… until all their hit points are healed", **Severed Leg/Foot** "maximum of 20 feet". These **stack** with the AP surcharge (different axes) — you can be both AP-taxed and distance-capped. *These caps are the surviving remnant of the v2.0 model.* | 129 |
| **Adaptive Reflexes perk** | "If you lost your foot or leg, you are no longer limited to moving only 20 feet on a turn." Removes the distance cap, **not** the terrain surcharge | 34 |
| **Travel scale** | Distance traveled **halved** (difficult) / **quartered** (extreme). Book never says how travel-scale halving and the combat surcharge combine — they are separate scales | 116 |

## 2.6 What ignores difficult terrain

**Exactly one printed source in the entire book:**

- **Robobrain (Robot sub-type) — "All Terrain Rollers" (pg 11):**
  > "**All Terrain Rollers.** You do not have to spend extra AP to move through difficult terrain."

**Nothing else.** Verified by:
- full-book grep for "terrain" (only hits: pg 2 TOC, pg 11 Robobrain, pg 40 Trailblazer's Instinct, pg 81 tents/sleeping bag, pg 116–117 the rules themselves, pg 127 Move 5 feet).
- `perks.json` (186 entries) — only **Trailblazer's Instinct** mentions terrain, and it only *raises a travel DC* ("The DC increases by 2 if the route you are taking moves through difficult terrain…"), it does not ignore it.
- `traits.json` (47 entries) — **zero** mentions of terrain.
- `gear.json`, `armor.json`, `weapons.json`, `aid-*.json`, `ammo.json` — only Sleeping Bag / Tents ("shelter from outside sources, weather, and terrain"), which is a **resting-comfort** rule (pg 81, pg 119), not movement.

**Data note on your existing pack:** `npcs.json` renders the ability as "The Robobrain is **immune to difficult terrain**." The book says only "**you do not have to spend extra AP** to move through difficult terrain." Those differ: the printed wording removes the AP surcharge but leaves the square *difficult terrain* for every other purpose (notably **Sprint termination**, pg 117 — a Robobrain sprinting through difficult terrain still has its movement end). Recommend tightening the pack text to the printed wording.

## 2.7 Stacking

**With itself:** **The book never says.** Nothing addresses an enemy standing in rubble-filled ruins, or difficult terrain overlapping extreme difficult terrain.

Closest printed precedent is the **Cover** rule (pg 130): *"If a target is behind multiple sources of cover, **only the most protective degree of cover applies; the degrees aren't added together.**"* By analogy, difficult terrain should **not** stack with itself — take the worst single category (extreme beats difficult). But this is analogical reasoning, not a printed rule. The structural existence of a separate "Extreme" tier (+2) also argues that the designer's intent was tiers, not addition.

**With other surcharges:** genuinely broken, because the book mixes two incompatible formats:

| Rule | Format printed | Page |
|---|---|---|
| Difficult terrain | "**an additional** action point" — **surcharge** | 116 |
| Extreme difficult terrain | "**two additional** action points" — **surcharge** | 116 |
| Dust Storm | "Moving 5 feet **costs 2 AP**" — **absolute rate** | 122 |
| Encumbered | "moves slowly (**2 AP per 5 feet**)" — **absolute rate** | 133 |
| Heavily Encumbered | "moves slowly (**3 AP per 5 feet**)" — **absolute rate** | 134 |
| Climbing / Swimming | per-surface / per-water **absolute rates** | 116–117 |

Surcharges compose; absolute rates don't. Two readings, both defensible, book silent:
- **(a) Absolute wins / no stacking:** a dust storm sets movement to 2 AP/5 ft, and difficult terrain changes nothing (already 2). Encumbered in extreme difficult terrain = 3 AP.
- **(b) Surcharge model:** convert absolutes to implied surcharges (Dust Storm = +1, Encumbered = +1, Heavily Encumbered = +2) and add: heavily encumbered, in a dust storm, moving through extreme difficult terrain = 1+2+1+2 = **6 AP per 5 ft**.

**Recommendation:** reading (b) is the more consistent engine model and preserves the distinctness of every rule, but be aware it produces very large numbers fast (6 AP/5 ft against a 10 + AGI-mod budget capped at 15, pg 24). Whichever is chosen, it is a house ruling — **flag it as such.**

## 2.8 CONTRADICTIONS & AMBIGUITIES (Section 2)

**T1 — Sprint is printed twice, differently.**
- pg 117: "You can spend 5 AP to immediately move 50 feet in a straight line. If you stop or are **obstructed by difficult terrain** before you finish this movement, your movement ends."
- pg 127: "When you sprint, you move 50 feet in a line. If you stop or are **obstructed** before you move 50 feet, your movement ends **and you do not regain any action points**."

pg 117 names difficult terrain explicitly; pg 127 generalizes to "obstructed" and adds the no-refund clause. **Merge them:** difficult terrain is an obstruction, ending the sprint with no AP returned. Neither version says whether *entering* a difficult square ends it or whether you get to finish that 5 ft.

**T2 — Dust Storm's Sprint clause collides with difficult terrain's Sprint clause.** pg 122: "when you sprint you **move half as much**" (25 ft). pg 117: difficult terrain **ends** the sprint. Sprinting through difficult terrain during a dust storm triggers both, and the book does not say which resolves.

**T3 — Surcharge vs absolute-rate formats never reconciled.** See §2.7. This is the single most consequential terrain ambiguity for the engine.

**T4 — Difficult terrain never says whether it stacks with itself.** See §2.7. An enemy standing in a rubble-filled ruin has no printed answer.

**T5 — "Crawl" is never defined.** Prone (pg 135) says "A prone creature's only movement option is to crawl", and Severed Leg/Foot (pg 129) says "their only movement option is to crawl." **No page in the book defines a crawl rate or AP cost.** So prone movement in general — let alone prone-in-difficult-terrain — is unresolvable from the printed text.

**T6 — "Off-balance" is referenced but never defined.** pg 116 (Climbing) and pg 117 (Swimming) both say "you are considered off-balance **(see pg #)**" — an unfilled cross-reference placeholder. **"Off-balance" appears nowhere in the Conditions list (pg 133–135) or anywhere else in the book.** It is a missing rule. This matters because it's the only printed handle on climbing/swimming as movement states.

**T7 — Enemy spaces: cost without permission.** The book prices moving through an enemy space but never states you *may*, never mentions creature size, and never addresses ending movement in an occupied space. Contrast D&D-style squeezing rules — nothing analogous is printed.

**T8 — "Enemy space" excludes allies and neutrals by omission.** The book distinguishes friend from enemy elsewhere (pg 130 Cover explicitly covers both), so the omission here reads as deliberate, but it is still an omission.

**T9 — Climbing/swimming vs difficult terrain is unaddressed.** Both define their own per-5-ft rates and neither says whether a difficult-terrain surcharge applies on top. The Rushing Waters flavor text ("having lots of movement, **difficult terrain**, or small objects to avoid", pg 117) hints that the swim cost already absorbs it — but it's flavor, not a rule.

**T10 — Jumping over difficult terrain is unaddressed.** pg 117 prices jumps per 5 ft (long) / per foot (high) with no terrain clause.

**T11 — Dodge's 15-ft reaction move has no AP hook.** pg 126 grants the movement without pricing it, so the per-5-ft surcharge has nothing to attach to.

**T12 — All Terrain Rollers is silent on *extreme* difficult terrain.** pg 11 says "difficult terrain". Extreme difficult terrain is presented on pg 116 as a **separate named category**, not a subtype. Strictly, a Robobrain still pays +2 in extreme difficult terrain. Almost certainly not intended, but that's what's printed.

**T13 — Travel-scale halving/quartering has no stacking rule either.** A route that is partly difficult and partly extreme has no printed resolution, nor does the interaction with Travel Pace, Traveling Limits (8 + half END mod hours), or The Roads Walked fatigue.

**T14 — The v2.0 20-ft cap survives in one place.** The leg limb conditions and Leg Cripple / Severed Leg (pg 129) and Adaptive Reflexes (pg 34) still use "maximum of 20 feet on a turn" language. These are **not** difficult terrain and were not converted; they remain distance caps. Don't let a global search-and-replace for the old terrain model catch them.

## 2.9 EXPLICIT REJECTION LIST (Section 2)

Considered and **excluded**, with reasons:

- **The v2.0 "20 ft movement cap" model** — superseded. Both the printed 2.1 book (pg 116, 127) and the patch notes confirm the AP-surcharge model. The current system implementation is right.
- **Leg limb-condition movement caps (pg 129) and Adaptive Reflexes (pg 34)** — genuine 20-ft caps, but they are limb-condition effects, **not** difficult terrain. They stack with the surcharge on a different axis.
- **Climbing surfaces (Scalable / Sheer / Treacherous, pg 116–117)** — a parallel movement-cost system, not difficult terrain. Never labeled as such.
- **Water types (Still / Rushing / Treacherous, pg 117)** — same. The "difficult terrain" phrase inside the Rushing Waters *description* is explanatory flavor, not a rules label.
- **Cover rules (pg 130)** — creatures grant cover, which is an AC/resistance effect, not movement. Cited only as the analogous precedent for non-stacking (§2.7).
- **Sleeping Bag / Tent gear (pg 81, priced pg 82, craftable pg 112)** — "shelter from outside sources, weather, and **terrain**" is about sleeping comfortably (pg 119), not movement.
- **Trailblazer's Instinct perk (pg 40, END 5)** — the only perk in `perks.json` mentioning terrain, and it only *raises the Survival DC by 2* for a difficult-terrain route. Does not ignore or reduce anything.
- **Light armor mod, rank 3 (pg 57)** — "If you spend at least 4 AP on your turn to move, you can move an additional 10 feet." A flat movement bonus, unrelated to terrain; it does not ignore the surcharge (though it does effectively offset it). Near-miss, listed for completeness.
- **Slowed (pg 135), Dazed (pg 133), Grappled (pg 134)** — AP-budget effects with no terrain-specific clause. Included in the interaction table only to record that the book gives them no special terrain rule.
- **Weather effects other than Dust Storm (Fog, Thunderstorm, Radstorm, Blizzard, Rain, Extreme Cold/Heat, pg 121–122)** — none affect movement AP or distance. Only **Dust Storm** does.
- **`npcs.json` "immune to difficult terrain"** — not printed wording; the book (pg 11) removes only the extra AP cost. Rejected as a source, flagged as a pack-data fix.
