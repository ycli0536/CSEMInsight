"""Point location in a triangulation, without matplotlib.

This replaces ``matplotlib.tri.Triangulation(...).get_trifinder()``, which was
this codebase's only use of matplotlib. Importing matplotlib pulls in its font
manager, and inside the frozen desktop backend PyInstaller's runtime hook
forces the font cache to be rebuilt on every launch -- about 14 seconds of the
packaged app's startup time for two get_trifinder() calls.

The locator answers the same question: for each query point, the index of a
triangle containing it, or -1 when no triangle does. Containment is tested
with barycentric coordinates; a uniform grid over the triangle bounding boxes
keeps each query to a handful of candidate triangles, which is what makes
38k seeds x 75k triangles finish in tens of milliseconds rather than seconds.

Boundary points (on an edge or a corner) count as contained, matching
TriFinder; for a point exactly on a shared edge any adjacent triangle is a
valid answer, and callers here only ever need *a* containing triangle.
"""

import numpy as np

#: Relative tolerance on barycentric coordinates. Large enough to keep
#: points that sit exactly on an edge or corner, small enough not to claim
#: points that are genuinely outside.
_BARYCENTRIC_TOL = 1e-9

#: Cap on candidate (point, triangle) pairs expanded per chunk, bounding the
#: intermediate arrays at a few tens of megabytes.
_MAX_PAIRS_PER_CHUNK = 4_000_000


