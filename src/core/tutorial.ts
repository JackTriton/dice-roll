// チュートリアルの練習問題と、「1個だけ揃っていないとき」の定石(どちらも 3×3)。
// 手順が解けること・最短であることは tests/core/tutorial.test.ts と tools/check-tutorial.ts で確かめる。

import { createBoard, type Board } from './board.ts';
import { BOTTOM, EAST, NORTH, ONE_DIR, SOUTH, WEST } from './dice.ts';

export interface TutorialPuzzle {
  /** 空きマス */
  blank: number;
  /** 1が上を向いていないサイコロ: [マス, 1の目の方向] */
  off: ReadonlyArray<readonly [number, number]>;
  /** 最短手数 */
  optimal: number;
  /** 最短の解答(サイコロが動く向き U/D/L/R = スワイプの向き) */
  solution: string;
  /** 説明文の i18n キー */
  hint: 'tut1' | 'tut2' | 'tut3';
}

export const TUTORIAL: readonly TutorialPuzzle[] = [
  // 1が西を向いたサイコロを、空きへ向けて東に転がすと1が上に来る
  { blank: 4, off: [[3, WEST]], optimal: 1, solution: 'R', hint: 'tut1' },
  // 2個を順に転がす
  {
    blank: 4,
    off: [
      [0, NORTH],
      [3, WEST],
    ],
    optimal: 2,
    solution: 'RD',
    hint: 'tut2',
  },
  // 隣どうしの2個は、左下の 2×2 で空きを2周させてから真上のサイコロを下ろす
  {
    blank: 4,
    off: [
      [1, NORTH],
      [3, WEST],
    ],
    optimal: 9,
    solution: 'URDLURDLD',
    hint: 'tut3',
  },
];

/**
 * 「1個だけ揃っていないとき」の定石。空きマスは真ん中(4)。
 * サイコロが空きの左隣(3)か左斜め上(0)にあり、その1の目がどちらを向いているかで分ける。
 * 盤を回したり裏返したりした形にも、手順の向きを同じように回せばそのまま使える。
 */
export interface OneOffFormula {
  cell: 3 | 0;
  dir: number;
  moves: string;
}

export const ONE_OFF_BLANK = 4;

export const ONE_OFF_FORMULAS: readonly OneOffFormula[] = [
  { cell: 3, dir: WEST, moves: 'R' },
  { cell: 3, dir: NORTH, moves: 'RULLDRULDRURD' },
  { cell: 3, dir: SOUTH, moves: 'RDLLURDLURDRU' },
  { cell: 3, dir: BOTTOM, moves: 'RDLLUURDLURDLDRRU' },
  { cell: 3, dir: EAST, moves: 'RDLLUURDLURDLURDLDRRULUL' },
  { cell: 0, dir: NORTH, moves: 'RULDRULDRD' },
  { cell: 0, dir: WEST, moves: 'DLURDLURDR' },
  { cell: 0, dir: BOTTOM, moves: 'LDRULDRULDRRULDLURRD' },
  { cell: 0, dir: SOUTH, moves: 'DRULLDRULDRULDRRULDLU' },
  { cell: 0, dir: EAST, moves: 'RDLUURDLURDLURDDLURUL' },
];

function boardWith(blank: number, off: ReadonlyArray<readonly [number, number]>): Board {
  const orients = new Uint8Array(9);
  for (const [cell, dir] of off) orients[cell] = ONE_DIR.indexOf(dir);
  return createBoard(3, blank, orients);
}

export const tutorialBoard = (p: TutorialPuzzle): Board => boardWith(p.blank, p.off);

export const formulaBoard = (f: OneOffFormula): Board => boardWith(ONE_OFF_BLANK, [[f.cell, f.dir]]);
