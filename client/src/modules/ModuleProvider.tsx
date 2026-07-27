/**
 * The client's one source of module truth (S13): fetch /api/modules once,
 * expose what THIS viewer may see. Fail-closed — if the fetch dies, module
 * nav simply doesn't render; the core site never crashes over the catalog.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authToken } from "@/lib/gameApi";

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
  refresh: () => void;
}

const EMPTY: ModulesState = {
  modules: [],
  hypha: { configured: false, orgUrl: "", links: {} },
  loaded: false,
  refresh: () => {},
};

const ModulesContext = createContext<ModulesState>(EMPTY);

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModulesState>(EMPTY);

  const refresh = () => {
    // The viewer-scoped manifest decides which modules a member can even
    // SEE. Reading the wrong key made every member look anonymous here, so
    // members-lifecycle modules stayed invisible to the people they were for.
    const token = authToken();
    fetch("/api/modules", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.json())
      .then((d) => {
        setState({
          modules: Array.isArray(d.modules) ? d.modules : [],
          hypha: d.hypha ?? EMPTY.hypha,
          loaded: true,
          refresh,
        });
      })
      .catch(() => setState((s) => ({ ...s, loaded: true, refresh })));
  };

  useEffect(refresh, []);

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
