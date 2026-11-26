/**
 * Три механики, ради которых друзья на сайте реально помогают учиться:
 *
 *  1. Лига недели. Ты и твои друзья, настоящие очки из базы. Очки дают
 *     только за верные ответы (сложнее задание — больше), за PISA и за
 *     помощь другу. В понедельник счёт обнуляется, топ-3 получают монеты.
 *  2. «Объясни другу». Друг ошибся в задании, которое ты решил: пишешь, где
 *     в тексте ответ. Он решает похожее — оба получаете очки. Кто объясняет,
 *     тот понимает текст глубже (эффект наставника).
 *  3. Серия вдвоём. День засчитывается, только если оба решили ≥3 задания
 *     и ≥60% верно. Просто зайти на сайт не считается.
 *
 * Плюс туториал «Как это работает» при первом заходе в «Друзья».
 */

import { icon } from './icons.js';
import { t, tf, loc } from '../i18n.js';
import { getProfile, update, levelInfo, leagueView, LEAGUE, daysLeftInWeek, qualifiedDays, todayNeed, dayKey, setLeague, addLeaguePoints, awardCoins, recordAttempt } from '../state.js';
import { authAvailable, isLoggedIn, myId } from '../cloud/auth.js';
import { loadFriends, sendMessage, thanksSince, socialErrorKey, weeklyTop, myWeeklyRank } from '../cloud/social.js';
import { ITEM_BY_ID, ITEMS_BY_TOPIC, TOPIC_BY_ID, PASSAGES } from '../data/curriculum.js';
import { esc, fmt, openModal, closeModal, photoAva } from './kit.js';
import { levelBadge } from './levels.js';
import { action, toast } from './dom.js';

let rerenderRef = () => {};
const LG = { list: null, at: 0, loading: false, err: '' };

const ava = (id, name, size = 38, avatar = null) => photoAva({ id, name, avatar }, size);
const short = (s, n = 70) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };

/** Очки ученика за неделю по его публичной карточке. */
const ptsOf = (st, week) => (st?.week === week ? st.wpts || 0 : st?.pw === week ? st.ppts || 0 : 0);

/* ─── Серия вдвоём ────────────────────────────────────────────────────── */

export function pairStreak(theirDays = []) {
  const A = new Set(qualifiedDays(getProfile())), B = new Set(theirDays);
  const both = (k) => A.has(k) && B.has(k);
  const today = dayKey();
  const d = new Date();
  const todayBoth = both(today);
  if (!todayBoth) d.setDate(d.getDate() - 1);
  let n = 0;
  while (both(dayKey(d)) && n < 400) { n += 1; d.setDate(d.getDate() - 1); }
  return { n, todayBoth, meToday: A.has(today), themToday: B.has(today) };
}

const NUDGE_KEY = 'nasstudy.nudged';
const nudgedToday = (id) => { try { return JSON.parse(localStorage.getItem(NUDGE_KEY) || '{}')[id] === dayKey(); } catch { return false; } };
const markNudged = (id) => { try { const m = JSON.parse(localStorage.getItem(NUDGE_KEY) || '{}'); m[id] = dayKey(); localStorage.setItem(NUDGE_KEY, JSON.stringify(m)); } catch { /* память */ } };

/** Что осталось мне сегодня — короткой строкой. */
const needLine = () => { const n = todayNeed(); return n.done ? t('ps.meDone') : tf('ps.meNeed', { n: n.more }); };

/** Плашка «серия сгорит» вверху страницы «Друзья». */
export function streakBanner(friends = []) {
  const risk = friends.map((f) => ({ f, s: pairStreak(f.card.stats?.qd) })).filter((x) => x.s.n > 0 && !x.s.todayBoth);
  if (!risk.length) return '';
  const top = risk.sort((a, b) => b.s.n - a.s.n)[0];
  const name = esc(top.f.card.name || t('fr.noName'));
  const mine = todayNeed();
  return `<div class="ps-banner">
    <span class="ps-flame">${icon('flame', 22)}<b>${top.s.n}</b></span>
    <span><b>${tf('ps.riskT', { name, n: top.s.n })}</b><small>${mine.done ? tf('ps.riskThem', { name }) : tf('ps.riskMe', { n: mine.more })}</small></span>
    ${mine.done ? '' : `<a class="btn btn-sm" href="#/topics">${t('ps.go')}</a>`}
  </div>`;
}

