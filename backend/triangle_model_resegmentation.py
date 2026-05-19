import math
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


Point = Tuple[float, float]
Triangle = Tuple[int, int, int]


class ResegmentationError(ValueError):
    """Raised when resegmentation input cannot produce a valid model."""


@dataclass(frozen=True)
class RectangularRoi:
    """Rectangular resegmentation bounds in source `.poly` coordinates."""

    y_min: float
    y_max: float
    z_min: float
    z_max: float


@dataclass(frozen=True)
class ResegmentationParameters:
    """Validated user controls for MeshView resegmentation."""

    roi: RectangularRoi
    rho_levels: List[float]
    only_free_parameters: bool
    boundary_tolerance: float
    minimum_region_area: float


@dataclass(frozen=True)
class RegionResistivityMetadata:
    """Source region metadata needed to classify triangles."""

    region_id: int
    rho: float
    param: Optional[float]


@dataclass(frozen=True)
class TriangleAssignment:
    """Classification assigned to one constrained triangulation cell."""

    active: bool
    label: str
    rho: Optional[float]
    source_kind: str
    source_region_id: Optional[int]


@dataclass
class Component:
    """Connected set of triangles that will become one output region."""

    component_id: int
    label: str
    rho: float
    source_kind: str
    triangle_indices: List[int]
    area: float


