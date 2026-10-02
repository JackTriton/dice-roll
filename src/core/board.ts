// 盤の状態と手の適用。サイコロは区別しないので、各マスの向きと空きマスの位置だけを持つ。
//
// マスの番号は 行 * size + 列。0 行目が画面の上(北)。

import type { Size } from './constants.ts';
import { MIN_ROLLS_TO_TOP, MOVE_VEC, ONE_DIR, ROLL, topPip, type Move } from './dice.ts';

export const BLANK = 255;

export interface Board {
  readonly size: Size;
  /** 空きマスの番号 */
  blank: number;
  /** 各マスのサイコロの向き(0..23)。空きマスは BLANK */
  cells: Uint8Array;
}

export function createBoard(size: Size, blank: number, orients: ArrayLike<number>): Board {
  const cells = Uint8Array.from(orients);
  cells[blank] = BLANK;
  return { size, blank, cells };
}

/** 全部1が上を向いた盤(空きは右下)。チュートリアルやテストの出発点 */
export function solvedBoard(size: Size, blank = size * size - 1): Board {
  return createBoard(size, blank, new Uint8Array(size * size));
}

export function cloneBoard(b: Board): Board {
  return { size: b.size, blank: b.blank, cells: b.cells.slice() };
}

/** 方向 m へ動くサイコロのマス番号。そのサイコロが無ければ -1 */
export function moveSource(b: Board, m: Move): number {
  const [dx, dy] = MOVE_VEC[m];
  const r = Math.floor(b.blank / b.size) + dy; // 北へ動くサイコロは空きの1つ下(南)にいる
  const c = (b.blank % b.size) - dx;
  if (r < 0 || r >= b.size || c < 0 || c >= b.size) return -1;
  return r * b.size + c;
}

/** 方向 m へ1つ転がす。転がせなければ何もせず false */
export function applyMove(b: Board, m: Move): boolean {
  const src = moveSource(b, m);
  if (src < 0) return false;
  b.cells[b.blank] = ROLL[m][b.cells[src]];
  b.cells[src] = BLANK;
  b.blank = src;
  return true;
}

export function isSolved(b: Board): boolean {
  for (let i = 0; i < b.cells.length; i++) if (i !== b.blank && topPip(b.cells[i]) !== 1) return false;
  return true;
}

/** 1の目を上にするのに最低限要る転がり回数の合計(最短手数の下界) */
export function lowerBound(b: Board): number {
  let s = 0;
  for (let i = 0; i < b.cells.length; i++) if (i !== b.blank) s += MIN_ROLLS_TO_TOP[ONE_DIR[b.cells[i]]];
  return s;
}

/**
 * マス cell をタップしたときの手の列。空きと同じ行・列なら、空き側から順に転がす。
 * 同じ行・列でなければ空の配列。
 */
export function tapToMoves(b: Board, cell: number): Move[] {
  const br = Math.floor(b.blank / b.size);
  const bc = b.blank % b.size;
  const r = Math.floor(cell / b.size);
  const c = cell % b.size;
  if (cell === b.blank) return [];
  if (r === br) return Array<Move>(Math.abs(c - bc)).fill(c < bc ? 'R' : 'L');
  if (c === bc) return Array<Move>(Math.abs(r - br)).fill(r < br ? 'D' : 'U');
  return [];
}

// 文字列への詰め込み: 向き 0..23 を 'a'..'x'、空きを '-' で表し、マス順に並べる。
const ALPHABET = 'abcdefghijklmnopqrstuvwx';

export function encodeBoard(b: Board): string {
  let s = '';
  for (let i = 0; i < b.cells.length; i++) s += i === b.blank ? '-' : ALPHABET[b.cells[i]];
  return s;
}

export function decodeBoard(s: string): Board | null {
  const size = s.length === 9 ? 3 : s.length === 16 ? 4 : 0;
  if (size === 0) return null;
  const cells = new Uint8Array(s.length);
  let blank = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '-') {
      if (blank >= 0) return null;
      blank = i;
      cells[i] = BLANK;
    } else {
      const o = ALPHABET.indexOf(s[i]);
      if (o < 0) return null;
      cells[i] = o;
    }
  }
  if (blank < 0) return null;
  return { size: size as Size, blank, cells };
}
