// リプレイ動画: MP4 を書き出し、長さが「プレイの時間割り + 前後の演出」と 0.1 秒以内で合うことを確かめる。
// H.264 の書き出しには Edge / Chrome が要る(Playwright 同梱の Chromium では作れないことがある)。
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { ReplayTimeline } from '../../src/app/render/frame.ts';
import { planVideo } from '../../src/video/frames.ts';
import { KEY, session, skipHowto, solutionFor } from './helpers.ts';

test('saves a real-speed MP4 whose length matches the solve', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'デスクトップ(ダウンロードできる環境)だけで確かめる');
  test.setTimeout(90_000);
  await skipHowto(page);
  await page.click('#btn-start');
  const s = await session(page);
  for (const m of solutionFor(s!.scramble)) {
    await page.keyboard.press(KEY[m]);
    await page.waitForTimeout(70);
  }
  await expect(page.locator('#result')).toBeVisible();
  const done = (await session(page))!;
  await page.click('#btn-video');
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: 'ダウンロード' }).click({ timeout: 60_000 });
  const file = await (await download).path();
  const buf = readFileSync(file);
  const input = new Input({ source: new BufferSource(buf), formats: ALL_FORMATS });
  const seconds = await input.computeDuration();
  const track = await input.getPrimaryVideoTrack();
  expect(track?.codec).toBe('avc');
  const timeMs = done.times[done.times.length - 1];
  const plan = planVideo(
    new ReplayTimeline({ scramble: done.scramble, moves: done.moves, times: done.times }),
    timeMs,
  );
  expect(Math.abs(seconds * 1000 - plan.durationMs)).toBeLessThanOrEqual(100);
  // 動画の中のタイマーの進み(計測開始から完了まで)は、実際のタイムと同じ速さ
  expect(plan.speed).toBe(1);
});
