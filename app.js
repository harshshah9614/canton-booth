'use strict';
/* Canton booth app - offline-first PWA. Everything is saved on the phone first (IndexedDB), then uploaded to the
   team's Google Drive (Apps Script backend in config.js) whenever there is internet. */

const VERSION = '2.5.1';
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
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
  audio: ['M9 18V5l12-2v13', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  home: ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'], user: ['M20 21a8 8 0 0 0-16 0', 'M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z'],
  check: ['M9 11l3 3 8-8', 'M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  pin: ['M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z', 'M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  flame: ['M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.5 1.5-4.5 3-5.5 0 2 1 3 2 3 0-3-1-6 0-8.5z'],
  phone: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M22 6l-10 7L2 6'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'], download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  share: ['M4 12v8h16v-8', 'M12 3v12', 'M7 8l5-5 5 5'],
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
  tab: 'today', day: null, find: '', findFilter: 'all', notesFilter: 'all', hall: store.get('hall'),
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
  const code = String(booth).split(',')[0].trim();
  const ed = h('div', { class: 'editor' },
    h('div', { class: 'row' }, h('b', {}, `Hall ${hf.hall} \u00b7 floor ${hf.floor}${/[a-z]/i.test(code) ? ' \u00b7 booth ' + code : ''}`),
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
    'rating', 'contact_name', 'wechat', 'phone', 'email', 'products', 'notes', 'fob_price', 'moq', 'lead_time', 'sample', 'next_step', 'hot'];
  return Object.fromEntries(keys.map(k => [k, v[k] == null ? '' : v[k]]));
}

// only a bad file or missing name can never succeed; busy/lock/server errors keep retrying every minute
const permanent = e => /not a photo|not an audio|larger than 30 MB|Empty (photo|voice)|required|id missing|missing on this phone/i.test(e.message || '');

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
  S.data = r.data; S.team = r.visits || []; S.dir = null;
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

// ---------- fair directory: every Phase 2/3 exhibitor, stored apart from our shortlist and itinerary (never merged into them) ----------
const DIR_URL = () => new URL('d/_directory.json', location.href).href;
const normName = s => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ')
  .replace(/\b(co|ltd|limited|inc|corp|corporation|company|group|industrial|industry|trading|import|export|imp|exp|and)\b/g, ' ').replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
const boothBase = b => String(b || '').trim().toUpperCase().replace(/-\d+$/, '');
async function downloadDirectory() {
  const r = await api('directory', {}, 180000);
  const d = r.directory || {};
  if (!Array.isArray(d.exhibitors)) throw new Error('The directory file in Drive is not valid');
  await (await caches.open('canton-dash')).put(DIR_URL(), new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } }));
  store.set('dirAt', d.generated || stamp()); store.set('dirCount', String(d.exhibitors.length));
  S.dir = null;
  return loadDirectory();
}
function loadDirectory() {
  if (S.dir) return Promise.resolve(S.dir);
  if (!S.dirLoading) S.dirLoading = (async () => {
    try {
      const hit = await (await caches.open('canton-dash')).match(DIR_URL());
      if (!hit) return null;
      const raw = await hit.json();
      // our shortlist wins: a directory exhibitor that is already one of our suppliers opens our entry instead
      const byName = new Map(), byBooth = new Map();
      for (const s of S.data.suppliers || []) {
        byName.set(normName(s.name_en), s);
        for (const b of String(s.booth || '').split(',')) if (b.trim()) byBooth.set(`${s.phase}|${boothBase(b)}`, s);
      }
      const list = raw.exhibitors.map(e => { const c = (e.k || []).map(i => (raw.cats || [])[i]).filter(Boolean); return { ...e, c,
        mine: byName.get(normName(e.n)) || e.bo.map(x => byBooth.get(`${x.p}|${boothBase(x.b)}`)).find(Boolean) || null,
        f: { n: e.n.toLowerCase(), b: e.bo.map(x => x.b).join(' ').toLowerCase(), a: e.bo.map(x => x.a).join(' | ').toLowerCase(), c: c.join(' | ').toLowerCase(),
          p: [...(e.pr || []), ...(e.kw || [])].join(' | ').toLowerCase(), t: (e.q || []).map(i => (raw.terms || [])[i]).join(' | ').toLowerCase() } }; });
      S.dir = { list, generated: raw.generated, halls: {}, areas: [...new Set(list.flatMap(e => e.bo.map(x => x.a)).filter(Boolean))] };
      return S.dir;
    } catch (e) { return null; } finally { S.dirLoading = null; }
  })();
  return S.dirLoading;
}
const dirSeen = () => new Set(allVisits().filter(v => !v.supplier_id).map(v => normName(v.supplier_name)));
// search words: plural -> singular, then whole-word match (short words allow s/es/en/ed/ing, longer words also match as a word start)
const stem = w => w.length <= 3 ? w : /ies$/.test(w) ? w.slice(0, -3) + 'y' : /(ss|x|z|ch|sh)es$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : w;
function wordRe(w) {
  const s = stem(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + s + (s.length >= 5 ? '' : '(s|es|en|ed|ing)?(?![a-z0-9])'));
}
// words in company names that say nothing about what a supplier makes
const GENERIC = new Set('industrial industry products product crafts craft arts art textiles textile home trading trade import export imp exp international group technology tech manufacturing manufacture factory goods commodities household enterprise enterprises development light general new material materials co ltd company gifts gift garments garment decoration decorations supplies supply holdings science economic'.split(' '));
// relevance of a fair exhibitor for the search words (0 = no match); e.bf = the booths to list
function fairScore(e, res) {
  let total = 0, onlyArea = true;
  for (const { w, re } of res) {
    const f = e.f;
    const strong = re.test(f.t) || re.test(f.p) || re.test(f.b) ? 3 : !GENERIC.has(stem(w)) && re.test(f.n) ? 2 : 0;
    const sc = Math.max(strong, re.test(f.a) ? 2 : 0, re.test(f.c) ? 1 : 0);
    if (!sc) return 0;
    if (strong >= 2) onlyArea = false;
    total += sc;
  }
  if (total < 2 * res.length) return 0;
  e.bf = onlyArea ? e.bo.filter(x => res.every(({ re }) => re.test(x.a.toLowerCase()))) : null;
  if (e.bf && !e.bf.length) return 0;
  return total;
}
function openDirectory(e) {
  if (e.mine) return openForm({ supplier: e.mine });
  const mine = allVisits().find(v => !v.supplier_id && !v.team && normName(v.supplier_name) === normName(e.n));
  return mine ? openForm({ visit: mine }) : openForm({ directory: e });
}
function dirRow(e, hallKey, seen, phase, area) {
  const b = e.bo.find(x => (!hallKey || x.b.startsWith(hallKey)) && (!phase || String(x.p) === phase) && (!area || x.a === area)) || e.bo[0];
  const v = seen.has(normName(e.n));
  return h('button', { class: 'result dir' + (v ? ' visited' : ''), onclick: () => openDirectory(e) },
    h('div', { class: 'row-head' }, h('span', { class: 'booth-code' }, b.b), h('div', { class: 'booth' }, e.n)),
    h('div', { class: 'meta' }, [`Phase ${b.p}`, b.a].filter(Boolean).join(' \u00b7 ')),
    e.pr && e.pr.length ? h('div', { class: 'meta prods' }, e.pr.join(' \u00b7 ')) : null,
    h('div', { class: 'tags' }, h('span', { class: 'tag dir' }, 'Fair directory'),
      /B/.test(e.tg || '') ? h('span', { class: 'tag' }, 'Brand') : null, /A/.test(e.tg || '') ? h('span', { class: 'tag' }, 'CF Award') : null,
      /M/.test(e.tg || '') ? h('span', { class: 'tag' }, 'Multi-session') : null, e.u >= 4 ? h('span', { class: 'tag' }, `${e.u} booths`) : null,
      v ? h('span', { class: 'tag ok' }, 'Notes saved') : null));
}
// fair hits for a search: grouped by hall floor, then the top 3 per exhibit area (fair badges first, then booth size)
function fairResults(fair, dseen) {
  const halls = new Map(), areas = new Map();
  const booths = e => e.bf || e.bo;
  for (const e of fair) {
    for (const x of booths(e)) for (const k of hallKeys(x.b)) {
      const g = `${x.p}|${k}`;
      if (!halls.has(g)) halls.set(g, []);
      if (!halls.get(g).includes(e)) halls.get(g).push(e);
    }
  }
  // big traders exhibit in many sections: rank each one once, in the section where this search has the most matches
  const areaOf = e => [...new Set(booths(e).map(x => x.a).filter(Boolean))];
  const seen = new Map();
  for (const e of fair) for (const a of areaOf(e)) seen.set(a, (seen.get(a) || 0) + 1);
  for (const e of fair) {
    const as = areaOf(e);
    if (!as.length) continue;
    const a = as.reduce((b, x) => seen.get(x) > seen.get(b) ? x : b);
    if (!areas.has(a)) areas.set(a, []);
    areas.get(a).push(e);
  }
  const rank = (a, b) => (b.r || 0) - (a.r || 0) || (b.s || 0) - (a.s || 0) || (b.u || 0) - (a.u || 0);
  const hallKeysSorted = [...halls.keys()].sort((a, b) => boothSort(a, b));
  const areaList = [...areas.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  return [
    h('div', { class: 'eyebrow', id: 'r-hall' }, `Fair exhibitors not on our list - by hall (${fair.length})`),
    hallKeysSorted.map(g => {
      const [p, k] = g.split('|');
      const rows = halls.get(g).slice().sort((a, b) => boothSort((a.bo.find(x => String(x.p) === p && x.b.startsWith(k)) || a.bo[0]).b, (b.bo.find(x => String(x.p) === p && x.b.startsWith(k)) || b.bo[0]).b));
      return h('details', { class: 'hall-group' }, h('summary', {}, h('b', {}, `Hall ${k}`), ` \u00b7 Phase ${p}`, h('span', { class: 'count' }, String(rows.length))),
        rows.slice(0, 60).map(e => dirRow(e, k, dseen, p)), rows.length > 60 ? h('div', { class: 'hint' }, 'Showing 60 - type more to narrow down.') : null);
    }),
    h('div', { class: 'eyebrow', id: 'r-top' }, 'Top 3 per exhibit area'),
    h('div', { class: 'hint', style: 'margin-top:-4px' }, 'Best match first, then fair badges (Brand, CF Award, multi-session) and booth size.'),
    areaList.map(([a, list]) => h('div', { class: 'top-area' }, h('div', { class: 'section-row' }, h('b', {}, a), h('span', { class: 'hint', style: 'margin:0' }, `${list.length} match${list.length === 1 ? '' : 'es'}`)),
      list.slice().sort(rank).slice(0, 3).map(e => dirRow(e, '', dseen, '', a)))),
  ];
}
// the dashboard's Fair Map page (cached on the phone) with its booth finder filled in
function showOnFairMap(booth, phase) {
  const code = String(booth || '').split(',')[0].trim();
  if (!store.get('pagesAt')) return toast('Download the guide pages first (Guide tab)');
  const frame = h('iframe', { src: 'd/fair-map.html', title: 'Fair Map', style: 'flex:1;width:100%;border:0;background:#fff;border-radius:10px;margin-top:8px' });
  frame.addEventListener('load', () => {
    try {
      const d = frame.contentDocument, q = d.getElementById('bf-q'), ph = d.getElementById('bf-phase');
      if (ph && phase && [...ph.options].some(o => o.value === String(phase))) ph.value = String(phase);
      if (q) { q.value = code; q.dispatchEvent(new Event('input'));
        const w = frame.contentWindow; w.scrollTo(0, d.getElementById('finder').getBoundingClientRect().top + w.scrollY - 150); }
    } catch (e) { /* page layout changed: the map still opens */ }
  });
  const ed = h('div', { class: 'editor' }, h('div', { class: 'row' }, h('b', {}, `Fair Map \u00b7 booth ${code}`),
    h('button', { class: 'btn', style: 'width:auto;padding:9px 16px', onclick: () => ed.remove() }, 'Close')), frame);
  document.body.append(ed);
}
function mapButtons(booth, phase) {
  const hf = hallOf(booth);
  return hf ? h('div', { class: 'btn-row' },
    h('button', { class: 'btn ghost', onclick: () => showHallMap(booth) }, `Hall ${hf.hall} map`),
    h('button', { class: 'btn ghost', onclick: () => showOnFairMap(booth, phase) }, 'Show on Fair Map')) : null;
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
  const views = { today: viewToday, booths: viewBooths, contacts: viewContacts, follow: viewFollow, guide: viewGuide };
  if (!views[S.tab]) S.tab = 'today';
  put(root,
    h('header', { class: 'top' }, h('h1', {}, TABS.find(t => t[0] === S.tab)[1]), statusChip(),
      h('button', { class: 'icon-btn', onclick: openSettings, 'aria-label': 'Settings' }, svg(ICON.gear, 20))),
    h('main', {}, views[S.tab]()),
    h('nav', { class: 'tabs' }, TABS.map(([id, label, icon]) => tabBtn(id, label, icon))));
}
const TABS = [['today', 'Today', ICON.home], ['booths', 'Booths', ICON.booth], ['contacts', 'Contacts', ICON.user],
  ['follow', 'Follow-ups', ICON.check], ['guide', 'Guide', ICON.book]];
function tabBtn(id, label, icon) {
  return h('button', { class: 'tab' + (S.tab === id ? ' on' : ''), onclick: () => go(id) }, svg(icon, 22), label);
}
function go(tab, sub) {
  S.tab = tab;
  if (sub) Object.assign(S, sub);
  render(); window.scrollTo(0, 0);
}
function segNav(key, opts) {
  return h('div', { class: 'seg seg-nav' }, opts.map(([k, l]) => h('button', { class: S[key] === k ? 'on' : '', onclick: () => { S[key] = k; render(); } }, l)));
}

// ---------- today ----------
function fairDay() {
  const days = S.data.days || [];
  const today = stamp().slice(0, 10);
  let i = days.findIndex(x => x.date === today);
  if (i < 0) i = days.findIndex(x => x.date > today);
  if (i < 0) i = days.length - 1;
  return { i, d: days[i], isToday: !!days[i] && days[i].date === today, inDays: days[i] ? Math.round((new Date(days[i].date) - new Date(today)) / 86400000) : 0 };
}
const seenIds = () => new Set(allVisits().filter(v => v.supplier_id).map(v => String(v.supplier_id)));
const openStop = (s, d) => openForm({ supplier: { ...supplierById(s.id), ...s, phase: d.phase } });
function stopRow(s, d, seen) {
  const v = seen.has(String(s.id));
  return h('button', { class: 'stop' + (v ? ' visited' : ''), onclick: () => openStop(s, d) },
    h('div', { class: 'when' }, h('b', {}, s.time_start || ''), h('div', { class: 'num' + (v ? ' done' : '') }, v ? '\u2713' : s.seq)),
    h('div', { class: 'body' }, h('div', { class: 'booth' }, (s.booth || 'Booth TBC').split(',')[0]), h('div', { class: 'name' }, s.name_en),
      h('div', { class: 'meta' }, s.subcategory || s.category || ''),
      h('div', { class: 'tags' }, s.must_see ? h('span', { class: 'tag' }, 'Must see') : null,
        s.canada_must_see ? h('span', { class: 'tag ca' }, 'Canada ' + s.canada_must_see) : null,
        v ? h('span', { class: 'tag ok' }, 'Notes saved') : null)));
}
function viewToday() {
  const { d, isToday, inDays } = fairDay();
  const saved = new Set(S.visits.map(v => v.client_id));
  const open = drafts().filter(x => !saved.has(x.client_id));
  const tiles = h('div', { class: 'tiles home-tiles' },
    h('button', { class: 'tile', onclick: () => openForm({}) }, svg(ICON.plus, 24), 'New supplier'),
    h('button', { class: 'tile', onclick: () => go('booths', { boothsView: 'hall' }) }, svg(ICON.pin, 24), S.hall ? `In hall ${S.hall}` : "I'm in a hall"),
    h('button', { class: 'tile', onclick: () => go('contacts') }, svg(ICON.user, 24), 'Contacts'),
    h('button', { class: 'tile', onclick: () => go('follow', { followView: 'summary' }) }, svg(ICON.check, 24), 'Day summary'));
  const draftCards = open.length ? [h('div', { class: 'eyebrow' }, 'Unsaved drafts'), open.map(x => h('button', { class: 'note-card draft', onclick: () => openForm({ draft: x }) },
    h('div', { class: 'booth' }, x._name || x.new_name || 'New supplier'), h('div', { class: 'meta' }, 'Tap to finish and save')))] : null;
  if (!d) return [draftCards, tiles, h('div', { class: 'empty' }, 'No itinerary loaded yet.')];
  const seen = seenIds();
  const done = d.stops.filter(s => seen.has(String(s.id))).length;
  const left = d.stops.filter(s => !seen.has(String(s.id)));
  const now = stamp().slice(11);
  const next = (isToday && left.find(s => (s.time_end || '99') >= now)) || left[0];
  return [
    draftCards,
    h('div', { class: 'card day-card' },
      h('div', { class: 'eyebrow', style: 'margin:0 0 2px' }, isToday ? 'Today' : inDays > 0 ? `Next walking day \u00b7 in ${inDays} day${inDays === 1 ? '' : 's'}` : 'Last walking day'),
      h('div', { class: 'day-title' }, `${d.label} \u00b7 ${d.display_date}`),
      h('div', { class: 'bar big' }, h('i', { style: `width:${d.count ? Math.round(100 * done / d.count) : 0}%` })),
      h('div', { class: 'meta' }, `${done} of ${d.count} stops visited \u00b7 ${d.hall_span}`)),
    next ? h('div', { class: 'card next-card' },
      h('div', { class: 'eyebrow', style: 'margin:0 0 4px' }, `Next stop \u00b7 ${next.time_start || ''}`),
      h('div', { class: 'next-booth' }, (next.booth || 'Booth TBC').split(',')[0]),
      h('div', { class: 'name' }, next.name_en),
      h('div', { class: 'meta' }, [next.walk_from_prev ? `~${next.walk_from_prev} min walk` : '', next.subcategory || next.category].filter(Boolean).join(' \u00b7 ')),
      next.next_action ? h('div', { class: 'ask' }, h('b', {}, 'Ask / check: '), next.next_action) : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => openStop(next, d) }, svg(ICON.camera, 18), 'Capture at this booth'),
        hallOf(next.booth) ? h('button', { class: 'btn ghost', onclick: () => showHallMap(next.booth) }, svg(ICON.pin, 18), 'Map') : null))
      : h('div', { class: 'card next-card' }, h('div', { class: 'booth' }, 'Every stop on this day has notes \u2713')),
    tiles,
    left.length > 1 ? [h('div', { class: 'eyebrow' }, `Still to visit (${left.length})`), left.filter(s => s !== next).map(s => stopRow(s, d, seen))] : null,
  ];
}

