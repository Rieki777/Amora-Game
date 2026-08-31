/**
 * The one seam in this lane that could become a backdoor, tested as one.
 *
 * `GOOGLE_TOKEN_ENDPOINT` exists so the e2e suite can stand in for Google. A
 * setting that redirects where this server sends its client secret has to be
 * unable to send it anywhere but this machine, and that has to be asserted.
 * A comment describing the guard is not the guard.
 */
import { describe, expect, it, vi } from "vitest";
import { register, reportSignInMethods, resolveTokenEndpoint } from "./authGoogle";

const REAL = "https://oauth2.googleapis.com/token";

describe("resolveTokenEndpoint refuses to point anywhere but loopback", () => {
  it("uses Google when nothing is set", () => {
    expect(resolveTokenEndpoint({})).toBe(REAL);
    expect(resolveTokenEndpoint({ GOOGLE_TOKEN_ENDPOINT: "" })).toBe(REAL);
    expect(resolveTokenEndpoint({ GOOGLE_TOKEN_ENDPOINT: "   " })).toBe(REAL);
  });

  it("accepts a loopback http address, which is the whole legitimate use", () => {
    expect(resolveTokenEndpoint({ GOOGLE_TOKEN_ENDPOINT: "http://127.0.0.1:20700/token" })).toBe(
      "http://127.0.0.1:20700/token",
    );
    expect(resolveTokenEndpoint({ GOOGLE_TOKEN_ENDPOINT: "http://localhost:8080/token" })).toBe(
      "http://localhost:8080/token",
    );
  });

  for (const hostile of [
    "https://evil.example/token",
    "http://evil.example/token",
    // The near-misses. A prefix or suffix match on "localhost" would take all
    // three of these, and each one is a host somebody else can own.
    "http://localhost.evil.example/token",
    "http://127.0.0.1.evil.example/token",
    "http://evil.example/?x=localhost",
    // https on loopback is refused too: the rule is one shape, not two.
    "https://localhost:8080/token",
    "not-a-url",
    "//localhost/token",
  ]) {
    it(`refuses ${hostile} and keeps talking to Google`, () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(resolveTokenEndpoint({ GOOGLE_TOKEN_ENDPOINT: hostile })).toBe(REAL);
      // Refusing silently would leave an operator debugging a value that was
      // being ignored the whole time.
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  }
});

describe("the boot report says which doors this village actually has", () => {
  it("names the callback when Google is on", () => {
    const lines: string[] = [];
    reportSignInMethods(
      { available: true, config: { clientId: "id", clientSecret: "s", redirectUri: "https://v.example/cb" } },
      { log: (m: string) => lines.push(m) } as any,
    );
    expect(lines.join("\n")).toContain("email and password, Google");
    expect(lines.join("\n")).toContain("https://v.example/cb");
  });

  it("names every missing variable when Google is off", () => {
    const lines: string[] = [];
    reportSignInMethods({ available: false, missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] }, {
      log: (m: string) => lines.push(m),
    } as any);
    const out = lines.join("\n");
    expect(out).toContain("Google is OFF");
    expect(out).toContain("GOOGLE_CLIENT_ID");
    expect(out).toContain("GOOGLE_CLIENT_SECRET");
    // The village is told the button is absent, so nobody hunts for a button
    // that was never drawn.
    expect(out).toContain("No Google button is shown");
  });
});

describe("an unconfigured village registers the routes and refuses them", () => {
  it("answers google:false and 404s /start without any credentials", async () => {
    const routes = new Map<string, any>();
    const app = {
      get: (p: string, h: any) => routes.set(`GET ${p}`, h),
      post: (p: string, h: any) => routes.set(`POST ${p}`, h),
    } as any;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    register(app, {
      authSecret: "s",
      availability: () => ({ available: false, missing: ["GOOGLE_CLIENT_ID"] }),
      members: {} as any,
      encodeToken: () => "t",
      publicUser: (u: any) => u,
      makeHandle: async () => "h",
      overLimit: async () => false,
      clientIp: () => "1.2.3.4",
      recordAudit: () => {},
      onMemberJoined: () => {},
    });
    log.mockRestore();

    // Registered, so the client always gets a straight answer about what exists.
    expect(routes.has("GET /api/auth/methods")).toBe(true);
    expect(routes.has("GET /api/auth/google/start")).toBe(true);

    let methods: any;
    await routes.get("GET /api/auth/methods")({} as any, { json: (b: any) => (methods = b) } as any);
    expect(methods).toEqual({ password: true, google: false });

    let status = 0;
    const res: any = { status: (s: number) => ((status = s), res), json: () => res, redirect: () => res };
    await routes.get("GET /api/auth/google/start")({ query: {} } as any, res);
    expect(status).toBe(404);
  });
});
