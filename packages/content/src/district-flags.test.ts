// T10A-13 (district placement flags, content): the shipped JSON must equal the Designer's
// values table in the card row for row, and satisfy the card's consistency rules.
//
// Sources of truth (read at test time, never duplicated here):
//   - the card's values table : export/build-plan/cards/10A/T10A-13.md
//   - 22 §3.2 / §3.3           : export/vision-review/complete/22-CONTENT-CATALOGS.md
//
// E-80 (landed): R is ADDED for Meridia San Telmo Islands, Meridia Grand Canal and Tessan Tower
// Bund. The Designer's riverOrCanal:true on those three rows stands as authored, 22 §3.2 now
// carries the three R flags, and the two sets converge at 18. No district is on hold any more,
// so there is no placeholder list and no exemption: every row is covered by the strict checks.
//
// The checks below are written as PURE functions that REPORT problems instead of asserting
// inline. That is what lets the mutant baseline at the bottom of this file run against a
// catalogue mutated IN MEMORY: the same check code that guards the shipped file also rejects
// every mutant, so the coverage lives in the repo instead of in a reviewer's session. A later
// weakening of any check makes the mutant baseline fail.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import flags from '../data/district-flags.json' with { type: 'json' };

type DistrictRole = 'CBD' | 'PORT' | 'INDUSTRIAL' | 'MIXED_CORE' | 'MIXED_RIVER' | 'TRANSIT_HUB'
  | 'PRIME_RES' | 'TROPHY_RES';

const ROLES: readonly string[] = ['CBD', 'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER',
  'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES'];

/** E-78.1: a port district's terrain role must be one of these. */
const WATERFRONT_ROLES: readonly string[] = ['waterfront', 'industrial_shore', 'island'];

/** E-80.1: the three districts 22 §3.2 gains R for; the Designer's authored values stand. */
const E80_R_ADDED: readonly string[] = [
  'dst_meridia_san_telmo_islands',
  'dst_meridia_grand_canal',
  'dst_tessan_tower_bund',
];

/** E-80.1: no role changes with the release. */
const E80_ROLES: Readonly<Record<string, DistrictRole>> = {
  dst_meridia_san_telmo_islands: 'MIXED_RIVER',
  dst_meridia_grand_canal: 'TROPHY_RES',
  dst_tessan_tower_bund: 'CBD',
};

/** T10A-12's Port Avalon role table (AC-10A-12-ROLE-PA). */
const ROLE_PA: Readonly<Record<string, DistrictRole>> = {
  dst_port_avalon_financial_mile: 'CBD',
  dst_port_avalon_eastside_docks: 'PORT',
  dst_port_avalon_industrial_basin: 'INDUSTRIAL',
  dst_port_avalon_old_harbor: 'MIXED_CORE',
  dst_port_avalon_riverside_lofts: 'MIXED_RIVER',
  dst_port_avalon_midtown: 'TRANSIT_HUB',
  dst_port_avalon_glasshill: 'PRIME_RES',
  dst_port_avalon_summit_estates_on_gilt_hill: 'TROPHY_RES',
};

// ---------- markdown table parsing ----------

function mdRows(text: string): string[][] {
  const out: string[][] = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('|')) continue;
    out.push(s.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
  }
  return out;
}

