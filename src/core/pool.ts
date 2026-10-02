// 3×3 の問題プールの詰め方。1問 7 バイト:
//   [0] 最短手数  [1] 空きマスの位置  [2..6] 8個の向き(5bit ずつ、マス順・空きは飛ばす、下位ビットから)

import { createBoard, type Board } from './board.ts';
import { POOL3 } from './constants.ts';
import { randInt, type Rng } from './random.ts';

export interface PoolEntry {
  board: Board;
  optimal: number;
}

export function encodePoolEntry(b: Board, optimal: number, out: Uint8Array, offset: number): void {
  if (b.size !== 3) throw new Error('pool entries are 3x3 only');
  out[offset] = optimal;
  out[offset + 1] = b.blank;
  let bits = 0n;
  let shift = 0n;
  for (let c = 0; c < 9; c++) {
    if (c === b.blank) continue;
    bits |= BigInt(b.cells[c]) << shift;
    shift += 5n;
  }
  for (let i = 0; i < 5; i++) out[offset + 2 + i] = Number((bits >> BigInt(8 * i)) & 0xffn);
}

export function decodePoolEntry(pool: Uint8Array, index: number): PoolEntry {
  const offset = index * POOL3.entryBytes;
  const optimal = pool[offset];
  const blank = pool[offset + 1];
  let bits = 0;
  // 40bit なので Number の安全な整数範囲に収まる
  for (let i = 4; i >= 0; i--) bits = bits * 256 + pool[offset + 2 + i];
  const orients = new Uint8Array(9);
  for (let c = 0; c < 9; c++) {
    if (c === blank) continue;
    orients[c] = bits % 32;
    bits = Math.floor(bits / 32);
  }
  return { board: createBoard(3, blank, orients), optimal };
}

export const poolSize = (pool: Uint8Array): number => Math.floor(pool.length / POOL3.entryBytes);

export function pickFromPool(pool: Uint8Array, rng: Rng): PoolEntry {
  return decodePoolEntry(pool, randInt(rng, poolSize(pool)));
}
