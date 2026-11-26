/**
 * Общие элементы интерфейса: боковая колонка, шапка, переключатели темы и
 * языка (с анимацией), аватары, обложки тем, модальные окна.
 */

import { icon } from './icons.js';
import { t, tf, loc, LANGS } from '../i18n.js';
import { getProfile, getSettings, update } from '../state.js';
import { SUBJECT_BY_ID } from '../data/curriculum.js';
import { initials } from '../data/classmates.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');

/* ─── Боковая колонка ─────────────────────────────────────────────────── */

const NAV = [
  { path: '/', icon: 'home', key: 'nav.home' },
  { path: '/topics', icon: 'book', key: 'nav.topics' },
  { path: '/tutor', icon: 'chat', key: 'nav.tutor' },
  { path: '/pisa', icon: 'target', key: 'nav.pisa' },
  { path: '/leaderboard', icon: 'trophy', key: 'nav.leaderboard', extra: true },
  { path: '/wallet', icon: 'wallet', key: 'nav.wallet', extra: true },
  { path: '/profile', icon: 'user', key: 'nav.profile' },
];

/* Двухтоновые иконки меню: основа полупрозрачная, деталь сплошная */
const NAV_SVG = {
  home: '<path opacity=".35" d="M3 10.6 12 3.2l9 7.4V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z"/><rect x="9" y="13.2" width="6" height="8.3" rx="1.6"/>',
  book: '<path opacity=".35" d="M2.5 5.2C5.6 4 8.7 4.2 11.2 6v14c-2.5-1.6-5.6-1.8-8.7-.7z"/><path d="M21.5 5.2C18.4 4 15.3 4.2 12.8 6v14c2.5-1.6 5.6-1.8 8.7-.7z"/>',
  chat: '<path opacity=".35" d="M12 3c5.2 0 9.5 3.6 9.5 8s-4.3 8-9.5 8c-1.1 0-2.2-.2-3.2-.5L4 20.5l1.3-4A7.6 7.6 0 0 1 2.5 11C2.5 6.6 6.8 3 12 3z"/><circle cx="8" cy="11" r="1.5"/><circle cx="12" cy="11" r="1.5"/><circle cx="16" cy="11" r="1.5"/>',
  target: '<circle cx="12" cy="12" r="10" opacity=".3"/><circle cx="12" cy="12" r="6.5" opacity=".55"/><circle cx="12" cy="12" r="3"/>',
  trophy: '<path opacity=".35" d="M4 4.5h3v4a3 3 0 0 1-3-3zM20 4.5h-3v4a3 3 0 0 0 3-3z"/><path d="M6.5 3h11v6a5.5 5.5 0 0 1-11 0z"/><rect x="10.6" y="14" width="2.8" height="4" opacity=".35"/><rect x="7" y="18" width="10" height="3.2" rx="1.6"/>',
  wallet: '<rect opacity=".35" x="2.5" y="5.5" width="19" height="15" rx="3.5"/><path d="M15.2 10.6h6.3v5h-6.3a2.5 2.5 0 0 1 0-5z"/><path d="M5.5 5.5 15.6 2.8a1.4 1.4 0 0 1 1.8 1.3v1.4z"/>',
  user: '<circle cx="12" cy="7.8" r="4.3"/><path opacity=".35" d="M3.5 21a8.5 8.5 0 0 1 17 0z"/>',
  shield: '<path opacity=".35" d="M12 2.5 20 5.5v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10v-6z"/><path d="m8.4 12 2.6 2.6 4.6-5" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  users: '<circle cx="9" cy="8" r="3.8"/><path opacity=".35" d="M2 20.5a7 7 0 0 1 14 0z"/><circle cx="17" cy="9" r="2.8" opacity=".55"/>',
};
export const navIcon = (name) => NAV_SVG[name]
  ? `<svg class="nav-ic" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">${NAV_SVG[name]}</svg>`
  : icon(name, 22);

export function renderRail(path) {
  const p = getProfile();
  const section = '/' + (path.split('/')[1] || '');
  const active = (n) => (n.path === '/' ? path === '/' : section === n.path || (n.path === '/topics' && (section === '/topic' || section === '/practice')));
  return `
    <a class="rail-logo" href="#/" aria-label="NASstudy"><img class="logo-img" src="logo-mark.png" alt=""></a>
    ${NAV.map((n) => `<a class="nav ${active(n) ? 'on' : ''} ${n.extra ? 'nav-extra' : ''}" href="#${n.path}" data-tip="${esc(t(n.key))}" aria-label="${esc(t(n.key))}"${active(n) ? ' aria-current="page"' : ''}>${navIcon(n.icon)}</a>`).join('')}
    <div class="rail-spacer"></div>
    <a class="rail-avatar" href="#/profile" aria-label="${esc(t('nav.profile'))}">${esc(initials(p.name || 'NS'))}</a>`;
}

/* ─── Шапка страницы ──────────────────────────────────────────────────── */

