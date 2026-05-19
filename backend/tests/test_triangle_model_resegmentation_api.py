import io
import json

import pytest

import main as backend_main


@pytest.fixture()
def app_client():
    backend_main.app.config["TESTING"] = True
    with backend_main.app.test_client() as client:
        yield client


SIMPLE_POLY = b"""4 2 0 0
1 0 0
2 10 0
3 10 10
4 0 10
4 1
1 1 2 1
2 2 3 1
3 3 4 1
4 4 1 1
0
1
1 5 5 1 -1
"""


SIMPLE_RESISTIVITY = b"""Format:                         mare2dem_1.1
Model File:                     simple.poly
Number of regions:              1
!#        Rho           Param      Lower        Upper         Prej         Weight
1         20            1          0            0             0            0
"""


def post_resegmentation(client, endpoint, parameters):
    return client.post(
        endpoint,
        data={
            "poly_file": (io.BytesIO(SIMPLE_POLY), "simple.poly"),
            "resistivity_file": (
                io.BytesIO(SIMPLE_RESISTIVITY),
                "simple.resistivity",
            ),
            "parameters": json.dumps(parameters),
        },
        content_type="multipart/form-data",
    )


def valid_parameters():
    return {
        "roi": {"yMin": -1, "yMax": 11, "zMin": -1, "zMax": 11},
        "rhoLevels": [10, 100],
        "onlyFreeParameters": True,
        "boundaryTolerance": 0,
        "minimumRegionArea": 0,
    }


def test_preview_triangle_resegmentation_returns_preview_payload(app_client):
    response = post_resegmentation(
        app_client,
        "/api/preview-triangle-resegmentation",
        valid_parameters(),
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["stats"]["activeTriangleCount"] == 2
    assert payload["stats"]["outputRegionCount"] == 1
    assert len(payload["previewMesh"]["triangles"]) == 2
    assert payload["previewMesh"]["triangleResistivityValues"] == [10.0, 10.0]
    assert payload["warnings"] == []


def test_export_triangle_resegmentation_returns_poly_and_resistivity_text(app_client):
    response = post_resegmentation(
        app_client,
        "/api/export-triangle-resegmentation",
        valid_parameters(),
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["polyFileName"] == "simple.resegmented.poly"
    assert payload["resistivityFileName"] == "simple.resegmented.resistivity"
    assert "4 2 0 0" in payload["polyText"]
    assert "Number of regions:              1" in payload["resistivityText"]
    assert "1         10" in payload["resistivityText"]
    assert "0          0            0             0            0" in payload["resistivityText"]


def test_preview_triangle_resegmentation_rejects_invalid_parameters(app_client):
    response = post_resegmentation(
        app_client,
        "/api/preview-triangle-resegmentation",
        {
            "roi": {"yMin": 1, "yMax": 0, "zMin": 0, "zMax": 1},
            "rhoLevels": [10],
        },
    )

    assert response.status_code == 400
    assert "error" in response.get_json()


def test_preview_triangle_resegmentation_requires_files(app_client):
    response = app_client.post(
        "/api/preview-triangle-resegmentation",
        data={"parameters": json.dumps(valid_parameters())},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert "poly" in response.get_json()["error"].lower()
