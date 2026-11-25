/**
 * Нейросеть на устройстве — WebLLM.
 *
 * Небольшая языковая модель (Qwen2.5) скачивается один раз, кладётся в кэш
 * браузера и дальше работает полностью без интернета: считает видеокарта
 * ученика через WebGPU, в сеть не уходит ни вопрос, ни ответ.
 *
 * Библиотека лежит в проекте (vendor/), а не тянется с CDN, и грузится
 * лениво — только когда ученик сам выбрал этот режим. Остальным 6 МБ
 * библиотеки и сотни мегабайт модели не стоят ничего.
 *
 * Модель считает в отдельном потоке (vendor/webllm-worker.js), поэтому
 * интерфейс и анимация Капи не замирают, пока нейросеть думает.
 */

import { buildModelContext, answerLocally, studentSummary } from './tutor.js';
import { ITEMS_BY_TOPIC, PASSAGES } from '../data/curriculum.js';

const LIB_URL = new URL('../../vendor/web-llm-0.2.89.js', import.meta.url).href;
const WORKER_URL = new URL('../../vendor/webllm-worker.js', import.meta.url);

/**
 * Две модели на выбор (Qwen3.5, лицензия Apache-2.0). Модели помельче
 * (Qwen2.5-0.5B/1.5B) пробовали: по-русски они путали факты, по-казахски
 * писали бессмыслицу — для учёбы это хуже шаблонов.
 */
export const MODELS = {
  lite: { base: 'Qwen3.5-2B', downloadMb: 1100, vramMb: 2250 },
  smart: { base: 'Qwen3.5-4B', downloadMb: 2400, vramMb: 3870 },
};

/* ─── Состояние ─────────────────────────────────────────────────────────── */

let status = 'unknown';   // unknown | unsupported | idle | loading | ready | error
let progress = 0;         // 0…1
let progressText = '';
let errorText = '';
let engine = null;
let engineModelId = null;
let f16 = false;
let libPromise = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => { try { fn(getLocalStatus()); } catch { /* слушатель не должен ронять загрузку */ } });

export function onLocalStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function getLocalStatus() {
  return { status, progress, progressText, errorText, modelId: engineModelId };
}

export const localReady = () => status === 'ready' && Boolean(engine);

const lib = () => (libPromise ||= import(LIB_URL));

/** Полный id модели: f16-версия быстрее и меньше, но нужна поддержка shader-f16. */
export function modelIdFor(kind) {
  const m = MODELS[kind] || MODELS.lite;
  return `${m.base}-${f16 ? 'q4f16_1' : 'q4f32_1'}-MLC`;
}

/**
 * Проверка: есть ли WebGPU и видеокарта. Без них нейросеть в браузере
 * не запустится — тогда остаётся быстрый офлайн-режим.
 */
export async function checkSupport() {
  if (status !== 'unknown') return status !== 'unsupported';
  try {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    if (!adapter) { status = 'unsupported'; emit(); return false; }
    f16 = adapter.features?.has?.('shader-f16') || false;
    status = 'idle';
  } catch {
    status = 'unsupported';
  }
  emit();
  return status !== 'unsupported';
}

/** Скачана ли модель (лежит ли в кэше браузера). */
export async function isModelCached(kind) {
  if (!(await checkSupport())) return false;
  try {
    const { hasModelInCache } = await lib();
    return await hasModelInCache(modelIdFor(kind));
  } catch {
    return false;
  }
}

/**
 * Загрузить модель: при первом разе — скачать, потом — поднять из кэша.
 * Повторный вызов во время загрузки ничего не делает.
 */
