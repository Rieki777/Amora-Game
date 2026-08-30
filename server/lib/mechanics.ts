/**
 * Mechanics proposals: the domain logic for propose-on-the-page.
 *
 * Three responsibilities, all pure enough to unit-test without a server:
 *
 *  - QUALIFICATION. Who may propose is itself part of the game, resolved
 *    through the ONE gate plus earned standing: `mechanics.propose` (stage
 *    unlock tunable via progression.unlock.mechanics.propose, grantable by
 *    role or badge, deniable by a warning badge) AND
 *    governance.hypha_threshold of earned recognition. A member who clears
 *    the deny but not the bar can still DRAFT — a qualified member's
 *    sponsorship opens the draft, so proposing is an on-ramp, not a wall.
 *
 *  - CHANGE-SET VALIDATION. A proposal may only touch Ring-2 ("open")
 *    variables, every value must pass the same validation the admin write
 *    path runs, every change must actually change something, and a dial
 *    recently moved by governance may be under a cooldown. Validated as a
 *    WHOLE at creation: a set with one bad change is refused entirely,
 *    because what goes to the vote must be exactly what was checked.
 *
 *  - THE PROPOSAL DOCUMENT. One canonical markdown rendering, generated
 *    server-side so the page, the clipboard copy and (next phase) the Hypha
 *    bridge all carry the same text. It embeds the `[gm:<id>]` marker the
 *    bridge will match on-chain events against — the same title-marker
 *    pattern regen-civics' bridge already proved — and a machine-readable
 *    change-set block so apply-on-pass never re-parses prose.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  ringOf,
  applyTimingOf,
  validateVariable,
  VARIABLES_BY_KEY,
} from "../../shared/gameVariables";
import {
  AMOUNT_FROM_SOURCE,
  MINT_RULE_FIELD_LABEL,
  displayMintRuleValue,
  isMintRuleKey,
  mintRuleValueNumber,
  mintRuleValueProblem,
  normalizeMintRuleValue,
  parseMintRuleKey,
  type MintRuleField,
} from "../../shared/mintRuleKeys";

export interface ProposedChange {
  key: string;
  /** Effective value at proposal time — the baseline voters saw. */
  from: string;
  to: string;
}

export interface ChangeSetProblem {
  key: string;
  problem: string;
}

/**
 * The three columns of a minting rule a change set can move, plus the two that
 * say which rule it is. Structural on purpose: `MintRule` in `lib/economy.ts`
 * satisfies this already, and importing that module here would pull the whole
 * token registry into a file whose point is being testable without a server.
 */
export interface MintRuleValues {
  trigger: string;
  tokenSlug: string;
  amount: number | null;
  ceiling: number;
  enabled: boolean;
}

/**
 * Reads the rules a change set names. Injected instead of queried here for the
 * reason above, and because the ONE caller already holds the mint's own
 * village-scoped reader.
 */
export type MintRuleReader = (ruleIds: string[]) => Promise<Map<string, MintRuleValues>>;

/** What a rule's field says today, in the change set's own spelling. */
export function currentMintRuleValue(rule: MintRuleValues, field: MintRuleField): string {
  if (field === "enabled") return rule.enabled ? "true" : "false";
  if (field === "ceiling") return String(rule.ceiling);
  return rule.amount === null ? AMOUNT_FROM_SOURCE : String(rule.amount);
}

/** How a minting rule reads on a document: what it pays for, in which token. */
export function mintRuleLabel(rule: MintRuleValues, field: MintRuleField): string {
  return `${rule.trigger} in ${rule.tokenSlug}: ${MINT_RULE_FIELD_LABEL[field]}`;
}

