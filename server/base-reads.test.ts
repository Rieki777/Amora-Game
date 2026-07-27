/**
 * The economics section's pure surface (S47): fixed-point formatting and the
 * challenge message. The trap this pins: 0.5 tokens of equity displayed as 0
 * is a misstatement about ownership — string math only, no floats, no INT
 * truncation, ever.
 */
import { describe, expect, it } from "vitest";
import { challengeMessage, formatUnits } from "./lib/base-reads";

describe("formatUnits — fixed point to human string, no floats", () => {
  it("renders the canonical misstatement case correctly: 0.5, not 0", () => {
    expect(formatUnits("500000000000000000", 18)).toBe("0.5");
  });

  it("handles zero, dust, and whole numbers", () => {
    expect(formatUnits("0", 18)).toBe("0");
    expect(formatUnits("1", 18)).toBe("0.000000000000000001"); // one wei survives
    expect(formatUnits("1000000000000000000", 18)).toBe("1");
    expect(formatUnits("1500000000000000000", 18)).toBe("1.5");
  });

  it("respects the token's OWN decimals — never assumes 18", () => {
    expect(formatUnits("1234567", 6)).toBe("1.234567"); // a USDC-shaped token
    expect(formatUnits("42", 0)).toBe("42");
    expect(formatUnits("105", 1)).toBe("10.5");
  });

  it("keeps precision far beyond Number's 53 bits", () => {
    // 123456789012345678901234567.890123456789012345 — Number would mangle this.
    expect(formatUnits("123456789012345678901234567890123456789012345", 18)).toBe(
      "123456789012345678901234567.890123456789012345",
    );
  });

  it("strips trailing fractional zeros but never significant ones", () => {
    expect(formatUnits("1100000000000000000", 18)).toBe("1.1");
    expect(formatUnits("1010000000000000000", 18)).toBe("1.01");
  });
});

describe("challengeMessage", () => {
  it("binds the nonce, the member and the site into the signed text", () => {
    const m = challengeMessage({ nonce: "abc123", userId: "user-9", host: "amora.example" });
    expect(m).toContain("abc123");
    expect(m).toContain("user-9");
    expect(m).toContain("amora.example");
    expect(m).toContain("authorizes nothing");
  });
});
