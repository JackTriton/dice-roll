import { describe, expect, it } from 'vitest';
import {
  BOTTOM,
  EAST,
  FACE_NORMALS,
  MIN_ROLLS_TO_TOP,
  MOVES,
  NORTH,
  ONE_DIR,
  ONE_DIR_ROLL,
  OPPOSITE,
  ORIENTS,
  ORIENT_PARITY,
  PIPS,
  ROLL,
  SOUTH,
  TOP,
  WEST,
  topPip,
} from '../../src/core/dice.ts';

describe('dice orientations', () => {
  it('has 24 distinct orientations', () => {
    expect(ORIENTS).toHaveLength(24);
    expect(new Set(ORIENTS.map((m) => m.join(','))).size).toBe(24);
  });

  it('base orientation: 1 top, 2 east, 3 north, opposite faces sum to 7', () => {
    expect(PIPS[TOP]).toBe(1);
    expect(PIPS[EAST]).toBe(2);
    expect(PIPS[NORTH]).toBe(3);
    for (let o = 0; o < 24; o++) {
      expect(PIPS[o * 6 + TOP] + PIPS[o * 6 + BOTTOM]).toBe(7);
      expect(PIPS[o * 6 + NORTH] + PIPS[o * 6 + SOUTH]).toBe(7);
      expect(PIPS[o * 6 + EAST] + PIPS[o * 6 + WEST]).toBe(7);
      expect(new Set(PIPS.slice(o * 6, o * 6 + 6)).size).toBe(6);
    }
  });

  it('is right-handed: 1, 2, 3 go counterclockwise around their shared corner', () => {
    // 1・2・3 の面の法線 n1, n2, n3 について n1 · (n2 × n3) = +1(上 → 東 → 北 は外から見て反時計回り)
    const normalOf = (o: number, v: number) => FACE_NORMALS[[...PIPS.slice(o * 6, o * 6 + 6)].indexOf(v)];
    for (let o = 0; o < 24; o++) {
      const [a, b, c] = [normalOf(o, 1), normalOf(o, 2), normalOf(o, 3)];
      const triple =
        a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
      expect(triple).toBe(1);
    }
  });

  it('every roll is a permutation, and the opposite roll undoes it', () => {
    for (const m of MOVES) {
      expect(new Set(ROLL[m]).size).toBe(24);
      for (let o = 0; o < 24; o++) expect(ROLL[OPPOSITE[m]][ROLL[m][o]]).toBe(o);
    }
  });

  it('rolling east puts the west face on top and the top face on the east', () => {
    for (let o = 0; o < 24; o++) {
      const r = ROLL.R[o];
      expect(PIPS[r * 6 + TOP]).toBe(PIPS[o * 6 + WEST]);
      expect(PIPS[r * 6 + EAST]).toBe(PIPS[o * 6 + TOP]);
      expect(PIPS[r * 6 + NORTH]).toBe(PIPS[o * 6 + NORTH]);
    }
    for (let o = 0; o < 24; o++) {
      const r = ROLL.U[o];
      expect(PIPS[r * 6 + TOP]).toBe(PIPS[o * 6 + SOUTH]);
      expect(PIPS[r * 6 + NORTH]).toBe(PIPS[o * 6 + TOP]);
      expect(PIPS[r * 6 + EAST]).toBe(PIPS[o * 6 + EAST]);
    }
  });

  it('the direction of the 1 face evolves independently of the other faces', () => {
    for (const m of MOVES)
      for (let o = 0; o < 24; o++) expect(ONE_DIR_ROLL[m][ONE_DIR[o]]).toBe(ONE_DIR[ROLL[m][o]]);
  });

  it('matches the research scripts (03_develop/research/solvability/all_ones_goal.js)', () => {
    // 研究スクリプトの dirRoll(添字は U,D,N,S,E,W = TOP,BOTTOM,NORTH,SOUTH,EAST,WEST)
    expect([...ONE_DIR_ROLL.R]).toEqual([EAST, WEST, NORTH, SOUTH, BOTTOM, TOP]);
    expect([...ONE_DIR_ROLL.L]).toEqual([WEST, EAST, NORTH, SOUTH, TOP, BOTTOM]);
    expect([...ONE_DIR_ROLL.U]).toEqual([NORTH, SOUTH, BOTTOM, TOP, EAST, WEST]);
    expect([...ONE_DIR_ROLL.D]).toEqual([SOUTH, NORTH, TOP, BOTTOM, EAST, WEST]);
  });

  it('every roll flips the orientation parity (12 even, 12 odd)', () => {
    for (const m of MOVES)
      for (let o = 0; o < 24; o++) expect(ORIENT_PARITY[ROLL[m][o]]).toBe(ORIENT_PARITY[o] ^ 1);
    expect([...ORIENT_PARITY].filter((p) => p === 0)).toHaveLength(12);
  });

  it('even orientations alone can bring the 1 face to every direction (why all-ones is always solvable)', () => {
    const dirs = new Set<number>();
    for (let o = 0; o < 24; o++) if (ORIENT_PARITY[o] === 0) dirs.add(ONE_DIR[o]);
    expect(dirs.size).toBe(6);
  });

  it('each top value appears in 4 orientations, 2 even and 2 odd', () => {
    for (let v = 1; v <= 6; v++) {
      const os = [...Array(24).keys()].filter((o) => topPip(o) === v);
      expect(os).toHaveLength(4);
      expect(os.filter((o) => ORIENT_PARITY[o] === 0)).toHaveLength(2);
    }
  });

  it('MIN_ROLLS_TO_TOP is the true minimum for a single free die', () => {
    for (let d = 0; d < 6; d++) {
      // 1方向の BFS
      const dist = new Map([[d, 0]]);
      const q = [d];
      while (q.length) {
        const x = q.shift()!;
        for (const m of MOVES) {
          const y = ONE_DIR_ROLL[m][x];
          if (!dist.has(y)) {
            dist.set(y, dist.get(x)! + 1);
            q.push(y);
          }
        }
      }
      expect(dist.get(TOP)).toBe(MIN_ROLLS_TO_TOP[d]);
    }
  });
});
