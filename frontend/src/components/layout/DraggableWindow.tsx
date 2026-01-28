import React, { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { WindowContentRenderer } from "@/components/layout/WindowContentRenderer";
import { WindowShell } from "@/components/layout/WindowShell";
import type { WindowState } from "@/types/window";
import { useWindowStore } from "@/store/windowStore";
import {
  WINDOW_MIN_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_MAX_WIDTH,
  WINDOW_MAX_HEIGHT,
} from "@/config/windowDefaults";

interface DraggableWindowProps {
  window: WindowState;
}

export const DraggableWindow = React.memo(function DraggableWindow({
  window,
}: DraggableWindowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({ id: window.id });
  
  const toggleWindow = useWindowStore((state) => state.toggleWindow);
  const moveWindowToContainer = useWindowStore((state) => state.moveWindowToContainer);
  const bringToFront = useWindowStore((state) => state.bringToFront);
  const updateSize = useWindowStore((state) => state.updateSize);
  const updatePosition = useWindowStore((state) => state.updatePosition);
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const draggingWindowId = useWindowStore((state) => state.draggingWindowId);
  const isCurrentlyDragging = draggingWindowId === window.id || isDragging;
  
  // Only allow resizing for main container windows
  const canResize = window.container === "main";
  
  const handleResize = (size: { width: number; height: number }, position?: { x: number; y: number }) => {
    updateSize(window.id, size);
    if (position) {
      updatePosition(window.id, position);
    }
  };

  const style = useMemo<React.CSSProperties>(() => ({
    position: "absolute",
    left: window.position.x,
    top: window.position.y,
    width: window.size.width,
    height: window.size.height,
    zIndex: window.zIndex,
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    pointerEvents: "auto",
    willChange: isCurrentlyDragging ? "transform" : "auto",
  }), [window.position.x, window.position.y, window.size.width, window.size.height, window.zIndex, transform, isCurrentlyDragging]);

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
      onDockToggle={() => moveWindowToContainer(window.id, "sidebar")}
      isActive={activeWindowId === window.id}
      isDocked={false}
      isDragging={isCurrentlyDragging}
      data-dragging={isCurrentlyDragging ? "true" : undefined}
      canResize={canResize}
      onResize={handleResize}
      minWidth={WINDOW_MIN_WIDTH}
      minHeight={WINDOW_MIN_HEIGHT}
      maxWidth={WINDOW_MAX_WIDTH}
      maxHeight={WINDOW_MAX_HEIGHT}
      currentPosition={window.position}
    >
      <WindowContentRenderer type={window.type} />
    </WindowShell>
  );
});
