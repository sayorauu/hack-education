/**
 * Вход и регистрация (email + пароль) и «закрытые» функции для гостей.
 *
 * Гость может смотреть сайт: главную, темы и теорию, рейтинг, кошелёк.
 * Решать задания, спрашивать Капи, проходить пробный PISA и обменивать
 * монеты — только после входа. Если Supabase не подключён (например,
 * локально без ключей), ничего не закрываем: аккаунтов тогда просто нет.
 */

import { icon } from './icons.js';
import { t, tf } from '../i18n.js';
import { getProfile, resetAll } from '../state.js';
import { authAvailable, isLoggedIn, currentUser, signIn, signUp, signOut, authErrorKey, syncState, lastSyncedAt, googleEnabled, googleSignIn } from '../cloud/auth.js';
import { esc, openModal, closeModal, kapiSvg } from './kit.js';
import { action, toast } from './dom.js';
import { fmtDate } from '../i18n.js';

// Стандартный знак «G» для кнопки входа через Google
const GOOGLE_G = '<svg class="g-ic" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

let A = { mode: 'signup', reason: '', busy: false, err: '', after: null };

/** Можно ли пользоваться основными функциями прямо сейчас. */
export const canUse = () => !authAvailable() || isLoggedIn();

/** Проверка перед действием: если нельзя — открываем окно входа. */
export function requireAuth(reasonKey, after) {
  if (canUse()) return true;
  openAuth('signup', reasonKey, after);
  return false;
}

function sheetHtml() {
  const signup = A.mode === 'signup';
  return `
    <div class="auth">
      <span class="auth-bear">${kapiSvg()}</span>
      <h2>${t(signup ? 'auth.signupT' : 'auth.loginT')}</h2>
      ${A.reason ? `<p class="auth-reason">${icon('lock', 14)} ${t(A.reason)}</p>` : `<p class="note">${t('auth.sub')}</p>`}
      <div class="auth-tabs" role="tablist">
        <button type="button" class="${signup ? 'on' : ''}" data-act="auth-tab" data-id="signup" role="tab" aria-selected="${signup}">${t('auth.tabSignup')}</button>
        <button type="button" class="${!signup ? 'on' : ''}" data-act="auth-tab" data-id="login" role="tab" aria-selected="${!signup}">${t('auth.tabLogin')}</button>
      </div>
      ${googleEnabled() ? `<button type="button" class="btn btn-soft auth-google" data-act="auth-google">${GOOGLE_G} ${t('auth.google')}</button>
      <div class="auth-or"><span>${t('auth.or')}</span></div>` : ''}
      <form class="auth-form" data-act="auth-submit" novalidate>
        <label class="field"><span>${t('auth.email')}</span>
          <input class="input" name="email" type="email" autocomplete="email" inputmode="email" required placeholder="name@example.com"></label>
        <label class="field"><span>${t('auth.password')}</span>
          <input class="input" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="6" placeholder="${esc(t(signup ? 'auth.passNew' : 'auth.passPh'))}"></label>
        ${A.err ? `<p class="auth-err" role="alert">${esc(A.err)}</p>` : ''}
        <button class="btn auth-go" type="submit" ${A.busy ? 'disabled' : ''}>${A.busy ? `<span class="spin"></span>` : icon(signup ? 'sparkles' : 'arrowRight', 16)} ${t(signup ? 'auth.signupBtn' : 'auth.loginBtn')}</button>
      </form>
      <button type="button" class="auth-guest" data-act="auth-guest">${t('auth.guest')}</button>
      ${signup ? `<p class="note auth-fine">${t('auth.fine')}</p>` : ''}
    </div>`;
}

function paint() {
  const sheet = document.querySelector('#modalRoot .sheet');
  if (!sheet) return;
  const email = sheet.querySelector('input[name=email]')?.value || '';
  sheet.innerHTML = sheetHtml();
  const e = sheet.querySelector('input[name=email]');
  if (e) { e.value = email; (email ? sheet.querySelector('input[name=password]') : e).focus(); }
}

export function openAuth(mode = 'signup', reasonKey = '', after = null) {
  A = { mode, reason: reasonKey, busy: false, err: '', after };
  openModal(sheetHtml(), { onClose: () => { const cb = A.after; A.after = null; if (cb) cb(false); } });
  document.querySelector('#modalRoot .sheet')?.classList.add('auth-sheet');
  setTimeout(() => document.querySelector('#modalRoot input[name=email]')?.focus(), 60);
}

/** Блок «Аккаунт» в профиле. */
export function accountPanel() {
  if (!authAvailable()) return '';
  const u = currentUser();
  if (!u) {
    return `
      <section class="panel account guest">
        <span class="acc-ic">${icon('user', 20)}</span>
        <div><h2>${t('auth.guestT')}</h2><p class="note">${t('auth.guestB')}</p></div>
        <div class="acc-btns">
          <button class="btn" data-act="auth-open" data-id="signup">${t('auth.tabSignup')}</button>
          <button class="btn btn-soft" data-act="auth-open" data-id="login">${t('auth.tabLogin')}</button>
        </div>
      </section>`;
  }
  const synced = lastSyncedAt();
  const st = !navigator.onLine ? t('auth.syncOffline') : syncState === 'error' ? t('auth.syncError') : synced ? tf('auth.syncOk', { d: fmtDate(new Date(synced).getTime()) }) : t('auth.syncWait');
  return `
    <section class="panel account">
      <span class="acc-ic on">${icon('check', 20)}</span>
      <div><h2>${esc(u.email || '')}</h2><p class="note">${icon('cloud', 13)} ${esc(st)}</p></div>
      <div class="acc-btns"><button class="btn btn-soft" data-act="auth-logout">${icon('logout', 16)} ${t('auth.logout')}</button></div>
    </section>`;
}

export function registerAuthActions(rerender) {
  action('auth-tab', ({ id }) => { A.mode = id === 'login' ? 'login' : 'signup'; A.err = ''; paint(); });
  action('auth-open', ({ id }) => openAuth(id === 'login' ? 'login' : 'signup'));
  action('auth-guest', () => closeModal());
  action('auth-google', () => googleSignIn());
  action('auth-submit', async (_d, form) => {
    if (A.busy) return;
    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { A.err = t('auth.errEmail'); paint(); return; }
    if (password.length < 6) { A.err = t('auth.errWeak'); paint(); return; }
    A.busy = true; A.err = ''; paint();
    const sheet = document.querySelector('#modalRoot .sheet');
    if (sheet) { sheet.querySelector('input[name=email]').value = email; }
    try {
      if (A.mode === 'signup') {
        const r = await signUp(email, password);
        if (r === 'confirm') { A.busy = false; A.err = t('auth.checkMail'); paint(); return; }
        toast(tf('auth.welcome', { name: getProfile().name || '' }));
      } else {
        await signIn(email, password);
        toast(t('auth.loggedIn'));
      }
      const cb = A.after; A.after = null;
      closeModal();
      rerender();
      if (cb) cb(true);
    } catch (e) {
      A.busy = false; A.err = t(authErrorKey(e)); paint();
    }
  });
  action('auth-logout', async () => {
    if (!confirm(t('auth.logoutConfirm'))) return;
    await signOut();
    resetAll(); // прогресс сохранён в облаке; на этом устройстве начинаем с чистого листа
    toast(t('auth.loggedOut'));
    location.hash = '#/';
    rerender();
  });
}
