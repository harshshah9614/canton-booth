'use strict';
/* Canton booth app - offline-first PWA. Everything is saved on the phone first (IndexedDB), then uploaded to the
   team's Google Drive (Apps Script backend in config.js) whenever there is internet. */

const VERSION = '2.2.0';
const API = ((window.BOOTH_CONFIG || {}).api || '').trim();
const OPTIMIZE_MAX = 2560;           // longest side for "Optimized" uploads
const OPTIMIZE_OVER = 1.5 * 1024 * 1024;
const MAX_FILE = 30 * 1024 * 1024;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?|dng)$/i;

// ---------- tiny helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}
const put = (el, ...kids) => el.replaceChildren(...kids.flat(9).filter(k => k != null && k !== false));
function svg(path, size = 22) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  for (const d of [].concat(path)) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); }
  return s;
}
const ICON = {
  route: ['M3 6h4l3 12h4l3-12h4'], search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  notes: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'], plus: ['M12 5v14', 'M5 12h14'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  back: ['M15 18l-6-6 6-6'], card: ['M3 5h18v14H3z', 'M7 10h4', 'M7 14h7', 'M15 9h3v3h-3z'], box: ['M21 8l-9-5-9 5 9 5 9-5z', 'M3 8v8l9 5 9-5V8', 'M12 13v8'],
  camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  expand: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'], booth: ['M3 21V8l9-5 9 5v13', 'M9 21v-6h6v6'],
  sync: ['M21 12a9 9 0 1 1-2.6-6.4L21 8', 'M21 3v5h-5'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  qr: ['M3 3h6v6H3z', 'M15 3h6v6h-6z', 'M3 15h6v6H3z', 'M15 15h2v2h-2z', 'M19 15h2', 'M15 19h2', 'M19 19h2v2'],
  image: ['M3 5h18v14H3z', 'M8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M21 16l-5-5L5 19'],
};
const DASH_PAGES = [
  ['cc.html', 'Command Centre', 'Shortlist by walking order, venue maps, routes, Alibaba / 365 summary'],
  ['itinerary.html', 'Itinerary', 'Day sheets with hall maps, route arrows and walk times'],
  ['opportunities.html', 'Opportunity Radar', 'Every product opportunity with score, margin, MOQ and details'],
  ['canada.html', 'Canada Focus', 'Canada products, booth specs, evidence and economics'],
  ['alibaba.html', 'Alibaba & CF Award', 'Alibaba top suppliers, top products, CF Award winners, 365 checks'],
  ['factory-visits.html', 'Factory Visits', 'Visit plan and factory-audit checklist'],
  ['toolkit.html', 'Toolkit', 'Negotiation scripts, questions, phrases and checklists'],
  ['fair-map.html', 'Fair Map', 'Official venue maps, section legends, every hall map, booth finder'],
  ['restaurants.html', 'Restaurant Guide', 'Vegetarian & vegan restaurants near the hotel - booking, distance, Chinese names'],
];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
const pad = n => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const ago = iso => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const kb = n => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const store = {
  get: k => localStorage.getItem('cb_' + k) || '', set: (k, v) => localStorage.setItem('cb_' + k, v), del: k => localStorage.removeItem('cb_' + k),
  json: k => { try { return JSON.parse(localStorage.getItem('cb_' + k) || 'null'); } catch (e) { return null; } },
  setJson: (k, v) => localStorage.setItem('cb_' + k, JSON.stringify(v)),
};

// ---------- IndexedDB: visits + photos live on the phone until uploaded ----------
const DB = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('canton-booth', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('visits')) d.createObjectStore('visits', { keyPath: 'client_id' });
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'photo_id' }).createIndex('client_id', 'client_id');
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'photo_id' });   // photo files, kept apart so startup stays fast
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (name, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(name, mode);
      const req = fn(t.objectStore(name));
      let out;
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => rej(t.error);
    });
  };
  return {
    all: name => run(name, 'readonly', s => s.getAll()),
    get: (name, key) => run(name, 'readonly', s => s.get(key)),
    put: (name, val) => run(name, 'readwrite', s => s.put(val)),
    del: (name, key) => run(name, 'readwrite', s => s.delete(key)),
    photosOf: id => run('photos', 'readonly', s => s.index('client_id').getAll(id)),
  };
})();
async function photoBlob(p) {
  const b = await DB.get('blobs', p.photo_id);
  return (b && b.blob) || p.blob || null;
}
async function dropPhoto(id) {
  await DB.del('photos', id);
  await DB.del('blobs', id);
}

// ---------- state ----------
const S = {
  pass: store.get('pass'), who: store.get('who'), quality: store.get('quality') || 'optimized',
  data: store.json('data'), team: store.json('team') || [], lastSync: store.get('lastSync'), lastError: '',
  tab: 'plan', day: null, find: '', findFilter: 'all', notesFilter: 'all',
  visits: [], photos: [], syncing: false, form: null,
};

async function loadLocal() {
  S.visits = await DB.all('visits');
  S.photos = (await DB.all('photos')).map(({ blob, ...rest }) => rest);
}
const pendingCount = () => S.visits.filter(v => v.sync !== 'synced').length + S.photos.filter(p => p.sync === 'pending' || p.sync === 'error').length;

function allVisits() {
  const by = {};
  for (const v of S.team) by[v.client_id] = { ...v, sync: 'synced', team: v.recorded_by !== S.who };
  for (const v of S.visits) by[v.client_id] = { ...by[v.client_id], ...v, team: false };
  return Object.values(by);
}
const visitsForSupplier = id => allVisits().filter(v => id && String(v.supplier_id) === String(id));
const supplierById = id => (S.data && S.data.suppliers || []).find(s => String(s.id) === String(id));
function supTags(s) {
  return [
    h('span', { class: 'tag' + (s.shortlist ? '' : ' warn') }, s.shortlist ? 'Shortlist' : 'Backup'),
    s.tier === 'X' ? h('span', { class: 'tag bad' }, 'Tier X \u00b7 trader') : null,
    s.confirmed_140th && s.confirmed_140th !== 'yes' ? h('span', { class: 'tag bad' }, s.confirmed_140th === 'no' ? 'Not at the 140th fair' : '140th booth unconfirmed') : null,
  ];
}
function hallOf(booth) { const m = /^\s*(\d{1,2})\.(\d)/.exec(booth || ''); return m ? { hall: +m[1], floor: +m[2] } : null; }
function showHallMap(booth) {
  const hf = hallOf(booth);
  if (!hf) return;
  const ed = h('div', { class: 'editor' },
    h('div', { class: 'row' }, h('b', {}, `Hall ${hf.hall} \u00b7 floor ${hf.floor} \u00b7 booth ${String(booth).split(',')[0]}`),
      h('button', { class: 'btn', style: 'width:auto;padding:9px 16px', onclick: () => ed.remove() }, 'Close')),
    h('div', { style: 'flex:1;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y pinch-zoom;padding-top:10px' },
      h('img', { src: `static/hall_maps/hall_${hf.hall}.svg`, alt: `Hall ${hf.hall} map`, style: 'width:100%;height:auto;background:#fff;border-radius:10px',
        onerror: e => e.target.replaceWith(h('p', { class: 'hint' }, 'This hall map is not on the phone - open Dashboard \u2192 Fair Map.')) }),
      h('p', { class: 'hint' }, 'Pinch to zoom. Full venue maps and the booth finder are in Dashboard \u2192 Fair Map.')));
  document.body.append(ed);
}
function drafts() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('cb_draft_')) continue;
    const d = store.json(k.slice(3));
    if (d) out.push({ ...d, client_id: k.slice(9) });
  }
  return out;
}

// ---------- network ----------
async function api(action, body = {}, timeout = 30000) {
  if (!API) throw Object.assign(new Error('The app is not connected to Google Drive yet (config.js).'), { config: true });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(API, { method: 'POST', redirect: 'follow', signal: ctrl.signal, cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, code: S.pass, ...body }) });
  } catch (e) {
    throw Object.assign(new Error('No connection to Google'), { net: true });
  } finally {
    clearTimeout(timer);
  }
  let j;
  try { j = await res.json(); } catch (e) {
    throw Object.assign(new Error(`Google returned an unexpected page (HTTP ${res.status}) - check the deployment access is "Anyone".`), { net: true });
  }
  if (!j.ok) throw Object.assign(new Error(j.error || 'Server error'), { auth: !!j.auth });
  return j;
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

