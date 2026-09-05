/**
 * BOTH ENDPOINTS STILL GO THROUGH THE ONE PROJECTION.
 *
 * `circleView.test.ts` proves the projection is right. It cannot prove that
 * anybody CALLS it, and the bug being fixed was exactly that: two endpoints
 * reading identical rows and each writing its own object literal on the way
 * out, one of them eight fields short. A future afternoon adding a third
 * circle surface, or "just adding one field here", reintroduces it silently,
 * because a hand-written literal is never a type error.
 *
 * So this reads the server source and asserts the shape of the call sites.
 * It is a source check rather than a runtime one because the failure it
 * guards against is invisible at runtime: both payloads parse, both render,
 * and the two pages simply disagree.
 *
 * Every assertion below is paired with a POSITIVE control on the same
 * search. A grep that finds nothing proves nothing until the same grep has
 * found something it should.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SERVER = path.resolve(__dirname, "../server/index.ts");
const src = fs.readFileSync(SERVER, "utf8");

/** The body of one Express handler, from its `app.METHOD("path"` to the
 *  closing `});` at the same indentation. */
function handler(method: string, route: string): string {
  const open = src.indexOf(`app.${method}("${route}"`);
  expect(open, `${method.toUpperCase()} ${route} exists in server/index.ts`).toBeGreaterThan(-1);
  const end = src.indexOf("\n  });", open);
  expect(end, `${method.toUpperCase()} ${route} has a findable end`).toBeGreaterThan(open);
  return src.slice(open, end);
}

describe("the circle projection has exactly one implementation", () => {
  it("finds the handlers at all (the positive control for every check below)", () => {
    // If this repo ever renames these routes, the rest of this file would
    // start passing vacuously. It fails here instead.
    expect(handler("get", "/api/map")).toContain("res.json");
    expect(handler("get", "/api/org")).toContain("res.json");
  });

  it("/api/map projects its circles through circleViews", () => {
    expect(handler("get", "/api/map")).toContain("circleViews(circlesRepo.all())");
  });

  it("/api/org projects its circles through circleViews", () => {
    expect(handler("get", "/api/org")).toContain("circleViews(circlesRepo.all())");
  });

  it("neither handler ships raw store rows as circles", () => {
    // `circles: circlesRepo.all(),` is what /api/map used to do: every column
    // including `createdAt` straight onto the wire, which is the other half
    // of why the two payloads differed.
    for (const route of ["/api/map", "/api/org"]) {
      expect(handler("get", route), `${route} sends projected circles`).not.toMatch(
        /circles:\s*circlesRepo\.all\(\)\s*,/,
      );
    }
  });

  it("neither handler rebuilds a circle literal by hand", () => {
    // The eight-key literal this replaced. `parentCircleId:` next to
    // `grownFromOrgRoleId:` inside one of these handlers means somebody has
    // started a second projection.
    for (const route of ["/api/map", "/api/org"]) {
      const body = handler("get", route);
      const handRolled = /parentCircleId:\s*c\.[a-zA-Z]/.test(body) && /grownFromOrgRoleId:/.test(body);
      expect(handRolled, `${route} does not hand-roll a circle shape`).toBe(false);
    }
  });

  it("the projection is imported from shared, so the client can hold the type", () => {
    expect(src).toMatch(/import\s*\{[^}]*circleViews[^}]*\}\s*from\s*"\.\.\/shared\/circleView"/);
  });
});
