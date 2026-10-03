import { describe, expect, it } from 'vitest';
import { ALIGNED_BASE, alignedExample, UP_ORIENTS } from '../../src/core/aligned.ts';
import { ALIGNED_FORMULAS, FORMULA_BASE, alignedFormulaBoard } from '../../src/core/alignedFormulas.ts';
import { applyMove, createBoard, dieKind, encodeBoard, isAligned, isSolved } from '../../src/core/board.ts';
import { EAST, NORTH, ORIENT_PARITY, PIPS, WEST, type Move } from '../../src/core/dice.ts';

describe('aligned formulas', () => {
  it('use the direction where the 2 face is at the back (the picture on the 1 stands upright)', () => {
    expect(FORMULA_BASE).toBe(ALIGNED_BASE);
    expect(PIPS[FORMULA_BASE * 6 + NORTH]).toBe(2);
  });

  it('start from boards where every 1 is up and only the directions are off', () => {
    expect(new Set(ALIGNED_FORMULAS.map((f) => f.id)).size).toBe(ALIGNED_FORMULAS.length);
    for (const f of ALIGNED_FORMULAS) {
      const b = alignedFormulaBoard(f);
      expect(b.blank).toBe(4);
      expect(isSolved(b)).toBe(true);
      expect(isAligned(b)).toBe(false);
      // 向きを揃えられる盤(組が 4 個ずつ)
      const kinds = [0, 0];
      for (let c = 0; c < 9; c++) if (c !== b.blank) kinds[dieKind(3, c, b.cells[c])]++;
      expect(kinds).toEqual([4, 4]);
      for (const [, orient] of f.off) {
        expect(UP_ORIENTS).toContain(orient);
        // 1個だけなら 180°(同じ偶奇)、2個なら 90°ずつ(違う偶奇)
        expect(ORIENT_PARITY[orient] === ORIENT_PARITY[FORMULA_BASE]).toBe(f.off.length === 1);
      }
    }
  });

  it('align the board, and not before the last move', () => {
    for (const f of ALIGNED_FORMULAS) {
      const b = alignedFormulaBoard(f);
      [...f.moves].forEach((m, i) => {
        expect(applyMove(b, m as Move), `${f.id} move ${i}`).toBe(true);
        expect(isAligned(b), `${f.id} after move ${i}`).toBe(i === f.moves.length - 1);
      });
    }
  });

  it('have a variant that brings the gap back to the middle', () => {
    const done = encodeBoard(alignedExample(3, 'done'));
    for (const f of ALIGNED_FORMULAS) {
      const b = alignedFormulaBoard(f);
      for (const m of f.movesReturn) expect(applyMove(b, m as Move), f.id).toBe(true);
      expect(encodeBoard(b), f.id).toBe(done);
      expect(f.movesReturn.length).toBeGreaterThanOrEqual(f.moves.length);
    }
  });

  // 遊び方で「左右を裏返した形は、矢印の左右を入れ替えれば使える」と説明している
  it('also work on the mirror image, with left and right swapped', () => {
    const dirOf = (o: number, pip: number) => [0, 1, 2, 3, 4, 5].find((d) => PIPS[o * 6 + d] === pip)!;
    const flip = (d: number) => (d === EAST ? WEST : d === WEST ? EAST : d);
    const mirrorOrient = (o: number) =>
      [...Array(24).keys()].find(
        (m) => dirOf(m, 1) === flip(dirOf(o, 1)) && dirOf(m, 2) === flip(dirOf(o, 2)),
      )!;
    const SWAP: Record<string, Move> = { L: 'R', R: 'L', U: 'U', D: 'D' };
    for (const f of ALIGNED_FORMULAS) {
      for (const moves of [f.moves, f.movesReturn]) {
        const orients = new Uint8Array(9).fill(FORMULA_BASE);
        for (const [cell, orient] of f.off)
          orients[cell - (cell % 3) + (2 - (cell % 3))] = mirrorOrient(orient);
        const b = createBoard(3, 4, orients);
        expect(isAligned(b)).toBe(false);
        for (const m of moves) expect(applyMove(b, SWAP[m]), f.id).toBe(true);
        expect(isAligned(b), f.id).toBe(true);
      }
    }
  });

  it('include the example shown in how to play', () => {
    const f = ALIGNED_FORMULAS.find((x) => x.id === 'pair-adjacent-a')!;
    expect(encodeBoard(alignedFormulaBoard(f))).toBe(encodeBoard(alignedExample(3, 'near')));
    expect(f.moves).toHaveLength(28);
  });
});
