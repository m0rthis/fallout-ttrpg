# BACKLOG — the one list

This is the **single work queue** for finishing the system. Every item below was
verified against the code on 2026-08-12 — not against `ROADMAP.md`, whose status
table had gone stale in both directions (it listed shipped systems as absent,
and listed robot sub-types as done when four of their traits are enforced by
nothing). `ROADMAP.md` remains the book of *rulings and history*; **this file is
what's left**. When an item ships, check it off here and move its ruling notes
into ROADMAP.md if it made any.

## How to work this queue

Rules for any agent (or session) picking up items:

1. **Work top to bottom within a section; sections in order A → D.** Section A
   is a gate: nothing below it is trustworthy until A is green.
2. **One item = one commit** (or one small batch), and `npm run verify` must
   exit 0 — check the exit status itself, not the tail of the output.
3. **Every mechanical item lands with smoke steps** in `scripts/smoke.mjs`.
   Test documents are prefixed `SMOKE-` and deleted by the suite; never touch
   anything unprefixed. The world is throwaway; mounted data is not.
4. **Implement from the book, not from this file's one-line summaries.** Work
   from the rulebook PDFs (v2.1 is authoritative; not distributed here). Where the
   book is silent, say so in a comment and state the ruling — never invent
   silently. Match the existing comment density and tone.
5. **Do not touch credentials.** `scripts/smoke.config.json` (gitignored) is
   read by the suite; never `cat` it, edit it, or commit it.
6. **Probe before building on Foundry API** you haven't seen: read the deployed
   `foundry.mjs` or run a live check. This project has been burned by
   sight-unseen API twice (ArrayField→TypedObjectField, ApplicationV2 actions).
7. **Layering is load-bearing:** `rules/` is pure (no document writes, no
   `game.*` beyond i18n); `dice/core.ts` may never import `actions/`;
   `actions/` may import `dice/core` but never `dice/rolls`. `tsc` won't catch
   a violation until it becomes a cycle at runtime — keep the arrows one way.
8. **Multi-agent work uses disjoint file ownership.** Shared files
   (`character.ts`, `fallout.ts`, `en.json`, `smoke.mjs`,
   `character-sheet.ts`) belong to the coordinating session; agents deliver
   lang/smoke fragments to the scratchpad instead of editing them.

---

## A. Verification gate — do this first, and again after every batch

- [x] **A1. Deploy HEAD and run the full suite.** *Done through v0.27.0: run 9 on 2026-08-13 was fully green — 425 passed, 0 failed — the first clean run in the project's history. The only remaining signal is a cosmetic server-side rejection near step 252 (`progression: may not be undefined`), under live diagnosis.* **Resolved:** the
  error was pr19's `system.-=progression` delete — v14 refuses to delete a
  required SchemaField, drops the update client-side, and pr19 had been passing
  vacuously against a fully-populated actor. The fixture now builds a source
  that genuinely lacks the key, proven live with zero errors. Deployed is v0.24.2; local
  HEAD carries five unreleased commits (roll-helper extraction, Super Mutant,
  robot sub-types, Vision & Fire panel, sneak/dodge/magazine/Healing Powder
  wiring). None of it has run against a live server.
  *How:* deploy the tagged build to a Foundry server, confirm `/api/status`
  shows the new `systemVersion`, then `npm run smoke`.
  *Accept:* suite reaches the end; no failure attributable to the new commits.
- [x] **A2. Verify the blindsight registration on a live canvas.** *Done
  2026-08-13, and it earned its keep: the live block proved registration, the
  TypedObjectField round-trip and `testVisibility`, then failed on darkness
  sources and exposed a two-layer core behaviour — `_canDetect` refuses when
  `walls && blinded.darkness`, and `_getPolygonConfiguration` separately
  collapses the vision polygon to `externalRadius`. The registration now
  overrides both; walls and the printed radius still apply.* Superseded detail: The
  `DetectionMode` registration in `src/fallout.ts` was shaped from the deployed
  `foundry.mjs`, never exercised. It's wrapped in try/catch so a wrong guess
  can't break init — but wrapped-and-wrong is still not working.
  *Accept:* a smoke step gives a SMOKE- token blindsight via `setSenses`, drops
  scene light to pitch dark, and asserts the token still detects an adjacent
  target (and a no-blindsight control does not).

## B. Known failures — diagnosed or reproduced on the 2026-08-12 run (283 ✓ / 3 ✗)

