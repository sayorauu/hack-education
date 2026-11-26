/**
 * Service worker NASstudy.
 *
 * Стратегия «network-first с откатом в кэш»: пока сеть есть, ученик получает
 * свежую версию; как только сеть пропадает, приложение целиком поднимается
 * из кэша. Это ключевое требование кейса — в сельских школах Казахстана
 * интернет бывает нестабильным или почасовым.
 */

const CACHE = 'nasstudy-v64';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'logo-bear.png',
  'logo-mark.png',
  'styles/app.css',
  'fonts/onest-cyrillic-ext.woff2',
  'fonts/onest-cyrillic.woff2',
  'fonts/onest-latin.woff2',
  'src/main.js',
  'src/state.js',
  'src/i18n.js',
  'src/i18n/kk.js',
  'src/i18n/ru.js',
  'src/data/curriculum.js',
  'src/data/pisa.js',
  'src/data/classmates.js',
  'src/engine/mastery.js',
  'src/cloud/auth.js',
  'src/ui/auth.js',
  'src/cloud/social.js',
  'src/ui/friends.js',
  'src/ui/league.js',
  'src/ui/levels.js',
  'src/engine/tutor.js',
  'src/engine/localllm.js',
  'src/ui/dom.js',
  'src/ui/icons.js',
  'src/ui/kit.js',
  'src/ui/dashboard.js',
  'src/ui/topics.js',
  'src/ui/practice.js',
  'src/ui/leaderboard.js',
  'src/ui/pisa.js',
  'src/ui/wallet.js',
  'src/ui/tutor.js',
  'src/ui/profile.js',
  'src/ui/onboarding.js',
  'src/ui/admin.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      /* addAll атомарен: один отсутствующий файл отменял бы весь кэш и тихо
         убивал офлайн-режим целиком. Кладём поштучно и переживаем промахи. */
      .then((c) => Promise.all(ASSETS.map((a) => c.add(new Request(a, { cache: 'reload' })).catch((err) => {
        console.warn('NASstudy sw: не удалось закэшировать', a, err);
      }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      /* Удаляем только СВОИ старые кэши. В кэше браузера лежит и скачанная
         нейросеть (webllm/*) — снести её при обновлении сайта значило бы
         заставить ученика заново качать сотни мегабайт. */
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nasstudy-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  /* Ответы ИИ-репетитора кэшировать нельзя ни при каких условиях: они зависят
     от профиля и истории диалога, и выдача вчерашнего ответа на сегодняшний
     вопрос выглядела бы как сломанная модель. Оффлайн этот путь и так не
     нужен — вызывающий код в этом случае считает разбор на устройстве. */
  if (url.pathname.startsWith('/api/')) return;

  /* no-cache: браузер обязан сверить файл с сервером (быстрый ответ 304), а не
     отдать старую копию из HTTP-кэша — иначе после обновления сайта ученик
     получал бы смесь старых и новых модулей. */
  e.respondWith(
    (request.mode === 'navigate' ? fetch(request) : fetch(request, { cache: 'no-cache' }))
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('index.html')))
  );
});
