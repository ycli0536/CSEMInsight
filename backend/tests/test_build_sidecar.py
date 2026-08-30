"""Tests for scripts/build_sidecar.py."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = PROJECT_ROOT / "scripts" / "build_sidecar.py"


def _load_script_module():
    if not SCRIPT_PATH.exists():
        pytest.fail(f"Missing script: {SCRIPT_PATH}")

    spec = importlib.util.spec_from_file_location("build_sidecar", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        pytest.fail(f"Cannot import script module from: {SCRIPT_PATH}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_executable_name_for_unix_targets():
    script = _load_script_module()

    assert script.executable_name("aarch64-apple-darwin") == "csemInsight"
    assert script.executable_name("x86_64-unknown-linux-gnu") == "csemInsight"


def test_executable_name_adds_exe_for_windows_target():
    script = _load_script_module()

    assert script.executable_name("x86_64-pc-windows-msvc") == "csemInsight.exe"


def test_executable_name_raises_for_unsupported_target():
    script = _load_script_module()

    with pytest.raises(ValueError):
        script.executable_name("armv7-unknown-linux-gnueabihf")


class TestStageToResources:
    """The onedir tree is staged where tauri.conf.json's resources point."""

    def _make_fake_onedir(self, tmp_path: Path, exe_name: str) -> Path:
        source = tmp_path / "dist" / "csemInsight-test-triple"
        (source / "_internal").mkdir(parents=True)
        (source / "_internal" / "libfoo.so").write_bytes(b"lib")
        exe = source / exe_name
        exe.write_bytes(b"#!/bin/sh\n")
        exe.chmod(0o755)
        return source

    def test_stages_tree_and_keeps_executable_bit(self, tmp_path):
        script = _load_script_module()
        source = self._make_fake_onedir(tmp_path, "csemInsight")
        repo_root = tmp_path / "repo"

        destination = script.stage_to_resources(
            repo_root, source, "aarch64-apple-darwin"
        )

        assert destination == (
            repo_root / "frontend" / "src-tauri" / "resources" / "backend"
        )
        staged_exe = destination / "csemInsight"
        assert staged_exe.is_file()
        assert (destination / "_internal" / "libfoo.so").is_file()
        assert os.access(staged_exe, os.X_OK)

    def test_replaces_a_previous_staging(self, tmp_path):
        script = _load_script_module()
        source = self._make_fake_onedir(tmp_path, "csemInsight")
        repo_root = tmp_path / "repo"
        stale = (
            repo_root / "frontend" / "src-tauri" / "resources" / "backend" / "stale.so"
        )
        stale.parent.mkdir(parents=True)
        stale.write_bytes(b"old")

        destination = script.stage_to_resources(
            repo_root, source, "aarch64-apple-darwin"
        )

        assert not (destination / "stale.so").exists()
        assert (destination / "csemInsight").is_file()

    def test_missing_executable_in_tree_fails(self, tmp_path):
        script = _load_script_module()
        source = self._make_fake_onedir(tmp_path, "wrong-name")
        repo_root = tmp_path / "repo"

        with pytest.raises(FileNotFoundError):
            script.stage_to_resources(repo_root, source, "aarch64-apple-darwin")
