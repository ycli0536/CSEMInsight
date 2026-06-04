import { describe, expect, it } from 'vitest';

import { shouldDockToSidebar } from './windowDocking';
import type { WindowId, WindowState } from '@/types/window';

function makeWindow(
  overrides: Partial<WindowState> & Pick<WindowState, 'id' | 'type'>,
): WindowState {
  return {
    title: overrides.id,
    container: 'main',
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    zIndex: 1,
    isOpen: true,
    ...overrides,
  };
}

describe('shouldDockToSidebar', () => {
  const sidebarWindow = makeWindow({
    id: 'settings',
    type: 'settings',
    container: 'sidebar',
  });
  const windows = { settings: sidebarWindow } as unknown as Record<
    WindowId,
    WindowState
  >;

  it('docks a dockable main window dropped on the sidebar drop zone', () => {
    const active = makeWindow({ id: 'bathymetry', type: 'bathymetry' });
    expect(shouldDockToSidebar(active, 'sidebar-container', windows)).toBe(true);
  });

  it('docks a dockable main window dropped over an existing sidebar window', () => {
    const active = makeWindow({ id: 'bathymetry', type: 'bathymetry' });
    expect(shouldDockToSidebar(active, 'settings', windows)).toBe(true);
  });

  it('refuses to dock a non-dockable window even over the sidebar drop zone', () => {
    const active = makeWindow({ id: 'triangle-model', type: 'triangle-model' });
    expect(shouldDockToSidebar(active, 'sidebar-container', windows)).toBe(false);
  });

  it('does not treat a main drop target as a dock', () => {
    const active = makeWindow({ id: 'bathymetry', type: 'bathymetry' });
    expect(shouldDockToSidebar(active, 'main-container', windows)).toBe(false);
  });

  it('ignores windows that are already in the sidebar', () => {
    const active = makeWindow({
      id: 'bathymetry',
      type: 'bathymetry',
      container: 'sidebar',
    });
    expect(shouldDockToSidebar(active, 'sidebar-container', windows)).toBe(false);
  });
});
