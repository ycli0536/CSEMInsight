import type { WindowContainer, WindowState } from "@/types/window";
import {
  CASCADE_CYCLE,
  CASCADE_STEP,
  DEFAULT_MAIN_POSITION,
} from "@/config/windowDefaults";

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
