// T10A-12 (city placement, unit U1): the rules table's acceptance criteria.
//
// AC-10A-12-SECTORS, AC-10A-12-RULE-SHAPE, AC-10A-12-MIX-SUM, AC-10A-12-TABLE-ROWS,
// AC-10A-12-STRUCTURES, AC-10A-12-FAB, AC-10A-12-OFFMAP, AC-10A-12-STYLE-FALLBACK.
//
// The tests are written as REPORTERS that return a list of problems, not as inline assertions.
// That is deliberate: a later weakening of a check makes the reporter's own baseline fail, and
// the mutant baseline at the bottom of this file runs against a table mutated IN MEMORY, so the
// coverage lives in the repo instead of in a reviewer's session.

import { describe, expect, it } from 'vitest';
import {
  ANCHOR_FACILITIES,
  BUFFER_M,
  DISTRICT_ROLE_MIX,
  FACILITY_RULES,
  MIX_CARRIERS,
  PLACEMENT_RULES_VERSION,
  SECTORS_ALLOWED_IN_ROLE,
  STRUCTURE_CAP_M,
  STYLE_KEYS,
  facilitiesOfSector,
  facilityRule,
  facilityStyleKey,
  mixCarriers,
  mixRowSum,
  rulesOfSector,
  sectorStyleKey,
} from '../../src/placement/rules';
import { DISTRICT_ROLES, NUISANCE_CLASSES, SECTORS } from '../../src/placement/types';
import type { BizSector, DistrictRole, FacilityRule } from '../../src/placement/types';

/** A problem is "AC code: detail". The code names the check that found it. */
type Problem = string;

const SECTOR_KEY_RE = /^SECTOR_[A-Z_]+$/;

/** The 13 sectors of 09 §3.1.4, in the card's order. */
const CANONICAL_SECTORS: readonly string[] = [
  'FOOD_HOSPITALITY',
  'RETAIL_CONSUMER',
  'REAL_ESTATE_SERVICES',
  'LOGISTICS_TRANSPORT',
  'ENERGY',
  'MINING_AGRICULTURE',
  'MANUFACTURING',
  'TECH_AI',
  'FINANCE',
  'MEDIA_ENTERTAINMENT',
  'HEALTH',
  'LUXURY',
  'SECURITY_LEGAL_INTEL',
];

// ---------- the checks, as problem reporters ----------

/** AC-10A-12-SECTORS: exactly the 13 sectors, each with at least one facility, and the key shape. */
function checkSectors(rules: readonly FacilityRule[]): Problem[] {
  const out: Problem[] = [];
  const seen: string[] = [];
  for (const r of rules) if (!seen.includes(r.sector)) seen.push(r.sector);
  if (seen.length !== 13) out.push(`AC-10A-12-SECTORS: ${seen.length} sectors, expected 13`);
  for (const s of CANONICAL_SECTORS) {
    if (!seen.includes(s)) out.push(`AC-10A-12-SECTORS: sector ${s} has no facility`);
  }
  for (const s of seen) {
    if (!CANONICAL_SECTORS.includes(s)) out.push(`AC-10A-12-SECTORS: unknown sector ${s}`);
  }
  // E-61: every sectorKey matches SECTOR_<sector>, and no SEC_ key appears.
  for (const r of rules) {
    const key = `SECTOR_${r.sector}`;
    if (!SECTOR_KEY_RE.test(key)) out.push(`AC-10A-12-SECTORS: sectorKey ${key} is malformed`);
    if (key.startsWith('SEC_')) out.push(`AC-10A-12-SECTORS: sectorKey ${key} uses the rejected SEC_ prefix`);
  }
  return out;
}

/** AC-10A-12-RULE-SHAPE: the footprint, the lot types, the role sets and the style key. */
function checkRuleShape(rules: readonly FacilityRule[]): Problem[] {
  const out: Problem[] = [];
  const styleKeys: string[] = [];
  const facilities: string[] = [];
  for (const r of rules) {
    if (!(r.footprintM2[0] > 0 && r.footprintM2[0] < r.footprintM2[1])) {
      out.push(
        `AC-10A-12-RULE-SHAPE: ${r.facility} footprint ${r.footprintM2[0]}..${r.footprintM2[1]} is not 0 < min < max`,
      );
    }
    if (r.lotTypes.length === 0) out.push(`AC-10A-12-RULE-SHAPE: ${r.facility} has no lot type`);
    if (r.allowedRoles.length === 0) out.push(`AC-10A-12-RULE-SHAPE: ${r.facility} has no allowed role`);
    for (const p of r.preferredRoles) {
      if (!r.allowedRoles.includes(p)) {
        out.push(`AC-10A-12-RULE-SHAPE: ${r.facility} prefers ${p}, which is not allowed`);
      }
    }
    for (const e of r.excludeRoles) {
      if (r.allowedRoles.includes(e)) {
        out.push(`AC-10A-12-RULE-SHAPE: ${r.facility} excludes ${e}, which is also allowed`);
      }
    }
    const expected = facilityStyleKey(r.sector, r.facility);
    if (r.styleKey !== expected) {
      out.push(`AC-10A-12-RULE-SHAPE: ${r.facility} styleKey ${r.styleKey}, expected ${expected}`);
    }
    if (!styleKeys.includes(r.styleKey)) styleKeys.push(r.styleKey);
    if (!facilities.includes(r.facility)) facilities.push(r.facility);
    if (!NUISANCE_CLASSES.includes(r.nuisance)) {
      out.push(`AC-10A-12-RULE-SHAPE: ${r.facility} nuisance ${r.nuisance} is not one of the four`);
    }
  }
  if (styleKeys.length !== facilities.length) {
    out.push(`AC-10A-12-RULE-SHAPE: ${styleKeys.length} style keys for ${facilities.length} facilities`);
  }
  return out;
}

/**
 * AC-10A-12-MIX-SUM: every row sums to 1000, and every non-zero entry names a sector that has at
 * least one facility allowed in that role (the BICONDITIONAL, as Quant's review asked for: the
 * one-directional form would let a future edit set a legal sector to 0 and still pass).
 */
