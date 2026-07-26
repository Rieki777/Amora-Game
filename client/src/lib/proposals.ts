// One submission path for every kind of proposal, so the Work With Us offer and
// a self-proposed quest can never drift apart in how they reach the admin inbox.
import { authToken } from "./gameApi";

export type ProposalKind = "work-with-us" | "quest-proposal";

/** Posts to the shared submissions pipeline. `type` is what the admin filters on. */
export async function submitProposal(
  type: ProposalKind,
  data: object,
  hp = ""
): Promise<boolean> {
  try {
    const token = authToken();
    const res = await fetch("/api/forms/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ type, data, hp }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Whether the guided assistant is switched on for this deployment. */
export async function assistantAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/assistant/status");
    const data = await res.json();
    return !!data.available;
  } catch {
    return false;
  }
}
