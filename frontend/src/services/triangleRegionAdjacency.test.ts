import { describe, expect, it } from 'vitest';

import {
  buildRegionAdjacency,
  getFeatherRegionWeights,
} from './triangleRegionAdjacency';
import type { TriangleMesh } from '@/types';

const mesh: TriangleMesh = {
  points: [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 1, y: 0 },
    { id: 2, x: 0, y: 1 },
    { id: 3, x: 1, y: 1 },
    { id: 4, x: 2, y: 1 },
  ],
  triangles: [
    [0, 1, 2],
    [1, 3, 2],
    [1, 4, 3],
  ],
  bounds: { minX: 0, maxX: 2, minY: 0, maxY: 1, width: 2, height: 1 },
  source: 'constrained',
  triangleRegionIds: [10, 20, 30],
  triangleResistivityValues: [10, 20, 30],
};

describe('triangleRegionAdjacency', () => {
  it('builds region adjacency from shared triangle edges', () => {
    const adjacency = buildRegionAdjacency(mesh);

    expect(adjacency.get(10)).toEqual(new Set([20]));
    expect(adjacency.get(20)).toEqual(new Set([10, 30]));
    expect(adjacency.get(30)).toEqual(new Set([20]));
  });

  it('assigns feather weights by adjacency ring', () => {
    const weights = getFeatherRegionWeights({
      adjacency: buildRegionAdjacency(mesh),
      selectedRegionIds: new Set([10]),
      rings: 2,
    });

    expect(weights.get(10)).toBe(1);
    expect(weights.get(20)).toBeCloseTo(2 / 3);
    expect(weights.get(30)).toBeCloseTo(1 / 3);
  });

  it('clamps feather rings and keeps selected regions at full weight', () => {
    const weights = getFeatherRegionWeights({
      adjacency: buildRegionAdjacency(mesh),
      selectedRegionIds: new Set([20]),
      rings: 0,
    });

    expect(weights).toEqual(new Map([[20, 1]]));
  });
});
