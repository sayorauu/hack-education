/**
 * Страница «Друзья»: мой код, добавление по коду, заявки, список друзей,
 * переписка и «Поделиться достижением».
 *
 * Данные приходят из Supabase асинхронно: страница сначала рисуется из того,
 * что уже загружено, затем обновляется. Пока страница открыта, раз в
 * несколько секунд подтягиваем новые сообщения (без постоянного соединения —
 * так проще и надёжнее на слабом интернете).
 */

import { icon } from './icons.js';
import { t, tf, fmtDate, loc } from '../i18n.js';
import { getProfile, masteryOf } from '../state.js';
import { TOPICS } from '../data/curriculum.js';
import { authAvailable, isLoggedIn, myId } from '../cloud/auth.js';
import { myCard, loadFriends, addByCode, accept, removeLink, loadChat, sendMessage, markRead, unreadCounts, socialErrorKey } from '../cloud/social.js';
import { header, esc, fmt, photoAva } from './kit.js';
import { action, toast } from './dom.js';
import { requireAuth } from './auth.js';
import { levelBadge } from './levels.js';
import { friendExtras, streakBanner, helpPanel, explainBubble, thanksBubble, creditThanks, maybeFriendsTour } from './league.js';

const F = { card: null, list: null, err: '', loading: false, loadedAt: 0, addMsg: '', addOk: false, chat: { id: null, msgs: null, err: '' }, sending: false };
let rerenderRef = () => {};
let pollTimer = null;
let unreadTotal = 0;

const ava = (card, size = 46) => photoAva(card, size);

/* ─── Достижения, которыми можно поделиться ───────────────────────────── */

/** Русские окончания: 1 задание, 2 задания, 5 заданий. В казахском {w} не используется. */
const plRu = (n, [one, few, many]) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

export function myAchievements() {
  const p = getProfile();
  const out = [];
  if (p.correct > 0) out.push({ type: 'solved', icon: 'check', value: p.correct, label: tf('ach.solved', { n: p.correct, w: plRu(p.correct, ['задание', 'задания', 'заданий']) }) });
  if (p.streakDays > 1) out.push({ type: 'streak', icon: 'flame', value: p.streakDays, label: tf('ach.streak', { n: p.streakDays, w: plRu(p.streakDays, ['день', 'дня', 'дней']) }) });
  const last = (p.pisa || [])[0];
  if (last) out.push({ type: 'pisa', icon: 'target', value: last.total, label: tf('ach.pisa', { n: last.total, w: plRu(last.total, ['балл', 'балла', 'баллов']) }) });
  const best = TOPICS.map((tp) => ({ tp, m: masteryOf(tp.id) })).filter((x) => x.m >= 0.6).sort((a, b) => b.m - a.m)[0];
  if (best) out.push({ type: 'topic', icon: 'star', value: Math.round(best.m * 100), label: tf('ach.topic', { t: loc(best.tp), n: Math.round(best.m * 100) }) });
  if (p.attempts >= 5) out.push({ type: 'accuracy', icon: 'trend', value: Math.round((100 * p.correct) / p.attempts), label: tf('ach.accuracy', { n: Math.round((100 * p.correct) / p.attempts) }) });
  return out;
}
const ACH_ICON = { solved: 'check', streak: 'flame', pisa: 'target', topic: 'star', accuracy: 'trend' };

/* ─── Загрузка ────────────────────────────────────────────────────────── */

async function refreshList(force = false) {
  if (F.loading || !isLoggedIn()) return;
  if (!force && Date.now() - F.loadedAt < 4000) return;
  F.loading = true;
  try {
    if (!F.card) F.card = await myCard();
    F.list = await loadFriends();
    F.err = '';
    unreadTotal = F.list.friends.reduce((a, f) => a + f.unread, 0);
    paintBadge();
  } catch (e) {
    F.err = socialErrorKey(e);
  }
  F.loading = false;
  F.loadedAt = Date.now();
  if (location.hash.startsWith('#/friends')) rerenderRef();
}

async function refreshChat(id, scroll = false) {
  try {
    const msgs = await loadChat(id);
    const changed = !F.chat.msgs || F.chat.msgs.length !== msgs.length || F.chat.id !== id;
    F.chat = { id, msgs, err: '' };
    if (msgs.some((m) => m.sender === id && !m.read_at)) { await markRead(id); refreshUnread(); }
    if (changed && location.hash.startsWith('#/friends/' + id)) { rerenderRef(); if (changed || scroll) scrollChat(); }
  } catch (e) {
    F.chat = { id, msgs: F.chat.msgs, err: socialErrorKey(e) };
    if (location.hash.startsWith('#/friends/' + id)) rerenderRef();
  }
}

