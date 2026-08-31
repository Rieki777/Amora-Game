/**
 * WHAT THIS SUITE PROVES, AND THE ONE HOP IT CANNOT.
 *
 * Everything here runs against a REAL `http.Server` on a real port with real
 * sockets. Nothing about the drain is simulated: an actual in-flight request
 * is actually still open when the shutdown starts, and the assertion is on the
 * bytes the client received.
 *
 * The hop it cannot cover is the operating system delivering SIGTERM. Node on
 * Windows terminates the target process unconditionally for SIGTERM: measured
 * on this machine, a listener registered in a child process never ran, and
 * neither did one registered for a self-kill. So the wiring is proven by
 * measuring the listener count, and the behaviour behind the listener is
 * proven by calling it. On Linux, which is what this deploys to, the two
 * halves meet. Saying that out loud is the point: a suite that quietly stubbed
 * `process.kill` would look like it covered more and cover less.
 */
import http from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DRAIN_MS,
  gracefulShutdown,
  installShutdownHandlers,
  isShuttingDown,
  resetShutdownStateForTests,
} from "./errors";

let server: http.Server | undefined;
let port = 0;

/** A real listening server whose one route takes `delayMs` to answer. */
async function listen(handler: http.RequestListener): Promise<void> {
  server = http.createServer(handler);
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
  port = (server!.address() as { port: number }).port;
}

