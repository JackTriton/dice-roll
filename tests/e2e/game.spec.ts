import { expect, test } from '@playwright/test';
import { KEY, session, openApp, solutionFor, swipe } from './helpers.ts';

// ランキング API につないだビルド(E2E_API)では、練習モード前提のこのファイルは飛ばす
test.skip(!!process.env.E2E_API, 'E2E_API のときは ranked.spec.ts で確かめる');

test.describe('game', () => {
  test('the first start goes straight to the game; the tutorial is in how to play', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('サイコロ8パズル');
    await page.click('#btn-start');
    await expect(page.locator('#play-mode')).toHaveText('練習');
    await page.click('#btn-retire');
    await page.click('#btn-howto');
    await page.click('#btn-tutorial');
    await expect(page.locator('#play-mode')).toHaveText('チュートリアル');
    await swipe(page, 'R');
    await expect(page.locator('#btn-tut-next')).toBeVisible();
    expect((await session(page))?.phase).toBe('done');
  });

  test('the timer does not start until the first roll, however long you wait', async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await page.click('#btn-start');
    await expect(page.locator('#play-hint')).toHaveText('転がすとスタート');
    await page.clock.fastForward('00:20');
    await expect(page.locator('#timer')).toHaveText('0.00');
    expect((await session(page))?.phase).toBe('ready');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.clock.fastForward(1500);
    expect((await session(page))?.phase).toBe('solve');
    await expect(page.locator('#timer')).not.toHaveText('0.00');
    await expect(page.locator('#play-hint')).toHaveText('');
  });

  test('a practice puzzle can show its answer, played on the board', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-howto');
    await page.click('#btn-tutorial');
    await page.click('#btn-tut-answer');
    await expect(page.locator('#play-hint')).toContainText('答え: →');
    // 再生中の指の操作は受け付けない
    await swipe(page, 'L');
    await expect(page.locator('#btn-tut-next')).toBeVisible({ timeout: 5000 });
    expect((await session(page))?.moves).toBe('R');
    await expect(page.locator('#play-hint')).toContainText('答えの手順');
  });

  test('the how-to screen lists the one-off formulas and plays them', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-howto');
    const tips = page.locator('#tips-grid .tip');
    await expect(tips).toHaveCount(10);
    await expect(tips.first()).toContainText('空きの左隣・1が左');
    await expect(tips.first()).toContainText('1手');
    await expect(tips.nth(1)).toContainText('→↑←←↓→↑←↓→↑→↓');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await tips.nth(5).click();
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });

  test('swiping solves a board without scrolling or zooming the page', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() =>
      (window as never as { __dice: { start(s: string): void } }).__dice.start('aaad-aaaa'),
    );
    const before = await page.evaluate(() => [window.scrollX, window.scrollY, visualViewport?.scale ?? 1]);
    await swipe(page, 'R');
    await expect(page.locator('#result')).toBeVisible();
    expect(await page.evaluate(() => [window.scrollX, window.scrollY, visualViewport?.scale ?? 1])).toEqual(
      before,
    );
    await expect(page.locator('#result-time')).toContainText('0.00');
  });

  test('a continuous swipe rolls several dice in one gesture', async ({ page }) => {
    await openApp(page);
    // 空きは右下。左へ連続スワイプすると、空きが左端まで移る(右へ転がる手が2回)
    await page.evaluate(() =>
      (window as never as { __dice: { start(s: string): void } }).__dice.start('abcdefgh-'),
    );
    const box = (await page.locator('#board').boundingBox())!;
    const cell = box.width / 3;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + cell * 0.5, y);
    await page.mouse.down();
    await page.mouse.move(box.x + cell * 0.5 + cell * 0.65, y, { steps: 8 });
    await page.mouse.up();
    expect((await session(page))?.moves).toBe('RR');
  });

  test('a full 3x3 practice solve with the keyboard records the time', async ({ page }) => {
    await openApp(page);
    await page.click('#btn-start');
    await expect(page.locator('#play-mode')).toHaveText('練習');
    const s = await session(page);
    const moves = solutionFor(s!.scramble);
    expect(moves.length).toBeGreaterThanOrEqual(24);
    for (const m of moves) await page.keyboard.press(KEY[m], { delay: 20 });
    await expect(page.locator('#result')).toBeVisible();
    const done = await session(page);
    expect(done?.phase).toBe('done');
    expect(done?.moves).toBe(moves.join(''));
    await expect(page.locator('#result-detail')).toContainText(`手数 ${moves.length}手`);
    await expect(page.locator('#result')).not.toContainText('最短');
    await page.click('#btn-to-title');
    await expect(page.locator('#stat-count')).toHaveText('1');
    await expect(page.locator('#stat-best')).not.toHaveText('—');
  });

  test('a 4x4 solve works too', async ({ page }) => {
    await openApp(page);
    await page.click('[data-size="4"]');
    await page.click('#btn-start');
    const s = await session(page);
    expect(s!.scramble).toHaveLength(16);
    for (const m of solutionFor(s!.scramble)) await page.keyboard.press(KEY[m]);
    await expect(page.locator('#result')).toBeVisible();
  });

  test('leaving the app during a solve still records the time', async ({ page }) => {
    await openApp(page);
    await page.click('#btn-start');
    const s = await session(page);
    const moves = solutionFor(s!.scramble);
    await page.keyboard.press(KEY[moves[0]]);
    // アプリを離れて戻る
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    for (const m of moves.slice(1)) await page.keyboard.press(KEY[m]);
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#result')).not.toContainText('記録に入りません');
    await page.click('#btn-to-title');
    await expect(page.locator('#stat-count')).toHaveText('1');
    await expect(page.locator('#stat-best')).not.toHaveText('—');
  });

  test('language can be switched to English', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-settings');
    await page.selectOption('#lang-select', 'en');
    await page.click('#btn-settings-back');
    await expect(page.locator('h1')).toHaveText('Dice Roll 8');
    await page.reload();
    await expect(page.locator('#btn-start')).toHaveText('Start');
  });

  test('replay plays back a solve', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() =>
      (window as never as { __dice: { start(s: string): void } }).__dice.start('aaad-aaaa'),
    );
    await swipe(page, 'R');
    await page.click('#btn-replay');
    await expect(page.locator('#screen-replay')).toBeVisible();
  });
});

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Service Worker が事前キャッシュを終えてから切る
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  await page.click('#btn-start');
  await expect(page.locator('#play-mode')).toHaveText('練習');
  await context.setOffline(false);
});
