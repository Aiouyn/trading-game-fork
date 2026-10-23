/**
 * E-76 runner: the one command that turns a batch of runs into the E-76 verdict.
 *
 *   npx tsx scripts/quant/e76-run.ts --runs out/e76/runs.json
 *   npx tsx scripts/quant/e76-run.ts out/e76/*.json --drift 0.0029 --window 400
 *
 * Input: one or more JSON files, each either a single run object or an array of them, shaped
 *   { "seed": "average-1", "style": "average", "netWorth": { "8": 1e9, ... }, "external": {...} }
 * The V1 harness's `checkpoints` key is accepted in place of `netWorth`.
 *
 * Output: the per-style E-75 table, the E-76 (a)/(b)/(c) verdicts, and the drift cliff per style.
 * Exit code: 0 when every AC passes, 1 when any fails or the batch is unusable. That is what a CI
 * step or the Producer's rerun script branches on.
 *
 * --drift takes the DECIMAL form the registry stores (0.0029). --drift-pct-gd takes the %/GD
 * number the errata tables print (0.29). Both are provided because mixing them is the single
 * documented way to get this wrong by 100x; pass exactly one.
 */

import { readFileSync } from "node:fs";
import {
  DEFAULT_PARAMS,
  analyze,
  decimalToPctGd,
  formatReport,
  parseRun,
  pctGdToDecimal,
  type Params,
  type RunInput,
} from "./e76-analyze";

interface Args {
  files: string[];
  driftPctGd: number;
  windowGd: number;
  rampCenter: number;
  rampWidth: number;
  dragD: number;
  json: boolean;
  /** Explicitly accept a batch that is smaller than E-76's 20 seeds per style. */
  allowSmoke: boolean;
}

/** E-76 is measured on 20 real seeds per style (errata E-75/E-76). Below this it is not the AC. */
export const E76_REQUIRED_SEEDS = 20;

function usage(): string {
  return [
    "usage: npx tsx scripts/quant/e76-run.ts <file.json ...> [options]",
    "",
    "  --drift <decimal>       msi_drift_per_gd as stored in the registry (0.0029)",
    "  --drift-pct-gd <n>      the same drift as the errata print it (0.29) - pass ONE of these",
    "  --window <gd>           measurement window, default 400 (E-75)",
    "  --ramp-center <money>   topend_ramp_center, default 2000000000 (E-47)",
    "  --ramp-width <n>        topend_ramp_width, default 0.35 (E-47)",
    "  --drag-d <n>            topend_excess_d, default 1.0 (E-60)",
    "  --allow-smoke           accept fewer than 20 seeds per style (smoke test, NOT an E-76 verdict)",
    "  --json                  print the report as JSON instead of a table",
    "",
    "Exit: 0 all ACs pass, 1 an AC failed, 2 unusable input OR an under-sampled batch",
    "      without --allow-smoke.  E-76 requires 20 seeds per style.",
  ].join("\n");
}

function parseArgs(argv: string[]): Args {
  const files: string[] = [];
  let driftPctGd: number | undefined;
  const args: Args = {
    files,
    driftPctGd: DEFAULT_PARAMS.driftPctGd,
    windowGd: DEFAULT_PARAMS.windowGd,
    rampCenter: DEFAULT_PARAMS.rampCenter,
    rampWidth: DEFAULT_PARAMS.rampWidth,
    dragD: DEFAULT_PARAMS.dragD,
    json: false,
    allowSmoke: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a}: missing value`);
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`${a}: "${v}" is not a number`);
      return n;
    };
    switch (a) {
      case "--drift": {
        const decimal = next();
        if (driftPctGd !== undefined) throw new Error("pass only one of --drift / --drift-pct-gd");
        driftPctGd = decimalToPctGd(decimal);
        break;
      }
      case "--drift-pct-gd":
        if (driftPctGd !== undefined) throw new Error("pass only one of --drift / --drift-pct-gd");
        driftPctGd = next();
        break;
      case "--window":
        args.windowGd = next();
        break;
      case "--ramp-center":
        args.rampCenter = next();
        break;
      case "--ramp-width":
        args.rampWidth = next();
        break;
      case "--drag-d":
        args.dragD = next();
        break;
      case "--json":
        args.json = true;
        break;
      case "--allow-smoke":
        args.allowSmoke = true;
        break;
      case "-h":
      case "--help":
        console.log(usage());
        process.exit(0);
        break;
      default:
        if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
        files.push(a);
    }
  }
  if (driftPctGd !== undefined) args.driftPctGd = driftPctGd;
  if (files.length === 0) throw new Error(`no input files\n\n${usage()}`);
  return args;
}

function loadRuns(files: readonly string[]): RunInput[] {
  const runs: RunInput[] = [];
  for (const file of files) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) runs.push(parseRun(item));
  }
  return runs;
}

function main(argv: string[]): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`e76-run: ${(e as Error).message}`);
    return 2;
  }
  let runs: RunInput[];
  try {
    runs = loadRuns(args.files);
  } catch (e) {
    console.error(`e76-run: ${(e as Error).message}`);
    return 2;
  }
  const params: Params = {
    driftPctGd: args.driftPctGd,
    rampCenter: args.rampCenter,
    rampWidth: args.rampWidth,
    dragD: args.dragD,
    windowGd: args.windowGd,
  };
  const report = analyze(runs, params);
  if (report.summaries.length === 0) {
    console.error("e76-run: no usable runs");
    return 2;
  }

  // E-76 is a 20-seeds-per-style AC. A smaller batch cannot produce an E-76 verdict, however
  // green it looks - so refuse to certify one unless the caller says outright that it is a smoke
  // test. Without this guard a 1-seed file prints "all ACs PASS" and exits 0, which is exactly
  // the quiet path from a substitute to a verdict.
  const shortStyles = report.summaries.filter((s) => s.seeds < E76_REQUIRED_SEEDS);
  if (shortStyles.length > 0 && !args.allowSmoke) {
    const detail = shortStyles.map((s) => `${s.style}=${s.seeds}`).join(" ");
    console.error(
      `SMOKE - ${detail} seeds/style; E-76 requires ${E76_REQUIRED_SEEDS} per style.\n`
        + "This is NOT an E-76 verdict and must not be reported as one.\n"
        + "Pass --allow-smoke to run it as a smoke test (exit 2 is retained), or supply the full batch.",
    );
    return 2;
  }
  if (shortStyles.length > 0) {
    const detail = shortStyles.map((s) => `${s.style}=${s.seeds}`).join(" ");
    console.error(
      `SMOKE - ${detail} seeds/style; E-76 requires ${E76_REQUIRED_SEEDS} per style.\n`
        + "This is NOT an E-76 verdict. --allow-smoke is set, so the AC result below is diagnostic only.",
    );
  }

  if (args.json) {
    const json = {
      driftPctGd: params.driftPctGd,
      driftDecimal: pctGdToDecimal(params.driftPctGd),
      windowGd: params.windowGd,
      seeds: runs.length,
      smoke: shortStyles.length > 0,
      requiredSeedsPerStyle: E76_REQUIRED_SEEDS,
      summaries: report.summaries,
      verdicts: report.verdicts,
      bCliffs: report.bCliffs,
      aCliffs: report.aCliffs,
      binding: report.binding,
      allPass: report.allPass,
    };
    console.log(JSON.stringify(json, null, 2));
  } else {
    console.log(formatReport(report));
  }
  return report.allPass ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
