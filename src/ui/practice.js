import { icon } from './icons.js';
import { t, tf, loc } from '../i18n.js';
import { getProfile, recordAttempt, awardCoins, COINS } from '../state.js';
import { TOPIC_BY_ID, ITEMS_BY_TOPIC, PASSAGES, TOPICS } from '../data/curriculum.js';
import { header, esc, coinBurst, subjName } from './kit.js';
import { action, toast } from './dom.js';

let S = null; // текущая сессия практики

function start(topicId) {
  const items = [...(ITEMS_BY_TOPIC[topicId] || [])].sort((a, b) => a.b - b.b);
  S = { topicId, items, idx: 0, selected: null, revealed: false, hint: false, results: [], t0: Date.now(), coins: 0, done: false };
}

export function passageHtml(key) {
  const ps = PASSAGES[key];
  if (!ps) return '';
  const body = ps.table
    ? `<table class="ptable"><thead><tr>${ps.table.head.map((h) => `<th>${esc(loc(h))}</th>`).join('')}</tr></thead>
        <tbody>${ps.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(loc(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : `<p>${esc(loc(ps.text))}</p>`;
  return `<aside class="passage"><p class="note" style="margin-bottom:6px">${t('pr.text')}</p><h3>${esc(loc(ps.title))}</h3>${body}</aside>`;
}

export function renderPractice(topicId) {
  const tp = TOPIC_BY_ID[topicId];
  if (!tp) return header('404');
  if (!S || S.topicId !== topicId) start(topicId);

  if (S.done) {
    const c = S.results.filter(Boolean).length;
    const idx = TOPICS.findIndex((x) => x.id === topicId);
    const next = TOPICS.slice(idx + 1).find((x) => x.subject === tp.subject) || TOPICS[(idx + 1) % TOPICS.length];
    return `
      <a class="back" href="#/topic/${tp.id}">${icon('arrowLeft', 16)} ${esc(loc(tp))}</a>
      ${header(t('pr.doneTitle'), esc(loc(tp)))}
      <div class="done-card page-enter">
        <div class="big">${c === S.items.length ? '🏆' : c >= S.items.length / 2 ? '🌟' : '💪'}</div>
        <h2 style="margin-top:8px">${tf('pr.doneSub', { c, n: S.items.length })}</h2>
        <p style="color:var(--dim);margin-top:6px">${tf('pr.coins', { n: S.coins })}</p>
        <div class="q-actions" style="justify-content:center">
          <button class="btn btn-soft" data-act="pr-again">${t('pr.again')}</button>
          <a class="btn" href="#/practice/${next.id}">${t('pr.nextTopic')} ${icon('arrowRight', 16)}</a>
          <a class="btn btn-soft" href="#/topics">${t('pr.toTopics')}</a>
        </div>
      </div>`;
  }

  const it = S.items[S.idx];
  const steps = S.items.map((_, i) => `<i class="${i < S.idx ? (S.results[i] ? 'ok' : 'bad') : i === S.idx ? 'now' : ''}"></i>`).join('');
  const opts = it.options.map((o, i) => {
    let cls = '';
    if (S.revealed) { if (i === it.answer) cls = 'ok'; else if (i === S.selected) cls = 'bad'; }
    else if (i === S.selected) cls = 'sel';
    return `<button class="opt ${cls}" data-act="pr-pick" data-i="${i}" ${S.revealed ? 'disabled' : ''}><span class="k">${'ABCD'[i]}</span>${esc(loc(o))}</button>`;
  }).join('');
  const ok = S.revealed && S.selected === it.answer;

  const q = `
    <section class="qcard page-enter">
      <div class="steps">${steps}</div>
      <p class="note">${tf('pr.q', { i: S.idx + 1, n: S.items.length })} · ${esc(subjName(tp.subject))}</p>
      <p class="stem">${esc(loc(it.stem))}</p>
      <div class="opts">${opts}</div>
      ${S.hint && !S.revealed ? `<div class="hintbox">💡 ${esc(loc(it.hint))}</div>` : ''}
      ${S.revealed ? `<div class="fb ${ok ? 'ok' : 'bad'}">
        <h4>${icon(ok ? 'check' : 'cross', 18)} ${t(ok ? 'pr.correct' : 'pr.wrong')}</h4>
        ${ok ? '' : `<p style="font-weight:600;margin-bottom:6px">${tf('pr.answerIs', { a: esc(loc(it.options[it.answer])) })}</p>`}
        <p>${esc(loc(it.explain))}</p></div>` : ''}
      <div class="q-actions">
        ${S.revealed
          ? `<button class="btn" data-act="pr-next">${S.idx + 1 >= S.items.length ? t('pr.finish') : t('pr.next')} ${icon('arrowRight', 16)}</button>`
          : `<button class="btn" data-act="pr-check" ${S.selected === null ? 'disabled' : ''}>${t('pr.check')}</button>
             <button class="btn btn-soft" data-act="pr-hint" ${S.hint ? 'disabled' : ''}>💡 ${t('pr.hint')}</button>`}
        <a class="btn btn-soft" href="#/tutor?q=${encodeURIComponent(loc(tp))}">${icon('chat', 16)} ${t('topic.ask')}</a>
      </div>
    </section>`;

  return `
    <a class="back" href="#/topic/${tp.id}">${icon('arrowLeft', 16)} ${esc(loc(tp))}</a>
    ${header(esc(loc(tp)), `${tf('common.grade', { n: tp.grade })} · ${esc(subjName(tp.subject))}`)}
    <div class="practice ${it.passage ? 'with-text' : ''}">${it.passage ? passageHtml(it.passage) : ''}${q}</div>`;
}

export function registerPracticeActions(rerender) {
  action('pr-pick', ({ i }) => { if (!S || S.revealed) return; S.selected = Number(i); rerender(); });
  action('pr-hint', () => { if (!S) return; S.hint = true; rerender(); });
  action('pr-check', (_d, el) => {
    if (!S || S.selected === null || S.revealed) return;
    const it = S.items[S.idx];
    const correct = S.selected === it.answer;
    const r = recordAttempt({ item: it, subject: TOPIC_BY_ID[it.topic].subject, correct, hints: S.hint ? 1 : 0, ms: Date.now() - S.t0 });
    S.results[S.idx] = correct;
    S.revealed = true;
    S.coins += r.coins + r.streakBonus;
    rerender();
    if (r.coins) coinBurst(document.querySelector('.fb') || el, r.coins);
    if (r.streakBonus) setTimeout(() => toast(tf('pr.streakBonus', { n: r.streakBonus })), 500);
  });
  action('pr-next', () => {
    if (!S) return;
    if (S.idx + 1 >= S.items.length) {
      S.done = true;
      // Бонус за тему — не чаще раза в день на одну тему
      const today = new Date().toDateString();
      const already = getProfile().coinLog.some((l) => l.reason === 'topic' && l.topic === S.topicId && new Date(l.ts).toDateString() === today);
      if (!already) { awardCoins(COINS.topicDone, 'topic', { topic: S.topicId }); S.coins += COINS.topicDone; }
    } else {
      S.idx += 1; S.selected = null; S.revealed = false; S.hint = false; S.t0 = Date.now();
    }
    rerender();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  action('pr-again', () => { if (S) start(S.topicId); rerender(); });
}
