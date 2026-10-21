// T04-03: the business-cycle regime chain (04 §3.3.1-§3.3.5). Pure functions over the day-close step:
// the base Markov chain, the imbalance-tilted hazard multipliers, the global coupling, and the one-day regime step.
// The true regime is hidden (04 §2.3); only T04-20 publishes the Cycle Committee label (rules/cycleCommittee.ts).
// Determinism (G8): every transcendental goes through dmath (no Math.exp/ln/pow), and the step consumes exactly two
// draws from the regime stream whatever happens (the draw count is fixed by 04 §3.3.2 step 1).
import { dmath, EngineFault, type ParamsView, type Rng } from '@tycoon/engine-core';
import { IMBALANCE_KEYS, type ImbalanceKey, type Regime } from '../schema';

/** §3.3.1 base chain: the only regimes a bloc may enter from a given one, in the fixed order the step walks them. */
export const ALLOWED: Readonly<Record<Regime, readonly Regime[]>> = Object.freeze({
  EXPANSION: Object.freeze(['OVERHEATING', 'CONTRACTION'] as const),
  OVERHEATING: Object.freeze(['CONTRACTION', 'EXPANSION'] as const),
  CONTRACTION: Object.freeze(['RECOVERY'] as const),
  RECOVERY: Object.freeze(['EXPANSION', 'CONTRACTION'] as const),
});

/** §3.3.1 base transition probabilities, indexed by target regime. */
export const P_BASE: Readonly<Record<Regime, Partial<Record<Regime, number>>>> = Object.freeze({
  EXPANSION: Object.freeze({ OVERHEATING: 0.80, CONTRACTION: 0.20 }),
  OVERHEATING: Object.freeze({ CONTRACTION: 0.85, EXPANSION: 0.15 }),
  CONTRACTION: Object.freeze({ RECOVERY: 1.00 }),
  RECOVERY: Object.freeze({ EXPANSION: 0.90, CONTRACTION: 0.10 }),
});

/** §3.3.4 hazard weights w_{s→s',k}. The key is `${from}>${to}`. */
export const HAZARD_WEIGHTS: Readonly<Record<string, Partial<Record<ImbalanceKey, number>>>> = Object.freeze({
  'EXPANSION>OVERHEATING': Object.freeze({ overheat: 0.5, inflation: 0.4, credit: 0.3, valuation: 0.2, policy: -0.4 }),
  'EXPANSION>CONTRACTION': Object.freeze({ credit: 0.4, valuation: 0.35, curve: 0.5, policy: 0.45, oil: 0.3, fear: 0.4, contagion: 0.6, house: 0.3, fiscal: 0.2, trade: 0.3 }),
  // OVH→CON carries the EXP→CON weights plus inflation 0.3 (§3.3.4)
  'OVERHEATING>CONTRACTION': Object.freeze({ credit: 0.4, valuation: 0.35, curve: 0.5, policy: 0.45, oil: 0.3, fear: 0.4, contagion: 0.6, house: 0.3, fiscal: 0.2, trade: 0.3, inflation: 0.3 }),
  'OVERHEATING>EXPANSION': Object.freeze({ credit: -0.4, inflation: -0.3, valuation: -0.2 }),
  'CONTRACTION>RECOVERY': Object.freeze({ stimulus: 0.4, contagion: -0.4, fear: -0.3 }),
  'RECOVERY>EXPANSION': Object.freeze({ stimulus: 0.2, fear: -0.2 }),
  'RECOVERY>CONTRACTION': Object.freeze({ fear: 0.4, policy: 0.4, contagion: 0.5 }),
});

/** §3.3.2 step 3: the z-scores enter clamped to [−2, 3] inside the multiplier exponent. */
export const Z_CLAMP_LO = -2, Z_CLAMP_HI = 3;

export interface RegimeParams { meanDays: Record<Regime, number>; minDays: Record<Regime, number> }

/** Reads the nine regime parameters of 04 §3.3.1 (PARAM rows `macro_regime_{mean,min}_days_{exp,ovh,con,rec}`). */
export function regimeParams(p: ParamsView): RegimeParams {
  const read = (key: string): number => {
    const v = p.num(key);
    if (!Number.isFinite(v)) throw new EngineFault('I0.macro_regime_params', `${key} = ${String(v)}`);
    return v;
  };
  return {
    meanDays: {
      EXPANSION: read('macro_regime_mean_days_exp'), OVERHEATING: read('macro_regime_mean_days_ovh'),
      CONTRACTION: read('macro_regime_mean_days_con'), RECOVERY: read('macro_regime_mean_days_rec'),
    },
    minDays: {
      EXPANSION: read('macro_regime_min_days_exp'), OVERHEATING: read('macro_regime_min_days_ovh'),
      CONTRACTION: read('macro_regime_min_days_con'), RECOVERY: read('macro_regime_min_days_rec'),
    },
  };
}

/** The multiplier M_{s→s'} = exp(Σ_k w_{s→s',k} · clamp(z_k, −2, 3)) of §3.3.2 step 3. `weightScale` scales every weight
 *  (tests use 0 to switch the z-tilt off entirely, §3.3.4 DEFAULT). A target with no weight row keeps M = 1. */
