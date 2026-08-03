/**
 * The honest label on standing examples.
 *
 * A module that ships OFF has nothing in it, and "No items yet." teaches a
 * founder nothing about what the module is for. Standing examples fill that
 * void — but content presented without a label is content that gets mistaken
 * for real, so every page showing examples says so at the top.
 *
 * One banner per page rather than a chip per card, deliberately: the idea
 * needs explaining once, and twelve repetitions of the same badge is noise
 * that stops being read by the third card.
 */
import { useEffect, useState } from "react";
import { gameFetch } from "@/lib/gameApi";

interface ExamplesState {
  modules: string[];
  /** What clears each module's examples, in the reader's words. */
  triggers: Record<string, string>;
}

let cache: ExamplesState | null = null;
let inflight: Promise<ExamplesState> | null = null;
const EMPTY: ExamplesState = { modules: [], triggers: {} };

/** One fetch per page load, shared by every banner mounted from it. */
function fetchExampleModules(): Promise<ExamplesState> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    // Through gameFetch so the session token rides along: the endpoint hides
    // preview-lifecycle modules from anonymous callers, and an admin
    // previewing a module still needs the label on what they are looking at.
    inflight = gameFetch("/api/examples")
      .then((r) => (r.ok ? r.json() : EMPTY))
      .then((d) => {
        const next: ExamplesState = {
          modules: Array.isArray(d?.modules) ? d.modules.map(String) : [],
          triggers: d?.triggers && typeof d.triggers === "object" ? d.triggers : {},
        };
        cache = next;
        return next;
      })
      .catch((): ExamplesState => EMPTY)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Mounted banners, so a retirement can reach them without a page reload. */
const listeners = new Set<() => void>();

/**
 * Call after publishing something real in `moduleId`.
 *
 * Clearing the cache alone is not enough — a mounted banner holds its answer
 * in state and its effect only re-runs when moduleId changes, so the label
 * would survive on screen above the member's own brand-new content until they
 * happened to reload. That is the inverse of the honesty this feature exists
 * for: real content wearing an example label.
 *
 * The module is dropped OPTIMISTICALLY rather than re-fetched, because
 * retirement is fire-and-forget on the server (the publisher's response never
 * waits on housekeeping) and an immediate re-fetch races it. Optimism is safe
 * here precisely because retirement is one-way: a module that just received a
 * real item is never going to start showing examples again.
 */
export function forgetExamplesCache(moduleId?: string): void {
  if (moduleId && cache) {
    cache = { ...cache, modules: cache.modules.filter((m) => m !== moduleId) };
  } else {
    cache = null;
  }
  for (const notify of Array.from(listeners)) notify();
}

export function useShowingExamples(moduleId: string): boolean {
  return useExamplesState(moduleId).showing;
}

/** Every module showing examples, for surfaces that span modules. */
export function useExampleModules(): { modules: string[]; loaded: boolean } {
  const [state, setState] = useState<{ modules: string[]; loaded: boolean }>(() => ({
    modules: cache?.modules ?? [],
    loaded: !!cache,
  }));
  useEffect(() => {
    let alive = true;
    const sync = () => {
      void fetchExampleModules().then((next) => {
        if (alive) setState({ modules: next.modules, loaded: true });
      });
    };
    sync();
    listeners.add(sync);
    return () => { alive = false; listeners.delete(sync); };
  }, []);
  return state;
}

/** Showing state plus the module's own trigger line, from one shared fetch. */
export function useExamplesState(moduleId: string): { showing: boolean; trigger: string | null } {
  const [state, setState] = useState(() => ({
    showing: cache?.modules.includes(moduleId) ?? false,
    trigger: cache?.triggers[moduleId] ?? null,
  }));
  useEffect(() => {
    let alive = true;
    const sync = () => {
      // A cleared cache re-fetches; a module-scoped clear answers from it.
      void fetchExampleModules().then((next) => {
        if (alive) {
          setState({
            showing: next.modules.includes(moduleId),
            trigger: next.triggers[moduleId] ?? null,
          });
        }
      });
    };
    sync();
    listeners.add(sync);
    return () => { alive = false; listeners.delete(sync); };
  }, [moduleId]);
  return state;
}

export function ExamplesBanner({ moduleId, noun }: { moduleId: string; noun: string }) {
  const { showing, trigger } = useExamplesState(moduleId);
  if (!showing) return null;
  return (
    <div
      role="note"
      className="mb-6 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p className="font-medium">These are standing examples.</p>
      <p className="mt-1 leading-relaxed">
        Nobody here made them. They show what this module is for, and they cannot be
        borrowed, booked, bought or replied to.{" "}
        {/* The module's own words for what clears them. "Your first real
            listing" is true of the exchange and unhelpful, because a TOKEN is
            what actually retires it. The generic line stays as the fallback
            for a fork that has not written its own. */}
        {trigger ?? `Publishing your first real ${noun} clears them for good.`}
      </p>
    </div>
  );
}