class TriangleLocator:
    """Find which triangle of a fixed triangulation contains a point.

    Instances are called like matplotlib's TriFinder::

        locator = TriangleLocator(x, y, triangles)
        index = int(locator(query_y, query_z))       # scalar
        indices = locator(ys, zs)                    # arrays

    Attributes:
        x: Vertex x coordinates, shape (n_vertices,).
        y: Vertex y coordinates, shape (n_vertices,).
        triangles: Vertex indices per triangle, shape (n_triangles, 3).
    """

    def __init__(self, x, y, triangles):
        x = np.asarray(x, dtype=float)
        y = np.asarray(y, dtype=float)
        triangles = np.asarray(triangles, dtype=int).reshape(-1, 3)
        self._n_triangles = triangles.shape[0]

        # Corner coordinates per triangle.
        self._ax = x[triangles[:, 0]] if self._n_triangles else np.empty(0)
        self._ay = y[triangles[:, 0]] if self._n_triangles else np.empty(0)

        if self._n_triangles == 0:
            return

        # Edge vectors from corner A, and the signed doubled area. A zero
        # area marks a degenerate triangle, which never contains anything.
        self._abx = x[triangles[:, 1]] - self._ax
        self._aby = y[triangles[:, 1]] - self._ay
        self._acx = x[triangles[:, 2]] - self._ax
        self._acy = y[triangles[:, 2]] - self._ay
        self._area2 = self._abx * self._acy - self._aby * self._acx
        self._degenerate = self._area2 == 0.0
        self._safe_area2 = np.where(self._degenerate, 1.0, self._area2)

        self._build_grid(x[triangles], y[triangles])

    def _build_grid(self, tri_x, tri_y):
        """Index triangles into a uniform grid by bounding box.

        Args:
            tri_x: Corner x coordinates per triangle, shape (n, 3).
            tri_y: Corner y coordinates per triangle, shape (n, 3).
        """
        min_x = tri_x.min(axis=1)
        max_x = tri_x.max(axis=1)
        min_y = tri_y.min(axis=1)
        max_y = tri_y.max(axis=1)

        self._x0 = float(min_x.min())
        self._y0 = float(min_y.min())
        extent_x = float(max_x.max()) - self._x0
        extent_y = float(max_y.max()) - self._y0

        # Roughly one triangle per cell on average; graded meshes make the
        # big boundary triangles span many cells, which only costs memory in
        # the index, not query time for interior points.
        self._n_cells = max(1, int(np.ceil(np.sqrt(self._n_triangles))))
        self._dx = (extent_x / self._n_cells) or 1.0
        self._dy = (extent_y / self._n_cells) or 1.0

        ix0 = self._cell_coordinate(min_x, self._x0, self._dx)
        ix1 = self._cell_coordinate(max_x, self._x0, self._dx)
        iy0 = self._cell_coordinate(min_y, self._y0, self._dy)
        iy1 = self._cell_coordinate(max_y, self._y0, self._dy)

        # Expand each triangle to every cell its bbox overlaps, without a
        # Python loop: repeat the triangle id once per overlapped cell, then
        # derive that copy's (column, row) offset from its rank in the repeat.
        width = ix1 - ix0 + 1
        cells_per_triangle = width * (iy1 - iy0 + 1)
        total = int(cells_per_triangle.sum())
        triangle_ids = np.repeat(np.arange(self._n_triangles), cells_per_triangle)
        first_rank = np.repeat(
            np.cumsum(cells_per_triangle) - cells_per_triangle, cells_per_triangle
        )
        local = np.arange(total) - first_rank
        local_w = np.repeat(width, cells_per_triangle)
        cell_ids = (
            (np.repeat(iy0, cells_per_triangle) + local // local_w) * self._n_cells
            + np.repeat(ix0, cells_per_triangle) + local % local_w
        )

        # CSR layout: triangles sorted by cell, plus per-cell start offsets.
        order = np.argsort(cell_ids, kind="stable")
        self._cell_triangles = triangle_ids[order]
        self._cell_starts = np.searchsorted(
            cell_ids[order], np.arange(self._n_cells * self._n_cells + 1)
        )

    def _cell_coordinate(self, values, origin, step):
        raw = np.floor((values - origin) / step).astype(int)
        return np.clip(raw, 0, self._n_cells - 1)

    def __call__(self, px, py):
        """Locate one or many points.

        Args:
            px: Query x coordinate(s), scalar or array.
            py: Query y coordinate(s), scalar or array.

        Returns:
            Integer array shaped like the broadcast inputs; each entry is the
            index of a containing triangle, or -1. A scalar query yields a
            0-d array, so ``int(...)`` works exactly as it did on TriFinder.
        """
        px = np.asarray(px, dtype=float)
        py = np.asarray(py, dtype=float)
        shape = np.broadcast_shapes(px.shape, py.shape)
        flat_px = np.broadcast_to(px, shape).reshape(-1)
        flat_py = np.broadcast_to(py, shape).reshape(-1)

        result = np.full(flat_px.shape[0], -1, dtype=int)
        if self._n_triangles == 0:
            return result.reshape(shape)

        # Points in these cells have their candidates checked; everything
        # else is outside every bounding box and stays -1.
        ix = self._cell_coordinate(flat_px, self._x0, self._dx)
        iy = self._cell_coordinate(flat_py, self._y0, self._dy)
        cells = iy * self._n_cells + ix
        counts = self._cell_starts[cells + 1] - self._cell_starts[cells]

        pending = np.nonzero(counts > 0)[0]
        while pending.size:
            # Take queries until their combined candidate count fills a chunk.
            cumulative = np.cumsum(counts[pending])
            take = max(1, int(np.searchsorted(cumulative, _MAX_PAIRS_PER_CHUNK)))
            batch, pending = pending[:take], pending[take:]
            self._locate_batch(flat_px, flat_py, cells, counts, batch, result)

        return result.reshape(shape)

    def _locate_batch(self, px, py, cells, counts, batch, result):
        """Test one batch of queries against their candidate triangles."""
        batch_counts = counts[batch]
        starts = self._cell_starts[cells[batch]]

        # One row per (query, candidate) pair, built with the same
        # rank-in-repeat trick as the grid construction.
        total = int(batch_counts.sum())
        query_rows = np.repeat(batch, batch_counts)
        first_rank = np.repeat(np.cumsum(batch_counts) - batch_counts, batch_counts)
        candidate = self._cell_triangles[
            np.repeat(starts, batch_counts) + (np.arange(total) - first_rank)
        ]

        apx = px[query_rows] - self._ax[candidate]
        apy = py[query_rows] - self._ay[candidate]
        area2 = self._safe_area2[candidate]
        s = (apx * self._acy[candidate] - apy * self._acx[candidate]) / area2
        t = (self._abx[candidate] * apy - self._aby[candidate] * apx) / area2
        inside = (
            (s >= -_BARYCENTRIC_TOL)
            & (t >= -_BARYCENTRIC_TOL)
            & (s + t <= 1.0 + _BARYCENTRIC_TOL)
            & ~self._degenerate[candidate]
        )
        # Any containing triangle is a valid answer; later hits overwrite
        # earlier ones, which only matters for points exactly on shared edges.
        result[query_rows[inside]] = candidate[inside]
