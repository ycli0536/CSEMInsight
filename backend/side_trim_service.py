"""Clear one side of a model along a boundary, collapsing it to empty regions.

The boundary here is a *selector*, not geometry: it never becomes segments.
Regions are picked by which side of the line their seed point falls on (the
same rule rho bounds uses), and the deletion follows a topological rule from
there -- a segment survives iff it borders at least one kept region or lies on
the outer hull, a vertex survives iff a kept segment uses it. The interface
between kept and deleted regions therefore stays exactly where the model put
it, which is the point: the seafloor's own segments are the trim line, and the
uploaded bathymetry only has to land near enough to sort the seed points.

Everything the cleared side loses is replaced by one region per connected
component, seeded from one of the regions it swallowed, carrying a
caller-chosen default resistivity as a free or fixed parameter.
"""

import math
import os
import tempfile
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple

import pandas as pd

from MARE2DEM_poly_parser import MARE2DEMPolyParser
from penalty_cut_service import (
    UNIT_SCALE,
    PenaltyCutError,
    check_interface_against_model,
    parse_interface_text,
    render_poly_text,
)
from poly_region_inheritance import (
    RegionInheritanceError,
    RegionInheritanceStats,
    build_derived_resistivity_text,
    build_inherited_table,
    find_parameter_columns,
    find_region_column,
    renumber_free_parameters,
)
from rho_bound_service import (
    SIDES,
    RhoBoundError,
    RhoBoundParameters,
    extend_boundary_points,
    region_number,
    select_regions,
)

from triangle_point_location import TriangleLocator


class SideTrimError(ValueError):
    """Raised when a side of the model cannot be cleared."""


RHO_MODES = ("free", "fixed")


@dataclass(frozen=True)
class SideTrimParameters:
    """Everything the caller gets to choose."""

    units: str = "km"
    side: str = "below"
    extend_to_bounds: bool = True
    default_rho: float = 100.0
    rho_mode: str = "free"


def parse_side_trim_parameters(payload: Mapping[str, Any]) -> SideTrimParameters:
    """Validate a parameters object from the request body.

    Args:
        payload: Decoded JSON, e.g. ``{"side": "below", "defaultRho": 100}``.

    Returns:
        The validated parameters.

    Raises:
        SideTrimError: On an unknown unit, side or rho mode, a non-boolean
            extend flag, or a non-positive default resistivity.
    """
    if not isinstance(payload, Mapping):
        raise SideTrimError("Side trim parameters must be a JSON object")

    units = str(payload.get("units", "km")).lower()
    if units not in UNIT_SCALE:
        raise SideTrimError(
            f"Unknown boundary units {units!r}; expected one of "
            f"{', '.join(sorted(UNIT_SCALE))}."
        )

    side = str(payload.get("side", "below")).lower()
    if side not in SIDES:
        raise SideTrimError(
            f"Unknown side {side!r}; expected one of {', '.join(SIDES)}."
        )

    extend = payload.get("extendToBounds", True)
    if not isinstance(extend, bool):
        raise SideTrimError("extendToBounds must be true or false")

    try:
        default_rho = float(payload.get("defaultRho", 100.0))
    except (TypeError, ValueError) as exc:
        raise SideTrimError("Default resistivity must be a number") from exc
    if not math.isfinite(default_rho) or default_rho <= 0:
        raise SideTrimError(
            f"Default resistivity must be a positive number; got {default_rho}."
        )

    rho_mode = str(payload.get("rhoMode", "free")).lower()
    if rho_mode not in RHO_MODES:
        raise SideTrimError(
            f"Unknown rhoMode {rho_mode!r}; expected one of {', '.join(RHO_MODES)}."
        )

    return SideTrimParameters(
        units=units,
        side=side,
        extend_to_bounds=extend,
        default_rho=default_rho,
        rho_mode=rho_mode,
    )


