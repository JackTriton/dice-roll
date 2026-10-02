// スワイプ・連続スワイプ・タップ・矢印キーを「手」に変える。
//
// スワイプ: 指がマスの幅の SWIPE_RATIO 倍だけ動いたら、主な向きへ1手。そこを新しい起点にして、
//           指を離さずに続けて動かせば次の1手(連続スワイプ)。
// タップ:   ほとんど動かずに短時間で離したら、そのマスをタップしたことにする。

import type { Move } from '../../core/dice.ts';

export const SWIPE_RATIO = 0.3;
const TAP_MAX_MS = 300;

export interface GestureTarget {
  /** スワイプの判定距離(ピクセル) */
  threshold(): number;
  /** 指の位置にあるマス(盤の外なら -1) */
  cellAt(clientX: number, clientY: number): number;
  onMove(m: Move, time: number): void;
  onTap(cell: number, time: number): void;
}

export function attachGestures(el: HTMLElement, target: GestureTarget): () => void {
  let active: {
    id: number;
    ax: number;
    ay: number;
    sx: number;
    sy: number;
    t0: number;
    moved: boolean;
  } | null = null;

  const down = (e: PointerEvent) => {
    if (active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    active = {
      id: e.pointerId,
      ax: e.clientX,
      ay: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t0: e.timeStamp,
      moved: false,
    };
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const move = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    const th = target.threshold();
    // 1回のイベントで大きく動いたときは、その分だけ続けて手を出す
    for (;;) {
      const dx = e.clientX - active.ax;
      const dy = e.clientY - active.ay;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < th) break;
      let m: Move;
      if (Math.abs(dx) >= Math.abs(dy)) {
        m = dx > 0 ? 'R' : 'L';
        active.ax += Math.sign(dx) * th;
        active.ay = e.clientY - Math.sign(dy) * Math.min(Math.abs(dy), th * 0.5);
      } else {
        m = dy > 0 ? 'D' : 'U';
        active.ay += Math.sign(dy) * th;
        active.ax = e.clientX - Math.sign(dx) * Math.min(Math.abs(dx), th * 0.5);
      }
      active.moved = true;
      target.onMove(m, e.timeStamp);
    }
  };

  const up = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.id) return;
    const a = active;
    active = null;
    if (e.type === 'pointercancel') return;
    const dist = Math.hypot(e.clientX - a.sx, e.clientY - a.sy);
    if (!a.moved && dist < target.threshold() * 0.6 && e.timeStamp - a.t0 < TAP_MAX_MS) {
      const cell = target.cellAt(e.clientX, e.clientY);
      if (cell >= 0) target.onTap(cell, e.timeStamp);
    }
  };

  // iOS Safari でスクロールやズームが起きないよう、タッチの既定動作も止める
  const stopTouch = (e: TouchEvent) => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('touchstart', stopTouch, { passive: false });
  el.addEventListener('touchmove', stopTouch, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('touchstart', stopTouch);
    el.removeEventListener('touchmove', stopTouch);
  };
}

const KEY_MOVES: Record<string, Move> = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' };

export function keyToMove(key: string): Move | null {
  return KEY_MOVES[key] ?? null;
}
