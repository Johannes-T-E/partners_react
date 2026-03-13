import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@game': path.resolve(__dirname, './shared/src'),
      '@web-ui': path.resolve(__dirname, './shared/web-ui'),
    },
  },
  server: {
    port: 5174,
  },
});
