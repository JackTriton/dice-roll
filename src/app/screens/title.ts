// タイトル画面: 盤の大きさの選択、自己ベスト、各画面への入口。

import type { Size } from '../../core/constants.ts';
import { apiEnabled, prefetchScramble } from '../api.ts';
import { formatTime } from '../game/session.ts';
import { t } from '../i18n/index.ts';
import { load, save, storageAvailable } from '../records.ts';
import { BOARD_PALETTE } from '../render/boardView.ts';
import { drawDie } from '../render/dieRenderer.ts';
import { $, showScreen } from '../ui/dom.ts';

export interface TitleNav {
  start(size: Size): void;
  howto(): void;
  ranking(): void;
  settings(): void;
}

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
}

export function showTitle(): void {
  showScreen('title');
  refreshTitle();
  drawLogo();
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

/** タイトルのサイコロ(1の目が上を向いた1個)を、動かさずに描く */
function drawLogo(): void {
  const canvas = $<HTMLCanvasElement>('title-dice');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const css = canvas.getBoundingClientRect().width || 168;
  canvas.width = canvas.height = Math.floor(css * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, css, css);
  drawDie(ctx, { orient: 0, x: 0, y: 0 }, { ox: css / 2, oy: css / 2, cell: css * 0.8 }, BOARD_PALETTE);
}
