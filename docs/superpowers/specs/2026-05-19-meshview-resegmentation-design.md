# MeshView Resegmentation Design

**Date:** 2026-05-19

**Goal**

Add a MeshView workflow that converts a detailed inversion model into a
simplified MARE2DEM forward-model pair. The feature should let users preview a
rho-level resegmentation inside MeshView, tune simplification controls, and
export a new `.poly` plus `.resistivity` model that MARE2DEM can use directly.

This is a model resegmentation feature, not a triangle-count-only mesh
decimation feature. The output is a segment-bounded region model with region
seed points and a matching fixed-parameter resistivity table.

**Confirmed Scope**

Inputs:

- source `.poly`
- source `.resistivity`
- rectangular ROI in source-file coordinates:
  - `y_min`
  - `y_max`
  - `z_min`
  - `z_max`
- target rho levels, supplied explicitly by the user
- boundary simplification tolerance
- minimum region area
- active-region rule: source triangles participate only when their centroid is
  inside the ROI and their source region has `Param > 0`

Outputs:

- a MeshView preview layer for the simplified model
- a new `.poly`
- a new `.resistivity`

Export requirements:

- Output `.poly` keeps the source file's original coordinate units.
- Output `.resistivity` is a forward-model template.
- Every exported region has `Param = 0`.
- Every exported region uses `Lower = 0`, `Upper = 0`, `Prej = 0`, and
  `Weight = 0`.
- Disconnected components with the same rho are exported as separate regions.

Preserved areas:

- ROI exterior remains unchanged.
- ROI interior triangles whose source region does not satisfy `Param > 0`
  remain unchanged.
- Air, seawater, padding, and other fixed areas are protected by the same
  `Param > 0` active-region rule.

**Reference Model Notes**

The example forward model uses a `.poly` file with:

- 2012 vertices
- 2020 segments
- 0 holes
- 10 region seed points
- segment boundary markers set to `1`

Its matching `.resistivity` file has 10 rows. The region ids in the `.poly`
region seed section match the ids in the `.resistivity` table, and every row has
`Param = 0`. This is the target output shape for resegmented forward models.

**Recommended Approach**

Use a hybrid triangle-classification and polygon-boundary approach.

Do not use contour curves as the primary source of truth in phase 1. Direct
contouring can create visually smooth isolines, but it does not by itself create
a valid MARE2DEM planar straight-line graph. MARE2DEM export requires closed
segments, node-split intersections, no dangling contour fragments, valid region
seed points, and a one-to-one mapping between exported region ids and
resistivity rows.

Instead:

1. Use the existing constrained triangulation to preserve `.poly` topology.
2. Classify eligible triangles by nearest target rho level in log space.
3. Merge same-level neighboring triangles into connected components.
4. Merge small components into adjacent components using rho closeness first and
   shared boundary length as the tie-breaker.
5. Extract component boundaries.
6. Simplify boundaries with the user-specified tolerance.
7. Generate a valid `.poly` line network and one seed point per final region.
8. Generate a fixed-parameter `.resistivity` table.

This keeps the result tied to the source model topology while still producing a
simplified level-based model suitable for forward runs.

**Backend Data Flow**

The backend should own resegmentation and export because it already owns
MARE2DEM parsing, constrained triangulation, triangle-to-region mapping, and
file serialization.

Workflow:

1. Read the source `.poly` in its native units for export purposes.
2. Build a constrained triangulation.
3. Map triangles to source regions.
4. Parse source `.resistivity` rows into region rho and `Param` metadata.
5. Compute each triangle centroid and area.
6. Build the active mask:
   - centroid is inside ROI
   - source region has `Param > 0`
   - rho is finite and positive
7. Assign active triangles to the nearest target rho level using log-space
   distance.
8. Preserve inactive triangles as fixed source regions.
9. Build connected components from same assigned rho level and shared triangle
   edges.
10. Merge components below `minimum_region_area` into adjacent components:
    - choose the adjacent component with nearest rho level
    - if tied, choose the one with longest shared boundary
11. Extract final region boundaries.
12. Apply boundary simplification tolerance.
13. Validate topology before returning preview or export:
    - no empty region boundaries
    - no dangling segments
    - region count equals seed count
    - resistivity rows match region ids
14. Serialize preview stats and optional preview mesh.

Phase 1 can prioritize source models with no holes or holes outside the ROI. The
example forward model has no holes. If holes are present in active geometry, the
backend should return a clear warning or error rather than silently exporting an
invalid model.

**Rho Level Classification**

Target rho levels are explicit user input. Each active triangle is assigned to
the nearest level by log-space distance:

