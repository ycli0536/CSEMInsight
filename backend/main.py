import traceback
import os
import tempfile
import uuid
import json
from datetime import datetime
from typing import List
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.exceptions import ClientDisconnected
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
    parse_region_rho_updates,
)
from triangle_model_resegmentation import (
    ResegmentationError,
    build_resegmentation_result,
    parse_resegmentation_parameters,
)

app = Flask(__name__)
CORS(app)
# Disable sorting of keys in JSON responses
app.config["JSON_SORT_KEYS"] = False


def _get_debug_flag() -> bool:
    raw_value = os.getenv("CSEMINSIGHT_DEBUG") or os.getenv("FLASK_DEBUG") or ""
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _save_uploaded_file(file, temp_dir: str) -> str:
    safe_name = secure_filename(file.filename or "")
    if not safe_name:
        safe_name = "upload"
    stem, ext = os.path.splitext(safe_name)
    unique_name = f"{stem}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(temp_dir, unique_name)
    file.save(path)
    return path


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


def _build_region_resistivity_lookup(parsed_resistivity):
    if parsed_resistivity is None:
        return {}

    resistivity_table = parsed_resistivity.get("table")
    if resistivity_table is None or len(resistivity_table.columns) == 0:
        return {}

    region_column = None
    rho_column = None

    for column in resistivity_table.columns:
        normalized = str(column).strip().lower()
        if normalized in {"region", "#", "!#"}:
            region_column = column
        if normalized in {"rho", "rho-z", "rho_h", "rho-h"}:
            rho_column = column

    if region_column is None:
        region_column = resistivity_table.columns[0]
    if rho_column is None:
        return {}

    lookup = {}
    for _, row in resistivity_table.iterrows():
        try:
            region_id = int(float(row[region_column]))
            rho_value = float(row[rho_column])
        except (TypeError, ValueError):
            continue
        lookup[region_id] = rho_value

    return lookup


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
    region_lookup = _build_region_resistivity_lookup(parsed_resistivity)
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
            rho_value = region_lookup.get(original_region_id)
            if rho_value is not None:
                triangle_resistivity_values[triangle_index] = float(rho_value)
                if original_region_id not in seen_region_ids:
                    region_resistivity.append(
                        {
                            "regionId": original_region_id,
                            "rho": float(rho_value),
                        }
                    )
                    seen_region_ids.add(original_region_id)

    return {
        "vertices": ordered_vertices,
        "triangles": ordered_triangles,
        "triangleRegionIds": triangle_region_ids,
        "triangleResistivityValues": triangle_resistivity_values,
        "regionResistivity": sorted(
            region_resistivity, key=lambda item: item["regionId"]
        ),
    }


@app.route("/api/upload-xyz", methods=["POST"])
def upload_xyz_file():
    print("Start processing file...")

    for key in request.files.keys():
        print("request file: ", request.files[key])
        # Check if the post request has the file part
        if "file" not in key:
            return "No file part"

        file = request.files[key]
        if file.filename == "":
            return "No selected file"

        if file and file.filename.endswith(".xyz"):
            temp_dir = tempfile.gettempdir()
            path = _save_uploaded_file(file, temp_dir)
            print(path)
            xyz_datafile_reader = XYZDataFileReader(path)
            xyz_datafile_reader.read_file()
            xyz_datafile_reader.add_distance()
            # result_df = xyz_datafile_reader.df_for_echart_heatmap(xyz_datafile_reader.data)
            data_js = xyz_datafile_reader.df_to_json(xyz_datafile_reader.data)
            return jsonify(json.loads(data_js))

    return "Invalid file format"


@app.route("/api/upload-data", methods=["POST"])
def upload_data_file():
    print("Start processing file...")

    for key in request.files.keys():
        print("request file: ", request.files[key])
        # Check if the post request has the file part
        if "file" not in key:
            return jsonify({"error": "No file part"}), 400

        file = request.files[key]
        if file.filename == "":
            return jsonify({"error": "No selected file"}), 400

        if file and (
            file.filename.endswith(".data")
            or file.filename.endswith(".emdata")
            or file.filename.endswith(".resp")
        ):
            try:
                temp_dir = tempfile.gettempdir()
                path = _save_uploaded_file(file, temp_dir)
                # print(path)
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
                traceback.print_exc()
                return jsonify({"error": traceback.format_exc()}), 500

    return "Invalid file format"


