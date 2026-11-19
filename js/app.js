import { allDreams, getDream } from './db.js';
import { closeOverlays, $$ } from './util.js';
import { renderForm } from './form.js';
import { renderJournal, renderDetail } from './journal.js';
import { renderCalendar } from './calendar.js';
import { renderStats } from './stats.js';
import { renderMap } from './map.js';
import { renderSettings } from './backup.js';

const scrollPos = new Map();
let currentKey = '';

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '') || 'new';
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').map(decodeURIComponent);
  return { name: parts[0] || 'new', arg: parts[1], params: new URLSearchParams(query), key: raw };
}

async function route() {
  const r = parseRoute();
  closeOverlays();
  if (currentKey) scrollPos.set(currentKey, window.scrollY);

  // friss nézet-elem: így a korábbi eseménykezelők nem halmozódnak
  const old = document.getElementById('view');
  const view = old.cloneNode(false);
  old.replaceWith(view);
  view.className = 'view view-' + r.name;
  document.body.dataset.route = r.name;

  const tab = { new: 'new', journal: 'journal', dream: 'journal', edit: 'journal', calendar: 'calendar', map: 'map', stats: 'stats', settings: '' }[r.name];
  $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));

  try {
    switch (r.name) {
      case 'journal': await renderJournal(view); break;
      case 'dream': await renderDetail(view, r.arg); break;
      case 'edit': {
        const d = await getDream(r.arg);
        if (d) await renderForm(view, { dream: d }); else await renderDetail(view, r.arg);
        break;
      }
      case 'calendar': await renderCalendar(view); break;
      case 'stats': await renderStats(view); break;
      case 'map': await renderMap(view); break;
      case 'settings': await renderSettings(view); break;
      default: {
        const date = r.params.get('date');
        await renderForm(view, { date: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : undefined });
      }
    }
  } catch (err) {
    console.error(err);
    view.innerHTML = `<section class="page"><div class="empty"><p>Hiba történt: ${String(err && err.message || err)}</p><a class="btn" href="#/new">Újrapróbálás</a></div></section>`;
  }

  currentKey = r.key;
  const y = scrollPos.get(r.key);
  window.scrollTo(0, ['journal', 'stats', 'calendar'].includes(r.name) && y ? y : 0);
}

window.addEventListener('hashchange', route);

// Gépelés közben elrejtjük az alsó sávot, hogy több hely maradjon a billentyűzet fölött
const isTextField = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['date', 'file', 'checkbox', 'radio'].includes(el.type)));
document.addEventListener('focusin', (e) => { if (isTextField(e.target)) document.body.classList.add('kb'); });
document.addEventListener('focusout', () => {
  setTimeout(() => { if (!isTextField(document.activeElement)) document.body.classList.remove('kb'); }, 80);
});

// előtöltés, majd első megjelenítés
allDreams().catch(() => {}).finally(route);

// Service worker – csak a saját mappára (scope: ./)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((e) => console.warn('SW hiba', e));
    // új verzió élesedésekor egyszer frissítünk (a piszkozat el van mentve)
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
  });
}
