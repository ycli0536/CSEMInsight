import traceback
import os
import shutil
import sys
import tempfile
import threading
import time
import uuid
import json
from contextlib import contextmanager
from datetime import datetime
from typing import List
import numpy as np
import pandas as pd
import psutil
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.exceptions import ClientDisconnected, HTTPException
from suesi_depth_reader import process_SuesiDepth_mat_file
from MARE2DEM_poly_parser import MARE2DEMPolyParser
from resistivity_file_parser import ResistivityFileParser
from csem_datafile_parser import CSEMDataFileReader
from csem_datafile_parser import CSEMDataFileManager
from csem_datafile_parser import AMPLITUDE_TYPE_CODES
from csem_datafile_parser import PHASE_TYPE_CODES
from csem_datafile_parser import calculate_misfit_statistics
from xyz_datafile_parser import XYZDataFileReader
from bathymetry_parser import BathymetryParser
from triangle_resistivity_export import (
    ResistivityExportError,
    build_exported_resistivity_text,
)
from penalty_cut_service import (
    PenaltyCutError,
    apply_penalty_cut,
    parse_interface,
    parse_model_bounds,
    parse_penalty_cut_parameters,
)
from poly_region_inheritance import RegionInheritanceError
from rho_bound_service import (
    RhoBoundError,
    build_bounded_resistivity_text,
    check_shape_against_bounds,
    parse_rho_bound_parameters,
    parse_shape_points,
    parse_shape_text,
    select_regions,
)
from triangle_model_resegmentation import (
    ResegmentationError,
    build_resegmentation_result,
    parse_resegmentation_parameters,
)

DEFAULT_PORT = 3354
DEFAULT_MAX_UPLOAD_MB = 512
#: How often the watchdog checks that the process that started us is alive.
PARENT_POLL_SECONDS = 2.0

# The backend only ever serves the local frontend: the Vite dev server, the
# `vite preview` server, and the Tauri webview. The port is not pinned because
# Vite falls back to another one when 5173 is taken. Tauri uses a custom scheme
# on macOS/iOS and a virtual host elsewhere, so all three spellings are needed.
# Anchored with ^...$ so an origin like http://localhost.evil.com cannot match.
DEFAULT_ALLOWED_ORIGINS = (
    r"^https?://localhost(:\d+)?$",
    r"^https?://127\.0\.0\.1(:\d+)?$",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
)


def _get_debug_flag() -> bool:
    raw_value = os.getenv("CSEMINSIGHT_DEBUG") or os.getenv("FLASK_DEBUG") or ""
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _coerce_port(raw_value) -> int:
    """Return a valid TCP port, or 0 when the value cannot be used."""
    try:
        port = int(str(raw_value).strip())
    except (TypeError, ValueError):
        return 0
    return port if 1 <= port <= 65535 else 0


def _read_cli_value(arguments: List[str], flag: str):
    """Return the value of ``--flag value`` or ``--flag=value``, else None."""
    prefix = f"{flag}="
    for index, argument in enumerate(arguments):
        if argument == flag and index + 1 < len(arguments):
            return arguments[index + 1]
        if argument.startswith(prefix):
            return argument[len(prefix):]
    return None


def _get_port(argv: List[str] = None) -> int:
    """Return the TCP port the API should listen on.

    Precedence is ``--port`` (how the desktop shell passes the port it
    reserved), then ``CSEMINSIGHT_PORT``, then the default. Invalid values
    fall through to the next source rather than crashing at startup.

    Args:
        argv: Argument list to read; defaults to the process arguments.

    Returns:
        A port number between 1 and 65535.
    """
    arguments = list(sys.argv[1:] if argv is None else argv)

    return (
        _coerce_port(_read_cli_value(arguments, "--port"))
        or _coerce_port(os.getenv("CSEMINSIGHT_PORT"))
        or DEFAULT_PORT
    )


def _get_parent_pid(argv: List[str] = None) -> int:
    """Return the PID this backend should shut down with.

    Args:
        argv: Argument list to read; defaults to the process arguments.

    Returns:
        The ``--parent-pid`` value, or 0 to run unsupervised.
    """
    arguments = list(sys.argv[1:] if argv is None else argv)
    try:
        parent_pid = int(str(_read_cli_value(arguments, "--parent-pid")).strip())
    except (TypeError, ValueError):
        return 0
    return parent_pid if parent_pid > 0 else 0


def _parent_is_gone(parent) -> bool:
    """Whether the watched process has exited.

    A zombie counts as gone: on POSIX the process has exited and is only
    waiting to be reaped, so it is never coming back. Errors that are not
    "no such process" -- an ``AccessDenied`` blip, say -- are treated as still
    alive, so a transient failure cannot take the backend down with it.
    """
    try:
        if not parent.is_running():
            return True
        return parent.status() == psutil.STATUS_ZOMBIE
    except psutil.NoSuchProcess:
        return True
    except psutil.Error:
        return False


def _watch_parent(parent_pid: int, poll_seconds: float, exit_process=None) -> None:
    """Block until the watched process is gone, then end this one.

    Args:
        parent_pid: PID to watch.
        poll_seconds: Delay between liveness checks.
        exit_process: Called instead of exiting; for tests.
    """
    if exit_process is None:
        # os._exit rather than sys.exit: this runs on a daemon thread, where
        # sys.exit ends only the thread and leaves the server serving.
        exit_process = lambda: os._exit(0)  # noqa: E731

    try:
        parent = psutil.Process(parent_pid)
    except psutil.NoSuchProcess:
        exit_process()
        return
    except psutil.Error:
        # Cannot supervise this process; keep serving rather than quit on a
        # permissions problem.
        return

    while not _parent_is_gone(parent):
        time.sleep(poll_seconds)

    exit_process()


def _start_parent_watchdog(
    parent_pid: int,
    poll_seconds: float = PARENT_POLL_SECONDS,
    exit_process=None,
):
    """Exit this process once the process that started it is gone.

    The desktop shell kills the sidecar it spawned, but PyInstaller's onefile
    bootloader re-executes itself, so the process actually serving requests is
    a grandchild the shell has no handle on. Without this, quitting the app
    leaves the backend running and holding its port. Watching the parent also
    covers what the shell cannot handle at all: a crash or a force quit.

    Args:
        parent_pid: PID to watch; 0 disables supervision.
        poll_seconds: Delay between liveness checks.
        exit_process: Called instead of exiting; for tests.

    Returns:
        The watchdog thread, or None when running unsupervised.
    """
    if parent_pid <= 0:
        return None

    thread = threading.Thread(
        target=_watch_parent,
        args=(parent_pid, poll_seconds, exit_process),
        name="parent-watchdog",
        daemon=True,
    )
    thread.start()
    return thread


