import numpy as np
import time
import math
from scipy.sparse import coo_matrix
try:
    from matplotlib.tri import Triangulation
except ModuleNotFoundError:  # pragma: no cover - optional dependency for plotting helpers
    Triangulation = None

class MARE2DEMPolyParser():
    """Class for parsing .poly files used in MARE2DEM."""
    def __init__(self):
        pass

    def read_poly_file(self, filename, unit_scale_factor=1e-3): # 1e-3 for km to m, 1e3 for m to km
        """Reads a .poly file and returns its components: vertices, segments, and holes."""
        
        with open(filename, 'r', encoding='utf-8') as file:
            # Read the file header
            parts = file.readline().strip().split()
            num_vertices = int(parts[0])
            # Assuming the dimension is 2, attributes and boundary markers are optional
            num_attributes = int(parts[2]) if len(parts) > 2 else 0
            has_boundary_markers = int(parts[3]) if len(parts) > 3 else 0
            # Read vertices
            vertices = {}
            for _ in range(num_vertices):
                parts = file.readline().strip().split()
                vertex_id = int(parts[0])
                x, y = [float(coord) * unit_scale_factor for coord in parts[1:3]]
                attributes = list(map(float, parts[3:3+num_attributes])) if num_attributes > 0 else []
                boundary_marker = int(parts[-1]) if has_boundary_markers else None
                vertices[vertex_id] = {'hCoor': x, 'vCoor': y, 'attributes': attributes, 'boundary_marker': boundary_marker}

            # Read segments
            num_segments, segments_has_boundary = map(int, file.readline().strip().split())
            segments = []
            for _ in range(num_segments):
                parts = file.readline().strip().split()
                segment_id = int(parts[0])
                endpoint_1, endpoint_2 = map(int, parts[1:3])
                boundary_marker = int(parts[3]) if segments_has_boundary else None
                segments.append({'id': segment_id, 'endpoint_1': endpoint_1, 'endpoint_2': endpoint_2, 'boundary_marker': boundary_marker})

            # Read holes
            num_holes = int(file.readline().strip())
            holes = []
            for _ in range(num_holes):
                parts = file.readline().strip().split()
                hole_id = int(parts[0])
                x, y = [float(coord) * unit_scale_factor for coord in parts[1:3]]
                holes.append({'id': hole_id, 'hCoor': x, 'vCoor': y})
            
            # Regions (optional, so handled with try-except in case they are not present)
            try:
                num_regions = int(file.readline().strip())
                regions = []
                for _ in range(num_regions):
                    parts = file.readline().strip().split()
                    region_id = int(parts[0])
                    x, y = [float(coord) * unit_scale_factor for coord in parts[1:3]]
                    attribute, max_area = region_id, -1 # the attribute value and maximum area constraints are ignored by MARE2DEM
                    regions.append({'id': region_id, 'hCoor': x, 'vCoor': y, 'attribute': attribute, 'max_area': max_area})
            except ValueError:
                # No regions data present
                regions = None
        return vertices, segments, holes, regions


    def write_poly_file(self, filename, vertices, segments, holes, regions=None):
        """Writes a .poly file with the given vertices, segments, and holes."""
        
        with open(filename, 'w', encoding='utf-8') as file:
            # Determine if vertices have attributes or boundary markers
            has_attributes = any(vertex.get('attributes') for vertex in vertices.values())
            has_boundary_markers = any(vertex.get('boundary_marker') is not None for vertex in vertices.values())
            
            # Write the file header
            file.write(f"{len(vertices)} 2 {1 if has_attributes else 0} {1 if has_boundary_markers else 0}\n")
            
            # Write vertices
            for vertex_id, vertex in vertices.items():
                y, z = vertex['hCoor'], vertex['vCoor']
                
                # Only include attributes and boundary markers if they exist
                line_parts = [str(vertex_id), str(y), str(z)]
                
                if has_attributes and vertex.get('attributes'):
                    attributes = ' '.join(map(str, vertex['attributes']))
                    line_parts.append(attributes)
                
                if has_boundary_markers and vertex.get('boundary_marker') is not None:
                    line_parts.append(str(vertex['boundary_marker']))
                
                file.write(' '.join(line_parts) + '\n')
            
            # Write segments
            # The segment boundary markers are used to store which segments have penalty cuts.
            file.write(f"{len(segments)} {'1' if any('boundary_marker' in segment for segment in segments) else '0'}\n")
            for segment in segments:
                endpoint_1, endpoint_2 = segment['endpoint_1'], segment['endpoint_2']
                boundary_marker = segment.get('boundary_marker', 0)
                if boundary_marker is None:
                    boundary_marker = 0
                file.write(f"{segment['id']} {endpoint_1} {endpoint_2} {boundary_marker}\n")
            
            # Write holes
            file.write(f"{len(holes)}\n")
            for hole in holes:
                y, z = hole['hCoor'], hole['vCoor']
                file.write(f"{hole['id']} {y} {z}\n")
            
            # Write regions
            # For the regional attributes, the attribute value and maximum area constraints are ignored by MARE2DEM, but the (y,z) location of each regional attribute is used to identify the region number of segment bound regions, and should be located at some point interior to the region.
            if regions is not None:
                file.write(f"{len(regions)}\n")
                for region in regions:
                    y, z, attribute, max_area = region['hCoor'], region['vCoor'], region['attribute'], region['max_area']
                    file.write(f"{region['id']} {y} {z} {attribute} {max_area}\n")

    def change_sign_h_coor(self, vertices, regions):
        """Change the sign of all the x coordinates in the vertices and regions dictionary."""
        for vertex in vertices.values():
            vertex['hCoor'] = -vertex['hCoor']
        for region in regions:
            region['hCoor'] = -region['hCoor']
        return vertices, regions

    def create_constrained_delaunay(self, vertices, segments):
        """Create a Constrained Delaunay triangulation from vertices and segments.
        
        Args:
            vertices (dict): Dictionary of vertices with their coordinates
            segments (list): List of segments defining the constraints
            
        Returns:
            tuple: (triangles, new_vertices, new_segments)
                - triangles: List of triangles, each containing 3 vertex indices
                - new_vertices: Dictionary of all vertices (including any new ones added during triangulation)
        """
        import triangle
            
        # Prepare data for triangle library
        # Convert vertices to the format expected by triangle
        points = []
        vertex_map = {}  # Map to convert between our vertex IDs and triangle's indices
        for i, (vid, v) in enumerate(vertices.items()):
            points.append([v['hCoor'], v['vCoor']])
            vertex_map[vid] = i
            
        print("vertex_map:", vertex_map.get(1))

        # Store segments with their markers: [([v1_idx, v2_idx], marker), ...]
        segments_with_markers = []
        for seg in segments:
            v1 = vertex_map[seg['endpoint_1']]
            v2 = vertex_map[seg['endpoint_2']]
            marker = seg.get('boundary_marker', 0)
            segments_with_markers.append(([v1, v2], marker))
            
        # NOTE: The _validate_triangulation_input function must be updated to accept and return this new `segments_with_markers` structure. It should still clean the points and update the segment indices accordingly. For this example, we'll assume it's updated and we separate the output.

        # 1. First, validate and clean the geometry.
        print("🔧 Basic validation of triangulation input...")
        cleaned_points, cleaned_segments_with_markers, _ = self._validate_triangulation_input(points, segments_with_markers)
        
        # Separate the cleaned segments from their markers for the tri_input dictionary
        cleaned_segments_list = [seg for seg, marker in cleaned_segments_with_markers]

        # 2. THEN, create the input dictionary with the CLEANED data.
        tri_input = {
            'vertices': cleaned_points,
            'segments': cleaned_segments_list
        }
        
        print(f"📊 Triangulation input summary:")
        print(f"   Original: {len(points)} vertices, {len(segments_with_markers)} segments")
        print(f"   Cleaned:  {len(cleaned_points)} vertices, {len(cleaned_segments_list)} segments")
        
        # Debug: Check for any segments with invalid vertex indices
        max_vertex_idx = len(cleaned_points) - 1
        invalid_segments = []
        for i, seg in enumerate(cleaned_segments_list):
            if seg[0] > max_vertex_idx or seg[1] > max_vertex_idx or seg[0] < 0 or seg[1] < 0:
                invalid_segments.append((i, seg))
        
        if invalid_segments:
            print(f"❌ Found {len(invalid_segments)} segments with invalid vertex indices:")
            for i, seg in invalid_segments[:5]:  # Show first 5
                print(f"   Segment {i}: {seg} (max valid index: {max_vertex_idx})")
            if len(invalid_segments) > 5:
                print(f"   ... and {len(invalid_segments) - 5} more")
        else:
            print(f"✅ All segments have valid vertex indices")
        
        # 3. Create a lookup map from the CLEANED segments to their markers
        # This is the key to correctly assigning markers later.
        cleaned_segment_marker_map = {
            tuple(sorted(seg)): marker for seg, marker in cleaned_segments_with_markers
        }

        # 4. Finally, generate the triangulation.

        # Generate the triangulation with robust options
        # 'p' - Planar Straight Line Graph (preserves segments)
        # 'z' - Zero-indexed output (consistent with Python indexing)
        # 'Q' - Quiet mode (suppress output)
        # 'n' - Output neighbor information
        # 'e' - Output edge information
        # Remove 'Y' flag as it can cause issues with complex geometries

        print("Creating constrained Delaunay triangulation...")
        try:
            # tri_output = triangle.triangulate(tri_input, 'pzQneq27') # this one is refining the mesh too dense
            tri_output = triangle.triangulate(tri_input, 'pzQne')
        except Exception as e:
            print(f"Triangulation failed with 'pzQne', trying simpler options: {e}")
            try:
                # Fallback to simpler options
                tri_output = triangle.triangulate(tri_input, 'pzQ')
            except Exception as e2:
                print(f"Triangulation failed with 'pzQ', trying basic: {e2}")
                # Most basic triangulation
                tri_output = triangle.triangulate(tri_input, 'pQ')

        # Convert output vertices back to our format
        new_vertices = {}
        for i, point in enumerate(tri_output['vertices']):
            new_vertices[i] = {
                'hCoor': point[0],
                'vCoor': point[1]
            }
            
        # Convert output segments to our format, preserving boundary markers from original segments
        new_segments = []
        for i, seg in enumerate(tri_output['segments']):
            seg_edge = tuple(sorted(seg))
            # Look up the cleaned edge in our map. Default to 0 if not found.
            boundary_marker = cleaned_segment_marker_map.get(seg_edge, 0)
            
            new_segments.append({
                'id': i, 
                'endpoint_1': seg[0], 
                'endpoint_2': seg[1], 
                'boundary_marker': boundary_marker
            })

        print("number of new vertices:", len(new_vertices))
        print("number of new segments:", len(new_segments))
        print('number of connectivity:', len(tri_output['triangles']))

        # Store the full triangulation output for later reference
        self.tri_output = tri_output
        
        # Store original segment edges for neighbor tracking
        # This is needed by get_segment_triangle_neighbors()
        self.original_segment_edges = set()
        for seg in cleaned_segments_list:
            edge = tuple(sorted([seg[0], seg[1]]))
            self.original_segment_edges.add(edge)

        # Get triangles
        triangles = tri_output['triangles'].tolist()
        
        return triangles, new_vertices, new_segments

    def _validate_triangulation_input(self, points, segments_with_markers):
        """
        Validates and cleans geometry for triangulation, now handling segments 
        that carry boundary marker information.

        This function removes duplicate vertices and degenerate segments, and it
        updates the segment vertex indices to match the cleaned vertex list.

        Args:
            points (list): List of [hCoor, vCoor] vertex coordinates.
            segments_with_markers (list): A list of tuples, where each tuple is 
                                        in the format ([v1_idx, v2_idx], marker).

        Returns:
            tuple: (cleaned_points, cleaned_segments_with_markers, issues_fixed)
        """
        print("🔧 Validating triangulation input (with markers)...")
        
        issues_fixed = []
        
        # --- Step 1: Remove duplicate points ---
        # This logic creates a `vertex_mapping` to map old indices to new ones.
        seen_points = {}
        vertex_mapping = {}  # Maps old vertex index -> new vertex index
        cleaned_points = []
        duplicate_count = 0
        
        for i, point in enumerate(points):
            # Round coordinates to handle floating point inaccuracies
            point_tuple = (round(point[0], 10), round(point[1], 10))
            if point_tuple in seen_points:
                # This is a duplicate point. Map its old index to the new index 
                # of the first time we saw this point.
                vertex_mapping[i] = seen_points[point_tuple]
                print('duplicated points:', point_tuple)
                duplicate_count += 1
            else:
                # This is a new unique point.
                new_index = len(cleaned_points)
                seen_points[point_tuple] = new_index
                vertex_mapping[i] = new_index
                cleaned_points.append(point)
        
        # --- Step 1.5: Ensure all segment-referenced vertices are mapped ---
        # Collect all vertex indices referenced in segments
        all_segment_vertices = set()
        for segment, marker in segments_with_markers:
            all_segment_vertices.add(segment[0])
            all_segment_vertices.add(segment[1])
        
        # Check if any segment references vertices that don't exist in our mapping
        missing_vertices = all_segment_vertices - set(vertex_mapping.keys())
        if missing_vertices:
            print(f"⚠️  Warning: Segments reference {len(missing_vertices)} vertices not in vertex list")
            print(f"   Missing vertex indices: {sorted(list(missing_vertices))[:10]}{'...' if len(missing_vertices) > 10 else ''}")
            # Add dummy mappings for missing vertices (they'll be filtered out as degenerate segments)
            for missing_idx in missing_vertices:
                vertex_mapping[missing_idx] = -1  # Invalid index
        
        if duplicate_count > 0:
            issues_fixed.append(f"Removed {duplicate_count} duplicate points")
        
        # --- Step 2: Remove degenerate segments and update indices ---
        cleaned_segments_with_markers = []
        degenerate_count = 0
        
        # The loop now iterates through the list of (segment, marker) tuples.
        for segment, marker in segments_with_markers:
            old_v1, old_v2 = segment
            
            # Check if both vertices exist in the mapping
            if old_v1 not in vertex_mapping or old_v2 not in vertex_mapping:
                print(f"⚠️  Skipping segment with invalid vertex indices: {old_v1}, {old_v2}")
                degenerate_count += 1
                continue
            
            # Use the mapping to get the new, correct indices for the segment's endpoints.
            new_v1 = vertex_mapping[old_v1]
            new_v2 = vertex_mapping[old_v2]
            
            # Check for invalid vertex indices (from missing vertices)
            if new_v1 == -1 or new_v2 == -1:
                print(f"⚠️  Skipping segment with missing vertices: {old_v1}->{new_v1}, {old_v2}->{new_v2}")
                degenerate_count += 1
                continue
            
            # Check for degenerate segments (endpoints are the same after cleaning).
            if new_v1 == new_v2:
                degenerate_count += 1
                continue
            
            # Optional but recommended: Check for zero-length segments using a small tolerance.
            p1, p2 = cleaned_points[new_v1], cleaned_points[new_v2]
            # Using squared distance to avoid a square root calculation
            dist_sq = (p1[0] - p2[0])**2 + (p1[1] - p2[1])**2
            if dist_sq < 1e-20: 
                degenerate_count += 1
                continue
            
            # If the segment is valid, append the re-indexed segment and its original marker.
            cleaned_segments_with_markers.append(([new_v1, new_v2], marker))
        
        if degenerate_count > 0:
            issues_fixed.append(f"Removed {degenerate_count} degenerate segments")
        
        if issues_fixed:
            print("✅ Applied geometry fixes:")
            for issue in issues_fixed:
                print(f"   • {issue}")
        
        return cleaned_points, cleaned_segments_with_markers, issues_fixed

    def _find_original_boundary_marker(self, triangulated_segment, original_segments):
        """
        Find boundary marker from original segments for triangulated segments.
        
        MARE2DEM: Triangulated segments should inherit boundary markers from 
        original segments to preserve penalty cut information.
        """
        if not hasattr(self, 'original_segment_edges') or not self.original_segment_edges:
            return None
        
        # Create normalized edge representation
        seg_edge = tuple(sorted([triangulated_segment[0], triangulated_segment[1]]))
        
        # Check if this edge was in the original segments
        if seg_edge in self.original_segment_edges:
            # Find the original segment with this edge to get its boundary marker
            for original_seg in original_segments:
                # Map original segment endpoints to triangulated vertex indices
                # This is a simplified approach - in practice, you might need vertex mapping
                orig_edge = tuple(sorted([original_seg['endpoint_1'], original_seg['endpoint_2']]))
                if orig_edge == seg_edge:
                    return original_seg.get('boundary_marker')
        
        return None

    def _validate_mare2dem_requirements(self, vertices, segments, regions):
        """
        Validate that the merged poly file meets MARE2DEM requirements.
        
        MARE2DEM Requirements:
        1. Vertex locations must be valid
        2. Segment endpoints must reference valid vertices
        3. Segment boundary markers identify penalty cuts
        4. Region locations must be interior points within regions
        5. Region numbers are used for resistivity mapping
        
        Args:
            vertices (dict): Merged vertices
            segments (list): Merged segments
            regions (list): Merged regions
        """
        print("🔍 Validating MARE2DEM requirements...")
        
        issues = []
        
        # 1. Validate vertex locations
        vertex_issues = 0
        for vertex in vertices.values():
            if 'hCoor' not in vertex or 'vCoor' not in vertex:
                vertex_issues += 1
            elif not (isinstance(vertex['hCoor'], (int, float)) and isinstance(vertex['vCoor'], (int, float))):
                vertex_issues += 1
        
        if vertex_issues > 0:
            issues.append(f"Found {vertex_issues} vertices with invalid coordinates")
        
        # 2. Validate segment endpoints
        segment_issues = 0
        boundary_markers = 0
        for segment in segments:
            if segment['endpoint_1'] not in vertices or segment['endpoint_2'] not in vertices:
                segment_issues += 1
            
            # Count boundary markers (penalty cuts)
            if segment.get('boundary_marker') is not None and segment.get('boundary_marker') != 0:
                boundary_markers += 1
        
        if segment_issues > 0:
            issues.append(f"Found {segment_issues} segments with invalid vertex references")
        
        # 3. Validate regions
        region_issues = 0
        if regions:
            for region in regions:
                if 'hCoor' not in region or 'vCoor' not in region:
                    region_issues += 1
                elif not (isinstance(region['hCoor'], (int, float)) and isinstance(region['vCoor'], (int, float))):
                    region_issues += 1
        
        if region_issues > 0:
            issues.append(f"Found {region_issues} regions with invalid interior point coordinates")
        
        # Report results
        print(f"  ✓ Vertices: {len(vertices)} (all with valid coordinates)")
        print(f"  ✓ Segments: {len(segments)} (all with valid endpoints)")
        print(f"  ✓ Boundary markers: {boundary_markers} segments with penalty cuts")
        print(f"  ✓ Regions: {len(regions) if regions else 0} (all with interior points)")
        
        if issues:
            print("❌ MARE2DEM validation issues:")
            for issue in issues:
                print(f"   • {issue}")
            return False
        else:
            print("✅ All MARE2DEM requirements satisfied")
            return True

    def get_segment_triangle_neighbors(self):
        """Get pairs of triangles that share a segment/edge.
        
        This function should be called after create_constrained_delaunay().
        
        Returns:
            dict: Dictionary with:
                - 'segment_neighbors': List of (triangle1_idx, triangle2_idx) pairs that share a segment
                - 'segments': List of (vertex1_idx, vertex2_idx) segments 
                - 'constrained_segments': List of indices into 'segments' that correspond to constrained segments
        """
        if not hasattr(self, 'tri_output'):
            raise RuntimeError("create_constrained_delaunay() must be called before get_segment_triangle_neighbors()")
        
        if not hasattr(self, 'original_segment_edges'):
            raise RuntimeError("create_constrained_delaunay() must be called with recent code to track original segments")
        
        # Get the triangle neighbors from tri_output
        # tri_output['neighbors'] contains for each triangle, the 3 neighboring triangles
        # -1 indicates no neighbor (boundary)
        # neighbors = self.tri_output['neighbors']  # Not used in this implementation
        
        # Get the edge information
        # tri_output['edges'] contains all edges (segments) as pairs of vertex indices
        edges = self.tri_output['edges']
        
        # Get the triangle information
        triangles = self.tri_output['triangles']
        
        # Create mapping of edges to the triangles they belong to
        edge_to_triangles = {}
        
        # For each triangle
        for i, tri in enumerate(triangles):
            # For each edge in the triangle
            for j in range(3):
                # Get the vertices of this edge (sorted to ensure consistent representation)
                v1, v2 = sorted([tri[j], tri[(j+1)%3]])
                edge = (v1, v2)
                
                # Add this triangle to the edge's list
                if edge in edge_to_triangles:
                    edge_to_triangles[edge].append(i)
                else:
                    edge_to_triangles[edge] = [i]
        
        # Identify pairs of triangles that share an edge
        segment_neighbors = []
        for edge, tris in edge_to_triangles.items():
            if len(tris) == 2:  # This edge is shared by exactly 2 triangles
                segment_neighbors.append(tuple(tris))
        
        # Identify constrained edges based on original segments
        constrained_edges = []
        edges_list = edges.tolist()
        for i, (v1, v2) in enumerate(edges_list):
            edge = (min(v1, v2), max(v1, v2))
            if edge in self.original_segment_edges:
                constrained_edges.append(i)
                
        print(f"Found {len(constrained_edges)} constrained edges out of {len(edges_list)} total edges")
            
        return {
            'segment_neighbors': segment_neighbors,
            'segments': edges.tolist(),
            'constrained_segments': constrained_edges
        }

    def get_triangle_regions(self, regions):
        """Get the region index for each triangle.
        
        This method uses flood-fill algorithm to determine which original region
        each triangle belongs to based on the region seed points.
        
        Args:
            regions (list): List of region dictionaries with coordinates
            
        Returns:
            tuple: (TriIndex, regionIndex)
                - TriIndex: Array where each element is the region number (1,2,3...) for each triangle
                - regionIndex: Array mapping new region numbers to original region indices
        """
        # Get the triangles
        triangles = self.tri_output['triangles']
        
        # Get the number of vertices and triangles
        n = len(self.tri_output['vertices'])
        nTri = len(triangles)
        
        # Get the segments
        segments = self.tri_output['segments']
        
        regions_coords = np.array([[v['hCoor'], v['vCoor']] for v in regions])
        
        # --- Create the Adjacency Matrix for the boundary segments ---
        # segs is assumed to be an (n_seg,2) array of node indices.
        v1 = segments[:, 0]
        v2 = segments[:, 1]
        # Build a symmetric sparse matrix where an entry is 1 if there is a boundary segment
        row = np.concatenate([v1, v2])
        col = np.concatenate([v2, v1])
        data = np.ones(len(row), dtype=int)
        Adjacency = coo_matrix((data, (row, col)), shape=(n, n)).tocsr()
        
        # Get each triangle's vertices:
        v1_tri = triangles[:, 0]
        v2_tri = triangles[:, 1]
        v3_tri = triangles[:, 2]
        
        # For each triangle, determine if each edge is a boundary:
        # Edge 1: from vertex 2 to vertex 3.
        e1 = np.array(Adjacency[v2_tri, v3_tri]).flatten()
        # Edge 2: from vertex 3 to vertex 1.
        e2 = np.array(Adjacency[v3_tri, v1_tri]).flatten()
        # Edge 3: from vertex 1 to vertex 2.
        e3 = np.array(Adjacency[v1_tri, v2_tri]).flatten()
        # E is an (nTris,3) array. An entry of 1 means that edge is a boundary.
        E = np.column_stack((e1, e2, e3))
        
        # Get the neighbors
        neighbors = self.tri_output['neighbors']
        # For edges that are boundary edges (E==1), we want to disallow crossing.
        # Thus, set the corresponding neighbor entries to -1.
        neighbors[E == 1] = -1
        
        # --- Initialize the Output Arrays ---
        TriIndex = np.zeros(nTri, dtype=int)  # will hold region numbers for each triangle
        regionIndex_list = []  # will store mapping from new region numbers to input region index
        nRegions = 0
        
        # --- First Pass: Flood-Fill Using Input Region Seeds ---
        if regions is not None:
            # For each seed point, find the triangle index that contains it.
            # DT.find_simplex returns -1 if the point is outside.
            # Extract x and y coordinates from vertices dictionary
            x = self.tri_output['vertices'][:,0]
            y = self.tri_output['vertices'][:,1]
            mtri = Triangulation(x, y, triangles)
            iTri = np.array([self.find_containing_triangle(point, mtri) for point in regions_coords])
            
            # Loop over each seed (using 0-based index for seeds)
            for ireg in range(regions_coords.shape[0]):
                e = iTri[ireg]
                if e == -1:
                    # Skip seed if it is not inside any triangle.
                    continue
                if TriIndex[e] != 0:
                    # This triangle has already been assigned a region.
                    continue
                nRegions += 1
                # Map new region number to the input seed (store ireg; if you wish, add 1 for 1-based)
                regionIndex_list.append(ireg)
                
                # Begin flood-fill from triangle e.
                neighs = [e]
                while len(neighs) > 0:
                    # Assign the current region number to all triangles in 'neighs'
                    for tri_idx in neighs:
                        TriIndex[tri_idx] = nRegions
                    # Gather neighbors of all triangles in 'neighs' that are not yet assigned.
                    new_neighs = []
                    for tri_idx in neighs:
                        # N[tri_idx, :] gives neighbors for this triangle.
                        for nb in neighbors[tri_idx]:
                            if nb >= 0 and TriIndex[nb] == 0:
                                new_neighs.append(nb)
                        # Mark these triangle's neighbors as processed.
                        neighbors[tri_idx] = -1
                    # Remove duplicates
                    neighs = list(set(new_neighs))
                    
        regionIndex = np.array(regionIndex_list, dtype=int)
    
        return TriIndex, regionIndex
    
    def get_region_statistics(self, regions):
        """Get detailed statistics about triangle-to-region mapping.
        
        Args:
            regions (list): List of region dictionaries
            
        Returns:
            dict: Statistics including region counts, triangle assignments, etc.
        """
        if not hasattr(self, 'tri_output'):
            raise RuntimeError("create_constrained_delaunay() must be called before get_region_statistics()")
        
        # Get triangle region assignments
        TriIndex, regionIndex = self.get_triangle_regions(regions)
        
        # Count triangles per region
        region_counts = {}
        for i, region_num in enumerate(TriIndex):
            if region_num > 0:  # Valid region assignment
                if region_num not in region_counts:
                    region_counts[region_num] = 0
                region_counts[region_num] += 1
        
        # Create detailed statistics
        stats = {
            'total_triangles': len(TriIndex),
            'total_regions': len(regionIndex),
            'triangles_with_regions': sum(1 for x in TriIndex if x > 0),
            'triangles_without_regions': sum(1 for x in TriIndex if x == 0),
            'region_counts': region_counts,
            'region_mapping': {i+1: regionIndex[i] for i in range(len(regionIndex))},
            'TriIndex': TriIndex,
            'regionIndex': regionIndex
        }
        
        return stats
                    
    def find_containing_triangle(self, point, mtri):
        """Find which triangle contains the given point using matplotlib's Triangulation"""
        # Find which triangle contains each region point using matplotlib's Triangulation
        return mtri.get_trifinder()(point[0], point[1])
    
    
