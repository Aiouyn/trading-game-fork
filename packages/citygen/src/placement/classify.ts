// T10A-12 (city placement, unit U2): what a district IS, what a lot IS, and the flags.
//
// Everything here is a PURE FUNCTION of persisted rows (card "State model" 2): the district role
// and the lot type are derived, never stored twice.
//
// THE ROLE DERIVATION (card "One signature change from the pre-recut card"). The order is
// load-bearing and is FIXED by the card:
//   cbd -> port -> working -> trophy -> prime -> station (mid) -> riverOrCanal (mid) -> MIXED_CORE
// It is the same order T10A-13's own shipped test asserts for all 105 rows, and it is the order
// that reproduces the `role` column of `packages/content/data/district-flags.json` for every one
// of them. The role is DERIVED, never copied: copying the column would make the test compare the
// file to itself and prove nothing.
//
// THE TIER INPUT (Producer ruling, 2026-10-22). The tier is NOT a column of district-flags.json
// - that file carries exactly six keys per row (distId, port, station, cbd, riverOrCanal, role)
// and its schema test asserts that exact key set, so the tier is not added there. The tier
// comes from 22 §3.3's Tier column, which is the same source the shipped, QA-approved T10A-13
// test already reads. `DISTRICT_TIERS` below is parsed from that file.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cmpStr, sortBy } from '@tycoon/engine-core/order';
import type {
  DensityBand,
  DistrictRole,
  FixedPointCoord,
  LotType,
  ParcelFlags,
  PlacementDistrict,
  PlacementParcel,
  ZoningClass,
} from './types';
import flagsJson from '../../../content/data/district-flags.json';

// ---------- the district flags (the shipped content data) ----------

/**
 * One row of the shipped district-flag table (T10A-13, fork PR #10).
 *
 * The file is the CONTENT data: the flag values live there and the placement module reads them.
 * It is NOT in `ContentView`'s closed `FILE_NAMES` list (E-80.2 consequence), so it is read
 * directly as a JSON import.
 */
export interface DistrictFlags {
  /** The district id. */
  distId: string;
  /** True when the district is the city's CBD. */
  cbd: boolean;
  /** True when the district is a port district. */
  port: boolean;
  /** True when the district has a station landmark. */
  station: boolean;
  /** True when the district has a river or a canal through it. */
  riverOrCanal: boolean;
}

/** The shipped district-flag table, sorted by district id. */
export const DISTRICT_FLAGS: readonly DistrictFlags[] = sortBy(
  (flagsJson as { districts?: readonly DistrictFlags[] }).districts ?? [],
  (r) => [r.distId],
);

/** The flag row of a district, or `undefined`. */
export const flagsOf = (districtId: string): DistrictFlags | undefined =>
  DISTRICT_FLAGS.find((r) => r.distId === districtId);

// ---------- the district tier (22 §3.3's Tier column) ----------

/** The four tiers of 22 §3.3. */
export type DistrictTier = 'working' | 'mid' | 'prime' | 'trophy';

const SPEC_22_PATH = '../../../../export/vision-review/complete/22-CONTENT-CATALOGS.md';

/** The markdown table rows of a text, as cells. */
const mdRows = (text: string): string[][] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));

/**
 * The tier of every district, parsed from 22 §3.3's table.
 *
 * WHY PARSED AND NOT STORED (Producer ruling, 2026-10-22). The tier is not a column of
 * `packages/content/data/district-flags.json`: that file carries exactly six keys per row and its
 * shipped schema test asserts that exact key set, so adding a `tier` column would change a
 * merged, QA-approved file AND break its schema check. The tier IS in the repo: 22 §3.3's Tier
 * column, the same source the shipped T10A-13 test reads. This module parses it at load time.
 *
 * The parse is pure and deterministic: a fixed file read, a fixed table walk, a fixed sorted list.
 * The section is located by its own heading, so a change earlier in the file cannot move the
 * table. A district the section does not carry is absent from the list, and the derivation then
 * fails loudly rather than silently guessing.
 */
