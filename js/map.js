import { TAG_CATS, allDreams } from './db.js';
import { esc, dreamCard, sheet, $ } from './util.js';
import { setTagFilter } from './journal.js';

const CAT_COLOR = Object.fromEntries(TAG_CATS.map((c) => [c.id, c.color]));
const CAT_LABEL = Object.fromEntries(TAG_CATS.map((c) => [c.id, c.label]));

function buildGraph(dreams) {
  const nodes = new Map();
  const edges = new Map();
  for (const d of dreams) {
    const keys = [];
    for (const c of TAG_CATS) {
      for (const name of d.tags[c.id]) {
        const key = c.id + ':' + name;
        if (!nodes.has(key)) nodes.set(key, { key, cat: c.id, name, count: 0, dreams: [] });
        const n = nodes.get(key);
        n.count++; n.dreams.push(d);
        keys.push(key);
      }
    }
    const uniq = Array.from(new Set(keys)).sort();
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const k = uniq[i] + '\u0001' + uniq[j];
        if (!edges.has(k)) edges.set(k, { a: uniq[i], b: uniq[j], w: 0 });
        edges.get(k).w++;
      }
    }
  }
  const list = Array.from(nodes.values());
  const maxCount = Math.max(1, ...list.map((n) => n.count));
  const spread = 40 * Math.sqrt(list.length + 1);
  list.forEach((n, i) => {
    // golden-angle spirál: determinisztikus, egyenletes kezdő elrendezés
    const a = i * 2.399963;
    const r = spread * Math.sqrt((i + 0.5) / list.length);
    n.x = Math.cos(a) * r; n.y = Math.sin(a) * r;
    n.vx = 0; n.vy = 0;
    n.r = 7 + 17 * Math.sqrt(n.count / maxCount);
    n.neighbors = new Set();
  });
  const elist = Array.from(edges.values()).map((e) => ({ ...e, na: nodes.get(e.a), nb: nodes.get(e.b) }));
  elist.forEach((e) => { e.na.neighbors.add(e.nb); e.nb.neighbors.add(e.na); });
  const maxW = Math.max(1, ...elist.map((e) => e.w));
  return { nodes: list, edges: elist, maxW };
}

function tick(g, alpha) {
  const N = g.nodes;
  for (let i = 0; i < N.length; i++) {
    const a = N[i];
    for (let j = i + 1; j < N.length; j++) {
      const b = N[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy; }
      const minD = a.r + b.r + 6;
      let f = (900 * alpha) / Math.max(d2, 100);
      if (d2 < minD * minD) f += 0.25 * (minD - Math.sqrt(d2)) / Math.sqrt(d2);
      a.vx -= dx * f; a.vy -= dy * f;
      b.vx += dx * f; b.vy += dy * f;
    }
  }
  for (const e of g.edges) {
    const a = e.na, b = e.nb;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const L = 55 + a.r + b.r;
    const k = 0.04 * (0.6 + 0.4 * (e.w / g.maxW));
    const s = ((d - L) / d) * k * alpha * 4;
    a.vx += dx * s * 0.5; a.vy += dy * s * 0.5;
    b.vx -= dx * s * 0.5; b.vy -= dy * s * 0.5;
  }
  for (const n of N) {
    n.vx -= n.x * 0.012 * alpha; n.vy -= n.y * 0.012 * alpha;
    if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
    n.vx *= 0.55; n.vy *= 0.55;
    n.x += n.vx; n.y += n.vy;
  }
}

