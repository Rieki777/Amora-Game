// @vitest-environment jsdom
/**
 * WHAT THE WALLET ACTUALLY PRINTS.
 *
 * The reported sentence was "I earned 10 Village Voice and my wallet says
 * 10000". Both halves were true. `token_balances.balance` is an INT, Voice
 * carries decimals 3, so ten Voice is 10000 on the row, and this card rendered
 * `{bal}` straight out of the payload. The Standing chip an inch above it, on
 * the same profile page, read 10, because `loadStanding` has shipped
 * `decimals` since it was written and ProfileSheet divided.
 *
 * WHY A COMPONENT TEST RATHER THAN ONLY A ROUTE TEST. The route test in
 * `server/adminTokens.e2e.test.ts` proves the payload now carries the scale
 * and that the scale produces "10". It cannot prove this card CALLS the
 * formatter: a card that ignored `tokenDecimals` would leave that suite green.
 * So this one asserts on the rendered DOM, which is the thing a member reads.
 *
 * The mocked payload is the real shape of `GET /api/exchange`'s `mine` block,
 * copied from the route handler, with `village-voice` at the decimals its
 * registry row carries.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/modules/ModuleProvider", () => ({
  useModule: () => ({ id: "exchange", lifecycle: "public" }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "usr-ora", name: "Ora" } }),
}));
vi.mock("@/lib/gameApi", () => ({ authToken: () => "a-session" }));
vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/tokens">{children}</a>,
}));

import WalletCard from "./WalletCard";

/** Ten Village Voice and twenty-five credits, exactly as the route ships them. */
const PAYLOAD = {
  mine: {
    balances: { "village-voice": 10_000, credits: 25 },
    tokenNames: { "village-voice": "Village Voice", credits: "Village Credits" },
    tokenDecimals: { "village-voice": 3, credits: 0 },
  },
};

const serve = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => body } as unknown as Response);

describe("the wallet card on a member's own profile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prints ten for ten Village Voice, and never the ledger's ten thousand", async () => {
    vi.stubGlobal("fetch", serve(PAYLOAD));

    render(<WalletCard />);

    // The number the member came to read.
    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());
    // And the one the card used to print. This is the whole defect: if the
    // division is removed, the line above fails and this one passes.
    expect(screen.queryByText("10000")).toBeNull();
    expect(screen.getByText("Village Voice")).toBeInTheDocument();
  });

  it("leaves a token with no decimals exactly as it was", async () => {
    // Credits, gratitude, stay credits and library credits all carry decimals
    // 0. This fix must be invisible to every one of them.
    vi.stubGlobal("fetch", serve(PAYLOAD));

    render(<WalletCard />);

    await waitFor(() => expect(screen.getByText("25")).toBeInTheDocument());
    expect(screen.getByText("Village Credits")).toBeInTheDocument();
  });

  it("shows a fractional balance to its own digits", async () => {
    // A quarter of a Voice is 250 thousandths on the row, and reads 0.25. Not
    // 250, and not "0.250", which reads like a price.
    vi.stubGlobal("fetch", serve({
      mine: {
        balances: { "village-voice": 250 },
        tokenNames: { "village-voice": "Village Voice" },
        tokenDecimals: { "village-voice": 3 },
      },
    }));

    render(<WalletCard />);

    await waitFor(() => expect(screen.getByText("0.25")).toBeInTheDocument());
    expect(screen.queryByText("250")).toBeNull();
  });

  it("falls back to whole units when an older server sends no scale at all", async () => {
    /*
     * DELIBERATE, and the honest answer rather than a guess. A payload with no
     * `tokenDecimals` is a server that predates this field, and the only thing
     * the card knows is the integer it was handed. Inferring decimals from the
     * slug would make the card right about Voice on one deployment and wrong
     * about a fork's own token on the next.
     *
     * It is pinned as a test because it is the one path where the old number
     * comes back, and somebody reading a bug report about 10000 needs to be
     * able to tell "the page forgot to divide" from "the server did not say".
     */
    vi.stubGlobal("fetch", serve({
      mine: {
        balances: { "village-voice": 10_000 },
        tokenNames: { "village-voice": "Village Voice" },
      },
    }));

    render(<WalletCard />);

    await waitFor(() => expect(screen.getByText("10000")).toBeInTheDocument());
  });
});
