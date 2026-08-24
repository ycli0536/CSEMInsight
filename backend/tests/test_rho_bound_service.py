"""Unit tests for setting per-region resistivity bounds from a shape.

The interesting half of this feature is geometric -- which regions a boundary
or a polygon covers -- so most of these tests are about selection, and the rest
about writing two columns of a .resistivity without disturbing the others.
"""

import math

import pytest

from rho_bound_service import (
    RhoBoundError,
    RhoBoundParameters,
    admissible_rho_range,
    build_bounded_resistivity_text,
    parse_rho_bound_parameters,
    parse_shape_points,
    parse_shape_text,
    select_regions,
)

#: A model 100 km wide and 20 km deep, one region per 5 km depth band, all at
#: the same y so a boundary alone decides which are picked.
REGIONS = [
    {"id": 1, "hCoor": 50_000.0, "vCoor": 2_500.0, "attribute": 1, "max_area": -1},
    {"id": 2, "hCoor": 50_000.0, "vCoor": 7_500.0, "attribute": 2, "max_area": -1},
    {"id": 3, "hCoor": 50_000.0, "vCoor": 12_500.0, "attribute": 3, "max_area": -1},
    {"id": 4, "hCoor": 50_000.0, "vCoor": 17_500.0, "attribute": 4, "max_area": -1},
]

ISOTROPIC_RESISTIVITY = (
    "Format:                         MARE2DEM_1.1\n"
    "Bounds Transform:               bandpass\n"
    "Global Bounds:                  1.0000E-01,   1.0000E+05\n"
    "Number of regions:              4\n"
    "!#        Rho           Param      Lower        Upper         Prej         Weight\n"
    "       1   5.9380E-01        1   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00\n"
    "       2   3.1000E-01        0   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00\n"
    "       3   6.7727E+02        2   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00\n"
    "       4   3.9900E+02        3   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00\n"
)

# An anisotropic header separates a column from its direction qualifier with a
# single space, so the bound columns are only findable by a reader that puts
# "Lower z" back together.
ANISOTROPIC_RESISTIVITY = (
    "Format:                         MARE2DEM_1.1\n"
    "Anisotropy:                     tiz\n"
    "!#       Rho-z        Rho-xy       Param z  Param xy Lower z      Upper z      "
    "Lower xy     Upper xy\n"
    "       1   8.8461       1.4373       1        2        0.0000E+00   0.0000E+00   "
    "0.0000E+00   0.0000E+00\n"
    "       2   1.0000E+12   1.0000E+12   0        0        0.0000E+00   0.0000E+00   "
    "0.0000E+00   0.0000E+00\n"
)


def rows(text):
    """The data rows of a .resistivity table, keyed by region number."""
    return {
        line.split()[0]: line.split()
        for line in text.splitlines()
        if line.strip() and line.split()[0].isdigit()
    }


class TestParseParameters:
    def test_defaults(self):
        parameters = parse_rho_bound_parameters({})

        assert parameters == RhoBoundParameters(
            shape="boundary", units="km", side="below", lower=0.0, upper=0.0,
            component=None,
        )

    def test_accepts_the_supported_shapes_sides_and_units(self):
        parameters = parse_rho_bound_parameters(
            {"shape": "polygon", "side": "Above", "units": "M", "lower": 1, "upper": 500}
        )

        assert parameters.shape == "polygon"
        assert parameters.side == "above"
        assert parameters.units == "m"
        assert (parameters.lower, parameters.upper) == (1.0, 500.0)

    def test_rejects_an_unknown_shape(self):
        with pytest.raises(RhoBoundError, match="Unknown shape"):
            parse_rho_bound_parameters({"shape": "circle"})

    def test_rejects_an_unknown_side(self):
        with pytest.raises(RhoBoundError, match="Unknown side"):
            parse_rho_bound_parameters({"side": "left"})

    def test_accepts_a_pair_of_zeros_as_clearing_the_bounds(self):
        # Zero is not "unset": it is the value that sends a region back to
        # Global Bounds, which is the only way to undo a bound.
        parameters = parse_rho_bound_parameters({"lower": 0, "upper": 0})

        assert (parameters.lower, parameters.upper) == (0.0, 0.0)

    @pytest.mark.parametrize(
        "payload", [{"lower": 1, "upper": 0}, {"lower": 0, "upper": 500}]
    )
    def test_rejects_a_one_sided_bound(self, payload):
        with pytest.raises(RhoBoundError, match="Bounds come as a pair"):
            parse_rho_bound_parameters(payload)

    def test_rejects_an_inverted_band(self):
        with pytest.raises(RhoBoundError, match="must be below the upper bound"):
            parse_rho_bound_parameters({"lower": 500, "upper": 1})

    @pytest.mark.parametrize("value", [-1, float("nan"), "abc"])
    def test_rejects_an_unusable_bound(self, value):
        with pytest.raises(RhoBoundError):
            parse_rho_bound_parameters({"lower": value, "upper": 500})


