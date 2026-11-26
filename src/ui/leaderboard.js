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
import { glyphTile, subjIcon } from './topics.js';

// Двухцветные иконки рекордов (в том же стиле, что иконки предметов и меню)
const REC_SVG = {
  solved: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="6" opacity=".3"/><path d="m7.5 12.3 3 3 6-6.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  acc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" opacity=".25"/><circle cx="12" cy="12" r="6.3" opacity=".5"/><circle cx="12" cy="12" r="2.8"/><path d="M13.5 10.5 20 4m-3.2 0H20v3.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  streak: '<svg viewBox="0 0 24 24"><path d="M12 22c4.4 0 8-3.1 8-7.4 0-5.2-4.2-7.4-5.3-12.6-3.2 2.1-5.3 5.3-5.3 8.5 0 2.1-1.3 3.2-2.4 2.1-.8-.8-1-2.1-1-3.2C3.9 11.5 4 13.6 4 14.6 4 18.9 7.6 22 12 22z" opacity=".35"/><path d="M12 22c2.2 0 4-1.6 4-3.8 0-2.6-2-3.8-2.7-6.4-1.6 1-2.7 2.7-2.7 4.3 0 .9-.6 1.5-1.2 1-.4-.4-.5-1-.5-1.6C8 16.7 8 17.6 8 18.2 8 20.4 9.8 22 12 22z"/></svg>',
  pisa: '<svg viewBox="0 0 24 24"><path d="M7 3h10v6.5a5 5 0 0 1-10 0z"/><path d="M7 5H3.5v1.5A4 4 0 0 0 7.5 10.5M17 5h3.5v1.5a4 4 0 0 1-4 4" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".45"/><path d="M10.5 14.2h3V18h-3z" opacity=".45"/><rect x="7" y="18" width="10" height="3" rx="1.5"/></svg>',
  empty: '<svg viewBox="0 0 24 24"><path d="M10 2.5c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M18.5 13.5c.3 2.3 1.2 3.2 3.5 3.5-2.3.3-3.2 1.2-3.5 3.5-.3-2.3-1.2-3.2-3.5-3.5 2.3-.3 3.2-1.2 3.5-3.5z" opacity=".45"/></svg>',
};
const recIcon = (k) => `<span class="sicon rec-svg">${REC_SVG[k]}</span>`;
import { renderLeague, renderGlobal } from './league.js';
import { authAvailable } from '../cloud/auth.js';

export function renderLeaderboard() {
  const p = getProfile();
  const acc = p.attempts ? Math.round((100 * p.correct) / p.attempts) : 0;
  const bestPisa = p.pisa.reduce((m, r) => Math.max(m, r.total), 0);
  const stat = (tint, ic, val, label) => `<div class="rec t-${tint}"><span class="rec-ic">${recIcon(ic)}</span><b>${val}</b><small>${label}</small></div>`;

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
      ${stat('lilac', 'solved', fmt(p.attempts), t('lb.rSolved'))}
      ${stat('mint', 'acc', `${acc}%`, t('lb.rAcc'))}
      ${stat('cream', 'streak', fmt(p.bestStreak || p.streakDays || 0), t('lb.rStreak'))}
      ${stat('sky', 'pisa', bestPisa || '—', t('lb.rPisa'))}
    </div>
    <div class="two" style="margin-top:30px">
      <section>
        <div class="sec-head"><h2>${t('lb.bestTopics')}</h2><span class="count">${best.length}</span></div>
        <div class="panel">
          ${best.length ? best.map(({ tp, m }, i) => `<a class="lb-topic" href="#/topic/${tp.id}">
              <span class="rank">${i + 1}</span>${glyphTile(tp)}
              <span><b>${esc(loc(tp))}</b><span class="bar"><i style="width:${Math.max(3, Math.round(m * 100))}%"></i></span></span>
              <b>${Math.round(m * 100)}%</b></a>`).join('')
            : `<div class="empty-act"><span class="empty-ic">${recIcon('empty')}</span><b>${t('dash.noActivity')}</b><small>${t('dash.noActivitySub')}</small></div>`}
        </div>
      </section>
      <section>
        <div class="sec-head"><h2>${t('lb.bySubject')}</h2></div>
        <div class="panel" style="display:grid;gap:14px">
          ${bySubj.map(({ s, n, ok }) => `<div class="lb-subj">
            <span class="sf-ic lb-sic t-${s.tint}">${subjIcon(s.id)}</span>
            <span><b>${esc(loc(s))}</b><small>${tf('lb.subjLine', { n, c: ok })}</small></span>
            <b>${n ? Math.round((100 * ok) / n) : 0}%</b></div>`).join('')}
        </div>
      </section>
    </div>`;
}

export function registerLeaderboardActions() { /* действий на странице нет */ }
