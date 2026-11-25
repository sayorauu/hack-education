import { icon } from './icons.js';
import { t, tf, loc } from '../i18n.js';
import { masteryOf, topicStats } from '../state.js';
import { TOPICS, TOPIC_BY_ID, ITEMS_BY_TOPIC, SUBJECTS, GRADES, PASSAGES, SUBJECT_BY_ID } from '../data/curriculum.js';
import { header, thumb, esc, subjName } from './kit.js';

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

/** У каждой темы свой символ — карточки различимы с одного взгляда. */
export const GLYPH = {
  'a7.powers': 'aⁿ', 'a7.poly': '3x²', 'a7.fsu': '(a+b)²', 'a7.linear': 'ax+b', 'a7.linfunc': 'y=kx', 'a7.stats': 'x̄',
  'a8.roots': '√a', 'a8.quadratic': 'D', 'a8.quadfunc': 'x²', 'a9.ineq': 'x>a', 'a9.prog': 'aₙ', 'a9.prob': 'P',
  'g7.triangles': '△', 'g7.parallel': '∠', 'g8.pyth': 'c²', 'g8.quads': 'S', 'g8.trig': 'sin', 'g9.vectors': '→', 'g9.similar': '∼', 'g9.circle': 'π',
  'r.mainidea': 'Ой', 'r.findinfo': '?', 'r.texttypes': 'Aa', 'r.vocab': '≈', 'r.styles': 'Ст', 'r.factopinion': '!', 'r.charts': '▦', 'r.inference': '⇒',
};
/** Номер урока внутри своего класса: 01, 02… — минималистично и без формул. */
const NUM = (() => { const m = {}; const c = {}; TOPICS.forEach((tp) => { c[tp.grade] = (c[tp.grade] || 0) + 1; m[tp.id] = c[tp.grade]; }); return m; })();
export const glyphTile = (tp, cls = '') => `<span class="glyph num g-${tp.subject} ${cls}" aria-hidden="true"><b>${String(NUM[tp.id] || 0).padStart(2, '0')}</b></span>`;

/** Сплошные «живые» иконки предметов вместо стандартных контурных. */
const SUBJ_SVG = {
  all: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2.5"/><rect x="13" y="3" width="8" height="8" rx="4"/><rect x="3" y="13" width="8" height="8" rx="4"/><rect x="13" y="13" width="8" height="8" rx="2.5" opacity=".45"/></svg>',
  algebra: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2.5"/><rect x="13" y="3" width="8" height="8" rx="2.5" opacity=".45"/><rect x="3" y="13" width="8" height="8" rx="2.5" opacity=".45"/><rect x="13" y="13" width="8" height="8" rx="2.5"/><path d="M5.5 7h3M7 5.5v3M15.5 17h3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  geometry: '<svg viewBox="0 0 24 24"><path d="M12 2.5 22 20H2z"/><circle cx="17" cy="16.5" r="5" opacity=".45"/></svg>',
  reading: '<svg viewBox="0 0 24 24"><path d="M2.5 5.2C5.6 4 8.7 4.2 11.2 6v14c-2.5-1.6-5.6-1.8-8.7-.7z"/><path d="M21.5 5.2C18.4 4 15.3 4.2 12.8 6v14c2.5-1.6 5.6-1.8 8.7-.7z" opacity=".45"/></svg>',
};
export const subjIcon = (id) => `<span class="sicon">${SUBJ_SVG[id] || SUBJ_SVG.all}</span>`;

