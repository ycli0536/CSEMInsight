import type { CsemData } from '@/types';

const cache = new Map<string, unknown>();
const MAX_CACHE_ENTRIES = 50;

const normalizeValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

const hashString = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

export const computeMisfitDataHash = (data: CsemData[]): string => {
  if (!data || data.length === 0) {
    return 'empty';
  }

  const pieces = data.map((row) => {
    const type = normalizeValue(row.Type);
    const yRx = normalizeValue(row.Y_rx);
    const yTx = normalizeValue(row.Y_tx);
    const freq = normalizeValue(row.Freq_id);
    const residual = normalizeValue(row.Residual);
    return `${type}|${yRx}|${yTx}|${freq}|${residual}`;
  });

  return hashString(pieces.join(';'));
};

export const getMisfitCacheKey = (datasetId: string, data: CsemData[]): string => {
  return `${datasetId}:${computeMisfitDataHash(data)}`;
};

export const getCachedMisfitStats = <T>(key: string): T | null => {
  if (!cache.has(key)) {
    return null;
  }
  return cache.get(key) as T;
};

export const setCachedMisfitStats = <T>(key: string, stats: T): void => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, stats);

  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
};

export const clearMisfitStatsCache = (): void => {
  cache.clear();
};
