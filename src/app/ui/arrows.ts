import type { Move } from '../../core/dice.ts';
import { load } from '../records.ts';

const ARROW: Record<Move, string> = { U: '↑', D: '↓', L: '←', R: '→' };
const OPPOSITE: Record<Move, Move> = { U: 'D', D: 'U', L: 'R', R: 'L' };

/**
 * 手の列(U/D/L/R = サイコロが転がる向き)を、指を動かす向きの矢印にする。
 * 「サイコロを動かす」操作ではスワイプの向き(サイコロと同じ向き)、
 * 「空きマスを動かす」操作では空きマスを動かす向き(サイコロと逆の向き)。
 */
export function toArrows(moves: string): string {
  const flip = load().control === 'blank';
  return [...moves].map((m) => (m in ARROW ? ARROW[flip ? OPPOSITE[m as Move] : (m as Move)] : m)).join('');
}
