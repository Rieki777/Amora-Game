import { describe, it, expect } from "vitest";
import {
  ALT_TEXT_MAX,
  altTextProblem,
  attributionLine,
  canAct,
  capacityLine,
  captionProblem,
  emptyQueueLine,
  heroOf,
  isPhotoMimeType,
  monthAndYear,
  orderPhotos,
  remainingForPlace,
  reportHeadline,
  takenOnProblem,
} from "./placePhotos";

const photo = (id: string, createdAt: string, heroAt: string | null = null) => ({ id, createdAt, heroAt });

describe("orderPhotos", () => {
  it("leads with the hero, then newest first", () => {
    const rows = [
      photo("a", "2026-01-01T00:00:00Z"),
      photo("b", "2026-03-01T00:00:00Z"),
      photo("c", "2026-02-01T00:00:00Z", "2026-04-01T00:00:00Z"),
    ];
    expect(orderPhotos(rows).map((p) => p.id)).toEqual(["c", "b", "a"]);
  });

  it("is newest first when nothing is pinned", () => {
    const rows = [photo("a", "2026-01-01T00:00:00Z"), photo("b", "2026-03-01T00:00:00Z")];
    expect(orderPhotos(rows).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("is TOTAL: two rows written in the same millisecond keep one order", () => {
    const same = "2026-05-05T05:05:05.000Z";
    const forward = orderPhotos([photo("b", same), photo("a", same)]).map((p) => p.id);
    const backward = orderPhotos([photo("a", same), photo("b", same)]).map((p) => p.id);
    expect(forward).toEqual(backward);
    expect(forward).toEqual(["a", "b"]);
  });

  it("does not mutate what it was given", () => {
    const rows = [photo("a", "2026-01-01T00:00:00Z"), photo("b", "2026-03-01T00:00:00Z")];
    orderPhotos(rows);
    expect(rows.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("heroOf", () => {
  it("is null when nothing is pinned", () => {
    expect(heroOf([photo("a", "2026-01-01T00:00:00Z")])).toBeNull();
  });

  it("takes the newest pin when the table somehow holds two", () => {
    const rows = [
      photo("a", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"),
      photo("b", "2026-01-02T00:00:00Z", "2026-06-01T00:00:00Z"),
    ];
    expect(heroOf(rows)?.id).toBe("b");
  });
});

describe("attributionLine", () => {
  it("says taken when the photographer gave a date", () => {
    expect(attributionLine({ contributorName: "Sol", takenOn: "2026-03-14", createdAt: "2026-08-01T00:00:00Z" }))
      .toBe("Photo by Sol, taken March 2026");
  });

  it("says added when they did not, and never invents the taken date", () => {
    const line = attributionLine({ contributorName: "Sol", takenOn: null, createdAt: "2026-08-01T00:00:00Z" });
    expect(line).toBe("Photo by Sol, added August 2026");
    expect(line).not.toContain("taken");
  });

  it("falls back to a role when the account is gone", () => {
    expect(attributionLine({ contributorName: "", takenOn: null, createdAt: "2026-08-01T00:00:00Z" }))
      .toBe("Photo by a member, added August 2026");
  });

  it("drops the date rather than printing a broken one", () => {
    expect(attributionLine({ contributorName: "Sol", takenOn: null, createdAt: "not a date" })).toBe("Photo by Sol");
  });
});

describe("monthAndYear", () => {
  it("reads an ISO date and an ISO timestamp the same way", () => {
    expect(monthAndYear("2026-03-14")).toBe("March 2026");
    expect(monthAndYear("2026-03-14T22:00:00Z")).toBe("March 2026");
  });
});

describe("altTextProblem", () => {
  it("requires a description", () => {
    expect(altTextProblem("")).toContain("Describe the photograph");
    expect(altTextProblem("   ")).toContain("Describe the photograph");
    expect(altTextProblem(null)).toContain("Describe the photograph");
  });

  it("refuses a keyboard mash and accepts a real sentence", () => {
    expect(altTextProblem("ab")).toContain("too short");
    expect(altTextProblem("The north wall")).toBeNull();
  });

  it("holds the column width", () => {
    expect(altTextProblem("x".repeat(ALT_TEXT_MAX))).toBeNull();
    expect(altTextProblem("x".repeat(ALT_TEXT_MAX + 1))).toContain(String(ALT_TEXT_MAX));
  });
});

describe("captionProblem", () => {
  it("treats blank as absent", () => {
    expect(captionProblem("")).toBeNull();
    expect(captionProblem(null)).toBeNull();
    expect(captionProblem(undefined)).toBeNull();
  });

  it("refuses one past the column width", () => {
    expect(captionProblem("x".repeat(501))).toContain("500");
  });
});

describe("takenOnProblem", () => {
  const today = new Date("2026-08-22T12:00:00Z");

  it("accepts a blank date", () => {
    expect(takenOnProblem("", today)).toBeNull();
    expect(takenOnProblem(null, today)).toBeNull();
  });

  it("accepts today and every day before it", () => {
    expect(takenOnProblem("2026-08-22", today)).toBeNull();
    expect(takenOnProblem("2015-01-01", today)).toBeNull();
  });

  it("refuses a date that has not happened", () => {
    expect(takenOnProblem("2026-08-23", today)).toContain("later than today");
  });

  it("refuses anything that is not YYYY-MM-DD", () => {
    expect(takenOnProblem("14/03/2026", today)).toContain("YYYY-MM-DD");
  });
});

describe("the limits", () => {
  it("clamps at zero and never reads as unlimited", () => {
    expect(remainingForPlace(0, 0)).toBe(0);
    expect(remainingForPlace(80, 60)).toBe(0);
    expect(remainingForPlace(2, 60)).toBe(58);
  });

  it("states the count as a fact and adds no advice", () => {
    expect(capacityLine(1, 60)).toBe("1 photograph here, room for 59 more.");
    expect(capacityLine(3, 4)).toBe("3 photographs here, room for 1 more.");
    expect(capacityLine(60, 60)).toBe("60 photographs here. This place is at the village's limit.");
  });
});

describe("mime types", () => {
  it("takes what a camera produces and refuses a script wearing a picture's name", () => {
    expect(isPhotoMimeType("image/jpeg")).toBe(true);
    expect(isPhotoMimeType("image/HEIC")).toBe(true);
    expect(isPhotoMimeType("image/svg+xml")).toBe(false);
    expect(isPhotoMimeType("application/pdf")).toBe(false);
    expect(isPhotoMimeType(null)).toBe(false);
  });
});

describe("the queue's words", () => {
  it("names which claim is on the card before the reason is read", () => {
    expect(reportHeadline({ kind: "subject" })).toContain("is of them");
    expect(reportHeadline({ kind: "concern" })).toContain("flagged");
  });

  it("has a real empty state per tab", () => {
    expect(emptyQueueLine("open")).toContain("quiet queue");
    expect(emptyQueueLine("resolved")).toContain("handled");
    expect(emptyQueueLine("dismissed")).toContain("dismissed");
  });

  it("offers buttons only while a report is open", () => {
    expect(canAct({ status: "open" })).toBe(true);
    expect(canAct({ status: "resolved" })).toBe(false);
    expect(canAct({ status: "dismissed" })).toBe(false);
  });
});
