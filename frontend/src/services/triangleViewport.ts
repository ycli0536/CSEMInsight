import type {
  TriangleMeshBounds,
  TriangleMeshPoint,
  TriangleModelSegment,
  TriangleViewport,
} from '@/types';

export function createInitialTriangleViewport(bounds: TriangleMeshBounds): TriangleViewport {
  const paddingX = bounds.width === 0 ? 1 : bounds.width * 0.05;
  const paddingY = bounds.height === 0 ? 1 : bounds.height * 0.05;

  return {
    x: bounds.minX - paddingX,
    y: bounds.minY - paddingY,
    width: Math.max(bounds.width + paddingX * 2, 1),
    height: Math.max(bounds.height + paddingY * 2, 1),
  };
}

export function zoomTriangleViewport(
  viewport: TriangleViewport,
  factor: number,
  anchor: { x: number; y: number },
): TriangleViewport {
  const nextWidth = Math.max(viewport.width * factor, 1e-9);
  const nextHeight = Math.max(viewport.height * factor, 1e-9);
  const ratioX = (anchor.x - viewport.x) / viewport.width;
  const ratioY = (anchor.y - viewport.y) / viewport.height;

  return {
    x: anchor.x - nextWidth * ratioX,
    y: anchor.y - nextHeight * ratioY,
    width: nextWidth,
    height: nextHeight,
  };
}

export function panTriangleViewportByPixels(
  viewport: TriangleViewport,
  delta: { dx: number; dy: number },
  canvas: { width: number; height: number },
): TriangleViewport {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return viewport;
  }

  return {
    x: viewport.x - (delta.dx / canvas.width) * viewport.width,
    y: viewport.y - (delta.dy / canvas.height) * viewport.height,
    width: viewport.width,
    height: viewport.height,
  };
}

export function clientPointToModelPoint(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  viewport: TriangleViewport,
): { x: number; y: number } {
  return {
    x: viewport.x + ((point.x - rect.left) / rect.width) * viewport.width,
    y: viewport.y + ((point.y - rect.top) / rect.height) * viewport.height,
  };
}

export function findNearestVertex(
  points: TriangleMeshPoint[],
  target: { x: number; y: number },
  tolerance: number,
): TriangleMeshPoint | null {
  let nearest: TriangleMeshPoint | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance <= tolerance && distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function distanceToSegment(
  point: { x: number; y: number },
  start: TriangleMeshPoint,
  end: TriangleMeshPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  const projectedX = start.x + t * dx;
  const projectedY = start.y + t * dy;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

export function findNearestSegment(
  segments: TriangleModelSegment[],
  vertexById: Map<number, TriangleMeshPoint>,
  target: { x: number; y: number },
  tolerance: number,
): TriangleModelSegment | null {
  let nearest: TriangleModelSegment | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const start = vertexById.get(segment.endpoint_1);
    const end = vertexById.get(segment.endpoint_2);
    if (!start || !end) {
      continue;
    }

    const distance = distanceToSegment(target, start, end);
    if (distance <= tolerance && distance < nearestDistance) {
      nearest = segment;
      nearestDistance = distance;
    }
  }

  return nearest;
}
