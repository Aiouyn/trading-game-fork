/**
 * E-76 acceptance-criterion analysis (owner: Quant).
 *
 * This is the analysis half of the E-75/E-76 harness. The original scripts (tg-p10/e60x,
 * analyze.py) are NOT in the repo and are not recoverable; this file re-derives the measurement
 * from the errata text alone, so the AC can be re-run the moment 03 MSI lands.
 *
 * WHAT IT MEASURES (E-60 §Verification, E-75, E-76)
 *   g_raw   the flow-adjusted mean daily nominal growth of a book over a measurement window,
 *           with external transfers F_d excluded (E-56 Q10).
 *   w(N)    the E-47 top-end ramp, sigma(log2(N / topend_ramp_center) / topend_ramp_width).
 *   g_eff   the E-60 drag, g_eff = drift + (g_raw - drift)(1 - D*w) when g_raw > drift, else g_raw.
 *   nominal g_eff, the nominal rate the AC reads.
 *   real    nominal - drift (E-60: "Real growth = nominal - drift").
 *   the per-style statistics: median real, P90 of seeds' real loss, worst seed, nominal min.
 *   the E-76 verdicts (a), (b), (c), and the drift CLIFF at which each style's verdict flips.
 *
 * UNITS — read this before touching any number. This file mixes two units on purpose and
 * converts at exactly one boundary:
 *   - `msi_drift_per_gd` (the 23 registry, E-59) is a DECIMAL FRACTION per game day: 0.0029.
 *   - Every errata table and every E-76 limit is a %/GD NUMBER: 0.29, 0.07, 0.11.
 * The two must never be mixed. Proven from E-60's own table: excellent at $2B is nominal 0.417
 * with real +0.127, so the drift subtracted is 0.417 - 0.127 = 0.290 %/GD, i.e. decimal 0.0029.
 *   => rates inside this module are %/GD numbers; decimals enter once, via decimalToPctGd().
 *   => the test file pins this conversion and reconstructs E-60's table from it.
 *
 * Everything is a pure function over inputs: no clock, no I/O, no RNG, no engine import.
 */

/** The three styles E-76 governs. The V1 harness also has 'neglected' and 'casual'; they are out of scope. */
export type Style = "excellent" | "managed" | "average";

/** A rate in PERCENT PER GAME DAY, the unit every errata table and every E-76 limit uses (0.29, 0.07, 0.11). */
export type PctGd = number;

/** One measured run: net worth at checkpoints, plus the external transfers F_d (E-56 Q10). */
export interface RunInput {
  seed: string;
  style: Style;
  /** Net worth by game day. Sparse is fine: any checkpoint grid works (the V1 harness writes every 8 GD). */
  netWorth: Readonly<Record<number, number>>;
  /** External transfers F_d by game day, in money. Excluded from the return by E-56 Q10. Default: none. */
  external?: Readonly<Record<number, number>>;
}

/** The parameters the measurement depends on. All rates are %/GD numbers. */
export interface Params {
  /** msi_drift_per_gd as a %/GD number (decimal 0.0029 -> 0.29). E-59/E-60. */
  driftPctGd: PctGd;
  /** topend_ramp_center, E-47. Default $2B. */
  rampCenter: number;
  /** topend_ramp_width, E-47. Default 0.35. */
  rampWidth: number;
  /** topend_excess_d, the drag depth D, E-60. Default 1.0. */
  dragD: number;
  /** The measurement window in game days (E-75: the last 400 GD of a 1,400-GD run). */
  windowGd: number;
}

/** E-60 defaults: drift 0.0029 decimal, E-47 ramp, D = 1.0, 400-GD window. */
export const DEFAULT_PARAMS: Params = {
  driftPctGd: 0.29,
  rampCenter: 2_000_000_000,
  rampWidth: 0.35,
  dragD: 1.0,
  windowGd: 400,
};

/** The E-76 limits, as %/GD numbers. (b) is 0.07 because E-76 loosened E-60's 0.06. */
export const E76_LIMITS = {
  /** (a) P90 of seeds' real loss, every style. */
  p90RealLoss: 0.11,
  /** (b) managed and average: median real loss. */
  medianRealLoss: 0.07,
} as const;

/** Decimal fraction per GD -> %/GD number. The ONE conversion between the two unit systems. */
export function decimalToPctGd(decimal: number): PctGd {
  return decimal * 100;
}

