import { beforeEach, describe, expect, it } from 'vitest';
import { decodeBoard, encodeBoard } from '../../src/core/board.ts';
import { DEV_A, DEV_B, ORIGIN, setup, timesFor } from './fixtures.ts';

describe('ranking API', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  async function solveOnce(device = DEV_A, step = 300) {
    const issued = await s.call('POST', '/api/v1/scramble', { deviceId: device, size: 3 });
    expect(issued.status).toBe(200);
    const times = timesFor(s.puzzle.solution.length, step);
    s.advance(times[times.length - 1] + 2000);
    return s.call('POST', '/api/v1/submit', {
      deviceId: device,
      scrambleId: issued.body.scrambleId,
      moves: s.puzzle.solution,
      times,
      timeMs: times[times.length - 1],
    });
  }

  it('issues scrambles from the pool (3x3) and randomly (4x4)', async () => {
    const r3 = await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3 });
    expect(r3.body.scramble).toBe(encodeBoard(s.puzzle.board));
    expect(r3.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    s.advance(5000);
    const r4 = await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 4 });
    expect(decodeBoard(r4.body.scramble as string)?.size).toBe(4);
  });

  it('rate-limits scramble issuing per device', async () => {
    expect((await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3 })).status).toBe(200);
    expect((await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3 })).status).toBe(429);
    expect((await s.call('POST', '/api/v1/scramble', { deviceId: DEV_B, size: 3 })).status).toBe(200);
  });

  it('requires a nickname before accepting a solve, without burning the scramble', async () => {
    const r = await solveOnce();
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('nickname_required');
    const used = s.db.raw.prepare('SELECT used FROM issued').get() as { used: number };
    expect(used.used).toBe(0);
  });

  it('registers the nickname sent with a solve when the device is not registered yet', async () => {
    const issued = await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3 });
    const times = timesFor(s.puzzle.solution.length);
    s.advance(times[times.length - 1] + 2000);
    const r = await s.call('POST', '/api/v1/submit', {
      deviceId: DEV_A,
      scrambleId: issued.body.scrambleId,
      moves: s.puzzle.solution,
      times,
      timeMs: times[times.length - 1],
      nickname: 'はなこ',
    });
    expect(r.body).toMatchObject({ accepted: true, rank: 1 });
    const ranking = await s.call('GET', '/api/v1/ranking?size=3');
    expect((ranking.body.entries as { nickname: string }[])[0].nickname).toBe('はなこ');
  });

  it('accepts a valid solve and ranks it', async () => {
    await s.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: 'たろう' });
    const r = await solveOnce();
    expect(r.body).toEqual({
      accepted: true,
      best: true,
      bestTimeMs: (s.puzzle.solution.length - 1) * 300,
      rank: 1,
      total: 1,
    });
    const ranking = await s.call('GET', `/api/v1/ranking?size=3&deviceId=${DEV_A}`);
    expect(ranking.body.total).toBe(1);
    expect(ranking.body.entries).toEqual([
      {
        rank: 1,
        nickname: 'たろう',
        timeMs: (s.puzzle.solution.length - 1) * 300,
        moves: s.puzzle.solution.length,
        me: true,
      },
    ]);
    expect(ranking.body.me).toEqual({ rank: 1, timeMs: (s.puzzle.solution.length - 1) * 300 });
  });

  it('keeps only the best time per player and ranks players by time', async () => {
    await s.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: 'A' });
    await s.call('PUT', '/api/v1/profile', { deviceId: DEV_B, nickname: 'B' });
    expect((await solveOnce(DEV_A, 300)).body).toMatchObject({ accepted: true, best: true, rank: 1 });
    expect((await solveOnce(DEV_B, 200)).body).toMatchObject({
      accepted: true,
      best: true,
      rank: 1,
      total: 2,
    });
    // A がより遅いタイムを出してもベストは変わらない
    const slower = await solveOnce(DEV_A, 400);
    expect(slower.body).toMatchObject({ accepted: true, best: false, rank: 2, total: 2 });
    const ranking = await s.call('GET', '/api/v1/ranking?size=3');
    expect((ranking.body.entries as { nickname: string }[]).map((e) => e.nickname)).toEqual(['B', 'A']);
  });

  it('rejects tampered moves, double submits, other devices, expired scrambles and wall-clock violations', async () => {
    await s.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: 'A' });
    await s.call('PUT', '/api/v1/profile', { deviceId: DEV_B, nickname: 'B' });
    const n = s.puzzle.solution.length;
    const times = timesFor(n);
    const body = (id: unknown, extra: Record<string, unknown> = {}) => ({
      deviceId: DEV_A,
      scrambleId: id,
      moves: s.puzzle.solution,
      times,
      timeMs: times[n - 1],
      ...extra,
    });

    // 手の改ざん
    let id = (await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3 })).body.scrambleId;
    s.advance(60_000);
    let r = await s.call(
      'POST',
      '/api/v1/submit',
      body(id, { moves: s.puzzle.solution.slice(0, -1) + 'U', times }),
    );
    expect(r.body.accepted).toBe(false);
    // 同じ問題での再提出
    r = await s.call('POST', '/api/v1/submit', body(id));
    expect(r.body).toEqual({ accepted: false, reason: 'used' });

    // ほかの端末に出した問題
    id = (await s.call('POST', '/api/v1/scramble', { deviceId: DEV_B, size: 3 })).body.scrambleId;
    s.advance(60_000);
    r = await s.call('POST', '/api/v1/submit', body(id));
    expect(r.body).toEqual({ accepted: false, reason: 'not_found' });

    // 期限切れ(30分)
    id = (await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3 })).body.scrambleId;
    s.advance(31 * 60_000);
    r = await s.call('POST', '/api/v1/submit', body(id));
    expect(r.body).toEqual({ accepted: false, reason: 'expired' });

    // 発行から受け取りまでの実際の経過時間より長いタイム
    id = (await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3 })).body.scrambleId;
    s.advance(1000);
    r = await s.call('POST', '/api/v1/submit', body(id));
    expect(r.body).toEqual({ accepted: false, reason: 'too_fast_wall' });

    // 人間離れした速さ(発行の間隔制限にかからないよう、時計を進めてから発行する)
    s.advance(5000);
    id = (await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3 })).body.scrambleId;
    s.advance(60_000);
    const fast = timesFor(n, 10);
    r = await s.call('POST', '/api/v1/submit', body(id, { times: fast, timeMs: fast[n - 1] }));
    expect(r.body).toEqual({ accepted: false, reason: 'too_fast' });

    const rejects = s.db.raw.prepare('SELECT reason FROM rejects').all() as { reason: string }[];
    expect(rejects.map((x) => x.reason)).toEqual([
      'illegal_move',
      'used',
      'not_found',
      'expired',
      'too_fast_wall',
      'too_fast',
    ]);
    expect((await s.call('GET', '/api/v1/ranking?size=3')).body.total).toBe(0);
  });

  it('validates nicknames', async () => {
    expect((await s.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: '' })).body.error).toBe(
      'invalid_nickname',
    );
    expect(
      (await s.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: 'x'.repeat(13) })).body.error,
    ).toBe('invalid_nickname');
    expect(
      (await s.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: 'ＦＵＣＫ' })).body.error,
    ).toBe('invalid_nickname');
    expect((await s.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: 'a​b' })).body.error).toBe(
      'invalid_nickname',
    );
    expect(
      (await s.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: '  ｻｲｺﾛ  好き ' })).body,
    ).toEqual({ nickname: 'サイコロ 好き' });
  });

  it('rejects bad requests and unknown paths, and answers CORS preflight', async () => {
    expect((await s.call('POST', '/api/v1/scramble', { deviceId: 'nope', size: 3 })).status).toBe(400);
    expect((await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 5 })).status).toBe(400);
    expect((await s.call('GET', '/api/v1/nothing')).status).toBe(404);
    const pre = await s.app.fetch(
      new Request('https://api.test/api/v1/submit', { method: 'OPTIONS', headers: { origin: ORIGIN } }),
    );
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    const other = await s.app.fetch(
      new Request('https://api.test/api/v1/ranking?size=3', { headers: { origin: 'https://evil.example' } }),
    );
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns 503 when the database fails (free tier exhausted)', async () => {
    s.db.raw.close();
    const r = await s.call('GET', '/api/v1/ranking?size=3');
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('unavailable');
  });

  it('cleans up old rows', async () => {
    await s.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3 });
    s.advance(8 * 24 * 60 * 60_000);
    await s.app.cleanup();
    expect((s.db.raw.prepare('SELECT COUNT(*) AS n FROM issued').get() as { n: number }).n).toBe(0);
  });
});
