// 3×3 の最短手数の表を作り、分布を表示する。
// 要件定義の研究(全 15,116,544 状態が解ける、平均 28.0 手、最悪 49 手)と一致することを確かめる。
//   node tools/build-dist3.ts

import { loadOrBuildDist3 } from './lib/dist3.ts';

const dist = loadOrBuildDist3();
const hist = new Map<number, number>();
let sum = 0;
let unreachable = 0;
for (const d of dist) {
  if (d === 255) {
    unreachable++;
    continue;
  }
  hist.set(d, (hist.get(d) ?? 0) + 1);
  sum += d;
}
const reached = dist.length - unreachable;
console.log(`states ${dist.length}, reachable ${reached}, unreachable ${unreachable}`);
console.log(`mean ${(sum / reached).toFixed(2)}, max ${Math.max(...hist.keys())}`);
if (unreachable > 0) process.exitCode = 1;