def parse_boundary_text(
    text: str, parameters: SideTrimParameters
) -> List[Tuple[float, float]]:
    """Read the boundary from a two-column ``y z`` file, in metres.

    Shares the penalty cut's parser, deliberately -- same format, and a second
    reader is a reader that can disagree about where the line lands.

    Raises:
        SideTrimError: On an unreadable line or fewer than two points.
    """
    try:
        return parse_interface_text(text, parameters.units)
    except PenaltyCutError as exc:
        raise SideTrimError(str(exc)) from exc


@dataclass(frozen=True)
class SideTrimPlan:
    """What a trim would remove and the model it would leave behind."""

    removed_region_ids: List[int]
    component_count: int
    #: Source region numbers of the kept regions, in file order -- the direct
    #: mapping into the source .resistivity table.
    kept_source_numbers: List[int]
    new_region_count: int
    vertices: Dict[int, Dict[str, Any]]
    segments: List[Dict[str, Any]]
    holes: List[Dict[str, Any]]
    regions: List[Dict[str, Any]]
    removed_segment_count: int
    removed_vertex_count: int
    removed_hole_count: int
    outside_span_count: int
    #: The boundary as used for selection, extension included, in metres.
    boundary_points: List[Tuple[float, float]]
    #: Hull edge count of the source CDT, for the apply-time invariant check.
    hull_edge_count: int
    warnings: List[str]


def _selector_parameters(parameters: SideTrimParameters) -> RhoBoundParameters:
    return RhoBoundParameters(shape="boundary", side=parameters.side)


def _hull_edge_count(triangles) -> int:
    """Edges belonging to exactly one triangle -- the outer boundary."""
    counts: Dict[Tuple[int, int], int] = {}
    for tri in triangles:
        for a, b in ((0, 1), (1, 2), (2, 0)):
            edge = (min(int(tri[a]), int(tri[b])), max(int(tri[a]), int(tri[b])))
            counts[edge] = counts.get(edge, 0) + 1
    return sum(1 for count in counts.values() if count == 1)


def _components(deleted_labels: Set[int], links: Sequence[Tuple[int, int]]) -> List[Set[int]]:
    """Connected components of the deleted regions, joined by removed segments."""
    parent = {label: label for label in deleted_labels}

    def find(label: int) -> int:
        while parent[label] != label:
            parent[label] = parent[parent[label]]
            label = parent[label]
        return label

    for a, b in links:
        parent[find(a)] = find(b)

    groups: Dict[int, Set[int]] = {}
    for label in deleted_labels:
        groups.setdefault(find(label), set()).add(label)
    return list(groups.values())