def _get_max_upload_bytes() -> int:
    """Return the upload size ceiling in bytes.

    Returns:
        The value of ``CSEMINSIGHT_MAX_UPLOAD_MB`` in bytes, or the default
        when the variable is unset or not a positive integer.
    """
    raw_value = (os.getenv("CSEMINSIGHT_MAX_UPLOAD_MB") or "").strip()
    try:
        megabytes = int(raw_value)
    except ValueError:
        megabytes = DEFAULT_MAX_UPLOAD_MB
    if megabytes <= 0:
        megabytes = DEFAULT_MAX_UPLOAD_MB
    return megabytes * 1024 * 1024


def _get_allowed_origins() -> List[str]:
    """Return the browser origins allowed to call this backend.

    Returns:
        The comma-separated ``CSEMINSIGHT_ALLOWED_ORIGINS`` entries, or the
        local dev-server and Tauri origins when the variable is unset.
    """
    raw_value = os.getenv("CSEMINSIGHT_ALLOWED_ORIGINS") or ""
    origins = [origin.strip() for origin in raw_value.split(",") if origin.strip()]
    return origins or list(DEFAULT_ALLOWED_ORIGINS)


app = Flask(__name__)
# The backend binds to localhost only, but any page in the user's browser can
# still reach it. Restrict CORS to the origins this app actually ships with.
CORS(app, origins=_get_allowed_origins())
# Disable sorting of keys in JSON responses
app.config["JSON_SORT_KEYS"] = False
# Reject oversized bodies before Werkzeug buffers them into memory.
app.config["MAX_CONTENT_LENGTH"] = _get_max_upload_bytes()


def _error_response(message: str, hint: str = "", status: int = 400):
    """Build a JSON error response with an actionable next step.

    Args:
        message: Short description of what failed.
        hint: What the user can do about it.
        status: HTTP status code to return.

    Returns:
        A ``(response, status)`` tuple ready to be returned from a view.
    """
    payload = {"error": message}
    if hint:
        payload["hint"] = hint
    return jsonify(payload), status


def _unexpected_error(message: str, hint: str = ""):
    """Log an in-flight exception and return a sanitized 500 response.

    The full traceback is written to the server log and only echoed to the
    client when debug mode is on, so local paths and internal structure are
    not exposed by default.

    Args:
        message: Short description of what failed.
        hint: What the user can do about it.

    Returns:
        A ``(response, 500)`` tuple ready to be returned from a view.
    """
    exc_type, exc_value, _ = sys.exc_info()
    formatted_traceback = traceback.format_exc()
    app.logger.error("%s\n%s", message, formatted_traceback)

    payload = {"error": message}
    if hint:
        payload["hint"] = hint
    if exc_type is not None:
        # One-line summary: enough to report a bug, no stack frames.
        payload["detail"] = f"{exc_type.__name__}: {exc_value}".replace("\n", " ")
    if _get_debug_flag():
        payload["traceback"] = formatted_traceback
    return jsonify(payload), 500


@app.errorhandler(HTTPException)
def _handle_http_exception(exc: HTTPException):
    """Return JSON instead of Werkzeug's HTML error pages."""
    if exc.code == 413:
        limit_mb = app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024)
        return _error_response(
            f"Upload is larger than the {limit_mb} MB limit.",
            hint=(
                "Split the file or raise the limit with the "
                "CSEMINSIGHT_MAX_UPLOAD_MB environment variable."
            ),
            status=413,
        )
    return _error_response(exc.description or exc.name, status=exc.code or 500)


@contextmanager
def _upload_workspace():
    """Yield a private temp directory that is removed when the request ends.

    Yields:
        Path to a fresh directory for this request's uploads.
    """
    temp_dir = tempfile.mkdtemp(
        dir=tempfile.gettempdir(), prefix="cseminsight_upload_"
    )
    try:
        yield temp_dir
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def _save_uploaded_file(file, temp_dir: str) -> str:
    safe_name = secure_filename(file.filename or "")
    if not safe_name:
        safe_name = "upload"
    stem, ext = os.path.splitext(safe_name)
    unique_name = f"{stem}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(temp_dir, unique_name)
    file.save(path)
    return path


#: MARE2DEM data type codes strictly between these bounds are MT; everything
#: below 100 is CSEM and 200-300 is DC resistivity. Same test MARE2DEM applies
#: when it auto-groups a joint dataset (em2d.f90, set_data_groups).
_MT_TYPE_CODE_RANGE = (100, 200)


def _merge_joint_data(reader, blocks, data_df, geometry_info):
    """Merge a joint CSEM+MT data block against the right tables per row.

    A joint file has two receiver blocks (Rx_CSEM, Rx_MT) and two frequency
    lists (Frequencies_CSEM, Frequencies_MT), and each data row belongs to one
    side or the other: MT rows have no transmitter, and their Freq_id indexes
    the MT frequency list.

    Merging the whole data block against the CSEM tables -- which is what this
    module used to do for joint files -- goes wrong in two different ways
    depending on the file. In a .data/.emdata MT rows carry Tx# = 0, which
    matches no transmitter, so the inner join drops every MT row silently. In
    a .resp MARE2DEM writes Tx# = Rx# for MT rows, which matches a CSEM
    transmitter *by accident*, so the rows survive but are attached to CSEM
    geometry and CSEM frequencies -- silently wrong values rather than missing
    ones. Splitting by type code and merging each part against its own blocks
    fixes both.

    Rows come back in their original file order, so any consumer keying on row
    position (the frontend table and its edit path) is unaffected.
    """
    low, high = _MT_TYPE_CODE_RANGE
    type_codes = pd.to_numeric(data_df["Type"].astype(str), errors="coerce")
    is_mt = type_codes.gt(low) & type_codes.lt(high)

    data_df = data_df.assign(_row_order=np.arange(len(data_df)))

    # CSEM (and DC, which also has transmitters) keeps the Rx + Tx merge.
    rx_csem_df = reader.ne2latlon(
        reader.rx_data_block_init(blocks["Rx_CSEM"]), geometry_info
    )
    tx_data_df = reader.ne2latlon(
        reader.tx_data_block_init(blocks["Tx"]), geometry_info
    )
    parts = [reader.merge_data_rx_tx(data_df[~is_mt], rx_csem_df, tx_data_df)]

    if is_mt.any():
        rx_mt_df = reader.ne2latlon(
            reader.rx_data_block_init(blocks["Rx_MT"], "MT"), geometry_info
        )
        parts.append(reader.merge_mt_data_rx(data_df[is_mt], rx_mt_df))

    merged_df = pd.concat(parts, ignore_index=True)
    merged_df = merged_df.sort_values("_row_order").drop(columns="_row_order")
    return merged_df.reset_index(drop=True)


