import numpy as np
import pandas as pd
import pytest

from poly_region_inheritance import (
    RegionInheritanceError,
    build_derived_resistivity_text,
    build_inherited_table,
    find_parameter_columns,
    find_region_column,
    find_rho_columns,
    map_regions_to_source,
    renumber_free_parameters,
)


ISOTROPIC_COLUMNS = ["#", "Rho", "Param", "Lower", "Upper", "Prej", "Weight"]
ANISOTROPIC_COLUMNS = [
    "#",
    "Rho-z",
    "Rho-h",
    "Param z",
    "Param h",
    "Lower z",
    "Upper z",
]


def isotropic_table(rows):
    """rows: list of (rho, param) -- the other columns are zero."""
    return pd.DataFrame(
        [
            [index + 1, rho, param, 0, 0, 0, 0]
            for index, (rho, param) in enumerate(rows)
        ],
        columns=ISOTROPIC_COLUMNS,
    )


def anisotropic_table(rows):
    """rows: list of (rho_z, rho_h, param_z, param_h)."""
    return pd.DataFrame(
        [
            [index + 1, rho_z, rho_h, param_z, param_h, 0, 0]
            for index, (rho_z, rho_h, param_z, param_h) in enumerate(rows)
        ],
        columns=ANISOTROPIC_COLUMNS,
    )


class TestColumnDetection:
    def test_finds_isotropic_columns(self):
        assert find_parameter_columns(ISOTROPIC_COLUMNS) == ["Param"]
        assert find_rho_columns(ISOTROPIC_COLUMNS) == ["Rho"]
        assert find_region_column(ISOTROPIC_COLUMNS) == "#"

    def test_finds_anisotropic_columns_in_file_order(self):
        assert find_parameter_columns(ANISOTROPIC_COLUMNS) == ["Param z", "Param h"]
        assert find_rho_columns(ANISOTROPIC_COLUMNS) == ["Rho-z", "Rho-h"]

    def test_ignores_unrelated_columns(self):
        assert find_parameter_columns(["Lower", "Upper", "Prej", "Weight"]) == []
        assert find_region_column(["Rho", "Param"]) is None


class TestRenumberFreeParameters:
    def test_numbers_free_regions_contiguously(self):
        table = isotropic_table([(10, 7), (10, 41), (10, 99)])

        result = renumber_free_parameters(table)

        assert list(result["Param"]) == [1, 2, 3]

    def test_fixed_regions_stay_zero_and_consume_no_index(self):
        # Air and seawater sit in the middle; the sequence must step over them.
        table = isotropic_table([(10, 5), (1e13, 0), (0.3, 0), (10, 6), (10, 7)])

        result = renumber_free_parameters(table)

        assert list(result["Param"]) == [1, 0, 0, 2, 3]

    def test_anisotropic_indices_interleave_across_columns(self):
        # MARE2DEM writes one global sequence row-major over (region, column):
        # region 1 takes 1 and 2, region 3 takes 3 and 4, ...
        table = anisotropic_table(
            [(10, 10, 9, 9), (0.3, 0.3, 0, 0), (10, 10, 9, 9), (10, 10, 9, 9)]
        )

        result = renumber_free_parameters(table)

        assert list(result["Param z"]) == [1, 0, 3, 5]
        assert list(result["Param h"]) == [2, 0, 4, 6]

    def test_does_not_mutate_the_input(self):
        table = isotropic_table([(10, 7), (10, 41)])

        renumber_free_parameters(table)

        assert list(table["Param"]) == [7, 41]

    def test_handles_an_empty_table(self):
        table = isotropic_table([])

        result = renumber_free_parameters(table)

        assert result.empty