/** Поиск ищет сразу на обоих языках: можно писать «дискриминант» или «негізгі ой». */
function matches(tp, q) {
  if (!q) return true;
  const hay = norm([tp.kk, tp.ru, tp.summary.kk, tp.summary.ru, tp.theory.kk, tp.theory.ru, tp.keywords].join(' '));
  return norm(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function highlight(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const words = norm(q).split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return safe;
  return safe.replace(new RegExp(`(${words.join('|')})`, 'gi'), '<mark>$1</mark>');
}

function topicCard(tp, q) {
  const m = Math.round(masteryOf(tp.id) * 100);
  const n = (ITEMS_BY_TOPIC[tp.id] || []).length;
  return `<a class="tc" href="#/topic/${tp.id}">
    ${glyphTile(tp)}
    <span class="tc-body">
      <b>${highlight(loc(tp), q)}</b>
      <small>${highlight(loc(tp.summary), q)}</small>
      <span class="tc-meta"><span>${tf('dash.tasks', { n })}</span><i></i><span>${q ? tf('common.grade', { n: tp.grade }) : esc(subjName(tp.subject))}</span></span>
    </span>
    <span class="mring" style="--p:${Math.max(2, m)}"><span>${m}%</span></span>
  </a>`;
}

export function topicResults(q, s, g) {
  // Сначала совпадения в названии, потом в описании, потом в теории
  const rank = (tp) => {
    const nq = norm(q);
    if (!nq) return 0;
    if (norm(tp.kk + ' ' + tp.ru).includes(nq)) return 0;
    if (norm(tp.summary.kk + ' ' + tp.summary.ru + ' ' + tp.keywords).includes(nq)) return 1;
    return 2;
  };
  const list = TOPICS.filter((tp) => (!s || tp.subject === s) && (!g || tp.grade === Number(g)) && matches(tp, q))
    .sort((a, b) => rank(a) - rank(b));
  if (!list.length) return `<div class="empty-state">${icon('search', 28)}<p>${t('topics.none')}</p></div>`;
  // Без поиска — группируем по классам, с поиском — один список по релевантности
  if (q) return `<p class="note" style="margin-bottom:14px">${tf('topics.found', { n: list.length })}</p><div class="tc-grid">${list.map((tp) => topicCard(tp, q)).join('')}</div>`;
  return GRADES.map((gr) => {
    const part = list.filter((tp) => tp.grade === gr);
    if (!part.length) return '';
    return `<section class="tc-group"><div class="sec-head"><h2>${tf('common.grade', { n: gr })}</h2><span class="count">${part.length}</span></div>
      <div class="tc-grid">${part.map((tp) => topicCard(tp, q)).join('')}</div></section>`;
  }).join('');
}

export function renderTopics(params) {
  const q = params.get('q') || '';
  const s = params.get('s') || '';
  const g = params.get('g') || '';
  const link = (ns, ng) => {
    const u = new URLSearchParams();
    if (q) u.set('q', q); if (ns) u.set('s', ns); if (ng) u.set('g', ng);
    const str = u.toString();
    return '#/topics' + (str ? '?' + str : '');
  };
  const subjCard = (sb) => {
    const list = TOPICS.filter((tp) => !sb || tp.subject === sb.id);
    const m = Math.round((list.reduce((a, tp) => a + masteryOf(tp.id), 0) / list.length) * 100);
    const on = sb ? s === sb.id : !s;
    return `<a class="sf ${sb ? 't-' + sb.tint : 't-lilac'} ${on ? 'on' : ''}" href="${link(sb ? sb.id : '', g)}">
      <span class="sf-top"><span class="sf-ic">${subjIcon(sb ? sb.id : 'all')}</span><span class="sf-n">${list.length}</span></span>
      <b>${sb ? esc(loc(sb)) : t('common.all')}</b>
      <span class="sf-bar"><i style="width:${Math.max(3, m)}%"></i></span>
      <small>${m}% ${t('dash.mastery')}</small>
    </a>`;
  };
  return `
    ${header(t('topics.title'), t('topics.sub'))}
    <div class="sf-row">${subjCard(null)}${SUBJECTS.map(subjCard).join('')}</div>
    <div class="tools-row">
      <label class="search">${icon('search', 20)}<input id="topicSearch" data-live-search value="${esc(q)}" placeholder="${esc(t('topics.search'))}" aria-label="${esc(t('topics.search'))}" autocomplete="off"></label>
      <div class="seg">
        <a class="${!g ? 'on' : ''}" href="${link(s, '')}">${t('common.all')}</a>
        ${GRADES.map((gr) => `<a class="${g === String(gr) ? 'on' : ''}" href="${link(s, gr)}">${gr}</a>`).join('')}
      </div>
    </div>
    <div id="topicResults" data-s="${esc(s)}" data-g="${esc(g)}">${topicResults(q, s, g)}</div>
    <p class="note" style="margin-top:26px">${t('topics.note')}</p>`;
}

export function renderTopic(id) {
  const tp = TOPIC_BY_ID[id];
  if (!tp) return `${header('404')}<a class="back" href="#/topics">${icon('arrowLeft', 16)} ${t('common.back')}</a>`;
  const items = ITEMS_BY_TOPIC[tp.id] || [];
  const ex = items[0];
  const m = Math.round(masteryOf(tp.id) * 100);
  const st = topicStats(tp.id);
  const sb = SUBJECT_BY_ID[tp.subject];
  const passages = [...new Set(items.map((i) => i.passage).filter(Boolean))].map((k) => PASSAGES[k]);
  return `
    <a class="back" href="#/topics">${icon('arrowLeft', 16)} ${t('nav.topics')}</a>
    ${header(esc(loc(tp)), `${tf('common.grade', { n: tp.grade })} · ${esc(loc(sb))}`)}
    <div class="topic-page">
      <div style="display:grid;gap:22px">
        <section class="panel">
          <div class="sec-head"><h2>${t('topic.theory')}</h2></div>
          <p class="theory">${esc(loc(tp.theory))}</p>
        </section>
        ${ex ? `<section class="panel">
          <div class="sec-head"><h2>${t('topic.example')}</h2></div>
          ${ex.passage && PASSAGES[ex.passage]?.text ? `<p class="note" style="margin-bottom:8px">${esc(PASSAGES[ex.passage].title)}</p>` : ''}
          <p style="font-weight:600;font-size:17px">${esc(loc(ex.stem))}</p>
          <p style="margin-top:10px;color:var(--dim)">${esc(loc(ex.explain))}</p>
        </section>` : ''}
      </div>
      <aside style="display:grid;gap:22px">
        <section class="pc pc-subj t-${sb.tint}" style="width:auto;height:auto;gap:8px">
          <div class="top-row"><span class="sic">${icon(sb.icon, 22)}</span><span class="num">${tf('dash.tasks', { n: items.length })}</span></div>
          <h3>${t('topic.mastery')}: ${m}%</h3>
          <div class="pct">${tf('topic.done', { c: st.correct, n: st.attempts })}</div>
          <div class="pie" style="--p:${Math.max(4, m)};margin-top:14px"></div>
        </section>
        <a class="btn" href="#/practice/${tp.id}">${icon('play', 16)} ${t('topic.start')}</a>
        <a class="btn btn-soft" href="#/tutor?q=${encodeURIComponent(loc(tp))}">${icon('chat', 16)} ${t('topic.ask')}</a>
        ${passages.length ? `<section class="panel"><div class="sec-head"><h2 style="font-size:17px">${t('topic.passages')}</h2></div>
          ${passages.map((ps) => `<p style="font-weight:600">• ${esc(ps.title)}</p>`).join('')}</section>` : ''}
      </aside>
    </div>`;
}

/** Живой поиск: обновляем только список, чтобы поле ввода не теряло фокус. */
export function bindTopicSearch(root) {
  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-live-search]');
    if (!el) return;
    const box = document.getElementById('topicResults');
    if (!box) return;
    box.innerHTML = topicResults(el.value.trim(), box.dataset.s, box.dataset.g);
    const u = new URLSearchParams(location.hash.split('?')[1] || '');
    if (el.value.trim()) u.set('q', el.value.trim()); else u.delete('q');
    const str = u.toString();
    history.replaceState(null, '', '#/topics' + (str ? '?' + str : ''));
  });
}
