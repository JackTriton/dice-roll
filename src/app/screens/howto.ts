// 遊び方: ルールの説明、転がると目が変わる様子の動くデモ、「1個だけ揃っていないとき」の定石。
// ハード(正立に揃える)の説明と定石も出す。

import { alignedExample } from '../../core/aligned.ts';
import {
  ALIGNED_FORMULAS,
  alignedFormulaBoard,
  type AlignedFormulaKind,
} from '../../core/alignedFormulas.ts';
import { encodeBoard, type Board } from '../../core/board.ts';
import { BOTTOM, EAST, NORTH, ONE_DIR, SOUTH, WEST } from '../../core/dice.ts';
import { ONE_OFF_FORMULAS, formulaBoard } from '../../core/tutorial.ts';
import { HARD_MODE } from '../flags.ts';
import { t, type MessageKey } from '../i18n/index.ts';
import { hardLook, lookFor } from '../records.ts';
import { BOARD_PALETTE, PLAIN_LOOK, drawBoard, type BoardLook } from '../render/boardView.ts';
import { drawDie } from '../render/dieRenderer.ts';
import { ReplayTimeline } from '../render/frame.ts';
import { toArrows } from '../ui/arrows.ts';
import { $, onLeave, showScreen } from '../ui/dom.ts';

let raf = 0;
const tipRafs = new Map<HTMLCanvasElement, number>();
/** 定石の種類: solve = そのまま揃える、return = ほかを元に戻す(ふつうのルールでは、空きマスを真ん中へ戻す) */
type TipMode = 'solve' | 'return';
let tipMode: TipMode = 'solve';
let hardTipMode: TipMode = 'solve';

/** 定石の再生は、見て追えるようにゆっくりにする */
const TIP_STEP_MS = 420;
const TIP_TIMING = { base: 260, min: 260 };

const DIR_KEY: Record<number, MessageKey> = {
  [NORTH]: 'dirNorth',
  [SOUTH]: 'dirSouth',
  [WEST]: 'dirWest',
  [EAST]: 'dirEast',
  [BOTTOM]: 'dirBottom',
};

const HARD_CASE_KEY: Record<AlignedFormulaKind, MessageKey> = {
  halfEdge: 'hardCaseHalfEdge',
  halfCorner: 'hardCaseHalfCorner',
  pairAdjacent: 'hardCasePairAdjacent',
  pairApart: 'hardCasePairApart',
};

/** 定石のカード1枚: 出発点の盤、説明、手順、盤の見た目 */
interface TipCard {
  board: Board;
  label: string;
  moves: string;
  look: BoardLook;
}

function stopTips(): void {
  for (const id of tipRafs.values()) cancelAnimationFrame(id);
  tipRafs.clear();
}

export function initHowto(nav: { back(): void; tutorial(): void }): void {
  $('btn-howto-back').addEventListener('click', nav.back);
  $('btn-tutorial').addEventListener('click', nav.tutorial);
  for (const b of document.querySelectorAll<HTMLButtonElement>('#tips-mode button'))
    b.addEventListener('click', () => {
      tipMode = b.dataset.mode as TipMode;
      stopTips();
      renderTips();
      renderHardTips();
    });
  for (const b of document.querySelectorAll<HTMLButtonElement>('#hard-tips-mode button'))
    b.addEventListener('click', () => {
      hardTipMode = b.dataset.mode as TipMode;
      stopTips();
      renderTips();
      renderHardTips();
    });
  onLeave('howto', () => {
    cancelAnimationFrame(raf);
    stopTips();
  });
}

export function showHowto(): void {
  showScreen('howto');
  animateDemo();
  renderTips();
  renderHard();
}

/** ハード(正立に揃える)の説明(ハードを出していない版では隠す) */
function renderHard(): void {
  const section = $('hard-howto');
  section.hidden = !HARD_MODE;
  if (!HARD_MODE) return;
  const look = hardLook();
  // 向きの見分け方は、見た目(1の図案、2の面の目印)に合わせて説明する
  const keys: MessageKey[] = ['hardRule1'];
  if (look.one === 'tri') {
    keys.push('hardRuleTri', 'hardRuleTriRim');
    keys.push(look.side === 'none' ? 'hardRuleTriBottom' : 'hardRuleTriSide');
  } else if (look.one !== 'dot') {
    keys.push('hardRuleFigure', 'hardRuleFigureRim');
    keys.push(look.side === 'none' ? 'hardRuleFigureBottom' : 'hardRuleSideAlso');
  } else keys.push('hardRuleSide');
  keys.push('hardRuleParity');
  const list = $('hard-rules');
  list.replaceChildren(
    ...keys.map((k) => {
      const li = document.createElement('li');
      li.textContent = t(k);
      return li;
    }),
  );
  for (const kind of ['near', 'done'] as const) {
    const canvas = $<HTMLCanvasElement>(`hard-ex-${kind}`);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const css = canvas.getBoundingClientRect().width || 150;
    canvas.width = canvas.height = Math.floor(css * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);
    drawBoard(
      ctx,
      0,
      0,
      css,
      { board: alignedExample(3, kind), moving: [], t: 0 },
      BOARD_PALETTE,
      lookFor('aligned'),
    );
  }
  renderHardTips();
}