def _pick_uploaded_file(extensions):
    """Find the single uploaded file and validate its extension.

    Args:
        extensions: Accepted file suffixes, e.g. ``(".data", ".resp")``.

    Returns:
        A ``(file, error)`` tuple. Exactly one of the two is ``None``; the
        error is a ready-to-return ``(response, status)`` tuple.
    """
    accepted = "/".join(extensions)
    file = next(
        (request.files[key] for key in request.files if "file" in key),
        None,
    )
    if file is None:
        return None, _error_response(
            "No file was included in the request.",
            hint=f"Attach a {accepted} file and try again.",
        )
    if not file.filename:
        return None, _error_response(
            "The selected file has no name.",
            hint=f"Pick a {accepted} file from disk and try again.",
        )
    if not file.filename.endswith(tuple(extensions)):
        return None, _error_response(
            f"Invalid file format: {file.filename}.",
            hint=f"Supported formats: {accepted}.",
        )
    return file, None


def _parse_csem_datafile(path):
    csem_datafile_reader = CSEMDataFileReader(path)
    # Ensure blocks are in the correct order for frontend
    ordered_blocks = {}
    for block_name in csem_datafile_reader.block_infos:
        if block_name in csem_datafile_reader.blocks:
            ordered_blocks[block_name] = csem_datafile_reader.blocks[block_name]
    csem_data = ordered_blocks
    geometry_info = csem_datafile_reader.extract_geometry_info()
    data_df = csem_datafile_reader.data_block_init(csem_data["Data"])
    if csem_datafile_reader.data_type == "joint":
        data_rx_tx_df = _merge_joint_data(csem_datafile_reader, csem_data, data_df, geometry_info)
    elif csem_datafile_reader.data_type == "CSEM":
        rx_data_df = csem_datafile_reader.rx_data_block_init(csem_data["Rx"])
        rx_data_lonlat_df = csem_datafile_reader.ne2latlon(rx_data_df, geometry_info)
        tx_data_df = csem_datafile_reader.tx_data_block_init(csem_data["Tx"])
        tx_data_lonlat_df = csem_datafile_reader.ne2latlon(tx_data_df, geometry_info)
        data_rx_tx_df = csem_datafile_reader.merge_data_rx_tx(
            data_df,
            rx_data_lonlat_df,
            tx_data_lonlat_df,
        )
    elif csem_datafile_reader.data_type == "MT":
        rx_data_df = csem_datafile_reader.rx_data_block_init(csem_data["Rx"], "MT")
        rx_data_lonlat_df = csem_datafile_reader.ne2latlon(rx_data_df, geometry_info)
        data_rx_tx_df = csem_datafile_reader.merge_mt_data_rx(
            data_df,
            rx_data_lonlat_df,
        )
    else:
        raise ValueError(f"Invalid data type: {csem_datafile_reader.data_type}")
    data_js = csem_datafile_reader.df_to_json(data_rx_tx_df)
    return geometry_info, data_js, csem_data


def _json_safe_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json_safe_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe_value(item) for item in value]
    if isinstance(value, (str, bytes, bytearray)):
        return value
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return _json_safe_value(value.tolist())
    if hasattr(value, "tolist"):
        return _json_safe_value(value.tolist())
    return value


def _serialize_poly_model(vertices, segments, holes, regions):
    ordered_vertices = [
        {
            "id": vertex_id,
            "hCoor": vertex["hCoor"],
            "vCoor": vertex["vCoor"],
            "attributes": vertex.get("attributes", []),
            "boundary_marker": vertex.get("boundary_marker"),
        }
        for vertex_id, vertex in sorted(vertices.items())
    ]
    ordered_segments = [
        {
            "id": segment["id"],
            "endpoint_1": segment["endpoint_1"],
            "endpoint_2": segment["endpoint_2"],
            "boundary_marker": segment.get("boundary_marker"),
        }
        for segment in sorted(segments, key=lambda item: item["id"])
    ]
    ordered_holes = [
        {
            "id": hole["id"],
            "hCoor": hole["hCoor"],
            "vCoor": hole["vCoor"],
        }
        for hole in holes
    ]
    ordered_regions = [
        {
            "id": region["id"],
            "hCoor": region["hCoor"],
            "vCoor": region["vCoor"],
            "attribute": region.get("attribute"),
            "max_area": region.get("max_area"),
        }
        for region in (regions or [])
    ]
    return ordered_vertices, ordered_segments, ordered_holes, ordered_regions


def _serialize_resistivity_model(parsed_resistivity):
    if parsed_resistivity is None:
        return None

    metadata = {}
    for key, value in parsed_resistivity.items():
        if key == "table":
            continue
        if isinstance(value, dict) and "value" in value:
            metadata[key] = _json_safe_value(value["value"])

    resistivity_table = parsed_resistivity.get("table")
    table = []
    if resistivity_table is not None:
        table = [
            {column: _json_safe_value(row[column]) for column in resistivity_table.columns}
            for _, row in resistivity_table.iterrows()
        ]

    return {
        "metadata": metadata,
        "table": table,
    }


# Maps a normalized rho column name to the component key used in the API
# payload. Anisotropic (tiz) files name the horizontal component "Rho-h" or
# "Rho-xy" depending on the MARE2DEM version; both are the same quantity.
_RESISTIVITY_COMPONENT_KEYS = {
    "rho": "rho",
    "rho-z": "rhoZ",
    "rho-h": "rhoH",
    "rho-xy": "rhoH",
}
_REGION_COLUMN_NAMES = {"region", "#", "!#"}


def _normalize_resistivity_column(column):
    return str(column).strip().lower().replace("_", "-")


def _detect_resistivity_components(resistivity_table):
    """List the rho columns of a resistivity table, in file order.

    Isotropic files yield a single "rho" component; anisotropic ones yield the
    vertical and horizontal components separately.
    """
    components = []
    seen_keys = set()

    for column in resistivity_table.columns:
        key = _RESISTIVITY_COMPONENT_KEYS.get(_normalize_resistivity_column(column))
        if key is None or key in seen_keys:
            continue
        seen_keys.add(key)
        components.append(
            {
                "key": key,
                "label": str(column).strip(),
                "column": str(column),
            }
        )

    return components


def _build_region_resistivity_lookup(parsed_resistivity):
    """Map each region id to its rho components, e.g. {1: {"rhoZ": 8.8, "rhoH": 1.4}}."""
    if parsed_resistivity is None:
        return {}, []

    resistivity_table = parsed_resistivity.get("table")
    if resistivity_table is None or len(resistivity_table.columns) == 0:
        return {}, []

    components = _detect_resistivity_components(resistivity_table)
    if not components:
        return {}, []

    region_column = next(
        (
            column
            for column in resistivity_table.columns
            if _normalize_resistivity_column(column) in _REGION_COLUMN_NAMES
        ),
        resistivity_table.columns[0],
    )

    lookup = {}
    for _, row in resistivity_table.iterrows():
        try:
            region_id = int(float(row[region_column]))
        except (TypeError, ValueError):
            continue

        values = {}
        for component in components:
            try:
                values[component["key"]] = float(row[component["column"]])
            except (TypeError, ValueError):
                continue

        if values:
            lookup[region_id] = values

    return lookup, components


