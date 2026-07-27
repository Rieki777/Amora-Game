/**
 * The module framework's single reader/writer (S13). Everything about "which
 * modules are on, for whom" flows through this file: the lifecycle cache, the
 * requireModule() gate, the dependency rules, boot reconciliation, and the
 * preview-leak guard (moduleActivity).
 *
 * Lifecycle semantics (rank-ordered, off < preview < members < public):
 *   off      routes 404, zero nav, zero admin tabs, variables hidden
 *   preview  admins only — non-admins get the IDENTICAL 404 body, so the
 *            catalog of what a village is trying out never leaks
 *   members  signed-in only (anon gets 401, so the client can prompt login)
 *   public   everyone; per-route capability checks still apply on top
 *
 * Absent module_settings row = OFF (delta-only, like game variables): forks
 * inherit every new platform module as off, and enabling is always a
 * deliberate admin act recorded in module_events.
 */
import type { NextFunction, Request, Response } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  LIFECYCLE_RANK,
  MODULES,
  MODULES_BY_ID,
  type ModuleDef,
  type ModuleLifecycle,
} from "../../shared/modules";
import { recordEvent } from "./events";

interface ModuleRow {
  lifecycle: ModuleLifecycle;
  config: any;
  updatedAt: string | null;
}

let pool: Pool | null = null;
const settings = new Map<string, ModuleRow>();
/** Modules present in storage but absent from the registry — listed, never served. */
let orphanIds: string[] = [];
/** Modules served as OFF because a hard dependency is off (boot reconciliation). */
let demoted = new Map<string, string[]>();

export async function loadModuleSettings(p: Pool): Promise<void> {
  pool = p;
  const [rows] = await p.query<RowDataPacket[]>(
    "SELECT module_id, lifecycle, config, updated_at FROM module_settings",
  );
  settings.clear();
  orphanIds = [];
  for (const r of rows) {
    const id = String(r.module_id);
    if (!MODULES_BY_ID[id]) {
      orphanIds.push(id);
      continue;
    }
    let config = r.config;
    if (typeof config === "string") {
      try { config = JSON.parse(config); } catch { config = null; }
    }
    settings.set(id, {
      lifecycle: (r.lifecycle ?? "off") as ModuleLifecycle,
      config,
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at ?? null,
    });
  }
  reconcileGraph();
}

/** The STORED lifecycle (before demotion). Absent row = off. */
export function storedLifecycle(id: string): ModuleLifecycle {
  return settings.get(id)?.lifecycle ?? "off";
}

/**
 * The SERVED lifecycle: a module whose hard dependency is off is served as
 * off, however its row is set — a hand-edited table must degrade loudly,
 * not half-serve a module missing its substrate.
 */
export function effectiveLifecycle(id: string): ModuleLifecycle {
  const def = MODULES_BY_ID[id];
  if (!def) return "off";
  if (def.core) return "public";
  if (demoted.has(id)) return "off";
  return storedLifecycle(id);
}

export function moduleConfig<T = any>(id: string): T | null {
  return (settings.get(id)?.config as T) ?? null;
}

export function moduleOrphans(): string[] {
  return [...orphanIds];
}

export function moduleDemotions(): Array<{ id: string; missing: string[] }> {
  return Array.from(demoted.entries()).map(([id, missing]) => ({ id, missing }));
}

function reconcileGraph() {
  demoted = new Map();
  for (const def of MODULES) {
    if (def.core) continue;
    if (storedLifecycle(def.id) === "off") continue;
    const missing = def.requires.filter(
      (dep) => (MODULES_BY_ID[dep]?.core ? "public" : storedLifecycle(dep)) === "off",
    );
    if (missing.length) demoted.set(def.id, missing);
  }
}

/**
 * Boot reconciliation: loud, never brick. Demotions and orphans are logged
 * at fatal volume and surfaced in the admin panel; the site keeps serving.
 * Also asserts economy invariant #3: a token has at most one selling module.
 */
