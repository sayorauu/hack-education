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
  maxBalance: 100000,    // потолок баланса: больше монет накопить нельзя
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
  frTourDone: false,     // видел туториал «Друзья»
  avatar: null,          // фото профиля: маленький JPEG (data URL), видят друзья
  lifePts: null,         // очки понимания за всё время → уровень
  levelSeen: 1,          // какой уровень уже поздравили
  maxLevelPaid: false,   // приз за 10-й уровень выдан
  newsSeen: 0,           // какую версию «Что нового» уже видел
  goalDoneOn: null,      // день, когда цель дня уже отпраздновали
  league: null,          // очки недельной лиги друзей, см. LEAGUE
});

/* ─── Лига друзей ────────────────────────────────────────────────────────
   Очки недели дают только за ВЕРНЫЕ ответы (сложнее задание — больше очков),
   за пробный PISA и за помощь другу. В понедельник счёт обнуляется, а
   итоговое место прошлой недели приносит монеты топ-3. */
export const LEAGUE = {
  perCorrect: (b, hints) => Math.max(5, Math.round(12 + b * 5)) - (hints ? 4 : 0), // ≈ 5…20
  repeat: 1,             // повтор уже решённого — почти ничего, чтобы не фармили
  pisa: (total) => Math.round(total / 10), // 30…65
  helpGiver: 30,         // друг понял твоё объяснение и решил задание
  helpLearner: 15,       // решил похожее задание после объяснения друга
  rewards: [300, 200, 100], // топ-3 недели среди друзей
  globalPrize: 1000,     // лидер ОБЩЕГО рейтинга недели (среди всех учеников)
  qualMin: 3,            // день «засчитан»: ≥3 задания…
  qualAcc: 0.6,          // …и ≥60% верно
};

/* ─── Уровни (статус ученика) ─────────────────────────────────────────────
   Уровень растёт от очков понимания за всё время (те же очки, что в лиге,
   но без недельного обнуления). Названия — в i18n: lvl.n1 … lvl.n10.
   За 10-й уровень — большой приз, один раз. */
export const LEVELS = [0, 60, 180, 400, 750, 1250, 2000, 3000, 4500, 6500];
export const LEVEL_MAX_PRIZE = 10000;

export function levelInfo(p = state.profile) {
  const pts = p.lifePts || 0;
  let lvl = 1;
  for (let i = 0; i < LEVELS.length; i++) if (pts >= LEVELS[i]) lvl = i + 1;
  const from = LEVELS[lvl - 1], to = LEVELS[lvl] ?? null;
  return { lvl, pts, from, to, need: to == null ? 0 : to - pts, pct: to == null ? 1 : (pts - from) / (to - from), max: lvl === LEVELS.length };
}

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Неделя = дата её понедельника (по местному времени). */
export function weekId(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return dayKey(m);
}
export function prevWeekId(d = new Date()) { const x = new Date(d); x.setDate(x.getDate() - 7); return weekId(x); }
/** Сколько дней до конца недели (включая сегодня). */
export const daysLeftInWeek = (d = new Date()) => 7 - ((d.getDay() + 6) % 7);

/** Очки этой и прошлой недели, без изменения профиля. */
export function leagueView(p = state.profile) {
  const L = p.league || {};
  const cur = weekId(), prev = prevWeekId();
  const pts = L.week === cur ? L.pts || 0 : 0;
  const prevPts = L.week === prev ? L.pts || 0 : L.prev?.week === prev ? L.prev.pts || 0 : 0;
  return { week: cur, pts, prevWeek: prev, prevPts, claimed: L.claimed || null };
}

function rollWeek(p) {
  const v = leagueView(p);
  const old = p.league || {};
  if (old.week !== v.week) p.league = { ...old, week: v.week, pts: 0, prev: { week: v.prevWeek, pts: v.prevPts } };
  return p.league;
}
function addLeague(p, n) {
  if (n > 0) {
    const L = rollWeek(p); L.pts = (L.pts || 0) + n;
    p.lifePts = (p.lifePts || 0) + n;
    // Достиг максимального уровня — приз один раз
    if (!p.maxLevelPaid && levelInfo(p).max) { p.maxLevelPaid = true; addCoins(p, LEVEL_MAX_PRIZE, 'maxLevel'); }
  }
  return n;
}
export function addLeaguePoints(n) { update((s) => { addLeague(s.profile, n); }); return n; }
export function setLeague(fn) { update((s) => { fn(rollWeek(s.profile)); }); }

