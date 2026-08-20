/**
 * Resolves the backend's base URL for every API call in the app.
 *
 * The port is not fixed. The desktop shell reserves one per window so a second
 * instance of the app does not collide with the first, and tells the frontend
 * which one it picked. In the browser the port comes from VITE_API_BASE_URL or
 * falls back to the documented default.
 */

const DEFAULT_PORT = 3354;

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const configuredBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  return typeof configured === 'string' && configured.trim() !== ''
    ? stripTrailingSlash(configured.trim())
    : `http://127.0.0.1:${DEFAULT_PORT}`;
};

/** Whether the app is running inside the Tauri desktop shell. */
export const isTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Usable before initApiBaseUrl() resolves, so a call that races startup still
// hits the default rather than an undefined host.
let baseUrl = configuredBaseUrl();

/**
 * Resolve the backend base URL once, at startup.
 *
 * Falls back to the default when the desktop shell cannot report a port, which
 * happens when the backend failed to start. Callers then get a connection
 * error they can show, instead of the app hanging on an unresolved URL.
 */
export const initApiBaseUrl = async (): Promise<string> => {
  if (!isTauriRuntime()) {
    baseUrl = configuredBaseUrl();
    return baseUrl;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const port = await invoke<number>('get_api_port');
    baseUrl = `http://127.0.0.1:${port}`;
  } catch (error) {
    console.error('[api] Could not determine the backend port:', error);
    baseUrl = configuredBaseUrl();
  }

  return baseUrl;
};

/** Current backend base URL, without a trailing slash. */
export const getApiBaseUrl = (): string => baseUrl;

/**
 * Build an absolute API URL.
 *
 * @param path - Path such as `/api/upload-data`, with or without the slash.
 */
export const apiUrl = (path: string): string =>
  `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
