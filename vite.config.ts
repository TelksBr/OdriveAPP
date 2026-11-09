import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const PWA_ICONS = [
  { src: 'favicon.svg', sizes: '48x48', type: 'image/svg+xml', purpose: 'any' },
  { src: 'pwa/icon-any.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
  { src: 'pwa/icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
] as const;

export default defineConfig({
  base: './',
  logLevel: 'info',
  clearScreen: false,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons.svg', 'pwa/icon-any.svg', 'pwa/icon-maskable.svg'],
      manifest: {
        id: './',
        name: 'WheelForge Configurator',
        short_name: 'WheelForge',
        description: 'Desktop PWA for FFB wheel bring-up, tuning, telemetry, profiles, and DFU.',
        lang: 'pt-BR',
        dir: 'ltr',
        theme_color: '#090d14',
        background_color: '#090d14',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui', 'browser'],
        orientation: 'any',
        scope: './',
        start_url: './',
        prefer_related_applications: false,
        categories: ['utilities', 'developer', 'productivity'],
        icons: PWA_ICONS.map((icon) => ({ ...icon })),
        shortcuts: [
          {
            name: 'Console',
            short_name: 'Console',
            description: 'Open the raw serial console.',
            url: './?tab=console',
            icons: [{ src: 'pwa/icon-any.svg', sizes: '192x192', type: 'image/svg+xml' }],
          },
          {
            name: 'Telemetry',
            short_name: 'Telemetry',
            description: 'Open live diagnostics and telemetry.',
            url: './?tab=observe',
            icons: [{ src: 'pwa/icon-any.svg', sizes: '192x192', type: 'image/svg+xml' }],
          },
          {
            name: 'FFB Test',
            short_name: 'FFB Test',
            description: 'Open the WebHID FFB test lab.',
            url: './?tab=ffb-test',
            icons: [{ src: 'pwa/icon-any.svg', sizes: '192x192', type: 'image/svg+xml' }],
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,ico,json,woff2}'],
        globIgnores: [
          '**/models/wheel/textures/**',
          '**/models/**/*.fbx',
          '**/models/**/*.jpg',
          '**/models/**/*.png',
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/models/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'wheelforge-models',
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