class TestParseResetRho:
    def test_accepts_a_value_inside_the_band(self):
        parameters = parse_rho_bound_parameters(
            {"lower": 1, "upper": 500, "resetRho": 50}
        )

        assert parameters.reset_rho == 50.0

    @pytest.mark.parametrize("value", [0.5, 500, 1, 900])
    def test_rejects_a_value_on_or_outside_the_band(self, value):
        # On a bound is no better than outside it: the transform is singular
        # there, which is the failure this whole clamp exists to prevent.
        with pytest.raises(RhoBoundError, match="strictly inside the band"):
            parse_rho_bound_parameters(
                {"lower": 1, "upper": 500, "resetRho": value}
            )

    def test_rejects_a_value_when_the_bounds_are_being_cleared(self):
        with pytest.raises(RhoBoundError, match="no band to sit inside"):
            parse_rho_bound_parameters({"lower": 0, "upper": 0, "resetRho": 50})


class TestParseShape:
    def test_reads_a_two_column_file_in_kilometres(self):
        points = parse_shape_text(
            "# top of basement\n0 10\n100, 12\n", RhoBoundParameters()
        )

        assert points == [(0.0, 10_000.0), (100_000.0, 12_000.0)]

    def test_reads_json_points_through_the_same_unit_rule(self):
        # A polygon drawn in the viewer and one read from disk have to land in
        # the same place, or the preview and the export disagree.
        parameters = RhoBoundParameters(shape="polygon")
        from_json = parse_shape_points(
            [[0, 10], [100, 10], [100, 12]], parameters
        )
        from_file = parse_shape_text("0 10\n100 10\n100 12\n", parameters)

        assert from_json == from_file

    def test_accepts_json_points_as_objects(self):
        points = parse_shape_points(
            [{"y": 0, "z": 10}, {"y": 100, "z": 10}, {"y": 100, "z": 12}],
            RhoBoundParameters(shape="polygon"),
        )

        assert points[0] == (0.0, 10_000.0)

    def test_rejects_a_polygon_that_cannot_enclose_anything(self):
        with pytest.raises(RhoBoundError, match="polygon needs at least 3 points"):
            parse_shape_text("0 10\n100 12\n", RhoBoundParameters(shape="polygon"))

    def test_rejects_a_malformed_json_point(self):
        with pytest.raises(RhoBoundError, match="Shape point 2"):
            parse_shape_points([[0, 10], [100]], RhoBoundParameters(shape="polygon"))


