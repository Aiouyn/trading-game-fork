// T04-03: the regime chain of 04 §3.3 (AC 04#5) and the Cycle Committee label of §3.3.6.
// The statistical tests use a fixed seed, so they are deterministic: the measured numbers are reproducible run to run.
import { describe, expect, it } from 'vitest';
import { dmath, makeRng, seedStream, sha256Concat, u32be, xoNext, type ParamsView, type Rng } from '@tycoon/engine-core';
import { ALLOWED, HAZARD_WEIGHTS, P_BASE, applyCoupling, forceRegime, regimeParams, stepRegime, transitionMultipliers, type RegimeParams } from './regime';
import { cycleLabelStep } from './cycleCommittee';
import { BLOC_DEFAULTS } from '../blocs';
import type { LatestPrint, PublicMacroView, Regime } from '../schema';

const P: Record<string, number> = {
  macro_regime_mean_days_exp: 819, macro_regime_mean_days_ovh: 273, macro_regime_mean_days_con: 273, macro_regime_mean_days_rec: 273,
  macro_regime_min_days_exp: 182, macro_regime_min_days_ovh: 63, macro_regime_min_days_con: 91, macro_regime_min_days_rec: 91,
  macro_cycle_label_lag_days: 21,
};
const pv: ParamsView = {
  num: (k) => { if (!(k in P)) throw new Error(`unknown param ${k}`); return P[k]!; },
  int: (k) => { if (!(k in P)) throw new Error(`unknown param ${k}`); return P[k]!; },
};
const RP: RegimeParams = regimeParams(pv);

/** A seeded xoshiro128** stream (02 §3.10.1) through the core Rng, with a draw counter for the stream-position tests.
 *  The counter counts raw uint32 draws; the card's step calls `rng.next()` twice, so one step costs 2. */
const testRng = (seed: string): { rng: Rng; draws: () => number } => {
  const st = seedStream(seed, 'PUBLIC', sha256Concat('T04-03-test', u32be(1)), 1);
  let n = 0;
  const rng = makeRng(() => { n += 1; return xoNext(st.s); });
  return { rng, draws: () => n };
};

const blankPrints = (): PublicMacroView['prints'] => ({
  CPI: null, JOBS: null, GDP_ADV: null, GDP_REV1: null, GDP_REV2: null, PMI: null, RETAIL: null, TRADE: null, SENTIMENT: null,
  HOUSING: null, CREDIT: null, FISCAL: null, CB_DECISION: null, CB_GUIDANCE: null, CB_MINUTES: null, RESERVES: null,
});
const print = (kind: LatestPrint['kind'], tick: number, actual: number): LatestPrint =>
  ({ kind, tick, actual, consensus: actual, prior: actual, surprise: 0 });

