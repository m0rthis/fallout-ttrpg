# V2.1 Rules Extraction — Cover (pg 130) and Range Bands (pg 21, pg 66)

Source of truth: `FALLOUT TTRPG 2.1.pdf` (136 pp). PDF page N == printed page N (verified 1:1).
Method: `pdftotext -layout` for prose; **pg 21, 66 and 130 were also read visually** at 150 dpi
(`pdftoppm -r 150 -png`) and the quotes below transcribed from the image, because both rules sit in
two-column layouts where extraction interleaves columns. The AP table on pg 126 was read the same way.
Patch notes consulted only as corroboration; **the printed book governs**.

The headline finding is in §2: **the book prints two incompatible rules for shooting past long
range**, and this project's own `docs/rules-reference.md:93` records only one of them.

---

# SECTION 1 — Cover (pg 130)

## 1.0 The entire printed entry, verbatim

> **Cover**
> Walls, trees, creatures, and other obstacles can provide cover during combat, making a target more
> difficult to harm. A target can benefit from cover only when an attack or other effect originates on
> the opposite side of the cover.
>
> There are three degrees of cover. If a target is behind multiple sources of cover, **only the most
> protective degree of cover applies; the degrees aren't added together.** For example, if a target is
> behind a creature that gives half cover and a tree trunk that gives three-quarters cover, the target
> has three-quarters cover.
>
> A target with **half cover** has a +2 bonus to AC and has resistance to any damage dealt from an
> explosive or trap that is beyond the cover. A target has half cover if an obstacle blocks at least
> half of its body. The obstacle might be a low wall, a large piece of furniture, a narrow tree trunk,
> or a creature, whether that creature is an enemy or a friend.
>
> A target with **three-quarters** cover has a +5 bonus to AC and has resistance to any damage dealt
> from an explosive or trap that is beyond the cover. A target has three-quarters cover if about
> three-quarters of it is covered by an obstacle. The obstacle might be a portcullis, an arrow slit, or
> a thick tree trunk.
>
> A target with **total cover** can't be targeted directly by an attack. Although, some items, perks,
> and abilities can reach such a target by including it in an area of effect. A target has total cover
> if it is completely concealed by an obstacle.
>
> ***Using another creature as cover.*** If a creature uses another creature as its cover, any attack
> roll made against it has the potential of hitting the covering creature. If the attack roll made
> against the covered creature is a 6 or below, the attack deals damage against the covering creature.

| Degree | AC | Explosive / trap from beyond the cover | Targetable |
|---|---|---|---|
| Half | **+2** | resistance | yes |
| Three-quarters | **+5** | resistance | yes |
| Total | — (no number printed) | not stated on pg 130; see §1.2 | **no** — area of effect only |

## 1.1 The non-stacking sentence is a precedent worth quoting

> "If a target is behind multiple sources of cover, only the most protective degree of cover applies;
> the degrees aren't added together." (pg 130)

This is the **only place in 136 pages** where the book states in so many words how two sources of the
same kind of protection combine, and it says **take the best, not add**. Everywhere else the question
is open (two armor sources, two effects granting the same bonus, two obstacles). It is a precedent,
not a general rule the book ever generalised — cite it when it is reached for, do not assume it.

It lives in code as `bestCover()` in `src/rules/cover.ts`, with the quote above in the module
docstring.

## 1.2 Total cover and explosives — answered from another chapter

Pg 130 gives half and three-quarters "resistance to any damage dealt from an explosive or trap that is
beyond the cover" but says **nothing** about total cover and explosives. The explosives chapter closes
it (pg 78):

> "…deal damage to every creature and object in its radius **that isn't behind full cover** when it
> detonates."
> "Each creature and object in the radius of the first range **that isn't behind full cover** takes
> full damage, while each creature and object in the radius of the second range **that isn't behind
> full cover** takes half as much damage."
> "Creatures and objects within a detonated explosive's area of effect **that aren't behind full
> cover** take damage equal to listed in the damage column."

So total/full cover is not resistance to explosives, it is **immunity** — printed, just not on pg 130.
Modelled as `explosiveExposure()` → `"full" | "resistant" | "none"`.

**What the book never defines: resistance.** No page says resistance halves damage, or does anything
else to a number. The closest is pg 130's "other rules, such as damage resistance, rely on the
types". `explosiveExposure()` therefore *names* the exposure and refuses to compute it. Halving would
be inventing a rule.

## 1.3 "Full cover" vs "total cover" — one degree, two names

Pg 130 defines **total cover**. Pg 78 (explosives), pg 127 (Hide, Take Cover) and pg 76 (Infrared
Scope) all say **full cover**. The two are never used together, no fourth degree is ever defined, and
Take Cover's "If you only have three quarters or half cover… to gain full cover" only makes sense as
the top of the same three-step ladder. **Ruled: one degree under two names.**

