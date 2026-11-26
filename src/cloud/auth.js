/**
 * Аккаунты и облачный прогресс через Supabase — без сторонних библиотек.
 *
 * Работаем напрямую с REST API Supabase (Auth + PostgREST), поэтому сайту
 * не нужен лишний скрипт и всё продолжает работать офлайн:
 *  • сессия хранится в localStorage; без сети ученик остаётся «вошедшим»
 *    и занимается как раньше;
 *  • прогресс уходит в таблицу public.profiles (одна строка на ученика,
 *    RLS: каждый видит только свою), когда есть интернет.
 *
 * Адрес Supabase и публичный ключ приходят с /api/config (Vercel) и
 * кэшируются, чтобы вход работал и после перезапуска без сети.
 */

import { getState, getProfile, replaceProfile, subscribe } from '../state.js';

const CFG_KEY = 'nasstudy.cloud';
const SES_KEY = 'nasstudy.session';
const SYNC_KEY = 'nasstudy.syncedAt';

let cfg = null;
let session = null;
const listeners = new Set();

/* ─── Конфигурация и сессия ───────────────────────────────────────────── */

const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const writeJson = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* память */ } };

export async function loadCloudConfig() {
  cfg = readJson(CFG_KEY);
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      cfg = j.supabase || null;
      writeJson(CFG_KEY, cfg);
    }
  } catch { /* офлайн — берём из кэша */ }
  return cfg;
}

export const authAvailable = () => Boolean(cfg && cfg.url && cfg.anonKey);
export const isLoggedIn = () => Boolean(session && session.user);
export const currentUser = () => session?.user || null;
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emitAuth = () => listeners.forEach((fn) => fn(currentUser()));

function setSession(s) {
  session = s && s.access_token ? {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
    user: { id: s.user?.id, email: s.user?.email },
  } : null;
  writeJson(SES_KEY, session);
  emitAuth();
}

/* ─── Запросы к Supabase ──────────────────────────────────────────────── */