def plan_side_trim(
    vertices: Mapping[int, Mapping[str, Any]],
    segments: Sequence[Mapping[str, Any]],
    holes: Sequence[Mapping[str, Any]],
    regions: Optional[Sequence[Mapping[str, Any]]],
    points: Sequence[Tuple[float, float]],
    parameters: SideTrimParameters,
) -> SideTrimPlan:
    """Work out what clearing one side removes, and the model left behind.

    Args:
        vertices, segments, holes, regions: The parsed source ``.poly``, in
            metres.
        points: Boundary points in metres, e.g. from :func:`parse_boundary_text`.
        parameters: Validated parameters.

    Returns:
        The complete plan; geometry only, no resistivity.

    Raises:
        SideTrimError: If the model has no regions, the boundary selects
            nothing, or it selects everything.
    """
    if not regions:
        raise SideTrimError(
            "The .poly file has no regions, so there is no side to clear. "
            "Region interior points are what identifies a region to MARE2DEM."
        )

    # Unit-mistake warnings run on the raw points: extension spans the model
    # by construction and would hide exactly the mistake they exist to catch.
    warnings = check_interface_against_model(points, vertices)

    ys = [vertex["hCoor"] for vertex in vertices.values()]
    zs = [vertex["vCoor"] for vertex in vertices.values()]
    if parameters.extend_to_bounds:
        points = extend_boundary_points(points, min(ys), max(ys))

    try:
        selection = select_regions(regions, points, _selector_parameters(parameters))
    except RhoBoundError as exc:
        raise SideTrimError(str(exc)) from exc

    deleted_numbers = set(selection.region_ids)
    all_numbers = {region_number(region) for region in regions}
    if not deleted_numbers:
        raise SideTrimError(
            f"The boundary selected no regions on the {parameters.side!r} side. "
            "Check the units, the side, and -- for a boundary shorter than the "
            "model -- the extend-to-bounds option."
        )
    if deleted_numbers >= all_numbers:
        raise SideTrimError(
            "The boundary selects every region; clearing them all would leave "
            "no model. Check which side you meant."
        )

    parser = MARE2DEMPolyParser()
    parser.create_constrained_delaunay(dict(vertices), list(segments))
    tri_output = parser.tri_output
    triangle_labels, region_index = parser.get_triangle_regions(list(regions))
    if len(region_index) != len(regions):
        raise SideTrimError(
            "The source model's region seed points do not each claim their own "
            "area -- a seed is outside the mesh or two seeds share a region. "
            "Fix the source .poly before trimming."
        )

    # Flood-fill label (1-based) -> the region number MARE2DEM knows it by.
    label_number = {
        label: region_number(regions[int(region_index[label - 1])])
        for label in range(1, len(region_index) + 1)
    }
    deleted_labels = {
        label for label, number in label_number.items() if number in deleted_numbers
    }

    mesh_vertices = tri_output["vertices"]
    coord_lookup = {
        (round(float(point[0]), 10), round(float(point[1]), 10)): index
        for index, point in enumerate(mesh_vertices)
    }
    edge_triangles: Dict[Tuple[int, int], List[int]] = {}
    for triangle_index, tri in enumerate(tri_output["triangles"]):
        for a, b in ((0, 1), (1, 2), (2, 0)):
            edge = (min(int(tri[a]), int(tri[b])), max(int(tri[a]), int(tri[b])))
            edge_triangles.setdefault(edge, []).append(triangle_index)

    trifinder = TriangleLocator(
        mesh_vertices[:, 0], mesh_vertices[:, 1], tri_output["triangles"]
    )
    span = max(max(ys) - min(ys), max(zs) - min(zs), 1.0)
    offset = 1e-9 * span

    def incident_labels(segment: Mapping[str, Any]) -> Tuple[List[int], bool]:
        """Flood-fill labels on each side of a segment, and hull membership."""
        v1 = vertices[segment["endpoint_1"]]
        v2 = vertices[segment["endpoint_2"]]
        i1 = coord_lookup.get((round(v1["hCoor"], 10), round(v1["vCoor"], 10)))
        i2 = coord_lookup.get((round(v2["hCoor"], 10), round(v2["vCoor"], 10)))
        if i1 is not None and i2 is not None and i1 != i2:
            incident = edge_triangles.get((min(i1, i2), max(i1, i2)))
            if incident is not None:
                labels = [int(triangle_labels[t]) for t in incident]
                return labels, len(incident) == 1

        # The segment is not a single mesh edge -- a vertex sits on it and
        # Triangle split it. Sample just off its midpoint on both sides.
        mid_y = (v1["hCoor"] + v2["hCoor"]) / 2
        mid_z = (v1["vCoor"] + v2["vCoor"]) / 2
        length = math.hypot(
            v2["hCoor"] - v1["hCoor"], v2["vCoor"] - v1["vCoor"]
        )
        if length == 0:
            return [], False
        normal_y = -(v2["vCoor"] - v1["vCoor"]) / length
        normal_z = (v2["hCoor"] - v1["hCoor"]) / length
        labels, on_hull = [], False
        for sign in (1.0, -1.0):
            triangle = int(
                trifinder(mid_y + sign * offset * normal_y, mid_z + sign * offset * normal_z)
            )
            if triangle < 0:
                on_hull = True
            else:
                labels.append(int(triangle_labels[triangle]))
        return labels, on_hull

    kept_segments: List[Mapping[str, Any]] = []
    removed_segments: List[Mapping[str, Any]] = []
    component_links: List[Tuple[int, int]] = []
    for segment in segments:
        labels, on_hull = incident_labels(segment)
        # Label 0 is a triangle the flood fill never reached -- a hole's
        # interior -- which keeps nothing on its own.
        keeps = on_hull or any(
            label != 0 and label not in deleted_labels for label in labels
        )
        if keeps:
            kept_segments.append(segment)
            continue
        removed_segments.append(segment)
        deleted_sides = [label for label in labels if label in deleted_labels]
        if len(deleted_sides) == 2:
            component_links.append((deleted_sides[0], deleted_sides[1]))

    kept_vertex_ids = {
        endpoint
        for segment in kept_segments
        for endpoint in (segment["endpoint_1"], segment["endpoint_2"])
    }
    attached = {
        endpoint
        for segment in segments
        for endpoint in (segment["endpoint_1"], segment["endpoint_2"])
    }
    for vertex_id, vertex in vertices.items():
        if vertex_id in attached:
            continue
        # A floating vertex forces a mesh node; on the cleared side that is
        # exactly the structure being removed. A vertex exactly ON the
        # kept/deleted interface classifies arbitrarily (deterministic per
        # run), and one exactly on the hull on the cleared side would be
        # removed and tripped by the hull invariant -- both contrived,
        # documented rather than handled.
        triangle = int(trifinder(vertex["hCoor"], vertex["vCoor"]))
        label = int(triangle_labels[triangle]) if triangle >= 0 else 0
        if label not in deleted_labels:
            kept_vertex_ids.add(vertex_id)

    kept_holes = list(holes)
    if holes:
        # A hole is classified the same way a region is: by which side of the
        # boundary its seed point falls on.
        pseudo_regions = [
            {"id": hole["id"], "hCoor": hole["hCoor"], "vCoor": hole["vCoor"]}
            for hole in holes
        ]
        hole_selection = select_regions(
            pseudo_regions, points, _selector_parameters(parameters)
        )
        removed_hole_ids = set(hole_selection.region_ids)
        kept_holes = [hole for hole in holes if hole["id"] not in removed_hole_ids]

    components = _components(deleted_labels, component_links)

    vertex_map = {
        old_id: new_id
        for new_id, old_id in enumerate(sorted(kept_vertex_ids), start=1)
    }
    new_vertices = {
        vertex_map[old_id]: dict(vertices[old_id]) for old_id in sorted(kept_vertex_ids)
    }
    new_segments = [
        {
            "id": index,
            "endpoint_1": vertex_map[segment["endpoint_1"]],
            "endpoint_2": vertex_map[segment["endpoint_2"]],
            "boundary_marker": segment.get("boundary_marker"),
        }
        for index, segment in enumerate(kept_segments, start=1)
    ]
    new_holes = [
        {"id": index, "hCoor": hole["hCoor"], "vCoor": hole["vCoor"]}
        for index, hole in enumerate(kept_holes, start=1)
    ]

    kept_regions = [
        region for region in regions if region_number(region) not in deleted_numbers
    ]
    kept_source_numbers = [region_number(region) for region in kept_regions]
    new_regions = [
        {
            "id": index,
            "hCoor": region["hCoor"],
            "vCoor": region["vCoor"],
            "attribute": index,
            "max_area": -1,
        }
        for index, region in enumerate(kept_regions, start=1)
    ]
    region_by_number = {region_number(region): region for region in regions}
    # Deterministic order: each component is named by its lowest region
    # number, and its seed is that region's -- a point guaranteed to sit
    # inside the merged cavity, because the cavity contains every region it
    # swallowed.
    ordered_components = sorted(
        components, key=lambda labels: min(label_number[label] for label in labels)
    )
    for component_offset, labels in enumerate(ordered_components):
        seed = region_by_number[min(label_number[label] for label in labels)]
        index = len(kept_regions) + component_offset + 1
        new_regions.append(
            {
                "id": index,
                "hCoor": seed["hCoor"],
                "vCoor": seed["vCoor"],
                "attribute": index,
                "max_area": -1,
            }
        )

    removed_cuts = sum(
        1 for segment in removed_segments if (segment.get("boundary_marker") or 0) < 0
    )
    if removed_cuts:
        warnings.append(
            f"Removed {removed_cuts} penalty cut segments that sat on the "
            "cleared side."
        )
    if len(components) > 1:
        warnings.append(
            f"The cleared side is {len(components)} disconnected areas; each "
            "becomes its own region with the same default resistivity."
        )
    if selection.outside_span_count and not parameters.extend_to_bounds:
        warnings.append(
            f"{selection.outside_span_count} of {selection.total_count} regions "
            "sit beyond the ends of the boundary and were left alone. Enable "
            "extend-to-bounds to carry the end depths to the model's edges."
        )

    return SideTrimPlan(
        removed_region_ids=sorted(deleted_numbers),
        component_count=len(components),
        kept_source_numbers=kept_source_numbers,
        new_region_count=len(components),
        vertices=new_vertices,
        segments=new_segments,
        holes=new_holes,
        regions=new_regions,
        removed_segment_count=len(removed_segments),
        removed_vertex_count=len(vertices) - len(kept_vertex_ids),
        removed_hole_count=len(holes) - len(kept_holes),
        outside_span_count=selection.outside_span_count,
        boundary_points=[(y, z) for y, z in points],
        hull_edge_count=_hull_edge_count(tri_output["triangles"]),
        warnings=warnings,
    )