/** Строка под другом: серия вдвоём, «Помочь», «Напомнить». */
export function friendExtras(f) {
  const s = pairStreak(f.card.stats?.qd);
  const help = helpCandidates(f.card).length;
  const status = s.todayBoth ? `<span class="ps-st ok">${icon('check', 12)} ${t('ps.todayBoth')}</span>`
    : s.themToday ? `<span class="ps-st">${tf('ps.themDone', { name: esc(short(f.card.name || t('fr.noName'), 14)) })}</span>`
    : s.meToday ? (nudgedToday(f.id) ? `<span class="ps-st">${t('ps.nudged')}</span>` : `<button class="chip ps-nudge" data-act="ps-nudge" data-id="${f.id}">${icon('bolt', 12)} ${t('ps.nudge')}</button>`)
    : `<span class="ps-st">${needLine()}</span>`;
  return `<div class="fr-extra">
    <span class="ps-chip ${s.n ? 'on' : ''}" title="${esc(t('ps.title'))}">${icon('flame', 13)} ${tf('ps.chip', { n: s.n })}</span>
    ${status}
    ${help ? `<a class="chip ex-chip" href="#/friends/${f.id}">${icon('hint', 12)} ${tf('ex.helpN', { n: help })}</a>` : ''}
  </div>`;
}

/* ─── Лига недели (страница «Рейтинг») ────────────────────────────────── */

async function loadLeague(force = false) {
  if (LG.loading || !isLoggedIn() || !navigator.onLine) return;
  if (!force && LG.list && Date.now() - LG.at < 20000) return;
  LG.loading = true;
  try {
    const r = await loadFriends();
    LG.list = r.friends; LG.err = '';
    claimPrevWeek(LG.list);
  } catch (e) { LG.err = socialErrorKey(e); }
  LG.loading = false; LG.at = Date.now();
  if (location.hash.startsWith('#/leaderboard')) rerenderRef();
}

/** Итоги прошлой недели: место среди друзей и монеты топ-3 (один раз). */
function claimPrevWeek(friends) {
  const v = leagueView();
  if (v.claimed === v.prevWeek) return;
  const rows = [{ me: true, pts: v.prevPts }, ...friends.map((f) => ({ pts: ptsOf(f.card.stats, v.prevWeek) }))].filter((r) => r.pts > 0);
  const res = { week: v.prevWeek, rank: 0, of: rows.length, coins: 0 };
  if (v.prevPts > 0 && rows.length >= 2) {
    rows.sort((a, b) => b.pts - a.pts);
    res.rank = rows.findIndex((r) => r.me) + 1;
    if (res.rank <= 3) res.coins = awardCoins(LEAGUE.rewards[res.rank - 1], 'league');
  }
  setLeague((L) => { L.claimed = v.prevWeek; if (res.rank) L.last = res; });
  if (res.coins) setTimeout(() => toast(tf('lg.rewardToast', { r: res.rank, n: res.coins })), 400);
}

const MEDAL = ['gold', 'silver', 'bronze'];

