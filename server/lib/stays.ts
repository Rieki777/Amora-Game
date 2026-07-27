/**
 * Stays v1 (S30-S31): accommodation paid in STAY CREDITS — a real platform
 * token, minted and burned through the same postTransfer discipline as
 * everything else. Stays owns ZERO ledger DDL:
 *
 *   buy/earn:  sys:mint  → mem:guest   (stay_purchase, stay_comp,
 *                                       quest_stay_reward, stay_manual_override)
 *   one night: mem:guest → sys:mint    (stay_night; allowNegative inside the
 *                                       grace window — debt is a visible
 *                                       negative balance, never a hidden tab)
 *
 * Outstanding credit supply = -balanceOf(sys:mint, 'stay-credit'), for free.
 *
 * Rate + audience are SNAPSHOT at activation: catch-up posting after a server
 * nap is deterministic, and a price edit mid-stay never silently re-rates a
 * guest (an admin re-rates explicitly, which re-snapshots).
 *
 * Stays are NEVER auto-ended: running out of credits stops the posting and
 * alerts humans; ending a stay is a human act about a human situation.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { MINT_FAUCET, memberAccount, postTransfer, registerToken, tokenDef } from "./ledger";
import { numberVar } from "./variables";

export const STAY_CREDIT = "stay-credit";

/**
 * Boot registration, unconditional (like the accounts the ledger is born
 * knowing): the token exists even while the module is off, so a quest's
 * stay-credit reward can post and simply wait for the module to open.
 * Re-asserted every boot — transferable:false is policy, not a default.
 */
export async function ensureStayToken(pool: Pool): Promise<void> {
  const existing = tokenDef(STAY_CREDIT);
  if (existing && existing.transferable === false) return;
  await registerToken(pool, {
    slug: STAY_CREDIT,
    name: "Stay Credits",
    kind: "credit",
    governance: "platform",
    transferable: false,
  });
}

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface AccommodationRow {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  photoUrl: string | null;
  active: boolean;
  sortOrder: number;
  /** Posted prices: { "stay-credit": {guest, member}, usd: {guest, member} } (minor units / whole credits). */
  prices: Record<string, { guest?: number; member?: number }>;
}

export interface StayRow {
  id: string;
  userId: string;
  accommodationId: string;
  status: "requested" | "active" | "ended" | "cancelled";
  arriveOn: string | null;
  autopay: boolean;
  rateSnapshotCredits: number | null;
  audienceSnapshot: "guest" | "member" | null;
  lastPostedOn: string | null;
  notes: string | null;
  createdAt: string;
}

const toIsoDate = (v: unknown): string | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

