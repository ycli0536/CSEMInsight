"""Tests for API hardening: error payloads, upload limits, CORS and cleanup."""

import io
import json
import os

import pytest

import main as backend_main


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """Flask test client whose uploads land in an isolated temp directory."""
    monkeypatch.setattr(backend_main.tempfile, "gettempdir", lambda: str(tmp_path))
    backend_main.app.config["TESTING"] = True
    with backend_main.app.test_client() as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _debug_off(monkeypatch):
    """Default every test to production (non-debug) error behaviour."""
    monkeypatch.delenv("CSEMINSIGHT_DEBUG", raising=False)
    monkeypatch.delenv("FLASK_DEBUG", raising=False)


class TestErrorPayloads:
    """Errors must be actionable and must not leak internals by default."""

    def test_parser_failure_returns_hint_without_traceback(self, client):
        data = {"file": (io.BytesIO(b"not a real csem file"), "broken.data")}

        response = client.post(
            "/api/upload-data",
            data=data,
            content_type="multipart/form-data",
        )

        assert response.status_code == 500
        payload = response.get_json()
        assert "hint" in payload
        assert "traceback" not in payload
        assert "Traceback (most recent call last)" not in payload["error"]
        assert "Traceback (most recent call last)" not in payload.get("detail", "")

    def test_parser_failure_includes_traceback_in_debug_mode(
        self, client, monkeypatch
    ):
        monkeypatch.setenv("CSEMINSIGHT_DEBUG", "1")
        data = {"file": (io.BytesIO(b"not a real csem file"), "broken.data")}

        response = client.post(
            "/api/upload-data",
            data=data,
            content_type="multipart/form-data",
        )

        assert response.status_code == 500
        payload = response.get_json()
        assert "Traceback (most recent call last)" in payload["traceback"]

    def test_parser_failure_reports_exception_summary(self, client):
        data = {"file": (io.BytesIO(b"not a real csem file"), "broken.data")}

        response = client.post(
            "/api/upload-data",
            data=data,
            content_type="multipart/form-data",
        )

        detail = response.get_json().get("detail", "")
        assert detail, "detail should summarise the underlying exception"
        assert "\n" not in detail

    def test_triangle_model_failure_is_sanitized(self, client):
        data = {"poly_file": (io.BytesIO(b"garbage"), "broken.poly")}

        response = client.post(
            "/api/upload-triangle-model",
            data=data,
            content_type="multipart/form-data",
        )

        assert response.status_code == 500
        payload = response.get_json()
        assert "Traceback (most recent call last)" not in json.dumps(payload)
        assert "hint" in payload


class TestBareStringResponses:
    """Every endpoint answers with JSON and a meaningful status code."""

    @pytest.mark.parametrize(
        "endpoint",
        ["/api/upload-xyz", "/api/upload-mat", "/api/upload-data"],
    )
    def test_missing_file_part_returns_json_400(self, client, endpoint):
        response = client.post(endpoint, data={}, content_type="multipart/form-data")

        assert response.status_code == 400
        assert response.is_json
        assert "error" in response.get_json()

    @pytest.mark.parametrize(
        ("endpoint", "filename"),
        [
            ("/api/upload-xyz", "model.txt"),
            ("/api/upload-mat", "model.txt"),
            ("/api/upload-data", "model.txt"),
            ("/api/upload-bathymetry", "model.csv"),
        ],
    )
    def test_wrong_extension_returns_json_400(self, client, endpoint, filename):
        data = {"file": (io.BytesIO(b"content"), filename)}

        response = client.post(
            endpoint, data=data, content_type="multipart/form-data"
        )

        assert response.status_code == 400
        assert response.is_json
        assert "error" in response.get_json()

    def test_write_data_file_requires_content(self, client):
        response = client.post(
            "/api/write-data-file",
            data=json.dumps({"dataBlocks": {}}),
            content_type="application/json",
        )

        assert response.status_code == 400
        assert "content" in response.get_json()["error"].lower()

    def test_write_data_file_requires_data_blocks(self, client):
        response = client.post(
            "/api/write-data-file",
            data=json.dumps({"content": "[]"}),
            content_type="application/json",
        )

        assert response.status_code == 400
        assert "datablocks" in response.get_json()["error"].lower()


