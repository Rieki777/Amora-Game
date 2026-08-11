/**
 * Somebody else's character sheet, at /profile/:handle.
 *
 * A separate page from the owner's `/profile` on purpose. The two answer
 * different questions and share a URL shape, not a component: mixing them
 * means one file deciding on every render which of two audiences it is talking
 * to, and that decision is exactly where a privacy leak hides. The server
 * already filtered; this page renders what arrived and asks no questions about
 * what did not.
 *
 * So every section here is conditional on the FIELD BEING PRESENT, never on a
 * flag. An absent field means the server withheld it, and the page has nothing
 * to say about why.
 */
import Layout from "@/components/Layout";
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { authToken } from "@/lib/gameApi";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

interface Party {
  id: string;
  archetypeKey: string;
  avatar: string | null;
  isPrimary: boolean;
}

interface PublicSheet {
  handle: string | null;
  name: string;
  title: string | null;
  moonsOnTheLand: number;
  homeStructureKey?: string | null;
  standing?: Array<{ token: string; name: string; balance: number; decimals: number }>;
  gratitude?: { receivedThisSeason: number; givenThisSeason: number; lifetime: number };
  party?: Party[];
}

/** Minor units to the number a member reads. */
const show = (balance: number, decimals: number): string =>
  decimals > 0 ? (balance / 10 ** decimals).toFixed(decimals).replace(/\.?0+$/, "") : String(balance);

export default function PublicProfile() {
  const [, params] = useRoute("/profile/:handle");
  const [sheet, setSheet] = useState<PublicSheet | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!params?.handle) return;
    setSheet(null);
    setMissing(false);
    fetch(`/api/profiles/${encodeURIComponent(params.handle)}`, { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d ? setSheet(d) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [params?.handle]);

  if (missing) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold text-teal-deep">Nobody here by that name</h1>
        </div>
      </Layout>
    );
  }
  if (!sheet) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-gray-700">Looking.</div>
      </Layout>
    );
  }

  const hero = sheet.party?.find((c) => c.isPrimary) ?? sheet.party?.[0] ?? null;

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
          <div className="h-40 w-32 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
            {hero?.avatar ? (
              <img src={hero.avatar} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-sage/60 text-2xl text-teal-deep">
                  {sheet.name.slice(0, 1)}
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-3xl font-semibold text-teal-deep">{sheet.name}</h1>
            {sheet.title ? <p className="mt-1 text-sage">{sheet.title}</p> : null}
            <p className="mt-2 text-sm text-gray-700">
              {sheet.moonsOnTheLand === 0
                ? "New on the land"
                : `${sheet.moonsOnTheLand} moons on the land`}
            </p>
            {sheet.homeStructureKey ? (
              <p className="mt-1 text-sm text-gray-700">Hearths at {sheet.homeStructureKey}</p>
            ) : null}
          </div>
        </header>

        {sheet.party && sheet.party.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-sage">Paths they walk</h2>
            <ul className="mt-3 flex flex-wrap gap-3">
              {sheet.party.map((c) => (
                <li
                  key={c.id}
                  className="w-24 overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                >
                  <div className="aspect-[3/4] w-full">
                    {c.avatar ? (
                      <img src={c.avatar} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Present only when the member chose to show it. Absent is not empty:
            the page says nothing rather than saying they have nothing. */}
        {sheet.standing ? (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-sage">Standing</h2>
            {sheet.standing.length === 0 ? (
              <p className="mt-2 text-sm text-gray-700">New on the land.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {sheet.standing.map((s) => (
                  <li
                    key={s.token}
                    className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-teal-deep"
                  >
                    {show(s.balance, s.decimals)} {s.name}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {sheet.gratitude ? (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-sage">Gratitude</h2>
            <p className="mt-2 text-gray-800">
              {sheet.gratitude.receivedThisSeason === 0
                ? "No thanks yet this season."
                : `Thanked by ${sheet.gratitude.receivedThisSeason} members this season.`}
            </p>
            {/* Given sits beside received, never beneath it. Generosity is a
                status axis here and not only accumulation. */}
            <p className="mt-1 text-gray-800">
              {sheet.gratitude.givenThisSeason === 0
                ? "Has not thanked anyone yet this season."
                : `Thanked ${sheet.gratitude.givenThisSeason} members in return.`}
            </p>
          </section>
        ) : null}
      </div>
    </Layout>
  );
}
