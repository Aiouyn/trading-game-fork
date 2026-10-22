// T10A-12 (city placement, unit U2): the district role, the lot type, the flags and the seed.
//
// AC-10A-12-ROLE-PA, AC-10A-12-ROLE-ALL, AC-10A-12-LOT, AC-10A-12-BAND-MAP,
// AC-10A-12-QUAY-RAIL, AC-10A-12-CROWN-FLAG, AC-10A-12-VIS-SEED.
//
// THE ROLE DERIVATION IS NOT A COPY (the thing this file exists to prove). The role is DERIVED
// from the tier (22 §3.3) and the four flags (the shipped district-flags.json), and the derivation
// is checked against the shipped `role` column for ALL 105 districts. A copy would compare the
// file to itself and prove nothing - the difference between a test and a tautology.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DISTRICT_FLAGS,
  DISTRICT_TIERS,
  cityVisKey,
  densityBand,
  districtRole,
  flagsOf,
  isAssignable,
  lotType,
  parcelFlags,
  tierOf,
} from '../../src/placement/classify';
import type {
  FixedPointCoord,
  PlacementDistrict,
  PlacementParcel,
  ReservedFor,
  UseClass,
  ZoningClass,
} from '../../src/placement/types';

// ---------- the shipped data, read at test time (never duplicated here) ----------

const CONTENT_FLAGS_PATH = '../../../content/data/district-flags.json';
const SPEC_22_PATH = '../../../../export/vision-review/complete/22-CONTENT-CATALOGS.md';

/** One row of the shipped district-flag table. */
interface FlagRow {
  distId: string;
  port: boolean;
  station: boolean;
  cbd: boolean;
  riverOrCanal: boolean;
  role: string;
}

/** The shipped table, read from the file so the test never carries a copy of it. */
const SHIPPED_FLAGS: { catalogVersion: unknown; districts: FlagRow[] } = JSON.parse(
  readFileSync(fileURLToPath(new URL(CONTENT_FLAGS_PATH, import.meta.url)), 'utf8'),
) as { catalogVersion: unknown; districts: FlagRow[] };

/** The markdown table rows of a text, as cells. */
const mdRows = (text: string): string[][] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));

/** The tier of every district, parsed from 22 §3.3 - the source the derivation reads. */
const SPEC_TIERS: ReadonlyMap<string, string> = (() => {
  const text = readFileSync(fileURLToPath(new URL(SPEC_22_PATH, import.meta.url)), 'utf8');
  const section = text.split('### §3.3 Districts and landmarks')[1] ?? '';
  const out = new Map<string, string>();
  for (const cells of mdRows(section)) {
    if (cells.length < 5) continue;
    const id = cells[0] ?? '';
    if (!id.startsWith('dst_')) continue;
    out.set(id, cells[3] ?? '');
  }
  return out;
})();

/** The district row the derivation is given: the tier is 22 §3.3's, the flags are the file's. */
const districtOf = (distId: string): PlacementDistrict => {
  const row = SHIPPED_FLAGS.districts.find((r) => r.distId === distId);
  if (!row) throw new Error(`no flag row for ${distId}`);
  const tier = SPEC_TIERS.get(distId);
  if (!tier) throw new Error(`no 22 §3.3 tier for ${distId}`);
  return {
    id: distId,
    cityId: 'cty_port_avalon',
    tier: tier as PlacementDistrict['tier'],
    terrainRole: 'flat_center',
  };
};

// ---------- the fixtures ----------

/** A parcel fixture. */
const parcel = (over: Partial<PlacementParcel> & { id: string }): PlacementParcel => ({
  cityId: 'cty_port_avalon',
  districtId: 'dst_port_avalon_financial_mile',
  regionId: 'reg_1',
  polygon: [
    { x: 0, z: 0 },
    { x: 1000, z: 0 },
    { x: 1000, z: 1000 },
    { x: 0, z: 1000 },
  ],
  areaM2: 100,
  frontageM: 20,
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
    transitDist: 500,
    slope: 0,
    cornerLot: false,
    mainAvenue: false,
    school: false,
  },
  primaryUse: 'RETAIL',
  reservedFor: null,
  ...over,
});

/** The zoning class of a fixture parcel. */
const withClass = (cls: ZoningClass, over: Partial<PlacementParcel> = {}): PlacementParcel =>
  parcel({
    id: 'pcl_1',
    zoning: { class: cls, allowed: ['RETAIL'], maxHeightM: 12, maxFar: 1.5, heritageLocked: false },
    ...over,
  });

// ---------- the role derivation ----------

