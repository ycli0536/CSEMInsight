import { describe, expect, it, beforeEach } from 'vitest';
import type { CsemData } from '@/types';
import {
  clearMisfitStatsCache,
  computeMisfitDataHash,
  getCachedMisfitStats,
  getMisfitCacheKey,
  setCachedMisfitStats,
} from './misfitStatsCache';

const baseData: CsemData[] = [
  {
    Type: '28',
    Y_rx: 1000,
    Y_tx: 0,
    Freq_id: 1,
    Residual: 1.0,
  } as CsemData,
];

describe('misfitStatsCache', () => {
  beforeEach(() => {
    clearMisfitStatsCache();
  });

  it('computes a stable hash for identical data', () => {
    const hash1 = computeMisfitDataHash(baseData);
    const hash2 = computeMisfitDataHash([{ ...baseData[0] } as CsemData]);
    expect(hash1).toBe(hash2);
  });

  it('changes hash when residual changes', () => {
    const hash1 = computeMisfitDataHash(baseData);
    const hash2 = computeMisfitDataHash([
      {
        ...baseData[0],
        Residual: 2.0,
      } as CsemData,
    ]);
    expect(hash1).not.toBe(hash2);
  });

  it('caches and retrieves stats by key', () => {
    const key = getMisfitCacheKey('dataset-1', baseData);
    const stats = { byRx: { amplitude: [], phase: [] } } as const;
    expect(getCachedMisfitStats<typeof stats>(key)).toBeNull();
    setCachedMisfitStats(key, stats);
    expect(getCachedMisfitStats<typeof stats>(key)).toEqual(stats);
  });

  it('evicts the oldest entry when cache exceeds max size', () => {
    const firstKey = getMisfitCacheKey('dataset-1', baseData);
    setCachedMisfitStats(firstKey, { value: 1 });

    for (let i = 0; i < 50; i += 1) {
      const key = getMisfitCacheKey(`dataset-${i + 2}`, [
        {
          ...baseData[0],
          Residual: i + 2,
        } as CsemData,
      ]);
      setCachedMisfitStats(key, { value: i + 2 });
    }

    expect(getCachedMisfitStats(firstKey)).toBeNull();
  });
});