function visitPayload(v) {
  const keys = ['client_id', 'saved_at', 'recorded_by', 'supplier_id', 'supplier_name', 'on_list', 'phase', 'booth', 'category', 'status',
    'rating', 'contact_name', 'wechat', 'phone', 'email', 'products', 'notes', 'fob_price', 'moq', 'lead_time', 'sample', 'next_step'];
  return Object.fromEntries(keys.map(k => [k, v[k] == null ? '' : v[k]]));
}

// only a bad file or missing name can never succeed; busy/lock/server errors keep retrying every minute
const permanent = e => /not a photo|larger than 30 MB|Empty photo|required|id missing|missing on this phone/i.test(e.message || '');

async function sync(manual) {
  if (S.syncing || !S.pass) return;
  if (!navigator.onLine && !manual) { renderStatus(); return; }
  S.syncing = true; S.lastError = ''; renderStatus();
  let uploaded = 0;
  try {
    if (manual) {
      for (const name of ['visits', 'photos']) for (const x of (await DB.all(name)).filter(r => r.sync === 'error')) { x.attempts = 0; await DB.put(name, x); }
    }
    for (const v of (await DB.all('visits')).filter(x => x.sync === 'pending' || (x.sync === 'error' && (x.attempts || 0) < 5))) {
      try {
        const r = await api('visit', { visit: visitPayload(v) }, 120000);
        Object.assign(v, { sync: 'synced', folder: r.folder, error: '' });
        S.netDown = false; uploaded++;
      } catch (e) {
        if (e.net || e.auth || e.config) throw e;
        Object.assign(v, { sync: 'error', error: e.message, attempts: (v.attempts || 0) + (permanent(e) ? 1 : 0) });
      }
      const now = await DB.get('visits', v.client_id);
      if (now && now.updated_local === v.updated_local) await DB.put('visits', v);   // edited while uploading: keep the newer copy pending
    }
    const visits = Object.fromEntries((await DB.all('visits')).map(v => [v.client_id, v]));
    // smallest first, so one huge original on a weak connection cannot hold up the rest
    const queue = (await DB.all('photos')).filter(x => x.sync === 'pending' || (x.sync === 'error' && (x.attempts || 0) < 5))
      .sort((a, b) => (a.size || 0) - (b.size || 0));
    for (const p of queue) {
      const v = visits[p.client_id];
      if (!v || v.sync !== 'synced') continue;              // its visit row must exist first
      try {
        const blob = await photoBlob(p);
        if (!blob) throw new Error('Photo file missing on this phone');
        const data = await blobToBase64(blob);
        const r = await api('photo', { photo: { photo_id: p.photo_id, client_id: p.client_id, kind: p.kind, name: p.name, mime: p.mime, data,
          supplier_id: v.supplier_id, supplier_name: v.supplier_name, phase: v.phase, booth: v.booth, recorded_by: v.recorded_by } },
          180000 + Math.round(blob.size / 1024) * 40);   // allow ~25 KB/s on slow roaming
        Object.assign(p, { sync: 'synced', url: r.url, error: '' });
        uploaded++;
      } catch (e) {
        if (e.net || e.auth || e.config) throw e;
        Object.assign(p, { sync: 'error', error: e.message, attempts: (p.attempts || 0) + (permanent(e) ? 1 : 0) });
      }
      await DB.put('photos', p);
      await loadLocal(); renderStatus();
    }
    if (manual || uploaded || Date.now() - (S.teamAt || 0) > 5 * 60000) {   // teammates' notes: every 5 min, not every minute
      const t = await api('visits');
      S.team = t.visits || []; store.setJson('team', S.team);
      S.teamAt = Date.now();
    }
    S.netDown = false;
    S.lastSync = new Date().toISOString(); store.set('lastSync', S.lastSync);
  } catch (e) {
    if (e.auth) { signOut(e.message); return; }
    S.netDown = !!e.net;
    S.lastError = e.message;
  } finally {
    S.syncing = false;
    await loadLocal();
    renderStatus();
    const typing = document.activeElement && root.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (!S.form && !typing) { const y = window.scrollY; render(); window.scrollTo(0, y); }
  }
}

async function refreshItinerary() {
  const r = await api('data');
  S.data = r.data; S.team = r.visits || [];
  store.setJson('data', S.data); store.setJson('team', S.team);
}

