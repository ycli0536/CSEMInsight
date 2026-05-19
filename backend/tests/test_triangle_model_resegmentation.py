import pandas as pd
import pytest

from triangle_model_resegmentation import (
    Component,
    ResegmentationError,
    build_connected_components,
    build_forward_resistivity_text,
    build_poly_text,
    build_region_metadata_lookup,
    build_triangle_assignments,
    compute_triangle_area,
    compute_triangle_centroid,
    merge_small_components,
    parse_resegmentation_parameters,
)


def test_parse_resegmentation_parameters_accepts_valid_payload():
    params = parse_resegmentation_parameters(
        {
            "roi": {"yMin": 0, "yMax": 10, "zMin": -2, "zMax": 5},
            "rhoLevels": [0.3, 3, 30],
            "onlyFreeParameters": True,
            "boundaryTolerance": 12.5,
            "minimumRegionArea": 100,
        }
    )

    assert params.roi.y_min == 0
    assert params.roi.y_max == 10
    assert params.roi.z_min == -2
    assert params.roi.z_max == 5
    assert params.rho_levels == [0.3, 3.0, 30.0]
    assert params.only_free_parameters is True
    assert params.boundary_tolerance == 12.5
    assert params.minimum_region_area == 100


@pytest.mark.parametrize(
    "payload",
    [
        {"roi": {"yMin": 10, "yMax": 0, "zMin": 0, "zMax": 1}, "rhoLevels": [1]},
        {"roi": {"yMin": 0, "yMax": 1, "zMin": 2, "zMax": 1}, "rhoLevels": [1]},
        {"roi": {"yMin": 0, "yMax": 1, "zMin": 0, "zMax": 1}, "rhoLevels": [0]},
        {
            "roi": {"yMin": 0, "yMax": 1, "zMin": 0, "zMax": 1},
            "rhoLevels": [1],
            "boundaryTolerance": -1,
        },
        {
            "roi": {"yMin": 0, "yMax": 1, "zMin": 0, "zMax": 1},
            "rhoLevels": [1],
            "minimumRegionArea": -1,
        },
    ],
)
def test_parse_resegmentation_parameters_rejects_invalid_payload(payload):
    with pytest.raises(ResegmentationError):
        parse_resegmentation_parameters(payload)


def test_build_region_metadata_lookup_reads_implicit_region_column():
    parsed = {
        "table": pd.DataFrame(
            [
                [1, 10.0, 1, 0, 0, 0, 0],
                [2, 100.0, 0, 0, 0, 0, 0],
            ],
            columns=["!#", "Rho", "Param", "Lower", "Upper", "Prej", "Weight"],
        )
    }

    lookup = build_region_metadata_lookup(parsed, require_param=True)

    assert lookup[1].rho == 10.0
    assert lookup[1].param == 1.0
    assert lookup[2].rho == 100.0
    assert lookup[2].param == 0.0


def test_build_region_metadata_lookup_reads_explicit_region_column():
    parsed = {
        "table": pd.DataFrame(
            [{"Region": 7, "Rho": 30.0, "Param": 2, "Lower": 0}]
        )
    }

    lookup = build_region_metadata_lookup(parsed, require_param=True)

    assert lookup[7].rho == 30.0
    assert lookup[7].param == 2.0


def test_build_region_metadata_lookup_requires_param_when_requested():
    parsed = {"table": pd.DataFrame([{"Region": 1, "Rho": 10.0}])}

    with pytest.raises(ResegmentationError, match="Param"):
        build_region_metadata_lookup(parsed, require_param=True)


def test_triangle_centroid_and_area():
    points = [(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)]

    assert compute_triangle_centroid(points, (0, 1, 2)) == pytest.approx((4 / 3, 1))
    assert compute_triangle_area(points, (0, 1, 2)) == pytest.approx(6.0)