@app.route("/api/upload-triangle-model", methods=["POST"])
def upload_triangle_model_file():
    poly_file = request.files.get("poly_file")
    if poly_file is None:
        return jsonify({"error": "No .poly file provided"}), 400
    if poly_file.filename == "":
        return jsonify({"error": "No selected .poly file"}), 400
    if not poly_file.filename.endswith(".poly"):
        return jsonify({"error": "Invalid .poly file format"}), 400

    resistivity_file = request.files.get("resistivity_file")
    if (
        resistivity_file is not None
        and resistivity_file.filename != ""
        and not resistivity_file.filename.endswith(".resistivity")
    ):
        return jsonify({"error": "Invalid .resistivity file format"}), 400

    try:
        temp_dir = tempfile.gettempdir()
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
        traceback.print_exc()
        return jsonify({"error": traceback.format_exc()}), 500


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

    temp_dir = tempfile.gettempdir()
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


@app.route("/api/preview-triangle-resegmentation", methods=["POST"])
def preview_triangle_resegmentation():
    try:
        return jsonify(_read_resegmentation_request(include_export_text=False))
    except ResegmentationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": traceback.format_exc()}), 500


@app.route("/api/export-triangle-resegmentation", methods=["POST"])
def export_triangle_resegmentation():
    try:
        return jsonify(_read_resegmentation_request(include_export_text=True))
    except ResegmentationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": traceback.format_exc()}), 500


@app.route("/api/export-triangle-resistivity", methods=["POST"])
def export_triangle_resistivity_file():
    resistivity_file = request.files.get("resistivity_file")
    if resistivity_file is None:
        return jsonify({"error": "No .resistivity file provided"}), 400
    if resistivity_file.filename == "":
        return jsonify({"error": "No selected .resistivity file"}), 400
    if not resistivity_file.filename.endswith(".resistivity"):
        return jsonify({"error": "Invalid .resistivity file format"}), 400

    raw_updates = request.form.get("region_rho_updates")
    updates_file = request.files.get("region_rho_updates")
    if raw_updates is None and updates_file is not None:
        try:
            raw_updates = updates_file.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            return jsonify({"error": "Could not decode region rho updates as UTF-8"}), 400
    if raw_updates is None:
        return jsonify({"error": "No region rho updates provided"}), 400

    try:
        source_text = resistivity_file.read().decode("utf-8-sig")
        updates = parse_region_rho_updates(raw_updates)
        exported_text = build_exported_resistivity_text(source_text, updates)
        original_name = secure_filename(resistivity_file.filename) or "model.resistivity"
        stem, _ = os.path.splitext(original_name)
        download_name = f"{stem}.edited.resistivity"

        response = app.response_class(exported_text, mimetype="text/plain")
        response.headers["Content-Disposition"] = (
            f'attachment; filename="{download_name}"'
        )
        return response
    except UnicodeDecodeError:
        return jsonify({"error": "Could not decode .resistivity file as UTF-8"}), 400
    except ResistivityExportError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": traceback.format_exc()}), 500


@app.route("/api/upload-multiple-data", methods=["POST"])
def upload_multiple_data_files():
    print("Start processing multiple data files...")

    if "files" not in request.files:
        return jsonify({"error": "No files part"}), 400

    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files selected"}), 400

    datasets = []
    for file in files:
        if file.filename == "":
            return jsonify({"error": "No selected file"}), 400

        if not (
            file.filename.endswith(".data")
            or file.filename.endswith(".emdata")
            or file.filename.endswith(".resp")
        ):
            return jsonify(
                {
                    "error": f"Invalid file format: {file.filename}. Supported formats: .data, .emdata, .resp"
                }
            ), 400

        try:
            temp_dir = tempfile.gettempdir()
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
            traceback.print_exc()
            return jsonify({"error": traceback.format_exc()}), 500

    return jsonify(datasets)


