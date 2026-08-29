/**
 * THE LINEAGE ASK IS BATCHED, BECAUSE A VILLAGE CAN REACH THE CAP (0102).
 *
 * `GET /api/governance/objections/lineage` takes at most fifty ids and drops
 * the rest, which is the right thing for a route to do with an unbounded list
 * from a browser. That cap is reachable in a real village and not only in
 * theory: in consent mode a `no` vote files an objection by itself, so sixty
 * members with fifty-five against a proposal put fifty-five objections on one
 * decision page.
 *
 * If the panel sent all of them in one ask, the tail of that page would
 * quietly render no lineage sentence for objections the record does have one
 * for. Nothing would error and nothing would look wrong. So the panel asks in
 * batches and joins the answers, and this is what holds it: fifty-one ids is
 * two asks, and every row comes back.
 *
 * A refusal on any batch is returned as itself. Half an answer presented as a
 * whole one is the shape this house does not ship.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchObjectionLineage } from "./governanceApi";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `obj-${i}`);

const row = (id: string) => ({
  objectionId: id,
  ballotId: `bal-for-${id}`,
  title: "The version that came next",
  status: "open",
  closedAt: null,
});

/**
 * `governanceApi` attaches the session token, and reading it goes through
 * `localStorage`. These cases are about batching rather than about auth, and
 * the module's own try/catch would otherwise turn a storage problem into
 * "Nothing answered", which reads like a batching failure and is not one.
 */
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchObjectionLineage", () => {
  it("asks once for fifty ids", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return { ok: true, json: async () => [] };
    });
    const answer = await fetchObjectionLineage(ids(50));
    expect(answer.ok).toBe(true);
    expect(asked).toHaveLength(1);
  });

  it("asks twice for fifty one, and loses nobody's lineage in the split", async () => {
    const asked: string[][] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const sent = decodeURIComponent(String(url).split("ids=")[1] ?? "").split(",").filter(Boolean);
      asked.push(sent);
      return { ok: true, json: async () => sent.map(row) };
    });
    const answer = await fetchObjectionLineage(ids(51));
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(asked.map((b) => b.length)).toEqual([50, 1]);
    expect(answer.data).toHaveLength(51);
    expect(answer.data.map((r) => r.objectionId)).toEqual(ids(51));
  });

  it("returns a refusal on any batch as itself, never half an answer", async () => {
    let call = 0;
    vi.stubGlobal("fetch", async () => {
      call += 1;
      if (call === 1) return { ok: true, json: async () => [row("obj-0")] };
      return { ok: false, status: 500, json: async () => ({ error: "Something went wrong. Try again" }) };
    });
    const answer = await fetchObjectionLineage(ids(51));
    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.error).toBe("Something went wrong. Try again");
  });
});
