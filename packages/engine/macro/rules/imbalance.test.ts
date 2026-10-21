// T04-03: the imbalance z-scores of 04 §3.3.3 and the global z vector.
import { describe, expect, it } from 'vitest';
import { dmath } from '@tycoon/engine-core';
import { globalZ, imbalanceZ, nextInversionDays, type ImbalanceInputs } from './imbalance';
import { BLOC_ORDER, type ImbalanceKey } from '../schema';

/** A neutral input row: every z-score is 0 (or the value that makes it 0). */
const base = (over: Partial<ImbalanceInputs> = {}): ImbalanceInputs => ({
  creditGap: 0, peAgg: null, peNorm: 20, y10: 0.04, y3m: 0.03, inversionDays: 0, coreInflation: 0.02, inflationTarget: 0.02,
  housePriceGap: 0, energyIndexNow: 100, energyIndex63: 100, commodityExporter: 0, sovereignStress: 0, fear: 50,
  otherBlocsContractionGdpShare: 0.2, realRateGapSmoothed: 0, outputGap: 0, wtiNow: 70, wti182: 70, fiscalImpulse: 0,
  ...over,
});

describe('T04-03 imbalance z-scores (04 §3.3.3)', () => {
  it('a neutral row gives zero everywhere except the curve, which is −0.5 when the curve is not inverted (§3.3.3)', () => {
    const z = imbalanceZ(base());
    for (const k of ['credit', 'valuation', 'inflation', 'house', 'oil', 'fiscal', 'fear', 'contagion', 'policy', 'overheat', 'trade', 'stimulus'] as ImbalanceKey[]) {
      expect(z[k]).toBeCloseTo(0, 12);
    }
    expect(z.curve).toBe(-0.5);
  });
  it('curve: inversion 30 days with y3m − y10 = 0.004 gives z = 30/63 + 0.8 = 1.276190; not inverted gives −0.5', () => {
    const inv = imbalanceZ(base({ y10: 0.036, y3m: 0.04, inversionDays: 30 }));
    expect(inv.curve).toBeCloseTo(1.276190, 6);
    expect(inv.curve).toBeCloseTo(30 / 63 + 0.8, 12);
    const flat = imbalanceZ(base());
    expect(flat.curve).toBe(-0.5);
  });
  it('oil for NKR (exporter 0.9): E 130 vs 100 gives ln 1.3/0.3 × (1 − 1.8) = −0.699638', () => {
    const z = imbalanceZ(base({ energyIndexNow: 130, energyIndex63: 100, commodityExporter: 0.9 }));
    expect(z.oil).toBeCloseTo(-0.699638, 6);
    expect(z.oil).toBeCloseTo(dmath.ln(1.3) / 0.3 * (1 - 1.8), 12);
  });
  it('clamp: a credit gap of 0.30 gives 6, stored as 4', () => {
    expect(imbalanceZ(base({ creditGap: 0.30 })).credit).toBe(4);
    expect(imbalanceZ(base({ creditGap: -0.30 })).credit).toBe(-3);
    expect(imbalanceZ(base({ creditGap: 0.05 })).credit).toBe(1);
  });
  it('valuation is 0 when the PE aggregate is missing, and ln(pe/peNorm)/0.25 otherwise', () => {
    expect(imbalanceZ(base({ peAgg: null })).valuation).toBe(0);
    expect(imbalanceZ(base({ peAgg: 20, peNorm: 20 })).valuation).toBe(0);
    expect(imbalanceZ(base({ peAgg: 25, peNorm: 20 })).valuation).toBeCloseTo(dmath.ln(1.25) / 0.25, 12);
  });
  it('the other rows of the §3.3.3 table', () => {
    const z = imbalanceZ(base({
      creditGap: 0.025, coreInflation: 0.03, inflationTarget: 0.02, housePriceGap: 0.06, sovereignStress: 0.05,
      fear: 60, otherBlocsContractionGdpShare: 0.4, realRateGapSmoothed: 0.0075, outputGap: 0.005,
      wtiNow: 80, wti182: 100, fiscalImpulse: 0.01,
    }));
    expect(z.credit).toBeCloseTo(0.5, 12);
    expect(z.inflation).toBeCloseTo(0.6666666666666666, 12);
    expect(z.house).toBeCloseTo(0.4, 12);
    expect(z.fiscal).toBeCloseTo(0.2, 12);
    expect(z.fear).toBeCloseTo(0.5, 12);
    expect(z.contagion).toBeCloseTo(1.0, 12);
    expect(z.policy).toBeCloseTo(0.5, 12);
    expect(z.overheat).toBeCloseTo(0.5, 12);
    expect(z.trade).toBeCloseTo(4, 12);   // the raw value −ln(80/100)/0.05 = 4.4629 is clamped to 4 at storage
    expect(z.stimulus).toBeCloseTo((-0.0075 + 0.01) / 0.01, 12);
  });
  it('globalZ is the GDP-weighted average of the five bloc vectors', () => {
    const mk = (v: number): Record<ImbalanceKey, number> => {
      const o = {} as Record<ImbalanceKey, number>;
      for (const k of ['credit', 'valuation', 'curve', 'inflation', 'house', 'oil', 'fiscal', 'fear', 'contagion', 'policy', 'overheat', 'trade', 'stimulus'] as ImbalanceKey[]) o[k] = v;
      return o;
    };
    const blocZ = { FDL: mk(1), EUN: mk(2), PYN: mk(3), NKR: mk(4), SRL: mk(5) };
    const weights = { FDL: 0.32, EUN: 0.22, PYN: 0.24, NKR: 0.07, SRL: 0.15 };
    const g = globalZ(blocZ, weights);
    const expected = (1 * 0.32 + 2 * 0.22 + 3 * 0.24 + 4 * 0.07 + 5 * 0.15);
    expect(g.credit).toBeCloseTo(expected, 12);
    expect(g.credit).toBeCloseTo(2.51, 12);
  });
  it('nextInversionDays: a trading day with an inverted curve adds one, a normal trading day resets to 0, a weekend holds', () => {
    expect(nextInversionDays(30, 0.036, 0.04, true)).toBe(31);
    expect(nextInversionDays(30, 0.04, 0.03, true)).toBe(0);
    expect(nextInversionDays(30, 0.036, 0.04, false)).toBe(30);
    expect(nextInversionDays(30, 0.04, 0.03, false)).toBe(30);
  });
  it('the bloc order of the global vector is the fixed BLOC_ORDER', () => {
    expect(BLOC_ORDER).toEqual(['FDL', 'EUN', 'PYN', 'NKR', 'SRL']);
  });
});
