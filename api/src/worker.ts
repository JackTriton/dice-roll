// Cloudflare Workers の入口。D1・問題プール・環境変数を app.ts に渡すだけ。

import pool3 from '../data/pool3-server.bin';
import { cryptoRng } from '../../src/core/random.ts';
import { createApp } from './app.ts';

export interface Env {
  DB: D1Database;
  /** 許可するオリジン(カンマ区切り)。例: https://<user>.github.io */
  ALLOWED_ORIGINS: string;
  /** 管理用 API の合言葉(`wrangler secret put ADMIN_TOKEN` で設定する秘密)。無ければ管理用 API は使えない */
  ADMIN_TOKEN?: string;
}

function appFor(env: Env) {
  return createApp({
    db: env.DB,
    pool3: new Uint8Array(pool3),
    now: () => Date.now(),
    rng: cryptoRng(),
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
    cache: caches.default,
    adminToken: env.ADMIN_TOKEN || undefined,
  });
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return appFor(env).fetch(req);
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await appFor(env).cleanup();
  },
} satisfies ExportedHandler<Env>;
