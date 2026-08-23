"""Constrain resistivity bounds over part of a model, from a boundary or polygon.

MARE2DEM's bandpass transform reads a ``Lower``/``Upper`` pair per region out of
the ``.resistivity`` file, and a pair of zeros means "fall back to Global
Bounds". Constraining part of a section is therefore a matter of writing those
two columns for the regions that fall inside a shape and leaving everything else
-- the mesh, the rho values, the prejudice and weight columns -- exactly as it
was.

Deliberately independent of the penalty cut. That one changes the geometry, this
one rewrites two columns, so the two can be applied in either order without
interacting.

Two shapes, because a model gets asked two different questions:

- A *boundary* is an open line -- the same two-column ``y z`` file a penalty cut
  takes -- and selects everything on one side of it: "below the basement".
- A *polygon* is a closed ring and selects what is inside it: a salt body, a
  reservoir, the stretch of section a well constrains.

A region is picked by its interior point, the ``(y, z)`` MARE2DEM itself uses to
decide which region a triangle belongs to, so "inside" here means what it means
to the solver. Depth is positive down, so "below" is the larger ``z``.
"""

import bisect
import math
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from penalty_cut_service import (
    UNIT_SCALE,
    PenaltyCutError,
    check_interface_against_bounds,
    parse_interface_text,
)
from resistivity_file_parser import ResistivityFileParser

#: A boundary line splits the model; a polygon encloses part of it.
SHAPES = ("boundary", "polygon")

#: Which side of a boundary the bounds apply to. Depth is positive down.
SIDES = ("below", "above")

#: Column names that hold the region number of a table row.
_REGION_HEADERS = {"#", "region", "region#", "region-id", "regionid"}

_LINE_ENDING_PATTERN = re.compile(r"(\r\n|\n|\r)$")
_TOKEN_PATTERN = re.compile(r"\S+")


class RhoBoundError(ValueError):
    """Raised when bounds cannot be applied to a model."""


@dataclass(frozen=True)
class RhoBoundParameters:
    """Everything the caller gets to choose."""

    shape: str = "boundary"
    units: str = "km"
    side: str = "below"
    lower: float = 0.0
    upper: float = 0.0
    #: Anisotropy qualifier to restrict the update to, e.g. ``"z"``. ``None``
    #: writes every Lower/Upper pair the file has.
    component: Optional[str] = None


@dataclass(frozen=True)
class RegionSelection:
    """Which regions a shape picks out, and what it could not answer for."""

    region_ids: List[int]
    total_count: int
    #: Regions whose interior point sits off the ends of a boundary line, where
    #: the boundary has no depth to compare against.
    outside_span_count: int


def parse_rho_bound_parameters(payload: Mapping[str, Any]) -> RhoBoundParameters:
    """Validate a parameters object from the request body.

    Args:
        payload: Decoded JSON, e.g. ``{"shape": "boundary", "side": "below",
            "lower": 1, "upper": 500}``.

    Returns:
        The validated parameters.

    Raises:
        RhoBoundError: On an unknown shape, side or unit, or on a bound pair
            MARE2DEM would not read as a band.
    """
    if not isinstance(payload, Mapping):
        raise RhoBoundError("Rho bound parameters must be a JSON object")

    shape = str(payload.get("shape", "boundary")).lower()
    if shape not in SHAPES:
        raise RhoBoundError(
            f"Unknown shape {shape!r}; expected one of {', '.join(SHAPES)}."
        )

    units = str(payload.get("units", "km")).lower()
    if units not in UNIT_SCALE:
        raise RhoBoundError(
            f"Unknown shape units {units!r}; expected one of "
            f"{', '.join(sorted(UNIT_SCALE))}."
        )

    side = str(payload.get("side", "below")).lower()
    if side not in SIDES:
        raise RhoBoundError(
            f"Unknown side {side!r}; expected one of {', '.join(SIDES)}."
        )

    lower = _parse_bound(payload.get("lower", 0.0), "Lower bound")
    upper = _parse_bound(payload.get("upper", 0.0), "Upper bound")
    # Zeros are not "no bound applied", they are the value that tells MARE2DEM
    # to use Global Bounds for that region -- which is how a bound is cleared
    # again. A one-sided pair has no such meaning, so it is rejected rather
    # than written out and left to behave unpredictably in an inversion.
    if (lower == 0) != (upper == 0):
        raise RhoBoundError(
            "Bounds come as a pair: give both a lower and an upper bound, or "
            "both as 0 to clear the region's bounds and fall back to Global "
            "Bounds."
        )
    if lower and upper and lower >= upper:
        raise RhoBoundError(
            f"The lower bound must be below the upper bound; got {lower} and {upper}."
        )

    component = payload.get("component")
    if component is not None:
        component = str(component).strip().lower()
        if not component:
            component = None

    return RhoBoundParameters(
        shape=shape,
        units=units,
        side=side,
        lower=lower,
        upper=upper,
        component=component,
    )