function readMd(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

const CARD_PATH = '../../../export/build-plan/cards/10A/T10A-13.md';
const SPEC_PATH = '../../../export/vision-review/complete/22-CONTENT-CATALOGS.md';

interface CardRow {
  distId: string; port: boolean; station: boolean; cbd: boolean; riverOrCanal: boolean; role: string;
}

const cardText = readMd(CARD_PATH);
const cardSection = cardText.split('## Values table')[1].split('### Designer notes')[0];
const CARD_ROWS: CardRow[] = mdRows(cardSection)
  .filter((c) => c.length >= 6 && c[0].startsWith('dst_'))
  .map((c) => ({
    distId: c[0],
    port: c[1] === 'true', station: c[2] === 'true', cbd: c[3] === 'true',
    riverOrCanal: c[4] === 'true', role: c[5],
  }));

interface SpecRow { distId: string; city: string; district: string; tier: string; terrain: string; cbd: boolean }

const specText = readMd(SPEC_PATH);
const sec31 = specText.split('### §3.1 Launch cities')[1].split('### §3.2 City personalities')[0];
const sec32 = specText.split('### §3.2 City personalities')[1].split('### §3.3 Districts and landmarks')[0];
const sec33 = specText.split('### §3.3 Districts and landmarks')[1].split('Total: 105 districts')[0];

const CITY_NAME = new Map<string, string>();
for (const c of mdRows(sec31)) if (c.length >= 2 && c[0].startsWith('cty_')) CITY_NAME.set(c[0], c[1]);

const SPEC_ROWS: SpecRow[] = mdRows(sec33)
  .filter((c) => c.length >= 8 && c[0].startsWith('dst_'))
  .map((c) => ({
    distId: c[0], city: c[1], district: c[2], tier: c[3], terrain: c[4], cbd: c[7].includes('(CBD)'),
  }));

/** 22 §3.2 "Flagged districts": the R (river) set, as district ids. */
const SPEC_R_IDS: ReadonlySet<string> = (() => {
  const byName = new Map<string, string>();
  for (const s of SPEC_ROWS) byName.set(`${s.city}|${s.district}`, s.distId);
  const out = new Set<string>();
  for (const c of mdRows(sec32)) {
    if (c.length < 11 || !c[0].startsWith('cty_')) continue;
    const city = CITY_NAME.get(c[0]) ?? c[0];
    for (const part of c[10].split(';')) {
      if (!part.includes(':')) continue;
      const [letters, names] = part.split(':', 2);
      if (!letters.trim().includes('R')) continue;
      for (const n of names.split(',')) {
        const id = byName.get(`${city}|${n.trim()}`);
        if (id) out.add(id);
      }
    }
  }
  return out;
})();

// ---------- the catalogue under test ----------

/** A district row. The index signature lets a mutant add a field (M8). */
interface FlagRow {
  distId: string; port: boolean; station: boolean; cbd: boolean; riverOrCanal: boolean; role: string;
  [k: string]: unknown;
}

/** The whole file: { catalogVersion, districts }. */
interface Catalog { catalogVersion: unknown; districts: FlagRow[] }

/** The shipped catalogue, spread so the top-level key set is the file's own. */
const SHIPPED: Catalog = { ...flags } as unknown as Catalog;

const SPEC_BY_ID = new Map(SPEC_ROWS.map((s) => [s.distId, s]));

/**
 * T10A-12 classify.ts `districtRole`, in the order the card states:
 * cbd → port → working → trophy → prime → station (mid) → riverOrCanal (mid) → MIXED_CORE.
 */
function districtRole(tier: string, f: { cbd: boolean; port: boolean; station: boolean; riverOrCanal: boolean }): DistrictRole {
  if (f.cbd) return 'CBD';
  if (f.port) return 'PORT';
  if (tier === 'working') return 'INDUSTRIAL';
  if (tier === 'trophy') return 'TROPHY_RES';
  if (tier === 'prime') return 'PRIME_RES';
  if (tier === 'mid') return f.station ? 'TRANSIT_HUB' : f.riverOrCanal ? 'MIXED_RIVER' : 'MIXED_CORE';
  throw new Error(`unknown tier ${tier}`);
}

// ---------- the checks, as problem reporters ----------

/** A problem is "AC code: detail". The code names the check that found it. */
type Problem = string;

/** Same set of ids, compared as sets (no order, no duplicates). */
const SAME_SET = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const s = new Set(b);
  return a.every((x) => s.has(x));
};

