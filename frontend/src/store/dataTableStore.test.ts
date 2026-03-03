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
    applyQuickFiltersGlobally: false,
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
        freqSelected: new Set<string>(['f1']),
        txSelected: new Set<string>(['t1']),
        rxSelected: new Set<string>(['r1']),
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
    expect(settingState.freqSelected).toEqual(new Set<string>(['f1']));
    expect(settingState.txSelected).toEqual(new Set<string>(['t1']));
    expect(settingState.rxSelected).toEqual(new Set<string>(['r1']));
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

  it('keeps the shared quick filter selection when global mode is enabled', () => {
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
        freqSelected: new Set<string>(['dataset-freq']),
        txSelected: new Set<string>(['dataset-tx']),
        rxSelected: new Set<string>(['dataset-rx']),
      },
    });

    useSettingFormStore.setState({
      applyQuickFiltersGlobally: true,
      freqSelected: new Set<string>(['shared-freq']),
      txSelected: new Set<string>(['shared-tx']),
      rxSelected: new Set<string>(['shared-rx']),
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

    const settingState = useSettingFormStore.getState();
    expect(settingState.freqSelected).toEqual(new Set<string>(['shared-freq']));
    expect(settingState.txSelected).toEqual(new Set<string>(['shared-tx']));
    expect(settingState.rxSelected).toEqual(new Set<string>(['shared-rx']));
  });

  it('preserves an empty shared filtered view when switching datasets', () => {
    const datasetA = buildDataset({ id: 'A', role: 'primary' });
    const datasetB = buildDataset({
      id: 'B',
      filteredData: [],
      filterSettings: {
        freqSelected: new Set<string>(['missing-freq']),
        txSelected: new Set<string>(['missing-tx']),
        rxSelected: new Set<string>(['missing-rx']),
      },
    });

    useSettingFormStore.setState({
      applyQuickFiltersGlobally: true,
      freqSelected: new Set<string>(['missing-freq']),
      txSelected: new Set<string>(['missing-tx']),
      rxSelected: new Set<string>(['missing-rx']),
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

    expect(useDataTableStore.getState().filteredData).toEqual([]);
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
      freqSelected: new Set<string>(['custom']),
      txSelected: new Set<string>(['custom']),
      rxSelected: new Set<string>(['custom']),
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

describe('useDataTableStore syncQuickFiltersAcrossDatasets', () => {
  it('applies the same quick filters to every dataset', () => {
    const matchingRowA = baseCsemRow;
    const excludedRowA = {
      ...baseCsemRow,
      index: 1,
      Freq_id: '2',
      Freq: 2,
      Tx_id: 2,
      Rx_id: 2,
    };
    const matchingRowB = {
      ...baseCsemRow,
      index: 2,
      Data: 3,
    };
    const excludedRowB = {
      ...baseCsemRow,
      index: 3,
      Freq_id: '3',
      Freq: 3,
      Tx_id: 3,
      Rx_id: 3,
    };

    const datasetA = buildDataset({
      id: 'A',
      role: 'primary',
      data: [matchingRowA, excludedRowA],
    });
    const datasetB = buildDataset({
      id: 'B',
      data: [matchingRowB, excludedRowB],
    });
    const sharedFilterSettings = {
      freqSelected: new Set<string>(['1']),
      txSelected: new Set<string>(['1']),
      rxSelected: new Set<string>(['1']),
    };

    useDataTableStore.setState({
      datasets: new Map([
        ['A', datasetA],
        ['B', datasetB],
      ]),
      primaryDatasetId: 'A',
      activeTableDatasetId: 'A',
      data: datasetA.data,
      tableData: datasetA.data,
      filteredData: datasetA.data,
    });

    useDataTableStore.getState().syncQuickFiltersAcrossDatasets(sharedFilterSettings);

    const state = useDataTableStore.getState();
    expect(state.filteredData).toEqual([matchingRowA]);
    expect(state.datasets.get('A')?.filteredData).toEqual([matchingRowA]);
    expect(state.datasets.get('B')?.filteredData).toEqual([matchingRowB]);
    expect(state.datasets.get('A')?.filterSettings).toEqual(sharedFilterSettings);
    expect(state.datasets.get('B')?.filterSettings).toEqual(sharedFilterSettings);
  });
});
