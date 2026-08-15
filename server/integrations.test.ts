import { describe, expect, it } from "vitest";
import {
  CORRELATION_HEADER,
  callVendor,
  healthReading,
  integrationHealth,
  type IntegrationHealth,
} from "./lib/integrations";

/**
 * No database here on purpose. The wrapper writes through a cache and skips the
 * query when no pool is loaded, so its behaviour is checkable everywhere, and
 * `healthReading` is pure so the four honest answers can be pinned exactly.
 */
const h = (over: Partial<IntegrationHealth>): IntegrationHealth => ({
  moduleId: "fixture",
  operation: "read",
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureStatus: null,
  lastFailureDetail: null,
  lastCorrelationId: null,
  consecutiveFailures: 0,
  ...over,
});

const WINDOW = { mode: "window", withinHours: 24 } as const;
const ON_DEMAND = { mode: "on-demand" } as const;
const NOW = new Date("2026-08-14T12:00:00.000Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

describe("reading an integration's health", () => {
  it("says never confirmed when nothing has ever succeeded", () => {
    const r = healthReading(null, WINDOW, NOW);
    expect(r.verdict).toBe("never-confirmed");
    expect(r.detail).toContain("Never confirmed working");
  });

  it("says never confirmed even for a row that exists with no success on it", () => {
    expect(healthReading(h({}), WINDOW, NOW).verdict).toBe("never-confirmed");
  });

  it("never lets a typed key stand in for a working one", () => {
    // The whole reason this file exists. `secretStatus.setAt` records when a
    // human typed a credential; nothing here consults it, and a revoked key
    // therefore reads as unconfirmed instead of as connected forever.
    const reading = healthReading(null, WINDOW, NOW);
    expect(reading.verdict).not.toBe("working");
    expect(reading.verdict).not.toBe("quiet");
  });

  it("says working for a success inside the declared window", () => {
    expect(healthReading(h({ lastSuccessAt: ago(2) }), WINDOW, NOW).verdict).toBe("working");
  });

  it("says stale for a success older than the declared window", () => {
    const r = healthReading(h({ lastSuccessAt: ago(72) }), WINDOW, NOW);
    expect(r.verdict).toBe("stale");
    expect(r.detail).toContain("24 hour window");
  });

  it("says quiet for an on-demand listing, because silence there is declared normal", () => {
    expect(healthReading(h({ lastSuccessAt: ago(500) }), ON_DEMAND, NOW).verdict).toBe("quiet");
  });

  it("says failing when the most recent outcome was a failure", () => {
    const r = healthReading(
      h({ lastSuccessAt: ago(5), lastFailureAt: ago(1), lastFailureStatus: "401", consecutiveFailures: 3 }),
      WINDOW,
      NOW,
    );
    expect(r.verdict).toBe("failing");
    expect(r.detail).toContain("401");
    expect(r.detail).toContain("3 in a row");
  });

  it("goes back to working when a success lands after a failure", () => {
    const r = healthReading(h({ lastSuccessAt: ago(1), lastFailureAt: ago(4) }), WINDOW, NOW);
    expect(r.verdict).toBe("working");
  });
});

describe("the driver wrapper", () => {
  it("hands the driver a correlation id in a header and records the success", async () => {
    let seen: Record<string, string> | null = null;
    const out = await callVendor("wrapper-success", "read", async (ctx) => {
      seen = ctx.headers;
      expect(ctx.correlationId).toMatch(/[0-9a-f-]{36}/);
      return "answered";
    });
    expect(out).toBe("answered");
    expect(seen![CORRELATION_HEADER]).toBeTruthy();
    const rec = integrationHealth("wrapper-success", "read")!;
    expect(rec.lastSuccessAt).toBeTruthy();
    expect(rec.consecutiveFailures).toBe(0);
    // The id the vendor was asked to echo is the id kept on our side, so the
    // two records name the same call.
    expect(rec.lastCorrelationId).toBe(seen![CORRELATION_HEADER]);
  });

  it("records a failure, counts it, and rethrows unchanged", async () => {
    const boom = Object.assign(new Error("gateway said no"), { status: 502 });
    await expect(callVendor("wrapper-fail", "write", async () => { throw boom; })).rejects.toThrow("gateway said no");
    await expect(callVendor("wrapper-fail", "write", async () => { throw boom; })).rejects.toThrow("gateway said no");
    const rec = integrationHealth("wrapper-fail", "write")!;
    expect(rec.lastFailureStatus).toBe("502");
    expect(rec.lastFailureDetail).toContain("gateway said no");
    expect(rec.consecutiveFailures).toBe(2);
    expect(rec.lastSuccessAt).toBeNull();
  });

  it("clears the failure streak on the next success", async () => {
    await expect(callVendor("wrapper-recover", "read", async () => { throw new Error("timeout"); })).rejects.toThrow();
    await callVendor("wrapper-recover", "read", async () => "fine");
    const rec = integrationHealth("wrapper-recover", "read")!;
    expect(rec.consecutiveFailures).toBe(0);
    expect(rec.lastSuccessAt).toBeTruthy();
    // The failure is KEPT. A cleared streak is not an erased history, and the
    // last failure is what a vendor conversation starts from.
    expect(rec.lastFailureAt).toBeTruthy();
  });

  it("keeps one record per operation, so a healthy read cannot mask a broken write", async () => {
    await callVendor("wrapper-split", "read", async () => "ok");
    await expect(callVendor("wrapper-split", "write", async () => { throw new Error("denied"); })).rejects.toThrow();
    expect(healthReading(integrationHealth("wrapper-split", "read"), WINDOW).verdict).toBe("working");
    expect(healthReading(integrationHealth("wrapper-split", "write"), WINDOW).verdict).toBe("failing");
  });
});
