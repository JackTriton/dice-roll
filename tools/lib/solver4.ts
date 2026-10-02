// 4×4 を「全部1を上に」まで解く段階ソルバー(最短ではない)。受け入れ基準の可解性チェックに使う。
//   段階A: 1行目を 0 → 1 → (2, 3) の順に揃え、揃えたマスはそれ以降動かさない
//   段階B: 1列目の残りを 4 → (8, 12) の順に同じように揃える
//   段階C: 右下 3×3 を最短手数の表で解く。1行目・1列目には触れない
// 行(列)の最後の2マスは、そのマスを含む 2×3 の「窓」だけで動かす。窓の状態は 6 × 6^5 = 46,656 通りしかないので
// 窓ごとに最短手数の表を作ってたどる。2×3 の盤はどの状態からでも全部1にできる(研究メモ)ので、必ず解ける。
// 状態は各マスの「1の目の向き」(0..5、空きは -1)だけで持つ。

import { createBoard, type Board } from '../../src/core/board.ts';
import { MIN_ROLLS_TO_TOP, MOVES, ONE_DIR, ONE_DIR_ROLL, TOP, type Move } from '../../src/core/dice.ts';
import { randInt, type Rng } from '../../src/core/random.ts';
import { solve3 } from '../../src/core/table3.ts';

const N = 4;
/** 1の目の方向ごとの代表の向き(表を引くために Board を作るときに使う) */
const REP_ORIENT = Array.from({ length: 6 }, (_, d) => ONE_DIR.indexOf(d));

function source(blank: number, m: Move, allowed: readonly boolean[]): number {
  const r = Math.floor(blank / N);
  const c = blank % N;
  let s = -1;
  if (m === 'U' && r < N - 1) s = blank + N;
  else if (m === 'D' && r > 0) s = blank - N;
  else if (m === 'L' && c < N - 1) s = blank + 1;
  else if (m === 'R' && c > 0) s = blank - 1;
  return s >= 0 && allowed[s] ? s : -1;
}

function keyOf(dirs: Int8Array): number {
  let v = 0;
  for (let i = 0; i < dirs.length; i++) v = v * 7 + (dirs[i] + 1);
  return v;
}

interface Node {
  f: number;
  g: number;
  dirs: Int8Array;
  blank: number;
  parent: Node | null;
  move: Move | null;
}

