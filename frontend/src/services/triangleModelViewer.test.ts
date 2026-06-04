import { describe, expect, it } from 'vitest';

import { buildTriangleHoverState, shouldStartLassoDrag } from './triangleModelViewer';

describe('buildTriangleHoverState', () => {
  it('keeps region rho when a vertex wins the visible hover state', () => {
    const hover = buildTriangleHoverState({
      point: { x: 12, y: 8 },
      regionHit: {
        triangleIndex: 4,
        regionId: 7,
        resistivityValue: 150,
      },
      vertex: { id: 9, x: 12, y: 8 },
      segment: null,
    });

    expect(hover).toEqual({
      point: { x: 12, y: 8 },
      triangleIndex: 4,
      regionId: 7,
      resistivityValue: 150,
      vertex: { id: 9, x: 12, y: 8 },
      segment: null,
    });
  });

  it('keeps region rho when a segment wins the visible hover state', () => {
    const hover = buildTriangleHoverState({
      point: { x: 3, y: 5 },
      regionHit: {
        triangleIndex: 2,
        regionId: 11,
        resistivityValue: 0.75,
      },
      vertex: null,
      segment: {
        id: 5,
        endpoint_1: 1,
        endpoint_2: 2,
        boundary_marker: null,
      },
    });

    expect(hover).toEqual({
      point: { x: 3, y: 5 },
      triangleIndex: 2,
      regionId: 11,
      resistivityValue: 0.75,
      vertex: null,
      segment: {
        id: 5,
        endpoint_1: 1,
        endpoint_2: 2,
        boundary_marker: null,
      },
    });
  });

  it('falls back to empty hover metadata when no region hit exists', () => {
    const hover = buildTriangleHoverState({
      point: { x: 0, y: 0 },
      regionHit: null,
      vertex: null,
      segment: null,
    });

    expect(hover).toEqual({
      point: { x: 0, y: 0 },
      triangleIndex: null,
      regionId: null,
      resistivityValue: null,
      vertex: null,
      segment: null,
    });
  });
});

describe('shouldStartLassoDrag', () => {
  it('starts lasso capture only when lasso mode has mesh data', () => {
    expect(shouldStartLassoDrag({ interactionMode: 'lasso', hasMesh: true })).toBe(true);
    expect(shouldStartLassoDrag({ interactionMode: 'pan', hasMesh: true })).toBe(false);
    expect(shouldStartLassoDrag({ interactionMode: 'lasso', hasMesh: false })).toBe(false);
  });
});