def _as_float(value: Any, field_name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ResegmentationError(f"{field_name} must be numeric") from exc
    if not math.isfinite(number):
        raise ResegmentationError(f"{field_name} must be finite")
    return number


def _normalize_column_name(name: Any) -> str:
    return str(name).strip().lower().replace("_", "").replace("-", "")


def parse_resegmentation_parameters(payload: Dict[str, Any]) -> ResegmentationParameters:
    """Parse and validate resegmentation parameters from API JSON."""

    roi_payload = payload.get("roi")
    if not isinstance(roi_payload, dict):
        raise ResegmentationError("roi is required")

    y_min = _as_float(roi_payload.get("yMin"), "roi.yMin")
    y_max = _as_float(roi_payload.get("yMax"), "roi.yMax")
    z_min = _as_float(roi_payload.get("zMin"), "roi.zMin")
    z_max = _as_float(roi_payload.get("zMax"), "roi.zMax")

    if y_min >= y_max:
        raise ResegmentationError("roi.yMin must be less than roi.yMax")
    if z_min >= z_max:
        raise ResegmentationError("roi.zMin must be less than roi.zMax")

    raw_levels = payload.get("rhoLevels")
    if not isinstance(raw_levels, list) or not raw_levels:
        raise ResegmentationError("rhoLevels must contain at least one value")

    rho_levels = []
    for index, value in enumerate(raw_levels):
        rho = _as_float(value, f"rhoLevels[{index}]")
        if rho <= 0:
            raise ResegmentationError("rhoLevels must be positive")
        rho_levels.append(rho)

    boundary_tolerance = _as_float(
        payload.get("boundaryTolerance", 0), "boundaryTolerance"
    )
    if boundary_tolerance < 0:
        raise ResegmentationError("boundaryTolerance must be non-negative")

    minimum_region_area = _as_float(
        payload.get("minimumRegionArea", 0), "minimumRegionArea"
    )
    if minimum_region_area < 0:
        raise ResegmentationError("minimumRegionArea must be non-negative")

    return ResegmentationParameters(
        roi=RectangularRoi(y_min=y_min, y_max=y_max, z_min=z_min, z_max=z_max),
        rho_levels=sorted(rho_levels),
        only_free_parameters=bool(payload.get("onlyFreeParameters", True)),
        boundary_tolerance=boundary_tolerance,
        minimum_region_area=minimum_region_area,
    )


def _find_table_column(columns: Iterable[Any], candidates: Sequence[str]) -> Any:
    normalized_candidates = {_normalize_column_name(candidate) for candidate in candidates}
    for column in columns:
        if _normalize_column_name(column) in normalized_candidates:
            return column
    return None


def build_region_metadata_lookup(
    parsed_resistivity: Dict[str, Any],
    require_param: bool,
) -> Dict[int, RegionResistivityMetadata]:
    """Build source region rho/Param lookup from a parsed MARE2DEM table."""

    table = parsed_resistivity.get("table")
    if table is None:
        raise ResegmentationError("No resistivity table found")
    if len(table.columns) == 0:
        raise ResegmentationError("No resistivity table columns found")

    region_column = _find_table_column(table.columns, ["region", "#", "!#"])
    rho_column = _find_table_column(table.columns, ["rho", "rho-z", "rho_h", "rho-h"])
    param_column = _find_table_column(table.columns, ["param", "parameter"])

    if region_column is None:
        region_column = table.columns[0]
    if rho_column is None:
        raise ResegmentationError("Rho column is required")
    if require_param and param_column is None:
        raise ResegmentationError("Param column is required for free-parameter masking")

    lookup: Dict[int, RegionResistivityMetadata] = {}
    for _, row in table.iterrows():
        try:
            region_id = int(float(row[region_column]))
            rho = float(row[rho_column])
            param = float(row[param_column]) if param_column is not None else None
        except (TypeError, ValueError):
            continue
        if math.isfinite(rho):
            lookup[region_id] = RegionResistivityMetadata(region_id, rho, param)

    if not lookup:
        raise ResegmentationError("No valid region rho rows found")
    return lookup


def compute_triangle_centroid(points: Sequence[Point], triangle: Triangle) -> Point:
    """Return the centroid of a triangle."""

    first, second, third = (points[index] for index in triangle)
    return (
        (first[0] + second[0] + third[0]) / 3,
        (first[1] + second[1] + third[1]) / 3,
    )


def compute_triangle_area(points: Sequence[Point], triangle: Triangle) -> float:
    """Return absolute triangle area."""

    first, second, third = (points[index] for index in triangle)
    return abs(
        (
            first[0] * (second[1] - third[1])
            + second[0] * (third[1] - first[1])
            + third[0] * (first[1] - second[1])
        )
        / 2
    )


def is_point_in_roi(point: Point, roi: RectangularRoi) -> bool:
    """Return whether a point is inside or on the rectangular ROI."""

    return roi.y_min <= point[0] <= roi.y_max and roi.z_min <= point[1] <= roi.z_max


def assign_nearest_rho_level(rho: float, rho_levels: Sequence[float]) -> float:
    """Assign a rho value to the closest target level in log10 space."""

    if rho <= 0 or not math.isfinite(rho):
        raise ResegmentationError("rho must be finite and positive")
    log_rho = math.log10(rho)
    return min(rho_levels, key=lambda level: abs(log_rho - math.log10(level)))


def build_triangle_assignments(
    points: Sequence[Point],
    triangles: Sequence[Triangle],
    triangle_region_ids: Sequence[Optional[int]],
    metadata_by_region: Dict[int, RegionResistivityMetadata],
    parameters: ResegmentationParameters,
) -> Tuple[List[TriangleAssignment], Dict[str, int], List[str]]:
    """Classify each triangle into an active rho level or preserved region."""

    assignments: List[TriangleAssignment] = []
    warnings: List[str] = []
    active_count = 0
    invalid_rho_count = 0
    missing_metadata_count = 0

    for triangle_index, triangle in enumerate(triangles):
        region_id = triangle_region_ids[triangle_index]
        metadata = metadata_by_region.get(region_id) if region_id is not None else None
        centroid = compute_triangle_centroid(points, triangle)
        in_roi = is_point_in_roi(centroid, parameters.roi)

        if metadata is None:
            missing_metadata_count += 1
            assignments.append(
                TriangleAssignment(False, f"missing:{triangle_index}", None, "preserved", region_id)
            )
            continue

        finite_positive_rho = metadata.rho > 0 and math.isfinite(metadata.rho)
        free_parameter = (
            not parameters.only_free_parameters
            or (metadata.param is not None and metadata.param > 0)
        )

        if in_roi and free_parameter and finite_positive_rho:
            level = assign_nearest_rho_level(metadata.rho, parameters.rho_levels)
            active_count += 1
            assignments.append(
                TriangleAssignment(
                    True,
                    f"level:{level:g}",
                    level,
                    "resegmented",
                    region_id,
                )
            )
            continue

        if not finite_positive_rho:
            invalid_rho_count += 1
        assignments.append(
            TriangleAssignment(
                False,
                f"source:{region_id}",
                metadata.rho if finite_positive_rho else None,
                "preserved",
                region_id,
            )
        )

    if missing_metadata_count:
        warnings.append(f"{missing_metadata_count} triangles had no source region metadata")
    if invalid_rho_count:
        warnings.append(f"{invalid_rho_count} triangles had invalid source rho")

    return (
        assignments,
        {
            "sourceTriangleCount": len(triangles),
            "activeTriangleCount": active_count,
        },
        warnings,
    )


def _triangle_edges(triangle: Triangle) -> List[Tuple[int, int]]:
    return [
        tuple(sorted((triangle[0], triangle[1]))),
        tuple(sorted((triangle[1], triangle[2]))),
        tuple(sorted((triangle[2], triangle[0]))),
    ]


def _edge_length(points: Sequence[Point], edge: Tuple[int, int]) -> float:
    first, second = points[edge[0]], points[edge[1]]
    return math.hypot(first[0] - second[0], first[1] - second[1])


def _build_triangle_neighbors(triangles: Sequence[Triangle]) -> Dict[int, List[int]]:
    edge_to_triangles: Dict[Tuple[int, int], List[int]] = {}
    for triangle_index, triangle in enumerate(triangles):
        for edge in _triangle_edges(triangle):
            edge_to_triangles.setdefault(edge, []).append(triangle_index)

    neighbors = {index: [] for index in range(len(triangles))}
    for adjacent_triangles in edge_to_triangles.values():
        if len(adjacent_triangles) == 2:
            first, second = adjacent_triangles
            neighbors[first].append(second)
            neighbors[second].append(first)
    return neighbors


def build_connected_components(
    points: Sequence[Point],
    triangles: Sequence[Triangle],
    assignments: Sequence[TriangleAssignment],
) -> Tuple[List[Component], List[int]]:
    """Build same-label connected components from triangle assignments."""

    neighbors = _build_triangle_neighbors(triangles)
    visited = set()
    components: List[Component] = []
    component_by_triangle = [0] * len(triangles)
    next_component_id = 1

    for triangle_index, assignment in enumerate(assignments):
        if triangle_index in visited:
            continue

        stack = [triangle_index]
        visited.add(triangle_index)
        triangle_indices: List[int] = []

        while stack:
            current = stack.pop()
            triangle_indices.append(current)
            for neighbor in neighbors[current]:
                if neighbor in visited:
                    continue
                if assignments[neighbor].label != assignment.label:
                    continue
                visited.add(neighbor)
                stack.append(neighbor)

        area = sum(compute_triangle_area(points, triangles[index]) for index in triangle_indices)
        rho = assignment.rho if assignment.rho is not None else 1.0
        component = Component(
            next_component_id,
            assignment.label,
            rho,
            assignment.source_kind,
            sorted(triangle_indices),
            area,
        )
        components.append(component)
        for index in triangle_indices:
            component_by_triangle[index] = next_component_id
        next_component_id += 1

    return components, component_by_triangle


def compute_component_adjacency(
    points: Sequence[Point],
    triangles: Sequence[Triangle],
    component_by_triangle: Sequence[int],
) -> Dict[int, Dict[int, float]]:
    """Return component adjacency weighted by shared boundary length."""

    edge_to_triangles: Dict[Tuple[int, int], List[int]] = {}
    for triangle_index, triangle in enumerate(triangles):
        for edge in _triangle_edges(triangle):
            edge_to_triangles.setdefault(edge, []).append(triangle_index)

    adjacency: Dict[int, Dict[int, float]] = {}
    for edge, adjacent_triangles in edge_to_triangles.items():
        if len(adjacent_triangles) != 2:
            continue
        first_triangle, second_triangle = adjacent_triangles
        first_component = component_by_triangle[first_triangle]
        second_component = component_by_triangle[second_triangle]
        if first_component == second_component:
            continue
        length = _edge_length(points, edge)
        adjacency.setdefault(first_component, {})
        adjacency.setdefault(second_component, {})
        adjacency[first_component][second_component] = (
            adjacency[first_component].get(second_component, 0) + length
        )
        adjacency[second_component][first_component] = (
            adjacency[second_component].get(first_component, 0) + length
        )
    return adjacency


def _choose_merge_target(
    component: Component,
    components_by_id: Dict[int, Component],
    adjacency: Dict[int, Dict[int, float]],
) -> Optional[int]:
    candidates = adjacency.get(component.component_id, {})
    if not candidates:
        return None

    def score(candidate_id: int) -> Tuple[float, float, int]:
        candidate = components_by_id[candidate_id]
        rho_distance = abs(math.log10(component.rho) - math.log10(candidate.rho))
        shared_boundary = candidates[candidate_id]
        return (rho_distance, -shared_boundary, candidate_id)

    return min(candidates, key=score)


def merge_small_components(
    points: Sequence[Point],
    triangles: Sequence[Triangle],
    components: Sequence[Component],
    minimum_area: float,
) -> Tuple[List[Component], List[int], List[str], int]:
    """Merge undersized components into adjacent compatible components."""

    component_by_triangle = [0] * len(triangles)
    components_by_id = {
        component.component_id: Component(
            component.component_id,
            component.label,
            component.rho,
            component.source_kind,
            list(component.triangle_indices),
            component.area,
        )
        for component in components
    }
    for component in components_by_id.values():
        for triangle_index in component.triangle_indices:
            component_by_triangle[triangle_index] = component.component_id

    if minimum_area <= 0:
        return list(components_by_id.values()), component_by_triangle, [], 0

    warnings: List[str] = []
    merge_count = 0

    while True:
        small_components = sorted(
            [
                component
                for component in components_by_id.values()
                if component.area < minimum_area
            ],
            key=lambda component: component.area,
        )
        if not small_components:
            break

        component = small_components[0]
        adjacency = compute_component_adjacency(points, triangles, component_by_triangle)
        target_id = _choose_merge_target(component, components_by_id, adjacency)
        if target_id is None:
            warnings.append(
                f"Component {component.component_id} is below minimum area but has no adjacent merge target"
            )
            break

        target = components_by_id[target_id]
        target.triangle_indices = sorted(target.triangle_indices + component.triangle_indices)
        target.area += component.area
        for triangle_index in component.triangle_indices:
            component_by_triangle[triangle_index] = target_id
        del components_by_id[component.component_id]
        merge_count += 1

    return (
        sorted(components_by_id.values(), key=lambda component: component.component_id),
        component_by_triangle,
        warnings,
        merge_count,
    )


def _format_number(value: float) -> str:
    return f"{value:g}"


def build_forward_resistivity_text(model_file_name: str, regions: Sequence[Component]) -> str:
    """Build a fixed-parameter MARE2DEM resistivity file for forward modeling."""

    lines = [
        "Format:                         mare2dem_1.1                     ! input ",
        f"Model File:                     {model_file_name:<32} ! input ",
        "Data File:                                                       ! input ",
        "Settings File:                  mare2dem.settings                ! input ",
        "Maximum Iterations:             0                                ! opt. input ",
        "Bounds Transform:               bandpass                         ! opt. input ",
        "Global Bounds:                  0.1, 100000                      ! opt. input ",
        "Roughness Penalty Method:       gradient                         ! opt. input ",
        "Roughness Weights (y,z):        3, 1                             ! opt. input ",
        "Penalty Cut Weight:             0.1                              ! opt. input ",
        "Roughness With Prejudice:       no                               ! opt. input ",
        "Min. Gradient Support Weight:   0                                ! opt. input ",
        "Print Level:                    1                                ! opt. input ",
        "Target Misfit:                  1                                ! require for inversion) ",
        "Misfit Decrease Threshold:      0.85                             ! opt. input ",
        "Converge Slowly:                no                               ! opt. input ",
        "Log10 Lagrange Value:           5                                ! input/output ",
        "Model Roughness:                                                 ! output from inversion ",
        "Model Misfit:                                                    ! output from inversion ",
        f"Date/Time:                      {datetime.now().strftime('%d-%b-%Y %H:%M:%S'):<32} ! output from inversion ",
        "Anisotropy:                     isotropic                        ! input ",
        f"Number of regions:              {len(regions)}                               ! input ",
        "!#        Rho           Param      Lower        Upper         Prej         Weight       ",
    ]

    for output_id, region in enumerate(regions, start=1):
        lines.append(
            f"{output_id:<9} {_format_number(region.rho):<13} "
            "0          0            0             0            0            "
        )
    return "\n".join(lines) + "\n"


def _component_lookup(components: Sequence[Component]) -> Dict[int, Component]:
    return {component.component_id: component for component in components}


def _build_boundary_edges(
    triangles: Sequence[Triangle],
    component_by_triangle: Sequence[int],
) -> List[Tuple[int, int, bool]]:
    edge_to_triangles: Dict[Tuple[int, int], List[int]] = {}
    for triangle_index, triangle in enumerate(triangles):
        for edge in _triangle_edges(triangle):
            edge_to_triangles.setdefault(edge, []).append(triangle_index)

    outer_edges: List[Tuple[int, int, bool]] = []
    internal_edges: List[Tuple[int, int, bool]] = []

    for edge, adjacent_triangles in edge_to_triangles.items():
        if len(adjacent_triangles) == 1:
            outer_edges.append((edge[0], edge[1], False))
            continue
        if len(adjacent_triangles) == 2:
            first, second = adjacent_triangles
            if component_by_triangle[first] != component_by_triangle[second]:
                internal_edges.append((edge[0], edge[1], True))

    return sorted(outer_edges) + sorted(internal_edges)


def _point_line_distance(point: Point, start: Point, end: Point) -> float:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    numerator = abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0])
    denominator = math.hypot(dx, dy)
    return numerator / denominator


