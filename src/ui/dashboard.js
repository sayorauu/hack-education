import { icon } from './icons.js';
import { t, tf, loc, monthYear, fmtDate, WEEKDAYS, lang } from '../i18n.js';
import { getProfile, masteryOf } from '../state.js';
import { TOPICS, TOPIC_BY_ID, ITEMS, ITEMS_BY_TOPIC, SUBJECTS } from '../data/curriculum.js';
import { header, avatar, esc, timeAgo, subjName, fmt, navIcon } from './kit.js';
import { glyphTile, subjIcon } from './topics.js';
import { action } from './dom.js';

let calOffset = 0; // смещение месяца в календаре

const DAY = 86_400_000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

/** Рекомендации: сначала темы своего класса с наименьшим освоением. */
export function recommendTopics(n = 4) {
  const p = getProfile();
  return TOPICS.map((tp) => ({ tp, pL: masteryOf(tp.id), own: tp.grade === p.grade ? 0 : Math.abs(tp.grade - p.grade) }))
    .sort((a, b) => a.own - b.own || a.pL - b.pL)
    .slice(0, n).map((x) => x.tp);
}

function subjectMastery(subject) {
  const list = TOPICS.filter((tp) => tp.subject === subject);
  return list.reduce((s, tp) => s + masteryOf(tp.id), 0) / list.length;
}

function progressCards() {
  const p = getProfile();
  const solvedIds = new Set(p.history.filter((h) => h.correct).map((h) => h.itemId));
  const acc = p.attempts ? Math.round((100 * p.correct) / p.attempts) : 0;
  const share = solvedIds.size / ITEMS.length;
  const last = p.pisa[0];
  const pisaP = last ? Math.round(((last.total - 300) / 350) * 100) : 0;
  const sharePct = Math.round(share * 100);

  // Неделя: сколько заданий решено в каждый из последних 7 дней
  const today = startOfDay(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY);
  const perDay = days.map((d) => p.history.filter((h) => startOfDay(h.ts) === d).length);
  const maxDay = Math.max(1, ...perDay);
  const weekTotal = perDay.reduce((a, b) => a + b, 0);
  const wds = WEEKDAYS[lang()];

  return `
    <div class="pcards" id="pcards">
      <article class="pc pc-hero">
        <div class="hero-top">
          <div>
            <div class="hero-lbl">${t('dash.solved')}</div>
            <div class="hero-big">${solvedIds.size}<span>/${ITEMS.length}</span></div>
          </div>
          <div class="pring pring-light" style="--p:${Math.max(2, sharePct)}"><b>${sharePct}%</b></div>
        </div>
        <div class="hero-bar"><i style="width:${Math.max(2, sharePct)}%"></i></div>
        <div class="hero-chips">
          <span class="hchip">${icon('check', 15)}<b>${acc}%</b> ${t('dash.accShort')}</span>
          <span class="hchip">${icon('flame', 15)}<b>${p.streakDays}</b> ${t('dash.daysShort')}</span>
        </div>
      </article>

      <article class="pc pc-week">
        <div class="week-head">
          <span class="sic">${icon('calendar', 20)}</span>
          <span class="num">${weekTotal}</span>
        </div>
        <h3>${t('dash.week')}</h3>
        <div class="pct">${tf('dash.weekSub', { n: weekTotal })}</div>
        <div class="week-bars">
          ${perDay.map((n, i) => {
            const wd = wds[(new Date(days[i]).getDay() + 6) % 7];
            return `<span class="wb ${i === 6 ? 'now' : ''} ${n ? '' : 'zero'}" title="${n}"><i style="height:${n ? Math.max(14, Math.round((n / maxDay) * 100)) : 6}%"></i><em>${wd}</em></span>`;
          }).join('')}
        </div>
      </article>

      ${SUBJECTS.map((s) => {
        const m = Math.round(subjectMastery(s.id) * 100);
        const list = TOPICS.filter((tp) => tp.subject === s.id);
        const started = list.filter((tp) => p.mastery[tp.id]).length;
        return `<a class="pc pc-subj t-${s.tint}" href="#/topics?s=${s.id}">
          <div class="top-row"><span class="sic">${subjIcon(s.id)}</span><span class="num">${started}/${list.length}</span></div>
          <h3>${esc(loc(s))}</h3>
          <div class="pct">${tf('dash.startedTopics', { n: started, m: list.length })}</div>
          <div class="pring" style="--p:${Math.max(2, m)}"><b>${m}%</b></div>
        </a>`;
      }).join('')}
      <a class="pc pc-subj t-lilac" href="#/pisa">
        <div class="top-row"><span class="sic">${subjIcon('pisa')}</span><span class="num">${last ? last.total : '—'}</span></div>
        <h3>PISA</h3>
        <div class="pct">${last ? `${t('dash.pisaLast')}: ${last.total}` : t('dash.pisaNone')}</div>
        <div class="pring" style="--p:${Math.max(2, pisaP)}"><b>${last ? last.total : '—'}</b></div>
      </a>
    </div>`;
}

