"""Carry region parameters from a source MARE2DEM model onto a derived one.

Whenever a ``.poly`` is rebuilt -- merged with a second model, cut by a new
segment line, resegmented -- the region list is regenerated from scratch and the
matching ``.resistivity`` has to be regenerated with it. Emitting a flat uniform
model is the easy answer and the wrong one, because it discards the single thing
that must survive: which regions are **fixed**.

Every real MARE2DEM model has exactly two fixed regions, air (about 1e13 ohm-m)
and seawater (about 0.3 ohm-m), both carrying ``Param = 0``. Turning them into
free parameters hands the inversion two regions it must never touch, and nothing
in the file format or in MARE2DEM will complain -- the run just produces
nonsense.

This module maps each region of the derived model back to the source region that
contains its seed point, copies that region's row wholesale, and renumbers the
free parameters. Regions with no source match -- genuinely new ground -- fall
back to a caller-supplied default.

Two details of the ``.resistivity`` format that the renumbering has to respect:

- Free parameter indices are a single global sequence, and on anisotropic models
  that sequence is interleaved across the parameter columns: the first region
  takes ``Param z = 1, Param h = 2``, the next free one takes 3 and 4, and so on.
  The numbering is therefore row-major over (region, column), not column-by-column.
- A fixed region consumes no index at all; it writes 0 in every parameter column
  and the sequence continues past it.
"""

from dataclasses import dataclass
from typing import Any, List, Mapping, Optional, Sequence

import numpy as np
import pandas as pd

from MARE2DEM_poly_parser import MARE2DEMPolyParser

from triangle_point_location import TriangleLocator


class RegionInheritanceError(ValueError):
    """Raised when region parameters cannot be carried across."""


#: Column-name prefixes used to recognise the parts of a resistivity table.
_PARAMETER_PREFIX = "param"
_RHO_PREFIX = "rho"
_REGION_HEADERS = {"#", "region", "!#"}


@dataclass(frozen=True)
class RegionInheritanceStats:
    """What the inheritance pass did, for logging and for the API response."""

    target_regions: int
    inherited: int
    unmatched: int
    fixed_regions: int
    free_parameters: int


def _normalize(column: Any) -> str:
    return str(column).strip().lower()


def find_parameter_columns(columns: Sequence[Any]) -> List[str]:
    """Parameter-index columns of a resistivity table, in file order.

    Args:
        columns: Column labels, e.g. from ``DataFrame.columns``.

    Returns:
        The labels whose name starts with "Param" -- ``["Param"]`` for an
        isotropic table, ``["Param z", "Param h"]`` for an anisotropic one.
    """
    return [column for column in columns if _normalize(column).startswith(_PARAMETER_PREFIX)]


def find_rho_columns(columns: Sequence[Any]) -> List[str]:
    """Resistivity-value columns of a resistivity table, in file order."""
    return [column for column in columns if _normalize(column).startswith(_RHO_PREFIX)]


def find_region_column(columns: Sequence[Any]) -> Optional[Any]:
    """The column holding the 1-based region number, if the table names one."""
    for column in columns:
        if _normalize(column) in _REGION_HEADERS:
            return column
    return None


