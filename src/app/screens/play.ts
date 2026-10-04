// プレイ画面: タイムアタック(ランキング / 練習)とチュートリアル。結果の表示と送信もここで行う。

import { decodeBoard, tapToMoves, type Board } from '../../core/board.ts';
import type { Rule, Size } from '../../core/constants.ts';
import type { Move } from '../../core/dice.ts';
import { validateNickname } from '../../core/nickname.ts';
import { cryptoRng } from '../../core/random.ts';
import { solveTime, type SolveLog } from '../../core/replay.ts';
import { makeScramble } from '../../core/scramble.ts';
import { TUTORIAL, tutorialBoard } from '../../core/tutorial.ts';
import { verifySolve } from '../../core/verify.ts';
import { apiEnabled, prefetchScramble, putProfile, submitSolve, takeScramble } from '../api.ts';
import { formatTime, Session, type SessionInfo } from '../game/session.ts';
import { t, type MessageKey } from '../i18n/index.ts';
import { attachGestures, keyToMove, SWIPE_RATIO } from '../input/gestures.ts';
import { activeRule, load, lookFor, recordSolve, save } from '../records.ts';
import { BoardView } from '../render/boardView.ts';
import { LiveAnimator } from '../render/frame.ts';
import { shareResult, shareText } from '../share.ts';
import { toArrows } from '../ui/arrows.ts';
import { $, activeScreen, onLeave, showScreen, toast } from '../ui/dom.ts';
import { sizeLabel } from '../ui/labels.ts';

export interface PlayNav {
  title(): void;
  replay(log: SolveLog, meta: ResultMeta): void;
  video(log: SolveLog, meta: ResultMeta): void;
}

export interface ResultMeta {
  size: Size;
  rule: Rule;
  timeMs: number;
  moves: number;
  rank: number | null;
}

let nav: PlayNav;
let view: BoardView;
let session: Session | null = null;
let animator: LiveAnimator | null = null;
let raf = 0;
let tutorialIndex = -1;
let lastResult: { log: SolveLog; meta: ResultMeta } | null = null;
let pool3: Uint8Array | null = null;
/** 練習問題の「答えを見る」で解答を再生している間は、指での操作を受け付けない */
let showingAnswer = false;
let answerTimers: number[] = [];

function clearAnswer(): void {
  for (const id of answerTimers) clearTimeout(id);
  answerTimers = [];
  showingAnswer = false;
}
let poolPromise: Promise<void> | null = null;

function loadPool(): Promise<void> {
  poolPromise ??= fetch('pool3.bin')
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => {
      pool3 = new Uint8Array(b);
    })
    .catch(() => {
      pool3 = null;
    });
  return poolPromise;
}

