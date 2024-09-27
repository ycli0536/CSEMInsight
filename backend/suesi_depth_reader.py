from flask import jsonify
from scipy.io import loadmat
import pandas as pd

def process_SuesiDepth_mat_file(filepath):
    # Load .mat file
    mat_data = loadmat(filepath)
    print(mat_data.keys())
    if all(key in mat_data.keys() for key in ["depth", "time"]):
        print('Process time vs depth data')
        time = pd.to_datetime(mat_data['time'].flatten()-719529,unit='d').round('s') # ignore decimal of s
        SuesiDepth = pd.DataFrame({
                    'value': mat_data['depth'].flatten(),
                    'time': time
                    })
        # Convert DataFrame to JSON
        result = SuesiDepth.to_json(orient='records', date_format='epoch', date_unit='s')
        return jsonify(result)
    elif "nTET" in mat_data.keys():
        print('Process nTET data')
        time = pd.to_datetime(mat_data["nTET"][0][0][0][:, 0].flatten()-719529,unit='d').round('s')
        TETData = pd.DataFrame({
                    'value': mat_data["nTET"][0][0][0][:, 1].flatten(),
                    'time': time
                    })
        # Convert DataFrame to JSON
        result = TETData.to_json(orient='records', date_format='epoch', date_unit='s')
        return jsonify(result)
    elif "nVulcan" in mat_data.keys():
        print('Process nVulcan data')
        time = pd.to_datetime(mat_data["nVulcan"][0][0][0][:, 0].flatten()-719529,unit='d').round('s')
        VulcanData = pd.DataFrame({
                    'value': mat_data["nVulcan"][0][0][0][:, 1].flatten(),
                    'time': time
                    })
        # Convert DataFrame to JSON
        result = VulcanData.to_json(orient='records', date_format='epoch', date_unit='s')
        return jsonify(result)
    else:
        return 'Invalid .mat file'
