// これまでの E2E テストは、「サイコロを動かす」操作(スワイプや矢印キーの向きへサイコロが転がる)を前提にしている。
// 何も保存されていない端末では「空きマスを動かす」操作が既定なので、ここで「サイコロを動かす」を選んだ状態にしておく。
// 「空きマスを動かす」操作のテストは controls.spec.ts(そちらは @playwright/test の test をそのまま使う)。
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        if (!localStorage.getItem('diceroll.v1'))
          localStorage.setItem(
            'diceroll.v1',
            JSON.stringify({ v: 1, deviceId: crypto.randomUUID(), control: 'dice' }),
          );
      } catch {
        // 保存できない環境では、既定のまま
      }
    });
    await use(page);
  },
});
