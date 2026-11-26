# frozen_string_literal: true
#
# NASstudy — локальный сервер для разработки и школьного компьютера.
#
#   ruby server.rb            → http://localhost:8091
#
# • Отдаёт сайт без кэширования (правки видны сразу после перезагрузки).
# • /api/tutor  — Капи через Gemini. Ключ берётся из файла .env
#                 (GEMINI_API_KEY=...) и в браузер не попадает.
# • /api/config — сообщает сайту, включён ли Gemini.
#
# На Vercel вместо этого файла работают api/tutor.js и api/config.js.
# Промпт ниже повторяет api/tutor.js — меняйте их вместе.

require 'webrick'
require 'json'
require 'net/http'
require 'uri'

ROOT = File.expand_path(__dir__)
PORT = (ENV['PORT'] || 8091).to_i

# ─── .env ────────────────────────────────────────────────────────────────
def load_env
  path = File.join(ROOT, '.env')
  return {} unless File.exist?(path)
  File.readlines(path, encoding: 'UTF-8').each_with_object({}) do |line, h|
    line = line.strip
    next if line.empty? || line.start_with?('#')
    k, v = line.split('=', 2)
    next unless k && v
    h[k.strip] = v.strip.delete_prefix('"').delete_suffix('"')
  end
end

def gemini_key
  key = ENV['GEMINI_API_KEY'] || load_env['GEMINI_API_KEY']
  key = nil if key.nil? || key.empty? || key.include?('ВСТАВЬТЕ') || key.include?('PASTE')
  key
end

def gemini_model
  ENV['GEMINI_MODEL'] || load_env['GEMINI_MODEL'] || 'gemini-3.5-flash-lite'
end

LANG_NAME = { 'ru' => 'русском', 'kk' => 'казахском' }.freeze

def system_prompt(lang)
  <<~PROMPT
    Ты — Капи, добрая капибара-репетитор платформы NASstudy для школьников Казахстана 7–9 классов. Ты сократовский репетитор по двум предметам:
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

    Стиль: дружелюбно, чуть-чуть по-мультяшному (можно иногда одно эмодзи ✨), коротко (2–5 предложений), без markdown-заголовков. Формулы пиши обычным текстом (x², √25, a·b), без LaTeX. Отвечай на #{LANG_NAME[lang] || 'казахском'} языке. Если ученик пишет по-казахски — отвечай на грамотном литературном казахском.

    actions — 0–3 кнопки следующего шага:
    - "learn" — открыть тему (topicId ТОЛЬКО из списка тем в контексте);
    - "hint" — подсказка; "easier" — задание полегче.
    label — до 40 символов, на языке ответа.
  PROMPT
end

RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING' },
    intent: { type: 'STRING', enum: %w[guide refuse_answer explain motivate off_topic] },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { type: { type: 'STRING', enum: %w[learn hint easier] }, label: { type: 'STRING' }, topicId: { type: 'STRING' } },
        required: %w[type label]
      }
    }
  },
  required: %w[text intent actions]
}.freeze

def clip(s, n)
  s.is_a?(String) ? s[0, n] : ''
end

def num(v)
  Float(v).round
rescue StandardError
  0
end

