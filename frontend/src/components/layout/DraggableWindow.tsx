import React, { useEffect, useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { WindowContentRenderer } from "@/components/layout/WindowContentRenderer";
import { WindowShell } from "@/components/layout/WindowShell";
import type { WindowState } from "@/types/window";
import { useWindowStore } from "@/store/windowStore";
import {
  APP_HEADER_HEIGHT,
  BOTTOM_PANEL_HEADER_HEIGHT,
  WINDOW_MAX_WIDTH,
  WINDOW_MAX_HEIGHT,
  getWindowMinimumSize,
} from "@/config/windowDefaults";
import {
  clampWindowToViewport,
  constrainWindowSizeToViewport,
  getWindowWorkspaceViewport,
} from "@/utils/windowPositioning";

interface DraggableWindowProps {
  window: WindowState;
}

const configuredMaximumSize = {
  width: WINDOW_MAX_WIDTH,
  height: WINDOW_MAX_HEIGHT,
};

function getBrowserViewport() {
  if (typeof globalThis.window === "undefined") {
    return null;
  }

  return getWindowWorkspaceViewport({
    viewport: {
      width: globalThis.window.innerWidth,
      height: globalThis.window.innerHeight,
    },
    reservedTop: APP_HEADER_HEIGHT,
    reservedBottom: BOTTOM_PANEL_HEADER_HEIGHT,
  });
}

function useBrowserViewport() {
  const [viewport, setViewport] = useState(getBrowserViewport);

  useEffect(() => {
    if (typeof globalThis.window === "undefined") {
      return;
    }

    const handleResize = () => {
      setViewport(getBrowserViewport());
    };

    handleResize();
    globalThis.window.addEventListener("resize", handleResize);
    return () => {
      globalThis.window.removeEventListener("resize", handleResize);
    };
  }, []);

  return viewport;
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
  const viewport = useBrowserViewport();
  
  // Only allow resizing for main container windows
  const canResize = window.container === "main";
  const minSize = useMemo(
    () => getWindowMinimumSize(window.type),
    [window.type]
  );
  const maxSize = useMemo(() => {
    if (window.container !== "main" || !viewport) {
      return configuredMaximumSize;
    }

    return constrainWindowSizeToViewport({
      size: configuredMaximumSize,
      minSize,
      maxSize: configuredMaximumSize,
      viewport,
    });
  }, [window.container, minSize, viewport]);
  const displaySize = useMemo(
    () => ({
      width: Math.min(maxSize.width, Math.max(window.size.width, minSize.width)),
      height: Math.min(maxSize.height, Math.max(window.size.height, minSize.height)),
    }),
    [
      window.size.width,
      window.size.height,
      minSize.width,
      minSize.height,
      maxSize.width,
      maxSize.height,
    ],
  );
  const displayPosition = useMemo(() => {
    if (window.container !== "main" || !viewport) {
      return window.position;
    }

    return clampWindowToViewport({
      position: window.position,
      size: displaySize,
      viewport,
    });
  }, [window.container, window.position, displaySize, viewport]);
  
  const handleResize = (size: { width: number; height: number }, position?: { x: number; y: number }) => {
    const constrainedSize = {
      width: Math.min(maxSize.width, Math.max(size.width, minSize.width)),
      height: Math.min(maxSize.height, Math.max(size.height, minSize.height)),
    };

    updateSize(window.id, constrainedSize);
    if (position) {
      updatePosition(window.id, position);
    }
  };

  const style = useMemo<React.CSSProperties>(() => ({
    position: "absolute",
    left: displayPosition.x,
    top: displayPosition.y,
    width: displaySize.width,
    height: displaySize.height,
    zIndex: window.zIndex,
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    pointerEvents: "auto",
    willChange: isCurrentlyDragging ? "transform" : "auto",
  }), [displayPosition.x, displayPosition.y, displaySize.width, displaySize.height, window.zIndex, transform, isCurrentlyDragging]);

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
      minWidth={minSize.width}
      minHeight={minSize.height}
      maxWidth={maxSize.width}
      maxHeight={maxSize.height}
      currentPosition={displayPosition}
    >
      <WindowContentRenderer type={window.type} />
    </WindowShell>
  );
});