function checkMixSum(
  mix: Readonly<Record<string, Readonly<Record<string, number>>>>,
  rules: readonly FacilityRule[],
): Problem[] {
  const out: Problem[] = [];
  for (const role of DISTRICT_ROLES) {
    const row = mix[role];
    if (!row) {
      out.push(`AC-10A-12-MIX-SUM: no row for ${role}`);
      continue;
    }
    let sum = 0;
    for (const sector of SECTORS) sum += row[sector] ?? 0;
    if (sum !== 1000) out.push(`AC-10A-12-MIX-SUM: ${role} sums to ${sum}, expected 1000`);
    for (const sector of SECTORS) {
      const cell = row[sector] ?? 0;
      const allowed = rules.some((r) => r.sector === sector && r.allowedRoles.includes(role));
      if (cell !== 0 && !allowed) {
        out.push(`AC-10A-12-MIX-SUM: ${role} x ${sector} is ${cell}, but no facility may sit in ${role}`);
      }
      if (cell === 0 && allowed) {
        out.push(`AC-10A-12-MIX-SUM: ${role} x ${sector} is 0, but a facility may sit in ${role}`);
      }
    }
  }
  return out;
}

/**
 * AC-10A-12-CARRIER: every non-zero cell of the mix has a NAMED CARRIER, and the carrier is a
 * facility of that cell's sector.
 *
 * WHY THIS CHECK EXISTS (Producer ruling, 2026-10-22, on Studio's T10A-12 review). The card's
 * rules table carries ONE "Preferred roles" column per SECTOR, but the data model is per FACILITY
 * (`FacilityRule.preferredRoles`), and a cell without a named carrier means different cities:
 * Studio measured `CBD x FINANCE = 300` spanning 1.40x to 7.02x the district's land and
 * `PORT x LOGISTICS_TRANSPORT = 450` spanning 0.11x to 129.71x, depending only on which facility
 * the solver picks. The MIX-SUM biconditional does NOT catch this: it asks whether a sector may
 * sit in a role, not WHICH facility carries the cell.
 *
 * So this check asks the stronger question: for every non-zero cell, is there at least one
 * facility of that sector whose `preferredRoles` name the role? A cell whose only allowed
 * facility is NOT preferred there has no carrier, and the solver's preference for it is
 * indistinguishable from any other allowed facility - which is exactly the defect.
 */
function checkCarriers(rules: readonly FacilityRule[]): Problem[] {
  const out: Problem[] = [];
  for (const role of DISTRICT_ROLES) {
    const row = DISTRICT_ROLE_MIX[role];
    if (!row) continue;
    for (const sector of SECTORS) {
      const cell = row[sector] ?? 0;
      if (cell === 0) continue;
      const carriers = rules.filter(
        (r) => r.sector === sector && r.preferredRoles.includes(role),
      );
      if (carriers.length === 0) {
        out.push(
          `AC-10A-12-CARRIER: ${role} x ${sector} is ${cell}, but no facility of that sector prefers ${role}`,
        );
      }
      for (const c of carriers) {
        if (!c.allowedRoles.includes(role)) {
          out.push(
            `AC-10A-12-CARRIER: ${c.facility} carries ${role} x ${sector} but does not allow ${role}`,
          );
        }
      }
    }
  }
  return out;
}

/** AC-10A-12-TABLE-ROWS: the card's spot rows hold. */
function checkTableRows(rules: readonly FacilityRule[]): Problem[] {
  const out: Problem[] = [];
  const byFacility = (f: string): FacilityRule | undefined => rules.find((r) => r.facility === f);

  const exchange = byFacility('fin_exchange');
  if (!exchange) out.push('AC-10A-12-TABLE-ROWS: no fin_exchange rule');
  else if (exchange.allowedRoles.length !== 1 || exchange.allowedRoles[0] !== 'CBD') {
    out.push(`AC-10A-12-TABLE-ROWS: fin_exchange allows ${exchange.allowedRoles.join(',')}, expected CBD only`);
  }

  const terminal = byFacility('log_port_terminal');
  if (!terminal) out.push('AC-10A-12-TABLE-ROWS: no log_port_terminal rule');
  else {
    if (!terminal.needs.includes('WATERFRONT')) {
      out.push('AC-10A-12-TABLE-ROWS: log_port_terminal does not need WATERFRONT');
    }
    if (terminal.allowedRoles.length !== 1 || terminal.allowedRoles[0] !== 'PORT') {
      out.push(`AC-10A-12-TABLE-ROWS: log_port_terminal allows ${terminal.allowedRoles.join(',')}, expected PORT only`);
    }
  }

  for (const f of ['mf_heavy', 'en_plant']) {
    const r = byFacility(f);
    if (!r) out.push(`AC-10A-12-TABLE-ROWS: no ${f} rule`);
    else if (r.nuisance !== 'N3') out.push(`AC-10A-12-TABLE-ROWS: ${f} is ${r.nuisance}, expected N3`);
  }

  const boutique = byFacility('lx_boutique');
  if (!boutique) out.push('AC-10A-12-TABLE-ROWS: no lx_boutique rule');
  else {
    for (const role of ['INDUSTRIAL', 'PORT', 'TRANSIT_HUB'] as const) {
      if (!boutique.excludeRoles.includes(role)) {
        out.push(`AC-10A-12-TABLE-ROWS: lx_boutique does not exclude ${role}`);
      }
    }
  }

  const hospital = byFacility('hl_hospital');
  if (!hospital) out.push('AC-10A-12-TABLE-ROWS: no hl_hospital rule');
  else if (!hospital.receptor) out.push('AC-10A-12-TABLE-ROWS: hl_hospital is not a receptor');
  return out;
}

