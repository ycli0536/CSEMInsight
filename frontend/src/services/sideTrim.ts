import axios from 'axios';

import type {
  SideTrimApplyResponse,
  SideTrimParameters,
  SideTrimPreviewResponse,
} from '@/types';
import { apiUrl } from '@/lib/apiConfig';

/**
 * Clearing one side of the model along an uploaded boundary file.
 *
 * The boundary travels as the two-column `y z` file the user dropped, in the
 * units they chose -- the server parses it with the same reader the penalty
 * cut and rho bounds use, so all three features agree on where a line lands.
 */
export interface SideTrimRequest {
  polyFile: File;
  boundaryFile: File;
  parameters: SideTrimParameters;
}

function buildFormData(request: SideTrimRequest) {
  const formData = new FormData();
  formData.append('poly_file', request.polyFile);
  formData.append('boundary_file', request.boundaryFile);
  formData.append('parameters', JSON.stringify(request.parameters));
  return formData;
}

export async function previewSideTrim(request: SideTrimRequest) {
  const response = await axios.post<SideTrimPreviewResponse>(
    apiUrl('/api/preview-side-trim'),
    buildFormData(request),
  );
  return response.data;
}

export interface SideTrimApplyRequest extends SideTrimRequest {
  resistivityFile: File;
}

export async function applySideTrim(request: SideTrimApplyRequest) {
  const formData = buildFormData(request);
  formData.append('resistivity_file', request.resistivityFile);

  const response = await axios.post<SideTrimApplyResponse>(
    apiUrl('/api/apply-side-trim'),
    formData,
  );
  return response.data;
}
