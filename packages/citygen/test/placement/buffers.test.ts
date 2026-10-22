// T10A-12 (city placement, unit U3): the exact integer buffers.
//
// AC-10A-12-BUF-EXACT, AC-10A-12-BUF-SYM, AC-10A-12-BUFFER-GREEN.
//
// The distances are in integer centimetres and the decision is made with integers only. The
// boundary case the card names is pinned exactly: a pair at exactly 15,000 cm passes N3 and a
// pair at 14,999 cm fails.

import { describe, expect, it } from 'vitest';
import {
  bufferCm,
  bufferViolations,
  edgeDistanceCm,
  isReceptor,
  isqrt,
  nuisanceOf,
  receptorBlocked,
  segSegWithin,
  segmentsIntersect,
} from '../../src/placement/buffers';
import { BUFFER_M, facilityRule } from '../../src/placement/rules';
import type { FixedPointCoord, PlacementAssignment, PlacementParcel } from '../../src/placement/types';

/** A rectangle in centimetres, counter-clockwise. */
const rect = (x: number, z: number, w: number, h: number): FixedPointCoord[] => [
  { x, z },
  { x: x + w, z },
  { x: x + w, z: z + h },
  { x, z: z + h },
];

/** A parcel fixture over a polygon. */
const parcel = (id: string, polygon: FixedPointCoord[], over: Partial<PlacementParcel> = {}): PlacementParcel => ({
  id,
  cityId: 'cty_port_avalon',
  districtId: 'dst_port_avalon_industrial_basin',
  regionId: 'reg_1',
  polygon,
  areaM2: 1000,
  frontageM: 40,
  access: ['ROAD'],
  zoning: {
    class: 'industrial',
    industrialKind: 'plant',
    allowed: ['INDUSTRIAL'],
    maxHeightM: 20,
    maxFar: 1,
    heritageLocked: false,
  },
  landValueV: 100,
  attributes: {
    waterView: 0,
    transitDist: 500,
    slope: 0,
    cornerLot: false,
    mainAvenue: false,
    school: false,
  },
  primaryUse: 'INDUSTRIAL',
  reservedFor: null,
  ...over,
});

/** A residential parcel fixture - a buffer RECEPTOR. */
const resParcel = (id: string, polygon: FixedPointCoord[]): PlacementParcel =>
  parcel(id, polygon, {
    zoning: {
      class: 'house',
      allowed: ['RES'],
      maxHeightM: 10,
      maxFar: 0.6,
      heritageLocked: false,
    },
    primaryUse: 'RES',
  });

/** An assignment fixture. */
const assignment = (parcelId: string, facility: string): PlacementAssignment => ({
  parcelId,
  districtId: 'dst_port_avalon_industrial_basin',
  sector: 'MANUFACTURING',
  sectorKey: 'SECTOR_MANUFACTURING',
  facility,
  styleKey: 'style.sector.manufacturing.mf_plant',
  densityBand: 'LOW',
  rulesVersion: 'placement.v1',
  flags: { quayEdge: null, railAccess: false, railPointCm: null, crownParcel: false, bufferGreen: false },
  visKey: `city.vis:cty_port_avalon:${parcelId}`,
});