/** AC-10A-13-SCHEMA: catalogVersion is an integer 1 and every row has the closed field set. */
function checkSchema(cat: Catalog): Problem[] {
  const out: Problem[] = [];
  if (!Number.isInteger(cat.catalogVersion)) {
    out.push(`AC-10A-13-SCHEMA: catalogVersion ${JSON.stringify(cat.catalogVersion)} is not an integer`);
  } else if (cat.catalogVersion !== 1) {
    out.push(`AC-10A-13-SCHEMA: catalogVersion ${String(cat.catalogVersion)}, expected 1`);
  }
  for (const r of cat.districts) {
    const keys = Object.keys(r).sort().join(',');
    if (keys !== 'cbd,distId,port,riverOrCanal,role,station') {
      out.push(`AC-10A-13-SCHEMA: ${r.distId} field set is [${keys}]`);
    }
    if (!/^dst_[a-z0-9_]+$/.test(r.distId)) out.push(`AC-10A-13-SCHEMA: ${r.distId} is not a valid id`);
    for (const k of ['port', 'station', 'cbd', 'riverOrCanal'] as const) {
      if (typeof r[k] !== 'boolean') out.push(`AC-10A-13-SCHEMA: ${r.distId}.${k} is not a boolean`);
    }
    if (!ROLES.includes(r.role)) out.push(`AC-10A-13-SCHEMA: ${r.distId} role ${r.role} is not one of the 8`);
  }
  if (new Set(cat.districts.map((r) => r.distId)).size !== cat.districts.length) {
    out.push('AC-10A-13-SCHEMA: duplicate distId');
  }
  return out;
}

/** AC-10A-13-COVER: every 22 §3.3 district id has exactly one row, no unknown id, Port Avalon 8. */
function checkCover(cat: Catalog): Problem[] {
  const out: Problem[] = [];
  const rows = cat.districts;
  if (rows.length !== 105) out.push(`AC-10A-13-COVER: ${rows.length} rows, expected 105`);
  const ids = new Set(rows.map((r) => r.distId));
  if (ids.size !== rows.length) out.push(`AC-10A-13-COVER: ${ids.size} unique ids for ${rows.length} rows`);
  for (const s of SPEC_ROWS) if (!ids.has(s.distId)) out.push(`AC-10A-13-COVER: no row for ${s.distId}`);
  for (const r of rows) if (!SPEC_BY_ID.has(r.distId)) out.push(`AC-10A-13-COVER: unknown id ${r.distId}`);
  const pa = rows.filter((r) => r.distId.startsWith('dst_port_avalon_')).length;
  if (pa !== 8) out.push(`AC-10A-13-COVER: Port Avalon has ${pa} rows, expected 8`);
  return out;
}

/** AC-10A-13-TABLE-MATCH: the file equals the card values table row for row, all 105 rows. */
function checkTableMatch(cat: Catalog): Problem[] {
  const out: Problem[] = [];
  const byId = new Map(cat.districts.map((r) => [r.distId, r]));
  if (CARD_ROWS.length !== 105) out.push(`AC-10A-13-TABLE-MATCH: card table has ${CARD_ROWS.length} rows, expected 105`);
  for (const c of CARD_ROWS) {
    const r = byId.get(c.distId);
    if (!r) { out.push(`AC-10A-13-TABLE-MATCH: no row for ${c.distId}`); continue; }
    if (r.port !== c.port) out.push(`AC-10A-13-TABLE-MATCH: ${c.distId} port ${String(r.port)}, card ${String(c.port)}`);
    if (r.station !== c.station) out.push(`AC-10A-13-TABLE-MATCH: ${c.distId} station ${String(r.station)}, card ${String(c.station)}`);
    if (r.cbd !== c.cbd) out.push(`AC-10A-13-TABLE-MATCH: ${c.distId} cbd ${String(r.cbd)}, card ${String(c.cbd)}`);
    if (r.role !== c.role) out.push(`AC-10A-13-TABLE-MATCH: ${c.distId} role ${r.role}, card ${c.role}`);
    if (r.riverOrCanal !== c.riverOrCanal) {
      out.push(`AC-10A-13-TABLE-MATCH: ${c.distId} riverOrCanal ${String(r.riverOrCanal)}, card ${String(c.riverOrCanal)}`);
    }
  }
  return out;
}