export function renderLeague() {
  if (!authAvailable()) return '';
  const how = `<button class="btn btn-soft btn-sm" data-act="fr-tour" data-id="1">${icon('hint', 14)} ${t('ft.how')}</button>`;
  const head = (sub) => `<div class="lg-head"><span class="lg-ic">${icon('trophy', 22)}</span><div><h2>${t('lg.title')}</h2><small>${sub}</small></div>${how}</div>`;
  const left = daysLeftInWeek();
  const sub = tf('lg.left', { n: left });

  if (!isLoggedIn()) {
    return `<section class="panel lg lg-guest">${head(t('lg.guestSub'))}
      <p class="note">${t('lg.guestB')}</p>
      <button class="btn" data-act="auth-open" data-id="signup">${t('auth.tabSignup')}</button></section>`;
  }
  loadLeague();
  if (!LG.list) {
    return `<section class="panel lg">${head(sub)}${LG.err ? `<p class="fr-err">${icon('shield', 16)} ${t(LG.err)}</p>` : `<p class="empty"><span class="spin"></span></p>`}</section>`;
  }

  const p = getProfile();
  const v = leagueView();
  const me = myId();
  const rows = [
    { id: me, name: p.name || t('lb.you'), avatar: p.avatar, lvl: levelInfo(p).lvl, me: true, pts: v.pts, streak: null },
    ...LG.list.map((f) => ({ id: f.id, name: f.card.name || t('fr.noName'), avatar: f.card.avatar, lvl: f.card.stats?.lvl, pts: ptsOf(f.card.stats, v.week), streak: pairStreak(f.card.stats?.qd).n })),
  ].sort((a, b) => b.pts - a.pts || (a.me ? -1 : b.me ? 1 : 0));
  const myIdx = rows.findIndex((r) => r.me);

  let gap = '';
  if (rows.length > 1) {
    if (myIdx > 0) {
      const above = rows[myIdx - 1];
      const d = above.pts - v.pts + 1;
      gap = `<div class="lg-gap">${icon('trend', 16)} <span>${tf('lg.gapUp', { name: esc(above.name), n: d, k: Math.max(1, Math.ceil(d / 12)) })}</span></div>`;
    } else {
      const lead = v.pts - rows[1].pts;
      gap = `<div class="lg-gap lead">${icon('trophy', 16)} <span>${v.pts ? tf('lg.lead', { n: lead }) : t('lg.startFirst')}</span></div>`;
    }
  }

  const L = p.league || {};
  const last = L.last && L.last.week === v.prevWeek ? L.last : null;
  const lastBanner = last ? `<div class="lg-last">${icon('medal', 16)} <span>${tf('lg.lastWeek', { r: last.rank, of: last.of })}${last.coins ? ' · ' + tf('lg.lastCoins', { n: last.coins }) : ''}</span></div>` : '';

  const row = (r, i) => `<li class="lg-row ${r.me ? 'me' : ''}">
      <span class="lg-rank ${MEDAL[i] || ''}">${i + 1}</span>
      ${ava(r.id, r.name, 38, r.avatar)}
      <span class="lg-name"><b>${esc(r.name)}${r.me ? ` <em>${t('lb.you')}</em>` : ''} ${levelBadge(r.lvl, false)}</b>
        ${r.me ? `<small>${needLine()}</small>` : r.streak ? `<small class="lg-streak">${icon('flame', 12)} ${tf('ps.chip', { n: r.streak })}</small>` : ''}</span>
      <span class="lg-pts"><b>${fmt(r.pts)}</b><small>${t('lg.pts')}</small></span>
    </li>`;

  return `<section class="panel lg">
    ${head(sub)}
    ${lastBanner}
    ${LG.list.length ? gap : ''}
    <ol class="lg-list">${rows.map(row).join('')}</ol>
    ${LG.list.length ? '' : `<div class="lg-empty">${icon('users', 22)}<span>${t('lg.noFriends')}</span><a class="btn btn-sm" href="#/friends">${t('lg.addFriends')}</a></div>`}
    <div class="lg-rules">
      <span>${icon('check', 13)} ${t('lg.r1')}</span>
      <span>${icon('hint', 13)} ${tf('lg.r2', { n: LEAGUE.helpGiver })}</span>
      <span>${icon('coin', 13)} ${tf('lg.r3', { a: LEAGUE.rewards[0], b: LEAGUE.rewards[1], c: LEAGUE.rewards[2] })}</span>
    </div>
  </section>`;
}

/* ─── Общий рейтинг недели (все ученики) ──────────────────────────────── */

const GL = { top: null, me: null, at: 0, loading: false, err: '' };

async function loadGlobal(force = false) {
  if (GL.loading || !isLoggedIn() || !navigator.onLine) return;
  if (!force && GL.top && Date.now() - GL.at < 30000) return;
  GL.loading = true;
  const v = leagueView();
  try {
    [GL.top, GL.me] = await Promise.all([weeklyTop(v.week, 10), myWeeklyRank(v.week).then((r) => r?.[0] || null)]);
    GL.err = '';
    claimGlobalPrize();
  } catch (e) {
    const k = socialErrorKey(e);
    GL.err = k === 'fr.errSetup' ? 'gl.setup' : k;
  }
  GL.loading = false; GL.at = Date.now();
  if (location.hash.startsWith('#/leaderboard')) rerenderRef();
}

