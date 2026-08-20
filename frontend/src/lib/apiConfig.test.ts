// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

/** Import a fresh copy so the module-level base URL does not leak between tests. */
const loadModule = async () => {
  vi.resetModules();
  return import('./apiConfig');
};

const setTauri = (present: boolean) => {
  if (present) {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
};

beforeEach(() => {
  invokeMock.mockReset();
  setTauri(false);
  vi.stubEnv('VITE_API_BASE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  setTauri(false);
});

describe('in the browser', () => {
  it('defaults to the documented loopback port', async () => {
    const { getApiBaseUrl } = await loadModule();

    expect(getApiBaseUrl()).toBe('http://127.0.0.1:3354');
  });

  it('honours VITE_API_BASE_URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:9999');
    const { getApiBaseUrl, initApiBaseUrl } = await loadModule();

    await initApiBaseUrl();

    expect(getApiBaseUrl()).toBe('http://127.0.0.1:9999');
  });

  it('strips a trailing slash so paths do not double up', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:9999/');
    const { apiUrl, initApiBaseUrl } = await loadModule();

    await initApiBaseUrl();

    expect(apiUrl('/api/upload-data')).toBe('http://127.0.0.1:9999/api/upload-data');
  });

  it('never asks Tauri for a port', async () => {
    const { initApiBaseUrl } = await loadModule();

    await initApiBaseUrl();

    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('in the desktop app', () => {
  beforeEach(() => {
    setTauri(true);
  });

  it('uses the port the shell reserved for this window', async () => {
    invokeMock.mockResolvedValue(51234);
    const { getApiBaseUrl, initApiBaseUrl } = await loadModule();

    await initApiBaseUrl();

    expect(invokeMock).toHaveBeenCalledWith('get_api_port');
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:51234');
  });

  it('falls back to the default port when the backend never started', async () => {
    invokeMock.mockRejectedValue(new Error('The backend process is not running.'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getApiBaseUrl, initApiBaseUrl } = await loadModule();

    await initApiBaseUrl();

    expect(getApiBaseUrl()).toBe('http://127.0.0.1:3354');
  });
});

describe('apiUrl', () => {
  it('accepts paths with or without a leading slash', async () => {
    const { apiUrl } = await loadModule();

    expect(apiUrl('/api/misfit_stats')).toBe('http://127.0.0.1:3354/api/misfit_stats');
    expect(apiUrl('api/misfit_stats')).toBe('http://127.0.0.1:3354/api/misfit_stats');
  });
});
