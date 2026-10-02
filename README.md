# 🎲 サイコロ8パズル / Dice Roll 8

**転がして、全部1に。** サイコロのスライドパズルのタイムアタックです。

- 盤に同じサイコロと空きマスが1つ。スワイプすると、空きマスの隣のサイコロがその方向へ**転がり**、上の目が変わります
- 全部のサイコロの上を「1」にしたらクリア。3×3(8個)と 4×4(15個)
- どんな並べ方からでも必ず全部1にできます(3×3 は全 15,116,544 状態を総当たりで確認、4×4 は群の計算で証明)
- タイム順のオンラインランキング、結果の共有、実際の速さで再現したリプレイ動画(MP4)の保存、日本語 / 英語
- スマホのブラウザで、インストールなしで遊べます(ホーム画面に追加すればオフラインでも練習できます)

---

## 仕組み

```
GitHub Pages(静的サイト・PWA)  ──fetch──▶  Cloudflare Workers(ランキング API)── D1(SQLite)
  src/app   画面・描画・入力                    api/src  問題の発行・記録の検証・ランキング
  src/core  ルール・検証(両方で同じコード) ◀───┘
```

- ルール(転がり方・ゴール判定・記録の検証)は `src/core/` にまとめ、ブラウザと Worker が同じコードを使います。
- ランキングに載るプレイは、サーバーが問題を出し、送られてきた手順をサーバーで再生して確かめてから登録します。
- 3×3 の問題は、最短手数が 24〜34 手の盤面だけを集めた「問題プール」から出します(易しすぎる・難しすぎる問題を外して、運の差を小さくする)。

## ディレクトリ

| 場所 | 中身 |
|---|---|
| `src/core/` | ルール・スクランブル・記録の検証・3×3 の最短手数表(ブラウザ・Worker 共通) |
| `src/app/` | 画面・Canvas 描画・入力・タイマー・記録・多言語 |
| `src/video/` | リプレイ動画(WebCodecs + Mediabunny / MediaRecorder) |
| `api/` | ランキング API(Cloudflare Workers + D1) |
| `tools/` | 表・問題プール・アイコンの生成、可解性チェック、転送量チェック |
| `tests/` | 単体・API テスト(Vitest)、E2E テスト(Playwright) |
| `public/` | アイコン、OGP 画像、練習用の問題プール(`pool3.bin`) |

## 開発

Node.js 24 以上が必要です。

```bash
npm install
npm run dev          # 開発サーバー(http://localhost:5173)
npm test             # 単体テスト・API テスト
npm run typecheck    # 型チェック
npm run lint         # Lint
npm run build        # 本番ビルド(dist/)と、初回の転送量のチェック(1MB 以下)
npm run test:e2e     # E2E テスト(Windows の Edge を使う。PW_CHANNEL=chrome で Chrome に変えられる)
```

ランキングまで手元で試すとき:

```bash
npm run db:migrate:local                       # ローカルの D1 にテーブルを作る(初回だけ)
npm run dev:api                                # Worker を http://localhost:8787 で起動
VITE_API_BASE=http://localhost:8787 npm run dev
E2E_API=http://localhost:8787 npx playwright test ranked   # ランキングの通しテスト
```

### 表・問題プール・チェック

```bash
npm run build:table      # 3×3 の最短手数の表(tools/.cache/dist3.bin、約15MB、コミットしない)
npm run build:pools      # 問題プール: public/pool3.bin(5,000問)と api/data/pool3-server.bin(20万問、コミットしない)
npm run check:solvable   # ランダムな盤面 3×3・4×4 各1万問が、すべて全部1まで解けることを確かめる
npm run check:tutorial   # 練習問題の解答と「1個だけ揃っていないとき」の定石が最短であることを確かめる
npm run make:assets      # アイコンと OGP 画像を作り直す
```

---

## 公開する

### 1. ゲーム本体(GitHub Pages)