async function downloadDashboard() {
  const r = await api('pages', {}, 180000);
  const cache = await caches.open('canton-dash');
  for (const [name, html] of Object.entries(r.pages.pages || {})) {
    await cache.put(new URL('d/' + name, location.href).href, new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  }
  await cache.put(new URL('d/_index.json', location.href).href, new Response(JSON.stringify(r.pages.index || []), { headers: { 'Content-Type': 'application/json' } }));
  S.index = r.pages.index || [];
  store.set('pagesAt', r.pages.generated || stamp());
}
async function loadIndex() {
  if (S.index) return S.index;
  try {
    const hit = await (await caches.open('canton-dash')).match(new URL('d/_index.json', location.href).href);
    S.index = hit ? await hit.json() : [];
  } catch (e) { S.index = []; }
  return S.index;
}

// ---------- photos: every format accepted; optimized copies only when the browser can decode them ----------
function decodable(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}
async function prepare(file) {
  const name = file.name || 'photo';
  const mime = file.type || '';
  if (!/^image\//.test(mime) && !IMAGE_EXT.test(name)) throw new Error(`${name} is not a photo`);
  if (file.size > MAX_FILE) throw new Error(`${name} is larger than 30 MB`);
  let blob = file, outMime = mime, outName = name, preview = false;
  const img = await decodable(file);
  if (img) {
    preview = true;
    const big = Math.max(img.naturalWidth, img.naturalHeight);
    const keepOriginal = S.quality === 'original' || /gif$/i.test(mime) || (big <= OPTIMIZE_MAX && file.size <= OPTIMIZE_OVER);
    if (!keepOriginal) {
      const sc = Math.min(1, OPTIMIZE_MAX / big);
      const c = h('canvas', { width: Math.round(img.naturalWidth * sc), height: Math.round(img.naturalHeight * sc) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
      if (jpg && jpg.size < file.size) { blob = jpg; outMime = 'image/jpeg'; outName = name.replace(/\.[^.]+$/, '') + '.jpg'; }
    }
    URL.revokeObjectURL(img.src);
  }
  return { blob, mime: outMime, name: outName, size: blob.size, preview };
}

// ---------- rendering: shell ----------
const root = $('#root');
let toastTimer;
function toast(msg) {
  const old = $('.toast'); if (old) old.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
}
function dialog(title, text, actions) {
  return new Promise(res => {
    const close = v => { scrim.remove(); res(v); };
    const scrim = h('div', { class: 'scrim', onclick: e => { if (e.target === scrim) close(null); } },
      h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' }, h('h2', {}, title), text ? h('p', {}, text) : null,
        actions.map(a => h('button', { class: 'btn ' + (a.style || ''), onclick: () => close(a.value) }, a.label))));
    document.body.append(scrim);
  });
}

function statusChip() {
  const n = pendingCount();
  const offline = !navigator.onLine || S.netDown;
  let cls = 'sync', text = 'All saved to Drive';
  if (S.syncing) { cls += ' run'; text = 'Syncing\u2026'; }
  else if (n && offline) { cls += ' wait'; text = `${n} saved offline`; }
  else if (S.lastError && n) { cls += ' bad'; text = `${n} waiting \u00b7 retry`; }
  else if (n) { cls += ' wait'; text = `${n} waiting`; }
  else if (offline) { text = 'Offline \u00b7 all saved'; }
  return h('button', { class: cls, id: 'sync', onclick: openSyncSheet, 'aria-label': 'Sync status' }, h('span', { class: 'dot' }), text);
}
function renderStatus() { const old = $('#sync'); if (old) old.replaceWith(statusChip()); }

function render() {
  if (!S.pass || !S.who || !S.data) return renderWelcome();
  const titles = { plan: 'Itinerary', find: 'Search', notes: 'Booth notes', dash: 'Dashboard' };
  put(root,
    h('header', { class: 'top' }, h('h1', {}, titles[S.tab]), statusChip(),
      h('button', { class: 'icon-btn', onclick: openSettings, 'aria-label': 'Settings' }, svg(ICON.gear, 20))),
    h('main', {}, S.tab === 'plan' ? viewPlan() : S.tab === 'find' ? viewFind() : S.tab === 'dash' ? viewDash() : viewNotes()),
    h('nav', { class: 'tabs' },
      tabBtn('dash', 'Dashboard', ICON.grid), tabBtn('plan', 'Itinerary', ICON.route),
      h('button', { class: 'fab', onclick: () => openForm({}), 'aria-label': 'New supplier note' }, svg(ICON.plus, 26)),
      tabBtn('find', 'Search', ICON.search), tabBtn('notes', 'Notes', ICON.notes)));
}
function tabBtn(id, label, icon) {
  return h('button', { class: 'tab' + (S.tab === id ? ' on' : ''), onclick: () => { S.tab = id; render(); window.scrollTo(0, 0); } }, svg(icon, 22), label);
}

// ---------- itinerary ----------
function nowNext() {
  const days = S.data.days || [];
  const today = stamp().slice(0, 10), now = stamp().slice(11);
  const d = days.find(x => x.date === today);
  if (!d) {
    const next = days.find(x => x.date > today);
    if (!next) return null;
    const n = Math.round((new Date(next.date) - new Date(today)) / 86400000);
    return h('div', { class: 'card now' }, h('div', { class: 'eyebrow', style: 'margin:0 0 4px' }, 'Next walking day'),
      h('div', { class: 'booth' }, `${next.label} \u00b7 ${next.display_date}`), h('div', { class: 'meta' }, `in ${n} day${n === 1 ? '' : 's'} \u00b7 ${next.count} stops \u00b7 ${next.hall_span}`));
  }
  const seen = new Set(allVisits().map(v => String(v.supplier_id)));
  const s = d.stops.find(x => !seen.has(String(x.id)) && (x.time_end || '99') >= now) || d.stops.find(x => !seen.has(String(x.id)));
  if (!s) return h('div', { class: 'card now' }, h('div', { class: 'booth' }, 'All stops for today have notes \u2713'));
  return h('button', { class: 'card now stop', onclick: () => openForm({ supplier: { ...supplierById(s.id), ...s, phase: d.phase } }) },
    h('div', { class: 'when' }, h('b', {}, s.time_start || ''), h('div', { class: 'num' }, s.seq)),
    h('div', { class: 'body' }, h('div', { class: 'eyebrow', style: 'margin:0 0 2px' }, 'Next stop'),
      h('div', { class: 'booth' }, (s.booth || '').split(',')[0]), h('div', { class: 'name' }, s.name_en),
      h('div', { class: 'meta' }, [s.walk_from_prev ? `~${s.walk_from_prev} min walk from the previous stop` : '', s.subcategory || s.category].filter(Boolean).join(' \u00b7 '))));
}

function viewPlan() {
  const days = S.data.days || [];
  if (S.day == null) {
    const today = stamp().slice(0, 10);
    S.day = Math.max(0, days.findIndex(d => d.date === today));
  }
  const d = days[S.day];
  if (!d) return h('div', { class: 'empty' }, 'No itinerary loaded yet.');
  const seen = new Set(allVisits().map(v => String(v.supplier_id)));
  const done = d.stops.filter(s => seen.has(String(s.id))).length;
  const list = [];
  d.stops.forEach((s, i) => {
    if (i && s.walk_from_prev) list.push(h('div', { class: 'walk' }, `\u2193 ~${s.walk_from_prev} min walk`));
    const v = seen.has(String(s.id));
    list.push(h('button', { class: 'stop', onclick: () => openForm({ supplier: { ...supplierById(s.id), ...s, phase: d.phase } }) },
      h('div', { class: 'when' }, h('b', {}, s.time_start || ''), h('div', { class: 'num' + (v ? ' done' : '') }, v ? '\u2713' : s.seq)),
      h('div', { class: 'body' }, h('div', { class: 'booth' }, (s.booth || 'Booth TBC').split(',')[0]), h('div', { class: 'name' }, s.name_en),
        h('div', { class: 'meta' }, s.subcategory || s.category || ''),
        h('div', { class: 'tags' }, s.must_see ? h('span', { class: 'tag' }, 'Must see') : null,
          s.canada_must_see ? h('span', { class: 'tag ca' }, 'Canada ' + s.canada_must_see) : null,
          v ? h('span', { class: 'tag ok' }, 'Notes saved') : null))));
    if (s.lunch_after) list.push(h('div', { class: 'lunch' }, 'Lunch break 12:30 \u2013 13:30'));
  });
  return [
    nowNext(),
    h('div', { class: 'days' }, days.map((x, i) => {
      const n = x.stops.filter(s => seen.has(String(s.id))).length;
      return h('button', { class: 'day' + (i === S.day ? ' on' : ''), onclick: () => { S.day = i; render(); } },
        h('b', {}, x.label.replace('Phase ', 'P').replace(' \u00b7 Day ', ' \u00b7 D')), h('span', {}, x.display_date.slice(0, 10)),
        h('div', { class: 'bar' }, h('i', { style: `width:${x.count ? Math.round(100 * n / x.count) : 0}%` })));
    })),
    h('div', { class: 'card' }, h('div', { class: 'summary' },
      h('div', { class: 'kpi' }, h('b', {}, `${done}/${d.count}`), h('span', {}, 'visited')),
      h('div', { class: 'kpi' }, h('b', {}, `~${d.walk_total}m`), h('span', {}, 'walking (est.)')),
      h('div', { class: 'kpi' }, h('b', {}, d.display_date.slice(0, 3)), h('span', {}, d.display_date.slice(4)))),
      h('div', { class: 'halls' }, d.hall_span)),
    list,
  ];
}

// ---------- suppliers ----------
function viewFind() {
  const input = h('input', { class: 'i', type: 'search', placeholder: 'Suppliers, products, notes, anything in the dashboard', value: S.find, autocomplete: 'off',
    oninput: e => { S.find = e.target.value; renderResults(); } });
  return [
    h('div', { class: 'search' }, svg(ICON.search, 18), input),
    h('div', { class: 'seg', style: 'margin-top:10px' }, [['all', 'All'], ['short', 'Shortlist'], ['back', 'Backups']].map(([k, l]) =>
      h('button', { class: S.findFilter === k ? 'on' : '', onclick: e => { S.findFilter = k;
        [...e.target.parentNode.children].forEach(b => b.classList.toggle('on', b === e.target)); renderResults(); } }, l))),
    resultsBox(),
    h('div', { class: 'card' }, h('div', { class: 'section-title' }, 'Not on our list?'),
      h('div', { class: 'hint' }, 'Add any supplier you meet - notes and photos still go to Drive.'),
      h('button', { class: 'btn', style: 'margin-top:10px', onclick: () => openForm({}) }, svg(ICON.plus, 18), 'New supplier')),
  ];
}
function renderResults() { const old = $('#results'); if (old) old.replaceWith(resultsBox()); }
function resultsBox() {
  const q = S.find.trim().toLowerCase();
  if (q.length >= 2 && !S.index) loadIndex().then(renderResults);
  const words = q.split(/\s+/).filter(Boolean);
  const match = text => words.every(w => String(text || '').toLowerCase().includes(w));
  const all = (S.data.suppliers || []).filter(s => S.findFilter === 'all' || (S.findFilter === 'short' ? s.shortlist : !s.shortlist));
  const hits = q ? all.filter(s => match([s.name_en, s.name_cn, s.booth, s.category, s.subcategory].join(' '))) : all;
  const notes = q.length >= 2 ? allVisits().filter(v => match([v.supplier_name, v.notes, v.products, v.contact_name, v.next_step, v.wechat].join(' '))).slice(0, 20) : [];
  const dash = q.length >= 2 ? (S.index || []).filter(e => match(e.h + ' ' + e.t)).slice(0, 40) : [];
  return h('div', { id: 'results' },
    notes.length ? [h('div', { class: 'eyebrow' }, `In booth notes (${notes.length})`), notes.map(v => h('button', { class: 'result', onclick: () => openForm({ visit: v }) },
      h('div', { class: 'booth' }, v.supplier_name), h('div', { class: 'note-text' }, v.notes || v.products || '')))] : null,
    dash.length ? [h('div', { class: 'eyebrow' }, `In the dashboard (${dash.length}${dash.length === 40 ? '+' : ''})`), dash.map(e =>
      h('a', { class: 'result', href: `d/${e.p}#${e.id}`, style: 'text-decoration:none;color:inherit' },
        h('div', { class: 'meta' }, [e.pt, e.h].filter(Boolean).join(' \u203a ')), h('div', { class: 'note-text' }, e.t)))] : null,
    h('div', { class: 'eyebrow' }, `${hits.length} supplier${hits.length === 1 ? '' : 's'}`),
    hits.slice(0, 80).map(s => {
      const v = visitsForSupplier(s.id).length;
      return h('button', { class: 'result', onclick: () => openForm({ supplier: s }) },
        h('div', { class: 'booth' }, s.name_en), s.name_cn ? h('div', { class: 'meta' }, s.name_cn) : null,
        h('div', { class: 'meta' }, `Phase ${s.phase || '?'} \u00b7 ${(s.booth || 'booth TBC').split(',')[0]} \u00b7 ${s.subcategory || s.category || ''}`),
        h('div', { class: 'tags' }, supTags(s),
          v ? h('span', { class: 'tag ok' }, `${v} note${v > 1 ? 's' : ''}`) : null));
    }),
    hits.length > 80 ? h('div', { class: 'hint' }, 'Showing the first 80 - type to narrow down.') : null,
    q && !hits.length ? h('div', { class: 'empty' }, 'No match - add them as a new supplier below.') : null);
}

// ---------- dashboard (read-only copies of the desktop tabs, stored on the phone) ----------
function viewDash() {
  const at = store.get('pagesAt');
  const ready = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  const dl = h('button', { class: 'btn' + (at ? ' ghost' : ''), onclick: async () => {
    dl.disabled = true; dl.textContent = 'Downloading\u2026';
    try { await downloadDashboard(); toast('Dashboard saved on this phone'); }
    catch (e) { toast(e.net ? 'No connection - try again on Wi-Fi, roaming or VPN' : e.message); }
    render();
  } }, svg(ICON.sync, 18), at ? 'Update dashboard' : 'Download dashboard');
  return [
    h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Desktop dashboard, offline'),
      h('div', { class: 'hint' }, at ? `Saved on this phone \u00b7 built ${at}. Works without internet. Tap a supplier name in any tab to open its booth notes.`
        : 'Download once (about 2 MB) while you have internet - after that every tab, map and route works offline.'),
      !ready ? h('div', { class: 'hint', style: 'color:var(--warn)' }, 'Close and reopen the app once to finish installing offline mode.') : null,
      h('div', { style: 'margin-top:12px' }, dl)),
    DASH_PAGES.map(([file, title, desc]) => h('a', { class: 'result', href: 'd/' + file, style: 'text-decoration:none;color:inherit' + (at ? '' : ';opacity:.55') },
      h('div', { class: 'booth' }, title), h('div', { class: 'meta' }, desc))),
  ];
}

// ---------- notes ----------
function viewNotes() {
  const followUp = v => !!(v.next_step || v.sample === 'requested' || v.status === 'revisit');
  const list = allVisits().filter(v => S.notesFilter === 'all' || (S.notesFilter === 'mine' ? !v.team : S.notesFilter === 'follow' ? followUp(v) : v.team))
    .sort((a, b) => String(b.updated_local || b.updated_at || b.saved_at).localeCompare(String(a.updated_local || a.updated_at || a.saved_at)));
  const saved = new Set(S.visits.map(v => v.client_id));
  const open = drafts().filter(d => !saved.has(d.client_id));
  return [
    open.length ? [h('div', { class: 'eyebrow' }, 'Unsaved drafts'), open.map(d => h('button', { class: 'note-card', onclick: () => openForm({ draft: d }) },
      h('div', { class: 'booth' }, d._name || d.new_name || 'New supplier'),
      d.notes ? h('div', { class: 'note-text' }, d.notes) : null,
      h('div', { class: 'tags' }, h('span', { class: 'tag warn' }, 'Draft - tap to finish and save'))))] : null,
    h('div', { class: 'seg' }, [['all', 'Everyone'], ['mine', 'Mine'], ['team', 'Team'], ['follow', 'Follow-ups']].map(([k, l]) =>
      h('button', { class: S.notesFilter === k ? 'on' : '', onclick: () => { S.notesFilter = k; render(); } }, l))),
    list.length ? list.map(v => {
      const ph = S.photos.filter(p => p.client_id === v.client_id).length || Number(v.photos || 0);
      return h('button', { class: 'note-card', onclick: () => openForm({ visit: v }) },
        h('div', { class: 'booth' }, v.supplier_name),
        h('div', { class: 'meta' }, [v.booth && String(v.booth).split(',')[0], v.recorded_by, v.saved_at].filter(Boolean).join(' \u00b7 ')),
        v.notes ? h('div', { class: 'note-text' }, v.notes) : null,
        h('div', { class: 'tags' }, statusTag(v.status), v.rating ? h('span', { class: 'tag' }, '\u2605'.repeat(Number(v.rating))) : null,
          v.next_step ? h('span', { class: 'tag warn' }, 'Next: ' + String(v.next_step).slice(0, 40)) : null,
          v.sample === 'requested' ? h('span', { class: 'tag warn' }, 'Sample requested') : null,
          ph ? h('span', { class: 'tag' }, `${ph} photo${ph > 1 ? 's' : ''}`) : null,
          !v.supplier_id ? h('span', { class: 'tag warn' }, 'New supplier') : null,
          v.sync === 'synced' ? null : h('span', { class: 'tag ' + (v.sync === 'error' ? 'bad' : 'warn') }, v.sync === 'error' ? 'Upload problem' : 'Waiting to upload')));
    }) : h('div', { class: 'empty' }, 'No booth notes yet. Tap a stop in the itinerary or the + button.'),
  ];
}
function statusTag(s) {
  return s === 'revisit' ? h('span', { class: 'tag warn' }, 'Come back') : s === 'skipped' ? h('span', { class: 'tag bad' }, 'Skipped') : h('span', { class: 'tag ok' }, 'Visited');
}

// ---------- the booth form ----------
const TEXT_FIELDS = ['contact_name', 'wechat', 'phone', 'email', 'products', 'notes', 'fob_price', 'moq', 'lead_time', 'next_step', 'new_name', 'new_booth', 'new_category'];

async function openForm({ supplier, visit, draft: fromDraft }) {
  if (visit && visit.team) {
    // a teammate's note: open my own note for that supplier, or show theirs read-only for a new supplier
    const s = visit.supplier_id ? supplierById(visit.supplier_id) : null;
    if (s) return openForm({ supplier: s });
    return dialog(visit.supplier_name, `${visit.recorded_by || 'Teammate'} \u00b7 ${visit.saved_at || ''}\n\n${visit.notes || '(no notes)'}`, [{ label: 'Close', value: null, style: 'ghost' }]);
  }
  let sup = supplier || null;
  let existing = visit || null;
  if (fromDraft && fromDraft._sid) sup = supplierById(fromDraft._sid) || null;
  if (!sup && existing && existing.supplier_id) sup = supplierById(existing.supplier_id) || null;
  if (sup && !existing) existing = visitsForSupplier(sup.id).find(v => !v.team) || null;
  const pending = !existing && sup ? drafts().find(d => String(d._sid) === String(sup.id)) : null;
  const client_id = existing ? existing.client_id : fromDraft ? fromDraft.client_id : pending ? pending.client_id : uid();
  const draft = store.json('draft_' + client_id);
  const base = { status: 'visited', sample: 'none', rating: '', ...(existing || {}) };
  const f = {
    client_id, sup, existing, values: { ...base, ...(draft || {}), _sid: sup ? String(sup.id) : '', _name: sup ? sup.name_en : '' }, dirty: !!draft,
    phase: (sup && sup.phase) || (existing && existing.phase) || (draft && draft.phase) || '',
    photos: (await DB.photosOf(client_id)).filter(p => p.sync !== 'discarded'),
  };
  if (!sup && existing && !draft) Object.assign(f.values, { new_name: existing.supplier_name, new_booth: existing.booth, new_category: existing.category });
  S.form = f;
  renderForm();
  if (draft) toast('Restored your unsaved notes');
}

function setVal(k, v) {
  S.form.values[k] = v; S.form.dirty = true;
  store.setJson('draft_' + S.form.client_id, S.form.values);
}

function field(label, key, opts = {}) {
  const attrs = { class: 'i', id: 'f_' + key, value: S.form.values[key] || '', oninput: e => setVal(key, e.target.value), ...opts };
  return [h('label', { class: 'f', for: 'f_' + key }, label), h('input', attrs)];
}

function renderForm() {
  const f = S.form, v = f.values, sup = f.sup;
  const team = sup ? visitsForSupplier(sup.id).filter(x => x.client_id !== f.client_id) : [];
  const notes = h('textarea', { class: 'i', id: 'f_notes', placeholder: 'What did we discuss? Prices, MOQ, materials, capacity, impressions\u2026',
    value: v.notes || '', oninput: e => { setVal('notes', e.target.value); grow(e.target); } });
  const sheet = h('div', { class: 'sheet', id: 'form' },
    h('header', { class: 'top' }, h('button', { class: 'icon-btn', onclick: closeForm, 'aria-label': 'Back' }, svg(ICON.back, 20)),
      h('h1', {}, sup ? sup.name_en : (v.new_name || 'New supplier'))),
    h('main', {},
      sup ? h('div', { class: 'card' },
        h('div', { class: 'booth' }, `Phase ${f.phase || '?'} \u00b7 ${sup.booth || 'booth TBC'}`),
        sup.name_cn ? h('div', { class: 'meta' }, sup.name_cn) : null,
        h('div', { class: 'meta' }, [sup.category, sup.subcategory].filter(Boolean).join(' \u00b7 ')),
        h('div', { class: 'tags' }, supTags(sup),
          sup.canada_must_see ? h('span', { class: 'tag ca' }, 'Canada ' + sup.canada_must_see) : null),
        sup.next_action ? h('div', { class: 'ask' }, h('b', {}, 'Ask / check: '), sup.next_action) : null,
        hallOf(sup.booth) ? h('button', { class: 'btn ghost', style: 'margin-top:10px', onclick: () => showHallMap(sup.booth) }, `Hall ${hallOf(sup.booth).hall} map \u00b7 where is this booth?`) : null)
      : h('div', { class: 'card' }, h('div', { class: 'section-title' }, 'New supplier'),
        field('Company name *', 'new_name', { autocomplete: 'organization' }),
        h('div', { class: 'grid2' }, h('div', {}, field('Booth', 'new_booth', { placeholder: 'e.g. 12.2A19' })),
          h('div', {}, h('label', { class: 'f' }, 'Phase'), seg('phase_new', [['2', 'Phase 2'], ['3', 'Phase 3']], f.phase, x => { f.phase = x; setVal('phase', x); }))),
        field('Category / products', 'new_category')),
      questionsCard(),
      h('div', { class: 'card' },
        h('div', { class: 'section-title' }, 'Outcome'),
        seg('status', [['visited', 'Visited'], ['revisit', 'Come back'], ['skipped', 'Skipped']], v.status, x => setVal('status', x), 'status'),
        h('label', { class: 'f' }, 'Rating'),
        h('div', { class: 'stars', id: 'stars' }, [1, 2, 3, 4, 5].map(n => h('button', { class: Number(v.rating) >= n ? 'on' : '', 'aria-label': `${n} stars`,
          onclick: () => { setVal('rating', Number(v.rating) === n ? '' : String(n)); renderForm(); } }, '\u2605')))),
      h('div', { class: 'card' },
        h('div', { class: 'section-title' }, 'Contact'),
        h('button', { class: 'btn ghost qr-btn', onclick: openScanner }, svg(ICON.qr, 20), 'Scan QR code (WeChat / business card)'),
        field('Who we met', 'contact_name', { placeholder: 'Name and role' }),
        h('div', { class: 'grid2' }, h('div', {}, field('WeChat', 'wechat')), h('div', {}, field('Phone', 'phone', { type: 'tel', inputmode: 'tel' }))),
        field('Email', 'email', { type: 'email', inputmode: 'email', autocapitalize: 'off' })),
      h('div', { class: 'card' },
        h('div', { class: 'section-title' }, 'Discussion', h('button', { class: 'link', onclick: openEditor }, svg(ICON.expand, 16), ' Full screen')),
        field('Products discussed', 'products'),
        h('label', { class: 'f', for: 'f_notes' }, 'Notes'), notes,
        h('div', { class: 'hint' }, 'Tip: use the microphone on your keyboard to dictate.')),
      h('div', { class: 'card' },
        h('div', { class: 'section-title' }, 'Commercials'),
        h('div', { class: 'grid3' }, h('div', {}, field('FOB price', 'fob_price', { placeholder: 'USD' })), h('div', {}, field('MOQ', 'moq')), h('div', {}, field('Lead time', 'lead_time'))),
        h('label', { class: 'f' }, 'Samples'),
        seg('sample', [['none', 'None'], ['requested', 'Requested'], ['received', 'Received']], v.sample, x => setVal('sample', x)),
        field('Next step', 'next_step', { placeholder: 'e.g. Send quote by 30 Oct' })),
      h('div', { class: 'card' },
        h('div', { class: 'section-title' }, 'Photos', h('span', { class: 'hint' }, S.quality === 'original' ? 'Original quality' : 'Optimized for roaming')),
        h('div', { class: 'photo-actions' },
          photoPicker('card', 'Business card', ICON.card), photoPicker('product', 'Products', ICON.box), photoPicker('booth', 'Booth / other', ICON.camera)),
        h('div', { class: 'thumbs', id: 'thumbs' }, f.photos.map(thumb)),
        h('div', { class: 'hint' }, 'Any photo format: JPG, HEIC, PNG, WebP, GIF, TIFF, RAW (DNG).')),
      team.length ? h('div', { class: 'card' }, h('div', { class: 'section-title' }, 'Team notes'),
        team.map(t => h('div', { class: 'team-note' }, h('b', {}, `${t.recorded_by || 'Teammate'} \u00b7 ${t.saved_at || ''}`), '\n', t.notes || '(no notes)'))) : null,
      deleteBtn(f)),
    h('div', { class: 'savebar' }, h('button', { class: 'btn', onclick: saveForm }, 'Save notes')));
  const old = $('#form');
  if (old) { const y = old.scrollTop; old.replaceWith(sheet); sheet.scrollTop = y; } else document.body.append(sheet);
  grow(notes);
}
function deleteBtn(f) {
  return f.existing ? h('button', { class: 'btn danger', style: 'margin-top:6px', onclick: () => deleteVisit(f) }, 'Delete this note from my phone') : null;
}
function seg(name, opts, cur, onPick, cls) {
  return h('div', { class: 'seg' + (cls ? ' ' + cls : ''), role: 'radiogroup' }, opts.map(([val, label]) =>
    h('button', { class: cur === val ? 'on' : '', 'data-v': val, role: 'radio', 'aria-checked': String(cur === val),
      onclick: () => { onPick(val); renderForm(); } }, label)));
}
// ---------- booth questions (read-only reference) ----------
function questionsCard() {
  const qs = (S.data.questions || {}).screen || [];
  if (!qs.length) return null;
  return h('details', { class: 'card qref', open: true },
    h('summary', {}, 'Booth questions ', h('span', { class: 'hint' }, '10-minute screen')),
    h('ol', {}, qs.map(q => h('li', {}, q))));
}

function grow(t) {
  t.style.height = 'auto';
  t.style.height = Math.min(Math.max(170, t.scrollHeight + 4), Math.round(window.innerHeight * 0.6)) + 'px';
}

function photoPicker(kind, label, icon) {
  const id = 'pick_' + kind;
  return h('label', { for: id }, svg(icon, 22), label,
    h('input', { id, type: 'file', class: 'hidden', multiple: true,
      accept: 'image/*,.heic,.heif,.HEIC,.HEIF,.dng,.DNG,.tif,.tiff,.avif,.webp', onchange: e => addPhotos(e.target, kind) }));
}
async function addPhotos(input, kind) {
  const files = [...input.files];
  input.value = '';
  const added = await addFiles(files, kind);
  if (added) toast(`${added} photo${added > 1 ? 's' : ''} added - tap Save to upload`);
}
async function addFiles(files, kind) {
  let added = 0;
  for (const file of files) {
    try {
      const p = await prepare(file);
      const rec = { photo_id: uid(), client_id: S.form.client_id, kind, name: p.name, mime: p.mime, size: p.size, preview: p.preview,
        sync: 'held', added_at: new Date().toISOString() };
      await DB.put('blobs', { photo_id: rec.photo_id, blob: p.blob });
      await DB.put('photos', rec);
      S.form.photos.push(rec); S.form.dirty = true; added++;
    } catch (e) {
      toast(e.message);
    }
  }
  if (added) {
    store.setJson('draft_' + S.form.client_id, S.form.values);
    renderForm();
  }
  return added;
}
function thumb(p) {
  const label = { card: 'Card', product: 'Product', booth: 'Booth', other: 'Other' }[p.kind] || 'Photo';
  const state = p.sync === 'synced' ? ['ok', '\u2713'] : p.sync === 'error' ? ['bad', '!'] : ['', '\u2191'];
  const box = h('div', { class: 'thumb', title: `${p.name} \u00b7 ${kb(p.size || 0)}` },
    h('div', { class: 'ph' }, (p.name || '').split('.').pop().toUpperCase(), h('br'), kb(p.size || 0)),
    h('span', { class: 'k' }, label),
    p.sync === 'held' ? h('button', { class: 'x', 'aria-label': 'Remove photo', onclick: () => removePhoto(p) }, '\u00d7') : h('span', { class: 's ' + state[0] }, state[1]));
  if (p.preview) photoBlob(p).then(b => {
    if (!b) return;
    const url = URL.createObjectURL(b);
    box.querySelector('.ph').replaceWith(h('img', { src: url, alt: label, onload: () => URL.revokeObjectURL(url) }));
  });
  return box;
}
async function removePhoto(p) {
  await dropPhoto(p.photo_id);
  S.form.photos = S.form.photos.filter(x => x.photo_id !== p.photo_id);
  renderForm();
}

// ---------- QR scanner (WeChat / business cards): decodes on the phone, works offline ----------
let scanSession = null;
let qrDetector;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return new Promise((res, rej) => {
    const s = h('script', { src: 'jsqr.js' });
    s.onload = () => (window.jsQR ? res(window.jsQR) : rej(new Error('QR reader failed to load')));
    s.onerror = () => rej(new Error('QR reader not on this phone yet - open the app once with internet'));
    document.head.append(s);
  });
}
function nativeDetector() {
  if (qrDetector !== undefined) return qrDetector;
  qrDetector = null;
  try { if ('BarcodeDetector' in window) qrDetector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { qrDetector = null; }
  return qrDetector;
}
async function decodeCanvas(c, thorough) {
  const bd = nativeDetector();
  if (bd) {
    try { const r = await bd.detect(c); if (r[0] && r[0].rawValue) return r[0].rawValue; } catch (e) { /* use jsQR */ }
    if (!thorough) return '';
  }
  const jsQR = await loadJsQR();
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
  const r = jsQR(d.data, d.width, d.height, { inversionAttempts: thorough ? 'attemptBoth' : 'dontInvert' });
  return r ? r.data : '';
}
async function decodeImageFile(file) {
  const img = await decodable(file);
  if (!img) return '';
  try {
    for (const max of [1200, 2000, 700]) {
      const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = h('canvas', { width: Math.round(img.naturalWidth * sc), height: Math.round(img.naturalHeight * sc) });
      c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
      const t = await decodeCanvas(c, true);
      if (t) return t;
    }
    return '';
  } finally { URL.revokeObjectURL(img.src); }
}

function openScanner() {
  if (scanSession) return;
  loadJsQR().catch(() => {});
  const video = h('video', { playsinline: '', muted: '', autoplay: '' });
  video.muted = true;
  const msg = h('div', { class: 'scan-msg' }, 'Starting camera\u2026');
  const pickCam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden', onchange: e => scanFiles(e.target) });
  const pickLib = h('input', { type: 'file', accept: 'image/*,.heic,.heif', class: 'hidden', onchange: e => scanFiles(e.target) });
  const box = h('div', { class: 'scan', role: 'dialog', 'aria-label': 'Scan QR code' },
    video, h('div', { class: 'scan-frame' }), msg,
    h('div', { class: 'scan-bar' },
      h('button', { class: 'btn', onclick: () => pickCam.click() }, svg(ICON.camera, 18), 'Take photo'),
      h('button', { class: 'btn ghost', onclick: () => pickLib.click() }, svg(ICON.image, 18), 'From photos'),
      h('button', { class: 'btn ghost', onclick: closeScanner }, 'Cancel')),
    pickCam, pickLib);
  document.body.append(box);
  scanSession = { box, video, msg, stream: null, timer: 0, busy: false, done: false, denied: false };
  startCamera(scanSession);
}
async function startCamera(s) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no camera');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    if (scanSession !== s || s.done) { stream.getTracks().forEach(t => t.stop()); return; }
    s.stream = stream; s.video.srcObject = stream;
    await s.video.play().catch(() => {});
    s.msg.textContent = 'Point the camera at the QR code';
    s.box.classList.remove('nocam');
    scanLoop(s);
  } catch (e) {
    s.denied = e && e.name === 'NotAllowedError';
    s.msg.textContent = 'Camera not available here. Tap Take photo to photograph the QR code, or pick a screenshot from your photos.';
    s.box.classList.add('nocam');
  }
}
function scanLoop(s) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (scanSession !== s || s.done || !s.stream) return;
    const v = s.video;
    if (!s.busy && v.readyState >= 2 && v.videoWidth) {
      s.busy = true;
      try {
        const sc = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth * sc); c.height = Math.round(v.videoHeight * sc);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const text = await decodeCanvas(c, false);
        if (text && scanSession === s && !s.done) {
          const full = h('canvas', { width: v.videoWidth, height: v.videoHeight });
          full.getContext('2d').drawImage(v, 0, 0);
          const shot = await new Promise(r => full.toBlob(r, 'image/jpeg', 0.92));
          return gotCode(text, shot);
        }
      } catch (e) { /* keep scanning */ } finally { s.busy = false; }
    }
    s.timer = setTimeout(tick, 180);
  };
  tick();
}
function stopCamera(s) {
  clearTimeout(s.timer);
  if (s.stream) s.stream.getTracks().forEach(t => t.stop());
  s.stream = null;
}
function closeScanner() {
  const s = scanSession;
  if (!s) return;
  scanSession = null; s.done = true;
  stopCamera(s);
  s.box.remove();
}
async function scanFiles(input) {
  const file = input.files && input.files[0];
  input.value = '';
  const s = scanSession;
  if (!file || !s) return;
  s.msg.textContent = 'Reading the QR code\u2026';
  let text = '';
  try { text = await decodeImageFile(file); } catch (e) { text = ''; s.msg.textContent = e.message; }
  if (scanSession !== s) return;
  if (!text) { s.msg.textContent = 'No QR code found in that photo. Fill the frame with the QR code, keep it sharp, and try again.'; return; }
  gotCode(text, file);
}
async function gotCode(text, blob) {
  if (navigator.vibrate) navigator.vibrate(60);
  closeScanner();
  await applyQr(text, blob);
}
document.addEventListener('visibilitychange', () => {
  const s = scanSession;
  if (!s) return;
  if (document.visibilityState === 'hidden') stopCamera(s);          // free the camera for the phone's own camera app
  else if (!s.stream && !s.denied && !s.done) startCamera(s);
});

