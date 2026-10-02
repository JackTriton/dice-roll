// タイトル画面: 盤の大きさの選択、自己ベスト、各画面への入口。

import type { Size } from '../../core/constants.ts';
import type { Move } from '../../core/dice.ts';
import { ROLL } from '../../core/dice.ts';
import { apiEnabled, prefetchScramble } from '../api.ts';
import { formatTime } from '../game/session.ts';
import { t } from '../i18n/index.ts';
import { load, save, storageAvailable } from '../records.ts';
import { drawDie } from '../render/dieRenderer.ts';
import { $, boardPalette, onLeave, showScreen } from '../ui/dom.ts';

export interface TitleNav {
  start(size: Size): void;
  howto(): void;
  ranking(): void;
  settings(): void;
}

let raf = 0;

export function initTitle(nav: TitleNav): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#screen-title .size-select button')) {
    b.addEventListener('click', () => {
      const size = Number(b.dataset.size) as Size;
      save((s) => (s.size = size));
      refreshTitle();
      if (apiEnabled && navigator.onLine) void prefetchScramble(load().deviceId, size);
    });
  }
  $('btn-start').addEventListener('click', () => nav.start(load().size));
  $('btn-howto').addEventListener('click', () => nav.howto());
  $('btn-ranking').addEventListener('click', () => nav.ranking());
  $('btn-settings').addEventListener('click', () => nav.settings());
  window.addEventListener('online', refreshTitle);
  window.addEventListener('offline', refreshTitle);
  onLeave('title', () => cancelAnimationFrame(raf));
}

export function showTitle(): void {
  showScreen('title');
  refreshTitle();
  animateLogo();
  const s = load();
  if (apiEnabled && navigator.onLine) void prefetchScramble(s.deviceId, s.size);
}

export function refreshTitle(): void {
  const s = load();
  for (const b of document.querySelectorAll<HTMLButtonElement>('#screen-title .size-select button'))
    b.setAttribute('aria-checked', String(Number(b.dataset.size) === s.size));
  const st = s.stats[String(s.size) as '3' | '4'];
  $('stat-best').textContent = st.best === null ? t('none') : formatTime(st.best);
  $('stat-ao5').textContent = st.bestAo5 === null ? t('none') : formatTime(st.bestAo5);
  $('stat-count').textContent = String(st.count);
  const note = $('title-note');
  const messages: string[] = [];
  if (!storageAvailable()) messages.push(t('storageWarning'));
  if (apiEnabled && !navigator.onLine) messages.push(t('offlineNote'));
  note.hidden = messages.length === 0;
  note.textContent = messages.join(' ');
}

/** タイトルのサイコロが、東 → 北 → 西 → 南と転がり続ける */
function animateLogo(): void {
  const canvas = $<HTMLCanvasElement>('title-dice');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const css = canvas.getBoundingClientRect().width || 168;
  canvas.width = canvas.height = Math.floor(css * dpr);
  const order: Move[] = ['R', 'U', 'L', 'D'];
  const palette = boardPalette();
  const period = 1100;
  const t0 = performance.now();
  cancelAnimationFrame(raf);
  const step = (now: number) => {
    raf = requestAnimationFrame(step);
    const k = Math.floor((now - t0) / period);
    const phase = ((now - t0) % period) / period;
    let orient = 0;
    for (let i = 0; i < k; i++) orient = ROLL[order[i % 4]][orient];
    const m = order[k % 4];
    const roll = phase < 0.35 ? { move: m, t: phase / 0.35 } : undefined;
    const finalOrient = roll ? orient : ROLL[m][orient];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);
    // 転がる途中は元のマスから、転がり終えたら中央へ戻して描く(その場で転がり続けて見える)
    const vp = { ox: css / 2, oy: css / 2, cell: css * 0.55 };
    const [dx, dy] = m === 'R' ? [1, 0] : m === 'L' ? [-1, 0] : m === 'U' ? [0, 1] : [0, -1];
    const off = roll ? -0.5 : 0;
    drawDie(ctx, { orient: finalOrient, x: dx * off, y: dy * off, roll }, vp, palette);
  };
  raf = requestAnimationFrame(step);
}
