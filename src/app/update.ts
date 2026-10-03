// 新しい版への切り替え。
//
// 画面(HTML)は、つながっていればサーバーから取る(Service Worker の設定)ので、開き直せば新しい版になる。
// ここでは、開いたままの画面が新しい版に気づくための確認と、切り替え(再読み込み)の時機を決める:
//   - 版の番号(version.json)を、開いた直後・前面に戻ったとき・タイトルに戻ったとき・10分ごとに確かめる
//   - 新しい版が出ていたら再読み込みする。解いている途中やリプレイ・動画の作成中は待ち、終わってから行う
//   - 同じ版のための自動の再読み込みは、間をあける(配信側のキャッシュがまだ古いときに、繰り返さないように)

export interface UpdaterDeps {
  /** いま動いている版 */
  current: string;
  /** 配信されている最新の版(確かめられなければ null) */
  fetchLatest(): Promise<string | null>;
  /** いまは再読み込みしてはいけないか(解いている途中など) */
  isBusy(): boolean;
  /** 新しい版 build に切り替える(再読み込みする) */
  reload(build: string): void;
  /** その版のために、最後に自動で再読み込みした時刻(していなければ null)。タブを開いている間、覚えておく */
  lastReloadFor(build: string): number | null;
  markReloadFor(build: string, at: number): void;
  /** 新しい版が見つかったとき(オフライン用のキャッシュを新しくする) */
  onNewVersion?(): void;
  now(): number;
}

/** latest = 最新、updating = 切り替え中(再読み込みした)、pending = 新しい版があるが、いまは切り替えない、unknown = 確かめられなかった */
export type CheckResult = 'latest' | 'updating' | 'pending' | 'unknown';

/** 同じ版のために、自動でもう一度再読み込みするまでの間隔(配信側のキャッシュは 10 分で切れる) */
export const RELOAD_RETRY_MS = 11 * 60_000;

export interface Updater {
  /** 版を確かめる。minIntervalMs 以内に確かめていたら何もしない。force = 利用者が「確認」を押したとき */
  check(opts?: { minIntervalMs?: number; force?: boolean }): Promise<CheckResult>;
  /** 再読み込みしてよい状態になったかもしれないときに呼ぶ(画面が切り替わったとき) */
  settle(): void;
  /** 切り替え待ちの版があるか */
  readonly pending: boolean;
}

export function createUpdater(deps: UpdaterDeps): Updater {
  /** 切り替え待ちの版 */
  let target: string | null = null;
  let lastCheck = -Infinity;
  let inFlight: Promise<CheckResult> | null = null;

  function apply(): boolean {
    if (!target || deps.isBusy()) return false;
    deps.markReloadFor(target, deps.now());
    deps.reload(target);
    return true;
  }

  async function run(force: boolean): Promise<CheckResult> {
    lastCheck = deps.now();
    const latest = await deps.fetchLatest();
    if (!latest) return target ? 'pending' : 'unknown';
    if (latest === deps.current) {
      target = null;
      return 'latest';
    }
    // 再読み込みしたのにまだ古い版なら、配信側のキャッシュが古い。少し待ってから、もう一度だけ自動で試す
    const last = deps.lastReloadFor(latest);
    if (!force && last !== null && deps.now() - last < RELOAD_RETRY_MS) return 'pending';
    if (target !== latest) deps.onNewVersion?.();
    target = latest;
    return apply() ? 'updating' : 'pending';
  }

  return {
    check(opts = {}) {
      if (inFlight) return inFlight;
      if (!opts.force && deps.now() - lastCheck < (opts.minIntervalMs ?? 0))
        return Promise.resolve(target ? 'pending' : 'unknown');
      inFlight = run(!!opts.force).finally(() => (inFlight = null));
      return inFlight;
    },
    settle() {
      apply();
    },
    get pending() {
      return target !== null;
    },
  };
}

const RELOAD_KEY = 'diceroll.reloadedFor';
/** 再読み込みのときに URL に付ける印(配信側のキャッシュを避ける)。開いたあとで消す */
const VERSION_PARAM = 'v';

/** 再読み込みで付けた印を、URL から消す */
export function cleanVersionParam(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has(VERSION_PARAM)) return;
  url.searchParams.delete(VERSION_PARAM);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

/** ブラウザでの配線: Service Worker の登録と、版を確かめる時機 */
export function startUpdates(current: string, isBusy: () => boolean): Updater {
  let registration: ServiceWorkerRegistration | null = null;
  const updater = createUpdater({
    current,
    async fetchLatest() {
      try {
        // ブラウザと配信側のキャッシュを避けて、いまの版の番号を取る
        const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const body = (await res.json()) as { build?: unknown };
        return typeof body.build === 'string' ? body.build : null;
      } catch {
        return null;
      }
    },
    isBusy,
    reload(build) {
      const url = new URL(location.href);
      url.searchParams.set(VERSION_PARAM, build);
      location.replace(url.pathname + url.search + url.hash);
    },
    lastReloadFor(build) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null') as {
          build: string;
          at: number;
        } | null;
        return saved && saved.build === build ? saved.at : null;
      } catch {
        return null;
      }
    },
    markReloadFor(build, at) {
      try {
        sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ build, at }));
      } catch {
        // 覚えられなくても、切り替えはできる
      }
    },
    onNewVersion() {
      void registration?.update().catch(() => undefined);
    },
    now: () => Date.now(),
  });

  if ('serviceWorker' in navigator)
    navigator.serviceWorker
      .register('sw.js')
      .then((r) => (registration = r))
      .catch(() => undefined);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void updater.check({ minIntervalMs: 60_000 });
  });
  window.setInterval(() => {
    if (!document.hidden) void updater.check();
  }, 10 * 60_000);
  // 開いた直後にも確かめる(つながりにくくて、手元に持っていた古い画面で始まったときのため)
  window.setTimeout(() => void updater.check(), 3000);
  return updater;
}