def _simplify_path_indices(
    path: Sequence[int],
    points: Sequence[Point],
    tolerance: float,
) -> List[int]:
    if len(path) <= 2 or tolerance <= 0:
        return list(path)

    start = points[path[0]]
    end = points[path[-1]]
    max_distance = -1.0
    max_index = 0

    for index in range(1, len(path) - 1):
        distance = _point_line_distance(points[path[index]], start, end)
        if distance > max_distance:
            max_distance = distance
            max_index = index

    if max_distance > tolerance:
        left = _simplify_path_indices(path[: max_index + 1], points, tolerance)
        right = _simplify_path_indices(path[max_index:], points, tolerance)
        return left[:-1] + right

    return [path[0], path[-1]]


def _boundary_edge_records(
    triangles: Sequence[Triangle],
    component_by_triangle: Sequence[int],
) -> List[Tuple[int, int, Tuple[int, int], bool]]:
    edge_to_triangles: Dict[Tuple[int, int], List[int]] = {}
    for triangle_index, triangle in enumerate(triangles):
        for edge in _triangle_edges(triangle):
            edge_to_triangles.setdefault(edge, []).append(triangle_index)

    records: List[Tuple[int, int, Tuple[int, int], bool]] = []
    for edge, adjacent_triangles in edge_to_triangles.items():
        if len(adjacent_triangles) == 1:
            component = component_by_triangle[adjacent_triangles[0]]
            records.append((edge[0], edge[1], (0, component), False))
            continue
        if len(adjacent_triangles) == 2:
            first, second = adjacent_triangles
            first_component = component_by_triangle[first]
            second_component = component_by_triangle[second]
            if first_component != second_component:
                pair = tuple(sorted((first_component, second_component)))
                records.append((edge[0], edge[1], pair, True))
    return records


