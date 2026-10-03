import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

/** 版の番号(ビルドした時刻)。画面に埋め込み、同じ値を version.json にも書き出す */
const BUILD_ID = new Date().toISOString();

/** version.json を書き出す。開いたままの画面が、新しい版が出たことに気づくために読む(src/app/update.ts) */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパスで配信されるので、相対パスにする
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 600 },
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    versionFile(),
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
        // 画面(HTML)は、つながっていればサーバーから取る(開き直せば、すぐ新しい版になるように)。
        // つながらないときは、手元に持っている index.html を使う(オフラインでも起動できる)。
        // 2秒たっても返ってこなければ、前に開いたときの画面を使う
        navigateFallback: null,
        directoryIndex: null,
        // 新しい版の Service Worker は、待機させずにすぐ有効にする。待機のままだと、このサイトのタブを
        // すべて閉じるまで古い版が出続ける(injectRegister: false のときは、プラグインが自動では設定しない)
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 2,
              precacheFallback: { fallbackURL: 'index.html' },
              plugins: [
                {
                  // 配信側は HTML に「10分は取り直さなくてよい」と付けてくるので、そのままだとブラウザが
                  // 手元の古い HTML を使う。毎回サーバーに変わっていないかを確かめさせる(変わっていなければ中身は送られない)
                  requestWillFetch: async ({ request }) =>
                    new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' }),
                },
              ],
            },
          },
        ],
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