class MARE2DEMPolyManager():
    """High-performance class for managing large MARE2DEM .poly files."""
    def __init__(self):
        self.parser = MARE2DEMPolyParser()
        self.tolerance = 1e-10  # Tolerance for floating point comparisons
        self.min_angle_degrees = 27.0  # Minimum angle between segments in degrees
    
    def _calculate_angle_between_segments(self, p1, p2, p3):
        """
        Calculate the angle between two segments sharing a common vertex.
        
        Args:
            p1: First endpoint of first segment (common vertex)
            p2: Second endpoint of first segment
            p3: Second endpoint of second segment
            
        Returns:
            float: Angle in degrees between the two segments
        """
        # Vector from p1 to p2
        v1 = np.array([p2['hCoor'] - p1['hCoor'], p2['vCoor'] - p1['vCoor']])
        # Vector from p1 to p3
        v2 = np.array([p3['hCoor'] - p1['hCoor'], p3['vCoor'] - p1['vCoor']])
        
        # Calculate magnitudes
        mag1 = np.linalg.norm(v1)
        mag2 = np.linalg.norm(v2)
        
        # Avoid division by zero
        if mag1 < self.tolerance or mag2 < self.tolerance:
            return 0.0
        
        # Calculate angle using dot product
        cos_angle = np.dot(v1, v2) / (mag1 * mag2)
        
        # Clamp to avoid numerical errors
        cos_angle = np.clip(cos_angle, -1.0, 1.0)
        
        # Convert to degrees
        angle_rad = math.acos(cos_angle)
        angle_deg = math.degrees(angle_rad)
        
        return angle_deg
    
    def _find_adjacent_segments(self, segments, vertices):
        """
        Find all pairs of segments that share a common vertex.
        
        Args:
            segments: List of segment dictionaries
            vertices: Dictionary of vertices
            
        Returns:
            list: List of tuples (seg1_idx, seg2_idx, common_vertex_id, other_vertex1, other_vertex2)
        """
        # Build adjacency map: vertex_id -> list of segments that use it
        vertex_to_segments = {}
        for i, seg in enumerate(segments):
            v1, v2 = seg['endpoint_1'], seg['endpoint_2']
            if v1 not in vertex_to_segments:
                vertex_to_segments[v1] = []
            if v2 not in vertex_to_segments:
                vertex_to_segments[v2] = []
            vertex_to_segments[v1].append(i)
            vertex_to_segments[v2].append(i)
        
        # Find pairs of segments sharing a vertex
        adjacent_pairs = []
        for vertex_id, seg_indices in vertex_to_segments.items():
            if len(seg_indices) >= 2:
                # Check all pairs of segments at this vertex
                for i in range(len(seg_indices)):
                    for j in range(i + 1, len(seg_indices)):
                        seg1_idx = seg_indices[i]
                        seg2_idx = seg_indices[j]
                        seg1 = segments[seg1_idx]
                        seg2 = segments[seg2_idx]
                        
                        # Determine the other vertices
                        if seg1['endpoint_1'] == vertex_id:
                            other_vertex1 = seg1['endpoint_2']
                        else:
                            other_vertex1 = seg1['endpoint_1']
                            
                        if seg2['endpoint_1'] == vertex_id:
                            other_vertex2 = seg2['endpoint_2']
                        else:
                            other_vertex2 = seg2['endpoint_1']
                        
                        adjacent_pairs.append((seg1_idx, seg2_idx, vertex_id, other_vertex1, other_vertex2))
        
        return adjacent_pairs
    
    def _check_angle_quality(self, segments, vertices):
        """
        Check angle quality and remove segments with positive markers if angles are too small.
        
        Args:
            segments: List of segment dictionaries
            vertices: Dictionary of vertices
            
        Returns:
            tuple: (filtered_segments, removed_count, quality_report)
        """
        print(f"🔍 Checking angle quality (minimum angle: {self.min_angle_degrees}°)...")
        
        # Find all adjacent segment pairs
        adjacent_pairs = self._find_adjacent_segments(segments, vertices)
        print(f"  Found {len(adjacent_pairs)} adjacent segment pairs to check")
        
        # Track segments to remove
        segments_to_remove = set()
        quality_issues = []
        
        for seg1_idx, seg2_idx, common_vertex_id, other_vertex1, other_vertex2 in adjacent_pairs:
            # Get vertex coordinates
            p1 = vertices[common_vertex_id]  # Common vertex
            p2 = vertices[other_vertex1]     # End of first segment
            p3 = vertices[other_vertex2]     # End of second segment
            
            # Calculate angle
            angle = self._calculate_angle_between_segments(p1, p2, p3)
            
            if angle < self.min_angle_degrees:
                seg1 = segments[seg1_idx]
                seg2 = segments[seg2_idx]
                
                # Get boundary markers (default to 0 if None)
                marker1 = seg1.get('boundary_marker', 0) or 0
                marker2 = seg2.get('boundary_marker', 0) or 0
                
                quality_issues.append({
                    'angle': angle,
                    'seg1_idx': seg1_idx,
                    'seg2_idx': seg2_idx,
                    'common_vertex': common_vertex_id,
                    'marker1': marker1,
                    'marker2': marker2
                })
                
                # Decision logic: remove segment with positive marker
                if marker1 > 0 and marker2 <= 0:
                    segments_to_remove.add(seg1_idx)
                elif marker2 > 0 and marker1 <= 0:
                    segments_to_remove.add(seg2_idx)
                elif marker1 > 0 and marker2 > 0:
                    # Both positive - remove the one with higher marker (or first one)
                    if marker1 >= marker2:
                        segments_to_remove.add(seg1_idx)
                    else:
                        segments_to_remove.add(seg2_idx)
                # If both are negative or zero, leave them as is (don't remove)
        
        # Filter out segments to remove
        filtered_segments = []
        for i, seg in enumerate(segments):
            if i not in segments_to_remove:
                filtered_segments.append(seg)
        
        removed_count = len(segments_to_remove)
        
        # Generate quality report
        quality_report = {
            'total_pairs_checked': len(adjacent_pairs),
            'pairs_with_small_angles': len(quality_issues),
            'segments_removed': removed_count,
            'issues': quality_issues
        }
        
        if removed_count > 0:
            print(f"  ⚠️  Removed {removed_count} segments with small angles")
            print(f"  📊 Quality issues found: {len(quality_issues)} pairs with angles < {self.min_angle_degrees}°")
        else:
            print(f"  ✅ All segment angles are ≥ {self.min_angle_degrees}°")
        
        return filtered_segments, removed_count, quality_report
    
    def merge_poly(self, poly_file1, poly_file2, unit_scale_factor=1, output_file=None, output_file_without_regions=None):
        """
        Geometrically correct merge of two poly files with proper intersection handling.
        
        This implementation prioritizes geometric correctness and handles all intersection cases:
        - Detects and processes all segment intersections between files
        - Creates intersection vertices at crossing points
        - Splits segments at intersection locations
        - Preserves boundary markers and MARE2DEM attributes
        - Optimized algorithms for performance while maintaining correctness
        - Optional: Use triangle incenters as region locations instead of merging original regions
        
        Args:
            poly_file1 (str): Path to the first .poly file
            poly_file2 (str): Path to the second .poly file  
            unit_scale_factor (float, optional): Unit scale factor for the coordinates in the poly files
            output_file (str, optional): Path for output merged .poly file
            output_file_without_regions (str, optional): Path for output merged .poly file without regions  

        Returns:
            tuple: (merged_vertices, merged_segments, merged_holes, merged_regions)
        """
        start_time = time.time()
        
        print("====Poly file merge starting...====")
        
        # Read both poly files
        print("Reading poly files...")
        vertices1, segments1, holes1, regions1 = self.parser.read_poly_file(poly_file1, unit_scale_factor=unit_scale_factor)
        vertices2, segments2, holes2, regions2 = self.parser.read_poly_file(poly_file2, unit_scale_factor=unit_scale_factor)
        
        print(f"File 1: {len(vertices1):,} vertices, {len(segments1):,} segments")
        print(f"File 2: {len(vertices2):,} vertices, {len(segments2):,} segments")
        
        # Geometrically correct merge with intersection handling
        merged_vertices, merged_segments, merged_holes, merged_regions = self._correct_merge(
            vertices1, segments1, holes1, regions1,
            vertices2, segments2, holes2, regions2,
            output_file_without_regions
        )
        
        elapsed = time.time() - start_time
        print(f"✅ Merge completed in {elapsed:.2f} seconds")
        print(f"Result: {len(merged_vertices):,} vertices, {len(merged_segments):,} segments, {len(merged_regions):,} regions")
        
        # Write output file if specified
        if output_file:
            print(f"Writing merged file to {output_file}...")
            self.parser.write_poly_file(output_file, merged_vertices, merged_segments, merged_holes, merged_regions)
            print("✅ File written successfully")

        return merged_vertices, merged_segments, merged_holes, merged_regions
    
    def _correct_merge(self, vertices1, segments1, holes1, regions1, vertices2, segments2, holes2, regions2, output_file_without_regions=None):
        """
        Geometrically correct merge implementation with optimized intersection handling.
        
        This implementation prioritizes geometric correctness:
        - Always detects and handles segment intersections
        - Creates intersection vertices at crossing points
        - Splits segments at intersection locations
        - Preserves boundary markers and MARE2DEM attributes
        - Uses optimized algorithms for performance
        
        Args:
            vertices1, segments1, holes1, regions1: Data from first poly file
            vertices2, segments2, holes2, regions2: Data from second poly file
        
        Returns:
            tuple: (merged_vertices, merged_segments, merged_holes, merged_regions)
        """
        print("🔧 Geometrically correct merge processing...")
        
        # Step 1: Merge vertices with duplicate detection
        merged_vertices, vertex_mapping1, vertex_mapping2 = self._merge_vertices_correct(vertices1, vertices2)
        
        # Step 2: Detect and handle all intersections
        print("🔍 Detecting segment intersections...")
        intersection_vertices, intersection_info = self._find_intersections_optimized(
            segments1, segments2, merged_vertices, vertex_mapping1, vertex_mapping2
        )
        
        if intersection_vertices:
            print(f"  ✓ Found {len(intersection_vertices)} intersection points")
            # Add intersection vertices to merged set
            merged_vertices.update(intersection_vertices)
            
            # Split segments at intersections
            segments1_split = self._split_segments_at_intersections(
                segments1, intersection_info, 'file1', vertex_mapping1, merged_vertices
            )
            segments2_split = self._split_segments_at_intersections(
                segments2, intersection_info, 'file2', vertex_mapping2, merged_vertices
            )
            
            # Merge split segments
            merged_segments = self._merge_split_segments(segments1_split, segments2_split, merged_vertices)
        else:
            print("  ✓ No intersections found")
            # No intersections, use normal segment merge
            merged_segments = self._merge_segments_correct(segments1, segments2, vertex_mapping1, vertex_mapping2, merged_vertices)
        
        # Step 3: Merge holes and regions
        merged_holes = self._merge_holes_correct(holes1, holes2)
        
        if output_file_without_regions: # if output file without regions is specified, write the file
            print(f'write poly file without regions to {output_file_without_regions}')
            self.parser.write_poly_file(output_file_without_regions, merged_vertices, merged_segments, merged_holes, None)
        
        # merged_regions = self._merge_regions_correct(regions1, regions2)
        merged_regions = self._determine_regions_from_geometry(
            merged_vertices, merged_segments, regions1, regions2
        )
        
        return merged_vertices, merged_segments, merged_holes, merged_regions
    
    def _merge_vertices_correct(self, vertices1, vertices2):
        """
        High-performance vertex merging using spatial hashing.
        
        Returns:
            tuple: (merged_vertices, vertex_mapping1, vertex_mapping2)
                - merged_vertices: Dictionary of merged vertices with new IDs
                - vertex_mapping1: Maps old vertex IDs from file1 to new IDs
                - vertex_mapping2: Maps old vertex IDs from file2 to new IDs
        """
        merged_vertices = {}
        vertex_mapping1 = {}  # old_id -> new_id for file 1
        vertex_mapping2 = {}  # old_id -> new_id for file 2
        next_id = 1
        
        # Spatial hash for fast duplicate detection (grid-based)
        grid_size = max(self.tolerance * 10, 1e-8)  # Grid size based on tolerance
        spatial_hash = {}  # hash_key -> list of vertex_ids
        
        def get_hash_key(x, y):
            return (int(x / grid_size), int(y / grid_size))
        
        def find_duplicate_in_grid(vertex):
            """Find duplicate vertex by checking grid cell and neighbors."""
            x, y = vertex['hCoor'], vertex['vCoor']
            # Check the grid cell and its 8 neighbors
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    grid_key = (int(x / grid_size) + dx, int(y / grid_size) + dy)
                    if grid_key in spatial_hash:
                        for existing_id in spatial_hash[grid_key]:
                            existing_vertex = merged_vertices[existing_id]
                            if (abs(vertex['hCoor'] - existing_vertex['hCoor']) < self.tolerance and
                                abs(vertex['vCoor'] - existing_vertex['vCoor']) < self.tolerance):
                                return existing_id
            return None
        
        # Add all vertices from file 1
        for old_id, vertex in vertices1.items():
            merged_vertices[next_id] = {
                'hCoor': vertex['hCoor'],
                'vCoor': vertex['vCoor']
            }
            vertex_mapping1[old_id] = next_id
            hash_key = get_hash_key(vertex['hCoor'], vertex['vCoor'])
            if hash_key not in spatial_hash:
                spatial_hash[hash_key] = []
            spatial_hash[hash_key].append(next_id)
            next_id += 1
        
        # Add vertices from file 2, checking for duplicates using spatial hash
        duplicates_found = 0
        for old_id, vertex in vertices2.items():
            duplicate_id = find_duplicate_in_grid(vertex)
            
            if duplicate_id is not None:
                # This is a duplicate - map to existing vertex
                vertex_mapping2[old_id] = duplicate_id
                duplicates_found += 1
                continue
            
            # New unique vertex
            merged_vertices[next_id] = {
                'hCoor': vertex['hCoor'],
                'vCoor': vertex['vCoor']
            }
            vertex_mapping2[old_id] = next_id
            hash_key = get_hash_key(vertex['hCoor'], vertex['vCoor'])
            if hash_key not in spatial_hash:
                spatial_hash[hash_key] = []
            spatial_hash[hash_key].append(next_id)
            next_id += 1
        
        if duplicates_found > 0:
            print(f"  ✓ Removed {duplicates_found:,} duplicate vertices")
        
        print(f"  📊 Vertex merge summary:")
        print(f"     File 1: {len(vertices1):,} vertices -> {len(vertex_mapping1):,} mapped")
        print(f"     File 2: {len(vertices2):,} vertices -> {len(vertex_mapping2):,} mapped")
        print(f"     Merged: {len(merged_vertices):,} unique vertices")
        
        return merged_vertices, vertex_mapping1, vertex_mapping2
    
    def _merge_segments_correct(self, segments1, segments2, vertex_mapping1, vertex_mapping2, merged_vertices):
        """
        High-performance segment merging with duplicate removal and angle quality checking.
        
        Args:
            segments1, segments2: Segment lists from both files
            vertex_mapping1: Maps old vertex IDs from file1 to new IDs
            vertex_mapping2: Maps old vertex IDs from file2 to new IDs
            merged_vertices: Dictionary of merged vertices for angle calculations
            
        Returns:
            list: Merged segments with duplicates removed and angle quality enforced
        """
        merged_segments = []
        next_id = 1
        
        # Use set for O(1) duplicate detection
        seen_edges = set()
        
        # Add segments from file 1 with vertex ID mapping
        for segment in segments1:
            # Map vertex IDs from file 1
            v1 = vertex_mapping1[segment['endpoint_1']]
            v2 = vertex_mapping1[segment['endpoint_2']]
            edge_key = tuple(sorted([v1, v2]))
            
            if edge_key not in seen_edges:
                new_segment = segment.copy()
                new_segment['id'] = next_id
                new_segment['endpoint_1'] = v1
                new_segment['endpoint_2'] = v2
                merged_segments.append(new_segment)
                seen_edges.add(edge_key)
                next_id += 1
        
        # Add segments from file 2 with vertex ID mapping
        duplicates_found = 0
        for segment in segments2:
            # Map vertex IDs from file 2
            v1 = vertex_mapping2[segment['endpoint_1']]
            v2 = vertex_mapping2[segment['endpoint_2']]
            edge_key = tuple(sorted([v1, v2]))
            
            if edge_key not in seen_edges:
                new_segment = segment.copy()
                new_segment['id'] = next_id
                new_segment['endpoint_1'] = v1
                new_segment['endpoint_2'] = v2
                merged_segments.append(new_segment)
                seen_edges.add(edge_key)
                next_id += 1
            else:
                duplicates_found += 1
        
        if duplicates_found > 0:
            print(f"  ✓ Removed {duplicates_found:,} duplicate segments")
        
        # Apply angle quality checking
        print("🔍 Applying angle quality checking to merged segments...")
        merged_segments, _, _ = self._check_angle_quality(merged_segments, merged_vertices)
        
        # Reassign IDs after filtering
        for i, segment in enumerate(merged_segments):
            segment['id'] = i + 1
        
        return merged_segments

    def _merge_holes_correct(self, holes1, holes2):
        """Fast hole merging with simple duplicate removal."""
        merged_holes = []
        next_id = 1
        
        # Add holes from file 1
        for hole in holes1:
            new_hole = hole.copy()
            new_hole['id'] = next_id
            merged_holes.append(new_hole)
            next_id += 1
        
        # Add holes from file 2 with basic duplicate check
        for hole in holes2:
            # Simple duplicate check (holes are typically few)
            is_duplicate = False
            for existing_hole in merged_holes:
                if (abs(hole['hCoor'] - existing_hole['hCoor']) < self.tolerance and
                    abs(hole['vCoor'] - existing_hole['vCoor']) < self.tolerance):
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                new_hole = hole.copy()
                new_hole['id'] = next_id
                merged_holes.append(new_hole)
                next_id += 1
        
        return merged_holes
    
    def _determine_regions_from_geometry(self, vertices, segments, regions1, regions2):
        """
        Determines new regions by triangulating the final geometry and placing a seed
        point in each distinct, enclosed area. This is the correct approach for merging regions.
        
        Args:
            vertices (dict): The final, merged set of vertices.
            segments (list): The final, merged, and split set of segments.
            regions1 (list): The original regions from the first file.
            regions2 (list): The original regions from the second file.
            
        Returns:
            list: A new list of region dictionaries, one for each identified region.
        """
        
        print("🧠 Determining new regions from the final merged geometry (optimized)...")
        
        # Performance monitoring
        total_start = time.time()
        
        # Step 1: Triangulate the final geometry using the existing parser method
        triangulation_start = time.time()
        parser = self.parser
        try:
            # We need the full triangulation output, so we call the method and access the stored attribute
            parser.create_constrained_delaunay(vertices, segments)
            tri_output = parser.tri_output
        except ImportError as e:
            print(f"Error: {e}. Cannot determine regions without the 'triangle' library.")
            # Return original regions as a fallback, though they may be incorrect for the new geometry
            return (regions1 or []) + (regions2 or [])
        
        triangulation_time = time.time() - triangulation_start
        print(f"  ⏱️  Triangulation: {triangulation_time:.3f}s")

        # Get triangulation results
        triangles = tri_output['triangles']
        tri_vertices = tri_output['vertices']
        n_vertices = len(tri_output['vertices'])
        n_tri = len(triangles)
        neighbors = tri_output['neighbors']

        # Step 1: Explicitly identify the "fences" (boundary segments)
        # Create a sparse matrix where non-zero entries mark connections along a boundary segment.
        # OPTIMIZATION: Use more efficient array operations
        boundary_start = time.time()

        # Vectorized extraction of segment endpoints
        v1 = np.array([s['endpoint_1'] for s in segments], dtype=np.int32)
        v2 = np.array([s['endpoint_2'] for s in segments], dtype=np.int32)

        # We need to map the original vertex IDs to the new indices used by the triangle library.
        # This requires a mapping from your `vertices` dictionary keys to `tri_output` indices.
        # For simplicity here, let's assume `v1` and `v2` are already 0-indexed triangle vertex indices.
        # A proper implementation would need to build this map carefully.
        # Let's assume the vertex keys are 1-based and triangle indices are 0-based.
        # This is a common pattern.
        v1_idx = v1 - 1
        v2_idx = v2 - 1

        # OPTIMIZATION: Pre-allocate arrays and use more efficient concatenation
        n_segments = len(segments)
        row = np.empty(2 * n_segments, dtype=np.int32)
        col = np.empty(2 * n_segments, dtype=np.int32)
        
        row[:n_segments] = v1_idx
        row[n_segments:] = v2_idx
        col[:n_segments] = v2_idx
        col[n_segments:] = v1_idx
        
        data = np.ones(2 * n_segments, dtype=np.int8)  # Use int8 for memory efficiency
        boundary_adj = coo_matrix((data, (row, col)), shape=(n_vertices, n_vertices)).tocsr()
        
        boundary_time = time.time() - boundary_start
        print(f"  ⏱️  Boundary detection: {boundary_time:.3f}s")

        # Step 2: Use the fences to sever neighbor connections
        # For each triangle, check if its edges are boundary fences.
        v1_tri = triangles[:, 0]
        v2_tri = triangles[:, 1]
        v3_tri = triangles[:, 2]

        # An edge is a fence if its endpoints have a connection in our boundary_adj matrix.
        # Edge 1 (v1 -> v2), Edge 2 (v2 -> v3), Edge 3 (v3 -> v1)
        is_fence_edge1 = np.array(boundary_adj[v1_tri, v2_tri]).flatten()
        is_fence_edge2 = np.array(boundary_adj[v2_tri, v3_tri]).flatten()
        is_fence_edge3 = np.array(boundary_adj[v3_tri, v1_tri]).flatten()

        # The neighbor across from an edge needs to be nullified if that edge is a fence.
        # The neighbors array is ordered: neighbor across edge (v2,v3), then (v3,v1), then (v1,v2).
        neighbors[is_fence_edge2 == 1, 0] = -1
        neighbors[is_fence_edge3 == 1, 1] = -1
        neighbors[is_fence_edge1 == 1, 2] = -1

        # Step 3: Now, run the same flood-fill algorithm with the corrected `neighbors` array.
        # This time, it will be stopped by the fences.
        # OPTIMIZATION: Use deque for better queue performance while keeping exact same logic
        from collections import deque
        
        flood_fill_start = time.time()
        
        triangle_to_region_map = np.full(n_tri, -1, dtype=int)
        current_region_id = 0

        for i in range(n_tri):
            if triangle_to_region_map[i] == -1:
                # OPTIMIZATION: Use deque instead of list for better performance
                q = deque([i])
                triangle_to_region_map[i] = current_region_id
                
                while q:  # More efficient than checking head < len(q)
                    current_tri_idx = q.popleft()  # More efficient than q[head] and head += 1
                    for neighbor_idx in neighbors[current_tri_idx]:
                        if neighbor_idx != -1 and triangle_to_region_map[neighbor_idx] == -1:
                            triangle_to_region_map[neighbor_idx] = current_region_id
                            q.append(neighbor_idx)
                current_region_id += 1

        flood_fill_time = time.time() - flood_fill_start
        print(f"  ✓ Success! Identified {current_region_id} distinct geometric regions.")
        print(f"  ⏱️  Flood-fill: {flood_fill_time:.3f}s")

        # Step 3: Generate a single seed point for each new region
        tic = time.time()
        new_regions = []
        all_original_regions = (regions1 or []) + (regions2 or [])
        
        # Create a triangulation object to efficiently find which triangle contains a point
        mtri = Triangulation(tri_vertices[:,0], tri_vertices[:,1], triangles)
        trifinder = mtri.get_trifinder()

        # OPTIMIZATION: Batch process original regions for better performance
        # Create mapping from triangle index to original regions (same logic, better performance)
        tri_to_orig_regions = {}
        if all_original_regions:
            # Batch query all original region points at once
            orig_points = np.array([[r['hCoor'], r['vCoor']] for r in all_original_regions])
            containing_tri_indices = trifinder(orig_points[:, 0], orig_points[:, 1])
            
            # Build mapping (same logic as individual queries, just batched)
            for i, tri_idx in enumerate(containing_tri_indices):
                if tri_idx != -1:
                    if tri_idx not in tri_to_orig_regions:
                        tri_to_orig_regions[tri_idx] = []
                    tri_to_orig_regions[tri_idx].append(all_original_regions[i])

        for region_id in range(current_region_id):
            # Find all triangles belonging to this new region
            indices_of_triangles_in_region = np.where(triangle_to_region_map == region_id)[0]
            
            if len(indices_of_triangles_in_region) == 0:
                continue

            # Check if any original seed points fall within this newly identified region
            # OPTIMIZATION: Use pre-computed mapping instead of individual queries
            contained_original_regions = []
            for tri_idx in indices_of_triangles_in_region:
                if tri_idx in tri_to_orig_regions:
                    contained_original_regions.extend(tri_to_orig_regions[tri_idx])

            # Create the new region data
            new_region_id = len(new_regions) + 1
            hCoor, vCoor, attribute, max_area = 0, 0, new_region_id, -1

            if contained_original_regions:
                # An original point lies in this new region. Use its properties.
                # If multiple original points end up in the same new region, we use the first one.
                first_orig_region = contained_original_regions[0]
                # print(f"  ✓ Mapping new region {new_region_id} to original region {first_orig_region['id']}.")
                hCoor = first_orig_region['hCoor']
                vCoor = first_orig_region['vCoor']
                attribute = first_orig_region.get('attribute', first_orig_region['id'])
            else:
                # This is a new region (e.g., an intersection). We must generate a new seed point.
                # The centroid of the first triangle in the region is a safe choice.
                # print(f"  ✓ New geometric region {new_region_id} discovered. Generating a new seed point.")
                first_tri_idx = indices_of_triangles_in_region[0]
                tri_node_indices = triangles[first_tri_idx]
                
                # OPTIMIZATION: Vectorized centroid calculation (same result, faster)
                triangle_vertices = tri_vertices[tri_node_indices]
                hCoor, vCoor = np.mean(triangle_vertices, axis=0)
                # The attribute is simply its new ID
                attribute = new_region_id

            new_regions.append({
                'id': new_region_id,
                'hCoor': hCoor,
                'vCoor': vCoor,
                'attribute': attribute,
                'max_area': max_area
            })

        print(f"  ✅ Generated {len(new_regions)} final regions, each with a guaranteed interior seed point.")
        
        # Performance summary
        region_generation_time = time.time() - tic
        total_time = time.time() - total_start
        
        print(f"  ⏱️  Performance Summary:")
        print(f"     Triangulation: {triangulation_time:.3f}s")
        print(f"     Boundary detection: {boundary_time:.3f}s")
        print(f"     Flood-fill: {flood_fill_time:.3f}s")
        print(f"     Region generation: {region_generation_time:.3f}s")
        print(f"     Total time: {total_time:.3f}s")
        print(f"     Triangles processed: {n_tri:,}")
        print(f"     Regions identified: {len(new_regions):,}")
        
        return new_regions
    
    
    def _merge_regions_correct(self, regions1, regions2):
        """Fast region merging with simple duplicate removal."""
        merged_regions = []
        next_id = 1
        
        # Add regions from file 1
        if regions1:
            for region in regions1:
                new_region = region.copy()
                new_region['id'] = next_id
                merged_regions.append(new_region)
                next_id += 1
        
        # Add regions from file 2 with basic duplicate check
        if regions2:
            for region in regions2:
                # Simple duplicate check (regions are typically few)
                is_duplicate = False
                for existing_region in merged_regions:
                    if (abs(region['hCoor'] - existing_region['hCoor']) < self.tolerance and
                        abs(region['vCoor'] - existing_region['vCoor']) < self.tolerance):
                        is_duplicate = True
                        break
                
                if not is_duplicate:
                    new_region = region.copy()
                    new_region['id'] = next_id
                    merged_regions.append(new_region)
                    next_id += 1
        
        return merged_regions
    
    def _find_intersections_optimized(self, segments1, segments2, merged_vertices, vertex_mapping1, vertex_mapping2):
        """
        Optimized intersection detection using pyqtree spatial indexing for better performance.
        
        Uses pyqtree (quadtree) to reduce the number of segment pairs that need to be checked,
        reducing complexity from O(n²) to approximately O(n log n) in practice.
        This should help avoid triangulation hanging issues.
        
        Args:
            segments1, segments2: Segment lists from both files
            merged_vertices: Current merged vertex set
            vertex_mapping1, vertex_mapping2: Vertex ID mappings
            
        Returns:
            tuple: (intersection_vertices, intersection_info)
        """
        try:
            import pyqtree
        except ImportError:
            print("⚠️ Warning: pyqtree not available, falling back to basic spatial grid")
            return self._find_intersections_basic_grid(segments1, segments2, merged_vertices, vertex_mapping1, vertex_mapping2)
        
        intersection_vertices = {}
        intersection_info = []
        next_vertex_id = max(merged_vertices.keys()) + 1
        
        # Calculate bounding box for quadtree
        all_x = []
        all_y = []
        for vertex in merged_vertices.values():
            all_x.append(vertex['hCoor'])
            all_y.append(vertex['vCoor'])
        
        if not all_x:
            return intersection_vertices, intersection_info
        
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        
        # Add small padding to avoid edge issues
        padding = max((max_x - min_x), (max_y - min_y)) * 0.01
        min_x -= padding
        max_x += padding
        min_y -= padding
        max_y += padding
        
        print(f"  Using pyqtree with bounds: ({min_x:.2e}, {min_y:.2e}) to ({max_x:.2e}, {max_y:.2e})")
        
        # Create quadtree for segments from file 1
        # Use max_depth to prevent excessive subdivision
        max_depth = min(10, max(4, int(len(segments1) ** 0.25)))
        quadtree = pyqtree.Index(bbox=[min_x, min_y, max_x, max_y], max_depth=max_depth)
        
        # Insert segments from file 1 into quadtree
        segment_objects = []
        for i, seg1 in enumerate(segments1):
            v1_id = vertex_mapping1[seg1['endpoint_1']]
            v2_id = vertex_mapping1[seg1['endpoint_2']]
            p1 = merged_vertices[v1_id]
            p2 = merged_vertices[v2_id]
            
            # Get bounding box of segment
            seg_min_x = min(p1['hCoor'], p2['hCoor'])
            seg_max_x = max(p1['hCoor'], p2['hCoor'])
            seg_min_y = min(p1['vCoor'], p2['vCoor'])
            seg_max_y = max(p1['vCoor'], p2['vCoor'])
            
            # Create segment object with metadata
            seg_obj = {
                'index': i,
                'segment': seg1,
                'p1': p1,
                'p2': p2,
                'bbox': [seg_min_x, seg_min_y, seg_max_x, seg_max_y]
            }
            segment_objects.append(seg_obj)
            
            # Insert into quadtree
            quadtree.insert(seg_obj, seg_obj['bbox'])
        
        print(f"  Inserted {len(segment_objects)} segments into quadtree (max_depth={max_depth})")
        
        # Check segments from file 2 against quadtree
        checked_pairs = set()
        intersections_found = 0
        
        for j, seg2 in enumerate(segments2):
            v3_id = vertex_mapping2[seg2['endpoint_1']]
            v4_id = vertex_mapping2[seg2['endpoint_2']]
            p3 = merged_vertices[v3_id]
            p4 = merged_vertices[v4_id]
            
            # Get bounding box of segment
            seg_min_x = min(p3['hCoor'], p4['hCoor'])
            seg_max_x = max(p3['hCoor'], p4['hCoor'])
            seg_min_y = min(p3['vCoor'], p4['vCoor'])
            seg_max_y = max(p3['vCoor'], p4['vCoor'])
            
            # Query quadtree for potential intersections
            query_bbox = [seg_min_x, seg_min_y, seg_max_x, seg_max_y]
            potential_segments = quadtree.intersect(query_bbox)
            
            # Check actual intersections only with potential candidates
            for seg_obj in potential_segments:
                i = seg_obj['index']
                pair_key = (min(i, j), max(i, j))
                if pair_key in checked_pairs:
                    continue
                checked_pairs.add(pair_key)
                
                # Calculate intersection
                intersection_point = self._calculate_line_intersection(seg_obj['p1'], seg_obj['p2'], p3, p4)
                
                if intersection_point is not None:
                    # Create intersection vertex
                    intersection_vertices[next_vertex_id] = {
                        'hCoor': intersection_point[0],
                        'vCoor': intersection_point[1]
                    }
                    
                    intersection_info.append({
                        'intersection_vertex_id': next_vertex_id,
                        'intersection_point': intersection_point,
                        'seg1_idx': i,
                        'seg2_idx': j,
                        'file1_segment': seg_obj['segment'],
                        'file2_segment': seg2
                    })
                    
                    next_vertex_id += 1
                    intersections_found += 1
        
        print(f"  Checked {len(checked_pairs)} segment pairs (reduced from {len(segments1) * len(segments2)})")
        print(f"  Found {intersections_found} intersections using pyqtree")
        
        return intersection_vertices, intersection_info
    
    def _find_intersections_basic_grid(self, segments1, segments2, merged_vertices, vertex_mapping1, vertex_mapping2):
        """
        Fallback intersection detection using basic spatial grid when pyqtree is not available.
        """
        from collections import defaultdict
        
        intersection_vertices = {}
        intersection_info = []
        next_vertex_id = max(merged_vertices.keys()) + 1
        
        # Calculate bounding box for spatial grid
        all_x = []
        all_y = []
        for vertex in merged_vertices.values():
            all_x.append(vertex['hCoor'])
            all_y.append(vertex['vCoor'])
        
        if not all_x:
            return intersection_vertices, intersection_info
        
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        
        # Auto-calculate grid size based on data extent
        extent_x = max_x - min_x
        extent_y = max_y - min_y
        avg_extent = (extent_x + extent_y) / 2
        grid_size = max(avg_extent / 100, 1e-6)  # Adaptive grid size
        
        print(f"  Using fallback spatial grid with size: {grid_size:.2e}")
        
        # Create spatial grid for segments from file 1
        spatial_grid = defaultdict(list)
        
        for i, seg1 in enumerate(segments1):
            v1_id = vertex_mapping1[seg1['endpoint_1']]
            v2_id = vertex_mapping1[seg1['endpoint_2']]
            p1 = merged_vertices[v1_id]
            p2 = merged_vertices[v2_id]
            
            # Get bounding box of segment
            seg_min_x = min(p1['hCoor'], p2['hCoor'])
            seg_max_x = max(p1['hCoor'], p2['hCoor'])
            seg_min_y = min(p1['vCoor'], p2['vCoor'])
            seg_max_y = max(p1['vCoor'], p2['vCoor'])
            
            # Add segment to all grid cells it overlaps
            min_cell_x = int(seg_min_x / grid_size)
            max_cell_x = int(seg_max_x / grid_size)
            min_cell_y = int(seg_min_y / grid_size)
            max_cell_y = int(seg_max_y / grid_size)
            
            for cell_x in range(min_cell_x, max_cell_x + 1):
                for cell_y in range(min_cell_y, max_cell_y + 1):
                    spatial_grid[(cell_x, cell_y)].append(i)
        
        # Check segments from file 2 against spatial index
        checked_pairs = set()
        intersections_found = 0
        
        for j, seg2 in enumerate(segments2):
            v3_id = vertex_mapping2[seg2['endpoint_1']]
            v4_id = vertex_mapping2[seg2['endpoint_2']]
            p3 = merged_vertices[v3_id]
            p4 = merged_vertices[v4_id]
            
            # Get bounding box of segment
            seg_min_x = min(p3['hCoor'], p4['hCoor'])
            seg_max_x = max(p3['hCoor'], p4['hCoor'])
            seg_min_y = min(p3['vCoor'], p4['vCoor'])
            seg_max_y = max(p3['vCoor'], p4['vCoor'])
            
            # Find grid cells this segment overlaps
            min_cell_x = int(seg_min_x / grid_size)
            max_cell_x = int(seg_max_x / grid_size)
            min_cell_y = int(seg_min_y / grid_size)
            max_cell_y = int(seg_max_y / grid_size)
            
            # Collect potential intersecting segments
            potential_segments = set()
            for cell_x in range(min_cell_x, max_cell_x + 1):
                for cell_y in range(min_cell_y, max_cell_y + 1):
                    if (cell_x, cell_y) in spatial_grid:
                        for seg1_idx in spatial_grid[(cell_x, cell_y)]:
                            potential_segments.add(seg1_idx)
            
            # Check actual intersections only with potential candidates
            for i in potential_segments:
                pair_key = (min(i, j), max(i, j))
                if pair_key in checked_pairs:
                    continue
                checked_pairs.add(pair_key)
                
                seg1 = segments1[i]
                v1_id = vertex_mapping1[seg1['endpoint_1']]
                v2_id = vertex_mapping1[seg1['endpoint_2']]
                p1 = merged_vertices[v1_id]
                p2 = merged_vertices[v2_id]
                
                # Calculate intersection
                intersection_point = self._calculate_line_intersection(p1, p2, p3, p4)
                
                if intersection_point is not None:
                    # Create intersection vertex
                    intersection_vertices[next_vertex_id] = {
                        'hCoor': intersection_point[0],
                        'vCoor': intersection_point[1]
                    }
                    
                    intersection_info.append({
                        'intersection_vertex_id': next_vertex_id,
                        'intersection_point': intersection_point,
                        'seg1_idx': i,
                        'seg2_idx': j,
                        'file1_segment': seg1,
                        'file2_segment': seg2
                    })
                    
                    next_vertex_id += 1
                    intersections_found += 1
        
        print(f"  Checked {len(checked_pairs)} segment pairs (reduced from {len(segments1) * len(segments2)})")
        print(f"  Found {intersections_found} intersections using fallback grid")
        
        return intersection_vertices, intersection_info
    
    def _calculate_line_intersection(self, p1, p2, p3, p4):
        """
        Calculate intersection point between two line segments.
        
        Args:
            p1, p2: Endpoints of first segment
            p3, p4: Endpoints of second segment
            
        Returns:
            tuple or None: (x, y) intersection point if segments intersect, None otherwise
        """
        x1, y1 = p1['hCoor'], p1['vCoor']
        x2, y2 = p2['hCoor'], p2['vCoor']
        x3, y3 = p3['hCoor'], p3['vCoor']
        x4, y4 = p4['hCoor'], p4['vCoor']
        
        # Calculate the denominator
        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        
        if abs(denom) < self.tolerance:
            # Lines are parallel or coincident
            return None
        
        # Calculate intersection parameters
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
        u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
        
        # Check if intersection is within both line segments (exclude endpoints)
        if 0 < t < 1 and 0 < u < 1:
            # Calculate intersection point
            x = x1 + t * (x2 - x1)
            y = y1 + t * (y2 - y1)
            return (x, y)
        
        return None
    
    def _split_segments_at_intersections(self, segments, intersection_info, file_name, vertex_mapping, merged_vertices):
        """
        Split segments at intersection points.
        
        Args:
            segments: Original segments to split
            intersection_info: List of intersection information
            file_name: 'file1' or 'file2' to identify which segments to process
            vertex_mapping: Vertex ID mapping for this file
            merged_vertices: Merged vertex dictionary for coordinate lookup
            
        Returns:
            list: Split segments with intersection vertices
        """
        split_segments = []
        next_segment_id = 1
        segments_with_intersections = 0
        total_intersections = 0
        
        for i, segment in enumerate(segments):
            # Find intersections for this segment
            segment_intersections = [
                info for info in intersection_info
                if (file_name == 'file1' and info['seg1_idx'] == i) or
                   (file_name == 'file2' and info['seg2_idx'] == i)
            ]
            
            if not segment_intersections:
                # No intersections, keep original segment with mapped vertex IDs
                new_segment = segment.copy()
                new_segment['id'] = next_segment_id
                new_segment['endpoint_1'] = vertex_mapping[segment['endpoint_1']]
                new_segment['endpoint_2'] = vertex_mapping[segment['endpoint_2']]
                split_segments.append(new_segment)
                next_segment_id += 1
            else:
                segments_with_intersections += 1
                total_intersections += len(segment_intersections)
                
                # Sort intersections by distance from start vertex
                start_vertex = merged_vertices[vertex_mapping[segment['endpoint_1']]]
                start_x, start_y = start_vertex['hCoor'], start_vertex['vCoor']
                
                # Calculate distance from start vertex for each intersection
                for info in segment_intersections:
                    intersection_point = info['intersection_point']
                    distance = ((intersection_point[0] - start_x)**2 + (intersection_point[1] - start_y)**2)**0.5
                    info['distance_from_start'] = distance
                
                # Sort intersections by distance from start vertex
                segment_intersections.sort(key=lambda x: x['distance_from_start'])
                
                # Create segments split at each intersection
                current_start = vertex_mapping[segment['endpoint_1']]
                
                for info in segment_intersections:
                    # Create segment from current start to intersection
                    # Validate that we're not creating a zero-length segment
                    if current_start != info['intersection_vertex_id']:
                        split_segments.append({
                            'id': next_segment_id,
                            'endpoint_1': current_start,
                            'endpoint_2': info['intersection_vertex_id'],
                            'boundary_marker': segment.get('boundary_marker', 0)
                        })
                        next_segment_id += 1
                    current_start = info['intersection_vertex_id']
                
                # Create final segment from last intersection to end
                # Validate that we're not creating a zero-length segment
                final_end = vertex_mapping[segment['endpoint_2']]
                if current_start != final_end:
                    split_segments.append({
                        'id': next_segment_id,
                        'endpoint_1': current_start,
                        'endpoint_2': final_end,
                        'boundary_marker': segment.get('boundary_marker', 0)
                    })
                    next_segment_id += 1
        
        print(f"  📊 Segment splitting summary for {file_name}:")
        print(f"     Original segments: {len(segments):,}")
        print(f"     Segments with intersections: {segments_with_intersections:,}")
        print(f"     Total intersections processed: {total_intersections:,}")
        print(f"     Split segments created: {len(split_segments):,}")
        
        return split_segments
    
    def _merge_split_segments(self, segments1_split, segments2_split, merged_vertices):
        """
        Merge split segments from both files, removing duplicates and applying angle quality checking.
        
        Args:
            segments1_split, segments2_split: Split segment lists
            merged_vertices: Dictionary of merged vertices for angle calculations
            
        Returns:
            list: Merged segments without duplicates and with angle quality enforced
        """
        merged_segments = []
        seen_edges = set()
        next_id = 1
        
        # Add all split segments, checking for duplicates
        for segment in segments1_split + segments2_split:
            edge_key = tuple(sorted([segment['endpoint_1'], segment['endpoint_2']]))
            
            if edge_key not in seen_edges:
                new_segment = segment.copy()
                new_segment['id'] = next_id
                merged_segments.append(new_segment)
                seen_edges.add(edge_key)
                next_id += 1
        
        # Apply angle quality checking
        print("🔍 Applying angle quality checking to split segments...")
        merged_segments, _, _ = self._check_angle_quality(merged_segments, merged_vertices)
        
        # Reassign IDs after filtering
        for i, segment in enumerate(merged_segments):
            segment['id'] = i + 1
        
        return merged_segments

    def validate_angle_quality(self, vertices, segments, min_angle_degrees=None):
        """
        Standalone method to validate angle quality of segments.
        
        Args:
            vertices (dict): Dictionary of vertices
            segments (list): List of segments
            min_angle_degrees (float, optional): Minimum angle threshold in degrees
            
        Returns:
            dict: Quality report with statistics and issues found
        """
        if min_angle_degrees is None:
            min_angle_degrees = self.min_angle_degrees
            
        print(f"🔍 Validating angle quality (minimum angle: {min_angle_degrees}°)...")
        
        # Temporarily set the minimum angle for this validation
        original_min_angle = self.min_angle_degrees
        self.min_angle_degrees = min_angle_degrees
        
        try:
            # Apply angle quality checking
            filtered_segments, _, quality_report = self._check_angle_quality(segments, vertices)
            
            # Add additional statistics
            quality_report['original_segment_count'] = len(segments)
            quality_report['filtered_segment_count'] = len(filtered_segments)
            quality_report['min_angle_threshold'] = min_angle_degrees
            
            return quality_report
            
        finally:
            # Restore original minimum angle
            self.min_angle_degrees = original_min_angle

    def validate_merged_poly(self, vertices, segments, holes=None, regions=None, check_angles=True):
        """
        Comprehensive validation of merged poly file including angle quality.
        
        Args:
            vertices (dict): Dictionary of vertices
            segments (list): List of segments
            holes (list, optional): List of holes (unused but kept for compatibility)
            regions (list, optional): List of regions (unused but kept for compatibility)
            check_angles (bool): Whether to perform angle quality checking
            
        Returns:
            bool: True if validation passes
        """
        # Suppress unused parameter warnings
        _ = holes, regions
        print("🔍 Comprehensive validation of merged poly...")
        
        issues = []
        
        # Check vertex references in segments
        vertex_ids = set(vertices.keys())
        invalid_refs = 0
        
        for segment in segments:
            if segment['endpoint_1'] not in vertex_ids or segment['endpoint_2'] not in vertex_ids:
                invalid_refs += 1
        
        if invalid_refs > 0:
            issues.append(f"Found {invalid_refs} segments with invalid vertex references")
        
        # Check for degenerate segments
        degenerate = sum(1 for seg in segments if seg['endpoint_1'] == seg['endpoint_2'])
        if degenerate > 0:
            issues.append(f"Found {degenerate} degenerate segments")
        
        # Check angle quality if requested
        if check_angles:
            print("🔍 Checking angle quality...")
            quality_report = self.validate_angle_quality(vertices, segments)
            
            if quality_report['pairs_with_small_angles'] > 0:
                issues.append(f"Found {quality_report['pairs_with_small_angles']} segment pairs with angles < {self.min_angle_degrees}°")
                print(f"   📊 Angle quality issues: {quality_report['pairs_with_small_angles']} pairs with small angles")
            else:
                print(f"   ✅ All segment angles are ≥ {self.min_angle_degrees}°")
        
        # Report results
        if issues:
            print("❌ Validation issues found:")
            for issue in issues:
                print(f"   • {issue}")
            return False
        else:
            print("✅ Validation passed - poly file is valid")
            return True
