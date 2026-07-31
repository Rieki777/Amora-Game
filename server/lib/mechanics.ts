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
 * Validate a whole change-set against the CURRENT registry state.
 * Returns problems (empty = valid) and the normalized set with `from`
 * captured from the live effective values.
 */
export async function validateChangeSet(
  pool: Pool,
  changes: Array<{ key: string; to: string }>,
  effectiveValueOf: (key: string) => string,
  cooldownDays: number,
): Promise<{ problems: ChangeSetProblem[]; normalized: ProposedChange[] }> {
  const problems: ChangeSetProblem[] = [];
  const normalized: ProposedChange[] = [];
  if (!Array.isArray(changes) || changes.length === 0) {
    return { problems: [{ key: "*", problem: "A proposal must change at least one dial" }], normalized };
  }
  if (changes.length > 12) {
    return {
      problems: [{ key: "*", problem: "A proposal may move at most 12 dials — split a larger rebalance into readable steps" }],
      normalized,
    };
  }
  const seen = new Set<string>();
  for (const c of changes) {
    const key = String(c?.key ?? "");
    const to = String(c?.to ?? "").trim();
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
      problems.push({ key, problem: "This change would not change anything — it already has that value" });
      continue;
    }
    if (cooldownDays > 0) {
      const [[recent]] = await pool.query<any[]>(
        "SELECT at FROM mechanics_changes WHERE config_key = ? AND source = 'governance' " +
          "AND at > (NOW() - INTERVAL ? DAY) ORDER BY at DESC LIMIT 1",
        [key, cooldownDays],
      );
      if (recent) {
        problems.push({
          key,
          problem: `This dial was changed by a passed proposal within the last ${cooldownDays} day(s) and is cooling down`,
        });
        continue;
      }
    }
    normalized.push({ key, from, to });
  }
  return { problems, normalized };
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
  const def = VARIABLES_BY_KEY[key];
  if (!def) return raw;
  if (def.type === "boolean") return raw === "true" || raw === "1" ? "On" : "Off";
  if (def.type === "choice") return def.choices?.find((c) => c.value === raw)?.label ?? raw;
  return def.unit ? `${raw} ${def.unit}` : raw;
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
}): string {
  const lines: string[] = [
    `# [gm:${p.id}] ${p.title}`,
    "",
    `A game-mechanics change proposal from ${p.villageName}, prepared on its public Game Mechanics page.`,
    `Proposed by ${p.proposerName} on ${p.createdAt.slice(0, 10)}; ${p.supports} member(s) supported it in-game before it came here.`,
    "",
    "## Why",
    "",
    p.rationale,
    "",
    "## The changes",
    "",
    "| dial | now | proposed |",
    "|---|---|---|",
  ];
  for (const c of p.changeSet) {
    const def = VARIABLES_BY_KEY[c.key];
    const label = def?.label ?? c.key;
    lines.push(`| ${label} (\`${c.key}\`) | ${displayChangeValue(c.key, c.from)} | **${displayChangeValue(c.key, c.to)}** |`);
    if (def && applyTimingOf(def) === "cycle-close") {
      lines.push(`| ↳ takes effect at the next cycle close, never mid-cycle | | |`);
    }
  }
  lines.push(
    "",
    "Every value above sits inside the bounds the platform's constitution fixes for that dial; if this proposal passes, the changes are applied exactly as listed and recorded on the village's public amendment ledger with this proposal's reference.",
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
  status: "draft" | "open" | "withdrawn" | "to_hypha" | "passed_claimed" | "passed_verified" | "failed" | "applied";
  hyphaRef: string | null;
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
    hyphaRef: r.hypha_ref ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
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