def _trace_boundary_chains(edges: Sequence[Tuple[int, int]]) -> List[List[int]]:
    adjacency: Dict[int, List[int]] = {}
    for first, second in edges:
        adjacency.setdefault(first, []).append(second)
        adjacency.setdefault(second, []).append(first)

    visited_edges = set()
    chains: List[List[int]] = []
    starts = sorted([node for node, neighbors in adjacency.items() if len(neighbors) != 2])
    if not starts and adjacency:
        starts = [min(adjacency)]

    def edge_key(first: int, second: int) -> Tuple[int, int]:
        return tuple(sorted((first, second)))

    def trace(start: int, first_neighbor: int) -> List[int]:
        path = [start]
        previous = start
        current = first_neighbor
        visited_edges.add(edge_key(start, first_neighbor))

        while True:
            path.append(current)
            if current == start:
                break
            next_candidates = [
                neighbor
                for neighbor in adjacency[current]
                if neighbor != previous and edge_key(current, neighbor) not in visited_edges
            ]
            if len(adjacency[current]) != 2 or not next_candidates:
                break
            next_node = next_candidates[0]
            visited_edges.add(edge_key(current, next_node))
            previous, current = current, next_node
        return path

    for start in starts:
        for neighbor in sorted(adjacency.get(start, [])):
            if edge_key(start, neighbor) in visited_edges:
                continue
            chains.append(trace(start, neighbor))

    for first, second in edges:
        if edge_key(first, second) not in visited_edges:
            chains.append(trace(first, second))

    return chains


