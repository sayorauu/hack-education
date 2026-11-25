import { icon } from './icons.js';
import { t, tf, LANGS } from '../i18n.js';
import { getProfile, getSettings, update, resetAll } from '../state.js';
import { GRADES } from '../data/curriculum.js';
import { header, esc, openModal, closeModal, switchLang, switchTheme, fmt, coin } from './kit.js';
import { action, toast } from './dom.js';
import { qrSvg } from '../engine/qr.js';
import { encodeReport } from '../engine/report.js';
import { showOnboarding } from './onboarding.js';

export function renderProfile() {
  const p = getProfile();
  const s = getSettings();
  return `
    ${header(t('profile.title'), t('profile.sub'))}
    <nav class="menu-links mobile-only">
      <a href="#/leaderboard"><span class="ml-ic t-sky">${icon('trophy', 20)}</span><b>${t('nav.leaderboard')}</b>${icon('chevR', 18)}</a>
      <a href="#/wallet"><span class="ml-ic t-cream">${coin(24)}</span><b>${t('nav.wallet')}</b><span class="ml-val">${fmt(p.coins)}</span>${icon('chevR', 18)}</a>
    </nav>
    <section class="panel share-card">
      <span class="share-ic">${icon('send', 22)}</span>
      <div><h2>${t('share.title')}</h2><p class="note">${t('share.sub')}</p></div>
      <button class="btn" data-act="share-teacher">${t('share.btn')}</button>
    </section>
    <div class="wallet">
      <form class="panel" data-act="profile-save">
        <div class="field"><label for="pfName">${t('profile.name')}</label><input class="input" id="pfName" name="name" value="${esc(p.name)}" maxlength="40"></div>
        <div class="field"><label>${t('profile.grade')}</label>
          <div class="chips">${GRADES.map((g) => `<label class="chip ${p.grade === g ? 'on' : ''}"><input type="radio" name="grade" value="${g}" ${p.grade === g ? 'checked' : ''} hidden>${tf('common.grade', { n: g })}</label>`).join('')}</div></div>
        <button class="btn" style="margin-top:22px" type="submit">${icon('check', 16)} ${t('common.save')}</button>
      </form>
      <section class="panel">
        <div class="field" style="margin-top:0"><label>${t('profile.lang')}</label>
          <div class="chips">${LANGS.map((l) => `<button class="chip ${s.lang === l.id ? 'on' : ''}" data-act="lang" data-id="${l.id}">${l.label}</button>`).join('')}</div></div>
        <div class="field"><label>${t('profile.role')}</label>
          <div class="chips"><button class="chip ${s.role !== 'teacher' ? 'on' : ''}" data-act="role" data-id="student">${icon('user', 15)} ${t('profile.student')}</button>
          <button class="chip ${s.role === 'teacher' ? 'on' : ''}" data-act="role" data-id="teacher">${icon('users', 15)} ${t('profile.teacher')}</button></div></div>
        <div class="field"><label>${t('profile.theme')}</label>
          <div class="chips"><button class="chip ${s.theme === 'light' ? 'on' : ''}" data-act="theme-set" data-id="light">${icon('sun', 15)} ${t('profile.light')}</button>
          <button class="chip ${s.theme === 'dark' ? 'on' : ''}" data-act="theme-set" data-id="dark">${icon('moon', 15)} ${t('profile.dark')}</button></div></div>
        <p class="note" style="margin-top:20px">${icon('shield', 14)} ${t('profile.keyNote')}</p>
        <button class="btn btn-soft" style="margin-top:20px" data-act="tour-again">${icon('play', 15)} ${t('profile.tour')}</button>
        <button class="btn btn-soft" style="margin-top:20px;color:var(--bad)" data-act="profile-reset">${t('profile.reset')}</button>
        <a class="admin-link" href="#/admin">${icon('shield', 14)} ${t('admin.title')}</a>
      </section>
    </div>`;
}

/** Выбор класса в «чипах» подсвечивается сразу, без перерисовки. */
export function bindChipRadios(root) {
  root.addEventListener('change', (e) => {
    if (e.target.type !== 'radio') return;
    e.target.closest('.chips')?.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.contains(e.target)));
  });
}

export function registerProfileActions(rerender) {
  const save = (form, done) => {
    const fd = new FormData(form);
    update((st) => {
      st.profile.name = String(fd.get('name') || '').trim().slice(0, 40);
      st.profile.grade = Number(fd.get('grade')) || st.profile.grade;
      st.profile.onboarded = true;
    });
    done();
  };
  action('profile-save', (_d, form) => save(form, () => { toast(t('profile.saved')); rerender(); }));
  action('theme-set', ({ id }, el) => {
    if (getSettings().theme === id) return;
    switchTheme(el, rerender); // круг новой темы расходится от нажатой кнопки
  });
  /* Отчёт для учителя: QR-код + ссылка. Работает без интернета. */
  action('share-teacher', () => {
    const p = getProfile();
    if (!p.attempts && !p.pisa.length) { toast(t('share.empty')); return; }
    const link = `${location.origin}${location.pathname}#/teacher?r=${encodeReport(p)}`;
    const canShare = typeof navigator.share === 'function';
    openModal(`
      <div class="share-sheet">
        <h2>${t('share.title')}</h2>
        <p class="note">${t('share.scan')}</p>
        <div class="share-qr">${qrSvg(link, { size: 280, label: t('share.title') })}</div>
        <p class="share-who"><b>${esc(p.name)}</b> · ${tf('common.grade', { n: p.grade })} · ${fmt(p.attempts)} ${t('teacher.colSolved').toLowerCase()}</p>
        <div class="q-actions">
          <button class="btn btn-soft" data-act="share-copy" data-link="${esc(link)}">${icon('stack', 16)} ${t('share.copy')}</button>
          ${canShare ? `<button class="btn" data-act="share-send" data-link="${esc(link)}">${icon('send', 16)} ${t('share.send')}</button>` : ''}
        </div>
      </div>`);
  });
  action('share-copy', async ({ link }) => {
    try { await navigator.clipboard.writeText(link); toast(t('share.copied')); }
    catch { prompt(t('share.copy'), link); }
  });
  action('share-send', ({ link }) => {
    navigator.share({ title: 'NASstudy', text: t('share.title'), url: link }).catch(() => { /* отменил */ });
  });
  action('role', ({ id }) => {
    update((st) => { st.settings.role = id === 'teacher' ? 'teacher' : 'student'; });
    location.hash = id === 'teacher' ? '#/teacher' : '#/';
    rerender();
    if (id !== 'teacher' && !getProfile().onboarded) showOnboarding(rerender);
  });

  action('profile-reset', () => {
    if (!confirm(t('profile.resetConfirm'))) return;
    resetAll();
    toast(t('profile.resetDone'));
    rerender();
  });
}
