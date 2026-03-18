import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const JOURNEY_FILE = path.join(DATA_DIR, "journey-state.json");
const ADMIN_PASSWORD = "1love";
const JOURNEY_PASSWORD = "1love";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function encodeToken(userId: string, email: string): string {
  return btoa(JSON.stringify({ userId, email, timestamp: Date.now() }));
}

function decodeToken(token: string): { userId: string; email: string; timestamp: number } | null {
  try {
    return JSON.parse(atob(token));
  } catch {
    return null;
  }
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SUBMISSIONS_FILE)) fs.writeFileSync(SUBMISSIONS_FILE, "[]");
  if (!fs.existsSync(CONTENT_FILE)) {
    const seedFile = path.join(DATA_DIR, "content-seed.json");
    const seed = fs.existsSync(seedFile) ? fs.readFileSync(seedFile, "utf-8") : "{}";
    fs.writeFileSync(CONTENT_FILE, seed);
  }
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  if (!fs.existsSync(JOURNEY_FILE)) fs.writeFileSync(JOURNEY_FILE, JSON.stringify({ checkboxes: {}, copy: {}, kanban: {}, decisions: {} }, null, 2));
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

  // CORS for dev
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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
    
    // Fire-and-forget email notification
    if (process.env.NOTIFY_EMAIL) {
      (async () => {
        try {
          const nodemailer = await import('nodemailer').catch(() => null);
          if (!nodemailer) {
            console.log("[EMAIL] nodemailer not installed, skipping email");
            return;
          }
          
          if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            const transporter = nodemailer.default.createTransport({
              host: process.env.SMTP_HOST,
              port: parseInt(process.env.SMTP_PORT || "587"),
              secure: process.env.SMTP_SECURE === "true",
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              },
            });
            
            const dataStr = Object.entries(data)
              .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
              .join("\n");
            
            await transporter.sendMail({
              from: process.env.SMTP_FROM || process.env.SMTP_USER,
              to: process.env.NOTIFY_EMAIL,
              subject: `[Amora] New ${type} submission`,
              text: `New ${type} submission received\n\nSubmitted at: ${(entry as any).submittedAt}\n\nData:\n${dataStr}`,
            });
          } else {
            console.log(`[EMAIL WOULD SEND] to ${process.env.NOTIFY_EMAIL}: [Amora] New ${type} submission`);
          }
        } catch (err) {
          console.error("[EMAIL ERROR]", err);
        }
      })();
    }
    
    res.json({ success: true, id: (entry as any).id });
  });

  // Admin: List Submissions
  // GET /api/admin/submissions?password=1love&type=investor
  app.get("/api/admin/submissions", (req, res) => {
    if (req.query.password !== ADMIN_PASSWORD) {
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
    if (req.query.password !== ADMIN_PASSWORD) {
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
    if (req.query.password !== ADMIN_PASSWORD) {
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
    if (req.query.password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(readJson(CONTENT_FILE) ?? {});
  });

  // Admin: Update Content Section
  // PUT /api/admin/content/:section?password=1love
  app.put("/api/admin/content/:section", (req, res) => {
    if (req.query.password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const content = readJson(CONTENT_FILE) ?? {};
    content[req.params.section] = req.body;
    writeJson(CONTENT_FILE, content);
    res.json({ success: true });
  });

  // Auth: Register
  app.post("/api/auth/register", (req, res) => {
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
      passwordHash: hashPassword(password),
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
    const token = encodeToken(userId, email);
    res.json({ success: true, token, user: { id: user.id, name, email, paths } });
  });

  // Auth: Login
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }
    const users = readJson(USERS_FILE) ?? { users: [] };
    const user = users.users.find((u: any) => u.email === email);
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: "Invalid credentials" });
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
    if (password !== JOURNEY_PASSWORD) {
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
    if (password !== JOURNEY_PASSWORD) {
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
    if (password !== JOURNEY_PASSWORD) {
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
    if (password !== JOURNEY_PASSWORD) {
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