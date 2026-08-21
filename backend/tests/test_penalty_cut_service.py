import pandas as pd
import pytest

from penalty_cut_service import (
    PenaltyCutError,
    PenaltyCutParameters,
    apply_penalty_cut,
    build_cut_model,
    check_interface_against_model,
    parse_interface,
    parse_interface_text,
    parse_model_bounds,
    parse_penalty_cut_parameters,
    render_poly_text,
)


def model_bounds(vertices):
    """The bounding box a client would send along with an interface."""
    ys = [v["hCoor"] for v in vertices.values()]
    zs = [v["vCoor"] for v in vertices.values()]
    return {"yMin": min(ys), "yMax": max(ys), "zMin": min(zs), "zMax": max(zs)}


def box_model(width=100_000.0, depth=20_000.0):
    """A rectangle split by a horizontal line, so it holds two regions.

    Region 1 is the upper strip (standing in for seawater, fixed), region 2 the
    lower body (a free parameter).
    """
    split = depth * 0.25
    vertices = {
        1: {"hCoor": 0.0, "vCoor": 0.0, "attributes": [], "boundary_marker": None},
        2: {"hCoor": width, "vCoor": 0.0, "attributes": [], "boundary_marker": None},
        3: {"hCoor": width, "vCoor": depth, "attributes": [], "boundary_marker": None},
        4: {"hCoor": 0.0, "vCoor": depth, "attributes": [], "boundary_marker": None},
        5: {"hCoor": 0.0, "vCoor": split, "attributes": [], "boundary_marker": None},
        6: {"hCoor": width, "vCoor": split, "attributes": [], "boundary_marker": None},
    }
    segments = [
        {"id": 1, "endpoint_1": 1, "endpoint_2": 2, "boundary_marker": 1},
        {"id": 2, "endpoint_1": 2, "endpoint_2": 6, "boundary_marker": 1},
        {"id": 3, "endpoint_1": 6, "endpoint_2": 3, "boundary_marker": 1},
        {"id": 4, "endpoint_1": 3, "endpoint_2": 4, "boundary_marker": 1},
        {"id": 5, "endpoint_1": 4, "endpoint_2": 5, "boundary_marker": 1},
        {"id": 6, "endpoint_1": 5, "endpoint_2": 1, "boundary_marker": 1},
        {"id": 7, "endpoint_1": 5, "endpoint_2": 6, "boundary_marker": 1},
    ]
    regions = [
        {"id": 1, "hCoor": width / 2, "vCoor": split / 2, "attribute": 1, "max_area": -1},
        {
            "id": 2,
            "hCoor": width / 2,
            "vCoor": (split + depth) / 2,
            "attribute": 2,
            "max_area": -1,
        },
    ]
    return vertices, segments, [], regions


RESISTIVITY_TEXT = (
    "Format:                         mare2dem_1.1                     ! input \n"
    "Model File:                     box.poly                         ! input \n"
    "Data File:                      survey.data                      ! input \n"
    "Global Bounds:                  0.1, 100000                      ! opt. input \n"
    "Anisotropy:                     isotropic                        ! input \n"
    "Number of regions:              2                                ! input \n"
    "!#        Rho           Param      Lower        Upper         Prej         Weight       \n"
    "1         0.3           0          0            0             0            0            \n"
    "2         10            1          0            0             0            0            \n"
)

RESISTIVITY_TABLE = pd.DataFrame(
    [[1, 0.3, 0, 0, 0, 0, 0], [2, 10.0, 1, 0, 0, 0, 0]],
    columns=["#", "Rho", "Param", "Lower", "Upper", "Prej", "Weight"],
)


class TestParseParameters:
    def test_defaults(self):
        parameters = parse_penalty_cut_parameters({})

        assert parameters == PenaltyCutParameters(units="km", marker=-1, default_rho=10.0)

    def test_accepts_the_supported_units_and_markers(self):
        parameters = parse_penalty_cut_parameters(
            {"units": "M", "marker": -2, "defaultRho": 2.5}
        )

        assert parameters.units == "m"
        assert parameters.marker == -2
        assert parameters.default_rho == 2.5

    def test_rejects_unknown_units(self):
        with pytest.raises(PenaltyCutError, match="Unknown interface units"):
            parse_penalty_cut_parameters({"units": "feet"})

    @pytest.mark.parametrize("marker", [0, 1, 2, -3])
    def test_rejects_markers_that_are_not_cuts(self, marker):
        # Only a negative marker cuts the penalty, and only 1 or 2 in magnitude
        # mean anything to mesh coarsening.
        with pytest.raises(PenaltyCutError, match="marker must be one of"):
            parse_penalty_cut_parameters({"marker": marker})

    @pytest.mark.parametrize("value", [0, -5, float("nan")])
    def test_rejects_a_non_positive_default_rho(self, value):
        with pytest.raises(PenaltyCutError, match="positive number"):
            parse_penalty_cut_parameters({"defaultRho": value})


