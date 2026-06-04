import type {
  TriangleHoverState,
  TriangleModelRegion,
  TriangleModelVertex,
} from '@/types';

interface TriangleHoverSummaryContext {
  regions: TriangleModelRegion[];
  vertices: TriangleModelVertex[];
}

function formatHoverCoordinate(point: { x: number; y: number }) {
  return `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`;
}

function findNearestModelVertex(
  vertices: TriangleModelVertex[],
  point: { x: number; y: number },
) {
  let nearest: TriangleModelVertex | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const vertex of vertices) {
    const distance = Math.hypot(vertex.hCoor - point.x, vertex.vCoor - point.y);
    if (distance < nearestDistance) {
      nearest = vertex;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function getTriangleHoverAnchorPoint(
  hover: TriangleHoverState,
  context?: TriangleHoverSummaryContext | null,
) {
  if (!hover.point) {
    return null;
  }

  if (hover.regionId !== null) {
    const region = context?.regions.find((candidate) => candidate.id === hover.regionId);
    if (region) {
      return {
        x: region.hCoor,
        y: region.vCoor,
      };
    }
  }

  const nearestVertex = context?.vertices?.length
    ? findNearestModelVertex(context.vertices, hover.point)
    : null;
  if (nearestVertex) {
    return {
      x: nearestVertex.hCoor,
      y: nearestVertex.vCoor,
    };
  }

  return hover.point;
}

export function formatTriangleHoverSummary(
  hover: TriangleHoverState | null,
  context?: TriangleHoverSummaryContext | null,
): string | null {
  if (!hover?.point) {
    return null;
  }

  if (hover.resistivityValue !== null) {
    return `Rho ${hover.resistivityValue.toPrecision(4)} @ ${formatHoverCoordinate(
      getTriangleHoverAnchorPoint(hover, context) ?? hover.point,
    )}`;
  }

  if (hover.vertex) {
    return `Vertex ${hover.vertex.id} @ ${formatHoverCoordinate(hover.vertex)}`;
  }

  if (hover.segment) {
    return `Segment ${hover.segment.id}: ${hover.segment.endpoint_1} -> ${hover.segment.endpoint_2}`;
  }

  if (hover.triangleIndex !== null) {
    return `Cell ${hover.triangleIndex + 1} @ ${formatHoverCoordinate(hover.point)}`;
  }

  return `Cursor @ ${formatHoverCoordinate(hover.point)}`;
}
