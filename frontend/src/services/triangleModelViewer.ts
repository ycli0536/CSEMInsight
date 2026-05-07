import * as THREE from 'three';

import {
  createTriangleCameraState,
  getTriangleCameraWorldSize,
  panTriangleCameraByPixels,
  projectScreenPointToWorldWithCamera,
  zoomTriangleCamera,
} from '@/services/triangleCamera';
import {
  buildTriangleRegionHighlightPositions,
  buildTriangleSceneBuffers,
  buildTriangleSelectionHighlightPositions,
  buildTriangleSegmentPositions,
} from '@/services/triangleSceneBuffers';
import { buildTriangleFillColors } from '@/services/triangleModelColorScale';
import { findNearestSegment, findNearestVertex } from '@/services/triangleViewport';
import type {
  TriangleCameraState,
  TriangleHoverState,
  TriangleLayerVisibility,
  TriangleMesh,
  TriangleMeshBounds,
  TriangleMeshPoint,
  TriangleModelResponse,
} from '@/types';

const CAMERA_Z = 10;
const MAX_PIXEL_RATIO = 2;

export type TriangleViewerInteractionMode = 'pan' | 'lasso';

export interface TriangleSelectionOverlay {
  featherTriangleIndices?: number[];
  selectedTriangleIndices: number[];
}

export function shouldStartLassoDrag(options: {
  hasMesh: boolean;
  interactionMode: TriangleViewerInteractionMode;
}) {
  return options.hasMesh && options.interactionMode === 'lasso';
}

function getScaledBounds(bounds: TriangleMeshBounds, ve: number): TriangleMeshBounds {
  return {
    minX: bounds.minX,
    maxX: bounds.maxX,
    minY: bounds.minY * ve,
    maxY: bounds.maxY * ve,
    width: bounds.width,
    height: bounds.height * ve,
  };
}

function getCanvasSize(canvas: HTMLCanvasElement) {
  return {
    width: Math.max(canvas.clientWidth || canvas.width || 1, 1),
    height: Math.max(canvas.clientHeight || canvas.height || 1, 1),
  };
}

function applyTriangleCamera(
  camera: THREE.OrthographicCamera,
  state: TriangleCameraState,
) {
  camera.left = -state.baseWidth / 2;
  camera.right = state.baseWidth / 2;
  camera.top = -state.baseHeight / 2;
  camera.bottom = state.baseHeight / 2;
  camera.zoom = state.zoom;
  camera.position.set(state.centerX, state.centerY, CAMERA_Z);
  camera.up.set(0, 1, 0);
  camera.lookAt(state.centerX, state.centerY, 0);
  camera.updateProjectionMatrix();
}

function updatePositionGeometry(
  geometry: THREE.BufferGeometry,
  positions: Float32Array,
) {
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
}

function updateLineHighlight(
  geometry: THREE.BufferGeometry,
  start: TriangleMeshPoint,
  end: TriangleMeshPoint,
) {
  updatePositionGeometry(
    geometry,
    new Float32Array([start.x, start.y, 0, end.x, end.y, 0]),
  );
}

function updatePointHighlight(geometry: THREE.BufferGeometry, point: TriangleMeshPoint) {
  updatePositionGeometry(geometry, new Float32Array([point.x, point.y, 0]));
}

function updateTriangleHighlight(geometry: THREE.BufferGeometry, positions: Float32Array) {
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3),
  );
  geometry.setIndex(null);
  geometry.computeBoundingSphere();
}

export interface TriangleRegionHoverHit {
  triangleIndex: number;
  regionId: number | null;
  resistivityValue: number | null;
}