@app.route("/api/load-sample-data", methods=["POST"])
def load_sample_data_files():
    payload = request.get_json(silent=True) or {}
    files = payload.get("files", [])
    if not isinstance(files, list) or not files:
        return jsonify({"error": "No sample files specified"}), 400

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_data"))
    datasets = []
    for filename in files:
        if not isinstance(filename, str) or filename == "":
            return jsonify({"error": "Invalid file name"}), 400

        if not (
            filename.endswith(".data")
            or filename.endswith(".emdata")
            or filename.endswith(".resp")
        ):
            return jsonify(
                {
                    "error": f"Invalid file format: {filename}. Supported formats: .data, .emdata, .resp"
                }
            ), 400

        file_path = os.path.abspath(os.path.join(base_dir, filename))
        if not file_path.startswith(base_dir + os.sep):
            return jsonify({"error": f"Invalid file path: {filename}"}), 400
        if not os.path.exists(file_path):
            return jsonify({"error": f"File not found: {filename}"}), 404

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
            traceback.print_exc()
            return jsonify({"error": traceback.format_exc()}), 500

    return jsonify(datasets)


@app.route("/api/write-data-file", methods=["POST", "OPTIONS"])
def write_data_file():
    if request.method == "OPTIONS":
        response = jsonify({"message": "CORS preflight"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type")
        return response
    elif request.method == "POST":
        try:
            data = request.get_json()
            content = data.get("content")
            csem_data = data.get("dataBlocks")

            csem_datafile_manager = CSEMDataFileManager()
            data_df_from_content = csem_datafile_manager.json_to_df(content)
            updated_blocks = csem_datafile_manager.update_blocks(
                data_df_from_content, csem_data
            )
            datafile_str = csem_datafile_manager.blocks_to_str(updated_blocks)

            return jsonify(datafile_str)
        except Exception:
            traceback.print_exc()
            return jsonify({"error": traceback.format_exc()}), 500


@app.route("/api/upload-mat", methods=["POST"])
def upload_mat_file():
    print("Start processing file...")

    for key in request.files.keys():
        print("request file: ", request.files[key])
        # Check if the post request has the file part
        if "file" not in key:
            return "No file part"

        file = request.files[key]
        if file.filename == "":
            return "No selected file"

        if file and file.filename.endswith(".mat"):
            temp_dir = tempfile.gettempdir()
            path = _save_uploaded_file(file, temp_dir)
            print(path)
            return process_SuesiDepth_mat_file(path)

    return "Invalid file format"


@app.route("/api/upload-bathymetry", methods=["POST"])
def upload_bathymetry_file():
    print("Start processing bathymetry file...")

    for key in request.files.keys():
        print("request file: ", request.files[key])
        # Check if the post request has the file part
        if "file" not in key:
            return jsonify({"error": "No file part"}), 400

        file = request.files[key]
        if file.filename == "":
            return jsonify({"error": "No selected file"}), 400

        if file and file.filename.endswith(".txt"):
            try:
                temp_dir = tempfile.gettempdir()
                path = _save_uploaded_file(file, temp_dir)
                print(path)

                bathymetry_parser = BathymetryParser()
                result = bathymetry_parser.parse_file(path)

                if result["success"]:
                    return jsonify(result)
                else:
                    return jsonify({"error": result["message"]}), 400

            except Exception as e:
                return jsonify(
                    {"error": f"Error processing bathymetry file: {str(e)}"}
                ), 500

    return jsonify({"error": "Invalid file format. Please upload a .txt file."}), 400


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
                return jsonify({"error": "No data provided"}), 400

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
            return jsonify({"error": "No data provided"}), 400

        result = calculate_misfit_statistics(data_array)
        return jsonify(result)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=_get_debug_flag(), port=3354)
