// @vitest-environment jsdom
/**
 * The founder surface for the homes (0131), rendered.
 *
 * `client/src/lib/housingForm.test.ts` reads this panel as text and checks it
 * still routes through `homeFieldValue` and `homePatch`. That is a source
 * guard, and the file it lives in says in its own words that a source guard
 * is weaker than a behaviour test: the sibling guard on the hamlet list was
 * evaded once by spelling the same defect a different way. This renders the
 * panel, types into it, and reads what went over the wire.
 *
 * The one thing it must never do is convert. Whatever a founder types is what
 * is sent, and this is where that is provable rather than asserted.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import HousingTiersPanel from "./HousingTiersPanel";

/** The four rows the founder read always returns, filled in or not. */
const rows = (over: Record<string, unknown> = {}) =>
  ["tiny-home", "casita", "family-home", "villa"].map((homeType) => ({
    homeType,
    name: null,
    size: null,
    price: null,
    description: null,
    features: null,
    isPublished: false,
    updatedBy: null,
    updatedAt: null,
    ...(homeType === "casita" ? over : {}),
  }));

/** Records every write so a test can read what the panel actually sent. */
function stubFetch(initial: ReturnType<typeof rows>) {
  const writes: Array<{ url: string; body: any }> = [];
  const fake = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      writes.push({ url, body: JSON.parse(String(init.body)) });
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ rows: initial }) };
  });
  vi.stubGlobal("fetch", fake as unknown as typeof fetch);
  return writes;
}

/**
 * The four rows are on screen. Waited for by the BOX COUNT rather than by a
 * name: an unnamed row shows its key as the heading and its key again as the
 * small label beside it, so `findByText("casita")` matches twice and throws.
 */
const loaded = (container: HTMLElement) =>
  waitFor(() => expect(container.querySelectorAll("input, textarea")).toHaveLength(20));

afterEach(() => vi.unstubAllGlobals());

describe("the homes a founder describes", () => {
  it("gives a village with nothing written four empty rows to type into", async () => {
    stubFetch(rows());
    const { container } = render(<HousingTiersPanel password="secret" />);
    await loaded(container);
    // Every row says plainly that it is not on the site yet, so a founder can
    // tell "nothing here" from "something here" at a glance.
    expect(screen.getAllByText("Not shown yet")).toHaveLength(4);
    expect(screen.queryByText("On the housing page")).toBeNull();
  });

  it("shows an empty box for a column nobody filled in", async () => {
    stubFetch(rows());
    const { container } = render(<HousingTiersPanel password="secret" />);
    await loaded(container);
    const boxes = Array.from(container.querySelectorAll("input, textarea"));
    expect(boxes.length).toBe(20);
    // Never the word null, and never a stand-in a blur would then write back.
    expect(boxes.every((b) => (b as HTMLInputElement).value === "")).toBe(true);
  });

  it("says which homes are on the site, using the server's own answer", async () => {
    stubFetch(rows({ name: "Cabina", size: "45 m2", isPublished: true }));
    const { container } = render(<HousingTiersPanel password="secret" />);
    await loaded(container);
    expect(screen.getAllByText("On the housing page")).toHaveLength(1);
    expect(screen.getAllByText("Not shown yet")).toHaveLength(3);
  });

  it("sends what the founder typed, with no unit and no currency added", async () => {
    const writes = stubFetch(rows());
    const { container } = render(<HousingTiersPanel password="secret" />);
    await loaded(container);
    // The casita row's boxes: name, size, price, description, features.
    const boxes = container.querySelectorAll("input, textarea");
    const size = boxes[6] as HTMLInputElement;
    fireEvent.blur(size, { target: { value: "0,5 hectáreas" } });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.url).toBe("/api/housing/home-types/casita");
    // One field, and exactly the characters that were typed.
    expect(writes[0]!.body).toEqual({ size: "0,5 hectáreas" });
  });

  it("sends null from an emptied box, which is how a home is unpublished", async () => {
    const writes = stubFetch(rows({ name: "Cabina", size: "45 m2", isPublished: true }));
    const { container } = render(<HousingTiersPanel password="secret" />);
    await loaded(container);
    const name = container.querySelectorAll("input, textarea")[5] as HTMLInputElement;
    expect(name.value).toBe("Cabina");
    fireEvent.blur(name, { target: { value: "" } });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toEqual({ name: null });
  });

  it("sends nothing at all when a founder only tabbed through a box", async () => {
    // A save that changes nothing still stamps updated_by and still races
    // whatever another surface is doing.
    const writes = stubFetch(rows({ name: "Cabina", size: "45 m2", isPublished: true }));
    const { container } = render(<HousingTiersPanel password="secret" />);
    await loaded(container);
    const name = container.querySelectorAll("input, textarea")[5] as HTMLInputElement;
    fireEvent.blur(name, { target: { value: "Cabina" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(writes).toHaveLength(0);
  });
});
