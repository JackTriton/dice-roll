// 1回のタイムアタックの進行: 開始前 → 計測 → 完了(またはリタイア)。計測は最初の1手で始まる。
// 時刻はすべて performance.now() と同じ基準のミリ秒。

import { applyMove, cloneBoard, encodeBoard, isGoal, type Board } from '../../core/board.ts';
import type { Rule, Size } from '../../core/constants.ts';
import type { Move } from '../../core/dice.ts';
import type { SolveLog } from '../../core/replay.ts';

export type Phase = 'ready' | 'solve' | 'done' | 'retired';

export interface SessionInfo {
  size: Size;
  /** クリアの条件 */
  rule: Rule;
  /** ranked = サーバーの問題でランキングに載せられる、practice = 端末で作った問題 */
  mode: 'ranked' | 'practice' | 'tutorial';
  scrambleId: string | null;
}

export class Session {
  readonly info: SessionInfo;
  readonly board: Board;
  readonly scramble: string;
  phase: Phase = 'ready';
  /** 計測の開始時刻(最初の1手の入力時刻) */
  t0 = 0;
  moves = '';
  times: number[] = [];
  endTime = 0;
  /** アプリを離れた時刻(performance.now と Date.now の両方) */
  private hiddenAt: { perf: number; wall: number } | null = null;

  constructor(info: SessionInfo, start: Board) {
    this.info = info;
    this.board = cloneBoard(start);
    this.scramble = encodeBoard(start);
  }

  /** 経過時間(計測前は 0、完了後は確定したタイム) */
  elapsed(now: number): number {
    if (this.phase === 'ready') return 0;
    if (this.phase === 'done' || this.phase === 'retired') return this.endTime;
    return Math.max(0, now - this.t0);
  }

  /**
   * 1回の操作で入力された手を適用し、実際に適用できた手を返す。
   * 途中で揃ったら、そこで止めて完了にする(それ以降の手は捨てる)。
   */
  input(moves: readonly Move[], now: number): Move[] {
    if (this.phase === 'done' || this.phase === 'retired') return [];
    const applied: Move[] = [];
    for (const m of moves) {
      if (!applyMove(this.board, m)) break;
      if (this.phase === 'ready') {
        this.phase = 'solve';
        this.t0 = now;
      }
      applied.push(m);
      this.moves += m;
      this.times.push(Math.round(now - this.t0));
      if (isGoal(this.board, this.info.rule)) {
        this.phase = 'done';
        this.endTime = this.times[this.times.length - 1];
        break;
      }
    }
    return applied;
  }

  /** 揃って完了したか(呼び出し側の型の絞り込みに引きずられないよう getter にしている) */
  get solved(): boolean {
    return this.phase === 'done';
  }

  retire(now: number): void {
    if (this.phase === 'done') return;
    this.endTime = this.elapsed(now);
    this.phase = 'retired';
  }

  /** アプリを離れた。離れている間も計測は続く */
  hide(perf: number, wall: number): void {
    if (this.phase === 'solve') this.hiddenAt = { perf, wall };
  }

  /**
   * アプリに戻った。端末のスリープ中に performance.now() が止まる環境では、離れていた実際の時間との差を
   * 計測の開始時刻からさかのぼって足し、離れていた時間もタイムに入れる。
   */
  show(perf: number, wall: number): void {
    const h = this.hiddenAt;
    this.hiddenAt = null;
    if (!h || this.phase !== 'solve') return;
    const lost = wall - h.wall - (perf - h.perf);
    if (lost > 50) this.t0 -= lost;
  }

  log(): SolveLog {
    const log: SolveLog = { scramble: this.scramble, moves: this.moves, times: this.times.slice() };
    if (this.info.rule !== 'ones') log.rule = this.info.rule;
    return log;
  }
}

export function formatTime(ms: number): string {
  const cs = Math.floor(ms / 10);
  const s = Math.floor(cs / 100);
  const m = Math.floor(s / 60);
  const frac = String(cs % 100).padStart(2, '0');
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}.${frac}` : `${s}.${frac}`;
}