def _serialize_constrained_mesh(poly_parser, vertices, segments, regions, parsed_resistivity):
    triangles, mesh_vertices, _ = poly_parser.create_constrained_delaunay(vertices, segments)
    ordered_vertex_ids = sorted(mesh_vertices.keys())
    vertex_index_by_id = {
        vertex_id: index for index, vertex_id in enumerate(ordered_vertex_ids)
    }
    ordered_vertices = [
        {
            "id": index,
            "x": _json_safe_value(mesh_vertices[vertex_id]["hCoor"]),
            "y": _json_safe_value(mesh_vertices[vertex_id]["vCoor"]),
        }
        for index, vertex_id in enumerate(ordered_vertex_ids)
    ]

    ordered_triangles = [
        [vertex_index_by_id[int(vertex_id)] for vertex_id in triangle]
        for triangle in triangles
    ]

    triangle_region_ids = [None] * len(ordered_triangles)
    triangle_resistivity_values = [None] * len(ordered_triangles)
    region_lookup, components = _build_region_resistivity_lookup(parsed_resistivity)
    # The first rho column drives the initial render and is the one
    # triangle_resistivity_export writes back to by default.
    primary_key = components[0]["key"] if components else None
    region_resistivity = []

    if regions:
        triangle_region_numbers, region_index = poly_parser.get_triangle_regions(regions)
        seen_region_ids = set()

        for triangle_index, region_number in enumerate(triangle_region_numbers):
            region_number = int(region_number)
            if region_number <= 0 or region_number - 1 >= len(region_index):
                continue

            original_region = regions[int(region_index[region_number - 1])]
            original_region_id = original_region.get("attribute") or original_region["id"]
            original_region_id = int(original_region_id)
            triangle_region_ids[triangle_index] = original_region_id
            component_values = region_lookup.get(original_region_id)
            if component_values is None or primary_key not in component_values:
                continue

            triangle_resistivity_values[triangle_index] = component_values[primary_key]
            if original_region_id not in seen_region_ids:
                region_resistivity.append(
                    {
                        "regionId": original_region_id,
                        "rho": component_values[primary_key],
                        **component_values,
                    }
                )
                seen_region_ids.add(original_region_id)

    return {
        "vertices": ordered_vertices,
        "triangles": ordered_triangles,
        "triangleRegionIds": triangle_region_ids,
        "triangleResistivityValues": triangle_resistivity_values,
        "resistivityComponents": components,
        "regionResistivity": sorted(
            region_resistivity, key=lambda item: item["regionId"]
        ),
    }


@app.route("/api/upload-xyz", methods=["POST"])
def upload_xyz_file():
    file, error = _pick_uploaded_file((".xyz",))
    if error is not None:
        return error

    try:
        with _upload_workspace() as temp_dir:
            path = _save_uploaded_file(file, temp_dir)
            xyz_datafile_reader = XYZDataFileReader(path)
            xyz_datafile_reader.read_file()
            xyz_datafile_reader.add_distance()
            data_js = xyz_datafile_reader.df_to_json(xyz_datafile_reader.data)
            return jsonify(json.loads(data_js))
    except Exception:
        return _unexpected_error(
            f"Could not read the .xyz file '{file.filename}'.",
            hint=(
                "Check that the file is whitespace-separated with the expected "
                "column count and no stray header rows."
            ),
        )


@app.route("/api/upload-data", methods=["POST"])
def upload_data_file():
    file, error = _pick_uploaded_file((".data", ".emdata", ".resp"))
    if error is not None:
        return error

    try:
        with _upload_workspace() as temp_dir:
            path = _save_uploaded_file(file, temp_dir)
            geometry_info, data_js, csem_data = _parse_csem_datafile(path)
            # Return geometry info, data, and csem data blocks strings
            return jsonify(
                {
                    "geometryInfo": geometry_info,
                    "data": data_js,
                    "dataBlocks": csem_data,
                }
            )
    except Exception:
        return _unexpected_error(
            f"Could not parse '{file.filename}' as a MARE2DEM data file.",
            hint=(
                "Verify the file has the expected Tx/Rx/Data blocks and that "
                "the header format matches MARE2DEM's .data/.emdata/.resp "
                "specification."
            ),
        )


@app.route("/api/upload-triangle-model", methods=["POST"])
def upload_triangle_model_file():
    poly_file = request.files.get("poly_file")
    if poly_file is None:
        return _error_response(
            "No .poly file provided",
            hint="Attach the MARE2DEM .poly model file and try again.",
        )
    if poly_file.filename == "":
        return _error_response(
            "No selected .poly file",
            hint="Pick a .poly file from disk and try again.",
        )
    if not poly_file.filename.endswith(".poly"):
        return _error_response(
            "Invalid .poly file format",
            hint="The model geometry must be a MARE2DEM .poly file.",
        )

    resistivity_file = request.files.get("resistivity_file")
    if (
        resistivity_file is not None
        and resistivity_file.filename != ""
        and not resistivity_file.filename.endswith(".resistivity")
    ):
        return _error_response(
            "Invalid .resistivity file format",
            hint="Resistivity values must come from a .resistivity file.",
        )

    try:
        with _upload_workspace() as temp_dir:
            poly_path = _save_uploaded_file(poly_file, temp_dir)
            poly_parser = MARE2DEMPolyParser()
            vertices, segments, holes, regions = poly_parser.read_poly_file(poly_path)
            (
                ordered_vertices,
                ordered_segments,
                ordered_holes,
                ordered_regions,
            ) = _serialize_poly_model(vertices, segments, holes, regions)

            parsed_resistivity = None
            resistivity_payload = None
            resistivity_file_name = None
            if resistivity_file is not None and resistivity_file.filename != "":
                resistivity_path = _save_uploaded_file(resistivity_file, temp_dir)
                resistivity_parser = ResistivityFileParser()
                parsed_resistivity = resistivity_parser.parse_resistivity_file(
                    resistivity_path, rho_parse=True
                )
                resistivity_payload = _serialize_resistivity_model(parsed_resistivity)
                resistivity_file_name = resistivity_file.filename

            constrained_mesh = _serialize_constrained_mesh(
                poly_parser,
                vertices,
                segments,
                regions,
                parsed_resistivity,
            )

            return jsonify(
                {
                    "polyFileName": poly_file.filename,
                    "resistivityFileName": resistivity_file_name,
                    "vertices": ordered_vertices,
                    "segments": ordered_segments,
                    "holes": ordered_holes,
                    "regions": ordered_regions,
                    "resistivity": resistivity_payload,
                    "constrainedMesh": constrained_mesh,
                }
            )
    except Exception:
        return _unexpected_error(
            f"Could not build the triangle model from '{poly_file.filename}'.",
            hint=(
                "Check that the .poly vertex/segment/region counts in the "
                "header match the rows that follow, and that the optional "
                ".resistivity file lists the same region ids."
            ),
        )