/** Лидер прошлой недели среди всех учеников получает приз (один раз). */
async function claimGlobalPrize() {
  const v = leagueView();
  if (getProfile().league?.claimedGlobal === v.prevWeek || v.prevPts <= 0) return;
  try {
    const rows = await weeklyTop(v.prevWeek, 2);
    const win = rows.length >= 2 && rows[0].id === myId() && rows[1].place > 1; // чистая победа, минимум 2 участника
    const coins = win ? awardCoins(LEAGUE.globalPrize, 'leagueTop') : 0;
    setLeague((L) => { L.claimedGlobal = v.prevWeek; if (win) L.lastGlobal = { week: v.prevWeek, coins }; });
    if (coins) setTimeout(() => toast(tf('gl.wonToast', { n: coins })), 600);
  } catch { /* попробуем при следующем заходе */ }
}

export function renderGlobal() {
  if (!authAvailable() || !isLoggedIn()) return '';
  loadGlobal();
  const v = leagueView();
  const me = myId();
  const p = getProfile();
  const head = `<div class="lg-head"><span class="lg-ic gl-ic">${icon('graph', 22)}</span><div><h2>${t('gl.title')}</h2><small>${tf('gl.sub', { n: daysLeftInWeek() })}</small></div></div>
    <div class="gl-prize">${coinTiny()}<span>${tf('gl.prize', { n: fmt(LEAGUE.globalPrize) })}</span></div>`;
  const lastWin = p.league?.lastGlobal && p.league.lastGlobal.week === v.prevWeek ? `<div class="lg-last">${icon('trophy', 16)} <span>${tf('gl.wonLast', { n: fmt(p.league.lastGlobal.coins) })}</span></div>` : '';
  if (!GL.top) {
    return `<section class="panel lg gl">${head}${GL.err ? `<p class="fr-err">${icon('shield', 16)} ${t(GL.err)}</p>` : `<p class="empty"><span class="spin"></span></p>`}</section>`;
  }
  const row = (r) => {
    const mine = r.id === me;
    const name = mine ? (p.name || t('lb.you')) : (r.name || t('fr.noName'));
    return `<li class="lg-row ${mine ? 'me' : ''}">
      <span class="lg-rank ${MEDAL[r.place - 1] || ''}">${r.place}</span>
      ${photoAva({ id: r.id, name }, 38)}
      <span class="lg-name"><b>${esc(name)}${mine ? ` <em>${t('lb.you')}</em>` : ''}</b><small>${r.grade ? tf('common.grade', { n: r.grade }) : ''}</small></span>
      <span class="lg-pts"><b>${fmt(r.pts)}</b><small>${t('lg.pts')}</small></span>
    </li>`;
  };
  const inTop = GL.top.some((r) => r.id === me);
  const leader = GL.top[0];
  let gap = '';
  if (leader && leader.id !== me) {
    const d = leader.pts - v.pts + 1;
    gap = `<div class="lg-gap">${icon('trend', 16)} <span>${tf('gl.gap', { n: fmt(d), k: Math.max(1, Math.ceil(d / 12)) })}</span></div>`;
  } else if (leader && leader.id === me) gap = `<div class="lg-gap lead">${icon('trophy', 16)} <span>${t('gl.youLead')}</span></div>`;
  return `<section class="panel lg gl">
    ${head}
    ${lastWin}
    ${gap}
    ${GL.top.length ? `<ol class="lg-list">${GL.top.map(row).join('')}</ol>` : `<div class="lg-empty">${icon('sparkles', 22)}<span>${t('gl.empty')}</span></div>`}
    ${!inTop ? `<div class="gl-me">${GL.me?.place ? tf('gl.myPlace', { r: GL.me.place, of: GL.me.total, n: fmt(GL.me.pts) }) : t('gl.notYet')}</div>` : ''}
    <p class="note gl-note">${icon('shield', 13)} ${t('gl.privacy')}</p>
  </section>`;
}
const coinTiny = () => `<span class="gl-coin">${icon('coin', 16)}</span>`;

