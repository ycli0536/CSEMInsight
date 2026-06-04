import type { WindowContainer, WindowState } from "@/types/window";
import {
  CASCADE_CYCLE,
  CASCADE_STEP,
  DEFAULT_MAIN_POSITION,
} from "@/config/windowDefaults";

const VIEWPORT_MARGIN = 16;

interface WindowViewport {
  width: number;
  height: number;
}

interface ClampWindowToViewportOptions {
  position: WindowState["position"];
  size: WindowState["size"];
  viewport: WindowViewport;
}

interface ConstrainWindowSizeToViewportOptions {
  size: WindowState["size"];
  minSize: WindowState["size"];
  maxSize: WindowState["size"];
  viewport: WindowViewport;
}

interface GetWindowWorkspaceViewportOptions {
  viewport: WindowViewport;
  reservedTop: number;
  reservedRight?: number;
  reservedBottom: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getMaxPosition(viewportSize: number, windowSize: number) {
  if (windowSize + VIEWPORT_MARGIN * 2 > viewportSize) {
    return VIEWPORT_MARGIN;
  }

  return viewportSize - windowSize - VIEWPORT_MARGIN;
}

/**
 * Calculates a cascaded position for a window in the main container.
 * Applies an offset based on the number of existing main windows to prevent overlap.
 *
 * @param window - The window state to calculate position for
 * @param mainWindowCount - Number of windows currently in the main container
 * @returns Position with cascaded offset if in main container, otherwise original position
 */
export const getCascadedPosition = (
  window: WindowState,
  mainWindowCount: number,
) => {
  if (window.container !== "main") {
    return window.position;
  }
  const offset = (mainWindowCount % CASCADE_CYCLE) * CASCADE_STEP;
  return {
    x: window.position.x + offset,
    y: window.position.y + offset,
  };
};

/**
 * Ensures a window has a valid position when moved to the main container.
 * If the position is at origin (0,0), sets it to the default main position.
 *
 * @param position - Current window position
 * @param container - Target container (main or sidebar)
 * @returns Valid position for the target container
 */
export const ensureMainPosition = (
  position: WindowState["position"],
  container: WindowContainer,
) => {
  if (container !== "main") {
    return position;
  }
  if (position.x === 0 && position.y === 0) {
    return DEFAULT_MAIN_POSITION;
  }
  return position;
};

export const clampWindowToViewport = ({
  position,
  size,
  viewport,
}: ClampWindowToViewportOptions) => {
  const maxX = getMaxPosition(viewport.width, size.width);
  const maxY = getMaxPosition(viewport.height, size.height);

  return {
    x: clamp(position.x, VIEWPORT_MARGIN, maxX),
    y: clamp(position.y, VIEWPORT_MARGIN, maxY),
  };
};

export const getWindowWorkspaceViewport = ({
  viewport,
  reservedTop,
  reservedRight = 0,
  reservedBottom,
}: GetWindowWorkspaceViewportOptions) => ({
  width: Math.max(0, viewport.width - reservedRight),
  height: Math.max(0, viewport.height - reservedTop - reservedBottom),
});

export const constrainWindowSizeToViewport = ({
  size,
  minSize,
  maxSize,
  viewport,
}: ConstrainWindowSizeToViewportOptions) => {
  const viewportMaxWidth = Math.max(
    minSize.width,
    viewport.width - VIEWPORT_MARGIN * 2,
  );
  const viewportMaxHeight = Math.max(
    minSize.height,
    viewport.height - VIEWPORT_MARGIN * 2,
  );
  const effectiveMaxWidth = Math.max(
    minSize.width,
    Math.min(maxSize.width, viewportMaxWidth),
  );
  const effectiveMaxHeight = Math.max(
    minSize.height,
    Math.min(maxSize.height, viewportMaxHeight),
  );

  return {
    width: clamp(size.width, minSize.width, effectiveMaxWidth),
    height: clamp(size.height, minSize.height, effectiveMaxHeight),
  };
};
