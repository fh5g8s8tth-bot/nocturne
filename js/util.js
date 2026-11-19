import { MOODS, TYPES } from './db.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function pad(n) { return String(n).padStart(2, '0'); }

export function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function today() { return toISO(new Date()); }

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
export const MONTHS_SHORT = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
export const WEEKDAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
export const WEEKDAYS_SHORT = ['H', 'K', 'Sz', 'Cs', 'P', 'Sz', 'V'];

export function fmtLong(iso) {
  const d = parseISO(iso);
  return `${d.getFullYear()}. ${MONTHS[d.getMonth()]} ${d.getDate()}., ${WEEKDAYS[d.getDay()]}`;
}

export function fmtShort(iso) {
  const t = today();
  if (iso === t) return 'ma';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === toISO(y)) return 'tegnap';
  const d = parseISO(iso);
  const yearPart = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}. ` : '';
  return `${yearPart}${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}.`;
}

export function monthLabel(y, m) {
  return `${y}. ${MONTHS[m]}`;
}

export const moodOf = (id) => MOODS.find((m) => m.id === id);
export const typeOf = (id) => TYPES.find((t) => t.id === id);

export function dreamTitle(d) {
  if (d.title) return d.title;
  const first = d.text.trim().split(/\s+/).slice(0, 7).join(' ');
  return first ? first + (d.text.trim().split(/\s+/).length > 7 ? '…' : '') : 'Névtelen álom';
}

export function clarityDots(n) {
  if (!n) return '';
  let s = '<span class="cdots" aria-label="Tisztaság: ' + n + '/5">';
  for (let i = 1; i <= 5; i++) s += `<i class="${i <= n ? 'on' : ''}"></i>`;
  return s + '</span>';
}

export function dreamCard(d) {
  const mood = moodOf(d.mood);
  const tags = [...d.tags.people, ...d.tags.places, ...d.tags.themes];
  const excerpt = d.title ? d.text : d.text.split(/\s+/).slice(7).join(' ');
  return `
  <a class="card dream-card" href="#/dream/${encodeURIComponent(d.id)}">
    <div class="card-head">
      <b>${esc(dreamTitle(d))}</b>
      ${mood ? `<span class="mood-dot" style="--c:${mood.color}" title="${mood.label}"></span>` : ''}
    </div>
    <div class="meta">
      <span>${fmtShort(d.date)}</span>
      ${mood ? `<span>${mood.label}</span>` : ''}
      ${clarityDots(d.clarity)}
    </div>
    ${excerpt.trim() ? `<p class="excerpt">${esc(excerpt)}</p>` : ''}
    ${d.types.length || tags.length ? `<div class="mini-tags">
      ${d.types.map((t) => `<span class="badge">${typeOf(t).label}</span>`).join('')}
      ${tags.slice(0, 5).map((t) => `<span class="mtag">${esc(t)}</span>`).join('')}
      ${tags.length > 5 ? `<span class="mtag">+${tags.length - 5}</span>` : ''}
    </div>` : ''}
  </a>`;
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/** Egyszerű modális ablak. buttons: [{label, value, kind}] → Promise<value> */
export function modal({ title, body = '', buttons }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <h3>${esc(title)}</h3>
          ${body ? `<div class="modal-body">${body}</div>` : ''}
          <div class="modal-actions">
            ${buttons.map((b, i) => `<button class="btn ${b.kind || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}
          </div>
        </div>
      </div>`;
    const close = (v) => { root.innerHTML = ''; resolve(v); };
    root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) close(null);
      const b = e.target.closest('button[data-i]');
      if (b) close(buttons[Number(b.dataset.i)].value);
    });
  });
}

/** Alsó lap (bottom sheet) */
export function sheet(title, html) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop sheet-backdrop">
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet-grip"></div>
        <div class="sheet-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Bezárás">✕</button></div>
        <div class="sheet-body">${html}</div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop') || e.target.closest('[data-close]') || e.target.closest('a')) close();
  });
}

export function closeOverlays() { $('#modal-root').innerHTML = ''; }

/** Címkék gyakorisága kategóriánként: { people: Map(name→count), ... } */
export function tagCounts(dreams) {
  const res = { people: new Map(), places: new Map(), themes: new Map() };
  for (const d of dreams) {
    for (const cat of Object.keys(res)) {
      for (const t of d.tags[cat]) res[cat].set(t, (res[cat].get(t) || 0) + 1);
    }
  }
  return res;
}

export function sortedTags(map) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'hu'));
}

/** Ékezet- és kisbetű-független összehasonlításhoz */
export function fold(s) {
  return String(s).toLocaleLowerCase('hu').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Rövid, de beszédes dátum a rögzítő képernyőre: „ma · nov. 19., csüt.” */
export function fmtPill(iso) {
  const d = parseISO(iso);
  const rel = fmtShort(iso);
  const base = `${d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '. ' : ''}${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}., ${WEEKDAYS[d.getDay()]}`;
  return rel === 'ma' || rel === 'tegnap' ? `${rel} · ${base}` : base;
}