/**
 * Validate a whole change-set against the CURRENT registry state.
 * Returns problems (empty = valid) and the normalized set with `from`
 * captured from the live effective values.
 *
 * ── TWO VOCABULARIES, AND THEY MAY NOT MIX (R81, R84) ───────────────────────
 *
 * A change may name a game dial or a minting rule (`shared/mintRuleKeys.ts`).
 * A set may not name both, and the refusal is a design decision rather than an
 * implementation limit, so here is the reason where somebody will read it.
 *
 * A ballot carries ONE threshold, and the threshold is chosen by the ballot's
 * subject type (`shared/ballotSubjects.ts`). A minting rule change conducts at
 * a higher quorum floor than an ordinary dial, because R68 tiers thresholds by
 * what is being changed. A set holding both would have to pick one of the two
 * numbers and would be wrong about half of itself: either the dials get a
 * threshold nobody chose for them, or the mint gets conducted at the ordinary
 * one and passes on a quiet week, which is the exact outcome R68 exists to
 * prevent. The seam prices a SUBJECT, so a set that is two subjects has no
 * honest price.
 *
 * They also land through different writers on different clocks. A dial is
 * written by `setVariable`; a minting rule is queued into its own pending
 * columns and promoted by the next settlement. A set mixing them could not be
 * applied atomically, and atomicity beats promptness on a change set here.
 */
export async function validateChangeSet(
  pool: Pool,
  changes: Array<{ key: string; to: string }>,
  effectiveValueOf: (key: string) => string,
  cooldownDays: number,
  readMintRules?: MintRuleReader,
): Promise<{ problems: ChangeSetProblem[]; normalized: ProposedChange[] }> {
  const problems: ChangeSetProblem[] = [];
  const normalized: ProposedChange[] = [];
  if (!Array.isArray(changes) || changes.length === 0) {
    return { problems: [{ key: "*", problem: "A proposal must change at least one dial" }], normalized };
  }
  if (changes.length > 12) {
    return {
      problems: [{ key: "*", problem: "A proposal may move at most 12 dials. Split a larger rebalance into readable steps" }],
      normalized,
    };
  }
  const keys = changes.map((c) => String(c?.key ?? ""));
  const mintKeys = keys.filter(isMintRuleKey);
  if (mintKeys.length > 0 && mintKeys.length < keys.length) {
    return {
      problems: [{
        key: "*",
        problem:
          "One proposal changes the game's dials, or it changes what the village mints. The village votes on those two at different thresholds, so they go up as two proposals",
      }],
      normalized,
    };
  }

  /*
   * The rules this set names, read once. The pool is untouched when no mint
   * key is present, which is what keeps the dial path exactly as costly as it
   * was and lets the unit tests prove it with a throwing stub.
   */
  let mintRules = new Map<string, MintRuleValues>();
  if (mintKeys.length > 0) {
    if (!readMintRules) {
      return {
        problems: [{ key: "*", problem: "This build cannot take a minting rule to a vote from here" }],
        normalized,
      };
    }
    const ids = mintKeys.map((k) => parseMintRuleKey(k)?.ruleId).filter((id): id is string => !!id);
    mintRules = await readMintRules(Array.from(new Set(ids)));
  }

  const seen = new Set<string>();
  for (const c of changes) {
    const key = String(c?.key ?? "");
    const to = String(c?.to ?? "").trim();

    if (isMintRuleKey(key)) {
      const parsed = parseMintRuleKey(key);
      if (!parsed) {
        problems.push({ key, problem: "This build cannot read that as one of the village's minting rules" });
        continue;
      }
      if (seen.has(key)) {
        problems.push({ key, problem: "The same minting rule setting appears twice in this proposal" });
        continue;
      }
      seen.add(key);
      const rule = mintRules.get(parsed.ruleId);
      if (!rule) {
        problems.push({ key, problem: "This village has no minting rule by that name" });
        continue;
      }
      const invalid = mintRuleValueProblem(parsed.field, to);
      if (invalid) {
        problems.push({ key, problem: invalid });
        continue;
      }
      const value = normalizeMintRuleValue(parsed.field, to);
      const from = currentMintRuleValue(rule, parsed.field);
      if (from === value) {
        problems.push({ key, problem: "This change would not change anything. It already has that value" });
        continue;
      }
      const cooling = await cooldownProblem(pool, key, cooldownDays, "This minting rule");
      if (cooling) {
        problems.push({ key, problem: cooling });
        continue;
      }
      normalized.push({ key, from, to: value });
      continue;
    }

    const def = VARIABLES_BY_KEY[key];
    if (!def) {
      problems.push({ key, problem: "No such dial" });
      continue;
    }
    if (seen.has(key)) {
      problems.push({ key, problem: "The same dial appears twice in this proposal" });
      continue;
    }
    seen.add(key);
    if (ringOf(def) !== "open") {
      problems.push({ key, problem: "This dial is founder-held and cannot be moved by proposal" });
      continue;
    }
    const invalid = validateVariable(def, to);
    if (invalid) {
      problems.push({ key, problem: invalid });
      continue;
    }
    const from = effectiveValueOf(key);
    if (from === to) {
      problems.push({ key, problem: "This change would not change anything. It already has that value" });
      continue;
    }
    const cooling = await cooldownProblem(pool, key, cooldownDays, "This dial");
    if (cooling) {
      problems.push({ key, problem: cooling });
      continue;
    }
    normalized.push({ key, from, to });
  }

  problems.push(...mintCeilingProblems(normalized, mintRules));
  return { problems, normalized };
}