1. GitHub で**公開リポジトリ**を作ります(例: `dice-roll`)。
2. このフォルダ(`dice-roll/`)の中身を、そのリポジトリのルートに置いて `main` に push します。
   ```bash
   cd dice-roll
   git init -b main
   git add .
   git commit -m "first release"
   git remote add origin https://github.com/<ユーザー名>/dice-roll.git
   git push -u origin main
   ```
3. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
4. **Actions** タブで「Deploy to GitHub Pages」が成功すると、`https://<ユーザー名>.github.io/dice-roll/` で遊べます。

この時点では、ランキングなし(練習専用)で動きます。

### 2. ランキング API(Cloudflare Workers + D1、無料プラン)

クレジットカードの登録は要りません。

1. [Cloudflare](https://dash.cloudflare.com/sign-up) のアカウントを作ります。
2. ログインして、D1 データベースを作ります。
   ```bash
   npx wrangler login
   npx wrangler d1 create dice-roll
   ```
   表示された `database_id` を `api/wrangler.toml` の `database_id` に貼ります。
3. `api/wrangler.toml` の `ALLOWED_ORIGINS` を、Pages の URL のオリジン(例: `https://<ユーザー名>.github.io`)に書き換えます(手元の `wrangler dev` では `api/.dev.vars` の値が使われます)。
4. テーブルを作り、Worker を公開します。
   ```bash
   npm run db:migrate:remote
   npm run deploy:api        # 問題プールを作り直してからデプロイする
   ```
   表示された URL(例: `https://dice-roll-api.<サブドメイン>.workers.dev`)を控えます。
5. GitHub リポジトリの **Settings → Secrets and variables → Actions → Variables** に、`VITE_API_BASE` = 4 の URL を追加します。
6. **Actions** から「Deploy to GitHub Pages」を再実行すると、ランキングが有効になります。

### 無料枠について

- Workers: 1日10万リクエスト、D1: 1日の行の書き込み10万・読み取り500万まで(UTC 0時にリセット)。
- 1回のプレイで行の書き込みは約3回なので、1日およそ3万プレイまで受けられます。
- 上限を超えると API は 503 を返し、ゲームは「ランキングは一時停止中」と表示して練習として遊べます。

---

## 管理

記録やニックネームの削除は、管理画面ではなくコマンドで行います(`--remote` を付けると本番、付けないとローカル)。

```bash
# ニックネームから端末 ID を探す
npx wrangler d1 execute dice-roll --remote -c api/wrangler.toml \
  --command "SELECT device_id, nickname FROM players WHERE nickname LIKE '%探したい名前%'"

# その人の記録を消す(ランキングから外れる)
npx wrangler d1 execute dice-roll --remote -c api/wrangler.toml \
  --command "DELETE FROM scores WHERE device_id = '<端末ID>'"

# ニックネームを消す(次に送るときに登録し直しになる)
npx wrangler d1 execute dice-roll --remote -c api/wrangler.toml \
  --command "DELETE FROM players WHERE device_id = '<端末ID>'"

# 受け付けなかった記録の理由の内訳(直近7日)
npx wrangler d1 execute dice-roll --remote -c api/wrangler.toml \
  --command "SELECT reason, COUNT(*) FROM rejects GROUP BY reason"
```

### 不正対策のしきい値

- `src/core/constants.ts` の `MIN_AVG_GESTURE_MS`(1操作あたりの平均間隔の下限、初期値 60ms)。
- 速い人の正当な記録が `too_fast` で弾かれていたら(上の `rejects` で確認)、値を下げてデプロイし直します(`npm run deploy:api` と Pages の両方)。
- ボットによる自動操作は完全には防げません。不自然な記録は上のコマンドで削除してください。

## 名前を変えるとき

表示名は `src/app/i18n/ja.ts` / `en.ts` の `appName`、`src/core/constants.ts` の `APP_NAME`、`index.html` の `<title>` と OGP、`vite.config.ts` のマニフェストにあります。OGP 画像とアイコンは `tools/make-assets.ts` を直して `npm run make:assets` で作り直します。
