import { describe, expect, it } from 'vitest';

import { BACKEND_UNREACHABLE_MESSAGE, formatApiError, getApiErrorMessage } from './apiError';

describe('formatApiError', () => {
  it('returns the backend error message', () => {
    const result = formatApiError({ error: 'Invalid file format: a.txt.' }, 'fallback');

    expect(result).toBe('Invalid file format: a.txt.');
  });

  it('appends the backend hint on its own line', () => {
    const result = formatApiError(
      { error: 'Invalid file format: a.txt.', hint: 'Supported formats: .data.' },
      'fallback',
    );

    expect(result).toContain('Invalid file format: a.txt.');
    expect(result).toContain('Supported formats: .data.');
    expect(result.indexOf('Supported')).toBeGreaterThan(result.indexOf('Invalid'));
  });

  it('falls back when the payload has no error field', () => {
    expect(formatApiError({}, 'fallback')).toBe('fallback');
    expect(formatApiError(null, 'fallback')).toBe('fallback');
    expect(formatApiError('<html>500</html>', 'fallback')).toBe('fallback');
  });

  it('ignores non-string error and hint values', () => {
    expect(formatApiError({ error: 42 }, 'fallback')).toBe('fallback');
    expect(formatApiError({ error: 'boom', hint: 42 }, 'fallback')).toBe('boom');
  });
});

describe('getApiErrorMessage', () => {
  it('unwraps an axios error payload', () => {
    const error = {
      response: { data: { error: 'Could not parse file.', hint: 'Check the header.' } },
    };

    const result = getApiErrorMessage(error, 'fallback');

    expect(result).toContain('Could not parse file.');
    expect(result).toContain('Check the header.');
  });

  it('reports an unreachable backend when there is no response', () => {
    const error = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      request: {},
    });

    expect(getApiErrorMessage(error, 'fallback')).toBe(BACKEND_UNREACHABLE_MESSAGE);
  });

  it('reports an unreachable backend when fetch rejects with a TypeError', () => {
    const error = new TypeError('Failed to fetch');

    expect(getApiErrorMessage(error, 'fallback')).toBe(BACKEND_UNREACHABLE_MESSAGE);
  });

  it('uses the message of a plain Error', () => {
    expect(getApiErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('falls back for unknown values', () => {
    expect(getApiErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(getApiErrorMessage('oops', 'fallback')).toBe('fallback');
  });

  it('prefers the backend payload over the axios message', () => {
    const error = Object.assign(new Error('Request failed with status code 500'), {
      isAxiosError: true,
      response: { data: { error: 'Could not rebuild the data file.' } },
    });

    expect(getApiErrorMessage(error, 'fallback')).toBe('Could not rebuild the data file.');
  });
});
