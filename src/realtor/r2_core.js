/* BSG realtor app — everything inside one namespace (window.BSGR). */
(function () {
'use strict';

const CFG = {
  url: 'https://qjfbcxenmmathoxunrrm.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZmJjeGVubW1hdGhveHVucnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDU0ODQsImV4cCI6MjA5ODIyMTQ4NH0.p6bsLYT726JdKBzZKNBnYjjbp2iYofTHcGy8SBCyS60',
  answeredPage: 20,
  pendingMax: 200,
  pollMs: 45000,
  version: '1.1',
  keyPrefix: 'bsgr_',
};
const ROOT = document.getElementById('bsgr');

/* ============================ small helpers ============================ */
const $ = (s, r) => (r || ROOT).querySelector(s);
const $$ = (s, r) => Array.from((r || ROOT).querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TZ = 'Asia/Baghdad';
const NF = new Intl.NumberFormat('en-US');
const fmtN = (n) => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '—' : NF.format(Number(n));
const toLatin = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const digits = (s) => toLatin(s).replace(/\D/g, '');
const normTxt = (s) => toLatin(s).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ە').replace(/[\u064B-\u065F\u0640]/g, '').replace(/\s+/g, ' ').trim();
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
const isPhoneNum = (n) => /^\+?\d{8,15}$/.test(String(n || '').replace(/[\s-]/g, ''));
const waUrl = (num, text) => 'https://wa.me/' + digits(num) + (text ? '?text=' + encodeURIComponent(text) : '');
const telUrl = (num) => 'tel:+' + digits(num);
const isoPlain = (d) => new Date(d).toISOString();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bidi = (s) => '\u2066' + s + '\u2069';
const niceNum = (num) => { const d = digits(num); return d.startsWith('964') ? '0' + d.slice(3) : (d || String(num || '')); };

function lsGet(k, d) { try { const v = localStorage.getItem(CFG.keyPrefix + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(CFG.keyPrefix + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
function lsDel(k) { try { localStorage.removeItem(CFG.keyPrefix + k); } catch (e) { /* ignore */ } }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

const YMD = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const DD = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const TT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const toDate = (iso) => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d; };
const ymdOf = (iso) => { const d = toDate(iso); return d ? YMD.format(d) : ''; };
const fmtD = (iso) => { const d = toDate(iso); return d ? DD.format(d) : '—'; };
const fmtT = (iso) => { const d = toDate(iso); return d ? TT.format(d) : ''; };
const fmtDT = (iso) => { const d = toDate(iso); return d ? DD.format(d) + ' · ' + TT.format(d) : '—'; };
function ago(iso, withSuffix) {
  const d = toDate(iso); if (!d) return '';
  const s = (Date.now() - d.getTime()) / 1000; const suf = withSuffix ? ' لەمەوبەر' : '';
  if (s < 60) return 'ئێستا';
  const m = Math.floor(s / 60); if (m < 60) return m + ' خولەک' + suf;
  const h = Math.floor(m / 60); if (h < 24) return h + ' کاتژمێر' + suf;
  const dd = Math.floor(h / 24); if (dd === 1) return 'دوێنێ';
  if (dd < 30) return dd + ' ڕۆژ' + suf;
  return fmtD(iso);
}
function dur(mins) {
  if (mins === null || mins === undefined || isNaN(mins)) return '—';
  mins = Math.max(0, Math.round(mins));
  if (mins < 1) return 'کەمتر لە ١ خولەک';
  if (mins < 60) return mins + ' خولەک';
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return h + ' کاتژمێر' + (m && h < 6 ? ' و ' + m + ' خولەک' : '');
  return Math.round(h / 24) + ' ڕۆژ';
}
function durShort(mins) {
  if (mins === null || mins === undefined || isNaN(mins)) return '—';
  mins = Math.max(0, Math.round(mins));
  if (mins < 60) return mins + ' خولەک';
  const h = Math.floor(mins / 60);
  if (h < 24) return h + ' کاتژمێر';
  return Math.round(h / 24) + ' ڕۆژ';
}
function durParts(mins) {
  if (mins === null || mins === undefined || isNaN(mins)) return null;
  mins = Math.max(0, mins);
  if (mins < 90) return [String(Math.max(1, Math.round(mins))), 'خولەک'];
  if (mins < 48 * 60) return [String(Math.round(mins / 6) / 10), 'کاتژمێر'];
  return [String(Math.round(mins / 1440)), 'ڕۆژ'];
}
function dayLabel(iso) {
  const y = ymdOf(iso); if (!y) return '';
  const today = YMD.format(new Date());
  const yest = YMD.format(new Date(Date.now() - 864e5));
  if (y === today) return 'ئەمڕۆ';
  if (y === yest) return 'دوێنێ';
  return fmtD(iso);
}
const initials = (name) => { const p = String(name || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || ''); };

/* ============================ icons ============================ */
const ICONS = {
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.7"/><path d="M19 12.9a10 10 0 0 0-2.3-1.6"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/>',
  bot: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/><path d="M8 13v2M16 13v2"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8z"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  share: '<path d="M12 3v13"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  plusSq: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  sparkle: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  sort: '<path d="M3 6h13"/><path d="M3 12h9"/><path d="M3 18h5"/><path d="m17 15 3 3 3-3"/><path d="M20 18V6"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
};
function ic(name, size, cls) {
  const s = size || 18;
  return `<svg class="ic ${cls || ''}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ============================ errors ============================ */
class ApiError extends Error {
  constructor(message, code, status) { super(message); this.code = code || ''; this.status = status || 0; }
}
function humanError(e) {
  const m = String((e && e.message) || e || '');
  const map = [
    [/invalid login credentials|invalid_credentials/i, 'ئیمەیڵ یان وشەی نهێنی هەڵەیە. دووبارە هەوڵ بدەرەوە.'],
    [/email not confirmed/i, 'ئەم هەژمارە هێشتا چالاک نەکراوە. پەیوەندی بە بەڕێوەبەرەوە بکە.'],
    [/^network$/i, 'ئینتەرنێت نییە. پەیوەندییەکەت بپشکنە و دووبارە هەوڵ بدەرەوە.'],
    [/session_expired|jwt expired|invalid jwt/i, 'کاتی چوونەژوورەوەت تەواو بوو. تکایە دووبارە بچۆ ژوورەوە.'],
    [/already answered/i, 'ئەم نامەیە پێشتر وەرگیراوە.'],
    [/not your lead/i, 'ئەم نامەیە ئێستا هی تۆ نییە — لەوانەیە گوازرابێتەوە.'],
    [/not your post/i, 'تەنها دەتوانیت پۆستی خۆت دەستکاری بکەیت.'],
    [/lead not found/i, 'ئەم نامەیە نەدۆزرایەوە.'],
    [/forbidden/i, 'ئەم کارە بۆ تۆ ڕێگەپێدراو نییە.'],
    [/rate limit|too many/i, 'زۆر هەوڵت دا. کەمێک چاوەڕێ بکە و دووبارە هەوڵ بدەرەوە.'],
  ];
  for (const [re, txt] of map) if (re.test(m)) return txt;
  return 'هەڵەیەک ڕوویدا. دووبارە هەوڵ بدەرەوە.';
}

/* ============================ auth ============================ */
const auth = {
  s: lsGet('session_v1', null),
  save(j) {
    this.s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600)), email: (j.user && j.user.email) || (this.s && this.s.email) || '' };
    lsSet('session_v1', this.s);
  },
  clear() { this.s = null; lsDel('session_v1'); },
  async signIn(email, password) {
    let r;
    try {
      r = await fetch(CFG.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: CFG.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    } catch (e) { throw new ApiError('network', 'network', 0); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(j.error_description || j.msg || j.message || j.error || 'login failed', j.error_code || j.error, r.status);
    this.save(j);
  },
  async refresh() {
    if (this._ref) return this._ref;
    const rt = this.s && this.s.refresh_token;
    if (!rt) throw new ApiError('session_expired', 'session', 401);
    this._ref = (async () => {
      let r;
      try {
        r = await fetch(CFG.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: CFG.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) });
      } catch (e) { throw new ApiError('network', 'network', 0); }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { this.clear(); throw new ApiError('session_expired', 'session', 401); }
      this.save(j);
    })();
    try { return await this._ref; } finally { this._ref = null; }
  },
  async token() {
    if (!this.s) throw new ApiError('session_expired', 'session', 401);
    if (Date.now() / 1000 > (this.s.expires_at || 0) - 90) await this.refresh();
    return this.s.access_token;
  },
  async signOut() {
    const tok = this.s && this.s.access_token;
    this.clear();
    if (tok) { try { await fetch(CFG.url + '/auth/v1/logout', { method: 'POST', headers: { apikey: CFG.anon, Authorization: 'Bearer ' + tok } }); } catch (e) { /* ignore */ } }
  },
};

async function api(path, opts, retried) {
  const o = opts || {};
  const tok = await auth.token();
  const h = { apikey: CFG.anon, Authorization: 'Bearer ' + tok };
  let payload;
  if (o.body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(o.body); }
  let r;
  try { r = await fetch(CFG.url + path, { method: o.method || 'GET', headers: h, body: payload }); }
  catch (e) { throw new ApiError('network', 'network', 0); }
  if (r.status === 401 && !retried) { await auth.refresh(); return api(path, o, true); }
  const text = await r.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
  if (!r.ok) {
    const msg = (data && typeof data === 'object' && (data.message || data.error_description || data.error || data.msg)) || ('HTTP ' + r.status);
    throw new ApiError(msg, data && data.code, r.status);
  }
  return data;
}
const rpc = (fn, args) => api('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {} });
const get = (pathQuery) => api('/rest/v1/' + pathQuery);
const pgQuote = (s) => '"' + String(s).replace(/["\\]/g, '') + '"';

/* ============================ ui helpers ============================ */
function toast(msg, type, ms) {
  let box = $('.r-toasts');
  if (!box) { box = document.createElement('div'); box.className = 'r-toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); ROOT.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'r-toast' + (type === 'err' ? ' err' : '');
  el.innerHTML = ic(type === 'err' ? 'alert' : 'checkCircle', 18) + `<span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms || (type === 'err' ? 5500 : 2600));
}
function toastErr(e) {
  if (e && e.code === 'session') { auth.clear(); App.showLogin(humanError(e)); return; }
  if (e && e.code === 'network') App.setOnline(false);
  toast(humanError(e), 'err');
}
function busy(btn, on) {
  if (!btn) return;
  btn.classList.toggle('busy', !!on);
  btn.disabled = !!on;
  if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
}

// bottom sheet: {title, html, actions:[{label, cls, onClick(sheet) -> false keeps open}], onOpen}
const sheets = [];
function sheet(o) {
  const el = document.createElement('div');
  el.className = 'r-sheet';
  el.innerHTML = `<div class="r-sheet-scrim"></div>
    <div class="r-sheet-card" role="dialog" aria-modal="true" aria-label="${esc(o.title || '')}">
      <div class="r-grab" aria-hidden="true"></div>
      ${o.title ? `<h2>${esc(o.title)}</h2>` : ''}
      <div class="r-sheet-body">${o.html || ''}</div>
      <div class="r-err" hidden></div>
      <div class="r-sheet-acts">${(o.actions || []).map((a, i) => a.href
        ? `<a class="r-btn big ${a.cls || ''}" data-i="${i}" href="${esc(a.href)}" target="_blank" rel="noopener">${a.icon ? ic(a.icon, 20) : ''}${esc(a.label)}</a>`
        : `<button type="button" class="r-btn big ${a.cls || ''}" data-i="${i}">${a.icon ? ic(a.icon, 20) : ''}${esc(a.label)}</button>`).join('')}
        <button type="button" class="r-btn big ghost" data-close>${esc(o.cancel || 'داخستن')}</button>
      </div>
    </div>`;
  ROOT.appendChild(el);
  const prev = document.activeElement;
  const inst = {
    el,
    close() { const i = sheets.indexOf(inst); if (i >= 0) sheets.splice(i, 1); el.remove(); if (o.onClose) o.onClose(); try { if (prev && prev.focus) prev.focus(); } catch (e) { /* ignore */ } },
    error(msg) { const e = $('.r-err', el); e.textContent = msg || ''; e.hidden = !msg; },
  };
  sheets.push(inst);
  $('.r-sheet-scrim', el).addEventListener('click', () => inst.close());
  $('[data-close]', el).addEventListener('click', () => inst.close());
  $$('[data-i]', el).forEach((b) => b.addEventListener('click', async (ev) => {
    const a = o.actions[+b.dataset.i];
    if (!a.onClick) { if (a.href) setTimeout(() => inst.close(), 300); return; }
    if (a.href) { a.onClick(inst, ev); setTimeout(() => inst.close(), 300); return; }
    inst.error('');
    busy(b, true);
    try { const r = await a.onClick(inst, ev); if (r !== false) inst.close(); }
    catch (e) { inst.error(humanError(e)); if (e && e.code === 'session') { inst.close(); toastErr(e); } }
    finally { if (el.isConnected) busy(b, false); }
  }));
  if (o.onOpen) o.onOpen(inst);
  setTimeout(() => { const f = $('[autofocus]', el) || $('.r-sheet-acts .r-btn', el); if (f) f.focus(); }, 30);
  return inst;
}
function closeTopSheet() { const s = sheets[sheets.length - 1]; if (s) { s.close(); return true; } return false; }

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) {
    try {
      const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e2) { return false; }
  }
}

/* ============================ lightbox ============================ */
function lightbox(urls, start) {
  let i = start || 0;
  const el = document.createElement('div');
  el.className = 'r-lb';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'وێنە');
  const paint = () => {
    el.innerHTML = `<img src="${esc(urls[i])}" alt="">
      <button type="button" class="r-btn icon r-lb-x" aria-label="داخستن">${ic('x', 22)}</button>
      ${urls.length > 1 ? `<button type="button" class="r-btn icon r-lb-nav r-lb-prev" aria-label="پێشوو">${ic('chevR', 24)}</button>
      <button type="button" class="r-btn icon r-lb-nav r-lb-next" aria-label="دواتر">${ic('chevL', 24)}</button>
      <div class="r-lb-n">${fmtN(i + 1)} / ${fmtN(urls.length)}</div>` : ''}`;
  };
  paint();
  el.addEventListener('click', (e) => {
    if (e.target.closest('.r-lb-prev')) { i = (i - 1 + urls.length) % urls.length; paint(); return; }
    if (e.target.closest('.r-lb-next')) { i = (i + 1) % urls.length; paint(); return; }
    el.remove();
  });
  let sx = null;
  el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (sx == null || urls.length < 2) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) < 50) return;
    i = dx > 0 ? (i + 1) % urls.length : (i - 1 + urls.length) % urls.length; // RTL: swipe right = next
    paint();
  });
  ROOT.appendChild(el);
}
