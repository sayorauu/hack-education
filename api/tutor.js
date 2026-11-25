/**
 * POST /api/tutor — облачный режим AI-репетитора.
 *
 * ВОССТАНОВЛЕНО ЗАНОВО: исходник серверной функции был утерян, а на
 * опубликованном сайте его не видно (серверный код не отдаётся браузеру).
 * Контракт взят из клиента — src/engine/tutor.js → answerWithServer():
 *
 *   запрос:  { message, lang, history[], profile{theta,grade,goal,attempts},
 *              topics[{id,title,mastery}], currentItem }
 *   ответ:   { text, intent, actions[{type,label,topicId?}] }
 *
 * Если что-то идёт не так, отвечаем ошибкой — клиент молча посчитает ответ
 * офлайн-движком, урок не прервётся.
 *
 * Переменные окружения (Vercel → Settings → Environment Variables):
 *   GEMINI_API_KEY  — ключ Google AI Studio (обязательно)
 *   GEMINI_MODEL    — модель, по умолчанию gemini-3.5-flash-lite (сильнее: gemini-3.8-flash)
 */

const SERVER_TIMEOUT_MS = 13_000; // клиент ждёт 15 с — сервер должен успеть раньше

const LANG_NAME = { ru: 'русском', kk: 'казахском', en: 'английском' };

function systemPrompt(lang) {
  return `Ты — Капи, добрая капибара-репетитор платформы NASstudy для школьников Казахстана 7–9 классов. Ты сократовский репетитор по двум предметам:
1) математика 7–9 классов (алгебра и геометрия, программа РК обновлённого содержания);
2) казахский язык — читательская грамотность (оқу сауаттылығы): основная мысль, типы текста и стили, факт и мнение, чтение таблиц, выводы, формат PISA.

ГЛАВНОЕ ПРАВИЛО: ты не выдаёшь готовых ответов, решений и формул сразу.
- Сначала выясни, что ученик уже знает: задай ОДИН короткий наводящий вопрос.
- Объясняй маленькими шагами; после каждого шага — вопрос ученику.
- Если ученик просит «просто скажи ответ» на задание — вежливо откажи (intent = "refuse_answer") и дай подсказку.
- Готовое определение или формулу можно дать, только если в истории диалога видно, что ученик уже пытался и застрял.
- Опирайся на темы из контекста и проценты освоения: слабые темы (низкий mastery) — вероятная причина трудностей.
- Если вопрос вне школьной программы — честно скажи об этом (intent = "off_topic").
- Если ученик расстроен или хочет бросить — поддержи коротко и по-человечески (intent = "motivate").

ПРОФИЛЬ УЧЕНИКА (ниже, в каждом сообщении) — настоящие данные: имя, класс, точность, освоение предметов и тем, последние ошибки, текущее задание, PISA.
- Иногда обращайся к ученику по имени; объясняй на уровне его класса.
- Учитывай слабые темы и последние ошибки: если вопрос связан с ними — опирайся на эту ошибку.
- На вопросы «кто я?», «как мои успехи?», «что повторить?» отвечай по профилю, конкретными цифрами.
- Никогда не придумывай данные, которых нет в профиле.

Стиль: дружелюбно, чуть-чуть по-мультяшному (можно иногда одно эмодзи ✨), коротко (2–5 предложений), без markdown-заголовков. Формулы пиши обычным текстом (x², √25, a·b), без LaTeX. Отвечай на ${LANG_NAME[lang] || 'казахском'} языке. Если ученик пишет по-казахски — отвечай на грамотном литературном казахском.

actions — 0–3 кнопки следующего шага:
- "learn" — открыть тему (topicId ТОЛЬКО из списка тем в контексте);
- "hint" — подсказка; "easier" — задание полегче.
label — до 40 символов, на языке ответа.`;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING' },
    intent: { type: 'STRING', enum: ['guide', 'refuse_answer', 'explain', 'motivate', 'off_topic'] },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['learn', 'hint', 'easier'] },
          label: { type: 'STRING' },
          topicId: { type: 'STRING' },
        },
        required: ['type', 'label'],
      },
    },
  },
  required: ['text', 'intent', 'actions'],
};

const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '');
const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

