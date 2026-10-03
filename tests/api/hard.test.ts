import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { alignedExample } from '../../src/core/aligned.ts';
import { applyMove, decodeBoard, dieKind, encodeBoard, isAligned, isSolved } from '../../src/core/board.ts';
import { ADMIN_TOKEN, DEV_A, DEV_B, setup, timesFor } from './fixtures.ts';

const AUTH = { authorization: `Bearer ${ADMIN_TOKEN}` };

describe('ranking API: hard rule (aligned)', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(async () => {
    s = setup(1, { hardMode: true, adminToken: ADMIN_TOKEN });
    await s.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: 'A' });
    await s.call('PUT', '/api/v1/profile', { deviceId: DEV_B, nickname: 'B' });
  });

  /** 問題を受け取って、解答を送る(rule を省くと、ふつう) */
  async function solve(device: string, rule?: 'ones' | 'aligned', step = 300) {
    s.advance(5000);
    const issued = await s.call('POST', '/api/v1/scramble', { deviceId: device, size: 3, rule });
    expect(issued.status).toBe(200);
    const solution = rule === 'aligned' ? s.alignedPuzzle.solution : s.puzzle.solution;
    const times = timesFor(solution.length, step);
    s.advance(times[times.length - 1] + 2000);
    const r = await s.call('POST', '/api/v1/submit', {
      deviceId: device,
      scrambleId: issued.body.scrambleId,
      moves: solution,
      times,
      timeMs: times[times.length - 1],
    });
    return { issued, r };
  }

  const names = async (query: string) => {
    const r = await s.call('GET', `/api/v1/ranking?${query}`);
    return (r.body.entries as { nickname: string }[]).map((e) => e.nickname);
  };

  it('is refused unless the server has it switched on', async () => {
    const off = setup(1);
    const r = await off.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3, rule: 'aligned' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('bad_request');
    expect((await off.call('GET', '/api/v1/ranking?size=3&rule=aligned')).status).toBe(400);
    // ふつうは、rule を省いても、ones と書いても同じ
    expect((await off.call('GET', '/api/v1/ranking?size=3')).status).toBe(200);
    expect((await off.call('GET', '/api/v1/ranking?size=3&rule=ones')).body).toMatchObject({ rule: 'ones' });
    expect(
      (await off.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3, rule: 'nope' })).status,
    ).toBe(400);
  });

  it('issues a hard scramble and ranks the solve apart from the normal ranking', async () => {
    const { issued, r } = await solve(DEV_A, 'aligned');
    expect(issued.body).toMatchObject({
      size: 3,
      rule: 'aligned',
      scramble: encodeBoard(s.alignedPuzzle.board),
    });
    expect(r.body).toMatchObject({ accepted: true, best: true, rank: 1, total: 1 });
    expect(await names('size=3&rule=aligned')).toEqual(['A']);
    expect(await names('size=3')).toEqual([]);
    expect(await names('size=4&rule=aligned')).toEqual([]);
    const mine = await s.call('GET', `/api/v1/ranking?size=3&rule=aligned&deviceId=${DEV_A}`);
    expect(mine.body).toMatchObject({ rule: 'aligned', total: 1, me: { rank: 1 } });
    expect((await s.call('GET', `/api/v1/ranking?size=3&deviceId=${DEV_A}`)).body.me).toBeNull();
  });

  it('keeps one best per device for each rule', async () => {
    await solve(DEV_A, 'aligned', 400);
    await solve(DEV_A, 'ones', 300);
    await solve(DEV_B, 'aligned', 200);
    expect(await names('size=3&rule=aligned')).toEqual(['B', 'A']);
    expect(await names('size=3')).toEqual(['A']);
    const rows = s.db.raw.prepare('SELECT device_id, rule, time_ms FROM scores ORDER BY rule, time_ms').all();
    expect(rows).toHaveLength(3);
    // ハードで縮めても、ふつうの記録は変わらない
    const before = s.db.raw
      .prepare("SELECT time_ms FROM scores WHERE device_id = ? AND rule = 'ones'")
      .get(DEV_A);
    const better = await solve(DEV_A, 'aligned', 100);
    expect(better.r.body).toMatchObject({ accepted: true, best: true, rank: 1, total: 2 });
    expect(
      s.db.raw.prepare("SELECT time_ms FROM scores WHERE device_id = ? AND rule = 'ones'").get(DEV_A),
    ).toEqual(before);
    expect(await names('size=3&rule=aligned')).toEqual(['A', 'B']);
  });

  it('verifies against the rule the scramble was issued for, whatever the submission says', async () => {
    // 1は全部上だが、2個が横倒しの盤から、1個を右へ動かした盤。←で「全部1」にはなるが、正立ではない
    const board = alignedExample(3, 'near');
    applyMove(board, 'R');
    const h = setup(1, { hardMode: true, alignedBoard: board });
    await h.call('PUT', '/api/v1/profile', { deviceId: DEV_A, nickname: 'A' });
    const issued = await h.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size: 3, rule: 'aligned' });
    h.advance(3000);
    const r = await h.call('POST', '/api/v1/submit', {
      deviceId: DEV_A,
      scrambleId: issued.body.scrambleId,
      moves: 'L',
      times: [0],
      timeMs: 0,
      rule: 'ones',
    });
    expect(r.body).toEqual({ accepted: false, reason: 'not_solved' });
    expect(h.db.raw.prepare('SELECT rule, accepted, reason FROM attempts').get()).toEqual({
      rule: 'aligned',
      accepted: 0,
      reason: 'not_solved',
    });
  });

  it('issues random hard scrambles that can be aligned (when nothing is injected)', async () => {
    const h = setup(7, { hardMode: true, alignedBoard: null });
    for (const size of [3, 4] as const) {
      h.advance(5000);
      const r = await h.call('POST', '/api/v1/scramble', { deviceId: DEV_A, size, rule: 'aligned' });
      const b = decodeBoard(r.body.scramble as string)!;
      expect(b.size).toBe(size);
      expect(isAligned(b)).toBe(false);
      const kinds = [0, 0];
      for (let c = 0; c < size * size; c++) if (c !== b.blank) kinds[dieKind(size, c, b.cells[c])]++;
      expect(kinds.sort()).toEqual(size === 3 ? [4, 4] : [7, 8]);
    }
    const row = h.db.raw
      .prepare("SELECT COUNT(*) AS n FROM issued WHERE rule = 'aligned' AND optimal IS NULL")
      .get();
    expect(row).toEqual({ n: 2 });
  });

  it('lets the admin see, replay and delete hard records apart from normal ones', async () => {
    await solve(DEV_A, 'aligned');
    await solve(DEV_A, 'ones');
    const hard = await s.call('GET', '/api/v1/admin/ranking?size=3&rule=aligned', undefined, AUTH);
    expect(hard.body).toMatchObject({ rule: 'aligned', entries: [{ deviceId: DEV_A, attempts: 1 }] });
    const normal = await s.call('GET', '/api/v1/admin/ranking?size=3', undefined, AUTH);
    expect(normal.body).toMatchObject({ rule: 'ones', entries: [{ deviceId: DEV_A, attempts: 1 }] });

    // 挑戦の一覧は、ルールで絞り込める。リプレイは、そのルールで実際に揃う
    const all = await s.call('GET', '/api/v1/admin/attempts', undefined, AUTH);
    expect((all.body.attempts as { rule: string }[]).map((a) => a.rule).sort()).toEqual(['aligned', 'ones']);
    const list = await s.call('GET', '/api/v1/admin/attempts?rule=aligned', undefined, AUTH);
    const attempts = list.body.attempts as { id: number; rule: string }[];
    expect(attempts).toHaveLength(1);
    const one = await s.call('GET', `/api/v1/admin/attempts/${attempts[0].id}`, undefined, AUTH);
    expect(one.body.rule).toBe('aligned');
    const best = await s.call(
      'GET',
      `/api/v1/admin/best?deviceId=${DEV_A}&size=3&rule=aligned`,
      undefined,
      AUTH,
    );
    expect(best.body).toMatchObject({ rule: 'aligned', scramble: one.body.scramble, moves: one.body.moves });
    const b = decodeBoard(best.body.scramble as string)!;
    for (const m of best.body.moves as string) applyMove(b, m as 'U');
    expect(isAligned(b)).toBe(true);
    const normalBest = await s.call('GET', `/api/v1/admin/best?deviceId=${DEV_A}&size=3`, undefined, AUTH);
    const nb = decodeBoard(normalBest.body.scramble as string)!;
    for (const m of normalBest.body.moves as string) applyMove(nb, m as 'U');
    expect(normalBest.body.rule).toBe('ones');
    expect(isSolved(nb)).toBe(true);

    // ハードの記録だけを消す
    const del = await s.call(
      'DELETE',
      `/api/v1/admin/scores?deviceId=${DEV_A}&size=3&rule=aligned`,
      undefined,
      AUTH,
    );
    expect(del.body).toEqual({ deleted: 1 });
    expect(await names('size=3&rule=aligned')).toEqual([]);
    expect(await names('size=3')).toEqual(['A']);
  });
});