export async function loadModel(kind) {
  if (!(await checkSupport())) return false;
  const id = modelIdFor(kind);
  if (status === 'loading') return false;
  if (status === 'ready' && engineModelId === id) return true;

  status = 'loading'; progress = 0; progressText = ''; errorText = '';
  emit();

  let lastError = null;
  try {
    const { CreateWebWorkerMLCEngine } = await lib();
    if (engine) { try { await engine.unload(); } catch { /* старая модель уже выгружена */ } }
    engine = null; engineModelId = null;

    /* Повторы. Модель качается кусками по 20–40 МБ, и на плохом интернете
       (а HuggingFace иногда и на хорошем) один кусок может оборваться.
       Скачанные куски WebLLM хранит в кэше, поэтому повтор продолжает с
       места обрыва, а не начинает заново. */
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const worker = new Worker(WORKER_URL, { type: 'module' });
      try {
        engine = await CreateWebWorkerMLCEngine(worker, id, {
          initProgressCallback: (r) => {
            progress = Math.max(progress, Number(r.progress) || 0);
            progressText = r.text || '';
            emit();
          },
        });
        engineModelId = id;
        status = 'ready'; progress = 1;
        emit();
        return true;
      } catch (e) {
        lastError = e;
        worker.terminate();
        engine = null;
        if (!isNetworkError(e) || attempt === MAX_ATTEMPTS) break;
        progressText = `Связь оборвалась, продолжаю загрузку (попытка ${attempt + 1} из ${MAX_ATTEMPTS})…`;
        emit();
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  } catch (e) {
    lastError = e;
  }
  engine = null; engineModelId = null;
  status = 'error';
  errorText = isQuotaError(lastError)
    ? 'В браузере не хватает места для модели. Освободите место или выберите «Лёгкую».'
    : String(lastError?.message || lastError).slice(0, 200);
  emit();
  return false;
}

const MAX_ATTEMPTS = 5;
/* Повторяем и сетевые обрывы, и временные сбои хранилища браузера
   («UnknownError: Unexpected internal error» при записи куска в кэш). */
const isNetworkError = (e) => /network|fetch|Failed to fetch|Cache\.add|ERR_|timed? ?out|aborted|UnknownError|internal error/i.test(String(e?.message || e))
  && !isQuotaError(e);
const isQuotaError = (e) => /quota/i.test(String(e?.name || '') + String(e?.message || e));

/** Удалить скачанную модель из браузера (освободить место). */
export async function removeModel(kind) {
  const id = modelIdFor(kind);
  try {
    if (engine && engineModelId === id) { await engine.unload(); engine = null; engineModelId = null; }
    const { deleteModelAllInfoInCache } = await lib();
    await deleteModelAllInfoInCache(id);
  } finally {
    if (status !== 'unsupported') { status = 'idle'; progress = 0; progressText = ''; }
    emit();
  }
}

/* ─── Ответ ─────────────────────────────────────────────────────────────── */

const LANG_NAME = { ru: 'русском', kk: 'казахском', en: 'английском' };

/* Промпт короче облачного: маленькой модели длинные правила только мешают.
   Суть та же — Сократ, а не решебник. */
function systemPrompt(lang) {
  return `Ты — Капи, добрая капибара-репетитор NASstudy для школьников Казахстана (математика 7–9 классов: алгебра и геометрия; казахский язык: читательская грамотность).
Правила:
1. Не давай готовый ответ или решение сразу. Сначала задай ОДИН наводящий вопрос.
2. Объясняй маленькими шагами, простыми словами.
3. Если ученик расстроен — коротко поддержи.
4. Если вопрос не про школьную программу — честно скажи об этом.
Формулы пиши обычным текстом (x², √25, a·b), без LaTeX и без знака $.
Отвечай коротко: 2–4 предложения. Отвечай только на ${LANG_NAME[lang] || 'русском'} языке.`;
}

/**
 * «Шпаргалка» из учебного графа. Маленькая модель (0.5–1.5B) сама путает
 * факты — например, принимает дискриминант за термин из статистики. Если же
 * дать ей готовое описание темы и разобранные задания из нашего учебника,
 * она пересказывает верное, а не выдумывает. Это обычный RAG, только
 * целиком на устройстве.
 */
function groundingFor(hits, lang) {
  const L = (o) => (o == null ? '' : typeof o === 'string' ? o : o[lang] ?? o.kk ?? o.ru ?? '');
  const lines = [];
  hits.slice(0, 2).forEach(({ topic }) => {
    lines.push(`Тема «${L(topic)}»: ${L(topic.theory)}`);
    (ITEMS_BY_TOPIC[topic.id] || []).slice(0, 2).forEach((it) => {
      if (it.passage && PASSAGES[it.passage]?.text) lines.push(`  Мәтін: ${PASSAGES[it.passage].text}`);
      lines.push(`  Пример: ${L(it.stem)} Решение: ${L(it.explain)}`);
    });
  });
  return lines.length
    ? 'Справка из учебника (опирайся ТОЛЬКО на неё, ничего не выдумывай):\n' + lines.join('\n')
    : '';
}

/**
 * Языки, на которых нейросеть на устройстве отвечает прилично. Qwen2.5 на
 * казахском писала бессмыслицу; Qwen3.5 (2B/4B) пишет понятно, с редкими
 * опечатками — поэтому казахский включён.
 */
export const LOCAL_LANGS = new Set(['ru', 'kk', 'en']);

/** Пустой блок размышлений <think></think> Qwen оставляет даже с выключенным «думанием». */
const cleanOut = (s) => plainMath(String(s || '')
  .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
  .replace(/^\s+/, ''));

/**
 * Модель любит писать формулы в LaTeX ($6^2$, \sqrt{100}), а чат показывает
 * обычный текст — ученик видел бы доллары и обратные слэши. Переводим самое
 * частое в обычные символы: 6², √100, a·b, a/b.
 */
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', n: 'ⁿ', '-': '⁻' };
function plainMath(s) {
  return s
    .replace(/\\\[|\\\]|\\\(|\\\)/g, '')
    .replace(/\$\$?/g, '')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/√\((\w+)\)/g, '√$1')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\^\{([0-9n-]+)\}|\^([0-9n])/g, (_, a, b) => [...(a || b)].map((c) => SUP[c] || c).join(''))
    .replace(/\\cdot|\\times/g, '·')
    .replace(/\\pm/g, '±')
    .replace(/\\le(q)?/g, '≤').replace(/\\ge(q)?/g, '≥').replace(/\\neq/g, '≠')
    .replace(/\\(text|mathrm)\{([^{}]*)\}/g, '$2')
    .replace(/\\,|\\;|\\!/g, ' ')
    .replace(/\\([a-zA-Z]+)/g, '$1');
}

