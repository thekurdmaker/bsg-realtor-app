(() => {
'use strict';

/* =====================================================================
   CONFIG — the anon key is the public key (same one the app ships with).
   Security comes from your manager login + the role checks in Supabase.
   ===================================================================== */
const CFG = {
  url: 'https://qjfbcxenmmathoxunrrm.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZmJjeGVubW1hdGhveHVucnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDU0ODQsImV4cCI6MjA5ODIyMTQ4NH0.p6bsLYT726JdKBzZKNBnYjjbp2iYofTHcGy8SBCyS60',
  bucket: 'lead-media',
  pageSize: 30,
  postsPageSize: 25,
  realtorApp: 'bsglink.online',
  tagMax: 80,
  maxUpload: 16 * 1024 * 1024,
  pollMs: 45000,
};

/* ============================ utils ============================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TZ = 'Asia/Baghdad';
const NF = new Intl.NumberFormat('en-US');
const fmtN = (n) => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '—' : NF.format(Number(n));
const pct = (a, b) => (Number(b) > 0 ? Math.round((Number(a) * 100) / Number(b)) : null);
const money = (n) => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '—' : '$' + (Number(n) >= 100 ? Math.round(Number(n)) : Number(n).toFixed(2).replace(/\.00$/, ''));
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const toLatin = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const digits = (s) => toLatin(s).replace(/\D/g, '');
const isPhone = (n) => /^\+?\d{7,15}$/.test(String(n || '').replace(/[\s-]/g, ''));
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '#');
const waLink = (num, text) => 'https://wa.me/' + digits(num) + (text ? '?text=' + encodeURIComponent(text) : '');
const normTxt = (s) => toLatin(s).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ە').replace(/[\u064B-\u065F\u0640]/g, '').replace(/\s+/g, ' ').trim();
const cleanSpaces = (s) => String(s || '').replace(/[ \t\u00A0]+/g, ' ').trim();

const YMD = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const DT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DD = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const TT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const toDate = (iso) => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d; };
const todayYMD = () => YMD.format(new Date());
const ymdOf = (iso) => { const d = toDate(iso); return d ? YMD.format(d) : ''; };
function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function fmtDT(iso) { const d = toDate(iso); if (!d) return '—'; const p = DT.formatToParts(d); const g = (t) => (p.find((x) => x.type === t) || {}).value; return `${g('day')}/${g('month')}/${g('year')} · ${g('hour')}:${g('minute')}`; }
const fmtD = (iso) => { const d = toDate(iso); return d ? DD.format(d) : '—'; };
const fmtT = (iso) => { const d = toDate(iso); return d ? TT.format(d) : ''; };
function ago(iso, long) {
  const d = toDate(iso); if (!d) return '';
  const s = (Date.now() - d.getTime()) / 1000; const suf = long ? ' لەمەوبەر' : '';
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
  if (mins < 60) return mins + ' خولەک';
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 48) return h + ' کاتژمێر' + (m ? ' و ' + m + ' خولەک' : '');
  return Math.floor(h / 24) + ' ڕۆژ';
}
const minsUntil = (iso) => { const d = toDate(iso); return d ? (d.getTime() - Date.now()) / 60000 : null; };

/* ============================ icons ============================ */
const ICONS = {
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  sliders: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowL: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
  bot: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/><path d="M8 13v2M16 13v2"/>',
  note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8z"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
  wand: '<path d="m15 4-1 1 5 5 1-1a3.54 3.54 0 0 0-5-5z"/><path d="M14 5 3 16l5 5 11-11"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  dollar: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  trendUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  trendDown: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
};
function ic(name, size = 16, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ============================ errors ============================ */
class ApiError extends Error {
  constructor(message, code, status, data) { super(message); this.code = code || ''; this.status = status || 0; this.data = data; }
}
function humanError(e) {
  const m = String((e && e.message) || e || '');
  const code = e && e.code;
  const map = [
    [/forbidden/i, 'ئەم کارە تەنها بۆ بەڕێوەبەرە.'],
    [/cannot be (reassigned|reattached)/i, 'نامەی وەرگیراو یان داخراو ناگوازرێتەوە و بە پۆستەوە نابەسترێتەوە.'],
    [/answered leads cannot be deleted/i, 'نامەی وەرگیراو ناسڕدرێتەوە.'],
    [/post code .* already used|duplicate key.*post_code/i, 'ئەم کۆدە پێشتر بەکارهاتووە.'],
    [/post code required/i, 'کۆدی پۆست پێویستە.'],
    [/either a realtor/i, 'کارمەندێک یان گرووپێک هەڵبژێرە.'],
    [/group has no members/i, 'ئەم گرووپە هیچ ئەندامێکی نییە.'],
    [/window_closed/i, 'پەنجەرەی ٢٤ کاتژمێری واتسئاپ داخراوە — کڕیار دەبێت سەرەتا نامە بنێرێت.'],
    [/twilio_failed/i, 'ناردن سەرکەوتوو نەبوو (Twilio).'],
    [/lead not found/i, 'ئەم نامەیە نەدۆزرایەوە — لەوانەیە سڕابێتەوە.'],
    [/number required/i, 'ژمارە پێویستە.'],
    [/invalid login credentials|invalid_credentials/i, 'ئیمەیڵ یان وشەی نهێنی هەڵەیە.'],
    [/email not confirmed/i, 'ئیمەیڵەکە پشتڕاست نەکراوەتەوە.'],
    [/session_expired|jwt expired|invalid jwt/i, 'کاتی چوونەژوورەوە تەواو بووە — دووبارە بچۆ ژوورەوە.'],
    [/^network$/i, 'پەیوەندی بە سێرڤەرەوە نییە — ئینتەرنێتەکەت بپشکنە.'],
    [/payload too large|exceeded the maximum/i, 'فایلەکە زۆر گەورەیە.'],
  ];
  for (const [re, txt] of map) if (re.test(m)) return txt;
  if (code === 'PGRST202') return 'ئەم کارە لە داتابەیس نەدۆزرایەوە.';
  if (code === '42501') return 'دەسەڵاتی ئەم کارەت نییە.';
  return m || 'هەڵەیەک ڕوویدا.';
}

/* ============================ auth + api ============================ */
const SKEY = 'bsg_mgr_session_v1';
const auth = {
  s: null, _ref: null,
  load() { this.s = lsGet(SKEY, null); return this.s; },
  save(j) {
    this.s = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      email: (j.user && j.user.email) || (this.s && this.s.email) || '',
    };
    lsSet(SKEY, this.s);
  },
  clear() { this.s = null; lsDel(SKEY); },
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

async function api(path, opts = {}, _retried) {
  const { method = 'GET', body, headers = {}, prefer } = opts;
  const tok = await auth.token();
  const h = Object.assign({ apikey: CFG.anon, Authorization: 'Bearer ' + tok }, headers);
  let payload = body;
  if (body !== undefined && !(body instanceof Blob)) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  if (prefer) h.Prefer = prefer;
  let r;
  try { r = await fetch(CFG.url + path, { method, headers: h, body: payload }); }
  catch (e) { throw new ApiError('network', 'network', 0); }
  if (r.status === 401 && !_retried) { await auth.refresh(); return api(path, opts, true); }
  const text = await r.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
  if (!r.ok) {
    const msg = (data && typeof data === 'object' && (data.message || data.reason || data.error_description || data.error || data.msg)) || (typeof data === 'string' && data) || ('HTTP ' + r.status);
    throw new ApiError(msg, data && data.code, r.status, data);
  }
  return { data, headers: r.headers, status: r.status };
}
const rpc = async (fn, args = {}) => (await api('/rest/v1/rpc/' + fn, { method: 'POST', body: args })).data;
const get = async (pathQuery) => (await api('/rest/v1/' + pathQuery)).data;
const qs = (pairs) => pairs.filter((p) => p && p[1] !== undefined && p[1] !== null && p[1] !== '').map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const pgQuote = (s) => '"' + String(s).replace(/["\\]/g, '') + '"';
function countFrom(headers) { const cr = headers.get('content-range') || ''; const n = parseInt(cr.split('/')[1], 10); return isNaN(n) ? null : n; }

/* ============================ UI helpers ============================ */
function toast(msg, type = 'ok', ms) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.innerHTML = (type === 'err' ? ic('alert', 16) : ic('check', 16)) + `<span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms || (type === 'err' ? 6000 : 2600));
}
const toastErr = (e) => {
  console.error(e);
  if (e && e.code === 'session') { auth.clear(); showLogin(humanError(e)); return; }
  toast(humanError(e), 'err');
};
function busy(btn, on) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (btn.classList.contains('icon') ? '' : `<span>${esc(btn.textContent.trim())}</span>`); }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}
async function copyText(t, label) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (x) { /* ignore */ } ta.remove(); }
  toast(label || 'کۆپی کرا');
}
function openLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${esc(src)}" alt="">`;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}

/* ----- modal stack ----- */
const modals = [];
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('.lightbox')) { $('.lightbox').remove(); return; }
  if (closeMenus()) return;
  if (modals.length) { modals[modals.length - 1].cancel(); e.preventDefault(); return; }
  if (Editor.isOpen()) { Editor.requestClose(); e.preventDefault(); }
});
function modal(o) {
  const root = document.createElement('div');
  root.className = 'modal';
  root.innerHTML = `<div class="m-scrim"></div>
    <div class="m-card ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="m-title-${modals.length}">
      <div class="m-head" id="m-title-${modals.length}">${esc(o.title)}</div>
      <div class="m-body">${o.html || (o.body ? `<p>${esc(o.body)}</p>` : '')}</div>
      <div class="m-err"><div class="hint bad" hidden></div></div>
      <div class="m-foot">
        ${o.onConfirm ? `<button class="btn ${o.danger ? 'danger-solid' : 'primary'}" data-ok type="button">${esc(o.confirmText || 'باشە')}</button>` : ''}
        <button class="btn" data-cancel type="button">${esc(o.cancelText || (o.onConfirm ? 'پاشگەزبوونەوە' : 'داخستن'))}</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const prev = document.activeElement;
  const errEl = $('.m-err .hint', root);
  const inst = {
    root,
    close() { const i = modals.indexOf(inst); if (i >= 0) modals.splice(i, 1); root.remove(); if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignore */ } } },
    cancel() { inst.close(); if (o.onCancel) o.onCancel(); },
    error(msg) { errEl.textContent = msg; errEl.hidden = !msg; },
  };
  modals.push(inst);
  $('.m-scrim', root).addEventListener('click', () => inst.cancel());
  $('[data-cancel]', root).addEventListener('click', () => inst.cancel());
  const ok = $('[data-ok]', root);
  if (ok) {
    ok.addEventListener('click', async () => {
      inst.error('');
      busy(ok, true);
      try { const r = await o.onConfirm(inst); if (r !== false) inst.close(); }
      catch (e) { console.error(e); inst.error(humanError(e)); }
      finally { if (root.isConnected) busy(ok, false); }
    });
  }
  if (o.onOpen) o.onOpen(inst);
  const first = $('[autofocus]', root) || $('input,textarea,select', $('.m-body', root)) || ok || $('[data-cancel]', root);
  if (first) setTimeout(() => first.focus(), 20);
  return inst;
}

/* ----- popup menu ----- */
function closeMenus() { const m = $$('.menu-pop'); m.forEach((x) => x.remove()); return m.length > 0; }
function menu(anchor, items) {
  closeMenus();
  const pop = document.createElement('div');
  pop.className = 'menu-pop';
  pop.setAttribute('role', 'menu');
  pop.innerHTML = items.map((it, i) => `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''} title="${esc(it.title || '')}">${ic(it.icon || 'more', 15)}<span>${esc(it.label)}</span></button>`).join('');
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, hgt = pop.offsetHeight;
  let left = r.right - w; if (left < 8) left = Math.min(r.left, window.innerWidth - w - 8);
  let top = r.bottom + 6; if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - 6);
  pop.style.left = Math.max(8, left) + 'px'; pop.style.top = top + 'px';
  pop.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (!b || b.disabled) return; closeMenus(); items[+b.dataset.i].onClick(); });
  setTimeout(() => { const f = $('button:not([disabled])', pop); if (f) f.focus(); }, 10);
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('.menu-pop') && !e.target.closest('[data-menu]')) closeMenus(); });

/* ----- combobox (searchable select) ----- */
function Combo(host, o) {
  let items = o.items || [];
  let cur = o.value ?? null;
  let shown = [], active = -1;
  const key = o.key || ((x) => x.id);
  const label = o.label;
  const sub = o.sub || (() => '');
  host.classList.add('combo');
  host.innerHTML = `<input class="input" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-autocomplete="list" ${o.id ? `id="${o.id}"` : ''} placeholder="${esc(o.placeholder || '')}">
    <button type="button" class="btn ghost xs icon c-clear" hidden aria-label="لابردن">${ic('x', 13)}</button>
    <div class="combo-pop" role="listbox" hidden></div>`;
  const input = $('input', host), pop = $('.combo-pop', host), clr = $('.c-clear', host);
  const find = (k) => items.find((x) => key(x) === k);
  function sync() { const it = cur != null ? find(cur) : null; input.value = it ? label(it) : ''; clr.hidden = !(o.clearable !== false && cur != null); }
  function render(q) {
    const nq = normTxt(q);
    shown = items.filter((it) => !nq || normTxt(label(it) + ' ' + sub(it) + ' ' + (o.extra ? o.extra(it) : '')).includes(nq)).slice(0, 250);
    active = shown.length ? 0 : -1;
    pop.innerHTML = shown.length
      ? shown.map((it, i) => `<div class="opt" role="option" data-i="${i}" aria-selected="${i === active}"><span>${esc(label(it))}</span><span class="os">${esc(sub(it) || '')}</span></div>`).join('')
      : `<div class="opt-empty">${esc(o.empty || 'هیچ ئەنجامێک نییە')}</div>`;
  }
  function open() { const it = cur != null ? find(cur) : null; render(it && input.value === label(it) ? '' : input.value); pop.hidden = false; input.setAttribute('aria-expanded', 'true'); }
  function close() { pop.hidden = true; input.setAttribute('aria-expanded', 'false'); sync(); }
  function pick(i) { const it = shown[i]; if (!it) return; cur = key(it); close(); if (o.onChange) o.onChange(cur, it); }
  function move(d) { if (!shown.length) return; active = (active + d + shown.length) % shown.length; $$('.opt', pop).forEach((c, i) => c.setAttribute('aria-selected', String(i === active))); const a = $$('.opt', pop)[active]; if (a) a.scrollIntoView({ block: 'nearest' }); }
  input.addEventListener('focus', () => { input.select(); open(); });
  input.addEventListener('click', () => { if (pop.hidden) open(); });
  input.addEventListener('input', () => { render(input.value); pop.hidden = false; input.setAttribute('aria-expanded', 'true'); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (pop.hidden) open(); else move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { if (!pop.hidden && active >= 0) { e.preventDefault(); pick(active); } }
    else if (e.key === 'Escape') { if (!pop.hidden) { e.stopPropagation(); e.preventDefault(); close(); } }
    else if (e.key === 'Tab') { close(); }
  });
  pop.addEventListener('mousedown', (e) => { const el = e.target.closest('.opt'); e.preventDefault(); if (el) pick(+el.dataset.i); });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) close(); }, 150));
  clr.addEventListener('click', () => { cur = null; sync(); if (o.onChange) o.onChange(null, null); input.focus(); });
  sync();
  return {
    get value() { return cur; },
    set(v) { cur = v ?? null; sync(); },
    setItems(arr) { items = arr || []; sync(); },
    focus() { input.focus(); },
    input,
  };
}
