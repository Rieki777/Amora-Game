/**
 * The needs scope over HTTP: what this village is for, and what meets it.
 *
 * Six routes, all of them new (R1, R18; lane N1):
 *
 *   GET    /api/needs/scope           the scope, for any signed-in member
 *   GET    /api/needs/coverage        the two derived reads, for any member
 *   PUT    /api/admin/needs/scope     take on needs, or change what was said
 *   POST   /api/admin/needs/retire    take one out of scope, keeping its links
 *   POST   /api/admin/needs/links     tag a thing as meeting a need
 *   DELETE /api/admin/needs/links/:id take one tag off
 *
 * THE SHAPE IS server/routes/faqs.ts's, which is the pattern the rest of
 * server/index.ts is meant to follow: `register(app, deps)` is the only export
 * that touches Express, `deps` is a `Pick<AppDeps, ...>` and never the whole
 * thing, and the gates come in through `deps` rather than being imported so
 * the DEFAULT-DENY marker in server/lib/adminGate.ts keeps working.
 *
 * WHY THE READS ARE MEMBERS AND NOT PUBLIC. What a village is for is not a
 * secret, and a later lane may well publish it on the shopfront. It starts
 * behind a member token because the honest half of the answer travels with it:
 * the coverage read names the needs with nothing meeting them, and a village
 * mid-setup should get to finish before a stranger reads its gaps.
 *
 * WHY THE WRITES ARE `isAdmin` AND NOT A CAPABILITY. There is no needs
 * capability in shared/capabilities.ts, and adding one is a five-edit change in
 * a file this lane does not own. `isAdmin` is admin or founder, which is the
 * setup ceremony's audience. A later lane that wants stewards writing the
 * scope adds the key in the one gate and swaps these four lines.
 *
 * NO DOOR YET, and that is recorded rather than hidden. The screens that call
 * these four writes are lane N2's `NeedsPanel.tsx`, so
 * scripts/check-admin-reach.mjs carries four ALLOWED lines naming this file and
 * saying to delete them when that panel lands. Same posture the land lane took.
 *
 * A LANE THAT WANTS THE FIGURES WITHOUT HTTP imports `needsCoverage` and
 * `needSeatings` from server/lib/needs.ts, which is where they live. The test
 * run and the health snapshot both read the same two figures, and re-deriving
 * either from its own SQL is how a preview and a report come to disagree.
 *
 * THIS MODULE IS SHARED WITH LANE N4. The member's own card (`member_needs`)
 * registers its routes here rather than in a second module, because
 * server/index.ts is under a no-net-lines ratchet that exempts exactly one
 * import and one register call per module.
 */
import type { Express } from "express";
import type { AppDeps } from "../lib/appDeps";
import { recordEvent } from "../lib/events";
import {
  coverageReport,
  linkNeed,
  readScope,
  retireNeed,
  scopeProblem,
  scopeSummary,
  unlinkNeed,
  upsertScopeNeed,
  type ScopeInput,
} from "../lib/needs";
import { HUMAN_NEEDS, NEED_DEPTHS, isNeedDepth, isNeedSubject, isNeedWeight } from "../../shared/needs";

type Deps = Pick<AppDeps, "isAdmin" | "authedUser" | "getPool">;

/** How many needs one PUT may carry. Ten platform needs plus room to name more. */
const MAX_SCOPE_ENTRIES = 100;

