import re
from datetime import datetime
import pandas as pd
import numpy as np
import os
from MARE2DEM_poly_parser import MARE2DEMPolyParser

class ResistivityFileParser():
    """Class for parsing .resistivity files used in MARE2DEM."""
    def __init__(self):
        pass

    def parse_resistivity_file(self, filename, rho_parse=False):
        """Reads a .resistivity file"""
        data = {}
        table_data = []
        table_header = []

        with open(filename, 'r', encoding='utf-8') as file:
            for line in file:
                line = line.strip()

                # Skip empty lines and special comments
                if not line:
                    continue

                # Split line by "!" to separate value and comment
                if "!" in line:
                    value_part, comment_part = map(str.strip, line.split("!", 1))
                else:
                    value_part, comment_part = line, None
                
                # Parse key-value pairs
                if ":" in value_part:
                    key, value = map(str.strip, value_part.split(":", 1))
                    
                    # Handle special cases like lists or numbers
                    if ',' in value:
                        value = [float(x) if '.' in x or 'e' in x.lower() else int(x) for x in value.split(',')]
                    elif re.match(r'^\d+(\.\d+)?$', value):
                        value = float(value) if '.' in value else int(value)
                    elif re.match(r'^\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2}$', value):
                        value = datetime.strptime(value, "%d-%b-%Y %H:%M:%S")
                    
                    # Store value and comment in data dictionary
                    data[key] = {"value": value, "comment": comment_part, "line": line}
                
                # Parse table data
                # extract table header and data
                if rho_parse:
                    if line.startswith("!#"):
                        table_header = [x.strip() for x in re.split(r'\s{2,}', line[1:])]
                        print(table_header)
                    elif re.match(r'^\d+', value_part):  # If the line starts with a number, it belongs to the table
                        row = [float(x) if re.match(r'^\d+(\.\d+|e[+-]?\d+)?$', x) else x for x in re.split(r'\s+', value_part)]
                        table_data.append(row)

        # Add table data to the result if exists
        if table_header and table_data:
            data["table"] = pd.DataFrame(table_data, columns=table_header)
        else:
            data["table"] = None

        return data

    def merge_resistivity_files(self, resistivity_file1, resistivity_file2, merged_poly_vertices, 
                               merged_poly_segments, output_file, uniform_resistivity=None):
        """
        Merge two resistivity files corresponding to merged poly files.
        
        Args:
            resistivity_file1 (str): Path to first resistivity file
            resistivity_file2 (str): Path to second resistivity file  
            merged_poly_vertices (dict): Merged vertices from poly file merge
            merged_poly_segments (list): Merged segments from poly file merge
            output_file (str): Path for output merged resistivity file
            uniform_resistivity (float, optional): Uniform resistivity value for all regions.
                                                  If None, uses averaging strategy.
        
        Returns:
            dict: Merged resistivity data structure
        """
        # Parse both resistivity files
        print("Reading resistivity files...")
        data1 = self.parse_resistivity_file(resistivity_file1, rho_parse=True)
        data2 = self.parse_resistivity_file(resistivity_file2, rho_parse=True)
        
        # Get actual number of regions from merged poly file
        num_regions = self._get_actual_regions_from_poly(merged_poly_vertices, merged_poly_segments)
        
        print(f"Original file 1 regions: {data1.get('Number of regions', {}).get('value', 'Unknown')}")
        print(f"Original file 2 regions: {data2.get('Number of regions', {}).get('value', 'Unknown')}")
        print(f"Merged poly estimated regions: {num_regions}")
        
        # Create merged resistivity data structure
        merged_data = self._create_merged_resistivity_structure(
            data1, data2, num_regions, uniform_resistivity
        )
        
        # Write the merged resistivity file
        self._write_resistivity_file(output_file, merged_data, num_regions, mamba2d_format=True)
        
        print(f"Merged resistivity file written to: {output_file}")
        return merged_data

    def _estimate_regions_from_poly(self, vertices, segments):
        """
        Estimate number of triangular regions from poly file structure.
        Uses Euler's formula for planar graphs: V - E + F = 2
        Where F includes the outer infinite face, so regions = F - 1
        """
        V = len(vertices)  # Number of vertices
        E = len(segments)  # Number of edges/segments
        
        # For a triangulated polygon: F = E - V + 2 (Euler's formula)
        # But we want internal regions only, so subtract 1 for the outer face
        estimated_regions = E - V + 1
        
        # Ensure positive result (fallback to simple estimation)
        if estimated_regions <= 0:
            # Alternative estimation: roughly 2 triangles per vertex for dense meshes
            estimated_regions = max(1, V // 2)
        
        return estimated_regions

    def _get_actual_regions_from_poly(self, poly_vertices, poly_segments):
        """
        Get the actual number of regions from poly file structure.
        First tries to read from an existing poly file, then falls back to estimation.
        
        Args:
            poly_vertices (dict): Vertices from poly file
            poly_segments (list): Segments from poly file
            
        Returns:
            int: Actual number of regions
        """
        try:
            
            # Check if we can find the poly file that these vertices/segments came from
            # Look for recently created merged_output.poly

            poly_files_to_check = ['merged_output.poly', 'merged.poly', 'output.poly']
            
            parser = MARE2DEMPolyParser()
            
            for poly_file in poly_files_to_check:
                if os.path.exists(poly_file):
                    try:
                        vertices, segments, holes, regions = parser.read_poly_file(poly_file)
                        
                        # Check if this matches our data (same number of vertices/segments)
                        if len(vertices) == len(poly_vertices) and len(segments) == len(poly_segments):
                            actual_regions = len(regions) if regions else 0
                            if actual_regions > 0:
                                print(f"Found actual regions from {poly_file}: {actual_regions}")
                                return actual_regions
                    except:
                        continue
            
            print("Could not find matching poly file with regions, falling back to estimation...")
            return self._estimate_regions_from_poly(poly_vertices, poly_segments)
            
        except Exception as e:
            print(f"Warning: Could not determine actual regions ({e})")
            print("Falling back to estimation...")
            return self._estimate_regions_from_poly(poly_vertices, poly_segments)

    def _create_merged_resistivity_structure(self, data1, data2, num_regions, uniform_resistivity=None):
        """Create merged resistivity data structure."""
        
        # Start with data from first file as template
        merged_data = {}
        
        # Copy metadata from first file and update
        for key, value in data1.items():
            if key != 'table' and isinstance(value, dict):
                merged_data[key] = value.copy()
        
        # Update key fields
        merged_data['Model File'] = {'value': 'merged_output.poly', 'comment': 'Merged poly file', 'line': ''}
        merged_data['Number of regions'] = {'value': num_regions, 'comment': 'Merged regions count', 'line': ''}
        merged_data['Date/Time'] = {'value': datetime.now().strftime("%m/%d/%Y %H:%M:%S.%f")[:-3], 
                                   'comment': 'Merge timestamp', 'line': ''}
        
        # Determine resistivity strategy
        if uniform_resistivity is not None:
            # Use uniform resistivity for all regions
            resistivity_values = np.full(num_regions, uniform_resistivity)
            print(f"Using uniform resistivity: {uniform_resistivity} ohm-m for all {num_regions} regions")
        else:
            # Use averaging strategy from both files
            resistivity_values = self._calculate_merged_resistivity_values(data1, data2, num_regions)
        
        # Create the resistivity table
        merged_data['resistivity_table'] = self._create_resistivity_table(resistivity_values)
        
        return merged_data

    def _calculate_merged_resistivity_values(self, data1, data2, num_regions):
        """Calculate merged resistivity values using averaging strategy."""
        
        # Extract resistivity values from both files
        rho1 = self._extract_resistivity_values(data1)
        rho2 = self._extract_resistivity_values(data2)
        
        if len(rho1) == 0 and len(rho2) == 0:
            # Fallback to default values
            print("No resistivity data found, using default values")
            return np.full(num_regions, 1.0)  # 1 ohm-m default
        elif len(rho1) == 0:
            mean_rho = np.mean(rho2)
        elif len(rho2) == 0:
            mean_rho = np.mean(rho1)
        else:
            # Average the mean resistivities from both files
            mean_rho = (np.mean(rho1) + np.mean(rho2)) / 2
        
        print(f"Calculated average resistivity: {mean_rho:.4f} ohm-m")
        
        # Create array with some variation around the mean
        resistivity_values = np.full(num_regions, mean_rho)
        
        # Add small random variation (±10%) to make it more realistic
        variation = np.random.normal(1.0, 0.1, num_regions)
        resistivity_values *= np.clip(variation, 0.5, 2.0)  # Clip to reasonable range
        
        return resistivity_values

    def _extract_resistivity_values(self, data):
        """Extract resistivity values from parsed resistivity data."""
        
        resistivity_values = []
        
        # Look for table data first
        if data.get('table') is not None:
            df = data['table']
            if 'Rho' in df.columns:
                resistivity_values = df['Rho'].values
            elif len(df.columns) > 0:
                # Assume first column is resistivity
                resistivity_values = df.iloc[:, 0].values
        
        # If no table, try to extract from individual entries
        if len(resistivity_values) == 0:
            for key, value in data.items():
                if isinstance(value, dict) and 'value' in value:
                    val = value['value']
                    if isinstance(val, (int, float)) and val > 0:
                        resistivity_values.append(val)
        
        return np.array(resistivity_values)

    def _create_resistivity_table(self, resistivity_values):
        """Create resistivity table in MARE2DEM format."""
        
        num_regions = len(resistivity_values)
        
        # Create table with standard MARE2DEM columns - ensure correct data types
        table_data = {
            'Region': np.arange(1, num_regions + 1, dtype=int),  # Explicitly set as int
            'Rho': np.array(resistivity_values, dtype=float),    # Explicitly set as float
            'Param': np.ones(num_regions, dtype=int),            # 1 = free parameter, 0 = fixed
            'Lower': np.zeros(num_regions, dtype=float),         # Explicitly set as float
            'Upper': np.zeros(num_regions, dtype=float),         # Explicitly set as float
            'Prej': np.zeros(num_regions, dtype=float),          # Explicitly set as float
            'Weight': np.zeros(num_regions, dtype=float)         # Explicitly set as float
        }
        
        return pd.DataFrame(table_data)

    def _write_resistivity_file(self, output_file, merged_data, num_regions, mamba2d_format=True):
        """Write merged resistivity data to file in MARE2DEM/Mamba2D format.
        
        Args:
            output_file (str): Output file path
            merged_data (dict): Resistivity data structure
            num_regions (int): Number of regions
            mamba2d_format (bool): If True, use Mamba2D-compatible formatting
        """
        
        with open(output_file, 'w', encoding='utf-8') as f:
            # Write header information in Mamba2D format
            model_file = merged_data.get('Model File', {}).get('value', 'merged_output.poly')
            current_time = datetime.now().strftime("%d-%b-%Y %H:%M:%S")
            
            if mamba2d_format:
                # Mamba2D format: exact spacing and format matching m2d_writeResistivity.m
                f.write(f"Format:                         {'mare2dem_1.1':<32s} ! input \n")
                f.write(f"Model File:                     {model_file:<32s} ! input \n")
                f.write(f"Data File:                      {'merged_data.data':<32s} ! input \n")
                f.write(f"Settings File:                  {'mare2dem.settings':<32s} ! input \n")
                f.write(f"Maximum Iterations:             {100:<32d} ! opt. input \n")
                f.write(f"Bounds Transform:               {'bandpass':<32s} ! opt. input \n")
                
                # Global bounds format matching Mamba2D
                global_bounds = "1.0000000000E-01, 1.0000000000E+05"
                f.write(f"Global Bounds:                  {global_bounds:<32s} ! opt. input \n")
                f.write(f"Roughness Penalty Method:       {'gradient':<32s} ! opt. input (gradient or first_difference)  \n")
                
                # Roughness weights format
                roughness_weights = "3.0000000000E+00, 1.0000000000E+00"
                f.write(f"Roughness Weights (y,z):        {roughness_weights:<32s} ! opt. input (e.g. 3.0,1.0). \n")
                f.write(f"Penalty Cut Weight:             {'0.1':<32s} ! opt. input (e.g. 0.1) \n")
                f.write(f"Roughness With Prejudice:       {'no':<32s} ! opt. input (yes or no). Yes uses norm: || R(m-m_prej)||^2  \n")
                f.write(f"Min. Gradient Support Weight:   {'0':<32s} ! opt. input (e.g. 0.01) 0 means no MGS\n")
                f.write(f"Print Level:                    {1:<32d} ! opt. input  \n")
                f.write(f"Target Misfit:                  {'1':<32s} ! require for inversion) \n")
                f.write(f"Misfit Decrease Threshold:      {0.85:<32g} ! opt. input (0 <= n < 1). Iteration ends if RMS < n*Starting_RMS \n")
                f.write(f"Converge Slowly:                {'no':<32s} ! opt. input. Target misfit = max(n*Starting_RMS, Target Misfit) for each iteration \n")
                f.write(f"Log10 Lagrange Value:           {5:<32g} ! input/output (required for inversion) \n")
                f.write(f"Model Roughness:                {' ':<32s} ! output from inversion \n")
                f.write(f"Model Misfit:                   {' ':<32s} ! output from inversion \n")
                f.write(f"Date/Time:                      {current_time:<32s} ! output from inversion \n")
                f.write(f"Anisotropy:                     {'isotropic':<32s} ! input \n")
                f.write(f"Number of regions:              {num_regions:<32d} ! input \n")
            else:
                # Original format
                f.write(f" Format:                         MARE2DEM_1.1\n")
                f.write(f" Model File:                     {model_file}\n")
                f.write(f" Data File:                      merged_data.data\n")
                f.write(f" Settings File:                  mare2dem.settings\n")
                f.write(f" Maximum Iterations:             100\n")
                f.write(f" Bounds Transform:               bandpass\n")
                f.write(f" Global Bounds:                  1.0000E-01,   1.0000E+05\n")
                f.write(f" Roughness Penalty Method:       gradient\n")
                f.write(f" Roughness Weights (y,z):        3.0000E+00,   1.0000E+00\n")
                f.write(f" Penalty Cut Weight:             1.0000E-01\n")
                f.write(f" Roughness With Prejudice:       no\n")
                f.write(f" Min. Gradient Support Weight:   0.0000E+00\n")
                f.write(f" Print Level:                    1\n")
                f.write(f" Target Misfit:                  0.9000\n")
                f.write(f" Misfit Decrease Threshold:      0.8500\n")
                f.write(f" Converge Slowly:                no\n")
                f.write(f" Log10 Lagrange Value:           0.0000E+00\n")
                f.write(f" Model Roughness:                0.0000\n")
                f.write(f" Model Misfit:                   1.0000\n")
                f.write(f" Date/Time:                      {merged_data.get('Date/Time', {}).get('value', 'Unknown')}\n")
                f.write(f" Anisotropy:                     isotropic\n")
                f.write(f" Number of regions:              {num_regions}\n")
            
            # Write table header - Mamba2D format
            if mamba2d_format:
                # Mamba2D format header matching m2d_writeResistivity.m
                f.write(f"{'!#':<8s} {'Rho':<13s} {'Param':<10s} {'Lower':<13s} {'Upper':<13s} {'Prej':<13s} {'Weight'}\n")
            else:
                # Original format header
                f.write("!#        Rho           Param      Lower        Upper         Prej         Weight\n")
            
            # Write resistivity data
            table = merged_data['resistivity_table']
            for idx, row in table.iterrows():
                # Ensure proper data types for formatting
                region = int(row['Region'])
                rho = float(row['Rho'])
                param = int(row['Param'])
                lower = float(row['Lower'])
                upper = float(row['Upper'])
                prej = float(row['Prej'])
                weight = float(row['Weight'])
                
                if mamba2d_format:
                    # Mamba2D format: exact spacing and precision matching m2d_writeResistivity.m
                    f.write(f"{region:<9d} {rho:<13.8g} {param:<10d} {lower:<13.8g} {upper:<13.8g} {prej:<13.8g} {weight:<13.8g}\n")
                else:
                    # Original format
                    f.write(f"{region:8d}   {rho:.4E}        {param:d}   "
                           f"{lower:.4E}   {upper:.4E}   {prej:.4E}   {weight:.4E}\n")

    def create_uniform_resistivity_file(self, poly_regions, output_file, 
                                      resistivity_value=1.0, poly_filename=None):
        """
        Create a resistivity file with uniform resistivity for all regions.
        
        Args:
            poly_regions (list): Regions from poly file
            output_file (str): Path for output resistivity file
            resistivity_value (float): Uniform resistivity value in ohm-m
            poly_filename (str): Name of the corresponding poly file
        """
        
        # Get actual number of regions from poly file (if available) or estimate
        num_regions = len(poly_regions)
        
        print(f"Creating uniform resistivity file with {resistivity_value} ohm-m for {num_regions} regions")
        
        # Create uniform resistivity values
        resistivity_values = np.full(num_regions, resistivity_value)
        
        # Create merged data structure
        merged_data = {
            'Model File': {'value': poly_filename, 'comment': 'Poly file', 'line': ''},
            'Number of regions': {'value': num_regions, 'comment': 'Total regions', 'line': ''},
            'Date/Time': {'value': datetime.now().strftime("%m/%d/%Y %H:%M:%S.%f")[:-3], 
                         'comment': 'Creation timestamp', 'line': ''},
            'resistivity_table': self._create_resistivity_table(resistivity_values)
        }
        
        # Write the file
        self._write_resistivity_file(output_file, merged_data, num_regions, mamba2d_format=True)
        
        print(f"Uniform resistivity file written to: {output_file}")
        return merged_data