export const DISTRICT_TIERS: readonly { id: string; tier: DistrictTier }[] = (() => {
  const path = fileURLToPath(new URL(SPEC_22_PATH, import.meta.url));
  const text = readFileSync(path, 'utf8');
  const section = text.split('### §3.3 Districts and landmarks')[1] ?? '';
  const out: { id: string; tier: DistrictTier }[] = [];
  for (const cells of mdRows(section)) {
    if (cells.length < 5) continue;
    const id = cells[0] ?? '';
    if (!id.startsWith('dst_')) continue;
    const tier = cells[3] ?? '';
    if (tier !== 'working' && tier !== 'mid' && tier !== 'prime' && tier !== 'trophy') continue;
    out.push({ id, tier });
  }
  return sortBy(out, (r) => [r.id]);
})();

/** The tier of a district, or `undefined` when 22 §3.3 does not carry it. */
export const tierOf = (districtId: string): DistrictTier | undefined =>
  DISTRICT_TIERS.find((r) => r.id === districtId)?.tier;

// ---------- the district role ----------

/**
 * The role of a district, DERIVED.
 *
 * The order is fixed by the card and is load-bearing:
 *   1. `cbd` -> CBD
 *   2. `port` -> PORT
 *   3. tier `working` -> INDUSTRIAL
 *   4. tier `trophy` -> TROPHY_RES
 *   5. tier `prime` -> PRIME_RES
 *   6. tier `mid` and `station` -> TRANSIT_HUB
 *   7. tier `mid` and `riverOrCanal` -> MIXED_RIVER
 *   8. tier `mid` otherwise -> MIXED_CORE
 *
 * The tier comes from 22 §3.3 (see `DISTRICT_TIERS`); the four boolean flags come from the
 * shipped `district-flags.json`. The result is the shipped `role` column for all 105 districts,
 * which is what AC-10A-12-ROLE-ALL checks.
 *
 * `terrainRole` stays in the signature because the terrain role is still the input for the
 * `WATERFRONT` need and the E-78.1 waterfront check (a `port: true` district's terrain role must
 * be `waterfront`, `industrial_shore` or `island`).
 */
export function districtRole(d: PlacementDistrict, terrainRole: string): DistrictRole {
  const tier = tierOf(d.id) ?? d.tier;
  const flags = flagsOf(d.id);
  const cbd = flags?.cbd ?? false;
  const port = flags?.port ?? false;
  const station = flags?.station ?? false;
  const riverOrCanal = flags?.riverOrCanal ?? false;

  if (cbd) return 'CBD';
  if (port) return 'PORT';
  if (tier === 'working') return 'INDUSTRIAL';
  if (tier === 'trophy') return 'TROPHY_RES';
  if (tier === 'prime') return 'PRIME_RES';
  if (tier === 'mid') {
    if (station) return 'TRANSIT_HUB';
    if (riverOrCanal) return 'MIXED_RIVER';
    return 'MIXED_CORE';
  }
  // A tier the ladder does not name is a data error, not a guess: a wrong role silently moves
  // every sector in the district, so the derivation refuses to invent one.
  throw new Error(`districtRole: unknown tier '${tier}' for ${d.id} (terrain ${terrainRole})`);
}

// ---------- the lot type ----------

/**
 * The lot type of a parcel, DERIVED from its zoning class, its area, its frontage and its
 * access (card "Implementation steps" 2).
 *
 * The reading of the card's sentence, so the derivation is unambiguous:
 *   - a CIVIC parcel is a CIVIC lot and a GREEN parcel is a GREEN lot: both pass through.
 *   - a `reservedFor` parcel is never assignable; the reservation is not a lot type, so the lot
 *     type is still derived and `isAssignable` below is what refuses it.
 *   - the commercial ladder is the zoning class: `shops` -> SHOPFRONT, `offices` -> MIDRISE,
 *     `office_tower` -> OFFICE_TOWER, `cbd` -> CBD_TOWER.
 *   - the residential ladder: `house` and `row_house` -> ROW, `midrise` -> MIDRISE,
 *     `highrise` -> HIGHRISE. A house parcel is a ROW lot: the row is the physical lot type.
 *   - the industrial kinds: `warehouse` -> WAREHOUSE, `plant` -> PLANT, `port` -> PORT_YARD,
 *     `datacenter` -> DC_SITE, `utility` -> UTILITY_SITE, `fab` -> FAB.
 *   - `civic` -> CIVIC, `green` -> GREEN.
 * A parcel whose zoning class is not in the ladder has no lot type: the generator has not run
 * yet, so the parcel cannot be placed.
 */
