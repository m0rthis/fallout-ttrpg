/**
 * Looking a perk or trait up on a sheet, by name.
 *
 * Most perks that do something mechanical do it through an Active Effect built
 * by `scripts/build-packs.mjs` from the entry's `mechanics` array, and nothing
 * has to go looking for them. This module is for the rest: clauses that are not
 * a number on a sheet — a substitution, an alternate procedure, a permission —
 * and whose only hook is therefore the perk's own name.
 *
 * Three copies of that lookup had accumulated privately (`use-aid.ts` for Ice
 * Cream and Apple Pie, `first-aid.ts` for the repeatable medical perks, and the
 * blind attack's Spray and Pray would have been a fourth), which is the same
 * drift the marker teardown had before `actions/markers.ts`. One copy now.
 *
 * **Names, and the risk that carries.** A renamed compendium entry silently
 * stops matching, so every caller passes a `const` declared next to its rule
 * rather than a literal at the call site, and the smoke suite asserts the perk
 * by that constant. That is the same bargain `powerArmorItem` and
 * `wieldedMeleeWeapon` already make one property over; there is no id to key on
 * because a player's copy is a fresh document.
 */

/** Whether this character has taken the named perk or trait at all. */
export function hasPerk(actor: FoundryActor, name: string): boolean {
  return (actor.itemTypes.perk ?? []).some((perk) => perk.name === name);
}

/**
 * How many times this character has taken a repeatable perk.
 *
 * Repeats are separate copies of the item on the sheet: this system has no rank
 * field on a perk, because the book's own "you may take this perk more than
 * once" is a repeat of the whole entry rather than a rank track, and a rank
 * field would have to be kept in step with the copies by hand.
 */
export function perkRanks(actor: FoundryActor, name: string): number {
  return (actor.itemTypes.perk ?? []).filter((perk) => perk.name === name).length;
}

/** Whether this character has the named trait, which is a `perk` document too. */
export function hasTrait(actor: FoundryActor, name: string): boolean {
  return (actor.itemTypes.trait ?? []).some((trait) => trait.name === name);
}
