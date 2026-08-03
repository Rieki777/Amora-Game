/**
 * SwapCard (S60): trade one village token for another at the posted prices.
 *
 * The shape of this component IS the safety argument. A swap is final — the
 * village cannot undo one — so the member reads the whole trade before they
 * can confirm it: what leaves, what arrives, what the village keeps, and the
 * sentence saying it cannot be reversed. Quoting and confirming are two
 * deliberate steps, and changing any input throws the quote away rather than
 * letting a stale one be confirmed.
 *
 * Nothing here is a market. There is no order book, no counterparty, no
 * price discovery: the village posts prices, the treasury is the only other
 * side, and this card just does the arithmetic out loud.
 */
import { useEffect, useState } from "react";
import { authToken } from "@/lib/gameApi";
import { ArrowDown, History, Loader2, Repeat, ShieldAlert } from "lucide-react";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

const usd = (minor: number) => `$${(Number(minor || 0) / 100).toFixed(2)}`;
/** randomUUID needs a secure context and a recent browser; neither is worth a crash. */
const newKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export type SwapPair = {
  payToken: string;
  payTokenName: string;
  receiveToken: string;
  receiveTokenName: string;
  yourBalance: number;
};

/** A refusal the member can act on, rather than a status code. */
function refusalText(code: string, body: any): string {
  switch (code) {
    case "RECENT_PURCHASE_HOLD":
      return `${body.error}${body.clearsAt ? ` They come free on ${day(body.clearsAt)}.` : ""}`;
    case "TOKEN_CAP":
    case "MEMBER_CAP":
      return `${body.error}${typeof body.remaining === "number" ? ` (${body.remaining} left this lunation)` : ""}`;
    case "IN_FLIGHT":
    case "KEY_REUSED":
    case "LEDGER_REFUSED":
    case "OUT_OF_STOCK":
    case "INSUFFICIENT":
    case "HALTED":
    case "FIREWALL":
    case "DUST":
    case "NO_PRICE":
      return body.error;
    case "TRADING_DISABLED":
      return body.error ?? "Swapping is not open in this village.";
    default:
      return body?.error ?? "That did not go through.";
  }
}

