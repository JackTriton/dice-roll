import { describe, expect, it } from 'vitest';
import { alignedExample } from '../../src/core/aligned.ts';
import {
  applyMove,
  cloneBoard,
  encodeBoard,
  isGoal,
  isSolved,
  solvedBoard,
  type Board,
} from '../../src/core/board.ts';
import { MAX_MOVES } from '../../src/core/constants.ts';
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

describe('verifySolve: long solves', () => {
  /** 解答の前に「1手動かして戻す」を pairs 回入れて、長い解答にする(途中で揃わない) */
  function padded(c: { scramble: Board; solution: Move[] }, pairs: number): Move[] {
    const first = MOVES.find((m) => {
      const b = cloneBoard(c.scramble);
      return applyMove(b, m) && !isSolved(b);
    })!;
    const out: Move[] = [];
    for (let i = 0; i < pairs; i++) out.push(first, OPPOSITE[first]);
    return [...out, ...c.solution];
  }
  const submission = (scramble: Board, moves: Move[], step = 200) => {
    const times = moves.map((_, i) => i * step);
    return { scramble: encodeBoard(scramble), moves: moves.join(''), times, timeMs: times[times.length - 1] };
  };

  it('accepts a solve of many thousands of moves that takes hours', () => {
    const c = makeCase(11);
    const moves = padded(c, 10_000);
    expect(moves.length).toBeGreaterThan(20_000);
    const r = verifySolve(submission(c.scramble, moves, 700));
    expect(r).toEqual({ ok: true, moves: moves.length, timeMs: (moves.length - 1) * 700 });
    // 3時間半を超える
    expect((moves.length - 1) * 700).toBeGreaterThan(3.5 * 60 * 60_000);
  });

  it('accepts up to MAX_MOVES and rejects more', () => {
    const c = makeCase(12);
    const pairs = (MAX_MOVES - c.solution.length) / 2;
    expect(Number.isInteger(pairs)).toBe(true);
    expect(verifySolve(submission(c.scramble, padded(c, pairs))).ok).toBe(true);
    expect(verifySolve(submission(c.scramble, padded(c, pairs + 1)))).toEqual({
      ok: false,
      reason: 'bad_format',
    });
  });

  it('judges every position the same way as checking the whole board after each move', () => {
    // 揃ったかどうかを数え上げで判定しているので、盤全体を見直す判定(isGoal)と食い違わないことを確かめる
    const rng = seededRng(99);
    for (const rule of ['ones', 'aligned'] as const)
      for (const size of [3, 4] as const)
        for (let n = 0; n < 60; n++) {
          // 揃った盤から数手だけ崩す(揃った盤を何度も通る、短い行き来を作るため)
          const goal =
            rule === 'aligned' ? alignedExample(size, 'done') : solvedBoard(size, randInt(rng, size * size));
          const start = cloneBoard(goal);
          for (let i = 0; i < 1 + randInt(rng, 3); i++) applyMove(start, MOVES[randInt(rng, 4)]);
          if (isGoal(start, rule)) continue;
          const b = cloneBoard(start);
          const moves: Move[] = [];
          // 揃うまで無作為に動かす(揃ったらそこで止める)。揃わなければ、揃わないまま終わる記録になる
          for (let i = 0; i < 40 && !isGoal(b, rule); i++) {
            const m = MOVES[randInt(rng, 4)];
            if (applyMove(b, m)) moves.push(m);
          }
          if (moves.length === 0) continue;
          const expected = isGoal(b, rule) ? { ok: true } : { ok: false, reason: 'not_solved' };
          const r = verifySolve({ ...submission(start, moves, 300), rule });
          expect(r, `${rule} ${size} ${encodeBoard(start)} ${moves.join('')}`).toMatchObject(expected);
          // 揃ったあとにもう1手動かした記録は「途中で揃っていた」
          if (isGoal(b, rule)) {
            const extra = MOVES.find((m) => applyMove(cloneBoard(b), m))!;
            const more = verifySolve({ ...submission(start, [...moves, extra], 300), rule });
            expect(more).toEqual({ ok: false, reason: 'solved_early' });
          }
        }
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