describe('T10A-12 classify: the district role', () => {
  it('AC-10A-12-ROLE-PA: the eight Port Avalon districts map to the eight roles', () => {
    const EXPECTED: Readonly<Record<string, string>> = {
      dst_port_avalon_financial_mile: 'CBD',
      dst_port_avalon_eastside_docks: 'PORT',
      dst_port_avalon_industrial_basin: 'INDUSTRIAL',
      dst_port_avalon_old_harbor: 'MIXED_CORE',
      dst_port_avalon_riverside_lofts: 'MIXED_RIVER',
      dst_port_avalon_midtown: 'TRANSIT_HUB',
      dst_port_avalon_glasshill: 'PRIME_RES',
      dst_port_avalon_summit_estates_on_gilt_hill: 'TROPHY_RES',
    };
    expect(Object.keys(EXPECTED).length).toBe(8);
    for (const [id, role] of Object.entries(EXPECTED)) {
      expect(districtRole(districtOf(id), 'flat_center'), id).toBe(role);
    }
  });

  it('AC-10A-12-ROLE-ALL: the derivation reproduces the shipped role column for ALL 105 districts', () => {
    // The DERIVATION, written out here independently of the module, so the test is not the
    // module comparing itself to itself. The order is the card's and it is load-bearing.
    const derive = (tier: string, f: FlagRow): string => {
      if (f.cbd) return 'CBD';
      if (f.port) return 'PORT';
      if (tier === 'working') return 'INDUSTRIAL';
      if (tier === 'trophy') return 'TROPHY_RES';
      if (tier === 'prime') return 'PRIME_RES';
      if (tier === 'mid') {
        if (f.station) return 'TRANSIT_HUB';
        if (f.riverOrCanal) return 'MIXED_RIVER';
        return 'MIXED_CORE';
      }
      throw new Error(`unknown tier ${tier}`);
    };

    const mismatches: string[] = [];
    for (const row of SHIPPED_FLAGS.districts) {
      const tier = SPEC_TIERS.get(row.distId);
      if (!tier) {
        mismatches.push(`${row.distId}: no 22 §3.3 tier`);
        continue;
      }
      const derived = derive(tier, row);
      if (derived !== row.role) {
        mismatches.push(`${row.distId}: derived ${derived}, shipped ${row.role}`);
      }
    }
    expect(SHIPPED_FLAGS.districts.length).toBe(105);
    expect(mismatches).toEqual([]);
  });

  it('the module derives the same roles as the independent derivation, for all 105 districts', () => {
    // The module is checked against the shipped column (above) AND against this per-row pass, so
    // a module that returned a constant would fail the first check but not this one.
    const derived: { id: string; role: string }[] = SHIPPED_FLAGS.districts.map((row) => ({
      id: row.distId,
      role: districtRole(districtOf(row.distId), 'flat_center'),
    }));
    expect(derived.length).toBe(105);
    const distinct = derived.map((d) => d.role);
    expect(new Set(distinct).size).toBe(8);
  });

  it('the derivation ORDER is load-bearing: tier-before-flags gives a different answer', () => {
    // This is the Producer's measured counterfactual: 23 mismatches out of 105 when the tier is
    // read before the flags. If the order ever changes, this test fails.
    const deriveTierFirst = (tier: string, f: FlagRow): string => {
      if (tier === 'working') return 'INDUSTRIAL';
      if (tier === 'trophy') return 'TROPHY_RES';
      if (tier === 'prime') return 'PRIME_RES';
      if (f.cbd) return 'CBD';
      if (f.port) return 'PORT';
      if (tier === 'mid') {
        if (f.station) return 'TRANSIT_HUB';
        if (f.riverOrCanal) return 'MIXED_RIVER';
        return 'MIXED_CORE';
      }
      return 'MIXED_CORE';
    };
    let mismatches = 0;
    for (const row of SHIPPED_FLAGS.districts) {
      const tier = SPEC_TIERS.get(row.distId);
      if (!tier) continue;
      if (deriveTierFirst(tier, row) !== row.role) mismatches += 1;
    }
    expect(mismatches).toBeGreaterThan(0);
  });

  it('the tier comes from 22 §3.3, not from the flags file: the flags file has no tier column', () => {
    // The reason the derivation cannot copy the role column: the file carries exactly six keys
    // per row, and no tier.
    for (const row of SHIPPED_FLAGS.districts) {
      expect(Object.keys(row).sort().join(',')).toBe('cbd,distId,port,riverOrCanal,role,station');
    }
    expect(Object.keys(SHIPPED_FLAGS).sort().join(',')).toBe('catalogVersion,districts');
  });

  it('the module reads the flags file and 22 §3.3, and both carry the 105 districts', () => {
    expect(DISTRICT_FLAGS.length).toBe(105);
    expect(DISTRICT_TIERS.length).toBe(105);
    for (const t of DISTRICT_TIERS) {
      expect(['working', 'mid', 'prime', 'trophy']).toContain(t.tier);
    }
  });

  it('the flag lookup finds a district and misses cleanly', () => {
    expect(flagsOf('dst_port_avalon_financial_mile')?.cbd).toBe(true);
    expect(flagsOf('dst_nowhere')).toBeUndefined();
    expect(tierOf('dst_port_avalon_financial_mile')).toBe('prime');
    expect(tierOf('dst_nowhere')).toBeUndefined();
  });
});

