"""Apply an interface line to a MARE2DEM model as penalty-cut segments.

The whole operation, minus Flask: parse a two-column ``y z`` interface file,
turn it into segments carrying a negative boundary marker, merge it into a
model, and rebuild the matching ``.resistivity`` by inheriting region parameters
rather than resetting them.

Two entry points, matching the two-stage flow the UI uses:

- :func:`parse_interface` is cheap and answers "where would this line land". It
  runs on file drop so a unit mistake shows up as a line in the wrong place,
  before anyone waits on a merge.
- :func:`apply_penalty_cut` does the real work and returns the merged model plus
  the text of both output files.

Both share one parser, deliberately. A second implementation on the client would
be a parser that can disagree with the one that actually builds the model, and
that disagreement would surface as "the preview looked right but the output is
wrong" -- the worst kind of bug to chase.
"""

import math
import os
import tempfile
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from MARE2DEM_poly_parser import MARE2DEMPolyManager, MARE2DEMPolyParser
from poly_region_inheritance import (
    build_derived_resistivity_text,
    build_inherited_table,
    map_regions_to_source,
)

#: Interface files come in metres or kilometres; MARE2DEM models are in metres.
UNIT_SCALE = {"m": 1.0, "km": 1000.0}

#: An interface spanning less than this fraction of the model's width is almost
#: certainly a unit error rather than a genuinely short interface.
MIN_SPAN_FRACTION = 0.01

#: Marker magnitudes MARE2DEM understands: 1 is never coarsened away, 2 may be.
VALID_MARKERS = (-1, -2)


class PenaltyCutError(ValueError):
    """Raised when an interface cannot be applied to a model."""


@dataclass(frozen=True)
class PenaltyCutParameters:
    """Everything the caller gets to choose."""

    units: str = "km"
    marker: int = -1
    default_rho: float = 10.0


def parse_penalty_cut_parameters(payload: Mapping[str, Any]) -> PenaltyCutParameters:
    """Validate a parameters object from the request body.

    Args:
        payload: Decoded JSON, e.g. ``{"units": "km", "marker": -1}``.

    Returns:
        The validated parameters.

    Raises:
        PenaltyCutError: On an unknown unit, a non-negative marker, or a
            non-positive default resistivity.
    """
    if not isinstance(payload, Mapping):
        raise PenaltyCutError("Penalty cut parameters must be a JSON object")

    units = str(payload.get("units", "km")).lower()
    if units not in UNIT_SCALE:
        raise PenaltyCutError(
            f"Unknown interface units {units!r}; expected one of "
            f"{', '.join(sorted(UNIT_SCALE))}."
        )

    try:
        marker = int(payload.get("marker", -1))
    except (TypeError, ValueError) as exc:
        raise PenaltyCutError("Penalty cut marker must be an integer") from exc
    if marker not in VALID_MARKERS:
        raise PenaltyCutError(
            f"Penalty cut marker must be one of {VALID_MARKERS}; got {marker}. "
            "MARE2DEM only cuts the roughness penalty when the marker is "
            "negative, and the magnitude decides whether mesh coarsening may "
            "drop the segment."
        )

    try:
        default_rho = float(payload.get("defaultRho", 10.0))
    except (TypeError, ValueError) as exc:
        raise PenaltyCutError("Default resistivity must be a number") from exc
    if not math.isfinite(default_rho) or default_rho <= 0:
        raise PenaltyCutError(
            f"Default resistivity must be a positive number; got {default_rho}."
        )

    return PenaltyCutParameters(units=units, marker=marker, default_rho=default_rho)