export function register(app: Express, deps: Deps): void {
  const { isAdmin, authedUser, getPool } = deps;

  /**
   * The scope, plus the taxonomy it was chosen from.
   *
   * The ten needs travel with the answer so a client has one round trip and
   * cannot render a scope row against a stale copy of the platform list.
   */
  app.get("/api/needs/scope", async (req, res) => {
    if (!(await authedUser(req))) return res.status(401).json({ error: "auth_required" });
    const rows = await readScope(getPool(), { includeRetired: true });
    res.json({
      needs: HUMAN_NEEDS,
      depths: NEED_DEPTHS,
      scope: rows,
      summary: scopeSummary(rows),
    });
  });

  /**
   * The two derived reads: what meets each need, and the seats it leans on.
   *
   * An empty scope answers `answered: false` with empty lists. A village that
   * has said nothing and a village that took on no needs are different facts,
   * and the payload keeps them apart so a screen can say which one it is.
   */
  app.get("/api/needs/coverage", async (req, res) => {
    if (!(await authedUser(req))) return res.status(401).json({ error: "auth_required" });
    res.json(await coverageReport(getPool()));
  });

  /**
   * Take on needs, or change what this village said about ones it has.
   *
   * IT RETIRES NOTHING. A PUT that retired every need absent from its body
   * would make a half-loaded screen an act of policy, and taking a need out of
   * scope is a decision with its own door below. So this route only ever adds
   * and updates, and unticking goes through /retire.
   *
   * ALL OR NOTHING. Every entry is validated before any of them is written, so
   * one bad row refuses the request instead of leaving half a scope saved and
   * a green toast over it.
   */
  app.put("/api/admin/needs/scope", async (req, res) => {
    if (!(await isAdmin(req))) return res.status(401).json({ error: "auth_required" });
    const body = req.body ?? {};
    const entries = Array.isArray(body) ? body : body.needs;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "Send a `needs` array." });
    }
    if (entries.length > MAX_SCOPE_ENTRIES) {
      return res.status(400).json({ error: `That is more than ${MAX_SCOPE_ENTRIES} needs in one save.` });
    }
    const wanted: ScopeInput[] = [];
    for (const raw of entries) {
      const entry: ScopeInput = {
        needKey: String(raw?.needKey ?? raw?.key ?? "").trim(),
        label: raw?.label === undefined ? undefined : String(raw.label),
        depthTarget: isNeedDepth(raw?.depthTarget) ? raw.depthTarget : undefined,
        breadthTargetPct:
          raw?.breadthTargetPct === undefined || raw?.breadthTargetPct === null
            ? undefined
            : Number(raw.breadthTargetPct),
        note: raw?.note === undefined ? undefined : raw.note === null ? null : String(raw.note),
        sortOrder: raw?.sortOrder === undefined ? undefined : Number(raw.sortOrder),
      };
      if (raw?.depthTarget !== undefined && !isNeedDepth(raw.depthTarget)) {
        return res.status(400).json({ error: "A depth is one of Deprived, Unmet, Alive, Satisfied or Thriving." });
      }
      const problem = scopeProblem(entry);
      if (problem) return res.status(400).json({ error: problem });
      wanted.push(entry);
    }
    const pool = getPool();
    const saved = [];
    for (const entry of wanted) {
      const r = await upsertScopeNeed(pool, entry);
      if (!r.ok) return res.status(400).json({ error: r.problem });
      saved.push(r.row);
    }
    const rows = await readScope(pool, { includeRetired: true });
    void recordEvent(pool, {
      kind: "needs",
      text: `the village named ${saved.length} of its needs`,
      actorUserId: (await authedUser(req))?.id ?? null,
      entityType: "village_needs",
      entityRef: null,
      audience: "admin",
    });
    res.json({ success: true, saved, scope: rows, summary: scopeSummary(rows) });
  });

  /**
   * Take one need out of scope.
   *
   * ITS LINKS STAY, and so does any snapshot frozen against it. Retiring twice
   * answers the same 200 with `changed: false` and never moves the timestamp,
   * so a second button press cannot rewrite when the village decided.
   */
  app.post("/api/admin/needs/retire", async (req, res) => {
    if (!(await isAdmin(req))) return res.status(401).json({ error: "auth_required" });
    const needKey = String(req.body?.needKey ?? "").trim();
    if (!needKey) return res.status(400).json({ error: "Name the need to retire." });
    const pool = getPool();
    const r = await retireNeed(pool, needKey);
    if (!r.found) return res.status(404).json({ error: "This village has not taken on that need." });
    if (r.changed) {
      void recordEvent(pool, {
        kind: "needs",
        text: `${r.row?.label ?? needKey} left the village's scope`,
        actorUserId: (await authedUser(req))?.id ?? null,
        entityType: "village_needs",
        entityRef: r.row?.id ?? null,
        audience: "admin",
      });
    }
    res.json({ success: true, changed: r.changed, need: r.row });
  });

  /** Tag a quest, a seat, a sink, a stay, an event or a place as meeting a need. */
  app.post("/api/admin/needs/links", async (req, res) => {
    if (!(await isAdmin(req))) return res.status(401).json({ error: "auth_required" });
    const body = req.body ?? {};
    if (!isNeedSubject(body.subjectType)) {
      return res.status(400).json({ error: "A link is onto a quest, a role, a sink, a stay, an event or a place." });
    }
    if (body.weight !== undefined && !isNeedWeight(body.weight)) {
      return res.status(400).json({ error: "A weight is primary or partial." });
    }
    const actor = await authedUser(req);
    const pool = getPool();
    const r = await linkNeed(pool, {
      needKey: String(body.needKey ?? "").trim(),
      subjectType: body.subjectType,
      subjectRef: String(body.subjectRef ?? ""),
      weight: body.weight,
      createdBy: actor?.id ?? null,
    });
    if (!r.ok) return res.status(400).json({ error: r.problem });
    res.json({ success: true, link: r.row });
  });

  /** Take one tag off. The need and the thing both stay. */
  app.delete("/api/admin/needs/links/:id", async (req, res) => {
    if (!(await isAdmin(req))) return res.status(401).json({ error: "auth_required" });
    const gone = await unlinkNeed(getPool(), req.params.id);
    if (!gone) return res.status(404).json({ error: "No link with that id." });
    res.json({ success: true });
  });
}
