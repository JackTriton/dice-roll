// API テストの共通の準備: 決め打ちの問題を出す API と、テスト用の DB・時計

import { createApp } from '../../api/src/app.ts';
import { applyMove, cloneBoard, isSolved, solvedBoard } from '../../src/core/board.ts';
import { MOVES, OPPOSITE, type Move } from '../../src/core/dice.ts';
import { encodePoolEntry } from '../../src/core/pool.ts';
import { randInt, seededRng } from '../../src/core/random.ts';
import { createTestDb } from './sqliteDb.ts';

export const ORIGIN = 'https://example.github.io';
export const DEV_A = '11111111-1111-4111-8111-111111111111';
export const DEV_B = '22222222-2222-4222-8222-222222222222';
export const ADMIN_TOKEN = 'test-admin-token';

/** 揃った盤から崩した問題と、その解答(逆順)を1つ作る */
export function makePuzzle(seed: number) {
  const rng = seededRng(seed);
  for (;;) {
    const b = solvedBoard(3, randInt(rng, 9));
    const walk: Move[] = [];
    let ok = true;
    while (walk.length < 30) {
      const m = MOVES[randInt(rng, 4)];
      if (walk.length && m === OPPOSITE[walk[walk.length - 1]]) continue;
      if (!applyMove(b, m)) continue;
      walk.push(m);
      if (isSolved(b)) ok = false;
    }
    if (ok)
      return {
        board: cloneBoard(b),
        solution: walk
          .reverse()
          .map((m) => OPPOSITE[m])
          .join(''),
      };
  }
}

/** プールを1問だけにして、発行される問題を決め打ちにする */
export function setup(seed = 1, opts: { adminToken?: string } = {}) {
  const puzzle = makePuzzle(seed);
  const pool = new Uint8Array(7);
  encodePoolEntry(puzzle.board, 26, pool, 0);
  let clock = 1_000_000;
  const db = createTestDb();
  const app = createApp({
    db,
    pool3: pool,
    now: () => clock,
    rng: seededRng(seed),
    allowedOrigins: [ORIGIN],
    adminToken: opts.adminToken,
  });
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.fetch(
      new Request(`https://api.test${path}`, {
        method,
        headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
  };
  return {
    puzzle,
    db,
    app,
    call,
    advance: (ms: number) => (clock += ms),
  };
}

export const timesFor = (n: number, step = 300) => Array.from({ length: n }, (_, i) => i * step);