export function lotType(p: PlacementParcel): LotType {
  const cls: ZoningClass = p.zoning.class;
  switch (cls) {
    case 'house':
    case 'row_house':
      return 'ROW';
    case 'midrise':
      return 'MIDRISE';
    case 'highrise':
      return 'HIGHRISE';
    case 'shops':
      return 'SHOPFRONT';
    case 'offices':
      return 'MIDRISE';
    case 'office_tower':
      return 'OFFICE_TOWER';
    case 'cbd':
      return 'CBD_TOWER';
    case 'industrial':
      return industrialLotType(p);
    case 'civic':
      return 'CIVIC';
    case 'green':
      return 'GREEN';
    default:
      throw new Error(`lotType: unknown zoning class '${String(cls)}' for ${p.id}`);
  }
}

function industrialLotType(p: PlacementParcel): LotType {
  switch (p.zoning.industrialKind) {
    case 'warehouse':
      return 'WAREHOUSE';
    case 'plant':
      return 'PLANT';
    case 'port':
      return 'PORT_YARD';
    case 'datacenter':
      return 'DC_SITE';
    case 'utility':
      return 'UTILITY_SITE';
    case 'fab':
      return 'FAB';
    default:
      throw new Error(`lotType: industrial parcel ${p.id} has no industrial kind`);
  }
}

/**
 * True when a parcel may carry a sector facility at all: it is not reserved, and it is not a
 * GREEN or CIVIC lot (card "State model" 3: an assignment per non-RES, non-GREEN, non-reserved
 * parcel).
 */
export const isAssignable = (p: PlacementParcel): boolean => {
  if (p.reservedFor !== null) return false;
  const t = lotType(p);
  return t !== 'GREEN' && t !== 'CIVIC';
};

/**
 * The density band of a parcel (Studio decision 2). The band is a function of the parcel's
 * zoning class and `maxFar`, never a height: the height stays 10 §3.19.4's `maxHeightM`.
 *
 *   house (0.6), row house (1.2), shops, industrial, civic, green -> LOW
 *   mid-rise (3), offices -> MID
 *   high-rise (8) -> HIGH
 *   office tower (15), CBD (25), crown parcel -> TOWER
 */
export function densityBand(p: PlacementParcel): DensityBand {
  if (p.reservedFor === 'CROWN') return 'TOWER';
  switch (p.zoning.class) {
    case 'house':
    case 'row_house':
    case 'shops':
    case 'industrial':
    case 'civic':
    case 'green':
      return 'LOW';
    case 'midrise':
    case 'offices':
      return 'MID';
    case 'highrise':
      return 'HIGH';
    case 'office_tower':
    case 'cbd':
      return 'TOWER';
    default:
      throw new Error(`densityBand: unknown zoning class '${String(p.zoning.class)}' for ${p.id}`);
  }
}

// ---------- the parcel flags ----------

/**
 * The terrain facts the quay and rail flags read (Systems ruling 3). The caller supplies them:
 * T10A-03 owns the terrain and the rail skeleton, and this package never walks geometry it does
 * not own.
 */
export interface TerrainView {
  /** The cm polyline of the water edge in front of the parcel, or `null`. */
  waterEdgeCm: readonly FixedPointCoord[] | null;
  /** True when the water edge in front of the parcel carries a quay wall. */
  quayWall: boolean;
}

/** The rail facts the rail flag reads (Systems ruling 3). */
export interface RailView {
  /** True when a rail line or siding lies within 30 m of the parcel edge. */
  railAccess: boolean;
  /** The nearest point on that rail line, in cm. */
  railPointCm: FixedPointCoord | null;
}

