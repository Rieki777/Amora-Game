/**
 * The other half of the Google round trip: what happens when Google sends the
 * member back.
 *
 * The callback route redirects to `/login?oauth=complete&next=...` with a
 * short-lived HttpOnly cookie set. This hook trades that cookie for a session
 * token, stores it where the rest of the app looks, and reloads onto the
 * destination. On failure it hands back a sentence a member can act on.
 *
 * WHY A FULL PAGE LOAD AND NOT A ROUTER PUSH. The session token lives in
 * localStorage and `AuthProvider` reads it in a synchronous initialiser at
 * mount. Writing the token and then navigating within the running app would
 * leave every consumer holding the pre-sign-in value until something forced a
 * re-read. The member has already crossed two redirects to get here, so one
 * more load costs nothing and starts the app in a clean signed-in state.
 */
import { useEffect, useState } from "react";
import { TOKEN_KEY } from "@/lib/gameApi";

export type GoogleReturnState =
  | { status: "none" }
  | { status: "working" }
  | { status: "failed"; message: string };

/**
 * Every refusal the server can send, in words a member can use.
 *
 * The server sends a short code and never a sentence, so the wording stays in
 * the client where the village's voice lives. Anything unrecognised falls back
 * to a plain sentence with a way forward, because a code a member cannot read
 * is the same as no message at all.
 */
function messageFor(reason: string): string {
  switch (reason) {
    case "cancelled":
      return "That sign-in was cancelled. You can try again, or sign in with your email and password.";
    case "email_unverified":
      return "Google has not confirmed that email address belongs to you, so it cannot be used to sign in here. Use your email and password.";
    case "already_linked_elsewhere":
      return "This account is already connected to a different Google account. Sign in with your email and password, or ask an admin for help.";
    case "account_unavailable":
      return "That account cannot be signed into. Ask an admin for help.";
    case "not_configured":
      return "Google sign-in is not set up on this village. Use your email and password.";
    case "bad_state":
      return "That sign-in link expired before it was finished. Start again.";
    default:
      return "Google sign-in did not finish. You can try again, or sign in with your email and password.";
  }
}

export function useGoogleSignInReturn(): GoogleReturnState {
  const [state, setState] = useState<GoogleReturnState>({ status: "none" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("oauth");
    if (mode === "error") {
      setState({ status: "failed", message: messageFor(params.get("reason") ?? "") });
      return;
    }
    if (mode !== "complete") return;

    setState({ status: "working" });
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/google/exchange", {
          method: "POST",
          // Explicit, even though same-origin is the default: the whole
          // exchange is the cookie, so a change of default elsewhere must not
          // quietly stop sending it.
          credentials: "same-origin",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (alive) {
            setState({
              status: "failed",
              message: body?.error || "That sign-in expired before it finished. Start again.",
            });
          }
          return;
        }
        const data = await res.json();
        localStorage.setItem(TOKEN_KEY, data.token);
        const next = params.get("next");
        // Same rule the server applies to the destination, applied again here
        // because this value came back through a URL a member could edit.
        const safe = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/profile";
        window.location.replace(safe);
      } catch {
        if (alive) {
          setState({ status: "failed", message: "Could not reach the village to finish signing in. Try again." });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
