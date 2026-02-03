import path from 'path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/CSEMInsight/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {},
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify('true'),
  },
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'demo.html'),
        embed: path.resolve(__dirname, 'src/embed/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'embed'
            ? 'embed/index.js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
});
