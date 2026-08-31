/**
 * Training modules: the public list, and the admin CRUD behind it.
 *
 * Moved out of server/index.ts verbatim. Five registrations, contiguous, with
 * ZERO inline SQL: every read and write goes through the training collection
 * repository. The two names in the Deps slice below are the complete list of
 * what these routes can reach, which is the point of the move.
 *
 * `isAdmin` arrives through deps rather than by import so it stays the real
 * one, which marks the request for the DEFAULT-DENY middleware under
 * /api/admin (server/lib/adminGate.ts). A hand-rolled gate here would pass a
 * review and then turn every one of these admin routes into a 403.
 */
import type { Express } from "express";
import type { AppDeps } from "../lib/appDeps";

type Deps = Pick<AppDeps, "isAdmin" | "trainingRepo">;

export function register(app: Express, deps: Deps): void {
  const { isAdmin, trainingRepo } = deps;

  app.get("/api/training-modules", async (_req, res) => {
    const mods: any[] = trainingRepo.all();
    mods.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json(mods);
  });

  app.get("/api/admin/training-modules", async (req, res) => {
    if (!(await isAdmin(req))) {
      return res.status(401).json({ error: "auth_required" });
    }
    const mods: any[] = trainingRepo.all();
    mods.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json(mods);
  });

  app.post("/api/admin/training-modules", async (req, res) => {
    if (!(await isAdmin(req))) {
      return res.status(401).json({ error: "auth_required" });
    }
    const { title, description, type, url, order } = req.body ?? {};
    if (!title || !type) return res.status(400).json({ error: "Missing title or type" });
    const mods: any[] = trainingRepo.all();
    const entry = {
      id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      description: description ?? "",
      type,
      url: url ?? "",
      order: typeof order === "number" ? order : mods.length + 1,
    };
    mods.push(entry);
    await trainingRepo.replaceAll(mods);
    res.json(entry);
  });

  app.put("/api/admin/training-modules/:id", async (req, res) => {
    if (!(await isAdmin(req))) {
      return res.status(401).json({ error: "auth_required" });
    }
    const mods: any[] = trainingRepo.all();
    const idx = mods.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    const allowed = ["title", "description", "type", "url", "order"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) mods[idx][key] = req.body[key];
    }
    await trainingRepo.replaceAll(mods);
    res.json(mods[idx]);
  });

  app.delete("/api/admin/training-modules/:id", async (req, res) => {
    if (!(await isAdmin(req))) {
      return res.status(401).json({ error: "auth_required" });
    }
    const mods: any[] = trainingRepo.all();
    const filtered = mods.filter((m) => m.id !== req.params.id);
    if (filtered.length === mods.length) return res.status(404).json({ error: "Not found" });
    await trainingRepo.replaceAll(filtered);
    res.json({ success: true });
  });
}