describe('T04-03 base chain (04 §3.3.1)', () => {
  it('ALLOWED and P_BASE are exactly the §3.3.1 table', () => {
    expect(ALLOWED.EXPANSION).toEqual(['OVERHEATING', 'CONTRACTION']);
    expect(ALLOWED.OVERHEATING).toEqual(['CONTRACTION', 'EXPANSION']);
    expect(ALLOWED.CONTRACTION).toEqual(['RECOVERY']);
    expect(ALLOWED.RECOVERY).toEqual(['EXPANSION', 'CONTRACTION']);
    expect(P_BASE.EXPANSION).toEqual({ OVERHEATING: 0.80, CONTRACTION: 0.20 });
    expect(P_BASE.OVERHEATING).toEqual({ CONTRACTION: 0.85, EXPANSION: 0.15 });
    expect(P_BASE.CONTRACTION).toEqual({ RECOVERY: 1.00 });
    expect(P_BASE.RECOVERY).toEqual({ EXPANSION: 0.90, CONTRACTION: 0.10 });
  });
  it('the §3.3.4 hazard weights: OVH→CON is EXP→CON plus inflation 0.3', () => {
    const exp = HAZARD_WEIGHTS['EXPANSION>CONTRACTION']!;
    const ovh = HAZARD_WEIGHTS['OVERHEATING>CONTRACTION']!;
    expect(ovh.inflation).toBe(0.3);
    for (const k of ['credit', 'valuation', 'curve', 'policy', 'oil', 'fear', 'contagion', 'house', 'fiscal', 'trade'] as const) {
      expect(ovh[k]).toBe(exp[k]!);
    }
    expect(HAZARD_WEIGHTS['EXPANSION>OVERHEATING']).toEqual({ overheat: 0.5, inflation: 0.4, credit: 0.3, valuation: 0.2, policy: -0.4 });
    expect(HAZARD_WEIGHTS['OVERHEATING>EXPANSION']).toEqual({ credit: -0.4, inflation: -0.3, valuation: -0.2 });
    expect(HAZARD_WEIGHTS['CONTRACTION>RECOVERY']).toEqual({ stimulus: 0.4, contagion: -0.4, fear: -0.3 });
    expect(HAZARD_WEIGHTS['RECOVERY>EXPANSION']).toEqual({ stimulus: 0.2, fear: -0.2 });
    expect(HAZARD_WEIGHTS['RECOVERY>CONTRACTION']).toEqual({ fear: 0.4, policy: 0.4, contagion: 0.5 });
  });
  it('regimeParams reads the nine PARAM rows of §3.3.1', () => {
    expect(RP.meanDays).toEqual({ EXPANSION: 819, OVERHEATING: 273, CONTRACTION: 273, RECOVERY: 273 });
    expect(RP.minDays).toEqual({ EXPANSION: 182, OVERHEATING: 63, CONTRACTION: 91, RECOVERY: 91 });
    expect(() => regimeParams({ num: () => Number.NaN, int: () => 0 })).toThrow(/macro_regime_mean_days_exp = NaN/);
  });
});

describe('T04-03 transition multipliers and coupling (04 §3.3.2 steps 3-4)', () => {
  it('worked example: credit z = +2 gives M[CON] = e^0.8 = 2.225541 and M[OVH] = e^0.6 = 1.822119', () => {
    const m = transitionMultipliers('EXPANSION', { credit: 2 });
    expect(m.CONTRACTION).toBeCloseTo(2.225541, 6);
    expect(m.OVERHEATING).toBeCloseTo(1.822119, 6);
    expect(m.CONTRACTION).toBeCloseTo(dmath.exp(0.8), 12);
    expect(m.OVERHEATING).toBeCloseTo(dmath.exp(0.3 * 2), 12);
  });
  it('weightScale 0 switches the z-tilt off (M = 1 for every target)', () => {
    const m = transitionMultipliers('EXPANSION', { credit: 2 }, 0);
    expect(m.CONTRACTION).toBe(1);
    expect(m.OVERHEATING).toBe(1);
  });
  it('the z enters clamped to [−2, 3]', () => {
    const hi = transitionMultipliers('EXPANSION', { credit: 99 });
    const c3 = transitionMultipliers('EXPANSION', { credit: 3 });
    expect(hi.CONTRACTION).toBeCloseTo(c3.CONTRACTION!, 12);
    const lo = transitionMultipliers('EXPANSION', { credit: -99 });
    const cm2 = transitionMultipliers('EXPANSION', { credit: -2 });
    expect(lo.CONTRACTION).toBeCloseTo(cm2.CONTRACTION!, 12);
  });
  it('a missing imbalance does not tilt the hazard', () => {
    const m = transitionMultipliers('EXPANSION', {});
    expect(m.CONTRACTION).toBe(1);
    expect(m.OVERHEATING).toBe(1);
  });
  it('coupling: SRL (1.3) in EXPANSION with a global CONTRACTION gives M[CON] = e^0.78 = 2.181472', () => {
    const coupling = BLOC_DEFAULTS.SRL.cycleCoupling;
    expect(coupling).toBe(1.3);
    const m = applyCoupling('EXPANSION', transitionMultipliers('EXPANSION', {}), 'CONTRACTION', coupling);
    expect(m.CONTRACTION).toBeCloseTo(2.181472, 6);
    expect(m.CONTRACTION).toBeCloseTo(dmath.exp(0.6 * 1.3), 12);
    expect(m.OVERHEATING).toBe(1);
  });
  it('coupling: a global RECOVERY raises the way out of CONTRACTION by e^0.4·coupling', () => {
    const m = applyCoupling('CONTRACTION', transitionMultipliers('CONTRACTION', {}), 'RECOVERY', 1.0);
    expect(m.RECOVERY).toBeCloseTo(dmath.exp(0.4), 12);
    const none = applyCoupling('CONTRACTION', transitionMultipliers('CONTRACTION', {}), 'CONTRACTION', 1.0);
    expect(none.RECOVERY).toBe(1);   // a global CONTRACTION does not lift the bloc out of it
    const ovh = applyCoupling('EXPANSION', transitionMultipliers('EXPANSION', {}), 'RECOVERY', 1.0);
    expect(ovh.CONTRACTION).toBe(1);  // and does not touch a bloc that is not in CONTRACTION
  });
});

