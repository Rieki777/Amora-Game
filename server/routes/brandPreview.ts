/**
 * What the founder's settings actually say, read past the process cache.
 *
 * ── THE OBSTACLE THIS MODULE EXISTS FOR ──────────────────────────────────
 *
 * The brand overlay is the `brand` row of `app_config`, held in the running
 * process by `dbDocument(getPool(), "brand", DEFAULT_BRAND)` in
 * server/index.ts. `dbDocument.get()` is SYNCHRONOUS and answers from a
 * process-local `cache` that `load()` fills. Every `load()` call site for a
 * document is inside `startServer`'s boot block (server/index.ts, the
 * `Promise.all` around line 1485). Nothing reloads a document after boot.
 *
 * `put()` is write-through: it writes the row and then sets `cache = doc`, so
 * a save made through `PUT /api/admin/brand` is visible to the process that
 * served it. Three writers are outside that:
 *
 *   1. Raw SQL against `app_config`. `scripts/import-map-scene.ts` writes the
 *      `brand` row directly (line 417), and so does a founder or an operator
 *      running an UPDATE by hand. The cache never hears about it.
 *   2. A migration. `drizzle/0112_game_start.sql` inserts an `app_config`
 *      document, and migrations run before the boot load, so that one is
 *      safe. A migration run against a LIVE process would not be.
 *   3. A second process. Railway keeps the previous container serving until
 *      the new one passes its health check, so a deploy has a window with two
 *      caches over one row. server/repos/store-db.ts names this itself:
 *      "One process per deployment (Railway) is what makes the cache sound."
 *
 * In every one of those the row is right and `GET /api/game/config` keeps
 * answering with what the process read at boot, until a restart. A founder
 * who saves and sees no change concludes the product is broken, and on the
 * evidence in front of them they are correct.
 *
 * ── WHAT THIS MODULE DOES ABOUT IT ───────────────────────────────────────
 *
 * `GET /api/admin/brand/preview` runs its own SELECT against `app_config`
 * every time it is called. It never touches `brandRepo.get()` for the saved
 * plane. It returns three planes side by side, unresolved:
 *
 *   stored     the row, read fresh, with an explicit readability verdict
 *   serving    what the running process holds, which is what visitors see
 *   defaults   the platform values a blank field inherits
 *
 * The three-way comparison happens in
 * client/src/components/admin/brandPreview.ts, which is pure and tested with
 * no database. Keeping the resolution there means one function decides what
 * "set", "blank" and "could not read" mean, and a test can drive all three
 * without provisioning a schema.
 *
 * ── A ROW THAT EXISTS AND CANNOT BE READ IS NOT AN ABSENT ROW ────────────
 *
 * `dbDocument.load()` folds those two together. Its parse failure path is
 * `catch { v = null }`, and a null `v` lands in the same `cache = null` that
 * a missing row produces, so `exists()` answers false for a row that is
 * physically there. A corrupt brand document therefore reads as a fresh
 * village with no settings, on every surface, silently.
 *
 * `readStoredBrand` below refuses that fold. A row that is present and
 * unparseable comes back `present: true, readable: false`, with the reason,
 * and the preview says so in those words. This module does not change
 * `dbDocument`; it declines to copy its one conflation.
 *
 * ── THE RESYNC, AND WHAT IT IS NOT ───────────────────────────────────────
 *
 * `POST /api/admin/brand/resync` calls `brandRepo.load()`, which is the exact
 * call boot makes, on one document, behind the admin gate. It adds no timer,
 * no polling, no invalidation hook, and it changes the behaviour of no other
 * `app_config` document. It exists so that a founder who has just been shown
 * the drift has something to press. See the pull request for the reasoning
 * behind leaving `dbDocument` itself alone.
 */
import type { Express } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { AppDeps } from "../lib/appDeps";
import { GAME_CONFIG } from "../../shared/gameConfig";

type Deps = Pick<AppDeps, "isAdmin" | "getPool" | "brandRepo">;

/**
 * The `brand` row as the database holds it, with the three outcomes kept
 * apart. A caller that treats `document: null` as "the founder has set
 * nothing" without reading `readable` first has reintroduced the exact
 * conflation this shape exists to prevent.
 */
export interface StoredBrand {
  /** False when the read failed, or when the row is there and unparseable. */
  readable: boolean;
  /** Whether a row exists at all. Meaningful only when `readable` is true, or when the failure was a parse. */
  present: boolean;
  /** The row's JSON. Null whenever `readable` is false. */
  document: Record<string, unknown> | null;
  /** A sentence for the founder. Empty when `readable` is true. */
  error: string;
}

/**
 * One SELECT, straight at the row, every call.
 *
 * Never throws. A preview whose job is to report what could not be read has
 * no business turning a database outage into an unhandled rejection, and
 * Express 4 has no async error wrapper here, so a throw out of a handler
 * hangs the request with no answer.
 */
export async function readStoredBrand(pool: Pool): Promise<StoredBrand> {
  let rows: RowDataPacket[];
  try {
    const [result] = await pool.query<RowDataPacket[]>(
      "SELECT `value` FROM `app_config` WHERE `config_key` = 'brand'",
    );
    rows = result;
  } catch {
    return {
      readable: false,
      present: false,
      document: null,
      error: "The database did not answer, so what you have saved could not be read.",
    };
  }

  if (!rows[0]) {
    // A readable absence. The founder has saved nothing, and every field
    // inherits the platform default. That is a real answer.
    return { readable: true, present: false, document: null, error: "" };
  }

  let value: unknown = rows[0].value;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {
        readable: false,
        present: true,
        document: null,
        error: "Your saved settings are stored in a shape this server could not parse.",
      };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      readable: false,
      present: true,
      document: null,
      error: "Your saved settings are stored in a shape this server could not parse.",
    };
  }

  return { readable: true, present: true, document: value as Record<string, unknown>, error: "" };
}

export function register(app: Express, deps: Deps): void {
  const { isAdmin, getPool, brandRepo } = deps;

  /**
   * The read-through. `brandRepo` appears here for the SERVING plane only,
   * which is the point of the comparison. The saved plane comes from
   * `readStoredBrand` and from nowhere else.
   */
  app.get("/api/admin/brand/preview", async (req, res) => {
    if (!(await isAdmin(req))) return res.status(401).json({ error: "auth_required" });
    const stored = await readStoredBrand(getPool());
    res.json({
      stored,
      // `get()` answers from memory and cannot fail, so this plane carries no
      // readability verdict. It is what a visitor is being served right now.
      serving: brandRepo.get(),
      defaults: { project: GAME_CONFIG.project, images: GAME_CONFIG.images },
    });
  });

  /**
   * Catch the running process up with the row, without a deploy.
   *
   * `changed` is what the founder needs to know: false means the cache was
   * already current and the thing they are looking at has some other cause.
   */
  app.post("/api/admin/brand/resync", async (req, res) => {
    if (!(await isAdmin(req))) return res.status(401).json({ error: "auth_required" });
    const before = JSON.stringify(brandRepo.get() ?? null);
    try {
      await brandRepo.load();
    } catch {
      return res.status(503).json({
        error: "resync_failed",
        message: "The database did not answer, so the live settings were left as they were.",
      });
    }
    const after = JSON.stringify(brandRepo.get() ?? null);
    res.json({ success: true, changed: before !== after });
  });
}
