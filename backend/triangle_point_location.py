"""Point location in a triangulation, without matplotlib.

This replaces ``matplotlib.tri.Triangulation(...).get_trifinder()``, which was
this codebase's only use of matplotlib. Importing matplotlib pulls in its font
manager, and inside the frozen desktop backend PyInstaller's runtime hook
forces the font cache to be rebuilt on every launch -- about 14 seconds of the
packaged app's startup time for two get_trifinder() calls.

The locator answers the same question: for each query point, the index of a
triangle containing it, or -1 when no triangle does. Containment is tested
with barycentric coordinates behind a two-level uniform grid:

- The fine level's cell size tracks the *median* triangle size, so the dense
  core of a graded MARE2DEM mesh -- where both the small triangles and the
  region seeds concentrate -- stays at a few candidates per query. A single
  domain-sized grid put thousands of core triangles into one cell, because
  the huge boundary triangles stretch the domain far beyond the core.
- Triangles too large for the fine level (they would smear across hundreds of
  cells) go to a coarse level sized like the classic sqrt(n) grid. They are
  few, so coarse cells stay small too.

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

#: Upper bound on fine-grid cells per axis, which bounds the dense
#: cell-offset table at a few tens of megabytes even for extreme domains.
_MAX_FINE_CELLS_PER_AXIS = 2048

#: A triangle whose bounding box covers more fine cells than this is indexed
#: on the coarse level instead, keeping the fine index compact.
_MAX_FINE_CELLS_PER_TRIANGLE = 64


class _Grid:
    """One uniform-grid level: triangles bucketed by bounding box.

    Attributes:
        starts: CSR offsets per cell, shape (nx * ny + 1,).
        triangles: Triangle ids grouped by cell, shape (total entries,).
    """

    def __init__(self, min_x, max_x, min_y, max_y, ids, x0, y0, dx, dy, nx, ny):
        self.x0, self.y0, self.dx, self.dy, self.nx, self.ny = x0, y0, dx, dy, nx, ny

        ix0 = self.cell_x(min_x)
        ix1 = self.cell_x(max_x)
        iy0 = self.cell_y(min_y)
        iy1 = self.cell_y(max_y)

        # Expand each triangle to every cell its bbox overlaps, without a
        # Python loop: repeat the triangle id once per overlapped cell, then
        # derive that copy's (column, row) offset from its rank in the repeat.
        width = ix1 - ix0 + 1
        per_triangle = width * (iy1 - iy0 + 1)
        total = int(per_triangle.sum())
        triangle_ids = np.repeat(ids, per_triangle)
        first_rank = np.repeat(np.cumsum(per_triangle) - per_triangle, per_triangle)
        local = np.arange(total) - first_rank
        local_w = np.repeat(width, per_triangle)
        cell_ids = (
            (np.repeat(iy0, per_triangle) + local // local_w) * self.nx
            + np.repeat(ix0, per_triangle) + local % local_w
        )

        order = np.argsort(cell_ids, kind="stable")
        self.triangles = triangle_ids[order]
        self.starts = np.searchsorted(
            cell_ids[order], np.arange(self.nx * self.ny + 1)
        )

    def cell_x(self, values):
        raw = np.floor((values - self.x0) / self.dx).astype(int)
        return np.clip(raw, 0, self.nx - 1)

    def cell_y(self, values):
        raw = np.floor((values - self.y0) / self.dy).astype(int)
        return np.clip(raw, 0, self.ny - 1)

    def query_cells(self, px, py):
        """Cell id and candidate count for each query point."""
        cells = self.cell_y(py) * self.nx + self.cell_x(px)
        return cells, self.starts[cells + 1] - self.starts[cells]


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
        self._grids = []

        if self._n_triangles == 0:
            return

        tri_x = x[triangles]
        tri_y = y[triangles]
        self._ax = tri_x[:, 0]
        self._ay = tri_y[:, 0]

        # Edge vectors from corner A, and the signed doubled area. A zero
        # area marks a degenerate triangle, which never contains anything.
        self._abx = tri_x[:, 1] - self._ax
        self._aby = tri_y[:, 1] - self._ay
        self._acx = tri_x[:, 2] - self._ax
        self._acy = tri_y[:, 2] - self._ay
        self._area2 = self._abx * self._acy - self._aby * self._acx
        self._degenerate = self._area2 == 0.0
        self._safe_area2 = np.where(self._degenerate, 1.0, self._area2)

        self._build_grids(tri_x, tri_y)

    def _build_grids(self, tri_x, tri_y):
        min_x = tri_x.min(axis=1)
        max_x = tri_x.max(axis=1)
        min_y = tri_y.min(axis=1)
        max_y = tri_y.max(axis=1)

        x0 = float(min_x.min())
        y0 = float(min_y.min())
        extent_x = float(max_x.max()) - x0
        extent_y = float(max_y.max()) - y0

        # Fine level: cells sized to the median triangle, so the dense core
        # of a graded mesh gets O(1) candidates per cell. The axis cap keeps
        # the offset table bounded for extreme domain/triangle ratios.
        median_w = float(np.median(max_x - min_x))
        median_h = float(np.median(max_y - min_y))
        fine_dx = max(median_w, extent_x / _MAX_FINE_CELLS_PER_AXIS) or 1.0
        fine_dy = max(median_h, extent_y / _MAX_FINE_CELLS_PER_AXIS) or 1.0
        fine_nx = max(1, min(_MAX_FINE_CELLS_PER_AXIS, int(np.ceil(extent_x / fine_dx)) or 1))
        fine_ny = max(1, min(_MAX_FINE_CELLS_PER_AXIS, int(np.ceil(extent_y / fine_dy)) or 1))

        span = (
            (np.floor(max_x / fine_dx) - np.floor(min_x / fine_dx) + 1)
            * (np.floor(max_y / fine_dy) - np.floor(min_y / fine_dy) + 1)
        )
        fine_mask = span <= _MAX_FINE_CELLS_PER_TRIANGLE
        all_ids = np.arange(self._n_triangles)

        if fine_mask.any():
            ids = all_ids[fine_mask]
            self._grids.append(
                _Grid(
                    min_x[fine_mask], max_x[fine_mask],
                    min_y[fine_mask], max_y[fine_mask],
                    ids, x0, y0, fine_dx, fine_dy, fine_nx, fine_ny,
                )
            )

        # Coarse level: the classic ~sqrt(n) grid, holding only the
        # triangles the fine level rejected. They are few, so cells stay
        # small even though each triangle spans many of them.
        coarse_mask = ~fine_mask
        if coarse_mask.any():
            n = max(1, int(np.ceil(np.sqrt(self._n_triangles))))
            ids = all_ids[coarse_mask]
            self._grids.append(
                _Grid(
                    min_x[coarse_mask], max_x[coarse_mask],
                    min_y[coarse_mask], max_y[coarse_mask],
                    ids, x0, y0,
                    (extent_x / n) or 1.0, (extent_y / n) or 1.0, n, n,
                )
            )

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
        for grid in self._grids:
            cells, counts = grid.query_cells(flat_px, flat_py)
            # Points already resolved by a previous level keep their answer;
            # any containing triangle is valid, so there is nothing to prefer
            # between levels and skipping saves the pair expansion.
            pending = np.nonzero((counts > 0) & (result < 0))[0]
            while pending.size:
                cumulative = np.cumsum(counts[pending])
                take = max(1, int(np.searchsorted(cumulative, _MAX_PAIRS_PER_CHUNK)))
                batch, pending = pending[:take], pending[take:]
                self._locate_batch(grid, flat_px, flat_py, cells, counts, batch, result)

        return result.reshape(shape)

    def _locate_batch(self, grid, px, py, cells, counts, batch, result):
        """Test one batch of queries against their candidate triangles."""
        batch_counts = counts[batch]
        starts = grid.starts[cells[batch]]

        # One row per (query, candidate) pair, built with the same
        # rank-in-repeat trick as the grid construction.
        total = int(batch_counts.sum())
        query_rows = np.repeat(batch, batch_counts)
        first_rank = np.repeat(np.cumsum(batch_counts) - batch_counts, batch_counts)
        candidate = grid.triangles[
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
