import axios from 'axios';

import type {
  PenaltyCutApplyResponse,
  PenaltyCutParameters,
  PenaltyCutParseResponse,
  TriangleMeshBounds,
} from '@/types';
import { apiUrl } from '@/lib/apiConfig';

/**
 * The interface file is parsed on the server, never here.
 *
 * A second parser on the client would be one that can disagree with the one
 * that actually builds the model, and the disagreement shows up as "the
 * overlay looked right but the output is wrong". So even the instant
 * drop-a-file preview makes a round trip -- it is a few hundred points and
 * costs milliseconds.
 */
/**
 * The viewer holds kilometres; the service works in metres, the unit the .poly
 * and the interface file are written in. The bounds have to be converted or
 * every point looks like it falls outside a model a thousand times too small.
 */
const VIEWER_TO_MODEL_UNITS = 1e3;

export async function parseInterfaceFile(
  cutFile: File,
  parameters: PenaltyCutParameters,
  modelBounds?: TriangleMeshBounds,
) {
  const formData = new FormData();
  formData.append('cut_file', cutFile);
  formData.append(
    'parameters',
    JSON.stringify(
      modelBounds
        ? {
            ...parameters,
            modelBounds: {
              yMin: modelBounds.minX * VIEWER_TO_MODEL_UNITS,
              yMax: modelBounds.maxX * VIEWER_TO_MODEL_UNITS,
              zMin: modelBounds.minY * VIEWER_TO_MODEL_UNITS,
              zMax: modelBounds.maxY * VIEWER_TO_MODEL_UNITS,
            },
          }
        : parameters,
    ),
  );

  const response = await axios.post<PenaltyCutParseResponse>(
    apiUrl('/api/parse-interface'),
    formData,
  );
  return response.data;
}

export interface PenaltyCutApplyRequest {
  polyFile: File;
  resistivityFile: File;
  cutFile: File;
  parameters: PenaltyCutParameters;
}

export async function applyPenaltyCut(request: PenaltyCutApplyRequest) {
  const formData = new FormData();
  formData.append('poly_file', request.polyFile);
  formData.append('resistivity_file', request.resistivityFile);
  formData.append('cut_file', request.cutFile);
  formData.append('parameters', JSON.stringify(request.parameters));

  const response = await axios.post<PenaltyCutApplyResponse>(
    apiUrl('/api/apply-penalty-cut'),
    formData,
  );
  return response.data;
}
