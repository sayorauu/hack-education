/**
 * Уровни ученика: 10 статусов от «Новичка» до «GOAT».
 * Уровень растёт от очков понимания (верные ответы, PISA, помощь другу).
 * На 10-м уровне — приз 10 000 монет (выдаёт state.js, один раз).
 */

import { icon } from './icons.js';
import { t, tf } from '../i18n.js';
import { getProfile, update, subscribe, levelInfo, LEVELS, LEVEL_MAX_PRIZE } from '../state.js';
import { esc, fmt, openModal, closeModal } from './kit.js';
import { action } from './dom.js';

// Иконка и цвет каждого уровня
const TIER = [
  { ic: 'sprout', h: 150 }, { ic: 'play', h: 190 }, { ic: 'book', h: 210 }, { ic: 'bolt', h: 235 }, { ic: 'target', h: 260 },
  { ic: 'star', h: 285 }, { ic: 'medal', h: 315 }, { ic: 'sparkles', h: 340 }, { ic: 'flame', h: 18 }, { ic: 'trophy', h: 45 },
];


/* Эмблемы званий: форма «растёт» по уровням — круг → шестигранник → щит →
   щит с лаврами → кристалл → крылья → корона GOAT с рогами. Цвета берутся из
   --lh (оттенок уровня), поэтому у каждого звания своя гамма. */