export function tools() {
  const p = getProfile();
  const s = getSettings();
  return `
    <div class="top-tools">
      ${p.streakDays > 0 ? `<span class="streak-pill" title="${esc(tf('dash.streak', { n: p.streakDays }))}">${icon('flame', 18)} ${p.streakDays}</span>` : ''}
      <a class="coin-pill" href="#/wallet" title="${esc(t('nav.wallet'))}">${coin(26)}<span id="coinCount">${fmt(p.coins)}</span></a>
      <div class="lang-pill" data-lang="${s.lang}" role="group" aria-label="${esc(t('lang.label'))}">
        <span class="thumb"></span>
        ${LANGS.map((l) => `<button data-act="lang" data-id="${l.id}" class="${s.lang === l.id ? 'on' : ''}" aria-pressed="${s.lang === l.id}">${l.label}</button>`).join('')}
      </div>
      <button class="theme-toggle" data-act="theme" aria-label="${esc(t(s.theme === 'dark' ? 'theme.toLight' : 'theme.toDark'))}" title="${esc(t(s.theme === 'dark' ? 'theme.toLight' : 'theme.toDark'))}">
        <span class="star s1"></span><span class="star s2"></span><span class="star s3"></span>
        <span class="cloud cl1"></span><span class="cloud cl2"></span>
        <span class="knob"><span class="crater c1"></span><span class="crater c2"></span><span class="crater c3"></span></span>
      </button>
    </div>`;
}

export function header(title, sub = '') {
  return `<header class="top"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${tools()}</header>`;
}

/* ─── Тема и язык с анимацией ─────────────────────────────────────────── */

/**
 * Смена темы: круг новой темы расходится от кнопки (View Transitions API).
 * Без поддержки API тема просто плавно меняется через CSS-переходы.
 */
export function switchTheme(btn, rerender) {
  const next = getSettings().theme === 'dark' ? 'light' : 'dark';
  const apply = () => {
    update((s) => { s.settings.theme = next; });
    document.documentElement.dataset.theme = next;
    rerender();
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) { apply(); return; }
  const r = btn.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.documentElement.dataset.vt = 'theme';
  const tr = document.startViewTransition(apply);
  tr.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 700, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' });
  });
  tr.finished.finally(() => { delete document.documentElement.dataset.vt; });
}

/** Смена языка: старый текст растворяется вверх с размытием, новый проявляется снизу. */
export function switchLang(id, rerender) {
  if (getSettings().lang === id) return;
  const apply = () => {
    update((s) => { s.settings.lang = id; });
    document.documentElement.lang = id;
    rerender();
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !reduce) {
    document.documentElement.dataset.vt = 'lang';
    const tr = document.startViewTransition(apply);
    tr.finished.finally(() => { delete document.documentElement.dataset.vt; });
  } else {
    apply();
    document.body.classList.remove('lang-swap'); void document.body.offsetWidth;
    document.body.classList.add('lang-swap');
  }
}

/* ─── Мелочи ──────────────────────────────────────────────────────────── */

/**
 * Монета NASstudy: золотой диск с двойным ободком, бликом и отпечатком
 * медвежьей лапы (в тон логотипу). Чистый CSS + маленький SVG.
 */
const PAW = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="15.6" rx="4.6" ry="3.9"/><ellipse cx="6.4" cy="10.4" rx="1.9" ry="2.4" transform="rotate(-18 6.4 10.4)"/><ellipse cx="10" cy="7.3" rx="1.9" ry="2.5"/><ellipse cx="14" cy="7.3" rx="1.9" ry="2.5"/><ellipse cx="17.6" cy="10.4" rx="1.9" ry="2.4" transform="rotate(18 17.6 10.4)"/></svg>';
export function coin(size = 24, cls = '') {
  return `<span class="coin ${cls}" style="--s:${size}px" aria-hidden="true">${PAW}</span>`;
}

export function avatar(name, hue = 260, cls = '') {
  return `<span class="avatar ${cls}" style="background:hsl(${hue} 65% 62%)">${esc(initials(name))}</span>`;
}

export function thumb(topic, size = 34, lg = false) {
  const s = SUBJECT_BY_ID[topic.subject];
  return `<span class="thumb th-${topic.subject} ${lg ? 'lg' : ''}">${icon(s.icon, size)}</span>`;
}

export const tintOf = (subject) => SUBJECT_BY_ID[subject]?.tint || 'lilac';

export function timeAgo(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return t('time.now');
  if (m < 60) return tf('time.min', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return tf('time.h', { n: h });
  return tf('time.d', { n: Math.round(h / 24) });
}

export function subjName(id) { return loc(SUBJECT_BY_ID[id]); }

/** Всплывающее «+N монет» над элементом. */
export function coinBurst(el, n) {
  if (!n) return;
  const r = (el || document.getElementById('coinCount'))?.getBoundingClientRect();
  if (!r) return;
  const f = document.createElement('div');
  f.className = 'coin-float';
  f.innerHTML = `+${n} ${coin(22)}`;
  f.style.left = `${r.left + r.width / 2 - 20}px`;
  f.style.top = `${r.top - 10}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1200);
  const cc = document.getElementById('coinCount');
  if (cc) cc.textContent = fmt(getProfile().coins);
}

/* ─── Модальные окна ──────────────────────────────────────────────────── */

export function openModal(innerHtml, { onClose } = {}) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal" data-modal-bg><div class="sheet" role="dialog" aria-modal="true">${innerHtml}</div></div>`;
  const bg = root.querySelector('[data-modal-bg]');
  bg.addEventListener('click', (e) => { if (e.target === bg && onClose !== false) closeModal(); });
  root._onClose = onClose;
  setTimeout(() => root.querySelector('input, button')?.focus(), 50);
  return root.querySelector('.sheet');
}

export function closeModal() {
  const root = document.getElementById('modalRoot');
  const cb = root._onClose;
  root.innerHTML = '';
  root._onClose = null;
  if (typeof cb === 'function') cb();
}
