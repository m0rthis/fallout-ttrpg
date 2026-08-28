# V2.1 Rules Extraction — Vision and Light (pg 118-119) and Flames (pg 118)

Source of truth: `FALLOUT TTRPG 2.1.pdf` (136 pp). PDF page N == printed page N (verified 1:1).
Method: `pdftotext -layout -f 118 -l 119` for the prose, **and both pages read visually** at 150 dpi
(`pdftoppm -r 150 -png`) — the extraction and the rendered page agree word for word. Neither rule is
in a table; the whole chapter is two-column prose. Patch notes consulted only as corroboration;
**the printed book governs**.

Two headline findings, one per section:

- **§1.4** — the book's cross-reference to Blinded is an **unfilled placeholder**: literally
  `(see page #)`. Same defect class as the "off-balance `(see pg #)`" already recorded in
  `V21-NOTES-stamina-terrain.md`.
- **§2.3** — "for every 20 additional feet a flaming area grows" is **genuinely ambiguous** about
  whether the twenty feet are measured outward or across, and the two readings differ by a factor of
  two in how fast the damage climbs. Ruled, not read.

---

# SECTION 1 — Vision and Light (pg 118-119)

## 1.0 The entire printed entry, verbatim

> **Vision and Light**
> *"Amazingly, they've still managed to outwit a half-blind arthritic ghoul."* - Raul Tejada
>
> A given area might be lightly or heavily obscured.
>
> In a **lightly obscured** area, such as dim light, patchy fog, or moderate foliage, creatures have
> disadvantage on Perception checks that rely on sight, their passive sense is reduced by 5, and their
> range with all ranged weapons is halved.
>
> A **heavily obscured** area—such as darkness, opaque fog, or dense foliage—blocks vision entirely. A
> creature effectively suffers from the ***blinded*** condition (see page #) when trying to see
> something in that area.
>
> The presence or absence of light in an environment creates three categories of illumination: bright
> light, dim light, and darkness.
>
> **Bright light** lets most creatures see normally. Even gloomy days provide bright light, as do
> flashlights, lanterns, fires, and other sources of illumination within a specific radius.
>
> **Dim light** creates a lightly obscured area. An area of dim light is usually a boundary between a
> source of bright light, such as a torch, and surrounding darkness. The soft light of twilight and
> dawn also counts as dim light. A particularly brilliant full moon might bathe the land in dim light.
>
> **Darkness** creates a heavily obscured area. Characters face darkness outdoors at night (even most
> moonlit nights), within the confines of an unlit cave or a powered down vault.
>
> **Blindsight**
> A creature with blindsight can perceive its surroundings without relying on sight, within a specific
> radius. Creatures without eyes and creatures with echolocation or heightened senses have this sense.
>
> **Nightvision**
> Within a specified range, a creature with nightvision can see in darkness as if the darkness were
> dim light, so areas of darkness are only lightly obscured as far as that creature is concerned.
> However, the creature can't discern color in darkness, only shades of gray.

## 1.1 The rule as a table

| Light level | Obscurement | Sight-based Perception | Passive sense | Ranged range |
|---|---|---|---|---|
| Bright | none | normal | — | — |
| Dim | **light** | **disadvantage** | **−5** | **halved** |
| Darkness | **heavy** | *automatically fails* (Blinded) | not printed | not printed |

Implemented at `src/rules/light.ts` — `obscurementOfLight`, `obscurementEffect`,
`LIGHT_OBSCURED_PASSIVE_SENSE = -5`, `LIGHT_OBSCURED_RANGE_MULTIPLIER = 0.5`.

## 1.2 Blinded, for the row above (pg 133, verbatim)

> **Blinded**
> A blinded creature can't see and automatically fails any ability check that requires sight. Attack
> rolls against a blinded creature have advantage. A blinded creature can attack creatures with a
> blind attack if they are aware of them.

So "heavily obscured" is *stronger* than disadvantage, not an extension of it: sight-based checks do
not roll at all.

## 1.3 What the book does NOT say, and what was decided

### 1.3.1 How two obscuring sources combine — **ruled**

Dim light *and* patchy fog is never addressed. The book's own examples list light, fog and foliage
together as alternative causes of the *same* degree, which is a hint but not a rule.

**Ruled: take the worst degree, never the sum.** The only sentence in 136 pages that states how two
protections of the same kind combine is the cover rule (pg 130): *"only the most protective degree of
cover applies; the degrees aren't added together."* Read here from the other side. Cited as a
precedent — the book never generalised it, and `src/rules/cover.ts` already says so in its docstring.
`worstObscurement()`.

### 1.3.2 The −5 and the halved range are printed **twice** — **ruled**

Pg 118 gives −5 passive sense and halved ranged range for any lightly obscured area. The weather
chapter (pg 121-123) then prints *its own* sense and range figures for Fog (−8), Blizzard (−6/−10),
Dust Storm (−10/−15) and the rest. Those are the same rule stated a second time for a named weather,
not a second penalty stacked on the first.

**Ruled: take the harsher figure, do not add them.** `worseSensePenalty()` / `worseRangeMultiplier()`
exist for exactly this, and `src/actions/light.ts` reads the weather chapter's own bands
(`obscuredBeyondFeet`, `blindBeyondFeet`) out of `src/rules/weather.ts` rather than restating them.

### 1.3.3 Heavily obscured has no number — **left absent, deliberately**

The book gives a passive-sense figure and a range multiplier only for the light degree. Heavy is
"blocks vision entirely". Those two keys are therefore **omitted** from `obscurementEffect("heavy")`
rather than filled with a guess — a −5 on the heavy row would make the worse degree read as milder
than it is, and Blinded is a categorically different thing.

### 1.3.4 Neither sense has a printed radius — **0 means "does not have it"**

Blindsight is "within a specific radius"; Nightvision is "within a specified range". Neither is ever
given a number, and the chapter that would have supplied them per-creature is the creature chapter
v2.1 omits (this system's statblocks are still v2.0-sourced for that reason). So the ranges are
declared per character and default to 0.

### 1.3.5 What Blindsight's radius actually *is* — **ruled**

The book says only that the creature "can perceive its surroundings without relying on sight". It
never says what its effective obscurement is inside the radius.

**Ruled: unobscured inside the radius, nothing at all outside it.** It is the only reading under
which a creature "without eyes" — the book's own example — can function, and the outside half *is*
printed ("within a specific radius"). `blindsightReaches()`.

### 1.3.6 What Nightvision does **not** do — read straight, worth stating

Two things fall out of the sentence naming *darkness* specifically, and both are easy to get wrong:

- It does **not** help against fog, foliage, or the weather chapter's bands. A Nightvision creature in
  an opaque fog is exactly as blind as anyone else.
- It does **not** promote darkness to bright light. Darkness inside the range is **dim**, so the −5,
  the halved ranged range and the disadvantage on sight-based Perception all still apply inside it.

`nightvisionObscurement()` implements both.

## 1.4 The defect: an unfilled cross-reference

The heavily-obscured paragraph reads *"suffers from the **blinded** condition (see page #)"* — the
placeholder was never filled in. Blinded is on pg 133. This is the same defect as the "off-balance
`(see pg #)`" recorded in `V21-NOTES-stamina-terrain.md`, and is noted here so the next reader does
not go hunting for a page called `#`.

---

# SECTION 2 — Flames (pg 118)

## 2.0 The entire printed entry, verbatim

> **Flames**
> When a flammable object is lit aflame via a flamer, incendiary grenade, or a rogue flare; fires begin
> to spread. When an area is engulfed in flames, any creature who moves through the area or starts
> their turn in the area takes **2d10 fire damage and gains Burning**. At the start of each round, the
> flaming area **spreads 5 feet in all directions**, increasing the size of the area. *The spread of
> the flames is up to GM's discretion. There are factors that could allow flames to spread slower, such
> as winds, rain, or if the flames are surrounded by non-flammable objects.* These flames can last
> upwards to a few hours unless put out via **water, weapons that deal cryo damage, or a fire
> extinguisher**. The larger a flaming area gets, the more damage it deals. **For every 20 additional
> feet a flaming area grows, its damage is increased by 1d10 to a maximum of 50d10.**

And the condition it inflicts (pg 133, verbatim):

> **Burning**
> A burning creature takes 1d10 fire damage at the start of their turns. They can spend 6 AP to put
> themselves out.

## 2.1 The numbers

| Quantity | Value | Constant |
|---|---|---|
| Damage of a freshly lit area | **2d10** fire, plus Burning | `FLAME_BASE_DICE` |
| Spread | **5 ft in all directions** per round | `FLAME_SPREAD_FEET_PER_ROUND` |
| Damage growth | **+1d10 per 20 ft** grown | `FLAME_FEET_PER_EXTRA_DIE` |
| Ceiling | **50d10** | `FLAME_MAX_DICE` |
| Duration | "upwards to a few hours" — no number | — |
| Put out by | water, cryo damage, a fire extinguisher | `FLAME_EXTINGUISHERS` |

## 2.2 What the book does NOT say

### 2.2.1 How big a newly lit area is — **declared, not defaulted**

"When an area is engulfed in flames" is the only description of its extent, and a flamer, an
incendiary grenade and a dropped flare plainly do not light the same amount of ground. `FlameArea`
therefore carries an `originRadiusFeet` declared by whoever lights it, defaulting to one five-foot
space — the smallest area the book's own movement and spread rules can measure.

### 2.2.2 Whether a creature that both moves through and starts its turn in the area is hit twice

Not addressed. Nor is whether crossing a larger area costs more than crossing a small one.
**Ruled: once per press, per creature.** `burnFlameOccupants` is a button, so how often it is called
stays with the GM; charging twice would be inventing a rule.

### 2.2.3 What "put out" costs

No DC, no quantity of water, no action cost, for any of the three means. `extinguishFlames` therefore
takes the means as a label for the chat card and **rolls nothing**.

### 2.2.4 How many levels of Burning

"gains Burning" — Burning is a binary condition in this system (`BINARY_CONDITIONS`), not a leveled
one, so there is nothing to count.

## 2.3 The ambiguity that matters: 20 feet measured **how**? — ruled

> "For every 20 additional feet a flaming area **grows**, its damage is increased by 1d10"

The area spreads **5 feet in all directions** per round. That is 5 ft *outward* per round, which is
10 ft *across* per round. So:

| Reading | 20 ft is reached every | Damage at 25 ft outward (4 rounds) |
|---|---|---|
| **Outward** (radius) — *chosen* | 4 rounds | 3d10 |
| Across (diameter) | 2 rounds | 4d10 |

**Chosen: outward.** Two reasons, both textual rather than mechanical:

1. "grows" answers the immediately preceding "spreads 5 feet in all directions", which is itself an
   outward measure — the sentence is the continuation of that one.
2. 20 is an exact multiple of that printed 5, so the outward reading makes the growth land on whole
   rounds without remainder.

The across reading is defensible: the intervening clause is "increasing the size of the area", and
"size" is a width word. It is recorded here so the ruling is auditable, and a table that prefers it
only has to halve `FLAME_FEET_PER_EXTRA_DIE`. `flameDamageDice()` carries the same note.

## 2.4 Deliberately GM-driven, not hooked

The spread rate is the one thing the book explicitly refuses to fix: *"The spread of the flames is up
to GM's discretion. There are factors that could allow flames to spread slower…"* So
`spreadFeetPerRound` is a field on the area rather than a constant, and `spreadFlameAreas` is a button
rather than a `combatRound` hook. A fire that grew itself on a hook would be enforcing a rate the book
declines to state — and would be the same write-documents-on-a-document-event shape that produced this
project's one production bug.

---

# SECTION 3 — Foundry v14 findings (for `docs/foundry-v14-notes.md`)

**I do not own that file.** Everything below was verified empirically on build **14.365** by driving a
Puppeteer session against the live server, in the pattern the working agreement requires. Copy it
across.

## 3.1 `TokenDocument#detectionModes` is a `TypedObjectField` in v14, not an `ArrayField`

This is the single fact that made token-level vision look out of reach, and it is a v14 change:

```js
// v11-v13, and every example still on the internet — SILENTLY DISCARDED on v14
detectionModes: [{ id: "basicSight", enabled: true, range: 40 }]

// v14: a TypedObjectField keyed by mode id. The element schema is {enabled, range} — no `id`.
detectionModes: { basicSight: { enabled: true, range: 40 } }
```

The array form does not throw, does not warn, and does not appear in the console. It is cleaned away
to `{}`, and the token keeps whatever vision it had. Probed: writing the array form left
`_source.detectionModes === {}` on three separate attempts before the shape was identified.

The field also **accepts any key**. An unregistered id (`notARealMode`) persists to `_source` and to
the prepared document, and is simply never consulted by anything — no error, silently inert.

## 3.2 Detection ranges are in scene distance units, not pixels

`DetectionMode#_testRange` (read off the running client):

```js
_testRange(visionSource, mode, target, test) {
  const range = mode.range;
  if ( range <= 0 ) return false;
  if ( range === Infinity ) return true;
  ...
  const radius = visionSource.object.getLightRadius(range);
```

So "blind beyond 40 ft" is literally `range: 40`. `range: 0` detects nothing; `range: null` is
normalised to `Infinity` by `prepareBaseData` and means unlimited.

## 3.3 A distance cutoff must cap `lightPerception` as well as `basicSight`

`TokenDocument#_prepareDetectionModes`:

```js
_prepareDetectionModes() {
  for ( const mode of Object.values(this.detectionModes) ) {
    mode.enabled ??= true;
    mode.range ??= Infinity;            // a null value is treated as unlimited range
  }
  if ( !this.sight.enabled ) return;
  this.detectionModes.lightPerception ??= {enabled: true, range: Infinity};
  this.detectionModes.basicSight ??= {enabled: true, range: this.sight.range};
}
```

`basicSight` tracks `sight.range` only while **absent**; an explicit entry wins. And
`lightPerception` defaults to **unlimited**, so capping `basicSight` alone still leaves any *lit*
target visible at any distance — precisely the case a dust storm is meant to hide. Cap both.

Corollary, and it is a rules-accurate one rather than a workaround: the split is pg 118's own
distinction. Darkness "blocks vision entirely", but a lit thing standing in darkness is by definition
not in darkness. `sightFeet: 0` with `lightPerceptionFeet: null` is exactly "sees the lantern across
the dark room and nothing else".

## 3.4 **This system's Blinded status does nothing to Foundry's vision** — a live defect

`CONFIG.specialStatusEffects.BLIND === "blind"`, and every sight-typed detection mode gates on it:

```js
if ( isSight && src.hasStatusEffect(CONFIG.specialStatusEffects.BLIND) ) return false;
```

Core ships its own `blind` status. This system registers **`blinded`** (`src/fallout.ts`), because the
`init` filter refuses any id core already ships. Verified live on a token carrying this system's
Blinded status:

```
tokenHasCoreBlind: false     ← core does not think this creature is blind
tokenHasOurBlinded: true
```

So a Blinded creature currently sees perfectly on the canvas. `CONFIG.specialStatusEffects` is a plain
writable object (verified), so the fix is one line at `init`:

```js
CONFIG.specialStatusEffects.BLIND = "blinded";
```

The same trap applies to `INVISIBLE` (`"invisible"`), `BURROW`, `HOVER` and `FLY`: any system that
renames a status core keys behaviour off must remap `specialStatusEffects` to match.

## 3.5 Vision modes, and the one that matches Nightvision

`CONFIG.Canvas.visionModes`: `basic`, `darkvision`, `monochromatic`, `blindness`, `tremorsense`,
`lightAmplification`. `TokenDocument#updateVisionMode(id, defaults = true)` is the supported writer and
throws on an unknown id.

`darkvision`'s shipped `vision.defaults` include `saturation: -1` — greyscale. That is pg 119's
"can't discern color in darkness, only shades of gray", for free.

Custom modes register fine: `CONFIG.Canvas.visionModes.myMode = new foundry.canvas.perception.VisionMode({...})`
round-tripped onto a token and back.

## 3.6 Core ships no Blindsight, and why the three near-misses all fail

| Mode | Class | `type` | `walls` | Why it is wrong |
|---|---|---|---|---|
| `feelTremor` | `DetectionModeTremor` | MOVE (2) | false | only finds things on the ground; flying/hovering are exempt |
| `senseAll` | `DetectionModeAll` | OTHER (3) | **false** | sees straight through walls |
| `seeAll` | `DetectionModeAll` | SIGHT (0) | true | **sight-typed, so it switches off when its owner is Blinded** — the one creature blindsight exists for |

A correct one is a subclass with `type: OTHER`, `walls: true`, and `_canDetect` returning `true`
unconditionally (the base implementation refuses when `walls && visionSource.blinded.darkness`).
`foundry.canvas.perception.DetectionMode` is subclassable and `CONFIG.Canvas.detectionModes` is
writable at runtime — both verified, with a token round-tripping a custom mode id.

## 3.7 Regions beat MeasuredTemplates for an area that changes size

`MeasuredTemplate#update({distance})` **silently refused to take** on 14.365: `distance` stayed at its
created value in the document, in `_source` and in the collection, with no error and no console
message. Tried twice, once per probe.

`RegionDocument` does everything the template was wanted for and more:

- `shapes` is a `ShapesField` of `TypedSchemaField` over `rectangle | circle | ellipse | emanation |
  cone | ring | line | polygon | token | grid`. A `circle`'s `radius` **updates in place** (100 → 300 →
  400 px, verified) — which is what a spreading fire needs every round.
- **`region.tokens` reports the token documents standing inside it**, maintained server-side and
  populated even on a scene nobody is viewing. That is how the fire finds who it burns with no
  geometry of our own. Verified with a token at the circle's centre.
- Shape coordinates are in **pixels**: `px = feet / scene.grid.distance * scene.grid.size`.
- v14 ships twelve `RegionBehavior` types: `adjustDarknessLevel`, `applyActiveEffect`, `changeLevel`,
  `defineSurface`, `displayScrollingText`, `executeMacro`, `executeScript`, `modifyMovementCost`,
  `pauseGame`, `suppressWeather`, `teleportToken`, `toggleBehavior`. Two are worth remembering for
  later chapters: **`modifyMovementCost`** (`difficulties: {walk, fly, swim, burrow}`) is the missing
  half of the deferred **difficult terrain** item, and **`defineSurface`** carries booleans for
  `light`, `move`, `sight`, `sound`, `occlusion` and `exposure`.

None of them is used here: `applyActiveEffect` only creates and deletes effects on enter/exit, and the
flames need a *rolled* 2d10 that scales, so the damage stays on a button.

## 3.8 Scene illumination: `globalLight.bright` is the "dim everywhere" knob

`scene.environment.globalLight` is a schema with `{enabled, alpha, bright, color, coloration,
luminosity, saturation, contrast, shadows, darkness:{min,max}}`, and `environment.darknessLevel` is an
`AlphaField` (0-1). The mapping used, all three written and read back:

| Book level | `globalLight.enabled` | `globalLight.bright` | `darknessLevel` |
|---|---|---|---|
| Bright light | `true` | `true` | `0` |
| Dim light | `true` | **`false`** | `0` |
| Darkness | `false` | — | `1` |

`globalLight.bright: false` is the setting most systems miss: it lights the whole scene at *dim*
intensity, which makes "dim light creates a lightly obscured area" a real canvas state rather than an
approximation with a darkness slider.

## 3.9 Token vision overrides are exactly reversible

`_source` is the authored data; the prepared document is `_source` plus core's defaults. Snapshotting
the prepared values would write core's defaults back as if a person had chosen them, so snapshot
`token._source.sight.range` and `token._source.detectionModes`. Restoring uses the `-=key` deletion
syntax inside the `TypedObjectField`, and `flags.<scope>.-=<key>: null` to drop the snapshot:

```js
{ _id, "sight.range": saved, detectionModes: { "-=basicSight": null, "-=lightPerception": null },
  "flags.fallout-ttrpg.-=visionBefore": null }
```

Verified: after this, `basicSight` is back to tracking `sight.range` and `lightPerception` is back to
unlimited, both recomputed by core rather than stored. Batch it through
`scene.updateEmbeddedDocuments("Token", updates)` — three tokens capped and restored in one round trip
each.

## 3.10 Reproducing these checks

Throwaway Puppeteer scripts run from the project root against the live server using the gitignored
`scripts/smoke.config.json`, following `scripts/smoke.mjs`'s login flow. Six iterations were needed;
the two that mattered were (a) returning every reading as a **string** built from per-reading thunks,
so one bad property path could not lose the whole run, and (b) reading `.toString()` off
`TokenDocument.prototype._prepareDetectionModes`, `DetectionMode.prototype._testRange` and
`DetectionModeDarkvision.prototype._canDetect` on the running client. Reading the shipped source beat
guessing at every single step, exactly as the Active Effect probe found.

---

# SECTION 4 — Rejection list

Things in or adjacent to these two pages that were **not** implemented, and why.

1. **Blindsight as a real Foundry detection mode.** The class is designed and the config is returned
   by `blindsightModeConfig()` (§3.6), but registering it is a `CONFIG.Canvas.detectionModes` write in
   the `init` hook, and `src/fallout.ts` is not mine to edit. Reported as an integration point rather
   than smuggled into an action module. Until it lands, blindsight is computed and *reported*
   (`perceivedObscurement`, `describeObscurement`) but does not light up the canvas.
2. **Remapping `CONFIG.specialStatusEffects.BLIND` (§3.4).** Same reason — one line, in a file I do
   not own. This one is a live defect, not a missing feature.
3. **Blindsight/Nightvision as schema fields.** They belong in `src/data/character.ts` as a
   `NumberField` pair, which would make them sheet-editable, validated, and reachable by an Active
   Effect — so a perk or the Power Armor Sensor Array could *grant* nightvision the way it already
   grants passive sense. `src/data/**` is not mine to edit, so they are actor flags, which are none of
   those things.
4. **Folding the −5 and the halved range into the roll paths.** `obscurementEffect` computes both, and
   nothing calls them: applying them means touching `src/dice/rolls.ts` (which already takes a
   declared distance and a weather range multiplier) and the derived passive sense in
   `src/data/character.ts`. Both are outside my boundary, and both already have a weather-supplied
   number arriving by another route — wiring the two together without being able to see both sides is
   how you double-charge a character for one fog (§1.3.2).
5. **Burning's per-turn 1d10 (pg 133).** Surfaced by this work and left alone: the status exists and
   is toggled by the flames, but **nothing anywhere in the system deals its 1d10 at the start of a
   turn, and nothing offers the 6 AP to put yourself out.** That belongs in `src/combat/turns.ts`
   beside Bleeding, which is not mine. Worth a roadmap line — it is a shipped condition with no
   mechanical half.
6. **Automatic fire spread on the combat round.** Refused on the book's own instruction (§2.4).
7. **Extinguishing as a check.** Refused: no DC, no quantity, no action cost is printed for any of the
   three means (§2.2.3).
8. **A "dim light" darkness value with any rules meaning.** The canvas numbers in §3.8 are rendering
   figures. The book has three named categories and no continuum, and nothing reads `darknessLevel`
   back as a rule input.
9. **Light sources as items.** Pg 118 names "flashlights, lanterns, fires, and other sources of
   illumination within a specific radius" and gives a radius for none of them. The Pip-Boy light and
   the Stealth Boy are the obvious candidates and are not in the shipped packs at all (ROADMAP E7), so
   there is nothing to attach a radius to yet.
10. **Foliage.** "Moderate foliage" and "dense foliage" are named as causes of the two degrees and are
    pure GM narration — there is no foliage object, no cover interaction, and no rule to compute.
    `setSceneLight` and the declared-distance readout cover them by hand.
