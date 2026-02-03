/**
 * Integration tests for dataset loading and management flow.
 * Tests the interaction between API responses and store updates.
 */
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import { useDataTableStore, useSettingFormStore } from '@/store/settingFormStore';
import { createMockDataset, createMockApiResponse, createMockGeometryInfo } from '@/test/mocks';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('Dataset Loading Integration', () => {
  beforeEach(() => {
    // Reset stores before each test
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
      dataBlocks: [],
      filterModel: null,
      geometryInfo: { UTM_zone: 0, Hemisphere: 'N', North: 0, East: 0, Strike: 0 },
      isTxDepthAdjusted: false,
      datasets: new Map(),
      primaryDatasetId: null,
      comparedDatasetIds: [],
      activeDatasetIds: [],
      activeTableDatasetId: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addDataset', () => {
    it('should add first dataset as primary', () => {
      const dataset = createMockDataset({ id: 'first', name: 'first.data' });

      useDataTableStore.getState().addDataset(dataset);

      const state = useDataTableStore.getState();
      expect(state.datasets.size).toBe(1);
      expect(state.primaryDatasetId).toBe('first');
      expect(state.comparedDatasetIds).toEqual([]);
      expect(state.datasets.get('first')?.role).toBe('primary');
    });

    it('should add subsequent datasets as compared', () => {
      const dataset1 = createMockDataset({ id: 'first', name: 'first.data' });
      const dataset2 = createMockDataset({ id: 'second', name: 'second.data' });

      useDataTableStore.getState().addDataset(dataset1);
      useDataTableStore.getState().addDataset(dataset2);

      const state = useDataTableStore.getState();
      expect(state.datasets.size).toBe(2);
      expect(state.primaryDatasetId).toBe('first');
      expect(state.comparedDatasetIds).toContain('second');
      expect(state.datasets.get('second')?.role).toBe('compared');
    });

    it('should preserve dataset color when adding', () => {
      const dataset = createMockDataset({ id: 'test', color: '#ff0000' });

      useDataTableStore.getState().addDataset(dataset);

      const stored = useDataTableStore.getState().datasets.get('test');
      expect(stored?.color).toBe('#ff0000');
    });
  });

  describe('setPrimaryDataset', () => {
    it('should switch primary dataset and demote old primary to compared', () => {
      const dataset1 = createMockDataset({ id: 'first' });
      const dataset2 = createMockDataset({ id: 'second' });

      const store = useDataTableStore.getState();
      store.addDataset(dataset1);
      store.addDataset(dataset2);
      store.setPrimaryDataset('second');

      const state = useDataTableStore.getState();
      expect(state.primaryDatasetId).toBe('second');
      expect(state.comparedDatasetIds).toContain('first');
      expect(state.datasets.get('second')?.role).toBe('primary');
      expect(state.datasets.get('first')?.role).toBe('compared');
    });

    it('should update data arrays when switching primary', () => {
      const dataset1 = createMockDataset({ id: 'first' });
      const dataset2 = createMockDataset({ id: 'second', data: [{ ...dataset1.data[0], Data: 999 }] });

      const store = useDataTableStore.getState();
      store.addDataset(dataset1);
      store.addDataset(dataset2);
      store.setPrimaryDataset('second');

      const state = useDataTableStore.getState();
      expect(state.data).toEqual(dataset2.data);
      expect(state.tableData).toEqual(dataset2.data);
    });

    it('should restore filter settings when switching to dataset with saved filters', () => {
      const dataset1 = createMockDataset({ id: 'first' });
      const dataset2 = createMockDataset({
        id: 'second',
        filterSettings: {
          freqSelected: new Set(['1']),
          txSelected: new Set(['1']),
          rxSelected: new Set(['1', '2']),
        },
      });

      const store = useDataTableStore.getState();
      store.addDataset(dataset1);
      store.addDataset(dataset2);
      store.setPrimaryDataset('second');

      const settingState = useSettingFormStore.getState();
      expect(settingState.freqSelected).toEqual(new Set(['1']));
      expect(settingState.txSelected).toEqual(new Set(['1']));
      expect(settingState.rxSelected).toEqual(new Set(['1', '2']));
    });
  });

  describe('removeDataset', () => {
    it('should remove dataset and promote next compared to primary', () => {
      const dataset1 = createMockDataset({ id: 'first' });
      const dataset2 = createMockDataset({ id: 'second' });

      const store = useDataTableStore.getState();
      store.addDataset(dataset1);
      store.addDataset(dataset2);
      store.removeDataset('first');

      const state = useDataTableStore.getState();
      expect(state.datasets.size).toBe(1);
      expect(state.primaryDatasetId).toBe('second');
      expect(state.datasets.get('second')?.role).toBe('primary');
    });

    it('should clear all data when removing last dataset', () => {
      const dataset = createMockDataset({ id: 'only' });

      const store = useDataTableStore.getState();
      store.addDataset(dataset);
      store.setPrimaryDataset('only');
      store.removeDataset('only');

      const state = useDataTableStore.getState();
      expect(state.datasets.size).toBe(0);
      expect(state.primaryDatasetId).toBeNull();
      expect(state.data).toEqual([]);
      expect(state.tableData).toEqual([]);
    });

    it('should remove from compared list when removing compared dataset', () => {
      const dataset1 = createMockDataset({ id: 'first' });
      const dataset2 = createMockDataset({ id: 'second' });
      const dataset3 = createMockDataset({ id: 'third' });

      const store = useDataTableStore.getState();
      store.addDataset(dataset1);
      store.addDataset(dataset2);
      store.addDataset(dataset3);
      store.removeDataset('second');

      const state = useDataTableStore.getState();
      expect(state.comparedDatasetIds).not.toContain('second');
      expect(state.comparedDatasetIds).toContain('third');
    });
  });

  describe('updateDataset', () => {
    it('should update dataset properties', () => {
      const dataset = createMockDataset({ id: 'test', name: 'original.data' });

      const store = useDataTableStore.getState();
      store.addDataset(dataset);
      store.updateDataset('test', { name: 'updated.data', color: '#00ff00' });

      const updated = useDataTableStore.getState().datasets.get('test');
      expect(updated?.name).toBe('updated.data');
      expect(updated?.color).toBe('#00ff00');
    });

    it('should not modify other datasets', () => {
      const dataset1 = createMockDataset({ id: 'first', color: '#ff0000' });
      const dataset2 = createMockDataset({ id: 'second', color: '#0000ff' });

      const store = useDataTableStore.getState();
      store.addDataset(dataset1);
      store.addDataset(dataset2);
      store.updateDataset('first', { color: '#00ff00' });

      const state = useDataTableStore.getState();
      expect(state.datasets.get('second')?.color).toBe('#0000ff');
    });
  });

  describe('comparison management', () => {
    it('should add dataset to compared list', () => {
      const dataset1 = createMockDataset({ id: 'first' });
      const dataset2 = createMockDataset({ id: 'second' });

      const store = useDataTableStore.getState();
      store.addDataset(dataset1);
      store.addDataset(dataset2);
      store.removeFromCompared('second');
      store.addToCompared('second');

      const state = useDataTableStore.getState();
      expect(state.comparedDatasetIds).toContain('second');
      expect(state.datasets.get('second')?.visible).toBe(true);
    });

    it('should remove dataset from compared list', () => {
      const dataset1 = createMockDataset({ id: 'first' });
      const dataset2 = createMockDataset({ id: 'second' });

      const store = useDataTableStore.getState();
      store.addDataset(dataset1);
      store.addDataset(dataset2);
      store.removeFromCompared('second');

      const state = useDataTableStore.getState();
      expect(state.comparedDatasetIds).not.toContain('second');
      expect(state.datasets.get('second')?.visible).toBe(false);
    });

    it('should set comparison mode', () => {
      useDataTableStore.getState().setComparisonMode('difference');

      expect(useDataTableStore.getState().comparisonMode).toBe('difference');
    });
  });

  describe('filter management', () => {
    it('should update dataset filter and store filtered data', () => {
      const dataset = createMockDataset({ id: 'test' });
      const filteredData = [dataset.data[0]];
      const filterSettings = {
        freqSelected: new Set(['1']),
        txSelected: 'all' as const,
        rxSelected: 'all' as const,
      };

      const store = useDataTableStore.getState();
      store.addDataset(dataset);
      store.updateDatasetFilter('test', filteredData, filterSettings);

      const updated = useDataTableStore.getState().datasets.get('test');
      expect(updated?.filteredData).toEqual(filteredData);
      expect(updated?.filterSettings).toEqual(filterSettings);
    });

    it('should reset all filters', () => {
      useSettingFormStore.setState({
        freqSelected: new Set(['1']),
        txSelected: new Set(['2']),
        rxSelected: new Set(['3']),
        resetColumnFilters: false,
      });

      useDataTableStore.setState({
        filterModel: { field: { filterType: 'text' } },
      });

      useDataTableStore.getState().resetAllFilters();

      const dataState = useDataTableStore.getState();
      const settingState = useSettingFormStore.getState();

      expect(dataState.filterModel).toBeNull();
      expect(settingState.freqSelected).toBe('all');
      expect(settingState.txSelected).toBe('all');
      expect(settingState.rxSelected).toBe('all');
      expect(settingState.resetColumnFilters).toBe(true);
    });
  });
});

