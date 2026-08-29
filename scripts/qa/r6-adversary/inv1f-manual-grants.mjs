/**
 * Invariant 1, coordinator addendum: co-signed manual grants.
 *
 * The hypothesis handed down: "Grants over 100 or any self-grant need a second
 * steward" is specified and not built. This tests the manual-mint path as it
 * stands, both from an ordinary member and from a lone admin.
 *
 * LOCAL only, port 3902, scratch schema village_qa6_2.
 */
import { api, actors, record, dump, db } from "./h.mjs";
const A = actors();
const c = await db();

const acct = (uid) => "mem:" + uid;
const bal = async (uid, slug) => {
  const [[r]] = await c.query(
    "SELECT COALESCE(SUM(CASE WHEN to_account=? THEN amount ELSE 0 END),0) - COALESCE(SUM(CASE WHEN from_account=? THEN amount ELSE 0 END),0) s FROM token_ledger WHERE token_type = ?",
    [acct(uid), acct(uid), slug],
  );
  return Number(r.s);
};
const led = async (uid, slug) => {
  const [r] = await c.query(
    "SELECT from_account, to_account, token_type, amount, source, source_ref, description FROM token_ledger WHERE to_account=? AND token_type=? ORDER BY id DESC LIMIT 4",
    [acct(uid), slug],
  );
  return r;
};

const vars = await api("GET", "/api/admin/variables", undefined, A.founderToken);
const flat = {};
(function walk(v) {
  if (Array.isArray(v)) return v.forEach(walk);
  if (v && typeof v === "object") {
    if (typeof v.key === "string" && "value" in v) flat[v.key] = v.value;
    Object.values(v).forEach(walk);
  }
})(vars.json);
const cap = Number(flat["ledger.admin_mint_cycle_cap"]);
console.log("ledger.admin_mint_cycle_cap = " + flat["ledger.admin_mint_cycle_cap"]);
if (!Number.isFinite(cap)) {
  record(1, "manual grant cap", "NOT MEASURABLE", "ledger.admin_mint_cycle_cap read back as " + flat["ledger.admin_mint_cycle_cap"]);
}

// ── CONTROL: an ordinary member must be refused, and an admin must succeed ──
const asMember = await api("POST", "/api/admin/tokens/gratitude/mint", { toUserId: A.aliceId, amount: 5, reason: "member tries" }, A.aliceToken);
console.log("control A: ordinary member -> " + asMember.status + " " + JSON.stringify(asMember.json));
const before = await bal(A.bobId, "gratitude");
const asAdmin = await api("POST", "/api/admin/tokens/gratitude/mint", { toUserId: A.bobId, amount: 5, reason: "control grant" }, A.founderToken);
const after = await bal(A.bobId, "gratitude");
console.log("control B: admin grant of 5 to bob -> " + asAdmin.status + "; bob's gratitude ledger " + before + " -> " + after);
console.log("control landed: " + (asMember.status === 401 && asAdmin.status === 200 && after - before === 5));
if (asAdmin.status !== 200 || after - before !== 5) {
  record(1, "manual grant control", "NOT MEASURABLE", "the admin control grant did not land: " + asAdmin.status + " " + JSON.stringify(asAdmin.json));
  dump("inv1f.json");
  await c.end();
  process.exit(0);
}
record(3, "call the manual mint route as an ordinary member", asMember.status >= 400 ? "HELD" : "BROKE",
  "POST /api/admin/tokens/gratitude/mint with a member token -> " + asMember.status + " " + JSON.stringify(asMember.json));

// ── ATTACK A: a lone admin grants THEMSELVES ───────────────────────────────
const selfBefore = await bal(A.founderId, "gratitude");
const self = await api("POST", "/api/admin/tokens/gratitude/mint", { toUserId: A.founderId, amount: 25, reason: "paying myself" }, A.founderToken);
const selfAfter = await bal(A.founderId, "gratitude");
console.log("\nATTACK A self-grant -> " + self.status + " " + JSON.stringify(self.json) + "; founder ledger " + selfBefore + " -> " + selfAfter);
if (self.status === 200 && selfAfter > selfBefore) {
  record(1, "a lone admin mints tokens to their OWN account", "BROKE",
    "POST /api/admin/tokens/gratitude/mint {toUserId: <the caller's own id>, amount: 25} returned 200 and moved the caller's own gratitude ledger " +
    selfBefore + " -> " + selfAfter + ". No second signature was asked for, and the route does not compare toUserId with the acting admin. Ledger row: " +
    JSON.stringify(await led(A.founderId, "gratitude")));
} else {
  record(1, "a lone admin mints tokens to their OWN account", "HELD", "self-grant refused: " + self.status + " " + JSON.stringify(self.json));
}

