import { describe, expect, it } from 'vitest';
import { RELOAD_RETRY_MS, createUpdater } from '../../src/app/update.ts';

/** 配信されている版・画面の状態・時計を外から動かせる、テスト用の環境 */
function setup(current = 'v1') {
  const env = {
    latest: 'v1' as string | null,
    busy: false,
    clock: 1_000_000,
    reloads: [] as string[],
    refreshed: 0,
    fetches: 0,
    marks: new Map<string, number>(),
  };
  const updater = createUpdater({
    current,
    fetchLatest: async () => {
      env.fetches++;
      return env.latest;
    },
    isBusy: () => env.busy,
    reload: (build) => env.reloads.push(build),
    lastReloadFor: (build) => env.marks.get(build) ?? null,
    markReloadFor: (build, at) => env.marks.set(build, at),
    onNewVersion: () => env.refreshed++,
    now: () => env.clock,
  });
  return { env, updater };
}

describe('updater', () => {
  it('does nothing while the running version is the latest', async () => {
    const { env, updater } = setup();
    expect(await updater.check()).toBe('latest');
    expect(env.reloads).toEqual([]);
    expect(updater.pending).toBe(false);
  });

  it('reloads right away when a new version is out and nothing is in progress', async () => {
    const { env, updater } = setup();
    env.latest = 'v2';
    expect(await updater.check()).toBe('updating');
    expect(env.reloads).toEqual(['v2']);
    expect(env.refreshed).toBe(1);
  });

  it('waits while a solve is in progress, and reloads once it is over', async () => {
    const { env, updater } = setup();
    env.latest = 'v2';
    env.busy = true;
    expect(await updater.check()).toBe('pending');
    expect(updater.pending).toBe(true);
    // 画面が切り替わっても、まだ解いている間は待つ
    updater.settle();
    expect(env.reloads).toEqual([]);
    env.busy = false;
    updater.settle();
    expect(env.reloads).toEqual(['v2']);
    // オフライン用のキャッシュの更新は、新しい版に気づいたときに1回だけ
    expect(env.refreshed).toBe(1);
  });

  it('does not reload when the version cannot be checked (offline)', async () => {
    const { env, updater } = setup();
    env.latest = null;
    expect(await updater.check()).toBe('unknown');
    updater.settle();
    expect(env.reloads).toEqual([]);
  });

  it('does not reload again and again when the reload still gave the old version', async () => {
    const { env, updater } = setup();
    env.latest = 'v2';
    await updater.check();
    expect(env.reloads).toEqual(['v2']);
    // 再読み込みしたのに、配信側のキャッシュが古くて、まだ v1 のまま開いた(同じタブなので、覚えている)
    const again = createUpdater({
      current: 'v1',
      fetchLatest: async () => env.latest,
      isBusy: () => false,
      reload: (build) => env.reloads.push(build),
      lastReloadFor: (build) => env.marks.get(build) ?? null,
      markReloadFor: (build, at) => env.marks.set(build, at),
      now: () => env.clock,
    });
    env.clock += 5000;
    expect(await again.check()).toBe('pending');
    expect(env.reloads).toEqual(['v2']);
    // 配信側のキャッシュが切れるころに、もう一度だけ試す
    env.clock += RELOAD_RETRY_MS;
    expect(await again.check()).toBe('updating');
    expect(env.reloads).toEqual(['v2', 'v2']);
  });

  it('lets the user force a retry from the settings screen', async () => {
    const { env, updater } = setup();
    env.latest = 'v2';
    env.marks.set('v2', env.clock - 1000);
    expect(await updater.check()).toBe('pending');
    expect(await updater.check({ force: true })).toBe('updating');
    expect(env.reloads).toEqual(['v2']);
  });

  it('skips checks made too soon after the last one, and shares a check in flight', async () => {
    const { env, updater } = setup();
    await updater.check();
    expect(env.fetches).toBe(1);
    env.clock += 10_000;
    await updater.check({ minIntervalMs: 60_000 });
    expect(env.fetches).toBe(1);
    env.clock += 60_000;
    const [a, b] = await Promise.all([updater.check({ minIntervalMs: 60_000 }), updater.check()]);
    expect([a, b]).toEqual(['latest', 'latest']);
    expect(env.fetches).toBe(2);
  });

  it('stops waiting when the new version is withdrawn', async () => {
    const { env, updater } = setup();
    env.latest = 'v2';
    env.busy = true;
    await updater.check();
    expect(updater.pending).toBe(true);
    env.latest = 'v1';
    expect(await updater.check()).toBe('latest');
    env.busy = false;
    updater.settle();
    expect(env.reloads).toEqual([]);
  });
});