const unesc = x => x.replace(/\\n/gi, ' ').replace(/\\([,;:\\])/g, '$1').trim();
const hasCJK = x => /[\u3400-\u9fff]/.test(x);
const isWeChat = u => /^(weixin:\/\/|https?:\/\/([a-z0-9-]+\.)*(wechat\.com|weixin\.qq\.com|wx\.qq\.com)(\/|$))/i.test(u);
function qpDecode(x) {
  const bytes = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] === '=' && /^[0-9A-F]{2}$/i.test(x.substr(i + 1, 2))) { bytes.push(parseInt(x.substr(i + 1, 2), 16)); i += 2; }
    else bytes.push(x.charCodeAt(i) & 0xff);
  }
  try { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); } catch (e) { return x; }
}
function parseVcard(text, out) {
  let body = text.replace(/\r\n?/g, '\n');
  if (/QUOTED-PRINTABLE/i.test(body)) body = body.replace(/=\n/g, '');
  let n = '', title = '';
  for (const line of body.replace(/\n[ \t]/g, '').split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const head = line.slice(0, i), key = head.split(';')[0].replace(/^item\d+\./i, '').toUpperCase();
    let raw = line.slice(i + 1);
    if (/ENCODING=QUOTED-PRINTABLE/i.test(head)) raw = qpDecode(raw);
    const val = unesc(raw);
    if (!val) continue;
    if (key === 'FN') out.name = val;
    else if (key === 'N') n = raw;
    else if (key === 'ORG') out.org = raw.split(';').map(unesc).filter(Boolean).join(' - ');
    else if (key === 'TITLE') title = val;
    else if (key === 'TEL') out.phone.push(val.replace(/^tel:/i, ''));
    else if (key === 'EMAIL') out.email.push(val.replace(/^mailto:/i, ''));
    else if (key === 'URL') out.links.push(val);
    else if (/^X-(WECHAT|WEIXIN|WX)/.test(key) || (key === 'IMPP' && /wechat|weixin/i.test(line))) out.wechat = val.replace(/^(x-apple:|weixin:|wechat:)/i, '');
    else if (key === 'ADR') out.extra.push('Address: ' + raw.split(';').map(unesc).filter(Boolean).join(', '));
    else if (key === 'NOTE') out.extra.push('Note: ' + val);
  }
  if (!out.name && n) {
    const [fam = '', giv = ''] = n.split(';').map(unesc);
    out.name = hasCJK(fam + giv) ? fam + giv : [giv, fam].filter(Boolean).join(' ');
  }
  if (title) out.name = [out.name, title].filter(Boolean).join(', ');
}
function parseMecard(text, out) {
  const body = text.replace(/^mecard:/i, '');
  const parts = [];
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) { cur += body[++i]; continue; }
    if (ch === ';') { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) parts.push(cur);
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i < 0) continue;
    const k = p.slice(0, i).toUpperCase(), v = p.slice(i + 1).trim();
    if (!v) continue;
    if (k === 'N') { const [a = '', b = ''] = v.split(',').map(x => x.trim()); out.name = b ? (hasCJK(v) ? a + b : b + ' ' + a) : a; }
    else if (k === 'ORG') out.org = v;
    else if (k === 'TEL' || k === 'TEL-AV') out.phone.push(v);
    else if (k === 'EMAIL') out.email.push(v);
    else if (k === 'URL') out.links.push(v);
    else if (k === 'ADR') out.extra.push('Address: ' + v);
    else if (k === 'NOTE' || k === 'MEMORY') out.extra.push('Note: ' + v);
  }
}
function parseQr(raw) {
  const text = String(raw || '').trim();
  const out = { type: 'Text', name: '', org: '', wechat: '', phone: [], email: [], links: [], extra: [] };
  if (/^begin:vcard/i.test(text)) { out.type = 'Business card (vCard)'; parseVcard(text, out); }
  else if (/^mecard:/i.test(text)) { out.type = 'Business card (MeCard)'; parseMecard(text, out); }
  else if (isWeChat(text)) { out.type = 'WeChat contact'; out.wechat = text; }
  else if (/^tel:/i.test(text)) { out.type = 'Phone number'; out.phone.push(text.slice(4)); }
  else if (/^mailto:/i.test(text)) { out.type = 'Email'; out.email.push(decodeURIComponent(text.slice(7).split('?')[0])); }
  else if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com)\//i.test(text)) {
    out.type = 'WhatsApp';
    const m = text.match(/(?:wa\.me\/|phone=)\+?(\d{6,})/);
    if (m) out.phone.push('+' + m[1] + ' (WhatsApp)'); else out.links.push(text);
  } else if (/^https?:\/\//i.test(text)) { out.type = /alibaba\.com|1688\.com/i.test(text) ? 'Alibaba / 1688 page' : 'Web link'; out.links.push(text); }
  else {
    const em = text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g);
    if (em) out.email.push(...em);
    const wx = text.match(/(?:wechat|weixin|wx|\u5fae\u4fe1)\s*(?:id|\u53f7)?\s*[:\uff1a]\s*([A-Za-z][\w-]{4,})/i);
    if (wx) out.wechat = wx[1];
    const ph = text.match(/\+?\d[\d\s()-]{7,}\d/g);
    if (ph) out.phone.push(...ph.map(x => x.trim()));
  }
  if (!out.wechat) {
    const l = out.links.find(isWeChat);
    if (l) { out.wechat = l; out.links = out.links.filter(x => x !== l); }
  }
  return out;
}
async function applyQr(text, blob) {
  if (!S.form) return;
  const r = parseQr(text);
  const filled = [];
  const merge = (k, val, label) => {
    val = String(val || '').trim();
    if (!val) return;
    const cur = String(S.form.values[k] || '').trim();
    if (!cur) { setVal(k, val); filled.push(label); }
    else if (!cur.includes(val)) { setVal(k, cur + ' | ' + val); filled.push(label + ' (added)'); }
  };
  merge('contact_name', r.name, 'Who we met');
  merge('wechat', r.wechat, 'WeChat');
  merge('phone', [...new Set(r.phone)].join(', '), 'Phone');
  merge('email', [...new Set(r.email)].join(', '), 'Email');
  if (!S.form.sup && r.org && !String(S.form.values.new_name || '').trim()) { setVal('new_name', r.org); filled.push('Company name'); }
  const lines = [`QR scanned ${stamp()} (${r.type}): ${String(text).trim().replace(/\s*\r?\n\s*/g, ' | ').slice(0, 2000)}`];
  if (r.org && S.form.sup) lines.push('Company on card: ' + r.org);
  lines.push(...r.extra, ...r.links.map(l => 'Link: ' + l));
  const notes = String(S.form.values.notes || '').trim();
  setVal('notes', (notes ? notes + '\n' : '') + lines.join('\n'));
  filled.push('Notes');
  let saved = false;
  if (blob) {
    const ext = /png/i.test(blob.type) ? 'png' : /heic|heif/i.test(blob.type) ? 'heic' : 'jpg';
    const file = new File([blob], `qr_code_${Date.now()}.${ext}`, { type: blob.type || 'image/jpeg' });
    saved = (await addFiles([file], 'card')) > 0;
  }
  renderForm();
  const tip = r.wechat && /^(weixin:|https?:)/i.test(r.wechat)
    ? '\n\nWeChat QR codes open only inside WeChat. To add this contact later: WeChat \u2192 + \u2192 Scan \u2192 photo icon \u2192 pick the saved QR photo.' : '';
  dialog('QR code scanned', `${r.type}\nFilled: ${filled.join(', ')}${saved ? '\nThe QR photo is saved with this note.' : ''}${tip}\n\nCheck the fields, then tap Save notes.`,
    [{ label: 'OK', value: true }]);
}