def parse_interface_text(text: str, units: str = "km") -> List[Tuple[float, float]]:
    """Read a two-column ``y z`` interface from text.

    Blank lines and ``#`` comments are skipped, and columns may be separated by
    whitespace or commas -- enough to cover both the ``top_of_basement.txt``
    style and comma-separated exports.

    Args:
        text: Full contents of the interface file.
        units: ``"m"`` or ``"km"``; values are scaled to metres.

    Returns:
        The points in metres, in file order.

    Raises:
        PenaltyCutError: On an unreadable line, or fewer than two points.
    """
    if units not in UNIT_SCALE:
        raise PenaltyCutError(f"Unknown interface units {units!r}")
    scale = UNIT_SCALE[units]

    points: List[Tuple[float, float]] = []
    for line_number, raw in enumerate(text.splitlines(), start=1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        fields = line.replace(",", " ").split()
        if len(fields) < 2:
            raise PenaltyCutError(
                f"Line {line_number}: expected two columns 'y z', got {raw.strip()!r}"
            )
        try:
            y = float(fields[0]) * scale
            z = float(fields[1]) * scale
        except ValueError as exc:
            raise PenaltyCutError(
                f"Line {line_number}: could not read two numbers from {raw.strip()!r}"
            ) from exc
        if not (math.isfinite(y) and math.isfinite(z)):
            raise PenaltyCutError(f"Line {line_number}: coordinates must be finite")
        points.append((y, z))

    if len(points) < 2:
        raise PenaltyCutError(
            f"An interface needs at least two points to make a segment; found {len(points)}."
        )
    return points


def _model_bounds(vertices: Mapping[int, Mapping[str, Any]]) -> Dict[str, float]:
    ys = [vertex["hCoor"] for vertex in vertices.values()]
    zs = [vertex["vCoor"] for vertex in vertices.values()]
    return {
        "yMin": min(ys),
        "yMax": max(ys),
        "zMin": min(zs),
        "zMax": max(zs),
    }


def parse_model_bounds(payload: Mapping[str, Any]) -> Dict[str, float]:
    """Read a model bounding box supplied by the caller.

    The client already holds the loaded model, so it sends its bounds rather
    than re-uploading a multi-megabyte ``.poly`` just so the server can take a
    min and a max. The bounds only feed warnings, never the geometry.

    Raises:
        PenaltyCutError: If a key is missing or not a finite number.
    """
    bounds: Dict[str, float] = {}
    for key in ("yMin", "yMax", "zMin", "zMax"):
        if key not in payload:
            raise PenaltyCutError(f"Model bounds are missing {key!r}")
        try:
            value = float(payload[key])
        except (TypeError, ValueError) as exc:
            raise PenaltyCutError(f"Model bound {key!r} must be a number") from exc
        if not math.isfinite(value):
            raise PenaltyCutError(f"Model bound {key!r} must be finite")
        bounds[key] = value
    return bounds


def check_interface_against_model(
    points: Sequence[Tuple[float, float]],
    vertices: Mapping[int, Mapping[str, Any]],
) -> List[str]:
    """Sanity-check an interface against a parsed model. See
    :func:`check_interface_against_bounds`."""
    return check_interface_against_bounds(points, _model_bounds(vertices))


def check_interface_against_bounds(
    points: Sequence[Tuple[float, float]],
    bounds: Mapping[str, float],
) -> List[str]:
    """Sanity-check an interface against a model box, mainly for unit mistakes.

    Two checks, because either alone misses half the problem. A model padded out
    to hundreds of kilometres swallows a kilometres-read-as-metres interface
    whole, so containment says nothing; the giveaway there is that the interface
    has collapsed to a thousandth of its length. The opposite mistake, metres
    read as kilometres, shoots far outside the model, which the span check would
    happily call healthy.

    Returns:
        Zero or more human-readable warnings.
    """
    warnings: List[str] = []

    outside = sum(
        1
        for y, z in points
        if not (
            bounds["yMin"] <= y <= bounds["yMax"]
            and bounds["zMin"] <= z <= bounds["zMax"]
        )
    )
    if outside:
        warnings.append(
            f"{outside} of {len(points)} interface points fall outside the model "
            f"(y {bounds['yMin']:,.0f}..{bounds['yMax']:,.0f} m, "
            f"z {bounds['zMin']:,.0f}..{bounds['zMax']:,.0f} m). Check the units."
        )

    model_span = bounds["yMax"] - bounds["yMin"]
    ys = [y for y, _ in points]
    cut_span = max(ys) - min(ys)
    if model_span > 0 and cut_span < MIN_SPAN_FRACTION * model_span:
        warnings.append(
            f"The interface spans {cut_span:,.0f} m, only "
            f"{100 * cut_span / model_span:.3f}% of the model's "
            f"{model_span:,.0f} m width. That is the signature of a unit "
            "mismatch -- check the units."
        )

    return warnings


def parse_interface(
    text: str,
    parameters: PenaltyCutParameters,
    bounds: Optional[Mapping[str, float]] = None,
) -> Dict[str, Any]:
    """Parse an interface and describe where it lands, without merging anything.

    This backs the drop-a-file preview: it is fast, it never touches the mesh,
    and it returns the same warnings the merge would, so a unit mistake is
    visible immediately.

    Args:
        text: Contents of the interface file.
        parameters: Validated parameters; only ``units`` is used here.
        bounds: Source model bounding box, for the checks. Omit to skip them.

    Returns:
        ``{"points": [[y, z], ...], "bounds": {...}, "warnings": [...]}`` with
        coordinates in metres.
    """
    points = parse_interface_text(text, parameters.units)
    ys = [y for y, _ in points]
    zs = [z for _, z in points]

    return {
        "points": [[y, z] for y, z in points],
        "bounds": {
            "yMin": min(ys),
            "yMax": max(ys),
            "zMin": min(zs),
            "zMax": max(zs),
        },
        "warnings": (
            check_interface_against_bounds(points, bounds) if bounds else []
        ),
    }


def build_cut_model(
    points: Sequence[Tuple[float, float]], marker: int
) -> Tuple[Dict[int, Dict[str, Any]], List[Dict[str, Any]]]:
    """Turn interface points into a minimal model holding only the cut line."""
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
    return vertices, segments


def _count_structural(segments: Sequence[Mapping[str, Any]]) -> int:
    """Segments mesh coarsening must never drop -- ``abs(marker) < 2``."""
    return sum(1 for s in segments if abs(s.get("boundary_marker") or 0) < 2)


def _count_cuts(segments: Sequence[Mapping[str, Any]]) -> int:
    return sum(1 for s in segments if (s.get("boundary_marker") or 0) < 0)


def apply_penalty_cut(
    source_vertices: Mapping[int, Mapping[str, Any]],
    source_segments: Sequence[Mapping[str, Any]],
    source_holes: Sequence[Mapping[str, Any]],
    source_regions: Sequence[Mapping[str, Any]],
    source_resistivity_table,
    source_resistivity_text: str,
    interface_text: str,
    parameters: PenaltyCutParameters,
    output_poly_name: str,
) -> Dict[str, Any]:
    """Merge an interface into a model and rebuild its resistivity file.

    Args:
        source_vertices, source_segments, source_holes, source_regions: The
            parsed source ``.poly``.
        source_resistivity_table: Parsed table of the source ``.resistivity``.
        source_resistivity_text: Raw text of the source ``.resistivity``, whose
            header is carried across.
        interface_text: Contents of the interface file.
        parameters: Validated parameters.
        output_poly_name: Value for the output's ``Model File`` header.

    Returns:
        A dict with the merged model (``vertices``/``segments``/``holes``/
        ``regions``), the text of both output files, ``stats`` and ``warnings``.

    Raises:
        PenaltyCutError: If the interface is unusable or the merge loses
            structural segments.
    """
    points = parse_interface_text(interface_text, parameters.units)
    warnings = check_interface_against_model(points, source_vertices)

    cut_vertices, cut_segments = build_cut_model(points, parameters.marker)

    manager = MARE2DEMPolyManager()
    merged_vertices, merged_segments, merged_holes, merged_regions = manager.merge_parsed(
        source_vertices,
        list(source_segments),
        list(source_holes),
        list(source_regions),
        cut_vertices,
        cut_segments,
        [],
        None,
    )

    # merge_poly removes segments to clear slivers, and its rule does not tell
    # marker 1 (outer boundary, fixed-region edges) from marker 2. Losing one of
    # those silently changes the model, so it is an error, not a warning.
    structural_before = _count_structural(source_segments)
    structural_after = _count_structural(merged_segments)
    if structural_after < structural_before:
        raise PenaltyCutError(
            f"Merging dropped {structural_before - structural_after} structural "
            "segments (the outer boundary or the edges of fixed regions). The "
            "interface probably grazes one of them at a sharp angle; move it "
            "away from the boundary and try again."
        )

    mapping = map_regions_to_source(
        source_vertices, source_segments, source_regions, merged_regions
    )
    table, inheritance = build_inherited_table(
        source_resistivity_table, mapping, default_rho=parameters.default_rho
    )
    if inheritance.fixed_regions == 0:
        warnings.append(
            "No fixed regions in the result. Air and seawater are normally "
            "Param = 0; check the source .resistivity file."
        )

    resistivity_text = build_derived_resistivity_text(
        source_resistivity_text, table, model_file=os.path.basename(output_poly_name)
    )

    poly_text = render_poly_text(
        merged_vertices, merged_segments, merged_holes, merged_regions
    )

    cuts_before = _count_cuts(source_segments)
    cuts_after = _count_cuts(merged_segments)

    return {
        "vertices": merged_vertices,
        "segments": merged_segments,
        "holes": merged_holes,
        "regions": merged_regions,
        "polyText": poly_text,
        "resistivityText": resistivity_text,
        "stats": {
            "interfacePointCount": len(points),
            "sourceSegmentCount": len(source_segments),
            "mergedSegmentCount": len(merged_segments),
            "sourceRegionCount": len(source_regions),
            "mergedRegionCount": len(merged_regions),
            "cutSegmentsBefore": cuts_before,
            "cutSegmentsAfter": cuts_after,
            "cutSegmentsAdded": cuts_after - cuts_before,
            "inheritedRegionCount": inheritance.inherited,
            "unmatchedRegionCount": inheritance.unmatched,
            "fixedRegionCount": inheritance.fixed_regions,
            "freeParameterCount": inheritance.free_parameters,
        },
        "warnings": warnings,
    }


def render_poly_text(vertices, segments, holes, regions) -> str:
    """Serialise a model to ``.poly`` text.

    ``MARE2DEMPolyParser.write_poly_file`` owns the ``.poly`` layout and only
    writes to a path, so this round-trips through a temporary file rather than
    keeping a second copy of the format in sync. The models are a few MB, which
    makes that cheaper than the maintenance it saves.
    """
    parser = MARE2DEMPolyParser()
    with tempfile.TemporaryDirectory() as temp_dir:
        path = os.path.join(temp_dir, "merged.poly")
        parser.write_poly_file(path, vertices, segments, holes, regions)
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
