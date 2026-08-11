/**
 * The top of your own profile: who you are playing, before anything else.
 *
 * The character comes FIRST because it is the answer to "whose sheet is this".
 * A profile that opens with settings and mentions your characters two screens
 * down is a settings page wearing a character sheet's name. The primary
 * character's art is the hero, the rest of the party sits directly under it,
 * and switching who fronts the sheet is one tap from the top of the page.
 *
 * Medallion when there is no art, and never a broken image: the server returns
 * null for an avatar it does not have rather than a path that might 404, and
 * the img carries onError as well, because a file can go missing after the
 * server answered.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { authToken } from "@/lib/gameApi";
import { Star } from "lucide-react";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

interface Character {
  id: string;
  archetypeKey: string;
  avatar: string | null;
  isPrimary: boolean;
}

interface Archetype {
  key: string;
  name: string;
  subtitle: string;
}

export default function ProfileHero({ name, handle }: { name: string; handle?: string | null }) {
  const [party, setParty] = useState<Character[]>([]);
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [moons, setMoons] = useState<number | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const load = () => {
    fetch("/api/me/profile", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setParty(d.party ?? []);
        setTitle(d.title ?? null);
        setMoons(typeof d.moonsOnTheLand === "number" ? d.moonsOnTheLand : null);
      })
      .catch(() => {});
  };
  useEffect(load, []);
  useEffect(() => {
    fetch("/api/archetypes")
      .then((r) => (r.ok ? r.json() : []))
      .then(setArchetypes)
      .catch(() => {});
  }, []);

  const nameOf = (key: string) => archetypes.find((a) => a.key === key)?.name ?? key;
  const subtitleOf = (key: string) => archetypes.find((a) => a.key === key)?.subtitle ?? "";
  const initial = (key: string) => nameOf(key).replace(/^The\s+/i, "").slice(0, 1);

  const primary = party.find((c) => c.isPrimary) ?? party[0] ?? null;

  const front = async (id: string) => {
    const res = await fetch(`/api/me/characters/${id}/primary`, { method: "POST", headers: headers() });
    if (res.ok) {
      const d = await res.json().catch(() => null);
      if (d?.party) setParty(d.party);
      else load();
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        {/* The hero. Tall card, so a three-quarter body portrait reads as a
            character rather than as an avatar thumbnail. */}
        <div className="h-56 w-44 shrink-0 overflow-hidden rounded-2xl border border-teal-deep/20 bg-gradient-to-b from-teal-deep/10 to-amber/10 shadow-lg">
          {primary?.avatar && !broken[primary.id] ? (
            <img
              src={primary.avatar}
              alt={nameOf(primary.archetypeKey)}
              onError={() => setBroken((b) => ({ ...b, [primary.id]: true }))}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-amber/60 text-3xl font-semibold text-teal-deep">
                {primary ? initial(primary.archetypeKey) : name.slice(0, 1)}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-5xl font-display font-bold text-teal-deep mb-2">{name}</h1>
          {primary ? (
            <p className="text-lg font-medium text-sage">
              {nameOf(primary.archetypeKey)}
              {subtitleOf(primary.archetypeKey) ? ` · ${subtitleOf(primary.archetypeKey)}` : ""}
            </p>
          ) : (
            <p className="text-lg text-gray-600">
              No path chosen yet.{" "}
              <a href="/profile/characters" className="text-teal-deep underline">
                Choose who you will be
              </a>
            </p>
          )}
          {title ? <p className="mt-1 text-amber-700">{title}</p> : null}
          <p className="mt-2 text-gray-600">
            {handle ? `@${handle} · ` : ""}
            {moons === null ? "" : moons === 0 ? "New on the land" : `${moons} moons on the land`}
          </p>
        </div>
      </div>

      {/* The rest of the party, directly under the hero. Multi-class is the
          point, so every path a member walks is visible without scrolling. */}
      {party.length > 0 ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-3">
            {party.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => front(c.id)}
                title={`Front ${nameOf(c.archetypeKey)}`}
                className={`relative w-20 shrink-0 overflow-hidden rounded-xl border bg-white transition ${
                  c.isPrimary ? "border-teal-deep ring-2 ring-teal-deep/30" : "border-gray-200 hover:border-teal-deep/50"
                }`}
              >
                <span className="block aspect-[3/4] w-full bg-gray-50">
                  {c.avatar && !broken[c.id] ? (
                    <img
                      src={c.avatar}
                      alt={nameOf(c.archetypeKey)}
                      onError={() => setBroken((b) => ({ ...b, [c.id]: true }))}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-lg text-teal-deep">
                      {initial(c.archetypeKey)}
                    </span>
                  )}
                </span>
                {c.isPrimary ? (
                  <Star className="absolute left-1 top-1 h-4 w-4 fill-amber-400 text-amber-400" />
                ) : null}
              </button>
            ))}
            <a
              href="/profile/characters"
              className="flex min-h-11 items-center rounded-xl border border-dashed border-sage/50 px-4 py-3 text-sm font-semibold text-sage hover:bg-sage/5"
            >
              Add a path
            </a>
          </div>
          <p className="mt-2 text-sm text-gray-700">
            Tap a character to front your sheet. Play as many as you like.
          </p>
        </div>
      ) : null}
    </motion.div>
  );
}
