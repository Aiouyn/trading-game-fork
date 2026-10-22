// T10A-12 (city placement, unit U5): the deterministic assignment.
//
// The card's step 5, verbatim: "process districts in `districtId` order and parcels in `pcl_`
// sequence order. Facilities with hard anchors (exchange, port terminal, tank farm, plants,
// hospital, data center) are placed first. Within each step, pick argmax of score + mix deficit,
// with ties broken by ONE draw from the injected stream per tied set (sorted candidate list, index
// = floor(draw*n)). Each placed N2/N3 facility updates the receptor exclusion and each receptor
// updates the facility exclusion, so the output is buffer-clean by construction. There is no
// `Math.random`, `Date` or float in a discrete decision, and draws are quantised the way
// 10 §3.19.1 requires."
//
// THE LOOP IS OVER PARCELS, NOT OVER FACILITIES (City Dev, T10A-12 U5). The card's step 5 says
// "process districts in districtId order and parcels in pcl_ sequence order", and a city has many
// parcels and few facility classes. A loop over facility classes would place at most one of each
// class per district, which no real city has: a district has several shops, several cafes. The
// loop is therefore:
//
//   for each district, in districtId order:
//     for each parcel, in pcl_ sequence order:
//       for each facility class, the anchors first, then the rest in facility-id order:
//         score the parcel for that facility; if it is allowed and its score beats the best so
//         far, keep it as the parcel's facility
//       place the winner
//
// A facility may be placed on as many parcels as the rules allow, and the cardinality limits
// ("at most 1 exchange per city", "one fh_restaurant per district") are enforced as hard caps.
//
// INV-PLC-3 (determinism): `assignSectors(region, draw)` is a pure function. The same region rows
// and the same stream give byte-identical canonical output, and the draws come only from
// `city.gen:<cityId>:<regionId>:sector`.
//
// The draw is INJECTED: this module never constructs an RNG and never calls the registry.
//
// G8: no `Map`, no `Set`, no bare `sort()`. The lookups are binary searches over sorted arrays,
// so every iteration order in this module is the engine's byte order.

import { sortBy } from '@tycoon/engine-core/order';
import type {
  BizSector,
  DistrictRole,
  Draw,
  PlacementAssignment,
  PlacementCtx,
  PlacementParcel,
  RegionInput,
  Suitability,
} from './types';
import { SECTORS } from './types';
import {
  ANCHOR_FACILITIES,
  DISTRICT_ROLE_MIX,
  FACILITY_RULES,
  PLACEMENT_RULES_VERSION,
  facilityRule,
} from './rules';
import { cityVisKey, densityBand, isAssignable, lotType } from './classify';
import { verdict } from './suitability';

/**
 * The result of an assignment run: the assignments, and how many draws the run took.
 *
 * The card's AC-10A-12-DET checks both: "the same region and stream give byte-identical
 * `canonEncode` output over 3 runs" and "the draw count equals the number of tied sets".
 */
export interface AssignmentTrace {
  /** The assignments, sorted by parcel id. */
  assignments: readonly PlacementAssignment[];
  /** How many draws the run took. */
  draws: number;
  /** How many tied sets the run broke. */
  tiedSets: number;
}

/** The counters the cardinality limits read. */
interface Counters {
  /** How many of each facility class are placed, in the whole region. */
  perFacility: Record<string, number>;
  /** How many of each facility class are placed, per district. */
  perFacilityInDistrict: Record<string, number>;
  /** How many of each facility class are placed, per district role. */
  perFacilityInRole: Record<string, number>;
}

/**
 * The assignments of a region, deterministic in the region rows and the injected draw.
 */
export function assignSectors(region: RegionInput, draw: Draw): readonly PlacementAssignment[] {
  return assignSectorsTraced(region, draw).assignments;
}