function openEditor() {
  const ta = h('textarea', { value: S.form.values.notes || '', placeholder: 'What did we discuss?', oninput: e => setVal('notes', e.target.value) });
  const ed = h('div', { class: 'editor' },
    h('div', { class: 'row' }, h('b', {}, 'Notes'), h('button', { class: 'btn', style: 'width:auto;padding:9px 16px', onclick: () => { ed.remove(); renderForm(); } }, 'Done')),
    ta);
  document.body.append(ed);
  ta.focus();
}

async function saveForm(opts = {}) {
  const f = S.form, v = f.values, sup = f.sup;
  const name = sup ? sup.name_en : String(v.new_name || '').trim();
  if (!name) { if (!opts.auto) { toast('Enter the company name'); $('#f_new_name') && $('#f_new_name').focus(); } return false; }
  const rec = {
    ...(f.existing && !f.existing.team ? f.existing : {}),
    client_id: f.client_id, saved_at: (f.existing && f.existing.saved_at) || stamp(), updated_local: new Date().toISOString(),
    recorded_by: (f.existing && f.existing.recorded_by) || S.who,
    supplier_id: sup ? sup.id : '', supplier_name: name, on_list: sup ? (sup.shortlist ? 'shortlist' : 'backup') : 'new',
    phase: f.phase || '', booth: sup ? (sup.booth || '') : String(v.new_booth || '').trim(), category: sup ? (sup.subcategory || sup.category || '') : String(v.new_category || '').trim(),
    status: v.status || 'visited', rating: v.rating || '', sample: v.sample || 'none', sync: 'pending', error: '',
  };
  for (const k of TEXT_FIELDS) if (!k.startsWith('new_')) rec[k] = String(v[k] || '').trim();
  await DB.put('visits', rec);
  for (const p of f.photos.filter(x => x.sync === 'held')) { p.sync = 'pending'; await DB.put('photos', p); }
  store.del('draft_' + f.client_id);
  if (opts.auto) {
    // app went to the background: keep the form open, everything is already safe on the phone
    f.existing = rec; f.dirty = false;
    await loadLocal();
    return true;
  }
  S.form = null; $('#form').remove();
  await loadLocal();
  toast(navigator.onLine ? 'Saved - uploading to Drive' : 'Saved on your phone - uploads when online');
  render();
  sync();
  return true;
}

