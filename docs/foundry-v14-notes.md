# Foundry v14 API notes

Findings verified empirically against the live server (build **14.365**) by driving a
Puppeteer session and introspecting the running client — not from documentation or from
older-version habits, several of which are now wrong. `src/types/foundry.d.ts` declares the
API surface this system consumes; this file records the *behaviour* that shaped the design.

## Active Effects changed substantially

Verified 2026-08-12.

### Changes moved into `system`

`ActiveEffect` is now a **typed document** (`type: "base"`, `CONFIG.ActiveEffect.dataModels`,
`defaultType`). The `changes` array is **not** a top-level schema field any more — it lives at
`system.changes`. The old top-level placement still works through `ActiveEffect._shimChanges`,
but that shim is deprecated since v14 and slated for removal in v16, so this system authors
the modern shape:

```js
{ name, type: "base", system: { changes: [...] } }
```

### `mode` became `type`

`CONST.ACTIVE_EFFECT_MODES` is now an **empty object**. A change is
`{key, type, value, phase, priority}`, where `type` is a string from
`ActiveEffect.CHANGE_TYPES`:

`custom`, `multiply`, `add`, `subtract`, `downgrade`, `upgrade`, `override`

Passing a legacy numeric `mode: 2` is silently shimmed to `type: "add"`.

### Two application phases

`Actor#applyActiveEffects(phase)` now takes a phase, and `ActiveEffect.CHANGE_PHASES` defines
two: **`initial`** (the default) and **`final`**. `Actor#prepareData` runs
`super.prepareData()` — which includes the `initial` pass and then `prepareDerivedData` — and
*then* runs `applyActiveEffects("final")`.

The consequence for any system with a `TypeDataModel`: an `initial`-phase change to something
computed in `prepareDerivedData` is **silently overwritten**, because the derived pass
reassigns it afterwards. A `final`-phase change to the same path does stick.

`final` is tempting but it writes *unguided*: `ActiveEffect.applyChange` resolves the target
through `system.getFieldForProperty(...)`, and a computed property has no `DataField`, so the
change skips validation and type coercion entirely.

**This system therefore takes neither shortcut.** `CharacterData` declares a real
`system.bonuses` schema (a `NumberField` per bonus, plus one per skill). Perks, traits, and
chems target those fields in the `initial` phase — fully guided and validated — and
`prepareDerivedData` folds them into the numbers the sheet shows. Effects stay declarative,
order-independent, and inspectable.

### Item effects transfer cleanly

An effect on an owned item with `transfer: true` applies to the actor and appears in
`actor.allApplicableEffects()`. Verified round-trip: disabling reverts the bonus, re-enabling
restores it, and deleting the item removes it. This is what makes a perk item "just work" once
dragged onto a character.

### Durations expire on their own — asynchronously

Core retires elapsed effects itself, but **not synchronously**. Sampled immediately after
`game.time.advance(7200)` on a one-hour effect, nothing has happened yet:

```
remaining: -3600, expired: false, active: true   ← immediately after advancing
```

Wait a few seconds and core has processed it:

```
expired: true, active: false, and the effect's changes stop applying
```

`CONFIG.ActiveEffect.expiryAction` is `"update"`, and that is literal: core **updates** the
effect to mark it expired and inactive. It does **not** delete it, so the row stays visible on
the sheet as an inert entry until something removes it.

> **This cost us a bug.** An earlier pass here sampled only the synchronous state, concluded
> that durations never expire, and built a sweep that deleted elapsed effects on the
> `updateWorldTime` hook. That sweep deleted each effect while core was still issuing its own
> expiry *update* for it, so the server rejected core's update on a now-missing document and
> logged `undefined id [...] does not exist in the EmbeddedCollection collection` from its
> socket handler — a message no local `try/catch` can suppress, because it is reported rather
> than thrown. The fix was to delete the sweep: core owns expiry. This system now only tidies
> effects **after** core has flagged them (`duration.expired === true`), or wholesale when a
> character starts a new day.
>
> The general lesson: when probing an async framework, sample after settling, not just at the
> instant of the call.