- [x] **B1. Export the missing stealth rules to the API.** Step 290 threw
  `api.beatsPassiveSense is not a function` — `src/rules/stealth.ts` exports it
  but `src/fallout.ts`'s API block never picked it up (same class of bug as the
  movement-rules omission fixed in a1a0ff7).
  *What:* export `beatsPassiveSense` and audit the rest of `rules/stealth.ts`'s
  exports against what `smoke.mjs` calls; export anything else missing.
  *Accept:* step 290's block runs.
- [x] **B2. De-flake the fusion-core condition test** (`smoke.mjs` ~2302,
  failed step 123). It asserts a `leg` attack posts a `1d4` follow-up — but a
  natural 1 posts nothing and a crit posts a severe-injury card instead, so the
  test fails on dice luck (~2 rolls in 20). The system is correct; the test is
  wrong. Retry the limb attack until the kept d20 is neither 1 nor a crit, or
  read the card type instead of the formula.
  *Accept:* 10 consecutive runs of that step pass.
- [x] **B3. Diagnose the magazine/rest failure + validation error** (step 254).
  Evidence: `readMagazine(actor, system, item, 6)` should set `untilRest` on a
  title that already has its permanent +1; instead `untilRest` stayed all-zero,
  `restProgression(…, 6)` cleared 0 magazines, and the console carried
  `Actor validation error: system.progression: may not be undefined` out of an
  `_updateDiff`. Likely a malformed update to `system.progression.magazines`
  (writing a sub-path that diffs the parent to undefined). Reproduce live,
  fix the write, keep the test.
  *Accept:* step 254 passes and the validation error is gone from the console
  capture.
  *Resolved 2026-08-13:* test-fixture bug, not a system bug — SMOKE-Milsurp shipped
  6 copies and six earlier reads (incl. the asserted-consuming re-read) spent them
  all, so the issue-6 read was correctly refused as empty. The step now pins the
  empty-refusal as coverage and restocks one copy. The stray
  `progression: may not be undefined` console error persists across runs and is
  still unattributed — watch the next run's console capture.
- [x] **B4. Smoke coverage for everything in the five unreleased commits.**
  None of it has steps yet: Bulky (+1 decay on a Super Mutant's weapon crit-fail
  and armor corrosion, and *not* on repair), Superior Strength
  (`max(6, STR+1)`, +40 carry), Healing Powder (banked rounds, per-turn payout,
  ghoul immunity, bleeding same-tick compose), sneak-from-posture (hidden+
  surprised target → crit card; explicit `sneak:false` suppresses), magazine
  Use-button routing, robot limb picker (Handy has no head; jet engine 4 AP,
  melee 2; Robobrain rollers can't sever), attack-reveal (attack ends Hide and
  Take Cover; silenced keeps Hide), repair/medicine advantage reaching the roll.
  *Accept:* each lands as a self-contained block (creates and deletes its own
  SMOKE- fixtures — see the Power Armor block for the pattern).

## C. Rules gaps — specified, ready to implement

- [x] **C1. Enforce the four declared robot traits.** `ROBOT_TRAITS` in
  `src/rules/robots.ts` is read by **nothing** (the roadmap briefly overstated
  this as done):
  - *Reinforced Plating* (Protectron, pg 10): DT +1 even unarmored → the DT
    derivation in `character.ts`.
  - *Slow* (Protectron, pg 10): max 6 AP on movement per turn → the movement
    actions report the cap (AP is never deducted — item E1 — so report, don't
    block).
  - *All Terrain Rollers* (Robobrain, pg 11): no extra AP for difficult
    terrain → the movement/terrain reporting path.
  - *NeuroTransmitters* (Robobrain, pg 11): electricity vulnerability → the
    resistance/vulnerability derivation; head-hit inflicts **two** conditions →
    the targeted-attack follow-up in `dice/rolls.ts` (roll 1d4 twice; on a
    crit, do *not* double the severe injury — ruling already in `robots.ts`).
  *Accept:* smoke steps per trait.
- [x] **C2. Severed-limb reattachment control** (all robots, pg 11).
  `robotReattachCost` exists unused. Add a control (medical or robot panel):
  reports 3 steel + 1 circuitry, `10 − crafting bonus` minutes, or 6 AP at ≤0.
  Materials reported, not consumed (no junk exists — D2).
