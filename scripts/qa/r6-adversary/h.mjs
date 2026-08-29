/** QA-2 r6 harness. LOCAL only, port 3902, scratch schema village_qa6_2. */
import mysql from "mysql2/promise";
import fs from "fs";
export const BASE = "http://127.0.0.1:3902";
export const SCHEMA = "village_qa6_2";

export async function api(method, route, body, auth, extra) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(extra ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json, text, headers: Object.fromEntries(res.headers) };
}
export function show(label, r, n = 500) {
  const s = typeof r.json === "string" ? r.json.slice(0, n) : JSON.stringify(r.json)?.slice(0, n);
  console.log(`[${r.status}] ${label} :: ${s}`);
}
export async function db() {
  return mysql.createConnection({
    host: "127.0.0.1", port: 3307, user: "root", password: "amoratest",
    database: SCHEMA, multipleStatements: true, timezone: "Z",
  });
}
export function actors() {
  return JSON.parse(fs.readFileSync(new URL("./actors.json", import.meta.url), "utf8"));
}
/** A result line the report can count. */
const results = [];
export function record(inv, attack, outcome, detail) {
  results.push({ inv, attack, outcome, detail });
  console.log(`  ${outcome === "BROKE" ? "!! BROKE" : outcome === "HELD" ? "-- HELD " : "?? " + outcome} [inv${inv}] ${attack} :: ${detail ?? ""}`);
}
export function dump(file) {
  fs.writeFileSync(new URL("./" + file, import.meta.url), JSON.stringify(results, null, 2));
  const broke = results.filter(r => r.outcome === "BROKE").length;
  console.log(`\n== ${results.length} attacks, ${broke} succeeded, ${results.filter(r=>r.outcome==="HELD").length} held, ${results.filter(r=>!["BROKE","HELD"].includes(r.outcome)).length} not measurable`);
}