/* ─── «Объясни другу» ─────────────────────────────────────────────────── */

/** Задания, где друг ошибся, а я решил верно и ещё не объяснял. */
export function helpCandidates(card) {
  const p = getProfile();
  const ok = new Set(p.history.filter((h) => h.correct).map((h) => h.itemId));
  const done = new Set(p.league?.explained || []);
  return (card?.stats?.miss || []).filter((id) => ITEM_BY_ID[id] && ok.has(id) && !done.has(card.id + ':' + id));
}

/** Блок в чате: «Можешь помочь {name}». */
export function helpPanel(friendId, card) {
  const list = helpCandidates({ ...card, id: friendId });
  if (!list.length) return '';
  const name = esc(card.name || t('fr.noName'));
  return `<details class="ex-panel">
    <summary class="ex-panel-h">${icon('hint', 16)}<b>${tf('ex.canHelp', { name })}</b><span class="ex-count">${list.length}</span>${icon('chevR', 14)}</summary>
    <small class="ex-panel-b">${tf('ex.canHelpB', { n: LEAGUE.helpGiver })}</small>
    <div class="ex-items">${list.slice(0, 4).map((id) => {
      const it = ITEM_BY_ID[id];
      return `<button class="ex-item" data-act="ex-open" data-id="${friendId}" data-item="${esc(id)}"><small>${esc(loc(TOPIC_BY_ID[it.topic]))}</small><span>${esc(short(loc(it.stem), 80))}</span><em>${t('ex.explain')} ${icon('arrowRight', 13)}</em></button>`;
    }).join('')}</div>
  </details>`;
}

const passageMini = (key) => {
  const ps = PASSAGES[key];
  if (!ps) return '';
  return `<details class="ex-passage"><summary>${icon('book', 14)} ${esc(loc(ps.title))}</summary>${ps.text ? `<p>${esc(loc(ps.text))}</p>` : ''}</details>`;
};

function openExplain(friendId, itemId) {
  const it = ITEM_BY_ID[itemId];
  if (!it) return;
  openModal(`<form class="ex-sheet" data-act="ex-send" data-id="${friendId}" data-item="${esc(itemId)}">
    <span class="ex-ic">${icon('hint', 22)}</span>
    <h2>${t('ex.title')}</h2>
    <p class="note">${t('ex.sub')}</p>
    ${it.passage ? passageMini(it.passage) : ''}
    <div class="ex-q"><small>${t('ex.task')}</small><p>${esc(loc(it.stem))}</p>
      <p class="ex-ans">${icon('check', 14)} ${esc(loc(it.options[it.answer]))}</p></div>
    <label class="field"><span>${t('ex.yourWords')}</span>
      <textarea class="input ex-text" name="body" rows="4" maxlength="400" required placeholder="${esc(t('ex.ph'))}"></textarea></label>
    <p class="note ex-tip">${t('ex.tip')}</p>
    <p class="auth-err ex-err" role="alert" hidden></p>
    <div class="q-actions"><button type="button" class="btn btn-soft" data-act="modal-close">${t('common.close')}</button>
      <button class="btn" type="submit">${icon('send', 16)} ${t('ex.send')}</button></div>
  </form>`);
  setTimeout(() => document.querySelector('.ex-text')?.focus(), 60);
}

/** Пузырь «объяснение» в чате. */
export function explainBubble(m, mine, time) {
  const it = ITEM_BY_ID[m.payload?.item];
  const tried = (getProfile().league?.tried || []).includes(m.id);
  return `<div class="fr-msg ex ${mine ? 'me' : 'them'}">
    <small class="ex-tag">${icon('hint', 13)} ${t(mine ? 'ex.bubbleMine' : 'ex.bubbleThem')}</small>
    ${it ? `<span class="ex-task"><small>${t('ex.task')}</small>${esc(short(loc(it.stem), 90))}</span>` : ''}
    <span class="ex-body">${esc(m.body)}</span>
    ${!mine && it ? (tried ? `<em class="ex-done">${icon('check', 13)} ${t('ex.solvedSimilar')}</em>`
      : `<button class="btn btn-sm ex-try" data-act="ex-try" data-id="${m.id}" data-from="${m.sender}" data-item="${esc(it.id)}">${icon('target', 14)} ${tf('ex.trySimilar', { n: LEAGUE.helpLearner })}</button>`) : ''}
    <time>${time}</time></div>`;
}