const scrollChat = () => requestAnimationFrame(() => { const el = document.getElementById('frLog'); if (el) el.scrollTop = el.scrollHeight; });

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    const h = location.hash;
    if (!h.startsWith('#/friends') || !isLoggedIn() || !navigator.onLine) { clearInterval(pollTimer); pollTimer = null; return; }
    const id = h.split('?')[0].split('/')[2];
    if (id) refreshChat(id); else refreshList(true);
  }, 5000);
}

/** Значок непрочитанных на пункте меню «Друзья». */
export async function refreshUnread() {
  if (!isLoggedIn() || !navigator.onLine) return;
  try {
    creditThanks();
    const u = await unreadCounts();
    unreadTotal = Object.values(u).reduce((a, b) => a + b, 0);
    paintBadge();
  } catch { /* таблиц нет — значка не будет */ }
}
export function paintBadge() {
  const a = document.querySelector('.rail .nav[href="#/friends"]');
  if (!a) return;
  let b = a.querySelector('.nav-badge');
  if (!unreadTotal) { b?.remove(); return; }
  if (!b) { b = document.createElement('i'); b.className = 'nav-badge'; a.appendChild(b); }
  b.textContent = unreadTotal > 9 ? '9+' : String(unreadTotal);
}

/* ─── Экраны ──────────────────────────────────────────────────────────── */

function gate() {
  if (!authAvailable()) return `<section class="panel fr-empty">${icon('users', 28)}<p>${t('fr.unavailable')}</p></section>`;
  if (!isLoggedIn()) {
    return `<section class="panel fr-empty">${icon('lock', 28)}<h2>${t('fr.loginT')}</h2><p class="note">${t('fr.loginB')}</p>
      <button class="btn" data-act="auth-open" data-id="signup">${t('auth.tabSignup')}</button></section>`;
  }
  if (!navigator.onLine) return `<section class="panel fr-empty">${icon('cloud', 28)}<p>${t('fr.errOffline')}</p></section>`;
  return '';
}

const errBox = (key) => (key ? `<div class="fr-err">${icon('shield', 16)}<span>${t(key)}</span></div>` : '');

