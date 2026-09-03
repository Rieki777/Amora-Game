/**
 * The three states, held apart under every combination that produced them.
 *
 * The case this file exists for is the last describe block: a saved row that
 * is correct while the running process serves something else. That happened
 * on production on 2026-09-02, it produced no error anywhere, and the founder
 * looking at it had no way to tell a save that failed from a save that landed
 * in a row nothing had re-read.
 */
import { describe, expect, it } from "vitest";
import { PREVIEW_FIELDS, previewRows, summarise, type PreviewInput } from "./brandPreview";

const DEFAULTS = {
  project: { name: "Platform Village", tagline: "A platform tagline" },
  images: { hero: "/platform-hero.webp", logo: "" },
};

/** A readable saved plane holding exactly what is passed. */
function input(over: Partial<PreviewInput> = {}): PreviewInput {
  return {
    draft: null,
    stored: { readable: true, present: true, document: {} },
    serving: {},
    defaults: DEFAULTS,
    ...over,
  };
}

const row = (rows: ReturnType<typeof previewRows>, key: string) => rows.find((r) => r.key === key)!;

describe("the field list", () => {
  it("is the wizard's own measured fields, so the preview and the badge cannot drift", () => {
    // Five identity fields plus nine image slots, from SETUP_STEPS.
    expect(PREVIEW_FIELDS.map((f) => f.key)).toContain("hero");
    expect(PREVIEW_FIELDS.map((f) => f.key)).toContain("name");
    expect(PREVIEW_FIELDS.filter((f) => f.group === "images")).toHaveLength(9);
  });
});

describe("a value the founder has set", () => {
  it("is reported as set, wins over the platform default, and is not inherited", () => {
    const rows = previewRows(
      input({
        stored: { readable: true, present: true, document: { images: { hero: "/ours.webp" } } },
        serving: { images: { hero: "/ours.webp" } },
      }),
    );
    const hero = row(rows, "hero");
    expect(hero.read).toBe("set");
    expect(hero.from).toBe("saved");
    expect(hero.value).toBe("/ours.webp");
    expect(hero.effective).toBe("/ours.webp");
    expect(hero.inherited).toBe(false);
    expect(hero.stale).toBe(false);
  });

  it("counts one space as a value, because that is what the site will render", () => {
    // `pick()` in server/index.ts inherits on "" alone. A space reaches the
    // img src. `measureSetup` trims and calls the same space unfilled, so the
    // preview and the progress badge disagree here on purpose.
    const rows = previewRows(
      input({
        stored: { readable: true, present: true, document: { images: { hero: " " } } },
        serving: { images: { hero: " " } },
      }),
    );
    expect(row(rows, "hero").read).toBe("set");
    expect(row(rows, "hero").effective).toBe(" ");
  });
});

describe("a value that is deliberately blank", () => {
  it("is reported as blank and inherits the platform default", () => {
    const rows = previewRows(
      input({
        stored: { readable: true, present: true, document: { images: { hero: "" } } },
        serving: { images: { hero: "" } },
      }),
    );
    const hero = row(rows, "hero");
    expect(hero.read).toBe("blank");
    expect(hero.from).toBe("saved");
    expect(hero.value).toBe("");
    expect(hero.effective).toBe("/platform-hero.webp");
    expect(hero.inherited).toBe(true);
  });

  it("separates a blank that was saved from a key that was never written", () => {
    const saved = previewRows(
      input({ stored: { readable: true, present: true, document: { images: { hero: "" } } } }),
    );
    const never = previewRows(
      input({ stored: { readable: true, present: true, document: { images: {} } } }),
    );
    expect(row(saved, "hero").from).toBe("saved");
    expect(row(never, "hero").from).toBe("none");
    // Both render the same thing. Only `from` says which is which.
    expect(row(saved, "hero").effective).toBe(row(never, "hero").effective);
  });

  it("reads a village that has saved nothing at all as blank, never as unreadable", () => {
    const rows = previewRows(
      input({ stored: { readable: true, present: false, document: null } }),
    );
    expect(row(rows, "hero").read).toBe("blank");
    expect(row(rows, "hero").from).toBe("none");
    expect(summarise(rows).savedUnreadable).toBe(false);
  });

  it("inherits an empty platform default without pretending the field is filled", () => {
    // `logo` ships blank on the platform side too, so blank plus blank is a
    // field that renders nothing. It is still blank, never set.
    const rows = previewRows(
      input({ stored: { readable: true, present: true, document: { images: { logo: "" } } } }),
    );
    expect(row(rows, "logo").read).toBe("blank");
    expect(row(rows, "logo").effective).toBe("");
    expect(row(rows, "logo").inherited).toBe(true);
  });
});