def _find_columns(columns: Sequence[Any], prefix: str) -> List[Any]:
    return [
        column
        for column in columns
        if str(column).strip().lower().startswith(prefix)
    ]


def _source_row_lookup(source_table: pd.DataFrame) -> Dict[int, int]:
    """Region number -> row position in the source table.

    The .resistivity parser tolerates ragged rows by filling with NaN, so a
    region cell may not read as a number. Such a row can never be selected;
    skipping it turns the eventual failure into the actionable "no row"
    error instead of a crash here.
    """
    region_column = find_region_column(source_table.columns)
    if region_column is None:
        return {number: number - 1 for number in range(1, len(source_table) + 1)}
    numbers = pd.to_numeric(source_table[region_column], errors="coerce")
    return {
        int(value): position
        for position, value in enumerate(numbers)
        if math.isfinite(value)
    }


def _default_row_bounds(
    source_table: pd.DataFrame, kept_row_positions: Sequence[int]
) -> Dict[Any, float]:
    """Lower/Upper values for the new rows: the mode of the deleted free rows.

    The cleared side inherits the bounds discipline of the ground it replaced.
    With no deleted free row to copy, the whole file's free rows stand in; with
    none at all the columns stay 0, which MARE2DEM reads as "use Global
    Bounds" -- a legal starting point, not an error.
    """
    parameter_columns = find_parameter_columns(source_table.columns)
    bound_columns = _find_columns(source_table.columns, "lower") + _find_columns(
        source_table.columns, "upper"
    )
    if not parameter_columns or not bound_columns:
        return {}

    # A Param cell that does not read as a number is treated as NOT free: a
    # fixed or unreadable row must not donate bounds.
    parameter_values = source_table[parameter_columns].apply(
        pd.to_numeric, errors="coerce"
    )
    free_mask = (parameter_values.fillna(0) != 0).any(axis=1)
    kept = set(kept_row_positions)
    deleted_free = [
        position
        for position in range(len(source_table))
        if position not in kept and free_mask.iloc[position]
    ]
    candidates = deleted_free or [
        position for position in range(len(source_table)) if free_mask.iloc[position]
    ]
    if not candidates:
        return {}

    rows = source_table.iloc[candidates]
    bounds: Dict[Any, float] = {}
    for column in bound_columns:
        values = pd.to_numeric(rows[column], errors="coerce").dropna()
        modes = values.mode()
        if modes.empty:
            # An all-NaN column donates nothing; the new rows stay at 0,
            # which MARE2DEM reads as "use Global Bounds".
            continue
        bounds[column] = float(modes.iloc[0])
    return bounds


