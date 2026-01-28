import traceback
import os
import tempfile
import uuid
from typing import List
from flask import Flask, request, jsonify
from flask_cors import CORS
from suesi_depth_reader import process_SuesiDepth_mat_file
from csem_datafile_parser import CSEMDataFileReader
from csem_datafile_parser import CSEMDataFileManager
from xyz_datafile_parser import XYZDataFileReader
from bathymetry_parser import BathymetryParser

app = Flask(__name__)
CORS(app)
# Disable sorting of keys in JSON responses
app.config['JSON_SORT_KEYS'] = False

def _parse_csem_datafile(path):
    csem_datafile_reader = CSEMDataFileReader(path)
    # Ensure blocks are in the correct order for frontend
    ordered_blocks = {}
    for block_name in csem_datafile_reader.block_infos:
        if block_name in csem_datafile_reader.blocks:
            ordered_blocks[block_name] = csem_datafile_reader.blocks[block_name]
    csem_data = ordered_blocks
    geometry_info = csem_datafile_reader.extract_geometry_info()
    data_df = csem_datafile_reader.data_block_init(csem_data['Data'])
    if csem_datafile_reader.data_type == 'joint':
        rx_data_df = csem_datafile_reader.rx_data_block_init(csem_data['Rx_CSEM'])
    elif csem_datafile_reader.data_type == 'CSEM':
        rx_data_df = csem_datafile_reader.rx_data_block_init(csem_data['Rx'])
    elif csem_datafile_reader.data_type == 'MT':
        raise ValueError(f"Cannot process data type: {csem_datafile_reader.data_type}")
    else:
        raise ValueError(f"Invalid data type: {csem_datafile_reader.data_type}")
    tx_data_df = csem_datafile_reader.tx_data_block_init(csem_data['Tx'])
    rx_data_lonlat_df = csem_datafile_reader.ne2latlon(rx_data_df, geometry_info)
    tx_data_lonlat_df = csem_datafile_reader.ne2latlon(tx_data_df, geometry_info)
    data_rx_tx_df = csem_datafile_reader.merge_data_rx_tx(
        data_df,
        rx_data_lonlat_df,
        tx_data_lonlat_df,
    )
    data_js = csem_datafile_reader.df_to_json(data_rx_tx_df)
    return geometry_info, data_js, csem_data

@app.route('/api/upload-xyz', methods=['POST'])
def upload_xyz_file():
    print('Start processing file...')

    for key in request.files.keys():
        print("request file: ", request.files[key])
        # Check if the post request has the file part
        if 'file' not in key:
            return 'No file part'

        file = request.files[key]
        if file.filename == '':
            return 'No selected file'

        if file and file.filename.endswith('.xyz'):
            temp_dir = tempfile.gettempdir()
            path = os.path.join(temp_dir, file.filename)
            print(path)
            file.save(path)
            xyz_datafile_reader = XYZDataFileReader(path)
            xyz_datafile_reader.read_file()
            xyz_datafile_reader.add_distance()
            # result_df = xyz_datafile_reader.df_for_echart_heatmap(xyz_datafile_reader.data)
            data_js = xyz_datafile_reader.df_to_json(xyz_datafile_reader.data)
            return jsonify(data_js)

    return 'Invalid file format'

@app.route('/api/upload-data', methods=['POST'])
def upload_data_file():
    print('Start processing file...')

    for key in request.files.keys():
        print("request file: ", request.files[key])
        # Check if the post request has the file part
        if 'file' not in key:
            return jsonify({'error': 'No file part'}), 400

        file = request.files[key]
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        if file and (file.filename.endswith('.data') or file.filename.endswith('.emdata') or file.filename.endswith('.resp')):
            try:
                temp_dir = tempfile.gettempdir()
                path = os.path.join(temp_dir, file.filename)
                # print(path)
                file.save(path)
                geometry_info, data_js, csem_data = _parse_csem_datafile(path)
                # Return geometry info, data, and csem data blocks strings
                return jsonify(geometry_info, data_js, csem_data)
            except Exception:
                traceback.print_exc()
                return jsonify({'error': traceback.format_exc()}), 500

    return 'Invalid file format'

