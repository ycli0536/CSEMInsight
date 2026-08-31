// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

import { BackendStatusBanner } from '@/components/layout/BackendStatusBanner';

const okResponse = { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
const refused = () => Promise.reject(new TypeError('Failed to fetch'));

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('BackendStatusBanner', () => {
  it('renders nothing when the backend answers immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<BackendStatusBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('shows a connecting banner while the backend is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(refused));

    const { container } = render(<BackendStatusBanner />);

    await waitFor(() => {
      expect(container.textContent).toContain('Connecting to the CSEMInsight backend');
    });
  });

  it('clears the banner once the backend comes up', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(refused)
      .mockResolvedValue(okResponse);
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<BackendStatusBanner />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(container.textContent).toContain('Connecting to the CSEMInsight backend');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(container.textContent).toBe('');
  });

  it('explains the first-launch wait once it drags on', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(refused));

    const { container } = render(<BackendStatusBanner />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(46_000);
    });

    expect(container.textContent).toContain('first launch after installing');
  });

  it('stays quiet in demo mode, which has no backend at all', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<BackendStatusBanner />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('stops polling after the backend is ready', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    vi.stubGlobal('fetch', fetchMock);

    render(<BackendStatusBanner />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