export async function renderMap(view) {
  const dreams = await allDreams();
  const g = buildGraph(dreams);

  view.innerHTML = `
    <section class="map-page">
      <header class="page-head map-head">
        <h1>Álomtérkép</h1>
        <button type="button" class="btn ghost small" data-fit>Középre</button>
      </header>
      <div class="map-legend">
        ${TAG_CATS.map((c) => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join('')}
      </div>
      <div class="map-wrap">
        <canvas class="map-canvas" aria-label="Álomtérkép: a címkék és kapcsolataik"></canvas>
        ${g.nodes.length ? '<div class="map-hint">Húzd, csippentsd, koppints egy pontra</div>' : `
          <div class="empty map-empty"><p>Az álomtérkép a címkékből épül. Adj embereket, helyeket vagy témákat az álmaidhoz a „Részletek” résznél, és itt kirajzolódnak a kapcsolataik.</p></div>`}
      </div>
    </section>`;

  if (!g.nodes.length) return;

  const wrap = $('.map-wrap', view);
  const canvas = $('.map-canvas', view);
  const ctx = canvas.getContext('2d');
  const hint = $('.map-hint', view);
  let W = 0, H = 0, dpr = 1;
  const cam = { s: 1, tx: 0, ty: 0 };
  let alpha = 1;
  let selected = null;
  let running = false;
  let userMovedCamera = false;
  let settledOnce = false;

  // előzetes számolás, hogy ne „robbanjon” szét a háló megnyitáskor
  const pre = g.nodes.length > 250 ? 40 : 160;
  for (let i = 0; i < pre; i++) { tick(g, alpha); alpha *= 0.985; }

  const resize = () => {
    const r = wrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    if (!userMovedCamera) fit(false);
    draw();
  };

  function fit(animate = true) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of g.nodes) {
      minX = Math.min(minX, n.x - n.r); maxX = Math.max(maxX, n.x + n.r);
      minY = Math.min(minY, n.y - n.r - 16); maxY = Math.max(maxY, n.y + n.r + 16);
    }
    const pad = 30;
    const s = Math.min(2.2, Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxY - minY || 1)));
    const target = { s, tx: W / 2 - ((minX + maxX) / 2) * s, ty: H / 2 - ((minY + maxY) / 2) * s };
    if (!animate) { Object.assign(cam, target); return; }
    const from = { ...cam }; const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 350); const e = 1 - Math.pow(1 - p, 3);
      cam.s = from.s + (target.s - from.s) * e;
      cam.tx = from.tx + (target.tx - from.tx) * e;
      cam.ty = from.ty + (target.ty - from.ty) * e;
      draw();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.tx, dpr * cam.ty);

    const focus = selected ? new Set([selected, ...selected.neighbors]) : null;

    // élek
    for (const e of g.edges) {
      const on = !focus || (e.na === selected || e.nb === selected);
      ctx.globalAlpha = on ? (focus ? 0.85 : 0.35 + 0.4 * (e.w / g.maxW)) : 0.06;
      ctx.strokeStyle = on && focus ? '#e6f1ff' : '#5eead4';
      ctx.lineWidth = (0.8 + 5.2 * ((e.w - 1) / Math.max(1, g.maxW - 1))) / Math.sqrt(cam.s);
      ctx.beginPath(); ctx.moveTo(e.na.x, e.na.y); ctx.lineTo(e.nb.x, e.nb.y); ctx.stroke();
    }
    // pontok
    for (const n of g.nodes) {
      const on = !focus || focus.has(n);
      const c = CAT_COLOR[n.cat];
      ctx.globalAlpha = on ? 0.28 : 0.05;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = on ? 1 : 0.18;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      if (n === selected) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5 / cam.s;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 4 / cam.s, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // feliratok képernyő-koordinátában, hogy élesek maradjanak
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const ranked = [...g.nodes].sort((a, b) => b.count - a.count);
    const topSet = new Set(g.nodes.length <= 40 ? ranked : ranked.slice(0, Math.max(12, Math.round(16 * cam.s))));
    for (const n of g.nodes) {
      const on = !focus || focus.has(n);
      const show = focus ? on : (topSet.has(n) || n.r * cam.s > 14 || cam.s > 1.6);
      if (!show) continue;
      const sx = n.x * cam.s + cam.tx, sy = (n.y + n.r) * cam.s + cam.ty + 4;
      if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 20) continue;
      const size = n === selected ? 14 : 12;
      ctx.font = `${n === selected ? 600 : 400} ${size}px "Space Grotesk", system-ui, sans-serif`;
      ctx.globalAlpha = on ? 1 : 0.3;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,7,11,.85)';
      ctx.strokeText(n.name, sx, sy);
      ctx.fillStyle = '#e6f1ff';
      ctx.fillText(n.name, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    if (!canvas.isConnected) { running = false; return; }
    if (alpha > 0.01) {
      tick(g, alpha); alpha *= 0.985;
      draw();
      requestAnimationFrame(loop);
    } else {
      running = false;
      if (!userMovedCamera && !settledOnce) { settledOnce = true; fit(true); } else draw();
    }
  }
  function reheat(a = 0.3) {
    alpha = Math.max(alpha, a);
    if (!running) { running = true; requestAnimationFrame(loop); }
  }

  // ---- Érintés / egér ----
  const pts = new Map();
  let mode = null; // 'pan' | 'drag' | 'pinch'
  let dragNode = null;
  let start = null;
  let pinch = null;

  const toWorld = (x, y) => ({ x: (x - cam.tx) / cam.s, y: (y - cam.ty) / cam.s });
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hit = (p) => {
    const w = toWorld(p.x, p.y);
    let best = null, bestD = Infinity;
    for (const n of g.nodes) {
      const d = Math.hypot(n.x - w.x, n.y - w.y);
      const tol = n.r + 10 / cam.s; // nagyobb érintési terület
      if (d < tol && d < bestD) { best = n; bestD = d; }
    }
    return best;
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, p);
    if (hint) hint.classList.add('hide');
    if (pts.size === 1) {
      start = { ...p, t: performance.now(), moved: 0 };
      dragNode = hit(p);
      mode = dragNode ? 'drag' : 'pan';
      if (dragNode) dragNode.fixed = true;
    } else if (pts.size === 2) {
      if (dragNode) { dragNode.fixed = false; dragNode = null; }
      const [a, b] = Array.from(pts.values());
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: { ...cam } };
      mode = 'pinch';
      if (start) start.moved = 999;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, p);
    if (start) start.moved = Math.max(start.moved, Math.hypot(p.x - start.x, p.y - start.y));
    if (mode === 'pinch' && pts.size >= 2) {
      const [a, b] = Array.from(pts.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = Math.min(6, Math.max(0.15, pinch.cam.s * (d / pinch.d)));
      const wx = (pinch.mid.x - pinch.cam.tx) / pinch.cam.s;
      const wy = (pinch.mid.y - pinch.cam.ty) / pinch.cam.s;
      cam.s = s; cam.tx = mid.x - wx * s; cam.ty = mid.y - wy * s;
      userMovedCamera = true;
      draw();
    } else if (mode === 'drag' && dragNode && start.moved > 4) {
      const w = toWorld(p.x, p.y);
      dragNode.x = w.x; dragNode.y = w.y;
      reheat(0.25);
      draw();
    } else if (mode === 'pan') {
      cam.tx += p.x - prev.x; cam.ty += p.y - prev.y;
      userMovedCamera = true;
      draw();
    }
  });

  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      const isTap = start && start.moved < 8 && performance.now() - start.t < 500;
      if (dragNode) dragNode.fixed = false;
      if (isTap && e.type === 'pointerup') {
        const n = dragNode || hit(start);
        if (n) { selected = n; draw(); openNode(n); } else if (selected) { selected = null; draw(); }
      }
      mode = null; dragNode = null; start = null; pinch = null;
    } else if (pts.size === 1 && mode === 'pinch') {
      // egy ujj maradt: folytatás mozgatással
      mode = 'pan';
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    const f = Math.exp(-e.deltaY * 0.0015);
    const s = Math.min(6, Math.max(0.15, cam.s * f));
    const w = toWorld(p.x, p.y);
    cam.s = s; cam.tx = p.x - w.x * s; cam.ty = p.y - w.y * s;
    userMovedCamera = true;
    draw();
  }, { passive: false });

  $('[data-fit]', view).addEventListener('click', () => { userMovedCamera = false; fit(true); });

  function openNode(n) {
    const sorted = [...n.dreams].sort((a, b) => b.date.localeCompare(a.date));
    const partners = [...n.neighbors].map((m) => {
      const e = g.edges.find((x) => (x.na === n && x.nb === m) || (x.nb === n && x.na === m));
      return { m, w: e ? e.w : 0 };
    }).sort((a, b) => b.w - a.w).slice(0, 8);
    sheet(
      `<span class="sheet-dot" style="background:${CAT_COLOR[n.cat]}"></span>${esc(n.name)}`,
      `<p class="muted">${CAT_LABEL[n.cat]} · ${n.count} álomban szerepel</p>
       ${partners.length ? `<div class="field-label">Gyakran együtt vele</div><div class="chips partner-chips">
         ${partners.map(({ m, w }) => `<span class="chip tagchip" style="--c:${CAT_COLOR[m.cat]}">${esc(m.name)} <small>${w}×</small></span>`).join('')}
       </div>` : ''}
       <div class="sheet-list">${sorted.map(dreamCard).join('')}</div>
       <a class="btn ghost" href="#/journal" data-filter-journal>Megnyitás a naplóban szűrve</a>`
    );
    const link = document.querySelector('[data-filter-journal]');
    if (link) link.addEventListener('click', () => setTagFilter(n.cat, n.name));
  }

  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  // a nézet elhagyásakor a figyelő leáll
  const stopIfGone = () => { if (!canvas.isConnected) { ro.disconnect(); window.removeEventListener('hashchange', stopIfGone); } };
  window.addEventListener('hashchange', stopIfGone);

  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  reheat(alpha);
}