/** A plain fetch that reports how it failed rather than throwing it away. */
async function get(path: string): Promise<{ status: number; body: string } | { error: string }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`); // module-review-ok: a test client dialling its own throwaway server on localhost
    return { status: res.status, body: await res.text() };
  } catch (e) {
    return { error: String((e as any)?.cause?.code ?? (e as any)?.message ?? e) };
  }
}

beforeEach(() => {
  resetShutdownStateForTests();
});

afterEach(() => {
  server?.closeAllConnections?.();
  server?.close();
  server = undefined;
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
});

describe("the wiring", () => {
  it("goes from no SIGTERM handler at all to one, which is the whole defect", () => {
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    // THE BEFORE. This is what the process shipped as: `installCrashHandlers`
    // registers `unhandledRejection` and `uncaughtException` and stops there,
    // so SIGTERM took Node's default, which is to terminate immediately.
    expect(process.listenerCount("SIGTERM")).toBe(0);
    expect(process.listenerCount("SIGINT")).toBe(0);

    installShutdownHandlers({ server: { close: (cb) => cb?.() }, exit: () => {} });

    expect(process.listenerCount("SIGTERM")).toBe(1);
    expect(process.listenerCount("SIGINT")).toBe(1);
  });

  it("a second signal exits at once instead of starting a second drain", async () => {
    let exits: number[] = [];
    let closeCalls = 0;
    installShutdownHandlers({
      server: {
        // Never calls back, so the first drain is still running when the
        // second signal arrives.
        close: () => { closeCalls += 1; },
      },
      drainMs: 5_000,
      exit: (code) => exits.push(code),
    });

    process.emit("SIGTERM" as never);
    await new Promise((r) => setTimeout(r, 20));
    expect(isShuttingDown()).toBe(true);
    expect(closeCalls).toBe(1);

    process.emit("SIGTERM" as never);
    // Impatience is answered: exit 1, now, and no second close.
    expect(exits).toEqual([1]);
    expect(closeCalls).toBe(1);
  });
});

describe("a request that is in flight when the signal arrives", () => {
  it("finishes, with its whole body, and the process then exits", async () => {
    let released: (() => void) | undefined;
    await listen((_req, res) => {
      // Held open until the test lets go, so the request is provably still
      // in flight at the moment shutdown begins.
      released = () => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("the whole answer, all of it");
      };
    });

    const inFlight = get("/slow");
    // Wait until the server has actually received it.
    for (let i = 0; i < 100 && !released; i++) await new Promise((r) => setTimeout(r, 10));
    expect(released, "the request reached the handler").toBeTruthy();

    const exits: number[] = [];
    const shutdown = gracefulShutdown(
      { server: server!, drainMs: 5_000, exit: (c) => exits.push(c) },
      "SIGTERM",
    );

    // The connection is still open and the handler still owes an answer.
    await new Promise((r) => setTimeout(r, 50));
    released!();

    const startedAt = Date.now();
    const outcome = await shutdown;
    const answer = await inFlight;
    expect(answer).toEqual({ status: 200, body: "the whole answer, all of it" });
    expect(outcome.forced).toBe(false);
    expect(exits).toEqual([0]);
    // And it did not sit on the socket after the answer left. Without the
    // repeated idle sweep this measured just over three seconds for a request
    // that was finished: the socket went idle a tick after the one-shot sweep
    // and nothing released it. A deploy pays that per keep-alive client.
    expect(Date.now() - startedAt).toBeLessThan(1_500);
  });

  it("is SEVERED without the drain, which is what the default handler did", async () => {
    // The negative control, on the same harness and the same client. Node's
    // default SIGTERM action terminates the process, so every open socket dies
    // where it stands; `closeAllConnections` is the closest a live process can
    // come to that, and it is the behaviour the fix replaces.
    let arrived = false;
    await listen((_req, _res) => {
      arrived = true;
      /* never answers: the reply is still owed when the socket is cut */
    });

    const inFlight = get("/slow");
    for (let i = 0; i < 100 && !arrived; i++) await new Promise((r) => setTimeout(r, 10));
    expect(arrived, "the request reached the handler").toBe(true);

    server!.closeAllConnections!();
    const answer = await inFlight;
    expect(answer).not.toHaveProperty("status");
    expect(answer).toHaveProperty("error");
  });
});

describe("the bound", () => {
  it("stops accepting new connections the moment shutdown starts", async () => {
    await listen((_req, res) => res.end("served"));
    // Prove the server was answering first, so the refusal below means the
    // shutdown did it rather than the port never having worked.
    expect(await get("/before")).toEqual({ status: 200, body: "served" });

    const exits: number[] = [];
    const shutdown = gracefulShutdown(
      { server: server!, drainMs: 2_000, exit: (c) => exits.push(c) },
      "SIGTERM",
    );
    await shutdown;

    const after = await get("/after");
    expect(after).toHaveProperty("error");
  });

  it("exits at the deadline rather than waiting forever, and SAYS it forced", async () => {
    let arrived = false;
    await listen((_req, _res) => {
      arrived = true;
      /* an answer that never comes: a handler wedged on a dead upstream */
    });
    const stuck = get("/never");
    // Wait for the socket to actually exist. Without this the shutdown races
    // the connect, `server.close()` calls back on an empty server, and the
    // test passes for the wrong reason: it measured nothing.
    for (let i = 0; i < 100 && !arrived; i++) await new Promise((r) => setTimeout(r, 10));
    expect(arrived, "the wedged request reached the handler").toBe(true);

    const exits: number[] = [];
    const started = Date.now();
    const outcome = await gracefulShutdown(
      { server: server!, drainMs: 300, exit: (c) => exits.push(c) },
      "SIGTERM",
    );
    const elapsed = Date.now() - started;

    // The whole point: it ENDED. A polite wait with no bound is the same
    // outcome as no handler at all, reached more slowly.
    expect(outcome.forced).toBe(true);
    expect(exits).toEqual([0]);
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(3_000);
    // And it did not pretend the severed request was a clean drain.
    expect(await stuck).toHaveProperty("error");
  });

  it("cuts idle keep-alive sockets, which is what makes a drain terminate at all", async () => {
    await listen((_req, res) => res.end("served"));
    const agent = new http.Agent({ keepAlive: true });
    await new Promise<void>((resolve, reject) => {
      const req = http.get({ port, host: "127.0.0.1", path: "/one", agent }, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve());
      });
      req.on("error", reject);
    });
    // The socket is now idle and OPEN. `server.close()` on its own waits for
    // it, so a drain without closeIdleConnections would run the full budget.
    const started = Date.now();
    const outcome = await gracefulShutdown(
      { server: server!, drainMs: 4_000, exit: () => {} },
      "SIGTERM",
    );
    agent.destroy();
    expect(outcome.forced).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("the pool", () => {
  it("is closed, and a pool that refuses to close is reported rather than hidden", async () => {
    await listen((_req, res) => res.end("served"));
    let closed = false;
    const ok = await gracefulShutdown(
      { server: server!, closePool: async () => { closed = true; }, exit: () => {} },
      "SIGTERM",
    );
    expect(closed).toBe(true);
    expect(ok.pool).toBe("closed");

    await listen((_req, res) => res.end("served"));
    const bad = await gracefulShutdown(
      {
        server: server!,
        closePool: async () => { throw new Error("connection reset"); },
        exit: () => {},
      },
      "SIGTERM",
    );
    // "not wired" and "failed" must never read the same. A deploy that could
    // not close its pool is a fact somebody has to be able to find.
    expect(bad.pool).toBe("failed");
  });

  it("says 'not wired' when there is no pool, never 'closed'", async () => {
    await listen((_req, res) => res.end("served"));
    const outcome = await gracefulShutdown({ server: server!, exit: () => {} }, "SIGTERM");
    expect(outcome.pool).toBe("not wired");
  });
});

describe("the budget", () => {
  it("defaults to a value under any sane platform grace period", () => {
    // Railway's default grace is 30s. A drain budget at or above it would be
    // decided by SIGKILL rather than by this code, which is the bug.
    expect(DEFAULT_DRAIN_MS).toBeLessThan(30_000);
    expect(DEFAULT_DRAIN_MS).toBeGreaterThan(1_000);
  });
});
