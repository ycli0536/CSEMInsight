export type WindowId =
  | "settings"
  | "response-plot"
  | "bathymetry"
  | "custom-plot"
  | "misfit-stats";


export type WindowContainer = "main" | "sidebar";

export type WindowState = {
  id: WindowId;
  type: WindowId;
  title: string;
  container: WindowContainer;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  isOpen: boolean;
};
