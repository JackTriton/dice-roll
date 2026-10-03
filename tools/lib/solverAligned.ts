// ハード(正立に揃える)のソルバー。最短ではないが、必ず解く。問題が解けることの実地確認と、テストで使う。
//
// 手順: 上の行から順に、サイコロを正立(UPRIGHT)で置いて固定していく。
//   - 行の途中のマスは、合う組のサイコロを1個選び、(空き, そのサイコロの位置, 向き)の幅優先探索で運ぶ
//   - 行の最後の2マスは、片方だけ先に固定するともう片方を入れ替えられなくなる(角は隣が1つになる)ので、
//     2×3 の「窓」の中だけで動かして、2マスを同時に揃える(窓の全状態の最短手数の表をたどる)
//   - 最後に残る 3×2 も、窓の表でたどる
// サイコロの「組」(向きの偶奇 ⊕ マスの色)は動かしても変わらないので、各マスには、正立になれる組のサイコロを選ぶ。
//
// 窓の表は、窓の中の全状態(空き 6 通り × 向き 24^5 = 47,775,744 通り、1状態1バイト)。3種類を作る。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { applyMove, cellColor, cloneBoard, dieKind, isAligned, type Board } from '../../src/core/board.ts';
import { MOVES, MOVE_VEC, ORIENT_PARITY, ROLL, UPRIGHT, type Move } from '../../src/core/dice.ts';

const P = 24 ** 5;
const WINDOW_STATES = 6 * P;
const UNREACHED = 255;

export interface WindowTable {
  w: number;
  h: number;
  dist: Uint8Array;
}

export interface AlignedTables {
  /** 縦長の窓(2列×3行)。上の2マスが正立になるまでの手数 */
  top2: WindowTable;
  /** 横長の窓(3列×2行)。左の列の2マスが正立になるまでの手数 */
  left2: WindowTable;
  /** 横長の窓(3列×2行)。5個すべてが正立になるまでの手数 */
  all: WindowTable;
}

const DX: Record<Move, number> = { U: 0, D: 0, L: -1, R: 1 };
const DY: Record<Move, number> = { U: 1, D: -1, L: 0, R: 0 };

/** 窓の状態の番号: 空きの位置 × 24^5 + (空きを飛ばしたマス順の向きを 24 進で並べた数) */
function encodeWindow(blank: number, cells: ArrayLike<number>): number {
  let v = 0;
  for (let i = 5; i >= 0; i--) if (i !== blank) v = v * 24 + cells[i];
  return blank * P + v;
}

/**
 * 窓の表を作る。upright は、正立でなければならない窓のマス(窓の中の番号)。
 * blankAnywhere なら、空きがそのマスに来ていてもよい(「残り全部が正立」のゴールに使う)。
 * ゴールの状態すべてから同時に幅優先探索する(手は逆にもたどれるので、ゴールからの距離 = ゴールまでの手数)。
 */
