// 操作の種類: 「空きマスを動かす」(既定)と「サイコロを動かす」(これまでの操作)。
import { expect, test, type Page } from '@playwright/test';
import { session } from './helpers.ts';

/** 盤面を指定して、練習を始める */
const start = (page: Page, encoded: string) =>
  page.evaluate((e) => (window as never as { __dice: { start(s: string): void } }).__dice.start(e), encoded);

/** マス cell の中の点(fx, fy は、マスの左上からの割合) */
async function point(page: Page, size: number, cell: number, fx = 0.5, fy = 0.5) {
  const box = (await page.locator('#board').boundingBox())!;
  const pad = box.width * 0.035;
  const w = (box.width - pad * 2) / size;
  return {
    x: box.x + pad + ((cell % size) + fx) * w,
    y: box.y + pad + (Math.floor(cell / size) + fy) * w,
  };
}

const control = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('diceroll.v1')!).control as string);

test.describe('hold the empty cell and drag it (default)', () => {
  test('dragging the empty cell rolls the dice it passes', async ({ page }) => {
    await page.goto('/');
    // 空きは真ん中(マス4)
    await start(page, 'abcd-efgh');
    const from = await point(page, 3, 4);
    const left = await point(page, 3, 3);
    const top = await point(page, 3, 0);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // 押さえただけでは動かない
    expect((await session(page))?.moves).toBe('');
    // 左のマスへ入ると、そこのサイコロが右へ転がる。続けて上へ動かすと、上のサイコロが下へ転がる
    await page.mouse.move(left.x, left.y, { steps: 8 });
    expect((await session(page))?.moves).toBe('R');
    await page.mouse.move(top.x, top.y, { steps: 8 });
    await page.mouse.up();
    expect((await session(page))?.moves).toBe('RD');
  });

  test('the border has some play, so a shaky finger does not move back and forth', async ({ page }) => {
    await page.goto('/');
    await start(page, 'abcd-efgh');
    const from = await point(page, 3, 4);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // 境目をわずかに越えただけでは動かない
    const barely = await point(page, 3, 5, 0.05);
    await page.mouse.move(barely.x, barely.y, { steps: 4 });
    expect((await session(page))?.moves).toBe('');
    // 遊びの分を越えると動く
    const past = await point(page, 3, 5, 0.2);
    await page.mouse.move(past.x, past.y, { steps: 4 });
    expect((await session(page))?.moves).toBe('L');
    // 境目の近くで揺れても、戻らない
    const back = await point(page, 3, 4, 0.97);
    await page.mouse.move(back.x, back.y, { steps: 4 });
    await page.mouse.move(past.x, past.y, { steps: 4 });
    await page.mouse.up();
    expect((await session(page))?.moves).toBe('L');
  });

  test('touching a die in line with the empty cell rolls everything in between', async ({ page }) => {
    await page.goto('/');
    // 空きは左上(マス0)。右端(マス2)に触れると、2個が左へ転がる
    await start(page, '-abcdefgh');
    const far = await point(page, 3, 2);
    await page.mouse.move(far.x, far.y);
    await page.mouse.down();
    await page.mouse.up();
    expect((await session(page))?.moves).toBe('LL');
    // 行も列も合わないマス(マス3。空きはマス2)に触れても、動かない
    const off = await point(page, 3, 3);
    await page.mouse.move(off.x, off.y);
    await page.mouse.down();
    await page.mouse.up();
    expect((await session(page))?.moves).toBe('LL');
  });

  test('arrow keys move the empty cell', async ({ page }) => {
    await page.goto('/');
    await start(page, 'abcd-efgh');
    // 空きを左へ = 左のサイコロが右へ転がる
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    expect((await session(page))?.moves).toBe('RD');
  });

  test('the how-to and the first practice puzzle explain the drag', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-howto');
    await expect(page.locator('#rule-1')).toContainText('空きマスを指で押さえて');
    await expect(page.locator('.arrows-note').first()).toHaveText('矢印は、空きマスを動かす向きです。');
    await page.click('#btn-tutorial');
    await expect(page.locator('#play-hint')).toContainText('空きマスから左へ');
    // 答えの矢印も、空きマスを動かす向き(サイコロが右へ転がる = 空きマスは左へ)
    await page.click('#btn-tut-answer');
    await expect(page.locator('#play-hint')).toContainText('←');
  });
});

test.describe('choosing the controls', () => {
  test('the settings switch back to moving the dice by swiping', async ({ page }) => {
    await page.goto('/');
    expect(await control(page)).toBe('blank');
    await page.click('#btn-settings');
    await expect(page.locator('#control-select')).toHaveValue('blank');
    await page.selectOption('#control-select', 'dice');
    await expect(page.locator('#control-note')).toContainText('スワイプした向きへ');
    expect(await control(page)).toBe('dice');
    await page.click('#btn-settings-back');
    await start(page, 'abcd-efgh');
    // 盤の上を右へスワイプすると、左のサイコロが右へ転がる(空きは左へ)
    const from = await point(page, 3, 4);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y, { steps: 5 });
    await page.mouse.up();
    expect((await session(page))?.moves).toBe('R');
    // 矢印キーも、サイコロが転がる向き
    await page.keyboard.press('ArrowDown');
    expect((await session(page))?.moves).toBe('RD');
    await page.click('#btn-retire');
    await page.click('#btn-howto');
    await expect(page.locator('#rule-1')).toContainText('スワイプすると');
    await expect(page.locator('.arrows-note').first()).toHaveText('矢印は、スワイプする向きです。');
    // 選んだ操作は、開き直しても残る
    await page.reload();
    expect(await control(page)).toBe('dice');
    await expect(page.locator('#control-dialog')).toBeHidden();
  });

  test('a new player is not asked anything', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#control-dialog')).toBeHidden();
    expect(await control(page)).toBe('blank');
  });

  for (const [button, expected] of [
    ['#btn-control-old', 'dice'],
    ['#btn-control-new', 'blank'],
  ] as const) {
    test(`a returning player is told once and can choose (${expected})`, async ({ page }) => {
      // これまでの版が保存したデータ(操作の種類が無い)
      await page.addInitScript(() => {
        if (!localStorage.getItem('diceroll.v1'))
          localStorage.setItem(
            'diceroll.v1',
            JSON.stringify({ v: 1, deviceId: crypto.randomUUID(), nickname: 'old' }),
          );
      });
      await page.goto('/');
      await expect(page.locator('#control-dialog')).toBeVisible();
      await expect(page.locator('#control-dialog-title')).toHaveText('操作が新しくなりました');
      await page.click(button);
      await expect(page.locator('#control-dialog')).toBeHidden();
      expect(await control(page)).toBe(expected);
      // 2回目からは出ない
      await page.reload();
      await expect(page.locator('#control-dialog')).toBeHidden();
      expect(await control(page)).toBe(expected);
    });
  }
});
