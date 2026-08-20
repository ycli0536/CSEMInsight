/**
 * Turns backend failures into messages a user can act on.
 *
 * The Flask backend answers errors with `{ error, hint }` (plus `detail` and,
 * in debug mode, `traceback`). These helpers surface the actionable parts and
 * keep every call site from re-implementing the same unwrapping.
 */

import { getApiBaseUrl } from '@/lib/apiConfig';

/**
 * Message for a backend that never answered.
 *
 * Built on demand rather than fixed, because the desktop shell picks the port
 * per window — naming the address the app actually tried is what makes this
 * message actionable.
 */
export const backendUnreachableMessage = (): string =>
  `Could not reach the CSEMInsight backend at ${getApiBaseUrl()}. Make sure it is running, then try again.`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/**
 * Format a parsed JSON error body into a single displayable string.
 *
 * @param payload - The response body, already parsed.
 * @param fallback - Message to use when the body carries no usable error.
 */
export const formatApiError = (payload: unknown, fallback: string): string => {
  if (!isRecord(payload)) {
    return fallback;
  }

  const message = asString(payload.error);
  if (message === null) {
    return fallback;
  }

  const hint = asString(payload.hint);
  return hint === null ? message : `${message}\n\n${hint}`;
};

/**
 * Format a thrown value (axios rejection, fetch failure, or plain Error).
 *
 * @param error - The caught value.
 * @param fallback - Message to use when nothing more specific is available.
 */
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (isRecord(error) && isRecord(error.response)) {
    const formatted = formatApiError(error.response.data, '');
    if (formatted !== '') {
      return formatted;
    }
  }

  // Axios sets `request` without `response` when the server never answered —
  // in practice, the Flask sidecar is not running.
  if (isRecord(error) && 'request' in error && !isRecord(error.response)) {
    return backendUnreachableMessage();
  }

  // `fetch` rejects with a TypeError when the connection itself fails, and
  // "Failed to fetch" tells the user nothing useful.
  if (error instanceof TypeError) {
    return backendUnreachableMessage();
  }

  if (error instanceof Error) {
    return asString(error.message) ?? fallback;
  }

  return fallback;
};

/**
 * Read a failed `fetch` response and format it, tolerating non-JSON bodies.
 *
 * @param response - The non-ok response.
 * @param fallback - Message to use when the body carries no usable error.
 */
export const getFetchErrorMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  try {
    return formatApiError(await response.json(), fallback);
  } catch {
    return fallback;
  }
};
