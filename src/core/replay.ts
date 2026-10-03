// 解いた記録の形と、アニメーションの時間割り。
//
// 時間割りはゲーム中の表示とリプレイ動画の両方で同じ関数を使い、動画の動きをプレイ中の見た目と一致させる。

import { applyMove, cloneBoard, decodeBoard, type Board } from './board.ts';
import type { Rule } from './constants.ts';
import type { Move } from './dice.ts';

export interface SolveLog {
  /** 初期盤面(encodeBoard の文字列) */
  scramble: string;
  /** 手の列(U/D/L/R) */
  moves: string;
  /** 1手ごとの時刻(計測開始からのミリ秒)。同じ時刻の手は1回の操作でまとめて転がしたもの */
  times: number[];
  /** クリアの条件(無ければ ones) */
  rule?: Rule;
}

export const solveTime = (log: SolveLog): number => log.times[log.times.length - 1] ?? 0;

export interface AnimTiming {
  /** 1回の操作のアニメーションの長さ */
  base: number;
  /** 行列がたまったときに縮める下限 */
  min: number;
}

export const DEFAULT_TIMING: AnimTiming = { base: 130, min: 45 };

/** 1回の操作(同じ時刻の手のまとまり)と、そのアニメーションの開始・終了時刻 */
export interface Gesture {
  /** moves の範囲 [from, to) */
  from: number;
  to: number;
  /** 入力された時刻 */
  time: number;
  start: number;
  end: number;
}

/**
 * 直前のアニメーションの終了時刻 prevEnd のあとに、時刻 t の入力のアニメーションを置く。
 * 前のアニメーションが終わっていなければ待ち、待った分だけ短くして追いつかせる。
 */
export function placeAnimation(
  prevEnd: number,
  t: number,
  timing: AnimTiming,
): { start: number; end: number } {
  const start = Math.max(t, prevEnd);
  const duration = Math.max(timing.min, timing.base - (start - t));
  return { start, end: start + duration };
}

export function scheduleGestures(times: readonly number[], timing: AnimTiming = DEFAULT_TIMING): Gesture[] {
  const out: Gesture[] = [];
  let prevEnd = -Infinity;
  for (let i = 0; i < times.length;) {
    let j = i + 1;
    while (j < times.length && times[j] === times[i]) j++;
    const { start, end } = placeAnimation(prevEnd, times[i], timing);
    out.push({ from: i, to: j, time: times[i], start, end });
    prevEnd = end;
    i = j;
  }
  return out;
}

/** 初期盤面に最初の n 手を適用した盤 */
export function boardAfter(log: SolveLog, n: number): Board {
  const b = decodeBoard(log.scramble);
  if (!b) throw new Error('bad scramble');
  for (let i = 0; i < n && i < log.moves.length; i++) applyMove(b, log.moves[i] as Move);
  return b;
}

/** 記録の各操作の直前の盤を順に返す(リプレイ用) */
export function boardsBeforeGestures(log: SolveLog, gestures: readonly Gesture[]): Board[] {
  const b = decodeBoard(log.scramble);
  if (!b) throw new Error('bad scramble');
  const out: Board[] = [];
  for (const g of gestures) {
    out.push(cloneBoard(b));
    for (let i = g.from; i < g.to; i++) applyMove(b, log.moves[i] as Move);
  }
  out.push(cloneBoard(b));
  return out;
}
