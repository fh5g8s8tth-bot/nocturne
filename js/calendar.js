import { allDreams } from './db.js';
import { dreamCard, fmtLong, monthLabel, moodOf, toISO, today, WEEKDAYS_SHORT, $ } from './util.js';

let cursor = null;   // {y, m}
let selected = null; // 'YYYY-MM-DD'

export async function renderCalendar(view) {
  const dreams = await allDreams();
  const byDay = new Map();
  for (const d of dreams) {
    if (!byDay.has(d.date)) byDay.set(d.date, []);
    byDay.get(d.date).push(d);
  }
  const now = new Date();
  if (!cursor) cursor = { y: now.getFullYear(), m: now.getMonth() };
  if (!selected) selected = today();

  view.innerHTML = `
    <section class="page">
      <header class="page-head"><h1>Naptár</h1></header>
      <div class="cal card">
        <div class="cal-nav">
          <button type="button" class="icon-btn" data-prev aria-label="Előző hónap"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
          <div class="cal-title"></div>
          <button type="button" class="icon-btn" data-next aria-label="Következő hónap"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
        </div>
        <div class="cal-week">${WEEKDAYS_SHORT.map((w) => `<span>${w}</span>`).join('')}</div>
        <div class="cal-grid"></div>
        <div class="cal-sum"></div>
      </div>
      <div class="day-list"></div>
    </section>`;

  const grid = $('.cal-grid', view);
  const t = today();

  const draw = () => {
    const { y, m } = cursor;
    $('.cal-title', view).textContent = monthLabel(y, m);
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // hétfő az első nap
    const daysIn = new Date(y, m + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < offset; i++) html += '<span class="cal-day blank"></span>';
    let monthCount = 0;
    for (let day = 1; day <= daysIn; day++) {
      const iso = toISO(new Date(y, m, day));
      const list = byDay.get(iso) || [];
      if (list.length) monthCount++;
      const mood = list.length ? moodOf(list[0].mood) : null;
      const cls = ['cal-day', list.length ? 'has' : '', iso === t ? 'today' : '', iso === selected ? 'sel' : '', iso > t ? 'future' : ''].join(' ');
      html += `<button type="button" class="${cls}" data-day="${iso}" style="${mood ? `--c:${mood.color}` : ''}">
        <span>${day}</span>${list.length ? `<i>${list.length > 1 ? list.length : ''}</i>` : ''}</button>`;
    }
    grid.innerHTML = html;
    $('.cal-sum', view).textContent = monthCount ? `${monthCount} napon rögzítettél álmot ebben a hónapban` : 'Ebben a hónapban még nincs rögzített álom';
    drawDay();
  };

  const drawDay = () => {
    const list = byDay.get(selected) || [];
    const el = $('.day-list', view);
    const canAdd = selected <= t;
    el.innerHTML = `<h2 class="month-head">${fmtLong(selected)}</h2>` +
      (list.length ? list.map(dreamCard).join('') : '<p class="muted">Erre a napra nincs rögzített álom.</p>') +
      (canAdd ? `<a class="btn ghost add-day" href="#/new?date=${selected}">+ Álom hozzáadása erre a napra</a>` : '');
  };

  view.addEventListener('click', (e) => {
    if (e.target.closest('[data-prev]')) { cursor.m--; if (cursor.m < 0) { cursor.m = 11; cursor.y--; } draw(); return; }
    if (e.target.closest('[data-next]')) { cursor.m++; if (cursor.m > 11) { cursor.m = 0; cursor.y++; } draw(); return; }
    const d = e.target.closest('[data-day]');
    if (d) { selected = d.dataset.day; grid.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); d.classList.add('sel'); drawDay(); }
  });

  // vízszintes húzás: hónapváltás
  let sx = null, sy = null;
  grid.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  grid.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      cursor.m += dx < 0 ? 1 : -1;
      if (cursor.m < 0) { cursor.m = 11; cursor.y--; }
      if (cursor.m > 11) { cursor.m = 0; cursor.y++; }
      draw();
    }
  });

  draw();
}
