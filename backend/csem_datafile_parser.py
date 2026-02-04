from typing import Optional
import re
import pandas as pd
import numpy as np
import utm
from io import StringIO

# Constants for data type codes
AMPLITUDE_TYPE_CODES = {'21', '23', '25', '27', '28', '29', '31', '33', '35', '37', '38', '39'}
PHASE_TYPE_CODES = {'22', '24', '26', '32', '34', '36'}

def calculate_misfit_statistics(data_array: list) -> dict:
    """Calculate RMS statistics from CSEM data residuals.

    Groups by Type, Y_rx, Y_tx, Y_range, and Frequency.

    Args:
        data_array: List of dictionaries containing CSEM data with required columns:
                   Type, Y_rx, Y_tx, Freq_id, Residual

    Returns:
        Dictionary with keys byRx, byTx, byRange, byFreq, each containing
        amplitude and phase arrays with RMS values and position/frequency fields.

    Raises:
        ValueError: If required columns are missing from data_array.
    """
    if not data_array:
        raise ValueError("No data provided")

    df = pd.DataFrame(data_array)

    required_cols = ["Type", "Y_rx", "Y_tx", "Freq_id", "Residual"]
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required columns: {missing_cols}")

    df["Type"] = df["Type"].astype(str)
    df["Y_range"] = df["Y_rx"] - df["Y_tx"]

    def calc_rms(residuals):
        if len(residuals) == 0:
            return np.nan
        return np.sqrt((residuals**2).sum() / len(residuals))

    rms_by_rx = df.groupby(["Type", "Y_rx"], as_index=False)["Residual"].apply(calc_rms)
    rms_by_rx.columns = ["Type", "Y_rx", "RMS"]
    rms_by_rx["Y_rx_km"] = rms_by_rx["Y_rx"] / 1000

    rms_by_tx = df.groupby(["Type", "Y_tx"], as_index=False)["Residual"].apply(calc_rms)
    rms_by_tx.columns = ["Type", "Y_tx", "RMS"]
    rms_by_tx["Y_tx_km"] = rms_by_tx["Y_tx"] / 1000

    rms_by_range = df.groupby(["Type", "Y_range"], as_index=False)["Residual"].apply(calc_rms)
    rms_by_range.columns = ["Type", "Y_range", "RMS"]
    rms_by_range["Y_range_km"] = rms_by_range["Y_range"] / 1000

    rms_by_freq = df.groupby(["Type", "Freq_id"], as_index=False)["Residual"].apply(calc_rms)
    rms_by_freq.columns = ["Type", "Freq_id", "RMS"]

    result = {
        "byRx": {
            "amplitude": rms_by_rx[rms_by_rx["Type"].isin(AMPLITUDE_TYPE_CODES)][["Y_rx_km", "RMS"]].to_dict("records"),
            "phase": rms_by_rx[rms_by_rx["Type"].isin(PHASE_TYPE_CODES)][["Y_rx_km", "RMS"]].to_dict("records"),
        },
        "byTx": {
            "amplitude": rms_by_tx[rms_by_tx["Type"].isin(AMPLITUDE_TYPE_CODES)][["Y_tx_km", "RMS"]].to_dict("records"),
            "phase": rms_by_tx[rms_by_tx["Type"].isin(PHASE_TYPE_CODES)][["Y_tx_km", "RMS"]].to_dict("records"),
        },
        "byRange": {
            "amplitude": rms_by_range[rms_by_range["Type"].isin(AMPLITUDE_TYPE_CODES)][["Y_range_km", "RMS"]].to_dict("records"),
            "phase": rms_by_range[rms_by_range["Type"].isin(PHASE_TYPE_CODES)][["Y_range_km", "RMS"]].to_dict("records"),
        },
        "byFreq": {
            "amplitude": rms_by_freq[rms_by_freq["Type"].isin(AMPLITUDE_TYPE_CODES)][["Freq_id", "RMS"]].to_dict("records"),
            "phase": rms_by_freq[rms_by_freq["Type"].isin(PHASE_TYPE_CODES)][["Freq_id", "RMS"]].to_dict("records"),
        },
    }

    return result

