import { mountApp } from '../app/mountApp';
import { mountApp } from '@/app/mountApp';
import { loadDemoDatasets } from '@/demo/loadDemoData';

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

  await loadDemoDatasets({ manifestUrl, baseUrl, datasetIds });

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
