/**
 * The self-hosted listener's decisions, tested where they are decisions -
 * same shape as hypha.test.ts: everything here is pure or takes its network
 * and filesystem as injected fakes, so no real RPC and no real webhook is
 * ever dialed by this file.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendDeadLetter,
  buildDeliveryPayload,
  decideOutcomeKind,
  decodeLog,
  emptyCheckpoint,
  loadCheckpoint,
  loadConfigFromEnv,
  pollOnce,
  readAgreementIdFromTopic,
  saveCheckpoint,
  scanForMarker,
  type Checkpoint,
  type RawLog,
} from "./selfHostedListener";

const PASSED_TOPIC = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FAILED_TOPIC = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OTHER_TOPIC = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function topicFor(n: number): string {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

function utf8Topic(text: string): string {
  return `0x${Buffer.from(text, "utf8").toString("hex").padEnd(64, "0")}`;
}

function log(overrides: Partial<RawLog> = {}): RawLog {
  return {
    topics: [PASSED_TOPIC],
    data: "0x",
    transactionHash: "0xdeadbeef",
    logIndex: 0,
    blockNumber: 100n,
    ...overrides,
  };
}

describe("deciding what a log's topic0 means (operator-configured, never hardcoded)", () => {
  it("matches the configured passed / failed topics and nothing else", () => {
    expect(decideOutcomeKind(log({ topics: [PASSED_TOPIC] }), { passedTopic0: PASSED_TOPIC, failedTopic0: FAILED_TOPIC })).toBe("passed");
    expect(decideOutcomeKind(log({ topics: [FAILED_TOPIC] }), { passedTopic0: PASSED_TOPIC, failedTopic0: FAILED_TOPIC })).toBe("failed");
    expect(decideOutcomeKind(log({ topics: [OTHER_TOPIC] }), { passedTopic0: PASSED_TOPIC, failedTopic0: FAILED_TOPIC })).toBeNull();
  });

  it("is case-insensitive, since Basescan and viem do not agree on casing", () => {
    expect(decideOutcomeKind(log({ topics: [PASSED_TOPIC.toUpperCase()] }), { passedTopic0: PASSED_TOPIC })).toBe("passed");
  });

  it("with only one side configured, the other outcome is simply never matched", () => {
    expect(decideOutcomeKind(log({ topics: [FAILED_TOPIC] }), { passedTopic0: PASSED_TOPIC })).toBeNull();
  });
});

describe("reading an agreement id off an indexed topic", () => {
  it("decodes a uint256/bytes32 topic as a decimal id", () => {
    expect(readAgreementIdFromTopic(topicFor(991))).toBe("991");
    expect(readAgreementIdFromTopic(topicFor(0))).toBe("0");
  });

  it("a malformed or missing topic is null, never a throw", () => {
    expect(readAgreementIdFromTopic(undefined)).toBeNull();
    expect(readAgreementIdFromTopic("not-hex")).toBeNull();
    expect(readAgreementIdFromTopic("")).toBeNull();
  });
});

describe("scanning for the [gm:<id>] marker across topics and data", () => {
  it("finds a marker hex-encoded in the data field", () => {
    const l = log({ data: utf8Topic("[gm:abc-1] Raise the cap") });
    expect(scanForMarker(l)).toBe("abc-1");
  });

  it("finds a marker in a non-topic0 indexed topic", () => {
    const l = log({ topics: [PASSED_TOPIC, utf8Topic("[gm:xyz-9]")] });
    expect(scanForMarker(l)).toBe("xyz-9");
  });

  it("survives NUL padding around the marker (fixed-width abi encoding)", () => {
    // A right-padded short string: real bytes, then zero bytes to fill 32.
    const padded = `0x${Buffer.from("[gm:p-1]", "utf8").toString("hex")}${"0".repeat(64 - Buffer.from("[gm:p-1]", "utf8").toString("hex").length)}`;
    expect(scanForMarker(log({ data: padded }))).toBe("p-1");
  });

  it("finds nothing when nothing decodes to a marker", () => {
    expect(scanForMarker(log({ data: "0x" + "11".repeat(32) }))).toBeNull();
  });
});

describe("the whole decode step", () => {
  const cfg = { passedTopic0: PASSED_TOPIC, failedTopic0: FAILED_TOPIC, agreementIdTopicIndex: 1 };

  it("decodes an agreement id from the configured topic index", () => {
    const l = log({ topics: [PASSED_TOPIC, topicFor(42)] });
    const d = decodeLog(l, cfg);
    expect(d?.outcome).toBe("passed");
    expect(d?.agreementId).toBe("42");
  });

  it("falls back to the marker scan when no topic index is configured", () => {
    const l = log({ topics: [FAILED_TOPIC], data: utf8Topic("[gm:only-marker]") });
    const d = decodeLog(l, { passedTopic0: PASSED_TOPIC, failedTopic0: FAILED_TOPIC });
    expect(d?.outcome).toBe("failed");
    expect(d?.agreementId).toBeNull();
    expect(d?.marker).toBe("only-marker");
  });

  it("a log matching neither configured topic decodes to null", () => {
    expect(decodeLog(log({ topics: [OTHER_TOPIC] }), cfg)).toBeNull();
  });

  it("a log that matches an outcome but carries NEITHER an agreement id NOR a marker decodes to null", () => {
    // This is the log this listener has no business forwarding: it matched
    // an outcome topic but there is nothing here to key a proposal on. The
    // configured agreement-id topic index (1) is simply absent from this
    // log's topics, which is different from a present topic that decodes
    // to id "0" (that IS a real agreement id and is covered separately).
    const l = log({ topics: [PASSED_TOPIC], data: "0x" });
    const d = decodeLog(l, cfg);
    expect(d).toBeNull();
  });

  it("an agreement id topic that decodes to zero is still a real id, not 'nothing'", () => {
    const l = log({ topics: [PASSED_TOPIC, "0x" + "0".repeat(64)], data: "0x" });
    const d = decodeLog(l, cfg);
    expect(d?.agreementId).toBe("0");
  });
});

describe("building the exact payload the webhook expects", () => {
  it("matches the field names readInboundOutcome (outcomes.ts) reads", () => {
    const payload = buildDeliveryPayload(
      { outcome: "passed", agreementId: "991", marker: null, txHash: "0xabc", logIndex: 3, blockNumber: "100" },
      "space-7",
    );
    expect(payload).toEqual({
      outcome: "passed",
      agreementId: "991",
      marker: undefined,
      txHash: "0xabc",
      deliveryId: "0xabc:3",
      spaceId: "space-7",
    });
  });

  it("wraps a bare marker back into the [gm:...] shape extractMechanicsMarker expects on the way back in", () => {
    const payload = buildDeliveryPayload(
      { outcome: "failed", agreementId: null, marker: "p-1", txHash: "0xdef", logIndex: 0, blockNumber: "1" },
    );
    expect(payload.marker).toBe("[gm:p-1]");
  });
});

describe("the poll step: idempotency, retry, and dead-lettering, with a fake chain and a fake webhook", () => {
  function reader(logs: RawLog[], latest = 1000n) {
    return {
      async latestBlock() {
        return latest;
      },
      async logsInRange() {
        return logs;
      },
    };
  }

  it("delivers a matching log exactly once and advances the checkpoint", async () => {
    const delivered: unknown[] = [];
    const cp = await pollOnce(
      { passedTopic0: PASSED_TOPIC, confirmations: 5 },
      reader([log({ topics: [PASSED_TOPIC], data: utf8Topic("[gm:a-1]") })]),
      async (p) => {
        delivered.push(p);
      },
      emptyCheckpoint(),
    );
    expect(delivered).toHaveLength(1);
    expect(cp.lastScannedBlock).toBe("995"); // latest 1000 minus 5 confirmations
    expect(cp.delivered).toContain("0xdeadbeef:0");
  });

  it("never redelivers a key already in the checkpoint (idempotent across restarts)", async () => {
    const already: Checkpoint = { lastScannedBlock: "0", delivered: ["0xdeadbeef:0"], attempts: {} };
    const delivered: unknown[] = [];
    await pollOnce(
      { passedTopic0: PASSED_TOPIC },
      reader([log({ topics: [PASSED_TOPIC], data: utf8Topic("[gm:a-1]") })]),
      async (p) => {
        delivered.push(p);
      },
      already,
    );
    expect(delivered).toHaveLength(0);
  });

  it("a failed delivery is retried, and the checkpoint does NOT advance past it", async () => {
    const cp = await pollOnce(
      { passedTopic0: PASSED_TOPIC, maxAttempts: 20 },
      reader([log({ topics: [PASSED_TOPIC], data: utf8Topic("[gm:a-1]") })]),
      async () => {
        throw new Error("webhook down");
      },
      emptyCheckpoint(),
    );
    expect(cp.delivered).not.toContain("0xdeadbeef:0");
    expect(cp.attempts["0xdeadbeef:0"]).toBe(1);
    expect(cp.lastScannedBlock).toBe("0"); // held back: a later block must not skip ahead of a retry
  });

  it("a delivery that keeps failing is DEAD-LETTERED after maxAttempts, and the checkpoint un-wedges", async () => {
    let cp: Checkpoint = { lastScannedBlock: "0", delivered: [], attempts: { "0xdeadbeef:0": 2 } };
    const deadLettered: string[] = [];
    cp = await pollOnce(
      { passedTopic0: PASSED_TOPIC, maxAttempts: 3 },
      reader([log({ topics: [PASSED_TOPIC], data: utf8Topic("[gm:a-1]") })]),
      async () => {
        throw new Error("webhook down");
      },
      cp,
      () => {},
      (key) => deadLettered.push(key),
    );
    expect(deadLettered).toEqual(["0xdeadbeef:0"]);
    expect(cp.delivered).toContain("0xdeadbeef:0"); // given up, not stuck forever
    expect(cp.attempts["0xdeadbeef:0"]).toBeUndefined();
    expect(cp.lastScannedBlock).not.toBe("0"); // the dead letter un-wedges later blocks
  });

  it("a log matching no configured outcome is marked seen without ever calling deliver", async () => {
    const delivered: unknown[] = [];
    await pollOnce(
      { passedTopic0: PASSED_TOPIC },
      reader([log({ topics: [OTHER_TOPIC] })]),
      async (p) => {
        delivered.push(p);
      },
      emptyCheckpoint(),
    );
    expect(delivered).toHaveLength(0);
  });

  it("does nothing until the chain is past the confirmation depth", async () => {
    const cp = await pollOnce({ passedTopic0: PASSED_TOPIC, confirmations: 5 }, reader([], 3n), async () => {}, emptyCheckpoint());
    expect(cp).toEqual(emptyCheckpoint());
  });

  it("does nothing once already caught up to the safe head", async () => {
    const at = { lastScannedBlock: "995", delivered: [], attempts: {} };
    const cp = await pollOnce({ passedTopic0: PASSED_TOPIC, confirmations: 5 }, reader([], 1000n), async () => {}, at);
    expect(cp).toBe(at);
  });
});

describe("the checkpoint file: round-trips, and is bounded", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hypha-listener-test-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("a missing file reads as empty, never throws", () => {
    expect(loadCheckpoint(path.join(dir, "nope.json"))).toEqual(emptyCheckpoint());
  });

  it("round-trips through save and load", () => {
    const p = path.join(dir, "cp.json");
    const cp: Checkpoint = { lastScannedBlock: "42", delivered: ["a:1", "b:2"], attempts: { "c:3": 2 } };
    saveCheckpoint(p, cp);
    expect(loadCheckpoint(p)).toEqual(cp);
  });

  it("bounds the delivered set so the file cannot grow forever", () => {
    const p = path.join(dir, "cp.json");
    const many = Array.from({ length: 2500 }, (_, i) => `tx:${i}`);
    saveCheckpoint(p, { lastScannedBlock: "1", delivered: many, attempts: {} });
    const loaded = loadCheckpoint(p);
    expect(loaded.delivered.length).toBe(2000);
    expect(loaded.delivered[loaded.delivered.length - 1]).toBe("tx:2499"); // the newest survive
  });

  it("dead letters append as one JSON object per line, human-readable for a steward", () => {
    const p = path.join(dir, "dead.jsonl");
    appendDeadLetter(p, { key: "a:1", payload: { outcome: "passed" }, error: "timeout" });
    appendDeadLetter(p, { key: "b:2", payload: { outcome: "failed" }, error: "refused" });
    const lines = fs.readFileSync(p, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).key).toBe("a:1");
    expect(JSON.parse(lines[1]).key).toBe("b:2");
  });
});

describe("loading config from the environment: fails loud and specific, not confusingly on first poll", () => {
  const BASE_ENV = {
    HYPHA_LISTENER_RPC_URL: "https://base-mainnet.g.alchemy.com/v2/key",
    HYPHA_LISTENER_CONTRACT_ADDRESS: "0x" + "1".repeat(40),
    HYPHA_LISTENER_PASSED_TOPIC0: PASSED_TOPIC,
    HYPHA_LISTENER_WEBHOOK_URL: "https://my-village.example/api/webhooks/mechanics-governance",
    HYPHA_LISTENER_WEBHOOK_SECRET: "shh",
  };

  it("reads a complete, valid environment", () => {
    const cfg = loadConfigFromEnv(BASE_ENV as NodeJS.ProcessEnv);
    expect(cfg.contractAddress).toBe(BASE_ENV.HYPHA_LISTENER_CONTRACT_ADDRESS);
    expect(cfg.passedTopic0).toBe(PASSED_TOPIC);
    expect(cfg.failedTopic0).toBeUndefined();
  });

  it("refuses a contract address that is not 20 bytes of hex", () => {
    expect(() => loadConfigFromEnv({ ...BASE_ENV, HYPHA_LISTENER_CONTRACT_ADDRESS: "not-an-address" } as NodeJS.ProcessEnv)).toThrow(
      /20-byte hex address/,
    );
  });

  it("refuses when NEITHER passed nor failed topic is configured, with the specific reason", () => {
    const { HYPHA_LISTENER_PASSED_TOPIC0, ...rest } = BASE_ENV;
    expect(() => loadConfigFromEnv(rest as NodeJS.ProcessEnv)).toThrow(/at least one of/);
  });

  it("names the exact missing variable, not a generic message", () => {
    const { HYPHA_LISTENER_WEBHOOK_SECRET, ...rest } = BASE_ENV;
    expect(() => loadConfigFromEnv(rest as NodeJS.ProcessEnv)).toThrow(/HYPHA_LISTENER_WEBHOOK_SECRET is required/);
  });

  it("refuses an out-of-range agreement id topic index", () => {
    expect(() =>
      loadConfigFromEnv({ ...BASE_ENV, HYPHA_LISTENER_AGREEMENT_ID_TOPIC_INDEX: "9" } as NodeJS.ProcessEnv),
    ).toThrow(/integer 0-3/);
  });
});
