// チュートリアルの練習問題と「1個だけ揃っていないとき」の定石が、最短手数の手順であることを確かめる。
//   node tools/check-tutorial.ts

import { index3, solve3 } from '../src/core/table3.ts';
import { ONE_OFF_FORMULAS, TUTORIAL, formulaBoard, tutorialBoard } from '../src/core/tutorial.ts';
import { loadOrBuildDist3 } from './lib/dist3.ts';

const dist = loadOrBuildDist3();
let ok = true;
TUTORIAL.forEach((p, i) => {
  const b = tutorialBoard(p);
  const d = dist[index3(b)];
  console.log(
    `練習${i + 1}: optimal ${d} (declared ${p.optimal}, answer ${p.solution}) e.g. ${solve3(dist, b).join('')}`,
  );
  if (d !== p.optimal || p.solution.length !== d) ok = false;
});
for (const f of ONE_OFF_FORMULAS) {
  const d = dist[index3(formulaBoard(f))];
  console.log(`定石 cell=${f.cell} dir=${f.dir}: optimal ${d}, formula ${f.moves.length} moves`);
  if (f.moves.length !== d) ok = false;
}
if (!ok) process.exitCode = 1;
