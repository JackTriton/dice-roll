-- ランキング API のテーブル

CREATE TABLE players (
  device_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 発行した問題。提出されたら used = 1 にする。7日たったら Cron で消す
CREATE TABLE issued (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  scramble TEXT NOT NULL,
  optimal INTEGER,
  issued_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX issued_device ON issued(device_id, issued_at);
CREATE INDEX issued_at ON issued(issued_at);

-- 1人1件(盤の大きさごと)のベスト記録
CREATE TABLE scores (
  device_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  time_ms INTEGER NOT NULL,
  moves INTEGER NOT NULL,
  scramble_id TEXT NOT NULL,
  solution TEXT NOT NULL,
  times TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, size)
);
CREATE INDEX scores_rank ON scores(size, time_ms, created_at);

-- 受け付けなかった記録(しきい値の見直し用)。7日たったら Cron で消す
CREATE TABLE rejects (
  at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  size INTEGER,
  reason TEXT NOT NULL,
  time_ms INTEGER,
  moves INTEGER
);
CREATE INDEX rejects_at ON rejects(at);
