import { en } from './en.ts';
import { ja, type Messages } from './ja.ts';

export type Lang = 'ja' | 'en';
export type MessageKey = keyof Messages;

const DICTS: Record<Lang, Messages> = { ja, en };
let current: Lang = 'ja';

export function detectLang(navLang: string | undefined): Lang {
  return navLang && navLang.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  document.title = DICTS[lang].appName;
  // data-i18n 属性の付いた要素を書き換える
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]'))
    el.textContent = t(el.dataset.i18n as MessageKey);
  for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]'))
    el.placeholder = t(el.dataset.i18nPlaceholder as MessageKey);
}

export const getLang = (): Lang => current;

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const s = DICTS[current][key] ?? ja[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
