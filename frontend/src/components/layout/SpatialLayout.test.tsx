// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import SpatialLayout from './SpatialLayout';

const { mockToggleWindow } = vi.hoisted(() => ({
  mockToggleWindow: vi.fn(),
}));

vi.mock('@/store/windowStore', () => ({
  useWindowStore: () => ({
    toggleWindow: mockToggleWindow,
    windows: {
      settings: { isOpen: true },
      'response-plot': { isOpen: false },
      bathymetry: { isOpen: false },
      'custom-plot': { isOpen: false },
      'misfit-stats': { isOpen: false },
      'triangle-model': { isOpen: false },
    },
  }),
}));

vi.mock('@/components/layout/MapSubstrate', () => ({
  default: () => <div data-testid="map-substrate" />,
}));

vi.mock('@/components/layout/WindowManager', () => ({
  WindowManager: () => <div data-testid="window-manager" />,
}));

vi.mock('@/components/layout/BottomPanel', () => ({
  BottomPanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/layout/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock('@/hooks/useExportData', () => ({
  useExportData: () => ({
    activeDatasetName: null,
    exportData: vi.fn(),
    filteredDataCount: 0,
    hasData: false,
    message: '',
    resetStatus: vi.fn(),
    status: 'idle',
  }),
}));

vi.mock('@/hooks/useAlertDialog', () => ({
  useAlertDialog: () => ({
    alertState: { isOpen: false },
    handleConfirm: vi.fn(),
    hideAlert: vi.fn(),
    showAlert: vi.fn(),
  }),
}));

vi.mock('@/components/custom/CustomAlertDialog', () => ({
  CustomAlertDialog: () => null,
}));

describe('SpatialLayout', () => {
  it('uses the Delaunay mesh icon for the Mesh navigation item', () => {
    render(
      <TooltipProvider>
        <SpatialLayout />
      </TooltipProvider>,
    );

    const meshButton = screen.getByRole('button', { name: /mesh/i });
    expect(within(meshButton).getByTestId('mesh-nav-icon')).toHaveAttribute(
      'data-icon',
      'delaunay-mesh',
    );
  });
});