export function buildTriangleHoverState(options: {
  point: TriangleHoverState['point'];
  regionHit: TriangleRegionHoverHit | null;
  vertex: TriangleMeshPoint | null;
  segment: TriangleModelSegment | null;
}): TriangleHoverState {
  const { point, regionHit, vertex, segment } = options;

  if (!point) {
    return {
      point: null,
      triangleIndex: null,
      regionId: null,
      resistivityValue: null,
      vertex: null,
      segment: null,
    };
  }

  return {
    point,
    triangleIndex: regionHit?.triangleIndex ?? null,
    regionId: regionHit?.regionId ?? null,
    resistivityValue: regionHit?.resistivityValue ?? null,
    vertex,
    segment,
  };
}

export interface TriangleModelViewer {
  dispose(): void;
  resetView(): void;
  resize(): void;
  setData(data: { mesh: TriangleMesh; model: TriangleModelResponse }): void;
  setInteractionMode(mode: TriangleViewerInteractionMode): void;
  setLayerVisibility(visibility: TriangleLayerVisibility): void;
  setSelectionOverlay(selection: TriangleSelectionOverlay | null): void;
  setTriangleResistivityValues(values: Array<number | null>): void;
  setVerticalExaggeration(factor: number): void;
}

export interface TriangleViewportView {
  cameraState: TriangleCameraState;
  canvasSize: {
    height: number;
    width: number;
  };
}

