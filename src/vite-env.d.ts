/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** ランキング API の URL(例: https://dice-roll-api.example.workers.dev)。空ならランキングを使わない */
  readonly VITE_API_BASE?: string;
  /** 公開先の URL(末尾は /)。SNS のリンクプレビュー(OGP)に使う */
  readonly VITE_SITE_URL?: string;
  /** E2E テスト用のフックを有効にする */
  readonly VITE_E2E?: string;
  /** ハード(正立に揃える)を出す('1' で有効) */
  readonly VITE_HARD_MODE?: string;
  /** ハードの見た目を「設定」で切り替えられるようにする(見比べ用。開発用の版だけで '1' にしている) */
  readonly VITE_LOOK_LAB?: string;
}
