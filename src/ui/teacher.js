/**
 * Кабинет учителя — без сервера.
 *
 * Ученики присылают отчёт QR-кодом или ссылкой (см. engine/report.js).
 * Учитель видит класс: кто сколько решил, точность, PISA и слабые темы.
 * Список хранится только на устройстве учителя.
 */

import { icon } from './icons.js';
import { t, tf, loc, fmtDate } from '../i18n.js';
import { TOPIC_BY_ID } from '../data/curriculum.js';
import { decodeReport, codeFromInput, getClass, addReport, removeStudent, clearClass } from '../engine/report.js';
import { header, esc, fmt, subjName } from './kit.js';
import { action, toast } from './dom.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** Принимает код из ссылки #/teacher?r=… (учитель отсканировал QR). */
function takeIncoming(params) {
  const code = params.get('r');
  if (!code) return;
  history.replaceState(null, '', '#/teacher');
  importCode(code);
}

function importCode(code) {
  const rep = decodeReport(codeFromInput(code));
  if (!rep) { toast(t('teacher.bad')); return false; }
  const res = addReport(rep);
  toast(tf(res === 'added' ? 'teacher.added' : 'teacher.updated', { name: rep.name }));
  return true;
}

function weakTopics(list) {
  const agg = {};
  for (const s of list) {
    for (const [id, tp] of Object.entries(s.topics)) {
      if (!TOPIC_BY_ID[id]) continue;
      const a = (agg[id] ||= { id, sum: 0, n: 0, low: 0 });
      a.sum += tp.pct; a.n++; if (tp.pct < 50) a.low++;
    }
  }
  return Object.values(agg).map((a) => ({ ...a, avg: Math.round(a.sum / a.n) })).sort((x, y) => x.avg - y.avg).slice(0, 5);
}

function studentWeak(s) {
  return Object.entries(s.topics)
    .filter(([id, tp]) => TOPIC_BY_ID[id] && tp.pct < 60)
    .sort((a, b) => a[1].pct - b[1].pct)
    .slice(0, 2)
    .map(([id]) => loc(TOPIC_BY_ID[id]));
}

const addForm = () => `
  <form class="t-add" data-act="teacher-add">
    <label for="tCode">${t('teacher.pasteLabel')}</label>
    <div class="t-add-row">
      <input class="input" id="tCode" name="code" placeholder="https://…#/teacher?r=…" autocomplete="off" required>
      <button class="btn" type="submit">${icon('check', 16)} ${t('teacher.add')}</button>
    </div>
  </form>`;

