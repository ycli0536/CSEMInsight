import type {
  TriangleHoverState,
  TriangleModelRegion,
  TriangleModelVertex,
} from '@/types';
import { describeTriangleSegmentMarker } from '@/services/triangleSegmentMarkers';

interface TriangleHoverSummaryContext {
  regions: TriangleModelRegion[];
  vertices: TriangleModelVertex[];
  /** Name of the displayed quantity, e.g. "Rho-z" or "Rho-z / Rho-h". */
  resistivityLabel?: string;
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

  // A segment hit outranks the cell's resistivity. The viewer only reports one
  // when the cursor is within tolerance of a segment, and it highlights that
  // segment -- a readout showing rho instead would contradict what is drawn.
  // Nearly every model carries resistivity, so without this the marker would
  // be unreachable in practice.
  if (hover.segment) {
    const marker = describeTriangleSegmentMarker(hover.segment.boundary_marker);
    return `Segment ${hover.segment.id}: ${hover.segment.endpoint_1} -> ${hover.segment.endpoint_2}, ${marker}`;
  }

  // A vertex does not outrank it: the rho readout uses the nearest vertex as
  // its anchor point, so vertex-plus-rho is one coherent answer rather than two
  // competing ones.
  if (hover.resistivityValue !== null) {
    return `${context?.resistivityLabel ?? 'Rho'} ${hover.resistivityValue.toPrecision(4)} @ ${formatHoverCoordinate(
      getTriangleHoverAnchorPoint(hover, context) ?? hover.point,
    )}`;
  }

  if (hover.vertex) {
    return `Vertex ${hover.vertex.id} @ ${formatHoverCoordinate(hover.vertex)}`;
  }

  if (hover.triangleIndex !== null) {
    return `Cell ${hover.triangleIndex + 1} @ ${formatHoverCoordinate(hover.point)}`;
  }

  return `Cursor @ ${formatHoverCoordinate(hover.point)}`;
}