async function closeForm() {
  const f = S.form;
  if (f && f.dirty) {
    const pick = await dialog('Save your notes?', 'You have changes that are not saved yet.', [
      { label: 'Save notes', value: 'save' }, { label: 'Keep as draft', value: 'draft', style: 'ghost' }, { label: 'Discard changes', value: 'discard', style: 'danger' }]);
    if (pick === 'save') return saveForm();
    if (pick === null) return;
    if (pick === 'discard') {
      store.del('draft_' + f.client_id);
      for (const p of f.photos.filter(x => x.sync === 'held')) await dropPhoto(p.photo_id);
    }
    if (pick === 'draft') toast('Draft kept - find it under Notes');
  }
  S.form = null; const el = $('#form'); if (el) el.remove();
  render();
}

async function deleteVisit(f) {
  const ok = await dialog('Delete this note?', 'It is removed from this phone. Anything already uploaded stays in Google Drive.', [
    { label: 'Delete', value: true, style: 'danger' }, { label: 'Cancel', value: false, style: 'ghost' }]);
  if (!ok) return;
  for (const p of await DB.photosOf(f.client_id)) await dropPhoto(p.photo_id);
  await DB.del('visits', f.client_id);
  store.del('draft_' + f.client_id);
  S.form = null; $('#form').remove();
  await loadLocal(); render();
}

