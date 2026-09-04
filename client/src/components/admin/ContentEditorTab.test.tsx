// @vitest-environment jsdom
/**
 * The content editor must never treat a failed read as the village's content.
 *
 * WHAT THE FOUNDER REPORTED. Admin, Content, "Legal & Jurisdiction Notices"
 * and "Love Letter Covenant" both opened with a box containing exactly
 * `{"error": "Section not found"}`, on a village that had just been stood up.
 *
 * WHAT WAS ACTUALLY HAPPENING. `load()` read the response body with no status
 * check. `GET /api/content/:section` answers 404 for a section this village
 * has never saved, which is the correct answer and the ordinary state of every
 * fresh instance, so the 404's own body landed in the editor dressed as
 * content.
 *
 * WHY THIS IS A DATA-LOSS TEST AND NOT A COSMETIC ONE. The box is what
 * `save()` sends, and `PUT /api/admin/content/:section` assigns
 * `content[section] = req.body` with nothing checking the shape. Pressing Save
 * Changes therefore published `{"error":"Section not found"}` as the village's
 * real content, after which the section answered 200 with that object forever.
 * That is strictly worse than the 404 it replaced: `useVillageContent` reads a
 * 404 as `isPlaceholder` and renders a neutral placeholder, and a 200 defeats
 * that fallback entirely. Verified against a running server before this test
 * was written: the PUT returned `{"success":true}` and the public route then
 * served the error object with status 200.
 *
 * WHAT THE ASSERTIONS READ. The OUTCOME, twice over: what ends up in the box a
 * founder is about to save, and whether a PUT was issued at all. A test that
 * only checked the box would pass against a version that displays nothing and
 * still writes rubbish on Save.
 *
 * THESE TESTS WERE RED FIRST. Run against the unguarded `load()`, the first
 * expectation failed with the box holding the error envelope, and the
 * no-PUT expectation failed with one recorded call carrying it.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContentEditorTab } from "./Admin";

/**
 * Every write the component attempts, in order. The point of the suite is
 * mostly what is NOT in here, so it records the method and the parsed body
 * rather than a count.
 */
type Write = { path: string; body: unknown };

/**
 * `status` is per section, so one stub covers all three cases the editor has
 * to tell apart: a section nobody has saved (404), a section that exists
 * (200), and a read that failed for some other reason (500). The third is the
 * one the 404 handling must not swallow.
 */
const stubFetch = (statusBySection: Record<string, number>, writes: Write[]) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: any, init?: any) => {
      const path = String(url);
      if (init?.method === "PUT") {
        writes.push({ path, body: JSON.parse(init.body) });
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      const section = path.split("/").pop() ?? "";
      const status = statusBySection[section] ?? 404;
      if (status === 404) {
        // The real body, copied from server/index.ts. Using the real one
        // matters: a stub that answered 404 with `{}` would pass against the
        // very bug this file exists to catch.
        return { ok: false, status: 404, json: async () => ({ error: "Section not found" }) };
      }
      if (status >= 400) {
        return { ok: false, status, json: async () => ({ error: "boom" }) };
      }
      return { ok: true, status: 200, json: async () => ({ opening: "already saved" }) };
    }),
  );
};

const box = () => screen.getByRole("textbox") as HTMLTextAreaElement;

describe("the content editor never offers a failed read as content", () => {
  let writes: Write[];
  beforeEach(() => { writes = []; });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("opens an unsaved object section as an empty document, not as the 404 body", async () => {
    stubFetch({ covenant: 404 }, writes);
    render(<ContentEditorTab password="secret" sectionKey="covenant" sectionLabel="Love Letter Covenant" />);

    await waitFor(() => expect(box().value).not.toBe(""));
    expect(box().value).not.toContain("Section not found");
    expect(JSON.parse(box().value)).toEqual({});
  });

  it("opens an unsaved CARD section as an empty array, so the friendly editor still appears", async () => {
    /*
     * The shape is load-bearing. The team card editor only renders when the
     * parsed document is an array, so handing it `{}` would drop a founder
     * back to raw JSON on the one section that has a friendly editor. Before
     * the fix this section held the error OBJECT, which is why a fresh
     * village never saw the card editor at all.
     */
    stubFetch({ team: 404 }, writes);
    render(<ContentEditorTab password="secret" sectionKey="team" sectionLabel="Team Page" />);

    await waitFor(() => expect(box().value).not.toBe(""));
    expect(JSON.parse(box().value)).toEqual([]);
    expect(screen.getByText(/Add a team member/i)).toBeTruthy();
  });

  it("leaves a section that HAS been saved exactly as the server sent it", async () => {
    // The guard must not eat real content on its way past.
    stubFetch({ covenant: 200 }, writes);
    render(<ContentEditorTab password="secret" sectionKey="covenant" sectionLabel="Love Letter Covenant" />);

    await waitFor(() => expect(box().value).toContain("already saved"));
    expect(JSON.parse(box().value)).toEqual({ opening: "already saved" });
  });

  it("refuses to publish an error envelope, and sends nothing when it refuses", async () => {
    const user = userEvent.setup();
    stubFetch({ covenant: 404 }, writes);
    render(<ContentEditorTab password="secret" sectionKey="covenant" sectionLabel="Love Letter Covenant" />);
    await waitFor(() => expect(box().value).not.toBe(""));

    // However the envelope reaches the box (a paste, an older build, a
    // transient failure), saving it would publish it.
    await user.clear(box());
    await user.type(box(), '{{"error":"Section not found"}');
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    expect(writes, "an error envelope was PUT to the village").toHaveLength(0);
    expect(screen.getByRole("alert").textContent).toContain("not content");
  });

  it("blocks saving entirely when the read failed for a reason that is not 404", async () => {
    /*
     * A 404 is a SUCCESSFUL read establishing the section is empty, so an
     * empty document is safe to save over it. A 500 establishes nothing. The
     * two must not be handled alike: offering an empty document after a 500
     * invites a founder to overwrite real content with a blank.
     */
    const user = userEvent.setup();
    stubFetch({ legal: 500 }, writes);
    render(<ContentEditorTab password="secret" sectionKey="legal" sectionLabel="Legal & Jurisdiction Notices" />);

    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.getAllByRole("alert")[0].textContent).toContain("could not be read");

    await user.click(screen.getByRole("button", { name: /Save Changes/i }));
    expect(writes, "a save was sent on top of an unknown current state").toHaveLength(0);
  });
});
