// ランキングの通しテスト。ローカルの Worker(npm run dev:api)を立ててから、E2E_API を付けて実行する:
//   E2E_API=http://localhost:8787 npx playwright test ranked
import { expect, test } from '@playwright/test';
import { KEY, session, openApp, solutionFor } from './helpers.ts';

test.skip(!process.env.E2E_API, 'E2E_API が無いのでランキングのテストは飛ばす');

test('a ranked solve is verified by the server and appears on the ranking', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-start');
  await expect(page.locator('#play-mode')).toHaveText('ランキング');
  const s = await session(page);
  for (const m of solutionFor(s!.scramble)) {
    await page.keyboard.press(KEY[m]);
    await page.waitForTimeout(80); // 人間離れした速さ(平均 60ms 未満)にならないように
  }
  await expect(page.locator('#nick-form')).toBeVisible();
  const nick = `テスト${Math.floor(Math.random() * 1000)}`;
  await page.fill('#nick-input', nick);
  await page.click('#nick-form button[type="submit"]');
  await expect(page.locator('#result-rank')).toContainText(/ランキング \d+位/);
  await expect(page.locator('#result')).not.toContainText('最短');

  await page.click('#btn-to-title');
  await page.click('#btn-ranking');
  const mine = page.locator('#ranking-list li.me');
  await expect(mine).toContainText(nick);
  await expect(page.locator('#ranking-me')).toContainText('あなたの順位');
  await expect(page.locator('#ranking-rule')).toContainText('ソルバー');
});

test('a nickname saved only on the device is registered when the solve is submitted', async ({ page }) => {
  await openApp(page);
  // ランキングにつなぐ前の版で、設定からニックネームを保存した状態を再現する
  const nick = `端末${Math.floor(Math.random() * 1000)}`;
  await page.evaluate((n) => {
    const st = JSON.parse(localStorage.getItem('diceroll.v1')!);
    st.nickname = n;
    localStorage.setItem('diceroll.v1', JSON.stringify(st));
  }, nick);
  await page.reload();
  await page.waitForTimeout(2500); // 先読みと発行間隔(2秒)が重ならないように
  await page.click('#btn-start');
  await expect(page.locator('#play-mode')).toHaveText('ランキング');
  const s = await session(page);
  for (const m of solutionFor(s!.scramble)) {
    await page.keyboard.press(KEY[m]);
    await page.waitForTimeout(80);
  }
  await expect(page.locator('#result-rank')).toContainText(/ランキング \d+位/);
  await expect(page.locator('#nick-form')).toBeHidden();
  await page.click('#btn-to-title');
  await page.click('#btn-ranking');
  await expect(page.locator('#ranking-list li.me')).toContainText(nick);
});

test('the admin screen replays any attempt and can take a record off the ranking', async ({ page }) => {
  await openApp(page);
  await page.waitForTimeout(2500);
  await page.click('#btn-start');
  await expect(page.locator('#play-mode')).toHaveText('ランキング');
  const s = await session(page);
  for (const m of solutionFor(s!.scramble)) {
    await page.keyboard.press(KEY[m]);
    await page.waitForTimeout(80);
  }
  const nick = `管理${Math.floor(Math.random() * 1000)}`;
  await page.fill('#nick-input', nick);
  await page.click('#nick-form button[type="submit"]');
  await expect(page.locator('#result-rank')).toContainText(/ランキング \d+位/);

  // #admin を開いて合言葉を入れる(手元の Worker は api/.dev.vars の ADMIN_TOKEN)
  await page.goto('/#admin');
  await expect(page.locator('#screen-admin')).toBeVisible();
  await page.fill('#admin-token', 'wrong-token');
  await page.click('#admin-login button[type="submit"]');
  await expect(page.locator('#admin-login-status')).toHaveText('トークンが違います');
  await page.fill('#admin-token', 'dev-admin-token');
  await page.click('#admin-login button[type="submit"]');
  const mine = page.locator('#admin-list li', { hasText: nick });
  await expect(mine).toBeVisible();

  // ベストを再生すると、判断用の数字が出る
  await mine.getByRole('button', { name: 'ベストを再生' }).click();
  await expect(page.locator('#screen-replay')).toBeVisible();
  await expect(page.locator('#replay-info')).toContainText('最短');
  await expect(page.locator('#replay-info')).toContainText('1秒あたり');
  await page.click('#btn-replay-back');
  await expect(page.locator('#screen-admin')).toBeVisible();

  // 挑戦の一覧から再生できる
  await page.locator('#admin-list li', { hasText: nick }).getByRole('button', { name: '挑戦の一覧' }).click();
  await expect(page.locator('#admin-filter')).toContainText(nick);
  await page.locator('#admin-list li').first().getByRole('button', { name: '再生' }).click();
  await expect(page.locator('#screen-replay')).toBeVisible();
  await page.click('#btn-replay-back');

  // 記録を消すと、ランキングから外れる
  await page.click('#admin-tabs [data-tab="ranking"]');
  page.once('dialog', (d) => void d.accept());
  await page.locator('#admin-list li', { hasText: nick }).getByRole('button', { name: '記録を消す' }).click();
  await expect(page.locator('#admin-list li', { hasText: nick })).toHaveCount(0);
});

