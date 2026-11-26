/**
 * Админка: начисление монет. Вход — по PIN-коду, который проверяет сервер
 * (ADMIN_PIN в .env или в переменных Vercel). В браузере PIN не хранится;
 * после входа доступ открыт до закрытия вкладки.
 */

import { icon } from './icons.js';
import { t, tf, fmtDate } from '../i18n.js';
import { getProfile, adminAdjust, COINS } from '../state.js';
import { header, esc, fmt, coin, coinBurst } from './kit.js';
import { action, toast } from './dom.js';

const KEY = 'nasstudy.admin';
const unlocked = () => sessionStorage.getItem(KEY) === '1';
let err = '';
let busy = false;

export function renderAdmin() {
  if (!unlocked()) {
    return `
      ${header(t('admin.title'), t('admin.sub'))}
      <form class="panel admin-lock" data-act="admin-login">
        <span class="admin-ic">${icon('shield', 26)}</span>
        <h2>${t('admin.pinTitle')}</h2>
        <p class="note">${t('admin.pinNote')}</p>
        <input class="input ob-input" id="adminPin" name="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="••••••" maxlength="64" required>
        ${err ? `<p class="admin-err">${esc(err)}</p>` : ''}
        <button class="btn" type="submit" ${busy ? 'disabled' : ''}>${t('admin.enter')} ${icon('arrowRight', 16)}</button>
      </form>`;
  }
  const p = getProfile();
  const log = p.coinLog.filter((l) => l.reason === 'admin').slice(0, 15);
  return `
    ${header(t('admin.title'), tf('admin.forStudent', { name: esc(p.name || '—'), grade: p.grade }))}
    <div class="wallet">
      <section class="panel">
        <div class="admin-bal">${coin(56, 'spin')}<span><small>${t('wallet.balance')}</small><b id="adminBal">${fmt(p.coins)}</b></span></div>
        <div class="field"><label>${t('admin.quick')}</label>
          <div class="chips">${[50, 100, 500, 1000].map((n) => `<button class="chip" data-act="admin-add" data-n="${n}">+${n}</button>`).join('')}</div></div>
        <form class="field" data-act="admin-custom">
          <label for="adminAmt">${t('admin.custom')}</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <input class="input" id="adminAmt" name="amount" type="number" step="1" placeholder="+250 / −100" required>
            <input class="input" name="note" maxlength="60" placeholder="${esc(t('admin.notePh'))}">
          </div>
          <button class="btn" style="margin-top:12px" type="submit">${icon('check', 16)} ${t('admin.apply')}</button>
        </form>
        <div class="q-actions">
          <button class="btn btn-soft" data-act="admin-zero" style="color:var(--bad)">${t('admin.zero')}</button>
          <button class="btn btn-soft" data-act="admin-logout">${icon('logout', 16)} ${t('admin.logout')}</button>
        </div>
        <p class="note" style="margin-top:12px">${t('admin.deviceNote')}</p>
      </section>
      <section class="panel">
        <div class="sec-head"><h2>${t('admin.history')}</h2><span class="count">${log.length}</span></div>
        ${log.map((l) => `<div class="log-row"><span>${esc(l.note || t('reason.admin'))}<br><small class="note">${fmtDate(l.ts)}</small></span>
          <span class="${l.amount > 0 ? 'plus' : 'minus'}">${l.amount > 0 ? '+' : ''}${fmt(l.amount)}</span></div>`).join('') || `<p class="empty">${t('wallet.none')}</p>`}
      </section>
    </div>`;
}

export function registerAdminActions(rerender) {
  action('admin-login', async (_d, form) => {
    const pin = form.querySelector('input').value.trim();
    if (!pin || busy) return;
    busy = true; err = '';
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
      if (r.ok) { sessionStorage.setItem(KEY, '1'); toast(t('admin.welcome')); }
      else err = t({ 401: 'admin.wrong', 429: 'admin.tooMany', 503: 'admin.notSet' }[r.status] || 'admin.noServer');
    } catch {
      err = t('admin.noServer');
    }
    busy = false;
    rerender();
  });
  const apply = (n, note, el) => {
    if (!unlocked()) return;
    const got = adminAdjust(n, note);
    if (got > 0) coinBurst(el, got);
    if (n > 0 && got === 0) toast(tf('admin.maxReached', { n: fmt(COINS.maxBalance) }));
    else toast(tf(got >= 0 ? 'admin.added' : 'admin.removed', { n: fmt(Math.abs(got)) }));
    rerender();
  };
  action('admin-add', ({ n }, el) => apply(Number(n), '', el));
  action('admin-custom', (_d, form) => {
    const fd = new FormData(form);
    apply(Number(fd.get('amount')), String(fd.get('note') || ''), form);
  });
  action('admin-zero', () => {
    if (!unlocked() || !confirm(t('admin.zeroConfirm'))) return;
    apply(-getProfile().coins, t('admin.zero'));
  });
  action('admin-logout', () => { sessionStorage.removeItem(KEY); rerender(); });
}