class TestBuildInheritedTable:
    def test_split_region_keeps_the_source_resistivity_on_every_piece(self):
        source = isotropic_table([(10.0, 1), (250.0, 2)])

        # Source region 1 (index 1) split into three pieces by a cut line.
        table, stats = build_inherited_table(source, [0, 1, 1, 1])

        assert list(table["Rho"]) == [10.0, 250.0, 250.0, 250.0]
        assert stats.inherited == 4
        assert stats.unmatched == 0

    def test_split_region_becomes_independent_free_parameters(self):
        source = isotropic_table([(250.0, 2)])

        table, _ = build_inherited_table(source, [0, 0, 0])

        # Not [2, 2, 2] -- pieces bound to one parameter are one unknown and
        # could never differ, which would make the cut pointless.
        assert list(table["Param"]) == [1, 2, 3]

    def test_fixed_regions_stay_fixed(self):
        # This is the whole point: air and seawater must not become free.
        source = isotropic_table([(1e13, 0), (0.3, 0), (10.0, 1)])

        table, stats = build_inherited_table(source, [0, 1, 2, 2])

        assert list(table["Param"]) == [0, 0, 1, 2]
        assert list(table["Rho"]) == [1e13, 0.3, 10.0, 10.0]
        assert stats.fixed_regions == 2
        assert stats.free_parameters == 2

    def test_unmatched_regions_take_the_default_and_are_free(self):
        source = isotropic_table([(1e13, 0), (10.0, 1)])

        table, stats = build_inherited_table(source, [0, 1, None], default_rho=42.0)

        assert list(table["Rho"]) == [1e13, 10.0, 42.0]
        assert list(table["Param"]) == [0, 1, 2]
        assert stats.inherited == 2
        assert stats.unmatched == 1

    def test_region_numbers_are_renumbered_contiguously(self):
        source = isotropic_table([(10.0, 1), (20.0, 2), (30.0, 3)])

        table, _ = build_inherited_table(source, [2, 0, 1])

        assert list(table["#"]) == [1, 2, 3]

    def test_carries_bounds_and_prejudice_across(self):
        source = pd.DataFrame(
            [[1, 10.0, 1, 0.5, 500.0, 12.0, 3.0]],
            columns=ISOTROPIC_COLUMNS,
        )

        table, _ = build_inherited_table(source, [0, 0])

        assert list(table["Lower"]) == [0.5, 0.5]
        assert list(table["Upper"]) == [500.0, 500.0]
        assert list(table["Prej"]) == [12.0, 12.0]
        assert list(table["Weight"]) == [3.0, 3.0]

    def test_anisotropic_source_keeps_both_columns_fixed(self):
        source = anisotropic_table([(0.3, 0.3, 0, 0), (10.0, 20.0, 1, 2)])

        table, stats = build_inherited_table(source, [0, 1, 1])

        assert list(table["Param z"]) == [0, 1, 3]
        assert list(table["Param h"]) == [0, 2, 4]
        assert list(table["Rho-h"]) == [0.3, 20.0, 20.0]
        assert stats.fixed_regions == 1
        assert stats.free_parameters == 4

    def test_rejects_a_mapping_outside_the_source_table(self):
        source = isotropic_table([(10.0, 1)])

        with pytest.raises(RegionInheritanceError, match="source table has 1 rows"):
            build_inherited_table(source, [0, 5])

    def test_rejects_an_empty_source_table(self):
        with pytest.raises(RegionInheritanceError, match="no region table"):
            build_inherited_table(isotropic_table([]), [0])


