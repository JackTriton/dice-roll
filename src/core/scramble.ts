// 問題(スクランブル)の作り方。
// 「全部1を上に」はどんな並べ方からでも必ず解ける(研究メモ参照)ので、向きは24通りから一様に選ぶだけでよい。
// 「向きまで揃える」(ハード)は、好きに並べると解けない盤面が混ざるので、解ける盤面だけから一様に選ぶ。

import { cellColor, createBoard, isAligned, isSolved, lowerBound, type Board } from './board.ts';
import { LB4_MIN, type Rule, type Size } from './constants.ts';
import { ORIENT_PARITY } from './dice.ts';
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

/** 偶奇ごとの向き(12通りずつ) */
const ORIENTS_BY_PARITY: readonly number[][] = [0, 1].map((p) =>
  [...ORIENT_PARITY.keys()].filter((o) => ORIENT_PARITY[o] === p),
);

/** 3×3 のハードの問題で、易しすぎる盤面を避けるための下限(1を上にする転がり回数の合計) */
const LB3_ALIGNED_MIN = 6;

/**
 * 「向きまで揃える」で解ける盤面を、一様に選ぶ。
 *
 * どのサイコロも「向きの偶奇 ⊕ マスの色」(組)が変わらない。揃った盤では、同じ色のマスに同じ組が並ぶ。
 * 3×3 は空きが角か真ん中に来る揃い方だけを使うので、組は 4 個ずつ。4×4 は 7 個と 8 個(どちらが多くてもよい)。
 * この個数を満たす盤面は、すべて解ける(偶奇のほかに制約が無いことは、群の位数の計算で確かめてある)。
 */
export function randomAlignedBoard(size: Size, rng: Rng): Board {
  const n = size * size;
  for (;;) {
    const blank = randInt(rng, n);
    const cells = [...Array(n).keys()].filter((c) => c !== blank);
    // 並べ替えて、先頭の k 個を組 0 にする
    for (let i = cells.length - 1; i > 0; i--) {
      const j = randInt(rng, i + 1);
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const k = size === 3 ? 4 : 7 + randInt(rng, 2);
    const orients = new Uint8Array(n);
    cells.forEach((c, i) => {
      const parity = (i < k ? 0 : 1) ^ cellColor(size, c);
      orients[c] = ORIENTS_BY_PARITY[parity][randInt(rng, 12)];
    });
    const b = createBoard(size, blank, orients);
    if (!isAligned(b) && lowerBound(b) >= (size === 3 ? LB3_ALIGNED_MIN : LB4_MIN)) return b;
  }
}

export interface Scramble {
  board: Board;
  /** 最短手数(3×3 のプールから選んだときだけ分かる) */
  optimal: number | null;
}

/** 3×3 はプールから、4×4 は乱数で作る。ハードはどちらの大きさも乱数で作る */
export function makeScramble(size: Size, rng: Rng, pool3: Uint8Array | null, rule: Rule = 'ones'): Scramble {
  if (rule === 'aligned') return { board: randomAlignedBoard(size, rng), optimal: null };
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