export function createTriangleModelViewer(options: {
  canvas: HTMLCanvasElement;
  interactionTarget?: HTMLElement;
  onHoverChange: (hover: TriangleHoverState) => void;
  onLassoComplete?: (path: Array<{ x: number; y: number }>) => void;
  onLassoPreviewChange?: (path: Array<{ x: number; y: number }> | null) => void;
  onViewChange?: (view: TriangleViewportView) => void;
}): TriangleModelViewer {
  const {
    canvas,
    interactionTarget = canvas,
    onHoverChange,
    onLassoComplete,
    onLassoPreviewChange,
    onViewChange,
  } = options;
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
  });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8fafc);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const raycaster = new THREE.Raycaster();

  const rootGroup = new THREE.Group();
  scene.add(rootGroup);

  const triangleGroup = new THREE.Group();
  const triangleFillGeometry = new THREE.BufferGeometry();
  const triangleFillMaterial = new THREE.MeshBasicMaterial({
    depthWrite: false,
    opacity: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    side: THREE.DoubleSide,
    transparent: true,
    vertexColors: true,
  });
  const triangleFillMesh = new THREE.Mesh(triangleFillGeometry, triangleFillMaterial);
  triangleFillMesh.renderOrder = 1;

  const triangleEdgeGeometry = new THREE.BufferGeometry();
  const triangleEdgeMaterial = new THREE.LineBasicMaterial({
    color: 0x0284c7,
    opacity: 0.48,
    transparent: true,
  });
  const triangleEdges = new THREE.LineSegments(triangleEdgeGeometry, triangleEdgeMaterial);
  triangleEdges.renderOrder = 2;

  triangleGroup.add(triangleFillMesh);
  triangleGroup.add(triangleEdges);
  rootGroup.add(triangleGroup);

  const segmentGeometry = new THREE.BufferGeometry();
  const segmentMaterial = new THREE.LineBasicMaterial({
    color: 0x000000,
    opacity: 0.95,
    transparent: true,
  });
  const segmentLines = new THREE.LineSegments(segmentGeometry, segmentMaterial);
  segmentLines.renderOrder = 3;
  rootGroup.add(segmentLines);

  const pointGeometry = new THREE.BufferGeometry();
  const pointMaterial = new THREE.PointsMaterial({
    color: 0x0f172a,
    size: 5,
    sizeAttenuation: false,
  });
  const points = new THREE.Points(pointGeometry, pointMaterial);
  points.renderOrder = 4;
  rootGroup.add(points);

  const hoverTriangleGeometry = new THREE.BufferGeometry();
  const hoverTriangleMaterial = new THREE.MeshBasicMaterial({
    color: 0x2563eb,
    depthWrite: false,
    opacity: 0.2,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const hoverTriangle = new THREE.Mesh(hoverTriangleGeometry, hoverTriangleMaterial);
  hoverTriangle.visible = false;
  hoverTriangle.renderOrder = 5;
  rootGroup.add(hoverTriangle);

  const hoverSegmentGeometry = new THREE.BufferGeometry();
  const hoverSegmentMaterial = new THREE.LineBasicMaterial({
    color: 0x000000,
    opacity: 0.96,
    transparent: true,
  });
  const hoverSegment = new THREE.LineSegments(
    hoverSegmentGeometry,
    hoverSegmentMaterial,
  );
  hoverSegment.visible = false;
  hoverSegment.renderOrder = 6;
  rootGroup.add(hoverSegment);

  const hoverPointGeometry = new THREE.BufferGeometry();
  const hoverPointMaterial = new THREE.PointsMaterial({
    color: 0x000000,
    size: 8,
    sizeAttenuation: false,
  });
  const hoverPoint = new THREE.Points(hoverPointGeometry, hoverPointMaterial);
  hoverPoint.visible = false;
  hoverPoint.renderOrder = 7;
  rootGroup.add(hoverPoint);

  const selectionGeometry = new THREE.BufferGeometry();
  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0x0284c7,
    depthWrite: false,
    opacity: 0.28,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const selectionOverlay = new THREE.Mesh(selectionGeometry, selectionMaterial);
  selectionOverlay.visible = false;
  selectionOverlay.renderOrder = 8;
  rootGroup.add(selectionOverlay);

  const featherGeometry = new THREE.BufferGeometry();
  const featherMaterial = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    depthWrite: false,
    opacity: 0.14,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const featherOverlay = new THREE.Mesh(featherGeometry, featherMaterial);
  featherOverlay.visible = false;
  featherOverlay.renderOrder = 9;
  rootGroup.add(featherOverlay);

  const lassoGeometry = new THREE.BufferGeometry();
  const lassoMaterial = new THREE.LineBasicMaterial({
    color: 0xf97316,
    opacity: 0.92,
    transparent: true,
  });
  const lassoLine = new THREE.Line(lassoGeometry, lassoMaterial);
  lassoLine.visible = false;
  lassoLine.renderOrder = 10;
  rootGroup.add(lassoLine);

  let canvasSize = getCanvasSize(canvas);
  let cameraState: TriangleCameraState = {
    baseHeight: 2,
    baseWidth: 2,
    centerX: 0,
    centerY: 0,
    zoom: 1,
  };
  let mesh: TriangleMesh | null = null;
  let model: TriangleModelResponse | null = null;
  let interactionMode: TriangleViewerInteractionMode = 'pan';
  let verticalExaggeration = 1;
  let initialCameraState: TriangleCameraState | null = null;
  let dragState:
    | {
        lastX: number;
        lastY: number;
        pointerId: number;
      }
    | null = null;
  let lassoState:
    | {
        path: Array<{ x: number; y: number }>;
        pointerId: number;
      }
    | null = null;

  const sourceVertexById = new Map<number, TriangleMeshPoint>();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setSize(canvasSize.width, canvasSize.height, false);
  applyTriangleCamera(camera, cameraState);
  interactionTarget.style.touchAction = 'none';
  interactionTarget.style.cursor = 'grab';

  const renderScene = () => {
    renderer.render(scene, camera);
  };

  const publishView = () => {
    onViewChange?.({
      cameraState: { ...cameraState },
      canvasSize: { ...canvasSize },
    });
  };

  const clearHoverVisuals = () => {
    hoverPoint.visible = false;
    hoverSegment.visible = false;
    hoverTriangle.visible = false;
  };

  const setHoverState = (nextHover: TriangleHoverState) => {
    onHoverChange(nextHover);
  };

  const getRelativePoint = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();

    return {
      rect,
      point: {
        x: clientX - rect.left,
        y: clientY - rect.top,
      },
    };
  };

  const getDataPointFromClient = (clientX: number, clientY: number) => {
    const { rect, point } = getRelativePoint(clientX, clientY);
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const worldPoint = projectScreenPointToWorldWithCamera(point, rect, camera);
    if (!worldPoint) {
      return null;
    }

    return {
      x: worldPoint.x,
      y: worldPoint.y / verticalExaggeration,
    };
  };

  const updateLassoPreview = (path: Array<{ x: number; y: number }>) => {
    onLassoPreviewChange?.(path.length > 0 ? [...path] : null);

    if (path.length < 2) {
      lassoLine.visible = false;
      renderScene();
      return;
    }

    updatePositionGeometry(
      lassoGeometry,
      new Float32Array(path.flatMap((point) => [point.x, point.y, 0.06])),
    );
    lassoLine.visible = true;
    renderScene();
  };

  const clearLassoPreview = () => {
    lassoLine.visible = false;
    onLassoPreviewChange?.(null);
  };

  const updateTriangleColorAttribute = (values: Array<number | null>) => {
    triangleFillGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(buildTriangleFillColors(values), 3),
    );
    triangleFillGeometry.attributes.color.needsUpdate = true;

    const hasResistivityColors =
      mesh?.source === 'constrained' && values.some((value) => value !== null);
    triangleFillMaterial.opacity =
      hasResistivityColors ? 1 : mesh?.source === 'constrained' ? 0.22 : 0.12;
    triangleEdgeMaterial.opacity =
      hasResistivityColors ? 0 : mesh?.source === 'constrained' ? 0.18 : 0.48;
    segmentMaterial.opacity = hasResistivityColors ? 0.72 : 0.95;
  };

  const updateHover = (clientX: number, clientY: number) => {
    if (!mesh || !model) {
      return;
    }

    const { rect, point } = getRelativePoint(clientX, clientY);
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      point.x < 0 ||
      point.x > rect.width ||
      point.y < 0 ||
      point.y > rect.height
    ) {
      clearHoverVisuals();
      setHoverState({
        point: null,
        triangleIndex: null,
        regionId: null,
        resistivityValue: null,
        vertex: null,
        segment: null,
      });
      renderScene();
      return;
    }

    const worldPoint = projectScreenPointToWorldWithCamera(point, rect, camera);
    if (!worldPoint) {
      clearHoverVisuals();
      setHoverState({
        point: null,
        triangleIndex: null,
        regionId: null,
        resistivityValue: null,
        vertex: null,
        segment: null,
      });
      renderScene();
      return;
    }
    const dataPoint = {
      x: worldPoint.x,
      y: worldPoint.y / verticalExaggeration,
    };
    const worldSize = getTriangleCameraWorldSize(cameraState);
    const tolerance = Math.max(worldSize.width, worldSize.height / verticalExaggeration) * 0.02;
    const nearestVertex = findNearestVertex(mesh.points, dataPoint, tolerance);
    const nearestSegment = nearestVertex
      ? null
      : findNearestSegment(model.segments, sourceVertexById, dataPoint, tolerance);
    raycaster.setFromCamera(
      {
        x: (point.x / rect.width) * 2 - 1,
        y: -(point.y / rect.height) * 2 + 1,
      },
      camera,
    );
    const hit = raycaster.intersectObject(triangleFillMesh, false)[0];
    const regionHit: TriangleRegionHoverHit | null =
      hit?.faceIndex !== undefined && mesh.triangles[hit.faceIndex]
        ? {
            triangleIndex: hit.faceIndex,
            regionId: mesh.triangleRegionIds?.[hit.faceIndex] ?? null,
            resistivityValue: mesh.triangleResistivityValues?.[hit.faceIndex] ?? null,
          }
        : null;

    clearHoverVisuals();

    if (nearestVertex) {
      updatePointHighlight(hoverPointGeometry, nearestVertex);
      hoverPoint.visible = true;
      setHoverState(
        buildTriangleHoverState({
          point: dataPoint,
          regionHit,
          vertex: nearestVertex,
          segment: null,
        }),
      );
      renderScene();
      return;
    }

    if (nearestSegment) {
      const start = sourceVertexById.get(nearestSegment.endpoint_1);
      const end = sourceVertexById.get(nearestSegment.endpoint_2);

      if (start && end) {
        updateLineHighlight(hoverSegmentGeometry, start, end);
        hoverSegment.visible = true;
      }

      setHoverState(
        buildTriangleHoverState({
          point: dataPoint,
          regionHit,
          vertex: null,
          segment: nearestSegment,
        }),
      );
      renderScene();
      return;
    }

    if (regionHit) {
      updateTriangleHighlight(
        hoverTriangleGeometry,
        buildTriangleRegionHighlightPositions(mesh, regionHit.triangleIndex),
      );
      hoverTriangle.visible = true;
      setHoverState(
        buildTriangleHoverState({
          point: dataPoint,
          regionHit,
          vertex: null,
          segment: null,
        }),
      );
      renderScene();
      return;
    }

    setHoverState(
      buildTriangleHoverState({
        point: dataPoint,
        regionHit: null,
        vertex: null,
        segment: null,
      }),
    );
    renderScene();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (!mesh) {
      return;
    }

    if (shouldStartLassoDrag({ hasMesh: !!mesh, interactionMode })) {
      const dataPoint = getDataPointFromClient(event.clientX, event.clientY);
      if (!dataPoint) {
        return;
      }

      event.preventDefault();
      lassoState = {
        path: [dataPoint],
        pointerId: event.pointerId,
      };

      if (typeof interactionTarget.setPointerCapture === 'function') {
        interactionTarget.setPointerCapture(event.pointerId);
      }
      interactionTarget.style.cursor = 'crosshair';
      updateLassoPreview(lassoState.path);
      return;
    }

    dragState = {
      lastX: event.clientX,
      lastY: event.clientY,
      pointerId: event.pointerId,
    };

    if (typeof interactionTarget.setPointerCapture === 'function') {
      interactionTarget.setPointerCapture(event.pointerId);
    }
    interactionTarget.style.cursor = 'grabbing';
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!mesh || !model) {
      return;
    }

    if (lassoState && lassoState.pointerId === event.pointerId) {
      const dataPoint = getDataPointFromClient(event.clientX, event.clientY);
      if (!dataPoint) {
        return;
      }

      const lastPoint = lassoState.path[lassoState.path.length - 1];
      if (!lastPoint || Math.hypot(lastPoint.x - dataPoint.x, lastPoint.y - dataPoint.y) > 0) {
        lassoState = {
          ...lassoState,
          path: [...lassoState.path, dataPoint],
        };
        updateLassoPreview(lassoState.path);
      }
      return;
    }

    if (dragState && dragState.pointerId === event.pointerId) {
      const rect = canvas.getBoundingClientRect();
      cameraState = panTriangleCameraByPixels(
        cameraState,
        {
          dx: event.clientX - dragState.lastX,
          dy: event.clientY - dragState.lastY,
        },
        rect,
      );
      dragState = {
        ...dragState,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      applyTriangleCamera(camera, cameraState);
      publishView();
      renderScene();
      return;
    }

    updateHover(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (lassoState && lassoState.pointerId === event.pointerId) {
      const completedPath = lassoState.path;
      lassoState = null;
      clearLassoPreview();

      if (typeof interactionTarget.releasePointerCapture === 'function') {
        try {
          interactionTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Pointer capture is not fully implemented in every test/browser context.
        }
      }

      interactionTarget.style.cursor = interactionMode === 'lasso' ? 'crosshair' : 'grab';
      if (completedPath.length >= 3) {
        onLassoComplete?.(completedPath);
      }
      renderScene();
      return;
    }

    if (dragState && dragState.pointerId === event.pointerId) {
      dragState = null;
      interactionTarget.style.cursor = 'grab';
      if (typeof interactionTarget.releasePointerCapture === 'function') {
        try {
          interactionTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Pointer capture is not fully implemented in every test/browser context.
        }
      }
      updateHover(event.clientX, event.clientY);
    }
  };

  const handlePointerLeave = () => {
    if (dragState || lassoState) {
      return;
    }

    clearHoverVisuals();
    setHoverState({
      point: null,
      triangleIndex: null,
      regionId: null,
      resistivityValue: null,
      vertex: null,
      segment: null,
    });
    renderScene();
  };

  const handleWheel = (event: WheelEvent) => {
    if (!mesh) {
      return;
    }

    event.preventDefault();
    const { rect, point } = getRelativePoint(event.clientX, event.clientY);
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const anchor = projectScreenPointToWorldWithCamera(point, rect, camera);
    if (!anchor) {
      return;
    }
    cameraState = zoomTriangleCamera(
      cameraState,
      event.deltaY < 0 ? 1.12 : 1 / 1.12,
      anchor,
    );
    applyTriangleCamera(camera, cameraState);
    publishView();
    updateHover(event.clientX, event.clientY);
  };

  const handleDoubleClick = () => {
    if (!initialCameraState) {
      return;
    }

    cameraState = { ...initialCameraState };
    applyTriangleCamera(camera, cameraState);
    publishView();
    renderScene();
  };

  interactionTarget.addEventListener('pointerdown', handlePointerDown);
  interactionTarget.addEventListener('pointermove', handlePointerMove);
  interactionTarget.addEventListener('pointerup', handlePointerUp);
  interactionTarget.addEventListener('pointercancel', handlePointerUp);
  interactionTarget.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  interactionTarget.addEventListener('dblclick', handleDoubleClick);

  return {
    dispose() {
      interactionTarget.removeEventListener('pointerdown', handlePointerDown);
      interactionTarget.removeEventListener('pointermove', handlePointerMove);
      interactionTarget.removeEventListener('pointerup', handlePointerUp);
      interactionTarget.removeEventListener('pointercancel', handlePointerUp);
      interactionTarget.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('wheel', handleWheel);
      interactionTarget.removeEventListener('dblclick', handleDoubleClick);

      triangleFillGeometry.dispose();
      triangleFillMaterial.dispose();
      triangleEdgeGeometry.dispose();
      triangleEdgeMaterial.dispose();
      segmentGeometry.dispose();
      segmentMaterial.dispose();
      pointGeometry.dispose();
      pointMaterial.dispose();
      hoverTriangleGeometry.dispose();
      hoverTriangleMaterial.dispose();
      hoverSegmentGeometry.dispose();
      hoverSegmentMaterial.dispose();
      hoverPointGeometry.dispose();
      hoverPointMaterial.dispose();
      selectionGeometry.dispose();
      selectionMaterial.dispose();
      featherGeometry.dispose();
      featherMaterial.dispose();
      lassoGeometry.dispose();
      lassoMaterial.dispose();
      renderer.dispose();
    },
    resetView() {
      if (!initialCameraState) {
        return;
      }

      cameraState = { ...initialCameraState };
      applyTriangleCamera(camera, cameraState);
      publishView();
      renderScene();
    },
    resize() {
      canvasSize = getCanvasSize(canvas);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.setSize(canvasSize.width, canvasSize.height, false);

      if (mesh) {
        const scaledBounds = getScaledBounds(mesh.bounds, verticalExaggeration);
        const fittedState = createTriangleCameraState(scaledBounds, canvasSize);
        cameraState = {
          ...cameraState,
          baseWidth: fittedState.baseWidth,
          baseHeight: fittedState.baseHeight,
        };
        initialCameraState = {
          ...fittedState,
        };
        applyTriangleCamera(camera, cameraState);
      }

      publishView();
      renderScene();
    },
    setData(data) {
      mesh = data.mesh;
      model = data.model;
      sourceVertexById.clear();
      model.vertices.forEach((vertex) => {
        sourceVertexById.set(vertex.id, {
          id: vertex.id,
          x: vertex.hCoor,
          y: vertex.vCoor,
        });
      });

      const buffers = buildTriangleSceneBuffers(mesh);
      const sourcePoints = model.vertices.map((vertex) => ({
        id: vertex.id,
        x: vertex.hCoor,
        y: vertex.vCoor,
      }));

      updatePositionGeometry(triangleFillGeometry, buffers.triangleFillPositions);
      triangleFillGeometry.setAttribute(
        'color',
        new THREE.BufferAttribute(buffers.triangleFillColors, 3),
      );
      triangleFillGeometry.setIndex(null);
      const hasResistivityColors =
        mesh.source === 'constrained' &&
        (mesh.triangleResistivityValues ?? []).some((value) => value !== null);
      triangleFillMaterial.opacity =
        hasResistivityColors ? 1 : mesh.source === 'constrained' ? 0.22 : 0.12;
      triangleEdgeMaterial.opacity =
        hasResistivityColors ? 0 : mesh.source === 'constrained' ? 0.18 : 0.48;
      segmentMaterial.opacity = hasResistivityColors ? 0.72 : 0.95;

      updatePositionGeometry(triangleEdgeGeometry, buffers.triangleEdgePositions);
      updatePositionGeometry(
        segmentGeometry,
        buildTriangleSegmentPositions(sourcePoints, model.segments),
      );
      updatePositionGeometry(pointGeometry, buffers.pointPositions);

      rootGroup.scale.y = verticalExaggeration;
      const scaledBounds = getScaledBounds(mesh.bounds, verticalExaggeration);
      cameraState = createTriangleCameraState(scaledBounds, canvasSize);
      initialCameraState = { ...cameraState };
      applyTriangleCamera(camera, cameraState);
      publishView();
      clearHoverVisuals();
      setHoverState({
        point: null,
        triangleIndex: null,
        regionId: null,
        resistivityValue: null,
        vertex: null,
        segment: null,
      });
      selectionOverlay.visible = false;
      featherOverlay.visible = false;
      clearLassoPreview();
      renderScene();
    },
    setInteractionMode(mode) {
      interactionMode = mode;
      dragState = null;
      lassoState = null;
      clearLassoPreview();
      interactionTarget.style.cursor = mode === 'lasso' ? 'crosshair' : 'grab';
      renderScene();
    },
    setLayerVisibility(visibility) {
      triangleGroup.visible = visibility.triangles;
      segmentLines.visible = visibility.segments;
      points.visible = visibility.vertices;
      renderScene();
    },
    setSelectionOverlay(selection) {
      if (!mesh || !selection) {
        selectionOverlay.visible = false;
        featherOverlay.visible = false;
        renderScene();
        return;
      }

      const selectedPositions = buildTriangleSelectionHighlightPositions(
        mesh,
        selection.selectedTriangleIndices,
      );
      updateTriangleHighlight(selectionGeometry, selectedPositions);
      selectionOverlay.visible = selectedPositions.length > 0;

      const featherPositions = buildTriangleSelectionHighlightPositions(
        mesh,
        selection.featherTriangleIndices ?? [],
      );
      updateTriangleHighlight(featherGeometry, featherPositions);
      featherOverlay.visible = featherPositions.length > 0;
      renderScene();
    },
    setTriangleResistivityValues(values) {
      if (!mesh) {
        return;
      }

      mesh = {
        ...mesh,
        triangleResistivityValues: [...values],
      };
      updateTriangleColorAttribute(values);
      renderScene();
    },
    setVerticalExaggeration(factor) {
      if (!mesh || factor === verticalExaggeration) {
        verticalExaggeration = factor;
        return;
      }

      const ratio = factor / verticalExaggeration;
      verticalExaggeration = factor;
      rootGroup.scale.y = factor;

      cameraState = {
        ...cameraState,
        centerY: cameraState.centerY * ratio,
      };

      const scaledBounds = getScaledBounds(mesh.bounds, factor);
      initialCameraState = createTriangleCameraState(scaledBounds, canvasSize);

      applyTriangleCamera(camera, cameraState);
      publishView();
      renderScene();
    },
  };
}