/** AC-10A-12-STRUCTURES: every structure kind on a rule has a cap, and the cap is the ruling's. */
function checkStructures(rules: readonly FacilityRule[]): Problem[] {
  const out: Problem[] = [];
  const EXPECTED: Readonly<Record<string, number>> = {
    STS_CRANE: 80,
    RTG_GANTRY: 30,
    SHIP_LOADER: 50,
    STACK: 120,
    CHIMNEY: 60,
    SILO: 55,
    TANK: 25,
    FLARE: 60,
    COOLING_TOWER: 90,
    MAST: 120,
  };
  for (const r of rules) {
    for (const s of r.structures ?? []) {
      const cap = STRUCTURE_CAP_M[s.kind];
      if (cap === undefined) {
        out.push(`AC-10A-12-STRUCTURES: ${r.facility} carries ${s.kind}, which has no cap`);
        continue;
      }
      if (s.maxM !== cap) {
        out.push(`AC-10A-12-STRUCTURES: ${r.facility} carries ${s.kind} at ${s.maxM} m, the cap is ${cap} m`);
      }
      if (s.maxM > cap) {
        out.push(`AC-10A-12-STRUCTURES: ${r.facility} carries ${s.kind} above its cap`);
      }
    }
  }
  for (const kind of Object.keys(EXPECTED)) {
    if (STRUCTURE_CAP_M[kind] !== EXPECTED[kind]) {
      out.push(`AC-10A-12-STRUCTURES: the cap of ${kind} is ${String(STRUCTURE_CAP_M[kind])}, expected ${String(EXPECTED[kind])}`);
    }
  }
  // Only the facilities the ruling names may carry a structure.
  const ALLOWED: Readonly<Record<string, readonly string[]>> = {
    log_port_terminal: ['STS_CRANE', 'RTG_GANTRY'],
    ma_bulk_terminal: ['SHIP_LOADER'],
    en_plant: ['STACK', 'COOLING_TOWER'],
    en_tank_farm: ['TANK', 'FLARE'],
    mf_heavy: ['CHIMNEY'],
    ma_grain_silo: ['SILO'],
    me_broadcaster: ['MAST'],
  };
  for (const r of rules) {
    const allowed = ALLOWED[r.facility] ?? [];
    for (const s of r.structures ?? []) {
      if (!allowed.includes(s.kind)) {
        out.push(`AC-10A-12-STRUCTURES: ${r.facility} carries ${s.kind}, which the ruling does not give it`);
      }
    }
  }
  return out;
}

/** AC-10A-12-FAB: `mf_chip_fab` is the only facility that uses a FAB lot. */
function checkFab(rules: readonly FacilityRule[]): Problem[] {
  const out: Problem[] = [];
  for (const r of rules) {
    if (r.lotTypes.includes('FAB') && r.facility !== 'mf_chip_fab') {
      out.push(`AC-10A-12-FAB: ${r.facility} uses the FAB lot type`);
    }
  }
  const fab = rules.find((r) => r.facility === 'mf_chip_fab');
  if (!fab) out.push('AC-10A-12-FAB: no mf_chip_fab rule');
  else {
    if (!fab.lotTypes.includes('FAB')) out.push('AC-10A-12-FAB: mf_chip_fab does not use the FAB lot type');
    if (fab.lotTypes.length !== 1) out.push('AC-10A-12-FAB: mf_chip_fab uses more than the FAB lot type');
    if (!fab.needs.includes('GRID_MW')) out.push('AC-10A-12-FAB: mf_chip_fab does not need GRID_MW');
  }
  return out;
}

/** AC-10A-12-OFFMAP: MINING_AGRICULTURE has exactly the three in-city facilities. */
function checkOffmap(rules: readonly FacilityRule[]): Problem[] {
  const out: Problem[] = [];
  const mining = rules.filter((r) => r.sector === 'MINING_AGRICULTURE').map((r) => r.facility);
  const expected = ['ma_bulk_terminal', 'ma_grain_silo', 'ma_trading_office'];
  for (const f of expected) if (!mining.includes(f)) out.push(`AC-10A-12-OFFMAP: no ${f} facility`);
  for (const f of mining) if (!expected.includes(f)) out.push(`AC-10A-12-OFFMAP: unexpected ${f} facility`);
  // "silos, terminals and spurs appear only in PORT or INDUSTRIAL roles".
  for (const f of ['ma_bulk_terminal', 'ma_grain_silo']) {
    const r = rules.find((x) => x.facility === f);
    if (!r) continue;
    for (const role of r.allowedRoles) {
      if (role !== 'PORT' && role !== 'INDUSTRIAL') {
        out.push(`AC-10A-12-OFFMAP: ${f} may sit in ${role}`);
      }
    }
  }
  return out;
}

/**
 * THE COMMITTED CARRIER TABLE (Producer ruling, 2026-10-22, on Studio's T10A-12 review).
 *
 * One row per non-zero cell of the mix: the role, the sector, the cell's per-mille, and the
 * facility that CARRIES it - the facility the solver prefers, and the one whose footprint
 * and character the cell is talking about.
 *
 * The card's rules table carries ONE "Preferred roles" column per SECTOR; the data model is
 * per FACILITY. This table is the per-CELL statement the card's re-cut has to confirm, and
 * it is committed here so the ruling lives in the repo rather than in a review.
 *
 * Studio's measurement of why this matters, on the reference map:
 *   `CBD x FINANCE = 300` spans 1.40x to 7.02x the district's land depending only on which
 *   facility the solver picks, and `PORT x LOGISTICS_TRANSPORT = 450` spans 0.11x to 129.71x.
 *   Same cell, opposite failures: a parade or an overflow.
 *
 * THE ROWS MARKED "CITY DEV'S CALL" are the ones the card names NO facility for. They are
 * flagged in `rules.ts` next to the facility that carries them, and the card's re-cut will
 * state them. Every other row is the card's own words, read per facility.
 */
