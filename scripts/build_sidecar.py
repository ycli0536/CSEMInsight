#!/usr/bin/env python3
"""Build the backend and stage it as a Tauri resource directory.

The backend is frozen with PyInstaller's onedir layout, not onefile.
Onefile extracted a 39MB archive to a fresh temp path on every launch,
which meant macOS re-validated every native library's code signature every
time (the validation cache is keyed by path) -- about 20s of startup per
launch, forever. Onedir installs at a stable path, so that cost is paid
once per install/update and warm launches take about a second.

A directory cannot ship through tauri.conf.json's `externalBin` (that
contract wants a single file), so the tree is staged under
frontend/src-tauri/resources/backend/ and declared in the `resources`
map instead; the shell resolves the executable via resource_dir() at
runtime.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


SUPPORTED_TARGET_TRIPLES = {
    "aarch64-apple-darwin",
    "x86_64-pc-windows-msvc",
    "x86_64-unknown-linux-gnu",
}


def executable_name(target_triple: str) -> str:
    """Return the backend executable's file name for a target triple."""
    if target_triple not in SUPPORTED_TARGET_TRIPLES:
        raise ValueError(
            f"Unsupported target triple '{target_triple}'. "
            f"Supported values: {sorted(SUPPORTED_TARGET_TRIPLES)}"
        )
    if target_triple.endswith("windows-msvc"):
        return "csemInsight.exe"
    return "csemInsight"


def _run_pyinstaller(repo_root: Path, target_triple: str) -> Path:
    backend_dir = repo_root / "backend"
    entrypoint = backend_dir / "main.py"
    if not entrypoint.exists():
        raise FileNotFoundError(f"Backend entrypoint not found: {entrypoint}")

    dist_dir = backend_dir / "dist"
    work_dir = backend_dir / "build" / f"pyinstaller-{target_triple}"
    spec_dir = work_dir / "spec"

    # The backend imports none of these, but PyInstaller follows pandas's
    # and scipy's optional imports and bundles whatever the build venv has
    # installed. Excluding them keeps a dev-venv build (which also carries
    # the Jupyter/pytest stack) identical to a CI build from requirements.txt.
    excluded_modules = [
        "matplotlib",
        "PIL",
        "IPython",
        "ipykernel",
        "jupyter_client",
        "jupyter_core",
        "tornado",
        "pytest",
        "_pytest",
    ]
    exclude_args = []
    for module in excluded_modules:
        exclude_args += ["--exclude-module", module]

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onedir",
        *exclude_args,
        "--name",
        "csemInsight",
        "--distpath",
        str(dist_dir / target_triple),
        "--workpath",
        str(work_dir),
        "--specpath",
        str(spec_dir),
        str(entrypoint),
    ]
    subprocess.run(command, cwd=backend_dir, check=True)

    output_dir = dist_dir / target_triple / "csemInsight"
    if not (output_dir / executable_name(target_triple)).exists():
        raise FileNotFoundError(
            f"PyInstaller completed but the executable is missing in: {output_dir}"
        )
    return output_dir


def stage_to_resources(
    repo_root: Path,
    source_dir: Path,
    target_triple: str,
) -> Path:
    """Copy the onedir tree into the Tauri resources location.

    Args:
        repo_root: Repository root.
        source_dir: PyInstaller onedir output directory.
        target_triple: Rust target triple, for the executable name.

    Returns:
        The staged directory, frontend/src-tauri/resources/backend.

    Raises:
        FileNotFoundError: If the tree lacks the expected executable.
    """
    exe = source_dir / executable_name(target_triple)
    if not exe.is_file():
        raise FileNotFoundError(f"Backend executable missing in tree: {exe}")

    destination = repo_root / "frontend" / "src-tauri" / "resources" / "backend"
    if destination.exists():
        shutil.rmtree(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source_dir, destination)

    staged_exe = destination / executable_name(target_triple)
    staged_exe.chmod(staged_exe.stat().st_mode | 0o755)
    return destination


def build_sidecar(target_triple: str, repo_root: Path) -> Path:
    """Freeze the backend and stage it under src-tauri/resources."""
    executable_name(target_triple)  # Validate the triple early.

    source_dir = _run_pyinstaller(repo_root=repo_root, target_triple=target_triple)
    return stage_to_resources(
        repo_root=repo_root,
        source_dir=source_dir,
        target_triple=target_triple,
    )


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the backend and stage it as a Tauri resource.",
    )
    parser.add_argument(
        "--target-triple",
        required=True,
        help="Rust target triple for which to build the backend.",
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

    print(f"Staged backend: {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
