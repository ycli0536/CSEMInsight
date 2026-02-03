import type { CsemData, Dataset, GeometryData, TxData, RxData } from '@/types';

/**
 * Creates a mock CsemData row for testing
 */
export const createMockCsemData = (overrides: Partial<CsemData> = {}): CsemData => ({
  index: 0,
  Type: '28',
  Freq_id: '1',
  Freq: 0.25,
  Tx_id: 1,
  Rx_id: 1,
  Data: 1.5e-12,
  StdError: 0.05,
  X_rx: 1000,
  Y_rx: 2000,
  Lon_rx: -122.5,
  Lat_rx: 37.5,
  Z_rx: -1500,
  Theta: 0,
  Alpha: 0,
  Beta: 0,
  Length_rx: 100,
  Name_rx: 'RX01',
  X_tx: 500,
  Y_tx: 1500,
  Lon_tx: -122.6,
  Lat_tx: 37.4,
  Z_tx: -50,
  Azimuth: 45,
  Dip: 0,
  Length_tx: 200,
  Type_tx: 'HED',
  Name_tx: 'TX01',
  offset: 500,
  distance: 707,
  ...overrides,
});

/**
 * Creates a mock TxData for testing
 */
export const createMockTxData = (overrides: Partial<TxData> = {}): TxData => ({
  Tx_id: 1,
  X_tx: 500,
  Y_tx: 1500,
  Lon_tx: -122.6,
  Lat_tx: 37.4,
  Z_tx: -50,
  Azimuth: 45,
  Dip: 0,
  Length_tx: 200,
  Type_tx: 'HED',
  Name_tx: 'TX01',
  ...overrides,
});

/**
 * Creates a mock RxData for testing
 */
export const createMockRxData = (overrides: Partial<RxData> = {}): RxData => ({
  Rx_id: 1,
  X_rx: 1000,
  Y_rx: 2000,
  Lon_rx: -122.5,
  Lat_rx: 37.5,
  Z_rx: -1500,
  Theta: 0,
  Alpha: 0,
  Beta: 0,
  Length_rx: 100,
  Name_rx: 'RX01',
  ...overrides,
});

/**
 * Creates a mock GeometryData for testing
 */
export const createMockGeometryInfo = (overrides: Partial<GeometryData> = {}): GeometryData => ({
  UTM_zone: 10,
  Hemisphere: 'N',
  North: 4150000,
  East: 500000,
  Strike: 45,
  ...overrides,
});

/**
 * Creates a mock Dataset for testing
 */
export const createMockDataset = (overrides: Partial<Dataset> = {}): Dataset => {
  const data = [
    createMockCsemData({ index: 0, Freq: 0.25, Tx_id: 1, Rx_id: 1 }),
    createMockCsemData({ index: 1, Freq: 0.25, Tx_id: 1, Rx_id: 2, Y_rx: 2500 }),
    createMockCsemData({ index: 2, Freq: 1.0, Tx_id: 1, Rx_id: 1, Freq_id: '2' }),
    createMockCsemData({ index: 3, Freq: 1.0, Tx_id: 2, Rx_id: 1, Freq_id: '2', Tx_id: 2 }),
  ];

  const txData = [
    createMockTxData({ Tx_id: 1 }),
    createMockTxData({ Tx_id: 2, X_tx: 1000, Y_tx: 2000 }),
  ];

  const rxData = [
    createMockRxData({ Rx_id: 1 }),
    createMockRxData({ Rx_id: 2, Y_rx: 2500 }),
  ];

  return {
    id: 'test-dataset-1',
    name: 'test_data.data',
    data,
    txData,
    rxData,
    geometryInfo: createMockGeometryInfo(),
    dataBlocks: [],
    color: '#2563eb',
    visible: true,
    role: 'primary',
    uploadTime: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
};

/**
 * Creates a mock API response for sample data loading
 */
export const createMockApiResponse = (
  filename: string,
  datasetId = 'test-id',
) => {
  const mockData = [
    createMockCsemData({ index: 0 }),
    createMockCsemData({ index: 1, Rx_id: 2 }),
  ];

  return {
    id: datasetId,
    name: filename,
    geometryInfo: createMockGeometryInfo(),
    data: JSON.stringify({ data: mockData }),
    dataBlocks: [],
  };
};

/**
 * Creates multiple mock datasets for multi-file scenarios
 */
export const createMockMultipleDatasets = (count: number): Dataset[] => {
  const colors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#d97706'];
  
  return Array.from({ length: count }, (_, i) => 
    createMockDataset({
      id: `dataset-${i + 1}`,
      name: `test_file_${i + 1}.data`,
      color: colors[i % colors.length],
      role: i === 0 ? 'primary' : 'compared',
    })
  );
};
