import type { TriangleMesh, TriangleModelResponse } from '@/types';

export interface TriangleRegionEditPatch {
  previousRhoByRegion: Map<number, number>;
  nextRhoByRegion: Map<number, number>;
  skippedRegionIds: number[];
}

export interface ApplySetRhoEditOptions {
  currentRhoByRegion: Map<number, number>;
  regionWeights: Map<number, number>;
  targetRho: number;
}

export interface DeriveTriangleResistivityValuesOptions {
  mesh: TriangleMesh;
  rhoByRegion: Map<number, number>;
}

function isEditableRho(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function buildRegionRhoMap(model: TriangleModelResponse | null) {
  const rhoByRegion = new Map<number, number>();

  model?.constrainedMesh?.regionResistivity.forEach((item) => {
    if (isEditableRho(item.rho)) {
      rhoByRegion.set(item.regionId, item.rho);
    }
  });

  return rhoByRegion;
}

export function applySetRhoEdit(
  options: ApplySetRhoEditOptions,
): TriangleRegionEditPatch {
  const { currentRhoByRegion, regionWeights, targetRho } = options;
  const previousRhoByRegion = new Map<number, number>();
  const nextRhoByRegion = new Map<number, number>();
  const skippedRegionIds: number[] = [];

  if (!isEditableRho(targetRho)) {
    return {
      previousRhoByRegion,
      nextRhoByRegion,
      skippedRegionIds: Array.from(regionWeights.keys()),
    };
  }

  const targetLog = Math.log10(targetRho);

  regionWeights.forEach((weight, regionId) => {
    const currentRho = currentRhoByRegion.get(regionId);
    if (!isEditableRho(currentRho)) {
      skippedRegionIds.push(regionId);
      return;
    }

    const safeWeight = Math.min(Math.max(weight, 0), 1);
    const nextLog = Math.log10(currentRho) * (1 - safeWeight) + targetLog * safeWeight;

    previousRhoByRegion.set(regionId, currentRho);
    nextRhoByRegion.set(regionId, 10 ** nextLog);
  });

  return {
    previousRhoByRegion,
    nextRhoByRegion,
    skippedRegionIds,
  };
}

export function applyEditPatch(
  currentRhoByRegion: Map<number, number>,
  patch: TriangleRegionEditPatch,
) {
  const nextRhoByRegion = new Map(currentRhoByRegion);
  patch.nextRhoByRegion.forEach((rho, regionId) => {
    nextRhoByRegion.set(regionId, rho);
  });

  return nextRhoByRegion;
}

export function revertEditPatch(
  currentRhoByRegion: Map<number, number>,
  patch: TriangleRegionEditPatch,
) {
  const nextRhoByRegion = new Map(currentRhoByRegion);
  patch.previousRhoByRegion.forEach((rho, regionId) => {
    nextRhoByRegion.set(regionId, rho);
  });

  return nextRhoByRegion;
}

export function deriveTriangleResistivityValues(
  options: DeriveTriangleResistivityValuesOptions,
) {
  const { mesh, rhoByRegion } = options;

  return mesh.triangles.map((_, triangleIndex) => {
    const regionId = mesh.triangleRegionIds?.[triangleIndex] ?? null;
    if (regionId === null) {
      return null;
    }

    return rhoByRegion.get(regionId) ?? null;
  });
}