- [x] **C3. Robot fuel** (pg 10). *Landed 2026-08-13 with a ruling: the paragraph is printed inside the Handy entry (like Slow inside the Protectron's), so the automatic clock is the Handy's; the fill/core controls work on any robot for GMs who read it robot-wide.* Weekly clock: 6 AP to consume a gallon (or
  six oil junk — reported); past 168 hours, DC 12 Endurance per hour, +2 per
  success, unconscious on failure; fusion-reactor variant runs 30 days. Model
  on the existing survival clocks (`passDay`/`advanceDiseases` pattern); GM
  advances time, nothing hooks the world clock.
- [x] **C4. Super Mutant variant traits** (pg 12, GM-optional, each *replaces*
  Superior Strength): **Defective Strain** (STR/END +2, carry +40, INT −2
  capped at 3) and **Nightkin** (Superior Strength's numbers + Stealth Field:
  3 AP, invisible 1 minute; each use after the first per day, PER −1 for 24h,
  min 1, without disqualifying PER-gated perks). Needs a `details` field for
  the variant; the sheet shows it only for Super Mutants (copy the robotType
  picker pattern). Book text is transcribed in the scratchpad SPEC.md and
  ROADMAP notes; re-pull from the PDF if in doubt.
- [x] **C5. Vision & Fire panel polish** — the two items its author flagged:
  export a `flameAreaOf(region)` from `light.ts` so the panel can show radius/
  formula/rounds per fire (it currently shows only the region name), and move
  the panel's direct `ChatMessage.create` for obscurement into `light.ts` to
  match every other panel's layering.

## C-cleanup. Reuse findings from the 2026-08-13 review — apply when touched

Three confirmed-but-deferred findings from the batch-2 code review. None is a
correctness bug; each is a divergence trap for the next edit in its area, so
pick them up when working nearby rather than as their own commits.

- [x] **CL1. One marker-effect teardown.** `stealth-field.ts` re-implements the
  flag-marker scan and end-and-announce shape that `stealth.ts` (`markers`/
  `clearMarkers`) and `blocking.ts` (`endBlocking`) each also own privately.
  The Stealth Boy (D1 follow-up) would be a fourth copy. Extract a shared
  `endMarkerEffect(actor, flagKey, announceKey)`.
- [x] **CL2. One poster for AP-priced movement cards.** The Protectron Slow
  note is hand-spliced into four report functions in `actions/movement.ts`; a
  new movement card will silently omit chassis notes. Shared card tail.
- [x] **CL3. Hoist smoke helpers.** The new blocks carry ~10 private copies of
  `settle()`/`until()` with drifting timeouts. One suite-scope pair with a
  timeout parameter. (The paste-scaffolding comments are already stripped.)

## Landed 2026-08-13, after the "any bugs?" audit

- [x] **Hoarder was inert, and so was the whole conditional-effect system.**
  `EFFECT_CONDITIONS` was built *for* Hoarder (pg 32), but the trait carried no
  mechanics, and `scripts/build-packs.mjs` had no way to emit a condition flag
  at all — so no shipped perk or trait could ever use the situations layer.
  Three fixes: the emitter now writes `condition`/`conditionNegated` and splits
  an entry into one effect per condition group (Hoarder's +25 Carry Load is
  unconditional and must not come and go with the load it helps you reach); the
  situations layer honours negation, which Hoarder needs because its penalty
  applies while its own condition does *not* hold; and Hoarder is wired.
  **Still true:** 11 of 233 perks/traits carry mechanics. The rest are text by
  design or unaudited — a content pass, tracked below as D4.
- [x] **Faulty programming had no cure** (pg 90). It is stored in the addiction
  list and contracted by the same check, but `addictionRecoveryWeeks` is
  abstinence and a robot does not abstain, so a faulty robot was stuck forever.
  `clearFaultyProgramming` spends 5 circuitry against a DC 20 Crafting check —
  and spends it on a failure too, which is what the rule actually says.

- [x] **D4. Audit the other 222 perks/traits for mechanics.** *Done: 11 → 33.
  The audit found the ratio was largely a capability limit, not a judgment —
  and specifically that `bonusKeyFor()` rejected the three-segment scoped
  advantage paths (`advantage.checks.radiation`) that the character model
  already stores and reads. `CHECK_SCOPES` had been added for exactly those
  perks and none could be emitted. One regex; eight more entries. Toughness
  rank 2 (a repeat-only clause, and there is no perk-rank field) and
  Trailblazer's Instinct (a once-per-day roll, not a standing scope) stay text
  on purpose. The remaining (d) list — formula-valued bonuses, an attack-only
  bonus path, missing conditions like "below half HP", condition conjunction —
  is real scope, recorded in PERK-TRAIT-NOTES.md §6.* Only 11 carry an
  Active Effect. Many are legitimately text (target-conditional grants stay
  text by long-standing ruling), but that ratio has never been audited against
  the book now that conditional effects are expressible. Do it as a read of
  `packs-src/V21-NOTES-perks.md` against the emitter's capabilities, and expect
  the answer to be "most are correctly text, some are not".

## Landed 2026-08-14 — the review of the D3 batch, all nine findings

One of them had been shipped for months and had nothing to do with D3; the
other eight were introduced by the batch under review. Each has a smoke step
that names the wrong behaviour it replaced.

- [x] **`critChance: 0` was clamped to 2, so four weapons crit on almost every
  attack.** `WeaponData.critChance` carried `min: 2` — the floor a *printed*
  chance stops falling to under mod stacking — while `packs-src` uses 0 as the
  "prints no critical hit" sentinel for Flamer, Missile Launcher, Fat-Man and
  Cryolator. Foundry cleaned all four documents up to 2 on load and
  `critThreshold` subtracted half the Luck modifier from that, announcing a
  critical hit with an empty multiplier. Schema now allows 0; `critThreshold`
  returns `CRIT_IMPOSSIBLE` before doing arithmetic with it; `rollAttack`'s
  sneak clause, which grants a crit outright and never reads the threshold, is
  gated separately. Verified live in the deployed bundle before the fix.
- [x] **`rollDamage` granted the capacitor bonus `rollAttack` had refused.**
  The attack gated on the weapon tracking a magazine (a capacitor is priced in
  rounds); the damage roll asked only whether a capacitor was attached. One
  `payableCapacitor` now answers for both.
- [x] **An invisible hider was reported as heavily obscured.** The Hide marker
  stored one boolean — full cover or not — and `sneakAttackPosture`
  reconstructed the rest as "full cover, or else heavily obscured", sending the
  table to pg 118 where pg 134 applies. The marker records the concealment
  `canHide` accepted; the old reconstruction survives only for markers written
  before the field existed.
- [x] **The tracking mark wrote to an actor the player usually cannot own.**
  `markTarget` creates an ActiveEffect on the *target* — the only sheet an
  "attacks against this creature have advantage" effect can live on — and
  `rollAttack` deletes it in its tail. For a non-GM both are permission
  rejections, and the one in the tail would have taken Help, the limb follow-up
  and the injury down with it. Both ends check ownership and report.
- [x] **The mark note claimed an advantage the roll never had.** It printed
  unconditionally, but the mark only requests advantage from a *normal* roll —
  and it is spent either way, so a declared advantage or disadvantage now gets
  a note saying the 6 AP bought nothing.
- [x] **Speedloader had no consumer**, and **two `character-sheet.ts` call
  sites passed no mod keys** — see D3-handoff-rest below.
- [x] **Blind Attack DC** was `5 + floor(feet/5)` — 11 at 30 ft where pg 128
  prints `5 + feet rounded to 5`, which is 35.
- [x] **The mod AP clamp bounded the total, not the change**, so a mod that
  raised AP could lower it past the printed cost.
- [x] **Two docstrings outlived the handoff that invalidated them**
  (`rules/weapons.ts` and `actions/blocking.ts` both still described
  `WeaponData.keywords` as reading the printed column alone). `blocking.ts` now
  asks the weapon instead of calling `weaponKeywords` around it.

## Landed 2026-08-14 — the four gaps from the v2.1 coverage audit

An external read of the system against both delta documents found four things
missing. All four verified against the code before implementing, and all four
against the PDFs where the book had to settle a question.

- [x] **G1. Short Circuit was a counter with no clock** (pg 135) — the only one
  of v2.1's three new conditions that was half-built, and the robot/Gen-2-Synth
  analogue of Bleeding, whose identical twin ticked forty lines away in the same
  function. Only the −1 max AP per level had shipped. Now: the `1d12`-per-level
  electricity tick at the start of the turn, the clear-on-dying rider, the
  double-on-becoming-wet clause, the clear-on-healed-to-full clause, and the
  6 AP re-route button. Four rulings recorded at `SHORT_CIRCUIT_DAMAGE` — the
  damage lands on hit points directly like Bleeding's rather than through the
  attack pipeline; the *type* is still real, so a Robobrain's NeuroTransmitters
  vulnerability doubles it; one die per level; and "start dying" is checked
  after the tick, since a tick that drops you to 0 is the case the sentence
  describes. The wet clause fires on the dry→wet *transition*, or a creature
  standing in the rain would double every round.
- [x] **G2. The Frightened check was complete, correct, and unreachable.**
  `rollFrightenedCheck` implements all of v2.1's rework and nothing called it —
  a GM could only reach it from a macro. A control now lives in the combat
  panel, asking for the DC (`8 + the frightening creature's Intimidation`, which
  this system cannot derive because that creature may not be on the canvas) and
  the Endurance-or-Charisma election the book gives the player.
- [x] **G3. Eyes/head targeted attacks now halve the weapon's range** (pg 129).
  The printed cell — *"to hit ranged attack modifier is halved"* — is genuinely
  ambiguous between the attack bonus and the range multiplier. The v2.1 patch
  notes settle it: *"Attacking the eyes and head now halves the range of the
  weapon."* Recorded with the caveat that the very next patch-note line is
  exactly backwards against both books, so the notes are used here only because
  the book is ambiguous rather than contradictory.
- [x] **G4. Death saves carried no condition penalty and elected for you.**
  `rollDeathSave` was the one d20 roll in the system that never called
  `d20Modifiers`, against fourteen call sites that do — so no leveled penalty
  and no perk `d20Bonus` ever reached one, and the Luck exemption was satisfied
  by accident rather than by rule. Both fixed. The election is the player's now,
  as pg 133 prints it ("your Luck **or** Endurance modifier", no tiebreak); the
  default compares the *effective* totals rather than the raw modifiers, because
  Luck ignores the leveled penalties and a starving character can be better off
  electing the smaller number.

- [x] **G5. The pg 129 limb conditions were printed and never applied.** The
  last entry on either delta document's impact list that was text and only text:
  the attack rolled its d4, posted the sentence the table prints, and stopped.
  v2.1's whole rework of that table lived on a chat card — "until the end of the
  target's next turn" becoming two turns, the head/torso/groin AP loss becoming
  a standing −2/−3, and the leg row's 30/20/15 ft caps.

  `rules/targeted-conditions.ts` holds the realisation (28 entries, keyed by the
  pg 129 *row* so a jet engine and a set of rollers borrow the leg row's the way
  their text says); `actions/targeted-conditions.ts` writes it.

  **Nothing applies itself.** The whole table is conditional on the damage
  reaching hit points, which does not exist as a fact when the attack rolls the
  d4 — so the card carries a GM button, exactly like Apply Damage and for the
  same reason. Two new paths were needed underneath it: `bonuses.attack`, a flat
  modifier that reaches attack rolls and *not* skill checks (writing the five
  "−N to all attack rolls" entries through `d20` would have docked the target's
  ability checks and death saves with them), and `bonuses.moveCap`, which is the
  first bonus in this system that composes by taking the **lower** — so it
  initialises at a sentinel rather than at 0, because `downgrade` against 0 can
  never fire.

  Four rulings worth naming. The three "−N AP for two turns" rows are realised
  as a change to the AP *ceiling*, which is not the pool E1 declines to track.
  "Two turns" is N combat rounds on the target, and outside initiative there is
  no clock — the effect then sits until removed, which is what every marker in
  this system does. Prone is a toggle and not part of the effect, because a
  creature is prone until it stands up. And three entries write nothing on
  purpose: torso 1-2 are the book's own blank, and arm 1 needs a hand model that
  does not exist. Object 1-4 also act on a held item the limb picker never
  names — they are handled by asking (G7).

  Set Bone (pg 86) finally has something to remove — that branch used to say in
  as many words that Broken Arm was stored in no field. "Broken Leg" is still
  not a thing: pg 86 names it and no entry in the book defines it, and Leg
  Cripple is not it under another name, since a full heal is Leg Cripple's
  trigger and the Set Bone paragraph never mentions one. Thirteen smoke steps,
  two of which exist only to prove delivery paths — the `updateActor` full-heal
  hook, and the flag the Apply button is built from.

- [x] **G6. The NPC sheet's condition track never got the fix the character
  sheet did.** `npc-sheet.hbs` still rendered every leveled condition with a
  hardcoded `min="0" max="10"` — the same defect reported and fixed on the
  character sheet earlier the same day. `FalloutNpcSheet` overrides only `PARTS`
  and `DEFAULT_OPTIONS`, so it was already being handed the corrected context
  (a per-condition `max`, `null` for Short Circuit, and a `floor` for
  disease-locked levels) and simply ignored both. Short Circuit doubles on
  becoming wet with no printed cap (pg 135), so a creature legitimately holds
  more than ten levels; the flat ceiling stored such a value fine and then
  refused to let a GM type it back in.

  **Fixed structurally rather than by copying the corrected line.** The row now
  lives in one partial, `parts/condition-track.hbs`, included by both sheets and
  registered through a new `sheetPartials()` beside `panelTemplates()` — a
  partial that is shared markup rather than a panel, since it has no id and no
  context of its own. The NPC statblock gains the lock affordance on
  disease-floored conditions as a result, which is the point: two sheets showing
  the same data are not allowed to disagree about it.

  **Why it recurred is the part worth remembering.** The original character-sheet
  fix shipped with *no assertion at all* — nothing in the suite would have gone
  red for either copy. Three steps now read the rendered attribute on **both**
  sheets (asserting the context would have passed throughout, because the
  context was never the broken half), and they were run against the unfixed
  build first to prove they go red: `{npc: uncapped false, character: uncapped
  true}`, 574 passed / 1 failed. A fix whose test has never been seen failing is
  a fix that has not been tested.

- [x] **G7. The object row was printed and never applied, because nothing knew
  which object.** All four faces of the pg 129 object row act on a specific
  carried thing — two levels of decay, or the object flying one foot / 1d4 × 5
  feet away — and an attack names a limb. So all four were `manual`, the card
  offered no Apply button at all, and the row was the last of the table still
  resolved entirely at the table.

  **The missing fact is asked for, not guessed.** "Whatever they are wielding"
  is wrong the moment the shot was aimed at a lantern or a Pip-Boy, so the apply
  path takes an `ObjectPicker` and the chat button injects a `DialogV2` that
  lists the target's weapons, armor and gear, equipped first. c4's "choose
  condition 1, 2, or 3" is a second select on the same prompt, and the chosen
  face resolves through the same table rather than a second copy of the numbers.

  **Three rulings.** Decay goes through `decayItem`, the choke point, so Super
  Mutant Bulky (pg 12) and the decay cap both reach this without the object row
  having heard of either. "Flies away" writes `equipped: false` — the same kind
  of write as the `prone` toggle, a state the book puts the target into and the
  player reverses in one click — and where an item has no equip state at all
  (gear is carried, never wielded) the card says so rather than silently doing
  nothing. And **none of it is a damage or an AP write**, so E1 is nowhere near
  this.

  The picker lives in `sheets/object-picker.ts` and is injected rather than
  imported: `actions/` has never opened an `ApplicationV2` and does not start
  here, and a parameter is also the only reason the smoke suite can drive the
  row at all — seven steps do, including the one that would have gone red on
  every prior build (the row is now offered a button), a 1d4 × 5 distance that
  must be one the die can produce, and two steps asserting that an already-maxed
  item and a dismissed prompt both report `applied: false` instead of claiming a
  write.

## Landed 2026-08-14 — the rest of D2, and the mods UI

- [x] **Crafting and repair actually spend their materials now.** D2 shipped
  junk as documents and wired three report-sites (first aid's cloth,
  reattachment's steel and circuitry, fuel's oil), leaving the two the backlog
  entry itself named. `craftItem` had always *computed* the true cost —
  `materialsSpent` resolves the failure tiers, the succeed-by-8 discount and the
  minimum of one exactly — and always merely printed it. `repairItem` never even
  parsed its blueprint; it printed a generic "spend what the Encyclopedia
  lists". Both now go through `spendRecipeMaterials`, after the roll resolves,
  never blocking. Three rulings, because the Encyclopedia's cells are prose:
  a cell printing **"or" spends nothing** (`parseMaterials` splits on it, so
  both branches arrive countable — charging both bills the choice twice,
  charging the first picks a branch for the player); **"crafting material" is
  spent literally, never substituted** for other junk, because reading the
  book's own generic as "any junk" is a house ruling this system will not make
  silently; and **a material with no shipped document is reported apart from a
  shortfall**, since the ~40 found-object lines are correctly unpayable and
  folding them in would make a working recipe look broken every run. Repair
  halves on failure, rounded down, as printed. Five smoke steps.

## D. Content gaps — data work more than code

- [x] **D1. Unique items** (pg 91) — *audit error: these already shipped in b07a795; the backlog grep covered src/ but not packs-src/. Nine items (incl. Two-way Radio and both Electronic Lockpicks), costs/loads verified against a fresh page extraction; "Not automated:" caveats and smoke coverage added. The "129 unmatched blueprint rows" figure was also stale — it is 4, all genuinely unstocked recipes.*: Pip-Boys (4 models), Stealth Boy, Vault
  Suit, lockpicks have **no item documents** — they exist only as blueprint
  rows, which `build-packs.mjs` drops. Add them to `packs-src/gear.json` with
  their pg 91 text; Stealth Boy's invisibility stays text until C4's Stealth
  Field establishes the pattern. (Of the 129 blueprint rows with no matching
  item, most are upgrade/mod rows that are *correctly* not items; the pg 91
  uniques are the real gap.)
- [x] **D2. Junk as documents.** *Landed 2026-08-13: the censused junk list ships
  as gear documents (`packs-src/junk.json`), `consumeJunk` is the never-blocking
  seam, and three report-sites are wired — first aid's cloth, reattachment's
  steel+circuitry, fuel's six oil. The pack build's unmatched-blueprint count
  dropped 4 → 0. Remaining report-sites, in order (full notes in the D2
  integration doc): `craftItem` (needs a substitution ruling for the 284
  "crafting material" cells and the or-alternatives), `repairItem` (same
  judgment calls, plus the failed-repair halving). **The "Mysterious Serum
  (pg 88)" this entry once listed as a fifth junk-spending rule does not
  exist** — the phrase appears in none of the three PDFs. The rule at pg 88 is
  Faulty Programming, which `clearFaultyProgramming` already implements, and
  the invented name had also shipped in `packs-src/junk.json`'s circuitry
  description where every table could read it. Both corrected 2026-08-14. Food/drink ingredients deliberately stay `aid`, not junk;
  junk ships `cost: 0, load: 0` because the book prints neither — so Hoarder's
  50-load threshold ignores junk until a table sets loads by hand.* Nothing in the system is junk: crafting,
  repair, first aid (cloth), and C2/C3 above all *report* material costs
  because there's nothing to consume. Decide a shape (probably one `gear`
  subtype with a `junkType`), ship the pg 94+ junk list, then teach the
  existing report-sites to optionally consume. This unblocks the "materials
  actually spent" half of crafting.
