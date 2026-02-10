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
import { useComparisonStore } from "@/store/comparisonStore";
import { datasetColors } from "@/lib/datasetColors";
import { ColDef, FilterModel } from "ag-grid-community";
import { ITextFilterParams, INumberFilterParams } from "ag-grid-community";
import NumberFloatingFilterComponent from '@/components/custom/numberFloatingFilterComponent';
import TextFloatingFilterComponent from '@/components/custom/textFloatingFilterComponent';

// Define Selection here or import it if compatible, but stores usually import `Selection` from react-aria-components.
// Let's use the imported one.



interface SettingFormState {
  dataFiles: string | null; // This should be derived from datasets, not stored separately if possible, or synced.
  showData: boolean;
  freqSelected: Selection;
  txSelected: Selection;
  rxSelected: Selection;
  mapLayer: MapLayerKey;
  recenterTimestamp: number;
  xAxisColumn: string;
  yAxisColumn: string;
  splitByColumn: string;
  resetColumnFilters: boolean;
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
  setResetColumnFilters: (reset: boolean) => void;
  resetFilters: () => void;
}

type DataTableStore = {
  data: CsemData[];
  txData: TxData[];
  rxData: RxData[];
  originalTxData: TxData[];
  tableData: CsemData[];
  filteredData: CsemData[];
  filteredTxData: TxData[];
  filteredRxData: RxData[];
  subDatasets: CsemData[][],
  colDefs: ColDef[];
  dataBlocks: Record<string, string[]>;
  visibleColumns: Selection;
  dataFileString: string;
  geometryInfo: GeometryData;
  filterModel: FilterModel | null,
  isTxDepthAdjusted: boolean;
  datasets: Map<string, Dataset>;
  
  primaryDatasetId: string | null;
  comparedDatasetIds: string[];
  
  /** @deprecated Use primaryDatasetId instead */
  activeDatasetIds: string[];
  /** @deprecated Use primaryDatasetId instead */
  activeTableDatasetId: string | null;
  
  comparisonMode: ComparisonMode;
  setData: (data: CsemData[]) => void;
  setTxData: (txData: TxData[]) => void;
  setRxData: (rxData: RxData[]) => void;
  setOriginalTxData: (txData: TxData[]) => void;
  setColDefs: (newColDefs: ColDef[]) => void;
  setDataBlocks: (dataBlocks: Record<string, string[]>) => void;
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
  
  setPrimaryDataset: (id: string) => void;
  addToCompared: (id: string) => void;
  removeFromCompared: (id: string) => void;
  
  setComparisonMode: (mode: ComparisonMode) => void;
  updateDatasetFilter: (id: string, filteredData: CsemData[], filterSettings: { freqSelected: Selection, txSelected: Selection, rxSelected: Selection }, filterModel?: FilterModel | null) => void;
  resetAllFilters: () => void;
  resetDatasets: () => void;
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

const normalizeColor = (color: string) => color.trim().toLowerCase();

const getNextDatasetColor = (
  datasets: Map<string, Dataset>,
  preferredColor: string,
): string => {
  const usedColors = new Set(
    Array.from(datasets.values()).map((dataset) => normalizeColor(dataset.color)),
  );

  const normalizedPreferred = normalizeColor(preferredColor);
  if (!usedColors.has(normalizedPreferred)) {
    return preferredColor;
  }

  const reusableColor = datasetColors.find(
    (color) => !usedColors.has(normalizeColor(color)),
  );

  if (reusableColor) {
    return reusableColor;
  }

  return preferredColor;
};

export const useDataTableStore = create<DataTableStore>()((set, _get) => ({
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
  dataBlocks: {},
  visibleColumns: new Set<string>(initialColumns),
  dataFileString: "",
  filterModel: null,
  geometryInfo: { UTM_zone: 0, Hemisphere: "N", North: 0, East: 0, Strike: 0 },
  isTxDepthAdjusted: false,
  datasets: new Map(),
  
  primaryDatasetId: null,
  comparedDatasetIds: [],
  
  activeDatasetIds: [],
  activeTableDatasetId: null,
  
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
    const isFirstDataset = state.datasets.size === 0;
    const assignedColor = getNextDatasetColor(state.datasets, dataset.color);
    
    const datasetWithRole: Dataset = {
      ...dataset,
      color: assignedColor,
      role: isFirstDataset ? 'primary' : 'compared',
      visible: true,
    };
    datasets.set(dataset.id, datasetWithRole);
    
    const newPrimaryId = isFirstDataset ? dataset.id : state.primaryDatasetId;
    const newComparedIds = isFirstDataset 
      ? state.comparedDatasetIds 
      : [...state.comparedDatasetIds, dataset.id];
    
    const visibleIds = [
      ...(newPrimaryId ? [newPrimaryId] : []),
      ...newComparedIds
    ];
    
    if (isFirstDataset) {
      useComparisonStore.getState().setReferenceDatasetId(newPrimaryId);
    }

    return {
      datasets,
      primaryDatasetId: newPrimaryId,
      comparedDatasetIds: newComparedIds,
      activeDatasetIds: visibleIds,
      activeTableDatasetId: newPrimaryId,
    };
  }),
  
  updateDataset: (id, updates) => set((state) => {
    if (!state.datasets.has(id)) return state;
    const datasets = new Map(state.datasets);
    const current = datasets.get(id);
    if (!current) return state;
    datasets.set(id, { ...current, ...updates });
    return { datasets };
  }),
  
  removeDataset: (id) => set((state) => {
    const datasets = new Map(state.datasets);
    const deletedDataset = datasets.get(id);
    datasets.delete(id);
    
    if (datasets.size === 0) {
      useComparisonStore.getState().setReferenceDatasetId(null);
      return {
        datasets,
        primaryDatasetId: null,
        comparedDatasetIds: [],
        activeDatasetIds: [],
        activeTableDatasetId: null,
        data: [],
        tableData: [],
        filteredData: [],
        txData: [],
        rxData: [],
        originalTxData: [],
        filteredTxData: [],
        filteredRxData: [],
        dataBlocks: {},
        geometryInfo: { UTM_zone: 0, Hemisphere: "N", North: 0, East: 0, Strike: 0 },
        isTxDepthAdjusted: false,
      };
    }
    
    let newPrimaryId = state.primaryDatasetId;
    let newComparedIds = state.comparedDatasetIds.filter(cid => cid !== id);
    
    if (state.primaryDatasetId === id) {
      const nextPrimary = newComparedIds[0] || datasets.keys().next().value;
      newPrimaryId = nextPrimary ?? null;
      newComparedIds = newComparedIds.filter(cid => cid !== nextPrimary);
      
      if (newPrimaryId) {
        const promoted = datasets.get(newPrimaryId);
        if (promoted) {
          datasets.set(newPrimaryId, { ...promoted, role: 'primary' });
        }
      }

      useComparisonStore.getState().setReferenceDatasetId(newPrimaryId);
    }
    
    const visibleIds = [
      ...(newPrimaryId ? [newPrimaryId] : []),
      ...newComparedIds
    ];
    
    const newPrimaryDataset = newPrimaryId ? datasets.get(newPrimaryId) : null;
    
    return {
      datasets,
      primaryDatasetId: newPrimaryId,
      comparedDatasetIds: newComparedIds,
      activeDatasetIds: visibleIds,
      activeTableDatasetId: newPrimaryId,
      ...(newPrimaryDataset && deletedDataset && state.data === deletedDataset.data ? {
        data: newPrimaryDataset.data,
        tableData: newPrimaryDataset.data,
        filteredData: newPrimaryDataset.filteredData ?? newPrimaryDataset.data,
        txData: newPrimaryDataset.txData,
        rxData: newPrimaryDataset.rxData,
        dataBlocks: newPrimaryDataset.dataBlocks,
        geometryInfo: newPrimaryDataset.geometryInfo,
        isTxDepthAdjusted: false,
        originalTxData: [],
      } : {}),
    };
  }),
  
  setPrimaryDataset: (id) => set((state) => {
    const dataset = state.datasets.get(id);
    if (!dataset) return state;
    
    const datasets = new Map(state.datasets);
    
    if (state.primaryDatasetId && state.primaryDatasetId !== id) {
      const oldPrimary = datasets.get(state.primaryDatasetId);
      if (oldPrimary) {
        datasets.set(state.primaryDatasetId, { ...oldPrimary, role: 'compared' });
      }
    }
    
    datasets.set(id, { ...dataset, role: 'primary', visible: true });
    
    const newComparedIds = state.comparedDatasetIds.filter(cid => cid !== id);
    if (state.primaryDatasetId && state.primaryDatasetId !== id) {
      newComparedIds.unshift(state.primaryDatasetId);
    }
    
    const { setFreqSelected, setTxSelected, setRxSelected } = useSettingFormStore.getState();
    if (dataset.filterSettings) {
      setFreqSelected(dataset.filterSettings.freqSelected);
      setTxSelected(dataset.filterSettings.txSelected);
      setRxSelected(dataset.filterSettings.rxSelected);
    } else {
      setFreqSelected('all');
      setTxSelected('all');
      setRxSelected('all');
    }
    
    const initialViewData = (dataset.filteredData && dataset.filteredData.length > 0) 
      ? dataset.filteredData 
      : dataset.data;
    
    const visibleIds = [id, ...newComparedIds];

    useComparisonStore.getState().setReferenceDatasetId(id);
    
    return {
      datasets,
      primaryDatasetId: id,
      comparedDatasetIds: newComparedIds,
      activeDatasetIds: visibleIds,
      activeTableDatasetId: id,
      data: dataset.data,
      tableData: dataset.data,
      filteredData: initialViewData,
      txData: dataset.txData,
      rxData: dataset.rxData,
      originalTxData: [],
      filteredTxData: [],
      filteredRxData: [],
      dataBlocks: dataset.dataBlocks,
      geometryInfo: dataset.geometryInfo,
      isTxDepthAdjusted: false,
    };
  }),
  
  addToCompared: (id) => set((state) => {
    if (state.comparedDatasetIds.includes(id) || state.primaryDatasetId === id) {
      return state;
    }
    const dataset = state.datasets.get(id);
    if (!dataset) return state;
    
    const datasets = new Map(state.datasets);
    datasets.set(id, { ...dataset, role: 'compared', visible: true });
    
    const newComparedIds = [...state.comparedDatasetIds, id];
    const visibleIds = [
      ...(state.primaryDatasetId ? [state.primaryDatasetId] : []),
      ...newComparedIds
    ];
    
    return {
      datasets,
      comparedDatasetIds: newComparedIds,
      activeDatasetIds: visibleIds,
    };
  }),
  
  removeFromCompared: (id) => set((state) => {
    if (!state.comparedDatasetIds.includes(id)) return state;
    
    const dataset = state.datasets.get(id);
    if (!dataset) return state;
    
    const datasets = new Map(state.datasets);
    datasets.set(id, { ...dataset, role: 'hidden', visible: false });
    
    const newComparedIds = state.comparedDatasetIds.filter(cid => cid !== id);
    const visibleIds = [
      ...(state.primaryDatasetId ? [state.primaryDatasetId] : []),
      ...newComparedIds
    ];
    
    return {
      datasets,
      comparedDatasetIds: newComparedIds,
      activeDatasetIds: visibleIds,
    };
  }),
  
  setComparisonMode: (mode) => set({ comparisonMode: mode }),
  
  updateDatasetFilter: (id, filteredData, filterSettings, filterModel) => set((state) => {
    const datasets = new Map(state.datasets);
    const dataset = datasets.get(id);
    if (!dataset) return state;
    
    const updates: Partial<Dataset> = { filteredData, filterSettings };
    if (filterModel !== undefined) {
      updates.filterModel = filterModel;
    }
    
    datasets.set(id, { ...dataset, ...updates });
    return { datasets };
  }),
  
  resetAllFilters: () => set(() => {
    const settingStore = useSettingFormStore.getState();
    settingStore.resetFilters();
    settingStore.setResetColumnFilters(true);
    return { filterModel: null };
  }),
  
  resetDatasets: () => set(() => {
    const settingStore = useSettingFormStore.getState();
    settingStore.resetFilters();
    settingStore.setResetColumnFilters(true);
    useComparisonStore.getState().setReferenceDatasetId(null);
    return {
      datasets: new Map(),
      primaryDatasetId: null,
      comparedDatasetIds: [],
      activeDatasetIds: [],
      activeTableDatasetId: null,
      data: [],
      tableData: [],
      filteredData: [],
      txData: [],
      rxData: [],
      originalTxData: [],
      filteredTxData: [],
      filteredRxData: [],
      subDatasets: [],
      dataBlocks: {},
      geometryInfo: { UTM_zone: 0, Hemisphere: "N", North: 0, East: 0, Strike: 0 },
      isTxDepthAdjusted: false,
      filterModel: null,
    };
  }),
}));

export const useSettingFormStore = create<SettingFormState>()((set) => ({
  dataFiles: null,
  showData: true,
  freqSelected: 'all',
  txSelected: 'all',
  rxSelected: 'all',
  mapLayer: "satellite",
  recenterTimestamp: 0,
  xAxisColumn: "Lon_tx",
  yAxisColumn: "Lat_rx",
  splitByColumn: "Freq",
  resetColumnFilters: true,
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
  setResetColumnFilters: (resetColumnFilters) => set({ resetColumnFilters }),
  resetFilters: () => set({ freqSelected: 'all', txSelected: 'all', rxSelected: 'all' }),
}));

export type {
  BathymetryData,
  CsemData,
  ComparisonMode,
  Dataset,
  DatasetRole,
  GeometryData,
  RxData,
  TxData,
  UPlotData,
  UPlotPoint,
  UPlotScatterProps,
  UPlotSeries,
} from "@/types";
