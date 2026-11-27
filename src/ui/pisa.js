import { icon } from './icons.js';
import { play } from '../sound.js';
import { t, tf, loc, fmtDate } from '../i18n.js';
import { getProfile, getSettings, update, recordPisa, COINS } from '../state.js';
import { PISA_SETS, PISA_STIMULI, PISA_AVG, scorePisa } from '../data/pisa.js';
import { header, esc, coinBurst, openModal, closeModal, kapiSvg } from './kit.js';
import { action } from './dom.js';
import { requireAuth } from './auth.js';

let P = { phase: 'intro', idx: 0, answers: {}, result: null, t0: 0, set: 'v1', order: {} };
const ITEMS = () => PISA_SETS[P.set || 'v1'].items;
/** Варианты ответа перемешиваются при каждом прохождении, чтобы верный не стоял всегда под «A». */
function shuffleOrder(items) {
  const order = {};
  for (const q of items) {
    const a = q.options.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    order[q.id] = a;
  }
  return order;
}
let rerenderRef = () => {};

/* ─── Режим фокуса: весь экран, ничего лишнего ───────────────────────────
   Во время теста прячем меню и шапку, пробуем развернуть браузер на весь
   экран. Секундомер включается по желанию (по умолчанию скрыт, чтобы не
   давил). Выйти можно кнопкой «Выйти» или клавишей Esc — с подтверждением,
   ответы не сохраняются. */
let clockOn = Boolean(getSettings().pisaClock);
let clockTimer = null;
let wantFs = false; // ученик в полноэкранном режиме (или хотел в него)
const RECOMMENDED_MIN = () => Math.round(ITEMS().length * 1.5);

const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function enterFs() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try { const r = req.call(el, { navigationUI: 'hide' }); wantFs = true; r?.catch?.(() => { wantFs = false; }); } catch { wantFs = false; }
}
function exitFs() {
  wantFs = false;
  if (!fsEl()) return;
  const ex = document.exitFullscreen || document.webkitExitFullscreen;
  try { ex?.call(document)?.catch?.(() => {}); } catch { /* уже вышли */ }
}
function setFocus(on) {
  document.documentElement.classList.toggle('pisa-focus', on);
  if (!on) { clearInterval(clockTimer); clockTimer = null; exitFs(); }
}
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
function tickClock() {
  const el = document.getElementById('pisaClock');
  if (!el) return;
  const ms = Date.now() - P.t0;
  el.textContent = mmss(ms);
  el.closest('.pf-clock')?.classList.toggle('over', ms > RECOMMENDED_MIN() * 60000);
}
function startClock() { clearInterval(clockTimer); clockTimer = setInterval(tickClock, 1000); }