describe('API Integration Mocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    useDataTableStore.setState({
      datasets: new Map(),
      primaryDatasetId: null,
      comparedDatasetIds: [],
    });
  });

  it('should mock axios POST for load-sample-data', async () => {
    const mockResponse = {
      data: [createMockApiResponse('test.data', 'test-id-1')],
    };
    mockedAxios.post.mockResolvedValueOnce(mockResponse);

    const result = await axios.post('http://127.0.0.1:3354/api/load-sample-data', {
      files: ['test.data'],
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://127.0.0.1:3354/api/load-sample-data',
      { files: ['test.data'] }
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('test.data');
  });

  it('should mock axios POST for upload-multiple-data', async () => {
    const mockResponse = {
      data: [
        createMockApiResponse('file1.data', 'id-1'),
        createMockApiResponse('file2.data', 'id-2'),
      ],
    };
    mockedAxios.post.mockResolvedValueOnce(mockResponse);

    const formData = new FormData();
    // Note: In test environment, we just verify the call shape
    const result = await axios.post('http://127.0.0.1:3354/api/upload-multiple-data', formData);

    expect(mockedAxios.post).toHaveBeenCalled();
    expect(result.data).toHaveLength(2);
  });

  it('should handle API error gracefully', async () => {
    const errorResponse = {
      response: {
        status: 400,
        data: { error: 'Invalid file format' },
      },
    };
    mockedAxios.post.mockRejectedValueOnce(errorResponse);

    await expect(
      axios.post('http://127.0.0.1:3354/api/load-sample-data', { files: ['bad.txt'] })
    ).rejects.toEqual(errorResponse);
  });
});
