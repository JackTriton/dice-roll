import './styles.css';
import { decodeBoard } from '../core/board.ts';
import type { Rule } from '../core/constants.ts';
import { detectLang, getLang, setLang } from './i18n/index.ts';
import type { ControlMode } from './input/gestures.ts';
import { load, save } from './records.ts';
import { initAdmin, showAdmin } from './screens/admin.ts';
import { initHowto, showHowto } from './screens/howto.ts';
import { currentSession, initPlay, startGame, startTutorial, startWithBoard } from './screens/play.ts';
import { initRanking, showRanking } from './screens/ranking.ts';
import { initReplay, openVideoDialog, showReplay } from './screens/replay.ts';
import { initSettings, showSettings } from './screens/settings.ts';
import { initTitle, refreshTitle, showTitle } from './screens/title.ts';
import { $, activeScreen, onScreenChange } from './ui/dom.ts';
import { cleanVersionParam, startUpdates } from './update.ts';

cleanVersionParam();
const store = load();
setLang(store.lang ?? detectLang(navigator.language));

// 新しい版への切り替え(本番のビルドだけ)。解いている途中・リプレイ・動画の作成中は、再読み込みを待つ
const updater = import.meta.env.PROD
  ? startUpdates(
      __BUILD_ID__,
      () => activeScreen() === 'play' || activeScreen() === 'replay' || !$('video-dialog').hidden,
    )
  : null;
onScreenChange((id) => {
  updater?.settle();
  if (id === 'title') void updater?.check({ minIntervalMs: 60_000 });
});

const toTitle = () => showTitle();

initTitle({
  // 初回でも遊び方は挟まず、すぐに始める(遊び方とチュートリアルはメニューから開ける)
  start: (size) => void startGame(size),
  howto: showHowto,
  ranking: showRanking,
  settings: () => showSettings(getLang()),
});
initPlay({
  title: toTitle,
  replay: showReplay,
  video: (log, meta) => void openVideoDialog(log, meta),
});
initReplay({ back: toTitle });
initRanking(toTitle);
initHowto({ back: toTitle, tutorial: () => startTutorial(0) });
initSettings(
  () => {
    refreshTitle();
    showTitle();
  },
  { build: __BUILD_ID__, check: updater ? () => updater.check({ force: true }) : null },
);
initAdmin({
  back: () => {
    // #admin を URL から外してタイトルへ
    history.replaceState(null, '', location.pathname + location.search);
    showTitle();
  },
});

// 操作が変わったことを、これまでの版から使っている人に一度だけ知らせる(その場で、これまでの操作に戻せる)
if (store.controlNotice) {
  const dialog = $('control-dialog');
  const choose = (control: ControlMode) => {
    save((s) => {
      s.control = control;
      s.controlNotice = false;
    });
    dialog.hidden = true;
  };
  $('btn-control-new').addEventListener('click', () => choose('blank'));
  $('btn-control-old').addEventListener('click', () => choose('dice'));
  dialog.hidden = false;
}

// URL の末尾が #admin なら管理者画面を開く
const route = () => (location.hash === '#admin' ? showAdmin() : showTitle());
window.addEventListener('hashchange', route);
route();

// E2E テスト用のフック(VITE_E2E=1 でビルドしたときだけ有効)
if (import.meta.env.VITE_E2E === '1') {
  Object.assign(window, {
    __dice: {
      start(encoded: string, rule: Rule = 'ones') {
        const b = decodeBoard(encoded);
        if (b) startWithBoard(b, 'practice', rule);
      },
      // 新しい版が出ていないかを、いますぐ確かめる(結果: latest / updating / pending / unknown)
      checkUpdate: () => updater?.check() ?? Promise.resolve('unknown'),
      session: () => {
        const s = currentSession();
        return (
          s && {
            phase: s.phase,
            moves: s.moves,
            times: s.times,
            scramble: s.scramble,
          }
        );
      },
    },
  });
}
