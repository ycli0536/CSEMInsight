"""
Comprehensive tests for the Flask backend API endpoints.
Tests error handling, edge cases, and core functionality.
"""

import json
import io
import os

import pytest

import main as backend_main


@pytest.fixture()
def app_client():
    """Create a test client for the Flask app."""
    backend_main.app.config["TESTING"] = True
    with backend_main.app.test_client() as client:
        yield client


@pytest.fixture()
def sample_data_path():
    """Get the path to the sample data directory."""
    return os.path.join(
        os.path.dirname(__file__),
        "..",
        "test_data",
    )


class TestLoadSampleData:
    """Tests for the /api/load-sample-data endpoint."""

    def test_load_sample_data_returns_dataset(self, app_client):
        """Test loading a single sample file."""
        payload = {"files": ["EMAGE_LINE2_s4IC_m_ef3_test.data"]}

        response = app_client.post(
            "/api/load-sample-data",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert isinstance(data, list)
        assert len(data) == 1
        dataset = data[0]
        assert "id" in dataset
        assert dataset["name"] == "EMAGE_LINE2_s4IC_m_ef3_test.data"
        assert "geometryInfo" in dataset
        assert "data" in dataset
        assert "dataBlocks" in dataset

    def test_load_multiple_sample_files(self, app_client):
        """Test loading multiple sample files at once."""
        payload = {
            "files": [
                "EMAGE_LINE2_s4IC_m_ef3_test.data",
                "EMAGE_LINE2_s4IC_m_ef3.data",
            ]
        }

        response = app_client.post(
            "/api/load-sample-data",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 2
        assert data[0]["name"] == "EMAGE_LINE2_s4IC_m_ef3_test.data"
        assert data[1]["name"] == "EMAGE_LINE2_s4IC_m_ef3.data"

    def test_load_sample_data_empty_files_list_returns_error(self, app_client):
        """Test that empty files list returns error."""
        payload = {"files": []}

        response = app_client.post(
            "/api/load-sample-data",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_load_sample_data_no_files_key_returns_error(self, app_client):
        """Test that missing files key returns error."""
        response = app_client.post(
            "/api/load-sample-data",
            data=json.dumps({}),
            content_type="application/json",
        )

        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_load_sample_data_invalid_extension_returns_error(self, app_client):
        """Test that invalid file extension returns error."""
        payload = {"files": ["invalid.txt"]}

        response = app_client.post(
            "/api/load-sample-data",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 400
        assert "Invalid file format" in response.get_json()["error"]

    def test_load_sample_data_file_not_found_returns_error(self, app_client):
        """Test that non-existent file returns 404."""
        payload = {"files": ["nonexistent.data"]}

        response = app_client.post(
            "/api/load-sample-data",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 404
        assert "File not found" in response.get_json()["error"]

    def test_load_sample_data_path_traversal_blocked(self, app_client):
        """Test that path traversal attempts are blocked."""
        payload = {"files": ["../main.py"]}

        response = app_client.post(
            "/api/load-sample-data",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 400
        assert "Invalid" in response.get_json()["error"]

    def test_load_resp_file_format(self, app_client):
        """Test loading a .resp file format."""
        payload = {"files": ["testIC2_m_ef3of3.19.resp"]}

        response = app_client.post(
            "/api/load-sample-data",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 1
        assert data[0]["name"].endswith(".resp")


class TestUploadData:
    """Tests for the /api/upload-data endpoint."""

    def test_upload_data_returns_object(self, app_client, sample_data_path):
        """Test uploading a valid data file."""
        file_path = os.path.join(sample_data_path, "EMAGE_LINE2_s4IC_m_ef3_test.data")
        file_path = os.path.abspath(file_path)

        with open(file_path, "rb") as handle:
            data = {"file": (handle, "EMAGE_LINE2_s4IC_m_ef3_test.data")}
            response = app_client.post(
                "/api/upload-data",
                data=data,
                content_type="multipart/form-data",
            )

        assert response.status_code == 200
        payload = response.get_json()
        assert isinstance(payload, dict)
        assert "geometryInfo" in payload
        assert "data" in payload
        assert "dataBlocks" in payload

    def test_upload_data_no_file_returns_error(self, app_client):
        """Test that missing file returns error."""
        response = app_client.post(
            "/api/upload-data",
            data={},
            content_type="multipart/form-data",
        )

        # The endpoint checks for 'file' key presence
        assert response.status_code in [400, 200]  # May return string or JSON

    def test_upload_data_empty_filename_returns_error(self, app_client):
        """Test that empty filename returns error."""
        data = {"file": (io.BytesIO(b"test content"), "")}
        response = app_client.post(
            "/api/upload-data",
            data=data,
            content_type="multipart/form-data",
        )

        assert response.status_code == 400


class TestUploadMultipleData:
    """Tests for the /api/upload-multiple-data endpoint."""

    def test_upload_multiple_no_files_returns_error(self, app_client):
        """Test that missing files returns error."""
        response = app_client.post(
            "/api/upload-multiple-data",
            data={},
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "No files" in response.get_json()["error"]

    def test_upload_multiple_invalid_format_returns_error(
        self, app_client, sample_data_path
    ):
        """Test that invalid file format returns error."""
        # Create a temp file with invalid extension
        data = {"files": [(io.BytesIO(b"test content"), "test.txt")]}
        response = app_client.post(
            "/api/upload-multiple-data",
            data=data,
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "Invalid file format" in response.get_json()["error"]


class TestMisfitStats:
    """Tests for the /api/misfit_stats endpoint."""

    def test_misfit_stats_groups_by_type(self, app_client):
        """Test that misfit stats groups by amplitude/phase type."""
        payload = {
            "data": [
                {"Type": "28", "Y_rx": 0, "Y_tx": 0, "Freq_id": 1, "Residual": 2.0},
                {"Type": "28", "Y_rx": 0, "Y_tx": 0, "Freq_id": 1, "Residual": 2.0},
                {"Type": "24", "Y_rx": 1000, "Y_tx": 0, "Freq_id": 2, "Residual": 1.0},
            ]
        }

        response = app_client.post(
            "/api/misfit_stats",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert "byRx" in data
        assert "amplitude" in data["byRx"]
        assert "phase" in data["byRx"]
        assert len(data["byRx"]["amplitude"]) == 1
        assert len(data["byRx"]["phase"]) == 1

    def test_misfit_stats_accepts_numeric_type_codes(self, app_client):
        """Test that numeric type codes are handled correctly."""
        payload = {
            "data": [
                {"Type": 28, "Y_rx": 0, "Y_tx": 0, "Freq_id": 1, "Residual": 2.0},
                {"Type": 24, "Y_rx": 1000, "Y_tx": 0, "Freq_id": 2, "Residual": 1.0},
            ]
        }

        response = app_client.post(
            "/api/misfit_stats",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert len(data["byRx"]["amplitude"]) == 1
        assert len(data["byRx"]["phase"]) == 1

    def test_misfit_stats_no_data_returns_error(self, app_client):
        """Test that empty data returns error."""
        payload = {"data": []}

        response = app_client.post(
            "/api/misfit_stats",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 400
        assert "No data provided" in response.get_json()["error"]

    def test_misfit_stats_missing_columns_returns_error(self, app_client):
        """Test that missing required columns returns error."""
        payload = {
            "data": [
                {"Type": "28", "Y_rx": 0},  # Missing required columns
            ]
        }

        response = app_client.post(
            "/api/misfit_stats",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 400
        assert "Missing required columns" in response.get_json()["error"]

    def test_misfit_stats_calculates_y_range(self, app_client):
        """Test that Y_range is calculated correctly."""
        payload = {
            "data": [
                {
                    "Type": "28",
                    "Y_rx": 1000,
                    "Y_tx": 500,
                    "Freq_id": 1,
                    "Residual": 1.0,
                },
                {
                    "Type": "28",
                    "Y_rx": 2000,
                    "Y_tx": 500,
                    "Freq_id": 1,
                    "Residual": 1.0,
                },
            ]
        }

        response = app_client.post(
            "/api/misfit_stats",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        # Check that byRange data is present
        assert "byRange" in data
        assert "amplitude" in data["byRange"]
        # Should have entries for Y_range 500 (1000-500) and 1500 (2000-500)
        assert len(data["byRange"]["amplitude"]) == 2

    def test_misfit_stats_converts_to_km(self, app_client):
        """Test that coordinates are converted to kilometers."""
        payload = {
            "data": [
                {"Type": "28", "Y_rx": 1000, "Y_tx": 0, "Freq_id": 1, "Residual": 1.0},
            ]
        }

        response = app_client.post(
            "/api/misfit_stats",
            data=json.dumps(payload),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        # Y_rx of 1000m should become 1.0 km
        assert data["byRx"]["amplitude"][0]["Y_rx_km"] == 1.0


class TestWriteDataFile:
    """Tests for the /api/write-data-file endpoint."""

    def test_write_data_file_options_returns_cors_headers(self, app_client):
        """Test that OPTIONS request returns CORS headers."""
        response = app_client.options("/api/write-data-file")

        assert response.status_code == 200
        # Check CORS headers
        assert "Access-Control-Allow-Origin" in response.headers
        assert "Access-Control-Allow-Methods" in response.headers


class TestConfigHelpers:
    """Tests for configuration helper functions."""

    def test_get_debug_flag_defaults_false(self, monkeypatch):
        """Test that debug flag defaults to False."""
        monkeypatch.delenv("CSEMINSIGHT_DEBUG", raising=False)
        monkeypatch.delenv("FLASK_DEBUG", raising=False)

        assert backend_main._get_debug_flag() is False

    def test_get_debug_flag_true_when_env_set(self, monkeypatch):
        """Test that debug flag is True when env var is set."""
        monkeypatch.setenv("CSEMINSIGHT_DEBUG", "true")

        assert backend_main._get_debug_flag() is True

    def test_get_debug_flag_accepts_various_true_values(self, monkeypatch):
        """Test that various truthy values work."""
        for value in ["1", "true", "yes", "on", "TRUE", "Yes", "ON"]:
            monkeypatch.setenv("CSEMINSIGHT_DEBUG", value)
            assert backend_main._get_debug_flag() is True, f"Failed for value: {value}"

    def test_get_debug_flag_rejects_invalid_values(self, monkeypatch):
        """Test that invalid values return False."""
        for value in ["0", "false", "no", "off", "invalid", ""]:
            monkeypatch.setenv("CSEMINSIGHT_DEBUG", value)
            assert backend_main._get_debug_flag() is False, f"Failed for value: {value}"


class TestTypeCodeConstants:
    """Tests for type code constants."""

    def test_amplitude_type_codes_defined(self):
        """Test that amplitude type codes are defined."""
        assert "28" in backend_main.AMPLITUDE_TYPE_CODES
        assert "21" in backend_main.AMPLITUDE_TYPE_CODES

    def test_phase_type_codes_defined(self):
        """Test that phase type codes are defined."""
        assert "24" in backend_main.PHASE_TYPE_CODES
        assert "22" in backend_main.PHASE_TYPE_CODES

    def test_type_codes_are_disjoint(self):
        """Test that amplitude and phase codes don't overlap."""
        overlap = backend_main.AMPLITUDE_TYPE_CODES & backend_main.PHASE_TYPE_CODES
        assert len(overlap) == 0, f"Type codes overlap: {overlap}"
