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
import { esc, openModal, closeModal, kapiSvg, navIcon, coin } from './kit.js';
import { rankSvg } from './levels.js';
import { authAvailable, isLoggedIn } from '../cloud/auth.js';
import { openAuth } from './auth.js';
import { action as onAction } from './dom.js';

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
      </div>
      ${true ? `<button type="button" class="auth-jury ob-jury" data-act="ob-jury">${icon('trophy', 18)}<span><b>${t('jury.btn')}</b><small>${t('jury.btnB')}</small></span>${icon('arrowRight', 16)}</button>` : ''}`;
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
  action('ob-jury', () => {
    // Жюри пропускает знакомство: язык уже выбран, имя и класс ставим сами
    closeModal();
    setTimeout(() => document.dispatchEvent(new CustomEvent('nas:jury')), 50);
  });
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

// art: двухцветная иконка раздела (как в меню); isNew — пометка «Новое»
const STEPS = [
  { sel: null, k: 's0', art: 'bear' },
  { sel: '#pcards', k: 's1', art: 'home' },
  { sel: '.rail a.nav[href="#/topics"]', k: 's2', art: 'book' },
  { sel: '.rail a.nav[href="#/tutor"]', k: 's3', art: 'chat' },
  { sel: '.rail a.nav[href="#/pisa"]', k: 's4', art: 'target', isNew: true },
  { sel: '.rail a.nav[href="#/leaderboard"]', k: 'sLb', art: 'trophy', isNew: true },
  { sel: '.rail a.nav[href="#/friends"]', k: 'sFr', art: 'users', isNew: true },
  { sel: '.rail-user', k: 'sLvl', art: 'rank', isNew: true },
  { sel: '.coin-pill', k: 's5', art: 'coin' },
  { sel: null, k: 'sOff', art: 'cloud' },
  { sel: null, k: 's6', art: 'bear', final: true },
];

const artHtml = (a) => a === 'bear' ? `<span class="tour-bear">${kapiSvg()}</span>`
  : a === 'rank' ? `<span class="tour-art rank" style="--lh:235">${rankSvg(4)}</span>`
  : a === 'coin' ? `<span class="tour-art t-cream">${coin(26)}</span>`
  : a === 'cloud' ? `<span class="tour-art t-sky">${icon('cloud', 22)}</span>`
  : `<span class="tour-art">${navIcon(a)}</span>`;

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
    else if (a === 'go-pisa') { endTour(true); location.hash = '#/pisa'; }
    else if (a === 'go-friends') { endTour(true); location.hash = '#/friends'; }
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
  const pct = Math.round(((T.i + 1) / STEPS.length) * 100);
  card.innerHTML = `
    <div class="tour-anim">
      <div class="tour-top">${artHtml(s.art)}
        ${s.isNew ? `<span class="tour-new">${icon('sparkles', 12)} ${t('tour.new')}</span>` : ''}
        <span class="tour-count">${T.i + 1} / ${STEPS.length}</span></div>
      <h3>${tf('tour.' + s.k + 'T', { name })}</h3>
      <p>${tf('tour.' + s.k + 'B', { name })}</p>
      ${s.final ? `<div class="tour-pick">
          <button class="tour-opt" data-tour="go">${navIcon('book')}<span><b>${t('tour.goTopic')}</b><small>${t('tour.goTopicB')}</small></span></button>
          <button class="tour-opt" data-tour="go-pisa">${navIcon('target')}<span><b>${t('tour.goPisa')}</b><small>${t('tour.goPisaB')}</small></span></button>
          <button class="tour-opt" data-tour="go-friends">${navIcon('users')}<span><b>${t('tour.goFriends')}</b><small>${t('tour.goFriendsB')}</small></span></button>
        </div>` : ''}
      <div class="tour-prog"><i style="width:${pct}%"></i></div>
      <div class="tour-btns">
        ${s.final ? `<button class="tour-skip" data-tour="skip">${t('tour.later')}</button>` : `<button class="tour-skip" data-tour="skip">${t('tour.skip')}</button>`}
        <span style="flex:1"></span>
        ${T.i > 0 ? `<button class="btn btn-soft btn-sm" data-tour="prev" aria-label="${esc(t('ft.prev'))}">${icon('arrowLeft', 14)}</button>` : ''}
        ${s.final ? '' : `<button class="btn btn-sm" data-tour="next">${T.i === 0 ? t('tour.begin') : t('tour.next')} ${icon('arrowRight', 14)}</button>`}
      </div>
      ${T.i === 0 ? `<p class="tour-keys">${t('tour.keys')}</p>` : ''}
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
  if (markDone) update((s) => { s.profile.tourDone = true; s.profile.newsSeen = NEWS_VER; }); // тур уже показал все новинки
  T = null;
}

/* ─── «Что нового» для тех, кто уже проходил тур ──────────────────────── */

export const NEWS_VER = 2;
const NEWS = [
  { art: 'trophy', k: 'n1' }, { art: 'users', k: 'n2' }, { art: 'rank', k: 'n3' },
  { art: 'target', k: 'n4' }, { art: 'user', k: 'n5' }, { art: 'hint', k: 'n6' },
];

export function maybeWhatsNew(rerender) {
  const p = getProfile();
  if (!p.onboarded || !p.tourDone || (p.newsSeen || 0) >= NEWS_VER) return;
  setTimeout(() => {
    if (document.querySelector('#modalRoot .sheet') || document.querySelector('.tour')) return;
    openModal(`<div class="wn">
        <span class="wn-kicker">${icon('sparkles', 14)} ${t('wn.kicker')}</span>
        <h2>${t('wn.title')}</h2>
        <div class="wn-grid">${NEWS.map((n) => `<div class="wn-item">${n.art === 'rank' ? `<span class="tour-art rank" style="--lh:235">${rankSvg(4)}</span>` : n.art === 'hint' ? `<span class="tour-art">${icon('hint', 20)}</span>` : `<span class="tour-art">${navIcon(n.art)}</span>`}
          <span><b>${t('wn.' + n.k + 'T')}</b><small>${t('wn.' + n.k + 'B')}</small></span></div>`).join('')}</div>
        <div class="q-actions" style="justify-content:flex-end">
          <button class="btn btn-soft" data-act="wn-tour">${icon('play', 14)} ${t('wn.tour')}</button>
          <button class="btn" data-act="wn-ok">${t('wn.ok')}</button>
        </div>
      </div>`, { onClose: () => update((s) => { s.profile.newsSeen = NEWS_VER; }) });
    document.querySelector('#modalRoot .sheet')?.classList.add('wn-sheet');
  }, 900);
  onAction('wn-ok', () => closeModal());
  onAction('wn-tour', () => { closeModal(); location.hash = '#/'; rerender(); setTimeout(() => startTour(rerender), 300); });
}