function stimulusHtml(key) {
  const s = PISA_STIMULI[key];
  if (!s) return '';
  const body = s.table
    ? `<table class="ptable"><thead><tr>${s.table.head.map((h) => `<th>${esc(loc(h))}</th>`).join('')}</tr></thead>
        <tbody>${s.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(loc(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : `<p>${esc(loc(s.text))}</p>`;
  return `<aside class="passage"><p class="note" style="margin-bottom:6px">${t('pisa.text')}</p><h3>${esc(loc(s.title))}</h3>${body}</aside>`;
}

function intro() {
  const all = getProfile().pisa;
  const hist = all.slice(0, 4);
  const best = (id) => all.filter((r) => (r.variant || 'v1') === id).reduce((m, r) => Math.max(m, r.total), 0);
  const setCard = (set, n) => {
    const b = best(set.id);
    const [head, name] = loc(set.title).split(' · ');
    return `<article class="pv-card pv-${set.id}">
      <div class="pv-top"><span class="pv-num">${n}</span><span class="pv-tag">${esc(head)}</span>${b ? `<span class="pv-best">${icon('trophy', 13)} ${tf('pisa.best', { n: b })}</span>` : `<span class="pv-new">${t('pisa.notYet')}</span>`}</div>
      <h3>${esc(name || head)}</h3>
      <p class="note">${esc(loc(set.topics))}</p>
      <div class="pv-meta"><span>${icon('stack', 14)} ${tf('pisa.nTasks', { n: set.items.length })}</span><span>${icon('clock', 14)} ~${Math.round(set.items.length * 1.5)} ${t('pisa.min')}</span><span>${icon('target', 14)} ${t('pisa.mixed')}</span></div>
      <button class="btn pv-go" data-act="pisa-start" data-id="${set.id}">${icon('play', 16)} ${t(b ? 'pisa.retake' : 'pisa.start')}</button>
    </article>`;
  };
  const step = (ic, k) => `<div class="pv-step"><span class="pv-step-ic">${icon(ic, 18)}</span><span><b>${t('pisa.' + k + 'T')}</b><small>${t('pisa.' + k + 'B')}</small></span></div>`;
  return `
    <section class="hero page-enter">
      <div>
        <h2>PISA ${icon('target', 26)}</h2>
        <p>${t('pisa.what')}</p>
        <div class="pv-steps">${step('lock', 'h1')}${step('clock', 'h2')}${step('check', 'h3')}</div>
      </div>
      <div class="avg-box">
        <b>${t('pisa.avg')}</b>
        <div class="avg-row h"><span></span><span style="text-align:right">${t('pisa.kz')}</span><span style="text-align:right">OECD</span></div>
        <div class="avg-row"><span>${t('pisa.math')}</span><b>${PISA_AVG.math.kz}</b><b>${PISA_AVG.math.oecd}</b></div>
        <div class="avg-row"><span>${t('pisa.reading')}</span><b>${PISA_AVG.reading.kz}</b><b>≈${PISA_AVG.reading.oecd}</b></div>
        <p class="note">${tf('pisa.source', { s: PISA_AVG.source })}</p>
      </div>
    </section>
    <div class="sec-head" style="margin-top:30px"><h2>${t('pisa.choose')}</h2><span class="count">${Object.keys(PISA_SETS).length}</span></div>
    <div class="pv-grid">${Object.values(PISA_SETS).map((set, i) => setCard(set, i + 1)).join('')}</div>
    ${hist.length ? `<section style="margin-top:30px"><div class="sec-head"><h2>${t('pisa.history')}</h2></div>
      <div style="display:grid;gap:8px">${hist.map((r) => `<div class="lb-row pisa-hist">
        <span class="ph-date">${fmtDate(r.ts, { year: true })}<small class="ph-var">${esc(loc(PISA_SETS[r.variant || 'v1'].title).split(' · ')[0])}</small></span>
        <span>${t('pisa.math')}: <b>${r.math.score}</b></span><span>${t('pisa.reading')}: <b>${r.reading.score}</b></span><b class="ph-total">${r.total}</b></div>`).join('')}</div></section>` : ''}`;
}

function test() {
  const q = ITEMS()[P.idx];
  const sel = P.answers[q.id];
  const steps = ITEMS().map((x, i) => `<i class="${i === P.idx ? 'now' : P.answers[x.id] !== undefined ? 'ok' : ''}"></i>`).join('');
  const domain = q.domain === 'math' ? t('pisa.math') : t('pisa.reading');
  const done = Object.keys(P.answers).length;
  const fsOn = Boolean(fsEl());
  return `
    <div class="pf-bar">
      <div class="pf-left"><span class="pf-ic">${icon('target', 18)}</span><span><b>PISA</b><small>${tf('pisa.answered', { a: done, n: ITEMS().length })}</small></span></div>
      <div class="pf-mid">${clockOn ? `<span class="pf-clock" title="${esc(tf('pisa.clockHint', { n: RECOMMENDED_MIN() }))}">${icon('clock', 16)}<b id="pisaClock">${mmss(Date.now() - P.t0)}</b><small>/ ~${RECOMMENDED_MIN()} ${t('pisa.min')}</small></span>` : ''}</div>
      <div class="pf-right">
        <button class="pf-btn ${clockOn ? 'on' : ''}" data-act="pisa-clock" aria-pressed="${clockOn}" title="${esc(t('pisa.clockTip'))}">${icon('clock', 17)}<span>${t(clockOn ? 'pisa.clockOff' : 'pisa.clockOn')}</span></button>
        <button class="pf-btn pf-fs" data-act="pisa-fs" title="${esc(t(fsOn ? 'pisa.fsOff' : 'pisa.fsOn'))}" aria-label="${esc(t(fsOn ? 'pisa.fsOff' : 'pisa.fsOn'))}">${fsOn ? FS_EXIT : FS_ENTER}</button>
        <button class="pf-btn pf-exit" data-act="pisa-exit" title="Esc">${icon('close', 17)}<span>${t('pisa.exit')}</span><kbd>Esc</kbd></button>
      </div>
    </div>
    <div class="practice ${q.stimulus ? 'with-text' : ''}">
      ${q.stimulus ? stimulusHtml(q.stimulus) : ''}
      <section class="qcard page-enter">
        <div class="steps">${steps}</div>
        <p class="note">${tf('pisa.q', { i: P.idx + 1, n: ITEMS().length })} · ${domain}</p>
        <p class="stem">${esc(loc(q.stem))}</p>
        <div class="opts">${(P.order[q.id] || q.options.map((_, i) => i)).map((oi, pos) => `<button class="opt ${sel === oi ? 'sel' : ''}" data-act="pisa-pick" data-i="${oi}"><span class="k">${'ABCD'[pos]}</span>${esc(loc(q.options[oi]))}</button>`).join('')}</div>
        <div class="q-actions">
          <button class="btn btn-soft" data-act="pisa-nav" data-d="-1" ${P.idx === 0 ? 'disabled' : ''}>${icon('arrowLeft', 16)} ${t('pisa.prev')}</button>
          ${P.idx + 1 < ITEMS().length
            ? `<button class="btn" data-act="pisa-nav" data-d="1" ${sel === undefined ? 'disabled' : ''}>${t('pisa.next')} ${icon('arrowRight', 16)}</button>`
            : `<button class="btn btn-accent" data-act="pisa-finish" ${Object.keys(P.answers).length < ITEMS().length ? 'disabled' : ''}>${t('pisa.finish')}</button>`}
        </div>
      </section>
    </div>`;
}

function scaleHtml(domain, score) {
  const pos = (v) => `${((Math.min(650, Math.max(300, v)) - 300) / 350) * 100}%`;
  const avg = PISA_AVG[domain];
  return `<div class="scale">
    <div class="track"></div>
    <span class="mk" style="left:${pos(avg.kz)}">KZ ${avg.kz}</span>
    <span class="mk" style="left:${pos(avg.oecd)}">OECD ${avg.oecd}</span>
    <span class="me" data-left="${pos(score)}" style="left:0"></span>
  </div>`;
}

function verdictFor(domain, score) {
  const a = PISA_AVG[domain];
  if (score >= a.oecd) return { cls: 'up', text: t('pisa.aboveOecd') };
  if (score >= a.kz) return { cls: 'up', text: t('pisa.aboveKz') };
  return { cls: 'down', text: t('pisa.belowKz') };
}

function result() {
  const r = P.result;
  const above = r.math.score >= PISA_AVG.math.oecd && r.reading.score >= PISA_AVG.reading.oecd;
  const card = (domain, label) => {
    const d = r[domain];
    const v = verdictFor(domain, d.score);
    return `<section class="res-card">
      <p class="note">${label}</p>
      <div class="score">${d.score}</div>
      <p style="color:var(--dim)">${tf('pisa.level', { l: d.level })} · ${tf('pisa.correct', { c: d.correct, n: d.of })}</p>
      ${scaleHtml(domain, d.score)}
      <p style="margin-top:10px;font-weight:650;color:${v.cls === 'up' ? 'var(--ok)' : 'var(--cream-ink)'}">${v.text}</p>
    </section>`;
  };
  return `
    <div class="verdict ${above ? 'up' : 'down'} page-enter">${icon(above ? 'trophy' : 'trend', 24)} ${t(above ? 'pisa.verdictAbove' : 'pisa.verdictBelow')} · ${t('pisa.score')}: ${r.total}</div>
    <div class="res-grid">${card('math', t('pisa.math'))}${card('reading', t('pisa.reading'))}</div>
    <p class="note" style="margin-top:14px">${t('pisa.disclaimer')} ${tf('pisa.source', { s: PISA_AVG.source })}</p>
    <div class="q-actions"><button class="btn" data-act="pisa-start" data-id="${P.set}">${t('pisa.retake')}</button>${Object.keys(PISA_SETS).filter((k) => k !== P.set).map((k) => `<button class="btn btn-soft" data-act="pisa-start" data-id="${k}">${icon('play', 15)} ${esc(loc(PISA_SETS[k].title).split(' · ')[0])}</button>`).join('')}<a class="btn btn-soft" href="#/friends?share=pisa">${icon('send', 15)} ${t('fr.shareFriend')}</a><a class="btn btn-soft" href="#/topics">${t('nav.topics')}</a></div>
    <section style="margin-top:30px">
      <div class="sec-head"><h2>${t('pisa.review')}</h2></div>
      <div style="display:grid;gap:12px">
        ${ITEMS().map((q, i) => {
          const ok = P.answers[q.id] === q.answer;
          return `<div class="fb ${ok ? 'ok' : 'bad'}" style="margin:0">
            <h4>${icon(ok ? 'check' : 'cross', 16)} ${i + 1}. ${esc(loc(q.stem))}</h4>
            ${ok ? '' : `<p>${t('pisa.yourAnswer')}: ${esc(loc(q.options[P.answers[q.id]]))}</p>`}
            <p><b>${esc(loc(q.options[q.answer]))}</b> — ${esc(loc(q.explain))}</p></div>`;
        }).join('')}
      </div>
    </section>`;
}

const LOAD_MS = 2600;
const FS_ENTER = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const FS_EXIT = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

/** Экран подготовки теста: кольца-мишень, полоска и три шага по очереди. */
function loading() {
  return `
    <section class="pisa-load page-enter" style="--load:${LOAD_MS}ms">
      <div class="pl-target"><i></i><i></i><i></i><span class="pl-bear">${kapiSvg('talk')}</span></div>
      <h2>${t('pisa.loadTitle')}</h2>
      <div class="pl-bar"><i></i></div>
      <ul class="pl-steps">${['load1', 'load2', 'load3'].map((k, i) => `<li style="animation-delay:${0.25 + i * 0.75}s">${icon('check', 14)} ${t('pisa.' + k)}</li>`).join('')}</ul>
      <p class="note">${tf('pisa.loadNote', { n: ITEMS().length })}</p>
    </section>`;
}

export function renderPisa() {
  const focus = P.phase === 'test' || P.phase === 'loading';
  setFocus(focus);
  if (P.phase === 'test') { if (clockOn) { startClock(); } else { clearInterval(clockTimer); clockTimer = null; } }
  if (focus) return P.phase === 'loading' ? loading() : test();
  const body = P.phase === 'result' && P.result ? result() : intro();
  return `${header(t('pisa.title'), t('pisa.sub'))}${body}`;
}

/** Маркер «ты» плавно едет по шкале после отрисовки. */
export function animatePisa() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.scale .me[data-left]').forEach((el) => { el.style.left = el.dataset.left; });
  }));
}

export function registerPisaActions(rerender) {
  rerenderRef = rerender;
  // Перед тестом — короткая загрузка (~2,6 с): ученик успевает настроиться
  action('pisa-start', ({ id }) => {
    if (P.phase === 'loading') return;
    const set = PISA_SETS[id] ? id : (P.set || 'v1');
    clockOn = Boolean(getSettings().pisaClock);
    if (!requireAuth('auth.rPisa')) return;
    enterFs(); // нужен клик ученика — поэтому здесь, а не после загрузки
    P = { phase: 'loading', idx: 0, answers: {}, result: null, t0: 0, set, order: shuffleOrder(PISA_SETS[set].items) };
    rerender(); window.scrollTo({ top: 0 });
    setTimeout(() => {
      if (P.phase !== 'loading') return;
      P.phase = location.hash.startsWith('#/pisa') ? 'test' : 'intro';
      if (P.phase !== 'test') exitFs();
      P.t0 = Date.now();
      rerender(); window.scrollTo({ top: 0 });
    }, LOAD_MS);
  });
  action('pisa-pick', ({ i }) => { P.answers[ITEMS()[P.idx].id] = Number(i); rerender(); });
  action('pisa-nav', ({ d }) => { P.idx = Math.max(0, Math.min(ITEMS().length - 1, P.idx + Number(d))); rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  action('pisa-clock', () => { clockOn = !clockOn; update((s) => { s.settings.pisaClock = clockOn; }); rerender(); });
  action('pisa-fs', () => { if (fsEl()) exitFs(); else enterFs(); setTimeout(rerender, 250); });
  action('pisa-exit', () => confirmLeavePisa('#/pisa'));
  action('pisa-finish', () => {
    P.result = scorePisa(P.answers, ITEMS());
    P.phase = 'result';
    recordPisa({ ...P.result, variant: P.set, answers: { ...P.answers } });
    play('lesson');
    rerender();
    window.scrollTo({ top: 0 });
    coinBurst(document.getElementById('coinCount'), COINS.pisaDone);
  });
}

/* ─── Уход со страницы во время теста ─────────────────────────────────── */

/** Тест идёт (или готовится) — уходить можно только с подтверждением. */
export const pisaActive = () => P.phase === 'test' || P.phase === 'loading';

/** Окно «Выйти из пробного PISA?». target — куда ученик хотел перейти. */
export function confirmLeavePisa(target) {
  const answered = Object.keys(P.answers).length;
  openModal(`
    <div class="leave-sheet">
      <span class="leave-ic">${icon('target', 24)}</span>
      <h2>${t('pisa.leaveT')}</h2>
      <p class="note">${tf('pisa.leaveB', { a: answered, n: ITEMS().length })}</p>
      <div class="q-actions">
        <button class="btn" data-act="pisa-stay">${t('pisa.stay')}</button>
        <button class="btn btn-soft leave-btn" data-act="pisa-leave" data-to="${esc(target)}">${t('pisa.leave')}</button>
      </div>
    </div>`);
}

export function registerPisaLeave() {
  action('pisa-stay', () => { closeModal(); if (wantFs && !fsEl()) enterFs(); setTimeout(rerenderRef, 250); });
  action('pisa-leave', ({ to }) => {
    P = { phase: 'intro', idx: 0, answers: {}, result: null, t0: 0, set: P.set, order: {} };
    closeModal();
    setFocus(false);
    const dest = to || '#/';
    if (location.hash === dest) rerenderRef(); else location.hash = dest;
    window.scrollTo({ top: 0 });
  });
  // Esc во время теста — спросить, выйти ли (ответы не сохранятся)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || P.phase !== 'test') return;
    if (document.querySelector('#modalRoot .sheet')) return; // окно уже открыто — Esc закроет его
    e.preventDefault();
    e.stopImmediatePropagation(); // иначе общий обработчик Esc тут же закроет это окно
    confirmLeavePisa('#/pisa');
  });
  // В полноэкранном режиме браузер сам забирает Esc и выходит из него — тогда тоже спрашиваем
  const onFs = () => {
    if (fsEl() || P.phase !== 'test') { rerenderRef(); return; }
    if (wantFs && !document.querySelector('#modalRoot .sheet')) confirmLeavePisa('#/pisa');
    rerenderRef();
  };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);
  // Ушли с раздела PISA другим путём — режим фокуса выключаем
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/pisa')) setFocus(false); });
  // Клик по ссылке на другой раздел перехватываем до перехода — история браузера не засоряется
  document.addEventListener('click', (e) => {
    if (!pisaActive()) return;
    const a = e.target.closest?.('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href.startsWith('#/pisa')) return;
    e.preventDefault();
    e.stopPropagation();
    confirmLeavePisa(href);
  }, true);
  // Обновление или закрытие вкладки — стандартное предупреждение браузера
  window.addEventListener('beforeunload', (e) => {
    if (!pisaActive()) return;
    e.preventDefault();
    e.returnValue = '';
  });
}
