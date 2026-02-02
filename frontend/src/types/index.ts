import { FilterModel } from "ag-grid-community"; // Or core if using new packages

export type UPlotData = number | string | null | undefined;

export type UPlotSeries = [
  null,
  [
    xValues: UPlotData[],
    yValues: UPlotData[],
    sizes: UPlotData[] | null,
    fills: UPlotData[] | null,
    strokes: UPlotData[] | null,
    labels: (number | string)[] | null,
  ],
];

export interface UPlotScatterProps {
  data: UPlotSeries;
  options: Partial<uPlot.Options>;
  tooltipLabels: (string | null)[];
}

export interface UPlotPoint {
  idx: number;
  seriesIdx: number;
}

export interface CsemData {
  index: number;
  Type: string;
  Freq_id: string;
  Freq: number;
  Tx_id: number;
  Rx_id: number;
  Data: number;
  StdError: number; // Standard error - now consistently named across all file formats
  Response?: number; // Model response (only in .resp files)
  Residual?: number; // Residual between data and response (only in .resp files)
  X_rx: number;
  Y_rx: number;
  Lon_rx: number;
  Lat_rx: number;
  Z_rx: number;
  Theta: number;
  Alpha: number;
  Beta: number;
  Length_rx: number;
  SolveCorr_rx?: string; // Optional correction flag in some .resp files
  Name_rx: string;
  X_tx: number;
  Y_tx: number;
  Lon_tx: number;
  Lat_tx: number;
  Z_tx: number;
  Azimuth: number;
  Dip: number;
  Length_tx: number;
  Type_tx: string;
  Name_tx: string;
  offset: number;
  distance: number;
}

export interface TxData {
  Tx_id: number;
  X_tx: number;
  Y_tx: number;
  Lon_tx: number;
  Lat_tx: number;
  Z_tx: number;
  Azimuth: number;
  Dip: number;
  Length_tx: number;
  Type_tx: string;
  Name_tx: string;
}

export interface RxData {
  Rx_id: number;
  X_rx: number;
  Y_rx: number;
  Lon_rx: number;
  Lat_rx: number;
  Z_rx: number;
  Theta: number;
  Alpha: number;
  Beta: number;
  Length_rx: number;
  Name_rx: string;
}

export interface BathymetryData {
  inline_distance: number[];
  depth: number[];
  num_points: number;
  distance_range: [number, number];
  depth_range: [number, number];
}

export interface GeometryData {
  UTM_zone: number;
  Hemisphere: string;
  North: number;
  East: number;
  Strike: number;
}

export type ComparisonMode = "overlay" | "sidebyside" | "difference" | "statistical";

/** Dataset visibility/role in the application */
export type DatasetRole = "primary" | "compared" | "hidden";

export interface Dataset {
  id: string;
  name: string;
  data: CsemData[];
  txData: TxData[];
  rxData: RxData[];
  geometryInfo: GeometryData;
  dataBlocks: [];
  color: string;
  /** @deprecated Use role instead. Kept for backwards compatibility during migration. */
  visible: boolean;
  /** The role of this dataset: primary (table+plot), compared (plot only), or hidden */
  role: DatasetRole;
  uploadTime: Date;
  filteredData?: CsemData[];
  filterSettings?: {
    freqSelected: any;
    txSelected: any;
    rxSelected: any;
  };
  filterModel?: FilterModel | null;
}

export type { WindowContainer, WindowId, WindowState } from "./window";
