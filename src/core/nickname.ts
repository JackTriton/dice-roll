// ニックネームの正規化と検査。ブラウザ(入力時)とサーバー(登録時)で同じ判定を使う。

import { NICKNAME_MAX } from './constants.ts';

// 明らかに不適切な語の小さなリスト(部分一致、大文字小文字・全角半角を区別しない)。
// 完全には防げないので、最終的には管理者が削除する(README 参照)。
const NG_WORDS = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'rape',
  'porn',
  'hitler',
  'nazi',
  'ちんこ',
  'ちんぽ',
  'まんこ',
  'せっくす',
  'セックス',
  'しね',
  '死ね',
  'ころす',
  '殺す',
  'きちがい',
  'キチガイ',
  'ガイジ',
  'がいじ',
  'レイプ',
];

export function normalizeNickname(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** 使えるなら正規化したニックネームを、使えなければ null を返す */
export function validateNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = normalizeNickname(raw);
  const length = [...s].length;
  if (length < 1 || length > NICKNAME_MAX) return null;
  // 制御文字・書式文字(ゼロ幅文字など)は使えない
  if (/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/u.test(s)) return null;
  const folded = s.toLowerCase().replace(/[\s._\-*]/g, '');
  const hira = folded.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  if (NG_WORDS.some((w) => folded.includes(w.toLowerCase()) || hira.includes(w))) return null;
  return s;
}