// ---------- booths: route, by hall, search ----------
function viewBooths() {
  const view = S.boothsView || 'route';
  return [segNav('boothsView', [['route', 'Route'], ['hall', 'By hall'], ['search', 'Search']]),
    view === 'hall' ? viewHall() : view === 'search' ? viewFind() : viewRoute()];
}

function viewRoute() {
  const days = S.data.days || [];
  if (S.day == null) S.day = Math.max(0, fairDay().i);
  const d = days[S.day];
  if (!d) return h('div', { class: 'empty' }, 'No itinerary loaded yet.');
  const seen = seenIds();
  const done = d.stops.filter(s => seen.has(String(s.id))).length;
  const list = [];
  d.stops.forEach((s, i) => {
    if (i && s.walk_from_prev) list.push(h('div', { class: 'walk' }, `\u2193 ~${s.walk_from_prev} min walk`));
    list.push(stopRow(s, d, seen));
    if (s.lunch_after) list.push(h('div', { class: 'lunch' }, 'Lunch break 12:30 \u2013 13:30'));
  });
  return [
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

// "I'm in hall 12.2": every supplier on that hall floor, in booth order, so you can walk past them without GPS
const hallKeys = booth => [...new Set(String(booth || '').split(',').map(hallOf).filter(Boolean).map(x => `${x.hall}.${x.floor}`))];
const boothSort = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
function dirHalls(phase) {
  if (S.dir.halls[phase]) return S.dir.halls[phase];
  const out = {};
  for (const e of S.dir.list) if (!e.mine) for (const k of new Set(e.bo.filter(x => String(x.p) === phase).flatMap(x => hallKeys(x.b)))) (out[k] = out[k] || []).push(e);
  return (S.dir.halls[phase] = out);
}
function viewHall() {
  const phases = [...new Set((S.data.suppliers || []).map(s => String(s.phase || '')).filter(Boolean))].sort();
  if (!S.hallPhase) S.hallPhase = String((fairDay().d || {}).phase || phases[0] || '2');
  const sups = (S.data.suppliers || []).filter(s => String(s.phase) === S.hallPhase);
  const halls = {};
  for (const s of sups) for (const k of hallKeys(s.booth)) (halls[k] = halls[k] || []).push(s);
  const hasDir = !!store.get('dirAt');
  const useDir = hasDir && S.hallSrc === 'all';
  if (useDir && !S.dir) loadDirectory().then(d => { if (d) render(); });
  const others = useDir && S.dir ? dirHalls(S.hallPhase) : {};
  const keys = [...new Set([...Object.keys(halls), ...Object.keys(others)])].sort(boothSort);
  const seen = seenIds();
  const dseen = useDir ? dirSeen() : new Set();
  const must = new Set((S.data.days || []).flatMap(d => d.stops.filter(x => x.must_see).map(x => String(x.id))));
  const pick = k => { S.hall = k; store.set('hall', k); render(); const on = $('.chip.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' }); };
  const inHall = k => [
    ...(halls[k] || []).map(s => ({ b: boothIn(s.booth, k), s, v: seen.has(String(s.id)) })),
    ...(others[k] || []).map(e => ({ b: (e.bo.find(x => String(x.p) === S.hallPhase && x.b.startsWith(k)) || e.bo[0]).b, e, v: dseen.has(normName(e.n)) })),
  ];
  const here = S.hall && keys.includes(S.hall);
  const list = here ? inHall(S.hall).sort((a, b) => boothSort(a.b, b.b)) : [];
  const showAll = S.hallAll;
  const shown = list.filter(x => showAll || !x.v);
  return [
    h('div', { class: 'seg', style: 'margin-top:10px' }, phases.map(p => h('button', { class: S.hallPhase === p ? 'on' : '', onclick: () => { S.hallPhase = p; render(); } }, `Phase ${p}`))),
    hasDir ? h('div', { class: 'seg' }, [['ours', 'Our list'], ['all', 'All exhibitors']].map(([k, l]) =>
      h('button', { class: (S.hallSrc || 'ours') === k ? 'on' : '', onclick: () => { S.hallSrc = k; render(); } }, l))) : null,
    useDir && !S.dir ? h('div', { class: 'empty' }, 'Loading the fair directory\u2026') : null,
    h('div', { class: 'eyebrow' }, S.hall ? 'Hall floor - swipe to change' : 'Which hall floor are you on?'),
    h('div', { class: 'chips' + (here ? ' row' : '') }, keys.map(k => {
      const left = inHall(k).filter(x => !x.v).length;
      return h('button', { class: 'chip' + (S.hall === k ? ' on' : ''), onclick: () => pick(k) }, h('b', {}, k), h('span', {}, left ? `${left} to see` : '\u2713'));
    })),
    here ? [
      h('div', { class: 'section-row' },
        h('div', { class: 'eyebrow', style: 'margin:0' }, `Hall ${S.hall} \u00b7 ${list.filter(x => x.v).length} of ${list.length} visited`),
        h('button', { class: 'link', onclick: () => showHallMap(S.hall) }, svg(ICON.pin, 15), ' Hall map')),
      h('div', { class: 'seg' }, [[false, 'Not visited'], [true, 'All']].map(([k, l]) => h('button', { class: !!showAll === k ? 'on' : '', onclick: () => { S.hallAll = k; render(); } }, l))),
      shown.slice(0, 400).map(({ s, e, v }) => e ? dirRow(e, S.hall, dseen, S.hallPhase) :
        h('button', { class: 'result' + (v ? ' visited' : ''), onclick: () => openForm({ supplier: s }) },
          h('div', { class: 'row-head' }, h('span', { class: 'booth-code' }, boothIn(s.booth, S.hall)), h('div', { class: 'booth' }, s.name_en)),
          h('div', { class: 'meta' }, s.subcategory || s.category || ''),
          h('div', { class: 'tags' }, must.has(String(s.id)) ? h('span', { class: 'tag' }, 'Must see') : null, supTags(s), v ? h('span', { class: 'tag ok' }, 'Notes saved') : null))),
      !shown.length ? h('div', { class: 'empty' }, 'Everyone on this floor has notes \u2713') : null,
    ] : h('div', { class: 'empty' }, 'Pick the hall floor you are on - you get every supplier there in booth order.'),
  ];
}
const boothIn = (booth, key) => String(booth || '').split(',').map(x => x.trim()).find(x => x.startsWith(key)) || String(booth || '').split(',')[0];

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
  const res = words.map(w => ({ w, re: wordRe(w) }));
  const all = (S.data.suppliers || []).filter(s => S.findFilter === 'all' || (S.findFilter === 'short' ? s.shortlist : !s.shortlist));
  const hits = q ? all.filter(s => { const t = [s.name_en, s.category, s.subcategory].join(' | ').toLowerCase(), b = String(s.booth || '').toLowerCase();
    return res.every(({ w, re }) => re.test(t) || b.includes(w) || String(s.name_cn || '').includes(w)); }) : all;
  const notes = q.length >= 2 ? allVisits().filter(v => match([v.supplier_name, v.notes, v.products, v.contact_name, v.next_step, v.wechat].join(' '))).slice(0, 20) : [];
  const dash = q.length >= 2 ? (S.index || []).filter(e => match(e.h + ' ' + e.t)).slice(0, 40) : [];
  const hasDir = !!store.get('dirAt');
  if (q.length >= 2 && hasDir && !S.dir) loadDirectory().then(d => { if (d) renderResults(); });
  const fairAreas = q.length >= 2 && S.dir ? S.dir.areas.filter(a => res.every(({ re }) => re.test(a.toLowerCase()))) : [];
  let fair = [];
  if (q.length >= 2 && S.dir && S.findFilter === 'all') {
    for (const e of S.dir.list) {
      if (e.mine) continue;
      e.r = fairScore(e, res);
      if (e.r) fair.push(e);
    }
    fair.sort((a, b) => b.r - a.r || (b.s || 0) - (a.s || 0));
  }
  const dseen = fair.length ? dirSeen() : null;
  return h('div', { id: 'results' },
    fair.length ? h('div', { class: 'jump' }, [['r-ours', `Our list (${hits.length})`], ['r-hall', `By hall (${fair.length})`], ['r-top', 'Top 3 per area']].map(([id, l]) =>
      h('button', { class: 'chip', onclick: () => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, l))) : null,
    notes.length ? [h('div', { class: 'eyebrow' }, `In booth notes (${notes.length})`), notes.map(v => h('button', { class: 'result', onclick: () => openForm({ visit: v }) },
      h('div', { class: 'booth' }, v.supplier_name), h('div', { class: 'note-text' }, v.notes || v.products || '')))] : null,
    dash.length ? [h('div', { class: 'eyebrow' }, `In the dashboard (${dash.length}${dash.length === 40 ? '+' : ''})`), dash.map(e =>
      h('a', { class: 'result', href: `d/${e.p}#${e.id}`, style: 'text-decoration:none;color:inherit' },
        h('div', { class: 'meta' }, [e.pt, e.h].filter(Boolean).join(' \u203a ')), h('div', { class: 'note-text' }, e.t)))] : null,
    hits.length || !fair.length ? h('div', { class: 'eyebrow', id: 'r-ours' }, `${hits.length} supplier${hits.length === 1 ? '' : 's'}`) : null,
    hits.slice(0, 80).map(s => {
      const v = visitsForSupplier(s.id).length;
      return h('button', { class: 'result', onclick: () => openForm({ supplier: s }) },
        h('div', { class: 'booth' }, s.name_en), s.name_cn ? h('div', { class: 'meta' }, s.name_cn) : null,
        h('div', { class: 'meta' }, `Phase ${s.phase || '?'} \u00b7 ${(s.booth || 'booth TBC').split(',')[0]} \u00b7 ${s.subcategory || s.category || ''}`),
        h('div', { class: 'tags' }, supTags(s),
          v ? h('span', { class: 'tag ok' }, `${v} note${v > 1 ? 's' : ''}`) : null));
    }),
    hits.length > 80 ? h('div', { class: 'hint' }, 'Showing the first 80 - type to narrow down.') : null,
    fair.length ? [fairAreas.length ? h('div', { class: 'hint' }, `Exhibit section: ${fairAreas.join(', ')}`) : null, fairResults(fair.slice(0, 600), dseen),
      fair.length > 600 ? h('div', { class: 'hint' }, `${fair.length} matches - showing the first 600. Type more to narrow down.`) : null] : null,
    q.length >= 2 && !hasDir ? h('div', { class: 'hint' }, 'Looking for a booth that is not on our list? Download the fair directory in Guide to search every Phase 2 and 3 exhibitor.') : null,
    q && !hits.length && !fair.length ? h('div', { class: 'empty' }, 'No match - add them as a new supplier below.') : null);
}

// ---------- guide: desktop dashboard tabs (stored on the phone), booth questions, tools ----------
const GUIDE = [
  ['At the booth', ['toolkit.html']],
  ['Research', ['opportunities.html', 'canada.html', 'alibaba.html']],
  ['Plan', ['cc.html', 'itinerary.html', 'fair-map.html', 'factory-visits.html']],
  ['After hours', ['restaurants.html']],
];
function viewGuide() {
  const at = store.get('pagesAt');
  const ready = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  const dl = h('button', { class: 'btn' + (at ? ' ghost' : ''), onclick: async () => {
    dl.disabled = true; dl.textContent = 'Downloading\u2026';
    try { await downloadDashboard(); toast('Guide saved on this phone'); }
    catch (e) { toast(e.net ? 'No connection - try again on Wi-Fi, roaming or VPN' : e.message); }
    render();
  } }, svg(ICON.sync, 18), at ? 'Update guide pages' : 'Download guide pages');
  const dirAt = store.get('dirAt');
  const dirBtn = h('button', { class: 'btn' + (dirAt ? ' ghost' : ''), onclick: async () => {
    dirBtn.disabled = true; dirBtn.textContent = 'Downloading\u2026';
    try { const d = await downloadDirectory(); toast(d ? `${d.list.length.toLocaleString()} exhibitors saved on this phone` : 'Could not open the directory'); }
    catch (e) { toast(e.net ? 'No connection - try again on Wi-Fi, roaming or VPN' : e.message); }
    render();
  } }, svg(ICON.sync, 18), dirAt ? 'Update directory' : 'Download directory');
  const page = file => DASH_PAGES.find(p => p[0] === file);
  const qs = (S.data.questions || {}).screen || [];
  return [
    GUIDE.map(([group, files]) => [h('div', { class: 'eyebrow' }, group),
      group === 'At the booth' && qs.length ? h('details', { class: 'result qref' }, h('summary', {}, 'Booth questions', h('span', { class: 'hint', style: 'margin:0 0 0 6px' }, `${qs.length} for a 10-minute screen`)),
        h('ol', {}, qs.map(q => h('li', {}, q)))) : null,
      files.map(page).filter(Boolean).map(([file, title, desc]) => h('a', { class: 'result guide-link' + (at ? '' : ' off'), href: 'd/' + file },
        h('div', { class: 'booth' }, title), h('div', { class: 'meta' }, desc)))]),
    h('div', { class: 'eyebrow' }, 'Tools'),
    h('div', { class: 'card' }, h('div', { class: 'section-title' }, 'Price converter'), converter()),
    h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Guide pages on this phone'),
      h('div', { class: 'hint' }, at ? `Saved \u00b7 built ${at}. Works without internet.` : 'Download once (about 2 MB) while you have internet - after that every page, map and route works offline.'),
      !ready ? h('div', { class: 'hint', style: 'color:var(--warn)' }, 'Close and reopen the app once to finish installing offline mode.') : null,
      h('div', { style: 'margin-top:12px' }, dl)),
    h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Fair exhibitor directory'),
      h('div', { class: 'hint' }, dirAt ? `${Number(store.get('dirCount') || 0).toLocaleString()} Phase 2 & 3 exhibitors saved \u00b7 ${dirAt}. Search and By hall \u2192 All exhibitors work offline.`
        : 'Every Phase 2 and 3 exhibitor (about 5 MB). Download once on Wi-Fi - then search any booth and take notes on it, offline.'),
      h('div', { class: 'hint' }, 'Kept separate: our shortlist, itinerary and route never change.'),
      h('div', { style: 'margin-top:12px' }, dirBtn)),
  ];
}