/** Скорость модели (для отладки): токены в секунду на чтение и генерацию. */
export async function localStats() {
  return engine ? engine.runtimeStatsText() : 'model not loaded';
}

/**
 * Ответ нейросети на устройстве. Кнопки и ссылки на темы берём из
 * офлайн-движка: он знает учебный граф точно, а маленькая модель может
 * выдумать несуществующую тему.
 *
 * onText(partial) вызывается по мере генерации: текст появляется у ученика
 * сразу, а не после 10–20 секунд тишины.
 */
export async function answerOnDevice(text, profile, ctx, lang, history = [], onText = null) {
  if (!localReady()) throw new Error('local model not ready');

  const { hits, topics, currentItem } = buildModelContext(text, profile, ctx, lang);
  const context = [
    groundingFor(hits, lang),
    'Профиль ученика (настоящие данные, не выдумывай другие):\n' + studentSummary(lang),
    'Темы и освоение учеником:',
    ...topics.map((tp) => `- ${tp.title}: ${Math.round(tp.mastery * 100)}%`),
    currentItem ? `Задание, над которым он сейчас работает: ${currentItem}` : '',
  ].filter(Boolean).join('\n');

  const messages = [
    { role: 'system', content: systemPrompt(lang) + '\n\n' + context },
    ...history.slice(-6)
      .filter((m) => m && typeof m.text === 'string' && m.text.trim())
      .map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text.slice(0, 800) })),
    { role: 'user', content: text },
  ];

  const stream = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.3,   // маленькой модели «фантазия» вредит: держим её ближе к справке
    max_tokens: 220,    // короткий ответ: длинный у маленькой модели скатывается в повторы
    frequency_penalty: 0.6,
    // Qwen3.5 умеет «думать вслух» перед ответом — для чата с учеником это
    // лишние секунды ожидания, поэтому отключаем.
    extra_body: { enable_thinking: false },
  });
  let raw = '';
  for await (const chunk of stream) {
    raw += chunk?.choices?.[0]?.delta?.content || '';
    if (onText) { try { onText(cleanOut(raw)); } catch { /* отрисовка не должна рвать генерацию */ } }
  }
  const out = cleanOut(raw).trim();
  if (!out) throw new Error('empty local answer');

  const base = answerLocally(text, lang);
  return { ...base, text: out, socratic: true, source: 'device' };
}
