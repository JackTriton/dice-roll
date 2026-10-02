// ランキング画面

import type { Size } from '../../core/constants.ts';
import { apiEnabled, fetchRanking } from '../api.ts';
import { formatTime } from '../game/session.ts';
import { t } from '../i18n/index.ts';
import { load } from '../records.ts';
import { $, showScreen } from '../ui/dom.ts';

let size: Size = 3;
let seq = 0;

export function initRanking(back: () => void): void {
  $('btn-ranking-back').addEventListener('click', back);
  for (const b of document.querySelectorAll<HTMLButtonElement>('#ranking-tabs button'))
    b.addEventListener('click', () => {
      size = Number(b.dataset.size) as Size;
      void render();
    });
}

export function showRanking(): void {
  size = load().size;
  showScreen('ranking');
  void render();
}

async function render(): Promise<void> {
  const my = ++seq;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#ranking-tabs button'))
    b.setAttribute('aria-selected', String(Number(b.dataset.size) === size));
  const list = $('ranking-list');
  const status = $('ranking-status');
  const me = $('ranking-me');
  list.replaceChildren();
  me.textContent = '';
  status.hidden = false;
  if (!apiEnabled) {
    status.textContent = t('rankingDisabled');
    return;
  }
  if (!navigator.onLine) {
    status.textContent = t('rankingOffline');
    return;
  }
  status.textContent = '…';
  const r = await fetchRanking(size, load().deviceId);
  if (my !== seq) return;
  if (!r.ok) {
    status.textContent = r.status === 0 ? t('rankingOffline') : t('rankingUnavailable');
    return;
  }
  const d = r.data;
  me.textContent = d.me ? t('yourRank', { rank: d.me.rank, time: formatTime(d.me.timeMs) }) : t('notRanked');
  status.hidden = d.entries.length > 0;
  status.textContent = t('rankingEmpty');
  for (const e of d.entries) {
    const li = document.createElement('li');
    if (e.me) li.className = 'me';
    const cells = [
      ['rank', String(e.rank)],
      ['name', e.me ? `${e.nickname} (${t('you')})` : e.nickname],
      ['time', formatTime(e.timeMs)],
      ['moves', t('movesCount', { n: e.moves })],
    ];
    for (const [cls, text] of cells) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text; // ニックネームは textContent で入れる(HTML として解釈しない)
      li.append(span);
    }
    list.append(li);
  }
}
