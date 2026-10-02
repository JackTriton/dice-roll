// アイコン(PWA・favicon・apple-touch-icon)と OGP 画像を、Playwright の Chromium で HTML から書き出す。
//   node tools/make-assets.ts

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(PUBLIC, { recursive: true });

/** 赤い1の目のサイコロ(上の面と縁)の SVG。size は一辺のピクセル、pad は余白の割合 */
function dieSvg(size: number, pad: number, bg: string | null): string {
  const s = size;
  const m = s * pad;
  const w = s - m * 2;
  const r = w * 0.2;
  const inner = w * 0.14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    ${bg ? `<rect width="${s}" height="${s}" fill="${bg}"/>` : ''}
    <rect x="${m}" y="${m}" width="${w}" height="${w}" rx="${r}" fill="#e6e0d4" stroke="#b9b0a2" stroke-width="${s * 0.012}"/>
    <rect x="${m + inner}" y="${m + inner}" width="${w - inner * 2}" height="${w - inner * 2}" rx="${r * 0.7}" fill="#fffdf8"/>
    <circle cx="${s / 2}" cy="${s / 2}" r="${w * 0.17}" fill="#d4102a"/>
  </svg>`;
}

// Playwright 用の Chromium が無くても動くよう、Windows に入っている Edge を優先する
const browser = await chromium
  .launch({ channel: process.env.PW_CHANNEL ?? 'msedge' })
  .catch(() => chromium.launch());
const page = await browser.newPage();

async function shot(file: string, width: number, height: number, html: string) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${html}</body></html>`,
  );
  await page.screenshot({
    path: join(PUBLIC, file),
    omitBackground: true,
    clip: { x: 0, y: 0, width, height },
  });
  console.log(`wrote public/${file}`);
}

await shot('icon-192.png', 192, 192, dieSvg(192, 0.04, null));
await shot('icon-512.png', 512, 512, dieSvg(512, 0.04, null));
// maskable は円形などに切り抜かれるので、背景を塗って中央の安全領域に収める
await shot('icon-maskable-512.png', 512, 512, dieSvg(512, 0.2, '#f4efe6'));
await shot('apple-touch-icon.png', 180, 180, dieSvg(180, 0.1, '#f4efe6'));
await shot('favicon.png', 48, 48, dieSvg(48, 0.02, null));

// OGP 画像(1200×630): 3×3 の盤が全部1になった様子と題名
const dice = Array.from({ length: 9 }, (_, i) =>
  i === 8
    ? `<div style="width:120px;height:120px"></div>`
    : `<div style="width:120px;height:120px">${dieSvg(120, 0.06, null)}</div>`,
).join('');
await shot(
  'og.png',
  1200,
  630,
  `<div style="width:1200px;height:630px;background:#f4efe6;display:flex;align-items:center;gap:64px;padding:0 80px;box-sizing:border-box;font-family:'Yu Gothic UI','Hiragino Sans','Noto Sans JP',sans-serif;color:#2a2622">
     <div style="display:grid;grid-template-columns:repeat(3,120px);gap:12px;padding:20px;background:#d9cdb8;border-radius:28px">${dice}</div>
     <div>
       <div style="font-size:76px;font-weight:800;letter-spacing:2px">サイコロ8パズル</div>
       <div style="font-size:40px;font-weight:700;color:#7a7166;margin-top:8px">Dice Roll 8</div>
       <div style="font-size:40px;font-weight:700;margin-top:40px">転がして、全部<span style="color:#d4102a">1</span>に。</div>
       <div style="font-size:28px;color:#7a7166;margin-top:12px">Roll every die to show 1.</div>
     </div>
   </div>`,
);
await browser.close();
