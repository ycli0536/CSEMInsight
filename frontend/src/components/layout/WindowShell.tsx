import React, { type PointerEvent as ReactPointerEvent } from "react";
import { X, Minimize2, Maximize2, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DraggableSyntheticListeners, DraggableAttributes } from "@dnd-kit/core";

interface WindowShellProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onResize"> {
  title: string;
  onClose?: () => void;
  onDockToggle?: () => void;
  isDocked?: boolean;
  headerRef?: React.Ref<HTMLElement>;
  listeners?: DraggableSyntheticListeners;
  attributes?: DraggableAttributes;
  isActive?: boolean;
  isDragging?: boolean;
  onResize?: (size: { width: number; height: number }, position?: { x: number; y: number }) => void;
  canResize?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  currentPosition?: { x: number; y: number };
}

export const WindowShell = React.forwardRef<HTMLDivElement, WindowShellProps>(
  (
    {
      title,
      children,
      className,
      onClose,
      onDockToggle,
      isDocked,
      headerRef,
      listeners,
      attributes,
      style,
      isActive,
      isDragging,
      onMouseDown,
      onResize,
      canResize = false,
      minWidth = 300,
      minHeight = 200,
      maxWidth = 2000,
      maxHeight = 2000,
      currentPosition,
      ...props
    },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [isResizing, setIsResizing] = React.useState(false);

    const handleResizeStart = (
      event: ReactPointerEvent<HTMLDivElement>,
      direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
    ) => {
      if (!canResize || !onResize || !containerRef.current) return;

      event.preventDefault();
      event.stopPropagation();

      setIsResizing(true);

      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = containerRef.current.offsetWidth;
      const startHeight = containerRef.current.offsetHeight;
      const startLeft = currentPosition?.x ?? containerRef.current.offsetLeft;
      const startTop = currentPosition?.y ?? containerRef.current.offsetTop;

      // Track latest values to commit on mouse up
      let lastWidth = startWidth;
      let lastHeight = startHeight;
      let lastLeft = startLeft;
      let lastTop = startTop;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;

        if (direction.includes("e")) {
          newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + deltaX));
        }
        if (direction.includes("w")) {
          const widthDelta = Math.min(maxWidth, Math.max(minWidth, startWidth - deltaX)) - startWidth;
          newWidth = startWidth - widthDelta;
          newLeft = startLeft + deltaX;
        }
        if (direction.includes("s")) {
          newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + deltaY));
        }
        if (direction.includes("n")) {
          const heightDelta = Math.min(maxHeight, Math.max(minHeight, startHeight - deltaY)) - startHeight;
          newHeight = startHeight - heightDelta;
          newTop = startTop + deltaY;
        }

        lastWidth = newWidth;
        lastHeight = newHeight;
        lastLeft = newLeft;
        lastTop = newTop;

        if (containerRef.current) {
          containerRef.current.style.width = `${newWidth}px`;
          containerRef.current.style.height = `${newHeight}px`;

          if (direction.includes("w")) {
            containerRef.current.style.left = `${newLeft}px`;
          }
          if (direction.includes("n")) {
            containerRef.current.style.top = `${newTop}px`;
          }
        }
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        setIsResizing(false);

        if (direction.includes("n") || direction.includes("w")) {
          onResize(
            { width: lastWidth, height: lastHeight },
            { x: lastLeft, y: lastTop }
          );
        } else {
          onResize({ width: lastWidth, height: lastHeight });
        }
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    };

    return (
      <div
        ref={(node) => {
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }
          containerRef.current = node;
        }}
        className={cn(
          "flex flex-col overflow-hidden rounded-xl border bg-card/95 backdrop-blur-sm relative",
          "border-border/50 shadow-lg",
          "transition-all duration-200",
          isActive && "ring-1 ring-primary/30 shadow-xl glow-sm",
          (isDragging || isResizing) && "shadow-2xl scale-[1.01]",
          className
        )}
        style={style}
        onMouseDown={onMouseDown}
        {...props}
      >
        <div
          ref={headerRef as React.RefObject<HTMLDivElement>}
          className={cn(
            "group relative flex h-10 shrink-0 items-center justify-between border-b border-border/30 px-3 select-none",
            "bg-muted/20 hover:bg-muted/40",
            "cursor-grab active:cursor-grabbing",
            isDragging ? "" : "transition-colors duration-200"
          )}
          {...listeners}
          {...attributes}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none">
            <GripHorizontal className="h-4 w-4" />
          </div>

          <div className="flex items-center gap-2 overflow-hidden z-10">
            <span className={cn(
              "truncate text-xs font-semibold tracking-wide text-muted-foreground/80",
              isActive && "text-foreground"
            )}>
              {title}
            </span>
          </div>

          <div
            className="flex items-center gap-1 z-10"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {onDockToggle && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onDockToggle}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={isDocked ? "Undock window" : "Dock window"}
                  >
                    {isDocked ? (
                      <Maximize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Minimize2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isDocked ? "Undock window" : "Dock window"}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Close window"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div
          className="relative flex-1 overflow-auto bg-background/50 pointer-events-auto"
        >
          {children}
        </div>

        {canResize && (
          <div
            onPointerDown={(e) => handleResizeStart(e, "se")}
            className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize z-50 flex items-end justify-end p-1 opacity-50 hover:opacity-100 transition-opacity"
            role="presentation"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M8 8L0 8L8 0L8 8Z" fill="currentColor" className="text-muted-foreground/50" />
            </svg>
          </div>
        )}
      </div>
    );
  }
);

WindowShell.displayName = "WindowShell";
