// デザインの見比べ(開発用。lab.html から読み込む。本番のビルドには入らない)
// ハードの盤面を、向きの見せ方を変えて並べる。?size=4 で 4×4、?only=<id> でその案だけ。

import { ALIGNED_BASE, alignedExample } from '../core/aligned.ts';
import type { Board } from '../core/board.ts';
import type { Size } from '../core/constants.ts';
import { seededRng } from '../core/random.ts';
import { randomAlignedBoard } from '../core/scramble.ts';
import { BOARD_PALETTE, drawBoard, type BoardLook } from '../app/render/boardView.ts';
import { drawDie, type DieLook } from '../app/render/dieRenderer.ts';

const params = new URLSearchParams(location.search);
const size = (params.get('size') === '4' ? 4 : 3) as Size;
const only = params.get('only');

function samples(): { label: string; board: Board }[] {
  return [
    { label: '崩した直後', board: randomAlignedBoard(size, seededRng(size === 3 ? 7 : 11)) },
    { label: 'あと少し(左上の2個が横倒し)', board: alignedExample(size, 'near') },
    { label: 'そろった', board: alignedExample(size, 'done') },
  ];
}

const BASE_VARIANTS: { id: string; title: string; note: string; look: DieLook }[] = [
  {
    id: 'tri-bar',
    title: '三角 + 青い線(決定)',
    note: '1は三角。2の面のある縁に青い線。三角は、いつも青い線の側を指す。',
    look: { side: 'bar', one: 'tri' },
  },
  {
    id: 'koma',
    title: '駒',
    note: '将棋の駒。自分の駒は、いつも奥を向く。',
    look: { side: 'none', one: 'koma' },
  },
  { id: 'fuji', title: '赤富士', note: '', look: { side: 'none', one: 'fuji' } },
  { id: 'torii', title: '鳥居', note: '', look: { side: 'none', one: 'torii' } },
  { id: 'one', title: '数字の1', note: '', look: { side: 'none', one: 'one' } },
  { id: 'tri', title: '三角', note: '', look: { side: 'none', one: 'tri' } },
  { id: 'dial', title: 'つまみ', note: '赤い丸に、上を指す切れ込み。', look: { side: 'none', one: 'dial' } },
  { id: 'band', title: '青い面(1は丸)', note: '', look: { side: 'band', one: 'dot' } },
];
// ハードの盤: 正立したサイコロだけを、揃った色にする
const VARIANTS = BASE_VARIANTS.map((v) => ({ ...v, look: { ...v.look, upright: true } satisfies BoardLook }));

const root = document.getElementById('lab')!;
for (const v of VARIANTS) {
  if (only && !only.split(',').includes(v.id)) continue;
  const section = document.createElement('section');
  section.className = 'variant';
  section.id = `v-${v.id}`;
  const h = document.createElement('h2');
  h.textContent = v.title;
  const p = document.createElement('p');
  p.textContent = v.note;
  const row = document.createElement('div');
  row.className = 'row';
  section.append(h, p, row);
  root.append(section);
  // 1個を大きく描いた見本
  {
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    const cap = document.createElement('figcaption');
    cap.textContent = '拡大';
    fig.append(canvas, cap);
    row.append(fig);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const css = canvas.getBoundingClientRect().width;
    canvas.width = canvas.height = Math.floor(css * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDie(
      ctx,
      { orient: ALIGNED_BASE, x: 0, y: 0 },
      { ox: css / 2, oy: css / 2, cell: css * 0.9 },
      BOARD_PALETTE,
      v.look,
    );
  }
  for (const s of samples()) {
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    const cap = document.createElement('figcaption');
    cap.textContent = s.label;
    fig.append(canvas, cap);
    row.append(fig);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const css = canvas.getBoundingClientRect().width;
    canvas.width = canvas.height = Math.floor(css * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard(ctx, 0, 0, css, { board: s.board, moving: [], t: 0 }, BOARD_PALETTE, v.look);
  }
}
