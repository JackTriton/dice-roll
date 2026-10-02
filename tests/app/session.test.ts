import { describe, expect, it } from 'vitest';
import { createBoard } from '../../src/core/board.ts';
import { ROLL } from '../../src/core/dice.ts';
import { Session } from '../../src/app/game/session.ts';

// 空きは中央、左のサイコロだけ1が左(→ で揃う)、ほかに下のサイコロを少し崩して1手では揃わないようにする
const board = () => createBoard(3, 4, [0, 0, 0, ROLL.L[0], 0, 0, 0, ROLL.R[0], 0]);
const info = { size: 3 as const, mode: 'practice' as const, scrambleId: null };

describe('Session timing', () => {
  it('starts timing at the first move, not when the board appears', () => {
    const s = new Session(info, board());
    expect(s.phase).toBe('ready');
    expect(s.elapsed(99_999)).toBe(0);
    s.input(['R'], 1000);
    expect(s.phase).toBe('solve');
    expect(s.times).toEqual([0]);
    expect(s.elapsed(1500)).toBe(500);
  });

  it('keeps counting while the app is in the background', () => {
    const s = new Session(info, board());
    s.input(['R'], 1000);
    s.hide(2000, 50_000);
    // performance.now も実時間どおりに進んだ場合は、そのまま
    s.show(12_000, 60_000);
    expect(s.elapsed(12_000)).toBe(11_000);
  });

  it('adds the real time away when performance.now stopped during sleep', () => {
    const s = new Session(info, board());
    s.input(['R'], 1000);
    s.hide(2000, 50_000);
    // スリープ中に performance.now が 10 秒しか進まず、実際には 60 秒たっていた
    s.show(12_000, 110_000);
    expect(s.elapsed(12_000)).toBe(61_000);
    s.input(['L'], 13_000);
    expect(s.times).toEqual([0, 62_000]);
  });
});