# Профиль ученика → текст для модели (повторяет studentBlock из api/tutor.js).
def student_block(st)
  return '' unless st.is_a?(Hash)
  arr = ->(a, n) { a.is_a?(Array) ? a.first(n).select { |x| x.is_a?(Hash) || x.is_a?(String) } : [] }
  lines = ['ПРОФИЛЬ УЧЕНИКА:',
           "- Имя: #{clip(st['name'], 40).empty? ? 'не указано' : clip(st['name'], 40)}; класс: #{num(st['grade'])}; язык: #{st['lang'] == 'ru' ? 'русский' : 'казахский'}.",
           "- Решено заданий: #{num(st['attempts'])}, верно: #{num(st['correct'])} (#{num(st['accuracy'])}%); серия: #{num(st['streakDays'])} дн. (лучшая #{num(st['bestStreak'])}); монет: #{num(st['coins'])}.",
           "- Освоение по предметам: #{arr.call(st['subjects'], 5).map { |s| "#{clip(s['name'], 40)} #{num(s['mastery'])}%" }.join(', ')}."]
  studied = arr.call(st['studied'], 20)
  lines << (studied.any? ? "- Изученные темы (id — тема — класс — освоение — верно/попыток): #{studied.map { |t| "#{clip(t['id'], 30)} — #{clip(t['title'], 80)} — #{num(t['grade'])} кл. — #{num(t['mastery'])}% — #{num(t['correct'])}/#{num(t['attempts'])}" }.join('; ')}." : '- Ещё не решал ни одного задания (новый ученик).')
  weak = arr.call(st['weakest'], 4).select { |x| x.is_a?(String) }
  lines << "- Слабые темы его класса: #{weak.map { |x| clip(x, 80) }.join(', ')}." if weak.any?
  arr.call(st['mistakes'], 3).each { |m| lines << "- Недавняя ошибка: «#{clip(m['topic'], 80)}»: #{clip(m['task'], 300)} (верный ответ: #{clip(m['answer'], 80)})." }
  c = st['current']
  lines << "- Только что решал: «#{clip(c['topic'], 80)}»: #{clip(c['task'], 300)} — #{c['correct'] ? 'ответил верно' : 'ошибся'}." if c.is_a?(Hash)
  pz = st['pisa']
  lines << "- Пробный PISA: математика #{num(pz['math'])} (уровень #{clip(pz['mathLevel'].to_s, 4)}), чтение #{num(pz['reading'])} (уровень #{clip(pz['readingLevel'].to_s, 4)})." if pz.is_a?(Hash)
  lines.join("\n")
end

def json(res, status, obj)
  res.status = status
  res['Content-Type'] = 'application/json; charset=utf-8'
  res['Cache-Control'] = 'no-store'
  res.body = JSON.generate(obj)
end

def handle_tutor(req, res)
  return json(res, 405, error: 'method_not_allowed') unless req.request_method == 'POST'
  key = gemini_key
  return json(res, 503, error: 'not_configured') unless key

  body = JSON.parse(req.body.to_s) rescue nil
  message = clip(body && body['message'], 2000).strip
  return json(res, 400, error: 'empty_message') if message.empty?

  lang = %w[ru kk].include?(body['lang']) ? body['lang'] : 'kk'
  profile = body['profile'].is_a?(Hash) ? body['profile'] : {}
  topics = body['topics'].is_a?(Array) ? body['topics'].first(10) : []
  history = body['history'].is_a?(Array) ? body['history'].last(6) : []

  sblock = student_block(body['student'])
  context = [sblock.empty? ? "Класс: #{profile['grade'] || 'не указан'}; решено заданий: #{profile['attempts'] || 0}." : sblock,
             'Темы по вопросу и слабые темы (id — название — освоение):',
             *topics.map { |t| "- #{clip(t['id'], 60)} — #{clip(t['title'], 120)} — #{((t['mastery'].to_f) * 100).round}%" },
             body['currentItem'] ? "Текущее задание ученика: #{clip(body['currentItem'], 600)}" : 'Текущего задания нет.'].join("\n")

  turns = history.select { |m| m.is_a?(Hash) && m['text'].is_a?(String) && !m['text'].strip.empty? }
                 .map { |m| { role: %w[me user].include?(m['role']) ? 'user' : 'model', parts: [{ text: clip(m['text'], 1500) }] } }
  turns.shift while turns.any? && turns.first[:role] != 'user'
  contents = turns + [{ role: 'user', parts: [{ text: "#{context}\n\nВопрос ученика: #{message}" }] }]

  uri = URI("https://generativelanguage.googleapis.com/v1beta/models/#{URI.encode_www_form_component(gemini_model)}:generateContent")
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  http.open_timeout = 5
  http.read_timeout = 13
  greq = Net::HTTP::Post.new(uri, 'content-type' => 'application/json', 'x-goog-api-key' => key)
  greq.body = JSON.generate(
    systemInstruction: { parts: [{ text: system_prompt(lang) }] },
    contents: contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 700, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
  )
  gres = http.request(greq)
  unless gres.is_a?(Net::HTTPSuccess)
    warn "Gemini: HTTP #{gres.code} #{gres.body.to_s[0, 300]}"
    return json(res, 502, error: 'upstream', status: gres.code.to_i)
  end
  data = JSON.parse(gres.body)
  raw = (data.dig('candidates', 0, 'content', 'parts') || []).map { |p| p['text'].to_s }.join
  out = JSON.parse(raw) rescue nil
  return json(res, 502, error: 'bad_json') unless out.is_a?(Hash) && out['text'].is_a?(String) && !out['text'].strip.empty?

  json(res, 200, text: out['text'].strip, intent: out['intent'] || 'guide', actions: (out['actions'] || []).first(3))
rescue Net::OpenTimeout, Net::ReadTimeout
  json(res, 504, error: 'timeout')
rescue StandardError => e
  warn "tutor error: #{e.class}: #{e.message}"
  json(res, 500, error: 'failed')
end

# ─── Сервер ─────────────────────────────────────────────────────────────
server = WEBrick::HTTPServer.new(
  Port: PORT, BindAddress: '127.0.0.1', DocumentRoot: ROOT,
  AccessLog: [], Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN),
  RequestCallback: lambda { |_req, res| res['Cache-Control'] = 'no-cache' }
)
WEBrick::HTTPUtils::DefaultMimeTypes['js'] = 'text/javascript'
WEBrick::HTTPUtils::DefaultMimeTypes['webmanifest'] = 'application/manifest+json'
WEBrick::HTTPUtils::DefaultMimeTypes['woff2'] = 'font/woff2'

# Служебные файлы не отдаём наружу
%w[/.env /server.rb /.git].each do |p|
  server.mount_proc(p) { |_req, res| res.status = 404; res.body = 'Not found' }
end
server.mount_proc('/api/tutor') { |req, res| handle_tutor(req, res) }

# ─── /api/admin: проверка PIN администратора (ADMIN_PIN в .env) ──────────
# Защита от подбора: после 5 неверных попыток подряд — пауза 60 секунд.
ADMIN_GUARD = { fails: 0, until: Time.at(0) }
server.mount_proc('/api/admin') do |req, res|
  next json(res, 405, error: 'method_not_allowed') unless req.request_method == 'POST'
  pin = ENV['ADMIN_PIN'] || load_env['ADMIN_PIN']
  next json(res, 503, error: 'not_configured') if pin.nil? || pin.empty?
  next json(res, 429, error: 'too_many') if Time.now < ADMIN_GUARD[:until]
  given = (JSON.parse(req.body.to_s)['pin'] rescue nil).to_s[0, 64]
  require 'digest'
  if !given.empty? && Digest::SHA256.digest(given) == Digest::SHA256.digest(pin)
    ADMIN_GUARD[:fails] = 0
    json(res, 200, ok: true)
  else
    ADMIN_GUARD[:fails] += 1
    if ADMIN_GUARD[:fails] >= 5
      ADMIN_GUARD[:until] = Time.now + 60
      ADMIN_GUARD[:fails] = 0
    end
    json(res, 401, error: 'wrong_pin')
  end
end
server.mount_proc('/api/config') do |_req, res|
  env = load_env
  url = (ENV['SUPABASE_URL'] || env['SUPABASE_URL']).to_s.strip
  anon = (ENV['SUPABASE_ANON_KEY'] || env['SUPABASE_ANON_KEY']).to_s.strip
  supa = url.empty? || anon.empty? ? nil : { url: url, anonKey: anon }
  res['Cache-Control'] = 'no-store'
  json(res, 200, supabase: supa, features: { auth: !supa.nil?, tutor: !gemini_key.nil? })
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }
puts "NASstudy: http://localhost:#{PORT}  (Gemini: #{gemini_key ? 'включён' : 'нет ключа в .env'})"
server.start
