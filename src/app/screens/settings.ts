// 設定: 言語・ニックネーム・端末内の記録の消去。開発用の版では、ハードのサイコロの見た目も切り替えられる(見比べ用)。

import { alignedExample } from '../../core/aligned.ts';
import { validateNickname } from '../../core/nickname.ts';
import { apiEnabled, putProfile } from '../api.ts';
import { HARD_MODE, LOOK_LAB } from '../flags.ts';
import { setLang, t, type Lang } from '../i18n/index.ts';
import { load, resetStats, save } from '../records.ts';
import { BOARD_PALETTE, drawBoard } from '../render/boardView.ts';
import type { OneFigure, SideMark } from '../render/dieRenderer.ts';
import { $, showScreen, toast } from '../ui/dom.ts';
import type { CheckResult } from '../update.ts';

/** いまの版と、最新版の確認(確認できない版 = 開発サーバーでは null) */
export interface AppVersion {
  build: string;
  check: (() => Promise<CheckResult>) | null;
}

let version: AppVersion = { build: '', check: null };

export function initSettings(back: () => void, app: AppVersion): void {
  version = app;
  $('btn-settings-back').addEventListener('click', back);
  $('btn-update-check').hidden = !app.check;
  $('btn-update-check').addEventListener('click', async () => {
    if (!app.check) return;
    const status = $('update-status');
    status.textContent = t('updateChecking');
    const r = await app.check();
    status.textContent = t(
      r === 'latest' ? 'updateLatest' : r === 'unknown' ? 'updateUnknown' : 'updateSwitching',
    );
  });
  $<HTMLSelectElement>('lang-select').addEventListener('change', (e) => {
    const lang = (e.target as HTMLSelectElement).value as Lang;
    save((s) => (s.lang = lang));
    setLang(lang);
  });
  $('settings-nick-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('settings-nick-status');
    const nick = validateNickname($<HTMLInputElement>('settings-nick').value);
    if (!nick) {
      status.textContent = t('invalidNickname');
      return;
    }
    if (apiEnabled) {
      const r = await putProfile(load().deviceId, nick);
      if (!r.ok) {
        status.textContent = r.error === 'invalid_nickname' ? t('invalidNickname') : t('submitFailed');
        return;
      }
    }
    save((s) => (s.nickname = nick));
    $<HTMLInputElement>('settings-nick').value = nick;
    status.textContent = t('saved');
  });
  $('btn-reset').addEventListener('click', () => {
    if (confirm(t('resetConfirm'))) {
      resetStats();
      toast(t('saved'));
    }
  });
  $('look-settings').hidden = !(HARD_MODE && LOOK_LAB);
  // 向きの分かる目印が1つも無い組み合わせ(2の面の目印なし + 1は丸)にはしない: もう一方を付ける
  $<HTMLSelectElement>('look-side').addEventListener('change', (e) => {
    const side = (e.target as HTMLSelectElement).value as SideMark;
    save((s) => (s.look = { side, one: side === 'none' && s.look.one === 'dot' ? 'tri' : s.look.one }));
    showLook();
  });
  $<HTMLSelectElement>('look-one').addEventListener('change', (e) => {
    const one = (e.target as HTMLSelectElement).value as OneFigure;
    save((s) => (s.look = { side: one === 'dot' && s.look.side === 'none' ? 'bar' : s.look.side, one }));
    showLook();
  });
}

function showLook(): void {
  const { look } = load();
  $<HTMLSelectElement>('look-side').value = look.side;
  $<HTMLSelectElement>('look-one').value = look.one;
  drawLookPreview();
}

/** いまの見た目で、見本の盤(2個だけ向きが違う盤)を描く */
function drawLookPreview(): void {
  const canvas = $<HTMLCanvasElement>('look-preview');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const css = canvas.getBoundingClientRect().width || 200;
  canvas.width = canvas.height = Math.floor(css * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, css, css);
  drawBoard(ctx, 0, 0, css, { board: alignedExample(3, 'near'), moving: [], t: 0 }, BOARD_PALETTE, {
    ...load().look,
    upright: true,
  });
}

export function showSettings(lang: Lang): void {
  const s = load();
  $<HTMLSelectElement>('lang-select').value = lang;
  $<HTMLInputElement>('settings-nick').value = s.nickname ?? '';
  $('settings-nick-status').textContent = '';
  $('device-id').textContent = s.deviceId.slice(0, 8);
  // 版は、ビルドした日時で表す
  const built = new Date(version.build);
  $('app-version').textContent = Number.isNaN(built.getTime()) ? version.build : built.toLocaleString(lang);
  $('update-status').textContent = '';
  showScreen('settings');
  if (HARD_MODE && LOOK_LAB) showLook();
}
