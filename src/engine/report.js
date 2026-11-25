/**
 * Отчёт ученика для учителя — без сервера.
 *
 * Ученик упаковывает свои результаты в короткую строку и показывает её как
 * QR-код (или отправляет ссылкой). Учитель сканирует камерой телефона:
 * открывается #/teacher?r=… и ученик добавляется в список класса на
 * устройстве учителя. Интернет для этого не нужен.
 *
 * Формат v1 (поля через «|», затем base64url от UTF-8):
 *   1|id|имя|класс|решено|верно|серия|лучшая серия|PISA мат|PISA чт|время|темы
 * темы: «индекс.освоение%.попыток.верно» через «;» (индекс в TOPICS).
 */

import { TOPICS } from '../data/curriculum.js';
import { masteryOf } from '../state.js';

const toB64url = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const clean = (s) => String(s || '').replace(/[|;]/g, ' ').trim().slice(0, 40);

/** Профиль ученика → код для учителя. */
export function encodeReport(p) {
  const topics = [];
  TOPICS.forEach((t, i) => {
    const m = p.mastery[t.id];
    if (m && m.attempts) topics.push(`${i}.${Math.round(masteryOf(t.id, p) * 100)}.${m.attempts}.${m.correct}`);
  });
  const pisa = p.pisa[0];
  const fields = [
    1,
    Number(p.createdAt || 0).toString(36),
    clean(p.name),
    p.grade || '',
    p.attempts || 0,
    p.correct || 0,
    p.streakDays || 0,
    p.bestStreak || 0,
    pisa ? pisa.math.score : '',
    pisa ? pisa.reading.score : '',
    Date.now().toString(36),
    topics.join(';'),
  ];
  return toB64url(fields.join('|'));
}

/** Код → отчёт или null, если код испорчен. */
export function decodeReport(code) {
  try {
    const f = fromB64url(String(code).trim()).split('|');
    if (f[0] !== '1' || f.length < 12) return null;
    const n = (v) => (v === '' ? null : Number(v));
    const topics = {};
    if (f[11]) {
      for (const part of f[11].split(';')) {
        const [i, pct, att, cor] = part.split('.').map(Number);
        const t = TOPICS[i];
        if (t && Number.isFinite(pct)) topics[t.id] = { pct: Math.max(0, Math.min(100, pct)), attempts: att || 0, correct: cor || 0 };
      }
    }
    const name = clean(f[2]);
    if (!name) return null;
    return {
      id: f[1] || name,
      name,
      grade: n(f[3]),
      attempts: n(f[4]) || 0,
      correct: n(f[5]) || 0,
      streak: n(f[6]) || 0,
      bestStreak: n(f[7]) || 0,
      pisaMath: n(f[8]),
      pisaReading: n(f[9]),
      sentAt: parseInt(f[10], 36) || Date.now(),
      topics,
    };
  } catch {
    return null;
  }
}

/** Достаёт код из ссылки «…#/teacher?r=КОД» или из самого кода. */
export function codeFromInput(text) {
  const s = String(text || '').trim();
  const m = s.match(/[?&]r=([A-Za-z0-9_-]+)/);
  return m ? m[1] : s.replace(/\s+/g, '');
}

/* ─── Список класса на устройстве учителя ─────────────────────────────── */

const KEY = 'nasstudy.teacher';

export function getClass() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw && raw.students ? raw : { students: {} };
  } catch {
    return { students: {} };
  }
}

function saveClass(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* память переполнена */ }
}

/** Добавляет или обновляет ученика. Возвращает 'added' | 'updated' | 'old'. */
export function addReport(rep) {
  const c = getClass();
  const prev = c.students[rep.id];
  if (prev && prev.sentAt > rep.sentAt) return 'old'; // уже есть более свежий отчёт
  c.students[rep.id] = { ...rep, receivedAt: Date.now() };
  saveClass(c);
  return prev ? 'updated' : 'added';
}

export function removeStudent(id) {
  const c = getClass();
  delete c.students[id];
  saveClass(c);
}

export function clearClass() { saveClass({ students: {} }); }
