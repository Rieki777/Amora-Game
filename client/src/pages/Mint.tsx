/**
 * The Mint: what the village pays for, and what it has issued.
 *
 * Its own route rather than a tab inside the 5,000-line Admin page, because
 * editing that file is how another lane's in-flight work gets swept up, and
 * because this surface has one job and can be read in one screen.
 *
 * EVERY EDIT HERE WAITS FOR THE MOON, and the panel says so at the point of
 * change rather than in a help text nobody opens. That is not a UI choice: the
 * server defers it, so an admin who expects an immediate change would otherwise
 * watch nothing happen and try again. A surface that could write a live amount
 * would be a way around the deferral rather than a use of it.
 *
 * Colours follow what this lane learned the hard way: text on the page
 * background is measured against #f2f2f2 and never against white, `-light`
 * tokens are backgrounds and never foregrounds, and a tint set on an element is
 * the backdrop for the text on that element.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
};

interface Rule {
  id: string;
  trigger: string;
  token: string;
  tokenName: string;
  amount: number | null;
  ceiling: number;
  recipient: string;
  enabled: boolean;
  pending: null | { amount: number | null; ceiling: number; enabled: boolean; fromCycle: number };
}

interface View {
  cycleKey: string;
  rules: Rule[];
  supply: Array<{ token: string; source: string; issued: number }>;
  settlementPreview: { seats: number; mints: Array<{ token: string; units: number }> };
}

const card = "bg-white rounded-2xl shadow-lg p-6";
const h2 = "text-xl font-display font-bold text-teal-deep mb-4";

/** Plain words for a machine-readable trigger. */
const TRIGGER_WORDS: Record<string, string> = {
  "quest.completed": "A steward confirms finished work",
  "gratitude.given": "A member thanks another",
  "role.cycle": "Each moon, to everyone holding a seat",
  "journey.stage_reached": "Reaching a stage of the journey",
  "welcome_aboard.quest": "A welcome quest",
  "library.contributed": "Lending something to the library",
  "stay.work_exchange": "A work exchange for a stay",
};

export default function Mint() {
  const { user } = useAuth();
  const [view, setView] = useState<View | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const load = () => {
    fetch("/api/admin/economy", { headers: headers() })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          setDenied(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => d && setView(d))
      .catch(() => {});
  };
  useEffect(load, [user?.id]);

  const queue = async (rule: Rule, change: Record<string, unknown>) => {
    setBusy(rule.id);
    setNote("");
    const res = await fetch(`/api/admin/economy/rules/${encodeURIComponent(rule.id)}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(change),
    });
    setBusy("");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(body.error || "That change was refused.");
      return;
    }
    if (body.view) setView(body.view);
    setNote("Queued. It takes effect at the next moon.");
  };

  if (denied) return <NotFound />;
  if (!view) {
    return (
      <Layout>
        <div className="container py-16 text-gray-700">Looking.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-teal-deep/5 to-amber/5 py-10">
        <div className="container max-w-4xl">
          <h1 className="text-3xl font-display font-bold text-teal-deep">The Mint</h1>
          <p className="mt-2 text-gray-700">
            What this village pays for, and what it has issued. Every change here takes effect at
            the next moon, so nothing can be raised and lowered around a settlement.
          </p>
          <p className="mt-1 text-sm text-sage">This moon is {view.cycleKey}.</p>

          {note ? (
            <p className="mt-4 rounded-lg border border-sage/40 bg-sage-light px-4 py-3 text-sm text-sage">
              {note}
            </p>
          ) : null}

          {/* The rules. */}
          <section className={`${card} mt-6`}>
            <h2 className={h2}>What the village pays</h2>
            {view.rules.length === 0 ? (
              <p className="text-gray-700">No rules seeded yet. The economy mints nothing until there are.</p>
            ) : (
              <ul className="space-y-4">
                {view.rules.map((r) => (
                  <li key={r.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-gray-900">
                        {TRIGGER_WORDS[r.trigger] ?? r.trigger}
                      </p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          r.enabled ? "bg-sage-light text-sage" : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {r.enabled ? "Paying" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700">
                      {r.amount === null
                        ? `up to ${r.ceiling} ${r.tokenName}, as much as the work was posted for`
                        : `${r.amount} ${r.tokenName}`}
                      {" to each "}
                      {r.recipient}
                    </p>

                    {r.pending ? (
                      <p className="mt-2 rounded-lg bg-amber-light px-3 py-2 text-sm text-gray-900">
                        Queued for the next moon:{" "}
                        {r.pending.amount === null ? "read from the source" : `${r.pending.amount} ${r.tokenName}`}
                        {r.pending.enabled ? "" : ", paused"}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="text-sm text-gray-700">
                        Amount
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          defaultValue={r.amount ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v === String(r.amount ?? "")) return;
                            queue(r, { amount: v === "" ? null : Number(v) });
                          }}
                          className="ml-2 w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-base"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => queue(r, { enabled: !r.enabled })}
                        className="min-h-11 rounded-lg border border-teal-deep px-4 py-2 text-sm font-semibold text-teal-deep disabled:opacity-50"
                      >
                        {r.enabled ? "Pause at the next moon" : "Resume at the next moon"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Supply, per source. This detail is admin-only on purpose. */}
          <section className={`${card} mt-6`}>
            <h2 className={h2}>What has been issued</h2>
            {view.supply.length === 0 ? (
              <p className="text-gray-700">Nothing yet. Every faucet is still at zero.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-gray-700">
                    <th className="pb-2 font-semibold">Token</th>
                    <th className="pb-2 font-semibold">From</th>
                    <th className="pb-2 text-right font-semibold">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {view.supply.map((s) => (
                    <tr key={`${s.token}:${s.source}`} className="border-t border-gray-100">
                      <td className="py-2 text-gray-900">{s.token}</td>
                      <td className="py-2 text-gray-700">{s.source}</td>
                      <td className="py-2 text-right text-gray-900">{s.issued}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-4 text-sm text-gray-700">
              This breakdown stays here. The public feed publishes village totals only, because at
              a small size a per-source figure can be read back to one person's balance.
            </p>
          </section>

          {/* Settlement preview. */}
          <section className={`${card} mt-6`}>
            <h2 className={h2}>At the next moon</h2>
            {view.settlementPreview.seats === 0 ? (
              <p className="text-gray-700">Nobody holds a seat, so the settlement pays nothing.</p>
            ) : (
              <p className="text-gray-800">
                {view.settlementPreview.seats} seat
                {view.settlementPreview.seats === 1 ? "" : "s"} thanked
                {view.settlementPreview.mints.length
                  ? `, and ${view.settlementPreview.mints
                      .map((m) => `${m.units} of ${m.token}`)
                      .join(", ")} minted.`
                  : "."}
              </p>
            )}
            <p className="mt-3 text-sm text-gray-700">
              Computed from the rules in force now, so a change queued today is not in this
              number until the moon it lands in.
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
