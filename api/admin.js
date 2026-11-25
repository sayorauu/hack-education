/**
 * POST /api/admin — проверка PIN-кода администратора.
 *
 * PIN хранится только на сервере (переменная окружения ADMIN_PIN), в код
 * сайта он не попадает. Сравнение — за постоянное время, чтобы по времени
 * ответа нельзя было угадывать цифры.
 */
import { timingSafeEqual, createHash } from 'node:crypto';

const digest = (s) => createHash('sha256').update(String(s)).digest();

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  const pin = process.env.ADMIN_PIN;
  if (!pin) return res.status(503).json({ error: 'not_configured' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const given = typeof body?.pin === 'string' ? body.pin.slice(0, 64) : '';
  const ok = given.length > 0 && timingSafeEqual(digest(given), digest(pin));
  return ok ? res.status(200).json({ ok: true }) : res.status(401).json({ error: 'wrong_pin' });
}
