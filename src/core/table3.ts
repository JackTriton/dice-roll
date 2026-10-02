// 3×3 の「全部1を上に」までの最短手数の表。
//
// ゴールに関係するのは各サイコロの「1の目の向き」(6方向)だけなので、状態は
// 空きマスの位置(9) × 6^8 = 15,116,544 通りに縮む。全状態を BFS で埋めると約15MB になる。
// 表を作るのは手元のツール(tools/)だけで、ブラウザには配らない。

import type { Board } from './board.ts';
import { MOVES, ONE_DIR, ONE_DIR_ROLL, TOP, type Move } from './dice.ts';

export const STATES3 = 9 * 6 ** 8;
const P = 6 ** 8;

/** 盤(3×3)の、表での番号 */
export function index3(b: Board): number {
  let v = 0;
  for (let c = 8; c >= 0; c--) if (c !== b.blank) v = v * 6 + ONE_DIR[b.cells[c]];
  return b.blank * P + v;
}

function decode(s: number, dirs: Int8Array): number {
  const blank = Math.floor(s / P);
  let v = s % P;
  for (let c = 0; c < 9; c++) {
    if (c === blank) {
      dirs[c] = -1;
      continue;
    }
    dirs[c] = v % 6;
    v = Math.floor(v / 6);
  }
  return blank;
}

function encode(blank: number, dirs: Int8Array): number {
  let v = 0;
  for (let c = 8; c >= 0; c--) if (c !== blank) v = v * 6 + dirs[c];
  return blank * P + v;
}

/** 方向 m へ動くサイコロのマス(3×3)。無ければ -1 */
function source(blank: number, m: Move): number {
  const r = Math.floor(blank / 3);
  const c = blank % 3;
  switch (m) {
    case 'U':
      return r < 2 ? blank + 3 : -1;
    case 'D':
      return r > 0 ? blank - 3 : -1;
    case 'L':
      return c < 2 ? blank + 1 : -1;
    case 'R':
      return c > 0 ? blank - 1 : -1;
  }
}

/** 全状態の最短手数の表を BFS で作る(手元の Node で約1分) */
export function buildDist3(): Uint8Array {
  const dist = new Uint8Array(STATES3).fill(255);
  const queue = new Uint32Array(STATES3);
  let head = 0;
  let tail = 0;
  const dirs = new Int8Array(9);
  for (let b = 0; b < 9; b++) {
    dirs.fill(TOP);
    const s = encode(b, dirs);
    dist[s] = 0;
    queue[tail++] = s;
  }
  while (head < tail) {
    const s = queue[head++];
    const blank = decode(s, dirs);
    const d = dist[s] + 1;
    for (const m of MOVES) {
      const src = source(blank, m);
      if (src < 0) continue;
      const moved = dirs[src];
      dirs[blank] = ONE_DIR_ROLL[m][moved];
      dirs[src] = -1;
      const n = encode(src, dirs);
      if (dist[n] === 255) {
        dist[n] = d;
        queue[tail++] = n;
      }
      dirs[src] = moved;
      dirs[blank] = -1;
    }
  }
  return dist;
}

/** 表をたどって最短の手順を1つ返す */
export function solve3(dist: Uint8Array, b: Board): Move[] {
  const dirs = new Int8Array(9);
  let s = index3(b);
  let blank = decode(s, dirs);
  const path: Move[] = [];
  while (dist[s] > 0) {
    let next = -1;
    for (const m of MOVES) {
      const src = source(blank, m);
      if (src < 0) continue;
      const moved = dirs[src];
      dirs[blank] = ONE_DIR_ROLL[m][moved];
      dirs[src] = -1;
      const n = encode(src, dirs);
      if (dist[n] === dist[s] - 1) {
        path.push(m);
        next = n;
        blank = src;
        break;
      }
      dirs[src] = moved;
      dirs[blank] = -1;
    }
    if (next < 0) throw new Error('distance table is inconsistent');
    s = next;
  }
  return path;
}