The duration schema is `{value, units, expiry, expired}` — not the older
`{seconds, rounds, turns, startTime}`, though that older shape is shimmed too.

## Other v14 details worth remembering

- `game.i18n.format()` was merged into `localize()`, which now takes the data object.
- `CONFIG.statusEffects` is an **object** in v14 (the array form is back-compat shimmed).
  Never register an id core already ships — a duplicate throws a texture-loading proxy error
  at world load and blackens the scene background. See the filter in `src/fallout.ts`.
- `FilePicker` moved to `foundry.applications.apps.FilePicker`; browse through
  `FilePicker.implementation.browse(source, target)`.
- Sheets are `ApplicationV2` + `HandlebarsApplicationMixin`; sheet registration is
  `foundry.documents.collections.Actors.registerSheet`.
- `renderChatMessageHTML` replaced `renderChatMessage`, and hands you an `HTMLElement`
  rather than a jQuery object.

## A core bug worth knowing: CombatTracker and unviewed combats

`CombatTracker._onRender` (14.365) does:

```js
let data = {};
if ( Array.isArray(renderData) ) data = renderData.find(d => d._id === this.viewed?.id);
if ( parts.includes("tracker") && (renderContext === "updateCombat") && ("turn" in data) ) {
```

When `renderData` is an array whose `find()` misses — which happens whenever a combat is
updated that the tracker is **not currently viewing** — `data` becomes `undefined` rather
than staying `{}`, and `"turn" in undefined` throws
`TypeError: Cannot use 'in' operator to search for 'turn' in undefined`.

Nothing in this system triggers it in normal play, because a GM running a combat has it in
view. It surfaced only because the smoke suite created a combat and advanced turns without
activating it; the suite now calls `combat.activate()`, which is what a GM would do anyway.
Worth remembering if the error ever appears in a real session: the cause is a combat being
updated out of view, not this system.

## Scenes, flags, and ArrayField (probed for the environment chapters)

All confirmed on 14.365 before the weather and disease code was written:

- `foundry.data.fields.ArrayField` exists and takes `(element, options)`. An
  `ArrayField(SchemaField)` cleans correctly, filling each entry's defaults — an entry
  written as `{key: "y"}` comes back with every other field at its initial value, which is
  what the disease list relies on when a partial entry is written.
- `game.scenes.viewed`, `game.scenes.current`, `game.scenes.active` and `canvas.scene` all
  resolve to the same scene on a client viewing it. The weather reader prefers `viewed` and
  falls back through the others.
- Scene flags round-trip: `setFlag` / `getFlag` / `unsetFlag` all behave, and `unsetFlag`
  genuinely clears rather than writing `null`. That is why "no weather" is an absent flag
  rather than a stored zero.

The weather ticks are deliberately **not** driven from `updateWorldTime`. That hook is what
the effect-expiry mistake above was built on, and the lesson generalizes: anything that
writes documents on a clock races Foundry's own clock-driven writes. Time advances when a GM
presses the button, and `tickEnvironment` takes an explicit weather state so the whole
subsystem stays testable without touching a scene at all.

## Effects that expire on a trigger, not a clock

Blocking (v2.1 pg 127) lasts "until you attack again", which Foundry's duration model
cannot express — every other effect in this system ends when world time passes it, and
core owns that expiry.

The shape that works is a **duration-less** effect carrying a system flag, deleted by
whatever the trigger is (here, `rollAttack`). It never acquires a `duration`, so core's
expiry pass never looks at it, and deleting it cannot race an update core is issuing — the
failure mode that cost us the effect-sweep bug above. It also survives across turns and
scenes for free, which is exactly what the printed rule wants.

The general rule this suggests: **give an effect a duration only when a clock genuinely
ends it.** A trigger-ended effect with a duration attached would be owned by two systems at
once, and they would disagree.

## ProseMirror, and why conditional effects are a button

`<prose-mirror name="..." value="..." toggled compact-button>` works as a drop-in for a
textarea inside a HandlebarsApplicationMixin sheet on 14.365 — but **only if you give it a
body**. It keeps two separate strings, and the constructor is explicit about where each one
comes from:

