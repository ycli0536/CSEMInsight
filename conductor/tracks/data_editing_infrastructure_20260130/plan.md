# Implementation Plan: Implement Core Data Masking and Editing Infrastructure

## Phase 1: Foundation & State Management
- [ ] **Task: Define Edit State in Zustand Store**
    - [ ] Create a new store (or extend `comparisonStore`) to track `maskedIndices` per dataset.
    - [ ] Implement actions: `maskPoints(indices)`, `unmaskPoints(indices)`, `clearMasks()`.
    - [ ] Write unit tests for store actions.
- [ ] **Task: Implement Undo/Redo for Masking Actions**
    - [ ] Integrate a history middleware or manual stack for the editing store.
    - [ ] Write tests to verify state restoration after multiple actions.
- [ ] **Task: Conductor - User Manual Verification 'Phase 1: Foundation & State Management' (Protocol in workflow.md)**

## Phase 2: Editor UI & Interaction
- [ ] **Task: Create "Editor Mode" Layout Toggle**
    - [ ] Add a global state for `isEditorModeActive`.
    - [ ] Implement UI elements (buttons/icons) to switch modes.
    - [ ] Update plot components to visually differentiate "Editor Mode" (e.g., change cursor, add selection tools).
- [ ] **Task: Implement Graphical Selection (ECharts/uPlot)**
    - [ ] Configure plot components to support box selection or "brushing".
    - [ ] Connect selection events to the Zustand `maskPoints` action.
    - [ ] Add visual markers (e.g., cross-out or transparency) for masked points on the chart.
- [ ] **Task: Conductor - User Manual Verification 'Phase 2: Editor UI & Interaction' (Protocol in workflow.md)**

## Phase 3: Backend Integration & Persistence
- [ ] **Task: Backend API for Edit Sessions**
    - [ ] Create Flask endpoints to `POST /api/edit/mask` and `GET /api/edit/status`.
    - [ ] Implement server-side storage (memory or temporary file) for the current session's mask state.
    - [ ] Write Python tests for the new endpoints.
- [ ] **Task: Apply Masks in Data Processing Pipeline**
    - [ ] Update `csem_datafile_parser.py` or `comparison_engine.py` to filter/flag data based on the active mask state.
    - [ ] Verify masked data is correctly handled in statistical calculations.
- [ ] **Task: Conductor - User Manual Verification 'Phase 3: Backend Integration & Persistence' (Protocol in workflow.md)**
