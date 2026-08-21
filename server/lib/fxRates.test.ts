/**
 * The rates cache (0083, P8): the ECB parser against a CAPTURED response,
 * the URL built from literals only, and the absence that matters: no CRC.
 */
import { describe, expect, it } from "vitest";
import { ecbDailyUrl, FX_QUOTES, parseEcbSeries } from "./fxRates";

/** Trimmed from the live answer of 2026-08-21 to D.USD+CHF+CRC+GBP.EUR.SP00.A:
 *  CRC was ASKED FOR and the ECB answered with the other three series and no
 *  CRC anywhere, which is the measured fact the manual-rate door exists for. */
const CAPTURED = {
  header: { id: "trimmed" },
  dataSets: [
    {
      series: {
        "0:0:0:0:0": { observations: { "0": [0.9353, 0, 0, null, null] } },
        "0:1:0:0:0": { observations: { "0": [0.8567, 0, 0, null, null] } },
        "0:2:0:0:0": { observations: { "0": [1.1699, 0, 0, null, null] } },
      },
    },
  ],
  structure: {
    dimensions: {
      series: [
        { id: "FREQ", values: [{ id: "D" }] },
        { id: "CURRENCY", values: [{ id: "CHF" }, { id: "GBP" }, { id: "USD" }] },
        { id: "CURRENCY_DENOM", values: [{ id: "EUR" }] },
        { id: "EXR_TYPE", values: [{ id: "SP00" }] },
        { id: "EXR_SUFFIX", values: [{ id: "A" }] },
      ],
      observation: [{ id: "TIME_PERIOD", values: [{ id: "2026-08-21" }] }],
    },
  },
};

describe("the ECB parser", () => {
  it("reads quote, rate and day from the captured response", () => {
    expect(parseEcbSeries(CAPTURED)).toEqual([
      { quote: "CHF", rate: 0.9353, asOf: "2026-08-21" },
      { quote: "GBP", rate: 0.8567, asOf: "2026-08-21" },
      { quote: "USD", rate: 1.1699, asOf: "2026-08-21" },
    ]);
  });

  it("finds no CRC, because the ECB list carries none (measured 2026-08-21)", () => {
    expect(parseEcbSeries(CAPTURED).some((r) => r.quote === "CRC")).toBe(false);
  });

  it("survives junk without inventing a rate", () => {
    expect(parseEcbSeries(null)).toEqual([]);
    expect(parseEcbSeries({})).toEqual([]);
    const zeroRate = JSON.parse(JSON.stringify(CAPTURED));
    zeroRate.dataSets[0].series["0:0:0:0:0"].observations["0"] = [0, 0, 0, null, null];
    expect(parseEcbSeries(zeroRate).some((r) => r.quote === "CHF")).toBe(false);
  });
});

describe("the daily URL", () => {
  it("is built from the fixed quote list and nothing stored", () => {
    const url = ecbDailyUrl();
    expect(url.startsWith("https://data-api.ecb.europa.eu/service/data/EXR/D.")).toBe(true);
    expect(url).toContain(".EUR.SP00.A");
    expect(url).toContain("lastNObservations=1");
    for (const q of FX_QUOTES) expect(url).toContain(q);
  });

  it("does not ask for CRC, which the list cannot answer", () => {
    expect((FX_QUOTES as readonly string[]).includes("CRC")).toBe(false);
    expect(ecbDailyUrl()).not.toContain("CRC");
  });
});