describe('migration 0003 (rule)', () => {
  it('keeps the records that existed before, as normal-rule records', () => {
    const dir = new URL('../../api/migrations/', import.meta.url);
    const files = readdirSync(dir)
      .filter((n) => n.endsWith('.sql'))
      .sort();
    expect(files.slice(0, 3)).toEqual(['0001_init.sql', '0002_attempts.sql', '0003_rule.sql']);
    const db = new DatabaseSync(':memory:');
    for (const f of files.slice(0, 2)) db.exec(readFileSync(new URL(f, dir), 'utf8'));
    // 0003 より前の形で、記録・発行済みの問題・挑戦を入れておく
    db.exec(`
      INSERT INTO scores (device_id, size, time_ms, moves, scramble_id, solution, times, created_at, scramble, optimal)
        VALUES ('${DEV_A}', 3, 5120, 28, 'sc1', 'UDLR', '[0,1,2,3]', 111, 'abcd-efgh', 28),
               ('${DEV_A}', 4, 61000, 90, 'sc2', 'UD', '[0,1]', 222, NULL, NULL),
               ('${DEV_B}', 3, 7000, 30, 'sc3', 'LR', '[0,1]', 333, 'abcd-efgh', 30);
      INSERT INTO issued (id, device_id, size, scramble, optimal, issued_at) VALUES ('sc9', '${DEV_A}', 3, 'x', 26, 1);
      INSERT INTO attempts (device_id, size, scramble_id, scramble, optimal, moves, times, time_ms, accepted, reason, created_at)
        VALUES ('${DEV_A}', 3, 'sc1', 'abcd-efgh', 28, 'UDLR', '[0,1,2,3]', 5120, 1, NULL, 111);
    `);
    db.exec(readFileSync(new URL(files[2], dir), 'utf8'));
    expect(
      db
        .prepare(
          'SELECT device_id, size, rule, time_ms, moves, scramble, optimal FROM scores ORDER BY time_ms',
        )
        .all(),
    ).toEqual([
      {
        device_id: DEV_A,
        size: 3,
        rule: 'ones',
        time_ms: 5120,
        moves: 28,
        scramble: 'abcd-efgh',
        optimal: 28,
      },
      {
        device_id: DEV_B,
        size: 3,
        rule: 'ones',
        time_ms: 7000,
        moves: 30,
        scramble: 'abcd-efgh',
        optimal: 30,
      },
      { device_id: DEV_A, size: 4, rule: 'ones', time_ms: 61000, moves: 90, scramble: null, optimal: null },
    ]);
    expect(db.prepare('SELECT rule FROM issued').get()).toEqual({ rule: 'ones' });
    expect(db.prepare('SELECT rule FROM attempts').get()).toEqual({ rule: 'ones' });
    // 同じ人が、同じ大きさでハードの記録も持てる。同じルールでは1件だけ
    db.exec(`INSERT INTO scores (device_id, size, rule, time_ms, moves, scramble_id, solution, times, created_at)
             VALUES ('${DEV_A}', 3, 'aligned', 90000, 80, 'sc4', 'UD', '[0,1]', 444)`);
    expect(() =>
      db.exec(`INSERT INTO scores (device_id, size, rule, time_ms, moves, scramble_id, solution, times, created_at)
               VALUES ('${DEV_A}', 3, 'ones', 1, 1, 'sc5', 'U', '[0]', 555)`),
    ).toThrow();
  });
});
