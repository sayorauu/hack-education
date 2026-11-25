import { icon } from './icons.js';
import { t, tf, loc, lang } from '../i18n.js';
import { getProfile, getSettings, update, markAiDay } from '../state.js';
import { answerLocally, answerWithServer } from '../engine/tutor.js';
import {
  MODELS, checkSupport, isModelCached, loadModel, removeModel,
  getLocalStatus, onLocalStatus, localReady, answerOnDevice, LOCAL_LANGS,
} from '../engine/localllm.js';
import { TOPIC_BY_ID } from '../data/curriculum.js';
import { header, esc } from './kit.js';
import { action, md, toast } from './dom.js';

/**
 * Режимы:
 *  auto    — «Умный»: Gemini (через сервер) → нейросеть на устройстве → шаблон;
 *  local   — только нейросеть на устройстве;
 *  offline — быстрые шаблоны без ИИ.
 */
export const aiMode = (s) => (['auto', 'local', 'offline'].includes(s.aiMode) ? s.aiMode : 'auto');
const MODES = [
  { id: 'auto', icon: 'sparkles', key: 'tutor.mAuto' },
  { id: 'local', icon: 'bolt', key: 'tutor.mLocal' },
  { id: 'offline', icon: 'book', key: 'tutor.mOffline' },
];
const SOURCE = { cloud: { icon: 'cloud', key: 'src.cloud' }, device: { icon: 'bolt', key: 'src.device' }, template: { icon: 'book', key: 'src.template' } };

let log = [];
let busy = false;
let pending = null;
let cloudDown = false;
const cached = { lite: null, smart: null };

export function seedTutorQuestion(q) { if (q) pending = q; }

/* ─── Панель нейросети на устройстве ──────────────────────────────────── */

function localPanelHtml() {
  const kind = getSettings().localModel || 'lite';
  const st = getLocalStatus();
  if (st.status === 'unknown') return `<p class="note">${t('local.checking')}</p>`;
  if (st.status === 'unsupported') return `<p><b>${t('local.unsupportedT')}</b> ${t('local.unsupported')}</p>`;
  if (st.status === 'loading') {
    const pct = Math.round(st.progress * 100);
    return `<div style="display:flex;justify-content:space-between;font-weight:650"><span>${t('local.loading')}</span><span>${pct}%</span></div>
      <div class="bar" style="margin:10px 0"><i style="width:${pct}%"></i></div><p class="note" style="overflow-wrap:anywhere">${esc(st.progressText)}</p>`;
  }
  if (st.status === 'ready') {
    return `<p style="font-weight:600">${icon('check', 16)} ${t('local.ready')}</p>
      <button class="btn btn-soft btn-sm" style="margin-top:12px" data-act="local-remove">${t('local.remove')}</button>`;
  }
  return `${st.status === 'error' ? `<p style="color:var(--bad);font-weight:600;margin-bottom:8px">${t('local.error')} ${esc(st.errorText)}</p>` : ''}
    <div class="chips">${Object.keys(MODELS).map((k) => `<button class="chip ${kind === k ? 'on' : ''}" data-act="local-model" data-id="${k}">${t('local.' + k)} · ${t('local.' + k + 'Sub')}</button>`).join('')}</div>
    <button class="btn btn-sm" style="margin-top:12px" data-act="local-load">${icon('bolt', 14)} ${cached[kind] ? t('local.enable') : t('local.download')}</button>
    <p class="note" style="margin-top:10px">${t('local.wifi')}</p>`;
}

function paintLocal() { const el = document.getElementById('localPanel'); if (el) el.innerHTML = localPanelHtml(); }
onLocalStatus(paintLocal);

async function syncLocal() {
  if (aiMode(getSettings()) === 'offline') return;
  if (!(await checkSupport())) return paintLocal();
  const kind = getSettings().localModel || 'lite';
  cached[kind] = await isModelCached(kind);
  paintLocal();
  if (cached[kind] && getLocalStatus().status === 'idle') loadModel(kind);
}

/* ─── Экран ───────────────────────────────────────────────────────────── */

function msgHtml(m) {
  const refs = (m.refs || []).map((id) => TOPIC_BY_ID[id]).filter(Boolean);
  const src = m.role === 'bot' && SOURCE[m.source];
  return `<div class="msg ${m.role}">${md(m.text).value}
    ${refs.length ? `<div class="refs">${refs.map((tp) => `<a class="chip" href="#/topic/${tp.id}">${esc(loc(tp))} ${icon('arrowRight', 14)}</a>`).join('')}</div>` : ''}
    ${src ? `<span class="msg-src src-${m.source}">${icon(src.icon, 12)} ${t(src.key)}</span>` : ''}</div>`;
}