def _parse_bound(value: Any, label: str) -> float:
    try:
        bound = float(value)
    except (TypeError, ValueError) as exc:
        raise RhoBoundError(f"{label} must be a number") from exc
    if not math.isfinite(bound) or bound < 0:
        raise RhoBoundError(f"{label} must be a finite, non-negative number; got {value}.")
    return bound


def parse_shape_text(text: str, parameters: RhoBoundParameters) -> List[Tuple[float, float]]:
    """Read a shape from a two-column ``y z`` file.

    Shares the penalty cut's parser, deliberately: it is the same file format,
    and a second reader is a reader that can disagree about where a line lands.

    Raises:
        RhoBoundError: On an unreadable line, or too few points for the shape.
    """
    try:
        points = parse_interface_text(text, parameters.units)
    except PenaltyCutError as exc:
        raise RhoBoundError(str(exc)) from exc
    return _check_point_count(points, parameters)


def parse_shape_points(raw_points: Any, parameters: RhoBoundParameters) -> List[Tuple[float, float]]:
    """Read a shape from JSON coordinates, as a lasso in the viewer produces.

    Same units rule as the file form, so a polygon drawn on screen and one read
    from disk land in the same place.

    Raises:
        RhoBoundError: On a malformed point, or too few points for the shape.
    """
    if not isinstance(raw_points, Sequence) or isinstance(raw_points, (str, bytes)):
        raise RhoBoundError("Shape points must be a list of [y, z] pairs.")

    scale = UNIT_SCALE[parameters.units]
    points: List[Tuple[float, float]] = []
    for index, raw in enumerate(raw_points, start=1):
        if isinstance(raw, Mapping):
            pair = (raw.get("y"), raw.get("z"))
        elif isinstance(raw, Sequence) and not isinstance(raw, (str, bytes)) and len(raw) >= 2:
            pair = (raw[0], raw[1])
        else:
            raise RhoBoundError(f"Shape point {index} is not a [y, z] pair.")

        try:
            y = float(pair[0]) * scale
            z = float(pair[1]) * scale
        except (TypeError, ValueError) as exc:
            raise RhoBoundError(f"Shape point {index} is not a pair of numbers.") from exc
        if not (math.isfinite(y) and math.isfinite(z)):
            raise RhoBoundError(f"Shape point {index} must be finite.")
        points.append((y, z))

    return _check_point_count(points, parameters)


def _check_point_count(
    points: List[Tuple[float, float]], parameters: RhoBoundParameters
) -> List[Tuple[float, float]]:
    minimum = 3 if parameters.shape == "polygon" else 2
    if len(points) < minimum:
        noun = "polygon" if parameters.shape == "polygon" else "boundary"
        raise RhoBoundError(
            f"A {noun} needs at least {minimum} points; found {len(points)}."
        )
    return points


def check_shape_against_bounds(
    points: Sequence[Tuple[float, float]], bounds: Mapping[str, float]
) -> List[str]:
    """Warn about a shape that has plainly been read in the wrong unit.

    The same two checks the penalty cut runs, for the same reason: a shape a
    thousand times too small or too large still selects *some* regions, so
    without this the only symptom is a bound on the wrong part of the model.
    """
    return check_interface_against_bounds(points, bounds)


def _region_number(region: Mapping[str, Any]) -> int:
    """The number a region is known by in the .resistivity table.

    MARE2DEM keys the table on the region's attribute, not its position in the
    .poly, and so does the viewer -- see _build_region_resistivity_lookup.
    Selecting on anything else would write bounds onto rows nobody selected.
    """
    number = region.get("attribute") or region.get("id")
    return int(number)


