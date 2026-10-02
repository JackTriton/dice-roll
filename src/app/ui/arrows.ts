import type { Move } from '../../core/dice.ts';

const ARROW: Record<Move, string> = { U: '↑', D: '↓', L: '←', R: '→' };

/** 手の列(U/D/L/R)を、スワイプの向きの矢印にする */
export const toArrows = (moves: string): string => [...moves].map((m) => ARROW[m as Move] ?? m).join('');
