import { describe, expect, it } from "vitest";
import { crewCodeFrom, inviteUrl } from "./crewLinks";

describe("inviteUrl", () => {
  it("builds a link back to the quest carrying the code", () => {
    expect(inviteUrl("https://v.example", "q-welcome", "abc123")).toBe(
      "https://v.example/quests/q-welcome?crew=abc123",
    );
  });

  it("escapes anything that would break the URL", () => {
    const url = inviteUrl("https://v.example", "q a/b", "a+b/c=");
    expect(url).toContain("q%20a%2Fb");
    expect(url).toContain("crew=a%2Bb%2Fc%3D");
  });

  it("round-trips a real invite code", () => {
    // base64url, which is what the server mints.
    const code = "K3n_9aBcD-Ef";
    expect(crewCodeFrom(new URL(inviteUrl("https://v.example", "q-1", code)).search)).toBe(code);
  });
});

describe("crewCodeFrom", () => {
  it("reads the code whether it leads or follows", () => {
    expect(crewCodeFrom("?crew=abc")).toBe("abc");
    expect(crewCodeFrom("?from=email&crew=abc")).toBe("abc");
    expect(crewCodeFrom("?crew=abc&from=email")).toBe("abc");
  });

  it("stops at a fragment", () => {
    expect(crewCodeFrom("?crew=abc#section")).toBe("abc");
  });

  it("is empty when there is no invite, which is the common case", () => {
    expect(crewCodeFrom("")).toBe("");
    expect(crewCodeFrom("?other=1")).toBe("");
    expect(crewCodeFrom(null as any)).toBe("");
  });

  it("survives a malformed escape rather than throwing", () => {
    expect(crewCodeFrom("?crew=%E0%A4%A")).toBe("");
  });
});
