// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWindowStore } from './windowStore';
import type { WindowState } from '@/types/window';

const baseWindow: WindowState = {
  id: 'bathymetry',
  type: 'bathymetry',
  title: 'Bathymetry',
  container: 'main',
  position: { x: 60, y: 60 },
  size: { width: 800, height: 650 },
  zIndex: 10,
  isOpen: true,
};

describe('useWindowStore', () => {
  const initialWindows = useWindowStore.getState().windows;

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);
    useWindowStore.setState({
      windows: { ...initialWindows, bathymetry: baseWindow },
      sidebarOrder: [],
      activeWindowId: null,
      globalZIndex: 10,
      draggingWindowId: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caps resized main windows to the reachable workspace area', () => {
    useWindowStore
      .getState()
      .updateSize('bathymetry', { width: 2000, height: 2000 });

    expect(useWindowStore.getState().windows.bathymetry.size).toEqual({
      width: 968,
      height: 676,
    });
  });
});