/** AC-10A-13-RULES: one CBD per CBD city, port districts are waterfront, every city has INDUSTRIAL or PORT. */
function checkRules(cat: Catalog): Problem[] {
  const out: Problem[] = [];
  const byCity = new Map<string, FlagRow[]>();
  for (const r of cat.districts) {
    const s = SPEC_BY_ID.get(r.distId);
    if (!s) continue; // unknown ids are AC-10A-13-COVER's business
    byCity.set(s.city, [...(byCity.get(s.city) ?? []), r]);
  }
  for (const [city, rows] of byCity) {
    const cbdRows = rows.filter((r) => r.cbd);
    const specCbd = SPEC_ROWS.filter((s) => s.city === city && s.cbd);
    if (cbdRows.length !== specCbd.length) {
      out.push(`AC-10A-13-RULES: ${city} has ${cbdRows.length} cbd:true rows, expected ${specCbd.length}`);
    }
    if (!SAME_SET(cbdRows.map((r) => r.distId), specCbd.map((s) => s.distId))) {
      out.push(`AC-10A-13-RULES: ${city} cbd:true rows are not 22 §3.3's CBD district`);
    }
    for (const r of cbdRows) {
      if (r.role !== 'CBD') out.push(`AC-10A-13-RULES: ${r.distId} is cbd:true but role ${r.role}`);
    }
    // Every city has at least one INDUSTRIAL or PORT role, except Isla Serena.
    if (city !== 'Isla Serena' && !rows.some((r) => r.role === 'INDUSTRIAL' || r.role === 'PORT')) {
      out.push(`AC-10A-13-RULES: ${city} has no INDUSTRIAL/PORT`);
    }
  }
  // AC-10A-13-PORT-WATERFRONT (E-78.1): a port district's terrain role is waterfront.
  for (const r of cat.districts.filter((x) => x.port)) {
    const s = SPEC_BY_ID.get(r.distId);
    if (s && !WATERFRONT_ROLES.includes(s.terrain)) {
      out.push(`AC-10A-13-RULES: ${r.distId} is port:true but terrain ${s.terrain}`);
    }
  }
  // The port flag marks one coastal city each, and the terrain set is exactly E-78's.
  const ports = cat.districts.filter((r) => r.port).length;
  if (ports !== 8) out.push(`AC-10A-13-RULES: ${ports} port:true rows, expected 8`);
  return out;
}

/** AC-10A-13-RULES (role derivation): every row's role equals the T10A-12 derivation. */
function checkRoleDerivation(cat: Catalog): Problem[] {
  const out: Problem[] = [];
  for (const r of cat.districts) {
    const s = SPEC_BY_ID.get(r.distId);
    if (!s) continue;
    if (!['working', 'trophy', 'prime', 'mid'].includes(s.tier)) {
      out.push(`AC-10A-13-RULES-ROLE: ${r.distId} has unknown tier ${s.tier}`);
      continue;
    }
    const derived = districtRole(s.tier, r);
    if (r.role !== derived) out.push(`AC-10A-13-RULES-ROLE: ${r.distId} role ${r.role}, derived ${derived}`);
  }
  return out;
}

/**
 * AC-10A-13-E80: the 3 E-80.1 districts carry R, no role changed, and the emitted R set and
 * 22 §3.2's R set are compared AGAINST EACH OTHER in BOTH directions - not merely counted.
 */