export function thanksBubble(m, mine, time, name) {
  const n = mine ? LEAGUE.helpLearner : LEAGUE.helpGiver;
  return `<div class="fr-sys thx"><span class="thx-ic">${icon('sparkles', 15)}</span>
    <span>${mine ? t('ex.thxMine') : tf('ex.thxThem', { name: esc(name || t('fr.noName')) })}</span><b class="thx-pts">+${n}</b><time>${time}</time></div>`;
}

/* Мини-задание «Реши похожее» прямо в окне */
let EX = null;

function similarItem(itemId, avoid = []) {
  const it = ITEM_BY_ID[itemId];
  const p = getProfile();
  const ok = new Set(p.history.filter((h) => h.correct).map((h) => h.itemId));
  const pool = (ITEMS_BY_TOPIC[it.topic] || []).filter((x) => x.id !== itemId && !avoid.includes(x.id));
  const fresh = pool.filter((x) => !ok.has(x.id));
  const list = fresh.length ? fresh : pool;
  return list.length ? list.sort((a, b) => Math.abs(a.b - it.b) - Math.abs(b.b - it.b))[0] : it;
}

function exQuizHtml() {
  const it = EX.item;
  const ok = EX.revealed && EX.sel === it.answer;
  const opts = it.options.map((o, i) => {
    let cls = '';
    if (EX.revealed) { if (i === it.answer) cls = 'ok'; else if (i === EX.sel) cls = 'bad'; } else if (i === EX.sel) cls = 'sel';
    return `<button type="button" class="opt ${cls}" data-act="ex-pick" data-i="${i}" ${EX.revealed ? 'disabled' : ''}><span class="k">${'ABCD'[i]}</span>${esc(loc(o))}</button>`;
  }).join('');
  return `<div class="ex-sheet ex-quiz">
    <span class="ex-ic">${icon('target', 22)}</span>
    <h2>${t('ex.quizT')}</h2>
    <p class="note">${t('ex.quizSub')}</p>
    ${it.passage ? passageMini(it.passage) : ''}
    <p class="stem">${esc(loc(it.stem))}</p>
    <div class="opts">${opts}</div>
    ${EX.revealed ? `<div class="fb ${ok ? 'ok' : 'bad'}"><h4>${icon(ok ? 'check' : 'cross', 18)} ${ok ? tf('ex.quizOk', { n: LEAGUE.helpLearner }) : t('pr.wrong')}</h4><p>${esc(loc(it.explain))}</p></div>` : ''}
    <div class="q-actions">
      ${EX.revealed
        ? (ok ? `<button class="btn" data-act="modal-close">${t('ex.great')}</button>` : `<button class="btn btn-soft" data-act="modal-close">${t('common.close')}</button><button class="btn" data-act="ex-another">${t('ex.another')}</button>`)
        : `<button class="btn btn-soft" data-act="modal-close">${t('common.close')}</button><button class="btn" data-act="ex-check" ${EX.sel === null ? 'disabled' : ''}>${t('pr.check')}</button>`}
    </div></div>`;
}
const exPaint = () => { const sh = document.querySelector('#modalRoot .sheet'); if (sh && EX) sh.innerHTML = exQuizHtml(); };

/** Начисляем очки за мои объяснения, которые друзья поняли (раз в 30 с). */
export async function creditThanks() {
  if (!isLoggedIn() || !navigator.onLine) return;
  try {
    const [y, m, d] = leagueView().week.split('-').map(Number);
    const rows = await thanksSince(new Date(y, m - 1, d).toISOString());
    const got = new Set(getProfile().league?.credited || []);
    const fresh = [];
    for (const r of rows) { const k = String(r.payload?.explain || 'm' + r.id); if (!got.has(k)) { got.add(k); fresh.push(k); } }
    if (!fresh.length) return;
    setLeague((L) => { L.credited = [...(L.credited || []), ...fresh].slice(-300); L.pts = (L.pts || 0) + fresh.length * LEAGUE.helpGiver; });
    toast(tf('ex.credited', { n: fresh.length * LEAGUE.helpGiver }));
  } catch { /* нет сети или таблиц */ }
}