// ---------- sync sheet + settings ----------
function openSyncSheet() {
  const vPend = S.visits.filter(v => v.sync !== 'synced'), pPend = S.photos.filter(p => p.sync === 'pending' || p.sync === 'error');
  const errs = [...vPend, ...pPend].filter(x => x.sync === 'error');
  const bytes = pPend.reduce((a, p) => a + (p.size || 0), 0);
  const sheet = h('div', { class: 'scrim', onclick: e => { if (e.target === sheet) sheet.remove(); } },
    h('div', { class: 'dialog' }, h('h2', {}, 'Sync to Google Drive'),
      h('div', { class: 'kv' }, h('span', {}, 'Notes waiting'), h('span', {}, String(vPend.length))),
      h('div', { class: 'kv' }, h('span', {}, 'Photos waiting'), h('span', {}, `${pPend.length}${pPend.length ? ' \u00b7 ' + kb(bytes) : ''}`)),
      h('div', { class: 'kv' }, h('span', {}, 'Internet'), h('span', {}, navigator.onLine ? 'Connected' : 'Offline')),
      h('div', { class: 'kv' }, h('span', {}, 'Last sync'), h('span', {}, ago(S.lastSync))),
      S.lastError ? h('p', { class: 'err' }, S.lastError) : null,
      errs.length ? h('p', { class: 'err' }, `${errs.length} item(s) were rejected: ${errs[0].error || ''}`) : null,
      h('button', { class: 'btn', style: 'margin-top:12px', onclick: () => { sheet.remove(); sync(true); } }, 'Sync now'),
      h('button', { class: 'btn ghost', style: 'margin-top:8px', onclick: () => sheet.remove() }, 'Close')));
  document.body.append(sheet);
}