export function renderFriends(params, seg) {
  maybeFriendsTour();
  const g = gate();
  if (g) return `${header(t('fr.title'), t('fr.sub'))}<button class="btn btn-soft btn-sm fr-how" data-act="fr-tour">${icon('hint', 14)} ${t('ft.how')}</button>${g}`;
  const chatId = seg[1];
  startPolling();
  if (chatId) return renderChat(chatId);
  if (!F.list && !F.err) refreshList(true); else refreshList();

  const share = params.get('share');
  const ach = share ? myAchievements().find((a) => a.type === share) : null;
  const L = F.list || { friends: [], incoming: [], outgoing: [] };
  const loading = !F.list && !F.err;

  const friendRow = (f) => {
    const s = f.card.stats || {};
    return `<div class="fr-row">
      ${ava(f.card)}
      <div class="fr-info"><b>${esc(f.card.name || t('fr.noName'))} ${levelBadge(s.lvl)}</b>
        <small>${f.card.grade ? tf('common.grade', { n: f.card.grade }) : ''}</small>
        <span class="fr-stats">
          <span>${icon('check', 12)} ${fmt(s.solved || 0)}</span>
          <span>${icon('trend', 12)} ${s.accuracy || 0}%</span>
          <span>${icon('flame', 12)} ${s.streak || 0}</span>
          ${s.pisa ? `<span>${icon('target', 12)} ${s.pisa}</span>` : ''}
        </span>${friendExtras(f)}</div>
      ${ach
        ? `<button class="btn btn-sm" data-act="fr-share-to" data-id="${f.id}" data-type="${ach.type}">${icon('send', 14)} ${t('fr.send')}</button>`
        : `<a class="btn btn-soft btn-sm fr-open" href="#/friends/${f.id}">${icon('chat', 14)} ${t('fr.write')}${f.unread ? `<i class="fr-unread">${f.unread}</i>` : ''}</a>`}
    </div>`;
  };

  return `
    ${header(t('fr.title'), t('fr.sub'))}
    <button class="btn btn-soft btn-sm fr-how" data-act="fr-tour">${icon('hint', 14)} ${t('ft.how')}</button>
    ${errBox(F.err)}
    ${streakBanner(L.friends)}
    ${ach ? `<div class="fr-share-banner">${icon(ACH_ICON[ach.type] || 'trophy', 18)}<span>${tf('fr.shareChoose', { a: esc(ach.label) })}</span><a class="btn btn-soft btn-sm" href="#/friends">${t('common.close')}</a></div>` : ''}
    <div class="fr-grid">
      <div class="fr-col">
        <section class="panel fr-code">
          <p class="note">${t('fr.myCode')}</p>
          <div class="fr-code-row"><b class="fr-code-val">${F.card?.friend_code ? esc(F.card.friend_code) : '······'}</b>
            <button class="btn btn-soft btn-sm" data-act="fr-copy" ${F.card?.friend_code ? '' : 'disabled'}>${icon('stack', 14)} ${t('fr.copy')}</button></div>
          <p class="note">${t('fr.codeHint')}</p>
        </section>
        <section class="panel">
          <div class="sec-head"><h2>${t('fr.add')}</h2></div>
          <form class="fr-add" data-act="fr-add">
            <input class="input fr-add-input" id="frAddCode" name="code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-label="${esc(t('fr.add'))}">
            <button class="btn" type="submit">${icon('users', 16)} ${t('fr.addBtn')}</button>
          </form>
          ${F.addMsg ? `<p class="fr-add-msg ${F.addOk ? 'ok' : 'bad'}">${esc(F.addMsg)}</p>` : ''}
        </section>
        ${L.incoming.length ? `<section class="panel">
          <div class="sec-head"><h2>${t('fr.incoming')}</h2><span class="count">${L.incoming.length}</span></div>
          ${L.incoming.map((r) => `<div class="fr-row">${ava(r.card, 40)}<div class="fr-info"><b>${esc(r.card.name || t('fr.noName'))}</b><small>${r.card.grade ? tf('common.grade', { n: r.card.grade }) : ''}</small></div>
            <button class="btn btn-sm" data-act="fr-accept" data-id="${r.link}">${t('fr.accept')}</button>
            <button class="btn btn-soft btn-sm" data-act="fr-decline" data-id="${r.link}">${t('fr.decline')}</button></div>`).join('')}
        </section>` : ''}
        ${L.outgoing.length ? `<section class="panel">
          <div class="sec-head"><h2>${t('fr.outgoing')}</h2><span class="count">${L.outgoing.length}</span></div>
          ${L.outgoing.map((r) => `<div class="fr-row">${ava(r.card, 40)}<div class="fr-info"><b>${esc(r.card.name || t('fr.noName'))}</b><small>${t('fr.waiting')}</small></div>
            <button class="btn btn-soft btn-sm" data-act="fr-decline" data-id="${r.link}">${t('fr.cancel')}</button></div>`).join('')}
        </section>` : ''}
      </div>
      <section class="panel fr-list">
        <div class="sec-head"><h2>${t('fr.friends')}</h2><span class="count">${L.friends.length}</span></div>
        ${loading ? `<p class="empty"><span class="spin"></span></p>`
          : L.friends.length ? L.friends.map(friendRow).join('')
          : `<div class="fr-none">${icon('users', 30)}<b>${t('fr.noneT')}</b><small>${t('fr.noneB')}</small></div>`}
      </section>
    </div>
    <p class="note fr-safety">${icon('shield', 14)} ${t('fr.safety')}</p>`;
}

