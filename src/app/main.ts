import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { decodeBoard } from '../core/board.ts';
import { detectLang, getLang, setLang } from './i18n/index.ts';
import { load } from './records.ts';
import { initAdmin, showAdmin } from './screens/admin.ts';
import { initHowto, showHowto } from './screens/howto.ts';
import { currentSession, initPlay, startGame, startTutorial, startWithBoard } from './screens/play.ts';
import { initRanking, showRanking } from './screens/ranking.ts';
import { initReplay, openVideoDialog, showReplay } from './screens/replay.ts';
import { initSettings, showSettings } from './screens/settings.ts';
import { initTitle, refreshTitle, showTitle } from './screens/title.ts';

const store = load();
setLang(store.lang ?? detectLang(navigator.language));

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
initSettings(() => {
  refreshTitle();
  showTitle();
});
initAdmin({
  back: () => {
    // #admin を URL から外してタイトルへ
    history.replaceState(null, '', location.pathname + location.search);
    showTitle();
  },
});

// URL の末尾が #admin なら管理者画面を開く
const route = () => (location.hash === '#admin' ? showAdmin() : showTitle());
window.addEventListener('hashchange', route);
route();

// 新しい版があれば、次に起動したときに切り替わる
if (import.meta.env.PROD) registerSW({ immediate: true });

// E2E テスト用のフック(VITE_E2E=1 でビルドしたときだけ有効)
if (import.meta.env.VITE_E2E === '1') {
  Object.assign(window, {
    __dice: {
      start(encoded: string) {
        const b = decodeBoard(encoded);
        if (b) startWithBoard(b);
      },
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
