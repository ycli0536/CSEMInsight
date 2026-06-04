import { describe, expect, it } from 'vitest';

import { buildTriangleMesh, buildTriangleMeshFromModel } from './triangleModelMesh';

describe('triangleModelMesh', () => {
  it('builds delaunay triangles from parsed vertices', () => {
    const mesh = buildTriangleMesh([
      { id: 1, hCoor: 0, vCoor: 0, attributes: [], boundary_marker: null },
      { id: 2, hCoor: 1, vCoor: 0, attributes: [], boundary_marker: null },
      { id: 3, hCoor: 0, vCoor: 1, attributes: [], boundary_marker: null },
      { id: 4, hCoor: 1, vCoor: 1, attributes: [], boundary_marker: null },
    ]);

    expect(mesh.points).toHaveLength(4);
    expect(mesh.bounds).toEqual({
      minX: 0,
      maxX: 1,
      minY: 0,
      maxY: 1,
      width: 1,
      height: 1,
    });
    expect(mesh.triangles.length).toBeGreaterThanOrEqual(2);
    expect(mesh.triangles[0]).toHaveLength(3);
  });

  it('prefers constrained mesh data from the backend response when available', () => {
    const mesh = buildTriangleMeshFromModel({
      polyFileName: 'simple.poly',
      resistivityFileName: 'simple.resistivity',
      vertices: [
        { id: 1, hCoor: 0, vCoor: 0, attributes: [], boundary_marker: null },
        { id: 2, hCoor: 1, vCoor: 0, attributes: [], boundary_marker: null },
      ],
      segments: [],
      holes: [],
      regions: [],
      resistivity: null,
      constrainedMesh: {
        vertices: [
          { id: 0, x: 0, y: 0 },
          { id: 1, x: 2, y: 0 },
          { id: 2, x: 0, y: 1 },
        ],
        triangles: [[0, 1, 2]],
        triangleRegionIds: [7],
        triangleResistivityValues: [100],
        regionResistivity: [{ regionId: 7, rho: 100 }],
      },
    });

    expect(mesh.source).toBe('constrained');
    expect(mesh.points).toEqual([
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 2, y: 0 },
      { id: 2, x: 0, y: 1 },
    ]);
    expect(mesh.triangleRegionIds).toEqual([7]);
    expect(mesh.triangleResistivityValues).toEqual([100]);
  });
});