class Heap {
  private a: Node[] = [];
  get size() {
    return this.a.length;
  }
  push(x: Node) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Node {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** targets のマスのサイコロを全部1を上にする手順を、重み付き A* で探す */
function solveStage(
  dirs: Int8Array,
  blank: number,
  allowed: readonly boolean[],
  targets: readonly number[],
  weight: number,
  limit: number,
): Move[] | null {
  const h = (d: Int8Array) => {
    let s = 0;
    for (const t of targets) s += d[t] < 0 ? 1 : MIN_ROLLS_TO_TOP[d[t]];
    return s;
  };
  const start: Node = { f: weight * h(dirs), g: 0, dirs: dirs.slice(), blank, parent: null, move: null };
  const best = new Map<number, number>([[keyOf(dirs), 0]]);
  const heap = new Heap();
  heap.push(start);
  let expanded = 0;
  while (heap.size) {
    const n = heap.pop();
    if (targets.every((t) => n.dirs[t] === TOP)) {
      const path: Move[] = [];
      for (let x: Node | null = n; x && x.move; x = x.parent) path.push(x.move);
      return path.reverse();
    }
    if ((best.get(keyOf(n.dirs)) ?? Infinity) < n.g) continue;
    if (++expanded > limit) return null;
    for (const m of MOVES) {
      const src = source(n.blank, m, allowed);
      if (src < 0) continue;
      const d = n.dirs.slice();
      d[n.blank] = ONE_DIR_ROLL[m][d[src]];
      d[src] = -1;
      const k = keyOf(d);
      const g = n.g + 1;
      if ((best.get(k) ?? Infinity) <= g) continue;
      best.set(k, g);
      heap.push({ f: g + weight * h(d), g, dirs: d, blank: src, parent: n, move: m });
    }
  }
  return null;
}

function applyDirs(dirs: Int8Array, blank: number, moves: readonly Move[]): number {
  for (const m of moves) {
    const src = source(blank, m, ALL);
    dirs[blank] = ONE_DIR_ROLL[m][dirs[src]];
    dirs[src] = -1;
    blank = src;
  }
  return blank;
}

const ALL = Array<boolean>(16).fill(true);
const INNER3 = ALL.map((_, i) => i >= N && i % N !== 0);
/**
 * 揃える順番。各段階では、それより前に揃えたマスには触れない。
 * 行(列)の最後のマスだけを残して固定すると、そのマスは隣が1つしかなくなり中身を入れ替えられないので、
 * 最後の2マスは 2×3 の窓でまとめて揃える(15パズルの「行の最後の1枚」と同じ事情)。
 */
type Step =
  | { kind: 'astar'; target: number }
  | { kind: 'window'; window: readonly number[]; targets: readonly number[] };
const ORDER: readonly Step[] = [
  { kind: 'astar', target: 0 },
  { kind: 'astar', target: 1 },
  { kind: 'window', window: [2, 3, 6, 7, 10, 11], targets: [2, 3] },
  { kind: 'astar', target: 4 },
  { kind: 'window', window: [8, 9, 10, 12, 13, 14], targets: [8, 12] },
];

/** 窓の最短手数の表。状態 = 窓の中の空きの位置 × 残り5マスの1の目の向き */
interface WindowTable {
  cells: readonly number[];
  dist: Uint8Array;
}
const W5 = 6 ** 5;
const windowTables = new Map<string, WindowTable>();

function encodeWindow(cells: readonly number[], dirs: Int8Array): number {
  let blank = -1;
  let v = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    const d = dirs[cells[i]];
    if (d < 0) blank = i;
    else v = v * 6 + d;
  }
  return blank * W5 + v;
}

function windowTable(cells: readonly number[], targets: readonly number[]): WindowTable {
  const key = cells.join(',');
  const cached = windowTables.get(key);
  if (cached) return cached;
  const inWindow = ALL.map((_, i) => cells.includes(i));
  const dist = new Uint8Array(cells.length * W5).fill(255);
  const queue: number[] = [];
  const dirs = new Int8Array(16);
  // ゴール(targets が全部1を上)の状態をすべて出発点にする
  for (let s = 0; s < dist.length; s++) {
    decodeWindow(cells, s, dirs);
    if (targets.every((t) => dirs[t] === TOP)) {
      dist[s] = 0;
      queue.push(s);
    }
  }
  for (let h = 0; h < queue.length; h++) {
    const s = queue[h];
    const blank = decodeWindow(cells, s, dirs);
    for (const m of MOVES) {
      const src = source(blank, m, inWindow);
      if (src < 0) continue;
      const moved = dirs[src];
      dirs[blank] = ONE_DIR_ROLL[m][moved];
      dirs[src] = -1;
      const n = encodeWindow(cells, dirs);
      if (dist[n] === 255) {
        dist[n] = dist[s] + 1;
        queue.push(n);
      }
      dirs[src] = moved;
      dirs[blank] = -1;
    }
  }
  const t = { cells, dist };
  windowTables.set(key, t);
  return t;
}

/** 窓の状態番号を dirs(4×4 のマス番号)に書き戻し、空きのマス番号を返す */
function decodeWindow(cells: readonly number[], s: number, dirs: Int8Array): number {
  const b = Math.floor(s / W5);
  let v = s % W5;
  for (let i = 0; i < cells.length; i++) {
    if (i === b) {
      dirs[cells[i]] = -1;
      continue;
    }
    dirs[cells[i]] = v % 6;
    v = Math.floor(v / 6);
  }
  return cells[b];
}

/** 空きを、固定していないマスだけを通って窓の中まで連れてくる手順 */
function bringBlankInto(blank: number, allowed: readonly boolean[], cells: readonly number[]): Move[] {
  const prev = new Map<number, [number, Move]>([[blank, [-1, 'U']]]);
  const q = [blank];
  for (let h = 0; h < q.length; h++) {
    const x = q[h];
    if (cells.includes(x)) {
      const path: Move[] = [];
      for (let y = x; y !== blank; y = prev.get(y)![0]) path.push(prev.get(y)![1]);
      return path.reverse();
    }
    for (const m of MOVES) {
      const src = source(x, m, allowed); // 空きは、転がってくるサイコロのいたマスへ移る
      if (src >= 0 && !prev.has(src)) {
        prev.set(src, [x, m]);
        q.push(src);
      }
    }
  }
  throw new Error('blank cannot reach the window');
}

function solveWindow(
  dirs: Int8Array,
  blank: number,
  allowed: readonly boolean[],
  step: { window: readonly number[]; targets: readonly number[] },
) {
  const moves = bringBlankInto(blank, allowed, step.window);
  blank = applyDirs(dirs, blank, moves);
  const { cells, dist } = windowTable(step.window, step.targets);
  const inWindow = ALL.map((_, i) => cells.includes(i));
  let s = encodeWindow(cells, dirs);
  if (dist[s] === 255) throw new Error('window state is unsolvable');
  while (dist[s] > 0) {
    let found = false;
    for (const m of MOVES) {
      const src = source(blank, m, inWindow);
      if (src < 0) continue;
      const trial = dirs.slice();
      trial[blank] = ONE_DIR_ROLL[m][trial[src]];
      trial[src] = -1;
      const n = encodeWindow(cells, trial);
      if (dist[n] === dist[s] - 1) {
        dirs.set(trial);
        blank = src;
        s = n;
        moves.push(m);
        found = true;
        break;
      }
    }
    if (!found) throw new Error('window table is inconsistent');
  }
  return { moves, blank };
}

const ATTEMPTS: ReadonlyArray<readonly [number, number]> = [
  [2, 20_000],
  [3, 60_000],
  [5, 200_000],
];

function stageWithRetries(
  dirs: Int8Array,
  blank: number,
  allowed: readonly boolean[],
  targets: readonly number[],
  rng: Rng,
): { moves: Move[]; blank: number } {
  const all: Move[] = [];
  for (let attempt = 0; attempt < 50; attempt++) {
    for (const [w, limit] of ATTEMPTS) {
      const path = solveStage(dirs, blank, allowed, targets, w, limit);
      if (path) {
        blank = applyDirs(dirs, blank, path);
        return { moves: all.concat(path), blank };
      }
    }
    // 行き詰まったら、許された範囲で少しかき混ぜてやり直す
    for (let i = 0; i < 6; i++) {
      const m = MOVES[randInt(rng, 4)];
      if (source(blank, m, allowed) < 0) continue;
      blank = applyDirs(dirs, blank, [m]);
      all.push(m);
    }
  }
  throw new Error('stage failed after many attempts');
}

/** 4×4 の盤を解く手順を返す(最短ではない) */
export function solve4(b: Board, dist3: Uint8Array, rng: Rng): Move[] {
  if (b.size !== 4) throw new Error('4x4 only');
  const dirs = Int8Array.from(b.cells, (o, i) => (i === b.blank ? -1 : ONE_DIR[o]));
  let blank = b.blank;
  const moves: Move[] = [];

  const allowed = ALL.slice();
  for (const step of ORDER) {
    const targets = step.kind === 'astar' ? [step.target] : step.targets;
    const st =
      step.kind === 'astar'
        ? stageWithRetries(dirs, blank, allowed, targets, rng)
        : solveWindow(dirs, blank, allowed, step);
    moves.push(...st.moves);
    blank = st.blank;
    for (const t of targets) allowed[t] = false;
  }

  // 段階C: 右下 3×3 を表で解く。外側に触れない動きは、3×3 の中の動きと同じ
  const inner = new Uint8Array(9);
  let innerBlank = -1;
  for (let r = 1; r < N; r++)
    for (let c = 1; c < N; c++) {
      const i = r * N + c;
      const j = (r - 1) * 3 + (c - 1);
      if (dirs[i] < 0) innerBlank = j;
      else inner[j] = REP_ORIENT[dirs[i]];
    }
  if (innerBlank < 0 || !INNER3[blank]) throw new Error('blank is not inside the inner 3x3');
  moves.push(...solve3(dist3, createBoard(3, innerBlank, inner)));
  return moves;
}