describe('T04-03 the one-day regime step (04 §3.3.2)', () => {
  it('worked example: H = (0.8·1.822119 + 0.2·2.225541)/637 = 0.00298713, P(transition) = 0.00298268', () => {
    const m = transitionMultipliers('EXPANSION', { credit: 2 });
    const { rng } = testRng('worked');
    const step = stepRegime(rng, 'EXPANSION', RP.minDays.EXPANSION, m, RP);
    expect(step.hazard).toBeCloseTo(0.00298713, 8);
    expect(1 - dmath.exp(-step.hazard)).toBeCloseTo(0.00298268, 8);
    expect(step.transitioned).toBe(false);   // this particular draw did not transition
    expect(step.next).toBe('EXPANSION');
  });
  it('worked example: the share to CONTRACTION with credit z = 2 is 0.233922', () => {
    const m = transitionMultipliers('EXPANSION', { credit: 2 });
    let sum = 0, toCon = 0;
    for (const to of ALLOWED.EXPANSION) { const w = (P_BASE.EXPANSION[to] ?? 0) * (m[to] ?? 1); sum += w; if (to === 'CONTRACTION') toCon = w; }
    expect(toCon / sum).toBeCloseTo(0.233922, 6);
  });
  it('coupling worked example: H = (0.8 + 0.2·2.181472)/637 = 0.00194081', () => {
    const m = applyCoupling('EXPANSION', transitionMultipliers('EXPANSION', {}), 'CONTRACTION', 1.3);
    const { rng } = testRng('coupling');
    const step = stepRegime(rng, 'EXPANSION', RP.minDays.EXPANSION, m, RP);
    expect(step.hazard).toBeCloseTo(0.00194081, 8);
  });
  it('the step consumes exactly two draws whatever happens (G8 fixed draw count)', () => {
    const { rng, draws } = testRng('draws');
    const m = transitionMultipliers('EXPANSION', {});
    stepRegime(rng, 'EXPANSION', RP.minDays.EXPANSION, m, RP);
    expect(draws()).toBe(2);
    stepRegime(rng, 'EXPANSION', 0, m, RP);          // below the minimum length
    expect(draws()).toBe(4);
    stepRegime(rng, 'CONTRACTION', 0, m, RP);
    expect(draws()).toBe(6);
  });
  it('the minimum length blocks the transition even with u1 = 0, and still consumes the two draws', () => {
    // u1 = 0 is the smallest uniform; a bloc 90 days into a CONTRACTION (min 91) must not move.
    const scripted = (xs: number[]): Rng => { let i = 0; return makeRng(() => xs[i++] ?? 0); };
    const m = transitionMultipliers('CONTRACTION', {});
    const blocked = stepRegime(scripted([0, 0]), 'CONTRACTION', 90, m, RP);
    expect(blocked.transitioned).toBe(false);
    expect(blocked.next).toBe('CONTRACTION');
    expect(blocked.hazard).toBe(0);
    const allowed = stepRegime(scripted([0, 0]), 'CONTRACTION', 91, m, RP);
    expect(allowed.transitioned).toBe(true);
    expect(allowed.next).toBe('RECOVERY');
  });
  it('a transition target follows ALLOWED and the second draw picks it', () => {
    // `next()` is the raw uint32 (02 §3.10.5); the scripted values are raw draws, not uniforms.
    const raw = (u: number): number => Math.floor(u * 4294967296);
    const scripted = (xs: number[]): Rng => { let i = 0; return makeRng(() => xs[i++] ?? 0); };
    const m = transitionMultipliers('EXPANSION', {});
    // u1 = 0 transitions; u2 = 0 picks the first target of ALLOWED[EXPANSION] (OVERHEATING).
    expect(stepRegime(scripted([0, 0]), 'EXPANSION', 200, m, RP).next).toBe('OVERHEATING');
    // u2 = 0.99 picks the last one (CONTRACTION).
    expect(stepRegime(scripted([0, raw(0.99)]), 'EXPANSION', 200, m, RP).next).toBe('CONTRACTION');
  });
  it('forceRegime ignores the minimum length and carries the crisis id', () => {
    const forced = forceRegime('EXPANSION', 'CONTRACTION', 'crs_ABC');
    expect(forced.forced).toBe(true);
    expect(forced.forcedBy).toBe('crs_ABC');
    expect(forced.next).toBe('CONTRACTION');
    expect(forced.transitioned).toBe(true);
    expect(() => forceRegime('EXPANSION', 'RECOVERY', 'crs_ABC')).toThrow(/not in ALLOWED/);
  });
  it('forceRegime on the regime the bloc is already in is a no-op, so the 21-day label lag is not restarted', () => {
    const same = forceRegime('CONTRACTION', 'CONTRACTION', 'crs_ABC');
    expect(same.next).toBe('CONTRACTION');
    expect(same.transitioned).toBe(false);   // the caller keeps regimeSinceTick
    expect(same.forced).toBe(true);
    expect(same.forcedBy).toBe('crs_ABC');
  });
});