def build_trimmed_resistivity(
    source_table: pd.DataFrame,
    source_text: str,
    plan: SideTrimPlan,
    parameters: SideTrimParameters,
    output_poly_name: str,
):
    """Build the trimmed model's .resistivity from the source's.

    Kept regions take their source rows wholesale -- rho, bounds, prejudice,
    weight and, crucially, whether they are fixed. The mapping is direct: a
    kept region *is* a source region, so its row is found by number rather
    than by locating seed points geometrically. New regions get the caller's
    default rho, free or fixed.

    Returns:
        ``(text, table, stats)`` -- the file text, the derived table, and the
        :class:`poly_region_inheritance.RegionInheritanceStats`.

    Raises:
        SideTrimError: If a kept region has no row in the source table, or the
            source file cannot be re-rendered.
    """
    try:
        lookup = _source_row_lookup(source_table)
        mapping: List[Optional[int]] = []
        for number in plan.kept_source_numbers:
            if number not in lookup:
                raise SideTrimError(
                    f"Region {number} has no row in the .resistivity file. Check "
                    "that the .poly and .resistivity come from the same model."
                )
            mapping.append(lookup[number])
        kept_row_positions = list(mapping)
        mapping.extend([None] * plan.new_region_count)

        try:
            table, stats = build_inherited_table(
                source_table, mapping, default_rho=parameters.default_rho
            )
        except RegionInheritanceError as exc:
            raise SideTrimError(str(exc)) from exc

        new_rows = range(len(plan.kept_source_numbers), len(table))
        if parameters.rho_mode == "fixed":
            for column in find_parameter_columns(table.columns):
                for row in new_rows:
                    table.loc[row, column] = 0
            table = renumber_free_parameters(table)
        else:
            bounds = _default_row_bounds(source_table, kept_row_positions)
            for column, value in bounds.items():
                for row in new_rows:
                    table.loc[row, column] = value

        parameter_columns = find_parameter_columns(table.columns)
        if parameter_columns and not table.empty:
            values = table[parameter_columns].astype(float)
            stats = RegionInheritanceStats(
                target_regions=len(table),
                inherited=stats.inherited,
                unmatched=stats.unmatched,
                fixed_regions=int((values == 0).all(axis=1).sum()),
                free_parameters=int((values != 0).to_numpy().sum()),
            )

        try:
            text = build_derived_resistivity_text(
                source_text, table, model_file=os.path.basename(output_poly_name)
            )
        except RegionInheritanceError as exc:
            raise SideTrimError(str(exc)) from exc
    except SideTrimError:
        raise
    except (ValueError, KeyError, IndexError) as exc:
        # The .resistivity parser tolerates rows this module cannot use --
        # text where numbers belong, ragged lines -- and pandas reports those
        # in its own vocabulary. The caller gets one actionable message.
        raise SideTrimError(
            "The .resistivity table could not be read as numbers. Check the "
            "file for malformed rows."
        ) from exc

    return text, table, stats


