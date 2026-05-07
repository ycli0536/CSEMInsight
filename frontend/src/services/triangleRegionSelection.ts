import type { TriangleMesh } from '@/types';

export interface TriangleModelPoint2D {
  x: number;
  y: number;
}

export function getTriangleCentroid(
  mesh: TriangleMesh,
  triangleIndex: number,
): TriangleModelPoint2D | null {
  const triangle = mesh.triangles[triangleIndex];
  if (!triangle) {
    return null;
  }

  const first = mesh.points[triangle[0]];
  const second = mesh.points[triangle[1]];
  const third = mesh.points[triangle[2]];
  if (!first || !second || !third) {
    return null;
  }

  return {
    x: (first.x + second.x + third.x) / 3,
    y: (first.y + second.y + third.y) / 3,
  };
}

export function isPointInPolygon(
  point: TriangleModelPoint2D,
  polygon: TriangleModelPoint2D[],
) {
  if (polygon.length < 3) {
    return false;
  }

  let isInside = false;
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const crossesY =
      current.y > point.y !== previous.y > point.y;

    if (!crossesY) {
      continue;
    }

    const xAtY =
      ((previous.x - current.x) * (point.y - current.y)) /
        (previous.y - current.y) +
      current.x;
    if (point.x < xAtY) {
      isInside = !isInside;
    }
  }

  return isInside;
}

export function selectTrianglesByLasso(
  mesh: TriangleMesh,
  lassoPolygon: TriangleModelPoint2D[],
) {
  const selectedTriangleIndices: number[] = [];
  if (lassoPolygon.length < 3) {
    return selectedTriangleIndices;
  }

  mesh.triangles.forEach((_, triangleIndex) => {
    const centroid = getTriangleCentroid(mesh, triangleIndex);
    if (centroid && isPointInPolygon(centroid, lassoPolygon)) {
      selectedTriangleIndices.push(triangleIndex);
    }
  });

  return selectedTriangleIndices;
}

export function collectSelectedRegionIds(
  mesh: TriangleMesh,
  selectedTriangleIndices: number[],
) {
  const selectedRegionIds = new Set<number>();

  selectedTriangleIndices.forEach((triangleIndex) => {
    const regionId = mesh.triangleRegionIds?.[triangleIndex] ?? null;
    if (regionId !== null) {
      selectedRegionIds.add(regionId);
    }
  });

  return selectedRegionIds;
}