describe('T04-03 AC 04#5: base chain with zero weights and the credit z of +2', () => {
  /** One eligible day from EXPANSION (daysIn at the minimum), repeated `n` times: the measured per-day transition
   *  probability after the minimum and the split between the two targets. */
  const measure = (seed: string, n: number, m: Partial<Record<Regime, number>>): { p: number; toOvH: number; toCon: number } => {
    const { rng } = testRng(seed);
    let transitions = 0, toOvH = 0, toCon = 0;
    for (let i = 0; i < n; i++) {
      const step = stepRegime(rng, 'EXPANSION', RP.minDays.EXPANSION, m, RP);
      if (!step.transitioned) continue;
      transitions += 1;
      if (step.next === 'OVERHEATING') toOvH += 1; else if (step.next === 'CONTRACTION') toCon += 1;
    }
    return { p: transitions / n, toOvH: toOvH / n, toCon: toCon / n };
  };

  it('AC-04-05 (a): with weightScale 0 the per-day transition probability is 1 − e^(−1/637) = 0.0015686 within 5%, split 0.80:0.20 within 0.02', () => {
    const m = transitionMultipliers('EXPANSION', { credit: 2 }, 0);   // the z-tilt is off
    const r = measure('ac04-5a', 2000000, m);
    const expected = 1 - dmath.exp(-1 / 637);
    expect(expected).toBeCloseTo(0.0015686, 7);
    expect(Math.abs(r.p - expected) / expected).toBeLessThan(0.05);
    // the split: P(OVH) / (P(OVH) + P(CON)) = 0.80
    const share = r.toOvH / (r.toOvH + r.toCon);
    expect(Math.abs(share - 0.80)).toBeLessThan(0.02);
  });

  it('AC-04-05 (b): with credit z = +2 the EXP→CON hazard is e^0.8 times the zero-z value within 10%', () => {
    const zero = measure('ac04-5b-base', 2000000, transitionMultipliers('EXPANSION', {}, 0));
    const cred = measure('ac04-5b-credit', 2000000, transitionMultipliers('EXPANSION', { credit: 2 }));
    const ratio = cred.toCon / zero.toCon;
    expect(ratio).toBeGreaterThan(dmath.exp(0.8) * 0.9);
    expect(ratio).toBeLessThan(dmath.exp(0.8) * 1.1);
  });
});

