/**
 * Party-wide statistics (pg 24 / character sheet): computed at render or roll
 * time across all player-owned characters, never stored.
 */

import type { CharacterData } from "../data/character";
import { groupSneak, partyNerve } from "./formulas";

function partyMembers(): CharacterData[] {
  const members: CharacterData[] = [];
  for (const actor of game.actors) {
    if (actor.type !== "character" || !actor.hasPlayerOwner) continue;
    const system = actor.system as Partial<CharacterData>;
    if (system.derived) members.push(system as CharacterData);
  }
  return members;
}

/** Party Nerve = half the summed CHA modifiers of all player characters. */
export function currentPartyNerve(): number {
  return partyNerve(partyMembers().map((member) => member.derived.abilityMods.charisma));
}

/** Group Sneak = the party's average Sneak bonus. */
export function currentGroupSneak(): number {
  return groupSneak(partyMembers().map((member) => member.derived.skillBonuses.sneak));
}
