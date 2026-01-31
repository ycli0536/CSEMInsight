# Specification: Implement Core Data Masking and Editing Infrastructure

## Overview
This track establishes the foundational infrastructure required to enable in-app data editing within EMInsight. It focuses on creating a "non-destructive" editing environment where users can visually mask noisy data points, manage these edits through a session-based state, and eventually export the results.

## Goals
- **Editor Mode UI:** Implement a dedicated visual mode for editing that adapts the existing layout.
- **Graphical Masking Logic:** Enable users to select and toggle the "masked" state of data points on plots.
- **Session-Based Edit State:** Create a robust state management system (using Zustand) to track edits without modifying original files.
- **Backend Sync:** Extend the Flask backend to handle and persist (temporarily) these edit states.

## Technical Requirements
- **Frontend (React/TypeScript):**
    - Integrate with existing ECharts/uPlot components to support selection gestures.
    - Update `zustand` stores to include `maskedPoints` collections.
    - Implement Undo/Redo logic for masking actions.
- **Backend (Python/Flask):**
    - API endpoints to receive and store mask configurations.
    - Update data parsers/processors to apply masks before returning data to the UI.

## User Stories
- **As a Geophysicist**, I want to drag a selection box around noisy data points so I can quickly exclude them from my analysis.
- **As a Data Analyst**, I want to see which points are masked on my current plot so I can verify my cleaning process.
- **As a Field Engineer**, I want to be able to undo an accidental mask action so I don't lose my progress.
