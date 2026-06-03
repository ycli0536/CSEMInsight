import { isWindowDockable } from "@/config/windowDefaults";
import type { WindowId, WindowState } from "@/types/window";

// Decides whether a drag that ended over `overId` should dock the active window
// into the sidebar. Non-dockable workspace windows never dock, even when dropped
// directly on the sidebar drop zone.
export function shouldDockToSidebar(
  activeWindow: WindowState,
  overId: string | null,
  windows: Record<WindowId, WindowState>,
): boolean {
  if (activeWindow.container !== "main") {
    return false;
  }
  if (!isWindowDockable(activeWindow.type)) {
    return false;
  }
  if (!overId) {
    return false;
  }
  if (overId === "sidebar-container") {
    return true;
  }
  return windows[overId as WindowId]?.container === "sidebar";
}
