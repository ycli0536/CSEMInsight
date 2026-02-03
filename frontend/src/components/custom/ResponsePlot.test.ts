import { describe, expect, it } from 'vitest';

import type { CsemData, Dataset } from '@/types';
import { computeDifferenceData } from '@/services/extractComparisonData';
import {
  buildOverlayDatasets,
  hasModelResponseData,
  hasResidualResponseData,
  resolveReferenceDataset,
} from './responsePlot.utils';

const baseRow: CsemData = {
  index: 0,
  Type: '28',
  Freq_id: '1',
  Freq: 1,
  Tx_id: 1,
  Rx_id: 1,
  Data: 10,
  StdError: 0.5,
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

const makeDataset = (id: string, dataValue: number): Dataset => ({
  id,
  name: id,
  data: [{ ...baseRow, Data: dataValue }],
  txData: [],
  rxData: [],
  geometryInfo: { UTM_zone: 0, Hemisphere: 'N', North: 0, East: 0, Strike: 0 },
  dataBlocks: {},
  color: '#000',
  visible: true,
  role: 'compared',
  uploadTime: new Date(),
});

describe('resolveReferenceDataset', () => {
  it('uses requested reference dataset when available', () => {
    const datasets = [makeDataset('A', 10), makeDataset('B', 5)];

    const reference = resolveReferenceDataset(datasets, 'B');

    expect(reference?.id).toBe('B');
  });

  it('falls back to first dataset when no reference id', () => {
    const datasets = [makeDataset('A', 10), makeDataset('B', 5)];

    const reference = resolveReferenceDataset(datasets, null);

    expect(reference?.id).toBe('A');
  });
});

describe('buildOverlayDatasets', () => {
  it('returns active datasets in overlay mode', () => {
    const datasets = [makeDataset('A', 10), makeDataset('B', 5)];

    const result = buildOverlayDatasets('overlay', datasets, datasets[0]);

    expect(result).toEqual(datasets);
  });

  it('returns difference datasets when in difference mode', () => {
    const reference = makeDataset('A', 10);
    const target = makeDataset('B', 5);

    const result = buildOverlayDatasets('difference', [reference, target], reference);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Delta: A - B');
    expect(result[0].data).toEqual(computeDifferenceData(reference.data, target.data));
  });
});

describe('response plot data availability', () => {
  it('detects model response data', () => {
    const base = makeDataset('A', 10);
    const withResponse = {
      ...base,
      data: [{ ...base.data[0], Response: 12 }],
    };

    expect(hasModelResponseData([base])).toBe(false);
    expect(hasModelResponseData([withResponse])).toBe(true);
  });

  it('detects residual data', () => {
    const base = makeDataset('A', 10);
    const withResidual = {
      ...base,
      data: [{ ...base.data[0], Residual: 0.5 }],
    };

    expect(hasResidualResponseData([base])).toBe(false);
    expect(hasResidualResponseData([withResidual])).toBe(true);
  });
});
