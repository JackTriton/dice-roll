// ランキング API 本体。依存(DB・問題プール・時計・乱数・キャッシュ)を外から受け取るので、Node のテストでも動かせる。
//
//   POST /api/v1/scramble  { deviceId, size }                                → 問題を発行する
//   POST /api/v1/submit    { deviceId, scrambleId, moves, times, timeMs }      → 検証して登録する
//   GET  /api/v1/ranking?size=3&deviceId=…                                   → 上位100件と自分の順位
//   PUT  /api/v1/profile   { deviceId, nickname }                             → ニックネームを登録・変更する
//
// 管理用(Authorization: Bearer <ADMIN_TOKEN>。ADMIN_TOKEN が無ければ使えない):
//   GET    /api/v1/admin/ranking?size=3                   → ランキング(端末 ID・挑戦の数つき)
//   GET    /api/v1/admin/attempts?deviceId=&size=&before= → 挑戦の一覧(新しい順)
//   GET    /api/v1/admin/attempts/<id>                    → 挑戦1件(リプレイ用の手順と時刻)
//   GET    /api/v1/admin/best?deviceId=…&size=3           → ベスト記録(リプレイ用)
//   DELETE /api/v1/admin/scores?deviceId=…&size=3         → ベスト記録を消す(ランキングから外す)

import { encodeBoard } from '../../src/core/board.ts';
import { MAX_MOVES, SCRAMBLE_TTL_MS, type Size } from '../../src/core/constants.ts';
import { validateNickname } from '../../src/core/nickname.ts';
import { pickFromPool } from '../../src/core/pool.ts';
import type { Rng } from '../../src/core/random.ts';
import { randomScramble4 } from '../../src/core/scramble.ts';
import { verifySolve } from '../../src/core/verify.ts';
import type { CacheLike, DB } from './db.ts';

export interface AppDeps {
  db: DB;
  /** 3×3 の問題プール */
  pool3: Uint8Array;
  now: () => number;
  rng: Rng;
  /** 許可するオリジン(カンマ区切りの環境変数から)。'*' ならすべて */
  allowedOrigins: string[];
  cache?: CacheLike;
  /** 問題の発行間隔の下限(1端末あたり) */
  issueIntervalMs?: number;
  /** 管理用 API の合言葉(Workers の秘密 ADMIN_TOKEN)。無ければ管理用 API は使えない */
  adminToken?: string;
}

const RANKING_LIMIT = 100;
const RANKING_CACHE_SECONDS = 60;
const RETENTION_MS = 7 * 24 * 60 * 60_000;
/** 挑戦(attempts)を残す期間 */
const ATTEMPT_RETENTION_MS = 90 * 24 * 60 * 60_000;
const ADMIN_LIST_LIMIT = 200;
const DEVICE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const isSize = (v: unknown): v is Size => v === 3 || v === 4;
const isDevice = (v: unknown): v is string => typeof v === 'string' && DEVICE_RE.test(v);

