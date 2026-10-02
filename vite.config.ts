import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパスで配信されるので、相対パスにする
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 600 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'サイコロ8パズル / Dice Roll 8',
        short_name: 'サイコロ8',
        description: '転がして、全部1に。 Roll every die to show 1.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4efe6',
        theme_color: '#f4efe6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,bin,webmanifest}'],
        // OGP 画像は SNS のクローラー向けなので、オフライン用には持たない
        globIgnores: ['og.png'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: [
      'tests/core/**/*.test.ts',
      'tests/api/**/*.test.ts',
      'tests/tools/**/*.test.ts',
      'tests/app/**/*.test.ts',
    ],
    environment: 'node',
  },
});