def _point_in_polygon(y: float, z: float, polygon: Sequence[Tuple[float, float]]) -> bool:
    """Ray casting, with a half-open rule so a shared edge counts once."""
    inside = False
    count = len(polygon)
    for index in range(count):
        y1, z1 = polygon[index]
        y2, z2 = polygon[(index + 1) % count]
        if (z1 > z) != (z2 > z):
            crossing_y = y1 + (z - z1) * (y2 - y1) / (z2 - z1)
            if y < crossing_y:
                inside = not inside
    return inside


def _boundary_depth_at(
    ys: Sequence[float], zs: Sequence[float], y: float
) -> Optional[float]:
    """Depth of a boundary at ``y``, or None where the boundary does not reach.

    Extrapolating past the last point of a horizon is how a bound ends up on
    regions nobody looked at, so off the ends the answer is "unknown" and the
    caller reports it instead of guessing.
    """
    if y < ys[0] or y > ys[-1]:
        return None

    index = bisect.bisect_left(ys, y)
    if ys[index] == y:
        return zs[index]

    y1, z1 = ys[index - 1], zs[index - 1]
    y2, z2 = ys[index], zs[index]
    if y2 == y1:
        return z2
    return z1 + (z2 - z1) * (y - y1) / (y2 - y1)


def select_regions(
    regions: Optional[Sequence[Mapping[str, Any]]],
    points: Sequence[Tuple[float, float]],
    parameters: RhoBoundParameters,
) -> RegionSelection:
    """Pick the regions a shape covers, by their interior points.

    Raises:
        RhoBoundError: If the model carries no regions to select from.
    """
    if not regions:
        raise RhoBoundError(
            "The .poly file has no regions, so there is nothing to bound. "
            "Region interior points are what identifies a region to MARE2DEM."
        )

    if parameters.shape == "polygon":
        selected = [
            _region_number(region)
            for region in regions
            if _point_in_polygon(region["hCoor"], region["vCoor"], points)
        ]
        return RegionSelection(
            region_ids=sorted(set(selected)),
            total_count=len(regions),
            outside_span_count=0,
        )

    ordered = sorted(points, key=lambda point: point[0])
    ys = [point[0] for point in ordered]
    zs = [point[1] for point in ordered]

    selected: List[int] = []
    outside = 0
    for region in regions:
        depth = _boundary_depth_at(ys, zs, region["hCoor"])
        if depth is None:
            outside += 1
            continue
        is_below = region["vCoor"] > depth
        if is_below == (parameters.side == "below"):
            selected.append(_region_number(region))

    return RegionSelection(
        region_ids=sorted(set(selected)),
        total_count=len(regions),
        outside_span_count=outside,
    )


@dataclass(frozen=True)
class _BoundColumns:
    """Where the region number and each Lower/Upper pair sit in a data row."""

    region_index: int
    #: qualifier ("" when isotropic) -> (lower token index, upper token index)
    pairs: Dict[str, Tuple[int, int]]

    @property
    def names(self) -> List[str]:
        return sorted(self.pairs)


def _normalize(token: str) -> str:
    return str(token).strip().lower().replace("_", "-")


def _detect_bound_columns(
    header_line: str, component: Optional[str]
) -> Optional[_BoundColumns]:
    """Locate the bound columns of a "!#" header line.

    Uses the .resistivity parser's own header reader rather than a plain split:
    an anisotropic header separates a column from its direction qualifier with
    a single space ("Lower z  Upper z  Lower xy"), so splitting on whitespace
    would put every bound column at the wrong index.

    Returns:
        The column positions, or None if this is not a table header.
    """
    columns = ResistivityFileParser.parse_table_header(header_line)
    if not columns:
        return None

    # "!#" contributes a "#" column. When the header goes on to name the region
    # column itself ("!# Region Rho ..."), that "#" is a marker rather than a
    # column and the data rows are one token shorter than the header.
    if (
        len(columns) > 1
        and _normalize(columns[0]) == "#"
        and _normalize(columns[1]) in _REGION_HEADERS
    ):
        columns = columns[1:]

    lowers: Dict[str, int] = {}
    uppers: Dict[str, int] = {}
    region_index = None
    for index, column in enumerate(columns):
        normalized = _normalize(column)
        if region_index is None and normalized in _REGION_HEADERS:
            region_index = index
            continue
        kind, _, qualifier = normalized.partition(" ")
        if kind == "lower":
            lowers[qualifier] = index
        elif kind == "upper":
            uppers[qualifier] = index

    pairs = {
        qualifier: (lowers[qualifier], uppers[qualifier])
        for qualifier in lowers
        if qualifier in uppers
    }
    if component is not None:
        pairs = {
            qualifier: indices
            for qualifier, indices in pairs.items()
            if qualifier == component
        }
    if not pairs:
        return None

    return _BoundColumns(region_index=region_index or 0, pairs=pairs)