class TestSelectByBoundary:
    BOUNDARY = [(0.0, 10_000.0), (100_000.0, 10_000.0)]

    def test_selects_what_lies_below_the_line(self):
        selection = select_regions(REGIONS, self.BOUNDARY, RhoBoundParameters())

        # Depth is positive down, so "below" is the deeper pair.
        assert selection.region_ids == [3, 4]
        assert selection.total_count == 4

    def test_selects_what_lies_above_the_line(self):
        selection = select_regions(
            REGIONS, self.BOUNDARY, RhoBoundParameters(side="above")
        )

        assert selection.region_ids == [1, 2]

    def test_follows_a_dipping_boundary(self):
        # The line runs from 5 km deep at y=0 to 15 km deep at y=100 km, so
        # which side a region falls on depends on its own y.
        dipping = [(0.0, 5_000.0), (100_000.0, 15_000.0)]
        regions = [
            {"id": 1, "hCoor": 10_000.0, "vCoor": 7_500.0, "attribute": 1},
            {"id": 2, "hCoor": 90_000.0, "vCoor": 7_500.0, "attribute": 2},
        ]

        selection = select_regions(regions, dipping, RhoBoundParameters())

        # At y=10 km the boundary is 6 km deep and at y=90 km it is 14 km deep,
        # so the same 7.5 km region is below it at one end and above at the other.
        assert selection.region_ids == [1]

    def test_leaves_regions_beyond_the_ends_of_the_boundary_alone(self):
        # Extrapolating a horizon past its last point is how a bound lands on
        # regions nobody looked at.
        short = [(40_000.0, 10_000.0), (60_000.0, 10_000.0)]
        regions = REGIONS + [
            {"id": 5, "hCoor": 95_000.0, "vCoor": 17_500.0, "attribute": 5}
        ]

        selection = select_regions(regions, short, RhoBoundParameters())

        assert selection.region_ids == [3, 4]
        assert selection.outside_span_count == 1

    def test_keys_the_selection_on_the_region_attribute(self):
        # MARE2DEM identifies a region by its attribute, and so does the
        # .resistivity table; selecting on the .poly's ordering would write
        # bounds onto rows nobody picked.
        regions = [
            {"id": 1, "hCoor": 50_000.0, "vCoor": 17_500.0, "attribute": 42},
        ]

        selection = select_regions(regions, self.BOUNDARY, RhoBoundParameters())

        assert selection.region_ids == [42]

    def test_rejects_a_model_without_regions(self):
        with pytest.raises(RhoBoundError, match="no regions"):
            select_regions(None, self.BOUNDARY, RhoBoundParameters())


class TestSelectByPolygon:
    #: A box over the middle of the section, 5 km to 15 km deep.
    BOX = [
        (40_000.0, 5_000.0),
        (60_000.0, 5_000.0),
        (60_000.0, 15_000.0),
        (40_000.0, 15_000.0),
    ]

    def test_selects_the_regions_inside_it(self):
        selection = select_regions(
            REGIONS, self.BOX, RhoBoundParameters(shape="polygon")
        )

        assert selection.region_ids == [2, 3]

    def test_ignores_regions_outside_its_horizontal_extent(self):
        regions = [{"id": 1, "hCoor": 90_000.0, "vCoor": 7_500.0, "attribute": 1}]

        selection = select_regions(
            regions, self.BOX, RhoBoundParameters(shape="polygon")
        )

        assert selection.region_ids == []

    def test_handles_a_concave_polygon(self):
        # A C-shape: the notch has to stay unselected, which a bounding-box
        # test would get wrong.
        c_shape = [
            (0.0, 0.0),
            (100_000.0, 0.0),
            (100_000.0, 4_000.0),
            (20_000.0, 4_000.0),
            (20_000.0, 16_000.0),
            (100_000.0, 16_000.0),
            (100_000.0, 20_000.0),
            (0.0, 20_000.0),
        ]
        regions = [
            {"id": 1, "hCoor": 50_000.0, "vCoor": 2_000.0, "attribute": 1},
            {"id": 2, "hCoor": 50_000.0, "vCoor": 10_000.0, "attribute": 2},
            {"id": 3, "hCoor": 10_000.0, "vCoor": 10_000.0, "attribute": 3},
        ]

        selection = select_regions(
            regions, c_shape, RhoBoundParameters(shape="polygon")
        )

        assert selection.region_ids == [1, 3]


