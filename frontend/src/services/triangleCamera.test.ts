import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  createTriangleCameraState,
  panTriangleCameraByPixels,
  projectScreenPointToWorldWithCamera,
  screenPointToWorld,
  zoomTriangleCamera,
} from './triangleCamera';

describe('triangleCamera', () => {
  it('fits mesh bounds into an orthographic camera state', () => {
    expect(
      createTriangleCameraState(
        {
          minX: 0,
          maxX: 10,
          minY: 0,
          maxY: 20,
          width: 10,
          height: 20,
        },
        { width: 400, height: 200 },
      ),
    ).toEqual({
      baseHeight: 22,
      baseWidth: 44,
      centerX: 5,
      centerY: 10,
      zoom: 1,
    });
  });

  it('converts screen coordinates into world coordinates', () => {
    expect(
      screenPointToWorld(
        { x: 100, y: 50 },
        { width: 200, height: 100 },
        {
          baseHeight: 20,
          baseWidth: 40,
          centerX: 10,
          centerY: 20,
          zoom: 2,
        },
      ),
    ).toEqual({
      x: 10,
      y: 20,
    });
  });

  it('maps the screen top edge to the minimum world Y in the depth-down view', () => {
    expect(
      screenPointToWorld(
        { x: 0, y: 0 },
        { width: 200, height: 100 },
        {
          baseHeight: 20,
          baseWidth: 40,
          centerX: 10,
          centerY: 20,
          zoom: 2,
        },
      ),
    ).toEqual({
      x: 0,
      y: 15,
    });
  });

  it('projects screen points through the actual three.js camera so hover stays aligned with the rendered mesh', () => {
    const camera = new THREE.OrthographicCamera(-20, 20, -10, 10, 0.1, 100);
    camera.zoom = 2;
    camera.position.set(10, 20, 10);
    camera.up.set(0, 1, 0);
    camera.lookAt(10, 20, 0);
    camera.updateProjectionMatrix();

    expect(
      projectScreenPointToWorldWithCamera(
        { x: 0, y: 0 },
        { width: 200, height: 100 },
        camera,
      ),
    ).toMatchObject({
      y: 15,
    });
    expect(
      projectScreenPointToWorldWithCamera(
        { x: 0, y: 0 },
        { width: 200, height: 100 },
        camera,
      )?.x,
    ).toBeCloseTo(0);

    expect(
      projectScreenPointToWorldWithCamera(
        { x: 200, y: 100 },
        { width: 200, height: 100 },
        camera,
      ),
    ).toMatchObject({
      y: 25,
    });
    expect(
      projectScreenPointToWorldWithCamera(
        { x: 200, y: 100 },
        { width: 200, height: 100 },
        camera,
      )?.x,
    ).toBeCloseTo(20);
  });

  it('moves the viewport center in the same drag direction as the pointer', () => {
    expect(
      panTriangleCameraByPixels(
        {
          baseHeight: 20,
          baseWidth: 40,
          centerX: 10,
          centerY: 20,
          zoom: 2,
        },
        { dx: 50, dy: -25 },
        { width: 200, height: 100 },
      ),
    ).toEqual({
      baseHeight: 20,
      baseWidth: 40,
      centerX: 5,
      centerY: 22.5,
      zoom: 2,
    });
  });

  it('zooms around the anchor point without moving that world coordinate', () => {
    expect(
      zoomTriangleCamera(
        {
          baseHeight: 20,
          baseWidth: 20,
          centerX: 10,
          centerY: 10,
          zoom: 1,
        },
        2,
        { x: 5, y: 15 },
      ),
    ).toEqual({
      baseHeight: 20,
      baseWidth: 20,
      centerX: 7.5,
      centerY: 12.5,
      zoom: 2,
    });
  });

  it('allows deeper zoom-in before clamping at the maximum zoom level', () => {
    expect(
      zoomTriangleCamera(
        {
          baseHeight: 20,
          baseWidth: 20,
          centerX: 10,
          centerY: 10,
          zoom: 99999,
        },
        2,
        { x: 10, y: 10 },
      ).zoom,
    ).toBe(100000);
  });
});