class CSEMDataFileReader():
    """_summary_
    """
    def __init__(self, file_path):
        self.file_path = file_path
        self.data_type = None
        self.extracted_blocks = []
        self.data_type_codes_amplitude = ['21', '23', '25', '27', '28', '29', '31', '33', '35', '37', '38', '39']
        self.data_type_codes_phase = ['22', '24', '26', '32', '34', '36']
        self.data_type_codes = self.data_type_codes_amplitude + self.data_type_codes_phase
        self.data = None
        self.read_file()
        self.format, self.version = self.extract_file_info()
        
    def read_file_to_blocks(self) -> tuple[list, list]:
        """Read the file and extract the data blocks."""
        # Initialize an empty list to store the extracted blocks
        extracted_blocks = []

        # Initialize a variable to accumulate the current block
        current_block: list[str] = []
        # Open and read the file
        with open(self.file_path, 'r', encoding="utf-8") as file:
            # Read the file line by line
            for line in file:
                # Check if the line contains a ':'
                if ':' in line:
                    # If it's a new block, add the previous block to the list (if any)
                    if current_block:
                        # extracted_blocks.append(''.join(current_block))
                        extracted_blocks.append(current_block)
                        current_block = []  # Reset the current block

                # Append the current line to the current block
                current_block.append(line)

        # Add the last block to the list (if any)
        if current_block:
            # extracted_blocks.append(''.join(current_block))
            extracted_blocks.append(current_block)
        # extract block headers from each block[0]
        block_headers = [block[0].split(':')[0].strip().lower() for block in extracted_blocks if ':' in block[0]]
        return extracted_blocks, block_headers

    def read_file(self):
        extracted_blocks, block_headers = self.read_file_to_blocks()
        if ('# csem frequencies' in block_headers) and ('# mt frequencies' in block_headers):
            self.data_type = 'joint'
        elif ('# csem frequencies' in block_headers) and ('# mt frequencies' not in block_headers):
            self.data_type = 'CSEM'
        elif ('# mt frequencies' in block_headers) and ('# csem frequencies' not in block_headers):
            self.data_type = 'MT'
        else:
            raise ValueError(f"Invalid data type: {self.data_type}")

        if self.data_type == 'CSEM':
            self.block_infos = [
                "Format",
                "Geometry",
                "Phase",
                "Reciprocity",
                "Frequencies",
                "Tx",
                "Rx",
                "Data",
            ]
        elif self.data_type == 'MT':
            self.block_infos = [
                "Format",
                "Geometry",
                "Reciprocity",
                "Frequencies",
                "Rx",
                "Data",
            ]
        elif self.data_type == 'joint':
            self.block_infos = [
                "Format",
                "Geometry",
                "Phase",
                "Reciprocity",
                "Frequencies_CSEM",
                "Frequencies_MT",
                "Tx",
                "Rx_CSEM",
                "Rx_MT",
                "Data",
            ]
        self.blocks = {info: [] for info in self.block_infos}
        # Filter the extracted blocks based on the patterns
        for block in extracted_blocks:
            # assume for each pattern we can only find single match (if any)
            # match the block info with each block
            for info in self.block_infos:
                if info == 'Geometry' and re.search('UTM', block[0], re.IGNORECASE):
                    self.blocks[info] = block
                    break
                if info =='Frequencies' and (re.search('CSEM Frequencies', block[0], re.IGNORECASE) or re.search('MT Frequencies', block[0], re.IGNORECASE)):
                    self.blocks[info] = block
                    break
                if info == 'Frequencies_CSEM' and re.search('CSEM Frequencies', block[0], re.IGNORECASE):
                    self.blocks[info] = block
                    break
                if info == 'Frequencies_MT' and re.search('MT Frequencies', block[0], re.IGNORECASE):
                    self.blocks[info] = block
                    break
                if info =='Tx' and re.search('Transmitters', block[0], re.IGNORECASE):
                    self.blocks[info] = block
                    break
                if info == 'Rx' and (re.search('CSEM Receivers', block[0], re.IGNORECASE) or re.search('MT Receivers', block[0], re.IGNORECASE)):
                    self.blocks[info] = block
                    break
                if info == 'Rx_MT' and re.search('MT Receivers', block[0], re.IGNORECASE):
                    self.blocks[info] = block
                    break
                if info == 'Rx_CSEM' and re.search('CSEM Receivers', block[0], re.IGNORECASE):
                    self.blocks[info] = block
                    break
                elif re.search(info, block[0], re.IGNORECASE):
                    self.blocks[info] = block
                    break

    def extract_file_info(self):
        """Extract file information."""
        file_info_line = self.blocks['Format']
        file_info = file_info_line[0].split(':')[1].strip().lower()
        # Check the version of the file, e.g. EMData_2.3
        file_format = file_info.split('_')[0]
        file_version = file_info.split('_')[1]

        return file_format, file_version

    def extract_geometry_info(self):
        """Extract geometry information."""
        geometry_info_line = self.blocks['Geometry']
        geometry_info = geometry_info_line[0].split(':')[1].split('!')[0].strip().split()

        geometry_key = [
                    "UTM_zone",
                    "Hemisphere",
                    "North",
                    "East",
                    "Strike",
                ]
        geometry_data = {key: value for key, value in zip(geometry_key, geometry_info)}
        
        # Convert to appropriate types
        geometry_data['UTM_zone'] = int(geometry_data['UTM_zone'])
        geometry_data['North'] = float(geometry_data['North'])
        geometry_data['East'] = float(geometry_data['East'])
        geometry_data['Strike'] = float(geometry_data['Strike'])
        # Hemisphere remains as string
        
        return geometry_data

    def extract_freq_info(self):
        """Extract frequency information."""
        if self.data_type == 'joint':
            freq_info_line = self.blocks['Frequencies_CSEM']
        else:
            freq_info_line = self.blocks['Frequencies']
        # Initialize an empty dictionary to store the extracted frequencies
        freq_data = {}

        # Loop through the data starting from the second element (index 1) to skip the header
        for index, line in enumerate(freq_info_line[1:], start=1):
            # Strip the newline and convert the string to a float
            freq_v = float(line.strip())
            # Add the value to the dictionary with its index
            freq_data[index] = freq_v
        return freq_data

    def extract_data_block(self, lines:str) -> dict:
        """Extract certain data block."""
        # Use the second line as column headers
        # Remove the '!' and any '#' characters and split the string into headers
        cleaned_string = re.sub(r'[!#]', '', lines[1])
        headers = cleaned_string.strip().split()
        # Initialize a dictionary to store data as lists by column
        data_table: dict[str, list] = {header: [] for header in headers}

        # Process the data lines
        for line in lines[2:]:
            row = line.split()

            # Ensure that the row has the same number of columns as the headers
            while len(row) < len(headers):
                row.append("")  # Add a default value ('') for missing data

            # Assign values to respective columns
            for header, value in zip(headers, row):
                data_table[header].append(value)

        return data_table

    def add_freq_column(self, table:pd.DataFrame, freq_dict:dict) -> pd.DataFrame:
        """Add a frequency column to the data table."""
        table['Freq'] = table['Freq_id'].map(freq_dict)
        return table

    def data_block_init(self, data_block:str) -> pd.DataFrame:
        """Initialize the Data block. Convert extracted data to DataFrame."""
        # Extract data
        data_extracted = self.extract_data_block(data_block)
        data = pd.DataFrame.from_dict(data_extracted)
        
        # Determine which standard error column name is present in the raw data
        has_stderr = 'StdErr' in data.columns
        has_stderror = 'StdError' in data.columns
        stderr_col = 'StdErr' if has_stderr else 'StdError' if has_stderror else None
        
        if self.format == 'emdata':
            if stderr_col:
                data = data.astype({'Type': 'category',
                                    'Freq': 'int',
                                    'Tx': 'int',
                                    'Rx': 'int',
                                    'Data': 'float',
                                    stderr_col: 'float'})
                # Rename StdErr to StdError for consistency
                if has_stderr:
                    data.rename(columns={'StdErr': 'StdError'}, inplace=True)
        elif self.format == 'emresp':
            if stderr_col:
                data = data.astype({'Type': 'category',
                                    'Freq': 'int',
                                    'Tx': 'int',
                                    'Rx': 'int',
                                    'Data': 'float',
                                    stderr_col: 'float',
                                    'Response': 'float',
                                    'Residual': 'float'})
                # Rename StdErr to StdError for consistency
                if has_stderr:
                    data.rename(columns={'StdErr': 'StdError'}, inplace=True)
        data['Type'] = data['Type'].cat.set_categories(self.data_type_codes, ordered=True)
        return data

    def tx_data_block_init(self, tx_data_block:str) -> pd.DataFrame:
        """Initialize the Tx Data block. Convert extracted data to DataFrame."""
        Tx_data_extracted = self.extract_data_block(tx_data_block)
        Tx_data = pd.DataFrame.from_dict(Tx_data_extracted)

        Tx_data = Tx_data.astype({'X': 'float',
                            'Y': 'float',
                            'Z': 'float',
                            'Azimuth': 'float',
                            'Dip': 'float',
                            'Length': 'float',
                            'Type': 'category',
                            'Name': 'string',})
        Tx_data.insert(0, "Tx", pd.Series(range(1, len(Tx_data)+1)))
        return Tx_data

    def rx_data_block_init(self, rx_data_block:str, rx_type:str='CSEM') -> pd.DataFrame:
        """Initialize the Rx Data block. Convert extracted data to DataFrame."""
        Rx_data_extracted = self.extract_data_block(rx_data_block)
        Rx_data = pd.DataFrame.from_dict(Rx_data_extracted)

        if rx_type == 'CSEM':
            Rx_data = Rx_data.astype({'X': 'float',
                                    'Y': 'float',
                                    'Z': 'float',
                                    'Theta': 'float',
                                    'Alpha': 'float',
                                    'Beta': 'float',
                                    'Length': 'float',
                                    'Name': 'string',})
        elif rx_type == 'MT':
            Rx_data = Rx_data.astype({'X': 'float',
                                    'Y': 'float',
                                    'Z': 'float',
                                    'Theta': 'float',
                                    'Alpha': 'float',
                                    'Beta': 'float',
                                    'Length': 'float',
                                    'SolveStatic': 'float',
                                    'Name': 'string',})
        else:
            raise ValueError(f"Invalid Rx type: {rx_type}")
        Rx_data.insert(0, "Rx", pd.Series(range(1, len(Rx_data)+1)))
        return Rx_data

    # Function to rotate coordinates
    def inv_rotate_coords(self, x, y, rot_angle, origin):
        angle = np.deg2rad(rot_angle)  # Convert azimuth to radians
        x_rot = x * np.cos(angle) - y * np.sin(angle) + origin[0]
        y_rot = x * np.sin(angle) + y * np.cos(angle) + origin[1]
        return x_rot, y_rot

    # Function to convert UTM to latitude and longitude
    def utm_to_latlon(self, x, y, zone_number, northern_hemisphere=True):
        # check if the zone number is valid
        if 1 <= zone_number <= 60:
            lat, lon = utm.to_latlon(x, y, zone_number, northern=northern_hemisphere)
            return lat, lon
        else:
            return 0, 0

    def ne2latlon(self, data_df, geometry_info):
        """Convert mare2dem inline-crossline coordinates to latitude and longitude."""
        # Extract UTM zone info (e.g., Zone 4, Northern Hemisphere)
        utm_zone = int(geometry_info['UTM_zone'])
        if geometry_info['Hemisphere'] == 'N':
            northern_hemisphere = True
        else:
            northern_hemisphere = False
        strike = float(geometry_info['Strike'])
        e, n = self.inv_rotate_coords(data_df['Y'], data_df['X'], -strike, # be careful with the mare2dem coordinate system
                                      (float(geometry_info['East']), float(geometry_info['North'])))
        lat, lon = self.utm_to_latlon(e, n, utm_zone, northern_hemisphere)
        data_df_n = data_df.copy()
        data_df_n['Lat'] = lat
        data_df_n['Lon'] = lon
        return data_df_n

    def merge_data_rx_tx(self, data, rx_data, tx_data):
        """Merge the data, Rx and Tx blocks."""

        merged_df = pd.merge(data, rx_data, on='Rx')
        merged_df = pd.merge(merged_df, tx_data, on='Tx', suffixes=("_rx", "_tx"))
        merged_df.rename(columns={'Type_rx': 'Type', 
                                  'Freq': 'Freq_id',
                                  'Tx': 'Tx_id',
                                  'Rx': 'Rx_id'}, inplace=True)
        freq_dict = self.extract_freq_info()
        merged_df = self.add_freq_column(merged_df, freq_dict)
        merged_df['offset'] = merged_df['Y_rx'] - merged_df['Y_tx']
        merged_df['distance'] = np.sqrt((merged_df['Y_rx'] - merged_df['Y_tx'])**2 + (merged_df['X_rx'] - merged_df['X_tx'])**2 + (merged_df['Z_rx'] - merged_df['Z_tx'])**2)
        return merged_df

    def df_to_json(self, df):
        """Convert DataFrame to JSON."""
        # result = df.to_json(orient='records', date_format='epoch', date_unit='s')
        result = df.to_json(orient='table', index=True)
        # test pivot table
        # pivoted_df = df.pivot_table(index=['Type', 'Tx', 'Rx'], columns='Freq', values='Data')
        # result = pivoted_df.to_json(orient='table', index=True)
        # result = pivoted_df.to_json(orient='records', index=True)
        return result

