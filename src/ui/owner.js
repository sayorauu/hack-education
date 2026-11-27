/**
 * Страница главного админа: кто заходил на сайт и что делал.
 * Видна только тем, чья почта записана в таблицу super_admins
 * (проверяет сама база, см. supabase/analytics.sql).
 */

import { icon } from './icons.js';
import { t, tf, fmtDate } from '../i18n.js';
import { header, esc, fmt } from './kit.js';
import { action } from './dom.js';
import { rest, isLoggedIn } from '../cloud/auth.js';
import { isOwner } from '../cloud/track.js';

const O = { days: 7, stats: null, feed: null, err: '', loading: false, at: 0 };
let rerenderRef = () => {};
let timer = null;

// Понятные названия для страниц и кнопок
const PAGE_NAMES = { '/': 'Главная', '/topics': 'Темы', '/tutor': 'Капи', '/pisa': 'Пробный PISA', '/leaderboard': 'Рейтинг', '/wallet': 'Кошелёк', '/friends': 'Друзья', '/friends/:id': 'Чат с другом', '/profile': 'Профиль', '/settings': 'Настройки', '/admin': 'Админка', '/owner': 'Главный админ' };
const pageName = (p) => PAGE_NAMES[p] || (p.startsWith('/topic/') ? 'Тема ' + p.slice(7) : p.startsWith('/practice/') ? 'Задания ' + p.slice(10) : p);
const ACT_NAMES = { 'pr-check': 'Проверить ответ', 'pr-pick': 'Выбор ответа', 'pr-next': 'Следующее задание', 'pr-hint': 'Подсказка', word: 'Нажал на слово', 'word-ask': 'Спросил Капи о слове', 'tutor-send': 'Вопрос Капи', 'pisa-start': 'Начал PISA', 'pisa-finish': 'Закончил PISA', 'pisa-pick': 'Ответ в PISA', 'auth-submit': 'Вход / регистрация', 'auth-google': 'Вход через Google', 'jury-login': 'Вход жюри', 'fr-add': 'Добавил друга', 'fr-send': 'Сообщение другу', 'ex-send': 'Объяснил другу', 'ex-check': 'Решил похожее', 'pay-send': 'Обмен монет', 'theme': 'Смена темы', 'lang': 'Смена языка', 'set-toggle': 'Настройка', 'acc-del': 'Удаление аккаунта' };
const actName = (a) => ACT_NAMES[a] || a;
const ROLE = { guest: 'Гость', user: 'Ученик', jury: 'Жюри' };

async function load(force = false) {
  if (O.loading || !isOwner()) return;
  if (!force && Date.now() - O.at < 10000) return;
  O.loading = true;
  try {
    const [stats, feed] = await Promise.all([
      rest('/rest/v1/rpc/admin_stats', { method: 'POST', body: { p_days: O.days } }),
      rest('/rest/v1/rpc/admin_feed', { method: 'POST', body: { p_limit: 60 } }),
    ]);
    O.stats = stats; O.feed = feed; O.err = '';
  } catch (e) {
    O.err = /forbidden/i.test(e.message) ? t('own.forbidden') : /PGRST202|42883|could not find/i.test(`${e.code} ${e.message}`) ? t('own.setup') : t('own.error');
  }
  O.loading = false; O.at = Date.now();
  if (location.hash.startsWith('#/owner')) rerenderRef();
}

const bars = (list, label, key = 'c') => {
  if (!list?.length) return `<p class="empty">${t('own.empty')}</p>`;
  const max = Math.max(...list.map((x) => x[key]));
  return `<div class="own-bars">${list.map((x) => `<div class="own-bar"><span>${esc(label(x))}</span><div class="bar"><i style="width:${Math.max(4, Math.round((100 * x[key]) / max))}%"></i></div><b>${fmt(x[key])}</b></div>`).join('')}</div>`;
};

