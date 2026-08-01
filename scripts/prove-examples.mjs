/**
 * End-to-end proof of the two behaviours standing examples promise:
 * they cannot be acted on, and publishing something real clears them.
 *
 *   node scripts/prove-examples.mjs --base http://localhost:3911 --email … --password …
 */
const args = process.argv.slice(2);
const arg = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const BASE = arg("base", "http://localhost:3911");
const EMAIL = arg("email");
const PASSWORD = arg("password");

let failures = 0;
const ok = (label, pass, detail = "") => {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!pass) failures++;
};

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());
const token = login.token;
if (!token) { console.error("could not log in:", login); process.exit(2); }
const auth = { "content-type": "application/json", authorization: `Bearer ${token}` };

const examplesNow = () => fetch(`${BASE}/api/examples`).then((r) => r.json()).then((d) => d.modules ?? []);

console.log("\nINERTNESS — every one of these must be refused\n");

// 1. Borrowing an example library item would escrow real credits.
const lib = await fetch(`${BASE}/api/library`, { headers: auth }).then((r) => r.json());
const item = (lib.items ?? [])[0];
if (item) {
  const r = await fetch(`${BASE}/api/library/items/${item.id}/reserve`, { method: "POST", headers: auth });
  const b = await r.json().catch(() => ({}));
  ok(`borrow "${item.name}"`, r.status === 409 && b.code === "example_immutable", `${r.status} ${b.error ?? ""}`);
}

// 2. Requesting an example stay would create open state blocking module-off.
const stays = await fetch(`${BASE}/api/stays`, { headers: auth }).then((r) => r.json());
const room = (stays.accommodations ?? [])[0];
if (room) {
  const r = await fetch(`${BASE}/api/stays/request`, {
    method: "POST", headers: auth, body: JSON.stringify({ accommodationId: room.id }),
  });
  const b = await r.json().catch(() => ({}));
  ok(`book "${room.name}"`, r.status === 409 && b.code === "example_immutable", `${r.status} ${b.error ?? ""}`);
}

// 3. Buying an example product would reach Stripe.
const prods = await fetch(`${BASE}/api/products`, { headers: auth }).then((r) => r.json());
const prod = (prods.products ?? [])[0];
if (prod) {
  const r = await fetch(`${BASE}/api/products/${prod.id}/checkout`, {
    method: "POST", headers: auth, body: JSON.stringify({ amountMinor: 5000 }),
  });
  const b = await r.json().catch(() => ({}));
  ok(`buy "${prod.name}"`, r.status === 409 && b.code === "example_immutable", `${r.status} ${b.error ?? ""}`);
}

// 4. Hearting an example post would post a real ledger leg.
const feed = await fetch(`${BASE}/api/feed`, { headers: auth }).then((r) => r.json());
// System events are woven into the feed and also carry a body, so match on
// kind — hearting a village happening is not a thing that exists.
const post = (feed.items ?? []).find((i) => i.id && i.kind === "post");
if (post) {
  const r = await fetch(`${BASE}/api/feed/threads/${post.id}/heart`, { method: "POST", headers: auth });
  const b = await r.json().catch(() => ({}));
  ok("heart an example post", r.status === 409 && b.code === "example_immutable", `${r.status} ${b.error ?? ""}`);
}

// 5. Awarding an example warning badge would suspend a real member.
const badges = await fetch(`${BASE}/api/badges`, { headers: auth }).then((r) => r.json());
const warn = (badges.badges ?? []).find((b) => b.kind === "warning");
if (warn) {
  const r = await fetch(`${BASE}/api/admin/badges/${warn.id}/award`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ userId: login.user?.id, note: "should never land" }),
  });
  const b = await r.json().catch(() => ({}));
  ok(`award "${warn.name}"`, r.status === 409 && b.code === "example_immutable", `${r.status} ${b.error ?? ""}`);
}

