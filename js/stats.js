import { MOODS, TYPES, TAG_CATS, allDreams } from './db.js';
import { esc, toISO, today, parseISO, tagCounts, sortedTags, MONTHS_SHORT } from './util.js';
import { setTagFilter } from './journal.js';

function streaks(dreams) {
  const days = new Set(dreams.map((d) => d.date));
  // jelenlegi sorozat: ma vagy tegnap végződik
  const cur = new Date();
  if (!days.has(toISO(cur))) cur.setDate(cur.getDate() - 1);
  let current = 0;
  while (days.has(toISO(cur))) { current++; cur.setDate(cur.getDate() - 1); }

  const sorted = Array.from(days).sort();
  let longest = 0, run = 0, prev = null;
  for (const iso of sorted) {
    const d = parseISO(iso);
    if (prev) {
      const p = new Date(prev); p.setDate(p.getDate() + 1);
      run = toISO(p) === iso ? run + 1 : 1;
    } else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest, days: days.size };
}

function bar(label, value, max, color, extra = '') {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return `<div class="hbar" ${extra}>
    <span class="hbar-label">${label}</span>
    <span class="hbar-track"><span class="hbar-fill" style="width:${pct}%;--c:${color}"></span></span>
    <span class="hbar-val">${value}</span>
  </div>`;
}

export async function renderStats(view) {
  const dreams = await allDreams();
  if (!dreams.length) {
    view.innerHTML = `<section class="page"><header class="page-head"><h1>Statisztika</h1></header>
      <div class="empty"><p>Ha rögzítesz pár álmot, itt jelennek meg a statisztikák.</p><a class="btn primary" href="#/new">Álom rögzítése</a></div></section>`;
    return;
  }

  const s = streaks(dreams);
  const t = today();
  const thisMonth = dreams.filter((d) => d.date.slice(0, 7) === t.slice(0, 7)).length;
  const withClarity = dreams.filter((d) => d.clarity);
  const avgClarity = withClarity.length ? (withClarity.reduce((a, d) => a + d.clarity, 0) / withClarity.length).toFixed(1).replace('.', ',') : '–';

  // havi bontás: utolsó 12 hónap
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: MONTHS_SHORT[d.getMonth()].replace('.', ''), year: d.getFullYear(), n: 0 });
  }
  const monthIdx = new Map(months.map((m, i) => [m.key, i]));
  for (const d of dreams) {
    const i = monthIdx.get(d.date.slice(0, 7));
    if (i !== undefined) months[i].n++;
  }
  const maxMonth = Math.max(1, ...months.map((m) => m.n));

  // összes hónap (régebbiek is) – táblázatos lista
  const allMonths = new Map();
  for (const d of dreams) { const k = d.date.slice(0, 7); allMonths.set(k, (allMonths.get(k) || 0) + 1); }

  const moodCounts = MOODS.map((m) => ({ ...m, n: dreams.filter((d) => d.mood === m.id).length }));
  const noMood = dreams.filter((d) => !d.mood).length;
  const maxMood = Math.max(1, ...moodCounts.map((m) => m.n), noMood);

  const typeCounts = TYPES.map((x) => ({ ...x, n: dreams.filter((d) => d.types.includes(x.id)).length }));
  const counts = tagCounts(dreams);

  view.innerHTML = `
    <section class="page stats">
      <header class="page-head"><h1>Statisztika</h1></header>

      <div class="kpis">
        <div class="kpi card"><b>${dreams.length}</b><span>álom összesen</span></div>
        <div class="kpi card"><b>${thisMonth}</b><span>ebben a hónapban</span></div>
        <div class="kpi card accent"><b>${s.current}</b><span>napos sorozat${s.current ? '' : ' (ma még nincs)'}</span></div>
        <div class="kpi card"><b>${s.longest}</b><span>leghosszabb sorozat</span></div>
        <div class="kpi card"><b>${s.days}</b><span>nap rögzítéssel</span></div>
        <div class="kpi card"><b>${avgClarity}</b><span>átlagos tisztaság</span></div>
      </div>

      <div class="card block">
        <h2>Havonta</h2>
        <div class="vbars" role="img" aria-label="Rögzített álmok száma havonta, az elmúlt 12 hónapban">
          ${months.map((m) => `<div class="vbar"><span class="vbar-val">${m.n || ''}</span><span class="vbar-col" style="height:${Math.round((m.n / maxMonth) * 100)}%"></span><span class="vbar-label">${m.label}</span></div>`).join('')}
        </div>
        ${allMonths.size > 12 || [...allMonths.keys()].some((k) => !monthIdx.has(k)) ? `
        <details class="month-table"><summary>Minden hónap</summary>
          ${[...allMonths.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, n]) => `<div class="row-line"><span>${k.replace('-', '. ')}.</span><b>${n}</b></div>`).join('')}
        </details>` : ''}
      </div>

      <div class="card block">
        <h2>Hangulatok</h2>
        ${moodCounts.map((m) => bar(m.label, m.n, maxMood, m.color)).join('')}
        ${noMood ? bar('nincs megadva', noMood, maxMood, '#3b3b52') : ''}
      </div>

      <div class="card block">
        <h2>Típusok</h2>
        ${typeCounts.map((x) => bar(x.label, x.n, dreams.length, '#8b5cf6')).join('')}
      </div>

      ${TAG_CATS.map((c) => {
        const top = sortedTags(counts[c.id]).slice(0, 8);
        return `<div class="card block">
          <h2>Leggyakoribb: ${c.label.toLowerCase()}</h2>
          ${top.length ? top.map(([name, n]) => bar(esc(name), n, top[0][1], c.color, `data-tag="${esc(c.id + ':' + name)}" role="link" tabindex="0"`)).join('') : '<p class="muted">Még nincs ilyen címke.</p>'}
        </div>`;
      }).join('')}
    </section>`;

  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (!b) return;
    const k = b.dataset.tag; const i = k.indexOf(':');
    setTagFilter(k.slice(0, i), k.slice(i + 1));
    location.hash = '#/journal';
  });
}
