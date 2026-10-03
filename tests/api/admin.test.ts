import { beforeEach, describe, expect, it } from 'vitest';
import { applyMove, decodeBoard, isSolved } from '../../src/core/board.ts';
import type { Move } from '../../src/core/dice.ts';
import { ADMIN_TOKEN, DEV_A, DEV_B, ORIGIN, setup, timesFor } from './fixtures.ts';

const AUTH = { authorization: `Bearer ${ADMIN_TOKEN}` };

describe('admin API', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(async () => {
    s = setup(1, { adminToken: ADMIN_TOKEN });
    await s.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: 'A' });
    await s.call('PUT', '/api/v1/profile', { deviceId: DEV_B, nickname: 'B' });
  });

  async function solve(device: string, step = 300, tamper = false) {
    s.advance(5000);
    const issued = await s.call('POST', '/api/v1/scramble', { deviceId: device, size: 3 });
    const times = timesFor(s.puzzle.solution.length, step);
    s.advance(times[times.length - 1] + 2000);
    const moves = tamper ? s.puzzle.solution.slice(0, -1) : s.puzzle.solution;
    return s.call('POST', '/api/v1/submit', {
      deviceId: device,
      scrambleId: issued.body.scrambleId,
      moves,
      times: tamper ? times.slice(0, -1) : times,
      timeMs: tamper ? times[times.length - 2] : times[times.length - 1],
    });
  }

  it('requires the admin token', async () => {
    expect((await s.call('GET', '/api/v1/admin/attempts')).status).toBe(401);
    expect(
      (await s.call('GET', '/api/v1/admin/attempts', undefined, { authorization: 'Bearer nope' })).status,
    ).toBe(401);
    expect((await s.call('GET', '/api/v1/admin/attempts', undefined, AUTH)).status).toBe(200);
  });

  it('is disabled when no admin token is configured', async () => {
    const plain = setup(1);
    expect((await plain.call('GET', '/api/v1/admin/attempts', undefined, AUTH)).body).toEqual({
      error: 'admin_disabled',
    });
  });

  it('allows the authorization header and DELETE in CORS preflight', async () => {
    const pre = await s.app.fetch(
      new Request('https://api.test/api/v1/admin/scores', { method: 'OPTIONS', headers: { origin: ORIGIN } }),
    );
    expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(pre.headers.get('access-control-allow-methods')).toContain('DELETE');
  });

  it('records every submitted attempt, accepted or not, and replays it', async () => {
    expect((await solve(DEV_A, 300)).body.accepted).toBe(true);
    expect((await solve(DEV_A, 400)).body.accepted).toBe(true); // ベストではない挑戦も残る
    expect((await solve(DEV_B, 300, true)).body.accepted).toBe(false); // 受け付けなかった挑戦も残る

    const list = (await s.call('GET', '/api/v1/admin/attempts', undefined, AUTH)).body.attempts as {
      id: number;
      deviceId: string;
      nickname: string;
      accepted: number;
      reason: string | null;
      moves: number;
      optimal: number;
    }[];
    expect(list.map((a) => [a.nickname, a.accepted, a.reason])).toEqual([
      ['B', 0, 'not_solved'],
      ['A', 1, null],
      ['A', 1, null],
    ]);
    expect(list[1].optimal).toBe(26);

    // 1件を開くと、盤面・手順・時刻がそろっていて、再生すると全部1になる
    const one = (await s.call('GET', `/api/v1/admin/attempts/${list[1].id}`, undefined, AUTH)).body as {
      scramble: string;
      moves: string;
      times: number[];
      timeMs: number;
    };
    const b = decodeBoard(one.scramble)!;
    for (const m of one.moves) applyMove(b, m as Move);
    expect(isSolved(b)).toBe(true);
    expect(one.times).toHaveLength(one.moves.length);

    // 端末と盤の大きさで絞り込める
    const onlyB = (await s.call('GET', `/api/v1/admin/attempts?deviceId=${DEV_B}&size=3`, undefined, AUTH))
      .body.attempts as unknown[];
    expect(onlyB).toHaveLength(1);
    expect((await s.call('GET', '/api/v1/admin/attempts/999', undefined, AUTH)).status).toBe(404);
  });

  it('lists the ranking with device ids and replays the best record', async () => {
    await solve(DEV_A, 300);
    await solve(DEV_A, 400);
    const ranking = (await s.call('GET', '/api/v1/admin/ranking?size=3', undefined, AUTH)).body.entries as {
      deviceId: string;
      nickname: string;
      attempts: number;
      optimal: number;
    }[];
    expect(ranking).toHaveLength(1);
    expect(ranking[0]).toMatchObject({ deviceId: DEV_A, nickname: 'A', attempts: 2, optimal: 26 });
    const best = (await s.call('GET', `/api/v1/admin/best?deviceId=${DEV_A}&size=3`, undefined, AUTH)).body;
    expect(best).toMatchObject({ moves: s.puzzle.solution, timeMs: (s.puzzle.solution.length - 1) * 300 });

    // 発行記録が消えたあと(7日後)でも、ベスト記録のリプレイは見られる
    s.advance(8 * 24 * 60 * 60_000);
    await s.app.cleanup();
    const later = (await s.call('GET', `/api/v1/admin/best?deviceId=${DEV_A}&size=3`, undefined, AUTH)).body;
    expect(typeof later.scramble).toBe('string');
  });

  it('deletes a best record (ban) and takes it off the ranking, keeping the attempts', async () => {
    await solve(DEV_A, 300);
    await solve(DEV_B, 250);
    expect(((await s.call('GET', '/api/v1/ranking?size=3')).body.entries as unknown[]).length).toBe(2);
    const del = await s.call('DELETE', `/api/v1/admin/scores?deviceId=${DEV_B}&size=3`, undefined, AUTH);
    expect(del.body).toEqual({ deleted: 1 });
    const after = (await s.call('GET', '/api/v1/ranking?size=3')).body.entries as { nickname: string }[];
    expect(after.map((e) => e.nickname)).toEqual(['A']);
    const attemptsB = (await s.call('GET', `/api/v1/admin/attempts?deviceId=${DEV_B}`, undefined, AUTH)).body
      .attempts as unknown[];
    expect(attemptsB).toHaveLength(1);
    // BAN は記録を消すだけなので、その後の送信は受け付ける
    expect((await solve(DEV_B, 300)).body.accepted).toBe(true);
  });

  it('removes attempts older than 90 days', async () => {
    await solve(DEV_A, 300);
    s.advance(91 * 24 * 60 * 60_000);
    await s.app.cleanup();
    expect(
      ((await s.call('GET', '/api/v1/admin/attempts', undefined, AUTH)).body.attempts as unknown[]).length,
    ).toBe(0);
  });
});
