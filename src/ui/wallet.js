/**
 * Кошелёк: монеты за учёбу и ДЕМО-обмен на тенге.
 *
 * Настоящих переводов нет и быть не может без договора с платёжным
 * сервисом, согласия родителей и юридической проверки. Поэтому способы
 * вывода нейтральные (без брендов реальных банков), а анимация перевода и
 * квитанция везде помечены «ДЕМО».
 */

import { icon } from './icons.js';
import { t, tf, fmtDate } from '../i18n.js';
import { getProfile, requestPayout, COINS } from '../state.js';
import { header, esc, fmt, openModal, closeModal, coin } from './kit.js';
import { action } from './dom.js';

const METHODS = [
  { id: 'card', icon: 'card', key: 'wallet.mCard', bg: 'linear-gradient(135deg,#4f4fd0,#6d8cf5)' },
  { id: 'ewallet', icon: 'wallet', key: 'wallet.mWallet', bg: 'linear-gradient(135deg,#2fb37e,#61d4a6)' },
  { id: 'phone', icon: 'phone', key: 'wallet.mPhone', bg: 'linear-gradient(135deg,#f08a3c,#ffb36b)' },
];
let method = 'card';
let amount = COINS.minPayout;

const kzt = (coins) => fmt(Math.round(coins * COINS.rateKzt));

export function renderWallet() {
  const p = getProfile();
  const max = Math.max(COINS.minPayout, Math.floor(p.coins / 100) * 100);
  amount = Math.min(Math.max(amount, COINS.minPayout), max);
  const can = p.coins >= COINS.minPayout;
  const dfmt = { format: (ts) => fmtDate(ts) };
  return `
    ${header(t('wallet.title'), t('wallet.sub'))}
    <div class="wallet">
      <div style="display:grid;gap:22px">
        <section class="balance page-enter">
          <div style="display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1">
            <span class="lbl">${t('wallet.balance')}</span><span class="demo-badge">${t('wallet.rate')}</span>
          </div>
          <div class="amt" style="position:relative;z-index:1">${coin(58, 'spin')}${fmt(p.coins)}</div>
          <div class="kzt" style="position:relative;z-index:1">${tf('wallet.kzt', { k: kzt(p.coins) })}</div>
        </section>
        <section class="panel">
          <div class="sec-head"><h2>${t('wallet.earn')}</h2></div>
          ${['e1', 'e2', 'e3', 'e4', 'e5'].map((k) => `<div class="log-row"><span>${icon('star', 16)} ${t('wallet.' + k)}</span></div>`).join('')}
        </section>
        <section class="panel">
          <div class="sec-head"><h2>${t('wallet.history')}</h2><span class="count">${p.coinLog.length}</span></div>
          <div class="list" style="max-height:300px">
            ${p.coinLog.slice(0, 40).map((l) => `<div class="log-row"><span>${t('reason.' + l.reason)}<br><small class="note">${dfmt.format(l.ts)}</small></span>
              <span class="${l.amount > 0 ? 'plus' : 'minus'}">${l.amount > 0 ? '+' : ''}${fmt(l.amount)}</span></div>`).join('') || `<p class="empty">${t('wallet.none')}</p>`}
          </div>
        </section>
      </div>
      <div style="display:grid;gap:22px">
        <section class="panel">
          <div class="sec-head"><h2>${t('wallet.payout')}</h2><span class="spacer"></span><span class="demo-badge dark">${t('wallet.demo')}</span></div>
          <div class="field"><label>${t('wallet.amount')}: <b style="color:var(--text)">${fmt(amount)}</b> → <b style="color:var(--text)">${kzt(amount)} ₸</b></label>
            <input class="range" type="range" id="payAmount" min="${COINS.minPayout}" max="${max}" step="100" value="${amount}" ${can ? '' : 'disabled'} aria-label="${esc(t('wallet.amount'))}">
            <span class="note">${can ? tf('wallet.min', { n: fmt(COINS.minPayout) }) : tf('wallet.notEnough', { n: fmt(COINS.minPayout - p.coins) })}</span>
          </div>
          <div class="field"><label>${t('wallet.method')}</label>
            <div class="methods">${METHODS.map((m) => `<button class="method ${method === m.id ? 'on' : ''}" data-act="pay-method" data-id="${m.id}">
              <span class="mi" style="background:${m.bg};color:#fff">${icon(m.icon, 20)}</span>${t(m.key)}</button>`).join('')}</div>
          </div>
          <button class="btn" style="width:100%;margin-top:20px" data-act="pay-send" ${can ? '' : 'disabled'}>${icon('send', 16)} ${t('wallet.send')}</button>
          <p class="note" style="margin-top:12px">${icon('shield', 14)} ${t('wallet.demoNote')}</p>
        </section>
        <section class="panel">
          <div class="sec-head"><h2>${t('wallet.payouts')}</h2><span class="count">${p.payouts.length}</span></div>
          ${p.payouts.slice(0, 10).map((x) => `<div class="log-row"><span>${icon('receipt', 16)} ${esc(x.id)} · ${t(METHODS.find((m) => m.id === x.method)?.key || 'wallet.mCard')}<br><small class="note">${dfmt.format(x.ts)} · ${t('wallet.demo')}</small></span>
            <span><b>${fmt(x.kzt)} ₸</b><br><small class="minus">−${fmt(x.coins)}</small></span></div>`).join('') || `<p class="empty">${t('wallet.none')}</p>`}
        </section>
      </div>
    </div>`;
}

