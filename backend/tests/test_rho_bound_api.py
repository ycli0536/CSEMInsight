"""Endpoint tests for setting per-region resistivity bounds from a shape.

Two routes, mirroring the penalty cut's two stages: ask how much of the model a
shape covers, then commit. Preview deliberately does not take the .resistivity
-- it is the file about to be overwritten.
"""

import io
import json

import pytest

import main as backend_main
from penalty_cut_service import render_poly_text
from test_penalty_cut_service import RESISTIVITY_TEXT, box_model


@pytest.fixture()
def app_client():
    backend_main.app.config["TESTING"] = True
    with backend_main.app.test_client() as client:
        yield client


@pytest.fixture()
def model_files():
    """A .poly / .resistivity pair as upload-ready bytes.

    The box model is 100 km wide and 20 km deep: region 1 is the strip above
    5 km, region 2 the body below it.
    """
    vertices, segments, holes, regions = box_model()
    return {
        "poly": render_poly_text(vertices, segments, holes, regions).encode(),
        "resistivity": RESISTIVITY_TEXT.encode(),
    }


def upload(name, data):
    return (io.BytesIO(data), name)


def rows(text):
    return {
        line.split()[0]: line.split()
        for line in text.splitlines()
        if line.strip() and line.split()[0].isdigit()
    }


