/**
 * The two site-pull routes, exercised as handlers against stubs.
 *
 * WHAT THIS FILE IS FOR, given that server/lib/sitePull.test.ts already covers
 * the address rules. Three things live in the route and nowhere else, and each
 * one is a way the feature could ship broken with a green library suite:
 *
 *   1. THE GATE. A stranger gets 401, and the fetcher is never called. A route
 *      that fetched first and checked afterwards would be an unauthenticated
 *      outbound fetcher with an authentication error printed on it.
 *   2. THE RIGHTS CONTRACT. Pictures are not copied until the caller affirms
 *      rights over each one by name, and the check runs BEFORE the fetch.
 *   3. WHAT COMES BACK. No fetched HTML reaches the browser, on any path.
 *
 * The transport is a fake, so no test here touches a network. The guard is not
 * faked: it runs inside the library the route calls.
 */
import { describe, expect, it } from "vitest";
import { RIGHTS_STATEMENT } from "../lib/sitePull";
import type { OpenRequest, OpenResponse, PullIo } from "../lib/sitePull";
import { register } from "./sitePull";

type Handler = (req: any, res: any) => Promise<unknown> | unknown;

function collect(): { app: any; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const record = (method: string) => (path: string, handler: Handler) => {
    handlers.set(`${method} ${path}`, handler);
  };
  return {
    app: { get: record("GET"), post: record("POST"), put: record("PUT"), delete: record("DELETE") },
    handlers,
  };
}

function makeRes() {
  const out: { status: number; body: any } = { status: 200, body: undefined };
  const res: any = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  return { res, out };
}

const PUBLIC_V4 = "93.184.216.34";

/**
 * Enough of a PNG header for the refusal tests, which never reach a decoder
 * because the rights gate stops them first. The one test that DOES store a
 * picture builds a real one with sharp, because `sanitiseForVolume` re-encodes
 * what it is given and a header with zeros behind it is not a picture.
 */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

const realPng = async (): Promise<Buffer> => {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: 48, height: 32, channels: 3, background: { r: 20, g: 80, b: 50 } } })
    .png()
    .toBuffer();
};

/** A transport that answers everything the same way and counts the calls. */
function fakeIo(answer: { status?: number; headers?: Record<string, string>; body?: Buffer }): {
  io: PullIo;
  opened: OpenRequest[];
} {
  const opened: OpenRequest[] = [];
  const io: PullIo = {
    resolve: async () => [{ address: PUBLIC_V4, family: 4 }],
    open: async (req): Promise<OpenResponse> => {
      opened.push(req);
      const bytes = answer.body ?? Buffer.from("<html><title>Our village</title></html>");
      async function* body() {
        yield bytes;
      }
      return {
        status: answer.status ?? 200,
        headers: answer.headers ?? { "content-type": "text/html; charset=utf-8" },
        body: body(),
        cancel: () => {},
      };
    },
  };
  return { io, opened };
}

function mount(over: Record<string, any> = {}) {
  const { app, handlers } = collect();
  const fake = over.fake ?? fakeIo({});
  register(app, {
    isAdmin: over.isAdmin ?? (async () => true),
    adminActor: over.adminActor ?? (() => ({ id: "founder-1" })),
    overLimit: over.overLimit ?? (async () => false),
    clientIp: over.clientIp ?? (() => "203.0.113.7"),
    uploadsDir: over.uploadsDir ?? "/does/not/matter",
    io: fake.io,
    ...(over.extractBrand ? { extractBrand: over.extractBrand } : {}),
  } as any);
  return { handlers, opened: fake.opened };
}

const call = async (handlers: Map<string, Handler>, key: string, body: any = {}) => {
  const handler = handlers.get(key);
  if (!handler) throw new Error(`no handler registered for ${key}`);
  const { res, out } = makeRes();
  await handler({ body }, res);
  return out;
};

const PULL = "POST /api/admin/site-pull";
const ASSETS = "POST /api/admin/site-pull/assets";