class TestUploadSizeLimit:
    """Oversized uploads are rejected before they can exhaust memory."""

    def test_max_content_length_is_configured(self):
        assert backend_main.app.config["MAX_CONTENT_LENGTH"] > 0

    def test_oversized_upload_returns_json_413(self, client, monkeypatch):
        monkeypatch.setitem(backend_main.app.config, "MAX_CONTENT_LENGTH", 1024)
        data = {"file": (io.BytesIO(b"x" * 4096), "big.data")}

        response = client.post(
            "/api/upload-data",
            data=data,
            content_type="multipart/form-data",
        )

        assert response.status_code == 413
        assert response.is_json
        assert "error" in response.get_json()

    def test_upload_limit_reads_env_override(self, monkeypatch):
        monkeypatch.setenv("CSEMINSIGHT_MAX_UPLOAD_MB", "7")

        assert backend_main._get_max_upload_bytes() == 7 * 1024 * 1024

    def test_upload_limit_falls_back_on_invalid_env(self, monkeypatch):
        monkeypatch.setenv("CSEMINSIGHT_MAX_UPLOAD_MB", "not-a-number")

        assert backend_main._get_max_upload_bytes() == (
            backend_main.DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
        )


class TestCorsPolicy:
    """CORS is limited to the local app origins instead of every website."""

    def test_allowed_origin_receives_cors_header(self, client):
        response = client.options(
            "/api/write-data-file",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            },
        )

        assert response.status_code in (200, 204)
        assert (
            response.headers.get("Access-Control-Allow-Origin")
            == "http://localhost:5173"
        )

    def test_tauri_origin_is_allowed(self, client):
        response = client.options(
            "/api/write-data-file",
            headers={
                "Origin": "tauri://localhost",
                "Access-Control-Request-Method": "POST",
            },
        )

        assert response.headers.get("Access-Control-Allow-Origin") == (
            "tauri://localhost"
        )

    def test_localhost_on_a_fallback_port_is_allowed(self, client):
        """Vite picks another port when 5173 is taken; that must still work."""
        response = client.options(
            "/api/write-data-file",
            headers={
                "Origin": "http://localhost:5174",
                "Access-Control-Request-Method": "POST",
            },
        )

        assert response.headers.get("Access-Control-Allow-Origin") == (
            "http://localhost:5174"
        )

    @pytest.mark.parametrize(
        "origin",
        [
            "https://evil.example.com",
            "http://localhost.evil.com",
            "http://127.0.0.1.evil.com",
            "http://notlocalhost:5173",
        ],
    )
    def test_foreign_origin_is_rejected(self, client, origin):
        response = client.options(
            "/api/write-data-file",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
            },
        )

        assert "Access-Control-Allow-Origin" not in response.headers

    def test_allowed_origins_read_env_override(self, monkeypatch):
        monkeypatch.setenv(
            "CSEMINSIGHT_ALLOWED_ORIGINS",
            "http://example.test:8080, http://other.test",
        )

        origins = backend_main._get_allowed_origins()

        assert origins == ["http://example.test:8080", "http://other.test"]

    def test_allowed_origins_default_includes_dev_and_tauri(self, monkeypatch):
        monkeypatch.delenv("CSEMINSIGHT_ALLOWED_ORIGINS", raising=False)

        origins = backend_main._get_allowed_origins()

        assert any("localhost" in origin for origin in origins)
        assert "tauri://localhost" in origins


class TestTempFileCleanup:
    """Uploaded files are removed once the request has been answered."""

    def _leftovers(self, tmp_path):
        return [entry for entry in tmp_path.iterdir()]

    def test_successful_upload_leaves_no_temp_files(self, client, tmp_path):
        data = {"file": (io.BytesIO(b"0 0 0 1 2 3\n"), "data.xyz")}

        response = client.post(
            "/api/upload-xyz", data=data, content_type="multipart/form-data"
        )

        assert response.status_code == 200
        assert self._leftovers(tmp_path) == []

    def test_failed_upload_leaves_no_temp_files(self, client, tmp_path):
        data = {"file": (io.BytesIO(b"not a real csem file"), "broken.data")}

        response = client.post(
            "/api/upload-data", data=data, content_type="multipart/form-data"
        )

        assert response.status_code == 500
        assert self._leftovers(tmp_path) == []

    def test_triangle_model_upload_leaves_no_temp_files(self, client, tmp_path):
        data = {"poly_file": (io.BytesIO(b"garbage"), "broken.poly")}

        client.post(
            "/api/upload-triangle-model",
            data=data,
            content_type="multipart/form-data",
        )

        assert self._leftovers(tmp_path) == []

    def test_upload_workspace_removes_directory(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            backend_main.tempfile, "gettempdir", lambda: str(tmp_path)
        )

        with backend_main._upload_workspace() as workspace:
            created = workspace
            assert os.path.isdir(created)

        assert not os.path.exists(created)
