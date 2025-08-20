import pandas as pd
import numpy as np
from typing import Dict, List, Tuple

class BathymetryParser:
    """Parser for bathymetry text files containing inline distance and depth data."""
    
    def __init__(self):
        self.data = None
        self.inline_distance = None
        self.depth = None
    
    def parse_file(self, file_path: str) -> Dict:
        """
        Parse bathymetry text file.
        Expected format: two columns (inline_distance, depth) separated by whitespace or comma
        """
        try:
            # Try to read the file with different separators
            # First, try to read with automatic whitespace detection (handles scientific notation better)
            try:
                # Try whitespace-separated (most common for scientific data)
                self.data = pd.read_csv(file_path, sep=r'\s+', header=None, usecols=[0, 1], names=['inline_distance', 'depth'])
                print(f"Successfully read with whitespace separator. Shape: {self.data.shape}")
            except Exception as e1:
                print(f"Whitespace separation failed: {e1}")
                try:
                    # Try comma-separated
                    self.data = pd.read_csv(file_path, sep=',', header=None, usecols=[0, 1], names=['inline_distance', 'depth'])
                    print(f"Successfully read with comma separator. Shape: {self.data.shape}")
                except Exception as e2:
                    print(f"Comma separation failed: {e2}")
                    # Try tab-separated
                    self.data = pd.read_csv(file_path, sep='\t', header=None, usecols=[0, 1], names=['inline_distance', 'depth'])
                    print(f"Successfully read with tab separator. Shape: {self.data.shape}")
            
            print(f"Raw data columns: {list(self.data.columns)}")
            print(f"Raw data shape: {self.data.shape}")
            print("First few rows of raw data:")
            print(self.data.head())
            
            # Clean the data
            self.data = self.data.dropna()
            
            # Convert to numeric, coercing errors to NaN (handles scientific notation automatically)
            print("Converting to numeric...")
            self.data['inline_distance'] = pd.to_numeric(self.data['inline_distance'], errors='coerce')
            self.data['depth'] = pd.to_numeric(self.data['depth'], errors='coerce')
            
            # Check for conversion issues
            nan_distance = self.data['inline_distance'].isna().sum()
            nan_depth = self.data['depth'].isna().sum()
            if nan_distance > 0:
                print(f"Warning: {nan_distance} inline_distance values could not be converted to numbers")
            if nan_depth > 0:
                print(f"Warning: {nan_depth} depth values could not be converted to numbers")
            
            # Drop any rows with NaN values
            original_count = len(self.data)
            self.data = self.data.dropna()
            final_count = len(self.data)
            
            if final_count < original_count:
                print(f"Dropped {original_count - final_count} rows with invalid data")
                
            if final_count == 0:
                raise ValueError("No valid data points found after parsing and cleaning")
            
            # Sort by inline distance
            self.data = self.data.sort_values('inline_distance')
            
            # Extract arrays and ensure they're numpy arrays
            self.inline_distance = np.array(self.data['inline_distance'].values)
            self.depth = np.array(self.data['depth'].values)
            
            print(f"Final data shape: {len(self.inline_distance)} points")
            print(f"Distance range: {self.inline_distance.min()} to {self.inline_distance.max()}")
            print(f"Depth range: {self.depth.min()} to {self.depth.max()}")
            
            return {
                'success': True,
                'inline_distance': self.inline_distance.tolist(),
                'depth': self.depth.tolist(),
                'num_points': len(self.data),
                'distance_range': [float(self.inline_distance.min()), float(self.inline_distance.max())],
                'depth_range': [float(self.depth.min()), float(self.depth.max())]
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to parse bathymetry file. Expected format: two columns (inline_distance, depth)'
            }
    
    def interpolate_depth(self, target_distances: List[float]) -> List[float]:
        """
        Interpolate depth values at target inline distances.
        """
        if self.inline_distance is None or self.depth is None:
            raise ValueError("No bathymetry data loaded")
        
        interpolated_depths = np.interp(target_distances, self.inline_distance, self.depth)
        return interpolated_depths.tolist()
    
    def get_data_for_plotting(self) -> Tuple[List[float], List[float]]:
        """
        Get data formatted for plotting.
        Returns: (inline_distances, depths)
        """
        if self.inline_distance is None or self.depth is None:
            return [], []
        
        return self.inline_distance.tolist(), self.depth.tolist() 