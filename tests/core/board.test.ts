import { describe, expect, it } from 'vitest';
import {
  BLANK,
  applyMove,
  cloneBoard,
  createBoard,
  decodeBoard,
  encodeBoard,
  isSolved,
  lowerBound,
  moveSource,
  solvedBoard,
  tapToMoves,
} from '../../src/core/board.ts';
import { MOVES, OPPOSITE, ROLL, TOP, PIPS, type Move } from '../../src/core/dice.ts';
import { decodePoolEntry, encodePoolEntry } from '../../src/core/pool.ts';
import { randInt, seededRng } from '../../src/core/random.ts';
import { randomBoard, randomScramble4 } from '../../src/core/scramble.ts';
import { LB4_MIN } from '../../src/core/constants.ts';

describe('board moves', () => {
  it('a die moves into the blank from the opposite side of the move direction', () => {
    const b = solvedBoard(3, 4); // 空きは中央
    expect(moveSource(b, 'U')).toBe(7); // 北へ動くのは空きの下のサイコロ
    expect(moveSource(b, 'D')).toBe(1);
    expect(moveSource(b, 'L')).toBe(5);
    expect(moveSource(b, 'R')).toBe(3);
  });

  it('cannot move when there is no die on that side', () => {
    const b = solvedBoard(3, 0); // 空きは左上
    expect(applyMove(b, 'D')).toBe(false);
    expect(applyMove(b, 'R')).toBe(false);
    expect(b.blank).toBe(0);
    expect(applyMove(b, 'U')).toBe(true);
    expect(b.blank).toBe(3);
  });

  it('rolling changes the top face', () => {
    const b = solvedBoard(3, 4);
    applyMove(b, 'R'); // 左のサイコロが東へ転がる → 上は西の面
    expect(PIPS[b.cells[4] * 6 + TOP]).toBe(PIPS[ROLL.R[0] * 6 + TOP]);
    expect(b.cells[3]).toBe(BLANK);
    expect(isSolved(b)).toBe(false);
  });

  it('random walks are undone by the reversed opposite moves', () => {
    const rng = seededRng(1);
    for (const size of [3, 4] as const) {
      const start = randomBoard(size, rng);
      const b = cloneBoard(start);
      const done: Move[] = [];
      for (let i = 0; i < 500; i++) {
        const m = MOVES[randInt(rng, 4)];
        if (applyMove(b, m)) done.push(m);
      }
      for (let i = done.length - 1; i >= 0; i--) expect(applyMove(b, OPPOSITE[done[i]])).toBe(true);
      expect(encodeBoard(b)).toBe(encodeBoard(start));
    }
  });

  it('tap moves roll every die between the tapped cell and the blank', () => {
    const b = solvedBoard(4, 15); // 空きは右下
    expect(tapToMoves(b, 12)).toEqual(['R', 'R', 'R']);
    expect(tapToMoves(b, 3)).toEqual(['D', 'D', 'D']);
    expect(tapToMoves(b, 5)).toEqual([]);
    expect(tapToMoves(b, 15)).toEqual([]);
    const c = solvedBoard(4, 0);
    expect(tapToMoves(c, 2)).toEqual(['L', 'L']);
    expect(tapToMoves(c, 8)).toEqual(['U', 'U']);
    for (const m of tapToMoves(b, 12)) expect(applyMove(b, m)).toBe(true);
    expect(b.blank).toBe(12);
  });

  it('encodes and decodes boards', () => {
    const rng = seededRng(2);
    for (let i = 0; i < 200; i++) {
      const b = randomBoard(i % 2 ? 3 : 4, rng);
      const s = encodeBoard(b);
      expect(s).toHaveLength(b.size * b.size);
      expect(encodeBoard(decodeBoard(s)!)).toBe(s);
    }
    expect(decodeBoard('abc')).toBeNull();
    expect(decodeBoard('aaaaaaaaa')).toBeNull(); // 空きが無い
    expect(decodeBoard('--aaaaaaa')).toBeNull(); // 空きが2つ
    expect(decodeBoard('yaaaaaaa-')).toBeNull(); // 範囲外の文字
  });

  it('solved and lower bound', () => {
    const b = solvedBoard(3);
    expect(isSolved(b)).toBe(true);
    expect(lowerBound(b)).toBe(0);
    const c = createBoard(3, 8, [ROLL.R[0], 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(isSolved(c)).toBe(false);
    expect(lowerBound(c)).toBe(1);
  });
});

describe('scrambles and pool entries', () => {
  it('4x4 scrambles are never trivially easy', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 300; i++) {
      const b = randomScramble4(rng);
      expect(isSolved(b)).toBe(false);
      expect(lowerBound(b)).toBeGreaterThanOrEqual(LB4_MIN);
    }
  });

  it('pool entries round-trip', () => {
    const rng = seededRng(4);
    const buf = new Uint8Array(7 * 100);
    const boards = [];
    for (let i = 0; i < 100; i++) {
      const b = randomBoard(3, rng);
      boards.push(b);
      encodePoolEntry(b, 20 + (i % 15), buf, i * 7);
    }
    for (let i = 0; i < 100; i++) {
      const e = decodePoolEntry(buf, i);
      expect(e.optimal).toBe(20 + (i % 15));
      expect(encodeBoard(e.board)).toBe(encodeBoard(boards[i]));
    }
  });
});
