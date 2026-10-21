// T04-03: the imbalance z-scores of 04 §3.3.3 (computed at the day close, step 1 of the macro step) and the global
// chain's GDP-weighted z vector. Pure arithmetic over the inputs the other modules publish; no store, no clock.
// Determinism (G8): the only transcendental is ln, which goes through dmath (no Math.log); the key order is the
// fixed IMBALANCE_KEYS list (no Object.keys/values/entries).
import { dmath, EngineFault } from '@tycoon/engine-core';
import { BLOC_ORDER, IMBALANCE_KEYS, type BlocId, type ImbalanceKey } from '../schema';

export interface ImbalanceInputs {
  creditGap: number; peAgg: number | null; peNorm: number; y10: number; y3m: number; inversionDays: number; coreInflation: number; inflationTarget: number;
  housePriceGap: number; energyIndexNow: number; energyIndex63: number; commodityExporter: number; sovereignStress: number; fear: number;
  otherBlocsContractionGdpShare: number; realRateGapSmoothed: number; outputGap: number; wtiNow: number; wti182: number; fiscalImpulse: number;
}

/** §3.3.3: every z is clamped to [−3, 4] at storage. */
const Z_STORE_LO = -3, Z_STORE_HI = 4;

const num = (v: number, what: string): number => {
  if (!Number.isFinite(v)) throw new EngineFault('I0.macro_imbalance', `${what} = ${String(v)}`);
  return v;
};

/** The z-score of one row of the §3.3.3 table, before the storage clamp. */
function rawZ(i: ImbalanceInputs): Record<ImbalanceKey, number> {
  const credit = num(i.creditGap, 'creditGap') / 0.05;
  const valuation = i.peAgg === null || i.peAgg === undefined ? 0
    : dmath.ln(num(i.peAgg, 'peAgg') / num(i.peNorm, 'peNorm')) / 0.25;
  const y10 = num(i.y10, 'y10'), y3m = num(i.y3m, 'y3m');
  const curve = y10 - y3m < 0 ? num(i.inversionDays, 'inversionDays') / 63 + (y3m - y10) / 0.005 : -0.5;
  const inflation = (num(i.coreInflation, 'coreInflation') - num(i.inflationTarget, 'inflationTarget')) / 0.015;
  const house = num(i.housePriceGap, 'housePriceGap') / 0.15;
  const oil = dmath.ln(num(i.energyIndexNow, 'energyIndexNow') / num(i.energyIndex63, 'energyIndex63')) / 0.30
    * (1 - 2 * Math.max(0, num(i.commodityExporter, 'commodityExporter')));
  const fiscal = num(i.sovereignStress, 'sovereignStress') / 0.25;
  const fear = (num(i.fear, 'fear') - 50) / 20;
  const contagion = (num(i.otherBlocsContractionGdpShare, 'otherBlocsContractionGdpShare') - 0.2) / 0.2;
  const policy = num(i.realRateGapSmoothed, 'realRateGapSmoothed') / 0.015;
  const overheat = num(i.outputGap, 'outputGap') / 0.01;
  const trade = -dmath.ln(num(i.wtiNow, 'wtiNow') / num(i.wti182, 'wti182')) / 0.05;
  const stimulus = (-num(i.realRateGapSmoothed, 'realRateGapSmoothed') + num(i.fiscalImpulse, 'fiscalImpulse')) / 0.01;
  return { credit, valuation, curve, inflation, house, oil, fiscal, fear, contagion, policy, overheat, trade, stimulus };
}

/** The thirteen z-scores of §3.3.3, each clamped to [−3, 4] (the storage clamp). */
export function imbalanceZ(i: ImbalanceInputs): Record<ImbalanceKey, number> {
  const raw = rawZ(i);
  const out = {} as Record<ImbalanceKey, number>;
  for (const k of IMBALANCE_KEYS) out[k] = dmath.clamp(raw[k], Z_STORE_LO, Z_STORE_HI);
  return out;
}

/** The global chain's z vector: the GDP-weighted average of the five bloc vectors (§3.3.3, last sentence). */
export function globalZ(blocZ: Record<BlocId, Record<ImbalanceKey, number>>, gdpWeights: Record<BlocId, number>): Record<ImbalanceKey, number> {
  let total = 0;
  for (const b of BLOC_ORDER) total += num(gdpWeights[b], `gdpWeights.${b}`);
  if (!(total > 0)) throw new EngineFault('I0.macro_imbalance', `global gdp weights sum ${total}`);
  const out = {} as Record<ImbalanceKey, number>;
  for (const k of IMBALANCE_KEYS) {
    let acc = 0;
    for (const b of BLOC_ORDER) {
      const z = blocZ[b]?.[k];
      if (z === undefined || !Number.isFinite(z)) throw new EngineFault('I0.macro_imbalance', `blocZ.${b}.${k} missing`);
      acc += z * num(gdpWeights[b], `gdpWeights.${b}`);
    }
    out[k] = acc / total;
  }
  return out;
}

/** The inversion counter of the curve state (§3.7): it grows by one on every trading day with y10 < y3m and
 *  resets to zero the day the curve is not inverted. Non-trading days hold the previous value. */
export function nextInversionDays(prev: number, y10: number, y3m: number, isTradingDay: boolean): number {
  const p = num(prev, 'prev');
  if (!isTradingDay) return p;
  if (num(y10, 'y10') - num(y3m, 'y3m') < 0) return p + 1;
  return 0;
}