def _simplify_boundary_edges(
    points: Sequence[Point],
    triangles: Sequence[Triangle],
    component_by_triangle: Sequence[int],
    tolerance: float,
) -> List[Tuple[int, int, bool]]:
    records = _boundary_edge_records(triangles, component_by_triangle)
    if tolerance <= 0:
        return sorted(
            [(first, second, is_internal) for first, second, _, is_internal in records],
            key=lambda edge: (edge[2], edge[0], edge[1]),
        )

    records_by_pair: Dict[Tuple[int, int], List[Tuple[int, int, bool]]] = {}
    for first, second, pair, is_internal in records:
        records_by_pair.setdefault(pair, []).append((first, second, is_internal))

    simplified_edges: List[Tuple[int, int, bool]] = []
    for pair, pair_records in records_by_pair.items():
        chains = _trace_boundary_chains([(first, second) for first, second, _ in pair_records])
        is_internal = pair[0] != 0
        for chain in chains:
            is_closed = len(chain) > 2 and chain[0] == chain[-1]
            simplified_chain = (
                chain if is_closed else _simplify_path_indices(chain, points, tolerance)
            )
            for index in range(len(simplified_chain) - 1):
                first = simplified_chain[index]
                second = simplified_chain[index + 1]
                if first != second:
                    simplified_edges.append(tuple(sorted((first, second))) + (is_internal,))

    return sorted(set(simplified_edges), key=lambda edge: (edge[2], edge[0], edge[1]))


