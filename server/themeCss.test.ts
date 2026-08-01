import { describe, expect, it } from "vitest";
import { buildThemeCss, sanitizeFontStack, sanitizeImportUrl } from "./lib/themeCss";

describe("theme.css emission", () => {
  it("emits nothing for an untouched fork", () => {
    // The white-label baseline: a village that sets no theme gets an empty
    // file, not someone else's typography.
    expect(buildThemeCss(undefined)).toBe("");
    expect(buildThemeCss({})).toBe("");
    expect(buildThemeCss({ fontImportUrl: "", fontDisplay: "", fontBody: "" })).toBe("");
  });

  it("emits a village's font import and display override", () => {
    const css = buildThemeCss({
      fontImportUrl: "https://amora.cr/fonts/serenity.css", // brand-ok: test fixture proving a VILLAGE (not the platform) can carry its own font
      fontDisplay: '"Serenity", "Raleway", sans-serif',
    });
    expect(css).toContain('@import url("https://amora.cr/fonts/serenity.css");'); // brand-ok: same fixture
    expect(css).toContain('--font-display: "Serenity", "Raleway", sans-serif;');
    // Doubled :root beats the platform defaults regardless of load order.
    expect(css).toContain(":root:root {");
  });

  it("accepts a same-origin uploads path", () => {
    expect(sanitizeImportUrl("/api/uploads/brand-123-abcde.css")).toBe("/api/uploads/brand-123-abcde.css");
  });

  describe("hostile input is discarded whole, never repaired", () => {
    it("rejects CSS-injection in stacks", () => {
      // One brace and the value could close :root and open its own rule.
      expect(sanitizeFontStack('"A"; } body { display: none } ')).toBeNull();
      expect(sanitizeFontStack('"A" } * { background: url(https://evil.example/x) }')).toBeNull();
    });

    it("rejects URLs that could escape url(\"…\")", () => {
      expect(sanitizeImportUrl('https://x.example/a").css"); @import url("https://evil.example/b')).toBeNull();
      expect(sanitizeImportUrl("javascript:alert(1)")).toBeNull();
      expect(sanitizeImportUrl("http://insecure.example/f.css")).toBeNull(); // https only
      expect(sanitizeImportUrl("/api/uploads/../../../etc/passwd")).toBeNull();
      expect(sanitizeImportUrl("/etc/passwd")).toBeNull();
    });

    it("rejects non-strings without throwing", () => {
      expect(sanitizeFontStack(42 as unknown)).toBeNull();
      expect(sanitizeImportUrl({} as unknown)).toBeNull();
      expect(buildThemeCss({ fontDisplay: 42 as unknown as string })).toBe("");
    });
  });
});
