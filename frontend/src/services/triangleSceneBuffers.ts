import { buildTriangleFillColors } from '@/services/triangleModelColorScale';
import type { TriangleMesh, TriangleMeshPoint, TriangleModelSegment } from '@/types';

export interface TriangleSceneBuffers {
  pointPositions: Float32Array;
  triangleFillPositions: Float32Array;
  triangleFillColors: Float32Array;
  triangleEdgePositions: Float32Array;
}

export function buildTriangleSceneBuffers(mesh: TriangleMesh): TriangleSceneBuffers {
  const pointPositions = new Float32Array(mesh.points.length * 3);

  mesh.points.forEach((point, index) => {
    pointPositions[index * 3] = point.x;
    pointPositions[index * 3 + 1] = point.y;
    pointPositions[index * 3 + 2] = 0;
  });

  const triangleFillPositions = new Float32Array(mesh.triangles.length * 9);
  const triangleEdgePositions = new Float32Array(mesh.triangles.length * 18);

  mesh.triangles.forEach((triangle, triangleIndex) => {
    const first = mesh.points[triangle[0]];
    const second = mesh.points[triangle[1]];
    const third = mesh.points[triangle[2]];

    if (!first || !second || !third) {
      return;
    }

    const fillOffset = triangleIndex * 9;
    triangleFillPositions.set(
      [
        first.x,
        first.y,
        0,
        second.x,
        second.y,
        0,
        third.x,
        third.y,
        0,
      ],
      fillOffset,
    );

    const edgeOffset = triangleIndex * 18;
    triangleEdgePositions.set(
      [
        first.x,
        first.y,
        0,
        second.x,
        second.y,
        0,
        second.x,
        second.y,
        0,
        third.x,
        third.y,
        0,
        third.x,
        third.y,
        0,
        first.x,
        first.y,
        0,
      ],
      edgeOffset,
    );
  });

  return {
    pointPositions,
    triangleFillPositions,
    triangleFillColors: buildTriangleFillColors(
      mesh.triangleResistivityValues ??
        Array.from({ length: mesh.triangles.length }, () => null),
    ),
    triangleEdgePositions,
  };
}

export function buildTriangleSegmentPositions(
  points: TriangleMeshPoint[],
  segments: TriangleModelSegment[],
) {
  const pointById = new Map(points.map((point) => [point.id, point]));
  const segmentValues: number[] = [];

  for (const segment of segments) {
    const start = pointById.get(segment.endpoint_1);
    const end = pointById.get(segment.endpoint_2);

    if (!start || !end) {
      continue;
    }

    segmentValues.push(start.x, start.y, 0, end.x, end.y, 0);
  }

  return new Float32Array(segmentValues);
}

export function buildTriangleRegionHighlightPositions(
  mesh: TriangleMesh,
  triangleIndex: number,
) {
  const triangleIndices: number[] = [];
  const targetRegionId = mesh.triangleRegionIds?.[triangleIndex] ?? null;

  if (targetRegionId === null) {
    if (mesh.triangles[triangleIndex]) {
      triangleIndices.push(triangleIndex);
    }
  } else {
    mesh.triangleRegionIds?.forEach((regionId, index) => {
      if (regionId === targetRegionId) {
        triangleIndices.push(index);
      }
    });
  }

  const positions: number[] = [];
  for (const index of triangleIndices) {
    const triangle = mesh.triangles[index];
    if (!triangle) {
      continue;
    }

    const first = mesh.points[triangle[0]];
    const second = mesh.points[triangle[1]];
    const third = mesh.points[triangle[2]];

    if (!first || !second || !third) {
      continue;
    }

    positions.push(
      first.x,
      first.y,
      0.03,
      second.x,
      second.y,
      0.03,
      third.x,
      third.y,
      0.03,
    );
  }

  return new Float32Array(positions);
}