def build_poly_text(
    points: Sequence[Point],
    triangles: Sequence[Triangle],
    components: Sequence[Component],
    component_by_triangle: Sequence[int],
    holes: Sequence[Dict[str, Any]],
    boundary_tolerance: float = 0,
) -> Tuple[str, Dict[str, int], List[str]]:
    """Build a MARE2DEM `.poly` text payload from final region components."""

    warnings: List[str] = []
    boundary_edges = _simplify_boundary_edges(
        points, triangles, component_by_triangle, boundary_tolerance
    )
    if not boundary_edges:
        warnings.append("Boundary extraction produced no segments")
    used_vertex_indices = sorted({index for edge in boundary_edges for index in edge[:2]})
    output_vertex_id_by_input = {
        input_index: output_id for output_id, input_index in enumerate(used_vertex_indices, start=1)
    }

    lines = [f"{len(used_vertex_indices)} 2 0 0"]
    for input_index in used_vertex_indices:
        point = points[input_index]
        output_id = output_vertex_id_by_input[input_index]
        lines.append(f"{output_id} {_format_number(point[0])} {_format_number(point[1])} ")

    lines.append(f"{len(boundary_edges)} 1")
    for segment_id, (first, second, _) in enumerate(boundary_edges, start=1):
        lines.append(
            f"{segment_id} {output_vertex_id_by_input[first]} "
            f"{output_vertex_id_by_input[second]} 1"
        )

    lines.append(str(len(holes)))
    for hole_index, hole in enumerate(holes, start=1):
        hole_id = int(hole.get("id", hole_index))
        lines.append(
            f"{hole_id} {_format_number(float(hole['hCoor']))} "
            f"{_format_number(float(hole['vCoor']))}"
        )

    sorted_components = sorted(components, key=lambda component: component.component_id)
    lines.append(str(len(sorted_components)))
    for output_region_id, component in enumerate(sorted_components, start=1):
        triangle = triangles[component.triangle_indices[0]]
        seed = compute_triangle_centroid(points, triangle)
        lines.append(
            f"{output_region_id} {_format_number(seed[0])} {_format_number(seed[1])} "
            f"{output_region_id} -1"
        )

    stats = {
        "outputVertexCount": len(used_vertex_indices),
        "outputSegmentCount": len(boundary_edges),
        "outputRegionCount": len(sorted_components),
    }
    return "\n".join(lines) + "\n", stats, warnings