export function renderOwner() {
  if (!isLoggedIn() || !isOwner()) {
    return `${header(t('own.title'), t('own.sub'))}<section class="panel fr-empty">${icon('lock', 28)}<h2>${t('own.onlyT')}</h2><p class="note">${t('own.onlyB')}</p></section>`;
  }
  load();
  clearInterval(timer);
  timer = setInterval(() => { if (location.hash.startsWith('#/owner')) load(true); else { clearInterval(timer); timer = null; } }, 15000);
  const s = O.stats;
  const kpi = (ic, tint, val, lbl) => `<div class="own-kpi t-${tint}"><span class="own-kpi-ic">${icon(ic, 20)}</span><b>${val}</b><small>${lbl}</small></div>`;
  const days = s?.byDay || [];
  const maxDay = Math.max(1, ...days.map((d) => d.s));
  return `
    ${header(t('own.title'), t('own.sub'))}
    <div class="own-top">
      <div class="chips">${[1, 7, 30].map((d) => `<button class="chip ${O.days === d ? 'on' : ''}" data-act="own-days" data-id="${d}">${t('own.d' + d)}</button>`).join('')}</div>
      <span class="own-live"><i></i>${t('own.live')}</span>
    </div>
    ${O.err ? `<div class="fr-err">${icon('shield', 16)}<span>${esc(O.err)}</span></div>` : ''}
    ${!s ? (O.err ? '' : `<p class="empty"><span class="spin"></span></p>`) : `
    <div class="own-kpis">
      ${kpi('users', 'lilac', fmt(s.sessions), t('own.sessions'))}
      ${kpi('user', 'mint', fmt(s.users), t('own.users'))}
      ${kpi('trophy', 'cream', fmt(s.jury), t('own.jury'))}
      ${kpi('sparkles', 'sky', fmt(s.signups), t('own.signups'))}
      ${kpi('book', 'lilac', fmt(s.pages), t('own.pages'))}
      ${kpi('bolt', 'mint', fmt(s.actions), t('own.actions'))}
    </div>
    <div class="own-grid">
      <section class="panel"><div class="sec-head"><h2>${t('own.byDay')}</h2></div>
        <div class="own-days">${days.map((d) => `<span class="own-day" title="${d.s} · ${d.e}"><i style="height:${Math.max(6, Math.round((100 * d.s) / maxDay))}%"></i><em>${new Date(d.d).getDate()}</em></span>`).join('') || `<p class="empty">${t('own.empty')}</p>`}</div>
        <div class="own-split">${(s.roles || []).map((r) => `<span class="own-role r-${r.role}">${ROLE[r.role] || r.role}: <b>${fmt(r.c)}</b></span>`).join('')}${(s.devices || []).map((d) => `<span class="own-role">${esc(d.device)}: <b>${fmt(d.c)}</b></span>`).join('')}</div>
      </section>
      <section class="panel"><div class="sec-head"><h2>${t('own.topPages')}</h2></div>${bars(s.topPages, (x) => pageName(x.name))}</section>
      <section class="panel"><div class="sec-head"><h2>${t('own.topActions')}</h2></div>${bars(s.topActions, (x) => actName(x.name))}</section>
      <section class="panel own-feed-p"><div class="sec-head"><h2>${t('own.feed')}</h2><span class="count">${O.feed?.length || 0}</span></div>
        <div class="own-feed">${(O.feed || []).map((e) => `<div class="own-ev k-${e.kind}">
          <span class="own-ev-ic">${icon(e.kind === 'visit' ? 'home' : e.kind === 'page' ? 'book' : 'bolt', 14)}</span>
          <span class="own-ev-main"><b>${esc(e.kind === 'page' ? pageName(e.name) : e.kind === 'action' ? actName(e.name) : t('own.visit') + ' ' + e.name)}</b>
            <small>${esc(e.email || (ROLE[e.role] || e.role) + ' #' + String(e.session_id).slice(0, 5))}, ${esc(e.device || '')}</small></span>
          <time>${fmtDate(new Date(e.created_at).getTime())}</time></div>`).join('') || `<p class="empty">${t('own.empty')}</p>`}</div>
      </section>
    </div>`}
    <p class="note own-note">${icon('shield', 13)} ${t('own.privacy')}</p>`;
}

export function registerOwnerActions(rerender) {
  rerenderRef = rerender;
  action('own-days', ({ id }) => { O.days = Number(id) || 7; O.stats = null; rerender(); load(true); });
}
