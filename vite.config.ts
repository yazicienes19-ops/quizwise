import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon-192.svg', 'icon-512.svg'],
          manifest: {
            name: 'QuizWise — KI-Lern-App',
            short_name: 'QuizWise',
            description: 'KI-gestützte Lern-App für Studierende',
            theme_color: '#6366f1',
            background_color: '#0f172a',
            display: 'standalone',
            start_url: '/',
            icons: [
              { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
              { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
            ],
          },
          workbox: {
            cleanupOutdatedCaches: true,
            navigateFallback: null,
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'api-cache',
                  expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
                },
              },
            ],
            globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          },
        }),
      ],
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              'recharts': ['recharts'],
              'framer-motion': ['framer-motion'],
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
