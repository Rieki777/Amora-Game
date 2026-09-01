/**
 * The FAQ domain: one public read, and the admin CRUD behind it.
 *
 * THE FIRST ROUTE MODULE. Everything about the shape here is the pattern the
 * rest of server/index.ts is meant to follow, so it is worth stating plainly:
 *
 *  - `register(app, deps)` is the only export that touches Express. It is
 *    called from startServer at exactly the point these routes used to be
 *    registered, because Express matches in registration order and moving a
 *    route past another one that could also match it is a behaviour change.
 *  - `deps` is a `Pick<AppDeps, ...>`, never the whole thing. The three names
 *    in that slice are the complete list of what these five routes can reach.
 *    Before this module existed the list was "everything in a 27,000-line
 *    closure", and no reader could have produced it.
 *  - The gates come in through `deps` rather than being imported, so the
 *    DEFAULT-DENY marker (server/lib/adminGate.ts) keeps working: the
 *    functions passed are the real `isAdmin` and `guardCapability`, which mark
 *    the request on entry. See server/lib/appDeps.ts.
 *
 * WHY THIS DOMAIN WENT FIRST, and it was measured rather than guessed: of the
 * several hundred route registrations still in server/index.ts (the live count
 * is in scripts/server-index-size-baseline.json, and the figure typed here
 * used to be 560, which stopped being true the first time anyone extracted
 * anything), these five are contiguous, carry
 * ZERO inline SQL (every read and write goes through the faqs document repo),
 * and reach nothing outside the three names below. The largest domains are not
 * the place to learn whether the pattern holds.
 *
 * The pathway vocabulary lives here too, with the domain that defines it,
 * and server/index.ts imports it back for the seed type.
 */
import type { Express } from "express";
import type { AppDeps } from "../lib/appDeps";

export const FAQ_PATHWAYS = ["investor", "steward", "resident", "prosperity"] as const;
export type FaqPathway = (typeof FAQ_PATHWAYS)[number];

type Deps = Pick<AppDeps, "isAdmin" | "guardCapability" | "faqsRepo">;

export function register(app: Express, deps: Deps): void {
  const { isAdmin, guardCapability, faqsRepo } = deps;

  app.get("/api/faqs/:pathway", async (req, res) => {
    const pathway = req.params.pathway;
    if (!FAQ_PATHWAYS.includes(pathway as FaqPathway)) return res.status(404).json({ error: "Unknown pathway" });
    const all = faqsRepo.get();
    res.json(all[pathway] ?? []);
  });

  app.get("/api/admin/faqs", async (req, res) => {
    if (!(await isAdmin(req))) return res.status(401).json({ error: "auth_required" });
    res.json(faqsRepo.get());
  });

  app.put("/api/admin/faqs/:pathway", async (req, res) => {
    if (!(await guardCapability(req, res, "story.tell"))) return;
    const pathway = req.params.pathway;
    if (!FAQ_PATHWAYS.includes(pathway as FaqPathway)) return res.status(404).json({ error: "Unknown pathway" });
    if (!Array.isArray(req.body)) return res.status(400).json({ error: "Body must be an array" });
    const all = faqsRepo.get();
    all[pathway] = req.body.map((item: any) => ({
      id: item.id || `${pathway.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      question: String(item.question ?? "").trim(),
      answer: String(item.answer ?? "").trim(),
    }));
    await faqsRepo.put(all);
    res.json({ success: true, items: all[pathway] });
  });

  app.post("/api/admin/faqs/:pathway", async (req, res) => {
    if (!(await guardCapability(req, res, "story.tell"))) return;
    const pathway = req.params.pathway;
    if (!FAQ_PATHWAYS.includes(pathway as FaqPathway)) return res.status(404).json({ error: "Unknown pathway" });
    const { question, answer } = req.body ?? {};
    if (!question) return res.status(400).json({ error: "Missing question" });
    const all = faqsRepo.get();
    if (!all[pathway]) all[pathway] = [];
    const item = {
      id: `${pathway.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      question: String(question).trim(),
      answer: String(answer ?? "").trim(),
    };
    all[pathway].push(item);
    await faqsRepo.put(all);
    res.json(item);
  });

  app.delete("/api/admin/faqs/:pathway/:id", async (req, res) => {
    if (!(await guardCapability(req, res, "story.tell"))) return;
    const { pathway, id } = req.params;
    if (!FAQ_PATHWAYS.includes(pathway as FaqPathway)) return res.status(404).json({ error: "Unknown pathway" });
    const all = faqsRepo.get();
    const before = (all[pathway] ?? []).length;
    all[pathway] = (all[pathway] ?? []).filter((f: any) => f.id !== id);
    if (all[pathway].length === before) return res.status(404).json({ error: "Not found" });
    await faqsRepo.put(all);
    res.json({ success: true });
  });
}