function checkE80(cat: Catalog): Problem[] {
  const out: Problem[] = [];
  for (const id of E80_R_ADDED) {
    const r = cat.districts.find((x) => x.distId === id);
    if (!r) { out.push(`AC-10A-13-E80: no row for ${id}`); continue; }
    if (r.riverOrCanal !== true) out.push(`AC-10A-13-E80: ${id} riverOrCanal ${String(r.riverOrCanal)}, expected true`);
  }
  for (const [id, role] of Object.entries(E80_ROLES)) {
    const r = cat.districts.find((x) => x.distId === id);
    if (r && r.role !== role) out.push(`AC-10A-13-E80: ${id} role ${r.role}, expected ${role}`);
  }
  const emitted = new Set(cat.districts.filter((r) => r.riverOrCanal).map((r) => r.distId));
  if (emitted.size !== 18) out.push(`AC-10A-13-E80: the emitted R set has ${emitted.size}, expected 18`);
  if (SPEC_R_IDS.size !== 18) out.push(`AC-10A-13-E80: 22 §3.2's R set has ${SPEC_R_IDS.size}, expected 18`);
  // Both directions: the two sets must be EQUAL, not merely the same size.
  for (const id of emitted) if (!SPEC_R_IDS.has(id)) out.push(`AC-10A-13-E80: ${id} has R in the file but not in 22 §3.2`);
  for (const id of SPEC_R_IDS) if (!emitted.has(id)) out.push(`AC-10A-13-E80: ${id} has R in 22 §3.2 but not in the file`);
  return out;
}

/** AC-10A-13-RIVER-FLAG (E-78.2): riverOrCanal follows the 22 §3.2 R flags and the riverside terrain. */
function checkRiverFlag(cat: Catalog): Problem[] {
  const out: Problem[] = [];
  const emitted = new Set(cat.districts.filter((r) => r.riverOrCanal).map((r) => r.distId));
  if (emitted.size !== SPEC_R_IDS.size) {
    out.push(`AC-10A-13-RIVER-FLAG: the file has ${emitted.size} R rows, 22 §3.2 has ${SPEC_R_IDS.size}`);
  }
  for (const id of emitted) if (!SPEC_R_IDS.has(id)) out.push(`AC-10A-13-RIVER-FLAG: ${id} has R in the file but not in 22 §3.2`);
  for (const id of SPEC_R_IDS) if (!emitted.has(id)) out.push(`AC-10A-13-RIVER-FLAG: ${id} has R in 22 §3.2 but not in the file`);
  for (const s of SPEC_ROWS) {
    if (s.terrain !== 'riverside') continue;
    const r = cat.districts.find((x) => x.distId === s.distId);
    if (r && r.riverOrCanal !== true) out.push(`AC-10A-13-RIVER-FLAG: ${s.distId} has riverside terrain but no R`);
  }
  return out;
}

/** AC-10A-12-ROLE-PA: the Port Avalon rows restate T10A-12's role table. */
function checkRolePa(cat: Catalog): Problem[] {
  const out: Problem[] = [];
  if (Object.keys(ROLE_PA).length !== 8) out.push('AC-10A-12-ROLE-PA: the role table does not have 8 entries');
  for (const [id, role] of Object.entries(ROLE_PA)) {
    const r = cat.districts.find((x) => x.distId === id);
    if (!r) { out.push(`AC-10A-12-ROLE-PA: no row for ${id}`); continue; }
    if (r.role !== role) out.push(`AC-10A-12-ROLE-PA: ${id} role ${r.role}, expected ${role}`);
  }
  return out;
}

/**
 * AC-10A-13-TONE: the file carries no prose, only spec ids and the closed role set.
 * Stand-in for the tonelint run: the tool's term list is not in this environment, but the file
 * holds no player-visible string at all - every value is either a district id from 22 §3.3 or
 * one of the 8 roles - so there is nothing for a term list to hit.
 */
