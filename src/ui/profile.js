import { icon } from './icons.js';
import { t, tf, LANGS } from '../i18n.js';
import { getProfile, getSettings, update, resetAll } from '../state.js';
import { GRADES } from '../data/curriculum.js';
import { header, esc, openModal, closeModal, switchLang, switchTheme, fmt, coin } from './kit.js';
import { action, toast } from './dom.js';

export function renderProfile() {
  const p = getProfile();
  const s = getSettings();
  return `
    ${header(t('profile.title'), t('profile.sub'))}
    <nav class="menu-links mobile-only">
      <a href="#/leaderboard"><span class="ml-ic t-sky">${icon('trophy', 20)}</span><b>${t('nav.leaderboard')}</b>${icon('chevR', 18)}</a>
      <a href="#/wallet"><span class="ml-ic t-cream">${coin(24)}</span><b>${t('nav.wallet')}</b><span class="ml-val">${fmt(p.coins)}</span>${icon('chevR', 18)}</a>
    </nav>
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
  action('profile-reset', () => {
    if (!confirm(t('profile.resetConfirm'))) return;
    resetAll();
    toast(t('profile.resetDone'));
    rerender();
  });
}
