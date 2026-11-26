import { icon } from './icons.js';
import { t, tf, LANGS } from '../i18n.js';
import { getProfile, getSettings, update, resetAll } from '../state.js';
import { GRADES } from '../data/curriculum.js';
import { header, esc, openModal, closeModal, switchLang, switchTheme, fmt, coin, photoAva, safePhoto } from './kit.js';
import { pushPublicCard, isLoggedIn } from '../cloud/auth.js';
import { action, toast } from './dom.js';
import { accountPanel } from './auth.js';
import { levelPanel } from './levels.js';

export function renderProfile() {
  const p = getProfile();
  const s = getSettings();
  return `
    ${header(t('profile.title'), t('profile.sub'))}
    ${accountPanel()}
    ${levelPanel()}
    <nav class="menu-links mobile-only">
      <a href="#/leaderboard"><span class="ml-ic t-sky">${icon('trophy', 20)}</span><b>${t('nav.leaderboard')}</b>${icon('chevR', 18)}</a>
      <a href="#/friends"><span class="ml-ic t-lilac">${icon('users', 20)}</span><b>${t('nav.friends')}</b>${icon('chevR', 18)}</a>
      <a href="#/wallet"><span class="ml-ic t-cream">${coin(24)}</span><b>${t('nav.wallet')}</b><span class="ml-val">${fmt(p.coins)}</span>${icon('chevR', 18)}</a>
    </nav>
    <div class="wallet">
      <form class="panel" data-act="profile-save">
        <div class="pf-photo">
          ${photoAva({ id: 'me', name: p.name, avatar: p.avatar }, 88, 'pf-ava')}
          <div class="pf-photo-txt">
            <b>${t('photo.title')}</b>
            <small>${t(isLoggedIn() ? 'photo.who' : 'photo.whoGuest')}</small>
            <div class="pf-photo-btns">
              <label class="btn btn-soft btn-sm pf-upload">${icon('user', 14)} ${t(safePhoto(p.avatar) ? 'photo.change' : 'photo.upload')}
                <input type="file" id="pfPhoto" accept="image/*" hidden></label>
              ${safePhoto(p.avatar) ? `<button type="button" class="btn btn-soft btn-sm pf-del" data-act="photo-del">${t('photo.remove')}</button>` : ''}
            </div>
          </div>
        </div>
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

/** Фото → квадрат 192×192, JPEG ~10–40 КБ. Ничего не уходит наружу, кроме этого квадрата. */
async function photoToDataUrl(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('type');
  if (file.size > 15 * 1024 * 1024) throw new Error('big');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const S = 192;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
    for (const q of [0.82, 0.7, 0.55, 0.4]) { const d = c.toDataURL('image/jpeg', q); if (safePhoto(d)) return d; }
    throw new Error('big');
  } finally { URL.revokeObjectURL(url); }
}

export function registerProfileActions(rerender) {
  document.addEventListener('change', async (e) => {
    if (e.target?.id !== 'pfPhoto') return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const d = await photoToDataUrl(file);
      update((st) => { st.profile.avatar = d; });
      pushPublicCard();
      toast(t(isLoggedIn() ? 'photo.saved' : 'photo.savedLocal'));
      rerender();
    } catch (err) { toast(t(err.message === 'big' ? 'photo.errBig' : 'photo.errType')); }
  });
  action('photo-del', () => {
    if (!confirm(t('photo.removeConfirm'))) return;
    update((st) => { st.profile.avatar = null; });
    pushPublicCard();
    toast(t('photo.removed'));
    rerender();
  });
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