describe('T10A-12 buffers: the exact edge distance', () => {
  it('AC-10A-12-BUF-EXACT: touching polygons are 0 apart', () => {
    expect(edgeDistanceCm(rect(0, 0, 1000, 1000), rect(1000, 0, 1000, 1000))).toBe(0);
    expect(edgeDistanceCm(rect(0, 0, 1000, 1000), rect(0, 1000, 1000, 1000))).toBe(0);
    // Corner to corner.
    expect(edgeDistanceCm(rect(0, 0, 1000, 1000), rect(1000, 1000, 1000, 1000))).toBe(0);
  });

  it('AC-10A-12-BUF-EXACT: a gap is measured edge to edge', () => {
    // Two squares 300 cm apart, edge to edge.
    expect(edgeDistanceCm(rect(0, 0, 1000, 1000), rect(1300, 0, 1000, 1000))).toBe(300);
    // The gap is diagonal here: the corners are the closest points.
    expect(edgeDistanceCm(rect(0, 0, 1000, 1000), rect(1300, 1300, 1000, 1000))).toBe(424);
  });

  it('AC-10A-12-BUF-EXACT: overlapping polygons are 0 apart', () => {
    expect(edgeDistanceCm(rect(0, 0, 1000, 1000), rect(500, 500, 1000, 1000))).toBe(0);
  });

  it('AC-10A-12-BUF-EXACT: collinear edges are measured along the gap', () => {
    // Two rectangles side by side with a 250 cm gap between the facing edges.
    const a = rect(0, 0, 1000, 1000);
    const b = rect(1250, 0, 1000, 1000);
    expect(edgeDistanceCm(a, b)).toBe(250);
  });

  it('AC-10A-12-BUF-EXACT: the 15,000 cm N3 boundary is exact in both directions', () => {
    // The card: "A pair at exactly 15,000 cm passes N3 and a pair at 14,999 cm fails."
    const need = bufferCm('N3');
    expect(need).toBe(15000);
    const a = rect(0, 0, 1000, 1000);
    const at = rect(1000 + need, 0, 1000, 1000);
    const justUnder = rect(1000 + need - 1, 0, 1000, 1000);

    expect(edgeDistanceCm(a, at)).toBe(need);
    expect(edgeDistanceCm(a, justUnder)).toBe(need - 1);

    // Exactly at the buffer: no violation. One centimetter closer: a violation.
    const plant = parcel('pcl_plant', a);
    const house = resParcel('pcl_house', at);
    const inside = resParcel('pcl_inside', justUnder);

    expect(bufferViolations([assignment('pcl_plant', 'en_plant')], [plant, house])).toEqual([]);
    const violations = bufferViolations([assignment('pcl_plant', 'en_plant')], [plant, inside]);
    expect(violations.length).toBe(1);
    expect(violations[0]!.distCm).toBe(need - 1);
    expect(violations[0]!.needCm).toBe(need);
  });

  it('AC-10A-12-BUF-EXACT: the integer square root is exact', () => {
    expect(isqrt(0)).toBe(0);
    expect(isqrt(1)).toBe(1);
    expect(isqrt(4)).toBe(2);
    expect(isqrt(15)).toBe(3);
    expect(isqrt(16)).toBe(4);
    expect(isqrt(14999)).toBe(122);
    expect(isqrt(15000)).toBe(122);
    expect(isqrt(15049)).toBe(122);
    // 122^2 = 14884 and 123^2 = 15129, so 15050 is still 122.
    expect(isqrt(15050)).toBe(122);
    expect(isqrt(15129)).toBe(123);
    expect(isqrt(15130)).toBe(123);
  });

  it('the segment predicate is exact and symmetric', () => {
    const a1 = { x: 0, z: 0 };
    const a2 = { x: 1000, z: 0 };
    const b1 = { x: 2000, z: 0 };
    const b2 = { x: 3000, z: 0 };
    // 1000 cm apart: the squared distance is 1,000,000.
    expect(segSegWithin(a1, a2, b1, b2, 1000 * 1000)).toBe(true);
    expect(segSegWithin(a1, a2, b1, b2, 999 * 999)).toBe(false);
    // Crossing segments are within any limit.
    expect(segSegWithin(a1, a2, { x: 500, z: -500 }, { x: 500, z: 500 }, 0)).toBe(true);
    expect(segmentsIntersect(a1, a2, { x: 500, z: -500 }, { x: 500, z: 500 })).toBe(true);
    expect(segmentsIntersect(a1, a2, b1, b2)).toBe(false);
  });

  it('the buffers are the card\'s, in centimetres', () => {
    expect(bufferCm('N0')).toBe(0);
    expect(bufferCm('N1')).toBe(0);
    expect(bufferCm('N2')).toBe(6000);
    expect(bufferCm('N3')).toBe(15000);
    expect(BUFFER_M.N3 * 100).toBe(bufferCm('N3'));
  });

  it('the nuisance class comes from the rules table', () => {
    expect(nuisanceOf('en_plant')).toBe('N3');
    expect(nuisanceOf('mf_heavy')).toBe('N3');
    expect(nuisanceOf('log_port_terminal')).toBe('N3');
    expect(nuisanceOf('en_substation')).toBe('N1');
    expect(nuisanceOf('fin_exchange')).toBe('N0');
    expect(nuisanceOf('not_a_facility')).toBe('N0');
    expect(facilityRule('en_plant')?.nuisance).toBe('N3');
  });
});

