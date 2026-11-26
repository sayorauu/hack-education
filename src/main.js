/**
 * NASstudy — точка входа: маршрутизатор, общие действия, оболочка.
 */

import { initDelegation, action, toast } from './ui/dom.js';
import { getProfile, getSettings, update } from './state.js';
import { t } from './i18n.js';
import { renderRail, switchTheme, switchLang, closeModal } from './ui/kit.js';
import { renderDashboard, registerDashboardActions, animateDashboard } from './ui/dashboard.js';
import { renderTopics, renderTopic, bindTopicSearch } from './ui/topics.js';
import { renderPractice, registerPracticeActions } from './ui/practice.js';
import { renderLeaderboard, registerLeaderboardActions } from './ui/leaderboard.js';
import { renderPisa, registerPisaActions, animatePisa, pisaActive, confirmLeavePisa, registerPisaLeave } from './ui/pisa.js';
import { renderWallet, registerWalletActions, bindWalletInputs } from './ui/wallet.js';
import { renderTutor, registerTutorActions, seedTutorQuestion, flushPending } from './ui/tutor.js';
import { renderProfile, registerProfileActions, bindChipRadios } from './ui/profile.js';
import { showOnboarding, registerOnboardingActions, maybeWhatsNew } from './ui/onboarding.js';
import { renderAdmin, registerAdminActions } from './ui/admin.js';
import { initAuth, onAuthChange, takeOAuthResult } from './cloud/auth.js';
import { canUse, openAuth, registerAuthActions } from './ui/auth.js';
import { renderFriends, registerFriendsActions, refreshUnread, paintBadge } from './ui/friends.js';
import { registerLeagueActions } from './ui/league.js';
import { initLevels } from './ui/levels.js';

const main = document.getElementById('main');
const rail = document.getElementById('rail');

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query || '') };
}

function view(path, params) {
  const seg = path.split('/').filter(Boolean);
  switch (seg[0]) {
    case undefined: return renderDashboard();
    case 'topics': return renderTopics(params);
    case 'topic': return renderTopic(seg[1]);
    case 'practice':
      // Гость видит тему, но решать задания — только после входа
      if (!canUse()) {
        history.replaceState(null, '', '#/topic/' + seg[1]);
        setTimeout(() => openAuth('signup', 'auth.rPractice'), 0);
        return renderTopic(seg[1]);
      }
      return renderPractice(seg[1]);
    case 'friends': return renderFriends(params, seg);
    case 'leaderboard': return renderLeaderboard();
    case 'pisa': return renderPisa();
    case 'wallet': return renderWallet();
    case 'profile': return renderProfile();
    case 'admin': return renderAdmin();
    case 'tutor':
      if (params.get('ask')) seedTutorQuestion(params.get('ask'), true);
      else if (params.get('q')) seedTutorQuestion(params.get('q'));
      return renderTutor();
    default: return renderDashboard();
  }
}

let lastPath = null;

function render() {
  const { path, params } = parseHash();
  // Сохраняем фокус и позицию курсора в поле ввода, если оно перерисовывается
  const active = document.activeElement;
  const keepId = active && active.id && main.contains(active) ? active.id : null;
  const caret = keepId && 'selectionStart' in active ? active.selectionStart : null;
  // Что ученик уже набрал (код друга, сообщение…) не должно пропадать при фоновой перерисовке
  const typed = {};
  main.querySelectorAll('input[id], textarea[id]').forEach((el) => {
    if (!['file', 'radio', 'checkbox', 'hidden', 'submit'].includes(el.type) && el.value !== el.defaultValue) typed[el.id] = el.value;
  });

  rail.innerHTML = renderRail(path);
  paintBadge();
  main.innerHTML = view(path, params);
  document.title = t('app.title');
  document.documentElement.lang = getSettings().lang;

  if (path === lastPath) {
    for (const [id, v] of Object.entries(typed)) { const el = document.getElementById(id); if (el && main.contains(el)) el.value = v; }
  }
  if (keepId) {
    const el = document.getElementById(keepId);
    if (el) { el.focus(); if (caret !== null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch { /* не текстовое поле */ } }
  }
  if (path !== lastPath) { window.scrollTo({ top: 0 }); if (path === '/' || path === '') requestAnimationFrame(() => animateDashboard()); lastPath = path; }
  if (path.startsWith('/pisa')) animatePisa();
  if (path.startsWith('/tutor')) flushPending(render);
}

/* ─── Общие действия ──────────────────────────────────────────────────── */

action('theme', (_d, el) => switchTheme(el, render));
action('lang', ({ id }) => switchLang(id, render));
// Меню сворачиваем без перерисовки: CSS плавно меняет ширину и подписи
action('rail-toggle', (_d, btn) => {
  update((s) => { s.settings.railOpen = s.settings.railOpen === false; });
  const open = getSettings().railOpen !== false;
  document.documentElement.dataset.rail = open ? 'open' : 'closed';
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', t(open ? 'rail.collapse' : 'rail.expand'));
});

registerDashboardActions(render);
registerPracticeActions(render);
registerLeaderboardActions(render);
registerPisaActions(render);
registerPisaLeave();
registerWalletActions(render);
registerTutorActions(render);
registerProfileActions(render);
registerAuthActions(render);
registerFriendsActions(render);
registerLeagueActions(render);
initLevels();
registerOnboardingActions(action, render);
registerAdminActions(render);

initDelegation(document.body);
bindTopicSearch(document.body);
bindWalletInputs(document.body, render);
bindChipRadios(document.body);

/* Быстрый фильтр списков на месте: <input data-filter="#listId">. */
document.body.addEventListener('input', (e) => {
  const sel = e.target.dataset?.filter;
  if (!sel) return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll(`${sel} [data-text]`).forEach((row) => { row.hidden = q && !row.dataset.text.includes(q); });
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
/* Во время пробного PISA уход на другую страницу — только с подтверждением */
let lastHash = location.hash;
window.addEventListener('hashchange', () => {
  const next = location.hash;
  if (pisaActive() && lastHash.startsWith('#/pisa') && !next.startsWith('#/pisa')) {
    history.replaceState(null, '', lastHash); // остаёмся на тесте, пока ученик не решит
    confirmLeavePisa(next);
    return;
  }
  lastHash = next;
  render();
});

render();
if (!getProfile().onboarded) showOnboarding(render);
else maybeWhatsNew(render);
// Аккаунт: загружаем настройки Supabase и сессию, при входе/выходе перерисовываем
initAuth().then(() => {
  // Вернулись от Google: закрываем анкету (профиль пришёл из облака) и сообщаем результат
  const r = takeOAuthResult();
  if (r === 'ok') { if (getProfile().onboarded) closeModal(); toast(t('auth.loggedIn')); }
  if (r === 'error') toast(t('auth.errGoogle'));
  render();
});
onAuthChange(() => render());
// Значок новых сообщений от друзей: проверяем раз в 30 секунд
setInterval(refreshUnread, 30000);
setTimeout(refreshUnread, 2500);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* офлайн-режим просто не включится */ });
}
