import pandas as pd
import pytest

from MARE2DEM_poly_parser import MARE2DEMPolyParser
from side_trim_service import (
    SideTrimError,
    SideTrimParameters,
    _components,
    apply_side_trim,
    build_trimmed_resistivity,
    parse_boundary_text,
    parse_side_trim_parameters,
    plan_side_trim,
)


class TestParseParameters:
    def test_defaults(self):
        parameters = parse_side_trim_parameters({})

        assert parameters == SideTrimParameters(
            units="km",
            side="below",
            extend_to_bounds=True,
            default_rho=100.0,
            rho_mode="free",
        )

    def test_accepts_explicit_values(self):
        parameters = parse_side_trim_parameters(
            {
                "units": "M",
                "side": "Above",
                "extendToBounds": False,
                "defaultRho": 2.5,
                "rhoMode": "fixed",
            }
        )

        assert parameters.units == "m"
        assert parameters.side == "above"
        assert parameters.extend_to_bounds is False
        assert parameters.default_rho == 2.5
        assert parameters.rho_mode == "fixed"

    def test_rejects_unknown_units(self):
        with pytest.raises(SideTrimError, match="units"):
            parse_side_trim_parameters({"units": "feet"})

    def test_rejects_unknown_side(self):
        with pytest.raises(SideTrimError, match="side"):
            parse_side_trim_parameters({"side": "left"})

    def test_rejects_a_non_boolean_extend_flag(self):
        with pytest.raises(SideTrimError, match="extendToBounds"):
            parse_side_trim_parameters({"extendToBounds": "yes"})

    @pytest.mark.parametrize("value", [0, -5, float("nan"), "abc"])
    def test_rejects_a_non_positive_default_rho(self, value):
        with pytest.raises(SideTrimError, match="[Dd]efault resistivity"):
            parse_side_trim_parameters({"defaultRho": value})

    def test_rejects_an_unknown_rho_mode(self):
        with pytest.raises(SideTrimError, match="rhoMode"):
            parse_side_trim_parameters({"rhoMode": "frozen"})


class TestParseBoundaryText:
    def test_scales_to_metres(self):
        points = parse_boundary_text("0 5\n100 5\n", SideTrimParameters(units="km"))

        assert points == [(0.0, 5_000.0), (100_000.0, 5_000.0)]

    def test_wraps_the_interface_parser_error(self):
        with pytest.raises(SideTrimError, match="two points"):
            parse_boundary_text("0 5\n", SideTrimParameters())


def layered_model(block="region"):
    """Three horizontal layers, with a small block inside the deepest one.

    Splits at z = 5 km (the "seafloor") and z = 12.5 km. Region 1 is the
    upper strip (seawater, fixed), regions 2 and 3 the layers below, and the
    block at (45..55 km, 14..16 km) is region 4 when ``block == "region"``, a
    hole when ``block == "hole"``, or absent when ``block == "none"``.
    Vertex 13 floats unattached at the mid-boundary depth, sitting exactly on
    segment 7-8, which forces the mesh-edge fallback path for that segment.
    """
    width, depth, seafloor, mid = 100_000.0, 20_000.0, 5_000.0, 12_500.0

    def vertex(y, z):
        return {"hCoor": y, "vCoor": z, "attributes": [], "boundary_marker": None}

    vertices = {
        1: vertex(0.0, 0.0),
        2: vertex(width, 0.0),
        3: vertex(width, depth),
        4: vertex(0.0, depth),
        5: vertex(0.0, seafloor),
        6: vertex(width, seafloor),
        7: vertex(0.0, mid),
        8: vertex(width, mid),
        13: vertex(width / 2, mid),
    }
    segments = [
        {"id": 1, "endpoint_1": 1, "endpoint_2": 2, "boundary_marker": 1},
        {"id": 2, "endpoint_1": 2, "endpoint_2": 6, "boundary_marker": 1},
        {"id": 3, "endpoint_1": 6, "endpoint_2": 8, "boundary_marker": 1},
        {"id": 4, "endpoint_1": 8, "endpoint_2": 3, "boundary_marker": 1},
        {"id": 5, "endpoint_1": 3, "endpoint_2": 4, "boundary_marker": 1},
        {"id": 6, "endpoint_1": 4, "endpoint_2": 7, "boundary_marker": 1},
        {"id": 7, "endpoint_1": 7, "endpoint_2": 5, "boundary_marker": 1},
        {"id": 8, "endpoint_1": 5, "endpoint_2": 1, "boundary_marker": 1},
        {"id": 9, "endpoint_1": 5, "endpoint_2": 6, "boundary_marker": 1},
        {"id": 10, "endpoint_1": 7, "endpoint_2": 8, "boundary_marker": 2},
    ]
    holes = []
    regions = [
        {"id": 1, "hCoor": width / 2, "vCoor": 2_500.0, "attribute": 1, "max_area": -1},
        {"id": 2, "hCoor": width / 4, "vCoor": 8_750.0, "attribute": 2, "max_area": -1},
        {"id": 3, "hCoor": width / 4, "vCoor": 18_000.0, "attribute": 3, "max_area": -1},
    ]

    if block != "none":
        vertices.update({
            9: vertex(45_000.0, 14_000.0),
            10: vertex(55_000.0, 14_000.0),
            11: vertex(55_000.0, 16_000.0),
            12: vertex(45_000.0, 16_000.0),
        })
        segments.extend([
            {"id": 11, "endpoint_1": 9, "endpoint_2": 10, "boundary_marker": 2},
            {"id": 12, "endpoint_1": 10, "endpoint_2": 11, "boundary_marker": 2},
            {"id": 13, "endpoint_1": 11, "endpoint_2": 12, "boundary_marker": 2},
            {"id": 14, "endpoint_1": 12, "endpoint_2": 9, "boundary_marker": 2},
        ])
        if block == "region":
            regions.append({
                "id": 4, "hCoor": 50_000.0, "vCoor": 15_000.0,
                "attribute": 4, "max_area": -1,
            })
        else:
            holes.append({"id": 1, "hCoor": 50_000.0, "vCoor": 15_000.0})

    return vertices, segments, holes, regions