class TestBuildBoundedText:
    PARAMETERS = RhoBoundParameters(lower=1.0, upper=500.0)

    def test_writes_the_bounds_of_the_selected_regions_only(self):
        text, stats, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY, [3, 4], self.PARAMETERS
        )

        table = rows(text)
        assert [float(table["3"][3]), float(table["3"][4])] == [1.0, 500.0]
        assert [float(table["4"][3]), float(table["4"][4])] == [1.0, 500.0]
        assert [float(table["1"][3]), float(table["1"][4])] == [0.0, 0.0]
        assert stats["updatedRowCount"] == 2

    def test_leaves_the_parameter_prejudice_and_weight_columns_untouched(self):
        text, _, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY, [3], self.PARAMETERS
        )

        table = rows(text)
        assert table["3"][2] == "2"  # Param
        assert [float(value) for value in table["3"][5:]] == [0.0, 0.0]

    def test_leaves_a_rho_that_already_fits_the_band_alone(self):
        # Region 1 sits at 0.594 ohm-m, inside 0.1..1000, so the inversion's
        # own value stands: nothing is gained by moving it.
        text, stats, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY,
            [1],
            RhoBoundParameters(lower=0.1, upper=1000.0),
        )

        assert float(rows(text)["1"][1]) == 5.9380e-01
        assert stats["clampedRowCount"] == 0

    def test_keeps_the_header_and_the_untouched_rows_byte_for_byte(self):
        text, _, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY, [3], self.PARAMETERS
        )

        source = ISOTROPIC_RESISTIVITY.splitlines()
        updated = text.splitlines()
        assert len(updated) == len(source)
        for original, rewritten in zip(source, updated):
            if original.split()[:1] == ["3"]:
                continue
            assert rewritten == original

    def test_keeps_the_columns_of_a_rewritten_row_lined_up(self):
        # A real file has tens of thousands of rows and only some are selected,
        # so re-flowing the ones that change would leave a table that lines up
        # in places and not in others.
        text, _, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY, [3], self.PARAMETERS
        )

        lines = {line.split()[0]: line for line in text.splitlines() if line.split()[:1] in (["3"], ["4"])}
        assert lines["3"].index("1.0000E+00") == lines["4"].index("0.0000E+00")

    def test_clears_a_bound_back_to_the_global_one(self):
        bounded, _, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY, [3], self.PARAMETERS
        )

        cleared, _, _ = build_bounded_resistivity_text(
            bounded, [3], RhoBoundParameters(lower=0.0, upper=0.0)
        )

        table = rows(cleared)
        assert [float(table["3"][3]), float(table["3"][4])] == [0.0, 0.0]

    def test_writes_every_bound_pair_of_an_anisotropic_file(self):
        text, stats, _ = build_bounded_resistivity_text(
            ANISOTROPIC_RESISTIVITY, [1], self.PARAMETERS
        )

        table = rows(text)
        assert [float(value) for value in table["1"][5:9]] == [1.0, 500.0, 1.0, 500.0]
        assert stats["boundColumns"] == [
            "Lower xy",
            "Upper xy",
            "Lower z",
            "Upper z",
        ]

    def test_restricts_the_update_to_a_named_component(self):
        text, stats, _ = build_bounded_resistivity_text(
            ANISOTROPIC_RESISTIVITY,
            [1],
            RhoBoundParameters(lower=1.0, upper=500.0, component="z"),
        )

        table = rows(text)
        assert [float(value) for value in table["1"][5:7]] == [1.0, 500.0]
        assert [float(value) for value in table["1"][7:9]] == [0.0, 0.0]
        assert stats["boundColumns"] == ["Lower z", "Upper z"]

    def test_reports_a_component_the_file_does_not_have(self):
        with pytest.raises(RhoBoundError, match="no Lower/Upper bound columns"):
            build_bounded_resistivity_text(
                ISOTROPIC_RESISTIVITY,
                [1],
                RhoBoundParameters(lower=1.0, upper=500.0, component="xy"),
            )

    def test_reports_a_selection_that_matches_no_row(self):
        with pytest.raises(RhoBoundError, match="None of the selected regions"):
            build_bounded_resistivity_text(
                ISOTROPIC_RESISTIVITY, [9_999], self.PARAMETERS
            )

    def test_reports_an_empty_selection(self):
        with pytest.raises(RhoBoundError, match="No regions were selected"):
            build_bounded_resistivity_text(ISOTROPIC_RESISTIVITY, [], self.PARAMETERS)