export function initPlay(n: PlayNav): void {
  nav = n;
  view = new BoardView($<HTMLCanvasElement>('board'));
  attachGestures($('board-wrap'), {
    control: () => load().control,
    threshold: () => view.cellPx(session?.info.size ?? 3) * SWIPE_RATIO,
    cellAt: (x, y) => view.cellAt(x, y, session?.info.size ?? 3),
    cellPos: (x, y) => view.cellPos(x, y, session?.info.size ?? 3),
    blank: () => (session ? { size: session.board.size, blank: session.board.blank } : null),
    onMove: (m, time) => handleMoves([m], time),
    onTap: (cell, time) => session && handleMoves(tapToMoves(session.board, cell), time),
    onBlankTo: (cell, time) => session && handleMoves(tapToMoves(session.board, cell), time),
  });
  window.addEventListener('keydown', (e) => {
    if (activeScreen() !== 'play') return;
    const m = keyToMove(e.key, load().control);
    if (m && $('result').hidden) {
      e.preventDefault();
      handleMoves([m], performance.now());
    } else if (
      (e.key === 'Enter' || e.key === ' ') &&
      !$('result').hidden &&
      document.activeElement?.tagName !== 'INPUT'
    ) {
      e.preventDefault();
      $('btn-again').click();
    }
  });
  window.addEventListener('resize', () => view.resize());
  // 離れている間も計測は続く(スリープで時計が止まる端末の補正は Session が行う)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) session?.hide(performance.now(), Date.now());
    else session?.show(performance.now(), Date.now());
  });

  $('btn-retire').addEventListener('click', () => {
    session?.retire(performance.now());
    stopLoop();
    nav.title();
  });
  $('btn-again').addEventListener('click', () => {
    if (session) void startGame(session.info.size, session.info.rule);
  });
  $('btn-to-title').addEventListener('click', () => nav.title());
  $('btn-share').addEventListener('click', async () => {
    if (!lastResult) return;
    const outcome = await shareResult(shareText(lastResult.meta));
    if (outcome === 'copied') toast(t('copied'));
  });
  $('btn-replay').addEventListener('click', () => lastResult && nav.replay(lastResult.log, lastResult.meta));
  $('btn-video').addEventListener('click', () => lastResult && nav.video(lastResult.log, lastResult.meta));
  $('nick-form').addEventListener('submit', (e) => {
    e.preventDefault();
    void submitWithNickname();
  });
  $('btn-nick-skip').addEventListener('click', () => ($('nick-form').hidden = true));

  $('btn-tut-retry').addEventListener('click', () => startTutorial(tutorialIndex));
  $('btn-tut-answer').addEventListener('click', showTutorialAnswer);
  $('btn-tut-next').addEventListener('click', () => {
    if (tutorialIndex + 1 < TUTORIAL.length) startTutorial(tutorialIndex + 1);
    else void startGame(load().size);
  });
  $('btn-tut-skip').addEventListener('click', () => void startGame(load().size));
  onLeave('play', () => {
    clearAnswer();
    stopLoop();
  });
  void loadPool();
}

function resetUi(info: SessionInfo) {
  $('result').hidden = true;
  $('nick-form').hidden = true;
  $('board-wrap').classList.remove('solved');
  const mode = $('play-mode');
  mode.textContent = t(
    info.mode === 'ranked' ? 'modeRanked' : info.mode === 'practice' ? 'modePractice' : 'modeTutorial',
  );
  mode.className = `badge ${info.mode}`;
  $('play-size').textContent = sizeLabel(info.size, info.rule);
  view.look = lookFor(info.rule);
  $('tutorial-bar').hidden = info.mode !== 'tutorial';
  $('btn-tut-next').hidden = true;
  // 隠しても場所は残し、上の段の並び(左・中央・右)を崩さない
  $('btn-retire').style.visibility = info.mode === 'tutorial' ? 'hidden' : '';
  $('timer').className = 'timer ready';
}

function begin(info: SessionInfo, board: Board) {
  session = new Session(info, board);
  animator = new LiveAnimator(board);
  resetUi(info);
  view.resize();
  startLoop();
}

/** タイムアタックを始める。オンラインならサーバーの問題(ランキング)、そうでなければ端末の問題(練習) */
export async function startGame(size: Size, rule: Rule = activeRule()): Promise<void> {
  clearAnswer();
  tutorialIndex = -1;
  stopLoop();
  session = null;
  showScreen('play');
  resetUi({ size, rule, mode: 'practice', scrambleId: null });
  $('play-hint').textContent = t('preparing');
  $('timer').textContent = '0.00';
  $('play-moves').textContent = t('movesCount', { n: 0 });
  view.resize();
  const store = load();
  let info: SessionInfo | null = null;
  let board: Board | null = null;
  const online = apiEnabled && navigator.onLine;
  if (online) {
    const s = await takeScramble(store.deviceId, size, rule);
    const b = s && decodeBoard(s.scramble);
    // サーバーがそのルールに対応していなければ(ハードを受け付けない設定など)、端末の問題にする
    if (s && b && b.size === size && (s.rule ?? 'ones') === rule) {
      info = { size, rule, mode: 'ranked', scrambleId: s.scrambleId };
      board = b;
    }
  }
  if (!info || !board) {
    await loadPool();
    const sc = makeScramble(size, cryptoRng(), pool3, rule);
    info = { size, rule, mode: 'practice', scrambleId: null };
    board = sc.board;
  }
  if (activeScreen() !== 'play') return;
  begin(info, board);
  // 次の回の問題を先読みしておく
  if (online) void prefetchScramble(store.deviceId, size, rule);
}