- [~] **D3. Weapon mods — foundation and the Silencer slice landed.** *The
  backlog's page range was wrong (it is pg 65 melee, 75-77 ranged) and all 31
  mods already shipped as gear documents; the gap was no machine-readable key,
  no place on the weapon, and no rules layer. Now: `WeaponData.attachedMods`
  (a validated flag set beside the untouched free-text `mods`, mirroring
  `ArmorData.upgradeRanks`), `src/rules/mods.ts` with an `automation` column
  copied from POWER_ARMOR_UPGRADES' honesty (1 partial, 30 text), and the
  Silencer read end to end so `AttackOptions.silenced` is an override rather
  than the only source. The remaining 13 slices are in the scratchpad's
  d3-remaining.md — slice 2, a weapon-statistic derivation, unlocks ~20 rows.*
- [x] **D3-handoff — done.** `WeaponData.keywords` now calls
  `weaponKeywords(this.special, this.attachedModKeys)` and `reloadCost` passes
  the keys, so every existing consumer sees mod-granted properties.
- [x] **Blind Attack has a caller — done 2026-08-14** (pg 128). The gate lives
  in `rollAttack`, before the magazine is touched, because the paragraph says an
  attack in those conditions *is* a blind attack rather than may be one.
  `blindAttackApplies` reads the attacker's Blinded condition and the target's
  concealment, reusing `targetingThroughConcealment` so the Infrared Scope's
  exemption and total cover's refusal are not re-derived. **Spray and Pray**
  (pg 49) now has the check it was wired onto: advantage arrives on its Active
  Effect, and the DC halving is looked up by perk name. Rulings recorded with
  the code: an invisible target is pg 134's disadvantage and not a blind attack;
  the scope does not rescue a blinded attacker; a halved DC rounds down; no
  declared distance means no DC, so the shot is refused rather than given a DC 5
  it did not earn. `AttackOptions.concealment` and a dialog checkbox exist
  because darkness is the one concealment with no document behind it.
  `rollAutomaticBurst` now takes and forwards `AttackOptions` (it took none),
  which also gave the burst control cover and the range bands for the first
  time; the capacitor is deliberately not forwarded to the free shots.
