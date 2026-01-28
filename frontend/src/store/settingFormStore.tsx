import { create } from "zustand";
import type { MapLayerKey } from "@/lib/mapLayers";
import type { Selection } from "react-aria-components";
import type {
  BathymetryData,
  CsemData,
  ComparisonMode,
  Dataset,
  GeometryData,
  RxData,
  TxData,
} from "@/types";
import { ColDef, FilterModel } from "ag-grid-community";
import { ITextFilterParams, INumberFilterParams } from "ag-grid-community";
import NumberFloatingFilterComponent from '@/components/custom/numberFloatingFilterComponent';
import TextFloatingFilterComponent from '@/components/custom/textFloatingFilterComponent';


interface SettingFormState {
  dataFiles: string | null;
  showData: boolean;
  freqSelected: Selection;
  txSelected: Selection;
  rxSelected: Selection;
  mapLayer: MapLayerKey;
  recenterTimestamp: number;
  xAxisColumn: string;
  yAxisColumn: string;
  splitByColumn: string;
  setDataFiles: (dataFiles: string | null) => void;
  triggerRecenter: () => void;
  setShowData: (showData: boolean) => void;
  setFreqSelected: (selected: Selection) => void;
  setTxSelected: (selected: Selection) => void;
  setRxSelected: (selected: Selection) => void;
  setMapLayer: (mapLayer: MapLayerKey) => void;
  setXAxisColumn: (column: string) => void;
  setYAxisColumn: (column: string) => void;
  setSplitByColumn: (column: string) => void;
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
  datasets: Map<string, Dataset>;
  activeDatasetIds: string[];
  comparisonMode: ComparisonMode;
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
  addDataset: (dataset: Dataset) => void;
  updateDataset: (id: string, updates: Partial<Dataset>) => void;
  removeDataset: (id: string) => void;
  toggleDatasetVisibility: (id: string) => void;
  setActiveDatasets: (ids: string[]) => void;
  setComparisonMode: (mode: ComparisonMode) => void;
}

type BathymetryStore = {
  bathymetryData: BathymetryData | null;
  setBathymetryData: (data: BathymetryData | null) => void;
}

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
    headerName: "Std Error",
    field: "StdError",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Response",
    field: "Response",
    filter: true,
    floatingFilter: true,
  },
  {
    headerName: "Residual",
    field: "Residual",
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

const initialVisibleColumns = ['Freq_id', 'Tx_id', 'Rx_id', 'Data', 'StdError', 'Type'];
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
  datasets: new Map(),
  activeDatasetIds: [],
  comparisonMode: 'overlay',
  setData: (data) => set({ data: data, filteredData: data }),
  setTxData: (txData) => set({ txData: txData }),
  setRxData: (rxData) => set({ rxData: rxData }),
  setOriginalTxData: (txData) => set({ originalTxData: txData }),
  setColDefs: (newColDefs) => set({ colDefs: newColDefs }),
  setDataBlocks: (dataBlocks) => set({ dataBlocks: dataBlocks }),
  setVisibleColumns: (visibleColumns) => set({ visibleColumns }),
  setDataFileString: (dataFileString) => set({ dataFileString }),
  setTableData: (tableData) => set({ tableData: tableData, filteredData: tableData }),
  setFilteredData: (newFilteredData) => set({ filteredData: newFilteredData }),
  setFilteredTxData: (newFilteredTxData) => set({ filteredTxData: newFilteredTxData }),
  setFilteredRxData: (newFilteredRxData) => set({ filteredRxData: newFilteredRxData }),
  setFilterModel: (newFilterModel) => set({ filterModel: newFilterModel }),
  setSubDatasets: (newSubDatasets) => set({ subDatasets: newSubDatasets }),
  setGeometryInfo: (newGeometryInfo) => set({ geometryInfo: newGeometryInfo }),
  setIsTxDepthAdjusted: (adjusted) => set({ isTxDepthAdjusted: adjusted }),
  addDataset: (dataset) => set((state) => {
    const datasets = new Map(state.datasets);
    datasets.set(dataset.id, dataset);
    return {
      datasets,
      activeDatasetIds: state.activeDatasetIds.includes(dataset.id)
        ? state.activeDatasetIds
        : [...state.activeDatasetIds, dataset.id],
    };
  }),
  updateDataset: (id, updates) => set((state) => {
    if (!state.datasets.has(id)) {
      return state;
    }
    const datasets = new Map(state.datasets);
    const current = datasets.get(id);
    if (!current) {
      return state;
    }
    datasets.set(id, { ...current, ...updates });
    return { datasets };
  }),
  removeDataset: (id) => set((state) => {
    const datasets = new Map(state.datasets);
    datasets.delete(id);
    return {
      datasets,
      activeDatasetIds: state.activeDatasetIds.filter((datasetId) => datasetId !== id),
    };
  }),
  toggleDatasetVisibility: (id) => set((state) => {
    if (!state.datasets.has(id)) {
      return state;
    }
    const datasets = new Map(state.datasets);
    const current = datasets.get(id);
    if (!current) {
      return state;
    }
    datasets.set(id, { ...current, visible: !current.visible });
    return { datasets };
  }),
  setActiveDatasets: (ids) => set({ activeDatasetIds: ids }),
  setComparisonMode: (mode) => set({ comparisonMode: mode }),
}));

export const useSettingFormStore = create<SettingFormState>()((set) => ({
  dataFiles: null,
  showData: true,
  freqSelected: 'all',
  txSelected: 'all',
  rxSelected: 'all',
  mapLayer: "satellite",
  recenterTimestamp: 0,
  xAxisColumn: "",
  yAxisColumn: "",
  splitByColumn: "",
  setDataFiles: (dataFiles) => set({ dataFiles }),
  triggerRecenter: () => set(() => ({ recenterTimestamp: Date.now() })),
  setShowData: (showData) => set({ showData }),
  setFreqSelected: (freqSelected) => set({ freqSelected }),
  setTxSelected: (txSelected) => set({ txSelected }),
  setRxSelected: (rxSelected) => set({ rxSelected }),
  setMapLayer: (mapLayer) => set({ mapLayer }),
  setXAxisColumn: (xAxisColumn) => set({ xAxisColumn }),
  setYAxisColumn: (yAxisColumn) => set({ yAxisColumn }),
  setSplitByColumn: (splitByColumn) => set({ splitByColumn }),
}));

export type {
  BathymetryData,
  CsemData,
  ComparisonMode,
  Dataset,
  GeometryData,
  RxData,
  TxData,
  UPlotData,
  UPlotPoint,
  UPlotScatterProps,
  UPlotSeries,
} from "@/types";
