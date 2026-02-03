#!/usr/bin/env python3
"""
Preprocess CSEM data files for CSEMInsight demo.

This script converts MARE2DEM .data and .resp files into JSON format
matching the dataset object shape expected by the frontend embed API.
Output files are placed in frontend/public/demo-data/data/ for static demo.

Usage:
    python scripts/preprocess-demo-data.py \\
        --data <path_to_data_file> \\
        --resp <path_to_resp_file> \\
        --out <output_directory>
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Add backend to Python path to import parsers
BACKEND_DIR = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from csem_datafile_parser import CSEMDataFileReader


def parse_csem_datafile(file_path: str, dataset_id: str, dataset_name: str) -> dict:
    """
    Parse a CSEM data file using backend parser logic.

    Replicates _parse_csem_datafile() from backend/main.py to ensure
    identical output structure.

    Args:
        file_path: Path to .data or .resp file
        dataset_id: Manifest ID for deterministic output
        dataset_name: Display name for the dataset

    Returns:
        Dataset object matching frontend expectations
    """
    csem_datafile_reader = CSEMDataFileReader(file_path)

    # Ensure blocks are in the correct order for frontend
    ordered_blocks = {}
    for block_name in csem_datafile_reader.block_infos:
        if block_name in csem_datafile_reader.blocks:
            ordered_blocks[block_name] = csem_datafile_reader.blocks[block_name]

    csem_data = ordered_blocks
    geometry_info = csem_datafile_reader.extract_geometry_info()
    data_df = csem_datafile_reader.data_block_init(csem_data["Data"])

    # Handle different data types
    if csem_datafile_reader.data_type == "joint":
        rx_data_df = csem_datafile_reader.rx_data_block_init(csem_data["Rx_CSEM"])
    elif csem_datafile_reader.data_type == "CSEM":
        rx_data_df = csem_datafile_reader.rx_data_block_init(csem_data["Rx"])
    elif csem_datafile_reader.data_type == "MT":
        raise ValueError(f"Cannot process data type: {csem_datafile_reader.data_type}")
    else:
        raise ValueError(f"Invalid data type: {csem_datafile_reader.data_type}")

    tx_data_df = csem_datafile_reader.tx_data_block_init(csem_data["Tx"])
    rx_data_lonlat_df = csem_datafile_reader.ne2latlon(rx_data_df, geometry_info)
    tx_data_lonlat_df = csem_datafile_reader.ne2latlon(tx_data_df, geometry_info)

    data_rx_tx_df = csem_datafile_reader.merge_data_rx_tx(
        data_df,
        rx_data_lonlat_df,
        tx_data_lonlat_df,
    )

    data_js = csem_datafile_reader.df_to_json(data_rx_tx_df)

    # Build dataset object matching /api/load-sample-data response
    return {
        "id": dataset_id,
        "name": dataset_name,
        "geometryInfo": geometry_info,
        "data": data_js,  # JSON string in 'table' orient
        "dataBlocks": csem_data,  # Dict-like block map (NOT array)
    }


def write_json_output(dataset: dict, output_path: str) -> None:
    """
    Write dataset object to JSON file.

    Args:
        dataset: Dataset object to serialize
        output_path: Target file path
    """
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"✓ Written: {output_path} ({Path(output_path).stat().st_size} bytes)")


def main():
    parser = argparse.ArgumentParser(
        description="Preprocess CSEM data files for CSEMInsight demo",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process both files with default output directory
  python scripts/preprocess-demo-data.py \\
    --data ~/Dropbox/.../EMAGE_CSEM_Line5_s5_m3.data \\
    --resp ~/Dropbox/.../202406mainP90.24.resp

  # Custom output directory
  python scripts/preprocess-demo-data.py \\
    --data input.data \\
    --resp input.resp \\
    --out custom/output/dir
        """,
    )

    parser.add_argument(
        "--data",
        required=True,
        help="Path to .data file",
    )
    parser.add_argument(
        "--resp",
        required=True,
        help="Path to .resp file",
    )
    parser.add_argument(
        "--out",
        default="frontend/public/demo-data/data",
        help="Output directory (default: frontend/public/demo-data/data)",
    )

    args = parser.parse_args()

    # Validate input files exist
    data_path = Path(args.data)
    resp_path = Path(args.resp)

    if not data_path.exists():
        print(f"✗ Error: Data file not found: {data_path}", file=sys.stderr)
        sys.exit(1)

    if not resp_path.exists():
        print(f"✗ Error: Resp file not found: {resp_path}", file=sys.stderr)
        sys.exit(1)

    # Validate file extensions
    if not data_path.suffix.lower() in [".data", ".emdata"]:
        print(
            f"✗ Error: Invalid data file extension: {data_path.suffix}", file=sys.stderr
        )
        sys.exit(1)

    if not resp_path.suffix.lower() == ".resp":
        print(
            f"✗ Error: Invalid resp file extension: {resp_path.suffix}", file=sys.stderr
        )
        sys.exit(1)

    output_dir = Path(args.out)

    print("CSEMInsight Demo Data Preprocessor")
    print("=" * 50)
    print(f"Data file:   {data_path}")
    print(f"Resp file:   {resp_path}")
    print(f"Output dir:  {output_dir}")
    print()

    # Process data file
    try:
        print("Processing data file...")
        data_dataset = parse_csem_datafile(
            str(data_path),
            dataset_id="shumagin-line5-data",
            dataset_name="Shumagin_Line5_data.json",
        )
        data_output_path = output_dir / "Shumagin_Line5_data.json"
        write_json_output(data_dataset, str(data_output_path))
    except Exception as e:
        print(f"✗ Error processing data file: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)

    # Process resp file
    try:
        print("Processing resp file...")
        resp_dataset = parse_csem_datafile(
            str(resp_path),
            dataset_id="shumagin-line5-resp",
            dataset_name="Shumagin_Line5_resp.json",
        )
        resp_output_path = output_dir / "Shumagin_Line5_resp.json"
        write_json_output(resp_dataset, str(resp_output_path))
    except Exception as e:
        print(f"✗ Error processing resp file: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)

    print()
    print("=" * 50)
    print("✓ Preprocessing complete!")
    print()
    print("Next steps:")
    print("  1. Verify JSON files exist and are non-empty")
    print("  2. Commit the generated JSON files to repo")
    print("  3. Build and test demo page with these assets")


if __name__ == "__main__":
    main()
