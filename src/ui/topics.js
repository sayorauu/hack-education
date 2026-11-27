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
/* Плитка темы: у алгебры — формула темы, у геометрии и чтения — свой рисунок.
   Маленький номер урока в углу. Так тему узнаёшь с первого взгляда. */
const T_FORMULA = {
  'a7.powers': 'aⁿ', 'a7.poly': 'x²+x', 'a7.fsu': '(a+b)²', 'a7.linear': 'ax=b', 'a7.linfunc': 'y=kx', 'a7.stats': 'Σ',
  'a8.roots': '√x', 'a8.quadratic': 'ax²', 'a8.quadfunc': 'y=x²', 'a9.ineq': 'x>a', 'a9.prog': 'aₙ', 'a9.prob': 'P(A)',
};
const S = (d) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;
const L = (d, w = 1.8, o = 1) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`;
const T_ART = {
  'g7.triangles': S(`<path d="M12 3.5 21 19.5H3z" opacity=".28"/>${L('M12 3.5 21 19.5H3z')}<circle cx="12" cy="3.5" r="1.7"/><circle cx="21" cy="19.5" r="1.7"/><circle cx="3" cy="19.5" r="1.7"/>`),
  'g7.parallel': S(`${L('M2.5 8h19M2.5 16h19', 2.2)}${L('M8 21.5 16 2.5', 1.6, .55)}<circle cx="13.2" cy="8" r="1.6"/><circle cx="9.8" cy="16" r="1.6"/>`),
  'g8.pyth': S(`<path d="M4 20V9l11 11z" opacity=".3"/>${L('M4 20V9l11 11H4z')}${L('M4 16.6h3.4V20', 1.4)}${L('M4 9l5.5-5.5 11 11L15 20', 1.4, .5)}`),
  'g8.quads': S(`<path d="M7.5 5H21l-4.5 14H3z" opacity=".28"/>${L('M7.5 5H21l-4.5 14H3z')}${L('M7.5 5 16.5 19', 1.3, .5)}`),
  'g8.trig': S(`${L('M3 20h18M3 20 18.5 5.5', 2)}${L('M10.5 20a7.5 7.5 0 0 0-2.1-5.2', 1.6)}${L('M18.5 5.5V20', 1.4, .5)}<rect x="15.6" y="17.1" width="2.9" height="2.9" opacity=".6"/>`),
  'g9.vectors': S(`${L('M4 19.5 18.5 5', 2.2)}${L('M11.5 5h7v7', 2.2)}${L('M4 19.5h11', 1.6, .45)}<circle cx="4" cy="19.5" r="1.8"/>`),
  'g9.similar': S(`<path d="M2 20 9 7.5 16 20z" opacity=".28"/>${L('M2 20 9 7.5 16 20z', 1.7)}<path d="M15.5 20 19 14l3.5 6z"/>`),
  'g9.circle': S(`<circle cx="12" cy="12" r="9" opacity=".22"/>${L('M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z')}${L('M12 12l6.4-6.4', 1.8)}<circle cx="12" cy="12" r="1.9"/>`),
  'r.mainidea': S(`<rect x="3" y="3.5" width="18" height="17" rx="3.5" opacity=".22"/>${L('M6.5 8h11M6.5 16.5h7.5', 1.6, .55)}<rect x="5.5" y="10.4" width="13" height="3.6" rx="1.4"/>`),
  'r.findinfo': S(`${L('M3 6h12M3 10h8M3 14h5', 1.6, .5)}<circle cx="15.5" cy="14" r="4.6" opacity=".25"/>${L('M20.1 14a4.6 4.6 0 1 1-9.2 0 4.6 4.6 0 0 1 9.2 0z', 1.8)}${L('M19 17.6l3 3', 2.4)}`),
  'r.texttypes': S(`<rect x="8.5" y="2.5" width="13" height="15" rx="2.8" opacity=".3"/><rect x="2.5" y="6.5" width="13" height="15" rx="2.8"/><path d="M5.5 11.5h7M5.5 15h4.5" stroke="var(--glyph-bg, #fff)" stroke-width="1.6" stroke-linecap="round"/>`),
  'r.vocab': S(`<path d="M4 3.5h16a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2z" opacity=".28"/><text x="12" y="13.6" text-anchor="middle" font-size="9" font-weight="800" font-family="Georgia, serif" font-style="italic">Aa</text>`),
  'r.styles': S(`<path d="M14 2.5l7.5 7.5-8.8 8.8L4.5 21.5l2.7-8.2z" opacity=".28"/>${L('M14 2.5l7.5 7.5-8.8 8.8L4.5 21.5l2.7-8.2z', 1.7)}<circle cx="12.6" cy="11.4" r="1.9"/>${L('M4.5 21.5l6.6-6.6', 1.4)}`),
  'r.factopinion': S(`<rect x="2" y="4.5" width="10" height="10" rx="3"/><path d="m4.6 9.6 1.8 1.8 3.3-3.6" fill="none" stroke="var(--glyph-bg, #fff)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 7h8v8.5h-3.5L15.5 19v-3.5H14z" opacity=".35"/>`),
  'r.charts': S(`<rect x="3" y="12" width="4.2" height="9" rx="1.3" opacity=".45"/><rect x="9.9" y="7" width="4.2" height="14" rx="1.3"/><rect x="16.8" y="3" width="4.2" height="18" rx="1.3" opacity=".7"/>`),
  'r.inference': S(`<path d="M12 2.5a6.6 6.6 0 0 0-3.9 11.9c.7.5 1.1 1.3 1.2 2.1h5.4c.1-.8.5-1.6 1.2-2.1A6.6 6.6 0 0 0 12 2.5z" opacity=".32"/>${L('M9.6 19h4.8M10.4 21.8h3.2', 1.9)}${L('M12 6.2v5.4m0 0-2.2-2.2m2.2 2.2 2.2-2.2', 1.7)}`),
};
export const glyphTile = (tp, cls = '') => {
  const n = String(NUM[tp.id] || 0).padStart(2, '0');
  const f = T_FORMULA[tp.id];
  const art = T_ART[tp.id];
  const inner = f ? `<b class="g-f ${f.length > 4 ? 'long' : ''}">${f}</b>` : art ? `<span class="g-art">${art}</span>` : `<b>${n}</b>`;
  return `<span class="glyph num g-${tp.subject} ${cls}" aria-hidden="true">${inner}<i class="g-n">${n}</i></span>`;
};

/** Сплошные «живые» иконки предметов вместо стандартных контурных. */
const SUBJ_SVG = {
  all: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2.5"/><rect x="13" y="3" width="8" height="8" rx="4"/><rect x="3" y="13" width="8" height="8" rx="4"/><rect x="13" y="13" width="8" height="8" rx="2.5" opacity=".45"/></svg>',
  algebra: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2.5"/><rect x="13" y="3" width="8" height="8" rx="2.5" opacity=".45"/><rect x="3" y="13" width="8" height="8" rx="2.5" opacity=".45"/><rect x="13" y="13" width="8" height="8" rx="2.5"/><path d="M5.5 7h3M7 5.5v3M15.5 17h3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  geometry: '<svg viewBox="0 0 24 24"><path d="M12 2.5 22 20H2z"/><circle cx="17" cy="16.5" r="5" opacity=".45"/></svg>',
  reading: '<svg viewBox="0 0 24 24"><path d="M2.5 5.2C5.6 4 8.7 4.2 11.2 6v14c-2.5-1.6-5.6-1.8-8.7-.7z"/><path d="M21.5 5.2C18.4 4 15.3 4.2 12.8 6v14c2.5-1.6 5.6-1.8 8.7-.7z" opacity=".45"/></svg>',
  pisa: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" opacity=".3"/><circle cx="12" cy="12" r="6.5" opacity=".6"/><circle cx="12" cy="12" r="3"/></svg>',
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
          <h3>${t('topic.mastery')}: <span data-count>${m}%</span></h3>
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
