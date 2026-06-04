import { describe, expect, it } from 'vitest';

import {
  createInitialTriangleViewport,
  findNearestSegment,
  findNearestVertex,
  panTriangleViewportByPixels,
  zoomTriangleViewport,
} from './triangleViewport';

describe('triangleViewport', () => {
  it('creates a padded initial viewport from mesh bounds', () => {
    expect(
      createInitialTriangleViewport({
        minX: 0,
        maxX: 10,
        minY: 0,
        maxY: 20,
        width: 10,
        height: 20,
      }),
    ).toEqual({
      x: -0.5,
      y: -1,
      width: 11,
      height: 22,
    });
  });

  it('zooms around the anchor point without moving that model coordinate', () => {
    expect(
      zoomTriangleViewport(
        { x: 0, y: 0, width: 10, height: 10 },
        0.5,
        { x: 2, y: 8 },
      ),
    ).toEqual({
      x: 1,
      y: 4,
      width: 5,
      height: 5,
    });
  });

  it('pans the viewport from screen-space drag deltas', () => {
    expect(
      panTriangleViewportByPixels(
        { x: 10, y: 20, width: 40, height: 20 },
        { dx: 50, dy: -25 },
        { width: 200, height: 100 },
      ),
    ).toEqual({
      x: 0,
      y: 25,
      width: 40,
      height: 20,
    });
  });

  it('finds the nearest vertex within tolerance', () => {
    const vertex = findNearestVertex(
      [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 10, y: 0 },
      ],
      { x: 0.5, y: 0.5 },
      1,
    );

    expect(vertex?.id).toBe(1);
    expect(findNearestVertex([{ id: 1, x: 0, y: 0 }], { x: 10, y: 10 }, 1)).toBeNull();
  });

  it('finds the nearest segment within tolerance', () => {
    const segment = findNearestSegment(
      [{ id: 7, endpoint_1: 1, endpoint_2: 2, boundary_marker: null }],
      new Map([
        [1, { id: 1, x: 0, y: 0 }],
        [2, { id: 2, x: 10, y: 0 }],
      ]),
      { x: 4, y: 0.2 },
      0.5,
    );

    expect(segment?.id).toBe(7);
    expect(
      findNearestSegment(
        [{ id: 7, endpoint_1: 1, endpoint_2: 2, boundary_marker: null }],
        new Map([
          [1, { id: 1, x: 0, y: 0 }],
          [2, { id: 2, x: 10, y: 0 }],
        ]),
        { x: 4, y: 5 },
        0.5,
      ),
    ).toBeNull();
  });
});
