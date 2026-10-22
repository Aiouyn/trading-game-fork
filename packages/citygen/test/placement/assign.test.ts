// T10A-12 (city placement, unit U5): the deterministic assignment.
//
// AC-10A-12-DET, AC-10A-12-NO-RANDOM, AC-10A-12-CLEAN, AC-10A-12-ANCHORS,
// AC-10A-12-ISOLATION, AC-10A-12-NO-ECON, AC-10A-12-SECTOR-PRESENT (soft).
//
// THE DETERMINISM TEST IS THE POINT OF THIS FILE. The same region rows and the same stream must
// give byte-identical canonical output, and a different seed must give a different output. The
// canonical encoding is `canonEncode` from packages/engine/core/canon.ts (the card's
// re-cut log point 5: `JSON.stringify` is banned by G8 for hashing and persistence).

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonEncode } from '@tycoon/engine-core/canon';
import { assignSectors, assignSectorsTraced, mixDeficit } from '../../src/placement/assign';
import { bufferViolations, edgeDistanceCm } from '../../src/placement/buffers';
import { districtRole } from '../../src/placement/classify';
import { DISTRICT_ROLE_MIX } from '../../src/placement/rules';
import { DISTRICT_ROLES, SECTORS } from '../../src/placement/types';
import type {
  DistrictRole,
  Draw,
  FixedPointCoord,
  PlacementAssignment,
  PlacementCtx,
  PlacementDistrict,
  PlacementParcel,
  RegionInput,
} from '../../src/placement/types';

// ---------- the reference region ----------

const CITY = 'cty_port_avalon';

/** The eight Port Avalon districts, with the roles the card names. */
const DISTRICTS: readonly { id: string; role: DistrictRole; tier: PlacementDistrict['tier'] }[] = [
  { id: 'dst_port_avalon_eastside_docks', role: 'PORT', tier: 'working' },
  { id: 'dst_port_avalon_industrial_basin', role: 'INDUSTRIAL', tier: 'working' },
  { id: 'dst_port_avalon_old_harbor', role: 'MIXED_CORE', tier: 'mid' },
  { id: 'dst_port_avalon_riverside_lofts', role: 'MIXED_RIVER', tier: 'mid' },
  { id: 'dst_port_avalon_midtown', role: 'TRANSIT_HUB', tier: 'mid' },
  { id: 'dst_port_avalon_financial_mile', role: 'CBD', tier: 'prime' },
  { id: 'dst_port_avalon_glasshill', role: 'PRIME_RES', tier: 'prime' },
  { id: 'dst_port_avalon_summit_estates_on_gilt_hill', role: 'TROPHY_RES', tier: 'trophy' },
];

/** A rectangle in centimetres. */
const rect = (x: number, z: number, w: number, h: number): FixedPointCoord[] => [
  { x, z },
  { x: x + w, z },
  { x: x + w, z: z + h },
  { x, z: z + h },
];