describe("the routes register", () => {
  it("registers exactly the two the setup screen calls", () => {
    const { handlers } = mount();
    expect([...handlers.keys()].sort()).toEqual([PULL, ASSETS]);
  });
});

describe("the gate runs before anything leaves the process", () => {
  it("refuses a stranger and fetches nothing", async () => {
    const { handlers, opened } = mount({ isAdmin: async () => false });
    const pull = await call(handlers, PULL, { url: "village.example" });
    expect(pull.status).toBe(401);
    const assets = await call(handlers, ASSETS, { pageUrl: "https://village.example/", assets: ["x"] });
    expect(assets.status).toBe(401);
    expect(opened).toHaveLength(0);
  });

  it("refuses once the hourly limit is spent, and fetches nothing", async () => {
    const { handlers, opened } = mount({ overLimit: async () => true });
    const out = await call(handlers, PULL, { url: "village.example" });
    expect(out.status).toBe(429);
    expect(opened).toHaveLength(0);
  });

  it("keys the two limits separately so one does not spend the other", async () => {
    const buckets: string[] = [];
    const { handlers } = mount({
      overLimit: async (bucket: string) => {
        buckets.push(bucket);
        return false;
      },
    });
    await call(handlers, PULL, { url: "village.example" });
    await call(handlers, ASSETS, { pageUrl: "https://village.example/", assets: [] });
    expect(buckets).toEqual(["site-pull:203.0.113.7", "site-pull-assets:203.0.113.7"]);
  });
});

describe("reading the page", () => {
  it("answers with the addresses dialled and the sizes, and never the page itself", async () => {
    const secret = "<html><script>alert(document.cookie)</script><title>Our village</title></html>";
    const { handlers } = mount({ fake: fakeIo({ body: Buffer.from(secret) }) });
    const out = await call(handlers, PULL, { url: "village.example" });

    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(true);
    expect(out.body.source).toMatchObject({
      requestedUrl: "https://village.example",
      finalUrl: "https://village.example/",
      status: 200,
      truncated: false,
    });
    expect(out.body.source.bytes).toBe(secret.length);

    // The whole answer, serialised, carries no part of the fetched document.
    const wire = JSON.stringify(out.body);
    expect(wire).not.toContain("<script");
    expect(wire).not.toContain("Our village");
  });

  it("says plainly that no extractor is wired rather than answering with nothing", async () => {
    const { handlers } = mount();
    const out = await call(handlers, PULL, { url: "village.example" });
    expect(out.body.extractor).toBe("none");
    expect(out.body.brand).toBeNull();
  });

  it("hands the document to an extractor when a deployment has one", async () => {
    let seen: any = null;
    const { handlers } = mount({
      extractBrand: (doc: any) => {
        seen = doc;
        return { tagline: "Our village", images: ["/hero.jpg"] };
      },
    });
    const out = await call(handlers, PULL, { url: "village.example" });
    expect(out.body.extractor).toBe("wired");
    expect(out.body.brand).toEqual({ tagline: "Our village", images: ["/hero.jpg"] });
    // The extractor is the only thing that sees the text.
    expect(seen.text).toContain("Our village");
    expect(seen.finalUrl).toBe("https://village.example/");
  });

  it("sends the rights sentence with the page, so the screen shows what the server will store", async () => {
    const { handlers } = mount();
    const out = await call(handlers, PULL, { url: "village.example" });
    expect(out.body.rights).toMatchObject({ required: true, statement: RIGHTS_STATEMENT });
  });

  it("refuses an empty address without calling the fetcher", async () => {
    const { handlers, opened } = mount();
    const out = await call(handlers, PULL, { url: "   " });
    expect(out.status).toBe(400);
    expect(opened).toHaveLength(0);
  });

  it("passes a library refusal through with its reason and its sentence", async () => {
    const { handlers } = mount();
    const out = await call(handlers, PULL, { url: "http://village.example/" });
    expect(out.status).toBe(400);
    expect(out.body.reason).toBe("scheme");
    expect(out.body.message).toContain("https");
  });

  it("answers a status instead of hanging when the handler throws", async () => {
    // Express 4 turns a rejected handler promise into an unhandled rejection
    // and the caller gets nothing at all, so every path has to answer.
    const { handlers } = mount({
      isAdmin: async () => {
        throw new Error("the token store fell over");
      },
    });
    const out = await call(handlers, PULL, { url: "village.example" });
    expect(out.status).toBe(500);
    expect(out.body.ok).toBe(false);
  });
});

