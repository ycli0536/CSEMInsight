import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';

import {
  buildResegmentedFileNames,
  exportTriangleResegmentation,
  previewTriangleResegmentation,
} from './triangleResegmentation';
import type { TriangleResegmentationParameters } from '@/types';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

const parameters: TriangleResegmentationParameters = {
  roi: { yMin: 0, yMax: 10, zMin: 1, zMax: 5 },
  rhoLevels: [0.3, 3, 30],
  onlyFreeParameters: true,
  boundaryTolerance: 10,
  minimumRegionArea: 100,
};

describe('triangleResegmentation service', () => {
  it('derives resegmented output file names from the source poly name', () => {
    expect(buildResegmentedFileNames('line3.poly')).toEqual({
      polyFileName: 'line3.resegmented.poly',
      resistivityFileName: 'line3.resegmented.resistivity',
    });
  });

  it('posts preview requests as multipart form data', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { ok: true } });
    const polyFile = new File(['poly'], 'source.poly');
    const resistivityFile = new File(['rho'], 'source.resistivity');

    await previewTriangleResegmentation({ polyFile, resistivityFile, parameters });

    expect(axios.post).toHaveBeenCalledWith(
      'http://127.0.0.1:3354/api/preview-triangle-resegmentation',
      expect.any(FormData),
    );
    const formData = vi.mocked(axios.post).mock.calls[0][1] as FormData;
    expect(formData.get('poly_file')).toBe(polyFile);
    expect(formData.get('resistivity_file')).toBe(resistivityFile);
    expect(JSON.parse(String(formData.get('parameters')))).toEqual(parameters);
  });

  it('posts export requests as multipart form data', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { ok: true } });
    const polyFile = new File(['poly'], 'source.poly');
    const resistivityFile = new File(['rho'], 'source.resistivity');

    await exportTriangleResegmentation({ polyFile, resistivityFile, parameters });

    expect(axios.post).toHaveBeenCalledWith(
      'http://127.0.0.1:3354/api/export-triangle-resegmentation',
      expect.any(FormData),
    );
  });
});
