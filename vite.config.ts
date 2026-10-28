import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  const isGitHubPages =
    process.env.VITE_BASE_PATH === '/tournament.com/' ||
    (process.env.GITHUB_WORKFLOW === 'Deploy to GitHub Pages' && process.env.VITE_BUILD_SOURCE !== 'github');
  const base = process.env.VITE_BASE_PATH || (isGitHubPages ? '/tournament.com/' : '/');

  return {
    base: base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-192x192.png',
          'pwa-maskable-512x512.png',
          'fc_arena_icon.jpg',
          'sw-push-handler.js',
          'faqs.json',
        ],
        manifest: {
          id: base,
          name: 'FC Arena VS – Pro Tournament Platform',
          short_name: 'FC Arena VS',
          description: 'The ultimate professional tournament and 1v1 battle platform for FC Mobile gamers.',
          theme_color: '#0c1445',
          background_color: '#0c1445',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-maskable-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          importScripts: ['sw-push-handler.js'],
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff,woff2,json}'],
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