function activity() {
  const p = getProfile();
  // Только настоящие действия ученика — без выдуманных одноклассников
  const rows = p.history.slice(-12).reverse().map((h) => ({
    topic: h.topic, ago: h.ts, correct: h.correct, text: t(h.correct ? 'feed.youCorrect' : 'feed.youWrong'),
  }));
  return `
    <section>
      <div class="sec-head"><h2>${t('dash.activity')}</h2><span class="count">${rows.length}</span><span class="spacer"></span>${icon('sliders', 20)}</div>
      <div class="panel">
        <label class="search">${icon('search', 18)}<input data-filter="#actList" placeholder="${esc(t('dash.findUpdate'))}" aria-label="${esc(t('dash.findUpdate'))}"></label>
        <div class="list" id="actList">
          ${rows.map((r) => {
            const tp = TOPIC_BY_ID[r.topic];
            return `<a class="act-row" href="#/topic/${tp.id}" data-text="${esc((loc(tp) + ' ' + r.text).toLowerCase())}">
              <span class="act-dot ${r.correct ? 'ok' : 'bad'}">${icon(r.correct ? 'check' : 'cross', 18)}</span>
              <span><b>${esc(loc(tp))}</b><small>${esc(r.text)}</small></span>
              <span><span class="when">${timeAgo(r.ago)}</span><br><small>${esc(subjName(tp.subject))}</small></span>
              <span class="go">${icon('chevR', 16)}</span>
            </a>`;
          }).join('') || `<div class="empty-act">${icon('sparkles', 26)}<b>${t('dash.noActivity')}</b><small>${t('dash.noActivitySub')}</small>
            <a class="btn btn-sm" href="#/topics?g=${p.grade}">${t('dash.startFirst')} ${icon('arrowRight', 14)}</a></div>`}
        </div>
      </div>
    </section>`;
}

function courses() {
  const recs = recommendTopics(4);
  return `
    <section>
      <div class="sec-head"><h2>${t('dash.topics')}</h2><span class="count">${recs.length}</span><span class="spacer"></span><a href="#/topics" aria-label="${esc(t('nav.topics'))}">${icon('sliders', 20)}</a></div>
      <div class="panel">
        <form class="search" data-act="dash-search">${icon('search', 18)}<input name="q" placeholder="${esc(t('dash.findTopic'))}" aria-label="${esc(t('dash.findTopic'))}"></form>
        <div class="list">
          ${recs.map((tp, i) => {
            const n = (ITEMS_BY_TOPIC[tp.id] || []).length;
            return `<a class="course" href="#/topic/${tp.id}">
              ${glyphTile(tp, 'lg')}
              <span>
                <b>${esc(loc(tp))}</b>
                <small>${tf('common.grade', { n: tp.grade })} · ${esc(subjName(tp.subject))}</small>
                <span class="meta"><small>${tf('dash.tasks', { n })}</small>
                  <span class="mini-pct">${Math.round(masteryOf(tp.id) * 100)}%</span>
                </span>
              </span>
            </a>`;
          }).join('')}
        </div>
      </div>
    </section>`;
}

