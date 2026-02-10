import { beforeEach, describe, expect, it } from 'vitest';

import { useDataTableStore, useSettingFormStore } from './settingFormStore';
import { useComparisonStore } from './comparisonStore';
import type { CsemData, Dataset } from '@/types';
import { datasetColors } from '@/lib/datasetColors';
import type { FilterModel } from 'ag-grid-community';

const baseCsemRow: CsemData = {
  index: 0,
  Type: '28',
  Freq_id: '1',
  Freq: 1,
  Tx_id: 1,
  Rx_id: 1,
  Data: 1,
  StdError: 0.1,
  X_rx: 0,
  Y_rx: 0,
  Lon_rx: 0,
  Lat_rx: 0,
  Z_rx: 0,
  Theta: 0,
  Alpha: 0,
  Beta: 0,
  Length_rx: 0,
  Name_rx: 'rx',
  X_tx: 0,
  Y_tx: 0,
  Lon_tx: 0,
  Lat_tx: 0,
  Z_tx: 0,
  Azimuth: 0,
  Dip: 0,
  Length_tx: 0,
  Type_tx: 'tx',
  Name_tx: 'tx',
  offset: 0,
  distance: 0,
};

const buildDataset = (overrides: Partial<Dataset> = {}): Dataset => ({
  id: 'id',
  name: 'dataset',
  data: [baseCsemRow],
  txData: [],
  rxData: [],
  geometryInfo: { UTM_zone: 0, Hemisphere: 'N', North: 0, East: 0, Strike: 0 },
  dataBlocks: {},
  color: '#000000',
  visible: true,
  role: 'compared',
  uploadTime: new Date(),
  ...overrides,
});

beforeEach(() => {
  useSettingFormStore.setState({
    dataFiles: null,
    showData: true,
    freqSelected: 'all',
    txSelected: 'all',
    rxSelected: 'all',
    mapLayer: 'satellite',
    recenterTimestamp: 0,
    xAxisColumn: 'Lon_tx',
    yAxisColumn: 'Lat_rx',
    splitByColumn: 'Freq',
    resetColumnFilters: true,
  });

  useDataTableStore.setState({
    data: [],
    txData: [],
    rxData: [],
    originalTxData: [],
    tableData: [],
    filteredData: [],
    filteredTxData: [],
    filteredRxData: [],
    dataBlocks: {},
    filterModel: null,
    geometryInfo: { UTM_zone: 0, Hemisphere: 'N', North: 0, East: 0, Strike: 0 },
    isTxDepthAdjusted: false,
    datasets: new Map(),
    primaryDatasetId: null,
    comparedDatasetIds: [],
    activeDatasetIds: [],
    activeTableDatasetId: null,
  });

  useComparisonStore.setState({
    referenceDatasetId: null,
    differenceData: [],
    alignmentMode: 'exact',
  });
});

describe('useDataTableStore setPrimaryDataset', () => {
  it('switches filteredData to dataset filtered data when available', () => {
    const datasetA = buildDataset({ id: 'A', role: 'primary' });
    const datasetB = buildDataset({
      id: 'B',
      filteredData: [
        {
          ...baseCsemRow,
          index: 1,
          Data: 2,
        },
      ],
      filterSettings: {
        freqSelected: 'f1',
        txSelected: 't1',
        rxSelected: 'r1',
      },
    });

    useDataTableStore.setState({
      datasets: new Map([
        ['A', datasetA],
        ['B', datasetB],
      ]),
      primaryDatasetId: 'A',
      comparedDatasetIds: ['B'],
      data: datasetA.data,
      tableData: datasetA.data,
      filteredData: datasetA.data,
    });

    useDataTableStore.getState().setPrimaryDataset('B');

    const state = useDataTableStore.getState();
    expect(state.primaryDatasetId).toBe('B');
    expect(state.filteredData).toEqual(datasetB.filteredData);

    const settingState = useSettingFormStore.getState();
    expect(settingState.freqSelected).toBe('f1');
    expect(settingState.txSelected).toBe('t1');
    expect(settingState.rxSelected).toBe('r1');
  });

  it('falls back to dataset data when filtered data is empty', () => {
    const dataset = buildDataset({
      id: 'B',
      filteredData: [],
    });

    useDataTableStore.setState({
      datasets: new Map([['B', dataset]]),
      primaryDatasetId: 'B',
      data: [],
      tableData: [],
      filteredData: [],
    });

    useDataTableStore.getState().setPrimaryDataset('B');

    const state = useDataTableStore.getState();
    expect(state.filteredData).toEqual(dataset.data);
  });

  it('syncs reference dataset with primary dataset', () => {
    const datasetA = buildDataset({ id: 'A', role: 'primary' });
    const datasetB = buildDataset({ id: 'B' });

    useDataTableStore.setState({
      datasets: new Map([
        ['A', datasetA],
        ['B', datasetB],
      ]),
      primaryDatasetId: 'A',
      comparedDatasetIds: ['B'],
      data: datasetA.data,
      tableData: datasetA.data,
      filteredData: datasetA.data,
    });

    useComparisonStore.setState({
      referenceDatasetId: 'A',
      differenceData: [],
      alignmentMode: 'exact',
    });

    useDataTableStore.getState().setPrimaryDataset('B');

    const comparisonState = useComparisonStore.getState();
    expect(comparisonState.referenceDatasetId).toBe('B');
  });
});

describe('useDataTableStore addDataset color allocation', () => {
  it('reuses freed palette colors and avoids collisions', () => {
    const [firstColor, secondColor] = datasetColors;

    useDataTableStore
      .getState()
      .addDataset(buildDataset({ id: 'A', color: firstColor }));
    useDataTableStore
      .getState()
      .addDataset(buildDataset({ id: 'B', color: secondColor }));

    useDataTableStore.getState().removeDataset('A');

    // Simulates current loader behavior that might pass an already-used color.
    useDataTableStore
      .getState()
      .addDataset(buildDataset({ id: 'C', color: secondColor }));

    const state = useDataTableStore.getState();
    expect(state.datasets.get('B')?.color).toBe(secondColor);
    expect(state.datasets.get('C')?.color).toBe(firstColor);
  });
});

describe('useDataTableStore resetAllFilters', () => {
  it('clears filter model and resets selection', () => {
    useSettingFormStore.setState({
      freqSelected: 'custom',
      txSelected: 'custom',
      rxSelected: 'custom',
      resetColumnFilters: false,
    });

    useDataTableStore.setState({
      filterModel: { field: { filterType: 'number' } } as FilterModel,
    });

    useDataTableStore.getState().resetAllFilters();

    const state = useDataTableStore.getState();
    expect(state.filterModel).toBeNull();

    const settingState = useSettingFormStore.getState();
    expect(settingState.freqSelected).toBe('all');
    expect(settingState.txSelected).toBe('all');
    expect(settingState.rxSelected).toBe('all');
    expect(settingState.resetColumnFilters).toBe(true);
  });
});