export function assertModuleGraph(): void {
  for (const [id, missing] of Array.from(demoted.entries())) {
    console.error(
      `[modules] FATAL-LEVEL CONFIG: "${id}" is configured ${storedLifecycle(id)} but requires [${missing.join(", ")}] which ${missing.length === 1 ? "is" : "are"} off — serving "${id}" as OFF until resolved`,
    );
  }
  for (const id of orphanIds) {
    console.error(`[modules] stored settings reference unknown module "${id}" — ignored, listed as orphan`);
  }
  const sellers = new Map<string, string>();
  for (const def of MODULES) {
    if (!def.sellsToken) continue;
    const prior = sellers.get(def.sellsToken);
    if (prior) {
      throw new Error(
        `module graph invalid: token "${def.sellsToken}" has two selling modules (${prior}, ${def.id}) — one selling module per token is a boot assertion, not a convention`,
      );
    }
    sellers.set(def.sellsToken, def.id);
  }
}

// ── The gate ─────────────────────────────────────────────────────────────────

export interface ModuleAuthDeps {
  /** Attaches req.adminUser when true (the host's isAdmin). */
  isAdmin(req: Request): Promise<boolean>;
  /** True when the request carries a valid member token. */
  isAuthed(req: Request): Promise<boolean>;
}

let authDeps: ModuleAuthDeps | null = null;
export function wireModuleAuth(deps: ModuleAuthDeps) {
  authDeps = deps;
}

/**
 * Route gate factory. Mount once per module prefix:
 *   app.use("/api/tools", requireModule("tools"));
 * Settlement webhooks are NEVER mounted behind this — in-flight orders must
 * settle even when a module is disabled (economy invariant #13).
 */
export function requireModule(id: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lc = effectiveLifecycle(id);
      // One 404 body for off AND preview-to-outsiders: existence is hidden.
      const hidden = () => res.status(404).json({ error: "module_disabled", module: id });
      if (lc === "off") return hidden();
      if (lc === "preview") {
        if (!authDeps || !(await authDeps.isAdmin(req))) return hidden();
        return next();
      }
      if (lc === "members") {
        if (!authDeps || !(await authDeps.isAuthed(req))) {
          return res.status(401).json({ error: "auth_required", module: id });
        }
        return next();
      }
      return next(); // public — capability checks still apply per route
    } catch (e) {
      next(e);
    }
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────

export type LifecycleResult =
  | { ok: true; lifecycle: ModuleLifecycle }
  | { ok: false; status: number; error: string; missing?: string[]; dependents?: string[]; count?: number; description?: string };

export interface LifecycleGuards {
  /** True while the deployment's only admin credential is a shared password —
   *  funds-bearing modules REFUSE to enable under that posture (invariant #11/#12). */
  sharedPasswordPosture(): boolean;
}

