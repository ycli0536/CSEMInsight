"""Tests for MARE2DEMPolyParser / MARE2DEMPolyManager."""

import pytest

from MARE2DEM_poly_parser import MARE2DEMPolyManager, MARE2DEMPolyParser


def write_poly(path, vertices, segments, regions):
    """Write a minimal .poly, the way a caller of the parser would."""
    MARE2DEMPolyParser().write_poly_file(str(path), vertices, segments, [], regions)
    return str(path)


def vertex(y, z):
    return {"hCoor": y, "vCoor": z, "attributes": [], "boundary_marker": None}


#: Depths of the interfaces that divide the layered source model.
LAYER_DEPTHS = (0.0, 20.0, 45.0, 70.0, 100.0)


def layered_box(path):
    """A rectangle divided into four stacked layers, so it holds four regions.

    Several regions matter: with only two, the attributes a merged region could
    inherit (1 and 2) coincide with the numbers it should have been given, and
    the mix-up this file guards against hides.
    """
    vertices = {}
    segments = []
    regions = []
    for index, depth in enumerate(LAYER_DEPTHS):
        left, right = 2 * index + 1, 2 * index + 2
        vertices[left] = vertex(0.0, depth)
        vertices[right] = vertex(100.0, depth)
        # The interface itself.
        segments.append(
            {"id": len(segments) + 1, "endpoint_1": left, "endpoint_2": right,
             "boundary_marker": 1}
        )
        if index:
            # Side walls joining this interface to the one above.
            segments.append(
                {"id": len(segments) + 1, "endpoint_1": left - 2, "endpoint_2": left,
                 "boundary_marker": 1}
            )
            segments.append(
                {"id": len(segments) + 1, "endpoint_1": right - 2, "endpoint_2": right,
                 "boundary_marker": 1}
            )
            mid = (LAYER_DEPTHS[index - 1] + depth) / 2
            regions.append(
                {"id": len(regions) + 1, "hCoor": 50.0, "vCoor": mid,
                 "attribute": len(regions) + 1, "max_area": -1}
            )
    return write_poly(path, vertices, segments, regions)


def crossing_line(path, y=40.0):
    """A vertical line running top to bottom, so it splits every layer in two."""
    vertices = {1: vertex(y, LAYER_DEPTHS[0]), 2: vertex(y, LAYER_DEPTHS[-1])}
    segments = [{"id": 1, "endpoint_1": 1, "endpoint_2": 2, "boundary_marker": -1}]
    return write_poly(path, vertices, segments, None)


class TestMergedRegionAttributes:
    """A merged region's attribute must be its own region number.

    A region's attribute *is* its region number: ``read_poly_file`` sets it to
    the region's position on load, and the consumers -- ``main.py``'s
    constrained-mesh serialisation and ``triangle_model_resegmentation`` -- use
    it to index the ``.resistivity`` table by that position.

    When merged regions inherited the *source* region's attribute instead, every
    merged region indexed the wrong row. The exported files stayed correct, so
    this only showed on screen: a fixed region such as air rendered with some
    neighbouring sediment's resistivity.
    """

    def test_every_merged_region_is_numbered_by_its_own_position(self, tmp_path):
        source = layered_box(tmp_path / "box.poly")
        cut = crossing_line(tmp_path / "cut.poly")

        _, _, _, regions = MARE2DEMPolyManager().merge_poly(
            source, cut, unit_scale_factor=1
        )

        assert [region["id"] for region in regions] == list(range(1, len(regions) + 1))
        assert [region["attribute"] for region in regions] == [
            region["id"] for region in regions
        ]

    def test_the_merge_actually_split_a_region(self, tmp_path):
        # Guards the test above: if the cut stopped splitting anything, the
        # attribute check would pass trivially.
        source = layered_box(tmp_path / "box.poly")
        cut = crossing_line(tmp_path / "cut.poly")

        _, _, _, regions = MARE2DEMPolyManager().merge_poly(
            source, cut, unit_scale_factor=1
        )

        assert len(regions) == 8  # four layers, each cut in two

    def test_merged_regions_keep_an_interior_seed_point(self, tmp_path):
        # The seed point *is* inherited from the source region where there is
        # one, because it is known to lie inside; only the attribute is not.
        source = layered_box(tmp_path / "box.poly")
        cut = crossing_line(tmp_path / "cut.poly")

        _, _, _, regions = MARE2DEMPolyManager().merge_poly(
            source, cut, unit_scale_factor=1
        )

        for region in regions:
            assert 0.0 < region["hCoor"] < 100.0
            assert 0.0 < region["vCoor"] < 100.0
            assert region["max_area"] == -1
