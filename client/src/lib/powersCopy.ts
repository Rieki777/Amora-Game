/**
 * The sentences the powers page says (0098). Pure, so they are testable.
 *
 * The page's whole job is to answer "who looks after this?" in words a member
 * would use out loud, and to answer it identically for a village holding one
 * power and a village holding every one. The R55 rules live in the page's own
 * header; what lives here is the wording, because wording is the part that
 * drifts and the part a test can hold still.
 */

export interface PowerHolderRow {
  roleName: string;
  byBallot: boolean;
  people: string[];
}

export interface PowerRow {
  capability: string;
  title: string;
  surface: string;
  consequence: string;
  /** Whether this power is one that can move to a role at all. */
  movable: boolean;
  heldBy: PowerHolderRow | null;
}

/** Names as a person would say them out loud. */
export function namesSentence(people: readonly string[]): string {
  if (people.length === 0) return "";
  if (people.length === 1) return people[0];
  if (people.length === 2) return `${people[0]} and ${people[1]}`;
  return `${people.slice(0, -1).join(", ")} and ${people[people.length - 1]}`;
}

/**
 * WHO HOLDS THIS, in one sentence.
 *
 * Three states and no fourth: the village holds it and people sit there, the
 * village holds it and the seats are empty, or the scaffolding is looking
 * after it.
 *
 * The empty-seat sentence is the one worth defending. A village that took a
 * power on and never seated anybody has a real problem, and the honest thing
 * is to say so plainly and then stop. It carries no exclamation and no call
 * to action: a fact is a fact, and a warning is an argument.
 */
export function holderSentence(power: PowerRow): string {
  if (power.heldBy) {
    const who = power.heldBy.roleName;
    if (power.heldBy.people.length === 0) {
      return `${who} holds this, and nobody is sitting there yet.`;
    }
    const verb = power.heldBy.people.length === 1 ? "sits" : "sit";
    return `${who} holds this. ${namesSentence(power.heldBy.people)} ${verb} there.`;
  }
  if (power.movable) return "The admin panel looks after this one. It is one the village can take on.";
  return "The admin panel looks after this one.";
}
