import type { WindowId, WindowState } from "@/types/window";

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

export const initialWindows: Record<WindowId, WindowState> = {
  settings: {
    id: "settings",
    type: "settings",
    title: "Control Panel",
    container: "sidebar",
    isOpen: true,
    zIndex: 10,
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
  },
  "response-plot": {
    id: "response-plot",
    type: "response-plot",
    title: "CSEM Responses",
    container: "main",
    isOpen: false,
    zIndex: 10,
    position: { x: 100, y: 100 },
    size: { width: 600, height: 400 },
  },

  bathymetry: {
    id: "bathymetry",
    type: "bathymetry",
    title: "Bathymetry & Survey Geometry",
    container: "main",
    isOpen: true,
    zIndex: 10,
    position: { x: 600, y: 50 },
    size: { width: 500, height: 600 },
  },
  "custom-plot": {
    id: "custom-plot",
    type: "custom-plot",
    title: "Custom Plot",
    container: "main",
    isOpen: false,
    zIndex: 11,
    position: { x: 400, y: 400 },
    size: { width: 600, height: 400 },
  },
  "misfit-stats": {
    id: "misfit-stats",
    type: "misfit-stats",
    title: "Misfit Statistics",
    container: "main",
    isOpen: false,
    zIndex: 10,
    position: { x: 150, y: 150 },
    size: { width: 900, height: 700 },
  },
};


export const defaultSidebarOrder: WindowId[] = ["settings"];
export const defaultGlobalZIndex = 100;
