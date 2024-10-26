import traceback
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from suesi_depth_reader import process_SuesiDepth_mat_file
from csem_datafile_parser import CSEMDataFileReader
from csem_datafile_parser import CSEMDataFileManager
from xyz_datafile_parser import XYZDataFileReader

app = Flask(__name__)
CORS(app)
# Disable sorting of keys in JSON responses
app.json.sort_keys = False

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
            path = os.path.join('/tmp', file.filename)
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

        if file and file.filename.endswith('.data') or file.filename.endswith('.emdata'):
            try:
                path = os.path.join('/tmp', file.filename)
                # print(path)
                file.save(path)
                csem_datafile_reader = CSEMDataFileReader(path)
                csem_data = csem_datafile_reader.blocks
                geometry_info = csem_datafile_reader.extract_geometry_info()
                data_df = csem_datafile_reader.data_block_init(csem_data['Data'])
                rx_data_df = csem_datafile_reader.rx_data_block_init(csem_data['Rx'])
                tx_data_df = csem_datafile_reader.tx_data_block_init(csem_data['Tx'])
                rx_data_lonlat_df = csem_datafile_reader.ne2latlon(rx_data_df, geometry_info)
                tx_data_lonlat_df = csem_datafile_reader.ne2latlon(tx_data_df, geometry_info)
                data_rx_tx_df = csem_datafile_reader.merge_data_rx_tx(data_df, rx_data_lonlat_df, tx_data_lonlat_df)
                data_js = csem_datafile_reader.df_to_json(data_rx_tx_df)
                # Return geometry info, data, and csem data blocks strings
                return jsonify(geometry_info, data_js, csem_data)
            except Exception:
                traceback.print_exc()
                return jsonify({'error': traceback.format_exc()}), 500

    return 'Invalid file format'

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
            path = os.path.join('/tmp', file.filename)
            print(path)
            file.save(path)
            return process_SuesiDepth_mat_file(path)

    return 'Invalid file format'

if __name__ == '__main__':
    app.run(debug=True, port=3354)
