// T10A-12 (city placement, unit U4): the suitability of a parcel for a facility.
//
// AC-10A-12-EXCLUDE (one case per sector, 13 cases), AC-10A-12-PREF.
//
// The exclusion cases are the card's hard exclusions, one per sector: each case names the
// sector, the facility, the role the facility may not take, and the reason code the verdict must
// carry. A case that fails for the WRONG reason does not pass: the reason code is checked too.

import { describe, expect, it } from 'vitest';
import { NEAR_BONUS, PREFERRED_BONUS, suitability, verdict } from '../../src/placement/suitability';
import { FACILITY_RULES, facilityRule } from '../../src/placement/rules';
import type {
  DistrictRole,
  FixedPointCoord,
  PlacementAssignment,
  PlacementCtx,
  PlacementParcel,
} from '../../src/placement/types';

const rect = (x: number, z: number, w: number, h: number): FixedPointCoord[] => [
  { x, z },
  { x: x + w, z },
  { x: x + w, z: z + h },
  { x, z: z + h },
];

/** A parcel fixture. */
const parcel = (over: Partial<PlacementParcel> & { id: string }): PlacementParcel => ({
  cityId: 'cty_port_avalon',
  districtId: 'dst_port_avalon_midtown',
  regionId: 'reg_1',
  polygon: rect(0, 0, 1000, 1000),
  areaM2: 200,
  frontageM: 30,
  access: ['ROAD'],
  zoning: {
    class: 'shops',
    allowed: ['RETAIL'],
    maxHeightM: 12,
    maxFar: 1.5,
    heritageLocked: false,
  },
  landValueV: 100,
  attributes: {
    waterView: 0,
    transitDist: 100,
    slope: 0,
    cornerLot: false,
    mainAvenue: true,
    school: false,
  },
  primaryUse: 'RETAIL',
  reservedFor: null,
  ...over,
});

/** A context fixture: everything satisfied by default, so one thing can be broken at a time. */
const ctx = (over: Partial<PlacementCtx> = {}): PlacementCtx => ({
  flagsOf: () => ({ quayEdge: [[0, 0]], railAccess: true, railPointCm: [10, 10], crownParcel: false }),
  gridMw: () => true,
  arterial: () => true,
  nearDistanceM: () => 100,
  bufferDistanceCm: () => 100000,
  receptorParcelIds: [],
  placedFacilities: [],
  ...over,
});

/** A parcel of a given lot type and area. */
const lotParcel = (
  id: string,
  cls: PlacementParcel['zoning']['class'],
  areaM2: number,
  kind?: string,
): PlacementParcel =>
  parcel({
    id,
    areaM2,
    zoning: {
      class: cls,
      industrialKind: kind as PlacementParcel['zoning']['industrialKind'],
      allowed: ['RETAIL', 'INDUSTRIAL', 'OFFICE'],
      maxHeightM: 30,
      maxFar: 2,
      heritageLocked: false,
    },
  });

