"""Tests for scripts/build_sidecar.py."""

from __future__ import annotations

import importlib.util
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


def test_target_filename_mapping_for_supported_triples():
    script = _load_script_module()

    assert (
        script.target_filename("aarch64-apple-darwin")
        == "csemInsight-aarch64-apple-darwin"
    )
    assert (
        script.target_filename("x86_64-unknown-linux-gnu")
        == "csemInsight-x86_64-unknown-linux-gnu"
    )


def test_target_filename_adds_exe_for_windows_target():
    script = _load_script_module()

    assert (
        script.target_filename("x86_64-pc-windows-msvc")
        == "csemInsight-x86_64-pc-windows-msvc.exe"
    )


def test_target_filename_raises_for_unsupported_target():
    script = _load_script_module()

    with pytest.raises(ValueError):
        script.target_filename("armv7-unknown-linux-gnueabihf")