def map_regions_to_source(
    source_vertices: Mapping[int, Mapping[str, Any]],
    source_segments: Sequence[Mapping[str, Any]],
    source_regions: Sequence[Mapping[str, Any]],
    target_regions: Sequence[Mapping[str, Any]],
) -> List[Optional[int]]:
    """Locate each derived region inside the source model.

    The derived model's regions are identified by their seed points, so the
    question "where did this region come from" is answered by asking which region
    of the *source* model contains that seed point. Splitting a source region --
    which is exactly what adding a cut line does -- therefore gives every piece
    the same answer, and each piece inherits the source region's row.

    Args:
        source_vertices: Vertices of the source ``.poly``, keyed by vertex id.
        source_segments: Segments of the source ``.poly``.
        source_regions: Regions of the source ``.poly``, in file order.
        target_regions: Regions of the derived ``.poly``, in file order.

    Returns:
        One entry per target region: the 0-based index into ``source_regions``
        whose area contains that region's seed point, or ``None`` when the seed
        falls outside every source region.

    Raises:
        RegionInheritanceError: If the source model has no regions to
            inherit from.
    """
    if not source_regions:
        raise RegionInheritanceError("The source model has no regions to inherit from.")
    if not target_regions:
        return []

    parser = MARE2DEMPolyParser()
    parser.create_constrained_delaunay(source_vertices, source_segments)
    tri_output = parser.tri_output

    # triangle_labels[i] is the 1-based region number of triangle i (0 = unreached);
    # region_index maps a region number back to its index in source_regions.
    triangle_labels, region_index = parser.get_triangle_regions(list(source_regions))

    vertices = tri_output["vertices"]
    trifinder = TriangleLocator(
        vertices[:, 0], vertices[:, 1], tri_output["triangles"]
    )

    seed_y = np.array([region["hCoor"] for region in target_regions], dtype=float)
    seed_z = np.array([region["vCoor"] for region in target_regions], dtype=float)
    containing_triangles = trifinder(seed_y, seed_z)

    mapping: List[Optional[int]] = []
    for triangle in np.atleast_1d(containing_triangles):
        triangle = int(triangle)
        if triangle < 0:
            # Seed point is outside the source mesh entirely.
            mapping.append(None)
            continue
        label = int(triangle_labels[triangle])
        if label <= 0 or label > len(region_index):
            # Triangle the flood fill never reached, e.g. inside a hole.
            mapping.append(None)
            continue
        mapping.append(int(region_index[label - 1]))

    return mapping


def renumber_free_parameters(table: pd.DataFrame) -> pd.DataFrame:
    """Rewrite the parameter columns as one contiguous global sequence.

    Fixed regions (0 in every parameter column) stay 0 and consume no index. Free
    entries are numbered 1, 2, 3, ... row-major over (region, parameter column),
    which is the interleaving MARE2DEM and Mamba2D write for anisotropic models.

    Args:
        table: Resistivity table; not modified.

    Returns:
        A copy with the parameter columns renumbered.
    """
    parameter_columns = find_parameter_columns(table.columns)
    result = table.copy()
    if not parameter_columns or result.empty:
        return result

    values = result[parameter_columns].to_numpy(dtype=float)
    is_free = values != 0
    # Row-major cumulative count: each free cell takes the next index in sequence.
    flat_free = is_free.reshape(-1)
    sequence = np.cumsum(flat_free)
    renumbered = np.where(flat_free, sequence, 0).reshape(values.shape)

    for column_position, column in enumerate(parameter_columns):
        result[column] = renumbered[:, column_position].astype(int)

    return result


def _build_default_row(
    source_table: pd.DataFrame,
    default_rho: float,
) -> "pd.Series[Any]":
    """A row for a derived region that matched nothing in the source model."""
    row = pd.Series(0, index=source_table.columns, dtype=object)
    for column in find_rho_columns(source_table.columns):
        row[column] = default_rho
    for column in find_parameter_columns(source_table.columns):
        # Marked free; renumber_free_parameters assigns the real index.
        row[column] = 1
    return row


