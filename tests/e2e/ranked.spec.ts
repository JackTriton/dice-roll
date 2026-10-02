// ランキングの通しテスト。ローカルの Worker(npm run dev:api)を立ててから、E2E_API を付けて実行する:
//   E2E_API=http://localhost:8787 npx playwright test ranked
import { expect, test } from '@playwright/test';
import { KEY, session, skipHowto, solutionFor } from './helpers.ts';

test.skip(!process.env.E2E_API, 'E2E_API が無いのでランキングのテストは飛ばす');

test('a ranked solve is verified by the server and appears on the ranking', async ({ page }) => {
  await skipHowto(page);
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
});

test('a tampered submission is rejected by the server', async ({ page, request }) => {
  await skipHowto(page);
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
