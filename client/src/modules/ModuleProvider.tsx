/**
 * The client's one source of module truth (S13): fetch /api/modules, expose
 * what THIS viewer may see. Fail-closed for ACCESS — the server's
 * requireModule() is the real gate, so a client that shows nothing can never
 * leak anything. But "the catalog is unknown" is not the same fact as "every
 * module is off", and conflating them is what made a dropped request render
 * ten working pages as 404s (see the retry note below).
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authToken } from "@/lib/gameApi";
import { useAuth } from "@/contexts/AuthContext";

export interface ClientModule {
  id: string;
  name: string;
  description: string;
  core: boolean;
  lifecycle: "off" | "preview" | "members" | "public";
  hyphaLinks: string[];
}

export interface HyphaState {
  configured: boolean;
  orgUrl: string;
  links: Record<string, string>;
}

interface ModulesState {
  modules: ClientModule[];
  hypha: HyphaState;
  loaded: boolean;
  /** True when every retry failed: the catalog is unknown, not empty. */
  failed: boolean;
  refresh: () => void;
}

const EMPTY: ModulesState = {
  modules: [],
  hypha: { configured: false, orgUrl: "", links: {} },
  loaded: false,
  failed: false,
  refresh: () => {},
};

const ModulesContext = createContext<ModulesState>(EMPTY);

const RETRY_DELAYS_MS = [1000, 2000, 4000];

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModulesState>(EMPTY);
  // The manifest is viewer-scoped, so it has to be refetched when the session
  // changes. Login and register are pure SPA transitions with no reload —
  // without this, a member who just signed in kept the anonymous manifest
  // until they happened to hard-refresh, and every members-only page 404'd.
  const { token } = useAuth();
  const alive = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const refresh = () => {
    const attempt = (n: number) => {
      const tk = authToken();
      fetch("/api/modules", { headers: tk ? { Authorization: `Bearer ${tk}` } : {} })
        .then((r) => {
          if (!r.ok) throw new Error(`modules ${r.status}`);
          return r.json();
        })
        .then((d) => {
          if (!alive.current) return;
          setState({
            modules: Array.isArray(d.modules) ? d.modules : [],
            hypha: d.hypha ?? EMPTY.hypha,
            loaded: true,
            failed: false,
            refresh,
          });
        })
        .catch(() => {
          if (!alive.current) return;
          // A blip must not latch an empty catalog: `loaded` stays FALSE while
          // retries are outstanding, so gated pages hold their shell instead
          // of claiming their module is switched off. Only after the last
          // retry do we admit defeat — and then as `failed`, which is a
          // different fact from an empty manifest.
          if (n < RETRY_DELAYS_MS.length) {
            timers.current.push(setTimeout(() => attempt(n + 1), RETRY_DELAYS_MS[n]));
          } else {
            setState((s) => ({ ...s, loaded: true, failed: true, refresh }));
          }
        });
    };
    attempt(0);
  };

  useEffect(refresh, [token]);

  return <ModulesContext.Provider value={{ ...state, refresh }}>{children}</ModulesContext.Provider>;
}

export function useModules(): ModulesState {
  return useContext(ModulesContext);
}

/** One module's client view, or undefined while off/invisible to this viewer. */
export function useModule(id: string): ClientModule | undefined {
  return useModules().modules.find((m) => m.id === id);
}

export function useHypha(): HyphaState {
  return useModules().hypha;
}
