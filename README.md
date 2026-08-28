# Fallout TTRPG (Arcane Arcade) — Foundry VTT System

An unofficial **Foundry VTT v14** game system for the free fan-made **Fallout TTRPG v2.1 by
Arcane Arcade** (the *XP to Level 3* YouTube channel).

**You need the free rulebook to play.** This system implements the mechanics, the character
sheet, and the equipment statistics — the rules chapters and setting material stay in the
book.

> This is **not** Modiphius' official *Fallout: The Roleplaying Game*, which uses the 2d20
> system. Different game entirely. Not affiliated with Bethesda, Modiphius, Arcane Arcade,
> or Foundry Gaming.

## Install

**From a release.** In Foundry: **Game Systems → Install System → Manifest URL**, and paste
this repository's manifest URL:

```
https://github.com/m0rthis/fallout-ttrpg/releases/latest/download/system.json
```

Foundry offers updates from that same URL as new versions ship.

**From source.** `npm install && npm run build` produces `dist/`, which *is* the installable
system — copy or symlink it into your Foundry data folder as `Data/systems/fallout-ttrpg`,
then restart Foundry:

```bash
ln -s "$PWD/dist" ~/.local/share/FoundryVTT/Data/systems/fallout-ttrpg
```

Either way, create a world using **Fallout TTRPG (Arcane Arcade)**.

## What it does

**Characters and NPCs.** The full derived-stat engine: S.P.E.C.I.A.L. scores and modifiers,
all 14 skills with their either/or governing abilities and the half-Luck bonus, HP/SP/AP
maxima from the level table, Healing Rate, Carry Load auto-summed from inventory (worn armor
halved), Passive Sense, Radiation DC, and AC/DT from equipped armor including decay penalties.
Backgrounds (pg 13-18) apply their three +2 skills, trait, and starting kit in one click, with
a ledger that lets the whole thing be reversed exactly.

**Rolling.** Skill checks, ability checks, attacks, and damage, all from the sheet.
Shift-click for advantage, Ctrl-click for disadvantage. Per-weapon crit thresholds drop by
half your Luck (shotguns excepted), and a natural 1 decays the weapon. Targeted attacks get a
limb picker with per-limb AP costs, damage-modifier callouts, and an automatic condition roll
when damage reaches hit points.

**Combat.** Initiative as a Perception check, an AP economy on the turn hook (unused AP half-
recycles, Fatigue sheds a level, Bleeding bites at turn start), the damage pipeline —
Power Armor Defense Points, then stamina, then hit points behind DT — death saves, severe
injuries, blocking, and sneak attacks.

**Weapon keywords.** Automatic *N* as free extra attacks, Spread, Two Handed's one-handed
penalties, the four reload speeds, Unstable's decay clock, Defensive feeding the block. Ammo
is tracked per weapon; reloading pulls matching rounds from inventory.

**Survival.** Hunger, dehydration, exhaustion, fatigue, bleeding, and rads as leveled
conditions with the aggregate −1-per-level penalty on every roll. Resting, the daily clock,
irradiated levels, snack pairing, and the alcohol ladder from sober to blackout.

**Aid and chems.** 151 consumables running the pg 89 workflow — the chem limit, the
Endurance check against addiction, withdrawal effects, and numeric properties (Painkilling,
Stimulant, Psychosis, …) applying themselves for their duration and wearing off.

**Perks and traits.** All 186 perks and 47 traits as a compendium. Drag one onto a character
and any flat bonus applies itself through an Active Effect; delete the perk and it reverts.
Effects are editable on the item sheet, so a house rule automates the same way. Grants can be
scoped to a single skill or named check, or made conditional on a situation.

**Environment.** All 20 diseases with Endurance-derived durations and multi-dose cures, eight
kinds of hazardous weather as scene state with exposure clocks, the five hazardous
environments, and radiation zones with severity driving the re-check cadence.

**Compendia.** 515 equipment, aid and junk items, 71 creatures, 233 perks and traits, and the
376-row Item Blueprint Encyclopedia joined onto the equipment. Artwork is Pip-Boy-styled tokens and tiles
generated from [game-icons.net](https://game-icons.net/) (CC BY 3.0). Point the *Local
Artwork Folder* setting at your own Foundry data to override any of it — your art never
enters this repository.

## What it deliberately does not do

Honest limits, not oversights:

- **AP is spent, never enforced.** Every priced action charges the pool and reports what it
  spent, but nothing is refused for want of AP — a misclick cannot strand a character
  mid-turn — and out of combat nothing is charged at all.
- **Weather and situation changes are GM-triggered**, not hooked to world time. This system
  has already been burned once by racing Foundry's own clock-driven updates, and a wasteland
  hour is a GM beat rather than a background timer.
- **Vision cutoffs are reported, not enforced.** Mapping "blind beyond 40 ft" onto Foundry's
  detection modes needs token-level vision overrides.
- **Rules the book leaves undefined stay undefined.** Where a mechanic has no printed
  resolution — Spread's extra hits are the clearest case — the system announces it and leaves
  it to the GM rather than inventing a rule and presenting it as printed.
- **Grants conditioned on the target** ("Speech checks with any ghoul") stay as text. A
  target is not sheet state.

[`docs/ROADMAP.md`](docs/ROADMAP.md) tracks what is left, with the reasoning for each
deferral.

## Rules provenance

Every formula cites a page. [`docs/rules-reference.md`](docs/rules-reference.md) is the v2.0
baseline, superseded where the editions differ by
[`docs/rules-v2.1-combat.md`](docs/rules-v2.1-combat.md) and
[`docs/rules-v2.1-environment.md`](docs/rules-v2.1-environment.md). The `packs-src/*-NOTES-*.md`
files record each extraction pass, including its rejection list.

Where the book contradicts itself — and it does, it is a fan product with real editing errors
— the standing rulings are: the printed book beats the patch notes, the dedicated chapter
beats the summary page, and inconsistencies are commented in place rather than silently
smoothed.

## Licence

The code is **MIT** ([`LICENSE`](LICENSE)). The built system also ships game content by
Arcane Arcade and artwork by game-icons.net contributors, under their own terms — see
[`NOTICE.md`](NOTICE.md) for exactly what is reproduced and how much.

## Development

```bash
npm install
npm run verify   # typecheck (strict) + eslint + build
npm run dev      # rebuild on change
npm run smoke    # live browser suite against a running Foundry
```

Sources in `src/`; static assets (manifest, templates, CSS, i18n) in `static/`.
`npm run build` produces `dist/`.

Foundry v14 has no community TypeScript types yet, so `src/types/foundry.d.ts` declares the
exact v14 API surface this system uses, verified against build 14.365 on a live server rather
than guessed. Findings live in [`docs/foundry-v14-notes.md`](docs/foundry-v14-notes.md) —
worth reading before building on any v14 API, particularly the Active Effect rework.

`npm run smoke` drives a real browser against a real Foundry world using credentials in the
gitignored `scripts/smoke.config.json`. It only ever creates and deletes documents prefixed
`SMOKE-`. Console errors fail the suite.

Releases: tag a commit `vX.Y.Z` and push the tag. `.github/workflows/release.yml` builds,
stamps the version and release URLs into `system.json`, and attaches the manifest and the zip
to a GitHub Release. Nothing needs configuring — the manifest committed here carries no URLs
at all, and the workflow fills them in from whatever repository it runs in.
