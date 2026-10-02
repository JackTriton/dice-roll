// 設定: 言語・ニックネーム・端末内の記録の消去。

import { validateNickname } from '../../core/nickname.ts';
import { apiEnabled, putProfile } from '../api.ts';
import { setLang, t, type Lang } from '../i18n/index.ts';
import { load, resetStats, save } from '../records.ts';
import { $, showScreen, toast } from '../ui/dom.ts';

export function initSettings(back: () => void): void {
  $('btn-settings-back').addEventListener('click', back);
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
}

export function showSettings(lang: Lang): void {
  const s = load();
  $<HTMLSelectElement>('lang-select').value = lang;
  $<HTMLInputElement>('settings-nick').value = s.nickname ?? '';
  $('settings-nick-status').textContent = '';
  $('device-id').textContent = s.deviceId.slice(0, 8);
  showScreen('settings');
}