/** %/GD number -> decimal fraction per GD. The inverse of decimalToPctGd. */
export function pctGdToDecimal(pctGd: PctGd): number {
  return pctGd / 100;
}

/**
 * The E-47 top-end ramp: w(N) = sigma(log2(N / center) / width).
 * Published points in E-47 (center $2B, width 0.35), all reproduced to < 5e-7 by this function:
 *   w($100M) = 0.000004, w($0.99B) = 0.052224, w($1B) = 0.054313, w($2B) = 0.5, w($3B) = 0.841752.
 * Monotone, smooth, no cliff: the largest change per 1% step in N is 0.25*log2(1.01)/0.35 = 0.0103.
 */
export function rampW(netWorth: number, center: number = 2_000_000_000, width: number = 0.35): number {
  if (!(netWorth > 0) || !(center > 0) || !(width > 0)) return 0;
  return 1 / (1 + Math.exp(-Math.log2(netWorth / center) / width));
}

/**
 * The E-60 drag: excess-only, D deep.
 *   g_eff = drift + (g_raw - drift)(1 - D*w)   when g_raw > drift
 *   g_eff = g_raw                              otherwise (a book at or below drift is never touched)
 * At w = 1 and D = 1 the drag removes exactly the excess, leaving the drift itself.
 */
export function applyDrag(gRawPctGd: PctGd, w: number, driftPctGd: PctGd, dragD: number): PctGd {
  if (gRawPctGd <= driftPctGd) return gRawPctGd;
  return driftPctGd + (gRawPctGd - driftPctGd) * (1 - dragD * w);
}

/** One checkpoint interval's growth, normalised to a per-game-day rate. */
export interface Interval {
  fromGd: number;
  toGd: number;
  /** Flow-adjusted per-GD growth over the interval, as a %/GD number. */
  ratePctGd: PctGd;
}

/**
 * The per-interval flow-adjusted growth rates of a run, oldest first.
 * The flow adjustment is E-56 Q10 / E-59 (c): the interval's end net worth is reduced by the
 * external transfers booked on that end day, so a grant or a P2P transfer never reads as growth.
 * Growth is measured geometrically over the interval and normalised to one game day, so any
 * checkpoint grid gives the same answer as a daily one.
 */
export function intervals(run: RunInput): Interval[] {
  const days = Object.keys(run.netWorth)
    .map(Number)
    .filter((d) => Number.isFinite(d))
    .sort((a, b) => a - b);
  const out: Interval[] = [];
  for (let i = 1; i < days.length; i++) {
    const from = days[i - 1]!;
    const to = days[i]!;
    const nw0 = run.netWorth[from]!;
    const flow = run.external?.[to] ?? 0;
    const nw1 = run.netWorth[to]! - flow;
    const gap = to - from;
    if (!(nw0 > 0) || !(nw1 > 0) || gap <= 0) continue;
    out.push({ fromGd: from, toGd: to, ratePctGd: (Math.pow(nw1 / nw0, 1 / gap) - 1) * 100 });
  }
  return out;
}

/** The last `windowGd` game days of intervals ending at the run's last checkpoint (E-75's window). */
export function windowIntervals(run: RunInput, windowGd: number): Interval[] {
  const all = intervals(run);
  if (all.length === 0) return [];
  const last = all[all.length - 1]!.toGd;
  const from = last - windowGd;
  return all.filter((iv) => iv.fromGd >= from);
}

/**
 * The mean daily nominal growth over the measurement window (g_raw), as a %/GD number.
 * Arithmetic mean of the per-interval daily rates, which is E-60's "mean daily nominal rate".
 */
export function meanDailyRatePctGd(run: RunInput, windowGd: number): PctGd {
  const ivs = windowIntervals(run, windowGd);
  if (ivs.length === 0) return Number.NaN;
  return ivs.reduce((s, iv) => s + iv.ratePctGd, 0) / ivs.length;
}

/** The net worth at the last checkpoint of the window: the N the ramp is read at. */
export function windowEndNetWorth(run: RunInput): number {
  const days = Object.keys(run.netWorth).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const last = days[days.length - 1];
  return last === undefined ? Number.NaN : (run.netWorth[last] ?? Number.NaN);
}

/** One seed's measured result. All rates are %/GD numbers. */
export interface SeedResult {
  seed: string;
  style: Style;
  /** The flow-adjusted mean daily nominal growth over the window. */
  gRawPctGd: PctGd;
  /** The E-47 ramp at the window's end net worth. */
  w: number;
  /** g_eff after the E-60 drag. */
  nominalPctGd: PctGd;
  /** nominal - drift (E-60). Negative means the book lost real value. */
  realPctGd: PctGd;
}