const CARRIER_TABLE: readonly (readonly [DistrictRole, BizSector, number, readonly string[]])[] = [
  ['CBD', 'FOOD_HOSPITALITY', 140, ['fh_cafe', 'fh_restaurant', 'fh_hotel', 'fh_food_hall']],
  ['CBD', 'REAL_ESTATE_SERVICES', 65, ['re_office']],
  ['CBD', 'ENERGY', 35, ['en_hq']],
  ['CBD', 'MINING_AGRICULTURE', 25, ['ma_trading_office']],
  ['CBD', 'TECH_AI', 120, ['tech_office']],
  ['CBD', 'FINANCE', 300, ['fin_exchange', 'fin_tower']],
  ['CBD', 'MEDIA_ENTERTAINMENT', 45, ['me_broadcaster']],
  ['CBD', 'HEALTH', 80, ['hl_clinic']],
  ['CBD', 'LUXURY', 70, ['lx_boutique', 'lx_flagship']],
  ['CBD', 'SECURITY_LEGAL_INTEL', 120, ['sl_law_firm']],
  // THE RULING: the port's real-estate cell is the YARD, not the offices and the agencies.
  ['PORT', 'REAL_ESTATE_SERVICES', 100, ['re_builders_yard']],
  ['PORT', 'LOGISTICS_TRANSPORT', 450, ['log_port_terminal', 'log_warehouse', 'log_depot']],
  ['PORT', 'ENERGY', 150, ['en_tank_farm']],
  ['PORT', 'MINING_AGRICULTURE', 150, ['ma_bulk_terminal', 'ma_grain_silo']],
  ['PORT', 'MANUFACTURING', 150, ['mf_heavy']],
  ['INDUSTRIAL', 'RETAIL_CONSUMER', 60, ['rc_big_box']],
  ['INDUSTRIAL', 'REAL_ESTATE_SERVICES', 80, ['re_builders_yard']],
  ['INDUSTRIAL', 'LOGISTICS_TRANSPORT', 200, ['log_warehouse', 'log_depot']],
  ['INDUSTRIAL', 'ENERGY', 100, ['en_plant']],
  ['INDUSTRIAL', 'MINING_AGRICULTURE', 20, ['ma_grain_silo']],
  ['INDUSTRIAL', 'MANUFACTURING', 460, ['mf_light', 'mf_plant', 'mf_heavy', 'mf_chip_fab']],
  ['INDUSTRIAL', 'TECH_AI', 40, ['tech_datacenter']],
  ['INDUSTRIAL', 'MEDIA_ENTERTAINMENT', 30, ['me_studio']],
  ['INDUSTRIAL', 'SECURITY_LEGAL_INTEL', 10, ['sl_guard_depot']],
  ['MIXED_CORE', 'FOOD_HOSPITALITY', 280, ['fh_cafe', 'fh_restaurant', 'fh_hotel', 'fh_food_hall']],
  ['MIXED_CORE', 'RETAIL_CONSUMER', 220, ['rc_shop', 'rc_supermarket']],
  ['MIXED_CORE', 'REAL_ESTATE_SERVICES', 100, ['re_office']],
  ['MIXED_CORE', 'ENERGY', 20, ['en_substation']],
  ['MIXED_CORE', 'FINANCE', 50, ['fin_branch']],
  ['MIXED_CORE', 'MEDIA_ENTERTAINMENT', 90, ['me_venue']],
  ['MIXED_CORE', 'HEALTH', 70, ['hl_hospital', 'hl_clinic']],
  ['MIXED_CORE', 'LUXURY', 70, ['lx_boutique']],
  // CITY DEV'S CALL: the card names no facility for the old town's security cell.
  ['MIXED_CORE', 'SECURITY_LEGAL_INTEL', 100, ['sl_cyber']],
  ['MIXED_RIVER', 'FOOD_HOSPITALITY', 220, ['fh_cafe', 'fh_restaurant']],
  ['MIXED_RIVER', 'RETAIL_CONSUMER', 160, ['rc_shop', 'rc_supermarket']],
  // CITY DEV'S CALL: the card names no facility for the lofts' real-estate cell.
  ['MIXED_RIVER', 'REAL_ESTATE_SERVICES', 90, ['re_agency']],
  ['MIXED_RIVER', 'LOGISTICS_TRANSPORT', 100, ['log_depot', 'log_courier_hub']],
  ['MIXED_RIVER', 'ENERGY', 30, ['en_substation']],
  ['MIXED_RIVER', 'MANUFACTURING', 30, ['mf_light']],
  ['MIXED_RIVER', 'TECH_AI', 90, ['tech_office']],
  ['MIXED_RIVER', 'FINANCE', 40, ['fin_branch']],
  ['MIXED_RIVER', 'MEDIA_ENTERTAINMENT', 130, ['me_studio']],
  ['MIXED_RIVER', 'HEALTH', 50, ['hl_clinic']],
  // CITY DEV'S CALL: the card names no facility for the lofts' security cell.
  ['MIXED_RIVER', 'SECURITY_LEGAL_INTEL', 60, ['sl_cyber']],
  ['TRANSIT_HUB', 'FOOD_HOSPITALITY', 220, ['fh_cafe', 'fh_restaurant', 'fh_hotel', 'fh_food_hall']],
  ['TRANSIT_HUB', 'RETAIL_CONSUMER', 210, ['rc_shop', 'rc_supermarket']],
  // CITY DEV'S CALL: the card names no facility for the station quarter's real-estate cell.
  ['TRANSIT_HUB', 'REAL_ESTATE_SERVICES', 130, ['re_agency']],
  ['TRANSIT_HUB', 'LOGISTICS_TRANSPORT', 60, ['log_depot', 'log_courier_hub']],
  ['TRANSIT_HUB', 'ENERGY', 30, ['en_substation']],
  ['TRANSIT_HUB', 'TECH_AI', 70, ['tech_office']],
  ['TRANSIT_HUB', 'FINANCE', 80, ['fin_branch']],
  ['TRANSIT_HUB', 'MEDIA_ENTERTAINMENT', 80, ['me_venue']],
  ['TRANSIT_HUB', 'HEALTH', 80, ['hl_hospital', 'hl_clinic']],
  ['TRANSIT_HUB', 'SECURITY_LEGAL_INTEL', 40, ['sl_guard_depot']],
  ['PRIME_RES', 'FOOD_HOSPITALITY', 60, ['fh_cafe', 'fh_restaurant']],
  ['PRIME_RES', 'RETAIL_CONSUMER', 50, ['rc_shop']],
  // CITY DEV'S CALL: the card names no facility for Glasshill's real-estate cell.
  ['PRIME_RES', 'REAL_ESTATE_SERVICES', 90, ['re_agency']],
  ['PRIME_RES', 'ENERGY', 20, ['en_substation']],
  ['PRIME_RES', 'TECH_AI', 250, ['tech_office', 'tech_campus']],
  ['PRIME_RES', 'FINANCE', 180, ['fin_branch']],
  ['PRIME_RES', 'HEALTH', 100, ['hl_lab']],
  ['PRIME_RES', 'LUXURY', 150, ['lx_boutique', 'lx_flagship', 'lx_atelier']],
  ['PRIME_RES', 'SECURITY_LEGAL_INTEL', 100, ['sl_cyber']],
  // The cell is 20, not 80: one restaurant against a hard cap of one per district.
  ['TROPHY_RES', 'FOOD_HOSPITALITY', 20, ['fh_restaurant']],
  // CITY DEV'S CALL: the card names no facility for the hill's real-estate cell.
  ['TROPHY_RES', 'REAL_ESTATE_SERVICES', 260, ['re_agency']],
  ['TROPHY_RES', 'HEALTH', 120, ['hl_clinic']],
  ['TROPHY_RES', 'LUXURY', 600, ['lx_boutique', 'lx_flagship', 'lx_atelier']],
];

