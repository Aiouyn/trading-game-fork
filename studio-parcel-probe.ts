// Studio probe: measure the reference map's PARCEL areas per district.
// Basis: suitability EXCLUDES a parcel whose area is outside footprintM2, so a
// facility needs a parcel with min <= area <= max. Measured on the PARCEL
// (building footprint w x d), not the subdivision cell (lw x ld).
import { buildWorld, REFERENCE_SEED } from './tests/e2e/city/fixtures/generate-city.js';

const world = buildWorld(REFERENCE_SEED, 1);

const byEntity = new Map(world.entities.map((e) => [e.id, e]));
const seen = new Set<string>();
const perDist = new Map<string, number[]>();
for (const p of world.parts) {
  const ent = byEntity.get(p.ownerId);
  if (!ent) continue;
  if (ent.kind === 'landmark' || ent.kind === 'crown_tower') continue;
  // The fixture pushes TWO parts for a tall building (base + tower) with the SAME
  // ownerId, so a parcel is one ownerId: dedupe on it.
  if (seen.has(p.ownerId)) continue;
  seen.add(p.ownerId);
  const w = p.cm[2] / 100;
  const d = p.cm[3] / 100;
  const area = w * d;
  const arr = perDist.get(ent.districtId) ?? [];
  arr.push(area);
  perDist.set(ent.districtId, arr);
}

const out: Record<string, number[]> = {};
for (const [dist, areas] of perDist) out[dist] = areas.sort((a, b) => a - b);
console.log(JSON.stringify(out));
