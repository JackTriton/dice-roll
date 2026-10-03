// サイコロ1個を Canvas 2D に描く小さな 3D 描画。
//
// 見下ろしたときに上の面と4つの側面がどれも見えるよう、サイコロごとに「逆遠近」で投影する:
// 高さ z の点を、サイコロの中心から (1 + ALPHA * (S - z) / S) 倍に広げて描く。上の面がいちばん小さく、
// 底の辺がいちばん外側に来るので、側面が上の面を囲む縁として見える(1の目が側面にあれば赤い点が見える)。
// 転がるときは底の辺を軸に回しながら同じ投影で描くので、止まっているときと見た目がつながる。
//
// ハード(向きまで揃える)では、1が上を向いたサイコロの向きが分かるようにする(DieLook)。方法は2つあり、組み合わせられる。
//   - 2の面に青い目印を付ける。1の面と2の面の向きが分かれば、サイコロの向き(24通り)は1つに決まる
//   - 1の目を、向きのある図案にする。図案の「上」は2の面の側。1が縁にあるときは、図案の「上」を指す赤い三角を描く
//     (逆遠近の投影では、三角が画面上で指す向きは、転がって1が上に来たあとの図案の向きと同じになる)

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
  /** 向きの目印(2の面)の色 */
  mark: string;
  /** 目印の面が上を向いたときの面の色(band のとき) */
  markFace: string;
  shadow: string;
}

/** 2の面に付ける目印。none = 付けない、band = 面を塗る、bar = 縁に太い線、dots = 縁に点を2つ */
export type SideMark = 'none' | 'band' | 'bar' | 'dots';
export const SIDE_MARKS: readonly SideMark[] = ['none', 'band', 'bar', 'dots'];

/**
 * 1の目の図案。dot = 丸(ふつう)。ほかは向きのある意匠で、「上」は2の面の側を向く。
 * どれも1の目と同じ赤の単色で、形だけで向きが分かるものにしている。
 * koma = 将棋の駒、fuji = 赤富士、torii = 鳥居、one = 数字の1、tri = 三角、dial = つまみ
 */
export type OneFigure = 'dot' | 'koma' | 'fuji' | 'torii' | 'one' | 'tri' | 'dial';
export const ONE_FIGURES: readonly OneFigure[] = ['dot', 'koma', 'fuji', 'torii', 'one', 'tri', 'dial'];

/** サイコロの見た目の切り替え(ハードで使う) */
export interface DieLook {
  side: SideMark;
  one: OneFigure;
}

/** ふつうのルールの見た目: 目印なし、1は丸 */
export const PLAIN_LOOK: DieLook = { side: 'none', one: 'dot' };

/** 目印を付ける面の目 */
const MARK_PIPS = 2;
/** 1の図案の大きさ(図案の座標の 1 が、この長さ) */
const FIGURE_SCALE = 0.48 * H;

