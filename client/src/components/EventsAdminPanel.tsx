import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ATTENDANCE_MODES, EVENT_STATUSES, type Gathering } from "@shared/gatherings";

/**
 * Admin, The Game, Gatherings: the village calendar's own surface.
 *
 * The module shipped API-only, which by this repo's own standard is half
 * built: a founder needed curl to put a harvest festival on the calendar.
 * This is the surface that makes it a feature.
 *
 * Self-contained like MapSkinPanel and LookPanel, for the same reason:
 * Admin.tsx is a large file other workstreams edit, so the mount is one line.
 *
 * Admin tabs in this app are NOT filtered by module lifecycle (the nav is a
 * flat list; the API 404s instead). So the off state is handled here, in
 * words, rather than by hiding the tab and leaving a founder wondering where
 * the calendar went.
 */

const EMPTY = {
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  locationText: "",
  structureKeys: "",
  capacity: "",
  status: "draft",
  attendanceMode: "offline",
  onlineUrl: "",
};
type Form = typeof EMPTY;

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in LOCAL time, not an ISO Z. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventsAdminPanel({ password }: { password: string }) {
  const [events, setEvents] = useState<Gathering[] | null>(null);
  const [moduleOff, setModuleOff] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openRsvps, setOpenRsvps] = useState<string | null>(null);
  const [rsvps, setRsvps] = useState<Record<string, any[]>>({});

  const auth = { Authorization: `Bearer ${password}` };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/events", { headers: auth });
      // 404 is the module gate, not a missing route. Say which.
      if (res.status === 404) { setModuleOff(true); setEvents([]); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setModuleOff(false);
      setEvents(data.events ?? []);
    } catch { toast.error("Could not load the calendar"); setEvents([]); }
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const body = () => {
    const keys = form.structureKeys.split(",").map((s) => s.trim()).filter(Boolean);
    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      // The picker gives local time; the server stores UTC. Converting here
      // keeps every other reader working in one timezone.
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : "",
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      locationText: form.locationText.trim() || null,
      structureKeys: keys,
      // Blank means uncapped. "" would be read as a number by a less careful
      // server, and 0 is a real cap meaning nobody.
      capacity: form.capacity === "" ? null : Number(form.capacity),
      status: form.status,
      attendanceMode: form.attendanceMode,
      onlineUrl: form.onlineUrl.trim() || null,
    };
  };

  const save = async () => {
    setSaving(true);
    try {
      const editingId = editing;
      const res = await fetch(
        editingId ? `/api/admin/events/${editingId}` : "/api/admin/events",
        {
          method: editingId ? "PUT" : "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify(body()),
        },
      );
      const data = await res.json().catch(() => ({}));
      // The server owns validation, so its message is the one worth showing.
      if (!res.ok) { toast.error(data?.error ?? "Save failed"); setSaving(false); return; }
      toast.success(editingId ? "Gathering updated" : "Gathering added");
      setForm(EMPTY); setEditing(null); load();
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  const edit = (g: Gathering) => {
    setEditing(g.id);
    setForm({
      title: g.title,
      description: g.description ?? "",
      startsAt: toLocalInput(g.startsAt),
      endsAt: toLocalInput(g.endsAt),
      locationText: g.locationText ?? "",
      structureKeys: g.structureKeys.join(", "),
      capacity: g.capacity === null ? "" : String(g.capacity),
      status: g.status,
      attendanceMode: g.attendanceMode,
      onlineUrl: g.onlineUrl ?? "",
    });
  };

  const setStatus = async (g: Gathering, status: string) => {
    const res = await fetch(`/api/admin/events/${g.id}`, {
      method: "PUT", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { toast.success(`Marked ${status}`); load(); } else toast.error("That did not work");
  };

  const remove = async (g: Gathering) => {
    if (!window.confirm(`Delete "${g.title}"? Answers to it go too.`)) return;
    const res = await fetch(`/api/admin/events/${g.id}`, { method: "DELETE", headers: auth });
    if (res.ok) { toast.success("Deleted"); load(); } else toast.error("That did not work");
  };

  const toggleRsvps = async (g: Gathering) => {
    if (openRsvps === g.id) { setOpenRsvps(null); return; }
    setOpenRsvps(g.id);
    if (rsvps[g.id]) return;
    const res = await fetch(`/api/admin/events/${g.id}/rsvps`, { headers: auth });
    if (res.ok) { const d = await res.json(); setRsvps((p) => ({ ...p, [g.id]: d.rsvps ?? [] })); }
  };

  const input = "w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2";
  const field = (label: string, key: keyof Form, type = "text", placeholder = "") => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor={`ev-${key}`}>{label}</label>
      <input id={`ev-${key}`} type={type} value={form[key]} placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={input} />
    </div>
  );

  if (events === null) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Gatherings</h2>
      <p className="text-sm text-gray-500 mb-5">
        The village calendar. Everything starts as a draft, so nothing reaches the
        calendar until you publish it.
      </p>

      {moduleOff && (
        <p className="mb-5 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          The Events module is off, so the calendar is not being served. Turn it on under
          Modules On/Off and this page starts working.
        </p>
      )}

      <div className="border border-gray-200 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">
          {editing ? "Edit gathering" : "Add a gathering"}
        </h3>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          {field("Title", "title", "text", "Harvest work party")}
          {field("Where (in words)", "locationText", "text", "The greenhouse")}
          {field("Starts", "startsAt", "datetime-local")}
          {field("Ends (optional)", "endsAt", "datetime-local")}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="ev-capacity">
              Capacity
            </label>
            <input id="ev-capacity" type="number" min={0} value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              placeholder="blank = no limit" className={input} />
            {/* The distinction the whole capacity path turns on. */}
            <p className="text-[11px] text-gray-400 mt-0.5">Blank means no limit. 0 means nobody.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="ev-keys">
              Map structures
            </label>
            <input id="ev-keys" value={form.structureKeys}
              onChange={(e) => setForm({ ...form, structureKeys: e.target.value })}
              placeholder="greenhouse, commons" className={input} />
            <p className="text-[11px] text-gray-400 mt-0.5">
              Comma separated. The map lights these buildings.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="ev-status">Status</label>
            <select id="ev-status" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className={`${input} bg-white`}>
              {EVENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="ev-mode">Attendance</label>
            <select id="ev-mode" value={form.attendanceMode}
              onChange={(e) => setForm({ ...form, attendanceMode: e.target.value })}
              className={`${input} bg-white`}>
              {ATTENDANCE_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {form.attendanceMode !== "offline" && field("Online link", "onlineUrl", "text", "https://")}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="ev-desc">Description</label>
          <textarea id="ev-desc" rows={3} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? "Saving..." : editing ? "Save changes" : "Add gathering"}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm(EMPTY); }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
          )}
        </div>
      </div>

      {events.length === 0 && !moduleOff && (
        <p className="text-sm text-gray-400 py-6 text-center">Nothing on the calendar yet.</p>
      )}

      <div className="space-y-3">
        {events.map((g) => (
          <div key={g.id} className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium text-gray-900">
                  {g.title}
                  <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded border align-middle ${
                    g.status === "scheduled" ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                    : g.status === "draft" ? "text-gray-600 bg-gray-50 border-gray-200"
                    : "text-amber-700 bg-amber-50 border-amber-100"}`}>{g.status}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {new Date(g.startsAt).toLocaleString()}
                  {g.locationText ? ` · ${g.locationText}` : ""}
                  {g.structureKeys.length ? ` · ${g.structureKeys.join(", ")}` : ""}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {g.capacity === null
                    ? `${g.goingCount} going, no limit`
                    : `${g.goingCount} of ${g.capacity} going`}
                  {g.spotsLeft === 0 ? " · full" : ""}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <button onClick={() => toggleRsvps(g)}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                  {openRsvps === g.id ? "Hide answers" : "Answers"}
                </button>
                <button onClick={() => edit(g)}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Edit</button>
                {g.status === "draft" && (
                  <button onClick={() => setStatus(g, "scheduled")}
                    className="px-2.5 py-1 text-xs bg-[#2D5A5A] text-white rounded-lg">Publish</button>
                )}
                {g.status === "scheduled" && (
                  <button onClick={() => setStatus(g, "cancelled")}
                    className="px-2.5 py-1 text-xs border border-amber-200 text-amber-800 rounded-lg">Cancel</button>
                )}
                <button onClick={() => remove(g)}
                  className="px-2.5 py-1 text-xs border border-red-200 text-red-700 rounded-lg">Delete</button>
              </div>
            </div>

            {openRsvps === g.id && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                {(rsvps[g.id] ?? []).length === 0 && (
                  <p className="text-xs text-gray-400">Nobody has answered yet.</p>
                )}
                <ul className="text-xs text-gray-600 space-y-1">
                  {(rsvps[g.id] ?? []).map((r) => (
                    <li key={r.userId} className="flex items-center justify-between gap-3">
                      {/* A deleted member's answer still counts toward the room,
                          so it stays listed with the tombstone spelled out. */}
                      <span>{r.name ?? "a member who has since left"}</span>
                      <span className="text-gray-400">{r.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