- [x] **D3-handoff-rest — done 2026-08-14.** Both `character-sheet.ts` call
  sites pass `attachedModKeys`, so the Speedloader reaches a real document for
  the first time: the weapon list shows both prices and the Reload button says
  when the flat 4 AP would have been cheaper. `hasProperty` is exported from
  `mods.ts` and `weapons.ts`'s `hasPrintedProperty` twin is gone (the API name
  went with it — `api.hasProperty` now). `speedloader` moved `text` → `code`.
- [x] **D3-slice-1b / 10. The mods UI and the attach transaction — done
  2026-08-14.** `attachMod`/`detachMod` in `src/actions/mods.ts` spend the
  crafted document, price the swap off `swapMinutes`, surface every
  `modEligibility` clause on the card, and report the pg 75 ceases-function
  state. The panel is on the weapon's *item* sheet — slot readout, per-mod
  automation label, the printed-"or" picker, a fit/remove pair, and a picker
  that lists every row with the ineligible ones bulleted rather than hidden.
  Four rulings: eligibility is advisory and attaches anyway (the melee table
  hands it to the GM outright), exceeding six slots is reported not refused, a
  missing document does not block, and a detached mod comes back as a document
  (the column prints a time to *unequip* too).
- [x] **D3-cleanup — done 2026-08-14.** `scopeCloseRange` and
  `upgradedDamageBonus` now live beside `silences()` in `src/rules/mods.ts`.
  The capacitors stayed in `dice/rolls.ts` on purpose: `payableCapacitor` asks
  whether the *weapon* can pay, which reads `WeaponData` fields, and `rules/`
  does not import `data/`. `rollAutomaticBurst` takes and forwards
  `AttackOptions` (see the blind-attack entry above for why that became
  urgent). Also fixed here: **the `automation` column had drifted honest-but-
  stale in four rows** — both capacitors, On-Board Target Tracking and melee
  Upgraded were all labelled `text` while being coded end to end. The column is
  now 5 `code` / 10 `derived` / 10 `partial` / 6 `text`, and the six are the
  two turrets, Bayonet, Semi-Automatic (blocked on E1), and the two rows that
  grant a property with no hook.
