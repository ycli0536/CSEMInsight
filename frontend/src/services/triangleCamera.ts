import * as THREE from 'three';

import type { TriangleCameraState, TriangleMeshBounds } from '@/types';

const MODEL_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const SCREEN_POINT = new THREE.Vector2();
const INTERSECTION_POINT = new THREE.Vector3();
const PROJECT_RAYCASTER = new THREE.Raycaster();

function getPaddedBounds(bounds: TriangleMeshBounds) {
  const paddingX = bounds.width === 0 ? 1 : bounds.width * 0.05;
  const paddingY = bounds.height === 0 ? 1 : bounds.height * 0.05;

  return {
    width: Math.max(bounds.width + paddingX * 2, 1),
    height: Math.max(bounds.height + paddingY * 2, 1),
  };
}

export function createTriangleCameraState(
  bounds: TriangleMeshBounds,
  viewport: { width: number; height: number },
): TriangleCameraState {
  const safeViewportWidth = Math.max(viewport.width, 1);
  const safeViewportHeight = Math.max(viewport.height, 1);
  const aspect = safeViewportWidth / safeViewportHeight;
  const padded = getPaddedBounds(bounds);
  const paddedAspect = padded.width / padded.height;

  if (paddedAspect > aspect) {
    return {
      centerX: (bounds.minX + bounds.maxX) / 2,
      centerY: (bounds.minY + bounds.maxY) / 2,
      baseWidth: padded.width,
      baseHeight: padded.width / aspect,
      zoom: 1,
    };
  }

  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    baseWidth: padded.height * aspect,
    baseHeight: padded.height,
    zoom: 1,
  };
}

export function getTriangleCameraWorldSize(state: TriangleCameraState) {
  return {
    width: state.baseWidth / state.zoom,
    height: state.baseHeight / state.zoom,
  };
}

export function screenPointToWorld(
  point: { x: number; y: number },
  viewport: { width: number; height: number },
  state: TriangleCameraState,
) {
  const safeViewportWidth = Math.max(viewport.width, 1);
  const safeViewportHeight = Math.max(viewport.height, 1);
  const visibleSize = getTriangleCameraWorldSize(state);
  const left = state.centerX - visibleSize.width / 2;
  const top = state.centerY + visibleSize.height / 2;

  return {
    x: left + (point.x / safeViewportWidth) * visibleSize.width,
    y: top - (point.y / safeViewportHeight) * visibleSize.height,
  };
}

export function projectScreenPointToWorldWithCamera(
  point: { x: number; y: number },
  viewport: { width: number; height: number },
  camera: THREE.Camera,
) {
  const safeViewportWidth = Math.max(viewport.width, 1);
  const safeViewportHeight = Math.max(viewport.height, 1);
  SCREEN_POINT.set(
    (point.x / safeViewportWidth) * 2 - 1,
    -(point.y / safeViewportHeight) * 2 + 1,
  );
  PROJECT_RAYCASTER.setFromCamera(SCREEN_POINT, camera);
  const hit = PROJECT_RAYCASTER.ray.intersectPlane(MODEL_PLANE, INTERSECTION_POINT);

  if (!hit) {
    return null;
  }

  return {
    x: hit.x,
    y: hit.y,
  };
}

export function panTriangleCameraByPixels(
  state: TriangleCameraState,
  delta: { dx: number; dy: number },
  viewport: { width: number; height: number },
): TriangleCameraState {
  const safeViewportWidth = Math.max(viewport.width, 1);
  const safeViewportHeight = Math.max(viewport.height, 1);
  const visibleSize = getTriangleCameraWorldSize(state);

  return {
    ...state,
    centerX: state.centerX + (delta.dx / safeViewportWidth) * visibleSize.width,
    centerY: state.centerY - (delta.dy / safeViewportHeight) * visibleSize.height,
  };
}

export function zoomTriangleCamera(
  state: TriangleCameraState,
  factor: number,
  anchor: { x: number; y: number },
  limits: { minZoom?: number; maxZoom?: number } = {},
): TriangleCameraState {
  const minZoom = limits.minZoom ?? 0.5;
  const maxZoom = limits.maxZoom ?? 100000;
  const nextZoom = Math.min(Math.max(state.zoom * factor, minZoom), maxZoom);

  if (nextZoom === state.zoom) {
    return state;
  }

  const currentSize = getTriangleCameraWorldSize(state);
  const nextSize = {
    width: state.baseWidth / nextZoom,
    height: state.baseHeight / nextZoom,
  };
  const left = state.centerX - currentSize.width / 2;
  const top = state.centerY + currentSize.height / 2;
  const ratioX = (anchor.x - left) / currentSize.width;
  const ratioY = (top - anchor.y) / currentSize.height;
  const nextLeft = anchor.x - nextSize.width * ratioX;
  const nextTop = anchor.y + nextSize.height * ratioY;

  return {
    ...state,
    centerX: nextLeft + nextSize.width / 2,
    centerY: nextTop - nextSize.height / 2,
    zoom: nextZoom,
  };
}
