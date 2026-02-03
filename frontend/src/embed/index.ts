import { mountApp } from '../app/mountApp';
import { useDataTableStore } from '../store/settingFormStore';
import { getTxRxData } from '../services/extractTxRxPlotData';
import { datasetColors } from '../lib/datasetColors';
import type { CsemData, DatasetRole, GeometryData } from '../types';

interface DemoManifest {
  version: number;
  datasets: {
    id: string;
    name: string;
    type: 'data' | 'resp';
    file: string;
  }[];
}

interface DatasetJSON {
  id: string;
  name: string;
  geometryInfo: GeometryData;
  data: string;
  dataBlocks: Record<string, unknown>;
}

interface EmbedOptions {
  mountEl: HTMLElement;
  manifestUrl: string;
  baseUrl: string;
  datasetIds?: string[];
}

/**
 * CSEMInsight Embed API for demo page.
 * Loads datasets from manifest without backend dependencies.
 */
async function init(options: EmbedOptions): Promise<void> {
  const { mountEl, manifestUrl, baseUrl, datasetIds } = options;

  const resolvedBaseUrl = new URL(baseUrl, window.location.origin).toString();

  const { resetDatasets, addDataset, setPrimaryDataset } = useDataTableStore.getState();
  resetDatasets();

  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) {
    throw new Error(`Failed to fetch manifest: ${manifestResponse.statusText}`);
  }
  const manifest: DemoManifest = await manifestResponse.json();

  let datasetsToLoad = manifest.datasets;
  if (datasetIds && datasetIds.length > 0) {
    const idSet = new Set(datasetIds);
    const filteredDatasets = manifest.datasets.filter((d) => idSet.has(d.id));
    
    const knownIds = new Set(manifest.datasets.map((d) => d.id));
    datasetIds.forEach((id) => {
      if (!knownIds.has(id)) {
        console.warn(`[CSEMInsightEmbed] Unknown dataset ID: ${id}`);
      }
    });
    
    datasetsToLoad = datasetIds
      .map((id) => filteredDatasets.find((d) => d.id === id))
      .filter((d): d is DemoManifest['datasets'][0] => d !== undefined);
  }

  for (let index = 0; index < datasetsToLoad.length; index++) {
    const manifestEntry = datasetsToLoad[index];
    const datasetUrl = new URL(manifestEntry.file, resolvedBaseUrl).href;

    const datasetResponse = await fetch(datasetUrl);
    if (!datasetResponse.ok) {
      throw new Error(`Failed to fetch dataset ${manifestEntry.id}: ${datasetResponse.statusText}`);
    }
    const datasetJSON: DatasetJSON = await datasetResponse.json();

    const parsedData = JSON.parse(datasetJSON.data);
    const csemData: CsemData[] = parsedData.data;

    const { TxData, RxData } = getTxRxData(csemData);

    const isFirst = index === 0;
    const role: DatasetRole = isFirst ? 'primary' : 'compared';

    const dataset = {
      id: manifestEntry.id,
      name: manifestEntry.name,
      data: csemData,
      txData: TxData,
      rxData: RxData,
      geometryInfo: datasetJSON.geometryInfo,
      dataBlocks: datasetJSON.dataBlocks as Record<string, string[]>,
      color: datasetColors[index % datasetColors.length],
      visible: true,
      role,
      uploadTime: new Date(),
    };

    addDataset(dataset);
  }

  if (datasetsToLoad.length > 0) {
    setPrimaryDataset(datasetsToLoad[0].id);
  }

  mountApp(mountEl);
}

// Export as global window API
declare global {
  interface Window {
    CSEMInsightEmbed: {
      init: typeof init;
    };
  }
}

window.CSEMInsightEmbed = {
  init,
};

export { init };
