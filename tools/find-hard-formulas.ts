// ハード(向きまで揃える)の定石を、両側からの幅優先探索で求める(3×3)。
//
//   node --max-old-space-size=8192 tools/find-hard-formulas.ts
//
// 1は全部上で、向きだけがずれた盤(空きは真ん中)について、次の2種類の最短手順を出す。
//   solve  = そのまま揃える(全部を正立にする。空きは角か真ん中のどこで終わってもよい)
//   return = 全部を正立にして、最後に空きマスを真ん中へ戻す(続けて使える)
// 結果は src/core/alignedFormulas.ts に写す(tests/core/alignedFormulas.test.ts が、手順で揃うことを確かめる)。

import { ALIGNED_BASE, UP_ORIENTS } from '../src/core/aligned.ts';
import { ALIGNED_FORMULAS } from '../src/core/alignedFormulas.ts';
import { MOVES, OPPOSITE, ORIENT_PARITY, ROLL, type Move } from '../src/core/dice.ts';

// 状態: 空き位置(4bit) + 8個の向き(5bit ずつ、空きを飛ばしたマス順)。2^44 未満なので Number で正確に持てる
const o = new Uint8Array(9);
function enc(blank: number, cells: Uint8Array): number {
  let v = 0;
  for (let c = 8; c >= 0; c--) if (c !== blank) v = v * 32 + cells[c];
  return v * 16 + blank;
}
function dec(s: number, cells: Uint8Array): number {
  const blank = s % 16;
  let v = Math.floor(s / 16);
  for (let c = 0; c < 9; c++) {
    if (c === blank) {
      cells[c] = 255;
      continue;
    }
    cells[c] = v % 32;
    v = Math.floor(v / 32);
  }
  return blank;
}
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
/** s から1手で行ける状態を順に渡す */
function expand(s: number, visit: (n: number, m: Move) => void): void {
  const blank = dec(s, o);
  for (const m of MOVES) {
    const sc = source(blank, m);
    if (sc < 0) continue;
    const moved = o[sc];
    o[blank] = ROLL[m][moved];
    o[sc] = 255;
    visit(enc(sc, o), m);
    o[sc] = moved;
    o[blank] = 255;
  }
}

/** 状態 → 深さ の表(開番地法。Map より1桁少ないメモリで済む) */
class DepthTable {
  private keys: Float64Array;
  private vals: Uint8Array;
  private mask: number;
  size = 0;
  constructor(bits: number) {
    this.keys = new Float64Array(2 ** bits).fill(-1);
    this.vals = new Uint8Array(2 ** bits);
    this.mask = 2 ** bits - 1;
  }
  private slot(k: number): number {
    const lo = (k % 4294967296) >>> 0;
    const hi = Math.floor(k / 4294967296);
    let h = Math.imul(lo ^ Math.imul(hi + 0x9e3779b1, 0x85ebca6b), 0xc2b2ae35);
    h ^= h >>> 15;
    let i = h & this.mask;
    while (this.keys[i] !== -1 && this.keys[i] !== k) i = (i + 1) & this.mask;
    return i;
  }
  get(k: number): number {
    const i = this.slot(k);
    return this.keys[i] === k ? this.vals[i] : -1;
  }
  /** 無ければ入れて true */
  add(k: number, v: number): boolean {
    const i = this.slot(k);
    if (this.keys[i] === k) return false;
    this.keys[i] = k;
    this.vals[i] = v;
    this.size++;
    return true;
  }
}

function bfs(starts: number[], maxDepth: number, bits: number, stopAt?: (s: number, d: number) => boolean) {
  const table = new DepthTable(bits);
  let frontier = starts.slice();
  for (const s of starts) table.add(s, 0);
  let d = 0;
  for (; d < maxDepth && frontier.length; d++) {
    const next: number[] = [];
    for (const s of frontier)
      expand(s, (n) => {
        if (table.add(n, d + 1)) next.push(n);
      });
    frontier = next;
    if (stopAt && frontier.some((s) => stopAt(s, d + 1))) {
      d++;
      break;
    }
  }
  return { table, depth: d };
}

/** 深さの表を、深さが1ずつ減る向きにたどる。返すのは、たどった手(s から始点へ向かう順) */
function descend(table: DepthTable, s: number): Move[] {
  const path: Move[] = [];
  let d = table.get(s);
  while (d > 0) {
    let found = false;
    expand(s, (n, m) => {
      if (!found && table.get(n) === d - 1) {
        found = true;
        s = n;
        path.push(m);
      }
    });
    if (!found) throw new Error('depth table is inconsistent');
    d--;
  }
  return path;
}

