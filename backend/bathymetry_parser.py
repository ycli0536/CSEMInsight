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

    def simplify_bathymetry(self, method: str = 'uniform', target_points: int | None = None, 
                           tolerance: float | None = None, distance_range: Tuple[float, float] | None = None, save_path: str | None = None) -> Dict:
        """
        Simplify bathymetry data by reducing the number of points.
        
        Args:
            method: Simplification method ('uniform', 'douglas_peucker', 'adaptive')
            target_points: Target number of points for uniform sampling
            tolerance: Tolerance for Douglas-Peucker algorithm (in depth units)
            distance_range: Tuple of (start_distance, end_distance) to simplify only a specific range
            save_path: Path to save the simplified data
        Returns:
            Dict with simplified data and metadata
            total_original_points: Total points in the original data
            total_simplified_points: Total points in the final result
            overall_reduction_ratio: Overall reduction ratio
            inline_distance: Simplified inline distances
            depth: Simplified depths
            distance_range: Simplified distance range
            depth_range: Simplified depth range
            range_simplified: Whether the range was simplified
            range_distance: Simplified distance range
            range_original_points: Total points in the original data in the range
            range_simplified_points: Number of simplified points in the range
            range_reduction_ratio: Reduction ratio for the range
            range_original_points: Total points in the original data in the range
            range_simplified_points: Total points in the simplified data in the range
            range_reduction_ratio: Reduction ratio for the range
            method: Simplification method
            save_path: Path to save the simplified data
            
        Example:
            Simplify bathymetry data to 100 points using uniform sampling:
            bathymetry_parser.simplify_bathymetry(method='uniform', target_points=100)

            Simplify bathymetry data to 100 points using Douglas-Peucker algorithm:
            bathymetry_parser.simplify_bathymetry(method='douglas_peucker', target_points=100)
            
            Simplify bathymetry data to 100 points using adaptive sampling:
            bathymetry_parser.simplify_bathymetry(method='adaptive', target_points=100)

            Simplify bathymetry data to 100 points using Douglas-Peucker algorithm with a tolerance of 10 meters:
            bathymetry_parser.simplify_bathymetry(method='douglas_peucker', target_points=100, tolerance=10)
            
            Simplify bathymetry data to 100 points using Douglas-Peucker algorithm with a tolerance of 10 meters and a distance range of 0 to 1000 meters:
            bathymetry_parser.simplify_bathymetry(method='douglas_peucker', target_points=100, tolerance=10, distance_range=(0, 1000))
            
        """
        if self.inline_distance is None or self.depth is None:
            raise ValueError("No bathymetry data loaded")
        
        # If distance_range is specified, we need to simplify only that range but return all data
        if distance_range is not None:
            start_dist, end_dist = distance_range
            range_mask = (self.inline_distance >= start_dist) & (self.inline_distance <= end_dist)
            
            if not np.any(range_mask):
                raise ValueError("No data points in the specified distance range")
            
            # Get the range data for simplification
            range_distances = self.inline_distance[range_mask]
            range_depths = self.depth[range_mask]
            
            # Apply simplification to the range
            if method == 'uniform':
                if target_points is None:
                    target_points = max(10, len(range_distances) // 10)
                target_points = min(target_points, len(range_distances))
                indices = np.linspace(0, len(range_distances) - 1, target_points, dtype=int)
                simplified_range_distances = range_distances[indices]
                simplified_range_depths = range_depths[indices]
                
            elif method == 'douglas_peucker':
                if tolerance is None:
                    depth_range = np.max(range_depths) - np.min(range_depths)
                    tolerance = depth_range * 0.01
                simplified_indices = self._douglas_peucker_2d(range_distances, range_depths, tolerance)
                simplified_range_distances = range_distances[simplified_indices]
                simplified_range_depths = range_depths[simplified_indices]
                
            elif method == 'adaptive':
                if target_points is None:
                    target_points = max(10, len(range_distances) // 10)
                simplified_indices = self._adaptive_sampling(range_distances, range_depths, target_points)
                simplified_range_distances = range_distances[simplified_indices]
                simplified_range_depths = range_depths[simplified_indices]
            else:
                raise ValueError(f"Unknown simplification method: {method}")
            
            # Sort the simplified range data
            sort_indices = np.argsort(simplified_range_distances)
            simplified_range_distances = simplified_range_distances[sort_indices]
            simplified_range_depths = simplified_range_depths[sort_indices]
            
            # Combine: keep original data outside range + simplified data inside range
            outside_mask = ~range_mask
            outside_distances = self.inline_distance[outside_mask]
            outside_depths = self.depth[outside_mask]
            
            # Combine all data
            all_distances = np.concatenate([outside_distances, simplified_range_distances])
            all_depths = np.concatenate([outside_depths, simplified_range_depths])
            
            # Sort the combined data
            sort_indices = np.argsort(all_distances)
            simplified_distances = all_distances[sort_indices]
            simplified_depths = all_depths[sort_indices]
            
            # Calculate reduction info for the range only
            range_original_points = len(range_distances)
            range_simplified_points = len(simplified_range_distances)
            range_reduction_ratio = range_simplified_points / range_original_points
            
        else:
            # Simplify the entire dataset
            filtered_distances = self.inline_distance.copy()
            filtered_depths = self.depth.copy()
            
            if len(filtered_distances) == 0:
                raise ValueError("No data points available for simplification")
            
            # Apply simplification method to entire dataset
            if method == 'uniform':
                if target_points is None:
                    target_points = max(10, len(filtered_distances) // 10)
                target_points = min(target_points, len(filtered_distances))
                indices = np.linspace(0, len(filtered_distances) - 1, target_points, dtype=int)
                simplified_distances = filtered_distances[indices]
                simplified_depths = filtered_depths[indices]
                
            elif method == 'douglas_peucker':
                if tolerance is None:
                    depth_range = np.max(filtered_depths) - np.min(filtered_depths)
                    tolerance = depth_range * 0.01
                simplified_indices = self._douglas_peucker_2d(filtered_distances, filtered_depths, tolerance)
                simplified_distances = filtered_distances[simplified_indices]
                simplified_depths = filtered_depths[simplified_indices]
                
            elif method == 'adaptive':
                if target_points is None:
                    target_points = max(10, len(filtered_distances) // 10)
                simplified_indices = self._adaptive_sampling(filtered_distances, filtered_depths, target_points)
                simplified_distances = filtered_distances[simplified_indices]
                simplified_depths = filtered_depths[simplified_indices]
            else:
                raise ValueError(f"Unknown simplification method: {method}")
            
            # Sort the simplified data
            sort_indices = np.argsort(simplified_distances)
            simplified_distances = simplified_distances[sort_indices]
            simplified_depths = simplified_depths[sort_indices]
            
            # For entire dataset simplification
            range_original_points = len(filtered_distances)
            range_simplified_points = len(simplified_distances)
            range_reduction_ratio = range_simplified_points / range_original_points
        
        if save_path is not None:            
            pd.DataFrame({'inline_distance': simplified_distances, 'depth': simplified_depths}).to_csv(save_path, index=False, sep='\t', header=False)
            print(f"Simplified bathymetry data saved to {save_path}")
        
        # Calculate overall statistics
        total_original_points = len(self.inline_distance)
        total_simplified_points = len(simplified_distances)
        overall_reduction_ratio = total_simplified_points / total_original_points
        
        result = {
            'success': True,
            'method': method,
            'total_original_points': total_original_points,
            'total_simplified_points': total_simplified_points,
            'overall_reduction_ratio': overall_reduction_ratio,
            'inline_distance': simplified_distances.tolist(),
            'depth': simplified_depths.tolist(),
            'distance_range': [float(simplified_distances.min()), float(simplified_distances.max())],
            'depth_range': [float(simplified_depths.min()), float(simplified_depths.max())]
        }
        
        # Add range-specific information if distance_range was used
        if distance_range is not None:
            result.update({
                'range_simplified': True,
                'range_distance': distance_range,
                'range_original_points': range_original_points,
                'range_simplified_points': range_simplified_points,
                'range_reduction_ratio': range_reduction_ratio
            })
        else:
            result['range_simplified'] = False
            
        return result
    
    def _douglas_peucker_2d(self, x: np.ndarray, y: np.ndarray, tolerance: float) -> np.ndarray:
        """
        Douglas-Peucker algorithm for 2D line simplification.
        """
        def perpendicular_distance(point, line_start, line_end):
            """Calculate perpendicular distance from point to line."""
            if np.array_equal(line_start, line_end):
                return np.linalg.norm(point - line_start)
            
            line_vec = line_end - line_start
            point_vec = point - line_start
            line_len = np.linalg.norm(line_vec)
            
            if line_len == 0:
                return np.linalg.norm(point_vec)
            
            t = np.dot(point_vec, line_vec) / (line_len * line_len)
            t = np.clip(t, 0, 1)
            projection = line_start + t * line_vec
            return np.linalg.norm(point - projection)
        
        def douglas_peucker_recursive(points, start_idx, end_idx, tolerance):
            """Recursive Douglas-Peucker implementation."""
            if end_idx - start_idx <= 1:
                return [start_idx, end_idx]
            
            # Find point with maximum distance from line
            max_dist = 0
            max_idx = start_idx
            
            for i in range(start_idx + 1, end_idx):
                dist = perpendicular_distance(points[i], points[start_idx], points[end_idx])
                if dist > max_dist:
                    max_dist = dist
                    max_idx = i
            
            # If max distance is greater than tolerance, recursively simplify
            if max_dist > tolerance:
                left_result = douglas_peucker_recursive(points, start_idx, max_idx, tolerance)
                right_result = douglas_peucker_recursive(points, max_idx, end_idx, tolerance)
                return left_result[:-1] + right_result
            else:
                return [start_idx, end_idx]
        
        points = np.column_stack((x, y))
        indices = douglas_peucker_recursive(points, 0, len(points) - 1, tolerance)
        return np.array(indices)
    
    def _adaptive_sampling(self, x: np.ndarray, y: np.ndarray, target_points: int) -> np.ndarray:
        """
        Adaptive sampling based on local curvature. It combines uniform sampling with curvature-based selection, keeping more points where the bathymetry changes rapidly.
        """
        if len(x) <= target_points:
            return np.arange(len(x))
        
        # Calculate curvature (second derivative approximation)
        if len(x) < 3:
            return np.arange(len(x))
        
        # First derivatives
        dx = np.gradient(x)
        dy = np.gradient(y)
        
        # Second derivatives
        d2x = np.gradient(dx)
        d2y = np.gradient(dy)
        
        # Curvature magnitude
        curvature = np.abs(d2x * dy - d2y * dx) / (dx**2 + dy**2)**1.5
        curvature = np.nan_to_num(curvature, nan=0, posinf=0, neginf=0)
        
        # Normalize curvature
        if np.max(curvature) > 0:
            curvature = curvature / np.max(curvature)
        
        # Select points based on curvature and uniform spacing
        uniform_indices = np.linspace(0, len(x) - 1, target_points // 2, dtype=int)
        high_curvature_indices = np.argsort(curvature)[-target_points // 2:]
        
        # Combine and remove duplicates
        all_indices = np.unique(np.concatenate([uniform_indices, high_curvature_indices]))
        
        # Ensure we have the target number of points
        if len(all_indices) < target_points:
            # Add more uniform points
            remaining = target_points - len(all_indices)
            available_indices = np.setdiff1d(np.arange(len(x)), all_indices)
            if len(available_indices) >= remaining:
                additional_indices = np.random.choice(available_indices, remaining, replace=False)
                all_indices = np.concatenate([all_indices, additional_indices])
        
        return np.sort(all_indices)
    
    def get_data_for_plotting(self) -> Tuple[List[float], List[float]]:
        """
        Get data formatted for plotting.
        Returns: (inline_distances, depths)
        """
        if self.inline_distance is None or self.depth is None:
            return [], []
        
        return self.inline_distance.tolist(), self.depth.tolist() 