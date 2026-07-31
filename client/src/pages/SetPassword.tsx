import Layout from "@/components/Layout";
import { useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, CheckCircle2 } from "lucide-react";

/**
 * Claim an account by setting its password (S1). Reached from the founder
 * bootstrap email today; the same page becomes the password-reset landing when
 * reset emails exist. The token arrives as ?token=… and expires in an hour.
 */
export default function SetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("Passwords don't match.");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not set the password");
      localStorage.setItem("amora-auth-token", data.token);
      setDone(true);
      // Admins land on the admin panel; everyone else on their profile. This
      // route is a member-reachable password reset now, and sending an
      // ordinary member to /admin lands them on a refusal screen.
      const isAdminUser = data.user?.role === "admin" || data.user?.role === "founder";
      setTimeout(() => { window.location.href = isAdminUser ? "/admin" : "/profile"; }, 1200);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. The link may have expired.");
    }
    setBusy(false);
  };

  return (
    <Layout>
      <section className="py-24 bg-gradient-to-b from-teal/10 to-background min-h-[70vh]">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto bg-card border border-border rounded-2xl shadow-sm p-8"
          >
            {done ? (
              <div className="text-center">
                <CheckCircle2 className="w-12 h-12 text-teal-deep mx-auto mb-4" />
                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  You're in
                </h1>
                <p className="text-muted-foreground">Password set — taking you to your dashboard…</p>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-teal/10 flex items-center justify-center mx-auto mb-6">
                  <KeyRound className="w-6 h-6 text-teal-deep" />
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground text-center mb-2">
                  Set your password
                </h1>
                <p className="text-sm text-muted-foreground text-center mb-8">
                  Choose the password for your account. This link expires an hour
                  after it was sent.
                </p>
                {!token && (
                  <p className="text-sm text-destructive text-center mb-4">
                    This link is missing its token — open the link from your email
                    again.
                  </p>
                )}
                <form onSubmit={submit} className="space-y-4">
                  <input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="New password (8+ characters)"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <input
                    type="password"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    placeholder="Repeat it"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <button
                    type="submit"
                    disabled={busy || !token}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {busy ? "Saving…" : "Set password"}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