export function startTutorial(index: number): void {
  clearAnswer();
  stopLoop();
  tutorialIndex = index;
  showScreen('play');
  const p = TUTORIAL[index];
  begin({ size: 3, rule: 'ones', mode: 'tutorial', scrambleId: null }, tutorialBoard(p));
  // 最初の練習問題の説明は、操作に合わせる
  const hint = p.hint === 'tut1' && load().control === 'blank' ? 'tut1Blank' : p.hint;
  $('play-hint').textContent = `${t('tutorialN', { n: index + 1 })} — ${t(hint)}`;
  $('timer').textContent = '';
}

/** 練習問題の解答を、盤の上でゆっくり再生する */
function showTutorialAnswer(): void {
  const index = tutorialIndex;
  if (index < 0) return;
  startTutorial(index);
  showingAnswer = true;
  const p = TUTORIAL[index];
  $('play-hint').textContent =
    `${t('tutorialN', { n: index + 1 })} — ${t('answerLabel', { moves: toArrows(p.solution) })}`;
  [...p.solution].forEach((m, i) => {
    answerTimers.push(
      window.setTimeout(() => handleMoves([m as Move], performance.now(), true), 700 + i * 450),
    );
  });
}

function handleMoves(moves: readonly Move[], time: number, fromAnswer = false): void {
  if (!session || !animator || moves.length === 0) return;
  if (showingAnswer && !fromAnswer) return;
  if (session.phase === 'done' || session.phase === 'retired') return;
  const applied = session.input(moves, time);
  if (applied.length === 0) return;
  animator.push(applied, time);
  $('play-moves').textContent = t('movesCount', { n: session.moves.length });
  if (session.solved) onSolved();
}

function startLoop() {
  cancelAnimationFrame(raf);
  const step = () => {
    raf = requestAnimationFrame(step);
    if (!session || !animator) return;
    const now = performance.now();
    const timer = $('timer');
    if (session.info.mode !== 'tutorial') {
      timer.textContent = formatTime(session.elapsed(now));
      timer.className = `timer ${session.phase === 'ready' ? 'ready' : session.phase === 'done' ? 'done' : ''}`;
      $('play-hint').textContent =
        session.phase === 'ready'
          ? t(session.info.rule === 'aligned' ? 'readyHintAligned' : 'readyHint')
          : '';
    }
    view.draw(animator.frame(now));
  };
  raf = requestAnimationFrame(step);
}

function stopLoop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

function onSolved(): void {
  if (!session) return;
  const s = session;
  $('board-wrap').classList.add('solved');
  if (s.info.mode === 'tutorial') {
    if (showingAnswer) {
      const p = TUTORIAL[tutorialIndex];
      $('play-hint').textContent = `${t('answerLabel', { moves: toArrows(p.solution) })} ${t('answerDone')}`;
      showingAnswer = false;
    } else
      $('play-hint').textContent = tutorialIndex + 1 < TUTORIAL.length ? t('tutNice') : t('tutorialDone');
    const next = $('btn-tut-next');
    next.textContent = tutorialIndex + 1 < TUTORIAL.length ? t('next') : t('playNow');
    next.hidden = false;
    return;
  }
  const log = s.log();
  const timeMs = solveTime(log);
  const outcome = recordSolve(s.info.size, log, timeMs);
  lastResult = {
    log,
    meta: { size: s.info.size, rule: s.info.rule, timeMs, moves: log.moves.length, rank: null },
  };

  // 最後の転がりが見えてから結果を出す
  setTimeout(() => {
    if (session !== s) return;
    $('result-time').textContent = `${formatTime(timeMs)}${t('seconds')}`;
    const parts = [`${t('moves')} ${log.moves.length}${t('movesUnit')}`];
    if (outcome.ao5 !== null) parts.push(`${t('ao5')} ${formatTime(outcome.ao5)}`);
    $('result-detail').textContent = parts.join(' · ');
    const flag = $('result-flag');
    flag.hidden = !outcome.newBest;
    flag.textContent = t('newBest');
    $('result-rank').hidden = true;
    const note = $('result-note');
    note.hidden = s.info.mode !== 'practice';
    note.textContent = t('practiceNote');
    $('result').hidden = false;
    if (s.info.mode === 'ranked') {
      const nick = load().nickname;
      if (nick) void submit(s, log, timeMs);
      else {
        $('nick-form').hidden = false;
        $<HTMLInputElement>('nick-input').value = '';
      }
    }
  }, 260);
}

