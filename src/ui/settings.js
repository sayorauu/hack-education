/**
 * Страница «Настройки»: звук, внешний вид, учёба, Капи, уведомления,
 * приватность и данные. Всё сохраняется на устройстве (и в облаке вместе
 * с профилем, если ученик вошёл).
 */

import { icon } from './icons.js';
import { t, tf, LANGS } from '../i18n.js';
import { getProfile, getSettings, update } from '../state.js';
import { header, esc, navIcon } from './kit.js';
import { action, toast } from './dom.js';
import { play } from '../sound.js';
import { applyPrefs, todayCorrect } from '../prefs.js';
import { isLoggedIn, pushPublicCard } from '../cloud/auth.js';

const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), getSettings());
function set(path, v) {
  update((s) => {
    const ks = path.split('.');
    let o = s.settings;
    ks.slice(0, -1).forEach((k) => { o[k] = { ...(o[k] || {}) }; o = o[k]; });
    o[ks.at(-1)] = v;
  });
}

const sw = (path, label, sub = '', extra = '') => {
  const on = get(path) !== false && get(path) !== 'off';
  return `<div class="set-row">
    <span class="set-txt"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span>
    ${extra}
    <button class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-act="set-toggle" data-k="${path}"><i></i></button>
  </div>`;
};
const chips = (path, opts, cls = '') => `<div class="chips set-chips ${cls}">${opts.map(([v, label]) => `<button class="chip ${String(get(path)) === String(v) ? 'on' : ''}" data-act="set-pick" data-k="${path}" data-v="${v}">${label}</button>`).join('')}</div>`;
const card = (ic, tint, title, body, id = '') => `<section class="panel set-card" ${id ? `id="${id}"` : ''}><div class="set-head"><span class="set-ic t-${tint}">${ic}</span><h2>${title}</h2></div>${body}</section>`;
const test = (name) => `<button class="set-play" data-act="set-test" data-id="${name}" aria-label="${esc(t('set.listen'))}" title="${esc(t('set.listen'))}">${icon('play', 13)}</button>`;

const GEAR = '<svg class="nav-ic" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path opacity=".35" d="M10.3 2.5h3.4l.6 2.6 1.9.8 2.3-1.4 2.4 2.4-1.4 2.3.8 1.9 2.6.6v3.4l-2.6.6-.8 1.9 1.4 2.3-2.4 2.4-2.3-1.4-1.9.8-.6 2.6h-3.4l-.6-2.6-1.9-.8-2.3 1.4-2.4-2.4 1.4-2.3-.8-1.9-2.6-.6v-3.4l2.6-.6.8-1.9-1.4-2.3 2.4-2.4 2.3 1.4 1.9-.8z"/><circle cx="12" cy="12" r="3.6"/></svg>';
export const gearIcon = () => GEAR;

