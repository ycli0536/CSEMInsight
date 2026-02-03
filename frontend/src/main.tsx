import { mountApp } from '@/app/mountApp';

const rootElement = document.getElementById('root');

if (rootElement) {
  mountApp(rootElement);
} else {
  console.error('Root element not found');
}