describe('T04-03 the chain obeys ALLOWED and the mean durations match §3.3.1', () => {
  it('every transition over 100,000 simulated days follows ALLOWED', () => {
    const { rng } = testRng('chain');
    let regime: Regime = 'EXPANSION', daysIn = 0, transitions = 0;
    const m = transitionMultipliers('EXPANSION', {});
    for (let day = 0; day < 100000; day++) {
      daysIn += 1;
      const step = stepRegime(rng, regime, daysIn, transitionMultipliers(regime, {}), RP);
      if (step.transitioned) {
        expect(ALLOWED[regime]).toContain(step.next);
        regime = step.next;
        daysIn = 0;
        transitions += 1;
      }
    }
    expect(transitions).toBeGreaterThan(0);
    expect(m).toBeDefined();
  });

  it('the mean durations with z = 0 are EXPANSION 819 and the others 273 (± 2%)', () => {
    const meanDuration = (start: Regime, cycles: number, seed: string): number => {
      const { rng } = testRng(seed);
      let total = 0;
      for (let c = 0; c < cycles; c++) {
        let daysIn = 0;
        for (;;) {
          daysIn += 1;
          const step = stepRegime(rng, start, daysIn, transitionMultipliers(start, {}), RP);
          if (step.transitioned) break;
        }
        total += daysIn;
      }
      return total / cycles;
    };
    const exp = meanDuration('EXPANSION', 20000, 'dur-exp');
    const ovh = meanDuration('OVERHEATING', 20000, 'dur-ovh');
    const con = meanDuration('CONTRACTION', 20000, 'dur-con');
    const rec = meanDuration('RECOVERY', 20000, 'dur-rec');
    expect(Math.abs(exp - 819) / 819).toBeLessThan(0.02);
    expect(Math.abs(ovh - 273) / 273).toBeLessThan(0.02);
    expect(Math.abs(con - 273) / 273).toBeLessThan(0.02);
    expect(Math.abs(rec - 273) / 273).toBeLessThan(0.02);
  });
});