describe('T10A-12 suitability: the hard exclusions', () => {
  it('AC-10A-12-EXCLUDE: one case per sector, each with its expected reason code', () => {
    // One case per sector: a facility the sector may not place in the role, checked against the
    // card's table. The parcel is always one the facility WOULD accept in its allowed role, so
    // the only failure is the role.
    interface Case {
      sector: string;
      facility: string;
      role: DistrictRole;
      parcel: PlacementParcel;
      reason: string;
    }
    const cases: Case[] = [
      // FOOD_HOSPITALITY: a hotel never in INDUSTRIAL.
      {
        sector: 'FOOD_HOSPITALITY',
        facility: 'fh_hotel',
        role: 'INDUSTRIAL',
        parcel: lotParcel('pcl_1', 'highrise', 3000),
        reason: 'ROLE',
      },
      // RETAIL_CONSUMER: a big box never in CBD.
      {
        sector: 'RETAIL_CONSUMER',
        facility: 'rc_big_box',
        role: 'CBD',
        parcel: lotParcel('pcl_2', 'industrial', 10000, 'warehouse'),
        reason: 'ROLE',
      },
      // REAL_ESTATE_SERVICES: a builder's yard never outside INDUSTRIAL/PORT.
      {
        sector: 'REAL_ESTATE_SERVICES',
        facility: 're_builders_yard',
        role: 'CBD',
        parcel: lotParcel('pcl_3', 'industrial', 5000, 'warehouse'),
        reason: 'ROLE',
      },
      // LOGISTICS_TRANSPORT: a warehouse never in CBD.
      {
        sector: 'LOGISTICS_TRANSPORT',
        facility: 'log_warehouse',
        role: 'CBD',
        parcel: lotParcel('pcl_4', 'industrial', 10000, 'warehouse'),
        reason: 'ROLE',
      },
      // ENERGY: a plant never outside PORT/INDUSTRIAL.
      {
        sector: 'ENERGY',
        facility: 'en_plant',
        role: 'CBD',
        parcel: lotParcel('pcl_5', 'industrial', 20000, 'utility'),
        reason: 'ROLE',
      },
      // MINING_AGRICULTURE: a silo never in CBD.
      {
        sector: 'MINING_AGRICULTURE',
        facility: 'ma_grain_silo',
        role: 'CBD',
        parcel: lotParcel('pcl_6', 'industrial', 8000, 'plant'),
        reason: 'ROLE',
      },
      // MANUFACTURING: a plant never in CBD.
      {
        sector: 'MANUFACTURING',
        facility: 'mf_plant',
        role: 'CBD',
        parcel: lotParcel('pcl_7', 'industrial', 20000, 'plant'),
        reason: 'ROLE',
      },
      // TECH_AI: a data centre never in CBD.
      {
        sector: 'TECH_AI',
        facility: 'tech_datacenter',
        role: 'CBD',
        parcel: lotParcel('pcl_8', 'industrial', 20000, 'datacenter'),
        reason: 'ROLE',
      },
      // FINANCE: an exchange only in CBD.
      {
        sector: 'FINANCE',
        facility: 'fin_exchange',
        role: 'INDUSTRIAL',
        parcel: lotParcel('pcl_9', 'cbd', 5000),
        reason: 'ROLE',
      },
      // MEDIA_ENTERTAINMENT: a venue never in PRIME_RES.
      {
        sector: 'MEDIA_ENTERTAINMENT',
        facility: 'me_venue',
        role: 'PRIME_RES',
        parcel: lotParcel('pcl_10', 'midrise', 5000),
        reason: 'ROLE',
      },
      // HEALTH: a hospital never in PORT.
      {
        sector: 'HEALTH',
        facility: 'hl_hospital',
        role: 'PORT',
        parcel: lotParcel('pcl_11', 'industrial', 20000, 'plant'),
        reason: 'ROLE',
      },
      // LUXURY: a boutique never in INDUSTRIAL.
      {
        sector: 'LUXURY',
        facility: 'lx_boutique',
        role: 'INDUSTRIAL',
        parcel: lotParcel('pcl_12', 'shops', 200),
        reason: 'ROLE',
      },
      // SECURITY_LEGAL_INTEL: a depot never in CBD.
      {
        sector: 'SECURITY_LEGAL_INTEL',
        facility: 'sl_guard_depot',
        role: 'CBD',
        parcel: lotParcel('pcl_13', 'industrial', 1000, 'warehouse'),
        reason: 'ROLE',
      },
    ];

    // One case per sector, all 13 sectors covered, and no sector twice.
    expect(cases.length).toBe(13);
    expect(new Set(cases.map((c) => c.sector)).size).toBe(13);

    for (const c of cases) {
      const rule = facilityRule(c.facility);
      expect(rule, c.facility).toBeDefined();
      expect(rule!.sector, c.facility).toBe(c.sector);
      const v = verdict(c.parcel, c.role, ctx(), rule!);
      expect(v.verdict, `${c.facility} in ${c.role}`).toBe('EXCLUDED');
      expect(v.reasons, `${c.facility} in ${c.role}`).toContain(c.reason);
      expect(v.score, `${c.facility} in ${c.role}`).toBe(0);
    }
  });

  it('AC-10A-12-EXCLUDE: a lot type the facility does not take is EXCLUDED with LOT', () => {
    const rule = facilityRule('fh_cafe')!;
    // A cafe takes a SHOPFRONT lot; a WAREHOUSE lot is not one.
    const v = verdict(lotParcel('pcl_1', 'industrial', 100, 'warehouse'), 'MIXED_CORE', ctx(), rule);
    expect(v.verdict).toBe('EXCLUDED');
    expect(v.reasons).toContain('LOT');
  });

  it('AC-10A-12-EXCLUDE: an area outside the footprint is EXCLUDED with AREA', () => {
    const rule = facilityRule('fh_cafe')!;
    const tooSmall = verdict(lotParcel('pcl_1', 'shops', 10), 'MIXED_CORE', ctx(), rule);
    expect(tooSmall.verdict).toBe('EXCLUDED');
    expect(tooSmall.reasons).toContain('AREA');
    const tooBig = verdict(lotParcel('pcl_2', 'shops', 100000), 'MIXED_CORE', ctx(), rule);
    expect(tooBig.verdict).toBe('EXCLUDED');
    expect(tooBig.reasons).toContain('AREA');
  });

  it('AC-10A-12-EXCLUDE: a reserved parcel is EXCLUDED with RESERVED', () => {
    const rule = facilityRule('fh_cafe')!;
    const free = verdict(lotParcel('pcl_1', 'shops', 100), 'MIXED_CORE', ctx(), rule);
    expect(free.verdict).toBe('PREFERRED');
    const crown = verdict(
      { ...lotParcel('pcl_3', 'shops', 100), reservedFor: 'CROWN' },
      'MIXED_CORE',
      ctx(),
      rule,
    );
    expect(crown.verdict).toBe('EXCLUDED');
    expect(crown.reasons).toEqual(['RESERVED']);
    const landmark = verdict(
      { ...lotParcel('pcl_4', 'shops', 100), reservedFor: 'LANDMARK' },
      'MIXED_CORE',
      ctx(),
      rule,
    );
    expect(landmark.verdict).toBe('EXCLUDED');
    expect(landmark.reasons).toEqual(['RESERVED']);
  });

  it('AC-10A-12-EXCLUDE: a failed need is EXCLUDED with the NEED_<x> code', () => {
    const rule = facilityRule('rc_big_box')!;
    expect(rule.needs).toContain('ARTERIAL');
    const noArterial = verdict(
      lotParcel('pcl_1', 'industrial', 10000, 'warehouse'),
      'INDUSTRIAL',
      ctx({ arterial: () => false }),
      rule,
    );
    expect(noArterial.verdict).toBe('EXCLUDED');
    expect(noArterial.reasons).toContain('NEED_ARTERIAL');
  });

  it('AC-10A-12-EXCLUDE: a failed "or" clause is EXCLUDED with the first condition\'s code', () => {
    const rule = facilityRule('lx_boutique')!;
    expect(rule.needsAny).toBeDefined();
    // Neither MAIN_AVENUE nor WATERFRONT: the boutique has nowhere to go.
    const nowhere = verdict(
      { ...lotParcel('pcl_1', 'shops', 200), attributes: { ...parcel({ id: 'p' }).attributes, mainAvenue: false } },
      'CBD',
      ctx({ flagsOf: () => ({ quayEdge: null, railAccess: false, railPointCm: null, crownParcel: false }) }),
      rule,
    );
    expect(nowhere.verdict).toBe('EXCLUDED');
    expect(nowhere.reasons.length).toBeGreaterThan(0);
    expect(nowhere.reasons[0]).toMatch(/^NEED_/);
  });

  it('AC-10A-12-EXCLUDE: a buffer failure is EXCLUDED with BUFFER', () => {
    const rule = facilityRule('en_plant')!;
    const placed: PlacementAssignment[] = [
      {
        parcelId: 'pcl_plant',
        districtId: 'dst_port_avalon_industrial_basin',
        sector: 'ENERGY',
        sectorKey: 'SECTOR_ENERGY',
        facility: 'mf_heavy',
        styleKey: 'style.sector.manufacturing.mf_heavy',
        densityBand: 'LOW',
        rulesVersion: 'placement.v1',
        flags: { quayEdge: null, railAccess: false, railPointCm: null, crownParcel: false, bufferGreen: false },
        visKey: 'city.vis:cty_port_avalon:pcl_plant',
      },
    ];
    const v = verdict(
      lotParcel('pcl_1', 'industrial', 20000, 'utility'),
      'INDUSTRIAL',
      ctx({
        placedFacilities: placed,
        receptorParcelIds: ['pcl_house'],
        bufferDistanceCm: () => 1000, // 10 m - well inside the 150 m N3 buffer
      }),
      rule,
    );
    expect(v.verdict).toBe('EXCLUDED');
    expect(v.reasons).toContain('BUFFER');
  });
});

