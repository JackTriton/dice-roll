// ランキング API のクライアント。VITE_API_BASE が空ならランキングは使わない(練習だけで動く)。

import type { Rule, Size } from '../core/constants.ts';

const BASE = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
export const apiEnabled = BASE !== '';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult<T>> {
  if (!apiEnabled) return { ok: false, status: 0, error: 'disabled' };
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...extraHeaders },
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
  /** ルール(ルールに対応する前のサーバーは返さない。そのときは ones) */
  rule?: Rule;
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

/** クエリに付けるルール(ふつうは省く。ルールに対応する前のサーバーとも話せるように) */
const ruleQuery = (rule: Rule) => (rule === 'ones' ? '' : `&rule=${rule}`);

export const fetchScramble = (deviceId: string, size: Size, rule: Rule = 'ones') =>
  call<ScrambleResponse>(
    'POST',
    '/api/v1/scramble',
    rule === 'ones' ? { deviceId, size } : { deviceId, size, rule },
  );

export const submitSolve = (body: {
  deviceId: string;
  scrambleId: string;
  moves: string;
  times: number[];
  timeMs: number;
  nickname?: string;
}) => call<SubmitResponse>('POST', '/api/v1/submit', body);

export const fetchRanking = (size: Size, deviceId: string, rule: Rule = 'ones') =>
  call<RankingResponse>(
    'GET',
    `/api/v1/ranking?size=${size}${ruleQuery(rule)}&deviceId=${encodeURIComponent(deviceId)}`,
  );

export const putProfile = (deviceId: string, nickname: string) =>
  call<{ nickname: string }>('PUT', '/api/v1/profile', { deviceId, nickname });

// 次の問題を先に受け取っておき、「スタート」を押したときの待ち時間をなくす
const PREFETCH_MAX_AGE = 25 * 60_000;
/** サーバーの発行間隔の制限(1端末2秒)に当たったときに待つ時間 */
const RETRY_AFTER_MS = 2200;
/** 先読みは、盤の大きさとルールの組ごとに持つ */
type PrefetchKey = `${Rule}:${Size}`;
const prefetched = new Map<PrefetchKey, { data: ScrambleResponse; at: number }>();
const pending = new Map<PrefetchKey, Promise<number>>();

/** 問題を1つ受け取っておく。戻り値は HTTP ステータス(受け取り済みなら 200、通信できなければ 0) */
export function prefetchScramble(deviceId: string, size: Size, rule: Rule = 'ones'): Promise<number> {
  if (!apiEnabled) return Promise.resolve(0);
  const key: PrefetchKey = `${rule}:${size}`;
  if (prefetched.has(key)) return Promise.resolve(200);
  const existing = pending.get(key);
  if (existing) return existing;
  const p = fetchScramble(deviceId, size, rule)
    .then((r) => {
      if (r.ok) prefetched.set(key, { data: r.data, at: Date.now() });
      return r.ok ? 200 : r.status;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

/** 先読みした問題を取り出す。無ければ受け取りを待つ(最大 waitMs。発行間隔の制限に当たったら待って取り直す) */
export async function takeScramble(
  deviceId: string,
  size: Size,
  rule: Rule = 'ones',
  waitMs = 6000,
): Promise<ScrambleResponse | null> {
  const deadline = Date.now() + waitMs;
  const key: PrefetchKey = `${rule}:${size}`;
  for (;;) {
    const e = prefetched.get(key);
    prefetched.delete(key);
    if (e && Date.now() - e.at < PREFETCH_MAX_AGE) return e.data;
    const left = deadline - Date.now();
    if (left <= 0) return null;
    const status = await Promise.race([
      prefetchScramble(deviceId, size, rule),
      new Promise<number>((r) => setTimeout(() => r(-1), left)),
    ]);
    if (status === 200) continue;
    if (status !== 429 || Date.now() + RETRY_AFTER_MS > deadline) return null;
    await new Promise((r) => setTimeout(r, RETRY_AFTER_MS));
  }
}

// ---- 管理用(#admin)。合言葉(管理用トークン)は、管理者の端末の localStorage にだけ保存する ----

const ADMIN_KEY = 'diceroll.admin';

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(ADMIN_KEY, token);
    else localStorage.removeItem(ADMIN_KEY);
  } catch {
    // 保存できなくても、この画面を開いている間は使える
  }
}

const adminCall = <T>(method: string, path: string, token = getAdminToken() ?? '') =>
  call<T>(method, path, undefined, { authorization: `Bearer ${token}` });

export interface AdminRankingEntry {
  deviceId: string;
  nickname: string | null;
  timeMs: number;
  moves: number;
  optimal: number | null;
  createdAt: number;
  attempts: number;
}

export interface AdminAttemptSummary {
  id: number;
  deviceId: string;
  nickname: string | null;
  size: Size;
  rule?: Rule;
  timeMs: number | null;
  moves: number | null;
  optimal: number | null;
  accepted: number;
  reason: string | null;
  createdAt: number;
}

/** リプレイ1件分(挑戦、またはベスト記録) */
export interface AdminReplay {
  deviceId: string;
  nickname: string | null;
  size: Size;
  rule?: Rule;
  scramble: string;
  optimal: number | null;
  moves: string | null;
  times: number[] | null;
  timeMs: number | null;
  createdAt: number;
  accepted?: number;
  reason?: string | null;
}

export const adminRanking = (size: Size, rule: Rule = 'ones', token?: string) =>
  adminCall<{ size: Size; entries: AdminRankingEntry[] }>(
    'GET',
    `/api/v1/admin/ranking?size=${size}${ruleQuery(rule)}`,
    token,
  );

export function adminAttempts(q: { deviceId?: string; size?: Size; rule?: Rule; before?: number }) {
  const p = new URLSearchParams();
  if (q.deviceId) p.set('deviceId', q.deviceId);
  if (q.size) p.set('size', String(q.size));
  if (q.rule) p.set('rule', q.rule);
  if (q.before) p.set('before', String(q.before));
  return adminCall<{ attempts: AdminAttemptSummary[] }>('GET', `/api/v1/admin/attempts?${p}`);
}

export const adminAttempt = (id: number) => adminCall<AdminReplay>('GET', `/api/v1/admin/attempts/${id}`);

export const adminBest = (deviceId: string, size: Size, rule: Rule = 'ones') =>
  adminCall<AdminReplay>(
    'GET',
    `/api/v1/admin/best?deviceId=${encodeURIComponent(deviceId)}&size=${size}${ruleQuery(rule)}`,
  );

export const adminDeleteScore = (deviceId: string, size: Size, rule: Rule = 'ones') =>
  adminCall<{ deleted: number }>(
    'DELETE',
    `/api/v1/admin/scores?deviceId=${encodeURIComponent(deviceId)}&size=${size}${ruleQuery(rule)}`,
  );
