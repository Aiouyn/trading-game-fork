// T10A-12 (city placement): the sector rules table as data (card unit U1).
//
// The card's "Sector rules (rules.ts content, placement.v1)" table, one row per facility.
// Everything here is STATIC CONTENT (card "State model" 1): it is versioned by
// PLACEMENT_RULES_VERSION and never re-derived from a seed.
//
// Placement is LEGIBILITY, NOT ECONOMICS: nothing in this file is a price, a value or a yield.
// The per-mille mix below is a readability target (DECISION D-10A-12-MIX, Quant decision 1):
// it says what a city block should LOOK like, and it is not calibrated to employment, output,
// land value or demand.

import { cmpStr, sortBy } from '@tycoon/engine-core/order';
import type {
  BizSector,
  DensityBand,
  DistrictRole,
  FacilityRule,
  Nuisance,
} from './types';
import { DISTRICT_ROLES, SECTORS } from './types';

/** The rules version. A change to the rules bumps it (card "State model" 1). */
export const PLACEMENT_RULES_VERSION = 'placement.v1';

/**
 * The nuisance buffer of each class, in metres, from the receptor's edge to the facility's edge.
 * N0 0; N1 may share a block with receptors but never a building; N2 >= 60 m; N3 >= 150 m.
 */
export const BUFFER_M: Readonly<Record<Nuisance, number>> = {
  N0: 0,
  N1: 0,
  N2: 60,
  N3: 150,
};

/**
 * The structure caps, in metres (Systems ruling 1). Structures are exempt from `maxHeightM` but
 * capped here: they carry no floor area, no FAR, no `heightLevel`, no value and no crown title.
 */
