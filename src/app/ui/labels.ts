import type { Rule, Size } from '../../core/constants.ts';
import { t } from '../i18n/index.ts';

/** 盤の大きさとルールの表示(例: 「3×3」「3×3 ハード」) */
export const sizeLabel = (size: Size, rule: Rule = 'ones'): string =>
  t(size === 3 ? 'sizeShort3' : 'sizeShort4') + (rule === 'aligned' ? ` ${t('ruleAligned')}` : '');