function checkTone(cat: Catalog): Problem[] {
  const out: Problem[] = [];
  const topLevel = Object.keys(cat).sort().join(',');
  if (topLevel !== 'catalogVersion,districts') out.push(`AC-10A-13-TONE: top level is [${topLevel}]`);
  if (cat.catalogVersion !== 1) out.push(`AC-10A-13-TONE: catalogVersion ${String(cat.catalogVersion)}, expected 1`);
  const ids = new Set(SPEC_ROWS.map((s) => s.distId));
  for (const r of cat.districts) {
    if (!ids.has(r.distId)) out.push(`AC-10A-13-TONE: ${r.distId} is not a 22 §3.3 id`);
    if (!ROLES.includes(r.role)) out.push(`AC-10A-13-TONE: ${r.role} is not one of the 8 roles`);
  }
  return out;
}

/** Every check, under the AC code it reports. */
const CHECKS: readonly { code: string; fn: (cat: Catalog) => Problem[] }[] = [
  { code: 'AC-10A-13-SCHEMA', fn: checkSchema },
  { code: 'AC-10A-13-COVER', fn: checkCover },
  { code: 'AC-10A-13-TABLE-MATCH', fn: checkTableMatch },
  { code: 'AC-10A-13-RULES', fn: checkRules },
  { code: 'AC-10A-13-RULES-ROLE', fn: checkRoleDerivation },
  { code: 'AC-10A-13-E80', fn: checkE80 },
  { code: 'AC-10A-13-RIVER-FLAG', fn: checkRiverFlag },
  { code: 'AC-10A-12-ROLE-PA', fn: checkRolePa },
  { code: 'AC-10A-13-TONE', fn: checkTone },
];

// ---------- the shipped file ----------

describe('T10A-13 district-flags', () => {
  it('AC-10A-13-SCHEMA: catalogVersion is an integer and every row has the closed field set', () => {
    expect(checkSchema(SHIPPED)).toEqual([]);
  });

  it('AC-10A-13-COVER: every 22 §3.3 district id has exactly one row, no unknown id, Port Avalon has 8', () => {
    expect(checkCover(SHIPPED)).toEqual([]);
  });

  it('AC-10A-13-TABLE-MATCH: the file equals the card values table row for row', () => {
    expect(checkTableMatch(SHIPPED)).toEqual([]);
  });

  it('AC-10A-13-RULES: one CBD per CBD city, port districts are waterfront, every city has INDUSTRIAL or PORT', () => {
    expect(checkRules(SHIPPED)).toEqual([]);
  });

  it('AC-10A-13-RULES: role equals the T10A-12 derivation for every row', () => {
    expect(checkRoleDerivation(SHIPPED)).toEqual([]);
  });

  it('AC-10A-13-E80: the 3 E-80.1 districts carry R, and no role changed', () => {
    expect(checkE80(SHIPPED)).toEqual([]);
  });

  it('AC-10A-13-RIVER-FLAG (E-78.2): riverOrCanal follows the 22 §3.2 R flags and the riverside terrain', () => {
    expect(checkRiverFlag(SHIPPED)).toEqual([]);
  });

  it('AC-10A-12-ROLE-PA: the Port Avalon rows restate T10A-12\'s role table', () => {
    expect(checkRolePa(SHIPPED)).toEqual([]);
  });

  it('AC-10A-13-TONE: the file carries no prose, only spec ids and the closed role set', () => {
    expect(checkTone(SHIPPED)).toEqual([]);
  });
});

// ---------- the committed mutant baseline (QA's 12-mutant set) ----------

interface Mutant {
  /** The mutant's id, QA's numbering. */
  id: string;
  /** What the mutation does. */
  name: string;
  /** The check that MUST reject it. */
  killer: string;
  /** Further checks that must also reject it (a stronger mutant kills more). */
  alsoKilled: readonly string[];
  /** Apply the mutation to a copy of the catalogue. */
  mutate: (cat: Catalog) => void;
}