SEAFLOOR = [(0.0, 5_000.0), (100_000.0, 5_000.0)]
PARAMS_M = SideTrimParameters(units="m")


class TestPlanSideTrim:
    def test_clears_everything_below_the_seafloor(self):
        vertices, segments, holes, regions = layered_model()

        plan = plan_side_trim(vertices, segments, holes, regions, SEAFLOOR, PARAMS_M)

        assert plan.removed_region_ids == [2, 3, 4]
        assert plan.component_count == 1
        # Interior structure below the seafloor is gone: the mid boundary,
        # the block's four walls, the block's vertices and the floating one.
        assert plan.removed_segment_count == 5
        assert plan.removed_vertex_count == 5
        # The hull -- including its subdivision vertices 7 and 8 -- survives,
        # and so does the seafloor itself.
        assert len(plan.segments) == 9
        remaining_vertices = {
            (round(v["hCoor"]), round(v["vCoor"])) for v in plan.vertices.values()
        }
        assert (0, 12_500) in remaining_vertices
        assert (100_000, 12_500) in remaining_vertices
        assert (50_000, 12_500) not in remaining_vertices
        # One kept region plus one new region seeded from a swallowed one.
        assert len(plan.regions) == 2
        assert plan.regions[0]["attribute"] == 1
        assert plan.regions[1]["attribute"] == 2
        assert plan.regions[1]["vCoor"] == 8_750.0
        assert plan.kept_source_numbers == [1]
        assert plan.new_region_count == 1

    def test_clears_above_and_keeps_the_seafloor(self):
        vertices, segments, holes, regions = layered_model(block="none")
        parameters = SideTrimParameters(units="m", side="above")

        plan = plan_side_trim(vertices, segments, holes, regions, SEAFLOOR, parameters)

        assert plan.removed_region_ids == [1]
        assert plan.removed_segment_count == 0
        assert plan.removed_vertex_count == 0
        assert plan.kept_source_numbers == [2, 3]
        # Kept regions keep file order and renumber contiguously; the new
        # region comes last.
        assert [r["attribute"] for r in plan.regions] == [1, 2, 3]
        assert plan.regions[-1]["vCoor"] == 2_500.0

    def test_removes_a_hole_on_the_cleared_side(self):
        vertices, segments, holes, regions = layered_model(block="hole")

        plan = plan_side_trim(vertices, segments, holes, regions, SEAFLOOR, PARAMS_M)

        assert plan.holes == []
        assert plan.removed_hole_count == 1

    def test_keeps_a_hole_on_the_kept_side(self):
        vertices, segments, holes, regions = layered_model(block="hole")
        parameters = SideTrimParameters(units="m", side="above")

        plan = plan_side_trim(vertices, segments, holes, regions, SEAFLOOR, parameters)

        assert len(plan.holes) == 1
        assert plan.removed_hole_count == 0

    def test_warns_about_removed_penalty_cuts(self):
        vertices, segments, holes, regions = layered_model(block="none")
        segments.append(
            {"id": 11, "endpoint_1": 7, "endpoint_2": 3, "boundary_marker": -1}
        )

        plan = plan_side_trim(vertices, segments, holes, regions, SEAFLOOR, PARAMS_M)

        assert any("penalty cut" in warning for warning in plan.warnings)

    def test_short_boundary_extends_to_the_edges_when_asked(self):
        vertices, segments, holes, regions = layered_model(block="none")
        short = [(40_000.0, 5_000.0), (60_000.0, 5_000.0)]

        plan = plan_side_trim(vertices, segments, holes, regions, short, PARAMS_M)

        assert plan.boundary_points[0] == (0.0, 5_000.0)
        assert plan.boundary_points[-1] == (100_000.0, 5_000.0)
        assert plan.outside_span_count == 0
        assert plan.removed_region_ids == [2, 3]

    def test_short_boundary_without_extension_selects_in_span_and_warns(self):
        # Layer seeds sit at y = 25 km, outside a 40-60 km boundary; only the
        # block's seed (y = 50 km) is in span. The block's walls border the
        # kept region 3, so clearing it removes no geometry at all -- the
        # block just becomes the default-rho region.
        vertices, segments, holes, regions = layered_model()
        short = [(40_000.0, 5_000.0), (60_000.0, 5_000.0)]
        parameters = SideTrimParameters(units="m", extend_to_bounds=False)

        plan = plan_side_trim(vertices, segments, holes, regions, short, parameters)

        assert plan.removed_region_ids == [4]
        assert plan.removed_segment_count == 0
        # Regions 2 and 3 (seeds at y = 25 km) fall beyond the span; region 1
        # (y = 50 km) is in span but on the kept side.
        assert plan.outside_span_count == 2
        assert any("beyond the ends" in warning for warning in plan.warnings)

    def test_a_boundary_missing_every_seed_is_an_error(self):
        vertices, segments, holes, regions = layered_model(block="none")
        # All seeds sit at y = 25 km; a 40-60 km boundary reaches none of them.
        short = [(40_000.0, 5_000.0), (60_000.0, 5_000.0)]
        parameters = SideTrimParameters(units="m", extend_to_bounds=False)

        with pytest.raises(SideTrimError, match="no regions"):
            plan_side_trim(vertices, segments, holes, regions, short, parameters)

    def test_refuses_to_clear_every_region(self):
        vertices, segments, holes, regions = layered_model(block="none")
        above_everything = [(0.0, -1.0), (100_000.0, -1.0)]

        with pytest.raises(SideTrimError, match="every region"):
            plan_side_trim(
                vertices, segments, holes, regions, above_everything, PARAMS_M
            )

    def test_refuses_a_model_without_regions(self):
        vertices, segments, holes, _ = layered_model(block="none")

        with pytest.raises(SideTrimError, match="no regions"):
            plan_side_trim(vertices, segments, holes, [], SEAFLOOR, PARAMS_M)

    def test_a_source_with_a_duplicate_seed_is_an_error(self):
        vertices, segments, holes, regions = layered_model(block="none")
        # Region 3's seed moved onto region 2's: region 3 never claims its
        # own flood-fill area, which is a broken source, not a broken trim.
        regions[2] = dict(
            regions[2], hCoor=regions[1]["hCoor"], vCoor=regions[1]["vCoor"]
        )

        with pytest.raises(SideTrimError, match="[Ss]ource model's region seed"):
            plan_side_trim(vertices, segments, holes, regions, SEAFLOOR, PARAMS_M)


