# Changelog

Notable changes per release. Versions are the git tags releases are cut from; the same
version is stamped into `system.json`.

Page numbers cite the **Fallout TTRPG v2.1** rulebook by Arcane Arcade, except creature
statblocks, which stay v2.0-sourced because v2.1 omits that chapter.

## v0.34.0

First public release. The repository starts from a single commit; version numbering
continues from the internal history this changelog records.

- **The pg 129 object row is applied, not just printed.** The Apply button asks *which*
  carried object (weapons, armor and gear, equipped first), decay routes through the one
  decay gate so Super Mutant Bulky and the decay cap reach it, and "flies away" unequips the
  item — or says so when the item has no equip state.
- **AP is spent, not only printed.** Every priced action — attacks with all four surcharges,
  stealth, movement, first aid, power armor, mods, aid, magazines — charges the pool through
  one choke point. Nothing is ever refused for want of AP, a short pool spends to zero and
  reports the overdraw, and out of combat nothing is charged at all, because no turn ever
  begins to refill it. This also makes the Power Armor overheat check and the pg 126 half-AP
  carry-over measure real spending for the first time.
- Fixed: the NPC sheet's condition track kept a hardcoded 0-10 range the character sheet had
  already lost. Both sheets now render one shared partial, so Short Circuit's uncapped levels
  (pg 135) and disease-locked floors display identically everywhere.

## v0.33.x

- **The pg 129 limb conditions are applied, not just printed** — v2.1's rework of that table
  had lived on chat cards. A 28-entry realisation keyed by printed row (a jet engine borrows
  the leg row the way its text says), applied by a GM button because the whole table is
  conditional on damage reaching hit points. Two new bonus paths underneath: `attack`, a flat
  modifier that reaches attack rolls but not skill checks, and `moveCap`, the first bonus
  that composes by taking the lower. Set Bone (pg 86) finally has a stored condition to
  remove.

## v0.32.x

- **Short Circuit got its clock** (pg 135): the per-level 1d12 electricity tick at turn
  start, doubling on becoming wet (on the transition, or rain would double it every round),
  clearing on dying and on a full heal, and the 6 AP re-route button. A Robobrain's
  NeuroTransmitters vulnerability doubles the tick.
- **The frightened check is reachable**: a combat-panel control takes the DC and the
  Endurance-or-Charisma election the book gives the player.
- **Eyes and head targeted attacks halve the weapon's range** (pg 129), following the patch
  notes where the book is ambiguous.
- **Death saves respect conditions and the player's election** (pg 133): the one d20 that
  never called the shared modifier path now does, and Luck-vs-Endurance is chosen per save,
  defaulting to the better *effective* total.
- Fixed: the tick rolled `N1d12` instead of `Nd12`; the wet clause raced the update that
  triggered it.

## v0.31.x

- **The weapon-mods UI and the attach transaction**: a panel on the weapon's item sheet with
  slot readout, per-mod automation labels, and a picker that shows ineligible rows rather
  than hiding them. Attaching spends the crafted mod document and prices the swap;
  detaching returns it. Eligibility is advisory, exceeding six slots is reported not
  refused.
- **Crafting and repair actually spend their materials**, resolving failure tiers and the
  succeed-by-8 discount. A cell printing "or" spends nothing (charging either branch would
  be a house rule), "crafting material" is never silently substituted, and materials with no
  shipped document are reported apart from a shortfall.

## v0.30.0

- **Blind attacks have a caller** (pg 128): the gate sits in the attack roll itself, reading
  the attacker's Blinded condition and the target's concealment — the Infrared Scope's
  exemption and total cover's refusal are not re-derived. Spray and Pray (pg 49) gets its
  advantage and halved DC. Automatic bursts now carry full attack options, which gives them
  cover and range bands for the first time.

## v0.29.x

- **Weapon mods have a foundation**: a validated `attachedMods` set on the weapon, a rules
  layer with an honest per-row automation column, and the Silencer read end to end.
- **The perk mechanics audit**: 11 → 33 perks and traits carrying real Active Effects. The
  ratio was largely a capability limit — the emitter rejected the scoped-advantage paths the
  character model already stored — not a judgment.