/** ふつうのルールの定石(1個だけ揃っていないとき) */
function renderTips(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#tips-mode button'))
    b.setAttribute('aria-selected', String(b.dataset.mode === tipMode));
  $('tips-mode-note').textContent = t(tipMode === 'return' ? 'tipsModeReturnNote' : 'tipsModeSolveNote');
  renderCards(
    $('tips-grid'),
    ONE_OFF_FORMULAS.map((f) => ({
      board: formulaBoard(f),
      label: t('tipsCase', {
        pos: t(f.cell === 3 ? 'tipsPosLeft' : 'tipsPosDiag'),
        dir: t(DIR_KEY[f.dir]),
      }),
      moves: tipMode === 'return' ? f.movesReturn : f.moves,
      look: PLAIN_LOOK,
    })),
  );
}

/** ハードの定石(1は全部上で、向きだけがずれているとき) */
function renderHardTips(): void {
  if (!HARD_MODE) return;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#hard-tips-mode button'))
    b.setAttribute('aria-selected', String(b.dataset.mode === hardTipMode));
  $('hard-tips-mode-note').textContent = t(
    hardTipMode === 'return' ? 'hardTipsModeReturnNote' : 'hardTipsModeSolveNote',
  );
  const look = lookFor('aligned');
  renderCards(
    $('hard-tips-grid'),
    ALIGNED_FORMULAS.map((f) => ({
      board: alignedFormulaBoard(f),
      label: t(HARD_CASE_KEY[f.kind]),
      moves: hardTipMode === 'return' ? f.movesReturn : f.moves,
      look,
    })),
  );
}

/** 定石のカードを並べる。盤面をタップすると、その手順を盤の上で再生する */
function renderCards(grid: HTMLElement, cards: TipCard[]): void {
  grid.replaceChildren();
  for (const c of cards) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'tip';
    const canvas = document.createElement('canvas');
    const label = document.createElement('span');
    label.className = 'tip-label';
    label.textContent = c.label;
    const moves = document.createElement('span');
    moves.className = 'tip-moves';
    moves.textContent = `${t('movesCount', { n: c.moves.length })}  ${toArrows(c.moves)}`;
    card.append(canvas, label, moves);
    card.addEventListener('click', () => playTip(canvas, c));
    grid.append(card);
    // 再生前は、最初の手が動き出す前(時刻 -1)の止まった盤面を描く
    drawTip(canvas, c, -1);
  }
}

function tipTimeline(c: TipCard): ReplayTimeline {
  const times = [...c.moves].map((_, i) => i * TIP_STEP_MS);
  return new ReplayTimeline({ scramble: encodeBoard(c.board), moves: c.moves, times }, TIP_TIMING);
}

function drawTip(canvas: HTMLCanvasElement, c: TipCard, ms: number, timeline = tipTimeline(c)): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const css = canvas.getBoundingClientRect().width || 140;
  const px = Math.floor(css * dpr);
  if (canvas.width !== px) canvas.width = canvas.height = px;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, css, css);
  drawBoard(ctx, 0, 0, css, timeline.frameAt(ms), BOARD_PALETTE, c.look);
}

function playTip(canvas: HTMLCanvasElement, c: TipCard): void {
  cancelAnimationFrame(tipRafs.get(canvas) ?? 0);
  const timeline = tipTimeline(c);
  // 最初の盤面を少し見せてから動かす
  const lead = 500;
  const t0 = performance.now();
  const step = (now: number) => {
    const ms = now - t0 - lead;
    drawTip(canvas, c, ms, timeline);
    if (ms < timeline.lastEnd) tipRafs.set(canvas, requestAnimationFrame(step));
    else tipRafs.delete(canvas);
  };
  tipRafs.set(canvas, requestAnimationFrame(step));
}

/** 2マスのデモ: 1が左を向いたサイコロが右の空きへ転がると、1が上に来る。行って戻ってを繰り返す */
function animateDemo(): void {
  const canvas = $<HTMLCanvasElement>('howto-demo');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = canvas.getBoundingClientRect().width || 320;
  const h = w / 2;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const palette = BOARD_PALETTE;
  const start = ONE_DIR.indexOf(WEST);
  const t0 = performance.now();
  const period = 3200;
  cancelAnimationFrame(raf);
  const step = (now: number) => {
    raf = requestAnimationFrame(step);
    const p = ((now - t0) % period) / period;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cell = h * 0.9;
    const vp = { ox: w / 2 - cell, oy: h * 0.95, cell };
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = palette.cell;
      ctx.beginPath();
      ctx.roundRect(vp.ox + (i + 0.03) * cell, vp.oy - 0.97 * cell, cell * 0.94, cell * 0.94, cell * 0.12);
      ctx.fill();
    }
    // 0.0〜0.3 待つ、0.3〜0.45 右へ転がる、0.45〜0.8 待つ、0.8〜0.95 左へ戻る
    let spec;
    if (p < 0.3) spec = { orient: start, x: 0.5, y: 0.5 };
    else if (p < 0.45)
      spec = { orient: start, x: 0.5, y: 0.5, roll: { move: 'R' as const, t: (p - 0.3) / 0.15 } };
    else if (p < 0.8) spec = { orient: 0, x: 1.5, y: 0.5 };
    else if (p < 0.95)
      spec = { orient: 0, x: 1.5, y: 0.5, roll: { move: 'L' as const, t: (p - 0.8) / 0.15 } };
    else spec = { orient: start, x: 0.5, y: 0.5 };
    drawDie(ctx, spec, vp, palette);
  };
  raf = requestAnimationFrame(step);
}