export async function setModuleLifecycle(
  id: string,
  next: ModuleLifecycle,
  byUserId: string | null,
  guards: LifecycleGuards,
): Promise<LifecycleResult> {
  if (!pool) throw new Error("module settings not loaded");
  const def = MODULES_BY_ID[id];
  if (!def) return { ok: false, status: 400, error: `Unknown module "${id}"` };
  if (def.core) return { ok: false, status: 400, error: `"${def.name}" is core and cannot change lifecycle in v1` };
  if (!(next in LIFECYCLE_RANK)) return { ok: false, status: 400, error: "lifecycle must be off, preview, members or public" };

  const current = storedLifecycle(id);
  if (next !== "off") {
    // Enabling (or staying on): every hard dependency must itself be non-off.
    const missing = def.requires.filter(
      (dep) => (MODULES_BY_ID[dep]?.core ? "public" : storedLifecycle(dep)) === "off",
    );
    if (missing.length) {
      return { ok: false, status: 409, error: `"${def.name}" requires ${missing.join(", ")} to be enabled first`, missing };
    }
    if (def.legalReview && current === "off" && guards.sharedPasswordPosture()) {
      return {
        ok: false,
        status: 403,
        error:
          "This module touches funds and cannot be enabled while a shared password is the only admin credential. Bootstrap per-admin identities first (economy invariants #11-#12).",
      };
    }
  } else {
    // Disabling: nothing non-off may still require this module…
    const dependents = MODULES.filter(
      (m) => !m.core && m.requires.includes(id) && storedLifecycle(m.id) !== "off",
    ).map((m) => m.id);
    if (dependents.length) {
      return { ok: false, status: 409, error: `${dependents.join(", ")} still require${dependents.length === 1 ? "s" : ""} "${def.name}"`, dependents };
    }
    // …and open economic state blocks the switch (invariant #13).
    if (def.openStateCheck) {
      const open = await def.openStateCheck();
      if (open.count > 0) {
        return {
          ok: false,
          status: 409,
          error: `"${def.name}" has open state: ${open.description}. Settle it first, then disable.`,
          count: open.count,
          description: open.description,
        };
      }
    }
  }

  await pool.query(
    "INSERT INTO module_settings (module_id, lifecycle, updated_by) VALUES (?,?,?) " +
      "ON DUPLICATE KEY UPDATE lifecycle = VALUES(lifecycle), updated_by = VALUES(updated_by)",
    [id, next, byUserId],
  );
  const row = settings.get(id) ?? { lifecycle: "off" as ModuleLifecycle, config: null, updatedAt: null };
  row.lifecycle = next;
  settings.set(id, row);
  reconcileGraph();
  await pool.query(
    "INSERT INTO module_events (id, module_id, kind, from_value, to_value, by_user_id) VALUES (?,?,?,?,?,?)",
    [`mev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, id, "lifecycle", current, next, byUserId],
  );
  return { ok: true, lifecycle: next };
}

export async function setModuleConfig(
  id: string,
  config: unknown,
  byUserId: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!pool) throw new Error("module settings not loaded");
  const def = MODULES_BY_ID[id];
  if (!def) return { ok: false, status: 400, error: `Unknown module "${id}"` };
  if (def.validateConfig) {
    const problem = def.validateConfig(config);
    if (problem) return { ok: false, status: 400, error: problem };
  }
  await pool.query(
    "INSERT INTO module_settings (module_id, config, updated_by) VALUES (?,?,?) " +
      "ON DUPLICATE KEY UPDATE config = VALUES(config), updated_by = VALUES(updated_by)",
    [id, JSON.stringify(config ?? null), byUserId],
  );
  const row = settings.get(id) ?? { lifecycle: "off" as ModuleLifecycle, config: null, updatedAt: null };
  row.config = config;
  settings.set(id, row);
  await pool.query(
    "INSERT INTO module_events (id, module_id, kind, from_value, to_value, by_user_id) VALUES (?,?,?,?,?,?)",
    [`mev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, id, "config", null, "updated", byUserId],
  );
  return { ok: true };
}

/**
 * The preview-leak guard (critique override #6): module code emits public
 * activity through THIS, and nothing lands on the Pulse while the module is
 * below 'members'. A structural no-op beats a review-enforced rule.
 */
export async function moduleActivity(
  moduleId: string,
  kind: string,
  text: string,
  extra?: { actorUserId?: string | null; entityType?: string | null; entityRef?: string | null },
): Promise<void> {
  if (!pool) return;
  if (LIFECYCLE_RANK[effectiveLifecycle(moduleId)] < LIFECYCLE_RANK.members) return;
  await recordEvent(pool, { kind, text, ...extra });
}

// ── Settlement seam ──────────────────────────────────────────────────────────
// The S13 stub registry moved to payments.ts (S32): modules with fiat
// settlement call registerPaymentHandlers(moduleId, {settle, reversal}) there,
// and the ONE raw-body webhook in index.ts routes through handleStripeEvent.
