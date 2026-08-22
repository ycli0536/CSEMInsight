"""Endpoint tests for the penalty-cut flow.

The two routes mirror the two-stage UI: drop a file and see where the line
lands (``/api/parse-interface``), then commit to the merge
(``/api/apply-penalty-cut``).
"""

import io
import json

import pytest

import main as backend_main
from conftest import SAMPLE_DATA_DIR, requires_sample_files
from penalty_cut_service import render_poly_text
from test_penalty_cut_service import RESISTIVITY_TEXT, box_model, model_bounds


@pytest.fixture()
def app_client():
    backend_main.app.config["TESTING"] = True
    with backend_main.app.test_client() as client:
        yield client


@pytest.fixture()
def model_files():
    """A .poly / .resistivity pair as upload-ready bytes."""
    vertices, segments, holes, regions = box_model()
    poly_text = render_poly_text(vertices, segments, holes, regions)
    return {
        "poly": poly_text.encode(),
        "resistivity": RESISTIVITY_TEXT.encode(),
        "bounds": model_bounds(vertices),
    }


def upload(name, data):
    return (io.BytesIO(data), name)


class TestParseInterfaceEndpoint:
    def test_returns_points_in_metres_with_the_file_name(self, app_client):
        response = app_client.post(
            "/api/parse-interface",
            data={
                "cut_file": upload("basement.txt", b"# horizon\n10 12\n90 13\n"),
                "parameters": json.dumps({"units": "km"}),
            },
            content_type="multipart/form-data",
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert payload["points"] == [[10_000.0, 12_000.0], [90_000.0, 13_000.0]]
        assert payload["cutFileName"] == "basement.txt"
        assert payload["warnings"] == []

    def test_warns_about_a_unit_mismatch_when_given_model_bounds(
        self, app_client, model_files
    ):
        response = app_client.post(
            "/api/parse-interface",
            data={
                "cut_file": upload("basement.txt", b"10 12\n90 13\n"),
                "parameters": json.dumps(
                    {"units": "m", "modelBounds": model_files["bounds"]}
                ),
            },
            content_type="multipart/form-data",
        )

        payload = response.get_json()
        assert response.status_code == 200
        assert any("unit mismatch" in w for w in payload["warnings"])

    def test_rejects_a_missing_file(self, app_client):
        response = app_client.post(
            "/api/parse-interface", data={}, content_type="multipart/form-data"
        )

        assert response.status_code == 400
        assert "No interface file" in response.get_json()["error"]

    def test_reports_the_offending_line(self, app_client):
        response = app_client.post(
            "/api/parse-interface",
            data={
                "cut_file": upload("bad.txt", b"10 12\nnot a number\n"),
                "parameters": json.dumps({"units": "km"}),
            },
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "Line 2" in response.get_json()["error"]

    def test_rejects_a_marker_that_is_not_a_cut(self, app_client):
        response = app_client.post(
            "/api/parse-interface",
            data={
                "cut_file": upload("basement.txt", b"10 12\n90 13\n"),
                "parameters": json.dumps({"marker": 2}),
            },
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "marker must be one of" in response.get_json()["error"]


class TestApplyPenaltyCutEndpoint:
    @staticmethod
    def post(app_client, model_files, interface=b"0 12\n100 13\n", **parameters):
        parameters.setdefault("units", "km")
        return app_client.post(
            "/api/apply-penalty-cut",
            data={
                "poly_file": upload("box.poly", model_files["poly"]),
                "resistivity_file": upload(
                    "box.0.resistivity", model_files["resistivity"]
                ),
                "cut_file": upload("basement.txt", interface),
                "parameters": json.dumps(parameters),
            },
            content_type="multipart/form-data",
        )

    def test_returns_a_model_payload_the_viewer_can_swap_in(
        self, app_client, model_files
    ):
        payload = self.post(app_client, model_files).get_json()

        # Same shape as /api/upload-triangle-model, so the viewer needs no
        # special case for a merged model.
        for key in ("vertices", "segments", "holes", "regions", "constrainedMesh"):
            assert key in payload
        assert payload["polyFileName"] == "box.cut.poly"
        assert payload["resistivityFileName"] == "box.cut.0.resistivity"

    def test_returns_both_files_as_downloadable_text(self, app_client, model_files):
        payload = self.post(app_client, model_files).get_json()

        assert payload["polyText"].splitlines()[0].split()[1] == "2"  # dimension
        assert "Model File:                     box.cut.poly" in payload["resistivityText"]
        assert "Data File:                      survey.data" in payload["resistivityText"]

    def test_the_merged_segments_carry_the_cut_marker(self, app_client, model_files):
        payload = self.post(app_client, model_files, marker=-2).get_json()

        markers = {segment["boundary_marker"] for segment in payload["segments"]}
        assert -2 in markers

    def test_reports_what_changed(self, app_client, model_files):
        stats = self.post(app_client, model_files).get_json()["stats"]

        assert stats["cutSegmentsBefore"] == 0
        assert stats["cutSegmentsAdded"] > 0
        assert stats["fixedRegionCount"] == 1
        assert stats["unmatchedRegionCount"] == 0

    def test_stacks_a_second_cut_on_its_own_output(self, app_client, model_files):
        # The viewer treats a merged model as the loaded one, so a second
        # interface arrives as this endpoint's own output fed back in.
        first = self.post(app_client, model_files).get_json()

        second = app_client.post(
            "/api/apply-penalty-cut",
            data={
                "poly_file": upload(
                    first["polyFileName"], first["polyText"].encode()
                ),
                "resistivity_file": upload(
                    first["resistivityFileName"], first["resistivityText"].encode()
                ),
                "cut_file": upload("salt-top.txt", b"0 16\n100 17\n"),
                "parameters": json.dumps({"units": "km"}),
            },
            content_type="multipart/form-data",
        ).get_json()

        # The name marks a model as cut once, not once per interface.
        assert second["polyFileName"] == "box.cut.poly"
        assert second["resistivityFileName"] == "box.cut.0.resistivity"
        # The second cut lands on top of the first rather than replacing it.
        assert second["stats"]["cutSegmentsBefore"] == first["stats"]["cutSegmentsAfter"]
        assert second["stats"]["cutSegmentsAfter"] > first["stats"]["cutSegmentsAfter"]
        assert second["stats"]["sourceRegionCount"] == first["stats"]["mergedRegionCount"]
        assert second["stats"]["mergedRegionCount"] > first["stats"]["mergedRegionCount"]

    def test_resistivity_payload_matches_the_merged_region_count(
        self, app_client, model_files
    ):
        payload = self.post(app_client, model_files).get_json()

        assert len(payload["resistivity"]["table"]) == len(payload["regions"])

    def test_surfaces_warnings_without_failing(self, app_client, model_files):
        payload = self.post(app_client, model_files, units="m").get_json()

        assert any("unit mismatch" in w for w in payload["warnings"])

    def test_rejects_a_missing_resistivity_file(self, app_client, model_files):
        response = app_client.post(
            "/api/apply-penalty-cut",
            data={
                "poly_file": upload("box.poly", model_files["poly"]),
                "cut_file": upload("basement.txt", b"0 12\n100 13\n"),
                "parameters": json.dumps({"units": "km"}),
            },
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert ".resistivity file" in response.get_json()["error"]

    def test_rejects_a_wrong_extension(self, app_client, model_files):
        response = app_client.post(
            "/api/apply-penalty-cut",
            data={
                "poly_file": upload("box.txt", model_files["poly"]),
                "resistivity_file": upload(
                    "box.0.resistivity", model_files["resistivity"]
                ),
                "cut_file": upload("basement.txt", b"0 12\n100 13\n"),
                "parameters": json.dumps({"units": "km"}),
            },
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "Invalid" in response.get_json()["error"]

    def test_reports_an_unusable_interface_as_a_client_error(
        self, app_client, model_files
    ):
        response = self.post(app_client, model_files, interface=b"# nothing here\n")

        assert response.status_code == 400
        assert "at least two points" in response.get_json()["error"]


class TestDisplayUnits:
    """The response must be in the same units as /api/upload-triangle-model.

    That endpoint reads a .poly with read_poly_file's default 1e-3 scaling, so
    the viewer holds kilometres. The merge itself runs in metres, because that
    is what the .poly and the interface file are written in -- if the converted
    payload ever drifts from the upload endpoint, a merged model renders a
    thousand times too large.
    """

    def test_display_payload_matches_the_upload_endpoint_units(
        self, app_client, model_files
    ):
        uploaded = app_client.post(
            "/api/upload-triangle-model",
            data={
                "poly_file": upload("box.poly", model_files["poly"]),
                "resistivity_file": upload(
                    "box.0.resistivity", model_files["resistivity"]
                ),
            },
            content_type="multipart/form-data",
        ).get_json()

        cut = TestApplyPenaltyCutEndpoint.post(
            app_client, model_files, interface=b"0 12\n100 13\n"
        ).get_json()

        uploaded_span = max(v["hCoor"] for v in uploaded["vertices"]) - min(
            v["hCoor"] for v in uploaded["vertices"]
        )
        cut_span = max(v["hCoor"] for v in cut["vertices"]) - min(
            v["hCoor"] for v in cut["vertices"]
        )

        assert cut_span == pytest.approx(uploaded_span)

    def test_exported_text_stays_in_metres(self, app_client, model_files):
        # The files are what MARE2DEM reads, and MARE2DEM wants metres.
        payload = TestApplyPenaltyCutEndpoint.post(
            app_client, model_files, interface=b"0 12\n100 13\n"
        ).get_json()

        vertex_lines = payload["polyText"].splitlines()[1:7]
        ys = [float(line.split()[1]) for line in vertex_lines]

        assert max(ys) == pytest.approx(100_000.0)


SAMPLE_POLY = "testIC2_m_ef035of3.poly"
SAMPLE_RESISTIVITY = "testIC2_m_ef035of3.19.resistivity"
SAMPLE_HORIZON = "test_horizon.txt"


def read_sample(name):
    return (SAMPLE_DATA_DIR / name).read_bytes()


class TestRealSurveyModel:
    """End to end on a real inversion model from backend/test_data.

    The synthetic fixtures above pin behaviour; this pins that the behaviour
    survives contact with a 75,000-segment model that has its own penalty cuts
    and fixed regions already. Skipped where backend/test_data is not installed.
    """

    @requires_sample_files(SAMPLE_POLY, SAMPLE_RESISTIVITY, SAMPLE_HORIZON)
    def test_parses_the_horizon_without_unit_warnings(self, app_client):
        response = app_client.post(
            "/api/parse-interface",
            data={
                "cut_file": upload(SAMPLE_HORIZON, read_sample(SAMPLE_HORIZON)),
                "parameters": json.dumps(
                    {
                        "units": "km",
                        "modelBounds": {
                            "yMin": -500_000,
                            "yMax": 600_000,
                            "zMin": -100_000,
                            "zMax": 1_000_000,
                        },
                    }
                ),
            },
            content_type="multipart/form-data",
        )

        payload = response.get_json()
        assert response.status_code == 200
        assert len(payload["points"]) == 25
        assert payload["warnings"] == []

    @requires_sample_files(SAMPLE_POLY, SAMPLE_RESISTIVITY, SAMPLE_HORIZON)
    def test_merges_into_the_model_and_keeps_every_region_accounted_for(
        self, app_client
    ):
        response = app_client.post(
            "/api/apply-penalty-cut",
            data={
                "poly_file": upload(SAMPLE_POLY, read_sample(SAMPLE_POLY)),
                "resistivity_file": upload(
                    SAMPLE_RESISTIVITY, read_sample(SAMPLE_RESISTIVITY)
                ),
                "cut_file": upload(SAMPLE_HORIZON, read_sample(SAMPLE_HORIZON)),
                "parameters": json.dumps({"units": "km", "marker": -1}),
            },
            content_type="multipart/form-data",
        )

        assert response.status_code == 200
        payload = response.get_json()
        stats = payload["stats"]

        # The horizon crosses the parameter mesh, so it both adds cut segments
        # and splits the cells it passes through.
        assert stats["cutSegmentsAdded"] > 0
        assert stats["mergedRegionCount"] > stats["sourceRegionCount"]

        # Every region traces back to a source region, and the model's two fixed
        # regions -- air and seawater -- are still fixed.
        assert stats["unmatchedRegionCount"] == 0
        assert stats["inheritedRegionCount"] == stats["mergedRegionCount"]
        assert stats["fixedRegionCount"] == 2

        # The rebuilt file describes the merged model, not the source one.
        assert len(payload["resistivity"]["table"]) == stats["mergedRegionCount"]
        assert (
            f"Number of regions:              {stats['mergedRegionCount']}"
            in payload["resistivityText"]
        )
        assert payload["warnings"] == []

    @requires_sample_files(SAMPLE_POLY, SAMPLE_RESISTIVITY, SAMPLE_HORIZON)
    def test_the_source_header_survives_the_rebuild(self, app_client):
        source_text = read_sample(SAMPLE_RESISTIVITY).decode()
        source_data_file = next(
            line for line in source_text.splitlines() if line.strip().startswith("Data File:")
        )

        response = app_client.post(
            "/api/apply-penalty-cut",
            data={
                "poly_file": upload(SAMPLE_POLY, read_sample(SAMPLE_POLY)),
                "resistivity_file": upload(
                    SAMPLE_RESISTIVITY, read_sample(SAMPLE_RESISTIVITY)
                ),
                "cut_file": upload(SAMPLE_HORIZON, read_sample(SAMPLE_HORIZON)),
                "parameters": json.dumps({"units": "km", "marker": -1}),
            },
            content_type="multipart/form-data",
        )

        # Regenerating the header from defaults is how a model loses its data
        # file and its inversion bounds.
        assert source_data_file in response.get_json()["resistivityText"]
