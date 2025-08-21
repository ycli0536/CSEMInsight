import { create } from 'zustand'
import type {Selection} from 'react-aria-components';
import { ColDef, FilterModel } from '@ag-grid-community/core'; // Import ColDef type
import { ITextFilterParams, INumberFilterParams } from '@ag-grid-community/core'; // Import ITextFilterParams type
import NumberFloatingFilterComponent from '@/components/custom/numberFloatingFilterComponent';
import TextFloatingFilterComponent from '@/components/custom/textFloatingFilterComponent';


interface SettingFormState {
  dataFiles: string | null;
  modelFiles: string | null;
  showData: boolean;
  showModel: boolean;
  showResiduals: boolean;
  freqSelected: Selection;
  txSelected: Selection;
  rxSelected: Selection;
  setDataFiles: (dataFiles: string | null) => void;
  setModelFiles: (modelFiles: string | null) => void;
  setShowData: (showData: boolean) => void;
  setShowModel: (showModel: boolean) => void;
  setShowResiduals: (showResiduals: boolean) => void;
  setFreqSelected: (selected: Selection) => void;
  setTxSelected: (selected: Selection) => void;
  setRxSelected: (selected: Selection) => void;
}

type UPlotData = number | string | null | undefined;
type UPlotSeries = [
  null: null,
  series: [
    xValues: UPlotData[],
    yValues: UPlotData[],
    sizes: UPlotData[] | null,
    fills: UPlotData[] | null,
    strokes: UPlotData[] | null,
    labels: (number | string)[] | null,
  ]
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
  StdErr: number;
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

export interface xyzData {
  X: number;
  Y: number;
  Y_dist: number;
  Z: number;
  rho1: number;
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

type DataTableStore = {
  data: CsemData[];
  txData: TxData[];
  rxData: RxData[];
  originalTxData: TxData[]; // Store original Tx data for reverting
  tableData: CsemData[];
  filteredData: CsemData[];
  filteredTxData: TxData[];
  filteredRxData: RxData[];
  subDatasets: CsemData[][],
  colDefs: ColDef[];
  dataBlocks: [];
  visibleColumns: Selection;
  dataFileString: string;
  geometryInfo: GeometryData;
  filterModel: FilterModel | null,
  isTxDepthAdjusted: boolean; // Track if Tx depths have been adjusted
  setData: (data: CsemData[]) => void;
  setTxData: (txData: TxData[]) => void;
  setRxData: (rxData: RxData[]) => void;
  setOriginalTxData: (txData: TxData[]) => void;
  setColDefs: (newColDefs: ColDef[]) => void;
  setDataBlocks: (dataBlocks: []) => void;
  setVisibleColumns: (visibleColumns: Selection) => void;
  setDataFileString: (dataFileString: string) => void;
  setGeometryInfo: (newGeometryInfo: GeometryData) => void;
  setTableData: (tableData: CsemData[]) => void;
  setFilteredData: (newFilteredData: CsemData[]) => void;
  setFilteredTxData: (newFilteredTxData: TxData[]) => void;
  setFilteredRxData: (newFilteredRxData: RxData[]) => void;
  setFilterModel: (newFilterModel: FilterModel | null) => void;
  setSubDatasets: (newSubDatasets: []) => void;
  setIsTxDepthAdjusted: (adjusted: boolean) => void;
}

type Inv2DStore = {
  invData: xyzData[];
  setInvResult: (invData: xyzData[]) => void;
}

type BathymetryStore = {
  bathymetryData: BathymetryData | null;
  setBathymetryData: (data: BathymetryData | null) => void;
}

export const useInv2DStore = create<Inv2DStore>()((set) => ({
  invData: [],
  setInvResult: (invData) => set({ invData }),
}));

export const useBathymetryStore = create<BathymetryStore>()((set) => ({
  bathymetryData: null,
  setBathymetryData: (data) => set({ bathymetryData: data }),
}));

const defaultColDefs: ColDef[] = [
  {
    headerName: "Frequency ID",
    field: "Freq_id",
    filter: true,
    filterParams: { maxNumConditions: 5 } as ITextFilterParams,
    floatingFilter: true,
    floatingFilterComponent: NumberFloatingFilterComponent,
  },
  {
    headerName: "Rx ID",
    field: "Rx_id",
    filter: true,
    filterParams: { maxNumConditions: 5 } as INumberFilterParams,
    floatingFilter: true,
    floatingFilterComponent: NumberFloatingFilterComponent,
  },
  {
    headerName: "Tx ID",
    field: "Tx_id",
    filter: true,
    filterParams: { maxNumConditions: 5 } as INumberFilterParams,
    floatingFilter: true,
    floatingFilterComponent: NumberFloatingFilterComponent,
  },
  {
    headerName: "Data Type",
    field: "Type",
    filter: true,
    floatingFilter: true,
    floatingFilterComponent: TextFloatingFilterComponent,
  },
  {
    headerName: "Data",
    field: "Data",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Std Err",
    field: "StdErr",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Frequency",
    field: "Freq",
    filter: "agTextColumnFilter",
    filterParams: { maxNumConditions: 5 } as ITextFilterParams,
    floatingFilter: true,
  },
  {
    headerName: "X (rx)",
    field: "X_rx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Y (rx)",
    field: "Y_rx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Z (rx)",
    field: "Z_rx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Lat (rx)",
    field: "Lat_rx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Lon (rx)",
    field: "Lon_rx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Theta",
    field: "Theta",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Alpha",
    field: "Alpha",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Beta",
    field: "Beta",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "X (tx)",
    field: "X_tx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Y (tx)",
    field: "Y_tx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Lat (tx)",
    field: "Lat_tx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Lon (tx)",
    field: "Lon_tx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Z (tx)",
    field: "Z_tx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Azimuth",
    field: "Azimuth",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Dip",
    field: "Dip",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Length (tx)",
    field: "Length_tx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Type (tx)",
    field: "Type_tx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Name (tx)",
    field: "Name_tx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Length (rx)",
    field: "Length_rx",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Name (rx)",
    field: "Name_rx",
    filter: true,
    floatingFilter: true,
  },
  { headerName: "Index", field: "index" },
];

const initialVisibleColumns = ['Freq_id', 'Tx_id', 'Rx_id', 'Data', 'StdErr', 'Type'];
const initialColumns = defaultColDefs
.map((col) => col.field)
.filter((field): field is string => field !== undefined && initialVisibleColumns.includes(field)); // Set only default visible columns

export const useDataTableStore = create<DataTableStore>()((set) => ({
  data: [],
  txData: [],
  rxData: [],
  originalTxData: [],
  tableData: [],
  filteredTxData: [],
  filteredRxData: [],
  filteredData: [],
  subDatasets: [],
  colDefs: defaultColDefs,
  dataBlocks: [],
  visibleColumns: new Set<string>(initialColumns),
  dataFileString: "",
  filterModel: null,
  geometryInfo: { UTM_zone: 0, Hemisphere: "N", North: 0, East: 0, Strike: 0 },
  isTxDepthAdjusted: false,
  setData: (data) => set({ data: data }),
  setTxData: (txData) => set({ txData: txData }),
  setRxData: (rxData) => set({ rxData: rxData }),
  setOriginalTxData: (txData) => set({ originalTxData: txData }),
  setColDefs: (newColDefs) => set({ colDefs: newColDefs }),
  setDataBlocks: (dataBlocks) => set({ dataBlocks: dataBlocks }),
  setVisibleColumns: (visibleColumns) => set({ visibleColumns }),
  setDataFileString: (dataFileString) => set({ dataFileString }),
  setTableData: (tableData) => set({ tableData: tableData }),
  setFilteredData: (newFilteredData) => set({ filteredData: newFilteredData }),
  setFilteredTxData: (newFilteredTxData) => set({ filteredTxData: newFilteredTxData }),
  setFilteredRxData: (newFilteredRxData) => set({ filteredRxData: newFilteredRxData }),
  setFilterModel: (newFilterModel) => set({ filterModel: newFilterModel }),
  setSubDatasets: (newSubDatasets) => set({ subDatasets: newSubDatasets }),
  setGeometryInfo: (newGeometryInfo) => set({ geometryInfo: newGeometryInfo }),
  setIsTxDepthAdjusted: (adjusted) => set({ isTxDepthAdjusted: adjusted }),
}));

export const useSettingFormStore = create<SettingFormState>()((set) => ({
  dataFiles: null,
  modelFiles: null,
  showData: true,
  showModel: true,
  showResiduals: true,
  freqSelected: new Set([]),
  txSelected: new Set([]),
  rxSelected: new Set([]),
  setDataFiles: (dataFiles) => set({ dataFiles }),
  setModelFiles: (modelFiles) => set({ modelFiles }),
  setShowData: (showData) => set({ showData }),
  setShowModel: (showModel) => set({ showModel }),
  setShowResiduals: (showResiduals) => set({ showResiduals }),
  setFreqSelected: (freqSelected) => set({ freqSelected }),
  setTxSelected: (txSelected) => set({ txSelected }),
  setRxSelected: (rxSelected) => set({ rxSelected }),
}));