- Fixed, among nine review findings: four weapons that print no critical hit (Flamer, Missile
  Launcher, Fat-Man, Cryolator) were critting on nearly every attack — the schema's floor of
  2 turned their 0-sentinel into a threshold below the die.

## v0.28.x

- **Junk exists as documents** (41 of them), with a never-blocking consumption seam wired at
  first aid's cloth, reattachment's steel and circuitry, and fuel's oil.
- **Blindsight works on a live canvas**: the detection mode overrides both of core's darkness
  refusals — the detect gate and the collapsed vision polygon — while walls and the printed
  radius still apply.
- **Conditional effects actually fire**: the emitter could never write a condition flag, so
  no shipped perk or trait had ever used the situations layer. Hoarder (pg 32) is the proof
  case, including its negated condition. **Faulty Programming has its cure** (pg 90): 5
  circuitry against DC 20 Crafting, spent on failure too, as the rule says.

## v0.27.0

- **The Handy fuel clock** (pg 10): 6 AP to consume a gallon weekly, hourly DC 12 Endurance
  checks past 168 hours with the escalating DC, unconscious on failure; the fusion-reactor
  variant runs 30 days. GM-advanced, like every survival clock here.

## v0.26.0

- **The four declared robot traits are enforced** (pg 10-11): Reinforced Plating's DT,
  Slow's movement cap, All Terrain Rollers, and NeuroTransmitters — electricity
  vulnerability plus two rolled conditions on a head hit.
- **Super Mutant variant traits** (pg 12): Defective Strain and Nightkin, whose Stealth
  Field is the system's first invisibility with the per-day Perception cost.
- **Severed-limb reattachment** as a control: materials and time reported, 6 AP at zero HP.

## v0.25.0

- **Robot sub-types**: per-chassis limb profiles reaching the limb picker — a Handy has no
  head, its jet engine prices differently, Robobrain rollers cannot be severed.
- **Sneak attacks from posture**: hidden attacker plus surprised target is recognised
  automatically; an attack ends Hide and Take Cover unless silenced (pg 77).
- **Healing Powder heals over three rounds** as printed (pg 86), through the hit-point gate.
- **Super Mutant Superior Strength and Bulky**, with every decay gain routed through one
  gate. **Dodge**, magazine reading from the Use button, and 39 missing API exports.

## v0.24.x

- **Stealth, movement, progression, and backgrounds**: the pg 24/125-127 stealth actions
  with markers and passive-sense math, the movement actions with terrain surcharges
  reported, XP and level-up budgets, and the 20 printed backgrounds plus Custom — applied in
  one click with a ledger that reverses exactly what was granted.
- **Vision and fire**: light levels, senses, obscurement, and flames as spreading scene
  regions.
- Fixed: magazines granted nothing (`untilRest` was never written), and the movement rules
  were missing from the API.

## v0.23.0

- **Cover and range declared per attack** — total cover refuses before ammo is spent, and
  past long range only a natural 20 hits (pg 66 governs, not pg 21). **Ready** resolves per
  readied row, recycling half the spent AP when the trigger never fires.

## v0.19.0 – v0.22.0

