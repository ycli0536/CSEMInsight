import { deriveTriangleResistivityValues } from './triangleRegionEditing';
import type { TriangleMesh } from '@/types';
import type { TriangleModelPoint2D } from './triangleRegionSelection';
import type { TriangleResistivityColorRange } from './triangleModelColorScale';

export interface TriangleLassoSelectionSnapshot {
  featherTriangleIndices: number[];
  regionWeights: Map<number, number>;
  selectedRegionIds: Set<number>;
  selectedTriangleIndices: number[];
}

export interface TriangleLassoSelectionExport {
  schema: 'csem-insight/lasso-selection';
  version: 1;
  metadata: {
    exportedAt: string;
    polyFileName: string | null;
    resistivityFileName: string | null;
    units: 'km';
    yAxis: 'depth-positive-down';
    colorRange: TriangleResistivityColorRange | null;
  };
  lassoPath: TriangleModelPoint2D[];
  selection: {
    selectedRegionIds: number[];
    selectedTriangleIndices: number[];
    featherTriangleIndices: number[];
    regionWeights: Record<string, number>;
  };
  mesh: {
    points: TriangleModelPoint2D[];
    triangles: [number, number, number][];
    triangleRegionIds: Array<number | null>;
    triangleResistivityValues: Array<number | null>;
  };
  regionRho: Record<string, number>;
  baseRegionRho: Record<string, number>;
}

export interface BuildLassoSelectionExportOptions {
  mesh: TriangleMesh;
  lassoPath: TriangleModelPoint2D[];
  selection: TriangleLassoSelectionSnapshot;
  regionRhoById: Map<number, number>;
  baseRegionRhoById: Map<number, number>;
  polyFileName: string | null;
  resistivityFileName: string | null;
  colorRange: TriangleResistivityColorRange | null;
  exportedAt?: string;
}

function mapToRecord(source: Map<number, number>): Record<string, number> {
  const record: Record<string, number> = {};
  source.forEach((value, key) => {
    record[String(key)] = value;
  });
  return record;
}

export function buildLassoSelectionExport(
  options: BuildLassoSelectionExportOptions,
): TriangleLassoSelectionExport {
  const {
    mesh,
    lassoPath,
    selection,
    regionRhoById,
    baseRegionRhoById,
    polyFileName,
    resistivityFileName,
    colorRange,
    exportedAt = new Date().toISOString(),
  } = options;

  return {
    schema: 'csem-insight/lasso-selection',
    version: 1,
    metadata: {
      exportedAt,
      polyFileName,
      resistivityFileName,
      units: 'km',
      yAxis: 'depth-positive-down',
      colorRange,
    },
    lassoPath: lassoPath.map((point) => ({ x: point.x, y: point.y })),
    selection: {
      selectedRegionIds: Array.from(selection.selectedRegionIds).sort(
        (first, second) => first - second,
      ),
      selectedTriangleIndices: [...selection.selectedTriangleIndices],
      featherTriangleIndices: [...selection.featherTriangleIndices],
      regionWeights: mapToRecord(selection.regionWeights),
    },
    mesh: {
      points: mesh.points.map((point) => ({ x: point.x, y: point.y })),
      triangles: mesh.triangles.map(
        (triangle) => [...triangle] as [number, number, number],
      ),
      triangleRegionIds: [...(mesh.triangleRegionIds ?? mesh.triangles.map(() => null))],
      triangleResistivityValues: deriveTriangleResistivityValues({
        mesh,
        rhoByRegion: regionRhoById,
      }),
    },
    regionRho: mapToRecord(regionRhoById),
    baseRegionRho: mapToRecord(baseRegionRhoById),
  };
}

export function getLassoSelectionExportFileName(polyFileName: string | null) {
  if (!polyFileName) {
    return 'triangle-model.lasso-selection.json';
  }

  const baseName = polyFileName.endsWith('.poly')
    ? polyFileName.slice(0, -'.poly'.length)
    : polyFileName;

  return `${baseName}.lasso-selection.json`;
}