def _read_resegmentation_request(include_export_text):
    poly_file = request.files.get("poly_file")
    if poly_file is None:
        raise ResegmentationError("No .poly file provided")
    if poly_file.filename == "":
        raise ResegmentationError("No selected .poly file")
    if not poly_file.filename.endswith(".poly"):
        raise ResegmentationError("Invalid .poly file format")

    resistivity_file = request.files.get("resistivity_file")
    if resistivity_file is None:
        raise ResegmentationError("No .resistivity file provided")
    if resistivity_file.filename == "":
        raise ResegmentationError("No selected .resistivity file")
    if not resistivity_file.filename.endswith(".resistivity"):
        raise ResegmentationError("Invalid .resistivity file format")

    raw_parameters = request.form.get("parameters")
    if raw_parameters is None:
        raise ResegmentationError("No resegmentation parameters provided")

    try:
        parameters = parse_resegmentation_parameters(json.loads(raw_parameters))
    except json.JSONDecodeError as exc:
        raise ResegmentationError("Invalid resegmentation parameters JSON") from exc

    with _upload_workspace() as temp_dir:
        poly_path = _save_uploaded_file(poly_file, temp_dir)
        resistivity_path = _save_uploaded_file(resistivity_file, temp_dir)

        poly_parser = MARE2DEMPolyParser()
        vertices, segments, holes, regions = poly_parser.read_poly_file(
            poly_path, unit_scale_factor=1
        )

        resistivity_parser = ResistivityFileParser()
        parsed_resistivity = resistivity_parser.parse_resistivity_file(
            resistivity_path, rho_parse=True
        )

    original_name = secure_filename(poly_file.filename) or "model.poly"
    stem, _ = os.path.splitext(original_name)
    output_poly_file_name = f"{stem}.resegmented.poly"

    return build_resegmentation_result(
        poly_parser,
        vertices,
        segments,
        holes,
        regions,
        parsed_resistivity,
        parameters,
        output_poly_file_name,
        include_export_text=include_export_text,
    )


_RESEGMENTATION_HINT = (
    "Check that the .poly and .resistivity files come from the same model and "
    "that the segmentation parameters are within the model's value range."
)


@app.route("/api/preview-triangle-resegmentation", methods=["POST"])
def preview_triangle_resegmentation():
    try:
        return jsonify(_read_resegmentation_request(include_export_text=False))
    except ResegmentationError as exc:
        return _error_response(str(exc), hint=_RESEGMENTATION_HINT)
    except Exception:
        return _unexpected_error(
            "Could not preview the resegmented model.",
            hint=_RESEGMENTATION_HINT,
        )


@app.route("/api/export-triangle-resegmentation", methods=["POST"])
def export_triangle_resegmentation():
    try:
        return jsonify(_read_resegmentation_request(include_export_text=True))
    except ResegmentationError as exc:
        return _error_response(str(exc), hint=_RESEGMENTATION_HINT)
    except Exception:
        return _unexpected_error(
            "Could not export the resegmented model.",
            hint=_RESEGMENTATION_HINT,
        )


@app.route("/api/export-triangle-resistivity", methods=["POST"])
def export_triangle_resistivity_file():
    resistivity_file = request.files.get("resistivity_file")
    if resistivity_file is None:
        return _error_response(
            "No .resistivity file provided",
            hint="Re-upload the original .resistivity file before exporting.",
        )
    if resistivity_file.filename == "":
        return _error_response(
            "No selected .resistivity file",
            hint="Pick the original .resistivity file and try again.",
        )
    if not resistivity_file.filename.endswith(".resistivity"):
        return _error_response(
            "Invalid .resistivity file format",
            hint="The export needs the original MARE2DEM .resistivity file.",
        )

    raw_updates = request.form.get("region_rho_updates")
    updates_file = request.files.get("region_rho_updates")
    if raw_updates is None and updates_file is not None:
        try:
            raw_updates = updates_file.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            return _error_response(
                "Could not decode region rho updates as UTF-8",
                hint="Re-apply the edits in the viewer and export again.",
            )
    if raw_updates is None:
        return _error_response(
            "No region rho updates provided",
            hint="Edit at least one region's resistivity before exporting.",
        )

    try:
        source_text = resistivity_file.read().decode("utf-8-sig")
        exported_text = build_exported_resistivity_text(source_text, raw_updates)
        original_name = secure_filename(resistivity_file.filename) or "model.resistivity"
        stem, _ = os.path.splitext(original_name)
        download_name = f"{stem}.edited.resistivity"

        response = app.response_class(exported_text, mimetype="text/plain")
        response.headers["Content-Disposition"] = (
            f'attachment; filename="{download_name}"'
        )
        return response
    except UnicodeDecodeError:
        return _error_response(
            "Could not decode .resistivity file as UTF-8",
            hint="Re-save the file with UTF-8 encoding and try again.",
        )
    except ResistivityExportError as exc:
        return _error_response(
            str(exc),
            hint=(
                "Make sure the edited regions still exist in the uploaded "
                ".resistivity file."
            ),
        )
    except Exception:
        return _unexpected_error(
            "Could not write the edited .resistivity file.",
            hint=(
                "Re-upload the original .resistivity file and re-apply the "
                "edits, then export again."
            ),
        )


@app.route("/api/upload-multiple-data", methods=["POST"])
def upload_multiple_data_files():
    if "files" not in request.files:
        return _error_response(
            "No files part",
            hint="Attach one or more .data/.emdata/.resp files and try again.",
        )

    files = request.files.getlist("files")
    if not files:
        return _error_response(
            "No files selected",
            hint="Pick at least one .data/.emdata/.resp file from disk.",
        )

    datasets = []
    for file in files:
        if file.filename == "":
            return _error_response(
                "No selected file",
                hint="One of the dropped items has no file name; re-add it.",
            )

        if not file.filename.endswith((".data", ".emdata", ".resp")):
            return _error_response(
                f"Invalid file format: {file.filename}.",
                hint="Supported formats: .data, .emdata, .resp.",
            )

        try:
            with _upload_workspace() as temp_dir:
                path = _save_uploaded_file(file, temp_dir)
                geometry_info, data_js, csem_data = _parse_csem_datafile(path)
            datasets.append(
                {
                    "id": uuid.uuid4().hex,
                    "name": file.filename,
                    "geometryInfo": geometry_info,
                    "data": data_js,
                    "dataBlocks": csem_data,
                }
            )
        except Exception:
            return _unexpected_error(
                f"Could not parse '{file.filename}' as a MARE2DEM data file.",
                hint=(
                    "Verify the file has the expected Tx/Rx/Data blocks and "
                    "that the header format matches MARE2DEM's "
                    ".data/.emdata/.resp specification."
                ),
            )

    return jsonify(datasets)


