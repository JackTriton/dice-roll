import { describe, expect, it } from 'vitest';
import { ALIGNED_BASE, alignedExample, UP_ORIENTS } from '../../src/core/aligned.ts';
import {
  applyMove,
  cellColor,
  cloneBoard,
  createBoard,
  dieKind,
  encodeBoard,
  isAligned,
  isGoal,
  isSolved,
  type Board,
} from '../../src/core/board.ts';
import type { Size } from '../../src/core/constants.ts';
import {
  BOTTOM,
  EAST,
  MOVES,
  NORTH,
  ORIENT_PARITY,
  PIPS,
  ROLL,
  SOUTH,
  TOP,
  UPRIGHT,
  WEST,
  type Move,
} from '../../src/core/dice.ts';
import { randInt, seededRng } from '../../src/core/random.ts';
import { makeScramble, randomAlignedBoard } from '../../src/core/scramble.ts';
import { verifySolve } from '../../src/core/verify.ts';
import { Session } from '../../src/app/game/session.ts';

/** 組(dieKind)ごとのサイコロの数 */
function kindCounts(b: Board): [number, number] {
  const n: [number, number] = [0, 0];
  for (let c = 0; c < b.cells.length; c++) if (c !== b.blank) n[dieKind(b.size, c, b.cells[c])]++;
  return n;
}

/** 揃った盤から、正しい手だけで崩した盤(必ず解ける) */
function walkFromGoal(size: Size, blank: number, orient: number, steps: number, seed: number): Board {
  const rng = seededRng(seed);
  const b = createBoard(size, blank, new Uint8Array(size * size).fill(orient));
  for (let i = 0; i < steps; i++) applyMove(b, MOVES[randInt(rng, 4)]);
  return b;
}

describe('isAligned', () => {
  it('needs every die to show 1 and to face the same way', () => {
    expect(isAligned(alignedExample(3, 'done'))).toBe(true);
    expect(isAligned(alignedExample(4, 'done'))).toBe(true);
    const near = alignedExample(3, 'near');
    expect(isSolved(near)).toBe(true); // 1は全部上
    expect(isAligned(near)).toBe(false); // でも向きが違う
    expect(isGoal(near, 'ones')).toBe(true);
    expect(isGoal(near, 'aligned')).toBe(false);
  });

  it('accepts only the upright direction: 1 on top and the 2 face at the back', () => {
    expect(UP_ORIENTS).toHaveLength(4);
    expect(PIPS[UPRIGHT * 6 + TOP]).toBe(1);
    expect(PIPS[UPRIGHT * 6 + NORTH]).toBe(2);
    expect(ALIGNED_BASE).toBe(UPRIGHT);
    // 全部が同じ向きでも、横倒しや逆さまではクリアにならない
    for (const o of UP_ORIENTS)
      expect(isAligned(createBoard(3, 4, new Uint8Array(9).fill(o)))).toBe(o === UPRIGHT);
  });

  it('rejects boards where the dice agree but 1 is not on top', () => {
    expect(isAligned(createBoard(3, 4, new Uint8Array(9).fill(ROLL.R[0])))).toBe(false);
  });
});

describe('dieKind', () => {
  it('never changes for a die, however it is rolled', () => {
    const rng = seededRng(3);
    for (const size of [3, 4] as const) {
      const b = randomAlignedBoard(size, rng);
      // 動いたサイコロの組が、動く前と同じ
      for (let i = 0; i < 2000; i++) {
        const before = cloneBoard(b);
        if (!applyMove(b, MOVES[randInt(rng, 4)])) continue;
        const from = b.blank; // 動いたサイコロがいたマス
        const to = before.blank;
        expect(dieKind(size, to, b.cells[to])).toBe(dieKind(size, from, before.cells[from]));
      }
    }
  });

  it('puts the two kinds on the two cell colours when the board is aligned', () => {
    for (const size of [3, 4] as const) {
      const b = alignedExample(size, 'done');
      const parity = ORIENT_PARITY[b.cells[0]];
      for (let c = 0; c < size * size; c++)
        if (c !== b.blank) expect(dieKind(size, c, b.cells[c])).toBe(parity ^ cellColor(size, c));
    }
  });
});

describe('the triangle on the rim', () => {
  // 1が縁にあるとき、画面には「2の面の向き」を指す三角を描く(2が上なら内向き、底なら外向き、側面ならその向き)。
  // 転がして1を上にすると、2の面はちょうどその向きに来る(遊び方で、そう説明している)
  it('points where the picture will face once the 1 is rolled up', () => {
    const OPPOSITE_DIR = [BOTTOM, TOP, SOUTH, NORTH, WEST, EAST];
    const ROLL_UP: Record<number, Move> = { [WEST]: 'R', [EAST]: 'L', [NORTH]: 'D', [SOUTH]: 'U' };
    const dirOf = (o: number, pip: number) => [0, 1, 2, 3, 4, 5].find((d) => PIPS[o * 6 + d] === pip)!;
    let checked = 0;
    for (let o = 0; o < 24; o++) {
      const one = dirOf(o, 1);
      if (one === TOP || one === BOTTOM) continue;
      const two = dirOf(o, 2);
      const shown = two === TOP ? OPPOSITE_DIR[one] : two === BOTTOM ? one : two;
      const after = ROLL[ROLL_UP[one]][o];
      expect(dirOf(after, 1)).toBe(TOP);
      expect(dirOf(after, 2)).toBe(shown);
      checked++;
    }
    expect(checked).toBe(16);
  });
});

