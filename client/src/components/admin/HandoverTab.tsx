/**
 * The handover tab, moved out of client/src/pages/Admin.tsx unchanged.
 *
 * Measured before the move, not guessed: of the 44 tab components in that
 * file this one referenced the fewest things defined alongside it (API_BASE,
 * authHeaders and refusal, all three of which now live in ./adminApi), and it
 * is one of only two real tabs carrying no `text-gray-*` class, which is what
 * let it move without disturbing the Tailwind-gray ratchet whose per-file
 * baseline would otherwise treat a new file as new debt. So it goes first: it
 * proves the shape at the lowest risk to everything else.
 *
 * Everything below this comment is byte-for-byte what Admin.tsx held, with
 * `export default` added to the declaration. No behaviour changed.
 */
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { API_BASE, authHeaders, refusal } from "./adminApi";

/**
 * THE HANDOVER (0098): what this village looks after, and how a power moves.
 *
 * R54, the founder's ruling: these villages are meant to be taken over by
 * their electorate, and the admin panel is scaffolding to be dismantled. This
 * tab is the scaffolding naming itself.
 *
 * TWO STEPS AND THE ORDER MATTERS, which is why the panel is shaped this way
 * and not as one button. First a role is given the power, so somebody can
 * act. Then the village takes the power on, and from that moment the admin
 * short-circuit stops answering for it. Handing a power to a role nobody
 * could act through would produce the one state worth refusing outright: the
 * admin stops passing, the named holder never passed, and the power belongs
 * to nobody. The server refuses it; this panel makes it hard to try.
 */
export default function HandoverTab({ password }: { password: string }) {
  const [data, setData] = useState<any>(null);
  const [picking, setPicking] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/capabilities/holding`, { headers: authHeaders(password) });
      setData(res.ok ? await res.json() : null);
    } catch { setData(null); }
  }, [password]);
  useEffect(() => { load(); }, [load]);

  const roles: any[] = data?.roles ?? [];

  /** Give a role a capability it does not carry yet, escalation and all. */
  const grant = async (roleId: string, capability: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;
    const next = Array.from(new Set([...(role.capabilities ?? []), capability]));
    setBusy(capability);
    try {
      let res = await fetch(`${API_BASE}/admin/roles/${roleId}/capabilities`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ capabilities: next }),
      });
      let d = await res.json();
      if (res.status === 409 && d?.requiresConfirmation) {
        const lines = (d.escalations ?? []).map((e: any) => `Anyone in it could ${e.consequence}.`).join("\n");
        if (!window.confirm(`${d.error}\n\n${lines}`)) { setBusy(""); return; }
        res = await fetch(`${API_BASE}/admin/roles/${roleId}/capabilities`, {
          method: "PUT",
          headers: authHeaders(password, { "Content-Type": "application/json" }),
          body: JSON.stringify({
            capabilities: next,
            grantedEscalations: (d.escalations ?? []).map((e: any) => e.capability),
          }),
        });
        d = await res.json();
      }
      if (!res.ok) throw new Error(refusal(d, "The change did not go through"));
      toast.success(`${role.name} carries it now`);
      load();
    } catch (e: any) { toast.error(e?.message || "The change did not go through"); }
    setBusy("");
  };

  /** Hand the power to the village. */
  const handOver = async (capability: string, roleId: string) => {
    setBusy(capability);
    try {
      const res = await fetch(`${API_BASE}/admin/capabilities/${encodeURIComponent(capability)}/holding`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ roleId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(refusal(d, "The handover did not go through"));
      toast.success("The village holds it now");
      load();
    } catch (e: any) { toast.error(e?.message || "The handover did not go through"); }
    setBusy("");
  };

  const takeBack = async (capability: string) => {
    if (!window.confirm("Bring this power back to the admin panel? The village sees this on its own feed.")) return;
    setBusy(capability);
    try {
      const res = await fetch(`${API_BASE}/admin/capabilities/${encodeURIComponent(capability)}/holding`, {
        method: "DELETE",
        headers: authHeaders(password),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(refusal(d, "That did not go through"));
      toast.success("Back with the admin panel");
      load();
    } catch (e: any) { toast.error(e?.message || "That did not go through"); }
    setBusy("");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl font-semibold">The handover</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Every power below has somebody behind it. A power the village holds is one
          you stop passing by being an admin: whoever sits in the holding role acts on
          their own account, and you can still reach past it on a day something has
          gone wrong. Reaching past writes a line on the village feed naming the power
          and your name, and tells whoever holds it.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Members read the same list, in their own words, at{" "}
          <Link href="/powers" className="underline">What this village looks after</Link>.
        </p>
      </div>

      {(data?.powers ?? []).map((p: any) => {
        const holdingRole = p.heldBy ? roles.find((r) => r.id === p.heldBy.roleId) : null;
        const canHold = roles.filter((r) => !r.isExample && (r.capabilities ?? []).includes(p.capability));
        const chosen = picking[p.capability] ?? "";
        return (
          <div key={p.capability} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">{p.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{p.surface}.</p>
                <p className="text-sm mt-2">Whoever holds this can {p.consequence}.</p>
              </div>
              <code className="text-xs text-muted-foreground shrink-0">{p.capability}</code>
            </div>

            {p.heldBy ? (
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm">
                  {holdingRole?.name ?? p.heldBy.roleName ?? p.heldBy.roleId} holds this.{" "}
                  {p.heldBy.byBallot ? "The village voted it across." : "An admin handed it over."}
                </p>
                <button
                  className="text-sm underline text-muted-foreground"
                  disabled={busy === p.capability}
                  onClick={() => takeBack(p.capability)}
                >
                  Bring it back
                </button>
              </div>
            ) : !p.movable ? (
              <p className="text-sm text-muted-foreground mt-3">
                This one stays with the admin panel for now. Its gate has no way back
                through the product yet, and a power an operator cannot reach past is
                an outage waiting for a bad day.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  The admin panel looks after this one.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="border border-border rounded px-2 py-1 text-sm bg-background"
                    value={chosen}
                    onChange={(e) => setPicking((prev) => ({ ...prev, [p.capability]: e.target.value }))}
                  >
                    <option value="">Choose a role</option>
                    {roles.filter((r) => !r.isExample).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {chosen && !canHold.some((r) => r.id === chosen) && (
                    <button
                      className="text-sm px-3 py-1 rounded border border-border"
                      disabled={busy === p.capability}
                      onClick={() => grant(chosen, p.capability)}
                    >
                      Give this role the power
                    </button>
                  )}
                  {chosen && canHold.some((r) => r.id === chosen) && (
                    <button
                      className="text-sm px-3 py-1 rounded bg-primary text-primary-foreground"
                      disabled={busy === p.capability}
                      onClick={() => handOver(p.capability, chosen)}
                    >
                      Hand it to the village
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
