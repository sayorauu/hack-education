/**
 * Состояние NASstudy: профиль ученика, прогресс, монеты, настройки.
 * Всё хранится в localStorage этого браузера.
 */

import { bktUpdate, applyDecay, BKT } from './engine/mastery.js';

const KEY = 'nasstudy.v2';

/* ─── Монеты ─────────────────────────────────────────────────────────────
   Внутренняя валюта за учёбу. Курс и правила — в одном месте, чтобы их
   было легко поменять. Обмен на тенге в приложении — ДЕМО: настоящий вывод
   требует договора с платёжным сервисом и согласия родителей. */
export const COINS = {
  perCorrect: (b) => Math.max(3, Math.round(6 + b * 4)), // сложнее задание — больше монет
  firstTryBonus: 2,      // без подсказки с первой попытки
  topicDone: 20,         // закончил тему
  dailyStreak: 10,       // первый правильный ответ за день (× дни серии, до 5)
  pisaDone: 50,          // прошёл пробный PISA
  rateKzt: 0.1,          // 1 монета = 0,1 ₸ (1000 монет = 100 ₸)
  minPayout: 1000,       // минимум к выводу
};

const emptyProfile = () => ({
  name: '',
  grade: 8,
  onboarded: false,
  tourDone: false,
  createdAt: null,
  bestStreak: 0,
  xp: 0,
  attempts: 0,
  correct: 0,
  streakDays: 0,
  lastActive: null,      // строка даты toDateString()
  history: [],           // { itemId, topic, subject, correct, hints, ms, ts }
  mastery: {},           // topicId → { pL, attempts, correct, lastSeen }
  coins: 0,
  coinLog: [],           // { ts, amount, reason }
  payouts: [],           // { ts, coins, kzt, method, status }
  pisa: [],              // { ts, math, reading, total, answers }
  aiDays: [],            // даты, когда ученик говорил с Капи
  streakPaidOn: null,    // день, за который уже выдан бонус серии
});

const defaultState = () => ({
  profile: emptyProfile(),
  settings: {
    lang: 'kk',
    theme: matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    aiMode: 'auto',
    localModel: 'lite',
    role: 'student',       // 'student' | 'teacher'
  },
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.profile) {
      const d = defaultState();
      return { profile: { ...d.profile, ...raw.profile }, settings: { ...d.settings, ...raw.settings } };
    }
  } catch (e) {
    console.warn('NASstudy: состояние не прочитано, начинаем заново', e);
  }
  return defaultState();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('NASstudy: не удалось сохранить', e); }
}

export const getState = () => state;
export const getProfile = () => state.profile;
export const getSettings = () => state.settings;
export const lang = () => state.settings.lang;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => { save(); listeners.forEach((fn) => fn(state)); };

export function update(mutator) { mutator(state); emit(); }

export function setLang(l) { if (l === 'kk' || l === 'ru') update((s) => { s.settings.lang = l; }); }

export function resetAll() {
  const settings = state.settings;
  state = defaultState();
  state.settings = settings;
  emit();
}

/* ─── Освоение тем ────────────────────────────────────────────────────── */

export function masteryOf(topicId, p = state.profile) {
  const m = p.mastery[topicId];
  if (!m) return 0; // ещё не решал — честный ноль, без выдуманных процентов
  return applyDecay(m.pL, m.lastSeen);
}

export function topicStats(topicId, p = state.profile) {
  const m = p.mastery[topicId];
  return m ? { attempts: m.attempts, correct: m.correct } : { attempts: 0, correct: 0 };
}

/* ─── Монеты ──────────────────────────────────────────────────────────── */

function addCoins(p, amount, reason, meta = {}) {
  if (!amount) return;
  p.coins = Math.max(0, p.coins + amount);
  p.coinLog.unshift({ ts: Date.now(), amount, reason, ...meta });
  if (p.coinLog.length > 200) p.coinLog.length = 200;
}

