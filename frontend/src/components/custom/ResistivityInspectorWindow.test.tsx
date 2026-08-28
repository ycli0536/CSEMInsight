import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResistivityInspectorWindow } from '@/components/custom/ResistivityInspectorWindow';
import { useResistivityInspectorStore } from '@/store/resistivityInspectorStore';
import type { ColDef } from 'ag-grid-community';

// Stub the grid: it needs layout it will never get in jsdom, and what is worth
// asserting is the column definitions and row data we hand it, not its DOM.
const gridProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown>) => {
    gridProps.current = props;
    return <div data-testid="resistivity-grid" />;
  },
}));

function loadFile(
  resistivity: Parameters<
    ReturnType<typeof useResistivityInspectorStore.getState>['setResistivitySource']
  >[0]['resistivity'],
) {
  useResistivityInspectorStore.getState().setResistivitySource({
    resistivity,
    resistivityFileName: 'line5.resistivity',
    polyFileName: 'line5.poly',
  });
}

describe('ResistivityInspectorWindow', () => {
  beforeEach(() => {
    gridProps.current = null;
  });

  afterEach(() => {
    useResistivityInspectorStore.getState().setResistivitySource({
      resistivity: null,
      resistivityFileName: null,
      polyFileName: null,
    });
  });

  it('points back at the mesh window when nothing is loaded', () => {
    render(<ResistivityInspectorWindow />);

    expect(screen.getByText(/no resistivity file loaded/i)).toBeInTheDocument();
    expect(screen.queryByTestId('resistivity-grid')).not.toBeInTheDocument();
  });

  it('groups every header parameter rather than showing the first handful', () => {
    loadFile({
      metadata: {
        Format: 'MARE2DEM_1.1',
        'Settings File': 'mare2dem.settings',
        'Model Misfit': 0.9952,
        'Global Bounds': [0.1, 100000],
        Anisotropy: 'isotropic',
      },
      table: [{ '#': 1, Rho: 0.5938, Param: 1 }],
    });

    render(<ResistivityInspectorWindow />);

    expect(screen.getByRole('tab', { name: /parameters \(5\)/i })).toBeInTheDocument();

    // Grouped by role in the inversion, not by file order.
    expect(screen.getByText('Results from inversion')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();

    // Comma-separated entries are parsed into arrays upstream; they should read
    // back the way the file spells them.
    expect(screen.getByTitle('0.1, 100000')).toBeInTheDocument();

    // The description itself is covered in resistivityParameterInfo.test.ts;
    // Radix tooltips do not open under jsdom, so all this can check is that
    // every documented parameter offers the affordance.
    expect(
      screen.getByRole('button', { name: /what global bounds controls/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /what anisotropy controls/i }),
    ).toBeInTheDocument();
  });

  it('falls back to the row keys when the payload carries no column order', async () => {
    const user = userEvent.setup();
    loadFile({
      metadata: {},
      table: [{ '#': 1, Rho: 2 }],
    });

    render(<ResistivityInspectorWindow />);
    await user.click(screen.getByRole('tab', { name: /regions/i }));

    expect((gridProps.current?.columnDefs as ColDef[]).map((c) => c.field)).toEqual([
      '#',
      'Rho',
    ]);
  });

  it('counts free and fixed parameters the way the solver does', () => {
    loadFile({
      metadata: { 'Number of regions': 4 },
      columns: ['#', 'Rho', 'Param'],
      table: [
        { '#': 1, Rho: 1, Param: 1 },
        { '#': 2, Rho: 2, Param: 0 },
        { '#': 3, Rho: 3, Param: 2 },
        { '#': 4, Rho: 4, Param: 0 },
      ],
    });

    render(<ResistivityInspectorWindow />);

    // Param > 0 is free, 0 is fixed -- mare2dem_io.f90:651.
    expect(screen.getByText(/2 free, 2 fixed/)).toBeInTheDocument();
  });

  it('builds a sortable, documented column for each column of the file', async () => {
    const user = userEvent.setup();
    loadFile({
      metadata: { Anisotropy: 'isotropic' },
      // Flask sorts JSON object keys, so the rows arrive alphabetized; the
      // explicit `columns` list is what restores the file's own order.
      columns: ['#', 'Rho', 'Param', 'Lower', 'Upper'],
      table: [{ '#': 1, Lower: 0, Param: 1, Rho: 0.5938, Upper: 0 }],
    });

    render(<ResistivityInspectorWindow />);
    await user.click(screen.getByRole('tab', { name: /regions \(1\)/i }));

    const columns = gridProps.current?.columnDefs as ColDef[];
    expect(columns.map((column) => column.field)).toEqual([
      '#',
      'Rho',
      'Param',
      'Lower',
      'Upper',
    ]);

    const lower = columns.find((column) => column.field === 'Lower');
    expect(lower?.headerTooltip).toMatch(/falls back to Global Bounds/i);

    // Region and parameter numbers are identifiers, so they keep their exact
    // spelling; measured columns go through the significant-digit formatter.
    expect(columns.find((column) => column.field === '#')?.valueFormatter).toBeUndefined();
    expect(columns.find((column) => column.field === 'Rho')?.valueFormatter).toBeTypeOf(
      'function',
    );
  });

  it('resolves anisotropic column names back to their base description', async () => {
    const user = userEvent.setup();
    loadFile({
      metadata: { Anisotropy: 'tiz' },
      columns: ['#', 'Rho-z', 'Rho-xy', 'Lower z', 'Weight z/xy'],
      table: [{ '#': 1, 'Rho-z': 1, 'Rho-xy': 2, 'Lower z': 0, 'Weight z/xy': 0 }],
    });

    render(<ResistivityInspectorWindow />);
    await user.click(screen.getByRole('tab', { name: /regions/i }));

    const columns = gridProps.current?.columnDefs as ColDef[];
    expect(columns.find((column) => column.field === 'Rho-z')?.headerTooltip).toMatch(
      /ohm-m/i,
    );
    expect(columns.find((column) => column.field === 'Lower z')?.headerTooltip).toMatch(
      /lower resistivity bound/i,
    );
    expect(
      columns.find((column) => column.field === 'Weight z/xy')?.headerTooltip,
    ).toMatch(/strength of the pull toward Prej/i);
  });
});
