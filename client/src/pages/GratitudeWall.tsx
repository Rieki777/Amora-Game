import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { gameFetch, fetchGameMe, GameMe } from "@/lib/gameApi";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Heart, Send, Sparkles } from "lucide-react";

interface WallEntry {
  id: string;
  from: string;
  to: string;
  message: string;
  at: string;
}

export default function GratitudeWall() {
  const { user } = useAuth();
  const [wall, setWall] = useState<WallEntry[]>([]);
  const [me, setMe] = useState<GameMe | null>(null);
  const [currency, setCurrency] = useState("Gratitude");
  const [form, setForm] = useState({ toEmail: "", amount: 10, message: "" });
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    fetch("/api/game/gratitude/wall")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setWall(Array.isArray(d) ? d : []))
      .catch(() => { /* silent */ });
    fetchGameMe().then(setMe);
    fetch("/api/game/config")
      .then((r) => r.json())
      .then((c) => setCurrency(c?.currency?.name ?? "Gratitude"))
      .catch(() => { /* silent */ });
  };

  useEffect(load, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setFeedback(null);
    try {
      const res = await gameFetch("/api/game/gratitude/send", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? "Something went wrong" });
      } else {
        setFeedback({ ok: true, text: "Your appreciation is on the wall." });
        setForm({ toEmail: "", amount: 10, message: "" });
        load();
      }
    } catch {
      setFeedback({ ok: false, text: "Something went wrong. Try again." });
    }
    setSending(false);
  };

  const budget = me?.gratitude.budget;

  return (
    <Layout>
      <section className="bg-teal-deep text-white py-16">
        <div className="container max-w-3xl mx-auto px-4 text-center">
          <Heart className="w-8 h-8 text-amber mx-auto mb-3" />
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">
            The {currency} Wall
          </h1>
          <p className="text-white/80 max-w-xl mx-auto">
            Appreciation, spoken out loud. Every month each member has a budget of {currency.toLowerCase()} to
            acknowledge the people building this village.
          </p>
        </div>
      </section>

      <section className="bg-stone-50 py-14">
        <div className="container max-w-2xl mx-auto px-4">
          {user ? (
            <form onSubmit={send} className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-bold text-teal-deep">Send {currency.toLowerCase()}</h2>
                {budget && budget.total > 0 ? (
                  <span className="text-sm text-stone-500">
                    <span className="font-semibold text-teal-deep">{budget.remaining}</span> / {budget.total} left this cycle
                  </span>
                ) : (
                  <span className="text-xs text-stone-400 italic">Your sending budget unlocks as you progress</span>
                )}
              </div>
              <div className="grid md:grid-cols-[1fr_110px] gap-3 mb-3">
                <input
                  type="email"
                  required
                  value={form.toEmail}
                  onChange={(e) => setForm({ ...form, toEmail: e.target.value })}
                  placeholder="Member's email"
                  className="px-3 py-2 border border-stone-200 rounded-lg outline-none focus:border-teal-deep"
                />
                <input
                  type="number"
                  min={1}
                  required
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: parseInt(e.target.value) || 1 })}
                  className="px-3 py-2 border border-stone-200 rounded-lg outline-none focus:border-teal-deep"
                />
              </div>
              <textarea
                required
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="What are you thanking them for?"
                rows={2}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg outline-none focus:border-teal-deep resize-y mb-3"
              />
              {feedback && (
                <p className={`text-sm mb-3 ${feedback.ok ? "text-teal-deep" : "text-red-600"}`}>{feedback.text}</p>
              )}
              <button
                type="submit"
                disabled={sending || !budget || budget.total <= 0}
                className="inline-flex items-center gap-2 bg-teal-deep text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-teal disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" /> {sending ? "Sending..." : "Send"}
              </button>
            </form>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 mb-10 text-center">
              <p className="text-stone-600 mb-4">Sign in to send {currency.toLowerCase()} to a fellow member.</p>
              <Link href="/login" className="inline-flex items-center gap-2 bg-teal-deep text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-teal transition-colors">
                Sign In
              </Link>
            </div>
          )}

          {wall.length === 0 ? (
            <div className="text-center py-14 text-stone-400">
              <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>The wall is waiting for its first appreciation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {wall.map((w) => (
                <div key={w.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm px-5 py-4">
                  <p className="text-stone-700 leading-relaxed mb-2">"{w.message}"</p>
                  <p className="text-xs text-stone-400">
                    <span className="font-semibold text-teal-deep">{w.from}</span> to{" "}
                    <span className="font-semibold text-teal-deep">{w.to}</span> ·{" "}
                    {new Date(w.at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
