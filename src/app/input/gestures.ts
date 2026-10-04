// 指(とマウス)の動き・矢印キーを「手」に変える。操作は2種類(設定で選ぶ)。
//
// 空きマスを動かす(blank): 空きマスを指で押さえて動かす。指がマスの境目を越えて隣のマスへ入ると、
//           空きマスがそこへ移る(そのマスのサイコロが、空きマスへ転がる)。空きマスと同じ行・列のマスに
//           触れると、そこまでまとめて動く。行き先の決め方は blankDrag.ts。
// サイコロを動かす(dice): スワイプした向きへ、空きマスの隣のサイコロが転がる。
//   スワイプ: 指がマスの幅の SWIPE_RATIO 倍だけ動いたら、主な向きへ1手。そこを新しい起点にして、
//             指を離さずに続けて動かせば次の1手(連続スワイプ)。
//   タップ:   ほとんど動かずに短時間で離したら、そのマスをタップしたことにする。

import type { Move } from '../../core/dice.ts';
import { blankPath, type Point } from './blankDrag.ts';

export const SWIPE_RATIO = 0.3;
const TAP_MAX_MS = 300;

/** 操作の種類: blank = 空きマスを指で動かす、dice = スワイプでサイコロを動かす */
export type ControlMode = 'blank' | 'dice';
export const CONTROL_MODES: readonly ControlMode[] = ['blank', 'dice'];

export interface GestureTarget {
  /** いまの操作の種類(指を置いた時点のものを、離すまで使う) */
  control(): ControlMode;
  /** スワイプの判定距離(ピクセル) */
  threshold(): number;
  /** 指の位置にあるマス(盤の外なら -1) */
  cellAt(clientX: number, clientY: number): number;
  /** 指の位置を、マスを単位にした座標にする(盤の左上が 0,0) */
  cellPos(clientX: number, clientY: number): Point;
  /** いまの盤の大きさと空きマス(遊んでいなければ null) */
  blank(): { size: number; blank: number } | null;
  onMove(m: Move, time: number): void;
  onTap(cell: number, time: number): void;
  /** 空きマスを、同じ行か列にあるマス cell まで動かす */
  onBlankTo(cell: number, time: number): void;
}

export function attachGestures(el: HTMLElement, target: GestureTarget): () => void {
  let active: {
    id: number;
    control: ControlMode;
    ax: number;
    ay: number;
    sx: number;
    sy: number;
    t0: number;
    moved: boolean;
    /** 直前の指の位置(空きマスを動かす操作で使う) */
    prev: Point | null;
  } | null = null;

  /** 空きマスを動かす操作: 指の位置を1つ処理する */
  const drag = (clientX: number, clientY: number, time: number) => {
    if (!active) return;
    const b = target.blank();
    if (!b) return;
    const p = target.cellPos(clientX, clientY);
    for (const cell of blankPath(b.size, b.blank, active.prev, p)) target.onBlankTo(cell, time);
    active.prev = p;
  };

  const down = (e: PointerEvent) => {
    if (active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    active = {
      id: e.pointerId,
      control: target.control(),
      ax: e.clientX,
      ay: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t0: e.timeStamp,
      moved: false,
      prev: null,
    };
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    if (active.control === 'blank') drag(e.clientX, e.clientY, e.timeStamp);
  };

  const move = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    if (active.control === 'blank') {
      // 速く動かしたときも境目を越えた順が分かるように、まとめて届いた途中の位置も順に処理する
      const steps = e.getCoalescedEvents?.() ?? [];
      for (const s of steps.length ? steps : [e]) drag(s.clientX, s.clientY, e.timeStamp);
      return;
    }
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
    if (e.type === 'pointercancel' || a.control === 'blank') return;
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
const OPPOSITE: Record<Move, Move> = { U: 'D', D: 'U', L: 'R', R: 'L' };

/**
 * 矢印キーを手にする。「サイコロを動かす」操作では、矢印の向きへサイコロが転がる。
 * 「空きマスを動かす」操作では、矢印の向きへ空きマスが動く(サイコロは逆向きに転がる)。
 */
export function keyToMove(key: string, control: ControlMode = 'dice'): Move | null {
  const m = KEY_MOVES[key];
  if (!m) return null;
  return control === 'blank' ? OPPOSITE[m] : m;
}
