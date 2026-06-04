# MeshView Resegmentation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a MeshView resegmentation workflow that previews and exports simplified MARE2DEM forward-model `.poly` and `.resistivity` files from a detailed inversion model.

**Architecture:** The backend owns resegmentation because it already parses MARE2DEM files and builds constrained triangulations. The frontend owns parameter entry, preview state, and download behavior, while the Three.js viewer renders a supplied preview mesh without knowing the resegmentation algorithm.

**Tech Stack:** Flask, pytest, Python, NumPy, `triangle3`, React, TypeScript, axios, Vitest, Three.js.

---

## Chunk 1: Backend Pure Resegmentation Core

### Task 1: Parameter and Resistivity Metadata Parsing

**Files:**
- Create: `backend/triangle_model_resegmentation.py`
- Test: `backend/tests/test_triangle_model_resegmentation.py`

- [ ] **Step 1: Write failing tests for parameter validation**

Cover:
- valid ROI and rho levels parse into typed data
- reversed ROI limits fail
- non-positive rho levels fail
- negative simplification tolerance fails
- negative minimum area fails

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k parameters -v`
Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement parameter parsing**

Add:
- `ResegmentationParameters` dataclass
- `ResegmentationError`
- `parse_resegmentation_parameters(payload)`

Keep keys:
- `roi.yMin`
- `roi.yMax`
- `roi.zMin`
- `roi.zMax`
- `rhoLevels`
- `onlyFreeParameters`
- `boundaryTolerance`
- `minimumRegionArea`

- [ ] **Step 3: Write failing tests for resistivity row parsing**

Cover:
- implicit MARE2DEM `!# Rho Param ...` table where the first column is the region id
- explicit `!# Region Rho Param ...` table
- missing `Param` is rejected when `onlyFreeParameters` is true
- valid rows return `{region_id, rho, param}`

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k resistivity -v`
Expected: FAIL until parsing helpers exist.

- [ ] **Step 4: Implement resistivity row parsing**

Add:
- `RegionResistivityMetadata`
- `build_region_metadata_lookup(parsed_resistivity, require_param)`

Use parsed pandas tables from `ResistivityFileParser.parse_resistivity_file(..., rho_parse=True)`.

- [ ] **Step 5: Verify Task 1**

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k "parameters or resistivity" -v`
Expected: PASS.

### Task 2: Triangle Classification and Connected Components

**Files:**
- Modify: `backend/triangle_model_resegmentation.py`
- Test: `backend/tests/test_triangle_model_resegmentation.py`

- [ ] **Step 1: Write failing tests for triangle geometry helpers**

Cover:
- triangle centroid
- triangle area
- ROI centroid inclusion
- log-space nearest rho level assignment

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k "triangle or rho_level" -v`
Expected: FAIL until helpers exist.

- [ ] **Step 2: Implement geometry and classification helpers**

Add:
- `compute_triangle_centroid(points, triangle)`
- `compute_triangle_area(points, triangle)`
- `is_point_in_roi(point, roi)`
- `assign_nearest_rho_level(rho, levels)`
- `build_triangle_assignments(...)`

Assignment rules:
- active if centroid is in ROI
- active if region metadata has finite positive rho
- active if `onlyFreeParameters` is false or `Param > 0`
- active triangles get new rho-level labels
- inactive triangles keep source-region labels and rho

- [ ] **Step 3: Write failing tests for connected components**

Cover:
- same rho but disconnected components produce separate component ids
- neighboring same-rho triangles merge into one component
- inactive source regions remain separate from active components

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k components -v`
Expected: FAIL until component builder exists.

- [ ] **Step 4: Implement connected components**

Add:
- edge-to-triangle adjacency
- `build_connected_components(points, triangles, assignments)`

Components must include:
- component id
- triangle indices
- rho
- source kind (`resegmented` or `preserved`)
- area

- [ ] **Step 5: Verify Task 2**

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k "triangle or rho_level or components" -v`
Expected: PASS.

### Task 3: Small Component Merge and Preview Mesh

**Files:**
- Modify: `backend/triangle_model_resegmentation.py`
- Test: `backend/tests/test_triangle_model_resegmentation.py`

- [ ] **Step 1: Write failing tests for small component merge**

Cover:
- small component merges only into adjacent components
- nearest log-rho neighbor wins
- shared boundary length breaks ties
- components with no adjacent candidates remain and emit a warning

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k merge -v`
Expected: FAIL until merge helper exists.

- [ ] **Step 2: Implement small component merge**

Add:
- `compute_component_adjacency(points, triangles, component_by_triangle)`
- `merge_small_components(...)`