class TestMapRegionsToSource:
    @staticmethod
    def two_box_model():
        """A unit square split in half by a horizontal segment at z = 1.

        Region 1 is the lower half, region 2 the upper half.
        """
        vertices = {
            1: {"hCoor": 0.0, "vCoor": 0.0, "attributes": [], "boundary_marker": None},
            2: {"hCoor": 2.0, "vCoor": 0.0, "attributes": [], "boundary_marker": None},
            3: {"hCoor": 2.0, "vCoor": 2.0, "attributes": [], "boundary_marker": None},
            4: {"hCoor": 0.0, "vCoor": 2.0, "attributes": [], "boundary_marker": None},
            5: {"hCoor": 0.0, "vCoor": 1.0, "attributes": [], "boundary_marker": None},
            6: {"hCoor": 2.0, "vCoor": 1.0, "attributes": [], "boundary_marker": None},
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
            {"id": 1, "hCoor": 1.0, "vCoor": 0.5, "attribute": 1, "max_area": -1},
            {"id": 2, "hCoor": 1.0, "vCoor": 1.5, "attribute": 2, "max_area": -1},
        ]
        return vertices, segments, regions

    def test_maps_each_seed_to_the_region_that_contains_it(self):
        vertices, segments, regions = self.two_box_model()

        # Three derived seeds: two in the lower half, one in the upper.
        targets = [
            {"id": 1, "hCoor": 0.5, "vCoor": 0.5},
            {"id": 2, "hCoor": 1.5, "vCoor": 0.25},
            {"id": 3, "hCoor": 1.0, "vCoor": 1.75},
        ]

        assert map_regions_to_source(vertices, segments, regions, targets) == [0, 0, 1]

    def test_seed_outside_the_source_model_is_unmatched(self):
        vertices, segments, regions = self.two_box_model()

        targets = [
            {"id": 1, "hCoor": 1.0, "vCoor": 0.5},
            {"id": 2, "hCoor": 99.0, "vCoor": 99.0},
        ]

        assert map_regions_to_source(vertices, segments, regions, targets) == [0, None]

    def test_no_target_regions_maps_to_nothing(self):
        vertices, segments, regions = self.two_box_model()

        assert map_regions_to_source(vertices, segments, regions, []) == []

    def test_rejects_a_source_model_without_regions(self):
        vertices, segments, _ = self.two_box_model()

        with pytest.raises(RegionInheritanceError, match="no regions"):
            map_regions_to_source(vertices, segments, [], [{"hCoor": 1.0, "vCoor": 0.5}])


SOURCE_TEXT = (
    "Format:                         mare2dem_1.1                     ! input \n"
    "Model File:                     source.poly                      ! input \n"
    "Data File:                      EMAGE_CSEM_line3_long_name.data ! input \n"
    "Global Bounds:                  0.1, 100000                      ! opt. input \n"
    "Penalty Cut Weight:             0.1                              ! opt. input \n"
    "Model Roughness:                40.65                            ! output from inversion \n"
    "Model Misfit:                   9.6855                           ! output from inversion \n"
    "Date/Time:                      20-May-2026 15:40:24             ! output from inversion \n"
    "Anisotropy:                     isotropic                        ! input \n"
    "Number of regions:              2                                ! input \n"
    "!#        Rho           Param      Lower        Upper         Prej         Weight       \n"
    "1         10            1          0            0             0            0            \n"
    "2         0.3           0          0            0             0            0            \n"
)