def _format_bound(value: float) -> str:
    return f"{value:.4E}"


def _split_line_ending(line: str) -> Tuple[str, str]:
    match = _LINE_ENDING_PATTERN.search(line)
    if not match:
        return line, ""
    return line[: match.start()], match.group(1)


def _replace_row_bounds(
    line: str,
    columns: _BoundColumns,
    region_ids: set,
    parameters: RhoBoundParameters,
) -> Tuple[str, bool]:
    """Rewrite one data row's bound columns, in place.

    Tokens are spliced back over their own character spans rather than joined
    with single spaces: a real file has tens of thousands of rows and only some
    of them are selected, so re-flowing the ones that change would leave a file
    whose columns line up in places and not in others.
    """
    body, line_ending = _split_line_ending(line)
    matches = list(_TOKEN_PATTERN.finditer(body))
    if len(matches) <= columns.region_index:
        return line, False

    try:
        region_id = int(float(matches[columns.region_index].group()))
    except (TypeError, ValueError):
        return line, False
    if region_id not in region_ids:
        return line, False

    replacements: List[Tuple[int, int, str]] = []
    for lower_index, upper_index in columns.pairs.values():
        if max(lower_index, upper_index) >= len(matches):
            continue
        for index, value in (
            (lower_index, parameters.lower),
            (upper_index, parameters.upper),
        ):
            match = matches[index]
            text = _format_bound(value)
            # Keep the column width where the new value fits it, so a table
            # stays a table.
            width = match.end() - match.start()
            replacements.append((match.start(), match.end(), text.rjust(width)))

    if not replacements:
        return line, False

    updated = body
    for start, end, text in sorted(replacements, reverse=True):
        updated = updated[:start] + text + updated[end:]
    return updated + line_ending, True


def build_bounded_resistivity_text(
    source_text: str,
    region_ids: Sequence[int],
    parameters: RhoBoundParameters,
) -> Tuple[str, Dict[str, Any]]:
    """Return .resistivity text with the selected regions' bounds rewritten.

    Args:
        source_text: The whole source ``.resistivity`` file.
        region_ids: Region numbers to bound, as :func:`select_regions` returns.
        parameters: Validated parameters; the bound values and the component.

    Returns:
        ``(text, stats)`` where stats reports the rows and columns written.

    Raises:
        RhoBoundError: If the file has no bound columns to write, or none of
            the selected regions appear in it.
    """
    wanted = {int(region_id) for region_id in region_ids}
    if not wanted:
        raise RhoBoundError("No regions were selected, so there is nothing to bound.")

    output_lines: List[str] = []
    columns: Optional[_BoundColumns] = None
    saw_table = False
    updated_rows = 0

    for line in source_text.splitlines(keepends=True):
        if line.strip().startswith("!#"):
            saw_table = True
            # A header that carries no bound columns leaves an earlier one
            # standing rather than clearing it: losing the layout to an
            # unrelated "!#" line would silently write nothing.
            detected = _detect_bound_columns(line, parameters.component)
            if detected is not None:
                columns = detected
            output_lines.append(line)
            continue

        if columns is not None:
            updated_line, was_updated = _replace_row_bounds(
                line, columns, wanted, parameters
            )
            if was_updated:
                updated_rows += 1
            output_lines.append(updated_line)
        else:
            output_lines.append(line)

    if not saw_table:
        raise RhoBoundError("Could not find a region table header in the .resistivity file.")
    if columns is None:
        detail = (
            f" for component {parameters.component!r}" if parameters.component else ""
        )
        raise RhoBoundError(
            f"The .resistivity file has no Lower/Upper bound columns{detail}."
        )
    if updated_rows == 0:
        raise RhoBoundError(
            "None of the selected regions appear in the .resistivity file. "
            "Check that the .poly and .resistivity come from the same model."
        )

    return "".join(output_lines), {
        "updatedRowCount": updated_rows,
        "boundColumns": [
            name
            for qualifier in columns.names
            for name in (f"Lower {qualifier}".strip(), f"Upper {qualifier}".strip())
        ],
        "lower": parameters.lower,
        "upper": parameters.upper,
    }
