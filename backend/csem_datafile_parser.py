import re
import pandas as pd
import numpy as np
import utm
from io import StringIO

class CSEMDataFileReader():
    """_summary_
    """
    def __init__(self, file_path, data_type='CSEM'):
        self.file_path = file_path
        self.extracted_blocks = []
        self.data_type = data_type
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
        else:
            raise ValueError(f"Invalid data type: {self.data_type}")
        self.blocks = {info: [] for info in self.block_infos}
        self.data = None
        self.read_file()
        self.format, self.version = self.extract_file_info()

    def read_file(self):
        """Read the file and extract the data blocks."""
        # Initialize an empty list to store the extracted blocks
        extracted_blocks = []

        # Initialize a variable to accumulate the current block
        current_block = []
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
        return geometry_data

    def extract_freq_info(self):
        """Extract frequency information."""
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
        if self.format == 'emdata':
            data = data.astype({'Type': 'category',
                                'Freq': 'int',
                                'Tx': 'int',
                                'Rx': 'int',
                                'Data': 'float',
                                'StdErr': 'float'})
        elif self.format == 'emresp':
            if 'StdError' in data.columns:
                data = data.astype({'Type': 'category',
                                    'Freq': 'int',
                                    'Tx': 'int',
                                    'Rx': 'int',
                                    'Data': 'float',
                                    'StdError': 'float',
                                    'Response': 'float',
                                    'Residual': 'float'})
            elif 'StdErr' in data.columns:
                data = data.astype({'Type': 'category',
                                    'Freq': 'int',
                                    'Tx': 'int',
                                    'Rx': 'int',
                                    'Data': 'float',
                                    'StdErr': 'float',
                                    'Response': 'float',
                                    'Residual': 'float'})
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
        data = merged_df[['Type', 'Freq_id', 'Tx_id', 'Rx_id', 'Data', 'StdErr']].copy()
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
            "StdErr": "{:22.15g}".format
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

        for _, info in enumerate(data_blocks):
            AllBlocks.append(''.join(data_blocks[info]))

        # Join the lines back into a string
        AllData = ''.join(AllBlocks)
        return AllData
    
    def increase_error_floor_rx(self, data_df, errfloor, rx):
        """Increase the error floor for certain transmitters/receivers (depends on if reciprocity is applied)."""
        data_df_n = data_df.copy()
        if rx == 'all':
            # extract amplitude error in log10(Ey Amplitude)
            eA_log10 = data_df_n.loc[data_df_n['Type'] == '28', ['StdErr']]
            # extract amplitude error
            eP = data_df_n.loc[data_df_n['Type'] == '24', ['StdErr']]
            UncA = eA_log10 * np.log(10)
            UncP = 2 * np.sin(np.deg2rad(eP / 2))

            UncA_n = np.fmax(UncA, errfloor)
            eA_log10_n = UncA_n / np.log(10)
            # UncA = UncP here (which requires that len(UncA) = len(UncP))
            eP_n = 2 * np.rad2deg(np.arcsin(UncA_n / 2))

            data_df_n.loc[data_df_n['Type'] == '28', ['StdErr']] = eA_log10_n
            data_df_n.loc[data_df_n['Type'] == '24', ['StdErr']] = eP_n.to_numpy()
        else:
            # extract amplitude error in log10(Ey Amplitude)
            eA_log10 = data_df_n.loc[(data_df_n['Type'] == '28') & (data_df_n['Rx'].isin(rx)), ['StdErr']]
            # extract amplitude error
            eP = data_df_n.loc[(data_df_n['Type'] == '24') & (data_df_n['Rx'].isin(rx)), ['StdErr']]
            UncA = eA_log10 * np.log(10)
            UncP = 2 * np.sin(np.deg2rad(eP / 2))

            UncA_n = np.fmax(UncA, errfloor)
            eA_log10_n = UncA_n / np.log(10)
            # UncA = UncP here (which requires that len(UncA) = len(UncP))
            eP_n = 2 * np.rad2deg(np.arcsin(UncA_n / 2))

            data_df_n.loc[(data_df_n['Type'] == '28') & (data_df_n['Rx'].isin(rx)), ['StdErr']] = eA_log10_n
            data_df_n.loc[(data_df_n['Type'] == '24') & (data_df_n['Rx'].isin(rx)), ['StdErr']] = eP_n.to_numpy()
        return data_df_n

    def increase_error_floor_tx(self, data_df, errfloor, tx):
        """Increase the error floor for certain receivers/transmitters 
        (depends on if reciprocity is applied).."""
        data_df_n = data_df.copy()
        if tx == 'all':
            # extract amplitude error in log10(Ey Amplitude)
            eA_log10 = data_df_n.loc[data_df_n['Type'] == '28', ['StdErr']]
            # extract amplitude error
            eP = data_df_n.loc[data_df_n['Type'] == '24', ['StdErr']]
            UncA = eA_log10 * np.log(10)
            UncP = 2 * np.sin(np.deg2rad(eP / 2))

            UncA_n = np.fmax(UncA, errfloor)
            UncP_n = np.fmax(UncP, errfloor)
            eA_log10_n = UncA_n / np.log(10)
            # len(UncA) can be different from len(UncP)
            eP_n = 2 * np.rad2deg(np.arcsin(UncP_n / 2))

            data_df_n.loc[data_df_n['Type'] == '28', ['StdErr']] = eA_log10_n
            data_df_n.loc[data_df_n['Type'] == '24', ['StdErr']] = eP_n.to_numpy()
        else:
            # extract amplitude error in log10(Ey Amplitude)
            eA_log10 = data_df_n.loc[(data_df_n['Type'] == '28') & (data_df_n['Tx'].isin(tx)), ['StdErr']]
            # extract amplitude error
            eP = data_df_n.loc[(data_df_n['Type'] == '24') & (data_df_n['Tx'].isin(tx)), ['StdErr']]
            UncA = eA_log10 * np.log(10)
            UncP = 2 * np.sin(np.deg2rad(eP / 2))

            UncA_n = np.fmax(UncA, errfloor)
            UncP_n = np.fmax(UncP, errfloor)
            eA_log10_n = UncA_n / np.log(10)
            # len(UncA) can be different from len(UncP)
            eP_n = 2 * np.rad2deg(np.arcsin(UncP_n / 2))

            data_df_n.loc[(data_df_n['Type'] == '28') & (data_df_n['Tx'].isin(tx)), ['StdErr']] = eA_log10_n
            data_df_n.loc[(data_df_n['Type'] == '24') & (data_df_n['Tx'].isin(tx)), ['StdErr']] = eP_n.to_numpy()
        return data_df_n
