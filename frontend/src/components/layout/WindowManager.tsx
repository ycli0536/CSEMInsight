import { useMemo, useRef, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { DockingSidebar } from "@/components/layout/DockingSidebar";
import { DraggableWindow } from "@/components/layout/DraggableWindow";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import {
  WindowContentHostProvider,
  WindowContentLayer,
} from "@/components/layout/WindowContentHost";
import {
  APP_HEADER_HEIGHT,
  BOTTOM_PANEL_HEADER_HEIGHT,
} from "@/config/windowDefaults";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useWindowStore } from "@/store/windowStore";
import { shouldDockToSidebar } from "@/utils/windowDocking";
import type { WindowId } from "@/types/window";

export function WindowManager() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const windows = useWindowStore((state) => state.windows);
  const updatePosition = useWindowStore((state) => state.updatePosition);
  const moveWindowToContainer = useWindowStore((state) => state.moveWindowToContainer);
  const reorderSidebar = useWindowStore((state) => state.reorderSidebar);
  const setDraggingWindow = useWindowStore((state) => state.setDraggingWindow);
  const dragStartPositionRef = useRef<{ x: number; y: number } | null>(null);
  
  const { setNodeRef } = useDroppable({ id: "main-container" });

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = event.active.id as WindowId;
    const activeWindow = windows[activeId];
    if (activeWindow && activeWindow.container === "main") {
      setDraggingWindow(activeId);
      dragStartPositionRef.current = { x: activeWindow.position.x, y: activeWindow.position.y };
    }
  }, [windows, setDraggingWindow]);

  const handleDragMove = useCallback((_event: DragMoveEvent) => {
    // Don't update position during drag - let transform handle visual movement
    // This prevents double movement and ensures smooth GPU-accelerated dragging
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over, delta } = event;
    const activeId = active.id as WindowId;
    const activeWindow = windows[activeId];

    setDraggingWindow(null);

    if (!activeWindow) {
      dragStartPositionRef.current = null;
      return;
    }

    const isOverMain = !over || over.id === "main-container";
    const activeInMain = activeWindow.container === "main";

    if (activeInMain && isOverMain && dragStartPositionRef.current) {
      // Update position based on final delta from start position
      updatePosition(activeId, {
        x: dragStartPositionRef.current.x + delta.x,
        y: dragStartPositionRef.current.y + delta.y,
      });
      dragStartPositionRef.current = null;
      return;
    }

    dragStartPositionRef.current = null;

    if (!activeInMain && isOverMain) {
      moveWindowToContainer(activeId, "main");
      updatePosition(activeId, { x: 200, y: 200 });
      return;
    }

    if (shouldDockToSidebar(activeWindow, over ? String(over.id) : null, windows)) {
      moveWindowToContainer(activeId, "sidebar");
      return;
    }

    if (!activeInMain && over?.id && (over.id === "sidebar-container" || windows[over.id as WindowId]?.container === "sidebar")) {
        if (over.id !== "sidebar-container") {
             reorderSidebar(activeId, over.id as WindowId);
        }
    }
  }, [windows, updatePosition, moveWindowToContainer, reorderSidebar, setDraggingWindow]);

  const openWindows = useMemo(
    () =>
      Object.values(windows).filter(
        (window) => window.isOpen
      ),
    [windows]
  );
  const mainWindows = useMemo(
    () => openWindows.filter((window) => window.container === "main"),
    [openWindows]
  );

  if (isMobile) {
    return <MobileDrawer />;
  }

  return (
    <WindowContentHostProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <div
          className="fixed left-0 right-0 z-10 pointer-events-none"
          style={{
            top: APP_HEADER_HEIGHT,
            bottom: BOTTOM_PANEL_HEADER_HEIGHT,
          }}
        >
          <div
            ref={setNodeRef}
            className="absolute inset-0 w-full h-full"
            id="main-container"
          />
          {mainWindows.map((window) => (
            <DraggableWindow key={window.id} window={window} />
          ))}
        </div>
        <DockingSidebar />
        <WindowContentLayer windows={openWindows} />
      </DndContext>
    </WindowContentHostProvider>
  );
}