function calendar() {
  const p = getProfile();
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + calOffset, 1);
  const monthName = monthYear(base);
  const wds = WEEKDAYS[lang()];
  const firstWd = (base.getDay() + 6) % 7;
  const start = new Date(base.getTime() - firstWd * DAY);
  const practiceDays = new Set(p.history.map((h) => startOfDay(h.ts)));
  const testDays = new Set(p.pisa.map((r) => startOfDay(r.ts)));
  const aiDays = new Set(p.aiDays.map((d) => startOfDay(d)));
  const today = startOfDay(now);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY);
    const k = startOfDay(d);
    const mute = d.getMonth() !== base.getMonth();
    const dots = [practiceDays.has(k) && 'dot-practice', testDays.has(k) && 'dot-test', aiDays.has(k) && 'dot-ai'].filter(Boolean);
    return `<span class="d ${mute ? 'mute' : ''} ${k === today ? 'today' : ''}">${d.getDate()}${dots.length ? `<span class="dots">${dots.map((c) => `<i class="${c}"></i>`).join('')}</span>` : ''}</span>`;
  });
  // Последняя неделя показывается, только если в ней есть дни этого месяца
  const rows = cells.length / 7;
  const visible = [];
  for (let r = 0; r < rows; r++) {
    const rowStart = new Date(start.getTime() + r * 7 * DAY);
    if (r > 3 && rowStart.getMonth() !== base.getMonth()) break;
    visible.push(...cells.slice(r * 7, r * 7 + 7));
  }
  return `
    <section>
      <div class="sec-head"><h2>${t('dash.schedule')}</h2></div>
      <div class="panel cal">
        <div class="cal-head"><b>${esc(monthName)}</b>
          <span style="display:flex;gap:6px"><button class="arrow-btn" data-act="cal" data-d="-1" aria-label="prev">${icon('chevL', 16)}</button><button class="arrow-btn" data-act="cal" data-d="1" aria-label="next">${icon('chevR', 16)}</button></span>
        </div>
        <div class="cal-grid">${wds.map((w) => `<span class="wd">${esc(w)}</span>`).join('')}${visible.join('')}</div>
        <div class="legend"><span><i class="dot-practice"></i>${t('legend.practice')}</span><span><i class="dot-test"></i>${t('legend.test')}</span><span><i class="dot-ai"></i>${t('legend.ai')}</span></div>
      </div>
    </section>`;
}

function upcoming() {
  const recs = recommendTopics(6);
  const math = recs.find((tp) => tp.subject !== 'reading') || recs[0];
  const read = recs.find((tp) => tp.subject === 'reading') || TOPICS.find((tp) => tp.subject === 'reading');
  const today = fmtDate(Date.now(), { time: false });
  const events = {
    16: { tint: 't-mint', ic: subjIcon(math.subject), title: `${t('up.practice')}: ${loc(math)}`, href: `#/practice/${math.id}`, time: '16:00–16:30' },
    17: { tint: 't-sky', ic: subjIcon('reading'), title: `${t('up.reading')}: ${loc(read)}`, href: `#/practice/${read.id}`, time: '17:00–17:30' },
    18: { tint: 't-cream', ic: navIcon('chat'), title: t('up.ai'), href: '#/tutor', time: '18:00–18:20' },
    19: { tint: 't-lilac', ic: navIcon('target'), title: t('up.pisa'), href: '#/pisa', time: '19:00–19:20' },
  };
  return `
    <section style="margin-top:34px">
      <div class="sec-head"><h2>${t('dash.upcoming')}</h2></div>
      <div class="timeline">
        ${[15, 16, 17, 18, 19, 20].map((h) => {
          const e = events[h];
          return `<div class="tl-row"><span>${h}:00</span><div>${e ? `
            <a class="ev ${e.tint}" href="${e.href}"><span class="ei">${e.ic}</span>
              <span><b>${esc(e.title)}</b><small>${esc(today)}, ${e.time}</small></span></a>` : ''}</div></div>`;
        }).join('')}
      </div>
    </section>`;
}

export function renderDashboard() {
  const p = getProfile();
  const title = p.name ? tf('dash.hi', { name: esc(p.name) }) : t('dash.hiAnon');
  return `
    ${header(title, `${t('dash.sub')} 💪`)}
    <div class="dash">
      <div>
        <div class="sec-head"><h2>${t('dash.progress')}</h2><span class="count">${fmt(p.attempts)}</span><span class="spacer"></span>
          <button class="arrow-btn" data-act="pc-scroll" data-d="-1" aria-label="prev">${icon('chevL', 16)}</button>
          <button class="arrow-btn" data-act="pc-scroll" data-d="1" aria-label="next">${icon('chevR', 16)}</button>
        </div>
        ${progressCards()}
        <div class="two">${activity()}${courses()}</div>
      </div>
      <aside class="dash-side">${calendar()}${upcoming()}</aside>
    </div>`;
}

export function registerDashboardActions(rerender) {
  action('cal', ({ d }) => { calOffset += Number(d); rerender(); });
  action('pc-scroll', ({ d }) => { document.getElementById('pcards')?.scrollBy({ left: Number(d) * 230, behavior: 'smooth' }); });
  action('dash-search', (_d, form) => {
    const q = form.querySelector('input').value.trim();
    location.hash = '/topics' + (q ? `?q=${encodeURIComponent(q)}` : '');
  });
}