/** The one cooldown read, shared by both vocabularies so they cool alike. */
async function cooldownProblem(
  pool: Pool,
  key: string,
  cooldownDays: number,
  noun: string,
): Promise<string | null> {
  if (!(cooldownDays > 0)) return null;
  const [[recent]] = await pool.query<any[]>(
    "SELECT at FROM mechanics_changes WHERE config_key = ? AND source = 'governance' " +
      "AND at > (NOW() - INTERVAL ? DAY) ORDER BY at DESC LIMIT 1",
    [key, cooldownDays],
  );
  return recent
    ? `${noun} was changed by a passed proposal within the last ${cooldownDays} day(s) and is cooling down`
    : null;
}

/**
 * A rule that pays more than its own ceiling contradicts itself, and a change
 * set can build one out of two changes that are each fine alone: raise the
 * amount in one line and lower the ceiling in the next. So this runs over the
 * WHOLE normalised set with the rule's current values standing in for whatever
 * the set does not touch. `queueRuleChange` asks the same question again at
 * execution, against the row as it stands then.
 */
export function mintCeilingProblems(
  normalized: ProposedChange[],
  mintRules: Map<string, MintRuleValues>,
): ChangeSetProblem[] {
  const out: ChangeSetProblem[] = [];
  const touched = new Map<string, Partial<Record<MintRuleField, { key: string; to: string }>>>();
  for (const c of normalized) {
    const parsed = parseMintRuleKey(c.key);
    if (!parsed) continue;
    const fields = touched.get(parsed.ruleId) ?? {};
    fields[parsed.field] = { key: c.key, to: c.to };
    touched.set(parsed.ruleId, fields);
  }
  for (const [ruleId, fields] of Array.from(touched.entries())) {
    const rule = mintRules.get(ruleId);
    if (!rule) continue;
    const amountRaw = fields.amount?.to ?? currentMintRuleValue(rule, "amount");
    const ceilingRaw = fields.ceiling?.to ?? currentMintRuleValue(rule, "ceiling");
    const amount = mintRuleValueNumber("amount", amountRaw);
    const ceiling = Number(ceilingRaw);
    if (amount === null || !(ceiling > 0) || amount <= ceiling) continue;
    const at = fields.amount ?? fields.ceiling!;
    out.push({
      key: at.key,
      problem:
        `${displayMintRuleValue("amount", amountRaw)} is above the ${displayMintRuleValue("ceiling", ceilingRaw)} ` +
        "this rule is allowed to pay. Move the ceiling in the same proposal, or ask for less",
    });
  }
  return out;
}

export interface ProposerStanding {
  /** May open proposals directly. */
  qualified: boolean;
  /** May write drafts that a qualified member can sponsor open. */
  mayDraft: boolean;
  /** A warning badge denies the capability outright — no drafts either. */
  denied: boolean;
  /** Earned recognition required (0 = none) and held, for honest UI copy. */
  recognitionRequired: number;
  recognitionHeld: number;
}

/**
 * The proposer model, composed: the one gate answers WHO (stage rung, role,
 * badge — and a badge deny beats all of it), the recognition threshold
 * answers whether they have EARNED STANDING. Failing only the standing (or
 * only the stage rung) leaves the draft path open; a deny closes everything,
 * because the deny is the village's remedy for misuse.
 */