@app.route('/api/upload-multiple-data', methods=['POST'])
def upload_multiple_data_files():
    print('Start processing multiple data files...')

    if 'files' not in request.files:
        return jsonify({'error': 'No files part'}), 400

    files = request.files.getlist('files')
    if not files:
        return jsonify({'error': 'No files selected'}), 400

    datasets = []
    for file in files:
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        if not (file.filename.endswith('.data') or file.filename.endswith('.emdata') or file.filename.endswith('.resp')):
            return jsonify({'error': f'Invalid file format: {file.filename}. Supported formats: .data, .emdata, .resp'}), 400

        try:
            temp_dir = tempfile.gettempdir()
            path = os.path.join(temp_dir, file.filename)
            file.save(path)
            geometry_info, data_js, csem_data = _parse_csem_datafile(path)
            datasets.append({
                'id': uuid.uuid4().hex,
                'name': file.filename,
                'geometryInfo': geometry_info,
                'data': data_js,
                'dataBlocks': csem_data,
            })
        except Exception:
            traceback.print_exc()
            return jsonify({'error': traceback.format_exc()}), 500

    return jsonify(datasets)

@app.route('/api/load-sample-data', methods=['POST'])
def load_sample_data_files():
    payload = request.get_json(silent=True) or {}
    files = payload.get('files', [])
    if not isinstance(files, list) or not files:
        return jsonify({'error': 'No sample files specified'}), 400

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'test_data'))
    datasets = []
    for filename in files:
        if not isinstance(filename, str) or filename == '':
            return jsonify({'error': 'Invalid file name'}), 400

        if not (filename.endswith('.data') or filename.endswith('.emdata') or filename.endswith('.resp')):
            return jsonify({'error': f'Invalid file format: {filename}. Supported formats: .data, .emdata, .resp'}), 400

        file_path = os.path.abspath(os.path.join(base_dir, filename))
        if not file_path.startswith(base_dir + os.sep):
            return jsonify({'error': f'Invalid file path: {filename}'}), 400
        if not os.path.exists(file_path):
            return jsonify({'error': f'File not found: {filename}'}), 404

        try:
            geometry_info, data_js, csem_data = _parse_csem_datafile(file_path)
            datasets.append({
                'id': uuid.uuid4().hex,
                'name': filename,
                'geometryInfo': geometry_info,
                'data': data_js,
                'dataBlocks': csem_data,
            })
        except Exception:
            traceback.print_exc()
            return jsonify({'error': traceback.format_exc()}), 500

    return jsonify(datasets)

@app.route('/api/write-data-file', methods=['POST', 'OPTIONS'])
def write_data_file():
    if request.method == 'OPTIONS':
        # Handle preflight requests here
        response = jsonify({'message': 'CORS preflight'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        return response
    elif request.method == 'POST':
        # Handle the actual POST request
        data = request.get_json()
        # Get content and file name from the request
        content = data.get('content')
        csem_data = data.get('dataBlocks')

        csem_datafile_manager = CSEMDataFileManager()
        data_df_from_content = csem_datafile_manager.json_to_df(content)
        updated_blocks = csem_datafile_manager.update_blocks(data_df_from_content, csem_data)
        datafile_str = csem_datafile_manager.blocks_to_str(updated_blocks)

        try:
            return jsonify(datafile_str)
        except Exception as e:
            return jsonify({'error': str(e)})

@app.route('/api/upload-mat', methods=['POST'])
def upload_mat_file():
    print('Start processing file...')

    for key in request.files.keys():
        print("request file: ", request.files[key])
        # Check if the post request has the file part
        if 'file' not in key:
            return 'No file part'

        file = request.files[key]
        if file.filename == '':
            return 'No selected file'

        if file and file.filename.endswith('.mat'):
            temp_dir = tempfile.gettempdir()
            path = os.path.join(temp_dir, file.filename)
            print(path)
            file.save(path)
            return process_SuesiDepth_mat_file(path)

    return 'Invalid file format'

@app.route('/api/upload-bathymetry', methods=['POST'])
def upload_bathymetry_file():
    print('Start processing bathymetry file...')

    for key in request.files.keys():
        print("request file: ", request.files[key])
        # Check if the post request has the file part
        if 'file' not in key:
            return jsonify({'error': 'No file part'}), 400

        file = request.files[key]
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        if file and file.filename.endswith('.txt'):
            try:
                temp_dir = tempfile.gettempdir()
                path = os.path.join(temp_dir, file.filename)
                print(path)
                file.save(path)
                
                bathymetry_parser = BathymetryParser()
                result = bathymetry_parser.parse_file(path)
                
                if result['success']:
                    return jsonify(result)
                else:
                    return jsonify({'error': result['message']}), 400
                    
            except Exception as e:
                return jsonify({'error': f'Error processing bathymetry file: {str(e)}'}), 500

    return jsonify({'error': 'Invalid file format. Please upload a .txt file.'}), 400

if __name__ == '__main__':
    app.run(debug=True, port=3354)