/** Профиль ученика → текст для модели. Всё обрезается: в запросе чужие данные. */
function studentBlock(st) {
  if (!st || typeof st !== 'object') return '';
  const arr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
  const lines = [
    'ПРОФИЛЬ УЧЕНИКА:',
    `- Имя: ${clip(st.name, 40) || 'не указано'}; класс: ${num(st.grade) || 'не указан'}; язык: ${st.lang === 'ru' ? 'русский' : 'казахский'}.`,
    `- Решено заданий: ${num(st.attempts)}, верно: ${num(st.correct)} (${num(st.accuracy)}%); серия: ${num(st.streakDays)} дн. (лучшая ${num(st.bestStreak)}); монет: ${num(st.coins)}.`,
    `- Освоение по предметам: ${arr(st.subjects, 5).map((s) => `${clip(s.name, 40)} ${num(s.mastery)}%`).join(', ') || 'нет данных'}.`,
  ];
  const studied = arr(st.studied, 20);
  lines.push(studied.length
    ? `- Изученные темы (id — тема — класс — освоение — верно/попыток): ${studied.map((t) => `${clip(t.id, 30)} — ${clip(t.title, 80)} — ${num(t.grade)} кл. — ${num(t.mastery)}% — ${num(t.correct)}/${num(t.attempts)}`).join('; ')}.`
    : '- Ещё не решал ни одного задания (новый ученик).');
  if (arr(st.weakest, 4).length) lines.push(`- Слабые темы его класса: ${arr(st.weakest, 4).map((x) => clip(x, 80)).join(', ')}.`);
  for (const m of arr(st.mistakes, 3)) lines.push(`- Недавняя ошибка: «${clip(m.topic, 80)}»: ${clip(m.task, 300)} (верный ответ: ${clip(m.answer, 80)}).`);
  if (st.current) lines.push(`- Только что решал: «${clip(st.current.topic, 80)}»: ${clip(st.current.task, 300)} — ${st.current.correct ? 'ответил верно' : 'ошибся'}.`);
  if (st.pisa) lines.push(`- Пробный PISA: математика ${num(st.pisa.math)} (уровень ${clip(String(st.pisa.mathLevel), 4)}), чтение ${num(st.pisa.reading)} (уровень ${clip(String(st.pisa.readingLevel), 4)}).`);
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const message = clip(body?.message, 2000).trim();
  if (!message) return res.status(400).json({ error: 'empty_message' });

  const lang = ['ru', 'kk'].includes(body.lang) ? body.lang : 'kk';
  const profile = body.profile || {};
  const topics = Array.isArray(body.topics) ? body.topics.slice(0, 10) : [];
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  const context = [
    studentBlock(body.student) || `Класс: ${profile.grade ?? 'не указан'}; решено заданий: ${profile.attempts ?? 0}.`,
    'Темы по вопросу и слабые темы (id — название — освоение):',
    ...topics.map((t) => `- ${clip(t.id, 60)} — ${clip(t.title, 120)} — ${Math.round((Number(t.mastery) || 0) * 100)}%`),
    body.currentItem ? `Текущее задание ученика: ${clip(body.currentItem, 600)}` : 'Текущего задания нет.',
  ].join('\n');

  /* Сайт помечает реплики ученика как 'me', репетитора — 'bot'. Диалог для
     Gemini обязан начинаться с реплики пользователя, поэтому приветствие
     репетитора в начале истории отбрасываем. */
  const turns = history
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role === 'me' || m.role === 'user' ? 'user' : 'model', parts: [{ text: clip(m.text, 1500) }] }));
  while (turns.length && turns[0].role !== 'user') turns.shift();

  const contents = [
    ...turns,
    { role: 'user', parts: [{ text: `${context}\n\nВопрос ученика: ${message}` }] },
  ];

  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SERVER_TIMEOUT_MS);

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt(lang) }] },
          contents,
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 700,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );
    if (!r.ok) return res.status(502).json({ error: 'upstream', status: r.status });

    const data = await r.json();
    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    let out;
    try { out = JSON.parse(raw); } catch { return res.status(502).json({ error: 'bad_json' }); }
    if (!out || typeof out.text !== 'string' || !out.text.trim()) {
      return res.status(502).json({ error: 'empty' });
    }

    return res.status(200).json({
      text: out.text.trim(),
      intent: out.intent || 'guide',
      actions: Array.isArray(out.actions) ? out.actions.slice(0, 3) : [],
    });
  } catch (e) {
    return res.status(e?.name === 'AbortError' ? 504 : 500).json({ error: 'failed' });
  } finally {
    clearTimeout(timer);
  }
}
