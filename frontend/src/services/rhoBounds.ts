import axios from 'axios';

import type {
  RhoBoundApplyResponse,
  RhoBoundParameters,
  RhoBoundPreviewResponse,
} from '@/types';
import { apiUrl } from '@/lib/apiConfig';

/**
 * Bounding resistivity over part of a model.
 *
 * The shape travels either as an uploaded two-column `y z` file or as JSON
 * points, and the server reads both through one parser -- a shape drawn on
 * screen and one read from disk have to land in the same place, or the preview
 * and the exported file disagree.
 *
 * The viewer holds kilometres; the service works in metres, the unit the .poly
 * and the shape file are written in. Points sent from the viewer are converted
 * on the way out and the answer comes back in metres.
 */
const VIEWER_TO_MODEL_UNITS = 1e3;

export interface RhoBoundRequest {
  polyFile: File;
  parameters: RhoBoundParameters;
  /** A two-column `y z` file, when the shape came from disk. */
  shapeFile?: File | null;
  /** Shape vertices in viewer units, when the shape was drawn instead. */
  viewerPoints?: [number, number][] | null;
}

function buildFormData(request: RhoBoundRequest) {
  const formData = new FormData();
  formData.append('poly_file', request.polyFile);
  if (request.shapeFile) {
    formData.append('shape_file', request.shapeFile);
  }

  const parameters = request.viewerPoints
    ? {
        ...request.parameters,
        points: request.viewerPoints.map(
          ([y, z]) =>
            [y * VIEWER_TO_MODEL_UNITS, z * VIEWER_TO_MODEL_UNITS] as [number, number],
        ),
        // The conversion above already put the points in metres, so telling
        // the server they are kilometres would scale them a second time.
        units: 'm' as const,
      }
    : request.parameters;

  formData.append('parameters', JSON.stringify(parameters));
  return formData;
}

export async function previewRhoBounds(request: RhoBoundRequest) {
  const response = await axios.post<RhoBoundPreviewResponse>(
    apiUrl('/api/preview-rho-bounds'),
    buildFormData(request),
  );
  return response.data;
}

export interface RhoBoundApplyRequest extends RhoBoundRequest {
  resistivityFile: File;
}

export async function applyRhoBounds(request: RhoBoundApplyRequest) {
  const formData = buildFormData(request);
  formData.append('resistivity_file', request.resistivityFile);

  const response = await axios.post<RhoBoundApplyResponse>(
    apiUrl('/api/apply-rho-bounds'),
    formData,
  );
  return response.data;
}