/** Measure one run. */
export function measureSeed(run: RunInput, params: Params = DEFAULT_PARAMS): SeedResult {
  const gRaw = meanDailyRatePctGd(run, params.windowGd);
  const nw = windowEndNetWorth(run);
  const w = rampW(nw, params.rampCenter, params.rampWidth);
  const nominal = applyDrag(gRaw, w, params.driftPctGd, params.dragD);
  return {
    seed: run.seed,
    style: run.style,
    gRawPctGd: gRaw,
    w,
    nominalPctGd: nominal,
    realPctGd: nominal - params.driftPctGd,
  };
}

/**
 * Percentile with linear interpolation between closest ranks (the numpy / Excel default).
 * The original analyze.py is lost, so this convention is a DECISION, not a recovery: it is
 * stated here and pinned by a test. If QA can show the lost script used nearest-rank, change
 * this function only, and say so in the errata.
 */
export function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  if (q <= 0) return Math.min(...values);
  if (q >= 1) return Math.max(...values);
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** The median (P50) of a set of rates, same convention as percentile(). */
export function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

/** A style's measured statistics, as E-75's table prints them. All rates are %/GD numbers. */
export interface StyleSummary {
  style: Style;
  seeds: number;
  /** The style statistic for AC (b). */
  medianRealPctGd: number;
  /** P90 of the seeds' real LOSS (loss = -real; positive means the seed lost real value). AC (a). */
  p90RealLossPctGd: number;
  /** The worst single seed: its real rate and its seed id. */
  worstRealPctGd: number;
  worstSeed: string;
  /** The smallest nominal across seeds. AC (c) wants this above 0. */
  nominalMinPctGd: number;
  /** The median g_raw, kept because the cliff depends on it for a style above the drift. */
  medianGRawPctGd: number;
}

/** Aggregate the measured seeds of one style into the E-75 row. */
export function summarizeStyle(results: readonly SeedResult[]): StyleSummary {
  if (results.length === 0) {
    return {
      style: "average",
      seeds: 0,
      medianRealPctGd: Number.NaN,
      p90RealLossPctGd: Number.NaN,
      worstRealPctGd: Number.NaN,
      worstSeed: "",
      nominalMinPctGd: Number.NaN,
      medianGRawPctGd: Number.NaN,
    };
  }
  const reals = results.map((r) => r.realPctGd);
  const losses = reals.map((r) => -r);
  let worst = results[0]!;
  for (const r of results) if (r.realPctGd < worst.realPctGd) worst = r;
  return {
    style: results[0]!.style,
    seeds: results.length,
    medianRealPctGd: median(reals),
    p90RealLossPctGd: percentile(losses, 0.9),
    worstRealPctGd: worst.realPctGd,
    worstSeed: worst.seed,
    nominalMinPctGd: Math.min(...results.map((r) => r.nominalPctGd)),
    medianGRawPctGd: median(results.map((r) => r.gRawPctGd)),
  };
}

/** One AC verdict. */
export interface Verdict {
  /** "a", "b" or "c" (E-76). */
  ac: "a" | "b" | "c";
  style: Style;
  pass: boolean;
  /** What was measured, as a %/GD number (for (c): the smallest nominal). */
  measured: number;
  /** The limit it was measured against, as a %/GD number. */
  limit: number;
  /** measured - limit in the AC's own direction: positive is always "inside the limit". */
  slack: number;
}

/**
 * The drift at which a style's AC (b) verdict flips, as a %/GD number.
 * Two cases, because the drag changes the algebra:
 *   at or below drift: g_eff = g_raw, so real = g_raw - drift, and d(real)/d(drift) = -1.
 *   above drift:       real = (g_raw - drift)(1 - D*w), so d(real)/d(drift) = -(1 - D*w).
 * For excellent (above drift) the cliff is therefore g_raw itself: real >= 0 <=> drift <= g_raw.
 * For managed and average (below drift) the cliff is nominalMedian + medianRealLossLimit.
 */
export function cliffDriftPctGd(summary: StyleSummary, params: Params = DEFAULT_PARAMS): number {
  if (summary.style === "excellent") return summary.medianGRawPctGd;
  return summary.medianRealPctGd + params.driftPctGd + E76_LIMITS.medianRealLoss;
}

