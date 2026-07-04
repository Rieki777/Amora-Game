import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";
import multer from "multer";
import bcrypt from "bcrypt";
import { GAME_CONFIG, getStage, stageIndex } from "../shared/gameConfig";

const BCRYPT_SALT_ROUNDS = 10;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
// Seed sources live OUTSIDE data/ on purpose: in production, data/ is a mounted
// volume, and mounting a volume onto a path shadows whatever the Docker image had
// there. Any seed file that lived inside data/ would silently vanish at runtime
// the moment a volume is attached. Seeds must ship as part of the app image.
const SEEDS_DIR = path.resolve(__dirname, "..", "server", "seeds");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const CONTENT_SEED_FILE = path.join(SEEDS_DIR, "content-seed.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const JOURNEY_FILE = path.join(DATA_DIR, "journey-state.json");
const EMAIL_CONFIG_FILE = path.join(DATA_DIR, "email-config.json");
const INVESTOR_DOCS_FILE = path.join(DATA_DIR, "investor-docs.json");
const TRAINING_MODULES_FILE = path.join(DATA_DIR, "training-modules.json");
const FAQS_FILE = path.join(DATA_DIR, "faqs.json");
const QUESTS_FILE = path.join(DATA_DIR, "quests.json");
const QUESTS_SEED_FILE = path.join(SEEDS_DIR, "quests-seed.json");
const QUEST_CLAIMS_FILE = path.join(DATA_DIR, "quest-claims.json");
const GRATITUDE_LOG_FILE = path.join(DATA_DIR, "gratitude-log.json");
const ACTIVITY_FILE = path.join(DATA_DIR, "activity.json");
const SEASON_FILE = path.join(DATA_DIR, "season.json");
const MILESTONES_FILE = path.join(DATA_DIR, "milestones.json");
const VISIT_CONFIG_FILE = path.join(DATA_DIR, "visit-config.json");
const INVESTOR_SUMMARY_FILE = path.join(DATA_DIR, "investor-summary.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const JOURNEY_PASSWORD = process.env.JOURNEY_PASSWORD || "change-me";

const DEFAULT_EMAIL_CONFIG = {
  investor: "",
  steward: "",
  resident: "",
  prosperity: "",
  resend_api_key: "",
};

const FAQ_PATHWAYS = ["investor", "steward", "resident", "prosperity"] as const;
type FaqPathway = (typeof FAQ_PATHWAYS)[number];

const DEFAULT_FAQS: Record<FaqPathway, { id: string; question: string; answer: string }[]> = {
  investor: [
    { id: "inv-1", question: "What is the legal structure?", answer: "Amora uses a Horizontal Condominium under Costa Rican law, combined with a 508(c)(1)(a) community organization. Individual lot ownership with shared commons management." },
    { id: "inv-2", question: "How does debt vs equity work?", answer: "We prefer debt financing to keep community ownership intact. Investors lend to the project and receive interest plus priority on lot purchases." },
    { id: "inv-3", question: "What is the minimum investment?", answer: "Minimum amounts vary by vehicle. Contact the team to discuss options that match your capacity." },
    { id: "inv-4", question: "What are my exit options?", answer: "Investors can exit through lot sale at appreciated value, business equity stake, or structured buy-back options. We prioritize liquidity for investors who need it." },
    { id: "inv-5", question: "What if the project doesn't complete?", answer: "Investors hold debt secured against the land. In the unlikely event of project failure, debt holders have first claim on the 266-acre property which was appraised at $16M+ in January 2026." },
    { id: "inv-6", question: "Can I live at Amora as an investor?", answer: "Yes. Investors who become residents get priority access to lots, and you can build a home on your lot. Your investment can apply toward your Land Share Agreement." },
    { id: "inv-7", question: "What fees are involved?", answer: "Annual village contribution fee covers shared services, infrastructure maintenance, and circle operations. Exact amounts will be detailed in your investor pack." },
    { id: "inv-8", question: "How does governance work?", answer: "Resident investors gain voice in village decisions through our consent-based circle system. The more you contribute over time, the more governance weight you earn." },
    { id: "inv-9", question: "When is ROI expected?", answer: "The 15-year financial model projects returns from resort, retail, and residential components. Year-by-year projections are in the Investor Pack." },
  ],
  steward: [
    { id: "stw-1", question: "How are decisions made?", answer: "Through sociocratic circles using consent-based decision making. No single person, including the founders, can override a community consent vote." },
    { id: "stw-2", question: "Do I get paid as a Village Steward?", answer: "Contributions are compensated in Gratitude (1 Gratitude = $1 USD in value). As Amora's shared businesses generate revenue, Gratitude converts to cash." },
    { id: "stw-3", question: "How much time does stewardship require?", answer: "Roles are seasonal (3-month commitments). The time varies by role: some are a few hours per week, others are near full-time." },
  ],
  resident: [
    { id: "res-1", question: "What internet is available?", answer: "Dominicalito has reliable fiber internet. The village will have dedicated high-speed connection for residents and home offices." },
    { id: "res-2", question: "What schooling options exist for children?", answer: "Plans include an on-site learning center. Local bilingual schools are within 20 minutes. Many resident families are worldschoolers." },
    { id: "res-3", question: "Can I own my home outright?", answer: "Land Share Agreements provide long-term secure access, renewable and inheritable by your children tax-free. The community co-owns the land, you own your structure." },
  ],
  prosperity: [
    { id: "pro-1", question: "What businesses are needed?", answer: "The Prosperity Packet details all opportunities. High-priority needs include food production, wellness services, childcare, construction, and technology." },
    { id: "pro-2", question: "How does revenue sharing work?", answer: "A percentage of revenue (exact structure in the Prosperity Packet) is distributed as Gratitude to the village community. You operate your business; the community benefits from your success." },
    { id: "pro-3", question: "Do I need to live at Amora to run a business?", answer: "Some businesses require on-site presence. Others can be managed remotely. Discuss your model with the team during your Prosperity Call." },
  ],
};

const DEFAULT_MILESTONES = [
  { id: "land-acquired", phase: "Phase 0", title: "Land Acquired", description: "266 acres in Dominicalito, Costa Rica secured.", status: "complete", completedDate: "2024-06", updateNote: "", order: 1 },
  { id: "appraisal-2026", phase: "Phase 0", title: "January 2026 Appraisal", description: "Independent appraisal values property at $16M+.", status: "complete", completedDate: "2026-01", updateNote: "", order: 2 },
  { id: "founding-team", phase: "Phase 1", title: "Founding Team Assembled", description: "Core co-creators circle formed and active.", status: "complete", completedDate: "2025-09", updateNote: "", order: 3 },
  { id: "site-planning", phase: "Phase 1", title: "Site Planning & Design", description: "Master plan, infrastructure layout, and first home designs.", status: "in-progress", completedDate: null, updateNote: "Master plan review underway.", order: 4 },
  { id: "retreat-center", phase: "Phase 2", title: "Retreat Center", description: "120-150 key eco-resort and retreat facility.", status: "upcoming", completedDate: null, updateNote: "", order: 5 },
  { id: "show-homes", phase: "Phase 2", title: "First 10 Show Homes", description: "First residential structures built and move-in ready.", status: "upcoming", completedDate: null, updateNote: "", order: 6 },
  { id: "health-center", phase: "Phase 3", title: "Health + Wellness Center", description: "On-site medical and holistic wellness facility.", status: "upcoming", completedDate: null, updateNote: "", order: 7 },
  { id: "full-village", phase: "Phase 4", title: "Full Village (150+ homes)", description: "Complete residential buildout with all shared infrastructure.", status: "future", completedDate: null, updateNote: "", order: 8 },
];

const DEFAULT_VISIT_CONFIG = {
  hero_subtitle: "Experience the land, meet the people, and decide if Amora is where you belong.",
  visit_types: [
    { id: "community-call", title: "Community Call", duration: "90 minutes", format: "Virtual (Zoom)", cost: "Free", description: "Meet the founding team and current members. Ask any question. Hear the vision directly. This is your first step.", cta_label: "Join the Next Call", cta_url: "https://amora.cr/event/discover-amora-webinar-qa/", order: 1 },
    { id: "land-tour", title: "Land Tour Visit", duration: "1-3 days", format: "In Person, Dominicalito CR", cost: "Details TBD", description: "Walk the 266 acres with a founding team member. See the infrastructure underway. Stay nearby or camp on the land. Meals with the community included.", cta_label: "Request a Visit", cta_url: "", order: 2 },
    { id: "immersion", title: "Village Weaving Immersion", duration: "2-4 weeks", format: "In Person, Dominicalito CR", cost: "Details TBD", description: "Live and work alongside the founding community. Shadow circle meetings, contribute to active projects, and discover where your gifts are most needed. This is the deepest way to know before you commit.", cta_label: "Apply for Immersion", cta_url: "", order: 3 },
  ],
  logistics: {
    getting_there: "Dominicalito is on Costa Rica's Pacific coast. Nearest airport: Quepos (45 min) or San Jose (3.5 hours). Charter flights available to Quepos from the US west coast.",
    accommodation: "Accommodation details will be provided when you book. Options range from nearby guesthouses to on-land camping.",
    what_to_bring: "Comfortable outdoor clothes, sun protection, rain gear. The dry season runs December to April; green season May to November brings afternoon rain.",
    contact_note: "Ready to visit? Fill in the form below or email the team directly.",
  },
};

const DEFAULT_INVESTOR_SUMMARY = {
  headline: "What Your Investment Looks Like",
  intro: "We believe transparency converts. Here's the plain-language version of what investing in Amora means.",
  details: [
    { id: "min-investment", label: "Minimum Investment", value: "To be confirmed", note: "Contact the team to discuss options that match your capacity.", icon: "dollar" },
    { id: "structure", label: "Investment Structure", value: "Debt (secured notes)", note: "We prioritize debt over equity so the community retains ownership. You lend to the project and receive interest plus priority on lot purchases.", icon: "shield" },
    { id: "projected-irr", label: "Projected IRR", value: "19.6%", note: "15-year model based on phased development. Past performance and projections are not guarantees of future results.", icon: "trending-up" },
    { id: "interest-rate", label: "Interest Rate", value: "To be confirmed", note: "Exploring a 1% regenerative development loan. Rates for early investors will be detailed in the Investor Pack.", icon: "percent" },
    { id: "term", label: "Investment Term", value: "To be confirmed", note: "Multiple term options are available. Details in the Investor Pack.", icon: "calendar" },
    { id: "exit", label: "Exit Options", value: "Lot sale, equity stake, or structured buyback", note: "We prioritize liquidity for investors who need it.", icon: "arrow-right" },
    { id: "governance", label: "Governance Rights", value: "Voice in village decisions", note: "Resident investors participate in consent-based circle governance. The more you contribute over time, the more governance weight you earn.", icon: "users" },
  ],
  disclaimer: "Investment in Amora involves risk. All projections are forward-looking and not guaranteed. This is not a solicitation. Speak with your financial and legal advisors before making any investment decision.",
  cta_label: "Request Full Investor Pack",
  cta_url: "",
};

const DEFAULT_TRAINING_MODULES = [
  {
    id: "nvc-intro",
    title: "Introduction to Nonviolent Communication",
    description:
      "The foundation of how we talk to each other at Amora. Learn the four components of NVC and why they matter.",
    type: "Video",
    url: "",
    order: 1,
  },
  {
    id: "authentic-relating",
    title: "Authentic Relating Practices",
    description:
      "Games and practices for deeper, more honest connection with the people around you.",
    type: "Practice",
    url: "",
    order: 2,
  },
  {
    id: "consent-decisions",
    title: "Consent-Based Decision Making",
    description:
      "How Amora makes decisions together: the difference between consensus and consent, and why it matters.",
    type: "Article",
    url: "",
    order: 3,
  },
  {
    id: "circle-facilitation",
    title: "Circle Facilitation Basics",
    description:
      "How to hold and participate in a circle meeting. The roles, the rhythms, and the practices.",
    type: "Workshop",
    url: "",
    order: 4,
  },
];

const FORM_TYPE_TO_PATHWAY: Record<string, "investor" | "steward" | "resident" | "prosperity"> = {
  investor: "investor",
  "investor-pack": "investor",
  "investor-call": "investor",
  "investor-doc-request": "investor",
  steward: "steward",
  resident: "resident",
  prosperity: "prosperity",
  contact: "prosperity",
};

function legacySha256(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Accept legacy SHA256 hashes for existing users (transparent upgrade on next save)
  if (storedHash === legacySha256(password)) return true;
  try {
    return await bcrypt.compare(password, storedHash);
  } catch {
    return false;
  }
}

function authPassword(req: express.Request): string | undefined {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7).trim();
  // Back-compat: still accept query/body password during rollout
  if (typeof req.query.password === "string") return req.query.password;
  if (req.body && typeof req.body.password === "string") return req.body.password;
  return undefined;
}

function requireAdmin(req: express.Request): boolean {
  return authPassword(req) === ADMIN_PASSWORD;
}

function requireJourney(req: express.Request): boolean {
  return authPassword(req) === JOURNEY_PASSWORD;
}

function encodeToken(userId: string, email: string): string {
  return btoa(JSON.stringify({ userId, email, timestamp: Date.now() }));
}

function decodeToken(token: string): { userId: string; email: string; timestamp: number } | null {
  try {
    const decoded = JSON.parse(atob(token));
    if (!decoded.userId || !decoded.email || typeof decoded.timestamp !== "number") return null;
    if (Date.now() - decoded.timestamp > 30 * 24 * 60 * 60 * 1000) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Seed a data file from a seed source, but also self-heal a known volume-mount
 * failure mode: if a data volume gets attached to an already-deployed service
 * (Railway and most PaaS volume mounts do this), the mount shadows whatever the
 * Docker image had at that path — including any seed file that used to live
 * inside data/. The very first boot after that mount then "succeeds" at writing
 * only the trivial empty placeholder (`{}`/`[]`), because it read from a seed
 * path that had just vanished underneath it. Seed sources now live outside the
 * mounted directory (see SEEDS_DIR above) so this shouldn't recur, but this
 * check repairs any data file stuck at that placeholder from before the fix.
 */
function seedIfMissingOrEmpty(dataFile: string, seedFile: string, emptyValue: string) {
  const seedContent = fs.existsSync(seedFile) ? fs.readFileSync(seedFile, "utf-8") : null;
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, seedContent ?? emptyValue);
    return;
  }
  if (seedContent && fs.readFileSync(dataFile, "utf-8").trim() === emptyValue) {
    fs.writeFileSync(dataFile, seedContent);
  }
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(SUBMISSIONS_FILE)) fs.writeFileSync(SUBMISSIONS_FILE, "[]");
  seedIfMissingOrEmpty(CONTENT_FILE, CONTENT_SEED_FILE, "{}");
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  if (!fs.existsSync(JOURNEY_FILE)) fs.writeFileSync(JOURNEY_FILE, JSON.stringify({ checkboxes: {}, copy: {}, kanban: {}, decisions: {} }, null, 2));
  if (!fs.existsSync(EMAIL_CONFIG_FILE)) fs.writeFileSync(EMAIL_CONFIG_FILE, JSON.stringify(DEFAULT_EMAIL_CONFIG, null, 2));
  if (!fs.existsSync(INVESTOR_DOCS_FILE)) fs.writeFileSync(INVESTOR_DOCS_FILE, "[]");
  if (!fs.existsSync(TRAINING_MODULES_FILE)) fs.writeFileSync(TRAINING_MODULES_FILE, JSON.stringify(DEFAULT_TRAINING_MODULES, null, 2));
  if (!fs.existsSync(FAQS_FILE)) fs.writeFileSync(FAQS_FILE, JSON.stringify(DEFAULT_FAQS, null, 2));
  if (!fs.existsSync(MILESTONES_FILE)) fs.writeFileSync(MILESTONES_FILE, JSON.stringify(DEFAULT_MILESTONES, null, 2));
  if (!fs.existsSync(VISIT_CONFIG_FILE)) fs.writeFileSync(VISIT_CONFIG_FILE, JSON.stringify(DEFAULT_VISIT_CONFIG, null, 2));
  if (!fs.existsSync(INVESTOR_SUMMARY_FILE)) fs.writeFileSync(INVESTOR_SUMMARY_FILE, JSON.stringify(DEFAULT_INVESTOR_SUMMARY, null, 2));
  seedIfMissingOrEmpty(QUESTS_FILE, QUESTS_SEED_FILE, "[]");
  if (!fs.existsSync(QUEST_CLAIMS_FILE)) fs.writeFileSync(QUEST_CLAIMS_FILE, "[]");
  if (!fs.existsSync(GRATITUDE_LOG_FILE)) fs.writeFileSync(GRATITUDE_LOG_FILE, "[]");
  if (!fs.existsSync(ACTIVITY_FILE)) fs.writeFileSync(ACTIVITY_FILE, "[]");
  if (!fs.existsSync(SEASON_FILE)) fs.writeFileSync(SEASON_FILE, JSON.stringify(GAME_CONFIG.season, null, 2));
}

