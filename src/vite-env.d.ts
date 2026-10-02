/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** ランキング API の URL(例: https://dice-roll-api.example.workers.dev)。空ならランキングを使わない */
  readonly VITE_API_BASE?: string;
  /** E2E テスト用のフックを有効にする */
  readonly VITE_E2E?: string;
}
