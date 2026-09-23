import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { target: 'esnext' },
  worker: { format: 'es' },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8791',
      '/health': 'http://127.0.0.1:8791',
    },
  },
});