import { describe, expect, it } from 'vitest';

import {
  buildLassoSelectionExport,
  getLassoSelectionExportFileName,
} from './triangleLassoExport';
import type { TriangleMesh } from '@/types';

function buildMesh(): TriangleMesh {
  return {
    points: [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 1, y: 0 },
      { id: 2, x: 0, y: 1 },
      { id: 3, x: 1, y: 1 },
    ],
    triangles: [
      [0, 1, 2],
      [1, 3, 2],
    ],
    bounds: {
      minX: 0,
      maxX: 1,
      minY: 0,
      maxY: 1,
      width: 1,
      height: 1,
    },
    source: 'constrained',
    triangleRegionIds: [10, 20],
    triangleResistivityValues: [10, 100],
  };
}

function buildExportOptions() {
  return {
    mesh: buildMesh(),
    lassoPath: [
      { x: -0.1, y: -0.1 },
      { x: 0.6, y: -0.1 },
      { x: 0.6, y: 0.6 },
    ],
    selection: {
      featherTriangleIndices: [1],
      regionWeights: new Map([
        [10, 1],
        [20, 0.5],
      ]),
      selectedRegionIds: new Set([10]),
      selectedTriangleIndices: [0],
    },
    regionRhoById: new Map([
      [10, 1000],
      [20, 100],
    ]),
    baseRegionRhoById: new Map([
      [10, 10],
      [20, 100],
    ]),
    polyFileName: 'editable.poly',
    resistivityFileName: 'editable.resistivity',
    colorRange: { min: 0.3, max: 1000 },
    exportedAt: '2026-07-08T00:00:00.000Z',
  };
}

describe('buildLassoSelectionExport', () => {
  it('builds a self-contained payload with metadata, selection, and mesh geometry', () => {
    const payload = buildLassoSelectionExport(buildExportOptions());

    expect(payload.schema).toBe('csem-insight/lasso-selection');
    expect(payload.version).toBe(1);
    expect(payload.metadata).toEqual({
      exportedAt: '2026-07-08T00:00:00.000Z',
      polyFileName: 'editable.poly',
      resistivityFileName: 'editable.resistivity',
      units: 'km',
      yAxis: 'depth-positive-down',
      colorRange: { min: 0.3, max: 1000 },
    });
    expect(payload.lassoPath).toEqual([
      { x: -0.1, y: -0.1 },
      { x: 0.6, y: -0.1 },
      { x: 0.6, y: 0.6 },
    ]);
    expect(payload.selection).toEqual({
      selectedRegionIds: [10],
      selectedTriangleIndices: [0],
      featherTriangleIndices: [1],
      regionWeights: { '10': 1, '20': 0.5 },
    });
    expect(payload.mesh.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(payload.mesh.triangles).toEqual([
      [0, 1, 2],
      [1, 3, 2],
    ]);
    expect(payload.mesh.triangleRegionIds).toEqual([10, 20]);
  });

  it('derives triangle resistivity values from the current region rho map', () => {
    const payload = buildLassoSelectionExport(buildExportOptions());

    expect(payload.mesh.triangleResistivityValues).toEqual([1000, 100]);
    expect(payload.regionRho).toEqual({ '10': 1000, '20': 100 });
    expect(payload.baseRegionRho).toEqual({ '10': 10, '20': 100 });
  });

  it('sorts selected region ids and handles missing optional metadata', () => {
    const options = buildExportOptions();
    options.selection.selectedRegionIds = new Set([20, 10]);
    const payload = buildLassoSelectionExport({
      ...options,
      polyFileName: null,
      resistivityFileName: null,
      colorRange: null,
    });

    expect(payload.selection.selectedRegionIds).toEqual([10, 20]);
    expect(payload.metadata.polyFileName).toBeNull();
    expect(payload.metadata.resistivityFileName).toBeNull();
    expect(payload.metadata.colorRange).toBeNull();
  });

  it('maps triangles without a region id to null resistivity', () => {
    const options = buildExportOptions();
    options.mesh.triangleRegionIds = [10, null];
    const payload = buildLassoSelectionExport(options);

    expect(payload.mesh.triangleResistivityValues).toEqual([1000, null]);
  });
});

describe('getLassoSelectionExportFileName', () => {
  it('derives the export name from the poly file name', () => {
    expect(getLassoSelectionExportFileName('editable.poly')).toBe(
      'editable.lasso-selection.json',
    );
  });

  it('falls back to a generic name without a poly file', () => {
    expect(getLassoSelectionExportFileName(null)).toBe(
      'triangle-model.lasso-selection.json',
    );
  });
});