describe('T04-03 the Cycle Committee label (04 §3.3.6)', () => {
  it('the latest growth print is the most recent of GDP_ADV, GDP_REV1 and GDP_REV2 by tick', () => {
    // the committee reads the most recent of the three GDP prints by tick (04 §3.3.6)
    const latestGrowthTick = (prints: PublicMacroView['prints']): number | null => {
      let best: LatestPrint | null = null;
      for (const k of ['GDP_ADV', 'GDP_REV1', 'GDP_REV2'] as const) {
        const p = prints[k];
        if (p === null || p === undefined) continue;
        if (best === null || p.tick > best.tick) best = p;
      }
      return best === null ? null : best.tick;
    };
    const prints = blankPrints();
    expect(latestGrowthTick(prints)).toBeNull();
    prints.GDP_ADV = print('GDP_ADV', 100, 0.02);
    prints.GDP_REV1 = print('GDP_REV1', 300, 0.01);
    prints.GDP_REV2 = print('GDP_REV2', 500, -0.01);
    expect(latestGrowthTick(prints)).toBe(500);
    // a revision older than the advance print does not win: the tick decides, not the kind order
    prints.GDP_REV2 = print('GDP_REV2', 50, -0.05);
    expect(latestGrowthTick(prints)).toBe(300);
  });
  it('a true CONTRACTION is not declared before day 21, and is declared on day 21 with a negative GDP print', () => {
    const prints = blankPrints();
    prints.GDP_ADV = print('GDP_ADV', 100, -0.01);
    const early = cycleLabelStep('CONTRACTION', 20, 'UNDETERMINED', prints, 0.04, 0.045, 0.02, 21);
    expect(early).toEqual({ label: 'UNDETERMINED', changed: false });
    const day21 = cycleLabelStep('CONTRACTION', 21, 'UNDETERMINED', prints, 0.04, 0.045, 0.02, 21);
    expect(day21).toEqual({ label: 'CONTRACTION', changed: true });
    // the label never changes twice for the same true regime
    expect(cycleLabelStep('CONTRACTION', 22, 'CONTRACTION', prints, 0.04, 0.045, 0.02, 21)).toEqual({ label: 'CONTRACTION', changed: false });
  });
  it('a positive GDP print with unemployment only 0.004 above its 12-month low does not declare a CONTRACTION', () => {
    const prints = blankPrints();
    prints.GDP_ADV = print('GDP_ADV', 100, 0.01);
    prints.JOBS = print('JOBS', 100, 0.044);
    const r = cycleLabelStep('CONTRACTION', 40, 'UNDETERMINED', prints, 0.04, 0.045, 0.02, 21);
    expect(r).toEqual({ label: 'UNDETERMINED', changed: false });
    // 0.005 above the low is enough (0.5 pp, §3.3.6)
    prints.JOBS = print('JOBS', 100, 0.045);
    expect(cycleLabelStep('CONTRACTION', 40, 'UNDETERMINED', prints, 0.04, 0.045, 0.02, 21)).toEqual({ label: 'CONTRACTION', changed: true });
  });
  it('EXPANSION and RECOVERY need a positive growth print; OVERHEATING needs CPI above target and unemployment below NAIRU', () => {
    const prints = blankPrints();
    prints.GDP_ADV = print('GDP_ADV', 100, 0.005);
    expect(cycleLabelStep('EXPANSION', 30, 'UNDETERMINED', prints, 0.04, 0.045, 0.02, 21).changed).toBe(true);
    expect(cycleLabelStep('RECOVERY', 30, 'UNDETERMINED', prints, 0.04, 0.045, 0.02, 21).changed).toBe(true);
    const flat = blankPrints();
    flat.GDP_ADV = print('GDP_ADV', 100, 0);
    expect(cycleLabelStep('EXPANSION', 30, 'UNDETERMINED', flat, 0.04, 0.045, 0.02, 21).changed).toBe(false);
    const hot = blankPrints();
    hot.CPI = print('CPI', 100, 0.035);
    hot.JOBS = print('JOBS', 100, 0.04);
    expect(cycleLabelStep('OVERHEATING', 30, 'UNDETERMINED', hot, 0.04, 0.045, 0.02, 21).changed).toBe(true);
    const cool = blankPrints();
    cool.CPI = print('CPI', 100, 0.025);   // below target + 1 pp
    cool.JOBS = print('JOBS', 100, 0.04);
    expect(cycleLabelStep('OVERHEATING', 30, 'UNDETERMINED', cool, 0.04, 0.045, 0.02, 21).changed).toBe(false);
    const unemployed = blankPrints();
    unemployed.CPI = print('CPI', 100, 0.035);
    unemployed.JOBS = print('JOBS', 100, 0.05);   // not below NAIRU
    expect(cycleLabelStep('OVERHEATING', 30, 'UNDETERMINED', unemployed, 0.04, 0.045, 0.02, 21).changed).toBe(false);
  });
});
