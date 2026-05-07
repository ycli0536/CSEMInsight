import type { TriangleMesh } from '@/types';

export interface FeatherRegionWeightOptions {
  adjacency: Map<number, Set<number>>;
  selectedRegionIds: Set<number>;
  rings: number;
}

function getTriangleEdgeKeys(triangle: [number, number, number]) {
  const edges: Array<[number, number]> = [
    [triangle[0], triangle[1]],
    [triangle[1], triangle[2]],
    [triangle[2], triangle[0]],
  ];

  return edges.map(([first, second]) =>
    first < second ? `${first}:${second}` : `${second}:${first}`,
  );
}

function addRegionNeighbor(
  adjacency: Map<number, Set<number>>,
  firstRegionId: number,
  secondRegionId: number,
) {
  if (firstRegionId === secondRegionId) {
    return;
  }

  if (!adjacency.has(firstRegionId)) {
    adjacency.set(firstRegionId, new Set());
  }
  if (!adjacency.has(secondRegionId)) {
    adjacency.set(secondRegionId, new Set());
  }

  adjacency.get(firstRegionId)?.add(secondRegionId);
  adjacency.get(secondRegionId)?.add(firstRegionId);
}

export function buildRegionAdjacency(mesh: TriangleMesh) {
  const adjacency = new Map<number, Set<number>>();
  const edgeOwnerByKey = new Map<string, number>();

  mesh.triangles.forEach((triangle, triangleIndex) => {
    const regionId = mesh.triangleRegionIds?.[triangleIndex] ?? null;
    if (regionId === null) {
      return;
    }

    if (!adjacency.has(regionId)) {
      adjacency.set(regionId, new Set());
    }

    getTriangleEdgeKeys(triangle).forEach((edgeKey) => {
      const previousTriangleIndex = edgeOwnerByKey.get(edgeKey);
      if (previousTriangleIndex === undefined) {
        edgeOwnerByKey.set(edgeKey, triangleIndex);
        return;
      }

      const previousRegionId =
        mesh.triangleRegionIds?.[previousTriangleIndex] ?? null;
      if (previousRegionId !== null) {
        addRegionNeighbor(adjacency, previousRegionId, regionId);
      }
    });
  });

  return adjacency;
}

export function getFeatherRegionWeights(options: FeatherRegionWeightOptions) {
  const { adjacency, selectedRegionIds } = options;
  const rings = Math.min(Math.max(Math.trunc(options.rings), 0), 5);
  const weights = new Map<number, number>();
  const visited = new Set<number>();
  let frontier = new Set<number>();

  selectedRegionIds.forEach((regionId) => {
    weights.set(regionId, 1);
    visited.add(regionId);
    frontier.add(regionId);
  });

  for (let ring = 1; ring <= rings; ring += 1) {
    const nextFrontier = new Set<number>();

    frontier.forEach((regionId) => {
      adjacency.get(regionId)?.forEach((neighborRegionId) => {
        if (visited.has(neighborRegionId)) {
          return;
        }

        visited.add(neighborRegionId);
        nextFrontier.add(neighborRegionId);
        weights.set(neighborRegionId, 1 - ring / (rings + 1));
      });
    });

    frontier = nextFrontier;
    if (frontier.size === 0) {
      break;
    }
  }

  return weights;
}