## 1.4 Everything else in the book that touches cover

| Page | Text | Status |
|---|---|---|
| 126 | **Take Cover — 3 AP** (AP table, read visually) | constant + gate in `cover.ts`; no button (ROADMAP D3) |
| 127 | "If you only have three quarters or half cover, you can spend 3 AP to squat, kneel, or duck into cover to gain full cover. If you attack while taking cover, you no longer have full cover." | as above |
| 127 | Hide: "In order to hide you must be heavily obscured or within full cover… If you are no longer within full cover of an enemy you are hidden from, you are no longer hidden." | out of scope (Hide/detection, ROADMAP D3) |
| 24 | Hide (Agility chapter): "if you have cover against any creatures and your Sneak skill check total is equal to or greater than their passive Perception…" — note this says *cover*, unqualified, where pg 127 says *full cover*, and "passive Perception" where pg 21 says "passive sense" | out of scope; recorded because the two Hide printings disagree |
| 128 | Unseen attackers: attacking from "invisible, heavily obscured, full cover" and unaware targets | already implemented as the sneak-attack path |
| 78 | Explosives ignore nothing behind full cover (§1.2) | no explosives action exists (ROADMAP D3) |
| 76 | Infrared Scope: "You can target creatures that are hidden, shrouded, in complete darkness, or invisible so long as they are not behind full cover." | rejected — weapon mods are a bare string (ROADMAP D2) |
| 44 | Calculated attack (perk): "you can target a creature behind cover or otherwise out of sight so long as there is a plane or surface in which your projectile can ricochet off of (up to GM's discretion)" | rejected — explicitly GM discretion |
| 47 | Perk (Agility 5): "Whenever you spend AP to reload or take cover, it costs you 3 less to a minimum of 1." | rejected — no AP-spending Take Cover button to discount |
| 126 | Dodge: "any attack roll made against you has disadvantage if you can see the attacker" | out of scope — a different defensive rule, and also target-side |

## 1.5 What pg 130 does not say

- **Who decides the degree.** No procedure, no measurement, no grid. "At least half of its body" and
  "about three-quarters of it" are adjudications, and the examples (an arrow slit, a portcullis, a
  friend) are things no wall-collision test distinguishes.
- **Whether cover applies to melee.** The entry is written for "an attack or other effect", not for
  ranged attacks, so by the letter it covers a melee swing too. Nothing in the code assumes otherwise.
- **What "6 or below" is measured on** — see §1.6.
- **Whether the covering creature gets a to-hit roll of its own.** It does not: the text says the
  attack "deals damage against the covering creature", full stop.
- **Whether a natural 1 redirects.** Not excluded. A total of 1 is "6 or below".
- **What degree a creature gives.** Pg 130 lists a creature among obstacles that *might* give half
  cover, and its example says "a creature that gives half cover" — but it never states that a creature
  always gives half cover, and a Deathclaw and a Radroach are not the same obstacle. Left to the GM:
  `cover` and `coverIsCreature` are independent options.

## 1.6 Ruling — "the attack roll made against the covered creature is a 6 or below"

Read as the **total**, not the raw die. The book distinguishes the two elsewhere: pg 66 says "the
**result of the roll**" for critical hits, pg 127 says "If your **roll total** is greater than your
target's AC". Pg 130's phrase — "the attack roll made **against** the covered creature" — is the
number aimed at an AC, which is the total.

Stated as a ruling, not as printed: the raw-die reading is defensible and produces a very different
game at high skill bonuses (a +9 shooter would never endanger their friend under the total reading,
and would endanger them 30% of the time under the raw reading). Commented at
`hitsCoveringCreature()`.

---

# SECTION 2 — Range bands: the book contradicts itself

## 2.1 Pg 21 (Perception → "Weapon range"), verbatim

> **Weapon range.** All ranged weapons have a range calculation listed in the ranged weapon tables. The
> range lists two calculations for two numbers. This calculation is the listed number x your perception
> score. The first is the weapon's **normal range** in feet, and the second indicates the weapon's long
> range. **When attacking a target beyond normal range, you have disadvantage on the attack roll. You
> can't attack a target beyond the weapon's long range.**

## 2.2 Pg 66 (Ranged Weapons → "Range"), verbatim

> **Range.** Ranged weapons each have a different range specified in the weapon tables below. To
> calculate a weapons range, multiply your Perception ability score by the numbers listed in the Range
> column. The first number is the weapons **short range**, and the second number is the weapons long
> range. **You have disadvantage on attack rolls against targets who are beyond the short range of the
> weapon. Attack rolls against targets beyond the long range of the weapon only hit if you roll a 20.**

## 2.3 The two disagreements