// ---------- notes ----------
function viewNotes() {
  const list = allVisits().filter(v => S.notesFilter === 'all' || (S.notesFilter === 'mine' ? !v.team : v.team))
    .sort((a, b) => String(b.updated_local || b.updated_at || b.saved_at).localeCompare(String(a.updated_local || a.updated_at || a.saved_at)));
  const saved = new Set(S.visits.map(v => v.client_id));
  const open = drafts().filter(d => !saved.has(d.client_id));
  return [
    open.length ? [h('div', { class: 'eyebrow' }, 'Unsaved drafts'), open.map(d => h('button', { class: 'note-card', onclick: () => openForm({ draft: d }) },
      h('div', { class: 'booth' }, d._name || d.new_name || 'New supplier'),
      d.notes ? h('div', { class: 'note-text' }, d.notes) : null,
      h('div', { class: 'tags' }, h('span', { class: 'tag warn' }, 'Draft - tap to finish and save'))))] : null,
    h('div', { class: 'seg', style: 'margin-top:10px' }, [['all', 'Everyone'], ['mine', 'Mine'], ['team', 'Team']].map(([k, l]) =>
      h('button', { class: S.notesFilter === k ? 'on' : '', onclick: () => { S.notesFilter = k; render(); } }, l))),
    list.length ? list.map(noteCard) : h('div', { class: 'empty' }, 'No booth notes yet. Open a stop on the Today tab, or tap New supplier.'),
  ];
}
function noteCard(v) {
  const files = S.photos.filter(p => p.client_id === v.client_id);
  const vn = files.filter(p => p.kind === 'voice').length;
  const ph = files.length - vn;
  const inDrive = files.length ? 0 : Number(v.photos || 0);   // a teammate's note: Drive counts photos and voice notes together
  return h('button', { class: 'note-card', onclick: () => openForm({ visit: v }) },
    h('div', { class: 'booth' }, v.supplier_name),
    h('div', { class: 'meta' }, [v.booth && String(v.booth).split(',')[0], v.recorded_by, v.saved_at].filter(Boolean).join(' \u00b7 ')),
    v.notes ? h('div', { class: 'note-text' }, v.notes) : null,
    h('div', { class: 'tags' }, hotTag(v), statusTag(v.status), v.rating ? h('span', { class: 'tag' }, '\u2605'.repeat(Number(v.rating))) : null,
      v.next_step ? h('span', { class: 'tag warn' }, 'Next: ' + String(v.next_step).slice(0, 40)) : null,
      v.sample === 'requested' ? h('span', { class: 'tag warn' }, 'Sample requested') : null,
      ph ? h('span', { class: 'tag' }, `${ph} photo${ph > 1 ? 's' : ''}`) : null,
      vn ? h('span', { class: 'tag' }, `${vn} voice note${vn > 1 ? 's' : ''}`) : null,
      inDrive ? h('span', { class: 'tag' }, `${inDrive} file${inDrive > 1 ? 's' : ''} in Drive`) : null,
      !v.supplier_id ? h('span', { class: 'tag warn' }, v.on_list === 'directory' ? 'Fair directory' : 'New supplier') : null,
      v.sync === 'synced' ? null : h('span', { class: 'tag ' + (v.sync === 'error' ? 'bad' : 'warn') }, v.sync === 'error' ? 'Upload problem' : 'Waiting to upload')));
}
const isHot = v => v.hot === '1' || v.hot === 1 || v.hot === true;
const hotTag = v => isHot(v) ? h('span', { class: 'tag hot' }, svg(ICON.flame, 12), ' Hot lead') : null;
function statusTag(s) {
  return s === 'revisit' ? h('span', { class: 'tag warn' }, 'Come back') : s === 'skipped' ? h('span', { class: 'tag bad' }, 'Skipped') : h('span', { class: 'tag ok' }, 'Visited');
}

