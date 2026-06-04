import { describe, expect, it } from 'vitest';

import {
  collectSelectedRegionIds,
  getTriangleCentroid,
  isPointInPolygon,
  selectTrianglesByLasso,
} from './triangleRegionSelection';
import type { TriangleMesh } from '@/types';

const mesh: TriangleMesh = {
  points: [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 2, y: 0 },
    { id: 2, x: 0, y: 2 },
    { id: 3, x: 3, y: 0 },
    { id: 4, x: 3, y: 2 },
  ],
  triangles: [
    [0, 1, 2],
    [1, 3, 4],
  ],
  bounds: { minX: 0, maxX: 3, minY: 0, maxY: 2, width: 3, height: 2 },
  source: 'constrained',
  triangleRegionIds: [10, null],
  triangleResistivityValues: [100, null],
};

describe('triangleRegionSelection', () => {
  it('computes a triangle centroid from mesh vertices', () => {
    expect(getTriangleCentroid(mesh, 0)).toEqual({ x: 2 / 3, y: 2 / 3 });
  });

  it('tests a point against a lasso polygon', () => {
    const polygon = [
      { x: -1, y: -1 },
      { x: 2, y: -1 },
      { x: 2, y: 2 },
      { x: -1, y: 2 },
    ];

    expect(isPointInPolygon({ x: 0, y: 0 }, polygon)).toBe(true);
    expect(isPointInPolygon({ x: 3, y: 0 }, polygon)).toBe(false);
  });

  it('selects triangles whose centroids fall inside the lasso', () => {
    const selected = selectTrianglesByLasso(mesh, [
      { x: -1, y: -1 },
      { x: 2, y: -1 },
      { x: 2, y: 2 },
      { x: -1, y: 2 },
    ]);

    expect(selected).toEqual([0]);
  });

  it('collects non-null selected region ids', () => {
    expect(collectSelectedRegionIds(mesh, [0, 1])).toEqual(new Set([10]));
  });
});