describe('T10A-12 buffers: the receptors and the symmetry', () => {
  it('a RES parcel is a receptor; a shop parcel is not', () => {
    expect(isReceptor(resParcel('pcl_1', rect(0, 0, 1000, 1000)))).toBe(true);
    expect(isReceptor(parcel('pcl_2', rect(0, 0, 1000, 1000)))).toBe(false);
  });

  it('a school is a receptor and a hospital is a receptor', () => {
    const school = parcel('pcl_school', rect(0, 0, 1000, 1000), {
      zoning: {
        class: 'civic',
        allowed: ['CIVIC'],
        maxHeightM: 15,
        maxFar: 1,
        heritageLocked: false,
      },
      primaryUse: 'CIVIC',
      attributes: {
        waterView: 0,
        transitDist: 100,
        slope: 0,
        cornerLot: false,
        mainAvenue: false,
        school: true,
      },
    });
    expect(isReceptor(school)).toBe(true);
    const hospital = parcel('pcl_hospital', rect(0, 0, 1000, 1000), {
      zoning: {
        class: 'civic',
        allowed: ['CIVIC'],
        maxHeightM: 30,
        maxFar: 2,
        heritageLocked: false,
      },
      primaryUse: 'HOSPITALITY',
    });
    expect(isReceptor(hospital)).toBe(true);
  });

  it('AC-10A-12-BUF-SYM: adding a RES receptor inside an existing N3 buffer makes it EXCLUDED', () => {
    // The plant is placed first; the house comes 100 m away, inside the 150 m N3 buffer.
    const plant = parcel('pcl_plant', rect(0, 0, 1000, 1000));
    const house = resParcel('pcl_house', rect(11000, 0, 1000, 1000)); // 10,000 cm = 100 m away
    const assigned = [assignment('pcl_plant', 'en_plant')];

    // The buffer is symmetric: the house is inside the plant's buffer, so it may not be a
    // receptor (and the plant is inside the house's buffer, so the pair is a violation).
    expect(receptorBlocked(house, assigned, [plant, house])).toBe(true);
    const violations = bufferViolations(assigned, [plant, house]);
    expect(violations.length).toBe(1);
    expect(violations[0]!.facilityParcel).toBe('pcl_plant');
    expect(violations[0]!.receptorParcel).toBe('pcl_house');
    expect(violations[0]!.distCm).toBe(10000);
    expect(violations[0]!.needCm).toBe(15000);
  });

  it('AC-10A-12-BUF-SYM: a receptor OUTSIDE the buffer is not blocked', () => {
    const plant = parcel('pcl_plant', rect(0, 0, 1000, 1000));
    const house = resParcel('pcl_house', rect(16000, 0, 1000, 1000)); // 15,000 cm = exactly 150 m
    const assigned = [assignment('pcl_plant', 'en_plant')];
    expect(receptorBlocked(house, assigned, [plant, house])).toBe(false);
    expect(bufferViolations(assigned, [plant, house])).toEqual([]);
  });

  it('an N0 facility never violates a buffer', () => {
    const tower = parcel('pcl_tower', rect(0, 0, 1000, 1000));
    const house = resParcel('pcl_house', rect(1100, 0, 1000, 1000));
    expect(bufferViolations([assignment('pcl_tower', 'fin_exchange')], [tower, house])).toEqual([]);
  });

  it('an N1 facility never violates a buffer either (its buffer is 0 m)', () => {
    const depot = parcel('pcl_depot', rect(0, 0, 1000, 1000));
    const house = resParcel('pcl_house', rect(1100, 0, 1000, 1000));
    expect(bufferViolations([assignment('pcl_depot', 'log_depot')], [depot, house])).toEqual([]);
  });

  it('the violation list names the facility and the receptor, and the distances', () => {
    const plant = parcel('pcl_plant', rect(0, 0, 1000, 1000));
    const house = resParcel('pcl_house', rect(8000, 0, 1000, 1000)); // 7,000 cm = 70 m away
    const violations = bufferViolations([assignment('pcl_plant', 'en_plant')], [plant, house]);
    expect(violations).toEqual([
      {
        facilityParcel: 'pcl_plant',
        receptorParcel: 'pcl_house',
        distCm: 7000,
        needCm: 15000,
      },
    ]);
  });

  it('AC-10A-12-BUFFER-GREEN: a parcel inside a buffer is excluded for receptors', () => {
    // The card's amended rule 4: "Every parcel inside a buffer, green or not, is EXCLUDED for
    // receptors (RES, hospital, school) and for RES development or rezoning." The exclusion is
    // the symmetric buffer check, which is what `receptorBlocked` answers.
    const plant = parcel('pcl_plant', rect(0, 0, 1000, 1000));
    const inside = resParcel('pcl_inside', rect(5000, 0, 1000, 1000));
    const outside = resParcel('pcl_outside', rect(20000, 0, 1000, 1000));
    const assigned = [assignment('pcl_plant', 'en_plant')];
    expect(receptorBlocked(inside, assigned, [plant, inside, outside])).toBe(true);
    expect(receptorBlocked(outside, assigned, [plant, inside, outside])).toBe(false);
  });
});
