import { defineConfig, devices } from '@playwright/test';

// Playwright 用のブラウザを別途入れなくても動くよう、Windows に入っている Edge(Chromium)を使う。
// 環境変数 PW_CHANNEL で変えられる(例: chrome)。WebKit(iOS Safari 相当)は実機で確かめる。
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', locale: 'ja-JP' },
  webServer: {
    command:
      'npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: false,
    // E2E_API を付けると、ランキング API につないだビルドでテストする(ranked.spec.ts)。
    // 見た目の見比べ用の設定(開発用の版だけ)は、テストでは出しておく。E2E_LAB=0 を付けると、本番と同じ
    // 「出さない」ビルドでテストする。E2E_HARD=0 を付けると、ハードを出さないビルドでテストする
    env: {
      VITE_E2E: '1',
      VITE_API_BASE: process.env.E2E_API ?? '',
      VITE_HARD_MODE: process.env.E2E_HARD ?? '1',
      VITE_LOOK_LAB: process.env.E2E_LAB ?? '1',
    },
    timeout: 120_000,
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'], channel } },
    {
      name: 'iphone-size',
      use: { ...devices['iPhone 13'], browserName: 'chromium', channel, defaultBrowserType: 'chromium' },
    },
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel } },
  ],
});
