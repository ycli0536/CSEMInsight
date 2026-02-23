"""Tests for scripts/check_release_version.py."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = PROJECT_ROOT / "scripts" / "check_release_version.py"


def _load_script_module():
    if not SCRIPT_PATH.exists():
        pytest.fail(f"Missing script: {SCRIPT_PATH}")

    spec = importlib.util.spec_from_file_location("check_release_version", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        pytest.fail(f"Cannot import script module from: {SCRIPT_PATH}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_version_files(tmp_path: Path, tauri_version: str, cargo_version: str):
    tauri_conf = tmp_path / "frontend" / "src-tauri" / "tauri.conf.json"
    cargo_toml = tmp_path / "frontend" / "src-tauri" / "Cargo.toml"

    tauri_conf.parent.mkdir(parents=True, exist_ok=True)
    cargo_toml.parent.mkdir(parents=True, exist_ok=True)

    tauri_conf.write_text(
        "{\n"
        f'  "version": "{tauri_version}"\n'
        "}\n",
        encoding="utf-8",
    )
    cargo_toml.write_text(
        "[package]\n"
        f'version = "{cargo_version}"\n',
        encoding="utf-8",
    )


def test_validate_release_version_accepts_matching_tag_and_files(tmp_path: Path):
    script = _load_script_module()
    _write_version_files(tmp_path, tauri_version="0.1.0", cargo_version="0.1.0")

    script.validate_release_version(tag="v0.1.0", repo_root=tmp_path)


def test_validate_release_version_rejects_tag_mismatch(tmp_path: Path):
    script = _load_script_module()
    _write_version_files(tmp_path, tauri_version="0.1.1", cargo_version="0.1.1")

    with pytest.raises(ValueError, match="does not match"):
        script.validate_release_version(tag="v0.1.0", repo_root=tmp_path)


def test_validate_release_version_rejects_tauri_and_cargo_mismatch(tmp_path: Path):
    script = _load_script_module()
    _write_version_files(tmp_path, tauri_version="0.1.0", cargo_version="0.1.1")

    with pytest.raises(ValueError, match="must match each other"):
        script.validate_release_version(tag="v0.1.0", repo_root=tmp_path)
