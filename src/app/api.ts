// ランキング API のクライアント。VITE_API_BASE が空ならランキングは使わない(練習だけで動く)。

import type { Size } from '../core/constants.ts';

const BASE = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
export const apiEnabled = BASE !== '';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  if (!apiEnabled) return { ok: false, status: 0, error: 'disabled' };
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, status: res.status, error: data.error ?? `http_${res.status}` };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: 'offline' };
  }
}

export interface ScrambleResponse {
  scrambleId: string;
  scramble: string;
  size: Size;
}

export type SubmitResponse =
  | { accepted: true; best: boolean; bestTimeMs: number; rank: number; total: number }
  | { accepted: false; reason: string };

export interface RankingEntry {
  rank: number;
  nickname: string;
  timeMs: number;
  moves: number;
  me: boolean;
}

export interface RankingResponse {
  size: Size;
  total: number;
  entries: RankingEntry[];
  me: { rank: number; timeMs: number } | null;
}

export const fetchScramble = (deviceId: string, size: Size) =>
  call<ScrambleResponse>('POST', '/api/v1/scramble', { deviceId, size });

export const submitSolve = (body: {
  deviceId: string;
  scrambleId: string;
  moves: string;
  times: number[];
  timeMs: number;
  nickname?: string;
}) => call<SubmitResponse>('POST', '/api/v1/submit', body);

export const fetchRanking = (size: Size, deviceId: string) =>
  call<RankingResponse>('GET', `/api/v1/ranking?size=${size}&deviceId=${encodeURIComponent(deviceId)}`);

export const putProfile = (deviceId: string, nickname: string) =>
  call<{ nickname: string }>('PUT', '/api/v1/profile', { deviceId, nickname });

// 次の問題を先に受け取っておき、「スタート」を押したときの待ち時間をなくす
const PREFETCH_MAX_AGE = 25 * 60_000;
/** サーバーの発行間隔の制限(1端末2秒)に当たったときに待つ時間 */
const RETRY_AFTER_MS = 2200;
const prefetched = new Map<Size, { data: ScrambleResponse; at: number }>();
const pending = new Map<Size, Promise<number>>();

/** 問題を1つ受け取っておく。戻り値は HTTP ステータス(受け取り済みなら 200、通信できなければ 0) */
export function prefetchScramble(deviceId: string, size: Size): Promise<number> {
  if (!apiEnabled) return Promise.resolve(0);
  if (prefetched.has(size)) return Promise.resolve(200);
  const existing = pending.get(size);
  if (existing) return existing;
  const p = fetchScramble(deviceId, size)
    .then((r) => {
      if (r.ok) prefetched.set(size, { data: r.data, at: Date.now() });
      return r.ok ? 200 : r.status;
    })
    .finally(() => pending.delete(size));
  pending.set(size, p);
  return p;
}

/** 先読みした問題を取り出す。無ければ受け取りを待つ(最大 waitMs。発行間隔の制限に当たったら待って取り直す) */
export async function takeScramble(
  deviceId: string,
  size: Size,
  waitMs = 6000,
): Promise<ScrambleResponse | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const e = prefetched.get(size);
    prefetched.delete(size);
    if (e && Date.now() - e.at < PREFETCH_MAX_AGE) return e.data;
    const left = deadline - Date.now();
    if (left <= 0) return null;
    const status = await Promise.race([
      prefetchScramble(deviceId, size),
      new Promise<number>((r) => setTimeout(() => r(-1), left)),
    ]);
    if (status === 200) continue;
    if (status !== 429 || Date.now() + RETRY_AFTER_MS > deadline) return null;
    await new Promise((r) => setTimeout(r, RETRY_AFTER_MS));
  }
}
