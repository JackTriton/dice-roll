// 盤全体の描画。プレイ画面の Canvas と、動画のコマの両方から使う。

import { BLANK } from '../../core/board.ts';
import { UPRIGHT, topPip } from '../../core/dice.ts';
import {
  PLAIN_LOOK,
  drawDie,
  drawDieShadow,
  type DieLook,
  type DieSpec,
  type Palette,
  type Viewport,
} from './dieRenderer.ts';
import type { FrameState } from './frame.ts';

export interface BoardPalette extends Palette {
  board: string;
  cell: string;
  cellDone: string;
}

/** 盤の見た目の切り替え(ハードで使う) */
export interface BoardLook extends DieLook {
  /** 正立(1が上で、2の面が奥)したサイコロだけを、揃った色にする(ハード)。省くと、1が上なら揃った色 */
  upright?: boolean;
}
export { PLAIN_LOOK };

/** 盤とサイコロの配色(明るい配色だけ。ダークモードはやらない) */
export const BOARD_PALETTE: BoardPalette = {
  board: '#d9cdb8',
  cell: '#e9e0cf',
  cellDone: '#f6d7a6',
  face: '#fffdf8',
  faceDone: '#fff1d2',
  faceSide: '#e6e0d4',
  edge: '#b9b0a2',
  pip: '#23201c',
  pipOne: '#d4102a',
  mark: '#2f6fd0',
  markFace: '#dfeaff',
  shadow: 'rgba(60, 40, 20, 0.18)',
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 盤のマスの中心(盤の座標。x = 東、y = 北、左下が原点) */
export function cellCenter(size: number, cell: number): [number, number] {
  const r = Math.floor(cell / size);
  const c = cell % size;
  return [c + 0.5, size - r - 0.5];
}

/** (x, y) から一辺 w の正方形に盤を描く */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  frame: FrameState,
  palette: BoardPalette,
  look: BoardLook = PLAIN_LOOK,
): void {
  const { board, moving, t } = frame;
  const size = board.size;
  const pad = w * 0.035;
  const cell = (w - pad * 2) / size;
  const vp: Viewport = { ox: x + pad, oy: y + pad + cell * size, cell };

  roundRect(ctx, x, y, w, w, w * 0.04);
  ctx.fillStyle = palette.board;
  ctx.fill();

  const movingFrom = new Set(moving.map((m) => m.from));
  const isDone = (orient: number) => (look.upright ? orient === UPRIGHT : topPip(orient) === 1);
  for (let i = 0; i < size * size; i++) {
    const [cx, cy] = cellCenter(size, i);
    const done =
      i !== board.blank && !movingFrom.has(i) && board.cells[i] !== BLANK && isDone(board.cells[i]);
    roundRect(
      ctx,
      vp.ox + (cx - 0.47) * cell,
      vp.oy - (cy + 0.47) * cell,
      cell * 0.94,
      cell * 0.94,
      cell * 0.12,
    );
    ctx.fillStyle = done ? palette.cellDone : palette.cell;
    ctx.fill();
  }

  const specs: DieSpec[] = [];
  for (let i = 0; i < size * size; i++) {
    if (i === board.blank || movingFrom.has(i)) continue;
    const [cx, cy] = cellCenter(size, i);
    specs.push({ orient: board.cells[i], x: cx, y: cy, done: isDone(board.cells[i]) });
  }
  const movingSpecs: DieSpec[] = moving.map((m) => {
    const [cx, cy] = cellCenter(size, m.from);
    return { orient: m.orient, x: cx, y: cy, roll: { move: m.move, t } };
  });
  for (const s of specs) drawDieShadow(ctx, s, vp, palette);
  for (const s of movingSpecs) drawDieShadow(ctx, s, vp, palette);
  for (const s of specs) drawDie(ctx, s, vp, palette, look);
  for (const s of movingSpecs) drawDie(ctx, s, vp, palette, look);
}

/** プレイ画面の Canvas。端末の画素密度に合わせて描く */
export class BoardView {
  private ctx: CanvasRenderingContext2D;
  private cssSize = 0;
  private dpr = 1;
  palette: BoardPalette = BOARD_PALETTE;
  look: BoardLook = PLAIN_LOOK;

  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d is not available');
    this.ctx = ctx;
  }

  /** 表示サイズが変わったら呼ぶ */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssSize = Math.max(1, Math.floor(rect.width));
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = Math.floor(this.cssSize * this.dpr);
    if (this.canvas.width !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
  }

  draw(frame: FrameState): void {
    if (this.cssSize === 0) this.resize();
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssSize, this.cssSize);
    drawBoard(ctx, 0, 0, this.cssSize, frame, this.palette, this.look);
  }

  /** 画面上の点がどのマスか(盤の外なら -1) */
  cellAt(clientX: number, clientY: number, size: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const pad = rect.width * 0.035;
    const cell = (rect.width - pad * 2) / size;
    const c = Math.floor((clientX - rect.left - pad) / cell);
    const r = Math.floor((clientY - rect.top - pad) / cell);
    if (r < 0 || r >= size || c < 0 || c >= size) return -1;
    return r * size + c;
  }

  /** 画面上の点を、マスを単位にした座標にする(盤の左上が 0,0。盤の外では、負や size 以上になる) */
  cellPos(clientX: number, clientY: number, size: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const pad = rect.width * 0.035;
    const cell = (rect.width - pad * 2) / size;
    return { x: (clientX - rect.left - pad) / cell, y: (clientY - rect.top - pad) / cell };
  }

  cellPx(size: number): number {
    const rect = this.canvas.getBoundingClientRect();
    return (rect.width * (1 - 0.07)) / size;
  }
}