@app.route("/api/load-sample-data", methods=["POST"])
def load_sample_data_files():
    payload = request.get_json(silent=True) or {}
    files = payload.get("files", [])
    if not isinstance(files, list) or not files:
        return _error_response(
            "No sample files specified",
            hint="Pick at least one bundled sample dataset.",
        )

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_data"))
    datasets = []
    for filename in files:
        if not isinstance(filename, str) or filename == "":
            return _error_response(
                "Invalid file name",
                hint="Sample file names must be non-empty strings.",
            )

        if not filename.endswith((".data", ".emdata", ".resp")):
            return _error_response(
                f"Invalid file format: {filename}.",
                hint="Supported formats: .data, .emdata, .resp.",
            )

        file_path = os.path.abspath(os.path.join(base_dir, filename))
        if not file_path.startswith(base_dir + os.sep):
            return _error_response(
                f"Invalid file path: {filename}",
                hint="Sample files must live directly in backend/test_data.",
            )
        if not os.path.exists(file_path):
            return _error_response(
                f"File not found: {filename}",
                hint="Refresh the sample list; this dataset is not installed.",
                status=404,
            )

        try:
            geometry_info, data_js, csem_data = _parse_csem_datafile(file_path)
            datasets.append(
                {
                    "id": uuid.uuid4().hex,
                    "name": filename,
                    "geometryInfo": geometry_info,
                    "data": data_js,
                    "dataBlocks": csem_data,
                }
            )
        except Exception:
            return _unexpected_error(
                f"Could not parse the bundled sample '{filename}'.",
                hint=(
                    "The installed sample data may be truncated; reinstall "
                    "the backend test_data directory."
                ),
            )

    return jsonify(datasets)


@app.route("/api/write-data-file", methods=["POST"])
def write_data_file():
    # Flask-CORS answers the OPTIONS preflight for the allowed origins.
    payload = request.get_json(silent=True) or {}
    content = payload.get("content")
    csem_data = payload.get("dataBlocks")

    if not content:
        return _error_response(
            "No content provided for export.",
            hint="Load a dataset and clear filters that hide every row.",
        )
    if not csem_data:
        return _error_response(
            "No dataBlocks provided for export.",
            hint=(
                "The original file header is missing; re-upload the source "
                "data file before exporting."
            ),
        )

    try:
        csem_datafile_manager = CSEMDataFileManager()
        data_df_from_content = csem_datafile_manager.json_to_df(content)
        updated_blocks = csem_datafile_manager.update_blocks(
            data_df_from_content, csem_data
        )
        datafile_str = csem_datafile_manager.blocks_to_str(updated_blocks)

        return jsonify(datafile_str)
    except Exception:
        return _unexpected_error(
            "Could not rebuild the data file from the current table.",
            hint=(
                "Reset the column filters and try again; edited columns must "
                "keep the original data types."
            ),
        )


@app.route("/api/upload-mat", methods=["POST"])
def upload_mat_file():
    file, error = _pick_uploaded_file((".mat",))
    if error is not None:
        return error

    try:
        with _upload_workspace() as temp_dir:
            path = _save_uploaded_file(file, temp_dir)
            return process_SuesiDepth_mat_file(path)
    except Exception:
        return _unexpected_error(
            f"Could not read the SUESI depth file '{file.filename}'.",
            hint=(
                "The .mat file must be a SUESI depth log containing the "
                "expected time and depth variables."
            ),
        )


@app.route("/api/upload-bathymetry", methods=["POST"])
def upload_bathymetry_file():
    file, error = _pick_uploaded_file((".txt",))
    if error is not None:
        return error

    try:
        with _upload_workspace() as temp_dir:
            path = _save_uploaded_file(file, temp_dir)

            bathymetry_parser = BathymetryParser()
            result = bathymetry_parser.parse_file(path)

            if result["success"]:
                return jsonify(result)
            return _error_response(
                result["message"],
                hint=(
                    "The file should contain two numeric columns: inline "
                    "distance and depth."
                ),
            )
    except Exception:
        return _unexpected_error(
            f"Could not read the bathymetry file '{file.filename}'.",
            hint=(
                "The file should contain two numeric columns: inline distance "
                "and depth."
            ),
        )


@app.route("/api/misfit_stats", methods=["POST"])
def calculate_misfit_stats():
    """
    Calculate RMS statistics from CSEM data residuals.
    Groups by Type, Y_rx, Y_tx, Y_range, and Frequency.
    """
    try:
        try:
            payload = request.get_json(silent=True) or {}
        except ClientDisconnected:
            app.logger.info("Client disconnected during /api/misfit_stats")
            return ("", 204)

        if "datasets" in payload:
            datasets = payload.get("datasets", [])
            if not datasets:
                return _error_response(
                    "No data provided",
                    hint="Make at least one dataset visible to compute misfits.",
                )

            results = {}
            errors = {}
            for index, entry in enumerate(datasets):
                dataset_id = entry.get("id")
                dataset_key = dataset_id or f"index_{index}"
                data_array = entry.get("data", [])
                if not data_array:
                    errors[dataset_key] = "No data provided"
                    continue

                try:
                    results[dataset_key] = calculate_misfit_statistics(data_array)
                except ValueError as e:
                    errors[dataset_key] = str(e)

            response = {"results": results}
            if errors:
                response["errors"] = errors
            return jsonify(response)

        data_array = payload.get("data", [])
        if not data_array:
            return _error_response(
                "No data provided",
                hint="Load a .resp dataset that contains residual values.",
            )

        result = calculate_misfit_statistics(data_array)
        return jsonify(result)

    except ValueError as e:
        return _error_response(
            str(e),
            hint=(
                "Misfit statistics need Type, Residual, Freq and Rx/Tx "
                "position columns; load a .resp file from an inversion."
            ),
        )
    except Exception:
        return _unexpected_error(
            "Could not calculate misfit statistics.",
            hint="Reload the dataset and try again.",
        )


#: /api/upload-triangle-model reads a .poly with read_poly_file's default
#: unit_scale_factor of 1e-3, so every model the viewer holds is in kilometres.
#: The penalty cut merge has to run in metres -- that is the unit the .poly and
#: the interface file are written in -- so the display payload is converted
#: afterwards. The exported text stays in metres.
_DISPLAY_UNIT_SCALE = 1e-3


def _scale_model_for_display(vertices, segments, regions, scale=_DISPLAY_UNIT_SCALE):
    """Copy a parsed model with coordinates scaled, leaving the original alone."""
    scaled_vertices = {
        vertex_id: {**vertex, "hCoor": vertex["hCoor"] * scale, "vCoor": vertex["vCoor"] * scale}
        for vertex_id, vertex in vertices.items()
    }
    scaled_regions = [
        {**region, "hCoor": region["hCoor"] * scale, "vCoor": region["vCoor"] * scale}
        for region in (regions or [])
    ]
    return scaled_vertices, list(segments), scaled_regions


