import { api, show } from "./h.mjs";
import fs from "fs";
const out = {};
const PW = "QaTest123!";
let r = await api("POST", "/api/auth/register", { name: "Fiona Founder", email: "founder@qa62.test", password: PW, paths: ["builder"] });
show("register founder", r);
out.founderId = r.json?.user?.id;
r = await api("POST", "/api/admin/bootstrap", { password: "qa6-2-admin-pass", email: "founder@qa62.test", name: "Fiona Founder" });
show("bootstrap admin", r);
r = await api("POST", "/api/auth/login", { email: "founder@qa62.test", password: PW });
show("login founder", r);
out.founderToken = r.json?.token; out.founderId = r.json?.user?.id ?? out.founderId;
for (const [key, name, email] of [
  ["alice", "Alice Ordinary", "alice@qa62.test"],
  ["bob", "Bob Ordinary", "bob@qa62.test"],
  ["carol", "Carol Roled", "carol@qa62.test"],
  ["dave", "Dave Denied", "dave@qa62.test"],
]) {
  const rr = await api("POST", "/api/auth/register", { name, email, password: PW, paths: ["builder"] });
  show("register " + key, rr);
  out[key + "Token"] = rr.json?.token; out[key + "Id"] = rr.json?.user?.id;
}
fs.writeFileSync(new URL("./actors.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(Object.keys(out).join(", "));
