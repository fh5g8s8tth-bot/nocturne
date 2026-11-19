import { allDreams, putMany, replaceAll, getMeta, setMeta, normalize } from './db.js';
import { esc, toast, modal, today, fmtLong, toISO, $ } from './util.js';

export const APP_VERSION = '1';
const SNOOZE_KEY = 'nocturne_backup_snooze';
const REMIND_DAYS = 14;
const DAY = 86400000;

export async function exportBackup() {
  const dreams = await allDreams();
  const payload = {
    app: 'nocturne',
    format: 1,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    count: dreams.length,
    dreams
  };
  const name = `nocturne-mentes-${today()}.json`;
  const json = JSON.stringify(payload, null, 2);
  const file = new File([json], name, { type: 'application/json' });

  let done = false;
  // iPhone-on a megosztás lap a legmegbízhatóbb („Mentés a Fájlokba”)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Nocturne biztonsági mentés' });
      done = true;
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
      // más hiba esetén letöltéssel próbálkozunk
    }
  }
  if (!done) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    done = true;
  }
  await setMeta('lastExport', Date.now());
  try { localStorage.removeItem(SNOOZE_KEY); } catch (_) { /* */ }
  toast('Biztonsági mentés elkészült');
  return true;
}

function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (_) { throw new Error('A fájl nem érvényes JSON.'); }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.dreams) ? data.dreams : null;
  if (!list) throw new Error('A fájlban nem találok álmokat.');
  const dreams = list.filter((d) => d && typeof d === 'object' && (d.text || d.title)).map(normalize);
  if (!dreams.length && list.length) throw new Error('A fájlban lévő bejegyzések nem értelmezhetők.');
  return dreams;
}

export async function importBackup(file) {
  let dreams;
  try {
    dreams = parseBackup(await file.text());
  } catch (err) {
    await modal({ title: 'Nem sikerült beolvasni', body: `<p>${esc(err.message)}</p>`, buttons: [{ label: 'Rendben', value: true, kind: 'primary' }] });
    return;
  }
  const current = await allDreams();
  const choice = await modal({
    title: `${dreams.length} álom a fájlban`,
    body: `<p><b>Összefésülés:</b> a meglévő álmaid megmaradnak, a fájlból az újak bekerülnek, az egyezőknél a frissebb változat marad.</p>
           <p><b>Csere:</b> a jelenlegi ${current.length} álom törlődik, és csak a fájl tartalma marad.</p>`,
    buttons: [
      { label: 'Mégse', value: null, kind: 'ghost' },
      { label: 'Csere', value: 'replace', kind: 'danger' },
      { label: 'Összefésülés', value: 'merge', kind: 'primary' }
    ]
  });
  if (!choice) return;
  if (choice === 'replace') {
    const sure = await modal({
      title: 'Biztosan lecseréled?',
      body: `<p>A jelenlegi ${current.length} álom végleg törlődik.</p>`,
      buttons: [{ label: 'Mégse', value: false, kind: 'ghost' }, { label: 'Csere', value: true, kind: 'danger' }]
    });
    if (!sure) return;
    await replaceAll(dreams);
    toast(`Visszaállítva: ${dreams.length} álom`);
  } else {
    const byId = new Map(current.map((d) => [d.id, d]));
    const toWrite = dreams.filter((d) => !byId.has(d.id) || byId.get(d.id).updatedAt < d.updatedAt);
    const added = toWrite.filter((d) => !byId.has(d.id)).length;
    await putMany(toWrite);
    toast(`${added} új álom, ${toWrite.length - added} frissítve`);
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Figyelmeztető sáv a naplóban, ha régen volt mentés */
export async function backupBanner(count) {
  if (!count) return '';
  try {
    const snooze = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    if (snooze > Date.now()) return '';
  } catch (_) { /* */ }
  const last = await getMeta('lastExport');
  const dreams = await allDreams();
  const since = last || Math.min(...dreams.map((d) => d.createdAt));
  const days = Math.floor((Date.now() - since) / DAY);
  if (days < REMIND_DAYS) return '';
  const text = last ? `${days} napja nem készült biztonsági mentés.` : 'Még nem készítettél biztonsági mentést.';
  return `<div class="banner" data-banner>
    <span>${text}</span>
    <div class="banner-actions">
      <button type="button" class="btn small ghost" data-snooze>Később</button>
      <button type="button" class="btn small primary" data-backup-now>Mentés most</button>
    </div>
  </div>`;
}

// globális kezelő a sáv gombjaihoz
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-snooze]')) {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 3 * DAY)); } catch (_) { /* */ }
    const b = e.target.closest('[data-banner]'); if (b) b.remove();
  } else if (e.target.closest('[data-backup-now]')) {
    const ok = await exportBackup();
    if (ok) { const b = document.querySelector('[data-banner]'); if (b) b.remove(); }
  }
});