```js
this._setValue(value || this.getAttribute("value") || "");   // the form value
this.#enriched = enriched || this.innerHTML;                  // what a CLOSED editor shows
```

A `toggled` editor renders `#enriched` into its `.editor-content` div while closed and only
loads the raw value when the edit button opens it. Written with an empty body — which is what
this system shipped — every description and biography rendered as a blank 6rem panel: the
text was in the document and in `.value`, and invisible. All 186 perks looked empty. The fix
is `_prepareContext` enrichment emitted as the element's body
(`{{{enrichedDescription}}}`, see `src/sheets/enrich.ts`); the `value` attribute stays, since
that is still what the editor loads and submits.

Two follow-on details, both probed on 14.365:

- **`enrichHTML` does not touch newlines.** The compendium text is plain, with `\n` between
  paragraphs, so enrichment alone yields one run-on line. `enrichField` splits a value with
  no markup in it into `<p>` first, and leaves anything already containing tags alone. Note
  that core does the same collapsing if a user opens and saves such a field — ProseMirror
  parses `a\nb` as a single paragraph. That is core's behaviour, not ours.
- **Core lays the content out `position: absolute; inset: 0`.** Right for an open editor, but
  it pins a closed one to its minimum height and hides the rest behind a scrollbar. The
  system's CSS lets `prose-mirror.inactive > .editor-content` flow and grow (capped at 30rem),
  which fits the longest shipped perk — 887 characters — with room to spare.

The harder v14 lesson is about **conditional** Active Effects. There is no supported way to
make a change apply only while some predicate holds:

- `prepareDerivedData` is too late. Changes land in the `initial` phase, *before* the derived
  pass, so by the time a condition could be evaluated the number is already summed into
  `system.bonuses` with no per-source record left to subtract.
- Toggling `disabled` from a document hook works mechanically but writes documents in
  response to document writes — the same shape as the effect-expiry sweep above, which is the
  one bug this system shipped to production.

So a conditional effect here is an ordinary **disabled** effect carrying its condition in a
flag, plus an explicit Sync action. Note that effects transferred from an owned item are
embedded in the *item*, not the actor: `actor.allApplicableEffects()` lists them, but
updating one through `actor.updateEmbeddedDocuments` fails on an id the actor's collection
does not hold. Group updates by their real owner.

## Reproducing these checks

The probes were throwaway scripts run from the project root (so `puppeteer` resolves) using
the credentials in the gitignored `scripts/smoke.config.json`, following the same login flow
as `scripts/smoke.mjs`. Introspecting `Actor.prototype.applyActiveEffects.toString()` and
`ActiveEffect.applyChange.toString()` on the running client was decisive — reading the
shipped source beat guessing at every step. The behaviour that matters is now locked down by
steps in the smoke suite, so a future Foundry upgrade that changes it will fail loudly.

## ApplicationV2 dispatches `data-action` on click, and only on click

Verified by reading the deployed `foundry.mjs` on 14.365. `ApplicationV2` installs one
centralized listener — *"Centralized handling of click events which occur on or within the
Application frame"* — which resolves `event.target.closest("[data-action]")` and calls
`#onClickAction`. The handler type is named `ApplicationClickAction`. There is **no
change-event equivalent**: an `<input data-action="...">` never fires anything.

Two consequences this system actually hit:

- **A number input cannot drive an action.** The Power Armor upgrades panel renders ranks as
  clickable pips for this reason, not as `<input type="number">`. Clicking the rank you
  already have steps it back down, which is how a rank reaches 0.
- **An input that belongs to a *different document* than the sheet cannot be a form field
  either.** The character sheet is one form bound to the actor with `submitOnChange`, so a
  `name="system.upgradeRanks.x"` input would submit an actor path that does not exist and be
  rejected by `_prepareSubmitData` (which validates with `fallback: false`). Upgrade ranks
  live on the armor *item*. Pips sidestep both problems at once.

So: anything on a sheet that writes to an embedded document needs a click-driven control, or
its own `change` listener attached in `_onRender`. This system uses the former throughout.

## Vision, detection modes and lighting on 14.365

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
