import re
import pandas as pd
import numpy as np
import utm
from os import path

class CSEMDataFileReader():
    """_summary_
    """
    def __init__(self, file_path):
        self.file_path = file_path
        self.extracted_blocks = []
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
        self.blocks = {info: [] for info in self.block_infos}
        self.data = None
        self.read_file()

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
            for i, block in enumerate(extracted_blocks):
                # assume for each pattern we can only find single match (if any)
                self.blocks[self.block_infos[i]] = block

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

    def extract_data_block(self, lines:str) -> dict:
        """Extract certain data block."""
        # Use the second line as column headers
        # Remove the leading "!" and split the input string into headers
        headers = lines[1].strip().lstrip("!").split()
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

    def data_block_to_string(self, data:pd.DataFrame) -> str:
        """Convert the data block to a string.

        Args:
            data (pd.DataFrame): The data block as a DataFrame.

        Returns:
            str: The data block as a string.
        """
        # Convert the DataFrame to a string
        data = data.astype({'Type': 'int',
                            'Freq#': 'int',
                            'Tx#': 'int',
                            'Rx#': 'int',
                            'Data': 'float',
                            'StdErr': 'float',})

        # Apply MARE2DEM (DataMan) formatting to the DataFrame
        data_str = data.to_string(formatters={
            "Type": "{:5d}".format,
            "Freq#": "{:5d}".format,
            "Tx#": "{:4d}".format,
            "Rx#": "{:4d}".format,
            "Data": "{:14.6g}".format,
            "StdErr": "{:14.6g}".format
        }, index=False)
        return data_str

    def data_block_to_string_v2_3(self, data:pd.DataFrame) -> str:
        """Convert the data block to a string (emdata_2.3).

        Args:
            data (pd.DataFrame): The data block as a DataFrame.

        Returns:
            str: The data block as a string.
        """
        # Convert the DataFrame to a string
        data = data.astype({'Type': 'int',
                            'Freq#': 'int',
                            'Tx#': 'int',
                            'Rx#': 'int',
                            'Data': 'float',
                            'StdErr': 'float',})

        # Apply MARE2DEM (DataMan) formatting to the DataFrame
        data_str = data.to_string(formatters={
            "Type": "{:5d}".format,
            "Freq#": "{:5d}".format,
            "Tx#": "{:4d}".format,
            "Rx#": "{:4d}".format,
            "Data": "{:14.6g}".format,
            "StdErr": "{:14.6g}".format
        }, index=False)
        return data_str


    def rx_block_to_string(self, Rx_data):
        # Convert the DataFrame to a string
        Rx_data = Rx_data.astype({'X': 'int',
                        'Y': 'int',
                        'Z': 'float',
                        'Theta': 'int',
                        'Alpha': 'int',
                        'Beta': 'int',
                        'Length': 'int',
                        'Name': 'category',})

        # Apply MARE2DEM (DataMan) formatting to the DataFrame
        data_str = Rx_data.to_string(formatters={
            "X": "{:7d}".format,
            "Y": "{:7d}".format,
            "Z": "{:7.1f}".format,
            "Theta": "{:5d}".format,
            "Alpha": "{:0}".format,
            "Beta": "{:5d}".format,
            "Length": "{:6d}".format,
            "Name": "".format
        }, index=False)
        return data_str

    def MT_data_block_to_string(self, MT_data):
        # Convert the DataFrame to a string
        MT_data = MT_data.astype({'Type': 'int',
                            'Freq#': 'int',
                            'Tx#': 'int',
                            'Rx#': 'int',
                            'Data': 'float',
                            'StdErr': 'float',})

        # Apply MARE2DEM (DataMan) formatting to the DataFrame
        data_str = MT_data.to_string(formatters={
            "Type": "{:5d}".format,
            "Freq#": "{:5d}".format,
            "Tx#": "{:4d}".format,
            "Rx#": "{:4d}".format,
            "Data": "{:14.6g}".format,
            "StdErr": "{:14.6g}".format
        }, index=False)
        return data_str

    def update_data_block(self, data_filtered):
        """Update the Data block with the filtered data."""
        # Convert data back to string format
        data_str = self.data_block_to_string(data_filtered)
        # Regular expression to find the number
        number_pattern = re.compile(r'(Data: *)(\d+)')
        # Replace the original number with the new number
        new_header = number_pattern.sub(r'\g<1>' + str(len(data_filtered)), self.blocks['Data'][0])
        # Convert data_columns back to string format (remember to add first line info!)
        blocks_data_str = new_header + '!' + " " * 2 + data_str.replace("\n", "\n" + " " * 3)
        # keep the line breaks
        self.blocks['Data'] = blocks_data_str.splitlines(True)

    def data_block_init(self, data_block:str) -> pd.DataFrame:
        """Initialize the Data block. Convert extracted data to DataFrame."""
        # Extract data
        print(type(data_block))
        data_extracted = self.extract_data_block(data_block)
        data = pd.DataFrame.from_dict(data_extracted)
        data = data.astype({'Type': 'category',
                            'Freq#': 'category',
                            'Tx#': 'int',
                            'Rx#': 'int',
                            'Data': 'float',
                            'StdErr': 'float',})
        return data
    
    def tx_data_block_init(self, tx_data_block:str) -> dict:
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
        Tx_data.insert(0, "Tx#", pd.Series(range(1, len(Tx_data)+1)))
        return Tx_data

    def rx_data_block_init(self, rx_data_block:str) -> dict:
        """Initialize the Rx Data block. Convert extracted data to DataFrame."""
        Rx_data_extracted = self.extract_data_block(rx_data_block)
        Rx_data = pd.DataFrame.from_dict(Rx_data_extracted)

        Rx_data = Rx_data.astype({'X': 'float',
                                  'Y': 'float',
                                  'Z': 'float',
                                  'Theta': 'float',
                                  'Alpha': 'float',
                                  'Beta': 'float',
                                  'Length': 'float',
                                  'Name': 'string',})
        Rx_data.insert(0, "Rx#", pd.Series(range(1, len(Rx_data)+1)))
        return Rx_data

    # Function to rotate coordinates
    def inv_rotate_coords(self, x, y, rot_angle, origin):
        angle = np.deg2rad(rot_angle)  # Convert azimuth to radians
        x_rot = x * np.cos(angle) - y * np.sin(angle) + origin[0]
        y_rot = x * np.sin(angle) + y * np.cos(angle) + origin[1]
        return x_rot, y_rot

    # Function to convert UTM to latitude and longitude
    def utm_to_latlon(self, x, y, zone_number, northern_hemisphere=True):
        lat, lon = utm.to_latlon(x, y, zone_number, northern=northern_hemisphere)
        return lat, lon

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
        data_df['Lat'] = lat
        data_df['Lon'] = lon
        return data_df

    def merge_data_rx_tx(self, data, rx_data, tx_data):
        """Merge the data, Rx and Tx blocks."""

        merged_df = pd.merge(data, rx_data, on='Rx#')
        merged_df = pd.merge(merged_df, tx_data, on='Tx#', suffixes=("_rx", "_tx"))
        merged_df.rename(columns={'Type_rx': 'Type', 
                                  'Freq#': 'Freq_id',
                                  'Tx#': 'Tx_id',
                                  'Rx#': 'Rx_id'}, inplace=True)
        return merged_df

    def anti_merge_data_rx_tx(self, merged_df):
        """Anti-merge the data, Rx and Tx blocks."""
        data = merged_df[['Type', 'Freq_id', 'Tx_id', 'Rx_id', 'Data', 'StdErr']].copy()
        data.rename(columns={'Freq_id': 'Freq#',
                             'Tx_id': 'Tx#',
                             'Rx_id': 'Rx#'}, inplace=True)
        rx_data = merged_df[['Rx_id', 'X_rx', 'Y_tx', 'Z_rx', 'Theta', 'Alpha', 'Beta', 'Length_rx', 'Name_rx']].copy()
        rx_data.rename(columns={'X_rx': 'X',
                                'Y_rx': 'Y',
                                'Z_rx': 'Z',
                                'Rx_id': 'Rx#',
                                'Length_rx': 'Length',
                                'Name_rx': 'Name'}, inplace=True)
        tx_data = merged_df[['Tx_id', 'X_tx', 'Y_tx', 'Z_tx', 'Azimuth', 'Dip', 'Length_tx', 'Type_tx', 'Name_tx']].copy()
        tx_data.rename(columns={'X_tx': 'X',
                                'Y_tx': 'Y',
                                'Z_tx': 'Z',
                                'Tx_id': 'Tx#',
                                'Length_tx': 'Length',
                                'Name_tx': 'Name'}, inplace=True)
        return data, rx_data, tx_data

    def reset_error_floor(self, data, errfloor):
        """Reset the overall error floor."""
        # extract amplitude error in log10(Ey Amplitude)
        eA_log10 = data.loc[data['Type'] == '28', ['StdErr']]
        # extract amplitude error
        eP = data.loc[data['Type'] == '24', ['StdErr']]
        UncA = eA_log10 * np.log(10)
        UncP = 2 * np.sin(np.deg2rad(eP / 2))

        UncA_n = np.fmax(UncA, errfloor)
        eA_log10_n = UncA_n / np.log(10)
        # UncA = UncP here (which requires that len(UncA) = len(UncP))
        eP_n = 2 * np.rad2deg(np.arcsin(UncA_n / 2))

        data.loc[data['Type'] == '28', ['StdErr']] = eA_log10_n
        data.loc[data['Type'] == '24', ['StdErr']] = eP_n.to_numpy()
        return data

    def df_to_json(self, df):
        """Convert DataFrame to JSON."""
        # result = df.to_json(orient='records', date_format='epoch', date_unit='s')
        result = df.to_json(orient='table', index=True)
        # test pivot table
        # pivoted_df = df.pivot_table(index=['Type', 'Tx#', 'Rx#'], columns='Freq#', values='Data')
        # result = pivoted_df.to_json(orient='table', index=True)
        # result = pivoted_df.to_json(orient='records', index=True)
        return result

    def write_file(self):
        # Define all types of data info string list
        AllBlocks = []

        for _, info in enumerate(self.blocks):
            AllBlocks.append(''.join(self.blocks[info]))

        # Join the lines back into a string
        AllData = ''.join(AllBlocks)

        datafile_pathname = path.split(self.file_path)[0]
        datafile = path.split(self.file_path)[1]
        datafilename = path.splitext(datafile)[0]

        datafilename_n = datafilename + '_m.data'
        new_file_path = path.join(datafile_pathname, datafilename_n)

        # Write the modified data back to another file
        with open(new_file_path, "w", encoding="utf-8") as file:
            file.write(AllData)

        # # Print a message indicating that the file has been updated
        print(f"The file '{self.file_path}' has been modified with modified data and saved to a new file '{new_file_path}'.")