test('a hard solve is verified by the server and ranked apart from the normal ranking', async ({ page }) => {
  test.skip(process.env.E2E_HARD === '0', 'ハードを出したビルドで確かめる');
  test.setTimeout(120_000);
  await openApp(page);
  await page.waitForTimeout(2500);
  await page.click('#rule-select [data-rule="aligned"]');
  await page.waitForTimeout(2500); // 先読みと発行間隔(2秒)が重ならないように
  await page.click('#btn-start');
  await expect(page.locator('#play-mode')).toHaveText('ランキング');
  await expect(page.locator('#play-size')).toHaveText('3×3 ハード');
  const s = await session(page);
  // ハード用のソルバー(最短ではない。80手前後)で解く
  for (const m of solutionFor(s!.scramble, 'aligned')) {
    await page.keyboard.press(KEY[m]);
    await page.waitForTimeout(80);
  }
  await expect(page.locator('#nick-form')).toBeVisible();
  const nick = `ハード${Math.floor(Math.random() * 1000)}`;
  await page.fill('#nick-input', nick);
  await page.click('#nick-form button[type="submit"]');
  await expect(page.locator('#result-rank')).toContainText(/ランキング \d+位/);

  // ランキング画面は、選んでいるルール(ハード)から開く。ふつうのランキングには載らない
  await page.click('#btn-to-title');
  await page.click('#btn-ranking');
  await expect(page.locator('#ranking-rules [data-rule="aligned"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#ranking-list li.me')).toContainText(nick);
  await page.click('#ranking-rules [data-rule="ones"]');
  await expect(page.locator('#ranking-me')).toHaveText('まだランキングに記録がありません');
  await expect(page.locator('#ranking-list li', { hasText: nick })).toHaveCount(0);

  // 管理者画面でも、ハードに切り替えると見えて、リプレイできる
  await page.goto('/#admin');
  await page.fill('#admin-token', 'dev-admin-token');
  await page.click('#admin-login button[type="submit"]');
  await expect(page.locator('#admin-list')).toBeVisible();
  await expect(page.locator('#admin-list li', { hasText: nick })).toHaveCount(0);
  await page.click('#admin-rules [data-rule="aligned"]');
  const mine = page.locator('#admin-list li', { hasText: nick });
  await expect(mine).toBeVisible();
  await mine.getByRole('button', { name: 'ベストを再生' }).click();
  await expect(page.locator('#screen-replay')).toBeVisible();
  await expect(page.locator('#replay-info')).toContainText('3×3 ハード');
  await page.click('#btn-replay-back');
  await page.click('#admin-tabs [data-tab="attempts"]');
  await expect(page.locator('#admin-list li', { hasText: nick }).first()).toContainText('受付');
  await page.click('#admin-tabs [data-tab="ranking"]');
  page.once('dialog', (d) => void d.accept());
  await page.locator('#admin-list li', { hasText: nick }).getByRole('button', { name: '記録を消す' }).click();
  await expect(page.locator('#admin-list li', { hasText: nick })).toHaveCount(0);
});

test('a tampered submission is rejected by the server', async ({ page, request }) => {
  await openApp(page);
  const deviceId = await page.evaluate(
    () => JSON.parse(localStorage.getItem('diceroll.v1')!).deviceId as string,
  );
  const api = process.env.E2E_API!;
  await request.put(`${api}/api/v1/profile`, { data: { deviceId, nickname: 'cheater' } });
  // 画面を開いたときの先読みと重ならないよう、発行間隔(2秒)をあける
  await page.waitForTimeout(2500);
  const issued = await (await request.post(`${api}/api/v1/scramble`, { data: { deviceId, size: 3 } })).json();
  const moves = solutionFor(issued.scramble);
  // 1手 10ms の速すぎる記録
  const times = moves.map((_, i) => i * 10);
  const r = await request.post(`${api}/api/v1/submit`, {
    data: {
      deviceId,
      scrambleId: issued.scrambleId,
      moves: moves.join(''),
      times,
      timeMs: times[times.length - 1],
    },
  });
  expect(await r.json()).toMatchObject({ accepted: false });
});