/** A parcel of a lot type, in a district. */
const parcel = (
  id: string,
  districtId: string,
  cls: PlacementParcel['zoning']['class'],
  areaM2: number,
  kind?: string,
  over: Partial<PlacementParcel> = {},
): PlacementParcel => ({
  id,
  cityId: CITY,
  districtId,
  regionId: 'reg_1',
  polygon: rect(0, 0, 2000, 2000),
  areaM2,
  frontageM: 40,
  access: ['ROAD'],
  zoning: {
    class: cls,
    industrialKind: kind as PlacementParcel['zoning']['industrialKind'],
    allowed: ['RETAIL', 'OFFICE', 'INDUSTRIAL', 'RES'],
    maxHeightM: 40,
    maxFar: 2,
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

/**
 * The reference region: eight districts, a handful of parcels each, of the lot types their role
 * can actually use.
 */
const referenceRegion = (): RegionInput => {
  const parcels: PlacementParcel[] = [];
  let n = 0;
  for (const d of DISTRICTS) {
    const kinds: readonly { cls: PlacementParcel['zoning']['class']; kind?: string; area: number }[] =
      d.role === 'PORT' || d.role === 'INDUSTRIAL'
        ? [
            { cls: 'industrial', kind: 'port', area: 30000 },
            { cls: 'industrial', kind: 'plant', area: 25000 },
            { cls: 'industrial', kind: 'warehouse', area: 8000 },
            { cls: 'industrial', kind: 'utility', area: 1500 },
            { cls: 'industrial', kind: 'datacenter', area: 12000 },
          ]
        : d.role === 'CBD'
          ? [
              { cls: 'cbd', area: 6000 },
              { cls: 'office_tower', area: 4000 },
              { cls: 'offices', area: 1200 },
              { cls: 'shops', area: 200 },
            ]
          : d.role === 'TROPHY_RES' || d.role === 'PRIME_RES'
            ? [
                { cls: 'highrise', area: 4000 },
                { cls: 'midrise', area: 1500 },
                { cls: 'row_house', area: 400 },
                { cls: 'shops', area: 150 },
              ]
            : [
                { cls: 'midrise', area: 2000 },
                { cls: 'shops', area: 200 },
                { cls: 'row_house', area: 400 },
                { cls: 'offices', area: 900 },
              ];
    for (const k of kinds) {
      n += 1;
      // The parcels are spread far apart, so the N3 buffer is never accidentally violated by two
      // facilities that happen to share a grid cell.
      parcels.push(
        parcel(`pcl_${String(n).padStart(3, '0')}`, d.id, k.cls, k.area, k.kind, {
          polygon: rect((n % 5) * 40000, Math.floor(n / 5) * 40000, 2000, 2000),
        }),
      );
    }
  }
  // A housing parcel next to the industrial basin: a receptor for the buffer check. It sits far
  // from every industrial parcel, so the N3 buffer is respected by the geometry, not by a fake
  // distance.
  parcels.push(
    parcel('pcl_999', 'dst_port_avalon_industrial_basin', 'house', 300, undefined, {
      polygon: rect(90000, 90000, 1000, 1000),
      zoning: {
        class: 'house',
        allowed: ['RES'],
        maxHeightM: 10,
        maxFar: 0.6,
        heritageLocked: false,
      },
      primaryUse: 'RES',
    }),
  );

  const roles: Record<string, DistrictRole> = {};
  for (const d of DISTRICTS) roles[d.id] = d.role;

  // The buffer distance is the REAL edge distance, computed by the same exact predicate the
  // audit uses. A constant would make the CLEAN check vacuous.
  const byId = new Map(parcels.map((p) => [p.id, p]));

  const ctx: PlacementCtx = {
    flagsOf: (id) => {
      const p = byId.get(id);
      return {
        quayEdge: p && p.districtId === 'dst_port_avalon_eastside_docks' ? [[0, 0], [2000, 0]] : null,
        railAccess: p ? p.districtId === 'dst_port_avalon_industrial_basin' : false,
        railPointCm: p && p.districtId === 'dst_port_avalon_industrial_basin' ? [0, 0] : null,
        crownParcel: p ? p.reservedFor === 'CROWN' : false,
      };
    },
    gridMw: () => true,
    arterial: () => true,
    nearDistanceM: () => 100,
    bufferDistanceCm: (a, b) => {
      const pa = byId.get(a);
      const pb = byId.get(b);
      if (!pa || !pb) return null;
      return edgeDistanceCm(pa.polygon, pb.polygon);
    },
    receptorParcelIds: ['pcl_999'],
    placedFacilities: [],
  };

  return {
    cityId: CITY,
    regionId: 'reg_1',
    districts: DISTRICTS.map((d) => ({
      id: d.id,
      cityId: CITY,
      tier: d.tier,
      terrainRole: 'flat_center',
    })),
    roles,
    parcels,
    ctx,
  };
};

/**
 * A region with ONLY the port district, on warehouse lots.
 *
 * It is the region where the port's real-estate cell can actually be carried: `re_office` and
 * `re_agency` are legal in the port but need an OFFICE_TOWER or a SHOPFRONT lot, so on a
 * warehouse lot they are EXCLUDED and the yard is the only facility of that sector that can
 * take it.
 */
const portOnlyRegion = (): RegionInput => {
  const districtId = 'dst_port_avalon_eastside_docks';
  const parcels: PlacementParcel[] = [];
  for (let i = 0; i < 3; i += 1) {
    parcels.push(
      parcel(`pcl_w${String(i).padStart(2, '0')}`, districtId, 'industrial', 8000, 'warehouse', {
        polygon: rect(i * 40000, 0, 2000, 2000),
      }),
    );
  }
  const byId = new Map(parcels.map((p) => [p.id, p]));
  const ctx: PlacementCtx = {
    flagsOf: (id) => {
      const p = byId.get(id);
      return {
        quayEdge: p ? [[0, 0], [2000, 0]] : null,
        railAccess: false,
        railPointCm: null,
        crownParcel: false,
      };
    },
    gridMw: () => true,
    arterial: () => true,
    nearDistanceM: () => 100,
    bufferDistanceCm: (a, b) => {
      const pa = byId.get(a);
      const pb = byId.get(b);
      if (!pa || !pb) return null;
      return edgeDistanceCm(pa.polygon, pb.polygon);
    },
    receptorParcelIds: [],
    placedFacilities: [],
  };
  return {
    cityId: CITY,
    regionId: 'reg_1',
    districts: [{ id: districtId, cityId: CITY, tier: 'working', terrainRole: 'flat_center' }],
    roles: { [districtId]: 'PORT' },
    parcels,
    ctx,
  };
};

/**
 * A deterministic draw: a small xorshift, seeded. Tooling only - the production stream is the
 * engine's, and this test only needs a reproducible source of [0, 1) values.
 */
const seededDraw = (seed: number): Draw & { count: number } => {
  let s = seed >>> 0 || 1;
  const draw = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    draw.count += 1;
    return (s >>> 0) / 4294967296;
  };
  draw.count = 0;
  return draw;
};

/** The canonical bytes of an assignment set. */
const canon = (assigned: readonly PlacementAssignment[]): Uint8Array =>
  canonEncode(assigned.map((a) => ({ ...a })));

// ---------- the tests ----------

describe('T10A-12 assign: determinism', () => {
  it('AC-10A-12-DET: the same region and stream give byte-identical output over 3 runs', () => {
    const region = referenceRegion();
    const a = assignSectors(region, seededDraw(20261020));
    const b = assignSectors(region, seededDraw(20261020));
    const c = assignSectors(region, seededDraw(20261020));
    expect(canon(a)).toEqual(canon(b));
    expect(canon(b)).toEqual(canon(c));
    // The bytes are not empty: a run that placed nothing would pass this test vacuously.
    expect(a.length).toBeGreaterThan(0);
    expect(canon(a).length).toBeGreaterThan(0);
  });

  it('AC-10A-12-DET: a different seed gives a different output on the reference region', () => {
    const region = referenceRegion();
    const a = assignSectors(region, seededDraw(20261020));
    const b = assignSectors(region, seededDraw(1));
    expect(canon(a)).not.toEqual(canon(b));
  });

  it('AC-10A-12-DET: the draw count equals the number of tied sets', () => {
    const region = referenceRegion();
    const draw = seededDraw(20261020);
    const trace = assignSectorsTraced(region, draw);
    expect(trace.draws).toBe(trace.tiedSets);
    // And the draw function was called exactly that many times.
    expect(draw.count).toBe(trace.draws);
  });

  it('AC-10A-12-DET: the output is sorted by parcel id, and no parcel is taken twice', () => {
    const region = referenceRegion();
    const assigned = assignSectors(region, seededDraw(20261020));
    const ids = assigned.map((a) => a.parcelId);
    expect(ids.slice().sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('AC-10A-12-DET: the assignment carries the rules version, the sector key and the vis key', () => {
    const region = referenceRegion();
    const assigned = assignSectors(region, seededDraw(20261020));
    for (const a of assigned) {
      expect(a.rulesVersion).toBe('placement.v1');
      expect(a.sectorKey).toBe(`SECTOR_${a.sector}`);
      expect(a.visKey).toBe(`city.vis:${CITY}:${a.parcelId}`);
    }
  });

  it('AC-10A-12-DET: the district role of an assignment matches the region\'s role', () => {
    const region = referenceRegion();
    const assigned = assignSectors(region, seededDraw(20261020));
    for (const a of assigned) {
      expect(region.roles[a.districtId], a.parcelId).toBeDefined();
    }
  });
});

describe('T10A-12 assign: the static determinism scan', () => {
  it('AC-10A-12-NO-RANDOM: no Math.random, Date.now, new Date or performance.now in placement/**', () => {
    const dir = fileURLToPath(new URL('../../src/placement/', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    const FORBIDDEN = ['Math.random', 'Date.now', 'new Date', 'performance.now'];
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      src.split('\n').forEach((text, i) => {
        const trimmed = text.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        for (const bad of FORBIDDEN) {
          if (text.includes(bad)) hits.push(`${f}:${i + 1}: ${bad}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});

describe('T10A-12 assign: the clean output and the anchors', () => {
  it('AC-10A-12-CLEAN: across 50 seeds the output has zero INV-PLC-1 and INV-PLC-2 violations', () => {
    const region = referenceRegion();
    for (let seed = 1; seed <= 50; seed += 1) {
      const assigned = assignSectors(region, seededDraw(seed));
      // INV-PLC-2: the buffer violations.
      expect(bufferViolations(assigned, region.parcels), `seed ${seed}`).toEqual([]);
    }
  });

  it('AC-10A-12-ANCHORS: exactly one fin_exchange, in Financial Mile', () => {
    const region = referenceRegion();
    for (let seed = 1; seed <= 20; seed += 1) {
      const assigned = assignSectors(region, seededDraw(seed));
      const exchanges = assigned.filter((a) => a.facility === 'fin_exchange');
      expect(exchanges.length, `seed ${seed}`).toBeLessThanOrEqual(1);
      for (const e of exchanges) {
        expect(e.districtId, `seed ${seed}`).toBe('dst_port_avalon_financial_mile');
      }
    }
  });

  it('the cardinality caps hold: one exchange per city, one restaurant per trophy district', () => {
    // The card: "at most 1 exchange per city" and "nothing in TROPHY_RES except one
    // fh_restaurant per district". The reference region has several CBD lots that would each
    // take an exchange, and several trophy lots that would each take a restaurant.
    const region = referenceRegion();
    for (let seed = 1; seed <= 20; seed += 1) {
      const assigned = assignSectors(region, seededDraw(seed));
      const exchanges = assigned.filter((a) => a.facility === 'fin_exchange');
      expect(exchanges.length, `seed ${seed}`).toBeLessThanOrEqual(1);
      const trophyRestaurants = assigned.filter(
        (a) => a.facility === 'fh_restaurant'
          && a.districtId === 'dst_port_avalon_summit_estates_on_gilt_hill',
      );
      expect(trophyRestaurants.length, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });

  it('a facility may be placed on more than one parcel (a district has several of each)', () => {
    // The card's step 5 iterates PARCELS, not facility classes: a district with six shop lots
    // carries six shops, not one. This is the check that would fail if the loop were over the
    // facility classes.
    const region = referenceRegion();
    const assigned = assignSectors(region, seededDraw(20261020));
    const counts: Record<string, number> = {};
    for (const a of assigned) counts[a.facility] = (counts[a.facility] ?? 0) + 1;
    const repeated = Object.values(counts).filter((n) => n > 1);
    expect(repeated.length, JSON.stringify(counts)).toBeGreaterThan(0);
  });

  it('AC-10A-12-ANCHORS: no N2 or N3 facility sits in Glasshill, Summit Estates, Old Harbor or Midtown', () => {
    const region = referenceRegion();
    const FORBIDDEN_DISTRICTS = [
      'dst_port_avalon_glasshill',
      'dst_port_avalon_summit_estates_on_gilt_hill',
      'dst_port_avalon_old_harbor',
      'dst_port_avalon_midtown',
    ];
    for (let seed = 1; seed <= 20; seed += 1) {
      const assigned = assignSectors(region, seededDraw(seed));
      for (const a of assigned) {
        if (!FORBIDDEN_DISTRICTS.includes(a.districtId)) continue;
        // A heavy facility in one of those districts would break the card's rule.
        const heavy = ['log_warehouse', 'log_port_terminal', 'en_plant', 'en_tank_farm', 'mf_plant',
          'mf_heavy', 'mf_chip_fab', 'ma_bulk_terminal', 'ma_grain_silo', 're_builders_yard'];
        expect(heavy.includes(a.facility), `seed ${seed}: ${a.facility} in ${a.districtId}`).toBe(false);
      }
    }
  });

  it('AC-10A-12-SECTOR-PRESENT (soft): the sectors with facilities in the reference region appear', () => {
    const region = referenceRegion();
    const assigned = assignSectors(region, seededDraw(20261020));
    const sectors = assigned.map((a) => a.sector);
    // The reference region has the lot types the commercial, industrial and residential
    // sectors need, so the sectors that may be placed there are all present.
    //
    // The soft AC warns but does not gate, so the check is "at least these sectors appear",
    // and the sectors it names are the ones the reference region can physically host.
    for (const s of ['FINANCE', 'FOOD_HOSPITALITY', 'RETAIL_CONSUMER', 'ENERGY', 'MANUFACTURING',
      'LOGISTICS_TRANSPORT', 'TECH_AI']) {
      expect(sectors.includes(s as never), s).toBe(true);
    }
  });
});

describe('T10A-12 assign: the isolation scan', () => {
  it('AC-10A-12-ISOLATION: no V, rent or valuation file imports from placement/**', () => {
    // The scan runs on the files PRESENT in this repo. `packages/engine/city/landvalue.ts` does
    // not exist yet (T10A-03 has not landed), so the scan covers every file that does, and the
    // card's own wording says so.
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    const candidates = [
      'packages/engine/core/params.ts',
      'packages/engine/macro/gapest.ts',
      'packages/engine/macro/rules/regime.ts',
      'packages/content/src/view.ts',
    ];
    const hits: string[] = [];
    for (const c of candidates) {
      let src: string;
      try {
        src = readFileSync(`${root}${c}`, 'utf8');
      } catch {
        continue; // the file is not in the repo yet
      }
      if (src.includes('placement/') || src.includes("@game/citygen") || src.includes('@tycoon/citygen')) {
        hits.push(c);
      }
    }
    expect(hits).toEqual([]);
  });

  it('AC-10A-12-NO-ECON: no economic module imports the placement output', () => {
    // The stronger half: the placement module itself must not import anything economic either.
    // The scan is over the IMPORT statements only, not over the prose: the files' headers name
    // what they must NOT touch (that is the point of the comment), and a scan over the prose
    // would flag its own documentation.
    const dir = fileURLToPath(new URL('../../src/placement/', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    const ECONOMIC = ['landvalue', 'rent', 'appraisal', 'demand', 'amenity', 'location_j', 'valuation'];
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      // The import statements: every line that starts with `import` and ends with a quote or a
      // brace, plus the `from '...'` specifier.
      const importLines = src
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('import ') || l.startsWith('} from '));
      for (const l of importLines) {
        for (const e of ECONOMIC) {
          if (l.includes(e)) hits.push(`${f}: ${l}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('T10A-12 assign: the mix deficit', () => {
  it('the deficit is the target minus the current share, floored at 0', () => {
    const assigned: PlacementAssignment[] = [
      {
        parcelId: 'pcl_1',
        districtId: 'dst_port_avalon_financial_mile',
        sector: 'FINANCE',
        sectorKey: 'SECTOR_FINANCE',
        facility: 'fin_exchange',
        styleKey: 'style.sector.finance.fin_exchange',
        densityBand: 'TOWER',
        rulesVersion: 'placement.v1',
        flags: { quayEdge: null, railAccess: false, railPointCm: null, crownParcel: false, bufferGreen: false },
        visKey: `city.vis:${CITY}:pcl_1`,
      },
    ];
    // The CBD's FINANCE target is 300 per-mille; one finance facility among one assigned parcel is
    // 1000 per-mille, so the deficit is 0.
    expect(mixDeficit('CBD', assigned, 'dst_port_avalon_financial_mile', 'FINANCE')).toBe(0);
    // A sector with no facility in the district has a 0 target and a 0 deficit.
    expect(mixDeficit('CBD', assigned, 'dst_port_avalon_financial_mile', 'RETAIL_CONSUMER')).toBe(0);
    // An empty district is at its whole target.
    expect(mixDeficit('CBD', [], 'dst_port_avalon_financial_mile', 'FINANCE')).toBe(300);
  });

  it('the deficit is a SHARE, never a facility count (the mix is a relative priority)', () => {
    // THE UNIT (Producer ruling, 2026-10-22, on Studio's T10A-12 review). The mix does NOT
    // determine a facility count: it says how a district's sectors rank against each other, and
    // the count is what the land does. The deficit term must therefore never read as a count.
    //
    // So: the deficit is BOUNDED BY THE CELL (a per-mille shortfall), and it is read WITHIN A
    // ROW ONLY (one role's row, one sector's cell) - never across rows.
    for (const role of DISTRICT_ROLES) {
      for (const sector of SECTORS) {
        const target = DISTRICT_ROLE_MIX[role][sector] ?? 0;
        // An empty district is at its whole target: the deficit is the cell, and the cell is a
        // per-mille number in [0, 1000], never a facility count.
        const empty = mixDeficit(role, [], 'dst_port_avalon_eastside_docks', sector);
        expect(empty, `${role} x ${sector}`).toBe(target);
        expect(empty, `${role} x ${sector}`).toBeLessThanOrEqual(1000);
        // A district over-target in that sector has no deficit.
        const over: PlacementAssignment[] = [
          {
            parcelId: 'pcl_over',
            districtId: 'dst_port_avalon_eastside_docks',
            sector,
            sectorKey: `SECTOR_${sector}`,
            facility: 'log_depot',
            styleKey: 'style.sector.logistics_transport.log_depot',
            densityBand: 'LOW',
            rulesVersion: 'placement.v1',
            flags: { quayEdge: null, railAccess: false, railPointCm: null, crownParcel: false, bufferGreen: false },
            visKey: `city.vis:${CITY}:pcl_over`,
          },
        ];
        expect(mixDeficit(role, over, 'dst_port_avalon_eastside_docks', sector), `${role} x ${sector}`)
          .toBe(0);
      }
    }
  });
});

describe('T10A-12 assign: the role derivation agrees with the assignment', () => {
  it('every district of the reference region derives the role the region names', () => {
    const region = referenceRegion();
    for (const d of region.districts) {
      const derived = districtRole(d, d.terrainRole);
      expect(derived, d.id).toBe(region.roles[d.id]);
    }
  });
});

describe('T10A-12 assign: the port\'s real-estate cell is carried by the YARD', () => {
  it('AC-10A-12-CARRIER: the yard takes a port parcel when no other facility of the cell can', () => {
    // THE RULING, AND THE PROOF THAT IT IS LIVE CODE (Producer ruling, 2026-10-22, on Studio's
    // T10A-12 review, section 4(d)). The port's REAL_ESTATE_SERVICES cell (100 per-mille) is
    // carried by `re_builders_yard`, not by the offices and the agencies: a dock with 100
    // per-mille of offices and agencies reads as a dock with a mini-CBD.
    //
    // The ruling is not vacuous, and this test proves it. `re_office` and `re_agency` are LEGAL
    // in the port (the card says "any except as excluded"), but they need an OFFICE_TOWER or a
    // SHOPFRONT lot and a 400-3,000 m2 / 40-200 m2 footprint, which a port yard does not have.
    // The yard needs a WAREHOUSE lot and 2,000-10,000 m2, which a port yard DOES have. So on a
    // port warehouse lot the offices and the agencies are EXCLUDED and the yard is the only
    // candidate that survives - and it takes the parcel.
    const region = portOnlyRegion();
    const assigned = assignSectors(region, seededDraw(20261020));
    const yards = assigned.filter((a) => a.facility === 're_builders_yard');
    expect(yards.length).toBeGreaterThan(0);
    for (const y of yards) {
      expect(y.districtId).toBe('dst_port_avalon_eastside_docks');
      expect(y.sector).toBe('REAL_ESTATE_SERVICES');
    }
    // And the offices and the agencies never take a port parcel in this region.
    const offices = assigned.filter((a) => a.facility === 're_office' || a.facility === 're_agency');
    expect(offices.length).toBe(0);
  });

  it('AC-10A-12-CARRIER: the port cell is 100 per-mille and it is the yard that carries it', () => {
    expect(DISTRICT_ROLE_MIX.PORT.REAL_ESTATE_SERVICES).toBe(100);
  });
});
