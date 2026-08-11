/**
 * Crews on a quest page: who is walking this one together.
 *
 * Signed-in only, including the read. A quest page is public and indexable,
 * and who is walking with whom is not something a crawler gets to index.
 *
 * A crew is company, never a shortcut. Every member still claims, submits and
 * is consented to on their own work, so nothing here touches value and the
 * panel says so rather than implying a shared reward.
 */
import { useEffect, useState } from "react";
import { Copy, LogOut, Plus, Users } from "lucide-react";
import { gameFetch } from "@/lib/gameApi";
import { crewCodeFrom, inviteUrl } from "@/lib/crewLinks";

export interface CrewView {
  id: string;
  questId: string;
  name: string;
  status: string;
  size: number;
  maxSize: number;
  joined?: boolean;
  inviteCode?: string;
  conversationId?: string | null;
  members: { role: string; name: string }[];
}

export default function QuestCrews({
  questId,
  signedIn,
}: {
  questId: string;
  signedIn: boolean;
}) {
  const [crews, setCrews] = useState<CrewView[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [opening, setOpening] = useState(false);

  const load = () => {
    if (!signedIn) return;
    gameFetch(`/api/quests/${encodeURIComponent(questId)}/crews`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCrews(Array.isArray(d) ? d : []))
      .catch(() => setCrews([]));
  };

  useEffect(load, [questId, signedIn]);

  // Somebody followed an invite link. Join once, then clean the code off the
  // URL so a refresh or a share of THIS page does not carry it onward.
  useEffect(() => {
    if (!signedIn) return;
    const code = crewCodeFrom(window.location.search);
    if (!code) return;
    setBusy(true);
    gameFetch(`/api/crews/join/${encodeURIComponent(code)}`, { method: "POST" })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        setNote(r.ok ? (d?.already ? "You are already in this crew." : `You joined ${d?.name ?? "the crew"}.`) : d?.error ?? "That invite is no longer open.");
      })
      .catch(() => setNote("That invite is no longer open."))
      .finally(() => {
        setBusy(false);
        window.history.replaceState({}, "", window.location.pathname);
        load();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, questId]);

  const create = async () => {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    const r = await gameFetch(`/api/quests/${encodeURIComponent(questId)}/crews`, {
      method: "POST",
      body: JSON.stringify({ name: clean }),
    });
    const d = await r.json().catch(() => null);
    setNote(r.ok ? `${d?.name ?? "Your crew"} is open. Send the invite link.` : d?.error ?? "That did not work.");
    setName("");
    setOpening(false);
    setBusy(false);
    load();
  };

  const join = async (crew: CrewView) => {
    if (!crew.inviteCode) return;
    setBusy(true);
    const r = await gameFetch(`/api/crews/join/${encodeURIComponent(crew.inviteCode)}`, {
      method: "POST",
    });
    setNote(r.ok ? `You joined ${crew.name}.` : "That crew is full.");
    setBusy(false);
    load();
  };

  const leave = async (crew: CrewView) => {
    setBusy(true);
    await gameFetch(`/api/crews/${encodeURIComponent(crew.id)}/leave`, { method: "POST" });
    setNote(`You left ${crew.name}.`);
    setBusy(false);
    load();
  };

  const copyInvite = async (crew: CrewView) => {
    if (!crew.inviteCode) return;
    const url = inviteUrl(window.location.origin, questId, crew.inviteCode);
    try {
      await navigator.clipboard.writeText(url);
      setNote("Invite link copied.");
    } catch {
      setNote(url);
    }
  };

  if (!signedIn) return null;

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
      <h2 className="font-display text-lg font-bold text-foreground mb-1 flex items-center gap-2">
        <Users className="w-5 h-5 text-teal-deep" />
        Walk it with a crew
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        A crew is company for the same quest. Everyone still submits their own
        work and is consented to on it.
      </p>

      {crews === null ? (
        <div className="h-10 rounded-lg bg-muted animate-pulse" aria-busy="true" />
      ) : (
        <>
          <ul className="space-y-3">
            {crews.map((crew) => (
              <li key={crew.id} className="border border-border rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{crew.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {crew.members.map((m) => m.name).filter(Boolean).join(", ")}
                      {crew.size >= crew.maxSize ? " (full)" : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {crew.size} of {crew.maxSize}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {crew.joined ? (
                    <>
                      <button
                        onClick={() => copyInvite(crew)}
                        disabled={busy}
                        className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border text-sm font-semibold text-teal-deep hover:border-teal/40 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                        Invite link
                      </button>
                      <button
                        onClick={() => leave(crew)}
                        disabled={busy}
                        className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Leave
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Crews open by invitation. Ask someone inside for their link.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {crews.length === 0 && !opening && (
            <p className="text-sm text-muted-foreground">
              No crew on this quest yet. Start the first one.
            </p>
          )}

          {opening ? (
            <div className="mt-4 flex flex-col gap-2">
              <label htmlFor="crew-name" className="text-sm font-medium text-foreground">
                Name your crew
              </label>
              <input
                id="crew-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="The Thursday Crew"
                className="min-h-11 px-3 rounded-lg border border-border bg-background text-foreground"
              />
              <div className="flex gap-2">
                <button
                  onClick={create}
                  disabled={busy || !name.trim()}
                  className="min-h-11 px-4 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50"
                >
                  Open the crew
                </button>
                <button
                  onClick={() => setOpening(false)}
                  className="min-h-11 px-4 rounded-lg text-muted-foreground font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setOpening(true)}
              disabled={busy}
              className="mt-4 min-h-11 px-4 inline-flex items-center gap-2 rounded-lg border border-border font-semibold text-teal-deep hover:border-teal/40 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Form a crew
            </button>
          )}
        </>
      )}

      {note && <p className="mt-3 text-sm text-teal-deep">{note}</p>}
    </div>
  );
}