export function buildWindowTable(
  w: number,
  h: number,
  upright: readonly number[],
  blankAnywhere = false,
): WindowTable {
  const dist = new Uint8Array(WINDOW_STATES).fill(UNREACHED);
  const queue = new Uint32Array(WINDOW_STATES);
  let head = 0;
  let tail = 0;
  const cells = new Int16Array(6);
  // ゴールの状態を並べる: 正立でなければならないマス以外は、どの向きでもよい
  const all = [0, 1, 2, 3, 4, 5];
  for (const blank of blankAnywhere ? all : all.filter((i) => !upright.includes(i))) {
    const others = all.filter((i) => i !== blank && !upright.includes(i));
    const total = 24 ** others.length;
    for (let n = 0; n < total; n++) {
      cells.fill(UPRIGHT);
      let v = n;
      for (const i of others) {
        cells[i] = v % 24;
        v = Math.floor(v / 24);
      }
      const s = encodeWindow(blank, cells);
      if (dist[s] === UNREACHED) {
        dist[s] = 0;
        queue[tail++] = s;
      }
    }
  }
  const rolls = MOVES.map((m) => ROLL[m]);
  const dx = MOVES.map((m) => DX[m]);
  const dy = MOVES.map((m) => DY[m]);
  while (head < tail) {
    const s = queue[head++];
    const d = dist[s] + 1;
    const blank = Math.floor(s / P);
    let v = s - blank * P;
    for (let i = 0; i < 6; i++) {
      if (i === blank) {
        cells[i] = -1;
        continue;
      }
      cells[i] = v % 24;
      v = Math.floor(v / 24);
    }
    const br = Math.floor(blank / w);
    const bc = blank % w;
    for (let k = 0; k < 4; k++) {
      // 方向 k へ動くサイコロは、空きの反対側にいる
      const r = br + dy[k];
      const c = bc - dx[k];
      if (r < 0 || r >= h || c < 0 || c >= w) continue;
      const src = r * w + c;
      const moved = cells[src];
      cells[blank] = rolls[k][moved];
      cells[src] = -1;
      const n = encodeWindow(src, cells);
      if (dist[n] === UNREACHED) {
        dist[n] = d;
        queue[tail++] = n;
      }
      cells[src] = moved;
      cells[blank] = -1;
    }
  }
  return { w, h, dist };
}

const CACHE_DIR = new URL('../.cache/', import.meta.url);
const SPECS = {
  top2: { w: 2, h: 3, upright: [0, 1], blankAnywhere: false },
  left2: { w: 3, h: 2, upright: [0, 3], blankAnywhere: false },
  all: { w: 3, h: 2, upright: [0, 1, 2, 3, 4, 5], blankAnywhere: true },
} as const;

function loadOrBuild(name: keyof typeof SPECS, log: (msg: string) => void): WindowTable {
  const spec = SPECS[name];
  const file = new URL(`aligned-${name}.bin`, CACHE_DIR);
  if (existsSync(file)) {
    const buf = readFileSync(file);
    if (buf.length === WINDOW_STATES) return { w: spec.w, h: spec.h, dist: new Uint8Array(buf) };
  }
  const t0 = Date.now();
  const table = buildWindowTable(spec.w, spec.h, spec.upright, spec.blankAnywhere);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, table.dist);
  log(`built window table ${name} in ${Date.now() - t0} ms`);
  return table;
}

const cached: Partial<AlignedTables> = {};

/** 窓の表を読み込む(無ければ作って tools/.cache に保存する。1つ 48MB) */
export function loadAlignedTables(size: 3 | 4, log: (msg: string) => void = () => undefined): AlignedTables {
  cached.top2 ??= loadOrBuild('top2', log);
  cached.all ??= loadOrBuild('all', log);
  if (size === 4) cached.left2 ??= loadOrBuild('left2', log);
  return cached as AlignedTables;
}

// ---- 解く ----

class Solver {
  readonly b: Board;
  readonly n: number;
  readonly locked: boolean[];
  readonly path: Move[] = [];

  constructor(start: Board) {
    this.b = cloneBoard(start);
    this.n = start.size * start.size;
    this.locked = new Array<boolean>(this.n).fill(false);
  }

  /** そのマスで正立になれるサイコロの組 */
  kindFor(cell: number): number {
    return ORIENT_PARITY[UPRIGHT] ^ cellColor(this.b.size, cell);
  }

  /** 方向 m へ動くサイコロのマス(盤の外、または固定したマスなら -1) */
  private source(blank: number, m: Move): number {
    const size = this.b.size;
    const [dx, dy] = MOVE_VEC[m];
    const r = Math.floor(blank / size) + dy;
    const c = (blank % size) - dx;
    if (r < 0 || r >= size || c < 0 || c >= size) return -1;
    const src = r * size + c;
    return this.locked[src] ? -1 : src;
  }