function renderChat(id) {
  const f = F.list?.friends.find((x) => x.id === id);
  if (!F.list) refreshList(true);
  if (F.chat.id !== id) { F.chat = { id, msgs: null, err: '' }; refreshChat(id, true); }
  const card = f?.card || { id, name: '', stats: {} };
  const me = myId();
  const msgs = F.chat.msgs;
  const bubble = (m) => {
    const mine = m.sender === me;
    const time = fmtDate(new Date(m.created_at).getTime());
    if (m.kind === 'explain') return explainBubble(m, mine, time);
    if (m.kind === 'thanks') return thanksBubble(m, mine, time, card.name);
    if (m.kind === 'achievement') {
      const type = m.payload?.type;
      return `<div class="fr-msg ach ${mine ? 'me' : 'them'}"><span class="ach-ic">${icon(ACH_ICON[type] || 'trophy', 18)}</span>
        <span><small>${t('fr.achievement')}</small><b>${esc(m.body)}</b></span><time>${fmtDate(new Date(m.created_at).getTime())}</time></div>`;
    }
    return `<div class="fr-msg ${mine ? 'me' : 'them'}"><span>${esc(m.body)}</span><time>${fmtDate(new Date(m.created_at).getTime())}${mine && m.read_at ? ` · ${icon('check', 11)}` : ''}</time></div>`;
  };
  const achs = myAchievements();
  return `
    ${header(`<span class="chat-title">${photoAva(card, 46)}${esc(card.name || t('fr.title'))}</span>`, card.grade ? tf('common.grade', { n: card.grade }) : '')}
    <a class="back-link" href="#/friends">${icon('arrowLeft', 16)} ${t('fr.back')}</a>
    ${errBox(F.chat.err)}
    ${helpPanel(id, card)}
    <section class="chat fr-chat">
      <div class="chat-log" id="frLog">
        ${msgs == null ? `<p class="empty"><span class="spin"></span></p>`
          : msgs.length ? msgs.map(bubble).join('')
          : `<div class="fr-none">${icon('chat', 28)}<b>${t('fr.chatEmptyT')}</b><small>${t('fr.chatEmptyB')}</small></div>`}
      </div>
      ${achs.length ? `<div class="fr-ach-bar"><span class="note">${t('fr.shareLbl')}</span>${achs.map((a) => `<button class="chip" data-act="fr-share-to" data-id="${id}" data-type="${a.type}">${icon(a.icon, 14)} ${esc(a.label)}</button>`).join('')}</div>` : ''}
      <form class="chat-form" data-act="fr-send" data-id="${id}">
        <label class="search">${icon('chat', 18)}<input name="msg" id="frInput" maxlength="500" autocomplete="off" placeholder="${esc(t('fr.placeholder'))}"></label>
        <button class="btn btn-round" type="submit" aria-label="${esc(t('tutor.send'))}" ${F.sending ? 'disabled' : ''}>${icon('send', 18)}</button>
      </form>
    </section>
    <div class="fr-chat-foot">
      <span class="note">${icon('shield', 13)} ${t('fr.chatSafety')}</span>
      ${f ? `<button class="btn btn-soft btn-sm fr-remove" data-act="fr-remove" data-id="${f.link}" data-name="${esc(card.name)}">${t('fr.remove')}</button>` : ''}
    </div>`;
}

/* ─── Действия ────────────────────────────────────────────────────────── */

export function registerFriendsActions(rerender) {
  rerenderRef = rerender;
  // Отправили объяснение / «спасибо» из окна — обновляем чат
  window.addEventListener('nas:chat-sent', (e) => {
    const id = e.detail;
    if (location.hash.startsWith('#/friends/' + id)) refreshChat(id, true).then(() => { rerender(); scrollChat(); });
    else rerender();
  });
  const fail = (e) => { toast(t(socialErrorKey(e))); };

  action('fr-copy', async () => {
    const c = F.card?.friend_code;
    if (!c) return;
    try { await navigator.clipboard.writeText(c); toast(t('fr.copied')); } catch { prompt(t('fr.myCode'), c); }
  });
  action('fr-add', async (_d, form) => {
    if (!requireAuth('fr.loginB')) return;
    const code = new FormData(form).get('code');
    try {
      const r = await addByCode(code);
      const name = r.user?.name || t('fr.noName');
      F.addOk = ['sent', 'accepted', 'already', 'pending'].includes(r.status);
      F.addMsg = tf('fr.add_' + r.status, { name });
      if (F.addOk) form.querySelector('input').value = ''; // код принят — поле очищаем
      await refreshList(true);
    } catch (e) { F.addOk = false; F.addMsg = t(socialErrorKey(e)); }
    rerender();
  });
  action('fr-accept', async ({ id }) => { try { await accept(id); toast(t('fr.accepted')); await refreshList(true); } catch (e) { fail(e); } });
  action('fr-decline', async ({ id }) => { try { await removeLink(id); await refreshList(true); } catch (e) { fail(e); } });
  action('fr-remove', async ({ id, name }) => {
    if (!confirm(tf('fr.removeConfirm', { name: name || t('fr.noName') }))) return;
    try { await removeLink(id); F.chat = { id: null, msgs: null, err: '' }; location.hash = '#/friends'; await refreshList(true); } catch (e) { fail(e); }
  });
  action('fr-send', async ({ id }, form) => {
    const input = form.querySelector('input');
    const v = input.value.trim();
    if (!v || F.sending) return;
    F.sending = true;
    try {
      await sendMessage(id, v);
      input.value = '';
      await refreshChat(id, true);
      scrollChat();
    } catch (e) { fail(e); }
    F.sending = false;
    document.getElementById('frInput')?.focus();
  });
  action('fr-share-to', async ({ id, type }) => {
    const a = myAchievements().find((x) => x.type === type);
    if (!a) return;
    try {
      await sendMessage(id, a.label, 'achievement', { type: a.type, value: a.value });
      toast(t('fr.shared'));
      if (location.hash.startsWith('#/friends/' + id)) { await refreshChat(id, true); scrollChat(); }
      else location.hash = '#/friends/' + id;
    } catch (e) { fail(e); }
  });
}