// ---------- follow-ups: to do, end-of-day summary, all notes ----------
function viewFollow() {
  const view = S.followView || 'todo';
  return [segNav('followView', [['todo', 'To do'], ['summary', 'Day summary'], ['notes', 'All notes']]),
    view === 'summary' ? viewSummary() : view === 'notes' ? viewNotes() : viewTodo()];
}
function viewTodo() {
  const groups = [['Come back to the booth', v => v.status === 'revisit'], ['Hot leads', isHot],
    ['Samples requested', v => v.sample === 'requested'], ['Next steps', v => !!v.next_step]];
  const placed = new Set();
  const out = groups.map(([title, test]) => {
    const list = allVisits().filter(v => !placed.has(v.client_id) && test(v));
    list.forEach(v => placed.add(v.client_id));
    return list.length ? [h('div', { class: 'eyebrow' }, `${title} (${list.length})`), list.map(noteCard)] : null;
  }).filter(Boolean);
  return out.length ? out : h('div', { class: 'empty' }, 'Nothing to follow up yet. Mark a booth as Come back, Hot lead, Sample requested, or add a Next step - it shows up here.');
}
function viewSummary() {
  const days = S.data.days || [];
  if (S.sumDay == null) S.sumDay = Math.max(0, fairDay().i);
  const d = days[S.sumDay];
  if (!d) return h('div', { class: 'empty' }, 'No itinerary loaded yet.');
  const scope = S.sumScope || 'mine';
  const vs = allVisits().filter(v => String(v.saved_at || '').startsWith(d.date) && (scope === 'all' || !v.team));
  const seen = seenIds();
  const done = d.stops.filter(s => seen.has(String(s.id))).length;
  const missed = d.stops.filter(s => s.must_see && !seen.has(String(s.id)));
  const pick = test => vs.filter(test);
  const b = x => String(x.booth || '').split(',')[0].trim();
  const sections = [
    ['Hot leads', pick(isHot), v => `${v.supplier_name}${b(v) ? ` (${b(v)})` : ''}${v.contact_name ? ' - ' + v.contact_name : ''}`],
    ['Missed must-sees', missed, s => `${s.name_en} (${b(s)})`],
    ['Come back', pick(v => v.status === 'revisit'), v => `${v.supplier_name}${b(v) ? ` (${b(v)})` : ''}`],
    ['Samples requested', pick(v => v.sample === 'requested'), v => v.supplier_name],
    ['Next steps', pick(v => v.next_step), v => `${v.supplier_name}: ${v.next_step}`],
    ['New suppliers', pick(v => !v.supplier_id), v => `${v.supplier_name}${b(v) ? ` (${b(v)})` : ''}`],
  ].filter(x => x[1].length);
  const text = [`Canton Fair - ${d.label} (${d.display_date})${scope === 'mine' ? ' - ' + S.who : ' - team'}`,
    `Visited ${done} of ${d.count} planned stops - ${vs.length} booth note${vs.length === 1 ? '' : 's'} saved`,
    ...sections.flatMap(([t, list, fmt]) => ['', `${t} (${list.length}):`, ...list.map(x => '- ' + fmt(x))])].join('\n');
  return [
    h('div', { class: 'days' }, days.map((x, i) => h('button', { class: 'day' + (i === S.sumDay ? ' on' : ''), onclick: () => { S.sumDay = i; render(); } },
      h('b', {}, x.label.replace('Phase ', 'P').replace(' \u00b7 Day ', ' \u00b7 D')), h('span', {}, x.display_date.slice(0, 10))))),
    h('div', { class: 'seg' }, [['mine', 'Just me'], ['all', 'Both of us']].map(([k, l]) => h('button', { class: scope === k ? 'on' : '', onclick: () => { S.sumScope = k; render(); } }, l))),
    h('div', { class: 'card' }, h('div', { class: 'summary' },
      h('div', { class: 'kpi' }, h('b', {}, `${done}/${d.count}`), h('span', {}, 'planned stops')),
      h('div', { class: 'kpi' }, h('b', {}, String(vs.length)), h('span', {}, 'notes saved')),
      h('div', { class: 'kpi' }, h('b', {}, String(pick(isHot).length)), h('span', {}, 'hot leads')))),
    sections.length ? sections.map(([t, list, fmt]) => h('div', { class: 'card sum-sec' }, h('div', { class: 'section-title' }, `${t} (${list.length})`),
      h('ul', {}, list.map(x => h('li', {}, fmt(x)))))) : h('div', { class: 'empty' }, 'No notes saved on this day yet.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => shareText('Canton Fair day summary', text) }, svg(ICON.share, 18), 'Share summary'),
      h('button', { class: 'btn ghost', onclick: () => copyText(text, 'Summary copied') }, svg(ICON.copy, 18), 'Copy')),
  ];
}

