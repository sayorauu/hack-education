/**
 * Кошелёк: монеты за учёбу и ДЕМО-обмен на тенге.
 *
 * Настоящих переводов нет и быть не может без договора с платёжным
 * сервисом, согласия родителей и юридической проверки. Поэтому банки
 * указаны только названием (без логотипов), полный номер карты или телефона
 * не сохраняется, а анимация перевода и квитанция помечены «ДЕМО».
 */

import { icon } from './icons.js';
import { t, tf, fmtDate } from '../i18n.js';
import { getProfile, requestPayout, COINS } from '../state.js';
import { header, esc, fmt, openModal, closeModal, coin } from './kit.js';
import { action } from './dom.js';

/* Куда переводим: на карту или по номеру телефона. Банки — только названием,
   без логотипов и фирменных цветов: перевод демонстрационный. */
const METHODS = [
  { id: 'card', icon: 'card', key: 'wallet.toCard', bg: 'linear-gradient(135deg,#4f4fd0,#6d8cf5)' },
  { id: 'phone', icon: 'phone', key: 'wallet.toPhone', bg: 'linear-gradient(135deg,#2fb37e,#61d4a6)' },
];
const BANKS = [{ id: 'kaspi', name: 'Kaspi' }, { id: 'freedom', name: 'Freedom' }];
// Старые записи могли быть «ewallet» — показываем их как раньше
const METHOD_KEY = { card: 'wallet.toCard', phone: 'wallet.toPhone', ewallet: 'wallet.mWallet' };

let method = 'card';
let bank = 'kaspi';
let num = '';            // введённый номер живёт только в памяти страницы, в историю не пишется
let amount = COINS.minPayout;

const digits = (s) => String(s || '').replace(/\D/g, '');

/** Проверка номера карты по алгоритму Луна. */
function luhn(d) {
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let x = Number(d[d.length - 1 - i]);
    if (i % 2) { x *= 2; if (x > 9) x -= 9; }
    sum += x;
  }
  return sum % 10 === 0;
}

/** Номер телефона: 10 цифр после +7, мобильные в Казахстане начинаются с 7. */
const phoneDigits = (s) => {
  let d = digits(s);
  if (d.length > 10 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);
  return d.slice(0, 10);
};