const SH_SHIELD = 'M24 3l18 6v13c0 11-7.5 18.5-18 23C13.5 40.5 6 33 6 22V9z';
const SH_SHIELD_IN = 'M24 7.5l14 4.7V22c0 8.8-5.8 14.8-14 18.6C15.8 36.8 10 30.8 10 22v-9.8z';
const HEX = '24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5';
const HEX_IN = '24,7.5 38,15.75 38,32.25 24,40.5 10,32.25 10,15.75';
const STAR = '24,13 26.23,18.93 32.56,19.22 27.61,23.17 29.29,29.28 24,25.8 18.71,29.28 20.39,23.17 15.44,19.22 21.77,18.93';
const WING = 'M21 21C14 12 6 11 1.5 13.5c3 1.8 5 4 6 7-3 0-5 1-6.3 3 4 1.4 8 1.3 11 3-2.2 1.2-3.2 3.2-3.2 5.3 5.2.2 9.6-3.2 12-10.8z';
export const RANK_SVG = [
  // 1 Новичок — росток в круге
  `<circle class="c" cx="24" cy="24" r="21"/><circle class="a" cx="24" cy="24" r="17"/><path class="ws" d="M24 35V23"/><path class="w" d="M24 26c-1.2-5.2-5.2-7.4-9.6-6.4.2 4.4 4.4 7.4 9.6 6.4z"/><path class="b" d="M24 23c1.2-5.2 5.2-7.4 9.6-6.4-.2 4.4-4.4 7.4-9.6 6.4z"/>`,
  // 2 Стартер — круг с первым шевроном и «стартовой» точкой
  `<circle class="c" cx="24" cy="24" r="21"/><circle class="b" cx="24" cy="24" r="17.5"/><circle class="a" cx="24" cy="24" r="14"/><path class="ws" d="M15.5 28.5 24 21l8.5 7.5"/><circle class="w" cx="24" cy="14.5" r="2.2"/>`,
  // 3 Читатель — шестигранник с раскрытой книгой
  `<polygon class="c" points="${HEX}"/><polygon class="a" points="${HEX_IN}"/><path class="w" d="M12.5 16.5c4.2-1.6 8-1 11.5 1.6v14.4c-3.5-2.6-7.3-3.2-11.5-1.6z"/><path class="b" d="M35.5 16.5c-4.2-1.6-8-1-11.5 1.6v14.4c3.5-2.6 7.3-3.2 11.5-1.6z"/>`,
  // 4 Скилл — шестигранник, два шеврона и молния-искра
  `<polygon class="c" points="${HEX}"/><polygon class="a" points="${HEX_IN}"/><path class="ws" d="M15.5 22.5 24 16l8.5 6.5M15.5 31 24 24.5l8.5 6.5"/><path class="b" d="M37.5 6.5l-3 5.2h3.4l-4 6.3 1-4.6h-3l2.6-6.9z"/>`,
  // 5 Про — щит с тремя шевронами
  `<path class="c" d="${SH_SHIELD}"/><path class="a" d="${SH_SHIELD_IN}"/><path class="ws thin" d="M16 18l8-5.5 8 5.5M16 25l8-5.5 8 5.5M16 32l8-5.5 8 5.5"/>`,
  // 6 Эксперт — щит со звездой и лентой
  `<path class="c" d="${SH_SHIELD}"/><path class="a" d="${SH_SHIELD_IN}"/><polygon class="w" points="${STAR}"/><path class="b" d="M15.5 33.5h17l-2.2 3.6h-12.6z"/>`,
  // 7 Мастер — щит в лавровых ветвях
  `<path class="b" d="M9 12.5C3.5 17 2.5 26 7 32.5c.7-4.2 2.8-6.7 6-8-3.2-2.1-4.4-6.3-4-12z"/><path class="b" d="M39 12.5c5.5 4.5 6.5 13.5 2 20-.7-4.2-2.8-6.7-6-8 3.2-2.1 4.4-6.3 4-12z"/><path class="c" d="M15 37.5l9 5.5 9-5.5v3.2L24 46l-9-5.3z"/><path class="c" d="M24 5l12.5 4.2v9.3c0 8.3-5.2 13.6-12.5 16.8-7.3-3.2-12.5-8.5-12.5-16.8V9.2z"/><path class="a" d="M24 8.6l9.5 3.2v6.8c0 6.4-3.9 10.6-9.5 13.1-5.6-2.5-9.5-6.7-9.5-13.1v-6.8z"/><path class="w" d="M24 13.5l5 6.3-5 6.3-5-6.3z"/>`,
  // 8 Гуру — огранённый кристалл с искрой
  `<path class="c" d="M13.5 6h21L45 18.5 24 44 3 18.5z"/><path class="b" d="M13.5 6h21L45 18.5H3z"/><path class="a" d="M17.5 18.5h13L24 41z"/><path class="w" d="M13.5 6l4 12.5L24 6l6.5 12.5 4-12.5" opacity=".55"/><path class="w" d="M40 2.5c.4 2.6 1.4 3.6 4 4-2.6.4-3.6 1.4-4 4-.4-2.6-1.4-3.6-4-4 2.6-.4 3.6-1.4 4-4z"/>`,
  // 9 Легенда — крылатый герб с пламенем
  `<path class="b" d="${WING}"/><path class="b" d="${WING}" transform="matrix(-1 0 0 1 48 0)"/><circle class="c" cx="24" cy="24" r="12.5"/><circle class="a" cx="24" cy="24" r="9.6"/><path class="w" d="M24 32c3.1 0 5.4-2.2 5.4-5.1 0-3.6-2.9-5.1-3.6-8.7-2.2 1.5-3.6 3.6-3.6 5.8 0 1.4-.9 2.2-1.6 1.4-.6-.6-.7-1.4-.7-2.2-1.4 1.3-1.3 2.7-1.3 3.7 0 2.9 2.3 5.1 5.4 5.1z"/>`,
  // 10 GOAT — корона с закрученными рогами козла, всегда золотая
  `<path class="g3" d="M15 23C7.5 22 3 15.5 5.5 6.5c1.8 5.3 5.6 8.3 11 9.4z"/><path class="g3" d="M33 23c7.5-1 12-7.5 9.5-16.5-1.8 5.3-5.6 8.3-11 9.4z"/><path class="g1" d="M9 21l4.5 18h21L39 21l-8.2 6.4L24 16l-6.8 11.4z"/><path class="g2" d="M13.5 39h21l-.8 4.5H14.3z"/><circle class="w" cx="24" cy="30.5" r="2.6"/><circle class="w" cx="17" cy="32.5" r="1.6" opacity=".8"/><circle class="w" cx="31" cy="32.5" r="1.6" opacity=".8"/><circle class="g2" cx="24" cy="15" r="2.3"/>`,
];
export const rankSvg = (n, cls = '') => `<svg class="rk ${n === 10 ? 'rk-goat' : ''} ${cls}" viewBox="0 0 48 48" aria-hidden="true">${RANK_SVG[Math.max(1, Math.min(10, n)) - 1]}</svg>`;

export const levelName = (n) => t('lvl.n' + Math.max(1, Math.min(10, n || 1)));