export function proposerStanding(
  hasCap: boolean,
  deniedByBadge: boolean,
  recognitionHeld: number,
  recognitionRequired: number,
  /** Admins pass every gate; that includes the earned-standing bar — a
   *  founder with zero recognition on day one must still be able to
   *  propose and to sponsor. A badge deny still beats even this. */
  isAdmin = false,
): ProposerStanding {
  if (deniedByBadge) {
    return { qualified: false, mayDraft: false, denied: true, recognitionRequired, recognitionHeld };
  }
  const meetsThreshold = isAdmin || recognitionHeld >= recognitionRequired;
  return {
    qualified: hasCap && meetsThreshold,
    mayDraft: true,
    denied: false,
    recognitionRequired,
    recognitionHeld,
  };
}

/** A stored value shown the way a voter should read it. */
export function displayChangeValue(key: string, raw: string): string {
  const parsed = parseMintRuleKey(key);
  if (parsed) return displayMintRuleValue(parsed.field, raw);
  const def = VARIABLES_BY_KEY[key];
  if (!def) return raw;
  if (def.type === "boolean") return raw === "true" || raw === "1" ? "On" : "Off";
  if (def.type === "choice") return def.choices?.find((c) => c.value === raw)?.label ?? raw;
  return def.unit ? `${raw} ${def.unit}` : raw;
}

/**
 * What a change is CALLED on the document the village freezes and reads.
 *
 * A minting rule has no registry entry to carry a label, so the label is built
 * from the rule itself and the caller has to hand the rules over. Without them
 * the key stands in, which is ugly and true. Inventing a friendly name for a
 * rule this build cannot see would be a sentence about a payment nobody
 * checked.
 */
function changeLabel(key: string, mintRules: Map<string, MintRuleValues>): string {
  const parsed = parseMintRuleKey(key);
  if (parsed) {
    const rule = mintRules.get(parsed.ruleId);
    return rule ? mintRuleLabel(rule, parsed.field) : key;
  }
  return VARIABLES_BY_KEY[key]?.label ?? key;
}

/**
 * The canonical proposal document. `[gm:<id>]` in the heading is the marker
 * a founder pastes into the Hypha proposal TITLE: it is how the bridge's
 * webhook will match the on-chain ProposalCreated event back to this row,
 * and how a human can too, today.
 */
export function proposalMarkdown(p: {
  id: string;
  title: string;
  rationale: string;
  changeSet: ProposedChange[];
  villageName: string;
  proposerName: string;
  supports: number;
  createdAt: string;
  /**
   * The minting rules this set names, when it names any. A mint change carries
   * no registry entry, so this is where its label comes from.
   */
  mintRules?: Map<string, MintRuleValues>;
}): string {
  const mintRules = p.mintRules ?? new Map<string, MintRuleValues>();
  const mints = p.changeSet.some((c) => isMintRuleKey(c.key));
  const lines: string[] = [
    `# [gm:${p.id}] ${p.title}`,
    "",
    mints
      ? `A proposal from ${p.villageName} to change what the village mints, prepared on its public Game Mechanics page.`
      : `A game-mechanics change proposal from ${p.villageName}, prepared on its public Game Mechanics page.`,
    `Proposed by ${p.proposerName} on ${p.createdAt.slice(0, 10)}; ${p.supports} member(s) supported it in-game before it came here.`,
    "",
    "## Why",
    "",
    p.rationale,
    "",
    "## The changes",
    "",
    mints ? "| what it pays for | now | proposed |" : "| dial | now | proposed |",
    "|---|---|---|",
  ];
  for (const c of p.changeSet) {
    const label = changeLabel(c.key, mintRules);
    lines.push(`| ${label} (\`${c.key}\`) | ${displayChangeValue(c.key, c.from)} | **${displayChangeValue(c.key, c.to)}** |`);
    const def = VARIABLES_BY_KEY[c.key];
    if (def && applyTimingOf(def) === "cycle-close") {
      lines.push(`| ↳ takes effect at the next cycle close, never mid-cycle | | |`);
    }
  }
  lines.push(
    "",
    mints
      ? "If this proposal passes, every change above is queued on the rule it names and takes effect at the next moon, which is how every change to a minting rule lands. Nothing is paid at a new rate inside the cycle the village is already in. Each one is recorded on the village's public amendment ledger with this proposal's reference."
      : "Every value above sits inside the bounds the platform's constitution fixes for that dial; if this proposal passes, the changes are applied exactly as listed and recorded on the village's public amendment ledger with this proposal's reference.",
    "",
    "```json",
    JSON.stringify({ marker: `gm:${p.id}`, changes: p.changeSet }, null, 2),
    "```",
    "",
  );
  return lines.join("\n");
}

