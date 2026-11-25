/**
 * GET /api/config — публичная конфигурация для браузера.
 *
 * ВОССТАНОВЛЕНО ЗАНОВО по контракту клиента (src/cloud/supabase.js → loadConfig).
 * Отдаёт только то, что и так публично: адрес Supabase и anon-ключ
 * (он рассчитан на браузер, доступ ограничивают политики RLS в базе).
 *
 * Переменные окружения:
 *   SUPABASE_URL       — https://<project>.supabase.co
 *   SUPABASE_ANON_KEY  — anon / publishable key
 *   GEMINI_API_KEY     — нужен только чтобы честно сообщить, включён ли репетитор
 */
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const supabase = url && anonKey ? { url, anonKey } : null;

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    supabase,
    features: {
      auth: Boolean(supabase),
      tutor: Boolean(process.env.GEMINI_API_KEY),
    },
  });
}