// ---------- contacts: everyone we met, one tap to call, email, copy WeChat or save to the phone ----------
const splitMulti = s => String(s || '').split(/\s*[|,;\/]\s*/).map(x => x.trim()).filter(Boolean);
const contactsOf = () => allVisits().filter(v => v.contact_name || v.wechat || v.phone || v.email)
  .sort((a, b) => (isHot(b) - isHot(a)) || String(b.updated_local || b.saved_at).localeCompare(String(a.updated_local || a.saved_at)));
function viewContacts() {
  const all = contactsOf();
  const input = h('input', { class: 'i', type: 'search', placeholder: 'Name, company, WeChat, phone\u2026', value: S.cq || '', autocomplete: 'off',
    oninput: e => { S.cq = e.target.value; const old = $('#clist'); if (old) old.replaceWith(contactList()); } });
  return [
    h('div', { class: 'search', style: 'margin-top:4px' }, svg(ICON.search, 18), input),
    h('div', { class: 'seg', style: 'margin-top:10px' }, [['all', 'All'], ['hot', 'Hot leads'], ['mine', 'Mine']].map(([k, l]) =>
      h('button', { class: (S.cf || 'all') === k ? 'on' : '', onclick: () => { S.cf = k; render(); } }, l))),
    contactList(),
    all.length ? h('div', { class: 'card' }, h('div', { class: 'section-title' }, 'Export all contacts'),
      h('div', { class: 'hint' }, 'Works offline. Share to Contacts, email, Files or AirDrop.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn ghost', onclick: () => shareFile(`canton-contacts-${stamp().slice(0, 10)}.vcf`, vcard(all), 'text/vcard') }, svg(ICON.user, 18), 'Phone contacts'),
        h('button', { class: 'btn ghost', onclick: () => shareFile(`canton-contacts-${stamp().slice(0, 10)}.csv`, contactsCsv(all), 'text/csv') }, svg(ICON.download, 18), 'Spreadsheet (CSV)'))) : null,
  ];
}
function contactList() {
  const words = String(S.cq || '').toLowerCase().split(/\s+/).filter(Boolean);
  const list = contactsOf().filter(v => (S.cf === 'hot' ? isHot(v) : S.cf === 'mine' ? !v.team : true) &&
    words.every(w => [v.contact_name, v.supplier_name, v.wechat, v.phone, v.email, v.booth].join(' ').toLowerCase().includes(w)));
  return h('div', { id: 'clist' }, list.length ? list.map(contactCard)
    : h('div', { class: 'empty' }, contactsOf().length ? 'No match.' : 'No contacts yet. Scan a supplier\'s QR code or fill in Contact on a booth note - they appear here.'));
}
function contactCard(v) {
  const phones = splitMulti(v.phone), emails = splitMulti(v.email).filter(e => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e));
  const wechat = String(v.wechat || '').split('|')[0].trim();
  const qr = S.photos.find(p => p.client_id === v.client_id && /^qr_code_/.test(p.name || ''));
  const line = (label, val) => val ? h('div', { class: 'kv' }, h('span', {}, label), h('span', { class: 'sel' }, val)) : null;
  return h('div', { class: 'card contact' },
    h('button', { class: 'contact-head', onclick: () => openForm({ visit: v }) },
      h('div', { class: 'booth' }, v.contact_name || v.supplier_name),
      v.contact_name ? h('div', { class: 'meta' }, v.supplier_name) : null,
      h('div', { class: 'meta' }, [String(v.booth || '').split(',')[0], v.recorded_by].filter(Boolean).join(' \u00b7 ')),
      h('div', { class: 'tags' }, hotTag(v), v.rating ? h('span', { class: 'tag' }, '\u2605'.repeat(Number(v.rating))) : null)),
    line('WeChat', wechat), line('Phone', phones.join(', ')), line('Email', emails.join(', ')),
    h('div', { class: 'actions' },
      phones[0] ? h('a', { class: 'act', href: 'tel:' + phones[0].replace(/[^\d+]/g, '') }, svg(ICON.phone, 18), 'Call') : null,
      emails[0] ? h('a', { class: 'act', href: 'mailto:' + emails[0] }, svg(ICON.mail, 18), 'Email') : null,
      wechat ? h('button', { class: 'act', onclick: () => copyText(wechat, 'WeChat copied - paste it in WeChat \u2192 Add contacts') }, svg(ICON.copy, 18), 'WeChat') : null,
      qr ? h('button', { class: 'act', onclick: () => showPhoto(qr, 'WeChat / card QR code') }, svg(ICON.qr, 18), 'QR') : null,
      h('button', { class: 'act', onclick: () => shareFile(`${(v.contact_name || v.supplier_name).replace(/[^\w\u4e00-\u9fff -]+/g, '').slice(0, 40) || 'contact'}.vcf`, vcard([v]), 'text/vcard') }, svg(ICON.user, 18), 'Save')));
}
function showPhoto(p, title) {
  photoBlob(p).then(b => {
    if (!b) return toast('The photo is not on this phone');
    const url = URL.createObjectURL(b);
    const ed = h('div', { class: 'editor' },
      h('div', { class: 'row' }, h('b', {}, title), h('button', { class: 'btn', style: 'width:auto;padding:9px 16px', onclick: () => { URL.revokeObjectURL(url); ed.remove(); } }, 'Close')),
      h('div', { style: 'flex:1;overflow:auto;display:grid;place-items:center;padding-top:10px' }, h('img', { src: url, alt: title, style: 'max-width:100%;max-height:100%;background:#fff;border-radius:10px' })),
      h('p', { class: 'hint' }, 'In WeChat: + \u2192 Scan \u2192 photo icon, or show this screen to a colleague\'s WeChat scanner.'));
    document.body.append(ed);
  });
}
const vesc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
function vcard(list) {
  return list.map(v => {
    const name = v.contact_name || v.supplier_name;
    const note = [v.wechat && 'WeChat: ' + v.wechat, v.booth && 'Canton Fair booth ' + v.booth, v.next_step && 'Next step: ' + v.next_step].filter(Boolean).join('\n');
    return ['BEGIN:VCARD', 'VERSION:3.0', `N:${vesc(name)};;;;`, `FN:${vesc(name)}`, `ORG:${vesc(v.supplier_name)}`,
      ...splitMulti(v.phone).map(p => `TEL;TYPE=WORK,VOICE:${vesc(p)}`), ...splitMulti(v.email).map(e => `EMAIL;TYPE=INTERNET:${vesc(e)}`),
      note ? `NOTE:${vesc(note)}` : '', 'END:VCARD'].filter(Boolean).join('\r\n');
  }).join('\r\n') + '\r\n';
}
// a leading apostrophe stops spreadsheet apps running a cell as a formula
const csvCell = x => { let s = String(x == null ? '' : x); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
function contactsCsv(list) {
  const cols = [['Supplier', 'supplier_name'], ['Booth', 'booth'], ['Phase', 'phase'], ['Contact', 'contact_name'], ['WeChat', 'wechat'], ['Phone', 'phone'],
    ['Email', 'email'], ['Rating', 'rating'], ['Hot lead', v => isHot(v) ? 'yes' : ''], ['Outcome', 'status'], ['Products', 'products'], ['FOB price', 'fob_price'],
    ['MOQ', 'moq'], ['Next step', 'next_step'], ['Sample', 'sample'], ['Recorded by', 'recorded_by'], ['Saved at', 'saved_at']];
  const rows = [cols.map(c => csvCell(c[0])).join(','), ...list.map(v => cols.map(([, k]) => csvCell(typeof k === 'function' ? k(v) : v[k])).join(','))];
  return '\ufeff' + rows.join('\r\n') + '\r\n';
}
async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`${name} saved`);
}
async function shareText(title, text) {
  try { if (navigator.share) { await navigator.share({ title, text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  copyText(text, 'Copied - paste it into WeChat, WhatsApp or email');
}
async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg || 'Copied'); return; } catch (e) { /* older phones: fall back below */ }
  const ta = h('textarea', { style: 'position:fixed;top:0;opacity:0', readonly: '' });
  ta.value = text; document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  toast(ok ? (msg || 'Copied') : 'Could not copy - press and hold the text to copy it');
}

// ---------- USD <-> RMB converter (fixed rate set in Settings, works offline) ----------
const usdRate = () => Number(store.get('rate')) || 7.2;
function converter(onUse) {
  const num = s => parseFloat(String(s).replace(/[^\d.]/g, ''));
  const fmt = n => String(Math.round(n * 100) / 100);
  const rmb = h('input', { class: 'i', inputmode: 'decimal', placeholder: 'RMB \u00a5', 'aria-label': 'RMB',
    oninput: () => { const n = num(rmb.value); usd.value = isFinite(n) ? fmt(n / usdRate()) : ''; } });
  const usd = h('input', { class: 'i', inputmode: 'decimal', placeholder: 'USD $', 'aria-label': 'USD',
    oninput: () => { const n = num(usd.value); rmb.value = isFinite(n) ? fmt(n * usdRate()) : ''; } });
  return h('div', { class: 'conv' },
    h('div', { class: 'conv-row' }, rmb, h('span', { class: 'eq' }, '='), usd),
    h('div', { class: 'conv-foot' }, h('span', { class: 'hint', style: 'margin:0' }, `1 USD = ${usdRate()} RMB \u00b7 change in Settings`),
      onUse ? h('button', { class: 'link', onclick: () => { if (usd.value) onUse(usd.value, rmb.value); else toast('Type a price first'); } }, 'Use as FOB price') : null));
}

// ---------- the booth form ----------
const TEXT_FIELDS = ['contact_name', 'wechat', 'phone', 'email', 'products', 'notes', 'fob_price', 'moq', 'lead_time', 'next_step', 'new_name', 'new_booth', 'new_category'];

async function openForm({ supplier, visit, draft: fromDraft, directory }) {
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
  if (directory && !existing && !draft) {
    const b = directory.bo[0] || {};
    Object.assign(f.values, { new_name: directory.n, new_booth: directory.bo.map(x => x.b).join(', '), new_category: b.a || (directory.c || [])[0] || '', _dir: directory.id });
    f.phase = String(b.p || '');
  }
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
        mapButtons(sup.booth, sup.phase))
      : h('div', { class: 'card' }, h('div', { class: 'section-title' }, v._dir || (f.existing && f.existing.on_list === 'directory') ? 'From the fair directory' : 'New supplier'),
        v._dir ? h('div', { class: 'hint' }, 'Not on our list - your notes are saved as a separate fair-directory note.') : null,
        field('Company name *', 'new_name', { autocomplete: 'organization' }),
        h('div', { class: 'grid2' }, h('div', {}, field('Booth', 'new_booth', { placeholder: 'e.g. 12.2A19' })),
          h('div', {}, h('label', { class: 'f' }, 'Phase'), seg('phase_new', [['2', 'Phase 2'], ['3', 'Phase 3']], f.phase, x => { f.phase = x; setVal('phase', x); }))),
        field('Category / products', 'new_category'),
        mapButtons(v.new_booth, f.phase)),
      captureCard(f),
      h('div', { class: 'card' },
        h('div', { class: 'section-title' }, 'Contact'),
        field('Who we met', 'contact_name', { placeholder: 'Name and role' }),
        h('div', { class: 'grid2' }, h('div', {}, field('WeChat', 'wechat')), h('div', {}, field('Phone', 'phone', { type: 'tel', inputmode: 'tel' }))),
        field('Email', 'email', { type: 'email', inputmode: 'email', autocapitalize: 'off' })),
      h('div', { class: 'card' },
        h('div', { class: 'section-title' }, 'Discussion', h('button', { class: 'link', onclick: openEditor }, svg(ICON.expand, 16), ' Full screen')),
        field('Products discussed', 'products'),
        h('label', { class: 'f', for: 'f_notes' }, 'Notes'), notes,
        h('div', { class: 'hint' }, 'Tip: the microphone on your keyboard types what you say. A voice note keeps the recording itself.')),
      h('div', { class: 'card' },
        h('div', { class: 'section-title' }, 'Commercials'),
        h('div', { class: 'grid3' }, h('div', {}, field('FOB price', 'fob_price', { placeholder: 'USD' })), h('div', {}, field('MOQ', 'moq')), h('div', {}, field('Lead time', 'lead_time'))),
        h('label', { class: 'f' }, 'Price converter'),
        converter((usd, rmb) => { setVal('fob_price', `USD ${usd} (RMB ${rmb})`); renderForm(); toast('FOB price filled'); }),
        h('label', { class: 'f' }, 'Samples'),
        seg('sample', [['none', 'None'], ['requested', 'Requested'], ['received', 'Received']], v.sample, x => setVal('sample', x)),
        field('Next step', 'next_step', { placeholder: 'e.g. Send quote by 30 Oct' })),
      questionsCard(),
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
  return h('details', { class: 'card qref' },
    h('summary', {}, 'Booth questions ', h('span', { class: 'hint' }, '10-minute screen')),
    h('ol', {}, qs.map(q => h('li', {}, q))));
}

