// @vitest-environment jsdom
/**
 * Register carries the same amber CTA link as Login, plus the four PATHS
 * pills - "Investor", "Village Steward", "Resident", "Prosperity Creator" -
 * which this lane also fixed after finding the SAME defect shape live on
 * this page (text-amber and text-teal/text-teal-light used as small
 * foreground text, never checked as text by shared/brandTokens.ts - see the
 * PATHS array's own comments for the measured before/after ratios). Both
 * fixes get a regression guard here, same reasoning as Login.test.tsx.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import type { ReactNode } from "react";

const registerMock = vi.fn();

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ register: registerMock }),
}));

import Register from "./Register";

function renderRegister() {
  return render(
    <Router>
      <Register />
    </Router>,
  );
}

describe("Register", () => {
  it("labels every field, including the two password fields separately", () => {
    renderRegister();
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("refuses to submit when the passwords do not match, without calling register", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/^name$/i), "Rye");
    await user.type(screen.getByLabelText(/^email$/i), "rye@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter2");
    await user.type(screen.getByLabelText(/confirm password/i), "different");
    await user.click(screen.getByRole("button", { name: /investor/i }));
    await user.click(screen.getByRole("button", { name: /create account/i }));

    // findByRole("alert"), not findByText: the box now carries role="alert",
    // the same as Login.tsx's, so the refusal is SPOKEN and not merely
    // painted red. Asserting the role is what makes that a guarantee - the
    // text assertion this replaced passed just as happily while a screen
    // reader said nothing.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/passwords do not match/i);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("refuses to submit with no path chosen, without calling register", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/^name$/i), "Rye");
    await user.type(screen.getByLabelText(/^email$/i), "rye@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter2");
    await user.type(screen.getByLabelText(/confirm password/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    // Same role="alert" guarantee as above.
    expect(await screen.findByRole("alert")).toHaveTextContent(/select at least one path/i);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("speaks a registration the server turned down, not just paints it red", async () => {
    // The third thing that lands in that box, and the only one that is not a
    // client-side guard: a rejected register(). Same role, same box.
    registerMock.mockRejectedValueOnce(new Error("That email is already here"));
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/^name$/i), "Rye");
    await user.type(screen.getByLabelText(/^email$/i), "rye@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter2");
    await user.type(screen.getByLabelText(/confirm password/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /investor/i }));
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already here/i);
  });

  it("submits name, email, password and the chosen paths together", async () => {
    registerMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/^name$/i), "Rye");
    await user.type(screen.getByLabelText(/^email$/i), "rye@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter2");
    await user.type(screen.getByLabelText(/confirm password/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /investor/i }));
    await user.click(screen.getByRole("button", { name: /village steward/i }));
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(registerMock).toHaveBeenCalledWith("Rye", "rye@example.com", "hunter2", ["investor", "steward"]);
  });

  it("keeps the Sign In link off the failing text-amber token (contrast regression guard)", () => {
    renderRegister();
    const signIn = screen.getByRole("link", { name: /sign in/i });
    const classes = signIn.className.split(/\s+/);
    expect(classes).toContain("text-amber-ink");
    expect(classes).not.toContain("text-amber");
  });

  it("keeps the path pills off text-amber/text-teal/text-teal-light as foreground text (contrast regression guard)", () => {
    // Measured before this lane's fix: text-amber 1.43:1, text-teal (soft)
    // 2.33:1, text-teal-light (mid) 4.20:1 - all below AA's 4.5:1 floor, on
    // this exact page's tint. text-amber-ink and text-teal-deep are the
    // replacements (4.90:1 and 9.5+:1 respectively). This only checks the
    // classes present on the button, not a live contrast computation - the
    // computation lives in shared/brandTokens.ts and this lane's report.
    renderRegister();
    // Unanchored: the accessible name is the whole button (label AND
    // description text), not the label alone.
    for (const name of [/investor/i, /village steward/i, /^resident\b/i, /prosperity creator/i]) {
      const pill = screen.getByRole("button", { name });
      const classes = pill.className.split(/\s+/);
      expect(classes, `${name} pill`).not.toContain("text-amber");
      expect(classes, `${name} pill`).not.toContain("text-teal");
      expect(classes, `${name} pill`).not.toContain("text-teal-light");
    }
  });
});