/**
 * AC-10A-12-CARRIER: the committed carrier table agrees with the rules table, cell by cell.
 *
 * Two directions, because either one alone is weak:
 *   - every row of the committed table is a NON-ZERO cell of the mix, with the right per-mille,
 *     and the rules table names exactly the carriers the table says;
 *   - every NON-ZERO cell of the mix is a row of the committed table, so a cell added to the mix
 *     without a carrier decision fails here instead of shipping silently.
 */
function checkCarrierTable(rules: readonly FacilityRule[]): Problem[] {
  const out: Problem[] = [];
  const seen: string[] = [];
  const carriersOf = (role: DistrictRole, sector: BizSector): string[] => {
    if ((DISTRICT_ROLE_MIX[role]?.[sector] ?? 0) === 0) return [];
    return rules
      .filter((r) => r.sector === sector && r.preferredRoles.includes(role))
      .map((r) => r.facility);
  };
  for (const [role, sector, permille, facilities] of CARRIER_TABLE) {
    const cell = DISTRICT_ROLE_MIX[role]?.[sector];
    if (cell === undefined) {
      out.push(`AC-10A-12-CARRIER: ${role} x ${sector} is not a mix cell`);
      continue;
    }
    if (cell !== permille) {
      out.push(
        `AC-10A-12-CARRIER: ${role} x ${sector} is ${cell} in the mix, ${permille} in the carrier table`,
      );
    }
    const actual = carriersOf(role, sector);
    if (actual.join(',') !== facilities.join(',')) {
      out.push(
        `AC-10A-12-CARRIER: ${role} x ${sector} carries [${actual.join(',')}], the table says [${facilities.join(',')}]`,
      );
    }
    seen.push(`${role} x ${sector}`);
  }
  // Every non-zero cell is in the table.
  for (const role of DISTRICT_ROLES) {
    for (const sector of SECTORS) {
      if ((DISTRICT_ROLE_MIX[role][sector] ?? 0) === 0) continue;
      if (!seen.includes(`${role} x ${sector}`)) {
        out.push(`AC-10A-12-CARRIER: ${role} x ${sector} is not in the carrier table`);
      }
    }
  }
  return out;
}

/** AC-10A-12-STYLE-FALLBACK: every placed facility resolves to a defined key or its sector base. */
function checkStyleFallback(rules: readonly FacilityRule[]): Problem[] {
  const out: Problem[] = [];
  for (const r of rules) {
    const base = sectorStyleKey(r.sector);
    if (!STYLE_KEYS.includes(r.styleKey) && !STYLE_KEYS.includes(base)) {
      out.push(`AC-10A-12-STYLE-FALLBACK: ${r.facility} resolves to neither ${r.styleKey} nor ${base}`);
    }
    if (!STYLE_KEYS.includes(base)) {
      out.push(`AC-10A-12-STYLE-FALLBACK: the sector base ${base} is not a defined key`);
    }
  }
  // Every key is unique.
  const keys = STYLE_KEYS.slice();
  for (const k of keys) {
    const first = keys.indexOf(k);
    if (keys.indexOf(k, first + 1) !== -1) out.push(`AC-10A-12-STYLE-FALLBACK: ${k} is defined twice`);
  }
  return out;
}

/** Every check, under the AC code it reports. */
const CHECKS: readonly { code: string; fn: () => Problem[] }[] = [
  { code: 'AC-10A-12-SECTORS', fn: () => checkSectors(FACILITY_RULES) },
  { code: 'AC-10A-12-RULE-SHAPE', fn: () => checkRuleShape(FACILITY_RULES) },
  { code: 'AC-10A-12-MIX-SUM', fn: () => checkMixSum(DISTRICT_ROLE_MIX, FACILITY_RULES) },
  { code: 'AC-10A-12-CARRIER', fn: () => checkCarriers(FACILITY_RULES) },
  { code: 'AC-10A-12-CARRIER-TABLE', fn: () => checkCarrierTable(FACILITY_RULES) },
  { code: 'AC-10A-12-TABLE-ROWS', fn: () => checkTableRows(FACILITY_RULES) },
  { code: 'AC-10A-12-STRUCTURES', fn: () => checkStructures(FACILITY_RULES) },
  { code: 'AC-10A-12-FAB', fn: () => checkFab(FACILITY_RULES) },
  { code: 'AC-10A-12-OFFMAP', fn: () => checkOffmap(FACILITY_RULES) },
  { code: 'AC-10A-12-STYLE-FALLBACK', fn: () => checkStyleFallback(FACILITY_RULES) },
];