describe('randomAlignedBoard', () => {
  it('has the same kind counts as boards scrambled from a solved one by legal moves', () => {
    // 3×3: 空きが角か真ん中の揃った盤から崩すと、どの盤も組が 4 個ずつ
    for (const blank of [0, 2, 4, 6, 8])
      for (const o of UP_ORIENTS)
        expect(kindCounts(walkFromGoal(3, blank, o, 500, blank * 31 + o)).sort()).toEqual([4, 4]);
    // 4×4: 7 個と 8 個
    for (let blank = 0; blank < 16; blank++)
      for (const o of UP_ORIENTS)
        expect(kindCounts(walkFromGoal(4, blank, o, 500, blank * 31 + o)).sort()).toEqual([7, 8]);

    const rng = seededRng(2026);
    for (let i = 0; i < 2000; i++) {
      expect(kindCounts(randomAlignedBoard(3, rng)).sort()).toEqual([4, 4]);
      expect(kindCounts(randomAlignedBoard(4, rng)).sort()).toEqual([7, 8]);
    }
  });

  it('never starts solved, and covers every blank cell and both splits', () => {
    const rng = seededRng(5);
    const blanks = new Set<number>();
    const splits = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const b = randomAlignedBoard(4, rng);
      expect(isAligned(b)).toBe(false);
      blanks.add(b.blank);
      splits.add(kindCounts(b).join('/'));
    }
    expect(blanks.size).toBe(16);
    expect([...splits].sort()).toEqual(['7/8', '8/7']);
    const blanks3 = new Set<number>();
    for (let i = 0; i < 500; i++) blanks3.add(randomAlignedBoard(3, rng).blank);
    expect(blanks3.size).toBe(9);
  });

  it('is what makeScramble returns for the aligned rule', () => {
    const s = makeScramble(3, seededRng(1), null, 'aligned');
    expect(s.optimal).toBeNull();
    expect(kindCounts(s.board).sort()).toEqual([4, 4]);
  });
});

describe('aligned rule in play and verification', () => {
  // 揃った盤(空きは真ん中)から L, U と動かした盤。D, R と戻せば揃う
  const start = () => {
    const b = alignedExample(3, 'done');
    applyMove(b, 'L');
    applyMove(b, 'U');
    return b;
  };

  it('finishes a session only when the dice are aligned', () => {
    const s = new Session({ size: 3, rule: 'aligned', mode: 'practice', scrambleId: null }, start());
    s.input(['D'], 1000);
    expect(s.phase).toBe('solve');
    s.input(['R'], 1400);
    expect(s.phase).toBe('done');
    expect(s.log()).toEqual({
      scramble: encodeBoard(start()),
      moves: 'DR',
      times: [0, 400],
      rule: 'aligned',
    });
  });

  it('does not finish when every 1 is up but two dice face another way', () => {
    const b = alignedExample(3, 'near');
    applyMove(b, 'R');
    const s = new Session({ size: 3, rule: 'aligned', mode: 'practice', scrambleId: null }, b);
    s.input(['L'], 1000); // 1は全部上になるが、向きが違う
    expect(isSolved(s.board)).toBe(true);
    expect(s.phase).toBe('solve');
    // 同じ盤でも、ふつうのルールならここで完了
    const normal = new Session({ size: 3, rule: 'ones', mode: 'practice', scrambleId: null }, b);
    normal.input(['L'], 1000);
    expect(normal.phase).toBe('done');
    expect(normal.log().rule).toBeUndefined();
  });

  it('verifies a solve against the aligned goal', () => {
    const scramble = encodeBoard(start());
    const ok = { scramble, moves: 'DR', times: [0, 400], timeMs: 400, rule: 'aligned' as const };
    expect(verifySolve(ok)).toEqual({ ok: true, moves: 2, timeMs: 400 });
    // 1は全部上だが向きが違う盤で終わる手順は、ハードでは「揃っていない」
    const b = alignedExample(3, 'near');
    applyMove(b, 'R');
    const notAligned = { scramble: encodeBoard(b), moves: 'L', times: [0], timeMs: 0 };
    expect(verifySolve({ ...notAligned, rule: 'aligned' })).toEqual({ ok: false, reason: 'not_solved' });
    expect(verifySolve(notAligned)).toEqual({ ok: true, moves: 1, timeMs: 0 });
    // 途中で1が全部上を向いても、ハードでは「途中で揃っていた」にならない
    const through = { scramble: encodeBoard(b), moves: 'LRL', times: [0, 200, 400], timeMs: 400 };
    expect(verifySolve(through)).toEqual({ ok: false, reason: 'solved_early' });
    expect(verifySolve({ ...through, rule: 'aligned' })).toEqual({ ok: false, reason: 'not_solved' });
  });

  it('keeps the inverse of a legal scramble as a solution', () => {
    const rng = seededRng(77);
    const inverse: Record<Move, Move> = { U: 'D', D: 'U', L: 'R', R: 'L' };
    const b = alignedExample(3, 'done');
    const path: Move[] = [];
    while (path.length < 60) {
      const m = MOVES[randInt(rng, 4)];
      if (applyMove(b, m)) path.push(m);
    }
    for (const m of path.reverse()) applyMove(b, inverse[m]);
    expect(isAligned(b)).toBe(true);
  });
});