  private apply(moves: readonly Move[]): void {
    for (const m of moves) {
      if (!applyMove(this.b, m)) throw new Error('solver made an illegal move');
      this.path.push(m);
    }
  }

  /** サイコロ1個を、マス cell に正立で置いて固定する */
  placeSingle(cell: number): void {
    const { b, n } = this;
    if (b.blank !== cell && b.cells[cell] === UPRIGHT) {
      this.locked[cell] = true;
      return;
    }
    let best: Move[] | null = null;
    for (let from = 0; from < n; from++) {
      if (from === b.blank || this.locked[from]) continue;
      if (dieKind(b.size, from, b.cells[from]) !== this.kindFor(cell)) continue;
      const moves = this.routeSingle(from, cell);
      if (moves && (!best || moves.length < best.length)) best = moves;
    }
    if (!best) throw new Error(`no die can be placed upright at cell ${cell}`);
    this.apply(best);
    this.locked[cell] = true;
  }

  /** (空き, サイコロの位置, 向き)の幅優先探索。ほかのサイコロは区別しない */
  private routeSingle(from: number, target: number): Move[] | null {
    const { b, n } = this;
    const key = (blank: number, pos: number, o: number) => (blank * n + pos) * 24 + o;
    const start = key(b.blank, from, b.cells[from]);
    const prev = new Map<number, { p: number; m: Move }>();
    const seen = new Set([start]);
    let frontier = [start];
    const goal = (s: number) => s % 24 === UPRIGHT && Math.floor(s / 24) % n === target;
    if (goal(start)) return [];
    while (frontier.length) {
      const next: number[] = [];
      for (const s of frontier) {
        const o = s % 24;
        const pos = Math.floor(s / 24) % n;
        const blank = Math.floor(s / 24 / n);
        for (const m of MOVES) {
          const src = this.source(blank, m);
          if (src < 0) continue;
          const t = src === pos ? key(src, blank, ROLL[m][o]) : key(src, pos, o);
          if (seen.has(t)) continue;
          seen.add(t);
          prev.set(t, { p: s, m });
          if (goal(t)) {
            const out: Move[] = [];
            for (let c = t; c !== start; c = prev.get(c)!.p) out.push(prev.get(c)!.m);
            return out.reverse();
          }
          next.push(t);
        }
      }
      frontier = next;
    }
    return null;
  }

  /**
   * 窓 W の中に、空きと、マス a・b に置けるサイコロ(組が違う2個)を集める。
   * (空き, サイコロAの位置, サイコロBの位置)の幅優先探索。
   */
  gather(window: readonly number[], a: number, bCell: number): void {
    const { b, n } = this;
    const inW = new Array<boolean>(n).fill(false);
    for (const c of window) inW[c] = true;
    const ka = this.kindFor(a);
    const kb = this.kindFor(bCell);
    const free = [...Array(n).keys()].filter((c) => c !== b.blank && !this.locked[c]);
    const as = free.filter((c) => dieKind(b.size, c, b.cells[c]) === ka);
    const bs = free.filter((c) => dieKind(b.size, c, b.cells[c]) === kb);
    let best: Move[] | null = null;
    for (const pa of as)
      for (const pb of bs) {
        const moves = this.routeGather(inW, pa, pb, best ? best.length : Infinity);
        if (moves && (!best || moves.length < best.length)) best = moves;
      }
    if (!best) throw new Error('could not gather the dice for a window');
    this.apply(best);
  }

