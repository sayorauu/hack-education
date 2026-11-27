/**
 * Страница «Настройки»: звук, внешний вид, учёба, Капи, уведомления,
 * приватность и данные. Всё сохраняется на устройстве (и в облаке вместе
 * с профилем, если ученик вошёл).
 */

import { icon } from './icons.js';
import { t, tf, LANGS } from '../i18n.js';
import { getProfile, getSettings, update, resetAll } from '../state.js';
import { header, esc, navIcon, openModal, closeModal } from './kit.js';
import { action, toast } from './dom.js';
import { play } from '../sound.js';
import { applyPrefs, todayCorrect } from '../prefs.js';
import { isLoggedIn, pushPublicCard, authAvailable, currentUser, deleteAccount } from '../cloud/auth.js';

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
/* Двухцветные иконки разделов (в стиле иконок меню) */
const SV = (d) => `<svg class="nav-ic" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">${d}</svg>`;
const ST = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const SEC = {
  sound: SV(`<path d="M3 9h3.6L11.5 5v14l-4.9-4H3z"/><path d="M15 8.6a4.8 4.8 0 0 1 0 6.8M17.8 6a8.5 8.5 0 0 1 0 12" ${ST} stroke-width="1.9" opacity=".45"/>`),
  look: SV('<path opacity=".35" d="M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.9 1.4-2-.4-1.1.3-2.2 1.5-2.2H17a4 4 0 0 0 4-4C21 7 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1.6"/><circle cx="10.5" cy="7.3" r="1.6"/><circle cx="15.5" cy="8.3" r="1.6"/>'),
  study: SV('<path opacity=".35" d="M2.5 5.2C5.6 4 8.7 4.2 11.2 6v14c-2.5-1.6-5.6-1.8-8.7-.7z"/><path d="M21.5 5.2C18.4 4 15.3 4.2 12.8 6v14c2.5-1.6 5.6-1.8 8.7-.7z"/>'),
  kapi: SV('<path opacity=".35" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><circle cx="8" cy="11" r="1.5"/><circle cx="12" cy="11" r="1.5"/><circle cx="16" cy="11" r="1.5"/>'),
  notify: SV('<path opacity=".35" d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6z"/><path d="M9.5 18.5a2.5 2.5 0 0 0 5 0z"/><circle cx="18" cy="5" r="2.6"/>'),
  privacy: SV(`<path opacity=".35" d="M12 2.5 20 6v6c0 5-3.4 8.6-8 9.5C7.4 20.6 4 17 4 12V6z"/><path d="m8.5 12 2.5 2.5 4.5-5" ${ST} stroke-width="2.1"/>`),
  danger: SV('<path opacity=".35" d="M10.3 3.6a2 2 0 0 1 3.4 0l8.1 14.1A2 2 0 0 1 20.1 21H3.9a2 2 0 0 1-1.7-3.3z"/><path d="M12 8.5v5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.4"/>'),
  data: SV(`<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path opacity=".35" d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13c0 1.7-3.6 3-8 3s-8-1.3-8-3z"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" ${ST} stroke-width="1.6" opacity=".7"/>`),
};
const SECTIONS = [['sound', 'lilac'], ['look', 'cream'], ['study', 'mint'], ['kapi', 'sky'], ['notify', 'lilac'], ['privacy', 'mint'], ['data', 'cream'], ['danger', 'danger']];
const card = (key, body) => {
  const tint = SECTIONS.find((x) => x[0] === key)[1];
  return `<section class="set-sec" id="set-${key}"><div class="set-head"><span class="set-ic t-${tint}">${SEC[key]}</span><div><h2>${t('set.' + key)}</h2><small>${t('set.' + key + 'B')}</small></div></div><div class="set-card">${body}</div></section>`;
};
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
    <div class="set-layout">
    <nav class="set-nav" aria-label="${esc(t('set.title'))}">${SECTIONS.map(([k, tint], i) => `<button class="set-nav-i ${i === 0 ? 'on' : ''}" data-act="set-jump" data-id="${k}"><span class="set-ic t-${tint}">${SEC[k]}</span><span>${t('set.' + k)}</span></button>`).join('')}</nav>
    <div class="set-main">
      ${card('sound', `
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

      ${card('look', `
        <div class="set-block"><b>${t('profile.theme')}</b>
          <div class="chips set-chips"><button class="chip ${s.theme === 'light' ? 'on' : ''}" data-act="theme-set" data-id="light">${icon('sun', 15)} ${t('profile.light')}</button>
          <button class="chip ${s.theme === 'dark' ? 'on' : ''}" data-act="theme-set" data-id="dark">${icon('moon', 15)} ${t('profile.dark')}</button></div></div>
        <div class="set-block"><b>${t('profile.lang')}</b>
          <div class="chips set-chips">${LANGS.map((l) => `<button class="chip ${s.lang === l.id ? 'on' : ''}" data-act="lang" data-id="${l.id}">${l.label}</button>`).join('')}</div></div>
        <div class="set-block"><b>${t('set.font')}</b>
          ${chips('fontSize', [['s', '<span class="fs-a s">Аа</span>'], ['m', '<span class="fs-a m">Аа</span>'], ['l', '<span class="fs-a l">Аа</span>'], ['xl', '<span class="fs-a xl">Аа</span>']], 'fs-chips')}</div>
        ${sw('motion', t('set.motion'), t('set.motionB'))}`)}

      ${card('study', `
        <div class="set-block"><b>${t('set.goal')}</b><small>${t('set.goalB')}</small>
          ${chips('dailyGoal', [[3, '3'], [5, '5'], [10, '10'], [20, '20'], [0, t('set.goalOff')]])}
          ${goal ? `<div class="set-goal"><div class="lvl-bar"><i style="width:${Math.min(100, Math.round((100 * done) / goal))}%"></i></div><small>${done >= goal ? t('set.goalToday') : tf('set.goalLeft', { d: done, n: goal })}</small></div>` : ''}
        </div>
        ${sw('wordTap', t('set.wordTap'), t('set.wordTapB'))}
        ${sw('autoNext', t('set.autoNext'), t('set.autoNextB'))}
        ${sw('pisaClock', t('set.pisaClock'), t('set.pisaClockB'))}`)}

      ${card('kapi', `
        <div class="set-block"><b>${t('set.aiMode')}</b>
          ${chips('aiMode', [['auto', t('set.aiAuto')], ['local', t('set.aiLocal')], ['offline', t('set.aiOffline')]])}
          <small>${t('set.aiB_' + (['auto', 'local', 'offline'].includes(s.aiMode) ? s.aiMode : 'auto'))}</small></div>
        <a class="btn btn-soft btn-sm set-link" href="#/tutor">${icon('chat', 14)} ${t('set.toKapi')}</a>`)}

      ${card('notify', `
        <div class="set-row">
          <span class="set-txt"><b>${t('set.sysNotify')}</b><small>${t('set.sysNotifyB_' + notifState)}</small></span>
          <button class="sw ${s.notifyBrowser && notifState === 'granted' ? 'on' : ''}" role="switch" aria-checked="${Boolean(s.notifyBrowser && notifState === 'granted')}" data-act="set-notify" ${notifState === 'na' || notifState === 'denied' ? 'disabled' : ''}><i></i></button>
        </div>`)}

      ${card('privacy', `
        ${sw('hideGlobal', t('set.hideGlobal'), t('set.hideGlobalB'))}
        ${sw('analytics', t('set.analytics'), t('set.analyticsB'))}
        <p class="note set-note">${icon('users', 13)} ${t('set.privacyNote')}</p>`)}

      ${card('data', `
        <div class="set-actions">
          <button class="set-act" data-act="set-export">${icon('receipt', 18)}<span><b>${t('set.export')}</b><small>${t('set.exportB')}</small></span></button>
          <button class="set-act" data-act="set-news">${icon('sparkles', 18)}<span><b>${t('set.news')}</b><small>${t('set.newsB')}</small></span></button>
          <button class="set-act" data-act="tour-again">${icon('play', 18)}<span><b>${t('profile.tour')}</b><small>${t('set.tourB')}</small></span></button>
        </div>
        <p class="note set-note" id="setStorage">${icon('cloud', 13)} ${t(isLoggedIn() ? 'set.syncOn' : 'set.syncOff')}</p>`)}
      ${card('danger', `
        <div class="set-row">
          <span class="set-txt"><b>${t('profile.reset')}</b><small>${t('set.resetB')}</small></span>
          <button class="btn btn-soft btn-sm dz-btn" data-act="profile-reset">${t('set.resetBtn')}</button>
        </div>
        <div class="set-row">
          <span class="set-txt"><b>${t('set.delT')}</b><small>${t(isLoggedIn() ? 'set.delB' : authAvailable() ? 'set.delGuest' : 'set.delNoCloud')}</small></span>
          <button class="btn btn-sm dz-btn dz-del" data-act="acc-del" ${isLoggedIn() ? '' : 'disabled'}>${t('set.delBtn')}</button>
        </div>`)}
    </div>
    </div>`;
}

const markNav = (id) => document.querySelectorAll('.set-nav-i').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
let spy = null;

/** Размер занятого места на устройстве (показываем после отрисовки). */
export async function afterSettings() {
  // Подсветка раздела в меню слева, пока листаешь
  spy?.disconnect();
  spy = new IntersectionObserver((es) => {
    const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (vis) markNav(vis.target.id.replace('set-', ''));
  }, { rootMargin: '-20% 0px -65% 0px' });
  document.querySelectorAll('.set-sec').forEach((el) => spy.observe(el));
  const el = document.getElementById('setStorage');
  if (!el || !navigator.storage?.estimate) return;
  try {
    const { usage } = await navigator.storage.estimate();
    if (!usage || usage < 100000) return;
    el.insertAdjacentHTML('beforeend', ` · ${tf('set.storage', { n: (usage / 1048576).toFixed(1) })}`);
  } catch { /* нет данных */ }
}

export function registerSettingsActions(rerender) {
  action('set-jump', ({ id }) => {
    const el = document.getElementById('set-' + id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 24, behavior: 'smooth' });
    markNav(id);
  });
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

  // Опасная зона: удаление аккаунта только после ввода слова DELETE
  const WORD = 'DELETE';
  action('acc-del', () => {
    if (!isLoggedIn()) return;
    const email = currentUser()?.email || '';
    openModal(`<form class="dz-sheet" data-act="acc-del-go" autocomplete="off">
      <span class="dz-ic">${SEC.danger}</span>
      <h2>${t('set.delModalT')}</h2>
      <p class="note">${tf('set.delModalB', { email: esc(email) })}</p>
      <ul class="dz-list"><li>${t('set.delL1')}</li><li>${t('set.delL2')}</li><li>${t('set.delL3')}</li></ul>
      <label class="field"><span>${tf('set.delType', { w: WORD })}</span>
        <input class="input dz-input" id="dzWord" name="word" autocapitalize="characters" spellcheck="false" placeholder="${WORD}"></label>
      <p class="auth-err dz-err" role="alert" hidden></p>
      <div class="q-actions"><button type="button" class="btn btn-soft" data-act="modal-close">${t('set.delCancel')}</button>
        <button class="btn dz-del" type="submit" id="dzGo" disabled>${t('set.delForever')}</button></div>
    </form>`);
    setTimeout(() => document.getElementById('dzWord')?.focus(), 60);
  });
  document.addEventListener('input', (e) => {
    if (e.target?.id !== 'dzWord') return;
    const ok = e.target.value.trim() === WORD;
    const b = document.getElementById('dzGo'); if (b) b.disabled = !ok;
    e.target.classList.toggle('ok', ok);
  });
  action('acc-del-go', async (_d, form) => {
    const word = String(new FormData(form).get('word') || '').trim();
    if (word !== WORD) return;
    const btn = form.querySelector('#dzGo'); const err = form.querySelector('.dz-err');
    btn.disabled = true; btn.textContent = t('set.delWorking');
    try {
      await deleteAccount();
      resetAll();
      ['nasstudy.nudged'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* память */ } });
      closeModal();
      toast(t('set.delDone'));
      location.hash = '#/';
      rerender();
    } catch (e) {
      btn.disabled = false; btn.textContent = t('set.delForever');
      err.hidden = false;
      err.textContent = /42883|PGRST202|could not find the function/i.test(`${e.code} ${e.message}`) ? t('set.delSetup') : t('set.delFail');
    }
  });
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