_PENALTY_CUT_HINT = (
    "The interface file must hold two columns 'y z' (whitespace or comma "
    "separated, '#' comments allowed), in the same along-line/depth frame as "
    "the model. Check the units setting if the line lands in the wrong place."
)


@app.route("/api/parse-interface", methods=["POST"])
def parse_interface_file():
    """Parse an interface file and say where it would land, without merging.

    Deliberately cheap: this runs when the user drops a file, so a unit mistake
    shows up as a line drawn in the wrong place rather than after a multi-second
    merge. The model itself is not uploaded -- the client already has it, and
    sends only its bounding box for the sanity checks.
    """
    cut_file = request.files.get("cut_file")
    if cut_file is None or cut_file.filename == "":
        return _error_response(
            "No interface file provided",
            hint=_PENALTY_CUT_HINT,
        )

    try:
        raw_parameters = request.form.get("parameters") or "{}"
        payload = json.loads(raw_parameters)
        parameters = parse_penalty_cut_parameters(payload)
        bounds = (
            parse_model_bounds(payload["modelBounds"])
            if isinstance(payload, dict) and payload.get("modelBounds")
            else None
        )
        text = cut_file.read().decode("utf-8", errors="replace")
        result = parse_interface(text, parameters, bounds)
    except json.JSONDecodeError:
        return _error_response(
            "Invalid penalty cut parameters JSON", hint=_PENALTY_CUT_HINT
        )
    except PenaltyCutError as exc:
        return _error_response(str(exc), hint=_PENALTY_CUT_HINT)
    except Exception:
        return _unexpected_error(
            f"Could not read the interface file '{cut_file.filename}'.",
            hint=_PENALTY_CUT_HINT,
        )

    result["cutFileName"] = cut_file.filename
    return jsonify(result)


@app.route("/api/apply-penalty-cut", methods=["POST"])
def apply_penalty_cut_to_model():
    """Merge an interface into a model as penalty cuts and rebuild its resistivity.

    Returns the merged model in the same shape as ``/api/upload-triangle-model``
    so the viewer can swap it in directly, plus the text of both output files
    for download.
    """
    poly_file = request.files.get("poly_file")
    resistivity_file = request.files.get("resistivity_file")
    cut_file = request.files.get("cut_file")

    for label, uploaded, suffix in (
        (".poly model", poly_file, ".poly"),
        (".resistivity file", resistivity_file, ".resistivity"),
        ("interface file", cut_file, None),
    ):
        if uploaded is None or uploaded.filename == "":
            return _error_response(
                f"No {label} provided", hint=_PENALTY_CUT_HINT
            )
        if suffix and not uploaded.filename.endswith(suffix):
            return _error_response(
                f"Invalid {label} format; expected a {suffix} file",
                hint=_PENALTY_CUT_HINT,
            )

    try:
        parameters = parse_penalty_cut_parameters(
            json.loads(request.form.get("parameters") or "{}")
        )
    except json.JSONDecodeError:
        return _error_response(
            "Invalid penalty cut parameters JSON", hint=_PENALTY_CUT_HINT
        )
    except PenaltyCutError as exc:
        return _error_response(str(exc), hint=_PENALTY_CUT_HINT)

    stem, _ = os.path.splitext(secure_filename(poly_file.filename) or "model.poly")
    # Cuts stack: the viewer feeds a merged model straight back in to add a
    # second interface. Marking an already-cut model again would grow the name
    # a suffix per interface -- line1.cut.cut.cut.poly -- for no added meaning.
    if not stem.endswith(".cut"):
        stem = f"{stem}.cut"
    output_poly_name = f"{stem}.poly"
    output_resistivity_name = f"{stem}.0.resistivity"

    try:
        with _upload_workspace() as temp_dir:
            poly_path = _save_uploaded_file(poly_file, temp_dir)
            resistivity_path = _save_uploaded_file(resistivity_file, temp_dir)

            poly_parser = MARE2DEMPolyParser()
            vertices, segments, holes, regions = poly_parser.read_poly_file(
                poly_path, unit_scale_factor=1
            )

            resistivity_parser = ResistivityFileParser()
            parsed_resistivity = resistivity_parser.parse_resistivity_file(
                resistivity_path, rho_parse=True
            )

            with open(resistivity_path, "r", encoding="utf-8") as handle:
                resistivity_text = handle.read()

            cut_text = cut_file.read().decode("utf-8", errors="replace")

        result = apply_penalty_cut(
            vertices,
            segments,
            holes,
            regions,
            parsed_resistivity.get("table"),
            resistivity_text,
            cut_text,
            parameters,
            output_poly_name,
        )
    except PenaltyCutError as exc:
        return _error_response(str(exc), hint=_PENALTY_CUT_HINT)
    except RegionInheritanceError as exc:
        return _error_response(str(exc), hint=_PENALTY_CUT_HINT)
    except Exception:
        return _unexpected_error(
            "Could not apply the penalty cut to this model.",
            hint=_PENALTY_CUT_HINT,
        )

    try:
        # The merge ran in metres; the viewer speaks kilometres.
        display_vertices, display_segments, display_regions = _scale_model_for_display(
            result["vertices"], result["segments"], result["regions"]
        )
        display_holes = [
            {**hole, "hCoor": hole["hCoor"] * _DISPLAY_UNIT_SCALE,
             "vCoor": hole["vCoor"] * _DISPLAY_UNIT_SCALE}
            for hole in (result["holes"] or [])
        ]
        (
            ordered_vertices,
            ordered_segments,
            ordered_holes,
            ordered_regions,
        ) = _serialize_poly_model(
            display_vertices, display_segments, display_holes, display_regions
        )

        # Parse the resistivity text we just generated rather than reusing the
        # in-memory table: what the viewer colours by is then exactly what the
        # user downloads, and a formatting bug shows up here instead of in an
        # inversion run.
        with _upload_workspace() as temp_dir:
            derived_path = os.path.join(temp_dir, output_resistivity_name)
            with open(derived_path, "w", encoding="utf-8") as handle:
                handle.write(result["resistivityText"])
            merged_resistivity = resistivity_parser.parse_resistivity_file(
                derived_path, rho_parse=True
            )

        constrained_mesh = _serialize_constrained_mesh(
            MARE2DEMPolyParser(),
            display_vertices,
            display_segments,
            display_regions,
            merged_resistivity,
        )
    except Exception:
        return _unexpected_error(
            "The penalty cut was applied but the merged mesh could not be built "
            "for display.",
            hint=_PENALTY_CUT_HINT,
        )

    return jsonify(
        {
            "polyFileName": output_poly_name,
            "resistivityFileName": output_resistivity_name,
            "vertices": ordered_vertices,
            "segments": ordered_segments,
            "holes": ordered_holes,
            "regions": ordered_regions,
            "resistivity": _serialize_resistivity_model(merged_resistivity),
            "constrainedMesh": constrained_mesh,
            "polyText": result["polyText"],
            "resistivityText": result["resistivityText"],
            "stats": result["stats"],
            "warnings": result["warnings"],
        }
    )


