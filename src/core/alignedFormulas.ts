// ハード(正立に揃える)の定石: 1は全部上で、向きだけがずれた盤(空きは真ん中)を、全部正立にする手順。
//
// tools/find-hard-formulas.ts で求めた(両側からの幅優先探索)。どれも、これより短い手順は無い。
// 偶奇の制約で、1個だけが横倒し(90°違い)の盤は現れない。現れるのは「1個が逆さま(180°違い)」か
// 「角と辺の2個が横倒し」(とその組み合わせ)で、2個が横倒しの盤は、その2個の置き場所が入れ替わっている。

import { createBoard, type Board } from './board.ts';

/** 正立(1が上、2が奥。dice.ts の UPRIGHT と同じ)と、逆さま(180°)・横倒し(90°、2通り)の向き */
export const FORMULA_BASE = 21;
const HALF = 18;
const QUARTER_A = 0;
const QUARTER_B = 23;

export type AlignedFormulaKind = 'halfEdge' | 'halfCorner' | 'pairAdjacent' | 'pairApart';

export interface AlignedFormula {
  id: string;
  kind: AlignedFormulaKind;
  /** ずれているサイコロ: [マス, 向き] */
  off: readonly (readonly [number, number])[];
  /** そのまま揃える手順(全部を正立にする。空きは角か真ん中のどこで終わってもよい) */
  moves: string;
  /** 全部を正立にして、最後に空きマスを真ん中へ戻す手順(続けて使える) */
  movesReturn: string;
}

export const ALIGNED_FORMULAS: readonly AlignedFormula[] = [
  {
    id: 'half-edge',
    kind: 'halfEdge',
    off: [[3, HALF]],
    moves: 'URDLDRULURDLULDDRURDLLUURDRULDRDLU',
    movesReturn: 'URDLDRULURDLULDDRURDLLUURDRULDRDLU',
  },
  {
    id: 'half-corner',
    kind: 'halfCorner',
    off: [[0, HALF]],
    moves: 'URDLURDLDRUULDDRULULDDRURDLLUURDRULDDR',
    movesReturn: 'ULDDRRULDLUURDRDLLUURDRDLLUURDLDRRULULDDRRUL',
  },
  {
    id: 'pair-adjacent-a',
    kind: 'pairAdjacent',
    off: [
      [0, QUARTER_A],
      [3, QUARTER_A],
    ],
    moves: 'ULDDRRULDRULDLUURRDDLURULDDR',
    movesReturn: 'ULDRRULDRULLDRURDLLURRDLLURRDLLDRRULDRULDLUR',
  },
  {
    id: 'pair-adjacent-b',
    kind: 'pairAdjacent',
    off: [
      [0, QUARTER_A],
      [3, QUARTER_B],
    ],
    moves: 'RULLDDRRULDLUURRDDLLUURRDLULDDRR',
    movesReturn: 'ULDRDLURRDLLURDRULDRULLDRURDLULDRULURD',
  },
  {
    id: 'pair-adjacent-c',
    kind: 'pairAdjacent',
    off: [
      [0, QUARTER_B],
      [3, QUARTER_A],
    ],
    moves: 'LURRDDLURDLLURRULLDDRRULDRUULLDRURDLDR',
    movesReturn: 'LDRURDLLUURRDDLLUURDLURDLURRDLULDDRRUULLDRRULD',
  },
  {
    id: 'pair-adjacent-d',
    kind: 'pairAdjacent',
    off: [
      [0, QUARTER_B],
      [3, QUARTER_B],
    ],
    moves: 'LDRURDLULDRRULLDRURDLLURDLURRDLU',
    movesReturn: 'LDRURDLULDRRULLDRURDLLURDLURRDLU',
  },
  {
    id: 'pair-apart-a',
    kind: 'pairApart',
    off: [
      [0, QUARTER_A],
      [5, QUARTER_A],
    ],
    moves: 'URDLLURDDRUULLDDRURULLDDRRULLURDDLUR',
    movesReturn: 'URDLLURDDRUULLDDRURULLDDRRULLURDDLUR',
  },
  {
    id: 'pair-apart-b',
    kind: 'pairApart',
    off: [
      [0, QUARTER_A],
      [5, QUARTER_B],
    ],
    moves: 'URDDLULDRURULLDRDLURDLUURDDLURDR',
    movesReturn: 'URDLDRUULDLDRUULDDRULDRULURRDLDRUULDDLUR',
  },
  {
    id: 'pair-apart-c',
    kind: 'pairApart',
    off: [
      [0, QUARTER_B],
      [5, QUARTER_A],
    ],
    moves: 'RULLDRRULLDRURDDLULURRDLLURRDLULDRDR',
    movesReturn: 'LURDRULDRDLURULDDRULDRULURDDLUURDLULDR',
  },
  {
    id: 'pair-apart-d',
    kind: 'pairApart',
    off: [
      [0, QUARTER_B],
      [5, QUARTER_B],
    ],
    moves: 'RDLLUURRDLDLUURRDDLUULDDRRUULLDRDR',
    movesReturn: 'LDRUULDDRURDLURDLULDRRUULDLURRDLDRULDLUURD',
  },
];

/** 定石の出発点の盤(空きは真ん中) */
export function alignedFormulaBoard(f: AlignedFormula): Board {
  const orients = new Uint8Array(9).fill(FORMULA_BASE);
  for (const [cell, orient] of f.off) orients[cell] = orient;
  return createBoard(3, 4, orients);
}
