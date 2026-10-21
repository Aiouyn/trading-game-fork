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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import flags from '../data/district-flags.json' with { type: 'json' };

type DistrictRole = 'CBD' | 'PORT' | 'INDUSTRIAL' | 'MIXED_CORE' | 'MIXED_RIVER' | 'TRANSIT_HUB'
  | 'PRIME_RES' | 'TROPHY_RES';

const ROLES: readonly DistrictRole[] = ['CBD', 'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER',
  'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES'];

/** E-78.1: a port district's terrain role must be one of these. */
const WATERFRONT_ROLES: readonly string[] = ['waterfront', 'industrial_shore', 'island'];

/** E-80.1: the three districts 22 §3.2 gains R for; the Designer's authored values stand. */
const E80_R_ADDED: readonly string[] = [
  'dst_meridia_san_telmo_islands',
  'dst_meridia_grand_canal',
  'dst_tessan_tower_bund',
];

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

// ---------- the shipped file ----------

interface FlagRow {
  distId: string; port: boolean; station: boolean; cbd: boolean; riverOrCanal: boolean; role: string;
}
const ROWS: FlagRow[] = flags.districts as FlagRow[];
const BY_ID = new Map(ROWS.map((r) => [r.distId, r]));
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

describe('T10A-13 district-flags', () => {
  it('AC-10A-13-SCHEMA: catalogVersion is an integer and every row has the closed field set', () => {
    expect(Number.isInteger(flags.catalogVersion)).toBe(true);
    expect(flags.catalogVersion).toBe(1);
    for (const r of ROWS) {
      expect(Object.keys(r).sort()).toEqual(['cbd', 'distId', 'port', 'riverOrCanal', 'role', 'station']);
      expect(r.distId).toMatch(/^dst_[a-z0-9_]+$/);
      for (const k of ['port', 'station', 'cbd', 'riverOrCanal'] as const) expect(typeof r[k]).toBe('boolean');
      expect(ROLES).toContain(r.role);
    }
    expect(new Set(ROWS.map((r) => r.distId)).size).toBe(ROWS.length);
  });

  it('AC-10A-13-COVER: every 22 §3.3 district id has exactly one row, no unknown id, Port Avalon has 8', () => {
    expect(ROWS.length).toBe(105);
    expect(new Set(ROWS.map((r) => r.distId)).size).toBe(105);
    for (const s of SPEC_ROWS) expect(BY_ID.has(s.distId)).toBe(true);
    for (const r of ROWS) expect(SPEC_BY_ID.has(r.distId)).toBe(true);
    expect(ROWS.filter((r) => r.distId.startsWith('dst_port_avalon_')).length).toBe(8);
  });

  it('AC-10A-13-TABLE-MATCH: the file equals the card values table row for row', () => {
    expect(CARD_ROWS.length).toBe(105);
    for (const c of CARD_ROWS) {
      const r = BY_ID.get(c.distId);
      expect(r, `no row for ${c.distId}`).toBeDefined();
      expect(r!.port).toBe(c.port);
      expect(r!.station).toBe(c.station);
      expect(r!.cbd).toBe(c.cbd);
      expect(r!.role).toBe(c.role);
      expect(r!.riverOrCanal).toBe(c.riverOrCanal);
    }
  });

  it('AC-10A-13-RULES: one CBD per CBD city, port districts are waterfront, every city has INDUSTRIAL or PORT', () => {
    const byCity = new Map<string, FlagRow[]>();
    for (const r of ROWS) {
      const city = SPEC_BY_ID.get(r.distId)!.city;
      byCity.set(city, [...(byCity.get(city) ?? []), r]);
    }
    for (const [city, rows] of byCity) {
      const cbdRows = rows.filter((r) => r.cbd);
      const specCbd = SPEC_ROWS.filter((s) => s.city === city && s.cbd);
      expect(cbdRows.length, `${city}: cbd:true rows`).toBe(specCbd.length);
      expect(cbdRows.map((r) => r.distId).sort()).toEqual(specCbd.map((s) => s.distId).sort());
      for (const r of cbdRows) expect(r.role).toBe('CBD');
      // Every city has at least one INDUSTRIAL or PORT role, except Isla Serena.
      if (city !== 'Isla Serena') {
        expect(rows.some((r) => r.role === 'INDUSTRIAL' || r.role === 'PORT'), `${city}: no INDUSTRIAL/PORT`).toBe(true);
      }
    }
    // AC-10A-13-PORT-WATERFRONT (E-78.1): a port district's terrain role is waterfront.
    for (const r of ROWS.filter((x) => x.port)) {
      expect(WATERFRONT_ROLES, `${r.distId}`).toContain(SPEC_BY_ID.get(r.distId)!.terrain);
    }
    // The port flag marks one coastal city each, and the terrain set is exactly E-78's.
    expect(ROWS.filter((r) => r.port).length).toBe(8);
  });

  it('AC-10A-13-RULES: role equals the T10A-12 derivation for every row', () => {
    for (const r of ROWS) {
      const tier = SPEC_BY_ID.get(r.distId)!.tier;
      expect(r.role, `${r.distId}`).toBe(districtRole(tier, r));
    }
  });

  it('AC-10A-13-E80: the 3 E-80.1 districts carry R, and no role changed', () => {
    // E-80.1: R is added for these three; the Designer's riverOrCanal:true stands as authored.
    for (const id of E80_R_ADDED) expect(BY_ID.get(id)!.riverOrCanal, id).toBe(true);
    // No role changes: San Telmo Islands stays MIXED_RIVER, Grand Canal TROPHY_RES, Tower Bund CBD.
    expect(BY_ID.get('dst_meridia_san_telmo_islands')!.role).toBe('MIXED_RIVER');
    expect(BY_ID.get('dst_meridia_grand_canal')!.role).toBe('TROPHY_RES');
    expect(BY_ID.get('dst_tessan_tower_bund')!.role).toBe('CBD');
    // The two sets converge at 18: the Designer's R set and 22 §3.2's R set are identical.
    const emitted = ROWS.filter((r) => r.riverOrCanal);
    expect(emitted.length).toBe(18);
    expect(new Set(emitted.map((r) => r.distId)).size).toBe(18);
    expect(SPEC_R_IDS.size).toBe(18);
  });

  it('AC-10A-13-RIVER-FLAG (E-78.2): riverOrCanal follows the 22 §3.2 R flags and the riverside terrain', () => {
    const emitted = new Set(ROWS.filter((r) => r.riverOrCanal).map((r) => r.distId));
    expect(emitted.size).toBe(SPEC_R_IDS.size);
    for (const id of emitted) expect(SPEC_R_IDS.has(id)).toBe(true);
    for (const id of SPEC_R_IDS) expect(emitted.has(id)).toBe(true);
    for (const s of SPEC_ROWS) {
      if (s.terrain !== 'riverside') continue;
      expect(BY_ID.get(s.distId)!.riverOrCanal, `${s.distId} has riverside terrain`).toBe(true);
    }
  });

  it('AC-10A-12-ROLE-PA: the Port Avalon rows restate T10A-12\'s role table', () => {
    const PA: Record<string, DistrictRole> = {
      dst_port_avalon_financial_mile: 'CBD',
      dst_port_avalon_eastside_docks: 'PORT',
      dst_port_avalon_industrial_basin: 'INDUSTRIAL',
      dst_port_avalon_old_harbor: 'MIXED_CORE',
      dst_port_avalon_riverside_lofts: 'MIXED_RIVER',
      dst_port_avalon_midtown: 'TRANSIT_HUB',
      dst_port_avalon_glasshill: 'PRIME_RES',
      dst_port_avalon_summit_estates_on_gilt_hill: 'TROPHY_RES',
    };
    expect(Object.keys(PA).length).toBe(8);
    for (const [id, role] of Object.entries(PA)) expect(BY_ID.get(id)!.role, id).toBe(role);
  });

  it('AC-10A-13-TONE: the file carries no prose, only spec ids and the closed role set', () => {
    // Stand-in for the tonelint run (AC-10A-13-TONE): the tool's term list is not in this
    // environment, but the file holds no player-visible string at all - every value is either a
    // district id from 22 §3.3 or one of the 8 roles - so there is nothing for a term list to hit.
    const ids = new Set(SPEC_ROWS.map((s) => s.distId));
    for (const r of ROWS) {
      expect(ids.has(r.distId)).toBe(true);
      expect(ROLES).toContain(r.role);
    }
    const strings = JSON.parse(JSON.stringify(flags)) as { catalogVersion: number; districts: FlagRow[] };
    expect(strings.catalogVersion).toBe(1);
    expect(Object.keys(strings).sort()).toEqual(['catalogVersion', 'districts']);
  });
});
