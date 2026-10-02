// サイコロ1個の向きと転がり。
//
// 世界の座標: x = 東(画面の右)、y = 北(画面の上)、z = 上。
// 向きは「サイコロ本体の座標 → 世界の座標」の回転行列で表し、24通りに 0..23 の番号を振る。
// 番号 0 は基準の向き(1が上、2が東、3が北)。1・2・3 が頂点のまわりに反時計回りに並ぶ、一般的な右手系のサイコロ。

export type Vec3 = readonly [number, number, number];
/** 3×3 の回転行列(行優先) */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** 世界の6方向。配列の添字として使う */
export const TOP = 0;
export const BOTTOM = 1;
export const NORTH = 2;
export const SOUTH = 3;
export const EAST = 4;
export const WEST = 5;
export const FACE_NORMALS: readonly Vec3[] = [
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
];

/** 基準の向きで、各方向(TOP..WEST)に来ている目 */
export const BODY_PIPS: readonly number[] = [1, 6, 3, 4, 2, 5];

/** サイコロが動く方向(画面上の向き)。U = 北へ、D = 南へ、L = 西へ、R = 東へ */
export type Move = 'U' | 'D' | 'L' | 'R';
export const MOVES: readonly Move[] = ['U', 'D', 'L', 'R'];
export const OPPOSITE: Readonly<Record<Move, Move>> = { U: 'D', D: 'U', L: 'R', R: 'L' };
/** 動く方向の世界ベクトル (x = 東, y = 北) */
export const MOVE_VEC: Readonly<Record<Move, readonly [number, number]>> = {
  U: [0, 1],
  D: [0, -1],
  L: [-1, 0],
  R: [1, 0],
};

export function mul(a: Mat3, b: Mat3): Mat3 {
  const r: number[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  return r as unknown as Mat3;
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * 方向 m へ角度 theta だけ転がる回転(底の辺を軸にした回転の、回転部分だけ)。
 * 東へ転がると上の面が東を向くので、y 軸まわりの +theta。北へ転がると上の面が北を向くので、x 軸まわりの -theta。
 */
export function rollRotation(m: Move, theta: number): Mat3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  switch (m) {
    case 'R':
      return [c, 0, s, 0, 1, 0, -s, 0, c];
    case 'L':
      return [c, 0, -s, 0, 1, 0, s, 0, c];
    case 'U':
      return [1, 0, 0, 0, c, s, 0, -s, c];
    case 'D':
      return [1, 0, 0, 0, c, -s, 0, s, c];
  }
}

function roundMat(m: Mat3): Mat3 {
  return m.map((x) => Math.round(x)) as unknown as Mat3;
}

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ROLL90: Readonly<Record<Move, Mat3>> = {
  U: roundMat(rollRotation('U', Math.PI / 2)),
  D: roundMat(rollRotation('D', Math.PI / 2)),
  L: roundMat(rollRotation('L', Math.PI / 2)),
  R: roundMat(rollRotation('R', Math.PI / 2)),
};

const key = (m: Mat3) => m.join(',');

/** 24通りの向き(回転行列)。BFS で列挙した順に番号を振る */
export const ORIENTS: readonly Mat3[] = (() => {
  const list: Mat3[] = [IDENTITY];
  const seen = new Set([key(IDENTITY)]);
  for (let i = 0; i < list.length; i++) {
    for (const m of MOVES) {
      const next = mul(ROLL90[m], list[i]);
      if (!seen.has(key(next))) {
        seen.add(key(next));
        list.push(next);
      }
    }
  }
  return list;
})();

const ORIENT_INDEX = new Map(ORIENTS.map((m, i) => [key(m), i]));

/** ROLL[m][o] = 向き o のサイコロを方向 m へ転がしたあとの向き */
export const ROLL: Readonly<Record<Move, Uint8Array>> = (() => {
  const t = {} as Record<Move, Uint8Array>;
  for (const m of MOVES) t[m] = Uint8Array.from(ORIENTS, (o) => ORIENT_INDEX.get(key(mul(ROLL90[m], o)))!);
  return t;
})();

function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function faceIndexOf(v: Vec3): number {
  return FACE_NORMALS.findIndex((n) => n[0] === v[0] && n[1] === v[1] && n[2] === v[2]);
}

/** PIPS[o * 6 + d] = 向き o のとき、世界の方向 d に来ている目 */
export const PIPS: Uint8Array = (() => {
  const t = new Uint8Array(24 * 6);
  ORIENTS.forEach((r, o) => {
    const rt = transpose(r);
    for (let d = 0; d < 6; d++) {
      const v = apply(rt, FACE_NORMALS[d]);
      t[o * 6 + d] = BODY_PIPS[faceIndexOf([Math.round(v[0]), Math.round(v[1]), Math.round(v[2])])];
    }
  });
  return t;
})();

export const topPip = (o: number): number => PIPS[o * 6 + TOP];

/** ONE_DIR[o] = 向き o のとき、1の目が向いている世界の方向(TOP..WEST) */
export const ONE_DIR: Uint8Array = Uint8Array.from({ length: 24 }, (_, o) => {
  for (let d = 0; d < 6; d++) if (PIPS[o * 6 + d] === 1) return d;
  throw new Error('unreachable');
});

/** 1の目の方向だけを追った転がり。ONE_DIR_ROLL[m][d] = 転がしたあとの1の目の方向 */
export const ONE_DIR_ROLL: Readonly<Record<Move, Uint8Array>> = (() => {
  const t = {} as Record<Move, Uint8Array>;
  for (const m of MOVES) {
    t[m] = new Uint8Array(6);
    for (let o = 0; o < 24; o++) t[m][ONE_DIR[o]] = ONE_DIR[ROLL[m][o]];
  }
  return t;
})();

/** 1の目がその方向にあるとき、上に向けるのに最低限要る転がり回数 */
export const MIN_ROLLS_TO_TOP: readonly number[] = [0, 2, 1, 1, 1, 1];

/** 回転行列の行列式の符号ではなく、置換としての偶奇。90°の転がりは奇。研究メモの「向きの偶奇」 */
export const ORIENT_PARITY: Uint8Array = (() => {
  const t = new Uint8Array(24);
  const queue = [0];
  const seen = new Set([0]);
  while (queue.length) {
    const o = queue.shift()!;
    for (const m of MOVES) {
      const n = ROLL[m][o];
      if (!seen.has(n)) {
        seen.add(n);
        t[n] = t[o] ^ 1;
        queue.push(n);
      }
    }
  }
  return t;
})();