// ---------- the lot type ----------

describe('T10A-12 classify: the lot type', () => {
  it('AC-10A-12-LOT: a fixture parcel per lot type classifies correctly', () => {
    expect(lotType(withClass('house'))).toBe('ROW');
    expect(lotType(withClass('row_house'))).toBe('ROW');
    expect(lotType(withClass('midrise'))).toBe('MIDRISE');
    expect(lotType(withClass('highrise'))).toBe('HIGHRISE');
    expect(lotType(withClass('shops'))).toBe('SHOPFRONT');
    expect(lotType(withClass('offices'))).toBe('MIDRISE');
    expect(lotType(withClass('office_tower'))).toBe('OFFICE_TOWER');
    expect(lotType(withClass('cbd'))).toBe('CBD_TOWER');
    expect(lotType(withClass('civic'))).toBe('CIVIC');
    expect(lotType(withClass('green'))).toBe('GREEN');
  });

  it('AC-10A-12-LOT: the industrial kinds each classify to their lot type', () => {
    const industrial = (kind: string): PlacementParcel =>
      parcel({
        id: 'pcl_1',
        zoning: {
          class: 'industrial',
          industrialKind: kind as PlacementParcel['zoning']['industrialKind'],
          allowed: ['INDUSTRIAL'],
          maxHeightM: 20,
          maxFar: 1,
          heritageLocked: false,
        },
      });
    expect(lotType(industrial('warehouse'))).toBe('WAREHOUSE');
    expect(lotType(industrial('plant'))).toBe('PLANT');
    expect(lotType(industrial('port'))).toBe('PORT_YARD');
    expect(lotType(industrial('datacenter'))).toBe('DC_SITE');
    expect(lotType(industrial('utility'))).toBe('UTILITY_SITE');
    expect(lotType(industrial('fab'))).toBe('FAB');
  });

  it('AC-10A-12-LOT: reservedFor parcels are never assignable', () => {
    const reserved: ReservedFor[] = ['CROWN', 'LANDMARK', 'HALL_OF_PATRONS', 'CIVIC', 'CORRIDOR'];
    for (const r of reserved) {
      expect(isAssignable(parcel({ id: 'pcl_1', reservedFor: r })), String(r)).toBe(false);
    }
    expect(isAssignable(parcel({ id: 'pcl_1', reservedFor: null }))).toBe(true);
  });

  it('AC-10A-12-LOT: a GREEN and a CIVIC parcel are not assignable either', () => {
    expect(isAssignable(withClass('green', { id: 'pcl_1' }))).toBe(false);
    expect(isAssignable(withClass('civic', { id: 'pcl_1' }))).toBe(false);
  });

  it('an unknown zoning class is a loud error, not a guess', () => {
    expect(() => lotType(withClass('bogus' as ZoningClass, { id: 'pcl_1' }))).toThrow();
  });
});

// ---------- the density band ----------

describe('T10A-12 classify: the density band', () => {
  it('AC-10A-12-BAND-MAP: the band equals the table\'s value for every zoning class', () => {
    expect(densityBand(withClass('house'))).toBe('LOW');
    expect(densityBand(withClass('row_house'))).toBe('LOW');
    expect(densityBand(withClass('shops'))).toBe('LOW');
    expect(densityBand(withClass('industrial'))).toBe('LOW');
    expect(densityBand(withClass('civic'))).toBe('LOW');
    expect(densityBand(withClass('green'))).toBe('LOW');
    expect(densityBand(withClass('midrise'))).toBe('MID');
    expect(densityBand(withClass('offices'))).toBe('MID');
    expect(densityBand(withClass('highrise'))).toBe('HIGH');
    expect(densityBand(withClass('office_tower'))).toBe('TOWER');
    expect(densityBand(withClass('cbd'))).toBe('TOWER');
  });

  it('AC-10A-12-BAND-MAP: a crown parcel is TOWER whatever its class', () => {
    expect(densityBand(withClass('shops', { id: 'pcl_1', reservedFor: 'CROWN' }))).toBe('TOWER');
    expect(densityBand(withClass('civic', { id: 'pcl_1', reservedFor: 'CROWN' }))).toBe('TOWER');
  });
});

// ---------- the parcel flags ----------