def build_inherited_table(
    source_table: pd.DataFrame,
    region_mapping: Sequence[Optional[int]],
    default_rho: float = 1.0,
) -> tuple[pd.DataFrame, RegionInheritanceStats]:
    """Build the derived model's resistivity table from the source model's.

    Each derived region takes the whole source row -- resistivity, bounds,
    prejudice, weight, and crucially whether the region is fixed. Parameter
    indices are then renumbered so the result is a valid contiguous sequence.

    A source region that split into several derived regions yields several
    independent free parameters rather than one shared index. That is deliberate:
    a penalty cut exists so the two sides can differ, and regions bound to the
    same parameter are the same unknown and cannot.

    Args:
        source_table: Parsed table of the source ``.resistivity``.
        region_mapping: Output of :func:`map_regions_to_source`.
        default_rho: Resistivity for derived regions that matched no source
            region. Those regions are free parameters.

    Returns:
        The derived table and a :class:`RegionInheritanceStats`.

    Raises:
        RegionInheritanceError: If the source table is missing or has no rows,
            or a mapping entry points outside it.
    """
    if source_table is None or source_table.empty:
        raise RegionInheritanceError(
            "The source resistivity file has no region table to inherit from."
        )

    rows: List["pd.Series[Any]"] = []
    inherited = 0
    for source_index in region_mapping:
        if source_index is None:
            rows.append(_build_default_row(source_table, default_rho))
            continue
        if not 0 <= source_index < len(source_table):
            raise RegionInheritanceError(
                f"Region mapping points at source region {source_index}, but the "
                f"source table has {len(source_table)} rows."
            )
        rows.append(source_table.iloc[source_index].copy())
        inherited += 1

    if rows:
        table = pd.DataFrame(rows).reset_index(drop=True)
    else:
        table = source_table.iloc[0:0].copy()

    region_column = find_region_column(table.columns)
    if region_column is not None:
        table[region_column] = np.arange(1, len(table) + 1)

    table = renumber_free_parameters(table)

    parameter_columns = find_parameter_columns(table.columns)
    if parameter_columns and not table.empty:
        parameter_values = table[parameter_columns].to_numpy(dtype=float)
        fixed_regions = int((parameter_values == 0).all(axis=1).sum())
        free_parameters = int((parameter_values != 0).sum())
    else:
        fixed_regions = 0
        free_parameters = 0

    stats = RegionInheritanceStats(
        target_regions=len(table),
        inherited=inherited,
        unmatched=len(table) - inherited,
        fixed_regions=fixed_regions,
        free_parameters=free_parameters,
    )
    return table, stats


#: Header keys whose value describes the *source* inversion run and would be a
#: lie on a model with a different region list.
_STALE_HEADER_KEYS = {"model roughness", "model misfit"}

#: Fallback column for a header value when a file offers no example to measure.
_DEFAULT_VALUE_COLUMN = 32


def _header_key(line: str) -> Optional[str]:
    """The ``Key`` of a ``Key: value ! comment`` header line, lowercased."""
    data = line.split("!", 1)[0]
    colon = data.find(":")
    if colon == -1:
        return None
    return data[:colon].strip().lower()


def _detect_value_column(lines: Sequence[str]) -> int:
    """The column a header value starts in, measured from the file itself.

    Two layouts turn up in real files and they differ by one column. MARE2DEM's
    own writer emits ``" Format:                         MARE2DEM_1.1"`` -- a
    leading space, no trailing comment. Mamba2D emits
    ``"Format:                         mare2dem_1.1                     ! input"``
    -- no leading space, with a comment. Assuming either one shifts the other's
    columns, so the layout is measured rather than assumed.
    """
    for line in lines:
        data = line.split("!", 1)[0]
        colon = data.find(":")
        if colon == -1:
            continue
        rest = data[colon + 1 :]
        value = rest.lstrip(" ")
        if value:
            return colon + 1 + (len(rest) - len(value))
    return _DEFAULT_VALUE_COLUMN


def _replace_header_value(line: str, new_value: str, value_column: int) -> str:
    """Swap a header line's value, keeping its key, comment and column layout."""
    bang = line.find("!")
    comment = line[bang:] if bang != -1 else ""
    data = line[:bang] if bang != -1 else line
    key = data[: data.find(":") + 1]

    key_field = key.ljust(value_column)
    # Reproduce the original value field width so the comment stays put.
    value_width = max(len(data) - value_column, 1)
    if len(new_value) >= value_width:
        return (key_field + new_value + (f" {comment}" if comment else "")).rstrip() + (
            " " if comment else ""
        )
    return key_field + f"{new_value:<{value_width}}" + comment


