// ゲーム全体で共有する定数。ブラウザと Worker の両方から読み込む。

export const APP_NAME = { ja: 'サイコロ8パズル', en: 'Dice Roll 8' } as const;

export type Size = 3 | 4;
export const SIZES: readonly Size[] = [3, 4];

/** クリアの条件。ones = 全部1が上(ふつう)、aligned = 全部1が上で、しかも正立(2の面が奥)(ハード) */
export type Rule = 'ones' | 'aligned';
export const RULES: readonly Rule[] = ['ones', 'aligned'];

/**
 * サーバーが発行した問題の有効期限。実際のプレイでは届かない長さにしてある
 * (30分だったころ、ハードを長い時間かけて解いた記録を送れなかった)
 */
export const SCRAMBLE_TTL_MS = 7 * 24 * 60 * 60_000;

/** 1操作(同じ時刻の手のまとまり)あたりの平均間隔の下限。これより速い記録は受け付けない */
export const MIN_AVG_GESTURE_MS = 60;

/**
 * 1回の記録で受け付ける手数の上限。実際のプレイでは届かない数にしてある(3000手だったころ、ハードの長い記録を
 * 送れなかった)。サーバーが1回の検証に使える処理時間に収まる範囲で決めている
 */
export const MAX_MOVES = 50_000;

/** 3×3 の問題プールに入れる最短手数の範囲と、1問あたりのバイト数 */
export const POOL3 = { minOptimal: 24, maxOptimal: 34, entryBytes: 7 } as const;

/** 4×4 の問題に求める「1を上にするのに最低限要る転がり回数の合計」の下限 */
export const LB4_MIN = 13;

/** 無料アカウントの X に貼れる動画の長さの上限 */
export const X_VIDEO_LIMIT_MS = 140_000;

export const NICKNAME_MAX = 12;
