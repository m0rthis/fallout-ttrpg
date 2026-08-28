# Advantage / Disadvantage annotation pass — perks & traits

The effects engine gained advantage and disadvantage counters
(`system.bonuses.advantage.<category>` / `system.bonuses.disadvantage.<category>`, ten categories:
the seven abilities, `attack`, `initiative`, `all`). This pass revisited every perk and trait whose
text mentions advantage or disadvantage and promoted the ones that are **unconditional and
always-on across a whole category** into `mechanics`. Nothing else was touched: no `name`, `type`,
`description`, `requirements`, `ranks`, `prerequisite`, `wildWasteland`, or `wildWastelandEffect`
changed, and no entry was added, removed, or reordered.

**Result: 1 annotation added, 32 candidates rejected.**

The seven ability categories cover the ability check *and* the skills that ability governs (that is
the book's own phrasing, "all Charisma ability and skill checks"), so a clause narrower than
"every roll this ability governs" is narrower than any category we can express.

## Candidate set — how it was built

`advantage` (case-insensitive, which also catches `disadvantage`) over `system.description` of all
186 perks and all 47 traits: **24 perks + 9 traits = 33 candidates**. No entry uses an
advantage-equivalent phrasing without the word — the only "roll twice"-style texts in either file
(Wasteland Knowledge, Hot Blooded) are re-rolls and damage, not advantage.

A further **8 traits** mention advantage only inside `wildWastelandEffect` (Dense Circuitry,
Vigilant Watch, Persistent, Embolden, Claustrophobia, Fast Shot, Feral, Hot Blooded). These are
**out of scope by construction**: `wildWasteland` is `false` on every trait, so the Wild Wasteland
paragraph produces no mechanics — same rule the AC/DT pass used. They are not counted in the 33.
Worth noting that Claustrophobia's variant ("advantage on all ability and skill checks while
outside, but disadvantage … while indoors") would be `all`/`all` if the toggle ever flips it on —
except that it is conditional on location and so would still be rejected.

---

## 1. Annotated (1)

| Entry | File | Clause (verbatim) | Key | Why it clears the bar |
| --- | --- | --- | --- | --- |
| **Blind Devil** | perk, pg 34 | "you have advantage on all your combat sequence rolls" | `system.bonuses.advantage.initiative` +1 | "all … combat sequence rolls" is exactly the `initiative` category, with no trigger, duration, cost, or choice. |

Two things checked before writing it:

- **`initiative` really is combat sequence.** `src/rules/effects.ts` documents
  `ADVANTAGE_CATEGORIES` as "`attack` covers attack rolls, `initiative` combat sequence", so the
  book's "combat sequence roll" maps 1:1 and no interpretation is involved.
- **`Requirements: Permanently Blinded` is not a condition on the roll.** It gates *taking* the
  perk. Once taken, the advantage is permanent and unconditional — unlike, say, Keeping your Cool,
  where the condition is re-evaluated during play.

Blind Devil's other clauses stay text: "your passive sense increases by 5" is a flat bonus on a
path this pass was not authorised to write (see §4), and the pinpoint-sensing radius is not a
numeric bonus at all.

---

## 2. Rejected (32), grouped by reason

### 2a. Conditional or situational (12)

The advantage exists only while some state holds, only after a trigger, or only for a limited
window. An always-on counter would be wrong whenever the condition is false — which is most of the
time for nearly all of these.

| Entry | File | Clause | Condition |
| --- | --- | --- | --- |
| **Nuclear Reactor** | perk, pg 52 | "While in an irradiated zone you have advantage on all ability and skill checks" | Location. This is the one clause in either file that would otherwise be a clean `all`. See §3. |
| **Hoarder** | trait, pg 32 | "you have disadvantage on all ability checks, skill checks, and attack rolls while you're not carrying at least 50 load…" | Carry-load state. Would be `all` + `attack` if unconditional. See §3. |
| **Keeping your Cool** | perk, pg 43 | "During combat, you have advantage on all Charisma checks … so long as you haven't taken any damage to your hit points during the combat" | Gated twice over (in combat, undamaged), and lost for the rest of the combat once damage lands even if healed. |
| **Super Slam!** | perk, pg 36 | "your next unarmed or melee weapon attack has advantage" | Only after spending AP to move 15 ft in a straight line, and only for one attack. |
| **Spray and Pray** | perk, pg 49 | "Whenever you make a blind attack, you have advantage on the attack roll" | Only on blind attacks. |
| **Celebrity** | perk, pg 44 | "You gain advantage on all Charisma based skill checks with this NPC" | Only with an NPC you first won a Luck check against, per-NPC. |
| **Street Rat** | trait, pg 29 | "advantage on any Sneak or Breach checks … while in a settlement" / "disadvantage on any Speech or Barter checks … while in a settlement" | Location, on both halves. Note the drawback covers *both* Charisma skills but not Charisma ability checks, so even unconditionally it would be a subset. |
| **Don't Fence Me In** | perk, pg 36 | "you always have advantage on the roll" | "always" refers only to the Escape roll bought with 3 AP. |
| **Persistent** | trait, pg 28 | "Whenever you flip a Karma Cap to re-roll a Skill check, you make the roll at advantage" | Only on a Karma-Cap re-roll — and see also 2d. |
| **Toughness** (rank 2) | perk, pg 40 | "you have advantage on checks to resist becoming frightened" | Only at rank 2, and only on resist-frightened checks (also a subset). |
| **Fast Shot** | trait, pg 31 | "you can choose to have disadvantage on the attack roll, if you do the attack costs 1 less action point" | Opt-in per attack. A permanent `disadvantage.attack` would be a straight downgrade of the trait. |
| **Friend of the Night** | perk, pg 37 | "You no longer have disadvantage on any attack rolls, ability checks, or skill checks inhibited by low-light conditions" | Removes a disadvantage that only exists in low light — and see 2d. |

### 2b. Scoped to a subset of a category (11)

Real, unconditional advantage, but on a slice narrower than any of the ten categories. Promoting
these would hand the character advantage on rolls the book never gave them.

| Entry | File | Clause | Category it would need |
| --- | --- | --- | --- |
| **Animal Friend** | perk, pg 42 | "advantage on any Charisma checks to interact with animals" | Charisma, but only vs animals. |
| **Chemist** | perk, pg 44 | "you have advantage on resisting addiction" | Endurance, but only the addiction check. |
| **Enhancement Resistant** | trait, pg 30 | "advantage on any Endurance check to resist becoming addicted" | Same slice as Chemist. |
| **Enhancement Reliant** | trait, pg 30 | "disadvantage on any Endurance check to resist becoming addicted" | Same slice, drawback side. |
| **Hardened by the Earth** | trait, pg 28 | "advantage whenever you roll an Endurance check to resist a level of Hunger or Fatigue" | Endurance, but only Hunger/Fatigue. |
| **Activated Actinides** | trait, pg 26 | "you have advantage on any Radiation checks" | Radiation checks are their own roll; not a category. |
| **Computer Cousin** | perk, pg 52 | "advantage on Breach skill checks with any computer" | Perception governs Breach, but also Energy Weapons, Explosives and Medicine — and this is only Breach-vs-computers. |
| **How do you do, fellow Ghouls?** | perk, pg 53 | "advantage on Speech skill checks with any ghoul" | Charisma, but only Speech, only vs ghouls. |
| **Stonewall** | perk, pg 36 | "whenever you roll a Strength or Ability check to resist being grappled, restrained, or knocked prone; you have advantage" | Resist-grapple/restrain/prone only. Its DT +2 mechanic is untouched. |
| **Trailblazer's Instinct** | perk, pg 40 | "you have advantage on any encounter rolls" | Encounter rolls are a travel-procedure roll with no category. |
| **Can't Put Me Down** | perk, pg 53 | "you gain advantage on all Death Saves" | Death saves are not one of the ten categories. Its DT +1 mechanic is untouched. See §3. |

### 2c. Grants advantage to someone else, or to a roll the character does not make (4)

| Entry | File | Clause | Who rolls |
| --- | --- | --- | --- |
| **Embolden** | trait, pg 27 | "each other player character gains advantage on their first attack roll they make on their turn" | Other PCs. Also once per combat sequence. |
| **Battle Cry** | perk, pg 42 | "each chosen creature gains advantage on their first attack roll on their turn" | Allies. Also costs 3 AP, once per combat. |
| **Flaunt 'n Taunt** | perk, pg 42 | "the next attack roll against the taunted creature that isn't from you has advantage" / "they have advantage on their Charisma check" | An ally's attack, and the *target's* saving check — the second one is a drawback expressed as someone else's advantage. |
| **Nimble Dash** | perk, pg 47 | "all attack rolls made against you have disadvantage until the start of your next turn" | Enemies' attacks. `disadvantage.attack` on this character would wrongly penalise the character's own attacks. |

### 2d. Not really advantage (5)

Re-rolls, removal of an existing disadvantage, and changes to how advantage dice are rolled. None
of these is a counter on a category.

| Entry | File | Clause | What it actually is |
| --- | --- | --- | --- |
| **Outrageous Advantage** | perk, pg 51 | "Whenever you … roll … with advantage; you roll three d20's instead of two and choose the highest result" | Changes the *size* of advantage, not whether you have it. Inexpressible as a counter. See §3. |
| **Dumb Luck** | perk, pg 50 | "whenever you flip your Karma Cap to gain advantage … you can add double your Luck modifier" | A modifier on a Karma-Cap-purchased advantage. |
| **Fortune Favors the Bold** | perk, pg 51 | "flip your Karma Cap to gain advantage or a reroll … physically flick and flip your Karma Cap" | A Karma Cap economy rule. |
| **Weapon Handling** | perk, pg 35 | "You no longer have disadvantage on attack rolls made with weapons that you do not meet the Strength requirement for" | Cancels a conditional disadvantage the engine does not currently apply from the perk's side. A `disadvantage.attack` counter cannot be *decremented* by an annotation (`value` is always 1, `mode: add`), so there is no honest encoding. |
| **Never Unarmed** | perk, pg 37 | "You no longer have disadvantage on improvised attack rolls" | Same shape as Weapon Handling, restricted to improvised weapons. |

Friend of the Night (listed in 2a) is a third instance of this "removes a conditional
disadvantage" shape; it is filed under conditional because its scope is a lighting condition.

---

## 3. Flagged for a human — genuinely ambiguous or blocked by the schema

1. **Nuclear Reactor (perk, pg 52) — the strongest promotion candidate.** "While in an irradiated
   zone you have advantage on all ability and skill checks." If the group plays irradiated zones as
   the ambient default, this is `advantage.all` in practice. It is filed as conditional because the
   text states a condition outright, and the same sentence's AC/DT clause was already ruled
   conditional in `PERK-TRAIT-NOTES.md` §3j and re-affirmed in `V21-NOTES-perks.md` §4c. Note that
   `all` per the engine means *every* d20, which is broader than "all ability and skill checks" —
   it would also cover attack rolls and combat sequence. So even a ruling that the clause is
   unconditional does **not** make `advantage.all` a clean fit; it would over-grant. Needs a ruling
   on both the condition and the category.

2. **Hoarder (trait, pg 32) — a condition the sheet can actually evaluate.** "Disadvantage on all
   ability checks, skill checks, and attack rolls while you're not carrying at least 50 load." This
   is the one conditional in the set whose trigger is a tracked number, not a fiction: carry load
   is on the sheet. It cannot be an always-on counter, but it is a good candidate for a *derived*
   effect if the engine ever supports conditional Active Effects. Same category caveat as Nuclear
   Reactor: "ability checks, skill checks, and attack rolls" is `all` + `attack` in engine terms,
   which also sweeps in combat sequence.

3. **Can't Put Me Down (perk, pg 53) — death saves have no category.** "You gain advantage on all
   Death Saves. If you already have advantage on Death Saves, you roll three d20's and take the
   highest result." Unconditional and category-wide *for a category the engine does not have*. If a
   `deathSave` category is ever added, this is the first entry to annotate. Its second sentence has
   the same three-d20 problem as Outrageous Advantage.

4. **Outrageous Advantage (perk, pg 51) and Blind Devil's passive sense.** Both are real, always-on
   mechanics that the current key set cannot express — a third advantage die, and a flat
   `passiveSense` bonus that `V21-NOTES-perks.md` §4c already flags as an unauthorised path. Not
   this pass's call, but worth listing together as "known-mechanical, currently text".

5. **Street Rat's drawback is a near-miss on Charisma.** "Disadvantage on any Speech or Barter
   checks" covers both Charisma skills and nothing else — the difference from
   `disadvantage.charisma` is only that Charisma *ability* checks are excluded, plus the settlement
   condition. Rejected on the condition alone, but if a GM wanted one trait automated for flavour,
   this is where the gap is smallest and the mis-fire least harmful.

---

## 4. Not in scope for this pass

- The eight Wild Wasteland advantage clauses (see the candidate-set section) — `wildWasteland` is
  `false` everywhere.
- Flat numeric bonuses of any kind. The nine existing `mechanics` entries (AC/DT/carry load/skills)
  were re-read to confirm this pass did not disturb them; none changed.
- The unauthorised-path list from `V21-NOTES-perks.md` §4c (`hpMax`, `spMax`, `apMax`,
  `passiveSense`, `healingRate`, `d20`, `damage`) is still open and still not done here.

## 5. Validation performed

- `node -e "JSON.parse(...)"` passes on `perks.json` (186 entries) and `traits.json` (47).
- Parsed-object diff against `HEAD`, field by field: **the only difference in either file is
  Blind Devil's `mechanics` array**, `[]` → one entry. Entry counts, entry order, `system` key
  order, and every other field are byte-identical.
- The category name was checked against `ADVANTAGE_CATEGORIES` in `src/rules/effects.ts`, and the
  written path against `advantagePath()` (`system.bonuses.advantage.<category>`).
- `traits.json` is unmodified — no trait cleared the bar.


---

## Review notes (integration pass)

1. **Decrementing a counter is possible after all.** The notes state that perks which
   *remove* a disadvantage (Weapon Handling, Never Unarmed, Friend of the Night) cannot be
   encoded because entries are always `value: 1, mode: add`. A change of `value: -1` against
   `system.bonuses.disadvantage.<category>` would work, and the field's `min: 0` clamps it,
   which is exactly the cancel-one-source behaviour wanted. The real blocker is that all
   three remove a *conditional* disadvantage, not a whole category — so leaving them as text
   is still the right call, for the same reason as everything else in the rejection list.
2. **`bonusKeyFor()` in `scripts/build-packs.mjs` had to learn the new key shape.** It
   accepted `system.bonuses.<key>` and `system.bonuses.skills.<key>` but not
   `system.bonuses.advantage.<key>`, so the first annotation was reported as unmapped and
   silently stayed text. The build printing that mismatch is what caught it — worth keeping
   that warning loud.
3. **The headline result stands and is worth recording:** of 233 perks and traits, exactly
   **one** grants advantage that is both unconditional and coextensive with a whole
   category. The category model is simply the wrong shape for perk text, which is
   overwhelmingly conditional ("while in an irradiated zone") or narrower than any category
   ("Charisma checks to interact with animals"). Automating those needs conditional and
   scoped effects, not more categories.
