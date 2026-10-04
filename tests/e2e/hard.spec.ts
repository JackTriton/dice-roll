import { expect, test, type Page } from './fixtures.ts';
import { alignedExample } from '../../src/core/aligned.ts';
import { applyMove, decodeBoard, dieKind, encodeBoard } from '../../src/core/board.ts';
import type { Move } from '../../src/core/dice.ts';
import { session } from './helpers.ts';

// ランキングにつながないビルドでの、ハード(正立に揃える)の動き。ランキングは ranked.spec.ts で確かめる
test.skip(!!process.env.E2E_API, 'E2E_API のときは ranked.spec.ts で確かめる');

/** ハードを出していないビルドでテストするとき */
const HARD_OFF = process.env.E2E_HARD === '0';
/** 見た目の見比べ用の設定を出していないビルド(本番と同じ)でテストするとき */
const LAB_OFF = process.env.E2E_LAB === '0';

const startBoard = (page: Page, encoded: string) =>
  page.evaluate(
    (e) =>
      (window as unknown as { __dice: { start(e: string, rule: string): void } }).__dice.start(e, 'aligned'),
    encoded,
  );

/** 見本の盤から moves を動かした盤 */
function boardAfter(kind: 'done' | 'near', moves: string): string {
  const b = alignedExample(3, kind);
  for (const m of moves) applyMove(b, m as Move);
  return encodeBoard(b);
}

test.describe('hard mode is hidden unless it is switched on', () => {
  test.skip(!HARD_OFF, 'E2E_HARD=0 のビルドで確かめる');

  test('a build without the hard mode shows no trace of it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#rule-select')).toBeHidden();
    await page.click('#btn-start');
    await expect(page.locator('#play-size')).toHaveText('3×3');
    await page.click('#btn-retire');
    await page.click('#btn-howto');
    await expect(page.locator('#hard-howto')).toBeHidden();
    await page.click('#btn-howto-back');
    await page.click('#btn-settings');
    await expect(page.locator('#look-settings')).toBeHidden();
  });

  test('the title die stays the plain red pip', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('diceroll.v1')!);
      s.rule = 'aligned';
      localStorage.setItem('diceroll.v1', JSON.stringify(s));
    });
    await page.reload();
    const [r, g, b] = await page.evaluate(() => {
      const c = document.getElementById('title-dice') as HTMLCanvasElement;
      const d = c
        .getContext('2d')!
        .getImageData(Math.round(c.width * 0.5), Math.round(c.height * 0.17), 1, 1).data;
      return [d[0], d[1], d[2]];
    });
    expect(b > 150 && b - r > 80, `rim pixel ${r},${g},${b}`).toBe(false);
    await expect(page.locator('#tagline')).toHaveText('転がして、全部1に。');
  });

  test('a stored hard-mode choice is ignored', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('diceroll.v1')!);
      s.rule = 'aligned';
      localStorage.setItem('diceroll.v1', JSON.stringify(s));
    });
    await page.reload();
    await page.click('#btn-start');
    await expect(page.locator('#play-size')).toHaveText('3×3');
    await expect(page.locator('#play-hint')).toHaveText('転がすとスタート');
  });
});

