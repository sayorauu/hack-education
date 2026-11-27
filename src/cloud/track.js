/**
 * Статистика для главного админа: заходы, страницы и нажатые кнопки.
 *
 * Пишем только названия (например, «page /topics» или «action pr-check»),
 * без текста сообщений, ответов и всего, что вводят в поля. События копятся
 * пачкой и уходят раз в несколько секунд (и при закрытии вкладки), чтобы не
 * нагружать слабый интернет. Ученик может отключить статистику в Настройках.
 */

import { getProfile, getSettings } from '../state.js';
import { authAvailable, isLoggedIn, accessToken, cloudConfig } from './auth.js';

const SID_KEY = 'nasstudy.sid';
let queue = [];
let timer = null;
let disabledByServer = false; // таблицы ещё нет — молча перестаём слать

function sessionId() {
  try {
    let s = sessionStorage.getItem(SID_KEY);
    if (!s) { s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); sessionStorage.setItem(SID_KEY, s); }
    return s;
  } catch { return 'nosession' + Date.now().toString(36); }
}

const role = () => (getProfile().jury ? 'jury' : isLoggedIn() ? 'user' : 'guest');
const device = () => (matchMedia('(max-width: 760px)').matches ? 'mobile' : matchMedia('(max-width: 1100px)').matches ? 'tablet' : 'desktop');
const allowed = () => authAvailable() && !disabledByServer && getSettings().analytics !== false;

/** Убираем из адреса личное: id друга, параметры запроса. */
export function cleanPath(path) {
  return ('/' + String(path || '/').replace(/^#?\/?/, ''))
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
    .slice(0, 60) || '/';
}

export function track(kind, name) {
  if (!allowed() || !name) return;
  queue.push({ session_id: sessionId(), role: role(), kind, name: String(name).slice(0, 60), device: device(), lang: getSettings().lang });
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(flush, 6000);
}

async function flush(useBeacon = false) {
  clearTimeout(timer); timer = null;
  if (!queue.length || !allowed() || !navigator.onLine) return;
  const batch = queue.splice(0, 50);
  const cfg = cloudConfig();
  const token = (await accessToken().catch(() => null)) || cfg.anonKey;
  try {
    const r = await fetch(cfg.url + '/rest/v1/events', {
      method: 'POST',
      keepalive: useBeacon,
      headers: { apikey: cfg.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(batch),
    });
    if (r.status === 404 || r.status === 400) disabledByServer = true; // analytics.sql ещё не запущен
  } catch { /* нет сети — эти события не страшно потерять */ }
}

/** Подключаем: заход на сайт и отправка при сворачивании вкладки. */
export function initTracking() {
  setTimeout(() => track('visit', document.referrer ? 'from ' + (() => { try { return new URL(document.referrer).host; } catch { return 'link'; } })() : 'direct'), 1500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
}

/* ─── Для главного админа ─────────────────────────────────────────────── */

let ownerState = null; // null — не проверяли, true/false — ответ базы
export const isOwner = () => ownerState === true;

export async function checkOwner() {
  if (!authAvailable() || !isLoggedIn() || getProfile().jury) { ownerState = false; return false; }
  try {
    const cfg = cloudConfig();
    const token = await accessToken();
    const r = await fetch(cfg.url + '/rest/v1/rpc/is_super_admin', { method: 'POST', headers: { apikey: cfg.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
    ownerState = r.ok ? (await r.json()) === true : false;
  } catch { ownerState = false; }
  return ownerState;
}