export function renderSettings() {
  const s = getSettings();
  const snd = s.sound || {};
  const goal = Number(s.dailyGoal) || 0;
  const done = todayCorrect();
  const notifState = !('Notification' in window) ? 'na' : Notification.permission;
  const vol = Math.round((snd.vol ?? 0.6) * 100);

  return `
    ${header(t('set.title'), t('set.sub'))}
    <div class="set-grid">
      ${card(icon('sound', 20), 'lilac', t('set.sound'), `
        ${sw('sound.on', t('set.soundOn'), t('set.soundOnB'))}
        <div class="set-row set-vol ${snd.on === false ? 'off' : ''}">
          <span class="set-txt"><b>${t('set.volume')}</b></span>
          <input type="range" min="0" max="100" step="5" value="${vol}" id="setVol" aria-label="${esc(t('set.volume'))}" style="--v:${vol}%">
          <output id="setVolOut">${vol}%</output>
        </div>
        <div class="set-sub ${snd.on === false ? 'off' : ''}">
          ${sw('sound.answers', t('set.sAnswers'), t('set.sAnswersB'), test('correct'))}
          ${sw('sound.progress', t('set.sProgress'), t('set.sProgressB'), test('levelUp'))}
          ${sw('sound.notify', t('set.sNotify'), t('set.sNotifyB'), test('message'))}
        </div>`)}

      ${card(icon('sun', 20), 'cream', t('set.look'), `
        <div class="set-block"><b>${t('profile.theme')}</b>
          <div class="chips set-chips"><button class="chip ${s.theme === 'light' ? 'on' : ''}" data-act="theme-set" data-id="light">${icon('sun', 15)} ${t('profile.light')}</button>
          <button class="chip ${s.theme === 'dark' ? 'on' : ''}" data-act="theme-set" data-id="dark">${icon('moon', 15)} ${t('profile.dark')}</button></div></div>
        <div class="set-block"><b>${t('profile.lang')}</b>
          <div class="chips set-chips">${LANGS.map((l) => `<button class="chip ${s.lang === l.id ? 'on' : ''}" data-act="lang" data-id="${l.id}">${l.label}</button>`).join('')}</div></div>
        <div class="set-block"><b>${t('set.font')}</b>
          ${chips('fontSize', [['s', '<span class="fs-a s">Аа</span>'], ['m', '<span class="fs-a m">Аа</span>'], ['l', '<span class="fs-a l">Аа</span>'], ['xl', '<span class="fs-a xl">Аа</span>']], 'fs-chips')}</div>
        ${sw('motion', t('set.motion'), t('set.motionB'))}`)}

      ${card(navIcon('book'), 'mint', t('set.study'), `
        <div class="set-block"><b>${t('set.goal')}</b><small>${t('set.goalB')}</small>
          ${chips('dailyGoal', [[3, '3'], [5, '5'], [10, '10'], [20, '20'], [0, t('set.goalOff')]])}
          ${goal ? `<div class="set-goal"><div class="lvl-bar"><i style="width:${Math.min(100, Math.round((100 * done) / goal))}%"></i></div><small>${done >= goal ? t('set.goalToday') : tf('set.goalLeft', { d: done, n: goal })}</small></div>` : ''}
        </div>
        ${sw('wordTap', t('set.wordTap'), t('set.wordTapB'))}
        ${sw('autoNext', t('set.autoNext'), t('set.autoNextB'))}
        ${sw('pisaClock', t('set.pisaClock'), t('set.pisaClockB'))}`)}

      ${card(navIcon('chat'), 'sky', t('set.kapi'), `
        <div class="set-block"><b>${t('set.aiMode')}</b>
          ${chips('aiMode', [['auto', t('set.aiAuto')], ['local', t('set.aiLocal')], ['offline', t('set.aiOffline')]])}
          <small>${t('set.aiB_' + (['auto', 'local', 'offline'].includes(s.aiMode) ? s.aiMode : 'auto'))}</small></div>
        <a class="btn btn-soft btn-sm set-link" href="#/tutor">${icon('chat', 14)} ${t('set.toKapi')}</a>`)}

      ${card(icon('bolt', 20), 'lilac', t('set.notify'), `
        <div class="set-row">
          <span class="set-txt"><b>${t('set.sysNotify')}</b><small>${t('set.sysNotifyB_' + notifState)}</small></span>
          <button class="sw ${s.notifyBrowser && notifState === 'granted' ? 'on' : ''}" role="switch" aria-checked="${Boolean(s.notifyBrowser && notifState === 'granted')}" data-act="set-notify" ${notifState === 'na' || notifState === 'denied' ? 'disabled' : ''}><i></i></button>
        </div>`)}

      ${card(icon('shield', 20), 'mint', t('set.privacy'), `
        ${sw('hideGlobal', t('set.hideGlobal'), t('set.hideGlobalB'))}
        <p class="note set-note">${icon('users', 13)} ${t('set.privacyNote')}</p>`)}

      ${card(icon('stack', 20), 'cream', t('set.data'), `
        <div class="set-actions">
          <button class="set-act" data-act="set-export">${icon('receipt', 18)}<span><b>${t('set.export')}</b><small>${t('set.exportB')}</small></span></button>
          <button class="set-act" data-act="set-news">${icon('sparkles', 18)}<span><b>${t('set.news')}</b><small>${t('set.newsB')}</small></span></button>
          <button class="set-act" data-act="tour-again">${icon('play', 18)}<span><b>${t('profile.tour')}</b><small>${t('set.tourB')}</small></span></button>
          <button class="set-act danger" data-act="profile-reset">${icon('cross', 18)}<span><b>${t('profile.reset')}</b><small>${t('set.resetB')}</small></span></button>
        </div>
        <p class="note set-note" id="setStorage">${icon('cloud', 13)} ${t(isLoggedIn() ? 'set.syncOn' : 'set.syncOff')}</p>`)}
    </div>`;
}

/** Размер занятого места на устройстве (показываем после отрисовки). */
export async function afterSettings() {
  const el = document.getElementById('setStorage');
  if (!el || !navigator.storage?.estimate) return;
  try {
    const { usage } = await navigator.storage.estimate();
    if (!usage || usage < 100000) return;
    el.insertAdjacentHTML('beforeend', ` · ${tf('set.storage', { n: (usage / 1048576).toFixed(1) })}`);
  } catch { /* нет данных */ }
}

export function registerSettingsActions(rerender) {
  action('set-toggle', ({ k }) => {
    const cur = get(k);
    const next = k === 'motion' ? (cur === 'off' ? 'on' : 'off') : !(cur !== false);
    set(k, next);
    if (k === 'motion') applyPrefs();
    if (k === 'hideGlobal') pushPublicCard();
    if (k.startsWith('sound') && next) play(k === 'sound.notify' ? 'message' : k === 'sound.progress' ? 'achievement' : 'correct');
    rerender();
  });
  action('set-pick', ({ k, v }) => {
    set(k, k === 'dailyGoal' ? Number(v) : v);
    if (k === 'fontSize') applyPrefs();
    rerender();
  });
  action('set-test', ({ id }) => play(id, { force: true }));
  action('set-notify', async () => {
    if (!('Notification' in window)) return;
    if (getSettings().notifyBrowser) { set('notifyBrowser', false); rerender(); return; }
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    set('notifyBrowser', p === 'granted');
    if (p === 'granted') toast(t('set.notifyOn'));
    rerender();
  });
  action('set-news', () => {
    update((s) => { s.profile.newsSeen = 0; });
    import('./onboarding.js').then((m) => m.maybeWhatsNew(rerender));
  });
  action('set-export', () => {
    const data = { app: 'NASstudy', exportedAt: new Date().toISOString(), profile: getProfile(), settings: getSettings() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nasstudy-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t('set.exported'));
  });
  // Громкость: двигаем — подпись меняется сразу, отпустили — сохраняем и проигрываем пример
  document.addEventListener('input', (e) => {
    if (e.target?.id !== 'setVol') return;
    const v = Number(e.target.value);
    e.target.style.setProperty('--v', v + '%');
    const out = document.getElementById('setVolOut'); if (out) out.textContent = v + '%';
  });
  document.addEventListener('change', (e) => {
    if (e.target?.id !== 'setVol') return;
    set('sound.vol', Number(e.target.value) / 100);
    play('correct', { force: true });
  });
}