async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
  const r = await fetch(cfg.url + path, {
    method,
    headers: {
      apikey: cfg.anonKey,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* пустой ответ */ }
  if (!r.ok) {
    const e = new Error(data?.msg || data?.error_description || data?.message || data?.error || `HTTP ${r.status}`);
    e.status = r.status;
    e.code = data?.error_code || data?.code || '';
    throw e;
  }
  return data;
}

/** Ошибку Supabase превращаем в ключ перевода для понятного сообщения. */
export function authErrorKey(e) {
  const m = `${e?.code} ${e?.message}`.toLowerCase();
  if (!navigator.onLine || /failed to fetch|networkerror|load failed/.test(m)) return 'auth.errOffline';
  if (/invalid login|invalid_credentials|invalid grant/.test(m)) return 'auth.errCreds';
  if (/already registered|user_already_exists|already been registered/.test(m)) return 'auth.errExists';
  if (/password.*(short|least|weak)|weak_password/.test(m)) return 'auth.errWeak';
  if (/email.*invalid|validate email|email_address_invalid/.test(m)) return 'auth.errEmail';
  if (/rate limit|too many|over_request|over_email/.test(m)) return 'auth.errRate';
  if (/not confirmed|email_not_confirmed/.test(m)) return 'auth.errConfirm';
  return 'auth.errGeneric';
}

/** Регистрация. Возвращает 'ok' или 'confirm' (если в Supabase включено подтверждение почты). */
export async function signUp(email, password) {
  const d = await api('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (d?.access_token) { setSession(d); await afterLogin(); return 'ok'; }
  return 'confirm';
}

export async function signIn(email, password) {
  const d = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  setSession(d);
  await afterLogin();
}

export async function signOut() {
  const token = session?.access_token;
  setSession(null);
  writeJson(SYNC_KEY, null);
  if (token && navigator.onLine) { try { await api('/auth/v1/logout', { method: 'POST', token }); } catch { /* уже вышли локально */ } }
}

/** Свежий токен: если истёк и есть сеть — обновляем; офлайн — работаем со старым. */
async function token() {
  if (!session) return null;
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  if (!navigator.onLine) return null;
  try {
    const d = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
    setSession(d);
    return session.access_token;
  } catch (e) {
    if (e.status === 400 || e.status === 401) setSession(null); // сессию отозвали — нужно войти заново
    return null;
  }
}

/* ─── Облачный прогресс ───────────────────────────────────────────────── */

let pushTimer = null;
let syncing = false;
export let syncState = 'idle'; // idle | syncing | ok | offline | error

async function pull() {
  const t = await token();
  if (!t) return null;
  const rows = await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=data,updated_at`, { token: t });
  return rows?.[0] || null;
}

async function push() {
  const t = await token();
  if (!t) { syncState = navigator.onLine ? 'error' : 'offline'; return; }
  const now = new Date().toISOString();
  await api('/rest/v1/profiles?on_conflict=id', {
    method: 'POST', token: t,
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { id: session.user.id, email: session.user.email, data: getProfile(), updated_at: now },
  });
  writeJson(SYNC_KEY, now);
  syncState = 'ok';
}

/** После входа: если в облаке есть прогресс новее — берём его, иначе отправляем свой. */
async function afterLogin() {
  try {
    syncState = 'syncing';
    const row = await pull();
    const local = getProfile();
    const localHasProgress = (local.attempts || 0) > 0 || (local.pisa || []).length > 0;
    if (row && row.data && (!localHasProgress || (row.data.attempts || 0) >= (local.attempts || 0))) {
      replaceProfile({ ...row.data, onboarded: true, tourDone: local.tourDone || row.data.tourDone });
      writeJson(SYNC_KEY, row.updated_at);
      syncState = 'ok';
    } else {
      await push();
    }
  } catch (e) {
    syncState = navigator.onLine ? 'error' : 'offline';
    console.warn('NASstudy: синхронизация не удалась', e);
  }
}

/** Любое изменение прогресса уходит в облако через 2,5 с (пачкой). */
function schedulePush() {
  if (!isLoggedIn()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    if (syncing || !navigator.onLine) { syncState = 'offline'; return; }
    syncing = true;
    try { await push(); } catch (e) { syncState = 'error'; console.warn('NASstudy: не удалось сохранить в облако', e); }
    syncing = false;
  }, 2500);
}

/* ─── Вход через Google (провайдер включается в Supabase) ─────────────── */

const GOOGLE_KEY = 'nasstudy.google';
let googleOn = readJson(GOOGLE_KEY) === true;
export const googleEnabled = () => authAvailable() && googleOn;

/** Узнаём у Supabase, включён ли Google (кэшируем для офлайна). */
async function loadProviders() {
  if (!authAvailable() || !navigator.onLine) return;
  try {
    const s = await api('/auth/v1/settings');
    googleOn = Boolean(s?.external?.google);
    writeJson(GOOGLE_KEY, googleOn);
  } catch { /* оставляем кэш */ }
}

/** Переход на страницу Google; Supabase вернёт ученика обратно с токенами в адресе. */
export function googleSignIn() {
  if (!authAvailable()) return;
  const back = location.origin + location.pathname;
  location.href = `${cfg.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
}

/**
 * Возврат от Google: в адресе «#access_token=…&refresh_token=…».
 * Забираем токены, сразу убираем их из адреса и истории.
 * Возвращает 'ok', 'error' или null (если это не возврат от Google).
 */
async function handleOAuthReturn() {
  const h = location.hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error)=/.test(h)) return null;
  const q = new URLSearchParams(h);
  history.replaceState(null, '', location.pathname + '#/');
  if (q.get('error')) return 'error';
  const access = q.get('access_token');
  try {
    const user = await api('/auth/v1/user', { token: access });
    setSession({ access_token: access, refresh_token: q.get('refresh_token'), expires_in: Number(q.get('expires_in')) || 3600, user });
    await afterLogin();
    return 'ok';
  } catch {
    return 'error';
  }
}

let oauthResult = null;
/** Результат возврата от Google (один раз), чтобы показать сообщение. */
export function takeOAuthResult() { const r = oauthResult; oauthResult = null; return r; }

export async function initAuth() {
  session = readJson(SES_KEY);
  await loadCloudConfig();
  if (authAvailable()) {
    oauthResult = await handleOAuthReturn();
    loadProviders().then(() => emitAuth());
  }
  subscribe(schedulePush);
  window.addEventListener('online', () => { if (isLoggedIn()) schedulePush(); });
  if (isLoggedIn() && navigator.onLine) token().then(() => schedulePush());
  emitAuth();
}

export const lastSyncedAt = () => readJson(SYNC_KEY);
export const hasState = () => Boolean(getState());
