/**
 * Страница главного админа: кто заходил на сайт и что делал.
 * Видна только тем, чья почта записана в таблицу super_admins
 * (проверяет сама база, см. supabase/analytics.sql).
 */

import { icon } from './icons.js';
import { t, tf, fmtDate } from '../i18n.js';
import { header, esc, fmt, navIcon } from './kit.js';
import { TOPIC_BY_ID } from '../data/curriculum.js';
import { loc } from '../i18n.js';
import { action } from './dom.js';
import { rest, isLoggedIn, myId } from '../cloud/auth.js';
import { isOwner, deviceId } from '../cloud/track.js';

const O = { days: 7, stats: null, feed: null, users: null, err: '', loading: false, at: 0, hideOwn: false, q: '' };
const OWN_KEY = 'nasstudy.ownDevices';
const ownList = () => { try { return JSON.parse(localStorage.getItem(OWN_KEY) || '[]'); } catch { return []; } };
/* Наше место и радиус: всё, что ближе, считаем «нами» */
const PLACE_KEY = 'nasstudy.ourPlace';
const getPlace = () => { try { return JSON.parse(localStorage.getItem(PLACE_KEY) || 'null'); } catch { return null; } };
const setPlace = (p) => { try { localStorage.setItem(PLACE_KEY, JSON.stringify(p)); } catch { /* память */ } };
/** Расстояние между двумя точками по поверхности Земли, км */
function km(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const distOf = (r) => { const p = getPlace(); return p && p.lat != null && r.lat != null ? km(p, { lat: Number(r.lat), lon: Number(r.lon) }) : null; };
const isNear = (r) => { const p = getPlace(); const d = distOf(r); return d != null && d <= (p?.radius || 3); };
/** «Мы»: это устройство (тут был и главный админ, и вход жюри), отмеченные устройства,
 *  аккаунт главного админа и все, кто зашёл рядом с нашей точкой. */
const isOwn = (v, uid, r) => v === deviceId() || ownList().includes(v) || (uid && uid === myId()) || (r ? isNear(r) : false);
/** 3725 → «1 ч 2 мин», 95 → «1 мин 35 с» */
const dur = (sec) => { const s = Math.round(Number(sec) || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} ${t('own.h')} ${m} ${t('own.m')}` : m ? `${m} ${t('own.m')} ${s % 60} ${t('own.s')}` : `${s} ${t('own.s')}`; };
let rerenderRef = () => {};
let timer = null;

// Понятные названия для страниц и кнопок
const PAGE_NAMES = { '/': 'Главная', '/topics': 'Темы', '/tutor': 'Капи', '/pisa': 'Пробный PISA', '/leaderboard': 'Рейтинг', '/wallet': 'Кошелёк', '/friends': 'Друзья', '/friends/:id': 'Чат с другом', '/profile': 'Профиль', '/settings': 'Настройки', '/admin': 'Админка', '/owner': 'Главный админ' };
const tName = (id) => (TOPIC_BY_ID[id] ? loc(TOPIC_BY_ID[id]) : id);
const pageName = (p) => PAGE_NAMES[p] || (p.startsWith('/topic/') ? 'Тема: ' + tName(p.slice(7)) : p.startsWith('/practice/') ? 'Задания: ' + tName(p.slice(10)) : p);
const ACT_NAMES = {
  'pr-check': 'Проверил ответ', 'pr-pick': 'Выбрал ответ', 'pr-next': 'Следующее задание', 'pr-hint': 'Взял подсказку', 'pr-again': 'Тема заново',
  word: 'Нажал на слово', 'word-ask': 'Спросил Капи о слове', 'word-close': 'Закрыл слово', 'tutor-send': 'Вопрос Капи', 'tutor-suggest': 'Готовый вопрос Капи', voice: 'Голосовой ввод', 'ai-mode': 'Режим Капи', 'local-load': 'Скачал нейросеть', 'local-model': 'Выбор нейросети', 'local-remove': 'Удалил нейросеть',
  'pisa-start': 'Начал PISA', 'pisa-finish': 'Закончил PISA', 'pisa-pick': 'Ответ в PISA', 'pisa-nav': 'Листал PISA', 'pisa-exit': 'Хотел выйти из PISA', 'pisa-leave': 'Вышел из PISA', 'pisa-stay': 'Остался в PISA', 'pisa-clock': 'Секундомер PISA', 'pisa-fs': 'Весь экран PISA',
  'auth-submit': 'Вход / регистрация', 'auth-google': 'Вход через Google', 'auth-open': 'Открыл вход', 'auth-tab': 'Вкладка входа', 'auth-guest': 'Остался гостем', 'auth-logout': 'Вышел из аккаунта',
  'jury-login': 'Вошёл как жюри', 'ob-jury': 'Вошёл как жюри', 'jury-exit': 'Вышел из режима жюри', 'ob-lang': 'Выбрал язык', 'ob-next': 'Знакомство: далее', 'ob-back': 'Знакомство: назад', 'ob-grade': 'Выбрал класс', 'ob-finish': 'Закончил знакомство',
  'tour-again': 'Открыл туториал', 'wn-ok': 'Прочитал «Что нового»', 'wn-tour': 'Туториал из «Что нового»', 'fr-tour': 'Туториал друзей', 'ft-next': 'Туториал друзей: далее', 'ft-prev': 'Туториал друзей: назад', 'ft-done': 'Закрыл туториал друзей', 'ft-go': 'Туториал друзей: шаг',
  'fr-add': 'Добавил друга', 'fr-accept': 'Принял заявку', 'fr-decline': 'Отклонил заявку', 'fr-remove': 'Удалил друга', 'fr-copy': 'Скопировал код', 'fr-send': 'Написал другу', 'fr-share-to': 'Поделился достижением', 'ps-nudge': 'Напомнил другу',
  'ex-open': 'Открыл «Объясни другу»', 'ex-send': 'Объяснил другу', 'ex-try': 'Решает похожее', 'ex-pick': 'Ответ на похожее', 'ex-check': 'Проверил похожее', 'ex-another': 'Другое похожее',
  'pay-send': 'Обмен монет', 'pay-method': 'Способ обмена', 'pay-bank': 'Выбор банка', 'admin-login': 'Вход в админку', 'admin-add': 'Админ начислил', 'admin-custom': 'Админ: своя сумма', 'admin-zero': 'Админ обнулил', 'admin-logout': 'Вышел из админки',
  theme: 'Сменил тему', 'theme-set': 'Сменил тему', lang: 'Сменил язык', 'rail-toggle': 'Свернул меню', cal: 'Календарь', 'dash-search': 'Поиск', 'pc-scroll': 'Листал прогресс', 'lvl-see': 'Смотрел уровень',
  'set-toggle': 'Переключил настройку', 'set-pick': 'Выбрал настройку', 'set-jump': 'Раздел настроек', 'set-test': 'Прослушал звук', 'set-notify': 'Уведомления', 'set-export': 'Скачал прогресс', 'set-news': '«Что нового»', 'profile-save': 'Сохранил профиль', 'profile-reset': 'Сбросил прогресс', 'photo-del': 'Удалил фото',
  'acc-del': 'Открыл удаление аккаунта', 'acc-del-go': 'Удалил аккаунт', 'modal-close': 'Закрыл окно', 'own-days': 'Период статистики', 'own-mark': 'Отметил «это мы»', 'own-place': 'Наша точка', 'own-radius': 'Радиус',
};
const actName = (a) => ACT_NAMES[a] || a;

/* Двухцветные иконки ленты: страница — значок этого раздела, заход — дверь, нажатие — курсор */
const SV = (d) => `<svg class="nav-ic" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">${d}</svg>`;
const EV_VISIT = SV('<path opacity=".35" d="M13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5z"/><path d="M3 11h8.2l-2.6-2.6 1.4-1.4 5 5-5 5-1.4-1.4 2.6-2.6H3z"/>');
const EV_CLICK = SV('<circle cx="9" cy="9" r="6" opacity=".3"/><path d="M8.5 7.5 20 12l-4.6 1.5L19 17.2 17.2 19l-3.7-3.6L12 20z"/>');
const PAGE_ICON = { '/': 'home', '/topics': 'book', '/tutor': 'chat', '/pisa': 'target', '/leaderboard': 'trophy', '/wallet': 'wallet', '/friends': 'users', '/profile': 'user', '/settings': 'settings', '/admin': 'shield', '/owner': 'shield' };
const pageIcon = (p) => navIcon(PAGE_ICON[p] || (p.startsWith('/friends') ? 'users' : p.startsWith('/topic') || p.startsWith('/practice') ? 'book' : 'home'));
const evIcon = (e) => (e.kind === 'visit' ? EV_VISIT : e.kind === 'page' ? pageIcon(e.name) : EV_CLICK);
const ROLE = { guest: 'Гость', user: 'Ученик', jury: 'Жюри' };

async function load(force = false) {
  if (O.loading || !isOwner()) return;
  if (!force && Date.now() - O.at < 10000) return;
  O.loading = true;
  try {
    const [stats, feed, users] = await Promise.all([
      rest('/rest/v1/rpc/admin_stats', { method: 'POST', body: { p_days: O.days } }),
      rest('/rest/v1/rpc/admin_feed', { method: 'POST', body: { p_limit: 60 } }),
      rest('/rest/v1/rpc/admin_users', { method: 'POST', body: { p_days: O.days } }).catch(() => null), // если v2 ещё не запущен
    ]);
    O.stats = stats; O.feed = feed; O.users = users; O.err = '';
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

function visitorsHtml() {
  if (!O.users) return `<section class="panel own-vis"><div class="sec-head"><h2>${t('own.visitorsT')}</h2></div><p class="note">${t('own.visSetup')}</p></section>`;
  const ROLE_IC = { guest: 'user', user: 'check', jury: 'trophy' };
  const maxSecs = Math.max(1, ...O.users.map((x) => Number(x.total_secs || 0)));
  const all = O.users.map((u) => ({ ...u, own: isOwn(u.visitor, u.user_id, u) }));
  const match = (r) => !O.q || `${r.email || ''} ${r.visitor} ${ROLE[r.role] || ''}`.toLowerCase().includes(O.q.toLowerCase());
  const others = all.filter((r) => !r.own && match(r));
  const ours = all.filter((r) => r.own && match(r));
  const label = (r) => r.email || `${ROLE[r.role] || r.role} #${String(r.visitor).slice(-5).toUpperCase()}`;
  const sum = (rows) => rows.reduce((a, r) => a + Number(r.total_secs || 0), 0);
  const row = (r) => `<div class="own-tr ${r.own ? 'own-mine' : ''}">
        <span class="own-who"><span class="own-av r-${r.role}">${icon(ROLE_IC[r.role] || 'user', 15)}</span><span><b>${esc(label(r))}</b><small>${ROLE[r.role] || r.role}, ${esc(r.device || '?')}${r.city ? `, ${esc(r.city)}` : ''}${distOf(r) != null ? `, ${tf('own.kmAway', { n: distOf(r) < 1 ? '<1' : Math.round(distOf(r)) })}` : ''}${r.visitor === deviceId() ? `, <em>${t('own.thisDevice')}</em>` : isNear(r) ? `, <em>${t('own.near')}</em>` : ''}</small></span></span>
        <span class="own-time"><b>${dur(r.total_secs)}</b><i style="width:${Math.max(3, Math.round(100 * Number(r.total_secs || 0) / maxSecs))}%"></i></span>
        <span>${fmt(r.sessions)}</span>
        <span>${fmt(r.pages)} / ${fmt(r.actions)}</span>
        <span class="own-last">${fmtDate(new Date(r.last_seen).getTime())}</span>
        <span>${r.visitor === deviceId() || (r.user_id && r.user_id === myId()) ? '' : `<button class="btn btn-soft btn-sm" data-act="own-mark" data-id="${esc(r.visitor)}">${t(r.own ? 'own.unmark' : 'own.mark')}</button>`}</span>
      </div>`;
  const head = `<div class="own-tr own-th"><span>${t('own.colWho')}</span><span>${t('own.colTime')}</span><span>${t('own.colVisits')}</span><span>${t('own.colPages')}</span><span>${t('own.colLast')}</span><span></span></div>`;
  const pl = getPlace();
  const placePanel = `<section class="panel own-place">
    <span class="own-place-ic">${icon('target', 20)}</span>
    <div><b>${t('own.placeT')}</b><small>${pl ? tf('own.placeIs', { c: esc(pl.city || '?'), lat: pl.lat, lon: pl.lon }) : t('own.placeNone')}</small></div>
    <div class="chips">${[1, 3, 10, 30].map((r) => `<button class="chip ${(pl?.radius || 3) === r ? 'on' : ''}" data-act="own-radius" data-id="${r}" ${pl ? '' : 'disabled'}>${r} ${t('own.km')}</button>`).join('')}</div>
    <button class="btn btn-soft btn-sm" data-act="own-place">${icon('target', 14)} ${t(pl ? 'own.placeUpdate' : 'own.placeSet')}</button>
  </section>`;
  // Сводка по группам: сколько времени в сумме и в среднем проводят гости, ученики и жюри (без нас)
  const byRole = ['guest', 'user', 'jury'].map((role) => {
    const list = all.filter((r) => !r.own && r.role === role);
    const total = sum(list);
    return { role, n: list.length, total, avg: list.length ? total / list.length : 0, top: list.slice().sort((a, b) => Number(b.total_secs) - Number(a.total_secs))[0] };
  });
  const roleCards = `<div class="own-roles">${byRole.map((g) => `<div class="own-rc r-${g.role}">
      <div class="own-rc-h"><span class="own-av r-${g.role}">${icon(ROLE_IC[g.role], 15)}</span><b>${t('own.grp_' + g.role)}</b><span class="count">${g.n}</span></div>
      <p class="own-rc-big">${dur(g.total)}</p>
      <small>${tf('own.grpAvg', { a: dur(g.avg) })}</small>
      ${g.top && Number(g.top.total_secs) > 0 ? `<small>${tf('own.grpTop', { who: esc(label(g.top)), t: dur(g.top.total_secs) })}</small>` : ''}
    </div>`).join('')}</div>`;
  return `${placePanel}${roleCards}<section class="panel own-vis">
    <div class="sec-head"><h2>${t('own.othersT')}</h2><span class="count">${others.length}</span></div>
    <div class="own-vis-bar">
      <label class="search own-search">${icon('search', 16)}<input id="ownQ" placeholder="${esc(t('own.searchPh'))}" value="${esc(O.q)}"></label>
      <span class="own-sum">${tf('own.sum', { n: others.length, t: dur(sum(others)), a: dur(others.length ? sum(others) / others.length : 0) })}</span>
    </div>
    <div class="own-table">${head}${others.map(row).join('') || `<p class="empty">${t('own.noOthers')}</p>`}</div>
  </section>
  <details class="panel own-vis own-ours" ${O.showOurs ? 'open' : ''}>
    <summary class="sec-head"><h2>${t('own.oursT')}</h2><span class="count">${ours.length}</span><span class="own-sum">${tf('own.oursSum', { t: dur(sum(ours)) })}</span></summary>
    <p class="note" style="margin:4px 0 10px">${t('own.oursNote')}</p>
    <div class="own-table">${head}${ours.map(row).join('')}</div>
  </details>`;
}

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
      ${kpi('users', 'lilac', fmt(s.visitors ?? s.sessions), t('own.visitors'))}
      ${kpi('clock', 'sky', dur(s.totalSecs || 0), t('own.totalTime'))}
      ${kpi('user', 'mint', fmt(s.users), t('own.users'))}
      ${kpi('trophy', 'cream', fmt(s.jury), t('own.jury'))}
      ${kpi('sparkles', 'sky', fmt(s.signups), t('own.signups'))}
      ${kpi('bolt', 'mint', fmt(s.actions), t('own.actions'))}
    </div>
    ${visitorsHtml()}
    <div class="own-grid">
      <section class="panel"><div class="sec-head"><h2>${t('own.byDay')}</h2></div>
        <div class="own-days">${days.map((d) => `<span class="own-day" title="${d.s} · ${d.e}"><i style="height:${Math.max(6, Math.round((100 * d.s) / maxDay))}%"></i><em>${new Date(d.d).getDate()}</em></span>`).join('') || `<p class="empty">${t('own.empty')}</p>`}</div>
        <div class="own-split">${(s.roles || []).map((r) => `<span class="own-role r-${r.role}">${ROLE[r.role] || r.role}: <b>${fmt(r.c)}</b></span>`).join('')}${(s.devices || []).map((d) => `<span class="own-role">${esc(d.device)}: <b>${fmt(d.c)}</b></span>`).join('')}</div>
      </section>
      <section class="panel"><div class="sec-head"><h2>${t('own.topPages')}</h2></div>${bars(s.topPages, (x) => pageName(x.name))}</section>
      <section class="panel"><div class="sec-head"><h2>${t('own.topActions')}</h2></div>${bars(s.topActions, (x) => actName(x.name))}</section>
      <section class="panel own-feed-p"><div class="sec-head"><h2>${t('own.feed')}</h2><span class="count">${O.feed?.length || 0}</span></div>
        <div class="own-feed">${(O.feed || []).map((e) => `<div class="own-ev k-${e.kind}">
          <span class="own-ev-ic">${evIcon(e)}</span>
          <span class="own-ev-main"><b>${esc(e.kind === 'page' ? pageName(e.name) : e.kind === 'action' ? actName(e.name) : t('own.visit') + ' ' + String(e.name).replace(/^from /, '').replace(/^direct$/, t('own.direct')))}</b>
            <small>${esc(e.email || (ROLE[e.role] || e.role) + ' #' + String(e.session_id).slice(0, 5))}, ${esc(e.device || '')}</small></span>
          <time>${fmtDate(new Date(e.created_at).getTime())}</time></div>`).join('') || `<p class="empty">${t('own.empty')}</p>`}</div>
      </section>
    </div>`}
    <p class="note own-note">${icon('shield', 13)} ${t('own.privacy')}</p>`;
}

export function registerOwnerActions(rerender) {
  rerenderRef = rerender;
  action('own-days', ({ id }) => { O.days = Number(id) || 7; O.stats = null; O.users = null; rerender(); load(true); });
  document.addEventListener('toggle', (e) => { if (e.target?.classList?.contains('own-ours')) O.showOurs = e.target.open; }, true);
  action('own-place', async () => {
    try {
      const g = await (await fetch('/api/geo', { cache: 'no-store' })).json();
      if (g?.lat == null) { alert(t('own.placeFail')); return; }
      setPlace({ ...g, radius: getPlace()?.radius || 3 });
      rerender();
    } catch { alert(t('own.placeFail')); }
  });
  action('own-radius', ({ id }) => { const p = getPlace(); if (!p) return; setPlace({ ...p, radius: Number(id) || 3 }); rerender(); });
  action('own-mark', ({ id }) => {
    const list = ownList();
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    try { localStorage.setItem(OWN_KEY, JSON.stringify(next)); } catch { /* память */ }
    rerender();
  });
  document.addEventListener('input', (e) => {
    if (e.target?.id !== 'ownQ') return;
    O.q = e.target.value;
    clearTimeout(O.qt); O.qt = setTimeout(rerender, 250);
  });
}
