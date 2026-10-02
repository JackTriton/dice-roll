// 端末内の記録と設定(localStorage)。使えない環境ではメモリだけで動く。

import type { Size } from '../core/constants.ts';
import type { SolveLog } from '../core/replay.ts';
import type { Lang } from './i18n/index.ts';

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
  howtoSeen: boolean;
  stats: Record<'3' | '4', SizeStats>;
}

const KEY = 'diceroll.v1';

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
    howtoSeen: false,
    stats: { '3': emptyStats(), '4': emptyStats() },
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

export interface SolveOutcome {
  newBest: boolean;
  ao5: number | null;
  newBestAo5: boolean;
}

/** 解き終えた記録を反映する */
export function recordSolve(size: Size, log: SolveLog, timeMs: number): SolveOutcome {
  let outcome: SolveOutcome = { newBest: false, ao5: null, newBestAo5: false };
  save((s) => {
    const st = s.stats[String(size) as '3' | '4'];
    st.count++;
    st.lastReplay = log;
    const newBest = st.best === null || timeMs < st.best;
    if (newBest) {
      st.best = timeMs;
      st.bestMoves = log.moves.length;
      st.bestReplay = log;
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
  });
}
