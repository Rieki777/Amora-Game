// @vitest-environment jsdom
/**
 * The first test any admin tab has ever had.
 *
 * HandoverTab was moved out of client/src/pages/Admin.tsx unchanged, and the
 * point of a move test is not to re-specify the component: it is to prove that
 * the three things a move can silently break did not break. All three were
 * invisible before the move, because an 11,000-line file with no component
 * test could not be asked any of them.
 *
 *   1. It still renders. A module boundary is a new place for a missing import
 *      to hide, and a missing import in JSX throws at render, not at build.
 *   2. It still reaches the right route with the right credential. `API_BASE`
 *      and `authHeaders` now cross a file boundary to get here, so the Bearer
 *      header is the single most load-bearing thing to pin.
 *   3. It still survives a server that says no. The tab's own loader swallows
 *      a failed response into `null` and renders the intro anyway, which is a
 *      deliberate behaviour (a founder who cannot load their powers should
 *      still be told what this screen is for) and exactly the sort of quiet
 *      thing a refactor drops.
 *
 * `fetch` is stubbed rather than run against a server: what is under test is
 * this component's wiring, and the route behind it has its own server tests.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import HandoverTab from "./HandoverTab";

const PAYLOAD = {
  roles: [{ id: "r1", name: "Keeper of the Gate", isExample: false, capabilities: ["membership.admit"] }],
  powers: [
    {
      capability: "membership.admit",
      title: "Who joins the village",
      surface: "The membership queue",
      consequence: "let somebody in",
      heldBy: null,
    },
  ],
};

const renderTab = () => render(<Router><HandoverTab password="secret" /></Router>);

describe("HandoverTab", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => PAYLOAD })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders the handover screen and the powers the server returned", async () => {
    renderTab();
    expect(await screen.findByText("The handover")).toBeInTheDocument();
    expect(await screen.findByText("Who joins the village")).toBeInTheDocument();
    expect(await screen.findByText("membership.admit")).toBeInTheDocument();
  });

  it("asks the holding route for this village's powers, carrying the admin token", async () => {
    renderTab();
    await screen.findByText("The handover");
    const calls = (globalThis.fetch as unknown as { mock: { calls: any[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe("/api/admin/capabilities/holding");
    // The whole reason this assertion exists: API_BASE and authHeaders now
    // live in ./adminApi rather than beside the component.
    expect(init.headers.Authorization).toBe("Bearer secret");
  });

  it("still says what the screen is for when the server refuses the load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "auth_required" }) })),
    );
    renderTab();
    expect(await screen.findByText("The handover")).toBeInTheDocument();
    expect(screen.queryByText("Who joins the village")).not.toBeInTheDocument();
  });

  it("points members at the page that says the same thing in their own words", async () => {
    renderTab();
    const link = await screen.findByRole("link", { name: "What this village looks after" });
    expect(link).toHaveAttribute("href", "/powers");
  });
});
