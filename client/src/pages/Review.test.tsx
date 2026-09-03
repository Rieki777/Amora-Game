// @vitest-environment jsdom
/**
 * THREE STATES THAT MUST NEVER COLLAPSE INTO EACH OTHER.
 *
 * "A read failure renders as an error and never as an empty queue" is half of
 * acceptance test 2 in the work order, and it is the half a server test cannot
 * reach. `server/review.routes.e2e.test.ts` proves the other half: the route
 * refuses with a status and a reason and never with a 200 carrying an empty
 * list, which is what makes it POSSIBLE for a page to tell them apart. This
 * file proves the page actually does.
 *
 * The harm is stated inline on the draft queue in Admin.tsx, which got this
 * right first and is where the pattern comes from: a queue of proposals
 * sitting on the server while the page says positively that there is nothing
 * to review is a governance failure and not a cosmetic one. A steward who sees
 * "Nothing waiting" stops looking.
 *
 * `Layout` is mocked to a passthrough. This file's subject is the queue's
 * three states, not the site shell around them.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import type { ReactNode } from "react";

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));
vi.mock("@/lib/gameApi", () => ({
  authToken: () => "a-token",
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import Review from "./Review";

const EMPTY = {
  batches: [],
  quests: [],
  drops: [],
  counts: { proposals: 0, quests: 0 },
};

function answerWith(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

function renderReview() {
  return render(
    <Router>
      <Review />
    </Router>,
  );
}

describe("the review queue tells three states apart", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says NOTHING WAITING only when the server actually said so", async () => {
    answerWith(200, EMPTY);
    renderReview();
    await waitFor(() => expect(screen.getByText("Nothing waiting")).toBeTruthy());
  });

  it("renders a failed read as an error, and says the queue may not be empty", async () => {
    answerWith(500, { error: "the database went away" });
    renderReview();
    await waitFor(() => expect(screen.getByText("The queue did not load")).toBeTruthy());
    // The exact promise the draft queue makes, kept here.
    expect(screen.getByText(/this is not an empty queue/i)).toBeTruthy();
    expect(screen.queryByText("Nothing waiting")).toBeNull();
  });

  it("renders a network failure the same way, and never as an empty queue", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    renderReview();
    await waitFor(() => expect(screen.getByText("The queue did not load")).toBeTruthy());
    expect(screen.queryByText("Nothing waiting")).toBeNull();
  });

  it("renders a refusal as a refusal, which is a different sentence again", async () => {
    // A member without the capability. NOT an error and NOT an empty queue:
    // there may be plenty waiting and this person may not read it, and saying
    // either of the other two things would be false.
    answerWith(403, { error: "auth_required" });
    renderReview();
    await waitFor(() => expect(screen.getByText("This queue is not open to you yet")).toBeTruthy());
    expect(screen.queryByText("Nothing waiting")).toBeNull();
    expect(screen.queryByText("The queue did not load")).toBeNull();
  });

  it("prints the dropped count out loud, which is the whole story on an empty queue", async () => {
    // Copied from the Calls tab, which prints its own drop count on purpose.
    // Without this, "nothing arrived today" and "everything arrived and all of
    // it was refused for carrying an email address" render identically.
    answerWith(200, {
      ...EMPTY,
      drops: [{ moduleId: "saberra", reason: "contained_an_email", dropped: 4, lastAt: null }],
    });
    renderReview();
    await waitFor(() =>
      expect(screen.getByText(/4 record\(s\) were refused on arrival/i)).toBeTruthy(),
    );
    expect(screen.getByText(/carried an email address/i)).toBeTruthy();
    // And it still says the queue itself is empty, because it is. The two
    // facts are both true and neither stands in for the other.
    expect(screen.getByText("Nothing waiting")).toBeTruthy();
  });

  it("puts the editable payload on screen, because that is what the page is for", async () => {
    answerWith(200, {
      ...EMPTY,
      counts: { proposals: 1, quests: 0 },
      batches: [
        {
          batchId: "b1",
          moduleId: "saberra",
          receivedAt: "2026-08-14T10:00:00.000Z",
          items: [
            {
              id: "p1",
              batchId: "b1",
              moduleId: "saberra",
              kind: "role.proposed",
              payload: { name: "Water Steward" },
              quote: "Ada said the well needs somebody.",
              sourceRef: "meeting#42",
              sourceOccurredAt: "2026-08-14T09:00:00.000Z",
              evidence: "quoted",
              audience: "steward",
              trustTier: "extracted_unreviewed",
              confidence: null,
              significance: null,
              subjectRef: null,
              receivedAt: "2026-08-14T10:00:00.000Z",
              correlationId: null,
            },
          ],
        },
      ],
    });
    renderReview();
    // The textarea is the redaction path and the centre of the design.
    const box = await screen.findByLabelText(/Change anything before you accept it/i);
    expect((box as HTMLTextAreaElement).value).toContain("Water Steward");
    // The evidence, quoted verbatim, the way the Calls tab renders it.
    expect(screen.getByText(/Ada said the well needs somebody/)).toBeTruthy();
    // Not stated, never zero.
    expect(screen.getByText(/confidence not stated/i)).toBeTruthy();
    // One decision for the batch, beside the per-item ones.
    expect(screen.getByText(/Accept all 1, with my edits/i)).toBeTruthy();
  });
});
