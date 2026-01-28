import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WindowContentRenderer } from "@/components/layout/WindowContentRenderer";
import { WindowShell } from "@/components/layout/WindowShell";
import type { WindowState } from "@/types/window";
import { useWindowStore } from "@/store/windowStore";

interface SortableWindowProps {
  window: WindowState;
}

export const SortableWindow = React.memo(function SortableWindow({
  window,
}: SortableWindowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: window.id });

  const toggleWindow = useWindowStore((state) => state.toggleWindow);
  const moveWindowToContainer = useWindowStore((state) => state.moveWindowToContainer);
  const bringToFront = useWindowStore((state) => state.bringToFront);
  const activeWindowId = useWindowStore((state) => state.activeWindowId);

  const style: React.CSSProperties = {
    position: "relative",
    width: "100%",
    marginBottom: "0.5rem",
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    zIndex: activeWindowId === window.id ? 999 : undefined,
  };

  return (
    <WindowShell
      ref={setNodeRef}
      title={window.title}
      style={style}
      listeners={listeners}
      attributes={attributes}
      headerRef={setActivatorNodeRef}
      onMouseDown={() => bringToFront(window.id)}
      onClose={() => toggleWindow(window.id)}
      onDockToggle={() => moveWindowToContainer(window.id, "main")}
      isActive={activeWindowId === window.id}
      isDocked={true}
    >
      <WindowContentRenderer type={window.type} />
    </WindowShell>
  );
});