describe("copying the pictures", () => {
  const page = "https://village.example/";
  const one = "https://village.example/hero.jpg";

  it("copies nothing until rights are affirmed", async () => {
    const { handlers, opened } = mount({ fake: fakeIo({ headers: { "content-type": "image/png" }, body: PNG }) });
    const out = await call(handlers, ASSETS, { pageUrl: page, assets: [one] });
    expect(out.status).toBe(400);
    expect(out.body.reason).toBe("rights_not_affirmed");
    // The refusal costs the far end nothing: the gate is in front of the fetch.
    expect(opened).toHaveLength(0);
  });

  it("refuses a blanket affirmation that does not name the pictures", async () => {
    const { handlers, opened } = mount({ fake: fakeIo({ headers: { "content-type": "image/png" }, body: PNG }) });
    const out = await call(handlers, ASSETS, {
      pageUrl: page,
      assets: [one],
      rights: { confirmed: true, sourceUrl: page, assetUrls: [] },
    });
    expect(out.status).toBe(400);
    expect(opened).toHaveLength(0);
  });

  it("refuses when the affirmation names a different picture from the one asked for", async () => {
    const { handlers, opened } = mount({ fake: fakeIo({ headers: { "content-type": "image/png" }, body: PNG }) });
    const out = await call(handlers, ASSETS, {
      pageUrl: page,
      assets: [one],
      rights: { confirmed: true, sourceUrl: page, assetUrls: ["https://village.example/other.jpg"] },
    });
    expect(out.status).toBe(400);
    expect(opened).toHaveLength(0);
  });

  it("refuses more pictures than the ceiling, before fetching any", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `https://village.example/p${i}.jpg`);
    const { handlers, opened } = mount({ fake: fakeIo({ headers: { "content-type": "image/png" }, body: PNG }) });
    const out = await call(handlers, ASSETS, {
      pageUrl: page,
      assets: many,
      rights: { confirmed: true, sourceUrl: page, assetUrls: many },
    });
    expect(out.status).toBe(400);
    expect(out.body.reason).toBe("too_many");
    expect(opened).toHaveLength(0);
  });

  it("the control: an affirmed picture is fetched, stored, and answered as an address", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const uploadsDir = mkdtempSync(join(tmpdir(), "sitepull-"));

    const { handlers, opened } = mount({
      uploadsDir,
      fake: fakeIo({ headers: { "content-type": "image/png" }, body: await realPng() }),
    });
    const out = await call(handlers, ASSETS, {
      pageUrl: page,
      assets: [one],
      rights: { confirmed: true, sourceUrl: page, assetUrls: [one] },
    });

    expect(out.status).toBe(200);
    expect(opened).toHaveLength(1);
    expect(out.body.images).toHaveLength(1);
    expect(out.body.images[0].url).toMatch(/^\/api\/uploads\/sitepull-\d+-[a-z0-9]+\.png$/);
    expect(out.body.refused).toEqual([]);
    // The record of what was agreed comes back for the caller to keep.
    expect(out.body.rightsAck).toMatchObject({
      by: "founder-1",
      sourceUrl: page,
      assetUrls: [one],
      statement: RIGHTS_STATEMENT,
    });
    // Bytes never travel in the answer.
    expect(JSON.stringify(out.body)).not.toContain("PNG");
  });
});
