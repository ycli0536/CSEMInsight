#!/usr/bin/env python3
"""Add a penalty cut to a MARE2DEM model from a two-column interface file.

Takes a ``.poly`` / ``.resistivity`` pair and a text file holding an interface as
``y z`` points -- a seafloor pick, a top-of-basement horizon, a fault trace --
and writes a new pair with that interface inserted as penalty-cut segments.

    python add_penalty_cut.py \\
        --poly     inv_IC_ef3_rm320_of3.poly \\
        --resistivity inv_IC_ef3_rm320_of3.0.resistivity \\
        --cut      line3_aleut_top_of_basement.txt \\
        --cut-units km \\
        --out-prefix line3_with_cut

The new segments carry a negative boundary marker, which is what makes MARE2DEM
treat them as cuts (``mare2dem_penaltymatrix.f90:187``). ``-1`` is the default
because a hand-drawn structural interface should survive mesh coarsening;
``abs(marker) < 2`` is never coarsened away (``mare2dem_worker.f90:682``). Pass
``--marker -2`` if the interface should be coarsenable instead.

Merging renumbers every region, so the resistivity file is rebuilt too. Values
are *inherited* rather than reset: each new region takes the row of the source
region containing its seed point, which keeps air and seawater fixed. See
``poly_region_inheritance``.
"""

import argparse
import os
import sys
import time
from typing import List, Optional, Tuple

import numpy as np

from MARE2DEM_poly_parser import MARE2DEMPolyManager, MARE2DEMPolyParser
from poly_region_inheritance import (
    build_derived_resistivity_text,
    build_inherited_table,
    map_regions_to_source,
)
from resistivity_file_parser import ResistivityFileParser

#: Interface files come in metres or kilometres; MARE2DEM models are in metres.
UNIT_SCALE = {"m": 1.0, "km": 1000.0}


class PenaltyCutError(ValueError):
    """Raised when the cut cannot be applied to the model."""


def read_interface_points(path: str, scale: float) -> np.ndarray:
    """Read a two-column ``y z`` interface file.

    Blank lines and ``#`` comments are skipped. Columns may be separated by
    whitespace or commas, which covers both the ``top_of_basement.txt`` style and
    comma-separated exports.

    Args:
        path: Interface file.
        scale: Multiplier onto both columns, from :data:`UNIT_SCALE`.

    Returns:
        An ``(n, 2)`` array of ``y z`` in metres.

    Raises:
        PenaltyCutError: If fewer than two usable points are present.
    """
    points: List[Tuple[float, float]] = []
    with open(path, "r", encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, start=1):
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            fields = line.replace(",", " ").split()
            if len(fields) < 2:
                raise PenaltyCutError(
                    f"{path}:{line_number}: expected two columns 'y z', got {raw.strip()!r}"
                )
            try:
                points.append((float(fields[0]) * scale, float(fields[1]) * scale))
            except ValueError as exc:
                raise PenaltyCutError(
                    f"{path}:{line_number}: could not read two numbers from {raw.strip()!r}"
                ) from exc

    if len(points) < 2:
        raise PenaltyCutError(
            f"{path}: need at least two points to make a segment, found {len(points)}."
        )
    return np.asarray(points, dtype=float)


#: An interface spanning less than this fraction of the model's width is almost
#: certainly a unit error rather than a real, very short interface.
_MIN_SPAN_FRACTION = 0.01


def check_within_model(points: np.ndarray, vertices) -> List[str]:
    """Sanity-check the interface against the model, mainly for unit errors.

    Two checks, because either alone misses the common failure. A MARE2DEM model
    padded out to hundreds of kilometres swallows a kilometres-read-as-metres
    interface entirely inside its bounding box, so containment alone says
    nothing; the giveaway is that the interface has collapsed to a thousandth of
    its intended length. Conversely a metres-read-as-kilometres interface shoots
    far outside the box, which the span check would call healthy.

    Args:
        points: ``(n, 2)`` interface points in metres.
        vertices: Vertices of the source ``.poly``.

    Returns:
        Zero or more warning messages.
    """
    ys = np.fromiter((v["hCoor"] for v in vertices.values()), dtype=float)
    zs = np.fromiter((v["vCoor"] for v in vertices.values()), dtype=float)
    warnings: List[str] = []

    outside = int(
        (
            ~(
                (points[:, 0] >= ys.min())
                & (points[:, 0] <= ys.max())
                & (points[:, 1] >= zs.min())
                & (points[:, 1] <= zs.max())
            )
        ).sum()
    )
    if outside:
        warnings.append(
            f"{outside} of {len(points)} interface points fall outside the model box "
            f"(y {ys.min():,.0f}..{ys.max():,.0f} m, z {zs.min():,.0f}..{zs.max():,.0f} m). "
            "Check --cut-units."
        )

    model_span = ys.max() - ys.min()
    cut_span = points[:, 0].max() - points[:, 0].min()
    if model_span > 0 and cut_span < _MIN_SPAN_FRACTION * model_span:
        warnings.append(
            f"The interface spans {cut_span:,.0f} m, only "
            f"{100 * cut_span / model_span:.3f}% of the model's {model_span:,.0f} m width. "
            "That is the signature of a unit mismatch -- check --cut-units."
        )

    return warnings


