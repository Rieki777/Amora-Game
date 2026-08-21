import { useEffect, useRef, useState } from "react";
import {
  addHamlet,
  INITIAL_PHASE,
  isNoOp,
  labelFieldValue,
  labelPatch,
  loadSettled,
  loadStarted,
  showsPlaceholder,
  showsRefreshing,
  sourcePatch,
  takenFieldValue,
  takenPatch,
  totalFieldValue,
  totalPatch,
  type FounderRow,
  type HousingPatch,
  type PatchResult,
} from "@/lib/housingForm";

/**
 * Housing availability (0077): the Admin half of Rye's two founder surfaces.
 *
 * Builder mode on the map is the other half, and BOTH write the same table
 * through the same route, so the reservation system has one source of truth.
 * Nothing here computes a number the map could disagree with: `open` is
 * derived server-side and shown read-only.
 *
 * Self-contained like EventsAdminPanel and MapSkinPanel, for the same reason:
 * Admin.tsx is a large file other workstreams edit, so the mount is one line.
 * It also puts this surface in a file a test can read as text, which is what
 * client/src/lib/housingForm.test.ts does.
 *
 * UNSET IS AN EMPTY FIELD, NOT A ZERO. Clearing a box sends null and the
 * hamlet goes back to being an example everywhere it is shown. Typing 0 means
 * zero homes and is a real answer. Those two states look similar in a form
 * and mean opposite things, which is why the row says which one it is in
 * words.
 *
 * ── EVERY CONTROL SENDS ONE FIELD, AND ONLY WHEN IT CHANGED ──────────────
 * Each control here sends the single field it owns. It used to restate all
 * four on every save, and that was two defects at once. The counts it
 * restated were read from `taken`, the EFFECTIVE count, so renaming a hamlet
 * counted by reservations wrote the live count over the founder's typed
 * number. And the authority it restated was whatever this tab had loaded, so
 * a rename here reverted a flip made in builder mode a minute earlier:
 * whole-row last-write-wins, from a form nobody thought of as a writer of the
 * other three fields.
 *
 * A control that sends one field cannot revert a field it never mentions.
 * What is left is last-write-wins per FIELD, which is two founders typing
 * into the same box within a few seconds of each other.
 *
 * Which field a box reads and what each control sends lives in
 * `@/lib/housingForm`, where a test can hold it, because no gate in this repo
 * can see inside a React component. This file holds markup and state.
 *
 * ── THE LIST DOES NOT UNMOUNT WHEN YOU SAVE ──────────────────────────────
 * `load()` used to raise the loading flag on every refresh, and every field
 * edit saves and refreshes. So the whole list was replaced by the word
 * Loading in the middle of an interaction: focus went with it, tabbing from a
 * hamlet's name to its total was impossible, and the per-row Saving indicator
 * lived inside the row that had just unmounted and could never be seen.
 *
 * The placeholder now belongs to the first load and to no other, and that is
 * held by `ListPhase` in @/lib/housingForm rather than by two booleans set by
 * hand here. `loadStarted` carries `started` forward, so no refresh can raise
 * the placeholder however it is called. The first guard on this was a text
 * check for `setLoading(true)`, a string this file cannot contain; it passed
 * on a faithful revert. Do not set phase from a literal object here: the
 * transitions are functions so that a test can run them.
 *
 * The boxes are uncontrolled, which is what keeps a half-typed value through
 * a refresh that lands mid-edit. The cost is that a name changed in builder
 * mode while this tab is open does not appear in the box until the tab is
 * reopened. The row's heading, badge and counts DO update, and no write is
 * made from what the box holds unless a founder edits it, so a stale box
 * cannot become a stale write.
 */

interface ReservationRow {
  id: string;
  structureKey: string | null;
  homeType: string;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  arrivedFrom: string | null;
  status: string;
  createdAt: string;
}

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "reserved", label: "Reserved" },
  { value: "withdrawn", label: "Withdrawn" },
];

const FIELD_CLASS = "w-full px-3 py-2 border border-stone-200 rounded-lg text-sm";