export default function SwapCard({ pairs, onDone }: { pairs: SwapPair[]; onDone: () => void }) {
  const payTokens = Array.from(new Map(pairs.map((p) => [p.payToken, p])).values());
  const [payToken, setPayToken] = useState(payTokens[0]?.payToken ?? "");
  const options = pairs.filter((p) => p.payToken === payToken);
  const [receiveToken, setReceiveToken] = useState(options[0]?.receiveToken ?? "");
  const [want, setWant] = useState(1);
  const [quote, setQuote] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  // One key per intent: a double tap reuses it and gets the same receipt
  // back, while a genuinely new trade gets a fresh one.
  const [clientKey, setClientKey] = useState(() => newKey());

  // Any change to the trade invalidates the quote. The confirm button is only
  // ever attached to numbers the member is currently looking at — and the key
  // rotates with it, so one code never spans two different trades while a
  // double tap on an unchanged one still dedupes.
  useEffect(() => {
    setQuote(null);
    setError("");
    setReceipt(null);
    setClientKey(newKey());
  }, [payToken, receiveToken, want]);

  useEffect(() => {
    if (!options.some((o) => o.receiveToken === receiveToken)) setReceiveToken(options[0]?.receiveToken ?? "");
  }, [payToken]);

  useEffect(() => {
    if (!showHistory || !payToken || !receiveToken) return;
    setHistory(null);
    fetch(`/api/exchange/rates/history?pair=${encodeURIComponent(payToken)}:${encodeURIComponent(receiveToken)}`, { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setHistory)
      .catch(() => {});
  }, [showHistory, payToken, receiveToken]);

  if (pairs.length === 0) return null;
  const balance = options[0]?.yourBalance ?? payTokens.find((p) => p.payToken === payToken)?.yourBalance ?? 0;
  const payName = payTokens.find((p) => p.payToken === payToken)?.payTokenName ?? payToken;

  const post = (route: string, body: any) =>
    fetch(route, { method: "POST", headers: headers(), body: JSON.stringify(body) }).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(refusalText(d?.code, d)), { code: d?.code, body: d });
      return d;
    });

  const getQuote = () => {
    setBusy(true);
    setError("");
    post("/api/exchange/swap/quote", { payToken, receiveToken, receiveQuantity: want })
      .then(setQuote)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  };

  const confirm = () => {
    if (!quote) return;
    setBusy(true);
    setError("");
    post("/api/exchange/swap", {
      payToken, receiveToken, receiveQuantity: want,
      expectPayQuantity: quote.payQuantity,
      payPriceRowId: quote.payPriceRowId,
      receivePriceRowId: quote.receivePriceRowId,
      clientKey,
    })
      .then((d) => {
        setReceipt(d);
        setQuote(null);
        setClientKey(newKey());
        onDone();
      })
      .catch((e) => {
        // A moved price is not an error the member caused: show them the
        // trade as it stands now and let them decide again.
        if (e.code === "QUOTE_STALE" && e.body?.quote) {
          setQuote(e.body.quote);
          setError("The price moved while you were deciding. This is the trade as it stands now.");
        } else {
          setError(e.message);
        }
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Repeat className="w-4 h-4 text-teal-deep" />
        <p className="font-semibold text-foreground text-sm">Swap tokens</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Trade one village token for another at the posted prices. The village
        treasury is the only other side, and swaps are final.
      </p>

      {receipt && (
        <p role="status" className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-4 py-2.5 mb-4">
          {receipt.replay ? "Already done" : "Swapped"}. Receipt #{receipt.receiptNo}: {receipt.payQuantity}{" "}
          {payTokens.find((p) => p.payToken === receipt.payToken)?.payTokenName ?? receipt.payToken} for{" "}
          {receipt.receiveQuantity} {options.find((o) => o.receiveToken === receipt.receiveToken)?.receiveTokenName ?? receipt.receiveToken}.
        </p>
      )}
      {/* The stale-quote refusal lands here and changes the price the member
          is about to accept — announcing it is the difference between an
          informed confirm and a surprise. */}
      {error && <p role="alert" className="text-sm text-amber-800 bg-amber-50 rounded-lg px-4 py-2.5 mb-4">{error}</p>}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">You hand over</label>
          <select
            value={payToken}
            onChange={(e) => setPayToken(e.target.value)}
            className="w-full text-base border border-border rounded-lg px-3 py-2.5 bg-background"
          >
            {payTokens.map((p) => (
              <option key={p.payToken} value={p.payToken}>
                {p.payTokenName}, you hold {p.yourBalance}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-center">
          <ArrowDown className="w-4 h-4 text-muted-foreground" />
        </div>

        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">You receive</label>
            <select
              value={receiveToken}
              onChange={(e) => setReceiveToken(e.target.value)}
              className="w-full text-base border border-border rounded-lg px-3 py-2.5 bg-background"
            >
              {options.map((o) => (
                <option key={o.receiveToken} value={o.receiveToken}>{o.receiveTokenName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">How many</label>
            <input
              type="number" min={1} inputMode="numeric" value={want}
              onChange={(e) => setWant(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="w-full text-base border border-border rounded-lg px-3 py-2.5 bg-background"
            />
          </div>
        </div>

        {!quote && (
          <button
            onClick={getQuote}
            disabled={busy || !payToken || !receiveToken}
            className="w-full inline-flex items-center justify-center gap-2 text-sm bg-[#2D5A5A] text-white rounded-lg px-4 py-3 font-medium disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} See the trade
          </button>
        )}

        {quote && (
          <div className="border border-teal-deep/30 bg-teal-deep/5 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">{quote.sentence}</p>
            {quote.disclosure && <p className="text-xs text-muted-foreground">{quote.disclosure}</p>}
            <dl className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between gap-3">
                <dt>Posted prices</dt>
                <dd>
                  {usd(quote.payPriceMinor)} each for {usd(quote.receivePriceMinor)} each
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>The village keeps</dt>
                <dd>{quote.takeMinor > 0 ? usd(quote.takeMinor) : "nothing"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>You can swap</dt>
                <dd>
                  {quote.swappableBalance ?? balance} {payName}
                  {quote.heldFromRecentPurchase > 0 && ` (${quote.heldFromRecentPurchase} still settling)`}
                </dd>
              </div>
            </dl>
            {/* The stewards' own reasons for both prices, at the moment of
                consent — a posted rate a member cannot interrogate is just
                a number someone typed. */}
            {(quote.payPriceNote || quote.receivePriceNote) && (
              <div className="text-xs text-muted-foreground border-t border-teal-deep/20 pt-2 space-y-1">
                {quote.payPriceNote && (
                  <p>
                    <span className="font-medium text-foreground">{payName}:</span> “{quote.payPriceNote}”
                    {quote.payPriceSetAt && ` · set ${day(quote.payPriceSetAt)}`}
                  </p>
                )}
                {quote.receivePriceNote && (
                  <p>
                    <span className="font-medium text-foreground">
                      {options.find((o) => o.receiveToken === receiveToken)?.receiveTokenName ?? receiveToken}:
                    </span>{" "}
                    “{quote.receivePriceNote}”
                    {quote.receivePriceSetAt && ` · set ${day(quote.receivePriceSetAt)}`}
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-amber-800 flex items-start gap-1.5 pt-1">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {quote.finality ?? "Swaps are final."}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={confirm}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-2 text-sm bg-[#2D5A5A] text-white rounded-lg px-4 py-3 font-medium disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Confirm swap
              </button>
              <button
                onClick={() => setQuote(null)}
                className="text-sm border border-border rounded-lg px-4 py-3 font-medium text-muted-foreground"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="inline-flex items-center gap-1.5 text-xs text-teal-deep font-medium"
        >
          <History className="w-3.5 h-3.5" /> {showHistory ? "Hide" : "See"} how this rate has moved
        </button>

        {showHistory && (
          <div className="border border-border rounded-lg p-3">
            {!history && <p className="text-xs text-muted-foreground">Loading…</p>}
            {history && history.points.length === 0 && (
              <p className="text-xs text-muted-foreground">No rate history for this pair yet.</p>
            )}
            {history && history.points.length > 0 && (
              <div className="space-y-2">
                {[...history.points].reverse().slice(0, 12).map((p: any, i: number) => (
                  <div key={i} className="text-xs border-b border-border/60 last:border-0 pb-2 last:pb-0">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{day(p.at)}</span>
                      <span className="font-medium text-foreground">
                        1 = {(1 / p.rate).toFixed(3)} {history.pair[1]}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">
                      {usd(p.payPriceMinor)} / {usd(p.receivePriceMinor)}, {p.receiveNote}
                      {p.receiveDecisionRef && <span className="text-teal-deep"> · decided in the forum</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