// ── Game engine helpers (platform-level; all project specifics live in gameConfig) ──

function requireUser(req: express.Request): any | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const decoded = decodeToken(header.slice(7));
  if (!decoded) return null;
  const users = readJson(USERS_FILE) ?? { users: [] };
  return users.users.find((u: any) => u.id === decoded.userId) ?? null;
}

function addActivity(type: string, text: string) {
  const log: any[] = readJson(ACTIVITY_FILE) ?? [];
  log.push({ id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, text, at: new Date().toISOString() });
  writeJson(ACTIVITY_FILE, log.slice(-500));
}

function currentCycleId(): string {
  return new Date().toISOString().slice(0, 7); // calendar month, e.g. "2026-07"
}

function firstName(name: string): string {
  return String(name ?? "").trim().split(/\s+/)[0] || "Someone";
}

function hasMembership(user: any): boolean {
  if (user.membershipGranted) return true;
  const submissions: any[] = readJson(SUBMISSIONS_FILE) ?? [];
  const email = String(user.email ?? "").toLowerCase();
  return submissions.some(
    (s) => s.type === "membership-508" && String(s.data?.email ?? "").toLowerCase() === email
  );
}

function consentedQuestCount(userId: string): number {
  const claims: any[] = readJson(QUEST_CLAIMS_FILE) ?? [];
  return claims.filter((c) => c.userId === userId && c.status === "consented").length;
}

