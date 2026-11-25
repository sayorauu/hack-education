/**
 * Языки интерфейса: қазақша (основной) и русский.
 */

import { lang } from './state.js';
import { kk } from './i18n/kk.js';
import { ru } from './i18n/ru.js';

export { lang };

const DICT = { kk, ru };

export const LANGS = [
  { id: 'kk', label: 'ҚАЗ' },
  { id: 'ru', label: 'РУС' },
];

export function t(key) {
  return DICT[lang()]?.[key] ?? kk[key] ?? ru[key] ?? key;
}

export function tf(key, vars = {}) {
  return t(key).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

/** Текст из объекта {kk, ru} или строки (одинаковой для обоих языков). */
export function loc(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string' || typeof obj === 'number') return String(obj);
  return obj[lang()] ?? obj.kk ?? obj.ru ?? '';
}

export const dateLocale = () => (lang() === 'kk' ? 'kk-KZ' : 'ru-RU');

/* Браузеры часто не знают казахских названий месяцев (выводят «M11»),
   поэтому месяцы и дни недели заданы явно. */
const MONTHS = {
  kk: ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'],
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
};
const MONTHS_GEN = {
  kk: MONTHS.kk,
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
export const WEEKDAYS = { kk: ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб', 'Жс'], ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] };

export const monthYear = (d) => `${MONTHS[lang()][d.getMonth()]} ${d.getFullYear()}`;
const pad = (n) => String(n).padStart(2, '0');
/** «25 қараша, 16:05» / «25 ноября, 16:05». */
export function fmtDate(ts, { time = true, year = false } = {}) {
  const d = new Date(ts);
  const s = `${d.getDate()} ${MONTHS_GEN[lang()][d.getMonth()]}${year ? ' ' + d.getFullYear() : ''}`;
  return time ? `${s}, ${pad(d.getHours())}:${pad(d.getMinutes())}` : s;
}

/** Проверка: в словарях одинаковый набор ключей (видно в консоли разработчика). */
const missing = Object.keys(kk).filter((k) => !(k in ru)).concat(Object.keys(ru).filter((k) => !(k in kk)));
if (missing.length) console.warn('NASstudy i18n: ключи есть не во всех языках:', missing);
