/**
 * The comparator every admin member list sorts through.
 *
 * The property under test is not "sorted alphabetically". It is that two
 * reads of the same set answer in the same order however the rows arrived,
 * because the defect this closes is a row moving under an admin's cursor
 * between one save and the next.
 */
import { describe, expect, it } from "vitest";
import { compareMembersByName, sortMembersByName } from "./memberOrder";

const names = (list: Array<{ id: string; name?: string | null }>) => list.map((m) => m.name ?? m.id);

describe("compareMembersByName", () => {
  it("orders by name", () => {
    const sorted = sortMembersByName([
      { id: "3", name: "Cara" },
      { id: "1", name: "Ada" },
      { id: "2", name: "Ben" },
    ]);
    expect(names(sorted)).toEqual(["Ada", "Ben", "Cara"]);
  });

  it("is total: two members sharing a name still order the same way from any input order", () => {
    const a = { id: "aaa", name: "Ana" };
    const b = { id: "bbb", name: "Ana" };
    expect(names(sortMembersByName([a, b]))).toEqual(["Ana", "Ana"]);
    expect(sortMembersByName([a, b]).map((m) => m.id)).toEqual(["aaa", "bbb"]);
    // The same set handed over in the opposite order lands identically. A
    // comparator that stopped at the name would answer "bbb, aaa" here,
    // because a stable sort keeps whatever order it was given.
    expect(sortMembersByName([b, a]).map((m) => m.id)).toEqual(["aaa", "bbb"]);
  });

  it("survives a missing name without throwing or drifting", () => {
    const rows = [{ id: "z" }, { id: "a", name: null }, { id: "m", name: "Mira" }];
    expect(sortMembersByName(rows).map((m) => m.id)).toEqual(["a", "z", "m"]);
    expect(sortMembersByName([...rows].reverse()).map((m) => m.id)).toEqual(["a", "z", "m"]);
  });

  it("leaves the caller's array alone", () => {
    const original = [{ id: "2", name: "Ben" }, { id: "1", name: "Ada" }];
    const sorted = sortMembersByName(original);
    expect(original.map((m) => m.id)).toEqual(["2", "1"]);
    expect(sorted.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("answers 0 only when the same member is compared with itself", () => {
    const one = { id: "1", name: "Ada" };
    expect(compareMembersByName(one, one)).toBe(0);
    expect(compareMembersByName(one, { id: "2", name: "Ada" })).not.toBe(0);
  });
});
