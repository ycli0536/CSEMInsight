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

/** Units an interface file's two columns are written in. */
export type PenaltyCutUnits = 'm' | 'km';

/**
 * Boundary marker for the inserted segments. Negative makes MARE2DEM treat the
 * segment as a penalty cut; the magnitude decides whether mesh coarsening may
 * drop it (`abs(marker) < 2` is kept, see `mare2dem_worker.f90:682`).
 */
export type PenaltyCutMarker = -1 | -2;

export interface PenaltyCutParameters {
  units: PenaltyCutUnits;
  marker: PenaltyCutMarker;
  /** Resistivity for regions the merge creates that match nothing in the source. */
  defaultRho: number;
}

export interface PenaltyCutParseResponse {
  /** Interface points as `[y, z]` pairs, in metres. */
  points: [number, number][];
  bounds: {
    yMin: number;
    yMax: number;
    zMin: number;
    zMax: number;
  };
  warnings: string[];
  cutFileName: string;
}

export interface PenaltyCutStats {
  interfacePointCount: number;
  sourceSegmentCount: number;
  mergedSegmentCount: number;
  sourceRegionCount: number;
  mergedRegionCount: number;
  cutSegmentsBefore: number;
  cutSegmentsAfter: number;
  cutSegmentsAdded: number;
  inheritedRegionCount: number;
  unmatchedRegionCount: number;
  fixedRegionCount: number;
  freeParameterCount: number;
}

/**
 * The merged model, in the same shape `/api/upload-triangle-model` returns so
 * the viewer can swap it in without a special case, plus the text of both
 * output files and what changed.
 */
export interface PenaltyCutApplyResponse extends TriangleModelResponse {
  polyText: string;
  // A model can be uploaded without a .resistivity, but a cut cannot be
  // applied without one -- region values and which regions stay fixed are
  // inherited from it -- so the merged model always names one.
  resistivityFileName: string;
  resistivityText: string;
  stats: PenaltyCutStats;
  warnings: string[];
}

/**
 * Bounding a model's resistivity over part of the section.
 *
 * Independent of the penalty cut: MARE2DEM reads a `Lower`/`Upper` pair per
 * region and a pair of zeros means "use Global Bounds", so this rewrites two
 * columns of the `.resistivity` and touches no geometry at all.
 */
export type RhoBoundShape = 'boundary' | 'polygon';

/** Which side of a boundary the bounds apply to. Depth is positive down. */
export type RhoBoundSide = 'below' | 'above';

export interface RhoBoundParameters {
  shape: RhoBoundShape;
  units: PenaltyCutUnits;
  side: RhoBoundSide;
  lower: number;
  upper: number;
  /** Anisotropy qualifier to restrict the update to, e.g. `z`. */
  component?: string;
  /** Shape vertices as `[y, z]`, for a shape that has no file behind it. */
  points?: [number, number][];
}

export interface RhoBoundStats {
  shapePointCount: number;
  selectedRegionCount: number;
  totalRegionCount: number;
  /** Regions off the ends of a boundary, which is never extrapolated. */
  outsideShapeSpanCount: number;
  updatedRowCount?: number;
  boundColumns?: string[];
  lower?: number;
  upper?: number;
}

export interface RhoBoundPreviewResponse {
  shape: RhoBoundShape;
  side: RhoBoundSide;
  /** Shape vertices as `[y, z]` pairs, in metres. */
  points: [number, number][];
  selectedRegionIds: number[];
  stats: RhoBoundStats;
  warnings: string[];
}

export interface RhoBoundApplyResponse extends RhoBoundPreviewResponse {
  resistivityFileName: string;
  resistivityText: string;
}