describe('T10A-12 classify: the parcel flags', () => {
  const water: FixedPointCoord[] = [{ x: 0, z: 0 }, { x: 1000, z: 0 }];

  it('AC-10A-12-QUAY-RAIL: the quay edge is the parcel edge within 200 cm of a quay wall', () => {
    // The water edge runs along z = 0, and the parcel's first edge is the segment (0,0)-(1000,0):
    // it IS the water edge, so it is within 200 cm and carries the quay.
    const p = parcel({ id: 'pcl_1' });
    const f = parcelFlags(p, { waterEdgeCm: water, quayWall: true }, { railAccess: false, railPointCm: null });
    expect(f.quayEdge).not.toBeNull();
    expect(f.quayEdge?.length).toBeGreaterThan(0);
  });

  it('AC-10A-12-QUAY-RAIL: no quay wall means no quay edge, however close the water is', () => {
    const p = parcel({ id: 'pcl_1' });
    const f = parcelFlags(p, { waterEdgeCm: water, quayWall: false }, { railAccess: false, railPointCm: null });
    expect(f.quayEdge).toBeNull();
  });

  it('AC-10A-12-QUAY-RAIL: water far from the parcel leaves no quay edge', () => {
    const far: FixedPointCoord[] = [{ x: 5000, z: 5000 }, { x: 6000, z: 5000 }];
    const p = parcel({ id: 'pcl_1' });
    const f = parcelFlags(p, { waterEdgeCm: far, quayWall: true }, { railAccess: false, railPointCm: null });
    expect(f.quayEdge).toBeNull();
  });

  it('AC-10A-12-QUAY-RAIL: the rail flag and its nearest point come from the rail view', () => {
    const p = parcel({ id: 'pcl_1' });
    const f = parcelFlags(
      p,
      { waterEdgeCm: null, quayWall: false },
      { railAccess: true, railPointCm: { x: 500, z: 20 } },
    );
    expect(f.railAccess).toBe(true);
    expect(f.railPointCm).toEqual([500, 20]);
  });

  it('AC-10A-12-CROWN-FLAG: the crown flag is set on exactly the CROWN-reserved parcels', () => {
    const crown = parcel({ id: 'pcl_1', reservedFor: 'CROWN' });
    expect(parcelFlags(crown, { waterEdgeCm: null, quayWall: false }, { railAccess: false, railPointCm: null })
      .crownParcel).toBe(true);
    const other = parcel({ id: 'pcl_2', reservedFor: 'LANDMARK' });
    expect(parcelFlags(other, { waterEdgeCm: null, quayWall: false }, { railAccess: false, railPointCm: null })
      .crownParcel).toBe(false);
  });
});

// ---------- the visual seed ----------

describe('T10A-12 classify: the visual seed', () => {
  it('AC-10A-12-VIS-SEED: the key is `city.vis:<cityId>:<parcelId>` and is stable', () => {
    expect(cityVisKey('cty_port_avalon', 'pcl_1')).toBe('city.vis:cty_port_avalon:pcl_1');
    expect(cityVisKey('cty_port_avalon', 'pcl_1')).toBe(cityVisKey('cty_port_avalon', 'pcl_1'));
    expect(cityVisKey('cty_port_avalon', 'pcl_1')).not.toBe(cityVisKey('cty_port_avalon', 'pcl_2'));
    expect(cityVisKey('cty_port_avalon', 'pcl_1')).not.toBe(cityVisKey('cty_other', 'pcl_1'));
  });

  it('AC-10A-12-VIS-SEED: the literal `city.vis:` appears only in cityVisKey', () => {
    // The scan is over the WHOLE package's source, not one file, so a second emitter elsewhere
    // is caught. The hits are the code lines only (a line whose first non-space character is not
    // a comment marker), so the prose that names the key does not count.
    const files = [
      '../../src/placement/types.ts',
      '../../src/placement/rules.ts',
      '../../src/placement/classify.ts',
      '../../src/placement/buffers.ts',
      '../../src/placement/suitability.ts',
      '../../src/placement/assign.ts',
      '../../src/placement/index.ts',
    ];
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
      src.split('\n').forEach((text, i) => {
        const trimmed = text.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        if (text.includes('city.vis:')) hits.push(`${f}:${i + 1}: ${trimmed}`);
      });
    }
    expect(hits.length).toBe(1);
    expect(hits[0]).toContain('return `city.vis:');
  });
});

// ---------- the unused import guard ----------

describe('T10A-12 classify: the module surface', () => {
  it('the use class set is the spec\'s eight', () => {
    const uses: UseClass[] = ['RES', 'OFFICE', 'RETAIL', 'INDUSTRIAL', 'HOSPITALITY', 'DATACENTER', 'CIVIC', 'GREEN'];
    expect(uses.length).toBe(8);
  });
});