| | pg 21 | pg 66 |
|---|---|---|
| Name of the first number | "normal range" | "short range" |
| Past the first number | disadvantage | disadvantage *(agreed)* |
| Past long range | **"You can't attack"** | **"only hit if you roll a 20"** |

The first is cosmetic but tells you which page is the operative one: **no weapon table anywhere in the
book has a column called "normal"**, and the mods on pg 76 modify "the weapon's *short* range modifier"
and "the weapon's long range modifier". Pg 21 is the only page in 136 that says "normal range".

The second is a real mechanical fork: an impossible shot versus a 5%-and-disadvantage shot.

**Ruled: pg 66 governs, and the card prints both sentences.** Reasons, in order of weight:

1. It is the ranged-weapon chapter's statement of the ranged-weapon rule, in the terms the weapon
   tables and the weapon mods use. Pg 21 sits in an ability-score sidebar next to Passive Sense and
   Healing Rate, and reads as a summary of it.
2. It is the more specific rule, and specific beats general.
3. It leaves the table its authority in the direction that matters. A GM running pg 21 narrates a
   refusal and nothing is lost; but a system that refused to roll would give a GM running pg 66 no way
   to make an attack the book explicitly allows.

Both sentences, both page numbers, and the verdict for the roll just made go on the chat card, so no
one has to take the ruling on trust. `docs/rules-reference.md:93` currently records only the pg 21
reading ("beyond long → impossible") and should be corrected — not touched here, it is not my file.

## 2.4 Does disadvantage apply past *long* range as well?

Pg 66 imposes disadvantage "against targets who are **beyond the short range** of the weapon". A
target past long range is also past short range, so **by the letter it does**, and the book never
carves the far band out. Applied, and commented as a reading rather than an explicit statement.

## 2.5 Band boundaries

Both printings say *beyond*. So a shot at exactly the normal range is unpenalised, and one at exactly
the long range is still inside it. **The book states no minimum range** for any ranged weapon, so
there is no close band to invent.

## 2.6 What scales the bands

The bands are computed, not declared, from four pieces of sheet state — this is the whole of the
automation on offer:

| Input | Page | Note |
|---|---|---|
| Weapon's two multipliers × **Perception score** | 21, 66 | score, not modifier — printed twice |
| Weather | 121-123 | Fog/storms/dust cut every ranged weapon's range to ½ or ¼ (`rangeMultiplier()`) |
| Kickback, held one-handed | 70 | "both the short and long range [modifiers are halved]" |
| — | — | Scope / Infrared Scope / Long Barrel change the multipliers (pg 76) but are **not** applied: `system.mods` is a bare string (ROADMAP D2) |

The arithmetic deliberately mirrors what the character sheet already prints on the weapon row
(including its `Math.floor`), because the player reads "60/120 ft" there and picks a distance against
it. A band computed from unscaled numbers would silently disagree with the sheet in fog.

## 2.7 Neighbouring rules that mention range increments

- **Spread (pg 70):** "When you attack a target in the second range increment…" — the shotgun keyword
  only fires in the band that already carries disadvantage. Already noted at `rollAttack`; unchanged.
- **Improvised throws (pg 128):** their own normal/long pair, multiplier × **Strength** score
  (`improvisedThrowRange`). `rollImprovisedAttack` takes no distance and none was added — see the
  rejection list.
- **Blind attack (pg 128):** already consumes a distance in feet (`5 + 1 per 5 ft`). Unrelated
  machinery, deliberately left alone.

---

# SECTION 3 — Automatic vs declared, and why

**Decision: both cover and distance are declared per attack. Nothing is measured from the canvas, and
no hook watches token movement.**

- **Cover cannot be computed at all**, at any level of Foundry integration. Its degrees are
  adjudications ("at least half of its body", "about three-quarters of it"), and its examples — an
  arrow slit, a portcullis, a friend standing in the way — are not distinguishable by a wall test.
  Guessing would hand out a +5 AC no GM granted.
- **Distance genuinely could be measured, and still is not.** It needs an attacking token (an actor
  may own several or none, and a sheet rolled from the sidebar has none), a target, a grid and
  elevation; it needs Foundry API surface this project has not probed on a live server, which the
  working agreement forbids building on sight-unseen and which `src/types/foundry.d.ts` does not
  declare; and it changes constantly, so keeping it honest wants exactly the token-movement hook that
  `src/actions/situations.ts` argues against and this project has already been burned by once.
- It is the same answer this system has given every time a rule depends on **target state a sheet
  cannot see**: target-conditioned advantage stays text (`src/rules/effects.ts`), a Fusion Core hit is
  reported by the person who landed it (`src/actions/power-armor.ts`), and the sneak-attack card
  states its condition instead of resolving it because the target's AC is unknown here. Cover is
  literally a bonus to that same unknown AC.
- What *is* automatic is the part made of sheet state: turning a declared distance into a band using
  the weapon, the character's Perception, the weather and Kickback (§2.6). That is the half worth
  having, and it is the half that is safe.

