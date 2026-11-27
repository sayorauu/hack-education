/**
 * GET /api/geo — ПРИМЕРНЫЙ город посетителя по его интернет-адресу.
 *
 * Vercel сам определяет город по IP и кладёт в заголовки запроса. Мы отдаём
 * только город, страну и координаты, округлённые до 0,01° (≈1 км), чтобы по ним
 * нельзя было найти дом. Сам IP-адрес не возвращаем и не сохраняем.
 * Нужно главному админу, чтобы отличать «нас» от тех, кто заходил издалека.
 */
export default function handler(req, res) {
  const h = (k) => req.headers[k];
  const dec = (v) => { try { return v ? decodeURIComponent(String(v)) : null; } catch { return String(v || '') || null; } };
  const round = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    city: dec(h('x-vercel-ip-city'))?.slice(0, 40) || null,
    country: dec(h('x-vercel-ip-country'))?.slice(0, 4) || null,
    lat: round(h('x-vercel-ip-latitude')),
    lon: round(h('x-vercel-ip-longitude')),
  });
}
