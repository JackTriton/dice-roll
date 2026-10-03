-- ハード(正立に揃える)のランキング: 問題・挑戦・ベスト記録に、ルール(ones = ふつう / aligned = ハード)を持たせる

ALTER TABLE issued ADD COLUMN rule TEXT NOT NULL DEFAULT 'ones';
ALTER TABLE attempts ADD COLUMN rule TEXT NOT NULL DEFAULT 'ones';

-- ベスト記録は「1人・盤の大きさ・ルールごとに1件」にする。主キーが変わるので、表を作り直して移す
-- (これまでの記録は、すべて ones)
CREATE TABLE scores_v2 (
  device_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  rule TEXT NOT NULL DEFAULT 'ones',
  time_ms INTEGER NOT NULL,
  moves INTEGER NOT NULL,
  scramble_id TEXT NOT NULL,
  solution TEXT NOT NULL,
  times TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  scramble TEXT,
  optimal INTEGER,
  PRIMARY KEY (device_id, size, rule)
);
INSERT INTO scores_v2 (device_id, size, rule, time_ms, moves, scramble_id, solution, times, created_at, scramble, optimal)
  SELECT device_id, size, 'ones', time_ms, moves, scramble_id, solution, times, created_at, scramble, optimal
  FROM scores;
DROP TABLE scores;
ALTER TABLE scores_v2 RENAME TO scores;
CREATE INDEX scores_rank ON scores(rule, size, time_ms, created_at);
