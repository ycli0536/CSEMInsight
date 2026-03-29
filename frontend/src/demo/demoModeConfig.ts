import type { WindowId, WindowState } from '@/types/window';

const DEMO_DATASET_IDS = ['shumagin-line5-resp'] as const;

const DEFAULT_NAV_WINDOW_IDS: WindowId[] = [
  'settings',
  'response-plot',
  'bathymetry',
  'custom-plot',
  'misfit-stats',
];

export function isDemoModeEnabled(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true';
}

export function getDemoDatasetIds(): string[] {
  return [...DEMO_DATASET_IDS];
}

export function getVisibleNavWindowIds(_isDemoMode: boolean): WindowId[] {
  return [...DEFAULT_NAV_WINDOW_IDS];
}

export function buildInitialWindows(
  _isDemoMode: boolean,
): Record<WindowId, WindowState> {
  return {
    settings: {
      id: 'settings',
      type: 'settings',
      title: 'Control Panel',
      container: 'sidebar',
      isOpen: true,
      zIndex: 10,
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
    },
    'response-plot': {
      id: 'response-plot',
      type: 'response-plot',
      title: 'CSEM Responses',
      container: 'main',
      isOpen: false,
      zIndex: 10,
      position: { x: 100, y: 100 },
      size: { width: 600, height: 400 },
    },
    bathymetry: {
      id: 'bathymetry',
      type: 'bathymetry',
      title: 'Bathymetry & Survey Geometry',
      container: 'main',
      isOpen: true,
      zIndex: 10,
      position: { x: 60, y: 60 },
      size: { width: 800, height: 650 },
    },
    'custom-plot': {
      id: 'custom-plot',
      type: 'custom-plot',
      title: 'Custom Plot',
      container: 'main',
      isOpen: false,
      zIndex: 11,
      position: { x: 400, y: 400 },
      size: { width: 600, height: 400 },
    },
    'misfit-stats': {
      id: 'misfit-stats',
      type: 'misfit-stats',
      title: 'Misfit Statistics',
      container: 'main',
      isOpen: false,
      zIndex: 10,
      position: { x: 150, y: 150 },
      size: { width: 900, height: 700 },
    },
  };
}
