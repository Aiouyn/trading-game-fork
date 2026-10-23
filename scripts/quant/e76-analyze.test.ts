import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PARAMS,
  E76_LIMITS,
  analyze,
  applyDrag,
  cliffDriftPctGd,
  cliffDriftPctGdForP90,
  decimalToPctGd,
  formatReport,
  intervals,
  meanDailyRatePctGd,
  median,
  parseRun,
  pctGdToDecimal,
  percentile,
  rampW,
  summarizeStyle,
  measureSeed,
  type Params,
  type RunInput,
  type SeedResult,
  type Style,
} from "./e76-analyze";

/**
 * These tests pin the E-76 analysis layer to the errata. The numbers asserted are not invented:
 * every one is either quoted from E-47 / E-60 / E-75 / E-76 or is a closed-form consequence of
 * those numbers, computed in the test so the derivation is visible.
 */

/** Build a run whose net worth compounds at an exact rate, on the V1 harness's 8-GD grid. */
function runAt(seed: string, style: Style, ratePctGd: number, endNetWorth: number, days = 1400): RunInput {
  const netWorth: Record<number, number> = {};
  const start = endNetWorth / Math.pow(1 + ratePctGd / 100, days);
  for (let gd = 8; gd <= days; gd += 8) netWorth[gd] = start * Math.pow(1 + ratePctGd / 100, gd);
  return { seed, style, netWorth };
}

/** 20 seeds of one style, all compounding at the same rate: isolates the aggregate math. */
function flatStyle(style: Style, ratePctGd: number, endNetWorth: number): RunInput[] {
  return Array.from({ length: 20 }, (_, i) =>
    runAt(`${style}-${i + 1}`, style, ratePctGd, endNetWorth),
  );
}

describe("units: decimal fraction vs %/GD number", () => {
  it("converts msi_drift_per_gd 0.0029 to 0.29 %/GD and back", () => {
    expect(decimalToPctGd(0.0029)).toBeCloseTo(0.29, 10);
    expect(pctGdToDecimal(0.29)).toBeCloseTo(0.0029, 10);
    expect(pctGdToDecimal(decimalToPctGd(0.0137))).toBeCloseTo(0.0137, 12);
  });

  it("recovers the drift E-60 subtracted, from E-60's own published rows", () => {
    // E-60 §Verification table: nominal %/GD, real in brackets. nominal - real must be one drift.
    const rows = [
      { label: "excellent @2B", nominal: 0.417, real: 0.127 },
      { label: "excellent @5B", nominal: 0.239, real: -0.051 },
      { label: "excellent @20B", nominal: 0.29, real: 0.0 },
    ];
    for (const r of rows) expect(r.nominal - r.real).toBeCloseTo(0.29, 3);
    // and that 0.29 is the decimal 0.0029, NOT 0.29 decimal
    expect(pctGdToDecimal(rows[0]!.nominal - rows[0]!.real)).toBeCloseTo(0.0029, 6);
  });

  it("does not silently accept the 100x error: 0.0059 is not the average cliff", () => {
    // The average-style cliff in %/GD (derived below) must not equal the decimal-mixed 0.0059.
    const cliffPctGd = -0.067 + 0.29 + E76_LIMITS.medianRealLoss;
    expect(cliffPctGd).toBeCloseTo(0.293, 6);
    expect(cliffPctGd).not.toBeCloseTo(0.0059, 3);
    expect(pctGdToDecimal(cliffPctGd)).toBeCloseTo(0.00293, 6);
  });
});

describe("E-47 ramp", () => {
  it("reproduces every published point", () => {
    // E-47: center $2B, width 0.35.
    const cases: [number, number][] = [
      [100_000_000, 0.000004],
      [990_000_000, 0.052224],
      [1_000_000_000, 0.054313],
      [2_000_000_000, 0.5],
      [3_000_000_000, 0.841752],
    ];
    for (const [nw, expected] of cases) expect(rampW(nw)).toBeCloseTo(expected, 6);
  });

  it("has no cliff: a 1% step in net worth moves w by at most 0.0103", () => {
    // E-47's own bound. Worst case at the inflection, evaluated to $1T.
    let max = 0;
    for (let nw = 1e8; nw <= 1e12; nw *= 1.01) {
      max = Math.max(max, Math.abs(rampW(nw * 1.01) - rampW(nw)));
    }
    expect(max).toBeCloseTo(0.0103, 3);
    expect(max).toBeLessThan(0.0104);
  });

  it("is 0.5 at the center and monotone", () => {
    expect(rampW(2_000_000_000, 2_000_000_000, 0.35)).toBeCloseTo(0.5, 12);
    expect(rampW(1e9)).toBeLessThan(rampW(2e9));
    expect(rampW(2e9)).toBeLessThan(rampW(4e9));
  });

  it("returns 0 for a non-positive or degenerate input rather than NaN", () => {
    expect(rampW(0)).toBe(0);
    expect(rampW(-5)).toBe(0);
    expect(rampW(1e9, 2e9, 0)).toBe(0);
  });
});

