import type { Page } from '@playwright/test';
import { decodeBoard } from '../../src/core/board.ts';
import type { Move } from '../../src/core/dice.ts';
import { seededRng } from '../../src/core/random.ts';
import { solve3 } from '../../src/core/table3.ts';
import { loadOrBuildDist3 } from '../../tools/lib/dist3.ts';
import { solve4 } from '../../tools/lib/solver4.ts';

let dist3: Uint8Array | null = null;

/** 盤面の文字列から、解答の手順を求める(3×3 は最短、4×4 は段階ソルバー) */
export function solutionFor(scramble: string): Move[] {
  dist3 ??= loadOrBuildDist3(() => undefined);
  const b = decodeBoard(scramble);
  if (!b) throw new Error(`bad scramble ${scramble}`);
  return b.size === 3 ? solve3(dist3, b) : solve4(b, dist3, seededRng(1));
}

export const KEY: Record<Move, string> = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };

export interface SessionSnapshot {
  phase: string;
  moves: string;
  times: number[];
  scramble: string;
}

export const session = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __dice: { session(): SessionSnapshot | null } }).__dice.session(),
  );

/** アプリを開く */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
}

/** 盤の中央から、方向 m へスワイプする(dist はマスの幅に対する割合) */
export async function swipe(page: Page, m: Move, dist = 0.5): Promise<void> {
  const box = (await page.locator('#board').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const d = (box.width / 3) * dist;
  const [dx, dy] = m === 'R' ? [d, 0] : m === 'L' ? [-d, 0] : m === 'U' ? [0, -d] : [0, d];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 5 });
  await page.mouse.up();
}
