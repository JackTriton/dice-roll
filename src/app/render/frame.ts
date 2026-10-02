// 「ある瞬間の盤の見た目」を表すデータと、それを求める処理。
// プレイ中(LiveAnimator)とリプレイ・動画(ReplayTimeline)で同じ形を使い、同じ描画関数に渡す。

import { applyMove, cloneBoard, moveSource, type Board } from '../../core/board.ts';
import type { Move } from '../../core/dice.ts';
import {
  DEFAULT_TIMING,
  boardsBeforeGestures,
  placeAnimation,
  scheduleGestures,
  type AnimTiming,
  type Gesture,
  type SolveLog,
} from '../../core/replay.ts';

export interface MovingDie {
  from: number;
  to: number;
  orient: number;
  move: Move;
}

export interface FrameState {
  /** 動いているサイコロを除いた盤(動いているサイコロのマスは from 側に残っているので描かない) */
  board: Board;
  moving: readonly MovingDie[];
  /** 動きの進み具合 0..1 */
  t: number;
}

/** 盤 board に手 moves を順に適用したときに動くサイコロ(board は変えない) */
export function movingDice(board: Board, moves: readonly Move[]): MovingDie[] {
  const b = cloneBoard(board);
  const out: MovingDie[] = [];
  for (const m of moves) {
    const src = moveSource(b, m);
    if (src < 0) break;
    out.push({ from: src, to: b.blank, orient: b.cells[src], move: m });
    applyMove(b, m);
  }
  return out;
}

/** プレイ中のアニメーション。入力は即座に盤へ反映し、見た目は時間割りに沿って後から追いかける */
export class LiveAnimator {
  private display: Board;
  private queue: { moving: MovingDie[]; start: number; end: number; after: Board }[] = [];
  private lastEnd = -Infinity;
  private readonly timing: AnimTiming;

  constructor(board: Board, timing: AnimTiming = DEFAULT_TIMING) {
    this.display = cloneBoard(board);
    this.timing = timing;
  }

  reset(board: Board): void {
    this.display = cloneBoard(board);
    this.queue = [];
    this.lastEnd = -Infinity;
  }

  /** 時刻 t(performance.now)に入力された手のまとまりを積む */
  push(moves: readonly Move[], t: number): void {
    if (moves.length === 0) return;
    const base = this.queue.length ? this.queue[this.queue.length - 1].after : this.display;
    const after = cloneBoard(base);
    for (const m of moves) applyMove(after, m);
    const { start, end } = placeAnimation(this.lastEnd, t, this.timing);
    this.lastEnd = end;
    this.queue.push({ moving: movingDice(base, moves), start, end, after });
  }

  get busy(): boolean {
    return this.queue.length > 0;
  }

  frame(now: number): FrameState {
    while (this.queue.length && now >= this.queue[0].end) this.display = this.queue.shift()!.after;
    const head = this.queue[0];
    if (!head || now < head.start) return { board: this.display, moving: [], t: 0 };
    return { board: this.display, moving: head.moving, t: (now - head.start) / (head.end - head.start) };
  }
}

/** 記録からの再生。時刻はタイマーの時刻(ミリ秒) */
export class ReplayTimeline {
  readonly gestures: Gesture[];
  private readonly boards: Board[];
  private readonly moving: MovingDie[][];

  readonly log: SolveLog;

  constructor(log: SolveLog, timing: AnimTiming = DEFAULT_TIMING) {
    this.log = log;
    this.gestures = scheduleGestures(log.times, timing);
    this.boards = boardsBeforeGestures(log, this.gestures);
    this.moving = this.gestures.map((g, i) =>
      movingDice(this.boards[i], log.moves.slice(g.from, g.to).split('') as Move[]),
    );
  }

  /** 最初の操作の時刻 */
  get firstTime(): number {
    return this.gestures.length ? this.gestures[0].time : 0;
  }

  /** 最後のアニメーションが終わる時刻 */
  get lastEnd(): number {
    return this.gestures.length ? this.gestures[this.gestures.length - 1].end : 0;
  }

  /** その時刻までに入力された手の数 */
  movesAt(t: number): number {
    let n = 0;
    for (const g of this.gestures) if (g.time <= t) n = g.to;
    return n;
  }

  frameAt(t: number): FrameState {
    const g = this.gestures;
    // start <= t となる最後の操作を二分探索
    let lo = 0;
    let hi = g.length - 1;
    let k = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (g[mid].start <= t) {
        k = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (k < 0) return { board: this.boards[0], moving: [], t: 0 };
    if (t < g[k].end)
      return { board: this.boards[k], moving: this.moving[k], t: (t - g[k].start) / (g[k].end - g[k].start) };
    return { board: this.boards[k + 1], moving: [], t: 0 };
  }
}