// ---------- 30-second capture: everything you do at a booth in one card ----------
function captureCard(f) {
  const v = f.values;
  const clips = f.photos.filter(p => p.kind === 'voice'), pics = f.photos.filter(p => p.kind !== 'voice');
  return h('div', { class: 'card capture' },
    h('div', { class: 'section-title' }, 'Capture', h('span', { class: 'hint', style: 'margin:0' }, S.quality === 'original' ? 'Original photos' : 'Photos optimized for roaming')),
    h('div', { class: 'tiles' },
      h('button', { class: 'tile', onclick: openScanner }, svg(ICON.qr, 24), 'Scan QR'),
      photoTile('card', 'Card photo', ICON.card),
      photoTile('product', 'Product photo', ICON.box),
      photoTile('booth', 'Booth photo', ICON.camera),
      h('button', { class: 'tile rec-btn', onclick: openRecorder }, svg(ICON.mic, 24), 'Voice note'),
      h('label', { class: 'tile', for: 'pick_voice' }, svg(ICON.audio, 24), 'Add recording',
        h('input', { id: 'pick_voice', type: 'file', class: 'hidden', multiple: true,
          accept: 'audio/*,.m4a,.mp3,.aac,.wav,.ogg,.opus,.webm,.amr,.3gp,.caf,.flac', onchange: addAudio }))),
    pics.length ? h('div', { class: 'thumbs', id: 'thumbs' }, pics.map(thumb)) : null,
    clips.length ? h('div', { class: 'clips' }, clips.map(clip)) : null,
    h('div', { class: 'rate-row' },
      h('div', { class: 'stars', id: 'stars' }, [1, 2, 3, 4, 5].map(n => h('button', { class: Number(v.rating) >= n ? 'on' : '', 'aria-label': `${n} stars`,
        onclick: () => { setVal('rating', Number(v.rating) === n ? '' : String(n)); renderForm(); } }, '\u2605'))),
      h('button', { class: 'hot-btn' + (isHot(v) ? ' on' : ''), 'aria-pressed': String(isHot(v)),
        onclick: () => { setVal('hot', isHot(v) ? '' : '1'); renderForm(); } }, svg(ICON.flame, 18), 'Hot lead')),
    seg('status', [['visited', 'Visited'], ['revisit', 'Come back'], ['skipped', 'Skipped']], v.status, x => setVal('status', x), 'status'));
}