def plan_stats(plan: SideTrimPlan, total_region_count: int) -> Dict[str, Any]:
    """The stats block shared by the preview and apply responses."""
    return {
        "removedRegionCount": len(plan.removed_region_ids),
        "totalRegionCount": total_region_count,
        "componentCount": plan.component_count,
        "removedSegmentCount": plan.removed_segment_count,
        "removedVertexCount": plan.removed_vertex_count,
        "removedHoleCount": plan.removed_hole_count,
        "outsideSpanCount": plan.outside_span_count,
        "boundaryPointCount": len(plan.boundary_points),
    }


def _validate_round_trip(poly_text: str, plan: SideTrimPlan) -> None:
    """Re-parse and re-triangulate the generated .poly before handing it out.

    A formatting or bookkeeping bug should surface here, in the viewer, and
    not in an inversion run. Two invariants: every region seed claims its own
    flood-fill area, and the outer hull has exactly as many edges as the
    source model's -- the trim must never breach the outer boundary.
    """
    parser = MARE2DEMPolyParser()
    with tempfile.TemporaryDirectory() as temp_dir:
        path = os.path.join(temp_dir, "trimmed.poly")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(poly_text)
        vertices, segments, _, regions = parser.read_poly_file(
            path, unit_scale_factor=1
        )

    check_parser = MARE2DEMPolyParser()
    check_parser.create_constrained_delaunay(vertices, segments)
    _, region_index = check_parser.get_triangle_regions(list(regions))
    if len(region_index) != len(regions):
        raise SideTrimError(
            "The trimmed model failed validation: region seed points do not "
            "each claim their own area. This is a bug in the trim; please "
            "report the model that produced it."
        )
    if _hull_edge_count(check_parser.tri_output["triangles"]) != plan.hull_edge_count:
        raise SideTrimError(
            "The trimmed model failed validation: the outer boundary changed. "
            "This is a bug in the trim; please report the model that produced it."
        )