  private routeGather(inW: boolean[], pa: number, pb: number, limit: number): Move[] | null {
    const { b, n } = this;
    const key = (blank: number, x: number, y: number) => (blank * n + x) * n + y;
    const done = (s: number) => inW[s % n] && inW[Math.floor(s / n) % n] && inW[Math.floor(s / n / n)];
    const start = key(b.blank, pa, pb);
    if (done(start)) return [];
    const prev = new Map<number, { p: number; m: Move }>();
    const seen = new Set([start]);
    let frontier = [start];
    for (let depth = 1; frontier.length && depth < limit; depth++) {
      const next: number[] = [];
      for (const s of frontier) {
        const y = s % n;
        const x = Math.floor(s / n) % n;
        const blank = Math.floor(s / n / n);
        for (const m of MOVES) {
          const src = this.source(blank, m);
          if (src < 0) continue;
          const t = key(src, src === x ? blank : x, src === y ? blank : y);
          if (seen.has(t)) continue;
          seen.add(t);
          prev.set(t, { p: s, m });
          if (done(t)) {
            const out: Move[] = [];
            for (let c = t; c !== start; c = prev.get(c)!.p) out.push(prev.get(c)!.m);
            return out.reverse();
          }
          next.push(t);
        }
      }
      frontier = next;
    }
    return null;
  }

  /** 窓の表をたどって、窓の中だけで揃える。window は、窓のマス(行ごとに左から) */
  solveWindow(table: WindowTable, window: readonly number[]): void {
    const { b } = this;
    const { w, h, dist } = table;
    const cells = new Int16Array(6);
    const read = (): number => {
      let blank = -1;
      for (let i = 0; i < 6; i++) {
        if (window[i] === b.blank) {
          blank = i;
          cells[i] = -1;
        } else cells[i] = b.cells[window[i]];
      }
      if (blank < 0) throw new Error('the blank is outside the window');
      return encodeWindow(blank, cells);
    };
    let s = read();
    if (dist[s] === UNREACHED) throw new Error('the window cannot be aligned');
    while (dist[s] > 0) {
      const blank = Math.floor(s / P);
      const br = Math.floor(blank / w);
      const bc = blank % w;
      let moved = false;
      for (const m of MOVES) {
        const r = br + DY[m];
        const c = bc - DX[m];
        if (r < 0 || r >= h || c < 0 || c >= w) continue;
        const src = r * w + c;
        const o = cells[src];
        cells[blank] = ROLL[m][o];
        cells[src] = -1;
        const t = encodeWindow(src, cells);
        cells[src] = o;
        cells[blank] = -1;
        if (dist[t] === dist[s] - 1) {
          this.apply([m]);
          s = read();
          if (s !== t) throw new Error('window bookkeeping went wrong');
          moved = true;
          break;
        }
      }
      if (!moved) throw new Error('window table is inconsistent');
    }
  }

  lock(...cells: number[]): void {
    for (const c of cells) this.locked[c] = true;
  }
}

/** ハードの盤を解く手順(最短ではない)。解けない盤面なら例外 */
export function solveAligned(start: Board, tables: AlignedTables): Move[] {
  const s = new Solver(start);
  if (start.size === 3) {
    s.placeSingle(0);
    s.gather([1, 2, 4, 5, 7, 8], 1, 2);
    s.solveWindow(tables.top2, [1, 2, 4, 5, 7, 8]);
    s.lock(1, 2);
    s.solveWindow(tables.all, [3, 4, 5, 6, 7, 8]);
  } else {
    s.placeSingle(0);
    s.placeSingle(1);
    s.gather([2, 3, 6, 7, 10, 11], 2, 3);
    s.solveWindow(tables.top2, [2, 3, 6, 7, 10, 11]);
    s.lock(2, 3);
    s.placeSingle(4);
    s.placeSingle(5);
    s.gather([6, 7, 10, 11, 14, 15], 6, 7);
    s.solveWindow(tables.top2, [6, 7, 10, 11, 14, 15]);
    s.lock(6, 7);
    s.gather([8, 9, 10, 12, 13, 14], 8, 12);
    s.solveWindow(tables.left2, [8, 9, 10, 12, 13, 14]);
    s.lock(8, 12);
    s.solveWindow(tables.all, [9, 10, 11, 13, 14, 15]);
  }
  if (!isAligned(s.b)) throw new Error('solver finished without aligning the board');
  return s.path;
}
