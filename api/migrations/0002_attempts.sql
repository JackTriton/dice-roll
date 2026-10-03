-- 管理者画面でリプレイを見るためのテーブルと列(Q#28〜#31)

-- 送られてきた挑戦を、受け付けたかどうかにかかわらずすべて残す(90日たったら Cron で消す)
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  scramble_id TEXT NOT NULL,
  scramble TEXT NOT NULL,
  optimal INTEGER,
  moves TEXT,
  times TEXT,
  time_ms INTEGER,
  accepted INTEGER NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX attempts_created ON attempts(created_at);
CREATE INDEX attempts_device ON attempts(device_id, created_at);

-- ベスト記録の盤面と最短手数を、scores 自身にも持たせる(issued は7日で消えるため)
ALTER TABLE scores ADD COLUMN scramble TEXT;
ALTER TABLE scores ADD COLUMN optimal INTEGER;
UPDATE scores
SET scramble = (SELECT i.scramble FROM issued i WHERE i.id = scores.scramble_id),
    optimal = (SELECT i.optimal FROM issued i WHERE i.id = scores.scramble_id)
WHERE scramble IS NULL;