- [x] **D3-slice-9. The two turrets — declined, and recorded as declined.**
  Both mount the weapon on a stand *"considered a robot with 25 hit points and
  an AC of 10"*, rolling its own combat sequence off the owner's Intelligence
  and taking 10 AP a turn. That is a second combatant spawned from an item — a
  new subsystem with its own initiative, not a mod clause — and it is two rows.
  They stay `automation: "text"`, which is exactly what that label is for.
  Reopen only if a table actually wants turrets.
- [x] **D3-rest — the column is complete and honest.** Every one of the 31 rows
  carries a declared `automation` level, and the audit that closed this item
  found the column had *under*-claimed in five places rather than over-claimed:
  both capacitors, On-Board Target Tracking and melee Upgraded were labelled
  `text` while being coded end to end, and the Silencer was labelled `derived`
  when its headline clause is coded and only its damage-rank drop is not. The
  column now reads **5 `code` / 9 `derived` / 11 `partial` / 6 `text`**, and the
  six are the two turrets and Bayonet (declined above), Semi-Automatic (blocked
  on E1 — AP is never deducted anywhere), and melee Strengthen and Sharpened,
  each of which grants a printed property that has no mechanical hook anywhere
  in the book's own rules. Nothing here is an unexplained gap any more, which is
  what this item was asking for.

