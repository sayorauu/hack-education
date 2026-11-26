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

export const levelName = (n) => t('lvl.n' + Math.max(1, Math.min(10, n || 1)));

/** Маленький значок уровня: для списков друзей, рейтинга, меню. */
export function levelBadge(n, withName = true) {
  if (!n) return '';
  const k = Math.max(1, Math.min(10, n));
  const tr = TIER[k - 1];
  return `<span class="lvl-badge ${k === 10 ? 'goat' : ''}" style="--lh:${tr.h}" title="${esc(tf('lvl.badgeTitle', { n: k, name: levelName(k) }))}">${icon(tr.ic, 12)}<b>${k}</b>${withName ? `<span>${esc(levelName(k))}</span>` : ''}</span>`;
}

/** Большая карточка уровня в профиле. */
export function levelPanel() {
  const L = levelInfo();
  const tr = TIER[L.lvl - 1];
  const p = getProfile();
  return `<section class="panel lvl-panel ${L.max ? 'goat' : ''}" style="--lh:${tr.h}">
    <div class="lvl-top">
      <span class="lvl-big">${icon(tr.ic, 34)}<b>${L.lvl}</b></span>
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
      return `<span class="lvl-step ${st} ${n === 10 ? 'goat' : ''}" style="--lh:${TIER[i].h}" title="${esc(levelName(n))} · ${fmt(min)}">${icon(st === 'lock' ? 'lock' : TIER[i].ic, 14)}<small>${esc(levelName(n))}</small></span>`;
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
      <span class="lvl-up-burst">${icon(tr.ic, 44)}<b>${L.lvl}</b></span>
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