export function transitionMultipliers(from: Regime, z: Partial<Record<ImbalanceKey, number>>, weightScale: number = 1): Partial<Record<Regime, number>> {
  if (!Number.isFinite(weightScale)) throw new EngineFault('I0.macro_regime_weight', `weightScale = ${String(weightScale)}`);
  const out: Partial<Record<Regime, number>> = {};
  for (const to of ALLOWED[from]) {
    const w = HAZARD_WEIGHTS[`${from}>${to}`];
    if (w === undefined) { out[to] = 1; continue; }   // no weight row: M = 1
    let sum = 0;
    for (const k of IMBALANCE_KEYS) {                 // fixed key order (G8: no Object.keys)
      const wv = w[k];
      if (wv === undefined) continue;
      const zk = z[k];
      if (zk === undefined || !Number.isFinite(zk)) continue;   // a missing imbalance does not tilt the hazard
      sum += wv * dmath.clamp(zk, Z_CLAMP_LO, Z_CLAMP_HI);
    }
    out[to] = dmath.exp(weightScale * sum);
  }
  return out;
}

/** §3.3.2 step 4: the global coupling. A global CONTRACTION raises the bloc's hazard into CONTRACTION; a global
 *  RECOVERY or EXPANSION raises the bloc's way out of CONTRACTION. The global chain itself is never coupled. */
export function applyCoupling(from: Regime, m: Partial<Record<Regime, number>>, globalRegime: Regime, cycleCoupling: number): Partial<Record<Regime, number>> {
  if (!Number.isFinite(cycleCoupling)) throw new EngineFault('I0.macro_regime_coupling', `cycleCoupling = ${String(cycleCoupling)}`);
  const out: Partial<Record<Regime, number>> = { ...m };
  if (globalRegime === 'CONTRACTION') {
    if (out.CONTRACTION !== undefined) out.CONTRACTION = out.CONTRACTION * dmath.exp(0.6 * cycleCoupling);
  } else if ((globalRegime === 'RECOVERY' || globalRegime === 'EXPANSION') && from === 'CONTRACTION') {
    if (out.RECOVERY !== undefined) out.RECOVERY = out.RECOVERY * dmath.exp(0.4 * cycleCoupling);
  }
  return out;
}

export interface RegimeStep { next: Regime; transitioned: boolean; hazard: number; u1: number; u2: number | null; forced: boolean; forcedBy?: string }

/** The one-day regime step of §3.3.2 (per bloc, and once for the global chain).
 *  `m` holds the multipliers M_{s→s'} (already tilted by the z-scores and, for blocs, by the coupling).
 *  Exactly two draws are consumed from `rng` in every case (G8 fixed draw count): u1 decides whether the day
 *  transitions, u2 picks the target and is ignored when there is no transition.
 *  02 §3.10.5 makes `next()` the raw uint32 of the stream and `u53()` the 53-bit uniform; the card's two uniforms
 *  are the two raw draws scaled by 2^-32, so the step costs exactly two ledger draws (u53() would cost four). */
export function stepRegime(rng: Rng, from: Regime, daysIn: number, m: Partial<Record<Regime, number>>, rp: RegimeParams): RegimeStep {
  const u1 = rng.next() / 4294967296, u2 = rng.next() / 4294967296;   // 2^-32: the raw uint32 as a uniform on [0,1)
  const minS = rp.minDays[from];
  const meanS = rp.meanDays[from];
  if (!Number.isFinite(minS) || !Number.isFinite(meanS)) throw new EngineFault('I0.macro_regime_params', `regime ${from}: mean ${String(meanS)} min ${String(minS)}`);
  if (daysIn < minS) return { next: from, transitioned: false, hazard: 0, u1, u2: null, forced: false };
  const span = meanS - minS;
  if (!(span > 0)) throw new EngineFault('I0.macro_regime_params', `regime ${from}: mean ${meanS} must exceed min ${minS}`);
  const lambda = 1 / span;
  // H = λ_s · Σ_{s'} P_base(s→s') · M(s→s')  (§3.3.2 step 5)
  let sum = 0;
  for (const to of ALLOWED[from]) sum += (P_BASE[from][to] ?? 0) * (m[to] ?? 1);
  const hazard = lambda * sum;
  const pTransition = 1 - dmath.exp(-hazard);
  if (!(u1 < pTransition)) return { next: from, transitioned: false, hazard, u1, u2: null, forced: false };
  // §3.3.2 step 6: the target is picked with probability P_base·M / Σ, walking ALLOWED in its fixed order.
  // The test is `u2·Σ < cum`, with cum the running sum of the raw weights P_base·M.
  let cum = 0;
  let target: Regime = ALLOWED[from][ALLOWED[from].length - 1]!;
  for (const to of ALLOWED[from]) {
    cum += (P_BASE[from][to] ?? 0) * (m[to] ?? 1);
    if (u2 * sum < cum) { target = to; break; }
  }
  return { next: target, transitioned: true, hazard, u1, u2, forced: false };
}

/** §3.3.2 step 7: a crisis may force a regime; a forced transition ignores the minimum length and carries the
 *  crisis id so the caller can log it in the WorldEvent cause chain. No draw is consumed (the forced path replaces
 *  the ordinary step, it does not add to it). */
export function forceRegime(from: Regime, to: Regime, worldEventId: string): RegimeStep {
  if (!ALLOWED[from].includes(to)) throw new EngineFault('I0.macro_regime_forced', `forced transition ${from}→${to} is not in ALLOWED`);
  return { next: to, transitioned: true, hazard: 1, u1: 0, u2: null, forced: true, forcedBy: worldEventId };
}
