import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { decodeBoard } from '../core/board.ts';
import { detectLang, getLang, setLang } from './i18n/index.ts';
import { load } from './records.ts';
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
  start: (size) => {
    // 初回は、遊び方を見てから始めてもらう
    if (!load().howtoSeen) showHowto();
    else void startGame(size);
  },
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

showTitle();

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
