// 「空きマスを動かす」操作: 指の位置から、空きマスの行き先を決める。
//
// 空きマスを指で押さえて動かす。指がマスの境目を越えて隣のマスへ入ると、空きマスがそのマスへ移る
// (そこにあったサイコロが、空きマスへ転がる)。15パズルで、空きマスを持ってするすると動かす操作と同じ。
//
// 指の位置は、マスを単位にした座標で受け取る(盤の左上が 0,0。x が列、y が行。マス c, r の中は c <= x < c+1)。

export interface Point {
  x: number;
  y: number;
}

/**
 * 境目の遊び(マスの幅に対する割合)。指が境目をこの分だけ越えるまでは、空きマスを動かさない。
 * 境目の上で指が震えても、行ったり来たりしないようにするため(戻るにも、同じだけ越える必要がある)。
 */
export const BLANK_MARGIN = 0.1;

/**
 * 空きマスが通るマスを、順に返す(動かさないなら空)。
 *   - 指が空きマス(と、その周りの遊び)の中にある間は、動かさない
 *   - 指が、空きマスと同じ行か列のマスへ出たら、そのマスまで動かす(離れたマスなら、間のサイコロもまとめて転がる)
 *   - 空きマスの角から斜めに出たときは、先に越えた境目の向きから、2回に分けて動かす
 *     (prev = 直前の指の位置。直前に空きマスを押さえていたときだけ。押さえていなければ、行か列が合うまで待つ)
 * 盤の外へ出た指は、いちばん近いマスにあるものとして扱う。
 */
export function blankPath(size: number, blank: number, prev: Point | null, p: Point): number[] {
  const bc = blank % size;
  const br = Math.floor(blank / size);
  const held = (q: Point): boolean =>
    q.x >= bc - BLANK_MARGIN &&
    q.x <= bc + 1 + BLANK_MARGIN &&
    q.y >= br - BLANK_MARGIN &&
    q.y <= br + 1 + BLANK_MARGIN;
  if (held(p)) return [];
  const clamp = (v: number): number => Math.min(size - 1, Math.max(0, Math.floor(v)));
  const tc = clamp(p.x);
  const tr = clamp(p.y);
  if (tc === bc && tr === br) return [];
  const target = tr * size + tc;
  if (tr === br || tc === bc) return [target];
  if (!prev || !held(prev)) return [];
  // 直前の位置から今の位置へまっすぐ動いたとして、縦の境目と横の境目のどちらを先に越えたか
  const dx = p.x - prev.x;
  const dy = p.y - prev.y;
  const edgeX = tc > bc ? bc + 1 : bc;
  const edgeY = tr > br ? br + 1 : br;
  const tX = dx === 0 ? Infinity : Math.max(0, (edgeX - prev.x) / dx);
  const tY = dy === 0 ? Infinity : Math.max(0, (edgeY - prev.y) / dy);
  return tX <= tY ? [br * size + tc, target] : [tr * size + bc, target];
}