/**
 * The drift at which a style's AC (a) verdict flips, as a %/GD number.
 * P90 of real loss rises by exactly (newDrift - drift) as the drift moves, so the cliff is the
 * current drift plus the remaining slack. (This is why a rising drift TIGHTENS AC (a).)
 */
export function cliffDriftPctGdForP90(summary: StyleSummary, params: Params = DEFAULT_PARAMS): number {
  return params.driftPctGd + (E76_LIMITS.p90RealLoss - summary.p90RealLossPctGd);
}

/**
 * Tolerance for an AC comparison. A measurement that lands exactly ON its limit must pass —
 * E-76 writes "≤ 0.07" and "≥ 0" — but binary floating point cannot express 0.223 - 0.293 as
 * exactly -0.07 (it is -0.07000000000000001). Without this, the AC fails by ~1e-17 at the very
 * drift it is supposed to be the cliff of. 1e-9 %/GD is 7 orders below any measurable rate here.
 */
export const AC_EPSILON = 1e-9;

/** Evaluate the three E-76 ACs over a set of style summaries. */
export function evaluateAc(summaries: readonly StyleSummary[]): Verdict[] {
  const out: Verdict[] = [];
  for (const s of summaries) {
    // (a) P90 of seeds' real loss <= 0.11, every style.
    out.push({
      ac: "a",
      style: s.style,
      pass: s.p90RealLossPctGd <= E76_LIMITS.p90RealLoss + AC_EPSILON,
      measured: s.p90RealLossPctGd,
      limit: E76_LIMITS.p90RealLoss,
      slack: E76_LIMITS.p90RealLoss - s.p90RealLossPctGd,
    });
    // (b) excellent median real >= 0; managed and average median real loss <= 0.07.
    const limitB = s.style === "excellent" ? 0 : -E76_LIMITS.medianRealLoss;
    out.push({
      ac: "b",
      style: s.style,
      pass: s.medianRealPctGd >= limitB - AC_EPSILON,
      measured: s.medianRealPctGd,
      limit: limitB,
      slack: s.medianRealPctGd - limitB,
    });
    // (c) nominal > 0 for every seed.
    out.push({
      ac: "c",
      style: s.style,
      pass: s.nominalMinPctGd > AC_EPSILON,
      measured: s.nominalMinPctGd,
      limit: 0,
      slack: s.nominalMinPctGd - 0,
    });
  }
  return out;
}

/** The whole report: per-style rows, the verdicts, and the cliffs. */
export interface Report {
  params: Params;
  summaries: StyleSummary[];
  verdicts: Verdict[];
  /** Per style, the drift at which AC (b) flips. */
  bCliffs: { style: Style; cliffPctGd: number; headroomPctGd: number }[];
  /** Per style, the drift at which AC (a) flips. */
  aCliffs: { style: Style; cliffPctGd: number; headroomPctGd: number }[];
  /** The tightest AC (b) cliff across styles: the binding constraint on the MSI drift. */
  binding: { style: Style; cliffPctGd: number; headroomPctGd: number };
  allPass: boolean;
}

/** Run the whole E-76 analysis over a batch of runs. */
export function analyze(runs: readonly RunInput[], params: Params = DEFAULT_PARAMS): Report {
  const byStyle = new Map<Style, SeedResult[]>();
  for (const run of runs) {
    const r = measureSeed(run, params);
    const bucket = byStyle.get(run.style);
    if (bucket) bucket.push(r);
    else byStyle.set(run.style, [r]);
  }
  const order: Style[] = ["excellent", "managed", "average"];
  const summaries = order
    .filter((s) => byStyle.has(s))
    .map((s) => summarizeStyle(byStyle.get(s)!));
  const verdicts = evaluateAc(summaries);
  const bCliffs = summaries.map((s) => {
    const cliff = cliffDriftPctGd(s, params);
    return { style: s.style, cliffPctGd: cliff, headroomPctGd: cliff - params.driftPctGd };
  });
  const aCliffs = summaries.map((s) => {
    const cliff = cliffDriftPctGdForP90(s, params);
    return { style: s.style, cliffPctGd: cliff, headroomPctGd: cliff - params.driftPctGd };
  });
  const allCliffs = [...bCliffs, ...aCliffs];
  let binding = bCliffs[0] ?? { style: "average" as Style, cliffPctGd: Number.NaN, headroomPctGd: Number.NaN };
  for (const c of allCliffs) if (c.cliffPctGd < binding.cliffPctGd) binding = c;
  return {
    params,
    summaries,
    verdicts,
    bCliffs,
    aCliffs,
    binding,
    allPass: verdicts.every((v) => v.pass),
  };
}