class TestComponents:
    def test_disconnected_labels_form_separate_components(self):
        components = _components({1, 2, 3}, [(1, 2)])

        assert sorted(sorted(group) for group in components) == [[1, 2], [3]]

    def test_everything_linked_is_one_component(self):
        components = _components({1, 2, 3}, [(1, 2), (2, 3)])

        assert len(components) == 1


RESISTIVITY_TEXT = (
    "Format:                         mare2dem_1.1                     ! input \n"
    "Model File:                     layered.poly                     ! input \n"
    "Data File:                      survey.data                      ! input \n"
    "Global Bounds:                  0.1, 100000                      ! opt. input \n"
    "Anisotropy:                     isotropic                        ! input \n"
    "Number of regions:              4                                ! input \n"
    "!#        Rho           Param      Lower        Upper         Prej         Weight       \n"
    "1         0.3           0          0            0             0            0            \n"
    "2         10            1          1            1000          0            0            \n"
    "3         20            2          1            1000          0            0            \n"
    "4         50            3          0.5          2000          0            0            \n"
)

RESISTIVITY_TABLE = pd.DataFrame(
    [
        [1, 0.3, 0, 0, 0, 0, 0],
        [2, 10.0, 1, 1.0, 1000.0, 0, 0],
        [3, 20.0, 2, 1.0, 1000.0, 0, 0],
        [4, 50.0, 3, 0.5, 2000.0, 0, 0],
    ],
    columns=["#", "Rho", "Param", "Lower", "Upper", "Prej", "Weight"],
)


