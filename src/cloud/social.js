/**
 * Друзья, заявки и сообщения (Supabase: users_public, friendships, messages).
 * Все права проверяет сама база (RLS, см. supabase/social.sql): писать можно
 * только друзьям, видно только своих друзей и тех, с кем есть заявка.
 */

import { rest, myId, pushPublicCard } from './auth.js';

const enc = encodeURIComponent;

/** Ошибку переводим в понятный ключ. */
export function socialErrorKey(e) {
  const m = `${e?.code} ${e?.message}`.toLowerCase();
  if (e?.code === 'offline' || !navigator.onLine || /failed to fetch|networkerror|load failed/.test(m)) return 'fr.errOffline';
  if (e?.code === 'no_session') return 'fr.errLogin';
  if (/pgrst205|42p01|could not find the table|does not exist|42883|pgrst202/.test(m)) return 'fr.errSetup';
  if (/23505|duplicate/.test(m)) return 'fr.errDup';
  if (/row-level security|42501|permission/.test(m)) return 'fr.errPerm';
  return 'fr.errGeneric';
}

/** Мой код друга (создаётся базой при первой публикации карточки). */
export async function myCard() {
  await pushPublicCard();
  const rows = await rest(`/rest/v1/users_public?id=eq.${enc(myId())}&select=friend_code,name,grade`);
  return rows?.[0] || null;
}

/** Все заявки и друзья вместе с карточками собеседников. */
export async function loadFriends() {
  const me = myId();
  const links = await rest(`/rest/v1/friendships?select=id,requester,addressee,status,created_at&or=(requester.eq.${me},addressee.eq.${me})&order=created_at.desc`);
  const ids = [...new Set(links.map((l) => (l.requester === me ? l.addressee : l.requester)))];
  const cards = ids.length ? await rest(`/rest/v1/users_public?id=in.(${ids.join(',')})&select=id,name,grade,stats,updated_at`) : [];
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const unread = await unreadCounts();
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const l of links) {
    const other = l.requester === me ? l.addressee : l.requester;
    const item = { link: l.id, id: other, card: byId[other] || { id: other, name: '', grade: null, stats: {} }, unread: unread[other] || 0 };
    if (l.status === 'accepted') out.friends.push(item);
    else if (l.addressee === me) out.incoming.push(item);
    else out.outgoing.push(item);
  }
  out.friends.sort((a, b) => (b.unread - a.unread) || (a.card.name || '').localeCompare(b.card.name || '', 'ru'));
  return out;
}

/** Добавить по коду. Если человек уже звал меня — сразу принимаем. */
export async function addByCode(code) {
  const c = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 6) return { status: 'badCode' };
  const found = await rest('/rest/v1/rpc/find_by_code', { method: 'POST', body: { code: c } });
  const u = found?.[0];
  if (!u) return { status: 'notFound' };
  const me = myId();
  const existing = await rest(`/rest/v1/friendships?select=id,requester,addressee,status&or=(and(requester.eq.${me},addressee.eq.${u.id}),and(requester.eq.${u.id},addressee.eq.${me}))`);
  const l = existing?.[0];
  if (l) {
    if (l.status === 'accepted') return { status: 'already', user: u };
    if (l.addressee === me) { await accept(l.id); return { status: 'accepted', user: u }; }
    return { status: 'pending', user: u };
  }
  await rest('/rest/v1/friendships', { method: 'POST', headers: { prefer: 'return=minimal' }, body: { requester: me, addressee: u.id } });
  return { status: 'sent', user: u };
}

export const accept = (linkId) => rest(`/rest/v1/friendships?id=eq.${linkId}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: { status: 'accepted' } });
export const removeLink = (linkId) => rest(`/rest/v1/friendships?id=eq.${linkId}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });

/* ─── Сообщения ───────────────────────────────────────────────────────── */

export async function loadChat(otherId, limit = 80) {
  const me = myId();
  const rows = await rest(`/rest/v1/messages?select=id,sender,recipient,kind,body,payload,created_at,read_at&or=(and(sender.eq.${me},recipient.eq.${otherId}),and(sender.eq.${otherId},recipient.eq.${me}))&order=created_at.desc&limit=${limit}`);
  return rows.reverse();
}

export async function sendMessage(to, body, kind = 'text', payload = null) {
  const text = String(body || '').trim().slice(0, 500);
  if (!text) return;
  await rest('/rest/v1/messages', { method: 'POST', headers: { prefer: 'return=minimal' }, body: { sender: myId(), recipient: to, kind, body: text, payload } });
}

export async function markRead(fromId) {
  await rest(`/rest/v1/messages?sender=eq.${fromId}&recipient=eq.${myId()}&read_at=is.null`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: { read_at: new Date().toISOString() } });
}

/** Сколько непрочитанных от каждого друга. */
export async function unreadCounts() {
  const rows = await rest(`/rest/v1/messages?select=sender&recipient=eq.${myId()}&read_at=is.null&limit=500`);
  const out = {};
  rows.forEach((r) => { out[r.sender] = (out[r.sender] || 0) + 1; });
  return out;
}
