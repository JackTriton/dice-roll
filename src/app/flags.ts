// 機能の出し分け(ビルド時の設定で決める)。

/**
 * ハード(正立に揃える)を出すか。`.env` の VITE_HARD_MODE=1 で有効にしている。
 * 外すと、入口(ルールの選択、ランキングのルールの切り替え、遊び方の説明)が出なくなり、ふつうのルールだけになる。
 */
export const HARD_MODE = import.meta.env.VITE_HARD_MODE === '1';

/**
 * ハードのサイコロの見た目を「設定」で切り替えられるようにするか(案の見比べ用)。
 * 開発用の版(`.env.development`)だけで有効にしている。無効なら、いつも決めた見た目(DEFAULT_LOOK)で描く。
 */
export const LOOK_LAB = import.meta.env.VITE_LOOK_LAB === '1';
