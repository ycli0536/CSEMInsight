import { create } from 'zustand';
import type { TriangleModelResistivity } from '@/types/triangleModel';

/**
 * The resistivity file the Triangle Model window currently has loaded, exposed
 * so the Resistivity Inspector window can render it side by side with the mesh.
 *
 * This mirrors state that still lives in `TriangleModelWindow` rather than
 * owning it. Lifting the whole model would touch every viewer callback in that
 * component for no gain here -- the inspector is read-only, and the mesh has to
 * stay authoritative because it is what the export paths write from. The window
 * publishes on change; nothing writes back.
 *
 * `resistivity` holds the payload by reference, never a copy: the table can run
 * to tens of thousands of rows and cloning it per publish would grow the heap
 * on every model load.
 */
type ResistivityInspectorStore = {
  resistivity: TriangleModelResistivity | null;
  resistivityFileName: string | null;
  polyFileName: string | null;
  setResistivitySource: (source: {
    resistivity: TriangleModelResistivity | null;
    resistivityFileName: string | null;
    polyFileName: string | null;
  }) => void;
};

export const useResistivityInspectorStore = create<ResistivityInspectorStore>(
  (set) => ({
    resistivity: null,
    resistivityFileName: null,
    polyFileName: null,
    setResistivitySource: (source) => set(source),
  }),
);
