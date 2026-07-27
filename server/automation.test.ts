/**
 * The automation pipeline's pure surface (S53-S54): transcript parsing and
 * THE EVIDENCE RULE. These tests are the rule's constitution — a task
 * without a verbatim, correctly-timestamped quote does not exist.
 */
import { describe, expect, it } from "vitest";
import { parseTranscript, videoIdsFromRss } from "./lib/recordings";
import { chapterCandidates, normalizeForMatch, validateTasks } from "./lib/callSynthesis";

const VTT = `WEBVTT

00:00:01.000 --> 00:00:08.000
Welcome everyone to the circle.

00:01:00.000 --> 00:01:09.500
The founders circle should fix the water pump by Friday.

00:04:00.000 --> 00:04:05.000
Let's close with gratitude.`;

describe("parseTranscript", () => {
  it("parses VTT cues into timestamped segments", () => {
    const p = parseTranscript(VTT);
    expect(p.segments.length).toBe(3);
    expect(p.segments[1].startMs).toBe(60000);
    expect(p.segments[1].endMs).toBe(69500);
    expect(p.segments[1].text).toContain("water pump");
  });

  it("parses SRT (comma decimals, numeric indices)", () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,000\nHello there.\n\n2\n00:00:10,000 --> 00:00:12,000\nGoodbye now.`;
    const p = parseTranscript(srt);
    expect(p.segments.length).toBe(2);
    expect(p.segments[1].startMs).toBe(10000);
  });

  it("falls back to ONE zero-spanning segment for plain text", () => {
    const p = parseTranscript("Just notes, no timestamps at all.");
    expect(p.segments).toEqual([{ startMs: 0, endMs: 0, text: "Just notes, no timestamps at all." }]);
  });
});

describe("THE EVIDENCE RULE — validateTasks", () => {
  const segments = parseTranscript(VTT).segments;
  const roles = new Set(["founders-circle"]);

  it("keeps a task whose quote and timestamp match the tape", () => {
    const { kept, dropped } = validateTasks(
      [{ description: "Fix the water pump", quote: "fix the water pump", timestampMs: 62000, roleId: "founders-circle" }],
      segments, roles,
    );
    expect(kept.length).toBe(1);
    expect(dropped).toBe(0);
    expect(kept[0].roleId).toBe("founders-circle");
  });

  it("DROPS a fabricated quote — words never said do not become work", () => {
    const { kept, dropped } = validateTasks(
      [{ description: "Buy a tractor", quote: "we agreed to buy a tractor", timestampMs: 62000, roleId: null }],
      segments, roles,
    );
    expect(kept.length).toBe(0);
    expect(dropped).toBe(1);
  });

  it("DROPS a real quote pinned to the wrong moment (outside ±30s)", () => {
    const { kept, dropped } = validateTasks(
      [{ description: "Fix the pump", quote: "fix the water pump", timestampMs: 240000, roleId: null }],
      segments, roles,
    );
    expect(kept.length).toBe(0);
    expect(dropped).toBe(1);
  });

  it("DROPS tasks missing either piece of evidence", () => {
    const { dropped } = validateTasks(
      [
        { description: "No quote", timestampMs: 62000 },
        { description: "No timestamp", quote: "fix the water pump" },
        { description: "", quote: "fix the water pump", timestampMs: 62000 },
      ],
      segments, roles,
    );
    expect(dropped).toBe(3);
  });

  it("NULLS a hallucinated role id but keeps the evidenced task", () => {
    const { kept } = validateTasks(
      [{ description: "Fix the pump", quote: "fix the water pump", timestampMs: 61000, roleId: "supreme-leader" }],
      segments, roles,
    );
    expect(kept.length).toBe(1);
    expect(kept[0].roleId).toBeNull();
  });

  it("matches through smart quotes, case and spacing (normalization)", () => {
    const { kept } = validateTasks(
      [{ description: "Close well", quote: "Let’s   CLOSE with gratitude", timestampMs: 241000, roleId: null }],
      segments, roles,
    );
    expect(kept.length).toBe(1);
  });

  it("treats an untimestamped transcript as one whole-text window", () => {
    const plain = parseTranscript("We should compost more, said everyone.").segments;
    const { kept } = validateTasks(
      [{ description: "Compost", quote: "compost more", timestampMs: 999999, roleId: null }],
      plain, roles,
    );
    expect(kept.length).toBe(1);
  });
});

describe("deterministic helpers", () => {
  it("chapterCandidates marks topic turns at >=90s gaps", () => {
    const marks = chapterCandidates(parseTranscript(VTT).segments);
    // 0 always; the 69.5s -> 240s gap (170s) earns a mark.
    expect(marks).toEqual([{ startMs: 0 }, { startMs: 240000 }]);
  });

  it("videoIdsFromRss diffs entries out of a channel feed", () => {
    const xml = `<feed><entry><yt:videoId>abc123</yt:videoId><title>Circle Call 12</title></entry><entry><yt:videoId>def456</yt:videoId><title>Circle Call 13</title></entry></feed>`;
    expect(videoIdsFromRss(xml)).toEqual([
      { id: "abc123", title: "Circle Call 12" },
      { id: "def456", title: "Circle Call 13" },
    ]);
  });

  it("normalizeForMatch is aggressive about typography, gentle about words", () => {
    expect(normalizeForMatch("“Let’s  Go”")).toBe(`"let's go"`);
  });
});
