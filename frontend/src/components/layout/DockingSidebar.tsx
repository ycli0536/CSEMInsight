import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { ChevronLeft } from "lucide-react";
import { SortableWindow } from "@/components/layout/SortableWindow";
import { useWindowStore } from "@/store/windowStore";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/config/windowDefaults";

export function DockingSidebar() {
  const sidebarOrder = useWindowStore((state) => state.sidebarOrder);
  const windows = useWindowStore((state) => state.windows);
  const { setNodeRef } = useDroppable({ id: "sidebar-container" });
  const visibleSidebarOrder = useMemo(
    () => sidebarOrder.filter((id) => windows[id]?.isOpen),
    [sidebarOrder, windows]
  );
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [expandedWidth, setExpandedWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const COLLAPSED_WIDTH = 12;

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      const nextWidth = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, startWidth + delta),
      );
      setSidebarWidth(nextWidth);
      if (nextWidth > COLLAPSED_WIDTH) {
        setExpandedWidth(nextWidth);
        setIsCollapsed(false);
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const toggleCollapse = () => {
    if (isCollapsed) {
      setSidebarWidth(expandedWidth || SIDEBAR_DEFAULT_WIDTH);
      setIsCollapsed(false);
    } else {
      setExpandedWidth(sidebarWidth);
      setSidebarWidth(COLLAPSED_WIDTH);
      setIsCollapsed(true);
    }
  };

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
    return () => {
      document.documentElement.style.setProperty("--sidebar-width", "0px");
    };
  }, [sidebarWidth]);

  return (
    <aside
      ref={setNodeRef}
      className="pointer-events-auto fixed right-0 top-0 z-[5] h-full border-l border-border/30 bg-background/98 backdrop-blur-xl flex flex-col"
      style={{ width: sidebarWidth }}
      aria-expanded={!isCollapsed}
    >
      <div
        onPointerDown={handleResizeStart}
        onDoubleClick={toggleCollapse}
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize z-50 hover:bg-primary/20 transition-colors"
        role="presentation"
      />
      {isCollapsed && (
        <button
          type="button"
          onClick={toggleCollapse}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-50 flex h-16 w-6 items-center justify-center rounded-r-md border border-border/40 bg-background/95 shadow-sm hover:bg-muted/60"
          aria-label="Expand sidebar"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      <div
        className="flex-1 w-full overflow-y-auto pt-16 transition-opacity"
        style={{ opacity: isCollapsed ? 0 : 1, pointerEvents: isCollapsed ? "none" : "auto" }}
      >
        <div className="p-3">
          <SortableContext items={visibleSidebarOrder} strategy={verticalListSortingStrategy}>
            {visibleSidebarOrder.map((id) => {
              const window = windows[id];
              if (!window) {
                return null;
              }
              return <SortableWindow key={id} window={window} />;
            })}
          </SortableContext>
        </div>
      </div>
    </aside>
  );
}
