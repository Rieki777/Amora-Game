// Platform game API client. All project-specific naming comes from /api/game/config.
import { useEffect, useState } from "react";

/**
 * The ONE localStorage key for the session token. Exported so nothing else
 * re-types the literal: eight hand-written copies is eight chances for a
 * fork's rename to miss one and split the session in half (a page reading a
 * key nothing writes reads as permanently signed out).
 */
export const TOKEN_KEY = "amora-auth-token";

export interface BrandImages {
  hero?: string;
  investorHero?: string;
  residentHero?: string;
  stewardHero?: string;
  prosperityHero?: string;
  masterPlanHero?: string;
  logo?: string;
  heartLogo?: string;
  favicon?: string;
}

export interface PublicGameConfig {
  project: {
    name: string;
    tagline: string;
    memberName: string;
    location: string;
    adminPath: string;
    /** Blank = the village has no outside site; render no link. */
    siteUrl?: string;
    eventsUrl?: string;
    footerBlurb?: string;
  };
  currency: {
    name: string;
    nameLower: string;
    /** The VALUE token the cycle pool distributes across recognition — named
     *  in the token registry (Admin → Tokens), so a fork's rename reaches
     *  every page that mentions it. Recognition itself carries no financial
     *  value; this is the tracked value it steers each cycle. */
    value?: { slug: string; name: string };
  };
  images: BrandImages;
  paths: { id: string; label: string; role: string; route: string }[];
  stages: { id: string; name: string; description: string }[];
  season: SeasonState;
}

export interface SeasonEntry {
  id: string;
  name: string;
  theme: string;
  focus: string;
  startsOn: string;
  endsOn: string;
  goals: { text: string; done: boolean }[];
}

/** Computed server-side: `current` is chosen by date, so a banner can never
 *  advertise a season that already ended. Null current = show nothing. */
export interface SeasonState {
  current: SeasonEntry | null;
  upcoming: SeasonEntry | null;
  needsNextSeason: boolean;
  daysLeft: number;
  daysUntilStart: number;
  timezone: string;
  cadence: string;
  today: string;
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

/**
 * The whole live config, null until loaded. The shell (Layout) reads its
 * identity — logo, name, outside links, footer copy — from here rather than
 * from literals, which is what makes a fork's shell the fork's without a
 * code change. Callers must treat null as "unknown, reserve the space",
 * never as "this village has no identity".
 */
export function useGameConfig(): PublicGameConfig | null {
  const [config, setConfig] = useState<PublicGameConfig | null>(null);
  useEffect(() => {
    let alive = true;
    fetchConfigCached().then((c) => { if (alive && c) setConfig(c); });
    return () => { alive = false; };
  }, []);
  return config;
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

/** The one source every season-driven surface reads, so a banner, a page header
 *  and the pulse can never disagree about what season it is. */
let _seasonCache: Promise<SeasonState | null> | null = null;
export function fetchSeasonCached(): Promise<SeasonState | null> {
  if (!_seasonCache) {
    _seasonCache = fetch("/api/season")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return _seasonCache;
}

export function useSeason(): SeasonState | null {
  const [season, setSeason] = useState<SeasonState | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSeasonCached().then((s) => { if (alive) setSeason(s); });
    return () => { alive = false; };
  }, []);
  return season;
}

export function authToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * The ONE way to drop the session client-side. Components that reached for
 * localStorage directly wrote/removed a key nobody else used — the bug that
 * left the notification bell and the module manifest permanently anonymous.
 */
export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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
