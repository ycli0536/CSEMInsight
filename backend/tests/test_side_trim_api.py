"""Endpoint tests for clearing one side of a model along a boundary.

Two routes, mirroring the rho bounds pair: ask what a trim would remove,
then commit. Preview deliberately does not take the .resistivity -- it is
one of the files about to be replaced.
"""

import io
import json

import pytest

from main import app
from penalty_cut_service import render_poly_text
from test_side_trim_service import RESISTIVITY_TEXT, layered_model


@pytest.fixture()
def client():
    app.config.update(TESTING=True)
    with app.test_client() as test_client:
        yield test_client


BOUNDARY = b"0 5000\n100000 5000\n"


def poly_bytes():
    return render_poly_text(*layered_model()).encode("utf-8")


def post_preview(client, parameters=None, poly=None, boundary=BOUNDARY):
    data = {
        "parameters": json.dumps({"units": "m", **(parameters or {})}),
    }
    if poly is not False:
        data["poly_file"] = (io.BytesIO(poly or poly_bytes()), "layered.poly")
    if boundary is not None:
        data["boundary_file"] = (io.BytesIO(boundary), "seafloor.txt")
    return client.post(
        "/api/preview-side-trim", data=data, content_type="multipart/form-data"
    )


def post_apply(client, parameters=None, poly_name="layered.poly"):
    data = {
        "parameters": json.dumps(
            {"units": "m", "defaultRho": 100, "rhoMode": "free", **(parameters or {})}
        ),
        "poly_file": (io.BytesIO(poly_bytes()), poly_name),
        "boundary_file": (io.BytesIO(BOUNDARY), "seafloor.txt"),
        "resistivity_file": (
            io.BytesIO(RESISTIVITY_TEXT.encode("utf-8")),
            "layered.19.resistivity",
        ),
    }
    return client.post(
        "/api/apply-side-trim", data=data, content_type="multipart/form-data"
    )


class TestPreviewSideTrim:
    def test_reports_what_a_trim_would_remove(self, client):
        response = post_preview(client)

        assert response.status_code == 200
        payload = response.get_json()
        assert payload["side"] == "below"
        assert payload["removedRegionIds"] == [2, 3, 4]
        assert payload["stats"]["removedRegionCount"] == 3
        assert payload["stats"]["totalRegionCount"] == 4
        assert payload["points"][0] == [0.0, 5000.0]

    def test_extends_a_short_boundary(self, client):
        response = post_preview(client, boundary=b"40000 5000\n60000 5000\n")

        assert response.status_code == 200
        payload = response.get_json()
        assert payload["points"][0] == [0.0, 5000.0]
        assert payload["points"][-1] == [100000.0, 5000.0]

    def test_missing_boundary_file_is_a_400(self, client):
        response = post_preview(client, boundary=None)

        assert response.status_code == 400
        assert "hint" in response.get_json()

    def test_selecting_nothing_is_a_400(self, client):
        response = post_preview(client, parameters={"side": "above"},
                                boundary=b"0 100\n100000 100\n")

        assert response.status_code == 400
        assert "no regions" in response.get_json()["error"]


class TestApplySideTrim:
    def test_returns_the_trimmed_model_and_both_files(self, client):
        response = post_apply(client)

        assert response.status_code == 200
        payload = response.get_json()
        assert payload["polyFileName"] == "layered.trimmed.poly"
        assert payload["resistivityFileName"] == "layered.trimmed.0.resistivity"
        assert payload["stats"]["trimmedRegionCount"] == 2
        # The full viewer payload rides along, in kilometres.
        assert "constrainedMesh" in payload
        assert len(payload["regions"]) == 2
        assert payload["polyText"].splitlines()[0].split()[0].isdigit()
        assert "Number of regions:              2" in payload["resistivityText"]

    def test_output_name_does_not_stack(self, client):
        response = post_apply(client, poly_name="layered.trimmed.poly")

        assert response.status_code == 200
        assert response.get_json()["polyFileName"] == "layered.trimmed.poly"

    def test_wrong_poly_suffix_is_a_400(self, client):
        response = post_apply(client, poly_name="layered.txt")

        assert response.status_code == 400
        assert "Invalid" in response.get_json()["error"]

    def test_non_utf8_resistivity_is_a_400(self, client):
        data = {
            "parameters": json.dumps({"units": "m", "defaultRho": 100}),
            "poly_file": (io.BytesIO(poly_bytes()), "layered.poly"),
            "boundary_file": (io.BytesIO(BOUNDARY), "seafloor.txt"),
            "resistivity_file": (
                io.BytesIO("Rho \xe9".encode("latin-1")),
                "layered.19.resistivity",
            ),
        }
        response = client.post(
            "/api/apply-side-trim", data=data, content_type="multipart/form-data"
        )

        assert response.status_code == 400
        assert "UTF-8" in response.get_json()["error"]

    def test_clearing_everything_is_a_400(self, client):
        data = {
            "parameters": json.dumps(
                {"units": "m", "side": "below", "defaultRho": 100}
            ),
            "poly_file": (io.BytesIO(poly_bytes()), "layered.poly"),
            "boundary_file": (io.BytesIO(b"0 -1\n100000 -1\n"), "top.txt"),
            "resistivity_file": (
                io.BytesIO(RESISTIVITY_TEXT.encode("utf-8")),
                "layered.resistivity",
            ),
        }
        response = client.post(
            "/api/apply-side-trim", data=data, content_type="multipart/form-data"
        )

        assert response.status_code == 400
        assert "every region" in response.get_json()["error"]
