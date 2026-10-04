import { describe, expect, it } from 'vitest';
import { BLANK_MARGIN, blankPath } from '../../src/app/input/blankDrag.ts';

// 3×3 の真ん中(マス4)が空き。マス c, r の中は c <= x < c+1, r <= y < r+1
const CENTER = { x: 1.5, y: 1.5 };

describe('blankPath (hold the empty cell and drag it)', () => {
  it('does nothing while the finger stays on the empty cell', () => {
    expect(blankPath(3, 4, null, CENTER)).toEqual([]);
    expect(blankPath(3, 4, CENTER, { x: 1.9, y: 1.1 })).toEqual([]);
  });

  it('moves the empty cell when the finger crosses into the next cell', () => {
    expect(blankPath(3, 4, CENTER, { x: 2.3, y: 1.5 })).toEqual([5]);
    expect(blankPath(3, 4, CENTER, { x: 0.7, y: 1.5 })).toEqual([3]);
    expect(blankPath(3, 4, CENTER, { x: 1.5, y: 0.6 })).toEqual([1]);
    expect(blankPath(3, 4, CENTER, { x: 1.5, y: 2.4 })).toEqual([7]);
  });

  it('waits until the finger is past the border by the margin (no jitter on the border)', () => {
    const just = 2 + BLANK_MARGIN;
    expect(blankPath(3, 4, CENTER, { x: just - 0.01, y: 1.5 })).toEqual([]);
    expect(blankPath(3, 4, CENTER, { x: just + 0.01, y: 1.5 })).toEqual([5]);
    // 移ったあと(空きはマス5)、境目のすぐ手前へ戻っただけでは、戻らない
    expect(blankPath(3, 5, { x: just + 0.01, y: 1.5 }, { x: 2 - BLANK_MARGIN + 0.01, y: 1.5 })).toEqual([]);
    expect(blankPath(3, 5, { x: just + 0.01, y: 1.5 }, { x: 2 - BLANK_MARGIN - 0.01, y: 1.5 })).toEqual([4]);
  });

  it('jumps to a touched cell in the same row or column (rolling the dice in between)', () => {
    // 空きが左上(マス0)のとき、右端(マス2)や下端(マス6)に触れる
    expect(blankPath(3, 0, null, { x: 2.5, y: 0.5 })).toEqual([2]);
    expect(blankPath(3, 0, null, { x: 0.5, y: 2.5 })).toEqual([6]);
    // 4×4 でも同じ
    expect(blankPath(4, 5, null, { x: 3.5, y: 1.5 })).toEqual([7]);
  });

  it('ignores a touch on a cell that shares neither row nor column, until it lines up', () => {
    expect(blankPath(3, 0, null, { x: 2.5, y: 2.5 })).toEqual([]);
    expect(blankPath(3, 0, { x: 2.5, y: 2.5 }, { x: 1.5, y: 1.5 })).toEqual([]);
    expect(blankPath(3, 0, { x: 1.5, y: 1.5 }, { x: 1.5, y: 0.5 })).toEqual([1]);
  });

  it('goes around the corner in the order the borders were crossed', () => {
    // 真ん中から右下へ。右の境目を先に越える動き → 右(マス5)、それから下(マス8)
    expect(blankPath(3, 4, { x: 1.9, y: 1.5 }, { x: 2.3, y: 2.2 })).toEqual([5, 8]);
    // 下の境目を先に越える動き → 下(マス7)、それから右(マス8)
    expect(blankPath(3, 4, { x: 1.5, y: 1.9 }, { x: 2.2, y: 2.3 })).toEqual([7, 8]);
    // 左上へ
    expect(blankPath(3, 4, { x: 1.1, y: 1.5 }, { x: 0.7, y: 0.8 })).toEqual([3, 0]);
  });

  it('treats a finger outside the board as being on the nearest cell', () => {
    // 右端の空き(マス5)を押さえたまま、盤の右へはみ出しても動かない
    expect(blankPath(3, 5, { x: 2.5, y: 1.5 }, { x: 3.6, y: 1.5 })).toEqual([]);
    // はみ出したまま下へ動くと、右下(マス8)へ
    expect(blankPath(3, 5, { x: 3.6, y: 1.5 }, { x: 3.6, y: 2.4 })).toEqual([8]);
    // 盤の上へはみ出した指は、いちばん上の行にあるものとして扱う
    expect(blankPath(3, 4, CENTER, { x: 1.5, y: -0.8 })).toEqual([1]);
  });
});
