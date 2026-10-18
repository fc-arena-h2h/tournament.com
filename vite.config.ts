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
        includeAssets: ['fc_arena_icon.jpg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'sw-push-handler.js'],
        manifest: {
          id: '/',
          name: 'FC Arena VS – FC Mobile Tournaments',
          short_name: 'FC Arena',
          description: 'Tournament and 1v1 battle platform for FC Mobile gamers.',
          theme_color: '#fdfbf7',
          background_color: '#fdfbf7',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
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
        '@': path.resolve(__dirname, '.'),
      },
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