Track:
- `merged_component_count`
- warnings

- [ ] **Step 3: Write failing tests for preview serialization**

Cover:
- preview payload includes vertices, triangles, triangleRegionIds, triangleResistivityValues
- stats include active triangle count and output region count
- warning list is returned

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k preview -v`
Expected: FAIL until serializer exists.

- [ ] **Step 4: Implement preview serialization**

Add:
- `build_resegmentation_preview(...)`
- `serialize_preview_mesh(...)`
- stats builder

Preview mesh can use the triangulation vertices and triangles directly, with final component ids as preview region ids.

- [ ] **Step 5: Verify Task 3**

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k "merge or preview" -v`
Expected: PASS.

## Chunk 2: Backend Export Text Generation and API

### Task 4: `.resistivity` and `.poly` Export Text

**Files:**
- Modify: `backend/triangle_model_resegmentation.py`
- Test: `backend/tests/test_triangle_model_resegmentation.py`

- [ ] **Step 1: Write failing tests for fixed forward `.resistivity` export**

Cover:
- region count matches final component count
- every row has `Param=0 Lower=0 Upper=0 Prej=0 Weight=0`
- rho values match final component rho
- model file metadata points to the new `.poly` file name

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k resistivity_export -v`
Expected: FAIL until exporter exists.

- [ ] **Step 2: Implement `.resistivity` export text**

Add:
- `build_forward_resistivity_text(model_file_name, regions)`

Use a simple MARE2DEM 1.1-compatible header and table.

- [ ] **Step 3: Write failing tests for `.poly` export**

Cover:
- vertices and segments are emitted in source units
- boundary segments are only final-region boundaries, not every triangle edge
- region seed count matches final region count
- all region attributes equal their exported region ids
- simple two-region synthetic mesh exports closed boundary segments

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k poly_export -v`
Expected: FAIL until `.poly` export exists.

- [ ] **Step 4: Implement `.poly` export text**

Add:
- boundary edge extraction from final triangle labels
- unique exported vertex indexing from boundary-edge endpoints
- segment serialization with marker `1`
- region seed point from one triangle centroid per final component
- inherited holes only when there are no active holes; otherwise return a warning/error

Phase 1 boundary tolerance can simplify boundary chains conservatively. If simplification would break topology, fall back to unsimplified shared boundary chains and return a warning.

- [ ] **Step 5: Verify Task 4**

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py -k "resistivity_export or poly_export" -v`
Expected: PASS.

### Task 5: Flask API Endpoints

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_triangle_model_resegmentation_api.py`

- [ ] **Step 1: Write failing API tests**

Cover:
- preview endpoint returns JSON stats and preview mesh
- export endpoint returns JSON `polyText` and `resistivityText`
- missing files return 400
- invalid parameters return 400 with `error`

Run: `cd backend && pytest tests/test_triangle_model_resegmentation_api.py -v`
Expected: FAIL because endpoints do not exist.

- [ ] **Step 2: Implement request handling**

Add endpoints:
- `POST /api/preview-triangle-resegmentation`
- `POST /api/export-triangle-resegmentation`

Both accept:
- `poly_file`
- `resistivity_file`
- `parameters`

Use `MARE2DEMPolyParser.read_poly_file(path, unit_scale_factor=1)` so export stays in source units.

- [ ] **Step 3: Verify Task 5**

Run: `cd backend && pytest tests/test_triangle_model_resegmentation_api.py -v`
Expected: PASS.

## Chunk 3: Frontend Types, Service, and Panel

### Task 6: Frontend Reegmentation Types and API Service

**Files:**
- Modify: `frontend/src/types/triangleModel.ts`
- Create: `frontend/src/services/triangleResegmentation.ts`
- Test: `frontend/src/services/triangleResegmentation.test.ts`

- [ ] **Step 1: Write failing service tests**

Cover:
- ROI/rho-level payload shape
- preview request uses multipart form data
- export request uses multipart form data
- download file names are derived from source `.poly`

Run: `cd frontend && bun run test src/services/triangleResegmentation.test.ts`
Expected: FAIL until service exists.

- [ ] **Step 2: Implement types and service**

Add:
- `TriangleResegmentationParameters`
- `TriangleResegmentationPreviewResponse`
- `TriangleResegmentationExportResponse`
- `previewTriangleResegmentation(...)`
- `exportTriangleResegmentation(...)`

- [ ] **Step 3: Verify Task 6**

Run: `cd frontend && bun run test src/services/triangleResegmentation.test.ts`
Expected: PASS.

### Task 7: Resegment Panel UI

