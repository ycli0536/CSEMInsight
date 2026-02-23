#!/usr/bin/env python3
"""Validate tag version against Tauri configuration versions."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


SEMVER_TAG_PATTERN = re.compile(r"^v(?P<version>\d+\.\d+\.\d+)$")


def _extract_version_from_tag(tag: str) -> str:
    match = SEMVER_TAG_PATTERN.match(tag.strip())
    if not match:
        raise ValueError(
            f"Tag '{tag}' is invalid. Expected format: v<major>.<minor>.<patch>."
        )
    return match.group("version")


def _read_tauri_conf_version(tauri_conf_path: Path) -> str:
    if not tauri_conf_path.exists():
        raise FileNotFoundError(f"Missing tauri config: {tauri_conf_path}")

    data = json.loads(tauri_conf_path.read_text(encoding="utf-8"))
    version = data.get("version")
    if not isinstance(version, str) or not version.strip():
        raise ValueError(f"Missing or invalid 'version' in {tauri_conf_path}")
    return version.strip()


def _read_cargo_package_version(cargo_toml_path: Path) -> str:
    if not cargo_toml_path.exists():
        raise FileNotFoundError(f"Missing Cargo.toml: {cargo_toml_path}")

    in_package_block = False
    for raw_line in cargo_toml_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("[") and line.endswith("]"):
            in_package_block = line == "[package]"
            continue

        if not in_package_block:
            continue

        match = re.match(r'^version\s*=\s*"(?P<version>[^"]+)"$', line)
        if match:
            return match.group("version")

    raise ValueError(f"Could not find package version in {cargo_toml_path}")


def validate_release_version(tag: str, repo_root: Path) -> None:
    """Validate that tag version equals both tauri.conf and Cargo.toml versions."""
    tag_version = _extract_version_from_tag(tag)

    tauri_conf_path = repo_root / "frontend" / "src-tauri" / "tauri.conf.json"
    cargo_toml_path = repo_root / "frontend" / "src-tauri" / "Cargo.toml"

    tauri_version = _read_tauri_conf_version(tauri_conf_path)
    cargo_version = _read_cargo_package_version(cargo_toml_path)

    if tauri_version != cargo_version:
        raise ValueError(
            "Tauri config version and Cargo package version must match each other: "
            f"{tauri_version} != {cargo_version}"
        )

    if tag_version != tauri_version:
        raise ValueError(
            f"Tag version '{tag_version}' does not match project version "
            f"'{tauri_version}'."
        )


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate that release tag matches Tauri versions.",
    )
    parser.add_argument(
        "--tag",
        required=True,
        help="Release tag to validate, e.g. v0.1.0",
    )
    parser.add_argument(
        "--repo-root",
        default=str(Path(__file__).resolve().parents[1]),
        help="Repository root path. Defaults to this script's project root.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    try:
        validate_release_version(tag=args.tag, repo_root=repo_root)
    except Exception as exc:  # pylint: disable=broad-except
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"Version check passed for tag {args.tag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
