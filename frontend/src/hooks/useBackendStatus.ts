import { useEffect, useState } from 'react';

import { apiUrl } from '@/lib/apiConfig';

export type BackendStatus = 'checking' | 'waiting' | 'ready';

const POLL_INTERVAL_MS = 1000;

/**
 * Polls the backend's health endpoint until it answers.
 *
 * Exists for the desktop app's startup window: the packaged backend needs a
 * couple of seconds on a warm launch and ~20s on the first launch after an
 * install, and during that window every API call fails with "could not reach
 * the backend" — which reads as broken, not starting. Polling stops for good
 * once the backend answers; a backend dying later is reported by the failing
 * call itself.
 *
 * @returns The current status and how many seconds have been spent waiting.
 */
export function useBackendStatus(): { status: BackendStatus; waitedSeconds: number } {
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  const [status, setStatus] = useState<BackendStatus>(isDemoMode ? 'ready' : 'checking');
  const [waitedSeconds, setWaitedSeconds] = useState(0);

  useEffect(() => {
    if (isDemoMode) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const probe = async () => {
      try {
        const response = await fetch(apiUrl('/api/health'));
        if (cancelled) return;
        if (response.ok) {
          setStatus('ready');
          return;
        }
      } catch {
        // Connection refused: the backend is not up yet.
      }
      if (cancelled) return;
      setStatus('waiting');
      setWaitedSeconds((seconds) => seconds + POLL_INTERVAL_MS / 1000);
      timer = setTimeout(probe, POLL_INTERVAL_MS);
    };

    probe();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [isDemoMode]);

  return { status, waitedSeconds };
}
