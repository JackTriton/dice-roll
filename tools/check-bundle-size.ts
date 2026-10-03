// 非機能要件「初回の読み込み(転送量)は 1MB 以下」を確かめる。
// Service Worker が初回にオフライン用としてまとめて取得する分も含め、dist の全ファイル(SNS 向けの og.png を除く)を
// gzip した合計で見る(実際の初回表示はこれより小さい)。
//   node tools/check-bundle-size.ts

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

// 新しい版に切り替わる仕組みが、ビルドに入っていることを確かめる。
// Service Worker が「待機」する設定だと、このサイトのタブをすべて閉じるまで古い版が出続ける(2026-10-03 の障害)。
const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
const checks: [string, boolean][] = [
  ['the service worker activates at once (skipWaiting)', /self\.skipWaiting\(\),/.test(sw)],
  ['the service worker takes over open pages (clientsClaim)', sw.includes('clientsClaim()')],
  ['pages are fetched from the network first', sw.includes('NetworkFirst') && sw.includes('"navigate"')],
  ['version.json is written', existsSync(join(DIST, 'version.json'))],
  ['version.json is not kept in the offline cache', !sw.includes('version.json')],
];
for (const [what, ok] of checks)
  if (!ok) {
    console.error(`update check failed: ${what}`);
    process.exitCode = 1;
  }
