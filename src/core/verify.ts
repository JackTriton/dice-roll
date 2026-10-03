// 記録の検証。サーバー(Worker)が登録前に使い、ブラウザも送信前に同じ検証をかける。

import { BLANK, decodeBoard } from './board.ts';
import { MAX_MOVES, MIN_AVG_GESTURE_MS, type Rule } from './constants.ts';
import { ROLL, UPRIGHT, topPip } from './dice.ts';

export type RejectReason =
  | 'bad_format'
  | 'already_solved'
  | 'illegal_move'
  | 'solved_early'
  | 'not_solved'
  | 'times_decreasing'
  | 'time_mismatch'
  | 'too_fast';

export type VerifyResult = { ok: true; moves: number; timeMs: number } | { ok: false; reason: RejectReason };

export interface SolveSubmission {
  scramble: string;
  moves: string;
  times: number[];
  timeMs: number;
  /** クリアの条件(無ければ ones) */
  rule?: Rule;
}

const MOVE_RE = /^[UDLR]+$/;

/** 揃ったと数えるサイコロの向き(ふつうは「1が上」、ハードは「正立」)。board.ts の isGoal と同じ基準 */
const DONE: Record<Rule, Uint8Array> = {
  ones: Uint8Array.from({ length: 24 }, (_, o) => (topPip(o) === 1 ? 1 : 0)),
  aligned: Uint8Array.from({ length: 24 }, (_, o) => (o === UPRIGHT ? 1 : 0)),
};
const CODE_U = 'U'.charCodeAt(0);
const CODE_D = 'D'.charCodeAt(0);
const CODE_L = 'L'.charCodeAt(0);

export function verifySolve(s: SolveSubmission, minAvgGestureMs = MIN_AVG_GESTURE_MS): VerifyResult {
  const b = typeof s.scramble === 'string' ? decodeBoard(s.scramble) : null;
  const done = DONE[s.rule ?? 'ones'];
  if (
    !b ||
    !done ||
    typeof s.moves !== 'string' ||
    s.moves.length > MAX_MOVES ||
    !MOVE_RE.test(s.moves) ||
    !Array.isArray(s.times) ||
    s.times.length !== s.moves.length ||
    !Number.isSafeInteger(s.timeMs)
  )
    return { ok: false, reason: 'bad_format' };
  const { moves, times } = s;
  const n = moves.length;
  for (let i = 0; i < n; i++)
    if (!Number.isSafeInteger(times[i]) || times[i] < 0) return { ok: false, reason: 'bad_format' };

  // 揃っていないサイコロの数を数えておき、1手ごとに、動いたサイコロの分だけ直す。
  // 1手ごとに盤全体を見直さないので、数万手の記録でも速く検証できる(サーバーが1回に使える処理時間は短い)
  const cells = b.cells;
  const size = b.size;
  let left = 0;
  for (let c = 0; c < cells.length; c++) if (cells[c] !== BLANK && !done[cells[c]]) left++;
  if (left === 0) return { ok: false, reason: 'already_solved' };

  for (let i = 1; i < n; i++) if (times[i] < times[i - 1]) return { ok: false, reason: 'times_decreasing' };
  if (times[n - 1] !== s.timeMs) return { ok: false, reason: 'time_mismatch' };

  let blank = b.blank;
  for (let i = 0; i < n; i++) {
    // その方向へ動くサイコロは、空きマスの反対側にいる(board.ts の moveSource・applyMove と同じ動き)
    let from: number;
    let roll: Uint8Array;
    switch (moves.charCodeAt(i)) {
      case CODE_U:
        from = blank + size < cells.length ? blank + size : -1;
        roll = ROLL.U;
        break;
      case CODE_D:
        from = blank - size;
        roll = ROLL.D;
        break;
      case CODE_L:
        from = blank % size < size - 1 ? blank + 1 : -1;
        roll = ROLL.L;
        break;
      default:
        from = blank % size > 0 ? blank - 1 : -1;
        roll = ROLL.R;
    }
    if (from < 0) return { ok: false, reason: 'illegal_move' };
    const before = cells[from];
    const after = roll[before];
    cells[blank] = after;
    cells[from] = BLANK;
    blank = from;
    left += done[before] - done[after];
    if (left === 0 && i < n - 1) return { ok: false, reason: 'solved_early' };
    if (left !== 0 && i === n - 1) return { ok: false, reason: 'not_solved' };
  }

  // 同じ時刻の手は1回の操作として数え、操作の平均間隔が速すぎないかを見る
  let gestures = 1;
  for (let i = 1; i < n; i++) if (times[i] !== times[i - 1]) gestures++;
  if (gestures >= 2 && (s.timeMs - times[0]) / (gestures - 1) < minAvgGestureMs)
    return { ok: false, reason: 'too_fast' };

  return { ok: true, moves: n, timeMs: s.timeMs };
}