// 6. Claiming an example quest walks straight to consent, which mints.
const quests = await fetch(`${BASE}/api/quests`, { headers: auth }).then((r) => r.json());
const exQuest = (quests.quests ?? quests ?? []).find?.((q) => String(q.id).startsWith("ex-quest-"));
if (exQuest) {
  const r = await fetch(`${BASE}/api/game/quests/${exQuest.id}/claim`, { method: "POST", headers: auth });
  const b = await r.json().catch(() => ({}));
  ok(`claim "${exQuest.title}"`, r.status === 409 && b.code === "example_immutable", `${r.status} ${b.error ?? ""}`);
} else {
  console.log("  --    no example quests present (a real quest board suppresses them)");
}

// 7. Checkout would open a Stripe session against a room nobody can sleep in.
if (room) {
  const r = await fetch(`${BASE}/api/stays/checkout`, {
    method: "POST", headers: auth, body: JSON.stringify({ accommodationId: room.id, nights: 2 }),
  });
  const b = await r.json().catch(() => ({}));
  ok(`checkout "${room.name}"`, r.status === 409 && b.code === "example_immutable", `${r.status} ${b.error ?? ""}`);
}

// 8. Real budget must not flow to an identity that is not a person.
{
  const r = await fetch(`${BASE}/api/game/gratitude/send`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ toEmail: "ex-user-mira@examples.invalid", amount: 1, message: "should be refused" }),
  });
  const b = await r.json().catch(() => ({}));
  ok("send gratitude to an example identity", r.status === 409, `${r.status} ${b.error ?? ""}`);
}

// 9. Replying — the banner promises this is refused.
{
  const threads = await fetch(`${BASE}/api/forum/threads`, { headers: auth }).then((r) => r.json()).catch(() => ({}));
  const exThread = (threads.threads ?? []).find?.((t) => String(t.id).startsWith("ex-thread-"));
  if (exThread) {
    const r = await fetch(`${BASE}/api/forum/threads/${exThread.id}/replies`, {
      method: "POST", headers: auth, body: JSON.stringify({ body: "should be refused" }),
    });
    const b = await r.json().catch(() => ({}));
    ok("reply to an example thread", r.status === 409 && b.code === "example_immutable", `${r.status} ${b.error ?? ""}`);
  }
}

console.log("\nRETIREMENT — publishing something real clears that module, and only that module\n");

const before = await examplesNow();
ok("tools is showing examples before", before.includes("tools"));
ok("library is showing examples before", before.includes("library"));

const created = await fetch(`${BASE}/api/admin/tools`, {
  method: "POST", headers: auth,
  body: JSON.stringify({
    name: "A real tool", purpose: "Published by the proof script to trigger retirement.",
    url: "https://example.net/real", category: "communication", visibility: "public",
  }),
}).then((r) => r.json());
ok("published a real tool", !!created?.id, created?.error ?? "");

// Retirement is fire-and-forget so the publisher's response never waits on
// housekeeping; give it room, especially against a remote database.
await new Promise((r) => setTimeout(r, 3000));
const after = await examplesNow();
ok("tools examples retired", !after.includes("tools"));
ok("library examples untouched", after.includes("library"), "retirement is per-module");

const toolsNow = await fetch(`${BASE}/api/tools`, { headers: auth }).then((r) => r.json());
const names = (toolsNow.tools ?? []).map((t) => t.name);
ok("only the real tool remains", names.length === 1 && names[0] === "A real tool", names.join(", "));

// Retirement is permanent: re-enabling must not bring them back.
await fetch(`${BASE}/api/admin/modules/tools/lifecycle`, {
  method: "PUT", headers: auth, body: JSON.stringify({ lifecycle: "off" }),
});
await fetch(`${BASE}/api/admin/modules/tools/lifecycle`, {
  method: "PUT", headers: auth, body: JSON.stringify({ lifecycle: "public" }),
});
const afterCycle = await examplesNow();
ok("off-and-on does not resurrect them", !afterCycle.includes("tools"));

console.log(failures === 0 ? "\nALL PROOFS PASSED\n" : `\n${failures} PROOF(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
