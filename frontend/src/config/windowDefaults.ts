import type { WindowId, WindowState } from '@/types/window';
import { buildInitialWindows, isDemoModeEnabled } from '@/demo/demoModeConfig';

export const CASCADE_STEP = 30;
export const CASCADE_CYCLE = 10;
export const DEFAULT_MAIN_POSITION = { x: 200, y: 200 };

export const SIDEBAR_DEFAULT_WIDTH = 480;
export const SIDEBAR_MIN_WIDTH = 320;
export const SIDEBAR_MAX_WIDTH = 720;

export const WINDOW_MIN_WIDTH = 300;
export const WINDOW_MIN_HEIGHT = 200;
export const WINDOW_MAX_WIDTH = 2000;
export const WINDOW_MAX_HEIGHT = 2000;
export const APP_HEADER_HEIGHT = 56;
export const BOTTOM_PANEL_HEADER_HEIGHT = 36;

const windowMinimumSizeByType: Partial<
  Record<WindowId, { width: number; height: number }>
> = {
  'triangle-model': { width: 720, height: 600 },
};

export function getWindowMinimumSize(type: WindowId) {
  return (
    windowMinimumSizeByType[type] ?? {
      width: WINDOW_MIN_WIDTH,
      height: WINDOW_MIN_HEIGHT,
    }
  );
}

export const initialWindows: Record<WindowId, WindowState> = buildInitialWindows(
  isDemoModeEnabled(),
);


export const defaultSidebarOrder: WindowId[] = ['settings'];
export const defaultGlobalZIndex = 100;
