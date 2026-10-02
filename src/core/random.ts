// 乱数。問題の生成には暗号論的な乱数を使い、テストやチュートリアルには再現できる乱数を使う。

export type Rng = () => number;

/** crypto.getRandomValues による [0, 1) の乱数(ブラウザと Worker の両方で使える) */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(64);
  let i = buf.length;
  return () => {
    if (i >= buf.length) {
      crypto.getRandomValues(buf);
      i = 0;
    }
    return buf[i++] / 2 ** 32;
  };
}

/** 種から決まる乱数(mulberry32) */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

export const randInt = (rng: Rng, n: number): number => Math.floor(rng() * n);
