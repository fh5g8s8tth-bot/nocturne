import { MOODS, TYPES, TAG_CATS, allDreams, deleteDream } from './db.js';
import { esc, dreamCard, dreamTitle, fmtLong, clarityDots, moodOf, typeOf, tagCounts, sortedTags, fold, modal, toast, monthLabel, parseISO, $, $$ } from './util.js';
import { backupBanner } from './backup.js';

// A szűrők megmaradnak a nézetváltások között (munkamenetenként)
const filters = { q: '', moods: new Set(), types: new Set(), tags: new Set() };

function splitKey(k) { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; }

function matches(d) {
  if (filters.q) {
    const hay = fold(d.title + ' ' + d.text + ' ' + [...d.tags.people, ...d.tags.places, ...d.tags.themes].join(' '));
    if (!fold(filters.q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  if (filters.moods.size && !filters.moods.has(d.mood)) return false;
  if (filters.types.size && ![...filters.types].every((t) => d.types.includes(t))) return false;
  if (filters.tags.size) {
    for (const key of filters.tags) {
      const [cat, name] = splitKey(key);
      if (!d.tags[cat].includes(name)) return false;
    }
  }
  return true;
}

function activeCount() {
  return filters.moods.size + filters.types.size + filters.tags.size;
}

export async function renderJournal(view) {
  const dreams = await allDreams();
  const counts = tagCounts(dreams);
  const banner = await backupBanner(dreams.length);

  view.innerHTML = `
    <section class="page">
      <header class="page-head">
        <h1>Napló</h1>
        <a class="icon-btn" href="#/settings" aria-label="Beállítások és biztonsági mentés"><svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></a>
      </header>
      ${banner}
      <div class="search-row">
        <input type="search" class="text-input search" placeholder="Keresés az álmokban…" value="${esc(filters.q)}" aria-label="Keresés">
        <button type="button" class="btn ghost filter-btn" aria-expanded="false">Szűrők<span class="fcount"></span></button>
      </div>
      <div class="filter-panel" hidden>
        <div class="fgroup"><div class="field-label">Hangulat</div><div class="chips">
          ${MOODS.map((m) => `<button type="button" class="chip" data-fmood="${m.id}" style="--c:${m.color}">${m.label}</button>`).join('')}
        </div></div>
        <div class="fgroup"><div class="field-label">Típus</div><div class="chips">
          ${TYPES.map((t) => `<button type="button" class="chip" data-ftype="${t.id}">${t.label}</button>`).join('')}
        </div></div>
        ${TAG_CATS.map((c) => {
          const list = sortedTags(counts[c.id]);
          if (!list.length) return '';
          return `<div class="fgroup"><div class="field-label">${c.label}</div><div class="chips">
            ${list.map(([name, n]) => `<button type="button" class="chip tagchip" style="--c:${c.color}" data-ftag="${esc(c.id + ':' + name)}">${esc(name)} <small>${n}</small></button>`).join('')}
          </div></div>`;
        }).join('')}
        <button type="button" class="link-btn" data-fclear>Szűrők törlése</button>
      </div>
      <div class="result-info"></div>
      <div class="list"></div>
    </section>`;

  const listEl = $('.list', view);
  const infoEl = $('.result-info', view);
  const panel = $('.filter-panel', view);
  const fbtn = $('.filter-btn', view);

  const syncChips = () => {
    $$('[data-fmood]', view).forEach((b) => b.classList.toggle('sel', filters.moods.has(b.dataset.fmood)));
    $$('[data-ftype]', view).forEach((b) => b.classList.toggle('sel', filters.types.has(b.dataset.ftype)));
    $$('[data-ftag]', view).forEach((b) => b.classList.toggle('sel', filters.tags.has(b.dataset.ftag)));
    const n = activeCount();
    $('.fcount', view).textContent = n ? ` · ${n}` : '';
    fbtn.classList.toggle('active', n > 0);
  };

  const renderList = () => {
    if (!dreams.length) {
      infoEl.textContent = '';
      listEl.innerHTML = `<div class="empty"><p>Még nincs rögzített álmod.</p><a class="btn primary" href="#/new">Első álom rögzítése</a></div>`;
      return;
    }
    const shown = dreams.filter(matches);
    const filtered = filters.q || activeCount();
    infoEl.textContent = filtered ? `${shown.length} találat` : `${dreams.length} álom`;
    if (!shown.length) { listEl.innerHTML = '<div class="empty"><p>Nincs a feltételeknek megfelelő álom.</p></div>'; return; }
    let html = ''; let lastMonth = '';
    for (const d of shown) {
      const m = d.date.slice(0, 7);
      if (m !== lastMonth) {
        const dt = parseISO(d.date);
        html += `<h2 class="month-head">${monthLabel(dt.getFullYear(), dt.getMonth())}</h2>`;
        lastMonth = m;
      }
      html += dreamCard(d);
    }
    listEl.innerHTML = html;
  };

  $('.search', view).addEventListener('input', (e) => { filters.q = e.target.value; renderList(); });
  fbtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    fbtn.setAttribute('aria-expanded', String(!panel.hidden));
  });
  panel.addEventListener('click', (e) => {
    const toggle = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.fmood) toggle(filters.moods, b.dataset.fmood);
    else if (b.dataset.ftype) toggle(filters.types, b.dataset.ftype);
    else if (b.dataset.ftag) toggle(filters.tags, b.dataset.ftag);
    else if ('fclear' in b.dataset) { filters.moods.clear(); filters.types.clear(); filters.tags.clear(); }
    syncChips(); renderList();
  });

  // ha egy címke már nem létezik (törlés után), vegyük ki a szűrőből
  for (const key of [...filters.tags]) {
    const [cat, name] = splitKey(key);
    if (!counts[cat] || !counts[cat].has(name)) filters.tags.delete(key);
  }
  if (activeCount()) { panel.hidden = false; fbtn.setAttribute('aria-expanded', 'true'); }
  syncChips();
  renderList();
}