function formatNum(raw) {
  if (method === 'card') return digits(raw).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
  const d = phoneDigits(raw);
  if (!d) return '';
  return ('+7 ' + [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ')).trim();
}

function numState(raw) {
  if (method === 'card') {
    const d = digits(raw).slice(0, 16);
    if (!d) return { ok: false, msg: '' };
    if (d.length < 16) return { ok: false, msg: tf('wallet.cardMore', { n: 16 - d.length }) };
    return luhn(d) ? { ok: true, msg: t('wallet.numOk') } : { ok: false, bad: true, msg: t('wallet.cardBad') };
  }
  const d = phoneDigits(raw);
  if (!d) return { ok: false, msg: '' };
  if (d[0] !== '7') return { ok: false, bad: true, msg: t('wallet.phoneBad') };
  if (d.length < 10) return { ok: false, msg: tf('wallet.phoneMore', { n: 10 - d.length }) };
  return { ok: true, msg: t('wallet.numOk') };
}

/** Маска для квитанции и истории: полный номер не сохраняем. */
function maskNum(raw) {
  if (method === 'card') return '•••• ' + digits(raw).slice(-4);
  const d = phoneDigits(raw);
  return `+7 ${d.slice(0, 3)} ••• •• ${d.slice(8, 10)}`;
}

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
          <div class="log-row max-row"><span>${icon('shield', 16)} ${tf('wallet.max', { n: fmt(COINS.maxBalance) })}</span></div>
          ${p.coins >= COINS.maxBalance ? `<p class="max-note">${tf('wallet.atMax', { n: fmt(COINS.maxBalance) })}</p>` : ''}
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
          <div class="demo-banner" role="note">
            <span class="db-ic">${icon('shield', 20)}</span>
            <span><b>${t('wallet.demoBannerT')}</b>${t('wallet.demoBannerB')}</span>
          </div>
          <div class="field"><label>${t('wallet.amount')}: <b style="color:var(--text)">${fmt(amount)}</b> → <b style="color:var(--text)">${kzt(amount)} ₸</b></label>
            <input class="range" type="range" id="payAmount" min="${COINS.minPayout}" max="${max}" step="100" value="${amount}" ${can ? '' : 'disabled'} aria-label="${esc(t('wallet.amount'))}">
            <span class="note">${can ? tf('wallet.min', { n: fmt(COINS.minPayout) }) : tf('wallet.notEnough', { n: fmt(COINS.minPayout - p.coins) })}</span>
          </div>
          <div class="field"><label>${t('wallet.method')}</label>
            <div class="methods methods-2">${METHODS.map((m) => `<button class="method ${method === m.id ? 'on' : ''}" data-act="pay-method" data-id="${m.id}">
              <span class="mi" style="background:${m.bg};color:#fff">${icon(m.icon, 20)}</span>${t(m.key)}</button>`).join('')}</div>
          </div>
          <div class="field"><label>${t('wallet.bank')}</label>
            <div class="bank-pick">${BANKS.map((b) => `<button class="bank ${bank === b.id ? 'on' : ''}" data-act="pay-bank" data-id="${b.id}"><i></i>${b.name}</button>`).join('')}</div>
          </div>
          <div class="field"><label for="payNum">${t(method === 'card' ? 'wallet.cardNum' : 'wallet.phoneNum')}</label>
            <div class="pay-num-wrap">${icon(method === 'card' ? 'card' : 'phone', 18)}
              <input class="input pay-num" id="payNum" inputmode="numeric" autocomplete="off" spellcheck="false"
                placeholder="${method === 'card' ? '0000 0000 0000 0000' : '+7 7__ ___ __ __'}" value="${esc(formatNum(num))}" ${can ? '' : 'disabled'}></div>
            <span class="note pay-hint ${numState(num).ok ? 'ok' : ''}" id="payHint">${esc(numState(num).msg) || t('wallet.numPrivacy')}</span>
          </div>
          <button class="btn" id="payBtn" style="width:100%;margin-top:20px" data-act="pay-send" ${can && numState(num).ok ? '' : 'disabled'}>${icon('send', 16)} ${tf('wallet.sendTo', { k: kzt(amount), b: BANKS.find((b) => b.id === bank).name })}</button>
          <p class="note" style="margin-top:12px">${icon('shield', 14)} ${t('wallet.demoNote')}</p>
        </section>
        <section class="panel">
          <div class="sec-head"><h2>${t('wallet.payouts')}</h2><span class="count">${p.payouts.length}</span></div>
          ${p.payouts.slice(0, 10).map((x) => `<div class="log-row"><span>${icon('receipt', 16)} ${x.bank ? esc(BANKS.find((b) => b.id === x.bank)?.name || '') + ' · ' : ''}${x.to ? esc(x.to) : t(METHOD_KEY[x.method] || 'wallet.toCard')}<br><small class="note">${esc(x.id)} · ${dfmt.format(x.ts)} · ${t('wallet.demo')}</small></span>
            <span><b>${fmt(x.kzt)} ₸</b><br><small class="minus">−${fmt(x.coins)}</small></span></div>`).join('') || `<p class="empty">${t('wallet.none')}</p>`}
        </section>
      </div>
    </div>`;
}


/** Анимация демо-перевода: монеты летят к банку получателя, шаги отмечаются по очереди. */
function playTransfer(rec, rerender) {
  const m = METHODS.find((x) => x.id === rec.method) || METHODS[0];
  const b = BANKS.find((x) => x.id === rec.bank) || BANKS[0];
  const steps = [t('wallet.s1'), t('wallet.s2'), t('wallet.s3'), tf('wallet.s4to', { b: b.name })];
  const sheet = openModal(`
    <div class="tx">
      <h2>${t('wallet.payout')} <span class="demo-badge dark">${t('wallet.demo')}</span></h2>
      <div class="tx-stage">
        <span class="tx-node from">${coin(46)}</span>
        <span class="tx-line"><i></i></span>
        ${[0, 1, 2, 3].map((i) => `<span class="tx-coin" style="animation-delay:${i * 0.32}s">${coin(26)}</span>`).join('')}
        <span class="tx-node to" style="background:${m.bg}"><span class="tx-bank">${esc(b.name)}</span>${icon(m.icon, 22)}</span>
      </div>
      <p class="tx-to">${esc(rec.to || '')}</p>
      <div class="tx-steps">${steps.map((s, i) => `<div class="tx-step" data-step="${i}"><i>${icon('check', 12)}</i>${esc(s)}</div>`).join('')}</div>
      <div id="txReceipt"></div>
    </div>`, { onClose: rerender });
  // Дистанция полёта монет считается от настоящей ширины окна (на телефоне она меньше)
  const stage = sheet.querySelector('.tx-stage');
  const from = sheet.querySelector('.tx-node.from'), to = sheet.querySelector('.tx-node.to');
  const dist = Math.max(40, to.getBoundingClientRect().left - from.getBoundingClientRect().right + 30);
  stage.style.setProperty('--dist', `${dist}px`);
  stage.style.setProperty('--start', `${from.getBoundingClientRect().right - stage.getBoundingClientRect().left - 13}px`);
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.querySelector('.tx')?.classList.add('playing')));
  steps.forEach((_, i) => setTimeout(() => sheet.querySelector(`[data-step="${i}"]`)?.classList.add('on'), 350 + i * 700));
  setTimeout(() => {
    sheet.querySelector('.tx-node.to')?.classList.add('got');
    const box = sheet.querySelector('#txReceipt');
    if (!box) return;
    box.innerHTML = `
      <h3 class="tx-ok">${tf('wallet.success', { k: fmt(rec.kzt) })}</h3>
      <div class="receipt">
        <b>${t('wallet.receipt')}</b>
        <div><span>№</span><span>${esc(rec.id)}</span></div>
        <div><span>${t('wallet.amount')}</span><span>${fmt(rec.coins)} → ${fmt(rec.kzt)} ₸</span></div>
        <div><span>${t('wallet.bank')}</span><span>${esc(b.name)}</span></div>
        <div><span>${t(m.key)}</span><span>${esc(rec.to || '—')}</span></div>
        <div><span>${fmtDate(rec.ts, { year: true })}</span><span>${t('wallet.demo')}</span></div>
      </div>
      <p class="note" style="margin-top:12px">${t('wallet.demoNote')}</p>
      <button class="btn" style="margin-top:16px" data-act="modal-close">${t('common.close')}</button>`;
  }, 3300);
}

export function registerWalletActions(rerender) {
  action('pay-method', ({ id }) => { if (method !== id) { method = id; num = ''; } rerender(); });
  action('pay-bank', ({ id }) => { bank = id; rerender(); });
  action('pay-send', () => {
    if (!numState(num).ok) return;
    const rec = requestPayout(amount, method, { bank, to: maskNum(num) });
    if (!rec) return;
    num = ''; // полный номер дальше не нужен
    playTransfer(rec, rerender);
  });
  action('modal-close', () => closeModal());
}

/** Ползунок суммы и поле номера обновляются без полной перерисовки. */
export function bindWalletInputs(root, rerender) {
  root.addEventListener('change', (e) => {
    if (e.target.id === 'payAmount') { amount = Number(e.target.value); rerender(); }
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'payNum') {
      const el = e.target;
      num = el.value;
      const f = formatNum(num);
      if (el.value !== f) el.value = f;
      const st = numState(num);
      const hint = document.getElementById('payHint');
      if (hint) { hint.textContent = st.msg || t('wallet.numPrivacy'); hint.classList.toggle('ok', st.ok); hint.classList.toggle('bad', !!st.bad); }
      const btn = document.getElementById('payBtn');
      const p = getProfile();
      if (btn) btn.disabled = !(st.ok && p.coins >= COINS.minPayout);
      return;
    }
    if (e.target.id !== 'payAmount') return;
    const lbl = e.target.closest('.field')?.querySelector('label');
    const v = Number(e.target.value);
    amount = v;
    if (lbl) lbl.innerHTML = `${t('wallet.amount')}: <b style="color:var(--text)">${fmt(v)}</b> → <b style="color:var(--text)">${kzt(v)} ₸</b>`;
    const btn = document.getElementById('payBtn');
    if (btn) btn.innerHTML = `${icon('send', 16)} ${esc(tf('wallet.sendTo', { k: kzt(v), b: BANKS.find((x) => x.id === bank).name }))}`;
  });
}
