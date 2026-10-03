// 結果の共有。Web Share API が使えればスマホの共有シート、使えなければクリップボードへ。

import type { Rule, Size } from '../core/constants.ts';
import { t } from './i18n/index.ts';
import { formatTime } from './game/session.ts';
import { sizeLabel } from './ui/labels.ts';

export function siteUrl(): string {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

export function shareText(p: {
  size: Size;
  rule?: Rule;
  timeMs: number;
  moves: number;
  rank: number | null;
}): string {
  const body = t('shareText', {
    app: t('appName'),
    size: sizeLabel(p.size, p.rule),
    time: formatTime(p.timeMs),
    moves: p.moves,
    rank: p.rank ? t('shareRank', { rank: p.rank }) : '',
  });
  return `${body} ${t('shareTag')}`;
}

export type ShareOutcome = 'shared' | 'copied' | 'canceled' | 'failed';

export async function shareResult(text: string, files?: File[]): Promise<ShareOutcome> {
  const url = siteUrl();
  const data: ShareData = { text, url };
  if (files?.length) data.files = files;
  if (navigator.share && (!files || navigator.canShare?.(data))) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'canceled';
    }
  }
  if (files?.length) return 'failed';
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
