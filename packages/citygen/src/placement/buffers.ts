// T10A-12 (city placement, unit U3): the exact integer buffers.
//
// The buffer is measured from the RECEPTOR's edge to the FACILITY's edge, in integer
// centimetres, and the decision is made with integer arithmetic only: no float enters a
// comparison (10 §3.19.1, card "Implementation steps" 3).
//
// The buffers are SYMMETRIC: they constrain a new receptor next to an existing N2/N3 facility as
// well as a new facility next to an existing receptor (card "Exploit analysis", reverse
// griefing). `bufferViolations` therefore checks BOTH directions, and `receptorBlocked`
// answers "may this parcel be a receptor?".
//
// EXACTNESS. The distance between two polygons is the minimum over their edge pairs. An edge
// pair's distance is either an endpoint-to-segment distance (an exact integer squared distance)
// or the interior-to-interior distance `num^2 * lenA / cross^2`, which is RATIONAL. Every
// comparison against a squared limit is therefore done CROSS-MULTIPLIED
// (`num^2 * lenA <= limitSq * cross^2`), so a boundary case is decided exactly and never by a
// rounded division. The reported distance is the floor of the exact one, so a reported distance
// is never larger than the truth.

import { sortBy } from '@tycoon/engine-core/order';
import type {
  FixedPointCoord,
  FixedPointPolygon,
  Nuisance,
  PlacementAssignment,
  PlacementParcel,
} from './types';
import { BUFFER_M, facilityRule } from './rules';
import { findById } from './classify';

/**
 * A squared distance as an exact rational: `num / den`, with `den > 0`.
 *
 * `Infinity` stands for "no candidate" (the segments are parallel or degenerate, so an
 * endpoint case covers them).
 */
interface RatSq {
  /** The numerator. */
  num: number;
  /** The denominator, strictly positive. */
  den: number;
}

/** The "no candidate" rational: larger than any real squared distance. */
const INF_RAT: RatSq = { num: Number.MAX_SAFE_INTEGER, den: 1 };

/** True when the rational is the "no candidate" marker. */
const isInf = (r: RatSq): boolean => r.num === Number.MAX_SAFE_INTEGER && r.den === 1;

/**
 * The exact edge distance between two polygons, in centimetres.
 *
 * The distance between two polygons is the smallest distance between any two points of their
 * boundaries. It is computed exactly, in integers:
 *   - if the two boundaries intersect or touch, the distance is 0;
 *   - otherwise it is the smallest distance between any edge of A and any edge of B.
 */
export function edgeDistanceCm(a: FixedPointPolygon, b: FixedPointPolygon): number {
  if (a.length === 0 || b.length === 0) return Number.MAX_SAFE_INTEGER;

  // Touching or overlapping: the boundaries meet, so the distance is 0.
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]!;
    const a2 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]!;
      const b2 = b[(j + 1) % b.length]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return 0;
    }
  }

  // Otherwise: the smallest distance between any edge pair, computed in exact rationals.
  let best = INF_RAT;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]!;
    const a2 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]!;
      const b2 = b[(j + 1) % b.length]!;
      const sq = segSegDistSq(a1, a2, b1, b2);
      if (isInf(sq)) continue;
      if (isInf(best) || ratLess(sq, best)) best = sq;
    }
  }
  if (isInf(best)) return Number.MAX_SAFE_INTEGER;
  // The exact distance in whole centimetres: floor(sqrt(best)). The floor is computed on the
  // rational by comparing squares, so it is exact.
  return isqrtRat(best);
}

/**
 * The integer square root: the greatest `r` with `r*r <= n`.
 *
 * Newton's method on integers, exact for every non-negative integer input up to 2^53.
 */
export function isqrt(n: number): number {
  if (n < 0) throw new Error(`isqrt: negative ${n}`);
  if (n < 2) return n;
  let x = n;
  let y = (x + 1) >> 1;
  while (y < x) {
    x = y;
    y = (x + Math.floor(n / x)) >> 1;
  }
  return x;
}