**Files:**
- Create: `frontend/src/components/custom/TriangleResegmentPanel.tsx`
- Test: `frontend/src/components/custom/TriangleResegmentPanel.test.tsx`

- [ ] **Step 1: Write failing panel tests**

Cover:
- ROI validation disables Preview when min/max are invalid
- invalid rho levels show an error
- valid form calls `onPreview`
- export button is disabled until preview/export payload exists
- warnings and stats render

Run: `cd frontend && bun run test src/components/custom/TriangleResegmentPanel.test.tsx`
Expected: FAIL until panel exists.

- [ ] **Step 2: Implement panel**

Use existing UI primitives:
- `Button`
- native numeric inputs following current `TriangleModelWindow` style

Keep the panel dense and operational, not a marketing-style card.

- [ ] **Step 3: Verify Task 7**

Run: `cd frontend && bun run test src/components/custom/TriangleResegmentPanel.test.tsx`
Expected: PASS.

## Chunk 4: MeshView Integration and Viewer Preview

### Task 8: Integrate Panel into `TriangleModelWindow`

**Files:**
- Modify: `frontend/src/components/custom/TriangleModelWindow.tsx`
- Test: `frontend/src/components/custom/TriangleModelWindow.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Cover:
- panel renders after a `.poly + .resistivity` model is loaded
- Preview posts original file objects and current parameters
- successful preview updates viewer data or overlay state
- export success triggers two text downloads
- API error renders status text

Run: `cd frontend && bun run test src/components/custom/TriangleModelWindow.test.tsx`
Expected: FAIL until integration exists.

- [ ] **Step 2: Implement integration state**

Add state:
- preview response
- preview/export loading flags
- resegmentation status

Keep existing lasso editing state intact.

- [ ] **Step 3: Add download behavior**

Create two `Blob` downloads from export JSON:
- `.poly`
- `.resistivity`

- [ ] **Step 4: Verify Task 8**

Run: `cd frontend && bun run test src/components/custom/TriangleModelWindow.test.tsx`
Expected: PASS.

### Task 9: Preview Rendering

**Files:**
- Modify: `frontend/src/services/triangleModelMesh.ts`
- Modify: `frontend/src/services/triangleModelViewer.ts`
- Test: `frontend/src/services/triangleModelMesh.test.ts`
- Test: `frontend/src/services/triangleModelViewer.test.ts`

- [ ] **Step 1: Write failing preview mesh tests**

Cover:
- preview constrained mesh converts to `TriangleMesh`
- preview mesh source stays compatible with existing scene buffers

Run: `cd frontend && bun run test src/services/triangleModelMesh.test.ts src/services/triangleModelViewer.test.ts`
Expected: FAIL until preview conversion is wired.

- [ ] **Step 2: Implement preview mesh path**

Prefer reusing existing `TriangleConstrainedMesh` shape for preview. Do not add viewer algorithm knowledge.

- [ ] **Step 3: Verify Task 9**

Run: `cd frontend && bun run test src/services/triangleModelMesh.test.ts src/services/triangleModelViewer.test.ts`
Expected: PASS.

## Chunk 5: End-to-End Verification

### Task 10: Backend and Frontend Verification

**Files:**
- Modify as needed based on failures

- [ ] **Step 1: Run backend resegmentation tests**

Run: `cd backend && pytest tests/test_triangle_model_resegmentation.py tests/test_triangle_model_resegmentation_api.py -v`
Expected: PASS.

- [ ] **Step 2: Run existing backend triangle-model tests**

Run: `cd backend && pytest tests/test_api.py tests/test_triangle_resistivity_export.py -v`
Expected: PASS.

- [ ] **Step 3: Run frontend targeted tests**

Run: `cd frontend && bun run test src/services/triangleResegmentation.test.ts src/components/custom/TriangleResegmentPanel.test.tsx src/components/custom/TriangleModelWindow.test.tsx src/services/triangleModelMesh.test.ts`
Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run: `cd frontend && bun run build`
Expected: exit code 0.

- [ ] **Step 5: Manual API smoke with example model if local paths remain available**

Use:
- `/Users/yli3354/GaTech Dropbox/Yinchu Li/EMAGE/Line3/Synthetic tests/Model/fwd.poly`
- `/Users/yli3354/GaTech Dropbox/Yinchu Li/EMAGE/Line3/Synthetic tests/Model/fwd.0.resistivity`

Expected:
- upload still parses
- resegmentation returns a clear no-active-triangles result for this already-fixed forward model when `Only free parameters` is on
- no coordinate unit scaling appears in generated export text

- [ ] **Step 6: Check git diff**

Run: `git status --short`
Expected: only files touched for this feature plus pre-existing user changes.