/** Дни, когда ученик «засчитал» день: ≥3 задания и ≥60% верно (последние 30). */
export function dayStats(p = state.profile) {
  const by = {};
  for (const h of p.history) { const k = dayKey(new Date(h.ts)); (by[k] ||= { n: 0, c: 0 }); by[k].n += 1; if (h.correct) by[k].c += 1; }
  return by;
}
export const isQualified = (d) => Boolean(d && d.n >= LEAGUE.qualMin && d.c / d.n >= LEAGUE.qualAcc);
export function qualifiedDays(p = state.profile) {
  const by = dayStats(p);
  return Object.keys(by).filter((k) => isQualified(by[k])).sort().reverse().slice(0, 30);
}
/** Что осталось сделать сегодня, чтобы день засчитался. */
export function todayNeed(p = state.profile) {
  const d = dayStats(p)[dayKey()] || { n: 0, c: 0 };
  if (isQualified(d)) return { done: true, n: d.n, c: d.c, more: 0 };
  // сколько ещё верных ответов нужно (минимум до 3 заданий и до 60%)
  let more = 0, n = d.n, c = d.c;
  while (!(n >= LEAGUE.qualMin && c / n >= LEAGUE.qualAcc) && more < 50) { n += 1; c += 1; more += 1; }
  return { done: false, n: d.n, c: d.c, more };
}
/** Задания, в которых ученик недавно ошибся и пока не исправился (для «Объясни другу»). */
export function recentMisses(p = state.profile, max = 8) {
  const okIds = new Set(p.history.filter((h) => h.correct).map((h) => h.itemId));
  const out = [];
  const since = Date.now() - 21 * 86_400_000;
  for (let i = p.history.length - 1; i >= 0 && out.length < max; i--) {
    const h = p.history[i];
    if (h.ts < since) break;
    if (!h.correct && !okIds.has(h.itemId) && !out.includes(h.itemId)) out.push(h.itemId);
  }
  return out;
}

const defaultState = () => ({
  profile: emptyProfile(),
  settings: {
    lang: 'kk',
    theme: matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    aiMode: 'auto',
    localModel: 'lite',
    sound: { on: true, vol: 0.6, answers: true, progress: true, notify: true },
    fontSize: 'm',         // s | m | l | xl — размер текста
    motion: 'on',          // on | off — анимации
    dailyGoal: 5,          // верных ответов в день
    wordTap: true,         // «нажми на слово — Капи объяснит»
    pisaClock: false,      // секундомер в PISA по умолчанию
    notifyBrowser: false,  // системные уведомления о сообщениях
    hideGlobal: false,     // не показывать меня в общем рейтинге
    autoNext: false,       // после верного ответа сразу к следующему заданию
  },
});

/** Старые профили: очки за всё время оцениваем по верным ответам (без поздравлений задним числом). */
function seedLife(p) {
  if (p.lifePts == null) {
    p.lifePts = (p.correct || 0) * 12 + (p.pisa || []).length * 40;
    p.levelSeen = levelInfo(p).lvl;
    p.maxLevelPaid = p.maxLevelPaid || false;
  }
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.profile) {
      const d = defaultState();
      const profile = { ...d.profile, ...raw.profile };
      profile.coins = Math.min(COINS.maxBalance, Math.max(0, Number(profile.coins) || 0)); // старые балансы выше потолка
      seedLife(profile);
      return { profile, settings: { ...d.settings, ...raw.settings, sound: { ...d.settings.sound, ...(raw.settings?.sound || {}) } } };
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

/** Подставить профиль из облака (после входа на новом устройстве). */
export function replaceProfile(p) {
  const d = defaultState().profile;
  state.profile = { ...d, ...p };
  state.profile.coins = Math.min(COINS.maxBalance, Math.max(0, Number(state.profile.coins) || 0));
  seedLife(state.profile);
  emit();
}

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

/** Начисление или списание с учётом потолка. Возвращает, сколько реально изменилось. */
function addCoins(p, amount, reason, meta = {}) {
  if (!amount) return 0;
  const before = p.coins;
  p.coins = Math.min(COINS.maxBalance, Math.max(0, p.coins + amount));
  const applied = p.coins - before;
  if (!applied) return 0; // упёрлись в потолок или в ноль — в историю не пишем
  p.coinLog.unshift({ ts: Date.now(), amount: applied, reason, ...meta });
  if (p.coinLog.length > 200) p.coinLog.length = 200;
  return applied;
}

export function awardCoins(amount, reason, meta) { let got = 0; update((s) => { got = addCoins(s.profile, amount, reason, meta); }); return got; }

/**
 * Демо-вывод: списывает монеты и записывает «перевод». Реальных денег нет.
 * @returns {object|null} запись о выводе или null, если монет не хватает
 */
export function requestPayout(coins, method, meta = {}) {
  const p = state.profile;
  if (coins < COINS.minPayout || coins > p.coins) return null;
  // meta: { bank, to } — «to» только маска (последние цифры), полный номер не храним
  const rec = { ts: Date.now(), coins, kzt: Math.round(coins * COINS.rateKzt), method, bank: meta.bank || null, to: meta.to || null, status: 'demo', id: 'NS-' + Date.now().toString(36).toUpperCase() };
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
      gained = addCoins(p, gained, 'correct');
      addLeague(p, repeat ? LEAGUE.repeat : LEAGUE.perCorrect(item.b, hints));
      // Бонус серии — за первый ВЕРНЫЙ ответ дня (не за первую попытку)
      if (p.streakPaidOn !== today) {
        p.streakPaidOn = today;
        streakBonus = COINS.dailyStreak * Math.min(5, p.streakDays);
        streakBonus = addCoins(p, streakBonus, 'streak');
      }
    }
  });
  return { coins: gained, streakBonus, pL: pLout };
}

export function recordPisa(result) {
  update((s) => {
    const today = new Date().toDateString();
    const firstToday = !s.profile.pisa.some((r) => new Date(r.ts).toDateString() === today);
    s.profile.pisa.unshift({ ts: Date.now(), ...result });
    addCoins(s.profile, COINS.pisaDone, 'pisa');
    if (firstToday) addLeague(s.profile, LEAGUE.pisa(result.total || 0)); // очки за PISA — раз в день, чтобы не фармили
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
