import { create } from 'zustand'
import type {Selection} from 'react-aria-components';
import { ColDef, FilterModel } from 'ag-grid-community'; // Import ColDef type
import { ITextFilterParams, INumberFilterParams } from 'ag-grid-community'; // Import ITextFilterParams type
import NumberFloatingFilterComponent from '@/components/custom/numberFloatingFilterComponent';

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
  filteredData: CsemData[];
  subDatasets: CsemData[][],
  colDefs: ColDef[];
  dataBlocks: [];
  dataFileString: string;
  geometryInfo: GeometryData;
  filterModel: FilterModel | null,
  setData: (data: CsemData[]) => void;
  setTxData: (txData: TxData[]) => void;
  setRxData: (rxData: RxData[]) => void;
  setColDefs: (newColDefs: ColDef[]) => void;
  setDataBlocks: (dataBlocks: []) => void;
  setDataFileString: (dataFileString: string) => void;
  setGeometryInfo: (newGeometryInfo: GeometryData) => void;
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
  txData: [],
  rxData: [],
  filteredData: [],
  subDatasets: [],
  colDefs: [
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
  ],
  dataBlocks: [],
  dataFileString: "",
  filterModel: null,
  geometryInfo: { UTM_zone: 0, Hemisphere: "N", North: 0, East: 0, Strike: 0 },
  setData: (data) => set({ data: data }),
  setTxData: (txData) => set({ txData: txData }),
  setRxData: (rxData) => set({ rxData: rxData }),
  setColDefs: (newColDefs) => set({ colDefs: newColDefs }),
  setDataBlocks: (dataBlocks) => set({ dataBlocks: dataBlocks }),
  setDataFileString: (dataFileString) => set({ dataFileString }),
  setFilteredData: (newFilteredData) => set({ filteredData: newFilteredData }),
  setFilterModel: (newFilterModel) => set({ filterModel: newFilterModel }),
  setSubDatasets: (newSubDatasets) => set({ subDatasets: newSubDatasets }),
  setGeometryInfo: (newGeometryInfo) => set({ geometryInfo: newGeometryInfo }),
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
