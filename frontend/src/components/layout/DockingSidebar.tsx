import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
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
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <aside
      ref={setNodeRef}
      className="pointer-events-auto fixed right-0 top-0 z-[5] h-full border-l border-border/30 bg-background/98 backdrop-blur-xl flex flex-col"
      style={{ width: sidebarWidth }}
    >
      <div
        onPointerDown={handleResizeStart}
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize z-50 hover:bg-primary/20 transition-colors"
        aria-hidden="true"
      />
      <div className="flex-1 w-full overflow-y-auto pt-16">
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
