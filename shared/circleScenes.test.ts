import { describe, expect, it } from "vitest";
import { sceneForCircle } from "./circleScenes";

describe("circle scenes", () => {
  it("maps every circle in the 2026-08 org chart to a specific motif", () => {
    // The real ids from server/seeds/org-chart-2026-08.json — the structure
    // Rye asked the scenes to be built against. None may fall to the generic.
    const expectations: Record<string, string> = {
      "general-circle": "coordination",
      "outreach-growth-circle": "outreach",
      "community-circle": "community",
      "development-circle": "building",
      "finance-business-circle": "finance",
      "permaculture-council": "land",
      "education-council": "learning",
      "culture-arts-council": "arts",
      "health-healing-council": "healing",
      "building-village-council": "building",
      "business-finance-council": "finance",
      "community-life-council": "community",
      "intergenerational-wisdom-council": "wisdom",
    };
    for (const [id, motif] of Object.entries(expectations)) {
      const r = sceneForCircle({ id });
      expect(r, id).toEqual({ kind: "motif", motif });
    }
  });

  it("an explicit motif beats keywords; an upload beats both", () => {
    expect(sceneForCircle({ id: "education-council", scene: "arts" })).toEqual({ kind: "motif", motif: "arts" });
    expect(sceneForCircle({ id: "education-council", scene: "/api/uploads/brand-1-a.webp" }))
      .toEqual({ kind: "upload", url: "/api/uploads/brand-1-a.webp" });
  });

  it("garbage in the scene field falls back to keywords, never breaks", () => {
    expect(sceneForCircle({ id: "education-council", scene: "../../etc/passwd" }))
      .toEqual({ kind: "motif", motif: "learning" });
    expect(sceneForCircle({ id: "education-council", scene: "https://evil.example/x.png" }))
      .toEqual({ kind: "motif", motif: "learning" });
  });

  it("an unknown circle gets the warm generic, not a hole", () => {
    expect(sceneForCircle({ id: "zzz", name: "Mystery" })).toEqual({ kind: "motif", motif: "gathering" });
    expect(sceneForCircle({})).toEqual({ kind: "motif", motif: "gathering" });
  });
});
