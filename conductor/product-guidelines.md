# Product Guidelines

## Visual Aesthetic & UX
- **Hybrid Modern-Professional:** Aim for a modern, minimalist UI (large interactive elements, clean space) that retains the functional precision required for scientific data analysis.
- **Instrument-Like Feel:** Controls should feel tactile and responsive, providing immediate visual feedback for every user interaction.

## Interaction Principles
- **Speed & Fluidity:** Prioritize high-performance selection mechanisms. Support "painting" and sweeping gestures to allow users to quickly mask/unmask large clusters of data points.
- **Visual Feedback:** Selection actions must be visually confirmed instantly on the plot to give the user confidence in their edits.

## Data Representation
- **Explicit State Visualization:** Masked or modified data points must be clearly distinguishable from valid data using distinct visual markers (e.g., color shifts, transparency, or 'X' overlays) directly on the primary charts.
- **Clarity over Complexity:** Avoid overcrowding the interface with too many persistent indicators; focus on the data state within the active context.

## System Feedback & Tone
- **Helpful & Guiding:** Error messages and system alerts should be constructive, suggesting solutions or "next steps" rather than just reporting failures.
- **Proactive Assistance:** Where possible, the system should offer helpful shortcuts or automated suggestions (e.g., "Do you want to mask all points below this threshold?") to streamline the workflow.

## Layout & Context Management
- **Modal Editor Focus:** Use a distinct "Editor Mode" transition to clarify when the user is in a destructive context. The layout should adapt to prioritize editing tools and focused data views when this mode is active.
- **Context Preservation:** Ensure that entering/exiting the editor mode maintains the user's current zoom, filters, and data selection to prevent disorientation.