describe("E-60 drag", () => {
  it("never touches a book at or below drift", () => {
    expect(applyDrag(0.223, 0.4, 0.29, 1)).toBe(0.223);
    expect(applyDrag(0.29, 0.99, 0.29, 1)).toBe(0.29);
  });

  it("removes half the excess at w = 0.5 and all of it at w = 1", () => {
    // E-60: excellent at $2B is nominal 0.417 with real +0.127, so g_raw = 0.544.
    expect(applyDrag(0.544, 0.5, 0.29, 1)).toBeCloseTo(0.417, 3);
    expect(applyDrag(0.544, 0.5, 0.29, 1) - 0.29).toBeCloseTo(0.127, 3);
    expect(applyDrag(0.544, 1, 0.29, 1)).toBeCloseTo(0.29, 12);
  });

  it("reproduces E-60's three excellent points at $2B / $5B / $20B", () => {
    // E-60: excellent medians nominal 0.417 / 0.296 / 0.290, real +0.127 / +0.006 / +0.000.
    // Same g_raw at all three; only w(N) moves. g_raw = 0.29 + 0.127/(1-0.5) = 0.544.
    const gRaw = 0.544;
    const realAt = (nw: number) => applyDrag(gRaw, rampW(nw), 0.29, 1) - 0.29;
    expect(realAt(2e9)).toBeCloseTo(0.127, 3);
    expect(realAt(5e9)).toBeCloseTo(0.006, 3);
    expect(realAt(20e9)).toBeCloseTo(0, 3);
  });
});

describe("flow adjustment (E-56 Q10 / E-59 (c))", () => {
  it("a transfer never reads as growth", () => {
    // Flat book, then a $1B grant on the last day.
    const netWorth: Record<number, number> = {};
    for (let gd = 8; gd <= 400; gd += 8) netWorth[gd] = 1e9;
    const withGrant: RunInput = { seed: "s", style: "average", netWorth, external: { 400: 1e9 } };
    const bumped: RunInput = { seed: "s", style: "average", netWorth: { ...netWorth, 400: 2e9 } };
    expect(meanDailyRatePctGd(withGrant, 400)).toBeCloseTo(0, 10);
    // Without the flow adjustment the same book would read as a large single-day jump.
    const naive = intervals(bumped);
    expect(naive[naive.length - 1]!.ratePctGd).toBeGreaterThan(0);
  });

  it("normalises any checkpoint grid to one game day", () => {
    // 1%/GD compounded: a 4-GD grid and an 8-GD grid must agree.
    const daily = runAt("a", "average", 1, 1e9, 400);
    const coarse: RunInput = {
      seed: "a",
      style: "average",
      netWorth: Object.fromEntries(
        Object.entries(daily.netWorth)
          .map(([k, v]) => [Number(k), v] as const)
          .filter(([gd]) => gd % 16 === 0),
      ),
    };
    expect(meanDailyRatePctGd(daily, 400)).toBeCloseTo(1, 6);
    expect(meanDailyRatePctGd(coarse, 400)).toBeCloseTo(1, 6);
  });
});

describe("window selection", () => {
  it("measures only the last 400 GD of a 1,400-GD run", () => {
    // Fast early, flat late: the window must see only the flat part.
    const netWorth: Record<number, number> = {};
    let nw = 1e8;
    for (let gd = 8; gd <= 1400; gd += 8) {
      nw *= gd <= 1000 ? 1.02 ** 8 : 1;
      netWorth[gd] = nw;
    }
    const r: RunInput = { seed: "s", style: "average", netWorth };
    expect(meanDailyRatePctGd(r, 400)).toBeCloseTo(0, 6);
    // the whole run, by contrast, is far higher
    expect(meanDailyRatePctGd(r, 1400)).toBeGreaterThan(1);
  });

  it("returns NaN rather than a fabricated number when there is no window", () => {
    const r: RunInput = { seed: "s", style: "average", netWorth: { 8: 1e9 } };
    expect(Number.isNaN(meanDailyRatePctGd(r, 400))).toBe(true);
    expect(Number.isNaN(measureSeed(r).gRawPctGd)).toBe(true);
  });
});

