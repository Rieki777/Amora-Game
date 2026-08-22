/**
 * The admin surfaces for module config that shipped with no door.
 *
 * `module_settings.config` is a validated JSON document per module and the ONE
 * write route is `PUT /api/admin/modules/:id/config`. Several modules shipped
 * with config a founder is expected to own and no way to reach it: crowdpool's
 * linked campaigns (so the module could be enabled and the server would report
 * "no campaigns linked" with nothing a founder could do), and the forum and
 * tools category lists (validated on every write, read on every request, and
 * editable by nobody).
 *
 * TWO RULES HOLD EVERY PANEL HERE.
 *
 * 1. `setModuleConfig` REPLACES the whole document. It does not merge. So every
 *    save here re-reads the live config first and writes it back whole with one
 *    key changed. A bare partial write would drop `imageUrl` off a module's
 *    store card, and for forum and tools it would fail the module's own
 *    validator, which requires `categories` to be present.
 *
 * 2. The server's validator is the authority and its refusal is shown verbatim.
 *    These panels do light shaping (trim, drop blanks) and no second copy of
 *    the rules, because two validators are two answers waiting to disagree.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins, MessageSquare, Wrench } from "lucide-react";

const API_BASE = "/api";

/** Same shape Admin.tsx uses: the admin password rides as a bearer token. */
function authHeaders(password: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${password}`, ...extra };
}

/** Server refusals carry the sentence in `message` and the code in `error`. */
function refusalText(d: any, fallback: string): string {
  for (const value of [d?.message, d?.error]) {
    const text = value == null ? "" : String(value).trim();
    if (text) return text;
  }
  return fallback;
}

const inputCls =
  "border border-gray-200 rounded-lg px-2 py-1.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]";
const btnCls =
  "min-h-[44px] px-3 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#2D5A5A] disabled:opacity-40";
const saveCls =
  "min-h-[44px] px-4 text-sm rounded-lg bg-[#2D5A5A] text-white font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2D5A5A] disabled:opacity-40";

/**
 * Read the live config for one module, hand it to a caller, and write back the
 * WHOLE document with the caller's change folded in.
 *
 * Re-reading at save time rather than trusting what was loaded when the tab
 * opened: a founder who leaves this page open while another admin edits the
 * same module would otherwise write a config document back from memory and
 * silently undo them.
 */
function useModuleConfig(moduleId: string, password: string) {
  const [config, setConfig] = useState<any>(null);
  const [lifecycle, setLifecycle] = useState<string>("off");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/modules`, { headers: authHeaders(password) });
      const d = await res.json();
      const m = (d?.modules ?? []).find((x: any) => x.id === moduleId);
      setConfig(m?.config ?? null);
      setLifecycle(String(m?.served ?? m?.lifecycle ?? "off"));
    } catch {
      setConfig(null);
    }
    setLoading(false);
  }, [moduleId, password]);

  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Record<string, unknown>): Promise<boolean> => {
    let live: any = config ?? {};
    try {
      const res = await fetch(`${API_BASE}/admin/modules`, { headers: authHeaders(password) });
      const d = await res.json();
      live = (d?.modules ?? []).find((x: any) => x.id === moduleId)?.config ?? {};
    } catch { /* fall back to what this tab loaded */ }
    const res = await fetch(`${API_BASE}/admin/modules/${moduleId}/config`, {
      method: "PUT",
      headers: authHeaders(password, { "Content-Type": "application/json" }),
      body: JSON.stringify({ config: { ...live, ...patch } }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(refusalText(d, "That did not save")); return false; }
    setConfig(d.config ?? { ...live, ...patch });
    return true;
  };

  return { config, lifecycle, loading, save, reload: load };
}

/** The shared "this module is off" board, so an empty editor is never a mystery. */
function ModuleOff({ name }: { name: string }) {
  return (
    <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">
      The {name} module is off. Turn it on in the Module Library first, and this
      editor writes to the config it reads.
    </p>
  );
}

// ── Crowdpool: which campaigns this village has linked ───────────────────────

interface CampaignRow {
  slug: string;
  id: string;
  hubBaseUrl: string;
}

const toRows = (list: any): CampaignRow[] =>
  (Array.isArray(list) ? list : []).map((c: any) => ({
    slug: String(c?.slug ?? ""),
    id: c?.id === undefined || c?.id === null ? "" : String(c.id),
    hubBaseUrl: String(c?.hubBaseUrl ?? ""),
  }));

/**
 * Shape rows back into what the module's validator expects: a slug OR a
 * positive integer id, and an optional https hub override. Blank fields are
 * dropped rather than sent as empty strings, because `slug: ""` fails the
 * lowercase-slug test and would read as a typo the founder never made.
 */
const toRefs = (rows: CampaignRow[]) =>
  rows
    .filter((r) => r.slug.trim() || r.id.trim())
    .map((r) => {
      const ref: Record<string, unknown> = {};
      if (r.slug.trim()) ref.slug = r.slug.trim().toLowerCase();
      if (r.id.trim()) ref.id = Number(r.id.trim());
      if (r.hubBaseUrl.trim()) ref.hubBaseUrl = r.hubBaseUrl.trim();
      return ref;
    });

export function CrowdpoolAdminTab({ password }: { password: string }) {
  const { config, lifecycle, loading, save } = useModuleConfig("crowdpool", password);
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setRows(toRows(config?.villageCampaigns)); }, [config]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/crowdpool/status`, { headers: authHeaders(password) });
      setStatus(res.ok ? await res.json() : null);
    } catch { setStatus(null); }
  }, [password]);
  useEffect(() => { void loadStatus(); }, [loadStatus]);

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  const set = (i: number, patch: Partial<CampaignRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Coins className="w-5 h-5 text-[#2D5A5A]" /> Crowdpool
        </h2>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Which raisings on the hub belong to this village. Each one linked here
          gets a ring on /campaigns and a page at /campaign/its-slug. The numbers
          come from the hub every ten minutes; nothing is pledged or held here.
        </p>
      </div>

      {lifecycle === "off" && <ModuleOff name="Crowdpool" />}

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Linked campaigns</h3>
        <p className="text-xs text-gray-500 mb-3">
          A slug is the campaign's address on the hub and is what /campaign/:slug
          uses. A numeric hub id works too and is what the hub itself calls the
          campaign. One of the two is enough; both together are the surest match.
        </p>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid sm:grid-cols-12 gap-2 items-end border border-gray-100 rounded-lg p-3">
              <label className="text-xs text-gray-500 sm:col-span-4">
                Slug
                <input value={r.slug} onChange={(e) => set(i, { slug: e.target.value })}
                  placeholder="second-raising" className={`${inputCls} w-full mt-1`} />
              </label>
              <label className="text-xs text-gray-500 sm:col-span-2">
                Hub id
                <input value={r.id} onChange={(e) => set(i, { id: e.target.value })}
                  inputMode="numeric" placeholder="79" className={`${inputCls} w-full mt-1`} />
              </label>
              <label className="text-xs text-gray-500 sm:col-span-4">
                Hub address, if this one lives somewhere else
                <input value={r.hubBaseUrl} onChange={(e) => set(i, { hubBaseUrl: e.target.value })}
                  placeholder="https://hub.example" className={`${inputCls} w-full mt-1`} />
              </label>
              <div className="sm:col-span-2">
                <button type="button" className={`${btnCls} text-red-600 border-red-200 w-full`}
                  aria-label={`Unlink campaign ${r.slug || r.id || i + 1}`}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}>Unlink</button>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-gray-400">
              No campaigns linked. /campaigns shows its empty board until one is.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" className={btnCls}
            onClick={() => setRows([...rows, { slug: "", id: "", hubBaseUrl: "" }])}>Link a campaign</button>
          <button type="button" className={saveCls} disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await save({ villageCampaigns: toRefs(rows) });
              setSaving(false);
              if (ok) { toast.success("Linked campaigns saved"); void loadStatus(); }
            }}>{saving ? "Saving…" : "Save links"}</button>
        </div>
      </div>

      {/*
        What the hub actually answered. A linked slug the hub has never served
        is the one failure a founder cannot see from the config alone, so it is
        named here rather than left to the empty ring on /campaigns.
      */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-1">What the hub answered</h3>
        <p className="text-xs text-gray-500 mb-3">Hub: {status?.hubBaseUrl || "not set"}</p>
        {(status?.campaigns ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nothing synced yet. The sync runs every ten minutes.</p>
        )}
        <ul className="space-y-1">
          {(status?.campaigns ?? []).map((c: any) => (
            <li key={c.key} className="text-sm text-gray-700">
              <span className="font-medium">{c.key}</span>
              {c.title ? <span className="text-gray-500"> · {c.title}</span> : null}
              <span className="text-gray-400"> · {c.lastSyncAt ? `last read ${new Date(c.lastSyncAt).toLocaleString()}` : "never read"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Forum and tools: the category lists ──────────────────────────────────────

interface CategoryRow {
  id: string;
  label: string;
  sortOrder: number;
  /**
   * True for a row that was already saved when this editor loaded.
   *
   * The lock has to travel ON THE ROW rather than be recomputed from the
   * stored ids each render. Comparing a row's id against the stored set froze
   * a NEW row's id field the instant somebody typed a word that matched an
   * existing category, mid-keystroke, with a "threads already point at it"
   * note under a category that did not exist yet.
   */
  locked: boolean;
}

const toCategories = (list: any): CategoryRow[] =>
  (Array.isArray(list) ? list : []).map((c: any, i: number) => ({
    id: String(c?.id ?? ""),
    label: String(c?.label ?? ""),
    sortOrder: Number.isFinite(Number(c?.sortOrder)) ? Number(c.sortOrder) : i + 1,
    locked: true,
  }));

/**
 * The category editor both the forum and the tools hub were missing.
 *
 * Ids are the stored key on every thread and every tool, so an id is typed once
 * and then locked: renaming it in place would orphan every row that already
 * points at it, quietly, with no error anywhere. The label is what people read
 * and is free to change any time.
 */
export function CategoryListEditor({
  moduleId, moduleName, password, title, blurb, icon,
}: {
  moduleId: string;
  moduleName: string;
  password: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
}) {
  const { config, lifecycle, loading, save } = useModuleConfig(moduleId, password);
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setRows(toCategories(config?.categories)); }, [config]);

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  const set = (i: number, patch: Partial<CategoryRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">{icon} {title}</h3>
      <p className="text-xs text-gray-500 mb-3">{blurb}</p>
      {lifecycle === "off" && <div className="mb-3"><ModuleOff name={moduleName} /></div>}

      <div className="space-y-2">
        {rows.map((r, i) => {
          const locked = r.locked;
          return (
            <div key={i} className="grid sm:grid-cols-12 gap-2 items-end">
              <label className="text-xs text-gray-500 sm:col-span-4">
                Id
                <input value={r.id} disabled={locked}
                  onChange={(e) => set(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                  placeholder="village-life" className={`${inputCls} w-full mt-1 disabled:bg-gray-50 disabled:text-gray-500`} />
                {locked && <span className="block text-[11px] text-gray-400 mt-0.5">Fixed. Threads and tools already point at it.</span>}
              </label>
              <label className="text-xs text-gray-500 sm:col-span-5">
                What people read
                <input value={r.label} onChange={(e) => set(i, { label: e.target.value })}
                  className={`${inputCls} w-full mt-1`} />
              </label>
              <label className="text-xs text-gray-500 sm:col-span-1">
                Order
                <input type="number" value={r.sortOrder} onChange={(e) => set(i, { sortOrder: Number(e.target.value) })}
                  className={`${inputCls} w-full mt-1`} />
              </label>
              <div className="sm:col-span-2">
                <button type="button" className={`${btnCls} text-red-600 border-red-200 w-full`}
                  aria-label={`Remove category ${r.label || r.id}`}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" className={btnCls}
          onClick={() => setRows([...rows, { id: "", label: "", sortOrder: rows.length + 1, locked: false }])}>Add a category</button>
        <button type="button" className={saveCls} disabled={saving}
          onClick={async () => {
            setSaving(true);
            const ok = await save({
              categories: rows
                .filter((r) => r.id.trim() && r.label.trim())
                .map((r) => ({ id: r.id.trim(), label: r.label.trim(), sortOrder: Number(r.sortOrder) || 0 })),
            });
            setSaving(false);
            if (ok) toast.success("Categories saved");
          }}>{saving ? "Saving…" : "Save categories"}</button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        Removing a category leaves anything already filed under it pointing at a
        name nobody can pick again. Rename the label instead when what you want
        is different words for the same shelf.
      </p>
    </div>
  );
}

// ── Resources: where a spending approval lands, and who sees the measured flows ──

/**
 * Two keys read on every `/api/resources` request that no form could reach.
 *
 * `requestCategory` names the forum category a spending-approval request is
 * prefilled into. It is stored as a bare slug and cross-checked at USE time
 * rather than at write time: a category that no longer exists falls back to
 * whichever forum category happens to sort first, silently, so a typo routes
 * every approval request to the wrong shelf and nothing anywhere says so. The
 * picker offers the live list for that reason.
 *
 * `measuredVisibleTo` decides whether members see the measured inflows or only
 * admins do. It fails OPEN in the reader (anything that is not the literal
 * "admins" reads as "members"), which is the right default and the wrong thing
 * to leave un-editable.
 */
export function ResourcesRoutingEditor({ password }: { password: string }) {
  const { config, loading, save } = useModuleConfig("resources", password);
  const forum = useModuleConfig("forum", password);
  const [category, setCategory] = useState("");
  const [visibleTo, setVisibleTo] = useState("members");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCategory(String(config?.requestCategory ?? "governance"));
    setVisibleTo(config?.measuredVisibleTo === "admins" ? "admins" : "members");
  }, [config]);

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  const categories = toCategories(forum.config?.categories);
  const known = categories.some((c) => c.id === category);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <h3 className="font-semibold text-gray-900 mb-1">Where requests go, and who sees the flows</h3>
      <p className="text-xs text-gray-500 mb-3">
        Both of these are read every time somebody opens /resources. Neither had
        a control until now.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs text-gray-500">
          Forum category a spending request is filed under
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className={`${inputCls} w-full mt-1`}>
            {!known && <option value={category}>{category} (no forum category by that name)</option>}
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.id})</option>)}
          </select>
          {!known && (
            <span className="block text-[11px] text-amber-800 mt-1">
              Nothing on the forum answers to this name, so every approval request
              lands in whichever category sorts first. Pick one from the list.
            </span>
          )}
        </label>

        <fieldset className="text-xs text-gray-500 border-0 p-0 m-0">
          <legend>Who sees the measured inflows</legend>
          <div className="mt-1 space-y-1">
            {[["members", "Everyone signed in"], ["admins", "Admins only"]].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 min-h-[44px] text-sm text-gray-700">
                <input type="radio" name="measuredVisibleTo" value={value} checked={visibleTo === value}
                  onChange={() => setVisibleTo(value)} className="w-5 h-5 focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <button type="button" className={`${saveCls} mt-3`} disabled={saving}
        onClick={async () => {
          setSaving(true);
          const ok = await save({ requestCategory: category, measuredVisibleTo: visibleTo });
          setSaving(false);
          if (ok) toast.success("Saved. /resources reads it on the next request");
        }}>{saving ? "Saving…" : "Save routing"}</button>
    </div>
  );
}

export function ForumCategoriesEditor({ password }: { password: string }) {
  return (
    <CategoryListEditor
      moduleId="forum"
      moduleName="Forum"
      password={password}
      title="Forum categories"
      blurb="The shelves every thread is filed under. Read on every request, shown on /forum, and offered when somebody starts a thread."
      icon={<MessageSquare className="w-4 h-4 text-[#2D5A5A]" />}
    />
  );
}

export function ToolsCategoriesEditor({ password }: { password: string }) {
  return (
    <CategoryListEditor
      moduleId="tools"
      moduleName="Tools"
      password={password}
      title="Tool categories"
      blurb="How the tools hub groups what the village uses. A tool can only be filed under a category listed here."
      icon={<Wrench className="w-4 h-4 text-[#2D5A5A]" />}
    />
  );
}
