// 端末内の記録と設定(localStorage)。使えない環境ではメモリだけで動く。

import type { Rule, Size } from '../core/constants.ts';
import type { SolveLog } from '../core/replay.ts';
import { HARD_MODE, LOOK_LAB } from './flags.ts';
import type { Lang } from './i18n/index.ts';
import { CONTROL_MODES, type ControlMode } from './input/gestures.ts';
import { PLAIN_LOOK, type BoardLook } from './render/boardView.ts';
import {
  ONE_FIGURES,
  SIDE_MARKS,
  type DieLook,
  type OneFigure,
  type SideMark,
} from './render/dieRenderer.ts';

export interface SizeStats {
  best: number | null;
  bestMoves: number | null;
  bestAo5: number | null;
  last5: number[];
  count: number;
  lastReplay: SolveLog | null;
  bestReplay: SolveLog | null;
}

export interface Store {
  v: 1;
  deviceId: string;
  lang: Lang | null;
  nickname: string | null;
  size: Size;
  /** 選んでいるルール */
  rule: Rule;
  stats: Record<'3' | '4', SizeStats>;
  /** ハード(向きまで揃える)の記録 */
  hardStats: Record<'3' | '4', SizeStats>;
  /** ハードのサイコロの見た目(見比べ用に、開発用の版の設定で切り替えたもの。本番では使わない) */
  look: DieLook;
  /** look を保存したときの、既定の見た目の版(LOOK_REV) */
  lookRev: number;
  /** 操作の種類: blank = 空きマスを指で動かす(既定)、dice = スワイプでサイコロを動かす(これまでの操作) */
  control: ControlMode;
  /** 操作が変わったことの知らせを、まだ出していない(これまでの版から使っている人に、一度だけ出す) */
  controlNotice: boolean;
}

const KEY = 'diceroll.v1';

/** ハードのサイコロの見た目(Q#34 で決定): 1の目を三角にし、2の面のある縁に青い線を引く */
export const DEFAULT_LOOK: DieLook = { side: 'bar', one: 'tri' };

/**
 * 既定の見た目を変えるたびに上げる番号。これより前に保存された見た目は、既定に置き換える
 * (見比べのために選んでいた案が残って、決めた見た目にならないのを防ぐ)。
 */
const LOOK_REV = 1;

/** 保存されていた見た目のうち、いまは無い値を既定に直す */
function normalizeLook(raw: unknown): DieLook {
  const r = (raw ?? {}) as { side?: unknown; one?: unknown };
  const side = SIDE_MARKS.includes(r.side as SideMark) ? (r.side as SideMark) : DEFAULT_LOOK.side;
  const one = ONE_FIGURES.includes(r.one as OneFigure) ? (r.one as OneFigure) : DEFAULT_LOOK.one;
  // 向きの分かる目印が1つも無い組み合わせは、既定に戻す
  return side === 'none' && one === 'dot' ? { ...DEFAULT_LOOK } : { side, one };
}

const emptyStats = (): SizeStats => ({
  best: null,
  bestMoves: null,
  bestAo5: null,
  last5: [],
  count: 0,
  lastReplay: null,
  bestReplay: null,
});

function freshStore(): Store {
  return {
    v: 1,
    deviceId: crypto.randomUUID(),
    lang: null,
    nickname: null,
    size: 3,
    rule: 'ones',
    stats: { '3': emptyStats(), '4': emptyStats() },
    hardStats: { '3': emptyStats(), '4': emptyStats() },
    look: { ...DEFAULT_LOOK },
    lookRev: LOOK_REV,
    control: 'blank',
    controlNotice: false,
  };
}

let memory: Store | null = null;
let persistent = true;

export function storageAvailable(): boolean {
  load();
  return persistent;
}

export function load(): Store {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Store) : null;
    memory = parsed && parsed.v === 1 && parsed.deviceId ? { ...freshStore(), ...parsed } : freshStore();
    if (memory.rule !== 'aligned') memory.rule = 'ones';
    memory.look = parsed?.lookRev === LOOK_REV ? normalizeLook(memory.look) : { ...DEFAULT_LOOK };
    memory.lookRev = LOOK_REV;
    // 操作の種類を選ぶ前の版から使っている人には、操作が変わったことを一度だけ知らせる
    if (parsed && parsed.v === 1 && parsed.deviceId && parsed.control === undefined)
      memory.controlNotice = true;
    if (!CONTROL_MODES.includes(memory.control)) memory.control = 'blank';
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    persistent = false;
    memory = freshStore();
  }
  return memory;
}

export function save(update: (s: Store) => void): Store {
  const s = load();
  update(s);
  if (persistent) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      persistent = false;
    }
  }
  return s;
}

export const statsOf = (s: Store, rule: Rule, size: Size): SizeStats =>
  (rule === 'aligned' ? s.hardStats : s.stats)[String(size) as '3' | '4'];

/** いま選んでいるルール(ハードを出していない版では、いつも ones) */
export const activeRule = (): Rule => (HARD_MODE ? load().rule : 'ones');

/** そのルールで使う盤の見た目 */
/** ハードのサイコロの見た目。見比べ用の切り替えを出していない版では、いつも決めた見た目 */
export const hardLook = (): DieLook => (LOOK_LAB ? load().look : DEFAULT_LOOK);

export const lookFor = (rule: Rule): BoardLook =>
  rule === 'aligned' ? { ...hardLook(), upright: true } : PLAIN_LOOK;

export interface SolveOutcome {
  newBest: boolean;
  ao5: number | null;
  newBestAo5: boolean;
}

/** 解き終えた記録を反映する */
/** 端末にリプレイ(手順と時刻)まで残す手数の上限。これより長い記録は、タイムと手数だけを残す */
export const REPLAY_KEEP_MOVES = 20_000;

export function recordSolve(size: Size, log: SolveLog, timeMs: number): SolveOutcome {
  let outcome: SolveOutcome = { newBest: false, ao5: null, newBestAo5: false };
  // 数万手の記録は1件で数百 KB になる。端末の保存領域(約 5MB)を使い切ると、ほかの記録も保存できなくなる
  const replay = log.moves.length <= REPLAY_KEEP_MOVES ? log : null;
  save((s) => {
    const st = statsOf(s, log.rule ?? 'ones', size);
    st.count++;
    st.lastReplay = replay;
    const newBest = st.best === null || timeMs < st.best;
    if (newBest) {
      st.best = timeMs;
      st.bestMoves = log.moves.length;
      st.bestReplay = replay;
    }
    st.last5 = [...st.last5, timeMs].slice(-5);
    const ao5 = st.last5.length === 5 ? Math.round(st.last5.reduce((a, b) => a + b, 0) / 5) : null;
    const newBestAo5 = ao5 !== null && (st.bestAo5 === null || ao5 < st.bestAo5);
    if (newBestAo5) st.bestAo5 = ao5;
    outcome = { newBest, ao5, newBestAo5 };
  });
  return outcome;
}

export function resetStats(): void {
  save((s) => {
    s.stats = { '3': emptyStats(), '4': emptyStats() };
    s.hardStats = { '3': emptyStats(), '4': emptyStats() };
  });
}
