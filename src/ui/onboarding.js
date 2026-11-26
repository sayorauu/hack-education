/**
 * Знакомство с новым учеником и короткий тур по сайту.
 *
 *  1) Мастер из трёх шагов: язык → имя → класс. Язык спрашиваем первым,
 *     чтобы остальные вопросы уже звучали на выбранном языке.
 *  2) Тур: затемнение с «окошком», которое плавно перелетает к каждому
 *     разделу, и карточка с капибарой Капи. Можно пропустить в любой момент.
 */

import { icon } from './icons.js';
import { t, tf, LANGS } from '../i18n.js';
import { getProfile, getSettings, update } from '../state.js';
import { GRADES } from '../data/curriculum.js';
import { esc, openModal, closeModal, kapiSvg } from './kit.js';
import { authAvailable, isLoggedIn } from '../cloud/auth.js';
import { openAuth } from './auth.js';

/* ─── Мастер ──────────────────────────────────────────────────────────── */

let W = null; // состояние мастера

const LANG_NAMES = { kk: ['Қазақша', 'ҚАЗ'], ru: ['Русский', 'РУС'] };

function wizardHtml() {
  const dots = [0, 1, 2].map((i) => `<i class="${i === W.step ? 'now' : i < W.step ? 'done' : ''}"></i>`).join('');
  const bear = `<span class="ob-bear">${kapiSvg()}</span>`;
  let body = '';
  if (W.step === 0) {
    body = `
      <h2>${t('ob.hello')}</h2>
      <p class="ob-sub">Тілді таңда · Выбери язык</p>
      <div class="ob-choices two">
        ${LANGS.map((l) => `<button type="button" class="ob-choice ${W.lang === l.id ? 'on' : ''}" data-act="ob-lang" data-id="${l.id}">
          <span class="ob-big">${LANG_NAMES[l.id][1]}</span><span>${LANG_NAMES[l.id][0]}</span></button>`).join('')}
      </div>`;
  } else if (W.step === 1) {
    body = `
      <h2>${t('ob.qName')}</h2>
      <p class="ob-sub">${t('ob.qNameSub')}</p>
      <input class="input ob-input" id="obName" value="${esc(W.name)}" placeholder="${esc(t('ob.namePh'))}" maxlength="40" autocomplete="given-name">
      <div class="ob-nav">
        <button type="button" class="btn btn-soft" data-act="ob-back">${icon('arrowLeft', 16)}</button>
        <button type="button" class="btn" data-act="ob-next" id="obNext" ${W.name.trim().length < 2 ? 'disabled' : ''}>${t('ob.next')} ${icon('arrowRight', 16)}</button>
      </div>`;
  } else {
    body = `
      <h2>${tf('ob.qGrade', { name: esc(W.name.trim()) })}</h2>
      <p class="ob-sub">${t('ob.qGradeSub')}</p>
      <div class="ob-choices three">
        ${GRADES.map((g) => `<button type="button" class="ob-choice ${W.grade === g ? 'on' : ''}" data-act="ob-grade" data-id="${g}">
          <span class="ob-big">${g}</span><span>${tf('common.grade', { n: g })}</span></button>`).join('')}
      </div>
      <div class="ob-nav">
        <button type="button" class="btn btn-soft" data-act="ob-back">${icon('arrowLeft', 16)}</button>
        <button type="button" class="btn" data-act="ob-finish" ${W.grade ? '' : 'disabled'}>${t('ob.start')} ${icon('sparkles', 16)}</button>
      </div>`;
  }
  return `<div class="ob">${bear}<div class="ob-dots">${dots}</div><div class="ob-step ${W.dir < 0 ? 'back' : ''}" key="${W.step}">${body}</div></div>`;
}

function paintWizard() {
  const sheet = document.querySelector('#modalRoot .sheet');
  if (!sheet) return;
  sheet.innerHTML = wizardHtml();
  const input = sheet.querySelector('#obName');
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('input', () => {
      W.name = input.value;
      const btn = sheet.querySelector('#obNext');
      if (btn) btn.disabled = W.name.trim().length < 2;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && W.name.trim().length >= 2) { e.preventDefault(); go(1); }
    });
  }
}

function go(d) { W.dir = d; W.step = Math.max(0, Math.min(2, W.step + d)); paintWizard(); }

export function showOnboarding(rerender) {
  const p = getProfile();
  W = { step: 0, dir: 1, lang: getSettings().lang, name: p.name || '', grade: null, rerender };
  openModal('', { onClose: false });
  document.querySelector('#modalRoot .sheet')?.classList.add('ob-sheet');
  paintWizard();
}

export function registerOnboardingActions(action, rerender) {
  action('ob-lang', ({ id }) => {
    W.lang = id;
    update((s) => { s.settings.lang = id; });
    document.documentElement.lang = id;
    rerender();               // интерфейс за окном сразу переходит на выбранный язык
    setTimeout(() => go(1), 180); // даём увидеть подсветку выбора
    paintWizard();
  });
  action('ob-next', () => { if (W.name.trim().length >= 2) go(1); });
  action('ob-back', () => go(-1));
  action('ob-grade', ({ id }) => { W.grade = Number(id); paintWizard(); });
  action('ob-finish', () => {
    if (!W.grade || W.name.trim().length < 2) return;
    update((s) => {
      s.profile.name = W.name.trim().slice(0, 40);
      s.profile.grade = W.grade;
      s.profile.onboarded = true;
      s.profile.tourDone = false;
      s.profile.createdAt = s.profile.createdAt || Date.now();
    });
    closeModal();
    location.hash = '#/';
    rerender();
    // Сразу предлагаем создать аккаунт (можно «просто посмотреть»), потом — тур
    const tour = () => setTimeout(() => startTour(rerender), 350);
    if (authAvailable() && !isLoggedIn()) setTimeout(() => openAuth('signup', 'auth.rWelcome', tour), 300);
    else tour();
  });
  action('tour-again', () => { location.hash = '#/'; rerender(); setTimeout(() => startTour(rerender), 300); });
}

