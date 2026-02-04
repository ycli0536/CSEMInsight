import { describe, it, expect } from 'vitest';
import { generateMisfitStatsMockData } from './misfitStatsMock';

describe('misfitStatsMock', () => {
  it('generates mock data with correct structure', () => {
    const data = generateMisfitStatsMockData();

    expect(data).toHaveProperty('byRx');
    expect(data).toHaveProperty('byTx');
    expect(data).toHaveProperty('byRange');
    expect(data).toHaveProperty('byFreq');
  });

  it('generates amplitude and phase data for each grouping', () => {
    const data = generateMisfitStatsMockData();

    const groupings = [
      data.byRx,
      data.byTx,
      data.byRange,
      data.byFreq,
    ];

    groupings.forEach((group) => {
      expect(group).toHaveProperty('amplitude');
      expect(group).toHaveProperty('phase');
      expect(Array.isArray(group.amplitude)).toBe(true);
      expect(Array.isArray(group.phase)).toBe(true);
    });
  });

  it('generates non-empty arrays for plotting', () => {
    const data = generateMisfitStatsMockData();

    expect(data.byRx.amplitude.length).toBeGreaterThan(0);
    expect(data.byRx.phase.length).toBeGreaterThan(0);
    expect(data.byTx.amplitude.length).toBeGreaterThan(0);
    expect(data.byTx.phase.length).toBeGreaterThan(0);
    expect(data.byRange.amplitude.length).toBeGreaterThan(0);
    expect(data.byRange.phase.length).toBeGreaterThan(0);
    expect(data.byFreq.amplitude.length).toBeGreaterThan(0);
    expect(data.byFreq.phase.length).toBeGreaterThan(0);
  });

  it('generates data with correct field names for byRx', () => {
    const data = generateMisfitStatsMockData();

    data.byRx.amplitude.forEach((point) => {
      expect(point).toHaveProperty('Y_rx_km');
      expect(point).toHaveProperty('RMS');
      expect(typeof point.Y_rx_km).toBe('number');
      expect(typeof point.RMS).toBe('number');
    });

    data.byRx.phase.forEach((point) => {
      expect(point).toHaveProperty('Y_rx_km');
      expect(point).toHaveProperty('RMS');
      expect(typeof point.Y_rx_km).toBe('number');
      expect(typeof point.RMS).toBe('number');
    });
  });

  it('generates data with correct field names for byTx', () => {
    const data = generateMisfitStatsMockData();

    data.byTx.amplitude.forEach((point) => {
      expect(point).toHaveProperty('Y_tx_km');
      expect(point).toHaveProperty('RMS');
      expect(typeof point.Y_tx_km).toBe('number');
      expect(typeof point.RMS).toBe('number');
    });

    data.byTx.phase.forEach((point) => {
      expect(point).toHaveProperty('Y_tx_km');
      expect(point).toHaveProperty('RMS');
      expect(typeof point.Y_tx_km).toBe('number');
      expect(typeof point.RMS).toBe('number');
    });
  });

  it('generates data with correct field names for byRange', () => {
    const data = generateMisfitStatsMockData();

    data.byRange.amplitude.forEach((point) => {
      expect(point).toHaveProperty('Y_range_km');
      expect(point).toHaveProperty('RMS');
      expect(typeof point.Y_range_km).toBe('number');
      expect(typeof point.RMS).toBe('number');
    });

    data.byRange.phase.forEach((point) => {
      expect(point).toHaveProperty('Y_range_km');
      expect(point).toHaveProperty('RMS');
      expect(typeof point.Y_range_km).toBe('number');
      expect(typeof point.RMS).toBe('number');
    });
  });

  it('generates data with correct field names for byFreq', () => {
    const data = generateMisfitStatsMockData();

    data.byFreq.amplitude.forEach((point) => {
      expect(point).toHaveProperty('Freq_id');
      expect(point).toHaveProperty('RMS');
      expect(typeof point.Freq_id).toBe('number');
      expect(typeof point.RMS).toBe('number');
    });

    data.byFreq.phase.forEach((point) => {
      expect(point).toHaveProperty('Freq_id');
      expect(point).toHaveProperty('RMS');
      expect(typeof point.Freq_id).toBe('number');
      expect(typeof point.RMS).toBe('number');
    });
  });

  it('generates RMS values as numbers', () => {
    const data = generateMisfitStatsMockData();

    const allDataPoints = [
      ...data.byRx.amplitude,
      ...data.byRx.phase,
      ...data.byTx.amplitude,
      ...data.byTx.phase,
      ...data.byRange.amplitude,
      ...data.byRange.phase,
      ...data.byFreq.amplitude,
      ...data.byFreq.phase,
    ];

    allDataPoints.forEach((point) => {
      expect(typeof point.RMS).toBe('number');
      expect(Number.isFinite(point.RMS)).toBe(true);
    });
  });
});