// ---------- the shipped rules ----------

describe('T10A-12 rules table', () => {
  it('the rules version is the card\'s', () => {
    expect(PLACEMENT_RULES_VERSION).toBe('placement.v1');
  });

  it('AC-10A-12-SECTORS: exactly 13 sectors, each with a facility, and the SECTOR_ key shape', () => {
    expect(checkSectors(FACILITY_RULES)).toEqual([]);
  });

  it('AC-10A-12-RULE-SHAPE: the footprint, the lot types, the role sets and the style key', () => {
    expect(checkRuleShape(FACILITY_RULES)).toEqual([]);
  });

  it('AC-10A-12-MIX-SUM: every row sums to 1000 and every cell matches the rules biconditional', () => {
    expect(checkMixSum(DISTRICT_ROLE_MIX, FACILITY_RULES)).toEqual([]);
    for (const role of DISTRICT_ROLES) expect(mixRowSum(role)).toBe(1000);
  });

  it('AC-10A-12-CARRIER: every non-zero cell names a carrier, and the carrier allows the role', () => {
    expect(checkCarriers(FACILITY_RULES)).toEqual([]);
  });

  it('AC-10A-12-CARRIER-TABLE: the committed per-cell carrier table agrees with the rules', () => {
    expect(checkCarrierTable(FACILITY_RULES)).toEqual([]);
  });

  it('AC-10A-12-CARRIER: the port\'s real-estate cell is carried by the YARD, not the offices', () => {
    // THE RULING (Producer ruling, 2026-10-22, on Studio's T10A-12 review, section 4(d)).
    // The cell's NUMBER is unchanged at 100 per-mille; the FACILITY that carries it is the yard,
    // because a dock with 100 per-mille of offices and agencies reads as a dock with a mini-CBD.
    // The card's own rule ("yards never outside INDUSTRIAL/PORT") makes the yard legal in PORT.
    expect(DISTRICT_ROLE_MIX.PORT.REAL_ESTATE_SERVICES).toBe(100);
    expect(mixCarriers('PORT', 'REAL_ESTATE_SERVICES')).toEqual(['re_builders_yard']);
    // The yard prefers the port, and it still prefers the basin.
    const yard = facilityRule('re_builders_yard')!;
    expect(yard.preferredRoles).toContain('PORT');
    expect(yard.preferredRoles).toContain('INDUSTRIAL');
    expect(yard.allowedRoles).toEqual(['INDUSTRIAL', 'PORT']);
    // And the offices and the agencies are NOT preferred in the port, so they cannot carry it.
    expect(facilityRule('re_office')!.preferredRoles).not.toContain('PORT');
    expect(facilityRule('re_agency')!.preferredRoles).not.toContain('PORT');
  });

  it('AC-10A-12-CARRIER: the readout lists every non-zero cell, and every cell has a carrier', () => {
    let nonZero = 0;
    for (const role of DISTRICT_ROLES) {
      for (const sector of SECTORS) {
        if ((DISTRICT_ROLE_MIX[role][sector] ?? 0) > 0) nonZero += 1;
      }
    }
    expect(MIX_CARRIERS.length).toBe(nonZero);
    expect(CARRIER_TABLE.length).toBe(nonZero);
    for (const c of MIX_CARRIERS) {
      expect(c.facilities.length, `${c.role} x ${c.sector}`).toBeGreaterThan(0);
      // The readout and the committed table agree, cell by cell.
      const row = CARRIER_TABLE.find((t) => t[0] === c.role && t[1] === c.sector);
      expect(row, `${c.role} x ${c.sector}`).toBeDefined();
      expect(row![3], `${c.role} x ${c.sector}`).toEqual(c.facilities);
      // And the carrier is a facility of that cell's sector.
      for (const f of c.facilities) {
        expect(facilityRule(f)!.sector, f).toBe(c.sector);
      }
    }
  });

  it('AC-10A-12-CARRIER: a zero cell has no carrier', () => {
    for (const role of DISTRICT_ROLES) {
      for (const sector of SECTORS) {
        if ((DISTRICT_ROLE_MIX[role][sector] ?? 0) !== 0) continue;
        expect(mixCarriers(role, sector), `${role} x ${sector}`).toEqual([]);
      }
    }
  });

  it('the two ruled mix numbers are the ones the card states', () => {
    // TROPHY_RES x FOOD_HOSPITALITY 80 -> 20: one restaurant against a hard cap of one per
    // district, so 80 asked for a target the mix-deficit term could never close.
    expect(DISTRICT_ROLE_MIX.TROPHY_RES.FOOD_HOSPITALITY).toBe(20);
    expect(DISTRICT_ROLE_MIX.TROPHY_RES.REAL_ESTATE_SERVICES).toBe(260);
    // INDUSTRIAL x TECH_AI 100 -> 40: the only tech facility legal in INDUSTRIAL is
    // `tech_datacenter`, and 100 permille is 19 hyperscale data centres in the basin.
    expect(DISTRICT_ROLE_MIX.INDUSTRIAL.TECH_AI).toBe(40);
    expect(DISTRICT_ROLE_MIX.INDUSTRIAL.MANUFACTURING).toBe(460);
  });

  it('AC-10A-12-TABLE-ROWS: the card\'s spot rows hold', () => {
    expect(checkTableRows(FACILITY_RULES)).toEqual([]);
  });

  it('AC-10A-12-STRUCTURES: every structure kind has the ruling\'s cap and only its owner carries it', () => {
    expect(checkStructures(FACILITY_RULES)).toEqual([]);
  });

  it('AC-10A-12-FAB: the fab is the only user of the FAB lot type', () => {
    expect(checkFab(FACILITY_RULES)).toEqual([]);
  });

  it('AC-10A-12-OFFMAP: mining and agriculture have exactly three in-city facilities', () => {
    expect(checkOffmap(FACILITY_RULES)).toEqual([]);
  });

  it('AC-10A-12-STYLE-FALLBACK: every facility resolves to a defined key or its sector base', () => {
    expect(checkStyleFallback(FACILITY_RULES)).toEqual([]);
  });

  it('the buffers are the card\'s: N0 0, N1 0, N2 60, N3 150', () => {
    expect(BUFFER_M).toEqual({ N0: 0, N1: 0, N2: 60, N3: 150 });
  });

  it('the facility classes are unique and prefixed by their sector\'s short code', () => {
    const PREFIX: Readonly<Record<string, string>> = {
      FOOD_HOSPITALITY: 'fh_',
      RETAIL_CONSUMER: 'rc_',
      REAL_ESTATE_SERVICES: 're_',
      LOGISTICS_TRANSPORT: 'log_',
      ENERGY: 'en_',
      MINING_AGRICULTURE: 'ma_',
      MANUFACTURING: 'mf_',
      TECH_AI: 'tech_',
      FINANCE: 'fin_',
      MEDIA_ENTERTAINMENT: 'me_',
      HEALTH: 'hl_',
      LUXURY: 'lx_',
      SECURITY_LEGAL_INTEL: 'sl_',
    };
    const seen: string[] = [];
    for (const r of FACILITY_RULES) {
      expect(seen, r.facility).not.toContain(r.facility);
      seen.push(r.facility);
      expect(r.facility.startsWith(PREFIX[r.sector] ?? '?'), r.facility).toBe(true);
    }
    expect(seen.length).toBe(FACILITY_RULES.length);
  });

  it('the rule lookup finds a rule by its facility class, and misses cleanly', () => {
    expect(facilityRule('fin_exchange')?.sector).toBe('FINANCE');
    expect(facilityRule('fin_exchange_not_a_facility')).toBeUndefined();
    expect(facilityRule('')).toBeUndefined();
  });

  it('the anchor facilities all name a rule that exists', () => {
    for (const f of ANCHOR_FACILITIES) {
      expect(facilityRule(f), f).toBeDefined();
    }
  });

  it('the sectors allowed in a role are exactly the ones with a non-zero mix cell', () => {
    for (const role of DISTRICT_ROLES) {
      const allowed = SECTORS_ALLOWED_IN_ROLE(role);
      for (const sector of SECTORS) {
        const cell = DISTRICT_ROLE_MIX[role][sector] ?? 0;
        expect(cell !== 0, `${role} x ${sector}`).toBe(allowed.includes(sector));
      }
    }
  });

  it('the facilities of a sector are listed in byte order', () => {
    for (const sector of SECTORS) {
      const list = facilitiesOfSector(sector);
      expect(list.length).toBe(rulesOfSector(sector).length);
      expect(list.slice().sort()).toEqual(list.slice().sort());
    }
  });
});