def below_plan():
    vertices, segments, holes, regions = layered_model()
    return plan_side_trim(vertices, segments, holes, regions, SEAFLOOR, PARAMS_M)


class TestBuildTrimmedResistivity:
    def test_inherits_kept_rows_and_appends_a_free_default(self):
        text, table, stats = build_trimmed_resistivity(
            RESISTIVITY_TABLE,
            RESISTIVITY_TEXT,
            below_plan(),
            PARAMS_M,
            "layered.trimmed.poly",
        )

        assert len(table) == 2
        # Region 1 keeps its fixed row untouched.
        assert float(table.iloc[0]["Rho"]) == 0.3
        assert int(table.iloc[0]["Param"]) == 0
        # The new region takes the default rho as free parameter 1, with the
        # mode of the deleted free rows' bounds and no prejudice.
        assert float(table.iloc[1]["Rho"]) == 100.0
        assert int(table.iloc[1]["Param"]) == 1
        assert float(table.iloc[1]["Lower"]) == 1.0
        assert float(table.iloc[1]["Upper"]) == 1000.0
        assert float(table.iloc[1]["Prej"]) == 0.0
        assert float(table.iloc[1]["Weight"]) == 0.0
        assert stats.fixed_regions == 1
        assert stats.free_parameters == 1
        assert "Number of regions:              2" in text
        assert "layered.trimmed.poly" in text

    def test_fixed_mode_writes_param_zero_and_renumbers(self):
        vertices, segments, holes, regions = layered_model(block="none")
        parameters = SideTrimParameters(units="m", side="above", rho_mode="fixed")
        plan = plan_side_trim(vertices, segments, holes, regions, SEAFLOOR, parameters)

        _, table, stats = build_trimmed_resistivity(
            RESISTIVITY_TABLE, RESISTIVITY_TEXT, plan, parameters,
            "layered.trimmed.poly",
        )

        # Kept regions 2 and 3 renumber to free parameters 1 and 2; the new
        # fixed region consumes no index.
        assert [int(v) for v in table["Param"]] == [1, 2, 0]
        assert float(table.iloc[2]["Rho"]) == 100.0
        assert float(table.iloc[2]["Lower"]) == 0.0
        assert stats.fixed_regions == 1
        assert stats.free_parameters == 2

    def test_missing_source_row_is_an_error(self):
        # The "above" plan keeps regions 2 and 3; a table holding only rows 1
        # and 2 has no row for region 3.
        vertices, segments, holes, regions = layered_model(block="none")
        parameters = SideTrimParameters(units="m", side="above")
        plan = plan_side_trim(vertices, segments, holes, regions, SEAFLOOR, parameters)
        short_table = RESISTIVITY_TABLE.iloc[:2]

        with pytest.raises(SideTrimError, match="no row"):
            build_trimmed_resistivity(
                short_table,
                RESISTIVITY_TEXT,
                plan,
                parameters,
                "layered.trimmed.poly",
            )

    def test_a_nan_region_cell_is_reported_not_crashed(self):
        # ResistivityFileParser fills a ragged row's cells with NaN; the row
        # can never be selected, and asking for it is the actionable "no row"
        # error rather than a pandas crash.
        table = RESISTIVITY_TABLE.copy()
        table.loc[0, "#"] = float("nan")

        with pytest.raises(SideTrimError, match="no row"):
            build_trimmed_resistivity(
                table,
                RESISTIVITY_TEXT,
                below_plan(),
                PARAMS_M,
                "layered.trimmed.poly",
            )

    def test_all_nan_bound_columns_leave_the_new_row_at_zero(self):
        table = RESISTIVITY_TABLE.copy()
        table["Lower"] = float("nan")
        table["Upper"] = float("nan")

        _, result, _ = build_trimmed_resistivity(
            table, RESISTIVITY_TEXT, below_plan(), PARAMS_M, "layered.trimmed.poly",
        )

        assert float(result.iloc[1]["Lower"]) == 0.0
        assert float(result.iloc[1]["Upper"]) == 0.0

    def test_bounds_fall_back_to_the_whole_files_free_rows(self):
        # side="above" deletes only region 1, whose row is fixed; with no
        # deleted free row to copy, the whole file's free rows stand in.
        vertices, segments, holes, regions = layered_model()
        parameters = SideTrimParameters(units="m", side="above")
        plan = plan_side_trim(vertices, segments, holes, regions, SEAFLOOR, parameters)

        _, table, _ = build_trimmed_resistivity(
            RESISTIVITY_TABLE, RESISTIVITY_TEXT, plan, parameters,
            "layered.trimmed.poly",
        )

        assert float(table.iloc[3]["Lower"]) == 1.0
        assert float(table.iloc[3]["Upper"]) == 1000.0

    def test_no_free_rows_anywhere_leaves_the_new_row_at_zero(self):
        table = RESISTIVITY_TABLE.copy()
        table["Param"] = 0

        _, result, _ = build_trimmed_resistivity(
            table, RESISTIVITY_TEXT, below_plan(), PARAMS_M, "layered.trimmed.poly",
        )

        assert float(result.iloc[1]["Lower"]) == 0.0
        assert float(result.iloc[1]["Upper"]) == 0.0


