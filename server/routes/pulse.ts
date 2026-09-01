/**
 * The village pulse: the public activity feed.
 *
 * One route, lifted out of server/index.ts unchanged. It reads the event
 * spine through server/lib/events.ts, so the only thing it needs from the
 * boot closure is the connection pool.
 *
 *   GET /api/game/pulse   the public events, newest first
 *
 * WHY THIS IS ITS OWN FILE rather than folded in with the admin roster block
 * it sat beside. Adjacency in server/index.ts records where somebody once
 * typed a route. It says nothing about what the route is. This one answers an
 * uncredentialed browser; the roster answers an admin. Filing them together
 * would put a public read and a member list in one dependency slice, and then
 * every later reader has to work out which of the routes in that slice are
 * gated. One name, one audience, one slice.
 *
 * REGISTERED WHERE IT WAS. `register()` is called from startServer at exactly
 * the point this route used to occupy, because Express matches in
 * registration order.
 */
import type { Express } from "express";
import type { AppDeps } from "../lib/appDeps";
import { recentEvents } from "../lib/events";
import { numberVar } from "../lib/variables";

type Deps = Pick<AppDeps, "getPool">;

export function register(app: Express, deps: Deps): void {
  const { getPool } = deps;

  // Village pulse: public activity feed (S11: reads the event spine; the
  // legacy {id, type, text, at} shape is preserved for the client).
  app.get("/api/game/pulse", async (_req, res) => {
    // village.pulse_max_entries was an admin knob nothing read — the 30 here
    // was hard-coded, so the setting did exactly nothing however it was set.
    const events = await recentEvents(getPool(), "public", Math.max(10, numberVar("village.pulse_max_entries")));
    res.json(events.map((e) => ({ id: e.id, type: e.kind, text: e.text, at: e.at })));
  });
}