/** start からゴール側の表までの最短手順。fwdDepth 手までに届かなければ null */
function solve(goal: DepthTable, start: number, fwdDepth: number): string | null {
  let best = goal.get(start) >= 0 ? goal.get(start) : Infinity;
  let meet = best === Infinity ? -1 : start;
  const fwd = new DepthTable(24);
  fwd.add(start, 0);
  let frontier = [start];
  for (let k = 1; k <= fwdDepth && k < best; k++) {
    const next: number[] = [];
    for (const s of frontier)
      expand(s, (n) => {
        if (!fwd.add(n, k)) return;
        next.push(n);
        const g = goal.get(n);
        if (g >= 0 && g + k < best) {
          best = g + k;
          meet = n;
        }
      });
    frontier = next;
    if (fwd.size > 8_000_000) break;
  }
  if (meet < 0) return null;
  // 前半: 合流点から start へ戻る手を逆にたどる(逆向きの手を、逆順に)
  const back = descend(fwd, meet);
  const first = back.reverse().map((m) => OPPOSITE[m]);
  const second = descend(goal, meet);
  return [...first, ...second].join('');
}

const BASE = ALIGNED_BASE;
const HALF = UP_ORIENTS.find((t) => t !== BASE && ORIENT_PARITY[t] === ORIENT_PARITY[BASE])!; // 180°
const QUARTERS = UP_ORIENTS.filter((t) => ORIENT_PARITY[t] !== ORIENT_PARITY[BASE]); // 90°(2通り)

function board(changes: Record<number, number>): number {
  o.fill(BASE);
  for (const [c, t] of Object.entries(changes)) o[Number(c)] = t;
  return enc(4, o);
}

const CASES: { id: string; start: number }[] = [
  { id: 'half-edge', start: board({ 3: HALF }) },
  { id: 'half-corner', start: board({ 0: HALF }) },
  { id: 'pair-adjacent-a', start: board({ 0: QUARTERS[0], 3: QUARTERS[0] }) },
  { id: 'pair-adjacent-b', start: board({ 0: QUARTERS[0], 3: QUARTERS[1] }) },
  { id: 'pair-adjacent-c', start: board({ 0: QUARTERS[1], 3: QUARTERS[0] }) },
  { id: 'pair-adjacent-d', start: board({ 0: QUARTERS[1], 3: QUARTERS[1] }) },
  { id: 'pair-apart-a', start: board({ 0: QUARTERS[0], 5: QUARTERS[0] }) },
  { id: 'pair-apart-b', start: board({ 0: QUARTERS[0], 5: QUARTERS[1] }) },
  { id: 'pair-apart-c', start: board({ 0: QUARTERS[1], 5: QUARTERS[0] }) },
  { id: 'pair-apart-d', start: board({ 0: QUARTERS[1], 5: QUARTERS[1] }) },
];

const GOAL_DEPTH = Number(process.argv[2] ?? 24);
const PURE_DEPTH = Number(process.argv[3] ?? 28);
const FWD_DEPTH = Number(process.argv[4] ?? 26);

console.error(`base ${BASE}, half ${HALF}, quarters ${QUARTERS.join(',')}`);
let t0 = Date.now();
const anyGoals: number[] = [];
for (const blank of [0, 2, 4, 6, 8]) {
  o.fill(BASE);
  anyGoals.push(enc(blank, o));
}
const any = bfs(anyGoals, GOAL_DEPTH, 26);
console.error(`solve table: depth ${any.depth}, ${any.table.size} states, ${Date.now() - t0} ms`);
const out: Record<string, { solve: string | null; return: string | null }> = {};
for (const c of CASES) {
  out[c.id] = { solve: solve(any.table, c.start, FWD_DEPTH), return: null };
  console.error(`${c.id} solve: ${out[c.id].solve?.length ?? '-'} ${out[c.id].solve ?? ''}`);
}
t0 = Date.now();
o.fill(BASE);
const pure = bfs([enc(4, o)], PURE_DEPTH, 26);
console.error(`return table: depth ${pure.depth}, ${pure.table.size} states, ${Date.now() - t0} ms`);
for (const c of CASES) {
  out[c.id].return = solve(pure.table, c.start, FWD_DEPTH);
  console.error(`${c.id} return: ${out[c.id].return?.length ?? '-'} ${out[c.id].return ?? ''}`);
}
console.log(JSON.stringify({ base: BASE, half: HALF, quarters: QUARTERS, formulas: out }, null, 2));

// アプリに載せた定石(src/core/alignedFormulas.ts)が、いま求めた最短手数と同じ長さかを確かめる
let mismatches = 0;
for (const f of ALIGNED_FORMULAS) {
  const found = out[f.id];
  if (found?.solve?.length !== f.moves.length || found?.return?.length !== f.movesReturn.length) {
    mismatches++;
    console.error(
      `MISMATCH ${f.id}: app ${f.moves.length}/${f.movesReturn.length}, found ${found?.solve?.length}/${found?.return?.length}`,
    );
  }
}
console.error(
  mismatches ? `${mismatches} mismatches` : `all ${ALIGNED_FORMULAS.length} formulas are optimal`,
);
if (mismatches) process.exit(1);
