/**
 * WHAT THE ALARM DID, ASSERTED.
 *
 * `reportError` used to return `void`, and a caller could not tell a delivered
 * alert from an alert that reached nobody. That distinction is the whole point
 * on the boot path: a village whose database has just died cannot reach its own
 * admin table, so the webhook is the only sink left, and on a fresh instance
 * `ERROR_WEBHOOK_URL` is unset, which means the honest answer is "nobody was
 * told" and the process should say so rather than exit implying otherwise.
 *
 * The webhook is mocked here rather than dialled. The real dialler
 * (`guardedFetchJson`) pins the resolved IP and refuses private ranges, so
 * there is no loopback collector a test could stand up; asserting against the
 * seam is the only way to prove the POST fires without asking a stranger's
 * server whether it arrived.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const guardedFetchJson = vi.fn();
vi.mock("./toolcheck", () => ({ guardedFetchJson: (...a: any[]) => guardedFetchJson(...a) }));

const { reachedSomebody, reportError, reportErrorWithin, wireErrorReporting } = await import("./errors");

const WEBHOOK = "https://collector.example/hook";

describe("error delivery is reported, not assumed", () => {
  let priorWebhook: string | undefined;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    priorWebhook = process.env.ERROR_WEBHOOK_URL;
    guardedFetchJson.mockReset();
    guardedFetchJson.mockResolvedValue({});
    // The reporter logs every report; the log is the point, not the noise.
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (priorWebhook === undefined) delete process.env.ERROR_WEBHOOK_URL;
    else process.env.ERROR_WEBHOOK_URL = priorWebhook;
    errSpy.mockRestore();
    wireErrorReporting({ notifyAdmins: async () => {}, instanceLabel: "village" });
  });

  it("says nobody was told when there is no webhook and the admin sink is dead", async () => {
    delete process.env.ERROR_WEBHOOK_URL;
    wireErrorReporting({
      notifyAdmins: async () => { throw new Error("ECONNREFUSED"); },
      instanceLabel: "a village",
    });
    const d = await reportError(new Error("no database at boot"), { where: "the village's boot" });
    expect(d.admins).toBe("failed");
    expect(d.webhook).toBe("not configured");
    expect(reachedSomebody(d)).toBe(false);
    expect(guardedFetchJson).not.toHaveBeenCalled();
  });

  it("still reaches the webhook when the admin sink needs a database that is gone", async () => {
    process.env.ERROR_WEBHOOK_URL = WEBHOOK;
    wireErrorReporting({
      notifyAdmins: async () => { throw new Error("ECONNREFUSED"); },
      instanceLabel: "a village",
    });
    const d = await reportError(new Error("migrations could not apply"), { where: "the village's boot" });
    expect(d.admins).toBe("failed");
    expect(d.webhook).toBe("sent");
    expect(reachedSomebody(d)).toBe(true);
    const [url, timeout, opts] = guardedFetchJson.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    expect(timeout).toBeLessThanOrEqual(5000);
    expect(opts.method).toBe("POST");
    expect(String(opts.body.text)).toContain("migrations could not apply");
    expect(opts.body.where).toBe("the village's boot");
  });

  it("reports a refused webhook as failed rather than as sent", async () => {
    process.env.ERROR_WEBHOOK_URL = WEBHOOK;
    guardedFetchJson.mockRejectedValue(new Error("405"));
    wireErrorReporting({ notifyAdmins: async () => {}, instanceLabel: "a village" });
    const d = await reportError(new Error("a distinct failure for the webhook case"), { where: "the boot" });
    expect(d.admins).toBe("sent");
    expect(d.webhook).toBe("failed");
  });

  it("gives a dying process a deadline instead of a hang", async () => {
    process.env.ERROR_WEBHOOK_URL = WEBHOOK;
    // The failure that most needs reporting is the one where the admin sink is
    // a write to a database that will never answer. Without a deadline the
    // process waits on it and the restart policy eats the outage silently.
    wireErrorReporting({
      notifyAdmins: () => new Promise<void>(() => {}),
      instanceLabel: "a village",
    });
    const started = Date.now();
    const out = await reportErrorWithin(150, new Error("a hang nobody should wait on"), { where: "the boot" });
    expect(out).toBe("timed out");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("does not treat a suppressed repeat as a delivery", async () => {
    process.env.ERROR_WEBHOOK_URL = WEBHOOK;
    wireErrorReporting({ notifyAdmins: async () => {}, instanceLabel: "a village" });
    const err = new Error("the same failure twice inside the window");
    const first = await reportError(err, { where: "the boot" });
    expect(first.webhook).toBe("sent");
    const second = await reportError(err, { where: "the boot" });
    expect(second.suppressed).toBe(true);
    expect(reachedSomebody(second)).toBe(false);
    expect(guardedFetchJson).toHaveBeenCalledTimes(1);
  });
});