_RHO_BOUND_HINT = (
    "A boundary or polygon is two columns 'y z' (whitespace or comma "
    "separated, '#' comments allowed) in the same along-line/depth frame as "
    "the model, or the same points as JSON in the parameters. Check the units "
    "setting if the shape lands in the wrong place."
)


def _read_rho_bound_request():
    """Pull the parameters and the shape out of a bounds request.

    The shape arrives either as an uploaded two-column file or as JSON points
    in the parameters, so a polygon drawn in the viewer and one read from disk
    reach the same code.

    Returns:
        ``(parameters, points)`` with points in metres.

    Raises:
        RhoBoundError: On invalid parameters, a bad shape, or no shape at all.
    """
    try:
        payload = json.loads(request.form.get("parameters") or "{}")
    except json.JSONDecodeError as exc:
        raise RhoBoundError("Invalid rho bound parameters JSON") from exc

    parameters = parse_rho_bound_parameters(payload)

    shape_file = request.files.get("shape_file")
    if shape_file is not None and shape_file.filename != "":
        text = shape_file.read().decode("utf-8", errors="replace")
        return parameters, parse_shape_text(text, parameters)

    raw_points = payload.get("points") if isinstance(payload, dict) else None
    if raw_points is None:
        raise RhoBoundError(
            "No shape provided: upload a two-column 'y z' file as shape_file, "
            "or pass its points in the parameters."
        )
    return parameters, parse_shape_points(raw_points, parameters)


def _shape_payload(points, parameters, selection, warnings):
    return {
        "shape": parameters.shape,
        "side": parameters.side,
        "points": [[y, z] for y, z in points],
        "selectedRegionIds": selection.region_ids,
        "stats": {
            "shapePointCount": len(points),
            "selectedRegionCount": len(selection.region_ids),
            "totalRegionCount": selection.total_count,
            "outsideShapeSpanCount": selection.outside_span_count,
        },
        "warnings": warnings,
    }


def _rho_bound_warnings(points, vertices, selection, parameters):
    warnings = check_shape_against_bounds(
        points,
        {
            "yMin": min(vertex["hCoor"] for vertex in vertices.values()),
            "yMax": max(vertex["hCoor"] for vertex in vertices.values()),
            "zMin": min(vertex["vCoor"] for vertex in vertices.values()),
            "zMax": max(vertex["vCoor"] for vertex in vertices.values()),
        },
    )
    if selection.outside_span_count:
        warnings.append(
            f"{selection.outside_span_count} of {selection.total_count} regions "
            "sit beyond the ends of the boundary and were left alone. A "
            "boundary is not extrapolated past its last point."
        )
    if not selection.region_ids:
        warnings.append(
            f"The {parameters.shape} selected no regions. Check the units and, "
            "for a boundary, which side you meant."
        )
    return warnings


@app.route("/api/preview-rho-bounds", methods=["POST"])
def preview_rho_bounds():
    """Say which regions a boundary or polygon would bound, without writing.

    The .resistivity is not needed to answer that, and it is the file the user
    is about to overwrite -- so the question "how much of my model does this
    touch" can be asked without putting it at risk.
    """
    poly_file = request.files.get("poly_file")
    if poly_file is None or poly_file.filename == "":
        return _error_response("No .poly file provided", hint=_RHO_BOUND_HINT)
    if not poly_file.filename.endswith(".poly"):
        return _error_response(
            "Invalid .poly file format; expected a .poly file", hint=_RHO_BOUND_HINT
        )

    try:
        parameters, points = _read_rho_bound_request()

        with _upload_workspace() as temp_dir:
            poly_path = _save_uploaded_file(poly_file, temp_dir)
            vertices, _, _, regions = MARE2DEMPolyParser().read_poly_file(
                poly_path, unit_scale_factor=1
            )

        selection = select_regions(regions, points, parameters)
    except RhoBoundError as exc:
        return _error_response(str(exc), hint=_RHO_BOUND_HINT)
    except Exception:
        return _unexpected_error(
            "Could not work out which regions the shape covers.",
            hint=_RHO_BOUND_HINT,
        )

    warnings = _rho_bound_warnings(points, vertices, selection, parameters)
    return jsonify(_shape_payload(points, parameters, selection, warnings))


@app.route("/api/apply-rho-bounds", methods=["POST"])
def apply_rho_bounds():
    """Write Lower/Upper bounds onto the regions a boundary or polygon covers.

    Only those two columns change. The mesh is untouched, so this composes with
    a penalty cut in either order, and the rho values stay where the inversion
    left them.
    """
    poly_file = request.files.get("poly_file")
    resistivity_file = request.files.get("resistivity_file")

    for label, uploaded, suffix in (
        (".poly model", poly_file, ".poly"),
        (".resistivity file", resistivity_file, ".resistivity"),
    ):
        if uploaded is None or uploaded.filename == "":
            return _error_response(f"No {label} provided", hint=_RHO_BOUND_HINT)
        if not uploaded.filename.endswith(suffix):
            return _error_response(
                f"Invalid {label} format; expected a {suffix} file",
                hint=_RHO_BOUND_HINT,
            )

    stem, _ = os.path.splitext(
        secure_filename(resistivity_file.filename) or "model.resistivity"
    )
    output_name = f"{stem}.bounded.resistivity"

    try:
        parameters, points = _read_rho_bound_request()
        resistivity_text = resistivity_file.read().decode("utf-8-sig")

        with _upload_workspace() as temp_dir:
            poly_path = _save_uploaded_file(poly_file, temp_dir)
            vertices, _, _, regions = MARE2DEMPolyParser().read_poly_file(
                poly_path, unit_scale_factor=1
            )

        selection = select_regions(regions, points, parameters)
        bounded_text, bound_stats = build_bounded_resistivity_text(
            resistivity_text, selection.region_ids, parameters
        )
    except RhoBoundError as exc:
        return _error_response(str(exc), hint=_RHO_BOUND_HINT)
    except UnicodeDecodeError:
        return _error_response(
            "Could not decode the .resistivity file as UTF-8",
            hint="Re-export it from MARE2DEM and try again.",
        )
    except Exception:
        return _unexpected_error(
            "Could not apply the bounds to this model.", hint=_RHO_BOUND_HINT
        )

    payload = _shape_payload(
        points,
        parameters,
        selection,
        _rho_bound_warnings(points, vertices, selection, parameters),
    )
    payload["stats"].update(bound_stats)
    payload["resistivityFileName"] = output_name
    payload["resistivityText"] = bounded_text
    return jsonify(payload)


if __name__ == "__main__":
    _start_parent_watchdog(_get_parent_pid())
    # Bind to loopback only: this API is for the local frontend, not the network.
    app.run(host="127.0.0.1", debug=_get_debug_flag(), port=_get_port())
