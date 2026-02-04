import { mountApp } from '@/app/mountApp';
import { loadDemoDatasets } from '@/demo/loadDemoData';

const rootElement = document.getElementById('root');

if (rootElement) {
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  if (isDemoMode) {
    const baseUrl = import.meta.env.BASE_URL;
    const manifestUrl = `${baseUrl}demo-data/demo-manifest.json`;
    loadDemoDatasets({
      manifestUrl,
      baseUrl,
      datasetIds: ['shumagin-line5-data', 'shumagin-line5-resp'],
    })
      .catch((error) => {
        console.error('[Demo] Failed to load demo datasets:', error);
      })
      .finally(() => {
        mountApp(rootElement);
      });
  } else {
    mountApp(rootElement);
  }
} else {
  console.error('Root element not found');
}