def serialize_preview_mesh(
    points: Sequence[Point],
    triangles: Sequence[Triangle],
    components: Sequence[Component],
    component_by_triangle: Sequence[int],
) -> Dict[str, Any]:
    """Serialize final component labels using the existing constrained mesh shape."""

    components_by_id = _component_lookup(components)
    sorted_component_ids = sorted(components_by_id)
    output_region_id_by_component = {
        component_id: index for index, component_id in enumerate(sorted_component_ids, start=1)
    }

    triangle_region_ids = [
        output_region_id_by_component[component_id]
        for component_id in component_by_triangle
    ]
    triangle_rho_values = [
        float(components_by_id[component_id].rho)
        for component_id in component_by_triangle
    ]
    region_resistivity = [
        {
            "regionId": output_region_id_by_component[component_id],
            "rho": float(components_by_id[component_id].rho),
        }
        for component_id in sorted_component_ids
    ]

    return {
        "vertices": [
            {"id": index, "x": float(point[0]), "y": float(point[1])}
            for index, point in enumerate(points)
        ],
        "triangles": [[int(a), int(b), int(c)] for a, b, c in triangles],
        "triangleRegionIds": triangle_region_ids,
        "triangleResistivityValues": triangle_rho_values,
        "regionResistivity": region_resistivity,
    }


def _serialize_triangulation_vertices(mesh_vertices: Dict[int, Dict[str, float]]) -> List[Point]:
    return [
        (float(mesh_vertices[vertex_id]["hCoor"]), float(mesh_vertices[vertex_id]["vCoor"]))
        for vertex_id in sorted(mesh_vertices)
    ]


def _map_triangle_region_ids(poly_parser: Any, regions: Optional[List[Dict[str, Any]]]) -> List[Optional[int]]:
    triangle_count = len(poly_parser.tri_output["triangles"])
    triangle_region_ids: List[Optional[int]] = [None] * triangle_count

    if not regions:
        return triangle_region_ids

    triangle_region_numbers, region_index = poly_parser.get_triangle_regions(regions)
    for triangle_index, region_number in enumerate(triangle_region_numbers):
        region_number = int(region_number)
        if region_number <= 0 or region_number - 1 >= len(region_index):
            continue
        original_region = regions[int(region_index[region_number - 1])]
        original_region_id = original_region.get("attribute") or original_region["id"]
        triangle_region_ids[triangle_index] = int(original_region_id)

    return triangle_region_ids


def build_resegmentation_result(
    poly_parser: Any,
    vertices: Dict[int, Dict[str, Any]],
    segments: Sequence[Dict[str, Any]],
    holes: Sequence[Dict[str, Any]],
    regions: Optional[List[Dict[str, Any]]],
    parsed_resistivity: Dict[str, Any],
    parameters: ResegmentationParameters,
    output_poly_file_name: str,
    include_export_text: bool,
) -> Dict[str, Any]:
    """Build preview/export payloads for a source model and parameters."""

    if holes:
        raise ResegmentationError(
            "Resegmentation does not yet support .poly files with holes"
        )

    raw_triangles, mesh_vertices, _ = poly_parser.create_constrained_delaunay(
        vertices, segments
    )
    points = _serialize_triangulation_vertices(mesh_vertices)
    triangles = [tuple(int(value) for value in triangle) for triangle in raw_triangles]
    triangle_region_ids = _map_triangle_region_ids(poly_parser, regions)
    metadata = build_region_metadata_lookup(
        parsed_resistivity, require_param=parameters.only_free_parameters
    )

    assignments, assignment_stats, assignment_warnings = build_triangle_assignments(
        points, triangles, triangle_region_ids, metadata, parameters
    )
    if assignment_stats["activeTriangleCount"] == 0:
        raise ResegmentationError("No active triangles found in the selected ROI")

    components, component_by_triangle = build_connected_components(
        points, triangles, assignments
    )
    components, component_by_triangle, merge_warnings, merge_count = merge_small_components(
        points,
        triangles,
        components,
        parameters.minimum_region_area,
    )
    poly_text, poly_stats, poly_warnings = build_poly_text(
        points,
        triangles,
        components,
        component_by_triangle,
        holes,
        parameters.boundary_tolerance,
    )

    preview_mesh = serialize_preview_mesh(
        points, triangles, components, component_by_triangle
    )
    stats = {
        **assignment_stats,
        **poly_stats,
        "mergedComponentCount": merge_count,
    }
    warnings = assignment_warnings + merge_warnings + poly_warnings

    result: Dict[str, Any] = {
        "previewMesh": preview_mesh,
        "stats": stats,
        "warnings": warnings,
    }

    if include_export_text:
        result.update(
            {
                "polyFileName": output_poly_file_name,
                "polyText": poly_text,
                "resistivityFileName": output_poly_file_name.replace(
                    ".poly", ".resistivity"
                ),
                "resistivityText": build_forward_resistivity_text(
                    output_poly_file_name,
                    components,
                ),
            }
        )

    return result