class TestApplySideTrim:
    def test_returns_a_model_that_round_trips(self, tmp_path):
        vertices, segments, holes, regions = layered_model()

        result = apply_side_trim(
            vertices, segments, holes, regions,
            RESISTIVITY_TABLE, RESISTIVITY_TEXT,
            SEAFLOOR, PARAMS_M, "layered.trimmed.poly",
        )

        assert result["stats"]["removedRegionCount"] == 3
        assert result["stats"]["trimmedRegionCount"] == 2
        assert result["stats"]["componentCount"] == 1
        assert result["stats"]["fixedRegionCount"] == 1
        assert result["stats"]["freeParameterCount"] == 1
        assert result["removedRegionIds"] == [2, 3, 4]

        # The emitted text is a valid .poly holding the trimmed model.
        path = tmp_path / "trimmed.poly"
        path.write_text(result["polyText"], encoding="utf-8")
        parsed = MARE2DEMPolyParser().read_poly_file(str(path), unit_scale_factor=1)
        rt_vertices, rt_segments, rt_holes, rt_regions = parsed
        assert len(rt_regions) == 2
        assert len(rt_vertices) == len(result["vertices"])
        assert len(rt_segments) == len(result["segments"])

        # And the resistivity names the trimmed poly with two rows.
        assert "Number of regions:              2" in result["resistivityText"]

    def test_warns_when_no_fixed_region_survives(self):
        vertices, segments, holes, regions = layered_model(block="none")
        parameters = SideTrimParameters(units="m", side="above")

        result = apply_side_trim(
            vertices, segments, holes, regions,
            RESISTIVITY_TABLE, RESISTIVITY_TEXT,
            SEAFLOOR, parameters, "layered.trimmed.poly",
        )

        assert any("No fixed regions" in warning for warning in result["warnings"])

    def test_fixed_mode_carries_through_the_full_apply(self):
        vertices, segments, holes, regions = layered_model(block="none")
        parameters = SideTrimParameters(units="m", side="above", rho_mode="fixed")

        result = apply_side_trim(
            vertices, segments, holes, regions,
            RESISTIVITY_TABLE, RESISTIVITY_TEXT,
            SEAFLOOR, parameters, "layered.trimmed.poly",
        )

        # Kept regions 2 and 3 renumber to free parameters 1 and 2; the new
        # fixed region consumes no index, and the emitted file agrees.
        assert result["stats"]["fixedRegionCount"] == 1
        assert result["stats"]["freeParameterCount"] == 2
        data_rows = [
            line.split()
            for line in result["resistivityText"].splitlines()
            if line.strip() and line.strip()[0].isdigit()
        ]
        assert [int(row[2]) for row in data_rows] == [1, 2, 0]
