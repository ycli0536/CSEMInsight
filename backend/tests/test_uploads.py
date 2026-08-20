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


@pytest.fixture()
def saved_paths(monkeypatch):
    """Record the temp paths uploads are written to before cleanup removes them."""
    recorded = []
    original = backend_main._save_uploaded_file

    def spy(file, temp_dir):
        path = original(file, temp_dir)
        recorded.append(path)
        return path

    monkeypatch.setattr(backend_main, "_save_uploaded_file", spy)
    return recorded


def test_upload_xyz_sanitizes_filename_and_saves_in_temp(
    client, tmp_path, saved_paths
):
    data = {
        "file": (io.BytesIO(_make_xyz_content()), "my file.xyz"),
    }

    response = client.post("/api/upload-xyz", data=data, content_type="multipart/form-data")

    assert response.status_code == 200

    assert len(saved_paths) == 1
    saved_name = os.path.basename(saved_paths[0])
    assert " " not in saved_name
    assert saved_paths[0].startswith(str(tmp_path))


def test_upload_xyz_uses_unique_filenames(client, saved_paths):
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

    assert len(saved_paths) == 2
    assert os.path.basename(saved_paths[0]) != os.path.basename(saved_paths[1])


def test_upload_xyz_removes_temp_files_after_response(client, tmp_path, saved_paths):
    data = {
        "file": (io.BytesIO(_make_xyz_content()), "dup.xyz"),
    }

    response = client.post("/api/upload-xyz", data=data, content_type="multipart/form-data")

    assert response.status_code == 200
    assert not os.path.exists(saved_paths[0])
    assert list(tmp_path.iterdir()) == []


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
