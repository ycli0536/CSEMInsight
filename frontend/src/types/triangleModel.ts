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

/** Isotropic files expose `rho`; anisotropic (tiz) ones expose `rhoZ` and `rhoH`. */
export type TriangleResistivityComponentKey = 'rho' | 'rhoZ' | 'rhoH';

/** Derived view showing Rho-z / Rho-h rather than a single component. */
export type TriangleResistivityViewKey =
  | TriangleResistivityComponentKey
  | 'anisotropyRatio';

export interface TriangleResistivityComponent {
  key: TriangleResistivityComponentKey;
  /** Column name as spelled in the .resistivity file, e.g. "Rho-z". */
  label: string;
  column: string;
}

export interface TriangleRegionResistivity {
  regionId: number;
  /** Value of the first rho column; mirrors one of the component fields below. */
  rho: number;
  rhoZ?: number;
  rhoH?: number;
}

export interface TriangleConstrainedMesh {
  vertices: TriangleConstrainedMeshVertex[];
  triangles: [number, number, number][];
  triangleRegionIds: Array<number | null>;
  triangleResistivityValues: Array<number | null>;
  regionResistivity: TriangleRegionResistivity[];
  resistivityComponents?: TriangleResistivityComponent[];
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

export interface TriangleResegmentationRoi {
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export interface TriangleResegmentationParameters {
  roi: TriangleResegmentationRoi;
  rhoLevels: number[];
  onlyFreeParameters: boolean;
  boundaryTolerance: number;
  minimumRegionArea: number;
}

export interface TriangleResegmentationStats {
  sourceTriangleCount: number;
  activeTriangleCount: number;
  outputVertexCount: number;
  outputSegmentCount: number;
  outputRegionCount: number;
  mergedComponentCount: number;
}

export interface TriangleResegmentationPreviewResponse {
  previewMesh: TriangleConstrainedMesh;
  stats: TriangleResegmentationStats;
  warnings: string[];
}

export interface TriangleResegmentationExportResponse
  extends TriangleResegmentationPreviewResponse {
  polyFileName: string;
  polyText: string;
  resistivityFileName: string;
  resistivityText: string;
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