function openSettings() {
  const who = h('input', { class: 'i', value: S.who, autocomplete: 'name' });
  const sheet = h('div', { class: 'scrim', onclick: e => { if (e.target === sheet) sheet.remove(); } },
    h('div', { class: 'dialog' }, h('h2', {}, 'Settings'),
      h('label', { class: 'f' }, 'Your name (shown on your notes)'), who,
      h('label', { class: 'f' }, 'Photo uploads'),
      h('div', { class: 'seg' }, [['optimized', 'Optimized'], ['original', 'Original']].map(([k, l]) =>
        h('button', { class: S.quality === k ? 'on' : '', onclick: e => { S.quality = k; store.set('quality', k); [...e.target.parentNode.children].forEach(b => b.classList.toggle('on', b === e.target)); } }, l))),
      h('div', { class: 'hint' }, 'Optimized: sharp 2560 px photos, ~5x less roaming data. Original: untouched files in any format.'),
      h('div', { class: 'kv', style: 'margin-top:10px' }, h('span', {}, 'Itinerary data'), h('span', {}, S.data && S.data.generated || '-')),
      h('div', { class: 'kv' }, h('span', {}, 'App version'), h('span', {}, VERSION)),
      h('button', { class: 'btn', style: 'margin-top:12px', onclick: async () => {
        S.who = who.value.trim() || S.who; store.set('who', S.who);
        try { await refreshItinerary(); await downloadDashboard(); toast('Itinerary and dashboard updated'); }
        catch (e) { toast(e.net ? 'No connection - using the copy saved on this phone' : e.message); }
        sheet.remove(); render(); } }, 'Save & refresh itinerary + dashboard'),
      h('button', { class: 'btn ghost', style: 'margin-top:8px', onclick: exportBackup }, 'Download backup of my notes'),
      h('button', { class: 'btn danger', style: 'margin-top:8px', onclick: async () => {
        if (pendingCount()) { toast('Sync first - some notes are not uploaded yet'); return; }
        sheet.remove(); signOut(''); } }, 'Sign out')));
  document.body.append(sheet);
}

async function exportBackup() {
  const visits = await DB.all('visits');
  const photos = (await DB.all('photos')).map(({ blob, ...p }) => p);
  const file = new Blob([JSON.stringify({ exported: new Date().toISOString(), by: S.who, visits, photos }, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(file), download: `canton-booth-notes-${stamp().replace(/[: ]/g, '-')}.json` });
  document.body.append(a); a.click(); a.remove();
  toast('Backup downloaded');
}

function signOut(msg) {
  S.pass = ''; store.del('pass');
  S.loginError = msg || '';
  render();
}

// ---------- welcome / sign-in ----------
function renderWelcome() {
  const pass = h('input', { class: 'i', type: 'password', autocomplete: 'current-password', placeholder: 'Team passcode' });
  const who = h('input', { class: 'i', autocomplete: 'name', placeholder: 'Your name', value: S.who });
  const err = h('div', { class: 'err' }, S.loginError || (API ? '' : 'This copy of the app is not connected yet - see SETUP.md step 3 (config.js).'));
  const go = h('button', { class: 'btn', style: 'margin-top:16px', onclick: async () => {
    if (!pass.value.trim() || !who.value.trim()) { err.textContent = 'Enter the team passcode and your name.'; return; }
    S.pass = pass.value.trim(); S.who = who.value.trim();
    go.disabled = true; go.textContent = 'Connecting\u2026'; err.textContent = '';
    try {
      await refreshItinerary();
      store.set('pass', S.pass); store.set('who', S.who); S.loginError = '';
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      go.textContent = 'Downloading dashboard\u2026';
      try { await downloadDashboard(); } catch (e) { toast('Dashboard not downloaded yet - use the Dashboard tab later'); }
      render(); sync();
    } catch (e) {
      S.pass = '';
      err.textContent = e.net ? 'No internet. Connect once (roaming or VPN) to download the itinerary - after that the app works offline.' : e.message;
      go.disabled = false; go.textContent = 'Sign in';
    }
  } }, 'Sign in');
  put(root, h('div', { class: 'welcome' },
    h('div', { class: 'logo' }, svg(ICON.booth, 32)),
    h('h1', {}, 'Canton booth app'),
    h('div', { class: 'sub' }, 'Itinerary, booth notes and photos - saved on your phone, synced to Google Drive.'),
    h('label', { class: 'f' }, 'Team passcode'), pass, h('label', { class: 'f' }, 'Your name'), who, go, err));
}

// ---------- boot ----------
function openFromHash() {
  const m = /^#s=(\d+)/.exec(location.hash);
  if (!m || !S.data || !S.pass) return;
  history.replaceState(null, '', location.pathname);
  const sup = supplierById(m[1]);
  const stop = (S.data.days || []).flatMap(d => d.stops.map(s => ({ ...s, phase: d.phase }))).find(s => String(s.id) === m[1]);
  if (sup || stop) openForm({ supplier: { ...(stop || {}), ...(sup || {}) } });
  else toast('That supplier is not in the phone list - add it with +');
}
window.addEventListener('hashchange', openFromHash);
window.addEventListener('online', () => { renderStatus(); sync(); });
window.addEventListener('offline', renderStatus);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') return sync();
  if (S.form && S.form.dirty) saveForm({ auto: true }).then(ok => ok && sync());   // switching apps / locking the phone never loses a note
});
setInterval(() => sync(), 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

(async () => {
  await loadLocal();
  for (const p of S.photos.filter(x => x.sync === 'held')) {
    if (!store.json('draft_' + p.client_id)) await dropPhoto(p.photo_id);   // photos from a form that was never saved
  }
  await loadLocal();
  render();
  openFromHash();
  sync();
})();
