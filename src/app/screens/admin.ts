// 管理者画面(URL の末尾に #admin を付けて開く): ランキングと挑戦の一覧を見て、任意の挑戦をリプレイし、
// 不正と判断した記録を消す(BAN = ベスト記録を消してランキングから外す。以後の送信は受け付ける)。
// 文言は管理者向けなので日本語だけにしている。

import type { Size } from '../../core/constants.ts';
import {
  adminAttempt,
  adminAttempts,
  adminBest,
  adminDeleteScore,
  adminRanking,
  apiEnabled,
  getAdminToken,
  setAdminToken,
  type AdminAttemptSummary,
  type AdminRankingEntry,
  type AdminReplay,
  type ApiResult,
} from '../api.ts';
import { formatTime } from '../game/session.ts';
import { $, showScreen, toast } from '../ui/dom.ts';
import { showReplay } from './replay.ts';

type Tab = 'ranking' | 'attempts';
let tab: Tab = 'ranking';
let size: Size = 3;
/** 挑戦の一覧を、特定のプレイヤーに絞り込んでいるとき */
let player: { deviceId: string; nickname: string | null } | null = null;
let oldestId: number | null = null;
let seq = 0;

const REASONS: Record<string, string> = {
  bad_format: '形式の誤り',
  already_solved: '最初から揃っていた',
  illegal_move: '不正な手',
  solved_early: '途中で揃っていた',
  not_solved: '揃っていない',
  times_decreasing: '時刻の誤り',
  time_mismatch: 'タイムの誤り',
  too_fast: '速すぎる操作',
  too_fast_wall: 'タイムが経過時間を超えている',
  expired: '問題の期限切れ',
  used: '送信済みの問題',
};

const nameOf = (n: string | null) => n ?? '(名前なし)';
const dateOf = (ms: number) => new Date(ms).toLocaleString('ja-JP');
const movesText = (moves: number | null, optimal: number | null) =>
  moves === null ? '手順なし' : `${moves}手${optimal ? `(最短 ${optimal}手)` : ''}`;

export function initAdmin(nav: { back(): void }): void {
  $('btn-admin-back').addEventListener('click', nav.back);
  $('btn-admin-logout').addEventListener('click', () => {
    setAdminToken(null);
    showAdmin();
  });
  $('admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $<HTMLInputElement>('admin-token').value.trim();
    const status = $('admin-login-status');
    if (!token) return;
    status.textContent = '確かめています…';
    const r = await adminRanking(3, token);
    if (!r.ok) {
      status.textContent =
        r.status === 401
          ? 'トークンが違います'
          : r.status === 403
            ? 'サーバーで管理機能が有効になっていません'
            : `つながりませんでした(${r.error})`;
      return;
    }
    setAdminToken(token);
    $<HTMLInputElement>('admin-token').value = '';
    status.textContent = '';
    showAdmin();
  });
  for (const b of document.querySelectorAll<HTMLButtonElement>('#admin-tabs button'))
    b.addEventListener('click', () => {
      tab = b.dataset.tab as Tab;
      player = null;
      void render();
    });
  for (const b of document.querySelectorAll<HTMLButtonElement>('#admin-sizes button'))
    b.addEventListener('click', () => {
      size = Number(b.dataset.size) as Size;
      void render();
    });
  $('btn-admin-more').addEventListener('click', () => void loadAttempts(true));
}

export function showAdmin(): void {
  showScreen('admin');
  const token = apiEnabled ? getAdminToken() : null;
  $('admin-login').hidden = !apiEnabled || !!token;
  $('admin-body').hidden = !token;
  $('btn-admin-logout').hidden = !token;
  $('admin-login-status').textContent = apiEnabled ? '' : 'このサイトではランキングを使っていません';
  if (token) void render();
}

/** 401(トークンの誤り・変更)なら、ログイン画面に戻す */
function failed<T>(r: ApiResult<T>): boolean {
  if (r.ok) return false;
  if (r.status === 401 || r.status === 403) {
    setAdminToken(null);
    showAdmin();
    $('admin-login-status').textContent = 'トークンが違うか、変わりました。入れ直してください';
  } else $('admin-status').textContent = `読み込めませんでした(${r.error})`;
  return true;
}