function trainingComplete(user: any): boolean {
  const mods: any[] = readJson(TRAINING_MODULES_FILE) ?? [];
  if (!mods.length) return false;
  const done: string[] = user.journeys?.training ?? [];
  return mods.every((m) => done.includes(m.id));
}

/** Compute the highest stage the player has earned, per gameConfig rules. */
function computeStage(user: any): string {
  let earned = GAME_CONFIG.stages[0].id;
  const grantedIdx = user.stageGranted ? stageIndex(user.stageGranted) : -1;
  for (const stage of GAME_CONFIG.stages) {
    const idx = stageIndex(stage.id);
    let ok = false;
    switch (stage.rule.type) {
      case "default": ok = true; break;
      case "account": ok = true; break; // having a user record implies an account
      case "training-complete": ok = trainingComplete(user); break;
      case "membership": ok = hasMembership(user); break;
      case "quests": ok = consentedQuestCount(user.id) >= stage.rule.min; break;
      case "granted": ok = grantedIdx >= idx; break;
    }
    if (ok && idx > stageIndex(earned)) earned = stage.id;
  }
  if (grantedIdx > stageIndex(earned)) earned = user.stageGranted;
  return earned;
}

function gratitudeBudget(user: any): { total: number; spent: number; remaining: number; cycleId: string } {
  const stage = getStage(computeStage(user));
  const total = Math.round(GAME_CONFIG.gratitude.monthlyBudget * stage.gratitudeMultiplier);
  const cycleId = currentCycleId();
  const log: any[] = readJson(GRATITUDE_LOG_FILE) ?? [];
  const spent = log
    .filter((g) => g.fromId === user.id && g.cycleId === cycleId)
    .reduce((acc, g) => acc + (g.amount ?? 0), 0);
  return { total, spent, remaining: Math.max(0, total - spent), cycleId };
}

function nextActionFor(user: any): { id: string; label: string; href: string } {
  const claims: any[] = (readJson(QUEST_CLAIMS_FILE) ?? []).filter((c: any) => c.userId === user.id);
  const budget = gratitudeBudget(user);
  for (const rule of GAME_CONFIG.nextActions) {
    switch (rule.when) {
      case "no-training": if (!trainingComplete(user)) return rule; break;
      case "no-membership": if (!hasMembership(user)) return rule; break;
      case "no-quest-claimed": if (claims.length === 0) return rule; break;
      case "quest-in-progress": if (claims.some((c) => c.status === "claimed" || c.status === "submitted")) return rule; break;
      case "gratitude-unspent": if (budget.remaining > 0 && budget.total > 0) return rule; break;
      case "always": return rule;
    }
  }
  return GAME_CONFIG.nextActions[GAME_CONFIG.nextActions.length - 1];
}