```text
level = argmin(abs(log10(triangle_rho) - log10(target_level)))
```

All target levels must be finite and greater than zero.

**Small Component Merge**

Each connected component is a candidate exported region. When a component area
is below `minimum_region_area`, merge it into an adjacent component only.

Selection:

1. Prefer the adjacent component whose rho level is closest in log space.
2. If multiple adjacent components are equally close, choose the one with the
   longest shared boundary.

This avoids nonlocal merges and reduces small artifacts without merging into an
electrically unrelated area purely because the boundary is long.

**Frontend Interaction**

Add a focused `Resegment` panel to MeshView rather than putting this workflow in
the existing top toolbar.

Controls:

- `Y min`
- `Y max`
- `Z min`
- `Z max`
- target rho levels as comma-separated numeric input
- `Only free parameters`, default on
- boundary simplification tolerance
- minimum region area
- `Preview`
- `Export both`

Preview should show:

- source triangle count
- active triangle count
- output region count
- output vertex count
- output segment count
- small component merge count
- warnings

MeshView should be able to toggle between original and resegmented views, or
show resegmented region boundaries over the original.

Export file names default to:

- `<source-stem>.resegmented.poly`
- `<source-stem>.resegmented.resistivity`

**API Design**

Add:

- `POST /api/preview-triangle-resegmentation`
- `POST /api/export-triangle-resegmentation`

Both endpoints accept multipart form data:

- `poly_file`
- `resistivity_file`
- `parameters` JSON

Preview returns JSON:

- preview mesh or region boundary payload
- region rho list
- stats
- warnings

Export can return JSON with two text payloads in phase 1:

- `polyFileName`
- `polyText`
- `resistivityFileName`
- `resistivityText`
- `stats`
- `warnings`

A later version can return a zip if needed.

**Module Boundaries**

Create a focused backend module:

`backend/triangle_model_resegmentation.py`

Responsibilities:

- parse and validate resegmentation parameters
- parse resistivity rows needed for rho and `Param`
- compute triangle centroid and area
- build active mask
- classify active triangles by target rho levels
- build connected components
- merge small components
- extract and simplify boundaries
- generate region seed points
- build `.poly` text
- build `.resistivity` text
- serialize preview payloads

Keep `backend/main.py` limited to request parsing and response handling.

Frontend additions:

- `frontend/src/components/custom/TriangleResegmentPanel.tsx`
- `frontend/src/services/triangleResegmentation.ts`
- new resegmentation types in `frontend/src/types/triangleModel.ts`

`TriangleModelWindow.tsx` should own panel visibility and preview state, but the
new panel should own parameter input UI.

The imperative Three.js viewer should only render the supplied preview overlay;
it should not know how resegmentation works.

**Validation and Error Handling**

Frontend validation:

- ROI min/max must be ordered.
- rho levels must contain at least one finite positive value.
- tolerance must be non-negative.
- minimum area must be non-negative.

Backend validation:

- `.poly` and `.resistivity` are both required.
- source `.resistivity` must expose rho values.
- when `Only free parameters` is enabled, `Param` must be readable.
- active triangle count must be greater than zero.
- topology validation must pass before export.

Warnings:

- no active triangles in ROI
- holes are present and overlap active geometry
- some active triangles have missing or invalid rho
- small components were merged
- boundary simplification removed very small features

**Testing Strategy**

Backend unit tests:

- parse parameters and reject invalid ROI/rho levels
- parse region rho and `Param` values from `.resistivity`
- compute triangle centroid and area
- apply ROI centroid mask
- apply `Param > 0` filter
- classify rho to nearest target level in log space
- split disconnected same-rho components into separate regions
- merge small components using rho closeness and shared boundary tie-break
- build fixed-parameter `.resistivity` text
- preserve source coordinate units in exported `.poly`
- reject active holes in phase 1 with a clear error

Backend API tests:

- preview endpoint returns stats and warnings
- export endpoint returns matching `.poly` and `.resistivity` region counts
- exported `.resistivity` rows all have `Param = 0`

Frontend tests:

- panel validates ROI inputs
- panel validates rho levels
- Preview sends the expected multipart payload
- preview stats render after success
- warnings render after success
- export creates downloads for both files
- API errors show actionable messages

**Non-Goals**

- pure contour interpolation as the default phase 1 algorithm
- arbitrary smoothing that can cross fixed-region or ROI boundaries
- supporting complex holes inside active geometry in phase 1
- solving every possible invalid `.poly` topology case automatically
- changing the existing lasso region-editing behavior
