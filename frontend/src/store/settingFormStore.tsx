import { create } from 'zustand'
import type {Selection} from 'react-aria-components';
import { ColDef, FilterModel } from 'ag-grid-community'; // Import ColDef type

interface SettingFormState {
  showData: boolean;
  showModel: boolean;
  showResiduals: boolean;
  freqSelected: Selection;
  setShowData: (showData: boolean) => void;
  setShowModel: (showModel: boolean) => void;
  setShowResiduals: (showResiduals: boolean) => void;
  setFreqSelected: (selected: Selection) => void;
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
  Tx_id: number;
  Rx_id: number;
  Data: number;
  StdErr: number;
  X_rx: number;
  Y_rx: number;
  Z_rx: number;
  Theta: number;
  Alpha: number;
  Beta: number;
  Length_rx: number;
  Name_rx: string;
  X_tx: number;
  Y_tx: number;
  Z_tx: number;
  Azimuth: number;
  Dip: number;
  Length_tx: number;
  Type_tx: string;
  Name_tx: string;
}

export interface xyzData {
  Y: number;
  Z: number;
  rho: number;
}

// export interface xyzData {
//   rho: number[][];
// }

// export interface CsemData {
//   data_freq1: number;
//   data_freq2: number;
//   data_freq3: number;
//   rx_id: number;
//   tx_id: number;
//   type: string;
// }

type DataTableStore = {
  data: CsemData[];
  filteredData: CsemData[];
  subDatasets: CsemData[][],
  colDefs: ColDef[];
  filterModel: FilterModel | null,
  setData: (data: CsemData[]) => void;
  setColDefs: (newColDefs: ColDef[]) => void;
  setFilteredData: (newFilteredData: CsemData[]) => void;
  setFilterModel: (newFilterModel: FilterModel | null) => void;
  setSubDatasets: (newSubDatasets: []) => void;
}

type Inv2DStore = {
  invData: xyzData[];
  setInvResult: (invData: xyzData[]) => void;
}

export const useInv2DStore = create<Inv2DStore>()((set) => ({
  invData: [],
  setInvResult: (invData) => set({ invData }),
}));

export const useDataTableStore = create<DataTableStore>()((set) => ({
  data: [],
  filteredData: [],
  subDatasets: [],
  colDefs: [
    { headerName: 'Index', field: "index"},
    { field: "Data", filter: true, floatingFilter: true},
    { headerName: 'Std Err', field: "StdErr", filter: true, floatingFilter: true},
    { headerName: 'Frequency ID', field: "Freq_id", filter: true, floatingFilter: true},
    { headerName: 'Rx ID', field: "Rx_id", filter: true, floatingFilter: true},
    { headerName: 'Tx ID', field: "Tx_id", filter: true, floatingFilter: true},
    { headerName: 'Data Type', field: "Type", filter: true, floatingFilter: true},
    { headerName: 'X (rx -> tx)', field: "X_rx", filter: true, floatingFilter: true},
    { headerName: 'Y (rx)', field: "Y_rx", filter: true, floatingFilter: true},
    { headerName: 'Z (rx)', field: "Z_rx", filter: true, floatingFilter: true},
    { headerName: 'Theta', field: "Theta", filter: true, floatingFilter: true},
    { headerName: 'Alpha', field: "Alpha", filter: true, floatingFilter: true},
    { headerName: 'Beta', field: "Beta", filter: true, floatingFilter: true},
    { headerName: 'X (tx -> rx)', field: "X_tx", filter: true, floatingFilter: true},
    { headerName: 'Y (tx)', field: "Y_tx", filter: true, floatingFilter: true},
    { headerName: 'Z (tx)', field: "Z_tx", filter: true, floatingFilter: true},
    { headerName: 'Azimuth', field: "Azimuth", filter: true, floatingFilter: true},
    { headerName: 'Dip', field: "Dip", filter: true, floatingFilter: true},
    { headerName: 'Length (tx)', field: "Length_tx", filter: true, floatingFilter: true},
    { headerName: 'Type (tx)', field: "Type_tx", filter: true, floatingFilter: true},
    { headerName: 'Name (tx)', field: "Name_tx", filter: true, floatingFilter: true},
    { headerName: 'Length (rx -> tx)', field: "Length_rx"},
    { headerName: 'Name (rx)', field: "Name_rx"},

  ],
  filterModel: null,
  setData: (data) => set({ data: data }),
  setColDefs: (newColDefs) => set({ colDefs: newColDefs }),
  setFilteredData: (newFilteredData) => set({ filteredData: newFilteredData }),
  setFilterModel: (newFilterModel) => set({ filterModel: newFilterModel }),
  setSubDatasets: (newSubDatasets) => set({ subDatasets: newSubDatasets })
}));

export const useSettingFormStore = create<SettingFormState>()((set) => ({
  showData: true,
  showModel: true,
  showResiduals: true,
  freqSelected: new Set([]),
  setShowData: (showData) => set({ showData }),
  setShowModel: (showModel) => set({ showModel }),
  setShowResiduals: (showResiduals) => set({ showResiduals }),
  setFreqSelected: (freqSelected) => set({ freqSelected }),
}));
