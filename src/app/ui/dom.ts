export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
}

export type ScreenId = 'title' | 'play' | 'replay' | 'ranking' | 'howto' | 'settings' | 'admin';

let currentScreen: ScreenId = 'title';
const leaveHandlers = new Map<ScreenId, () => void>();

export function onLeave(id: ScreenId, fn: () => void): void {
  leaveHandlers.set(id, fn);
}

let screenListener: ((id: ScreenId) => void) | null = null;

/** 画面が切り替わったあとに呼ぶ処理を登録する(新しい版への切り替えの時機を決めるのに使う) */
export function onScreenChange(fn: (id: ScreenId) => void): void {
  screenListener = fn;
}

export function showScreen(id: ScreenId): void {
  if (currentScreen !== id) leaveHandlers.get(currentScreen)?.();
  currentScreen = id;
  for (const el of document.querySelectorAll<HTMLElement>('.screen')) el.hidden = el.id !== `screen-${id}`;
  window.scrollTo(0, 0);
  screenListener?.(id);
}

export const activeScreen = (): ScreenId => currentScreen;

let toastTimer = 0;
export function toast(message: string): void {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 2200);
}