class TestParseInterfaceText:
    def test_reads_whitespace_columns_and_scales_km_to_metres(self):
        points = parse_interface_text("10 2\n20 3\n", units="km")

        assert points == [(10_000.0, 2_000.0), (20_000.0, 3_000.0)]

    def test_reads_comma_separated_columns(self):
        points = parse_interface_text("-137.9,36.49\n-137.8,36.46\n", units="m")

        assert points[0] == pytest.approx((-137.9, 36.49))

    def test_skips_comments_and_blank_lines(self):
        text = "# Top of basement\n#  provenance line\n\n  10 2 \n\n 20 3\n"

        assert len(parse_interface_text(text, units="m")) == 2

    def test_ignores_a_trailing_comment_on_a_data_line(self):
        assert parse_interface_text("10 2  # first\n20 3\n", units="m") == [
            (10.0, 2.0),
            (20.0, 3.0),
        ]

    def test_rejects_a_line_with_one_column(self):
        with pytest.raises(PenaltyCutError, match="Line 2: expected two columns"):
            parse_interface_text("10 2\n20\n", units="m")

    def test_rejects_a_line_that_is_not_numeric(self):
        with pytest.raises(PenaltyCutError, match="Line 1: could not read"):
            parse_interface_text("depth here\n20 3\n", units="m")

    def test_rejects_fewer_than_two_points(self):
        with pytest.raises(PenaltyCutError, match="at least two points"):
            parse_interface_text("10 2\n", units="m")


class TestCheckInterfaceAgainstModel:
    def test_a_well_placed_interface_is_quiet(self):
        vertices, _, _, _ = box_model()

        points = [(10_000.0, 8_000.0), (90_000.0, 9_000.0)]

        assert check_interface_against_model(points, vertices) == []

    def test_flags_points_outside_the_model(self):
        vertices, _, _, _ = box_model()

        # Metres read as kilometres: the interface shoots past the model.
        points = [(10_000_000.0, 8_000.0), (90_000_000.0, 9_000.0)]

        warnings = check_interface_against_model(points, vertices)

        assert any("fall outside the model" in w for w in warnings)

    def test_flags_an_interface_that_collapsed_to_a_point(self):
        vertices, _, _, _ = box_model()

        # Kilometres read as metres: still inside the box, but a thousandth the
        # length it should be. Containment alone would call this healthy.
        points = [(10.0, 8.0), (90.0, 9.0)]

        warnings = check_interface_against_model(points, vertices)

        assert any("signature of a unit mismatch" in w for w in warnings)
        assert not any("fall outside" in w for w in warnings)


class TestParseInterface:
    def test_returns_points_bounds_and_warnings(self):
        vertices, _, _, _ = box_model()

        result = parse_interface(
            "10 8\n90 9\n",
            PenaltyCutParameters(units="km"),
            parse_model_bounds(model_bounds(vertices)),
        )

        assert result["points"] == [[10_000.0, 8_000.0], [90_000.0, 9_000.0]]
        assert result["bounds"] == {
            "yMin": 10_000.0,
            "yMax": 90_000.0,
            "zMin": 8_000.0,
            "zMax": 9_000.0,
        }
        assert result["warnings"] == []

    def test_skips_the_model_checks_when_no_model_is_given(self):
        result = parse_interface("1 2\n3 4\n", PenaltyCutParameters(units="m"))

        assert result["warnings"] == []


class TestBuildCutModel:
    def test_chains_the_points_into_segments_carrying_the_marker(self):
        vertices, segments = build_cut_model([(0.0, 1.0), (2.0, 3.0), (4.0, 5.0)], -2)

        assert len(vertices) == 3
        assert [(s["endpoint_1"], s["endpoint_2"]) for s in segments] == [(1, 2), (2, 3)]
        assert {s["boundary_marker"] for s in segments} == {-2}


