import io
import json

import pytest

import main as backend_main
from triangle_resistivity_export import (
    ResistivityExportError,
    build_exported_resistivity_text,
)


OFFICIAL_STYLE_RESISTIVITY = """Format:                         MARE2DEM_1.1
Model File:                     simple.poly
Number of regions:              2
!#        Rho           Param      Lower        Upper         Prej         Weight
       1   1.0000E+02        1   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00 ! sediment
       2   1.0000E+12        0   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00
"""


@pytest.fixture()
def app_client():
    backend_main.app.config["TESTING"] = True
    with backend_main.app.test_client() as client:
        yield client


def test_export_updates_rho_in_official_implicit_region_table():
    text = build_exported_resistivity_text(
        OFFICIAL_STYLE_RESISTIVITY,
        {1: 250.0},
    )

    assert "Number of regions:              2" in text
    assert "1 2.5000000000E+02 1" in text
    assert "! sediment" in text
    assert "2   1.0000E+12" in text


def test_export_updates_rho_in_explicit_region_table():
    source = """Format: MARE2DEM_1.1
!# Region Rho Param Lower Upper Prej Weight
10 10 1 0 0 0 0
20 100 2 0 0 0 0
"""

    text = build_exported_resistivity_text(source, {20: 1000.0})

    assert "10 10 1 0 0 0 0" in text
    assert "20 1.0000000000E+03 2 0 0 0 0" in text


def test_export_rejects_updates_without_matching_regions():
    with pytest.raises(ResistivityExportError, match="No matching regions"):
        build_exported_resistivity_text(OFFICIAL_STYLE_RESISTIVITY, {99: 5.0})


def test_export_endpoint_returns_downloadable_resistivity_file(app_client):
    response = app_client.post(
        "/api/export-triangle-resistivity",
        data={
            "resistivity_file": (
                io.BytesIO(OFFICIAL_STYLE_RESISTIVITY.encode("utf-8")),
                "simple.resistivity",
            ),
            "region_rho_updates": json.dumps({"1": 250.0}),
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    assert response.mimetype == "text/plain"
    assert "simple.edited.resistivity" in response.headers["Content-Disposition"]
    assert b"1 2.5000000000E+02 1" in response.data


def test_export_endpoint_accepts_large_updates_as_json_file_part(app_client):
    large_updates = {"1": 250.0}
    large_updates.update({str(index): float(index) for index in range(2, 50000)})

    response = app_client.post(
        "/api/export-triangle-resistivity",
        data={
            "resistivity_file": (
                io.BytesIO(OFFICIAL_STYLE_RESISTIVITY.encode("utf-8")),
                "simple.resistivity",
            ),
            "region_rho_updates": (
                io.BytesIO(json.dumps(large_updates).encode("utf-8")),
                "region-rho-updates.json",
            ),
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    assert b"1 2.5000000000E+02 1" in response.data
