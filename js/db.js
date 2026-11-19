// IndexedDB réteg. Minden név "nocturne_" előtagot kap, hogy ne ütközzön más appal ugyanazon a domainen.
const DB_NAME = 'nocturne_db';
const DB_VERSION = 1;
const STORE_DREAMS = 'nocturne_dreams';
const STORE_META = 'nocturne_meta';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DREAMS)) {
        const s = db.createObjectStore(STORE_DREAMS, { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function reqP(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// Memóriában tartott másolat – a nézetek ebből dolgoznak (gyors keresés/statisztika).
let cache = null;

export async function allDreams() {
  if (cache) return cache;
  const list = await tx(STORE_DREAMS, 'readonly', (s) => reqP(s.getAll()));
  cache = list.map(normalize);
  sortCache();
  return cache;
}

function sortCache() {
  cache.sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));
}

export async function getDream(id) {
  const list = await allDreams();
  return list.find((d) => d.id === id) || null;
}

export async function saveDream(dream) {
  const d = normalize({ ...dream, updatedAt: Date.now() });
  await tx(STORE_DREAMS, 'readwrite', (s) => s.put(d));
  await allDreams();
  const i = cache.findIndex((x) => x.id === d.id);
  if (i >= 0) cache[i] = d; else cache.push(d);
  sortCache();
  return d;
}

export async function deleteDream(id) {
  await tx(STORE_DREAMS, 'readwrite', (s) => s.delete(id));
  if (cache) cache = cache.filter((d) => d.id !== id);
}

export async function replaceAll(dreams) {
  const list = dreams.map(normalize);
  await tx(STORE_DREAMS, 'readwrite', (s) => { s.clear(); list.forEach((d) => s.put(d)); });
  cache = list;
  sortCache();
}

export async function putMany(dreams) {
  const list = dreams.map(normalize);
  await tx(STORE_DREAMS, 'readwrite', (s) => { list.forEach((d) => s.put(d)); });
  cache = null;
  await allDreams();
}

export async function getMeta(key, fallback = null) {
  const row = await tx(STORE_META, 'readonly', (s) => reqP(s.get(key)));
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await tx(STORE_META, 'readwrite', (s) => s.put({ key, value }));
}

export const MOODS = [
  { id: 'good', label: 'jó', color: '#5eead4' },
  { id: 'neutral', label: 'semleges', color: '#94a3b8' },
  { id: 'bad', label: 'rossz', color: '#f59e0b' },
  { id: 'scary', label: 'ijesztő', color: '#f43f5e' },
  { id: 'weird', label: 'furcsa', color: '#a78bfa' }
];

export const TYPES = [
  { id: 'nightmare', label: 'rémálom' },
  { id: 'lucid', label: 'tudatos álom' },
  { id: 'recurring', label: 'visszatérő álom' }
];

export const TAG_CATS = [
  { id: 'people', label: 'Emberek', one: 'ember', color: '#a78bfa' },
  { id: 'places', label: 'Helyek', one: 'hely', color: '#2dd4bf' },
  { id: 'themes', label: 'Dolgok, témák', one: 'téma', color: '#f472b6' }
];

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function normalize(d) {
  const tags = d.tags || {};
  const clean = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : [])
    .map((t) => String(t).trim()).filter(Boolean)));
  const clarity = Number(d.clarity);
  return {
    id: String(d.id || newId()),
    title: String(d.title || '').trim(),
    text: String(d.text || ''),
    date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : localToday(),
    clarity: clarity >= 1 && clarity <= 5 ? Math.round(clarity) : 0,
    mood: MOODS.some((m) => m.id === d.mood) ? d.mood : '',
    types: (Array.isArray(d.types) ? d.types : []).filter((t) => TYPES.some((x) => x.id === t)),
    tags: { people: clean(tags.people), places: clean(tags.places), themes: clean(tags.themes) },
    createdAt: Number(d.createdAt) || Date.now(),
    updatedAt: Number(d.updatedAt) || Date.now()
  };
}

function localToday() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch (_) { /* nem kritikus */ }
}
