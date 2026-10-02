import { describe, expect, it } from 'vitest';
import { applyMove, isSolved, type Board } from '../../src/core/board.ts';
import type { Move } from '../../src/core/dice.ts';
import { ONE_OFF_FORMULAS, TUTORIAL, formulaBoard, tutorialBoard } from '../../src/core/tutorial.ts';

/** 手順を適用し、最後の手でちょうど揃う(途中では揃わない)ことを確かめる */
function solvesExactly(b: Board, moves: string): boolean {
  for (let i = 0; i < moves.length; i++) {
    if (!applyMove(b, moves[i] as Move)) return false;
    if (isSolved(b) !== (i === moves.length - 1)) return false;
  }
  return true;
}

describe('tutorial answers and one-off formulas', () => {
  it('every tutorial answer solves its puzzle in the declared number of moves', () => {
    for (const p of TUTORIAL) {
      expect(p.solution).toHaveLength(p.optimal);
      expect(solvesExactly(tutorialBoard(p), p.solution)).toBe(true);
    }
  });

  it('every one-off formula solves its board', () => {
    expect(ONE_OFF_FORMULAS).toHaveLength(10);
    for (const f of ONE_OFF_FORMULAS) {
      const b = formulaBoard(f);
      expect(isSolved(b)).toBe(false);
      expect(solvesExactly(b, f.moves)).toBe(true);
    }
  });

  it('every return formula ends with all ones up and the gap back in the middle', () => {
    for (const f of ONE_OFF_FORMULAS) {
      const b = formulaBoard(f);
      for (const m of f.movesReturn) expect(applyMove(b, m as Move)).toBe(true);
      expect(isSolved(b)).toBe(true);
      expect(b.blank).toBe(4);
    }
  });
});