describe("a value we could not read", () => {
  const unreadable = () =>
    previewRows(
      input({
        stored: { readable: false, present: true, document: null },
        serving: { images: { hero: "/what-the-process-holds.webp" } },
      }),
    );

  it("is never reported as blank", () => {
    expect(row(unreadable(), "hero").read).toBe("unreadable");
  });

  it("substitutes no platform default, so nothing on screen can be mistaken for a real answer", () => {
    const hero = row(unreadable(), "hero");
    expect(hero.value).toBeNull();
    expect(hero.effective).toBeNull();
    expect(hero.inherited).toBeNull();
    expect(hero.from).toBeNull();
  });

  it("answers null for staleness, because an unread row cannot be compared", () => {
    expect(row(unreadable(), "hero").stale).toBeNull();
    expect(summarise(unreadable()).savedUnreadable).toBe(true);
    expect(summarise(unreadable()).stale).toBe(0);
  });

  it("still reports what visitors are being served, which is memory and always readable", () => {
    expect(row(unreadable(), "hero").serving).toBe("/what-the-process-holds.webp");
  });

  it("keeps a drafted field readable, because that value is already in hand", () => {
    const rows = previewRows(
      input({
        draft: { images: { hero: "/typed-just-now.webp" } },
        stored: { readable: false, present: true, document: null },
      }),
    );
    expect(row(rows, "hero").read).toBe("set");
    expect(row(rows, "hero").from).toBe("draft");
    expect(row(rows, "hero").effective).toBe("/typed-just-now.webp");
    // Whether it differs from what is saved is unknowable while the row is
    // unreadable, and null says so.
    expect(row(rows, "hero").unsaved).toBeNull();
  });
});

describe("pending values, before anything is committed", () => {
  it("previews the draft ahead of the saved row", () => {
    const rows = previewRows(
      input({
        draft: { images: { hero: "/about-to-save.webp" } },
        stored: { readable: true, present: true, document: { images: { hero: "/old.webp" } } },
        serving: { images: { hero: "/old.webp" } },
      }),
    );
    const hero = row(rows, "hero");
    expect(hero.from).toBe("draft");
    expect(hero.effective).toBe("/about-to-save.webp");
    expect(hero.unsaved).toBe(true);
    expect(hero.serving).toBe("/old.webp");
  });

  it("calls a draft that matches the saved row saved, so nothing reads as pending when it is not", () => {
    const rows = previewRows(
      input({
        draft: { images: { hero: "/same.webp" } },
        stored: { readable: true, present: true, document: { images: { hero: "/same.webp" } } },
      }),
    );
    expect(row(rows, "hero").unsaved).toBe(false);
    expect(summarise(rows).unsaved).toBe(0);
  });

  it("treats clearing a saved field as an unsaved edit", () => {
    const rows = previewRows(
      input({
        draft: { images: { hero: "" } },
        stored: { readable: true, present: true, document: { images: { hero: "/old.webp" } } },
      }),
    );
    expect(row(rows, "hero").read).toBe("blank");
    expect(row(rows, "hero").unsaved).toBe(true);
    expect(row(rows, "hero").effective).toBe("/platform-hero.webp");
  });
});

describe("the saved row and the live site disagree", () => {
  /**
   * The production case, 2026-09-02. Six correct image paths were written
   * into the `brand` row. `dbDocument`'s cache was filled at boot and nothing
   * re-reads a document after boot, so `GET /api/game/config` kept answering
   * with empty strings until a deploy restarted the process.
   */
  const drifted = () =>
    previewRows(
      input({
        stored: { readable: true, present: true, document: { images: { hero: "/saved-today.webp" } } },
        serving: { images: { hero: "" } },
      }),
    );

  it("names the field as stale without calling the save a failure", () => {
    const hero = row(drifted(), "hero");
    expect(hero.read).toBe("set");
    expect(hero.value).toBe("/saved-today.webp");
    expect(hero.stale).toBe(true);
  });

  it("shows both sides, so the founder can see which one is behind", () => {
    const hero = row(drifted(), "hero");
    expect(hero.effective).toBe("/saved-today.webp");
    expect(hero.serving).toBe("/platform-hero.webp");
  });

  it("counts the drifted fields for the banner", () => {
    expect(summarise(drifted()).stale).toBe(1);
    expect(summarise(drifted()).unreadable).toBe(0);
  });

  it("reports no drift when the row and the process agree", () => {
    const rows = previewRows(
      input({
        stored: { readable: true, present: true, document: { images: { hero: "/x.webp" } } },
        serving: { images: { hero: "/x.webp" } },
      }),
    );
    expect(summarise(rows).stale).toBe(0);
  });

  it("does not call an unsaved draft a drift", () => {
    // The draft plane must never reach the staleness comparison, or every
    // keystroke would read as a cache problem.
    const rows = previewRows(
      input({
        draft: { images: { hero: "/typing.webp" } },
        stored: { readable: true, present: true, document: { images: { hero: "/x.webp" } } },
        serving: { images: { hero: "/x.webp" } },
      }),
    );
    expect(row(rows, "hero").stale).toBe(false);
    expect(row(rows, "hero").unsaved).toBe(true);
  });
});
