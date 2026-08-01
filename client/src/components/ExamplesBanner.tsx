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

let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

/** One fetch per page load, shared by every banner mounted from it. */
function fetchExampleModules(): Promise<string[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/examples")
      .then((r) => (r.ok ? r.json() : { modules: [] }))
      .then((d) => {
        const mods: string[] = Array.isArray(d?.modules) ? d.modules.map(String) : [];
        cache = mods;
        return mods;
      })
      .catch((): string[] => [])
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Call after publishing something real, so the banner leaves with the examples. */
export function forgetExamplesCache(): void {
  cache = null;
}

export function useShowingExamples(moduleId: string): boolean {
  const [showing, setShowing] = useState(() => cache?.includes(moduleId) ?? false);
  useEffect(() => {
    let alive = true;
    void fetchExampleModules().then((mods) => {
      if (alive) setShowing(mods.includes(moduleId));
    });
    return () => { alive = false; };
  }, [moduleId]);
  return showing;
}

export function ExamplesBanner({ moduleId, noun }: { moduleId: string; noun: string }) {
  const showing = useShowingExamples(moduleId);
  if (!showing) return null;
  return (
    <div
      role="note"
      className="mb-6 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p className="font-medium">These are standing examples.</p>
      <p className="mt-1 leading-relaxed">
        Nobody here made them. They show what this module is for, and they cannot be
        borrowed, booked, bought or replied to. Publishing your first real{" "}
        {noun} clears them for good.
      </p>
    </div>
  );
}