def _is_table_row(line: str) -> bool:
    stripped = line.strip()
    return bool(stripped) and stripped[0].isdigit()


def _format_table_row(row: "pd.Series[Any]", columns: Sequence[Any]) -> str:
    """One region line, in the format MARE2DEM's own writer emits.

    ``mare2dem_io.f90:1047`` builds ``(i8,1x, es12.4,1x ..., i8,1x ..., es12.4,1x ...)``:
    integers for the region number and the parameter indices, ``es12.4`` for
    every physical value. MARE2DEM reads the table with a list-directed
    ``read(10,*)`` (``mare2dem_io.f90:617``), so the widths are for humans -- but
    matching the reference writer keeps diffs against MARE2DEM output clean.
    """
    region_column = find_region_column(columns)
    integer_columns = set(find_parameter_columns(columns))
    if region_column is not None:
        integer_columns.add(region_column)

    pieces = []
    for column in columns:
        value = row[column]
        if column in integer_columns:
            pieces.append(f"{int(round(float(value))):8d}")
        else:
            pieces.append(f"{float(value):12.4E}")
    return " ".join(pieces)


def build_derived_resistivity_text(
    source_text: str,
    table: pd.DataFrame,
    model_file: str,
    timestamp: Optional[str] = None,
) -> str:
    """Render a ``.resistivity`` for a derived model, reusing the source's header.

    Every header line is carried across untouched -- ``Data File``,
    ``Global Bounds``, ``Roughness Weights``, ``Penalty Cut Weight``, the lot --
    because those are the run's settings and they did not change just because the
    mesh did. Regenerating the header from defaults instead is how a model
    silently loses its data file and its bounds.

    Four keys are not carried across verbatim:

    - ``Model File`` becomes the derived ``.poly``.
    - ``Number of regions`` becomes the derived count.
    - ``Model Roughness`` and ``Model Misfit`` are blanked. They describe the
      source inversion and are meaningless -- worse, misleading -- against a
      different region list.
    - ``Date/Time`` is left alone unless ``timestamp`` is given, so the output is
      deterministic by default and testable.

    Args:
        source_text: Full text of the source ``.resistivity``.
        table: Derived region table, e.g. from :func:`build_inherited_table`.
        model_file: Value for the ``Model File`` header.
        timestamp: Replacement ``Date/Time`` value, or ``None`` to keep the
            source's.

    Returns:
        The complete text of the derived ``.resistivity``.

    Raises:
        RegionInheritanceError: If the source text has no ``!#`` table header.
    """
    lines = source_text.splitlines()
    columns = list(table.columns)
    value_column = _detect_value_column(lines)

    output: List[str] = []
    seen_table_header = False

    for line in lines:
        if line.strip().startswith("!#"):
            # The column header: keep it verbatim, then emit our own rows.
            output.append(line)
            seen_table_header = True
            for _, row in table.iterrows():
                output.append(_format_table_row(row, columns))
            continue

        if seen_table_header and _is_table_row(line):
            # Source region rows are replaced wholesale, not edited.
            continue

        key = _header_key(line)
        if key == "model file":
            output.append(_replace_header_value(line, model_file, value_column))
        elif key == "number of regions":
            output.append(_replace_header_value(line, str(len(table)), value_column))
        elif key in _STALE_HEADER_KEYS:
            output.append(_replace_header_value(line, "", value_column))
        elif key == "date/time" and timestamp is not None:
            output.append(_replace_header_value(line, timestamp, value_column))
        else:
            output.append(line)

    if not seen_table_header:
        raise RegionInheritanceError(
            "The source resistivity file has no '!#' table header, so the region "
            "table cannot be replaced."
        )

    return "\n".join(output) + "\n"
