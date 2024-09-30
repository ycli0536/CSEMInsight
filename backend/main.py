import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
from suesi_depth_reader import process_SuesiDepth_mat_file
from csem_datafile_parser import CSEMDataFileReader
from xyz_datafile_parser import XYZDataFileReader

app = Flask(__name__)
CORS(app)

@app.route('/upload-xyz', methods=['POST'])
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
            # result_df = xyz_datafile_reader.df_for_echart_heatmap(xyz_datafile_reader.data)
            data_js = xyz_datafile_reader.df_to_json(xyz_datafile_reader.data)
            return jsonify(data_js)

    return 'Invalid file format'

@app.route('/upload-data', methods=['POST'])
def upload_data_file():
    print('Start processing file...')

    for key in request.files.keys():
        print("request file: ", request.files[key])
        # Check if the post request has the file part
        if 'file' not in key:
            return 'No file part'

        file = request.files[key]
        if file.filename == '':
            return 'No selected file'

        if file and file.filename.endswith('.data'):
            path = os.path.join('/tmp', file.filename)
            print(path)
            file.save(path)
            csem_datafile_reader = CSEMDataFileReader(path)
            geometry_info = csem_datafile_reader.extract_geometry_info()
            csem_data = csem_datafile_reader.blocks
            data_df = csem_datafile_reader.data_block_init(csem_data['Data'])
            rx_data_df = csem_datafile_reader.rx_data_block_init(csem_data['Rx'])
            tx_data_df = csem_datafile_reader.tx_data_block_init(csem_data['Tx'])
            rx_data_df = csem_datafile_reader.ne2latlon(rx_data_df, geometry_info)
            tx_data_df = csem_datafile_reader.ne2latlon(tx_data_df, geometry_info)
            data_rx_tx_df = csem_datafile_reader.merge_data_rx_tx(data_df, rx_data_df, tx_data_df)
            data_js = csem_datafile_reader.df_to_json(data_rx_tx_df)
            
            #  # Split the path into directory and file components
            # directory, file_name = os.path.split(self.file_path)
            # # Split the file name into base name and extension
            # base_name, _ = os.path.splitext(file_name)
            # df.to_json(os.path.join(directory, base_name, '.json'), orient='records', date_format='epoch', date_unit='s')
            
            # Return geometry info and data
            return jsonify(geometry_info, data_js)

    return 'Invalid file format'

@app.route('/upload-mat', methods=['POST'])
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
    app.run(debug=True)
