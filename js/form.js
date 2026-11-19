import { MOODS, TYPES, TAG_CATS, allDreams, saveDream, newId, requestPersistence } from './db.js';
import { esc, today, fmtLong, fmtPill, toast, tagCounts, sortedTags, fold, $, $$ } from './util.js';

const DRAFT_KEY = 'nocturne_draft';

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) { return null; }
}
function storeDraft(d) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (_) { /* tele / privát mód */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (_) { /* */ }
}

function emptyDream(date) {
  return { id: '', title: '', text: '', date: date || today(), clarity: 0, mood: '', types: [], tags: { people: [], places: [], themes: [] } };
}

/**
 * Új álom / szerkesztés űrlap.
 * opts: { dream?: létező álom (szerkesztés), date?: előre kitöltött dátum }
 */
export async function renderForm(view, opts = {}) {
  const editing = !!opts.dream;
  let state;
  let restored = false;
  if (editing) {
    state = structuredClone(opts.dream);
  } else {
    const draft = loadDraft();
    if (draft && (draft.text || draft.title) && !opts.date) {
      state = { ...emptyDream(), ...draft };
      restored = true;
    } else {
      state = emptyDream(opts.date);
    }
  }

  const dreams = await allDreams();
  const counts = tagCounts(dreams);
  const hasDetails = state.title || TAG_CATS.some((c) => state.tags[c.id].length);

  view.innerHTML = `
    <section class="capture">
      <header class="capture-head">
        <label class="date-pill">
          <span class="date-text">${fmtPill(state.date)}</span>
          <input type="date" class="date-input" value="${state.date}" max="${today()}" aria-label="Dátum">
        </label>
        <div class="head-actions">
        ${editing ? '' : '<a class="icon-btn" href="#/settings" aria-label="Beállítások és biztonsági mentés"><svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></a>'}
        <button type="button" class="btn primary small save-btn">Mentés</button>
        </div>
      </header>
      <h1 class="capture-title">${editing ? 'Álom szerkesztése' : 'Mit álmodtál?'}</h1>
      ${restored ? '<div class="draft-note">Piszkozat visszaállítva. <button type="button" class="link-btn" data-discard>Elvetés</button></div>' : ''}

      <textarea class="dream-text" placeholder="Írd le, amire emlékszel… (diktáláshoz: mikrofon a billentyűzeten)" aria-label="Álom szövege">${esc(state.text)}</textarea>

      <div class="field-row">
        <span class="field-label">Tisztaság</span>
        <div class="clarity" role="radiogroup" aria-label="Tisztaság 1-5">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="cdot ${n <= state.clarity ? 'on' : ''}" data-clarity="${n}" aria-label="${n}"></button>`).join('')}
        </div>
      </div>

      <div class="field-row wrap">
        <span class="field-label">Hangulat</span>
        <div class="chips" data-group="mood">
          ${MOODS.map((m) => `<button type="button" class="chip ${state.mood === m.id ? 'sel' : ''}" data-mood="${m.id}" style="--c:${m.color}">${m.label}</button>`).join('')}
        </div>
      </div>

      <div class="field-row wrap">
        <span class="field-label">Típus</span>
        <div class="chips">
          ${TYPES.map((t) => `<button type="button" class="chip ${state.types.includes(t.id) ? 'sel' : ''}" data-type="${t.id}">${t.label}</button>`).join('')}
        </div>
      </div>

      <details class="details" ${hasDetails || editing ? 'open' : ''}>
        <summary>Részletek: cím, címkék</summary>
        <input class="text-input title-input" type="text" placeholder="Cím (nem kötelező)" value="${esc(state.title)}" aria-label="Cím">
        ${TAG_CATS.map((c) => `
          <div class="tag-field" data-cat="${c.id}" style="--c:${c.color}">
            <div class="tag-field-label">${c.label}</div>
            <div class="tag-box">
              <div class="tag-selected"></div>
              <input type="text" class="tag-input" placeholder="+ ${c.one} hozzáadása" enterkeyhint="done" autocomplete="off" autocapitalize="none">
            </div>
            <div class="tag-suggest"></div>
          </div>`).join('')}
      </details>

      <div class="save-bar">
        ${editing ? '<button type="button" class="btn ghost" data-cancel>Mégse</button>' : ''}
        <button type="button" class="btn primary save-btn">Mentés</button>
      </div>
    </section>`;

  const textEl = $('.dream-text', view);
  const titleEl = $('.title-input', view);
  const dateEl = $('.date-input', view);

  // Szövegmező magasságának igazítása a tartalomhoz (de legalább nagy marad)
  const grow = () => { textEl.style.height = 'auto'; textEl.style.height = Math.max(textEl.scrollHeight, 0) + 'px'; };

  let draftTimer;
  const persistDraft = () => {
    if (editing) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      if (state.text.trim() || state.title.trim()) storeDraft(state); else clearDraft();
    }, 300);
  };

  textEl.addEventListener('input', () => { state.text = textEl.value; grow(); persistDraft(); });
  titleEl.addEventListener('input', () => { state.title = titleEl.value; persistDraft(); });
  dateEl.addEventListener('change', () => {
    if (!dateEl.value) { dateEl.value = state.date; return; }
    state.date = dateEl.value;
    $('.date-text', view).textContent = fmtPill(state.date);
    persistDraft();
  });
  requestAnimationFrame(grow);

  view.addEventListener('click', (e) => {
    const c = e.target.closest('[data-clarity]');
    if (c) {
      const n = Number(c.dataset.clarity);
      state.clarity = state.clarity === n ? 0 : n;
      $$('[data-clarity]', view).forEach((b) => b.classList.toggle('on', Number(b.dataset.clarity) <= state.clarity));
      persistDraft();
      return;
    }
    const m = e.target.closest('[data-mood]');
    if (m) {
      state.mood = state.mood === m.dataset.mood ? '' : m.dataset.mood;
      $$('[data-mood]', view).forEach((b) => b.classList.toggle('sel', b.dataset.mood === state.mood));
      persistDraft();
      return;
    }
    const t = e.target.closest('[data-type]');
    if (t) {
      const id = t.dataset.type;
      state.types = state.types.includes(id) ? state.types.filter((x) => x !== id) : [...state.types, id];
      t.classList.toggle('sel', state.types.includes(id));
      persistDraft();
      return;
    }
    if (e.target.closest('[data-discard]')) {
      clearDraft();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return;
    }
    if (e.target.closest('[data-cancel]')) {
      location.hash = `#/dream/${encodeURIComponent(state.id)}`;
    }
  });

  // Címke mezők
  for (const field of $$('.tag-field', view)) {
    const cat = field.dataset.cat;
    const input = $('.tag-input', field);
    const selEl = $('.tag-selected', field);
    const sugEl = $('.tag-suggest', field);
    const known = sortedTags(counts[cat]);

    const renderSel = () => {
      selEl.innerHTML = state.tags[cat].map((t) =>
        `<span class="tag sel">${esc(t)}<button type="button" data-remove="${esc(t)}" aria-label="${esc(t)} eltávolítása">×</button></span>`).join('');
    };
    const renderSug = () => {
      const q = input.value.trim();
      const fq = fold(q);
      const chosen = new Set(state.tags[cat].map(fold));
      let items = known.filter(([name]) => !chosen.has(fold(name)) && (!fq || fold(name).includes(fq)));
      // előtaggal kezdődők előre
      if (fq) items.sort((a, b) => (fold(b[0]).startsWith(fq) - fold(a[0]).startsWith(fq)) || b[1] - a[1]);
      items = items.slice(0, q ? 8 : 6);
      const exact = known.some(([name]) => fold(name) === fq) || chosen.has(fq);
      let html = '';
      if (q && !exact) html += `<button type="button" class="tag new" data-add="${esc(q)}">+ Új: ${esc(q)}</button>`;
      html += items.map(([name, n]) => `<button type="button" class="tag" data-add="${esc(name)}">${esc(name)}<small>${n}</small></button>`).join('');
      sugEl.innerHTML = html;
    };
    const add = (name) => {
      name = name.trim().replace(/,+$/, '').trim();
      if (!name) return;
      // ha már ismert (más írásmóddal), az ismert alakot használjuk
      const match = known.find(([k]) => fold(k) === fold(name));
      if (match) name = match[0];
      if (!state.tags[cat].some((t) => fold(t) === fold(name))) state.tags[cat].push(name);
      input.value = '';
      renderSel(); renderSug(); persistDraft();
    };

    input.addEventListener('input', () => {
      if (input.value.includes(',')) {
        input.value.split(',').slice(0, -1).forEach(add);
        input.value = input.value.split(',').pop();
      }
      renderSug();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); add(input.value); }
      else if (e.key === 'Backspace' && !input.value && state.tags[cat].length) {
        state.tags[cat].pop(); renderSel(); renderSug(); persistDraft();
      }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) add(input.value); });
    // Érintésre ne tűnjön el a billentyűzet a javaslatok koppintásakor
    sugEl.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-add]')) e.preventDefault(); });
    sugEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]');
      if (b) add(b.dataset.add);
    });
    selEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]');
      if (!b) return;
      state.tags[cat] = state.tags[cat].filter((t) => t !== b.dataset.remove);
      renderSel(); renderSug(); persistDraft();
    });
    renderSel(); renderSug();
  }

  const save = async () => {
    // Függőben lévő, beírt de nem rögzített címkék felvétele
    $$('.tag-input', view).forEach((i) => { if (i.value.trim()) i.dispatchEvent(new Event('blur')); });
    state.text = textEl.value;
    state.title = titleEl.value;
    if (!state.text.trim() && !state.title.trim()) {
      toast('Írj legalább pár szót az álomról.');
      textEl.focus();
      return;
    }
    const isNew = !state.id;
    if (isNew) { state.id = newId(); state.createdAt = Date.now(); }
    const saved = await saveDream(state);
    clearTimeout(draftTimer);
    if (!editing) clearDraft();
    requestPersistence();
    toast(isNew ? 'Álom elmentve ✦' : 'Változások mentve');
    location.hash = editing ? `#/dream/${encodeURIComponent(saved.id)}` : '#/journal';
  };
  let saving = false;
  $$('.save-btn', view).forEach((b) => b.addEventListener('click', async () => {
    if (saving) return;
    saving = true;
    try { await save(); } finally { saving = false; }
  }));
}