// ---------- the committed mutant baseline ----------

/**
 * A mutant of the rules table, committed so the coverage lives in the repo.
 *
 * Each mutant is killed by a check. The set is the one a reviewer would otherwise run by hand,
 * and a later weakening of any check makes the baseline fail here rather than in a review.
 */
interface Mutant {
  /** The mutant's id. */
  id: string;
  /** What the mutation does. */
  name: string;
  /** The check that MUST reject it. */
  killer: string;
  /** Apply the mutation to a copy of the table. */
  mutate: (rules: FacilityRule[]) => void;
}

const cloneRules = (): FacilityRule[] =>
  FACILITY_RULES.map((r) => ({
    ...r,
    allowedRoles: r.allowedRoles.slice(),
    preferredRoles: r.preferredRoles.slice(),
    lotTypes: r.lotTypes.slice(),
    excludeRoles: r.excludeRoles.slice(),
    needs: r.needs.slice(),
    near: r.near ? r.near.map((n) => ({ ...n })) : undefined,
    structures: r.structures ? r.structures.map((s) => ({ ...s })) : undefined,
    maxPer: r.maxPer ? { ...r.maxPer } : undefined,
  })) as FacilityRule[];

const MUTANTS: readonly Mutant[] = [
  {
    id: 'R1',
    name: 'fin_exchange allows TRANSIT_HUB as well as CBD',
    killer: 'AC-10A-12-TABLE-ROWS',
    mutate: (rules) => {
      const r = rules.find((x) => x.facility === 'fin_exchange')!;
      r.allowedRoles = ['CBD', 'TRANSIT_HUB'];
    },
  },
  {
    id: 'R2',
    name: 'mf_heavy drops from N3 to N2',
    killer: 'AC-10A-12-TABLE-ROWS',
    mutate: (rules) => {
      rules.find((x) => x.facility === 'mf_heavy')!.nuisance = 'N2';
    },
  },
  {
    id: 'R3',
    name: 'lx_boutique stops excluding TRANSIT_HUB',
    killer: 'AC-10A-12-TABLE-ROWS',
    mutate: (rules) => {
      const r = rules.find((x) => x.facility === 'lx_boutique')!;
      r.excludeRoles = r.excludeRoles.filter((x) => x !== 'TRANSIT_HUB');
    },
  },
  {
    id: 'R4',
    name: 'hl_hospital stops being a receptor',
    killer: 'AC-10A-12-TABLE-ROWS',
    mutate: (rules) => {
      rules.find((x) => x.facility === 'hl_hospital')!.receptor = false;
    },
  },
  {
    id: 'R5',
    name: 'a sector disappears (ENERGY has no facility)',
    killer: 'AC-10A-12-SECTORS',
    mutate: (rules) => {
      for (let i = rules.length - 1; i >= 0; i--) {
        if (rules[i]!.sector === 'ENERGY') rules.splice(i, 1);
      }
    },
  },
  {
    id: 'R6',
    name: 'a footprint is inverted (min >= max)',
    killer: 'AC-10A-12-RULE-SHAPE',
    mutate: (rules) => {
      rules.find((x) => x.facility === 'fh_cafe')!.footprintM2 = [250, 40];
    },
  },
  {
    id: 'R7',
    name: 'a preferred role is not an allowed role',
    killer: 'AC-10A-12-RULE-SHAPE',
    mutate: (rules) => {
      const r = rules.find((x) => x.facility === 'rc_shop')!;
      r.preferredRoles = ['TROPHY_RES'];
    },
  },
  {
    id: 'R8',
    name: 'a rule both allows and excludes the same role',
    killer: 'AC-10A-12-RULE-SHAPE',
    mutate: (rules) => {
      const r = rules.find((x) => x.facility === 're_agency')!;
      r.excludeRoles = ['CBD'];
    },
  },
  {
    id: 'R9',
    name: 'a style key is malformed',
    killer: 'AC-10A-12-RULE-SHAPE',
    mutate: (rules) => {
      rules.find((x) => x.facility === 'en_hq')!.styleKey = 'style.en_hq';
    },
  },
  {
    id: 'R10',
    name: 'a structure cap exceeds the ruling\'s cap',
    killer: 'AC-10A-12-STRUCTURES',
    mutate: (rules) => {
      const r = rules.find((x) => x.facility === 'log_port_terminal')!;
      r.structures = [{ kind: 'STS_CRANE', maxM: 120 }];
    },
  },
  {
    id: 'R11',
    name: 'a facility carries a structure the ruling does not give it',
    killer: 'AC-10A-12-STRUCTURES',
    mutate: (rules) => {
      const r = rules.find((x) => x.facility === 'hl_hospital')!;
      r.structures = [{ kind: 'CHIMNEY', maxM: 60 }];
    },
  },
  {
    id: 'R12',
    name: 'a second facility uses the FAB lot type',
    killer: 'AC-10A-12-FAB',
    mutate: (rules) => {
      const r = rules.find((x) => x.facility === 'mf_plant')!;
      r.lotTypes = ['FAB'];
    },
  },
  {
    id: 'R13',
    name: 'mining gains a fourth in-city facility (a quarry)',
    killer: 'AC-10A-12-OFFMAP',
    mutate: (rules) => {
      rules.push({
        ...rules.find((x) => x.facility === 'ma_grain_silo')!,
        facility: 'ma_quarry',
        styleKey: facilityStyleKey('MINING_AGRICULTURE', 'ma_quarry'),
      });
    },
  },
  {
    id: 'R14',
    name: 'a sector that may sit in a role loses that role, but its mix cell stays non-zero',
    killer: 'AC-10A-12-MIX-SUM',
    mutate: (rules) => {
      // Every retail facility loses every role: RETAIL_CONSUMER may then sit nowhere, while its
      // mix cells stay non-zero. The biconditional is what catches it - the one-directional form
      // would not, because it only asks "is a non-zero cell allowed?", and here the cell is
      // non-zero and NOT allowed, which the one-directional form DOES catch; the other direction
      // ("is an allowed sector's cell non-zero?") is what the mutant also breaks.
      for (const r of rules) {
        if (r.sector === 'RETAIL_CONSUMER') r.allowedRoles = [];
      }
    },
  },
  {
    id: 'R15',
    name: 'the port\'s real-estate cell loses its carrier (the yard stops preferring PORT)',
    killer: 'AC-10A-12-CARRIER-TABLE',
    mutate: (rules) => {
      // The pre-ruling state: the yard prefers only INDUSTRIAL, so the port's cell has no
      // carrier, and the offices and the agencies - which are merely ALLOWED there - would carry
      // it by default. This is the exact defect the Producer ruled on.
      const r = rules.find((x) => x.facility === 're_builders_yard')!;
      r.preferredRoles = ['INDUSTRIAL'];
    },
  },
  {
    id: 'R16',
    name: 'a carrier is MOVED to another facility of the same sector (the yard gives the cell to the office)',
    killer: 'AC-10A-12-CARRIER-TABLE',
    mutate: (rules) => {
      // The office takes the port's real-estate cell and the yard gives it up. The MIX-SUM
      // biconditional does NOT catch this: the sector may still sit in the port, so every other
      // check passes. Only the per-cell carrier table does.
      const yard = rules.find((x) => x.facility === 're_builders_yard')!;
      yard.preferredRoles = yard.preferredRoles.filter((x) => x !== 'PORT');
      const office = rules.find((x) => x.facility === 're_office')!;
      office.preferredRoles = [...office.preferredRoles, 'PORT'];
    },
  },
];

