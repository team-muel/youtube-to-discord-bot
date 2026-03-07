import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  loadEnv(mode, '.', '');
  const backendTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:3000';
  return {
    plugins: [react(), tailwindcss()],
    build: {
      chunkSizeWarningLimit: 650,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/auth/callback': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