class TestPreviewRhoBounds:
    @staticmethod
    def post(app_client, model_files, shape=b"0 10\n100 10\n", **parameters):
        parameters.setdefault("units", "km")
        return app_client.post(
            "/api/preview-rho-bounds",
            data={
                "poly_file": upload("box.poly", model_files["poly"]),
                "shape_file": upload("basement.txt", shape),
                "parameters": json.dumps(parameters),
            },
            content_type="multipart/form-data",
        )

    def test_reports_which_regions_a_boundary_covers(self, app_client, model_files):
        payload = self.post(app_client, model_files).get_json()

        # Depth is positive down: only the body below 10 km is picked.
        assert payload["selectedRegionIds"] == [2]
        assert payload["stats"]["selectedRegionCount"] == 1
        assert payload["stats"]["totalRegionCount"] == 2
        assert payload["points"][0] == [0, 10_000]

    def test_the_other_side_covers_the_rest(self, app_client, model_files):
        payload = self.post(app_client, model_files, side="above").get_json()

        assert payload["selectedRegionIds"] == [1]

    def test_takes_a_polygon_as_json_points(self, app_client, model_files):
        # A lasso in the viewer has no file to upload, so the points travel in
        # the parameters and go through the same unit rule.
        response = app_client.post(
            "/api/preview-rho-bounds",
            data={
                "poly_file": upload("box.poly", model_files["poly"]),
                "parameters": json.dumps(
                    {
                        "shape": "polygon",
                        "units": "km",
                        "points": [[40, 8], [60, 8], [60, 18], [40, 18]],
                    }
                ),
            },
            content_type="multipart/form-data",
        )

        assert response.get_json()["selectedRegionIds"] == [2]

    def test_warns_when_a_shape_selects_nothing(self, app_client, model_files):
        payload = self.post(app_client, model_files, shape=b"0 25\n100 25\n").get_json()

        assert payload["selectedRegionIds"] == []
        assert any("selected no regions" in w for w in payload["warnings"])

    def test_warns_about_a_unit_mismatch(self, app_client, model_files):
        # 0..100 read as metres spans a thousandth of a 100 km model.
        payload = self.post(app_client, model_files, units="m").get_json()

        assert any("unit mismatch" in w for w in payload["warnings"])

    def test_reports_regions_beyond_the_ends_of_the_boundary(
        self, app_client, model_files
    ):
        payload = self.post(app_client, model_files, shape=b"0 10\n10 10\n").get_json()

        assert payload["stats"]["outsideShapeSpanCount"] == 2
        assert any("beyond the ends" in w for w in payload["warnings"])

    def test_rejects_a_missing_poly(self, app_client):
        response = app_client.post(
            "/api/preview-rho-bounds",
            data={
                "shape_file": upload("basement.txt", b"0 10\n100 10\n"),
                "parameters": json.dumps({}),
            },
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "No .poly file provided" in response.get_json()["error"]

    def test_rejects_a_request_with_no_shape_at_all(self, app_client, model_files):
        response = app_client.post(
            "/api/preview-rho-bounds",
            data={
                "poly_file": upload("box.poly", model_files["poly"]),
                "parameters": json.dumps({}),
            },
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "No shape provided" in response.get_json()["error"]


class TestApplyRhoBounds:
    @staticmethod
    def post(app_client, model_files, shape=b"0 10\n100 10\n", **parameters):
        parameters.setdefault("units", "km")
        parameters.setdefault("lower", 1)
        parameters.setdefault("upper", 500)
        return app_client.post(
            "/api/apply-rho-bounds",
            data={
                "poly_file": upload("box.poly", model_files["poly"]),
                "resistivity_file": upload(
                    "box.0.resistivity", model_files["resistivity"]
                ),
                "shape_file": upload("basement.txt", shape),
                "parameters": json.dumps(parameters),
            },
            content_type="multipart/form-data",
        )

    def test_bounds_the_selected_regions_and_names_the_output(
        self, app_client, model_files
    ):
        payload = self.post(app_client, model_files).get_json()

        assert payload["resistivityFileName"] == "box.0.bounded.resistivity"
        table = rows(payload["resistivityText"])
        assert [float(table["2"][3]), float(table["2"][4])] == [1.0, 500.0]
        assert [float(table["1"][3]), float(table["1"][4])] == [0.0, 0.0]

    def test_reports_what_it_wrote(self, app_client, model_files):
        stats = self.post(app_client, model_files).get_json()["stats"]

        assert stats["selectedRegionCount"] == 1
        assert stats["updatedRowCount"] == 1
        assert stats["boundColumns"] == ["Lower", "Upper"]
        assert (stats["lower"], stats["upper"]) == (1.0, 500.0)

    def test_leaves_the_rho_values_alone(self, app_client, model_files):
        # Bounds constrain the next inversion; rewriting rho here would quietly
        # change the result of the last one.
        payload = self.post(app_client, model_files).get_json()

        table = rows(payload["resistivityText"])
        assert float(table["2"][1]) == 10.0
        assert float(table["1"][1]) == 0.3

    def test_a_pair_of_zeros_clears_the_bounds_again(self, app_client, model_files):
        bounded = self.post(app_client, model_files).get_json()["resistivityText"]
        cleared = app_client.post(
            "/api/apply-rho-bounds",
            data={
                "poly_file": upload("box.poly", model_files["poly"]),
                "resistivity_file": upload("box.0.resistivity", bounded.encode()),
                "shape_file": upload("basement.txt", b"0 10\n100 10\n"),
                "parameters": json.dumps({"units": "km", "lower": 0, "upper": 0}),
            },
            content_type="multipart/form-data",
        ).get_json()

        table = rows(cleared["resistivityText"])
        assert [float(table["2"][3]), float(table["2"][4])] == [0.0, 0.0]

    def test_rejects_a_one_sided_bound(self, app_client, model_files):
        response = self.post(app_client, model_files, upper=0)

        assert response.status_code == 400
        assert "Bounds come as a pair" in response.get_json()["error"]

    def test_rejects_a_shape_that_selects_nothing(self, app_client, model_files):
        response = self.post(app_client, model_files, shape=b"0 25\n100 25\n")

        assert response.status_code == 400
        assert "No regions were selected" in response.get_json()["error"]

    def test_rejects_a_wrong_extension(self, app_client, model_files):
        response = app_client.post(
            "/api/apply-rho-bounds",
            data={
                "poly_file": upload("box.poly", model_files["poly"]),
                "resistivity_file": upload("box.txt", model_files["resistivity"]),
                "shape_file": upload("basement.txt", b"0 10\n100 10\n"),
                "parameters": json.dumps({"lower": 1, "upper": 500}),
            },
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "Invalid .resistivity file" in response.get_json()["error"]

    def test_does_not_change_the_mesh(self, app_client, model_files):
        # Bounds and penalty cuts are independent: this one rewrites two
        # columns and returns no geometry at all, so the two compose in either
        # order.
        payload = self.post(app_client, model_files).get_json()

        assert "vertices" not in payload
        assert "segments" not in payload
        assert "polyText" not in payload
