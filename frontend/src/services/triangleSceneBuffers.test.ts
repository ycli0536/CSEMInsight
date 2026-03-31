import { describe, expect, it } from 'vitest';

import {
  buildTriangleRegionHighlightPositions,
  buildTriangleSceneBuffers,
  buildTriangleSegmentPositions,
} from './triangleSceneBuffers';

describe('triangleSceneBuffers', () => {
  it('builds triangle fill, color, edge, and point buffers for constrained mesh rendering', () => {
    const buffers = buildTriangleSceneBuffers({
      points: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 2, y: 0 },
        { id: 2, x: 0, y: 1 },
      ],
      triangles: [[0, 1, 2]],
      bounds: {
        minX: 0,
        maxX: 2,
        minY: 0,
        maxY: 1,
        width: 2,
        height: 1,
      },
      source: 'constrained',
      triangleRegionIds: [9],
      triangleResistivityValues: [100],
    });

    expect(Array.from(buffers.pointPositions)).toEqual([
      0, 0, 0,
      2, 0, 0,
      0, 1, 0,
    ]);
    expect(Array.from(buffers.triangleFillPositions)).toEqual([
      0, 0, 0,
      2, 0, 0,
      0, 1, 0,
    ]);
    expect(buffers.triangleFillColors).toHaveLength(9);
    expect(Array.from(buffers.triangleFillColors.slice(0, 3))).toEqual(
      Array.from(buffers.triangleFillColors.slice(3, 6)),
    );
    expect(Array.from(buffers.triangleEdgePositions)).toEqual([
      0, 0, 0,
      2, 0, 0,
      2, 0, 0,
      0, 1, 0,
      0, 1, 0,
      0, 0, 0,
    ]);
  });

  it('builds original poly segment positions from source vertices', () => {
    const segmentPositions = buildTriangleSegmentPositions(
      [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 2, y: 0 },
        { id: 3, x: 0, y: 1 },
      ],
      [
        { id: 9, endpoint_1: 1, endpoint_2: 2, boundary_marker: null },
        { id: 10, endpoint_1: 2, endpoint_2: 3, boundary_marker: null },
      ],
    );

    expect(Array.from(segmentPositions)).toEqual([
      0, 0, 0,
      2, 0, 0,
      2, 0, 0,
      0, 1, 0,
    ]);
  });

  it('builds region highlight positions for every triangle that shares the hovered region id', () => {
    const regionPositions = buildTriangleRegionHighlightPositions(
      {
        points: [
          { id: 0, x: 0, y: 0 },
          { id: 1, x: 1, y: 0 },
          { id: 2, x: 0, y: 1 },
          { id: 3, x: 1, y: 1 },
        ],
        triangles: [
          [0, 1, 2],
          [1, 3, 2],
          [1, 3, 0],
        ],
        bounds: {
          minX: 0,
          maxX: 1,
          minY: 0,
          maxY: 1,
          width: 1,
          height: 1,
        },
        source: 'constrained',
        triangleRegionIds: [7, 7, 9],
        triangleResistivityValues: [10, 10, 100],
      },
      0,
    );

    const positions = Array.from(regionPositions);

    expect(positions).toHaveLength(18);
    expect(positions[0]).toBe(0);
    expect(positions[1]).toBe(0);
    expect(positions[2]).toBeCloseTo(0.03);
    expect(positions[15]).toBe(0);
    expect(positions[16]).toBe(1);
    expect(positions[17]).toBeCloseTo(0.03);
  });
});
