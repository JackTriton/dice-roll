import { describe, expect, it } from 'vitest';
import {
  applyMove,
  cloneBoard,
  encodeBoard,
  isSolved,
  solvedBoard,
  type Board,
} from '../../src/core/board.ts';
import { MOVES, OPPOSITE, type Move } from '../../src/core/dice.ts';
import { randInt, seededRng } from '../../src/core/random.ts';
import { DEFAULT_TIMING, boardAfter, scheduleGestures } from '../../src/core/replay.ts';
import { verifySolve } from '../../src/core/verify.ts';

/** 揃った盤から無作為に崩して、その逆順を解答とする(途中で揃わないものだけ採用) */
function makeCase(seed: number, size: 3 | 4 = 3, steps = 30): { scramble: Board; solution: Move[] } {
  const rng = seededRng(seed);
  for (;;) {
    const b = solvedBoard(size, randInt(rng, size * size));
    const walk: Move[] = [];
    let ok = true;
    while (walk.length < steps) {
      const m = MOVES[randInt(rng, 4)];
      if (walk.length && m === OPPOSITE[walk[walk.length - 1]]) continue;
      if (!applyMove(b, m)) continue;
      walk.push(m);
      if (isSolved(b)) {
        ok = false;
        break;
      }
    }
    if (ok) return { scramble: cloneBoard(b), solution: walk.reverse().map((m) => OPPOSITE[m]) };
  }
}

const times = (n: number, step = 200) => Array.from({ length: n }, (_, i) => i * step);

describe('verifySolve', () => {
  const { scramble, solution } = makeCase(10);
  const base = { scramble: encodeBoard(scramble), moves: solution.join(''), times: times(solution.length) };
  const timeMs = base.times[base.times.length - 1];

  it('accepts a correct solve', () => {
    expect(verifySolve({ ...base, timeMs })).toEqual({ ok: true, moves: solution.length, timeMs });
  });

  it('rejects tampered moves', () => {
    const moves = base.moves.slice(0, -1) + (base.moves.endsWith('U') ? 'D' : 'U');
    const r = verifySolve({ ...base, moves, timeMs });
    expect(r.ok).toBe(false);
  });

  it('rejects an unfinished solve', () => {
    const r = verifySolve({
      ...base,
      moves: base.moves.slice(0, -1),
      times: base.times.slice(0, -1),
      timeMs: base.times.at(-2)!,
    });
    expect(r).toEqual({ ok: false, reason: 'not_solved' });
  });

  it('rejects moves after the puzzle is already solved', () => {
    const last = solution[solution.length - 1];
    const moves = base.moves + OPPOSITE[last] + last;
    const t = times(moves.length);
    expect(verifySolve({ ...base, moves, times: t, timeMs: t.at(-1)! })).toEqual({
      ok: false,
      reason: 'solved_early',
    });
  });

  it('rejects a reported time that differs from the last move', () => {
    expect(verifySolve({ ...base, timeMs: timeMs - 1 })).toEqual({ ok: false, reason: 'time_mismatch' });
  });

  it('rejects decreasing times', () => {
    const t = base.times.slice();
    [t[3], t[4]] = [t[4], t[3]];
    expect(verifySolve({ ...base, times: t, timeMs })).toEqual({ ok: false, reason: 'times_decreasing' });
  });

  it('rejects inhumanly fast solves but counts same-time moves as one gesture', () => {
    const fast = times(solution.length, 20);
    expect(verifySolve({ ...base, times: fast, timeMs: fast.at(-1)! })).toEqual({
      ok: false,
      reason: 'too_fast',
    });
    // 3手ずつ同じ時刻(タップでまとめて転がした)なら、操作の間隔は 3 倍で数える
    const grouped = base.times.map((_, i) => Math.floor(i / 3) * 70);
    expect(verifySolve({ ...base, times: grouped, timeMs: grouped.at(-1)! }).ok).toBe(true);
  });

  it('rejects an already solved scramble and garbage', () => {
    const solved = encodeBoard(solvedBoard(3));
    expect(verifySolve({ scramble: solved, moves: 'U', times: [0], timeMs: 0 })).toEqual({
      ok: false,
      reason: 'already_solved',
    });
    expect(verifySolve({ ...base, moves: 'XYZ', timeMs }).ok).toBe(false);
    expect(verifySolve({ ...base, times: [1.5], timeMs }).ok).toBe(false);
    expect(verifySolve({ ...base, scramble: 'nope', timeMs }).ok).toBe(false);
  });

  it('works for 4x4', () => {
    const c = makeCase(11, 4, 60);
    const t = times(c.solution.length, 150);
    expect(
      verifySolve({
        scramble: encodeBoard(c.scramble),
        moves: c.solution.join(''),
        times: t,
        timeMs: t.at(-1)!,
      }).ok,
    ).toBe(true);
  });
});

describe('animation schedule', () => {
  it('queues gestures and shortens the backlog', () => {
    const g = scheduleGestures([0, 100, 100, 150], DEFAULT_TIMING);
    expect(g).toEqual([
      { from: 0, to: 1, time: 0, start: 0, end: 130 },
      { from: 1, to: 3, time: 100, start: 130, end: 230 },
      { from: 3, to: 4, time: 150, start: 230, end: 280 },
    ]);
  });

  it('never goes below the minimum duration', () => {
    const g = scheduleGestures(
      Array.from({ length: 20 }, () => 0).map((_, i) => i),
      DEFAULT_TIMING,
    );
    for (const x of g) expect(x.end - x.start).toBeGreaterThanOrEqual(DEFAULT_TIMING.min);
  });

  it('replays boards', () => {
    const { scramble, solution } = makeCase(12);
    const log = { scramble: encodeBoard(scramble), moves: solution.join(''), times: times(solution.length) };
    expect(isSolved(boardAfter(log, solution.length))).toBe(true);
    expect(encodeBoard(boardAfter(log, 0))).toBe(log.scramble);
  });
});
