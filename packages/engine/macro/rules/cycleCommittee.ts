// T04-03: the public Cycle Committee label (04 §3.3.6). The true regime is hidden (04 §2.3); the statistics office
// of each bloc publishes a label only once the true regime has lasted at least `macro_cycle_label_lag_days` game days
// AND the published data confirm it. Until the first declaration the label is `UNDETERMINED`.
// The rule reads published prints only (04 §2.4): a player who reads the committee's label before the committee does
// has a research edge, so the label must never leak the true regime early.
// Determinism (G8): pure arithmetic over the prints, no clock, no store, no draws.
import type { LatestPrint, PublicMacroView, Regime } from '../schema';

/** The three GDP prints of 04 §3.15.1; the most recent of them by tick is the "latest growth print". */
const GDP_PRINTS: readonly ('GDP_ADV' | 'GDP_REV1' | 'GDP_REV2')[] = Object.freeze(['GDP_ADV', 'GDP_REV1', 'GDP_REV2'] as const);

/** The most recent of the three GDP prints, by tick; null when none has been published yet. */
function latestGrowthPrint(prints: PublicMacroView['prints']): LatestPrint | null {
  let best: LatestPrint | null = null;
  for (const k of GDP_PRINTS) {
    const p = prints[k];
    if (p === null || p === undefined) continue;
    if (best === null || p.tick > best.tick) best = p;
  }
  return best;
}

/** The data condition of §3.3.6 for one true regime, given the published prints.
 *  CONTRACTION: the latest growth print is below 0, or the published unemployment is at least 0.5 pp above its
 *  12-month low. EXPANSION / RECOVERY: the latest growth print is above 0. OVERHEATING: the published CPI is at
 *  least 1 pp above the inflation target and the published unemployment is below the NAIRU.
 *  ⚠ PENDING RULING (E-81, Systems): §3.3.6 states the OVERHEATING condition on *core* CPI, but under the
 *  T04-16 card the CPI release's headline field is the one carried by `LatestPrint.actual` ("CPI headline yoy
 *  (headline field), core yoy and mom" — the core yoy lives in the release row's extra fields, which the public
 *  print does not carry). The comparison below therefore uses the published CPI print against target + 1 pp as a
 *  stand-in; this is NOT a decision on which series the public CPI print carries. The comment must not claim the
 *  print carries core CPI: as of T04-16, core yoy is unreachable by any consumer of the public view. */
function cycleDataHolds(trueRegime: Regime, prints: PublicMacroView['prints'], unemployment12mLow: number | null,
  nairu: number, inflationTarget: number): boolean {
  const growth = latestGrowthPrint(prints);
  const jobs = prints.JOBS ?? null;
  const unemployment = jobs === null ? null : jobs.actual;
  switch (trueRegime) {
    case 'CONTRACTION':
      if (growth !== null && growth.actual < 0) return true;
      if (unemployment !== null && unemployment12mLow !== null && unemployment >= unemployment12mLow + 0.005) return true;
      return false;
    case 'EXPANSION':
    case 'RECOVERY':
      return growth !== null && growth.actual > 0;
    case 'OVERHEATING': {
      const cpi = prints.CPI ?? null;
      if (cpi === null || cpi.actual < inflationTarget + 0.01) return false;
      return unemployment !== null && unemployment < nairu;
    }
    default:
      return false;
  }
}

/** One day close of the Cycle Committee (04 §3.3.6). Returns the new label and whether it changed.
 *  The caller emits `macro.cycle.declared` (PUBLIC) when `changed` is true; `sinceDay` of that event is the day the
 *  true regime started, which the caller derives from the game day and `daysInTrue`. */
export function cycleLabelStep(trueRegime: Regime, daysInTrue: number, current: PublicMacroView['cycleLabel'],
  prints: PublicMacroView['prints'], unemployment12mLow: number | null, nairu: number, inflationTarget: number,
  lagDays: number): { label: PublicMacroView['cycleLabel']; changed: boolean } {
  if (trueRegime === current) return { label: current, changed: false };      // the label already names the true regime
  if (!(daysInTrue >= lagDays)) return { label: current, changed: false };    // (a) the true regime must have lasted long enough
  if (!cycleDataHolds(trueRegime, prints, unemployment12mLow, nairu, inflationTarget)) return { label: current, changed: false };
  return { label: trueRegime, changed: true };
}