function grow(t) {
  t.style.height = 'auto';
  t.style.height = Math.min(Math.max(170, t.scrollHeight + 4), Math.round(window.innerHeight * 0.6)) + 'px';
}

function photoTile(kind, label, icon) {
  const id = 'pick_' + kind;
  return h('label', { class: 'tile', for: id }, svg(icon, 24), label,
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
      const p = kind === 'voice' ? prepareAudio(file) : await prepare(file);
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

// ---------- voice notes: recorded on the phone, kept like photos, uploaded to the supplier's Drive folder ----------
const MAX_REC_SEC = 600;
const AUDIO_MIME = { m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  webm: 'audio/webm', amr: 'audio/amr', '3gp': 'audio/3gpp', caf: 'audio/x-caf', flac: 'audio/flac' };
const audioExt = mime => ({ 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav' })[mime] || 'm4a';
const clock = sec => `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`;
const clipUrls = new Map();
let recSession = null;

function prepareAudio(file) {
  const name = file.name || 'voice_note';
  const ext = (name.match(/\.([a-z0-9]{2,4})$/i) || [, ''])[1].toLowerCase();
  const mime = /^audio\//.test(file.type || '') ? file.type : AUDIO_MIME[ext];
  if (!mime) throw new Error(`${name} is not an audio recording`);
  if (!file.size) throw new Error(`${name} is empty`);
  if (file.size > MAX_FILE) throw new Error(`${name} is larger than 30 MB`);
  return { blob: file, mime, name, size: file.size, preview: false };
}
async function addAudio(e) {
  const files = [...e.target.files];
  e.target.value = '';
  const n = await addFiles(files, 'voice');
  if (n) toast(`${n} recording${n > 1 ? 's' : ''} added - tap Save notes to upload`);
}
function clip(p) {
  const state = p.sync === 'synced' ? 'in Drive' : p.sync === 'error' ? 'upload problem' : p.sync === 'held' ? 'not saved yet' : 'waiting to upload';
  const audio = h('audio', { controls: true, preload: 'metadata' });
  if (clipUrls.has(p.photo_id)) audio.src = clipUrls.get(p.photo_id);
  else photoBlob(p).then(b => { if (b) { const u = URL.createObjectURL(b); clipUrls.set(p.photo_id, u); audio.src = u; } });
  return h('div', { class: 'clip' },
    h('div', { class: 'clip-top' }, svg(ICON.mic, 16), h('b', {}, 'Voice note'),
      h('span', { class: 'hint' }, [p.duration ? clock(p.duration) : '', kb(p.size || 0), state].filter(Boolean).join(' \u00b7 ')),
      p.sync === 'held' ? h('button', { class: 'x', 'aria-label': 'Remove voice note', onclick: () => removePhoto(p) }, '\u00d7') : null),
    audio);
}
function dropClipUrls() {
  for (const u of clipUrls.values()) URL.revokeObjectURL(u);
  clipUrls.clear();
}
function pickAudioType() {
  for (const t of ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (e) { /* very old browser: use its default */ }
  }
  return '';
}
async function openRecorder() {
  if (recSession || !S.form) return;
  if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return dialog('Recording not available here', 'Record with the phone\'s own voice recorder app, then tap Add recording.', [{ label: 'OK', value: true }]);
  }
  const f = S.form;
  const time = h('div', { class: 'rec-time' }, '0:00');
  const msg = h('div', { class: 'rec-msg' }, 'Starting the microphone\u2026');
  const stopBtn = h('button', { class: 'btn', disabled: true, onclick: () => stopRecording('save') }, 'Stop & save');
  const box = h('div', { class: 'scrim rec', role: 'dialog', 'aria-label': 'Record voice note' },
    h('div', { class: 'dialog' }, h('h2', {}, h('span', { class: 'rec-dot' }), 'Voice note'), time, msg, stopBtn,
      h('button', { class: 'btn ghost', onclick: cancelRecording }, 'Cancel')));
  document.body.append(box);
  const s = recSession = { box, time, msg, stopBtn, f, id: uid(), label: stamp().replace(/[-: ]/g, ''), added_at: new Date().toISOString(),
    chunks: [], chain: Promise.resolve(), start: 0, end: 0, savedAt: 0, wasDirty: f.dirty };
  // a draft keeps the note (and a recording cut short by the phone) on the phone if the app is closed before Save
  f.dirty = true; store.setJson('draft_' + f.client_id, f.values);
  try {
    s.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (recSession !== s) { s.stream.getTracks().forEach(t => t.stop()); return; }
    const type = pickAudioType();
    try { s.rec = new MediaRecorder(s.stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 64000 }); }
    catch (e) { s.rec = new MediaRecorder(s.stream); }
    s.type = type;
    s.rec.ondataavailable = e => { if (e.data && e.data.size) s.chunks.push(e.data); };
    s.rec.onstop = () => finishRecording(s);
    s.rec.start(1000);
  } catch (e) {
    if (recSession !== s) return;
    closeRecorder(s, true);
    return dialog('Microphone not available', e && e.name === 'NotAllowedError'
      ? 'Allow the microphone for this app and try again (iPhone: tap Allow when asked; if it was refused, close the app fully and reopen it). Or record with the phone\'s voice recorder app and tap Add recording.'
      : 'The microphone could not start. Record with the phone\'s voice recorder app, then tap Add recording.', [{ label: 'OK', value: true }]);
  }
  s.start = Date.now();
  s.timer = setInterval(() => tickRecorder(s), 500);
  msg.textContent = 'Recording. Keep this screen open - locking the phone or switching apps stops the recording and saves it.';
  stopBtn.disabled = false;
  try {
    s.wake = await navigator.wakeLock.request('screen');
    if (s.stopping) s.wake.release().catch(() => {});
  } catch (e) { /* no wake lock: the screen may dim, recording continues */ }
}
function tickRecorder(s) {
  const sec = (Date.now() - s.start) / 1000;
  s.time.textContent = clock(sec);
  if (sec >= MAX_REC_SEC) return stopRecording('save', '10-minute limit reached - voice note saved. Record another one to continue.');
  if (sec - s.savedAt >= 20) { s.savedAt = sec; checkpoint(s, false); }
}
// writes what is recorded so far to the phone (every 20 s and at the end); a crash loses at most the last 20 seconds
function checkpoint(s, final) {
  s.chain = s.chain.then(async () => {
    const mime = String((s.chunks[0] && s.chunks[0].type) || (s.rec && s.rec.mimeType) || s.type || 'audio/mp4').split(';')[0];
    const blob = new Blob(s.chunks, { type: mime });
    if (!blob.size) return null;
    const rec = { photo_id: s.id, client_id: s.f.client_id, kind: 'voice', name: `voice_note_${s.label}.${audioExt(mime)}`, mime, size: blob.size,
      duration: Math.round(((s.end || Date.now()) - s.start) / 1000), preview: false, sync: 'held', added_at: s.added_at, partial: !final };
    await DB.put('blobs', { photo_id: s.id, blob });
    await DB.put('photos', rec);
    return rec;
  }).catch(e => { toast('Could not save the recording: ' + e.message); return null; });
  return s.chain;
}
function stopRecording(mode, note) {
  const s = recSession;
  if (!s || s.stopping) return;
  Object.assign(s, { stopping: true, cancel: mode === 'cancel', note, end: Date.now() });
  s.stopBtn.disabled = true; s.msg.textContent = 'Saving\u2026';
  try { if (s.rec && s.rec.state !== 'inactive') { s.rec.stop(); return; } } catch (e) { /* already stopped */ }
  finishRecording(s);
}
async function cancelRecording() {
  const s = recSession;
  if (s && s.start && Date.now() - s.start > 5000 && !(await dialog('Discard this recording?', 'It will not be saved.',
    [{ label: 'Discard', value: true, style: 'danger' }, { label: 'Keep recording', value: false, style: 'ghost' }]))) return;
  stopRecording('cancel');
}
async function finishRecording(s) {
  if (s.finished) return;
  s.finished = true;
  s.end = s.end || Date.now();
  clearInterval(s.timer);
  if (s.stream) s.stream.getTracks().forEach(t => t.stop());
  if (s.wake) s.wake.release().catch(() => {});
  const rec = s.cancel ? null : await checkpoint(s, true);
  if (s.cancel) { await s.chain; await dropPhoto(s.id); }
  closeRecorder(s, s.cancel);
  if (s.cancel) return;
  if (!rec) { toast('Nothing was recorded - try again'); return; }
  const f = s.f;
  f.photos = f.photos.filter(p => p.photo_id !== rec.photo_id).concat(rec);
  f.dirty = true; store.setJson('draft_' + f.client_id, f.values);
  if (S.form !== f) return;
  if (document.visibilityState === 'hidden') {
    const ok = await saveForm({ auto: true });
    if (S.form === f) renderForm();
    if (ok) sync();
    return;
  }
  renderForm();
  toast(s.note || (s.stopping ? 'Voice note added - tap Save notes to upload' : 'The phone stopped the recording - what was recorded is saved'));
}
function closeRecorder(s, nothingKept) {
  clearInterval(s.timer);
  if (s.stream) s.stream.getTracks().forEach(t => t.stop());
  if (recSession === s) recSession = null;
  s.box.remove();
  if (nothingKept && !s.wasDirty) { s.f.dirty = false; store.del('draft_' + s.f.client_id); }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && recSession) stopRecording('save', 'Recording stopped when you left the app - voice note saved');
});

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
async function nativeDetector() {
  if (qrDetector !== undefined) return qrDetector;
  qrDetector = null;
  try {
    if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code'))
      qrDetector = new BarcodeDetector({ formats: ['qr_code'] });
  } catch (e) { qrDetector = null; }
  return qrDetector;
}
// the phone's built-in reader is fastest; jsQR also runs every 3rd live frame because some Androids without Google
// services expose a built-in reader that never finds anything
async function decodeCanvas(c, thorough, frame = 0) {
  const bd = await nativeDetector();
  if (bd) {
    try { const r = await bd.detect(c); if (r[0] && r[0].rawValue) return r[0].rawValue; } catch (e) { qrDetector = null; }
    if (!thorough && frame % 3 && qrDetector) return '';
  }
  const jsQR = await loadJsQR();
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
  const r = jsQR(d.data, d.width, d.height, { inversionAttempts: thorough ? 'attemptBoth' : 'dontInvert' });
  return r ? r.data : '';
}
async function decodeImageFile(file) {
  const img = await decodable(file);
  if (!img) return '';
  const W = img.naturalWidth, H = img.naturalHeight;
  try {
    // whole photo at three sizes, then zoom into the middle (people centre the QR) for small or distant codes
    for (const [crop, max] of [[1, 1200], [1, 2000], [0.5, 1600], [0.3, 1400], [1, 700]]) {
      const sw = Math.round(W * crop), sh = Math.round(H * crop);
      const sc = Math.min(1, max / Math.max(sw, sh));
      const c = h('canvas', { width: Math.round(sw * sc), height: Math.round(sh * sc) });
      c.getContext('2d', { willReadFrequently: true }).drawImage(img, Math.round((W - sw) / 2), Math.round((H - sh) / 2), sw, sh, 0, 0, c.width, c.height);
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
  const id = s.loop = (s.loop || 0) + 1;   // a camera restart must never leave two loops running
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  let frame = 0;
  const tick = async () => {
    if (scanSession !== s || s.done || !s.stream || s.loop !== id) return;
    const v = s.video;
    if (!s.busy && v.readyState >= 2 && v.videoWidth) {
      s.busy = true;
      try {
        const sc = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth * sc); c.height = Math.round(v.videoHeight * sc);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const text = await decodeCanvas(c, false, frame++);
        if (text && scanSession === s && !s.done) {
          const full = h('canvas', { width: v.videoWidth, height: v.videoHeight });
          full.getContext('2d').drawImage(v, 0, 0);
          const shot = await new Promise(r => full.toBlob(r, 'image/jpeg', 0.92));
          return gotCode(text, shot);
        }
      } catch (e) { if (/QR reader/.test(e && e.message)) s.msg.textContent = e.message; } finally { s.busy = false; }
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
  try { text = await decodeImageFile(file); } catch (e) { if (scanSession === s) s.msg.textContent = e.message; return; }
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
    supplier_id: sup ? sup.id : '', supplier_name: name, on_list: sup ? (sup.shortlist ? 'shortlist' : 'backup') : (v._dir || (f.existing && f.existing.on_list === 'directory') ? 'directory' : 'new'),
    phase: f.phase || '', booth: sup ? (sup.booth || '') : String(v.new_booth || '').trim(), category: sup ? (sup.subcategory || sup.category || '') : String(v.new_category || '').trim(),
    status: v.status || 'visited', rating: v.rating || '', sample: v.sample || 'none', hot: isHot(v) ? '1' : '', sync: 'pending', error: '',
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
  S.form = null; $('#form').remove(); dropClipUrls();
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
  S.form = null; const el = $('#form'); if (el) el.remove(); dropClipUrls();
  render();
}

async function deleteVisit(f) {
  const ok = await dialog('Delete this note?', 'It is removed from this phone. Anything already uploaded stays in Google Drive.', [
    { label: 'Delete', value: true, style: 'danger' }, { label: 'Cancel', value: false, style: 'ghost' }]);
  if (!ok) return;
  for (const p of await DB.photosOf(f.client_id)) await dropPhoto(p.photo_id);
  await DB.del('visits', f.client_id);
  store.del('draft_' + f.client_id);
  S.form = null; $('#form').remove(); dropClipUrls();
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
      h('div', { class: 'kv' }, h('span', {}, 'Photos & voice notes waiting'), h('span', {}, `${pPend.length}${pPend.length ? ' \u00b7 ' + kb(bytes) : ''}`)),
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
      h('label', { class: 'f' }, 'Price converter: 1 USD = ? RMB'),
      h('input', { class: 'i', inputmode: 'decimal', value: String(usdRate()), onchange: e => {
        const n = parseFloat(e.target.value);
        if (n > 0 && n < 100) { store.set('rate', String(n)); toast('Rate saved'); } else { e.target.value = String(usdRate()); toast('Enter a rate like 7.2'); }
      } }),
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
// if the QR reader is missing from the offline cache (e.g. an update interrupted by a signal drop), fetch it while online
setTimeout(async () => { try { if (!window.caches || !(await caches.match('jsqr.js'))) await loadJsQR(); } catch (e) { /* retried next start */ } }, 3000);

(async () => {
  await loadLocal();
  for (const p of S.photos.filter(x => x.sync === 'held')) {
    if (p.partial && S.visits.some(v => v.client_id === p.client_id)) {   // a recording cut off by a crash: keep what was captured
      await DB.put('photos', { ...p, sync: 'pending', partial: false });
      continue;
    }
    if (!store.json('draft_' + p.client_id)) await dropPhoto(p.photo_id);   // photos from a form that was never saved
  }
  await loadLocal();
  render();
  openFromHash();
  sync();
})();