## E. Deferred by design — do not pick up without the user saying so

- [x] **E1. AP deduction — the half-step, chosen 2026-08-15.** Asked directly,
  the user picked "pool shown, not enforced" over both the old report-only
  posture and full deduction. So AP is now **spent, reported, and never
  refused**: `combat/action-points.ts` is the choke point, every AP-costing
  action calls it, and nothing anywhere blocks an action for want of AP.
  `spendActionPoints()` — the one that *does* refuse — keeps its zero callers
  and is what full E1 would use.

  Three rulings live in that module's header. **Out of combat nothing is
  charged at all** (`actor.inCombat`, probed on 14.365), because AP is refilled
  by a turn beginning and outside initiative none ever does — a pool drained by
  an out-of-combat first aid check would sit at zero until the next fight. **A
  short pool spends to zero and says by how much the action overdrew**, rather
  than refusing. **The pool stays an ordinary editable field** the GM can
  overwrite mid-turn.

  This also un-fakes `endTurn`: the pg 58 Power Armor overheat check and the pg
  126 half-AP carry-over both read `turnStart` minus the pool, and both measured
  zero for as long as nothing spent.

  Wired at every site that prices an action: attacks (weapon AP + disease
  surcharge + one-handed penalty + the pg 129 targeted surcharge, all four of
  which the card already printed), the eight `stealth.ts` actions, grapple,
  escape, help, unarmed strike, blocking, all four movement paths through
  `sayMovementCard`, first aid's three, the stealth field, robot fuel and
  reattachment, mod attach/detach, aid use, Short Circuit's reroute, magazine
  reading, and seven power-armor actions. The AP constants with no executing
  action (reload, chems, throwback, disarm, detonator, death save) are reference
  data in `rules/` and have nothing to charge.

- [x] **E2. Migrations — declined 2026-08-15.** Asked directly, the user chose
  "never — this is a throwaway world". A schema change means rebuilding actors
  by hand. Do not build a migration framework without that decision being
  revisited out loud; the entry stays here so the *reason* is on the record
  rather than looking like an oversight.
- [ ] **E3. Difficult terrain / scene regions.** The rules model is correct
  and shipped; charging AP from painted scene regions needs the
  token-movement hook this project has twice declined (`situations.ts` has the
  argument). Revisit only with a design that doesn't write documents in
  response to document writes.
- **Never (book won't support it):** Spread's extra-hit resolution (book
  doesn't say whose roll), free-hand reload enforcement (no hands resource
  exists), crawling rate/cost and "off-balance" (unprinted). These are
  documented in ROADMAP.md; don't reopen them.