/** The floor of the square root of a non-negative rational, computed exactly. */
export function isqrtRat(r: RatSq): number {
  // floor(sqrt(num/den)) = floor(sqrt(num*1e0 / den)). The candidate is found by an integer
  // binary search on the comparison `c*c*den <= num`, which is exact.
  if (r.num <= 0) return 0;
  let lo = 0;
  let hi = 1;
  while (hi * hi * r.den <= r.num) hi *= 2;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (mid * mid * r.den <= r.num) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** True when the rational `a` is strictly less than the rational `b` (both with den > 0). */
function ratLess(a: RatSq, b: RatSq): boolean {
  return a.num * b.den < b.num * a.den;
}

/** True when the rational `a` is at most the rational `b` (both with den > 0). */
function ratLe(a: RatSq, b: RatSq): boolean {
  return a.num * b.den <= b.num * a.den;
}

/**
 * The squared distance from a point to a segment, as an exact rational.
 *
 * The interior case is `cross^2 / len2`, which is rational; the endpoint cases are exact
 * integers, represented with denominator 1.
 */
export function pointSegDistSq(a: FixedPointCoord, b: FixedPointCoord, p: FixedPointCoord): RatSq {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const wx = p.x - a.x;
  const wz = p.z - a.z;
  const len2 = vx * vx + vz * vz;
  if (len2 === 0) return { num: wx * wx + wz * wz, den: 1 };
  const dot = wx * vx + wz * vz;
  if (dot <= 0) return { num: wx * wx + wz * wz, den: 1 };
  if (dot >= len2) {
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    return { num: dx * dx + dz * dz, den: 1 };
  }
  const cross = vx * wz - vz * wx;
  return { num: cross * cross, den: len2 };
}

/**
 * The squared distance between two segments, as an exact rational.
 *
 * The minimum over the four endpoint-to-segment distances and the interior-to-interior case.
 */
function segSegDistSq(
  a1: FixedPointCoord,
  a2: FixedPointCoord,
  b1: FixedPointCoord,
  b2: FixedPointCoord,
): RatSq {
  let best = pointSegDistSq(b1, b2, a1);
  const c2 = pointSegDistSq(b1, b2, a2);
  if (ratLess(c2, best)) best = c2;
  const c3 = pointSegDistSq(a1, a2, b1);
  if (ratLess(c3, best)) best = c3;
  const c4 = pointSegDistSq(a1, a2, b2);
  if (ratLess(c4, best)) best = c4;
  const interior = interiorDistSq(a1, a2, b1, b2);
  if (!isInf(interior) && ratLess(interior, best)) best = interior;
  return best;
}

/**
 * The squared interior-to-interior distance between two segments, as an exact rational, or the
 * "no candidate" marker when the closest points are not both interior (or the segments are
 * parallel or degenerate, in which case an endpoint case covers them).
 *
 * For two non-parallel segments the squared distance is `num^2 * lenA / cross^2`, where `num`
 * is the cross product of the two direction vectors with the offset between the segments.
 */
function interiorDistSq(
  a1: FixedPointCoord,
  a2: FixedPointCoord,
  b1: FixedPointCoord,
  b2: FixedPointCoord,
): RatSq {
  const ux = a2.x - a1.x;
  const uz = a2.z - a1.z;
  const vx = b2.x - b1.x;
  const vz = b2.z - b1.z;
  const wx = a1.x - b1.x;
  const wz = a1.z - b1.z;
  const lenA = ux * ux + uz * uz;
  if (lenA === 0) return INF_RAT;
  const cross = ux * vz - uz * vx;
  if (cross === 0) return INF_RAT; // parallel: an endpoint case covers it
  const num = uz * wx - vx * wz;
  const den = ux * wz - uz * wx;
  // Both parameters must be strictly inside their segments. The parameter on A is `num/cross`
  // and the one on B is `den/cross`, so the sign of `cross` decides the direction.
  if (!inOpenInterval(num, cross)) return INF_RAT;
  if (!inOpenInterval(den, cross)) return INF_RAT;
  return { num: num * num * lenA, den: cross * cross };
}

/**
 * True when `num / den` lies strictly between 0 and 1, for integers `num` and a NON-ZERO `den`.
 *
 * The sign of `den` is handled by flipping the comparison.
 */
function inOpenInterval(num: number, den: number): boolean {
  if (den < 0) {
    // num/den in (0,1) with den < 0 means num/den < 0 and > 1 flipped: num > 0 gives a
    // negative ratio, so the condition is num and den to have opposite signs and |num| < |den|.
    if (num === 0) return false;
    if (num > 0) return false; // positive over negative is negative
    return -num < -den; // both negative: |num| < |den|
  }
  return num > 0 && num < den;
}

/**
 * True when the two segments are within `limitSq` (a squared distance) of each other.
 *
 * The test is exact: every candidate squared distance is compared to the limit with integers,
 * and the interior-interior case is cross-multiplied so that no rounding decides a boundary.
 */
export function segSegWithin(
  a1: FixedPointCoord,
  a2: FixedPointCoord,
  b1: FixedPointCoord,
  b2: FixedPointCoord,
  limitSq: number,
): boolean {
  if (segmentsIntersect(a1, a2, b1, b2)) return true;
  const c1 = pointSegDistSq(b1, b2, a1);
  if (ratLe(c1, { num: limitSq, den: 1 })) return true;
  const c2 = pointSegDistSq(b1, b2, a2);
  if (ratLe(c2, { num: limitSq, den: 1 })) return true;
  const c3 = pointSegDistSq(a1, a2, b1);
  if (ratLe(c3, { num: limitSq, den: 1 })) return true;
  const c4 = pointSegDistSq(a1, a2, b2);
  if (ratLe(c4, { num: limitSq, den: 1 })) return true;
  // The interior-interior case, cross-multiplied: num^2 * lenA <= limitSq * cross^2.
  const interior = interiorDistSq(a1, a2, b1, b2);
  if (isInf(interior)) return false;
  return interior.num <= limitSq * interior.den;
}

/**
 * True when the two segments intersect or touch (10 §3.19.1's robust integer predicate).
 *
 * The orientation test is exact: the sign of a cross product, with no float.
 */
export function segmentsIntersect(
  a1: FixedPointCoord,
  a2: FixedPointCoord,
  b1: FixedPointCoord,
  b2: FixedPointCoord,
): boolean {
  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  // Collinear or touching cases.
  if (d1 === 0 && onSegment(a1, a2, b1)) return true;
  if (d2 === 0 && onSegment(a1, a2, b2)) return true;
  if (d3 === 0 && onSegment(b1, b2, a1)) return true;
  if (d4 === 0 && onSegment(b1, b2, a2)) return true;
  return false;
}

/** The cross product of (b - a) and (c - a), as an exact integer. */
export function cross(a: FixedPointCoord, b: FixedPointCoord, c: FixedPointCoord): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

/** True when the collinear point `p` lies on the segment `a`-`b`. */
export function onSegment(a: FixedPointCoord, b: FixedPointCoord, p: FixedPointCoord): boolean {
  return (
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.z >= Math.min(a.z, b.z) &&
    p.z <= Math.max(a.z, b.z)
  );
}

// ---------- the receptors ----------

/**
 * True when a parcel is a BUFFER RECEPTOR: a RES parcel, a hospital parcel, or a CIVIC parcel
 * tagged school (card "Buffers").
 *
 * "RES parcels (any lot type with RES in `zoning.allowed` and RES as the primary use)": both
 * conditions, so a mixed-use parcel whose primary use is a shop is not a receptor.
 */
export function isReceptor(p: PlacementParcel): boolean {
  if (p.primaryUse === 'RES' && p.zoning.allowed.includes('RES')) return true;
  if (p.attributes.school && p.zoning.class === 'civic') return true;
  if (p.zoning.class === 'civic' && p.primaryUse === 'HOSPITALITY') return true;
  return false;
}

// ---------- the violations ----------

/** One buffer violation. */
export interface BufferViolation {
  /** The parcel of the facility that is too close. */
  facilityParcel: string;
  /** The parcel of the receptor that is too close. */
  receptorParcel: string;
  /** The edge distance between the two, in centimetres. */
  distCm: number;
  /** The distance the buffer requires, in centimetres. */
  needCm: number;
}

/** The buffer of a nuisance class, in centimetres. */
export const bufferCm = (nuisance: Nuisance): number => BUFFER_M[nuisance] * 100;

/** The nuisance class of a facility, from the rules table. */
export const nuisanceOf = (facility: string): Nuisance => {
  const rule = facilityRule(facility);
  return rule ? rule.nuisance : 'N0';
};

/**
 * The buffer violations of a set of assignments, in BOTH directions (INV-PLC-2).
 *
 * A violation is a pair (facility parcel, receptor parcel) whose edge distance is below the
 * facility's buffer. The check is symmetric: it does not matter which was placed first, because
 * the card's buffers constrain a new receptor next to an existing facility exactly as they
 * constrain a new facility next to an existing receptor.
 *
 * The RECEPTORS are the region's receptor PARCELS, not only the assigned ones: a housing estate
 * is a receptor whether or not it carries a sector facility, and a receptor created after
 * genesis is covered the same way (card "Buffers", INV-PLC-2).
 *
 * N0 and N1 never violate: their buffer is 0 m.
 */
export function bufferViolations(
  assigned: readonly PlacementAssignment[],
  parcels: readonly PlacementParcel[],
): BufferViolation[] {
  const byId = sortBy(parcels, (p) => [p.id]);
  const out: BufferViolation[] = [];
  for (const a of assigned) {
    const fac = findById(byId, a.parcelId);
    if (!fac) continue;
    const need = bufferCm(nuisanceOf(a.facility));
    if (need <= 0) continue;
    for (const rec of parcels) {
      if (rec.id === a.parcelId) continue;
      // A hospital is not a nuisance to another hospital.
      if (!isReceptorFor(rec, a.facility)) continue;
      const d = edgeDistanceCm(fac.polygon, rec.polygon);
      if (d < need) {
        out.push({
          facilityParcel: a.parcelId,
          receptorParcel: rec.id,
          distCm: d,
          needCm: need,
        });
      }
    }
  }
  return out;
}

/**
 * True when a parcel may NOT be a receptor because it sits inside the buffer of an existing
 * facility (AC-10A-12-BUF-SYM, card "Exploit analysis", reverse griefing).
 */
export function receptorBlocked(
  parcel: PlacementParcel,
  assigned: readonly PlacementAssignment[],
  parcels: readonly PlacementParcel[],
): boolean {
  if (!isReceptor(parcel)) return false;
  const byId = sortBy(parcels, (p) => [p.id]);
  for (const a of assigned) {
    const fac = findById(byId, a.parcelId);
    if (!fac) continue;
    const need = bufferCm(nuisanceOf(a.facility));
    if (need <= 0) continue;
    if (edgeDistanceCm(fac.polygon, parcel.polygon) < need) return true;
  }
  return false;
}

/**
 * True when the receptor parcel `rec` is a receptor WITH RESPECT TO the facility `facility`.
 *
 * A RES parcel and a school are receptors for every facility. A hospital is a receptor for
 * every facility EXCEPT another hospital: a hospital is not a nuisance to itself.
 */
function isReceptorFor(rec: PlacementParcel, facility: string): boolean {
  if (rec.primaryUse === 'RES' && rec.zoning.allowed.includes('RES')) return true;
  if (rec.attributes.school && rec.zoning.class === 'civic') return true;
  if (facility === 'hl_hospital') return false;
  if (rec.zoning.class === 'civic' && rec.primaryUse === 'HOSPITALITY') return true;
  return false;
}
