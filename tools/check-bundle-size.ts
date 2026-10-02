// 非機能要件「初回の読み込み(転送量)は 1MB 以下」を確かめる。
// Service Worker が初回にオフライン用としてまとめて取得する分も含め、dist の全ファイル(SNS 向けの og.png を除く)を
// gzip した合計で見る(実際の初回表示はこれより小さい)。
//   node tools/check-bundle-size.ts

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const LIMIT = 1024 * 1024;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const rows = walk(DIST)
  .filter((p) => !p.endsWith('og.png'))
  .map((p) => {
    const raw = readFileSync(p);
    // 画像やバイナリは配信時に圧縮されないことが多いので、小さい方を数える
    return { file: relative(DIST, p), raw: raw.length, gz: Math.min(raw.length, gzipSync(raw).length) };
  })
  .sort((a, b) => b.gz - a.gz);

const total = rows.reduce((s, r) => s + r.gz, 0);
for (const r of rows.slice(0, 12)) console.log(`${(r.gz / 1024).toFixed(1).padStart(8)} KB  ${r.file}`);
console.log(`total ${(total / 1024).toFixed(1)} KB (limit ${LIMIT / 1024} KB)`);
if (total > LIMIT) {
  console.error('bundle is too large');
  process.exitCode = 1;
}