/** 文字列の比較にかかる時間が、どこまで一致したかで変わらないようにする */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function createApp(deps: AppDeps) {
  const { db } = deps;
  const issueInterval = deps.issueIntervalMs ?? 2000;

  function cors(req: Request): Record<string, string> {
    const origin = req.headers.get('origin') ?? '';
    const allowed = deps.allowedOrigins.includes('*') || deps.allowedOrigins.includes(origin);
    return allowed && origin
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
          'access-control-max-age': '86400',
          vary: 'origin',
        }
      : {};
  }

  const json = (req: Request, status: number, body: unknown, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...cors(req),
        ...extra,
      },
    });

  async function readJson(req: Request): Promise<Record<string, unknown>> {
    const text = await req.text();
    if (text.length > 64 * 1024) throw new HttpError(413, 'too_large');
    try {
      const v = JSON.parse(text);
      if (v && typeof v === 'object') return v as Record<string, unknown>;
    } catch {
      // 下で 400
    }
    throw new HttpError(400, 'bad_json');
  }

  const rankingKey = (size: Size) => new Request(`https://ranking.cache/v1/${size}`);

  async function issue(body: Record<string, unknown>) {
    const { deviceId, size } = body;
    if (!isDevice(deviceId) || !isSize(size)) throw new HttpError(400, 'bad_request');
    const now = deps.now();
    const last = await db
      .prepare('SELECT issued_at FROM issued WHERE device_id = ? ORDER BY issued_at DESC LIMIT 1')
      .bind(deviceId)
      .first<{ issued_at: number }>();
    if (last && now - last.issued_at < issueInterval) throw new HttpError(429, 'rate_limited');
    let scramble: string;
    let optimal: number | null = null;
    if (size === 3) {
      const e = pickFromPool(deps.pool3, deps.rng);
      scramble = encodeBoard(e.board);
      optimal = e.optimal;
    } else scramble = encodeBoard(randomScramble4(deps.rng));
    const id = crypto.randomUUID();
    await db
      .prepare(
        'INSERT INTO issued (id, device_id, size, scramble, optimal, issued_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(id, deviceId, size, scramble, optimal, now)
      .run();
    return { scrambleId: id, scramble, size };
  }

  async function reject(
    deviceId: string,
    size: number | null,
    reason: string,
    timeMs: unknown,
    moves: unknown,
  ) {
    await db
      .prepare('INSERT INTO rejects (at, device_id, size, reason, time_ms, moves) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(
        deps.now(),
        deviceId,
        size,
        reason,
        typeof timeMs === 'number' ? timeMs : null,
        typeof moves === 'string' ? moves.length : null,
      )
      .run();
    return { accepted: false, reason };
  }

  interface IssuedRow {
    device_id: string;
    size: Size;
    scramble: string;
    optimal: number | null;
    issued_at: number;
    used: number;
  }

  /** 送られてきた挑戦を、受け付けたかどうかにかかわらず残す(管理者画面のリプレイ用) */
  async function recordAttempt(
    deviceId: string,
    scrambleId: string,
    row: IssuedRow,
    moves: unknown,
    times: unknown,
    timeMs: unknown,
    reason: string | null,
  ) {
    const okMoves = typeof moves === 'string' && moves.length <= MAX_MOVES ? moves : null;
    const okTimes = Array.isArray(times) && times.length <= MAX_MOVES ? JSON.stringify(times) : null;
    await db
      .prepare(
        `INSERT INTO attempts (device_id, size, scramble_id, scramble, optimal, moves, times, time_ms, accepted, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        deviceId,
        row.size,
        scrambleId,
        row.scramble,
        row.optimal,
        okMoves,
        okTimes,
        Number.isSafeInteger(timeMs) ? timeMs : null,
        reason === null ? 1 : 0,
        reason,
        deps.now(),
      )
      .run();
  }

  async function rankOf(size: Size, timeMs: number) {
    const better = await db
      .prepare('SELECT COUNT(*) AS n FROM scores WHERE size = ? AND time_ms < ?')
      .bind(size, timeMs)
      .first<{ n: number }>();
    const total = await db
      .prepare('SELECT COUNT(*) AS n FROM scores WHERE size = ?')
      .bind(size)
      .first<{ n: number }>();
    return { rank: (better?.n ?? 0) + 1, total: total?.n ?? 0 };
  }

  async function submit(body: Record<string, unknown>) {
    const { deviceId, scrambleId, moves, times, timeMs, nickname } = body;
    if (!isDevice(deviceId) || typeof scrambleId !== 'string' || scrambleId.length > 64)
      throw new HttpError(400, 'bad_request');

    // ニックネームが未登録なら、問題を使い切らずに知らせる(クライアントは登録してから送り直す)
    let player = await db
      .prepare('SELECT nickname FROM players WHERE device_id = ?')
      .bind(deviceId)
      .first<{ nickname: string }>();
    if (!player && nickname !== undefined) {
      const nick = validateNickname(nickname);
      if (!nick) throw new HttpError(400, 'invalid_nickname');
      await upsertPlayer(deviceId, nick);
      player = { nickname: nick };
    }
    if (!player) throw new HttpError(400, 'nickname_required');

    const row = await db
      .prepare('SELECT device_id, size, scramble, optimal, issued_at, used FROM issued WHERE id = ?')
      .bind(scrambleId)
      .first<IssuedRow>();
    if (!row || row.device_id !== deviceId) return reject(deviceId, null, 'not_found', timeMs, moves);
    const refuse = async (reason: string) => {
      await recordAttempt(deviceId, scrambleId, row, moves, times, timeMs, reason);
      return reject(deviceId, row.size, reason, timeMs, moves);
    };
    if (row.used) return refuse('used');
    const now = deps.now();
    if (now - row.issued_at > SCRAMBLE_TTL_MS) return refuse('expired');
    // 同じ問題での再提出を防ぐため、検証の結果にかかわらず使用済みにする
    await db.prepare('UPDATE issued SET used = 1 WHERE id = ?').bind(scrambleId).run();

    const v = verifySolve({
      scramble: row.scramble,
      moves: moves as string,
      times: times as number[],
      timeMs: timeMs as number,
    });
    if (!v.ok) return refuse(v.reason);
    // タイムは、問題を出してから記録を受け取るまでの実際の経過時間を超えられない
    if (v.timeMs > now - row.issued_at) return refuse('too_fast_wall');
    await recordAttempt(deviceId, scrambleId, row, moves, times, timeMs, null);

    const prev = await db
      .prepare('SELECT time_ms FROM scores WHERE device_id = ? AND size = ?')
      .bind(deviceId, row.size)
      .first<{ time_ms: number }>();
    const best = !prev || v.timeMs < prev.time_ms;
    if (best) {
      await db
        .prepare(
          `INSERT INTO scores (device_id, size, time_ms, moves, scramble_id, solution, times, created_at, scramble, optimal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (device_id, size) DO UPDATE SET time_ms = excluded.time_ms, moves = excluded.moves,
             scramble_id = excluded.scramble_id, solution = excluded.solution, times = excluded.times,
             created_at = excluded.created_at, scramble = excluded.scramble, optimal = excluded.optimal`,
        )
        .bind(
          deviceId,
          row.size,
          v.timeMs,
          v.moves,
          scrambleId,
          moves,
          JSON.stringify(times),
          now,
          row.scramble,
          row.optimal,
        )
        .run();
      await deps.cache?.delete(rankingKey(row.size));
    }
    const bestTimeMs = best ? v.timeMs : prev!.time_ms;
    const { rank, total } = await rankOf(row.size, bestTimeMs);
    return { accepted: true, best, bestTimeMs, rank, total };
  }

  async function upsertPlayer(deviceId: string, nickname: string) {
    const now = deps.now();
    await db
      .prepare(
        `INSERT INTO players (device_id, nickname, created_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (device_id) DO UPDATE SET nickname = excluded.nickname, updated_at = excluded.updated_at`,
      )
      .bind(deviceId, nickname, now, now)
      .run();
  }

  async function profile(body: Record<string, unknown>) {
    const { deviceId, nickname } = body;
    if (!isDevice(deviceId)) throw new HttpError(400, 'bad_request');
    const nick = validateNickname(nickname);
    if (!nick) throw new HttpError(400, 'invalid_nickname');
    await upsertPlayer(deviceId, nick);
    await Promise.all([deps.cache?.delete(rankingKey(3)), deps.cache?.delete(rankingKey(4))]);
    return { nickname: nick };
  }

  interface TopEntry {
    device_id: string;
    nickname: string;
    time_ms: number;
    moves: number;
  }

  async function top(size: Size): Promise<{ entries: TopEntry[]; total: number }> {
    const key = rankingKey(size);
    const cached = await deps.cache?.match(key);
    if (cached) return (await cached.json()) as { entries: TopEntry[]; total: number };
    const { results } = await db
      .prepare(
        `SELECT s.device_id, p.nickname, s.time_ms, s.moves FROM scores s JOIN players p ON p.device_id = s.device_id
         WHERE s.size = ? ORDER BY s.time_ms, s.created_at LIMIT ?`,
      )
      .bind(size, RANKING_LIMIT)
      .all<TopEntry>();
    const total = await db
      .prepare('SELECT COUNT(*) AS n FROM scores WHERE size = ?')
      .bind(size)
      .first<{ n: number }>();
    const data = { entries: results, total: total?.n ?? 0 };
    await deps.cache?.put(
      key,
      new Response(JSON.stringify(data), {
        headers: { 'cache-control': `max-age=${RANKING_CACHE_SECONDS}` },
      }),
    );
    return data;
  }

  async function ranking(url: URL) {
    const size = Number(url.searchParams.get('size'));
    const deviceId = url.searchParams.get('deviceId');
    if (!isSize(size)) throw new HttpError(400, 'bad_request');
    const { entries, total } = await top(size);
    // 同じタイムは同じ順位にする
    let rank = 0;
    let prevTime = -1;
    const list = entries.map((e, i) => {
      if (e.time_ms !== prevTime) rank = i + 1;
      prevTime = e.time_ms;
      return { rank, nickname: e.nickname, timeMs: e.time_ms, moves: e.moves, me: e.device_id === deviceId };
    });
    let me: { rank: number; timeMs: number } | null = null;
    if (isDevice(deviceId)) {
      const mine = await db
        .prepare('SELECT time_ms FROM scores WHERE device_id = ? AND size = ?')
        .bind(deviceId, size)
        .first<{ time_ms: number }>();
      if (mine) me = { rank: (await rankOf(size, mine.time_ms)).rank, timeMs: mine.time_ms };
    }
    return { size, total, entries: list, me };
  }

  // ---- 管理用 ----

  function requireAdmin(req: Request) {
    if (!deps.adminToken) throw new HttpError(403, 'admin_disabled');
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || !safeEqual(token, deps.adminToken)) throw new HttpError(401, 'unauthorized');
  }

  const parseTimes = (t: string | null): number[] | null => {
    try {
      return t ? (JSON.parse(t) as number[]) : null;
    } catch {
      return null;
    }
  };

  async function adminRanking(url: URL) {
    const size = Number(url.searchParams.get('size'));
    if (!isSize(size)) throw new HttpError(400, 'bad_request');
    const { results } = await db
      .prepare(
        `SELECT s.device_id AS deviceId, p.nickname, s.time_ms AS timeMs, s.moves, s.optimal, s.created_at AS createdAt,
                (SELECT COUNT(*) FROM attempts a WHERE a.device_id = s.device_id AND a.size = s.size) AS attempts
         FROM scores s LEFT JOIN players p ON p.device_id = s.device_id
         WHERE s.size = ? ORDER BY s.time_ms, s.created_at LIMIT ?`,
      )
      .bind(size, ADMIN_LIST_LIMIT)
      .all();
    return { size, entries: results };
  }

  async function adminAttempts(url: URL) {
    const deviceId = url.searchParams.get('deviceId');
    const size = url.searchParams.get('size');
    const before = Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER);
    const where = ['a.id < ?'];
    const binds: unknown[] = [Number.isSafeInteger(before) ? before : Number.MAX_SAFE_INTEGER];
    if (deviceId) {
      if (!isDevice(deviceId)) throw new HttpError(400, 'bad_request');
      where.push('a.device_id = ?');
      binds.push(deviceId);
    }
    if (size) {
      if (!isSize(Number(size))) throw new HttpError(400, 'bad_request');
      where.push('a.size = ?');
      binds.push(Number(size));
    }
    const { results } = await db
      .prepare(
        `SELECT a.id, a.device_id AS deviceId, p.nickname, a.size, a.time_ms AS timeMs, length(a.moves) AS moves,
                a.optimal, a.accepted, a.reason, a.created_at AS createdAt
         FROM attempts a LEFT JOIN players p ON p.device_id = a.device_id
         WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ?`,
      )
      .bind(...binds, ADMIN_LIST_LIMIT)
      .all();
    return { attempts: results };
  }

  async function adminAttempt(id: number) {
    const r = await db
      .prepare(
        `SELECT a.id, a.device_id AS deviceId, p.nickname, a.size, a.scramble, a.optimal, a.moves, a.times,
                a.time_ms AS timeMs, a.accepted, a.reason, a.created_at AS createdAt
         FROM attempts a LEFT JOIN players p ON p.device_id = a.device_id WHERE a.id = ?`,
      )
      .bind(id)
      .first<Record<string, unknown> & { times: string | null }>();
    if (!r) throw new HttpError(404, 'not_found');
    return { ...r, times: parseTimes(r.times) };
  }

  async function adminBest(url: URL) {
    const deviceId = url.searchParams.get('deviceId');
    const size = Number(url.searchParams.get('size'));
    if (!isDevice(deviceId) || !isSize(size)) throw new HttpError(400, 'bad_request');
    const r = await db
      .prepare(
        `SELECT s.device_id AS deviceId, p.nickname, s.size, COALESCE(s.scramble, i.scramble) AS scramble,
                COALESCE(s.optimal, i.optimal) AS optimal, s.solution AS moves, s.times, s.time_ms AS timeMs,
                s.created_at AS createdAt
         FROM scores s LEFT JOIN players p ON p.device_id = s.device_id LEFT JOIN issued i ON i.id = s.scramble_id
         WHERE s.device_id = ? AND s.size = ?`,
      )
      .bind(deviceId, size)
      .first<Record<string, unknown> & { times: string | null }>();
    if (!r) throw new HttpError(404, 'not_found');
    return { ...r, times: parseTimes(r.times) };
  }

  /** ベスト記録を消して、ランキングから外す(BAN)。挑戦の記録(attempts)は残す */
  async function adminDeleteScore(url: URL) {
    const deviceId = url.searchParams.get('deviceId');
    const size = Number(url.searchParams.get('size'));
    if (!isDevice(deviceId) || !isSize(size)) throw new HttpError(400, 'bad_request');
    const r = await db
      .prepare('DELETE FROM scores WHERE device_id = ? AND size = ?')
      .bind(deviceId, size)
      .run();
    await deps.cache?.delete(rankingKey(size));
    return { deleted: r.meta.changes ?? 0 };
  }

  async function admin(req: Request, url: URL): Promise<unknown> {
    requireAdmin(req);
    const path = url.pathname.slice('/api/v1/admin'.length);
    if (path === '/ranking' && req.method === 'GET') return adminRanking(url);
    if (path === '/attempts' && req.method === 'GET') return adminAttempts(url);
    const m = /^\/attempts\/(\d+)$/.exec(path);
    if (m && req.method === 'GET') return adminAttempt(Number(m[1]));
    if (path === '/best' && req.method === 'GET') return adminBest(url);
    if (path === '/scores' && req.method === 'DELETE') return adminDeleteScore(url);
    throw new HttpError(404, 'not_found');
  }

  async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    try {
      if (url.pathname === '/api/v1/scramble' && req.method === 'POST')
        return json(req, 200, await issue(await readJson(req)));
      if (url.pathname === '/api/v1/submit' && req.method === 'POST')
        return json(req, 200, await submit(await readJson(req)));
      if (url.pathname === '/api/v1/ranking' && req.method === 'GET')
        return json(req, 200, await ranking(url));
      if (url.pathname === '/api/v1/profile' && req.method === 'PUT')
        return json(req, 200, await profile(await readJson(req)));
      if (url.pathname.startsWith('/api/v1/admin/')) return json(req, 200, await admin(req, url));
      if (url.pathname === '/' || url.pathname === '/api/v1/health') return json(req, 200, { ok: true });
      return json(req, 404, { error: 'not_found' });
    } catch (e) {
      if (e instanceof HttpError) return json(req, e.status, { error: e.code });
      // D1 の無料枠を超えたときなどはここに来る。クライアントは練習として遊び続けられる
      console.error(e);
      return json(req, 503, { error: 'unavailable' });
    }
  }

  /** Cron(1日1回): 古い発行記録・拒否記録・挑戦を消す */
  async function cleanup(): Promise<void> {
    const now = deps.now();
    const cutoff = now - RETENTION_MS;
    await db.batch([
      db.prepare('DELETE FROM issued WHERE issued_at < ?').bind(cutoff),
      db.prepare('DELETE FROM rejects WHERE at < ?').bind(cutoff),
      db.prepare('DELETE FROM attempts WHERE created_at < ?').bind(now - ATTEMPT_RETENTION_MS),
    ]);
  }

  return { fetch, cleanup };
}
