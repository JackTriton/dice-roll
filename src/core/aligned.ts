// ハード(向きまで揃える)の説明や見本に使う盤面。

import { createBoard, type Board } from './board.ts';
import type { Size } from './constants.ts';
import { ORIENT_PARITY, UPRIGHT, topPip } from './dice.ts';

/** 1が上の向き(上から見た回転の4通り) */
export const UP_ORIENTS: readonly number[] = [...Array(24).keys()].filter((o) => topPip(o) === 1);

/** 揃える向き(正立): 1が上で、2の面が奥(画面の上)。1の図案が正立して見える */
export const ALIGNED_BASE: number = UPRIGHT;

/**
 * 見本の盤面(空きは 3×3 なら真ん中)。
 * done = 揃った盤、near = 隣り合う2個(左上とその下)だけ横倒し(90°違い)の盤(偶奇が合うので、実際に現れる形)
 */
export function alignedExample(size: Size, kind: 'done' | 'near'): Board {
  const base = ALIGNED_BASE;
  const turned = UP_ORIENTS.find((o) => ORIENT_PARITY[o] !== ORIENT_PARITY[base])!;
  const orients = new Uint8Array(size * size).fill(base);
  if (kind === 'near') {
    orients[0] = turned;
    orients[size] = turned;
  }
  return createBoard(size, size === 3 ? 4 : 5, orients);
}
