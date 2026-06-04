import axios from 'axios';

import type {
  TriangleResegmentationExportResponse,
  TriangleResegmentationParameters,
  TriangleResegmentationPreviewResponse,
} from '@/types';

const API_BASE_URL = 'http://127.0.0.1:3354';

export interface TriangleResegmentationRequest {
  polyFile: File;
  resistivityFile: File;
  parameters: TriangleResegmentationParameters;
}

function buildFormData(request: TriangleResegmentationRequest) {
  const formData = new FormData();
  formData.append('poly_file', request.polyFile);
  formData.append('resistivity_file', request.resistivityFile);
  formData.append('parameters', JSON.stringify(request.parameters));
  return formData;
}

export function buildResegmentedFileNames(polyFileName: string) {
  const stem = polyFileName.endsWith('.poly')
    ? polyFileName.slice(0, -'.poly'.length)
    : polyFileName;

  return {
    polyFileName: `${stem}.resegmented.poly`,
    resistivityFileName: `${stem}.resegmented.resistivity`,
  };
}

export async function previewTriangleResegmentation(
  request: TriangleResegmentationRequest,
) {
  const response = await axios.post<TriangleResegmentationPreviewResponse>(
    `${API_BASE_URL}/api/preview-triangle-resegmentation`,
    buildFormData(request),
  );
  return response.data;
}

export async function exportTriangleResegmentation(
  request: TriangleResegmentationRequest,
) {
  const response = await axios.post<TriangleResegmentationExportResponse>(
    `${API_BASE_URL}/api/export-triangle-resegmentation`,
    buildFormData(request),
  );
  return response.data;
}
