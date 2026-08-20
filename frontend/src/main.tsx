import { mountApp } from '@/app/mountApp';
import { getDemoDatasetIds, isDemoModeEnabled } from '@/demo/demoModeConfig';
import { loadDemoDatasets } from '@/demo/loadDemoData';
import { initApiBaseUrl } from '@/lib/apiConfig';

const rootElement = document.getElementById('root');

if (rootElement) {
  const isDemoMode = isDemoModeEnabled();
  if (isDemoMode) {
    const baseUrl = import.meta.env.BASE_URL;
    const manifestUrl = `${baseUrl}demo-data/demo-manifest.json`;
    loadDemoDatasets({
      manifestUrl,
      baseUrl,
      datasetIds: getDemoDatasetIds(),
    })
      .catch((error) => {
        console.error('[Demo] Failed to load demo datasets:', error);
      })
      .finally(() => {
        mountApp(rootElement);
      });
  } else {
    // Resolve the backend port before mounting, so the first API call from a
    // component already targets the port the desktop shell reserved.
    initApiBaseUrl().finally(() => {
      mountApp(rootElement);
    });
  }
} else {
  console.error('Root element not found');
}