/** MySQL hands back a datetime string; an unparseable one shows nothing. */
function askedOn(raw: string): string {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export default function HousingAdminPanel({ password }: { password: string }) {
  const [rows, setRows] = useState<FounderRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  /*
   * One value, and the transitions are in @/lib/housingForm where a test can
   * run them. Two booleans set by hand here is what let a refresh raise the
   * first-load placeholder and unmount the list mid-edit.
   */
  const [phase, setPhase] = useState(INITIAL_PHASE);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [newKey, setNewKey] = useState("");
  /*
   * Saving was invisible for a second reason once the list stopped
   * unmounting: a save against a warm connection finishes faster than a
   * person can look at it. This holds the row for a moment afterwards so a
   * founder sees that what they typed was written. Cleared on unmount, so it
   * cannot set state on a component that has gone.
   */
  const [saved, setSaved] = useState("");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  /*
   * Every path below is written out in full, and that is load-bearing rather
   * than a style choice. scripts/check-auth-fetch.mjs reads the client with
   * the TypeScript compiler and matches each fetch URL against the routes
   * that answer a stranger with 401. It resolves a plain string; it does not
   * resolve `${API_BASE}/housing/availability`, so while this surface lived
   * in Admin.tsx behind that constant, dropping the token from any of these
   * four calls left the guard reporting clean. Measured both ways: with the
   * constant the break was invisible, spelled out the same break names all
   * four lines. Do not fold these back into a base-path constant.
   */
  const auth = { Authorization: `Bearer ${password}` };

  const load = async () => {
    setPhase(loadStarted);
    try {
      const [a, r] = await Promise.all([
        fetch("/api/housing/availability", { headers: auth }),
        fetch("/api/housing/reservations", { headers: auth }),
      ]);
      if (a.ok) setRows((await a.json()).rows ?? []);
      if (r.ok) setReservations((await r.json()).rows ?? []);
    } finally {
      setPhase(loadSettled);
    }
  };

  useEffect(() => {
    void load();
  }, [password]);

  const save = async (structureKey: string, patch: HousingPatch) => {
    setBusy(structureKey);
    setError("");
    try {
      const res = await fetch(`/api/housing/availability/${encodeURIComponent(structureKey)}`, {
        method: "PUT",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(`${structureKey}: ${data?.error || "That did not save."}`);
        return;
      }
      setSaved(structureKey);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(""), 2500);
      await load();
    } finally {
      setBusy("");
    }
  };

  /**
   * One route for every control: build the patch, refuse a bad value in
   * words, and stay silent when nothing changed. A founder tabbing across a
   * row they only wanted to read sends nothing at all.
   */
  const edit = (row: FounderRow, build: () => PatchResult) => {
    const result = build();
    if (!result.ok) {
      setError(`${row.structureKey}: ${result.message}`);
      return;
    }
    if (isNoOp(row, result.patch)) return;
    void save(row.structureKey, result.patch);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-stone-800">Housing Availability</h2>
        <p className="text-sm text-stone-500 mt-1">
          How many homes each hamlet has, and how many are spoken for. Builder mode on the map
          writes the same numbers. Leave a box empty to mark it unset, and every surface showing
          that hamlet will call its numbers an example.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="Structure key from the map, e.g. ridgeA"
          className={`flex-1 ${FIELD_CLASS}`}
        />
        <button
          onClick={() => {
            const result = addHamlet(rows, newKey);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setNewKey("");
            setError("");
            void save(result.structureKey, result.patch);
          }}
          className="px-4 py-2 bg-stone-800 text-white rounded-lg text-sm"
        >
          Add hamlet
        </button>
      </div>

      {showsPlaceholder(phase) ? (
        <p className="text-sm text-stone-500">Loading.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-500">
          No hamlets yet. Add one with its structure key from the map.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
              /*
               * The server decides what SET means, once, in publicEntries, and
               * carries the answer on the row. Read it. Never re-derive set-ness
               * here, and never ask `open`.
               *
               * This line used to compare `open` to null, and the comment that sat
               * here claimed that was the same predicate publicEntries applies. It
               * was not: `open` comes off the EFFECTIVE taken, so a hamlet flipped
               * to `reservations` with a homes_taken nobody had typed showed the
               * founder a green badge reading `9 open of 9` beside an EMPTY taken
               * box, while a visitor was told `Example numbers. The founder has not
               * set this hamlet yet.` Both surfaces photographed at once, 2026-08-16.
               *
               * 1349 green tests never saw it, and the fix then shipped to main with
               * no gate either: putting the one line back left 1491 tests green.
               * Nothing in this repo renders a component, so housingForm.test.ts is
               * the only thing standing between this line and production.
               */
            const isSet = r.isSet;
            return (
              <div key={r.structureKey} className="p-4 border border-stone-200 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium text-stone-800">{r.label || r.structureKey}</span>
                    <span className="ml-2 text-xs text-stone-400">{r.structureKey}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${isSet ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    {isSet ? `${r.open} open of ${r.total}` : "Unset, shows as an example"}
                  </span>
                </div>
                <div className="grid sm:grid-cols-4 gap-3 items-end">
                  <label className="block">
                    <span className="block text-xs text-stone-500 mb-1">Name</span>
                    <input
                      defaultValue={labelFieldValue(r)}
                      onBlur={(e) => edit(r, () => labelPatch(e.target.value))}
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-stone-500 mb-1">Homes total</span>
                    <input
                      type="number"
                      min={0}
                      defaultValue={totalFieldValue(r)}
                      onBlur={(e) => edit(r, () => totalPatch(e.target.value))}
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-stone-500 mb-1">
                      Homes taken, the number you type
                    </span>
                    {/*
                      Bound to the founder's typed number through
                      takenFieldValue, and EDITABLE even while reservations
                      are authoritative. This box was disabled then, which
                      left no way to correct a stored number the live count
                      had grown past, and a row whose stored taken sat above
                      its total could not be saved at all. The number keeps
                      its own meaning while the live count is the one on show,
                      and it is what comes back the moment a founder flips the
                      row.
                    */}
                    <input
                      type="number"
                      min={0}
                      defaultValue={takenFieldValue(r)}
                      onBlur={(e) => edit(r, () => takenPatch(e.target.value))}
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-stone-500 mb-1">Taken counted by</span>
                    <select
                      value={r.takenSource}
                      onChange={(e) => edit(r, () => sourcePatch(e.target.value))}
                      className={FIELD_CLASS}
                    >
                      <option value="founder">The number I type</option>
                      <option value="reservations">Reservations ({r.reservedCount})</option>
                    </select>
                  </label>
                </div>
                {/*
                  Under the grid, not inside the homes-taken cell. While it
                  lived in that cell it made one of four grid children two
                  lines taller, and `items-end` then pushed Name and Homes
                  total down to the bottom of the row while the taken box sat
                  level with the label above it. The boxes read as misaligned
                  on exactly the rows that need the most care.
                */}
                {r.takenSource === "reservations" && (
                  <p className="text-xs text-stone-400 mt-2">
                    Reservations count {r.reservedCount} right now, and that is the number every
                    visitor sees. Yours comes back if you switch this hamlet over.
                  </p>
                )}
                {busy === r.structureKey ? (
                  <p className="text-xs text-stone-400 mt-2">Saving.</p>
                ) : saved === r.structureKey ? (
                  <p className="text-xs text-emerald-600 mt-2">Saved.</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold text-stone-800 mb-1">Reservation requests</h3>
        <p className="text-sm text-stone-500 mb-3">
          People who asked for a home. Marking one Reserved counts it against its hamlet, and
          only for hamlets counted by reservations.
        </p>
        {showsPlaceholder(phase) ? (
          <p className="text-sm text-stone-500">Loading.</p>
        ) : reservations.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing yet.</p>
        ) : (
          <div className="space-y-2">
            {reservations.map((res) => (
              <div key={res.id} className="p-3 border border-stone-200 rounded-lg text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium text-stone-800">{res.name}</span>
                    {/*
                      Everything the form collects is shown here. The phone
                      number and the notes box were stored, carried over the
                      wire and rendered NOWHERE, so a person could write two
                      thousand characters about how they want to live here
                      into a field no founder could read, and hand over a
                      phone number for nothing.
                    */}
                    <a href={`mailto:${res.email}`} className="text-stone-500 ml-2 underline">
                      {res.email}
                    </a>
                    {res.phone && (
                      <a href={`tel:${res.phone}`} className="text-stone-500 ml-2 underline">
                        {res.phone}
                      </a>
                    )}
                    <div className="text-xs text-stone-500 mt-0.5">
                      {res.homeType}
                      {res.structureKey ? ` in ${res.structureKey}` : " with no hamlet chosen"}
                      {res.arrivedFrom === "map" ? ", from the map" : ""}
                      {askedOn(res.createdAt) ? `, ${askedOn(res.createdAt)}` : ""}
                    </div>
                  </div>
                  <select
                    value={res.status}
                    onChange={async (e) => {
                      // Marking one Reserved takes a home off the map for
                      // every visitor, so a refusal has to be visible. The
                      // select snaps back on the reload either way, and
                      // without the message that snap-back looks like the
                      // dropdown ignoring the founder.
                      setError("");
                      const r = await fetch(`/api/housing/reservations/${res.id}/status`, {
                        method: "PUT",
                        headers: { ...auth, "Content-Type": "application/json" },
                        body: JSON.stringify({ status: e.target.value }),
                      });
                      if (!r.ok) {
                        const data = await r.json().catch(() => ({}));
                        setError(`${res.name}: ${data?.error || "That status did not save."}`);
                      }
                      void load();
                    }}
                    className="px-2 py-1 border border-stone-200 rounded text-xs shrink-0"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                {res.notes && (
                  <p className="text-xs text-stone-600 mt-2 whitespace-pre-wrap border-t border-stone-100 pt-2">
                    {res.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showsRefreshing(phase) && <p className="text-xs text-stone-400">Refreshing.</p>}
    </div>
  );
}
