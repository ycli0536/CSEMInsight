# Product Definition

## Initial Concept
**EMInsight** is a marine geophysical controlled-source electromagnetic (CSEM) data analysis toolkit. The next phase of development focuses on transforming it from a purely diagnostic and visualization tool into an active data processing assistant by integrating in-app data editing capabilities.

## Product Goals
- **Enable In-App Data Editing:** Implement functionality to allow users to modify and clean dataset directly within the application, moving beyond read-only visualization.
- **Maintain Data Integrity:** Ensure that the original raw data remains untouched by default, prioritizing safe, non-destructive editing workflows.
- **Support Flexible Export:** Provide options for users to export their modified datasets for use in downstream processing or inversion software.

## Target Audience
- **Geophysicists & Data Analysts:** For performing efficient quality control (QC) and noise removal on large datasets.
- **Academic Researchers:** For preparing high-quality datasets for inversion studies and publication.
- **Field Engineers:** For rapid in-field data review and preliminary cleaning during acquisition.

## Key Features
- **Dedicated Editor View:** A specialized "Editor Mode" interface designed specifically for data cleaning tasks, separating editing operations from standard exploration to prevent accidental changes.
- **Graphical Data Masking:** Interactive tools to select and mask/unmask data points visually, allowing for intuitive noise removal.
- **Undo/Redo System:** A robust history mechanism to allow users to safely experiment with edits and revert changes if necessary.
- **Non-Destructive Workflow:** All edits are stored separately (e.g., in a session state or sidecar file) without altering the original source files.
- **Export Modified Data:** A specific feature to generate and save a new version of the data file incorporating all applied edits.
