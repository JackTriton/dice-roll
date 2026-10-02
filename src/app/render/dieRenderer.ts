// サイコロ1個を Canvas 2D に描く小さな 3D 描画。
//
// 見下ろしたときに上の面と4つの側面がどれも見えるよう、サイコロごとに「逆遠近」で投影する:
// 高さ z の点を、サイコロの中心から (1 + ALPHA * (S - z) / S) 倍に広げて描く。上の面がいちばん小さく、
// 底の辺がいちばん外側に来るので、側面が上の面を囲む縁として見える(1の目が側面にあれば赤い点が見える)。
// 転がるときは底の辺を軸に回しながら同じ投影で描くので、止まっているときと見た目がつながる。

import {
  BODY_PIPS,
  FACE_NORMALS,
  MOVE_VEC,
  ORIENTS,
  apply,
  rollRotation,
  type Move,
  type Vec3,
} from '../../core/dice.ts';

/** サイコロの1辺(マスの幅を 1 とした長さ) */
export const S = 0.7;
const H = S / 2;
/** 逆遠近の強さ。底の辺は H * (1 + ALPHA) = 0.476 まで広がる(マスの半分 0.5 に収まる) */
const ALPHA = 0.36;

export interface Palette {
  face: string;
  /** 1が上を向いているときの上の面 */
  faceDone: string;
  faceSide: string;
  edge: string;
  pip: string;
  pipOne: string;
  shadow: string;
}

export interface DieSpec {
  orient: number;
  /** 転がり始めのマスの中心(盤の座標、x = 東、y = 北、単位はマス) */
  x: number;
  y: number;
  roll?: { move: Move; t: number };
}

/** 盤の座標から画面のピクセルへ */
export interface Viewport {
  ox: number;
  oy: number;
  cell: number;
}

const PIP_LAYOUT: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[0, 0]],
  2: [
    [-1, 1],
    [1, -1],
  ],
  3: [
    [-1, 1],
    [0, 0],
    [1, -1],
  ],
  4: [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ],
  5: [
    [-1, 1],
    [1, 1],
    [0, 0],
    [-1, -1],
    [1, -1],
  ],
  6: [
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [1, 1],
    [1, 0],
    [1, -1],
  ],
};

interface BodyFace {
  normal: Vec3;
  /** 外から見たときの右・上 */
  right: Vec3;
  up: Vec3;
  pips: number;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const BODY_FACES: readonly BodyFace[] = FACE_NORMALS.map((n, i) => {
  const up: Vec3 = n[2] !== 0 ? [0, 1, 0] : [0, 0, 1];
  return { normal: n, up, right: cross(up, n), pips: BODY_PIPS[i] };
});

const easeRoll = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : 1 - (1 - t) * (1 - t));

/** サイコロの本体座標の点を、世界座標(盤の座標 + 高さ)へ */
function placer(spec: DieSpec): { toWorld: (p: Vec3) => Vec3; center: Vec3 } {
  const r = ORIENTS[spec.orient];
  if (!spec.roll || spec.roll.t <= 0) {
    return {
      toWorld: (p) => {
        const q = apply(r, p);
        return [spec.x + q[0], spec.y + q[1], H + q[2]];
      },
      center: [spec.x, spec.y, H],
    };
  }
  const { move } = spec.roll;
  const t = easeRoll(spec.roll.t);
  const [dx, dy] = MOVE_VEC[move];
  const rot = rollRotation(move, (Math.PI / 2) * t);
  // 底の辺(進む向きの辺)を軸に転がり、サイコロとマスの幅の差 (1 - S) は滑らせて埋める
  const pivot: Vec3 = [dx * H, dy * H, 0];
  const slide = (1 - S) * t;
  const toWorld = (p: Vec3): Vec3 => {
    const local = apply(r, p);
    const rel: Vec3 = [local[0] - pivot[0], local[1] - pivot[1], local[2] + H - pivot[2]];
    const w = apply(rot, rel);
    return [spec.x + pivot[0] + w[0] + dx * slide, spec.y + pivot[1] + w[1] + dy * slide, pivot[2] + w[2]];
  };
  return { toWorld, center: toWorld([0, 0, 0]) };
}

