// テスト用: node:sqlite で D1 と同じ呼び出し方ができる DB を作る(マイグレーションを適用済み)

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { DB, Statement } from '../../api/src/db.ts';

type Value = null | number | bigint | string | Uint8Array;

export function createTestDb(): DB & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../../api/migrations/0001_init.sql', import.meta.url), 'utf8'));

  const statement = (sql: string, values: Value[] = []): Statement => ({
    bind: (...v: unknown[]) => statement(sql, v as Value[]),
    first: async <T>() => (raw.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T>() => ({ results: raw.prepare(sql).all(...values) as T[] }),
    run: async () => {
      const r = raw.prepare(sql).run(...values);
      return { meta: { changes: Number(r.changes) } };
    },
  });

  return {
    raw,
    prepare: (sql) => statement(sql),
    batch: async (stmts) => {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
