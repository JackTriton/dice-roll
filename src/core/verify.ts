// 記録の検証。サーバー(Worker)が登録前に使い、ブラウザも送信前に同じ検証をかける。

import { applyMove, decodeBoard, isSolved } from './board.ts';
import { MAX_MOVES, MIN_AVG_GESTURE_MS } from './constants.ts';
import type { Move } from './dice.ts';

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
}

const MOVE_RE = /^[UDLR]+$/;

export function verifySolve(s: SolveSubmission, minAvgGestureMs = MIN_AVG_GESTURE_MS): VerifyResult {
  const b = typeof s.scramble === 'string' ? decodeBoard(s.scramble) : null;
  if (
    !b ||
    typeof s.moves !== 'string' ||
    !MOVE_RE.test(s.moves) ||
    s.moves.length > MAX_MOVES ||
    !Array.isArray(s.times) ||
    s.times.length !== s.moves.length ||
    !s.times.every((t) => Number.isSafeInteger(t) && t >= 0) ||
    !Number.isSafeInteger(s.timeMs)
  )
    return { ok: false, reason: 'bad_format' };
  if (isSolved(b)) return { ok: false, reason: 'already_solved' };

  for (let i = 1; i < s.times.length; i++)
    if (s.times[i] < s.times[i - 1]) return { ok: false, reason: 'times_decreasing' };
  if (s.times[s.times.length - 1] !== s.timeMs) return { ok: false, reason: 'time_mismatch' };

  for (let i = 0; i < s.moves.length; i++) {
    if (!applyMove(b, s.moves[i] as Move)) return { ok: false, reason: 'illegal_move' };
    const solved = isSolved(b);
    if (solved && i < s.moves.length - 1) return { ok: false, reason: 'solved_early' };
    if (!solved && i === s.moves.length - 1) return { ok: false, reason: 'not_solved' };
  }

  // 同じ時刻の手は1回の操作として数え、操作の平均間隔が速すぎないかを見る
  let gestures = 1;
  for (let i = 1; i < s.times.length; i++) if (s.times[i] !== s.times[i - 1]) gestures++;
  if (gestures >= 2 && (s.timeMs - s.times[0]) / (gestures - 1) < minAvgGestureMs)
    return { ok: false, reason: 'too_fast' };

  return { ok: true, moves: s.moves.length, timeMs: s.timeMs };
}
