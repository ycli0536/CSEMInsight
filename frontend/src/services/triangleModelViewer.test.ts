import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  buildTriangleHoverState,
  setGeometryAttribute,
  shouldStartLassoDrag,
} from './triangleModelViewer';

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

describe('setGeometryAttribute', () => {
  it('overwrites the existing buffer when the size has not changed', () => {
    // Hover highlights redraw on every pointer move. three.js only frees a GPU
    // buffer when its geometry is disposed, so a new BufferAttribute per move
    // would strand one buffer per move for the life of the window.
    const geometry = new THREE.BufferGeometry();
    setGeometryAttribute(geometry, 'position', new Float32Array([0, 0, 0]), 3);
    const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    const versionBefore = attribute.version;
    const dispose = vi.spyOn(geometry, 'dispose');

    setGeometryAttribute(geometry, 'position', new Float32Array([1, 2, 3]), 3);

    expect(geometry.getAttribute('position')).toBe(attribute);
    expect(Array.from(attribute.array)).toEqual([1, 2, 3]);
    // needsUpdate is write-only; the version bump is what tells the renderer
    // to re-upload the buffer it already has.
    expect(attribute.version).toBe(versionBefore + 1);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('disposes the geometry before swapping in a differently sized buffer', () => {
    const geometry = new THREE.BufferGeometry();
    setGeometryAttribute(geometry, 'position', new Float32Array([0, 0, 0]), 3);
    const dispose = vi.spyOn(geometry, 'dispose');

    setGeometryAttribute(geometry, 'position', new Float32Array([1, 2, 3, 4, 5, 6]), 3);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(Array.from(geometry.getAttribute('position').array)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('does not dispose when the attribute is set for the first time', () => {
    const geometry = new THREE.BufferGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');

    setGeometryAttribute(geometry, 'color', new Float32Array([1, 1, 1]), 3);

    expect(dispose).not.toHaveBeenCalled();
    expect(geometry.getAttribute('color').itemSize).toBe(3);
  });
});

describe('shouldStartLassoDrag', () => {
  it('starts lasso capture only when lasso mode has mesh data', () => {
    expect(shouldStartLassoDrag({ interactionMode: 'lasso', hasMesh: true })).toBe(true);
    expect(shouldStartLassoDrag({ interactionMode: 'pan', hasMesh: true })).toBe(false);
    expect(shouldStartLassoDrag({ interactionMode: 'lasso', hasMesh: false })).toBe(false);
  });
});
