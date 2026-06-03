import { create } from "zustand";
import { arrayMove } from "@dnd-kit/sortable";
import type { WindowContainer, WindowId, WindowState } from "@/types/window";
import {
  APP_HEADER_HEIGHT,
  BOTTOM_PANEL_HEADER_HEIGHT,
  defaultGlobalZIndex,
  defaultSidebarOrder,
  getWindowMinimumSize,
  initialWindows,
  WINDOW_MAX_HEIGHT,
  WINDOW_MAX_WIDTH,
} from "@/config/windowDefaults";
import {
  clampWindowToViewport,
  constrainWindowSizeToViewport,
  ensureMainPosition,
  getCascadedPosition,
  getWindowWorkspaceViewport,
} from "@/utils/windowPositioning";

type WindowStore = {
  windows: Record<WindowId, WindowState>;
  sidebarOrder: WindowId[];
  activeWindowId: WindowId | null;
  globalZIndex: number;
  draggingWindowId: WindowId | null;
  registerWindow: (window: WindowState) => void;
  moveWindowToContainer: (id: WindowId, container: WindowContainer) => void;
  reorderSidebar: (activeId: WindowId, overId: WindowId) => void;
  updatePosition: (id: WindowId, position: { x: number; y: number }) => void;
  updateSize: (id: WindowId, size: { width: number; height: number }) => void;
  bringToFront: (id: WindowId) => void;
  toggleWindow: (id: WindowId) => void;
  setDraggingWindow: (id: WindowId | null) => void;
};

function getBrowserViewport() {
  if (typeof window === "undefined") {
    return null;
  }

  return getWindowWorkspaceViewport({
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    reservedTop: APP_HEADER_HEIGHT,
    reservedBottom: BOTTOM_PANEL_HEADER_HEIGHT,
  });
}

function getEffectiveWindowSize(window: WindowState, size = window.size) {
  const minimumSize = getWindowMinimumSize(window.type);

  return {
    width: Math.max(size.width, minimumSize.width),
    height: Math.max(size.height, minimumSize.height),
  };
}

function getConstrainedWindowSize(window: WindowState, size = window.size) {
  const minimumSize = getWindowMinimumSize(window.type);
  const maximumSize = {
    width: WINDOW_MAX_WIDTH,
    height: WINDOW_MAX_HEIGHT,
  };
  const viewport = window.container === "main" ? getBrowserViewport() : null;

  if (!viewport) {
    return {
      width: Math.min(maximumSize.width, Math.max(minimumSize.width, size.width)),
      height: Math.min(maximumSize.height, Math.max(minimumSize.height, size.height)),
    };
  }

  return constrainWindowSizeToViewport({
    size,
    minSize: minimumSize,
    maxSize: maximumSize,
    viewport,
  });
}

function clampMainWindowPosition(
  window: WindowState,
  position: WindowState["position"],
  size = window.size,
) {
  if (window.container !== "main") {
    return position;
  }

  const viewport = getBrowserViewport();
  if (!viewport) {
    return position;
  }

  return clampWindowToViewport({
    position,
    size: getConstrainedWindowSize(window, getEffectiveWindowSize(window, size)),
    viewport,
  });
}

export const useWindowStore = create<WindowStore>()((set) => ({
  windows: initialWindows,
  sidebarOrder: defaultSidebarOrder,
  activeWindowId: null,
  globalZIndex: defaultGlobalZIndex,
  draggingWindowId: null,
  registerWindow: (window) =>
    set((state) => {
      if (state.windows[window.id]) {
        return state;
      }
      const windows = { ...state.windows };
      const mainCount = Object.values(windows).filter((item) => item.container === "main")
        .length;
      const position = clampMainWindowPosition(
        window,
        getCascadedPosition(window, mainCount),
      );

      windows[window.id] = { ...window, position };
      const sidebarOrder =
        window.container === "sidebar" && !state.sidebarOrder.includes(window.id)
          ? [...state.sidebarOrder, window.id]
          : state.sidebarOrder;
      return { windows, sidebarOrder };
    }),
  moveWindowToContainer: (id, container) =>
    set((state) => {
      const window = state.windows[id];
      if (!window) {
        return state;
      }
      const windows = { ...state.windows };
      const nextWindow = { ...window, container };
      const position = clampMainWindowPosition(
        nextWindow,
        ensureMainPosition(window.position, container),
      );
      windows[id] = { ...nextWindow, position };

      // If moving to main container and size is 0 (e.g. Settings), set a default size
      if (container === "main" && (window.size.width === 0 || window.size.height === 0)) {
        windows[id].size = { width: 400, height: 500 };
        windows[id].position = clampMainWindowPosition(
          windows[id],
          windows[id].position,
          windows[id].size,
        );
      }

      const sidebarOrder =
        container === "sidebar"
          ? [id, ...state.sidebarOrder.filter((i) => i !== id)]
          : state.sidebarOrder.filter((windowId) => windowId !== id);
      return { windows, sidebarOrder };
    }),
  reorderSidebar: (activeId, overId) =>
    set((state) => {
      if (activeId === overId) {
        return state;
      }
      const oldIndex = state.sidebarOrder.indexOf(activeId);
      const newIndex = state.sidebarOrder.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) {
        return state;
      }
      return {
        sidebarOrder: arrayMove(state.sidebarOrder, oldIndex, newIndex),
      };
    }),
  updatePosition: (id, position) =>
    set((state) => {
      const window = state.windows[id];
      if (!window) {
        return state;
      }
      const windows = { ...state.windows };
      windows[id] = {
        ...window,
        position: clampMainWindowPosition(window, position),
      };
      return { windows };
    }),
  updateSize: (id, size) =>
    set((state) => {
      const window = state.windows[id];
      if (!window) {
        return state;
      }
      const windows = { ...state.windows };
      const constrainedSize = getConstrainedWindowSize(window, size);
      windows[id] = {
        ...window,
        position: clampMainWindowPosition(window, window.position, constrainedSize),
        size: constrainedSize,
      };
      return { windows };
    }),
  bringToFront: (id) =>
    set((state) => {
      const window = state.windows[id];
      if (!window) {
        return state;
      }
      const windows = { ...state.windows };
      const nextZ = state.globalZIndex + 1;
      windows[id] = { ...window, zIndex: nextZ };
      return { windows, activeWindowId: id, globalZIndex: nextZ };
    }),
  toggleWindow: (id) =>
    set((state) => {
      const windowState = state.windows[id];
      if (!windowState) {
        return state;
      }
      const windows = { ...state.windows };
      if (state.activeWindowId === id && windowState.isOpen) {
        windows[id] = { ...windowState, isOpen: false };
        return { windows, activeWindowId: null };
      }
      const nextZ = state.globalZIndex + 1;

      // Reset position to center-left if opening from closed state
      let position = windowState.position;
      if (!windowState.isOpen) {
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
        const windowHeight = windowState.size.height || 400;
        const y = Math.max(80, (viewportHeight - windowHeight) / 2);
        position = { x: 60, y };
      }

      const nextWindow = { ...windowState, isOpen: true, zIndex: nextZ };
      windows[id] = {
        ...nextWindow,
        position: clampMainWindowPosition(nextWindow, position),
      };
      return { windows, activeWindowId: id, globalZIndex: nextZ };
    }),
  setDraggingWindow: (id) => set({ draggingWindowId: id }),
}));

export type { WindowContainer, WindowId, WindowState } from "@/types/window";
