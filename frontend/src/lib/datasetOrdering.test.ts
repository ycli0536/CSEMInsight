import { describe, expect, it } from 'vitest';
import { orderIdsByPrimaryLast } from './datasetOrdering';

describe('orderIdsByPrimaryLast', () => {
  it('moves primary id to the end while preserving order', () => {
    const ids = ['a', 'b', 'c'];

    const result = orderIdsByPrimaryLast(ids, 'b');

    expect(result).toEqual(['a', 'c', 'b']);
  });

  it('moves primary from first to end', () => {
    const ids = ['a', 'b', 'c'];

    const result = orderIdsByPrimaryLast(ids, 'a');

    expect(result).toEqual(['b', 'c', 'a']);
  });

  it('returns original order when primary is already last', () => {
    const ids = ['a', 'b', 'c'];

    const result = orderIdsByPrimaryLast(ids, 'c');

    expect(result).toBe(ids);
  });

  it('returns original order when primary is missing', () => {
    const ids = ['a', 'b', 'c'];

    const result = orderIdsByPrimaryLast(ids, 'd');

    expect(result).toBe(ids);
  });

  it('returns original order when primary is null', () => {
    const ids = ['a', 'b', 'c'];

    const result = orderIdsByPrimaryLast(ids, null);

    expect(result).toBe(ids);
  });
});