export function renderTeacher(params) {
  takeIncoming(params);
  const list = Object.values(getClass().students).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const how = `
    <section class="panel t-how">
      <h2>${t('teacher.howTitle')}</h2>
      <ol class="t-steps">
        <li><span>1</span>${t('teacher.step1')}</li>
        <li><span>2</span>${t('teacher.step2')}</li>
        <li><span>3</span>${t('teacher.step3')}</li>
      </ol>
      ${addForm()}
    </section>`;

  if (!list.length) {
    return `
      ${header(t('teacher.title'), t('teacher.sub'))}
      ${how}
      <p class="note t-foot">${icon('shield', 14)} ${t('teacher.deviceNote')}</p>`;
  }

  const solved = list.reduce((a, s) => a + s.correct, 0);
  const tries = list.reduce((a, s) => a + s.attempts, 0);
  const withPisa = list.filter((s) => s.pisaMath != null);
  const avgPisa = withPisa.length ? Math.round(withPisa.reduce((a, s) => a + (s.pisaMath + s.pisaReading) / 2, 0) / withPisa.length) : null;
  const weak = weakTopics(list);

  const stat = (val, label, tint) => `<div class="t-stat t-${tint}"><b>${val}</b><span>${label}</span></div>`;

  return `
    ${header(t('teacher.title'), t('teacher.sub'))}
    <div class="t-stats">
      ${stat(list.length, t('teacher.students'), 'lilac')}
      ${stat(pct(solved, tries) + '%', t('teacher.avgAcc'), 'mint')}
      ${stat(avgPisa ?? '—', t('teacher.avgPisa'), 'sky')}
      ${stat(fmt(tries), t('teacher.solved'), 'cream')}
    </div>

    <div class="t-grid">
      <section class="panel">
        <div class="sec-head"><h2>${t('teacher.students')}</h2><span class="count">${list.length}</span><span class="spacer"></span>
          <button class="btn btn-soft btn-sm" data-act="teacher-csv">${icon('receipt', 15)} ${t('teacher.csv')}</button></div>
        <div class="t-table-wrap"><table class="t-table">
          <thead><tr><th>${t('teacher.colName')}</th><th>${t('teacher.colSolved')}</th><th>${t('teacher.colAcc')}</th><th>PISA</th><th>${t('teacher.colWeak')}</th><th></th></tr></thead>
          <tbody>${list.map((s) => {
            const acc = pct(s.correct, s.attempts);
            const w = studentWeak(s);
            return `<tr>
              <td><b>${esc(s.name)}</b><small>${s.grade ? tf('common.grade', { n: s.grade }) + ' · ' : ''}${fmtDate(s.sentAt)}</small></td>
              <td>${fmt(s.attempts)}</td>
              <td><span class="t-acc ${acc >= 70 ? 'ok' : acc >= 50 ? 'mid' : 'bad'}">${acc}%</span></td>
              <td>${s.pisaMath != null ? `${s.pisaMath} · ${s.pisaReading}` : '—'}</td>
              <td class="t-weak-cell">${w.length ? w.map((x) => `<span>${esc(x)}</span>`).join('') : `<em>${t('teacher.allGood')}</em>`}</td>
              <td><button class="t-del" data-act="teacher-del" data-id="${esc(s.id)}" data-name="${esc(s.name)}" aria-label="${esc(t('teacher.remove'))}">${icon('cross', 16)}</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
        ${addForm()}
      </section>

      <section class="panel">
        <div class="sec-head"><h2>${t('teacher.weakTitle')}</h2></div>
        ${weak.length ? weak.map((w) => {
          const tp = TOPIC_BY_ID[w.id];
          return `<a class="t-weak" href="#/topic/${tp.id}">
            <span class="t-weak-top"><b>${esc(loc(tp))}</b><i>${w.avg}%</i></span>
            <span class="t-bar"><span style="width:${Math.max(4, w.avg)}%"></span></span>
            <small>${esc(subjName(tp.subject))} · ${tf('common.grade', { n: tp.grade })} · ${tf('teacher.weakNote', { n: w.low, m: w.n })}</small>
          </a>`;
        }).join('') : `<p class="empty">${t('teacher.noWeak')}</p>`}
        <div class="t-side-actions">
          <a class="btn btn-soft" href="#/admin">${icon('coin', 16)} ${t('teacher.adminLink')}</a>
          <button class="btn btn-soft" style="color:var(--bad)" data-act="teacher-clear">${t('teacher.clear')}</button>
        </div>
      </section>
    </div>
    <details class="panel t-how-mini"><summary>${t('teacher.howTitle')}</summary>
      <ol class="t-steps"><li><span>1</span>${t('teacher.step1')}</li><li><span>2</span>${t('teacher.step2')}</li><li><span>3</span>${t('teacher.step3')}</li></ol>
    </details>
    <p class="note t-foot">${icon('shield', 14)} ${t('teacher.deviceNote')}</p>`;
}

export function registerTeacherActions(rerender) {
  action('teacher-add', (_d, form) => {
    const code = new FormData(form).get('code');
    if (importCode(code)) rerender();
  });
  action('teacher-del', ({ id, name }) => {
    if (!confirm(tf('teacher.removeConfirm', { name }))) return;
    removeStudent(id);
    rerender();
  });
  action('teacher-clear', () => {
    if (!confirm(t('teacher.clearConfirm'))) return;
    clearClass();
    rerender();
  });
  action('teacher-csv', () => {
    const list = Object.values(getClass().students);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [[t('teacher.colName'), t('profile.grade'), t('teacher.colSolved'), t('teacher.colAcc'), 'PISA math', 'PISA reading', t('teacher.colWeak'), t('teacher.colDate')]];
    list.forEach((s) => rows.push([s.name, s.grade ?? '', s.attempts, pct(s.correct, s.attempts) + '%', s.pisaMath ?? '', s.pisaReading ?? '', studentWeak(s).join('; '), fmtDate(s.sentAt)]));
    const csv = '﻿' + rows.map((r) => r.map(q).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'nasstudy-class.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
