// Platform game API client. All project-specific naming comes from /api/game/config.
import { useEffect, useState } from "react";

const TOKEN_KEY = "amora-auth-token";

export interface BrandImages {
  hero?: string;
  investorHero?: string;
  residentHero?: string;
  stewardHero?: string;
  prosperityHero?: string;
  masterPlanHero?: string;
}

export interface PublicGameConfig {
  project: { name: string; tagline: string; memberName: string; location: string; adminPath: string };
  currency: { name: string; nameLower: string };
  images: BrandImages;
  paths: { id: string; label: string; role: string; route: string }[];
  stages: { id: string; name: string; description: string }[];
  season: { name: string; theme: string; focus: string; startsOn: string; endsOn: string };
}

// One shared, cached fetch of the public config so many components don't each hit it.
let _configCache: Promise<PublicGameConfig | null> | null = null;
export function fetchConfigCached(): Promise<PublicGameConfig | null> {
  if (!_configCache) {
    _configCache = fetch("/api/game/config")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return _configCache;
}

/** Live (brand-overlaid) hero image URLs, empty until loaded — callers fall back
 * to their own default so the page never renders imageless. */
export function useBrandImages(): BrandImages {
  const [images, setImages] = useState<BrandImages>({});
  useEffect(() => {
    fetchConfigCached().then((c) => { if (c?.images) setImages(c.images); });
  }, []);
  return images;
}

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
