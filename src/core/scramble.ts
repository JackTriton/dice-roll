// 問題(スクランブル)の作り方。
// 「全部1を上に」はどんな並べ方からでも必ず解ける(研究メモ参照)ので、向きは24通りから一様に選ぶだけでよい。

import { createBoard, isSolved, lowerBound, type Board } from './board.ts';
import { LB4_MIN, type Size } from './constants.ts';
import { pickFromPool } from './pool.ts';
import { randInt, type Rng } from './random.ts';

export function randomBoard(size: Size, rng: Rng): Board {
  const n = size * size;
  const orients = Uint8Array.from({ length: n }, () => randInt(rng, 24));
  return createBoard(size, randInt(rng, n), orients);
}

/** 4×4 の問題。易しすぎる盤面(1を上にする転がり回数の合計が少ないもの)は引き直す */
export function randomScramble4(rng: Rng): Board {
  for (;;) {
    const b = randomBoard(4, rng);
    if (!isSolved(b) && lowerBound(b) >= LB4_MIN) return b;
  }
}

export interface Scramble {
  board: Board;
  /** 最短手数(3×3 のプールから選んだときだけ分かる) */
  optimal: number | null;
}

/** 3×3 はプールから、4×4 は乱数で作る */
export function makeScramble(size: Size, rng: Rng, pool3: Uint8Array | null): Scramble {
  if (size === 3) {
    if (pool3 && pool3.length > 0) return pickFromPool(pool3, rng);
    // プールが無いとき(読み込み失敗など)は乱数で作り、すぐ解ける盤面だけ避ける
    for (;;) {
      const b = randomBoard(3, rng);
      if (!isSolved(b) && lowerBound(b) >= 6) return { board: b, optimal: null };
    }
  }
  return { board: randomScramble4(rng), optimal: null };
}