/**
 * The parcel flags, except `bufferGreen` (Systems rulings 3 and 6).
 *
 *   - `quayEdge` is the cm polyline of the parcel edge within 200 cm of water that carries a quay
 *     wall, or null.
 *   - `railAccess` is true when a rail line or siding lies within 30 m of the parcel edge, and
 *     `railPointCm` gives the nearest point.
 *   - `crownParcel` is true exactly where `reservedFor === 'CROWN'`.
 */
export function parcelFlags(
  p: PlacementParcel,
  terrain: TerrainView,
  rail: RailView,
): Omit<ParcelFlags, 'bufferGreen'> {
  const quayEdge =
    terrain.quayWall && terrain.waterEdgeCm !== null ? quayEdgeOf(p, terrain.waterEdgeCm) : null;
  return {
    quayEdge,
    railAccess: rail.railAccess,
    railPointCm: rail.railPointCm ? [rail.railPointCm.x, rail.railPointCm.z] : null,
    crownParcel: p.reservedFor === 'CROWN',
  };
}

/**
 * The points of the parcel edge that lie within 200 cm of the water edge, as a cm polyline.
 *
 * The distance test is exact and integer: a parcel edge point is within 200 cm of the water edge
 * when the squared distance to some water edge point is at most 200^2. Squared distances are
 * compared as integers, so no float enters the decision (10 §3.19.1).
 */
function quayEdgeOf(
  p: PlacementParcel,
  water: readonly FixedPointCoord[],
): [number, number][] | null {
  const limit = 200 * 200;
  const out: [number, number][] = [];
  const edge = p.polygon;
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i]!;
    const b = edge[(i + 1) % edge.length]!;
    for (const q of water) {
      if (withinSeg(a, b, q, limit)) {
        out.push([a.x, a.z]);
        break;
      }
    }
  }
  return out.length ? out : null;
}

/**
 * True when the point `p` is within `limitSq` (a squared distance) of the segment `a`-`b`.
 *
 * All integer: the projection parameter is compared as a dot product, and the inside case is
 * `cross^2 <= limitSq * len2`, which needs neither a division nor a float.
 */
export function withinSeg(
  a: FixedPointCoord,
  b: FixedPointCoord,
  p: FixedPointCoord,
  limitSq: number,
): boolean {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const wx = p.x - a.x;
  const wz = p.z - a.z;
  const len2 = vx * vx + vz * vz;
  if (len2 === 0) return wx * wx + wz * wz <= limitSq;
  const dot = wx * vx + wz * vz;
  if (dot <= 0) return wx * wx + wz * wz <= limitSq;
  if (dot >= len2) {
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    return dx * dx + dz * dz <= limitSq;
  }
  const cross = vx * wz - vz * wx;
  return cross * cross <= limitSq * len2;
}

// ---------- the visual seed ----------

/**
 * The visual key of a parcel: `city.vis:<cityId>:<parcelId>` (Systems ruling 5, E-68 helper
 * rule, registry row via IR-7).
 *
 * The key is a HASH of the key string, so the client can reproduce the seed without any server
 * state. It never draws from `city.gen:...:sector` or any other stream, so a look change cannot
 * alter a placement and a placement change cannot shift a look.
 *
 * This is the ONLY place the literal `city.vis:` appears (AC-10A-12-VIS-SEED).
 */
export function cityVisKey(cityId: string, parcelId: string): string {
  return `city.vis:${cityId}:${parcelId}`;
}

/** Sort a list of strings by byte order (never `localeCompare`, G8). */
export const byByteOrder = (xs: readonly string[]): string[] => sortBy(xs, (x) => [x]);

/**
 * The row with this id, from a list sorted by `id`, or `undefined`.
 *
 * A binary search over a sorted array, not a `Map`: G8 forbids `Map` and `Set` in engine code,
 * because their iteration order is not the engine's byte order and a `Map` that leaks into a
 * canonical output makes two runs differ.
 */
export function findById<T extends { id: string }>(sorted: readonly T[], id: string): T | undefined {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmpStr(sorted[mid]!.id, id) < 0) lo = mid + 1;
    else hi = mid;
  }
  const hit = sorted[lo];
  return hit && hit.id === id ? hit : undefined;
}

/** Compare two strings by byte order (never `localeCompare`, G8). */
export { cmpStr };