/* ─── Туториал ────────────────────────────────────────────────────────── */

let FT = 0;
const SLIDES = 4;

function tourArt(i) {
  if (i === 0) return `<div class="ft-art ft-a0"><span class="ft-code">A7K2QX</span><span class="ft-arrow">${icon('arrowRight', 20)}</span>${ava('x1', 'Айгерим', 52)}</div>`;
  if (i === 1) return `<div class="ft-art ft-a1">${[['Айгерим', 184, 'gold'], [t('lb.you'), 171, 'silver'], ['Данияр', 120, 'bronze']].map(([n, p, m], k) => `<div class="ft-lrow ${k === 1 ? 'me' : ''}"><span class="lg-rank ${m}">${k + 1}</span>${ava('y' + k, n, 30)}<b>${n}</b><em>${p}</em></div>`).join('')}</div>`;
  if (i === 2) return `<div class="ft-art ft-a2"><div class="ft-bub">${t('ft.s3demo')}</div><div class="ft-plus"><b>+${LEAGUE.helpGiver}</b><small>${t('ft.you')}</small></div><div class="ft-plus b"><b>+${LEAGUE.helpLearner}</b><small>${t('ft.friend')}</small></div></div>`;
  return `<div class="ft-art ft-a3">${ava('z1', t('lb.you'), 48)}<span class="ft-fire">${icon('flame', 34)}<b>12</b></span>${ava('z2', 'Айгерим', 48)}<div class="ft-dots"><i class="on"></i><i class="on"></i><i class="on"></i></div></div>`;
}

function tourHtml() {
  const i = FT;
  const n = i + 1;
  const ICONS = ['users', 'trophy', 'hint', 'flame'];
  return `<div class="ft">
    <button type="button" class="ft-x" data-act="ft-done" aria-label="${esc(t('common.close'))}">${icon('close', 18)}</button>
    ${tourArt(i)}
    <p class="ft-step"><span class="ft-step-ic">${icon(ICONS[i], 13)}</span>${tf('ft.step', { i: n, n: SLIDES })}</p>
    <h2>${t('ft.t' + n)}</h2>
    <p class="ft-b">${tf('ft.b' + n, { a: LEAGUE.rewards[0], b: LEAGUE.rewards[1], c: LEAGUE.rewards[2], p: fmt(LEAGUE.globalPrize), g: LEAGUE.helpGiver, l: LEAGUE.helpLearner })}</p>
    <div class="ft-dots2">${Array.from({ length: SLIDES }, (_, k) => `<button type="button" class="${k === i ? 'on' : ''}" data-act="ft-go" data-id="${k}" aria-label="${k + 1}"></button>`).join('')}</div>
    <div class="q-actions ft-btns">
      ${i ? `<button class="btn btn-soft" data-act="ft-prev">${icon('arrowLeft', 16)} ${t('ft.prev')}</button>` : `<button class="btn btn-soft" data-act="ft-done">${t('ft.skip')}</button>`}
      ${i < SLIDES - 1 ? `<button class="btn" data-act="ft-next">${t('ft.next')} ${icon('arrowRight', 16)}</button>`
        : `<button class="btn" data-act="ft-done" data-id="end">${t(isLoggedIn() || !authAvailable() ? 'ft.start' : 'ft.startGuest')}</button>`}
    </div></div>`;
}
const ftPaint = () => { const sh = document.querySelector('#modalRoot .sheet'); if (sh) sh.innerHTML = tourHtml(); };

export function openFriendsTour(step = 0) {
  FT = step;
  openModal(tourHtml(), { onClose: () => markTour() });
  document.querySelector('#modalRoot .sheet')?.classList.add('ft-sheet');
}
const markTour = () => { if (!getProfile().frTourDone) update((s) => { s.profile.frTourDone = true; }); };

/** Первый заход на «Друзья» — показываем туториал один раз. */
let tourQueued = false;
export function maybeFriendsTour() {
  if (tourQueued || getProfile().frTourDone) return;
  tourQueued = true;
  setTimeout(() => {
    tourQueued = false;
    if (!location.hash.startsWith('#/friends') || getProfile().frTourDone) return;
    if (document.querySelector('#modalRoot .sheet')) return; // уже открыто другое окно
    openFriendsTour(0);
  }, 450);
}