def apply_side_trim(
    vertices: Mapping[int, Mapping[str, Any]],
    segments: Sequence[Mapping[str, Any]],
    holes: Sequence[Mapping[str, Any]],
    regions: Optional[Sequence[Mapping[str, Any]]],
    source_table: pd.DataFrame,
    source_text: str,
    points: Sequence[Tuple[float, float]],
    parameters: SideTrimParameters,
    output_poly_name: str,
) -> Dict[str, Any]:
    """Clear one side of a model and rebuild both output files.

    Args:
        vertices, segments, holes, regions: The parsed source ``.poly``.
        source_table: Parsed table of the source ``.resistivity``.
        source_text: Raw text of the source ``.resistivity``.
        points: Boundary points in metres.
        parameters: Validated parameters.
        output_poly_name: Value for the output's ``Model File`` header.

    Returns:
        A dict with the trimmed model (``vertices``/``segments``/``holes``/
        ``regions``), the text of both output files, ``removedRegionIds``,
        ``boundaryPoints``, ``stats`` and ``warnings``.

    Raises:
        SideTrimError: If the boundary is unusable, the trim would remove
            everything, or the generated model fails validation.
    """
    plan = plan_side_trim(vertices, segments, holes, regions, points, parameters)

    resistivity_text, _, inheritance = build_trimmed_resistivity(
        source_table, source_text, plan, parameters, output_poly_name
    )

    warnings = list(plan.warnings)
    if inheritance.fixed_regions == 0:
        warnings.append(
            "No fixed regions in the result. Air and seawater are normally "
            "Param = 0; check the source .resistivity file."
        )

    poly_text = render_poly_text(plan.vertices, plan.segments, plan.holes, plan.regions)
    _validate_round_trip(poly_text, plan)

    stats = plan_stats(plan, len(regions or []))
    stats.update(
        {
            "trimmedRegionCount": len(plan.regions),
            "inheritedRegionCount": inheritance.inherited,
            "fixedRegionCount": inheritance.fixed_regions,
            "freeParameterCount": inheritance.free_parameters,
        }
    )

    return {
        "vertices": plan.vertices,
        "segments": plan.segments,
        "holes": plan.holes,
        "regions": plan.regions,
        "polyText": poly_text,
        "resistivityText": resistivity_text,
        "removedRegionIds": plan.removed_region_ids,
        "boundaryPoints": [[y, z] for y, z in plan.boundary_points],
        "stats": stats,
        "warnings": warnings,
    }