/** Format a report as the plain-text table the producer / owner read. No I/O, so it is testable. */
export function formatReport(report: Report): string {
  const f = (x: number, dp = 4) => (Number.isFinite(x) ? x.toFixed(dp) : "n/a");
  const lines: string[] = [];
  lines.push(`E-76 analysis: drift ${f(report.params.driftPctGd, 2)} %/GD `
    + `(decimal ${f(pctGdToDecimal(report.params.driftPctGd), 5)}), window ${report.params.windowGd} GD`);
  lines.push("");
  lines.push(`${"style".padEnd(10)} ${"seeds".padStart(5)} ${"median real".padStart(12)} `
    + `${"P90 real loss".padStart(13)} ${"worst seed".padStart(16)} ${"nominal min".padStart(12)}`);
  for (const s of report.summaries) {
    lines.push(`${s.style.padEnd(10)} ${String(s.seeds).padStart(5)} ${f(s.medianRealPctGd).padStart(12)} `
      + `${f(s.p90RealLossPctGd).padStart(13)} ${`${f(s.worstRealPctGd)} (${s.worstSeed})`.padStart(16)} `
      + `${f(s.nominalMinPctGd).padStart(12)}`);
  }
  lines.push("");
  for (const v of report.verdicts) {
    lines.push(`  AC (${v.ac}) ${v.style.padEnd(10)} ${v.pass ? "PASS" : "FAIL"}  `
      + `measured ${f(v.measured)} vs limit ${f(v.limit)}  slack ${f(v.slack)}`);
  }
  lines.push("");
  for (const c of report.bCliffs) {
    lines.push(`  cliff (b) ${c.style.padEnd(10)} ${f(c.cliffPctGd)} %/GD `
      + `(headroom ${f(c.headroomPctGd)} %/GD = ${f(c.headroomPctGd * 100, 1)} bp)`);
  }
  for (const c of report.aCliffs) {
    lines.push(`  cliff (a) ${c.style.padEnd(10)} ${f(c.cliffPctGd)} %/GD `
      + `(headroom ${f(c.headroomPctGd)} %/GD = ${f(c.headroomPctGd * 100, 1)} bp)`);
  }
  lines.push("");
  lines.push(`  BINDING: ${report.binding.style} at ${f(report.binding.cliffPctGd)} %/GD `
    + `(headroom ${f(report.binding.headroomPctGd)} %/GD = ${f(report.binding.headroomPctGd * 100, 1)} bp)`);
  lines.push(`  ${report.allPass ? "all ACs PASS" : "ACs FAIL"}`);
  return lines.join("\n");
}

/** Parse one run from a decoded JSON object (the shape the V1 harness and this module share). */
export function parseRun(obj: unknown): RunInput {
  if (typeof obj !== "object" || obj === null) throw new Error("run: not an object");
  const o = obj as Record<string, unknown>;
  const seed = o.seed;
  const style = o.style;
  if (typeof seed !== "string") throw new Error("run.seed: not a string");
  if (style !== "excellent" && style !== "managed" && style !== "average") {
    throw new Error(`run.style: ${String(style)} is not one of excellent/managed/average`);
  }
  const net = o.netWorth ?? o.checkpoints;
  if (typeof net !== "object" || net === null) throw new Error("run.netWorth: missing");
  const netWorth: Record<number, number> = {};
  for (const [k, v] of Object.entries(net as Record<string, unknown>)) {
    const gd = Number(k);
    if (!Number.isFinite(gd) || typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`run.netWorth[${k}]: not a finite number`);
    }
    netWorth[gd] = v;
  }
  let external: Record<number, number> | undefined;
  if (o.external !== undefined && o.external !== null) {
    if (typeof o.external !== "object") throw new Error("run.external: not an object");
    external = {};
    for (const [k, v] of Object.entries(o.external as Record<string, unknown>)) {
      const gd = Number(k);
      if (!Number.isFinite(gd) || typeof v !== "number" || !Number.isFinite(v)) {
        throw new Error(`run.external[${k}]: not a finite number`);
      }
      external[gd] = v;
    }
  }
  return external ? { seed, style, netWorth, external } : { seed, style, netWorth };
}
