export interface TriangleModelVertex {
  id: number;
  hCoor: number;
  vCoor: number;
  attributes: number[];
  boundary_marker: number | null;
}

export interface TriangleModelSegment {
  id: number;
  endpoint_1: number;
  endpoint_2: number;
  boundary_marker: number | null;
}

export interface TriangleModelHole {
  id: number;
  hCoor: number;
  vCoor: number;
}

export interface TriangleModelRegion {
  id: number;
  hCoor: number;
  vCoor: number;
  attribute: number | null;
  max_area: number | null;
}

export interface TriangleModelResistivity {
  metadata: Record<string, string | number | boolean | null>;
  table: Record<string, string | number | boolean | null>[];
}

export interface TriangleConstrainedMeshVertex {
  id: number;
  x: number;
  y: number;
}

export interface TriangleRegionResistivity {
  regionId: number;
  rho: number;
}

export interface TriangleConstrainedMesh {
  vertices: TriangleConstrainedMeshVertex[];
  triangles: [number, number, number][];
  triangleRegionIds: Array<number | null>;
  triangleResistivityValues: Array<number | null>;
  regionResistivity: TriangleRegionResistivity[];
}

export interface TriangleModelResponse {
  polyFileName: string;
  resistivityFileName: string | null;
  vertices: TriangleModelVertex[];
  segments: TriangleModelSegment[];
  holes: TriangleModelHole[];
  regions: TriangleModelRegion[];
  resistivity: TriangleModelResistivity | null;
  constrainedMesh: TriangleConstrainedMesh | null;
}

export interface TriangleMeshPoint {
  id: number;
  x: number;
  y: number;
}

export interface TriangleMeshBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface TriangleViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TriangleCameraState {
  centerX: number;
  centerY: number;
  baseWidth: number;
  baseHeight: number;
  zoom: number;
}

export interface TriangleLayerVisibility {
  triangles: boolean;
  segments: boolean;
  vertices: boolean;
}

export interface TriangleHoverState {
  point: {
    x: number;
    y: number;
  } | null;
  triangleIndex: number | null;
  regionId: number | null;
  resistivityValue: number | null;
  vertex: TriangleMeshPoint | null;
  segment: TriangleModelSegment | null;
}

export interface TriangleMesh {
  points: TriangleMeshPoint[];
  triangles: [number, number, number][];
  bounds: TriangleMeshBounds;
  source: 'constrained' | 'derived';
  triangleRegionIds?: Array<number | null>;
  triangleResistivityValues?: Array<number | null>;
}