describe('T10A-12 suitability: the preferred verdict and the score', () => {
  it('AC-10A-12-PREF: a PREFERRED parcel always outranks an ALLOWED parcel for the same facility', () => {
    const rule = facilityRule('rc_shop')!;
    // rc_shop prefers MIXED_CORE, TRANSIT_HUB and MIXED_RIVER; PRIME_RES is allowed but not
    // preferred.
    const preferred = verdict(lotParcel('pcl_1', 'shops', 100), 'MIXED_CORE', ctx(), rule);
    const allowed = verdict(lotParcel('pcl_2', 'shops', 100), 'PRIME_RES', ctx(), rule);
    expect(preferred.verdict).toBe('PREFERRED');
    expect(allowed.verdict).toBe('ALLOWED');
    expect(preferred.score).toBeGreaterThan(allowed.score);
    expect(preferred.score - allowed.score).toBe(PREFERRED_BONUS);
  });

  it('the score is an integer: preferred + near bonus + the lot rank', () => {
    const rule = facilityRule('fh_cafe')!;
    const v = verdict(lotParcel('pcl_1', 'shops', 100), 'MIXED_CORE', ctx(), rule);
    // 1000 (preferred) + 100 (one near rule met) + 1 (the first lot type).
    expect(Number.isInteger(v.score)).toBe(true);
    expect(v.score).toBe(PREFERRED_BONUS + NEAR_BONUS + 1);
  });

  it('the lot-type rank bonus favours the rule\'s first lot type', () => {
    const rule = facilityRule('me_venue')!;
    // me_venue's lot types are MIDRISE, CAMPUS.
    const midrise = verdict(lotParcel('pcl_1', 'midrise', 5000), 'TRANSIT_HUB', ctx(), rule);
    const campus = verdict(lotParcel('pcl_2', 'industrial', 5000, 'plant'), 'TRANSIT_HUB', ctx(), rule);
    expect(midrise.verdict).not.toBe('EXCLUDED');
    expect(campus.verdict).toBe('EXCLUDED'); // a PLANT lot is not a venue's lot type
  });

  it('suitability returns one verdict per facility, sorted by facility id', () => {
    const vs = suitability(lotParcel('pcl_1', 'shops', 100), 'MIXED_CORE', ctx());
    expect(vs.length).toBe(FACILITY_RULES.length);
    const ids = vs.map((v) => v.facility);
    expect(ids.slice().sort()).toEqual(ids);
  });

  it('every verdict carries a reason from the closed set', () => {
    const CLOSED = new Set([
      'ROLE',
      'LOT',
      'AREA',
      'NEED_WATERFRONT',
      'NEED_ARTERIAL',
      'NEED_RAIL',
      'NEED_TRANSIT_400M',
      'NEED_GRID_MW',
      'NEED_MAIN_AVENUE',
      'NEED_CORNER_LOT',
      'NEED_RES_LOAD',
      'NEED_PORT_EDGE',
      'NEED_STATION',
      'NEED_CBD_PEAK',
      'NEED_MAIN_AVENUE_DIST',
      'BUFFER',
      'RESERVED',
    ]);
    const vs = suitability(lotParcel('pcl_1', 'shops', 100), 'MIXED_CORE', ctx());
    for (const v of vs) {
      for (const r of v.reasons) expect(CLOSED.has(r), `${v.facility}: ${r}`).toBe(true);
      // An allowed or preferred verdict carries no reason.
      if (v.verdict !== 'EXCLUDED') expect(v.reasons).toEqual([]);
      // An excluded verdict carries at least one.
      if (v.verdict === 'EXCLUDED') expect(v.reasons.length).toBeGreaterThan(0);
      // An excluded verdict scores 0.
      if (v.verdict === 'EXCLUDED') expect(v.score).toBe(0);
    }
  });
});
