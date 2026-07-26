/**
 * Unit tests for the members repository.
 *
 * The interesting case is `update()`. Every handler previously did its own
 * read-modify-write: load all members, edit one, write the lot back. Two
 * overlapping requests means the second load happens before the first save, and
 * one member's change vanishes with no error. `update()` narrows that window to a
 * single function, and `saveDoc()` keeps the old shape available while making the
 * staleness visible in one signature instead of at 29 call sites.
 *
 * These assert the difference explicitly, so nobody "simplifies" update() back
 * into a load-mutate-save pair at the call site later.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { usersRepo, type MemberRecord } from "./users";

let dir: string;
let file: string;
let repo: ReturnType<typeof usersRepo>;

const member = (id: string, email: string, extra: Record<string, any> = {}): MemberRecord =>
  ({ id, email, name: id, recognitionBalance: 0, ...extra });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "amora-users-"));
  file = path.join(dir, "users.json");
  fs.writeFileSync(file, JSON.stringify({ users: [] }));
  repo = usersRepo(file);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("reads", () => {
  beforeEach(() => {
    repo.add(member("usr-1", "One@Example.test"));
    repo.add(member("usr-2", "two@example.test"));
  });

  it("finds by id and by email, and email matching is case-insensitive", () => {
    expect(repo.byId("usr-1")?.email).toBe("One@Example.test");
    // Registration and login compare emails, so a member typing a different case
    // must not create or miss an account.
    expect(repo.byEmail("one@example.test")?.id).toBe("usr-1");
    expect(repo.byEmail("ONE@EXAMPLE.TEST")?.id).toBe("usr-1");
    expect(repo.existsByEmail("TWO@example.test")).toBe(true);
    expect(repo.existsByEmail("nobody@example.test")).toBe(false);
  });

  it("returns null rather than throwing for a member who is gone", () => {
    expect(repo.byId("usr-missing")).toBeNull();
    expect(repo.byEmail("missing@example.test")).toBeNull();
  });

  it("counts members", () => {
    expect(repo.count()).toBe(2);
  });
});

describe("update", () => {
  beforeEach(() => {
    repo.add(member("usr-1", "one@example.test", { recognitionBalance: 10 }));
    repo.add(member("usr-2", "two@example.test", { recognitionBalance: 99 }));
  });

  it("persists the mutation and leaves everyone else alone", () => {
    const updated = repo.update("usr-1", (m) => {
      m.recognitionBalance = 40;
      m.bio = "planted the swale";
    });
    expect(updated?.recognitionBalance).toBe(40);
    // Read back from disk, not from the returned object.
    expect(repo.byId("usr-1")?.recognitionBalance).toBe(40);
    expect(repo.byId("usr-1")?.bio).toBe("planted the swale");
    expect(repo.byId("usr-2")?.recognitionBalance).toBe(99);
    expect(repo.count()).toBe(2);
  });

  it("returns null for a missing member and writes nothing", () => {
    expect(repo.update("usr-missing", (m) => { m.recognitionBalance = 1; })).toBeNull();
    expect(repo.byId("usr-1")?.recognitionBalance).toBe(10);
    expect(repo.count()).toBe(2);
  });

  it("THE POINT: two sequential updates to different members both survive", () => {
    // This is what the old pattern lost. Each update reloads, so the second one
    // sees the first one's write instead of overwriting it from a stale copy.
    repo.update("usr-1", (m) => { m.recognitionBalance = 111; });
    repo.update("usr-2", (m) => { m.recognitionBalance = 222; });
    expect(repo.byId("usr-1")?.recognitionBalance).toBe(111);
    expect(repo.byId("usr-2")?.recognitionBalance).toBe(222);
  });

  it("shows the staleness that saveDoc still carries, so it is not a surprise", () => {
    // Two handlers each load the whole list, then each save it. The second save
    // wins and the first edit is lost. update() avoids this; saveDoc cannot,
    // because the caller's array was already stale when it arrived. This is the
    // pre-existing race, documented here rather than pretended away, and it is
    // what a transaction fixes when this moves to MySQL.
    const handlerA = repo.readDoc();
    const handlerB = repo.readDoc();
    handlerA.find((m) => m.id === "usr-1")!.recognitionBalance = 500;
    handlerB.find((m) => m.id === "usr-2")!.recognitionBalance = 600;
    repo.saveDoc(handlerA);
    repo.saveDoc(handlerB);
    expect(repo.byId("usr-2")?.recognitionBalance).toBe(600);
    // usr-1's edit is gone, and that is the documented limitation.
    expect(repo.byId("usr-1")?.recognitionBalance).toBe(10);
  });
});

describe("add and remove", () => {
  it("adds without disturbing existing members", () => {
    repo.add(member("usr-1", "one@example.test"));
    repo.add(member("usr-2", "two@example.test"));
    expect(repo.count()).toBe(2);
    expect(repo.all().map((m) => m.id)).toEqual(["usr-1", "usr-2"]);
  });

  it("removes one member and returns them", () => {
    repo.add(member("usr-1", "one@example.test"));
    repo.add(member("usr-2", "two@example.test"));
    expect(repo.remove("usr-1")?.id).toBe("usr-1");
    expect(repo.byId("usr-1")).toBeNull();
    expect(repo.count()).toBe(1);
    expect(repo.remove("usr-1")).toBeNull();
  });
});

describe("resilience", () => {
  it("reads a corrupt file as empty rather than throwing", () => {
    // Matches readJson's long-standing behaviour in server/index.ts. Worth an
    // explicit test because it means a damaged file presents as "no members",
    // which looks like data loss rather than an error.
    fs.writeFileSync(file, "{not json");
    expect(repo.all()).toEqual([]);
    expect(repo.count()).toBe(0);
    // And it recovers: a write lays down a valid document again.
    repo.add(member("usr-1", "one@example.test"));
    expect(repo.count()).toBe(1);
  });

  it("tolerates a bare array, which early fixtures wrote", () => {
    fs.writeFileSync(file, JSON.stringify([member("usr-9", "nine@example.test")]));
    expect(repo.byId("usr-9")?.email).toBe("nine@example.test");
  });

  it("reads a missing file as empty", () => {
    fs.rmSync(file);
    expect(repo.all()).toEqual([]);
  });
});
