import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['assets/aistudio/20261021_140921_56efc859.png', 'sw-push-handler.js'],
        manifest: {
          id: '/',
          name: 'FC Arena VS – Pro Tournament Platform',
          short_name: 'FC Arena VS',
          description: 'The ultimate professional tournament and 1v1 battle platform for FC Mobile gamers.',
          theme_color: '#1e293b',
          background_color: '#fdfbf7',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/assets/aistudio/20261021_140921_56efc859.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/aistudio/20261021_140921_56efc859.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/aistudio/20261021_140921_56efc859.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          importScripts: ['/sw-push-handler.js'],
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      // HMR is disabled to prevent WebSocket connection errors in the studio iframe environment
      hmr: false,
      watch: {
        usePolling: true,
      },
    },
  };
});
