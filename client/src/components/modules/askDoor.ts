/**
 * ASKING THE VILLAGE FOR A MODULE, decided in one place.
 *
 * A member reading about a module their village does not run had nowhere to
 * say they wanted it. The library card showed them the thing and the
 * conversation ended. This is the decision behind the door that fixes that:
 * given a module, a viewer and the village's open decisions, what should the
 * module's page offer.
 *
 * ── WHAT THE DOOR ACTUALLY OPENS, AND WHAT IT DOES NOT ────────────────────
 *
 * It opens an ADVISORY vote (`POST /api/governance/advisory`), which is the
 * "ask the village" primitive this platform already has. Nothing here is a new
 * proposal kind and nothing here can turn a module on. An advisory vote runs
 * on the real engine with the real frozen roll and the real weights, and its
 * own frozen document says in as many words that closing it changes nothing on
 * its own. Turning a module on is written by `PUT /api/admin/modules/:id/
 * lifecycle` and by nothing else in this repository, so a carried ask is a
 * village telling an admin what it wants, and an admin still has to act.
 *
 * THE COPY MUST NEVER IMPLY OTHERWISE. A button that reads as though the vote
 * flips the switch, when a person still has to, is the defect this whole
 * surface exists to avoid.
 *
 * ── WHY THE QUESTION IS FIXED AND NOT A BLANK FIELD ───────────────────────
 *
 * Every ask for the same module asks the same sentence, and that is what makes
 * "somebody already asked" answerable. An advisory ballot's `subject_ref` is
 * server-generated (`adv-<uuid>`), so there is no key on the row that names the
 * module, and the only thing a second asker can match on is the title. A
 * member-written sentence cannot be matched, so a member editing one word
 * would open a second vote about the same switch and the village would be rung
 * twice about one question. So the sentence the village reads is built here,
 * and the member writes the part only they can write: why they are asking.
 *
 * THE KNOWN BLIND SPOT, stated rather than discovered: the match reads the
 * village's most recent ballots, not all of them. An advisory vote closes
 * inside the village's own `vote_days`, so an OPEN one older than that window
 * is not reachable, but a village that opened two hundred decisions inside one
 * vote window could hide one. The window is the caller's to widen.
 */

/** The server slices `question` to this before storing it as the title. */
export const ASK_TITLE_MAX = 200;

const ASK_PREFIX = "Should this village turn on ";
const ASK_SUFFIX = "?";

/**
 * The one sentence the village votes on, for this module.
 *
 * Clamped to the server's own limit HERE rather than letting the server slice
 * it, because a title that came back shorter than the one we matched against
 * would make every later ask for that module look like a first ask.
 */
export function askQuestion(moduleName: string): string {
  const room = ASK_TITLE_MAX - ASK_PREFIX.length - ASK_SUFFIX.length;
  const name = moduleName.trim();
  return ASK_PREFIX + (name.length > room ? name.slice(0, room).trim() : name) + ASK_SUFFIX;
}

/**
 * The module id a `/propose` URL is asking about, or null.
 *
 * Pure, and here rather than beside the page, so it is testable in the node
 * environment the client suites run in. It carries an ID and never a name: the
 * sentence the whole village reads is built from the catalog's own answer for
 * that id, so a hand-written link cannot put words into a ballot title.
 */
export function askedModuleId(search: string): string | null {
  const id = new URLSearchParams(search).get("module");
  return id && id.trim() ? id.trim() : null;
}

/** The slice of a catalog module this decision reads. */
export interface AskDoorModule {
  id: string;
  name: string;
  core: boolean;
  /** Absent for a signed-out reader; the server only sends it to an account. */
  on?: boolean;
  withdrawn: { since: string } | null;
}

/** The slice of a ballot card this decision reads. */
export interface AskDoorBallot {
  id: string;
  subjectType: string;
  title: string;
  status: string;
}

export interface PriorAsk {
  id: string;
  /** The ballot status the record carries: `passed`, `failed`, and so on. */
  status: string;
}

/**
 * Why the door offered nothing.
 *
 * `loading` covers every case where the answer is NOT KNOWN YET, including a
 * read that failed. A caller must never turn "I could not ask" into a sentence
 * about the member: telling somebody their account does not open votes,
 * because a request was dropped, is a claim, and a claim is worse than
 * silence.
 */
export type AskQuiet = "core" | "already-on" | "withdrawn" | "signed-out" | "no-governance" | "loading";

export type AskDoor =
  /** Offer nothing, and `why` says which of the reasons it was. */
  | { kind: "quiet"; why: AskQuiet }
  /** Signed in, and this account cannot open a vote. Never show them the door. */
  | { kind: "cannotOpen" }
  /** The door. `prior` is the last time the village answered this same ask. */
  | { kind: "ask"; question: string; prior: PriorAsk | null }
  /** Somebody asked already and the village is deciding it now. */
  | { kind: "running"; ballotId: string; question: string };

/**
 * What the module's page should offer this viewer.
 *
 * ORDER MATTERS in two places and both are deliberate:
 *
 *  - A running ask is reported BEFORE anything about the viewer's standing,
 *    because knowing the village is already deciding this is a LOOK and every
 *    signed-in member is entitled to it. Only the door itself is gated, and a
 *    standing that could not be READ gates it quietly rather than by telling
 *    somebody they lack a permission nobody checked.
 *  - `withdrawn` is checked before anything about the viewer, because asking
 *    a village to turn on a module the platform no longer offers would walk
 *    the whole roll toward a switch nobody will throw.
 */
export function askDoor(input: {
  module: AskDoorModule;
  signedIn: boolean;
  governanceOn: boolean;
  /**
   * `proposal.open`, as the server reports it on `/api/governance/wizard`, or
   * null while that answer is unknown. Null is NOT false: false says this
   * member does not open votes, and saying that on a dropped request would be
   * the surface inventing a fact about somebody.
   */
  mayOpen: boolean | null;
  /** The village's recent decisions, or null while they are still loading. */
  ballots: AskDoorBallot[] | null;
}): AskDoor {
  const { module: m, signedIn, governanceOn, mayOpen, ballots } = input;

  if (m.core) return { kind: "quiet", why: "core" };
  if (m.withdrawn) return { kind: "quiet", why: "withdrawn" };
  if (m.on) return { kind: "quiet", why: "already-on" };
  if (!signedIn) return { kind: "quiet", why: "signed-out" };
  if (!governanceOn) return { kind: "quiet", why: "no-governance" };
  if (ballots === null) return { kind: "quiet", why: "loading" };

  const question = askQuestion(m.name);
  const mine = ballots.filter((b) => b.subjectType === "advisory" && b.title === question);

  const running = mine.find((b) => b.status === "open");
  if (running) return { kind: "running", ballotId: running.id, question };

  // Standing is read AFTER the running ask and never before it. A member whose
  // own standing could not be read still deserves to be told the village is
  // deciding this, and an unknown standing is not a refusal: `null` stays
  // quiet, `false` says so.
  if (mayOpen === null) return { kind: "quiet", why: "loading" };
  if (!mayOpen) return { kind: "cannotOpen" };

  // The most recent answered ask, so a member about to ask again knows the
  // village has been here before. The list arrives newest first, which is the
  // route's own ordering, so the first match is the latest.
  const answered = mine.find((b) => b.status !== "open") ?? null;
  return {
    kind: "ask",
    question,
    prior: answered ? { id: answered.id, status: answered.status } : null,
  };
}
