/**
 * Анимация диаграмм при заходе на страницу: кольца и круговые диаграммы
 * закручиваются и наполняются, полоски вырастают с лёгким «пружинящим»
 * перелётом и бликом, проценты досчитываются от нуля.
 * Пустые диаграммы (0%) не трогаем — им нечего показывать.
 * Запускается только при смене страницы, чтобы не мигать при каждом клике.
 */

const RING = '.pie, .mring, .pring';
const BAR = '.bar > i, .sf-bar > i, .lvl-bar > i, .wb > i';
const COUNT = '.pring b, .mring > span, [data-count]';
const MIN = 4.5; // меньше — это «пустая» диаграмма (на сайте у пустых минимальная заглушка 2–4%)

const numOf = (el, prop) => parseFloat(prop === '--p' ? getComputedStyle(el).getPropertyValue('--p') : el.style[prop]) || 0;

export function animateCharts(root = document.getElementById('main')) {
  if (!root || document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let i = 0;
  root.querySelectorAll(RING).forEach((el) => {
    if (numOf(el, '--p') <= MIN) return;
    el.style.setProperty('--d', `${Math.min(i++, 12) * 70}ms`);
    el.classList.remove('ca'); void el.offsetWidth; el.classList.add('ca');
  });

  let j = 0;
  root.querySelectorAll(BAR).forEach((el) => {
    const v = numOf(el, el.parentElement.classList.contains('wb') ? 'height' : 'width');
    if (v <= MIN || el.parentElement.classList.contains('zero')) return;
    el.style.setProperty('--d', `${Math.min(j++, 14) * 45}ms`);
    el.classList.remove('ca'); void el.offsetWidth; el.classList.add('ca');
  });

  // Проценты и числа досчитываются от нуля вместе с диаграммой
  root.querySelectorAll(COUNT).forEach((b) => {
    const m = b.textContent.trim().match(/^(\d+)(%?)$/);
    if (!m || Number(m[1]) === 0) return;
    const end = Number(m[1]), suf = m[2], t0 = performance.now(), D = 1100;
    b.textContent = '0' + suf;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      b.textContent = Math.round(end * e) + suf;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
