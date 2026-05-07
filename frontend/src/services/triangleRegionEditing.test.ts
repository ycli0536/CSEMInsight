import { describe, expect, it } from 'vitest';

import {
  applyEditPatch,
  applySetRhoEdit,
  deriveTriangleResistivityValues,
  revertEditPatch,
} from './triangleRegionEditing';
import type { TriangleMesh } from '@/types';

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