class TestBuildDerivedResistivityText:
    @staticmethod
    def render(table=None, **kwargs):
        table = isotropic_table([(10.0, 1), (0.3, 0), (25.0, 2)]) if table is None else table
        kwargs.setdefault("model_file", "derived.poly")
        return build_derived_resistivity_text(SOURCE_TEXT, table, **kwargs)

    def test_carries_run_settings_across_untouched(self):
        # Regenerating the header from defaults is how a model loses its data
        # file and its inversion bounds.
        text = self.render()

        assert "Data File:                      EMAGE_CSEM_line3_long_name.data" in text
        assert "Global Bounds:                  0.1, 100000" in text
        assert "Penalty Cut Weight:             0.1" in text
        assert "Anisotropy:                     isotropic" in text

    def test_updates_model_file_and_region_count(self):
        text = self.render()

        assert "Model File:                     derived.poly" in text
        assert "Number of regions:              3" in text
        assert "source.poly" not in text

    def test_keeps_the_comment_column_aligned(self):
        text = self.render()

        for line in text.splitlines():
            if line.startswith(("Model File:", "Number of regions:")):
                assert line.index("!") == 65, line

    def test_blanks_the_source_inversion_results(self):
        # 40.65 / 9.6855 describe the source run; on a different region list they
        # are not just stale, they are misleading.
        text = self.render()

        assert "40.65" not in text
        assert "9.6855" not in text
        assert "Model Roughness:" in text
        assert "Model Misfit:" in text

    def test_keeps_the_source_timestamp_by_default(self):
        assert "20-May-2026 15:40:24" in self.render()

    def test_stamps_a_new_timestamp_when_asked(self):
        text = self.render(timestamp="21-Aug-2026 09:00:00")

        assert "21-Aug-2026 09:00:00" in text
        assert "20-May-2026 15:40:24" not in text

    def test_replaces_the_region_rows_wholesale(self):
        text = self.render()
        rows = [line for line in text.splitlines() if line.strip() and line.strip()[0].isdigit()]

        assert len(rows) == 3
        assert [int(row.split()[0]) for row in rows] == [1, 2, 3]
        assert [int(row.split()[2]) for row in rows] == [1, 0, 2]

    def test_writes_rho_in_the_reference_writer_format(self):
        text = self.render()
        first_row = next(
            line for line in text.splitlines() if line.strip() and line.strip()[0].isdigit()
        )

        # mare2dem_io.f90 writes es12.4 for physical values.
        assert first_row.split()[1] == "1.0000E+01"

    def test_round_trips_through_the_project_parser(self, tmp_path):
        from resistivity_file_parser import ResistivityFileParser

        path = tmp_path / "derived.resistivity"
        path.write_text(self.render())

        parsed = ResistivityFileParser().parse_resistivity_file(str(path), rho_parse=True)

        assert parsed["Number of regions"]["value"] == 3
        assert list(parsed["table"]["Param"]) == [1, 0, 2]
        assert parsed["table"]["Rho"].tolist() == [10.0, 0.3, 25.0]

    def test_supports_anisotropic_tables(self):
        table = anisotropic_table([(10.0, 20.0, 1, 2), (0.3, 0.3, 0, 0)])

        text = self.render(table=table)
        rows = [line for line in text.splitlines() if line.strip() and line.strip()[0].isdigit()]

        assert [row.split()[3] for row in rows] == ["1", "0"]
        assert [row.split()[4] for row in rows] == ["2", "0"]

    def test_rejects_a_source_without_a_table_header(self):
        with pytest.raises(RegionInheritanceError, match="no '!#' table header"):
            build_derived_resistivity_text(
                "Format:  mare2dem_1.1\n", isotropic_table([(10.0, 1)]), "derived.poly"
            )


#: MARE2DEM's own writer: a leading space, no trailing comment, value at column 33.
#: Mamba2D writes the same fields one column left and adds "! input". Assuming
#: either layout shifts the other's columns.
MARE2DEM_WRITTEN_TEXT = (
    " Format:                         MARE2DEM_1.1\n"
    " Model File:                     source.poly\n"
    " Data File:                      EMAGE_LINE2_s4IC.cl_ef035_test.data\n"
    " Global Bounds:                  1.0000E-01,   1.0000E+05\n"
    " Model Roughness:                4.0650E+01\n"
    " Anisotropy:                     isotropic\n"
    " Number of regions:                 38232\n"
    "!#        Rho           Param      Lower        Upper         Prej         Weight\n"
    "       1   1.0000E+01        1   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00\n"
)


class TestMare2demWrittenHeader:
    @staticmethod
    def render():
        return build_derived_resistivity_text(
            MARE2DEM_WRITTEN_TEXT,
            isotropic_table([(10.0, 1), (0.3, 0)]),
            model_file="derived.poly",
        )

    def test_keeps_the_value_column_of_this_layout(self):
        text = self.render()

        for line in text.splitlines():
            if line.startswith(" Model File:") or line.startswith(" Number of regions:"):
                assert line.index(line.strip().split()[-1]) == 33, repr(line)

    def test_updates_the_fields_that_describe_the_new_model(self):
        text = self.render()

        assert " Model File:                     derived.poly" in text
        assert " Number of regions:              2" in text
        assert "source.poly" not in text

    def test_carries_the_settings_across(self):
        text = self.render()

        assert " Data File:                      EMAGE_LINE2_s4IC.cl_ef035_test.data" in text
        assert " Global Bounds:                  1.0000E-01,   1.0000E+05" in text

    def test_blanks_the_source_inversion_result(self):
        assert "4.0650E+01" not in self.render()
