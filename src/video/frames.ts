// リプレイ動画の1コマを描く。アプリ内のリプレイ画面も同じ関数で描く。
//
// 動画の時間軸: 最初の1手の1秒前のスクランブルから始め、最後のアニメーションが終わったら結果カードを2秒出す。
// 早送り版では、結果カードより前の部分を一定の倍率で縮める。

import { X_VIDEO_LIMIT_MS, type Size } from '../core/constants.ts';
import type { ReplayTimeline } from '../app/render/frame.ts';
import { drawBoard, type BoardPalette } from '../app/render/boardView.ts';

export const LEAD_IN_MS = 1000;
export const TAIL_MS = 400;
export const END_CARD_MS = 2000;
export const FPS = 30;

export interface VideoPlan {
  timeline: ReplayTimeline;
  /** 動画の 0ms に当たるタイマーの時刻 */
  start: number;
  /** 結果カードに切り替わるタイマーの時刻 */
  contentEnd: number;
  /** 早送りの倍率(1 = 実際の速さ) */
  speed: number;
  /** 動画全体の長さ */
  durationMs: number;
}

export function planVideo(timeline: ReplayTimeline, timeMs: number, fitToLimit = false): VideoPlan {
  const start = timeline.firstTime - LEAD_IN_MS;
  const contentEnd = Math.max(timeline.lastEnd, timeMs) + TAIL_MS;
  const content = contentEnd - start;
  const room = X_VIDEO_LIMIT_MS - END_CARD_MS - 500;
  const speed = fitToLimit && content > room ? content / room : 1;
  return { timeline, start, contentEnd, speed, durationMs: Math.ceil(content / speed + END_CARD_MS) };
}

/** 実際の速さのままだと X の上限を超えるか */
export const exceedsLimit = (plan: VideoPlan): boolean => plan.durationMs > X_VIDEO_LIMIT_MS;

export function timerAt(plan: VideoPlan, videoMs: number): number {
  return Math.min(plan.contentEnd, plan.start + videoMs * plan.speed);
}

export interface FrameMeta {
  size: Size;
  timeMs: number;
  moves: number;
  appName: string;
  sizeLabel: string;
  url: string;
  solvedLabel: string;
  movesLabel: (n: number) => string;
  fastLabel: string;
  formatTime: (ms: number) => string;
}

export interface FrameColors {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  card: string;
}

export const VIDEO_COLORS: FrameColors = {
  bg: '#f4efe6',
  text: '#2a2622',
  muted: '#7a7166',
  accent: '#d4102a',
  card: 'rgba(255, 250, 242, 0.94)',
};

const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif';

export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  plan: VideoPlan,
  meta: FrameMeta,
  videoMs: number,
  palette: BoardPalette,
  colors: FrameColors = VIDEO_COLORS,
  /** 画面の画素密度(動画では 1) */
  scale = 1,
): void {
  const timer = timerAt(plan, videoMs);
  const shown = Math.max(0, Math.min(meta.timeMs, timer));
  const moves = plan.timeline.movesAt(timer);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, W);
  ctx.textBaseline = 'middle';

  // 見出し
  ctx.fillStyle = colors.text;
  ctx.font = `800 ${W * 0.042}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`🎲 ${meta.appName}`, W * 0.06, W * 0.06);
  ctx.textAlign = 'right';
  ctx.fillStyle = colors.muted;
  ctx.font = `700 ${W * 0.038}px ${FONT}`;
  ctx.fillText(
    plan.speed > 1.001 ? `${meta.sizeLabel} · ${meta.fastLabel} ×${plan.speed.toFixed(2)}` : meta.sizeLabel,
    W * 0.94,
    W * 0.06,
  );

  // タイマーと手数
  ctx.textAlign = 'center';
  ctx.fillStyle = timer >= meta.timeMs ? '#2e8b57' : colors.text;
  ctx.font = `800 ${W * 0.09}px ${FONT}`;
  ctx.fillText(meta.formatTime(shown), W / 2, W * 0.15);
  ctx.fillStyle = colors.muted;
  ctx.font = `600 ${W * 0.034}px ${FONT}`;
  ctx.fillText(meta.movesLabel(moves), W / 2, W * 0.215);

  // 盤
  const bw = W * 0.7;
  drawBoard(ctx, (W - bw) / 2, W * 0.25, bw, plan.timeline.frameAt(timer), palette);

  // URL
  ctx.fillStyle = colors.muted;
  ctx.font = `500 ${W * 0.026}px ${FONT}`;
  ctx.fillText(meta.url, W / 2, W * 0.975);

  // 結果カード
  const contentMs = (plan.contentEnd - plan.start) / plan.speed;
  if (videoMs >= contentMs) {
    const a = Math.min(1, (videoMs - contentMs) / 250);
    ctx.globalAlpha = a;
    ctx.fillStyle = colors.card;
    ctx.beginPath();
    ctx.roundRect(W * 0.12, W * 0.36, W * 0.76, W * 0.42, W * 0.04);
    ctx.fill();
    ctx.fillStyle = colors.accent;
    ctx.font = `800 ${W * 0.06}px ${FONT}`;
    ctx.fillText(meta.solvedLabel, W / 2, W * 0.45);
    ctx.fillStyle = colors.text;
    ctx.font = `800 ${W * 0.1}px ${FONT}`;
    ctx.fillText(meta.formatTime(meta.timeMs), W / 2, W * 0.56);
    ctx.fillStyle = colors.muted;
    ctx.font = `600 ${W * 0.038}px ${FONT}`;
    ctx.fillText(`${meta.sizeLabel} · ${meta.movesLabel(meta.moves)}`, W / 2, W * 0.67);
    ctx.globalAlpha = 1;
  }
}