/** The assignments of a region, with the draw count. */
export function assignSectorsTraced(region: RegionInput, draw: Draw): AssignmentTrace {
  const ctx = region.ctx;
  const assigned: PlacementAssignment[] = [];
  let draws = 0;
  let tiedSets = 0;

  // The parcels, in `pcl_` sequence order, grouped by district, with the districts in
  // `districtId` order. The grouping is a sorted array of [districtId, parcels] pairs, so no
  // `Map` is needed.
  const districts = sortBy(region.districts, (d) => [d.id]);
  const parcelsSorted = sortBy(region.parcels, (x) => [x.id]);
  const groupOf = (districtId: string): PlacementParcel[] =>
    parcelsSorted.filter((p) => p.districtId === districtId);

  // The facility classes, the anchors first and then the rest, both by facility id.
  const anchors = ANCHOR_FACILITIES.filter((f) => FACILITY_RULES.some((r) => r.facility === f));
  const rest = sortBy(
    FACILITY_RULES.map((r) => r.facility).filter((f) => !anchors.includes(f)),
    (f) => [f],
  );
  const order = [...anchors, ...rest];

  // The cardinality counters.
  const counters: Counters = { perFacility: {}, perFacilityInDistrict: {}, perFacilityInRole: {} };
  const count = (bag: Record<string, number>, key: string): number => {
    const n = bag[key] ?? 0;
    bag[key] = n + 1;
    return n;
  };

  for (const district of districts) {
    const role = region.roles[district.id];
    if (!role) continue;
    const parcels = groupOf(district.id);
    if (parcels.length === 0) continue;

    for (const p of parcels) {
      if (!isAssignable(p)) continue;

      // The context grows as the run places facilities: "Each placed N2/N3 facility updates the
      // receptor exclusion and each receptor updates the facility exclusion, so the output is
      // buffer-clean by construction" (card step 5).
      const stepCtx: PlacementCtx = { ...ctx, placedFacilities: assigned };

      // The candidates for THIS parcel: every facility class the parcel may take, scored.
      const candidates: Suitability[] = [];
      for (const facility of order) {
        const rule = facilityRule(facility);
        if (!rule) continue;
        if (exceedsCap(counters, rule.facility, role, district.id)) continue;
        const v = verdict(p, role, stepCtx, rule);
        if (v.verdict === 'EXCLUDED') continue;
        candidates.push(v);
      }
      if (candidates.length === 0) continue;

      // The mix deficit: how far the district's sector share is BELOW its target, in per-mille.
      // It is a property of the SECTOR, so it is the same for every candidate of one sector and
      // it is what steers the sector choice.
      const deficits: Record<string, number> = {};
      for (const c of candidates) {
        const rule = facilityRule(c.facility);
        if (!rule) continue;
        if (deficits[rule.sector] === undefined) {
          deficits[rule.sector] = mixDeficit(role, assigned, district.id, rule.sector);
        }
      }

      // The argmax of score + deficit, with ONE draw per tied set.
      let best = -1;
      const tied: Suitability[] = [];
      for (const c of candidates) {
        const rule = facilityRule(c.facility);
        if (!rule) continue;
        const value = c.score + (deficits[rule.sector] ?? 0);
        if (value > best) {
          best = value;
          tied.length = 0;
          tied.push(c);
        } else if (value === best) {
          tied.push(c);
        }
      }
      let chosen = tied[0]!;
      if (tied.length > 1) {
        tiedSets += 1;
        // The candidates are sorted, and the index is floor(draw * n) (card step 5).
        const sorted = sortBy(tied, (c) => [c.facility]);
        const d = draw();
        draws += 1;
        const n = sorted.length;
        const idx = n <= 1 ? 0 : Math.min(n - 1, Math.floor(d * n));
        chosen = sorted[idx]!;
      }

      const rule = facilityRule(chosen.facility);
      if (!rule) continue;
      count(counters.perFacility, rule.facility);
      count(counters.perFacilityInDistrict, `${district.id}|${rule.facility}`);
      count(counters.perFacilityInRole, `${role}|${rule.facility}`);
      assigned.push(
        assignmentOf(region, p, rule.facility, rule.sector, rule.styleKey, rule.densityBand),
      );
    }
  }

  const out = sortBy(assigned, (a) => [a.parcelId]);
  return { assignments: out, draws, tiedSets };
}

/**
 * True when a facility has reached one of its cardinality limits.
 *
 * The card's two limits: "at most 1 exchange per city" and "nothing in TROPHY_RES except one
 * fh_restaurant per district".
 */
function exceedsCap(
  counters: Counters,
  facility: string,
  role: DistrictRole,
  districtId: string,
): boolean {
  const rule = facilityRule(facility);
  const cap = rule?.maxPer;
  if (!cap) return false;
  const inCity = counters.perFacility[facility] ?? 0;
  if (cap.perCity !== undefined && inCity >= cap.perCity) return true;
  const inDistrict = counters.perFacilityInDistrict[`${districtId}|${facility}`] ?? 0;
  if (cap.perDistrict !== undefined && inDistrict >= cap.perDistrict) return true;
  const inRole = cap.perDistrictRole?.[role];
  if (inRole !== undefined && (counters.perFacilityInRole[`${role}|${facility}`] ?? 0) >= inRole) {
    return true;
  }
  return false;
}

/**
 * The mix deficit of a sector in a district, in per-mille.
 *
 * The target share is the role's per-mille cell. The current share is the sector's share of the
 * district's assigned non-RES parcels, in per-mille, floored. The deficit is
 * `target - current`, floored at 0.
 *
 * The whole computation is INTEGER: the current share is floored, so the deficit is never
 * negative through rounding and the comparison that drives the argmax stays exact.
 */
export function mixDeficit(
  role: DistrictRole,
  assigned: readonly PlacementAssignment[],
  districtId: string,
  sector: BizSector,
): number {
  const target = DISTRICT_ROLE_MIX[role]?.[sector] ?? 0;
  if (target <= 0) return 0;
  let count = 0;
  let sectorCount = 0;
  for (const a of assigned) {
    if (a.districtId !== districtId) continue;
    count += 1;
    if (a.sector === sector) sectorCount += 1;
  }
  if (count === 0) return target;
  const current = Math.floor((sectorCount * 1000) / count);
  return Math.max(0, target - current);
}

/** The assignment of one parcel. */
function assignmentOf(
  region: RegionInput,
  p: PlacementParcel,
  facility: string,
  sector: BizSector,
  styleKey: string,
  band: PlacementAssignment['densityBand'],
): PlacementAssignment {
  const flags = region.ctx.flagsOf(p.id);
  return {
    parcelId: p.id,
    districtId: p.districtId,
    sector,
    sectorKey: `SECTOR_${sector}`,
    facility,
    styleKey,
    densityBand: band,
    rulesVersion: PLACEMENT_RULES_VERSION,
    flags: {
      quayEdge: flags.quayEdge,
      railAccess: flags.railAccess,
      railPointCm: flags.railPointCm,
      crownParcel: flags.crownParcel,
      bufferGreen: false,
    },
    visKey: cityVisKey(region.cityId, p.id),
  };
}

/** The lot type of a parcel, re-exported so a caller does not need two imports. */
export { lotType, densityBand };

/** The sectors of the mix, re-exported for a caller that checks the mix. */
export { SECTORS };