export function renderTutor() {
  const mode = aiMode(getSettings());
  if (!log.length) log = [{ role: 'bot', text: t('tutor.greeting') }];
  if (mode !== 'offline') setTimeout(syncLocal, 0);
  return `
    ${header(t('tutor.title'), t('tutor.sub'))}
    <div class="tutor">
      <section class="chat">
        <div class="chat-log" id="chatLog">
          ${log.map(msgHtml).join('')}
          ${busy ? '<div class="msg bot" id="pendingMsg"><span class="typing"><i></i><i></i><i></i></span></div>' : ''}
        </div>
        <div class="chips" style="margin-top:12px">${['q1', 'q2', 'q3', 'q4'].map((k) => `<button class="chip" data-act="tutor-suggest" data-q="${esc(t('tutor.' + k))}" ${busy ? 'disabled' : ''}>${esc(t('tutor.' + k))}</button>`).join('')}</div>
        <form class="chat-form" data-act="tutor-send">
          <label class="search">${icon('chat', 18)}<input name="q" id="tutorInput" placeholder="${esc(t('tutor.placeholder'))}" autocomplete="off" ${busy ? 'disabled' : ''}></label>
          <button class="btn btn-round" type="submit" aria-label="${esc(t('tutor.send'))}" ${busy ? 'disabled' : ''}>${icon('send', 18)}</button>
        </form>
      </section>
      <aside style="display:grid;gap:18px">
        <section class="panel">
          <p class="note" style="margin-bottom:8px">${t('tutor.modeLabel')}</p>
          <div class="seg">${MODES.map((m) => `<button class="${mode === m.id ? 'on' : ''}" data-act="ai-mode" data-id="${m.id}">${icon(m.icon, 14)} ${t(m.key)}</button>`).join('')}</div>
          <p class="note" style="margin-top:12px">${t('tutor.howAuto')}</p>
        </section>
        ${mode !== 'offline' ? `<section class="panel"><h3 style="font-size:16px;margin-bottom:10px">${icon('bolt', 16)} ${t('tutor.howLocalT')}</h3>
          <p class="note" style="margin-bottom:12px">${t('tutor.howLocalB')}</p><div id="localPanel">${localPanelHtml()}</div></section>` : ''}
      </aside>
    </div>`;
}

const scrollDown = () => requestAnimationFrame(() => { const el = document.getElementById('chatLog'); if (el) el.scrollTop = el.scrollHeight; });

async function ask(text, rerender) {
  if (busy || !text.trim()) return;
  log.push({ role: 'me', text });
  busy = true;
  rerender(); scrollDown();
  markAiDay();

  const p = getProfile();
  const mode = aiMode(getSettings());
  const L = lang();
  const history = log.slice(0, -1);
  const template = (note) => {
    const r = { ...answerLocally(text, L), source: 'template' };
    if (note) r.text = t(note) + '\n\n' + r.text;
    return r;
  };

  let reply = null;
  if (mode === 'auto' && navigator.onLine && !cloudDown) {
    try { reply = await answerWithServer(text, p, {}, L, history); }
    catch (e) { if (/tutor (404|405|501|503)/.test(String(e?.message))) cloudDown = true; }
  }
  if (!reply && mode !== 'offline' && localReady() && LOCAL_LANGS.has(L)) {
    try {
      reply = await answerOnDevice(text, p, {}, L, history, (partial) => {
        const el = document.getElementById('pendingMsg');
        if (el && partial) { el.innerHTML = md(partial).value; scrollDown(); }
      });
    } catch { reply = template(mode === 'local' ? 'local.fail' : null); }
  }
  if (!reply) {
    await new Promise((r) => setTimeout(r, 300));
    reply = template(mode === 'local' ? 'local.notReady' : null);
  }
  log.push({ role: 'bot', ...reply });
  busy = false;
  rerender(); scrollDown();
  document.getElementById('tutorInput')?.focus();
}

export function flushPending(rerender) {
  if (!pending || busy) return;
  const q = pending; pending = null;
  if (location.hash.includes('?q=')) history.replaceState(null, '', '#/tutor');
  ask(tf('tutor.explainTopic', { q }), rerender);
}

export function registerTutorActions(rerender) {
  action('tutor-send', (_d, form) => {
    const input = form.querySelector('input');
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    ask(v, rerender);
  });
  action('tutor-suggest', ({ q }) => ask(q, rerender));
  action('ai-mode', ({ id }) => {
    update((s) => { s.settings.aiMode = id; });
    toast(t({ auto: 'tutor.autoOn', local: 'local.on', offline: 'tutor.offlineOn' }[id]));
    rerender();
  });
  action('local-model', ({ id }) => {
    if (!MODELS[id] || getLocalStatus().status === 'loading') return;
    update((s) => { s.settings.localModel = id; });
    syncLocal();
  });
  action('local-load', async () => {
    const kind = getSettings().localModel || 'lite';
    const ok = await loadModel(kind);
    if (ok) { cached[kind] = true; toast(t('local.ready')); }
  });
  action('local-remove', async () => {
    const kind = getSettings().localModel || 'lite';
    await removeModel(kind);
    cached[kind] = false;
    toast(t('local.removed'));
    paintLocal();
  });
}
