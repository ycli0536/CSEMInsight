import Delaunator from 'delaunator';

import type {
  TriangleConstrainedMesh,
  TriangleMesh,
  TriangleMeshPoint,
  TriangleModelResponse,
  TriangleModelVertex,
} from '@/types';

function getBounds(points: Array<{ x: number; y: number }>) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function buildTriangleMeshBounds(points: TriangleMeshPoint[]) {
  return getBounds(points);
}

export function buildTriangleMeshFromConstrainedMesh(
  constrainedMesh: TriangleConstrainedMesh,
): TriangleMesh {
  const points = constrainedMesh.vertices.map((vertex) => ({
    id: vertex.id,
    x: vertex.x,
    y: vertex.y,
  }));

  return {
    points,
    triangles: constrainedMesh.triangles,
    bounds: buildTriangleMeshBounds(points),
    source: 'constrained',
    triangleRegionIds: constrainedMesh.triangleRegionIds,
    triangleResistivityValues: constrainedMesh.triangleResistivityValues,
  };
}

export function buildTriangleMesh(vertices: TriangleModelVertex[]): TriangleMesh {
  if (vertices.length === 0) {
    return {
      points: [],
      triangles: [],
      bounds: {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
        width: 0,
        height: 0,
      },
      source: 'derived',
    };
  }

  const points = vertices.map((vertex) => ({
    id: vertex.id,
    x: vertex.hCoor,
    y: vertex.vCoor,
  }));

  const delaunay = Delaunator.from(vertices, (vertex) => vertex.hCoor, (vertex) => vertex.vCoor);
  const triangles: [number, number, number][] = [];

  for (let index = 0; index < delaunay.triangles.length; index += 3) {
    triangles.push([
      delaunay.triangles[index],
      delaunay.triangles[index + 1],
      delaunay.triangles[index + 2],
    ]);
  }

  return {
    points,
    triangles,
    bounds: buildTriangleMeshBounds(points),
    source: 'derived',
  };
}

export function buildTriangleMeshFromModel(model: TriangleModelResponse): TriangleMesh {
  if (model.constrainedMesh) {
    return buildTriangleMeshFromConstrainedMesh(model.constrainedMesh);
  }

  return buildTriangleMesh(model.vertices);
}
