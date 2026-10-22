// T10A-12 (city placement): this card's own barrel.
//
// T10A-03 wires it in (interface request IR-1): it re-exports `placement/index.ts` from
// `packages/citygen/src/index.ts` and calls `assignSectors` as stage 7b in the citygen pipeline.
//
// Nothing here is re-exported from the `@tycoon/engine-core` barrel: that barrel pulls in zod,
// which is a dependency of packages/engine/core and of nothing else, so a barrel import would
// make this package depend on engine/core having been installed first, and the engine-check
// matrix runs the packages in an arbitrary order.

export type {
  BizSector,
  DensityBand,
  DistrictRole,
  FacilityClass,
  FacilityCondition,
  FacilityNeed,
  FacilityRule,
  FixedPointCoord,
  FixedPointPolygon,
  IndustrialKind,
  LotType,
  MaxPer,
  NearRule,
  NearTarget,
  Nuisance,
  ParcelFlags,
  PlacementAssignment,
  PlacementAttributes,
  PlacementCtx,
  PlacementDistrict,
  PlacementParcel,
  PlacementZoning,
  RegionInput,
  ReservedFor,
  SectorKey,
  StructureKind,
  Suitability,
  SuitabilityReason,
  UseClass,
  ZoningClass,
  Draw,
} from './types';

export { SECTORS, DISTRICT_ROLES, NUISANCE_CLASSES, DENSITY_BANDS, sectorKeyOf } from './types';

export {
  ANCHOR_FACILITIES,
  BUFFER_M,
  DISTRICT_ROLE_MIX,
  FACILITY_RULES,
  MIX_CARRIERS,
  PLACEMENT_RULES_VERSION,
  SECTORS_ALLOWED_IN_ROLE,
  STRUCTURE_CAP_M,
  STYLE_KEYS,
  DENSITY_BAND_BY_LOT,
  facilitiesOfSector,
  facilityRule,
  facilityStyleKey,
  mixCarriers,
  mixRowSum,
  rulesOfSector,
  sectorStyleKey,
} from './rules';
export type { MixCarrier } from './rules';

export {
  DISTRICT_FLAGS,
  DISTRICT_TIERS,
  byByteOrder,
  cityVisKey,
  densityBand,
  districtRole,
  flagsOf,
  isAssignable,
  lotType,
  parcelFlags,
  tierOf,
  withinSeg,
} from './classify';
export type { DistrictFlags, DistrictTier, RailView, TerrainView } from './classify';

export {
  bufferCm,
  bufferViolations,
  cross,
  edgeDistanceCm,
  isReceptor,
  isqrt,
  nuisanceOf,
  onSegment,
  receptorBlocked,
  segSegWithin,
  segmentsIntersect,
} from './buffers';
export type { BufferViolation } from './buffers';

export {
  NEAR_BONUS,
  PREFERRED_BONUS,
  conditionHolds,
  lotTypeRank,
  needHolds,
  needReason,
  suitability,
  verdict,
} from './suitability';

export { assignSectors, assignSectorsTraced, mixDeficit } from './assign';
export type { AssignmentTrace } from './assign';