async function render(): Promise<void> {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#admin-tabs button'))
    b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#admin-sizes button'))
    b.setAttribute('aria-selected', String(Number(b.dataset.size) === size));
  $('admin-filter').textContent =
    tab === 'attempts' && player
      ? `${nameOf(player.nickname)}(端末 ${player.deviceId.slice(0, 8)})の挑戦`
      : '';
  if (tab === 'ranking') await loadRanking();
  else await loadAttempts(false);
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn small${primary ? ' primary' : ''}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function row(head: string[], sub: string, actions: HTMLButtonElement[], rejected = false): HTMLLIElement {
  const li = document.createElement('li');
  if (rejected) li.className = 'rejected';
  const h = document.createElement('div');
  h.className = 'head';
  head.forEach((text, i) => {
    const el = document.createElement(i === 0 ? 'strong' : 'span');
    el.textContent = text; // ニックネームは textContent で入れる(HTML として解釈しない)
    h.append(el);
  });
  const s = document.createElement('div');
  s.className = 'sub';
  s.textContent = sub;
  const a = document.createElement('div');
  a.className = 'actions';
  a.append(...actions);
  li.append(h, s, a);
  return li;
}

async function loadRanking(): Promise<void> {
  const my = ++seq;
  const list = $('admin-list');
  list.replaceChildren();
  $('btn-admin-more').hidden = true;
  $('admin-status').textContent = '読み込んでいます…';
  const r = await adminRanking(size);
  if (my !== seq || failed(r) || !r.ok) return;
  $('admin-status').textContent = r.data.entries.length ? '' : 'まだ記録がありません';
  r.data.entries.forEach((e: AdminRankingEntry, i) => {
    list.append(
      row(
        [`${i + 1}位 ${nameOf(e.nickname)}`, `${formatTime(e.timeMs)}秒`, movesText(e.moves, e.optimal)],
        `${dateOf(e.createdAt)} · 挑戦 ${e.attempts} 回 · 端末 ${e.deviceId.slice(0, 8)}`,
        [
          button('ベストを再生', () => void openBest(e), true),
          button('挑戦の一覧', () => {
            tab = 'attempts';
            player = { deviceId: e.deviceId, nickname: e.nickname };
            void render();
          }),
          button('記録を消す', () => void deleteScore(e)),
        ],
      ),
    );
  });
}

async function loadAttempts(append: boolean): Promise<void> {
  const my = ++seq;
  const list = $('admin-list');
  if (!append) {
    list.replaceChildren();
    oldestId = null;
  }
  $('admin-status').textContent = '読み込んでいます…';
  const r = await adminAttempts({
    deviceId: player?.deviceId,
    size,
    before: append ? (oldestId ?? undefined) : undefined,
  });
  if (my !== seq || failed(r) || !r.ok) return;
  const items = r.data.attempts;
  $('admin-status').textContent = !append && items.length === 0 ? 'まだ挑戦の記録がありません' : '';
  for (const a of items as AdminAttemptSummary[]) {
    const verdict = a.accepted ? '受付' : `拒否: ${REASONS[a.reason ?? ''] ?? a.reason}`;
    list.append(
      row(
        [
          nameOf(a.nickname),
          a.timeMs === null ? '—' : `${formatTime(a.timeMs)}秒`,
          movesText(a.moves, a.optimal),
          verdict,
        ],
        `${dateOf(a.createdAt)} · ${a.size}×${a.size} · 端末 ${a.deviceId.slice(0, 8)} · #${a.id}`,
        [button('再生', () => void openAttempt(a.id), true)],
        !a.accepted,
      ),
    );
    oldestId = a.id;
  }
  $('btn-admin-more').hidden = items.length < 200;
}

async function openAttempt(id: number): Promise<void> {
  const r = await adminAttempt(id);
  if (failed(r) || !r.ok) return;
  openReplay(r.data);
}

async function openBest(e: AdminRankingEntry): Promise<void> {
  const r = await adminBest(e.deviceId, size);
  if (failed(r) || !r.ok) return;
  openReplay(r.data);
}

/** 不正の判断に使う数字(最短手数との差、1秒あたりの手数、操作の間隔) */
function analysis(r: AdminReplay, moves: string, times: number[]): string {
  const span = Math.max(1, times[times.length - 1] - times[0]) / 1000;
  const gaps = times
    .slice(1)
    .map((t, i) => t - times[i])
    .filter((g) => g > 0)
    .sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const lines = [
    `${nameOf(r.nickname)} · ${r.size}×${r.size} · ${dateOf(r.createdAt)}`,
    `タイム ${formatTime(r.timeMs ?? times[times.length - 1])}秒 · ${movesText(moves.length, r.optimal)}`,
    `1秒あたり ${(moves.length / span).toFixed(1)}手 · 操作の間隔 中央値 ${median}ms / 最短 ${gaps[0] ?? 0}ms · 操作 ${gaps.length + 1}回`,
  ];
  if (r.accepted === 0) lines.push(`受け付けなかった挑戦(${REASONS[r.reason ?? ''] ?? r.reason})`);
  lines.push(`端末 ${r.deviceId}`);
  return lines.join('\n');
}

function openReplay(r: AdminReplay): void {
  if (!r.moves || !r.times || r.times.length !== r.moves.length) {
    toast('この挑戦は手順が残っていないので再生できません');
    return;
  }
  showReplay(
    { scramble: r.scramble, moves: r.moves, times: r.times },
    { size: r.size, timeMs: r.timeMs ?? r.times[r.times.length - 1], moves: r.moves.length, rank: null },
    { back: () => showAdmin(), info: analysis(r, r.moves, r.times) },
  );
}

async function deleteScore(e: AdminRankingEntry): Promise<void> {
  if (
    !confirm(
      `${nameOf(e.nickname)} の ${size}×${size} のベスト記録(${formatTime(e.timeMs)}秒)を消して、ランキングから外しますか?`,
    )
  )
    return;
  const r = await adminDeleteScore(e.deviceId, size);
  if (failed(r) || !r.ok) return;
  toast(r.data.deleted ? '記録を消しました' : '記録は見つかりませんでした');
  void render();
}