const rowOf = (cat: Catalog, distId: string): FlagRow => {
  const r = cat.districts.find((x) => x.distId === distId);
  if (!r) throw new Error(`no row for ${distId}`);
  return r;
};

/**
 * QA's mutant set, committed here so the coverage lives in the repo instead of in a reviewer's
 * session. QA ran 12 mutants on the JSON (a superset of the 10 originally reported) and killed
 * all 12. The one that matters most beyond the original ten is M11: it flips riverOrCanal OFF
 * on one of the three E-80 HELD rows, which proves the release cannot be used as a loophole
 * later - the held rows are still checked, so nobody can flip one without failing.
 *
 * M13 is the E-80 counterfactual (San Telmo's role flipped to MIXED_CORE); it is a JSON mutant
 * and lives here. The seam-assertion mutant (the C-04 seam test) lives in
 * tests/unit/city/seam.test.ts, because it mutates the seam TEST, not the catalogue.
 */
const MUTANTS: readonly Mutant[] = [
  {
    id: 'M1',
    name: 'role flipped (lakemont_lakefront CBD → MIXED_CORE)',
    killer: 'AC-10A-13-TABLE-MATCH',
    alsoKilled: ['AC-10A-13-RULES-ROLE', 'AC-10A-13-RULES'],
    mutate: (cat) => { rowOf(cat, 'dst_lakemont_lakefront').role = 'MIXED_CORE'; },
  },
  {
    id: 'M2',
    name: "catalogVersion → the card's old string \"district-flags.v1\"",
    killer: 'AC-10A-13-SCHEMA',
    alsoKilled: ['AC-10A-13-TONE'],
    mutate: (cat) => { cat.catalogVersion = 'district-flags.v1'; },
  },
  {
    id: 'M3',
    name: 'a row deleted (isla_serena_the_cays)',
    killer: 'AC-10A-13-COVER',
    alsoKilled: ['AC-10A-13-TABLE-MATCH'],
    mutate: (cat) => { cat.districts = cat.districts.filter((r) => r.distId !== 'dst_isla_serena_the_cays'); },
  },
  {
    id: 'M4',
    name: 'an unknown district id added (dst_atlantis_nowhere)',
    killer: 'AC-10A-13-COVER',
    alsoKilled: ['AC-10A-13-TONE'],
    mutate: (cat) => {
      cat.districts = [...cat.districts, {
        distId: 'dst_atlantis_nowhere', port: false, station: false, cbd: false,
        riverOrCanal: false, role: 'MIXED_CORE',
      }];
    },
  },
  {
    id: 'M5',
    name: 'cbd flipped off (redmesa_central_plaza)',
    killer: 'AC-10A-13-TABLE-MATCH',
    alsoKilled: ['AC-10A-13-RULES-ROLE'],
    mutate: (cat) => { rowOf(cat, 'dst_redmesa_central_plaza').cbd = false; },
  },
  {
    id: 'M6',
    name: 'port removed (meridia_arsenal_yards)',
    killer: 'AC-10A-13-TABLE-MATCH',
    alsoKilled: ['AC-10A-13-RULES-ROLE', 'AC-10A-13-RULES'],
    mutate: (cat) => { rowOf(cat, 'dst_meridia_arsenal_yards').port = false; },
  },
  {
    id: 'M7',
    name: 'riverOrCanal flipped off (valcourt_lock_quarter)',
    killer: 'AC-10A-13-TABLE-MATCH',
    alsoKilled: ['AC-10A-13-RIVER-FLAG', 'AC-10A-13-E80', 'AC-10A-13-RULES-ROLE'],
    mutate: (cat) => { rowOf(cat, 'dst_valcourt_lock_quarter').riverOrCanal = false; },
  },
  {
    id: 'M8',
    name: 'an extra field added to a row',
    killer: 'AC-10A-13-SCHEMA',
    alsoKilled: [],
    mutate: (cat) => { rowOf(cat, 'dst_lakemont_old_town').note = 'mutant'; },
  },
  {
    id: 'M9',
    name: 'station removed (lakemont_old_town)',
    killer: 'AC-10A-13-TABLE-MATCH',
    alsoKilled: ['AC-10A-13-RULES-ROLE'],
    mutate: (cat) => { rowOf(cat, 'dst_lakemont_old_town').station = false; },
  },
  {
    id: 'M10',
    name: 'Port Avalon role changed (financial_mile → PRIME_RES)',
    killer: 'AC-10A-13-TABLE-MATCH',
    alsoKilled: ['AC-10A-13-RULES-ROLE', 'AC-10A-13-RULES', 'AC-10A-12-ROLE-PA'],
    mutate: (cat) => { rowOf(cat, 'dst_port_avalon_financial_mile').role = 'PRIME_RES'; },
  },
  {
    id: 'M11',
    name: 'riverOrCanal flipped OFF on an E-80.1 district (meridia_san_telmo_islands)',
    killer: 'AC-10A-13-TABLE-MATCH',
    alsoKilled: ['AC-10A-13-E80', 'AC-10A-13-RIVER-FLAG', 'AC-10A-13-RULES-ROLE'],
    mutate: (cat) => { rowOf(cat, 'dst_meridia_san_telmo_islands').riverOrCanal = false; },
  },
  {
    id: 'M12',
    name: 'riverOrCanal flipped ON for a district that is not R (lakemont_northshore)',
    killer: 'AC-10A-13-TABLE-MATCH',
    alsoKilled: ['AC-10A-13-E80', 'AC-10A-13-RIVER-FLAG', 'AC-10A-13-RULES-ROLE'],
    mutate: (cat) => { rowOf(cat, 'dst_lakemont_northshore').riverOrCanal = true; },
  },
  {
    id: 'M13',
    name: 'San Telmo role flipped to MIXED_CORE (the E-80 counterfactual)',
    killer: 'AC-10A-13-TABLE-MATCH',
    alsoKilled: ['AC-10A-13-E80', 'AC-10A-13-RULES-ROLE'],
    mutate: (cat) => { rowOf(cat, 'dst_meridia_san_telmo_islands').role = 'MIXED_CORE'; },
  },
];