def test_build_triangle_assignments_uses_roi_param_and_log_rho_levels():
    params = parse_resegmentation_parameters(
        {
            "roi": {"yMin": -1, "yMax": 2, "zMin": -1, "zMax": 2},
            "rhoLevels": [10, 100],
            "onlyFreeParameters": True,
            "boundaryTolerance": 0,
            "minimumRegionArea": 0,
        }
    )
    points = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0), (5.0, 4.0)]
    triangles = [(0, 1, 2), (1, 3, 2), (1, 4, 3)]
    metadata = {
        1: type("Meta", (), {"rho": 12.0, "param": 1.0})(),
        2: type("Meta", (), {"rho": 90.0, "param": 0.0})(),
        3: type("Meta", (), {"rho": 50.0, "param": 1.0})(),
    }

    assignments, stats, warnings = build_triangle_assignments(
        points, triangles, [1, 2, 3], metadata, params
    )

    assert assignments[0].active is True
    assert assignments[0].rho == 10.0
    assert assignments[1].active is False
    assert assignments[1].rho == 90.0
    assert assignments[2].active is False
    assert stats["activeTriangleCount"] == 1
    assert warnings == []


def test_build_connected_components_splits_disconnected_same_rho():
    params = parse_resegmentation_parameters(
        {
            "roi": {"yMin": -1, "yMax": 5, "zMin": -1, "zMax": 5},
            "rhoLevels": [10],
            "onlyFreeParameters": True,
        }
    )
    points = [
        (0.0, 0.0),
        (1.0, 0.0),
        (0.0, 1.0),
        (4.0, 0.0),
        (5.0, 0.0),
        (4.0, 1.0),
    ]
    triangles = [(0, 1, 2), (3, 4, 5)]
    metadata = {
        1: type("Meta", (), {"rho": 9.0, "param": 1.0})(),
        2: type("Meta", (), {"rho": 11.0, "param": 1.0})(),
    }
    assignments, _, _ = build_triangle_assignments(
        points, triangles, [1, 2], metadata, params
    )

    components, component_by_triangle = build_connected_components(
        points, triangles, assignments
    )

    assert len(components) == 2
    assert set(component_by_triangle) == {1, 2}
    assert [component.rho for component in components] == [10.0, 10.0]


def test_merge_small_components_uses_nearest_rho_then_shared_boundary():
    points = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)]
    triangles = [(0, 1, 2), (1, 3, 2)]
    components = [
        Component(1, "a", 10.0, "resegmented", [0], 0.1),
        Component(2, "b", 30.0, "resegmented", [1], 1.0),
    ]

    merged, component_by_triangle, warnings, merge_count = merge_small_components(
        points, triangles, components, minimum_area=0.5
    )

    assert merge_count == 1
    assert warnings == []
    assert len(merged) == 1
    assert component_by_triangle == [2, 2]


def test_build_forward_resistivity_text_uses_fixed_forward_columns():
    regions = [
        Component(1, "a", 10.0, "resegmented", [0], 1.0),
        Component(2, "b", 100.0, "resegmented", [1], 1.0),
    ]

    text = build_forward_resistivity_text("out.poly", regions)

    assert "Model File:                     out.poly" in text
    assert "Number of regions:              2" in text
    assert "1         10" in text
    assert "2         100" in text
    assert "0          0            0             0            0" in text


def test_build_poly_text_exports_boundary_segments_and_region_seeds():
    points = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)]
    triangles = [(0, 1, 2), (1, 3, 2)]
    components = [
        Component(1, "a", 10.0, "resegmented", [0], 0.5),
        Component(2, "b", 100.0, "resegmented", [1], 0.5),
    ]

    poly_text, stats, warnings = build_poly_text(
        points, triangles, components, component_by_triangle=[1, 2], holes=[]
    )

    lines = poly_text.splitlines()
    assert lines[0] == "4 2 0 0"
    assert "5 2 3 1" in lines
    assert "0" in lines
    assert lines[-3] == "2"
    assert lines[-2].endswith("1 -1")
    assert lines[-1].endswith("2 -1")
    assert stats["outputRegionCount"] == 2
    assert stats["outputSegmentCount"] == 5
    assert warnings == []