// ── ATTACK B: a single grant above 100 ─────────────────────────────────────
const bigBefore = await bal(A.carolId, "gratitude");
const big = await api("POST", "/api/admin/tokens/gratitude/mint", { toUserId: A.carolId, amount: 101, reason: "over the stated threshold" }, A.founderToken);
const bigAfter = await bal(A.carolId, "gratitude");
console.log("ATTACK B grant of 101 -> " + big.status + " " + JSON.stringify(big.json) + "; carol ledger " + bigBefore + " -> " + bigAfter);
if (big.status === 200 && bigAfter - bigBefore === 101) {
  record(1, "a lone admin mints 101 in one call (the stated co-sign threshold is 100)", "BROKE",
    "single call of 101 returned 200 and credited 101. The only ceiling that fired is the per-cycle aggregate ledger.admin_mint_cycle_cap = " + cap +
    "; no second-steward requirement exists on this path at any amount.");
} else {
  record(1, "a lone admin mints 101 in one call", "HELD", big.status + " " + JSON.stringify(big.json));
}

// ── ATTACK C: is the per-cycle cap the real bound, or is it per call? ──────
let minted = 0, calls = 0, last = null;
for (let i = 0; i < 40; i++) {
  const r = await api("POST", "/api/admin/tokens/gratitude/mint", { toUserId: A.daveId, amount: 50, reason: "cap probe " + i }, A.founderToken);
  calls++;
  last = r;
  if (r.status === 200) minted += 50;
  else break;
}
const daveBal = await bal(A.daveId, "gratitude");
console.log("ATTACK C: " + calls + " calls of 50, " + minted + " accepted, last [" + last.status + "] " + JSON.stringify(last.json) + "; dave ledger " + daveBal);
const [[tot]] = await c.query("SELECT COALESCE(SUM(amount),0) s FROM token_ledger WHERE from_account='sys:mint' AND token_type='gratitude'");
console.log("  sys:mint faucet has issued " + Number(tot.s) + " gratitude this cycle; cap is " + cap);
if (Number(tot.s) > cap) record(1, "exceed ledger.admin_mint_cycle_cap by repeated calls", "BROKE", "faucet issued " + Number(tot.s) + " against a cap of " + cap);
else record(1, "exceed ledger.admin_mint_cycle_cap by repeated calls", "HELD",
  "the aggregate cap held at " + Number(tot.s) + " of " + cap + " and refused the next call with " + last.status + " " + JSON.stringify(last.json));

// ── ATTACK D: is the cap the ONLY guard? Try a second token slug. ──────────
const [tokens] = await c.query("SELECT slug, governance, active, transferable, is_example FROM tokens");
console.log("\ntokens: " + JSON.stringify(tokens));
const platformSlugs = tokens.filter((t) => t.governance === "platform" && !t.is_example).map((t) => t.slug);
let extra = 0;
for (const s of platformSlugs) {
  if (s === "gratitude") continue;
  const r = await api("POST", "/api/admin/tokens/" + s + "/mint", { toUserId: A.founderId, amount: 500, reason: "another slug, same cycle" }, A.founderToken);
  console.log("  mint 500 " + s + " to self -> " + r.status + " " + JSON.stringify(r.json).slice(0, 160));
  if (r.status === 200) extra += 500;
}
if (extra > 0) record(1, "the per-cycle mint cap is PER TOKEN, so a self-grant repeats per slug", "BROKE",
  "after gratitude hit its cap, " + extra + " more units were minted to the caller's own account across " + (platformSlugs.length - 1) + " other platform token(s) in the same cycle");
else record(1, "the per-cycle mint cap is PER TOKEN, so a self-grant repeats per slug", "HELD",
  "no other platform-governed token accepted a mint (" + platformSlugs.join(",") + ")");

await c.end();
dump("inv1f.json");