test.describe('hard mode', () => {
  test.skip(HARD_OFF, 'ハードを出したビルドで確かめる');

  test('the title die changes only while hard is selected', async ({ page }) => {
    await page.goto('/');
    // 絵の中の1点の色(0..255)。見るのは、縁の上辺の真ん中(ハードでは青い線が来る)、上の面の真ん中、
    // 真ん中の左下(三角の中だが、丸の外)
    const pixel = (fx: number, fy: number) =>
      page.evaluate(
        ([x, y]) => {
          const c = document.getElementById('title-dice') as HTMLCanvasElement;
          const d = c
            .getContext('2d')!
            .getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data;
          return [d[0], d[1], d[2]];
        },
        [fx, fy],
      );
    const isBlue = ([r, , b]: number[]) => b > 150 && b - r > 80;
    const isRed = ([r, g, b]: number[]) => r > 150 && r - g > 100 && r - b > 100;
    // ふつう(既定): 赤い丸だけ。青い線は無い
    expect(isBlue(await pixel(0.5, 0.17))).toBe(false);
    expect(isRed(await pixel(0.5, 0.5))).toBe(true);
    expect(isRed(await pixel(0.415, 0.56))).toBe(false);
    await expect(page.locator('#tagline')).toHaveText('転がして、全部1に。');
    // ハード: 三角と、奥の縁の青い線
    await page.click('#rule-select [data-rule="aligned"]');
    expect(isBlue(await pixel(0.5, 0.17))).toBe(true);
    expect(isRed(await pixel(0.5, 0.52))).toBe(true);
    expect(isRed(await pixel(0.415, 0.56))).toBe(true);
    await expect(page.locator('#tagline')).toHaveText('転がして、全部1に。まっすぐ立てて。');
    // ふつうに戻すと、元の絵に戻る
    await page.click('#rule-select [data-rule="ones"]');
    expect(isBlue(await pixel(0.5, 0.17))).toBe(false);
    expect(isRed(await pixel(0.5, 0.5))).toBe(true);
    expect(isRed(await pixel(0.415, 0.56))).toBe(false);
    await expect(page.locator('#tagline')).toHaveText('転がして、全部1に。');
    // ハードを選んだまま開き直しても、ハードの絵
    await page.click('#rule-select [data-rule="aligned"]');
    await page.reload();
    expect(isBlue(await pixel(0.5, 0.17))).toBe(true);
  });

  test('choosing hard starts a practice puzzle that can be aligned', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#rule-select')).toBeVisible();
    // 既定はふつう
    await expect(page.locator('#rule-select [data-rule="ones"]')).toHaveAttribute('aria-checked', 'true');
    await page.click('#rule-select [data-rule="aligned"]');
    await expect(page.locator('#rule-select [data-rule="aligned"]')).toHaveAttribute('aria-checked', 'true');
    await page.click('#btn-start');
    await expect(page.locator('#play-mode')).toHaveText('練習');
    await expect(page.locator('#play-size')).toHaveText('3×3 ハード');
    await expect(page.locator('#play-hint')).toHaveText('全部1を上に、正立にそろえる');
    // 問題は、向きを揃えられる盤面(組が 4 個ずつ)
    const s = (await session(page))!;
    const b = decodeBoard(s.scramble)!;
    const kinds = [0, 0];
    for (let c = 0; c < 9; c++) if (c !== b.blank) kinds[dieKind(3, c, b.cells[c])]++;
    expect(kinds).toEqual([4, 4]);
    // 選んだルールは覚えている
    await page.click('#btn-retire');
    await page.reload();
    await expect(page.locator('#rule-select [data-rule="aligned"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('every 1 on top is not enough: the dice must stand upright', async ({ page }) => {
    await page.goto('/');
    // 1は全部上だが2個だけ向きが違う盤から、1個を右へ動かした盤
    await startBoard(page, boardAfter('near', 'R'));
    await expect(page.locator('#play-size')).toHaveText('3×3 ハード');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(400);
    expect((await session(page))?.phase).toBe('solve');
    await expect(page.locator('#result')).toBeHidden();
  });

  test('aligning the dice clears it and keeps the record apart from the normal one', async ({ page }) => {
    await page.goto('/');
    await startBoard(page, boardAfter('done', 'LU'));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#result')).toBeVisible();
    expect((await session(page))?.phase).toBe('done');
    await expect(page.locator('#result-detail')).toContainText('2手');
    await expect(page.locator('#result-note')).toContainText('練習モードの記録です');
    await expect(page.locator('#nick-form')).toBeHidden();
    // リプレイにも目印が出る(エラーなく描ける)
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.click('#btn-replay');
    await page.waitForTimeout(600);
    await page.click('#btn-replay-back');
    expect(errors).toEqual([]);
    // 記録はハードの側にだけ付く
    await expect(page.locator('#stat-count')).toHaveText('0');
    await page.click('#rule-select [data-rule="aligned"]');
    await expect(page.locator('#stat-count')).toHaveText('1');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('diceroll.v1')!));
    expect(stored.hardStats['3'].count).toBe(1);
    expect(stored.hardStats['3'].bestReplay.rule).toBe('aligned');
    expect(stored.stats['3'].count).toBe(0);
  });

  test('"again" keeps the hard rule', async ({ page }) => {
    await page.goto('/');
    await startBoard(page, boardAfter('done', 'L'));
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#result')).toBeVisible();
    await page.click('#btn-again');
    await expect(page.locator('#result')).toBeHidden();
    await expect(page.locator('#play-size')).toHaveText('3×3 ハード');
    expect((await session(page))?.phase).toBe('ready');
  });

  test('the production build has no look settings and always uses the decided look', async ({ page }) => {
    test.skip(!LAB_OFF, 'E2E_LAB=0 のビルドで確かめる');
    await page.goto('/');
    // 見比べ用に選んでいた見た目が端末に残っていても、決めた見た目(三角と青い線)で描く
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('diceroll.v1')!);
      s.look = { side: 'none', one: 'koma' };
      s.rule = 'aligned';
      localStorage.setItem('diceroll.v1', JSON.stringify(s));
    });
    await page.reload();
    const rim = await page.evaluate(() => {
      const c = document.getElementById('title-dice') as HTMLCanvasElement;
      const d = c
        .getContext('2d')!
        .getImageData(Math.round(c.width * 0.5), Math.round(c.height * 0.17), 1, 1).data;
      return [d[0], d[1], d[2]];
    });
    expect(rim[2] > 150 && rim[2] - rim[0] > 80, `rim pixel ${rim.join(',')}`).toBe(true);
    await page.click('#btn-settings');
    await expect(page.locator('#look-settings')).toBeHidden();
    await page.click('#btn-settings-back');
    await page.click('#btn-howto');
    await expect(page.locator('#hard-rules li').nth(1)).toContainText('1の三角が奥');
    await expect(page.locator('#hard-rules li').nth(3)).toContainText('三角は、いつも青い印の側を指します');
  });

  test('the look can be switched in settings, and how-to explains the rule', async ({ page }) => {
    test.skip(LAB_OFF, '見比べ用の設定を出したビルドで確かめる');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.click('#btn-settings');
    await expect(page.locator('#look-settings')).toBeVisible();
    // 既定は、1の目を三角にし、2の面のある縁に青い線を引く
    await expect(page.locator('#look-side')).toHaveValue('bar');
    await expect(page.locator('#look-one')).toHaveValue('tri');
    const look = () => page.evaluate(() => JSON.parse(localStorage.getItem('diceroll.v1')!).look);
    // 遊び方の説明は、見た目に合わせて変わる
    const rules = page.locator('#hard-rules li');
    const howto = async () => {
      await page.click('#btn-settings-back');
      await page.click('#btn-howto');
      await expect(page.locator('#hard-howto')).toBeVisible();
    };
    const settings = async () => {
      await page.click('#btn-howto-back');
      await page.click('#btn-settings');
    };
    await howto();
    await expect(rules).toHaveCount(5);
    await expect(rules.nth(0)).toContainText('正立');
    await expect(rules.nth(1)).toContainText('1の三角が奥');
    await expect(rules.nth(3)).toContainText('三角は、いつも青い印の側を指します');
    await settings();
    // 向きの分かる目印が1つも無い組み合わせにはならない
    await page.selectOption('#look-side', 'none');
    await page.selectOption('#look-one', 'dot');
    await expect(page.locator('#look-side')).toHaveValue('bar');
    expect(await look()).toEqual({ side: 'bar', one: 'dot' });
    await howto();
    await expect(rules).toHaveCount(3);
    await expect(rules.nth(1)).toContainText('青い印(2の面)');
    await settings();
    await page.selectOption('#look-side', 'none');
    await expect(page.locator('#look-one')).toHaveValue('tri');
    expect(await look()).toEqual({ side: 'none', one: 'tri' });
    await howto();
    await expect(rules.nth(3)).toContainText('三角の向きは見えません');
    await settings();
    for (const v of ['dots', 'band']) await page.selectOption('#look-side', v);
    await page.selectOption('#look-one', 'torii');
    expect(await look()).toEqual({ side: 'band', one: 'torii' });
    await howto();
    await expect(rules.nth(1)).toContainText('1の絵');
    await expect(rules.nth(3)).toContainText('青い印も付いています');
    await page.click('#btn-howto-back');
    // どの図案でも、盤を描ける(転がる途中も)
    for (const one of ['koma', 'fuji', 'torii', 'one', 'tri', 'dial']) {
      await page.click('#btn-settings');
      await page.selectOption('#look-one', one);
      await page.click('#btn-settings-back');
      await startBoard(page, boardAfter('near', 'RD'));
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(250);
      await page.click('#btn-retire');
    }
    expect(errors).toEqual([]);
  });

  test('the decided look replaces a look saved before the decision', async ({ page }) => {
    test.skip(LAB_OFF, '見比べ用の設定を出したビルドで確かめる');
    await page.goto('/');
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('diceroll.v1')!);
      s.look = { side: 'none', one: 'koma' };
      delete s.lookRev;
      localStorage.setItem('diceroll.v1', JSON.stringify(s));
    });
    await page.reload();
    await page.click('#btn-settings');
    await expect(page.locator('#look-side')).toHaveValue('bar');
    await expect(page.locator('#look-one')).toHaveValue('tri');
    // 決めたあとに設定で変えた見た目は、開き直しても残る
    await page.selectOption('#look-one', 'fuji');
    await page.reload();
    await page.click('#btn-settings');
    await expect(page.locator('#look-side')).toHaveValue('bar');
    await expect(page.locator('#look-one')).toHaveValue('fuji');
  });

  test('4×4 hard starts too', async ({ page }) => {
    await page.goto('/');
    await page.click('#screen-title .size-select [data-size="4"]');
    await page.click('#rule-select [data-rule="aligned"]');
    await page.click('#btn-start');
    await expect(page.locator('#play-size')).toHaveText('4×4 ハード');
    const s = (await session(page))!;
    const b = decodeBoard(s.scramble)!;
    const kinds = [0, 0];
    for (let c = 0; c < 16; c++) if (c !== b.blank) kinds[dieKind(4, c, b.cells[c])]++;
    expect(kinds.sort()).toEqual([7, 8]);
  });
});