/* ─── Действия ────────────────────────────────────────────────────────── */

export function registerLeagueActions(rerender) {
  rerenderRef = rerender;

  action('fr-tour', ({ id }) => openFriendsTour(Number(id) || 0));
  action('ft-next', () => { FT = Math.min(SLIDES - 1, FT + 1); ftPaint(); });
  action('ft-prev', () => { FT = Math.max(0, FT - 1); ftPaint(); });
  action('ft-go', ({ id }) => { FT = Math.max(0, Math.min(SLIDES - 1, Number(id) || 0)); ftPaint(); });
  // Стрелки на клавиатуре листают туториал
  document.addEventListener('keydown', (e) => {
    if (!document.querySelector('#modalRoot .ft')) return;
    if (e.key === 'ArrowRight') { FT = Math.min(SLIDES - 1, FT + 1); ftPaint(); }
    if (e.key === 'ArrowLeft') { FT = Math.max(0, FT - 1); ftPaint(); }
  });
  action('ft-done', ({ id }) => {
    markTour();
    closeModal();
    if (id === 'end' && authAvailable() && !isLoggedIn()) document.querySelector('[data-act="auth-open"]')?.click();
  });

  action('ps-nudge', async ({ id }) => {
    try { await sendMessage(id, t('ps.nudgeMsg')); markNudged(id); toast(t('ps.nudgeSent')); rerender(); }
    catch (e) { toast(t(socialErrorKey(e))); }
  });

  action('ex-open', ({ id, item }) => openExplain(id, item));
  action('ex-send', async ({ id, item }, form) => {
    const body = String(new FormData(form).get('body') || '').trim();
    const err = form.querySelector('.ex-err');
    const it = ITEM_BY_ID[item];
    const bare = body.replace(/[\s.,!?«»"']/g, '').toLowerCase();
    const answerOnly = it && (bare.length <= 2 || bare === String(loc(it.options[it.answer])).replace(/[\s.,!?«»"']/g, '').toLowerCase());
    if (body.length < 20 || answerOnly) { err.hidden = false; err.textContent = t('ex.tooShort'); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await sendMessage(id, body, 'explain', { item });
      setLeague((L) => { L.explained = [...(L.explained || []), id + ':' + item].slice(-200); });
      closeModal();
      toast(tf('ex.sent', { n: LEAGUE.helpGiver }));
      window.dispatchEvent(new CustomEvent('nas:chat-sent', { detail: id }));
    } catch (e) { btn.disabled = false; err.hidden = false; err.textContent = t(socialErrorKey(e)); }
  });

  action('ex-try', ({ id, from, item }) => {
    EX = { msgId: Number(id), from, orig: item, item: similarItem(item), sel: null, revealed: false, t0: Date.now(), seen: [] };
    openModal(exQuizHtml());
  });
  action('ex-pick', ({ i }) => { if (!EX || EX.revealed) return; EX.sel = Number(i); exPaint(); });
  action('ex-another', () => { if (!EX) return; EX.seen.push(EX.item.id); EX.item = similarItem(EX.orig, EX.seen); EX.sel = null; EX.revealed = false; EX.t0 = Date.now(); exPaint(); });
  action('ex-check', async () => {
    if (!EX || EX.sel === null || EX.revealed) return;
    const it = EX.item;
    const correct = EX.sel === it.answer;
    recordAttempt({ item: it, subject: TOPIC_BY_ID[it.topic].subject, correct, hints: 0, ms: Date.now() - EX.t0 });
    EX.revealed = true;
    exPaint();
    if (!correct) return;
    const { msgId, from, orig } = EX;
    addLeaguePoints(LEAGUE.helpLearner);
    setLeague((L) => { L.tried = [...(L.tried || []), msgId].slice(-200); });
    try { await sendMessage(from, t('ex.thxBody'), 'thanks', { explain: msgId, item: orig }); } catch { /* очки ученику уже начислены */ }
    window.dispatchEvent(new CustomEvent('nas:chat-sent', { detail: from }));
  });
}