/** Маленький значок уровня: для списков друзей, рейтинга, меню. */
export function levelBadge(n, withName = true) {
  if (!n) return '';
  const k = Math.max(1, Math.min(10, n));
  const tr = TIER[k - 1];
  return `<span class="lvl-badge ${k === 10 ? 'goat' : ''}" style="--lh:${tr.h}" title="${esc(tf('lvl.badgeTitle', { n: k, name: levelName(k) }))}">${rankSvg(k)}<b>${k}</b>${withName ? `<span>${esc(levelName(k))}</span>` : ''}</span>`;
}

/** Большая карточка уровня в профиле. */
export function levelPanel() {
  const L = levelInfo();
  const tr = TIER[L.lvl - 1];
  const p = getProfile();
  return `<section class="panel lvl-panel ${L.max ? 'goat' : ''}" style="--lh:${tr.h}">
    <div class="lvl-top">
      <span class="lvl-big">${rankSvg(L.lvl)}<b>${L.lvl}</b></span>
      <div class="lvl-txt">
        <small>${tf('lvl.levelN', { n: L.lvl, of: LEVELS.length })}</small>
        <h2>${esc(levelName(L.lvl))}</h2>
        <p class="note">${L.max ? t('lvl.maxReached') : tf('lvl.toNext', { n: fmt(L.need), name: esc(levelName(L.lvl + 1)) })}</p>
      </div>
    </div>
    <div class="lvl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(L.pct * 100)}"><i style="width:${Math.max(3, Math.round(L.pct * 100))}%"></i></div>
    <div class="lvl-nums"><span>${fmt(L.pts)} ${t('lvl.pts')}</span><span>${L.max ? '' : fmt(L.to)}</span></div>
    <div class="lvl-ladder">${LEVELS.map((min, i) => {
      const n = i + 1, st = n < L.lvl ? 'done' : n === L.lvl ? 'now' : 'lock';
      return `<span class="lvl-step ${st} ${n === 10 ? 'goat' : ''}" style="--lh:${TIER[i].h}" title="${esc(levelName(n))} · ${fmt(min)}">${rankSvg(n)}<small>${esc(levelName(n))}</small></span>`;
    }).join('')}</div>
    <div class="lvl-prize ${p.maxLevelPaid ? 'got' : ''}">${icon('trophy', 18)}<span>${p.maxLevelPaid ? tf('lvl.prizeGot', { n: fmt(LEVEL_MAX_PRIZE) }) : tf('lvl.prize', { n: fmt(LEVEL_MAX_PRIZE) })}</span></div>
    <p class="note lvl-how">${icon('hint', 13)} ${t('lvl.how')}</p>
  </section>`;
}

/** Поздравление при новом уровне (один раз на уровень). */
let showing = false;
function checkLevelUp() {
  const p = getProfile();
  const L = levelInfo(p);
  if (showing || L.lvl <= (p.levelSeen || 1)) return;
  if (document.querySelector('#modalRoot .sheet')) return; // не перебиваем другое окно; покажем позже
  showing = true;
  const tr = TIER[L.lvl - 1];
  update((s) => { s.profile.levelSeen = L.lvl; });
  openModal(`<div class="lvl-up ${L.max ? 'goat' : ''}" style="--lh:${tr.h}">
      <span class="lvl-up-burst">${rankSvg(L.lvl)}<b>${L.lvl}</b></span>
      <small>${t('lvl.upKicker')}</small>
      <h2>${esc(levelName(L.lvl))}</h2>
      <p class="note">${L.max ? tf('lvl.upMax', { n: fmt(LEVEL_MAX_PRIZE) }) : tf('lvl.upNext', { n: fmt(L.need), name: esc(levelName(L.lvl + 1)) })}</p>
      <div class="q-actions" style="justify-content:center"><button class="btn" data-act="modal-close">${t('lvl.upBtn')}</button><button class="btn btn-soft" data-act="lvl-see">${t('lvl.upSee')}</button></div>
    </div>`, { onClose: () => { showing = false; } });
}

export function initLevels() {
  action('lvl-see', () => { closeModal(); location.hash = '#/profile'; });
  subscribe(() => setTimeout(checkLevelUp, 900)); // после анимации ответа
}