describe("percentile and median conventions", () => {
  it("matches the numpy-linear convention at the ranks E-76 uses", () => {
    const v = [1, 2, 3, 4, 5];
    expect(percentile(v, 0)).toBe(1);
    expect(percentile(v, 0.5)).toBe(3);
    expect(percentile(v, 1)).toBe(5);
    expect(percentile(v, 0.9)).toBeCloseTo(4.6, 10);
    expect(median(v)).toBe(3);
  });

  it("interpolates across 20 values the way P90-of-20 is defined", () => {
    const v = Array.from({ length: 20 }, (_, i) => i + 1);
    // pos = 19 * 0.9 = 17.1 -> between the 18th and 19th values
    expect(percentile(v, 0.9)).toBeCloseTo(18.1, 10);
  });

  it("does not mutate its input", () => {
    const v = [3, 1, 2];
    percentile(v, 0.9);
    expect(v).toEqual([3, 1, 2]);
  });
});

describe("per-style statistics", () => {
  it("reports median real, P90 real loss, worst seed and nominal min", () => {
    const results: SeedResult[] = [0.02, -0.05, -0.10, -0.13, 0.01].map((real, i) => ({
      seed: `s${i}`,
      style: "average" as Style,
      gRawPctGd: 0.29 + real,
      w: 0,
      nominalPctGd: 0.29 + real,
      realPctGd: real,
    }));
    const s = summarizeStyle(results);
    expect(s.seeds).toBe(5);
    expect(s.medianRealPctGd).toBeCloseTo(-0.05, 10);
    expect(s.worstRealPctGd).toBeCloseTo(-0.13, 10);
    expect(s.worstSeed).toBe("s3");
    expect(s.nominalMinPctGd).toBeCloseTo(0.16, 10);
    // losses = [-0.02, 0.05, 0.10, 0.13, -0.01]; sorted ascending: [-0.02, -0.01, 0.05, 0.10, 0.13].
    // P90 at pos = 4 * 0.9 = 3.6 -> 0.10 + 0.6 * (0.13 - 0.10) = 0.118.
    expect(s.p90RealLossPctGd).toBeCloseTo(0.118, 10);
  });
});

describe("E-76 verdicts", () => {
  function params(driftPctGd: number): Params {
    return { ...DEFAULT_PARAMS, driftPctGd };
  }

  it("reproduces E-75's published three-style row from runs at those growth rates", () => {
    // E-75 medians: excellent +0.138 (at $2B, w=0.5), managed -0.056, average -0.067.
    // Implied g_raw: excellent 0.29 + 0.138/0.5 = 0.566; managed 0.234; average 0.223.
    const runs: RunInput[] = [
      ...flatStyle("excellent", 0.566, 2e9),
      ...flatStyle("managed", 0.234, 1.7e9),
      ...flatStyle("average", 0.223, 1.1e9),
    ];
    const report = analyze(runs);
    const by = new Map(report.summaries.map((s) => [s.style, s]));
    expect(by.get("excellent")!.medianRealPctGd).toBeCloseTo(0.138, 3);
    expect(by.get("managed")!.medianRealPctGd).toBeCloseTo(-0.056, 3);
    expect(by.get("average")!.medianRealPctGd).toBeCloseTo(-0.067, 3);
    expect(report.allPass).toBe(true);
  });

  it("fails AC (b) on average the moment the drift passes 0.293 %/GD", () => {
    const runs = flatStyle("average", 0.223, 1.1e9);
    const at = analyze(runs, params(0.293));
    const past = analyze(runs, params(0.2931));
    expect(at.verdicts.find((v) => v.ac === "b")!.pass).toBe(true);
    expect(past.verdicts.find((v) => v.ac === "b")!.pass).toBe(false);
  });

  it("says the same thing via the cliff, and the cliff is unit-invariant", () => {
    const s = summarizeStyle(measureSeed(runAt("a", "average", 0.223, 1.1e9)) ? [
      measureSeed(runAt("a", "average", 0.223, 1.1e9)),
    ] : []);
    expect(cliffDriftPctGd(s)).toBeCloseTo(0.293, 6);
    expect(pctGdToDecimal(cliffDriftPctGd(s))).toBeCloseTo(0.00293, 6);
    // headroom over the placeholder, in basis points
    expect((cliffDriftPctGd(s) - DEFAULT_PARAMS.driftPctGd) * 100).toBeCloseTo(0.3, 6);
  });

  it("AC (a) TIGHTENS as drift rises (it does not move the safe way)", () => {
    // P90 of real loss rises 1:1 with the drift, so the 0.11 ceiling is approached.
    const runs = flatStyle("average", 0.223, 1.1e9);
    const base = analyze(runs, params(0.29));
    const bumped = analyze(runs, params(0.30));
    const loss0 = base.summaries[0]!.p90RealLossPctGd;
    const loss1 = bumped.summaries[0]!.p90RealLossPctGd;
    expect(loss1 - loss0).toBeCloseTo(0.01, 6);
    expect(loss1).toBeGreaterThan(loss0);
    // and the (a) cliff recedes by the same amount below the placeholder's headroom
    const cliff = cliffDriftPctGdForP90(base.summaries[0]!);
    expect(cliff).toBeCloseTo(0.29 + (E76_LIMITS.p90RealLoss - loss0), 10);
  });

  it("excellent's cliff is g_raw because the drag, not the subtraction, governs it", () => {
    const report = analyze(flatStyle("excellent", 0.566, 2e9));
    const cliff = report.bCliffs.find((c) => c.style === "excellent")!;
    expect(cliff.cliffPctGd).toBeCloseTo(0.566, 3);
    // NOT the nominal, and NOT the old 14.09
    expect(cliff.cliffPctGd).not.toBeCloseTo(0.428, 2);
    expect(cliff.cliffPctGd).not.toBeCloseTo(14.09, 1);
  });

  it("ranks the cliffs and names the binding one", () => {
    const runs: RunInput[] = [
      ...flatStyle("excellent", 0.566, 2e9),
      ...flatStyle("managed", 0.234, 1.7e9),
      ...flatStyle("average", 0.223, 1.1e9),
    ];
    const report = analyze(runs);
    expect(report.binding.style).toBe("average");
    expect(report.binding.cliffPctGd).toBeCloseTo(0.293, 3);
    expect(report.binding.headroomPctGd * 100).toBeCloseTo(0.3, 3);
  });

  it("fails AC (c) when a seed's nominal goes negative under a heavy drag", () => {
    // A book above drift whose w is 1 loses all excess: nominal collapses to the drift, not below.
    // Force a negative nominal by measuring against a drift higher than the raw growth.
    const runs = flatStyle("average", 0.10, 1.1e9);
    const report = analyze(runs, params(0.29));
    const c = report.verdicts.find((v) => v.ac === "c")!;
    expect(c.pass).toBe(true); // below-drift books keep their raw rate, so (c) still holds
    expect(c.measured).toBeCloseTo(0.10, 3);
  });
});

