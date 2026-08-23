import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyRhoBounds, previewRhoBounds } from './rhoBounds';
import type { RhoBoundParameters } from '@/types';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

const PARAMETERS: RhoBoundParameters = {
  shape: 'boundary',
  units: 'km',
  side: 'below',
  lower: 1,
  upper: 500,
};

function lastRequest() {
  const calls = vi.mocked(axios.post).mock.calls;
  const [url, body] = calls[calls.length - 1];
  return { url: String(url), formData: body as FormData };
}

function sentParameters() {
  return JSON.parse(String(lastRequest().formData.get('parameters')));
}

describe('rho bound requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.post).mockResolvedValue({ data: {} });
  });

  it('sends the model and the shape file to the preview route', async () => {
    await previewRhoBounds({
      polyFile: new File(['poly'], 'line1.poly'),
      shapeFile: new File(['0 10\n100 10\n'], 'basement.txt'),
      parameters: PARAMETERS,
    });

    const { url, formData } = lastRequest();
    expect(url).toContain('/api/preview-rho-bounds');
    expect((formData.get('poly_file') as File).name).toBe('line1.poly');
    expect((formData.get('shape_file') as File).name).toBe('basement.txt');
    // Preview never asks for the .resistivity: that is the file about to be
    // overwritten, and it is not needed to count regions.
    expect(formData.get('resistivity_file')).toBeNull();
    expect(sentParameters()).toMatchObject({ side: 'below', lower: 1, upper: 500 });
  });

  it('adds the .resistivity only when applying', async () => {
    await applyRhoBounds({
      polyFile: new File(['poly'], 'line1.poly'),
      resistivityFile: new File(['rho'], 'line1.0.resistivity'),
      shapeFile: new File(['0 10\n100 10\n'], 'basement.txt'),
      parameters: PARAMETERS,
    });

    const { url, formData } = lastRequest();
    expect(url).toContain('/api/apply-rho-bounds');
    expect((formData.get('resistivity_file') as File).name).toBe('line1.0.resistivity');
  });

  it('converts a shape drawn in the viewer to metres and says so', async () => {
    // The viewer holds kilometres and the service works in metres. Sending the
    // converted points still labelled "km" would scale them a second time.
    await previewRhoBounds({
      polyFile: new File(['poly'], 'line1.poly'),
      viewerPoints: [
        [10, 2],
        [90, 3],
      ],
      parameters: PARAMETERS,
    });

    expect(sentParameters()).toMatchObject({
      units: 'm',
      points: [
        [10_000, 2_000],
        [90_000, 3_000],
      ],
    });
    expect(lastRequest().formData.get('shape_file')).toBeNull();
  });

  it('leaves a shape read from a file in the units the user picked', async () => {
    await previewRhoBounds({
      polyFile: new File(['poly'], 'line1.poly'),
      shapeFile: new File(['0 10\n'], 'basement.txt'),
      parameters: { ...PARAMETERS, units: 'm' },
    });

    expect(sentParameters().units).toBe('m');
    expect(sentParameters().points).toBeUndefined();
  });
});