/** Анимация демо-перевода: монеты летят к получателю, шаги отмечаются по очереди. */
function playTransfer(rec, rerender) {
  const m = METHODS.find((x) => x.id === rec.method);
  const sheet = openModal(`
    <div class="tx">
      <h2>${t('wallet.payout')} <span class="demo-badge dark">${t('wallet.demo')}</span></h2>
      <div class="tx-stage">
        <span class="tx-node from">${coin(46)}</span>
        <span class="tx-line"><i></i></span>
        ${[1, 2, 3, 4].map(() => `<span class="tx-coin">${coin(26)}</span>`).join('')}
        <span class="tx-node to" style="background:${m.bg}">${icon(m.icon, 34)}</span>
      </div>
      <div class="tx-steps">${['s1', 's2', 's3', 's4'].map((k) => `<div class="tx-step" data-step="${k}"><i>${icon('check', 12)}</i>${t('wallet.' + k)}</div>`).join('')}</div>
      <div id="txReceipt"></div>
    </div>`, { onClose: rerender });
  requestAnimationFrame(() => sheet.querySelector('.tx').classList.add('playing'));
  ['s1', 's2', 's3', 's4'].forEach((k, i) => setTimeout(() => sheet.querySelector(`[data-step="${k}"]`)?.classList.add('on'), 300 + i * 750));
  setTimeout(() => {
    const box = sheet.querySelector('#txReceipt');
    if (!box) return;
    box.innerHTML = `
      <h3 style="margin-top:20px;color:var(--ok)">${tf('wallet.success', { k: fmt(rec.kzt) })}</h3>
      <div class="receipt">
        <b>${t('wallet.receipt')}</b>
        <div><span>№</span><span>${esc(rec.id)}</span></div>
        <div><span>${t('wallet.amount')}</span><span>${fmt(rec.coins)} → ${fmt(rec.kzt)} ₸</span></div>
        <div><span>${t('wallet.method')}</span><span>${t(m.key)}</span></div>
        <div><span>${fmtDate(rec.ts, { year: true })}</span><span>${t('wallet.demo')}</span></div>
      </div>
      <p class="note" style="margin-top:12px">${t('wallet.demoNote')}</p>
      <button class="btn" style="margin-top:16px" data-act="modal-close">${t('common.close')}</button>`;
  }, 3400);
}

export function registerWalletActions(rerender) {
  action('pay-method', ({ id }) => { method = id; rerender(); });
  action('pay-send', () => {
    const rec = requestPayout(amount, method);
    if (rec) playTransfer(rec, rerender);
  });
  action('modal-close', () => closeModal());
}

/** Ползунок суммы обновляет подпись без полной перерисовки. */
export function bindWalletInputs(root, rerender) {
  root.addEventListener('change', (e) => {
    if (e.target.id === 'payAmount') { amount = Number(e.target.value); rerender(); }
  });
  root.addEventListener('input', (e) => {
    if (e.target.id !== 'payAmount') return;
    const lbl = e.target.closest('.field')?.querySelector('label');
    const v = Number(e.target.value);
    if (lbl) lbl.innerHTML = `${t('wallet.amount')}: <b style="color:var(--text)">${fmt(v)}</b> → <b style="color:var(--text)">${kzt(v)} ₸</b>`;
  });
}
