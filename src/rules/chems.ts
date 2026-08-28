/**
 * Chems and Robot Overclock Programs (pg 89-91).
 *
 * Programs are mechanically identical to chems — same 4 AP usage, same limit
 * formula (called the RAM limit), same Endurance DC 6 check, same 1-hour
 * duration — so both item types run through these rules.
 */

/** Using a chem or program costs 4 AP (pg 89). */
export const CHEM_AP_COST = 4;

/** Every chem forces an Endurance ability check against DC 6 (pg 89). */
export const ADDICTION_DC = 6;

/** Each chem taken past the limit inside one day inflicts 5 levels of exhaustion (pg 89). */
export const OVERDOSE_EXHAUSTION_LEVELS = 5;

/** All chem and program effects last one hour (pg 89, 90). */
export const CHEM_DURATION = "1 hour";

const CHEM_LIMIT_MIN = 1;
const CHEM_LIMIT_MAX = 4;

/**
 * Chem limit = 2 + half the Endurance modifier (rounded down), minimum 1,
 * maximum 4 (pg 89). Robot Overclock Programs use the same number as the RAM
 * limit (pg 90).
 */
export function chemLimit(enduranceMod: number): number {
  const limit = 2 + Math.floor(enduranceMod / 2);
  return Math.min(CHEM_LIMIT_MAX, Math.max(CHEM_LIMIT_MIN, limit));
}

/**
 * Weeks of abstinence needed to shake an addiction: 6 − Endurance modifier,
 * minimum 1 (pg 89).
 *
 * Robots do not abstain: faulty programming clears through
 * `FAULTY_CIRCUITRY`/`FAULTY_REPAIR_DC` below instead, which is a different
 * shape of rule entirely — a cost and a check, not a clock.
 */
export function addictionRecoveryWeeks(enduranceMod: number): number {
  return Math.max(1, 6 - enduranceMod);
}

/**
 * Clearing faulty programming (pg 90).
 *
 * > Your programming becomes no longer faulty if you use 5 circuitry junk items
 * > and make a crafting skill check with the DC equal to 20. On a failure, you
 * > lose the circuitry and your programming is still faulty.
 *
 * "Faulty programming" is the Robot Overclock Program's version of an
 * addiction — the same Endurance check against the same DC contracts it
 * (`ADDICTION_DC`, pg 89-90), and it is stored in the same list, so the whole
 * addiction machinery already carries it. What was missing was the *cure*: a
 * robot could become faulty and had no printed way back, because this clause
 * was left to the GM while there was no junk in the system to spend.
 *
 * The failure clause is the unusual half and is why this cannot be a plain
 * skill check: **the circuitry is consumed either way.** That is stated
 * outright, so a failed attempt is a real cost rather than a free retry.
 */
export const FAULTY_CIRCUITRY = 5;
export const FAULTY_REPAIR_DC = 20;

/** Split the stored comma-separated addiction list into trimmed names. */
export function parseAddictions(value: string): string[] {
  return value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/** True when the character is already addicted to the named chem (case-insensitive). */
export function isAddictedTo(addictions: string, chemName: string): boolean {
  const wanted = chemName.trim().toLowerCase();
  return parseAddictions(addictions).some((name) => name.toLowerCase() === wanted);
}

/** Add a chem to the addiction list, preserving order and avoiding duplicates. */
export function addAddiction(addictions: string, chemName: string): string {
  if (isAddictedTo(addictions, chemName)) return addictions;
  return [...parseAddictions(addictions), chemName.trim()].join(", ");
}

/**
 * Take a chem (or a robot's faulty program) back off the list.
 *
 * The inverse of `addAddiction`, and case-insensitive for the same reason
 * `isAddictedTo` is: the list is hand-editable free text, so "Med-X" and
 * "med-x" have to mean the same entry. Order is preserved; entries that do not
 * match are untouched, so clearing one addiction never disturbs another.
 */
export function removeAddiction(addictions: string, chemName: string): string {
  const wanted = chemName.trim().toLowerCase();
  return parseAddictions(addictions)
    .filter((name) => name.toLowerCase() !== wanted)
    .join(", ");
}
