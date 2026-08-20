import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Real survey files are too large to track, so backend/test_data is gitignored.
# Tests that need them skip instead of failing where they are not installed.
SAMPLE_DATA_DIR = BACKEND_DIR / "test_data"


def requires_sample_files(*file_names: str):
    """Skip the decorated test when the named sample files are not installed.

    Args:
        *file_names: Names of files expected in ``backend/test_data``.

    Returns:
        A ``pytest.mark.skipif`` marker naming the missing files.
    """
    missing = [name for name in file_names if not (SAMPLE_DATA_DIR / name).is_file()]
    return pytest.mark.skipif(
        bool(missing),
        reason=(
            "backend/test_data is not installed; missing: " + ", ".join(missing)
            if missing
            else ""
        ),
    )