function getEmailConfig() {
  const cfg = readJson(EMAIL_CONFIG_FILE);
  return { ...DEFAULT_EMAIL_CONFIG, ...(cfg ?? {}) };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSubmissionEmailHtml(type: string, data: Record<string, unknown>, adminUrl: string): string {
  const rows = Object.entries(data)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;font-weight:600;color:#2D5A5A;background:#f4f7f7;border-bottom:1px solid #e5e7eb;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 12px;color:#1f2937;border-bottom:1px solid #e5e7eb;white-space:pre-wrap">${escapeHtml(typeof v === "object" ? JSON.stringify(v) : String(v ?? ""))}</td></tr>`
    )
    .join("");
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;padding:24px;color:#1f2937">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#2D5A5A;color:#fff;padding:20px 24px"><div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.7">New ${escapeHtml(type)} submission</div><div style="font-size:20px;font-weight:700;margin-top:4px">Amora</div></div>
  <div style="padding:20px 24px">
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
    <div style="margin-top:24px"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#2D5A5A;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Open Admin</a></div>
  </div>
</div></body></html>`;
}

async function sendResendEmail(opts: { to: string[]; subject: string; html: string; from?: string }): Promise<void> {
  const cfg = getEmailConfig();
  if (!cfg.resend_api_key) {
    console.log("[RESEND] API key not set, skipping email");
    return;
  }
  if (!opts.to.length) {
    console.log("[RESEND] No recipients, skipping email");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.resend_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from ?? "Amora Site <notifications@amora.cr>",
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[RESEND ERROR]", res.status, errText);
    }
  } catch (err) {
    console.error("[RESEND ERROR]", err);
  }
}

function recipientsForType(type: string): string[] {
  const cfg = getEmailConfig();
  const pathway = FORM_TYPE_TO_PATHWAY[type];
  if (pathway && cfg[pathway]) return [cfg[pathway]];
  // Fallback: send to all configured pathway inboxes
  return Array.from(
    new Set(
      ["investor", "steward", "resident", "prosperity"]
        .map((k) => cfg[k as keyof typeof cfg])
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    )
  );
}

function readJson(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function startServer() {
  ensureDataFiles();

  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "1mb" }));

  // CORS
  const allowedOrigin = process.env.FRONTEND_URL || "https://amora.regencivics.earth";
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", allowedOrigin);
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    next();
  });

  // Health check — `build` identifies which deployment is live (bump on notable releases)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", build: "2026-07-04-audit", timestamp: new Date().toISOString() });
  });

  // Form Submission
  // POST /api/forms/submit  { type: string, data: object }
  app.post("/api/forms/submit", (req, res) => {
    const { type, data } = req.body;
    if (!type || !data) {
      return res.status(400).json({ error: "Missing type or data" });
    }
    const submissions: unknown[] = readJson(SUBMISSIONS_FILE) ?? [];
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      data,
      submittedAt: new Date().toISOString(),
    };
    submissions.push(entry);
    writeJson(SUBMISSIONS_FILE, submissions);

    // Fire-and-forget Resend notification
    (async () => {
      const recipients = recipientsForType(type);
      if (!recipients.length) {
        console.log(`[RESEND] No recipient configured for type "${type}", skipping`);
        return;
      }
      const applicantName =
        (data as any)?.name ?? (data as any)?.firstName ?? (data as any)?.email ?? "Anonymous";
      const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "amora.regencivics.earth";
      const proto = req.headers["x-forwarded-proto"] ?? "https";
      const adminUrl = `${proto}://${host}/admin`;
      await sendResendEmail({
        to: recipients,
        subject: `[Amora] New ${type} application from ${applicantName}`,
        html: buildSubmissionEmailHtml(type, data, adminUrl),
      });
    })();

    res.json({ success: true, id: (entry as any).id });
  });

  // Admin: List Submissions
  // GET /api/admin/submissions?password=1love&type=investor
  app.get("/api/admin/submissions", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    let submissions: any[] = readJson(SUBMISSIONS_FILE) ?? [];
    if (req.query.type) {
      submissions = submissions.filter((s) => s.type === req.query.type);
    }
    submissions.sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
    res.json(submissions);
  });

  // Admin: Delete Submission
  app.delete("/api/admin/submissions/:id", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const submissions: any[] = readJson(SUBMISSIONS_FILE) ?? [];
    const filtered = submissions.filter((s) => s.id !== req.params.id);
    if (filtered.length === submissions.length) {
      return res.status(404).json({ error: "Not found" });
    }
    writeJson(SUBMISSIONS_FILE, filtered);
    res.json({ success: true });
  });

  // Admin: Export Submissions as CSV
  // GET /api/admin/submissions/export?password=1love&type=optional
  app.get("/api/admin/submissions/export", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    let submissions: any[] = readJson(SUBMISSIONS_FILE) ?? [];
    if (req.query.type) {
      submissions = submissions.filter((s) => s.type === req.query.type);
    }
    submissions.sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
    
    // Collect all unique keys from data objects
    const allDataKeys = new Set<string>();
    submissions.forEach((s) => {
      if (s.data && typeof s.data === 'object') {
        Object.keys(s.data).forEach((key) => allDataKeys.add(key));
      }
    });
    const sortedDataKeys = Array.from(allDataKeys).sort();
    
    // Build CSV header
    const headers = ['id', 'type', 'submittedAt', ...sortedDataKeys];
    const csvLines: string[] = [headers.map((h) => `"${h}"`).join(',')];
    
    // Build CSV rows
    submissions.forEach((s) => {
      const row = [
        `"${s.id}"`,
        `"${s.type}"`,
        `"${s.submittedAt}"`,
        ...sortedDataKeys.map((key) => {
          const value = s.data?.[key];
          const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
          return `"${strValue.replace(/"/g, '""')}"`;
        }),
      ];
      csvLines.push(row.join(','));
    });
    
    const csv = csvLines.join('\n');
    const today = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="amora-submissions-${today}.csv"`);
    res.send(csv);
  });

  // Content: Public Read
  // GET /api/content/:section
  app.get("/api/content/:section", (req, res) => {
    const content = readJson(CONTENT_FILE) ?? {};
    const section = content[req.params.section];
    if (section === undefined) {
      return res.status(404).json({ error: "Section not found" });
    }
    res.json(section);
  });

  // Admin: Read All Content
  app.get("/api/admin/content", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(readJson(CONTENT_FILE) ?? {});
  });

  // Admin: Update Content Section
  // PUT /api/admin/content/:section?password=1love
  app.put("/api/admin/content/:section", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const content = readJson(CONTENT_FILE) ?? {};
    content[req.params.section] = req.body;
    writeJson(CONTENT_FILE, content);
    res.json({ success: true });
  });

  // Auth: Register
  app.post("/api/auth/register", async (req, res) => {
    const { name, email, password, paths } = req.body;
    if (!name || !email || !password || !paths || !Array.isArray(paths)) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const users = readJson(USERS_FILE) ?? { users: [] };
    if (users.users.some((u: any) => u.email === email)) {
      return res.status(409).json({ error: "Email already exists" });
    }
    const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const user = {
      id: userId,
      name,
      email,
      passwordHash: await hashPassword(password),
      paths,
      contributions: [],
      quests: [],
      heartsBalance: 0,
      joinedAt: new Date().toISOString(),
      bio: "",
      avatar: null,
    };
    users.users.push(user);
    writeJson(USERS_FILE, users);
    addActivity("join", `${firstName(name)} stepped into the village as a Guest`);
    const token = encodeToken(userId, email);
    res.json({ success: true, token, user: { id: user.id, name, email, paths } });
  });

  // Auth: Login
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }
    const users = readJson(USERS_FILE) ?? { users: [] };
    const userIdx = users.users.findIndex((u: any) => u.email === email);
    const user = userIdx === -1 ? null : users.users[userIdx];
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    // Transparent upgrade: if the user is still on a legacy SHA256 hash, re-hash with bcrypt
    if (user.passwordHash === legacySha256(password)) {
      users.users[userIdx].passwordHash = await hashPassword(password);
      writeJson(USERS_FILE, users);
    }
    const token = encodeToken(user.id, email);
    res.json({ success: true, token, user: { id: user.id, name: user.name, email, paths: user.paths } });
  });

  // Auth: Get Profile
  app.get("/api/profile", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.slice(7);
    const decoded = decodeToken(token);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const users = readJson(USERS_FILE) ?? { users: [] };
    const user = users.users.find((u: any) => u.id === decoded.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  });

  // Auth: Update Profile
  app.put("/api/profile", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.slice(7);
    const decoded = decodeToken(token);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const users = readJson(USERS_FILE) ?? { users: [] };
    const userIdx = users.users.findIndex((u: any) => u.id === decoded.userId);
    if (userIdx === -1) {
      return res.status(404).json({ error: "User not found" });
    }
    const { name, bio, avatar, paths } = req.body;
    if (name) users.users[userIdx].name = name;
    if (bio !== undefined) users.users[userIdx].bio = bio;
    if (avatar !== undefined) users.users[userIdx].avatar = avatar;
    if (paths) users.users[userIdx].paths = paths;
    writeJson(USERS_FILE, users);
    res.json(users.users[userIdx]);
  });

  // Auth: Log Contribution
  app.post("/api/profile/contribution", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.slice(7);
    const decoded = decodeToken(token);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const { type, description, heartsEarned } = req.body;
    if (!type || !description || heartsEarned === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const users = readJson(USERS_FILE) ?? { users: [] };
    const userIdx = users.users.findIndex((u: any) => u.id === decoded.userId);
    if (userIdx === -1) {
      return res.status(404).json({ error: "User not found" });
    }
    const contribution = {
      id: `contrib-${Date.now()}`,
      type,
      description,
      heartsEarned,
      date: new Date().toISOString(),
    };
    users.users[userIdx].contributions.push(contribution);
    users.users[userIdx].heartsBalance += heartsEarned;
    writeJson(USERS_FILE, users);
    res.json({ success: true, contribution });
  });

  // Journey State: Public Read
  // GET /api/journey/state
  app.get("/api/journey/state", (_req, res) => {
    const state = readJson(JOURNEY_FILE) ?? { checkboxes: {}, copy: {} };
    res.json(state);
  });

  // Journey State: Update Checkbox
  // POST /api/journey/checkbox  { password, id, state: 0|1|2 }
  app.post("/api/journey/checkbox", (req, res) => {
    const { password, id, state } = req.body;
    if (!requireJourney(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id || state === undefined || ![0, 1, 2].includes(state)) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }
    const journey = readJson(JOURNEY_FILE) ?? { checkboxes: {}, copy: {} };
    journey.checkboxes[id] = state;
    writeJson(JOURNEY_FILE, journey);
    res.json({ success: true });
  });

  // Journey State: Update Kanban Card
  // POST /api/journey/kanban  { password, id, column, assignee }
  app.post("/api/journey/kanban", (req, res) => {
    const { password, id, column, assignee } = req.body;
    if (!requireJourney(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const validColumns = ["assigned", "actioning", "needs-support", "completed"];
    if (!id || !validColumns.includes(column)) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }
    const journey = readJson(JOURNEY_FILE) ?? { checkboxes: {}, copy: {}, kanban: {} };
    if (!journey.kanban) journey.kanban = {};
    journey.kanban[id] = { column, assignee: assignee ?? "" };
    writeJson(JOURNEY_FILE, journey);
    res.json({ success: true });
  });

  // Journey State: Update Copy Section
  // POST /api/journey/copy  { password, sectionId, content }
  app.post("/api/journey/copy", (req, res) => {
    const { password, sectionId, content } = req.body;
    if (!requireJourney(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!sectionId || content === undefined) {
      return res.status(400).json({ error: "Missing fields" });
    }
    const journey = readJson(JOURNEY_FILE) ?? { checkboxes: {}, copy: {} };
    journey.copy[sectionId] = content;
    writeJson(JOURNEY_FILE, journey);
    res.json({ success: true });
  });

  // Journey State: Update Decision
  // POST /api/journey/decision  { password, id, status, chosen, notes }
  app.post("/api/journey/decision", (req, res) => {
    const { password, id, status, chosen, notes } = req.body;
    if (!requireJourney(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const validStatuses = ["open", "decided"];
    if (!id || !validStatuses.includes(status)) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }
    const journey = readJson(JOURNEY_FILE) ?? { checkboxes: {}, copy: {}, kanban: {}, decisions: {} };
    if (!journey.decisions) journey.decisions = {};
    journey.decisions[id] = { status, chosen: chosen ?? "", notes: notes ?? "" };
    writeJson(JOURNEY_FILE, journey);
    res.json({ success: true });
  });

  // ── Email Config (Resend) ─────────────────────────────────────────────────

  app.get("/api/admin/email-config", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(getEmailConfig());
  });

  app.put("/api/admin/email-config", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const current = getEmailConfig();
    const next = {
      investor: typeof req.body.investor === "string" ? req.body.investor.trim() : current.investor,
      steward: typeof req.body.steward === "string" ? req.body.steward.trim() : current.steward,
      resident: typeof req.body.resident === "string" ? req.body.resident.trim() : current.resident,
      prosperity: typeof req.body.prosperity === "string" ? req.body.prosperity.trim() : current.prosperity,
      resend_api_key:
        typeof req.body.resend_api_key === "string" ? req.body.resend_api_key.trim() : current.resend_api_key,
    };
    writeJson(EMAIL_CONFIG_FILE, next);
    res.json({ success: true });
  });

  // ── Investor Document Vault ───────────────────────────────────────────────

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        cb(null, UPLOADS_DIR);
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        const base = path
          .basename(file.originalname, ext)
          .replace(/[^a-z0-9_-]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) || "doc";
        const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        cb(null, `${base}-${uniq}${ext}`);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.get("/api/admin/investor-docs", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(readJson(INVESTOR_DOCS_FILE) ?? []);
  });

  app.post("/api/admin/investor-docs/upload", upload.single("file"), (req, res) => {
    if (!requireAdmin(req)) {
      if (req.file) fs.unlinkSync(path.join(UPLOADS_DIR, req.file.filename));
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Missing file" });
    }
    const name = typeof req.body.name === "string" && req.body.name.trim()
      ? req.body.name.trim()
      : req.file.originalname;
    const pageLink = typeof req.body.pageLink === "string" && req.body.pageLink.trim()
      ? req.body.pageLink.trim()
      : null;
    const entry = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      filename: req.file.filename,
      pageLink,
      uploadedAt: new Date().toISOString(),
    };
    const docs = readJson(INVESTOR_DOCS_FILE) ?? [];
    docs.push(entry);
    writeJson(INVESTOR_DOCS_FILE, docs);
    res.json(entry);
  });

  app.delete("/api/admin/investor-docs/:id", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const docs: any[] = readJson(INVESTOR_DOCS_FILE) ?? [];
    const target = docs.find((d) => d.id === req.params.id);
    if (!target) return res.status(404).json({ error: "Not found" });
    const filtered = docs.filter((d) => d.id !== req.params.id);
    writeJson(INVESTOR_DOCS_FILE, filtered);
    const filePath = path.join(UPLOADS_DIR, target.filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (err) { console.error("[VAULT] Failed to delete file", err); }
    }
    res.json({ success: true });
  });

  app.get("/api/uploads/:filename", (req, res) => {
    const safe = path.basename(req.params.filename);
    const filePath = path.join(UPLOADS_DIR, safe);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
    res.sendFile(filePath);
  });

  // Public: gated investor doc request
  app.post("/api/investor-docs/request", async (req, res) => {
    const { name, email, accredited } = req.body ?? {};
    if (!name || !email || typeof accredited !== "boolean") {
      return res.status(400).json({ error: "Missing required fields" });
    }
    // Save lead
    const submissions: any[] = readJson(SUBMISSIONS_FILE) ?? [];
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "investor-doc-request",
      data: { name, email, accredited: accredited ? "yes" : "no" },
      submittedAt: new Date().toISOString(),
    };
    submissions.push(entry);
    writeJson(SUBMISSIONS_FILE, submissions);

    const docs: any[] = readJson(INVESTOR_DOCS_FILE) ?? [];
    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "amora.regencivics.earth";
    const proto = req.headers["x-forwarded-proto"] ?? "https";
    const origin = `${proto}://${host}`;

    // Email the investor with download links
    const cfg = getEmailConfig();
    if (cfg.resend_api_key && email) {
      const links = docs
        .map(
          (d) =>
            `<li style="margin:8px 0"><a href="${origin}/api/uploads/${escapeHtml(d.filename)}" style="color:#2D5A5A;font-weight:600">${escapeHtml(d.name)}</a>${d.pageLink ? ` &middot; <a href="${origin}${escapeHtml(d.pageLink)}" style="color:#6b7280;font-size:13px">view on site</a>` : ""}</li>`
        )
        .join("");
      const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;padding:24px;color:#1f2937">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#2D5A5A;color:#fff;padding:24px"><div style="font-size:22px;font-weight:700">Your Amora Investor Packet</div></div>
  <div style="padding:24px">
    <p>Hi ${escapeHtml(name)},</p>
    <p>Thank you for your interest in investing in Amora. Below are the documents in our current investor packet:</p>
    <ul style="padding-left:18px">${links || "<li>No documents available yet — our team will follow up shortly.</li>"}</ul>
    <p style="margin-top:20px">A team member will be in touch within 48 hours to answer your questions.</p>
    <p style="color:#6b7280;font-size:13px;margin-top:24px">— The Amora Team</p>
  </div>
</div></body></html>`;
      await sendResendEmail({
        to: [email],
        subject: "Your Amora Investor Packet",
        html,
      });
      // Also notify the investor team
      const investorTeam = recipientsForType("investor-doc-request");
      if (investorTeam.length) {
        await sendResendEmail({
          to: investorTeam,
          subject: `[Amora] New investor doc request from ${name}`,
          html: buildSubmissionEmailHtml("investor-doc-request", { name, email, accredited }, `${origin}/admin`),
        });
      }
    }

    res.json({ success: true, message: "Check your email for the documents." });
  });

  // ── Training Modules ──────────────────────────────────────────────────────

  app.get("/api/training-modules", (_req, res) => {
    const mods: any[] = readJson(TRAINING_MODULES_FILE) ?? [];
    mods.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json(mods);
  });

  app.get("/api/admin/training-modules", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const mods: any[] = readJson(TRAINING_MODULES_FILE) ?? [];
    mods.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json(mods);
  });

  app.post("/api/admin/training-modules", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { title, description, type, url, order } = req.body ?? {};
    if (!title || !type) return res.status(400).json({ error: "Missing title or type" });
    const mods: any[] = readJson(TRAINING_MODULES_FILE) ?? [];
    const entry = {
      id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      description: description ?? "",
      type,
      url: url ?? "",
      order: typeof order === "number" ? order : mods.length + 1,
    };
    mods.push(entry);
    writeJson(TRAINING_MODULES_FILE, mods);
    res.json(entry);
  });

  app.put("/api/admin/training-modules/:id", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const mods: any[] = readJson(TRAINING_MODULES_FILE) ?? [];
    const idx = mods.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    const allowed = ["title", "description", "type", "url", "order"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) mods[idx][key] = req.body[key];
    }
    writeJson(TRAINING_MODULES_FILE, mods);
    res.json(mods[idx]);
  });

  app.delete("/api/admin/training-modules/:id", (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const mods: any[] = readJson(TRAINING_MODULES_FILE) ?? [];
    const filtered = mods.filter((m) => m.id !== req.params.id);
    if (filtered.length === mods.length) return res.status(404).json({ error: "Not found" });
    writeJson(TRAINING_MODULES_FILE, filtered);
    res.json({ success: true });
  });

  // ── FAQs (NEW-1) ──────────────────────────────────────────────────────────

  app.get("/api/faqs/:pathway", (req, res) => {
    const pathway = req.params.pathway;
    if (!FAQ_PATHWAYS.includes(pathway as FaqPathway)) return res.status(404).json({ error: "Unknown pathway" });
    const all = readJson(FAQS_FILE) ?? {};
    res.json(all[pathway] ?? []);
  });

  app.get("/api/admin/faqs", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json(readJson(FAQS_FILE) ?? {});
  });

  app.put("/api/admin/faqs/:pathway", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const pathway = req.params.pathway;
    if (!FAQ_PATHWAYS.includes(pathway as FaqPathway)) return res.status(404).json({ error: "Unknown pathway" });
    if (!Array.isArray(req.body)) return res.status(400).json({ error: "Body must be an array" });
    const all = readJson(FAQS_FILE) ?? {};
    all[pathway] = req.body.map((item: any) => ({
      id: item.id || `${pathway.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      question: String(item.question ?? "").trim(),
      answer: String(item.answer ?? "").trim(),
    }));
    writeJson(FAQS_FILE, all);
    res.json({ success: true, items: all[pathway] });
  });

  app.post("/api/admin/faqs/:pathway", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const pathway = req.params.pathway;
    if (!FAQ_PATHWAYS.includes(pathway as FaqPathway)) return res.status(404).json({ error: "Unknown pathway" });
    const { question, answer } = req.body ?? {};
    if (!question) return res.status(400).json({ error: "Missing question" });
    const all = readJson(FAQS_FILE) ?? {};
    if (!all[pathway]) all[pathway] = [];
    const item = {
      id: `${pathway.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      question: String(question).trim(),
      answer: String(answer ?? "").trim(),
    };
    all[pathway].push(item);
    writeJson(FAQS_FILE, all);
    res.json(item);
  });

  app.delete("/api/admin/faqs/:pathway/:id", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const { pathway, id } = req.params;
    if (!FAQ_PATHWAYS.includes(pathway as FaqPathway)) return res.status(404).json({ error: "Unknown pathway" });
    const all = readJson(FAQS_FILE) ?? {};
    const before = (all[pathway] ?? []).length;
    all[pathway] = (all[pathway] ?? []).filter((f: any) => f.id !== id);
    if (all[pathway].length === before) return res.status(404).json({ error: "Not found" });
    writeJson(FAQS_FILE, all);
    res.json({ success: true });
  });

  // ── Milestones (NEW-3) ────────────────────────────────────────────────────

  app.get("/api/milestones", (_req, res) => {
    const mils: any[] = readJson(MILESTONES_FILE) ?? [];
    mils.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json(mils);
  });

  app.get("/api/admin/milestones", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const mils: any[] = readJson(MILESTONES_FILE) ?? [];
    mils.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json(mils);
  });

  app.post("/api/admin/milestones", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const { phase, title, description, status, completedDate, updateNote, order } = req.body ?? {};
    if (!title || !phase) return res.status(400).json({ error: "Missing title or phase" });
    const mils: any[] = readJson(MILESTONES_FILE) ?? [];
    const entry = {
      id: `mil-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phase,
      title,
      description: description ?? "",
      status: status ?? "upcoming",
      completedDate: completedDate ?? null,
      updateNote: updateNote ?? "",
      order: typeof order === "number" ? order : mils.length + 1,
    };
    mils.push(entry);
    writeJson(MILESTONES_FILE, mils);
    res.json(entry);
  });

  app.put("/api/admin/milestones/:id", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const mils: any[] = readJson(MILESTONES_FILE) ?? [];
    const idx = mils.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    const allowed = ["phase", "title", "description", "status", "completedDate", "updateNote", "order"];
    for (const k of allowed) if (req.body[k] !== undefined) mils[idx][k] = req.body[k];
    writeJson(MILESTONES_FILE, mils);
    res.json(mils[idx]);
  });

  app.delete("/api/admin/milestones/:id", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const mils: any[] = readJson(MILESTONES_FILE) ?? [];
    const filtered = mils.filter((m) => m.id !== req.params.id);
    if (filtered.length === mils.length) return res.status(404).json({ error: "Not found" });
    writeJson(MILESTONES_FILE, filtered);
    res.json({ success: true });
  });

  // ── Visit Config (NEW-5) ──────────────────────────────────────────────────

  app.get("/api/visit-config", (_req, res) => {
    res.json(readJson(VISIT_CONFIG_FILE) ?? DEFAULT_VISIT_CONFIG);
  });

  app.get("/api/admin/visit-config", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json(readJson(VISIT_CONFIG_FILE) ?? DEFAULT_VISIT_CONFIG);
  });

  app.put("/api/admin/visit-config", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "Body required" });
    writeJson(VISIT_CONFIG_FILE, req.body);
    res.json({ success: true });
  });

  // ── Investor Summary (NEW-6) ──────────────────────────────────────────────

  app.get("/api/investor-summary", (_req, res) => {
    res.json(readJson(INVESTOR_SUMMARY_FILE) ?? DEFAULT_INVESTOR_SUMMARY);
  });

  app.get("/api/admin/investor-summary", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json(readJson(INVESTOR_SUMMARY_FILE) ?? DEFAULT_INVESTOR_SUMMARY);
  });

  app.put("/api/admin/investor-summary", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "Body required" });
    writeJson(INVESTOR_SUMMARY_FILE, req.body);
    res.json({ success: true });
  });

  // ── Game Engine API (platform-level; project specifics come from gameConfig) ──

  // Public game config (safe subset) + current season
  app.get("/api/game/config", (_req, res) => {
    res.json({
      project: GAME_CONFIG.project,
      currency: GAME_CONFIG.currency,
      paths: GAME_CONFIG.paths,
      stages: GAME_CONFIG.stages.map(({ id, name, description }) => ({ id, name, description })),
      season: readJson(SEASON_FILE) ?? GAME_CONFIG.season,
    });
  });

  app.get("/api/season", (_req, res) => {
    res.json(readJson(SEASON_FILE) ?? GAME_CONFIG.season);
  });

  app.put("/api/admin/season", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "Body required" });
    writeJson(SEASON_FILE, req.body);
    if (req.body.name) addActivity("season", `The season has been set: ${req.body.name}`);
    res.json({ success: true });
  });

  // Quests: public list
  app.get("/api/quests", (_req, res) => {
    const quests: any[] = readJson(QUESTS_FILE) ?? [];
    quests.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json(quests);
  });

  // Quests: admin CRUD
  app.post("/api/admin/quests", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const { title } = req.body ?? {};
    if (!title) return res.status(400).json({ error: "Missing title" });
    const quests: any[] = readJson(QUESTS_FILE) ?? [];
    const entry = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      order: quests.length + 1,
      icon: "Star",
      status: "Open",
      difficulty: "Beginner",
      tags: [],
      ...req.body,
    };
    quests.push(entry);
    writeJson(QUESTS_FILE, quests);
    res.json(entry);
  });

  app.put("/api/admin/quests/:id", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const quests: any[] = readJson(QUESTS_FILE) ?? [];
    const idx = quests.findIndex((q) => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    quests[idx] = { ...quests[idx], ...req.body, id: quests[idx].id };
    writeJson(QUESTS_FILE, quests);
    res.json(quests[idx]);
  });

  app.delete("/api/admin/quests/:id", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const quests: any[] = readJson(QUESTS_FILE) ?? [];
    const filtered = quests.filter((q) => q.id !== req.params.id);
    if (filtered.length === quests.length) return res.status(404).json({ error: "Not found" });
    writeJson(QUESTS_FILE, filtered);
    res.json({ success: true });
  });

  // Quests: claim / submit (player)
  app.post("/api/game/quests/:id/claim", (req, res) => {
    const user = requireUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to claim quests" });
    const quests: any[] = readJson(QUESTS_FILE) ?? [];
    const quest = quests.find((q) => q.id === req.params.id);
    if (!quest) return res.status(404).json({ error: "Quest not found" });
    const claims: any[] = readJson(QUEST_CLAIMS_FILE) ?? [];
    const existing = claims.find((c) => c.userId === user.id && c.questId === quest.id && c.status !== "declined");
    if (existing) return res.status(409).json({ error: "Already claimed", claim: existing });
    const claim = {
      id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      questId: quest.id,
      questTitle: quest.title,
      userId: user.id,
      userName: user.name,
      status: "claimed", // claimed -> submitted -> consented | declined
      claimedAt: new Date().toISOString(),
      artifactUrl: "",
      note: "",
    };
    claims.push(claim);
    writeJson(QUEST_CLAIMS_FILE, claims);
    res.json(claim);
  });

  app.post("/api/game/quests/:id/submit", (req, res) => {
    const user = requireUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { artifactUrl, note } = req.body ?? {};
    if (!artifactUrl && !note) return res.status(400).json({ error: "Share a link or a few words as evidence of your work" });
    const claims: any[] = readJson(QUEST_CLAIMS_FILE) ?? [];
    const idx = claims.findIndex((c) => c.userId === user.id && c.questId === req.params.id && (c.status === "claimed" || c.status === "submitted"));
    if (idx === -1) return res.status(404).json({ error: "No active claim for this quest" });
    claims[idx] = { ...claims[idx], status: "submitted", artifactUrl: artifactUrl ?? "", note: note ?? "", submittedAt: new Date().toISOString() };
    writeJson(QUEST_CLAIMS_FILE, claims);
    res.json(claims[idx]);
  });

  // Quests: team consent (value release is always human-gated)
  app.get("/api/admin/quest-claims", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const claims: any[] = readJson(QUEST_CLAIMS_FILE) ?? [];
    claims.sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime());
    res.json(claims);
  });

  app.post("/api/admin/quest-claims/:id/consent", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const { approve, amount } = req.body ?? {};
    const claims: any[] = readJson(QUEST_CLAIMS_FILE) ?? [];
    const idx = claims.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    if (approve === false) {
      claims[idx] = { ...claims[idx], status: "declined", resolvedAt: new Date().toISOString() };
      writeJson(QUEST_CLAIMS_FILE, claims);
      return res.json(claims[idx]);
    }
    const granted = Math.max(0, Number(amount) || 0);
    claims[idx] = { ...claims[idx], status: "consented", amount: granted, resolvedAt: new Date().toISOString() };
    writeJson(QUEST_CLAIMS_FILE, claims);
    // Credit the player's balance
    const users = readJson(USERS_FILE) ?? { users: [] };
    const uIdx = users.users.findIndex((u: any) => u.id === claims[idx].userId);
    if (uIdx !== -1) {
      users.users[uIdx].heartsBalance = (users.users[uIdx].heartsBalance ?? 0) + granted;
      writeJson(USERS_FILE, users);
      addActivity("quest", `${firstName(claims[idx].userName)} completed the quest "${claims[idx].questTitle}"`);
    }
    res.json(claims[idx]);
  });

  // Journey / training progress sync (server-side game state)
  app.post("/api/game/journey/sync", (req, res) => {
    const user = requireUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { journeyId, steps } = req.body ?? {};
    if (!journeyId || !Array.isArray(steps)) return res.status(400).json({ error: "Missing journeyId or steps" });
    const users = readJson(USERS_FILE) ?? { users: [] };
    const idx = users.users.findIndex((u: any) => u.id === user.id);
    if (idx === -1) return res.status(404).json({ error: "User not found" });
    if (!users.users[idx].journeys) users.users[idx].journeys = {};
    users.users[idx].journeys[journeyId] = steps.map(String);
    writeJson(USERS_FILE, users);
    res.json({ success: true, journeys: users.users[idx].journeys });
  });

  // My game state
  app.get("/api/game/me", (req, res) => {
    const user = requireUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const stageId = computeStage(user);
    const claims: any[] = (readJson(QUEST_CLAIMS_FILE) ?? []).filter((c: any) => c.userId === user.id);
    res.json({
      stage: getStage(stageId),
      stageIndex: stageIndex(stageId),
      stages: GAME_CONFIG.stages.map(({ id, name, description }) => ({ id, name, description })),
      gratitude: { balance: user.heartsBalance ?? 0, budget: gratitudeBudget(user) },
      quests: claims,
      journeys: user.journeys ?? {},
      membership: hasMembership(user),
      trainingComplete: trainingComplete(user),
      nextAction: nextActionFor(user),
    });
  });

  // Gratitude: send an acknowledgment
  app.post("/api/game/gratitude/send", (req, res) => {
    const user = requireUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to send " + GAME_CONFIG.currency.nameLower });
    const { toEmail, amount, message } = req.body ?? {};
    const amt = Math.floor(Number(amount) || 0);
    if (!toEmail || amt <= 0) return res.status(400).json({ error: "Recipient and a positive amount are required" });
    if (GAME_CONFIG.gratitude.requireMessage && !String(message ?? "").trim()) {
      return res.status(400).json({ error: "A few words of appreciation are required" });
    }
    const users = readJson(USERS_FILE) ?? { users: [] };
    const toIdx = users.users.findIndex((u: any) => String(u.email).toLowerCase() === String(toEmail).toLowerCase());
    if (toIdx === -1) return res.status(404).json({ error: "No member found with that email" });
    const recipient = users.users[toIdx];
    if (recipient.id === user.id) return res.status(400).json({ error: "Gratitude flows to others" });
    const budget = gratitudeBudget(user);
    if (budget.total <= 0) return res.status(403).json({ error: "Your sending budget unlocks as you progress on the path" });
    if (amt > budget.remaining) return res.status(400).json({ error: `Only ${budget.remaining} left in your budget this cycle` });
    const log: any[] = readJson(GRATITUDE_LOG_FILE) ?? [];
    const already = log.filter((g) => g.fromId === user.id && g.toId === recipient.id && g.cycleId === budget.cycleId).length;
    if (already >= GAME_CONFIG.gratitude.maxPerRecipientPerCycle) {
      return res.status(409).json({ error: "You have already acknowledged them this cycle" });
    }
    const entry = {
      id: `grat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fromId: user.id,
      fromName: user.name,
      toId: recipient.id,
      toName: recipient.name,
      amount: amt,
      message: String(message ?? "").trim(),
      cycleId: budget.cycleId,
      at: new Date().toISOString(),
    };
    log.push(entry);
    writeJson(GRATITUDE_LOG_FILE, log);
    users.users[toIdx].heartsBalance = (users.users[toIdx].heartsBalance ?? 0) + amt;
    writeJson(USERS_FILE, users);
    addActivity("gratitude", `${firstName(user.name)} appreciated ${firstName(recipient.name)}`);
    res.json({ success: true, entry: { ...entry, amount: undefined }, budget: gratitudeBudget(user) });
  });

  // Gratitude: public wall (messages and names only; amounts stay private)
  app.get("/api/game/gratitude/wall", (_req, res) => {
    const log: any[] = readJson(GRATITUDE_LOG_FILE) ?? [];
    const wall = log
      .slice(-60)
      .reverse()
      .map((g) => ({ id: g.id, from: firstName(g.fromName), to: firstName(g.toName), message: g.message, at: g.at }));
    res.json(wall);
  });

  // Gratitude: my journal (received + sent, with amounts)
  app.get("/api/game/gratitude/me", (req, res) => {
    const user = requireUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const log: any[] = readJson(GRATITUDE_LOG_FILE) ?? [];
    res.json({
      received: log.filter((g) => g.toId === user.id).reverse(),
      sent: log.filter((g) => g.fromId === user.id).reverse(),
      budget: gratitudeBudget(user),
    });
  });

  // Village pulse: public activity feed
  app.get("/api/game/pulse", (_req, res) => {
    const log: any[] = readJson(ACTIVITY_FILE) ?? [];
    res.json(log.slice(-30).reverse());
  });

  // Players admin: list + stage grants
  app.get("/api/admin/players", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const users = readJson(USERS_FILE) ?? { users: [] };
    res.json(
      users.users.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        paths: u.paths ?? [],
        joinedAt: u.joinedAt,
        balance: u.heartsBalance ?? 0,
        stageGranted: u.stageGranted ?? null,
        stageComputed: computeStage(u),
        membership: hasMembership(u),
      }))
    );
  });

  app.put("/api/admin/players/:id/stage", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const { stageId } = req.body ?? {};
    if (stageId && !GAME_CONFIG.stages.some((s) => s.id === stageId)) {
      return res.status(400).json({ error: "Unknown stage" });
    }
    const users = readJson(USERS_FILE) ?? { users: [] };
    const idx = users.users.findIndex((u: any) => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    const before = computeStage(users.users[idx]);
    users.users[idx].stageGranted = stageId ?? null;
    writeJson(USERS_FILE, users);
    const after = computeStage(users.users[idx]);
    if (stageIndex(after) > stageIndex(before)) {
      addActivity("stage", `${firstName(users.users[idx].name)} advanced to ${getStage(after).name}`);
    }
    res.json({ success: true, stageComputed: after });
  });

  app.delete("/api/admin/players/:id", (req, res) => {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const users = readJson(USERS_FILE) ?? { users: [] };
    const idx = users.users.findIndex((u: any) => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    const [removed] = users.users.splice(idx, 1);
    writeJson(USERS_FILE, users);
    // Note: historical quest claims and gratitude-log entries are intentionally
    // left intact; they are a shared ledger, not owned by a single account.
    res.json({ success: true, removed: { id: removed.id, email: removed.email } });
  });

  // Static Files + SPA Fallback
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  app.get("*", (_req, res, next) => {
    const indexPath = path.join(staticPath, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error(`[sendFile error] ${indexPath}:`, err.message);
        res.status(500).send(`Server error: could not serve index.html from ${indexPath}`);
      }
    });
  });

  const port = parseInt(String(process.env.PORT || 3000), 10);
  const staticExists = fs.existsSync(staticPath);
  const indexExists = fs.existsSync(path.join(staticPath, "index.html"));
  console.log(`[startup] NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[startup] staticPath=${staticPath}`);
  console.log(`[startup] staticPath exists=${staticExists}`);
  console.log(`[startup] index.html exists=${indexExists}`);
  console.log(`[startup] PORT=${port}`);
  server.listen(port, "0.0.0.0", () => {
    console.log(`[startup] Server listening on 0.0.0.0:${port}`);
  });
}

startServer().catch(console.error);