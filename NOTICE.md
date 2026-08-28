# Third-party content notice

The MIT licence in [`LICENSE`](LICENSE) covers the original work in this repository — the
TypeScript sources, build scripts, styles, templates, and documentation. The built system
also ships material that other people made, under other terms. This file lists it.

Nothing here is legal advice, and none of it is a claim of ownership over the third-party
material described.

## 1. Game content — Fallout TTRPG by Arcane Arcade

The **Fallout TTRPG** is a free fan-made tabletop game by **Arcane Arcade**, published on the
*XP to Level 3* YouTube channel. This system implements its rules and reproduces game
statistics so that play works at the table.

**What is reproduced, and how much:**

| Content | What ships | Extent |
| --- | --- | --- |
| Equipment (364 items: weapons, armor, ammo, gear, junk) | Name, statistics, the `special` keyword column | Statistics, plus short keyword text |
| Perks (186) and traits (47) | Name, prerequisites, **and the printed rules text** | Substantially the book's wording |
| Aid, chems, food (151) | Name, statistics, property list, effect text | Statistics, plus short effect text |
| Blueprint Encyclopedia (376) | Craft/repair DCs, materials, times | Tabular data |
| Backgrounds (20 + Custom) | Skill grants, trait, starting kit, caps | Statistics, plus a printed sentence or two each |
| Creature statblocks (71) | Name, statistics (v2.0-sourced; v2.1 omits the chapter) | Statistics |

The perk and trait descriptions are the closest thing here to a substantial reproduction of
the book's prose: a perk is *only* its rules text, so an entry that omitted it would not
function. Everything else the book contains — the setting material, the art, the tables as
laid out — is **not** in this repository, and the system is unusable without the free
rulebook. The implementation notes under `docs/` and `packs-src/` summarise rules
and quote short passages with page citations where a ruling depended on the exact wording;
they are working notes for this implementation, not a substitute for the book.

This is a fan implementation of a fan work, distributed non-commercially. Arcane Arcade has
neither endorsed nor reviewed it. **If Arcane Arcade would prefer this content not be
redistributed, it will be removed on request** — see `packs-src/` for where the data lives;
the code works against empty compendia.

## 2. Artwork — game-icons.net (CC BY 3.0)

Every creature token and item tile is generated from an icon published on
[game-icons.net](https://game-icons.net/), licensed
**[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)**. Full per-author attribution is
in [`static/assets/LICENSE-ICONS.md`](static/assets/LICENSE-ICONS.md), which is shipped inside
the built system and must be kept alongside the assets when redistributing.

Only CC BY or CC0 artwork is ever committed here. Art you supply through the *Local Artwork
Folder* setting stays in your own Foundry data and never enters this repository — that
setting exists precisely so the repo stays redistributable.

## 3. Trademarks

**Fallout** is a trademark of **Bethesda Softworks LLC**. Bethesda has no involvement in this
project. This system is likewise unaffiliated with **Modiphius Entertainment**, whose
separate, official *Fallout: The Roleplaying Game* uses the 2d20 system and is **not** what
this implements.

*Foundry Virtual Tabletop* is a trademark of Foundry Gaming LLC. This is an independent
system package, not a Foundry Gaming product.

All other trademarks are the property of their respective owners and are used only to
identify the works described.
