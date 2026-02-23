#!/usr/bin/env python3
"""Build and place the platform-specific Tauri sidecar binary."""

from __future__ import annotations

import argparse
import shutil
import stat
import subprocess
import sys
from pathlib import Path


SUPPORTED_TARGET_TRIPLES = {
    "aarch64-apple-darwin",
    "x86_64-pc-windows-msvc",
    "x86_64-unknown-linux-gnu",
}


def target_filename(target_triple: str) -> str:
    """Return sidecar filename expected by Tauri for a target triple."""
    if target_triple not in SUPPORTED_TARGET_TRIPLES:
        raise ValueError(
            f"Unsupported target triple '{target_triple}'. "
            f"Supported values: {sorted(SUPPORTED_TARGET_TRIPLES)}"
        )

    base_name = f"csemInsight-{target_triple}"
    if target_triple.endswith("windows-msvc"):
        return f"{base_name}.exe"
    return base_name


def _pyinstaller_binary_name(target_triple: str) -> str:
    """Return onefile output name used by PyInstaller."""
    return f"csemInsight-{target_triple}"


def _run_pyinstaller(repo_root: Path, target_triple: str) -> Path:
    backend_dir = repo_root / "backend"
    entrypoint = backend_dir / "main.py"
    if not entrypoint.exists():
        raise FileNotFoundError(f"Backend entrypoint not found: {entrypoint}")

    name = _pyinstaller_binary_name(target_triple)
    dist_dir = backend_dir / "dist"
    work_dir = backend_dir / "build" / f"pyinstaller-{target_triple}"
    spec_dir = work_dir / "spec"

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--name",
        name,
        "--distpath",
        str(dist_dir),
        "--workpath",
        str(work_dir),
        "--specpath",
        str(spec_dir),
        str(entrypoint),
    ]
    subprocess.run(command, cwd=backend_dir, check=True)

    output_name = name
    if target_triple.endswith("windows-msvc"):
        output_name = f"{output_name}.exe"
    output_path = dist_dir / output_name

    if not output_path.exists():
        raise FileNotFoundError(
            f"PyInstaller completed but output binary is missing: {output_path}"
        )
    return output_path


def _copy_to_tauri_binaries(
    repo_root: Path,
    source_binary: Path,
    target_triple: str,
) -> Path:
    binaries_dir = repo_root / "frontend" / "src-tauri" / "binaries"
    binaries_dir.mkdir(parents=True, exist_ok=True)

    destination = binaries_dir / target_filename(target_triple)
    shutil.copy2(source_binary, destination)

    current_mode = destination.stat().st_mode
    destination.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    return destination


def build_sidecar(target_triple: str, repo_root: Path) -> Path:
    """Build sidecar via PyInstaller and copy it into src-tauri/binaries."""
    # Validate target triple early for clear errors.
    target_filename(target_triple)

    source_binary = _run_pyinstaller(repo_root=repo_root, target_triple=target_triple)
    return _copy_to_tauri_binaries(
        repo_root=repo_root,
        source_binary=source_binary,
        target_triple=target_triple,
    )


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the backend sidecar and copy it to Tauri binaries.",
    )
    parser.add_argument(
        "--target-triple",
        required=True,
        help="Rust target triple for which to build the sidecar.",
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
        destination = build_sidecar(
            target_triple=args.target_triple,
            repo_root=repo_root,
        )
    except Exception as exc:  # pylint: disable=broad-except
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"Built sidecar: {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
