// ハード(正立に揃える)の問題が、実際に解けることを確かめる。
//
//   node --max-old-space-size=4096 tools/check-solvable-hard.ts [問題数]
//
// 出題と同じ作り方(randomAlignedBoard)で 3×3・4×4 の問題を作り、ソルバーで解いて、
// 手順をゲームと同じ applyMove で適用して、全部が正立になることを確かめる。

import { applyMove, cloneBoard, isAligned } from '../src/core/board.ts';
import { seededRng } from '../src/core/random.ts';
import { randomAlignedBoard } from '../src/core/scramble.ts';
import { loadAlignedTables, solveAligned } from './lib/solverAligned.ts';

const COUNT = Number(process.argv[2] ?? 10_000);
let failed = 0;
for (const size of [3, 4] as const) {
  const tables = loadAlignedTables(size, (m) => console.log(m));
  const rng = seededRng(20261003 + size);
  const t0 = Date.now();
  let total = 0;
  let max = 0;
  let solved = 0;
  for (let i = 0; i < COUNT; i++) {
    const start = randomAlignedBoard(size, rng);
    try {
      const moves = solveAligned(start, tables);
      const b = cloneBoard(start);
      for (const m of moves) if (!applyMove(b, m)) throw new Error('illegal move in the solution');
      if (!isAligned(b)) throw new Error('the solution does not align the board');
      solved++;
      total += moves.length;
      max = Math.max(max, moves.length);
    } catch (e) {
      failed++;
      if (failed <= 5) console.error(`${size}x${size} #${i}: ${(e as Error).message}`);
    }
  }
  console.log(
    `${size}x${size}: ${solved}/${COUNT} solved, average ${(total / Math.max(1, solved)).toFixed(1)} moves, max ${max}, ${Date.now() - t0} ms`,
  );
}
if (failed) {
  console.error(`${failed} puzzles could not be solved`);
  process.exit(1);
}
