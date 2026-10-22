// T10A-12 (city placement, unit U4): the suitability of a parcel for a facility.
//
// The card's step 4, verbatim: "for each parcel and facility, EXCLUDED if the role is in
// `excludeRoles` or missing from `allowedRoles`, the lot type is not allowed, the area is outside
// the footprint, a `needs` item fails, or a buffer to an existing receptor fails. Otherwise
// ALLOWED, or PREFERRED if the role is preferred. The score is an integer: 1000*preferred +
// 100*(near rules met) + floor(lotType rank bonus). Reason codes form a closed set (`ROLE`, `LOT`,
// `AREA`, `NEED_<x>`, `BUFFER`, `RESERVED`)."
//
// The score is an INTEGER and never a float: the lot-type rank bonus is the rank itself, and the
// near-rule bonus is a count.

import { sortBy } from '@tycoon/engine-core/order';
import type {
  DistrictRole,
  FacilityCondition,
  FacilityNeed,
  FacilityRule,
  PlacementAssignment,
  PlacementCtx,
  PlacementParcel,
  Suitability,
  SuitabilityReason,
} from './types';
import { FACILITY_RULES, facilityRule } from './rules';
import { isAssignable, lotType } from './classify';
import { bufferCm, nuisanceOf } from './buffers';

/** The score bonus of a preferred role. */
export const PREFERRED_BONUS = 1000;
/** The score bonus of each met near rule. */
export const NEAR_BONUS = 100;

/** The reason code of a failed need: the card's closed set is `NEED_<x>`, one code per need. */
export const needReason = (need: FacilityNeed): SuitabilityReason => `NEED_${need}`;

/**
 * True when the parcel satisfies a named need.
 *
 * The needs are the card's:
 *   - `WATERFRONT`: the parcel has a quay edge (a parcel edge on a quay wall).
 *   - `RAIL`: the parcel has rail access.
 *   - `GRID_MW`: the parcel's grid connection carries the megawatts the facility needs.
 *   - `ARTERIAL`: an arterial road serves the parcel.
 *   - `MAIN_AVENUE`: the parcel fronts the main avenue.
 *   - `CORNER_LOT`: the parcel is a corner lot.
 *   - `TRANSIT_400M`: the parcel is within 400 m of a transit stop.
 */
export function needHolds(need: FacilityNeed, p: PlacementParcel, ctx: PlacementCtx): boolean {
  switch (need) {
    case 'WATERFRONT':
      return ctx.flagsOf(p.id).quayEdge !== null;
    case 'RAIL':
      return ctx.flagsOf(p.id).railAccess;
    case 'GRID_MW':
      return ctx.gridMw(p.id);
    case 'ARTERIAL':
      return ctx.arterial(p.id);
    case 'MAIN_AVENUE':
      return p.attributes.mainAvenue;
    case 'CORNER_LOT':
      return p.attributes.cornerLot;
    case 'TRANSIT_400M':
      return p.attributes.transitDist <= 400;
    default:
      return false;
  }
}

/**
 * True when a hard condition holds: a named need, or a distance bound to a near target.
 *
 * A distance bound holds when the target EXISTS and is within the bound. A target that does not
 * exist in this city (`null`) does not hold the condition - "the boutique needs MAIN_AVENUE or
 * WATERFRONT" cannot be satisfied by the absence of both.
 */
export function conditionHolds(
  condition: FacilityCondition,
  p: PlacementParcel,
  ctx: PlacementCtx,
): boolean {
  if ('need' in condition) return needHolds(condition.need, p, ctx);
  const d = ctx.nearDistanceM(p.id, condition.near);
  return d !== null && d <= condition.maxM;
}

/**
 * The suitability of a parcel for EVERY facility, sorted by facility id (the card's signature:
 * "one per facility, sorted by facility id").
 */
export function suitability(
  p: PlacementParcel,
  role: DistrictRole,
  ctx: PlacementCtx,
): Suitability[] {
  const out: Suitability[] = [];
  for (const rule of FACILITY_RULES) out.push(verdict(p, role, ctx, rule));
  return sortBy(out, (v) => [v.facility]);
}

/**
 * The suitability of ONE parcel for ONE facility.
 *
 * The verdict is EXCLUDED when any hard condition fails, and the reasons name every failure, so a
 * reviewer sees WHY a parcel was refused.
 */
