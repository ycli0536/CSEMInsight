import pandas as pd
import numpy as np

class XYZDataFileReader():
    """Visualization tool for MARE2DEM inversion results.
    """
    def __init__(self, file_path):
        self.file_path = file_path
        self.data = None
        self.read_file()

    def read_file(self):
        """Read the file and convert it to json format."""

        # Read the file into a DataFrame
        df = pd.read_csv(self.file_path,
                         sep=r'\s+',
                         header=None,
                         names=['X', 'Y', 'Z', 'rho1', 'rho2', 'rho3'])

        # Extract Y and Z coordinates, and resistivity values (rho1)
        self.data = df[['X', 'Y', 'Z', 'rho1']]

    def add_distance(self):
        """Add distance column to the DataFrame."""
        self.data['Y_dist'] = -np.sqrt((self.data['Y'] - self.data['Y'].iloc[-1])**2 + (self.data['X'] - self.data['X'].iloc[-1])**2)

    def df_for_echart_heatmap(self, df):
        """Convert DataFrame to a format that can be used by ECharts."""
        # Get unique Y and Z values
        unique_y = df['Y'].unique()
        unique_z = df['Z'].unique()

        # Create a mapping from Y and Z to their respective indices
        y_map = {value: idx for idx, value in enumerate(unique_y)}
        z_map = {value: idx for idx, value in enumerate(unique_z)}

        # Vectorized mapping of Y and Z to indices
        i_indices = df['Y'].map(y_map).astype(int)
        j_indices = df['Z'].map(z_map).astype(int)

        # Combine the indices and rho1 values into a DataFrame
        result_df = pd.DataFrame({
            'i': i_indices,
            'j': j_indices,
            'rho1': df['rho1']
        })

        return result_df

    def df_to_json(self, df):
        """Convert DataFrame to JSON."""
        result = df.to_json(orient='records')
        # result = df.to_json(orient='split', index=False)
        # result = df.to_json(orient='split', index=True)
        return result
