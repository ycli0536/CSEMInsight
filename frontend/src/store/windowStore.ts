import { create } from "zustand";
import { arrayMove } from "@dnd-kit/sortable";
import type { WindowContainer, WindowId, WindowState } from "@/types/window";
import {
  defaultGlobalZIndex,
  defaultSidebarOrder,
  initialWindows,
} from "@/config/windowDefaults";
import { ensureMainPosition, getCascadedPosition } from "@/utils/windowPositioning";

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
      const position = getCascadedPosition(window, mainCount);

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
      const position = ensureMainPosition(window.position, container);
      windows[id] = { ...window, container, position };

      // If moving to main container and size is 0 (e.g. Settings), set a default size
      if (container === "main" && (window.size.width === 0 || window.size.height === 0)) {
        windows[id].size = { width: 400, height: 500 };
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
      windows[id] = { ...window, position };
      return { windows };
    }),
  updateSize: (id, size) =>
    set((state) => {
      const window = state.windows[id];
      if (!window) {
        return state;
      }
      const windows = { ...state.windows };
      windows[id] = { ...window, size };
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

      windows[id] = { ...windowState, isOpen: true, zIndex: nextZ, position };
      return { windows, activeWindowId: id, globalZIndex: nextZ };
    }),
  setDraggingWindow: (id) => set({ draggingWindowId: id }),
}));

export type { WindowContainer, WindowId, WindowState } from "@/types/window";