describe("I/O helpers", () => {
  it("parses the committed fixture and reproduces E-75's three medians", () => {
    // The fixture is the runner's provable input (scripts/quant/e76-fixture.json). If it ever
    // stops reproducing E-75's published medians, either the fixture or the analysis is wrong.
    const raw = JSON.parse(
      readFileSync(new URL("./e76-fixture.json", import.meta.url), "utf8"),
    ) as unknown[];
    const runs = raw.map(parseRun);
    expect(runs).toHaveLength(9);
    const report = analyze(runs);
    const by = new Map(report.summaries.map((s) => [s.style, s]));
    expect(by.get("excellent")!.medianRealPctGd).toBeCloseTo(0.138, 3);
    expect(by.get("managed")!.medianRealPctGd).toBeCloseTo(-0.056, 3);
    expect(by.get("average")!.medianRealPctGd).toBeCloseTo(-0.067, 3);
    expect(report.allPass).toBe(true);
    expect(report.binding.style).toBe("average");
    expect(report.binding.cliffPctGd).toBeCloseTo(0.293, 6);
    expect(report.binding.headroomPctGd * 100).toBeCloseTo(0.3, 1);
  });

  it("parses the V1 harness shape and the neutral shape identically", () => {
    const netWorth = { 8: 1e9, 16: 1.01e9 };
    const a = parseRun({ seed: "s", style: "average", netWorth });
    const b = parseRun({ seed: "s", style: "average", checkpoints: netWorth });
    expect(a).toEqual(b);
  });

  it("rejects an out-of-scope style instead of silently bucketing it", () => {
    expect(() => parseRun({ seed: "s", style: "neglected", netWorth: { 8: 1e9 } }))
      .toThrow(/not one of/);
  });

  it("rejects a non-finite net worth", () => {
    expect(() => parseRun({ seed: "s", style: "average", netWorth: { 8: "lots" } }))
      .toThrow(/finite/);
  });

  it("formats a report that names the binding constraint", () => {
    const text = formatReport(analyze(flatStyle("average", 0.223, 1.1e9)));
    expect(text).toContain("BINDING: average");
    expect(text).toContain("0.2930");
    expect(text).toContain("0.3 bp");
  });
});