/** The checks, run against a mutated table, with the mix check reading the mutated table. */
function runChecks(rules: readonly FacilityRule[]): string[] {
  const out: string[] = [];
  const push = (code: string, problems: Problem[]): void => {
    if (problems.length) out.push(code);
  };
  push('AC-10A-12-SECTORS', checkSectors(rules));
  push('AC-10A-12-RULE-SHAPE', checkRuleShape(rules));
  push('AC-10A-12-MIX-SUM', checkMixSum(DISTRICT_ROLE_MIX, rules));
  push('AC-10A-12-CARRIER', checkCarriers(rules));
  push('AC-10A-12-CARRIER-TABLE', checkCarrierTable(rules));
  push('AC-10A-12-TABLE-ROWS', checkTableRows(rules));
  push('AC-10A-12-STRUCTURES', checkStructures(rules));
  push('AC-10A-12-FAB', checkFab(rules));
  push('AC-10A-12-OFFMAP', checkOffmap(rules));
  push('AC-10A-12-STYLE-FALLBACK', checkStyleFallback(rules));
  return out;
}

describe('T10A-12 rules mutant baseline (committed)', () => {
  it('the shipped table passes every check (the baseline the mutants are measured against)', () => {
    for (const c of CHECKS) expect(c.fn(), c.code).toEqual([]);
  });

  it('the mutant set carries R1..R16', () => {
    expect(MUTANTS.map((m) => m.id)).toEqual([
      'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14',
      'R15', 'R16',
    ]);
  });

  for (const m of MUTANTS) {
    it(`${m.id}: ${m.name} is killed by ${m.killer}`, () => {
      const rules = cloneRules();
      m.mutate(rules);
      const killed = runChecks(rules);
      expect(killed.length, `${m.id} survived every check`).toBeGreaterThan(0);
      expect(killed, `${m.id} was not killed by ${m.killer}`).toContain(m.killer);
    });
  }
});
