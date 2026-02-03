import io
import os

import pytest

import main as backend_main


def _make_xyz_content() -> bytes:
    # 6 columns: X Y Z rho1 rho2 rho3
    return b"0 0 0 1 2 3\n"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(backend_main.tempfile, "gettempdir", lambda: str(tmp_path))
    backend_main.app.config["TESTING"] = True
    with backend_main.app.test_client() as client:
        yield client


def test_upload_xyz_sanitizes_filename_and_saves_in_temp(client, tmp_path):
    data = {
        "file": (io.BytesIO(_make_xyz_content()), "my file.xyz"),
    }

    response = client.post("/api/upload-xyz", data=data, content_type="multipart/form-data")

    assert response.status_code == 200

    saved_files = list(tmp_path.iterdir())
    assert len(saved_files) == 1
    saved_name = saved_files[0].name
    assert " " not in saved_name


def test_upload_xyz_uses_unique_filenames(client, tmp_path):
    data1 = {
        "file": (io.BytesIO(_make_xyz_content()), "dup.xyz"),
    }
    data2 = {
        "file": (io.BytesIO(_make_xyz_content()), "dup.xyz"),
    }

    response1 = client.post("/api/upload-xyz", data=data1, content_type="multipart/form-data")
    response2 = client.post("/api/upload-xyz", data=data2, content_type="multipart/form-data")

    assert response1.status_code == 200
    assert response2.status_code == 200

    saved_files = list(tmp_path.iterdir())
    assert len(saved_files) == 2
    assert saved_files[0].name != saved_files[1].name


def test_upload_xyz_returns_records(client):
    data = {
        "file": (io.BytesIO(_make_xyz_content()), "data.xyz"),
    }

    response = client.post("/api/upload-xyz", data=data, content_type="multipart/form-data")

    assert response.status_code == 200
    payload = response.get_json()
    assert isinstance(payload, list)
    assert len(payload) == 1
    assert "X" in payload[0]