- **Crafting** (pg 92, 94-115): 312 recipes carrying DC, materials and time; the bench is a
  sheet panel. **Grapple and Escape** as the v2.1 Unarmed-vs-Unarmed contest, **Help**
  (half the helper's modifier), unarmed strikes, and **first aid** (pg 21, 131) with the
  stabilise-DC contradiction ruled for pg 131 and the losing formula printed on every card.
- **Power Armor upgrades** (pg 59): the full table with per-row automation badges read off
  the table itself, so the panel cannot drift from it.
- **The sheet panel framework**, with first aid as the reference panel, then the
  combat-actions, Power Armor upgrade, and crafting bench panels.

## v0.18.0

- **Shock now blocks stamina regain** (pg 135). Every restoration runs through one gate, which
  also enforces the radiation lock (pg 124) — the two rules are independent and both apply.
- **74 consumables restore stamina for the first time**: the Bland, Tasty, Flavorsome,
  Delicacy and Invigorating properties (pg 83, 89), with the Ghoul half and nothing at all for
  Gen-2 Synths and Robots (pg 8-9).
- **Power Armor beyond the Defense Point pool** (pg 57-59): 6 AP to enter or exit, Fusion Core
  allotted time with the staged shutdown and the 5 AP core swap, Overheating with the Core
  Assembly thresholds, Fusion Core Targeting as a targeted attack, the decay bands driving
  radiation protection, and the Defense Point refill stopping at ten levels of decay.
- Fixed: Power Armor was taking ordinary armor's per-decay AC/DT penalty and load halving,
  though pg 57-58 exempt it from both. Fixed: emptying the Defense Point pool refilled it but
  let the overflow damage through to stamina, instead of absorbing it in the refilled pool as
  the book's own worked example shows.
- Packaging: MIT `LICENSE`, `NOTICE.md`, this changelog, and a manifest carrying no hostname
  so the same source can be published from anywhere.

## v0.17.0

- The **Item Blueprint Encyclopedia** (pg 94-115) joined onto the 465 shipped equipment
  documents at build time: craft and repair DCs, materials, and times.

## v0.16.0

- **Scoped advantage.** A grant can now name one skill or one of seven named checks (death
  save, radiation, addiction, encounter, resisting a grapple, resisting frightened, blind
  attack) rather than only a whole ability category — which is what most perk text actually
  does. The audit behind that claim is in `packs-src/V21-NOTES-advantage.md`.
- **Situational effects**: an effect can name the condition it waits on, and a Sync button
  reconciles them all against the character's current situation.
- New bonus paths for **initiative**, **Party Nerve**, and **Karma Caps**.
- **Temporary hit points** as a stored pool, spent ahead of everything else.
- **ProseMirror** editors on descriptions and biographies.
- Automatic (Switch) weapon mode tracking.

## v0.15.x

- **Weapon keywords**: Automatic *N* as free extra attacks, Spread's second-increment
  trigger, Two Handed's one-handed penalties, the reworked Manual Reload, Quick and Slow
  Reload, Unstable's five-reload decay clock, and Defensive feeding the block.
- **Blocking** and **sneak attacks**. Blocking is the first effect here that expires on a
  trigger rather than a clock.
- **Resting and the daily survival clock**, **decay repair**, and three survival trackers:
  irradiated levels, snack pairing, and the alcohol ladder.

## v0.14.0

- The v2.1 environment chapters: **20 diseases** with locked condition levels and multi-dose
  cures, **hazardous weather** as scene state with exposure clocks and lightning, the five
  **hazardous environments**, and **irradiated zone severity**.

## v0.13.0

- **AP economy** on the combat turn hook: recycling half of unused AP, Fatigue shedding a
  level, Bleeding biting at turn start and failing a dying creature's death save.
- Strength-requirement disadvantage, automatic encumbrance, blind attacks, and damage taken
  while dying costing a death save.

## v0.12.0

- The single perk whose advantage grant is genuinely unconditional (Blind Devil).

## v0.11.0

- **Advantage and disadvantage as Active Effects**, consulted by every roll path.
- Poisoned and Shock automated from token statuses; the v2.1 frightened check; four chem
  properties gained their mechanical half.

## v0.9.x

- Retargeted at **rulebook v2.1**: compendium re-extraction, the Luck exemption, Human
  Tenacity, targeted attacks, condition changes, Neuro-Stimulant.
- Corrected the effect-expiry model to let Foundry retire timed effects itself, rather than
  racing its clock-driven updates.

## v0.8.0

- **Active Effects engine** (`system.bonuses`, guided initial-phase changes), the perks and
  traits compendium, chems applying their own numeric buffs, effect UI on both sheets.

## v0.7.0

- Aid compendium, the chem limit and addiction workflow, hunger and dehydration relief, the
  local artwork override folder.

## v0.6.0

- Compendium artwork and Pip-Boy colour themes.

## v0.5.0

- NPC statblock sheet, the damage pipeline, death saves, targeted attacks, ammo and reload,
  Karma Caps, token statuses.

## v0.1.0 – v0.4.0

- Initial system: character and NPC actors with the full derived-stat engine, the seven
  item types, rolling from the sheet, and leveled conditions.