The default of every new option is "unstated", so an attack rolled without them behaves exactly as it
did before.

---

# SECTION 4 — Rulings made (nothing here is printed as such)

1. **Pg 66 beats pg 21 past long range** (§2.3). The roll happens, at disadvantage, and only a natural
   20 hits. Both printings are named on the card.
2. **Disadvantage also applies past long range** (§2.4) — by the letter of "beyond the short range".
3. **Total/full cover is one degree under two names** (§1.3).
4. **"6 or below" is the attack roll's total, not the raw die** (§1.6).
5. **The covering creature is hit without a roll of its own, and a natural 1 still redirects** (§1.5).
6. **Total cover refuses the attack before ammunition is spent.** The rule is a prohibition ("can't be
   targeted directly"), so it is an early-out like the empty magazine — and a shot the rules forbid
   must not also cost a round.
7. **Resistance is named, never computed** (§1.2). The book does not define it.
8. **A creature giving cover does not automatically mean half cover** (§1.5) — the two options stay
   independent.
9. **A weapon with no printed range ignores a declared distance** rather than treating 0/0 as bands,
   which would make every shot "beyond long range". Melee weapons and unfilled statblock rows.

---

# SECTION 5 — Rejection list (extracted, deliberately not implemented)

| Rule | Page | Why not |
|---|---|---|
| Cover's **+2/+5 applied to the target's AC** | 130 | The attacker's roll cannot apply a bonus to a number it never sees. Reported on the card with its value, exactly as the sneak-attack card reports its condition. Applying it would need the damage/AC comparison to move server-side onto the target, which is a much larger job than this rule. |
| **Explosive / trap resistance** from cover | 130, 78 | It is a damage-side rule; `src/combat/damage.ts` is not mine to edit, and no explosives action exists to route it through (ROADMAP D3). Printed on the card when the weapon deals explosive damage, so a GM applying damage sees it. |
| **Total cover reachable by area of effect** | 130 | No area-of-effect resolution exists in this system; Spread's extra hits are already announced-not-resolved for the same reason. |
| **Take Cover action** (3 AP, half/three-quarters → full, lost on attacking) | 126-127 | Needs an AP-spending action button, which no pg 126-127 action has yet (ROADMAP D3). The constant, the gate and the resulting degree are in `cover.ts` for whoever builds that row. |
| **Hide requiring full cover**, and the pg 24 vs pg 127 disagreement about it | 24, 127 | Hide/detection is its own D3 line item; the two printings need settling there, not here. |
| **Perk: reload/take cover costs 3 less AP** | 47 | Nothing spends AP for either yet. |
| **Perk: Calculated attack ricochets around cover** | 44 | Printed as "up to GM's discretion". |
| **Infrared Scope / Scope / Long Barrel range and cover clauses** | 76 | `system.mods` is a bare string — no mod is mechanical (ROADMAP D2). Named in the notes so the band arithmetic is known to be incomplete for modded weapons. |
| **Automatic measurement of distance from token positions** | — | §3. Declared instead. |
| **Any hook on token movement** | — | Explicitly out; §3. |
| **A minimum / close range band** | 21, 66 | The book prints none. Not invented. |
| **Distance on improvised throws** | 128 | `improvisedThrowRange` exists, but the improvised attack is a separate entry point with its own AP/damage model, and adding a band there was outside the brief. Deliberate, and cheap to add later — the classifier is generic. |
| **Correcting `docs/rules-reference.md:93`** ("beyond long → impossible") | — | Correct target, not my file. Flagged in §2.3. |

---

# SECTION 6 — What was implemented, and where

- `src/rules/cover.ts` (new, pure): `COVER_DEGREES`, `COVER_AC_BONUS`, `coverAcBonus`,
  `blocksTargeting`, `bestCover`, `explosiveExposure`, `CREATURE_COVER_HIT_MAX`,
  `hitsCoveringCreature`, `TAKE_COVER_AP`, `canTakeCover`, `coverAfterTakingCover`.
- `src/rules/formulas.ts`: `RangeBand` and `rangeBand()`, next to the existing `weaponRange()`.
- `src/dice/rolls.ts`: `AttackOptions` gains `cover`, `coverIsCreature`, `distanceFeet` (all
  optional; omitting them reproduces today's behaviour exactly). Total cover refuses the attack before
  ammunition is spent; the bands impose one disadvantage under the existing cancellation convention;
  every ruling above is stated on the chat card.
- `packs-src/fragments/cover-range.lang.json` — the `FALLOUT.Cover` / `FALLOUT.Range` keys.
- `packs-src/fragments/cover-range.smoke.js` — nine steps, asserting **dice** (`1d20` vs `2d20kl`)
  wherever the rule is about advantage.
