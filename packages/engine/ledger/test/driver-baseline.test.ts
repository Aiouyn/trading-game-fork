// ─────────────────────────────────────────────────────────────────────────────────────────────
// DRIVER BASELINE (E-72 (2); QA mutant 5 on PR #4: `amt(3_000_000_000)` → `amt(2_000_000_000)` SURVIVED).
//
// The seeded driver (test/driver.ts) had no committed baseline, so a behavioural change to it was
// invisible to the whole ledger suite. This test recomputes seven observable components of the
// reference run and compares them with test/fixtures/driver-baseline.json.
//
// REFERENCE RUN — stated so anyone can reproduce it: seed 42, 30 game days = 21 600 ticks,
// the stock `runDriver` loop (driveTick → aggregates → runP13), 5 ccys (CCYS).
//
// COMPONENTS — seven of them. Each hash is sha256 hex over the UTF-8 bytes of the text shown:
//   entryLog        canonEncode(w.entryLog())                            the committed postings archive
//   perTickResults  canonEncode([CommitResult per tick, in tick order])   P13's verdict for every tick
//   flows           canonEncode([tickFlows(ccy, t) ?? null])              t ascending, ccy sorted. The
//                   card calls this `flows`; the QA brief calls it tickFlows — same component.
//   flowDays        canonEncode([dayFlows(ccy, d) ?? null])               d ascending, ccy sorted
//   snapshot        w.snapshot()                                          world state (INV-LED-013 checked inside)
//   accounts        canonEncode(w.accounts())                             every live + dormant balance
//   dailyAggregates canonEncode([[ccy, dayIndex, aggregates(ccy)]])        M0/M0_sys/M0_cb/M2/PEM at each day close
//
// PREFIX NEUTRALITY (Systems' constraint): the loan id prefix is read out of driver.ts, not
// hard-coded here, and every `<prefix><tick>_<i>` id is rewritten to `LOAN_<tick>_<i>` before
// hashing. A prefix-only change therefore leaves all seven hashes identical and shows up as
// exactly one diff line — `"loanIdPrefix"` — in the fixture. Never hard-code `lon_` below.
//
// REGENERATE (only for an intended change, in the same commit, and say why in the PR):
//   cd packages/engine/ledger && DRIVER_BASELINE_UPDATE=1 npx vitest run test/driver-baseline.test.ts
// ─────────────────────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonEncode, CCYS } from '../src';
import { runDriver } from './driver';

const SEED = 42;
const DAYS = 30;
const TICKS = DAYS * 720;
const FIXTURE = fileURLToPath(new URL('./fixtures/driver-baseline.json', import.meta.url));
const TICKS_PER_DAY = 720;

const COMPONENTS = ['entryLog', 'perTickResults', 'flows', 'flowDays', 'snapshot', 'accounts', 'dailyAggregates'] as const;
type Component = (typeof COMPONENTS)[number];
interface Baseline { seed: number; days: number; ticks: number; loanIdPrefix: string; components: Record<Component, string> }

/** The loan id prefix driver.ts currently uses, read from the source so this file never pins it. */
function driverLoanPrefix(): string {
  const src = readFileSync(fileURLToPath(new URL('./driver.ts', import.meta.url)), 'utf8');
  const m = /const id = `([A-Za-z0-9]+_)\$\{w\.tick\}_\$\{i\}`/.exec(src);
  if (!m) throw new Error('driver.ts: cannot find the loan id expression (`const id = `<prefix>_${w.tick}_${i}`)');
  return m[1];
}

let normalisedIds = 0;
/** `<prefix><tick>_<i>` → `LOAN_<tick>_<i>`, so a prefix-only change moves no hash. */
function normalise(text: string, prefix: string): string {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(?<![A-Za-z0-9])${esc}(?=\\d+_\\d+)`, 'g'), () => {
    normalisedIds++;
    return 'LOAN_';
  });
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

function dump(): Baseline {
  const prefix = driverLoanPrefix();
  const results: unknown[] = [];
  const dailyAggregates: unknown[] = [];
  const w = runDriver(SEED, TICKS, (ww, r) => {
    results.push(r);
    const tick = results.length - 1;
    if (tick % TICKS_PER_DAY === TICKS_PER_DAY - 1) for (const c of CCYS) dailyAggregates.push([c, Math.floor(tick / TICKS_PER_DAY), ww.aggregates(c)]);
  });
  const flows: unknown[] = [];
  const flowDays: unknown[] = [];
  for (let t = 0; t < TICKS; t++) for (const c of CCYS) flows.push(w.flowReader().tickFlows(c, t) ?? null);
  for (let d = 0; d < DAYS; d++) for (const c of CCYS) flowDays.push(w.flowReader().dayFlows(c, d) ?? null);
  const raw: Record<Component, string> = {
    entryLog: canonEncode(w.entryLog()),
    perTickResults: canonEncode(results),
    flows: canonEncode(flows),
    flowDays: canonEncode(flowDays),
    snapshot: w.snapshot(),
    accounts: canonEncode(w.accounts()),
    dailyAggregates: canonEncode(dailyAggregates),
  };
  const components = Object.fromEntries(COMPONENTS.map((k) => [k, sha256(normalise(raw[k], prefix))])) as Record<Component, string>;
  return { seed: SEED, days: DAYS, ticks: TICKS, loanIdPrefix: prefix, components };
}

let actual: Baseline;
let committed: Baseline;

beforeAll(() => {
  actual = dump();
  if (process.env.DRIVER_BASELINE_UPDATE === '1') writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
  committed = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Baseline;
}, TICKS + 60_000);

describe('driver baseline (E-72 (2)): the seeded driver run is pinned component by component', () => {
  it('the reference run in the fixture is the run this test makes', () => {
    expect({ seed: committed.seed, days: committed.days, ticks: committed.ticks }).toEqual({ seed: SEED, days: DAYS, ticks: TICKS });
  });

  it('the loan id prefix in the fixture is the one driver.ts uses (a prefix change is this line only)', () => {
    expect(committed.loanIdPrefix).toBe(actual.loanIdPrefix);
  });

  it('the normaliser really rewrites the driver loan ids, so a prefix change cannot move a hash', () => {
    expect(normalisedIds).toBeGreaterThan(0);
    expect(normalise(`"${actual.loanIdPrefix}7_2"`, actual.loanIdPrefix)).toBe('"LOAN_7_2"');
  });

  for (const c of COMPONENTS) {
    it(`${c} matches the committed baseline`, () => {
      expect(actual.components[c]).toBe(committed.components[c]);
    });
  }
});