/* ─── Тур ─────────────────────────────────────────────────────────────── */

const STEPS = [
  { sel: null, k: 's0', ic: 'sparkles' },
  { sel: '#pcards', k: 's1', ic: 'trend' },
  { sel: '.rail a.nav[href="#/topics"]', k: 's2', ic: 'book' },
  { sel: '.rail a.nav[href="#/tutor"]', k: 's3', ic: 'chat' },
  { sel: '.rail a.nav[href="#/pisa"]', k: 's4', ic: 'target' },
  { sel: '.coin-pill', k: 's5', ic: 'coin' },
  { sel: null, k: 'sOff', ic: 'cloud' },
  { sel: null, k: 's6', ic: 'play', final: true },
];

let T = null;

export function startTour(rerender) {
  endTour(false);
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  T = { i: 0, root, rerender };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tour]');
    if (!b) return;
    const a = b.dataset.tour;
    if (a === 'next') step(1);
    else if (a === 'prev') step(-1);
    else if (a === 'skip') endTour(true);
    else if (a === 'go') { endTour(true); location.hash = `#/topics?g=${getProfile().grade}`; }
  });
  T.onKey = (e) => { if (e.key === 'Escape') endTour(true); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
  T.onResize = () => place();
  document.addEventListener('keydown', T.onKey);
  window.addEventListener('resize', T.onResize);
  requestAnimationFrame(() => { root.classList.add('on'); show(); });
}

function step(d) {
  if (!T) return;
  const n = T.i + d;
  if (n < 0) return;
  if (n >= STEPS.length) { endTour(true); return; }
  T.i = n;
  show();
}

function targetEl(s) {
  if (!s.sel) return null;
  const el = document.querySelector(s.sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? el : null; // скрытый элемент (например, на телефоне) — показываем по центру
}

function show() {
  const s = STEPS[T.i];
  const el = targetEl(s);
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const card = T.root.querySelector('.tour-card');
  const name = esc(getProfile().name || '');
  card.innerHTML = `
    <div class="tour-anim">
      <div class="tour-top"><span class="tour-bear">${kapiSvg()}</span>
        <span class="tour-ic">${icon(s.ic, 16)}</span><span class="tour-count">${T.i + 1} / ${STEPS.length}</span></div>
      <h3>${tf('tour.' + s.k + 'T', { name })}</h3>
      <p>${tf('tour.' + s.k + 'B', { name })}</p>
      <div class="tour-dots">${STEPS.map((_, i) => `<i class="${i === T.i ? 'now' : ''}"></i>`).join('')}</div>
      <div class="tour-btns">
        ${s.final ? '' : `<button class="tour-skip" data-tour="skip">${t('tour.skip')}</button>`}
        <span style="flex:1"></span>
        ${T.i > 0 && !s.final ? `<button class="btn btn-soft btn-sm" data-tour="prev">${icon('arrowLeft', 14)}</button>` : ''}
        ${s.final
          ? `<button class="btn btn-sm" data-tour="go">${t('tour.go')} ${icon('arrowRight', 14)}</button>`
          : `<button class="btn btn-sm" data-tour="next">${T.i === 0 ? t('tour.begin') : t('tour.next')} ${icon('arrowRight', 14)}</button>`}
      </div>
    </div>`;
  // Позицию считаем после прокрутки к элементу
  setTimeout(place, el ? 350 : 0);
  place();
}

function place() {
  if (!T) return;
  const s = STEPS[T.i];
  const el = targetEl(s);
  const hole = T.root.querySelector('.tour-hole');
  const card = T.root.querySelector('.tour-card');
  const vw = innerWidth, vh = innerHeight;
  const cw = Math.min(340, vw - 24);
  card.style.width = `${cw}px`;
  const ch = card.offsetHeight || 220;
  if (!el) {
    Object.assign(hole.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px' });
    hole.classList.remove('ring');
    Object.assign(card.style, { left: `${(vw - cw) / 2}px`, top: `${Math.max(12, (vh - ch) / 2)}px` });
    card.classList.add('center');
    return;
  }
  card.classList.remove('center');
  const r = el.getBoundingClientRect();
  const pad = 8;
  Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  hole.style.borderRadius = getComputedStyle(el).borderRadius === '50%' ? '50%' : '22px';
  hole.classList.add('ring');
  let left, top;
  if (r.right + 24 + cw < vw && r.width < 140) {        // справа от узкой иконки
    left = r.right + 24; top = r.top + r.height / 2 - ch / 2;
  } else if (r.top > vh / 2) {                         // над элементом
    left = r.left + r.width / 2 - cw / 2; top = r.top - pad - 16 - ch;
  } else {                                             // под элементом
    left = r.left + r.width / 2 - cw / 2; top = r.bottom + pad + 16;
  }
  left = Math.max(12, Math.min(left, vw - cw - 12));
  top = Math.max(12, Math.min(top, vh - ch - 12));
  Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
}

function endTour(markDone) {
  if (!T) return;
  document.removeEventListener('keydown', T.onKey);
  window.removeEventListener('resize', T.onResize);
  const root = T.root;
  root.classList.remove('on');
  setTimeout(() => root.remove(), 300);
  if (markDone) update((s) => { s.profile.tourDone = true; });
  T = null;
}