class TestClampRhoIntoTheBand:
    """MARE2DEM refuses to start when a free parameter sits outside its bounds.

    transformToUnbound_inputarrays checks every free parameter against its
    band, and the bandpass transform has nothing to map an outside value to, so
    writing bounds without moving rho would produce a file that cannot be run.
    """

    PARAMETERS = RhoBoundParameters(lower=1.0, upper=500.0)

    def test_the_admissible_range_stops_short_of_the_bounds(self):
        low, high = admissible_rho_range(1.0, 500.0)

        # 1% of the band's log10 width in from each end, so the margin means
        # the same thing for a narrow band and one spanning decades.
        assert 1.0 < low < high < 500.0
        assert low == pytest.approx(10 ** (0.01 * math.log10(500)))
        assert high == pytest.approx(10 ** (0.99 * math.log10(500)))

    def test_moves_a_free_parameter_above_the_band_to_its_top(self):
        text, stats, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY, [3], self.PARAMETERS
        )

        _, high = admissible_rho_range(1.0, 500.0)
        assert float(rows(text)["3"][1]) == pytest.approx(high, rel=1e-4)
        assert stats["clampedRowCount"] == 1

    def test_moves_a_free_parameter_below_the_band_to_its_floor(self):
        text, _, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY, [1], RhoBoundParameters(lower=10.0, upper=500.0)
        )

        low, _ = admissible_rho_range(10.0, 500.0)
        assert float(rows(text)["1"][1]) == pytest.approx(low, rel=1e-4)

    def test_leaves_a_fixed_region_at_its_own_resistivity(self):
        # Region 2 carries Param 0: seawater, never inverted for and never
        # transformed. Dragging it into a band meant for the rock below would
        # change the model for nothing.
        text, stats, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY, [2], self.PARAMETERS
        )

        table = rows(text)
        assert float(table["2"][1]) == 3.1000e-01
        assert [float(table["2"][3]), float(table["2"][4])] == [1.0, 500.0]
        assert stats["clampedRowCount"] == 0

    def test_uses_the_reset_value_when_one_is_given(self):
        text, stats, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY,
            [3, 4],
            RhoBoundParameters(lower=1.0, upper=500.0, reset_rho=50.0),
        )

        table = rows(text)
        assert float(table["3"][1]) == 50.0  # was 677, outside the band
        assert float(table["4"][1]) == 3.9900e02  # was 399, already inside
        assert stats["clampedRowCount"] == 1

    def test_clears_a_bound_without_touching_rho(self):
        # Going back to Global Bounds cannot strand a parameter: whatever the
        # rho is, it satisfied the global band when the file was written.
        text, stats, _ = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY, [3], RhoBoundParameters(lower=0.0, upper=0.0)
        )

        assert float(rows(text)["3"][1]) == 6.7727e02
        assert stats["clampedRowCount"] == 0

    def test_reports_where_each_clamped_value_landed(self):
        # The viewer has to be able to show what the file now holds, keyed by
        # the column it is displaying.
        _, _, clamped = build_bounded_resistivity_text(
            ISOTROPIC_RESISTIVITY, [3, 4], self.PARAMETERS
        )

        _, high = admissible_rho_range(1.0, 500.0)
        assert set(clamped) == {"Rho"}
        assert clamped["Rho"][3] == pytest.approx(high, rel=1e-4)
        # Region 4 was already at 399, inside the band, so it is not reported.
        assert 4 not in clamped["Rho"]

    def test_keys_the_report_on_each_anisotropic_column(self):
        _, _, clamped = build_bounded_resistivity_text(
            ANISOTROPIC_RESISTIVITY, [1], RhoBoundParameters(lower=1.0, upper=5.0)
        )

        assert set(clamped) == {"Rho-z"}
        assert set(clamped["Rho-z"]) == {1}

    def test_clamps_each_component_of_an_anisotropic_file_on_its_own_param(self):
        # Region 2 is fixed in both components (Param z and Param xy are 0) at
        # 1e12, the air value; region 1 is free in both.
        text, stats, _ = build_bounded_resistivity_text(
            ANISOTROPIC_RESISTIVITY, [1, 2], RhoBoundParameters(lower=1.0, upper=5.0)
        )

        table = rows(text)
        low, high = admissible_rho_range(1.0, 5.0)
        assert float(table["1"][1]) == pytest.approx(high, rel=1e-4)  # 8.85 -> top
        assert float(table["1"][2]) == pytest.approx(1.4373, rel=1e-4)  # already in
        assert float(table["2"][1]) == 1.0e12
        assert stats["clampedRowCount"] == 1
        assert low < high