function project(p: Vec3, c: Vec3, vp: Viewport): [number, number] {
  const k = 1 + (ALPHA * (S - p[2])) / S;
  const x = c[0] + (p[0] - c[0]) * k;
  const y = c[1] + (p[1] - c[1]) * k;
  return [vp.ox + x * vp.cell, vp.oy - y * vp.cell];
}

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** サイコロの影(マスの床に落ちる楕円) */
export function drawDieShadow(
  ctx: CanvasRenderingContext2D,
  spec: DieSpec,
  vp: Viewport,
  palette: Palette,
): void {
  const { center } = placer(spec);
  const [sx, sy] = [vp.ox + center[0] * vp.cell, vp.oy - center[1] * vp.cell];
  const r = H * (1 + ALPHA) * vp.cell;
  ctx.save();
  ctx.fillStyle = palette.shadow;
  ctx.beginPath();
  ctx.ellipse(sx + r * 0.06, sy + r * 0.1, r * 1.02, r * 1.02, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawDie(ctx: CanvasRenderingContext2D, spec: DieSpec, vp: Viewport, palette: Palette): void {
  const { toWorld, center } = placer(spec);
  const faces: {
    pts: [number, number][];
    depth: number;
    face: BodyFace;
    centerW: Vec3;
    rightW: Vec3;
    upW: Vec3;
    nz: number;
  }[] = [];
  for (const face of BODY_FACES) {
    const c = face.normal.map((v) => v * H) as unknown as Vec3;
    const corners: Vec3[] = [
      add(add(c, face.right, -H), face.up, -H),
      add(add(c, face.right, H), face.up, -H),
      add(add(c, face.right, H), face.up, H),
      add(add(c, face.right, -H), face.up, H),
    ];
    const world = corners.map(toWorld);
    const pts = world.map((p) => project(p, center, vp));
    // 画面座標は y が下向きなので、表向きの面は符号付き面積が負になる
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % 4];
      area += x1 * y2 - x2 * y1;
    }
    if (area >= -1e-6) continue;
    const centerW = toWorld(c);
    const rightW = add(toWorld(add(c, face.right)), centerW, -1);
    const upW = add(toWorld(add(c, face.up)), centerW, -1);
    const nW = add(toWorld(add(c, face.normal)), centerW, -1);
    faces.push({
      pts,
      depth: world.reduce((s, p) => s + p[2], 0) / 4,
      face,
      centerW,
      rightW,
      upW,
      nz: nW[2],
    });
  }
  faces.sort((a, b) => a.depth - b.depth);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, vp.cell * 0.012);
  for (const f of faces) {
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(f.pts[0][0], f.pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
    ctx.closePath();
    const isOne = f.face.pips === 1;
    // 上を向いている面ほど明るく。1が上なら暖かい色にして、揃っていく感じを出す
    ctx.fillStyle = f.nz > 0.7 ? (isOne && !spec.roll ? palette.faceDone : palette.face) : palette.faceSide;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.stroke();

    const layout = PIP_LAYOUT[f.face.pips];
    const radius = isOne ? 0.26 * H : 0.15 * H;
    const spread = 0.52 * H;
    // 縁(側面)の目は、1 以外は描かない(ごちゃつかせない)。転がって上を向くにつれて現れる
    const alpha = isOne ? 1 : Math.min(1, Math.max(0, (f.nz - 0.08) / 0.5));
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = isOne ? palette.pipOne : palette.pip;
    if (isOne) {
      // 縁の1は細い楕円だと見落としやすいので、縁の幅に収まる丸で描く。面が上を向くにつれて本来の目に切り替える
      const rim = Math.min(1, Math.max(0, (0.6 - f.nz) / 0.4));
      if (rim > 0) {
        const c = project(f.centerW, center, vp);
        ctx.globalAlpha = rim;
        ctx.beginPath();
        ctx.arc(c[0], c[1], H * ALPHA * 0.42 * vp.cell, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1 - rim;
      if (rim >= 1) continue;
    }
    for (const [u, v] of layout) {
      const p = add(add(f.centerW, f.rightW, u * spread), f.upW, v * spread);
      const c = project(p, center, vp);
      const a = project(add(p, f.rightW, radius), center, vp);
      const b = project(add(p, f.upW, radius), center, vp);
      ctx.save();
      ctx.transform(a[0] - c[0], a[1] - c[1], b[0] - c[0], b[1] - c[1], c[0], c[1]);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.restore();
      ctx.fill();
    }
  }
  ctx.restore();
}
