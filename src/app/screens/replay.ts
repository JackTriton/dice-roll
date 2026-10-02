// リプレイ画面と、動画の保存ダイアログ。

import type { SolveLog } from '../../core/replay.ts';
import {
  VIDEO_COLORS,
  drawVideoFrame,
  exceedsLimit,
  planVideo,
  type FrameMeta,
  type VideoPlan,
} from '../../video/frames.ts';
import { formatTime } from '../game/session.ts';
import { t } from '../i18n/index.ts';
import { BOARD_PALETTE } from '../render/boardView.ts';
import { ReplayTimeline } from '../render/frame.ts';
import { shareResult, shareText, siteUrl } from '../share.ts';
import { $, onLeave, showScreen, toast } from '../ui/dom.ts';
import type { VideoMethod } from '../../video/exportVideo.ts';
import type { ResultMeta } from './play.ts';

let raf = 0;
let current: { log: SolveLog; meta: ResultMeta } | null = null;

export function frameMeta(meta: ResultMeta): FrameMeta {
  return {
    size: meta.size,
    timeMs: meta.timeMs,
    moves: meta.moves,
    appName: t('appName'),
    sizeLabel: t(meta.size === 3 ? 'sizeShort3' : 'sizeShort4'),
    url: siteUrl().replace(/^https?:\/\//, ''),
    solvedLabel: t('solved'),
    movesLabel: (n) => t('movesCount', { n }),
    fastLabel: t('fastBadge'),
    formatTime,
  };
}

export function initReplay(nav: { back(): void }): void {
  $('btn-replay-back').addEventListener('click', nav.back);
  $('btn-replay-again').addEventListener('click', () => current && play(current.log, current.meta));
  $('btn-replay-video').addEventListener(
    'click',
    () => current && void openVideoDialog(current.log, current.meta),
  );
  onLeave('replay', () => cancelAnimationFrame(raf));
}

export function showReplay(log: SolveLog, meta: ResultMeta): void {
  current = { log, meta };
  showScreen('replay');
  play(log, meta);
}

function play(log: SolveLog, meta: ResultMeta): void {
  const canvas = $<HTMLCanvasElement>('replay-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const css = canvas.getBoundingClientRect().width || 360;
  canvas.width = canvas.height = Math.floor(css * dpr);
  const plan = planVideo(new ReplayTimeline(log), meta.timeMs);
  const fm = frameMeta(meta);
  const t0 = performance.now();
  cancelAnimationFrame(raf);
  const step = (now: number) => {
    const v = Math.min(now - t0, plan.durationMs);
    drawVideoFrame(ctx, css, plan, fm, v, BOARD_PALETTE, VIDEO_COLORS, dpr);
    if (v < plan.durationMs) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

// ---- 動画の保存 ----

let abort: AbortController | null = null;

function setDialog(
  message: string,
  buttons: { label: string; primary?: boolean; onClick: () => void }[],
  progress?: number,
) {
  $('video-dialog').hidden = false;
  $('video-message').textContent = message;
  const bar = $<HTMLProgressElement>('video-progress');
  bar.hidden = progress === undefined;
  if (progress !== undefined) bar.value = progress;
  const actions = $('video-actions');
  actions.replaceChildren();
  for (const b of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn${b.primary ? ' primary' : ''}`;
    el.textContent = b.label;
    el.addEventListener('click', b.onClick);
    actions.append(el);
  }
}

function closeDialog() {
  abort?.abort();
  abort = null;
  $('video-dialog').hidden = true;
}

const fmtLen = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export async function openVideoDialog(log: SolveLog, meta: ResultMeta): Promise<void> {
  const { detectVideoMethod } = await import('../../video/exportVideo.ts');
  const method = await detectVideoMethod();
  if (!method) {
    setDialog(t('videoUnsupported'), [{ label: t('close'), onClick: closeDialog }]);
    return;
  }
  const timeline = new ReplayTimeline(log);
  const real = planVideo(timeline, meta.timeMs);
  if (exceedsLimit(real)) {
    setDialog(t('videoTooLong', { len: fmtLen(real.durationMs) }), [
      {
        label: t('videoFast'),
        primary: true,
        onClick: () => void make(planVideo(timeline, meta.timeMs, true), meta, method),
      },
      { label: t('videoRealSpeed'), onClick: () => void make(real, meta, method) },
      { label: t('cancel'), onClick: closeDialog },
    ]);
    return;
  }
  await make(real, meta, method);
}

async function make(plan: VideoPlan, meta: ResultMeta, method: VideoMethod) {
  const { exportVideo } = await import('../../video/exportVideo.ts');
  abort = new AbortController();
  const signal = abort.signal;
  setDialog(t('videoMaking', { p: 0 }), [{ label: t('cancel'), onClick: closeDialog }], 0);
  try {
    const blob = await exportVideo({
      method,
      plan,
      meta: frameMeta(meta),
      palette: BOARD_PALETTE,
      signal,
      onProgress: (r) => {
        if (!signal.aborted)
          setDialog(
            t('videoMaking', { p: Math.round(r * 100) }),
            [{ label: t('cancel'), onClick: closeDialog }],
            r,
          );
      },
    });
    if (signal.aborted) return;
    const name = `dice-roll-${meta.size}x${meta.size}-${formatTime(meta.timeMs).replace(/[:.]/g, '_')}.mp4`;
    const file = new File([blob], name, { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const buttons = [];
    if (navigator.canShare?.({ files: [file] }))
      buttons.push({
        label: t('videoShare'),
        primary: true,
        onClick: async () => {
          const outcome = await shareResult(shareText(meta), [file]);
          if (outcome === 'failed') toast(t('videoFailed'));
        },
      });
    buttons.push({
      label: t('videoDownload'),
      primary: buttons.length === 0,
      onClick: () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
      },
    });
    buttons.push({
      label: t('close'),
      onClick: () => {
        URL.revokeObjectURL(url);
        closeDialog();
      },
    });
    setDialog(t('videoReady'), buttons);
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    console.error(e);
    setDialog(t('videoFailed'), [{ label: t('close'), onClick: closeDialog }]);
  }
}
