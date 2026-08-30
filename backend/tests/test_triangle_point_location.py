"""Tests for the numpy point locator that replaces matplotlib's TriFinder."""

import numpy as np
import pytest

from triangle_point_location import TriangleLocator


@pytest.fixture()
def unit_square():
    """Two triangles tiling the unit square: [A,B,C] and [A,C,D]."""
    x = np.array([0.0, 1.0, 1.0, 0.0])  # A, B, C, D
    y = np.array([0.0, 0.0, 1.0, 1.0])
    triangles = np.array([[0, 1, 2], [0, 2, 3]])
    return TriangleLocator(x, y, triangles)


class TestBasicContainment:
    def test_point_inside_each_triangle(self, unit_square):
        assert int(unit_square(0.7, 0.2)) == 0
        assert int(unit_square(0.2, 0.7)) == 1

    def test_point_outside_returns_minus_one(self, unit_square):
        assert int(unit_square(1.5, 0.5)) == -1
        assert int(unit_square(-0.1, 0.5)) == -1
        assert int(unit_square(0.5, -2.0)) == -1

    def test_point_on_shared_edge_is_in_one_of_the_neighbours(self, unit_square):
        # The diagonal A-C belongs to both triangles; either answer is a
        # containing triangle, and callers only need *a* containing triangle.
        assert int(unit_square(0.5, 0.5)) in (0, 1)

    def test_point_on_a_corner_is_found(self, unit_square):
        # side_trim_service queries triangle corners directly.
        assert int(unit_square(0.0, 0.0)) in (0, 1)
        assert int(unit_square(1.0, 0.0)) == 0
        assert int(unit_square(0.0, 1.0)) == 1

    def test_point_on_outer_edge_is_found(self, unit_square):
        assert int(unit_square(0.5, 0.0)) == 0
        assert int(unit_square(0.0, 0.5)) == 1


class TestCallingConvention:
    """The locator is called exactly like matplotlib's trifinder."""

    def test_array_inputs_return_matching_shape(self, unit_square):
        result = unit_square(np.array([0.7, 0.2, 5.0]), np.array([0.2, 0.7, 5.0]))

        assert isinstance(result, np.ndarray)
        assert result.shape == (3,)
        assert result.tolist() == [0, 1, -1]

    def test_scalar_inputs_survive_int_conversion(self, unit_square):
        # Call sites do int(trifinder(y, z)) and compare == -1.
        assert int(unit_square(2.0, 2.0)) == -1

    def test_result_dtype_is_integer(self, unit_square):
        result = unit_square(np.array([0.7]), np.array([0.2]))

        assert np.issubdtype(result.dtype, np.integer)


class TestRobustness:
    def test_degenerate_triangle_never_contains(self):
        # A zero-area triangle plus a real one; the query sits on the
        # degenerate one's segment but inside the real one.
        x = np.array([0.0, 1.0, 2.0, 0.5])
        y = np.array([0.0, 0.0, 0.0, 1.0])
        triangles = np.array([[0, 1, 2], [0, 1, 3]])  # first is collinear
        locator = TriangleLocator(x, y, triangles)

        assert int(locator(0.5, 0.25)) == 1
        # On the collinear segment but outside the real triangle: not found.
        assert int(locator(1.5, 0.0)) == -1

    def test_clockwise_triangle_is_still_found(self):
        # Triangle 'pzQ' output is CCW, but do not rely on orientation.
        x = np.array([0.0, 1.0, 0.0])
        y = np.array([0.0, 0.0, 1.0])
        locator = TriangleLocator(x, y, np.array([[0, 2, 1]]))  # CW order

        assert int(locator(0.2, 0.2)) == 0

    def test_many_points_cross_chunk_boundary(self, unit_square):
        # More query points than one processing chunk.
        rng = np.random.default_rng(7)
        px = rng.uniform(-0.5, 1.5, size=5000)
        py = rng.uniform(-0.5, 1.5, size=5000)

        result = unit_square(px, py)

        inside = (px >= 0) & (px <= 1) & (py >= 0) & (py <= 1)
        assert result.shape == (5000,)
        assert np.all(result[~inside] == -1)
        assert np.all(result[inside] >= 0)


@pytest.mark.skipif(
    pytest.importorskip("matplotlib", reason="cross-check needs matplotlib") is None,
    reason="matplotlib unavailable",
)
class TestAgreementWithMatplotlib:
    """Cross-validate against the TriFinder this module replaces."""

    def test_matches_trifinder_on_a_real_triangulation(self):
        from matplotlib.tri import Triangulation
        from scipy.spatial import Delaunay

        rng = np.random.default_rng(42)
        points = rng.uniform(-10, 10, size=(80, 2))
        delaunay = Delaunay(points)
        x, y = points[:, 0], points[:, 1]
        triangles = delaunay.simplices

        ours = TriangleLocator(x, y, triangles)
        theirs = Triangulation(x, y, triangles).get_trifinder()

        qx = rng.uniform(-12, 12, size=500)
        qy = rng.uniform(-12, 12, size=500)
        our_idx = ours(qx, qy)
        their_idx = theirs(qx, qy)

        # Same found/not-found verdicts.
        np.testing.assert_array_equal(our_idx >= 0, their_idx >= 0)

        # Where found, both answers must genuinely contain the point (indices
        # may differ only for points exactly on shared edges).
        def contains(tri_idx, px_, py_):
            a, b, c = triangles[tri_idx]
            ax_, ay_ = x[a], y[a]
            d = (x[b]-ax_)*(y[c]-ay_) - (y[b]-ay_)*(x[c]-ax_)
            s = ((px_-ax_)*(y[c]-ay_) - (py_-ay_)*(x[c]-ax_)) / d
            t = ((x[b]-ax_)*(py_-ay_) - (y[b]-ay_)*(px_-ax_)) / d
            eps = 1e-9
            return s >= -eps and t >= -eps and s + t <= 1 + eps

        for i in np.nonzero(our_idx >= 0)[0]:
            assert contains(int(our_idx[i]), qx[i], qy[i])
