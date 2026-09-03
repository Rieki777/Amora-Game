// @vitest-environment jsdom
/**
 * The reservation form, held to the same ruling as the housing page (0131).
 *
 * This page carried a SECOND COPY of the four tiers: a label and a size for
 * each key, worded differently from the copy on Housing.tsx for identical
 * figures. So a village that had never described a home still offered four,
 * and a person could ask for one against another village's square footage.
 *
 * BOTH DIRECTIONS. The empty case is the one this change exists to produce
 * and the one a populated-only suite cannot see.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import type { ReactNode } from "react";

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import ReserveHome from "./ReserveHome";

const answering = (homes: unknown[]) =>
  vi.fn(async () => ({
    ok: true,
    json: async () => ({ entries: [], configured: false, homes }),
  })) as unknown as typeof fetch;

const casita = {
  homeType: "casita",
  name: "Cabina",
  size: "45 m2",
  price: "ask us",
  description: "",
  features: [],
};

/** The page reads the query string at first render, so set it before rendering. */
const at = (search: string) => {
  window.history.replaceState({}, "", `/reserve${search}`);
};

const renderPage = () =>
  render(
    <Router>
      <ReserveHome />
    </Router>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  at("");
});

describe("a village that has published no homes", () => {
  it("says the homes are not listed yet rather than offering four nobody chose", async () => {
    vi.stubGlobal("fetch", answering([]));
    renderPage();
    await screen.findByText("The homes are not listed yet");
    expect(screen.queryByText("Which home?")).toBeNull();
    expect(screen.queryByRole("button", { name: /Request this home/ })).toBeNull();
  });

  it("names no home type anywhere on the page", async () => {
    vi.stubGlobal("fetch", answering([]));
    const { container } = renderPage();
    await screen.findByText("The homes are not listed yet");
    const text = container.textContent ?? "";
    for (const word of ["Tiny Home", "Casita", "Family Home", "Villa", "sq ft"]) {
      expect(text.includes(word), `the page still offers ${word} with no homes published`).toBe(false);
    }
  });

  it("points back at the housing page rather than leaving a dead end", async () => {
    vi.stubGlobal("fetch", answering([]));
    const { container } = renderPage();
    await screen.findByText("The homes are not listed yet");
    expect(container.querySelector('a[href="/housing"]')).toBeTruthy();
  });

  it("does NOT show that state while the read is still in flight", () => {
    // `unknown` is not `none`. Announcing "no homes yet" for the length of a
    // round trip and then drawing four is telling a visitor something false.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    renderPage();
    expect(screen.queryByText("The homes are not listed yet")).toBeNull();
    expect(screen.getByText("Loading the homes.")).toBeTruthy();
  });
});

describe("a village that HAS published its homes", () => {
  it("offers the village's own names and prints its words exactly", async () => {
    vi.stubGlobal("fetch", answering([casita]));
    renderPage();
    await screen.findByText("Cabina");
    expect(screen.getByText("45 m2")).toBeTruthy();
    expect(screen.getByText("ask us")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Request this home/ })).toBeTruthy();
  });

  it("preselects the home a link asked for", async () => {
    at("?type=casita");
    vi.stubGlobal("fetch", answering([casita]));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Cabina/ }).getAttribute("aria-pressed")).toBe("true"),
    );
  });

  it("preselects nothing for a home the founder has since cleared", async () => {
    // A link already sent must not preselect a home this village no longer
    // offers: the server refuses that key and the person would meet a refusal
    // on the last click, having been shown the home as available all the way.
    at("?type=villa");
    vi.stubGlobal("fetch", answering([casita]));
    renderPage();
    await screen.findByText("Cabina");
    expect(screen.getByRole("button", { name: /Cabina/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("draws nothing for a field the village left blank", async () => {
    vi.stubGlobal("fetch", answering([{ ...casita, price: "" }]));
    renderPage();
    await screen.findByText("Cabina");
    expect(screen.getByText("45 m2")).toBeTruthy();
    expect(screen.queryByText("ask us")).toBeNull();
  });
});