/** A deep copy of the shipped catalogue, so a mutant never touches the real file. */
function cloneShipped(): Catalog {
  return JSON.parse(JSON.stringify(SHIPPED)) as Catalog;
}

describe('T10A-13 mutant baseline (QA 12-mutant set, committed)', () => {
  it('the mutant set carries QA\'s 12 mutants, M1..M12, plus M13', () => {
    expect(MUTANTS.map((m) => m.id)).toEqual(
      ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13'],
    );
    // M11 is the one that matters most: the E-80 hold rows are still checked, so the release
    // cannot be used as a loophole later.
    const m11 = MUTANTS.find((m) => m.id === 'M11')!;
    expect(m11.alsoKilled).toContain('AC-10A-13-E80');
    expect(m11.killer).toBe('AC-10A-13-TABLE-MATCH');
  });

  it('the shipped file passes every check (the baseline the mutants are measured against)', () => {
    for (const c of CHECKS) expect(c.fn(SHIPPED), c.code).toEqual([]);
  });

  for (const m of MUTANTS) {
    it(`${m.id}: ${m.name} is killed by ${m.killer}`, () => {
      const cat = cloneShipped();
      m.mutate(cat);
      const killed = CHECKS.filter((c) => c.fn(cat).length > 0).map((c) => c.code);
      expect(killed.length, `${m.id} survived every check`).toBeGreaterThan(0);
      expect(killed, `${m.id} was not killed by ${m.killer}`).toContain(m.killer);
      for (const code of m.alsoKilled) {
        expect(killed, `${m.id} was not killed by ${code}`).toContain(code);
      }
    });
  }
});
