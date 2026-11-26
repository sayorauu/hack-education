/**
 * Рейтинг. Пока у сайта нет общего сервера с аккаунтами, настоящих
 * одноклассников взять неоткуда — поэтому страница честно показывает
 * личные рекорды ученика, без выдуманных людей.
 */

import { icon } from './icons.js';
import { t, tf, loc } from '../i18n.js';
import { getProfile, masteryOf } from '../state.js';
import { TOPICS, SUBJECTS } from '../data/curriculum.js';
import { header, esc, fmt } from './kit.js';
import { glyphTile } from './topics.js';
import { renderLeague, renderGlobal } from './league.js';
import { authAvailable } from '../cloud/auth.js';

export function renderLeaderboard() {
  const p = getProfile();
  const acc = p.attempts ? Math.round((100 * p.correct) / p.attempts) : 0;
  const bestPisa = p.pisa.reduce((m, r) => Math.max(m, r.total), 0);
  const stat = (tint, ic, val, label) => `<div class="rec t-${tint}"><span class="rec-ic">${icon(ic, 20)}</span><b>${val}</b><small>${label}</small></div>`;

  const best = TOPICS.filter((tp) => p.mastery[tp.id]).map((tp) => ({ tp, m: masteryOf(tp.id) })).sort((a, b) => b.m - a.m).slice(0, 5);
  const bySubj = SUBJECTS.map((s) => {
    const h = p.history.filter((x) => x.subject === s.id);
    return { s, n: h.length, ok: h.filter((x) => x.correct).length };
  });

  return `
    ${header(t('lb.title'), authAvailable() ? t('lb.subLeague') : t('lb.subMine'))}
    ${authAvailable() ? renderLeague() + renderGlobal() : `<div class="lb-note page-enter">${icon('users', 20)}<span>${t('lb.alone')}</span></div>`}
    ${authAvailable() ? `<div class="sec-head lb-mine-h"><h2>${t('lb.mineT')}</h2></div>` : ''}
    <div class="rec-row">
      ${stat('lilac', 'check', fmt(p.attempts), t('lb.rSolved'))}
      ${stat('mint', 'target', `${acc}%`, t('lb.rAcc'))}
      ${stat('cream', 'flame', fmt(p.bestStreak || p.streakDays || 0), t('lb.rStreak'))}
      ${stat('sky', 'trophy', bestPisa || '—', t('lb.rPisa'))}
    </div>
    <div class="two" style="margin-top:30px">
      <section>
        <div class="sec-head"><h2>${t('lb.bestTopics')}</h2><span class="count">${best.length}</span></div>
        <div class="panel">
          ${best.length ? best.map(({ tp, m }, i) => `<a class="lb-topic" href="#/topic/${tp.id}">
              <span class="rank">${i + 1}</span>${glyphTile(tp)}
              <span><b>${esc(loc(tp))}</b><span class="bar"><i style="width:${Math.max(3, Math.round(m * 100))}%"></i></span></span>
              <b>${Math.round(m * 100)}%</b></a>`).join('')
            : `<div class="empty-act">${icon('sparkles', 26)}<b>${t('dash.noActivity')}</b><small>${t('dash.noActivitySub')}</small></div>`}
        </div>
      </section>
      <section>
        <div class="sec-head"><h2>${t('lb.bySubject')}</h2></div>
        <div class="panel" style="display:grid;gap:14px">
          ${bySubj.map(({ s, n, ok }) => `<div class="lb-subj">
            <span class="sf-ic t-${s.tint}">${icon(s.icon, 18)}</span>
            <span><b>${esc(loc(s))}</b><small>${tf('lb.subjLine', { n, c: ok })}</small></span>
            <b>${n ? Math.round((100 * ok) / n) : 0}%</b></div>`).join('')}
        </div>
      </section>
    </div>`;
}

export function registerLeaderboardActions() { /* действий на странице нет */ }
