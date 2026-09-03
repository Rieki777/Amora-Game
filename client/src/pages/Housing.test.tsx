// @vitest-environment jsdom
/**
 * The housing page, held to the founder's ruling (0131).
 *
 * A VILLAGE THAT HAS NOT DESCRIBED ITS HOMES SHOWS NO TIER SECTION AT ALL.
 * Not a heading over a gap, not an empty grid, not a placeholder card. And a
 * village that HAS described them publishes exactly what was typed: no unit
 * appended, no currency supplied, no figure reformatted.
 *
 * BOTH DIRECTIONS ARE THE TEST. `client/src/lib/housingForm.test.ts` reads
 * this page as text, which catches a literal coming back but cannot see what
 * the browser draws. This file renders it. A suite that only ever sees the
 * populated case would go green on a page that draws "Housing Options" over
 * nothing, which is the state this change exists to produce and the one most
 * likely to look broken.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// framer-motion's `whileInView` reaches for IntersectionObserver, which jsdom
// does not implement. A stub that never fires is right here: these tests ask
// what the page renders, not what it animates on scroll.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);

import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import type { ReactNode } from "react";

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/gameApi", async (importOriginal) => ({
  // The helpers under test are real; only the config reads are stubbed.
  ...(await importOriginal<typeof import("@/lib/gameApi")>()),
  useVillageLinks: () => ({ siteUrl: "", eventsUrl: "", contactEmail: "", mailTo: () => "" }),
}));
vi.mock("@/hooks/useVillageName", () => ({ useVillageName: () => "Willowbrook" }));
vi.mock("@/hooks/useVillageContent", () => ({
  useVillageContent: () => ({ content: null, loading: false, isPlaceholder: true }),
}));

import Housing from "./Housing";

/** What `GET /api/housing/public` answers, with only `homes` varying. */
const answering = (homes: unknown[]) =>
  vi.fn(async () => ({
    ok: true,
    json: async () => ({ entries: [], configured: false, homes }),
  })) as unknown as typeof fetch;

const casita = {
  homeType: "casita",
  name: "Cabina",
  size: "0,5 hectáreas",
  price: "₡45.000.000",
  description: "Two rooms and a covered porch.",
  features: ["Covered patio", "Kitchen, bathroom and a porch"],
};

const renderPage = () =>
  render(
    <Router>
      <Housing />
    </Router>,
  );

afterEach(() => vi.unstubAllGlobals());

describe("a village that has not described its homes", () => {
  beforeEach(() => vi.stubGlobal("fetch", answering([])));

  it("draws no tier section at all, heading included", async () => {
    renderPage();
    // Waited for, not asserted immediately: the read has to have landed, or
    // this passes for the wrong reason on any page at all.
    await waitFor(() => expect(screen.queryByText("Land Share Agreements")).toBeTruthy());
    expect(screen.queryByText("Housing Options")).toBeNull();
  });

  it("draws no empty grid and no Reserve button with nothing behind it", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.queryByText("Land Share Agreements")).toBeTruthy());
    expect(screen.queryByText("Reserve this home")).toBeNull();
    expect(container.querySelector('a[href^="/reserve"]')).toBeNull();
  });

  it("leaves the rest of the page standing", async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText("Land Share Agreements")).toBeTruthy());
    // The hero, the land features, the Land Share explainer and the closing
    // call to action all stay. Only the tier cards are conditional.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Housing at Willowbrook");
    expect(screen.getByText("Mountain Views")).toBeTruthy();
    expect(screen.getByText("Interested in Housing?")).toBeTruthy();
    expect(screen.getByText("Learn About Residency")).toBeTruthy();
  });

  it("names no home type anywhere, so the hero cannot promise one", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.queryByText("Land Share Agreements")).toBeTruthy());
    const text = container.textContent ?? "";
    for (const word of ["Tiny Home", "Casita", "Family Home", "Luxury Villa", "sq ft"]) {
      expect(text.includes(word), `the page still says ${word} with no homes published`).toBe(false);
    }
  });
});

describe("a village that HAS described its homes", () => {
  it("prints a non-imperial size and a non-USD price exactly as typed", async () => {
    vi.stubGlobal("fetch", answering([casita]));
    renderPage();
    await screen.findByText("Cabina");
    // The whole point. Nothing converts, reformats, or appends a unit or a
    // symbol the founder did not type.
    expect(screen.getByText("0,5 hectáreas")).toBeTruthy();
    expect(screen.getByText("₡45.000.000")).toBeTruthy();
  });

  it("draws the heading and the card together", async () => {
    vi.stubGlobal("fetch", answering([casita]));
    renderPage();
    await screen.findByText("Cabina");
    expect(screen.getByText("Housing Options")).toBeTruthy();
    expect(screen.getByText("Two rooms and a covered porch.")).toBeTruthy();
    expect(screen.getByText("Covered patio")).toBeTruthy();
    // A comma inside a feature stays inside it. Splitting on commas would cut
    // this line into three bullets.
    expect(screen.getByText("Kitchen, bathroom and a porch")).toBeTruthy();
  });

  it("links the card to the reservation form under the platform key", async () => {
    vi.stubGlobal("fetch", answering([casita]));
    const { container } = renderPage();
    await screen.findByText("Cabina");
    // The NAME is the village's and the KEY is the contract: a renamed home
    // still reaches the form the server validates against.
    expect(container.querySelector('a[href="/reserve?type=casita"]')).toBeTruthy();
  });

  it("draws nothing for a field the village left blank", async () => {
    vi.stubGlobal(
      "fetch",
      answering([{ ...casita, price: "", description: "", features: [] }]),
    );
    const { container } = renderPage();
    await screen.findByText("Cabina");
    expect(screen.getByText("0,5 hectáreas")).toBeTruthy();
    // No empty price badge, no empty paragraph, no bullet list with no bullets.
    expect(container.querySelector("ul")).toBeNull();
    expect(screen.queryByText("₡45.000.000")).toBeNull();
  });

  it("shows no tier section while the read is still in flight", () => {
    // `unknown` is not `none`. A village that HAS published homes must never
    // flash a missing section on the way to showing them, and a village that
    // has not must never flash four cards.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    renderPage();
    expect(screen.queryByText("Housing Options")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Housing at Willowbrook");
  });

  it("shows no tier section when the read fails", async () => {
    // Fail closed: a network blip must never publish a figure, and there is
    // no figure to publish when nothing arrived.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch);
    renderPage();
    await waitFor(() => expect(screen.queryByText("Land Share Agreements")).toBeTruthy());
    expect(screen.queryByText("Housing Options")).toBeNull();
  });
});