def build_cut_poly(points: np.ndarray, marker: int, path: str) -> None:
    """Write the interface out as a minimal ``.poly`` holding only the cut line."""
    parser = MARE2DEMPolyParser()
    vertices = {
        index + 1: {
            "hCoor": float(y),
            "vCoor": float(z),
            "attributes": [],
            "boundary_marker": None,
        }
        for index, (y, z) in enumerate(points)
    }
    segments = [
        {
            "id": index + 1,
            "endpoint_1": index + 1,
            "endpoint_2": index + 2,
            "boundary_marker": marker,
        }
        for index in range(len(points) - 1)
    ]
    parser.write_poly_file(path, vertices, segments, [], None)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--poly", required=True, help="source MARE2DEM .poly model")
    parser.add_argument(
        "--resistivity",
        required=True,
        help="source .resistivity, whose values and fixed regions are inherited",
    )
    parser.add_argument("--cut", required=True, help="two-column 'y z' interface file")
    parser.add_argument(
        "--cut-units",
        choices=sorted(UNIT_SCALE),
        default="km",
        help="units of the interface file (default: km)",
    )
    parser.add_argument(
        "--marker",
        type=int,
        default=-1,
        help="boundary marker for the new segments; must be negative to be a cut "
        "(default: -1, never coarsened away)",
    )
    parser.add_argument(
        "--out-prefix",
        required=True,
        help="output prefix; writes <prefix>.poly and <prefix>.0.resistivity",
    )
    parser.add_argument(
        "--default-rho",
        type=float,
        default=10.0,
        help="resistivity for regions that match nothing in the source (default: 10)",
    )
    parser.add_argument(
        "--min-angle",
        type=float,
        default=27.0,
        help="report segment intersections sharper than this, in degrees "
        "(default: 27, matching MARE2DEMPolyManager.min_angle_degrees)",
    )
    args = parser.parse_args(argv)

    if args.marker >= 0:
        parser.error(
            f"--marker must be negative to make a penalty cut; got {args.marker}. "
            "MARE2DEM only cuts the roughness penalty when the marker is < 0."
        )

    poly_parser = MARE2DEMPolyParser()
    manager = MARE2DEMPolyManager()
    resistivity_parser = ResistivityFileParser()

    out_poly = f"{args.out_prefix}.poly"
    out_resistivity = f"{args.out_prefix}.0.resistivity"
    cut_poly = f"{args.out_prefix}.cutline.poly"

    points = read_interface_points(args.cut, UNIT_SCALE[args.cut_units])
    print(f"Interface : {len(points)} points from {args.cut} ({args.cut_units})")

    source_vertices, source_segments, _, source_regions = poly_parser.read_poly_file(
        args.poly, unit_scale_factor=1
    )
    print(
        f"Source    : {len(source_vertices):,} vertices, "
        f"{len(source_segments):,} segments, {len(source_regions):,} regions"
    )

    for warning in check_within_model(points, source_vertices):
        print(f"WARNING   : {warning}", file=sys.stderr)

    build_cut_poly(points, args.marker, cut_poly)

    started = time.time()
    merged = manager.merge_poly(
        args.poly, cut_poly, unit_scale_factor=1, output_file=out_poly
    )
    merged_vertices, merged_segments, _, merged_regions = merged
    print(f"Merged    : {time.time() - started:.1f}s -> {out_poly}")

    cuts = sum(1 for s in merged_segments if (s.get("boundary_marker") or 0) < 0)
    source_cuts = sum(1 for s in source_segments if (s.get("boundary_marker") or 0) < 0)
    print(
        f"Cuts      : {source_cuts:,} before -> {cuts:,} after "
        f"(+{cuts - source_cuts:,} from this interface, after splitting)"
    )

    # merge_poly already enforces its own minimum angle by *deleting* segments,
    # so a post-hoc sliver check is nearly vacuous. The question that matters is
    # what the deletion took with it: segments with abs(marker) < 2 are the outer
    # boundary and the edges of fixed regions, and losing one silently changes
    # the model (mare2dem_worker.f90:682).
    structural_before = sum(
        1 for s in source_segments if abs(s.get("boundary_marker") or 0) < 2
    )
    structural_after = sum(
        1 for s in merged_segments if abs(s.get("boundary_marker") or 0) < 2
    )
    if structural_after < structural_before:
        print(
            f"WARNING   : {structural_before - structural_after} structural segments "
            "(outer boundary or fixed-region edges) were dropped during merging. "
            "Inspect the result before running an inversion.",
            file=sys.stderr,
        )

    quality = manager.validate_angle_quality(
        merged_vertices, merged_segments, min_angle_degrees=args.min_angle
    )
    sharp = quality.get("pairs_with_small_angles", 0)
    print(
        f"Angles    : {quality.get('total_pairs_checked', 0):,} adjacent pairs checked, "
        f"{sharp:,} sharper than {args.min_angle:g} degrees"
    )
    if sharp:
        print(
            f"WARNING   : {sharp} segment pairs meet at less than {args.min_angle:g} "
            "degrees; the MARE2DEM manual warns that slivers break meshing.",
            file=sys.stderr,
        )

    source_table = resistivity_parser.parse_resistivity_file(
        args.resistivity, rho_parse=True
    )["table"]
    mapping = map_regions_to_source(
        source_vertices, source_segments, source_regions, merged_regions
    )
    table, stats = build_inherited_table(
        source_table, mapping, default_rho=args.default_rho
    )
    print(
        f"Regions   : {stats.target_regions:,} "
        f"({stats.inherited:,} inherited, {stats.unmatched:,} new) | "
        f"{stats.fixed_regions} fixed, {stats.free_parameters:,} free parameters"
    )
    if stats.fixed_regions == 0:
        print(
            "WARNING   : no fixed regions in the result. Air and seawater are "
            "normally Param = 0; check the source resistivity file.",
            file=sys.stderr,
        )

    with open(args.resistivity, "r", encoding="utf-8") as handle:
        source_text = handle.read()
    text = build_derived_resistivity_text(
        source_text, table, model_file=os.path.basename(out_poly)
    )
    with open(out_resistivity, "w", encoding="utf-8") as handle:
        handle.write(text)
    print(f"Written   : {out_resistivity}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