class CSEMDataFileManager():
    def __init__(self, data_type:str='CSEM'):
        self.data_type = data_type

    def split_data_rx_tx(self, merged_df:pd.DataFrame):
        """Anti-merge the data, Rx and Tx blocks. Re-index Rx and Tx columns."""
        data = merged_df[['Type', 'Freq_id', 'Tx_id', 'Rx_id', 'Data', 'StdError']].copy()
        data.rename(columns={'Freq_id': 'Freq #',
                             'Tx_id': 'Tx #',
                             'Rx_id': 'Rx #'}, inplace=True)

        rx_data = merged_df[['Rx_id', 'X_rx', 'Y_rx', 'Z_rx', 'Theta', 'Alpha', 'Beta', 'Length_rx', 'Name_rx']].copy()
        rx_data.rename(columns={'X_rx': 'X',
                                'Y_rx': 'Y',
                                'Z_rx': 'Z',
                                'Rx_id': 'Rx #',
                                'Length_rx': 'Length',
                                'Name_rx': 'Name'}, inplace=True)
        ## reorder rx_data based on Rx #
        rx_data = rx_data.sort_values(by='Rx #')
        rx_data = rx_data.drop_duplicates()

        tx_data = merged_df[['Tx_id', 'X_tx', 'Y_tx', 'Z_tx', 'Azimuth', 'Dip', 'Length_tx', 'Type_tx', 'Name_tx']].copy()
        tx_data.rename(columns={'X_tx': 'X',
                                'Y_tx': 'Y',
                                'Z_tx': 'Z',
                                'Tx_id': 'Tx #',
                                'Length_tx': 'Length',
                                'Type_tx': 'Type',
                                'Name_tx': 'Name'}, inplace=True)
        ## reorder tx_data based on Rx #
        tx_data = tx_data.sort_values(by='Tx #')
        tx_data = tx_data.drop_duplicates()
        return data, rx_data, tx_data

    def reindex_rx_tx_in_data(self, data:pd.DataFrame):
        """Re-index Rx and Tx columns."""
        tx_ids = data['Tx #'].sort_values().unique()
        rx_ids = data['Rx #'].sort_values().unique()
        tx_id_map = {tx_id: i + 1 for i, tx_id in enumerate(tx_ids)}
        rx_id_map = {rx_id: i + 1 for i, rx_id in enumerate(rx_ids)}
        data['Tx #'] = data['Tx #'].map(tx_id_map)
        data['Rx #'] = data['Rx #'].map(rx_id_map)
        return data

    def json_to_df(self, json_str):
        """Convert JSON to DataFrame."""
        # convert json string to DataFrame
        df = pd.read_json(StringIO(json_str), orient='records', dtype=False)
        return df

    def data_block_to_string(self, data:pd.DataFrame) -> str:
        """Convert the data block to a string.

        Args:
            data (pd.DataFrame): The data block as a DataFrame.

        Returns:
            str: The data block as a string.
        """
        # Rename the columns
        data.rename(columns={'Freq': 'Freq #',
                             'Tx': 'Tx #',
                             'Rx': 'Rx #'}, inplace=True)

        # Apply MARE2DEM (DataMan) formatting to the DataFrame
        data_str = data.to_string(formatters={
            "Type": "{:>4s}".format,
            "Freq #": "{:7d}".format,
            "Tx #": "{:7d}".format,
            "Rx #": "{:7d}".format,
            "Data": "{:22.15g}".format,
            "StdError": "{:22.15g}".format
        }, index=False)
        return data_str

    def rx_block_to_string(self, Rx_data):
        """Convert the DataFrame to a string"""
        # Delete Rx column from Rx data
        # Apply MARE2DEM (DataMan) formatting to the DataFrame
        if 'Rx #' in Rx_data.columns:
            data_str = Rx_data.drop(columns=['Rx #']).to_string(formatters={
                "X": "{:10.6g}".format,
                "Y": "{:15.15g}".format,
                "Z": "{:22.15g}".format,
                "Theta": "{:9.2f}".format,
                "Alpha": "{:9.2f}".format,
                "Beta": "{:9.2f}".format,
                "Length": "{:9.5g}".format,
                    "Name": "{:>10s}".format
                }, index=False)
        else:
            data_str = Rx_data.drop(columns=['Rx']).to_string(formatters={
                "X": "{:10.6g}".format,
                "Y": "{:15.15g}".format,
                "Z": "{:22.15g}".format,
                "Theta": "{:9.2f}".format,
                "Alpha": "{:9.2f}".format,
                "Beta": "{:9.2f}".format,
                "Length": "{:9.5g}".format,
                "Name": "{:>10s}".format
            }, index=False)
        return data_str

    def tx_block_to_string(self, Tx_data: pd.DataFrame):
        """Convert the DataFrame to a string"""
        # Delete Tx column from Tx data
        # Apply MARE2DEM (DataMan) formatting to the DataFrame
        if 'Tx #' in Tx_data.columns:
            data_str = Tx_data.drop(columns=['Tx #']).to_string(formatters={
                "X": "{:10.6g}".format,
                "Y": "{:15.15g}".format,
                "Z": "{:22.15g}".format,
                "Azimuth": "{:9.2f}".format,
                "Dip": "{:9.2f}".format,
                "Length": "{:9.5g}".format,
                "Type": "{:>10s}".format,
                    "Name": "{:>10s}".format
                }, index=False)
        else:
            data_str = Tx_data.drop(columns=['Tx']).to_string(formatters={
                "X": "{:10.6g}".format,
                "Y": "{:15.15g}".format,
                "Z": "{:22.15g}".format,
                "Azimuth": "{:9.2f}".format,
                "Dip": "{:9.2f}".format,
                "Length": "{:9.5g}".format,
                "Type": "{:>10s}".format,
                "Name": "{:>10s}".format
            }, index=False)
        return data_str
    
    def geometry_info_to_string(self, geometry_data):
        """Convert geometry information dictionary back to string format.
        
        Args:
            geometry_data (dict): Dictionary containing geometry information with keys:
                - UTM_zone (int): UTM zone number
                - Hemisphere (str): 'N' or 'S' for northern/southern hemisphere
                - North (float): North coordinate
                - East (float): East coordinate  
                - Strike (float): Strike angle
                
        Returns:
            str: Geometry line in the format used in data files
        """
        # Convert values back to strings in the correct order
        geometry_values = [
            str(geometry_data['UTM_zone']),
            geometry_data['Hemisphere'],
            str(geometry_data['North'].round(2)),
            str(geometry_data['East'].round(2)),
            str(geometry_data['Strike'])
        ]
        
        # Join with spaces to match the original format
        geometry_string = ' '.join(geometry_values)
        
        # Return in the format: "Geometry: <values> ! <comment>"
        return f"UTM of x,y origin (UTM zone, N, E, 2D strike): {geometry_string}\n"

    def update_data_block(self, data_filtered: pd.DataFrame, data_blocks: dict):
        """Update the Data block with the filtered data."""
        # Convert data back to string format
        data_str = self.data_block_to_string(data_filtered)
        # Regular expression to find the number
        number_pattern = re.compile(r'(Data: *)(\d+)')
        # Replace the original number with the new number
        new_header = number_pattern.sub(r'\g<1>' + str(len(data_filtered)), data_blocks['Data'][0])
        # Convert data_columns back to string format (remember to add first line info!)
        blocks_data_str = new_header + '!' + " " * 2 + data_str.replace("\n", "\n" + " " * 3)
        # keep the line breaks
        return blocks_data_str.splitlines(True)

    def update_rx_block(self, rx_data_filtered: pd.DataFrame, data_blocks: dict, rx_type:str='CSEM'):
        """Update the Rx block with the filtered data."""
        # Convert data back to string format
        data_str = self.rx_block_to_string(rx_data_filtered)
        # Regular expression to find the number
        if self.data_type == 'CSEM':
            number_pattern = re.compile(r'(CSEM Receivers: *)(\d+)')
            # Replace the original number with the new number
            new_header = number_pattern.sub(r'\g<1>' + str(len(rx_data_filtered)), data_blocks['Rx'][0])
        elif self.data_type == 'MT':
            number_pattern = re.compile(r'(MT Receivers: *)(\d+)')
            # Replace the original number with the new number
            new_header = number_pattern.sub(r'\g<1>' + str(len(rx_data_filtered)), data_blocks['Rx'][0])
        elif self.data_type == 'joint' and rx_type == 'CSEM':
            number_pattern = re.compile(r'(CSEM Receivers: *)(\d+)')
            # Replace the original number with the new number
            new_header = number_pattern.sub(r'\g<1>' + str(len(rx_data_filtered)), data_blocks['Rx_CSEM'][0])
        elif self.data_type == 'joint' and rx_type == 'MT':
            number_pattern = re.compile(r'(MT Receivers: *)(\d+)')
            # Replace the original number with the new number
            new_header = number_pattern.sub(r'\g<1>' + str(len(rx_data_filtered)), data_blocks['Rx_MT'][0])
        else:
            raise ValueError(f"Invalid data type: {self.data_type}")
        # Convert data_columns back to string format (remember to add first line info!)
        blocks_data_str = new_header + '!' + " " * 2 + data_str.replace("\n", "\n" + " " * 3) + "\n"
        # keep the line breaks
        return blocks_data_str.splitlines(True)

    def update_tx_block(self, tx_data_filtered: pd.DataFrame, data_blocks: dict):
        """Update the Tx block with the filtered data."""
        # Convert data back to string format
        data_str = self.tx_block_to_string(tx_data_filtered)
        # Regular expression to find the number
        number_pattern = re.compile(r'(Transmitters: *)(\d+)')
        # Replace the original number with the new number
        new_header = number_pattern.sub(r'\g<1>' + str(len(tx_data_filtered)), data_blocks['Tx'][0])
        # Convert data_columns back to string format (remember to add first line info!)
        blocks_data_str = new_header + '!' + " " * 2 + data_str.replace("\n", "\n" + " " * 3) + "\n"
        # keep the line breaks
        return blocks_data_str.splitlines(True)

    def update_blocks(self, data_df, data_blocks):
        print(data_blocks.keys())
        data, rx_data, tx_data = self.split_data_rx_tx(data_df)
        data = self.reindex_rx_tx_in_data(data)
        data_blocks['Data'] = self.update_data_block(data, data_blocks)
        data_blocks['Tx'] = self.update_tx_block(tx_data, data_blocks)
        data_blocks['Rx'] = self.update_rx_block(rx_data, data_blocks)
        return data_blocks

    def blocks_to_str(self, data_blocks):
        # Define all types of data info string list
        AllBlocks = []
        
        # only support EMData_2.2 format for now
        data_blocks['Format'] = 'Format: EMData_2.2\n'

        # Define the correct order of blocks for MARE2DEM format
        # Auto-detect data type from available blocks if needed
        if hasattr(self, 'data_type'):
            data_type = self.data_type
        elif 'Frequencies_MT' in data_blocks and 'Frequencies_CSEM' in data_blocks:
            data_type = 'joint'
        elif 'Frequencies_CSEM' in data_blocks:
            data_type = 'CSEM'
        else:
            data_type = 'MT'
            
        if data_type == 'CSEM':
            block_order = [
                "Format",
                "Geometry", 
                "Phase",
                "Reciprocity",
                "Frequencies",
                "Tx",
                "Rx",
                "Data",
            ]
        elif data_type == 'MT':
            block_order = [
                "Format",
                "Geometry",
                "Reciprocity", 
                "Frequencies",
                "Rx",
                "Data",
            ]
        elif data_type == 'joint':
            block_order = [
                "Format",
                "Geometry",
                "Phase",
                "Reciprocity",
                "Frequencies_CSEM",
                "Frequencies_MT",
                "Tx",
                "Rx_CSEM",
                "Rx_MT", 
                "Data",
            ]
        else:
            # Fallback to original behavior if data_type is not set
            block_order = list(data_blocks.keys())

        # Write blocks in the correct order
        for block_name in block_order:
            if block_name in data_blocks and data_blocks[block_name]:
                AllBlocks.append(''.join(data_blocks[block_name]))

        # Join the lines back into a string
        AllData = ''.join(AllBlocks)
        return AllData
    
    def increase_error_floor_rx(self, data_df, errfloor, rx, data_type_code_amplitude:str='28', data_type_code_phase:str='24'):
        """Increase the error floor for certain transmitters/receivers (depends on if reciprocity is applied).
        Args:
            data_df: pandas DataFrame containing the data
            errfloor: error floor to increase
            rx: list of receiver indices to increase the error floor for (if 'all', increase for all receivers)
            data_type_code_amplitude: data type code for amplitude
            data_type_code_phase: data type code for phase
        """
        data_df_n = data_df.copy()
        if data_type_code_amplitude in ['27', '28', '29', '37', '38', '39']: # amplitude in log10
            if rx == 'all':
                # extract amplitude error in log10
                eA_log10 = data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, ['StdError']]
                # extract phase error
                eP = data_df_n.loc[data_df_n['Type'] == data_type_code_phase, ['StdError']]
                UncA = eA_log10 * np.log(10)
                UncP = 2 * np.sin(np.deg2rad(eP / 2))

                UncA_n = np.fmax(UncA, errfloor)
                UncP_n = np.fmax(UncP, errfloor)
                eA_log10_n = UncA_n / np.log(10)
                # len(UncA) can be different from len(UncP)
                eP_n = 2 * np.rad2deg(np.arcsin(UncP_n / 2))

                data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, ['StdError']] = eA_log10_n
                data_df_n.loc[data_df_n['Type'] == data_type_code_phase, ['StdError']] = eP_n.to_numpy()
            else:
                # extract amplitude error in log10
                eA_log10 = data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Rx'].isin(rx)), ['StdError']]
                # extract phase error
                eP = data_df_n.loc[(data_df_n['Type'] == data_type_code_phase) & (data_df_n['Rx'].isin(rx)), ['StdError']]
                UncA = eA_log10 * np.log(10)
                UncP = 2 * np.sin(np.deg2rad(eP / 2))

                UncA_n = np.fmax(UncA, errfloor)
                UncP_n = np.fmax(UncP, errfloor)
                eA_log10_n = UncA_n / np.log(10)
                # len(UncA) can be different from len(UncP)
                eP_n = 2 * np.rad2deg(np.arcsin(UncP_n / 2))

                data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Rx'].isin(rx)), ['StdError']] = eA_log10_n
                data_df_n.loc[(data_df_n['Type'] == data_type_code_phase) & (data_df_n['Rx'].isin(rx)), ['StdError']] = eP_n.to_numpy()
        elif data_type_code_amplitude in ['21', '23', '25', '31', '33', '35']: # amplitude
            if rx == 'all':
                # extract amplitude error
                eA = data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, ['StdError']]
                # extract phase error
                eP = data_df_n.loc[data_df_n['Type'] == data_type_code_phase, ['StdError']]
                UncA = eA['StdError'] / data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, 'Data'].values
                UncP = 2 * np.sin(np.deg2rad(eP / 2))

                UncA_n = np.fmax(UncA, errfloor)
                UncP_n = np.fmax(UncP, errfloor)
                eA_n = UncA_n * data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, 'Data'].values
                # len(UncA) can be different from len(UncP)
                eP_n = 2 * np.rad2deg(np.arcsin(UncP_n / 2))

                data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, ['StdError']] = eA_n
                data_df_n.loc[data_df_n['Type'] == data_type_code_phase, ['StdError']] = eP_n.to_numpy()
            else:
                # extract amplitude error
                eA = data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Rx'].isin(rx)), ['StdError']]
                # extract phase error
                eP = data_df_n.loc[(data_df_n['Type'] == data_type_code_phase) & (data_df_n['Rx'].isin(rx)), ['StdError']]
                UncA = eA['StdError'] / data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Rx'].isin(rx)), 'Data'].values
                UncP = 2 * np.sin(np.deg2rad(eP / 2))

                UncA_n = np.fmax(UncA, errfloor)
                UncP_n = np.fmax(UncP, errfloor)
                eA_n = UncA_n * data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Rx'].isin(rx)), 'Data'].values
                # len(UncA) can be different from len(UncP)
                eP_n = 2 * np.rad2deg(np.arcsin(UncP_n / 2))

                data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Rx'].isin(rx)), ['StdError']] = eA_n
                data_df_n.loc[(data_df_n['Type'] == data_type_code_phase) & (data_df_n['Rx'].isin(rx)), ['StdError']] = eP_n.to_numpy()
        else:
            raise ValueError(f"Invalid data type code for amplitude (only support 21, 23, 25, 27, 28, 29, 31, 33, 35, 37, 38, 39): {data_type_code_amplitude}")
        return data_df_n

    def increase_error_floor_tx(self, data_df, errfloor, tx, data_type_code_amplitude:str='28', data_type_code_phase:str='24'):
        """Increase the error floor for certain receivers/transmitters 
        (depends on if reciprocity is applied).
        Args:
            data_df: pandas DataFrame containing the data
            errfloor: error floor to increase
            tx: list of transmitter indices to increase the error floor for (if 'all', increase for all transmitters)
            data_type_code_amplitude: data type code for amplitude
            data_type_code_phase: data type code for phase
        """
        data_df_n = data_df.copy()
        if data_type_code_amplitude in ['27', '28', '29', '37', '38', '39']: # amplitude in log10
            if tx == 'all':
                # extract amplitude error in log10
                eA_log10 = data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, ['StdError']]
                # extract phase error
                eP = data_df_n.loc[data_df_n['Type'] == data_type_code_phase, ['StdError']]
                UncA = eA_log10 * np.log(10)
                UncP = 2 * np.sin(np.deg2rad(eP / 2))

                UncA_n = np.fmax(UncA, errfloor)
                UncP_n = np.fmax(UncP, errfloor)
                eA_log10_n = UncA_n / np.log(10)
                # len(UncA) can be different from len(UncP)
                eP_n = 2 * np.rad2deg(np.arcsin(UncP_n / 2))

                data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, ['StdError']] = eA_log10_n
                data_df_n.loc[data_df_n['Type'] == data_type_code_phase, ['StdError']] = eP_n.to_numpy()
            else:
                # extract amplitude error in log10
                eA_log10 = data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Tx'].isin(tx)), ['StdError']]
                # extract amplitude error
                eP = data_df_n.loc[(data_df_n['Type'] == data_type_code_phase) & (data_df_n['Tx'].isin(tx)), ['StdError']]
                UncA = eA_log10 * np.log(10)
                UncP = 2 * np.sin(np.deg2rad(eP / 2))

                UncA_n = np.fmax(UncA, errfloor)
                UncP_n = np.fmax(UncP, errfloor)
                eA_log10_n = UncA_n / np.log(10)
                # len(UncA) can be different from len(UncP)
                eP_n = 2 * np.rad2deg(np.arcsin(UncP_n / 2))

                data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Tx'].isin(tx)), ['StdError']] = eA_log10_n
                data_df_n.loc[(data_df_n['Type'] == data_type_code_phase) & (data_df_n['Tx'].isin(tx)), ['StdError']] = eP_n.to_numpy()
        elif data_type_code_amplitude in ['21', '23', '25', '31', '33', '35']: # amplitude
            if tx == 'all':
                # extract amplitude error
                eA = data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, ['StdError']]
                # extract phase error
                eP = data_df_n.loc[data_df_n['Type'] == data_type_code_phase, ['StdError']]
                # Select the amplitude 'Data' column as a Series to align dimensions with eA['StdError']
                UncA = eA['StdError'] / data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, 'Data'].values
                UncP = 2 * np.sin(np.deg2rad(eP / 2))

                UncA_n = np.fmax(UncA, errfloor)
                UncP_n = np.fmax(UncP, errfloor)
                eA_n = UncA_n * data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, 'Data'].values
                # len(UncA) can be different from len(UncP)
                eP_n = 2 * np.rad2deg(np.arcsin(UncP_n / 2))

                data_df_n.loc[data_df_n['Type'] == data_type_code_amplitude, ['StdError']] = eA_n
                data_df_n.loc[data_df_n['Type'] == data_type_code_phase, ['StdError']] = eP_n.to_numpy()
            else:
                # extract amplitude error
                eA = data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Tx'].isin(tx)), ['StdError']]
                # extract phase error
                eP = data_df_n.loc[(data_df_n['Type'] == data_type_code_phase) & (data_df_n['Tx'].isin(tx)), ['StdError']]
                # Select the amplitude 'Data' column as a Series to align dimensions with eA['StdError']
                UncA = eA['StdError'] / data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Tx'].isin(tx)), 'Data'].values
                UncP = 2 * np.sin(np.deg2rad(eP / 2))

                UncA_n = np.fmax(UncA, errfloor)
                UncP_n = np.fmax(UncP, errfloor)
                eA_n = UncA_n * data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Tx'].isin(tx)), 'Data'].values
                # len(UncA) can be different from len(UncP)
                eP_n = 2 * np.rad2deg(np.arcsin(UncP_n / 2))

                data_df_n.loc[(data_df_n['Type'] == data_type_code_amplitude) & (data_df_n['Tx'].isin(tx)), ['StdError']] = eA_n
                data_df_n.loc[(data_df_n['Type'] == data_type_code_phase) & (data_df_n['Tx'].isin(tx)), ['StdError']] = eP_n.to_numpy()
        else:
            raise ValueError(f"Invalid data type code for amplitude (only support 21, 23, 25, 27, 28, 29, 31, 33, 35, 37, 38, 39): {data_type_code_amplitude}")
        return data_df_n

    def log10amp2amp(self, data_df, data_type_code_amplitude:str='28'):
        """Convert log10 amplitude (27, 28, 29, 37, 38, 39) to amplitude (21, 23, 25, 31, 33, 35) and update the standard error."""
        data_df_n = data_df.copy()
        data_type_code_amplitude_new = {
            '27': '21',
            '28': '23',
            '29': '25',
            '37': '31',
            '38': '33',
            '39': '35'
        }.get(data_type_code_amplitude, None)
        if data_type_code_amplitude_new is None:
            raise ValueError(f"Invalid data type code for log 10 amplitude (only support 27, 28, 29, 37, 38, 39): {data_type_code_amplitude}")
        # Create a mask for the rows to update
        mask = data_df_n['Type'] == data_type_code_amplitude
        # Update each column separately to avoid dtype incompatibility
        data_df_n.loc[mask, 'Type'] = data_type_code_amplitude_new
        data_df_n.loc[mask, 'Data'] = 10 ** data_df_n.loc[mask, 'Data'].values
        data_df_n.loc[mask, 'StdError'] = data_df_n.loc[mask, 'StdError'].values * np.log(10) * data_df_n.loc[mask, 'Data'].values
        return data_df_n

    def update_depth_bathymetry(self, data_df, bathymetry_data: pd.DataFrame, tx_or_rx: str = 'tx'):
        """Update the Z depth based on bathymetry data."""
        data_df_n = data_df.copy()
        if tx_or_rx == 'tx':
            data_df_n['Z_tx'] = np.interp(data_df_n['Y_tx'], bathymetry_data['inline_distance'], bathymetry_data['depth'])
            data_df_n['Z_tx'] = np.round(data_df_n['Z_tx'] - 0.1, 2)
        elif tx_or_rx == 'rx':
            data_df_n['Z_rx'] = np.interp(data_df_n['Y_rx'], bathymetry_data['inline_distance'], bathymetry_data['depth'])
            data_df_n['Z_rx'] = np.round(data_df_n['Z_rx'] - 0.1, 2)
        else:
            raise ValueError(f"Invalid tx_or_rx: {tx_or_rx}")
        return data_df_n
    
    def calculate_dip(self, data_df, bathymetry_data: pd.DataFrame, tx_or_rx: str = 'tx'):
        """Calculate the receiver's dip based on bathymetry data."""
        data_df_n = data_df.copy()
        # get bathymetry gradient
        bathymetry_gradient = np.gradient(bathymetry_data['depth'], bathymetry_data['inline_distance'])
        # get the gradient at the receiver's location
        if tx_or_rx == 'tx':
            gradient = np.interp(data_df_n['Y_tx'], bathymetry_data['inline_distance'], bathymetry_gradient)
            data_df_n['Dip'] = np.rad2deg(np.arctan2(gradient, 1))
        elif tx_or_rx == 'rx':
            gradient = np.interp(data_df_n['Y_rx'], bathymetry_data['inline_distance'], bathymetry_gradient)
            data_df_n['Beta'] = np.rad2deg(np.arctan2(gradient, 1))
        else:
            raise ValueError(f"Invalid tx_or_rx: {tx_or_rx}")
        return data_df_n, bathymetry_gradient

    def merge_csem_datafiles(self, file1_path: str, file2_path: str, output_path: Optional[str] = None) -> str:
        """
        Merge two CSEM data files into one file.
        
        Args:
            file1_path (str): Path to the first data file
            file2_path (str): Path to the second data file
            output_path (str, optional): Path for the output merged file. If None, returns the merged content as string.
            
        Returns:
            str: Path to the merged file or the merged content as string if output_path is None
            
        Raises:
            ValueError: If the files cannot be merged due to incompatible geometry, phase, or data types
            FileNotFoundError: If either input file doesn't exist
            Exception: For other merge-related errors
        """
        try:
            # Read both files
            reader1 = CSEMDataFileReader(file1_path, self.data_type)
            reader2 = CSEMDataFileReader(file2_path, self.data_type)
            
            # Validate that both files have the same data type
            if reader1.data_type != reader2.data_type:
                raise ValueError(f"Data types don't match: {reader1.data_type} vs {reader2.data_type}")
            
            # Validate geometry compatibility
            geometry1 = reader1.extract_geometry_info()
            geometry2 = reader2.extract_geometry_info()
            
            if not self._are_geometries_compatible(geometry1, geometry2):
                raise ValueError("Geometries are not compatible for merging. UTM zone, hemisphere, origin, and strike must match.")
            
            # Validate phase compatibility (only for CSEM and joint data types)
            if self.data_type in ['CSEM', 'joint']:
                phase1 = self._extract_phase_info(reader1.blocks.get('Phase', []))
                phase2 = self._extract_phase_info(reader2.blocks.get('Phase', []))
                
                if not self._are_phases_compatible(phase1, phase2):
                    raise ValueError("Phase information is not compatible for merging.")
            
            # Validate reciprocity compatibility
            reciprocity1 = self._extract_reciprocity_info(reader1.blocks.get('Reciprocity', []))
            reciprocity2 = self._extract_reciprocity_info(reader2.blocks.get('Reciprocity', []))
            
            if not self._are_reciprocities_compatible(reciprocity1, reciprocity2):
                raise ValueError("Reciprocity information is not compatible for merging.")
            
            # Merge the data
            merged_blocks = self._merge_blocks(reader1, reader2)
            
            # Convert merged blocks to string
            merged_content = self.blocks_to_str(merged_blocks)
            
            # Write to file if output_path is provided
            if output_path:
                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(merged_content)
                return output_path
            else:
                return merged_content
                
        except FileNotFoundError as e:
            raise FileNotFoundError(f"Input file not found: {e}") from e
        except Exception as e:
            raise ValueError(f"Error merging data files: {e}") from e

    def _are_geometries_compatible(self, geometry1: dict, geometry2: dict) -> bool:
        """Check if two geometry configurations are compatible for merging."""
        required_fields = ['UTM_zone', 'Hemisphere', 'North', 'East', 'Strike']
        
        for field in required_fields:
            if geometry1.get(field) != geometry2.get(field):
                return False
        return True

    def _extract_phase_info(self, phase_block: list) -> dict:
        """Extract phase information from phase block."""
        if not phase_block:
            return {}
        
        phase_info = {}
        for line in phase_block[1:]:  # Skip header line
            if ':' in line:
                key, value = line.split(':', 1)
                phase_info[key.strip()] = value.strip()
        return phase_info

    def _are_phases_compatible(self, phase1: dict, phase2: dict) -> bool:
        """Check if two phase configurations are compatible for merging."""
        # If both are empty, they're compatible
        if not phase1 and not phase2:
            return True
        
        # If one is empty and the other isn't, they're not compatible
        if bool(phase1) != bool(phase2):
            return False
        
        # Check if all keys and values match
        return phase1 == phase2

    def _extract_reciprocity_info(self, reciprocity_block: list) -> dict:
        """Extract reciprocity information from reciprocity block."""
        if not reciprocity_block:
            return {}
        
        reciprocity_info = {}
        for line in reciprocity_block[1:]:  # Skip header line
            if ':' in line:
                key, value = line.split(':', 1)
                reciprocity_info[key.strip()] = value.strip()
        return reciprocity_info

    def _are_reciprocities_compatible(self, reciprocity1: dict, reciprocity2: dict) -> bool:
        """Check if two reciprocity configurations are compatible for merging."""
        # If both are empty, they're compatible
        if not reciprocity1 and not reciprocity2:
            return True
        
        # If one is empty and the other isn't, they're not compatible
        if bool(reciprocity1) != bool(reciprocity2):
            return False
        
        # Check if all keys and values match
        return reciprocity1 == reciprocity2

    def _merge_blocks(self, reader1: CSEMDataFileReader, reader2: CSEMDataFileReader) -> dict:
        """Merge blocks from two readers."""
        merged_blocks = {}
        
        # Copy format and geometry from first file (they should be identical)
        merged_blocks['Format'] = reader1.blocks['Format']
        merged_blocks['Geometry'] = reader1.blocks['Geometry']
        
        # Merge phase and reciprocity (should be identical, but use first file's)
        if 'Phase' in reader1.blocks:
            merged_blocks['Phase'] = reader1.blocks['Phase']
        if 'Reciprocity' in reader1.blocks:
            merged_blocks['Reciprocity'] = reader1.blocks['Reciprocity']
        
        # Merge frequencies
        merged_blocks.update(self._merge_frequencies(reader1, reader2))
        
        # Merge transmitters
        if 'Tx' in reader1.blocks:
            merged_blocks['Tx'] = self._merge_transmitters(reader1, reader2)
        
        # Merge receivers
        merged_blocks.update(self._merge_receivers(reader1, reader2))
        
        # Merge data
        merged_blocks['Data'] = self._merge_data(reader1, reader2)
        
        # Update frequency indices in the merged data to match the merged frequency block
        merged_blocks = self._update_frequency_indices(merged_blocks, reader1, reader2)
        
        return merged_blocks

    def _update_frequency_indices(self, merged_blocks: dict, reader1: CSEMDataFileReader, reader2: CSEMDataFileReader) -> dict:
        """
        Update frequency indices in the merged data to match the merged frequency block.
        
        Args:
            merged_blocks: Dictionary containing merged blocks
            reader1: First file reader
            reader2: Second file reader
            
        Returns:
            Updated merged_blocks with corrected frequency indices
        """
        # Extract frequency information from both files
        freq1 = reader1.extract_freq_info()
        freq2 = reader2.extract_freq_info()
        
        # Create mapping from old frequency indices to new ones
        freq_mapping = {}
        
        # Get the merged frequency values from the merged frequency block
        if 'Frequencies' in merged_blocks:
            freq_lines = merged_blocks['Frequencies']
            merged_freq_values = []
            for line in freq_lines[1:]:  # Skip header
                if line.strip():
                    merged_freq_values.append(float(line.strip()))
            
            # Create mapping for file1 frequencies
            for old_idx, freq_value in freq1.items():
                new_idx = merged_freq_values.index(freq_value) + 1  # +1 because indices start from 1
                freq_mapping[old_idx] = new_idx
            
            # Create mapping for file2 frequencies
            for old_idx, freq_value in freq2.items():
                new_idx = merged_freq_values.index(freq_value) + 1  # +1 because indices start from 1
                freq_mapping[old_idx] = new_idx
        
        # Update frequency indices in the data block
        if 'Data' in merged_blocks:
            data_lines = merged_blocks['Data']
            updated_data_lines = []
            
            for line in data_lines:
                if line.startswith('Data:') or line.startswith('!'):
                    # Header or comment line, keep as is
                    updated_data_lines.append(line)
                else:
                    # Data line - update frequency index
                    parts = line.split()
                    if len(parts) >= 4:  # Ensure we have enough columns
                        try:
                            old_freq_idx = int(parts[1])  # Freq is typically the second column
                            if old_freq_idx in freq_mapping:
                                parts[1] = str(freq_mapping[old_freq_idx])
                            updated_data_lines.append(' '.join(parts) + '\n')
                        except (ValueError, IndexError):
                            # If parsing fails, keep the original line
                            updated_data_lines.append(line)
                    else:
                        updated_data_lines.append(line)
            
            merged_blocks['Data'] = updated_data_lines
        
        return merged_blocks

    def _merge_frequencies(self, reader1: CSEMDataFileReader, reader2: CSEMDataFileReader) -> dict:
        """Merge frequency blocks from two readers."""
        merged_freq = {}
        
        if self.data_type == 'CSEM':
            freq1 = reader1.extract_freq_info()
            freq2 = reader2.extract_freq_info()
            
            # Combine frequencies and remove duplicates
            all_freqs = list(freq1.values()) + list(freq2.values())
            unique_freqs = sorted(list(set(all_freqs)))
            
            # Create new frequency block
            freq_lines = ['Frequencies: ' + str(len(unique_freqs)) + '\n']
            for freq in unique_freqs:
                freq_lines.append(f'{freq}\n')
            
            merged_freq['Frequencies'] = freq_lines
            
        elif self.data_type == 'MT':
            freq1 = reader1.extract_freq_info()
            freq2 = reader2.extract_freq_info()
            
            # Combine frequencies and remove duplicates
            all_freqs = list(freq1.values()) + list(freq2.values())
            unique_freqs = sorted(list(set(all_freqs)))
            
            # Create new frequency block
            freq_lines = ['MT Frequencies: ' + str(len(unique_freqs)) + '\n']
            for freq in unique_freqs:
                freq_lines.append(f'{freq}\n')
            
            merged_freq['Frequencies'] = freq_lines
            
        elif self.data_type == 'joint':
            # Handle both CSEM and MT frequencies
            if 'Frequencies_CSEM' in reader1.blocks:
                # freq1_csem = reader1.extract_freq_info()  # This would need to be modified for joint
                # freq2_csem = reader2.extract_freq_info()
                # Similar logic for CSEM frequencies
                pass
                
            if 'Frequencies_MT' in reader1.blocks:
                # Similar logic for MT frequencies
                pass
        
        return merged_freq

    def _merge_transmitters(self, reader1: CSEMDataFileReader, reader2: CSEMDataFileReader) -> list:
        """Merge transmitter blocks from two readers."""
        # Extract transmitter data
        tx1_data = reader1.tx_data_block_init(reader1.blocks['Tx'])
        tx2_data = reader2.tx_data_block_init(reader2.blocks['Tx'])
        
        # Combine transmitters
        combined_tx = pd.concat([tx1_data, tx2_data], ignore_index=True)
        
        # Remove duplicates based on position and properties
        combined_tx = combined_tx.drop_duplicates(subset=['X', 'Y', 'Z', 'Azimuth', 'Dip', 'Length', 'Type', 'Name'])
        
        # Reindex transmitters
        combined_tx['Tx'] = range(1, len(combined_tx) + 1)
        
        # Convert back to string format
        tx_str = self.tx_block_to_string(combined_tx)
        
        # Create new transmitter block
        tx_lines = ['Transmitters: ' + str(len(combined_tx)) + '\n']
        tx_lines.append('!  ' + tx_str.replace('\n', '\n   ') + '\n')
        
        return tx_lines

    def _merge_receivers(self, reader1: CSEMDataFileReader, reader2: CSEMDataFileReader) -> dict:
        """Merge receiver blocks from two readers."""
        merged_rx = {}
        
        if self.data_type == 'CSEM':
            rx1_data = reader1.rx_data_block_init(reader1.blocks['Rx'], 'CSEM')
            rx2_data = reader2.rx_data_block_init(reader2.blocks['Rx'], 'CSEM')
            
            # Combine receivers
            combined_rx = pd.concat([rx1_data, rx2_data], ignore_index=True)
            
            # Remove duplicates based on position and properties
            combined_rx = combined_rx.drop_duplicates(subset=['X', 'Y', 'Z', 'Theta', 'Alpha', 'Beta', 'Length', 'Name'])
            
            # Reindex receivers
            combined_rx['Rx'] = range(1, len(combined_rx) + 1)
            
            # Convert back to string format
            rx_str = self.rx_block_to_string(combined_rx)
            
            # Create new receiver block
            rx_lines = ['CSEM Receivers: ' + str(len(combined_rx)) + '\n']
            rx_lines.append('!  ' + rx_str.replace('\n', '\n   ') + '\n')
            
            merged_rx['Rx'] = rx_lines
            
        elif self.data_type == 'MT':
            rx1_data = reader1.rx_data_block_init(reader1.blocks['Rx'], 'MT')
            rx2_data = reader2.rx_data_block_init(reader2.blocks['Rx'], 'MT')
            
            # Combine receivers
            combined_rx = pd.concat([rx1_data, rx2_data], ignore_index=True)
            
            # Remove duplicates based on position and properties
            combined_rx = combined_rx.drop_duplicates(subset=['X', 'Y', 'Z', 'Theta', 'Alpha', 'Beta', 'Length', 'SolveStatic', 'Name'])
            
            # Reindex receivers
            combined_rx['Rx'] = range(1, len(combined_rx) + 1)
            
            # Convert back to string format
            rx_str = self.rx_block_to_string(combined_rx)
            
            # Create new receiver block
            rx_lines = ['MT Receivers: ' + str(len(combined_rx)) + '\n']
            rx_lines.append('!  ' + rx_str.replace('\n', '\n   ') + '\n')
            
            merged_rx['Rx'] = rx_lines
            
        elif self.data_type == 'joint':
            # Handle both CSEM and MT receivers
            if 'Rx_CSEM' in reader1.blocks:
                # Similar logic for CSEM receivers
                pass
            if 'Rx_MT' in reader1.blocks:
                # Similar logic for MT receivers
                pass
        
        return merged_rx

    def _merge_data(self, reader1: CSEMDataFileReader, reader2: CSEMDataFileReader) -> list:
        """Merge data blocks from two readers with proper deduplication and conflict handling."""
        # Extract data from both files
        data1 = reader1.data_block_init(reader1.blocks['Data'])
        data2 = reader2.data_block_init(reader2.blocks['Data'])
        
        # Get transmitter and receiver data for mapping
        tx1_data = reader1.tx_data_block_init(reader1.blocks['Tx']) if 'Tx' in reader1.blocks else pd.DataFrame()
        tx2_data = reader2.tx_data_block_init(reader2.blocks['Tx']) if 'Tx' in reader2.blocks else pd.DataFrame()
        
        rx1_data = reader1.rx_data_block_init(reader1.blocks['Rx']) if 'Rx' in reader1.blocks else pd.DataFrame()
        rx2_data = reader2.rx_data_block_init(reader2.blocks['Rx']) if 'Rx' in reader2.blocks else pd.DataFrame()
        
        # Create mapping for transmitter and receiver indices
        tx_mapping = self._create_tx_mapping(tx1_data, tx2_data)
        rx_mapping = self._create_rx_mapping(rx1_data, rx2_data)
        
        # Update transmitter and receiver indices in data2
        if not tx_mapping.empty:
            data2['Tx'] = data2['Tx'].map(tx_mapping)
        if not rx_mapping.empty:
            data2['Rx'] = data2['Rx'].map(rx_mapping)
        
        # Add source file identifier to track conflicts
        data1['source_file'] = 'file1'
        data2['source_file'] = 'file2'
        
        # Merge data with deduplication and conflict handling
        merged_data, conflicts = self._merge_data_with_deduplication(data1, data2)
        
        # Report conflicts if any
        if conflicts:
            print("WARNING: Data conflicts detected during merge:")
            for conflict in conflicts:
                print(f"  Conflict for Tx={conflict['Tx']}, Rx={conflict['Rx']}, Freq={conflict['Freq']}, Type={conflict['Type']}:")
                print(f"    File1: Data={conflict['data1']}, StdErr={conflict['stderr1']}")
                print(f"    File2: Data={conflict['data2']}, StdErr={conflict['stderr2']}")
                print("    Resolution: Using File1 data with File1 StdErr")
                print()
        else:
            print("No data value conflicts detected during merge. Merged data successfully.")
        
        # Remove source file column before final output
        merged_data = merged_data.drop(columns=['source_file'])
        
        # Convert back to string format
        data_str = self.data_block_to_string(merged_data)
        
        # Create new data block
        data_lines = ['Data: ' + str(len(merged_data)) + '\n']
        data_lines.append('!  ' + data_str.replace('\n', '\n   ') + '\n')
        
        return data_lines

    def _merge_data_with_deduplication(self, data1: pd.DataFrame, data2: pd.DataFrame) -> tuple:
        """
        Merge data with proper deduplication and conflict handling.
        
        Args:
            data1: DataFrame from first file
            data2: DataFrame from second file
            
        Returns:
            tuple: (merged_data, conflicts_list)
        """
        # Combine both datasets
        combined_data = pd.concat([data1, data2], ignore_index=True)
        
        # Define the key columns for identifying duplicate data points
        key_columns = ['Type', 'Freq', 'Tx', 'Rx']
        
        # Group by the key columns to identify duplicates
        grouped = combined_data.groupby(key_columns, observed=True)
        
        merged_rows = []
        conflicts = []
        
        for (data_type, freq, tx, rx), group in grouped:
            if len(group) == 1:
                # No duplicate, just add the row
                merged_rows.append(group.iloc[0])
            else:
                # Duplicate found - check for conflicts
                row1 = group.iloc[0]
                row2 = group.iloc[1]
                
                # Check if data values are the same (within tolerance)
                data_tolerance = 1e-10
                data_match = abs(row1['Data'] - row2['Data']) < data_tolerance
                
                # Check if stdErr values are the same (within tolerance)
                stderr_tolerance = 1e-10
                stderr_match = abs(row1['StdError'] - row2['StdError']) < stderr_tolerance
                
                if data_match and stderr_match:
                    # Perfect match - use first file's data
                    merged_rows.append(row1)
                elif data_match and not stderr_match:
                    # Same data, different stdErr - use first file's data and stdErr
                    merged_rows.append(row1)
                    conflicts.append({
                        'Tx': tx,
                        'Rx': rx,
                        'Freq': freq,
                        'Type': data_type,
                        'data1': row1['Data'],
                        'data2': row2['Data'],
                        'stderr1': row1['StdError'],
                        'stderr2': row2['StdError'],
                        'conflict_type': 'different_stdErr'
                    })
                else:
                    # Different data values - this is a serious conflict
                    merged_rows.append(row1)  # Use first file's data
                    conflicts.append({
                        'Tx': tx,
                        'Rx': rx,
                        'Freq': freq,
                        'Type': data_type,
                        'data1': row1['Data'],
                        'data2': row2['Data'],
                        'stderr1': row1['StdError'],
                        'stderr2': row2['StdError'],
                        'conflict_type': 'different_data'
                    })
        
        # Convert back to DataFrame
        merged_data = pd.DataFrame(merged_rows)
        
        # Sort by the key columns for consistent ordering
        merged_data = merged_data.sort_values(key_columns).reset_index(drop=True)
        
        return merged_data, conflicts

    def _create_tx_mapping(self, tx1_data: pd.DataFrame, tx2_data: pd.DataFrame) -> pd.Series:
        """Create mapping for transmitter indices when merging."""
        if tx1_data.empty or tx2_data.empty:
            return pd.Series()
        
        # Find matching transmitters based on position and properties
        tx_mapping = {}
        tx2_start_index = len(tx1_data) + 1
        
        for _, row2 in tx2_data.iterrows():
            # Check if this transmitter matches any in tx1_data
            matches = tx1_data[
                (tx1_data['X'] == row2['X']) &
                (tx1_data['Y'] == row2['Y']) &
                (tx1_data['Z'] == row2['Z']) &
                (tx1_data['Azimuth'] == row2['Azimuth']) &
                (tx1_data['Dip'] == row2['Dip']) &
                (tx1_data['Length'] == row2['Length']) &
                (tx1_data['Type'] == row2['Type']) &
                (tx1_data['Name'] == row2['Name'])
            ]
            
            if not matches.empty:
                # Use the index from tx1_data
                tx_mapping[row2['Tx']] = matches.iloc[0]['Tx']
            else:
                # Use new index
                tx_mapping[row2['Tx']] = tx2_start_index
                tx2_start_index += 1
        
        return pd.Series(tx_mapping)

    def _create_rx_mapping(self, rx1_data: pd.DataFrame, rx2_data: pd.DataFrame) -> pd.Series:
        """Create mapping for receiver indices when merging."""
        if rx1_data.empty or rx2_data.empty:
            return pd.Series()
        
        # Find matching receivers based on position and properties
        rx_mapping = {}
        rx2_start_index = len(rx1_data) + 1
        
        for _, row2 in rx2_data.iterrows():
            # Check if this receiver matches any in rx1_data
            matches = rx1_data[
                (rx1_data['X'] == row2['X']) &
                (rx1_data['Y'] == row2['Y']) &
                (rx1_data['Z'] == row2['Z']) &
                (rx1_data['Theta'] == row2['Theta']) &
                (rx1_data['Alpha'] == row2['Alpha']) &
                (rx1_data['Beta'] == row2['Beta']) &
                (rx1_data['Length'] == row2['Length']) &
                (rx1_data['Name'] == row2['Name'])
            ]
            
            if not matches.empty:
                # Use the index from rx1_data
                rx_mapping[row2['Rx']] = matches.iloc[0]['Rx']
            else:
                # Use new index
                rx_mapping[row2['Rx']] = rx2_start_index
                rx2_start_index += 1
        
        return pd.Series(rx_mapping)
