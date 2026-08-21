import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

import { parseInterfaceFile } from './penaltyCut';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

describe('parseInterfaceFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('converts the viewer bounds from kilometres to metres', async () => {
    // The viewer holds km; the service compares against interface points in m.
    // Sending km straight through makes every point look out of bounds --
    // "124 of 124 points fall outside the model (y -500..600 m)".
    vi.mocked(axios.post).mockResolvedValue({ data: { points: [], bounds: {}, warnings: [] } });

    await parseInterfaceFile(
      new File(['10 2\n'], 'cut.txt'),
      { units: 'km', marker: -1, defaultRho: 10 },
      { minX: -500, maxX: 600, minY: -100, maxY: 1000, width: 1100, height: 1100 },
    );

    const formData = vi.mocked(axios.post).mock.calls[0][1] as FormData;
    const parameters = JSON.parse(String(formData.get('parameters')));

    expect(parameters.modelBounds).toEqual({
      yMin: -500_000,
      yMax: 600_000,
      zMin: -100_000,
      zMax: 1_000_000,
    });
  });

  it('omits the bounds when no model is loaded', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { points: [], bounds: {}, warnings: [] } });

    await parseInterfaceFile(new File(['10 2\n'], 'cut.txt'), {
      units: 'km',
      marker: -1,
      defaultRho: 10,
    });

    const formData = vi.mocked(axios.post).mock.calls[0][1] as FormData;
    expect(JSON.parse(String(formData.get('parameters')))).not.toHaveProperty('modelBounds');
  });
});