export function awardCoins(amount, reason, meta) { update((s) => addCoins(s.profile, amount, reason, meta)); }

/**
 * Демо-вывод: списывает монеты и записывает «перевод». Реальных денег нет.
 * @returns {object|null} запись о выводе или null, если монет не хватает
 */
export function requestPayout(coins, method) {
  const p = state.profile;
  if (coins < COINS.minPayout || coins > p.coins) return null;
  const rec = { ts: Date.now(), coins, kzt: Math.round(coins * COINS.rateKzt), method, status: 'demo', id: 'NS-' + Date.now().toString(36).toUpperCase() };
  update((s) => {
    s.profile.payouts.unshift(rec);
    addCoins(s.profile, -coins, 'payout');
  });
  return rec;
}

/* ─── Попытка решения ─────────────────────────────────────────────────── */

/**
 * Записать ответ ученика: история, освоение (BKT), XP, серия, монеты.
 * @returns {{coins:number, pL:number, streakBonus:number}}
 */
export function recordAttempt({ item, subject, correct, hints = 0, ms = 0 }) {
  let gained = 0;
  let streakBonus = 0;
  let pLout = 0;
  update((s) => {
    const p = s.profile;
    const m = p.mastery[item.topic] || { pL: BKT.p_init, attempts: 0, correct: 0, lastSeen: Date.now() };
    m.pL = bktUpdate(applyDecay(m.pL, m.lastSeen), correct);
    m.attempts += 1;
    if (correct) m.correct += 1;
    m.lastSeen = Date.now();
    p.mastery[item.topic] = m;
    pLout = m.pL;

    // Повтор уже решённого задания приносит 1 монету — чтобы монеты нельзя было «нафармить».
    const repeat = p.history.some((h) => h.itemId === item.id && h.correct);
    p.attempts += 1;
    if (correct) p.correct += 1;
    p.xp += correct ? 10 : 2;
    p.history.push({ itemId: item.id, topic: item.topic, subject, correct, hints, ms, ts: Date.now() });
    if (p.history.length > 1000) p.history.splice(0, p.history.length - 1000);

    // Серия дней
    const today = new Date().toDateString();
    const firstToday = p.lastActive !== today;
    if (firstToday) {
      const yesterday = new Date(Date.now() - 86_400_000).toDateString();
      p.streakDays = p.lastActive === yesterday ? p.streakDays + 1 : 1;
      p.lastActive = today;
      p.bestStreak = Math.max(p.bestStreak || 0, p.streakDays);
    }

    if (correct) {
      gained = repeat ? 1 : COINS.perCorrect(item.b) + (hints === 0 ? COINS.firstTryBonus : 0);
      addCoins(p, gained, 'correct');
      // Бонус серии — за первый ВЕРНЫЙ ответ дня (не за первую попытку)
      if (p.streakPaidOn !== today) {
        p.streakPaidOn = today;
        streakBonus = COINS.dailyStreak * Math.min(5, p.streakDays);
        addCoins(p, streakBonus, 'streak');
      }
    }
  });
  return { coins: gained, streakBonus, pL: pLout };
}

export function recordPisa(result) {
  update((s) => {
    s.profile.pisa.unshift({ ts: Date.now(), ...result });
    addCoins(s.profile, COINS.pisaDone, 'pisa');
  });
}

export function markAiDay() {
  const today = new Date().toDateString();
  if (!state.profile.aiDays.includes(today)) update((s) => { s.profile.aiDays.push(today); });
}

/**
 * Админка: начислить (или списать) монеты ученику на этом устройстве.
 * Запись попадает в историю монет с пометкой «админ».
 */
export function adminAdjust(amount, note = '') {
  const n = Math.trunc(Number(amount) || 0);
  if (!n) return 0;
  let applied = 0;
  update((s) => {
    const before = s.profile.coins;
    addCoins(s.profile, n, 'admin', { note: String(note).slice(0, 60) });
    applied = s.profile.coins - before;
  });
  return applied;
}
