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
const DID_KEY = 'nasstudy.did'; // постоянный номер устройства (браузера): разные устройства = разные посетители
let queue = [];
let timer = null;
let disabledByServer = false; // таблицы ещё нет — молча перестаём слать
let schema = 3;                // 3 — всё есть; 2 — нет колонок места; 1 — нет device_id / secs
const GEO_KEY = 'nasstudy.geo';
let geo = null;                // { city, country, lat, lon } — примерно по IP, обновляется раз в сутки
async function loadGeo() {
  try {
    const c = JSON.parse(localStorage.getItem(GEO_KEY) || 'null');
    if (c && Date.now() - c.ts < 864e5) { geo = c.g; return; }
    const r = await fetch('/api/geo', { cache: 'no-store' });
    if (!r.ok) return;
    geo = await r.json();
    localStorage.setItem(GEO_KEY, JSON.stringify({ ts: Date.now(), g: geo }));
  } catch { /* без места — не страшно */ }
}
// Место прикрепляем к заходу и к входу/регистрации — этого хватает, чтобы понять, откуда человек
const GEO_EVENTS = new Set(['visit', 'auth-submit', 'auth-google', 'jury-login', 'ob-jury']);

function sessionId() {
  try {
    let s = sessionStorage.getItem(SID_KEY);
    if (!s) { s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); sessionStorage.setItem(SID_KEY, s); }
    return s;
  } catch { return 'nosession' + Date.now().toString(36); }
}

export function deviceId() {
  try {
    let d = localStorage.getItem(DID_KEY);
    if (!d) { d = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem(DID_KEY, d); }
    return d;
  } catch { return sessionId(); }
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

export function track(kind, name, secs) {
  if (!allowed() || !name) return;
  if (schema < 2 && kind === 'time') return;
  const ev = { session_id: sessionId(), role: role(), kind, name: String(name).slice(0, 60), device: device(), lang: getSettings().lang };
  // у всех строк пачки одинаковые поля (так требует база)
  if (schema >= 2) { ev.device_id = deviceId(); ev.secs = secs != null ? Math.max(0, Math.min(600, Math.round(secs))) : null; }
  if (schema >= 3) {
    const g = GEO_EVENTS.has(kind) || GEO_EVENTS.has(name) ? geo : null;
    ev.city = g?.city || null; ev.country = g?.country || null; ev.lat = g?.lat ?? null; ev.lon = g?.lon ?? null;
  }
  queue.push(ev);
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
    if (r.status === 404) disabledByServer = true; // analytics.sql ещё не запущен
    if (r.status === 400 && schema > 1) {
      // в базе ещё нет новых колонок (не запущена свежая версия analytics.sql): шлём попроще
      schema -= 1;
      const strip = ({ city, country, lat, lon, ...a }) => (schema >= 2 ? a : (({ device_id, secs, ...b }) => b)(a));
      queue.unshift(...batch.filter((e) => schema >= 2 || e.kind !== 'time').map(strip));
      setTimeout(flush, 500);
    } else if (r.status === 400) disabledByServer = true;
  } catch { /* нет сети — эти события не страшно потерять */ }
}

/* Время на сайте: считаем только когда вкладка открыта и человек что-то
   делал за последние 2 минуты (двигал мышь, листал, нажимал, печатал). */
let lastActivity = Date.now();
let activeSecs = 0;
const TICK = 15;
function tickTime() {
  if (document.visibilityState === 'visible' && Date.now() - lastActivity < 120000) activeSecs += TICK;
}
function flushTime() {
  if (activeSecs > 0) { track('time', 'active', activeSecs); activeSecs = 0; }
}

/** Подключаем: заход на сайт, время на сайте и отправка при сворачивании вкладки. */
export function initTracking() {
  const geoReady = loadGeo();
  ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'].forEach((ev) => addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true, capture: true }));
  setInterval(tickTime, TICK * 1000);
  setInterval(flushTime, 60000);
  setTimeout(() => geoReady.then(() => track('visit', document.referrer ? 'from ' + (() => { try { return new URL(document.referrer).host; } catch { return 'link'; } })() : 'direct')), 1500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flushTime(); flush(true); } else lastActivity = Date.now(); });
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
