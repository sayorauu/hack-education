/**
 * Звуки NASstudy. Всё синтезируется через Web Audio — никаких файлов,
 * поэтому звуки работают и без интернета и ничего не весят.
 *
 * Категории (каждую можно выключить в Настройках):
 *  • answers  — верный / неверный ответ;
 *  • progress — урок пройден, новый уровень, достижение, цель дня;
 *  • notify   — новое сообщение от друга.
 */

import { getSettings } from './state.js';

const CAT = { correct: 'answers', wrong: 'answers', lesson: 'progress', levelUp: 'progress', achievement: 'progress', goal: 'progress', message: 'notify', tap: 'ui' };

let ctx = null;
function ac() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Одна нота с мягкой атакой и затуханием. */
function note(c, out, { f, at = 0, dur = 0.18, type = 'sine', vol = 0.5, slide = 0 }) {
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// Ноты (Гц)
const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568, A6: 1760, C7: 2093, G4: 392, C4: 261.63, E4: 329.63 };

const SOUNDS = {
  // Верно: два светлых звоночка вверх
  correct: [{ f: N.E6, dur: 0.12, type: 'triangle' }, { f: N.A6, at: 0.08, dur: 0.22, type: 'triangle' }],
  // Неверно: мягкое «у-у» вниз, без резкости
  wrong: [{ f: 330, dur: 0.16, type: 'sine', vol: 0.45, slide: -60 }, { f: 262, at: 0.12, dur: 0.24, type: 'sine', vol: 0.4, slide: -50 }],
  // Урок пройден: арпеджио вверх
  lesson: [N.C5, N.E5, N.G5, N.C6].map((f, i) => ({ f, at: i * 0.09, dur: 0.28, type: 'triangle', vol: 0.42 })),
  // Новый уровень: маленькие фанфары + аккорд
  levelUp: [
    { f: N.G4, dur: 0.14, type: 'square', vol: 0.16 }, { f: N.C5, at: 0.12, dur: 0.14, type: 'square', vol: 0.16 },
    { f: N.E5, at: 0.24, dur: 0.14, type: 'square', vol: 0.16 }, { f: N.G5, at: 0.36, dur: 0.5, type: 'triangle', vol: 0.4 },
    { f: N.C6, at: 0.36, dur: 0.55, type: 'triangle', vol: 0.3 }, { f: N.E6, at: 0.36, dur: 0.6, type: 'sine', vol: 0.22 },
  ],
  // Достижение (награда лиги, приз): искрящийся перелив
  achievement: [N.G5, N.B5, N.E6, N.G6, N.C7].map((f, i) => ({ f, at: i * 0.06, dur: 0.3, type: 'sine', vol: 0.32 })),
  // Цель дня выполнена: короткое «та-да»
  goal: [{ f: N.E5, dur: 0.12, type: 'triangle', vol: 0.4 }, { f: N.C6, at: 0.1, dur: 0.4, type: 'triangle', vol: 0.45 }],
  // Новое сообщение: два мягких «пинга»
  message: [{ f: N.A5, dur: 0.14, type: 'sine', vol: 0.4 }, { f: N.E6, at: 0.11, dur: 0.22, type: 'sine', vol: 0.35 }],
  tap: [{ f: 1200, dur: 0.04, type: 'sine', vol: 0.15 }],
};

export const SOUND_NAMES = Object.keys(SOUNDS);

/** Сыграть звук, если он включён в настройках. force — для кнопки «Прослушать». */
export function play(name, { force = false } = {}) {
  const st = getSettings().sound || {};
  if (!force) {
    if (st.on === false) return;
    if (st[CAT[name]] === false) return;
  }
  const seq = SOUNDS[name];
  const c = seq && ac();
  if (!c) return;
  const out = c.createGain();
  out.gain.value = Math.max(0, Math.min(1, st.vol ?? 0.6)) * 0.9;
  out.connect(c.destination);
  seq.forEach((n) => note(c, out, n));
}
