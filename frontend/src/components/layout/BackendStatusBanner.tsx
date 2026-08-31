import { Loader2 } from 'lucide-react';

import { useBackendStatus } from '@/hooks/useBackendStatus';
import { getApiBaseUrl } from '@/lib/apiConfig';

/** Waits this long before suggesting the delay is not a normal startup. */
const LONG_WAIT_SECONDS = 45;

/**
 * Slim, non-blocking banner shown while the backend is still starting.
 *
 * Renders nothing in demo mode, before the first probe answers, and once the
 * backend is up — so the common case (a warm launch, backend ready within a
 * couple of seconds) shows it only briefly, and a dev-server session with the
 * backend already running never shows it at all.
 */
export function BackendStatusBanner() {
  const { status, waitedSeconds } = useBackendStatus();

  if (status !== 'waiting') {
    return null;
  }

  const isLongWait = waitedSeconds >= LONG_WAIT_SECONDS;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>
        Connecting to the CSEMInsight backend… ({Math.round(waitedSeconds)}s)
      </span>
      {isLongWait && (
        <span className="text-amber-700 dark:text-amber-300">
          The first launch after installing can take half a minute. If this is
          not a first launch, the backend at {getApiBaseUrl()} may have failed
          to start.
        </span>
      )}
    </div>
  );
}
