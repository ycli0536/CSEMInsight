import { describe, expect, it } from 'vitest';

import {
  ANISOTROPY_RATIO_VIEW,
  applyEditPatch,
  applySetRhoEdit,
  buildRegionRhoMaps,
  deriveTriangleResistivityValues,
  getDisplayedRhoByRegion,
  getResistivityComponents,
  revertEditPatch,
  withPatchedComponent,
} from './triangleRegionEditing';
import type { TriangleMesh, TriangleModelResponse } from '@/types';

const mesh: TriangleMesh = {
  points: [],
  triangles: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 },
  source: 'constrained',
  triangleRegionIds: [10, 20, null],
  triangleResistivityValues: [10, 100, null],
};

describe('triangleRegionEditing', () => {
  it('applies fixed rho in log space using supplied weights', () => {
    const current = new Map([
      [10, 10],
      [20, 100],
    ]);
    const patch = applySetRhoEdit({
      currentRhoByRegion: current,
      targetRho: 1000,
      regionWeights: new Map([
        [10, 1],
        [20, 0.5],
      ]),
    });

    expect(patch.skippedRegionIds).toEqual([]);
    expect(patch.nextRhoByRegion.get(10)).toBeCloseTo(1000);
    expect(patch.nextRhoByRegion.get(20)).toBeCloseTo(Math.sqrt(100 * 1000));
  });

  it('skips invalid source rho values', () => {
    const patch = applySetRhoEdit({
      currentRhoByRegion: new Map([[10, 0]]),
      targetRho: 100,
      regionWeights: new Map([[10, 1]]),
    });

    expect(patch.nextRhoByRegion.size).toBe(0);
    expect(patch.skippedRegionIds).toEqual([10]);
  });

  it('applies and reverts compact patches', () => {
    const current = new Map([[10, 10]]);
    const patch = applySetRhoEdit({
      currentRhoByRegion: current,
      targetRho: 100,
      regionWeights: new Map([[10, 1]]),
    });

    expect(applyEditPatch(current, patch).get(10)).toBe(100);
    expect(revertEditPatch(applyEditPatch(current, patch), patch).get(10)).toBe(10);
  });

  it('derives triangle rho values from region edits', () => {
    const values = deriveTriangleResistivityValues({
      mesh,
      rhoByRegion: new Map([
        [10, 25],
        [20, 50],
      ]),
    });

    expect(values).toEqual([25, 50, null]);
  });
});

describe('anisotropic rho components', () => {
  const anisotropicModel = {
    constrainedMesh: {
      resistivityComponents: [
        { key: 'rhoZ', label: 'Rho-z', column: 'Rho-z' },
        { key: 'rhoH', label: 'Rho-h', column: 'Rho-h' },
      ],
      regionResistivity: [
        { regionId: 1, rho: 10, rhoZ: 10, rhoH: 2 },
        { regionId: 2, rho: 100, rhoZ: 100, rhoH: 50 },
      ],
    },
  } as unknown as TriangleModelResponse;

  it('builds one rho map per component', () => {
    const maps = buildRegionRhoMaps(anisotropicModel);

    expect(Array.from(maps.keys())).toEqual(['rhoZ', 'rhoH']);
    expect(Array.from(maps.get('rhoZ')!.entries())).toEqual([
      [1, 10],
      [2, 100],
    ]);
    expect(Array.from(maps.get('rhoH')!.entries())).toEqual([
      [1, 2],
      [2, 50],
    ]);
  });

  it('treats an isotropic payload as the single rho component', () => {
    const model = {
      constrainedMesh: { regionResistivity: [{ regionId: 1, rho: 7 }] },
    } as unknown as TriangleModelResponse;

    expect(getResistivityComponents(model)).toEqual([
      { key: 'rho', label: 'Rho', column: 'Rho' },
    ]);
    expect(Array.from(buildRegionRhoMaps(model).get('rho')!.entries())).toEqual([[1, 7]]);
  });

  it('derives the anisotropy ratio from the current component values', () => {
    const maps = buildRegionRhoMaps(anisotropicModel);

    expect(
      Array.from(getDisplayedRhoByRegion(maps, ANISOTROPY_RATIO_VIEW).entries()),
    ).toEqual([
      [1, 5],
      [2, 2],
    ]);
  });

  it('applies a patch to only the component it was made on', () => {
    const maps = buildRegionRhoMaps(anisotropicModel);
    const patch = applySetRhoEdit({
      currentRhoByRegion: maps.get('rhoH')!,
      regionWeights: new Map([[1, 1]]),
      targetRho: 1000,
      componentKey: 'rhoH',
    });

    const next = withPatchedComponent(maps, patch, (rhoByRegion) =>
      applyEditPatch(rhoByRegion, patch),
    );

    expect(next.get('rhoH')!.get(1)).toBeCloseTo(1000);
    expect(next.get('rhoZ')!.get(1)).toBe(10);
    // The ratio follows the edited component.
    expect(getDisplayedRhoByRegion(next, ANISOTROPY_RATIO_VIEW).get(1)).toBeCloseTo(0.01);
  });
});
