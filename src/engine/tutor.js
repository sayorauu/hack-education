/**
 * Движок репетитора Капи.
 *
 *  • retrieve()      — поиск тем по вопросу (в обоих языках сразу).
 *  • answerLocally() — ответ без ИИ: разбор из учебного графа.
 *  • answerWithServer() — Gemini через наш сервер (/api/tutor); ключ
 *    хранится на сервере и в браузер не попадает.
 */

import { TOPICS, TOPIC_BY_ID, ITEMS_BY_TOPIC, ITEM_BY_ID, SUBJECTS, SUBJECT_BY_ID } from '../data/curriculum.js';
import { masteryOf, getProfile } from '../state.js';

/**
 * Всё, что Капи знает об ученике. Передаётся в Gemini, в нейросеть на
 * устройстве и используется в офлайн-ответах. Только настоящие данные:
 * то, что ученик ввёл сам, и то, что он решил.
 */
export function studentContext(lang = 'kk') {
  const p = getProfile();
  const pct = (x) => Math.round(x * 100);
  const subjects = SUBJECTS.map((s) => {
    const list = TOPICS.filter((tp) => tp.subject === s.id);
    return { name: L(s, lang), mastery: pct(list.reduce((a, tp) => a + masteryOf(tp.id), 0) / list.length) };
  });
  const studied = TOPICS.filter((tp) => p.mastery[tp.id]).map((tp) => ({
    id: tp.id, title: L(tp, lang), grade: tp.grade, mastery: pct(masteryOf(tp.id)),
    attempts: p.mastery[tp.id].attempts, correct: p.mastery[tp.id].correct,
  }));
  const weakest = TOPICS.filter((tp) => tp.grade === p.grade && p.mastery[tp.id])
    .sort((a, b) => masteryOf(a.id) - masteryOf(b.id)).slice(0, 4).map((tp) => L(tp, lang));
  const mistakes = p.history.filter((h) => !h.correct).slice(-3).reverse().map((h) => {
    const it = ITEM_BY_ID[h.itemId];
    return it ? { topic: L(TOPIC_BY_ID[h.topic], lang), task: L(it.stem, lang), answer: L(it.options[it.answer], lang) } : null;
  }).filter(Boolean);
  const last = p.history[p.history.length - 1];
  const lastItem = last && ITEM_BY_ID[last.itemId];
  const current = lastItem && Date.now() - last.ts < 30 * 60_000
    ? { topic: L(TOPIC_BY_ID[last.topic], lang), task: L(lastItem.stem, lang), correct: last.correct } : null;
  const pisa = p.pisa[0] ? {
    math: p.pisa[0].math.score, mathLevel: p.pisa[0].math.level,
    reading: p.pisa[0].reading.score, readingLevel: p.pisa[0].reading.level, total: p.pisa[0].total,
  } : null;
  return {
    name: p.name || '', grade: p.grade, lang,
    attempts: p.attempts, correct: p.correct, accuracy: p.attempts ? pct(p.correct / p.attempts) : 0,
    streakDays: p.streakDays, bestStreak: p.bestStreak || 0, coins: p.coins,
    subjects, studied, weakest, mistakes, current, pisa,
  };
}

/** Короткая сводка об ученике текстом (для нейросети на устройстве и офлайн-ответов). */
export function studentSummary(lang = 'kk') {
  const s = studentContext(lang);
  const ru = lang === 'ru';
  const lines = [
    ru ? `Ученик: ${s.name || 'без имени'}, ${s.grade} класс.` : `Оқушы: ${s.name || 'атысыз'}, ${s.grade}-сынып.`,
    ru ? `Решено ${s.attempts}, верно ${s.correct} (${s.accuracy}%), серия ${s.streakDays} дн.` : `Шешті ${s.attempts}, дұрыс ${s.correct} (${s.accuracy}%), серия ${s.streakDays} күн.`,
    (ru ? 'Освоение: ' : 'Меңгеру: ') + s.subjects.map((x) => `${x.name} ${x.mastery}%`).join(', '),
  ];
  if (s.weakest.length) lines.push((ru ? 'Слабые темы: ' : 'Әлсіз тақырыптар: ') + s.weakest.join(', '));
  if (s.mistakes.length) lines.push((ru ? 'Последняя ошибка: ' : 'Соңғы қате: ') + `${s.mistakes[0].topic} — ${s.mistakes[0].task} (${ru ? 'верно' : 'дұрысы'}: ${s.mistakes[0].answer})`);
  if (s.pisa) lines.push(`PISA: ${ru ? 'математика' : 'математика'} ${s.pisa.math}, ${ru ? 'чтение' : 'оқу'} ${s.pisa.reading}`);
  return lines.join('\n');
}

