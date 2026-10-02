// 受け入れ基準「ランダムな盤面(3×3・4×4 それぞれ1万件以上)がすべて全部1まで解ける」を確かめる。
// 解答の手順は、ゲームと同じ core/board.ts の applyMove で実際の向き(24通り)に適用して確かめる。
//   node tools/check-solvable.ts [件数=10000] [3|4|both]

import { applyMove, cloneBoard, isSolved } from '../src/core/board.ts';
import { cryptoRng, seededRng } from '../src/core/random.ts';
import { randomBoard } from '../src/core/scramble.ts';
import { solve3 } from '../src/core/table3.ts';
import { loadOrBuildDist3 } from './lib/dist3.ts';
import { solve4 } from './lib/solver4.ts';

const count = Number(process.argv[2] ?? 10_000);
const which = process.argv[3] ?? 'both';
const dist3 = loadOrBuildDist3();
const rng = cryptoRng();
let failures = 0;

for (const size of [3, 4] as const) {
  if (which !== 'both' && Number(which) !== size) continue;
  const t0 = Date.now();
  let solved = 0;
  let sum = 0;
  let max = 0;
  for (let i = 0; i < count; i++) {
    // 一様にランダムな盤面(難しさの選別をしない、いちばん厳しい条件)
    const start = randomBoard(size, rng);
    const b = cloneBoard(start);
    let ok = false;
    try {
      const moves = size === 3 ? solve3(dist3, b) : solve4(b, dist3, seededRng(i));
      ok = moves.every((m) => applyMove(b, m)) && isSolved(b);
      if (ok) {
        sum += moves.length;
        max = Math.max(max, moves.length);
      }
    } catch (e) {
      console.error(`#${i}`, e);
    }
    if (ok) solved++;
    else failures++;
    if ((i + 1) % 1000 === 0) process.stdout.write(`  ${size}x${size}: ${i + 1}/${count}\r`);
  }
  const sec = (Date.now() - t0) / 1000;
  console.log(
    `${size}x${size}: solved ${solved}/${count}, moves mean ${(sum / Math.max(solved, 1)).toFixed(1)} max ${max}` +
      `${size === 3 ? ' (optimal)' : ' (staged, not optimal)'}, ${sec.toFixed(1)}s`,
  );
}
if (failures > 0) {
  console.error(`FAILED: ${failures}`);
  process.exitCode = 1;
}
