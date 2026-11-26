import { icon } from './icons.js';
import { t, tf, loc, fmtDate } from '../i18n.js';
import { getProfile, recordPisa, COINS } from '../state.js';
import { PISA_ITEMS, PISA_STIMULI, PISA_AVG, scorePisa } from '../data/pisa.js';
import { header, esc, coinBurst, openModal, closeModal, kapiSvg } from './kit.js';
import { action } from './dom.js';
import { requireAuth } from './auth.js';

let P = { phase: 'intro', idx: 0, answers: {}, result: null, t0: 0 };

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
  const hist = getProfile().pisa.slice(0, 3);
  return `
    <section class="hero page-enter">
      <div>
        <h2>PISA ${icon('target', 26)}</h2>
        <p>${t('pisa.what')}</p>
        <p style="margin-top:12px;font-weight:650;color:var(--text)">${t('pisa.format')}</p>
        <button class="btn" style="margin-top:22px" data-act="pisa-start">${icon('play', 16)} ${t('pisa.start')}</button>
      </div>
      <div class="avg-box">
        <b>${t('pisa.avg')}</b>
        <div class="avg-row h"><span></span><span style="text-align:right">${t('pisa.kz')}</span><span style="text-align:right">OECD</span></div>
        <div class="avg-row"><span>${t('pisa.math')}</span><b>${PISA_AVG.math.kz}</b><b>${PISA_AVG.math.oecd}</b></div>
        <div class="avg-row"><span>${t('pisa.reading')}</span><b>${PISA_AVG.reading.kz}</b><b>≈${PISA_AVG.reading.oecd}</b></div>
        <p class="note">${tf('pisa.source', { s: PISA_AVG.source })}</p>
      </div>
    </section>
    ${hist.length ? `<section style="margin-top:28px"><div class="sec-head"><h2>${t('pisa.history')}</h2></div>
      <div style="display:grid;gap:8px">${hist.map((r) => `<div class="lb-row pisa-hist">
        <span class="ph-date">${fmtDate(r.ts, { year: true })}</span>
        <span>${t('pisa.math')}: <b>${r.math.score}</b></span><span>${t('pisa.reading')}: <b>${r.reading.score}</b></span><b class="ph-total">${r.total}</b></div>`).join('')}</div></section>` : ''}`;
}

function test() {
  const q = PISA_ITEMS[P.idx];
  const sel = P.answers[q.id];
  const steps = PISA_ITEMS.map((x, i) => `<i class="${i === P.idx ? 'now' : P.answers[x.id] !== undefined ? 'ok' : ''}"></i>`).join('');
  const domain = q.domain === 'math' ? t('pisa.math') : t('pisa.reading');
  return `
    <div class="practice ${q.stimulus ? 'with-text' : ''}">
      ${q.stimulus ? stimulusHtml(q.stimulus) : ''}
      <section class="qcard page-enter">
        <div class="steps">${steps}</div>
        <p class="note">${tf('pisa.q', { i: P.idx + 1, n: PISA_ITEMS.length })} · ${domain}</p>
        <p class="stem">${esc(loc(q.stem))}</p>
        <div class="opts">${q.options.map((o, i) => `<button class="opt ${sel === i ? 'sel' : ''}" data-act="pisa-pick" data-i="${i}"><span class="k">${'ABCD'[i]}</span>${esc(loc(o))}</button>`).join('')}</div>
        <div class="q-actions">
          <button class="btn btn-soft" data-act="pisa-nav" data-d="-1" ${P.idx === 0 ? 'disabled' : ''}>${icon('arrowLeft', 16)} ${t('pisa.prev')}</button>
          ${P.idx + 1 < PISA_ITEMS.length
            ? `<button class="btn" data-act="pisa-nav" data-d="1" ${sel === undefined ? 'disabled' : ''}>${t('pisa.next')} ${icon('arrowRight', 16)}</button>`
            : `<button class="btn btn-accent" data-act="pisa-finish" ${Object.keys(P.answers).length < PISA_ITEMS.length ? 'disabled' : ''}>${t('pisa.finish')}</button>`}
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
    <div class="q-actions"><button class="btn" data-act="pisa-start">${t('pisa.retake')}</button><a class="btn btn-soft" href="#/friends?share=pisa">${icon('send', 15)} ${t('fr.shareFriend')}</a><a class="btn btn-soft" href="#/topics">${t('nav.topics')}</a></div>
    <section style="margin-top:30px">
      <div class="sec-head"><h2>${t('pisa.review')}</h2></div>
      <div style="display:grid;gap:12px">
        ${PISA_ITEMS.map((q, i) => {
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

/** Экран подготовки теста: кольца-мишень, полоска и три шага по очереди. */
function loading() {
  return `
    <section class="pisa-load page-enter" style="--load:${LOAD_MS}ms">
      <div class="pl-target"><i></i><i></i><i></i><span class="pl-bear">${kapiSvg('talk')}</span></div>
      <h2>${t('pisa.loadTitle')}</h2>
      <div class="pl-bar"><i></i></div>
      <ul class="pl-steps">${['load1', 'load2', 'load3'].map((k, i) => `<li style="animation-delay:${0.25 + i * 0.75}s">${icon('check', 14)} ${t('pisa.' + k)}</li>`).join('')}</ul>
      <p class="note">${tf('pisa.loadNote', { n: PISA_ITEMS.length })}</p>
    </section>`;
}

export function renderPisa() {
  const body = P.phase === 'loading' ? loading() : P.phase === 'test' ? test() : P.phase === 'result' && P.result ? result() : intro();
  return `${header(t('pisa.title'), t('pisa.sub'))}${body}`;
}

/** Маркер «ты» плавно едет по шкале после отрисовки. */
export function animatePisa() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.scale .me[data-left]').forEach((el) => { el.style.left = el.dataset.left; });
  }));
}

export function registerPisaActions(rerender) {
  // Перед тестом — короткая загрузка (~2,6 с): ученик успевает настроиться
  action('pisa-start', () => {
    if (P.phase === 'loading') return;
    if (!requireAuth('auth.rPisa')) return;
    P = { phase: 'loading', idx: 0, answers: {}, result: null, t0: 0 };
    rerender(); window.scrollTo({ top: 0 });
    setTimeout(() => {
      if (P.phase !== 'loading') return;
      P.phase = location.hash.startsWith('#/pisa') ? 'test' : 'intro';
      P.t0 = Date.now();
      rerender(); window.scrollTo({ top: 0 });
    }, LOAD_MS);
  });
  action('pisa-pick', ({ i }) => { P.answers[PISA_ITEMS[P.idx].id] = Number(i); rerender(); });
  action('pisa-nav', ({ d }) => { P.idx = Math.max(0, Math.min(PISA_ITEMS.length - 1, P.idx + Number(d))); rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  action('pisa-finish', () => {
    P.result = scorePisa(P.answers);
    P.phase = 'result';
    recordPisa({ ...P.result, answers: { ...P.answers } });
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
      <p class="note">${tf('pisa.leaveB', { a: answered, n: PISA_ITEMS.length })}</p>
      <div class="q-actions">
        <button class="btn" data-act="pisa-stay">${t('pisa.stay')}</button>
        <button class="btn btn-soft leave-btn" data-act="pisa-leave" data-to="${esc(target)}">${t('pisa.leave')}</button>
      </div>
    </div>`);
}

export function registerPisaLeave() {
  action('pisa-stay', () => closeModal());
  action('pisa-leave', ({ to }) => {
    P = { phase: 'intro', idx: 0, answers: {}, result: null, t0: 0 };
    closeModal();
    location.hash = to || '#/';
  });
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