export const STRUCTURE_CAP_M: Readonly<Record<string, number>> = {
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

// ---------- the style keys (Studio decision 1) ----------

/**
 * The sector base key a facility key inherits from: `style.sector.<sector lowercase>`.
 * A missing facility key falls back to this (AC-10A-12-STYLE-FALLBACK).
 */
export const sectorStyleKey = (sector: BizSector): string => `style.sector.${sector.toLowerCase()}`;

/** The facility style key: `style.sector.<sector lowercase>.<facility>`. */
export const facilityStyleKey = (sector: BizSector, facility: string): string =>
  `${sectorStyleKey(sector)}.${facility}`;

// ---------- the sector rules table ----------

/**
 * The table, one row per facility class. The card's table columns are: sector, facility classes
 * (lot types, footprint m2), preferred roles, allowed roles, hard exclusions, adjacency and
 * buffers, and the nuisance class (the last column of the card's table).
 *
 * Reading of the card's shorthand, so the table is unambiguous:
 *   - "allowed roles" that the card writes as "+ MIXED_RIVER, PRIME_RES (cafes, restaurants)" is
 *     a per-facility refinement, not a role-wide one: only `fh_cafe` and `fh_restaurant` gain
 *     MIXED_RIVER and PRIME_RES, and only `fh_hotel` and `fh_food_hall` do not. The table below
 *     is per facility, so it says exactly that.
 *   - "INDUSTRIAL edge (big box only)" means `rc_big_box` may sit in INDUSTRIAL, and
 *     `rc_supermarket` may not.
 *   - "any except as excluded" means every role the sector's facilities name, minus the
 *     exclusions; the per-facility rows say which.
 *   - the card's "receptors" are RES parcels, `hl_hospital` and CIVIC parcels tagged school.
 */
export const FACILITY_RULES: readonly FacilityRule[] = [
  // ---------- FOOD_HOSPITALITY ----------
  {
    facility: 'fh_cafe',
    sector: 'FOOD_HOSPITALITY',
    allowedRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES'],
    preferredRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [40, 250],
    nuisance: 'N0',
    needs: [],
    near: [{ facility: 'MAIN_AVENUE', maxM: 400 }],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('FOOD_HOSPITALITY', 'fh_cafe'),
    densityBand: 'LOW',
  },
  {
    facility: 'fh_restaurant',
    sector: 'FOOD_HOSPITALITY',
    allowedRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES'],
    preferredRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [120, 600],
    nuisance: 'N0',
    needs: [],
    near: [{ facility: 'MAIN_AVENUE', maxM: 400 }],
    excludeRoles: ['PORT', 'INDUSTRIAL'],
    receptor: false,
    // "nothing in TROPHY_RES except one fh_restaurant per district"
    maxPer: { perDistrictRole: { TROPHY_RES: 1 } },
    styleKey: facilityStyleKey('FOOD_HOSPITALITY', 'fh_restaurant'),
    densityBand: 'LOW',
  },
  {
    facility: 'fh_hotel',
    sector: 'FOOD_HOSPITALITY',
    allowedRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB'],
    preferredRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB'],
    lotTypes: ['HIGHRISE', 'MIDRISE'],
    footprintM2: [1500, 8000],
    nuisance: 'N0',
    needs: [],
    // "hotels <= 400 m from STATION or WATERFRONT"
    needsAny: [{ need: 'TRANSIT_400M' }, { need: 'WATERFRONT' }],
    excludeRoles: ['INDUSTRIAL', 'PORT', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('FOOD_HOSPITALITY', 'fh_hotel'),
    densityBand: 'HIGH',
  },
  {
    facility: 'fh_food_hall',
    sector: 'FOOD_HOSPITALITY',
    allowedRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB'],
    preferredRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB'],
    lotTypes: ['MIDRISE'],
    footprintM2: [800, 3000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['INDUSTRIAL', 'PORT', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('FOOD_HOSPITALITY', 'fh_food_hall'),
    densityBand: 'MID',
  },

  // ---------- RETAIL_CONSUMER ----------
  {
    facility: 'rc_shop',
    sector: 'RETAIL_CONSUMER',
    allowedRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES'],
    preferredRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [30, 400],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['CBD', 'PORT', 'INDUSTRIAL', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('RETAIL_CONSUMER', 'rc_shop'),
    densityBand: 'LOW',
  },
  {
    facility: 'rc_supermarket',
    sector: 'RETAIL_CONSUMER',
    // "+ PRIME_RES (shops)": the card adds PRIME_RES for the SHOPS only, so the supermarket
    // does not follow them there.
    allowedRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER'],
    preferredRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER'],
    lotTypes: ['MIDRISE'],
    footprintM2: [1500, 5000],
    nuisance: 'N0',
    needs: [],
    // "supermarket <= 800 m from RES_LOAD centroid"
    near: [{ facility: 'RES_LOAD', maxM: 800 }],
    excludeRoles: ['CBD', 'PORT', 'INDUSTRIAL', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('RETAIL_CONSUMER', 'rc_supermarket'),
    densityBand: 'MID',
  },
  {
    facility: 'rc_big_box',
    sector: 'RETAIL_CONSUMER',
    allowedRoles: ['INDUSTRIAL'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['WAREHOUSE'],
    footprintM2: [6000, 20000],
    nuisance: 'N1',
    // "big box needs ARTERIAL"
    needs: ['ARTERIAL'],
    excludeRoles: ['CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES', 'PORT'],
    receptor: false,
    styleKey: facilityStyleKey('RETAIL_CONSUMER', 'rc_big_box'),
    densityBand: 'LOW',
  },

  // ---------- REAL_ESTATE_SERVICES ----------
  {
    facility: 're_agency',
    sector: 'REAL_ESTATE_SERVICES',
    allowedRoles: [
      'MIXED_CORE', 'CBD', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES',
      'INDUSTRIAL', 'PORT', 'TROPHY_RES',
    ],
    preferredRoles: ['MIXED_CORE', 'CBD'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [40, 200],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [],
    receptor: false,
    styleKey: facilityStyleKey('REAL_ESTATE_SERVICES', 're_agency'),
    densityBand: 'LOW',
  },
  {
    facility: 're_office',
    sector: 'REAL_ESTATE_SERVICES',
    allowedRoles: [
      'MIXED_CORE', 'CBD', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES',
      'INDUSTRIAL', 'PORT', 'TROPHY_RES',
    ],
    preferredRoles: ['MIXED_CORE', 'CBD'],
    lotTypes: ['OFFICE_TOWER', 'MIDRISE'],
    footprintM2: [400, 3000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [],
    receptor: false,
    styleKey: facilityStyleKey('REAL_ESTATE_SERVICES', 're_office'),
    densityBand: 'MID',
  },
  {
    facility: 're_builders_yard',
    sector: 'REAL_ESTATE_SERVICES',
    allowedRoles: ['INDUSTRIAL', 'PORT'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['WAREHOUSE'],
    footprintM2: [2000, 10000],
    nuisance: 'N2',
    // "yard needs ARTERIAL"
    needs: ['ARTERIAL'],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('REAL_ESTATE_SERVICES', 're_builders_yard'),
    densityBand: 'LOW',
  },

  // ---------- LOGISTICS_TRANSPORT ----------
  {
    facility: 'log_port_terminal',
    sector: 'LOGISTICS_TRANSPORT',
    allowedRoles: ['PORT'],
    preferredRoles: ['PORT'],
    lotTypes: ['PORT_YARD'],
    footprintM2: [20000, 120000],
    nuisance: 'N3',
    // "terminal only in PORT with WATERFRONT"
    needs: ['WATERFRONT'],
    structures: [
      { kind: 'STS_CRANE', maxM: 80 },
      { kind: 'RTG_GANTRY', maxM: 30 },
    ],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'INDUSTRIAL', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('LOGISTICS_TRANSPORT', 'log_port_terminal'),
    densityBand: 'LOW',
  },
  {
    facility: 'log_warehouse',
    sector: 'LOGISTICS_TRANSPORT',
    allowedRoles: ['PORT', 'INDUSTRIAL'],
    preferredRoles: ['PORT', 'INDUSTRIAL'],
    lotTypes: ['WAREHOUSE'],
    footprintM2: [4000, 40000],
    nuisance: 'N2',
    needs: [],
    // "warehouse <= 800 m from PORT_EDGE or needs RAIL"
    needsAny: [{ need: 'RAIL' }, { near: 'PORT_EDGE', maxM: 800 }],
    near: [{ facility: 'PORT_EDGE', maxM: 800 }],
    excludeRoles: ['CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('LOGISTICS_TRANSPORT', 'log_warehouse'),
    densityBand: 'LOW',
  },
  {
    facility: 'log_depot',
    sector: 'LOGISTICS_TRANSPORT',
    allowedRoles: ['PORT', 'INDUSTRIAL', 'TRANSIT_HUB', 'MIXED_RIVER'],
    preferredRoles: ['PORT', 'INDUSTRIAL'],
    lotTypes: ['WAREHOUSE'],
    footprintM2: [800, 4000],
    nuisance: 'N1',
    needs: [],
    excludeRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('LOGISTICS_TRANSPORT', 'log_depot'),
    densityBand: 'LOW',
  },
  {
    facility: 'log_courier_hub',
    sector: 'LOGISTICS_TRANSPORT',
    allowedRoles: ['PORT', 'INDUSTRIAL', 'TRANSIT_HUB', 'MIXED_RIVER'],
    preferredRoles: ['TRANSIT_HUB', 'MIXED_RIVER'],
    lotTypes: ['SHOPFRONT', 'ROW'],
    footprintM2: [100, 600],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('LOGISTICS_TRANSPORT', 'log_courier_hub'),
    densityBand: 'LOW',
  },

  // ---------- ENERGY ----------
  {
    facility: 'en_hq',
    sector: 'ENERGY',
    allowedRoles: ['CBD'],
    preferredRoles: ['CBD'],
    lotTypes: ['CBD_TOWER', 'OFFICE_TOWER'],
    footprintM2: [1500, 6000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [
      'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('ENERGY', 'en_hq'),
    densityBand: 'TOWER',
  },
  {
    facility: 'en_tank_farm',
    sector: 'ENERGY',
    allowedRoles: ['PORT'],
    preferredRoles: ['PORT'],
    lotTypes: ['PORT_YARD'],
    footprintM2: [15000, 60000],
    nuisance: 'N3',
    // "tanks need WATERFRONT"
    needs: ['WATERFRONT'],
    structures: [
      { kind: 'TANK', maxM: 25 },
      { kind: 'FLARE', maxM: 60 },
    ],
    excludeRoles: [
      'CBD', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('ENERGY', 'en_tank_farm'),
    densityBand: 'LOW',
  },
  {
    facility: 'en_plant',
    sector: 'ENERGY',
    allowedRoles: ['INDUSTRIAL'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['UTILITY_SITE'],
    footprintM2: [10000, 50000],
    nuisance: 'N3',
    needs: [],
    structures: [
      { kind: 'STACK', maxM: 120 },
      { kind: 'COOLING_TOWER', maxM: 90 },
    ],
    excludeRoles: [
      'CBD', 'PORT', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('ENERGY', 'en_plant'),
    densityBand: 'LOW',
  },
  {
    facility: 'en_substation',
    sector: 'ENERGY',
    allowedRoles: [
      'CBD', 'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES',
    ],
    preferredRoles: ['INDUSTRIAL', 'TRANSIT_HUB'],
    lotTypes: ['UTILITY_SITE'],
    footprintM2: [400, 2500],
    nuisance: 'N1',
    needs: [],
    // "substation <= 600 m from the RES_LOAD centroid it serves"
    near: [{ facility: 'RES_LOAD', maxM: 600 }],
    excludeRoles: ['TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('ENERGY', 'en_substation'),
    densityBand: 'LOW',
  },

  // ---------- MINING_AGRICULTURE (off-map: Systems ruling 7) ----------
  {
    facility: 'ma_trading_office',
    sector: 'MINING_AGRICULTURE',
    allowedRoles: ['CBD'],
    preferredRoles: ['CBD'],
    lotTypes: ['OFFICE_TOWER'],
    footprintM2: [400, 3000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [
      'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MINING_AGRICULTURE', 'ma_trading_office'),
    densityBand: 'MID',
  },
  {
    facility: 'ma_bulk_terminal',
    sector: 'MINING_AGRICULTURE',
    allowedRoles: ['PORT'],
    preferredRoles: ['PORT'],
    lotTypes: ['PORT_YARD'],
    footprintM2: [15000, 80000],
    nuisance: 'N3',
    // "terminal needs WATERFRONT + RAIL or ARTERIAL"
    needs: ['WATERFRONT'],
    needsAny: [{ need: 'RAIL' }, { need: 'ARTERIAL' }],
    structures: [{ kind: 'SHIP_LOADER', maxM: 50 }],
    excludeRoles: [
      'CBD', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MINING_AGRICULTURE', 'ma_bulk_terminal'),
    densityBand: 'LOW',
  },
  {
    facility: 'ma_grain_silo',
    sector: 'MINING_AGRICULTURE',
    allowedRoles: ['PORT', 'INDUSTRIAL'],
    preferredRoles: ['PORT'],
    lotTypes: ['PLANT'],
    footprintM2: [3000, 15000],
    nuisance: 'N2',
    needs: [],
    structures: [{ kind: 'SILO', maxM: 55 }],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MINING_AGRICULTURE', 'ma_grain_silo'),
    densityBand: 'LOW',
  },

  // ---------- MANUFACTURING ----------
  {
    facility: 'mf_light',
    sector: 'MANUFACTURING',
    allowedRoles: ['INDUSTRIAL', 'MIXED_RIVER'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['WAREHOUSE', 'ROW'],
    footprintM2: [600, 5000],
    nuisance: 'N1',
    needs: [],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MANUFACTURING', 'mf_light'),
    densityBand: 'LOW',
  },
  {
    facility: 'mf_plant',
    sector: 'MANUFACTURING',
    allowedRoles: ['INDUSTRIAL'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['PLANT'],
    footprintM2: [5000, 40000],
    nuisance: 'N2',
    needs: [],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MANUFACTURING', 'mf_plant'),
    densityBand: 'LOW',
  },
  {
    facility: 'mf_heavy',
    sector: 'MANUFACTURING',
    allowedRoles: ['INDUSTRIAL', 'PORT'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['PLANT'],
    footprintM2: [20000, 100000],
    nuisance: 'N3',
    needs: [],
    // "heavy <= 1,200 m from PORT_EDGE or RAIL"
    near: [{ facility: 'PORT_EDGE', maxM: 1200 }],
    needsAny: [{ need: 'RAIL' }, { near: 'PORT_EDGE', maxM: 1200 }],
    structures: [{ kind: 'CHIMNEY', maxM: 60 }],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MANUFACTURING', 'mf_heavy'),
    densityBand: 'LOW',
  },
  {
    facility: 'mf_chip_fab',
    sector: 'MANUFACTURING',
    allowedRoles: ['INDUSTRIAL'],
    preferredRoles: ['INDUSTRIAL'],
    // Systems ruling 2: a fab is placed only on a FAB lot, and a FAB lot occurs only in an
    // INDUSTRIAL role with grid capacity.
    lotTypes: ['FAB'],
    footprintM2: [30000, 120000],
    nuisance: 'N2',
    // "fab needs GRID_MW"
    needs: ['GRID_MW'],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES', 'PORT',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MANUFACTURING', 'mf_chip_fab'),
    densityBand: 'LOW',
  },

  // ---------- TECH_AI ----------
  {
    facility: 'tech_office',
    sector: 'TECH_AI',
    allowedRoles: ['PRIME_RES', 'MIXED_RIVER', 'CBD', 'TRANSIT_HUB'],
    preferredRoles: ['PRIME_RES', 'MIXED_RIVER', 'CBD'],
    lotTypes: ['OFFICE_TOWER', 'MIDRISE'],
    footprintM2: [500, 6000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'MIXED_CORE', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('TECH_AI', 'tech_office'),
    densityBand: 'MID',
  },
  {
    facility: 'tech_campus',
    sector: 'TECH_AI',
    allowedRoles: ['PRIME_RES', 'MIXED_RIVER', 'CBD'],
    preferredRoles: ['PRIME_RES'],
    lotTypes: ['CAMPUS'],
    footprintM2: [8000, 40000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'MIXED_CORE', 'TRANSIT_HUB', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('TECH_AI', 'tech_campus'),
    densityBand: 'LOW',
  },
  {
    facility: 'tech_datacenter',
    sector: 'TECH_AI',
    allowedRoles: ['INDUSTRIAL'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['DC_SITE'],
    footprintM2: [5000, 40000],
    nuisance: 'N1',
    // "data center needs GRID_MW and <= 800 m from an en_substation"
    needs: ['GRID_MW'],
    near: [{ facility: 'en_substation', maxM: 800 }],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES', 'PORT',
    ],
    receptor: false,
    styleKey: facilityStyleKey('TECH_AI', 'tech_datacenter'),
    densityBand: 'LOW',
  },

  // ---------- FINANCE ----------
  {
    facility: 'fin_exchange',
    sector: 'FINANCE',
    allowedRoles: ['CBD'],
    preferredRoles: ['CBD'],
    lotTypes: ['CBD_TOWER'],
    footprintM2: [3000, 10000],
    nuisance: 'N0',
    needs: [],
    // "exchange <= 300 m from the CBD's V peak" - a bare distance, so a PULL (the card's `near`),
    // not a hard exclusion.
    near: [{ facility: 'CBD_PEAK', maxM: 300 }],
    excludeRoles: [
      'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    // "at most 1 exchange per city"
    maxPer: { perCity: 1 },
    styleKey: facilityStyleKey('FINANCE', 'fin_exchange'),
    densityBand: 'TOWER',
  },
  {
    facility: 'fin_tower',
    sector: 'FINANCE',
    allowedRoles: ['CBD', 'TRANSIT_HUB'],
    preferredRoles: ['CBD'],
    lotTypes: ['CBD_TOWER', 'OFFICE_TOWER'],
    footprintM2: [2000, 8000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [
      'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('FINANCE', 'fin_tower'),
    densityBand: 'TOWER',
  },
  {
    facility: 'fin_branch',
    sector: 'FINANCE',
    allowedRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES'],
    preferredRoles: ['MIXED_CORE', 'TRANSIT_HUB'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [80, 400],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['CBD', 'PORT', 'INDUSTRIAL', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('FINANCE', 'fin_branch'),
    densityBand: 'LOW',
  },

  // ---------- MEDIA_ENTERTAINMENT ----------
  {
    facility: 'me_broadcaster',
    sector: 'MEDIA_ENTERTAINMENT',
    allowedRoles: ['CBD'],
    preferredRoles: ['CBD'],
    lotTypes: ['OFFICE_TOWER'],
    footprintM2: [1500, 6000],
    nuisance: 'N0',
    needs: [],
    structures: [{ kind: 'MAST', maxM: 120 }],
    excludeRoles: [
      'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MEDIA_ENTERTAINMENT', 'me_broadcaster'),
    densityBand: 'MID',
  },
  {
    facility: 'me_studio',
    sector: 'MEDIA_ENTERTAINMENT',
    allowedRoles: ['MIXED_RIVER', 'INDUSTRIAL'],
    preferredRoles: ['MIXED_RIVER'],
    lotTypes: ['WAREHOUSE'],
    footprintM2: [2000, 15000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MEDIA_ENTERTAINMENT', 'me_studio'),
    densityBand: 'LOW',
  },
  {
    facility: 'me_venue',
    sector: 'MEDIA_ENTERTAINMENT',
    allowedRoles: ['TRANSIT_HUB', 'MIXED_CORE'],
    preferredRoles: ['TRANSIT_HUB'],
    lotTypes: ['MIDRISE', 'CAMPUS'],
    footprintM2: [2000, 20000],
    nuisance: 'N1',
    needs: [],
    // "venue <= 400 m from STATION"
    near: [{ facility: 'STATION', maxM: 400 }],
    excludeRoles: [
      'CBD', 'PORT', 'INDUSTRIAL', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MEDIA_ENTERTAINMENT', 'me_venue'),
    densityBand: 'MID',
  },

  // ---------- HEALTH ----------
  {
    facility: 'hl_hospital',
    sector: 'HEALTH',
    allowedRoles: ['TRANSIT_HUB', 'MIXED_CORE'],
    preferredRoles: ['TRANSIT_HUB', 'MIXED_CORE'],
    lotTypes: ['CAMPUS'],
    footprintM2: [15000, 60000],
    nuisance: 'N0',
    // "hospital <= 1,500 m from RES_LOAD centroid and needs ARTERIAL"
    needs: ['ARTERIAL'],
    near: [{ facility: 'RES_LOAD', maxM: 1500 }],
    excludeRoles: [
      'CBD', 'PORT', 'INDUSTRIAL', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES',
    ],
    // "hospital is a receptor (buffers apply to it)"
    receptor: true,
    styleKey: facilityStyleKey('HEALTH', 'hl_hospital'),
    densityBand: 'LOW',
  },
  {
    facility: 'hl_clinic',
    sector: 'HEALTH',
    allowedRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    preferredRoles: ['MIXED_CORE', 'TRANSIT_HUB'],
    lotTypes: ['SHOPFRONT', 'ROW'],
    footprintM2: [150, 1500],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['PORT', 'INDUSTRIAL'],
    receptor: false,
    styleKey: facilityStyleKey('HEALTH', 'hl_clinic'),
    densityBand: 'LOW',
  },
  {
    facility: 'hl_lab',
    sector: 'HEALTH',
    allowedRoles: ['PRIME_RES', 'MIXED_RIVER', 'CBD', 'TRANSIT_HUB'],
    preferredRoles: ['PRIME_RES'],
    lotTypes: ['MIDRISE', 'CAMPUS'],
    footprintM2: [1500, 10000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'MIXED_CORE', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('HEALTH', 'hl_lab'),
    densityBand: 'MID',
  },

  // ---------- LUXURY ----------
  {
    facility: 'lx_boutique',
    sector: 'LUXURY',
    allowedRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES', 'MIXED_CORE'],
    preferredRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [60, 600],
    nuisance: 'N0',
    needs: [],
    // "boutique needs MAIN_AVENUE or WATERFRONT"
    needsAny: [{ need: 'MAIN_AVENUE' }, { need: 'WATERFRONT' }],
    excludeRoles: ['INDUSTRIAL', 'PORT', 'TRANSIT_HUB', 'MIXED_RIVER'],
    receptor: false,
    styleKey: facilityStyleKey('LUXURY', 'lx_boutique'),
    densityBand: 'LOW',
  },
  {
    facility: 'lx_flagship',
    sector: 'LUXURY',
    allowedRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES', 'MIXED_CORE'],
    preferredRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES'],
    lotTypes: ['MIDRISE'],
    footprintM2: [600, 3000],
    nuisance: 'N0',
    // "flagship only on corner lots"
    needs: ['CORNER_LOT'],
    excludeRoles: ['INDUSTRIAL', 'PORT', 'TRANSIT_HUB', 'MIXED_RIVER'],
    receptor: false,
    styleKey: facilityStyleKey('LUXURY', 'lx_flagship'),
    densityBand: 'MID',
  },
  {
    facility: 'lx_atelier',
    sector: 'LUXURY',
    allowedRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES', 'MIXED_CORE'],
    preferredRoles: ['PRIME_RES', 'TROPHY_RES'],
    lotTypes: ['ROW'],
    footprintM2: [100, 800],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['INDUSTRIAL', 'PORT', 'TRANSIT_HUB', 'MIXED_RIVER'],
    receptor: false,
    styleKey: facilityStyleKey('LUXURY', 'lx_atelier'),
    densityBand: 'LOW',
  },

  // ---------- SECURITY_LEGAL_INTEL ----------
  {
    facility: 'sl_law_firm',
    sector: 'SECURITY_LEGAL_INTEL',
    // The card's row: "CBD (law), PRIME_RES (cyber), TRANSIT_HUB (depots)" are the preferred
    // roles, "MIXED_CORE, MIXED_RIVER; INDUSTRIAL (depots)" are the other allowed ones. The
    // sector's allowed set is therefore CBD, MIXED_CORE, MIXED_RIVER, PRIME_RES and
    // TRANSIT_HUB - INDUSTRIAL is the depots' alone, and TROPHY_RES is not in the sector's
    // allowed set at all.
    allowedRoles: ['CBD', 'MIXED_CORE', 'MIXED_RIVER', 'PRIME_RES', 'TRANSIT_HUB'],
    preferredRoles: ['CBD'],
    lotTypes: ['OFFICE_TOWER'],
    footprintM2: [600, 4000],
    nuisance: 'N0',
    needs: [],
    // "law <= 500 m from the courthouse or exchange civic parcel if one exists"
    near: [{ facility: 'CBD_PEAK', maxM: 500 }],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('SECURITY_LEGAL_INTEL', 'sl_law_firm'),
    densityBand: 'MID',
  },
  {
    facility: 'sl_cyber',
    sector: 'SECURITY_LEGAL_INTEL',
    allowedRoles: ['CBD', 'MIXED_CORE', 'MIXED_RIVER', 'PRIME_RES', 'TRANSIT_HUB'],
    preferredRoles: ['PRIME_RES'],
    lotTypes: ['MIDRISE', 'OFFICE_TOWER'],
    footprintM2: [500, 3000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('SECURITY_LEGAL_INTEL', 'sl_cyber'),
    densityBand: 'MID',
  },
  {
    facility: 'sl_guard_depot',
    sector: 'SECURITY_LEGAL_INTEL',
    allowedRoles: ['TRANSIT_HUB', 'MIXED_CORE', 'MIXED_RIVER', 'INDUSTRIAL'],
    preferredRoles: ['TRANSIT_HUB'],
    lotTypes: ['WAREHOUSE', 'ROW'],
    footprintM2: [500, 3000],
    nuisance: 'N1',
    needs: [],
    excludeRoles: ['TROPHY_RES', 'CBD', 'PRIME_RES'],
    receptor: false,
    styleKey: facilityStyleKey('SECURITY_LEGAL_INTEL', 'sl_guard_depot'),
    densityBand: 'LOW',
  },
];

/**
 * The facility rules, sorted by facility class.
 *
 * The lookup is a binary search over a sorted array rather than a `Map`: G8 forbids `Map` and
 * `Set` in engine code, because their iteration order is not the engine's byte order and a
 * `Map` that leaks into a canonical output makes two runs differ.
 */
const RULES_BY_CLASS: readonly FacilityRule[] = sortBy(FACILITY_RULES, (r) => [r.facility]);

/**
 * Every style key this rules version defines: the sector bases and the facility keys.
 *
 * A facility key inherits from its sector base (Studio decision 1), and a missing facility key
 * falls back to the sector base (AC-10A-12-STYLE-FALLBACK).
 */
export const STYLE_KEYS: readonly string[] = [
  ...SECTORS.map((s) => sectorStyleKey(s)),
  ...FACILITY_RULES.map((r) => r.styleKey),
];

/** The rule of a facility class, or `undefined`. */
export const facilityRule = (facility: string): FacilityRule | undefined => {
  // A binary search over the sorted rules: the comparison is byte order (never `localeCompare`).
  let lo = 0;
  let hi = RULES_BY_CLASS.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmpStr(RULES_BY_CLASS[mid]!.facility, facility) < 0) lo = mid + 1;
    else hi = mid;
  }
  const hit = RULES_BY_CLASS[lo];
  return hit && hit.facility === facility ? hit : undefined;
};

/**
 * The facilities with hard anchors, in the card's order: "Facilities with hard anchors
 * (exchange, port terminal, tank farm, plants, hospital, data center) are placed first".
 */
export const ANCHOR_FACILITIES: readonly string[] = [
  'fin_exchange',
  'log_port_terminal',
  'en_tank_farm',
  'en_plant',
  'hl_hospital',
  'tech_datacenter',
  'ma_bulk_terminal',
  'mf_chip_fab',
];

// ---------- the role mix ----------

/**
 * The per-mille target of each sector in each district role, over the non-RES assigned parcels.
 *
 * DECISION D-10A-12-MIX (Designer, 2026-10-22): this is a LEGIBILITY target, not an economic
 * one. The per-mille split inside a row is the Designer's call, on the single constraint that
 * the row sums to 1000 and that a non-zero cell names a sector with at least one facility
 * allowed in that role (AC-10A-12-MIX-SUM).
 *
 * The cells are a pure function of the rules table above: a cell is non-zero exactly when the
 * sector has at least one facility whose `allowedRoles` contains the role. `mixTable()` derives
 * it, so the table cannot drift from the rules.
 */
const MIX_ROWS: Readonly<Record<DistrictRole, Readonly<Partial<Record<BizSector, number>>>>> = {
  // CBD: the financial mile. FINANCE 300, TECH_AI 120, SECURITY 120, FOOD 140, LUXURY 70,
  // ENERGY 35, MINING 25, REAL_ESTATE 65, MEDIA 45, HEALTH 80. No retail: `rc_shop`,
  // `rc_supermarket` and `rc_big_box` exclude CBD, so the cell is 0 (the Designer changed the
  // old 50 to 0 for exactly this reason).
  CBD: {
    FOOD_HOSPITALITY: 140,
    RETAIL_CONSUMER: 0,
    REAL_ESTATE_SERVICES: 65,
    LOGISTICS_TRANSPORT: 0,
    ENERGY: 35,
    MINING_AGRICULTURE: 25,
    MANUFACTURING: 0,
    TECH_AI: 120,
    FINANCE: 300,
    MEDIA_ENTERTAINMENT: 45,
    HEALTH: 80,
    LUXURY: 70,
    SECURITY_LEGAL_INTEL: 120,
  },
  // PORT: the docks. LOGISTICS 450, ENERGY 150, MINING 150, MANUFACTURING 150, REAL_ESTATE 100.
  // No food: every food facility excludes PORT.
  PORT: {
    FOOD_HOSPITALITY: 0,
    RETAIL_CONSUMER: 0,
    REAL_ESTATE_SERVICES: 100,
    LOGISTICS_TRANSPORT: 450,
    ENERGY: 150,
    MINING_AGRICULTURE: 150,
    MANUFACTURING: 150,
    TECH_AI: 0,
    FINANCE: 0,
    MEDIA_ENTERTAINMENT: 0,
    HEALTH: 0,
    LUXURY: 0,
    SECURITY_LEGAL_INTEL: 0,
  },
  // INDUSTRIAL: the basin. MANUFACTURING 400, LOGISTICS 200, ENERGY 100, TECH_AI 100 (data
  // centres), REAL_ESTATE 80, RETAIL 60 (the big box), MEDIA 30, SECURITY 10, MINING 20.
  INDUSTRIAL: {
    FOOD_HOSPITALITY: 0,
    RETAIL_CONSUMER: 60,
    REAL_ESTATE_SERVICES: 80,
    LOGISTICS_TRANSPORT: 200,
    ENERGY: 100,
    MINING_AGRICULTURE: 20,
    MANUFACTURING: 400,
    TECH_AI: 100,
    FINANCE: 0,
    MEDIA_ENTERTAINMENT: 30,
    HEALTH: 0,
    LUXURY: 0,
    SECURITY_LEGAL_INTEL: 10,
  },
  // MIXED_CORE: the old town. FOOD 280, RETAIL 220, REAL_ESTATE 100, ENERGY 20, FINANCE 50,
  // MEDIA 90, HEALTH 70, LUXURY 70, SECURITY 100.
  MIXED_CORE: {
    FOOD_HOSPITALITY: 280,
    RETAIL_CONSUMER: 220,
    REAL_ESTATE_SERVICES: 100,
    LOGISTICS_TRANSPORT: 0,
    ENERGY: 20,
    MINING_AGRICULTURE: 0,
    MANUFACTURING: 0,
    TECH_AI: 0,
    FINANCE: 50,
    MEDIA_ENTERTAINMENT: 90,
    HEALTH: 70,
    LUXURY: 70,
    SECURITY_LEGAL_INTEL: 100,
  },
  // MIXED_RIVER: the lofts. FOOD 220, RETAIL 160, REAL_ESTATE 90, LOGISTICS 100, ENERGY 30,
  // MANUFACTURING 30, TECH_AI 90, FINANCE 40, MEDIA 130, HEALTH 50, SECURITY 60.
  MIXED_RIVER: {
    FOOD_HOSPITALITY: 220,
    RETAIL_CONSUMER: 160,
    REAL_ESTATE_SERVICES: 90,
    LOGISTICS_TRANSPORT: 100,
    ENERGY: 30,
    MINING_AGRICULTURE: 0,
    MANUFACTURING: 30,
    TECH_AI: 90,
    FINANCE: 40,
    MEDIA_ENTERTAINMENT: 130,
    HEALTH: 50,
    LUXURY: 0,
    SECURITY_LEGAL_INTEL: 60,
  },
  // TRANSIT_HUB: the station quarter. FOOD 220, RETAIL 210, REAL_ESTATE 130, LOGISTICS 60,
  // ENERGY 30, TECH_AI 70, FINANCE 80, MEDIA 80, HEALTH 80, SECURITY 40.
  TRANSIT_HUB: {
    FOOD_HOSPITALITY: 220,
    RETAIL_CONSUMER: 210,
    REAL_ESTATE_SERVICES: 130,
    LOGISTICS_TRANSPORT: 60,
    ENERGY: 30,
    MINING_AGRICULTURE: 0,
    MANUFACTURING: 0,
    TECH_AI: 70,
    FINANCE: 80,
    MEDIA_ENTERTAINMENT: 80,
    HEALTH: 80,
    LUXURY: 0,
    SECURITY_LEGAL_INTEL: 40,
  },
  // PRIME_RES: the hill. FOOD 60, RETAIL 50, REAL_ESTATE 90, ENERGY 20, TECH_AI 250,
  // FINANCE 180, HEALTH 100, LUXURY 150, SECURITY 100.
  PRIME_RES: {
    FOOD_HOSPITALITY: 60,
    RETAIL_CONSUMER: 50,
    REAL_ESTATE_SERVICES: 90,
    LOGISTICS_TRANSPORT: 0,
    ENERGY: 20,
    MINING_AGRICULTURE: 0,
    MANUFACTURING: 0,
    TECH_AI: 250,
    FINANCE: 180,
    MEDIA_ENTERTAINMENT: 0,
    HEALTH: 100,
    LUXURY: 150,
    SECURITY_LEGAL_INTEL: 100,
  },
  // TROPHY_RES: the summit. FOOD 80 (the one restaurant per district), REAL_ESTATE 200,
  // HEALTH 120, LUXURY 600.
  TROPHY_RES: {
    FOOD_HOSPITALITY: 80,
    RETAIL_CONSUMER: 0,
    REAL_ESTATE_SERVICES: 200,
    LOGISTICS_TRANSPORT: 0,
    ENERGY: 0,
    MINING_AGRICULTURE: 0,
    MANUFACTURING: 0,
    TECH_AI: 0,
    FINANCE: 0,
    MEDIA_ENTERTAINMENT: 0,
    HEALTH: 120,
    LUXURY: 600,
    SECURITY_LEGAL_INTEL: 0,
  },
};

/**
 * The mix table, derived from the rules: a cell is non-zero exactly when the sector has at least
 * one facility allowed in that role, and the row's per-mille values are the Designer's.
 *
 * `MIX_ROWS` states the values; `mixTable()` returns them with the sector keys sorted by byte
 * order, so the object is canonical and a test can compare it byte for byte.
 */
export const DISTRICT_ROLE_MIX: Readonly<Record<DistrictRole, Readonly<Record<BizSector, number>>>> =
  Object.fromEntries(
    DISTRICT_ROLES.map((role) => {
      const row: Record<BizSector, number> = {} as Record<BizSector, number>;
      for (const sector of SECTORS) row[sector] = MIX_ROWS[role][sector] ?? 0;
      return [role, row];
    }),
  ) as Readonly<Record<DistrictRole, Readonly<Record<BizSector, number>>>>;

/**
 * The sectors that have at least one facility allowed in a role. The mix table's non-zero cells
 * are exactly these (AC-10A-12-MIX-SUM's biconditional).
 */
export const SECTORS_ALLOWED_IN_ROLE = (role: DistrictRole): readonly BizSector[] =>
  SECTORS.filter((s) =>
    FACILITY_RULES.some((r) => r.sector === s && r.allowedRoles.includes(role)),
  );

/** The sum of a mix row. Every row sums to 1000 (AC-10A-12-MIX-SUM). */
export const mixRowSum = (role: DistrictRole): number => {
  const row = DISTRICT_ROLE_MIX[role];
  let sum = 0;
  for (const sector of SECTORS) sum += row[sector];
  return sum;
};

/**
 * The density band of a facility, read off its preferred lot type (Studio decision 2): the band
 * is a function of the parcel's zoning class and `maxFar`, and this table gives the facility's
 * preferred class's band. `densityBandFor` in classify.ts is the parcel-level function.
 */
export const DENSITY_BAND_BY_LOT: Readonly<Record<string, DensityBand>> = {
  SHOPFRONT: 'LOW',
  ROW: 'LOW',
  MIDRISE: 'MID',
  HIGHRISE: 'HIGH',
  OFFICE_TOWER: 'MID',
  CBD_TOWER: 'TOWER',
  WAREHOUSE: 'LOW',
  PLANT: 'LOW',
  PORT_YARD: 'LOW',
  DC_SITE: 'LOW',
  FAB: 'LOW',
  UTILITY_SITE: 'LOW',
  CAMPUS: 'LOW',
  CIVIC: 'LOW',
  GREEN: 'LOW',
};

/** The rules of a sector, in table order. */
export const rulesOfSector = (sector: BizSector): readonly FacilityRule[] =>
  FACILITY_RULES.filter((r) => r.sector === sector);

/** The facility classes of a sector, sorted by byte order. */
export const facilitiesOfSector = (sector: BizSector): readonly string[] =>
  rulesOfSector(sector).map((r) => r.facility).sort(cmpStr);