export interface DieSpec {
  orient: number;
  /** 転がり始めのマスの中心(盤の座標、x = 東、y = 北、単位はマス) */
  x: number;
  y: number;
  roll?: { move: Move; t: number };
  /** 揃ったサイコロか(上の面を暖かい色にする)。省くと、1が上なら揃ったとみなす */
  done?: boolean;
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

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

const rgbCache = new Map<string, readonly [number, number, number]>();
function rgb(hex: string): readonly [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

/** #rrggbb の2色を混ぜる(t = 0 で a、1 で b) */
function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(g1 + (g2 - g1) * t)}, ${Math.round(b1 + (b2 - b1) * t)})`;
}

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

type Pt = readonly [number, number];

/** 角を丸めた多角形の輪郭を足す */
function roundedPoly(ctx: CanvasRenderingContext2D, pts: readonly Pt[], r: number): void {
  const n = pts.length;
  const last = pts[n - 1];
  ctx.moveTo((last[0] + pts[0][0]) / 2, (last[1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    ctx.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, r);
  }
  ctx.closePath();
}

/**
 * 1の図案を描く。座標は図案の中心が原点、「上」が +y、大きさは -1..1。
 * shape(build) は、図案の座標で描いた形を面の上に写す(塗りは、ここで行う)。
 */
function drawFigure(
  ctx: CanvasRenderingContext2D,
  kind: Exclude<OneFigure, 'dot'>,
  color: string,
  shape: (build: () => void) => void,
): void {
  const fill = (build: () => void, rule: CanvasFillRule = 'nonzero') => {
    shape(build);
    ctx.fillStyle = color;
    ctx.fill(rule);
  };
  switch (kind) {
    case 'koma':
      // 将棋の駒: 下が広く、両脇が少し内に傾き、上は浅い山形
      fill(() =>
        roundedPoly(
          ctx,
          [
            [-0.8, -0.9],
            [0.8, -0.9],
            [0.6, 0.62],
            [0, 0.98],
            [-0.6, 0.62],
          ],
          0.08,
        ),
      );
      break;
    case 'fuji':
      // 赤富士: 台形の山と、雪の線(すき間)
      fill(() => {
        ctx.moveTo(-0.25, 0.68);
        ctx.lineTo(0.25, 0.68);
        ctx.lineTo(0.5, 0.26);
        ctx.lineTo(0.3, 0.38);
        ctx.lineTo(0.15, 0.2);
        ctx.lineTo(0, 0.38);
        ctx.lineTo(-0.15, 0.2);
        ctx.lineTo(-0.3, 0.38);
        ctx.lineTo(-0.5, 0.26);
        ctx.closePath();
      });
      fill(() => {
        ctx.moveTo(-1.02, -0.62);
        ctx.lineTo(1.02, -0.62);
        ctx.lineTo(0.57, 0.14);
        ctx.lineTo(0.3, 0.25);
        ctx.lineTo(0.15, 0.07);
        ctx.lineTo(0, 0.25);
        ctx.lineTo(-0.15, 0.07);
        ctx.lineTo(-0.3, 0.25);
        ctx.lineTo(-0.57, 0.14);
        ctx.closePath();
      });
      break;
    case 'torii':
      // 重なる部分が抜けないよう、部品ごとに塗る
      // 笠木(反りのある上の横木)
      fill(() => {
        ctx.moveTo(-1, 0.98);
        ctx.quadraticCurveTo(0, 0.8, 1, 0.98);
        ctx.lineTo(0.94, 0.7);
        ctx.quadraticCurveTo(0, 0.56, -0.94, 0.7);
        ctx.closePath();
      });
      // 貫(下の横木)と、額束
      fill(() => ctx.rect(-0.8, 0.2, 1.6, 0.18));
      fill(() => ctx.rect(-0.09, 0.3, 0.18, 0.36));
      // 柱(少し内側に傾ける)
      for (const sx of [-1, 1])
        fill(() => {
          ctx.moveTo(sx * 0.7, -0.96);
          ctx.lineTo(sx * 0.46, -0.96);
          ctx.lineTo(sx * 0.38, 0.66);
          ctx.lineTo(sx * 0.58, 0.66);
          ctx.closePath();
        });
      break;
    case 'one':
      fill(() =>
        roundedPoly(
          ctx,
          [
            [-0.5, 0.52],
            [0.02, 0.98],
            [0.22, 0.98],
            [0.22, -0.68],
            [0.56, -0.68],
            [0.56, -0.98],
            [-0.5, -0.98],
            [-0.5, -0.68],
            [-0.14, -0.68],
            [-0.14, 0.5],
            [-0.34, 0.32],
          ],
          0.04,
        ),
      );
      break;
    case 'tri':
      fill(() =>
        roundedPoly(
          ctx,
          [
            [0, 0.9],
            [0.88, -0.62],
            [-0.88, -0.62],
          ],
          0.16,
        ),
      );
      break;
    case 'dial':
      // つまみ: 赤い丸に、上を指す切れ込み
      fill(() => {
        ctx.arc(0, 0, 0.84, 0, Math.PI * 2);
        ctx.roundRect(-0.14, 0.02, 0.28, 0.66, 0.14);
      }, 'evenodd');
      break;
  }
}

export function drawDie(
  ctx: CanvasRenderingContext2D,
  spec: DieSpec,
  vp: Viewport,
  palette: Palette,
  look: DieLook = PLAIN_LOOK,
): void {
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

  const { side } = look;
  ctx.save();
  ctx.lineJoin = 'round';
  for (const f of faces) {
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1, vp.cell * 0.012);
    ctx.beginPath();
    ctx.moveTo(f.pts[0][0], f.pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
    ctx.closePath();
    const isOne = f.face.pips === 1;
    const isMark = f.face.pips === MARK_PIPS && side !== 'none';
    // 上を向いている面ほど明るく。1が上なら暖かい色にして、揃っていく感じを出す
    ctx.fillStyle =
      isMark && side === 'band'
        ? mix(palette.mark, palette.markFace, clamp01((f.nz - 0.2) / 0.6))
        : f.nz > 0.7
          ? isOne && !spec.roll && spec.done !== false
            ? palette.faceDone
            : palette.face
          : palette.faceSide;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.stroke();

    const layout = PIP_LAYOUT[f.face.pips];
    const radius = isOne ? 0.26 * H : 0.15 * H;
    const spread = 0.52 * H;
    // 縁(側面)の目は、1 以外は描かない(ごちゃつかせない)。転がって上を向くにつれて現れる
    const alpha = isOne ? 1 : clamp01((f.nz - 0.08) / 0.5);
    ctx.fillStyle = isOne ? palette.pipOne : isMark ? palette.mark : palette.pip;
    if (isOne || (isMark && side !== 'band')) {
      // 縁の1は細い楕円だと見落としやすいので、縁の幅に収まる丸で描く。面が上を向くにつれて本来の目に切り替える
      // (目印の面は、丸を2つ並べるか、太い線にする)
      const rim = clamp01((0.6 - f.nz) / 0.4);
      if (rim > 0) {
        ctx.globalAlpha = rim;
        const r = H * ALPHA * 0.42 * vp.cell;
        const c = project(f.centerW, center, vp);
        if (isOne && look.one === 'dot') {
          ctx.beginPath();
          ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
          ctx.fill();
        } else if (isOne) {
          // 図案の「上」を指す三角。画面上で指す向きは、転がって1が上に来たあとの図案の向きと同じ
          const h = project(add(f.centerW, f.rightW, 0.2 * H), center, vp);
          const len = Math.hypot(h[0] - c[0], h[1] - c[1]) || 1;
          const dx = (h[0] - c[0]) / len;
          const dy = (h[1] - c[1]) / len;
          // 上の面の三角と同じように角を丸める(同じ色の線で縁取る)
          ctx.beginPath();
          ctx.moveTo(c[0] + dx * r * 1.3, c[1] + dy * r * 1.3);
          ctx.lineTo(c[0] - dx * r * 0.82 - dy * r * 1.24, c[1] - dy * r * 0.82 + dx * r * 1.24);
          ctx.lineTo(c[0] - dx * r * 0.82 + dy * r * 1.24, c[1] - dy * r * 0.82 - dx * r * 1.24);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = palette.pipOne;
          ctx.lineWidth = r * 0.56;
          ctx.stroke();
        } else {
          // 縁に沿った向き(面の中の、水平に近いほうの軸)
          const along = Math.abs(f.rightW[2]) < Math.abs(f.upW[2]) ? f.rightW : f.upW;
          const d = side === 'bar' ? 0.5 * H : 0.36 * H;
          const a = project(add(f.centerW, along, -d), center, vp);
          const b = project(add(f.centerW, along, d), center, vp);
          if (side === 'bar') {
            ctx.save();
            ctx.strokeStyle = palette.mark;
            ctx.lineCap = 'round';
            ctx.lineWidth = r * 1.5;
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.stroke();
            ctx.restore();
          } else
            for (const p of [a, b]) {
              ctx.beginPath();
              ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
              ctx.fill();
            }
        }
      }
      ctx.globalAlpha = 1 - rim;
      if (rim >= 1) continue;
    } else {
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
    }
    if (isOne && look.one !== 'dot') {
      // 図案の「上」は2の面の側(1の面では、面の「右」の軸)。外から見て右手側は、面の「上」の軸の逆
      const c = project(f.centerW, center, vp);
      const u = project(add(f.centerW, f.upW, -FIGURE_SCALE), center, vp);
      const v = project(add(f.centerW, f.rightW, FIGURE_SCALE), center, vp);
      const shape = (build: () => void) => {
        ctx.save();
        ctx.transform(u[0] - c[0], u[1] - c[1], v[0] - c[0], v[1] - c[1], c[0], c[1]);
        ctx.beginPath();
        build();
        ctx.restore();
      };
      drawFigure(ctx, look.one, palette.pipOne, shape);
      continue;
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