export function verdict(
  p: PlacementParcel,
  role: DistrictRole,
  ctx: PlacementCtx,
  rule: FacilityRule,
): Suitability {
  const reasons: SuitabilityReason[] = [];

  // A reserved parcel is never assignable (card "Implementation steps" 2).
  if (!isAssignable(p)) {
    return {
      parcelId: p.id,
      facility: rule.facility,
      verdict: 'EXCLUDED',
      score: 0,
      reasons: ['RESERVED'],
    };
  }

  // The role: excluded, or not allowed at all.
  if (rule.excludeRoles.includes(role)) reasons.push('ROLE');
  else if (!rule.allowedRoles.includes(role)) reasons.push('ROLE');

  // The lot type.
  const lot = lotType(p);
  if (!rule.lotTypes.includes(lot)) reasons.push('LOT');

  // The footprint: the parcel area must be inside the range, inclusive.
  if (p.areaM2 < rule.footprintM2[0] || p.areaM2 > rule.footprintM2[1]) reasons.push('AREA');

  // The hard needs: every one of them must hold.
  for (const need of rule.needs) {
    if (!needHolds(need, p, ctx)) reasons.push(needReason(need));
  }

  // The hard "or" clauses: at least one of them must hold.
  if (rule.needsAny && rule.needsAny.length > 0) {
    const anyHolds = rule.needsAny.some((c) => conditionHolds(c, p, ctx));
    if (!anyHolds) {
      // The reason names the FIRST condition of the clause, so the code set stays closed and the
      // failure is readable.
      reasons.push(reasonOfCondition(rule.needsAny[0]!));
    }
  }

  // The buffer to an existing receptor (and, symmetrically, an existing receptor to this parcel).
  if (bufferFails(p, ctx, rule)) reasons.push('BUFFER');

  if (reasons.length > 0) {
    return { parcelId: p.id, facility: rule.facility, verdict: 'EXCLUDED', score: 0, reasons };
  }

  // The score: 1000 * preferred + 100 * (near rules met) + the lot-type rank bonus.
  const preferred = rule.preferredRoles.includes(role) ? PREFERRED_BONUS : 0;
  let nearMet = 0;
  for (const n of rule.near ?? []) {
    const d = ctx.nearDistanceM(p.id, n.facility);
    if (d !== null && d <= n.maxM) nearMet += 1;
  }
  const lotRank = lotTypeRank(rule, lot);
  const score = preferred + nearMet * NEAR_BONUS + lotRank;

  return {
    parcelId: p.id,
    facility: rule.facility,
    verdict: preferred > 0 ? 'PREFERRED' : 'ALLOWED',
    score,
    reasons: [],
  };
}

/** The reason code of a hard condition: `NEED_<x>` for a need, and `NEED_<target>` for a bound. */
function reasonOfCondition(condition: FacilityCondition): SuitabilityReason {
  if ('need' in condition) return needReason(condition.need);
  switch (condition.near) {
    case 'RES_LOAD':
      return 'NEED_RES_LOAD';
    case 'PORT_EDGE':
      return 'NEED_PORT_EDGE';
    case 'STATION':
      return 'NEED_STATION';
    case 'CBD_PEAK':
      return 'NEED_CBD_PEAK';
    default:
      // MAIN_AVENUE as a DISTANCE bound is a different code from MAIN_AVENUE as a need: the two
      // are different conditions and a reviewer must be able to tell them apart.
      return 'NEED_MAIN_AVENUE_DIST';
  }
}

/**
 * The lot-type rank bonus: the index of the parcel's lot type in the rule's list, so the rule's
 * FIRST lot type is the preferred one and scores the most (card: "`lotTypes` (allowed; first =
 * preferred)").
 */
export function lotTypeRank(rule: FacilityRule, lot: string): number {
  const i = rule.lotTypes.indexOf(lot as FacilityRule['lotTypes'][number]);
  return i < 0 ? 0 : rule.lotTypes.length - i;
}

/**
 * True when the parcel fails the buffer rule.
 *
 * Two symmetric conditions (card "Buffers", "the buffers are symmetric"):
 *   1. the parcel is a RECEPTOR and it lies inside the buffer of an already-placed facility;
 *   2. the facility is N2 or N3 and the parcel lies inside the buffer of an already-placed
 *      receptor.
 *
 * The distances come from the caller's context, because the buffer geometry belongs to the
 * generator that owns the polygons; the caller reports the exact edge distance in centimetres.
 */
function bufferFails(p: PlacementParcel, ctx: PlacementCtx, rule: FacilityRule): boolean {
  const need = bufferCm(nuisanceOf(rule.facility));
  if (need <= 0) return false;
  const assigned: readonly PlacementAssignment[] = ctx.placedFacilities;

  // 1. The parcel is a receptor next to an existing facility.
  if (ctx.receptorParcelIds.includes(p.id)) {
    for (const a of assigned) {
      const aRule = facilityRule(a.facility);
      if (!aRule) continue;
      const aNeed = bufferCm(aRule.nuisance);
      if (aNeed <= 0) continue;
      const d = ctx.bufferDistanceCm(p.id, a.parcelId);
      if (d !== null && d < aNeed) return true;
    }
  }

  // 2. The facility is a heavy one next to an existing receptor.
  for (const a of assigned) {
    if (!ctx.receptorParcelIds.includes(a.parcelId)) continue;
    const d = ctx.bufferDistanceCm(p.id, a.parcelId);
    if (d !== null && d < need) return true;
  }
  return false;
}