const ABOUT_ME_RE = /(кто я|обо мне|мой прогресс|мои успехи|как у меня|мен кім|мен туралы|менің прогрес|қалай оқып жүрмін)/i;

const STOP = new Set(['как', 'что', 'это', 'для', 'при', 'если', 'мне', 'меня', 'объясни', 'расскажи', 'қалай', 'деген', 'туралы', 'түсіндір', 'маған', 'және', 'бір', 'мен', 'не', 'ма', 'ме']);

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
const tokenize = (s) => norm(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const L = (o, lang) => (o == null ? '' : typeof o === 'string' ? o : o[lang] ?? o.kk ?? o.ru ?? '');

/** Текст темы для поиска — сразу на обоих языках. */
const topicDoc = (t) => [t.kk, t.ru, t.summary.kk, t.summary.ru, t.theory.kk, t.theory.ru, t.keywords,
  ...(ITEMS_BY_TOPIC[t.id] || []).map((i) => `${L(i.stem, 'kk')} ${L(i.stem, 'ru')}`)].join(' ');
const DOCS = new Map(TOPICS.map((t) => [t.id, tokenize(topicDoc(t))]));

export function retrieve(query, limit = 3) {
  const q = tokenize(query);
  if (!q.length) return [];
  const ranked = TOPICS.map((t) => {
    const doc = DOCS.get(t.id);
    let score = 0;
    q.forEach((w) => {
      const exact = doc.filter((d) => d === w).length;
      if (exact) score += 1 + Math.log(exact);
      else if (doc.some((d) => d.startsWith(w.slice(0, Math.max(4, w.length - 2))))) score += 0.6;
    });
    // Совпадение в названии темы — самый сильный сигнал
    if (q.some((w) => norm(t.kk + ' ' + t.ru).includes(w.slice(0, Math.max(4, w.length - 2))))) score += 2;
    return { topic: t, score: score / Math.sqrt(doc.length || 1) };
  }).filter((s) => s.score > 0.02).sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score || 0;
  return ranked.filter((s) => s.score >= best * 0.8).slice(0, limit);
}

/** Самые слабые темы ученика (для советов «что повторить»). */
export function weakestTopics(n = 3) {
  return TOPICS.map((t) => ({ t, pL: masteryOf(t.id) })).sort((a, b) => a.pL - b.pL).slice(0, n);
}

const WEAK_RE = /(слаб|повтор|подтян|что мне|қиын|қайтала|осал|нені)/i;

/**
 * Ответ без ИИ: тема + краткая теория + пример + наводящий вопрос.
 * @returns {{text:string, refs:string[], chips:Array, socratic:boolean}}
 */
export function answerLocally(text, lang = 'kk') {
  // «Кто я?» / «Мен кіммін?» — Капи рассказывает, что знает об ученике
  if (ABOUT_ME_RE.test(text)) {
    const s = studentContext(lang);
    const ru = lang === 'ru';
    const head = ru ? `Ты — **${s.name || 'ученик'}**, ${s.grade} класс 🐾` : `Сен — **${s.name || 'оқушы'}**, ${s.grade}-сынып оқушысысың 🐾`;
    const stats = s.attempts
      ? (ru ? `Решено заданий: ${s.attempts}, верно ${s.accuracy}%. Серия: ${s.streakDays} дн.` : `Шешкен тапсырмаң: ${s.attempts}, дұрыс — ${s.accuracy}%. Серия: ${s.streakDays} күн.`)
      : (ru ? 'Ты ещё не решал заданий — давай начнём!' : 'Әлі тапсырма шешпедің — бастайық!');
    const subj = s.subjects.map((x) => `• ${x.name}: ${x.mastery}%`).join('\n');
    return { text: [head, stats, subj].join('\n\n'), refs: [], chips: [], socratic: false };
  }
  if (WEAK_RE.test(text)) {
    const weak = weakestTopics(3);
    const lines = weak.map(({ t, pL }) => `• **${L(t, lang)}** — ${Math.round(pL * 100)}%`);
    return {
      text: (lang === 'ru' ? 'Вот темы, которые стоит повторить в первую очередь:\n' : 'Алдымен мына тақырыптарды қайталаған жөн:\n') + lines.join('\n'),
      refs: weak.map(({ t }) => t.id), chips: [], socratic: false,
    };
  }
  const hits = retrieve(text);
  const top = hits[0]?.topic;
  if (!top) {
    return {
      text: lang === 'ru'
        ? 'Я помогаю с математикой 7–9 классов (алгебра, геометрия) и читательской грамотностью. Уточни тему — например, «квадратные уравнения» или «основная мысль текста».'
        : 'Мен 7–9 сынып математикасы (алгебра, геометрия) және оқу сауаттылығы бойынша көмектесемін. Тақырыпты нақтыла — мысалы, «квадрат теңдеу» немесе «мәтіннің негізгі ойы».',
      refs: [], chips: [], socratic: false,
    };
  }
  const item = (ITEMS_BY_TOPIC[top.id] || [])[0];
  const subj = SUBJECT_BY_ID[top.subject];
  const parts = [
    `**${L(top, lang)}** · ${L(subj, lang)}, ${top.grade} ${lang === 'ru' ? 'класс' : 'сынып'}`,
    L(top.theory, lang),
  ];
  if (item) {
    parts.push((lang === 'ru' ? 'Попробуй сам: ' : 'Өзің байқап көр: ') + `_${L(item.stem, lang)}_`);
    parts.push((lang === 'ru' ? 'Подсказка: ' : 'Кеңес: ') + L(item.hint, lang));
  }
  return { text: parts.join('\n\n'), refs: [top.id], chips: [], socratic: true };
}

/** Контекст для языковой модели: найденные темы и самые слабые темы ученика. */
export function buildModelContext(text, profile, ctx, lang) {
  const hits = retrieve(text);
  const weak = weakestTopics(4).map(({ t }) => t);
  const seen = new Set();
  const topics = [...hits.map((h) => h.topic), ...weak]
    .filter((t) => !seen.has(t.id) && seen.add(t.id))
    .map((t) => ({ id: t.id, title: L(t, lang), mastery: masteryOf(t.id) }));
  return { hits, topics, currentItem: ctx?.item ? L(ctx.item.stem, lang) : null };
}

/** Gemini через сервер. Бросает исключение при любой неудаче. */
export async function answerWithServer(text, profile, ctx, lang, history = []) {
  const { hits, topics } = buildModelContext(text, profile, ctx, lang);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch('/api/tutor', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: text,
        lang,
        history: history.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        profile: { grade: profile.grade, attempts: profile.attempts },
        student: studentContext(lang), // всё, что Капи знает об ученике
        topics,
        currentItem: ctx?.item ? L(ctx.item.stem, lang) : null,
      }),
    });
    if (!res.ok) throw new Error(`tutor ${res.status}`);
    const data = await res.json();
    if (!data || typeof data.text !== 'string') throw new Error('tutor: empty');
    const chips = (data.actions || [])
      .filter((a) => a && a.type === 'learn' && TOPIC_BY_ID[a.topicId])
      .map((a) => ({ label: String(a.label || '').slice(0, 40), topic: a.topicId }));
    return { text: data.text, refs: hits.map((h) => h.topic.id), chips, socratic: data.intent !== 'explain', source: 'cloud' };
  } finally {
    clearTimeout(timer);
  }
}