/** Szűrés kívülről (pl. álomtérképről egy címkére) */
export function setTagFilter(cat, name) {
  filters.q = ''; filters.moods.clear(); filters.types.clear(); filters.tags.clear();
  filters.tags.add(cat + ':' + name);
}

export async function renderDetail(view, id) {
  const d = (await allDreams()).find((x) => x.id === id);
  if (!d) {
    view.innerHTML = '<section class="page"><div class="empty"><p>Ez az álom nem található.</p><a class="btn" href="#/journal">Vissza a naplóhoz</a></div></section>';
    return;
  }
  const mood = moodOf(d.mood);
  view.innerHTML = `
    <section class="page detail">
      <header class="page-head">
        <button type="button" class="icon-btn" data-back aria-label="Vissza"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="head-actions">
          <a class="btn ghost small" href="#/edit/${encodeURIComponent(d.id)}">Szerkesztés</a>
          <button type="button" class="btn danger small" data-delete>Törlés</button>
        </div>
      </header>
      <div class="detail-date">${fmtLong(d.date)}</div>
      <h1 class="detail-title">${esc(dreamTitle(d))}</h1>
      <div class="meta big">
        ${mood ? `<span class="mood-pill" style="--c:${mood.color}">${mood.label}</span>` : ''}
        ${d.clarity ? `<span class="meta-item">Tisztaság ${clarityDots(d.clarity)}</span>` : ''}
        ${d.types.map((t) => `<span class="badge">${typeOf(t).label}</span>`).join('')}
      </div>
      <div class="detail-text">${esc(d.text).replace(/\n/g, '<br>')}</div>
      ${TAG_CATS.map((c) => d.tags[c.id].length ? `
        <div class="detail-tags"><div class="field-label">${c.label}</div><div class="chips">
          ${d.tags[c.id].map((t) => `<a class="chip tagchip" style="--c:${c.color}" href="#/journal" data-jump="${esc(c.id + ':' + t)}">${esc(t)}</a>`).join('')}
        </div></div>` : '').join('')}
    </section>`;

  $('[data-back]', view).addEventListener('click', () => {
    if (history.length > 1) history.back(); else location.hash = '#/journal';
  });
  view.addEventListener('click', (e) => {
    const j = e.target.closest('[data-jump]');
    if (j) { const [cat, name] = splitKey(j.dataset.jump); setTagFilter(cat, name); }
  });
  $('[data-delete]', view).addEventListener('click', async () => {
    const ok = await modal({
      title: 'Biztosan törlöd ezt az álmot?',
      body: `<p>„${esc(dreamTitle(d))}” végleg törlődik. Ez nem vonható vissza.</p>`,
      buttons: [{ label: 'Mégse', value: false, kind: 'ghost' }, { label: 'Törlés', value: true, kind: 'danger' }]
    });
    if (!ok) return;
    await deleteDream(d.id);
    toast('Álom törölve');
    location.hash = '#/journal';
  });
}
