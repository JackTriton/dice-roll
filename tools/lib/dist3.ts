// 3×3 の最短手数の表を作り、tools/.cache/dist3.bin に置いておく(約15MB、コミットしない)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATES3, buildDist3 } from '../../src/core/table3.ts';

export const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache');
const FILE = join(CACHE_DIR, 'dist3.bin');

export function loadOrBuildDist3(log = console.log): Uint8Array {
  if (existsSync(FILE)) {
    const buf = new Uint8Array(readFileSync(FILE));
    if (buf.length === STATES3) return buf;
  }
  log('building the 3x3 distance table (about a minute)...');
  const t0 = Date.now();
  const dist = buildDist3();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(FILE, dist);
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${FILE}`);
  return dist;
}