export interface ProposalRow {
  id: string;
  title: string;
  rationale: string;
  changeSet: ProposedChange[];
  proposerUserId: string;
  /** `onsite_vote` and `passed_onsite` are the governance module's on-site
   *  siblings of `to_hypha` and `passed_verified` (GOV_DESIGN 2.6). */
  status:
    | "draft"
    | "open"
    | "withdrawn"
    | "to_hypha"
    | "onsite_vote"
    | "passed_claimed"
    | "passed_verified"
    | "passed_onsite"
    | "failed"
    | "applied";
  /** The conducting on-site ballot, once one opened (0089). */
  ballotId: string | null;
  hyphaRef: string | null;
  /** The numeric on-chain proposal id, linked when the founder pastes the
   *  Hypha proposal URL back. Verified outcomes match by THIS — real chain
   *  events never carry the title marker. */
  hyphaProposalId: string | null;
  hyphaProposalUrl: string | null;
  /** Whether the (marker, proposalId) link has reached the ReGen hub. */
  hubLinkSynced: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToProposal(r: RowDataPacket): ProposalRow {
  const raw = typeof r.change_set === "string" ? JSON.parse(r.change_set) : r.change_set;
  return {
    id: String(r.id),
    title: String(r.title),
    rationale: String(r.rationale),
    changeSet: Array.isArray(raw) ? raw : [],
    proposerUserId: String(r.proposer_user_id),
    status: r.status,
    ballotId: r.ballot_id ?? null,
    hyphaRef: r.hypha_ref ?? null,
    hyphaProposalId: r.hypha_proposal_id ?? null,
    hyphaProposalUrl: r.hypha_proposal_url ?? null,
    hubLinkSynced: Boolean(r.hub_link_synced),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

/**
 * Pull the numeric on-chain proposal id out of whatever the founder pastes:
 * a full Hypha app URL (the id is the last numeric path segment, query and
 * hash tolerated) or the bare number itself. Null when nothing numeric is
 * there — the caller should ask again rather than guess.
 */
export function parseHyphaProposalId(input: string): string | null {
  const s = String(input ?? "").trim();
  if (/^\d{1,40}$/.test(s)) return s;
  try {
    const url = new URL(s);
    const segments = url.pathname.split("/").filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^\d{1,40}$/.test(segments[i])) return segments[i];
    }
  } catch {
    /* not a URL either */
  }
  return null;
}

export async function proposalById(pool: Pool, id: string): Promise<ProposalRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM mechanics_proposals WHERE id = ?", [id]);
  return rows[0] ? rowToProposal(rows[0]) : null;
}

export async function backerCounts(
  pool: Pool,
  proposalIds: string[],
): Promise<Map<string, { supports: number; sponsors: string[] }>> {
  const out = new Map<string, { supports: number; sponsors: string[] }>();
  if (proposalIds.length === 0) return out;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT proposal_id, user_id, kind FROM mechanics_proposal_backers WHERE proposal_id IN (${proposalIds.map(() => "?").join(",")})`,
    proposalIds,
  );
  for (const r of rows) {
    const id = String(r.proposal_id);
    const entry = out.get(id) ?? { supports: 0, sponsors: [] };
    if (r.kind === "support") entry.supports += 1;
    else entry.sponsors.push(String(r.user_id));
    out.set(id, entry);
  }
  return out;
}

/** Proposals a member opened this cycle, for the per-cycle rate limit. */
export async function proposalsOpenedSince(pool: Pool, userId: string, since: Date): Promise<number> {
  const [[row]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM mechanics_proposals WHERE proposer_user_id = ? AND created_at > ?",
    [userId, since],
  );
  return Number(row.n);
}
