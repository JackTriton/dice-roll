// 3×3 の問題プールを作る。一様にランダムな盤面から、最短手数が POOL3 の範囲に入るものだけを集める。
//   node tools/build-pools.ts               クライアント用(public/pool3.bin)と Worker 用(api/data/pool3-server.bin)
//   node tools/build-pools.ts --server-only Worker 用だけ(デプロイの直前に使う)

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSolved } from '../src/core/board.ts';
import { POOL3 } from '../src/core/constants.ts';
import { encodePoolEntry } from '../src/core/pool.ts';
import { cryptoRng } from '../src/core/random.ts';
import { randomBoard } from '../src/core/scramble.ts';
import { index3 } from '../src/core/table3.ts';
import { loadOrBuildDist3 } from './lib/dist3.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = { file: join(ROOT, 'public', 'pool3.bin'), count: 5_000 };
const SERVER = { file: join(ROOT, 'api', 'data', 'pool3-server.bin'), count: 200_000 };

const serverOnly = process.argv.includes('--server-only');
const dist3 = loadOrBuildDist3();
const rng = cryptoRng();

function build(count: number): Uint8Array {
  const out = new Uint8Array(count * POOL3.entryBytes);
  const seen = new Set<string>();
  let n = 0;
  while (n < count) {
    const b = randomBoard(3, rng);
    const d = dist3[index3(b)];
    if (isSolved(b) || d < POOL3.minOptimal || d > POOL3.maxOptimal) continue;
    const key = b.cells.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    encodePoolEntry(b, d, out, n * POOL3.entryBytes);
    n++;
  }
  return out;
}

function write(target: { file: string; count: number }) {
  if (existsSync(target.file) && process.argv.includes('--keep')) return;
  mkdirSync(dirname(target.file), { recursive: true });
  writeFileSync(target.file, build(target.count));
  console.log(`${target.count} entries -> ${target.file}`);
}

if (!serverOnly) write(CLIENT);
write(SERVER);
