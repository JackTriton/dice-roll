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

export function showScreen(id: ScreenId): void {
  if (currentScreen !== id) leaveHandlers.get(currentScreen)?.();
  currentScreen = id;
  for (const el of document.querySelectorAll<HTMLElement>('.screen')) el.hidden = el.id !== `screen-${id}`;
  window.scrollTo(0, 0);
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
