/**
 * The `headers` option on guardedFetchJson (round 4, lane L6, approved by the
 * coordinator as additive only). Two properties: a header the caller passes is
 * on the wire, and a call that passes none sends exactly the headers it always
 * sent. The pinned dialer is exercised through a mocked https.request against
 * a literal public address, so no DNS and no network.
 */
import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";

const calls: { options: any; written: string }[] = [];

vi.mock("https", () => {
  const request = (options: any, onResponse: (res: any) => void) => {
    const req: any = new EventEmitter();
    let written = "";
    req.write = (chunk: any) => { written += String(chunk); };
    req.end = () => {
      calls.push({ options, written });
      const res: any = new EventEmitter();
      res.statusCode = 200;
      res.headers = {};
      onResponse(res);
      setImmediate(() => { res.emit("data", Buffer.from('{"ok":true}')); res.emit("end"); });
    };
    req.destroy = () => {};
    req.setTimeout = () => {};
    return req;
  };
  return { default: { request }, request };
});

const { guardedFetchJson } = await import("./toolcheck");

// A literal public address: the range check passes without a lookup.
const URL_ = "https://93.184.216.34/hook";

afterEach(() => { calls.length = 0; });

describe("guardedFetchJson headers", () => {
  it("sends a caller header on the wire, beside the defaults", async () => {
    const out = await guardedFetchJson(URL_, 1000, {
      method: "POST",
      body: { hello: "world" },
      headers: { "X-Village-Signature": "t=1,v1=abc" },
    });
    expect(out).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].options.headers["X-Village-Signature"]).toBe("t=1,v1=abc");
    expect(calls[0].options.headers.Accept).toBe("application/json");
    expect(calls[0].options.headers["Content-Type"]).toBe("application/json");
    expect(calls[0].written).toBe('{"hello":"world"}');
  });

  it("changes nothing when no headers are passed", async () => {
    await guardedFetchJson(URL_, 1000, { method: "POST", body: { a: 1 } });
    await guardedFetchJson(URL_, 1000);
    expect(Object.keys(calls[0].options.headers).sort()).toEqual(["Accept", "Content-Length", "Content-Type"]);
    expect(Object.keys(calls[1].options.headers)).toEqual(["Accept"]);
    expect(calls[1].options.method).toBe("GET");
  });
});