function rowToStay(r: RowDataPacket): StayRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    accommodationId: String(r.accommodation_id),
    status: r.status,
    arriveOn: toIsoDate(r.arrive_on),
    autopay: !!r.autopay,
    rateSnapshotCredits: r.rate_snapshot_credits == null ? null : Number(r.rate_snapshot_credits),
    audienceSnapshot: r.audience_snapshot ?? null,
    lastPostedOn: toIsoDate(r.last_posted_on),
    notes: r.notes ?? null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export async function listAccommodations(pool: Pool, opts?: { includeInactive?: boolean }): Promise<AccommodationRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, description, capacity, photo_url, active, sort_order FROM accommodations ${opts?.includeInactive ? "" : "WHERE active = 1 "}ORDER BY sort_order, name`,
  );
  const [prices] = await pool.query<RowDataPacket[]>(
    "SELECT accommodation_id, token_type, audience, amount_minor FROM accommodation_prices WHERE active = 1",
  );
  const byAcc = new Map<string, Record<string, { guest?: number; member?: number }>>();
  for (const p of prices) {
    const acc = byAcc.get(String(p.accommodation_id)) ?? {};
    const tok = acc[String(p.token_type)] ?? {};
    tok[p.audience as "guest" | "member"] = Number(p.amount_minor);
    acc[String(p.token_type)] = tok;
    byAcc.set(String(p.accommodation_id), acc);
  }
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: r.description ?? null,
    capacity: Number(r.capacity ?? 1),
    photoUrl: r.photo_url ?? null,
    active: !!r.active,
    sortOrder: Number(r.sort_order ?? 0),
    prices: byAcc.get(String(r.id)) ?? {},
  }));
}

/**
 * The posted price for one audience, with the member→guest fallback: a room
 * that posts no member row simply has one price for everyone.
 */
export async function priceFor(
  pool: Pool,
  accommodationId: string,
  tokenType: string,
  audience: "guest" | "member",
): Promise<number | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT audience, amount_minor FROM accommodation_prices WHERE accommodation_id = ? AND token_type = ? AND active = 1",
    [accommodationId, tokenType],
  );
  const byAud = new Map(rows.map((r) => [String(r.audience), Number(r.amount_minor)]));
  return byAud.get(audience) ?? byAud.get("guest") ?? null;
}

// ── Stays ────────────────────────────────────────────────────────────────────

export async function stayById(pool: Pool, id: string): Promise<StayRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM stays WHERE id = ?", [id]);
  return rows[0] ? rowToStay(rows[0]) : null;
}

export async function staysForUser(pool: Pool, userId: string): Promise<StayRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM stays WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );
  return rows.map(rowToStay);
}

export async function allStays(pool: Pool): Promise<StayRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM stays ORDER BY created_at DESC");
  return rows.map(rowToStay);
}

/** floor(balance / snapshot rate); the ONLY derived "nights left" there is. */
export function nightsRemaining(balance: number, rateCredits: number | null): number {
  if (!rateCredits || rateCredits <= 0) return 0;
  return Math.floor(balance / rateCredits);
}

// ── Nightly posting ──────────────────────────────────────────────────────────

/** UTC date arithmetic, no Date-timezone traps. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The nights this stay owes as of `todayUtc` (exclusive — tonight isn't over):
 * every date from the morning after arrival/activation through yesterday that
 * has not yet been posted. Deterministic from the row alone, so a server that
 * slept a week posts seven keyed legs and lands in exactly the same state.
 */
export function nightsOwed(stay: StayRow, todayUtc: string): string[] {
  if (stay.status !== "active" || !stay.rateSnapshotCredits) return [];
  const start = stay.lastPostedOn ? addDays(stay.lastPostedOn, 1) : (stay.arriveOn ?? stay.createdAt.slice(0, 10));
  const nights: string[] = [];
  for (let d = start; d < todayUtc; d = addDays(d, 1)) {
    nights.push(d);
    if (nights.length >= 366) break; // runaway guard: a year of catch-up means something else is wrong
  }
  return nights;
}

export interface PostNightsResult {
  posted: number;
  stopped: boolean;
  /** Balance after the last successful post. */
  balance: number;
}

/**
 * Post every owed night for one stay, each keyed `stay:{id}:night:{date}`.
 * Grace policy: a night may take the balance down to -(grace_nights × rate);
 * past that the posting STOPS (the stay stays active — ending it is a human
 * act) and the caller alerts humans.
 */
export async function postNightsForStay(pool: Pool, stay: StayRow, todayUtc: string): Promise<PostNightsResult> {
  const rate = stay.rateSnapshotCredits ?? 0;
  const owed = nightsOwed(stay, todayUtc);
  const graceFloor = -(Math.max(0, numberVar("stay.grace_nights")) * rate);
  const readBalance = async (): Promise<number> => {
    const [b] = await pool.query<RowDataPacket[]>(
      "SELECT balance FROM token_balances WHERE account_id = ? AND token_type = ?",
      [memberAccount(stay.userId), STAY_CREDIT],
    );
    return Number(b[0]?.balance ?? 0);
  };
  let posted = 0;
  let balance = await readBalance();
  for (const night of owed) {
    // Grace is checked BEFORE the post: a night may land the balance anywhere
    // down to -(grace_nights × rate), never past it.
    if (balance - rate < graceFloor) return { posted, stopped: true, balance };
    const result = await postTransfer(pool, {
      from: memberAccount(stay.userId),
      to: MINT_FAUCET,
      tokenType: STAY_CREDIT,
      amount: rate,
      source: "stay_night",
      sourceRef: stay.id,
      description: `Night of ${night}`,
      idempotencyKey: `stay:${stay.id}:night:${night}`,
      allowNegative: true,
    });
    if (!result.ok) return { posted, stopped: true, balance };
    // toBalance is the RECEIVING side (the faucet); re-read the payer.
    balance = await readBalance();
    if (!result.duplicate) posted += 1;
    await pool.query("UPDATE stays SET last_posted_on = ? WHERE id = ?", [night, stay.id]);
  }
  return { posted, stopped: false, balance };
}

/**
 * The scheduler job body + the admin catch-up button: sweep every active
 * autopay stay. Runs hourly; acts only once the UTC hour reaches
 * stay.autopay_post_hour (forced=true skips the hour check — that's the
 * admin button). Idempotent keys make overlapping runs harmless.
 */
export async function runNightlyPosting(
  pool: Pool,
  opts: {
    forced?: boolean;
    now?: Date;
    onLowBalance?: (stay: StayRow, nightsLeft: number) => Promise<void>;
    onStopped?: (stay: StayRow, balance: number) => Promise<void>;
  } = {},
): Promise<{ swept: number; posted: number; stopped: number }> {
  const now = opts.now ?? new Date();
  if (!opts.forced && now.getUTCHours() < Math.max(0, Math.min(23, numberVar("stay.autopay_post_hour")))) {
    return { swept: 0, posted: 0, stopped: 0 };
  }
  const todayUtc = now.toISOString().slice(0, 10);
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM stays WHERE status = 'active' AND autopay = 1",
  );
  let posted = 0;
  let stopped = 0;
  for (const row of rows.map(rowToStay)) {
    const r = await postNightsForStay(pool, row, todayUtc);
    posted += r.posted;
    if (r.stopped) {
      stopped += 1;
      if (opts.onStopped) await opts.onStopped(row, r.balance);
    } else if (r.posted > 0 && opts.onLowBalance) {
      const left = nightsRemaining(r.balance, row.rateSnapshotCredits);
      if (left <= numberVar("stay.low_balance_warn_nights")) await opts.onLowBalance(row, left);
    }
  }
  return { swept: rows.length, posted, stopped };
}

// ── Credit movements (all through the ledger, all keyed) ────────────────────

export async function mintStayCredits(
  pool: Pool,
  input: { userId: string; amount: number; source: string; sourceRef?: string; description?: string; idempotencyKey: string },
) {
  return postTransfer(pool, {
    from: MINT_FAUCET,
    to: memberAccount(input.userId),
    tokenType: STAY_CREDIT,
    amount: input.amount,
    source: input.source,
    sourceRef: input.sourceRef,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
  });
}

/** Open economic state that blocks disabling the module (invariant #13). */
export async function staysOpenState(pool: Pool): Promise<{ count: number; description: string }> {
  const [[s]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM stays WHERE status IN ('requested','active')",
  );
  const [[p]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM stay_purchases WHERE status IN ('pending','disputed')",
  );
  const stays = Number(s.n);
  const purchases = Number(p.n);
  return {
    count: stays + purchases,
    description: `${stays} requested/active stay(s), ${purchases} pending/disputed purchase(s)`,
  };
}