class TestApplyPenaltyCut:
    @staticmethod
    def apply(interface="10 12\n90 13\n", **kwargs):
        vertices, segments, holes, regions = box_model()
        kwargs.setdefault("parameters", PenaltyCutParameters(units="km"))
        return apply_penalty_cut(
            vertices,
            segments,
            holes,
            regions,
            RESISTIVITY_TABLE,
            RESISTIVITY_TEXT,
            interface,
            output_poly_name="box.cut.poly",
            **kwargs,
        )

    def test_adds_cut_segments(self):
        result = self.apply()

        assert result["stats"]["cutSegmentsBefore"] == 0
        assert result["stats"]["cutSegmentsAdded"] > 0
        assert result["stats"]["cutSegmentsAfter"] == result["stats"]["cutSegmentsAdded"]

    def test_an_interface_that_stops_short_does_not_create_regions(self):
        # The line floats inside the lower body without reaching either side
        # wall, so the flood fill walks around its ends and the region list is
        # unchanged. The cut still works -- MARE2DEM tests whether the line
        # between two region centroids crosses a cut segment, which needs no
        # enclosure. On a real parameter mesh the count does grow, because the
        # line splits the many small cells it passes through.
        result = self.apply(interface="10 12\n90 13\n")

        assert result["stats"]["cutSegmentsAdded"] > 0
        assert result["stats"]["mergedRegionCount"] == result["stats"]["sourceRegionCount"]

    def test_an_interface_spanning_the_model_splits_the_region(self):
        # Same line, now running wall to wall: the body really is divided.
        result = self.apply(interface="0 12\n100 13\n")

        assert result["stats"]["mergedRegionCount"] > result["stats"]["sourceRegionCount"]

    def test_every_new_cut_segment_carries_a_negative_marker(self):
        result = self.apply(parameters=PenaltyCutParameters(units="km", marker=-2))

        markers = {s["boundary_marker"] for s in result["segments"]}
        assert -2 in markers
        assert all(m is None or m >= -2 for m in markers)

    def test_keeps_the_fixed_region_fixed(self):
        result = self.apply()

        assert result["stats"]["fixedRegionCount"] == 1
        assert result["stats"]["unmatchedRegionCount"] == 0

    def test_resistivity_text_keeps_the_source_header(self):
        result = self.apply()

        assert "Data File:                      survey.data" in result["resistivityText"]
        assert "Global Bounds:                  0.1, 100000" in result["resistivityText"]
        assert "Model File:                     box.cut.poly" in result["resistivityText"]

    def test_resistivity_region_count_matches_the_merged_poly(self):
        result = self.apply()

        rows = [
            line
            for line in result["resistivityText"].splitlines()
            if line.strip() and line.strip()[0].isdigit()
        ]
        assert len(rows) == len(result["regions"])
        assert f"Number of regions:              {len(result['regions'])}" in (
            result["resistivityText"]
        )

    def test_poly_text_round_trips(self):
        from MARE2DEM_poly_parser import MARE2DEMPolyParser

        result = self.apply()

        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "out.poly"
            path.write_text(result["polyText"])
            vertices, segments, _, regions = MARE2DEMPolyParser().read_poly_file(
                str(path), unit_scale_factor=1
            )

        assert len(vertices) == len(result["vertices"])
        assert len(segments) == len(result["segments"])
        assert len(regions) == len(result["regions"])

    def test_surfaces_the_unit_warning_without_failing(self):
        # A unit mistake is the user's to judge, not a reason to refuse: the
        # merge still succeeds and the warning rides along.
        result = self.apply(interface="10 12\n90 13\n", parameters=PenaltyCutParameters(units="m"))

        assert any("unit mismatch" in w for w in result["warnings"])

    def test_rejects_an_unreadable_interface(self):
        with pytest.raises(PenaltyCutError, match="at least two points"):
            self.apply(interface="# only a comment\n")


class TestRenderPolyText:
    def test_emits_a_header_matching_the_model(self):
        vertices, segments, holes, regions = box_model()

        text = render_poly_text(vertices, segments, holes, regions)

        assert text.splitlines()[0].split()[0] == str(len(vertices))


class TestParseModelBounds:
    def test_accepts_a_complete_box(self):
        assert parse_model_bounds(
            {"yMin": -1, "yMax": 2, "zMin": 0, "zMax": "3"}
        ) == {"yMin": -1.0, "yMax": 2.0, "zMin": 0.0, "zMax": 3.0}

    def test_rejects_a_missing_key(self):
        with pytest.raises(PenaltyCutError, match="missing 'zMax'"):
            parse_model_bounds({"yMin": 0, "yMax": 1, "zMin": 0})

    def test_rejects_a_non_finite_bound(self):
        with pytest.raises(PenaltyCutError, match="must be finite"):
            parse_model_bounds({"yMin": 0, "yMax": float("inf"), "zMin": 0, "zMax": 1})


class TestFixedRegionsSurviveTheMerge:
    """The end-to-end guarantee: a fixed region is still fixed, at its own row.

    The region-numbering half of this lives in
    ``test_mare2dem_poly_parser.TestMergedRegionAttributes``.
    """

    def test_the_fixed_region_keeps_its_resistivity_at_its_own_index(self):
        vertices, segments, holes, regions = box_model()

        result = apply_penalty_cut(
            vertices,
            segments,
            holes,
            regions,
            RESISTIVITY_TABLE,
            RESISTIVITY_TEXT,
            "0 12\n100 13\n",
            PenaltyCutParameters(units="km"),
            output_poly_name="box.cut.poly",
        )

        rows = [
            line.split()
            for line in result["resistivityText"].splitlines()
            if line.strip() and line.strip()[0].isdigit()
        ]
        fixed = [row for row in rows if int(row[2]) == 0]

        assert len(fixed) == 1
        # Seawater at 0.3, not the body's 10, and reachable at its own row number.
        assert float(fixed[0][1]) == pytest.approx(0.3)
        assert rows[int(fixed[0][0]) - 1] is fixed[0]