export async function renderSettings(view) {
  const dreams = await allDreams();
  const last = await getMeta('lastExport');
  let persisted = null;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (_) { /* */ }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  view.innerHTML = `
    <section class="page settings">
      <header class="page-head">
        <button type="button" class="icon-btn" data-back aria-label="Vissza"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <h1>Beállítások</h1>
        <span style="width:40px"></span>
      </header>

      <div class="card block">
        <h2>Biztonsági mentés</h2>
        <p class="muted">Az álmaid csak ezen a telefonon, a böngésző tárhelyén vannak. Ha törlöd a Safari adatait vagy az appot, elvesznek. Időnként mentsd ki őket egy fájlba, pl. az iCloud Drive-ra.</p>
        <p>Utolsó mentés: <b>${last ? fmtLong(toISO(new Date(last))) : 'még nem volt'}</b></p>
        <div class="btn-row">
          <button type="button" class="btn primary" data-export>Exportálás JSON fájlba</button>
          <label class="btn ghost file-btn">Importálás fájlból<input type="file" accept="application/json,.json" data-import hidden></label>
        </div>
      </div>

      <div class="card block">
        <h2>Tárolás</h2>
        <div class="row-line"><span>Rögzített álmok</span><b>${dreams.length}</b></div>
        <div class="row-line"><span>Főképernyőről fut</span><b>${standalone ? 'igen' : 'nem'}</b></div>
        <div class="row-line"><span>Tartós tárolás</span><b>${persisted === null ? 'ismeretlen' : persisted ? 'engedélyezve' : 'nincs'}</b></div>
        ${standalone ? '' : `<p class="muted">Tipp: Safariban nyomd meg a Megosztás gombot, majd válaszd a „Főképernyőhöz adás” lehetőséget. Így az app offline is indul, és az iOS nem törli automatikusan az adatait.</p>`}
      </div>

      <div class="card block">
        <h2>Veszélyzóna</h2>
        <button type="button" class="btn danger" data-wipe>Minden álom törlése</button>
      </div>

      <p class="muted center">Nocturne v${APP_VERSION}</p>
    </section>`;

  $('[data-back]', view).addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = '#/new'; });
  $('[data-export]', view).addEventListener('click', async () => { if (await exportBackup()) renderSettingsAgain(); });
  $('[data-import]', view).addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) await importBackup(f);
  });
  $('[data-wipe]', view).addEventListener('click', async () => {
    const ok = await modal({
      title: 'Minden álom törlése?',
      body: `<p>Mind a(z) ${dreams.length} álom végleg törlődik erről a telefonról. Előtte érdemes exportálni.</p>`,
      buttons: [{ label: 'Mégse', value: false, kind: 'ghost' }, { label: 'Végleges törlés', value: true, kind: 'danger' }]
    });
    if (!ok) return;
    await replaceAll([]);
    toast('Minden álom törölve');
    renderSettingsAgain();
  });
}

function renderSettingsAgain() { window.dispatchEvent(new HashChangeEvent('hashchange')); }