async function submitWithNickname(): Promise<void> {
  const input = $<HTMLInputElement>('nick-input');
  const nick = validateNickname(input.value);
  if (!nick) {
    toast(t('invalidNickname'));
    return;
  }
  const store = load();
  const r = await putProfile(store.deviceId, nick);
  if (!r.ok) {
    toast(r.error === 'invalid_nickname' ? t('invalidNickname') : t('submitFailed'));
    return;
  }
  save((st) => (st.nickname = r.data.nickname));
  $('nick-form').hidden = true;
  if (session && lastResult) await submit(session, lastResult.log, lastResult.meta.timeMs);
}

async function submit(s: Session, log: SolveLog, timeMs: number): Promise<void> {
  if (!s.info.scrambleId) return;
  const rank = $('result-rank');
  rank.hidden = false;
  rank.textContent = t('submitting');
  // 送る前に、サーバーと同じ検証をかけておく
  const local = verifySolve({
    scramble: log.scramble,
    moves: log.moves,
    times: log.times,
    timeMs,
    rule: s.info.rule,
  });
  if (!local.ok) {
    rank.textContent = t('rejected', { reason: t(`rejectReason_${local.reason}` as MessageKey) });
    return;
  }
  // 端末のニックネームも添える。サーバーに未登録なら(ランキングにつなぐ前に設定で保存した場合など)その場で登録される
  const store = load();
  const r = await submitSolve({
    deviceId: store.deviceId,
    scrambleId: s.info.scrambleId,
    moves: log.moves,
    times: log.times,
    timeMs,
    nickname: store.nickname ?? undefined,
  });
  if (session !== s) return;
  if (!r.ok) {
    if (r.error === 'nickname_required' || r.error === 'invalid_nickname') {
      // ニックネームを入れ直してもらう(問題はまだ使われていないので、そのまま送り直せる)
      if (r.error === 'invalid_nickname') save((st) => (st.nickname = null));
      rank.hidden = true;
      $<HTMLInputElement>('nick-input').value = '';
      $('nick-form').hidden = false;
      if (r.error === 'invalid_nickname') toast(t('invalidNickname'));
      return;
    }
    rank.textContent =
      r.status === 503
        ? t('rankingPaused')
        : r.status === 0
          ? t('submitFailed')
          : t('submitError', { code: `${r.status} ${r.error}` });
    return;
  }
  const d = r.data;
  if (!d.accepted) {
    const key = `rejectReason_${d.reason}` as MessageKey;
    rank.textContent = t('rejected', { reason: t(key) === key ? d.reason : t(key) });
    return;
  }
  rank.textContent = d.best
    ? t('rankLine', { rank: d.rank, total: d.total })
    : t('rankNotBest', { best: formatTime(d.bestTimeMs), rank: d.rank, total: d.total });
  if (lastResult) lastResult.meta.rank = d.rank;
}

/** E2E テスト用: 指定の盤面で始める */
export function startWithBoard(
  board: Board,
  mode: SessionInfo['mode'] = 'practice',
  rule: Rule = 'ones',
): void {
  clearAnswer();
  stopLoop();
  tutorialIndex = -1;
  showScreen('play');
  begin({ size: board.size, rule, mode, scrambleId: null }, board);
}

export const currentSession = (): Session | null => session;
