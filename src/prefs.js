/**
 * Применение настроек к странице и «цель дня».
 */

import { getSettings, getProfile, update, dayKey, dayStats } from './state.js';
import { play } from './sound.js';
import { t, tf } from './i18n.js';
import { toast } from './ui/dom.js';

/** Размер текста и анимации — атрибуты на <html>, всё остальное делает CSS. */
export function applyPrefs() {
  const s = getSettings();
  const h = document.documentElement;
  h.dataset.fs = s.fontSize || 'm';
  h.dataset.motion = s.motion === 'off' ? 'off' : 'on';
}

/** Сколько верных ответов сегодня. */
export const todayCorrect = () => (dayStats(getProfile())[dayKey()] || { c: 0 }).c;

/** После верного ответа: если цель дня выполнена — поздравляем (раз в день). */
export function checkDailyGoal() {
  const goal = Number(getSettings().dailyGoal) || 0;
  if (!goal) return;
  const today = dayKey();
  if (getProfile().goalDoneOn === today || todayCorrect() < goal) return;
  update((st) => { st.profile.goalDoneOn = today; });
  setTimeout(() => { play('goal'); toast(tf('set.goalDone', { n: goal })); }, 700);
}

/** Системное уведомление (если ученик разрешил и вкладка не на виду). */
export function systemNotify(title, body) {
  if (!getSettings().notifyBrowser || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try { new Notification(title, { body, icon: 'logo-mark.png', tag: 'nasstudy-msg' }); } catch { /* нет поддержки */ }
}

export const goalLabel = () => t('set.goalOff');
