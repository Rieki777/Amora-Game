// Platform game API client. All project-specific naming comes from /api/game/config.

const TOKEN_KEY = "amora-auth-token";

export function authToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export async function gameFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = authToken();
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export interface GameStagePublic {
  id: string;
  name: string;
  description: string;
}

export interface GameMe {
  stage: GameStagePublic & { gratitudeMultiplier: number };
  stageIndex: number;
  stages: GameStagePublic[];
  gratitude: { balance: number; budget: { total: number; spent: number; remaining: number; cycleId: string } };
  quests: QuestClaim[];
  journeys: Record<string, string[]>;
  membership: boolean;
  trainingComplete: boolean;
  nextAction: { id: string; label: string; href: string };
}

export interface QuestClaim {
  id: string;
  questId: string;
  questTitle: string;
  status: "claimed" | "submitted" | "consented" | "declined";
  claimedAt: string;
  artifactUrl: string;
  note: string;
  amount?: number;
}

export async function fetchGameMe(): Promise<GameMe | null> {
  if (!authToken()) return null;
  try {
    const res = await gameFetch("/api/game/me");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
